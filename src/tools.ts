// docs: docs/atk-integration.md
import type { Guardian, ToolResult } from "./guardian.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  run: (g: Guardian, args: unknown) => Promise<ToolResult>;
}

const EMPTY = { type: "object" as const, properties: {}, additionalProperties: false as const };

/**
 * LLM'in görebildiği TEK yüzey: 7 dar tool. ATK'nın 150+ tool'u (transfer, earn, withdraw…) burada yok.
 * Şema LLM'e yol gösterir; asıl doğrulama guardian'dadır.
 */
export const GUARDIAN_TOOLS: readonly ToolDef[] = Object.freeze([
  {
    name: "get_market_view",
    description: "Allowlist'teki çiftler için fiyat, 24s değişim, 15 dk RSI14/EMA20/EMA50 ve trend.",
    inputSchema: EMPTY,
    run: (g) => g.getMarketView(),
  },
  {
    name: "get_portfolio_view",
    description:
      "Maskeli portföy: bakiye kovaları (DÜŞÜK/ORTA/YÜKSEK), varlık payları, maskeli pozisyon ID'leri, limitler. Kullanıcıya rakam gösterirken 'display' etiketini aynen yaz.",
    inputSchema: EMPTY,
    run: (g) => g.getPortfolioView(),
  },
  {
    name: "get_news_digest",
    description: "OKX haberlerinin karantinadan geçmiş şemalı özeti (coin, sentiment, score, flags). Ham haber metni verilmez.",
    inputSchema: EMPTY,
    run: (g) => g.getNewsDigest(),
  },
  {
    name: "read_url",
    description: "İzinli bir web sayfasını karantinadan geçirip şemalı özet döner. Ham sayfa metni verilmez.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "http(s) URL" } },
      required: ["url"],
      additionalProperties: false,
    },
    run: (g, a) => g.readUrl(a),
  },
  {
    name: "propose_trade",
    description:
      "İşlem önerisi. Guardian kuralları (limit, kaldıraç, SL, zincir durumu) kontrol eder; emri guardian üretir. Sonuç ALLOWED, REJECTED veya PENDING_APPROVAL olabilir.",
    inputSchema: {
      type: "object",
      properties: {
        pair: { type: "string", description: "Maskeli çift tanıtıcısı, örn. P_AVAX" },
        market: { type: "string", enum: ["spot", "swap"] },
        side: { type: "string", enum: ["buy", "sell"] },
        size_pct: { type: "number", description: "İlgili bakiyenin yüzdesi (0-100]" },
        leverage: { type: "integer", description: "Sadece swap; varsayılan 1" },
        sl_pct: { type: "number", description: "Stop-loss, giriş fiyatından % uzaklık" },
        tp_pct: { type: "number", description: "Take-profit, giriş fiyatından % uzaklık" },
        rationale: { type: "string", description: "Kısa gerekçe (en fazla 400 karakter)" },
      },
      required: ["pair", "market", "side", "size_pct"],
      additionalProperties: false,
    },
    run: (g, a) => g.proposeTrade(a),
  },
  {
    name: "close_position",
    description: "Maskeli pozisyon ID'si ile pozisyonu kapatır (kill-switch açıkken de izinli).",
    inputSchema: {
      type: "object",
      properties: { pos_id: { type: "string", description: "örn. POS_1a2b3c4d" } },
      required: ["pos_id"],
      additionalProperties: false,
    },
    run: (g, a) => g.closePosition(a),
  },
  {
    name: "cancel_order",
    description: "Maskeli emir ID'si ile açık emri iptal eder.",
    inputSchema: {
      type: "object",
      properties: { ord_id: { type: "string", description: "örn. ORD_1a2b3c4d" } },
      required: ["ord_id"],
      additionalProperties: false,
    },
    run: (g, a) => g.cancelOrder(a),
  },
]);
