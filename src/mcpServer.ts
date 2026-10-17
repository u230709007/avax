// docs: docs/ARCHITECTURE.md
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Guardian } from "./guardian.js";
import { GUARDIAN_TOOLS } from "./tools.js";

/** Uzak servis modunda (docs/service.md) çağrı başına kota ve sayaç. Yerel modlarda yok. */
export interface ToolMeter {
  /** Çağrıdan önce: ret kodu dönerse tool çalışmaz. */
  before(tool: string): string | undefined;
  after(tool: string, status: string): void;
}

const text = (v: unknown) => [{ type: "text" as const, text: JSON.stringify(v) }];

/** Kullanıcının gerçek değerleri gördüğü yerel panel (token'lı arayüz). */
export const ownerPanelUrl = () => process.env.OWNER_PANEL_URL ?? `http://127.0.0.1:${process.env.GUARDIAN_PORT ?? 7070}`;

/**
 * Etiketlerin ({{BAL:…}}) ekranda doldurulmadığı istemciler (uzak MCP, Claude Desktop/Code stdio) için talimat:
 * ajan etiketi rakam gibi sunmaz, kullanıcıyı gerçek değerler için yerel panele yönlendirir. Değerler LLM'e hiç gitmez.
 */
function ownerPanelInstructions(url: string): string {
  return [
    "Balances, PnL and position values are masked by design: tags such as {{BAL:TOTAL}}, {{BAL:USDT}}, {{POS:…}} and {{PNL}} cannot be resolved by you and are not shown to the user as numbers in this client.",
    "Never present a tag as if it were a value. Describe buckets (DÜŞÜK/ORTA/YÜKSEK), share percentages, sides and profit/loss direction instead.",
    `When the user needs real amounts, tell them to open their local Guardian panel at ${url} (Genel bakış). Trades that return PENDING_APPROVAL can only be approved there.`,
    "Reply in the user's language.",
  ].join(" ");
}

/**
 * Guardian MCP sunucusu: LLM'in bağlandığı tek uç. Argümanlar ham haliyle guardian'a geçer
 * (MCP katmanında atılmaz), böylece kötü niyetli her istek audit'e düşer.
 * `ownerPanel` verilirse (etiketleri doldurmayan istemciler) sunucu talimatı ajanı gerçek değerler için panele yönlendirir.
 */
export function createGuardianMcpServer(guardian: Guardian, meter?: ToolMeter, opts: { ownerPanel?: string } = {}): Server {
  const server = new Server(
    { name: "sealed-intent-guardian", version: "0.1.0" },
    { capabilities: { tools: {} }, ...(opts.ownerPanel ? { instructions: ownerPanelInstructions(opts.ownerPanel) } : {}) },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: GUARDIAN_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = GUARDIAN_TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      meter?.after(req.params.name, "TOOL_NOT_ALLOWED");
      return { isError: true, content: text({ status: "REJECTED", code: "TOOL_NOT_ALLOWED" }) };
    }
    const quota = meter?.before(tool.name);
    if (quota) return { isError: true, content: text({ status: "REJECTED", code: quota }) };
    try {
      const result = await tool.run(guardian, req.params.arguments ?? {});
      meter?.after(tool.name, String(result.status ?? "OK"));
      return { content: text(result) };
    } catch (e) {
      const code = (e as { code?: string }).code ?? "GUARDIAN_ERROR";
      meter?.after(tool.name, "ERROR");
      return { isError: true, content: text({ status: "ERROR", code }) };
    }
  });

  return server;
}
