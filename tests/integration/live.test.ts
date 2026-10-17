/**
 * Gerçek sistemlere karşı entegrasyon testleri (mock yok):
 *  - OKX Demo (ATK, ~/.okx/config.toml demo profil)
 *  - Avalanche Fuji (POLICY_REGISTRY_ADDRESS)
 *  - LLM: aktif sağlayıcı (varsayılan Groq; GROQ_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY)
 * Gerekli ortam yoksa ilgili blok atlanır. Çalıştırma: npm run test:integration
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrap, type App } from "../../src/bootstrap.js";
import { quarantineDigest } from "../../src/llm/quarantine.js";
import { sanitize } from "../../src/ingest/sanitize.js";
import { SwitchingHost } from "../../src/chat/switch.js";
import { llmProvider } from "../../src/llm/provider.js";
import { createGuardianMcpServer } from "../../src/mcpServer.js";

const hasEnv = Boolean(process.env.VAULT_HMAC_KEY);
const hasLlm = Boolean(llmProvider());
const hasChain = Boolean(process.env.POLICY_REGISTRY_ADDRESS);

let app: App;

describe.skipIf(!hasEnv)("canlı sistem", () => {
  beforeAll(async () => {
    process.env.DB_PATH = process.env.DB_PATH_INTEGRATION ?? "data/integration.db";
    app = await bootstrap();
  });
  afterAll(async () => {
    await app?.atk.close();
  });

  it("ATK demo modunda bağlanır ve gereken tüm tool'lar mevcut", () => {
    expect(app.atkError).toBeUndefined();
    expect(app.atk.missingTools()).toEqual([]);
  });

  it("OKX demo hesabından gerçek bakiye okunur; LLM görünümünde gerçek sayı yoktur", async () => {
    const snap = await app.guardian.snapshot(true);
    expect(snap.totalEqUsd).toBeGreaterThanOrEqual(0);
    const view = JSON.stringify(await app.guardian.getPortfolioView());
    // Kısa tam sayılar ("1") yüzde gibi başka alanlarda doğal olarak geçer; ayırt edici değerler aranır.
    for (const h of snap.holdings) for (const v of [h.eq, h.eqUsd]) if (String(v).length >= 4) expect(view).not.toContain(String(v));
  });

  it("piyasa görünümü gerçek fiyat ve göstergeler döner", async () => {
    const v = (await app.guardian.getMarketView()) as { pairs: { pair: string; price?: number }[] };
    expect(v.pairs.find((p) => p.pair === "P_AVAX")?.price).toBeGreaterThan(0);
  });

  it.skipIf(!hasChain)("Fuji PolicyRegistry okunur ve hash eşleşir", async () => {
    const s = await app.chain.state(true);
    expect(s.reachable).toBe(true);
    expect(s.policyHashMatches).toBe(true);
  });

  it("Bankrbot senaryosu gerçek bağlamda reddedilir", async () => {
    const r = await app.guardian.proposeTrade({ pair: "P_AVAX", market: "swap", side: "buy", size_pct: 100, leverage: 125, sl_pct: 3 });
    expect(r.status).toBe("REJECTED");
  });

  it.skipIf(!hasLlm)("Karantina modeli Mors sayfasını şemalı özete indirger", async () => {
    const s = sanitize(readFileSync("attack-site/pages/morse.html", "utf8"), { isHtml: true });
    const items = await quarantineDigest(s.text, s.flags);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(Object.keys(it).sort()).toEqual(["coin", "flags", "score", "sentiment"]);
      expect(it.flags).toContain("MORSE");
    }
  });

  it.skipIf(!hasLlm)("Karar ajanı bakiye sorusunda gösterim etiketi yazar; LLM trafiğinde gerçek bakiye geçmez", async () => {
    const host = new SwitchingHost(() => createGuardianMcpServer(app.guardian));
    await host.connect();
    const traffic: string[] = [];
    host.on("llm_traffic", (t: { payload: unknown }) => traffic.push(JSON.stringify(t.payload)));
    const text = await host.chat("Bakiyem ne kadar? Sadece USDT bakiyesini söyle.");
    expect(text).toMatch(/\{\{BAL:/);
    const snap = await app.guardian.snapshot();
    const usdt = snap.holdings.find((h) => h.ccy === "USDT");
    if (usdt && usdt.eq > 0) for (const t of traffic) expect(t).not.toContain(String(usdt.eq));
  });
});
