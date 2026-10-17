# ADR 005 — Opus tool'larında strict:true kullanılmıyor

- **Karar:** Opus tool'larında strict:true kullanılmıyor
- **Neden:** Saldırı girdilerinin şema seviyesinde sessizce düzeltilmesi yerine guardian'a ulaşıp audit'e REJECTED olarak yazılması istenir; doğrulama guardian'da Zod ile yapılır.
- **Değerlendirilen alternatifler:** strict:true (API seviyesinde şema garantisi).
- **Tarih:** 2026-10-16
