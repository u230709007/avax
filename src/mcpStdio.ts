// docs: docs/runbook.md
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrap } from "./bootstrap.js";
import { createGuardianMcpServer } from "./mcpServer.js";
import { startServer } from "./server.js";

/**
 * (B) modu: Claude Desktop / Claude Code bu süreci MCP sunucusu olarak başlatır.
 * stdout MCP protokolüne ayrılmıştır; loglar stderr'e gider.
 * Aynı süreçte gerçek değer paneli (sohbetsiz arayüz) 127.0.0.1'de açılır.
 */
async function main() {
  const app = await bootstrap();
  app.anchorer.start();
  const uiToken = process.env.UI_TOKEN;
  if (uiToken && uiToken.length >= 16) {
    const port = Number(process.env.GUARDIAN_PORT ?? 7070);
    await startServer(app, { port, uiToken }).catch((e) => console.error(`Panel açılamadı: ${(e as Error).message}`));
  }
  await createGuardianMcpServer(app.guardian).connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
