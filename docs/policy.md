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
Geçerse ve tutar > `humanApprovalAboveUsdt` (25) ise `PENDING_APPROVAL`. Diğer kodlar: `MASKING_VIOLATION`, `SCHEMA_INVALID`, `SIZE_BELOW_MIN`, `ATK_ERROR`, `ATK_UNAVAILABLE`, `HOST_NOT_ALLOWED`.

Emir üretimi: IOC limit, fiyat = referans × (1 ± `priceBandPct`%), tickSz/lotSz'e yuvarlama, SL/TP tetik fiyatları ekli (`slOrdPx/tpOrdPx = -1`), swap isolated + `swap_set_leverage`.

## Kurallar / sınırlar
- `policy.json` değişince: `npm run policy:set-hash` (sahip cüzdan). Yazılmazsa `POLICY_HASH_MISMATCH` → işlem kapalı.
- Policy nesnesi çalışma zamanında değiştirilemez (deepFreeze).
- Notional: spot alış = USDT × %; spot satış = varlık × % × fiyat; swap = USDT × % × kaldıraç.

## Nasıl test edilir
`tests/unit/policy.test.ts` (her kod için senaryo), `tests/unit/guardian.test.ts`.

## Son güncelleme
2026-10-16 · kural sırası düzeltildi (LEARN L-003).
