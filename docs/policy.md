# Policy — kural motoru

## Amaç
LLM'in her işlem önerisini deterministik kurallardan geçirmek. Kod kandırılamaz.

## Dosyalar
`policy.json` (hash'lenen tek kaynak), `src/config/policy.ts` (Zod şema + deepFreeze + keccak hash),
`src/policy/intent.ts` (LLM'in intent dili), `src/policy/rules.ts` (kurallar), `src/policy/engine.ts` (karar).

## Akış
Intent: `{ pair: P_*, market: spot|swap, side: buy|sell, size_pct: (0,100], leverage?: 1..125, sl_pct?, tp_pct?, rationale? }` — `.strict()`, fazladan alan → `SCHEMA_INVALID`.

Kurallar (sırayla; ilk başarısız olan kodu verir, hepsi raporlanır):
| # | Kural | Kod |
|---|---|---|
| 1 | Zincir okunabildi / policy hash eşleşti / paused değil | `CHAIN_UNREACHABLE`, `POLICY_HASH_MISMATCH`, `PAUSED_ONCHAIN` |
| 2 | Çift allowlist'te | `INSTRUMENT_NOT_ALLOWED` |
| 3 | Kaldıraç: spot 1x, swap ≤ `maxLeverage` (3) | `LEVERAGE_EXCEEDED` |
| 4 | SL: swap'ta zorunlu, ≤ `maxStopLossPct` (5) | `SL_REQUIRED`, `SL_TOO_WIDE` |
| 5 | TP ≤ `maxTakeProfitPct` | `TP_TOO_WIDE` |
| 6 | Referans fiyat var | `PRICE_UNAVAILABLE` |
| 7 | Bakiye var | `INSUFFICIENT_BALANCE` |
| 8 | İşlem ≤ `maxOrderUsdt` (50) | `SIZE_EXCEEDED` |
| 9 | İşlem ≤ toplam değerin %`maxOrderPctOfBalance` (20) | `SIZE_EXCEEDED` |
| 10 | Kayan 24s hacim ≤ `rolling24hMaxUsdt` (300) | `VOLUME_LIMIT` |
| 11 | Dakikada < `maxOrdersPerMinute` (2) | `RATE_LIMIT` |
| 12 | Günlük PnL > −%`dailyLossLimitPct` (5); bilinmiyorsa ret | `DAILY_LOSS_LIMIT`, `STATE_UNAVAILABLE` |
| 13 | Taint varken yön piyasa verisiyle doğrulanır: alım için EMA20 > EMA50 ve RSI14 < `rsiOverbought`; satım için EMA20 < EMA50 ve RSI14 > `rsiOversold` (15m); gösterge yoksa ret | `SIGNAL_NOT_CONFIRMED` |

Onay (`PENDING_APPROVAL`, `reasons`): tutar > `humanApprovalAboveUsdt` (25) → `SIZE`; sıkı taint varken (`untrusted.approvalFor`) → `UNTRUSTED_CONTENT` (tutar ne olursa olsun).

**Taint:** `read_url` veya `get_news_digest` çalışınca guardian `store` kv'ye (`untrusted:last`) zaman yazar; `untrusted.taintSeconds` (900) boyunca
her öneri tainted sayılır ve kural 13 (yön doğrulaması) uygulanır. **Sıkı taint** (`untrusted:strict`): web sayfası (`read_url`, keyfi kaynak) veya bayraklı
haber (sanitize/karantina bayrağı) yazar; sonradan gelen temiz haber onu silemez. `approvalFor: "web_or_flagged"` (v3) iken onay sadece sıkı taint'te
istenir; `"all"` iken her web/haber sonrası. Böylece temiz OKX haberiyle yapılan otonom tur, limit içinde onaysız yürür ama yönü piyasa verisi doğrulamalı. LLM sohbet geçmişi sayfayı turlar boyunca taşıdığı için tur değil süre esas alınır. Bozuk kayıt → tainted (fail-closed).
Haber etkisi asimetriktir: güvenilmeyen içerik bir işlemi tek başına başlatamaz (kural 13), sadece LLM'i vazgeçirebilir.
Diğer kodlar: `INTENT_COMMIT_FAILED`, `INTENT_GATE_UNCONFIGURED` (IntentGate yazılamadı, fail-closed; bkz. `docs/avalanche.md`), `MASKING_VIOLATION`, `SCHEMA_INVALID`, `SIZE_BELOW_MIN`, `ATK_ERROR`, `ATK_UNAVAILABLE`, `HOST_NOT_ALLOWED`.

Emir üretimi (`intentCommit: true` ise önce IntentGate kaydı, sonra kaldıraç ve emir): IOC limit, fiyat = referans × (1 ± `priceBandPct`%), tickSz/lotSz'e yuvarlama, SL/TP tetik fiyatları ekli (`slOrdPx/tpOrdPx = -1`), swap isolated + `swap_set_leverage`.

## Kurallar / sınırlar
- `policy.json` değişince: `npm run policy:set-hash` (sahip cüzdan). Yazılmazsa `POLICY_HASH_MISMATCH` → işlem kapalı.
- Policy nesnesi çalışma zamanında değiştirilemez (deepFreeze).
- Notional: spot alış = USDT × %; spot satış = varlık × % × fiyat; swap = USDT × % × kaldıraç.
- `compat` (v4/v5): ATK uyumlu kapı açık mı (`enabled`), hesap okumaları (`accountReads`: `"deny"` maskeleme korunur, `"raw"` ham veri),
  web/haber görünümü (`contentReads`: `"digest"` karantina özeti, `"sanitized"` taranmış metin). Bkz. `docs/compat.md`.
  ATK emirleri aynı kurallardan `Guardian.proposeIntent` ile geçer; audit satırında tool adı ATK adıdır (`spot_place_order`, `swap_place_order`).

## Nasıl test edilir
`tests/unit/policy.test.ts` (her kod için senaryo), `tests/unit/guardian.test.ts`.

## Son güncelleme
2026-10-17 · policy v5: `compat.contentReads`. Öncesi: policy v4: `compat` bloğu (ATK uyumlu kapı). Öncesi: policy v3: `intentCommit` (emir öncesi IntentGate), `untrusted.approvalFor` + sıkı taint. Öncesi: policy v2: `untrusted` bloğu, kural 13 (`SIGNAL_NOT_CONFIRMED`), taint ile zorunlu onay.
