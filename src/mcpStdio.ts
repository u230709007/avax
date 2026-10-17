// docs: docs/runbook.md
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrap } from "./bootstrap.js";
import { createGuardianMcpServer, ownerPanelUrl } from "./mcpServer.js";
import { startServer } from "./server.js";
import { startRuntime } from "./runtime.js";
import { atkCompatFor, createAtkCompatServer } from "./compat/atkProxy.js";

/**
 * (B) modu: Claude Desktop / Claude Code bu süreci MCP sunucusu olarak başlatır.
 * stdout MCP protokolüne ayrılmıştır; loglar stderr'e gider.
 * Aynı süreçte gerçek değer paneli (sohbetsiz arayüz) 127.0.0.1'de açılır.
 * `--atk`: guardian'ın 7 tool'u yerine ATK uyumlu kapı (okx-trade-mcp ile aynı tool adları, docs/compat.md).
 */
async function main() {
  const app = await bootstrap();
  // Sohbetsiz çalışma zamanı: ajan Claude Desktop/Code'dur; panel sadece gerçek değerler ve onaylar içindir.
  const rt = await startRuntime(app, { chat: false });
  const uiToken = process.env.UI_TOKEN;
  if (uiToken && uiToken.length >= 16) {
    const port = Number(process.env.GUARDIAN_PORT ?? 7070);
    await startServer(rt, { port, uiToken }).catch((e) => console.error(`Panel açılamadı: ${(e as Error).message}`));
  }
  if (process.argv.includes("--atk")) {
    if (!app.guardian.policy.compat.enabled) throw new Error("policy.compat.enabled=false: ATK uyumlu kapı kapalı");
    const compat = atkCompatFor(app);
    await createAtkCompatServer(compat).connect(new StdioServerTransport());
    return;
  }
  await createGuardianMcpServer(app.guardian, undefined, { ownerPanel: ownerPanelUrl() }).connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
