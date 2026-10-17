// docs: docs/service.md
import { securityReport } from "./securityReport.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { App } from "../bootstrap.js";
import { createGuardianMcpServer, ownerPanelUrl } from "../mcpServer.js";
import { GUARDIAN_TOOLS } from "../tools.js";
import { SNOWTRACE_FUJI } from "../chain/avalanche.js";
import { ApiKeys, PLANS } from "./keys.js";
import { atkCompatFor, createAtkCompatServer } from "../compat/atkProxy.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ToolMeter } from "../mcpServer.js";

export interface GatewayOptions {
  host: string;
  port: number;
}

/** data/ altındaki ölçüm dosyaları (attack-replay, kill-switch gecikmesi) — gerçek koşulardan üretilir, yoksa null. */
function readJson(path: string): unknown {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  } catch {
    return null;
  }
}

/**
 * Dışa açılabilen tek kapı (docs/service.md):
 * - POST /mcp: guardian'ın 7 tool'u uzak MCP servisi olarak (Streamable HTTP, Bearer API anahtarı, plan kotası).
 * - POST /atk: ATK uyumlu kapı — okx-trade-mcp tool adları/şemaları, aynı anahtar ve kota (docs/compat.md).
 * - GET /public/api/*: jürinin/herkesin görebileceği salt okunur kanıt verisi. Gerçek bakiye, emir parametresi, LLM metni yok.
 * - GET /: herkese açık kanıt paneli (web/public.html).
 * Token'lı yönetim API'si (server.ts) burada YOK; onay ve kill-switch sadece yerel arayüzde.
 */
