# Sealed Intent Guardian

Prompt injection ile kandırılsa bile para kaybettiremeyen otonom AVAX trade ajanı.
OKX TR × Team1 Türkiye Agentic Hackathon — **OKX Agent Trade Kit (ATK)** + **Avalanche**.

```
Kullanıcı ─► LLM (Claude Opus 5.5) ─MCP─► GUARDIAN (deterministik kod) ─MCP─► okx-trade-mcp (ATK, --demo) ─► OKX
                ▲  sadece maskeli veri          │  maskele · kurallar · onay · emri KOD üretir
                │                               ├─► Haiku 5.5 karantina (haber/web → şemalı özet)
                └── 7 dar tool                  └─► Avalanche Fuji: policy hash · kill-switch · audit Merkle kökü
```

- LLM gerçek bakiye, emir ID'si, adres görmez: kova (DÜŞÜK/ORTA/YÜKSEK), `P_AVAX`, `ORD_xxxxxxxx`, `{{BAL:USDT}}`.
- LLM'in "transfer", "withdraw", ham `instId`/`sz` diye bir aracı yok. 7 tool: piyasa, portföy, haber, URL okuma, işlem önerisi, kapatma, iptal.
- Her öneri kod kurallarından geçer: allowlist, işlem/24s limit, kaldıraç ≤3x, zorunlu SL, fiyat bandı, günlük zarar, zincir durumu.
- Kural dosyasının hash'i ve kill-switch Avalanche'ta; her kararın Merkle kökü zincire yazılır ve Snowtrace'te doğrulanır.

## Hızlı başlangıç
```bash
npm install
npx okx config init            # OKX demo trading API anahtarı: sadece trade yetkisi, withdraw kapalı, IP whitelist
cp .env.example .env           # ANTHROPIC_API_KEY, VAULT_HMAC_KEY, UI_TOKEN, cüzdan anahtarları
npm run contracts:build && npm run deploy:fuji   # çıktıdaki adresleri .env'e yaz
npm run web:build
npm run dev                    # http://127.0.0.1:7070/?token=<UI_TOKEN>
npm run attack-site            # saldırı demosu sayfaları :7071
```
Ayrıntılı kurulum ve demo öncesi kontrol listesi: [docs/runbook.md](docs/runbook.md). Tüm dokümanlar: [docs/INDEX.md](docs/INDEX.md).

## Test
```bash
npm test                 # 60 birim test (kurallar, maskeleme, sanitize, guardian, audit, docs:check)
npm run test:integration # gerçek OKX demo + Anthropic + Fuji (.env gerekir)
forge test --use <solc>  # 8 kontrat testi
npm run attack:replay    # gerçek olay senaryoları tablosu
```
