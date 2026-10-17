import { describe, expect, it } from "vitest";
import { makeGuardian } from "./helpers.js";
import { MALICIOUS_INTENTS, MORSE_LONG_125X } from "../fixtures/attacks.js";
import { BALANCE } from "../fixtures/okx.js";
import { detokenize } from "../../src/chat/detokenize.js";
import { neutralizeFlagged } from "../../src/guardian.js";
import { IntentCommitError } from "../../src/chain/avalanche.js";

/** LLM'e giden JSON içinde gerçek bakiye/ID değerlerinden herhangi biri var mı? */
function containsRealValues(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  const secrets = ["1243.5", "1000.25", "12.4", "243.25", "612345678901234567"];
  return secrets.filter((s) => text.includes(s));
}

describe("Guardian — maskeleme (gelen yön)", () => {
  it("portföy görünümü gerçek bakiye içermez, sadece kova ve etiket içerir", async () => {
    const { guardian } = makeGuardian();
    const view = await guardian.getPortfolioView();
    expect(containsRealValues(view)).toEqual([]);
    expect(view.total).toEqual({ bucket: "YÜKSEK", display: "{{BAL:TOTAL}}" });
    expect(JSON.stringify(view)).toContain("{{BAL:USDT}}");
  });

  it("gösterim etiketleri sadece ekranda gerçek değere çevrilir", async () => {
    const { guardian, vault } = makeGuardian();
    await guardian.getPortfolioView();
    const llmText = "USDT bakiyen {{BAL:USDT}}, toplam {{BAL:TOTAL}}. {{SECRET:X}}";
    const screen = detokenize(llmText, vault);
    expect(screen).toContain("1.000,25 USDT");
    expect(screen).toContain("1.243,50 USD");
    expect(screen).toContain("[gizli]");
    expect(llmText).toContain("{{BAL:USDT}}"); // LLM tarafındaki metin değişmez
  });
});

describe("Guardian — kural kontrolü (giden yön)", () => {
  it("Bankrbot: 125x tüm bakiye → LEVERAGE_EXCEEDED, ATK'ya hiçbir şey gitmez", async () => {
    const { guardian, placed } = makeGuardian();
    const r = await guardian.proposeTrade(MALICIOUS_INTENTS.bankrbot);
    expect(r.status).toBe("REJECTED");
    expect(r.code).toBe("LEVERAGE_EXCEEDED");
    expect(placed).toHaveLength(0);
  });

  it.each([
    ["unknownPair", "MASKING_VIOLATION"],
    ["rawAddress", "MASKING_VIOLATION"],
    ["displayTag", "MASKING_VIOLATION"],
    ["extraField", "SCHEMA_INVALID"],
    ["swapWithoutSl", "SL_REQUIRED"],
    ["hugeSpot", "SIZE_EXCEEDED"],
  ] as const)("%s → %s", async (key, code) => {
    const { guardian, placed } = makeGuardian();
    const r = await guardian.proposeTrade(MALICIOUS_INTENTS[key]);
    expect(r.code).toBe(code);
    expect(placed).toHaveLength(0);
  });

  it("maskeleme ihlalinde ham girdi audit'e de yazılmaz", async () => {
    const { guardian, audit } = makeGuardian();
    await guardian.proposeTrade(MALICIOUS_INTENTS.rawAddress);
    const row = audit.recent(1)[0]!;
    expect(row.code).toBe("MASKING_VIOLATION");
    expect(JSON.stringify(row.input)).not.toContain("0x3333");
  });

  it("zincirden durdurulmuşsa işlem açılmaz", async () => {
    const { guardian, placed } = makeGuardian({ chain: { paused: true } });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("PAUSED_ONCHAIN");
    expect(placed).toHaveLength(0);
  });

  it("geçerli küçük AVAX alımı: emri guardian üretir, LLM'e maskeli ID döner", async () => {
    const { guardian, placed, audit } = makeGuardian();
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1, sl_pct: 3, tp_pct: 6 });
    expect(r.status).toBe("ALLOWED");
    expect(r.ord_id).toMatch(/^ORD_[0-9a-f]{8}$/);
    expect(containsRealValues(r)).toEqual([]);
    expect(placed).toHaveLength(1);
    const p = placed[0]!.params;
    expect(p).toMatchObject({ instId: "AVAX-USDT", tdMode: "cash", side: "buy", ordType: "ioc", slOrdPx: "-1", tpOrdPx: "-1" });
    // %1 * 1000.25 USDT ≈ 10 USDT, fiyat bandı +%0.5
    expect(Number(p.px)).toBeCloseTo(19.62 * 1.005, 2);
    expect(Number(p.sz) * Number(p.px)).toBeLessThanOrEqual(10.0025 + 1e-6);
    expect(Number(p.slTriggerPx)).toBeCloseTo(19.62 * 0.97, 2);
    expect(audit.recent(1)[0]!.outcome).toBe("ALLOWED");
  });

  it("eşik üstü işlem onay bekler; LLM onaylayamaz, sadece insan onaylar", async () => {
    const { guardian, placed } = makeGuardian();
    // %3 * 1000.25 ≈ 30 USDT > 25 USDT eşik
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 3 });
    expect(r.status).toBe("PENDING_APPROVAL");
    expect(placed).toHaveLength(0);
    const done = await guardian.approve(r.approval_id as string);
    expect(done.status).toBe("ALLOWED");
    expect(placed).toHaveLength(1);
    expect((await guardian.approve(r.approval_id as string)).code).toBe("APPROVAL_NOT_PENDING");
  });

  it("24s limit restart sonrası da geçerli (SQLite)", async () => {
    const { guardian, store } = makeGuardian();
    store.recordFill(Date.now() - 3600_000, "AVAX-USDT", 295);
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("VOLUME_LIMIT");
  });

  it("günlük zarar limitinde işlem açılmaz", async () => {
    const { guardian } = makeGuardian({ dayStartEq: BALANCE.totalEqUsd / 0.9 });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("DAILY_LOSS_LIMIT");
  });

  it("bilinmeyen pos_id ile kapatma reddedilir", async () => {
    const { guardian } = makeGuardian();
    expect((await guardian.closePosition({ pos_id: "POS_deadbeef" })).code).toBe("MASKING_VIOLATION");
  });

  it("read_url allowlist dışı hostu reddeder", async () => {
    const { guardian } = makeGuardian();
    expect((await guardian.readUrl({ url: "https://evil.example/page" })).code).toBe("HOST_NOT_ALLOWED");
  });
});

