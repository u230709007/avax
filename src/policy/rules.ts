// docs: docs/policy.md
import type { Policy } from "../config/policy.js";
import type { TradeIntent } from "./intent.js";

export type RejectCode =
  | "SCHEMA_INVALID"
  | "MASKING_VIOLATION"
  | "INSTRUMENT_NOT_ALLOWED"
  | "INSUFFICIENT_BALANCE"
  | "PRICE_UNAVAILABLE"
  | "SIZE_EXCEEDED"
  | "VOLUME_LIMIT"
  | "RATE_LIMIT"
  | "LEVERAGE_EXCEEDED"
  | "SL_REQUIRED"
  | "SL_TOO_WIDE"
  | "TP_TOO_WIDE"
  | "DAILY_LOSS_LIMIT"
  | "CHAIN_UNREACHABLE"
  | "POLICY_HASH_MISMATCH"
  | "PAUSED_ONCHAIN"
  | "STATE_UNAVAILABLE";

export interface ChainState {
  reachable: boolean;
  policyHashMatches: boolean;
  paused: boolean;
}

/** Kural motorunun ihtiyaç duyduğu, maskesi çözülmüş gerçek bağlam. LLM'e asla gitmez. */
export interface TradeContext {
  intent: TradeIntent;
  instId: string | undefined;
  refPrice: number | undefined;
  /** İşlemin USDT karşılığı (swap'ta kaldıraçlı nominal). */
  notionalUsdt: number;
  totalEquityUsdt: number;
  volume24hUsdt: number;
  ordersLastMinute: number;
  dailyPnlPct: number | undefined;
  chain: ChainState;
}

export interface RuleResult {
  rule: string;
  ok: boolean;
  code?: RejectCode;
  detail?: string;
}

type Rule = (ctx: TradeContext, p: Policy) => RuleResult;

const pass = (rule: string, detail?: string): RuleResult => ({ rule, ok: true, detail });
const fail = (rule: string, code: RejectCode, detail: string): RuleResult => ({ rule, ok: false, code, detail });

/** Sıra önemli: önce zincir, sonra LLM girdisine bağlı statik kurallar, en son canlı veriye bağlı kurallar.
 * Böylece veri alınamasa bile saldırı kendi koduyla (örn. LEVERAGE_EXCEEDED) reddedilir. */
export const RULES: readonly Rule[] = Object.freeze([
  (ctx, p) =>
    !ctx.chain.reachable
      ? fail("chain.reachable", "CHAIN_UNREACHABLE", "Avalanche PolicyRegistry okunamadı (fail-closed)")
      : !ctx.chain.policyHashMatches
        ? fail("chain.policyHash", "POLICY_HASH_MISMATCH", "Yerel policy.json hash'i zincirdekiyle eşleşmiyor")
        : ctx.chain.paused
          ? fail("chain.paused", "PAUSED_ONCHAIN", "PolicyRegistry.paused = true")
          : pass("chain", `policy v${p.version} zincirle eşleşti`),
  (ctx) =>
    ctx.instId ? pass("instrument", ctx.instId) : fail("instrument", "INSTRUMENT_NOT_ALLOWED", `${ctx.intent.pair} allowlist'te yok`),
  (ctx, p) =>
    ctx.intent.leverage <= (ctx.intent.market === "spot" ? 1 : p.maxLeverage)
      ? pass("leverage", `${ctx.intent.leverage}x`)
      : fail(
          "leverage",
          "LEVERAGE_EXCEEDED",
          `${ctx.intent.leverage}x > ${ctx.intent.market === "spot" ? 1 : p.maxLeverage}x`,
        ),
  (ctx, p) => {
    const required = p.requireStopLoss[ctx.intent.market];
    if (ctx.intent.sl_pct === undefined)
      return required ? fail("stopLoss", "SL_REQUIRED", `${ctx.intent.market} için SL zorunlu`) : pass("stopLoss", "yok");
    return ctx.intent.sl_pct <= p.maxStopLossPct
      ? pass("stopLoss", `%${ctx.intent.sl_pct}`)
      : fail("stopLoss", "SL_TOO_WIDE", `SL %${ctx.intent.sl_pct} > %${p.maxStopLossPct}`);
  },
  (ctx, p) =>
    ctx.intent.tp_pct === undefined || ctx.intent.tp_pct <= p.maxTakeProfitPct
      ? pass("takeProfit")
      : fail("takeProfit", "TP_TOO_WIDE", `TP %${ctx.intent.tp_pct} > %${p.maxTakeProfitPct}`),
  (ctx) =>
    ctx.refPrice && ctx.refPrice > 0
      ? pass("price", `ref ${ctx.refPrice}`)
      : fail("price", "PRICE_UNAVAILABLE", "Referans fiyat alınamadı"),
  (ctx) =>
    ctx.notionalUsdt > 0 ? pass("balance") : fail("balance", "INSUFFICIENT_BALANCE", "Kullanılabilir bakiye yok"),
  (ctx, p) =>
    ctx.notionalUsdt <= p.maxOrderUsdt
      ? pass("maxOrderUsdt", `${ctx.notionalUsdt.toFixed(2)} ≤ ${p.maxOrderUsdt}`)
      : fail("maxOrderUsdt", "SIZE_EXCEEDED", `${ctx.notionalUsdt.toFixed(2)} USDT > ${p.maxOrderUsdt} USDT`),
  (ctx, p) => {
    const pct = ctx.totalEquityUsdt > 0 ? (ctx.notionalUsdt / ctx.totalEquityUsdt) * 100 : Infinity;
    return pct <= p.maxOrderPctOfBalance
      ? pass("maxOrderPct", `%${pct.toFixed(1)}`)
      : fail("maxOrderPct", "SIZE_EXCEEDED", `bakiyenin %${pct.toFixed(1)}'i > %${p.maxOrderPctOfBalance}`);
  },
  (ctx, p) =>
    ctx.volume24hUsdt + ctx.notionalUsdt <= p.rolling24hMaxUsdt
      ? pass("volume24h", `${(ctx.volume24hUsdt + ctx.notionalUsdt).toFixed(2)} ≤ ${p.rolling24hMaxUsdt}`)
      : fail(
          "volume24h",
          "VOLUME_LIMIT",
          `24s toplam ${(ctx.volume24hUsdt + ctx.notionalUsdt).toFixed(2)} USDT > ${p.rolling24hMaxUsdt}`,
        ),
  (ctx, p) =>
    ctx.ordersLastMinute < p.maxOrdersPerMinute
      ? pass("rateLimit")
      : fail("rateLimit", "RATE_LIMIT", `son 1 dk'da ${ctx.ordersLastMinute} emir`),
  (ctx, p) =>
    ctx.dailyPnlPct === undefined
      ? fail("dailyLoss", "STATE_UNAVAILABLE", "Günlük PnL hesaplanamadı (fail-closed)")
      : ctx.dailyPnlPct > -p.dailyLossLimitPct
        ? pass("dailyLoss", `%${ctx.dailyPnlPct.toFixed(2)}`)
        : fail("dailyLoss", "DAILY_LOSS_LIMIT", `günlük PnL %${ctx.dailyPnlPct.toFixed(2)} ≤ -%${p.dailyLossLimitPct}`),
]);
