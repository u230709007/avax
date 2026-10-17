# ADR 006 — Sağlayıcıdan bağımsız LLM (Gemini / Anthropic)

- **Karar:** Karar ajanı ve karantina modeli `LLM_PROVIDER` ile seçilir; varsayılan Gemini (ücretsiz katman), Anthropic seçenek olarak kalır.
- **Neden:** Güvenlik LLM'e değil guardian koduna dayandığı için model değiştirmek güvenliği etkilemez; ücretsiz katman hackathon maliyetini sıfırlar.
- **Değerlendirilen alternatifler:** Sadece Anthropic API (ücretli), sadece Claude Code/Desktop B modu (kendi arayüzümüz ve otonom döngü olmadan).
- **Tarih:** 2026-10-17
