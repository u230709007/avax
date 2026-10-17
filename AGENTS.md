# AGENTS.md — Sealed Intent Guardian

## Okuma kuralı (önce bunu uygula)
1. Bu dosyayı ve `LEARN.md`'yi oku (SessionStart hook ikisini de otomatik verir).
2. Görevle ilgili tek `docs/` dosyasını aç (`docs/INDEX.md`), sonra orada adı geçen kaynak dosyaları.
3. Tüm repoyu tarama: geniş `grep`/`find` yapma. Yol bilmiyorsan aşağıdaki **Modül haritası**na bak.
4. Her kaynak dosyanın ilk satırı ilgili dokümanı gösterir: `// docs: docs/x.md`.

## Proje özeti
OKX TR × Team1 Agentic Hackathon için prompt-injection'a dayanıklı otonom AVAX trade ajanı.
LLM (Groq, Gemini veya Opus 5.5, `LLM_PROVIDER`) sadece maskeli veri görür ve 7 dar tool kullanır; her isteği deterministik guardian kodu
kurallardan geçirir ve emri kendisi üretir. ATK (`okx-trade-mcp`) her zaman `--demo` ile çalışır.
Kural hash'i, kill-switch ve audit Merkle kökleri Avalanche Fuji'de doğrulanabilir.