describe("Guardian — taint (güvenilmeyen içerik sonrası işlem)", () => {
  const cleanPage = (async () => new Response("<p>AVAX news</p>", { headers: { "content-type": "text/html" } })) as typeof fetch;

  // Hafif dalgalı yükseliş: EMA20 > EMA50, RSI aşırı alımın altında.
  const uptrend = Array.from({ length: 100 }, (_, i) => 18 + i * 0.01 + (i % 2 ? 0.05 : -0.05));

  it("read_url sonrası küçük işlem bile onaya düşer, ATK'ya emir gitmez", async () => {
    const { guardian, placed } = makeGuardian({ fetchImpl: cleanPage, closes: uptrend });
    await guardian.readUrl({ url: "http://localhost/news" });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.status).toBe("PENDING_APPROVAL");
    expect(r.reasons).toEqual(["UNTRUSTED_CONTENT"]);
    expect(placed).toHaveLength(0);
  });

  it("read_url sonrası piyasa verisine ters yön reddedilir (asimetrik etki)", async () => {
    const { guardian, placed } = makeGuardian({ fetchImpl: cleanPage, closes: uptrend });
    await guardian.readUrl({ url: "http://localhost/news" });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "sell", size_pct: 1 });
    expect(r.code).toBe("SIGNAL_NOT_CONFIRMED");
    expect(placed).toHaveLength(0);
  });

  it("read_url sonrası gösterge alınamazsa fail-closed", async () => {
    const { guardian } = makeGuardian({ fetchImpl: cleanPage });
    await guardian.readUrl({ url: "http://localhost/news" });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("SIGNAL_NOT_CONFIRMED");
  });

  it("taint penceresi dolunca normal akışa döner", async () => {
    const { guardian, store, placed } = makeGuardian({ fetchImpl: cleanPage });
    await guardian.readUrl({ url: "http://localhost/news" });
    store.setKv("untrusted:last", JSON.stringify({ ts: Date.now() - 3_600_000, source: "read_url", flagged: true }));
    store.setKv("untrusted:strict", JSON.stringify({ ts: Date.now() - 3_600_000, source: "read_url" }));
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.status).toBe("ALLOWED");
    expect(placed).toHaveLength(1);
  });

  const cleanNews = [{ title: "AVAX ağı güncellemesi", summary: "Avalanche yeni sürüm yayınladı." }];

  it("temiz OKX haberi sonrası: onay yok ama yön piyasa verisiyle doğrulanır (otonom tur)", async () => {
    const { guardian, placed } = makeGuardian({ news: cleanNews, closes: uptrend });
    await guardian.getNewsDigest();
    const buy = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(buy.status).toBe("ALLOWED");
    expect(placed).toHaveLength(1);
    const sell = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "sell", size_pct: 1 });
    expect(sell.code).toBe("SIGNAL_NOT_CONFIRMED");
  });

  it("bayraklı haber (karantina talimat buldu) sonrası işlem onaya düşer", async () => {
    const { guardian, placed } = makeGuardian({
      news: cleanNews,
      closes: uptrend,
      quarantine: async () => [{ coin: "AVAX", sentiment: "positive", score: 0.9, flags: ["INSTRUCTION"] }],
    });
    await guardian.getNewsDigest();
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.status).toBe("PENDING_APPROVAL");
    expect(placed).toHaveLength(0);
  });

  it("web sayfasından sonra gelen temiz haber onay gereksinimini silemez", async () => {
    const { guardian, placed } = makeGuardian({ fetchImpl: cleanPage, news: cleanNews, closes: uptrend });
    await guardian.readUrl({ url: "http://localhost/news" });
    await guardian.getNewsDigest();
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.status).toBe("PENDING_APPROVAL");
    expect(placed).toHaveLength(0);
  });
});

