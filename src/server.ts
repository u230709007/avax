// docs: docs/ui.md
import { securityReport } from "./service/securityReport.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { WebSocket } from "ws";
import type { Runtime } from "./runtime.js";
import type { LlmProvider } from "./llm/provider.js";
import { detokenize } from "./chat/detokenize.js";
import { sanitizeChatInput } from "./ingest/sanitize.js";
import { SNOWTRACE_FUJI } from "./chain/avalanche.js";
import { GUARDIAN_TOOLS } from "./tools.js";
import { ApiKeys, isPlan, PLANS } from "./service/keys.js";
import { verifyAccessToken, type AccountUser } from "./tenants/auth.js";
import { OKX_SITES, TenantError, type OkxSite, type TenantRegistry } from "./tenants/registry.js";

export interface ServerOptions {
  port: number;
  host?: string;
  uiToken: string;
  /** Kişisel hesaplar (e-posta girişi + kendi OKX anahtarı, docs/tenants.md). Yoksa sadece UI token. */
  tenants?: TenantRegistry;
  /** Servis kapısı açıksa: ajanların bağlanacağı MCP adresi ve herkese açık panel (docs/service.md). */
  service?: { mcpUrl: string; publicUrl: string };
}

/** İsteğin hangi Guardian'a gittiği: sahibin (UI token) veya giriş yapan kullanıcınınki (Supabase oturumu). */
interface Ctx {
  rt: Runtime;
  owner: boolean;
  channel: string;
}

declare module "fastify" {
  interface FastifyRequest {
    ctx?: Ctx;
    account?: AccountUser;
  }
}

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  return (req.query as { access_token?: string } | undefined)?.access_token;
}

