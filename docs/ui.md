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
| MCP | ajan bağlantısı: MCP adresi, anahtar oluştur (bir kez gösterilir) / iptal et, Claude Code komutu ve JSON ayarı (kopyala), ajan başına 24s çağrı/işlem | `/api/service`, `POST /api/service/keys`, `POST /api/service/keys/:id/revoke` |
| Ayarlar | otonom mod, "Şimdi bir tur çalıştır", Avalanche durumu, ATK durumu, salt okunur politika | `/api/status`, `/api/policy` |
| Sohbet kutusu model seçici (sağ üst) | ajan modeli (Groq varsayılan; Gemini/Claude anahtar varsa) | `/api/status.llm`, `POST /api/settings/llm`, WS `llm` |
Sol ray: sadece ikon, Sohbet dahil hep görünür (LLM yoksa sayfa nedenini yazar); üstüne gelince/tıklayınca adı balonla çıkar, aktif sayfanın adı başlıkta yazar (mobilde alt çubuk).
Yerleşim: uygulama ekranın ortasında en fazla 1440px'lik çerçevede; arkada fare çevresinde aydınlanan ızgara (`components/GridBackground.tsx`). Siyah-beyaz, turuncu yok.
Üst bar (sağ, ikon + renkli nokta + balon): OKX (Bağlı / Veri alınamıyor / Bağlı değil), Fuji policy eşleşmesi, kill-switch durumu, canlı akış, "Zincirden durdur" ikon butonu.

API: tümü `x-ui-token` başlığı (WS'te `?token=`) ister; sunucu sadece 127.0.0.1. Token URL'den bir kez alınır, sessionStorage'da tutulur.
Geliştirme: `npm run web` (:5173, /api ve /ws :7070'e proxy). Üretim: `npm run web:build` → :7070 statik sunar.

## Kurallar / sınırlar
- Mock yok; veri yoksa boş durum. Emoji yok. 390px'te yatay taşma yok.
- Onay sadece bu arayüzden verilir; LLM'in onay tool'u yoktur.
- Guardian adresi `web/src/guardianUrl.ts`: `VITE_GUARDIAN_URL` boşsa aynı origin; doluysa (Vercel) istekler ve WS oraya gider, guardian'da `UI_ORIGINS` CORS izni gerekir.

## Nasıl test edilir
`npx tsc -p web/tsconfig.json`, `npm run web:build`; Playwright ile açık/koyu/mobil ekran görüntüsü ve `scrollWidth` kontrolü.

## Son güncelleme
2026-10-17 · Siyah-beyaz tema, ortalanmış çerçeve, fareyle aydınlanan ızgara. Model seçici sadece Sohbet sayfasında, sohbet kutusunun sağ üstünde (`web/src/components/ModelPicker.tsx`). 1920/1440/390px kontrol edildi.

## Tanıtım sayfası (2026-10-17)
Token olmayan ziyaretçiler `Landing.tsx` ve kapsamı ayrılmış `landing.css` üzerinden tanıtımı görür: video, dört özellik kartı, Agent/Guardian/ATK akışı, beş adımlı etkileşimli zaman çizgisi ve MCP/panel giriş seçenekleri. MCP seçeneği başarılı girişten sonra mevcut Connect ekranını açar. Giriş penceresi zincir RPC yanıtını beklemeyen, token korumalı `/api/approvals` ile token doğrular; hatalı token kaydedilmez. Backend ve işlem kuralları değişmez.
Videolar `web/public/media/` içinde; açılış videosu web için 1280px/24fps olarak sıkıştırılmıştır. Kullanıcı duraklatabilir; reduced-motion tercihi ilk yüklemede uygulanır. iStock kaynaklı detay videosu filigranlı önizlemedir; yayına çıkarken lisanslı dosyayla değiştirilmelidir.
Doğrulama: TypeScript ve üretim derlemesi; 1440px/390px görünüm ve taşma kontrolü, video oynatımı, zaman çizgisi seçimi, geçersiz token hata durumu. Gerçek token ile başarılı oturum açma bu değişiklikte test edilmedi.

Tanıtım önce gösterilir: kayıtlı token olsa bile her sayfa yüklemesi landing ile başlar. Panel ancak giriş penceresinde token doğrulandıktan sonra açılır.


Giriş seçimi: hesapsız örnek senaryo demosu, Supabase e-posta + şifre girişi (Giriş yap / Kayıt ol) ve ayrı yönetici token girişi. Girişten sonra doğrudan panele geçilir; OKX bağlı değilse panel içinde bağlama formu açılır (pages/LinkOkx.tsx) ve aynı paneli kendi Guardian'ıyla kullanır: istekler `Authorization: Bearer` ile gider (api.ts `useAccountSession`), MCP sekmesi ve zincir kill-switch düğmesi gizlenir, Ayarlar'da OKX bağlantısı kaldırılabilir. Ayrıntılar: accounts.md, tenants.md.

## Güvenlik Testleri
Ana sayfa, yönetim paneli ve herkese açık kanıt paneli aynı salt okunur ekranı kullanır (`web/src/pages/SecurityTests.tsx`). `/security-tests.json` her iki sunucuda `data/attack-replay.json` kaydının doğrulanmış, daraltılmış görünümünü sunar (`src/service/securityReport.ts`). Yenile düğmesi yalnızca sonucu okur; test veya emir başlatmaz.

Politika reddi, insan onayı, içerik taraması, belirsiz sonuç ve izin ayrı gösterilir. Sinyal/veri/altyapı hataları güvenlik başarısı sayılmaz. Eski politika sürümü uyarılır. Eksik/bozuk dosyada örnek veri üretilmez. Akış doğrudan guardian replay olduğunu, LLM kandırılmasının ve bağımsız OKX emir sonucunun ölçülmediğini belirtir.
