# ADR 003 — Dual-LLM karantina Haiku 5.5 ile

- **Karar:** Dual-LLM karantina Haiku 5.5 ile
- **Neden:** Güvenilmeyen metni sadece araçsız ve serbest metin çıktısı olmayan ucuz bir model okur; karar veren Opus ham metni hiç görmez.
- **Değerlendirilen alternatifler:** Sadece regex temizliği (anlamsal sınıflama yok); Opus'un ham metni okuması.
- **Tarih:** 2026-10-16
