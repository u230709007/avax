# ARCHITECTURE — Mimari

## Amaç
LLM tamamen ele geçirilmiş sayılsa bile kullanıcının parasının çıkamaması. Güvenlik LLM'e değil koda ve Avalanche'a dayanır.

## Dosyalar
`src/bootstrap.ts`, `src/mcpServer.ts`, `src/guardian.ts`, `src/tools.ts`, `src/main.ts`, `src/mcpStdio.ts`, `src/server.ts`, `src/service/gateway.ts`.

## Akış
```
Kullanıcı ──sohbet──► LLM (Opus 5.5; A: bizim host, B: Claude Desktop/Code)
                        │ MCP tools/call (7 dar tool)
                        ▼
                 GUARDIAN MCP SUNUCUSU ── Vault (maskeleme) · Policy engine · Approvals · AuditLog (SQLite)
                        │ MCP stdio                          │ haber/web               │ zincir
                        ▼                                    ▼                         ▼
                 okx-trade-mcp (--demo) ─► OKX         sanitize → Haiku 5.5      Fuji: PolicyRegistry, AuditAnchor
```
Beş katman (savunma derinliği):
1. **Opak tanıtıcılar (maskeleme)** — LLM gerçek bakiye/ID/adres görmez. `docs/masking.md`
2. **Kapalı intent dili** — 7 tool; transfer/withdraw yok; sıkı Zod şeması. `docs/policy.md`
3. **Dual-LLM karantina** — güvenilmeyen metni sadece araçsız Haiku okur; Opus şemalı özet görür. `docs/quarantine.md`
4. **Deterministik policy engine** — limitler, kaldıraç, SL, fiyat bandı, günlük zarar, insan onayı. `docs/policy.md`
5. **Zincir üstü kanıt ve kapı** — policy hash + kill-switch + her emir öncesi IntentGate kaydı + audit Merkle kökü Avalanche'ta. `docs/avalanche.md`

İki çalışma modu aynı guardian'ı kullanır:
- **A (ana demo)**: `npm run dev` — web arayüzü + Opus 5.5 host (InMemory MCP ile guardian'a bağlı) + otonom döngü.
- **C (servis)**: `npm run dev` ile birlikte servis kapısı (`PUBLIC_PORT`, vars. 7072): uzak MCP `/mcp` (API anahtarı + plan kotası) ve herkese açık kanıt paneli. `docs/service.md`.
- **D (ATK uyumlu kapı)**: `/atk` veya `npm run mcp:atk` — okx-trade-mcp için yazılmış ajan aynı tool adlarıyla bağlanır, emirler aynı guardian'dan geçer. `docs/compat.md`.
- **B**: `npm run mcp` — Claude Desktop/Code guardian'ı stdio MCP sunucusu olarak başlatır; gerçek değer paneli aynı süreçte :7070.

## Kurallar / sınırlar
- Tek giriş noktası guardian MCP sunucusudur; argümanlar MCP katmanında atılmaz, guardian doğrular ve audit'e yazar.
- ATK sürecine sadece gerekli ortam değişkenleri geçer (Anthropic anahtarı, cüzdan anahtarı geçmez).
- Fail-closed: zincir/ATK/DB okunamazsa yazma kapanır, okuma devam eder.
- Kararlar: `docs/decisions/`.

## Nasıl test edilir
`npm test`, `npm run attack:replay`, `docs/testing.md`.

## Son güncelleme
2026-10-17 · C modu (servis kapısı), IntentGate katmanı. Öncesi: 2026-10-16 ilk sürüm.