function tokenOk(req: FastifyRequest, expected: string): boolean {
  const q = (req.query as { token?: string } | undefined)?.token;
  const got = (req.headers["x-ui-token"] as string | undefined) ?? q ?? "";
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Arayüz API'si + WebSocket. Varsayılan 127.0.0.1. Sahip UI token'la kendi Guardian'ına, e-postayla giriş yapan
 * kullanıcı (Supabase oturumu, sunucuda doğrulanır) kendi OKX anahtarıyla açılan Guardian'ına erişir.
 * Gerçek değerler (portföy) bu kanaldan sadece ilgili kullanıcıya gider, LLM'e gitmez.
 */
export async function startServer(owner: Runtime, opts: ServerOptions) {
  const fastify = Fastify({ logger: false });
  await fastify.register(websocket);
  fastify.get("/security-tests.json", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return securityReport(owner.app.guardian.policy.version);
  });

  // Her Guardian'ın kendi WS kanalı: bir kullanıcının olayları başka kullanıcıya gitmez.
  const channels = new Map<string, Set<WebSocket>>();
  const wire = (channel: string, rt: Runtime) => {
    const clients = new Set<WebSocket>();
    channels.set(channel, clients);
    const { app, chat } = rt;
    const broadcast = (type: string, data: unknown) => {
      if (channels.get(channel) !== clients) return;
      const msg = JSON.stringify({ type, data });
      for (const ws of clients) if (ws.readyState === 1) ws.send(msg);
    };
    app.audit.onAppend((row) => broadcast("audit", row));
    app.guardian.on("portfolio", (s) => broadcast("portfolio", s));
    app.guardian.on("chain", (s) => broadcast("chain", s));
    app.guardian.on("intent", (i) => broadcast("intent", i));
    app.approvals.on("created", (a) => broadcast("approval", a));
    app.approvals.on("updated", (a) => broadcast("approval_update", a));
    app.anchorer.onAnchored = (a) => broadcast("anchor", a);
    chat?.on("llm_traffic", (t) => broadcast("llm_traffic", t));
    chat?.on("assistant", (m: { text: string; mode: string; ts: number }) =>
      broadcast("assistant", { ...m, raw: m.text, display: detokenize(m.text, app.vault) }),
    );
    chat?.on("error", (e) => broadcast("agent_error", e));
  };
  const broadcastTo = (ctx: Ctx, type: string, data: unknown) => {
    const msg = JSON.stringify({ type, data });
    for (const ws of channels.get(ctx.channel) ?? []) if (ws.readyState === 1) ws.send(msg);
  };
  wire("owner", owner);
  const ownerCtx: Ctx = { rt: owner, owner: true, channel: "owner" };
  if (opts.tenants) {
    opts.tenants.onStart = (id, rt) => wire(`u:${id}`, rt);
    opts.tenants.onStop = (id) => {
      const set = channels.get(`u:${id}`);
      channels.delete(`u:${id}`);
      for (const ws of set ?? []) ws.close();
    };
  }

  fastify.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api") && !req.url.startsWith("/ws")) return;
    if (tokenOk(req, opts.uiToken)) {
      req.ctx = ownerCtx;
      return;
    }
    const t = bearer(req);
    const user = t && opts.tenants ? await verifyAccessToken(t) : null;
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    req.account = user;
    if (req.url.startsWith("/api/account")) return;
    try {
      req.ctx = { rt: await opts.tenants!.open(user.id), owner: false, channel: `u:${user.id}` };
    } catch (e) {
      if (e instanceof TenantError) return reply.code(409).send({ error: e.code });
      return reply.code(503).send({ error: "GUARDIAN_START_FAILED" });
    }
  });
  const c = (req: FastifyRequest): Ctx => req.ctx!;

  fastify.get("/ws", { websocket: true }, (socket, req) => {
    const set = channels.get(c(req).channel);
    if (!set) return socket.close();
    set.add(socket);
    socket.on("close", () => set.delete(socket));
  });

  // ───────────── Kişisel hesap: OKX demo anahtarını bağla / kaldır (sadece e-posta oturumuyla) ─────────────
  fastify.get("/api/account", async (req, reply) => {
    if (!req.account || !opts.tenants) return reply.code(404).send({ error: "not_account" });
    return { email: req.account.email, okx: opts.tenants.status(req.account.id), sites: OKX_SITES };
  });

  fastify.put("/api/account/okx", async (req, reply) => {
    if (!req.account || !opts.tenants) return reply.code(404).send({ error: "not_account" });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const field = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
    const creds = { apiKey: field("apiKey"), secretKey: field("secretKey"), passphrase: field("passphrase") };
    const site = (field("site") || "global") as OkxSite;
    if (!creds.apiKey || !creds.secretKey || !creds.passphrase || Object.values(creds).some((v) => v.length > 200)) return reply.code(400).send({ error: "CREDENTIALS_REQUIRED" });
    if (!OKX_SITES.includes(site)) return reply.code(400).send({ error: "BAD_SITE" });
    try {
      await opts.tenants.link(req.account, creds, site);
    } catch (e) {
      return reply.code(422).send({ error: e instanceof TenantError ? e.code : "OKX_LINK_FAILED", message: (e as Error).message.slice(0, 200) });
    }
    return { ok: true, okx: opts.tenants.status(req.account.id) };
  });

  fastify.delete("/api/account/okx", async (req, reply) => {
    if (!req.account || !opts.tenants) return reply.code(404).send({ error: "not_account" });
    await opts.tenants.unlink(req.account.id);
    return { ok: true };
  });

  fastify.get("/api/status", async (req) => {
    const { rt, owner: isOwner } = c(req);
    const { app, chat, autonomous } = rt;
    const chain = await app.chain.state();
    return {
      role: isOwner ? "owner" : "account",
      account: req.account ? { email: req.account.email } : null,
      okx: { connected: app.atk.isConnected(), demo: true, error: app.atkError, missingTools: app.atk.isConnected() ? app.atk.missingTools() : [] },
      chain: { ...chain, policyRegistry: app.chain.policyRegistry, auditAnchor: isOwner ? app.chain.auditAnchor : undefined, intentGate: app.chain.intentGate, explorer: SNOWTRACE_FUJI },
      anchorer: { lastError: app.anchorer.lastError, enabled: !app.anchorer.disabled },
      chatEnabled: Boolean(chat),
      agent: chat?.label ?? null,
      llm: chat?.providers() ?? [],
      autonomous: { enabled: autonomous.get(), intervalSeconds: autonomous.intervalSeconds },
      tools: GUARDIAN_TOOLS.map((t) => t.name),
    };
  });

  fastify.get("/api/policy", async (req) => {
    const { app } = c(req).rt;
    return { policy: app.guardian.policy, localHash: app.policyHash, chain: await app.chain.state() };
  });

  fastify.get("/api/portfolio", async (req, reply) => {
    const { app } = c(req).rt;
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
      const bills = await c(req).rt.app.guardian.bills();
      return bills.filter((b) => b.ccy === ccy).map((b) => ({ ts: Number(b.ts), bal: Number(b.bal), change: Number(b.balChg) })).sort((a, b) => a.ts - b.ts);
    } catch (e) {
      return reply.code(503).send({ error: (e as { code?: string }).code ?? "ATK_UNAVAILABLE" });
    }
  });

  fastify.get("/api/decisions", async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return c(req).rt.app.audit.recent(Math.min(Number(q.limit ?? 50), 500), Number(q.offset ?? 0));
  });

  fastify.get("/api/decisions/:seq", async (req, reply) => {
    const { app } = c(req).rt;
    const seq = Number((req.params as { seq: string }).seq);
    const row = app.audit.get(seq);
    if (!row) return reply.code(404).send({ error: "not_found" });
    const anchor = app.anchorer.forSeq(seq);
    const proof = anchor ? app.audit.proofFor(seq, anchor.fromSeq, anchor.toSeq) : undefined;
    return { row, anchor, proof };
  });

  /** Kaydın Merkle kanıtını zincirdeki kökle karşılaştırır. */
  fastify.get("/api/verify/:seq", async (req, reply) => {
    const res = await c(req).rt.app.anchorer.verify(Number((req.params as { seq: string }).seq));
    return "error" in res ? reply.code(404).send(res) : res;
  });

  fastify.get("/api/anchors", async (req) => c(req).rt.app.anchorer.list());
  fastify.post("/api/anchors/flush", async (req) => {
    const { app } = c(req).rt;
    await app.anchorer.tick(true);
    return { lastError: app.anchorer.disabled ? "Kişisel hesaplarda audit kökü zincire yazılmaz (yerel hash zinciri)." : (app.anchorer.lastError ?? null) };
  });

  fastify.get("/api/approvals", async (req) => c(req).rt.app.approvals.pending());
  fastify.post("/api/approvals/:id/approve", async (req) => c(req).rt.app.guardian.approve((req.params as { id: string }).id));
  fastify.post("/api/approvals/:id/reject", async (req) => c(req).rt.app.guardian.rejectApproval((req.params as { id: string }).id));

  fastify.post("/api/chat", async (req, reply) => {
    const { app, chat } = c(req).rt;
    if (!chat) return reply.code(404).send({ error: "chat_disabled" });
    const text = String((req.body as { text?: string } | undefined)?.text ?? "").slice(0, 4000);
    if (!text.trim()) return reply.code(400).send({ error: "empty" });
    if (chat.isBusy()) return reply.code(409).send({ error: "busy" });
    // Yapıştırılan içerik de güvenilmez: kodlanmış talimat varsa mesaj ajana hiç gitmez.
    const input = sanitizeChatInput(text);
    if (input.blocked) {
      app.audit.append({ source: "human", tool: "chat", input: { length: text.length }, outcome: "REJECTED", code: "CHAT_INPUT_BLOCKED", detail: { flags: input.flags, decoded: input.decoded } });
      return reply.code(422).send({ error: "CHAT_INPUT_BLOCKED", flags: input.flags });
    }
    if (input.flags.length) {
      app.audit.append({ source: "human", tool: "chat", input: { length: text.length }, outcome: "WARNING", code: input.flags.join(","), detail: { decoded: input.decoded } });
    }
    try {
      const raw = await chat.chat(input.text);
      return { raw, display: detokenize(raw, app.vault) };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message.slice(0, 300) });
    }
  });

  fastify.post("/api/chat/reset", async (req) => {
    c(req).rt.chat?.resetHistory();
    return { ok: true };
  });

  /** Sağ üst model seçici: Groq varsayılan; anahtarı olan Gemini/Claude'a geçilebilir. Kurallar değişmez. */
  fastify.post("/api/settings/llm", async (req, reply) => {
    const ctx = c(req);
    const chat = ctx.rt.chat;
    if (!chat) return reply.code(404).send({ error: "chat_disabled" });
    const p = String((req.body as { provider?: string } | undefined)?.provider ?? "") as LlmProvider;
    if (!chat.providers().some((x) => x.id === p && x.available)) return reply.code(400).send({ error: "provider_unavailable" });
    try {
      await chat.use(p);
    } catch (e) {
      return reply.code(409).send({ error: (e as Error).message.slice(0, 200) });
    }
    const out = { agent: chat.label, llm: chat.providers() };
    broadcastTo(ctx, "llm", out);
    return out;
  });

  fastify.post("/api/settings/autonomous", async (req) => {
    const { autonomous } = c(req).rt;
    autonomous.set(Boolean((req.body as { enabled?: boolean } | undefined)?.enabled));
    return { enabled: autonomous.get() };
  });

  /** Demo için: zamanlayıcıyı beklemeden tek otonom tur. Sonuç ayrıca WS "assistant" olayıyla gelir. */
  fastify.post("/api/autonomous/tick", async (req, reply) => {
    const { app, chat, autonomous } = c(req).rt;
    if (!chat) return reply.code(404).send({ error: "autonomous_unavailable" });
    try {
      const raw = await autonomous.runNow();
      if (raw === undefined) return reply.code(409).send({ error: "busy" });
      return { raw, display: detokenize(raw, app.vault) };
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message.slice(0, 300) });
    }
  });

  // ───────────── MCP bağlantısı: ajan anahtarları (sadece sahip, token'lı arayüzden) ─────────────
  // Servis kapısı (7072) sahibin Guardian'ına bağlıdır; kişisel hesaplara MCP anahtarı henüz verilmez.
  const keys = new ApiKeys(owner.app.store);
  const keyRows = () => keys.list().map((k) => ({ ...k, usage24h: keys.usage(k.id) }));
  const ownerOnly = (req: FastifyRequest) => c(req).owner;

  fastify.get("/api/service", async (req, reply) => {
    if (!ownerOnly(req)) return reply.code(403).send({ error: "owner_only" });
    return {
      enabled: Boolean(opts.service),
      mcpUrl: opts.service?.mcpUrl ?? null,
      publicUrl: opts.service?.publicUrl ?? null,
      tools: GUARDIAN_TOOLS.map((t) => t.name),
      plans: PLANS,
      keys: keyRows(),
    };
  });

  /** Anahtar sadece bu yanıtta bir kez döner; veritabanında sha256'sı tutulur. */
  fastify.post("/api/service/keys", async (req, reply) => {
    if (!ownerOnly(req)) return reply.code(403).send({ error: "owner_only" });
    const body = (req.body ?? {}) as { name?: string; plan?: string };
    const name = String(body.name ?? "").trim().slice(0, 80);
    const plan = String(body.plan ?? "sandbox");
    if (!name) return reply.code(400).send({ error: "name_required" });
    if (!isPlan(plan)) return reply.code(400).send({ error: "bad_plan" });
    const created = keys.create(name, plan);
    owner.app.audit.append({ source: "human", tool: "service_key", input: { id: created.id, name, plan }, outcome: "OK", code: "KEY_CREATED" });
    return created;
  });

  fastify.post("/api/service/keys/:id/revoke", async (req, reply) => {
    if (!ownerOnly(req)) return reply.code(403).send({ error: "owner_only" });
    const id = (req.params as { id: string }).id;
    if (!keys.revoke(id)) return reply.code(404).send({ error: "not_found" });
    owner.app.audit.append({ source: "human", tool: "service_key", input: { id }, outcome: "OK", code: "KEY_REVOKED" });
    return { ok: true };
  });

  const webDist = resolve("web/dist");
  if (existsSync(webDist)) {
    await fastify.register(fastifyStatic, { root: webDist });
    fastify.setNotFoundHandler((req, reply) => (req.url.startsWith("/api") ? reply.code(404).send() : reply.sendFile("index.html")));
  }

  await fastify.listen({ host: opts.host ?? "127.0.0.1", port: opts.port });
  return fastify;
}