## Modül haritası
- `src/guardian.ts` → maskele → kural → onay → emir üret; 7 tool'un uygulayıcısı → docs/WORKFLOW.md
- `src/tools.ts` → LLM'e açık 7 tool'un şeması → docs/atk-integration.md
- `src/mcpServer.ts` → guardian MCP sunucusu (LLM'in tek ucu) → docs/ARCHITECTURE.md
- `src/bootstrap.ts` → açılış (workflow 0), bağımlılıkları kurar → docs/ARCHITECTURE.md
- `src/main.ts` → (A) web + sohbet + otonom döngü girişi → docs/runbook.md
- `src/mcpStdio.ts` → (B) Codex Desktop/Code için stdio girişi → docs/runbook.md
- `src/service/` → servis kapısı: uzak MCP (`/mcp`, API anahtarı + plan kotası) + herkese açık kanıt paneli (7072) → docs/service.md
- `src/compat/` → ATK uyumlu kapı: okx.ai ajanları ATK tool adlarıyla guardian'ın arkasına alınır → docs/compat.md
- `src/compat/` → ATK uyumlu kapı: okx-trade-mcp tool adları/şemaları, emir → TradeIntent çevirisi (`/atk`, `mcp:atk`) → docs/compat.md
- `src/server.ts` → Fastify API + WebSocket, 127.0.0.1 + token (sahip) veya Supabase oturumu (kişisel hesap) → docs/ui.md
- `src/tenants/` → kişisel hesaplar: kullanıcı başına Guardian, şifreli OKX anahtarı, Supabase token doğrulama → docs/tenants.md
- `src/runtime.ts` → bir Guardian'ın sohbet + otonom döngüsü (sahip ve her kullanıcı için) → docs/tenants.md
- `src/config/` → `policy.json` yükleme, şema, hash → docs/policy.md
- `src/policy/` → intent şeması, kurallar, motor → docs/policy.md
- `src/masking/` → Vault: tanıtıcı, kova, gösterim etiketi, sızıntı tarama → docs/masking.md
- `src/ingest/` → sanitize: gizli metin/Mors/base64/unicode → docs/quarantine.md
- `src/llm/` → sağlayıcı seçimi, Anthropic + Gemini + Groq istemcileri, karantina → docs/llm.md, docs/quarantine.md
- `src/chat/` → AgentHost: Opus (host.ts) / Gemini (geminiHost.ts) / Groq (groqHost.ts), SwitchingHost (switch.ts: arayüzden model seçimi), ekranda maske açma → docs/llm.md, docs/masking.md
- `src/upstream/` → ATK MCP istemcisi + tool allowlist + OKX tipleri → docs/atk-integration.md
- `src/chain/` → Fuji: PolicyRegistry okuma, AuditAnchor yazma → docs/avalanche.md
- `src/audit/` → hash zinciri, Merkle, anchor döngüsü → docs/audit.md
- `src/approval/` → insan onayı (sadece UI'dan) → docs/WORKFLOW.md
- `src/store/` → SQLite (node:sqlite): audit, limit sayaçları, vault → docs/audit.md
- `src/market/` → RSI/EMA → docs/WORKFLOW.md
- `contracts/src/` → PolicyRegistry.sol, AuditAnchor.sol → docs/avalanche.md
- `contracts/test/` → forge testleri → docs/testing.md
- `web/src/` → koyu, ızgaralı, turuncu vurgulu arayüz (React+Tailwind) → docs/ui.md, DESIGN.md
- `attack-site/` → gerçek saldırı sayfaları (7071) → docs/threat-model.md
- `scripts/` → derleme, deploy, policy hash, audit doğrulama, docs:check, hook'lar → docs/runbook.md
- `tests/unit/` → saf birim testler (fixture'lı) → docs/testing.md
- `tests/integration/` → gerçek OKX demo/Anthropic/Fuji → docs/testing.md
- `examples/` → attack-replay (jüri tablosu) → docs/threat-model.md

## Komutlar
- Kurulum: `npm install` · OKX: `npx okx config init` (demo profil, sadece trade yetkisi)
- Çalıştır: `npm run dev` (arayüzü derler + guardian+API :7070) · `npm run web` (arayüz :5173) · `npm run attack-site` (:7071)
- Codex Desktop modu: `npm run mcp` · ATK uyumlu kapı (okx.ai ajanları): `npm run mcp:atk` veya servis `POST /atk`
- Test: `npm test` · `npm run test:integration` · `npm run typecheck` · `npm run docs:check`
- Kontrat: `npm run contracts:build` · `forge test --use <solc yolu>` · `npm run deploy:fuji` · `npm run deploy:intent-gate` · `npm run policy:set-hash` · `npm run killswitch:measure`
- Servis: `npm run service:key -- create "<ad>" [sandbox|pro|desk]` · `list` · `revoke <id>` (kapı :7072, docs/service.md)
- Audit: `npm run audit:verify -- <seq>` · Saldırı tablosu: `npm run attack:replay`

## Değişmez kurallar
- GitHub'a push ve commit YOK (kullanıcı açıkça istemedikçe). İstendiğinde doğrudan `main`'e push; yeni branch açma (kullanıcı kararı, 2026-10-17).
- Mock data YOK: uygulama sadece gerçek OKX demo / Fuji / audit verisi gösterir; fixture'lar sadece `tests/`.
- Arayüzde emoji, gradient, glow YOK; görsel kurallar `DESIGN.md`.
- Güvenlik kuralları LLM'e/prompt'a değil koda dayanır; LLM'e ham bakiye/ID/adres gitmez.
- `policy.json` değişirse `npm run policy:set-hash` ile zincire yaz; yoksa guardian işlem açmaz.
- Yeni ATK tool'u kullanacaksan önce `src/upstream/atkClient.ts` allowlist'ine ekle ve gerçek şemayı doğrula.
- Kural sırası: zincir → statik (kaldıraç/SL/TP) → veriye bağlı (fiyat/bakiye/limit). Bkz. LEARN L-003.

## Görev bitiş kontrol listesi
1. `npm test` ve `npm run typecheck` geçti mi?
2. İlgili `docs/` dosyası güncellendi mi?
3. Bu dosyada **Güncel durum** ve **Son güncelleme** güncellendi mi?
4. Hata yaptıysan `LEARN.md`'ye kural eklendi mi? (Stop hook `docs:check` çalıştırır.)

## Güncel durum
- Jüri hazırlığı (2026-10-17): demo:check harici MCP/piyasa/anahtar iptalini doğrular; --trade tek küçük demo önerisi. 124/124 birim, 7/7 canlı entegrasyon, typecheck/build geçti. OKX 54092 yeniden üretildi; docs/JURY_READINESS.md açık koşulları listeler.
- Tamamlanan: guardian çekirdeği, 7 tool, maskeleme + ekranda maske açma, kural motoru, sanitize + Haiku karantinası,
  ATK MCP istemcisi (tool adları gerçek pakette doğrulandı), Opus 5.5 sohbet/otonom host, SQLite, audit hash zinciri +
  Merkle + anchor, Fuji kontratları (8 forge testi), siyah-beyaz arayüz (ortalanmış çerçeve, fareyle aydınlanan ızgara), saldırı sayfaları, attack-replay, docs sistemi.
- Ajan: Groq varsayılan (`openai/gpt-oss-120b`, karantina `gpt-oss-20b`); sohbet kutusunun sağ üstündeki seçiciden Gemini/Codex (anahtar varsa).
- Kullanıcı PC'sinde (Windows) canlı doğrulandı: 65/65 birim, 8/8 forge (Foundry 1.8.5 kuruldu), 7/7 entegrasyon, attack:replay 9/9,
  Fuji deploy + policy eşleşmesi + anchor + `audit:verify` DOĞRULANDI, kill-switch pause → `PAUSED_ONCHAIN` → unpause,
  otonom tur (Groq), B modu `.mcp.json` (7 tool listelendi).
- Açık: OKX emirleri artık `54092` ile reddediliyor (2026-10-17; `50123` yetki hatası geçti): OKX demo Web/App'te Spot/TradFi işlem
  sayfasındaki feragatname onaylanmalı. Sonra gerçek emir + demo provası.
- `.env` git dışıdır; PC'de OKX üçlüsü + GROQ_API_KEY dolu, LLM_PROVIDER=groq; ANTHROPIC_API_KEY boş, GEMINI_API_KEY yok.
- Injection sıkılaştırma: bayraklı karantina öğesi kodda nötrlenir (`neutralizeFlagged`), sohbet girdisi sanitize edilir
  (kodlu içerik → `CHAT_INPUT_BLOCKED`), policy v2: taint (web/haber sonrası 15 dk her öneri onaya) + kural 13
  `SIGNAL_NOT_CONFIRMED` (yön EMA/RSI ile doğrulanmalı).
- Policy v3 Fuji'de (2026-10-17): `intentCommit` → her emir öncesi IntentGate (0x4dd6528f745cfe5c0fc8a5939b674d75b1ff529c, `.env` INTENT_GATE_ADDRESS)
  kaydı, kill-switch zincirde atomik; `approvalFor: web_or_flagged` → temiz haberli otonom tur limit içinde onaysız. Kill-switch ölçümü 3,6 sn.
- Servis kapısı (:7072): uzak MCP + planlar (Sandbox/Pro/Desk) + kanıt paneli (web/public.html). Canlı duman testi geçti. 90/90 birim, 13/13 forge.
- ATK uyumlu kapı (2026-10-17, policy v4 `compat`): okx-trade-mcp için yazılmış ajan sadece URL değiştirir; emirler `Guardian.proposeIntent`ten geçer,
  transfer/çekim yok, hesap okuma varsayılan kapalı (`accountReads: "deny"`). Policy v4 Fuji'de (tx 0x859b25fb…d174).
- Policy v5 (`contentReads: "sanitized"`): haber/web taranmış metin olarak gider, bayraklıysa metin gitmez; kapıya `read_url` + `inspect_prompt`
  eklendi; `READ_URL_ALLOWLIST=*` desteği. 105/105 birim. `accountReads: "raw"` kullanıcı isteği ama izin denetimi engelledi: kullanıcı kararı bekliyor.
  Canlı (data/smoke.db): gerçek ATK şemaları, transfer/50x/500 USDT reddi, 5 USDT emri kurallardan geçti + IntentGate kaydı (2,6 sn) → OKX 54092.
- Kişisel hesaplar (2026-10-17): e-posta hesabı + kullanıcının kendi OKX demo anahtarı → kullanıcı başına Guardian (ayrı DB/vault/limit/ATK, boş HOME). Audit kökleri kullanıcılar için zincire yazılmaz (AuditAnchor tek akış). Gerçek Supabase kullanıcısıyla uçtan uca deneme bekliyor.
- Yapılacak: çalışan `npm run dev` yeniden başlatılmalı (eski süreç v3 okur → POLICY_HASH_MISMATCH; `/atk` de yeniden başlatınca gelir); guardian kapalıyken `npm run attack:replay`.

## Son güncelleme
2026-10-17 · Emir ACK doğrulaması ve OKX_DISCLAIMER_REQUIRED; demo-check, kriter kanıt tablosu, sunum/Q&A ve güvenli demo senaryosu. Çalışan sunucuda v5 eşleşmesi doğrulandı; yeni backend kaynakları henüz yeniden başlatılmadı.
2026-10-17 · Sohbette URL → `read_url`: SYSTEM_PROMPT güncellendi (src/chat/host.ts; Groq localhost sayfalarını tool çağırmadan reddediyordu, LEARN L-018, docs/llm.md); 115/115 birim. Öncesi: README.md güncel duruma göre baştan yazıldı (beş katman, 7 tool, kurallar, kontratlar, A/B/C/D modları, kurulum, saldırı tablosu). Öncesi: Mimari anlatım kararı (kod değişmedi): maskeleme/tokenizasyon çekirdek, kurallar emniyet kemeri; transfer yok, tutar `size_pct` kalır
(docs/masking.md "Çekirdek ilke", docs/PITCH.md). Öncesi: E-posta girişinden sonra doğrudan panel; OKX bağlı değilse panel içinde bağlama formu (web/src/pages/LinkOkx.tsx). Öncesi: Kişisel hesaplar: kayıt olan kullanıcı kendi OKX demo anahtarını bağlar, kendi Guardian'ının gerçek paneline girer (src/tenants/, src/runtime.ts, docs/tenants.md; 115/115 birim). Öncesi: Google girişi kaldırıldı, e-posta + şifre ile Giriş yap / Kayıt ol (web/src/Accounts.tsx, docs/accounts.md). Öncesi: Arayüzde MCP sayfası (web/src/pages/Connect.tsx: anahtar oluştur/iptal, kopyalanabilir komut, kullanım; `/api/service`), PUBLIC_URL. Öncesi: Uzak MCP/stdio: MCP `instructions` ile maskeli değerler için yerel panele yönlendirme (src/mcpServer.ts `ownerPanel`, docs/service.md). Öncesi: ATK uyumlu kapı (src/compat/, docs/compat.md, `/atk`, `mcp:atk`, policy v4). Öncesi: MCP servis kapısı (src/service/, docs/service.md, iş modeli), IntentGate + policy v3, kill-switch ölçümü, herkese açık kanıt paneli, otonom tur butonu. Öncesi: Model seçici üst bardan sohbet kutusunun sağ üstüne taşındı (web/src/components/ModelPicker.tsx); docs/service.md eklendi. Öncesi: Policy v2 (taint + kural 13), bayraklı içerik nötrleme, sohbet girdisi sanitize; docs/policy.md, docs/quarantine.md, docs/masking.md. Öncesi: Arayüzden model seçimi (src/chat/switch.ts), Groq gpt-oss, siyah-beyaz + ızgara arayüz, .mcp.json, canlı doğrulamalar. Öncesi: Sohbet ikonu hep görünür, LLM yoksa ChatOff.
