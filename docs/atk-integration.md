# ATK entegrasyonu — OKX Agent Trade Kit

## Amaç
OKX'e tek erişim yolu: `@okx_ai/okx-trade-mcp@1.4.8` (MCP stdio). LLM ATK tool'larını hiç görmez.

## Dosyalar
`src/upstream/atkClient.ts` (süreç + allowlist), `src/upstream/atkTools.ts` (tipli sarmalayıcılar), `src/tools.ts` (LLM'e açık 7 tool).

## Akış
- Başlatma: `node <okx-trade-mcp>/dist/index.js --profile $OKX_PROFILE --site $OKX_SITE --modules market,spot,swap,account,news --demo`, ortamda `OKX_DEMO=1`.
- Açılışta `tools/list`; allowlist'teki her tool gerçekten var mı kontrol edilir (`missingTools`, arayüz Ayarlar ekranı).
- Yanıt biçimi: `content[0].text` = `{ tool, ok, data: { endpoint, requestTime, data: <OKX data> } }`; istemci iç `data`'yı döner.

### Guardian'ın kullanabildiği ATK tool'ları (allowlist)
| Tool | Kullanım |
|---|---|
| `market_get_ticker`, `market_get_candles`, `market_get_instruments` | referans fiyat, 15 dk mum, tickSz/lotSz/minSz/ctVal |
| `account_get_balance`, `account_get_positions`, `account_get_bills` | portföy, pozisyon, grafik |
| `spot_place_order`, `spot_cancel_order`, `spot_get_orders` | spot emir (IOC limit + ekli SL/TP) |
| `swap_place_order`, `swap_cancel_order`, `swap_get_orders`, `swap_close_position`, `swap_set_leverage` | swap (isolated) |
| `news_get_latest`, `news_get_by_coin` | haber (karantinaya gider) |
`account_transfer`, earn, bot, option, futures vb. çağrılamaz (allowlist + modül filtresi).

`AtkClient.toolDefs(names)`: açılıştaki `tools/list`'ten allowlist'teki tool'ların gerçek tanımları; ATK uyumlu kapı (`docs/compat.md`) bunları aynen yayınlar.

### LLM'e açık 7 tool
`get_market_view`, `get_portfolio_view`, `get_news_digest`, `read_url`, `propose_trade`, `close_position`, `cancel_order`.

## Kurallar / sınırlar
- OKX API anahtarı: demo trading, sadece Trade yetkisi, Withdraw kapalı, IP whitelist.
- Anahtarın yeri: `~/.okx/config.toml` (`npx okx config init`) **veya** git'e girmeyen `.env`'de `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`. ATK alt sürecine ortamdan sadece bu üç anahtar + temel değişkenler geçer; Anthropic ve cüzdan anahtarları geçmez.
- Yeni ATK tool'u eklerken gerçek şemayı paketin `dist/index.js`'inden doğrula (LEARN L-005).
- Emir parametrelerini (instId, px, sz, tdMode, SL/TP) LLM değil `Guardian.execute` üretir.

## Nasıl test edilir
`npm run test:integration` (ATK bağlantısı + `missingTools() == []` + gerçek fiyat/bakiye).

## Son güncelleme
2026-10-17 · `toolDefs` (ATK uyumlu kapı için gerçek şemalar). Öncesi: OKX anahtarları .env üzerinden de verilebiliyor.
