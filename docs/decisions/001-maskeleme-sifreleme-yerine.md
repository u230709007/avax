# ADR 001 — Şifreleme yerine maskeleme ve kapalı yetenek

- **Karar:** Şifreleme yerine maskeleme ve kapalı yetenek
- **Neden:** LLM'e veriyi şifreli vermek işe yaramaz: LLM çözebiliyorsa saldırgan da (Mors/base64) çözdürür, çözemiyorsa veriyle iş yapamaz. Bunun yerine opak tanıtıcı + kova + gösterim etiketi ve 7 dar tool.
- **Değerlendirilen alternatifler:** Uçtan uca şifreleme, FHE (LLM akıl yürütmesine uygulanamaz), sadece prompt ile koruma.
- **Tarih:** 2026-10-16
