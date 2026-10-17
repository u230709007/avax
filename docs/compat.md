# ATK uyumlu kapı — okx.ai ajanları için tak-çalıştır güvenlik katmanı

## Amaç
OKX Agent Trade Kit (`okx-trade-mcp`) için yazılmış herhangi bir ajan (okx.ai, Claude, kendi botu) **kodunu değiştirmeden**
guardian'ın arkasına alınır: ajan OKX'e değil bu MCP ucuna bağlanır, aynı tool adlarını ve aynı şemaları görür.
Okuma tool'ları geçer, emir tool'ları guardian'ın kural motorundan geçer, gerisi (transfer, çekim, earn, bot…) hiç yoktur.

## Dosyalar
`src/compat/atkProxy.ts` (MCP sunucusu, tool sınıfları, yanıt biçimi), `src/compat/translate.ts` (ATK emir argümanı → `TradeIntent`, saf),
`src/guardian.ts` (`proposeIntent`: ortak karar hattı), `src/upstream/atkClient.ts` (`toolDefs`: gerçek ATK şemaları),
`src/service/gateway.ts` (`POST /atk`), `src/mcpStdio.ts` (`--atk`), `policy.json` (`compat`).

## Akış
```
okx.ai ajanı ── ATK tool adı + ATK argümanı ──► /atk (HTTP, API anahtarı) veya npm run mcp:atk (stdio)
   tool sınıfı:
   piyasa okuma   market_get_ticker/candles/instruments        → ATK'ya aynen (herkese açık veri)
   hesap okuma    account_get_balance/positions, *_get_orders  → policy.compat.accountReads: "deny" (vars.) | "raw"
   haber          news_get_latest, news_get_by_coin            → contentReads "sanitized": her öğe taranır, temizse arındırılmış metin,
                                                                 bayraklıysa sadece bayraklar ("digest": karantina özeti); taint başlar
   web (ek)       read_url                                     → guardian çeker + aynı tarama; sıkı taint (sonraki emir onay/sinyal ister)
   mesaj (ek)     inspect_prompt                               → kullanıcı mesajı: kodlanmış içerik engellenir, talimat/gizli metin → sıkı taint
   emir           spot_place_order, swap_place_order           → translate → TradeIntent → Guardian.proposeIntent (tüm kurallar, onay, IntentGate)
   kaldıraç       swap_set_leverage                            → üst sınır kontrolü + kayıt; OKX'e emirle birlikte guardian yazar
   risk azaltma   *_cancel_order, swap_close_position          → sadece allowlist çiftleri; kill-switch açıkken de serbest
   diğer her şey  account_transfer, withdraw, earn, bot…       → TOOL_NOT_ALLOWED + audit (saldırı izi)
```
Çeviri (`translateAtkOrder`): `sz` + `tgtCcy` → USDT tutarı → bakiyenin yüzdesi (`size_pct`); `slTriggerPx/tpTriggerPx` → giriş fiyatından %.
Guardian emri yeniden üretir: `ordType`/`px` yok sayılır (her zaman IOC, ±`priceBandPct` bantlı), swap her zaman `isolated`.
Yanıt ATK biçimindedir: `{ tool, ok, data: { endpoint: "guardian", requestTime, data: [...] }, guardian }`;
emir başarısında `ordId` maskelidir (`ORD_…`), onay beklerken `sCode: "PENDING_APPROVAL"`, retlerde `isError` + `error.code`.

| ATK girdisi | Sonuç |
|---|---|
| spot `tdMode` cross/isolated (marjin borç) | `MARGIN_NOT_ALLOWED` |
| swap `reduceOnly` | `USE_CLOSE_POSITION` |
| swap `posSide` long/short (hedge modu) | `HEDGE_MODE_NOT_SUPPORTED` |
| alım için SL fiyatın üstünde / TP altında (satış tersi) | `SL_WRONG_SIDE` / `TP_WRONG_SIDE` |
| bakiyenin %100'ünden fazla | `INSUFFICIENT_BALANCE` |
| şemada olmayan alan (örn. adres) | `SCHEMA_INVALID` |

**İçerik kapısı** (`inspectUntrusted`, `src/ingest/sanitize.ts`): `HIDDEN_TEXT`, `INSTRUCTION`, Mors/base64/hex/unicode tag → metin LLM'e
gitmez (gizli öğe metni düz metinde kaldığı için temizlemek yetmez). Görünmez karakter silinir, adres maskelenir, metin gider. Her tarama audit'e
(`news`, `read_url`, `inspect_prompt`) bayrak ve çözülmüş gizli içerikle yazılır.

## Kurallar / sınırlar
- Sınır: guardian sadece kendisinden geçen içeriği görür. Ajan web'i kendi aracıyla okursa veya host `inspect_prompt` çağırmazsa tarama olmaz;
  bu durumda da her emir kurallardan geçer, para transferi yoktur. Tam kapsam için ajanın tek MCP ucu bu kapı olmalı.
- `read_url` host kuralı: `READ_URL_ALLOWLIST`; `*` her herkese açık host'u açar (loopback/özel ağ/link-local/IPv6 literal kapalı, yönlendirme yok).
  DNS ile özel IP'ye çözülen ad kalan risktir.
- `accountReads: "deny"` maskeleme kuralını korur (LLM'e ham bakiye/ID gitmez). Tam uyum için `"raw"` bilinçli seçimdir ve
  policy hash'ine girer (zincirde görünür). `"raw"` modunda ham `ordId` ile iptal de kabul edilir; `"deny"`de sadece `ORD_…`.
- Kota: `spot_place_order`/`swap_place_order` da "korunan işlem" sayılır (`src/service/keys.ts`).
- Kaldıraç ajan başına değil hesap başınadır (`compat:lever:<instId>`, SQLite kv); varsayılan 1.
- `compat.enabled: false` iken `/atk` kaydolmaz, stdio `--atk` açılmaz.

## Nasıl test edilir
`tests/unit/compat.test.ts` (çeviri + InMemory MCP: izinli emir, limit, transfer engeli, maskeli iptal, haber/web/mesaj taraması, host kuralı).
Canlı: `npm run dev` → `curl -X POST http://127.0.0.1:7072/atk -H "Authorization: Bearer sig_…"` ile `tools/list`.
Claude Code: `.mcp.json` → `{"type":"http","url":"http://127.0.0.1:7072/atk","headers":{"Authorization":"Bearer sig_…"}}`.

## Son güncelleme
2026-10-17 · policy v5: `contentReads: "sanitized"`, `read_url` + `inspect_prompt`, `*` allowlist. Öncesi: ilk sürüm (policy v4).
