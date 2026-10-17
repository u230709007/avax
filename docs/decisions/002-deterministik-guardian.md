# ADR 002 — Son karar deterministik kodda

- **Karar:** Son karar deterministik kodda
- **Neden:** LLM tabanlı guardian aynı prompt injection ile kandırılabilir. Kurallar TypeScript'te, Object.freeze ile değişmez, hash'i zincirde.
- **Değerlendirilen alternatifler:** LLM-as-judge guardian (sadece ek sinyal olarak bile kullanılmadı).
- **Tarih:** 2026-10-16
