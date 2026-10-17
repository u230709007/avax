// docs: docs/runbook.md
/** Running server only: never opens a second audit writer. --trade submits ONE demo order. */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const owner = `http://127.0.0.1:${process.env.GUARDIAN_PORT ?? 7070}`;
const service = `http://127.0.0.1:${process.env.PUBLIC_PORT ?? 7072}`;
const trade = process.argv.includes("--trade");
const checks: { name: string; passed: boolean; detail?: unknown }[] = [];
const check = (name: string, passed: boolean, detail?: unknown) => checks.push({ name, passed, detail });
async function api(path: string, body?: unknown) {
  const r = await fetch(owner + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-ui-token": process.env.UI_TOKEN ?? "", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Owner API ${r.status}`);
  return r.json();
}
let keyId: string | undefined;
let client: Client | undefined;
try {
  const status = await api("/api/status");
  check("OKX demo transport", status.okx?.connected === true && status.okx?.demo === true && !status.okx?.error);
  check("Fuji policy active", status.chain?.reachable === true && status.chain?.policyHashMatches === true && status.chain?.paused === false);
  check("Agent available", status.chatEnabled === true);
  const summaryResponse = await fetch(service + "/public/api/summary", { signal: AbortSignal.timeout(20_000) });
  if (!summaryResponse.ok) throw new Error("Public summary unavailable");
  const summary = await summaryResponse.json();
  check("Audit integrity", summary.audit?.chainIntact === true);
  check("IntentGate configured", Boolean(summary.chain?.contracts?.intentGate));
  const start = Date.now();
  const key = await api("/api/service/keys", { name: "demo-check temporary", plan: "sandbox" });
  keyId = key.id;
  client = new Client({ name: "guardian-demo-check", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(service + "/atk"), { requestInit: { headers: { Authorization: `Bearer ${key.key}` } } }));
  const listed = await client.listTools();
  check("External MCP connection", listed.tools.some(t => t.name === "spot_place_order"), { connectionMs: Date.now() - start, toolCount: listed.tools.length });
  check("No transfer capability", !listed.tools.some(t => /transfer|withdraw/.test(t.name)));
  const market = await client.callTool({ name: "market_get_ticker", arguments: { instId: "AVAX-USDT" } });
  const content = market.content as { type: string; text?: string }[];
  const payload = JSON.parse(content.find(x => x.type === "text")?.text ?? "{}");
  check("Live AVAX market", !market.isError && Number(payload.data?.data?.[0]?.last) > 0);
  if (trade) {
    if (checks.some(c => !c.passed)) throw new Error("Preflight failed; order not submitted");
    const result = await client.callTool({ name: "spot_place_order", arguments: { instId: "AVAX-USDT", tdMode: "cash", side: "buy", ordType: "market", sz: "5", tgtCcy: "quote_ccy" } });
    const blocks = result.content as { type: string; text?: string }[];
    const response = JSON.parse(blocks.find(x => x.type === "text")?.text ?? "{}");
    const g = response.guardian;
    check("Demo order accepted (not fill confirmation)", g?.status === "ALLOWED", { status: g?.status ?? "UNKNOWN", code: g?.code ?? response.error?.code ?? null, intent: g?.onchain_intent ?? null });
  }
} catch {
  // Never publish raw API payloads, credentials or account amounts.
  check("Run completed", false, "Dependency or preflight failure; inspect local server logs.");
} finally {
  await client?.close().catch(() => undefined);
  if (keyId) {
    try { const r = await api(`/api/service/keys/${keyId}/revoke`, {}); check("Temporary key revoked", r.ok === true); }
    catch { check("Temporary key revoked", false, "Revoke demo-check temporary key in MCP settings."); }
  }
}
const report = { ts: Date.now(), mode: trade ? "single-demo-order" : "read-only-market", checks, limitations: ["Order acceptance is not execution/fill confirmation", "Does not certify security or product-market fit", "Local MCP client test, not an OKX.AI listing"] };
mkdirSync("data", { recursive: true });
writeFileSync("data/demo-check.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = checks.every(c => c.passed) ? 0 : 1;
