# Sunum (6 sayfa)

## Amaç
Jüri sunumunun iskeleti.

## Dosyalar
`docs/DEMO_SCRIPT.md`, `docs/threat-model.md`, `docs/ARCHITECTURE.md`.

## Akış
1. **Problem** — AI trade ajanlarında LLM çıktısı doğrudan para hareketine dönüşüyor; LLM tabanlı "guardian" da aynı hileyle kandırılıyor.
2. **Gerçek olaylar** — Mors ile gizlenmiş talimat, sahte panel emirleri, web sayfasına gizli metin (kaynakları doğrula).
3. **Fikir** — Şifreleme değil maskeleme + kapalı yetenek: LLM gerçek veriyi görmez, sadece 7 dar tool ile öneri yapar; son sözü kod söyler.
4. **Mimari** — LLM → MCP → Guardian → ATK; Haiku karantina; Avalanche Proof of Guard (policy hash, kill-switch, audit Merkle).
5. **Canlı demo** — `docs/DEMO_SCRIPT.md`.
6. **Yol haritası** — zincir üstü harcama limitli akıllı hesap (on-chain fon yönetimi), çoklu ajan, TEE imzalayıcı, ATK skill olarak paketleme.

## Kurallar / sınırlar
Rakamlar sadece canlı sistemden; mock grafik yok.

## Nasıl test edilir
Prova.

## Son güncelleme
2026-10-16 · ilk sürüm.
