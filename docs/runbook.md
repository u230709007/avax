# Runbook — kurulum, çalıştırma, demo öncesi kontrol

## Amaç
Sıfırdan çalışır hale getirmek ve demo gününde sürprizleri önlemek.

## Dosyalar
`.env.example`, `src/main.ts`, `src/mcpStdio.ts`, `scripts/*`, `package.json`.

## Akış
1. Node ≥ 22.5 (`node:sqlite`), `npm install`.
2. OKX: Demo Trading'de API anahtarı oluştur (Read + Trade, Withdraw KAPALI, IP whitelist). Anahtarı **ya** `npx okx config init` (profil `demo`) **ya da** `.env`'deki `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE` ile ver. Passphrase zorunlu.
3. `.env`: `cp .env.example .env`; `VAULT_HMAC_KEY=$(openssl rand -hex 32)`, `UI_TOKEN=$(openssl rand -hex 16)`, `ANTHROPIC_API_KEY`.
4. Cüzdanlar: DEPLOYER (sahip, kill-switch'i telefondaki Core/MetaMask'ta tut) ve ANCHOR (sadece gas). Fuji faucet'ten test AVAX.
5. `npm run contracts:build && npm run deploy:fuji` → adresleri `.env`'e yaz.
6. `npm run web:build && npm run dev` → `http://127.0.0.1:7070/?token=<UI_TOKEN>`.
7. Saldırı demosu: `npm run attack-site` (ayrı terminal).
8. B modu (Claude Code): `.mcp.json` → `{"mcpServers":{"guardian":{"command":"npm","args":["run","-s","mcp"],"cwd":"<repo>"}}}` (sadece guardian kayıtlı olsun).

Hata durumları (fail-closed):
| Durum | Davranış | Çözüm |
|---|---|---|
| Fuji RPC yok | emir kapalı, okuma açık | `FUJI_RPC_URL` değiştir |
| `POLICY_HASH_MISMATCH` | emir kapalı | `npm run policy:set-hash` |
| ATK `okx-auth ENOENT` | ATK veri vermez | API anahtarı yok: `.env`'de OKX_* üçlüsü veya `okx config init` (LEARN L-005) |
| Anthropic hatası/refusal | sunucu yedek modeli; olmazsa tur atlanır | anahtar/kota |
| Audit zinciri bozuk | guardian başlamaz | DB elle değiştirilmiş; yedekten dön |

## Demo öncesi kontrol listesi
- [ ] `npm test` ve `forge test` yeşil · [ ] `npm run test:integration` yeşil
- [ ] Arayüzde OKX "Bağlı", Fuji "Eşleşti", Durum "Aktif" · [ ] Demo hesabında USDT var
- [ ] `npm run attack-site` açık · [ ] Anchor cüzdanında gas var · [ ] Kill-switch cüzdanı telefonda, Fuji ağı ekli
- [ ] Otonom mod bir tur denendi · [ ] `docs/DEMO_SCRIPT.md` provası yapıldı

## Kurallar / sınırlar
Push/commit yok; `.env` ve `data/` git'e girmez.

## Nasıl test edilir
Yukarıdaki kontrol listesi.

## Son güncelleme
2026-10-17 · OKX anahtarı .env seçeneği.

## Sorun giderme: yanlış LLM sağlayıcısı
- `.env` tek doğruluk kaynağıdır (`src/env.ts`, `override: true`): sistemde kalmış `LLM_PROVIDER` vb. `.env` değerini ezmez; açılışta "Not: sistemdeki … yerine .env değeri kullanıldı" yazar.
- Açılışta `Ayarlar:` satırı okunan `.env` yolunu, `Sohbet:` satırı aktif modeli ve `LLM_PROVIDER`'ı gösterir. Arayüzde sohbet ekranının üstünde "Model: …".
- `Port 7070 kullanımda` → eski guardian hâlâ açık; arayüz ona bağlı kalır. Eski süreci kapatıp yeniden başlat.
