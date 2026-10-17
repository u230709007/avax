# Doküman dizini

Önce kökteki `CLAUDE.md` (harita) ve `LEARN.md` (dersler). Görsel kurallar: kökteki `DESIGN.md`.

- [ARCHITECTURE](ARCHITECTURE.md) — beş katman, iki çalışma modu, fail-closed
- [WORKFLOW](WORKFLOW.md) — açılış, okuma, haber/web, işlem, onay, ret, kapatma, anchor, otonom döngü, hatalar
- [ATK entegrasyonu](atk-integration.md) — okx-trade-mcp, allowlist, LLM'e açık 7 tool
- [LLM](llm.md) — sağlayıcı seçimi (Gemini / Anthropic), karar ajanı, karantina, API ayarları
- [Maskeleme](masking.md) — Vault, tanıtıcılar, kovalar, ekranda maske açma
- [Karantina](quarantine.md) — sanitize, Mors/gizli metin, Haiku şeması
- [Policy](policy.md) — intent dili, kurallar ve ret kodları, emir üretimi
- [Avalanche](avalanche.md) — PolicyRegistry, AuditAnchor, kill-switch, deploy
- [Audit](audit.md) — hash zinciri, Merkle, anchor, SQLite
- [UI](ui.md) — ekranlar, API, veri kaynakları
- [Tehdit modeli](threat-model.md) — olay → savunma tablosu, kalan riskler
- [Test](testing.md) — birim, kontrat, entegrasyon, docs:check
- [Runbook](runbook.md) — kurulum, hata durumları, demo öncesi kontrol listesi
- [Demo senaryosu](DEMO_SCRIPT.md) — dakika dakika jüri demosu
- [Sunum](PITCH.md) — 6 sayfalık iskelet

Kararlar (ADR):
- [001 Şifreleme yerine maskeleme](decisions/001-maskeleme-sifreleme-yerine.md)
- [002 Deterministik guardian](decisions/002-deterministik-guardian.md)
- [003 Haiku karantina](decisions/003-haiku-karantina.md)
- [004 node:sqlite](decisions/004-node-sqlite.md)
- [005 strict tool kapalı](decisions/005-strict-tool-kapali.md)
- [006 Sağlayıcıdan bağımsız LLM](decisions/006-saglayici-bagimsiz-llm.md)
