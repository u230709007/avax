# Kişisel hesaplar: kullanıcı başına Guardian

E-postayla kayıt olan her kullanıcı kendi OKX demo API anahtarını bağlar ve kendi Guardian'ını alır. Sahip (UI token) ile kullanıcılar aynı sunucuyu (:7070) ve aynı arayüzü kullanır, ama veriler ayrıdır.

Guardian kullanıcı adına OKX hesabı açamaz. OKX'te hesap açmak kimlik doğrulaması (KYC) gerektirir ve bunun için bir API yoktur. Kullanıcı hesabı OKX'te kendisi açar ve demo modda, yalnızca Trade yetkili bir API anahtarı oluşturur.

## Akış
1. Kullanıcı e-posta ve şifreyle giriş yapar (accounts.md) ve doğrudan panele yönlenir. E-posta doğrulama bağlantısından (`?code=`) dönüşte de aynısı olur. Panel kapısı (web/src/pages/LinkOkx.tsx `AccountGate`) `GET /api/account` çağırır.
2. OKX bağlı değilse panelin içinde bağlama formu açılır: API key, secret key, passphrase ve site (`global`, `tr`, `eea`, `us`). `PUT /api/account/okx`.
3. Sunucu anahtarı kaydetmeden önce dener: izole bir ATK süreci açar ve `account_get_balance` çağırır. Hata alırsa anahtarı kaydetmez (`OKX_LINK_FAILED`).
4. Bağlantı başarılıysa panel açılır. Her `/api` ve `/ws` isteği kullanıcının kendi Guardian'ına gider.

## Kimlik
- Sahip: `x-ui-token` (WS'te `?token=`). Değişmedi.
- Kullanıcı: `Authorization: Bearer <Supabase erişim token'ı>` (WS'te `?access_token=`). Sunucu token'ı Supabase Auth `/auth/v1/user` ucuyla doğrular (src/tenants/auth.ts) ve sonucu 60 sn önbelleğe alır. Tarayıcının bildirdiği kullanıcı kimliğine güvenilmez. E-postası doğrulanmamış hesap kabul edilmez.
- `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` yoksa `web/.env.local`'daki `VITE_` değerleri kullanılır. İkisi de yoksa kişisel hesaplar kapalıdır ve yalnızca UI token çalışır.

## İzolasyon (src/tenants/registry.ts)
- Her kullanıcının `data/tenants/<user_id>/` altında kendi `guardian.db` dosyası vardır: audit zinciri, onaylar, 24 saatlik limit sayaçları ve vault.
- Vault anahtarı kullanıcıya özeldir: ana anahtardan `HMAC(..., vault:<user_id>)` ile türetilir.
- OKX anahtarları `data/tenants/tenants.db` içinde AES-256-GCM ile şifreli saklanır. Şifreleme anahtarı `TENANT_SECRET_KEY`'den, o yoksa `VAULT_HMAC_KEY`'den HKDF ile türetilir. Anahtar hiçbir API yanıtında dönmez.
- ATK süreci (src/upstream/atkClient.ts `credentials` + `home`) boş bir HOME ile başlar. Ortamına yalnızca kullanıcının anahtarı verilir; sahibin `~/.okx/config.toml` dosyası, OAuth oturumu ve `.env` OKX anahtarları sürece geçmez. Her zaman `--demo` ile çalışır. Canlı olarak doğrulandı: sahte anahtarla açılan süreç "API key doesn't exist" hatası alır.
- WS olayları kullanıcıya özel kanaldan gider (`u:<user_id>`).
- Çalışan Guardian sayısı `TENANT_MAX_RUNNING` (varsayılan 20) ile sınırlıdır. Boşta kalan Guardian `TENANT_IDLE_MINUTES` (30) sonra kapanır; otonom modu açık olan kapanmaz.

## Ortak olanlar ve sınırlar
- Ortak: policy.json ve hash'i, PolicyRegistry kill-switch'i, IntentGate (her emir öncesi sahibin cüzdanıyla kayıt, gas sahipten) ve LLM anahtarı (sohbet ve otonom tur maliyeti sahibe aittir).
- Audit kökleri zincire yazılmaz: AuditAnchor tek ve ardışık bir seq akışı kabul eder (`NonContiguous`). Kullanıcının audit kaydı yerel hash zinciri olarak kalır. Bunun için akış anahtarlı yeni bir anchor kontratı gerekir.
- Kullanıcıda MCP sekmesi (`/api/service`, 403 `owner_only`) ve zincir kill-switch düğmesi gizlidir. Servis kapısı (:7072) yalnızca sahibin Guardian'ına bağlıdır.
- Sunucu varsayılan olarak 127.0.0.1'de dinler. Başka kullanıcıların erişmesi için `GUARDIAN_HOST` ayarlanmalı veya HTTPS bir tünel (cloudflared) kullanılmalı. Bu durumda Supabase Redirect URLs listesine o adres eklenmelidir.

## API
- `GET /api/account` → `{ email, okx: { linked, site?, since? }, sites }`
- `PUT /api/account/okx` `{ apiKey, secretKey, passphrase, site }` → 200 / 400 `CREDENTIALS_REQUIRED`, `BAD_SITE` / 422 `OKX_LINK_FAILED`
- `DELETE /api/account/okx`: anahtarı ve izole HOME dizinini siler, Guardian'ı kapatır. Audit veritabanı korunur.
- OKX bağlı değilken diğer `/api` istekleri 409 `OKX_NOT_LINKED` döner.

## Doğrulama
`tests/unit/tenants.test.ts`: kimliksiz istek 401, sahip ve kullanıcı kayıtlarının ayrılığı, `owner_only`, `OKX_NOT_LINKED`, eksik anahtar 400, AES-GCM şifreleme ve kurcalama tespiti. Gerçek bir Supabase kullanıcısı ve kullanıcının kendi OKX demo anahtarıyla uçtan uca deneme henüz yapılmadı.
