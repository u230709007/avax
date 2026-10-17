import { describe, expect, it } from "vitest";
import { evaluate } from "../../src/policy/engine.js";
import type { TradeContext } from "../../src/policy/rules.js";
import { TradeIntentSchema } from "../../src/policy/intent.js";
import { policy } from "./helpers.js";

function ctx(over: Partial<TradeContext> & { intent?: Record<string, unknown> } = {}): TradeContext {
  const intent = TradeIntentSchema.parse({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 2, ...over.intent });
  return {
    instId: "AVAX-USDT",
    refPrice: 19.6,
    notionalUsdt: 20,
    totalEquityUsdt: 1243.5,
    volume24hUsdt: 0,
    ordersLastMinute: 0,
    dailyPnlPct: 0,
    chain: { reachable: true, policyHashMatches: true, paused: false },
    ...over,
    intent,
  };
}

describe("Policy engine", () => {
  it("küçük spot alımına izin verir", () => {
    const v = evaluate(ctx(), policy);
    expect(v.allowed).toBe(true);
    expect(v.needsHumanApproval).toBe(false);
  });

  it("eşik üstü işlem insan onayı ister", () => {
    expect(evaluate(ctx({ notionalUsdt: 32 }), policy).needsHumanApproval).toBe(true);
  });

  it.each([
    ["kaldıraç 125x", { intent: { market: "swap", leverage: 125, sl_pct: 3 } }, "LEVERAGE_EXCEEDED"],
    ["spot'ta kaldıraç", { intent: { leverage: 2 } }, "LEVERAGE_EXCEEDED"],
    ["işlem başı limit", { notionalUsdt: 900 }, "SIZE_EXCEEDED"],
    ["bakiye yüzdesi", { notionalUsdt: 45, totalEquityUsdt: 100 }, "SIZE_EXCEEDED"],
    ["24s limit bölme", { volume24hUsdt: 290, notionalUsdt: 20 }, "VOLUME_LIMIT"],
    ["rate limit", { ordersLastMinute: 2 }, "RATE_LIMIT"],
    ["swap SL'siz", { intent: { market: "swap", leverage: 2 } }, "SL_REQUIRED"],
    ["SL çok geniş", { intent: { sl_pct: 20 } }, "SL_TOO_WIDE"],
    ["günlük zarar", { dailyPnlPct: -6 }, "DAILY_LOSS_LIMIT"],
    ["PnL bilinmiyor", { dailyPnlPct: undefined }, "STATE_UNAVAILABLE"],
    ["zincir okunamıyor", { chain: { reachable: false, policyHashMatches: false, paused: true } }, "CHAIN_UNREACHABLE"],
    ["policy hash uyuşmaz", { chain: { reachable: true, policyHashMatches: false, paused: false } }, "POLICY_HASH_MISMATCH"],
    ["zincirden durduruldu", { chain: { reachable: true, policyHashMatches: true, paused: true } }, "PAUSED_ONCHAIN"],
    ["allowlist dışı", { instId: undefined }, "INSTRUMENT_NOT_ALLOWED"],
    ["fiyat yok", { refPrice: undefined }, "PRICE_UNAVAILABLE"],
  ])("%s → reddedilir", (_name, over, code) => {
    const v = evaluate(ctx(over as never), policy);
    expect(v.allowed).toBe(false);
    expect(v.code).toBe(code);
  });

  it("intent şeması fazladan alanı ve transfer benzeri girdiyi reddeder", () => {
    expect(TradeIntentSchema.safeParse({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1, to: "0xabc" }).success).toBe(false);
    expect(TradeIntentSchema.safeParse({ pair: "P_AVAX", market: "withdraw", side: "buy", size_pct: 1 }).success).toBe(false);
    expect(TradeIntentSchema.safeParse({ pair: "AVAX-USDT", market: "spot", side: "buy", size_pct: 1 }).success).toBe(false);
  });

  it("policy nesnesi değiştirilemez", () => {
    expect(() => {
      (policy as { maxLeverage: number }).maxLeverage = 125;
    }).toThrow();
  });
});
