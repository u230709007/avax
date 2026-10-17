# UI — arayüz ekranları

## Amaç
Kullanıcının gerçek değerleri, ajanın kararlarını ve LLM'e giden maskeli içeriği görmesi. Görsel kurallar: `DESIGN.md`.

## Dosyalar
`web/src/App.tsx`, `web/src/store.ts` (durum + WS), `web/src/api.ts`, `web/src/components/*`, `web/src/pages/*`, `web/src/killSwitch.ts`, `src/server.ts`.

## Akış
| Ekran | İçerik | Veri kaynağı |
|---|---|---|
| Genel bakış | toplam değer, günlük PnL, 24s limit, son anchor, USDT bakiye grafiği, varlıklar, son kararlar | `/api/portfolio` (ATK), `/api/bills`, `/api/decisions`, `/api/anchors`, WS |
| Sohbet | mesajlar (maske açılmış), sağ panel "Ekranda / LLM'e giden", onay kartları, örnek istemler | `/api/chat`, WS `llm_traffic` |
| Kararlar | filtrelenebilir tablo, satır çekmecesi: girdi, kurallar, karantina özeti, çözülen gizli içerik, hash, "Zincirde doğrula" | `/api/decisions/:seq`, `/api/verify/:seq` |
| Audit | anchor listesi, Snowtrace linkleri, "Şimdi zincire yaz" | `/api/anchors`, `/api/anchors/flush` |
| Ayarlar | otonom mod, Avalanche durumu, ATK durumu, salt okunur politika | `/api/status`, `/api/policy` |
| Üst bar model seçici | ajan modeli (Groq varsayılan; Gemini/Claude anahtar varsa) | `/api/status.llm`, `POST /api/settings/llm`, WS `llm` |
Sol ray: sadece ikon, Sohbet dahil hep görünür (LLM yoksa sayfa nedenini yazar); üstüne gelince/tıklayınca adı balonla çıkar, aktif sayfanın adı başlıkta yazar (mobilde alt çubuk).
Yerleşim: uygulama ekranın ortasında en fazla 1440px'lik çerçevede; arkada fare çevresinde aydınlanan ızgara (`components/GridBackground.tsx`). Siyah-beyaz, turuncu yok.
Üst bar (sağ, ikon + renkli nokta + balon): model seçici, OKX (Bağlı / Veri alınamıyor / Bağlı değil), Fuji policy eşleşmesi, kill-switch durumu, canlı akış, "Zincirden durdur" ikon butonu.

API: tümü `x-ui-token` başlığı (WS'te `?token=`) ister; sunucu sadece 127.0.0.1. Token URL'den bir kez alınır, sessionStorage'da tutulur.
Geliştirme: `npm run web` (:5173, /api ve /ws :7070'e proxy). Üretim: `npm run web:build` → :7070 statik sunar.

## Kurallar / sınırlar
- Mock yok; veri yoksa boş durum. Emoji yok. 390px'te yatay taşma yok.
- Onay sadece bu arayüzden verilir; LLM'in onay tool'u yoktur.

## Nasıl test edilir
`npx tsc -p web/tsconfig.json`, `npm run web:build`; Playwright ile açık/koyu/mobil ekran görüntüsü ve `scrollWidth` kontrolü.

## Son güncelleme
2026-10-17 · Siyah-beyaz tema, ortalanmış çerçeve, fareyle aydınlanan ızgara, sağ üst model seçici. 1920/1440/390px kontrol edildi.
