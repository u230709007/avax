# Runbook — kurulum, çalıştırma, demo öncesi kontrol

## Amaç
Sıfırdan çalışır hale getirmek ve demo gününde sürprizleri önlemek.

## Dosyalar
`.env.example`, `src/main.ts`, `src/mcpStdio.ts`, `scripts/*`, `package.json`.

## Akış
1. Node ≥ 22.5 (`node:sqlite`), `npm install`.
2. OKX: Demo Trading'de API anahtarı oluştur (Read + Trade, Withdraw KAPALI, IP whitelist). Anahtarı **ya** `npx okx config init` (profil `demo`) **ya da** `.env`'deki `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE` ile ver. Passphrase zorunlu.
3. `.env`: `cp .env.example .env`; `VAULT_HMAC_KEY=$(openssl rand -hex 32)`, `UI_TOKEN=$(openssl rand -hex 16)`, `GROQ_API_KEY` (varsayılan ajan). İsteğe bağlı `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`: varsa sağ üst seçiciden geçilir.
4. Cüzdanlar: DEPLOYER (sahip, kill-switch'i telefondaki Core/MetaMask'ta tut) ve ANCHOR (sadece gas). Fuji faucet'ten test AVAX.
5. `npm run contracts:build && npm run deploy:fuji` → adresleri `.env`'e yaz.
6. `npm run dev` → `http://127.0.0.1:7070/?token=<UI_TOKEN>` (`predev` arayüzü `web/dist`e her başlangıçta yeniden derler; eski derleme sunulmaz).
7. Saldırı demosu: `npm run attack-site` (ayrı terminal).
8. ATK uyumlu kapı (okx.ai ajanları, `docs/compat.md`): uzak `POST /atk` (servis kapısı, API anahtarı) veya yerel `npm run mcp:atk` (stdio). Ajan `okx-trade-mcp` yerine bunu kaydeder.
9. B modu (Claude Code): repodaki `.mcp.json` → `node node_modules/tsx/dist/cli.mjs src/mcpStdio.ts` (Windows'ta da çalışır; sadece guardian kayıtlı olsun). `npm run dev` açıkken audit zinciri tek süreçte kalsın diye B modunu ayrı `DB_PATH` ile başlatın.
9. Foundry (Windows): GitHub release `foundry_<sürüm>_win32_amd64.zip` → sha256 kontrolü → `%USERPROFILE%.foundryin` → kullanıcı PATH'i. `forge test` solc'yi kendisi indirir.

Hata durumları (fail-closed):
| Durum | Davranış | Çözüm |
|---|---|---|
| Fuji RPC yok | emir kapalı, okuma açık | `FUJI_RPC_URL` değiştir |
| `POLICY_HASH_MISMATCH` | emir kapalı | `npm run policy:set-hash`; çalışan guardian'ı yeniden başlat (eski policy dosyasını okur) |
| `INTENT_COMMIT_FAILED` / `INTENT_GATE_UNCONFIGURED` | emir kapalı | `.env` `INTENT_GATE_ADDRESS`, anchor cüzdanında gas, Fuji RPC |
| ATK `okx-auth ENOENT` | ATK veri vermez | API anahtarı yok: `.env`'de OKX_* üçlüsü veya `okx config init` (LEARN L-005) |
| Anthropic hatası/refusal | sunucu yedek modeli; olmazsa tur atlanır | anahtar/kota |
| Audit zinciri bozuk | guardian başlamaz | DB elle değiştirilmiş; yedekten dön |
| OKX `50123` "no trading permission for the Crypto" | emir `ATK_ERROR` | `perm`'de trade olsa bile OKX reddediyor: OKX'te Demo Trading → API → anahtarı düzenle/yeniden oluştur (Trade açık, Withdraw kapalı) |
| Groq `model_not_found` | ajan yanıt vermez | `GROQ_MODEL` kalkmış; `/openai/v1/models` ile güncel modeli seç |

## Demo öncesi kontrol listesi
- [ ] `npm test` ve `forge test` yeşil · [ ] `npm run test:integration` yeşil
- [ ] Arayüzde OKX "Bağlı", Fuji "Eşleşti", Durum "Aktif" · [ ] Demo hesabında USDT var
- [ ] `npm run attack-site` açık · [ ] Anchor cüzdanında gas var · [ ] Kill-switch cüzdanı telefonda, Fuji ağı ekli
- [ ] `npm run attack:replay` ve `npm run killswitch:measure` güncel (panel bu dosyaları gösterir; guardian kapalıyken çalıştır, L-014)
- [ ] Kanıt paneli tünelle açık (`cloudflared tunnel --url http://127.0.0.1:7072`) · [ ] Otonom mod bir tur denendi · [ ] `docs/DEMO_SCRIPT.md` provası yapıldı

## Vercel (sadece statik arayüz)
`vercel.json`: `npm run web:build` → `web/dist`. Arayüz `web/` altında olduğu için Vercel'in otomatik `vite build`'i
kökte `index.html` bulamaz (`UNRESOLVED_ENTRY`). Vercel sadece statik sayfaları sunar; `/api`, `/ws`, `/public/api` için guardian süreci ayrıca çalışmalıdır.

## Kurallar / sınırlar
Push/commit yok; `.env` ve `data/` git'e girmez.

## Nasıl test edilir
Yukarıdaki kontrol listesi.

## Son güncelleme
2026-10-17 · IntentGate ve servis kapısı hataları, demo öncesi kanıt dosyaları. Öncesi: Groq varsayılan, Windows .mcp.json ve Foundry kurulumu, OKX 50123 ve Groq model hataları.
