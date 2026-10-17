# CLAUDE.md — Sealed Intent Guardian

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
- `src/mcpStdio.ts` → (B) Claude Desktop/Code için stdio girişi → docs/runbook.md
- `src/server.ts` → Fastify API + WebSocket, 127.0.0.1 + token → docs/ui.md
- `src/config/` → `policy.json` yükleme, şema, hash → docs/policy.md
- `src/policy/` → intent şeması, kurallar, motor → docs/policy.md
- `src/masking/` → Vault: tanıtıcı, kova, gösterim etiketi, sızıntı tarama → docs/masking.md
- `src/ingest/` → sanitize: gizli metin/Mors/base64/unicode → docs/quarantine.md
- `src/llm/` → sağlayıcı seçimi, Anthropic + Gemini + Groq istemcileri, karantina → docs/llm.md, docs/quarantine.md
- `src/chat/` → AgentHost: Opus (host.ts) / Gemini (geminiHost.ts) / Groq (groqHost.ts) tool döngüsü, ekranda maske açma → docs/llm.md, docs/masking.md
- `src/upstream/` → ATK MCP istemcisi + tool allowlist + OKX tipleri → docs/atk-integration.md
- `src/chain/` → Fuji: PolicyRegistry okuma, AuditAnchor yazma → docs/avalanche.md
- `src/audit/` → hash zinciri, Merkle, anchor döngüsü → docs/audit.md
- `src/approval/` → insan onayı (sadece UI'dan) → docs/WORKFLOW.md
- `src/store/` → SQLite (node:sqlite): audit, limit sayaçları, vault → docs/audit.md
- `src/market/` → RSI/EMA → docs/WORKFLOW.md
- `contracts/src/` → PolicyRegistry.sol, AuditAnchor.sol → docs/avalanche.md
- `contracts/test/` → forge testleri → docs/testing.md
- `web/src/` → Stripe tarzı arayüz (React+Tailwind) → docs/ui.md, DESIGN.md
- `attack-site/` → gerçek saldırı sayfaları (7071) → docs/threat-model.md
- `scripts/` → derleme, deploy, policy hash, audit doğrulama, docs:check, hook'lar → docs/runbook.md
- `tests/unit/` → saf birim testler (fixture'lı) → docs/testing.md
- `tests/integration/` → gerçek OKX demo/Anthropic/Fuji → docs/testing.md
- `examples/` → attack-replay (jüri tablosu) → docs/threat-model.md

## Komutlar
- Kurulum: `npm install` · OKX: `npx okx config init` (demo profil, sadece trade yetkisi)
- Çalıştır: `npm run dev` (guardian+API :7070) · `npm run web` (arayüz :5173) · `npm run attack-site` (:7071)
- Claude Desktop modu: `npm run mcp`
- Test: `npm test` · `npm run test:integration` · `npm run typecheck` · `npm run docs:check`
- Kontrat: `npm run contracts:build` · `forge test --use <solc yolu>` · `npm run deploy:fuji` · `npm run policy:set-hash`
- Audit: `npm run audit:verify -- <seq>` · Saldırı tablosu: `npm run attack:replay`

## Değişmez kurallar
- GitHub'a push ve commit YOK (kullanıcı açıkça istemedikçe).
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
- Tamamlanan: guardian çekirdeği, 7 tool, maskeleme + ekranda maske açma, kural motoru, sanitize + Haiku karantinası,
  ATK MCP istemcisi (tool adları gerçek pakette doğrulandı), Opus 5.5 sohbet/otonom host, SQLite, audit hash zinciri +
  Merkle + anchor, Fuji kontratları (8 forge testi), Stripe tarzı arayüz, saldırı sayfaları, attack-replay, docs sistemi.
- Doğrulandı (yerel Anvil, chain-id 43113): deploy, policy hash eşleşmesi, kill-switch, anchor + zincirde doğrulama.
- Açık: OKX demo hesabı ve Anthropic ile canlı uçtan uca deneme (bu bulut ortamında OKX/Fuji ağı engelli, anahtar yok).
- Varsayılan sağlayıcı Groq (`LLM_PROVIDER=groq`, `GROQ_API_KEY`). Gemini ücretsiz kotası dolduğu için geçildi. Groq bu bulut ortamından engelli (proxy 403); host ve karantina sahte cevaplı birim testle doğrulandı, canlı deneme kullanıcı makinesinde.
- Gemini gerçek API ile doğrulandı: karantina (4 saldırı sayfası) ve ajan döngüsü (read_url, ret). Google API bu ortamdan erişilebilir; OKX/Fuji değil.
- Sıradaki adım: kullanıcının PC'sinde aynı `.env` + passphrase → `npm run test:integration` → Fuji deploy.

## Son güncelleme
2026-10-17 · Sohbet ekranında aktif model gösterimi. Groq sağlayıcısı (src/llm/groq.ts, src/chat/groqHost.ts), Gemini 429 ayrımı + yedek model, kill-switch ön kontrolleri.