export async function startGateway(app: App, opts: GatewayOptions) {
  const keys = new ApiKeys(app.store);
  const fastify = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  fastify.get("/security-tests.json", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    return securityReport(app.guardian.policy.version);
  });

  // ───────────────────────── MCP servisi ─────────────────────────

  const unauthorized = (reply: FastifyReply) =>
    reply
      .code(401)
      .header("www-authenticate", 'Bearer realm="sealed-intent-guardian"')
      .send({ jsonrpc: "2.0", error: { code: -32001, message: "unauthorized: Authorization: Bearer <API anahtarı>" }, id: null });

  /** Durumsuz MCP ucu: her istek kendi Server + transport örneğini alır (LEARN L-014). */
  const mcpRoute = (makeServer: (meter: ToolMeter) => Server) => async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.headers.authorization;
    const key = keys.authenticate(auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined);
    if (!key) return unauthorized(reply);
    const server = makeServer({
      before: (tool) => keys.quotaError(key, tool),
      after: (tool, status) => keys.record(key.id, tool, status),
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  };

  // Uzak istemci etiketleri dolduramaz: gerçek değerler için ajan kullanıcıyı yerel panele yönlendirir.
  fastify.post("/mcp", mcpRoute((meter) => createGuardianMcpServer(app.guardian, meter, { ownerPanel: ownerPanelUrl() })));

  // ATK uyumlu kapı (docs/compat.md): okx-trade-mcp için yazılmış ajan sadece URL'yi değiştirir.
  const compat = app.guardian.policy.compat.enabled ? atkCompatFor(app) : undefined;
  if (compat) fastify.post("/atk", mcpRoute((meter) => createAtkCompatServer(compat, meter)));

  const methodNotAllowed = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header("allow", "POST").send({ jsonrpc: "2.0", error: { code: -32000, message: "stateless server: POST only" }, id: null });
  for (const path of ["/mcp", "/atk"]) {
    fastify.get(path, methodNotAllowed);
    fastify.delete(path, methodNotAllowed);
  }

  /** Servis kartı: OKX.AI gibi kataloglar için ad, tool'lar, planlar, zincir kanıtı. */
  fastify.get("/mcp/info", async () => ({
    name: "Sealed Intent Guardian",
    description:
      "Prompt-injection'a dayanıklı trade guardian'ı. Ajanınız OKX'e doğrudan değil bu MCP servisine bağlanır: maskeli veri, 7 dar tool, deterministik kurallar, her emir öncesi Avalanche'ta zincir kaydı.",
    transport: "streamable-http",
    endpoint: "/mcp",
    auth: "Authorization: Bearer <API anahtarı>",
    tools: GUARDIAN_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    atkCompatible: compat
      ? {
          endpoint: "/atk",
          description: "okx-trade-mcp ile aynı tool adları ve şemaları; emirler guardian kurallarından geçer, transfer/çekim yok.",
          tools: compat.tools().map((t) => t.name),
        }
      : null,
    plans: PLANS,
    proof: {
      network: "Avalanche Fuji C-Chain (43113)",
      policyRegistry: app.chain.policyRegistry ?? null,
      auditAnchor: app.chain.auditAnchor ?? null,
      intentGate: app.chain.intentGate ?? null,
      explorer: SNOWTRACE_FUJI,
    },
  }));

  // ───────────────────────── salt okunur kanıt API'si ─────────────────────────

  fastify.get("/public/api/summary", async () => {
    const chain = await app.chain.state();
    const db = app.store.db;
    const outcomes = db.prepare("SELECT outcome, COUNT(*) AS n FROM audit GROUP BY outcome").all() as { outcome: string; n: number }[];
    const rejects = db
      .prepare("SELECT code, COUNT(*) AS n FROM audit WHERE outcome = 'REJECTED' AND code IS NOT NULL GROUP BY code ORDER BY n DESC LIMIT 10")
      .all() as { code: string; n: number }[];
    const intents = app.store.recentIntents(10);
    const ms = intents.map((i) => i.commitMs).sort((a, b) => a - b);
    return {
      chain: {
        network: "Avalanche Fuji C-Chain (43113)",
        reachable: chain.reachable,
        policyHashMatches: chain.policyHashMatches,
        paused: chain.paused,
        onchainVersion: chain.onchainVersion ?? null,
        onchainHash: chain.onchainHash ?? null,
        localHash: chain.localHash,
        policyVersion: app.guardian.policy.version,
        contracts: { policyRegistry: app.chain.policyRegistry ?? null, auditAnchor: app.chain.auditAnchor ?? null, intentGate: app.chain.intentGate ?? null },
        explorer: SNOWTRACE_FUJI,
      },
      audit: { lastSeq: app.audit.lastSeq(), chainIntact: app.audit.verifyChain().ok, outcomes, rejects },
      anchors: app.anchorer.list().slice(0, 10),
      intents,
      intentFinalityMs: ms.length ? { median: ms[Math.floor(ms.length / 2)]!, min: ms[0]!, max: ms.at(-1)!, n: ms.length } : null,
      attackReplay: readJson("data/attack-replay.json"),
      killSwitch: readJson("data/killswitch-latency.json"),
      service: { endpoint: "/mcp", atkEndpoint: compat ? "/atk" : null, tools: GUARDIAN_TOOLS.map((t) => t.name), plans: PLANS },
    };
  });

  /** Kararlar: sadece seq, zaman, tool, sonuç, kod ve hash. Girdi/detay (emir parametreleri, özetler) verilmez. */
  fastify.get("/public/api/decisions", async (req) => {
    const limit = Math.min(Math.max(Number((req.query as { limit?: string }).limit ?? 30) || 30, 1), 200);
    return app.store.db
      .prepare("SELECT seq, ts, source, tool, outcome, code, hash FROM audit WHERE tool NOT IN ('agent_note') ORDER BY seq DESC LIMIT ?")
      .all(limit);
  });

  fastify.get("/public/api/verify/:seq", async (req, reply) => {
    const seq = Number((req.params as { seq: string }).seq);
    if (!Number.isInteger(seq) || seq < 1) return reply.code(400).send({ error: "bad_seq" });
    const res = await app.anchorer.verify(seq);
    return "error" in res ? reply.code(404).send(res) : res;
  });

  // ───────────────────────── herkese açık panel ─────────────────────────

  const webDist = resolve("web/dist");
  if (existsSync(resolve(webDist, "public.html"))) {
    await fastify.register(fastifyStatic, { root: webDist, index: false, serve: true });
    // Özel arayüz (index.html) bu kapıdan verilmez.
    fastify.addHook("onRequest", async (req, reply) => {
      if (req.url === "/index.html") return reply.code(404).send();
    });
    fastify.get("/", (_req, reply) => reply.sendFile("public.html"));
  }

  await fastify.listen({ host: opts.host, port: opts.port });
  return fastify;
}