describe("Guardian — Avalanche IntentGate (emir öncesi zincir kaydı)", () => {
  it("emir, niyet hash'i zincirde kesinleştikten sonra gider; clOrdId hash'e bağlı", async () => {
    const { guardian, placed, commits, store } = makeGuardian();
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.status).toBe("ALLOWED");
    expect(commits).toHaveLength(1);
    expect(placed[0]!.params.clOrdId).toBe(`g${commits[0]!.slice(2, 33)}`);
    expect(r.onchain_intent).toMatchObject({ finality_ms: 1200 });
    expect(store.recentIntents()).toHaveLength(1);
  });

  it("IntentGate kill-switch ile reddederse emir OKX'e gitmez", async () => {
    const { guardian, placed } = makeGuardian({ commitError: new IntentCommitError("PAUSED_ONCHAIN", "durduruldu") });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("PAUSED_ONCHAIN");
    expect(placed).toHaveLength(0);
  });

  it("zincir yazılamazsa fail-closed", async () => {
    const { guardian, placed } = makeGuardian({ commitError: new Error("rpc timeout") });
    const r = await guardian.proposeTrade({ pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 });
    expect(r.code).toBe("INTENT_COMMIT_FAILED");
    expect(placed).toHaveLength(0);
  });
});

describe("Guardian — içerik maskeleme (bayraklı öğe nötrlenir)", () => {
  it("bayrağı olan öğenin duygusu nötr/0 olur, temiz öğe aynen kalır", () => {
    const out = neutralizeFlagged([
      { coin: "AVAX", sentiment: "positive", score: 0.99, flags: ["MORSE"] },
      { coin: "BTC", sentiment: "negative", score: 0.7, flags: [] },
    ]);
    expect(out[0]).toMatchObject({ coin: "AVAX", sentiment: "neutral", score: 0, flags: ["MORSE"] });
    expect(out[1]).toMatchObject({ coin: "BTC", sentiment: "negative", score: 0.7 });
  });

  it("kandırılmış karantina modelinin sahte 'positive 0.99' çıktısı read_url'den geçmez", async () => {
    const page = `<p>AVAX update</p><p>${MORSE_LONG_125X}</p>`;
    const { guardian, audit } = makeGuardian({
      fetchImpl: (async () => new Response(page, { headers: { "content-type": "text/html" } })) as typeof fetch,
      quarantine: async (_t, flags) => [{ coin: "AVAX", sentiment: "positive", score: 0.99, flags }],
    });
    const r = await guardian.readUrl({ url: "http://localhost/attack" });
    expect(r.items).toEqual([expect.objectContaining({ sentiment: "neutral", score: 0 })]);
    const row = audit.recent(1, 0)[0]!;
    expect(row.outcome).toBe("WARNING");
    expect(JSON.stringify(row.detail)).toContain("0.99");
  });
});
