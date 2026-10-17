// docs: docs/ARCHITECTURE.md
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Guardian } from "./guardian.js";
import { GUARDIAN_TOOLS } from "./tools.js";

/**
 * Guardian MCP sunucusu: LLM'in bağlandığı tek uç. Argümanlar ham haliyle guardian'a geçer
 * (MCP katmanında atılmaz), böylece kötü niyetli her istek audit'e düşer.
 */
export function createGuardianMcpServer(guardian: Guardian): Server {
  const server = new Server({ name: "sealed-intent-guardian", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: GUARDIAN_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = GUARDIAN_TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "REJECTED", code: "TOOL_NOT_ALLOWED" }) }] };
    }
    try {
      const result = await tool.run(guardian, req.params.arguments ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "GUARDIAN_ERROR";
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "ERROR", code }) }] };
    }
  });

  return server;
}
