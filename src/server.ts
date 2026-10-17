// docs: docs/ui.md
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { WebSocket } from "ws";
import type { App } from "./bootstrap.js";
import type { SwitchingHost } from "./chat/switch.js";
import type { LlmProvider } from "./llm/provider.js";
import { detokenize } from "./chat/detokenize.js";
import { AuditLog } from "./audit/log.js";
import { SNOWTRACE_FUJI } from "./chain/avalanche.js";
import { GUARDIAN_TOOLS } from "./tools.js";

export interface ServerOptions {
  port: number;
  uiToken: string;
  chat?: SwitchingHost;
  autonomous?: { get(): boolean; set(v: boolean): void; intervalSeconds: number };
}

function tokenOk(req: FastifyRequest, expected: string): boolean {
  const q = (req.query as { token?: string } | undefined)?.token;
  const got = (req.headers["x-ui-token"] as string | undefined) ?? q ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Arayüz API'si + WebSocket. Sadece 127.0.0.1'e bağlanır ve yerel token ister.
 * Gerçek değerler (portföy) bu kanaldan sadece kullanıcıya gider, LLM'e gitmez.
 */
export async function startServer(app: App, opts: ServerOptions) {
  const fastify = Fastify({ logger: false });
  await fastify.register(websocket);

  const clients = new Set<WebSocket>();
  const broadcast = (type: string, data: unknown) => {
    const msg = JSON.stringify({ type, data });
    for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
  };

  app.audit.onAppend((row) => broadcast("audit", row));
  app.guardian.on("portfolio", (s) => broadcast("portfolio", s));
  app.guardian.on("chain", (s) => broadcast("chain", s));
  app.approvals.on("created", (a) => broadcast("approval", a));
  app.approvals.on("updated", (a) => broadcast("approval_update", a));
  app.anchorer.onAnchored = (a) => broadcast("anchor", a);
  opts.chat?.on("llm_traffic", (t) => broadcast("llm_traffic", t));
  opts.chat?.on("assistant", (m: { text: string; mode: string; ts: number }) =>
    broadcast("assistant", { ...m, raw: m.text, display: detokenize(m.text, app.vault) }),
  );
  opts.chat?.on("error", (e) => broadcast("agent_error", e));

  fastify.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api") && !req.url.startsWith("/ws")) return;
    if (!tokenOk(req, opts.uiToken)) return reply.code(401).send({ error: "unauthorized" });
  });

  fastify.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
  });

  fastify.get("/api/status", async () => {
    const chain = await app.chain.state();
    return {
      okx: { connected: app.atk.isConnected(), demo: true, error: app.atkError, missingTools: app.atk.isConnected() ? app.atk.missingTools() : [] },
      chain: { ...chain, policyRegistry: app.chain.policyRegistry, auditAnchor: app.chain.auditAnchor, explorer: SNOWTRACE_FUJI },
      anchorer: { lastError: app.anchorer.lastError },
      chatEnabled: Boolean(opts.chat),
      agent: opts.chat?.label ?? null,
      llm: opts.chat?.providers() ?? [],
      autonomous: opts.autonomous ? { enabled: opts.autonomous.get(), intervalSeconds: opts.autonomous.intervalSeconds } : null,
      tools: GUARDIAN_TOOLS.map((t) => t.name),
    };
  });

  fastify.get("/api/policy", async () => ({ policy: app.guardian.policy, localHash: app.policyHash, chain: await app.chain.state() }));

  fastify.get("/api/portfolio", async (_req, reply) => {
    try {
      const snap = await app.guardian.snapshot();
      const volume24h = app.store.volumeSince(Date.now() - 86_400_000);
      return { snapshot: snap, volume24h, limit24h: app.guardian.policy.rolling24hMaxUsdt };
    } catch (e) {
      return reply.code(503).send({ error: (e as { code?: string }).code ?? "ATK_UNAVAILABLE" });
    }
  });

  /** Grafik için gerçek bakiye geçmişi (OKX account bills, son 7 gün). */
  fastify.get("/api/bills", async (req, reply) => {
    const ccy = String((req.query as { ccy?: string }).ccy ?? "USDT");
    try {
      const bills = await app.guardian.bills();
      return bills.filter((b) => b.ccy === ccy).map((b) => ({ ts: Number(b.ts), bal: Number(b.bal), change: Number(b.balChg) })).sort((a, b) => a.ts - b.ts);
    } catch (e) {
      return reply.code(503).send({ error: (e as { code?: string }).code ?? "ATK_UNAVAILABLE" });
    }
  });

  fastify.get("/api/decisions", async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return app.audit.recent(Math.min(Number(q.limit ?? 50), 500), Number(q.offset ?? 0));
  });

  fastify.get("/api/decisions/:seq", async (req, reply) => {
    const seq = Number((req.params as { seq: string }).seq);
    const row = app.audit.get(seq);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const anchor = app.anchorer.forSeq(seq);
    const proof = anchor ? app.audit.proofFor(seq, anchor.fromSeq, anchor.toSeq) : undefined;
    return { row, anchor, proof };
  });

  /** Kaydın Merkle kanıtını zincirdeki kökle karşılaştırır. */
  fastify.get("/api/verify/:seq", async (req, reply) => {
    const seq = Number((req.params as { seq: string }).seq);
    const anchor = app.anchorer.forSeq(seq);
    if (!anchor) return reply.code(404).send({ error: "not_anchored_yet" });
    const local = app.audit.proofFor(seq, anchor.fromSeq, anchor.toSeq);
    const count = await app.chain.anchorCount();
    for (let i = count - 1; i >= 0; i--) {
      const onchain = await app.chain.readAnchor(i);
      if (onchain.fromSeq <= seq && seq <= onchain.toSeq) {
        return {
          seq,
          onchainRoot: onchain.root,
          localRoot: local.root,
          verified: AuditLog.verify(local.leaf, local.proof, onchain.root),
          chainIntact: app.audit.verifyChain().ok,
          txHash: anchor.txHash,
        };
      }
    }
    return reply.code(404).send({ error: "anchor_not_found_onchain" });
  });

  fastify.get("/api/anchors", async () => app.anchorer.list());
  fastify.post("/api/anchors/flush", async () => {
    await app.anchorer.tick(true);
    return { lastError: app.anchorer.lastError ?? null };
  });

  fastify.get("/api/approvals", async () => app.approvals.pending());
  fastify.post("/api/approvals/:id/approve", async (req) => app.guardian.approve((req.params as { id: string }).id));
  fastify.post("/api/approvals/:id/reject", async (req) => app.guardian.rejectApproval((req.params as { id: string }).id));

  fastify.post("/api/chat", async (req, reply) => {
    if (!opts.chat) return reply.code(404).send({ error: "chat_disabled" });
    const text = String((req.body as { text?: string } | undefined)?.text ?? "").slice(0, 4000);
    if (!text.trim()) return reply.code(400).send({ error: "empty" });
    if (opts.chat.isBusy()) return reply.code(409).send({ error: "busy" });
    try {
      const raw = await opts.chat.chat(text);
      return { raw, display: detokenize(raw, app.vault) };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message.slice(0, 300) });
    }
  });

  fastify.post("/api/chat/reset", async () => {
    opts.chat?.resetHistory();
    return { ok: true };
  });

  /** Sağ üst model seçici: Groq varsayılan; anahtarı olan Gemini/Claude'a geçilebilir. Kurallar değişmez. */
  fastify.post("/api/settings/llm", async (req, reply) => {
    if (!opts.chat) return reply.code(404).send({ error: "chat_disabled" });
    const p = String((req.body as { provider?: string } | undefined)?.provider ?? "") as LlmProvider;
    if (!opts.chat.providers().some((x) => x.id === p && x.available)) return reply.code(400).send({ error: "provider_unavailable" });
    try {
      await opts.chat.use(p);
    } catch (e) {
      return reply.code(409).send({ error: (e as Error).message.slice(0, 200) });
    }
    const out = { agent: opts.chat.label, llm: opts.chat.providers() };
    broadcast("llm", out);
    return out;
  });

  fastify.post("/api/settings/autonomous", async (req, reply) => {
    if (!opts.autonomous) return reply.code(404).send({ error: "autonomous_unavailable" });
    opts.autonomous.set(Boolean((req.body as { enabled?: boolean } | undefined)?.enabled));
    return { enabled: opts.autonomous.get() };
  });

  const webDist = resolve("web/dist");
  if (existsSync(webDist)) {
    await fastify.register(fastifyStatic, { root: webDist });
    fastify.setNotFoundHandler((req, reply) => (req.url.startsWith("/api") ? reply.code(404).send() : reply.sendFile("index.html")));
  }

  await fastify.listen({ host: "127.0.0.1", port: opts.port });
  return fastify;
}
