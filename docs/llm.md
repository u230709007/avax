# LLM — modeller ve ayarlar

## Amaç
Karar ajanı ve karantina modeli seçimleri, API ayarları, system prompt.

## Dosyalar
`src/llm/provider.ts` (sağlayıcı seçimi), `src/llm/anthropic.ts`, `src/llm/gemini.ts`, `src/llm/groq.ts`, `src/chat/host.ts` (AgentHost arayüzü, ortak MCP yardımcıları,
Opus döngüsü, SYSTEM_PROMPT, AUTONOMOUS_TASK), `src/chat/geminiHost.ts` (Gemini döngüsü), `src/chat/groqHost.ts` (Groq döngüsü), `src/llm/quarantine.ts`.

## Sağlayıcı seçimi
`.env` → `LLM_PROVIDER=gemini`, `groq` veya `anthropic` (boşsa anahtarı olan: Anthropic → Gemini → Groq). Üç host da aynı `AgentHost` arayüzünü ve aynı olayları kullanır;
tool'lar her iki durumda da sadece MCP üzerinden guardian'a gider. Güvenlik sağlayıcıdan bağımsızdır (ADR 006).

| Rol | Gemini (varsayılan, ücretsiz katman) | Anthropic |
|---|---|---|
| Karar ajanı | `GEMINI_MODEL` (varsayılan `gemini-flash-latest`), function calling, model içeriği (düşünce imzaları dahil) aynen geri gönderilir | `claude-opus-5-5` |
| Karantina | `GEMINI_QUARANTINE_MODEL` (varsayılan `gemini-flash-lite-latest`), `responseMimeType: application/json` + `responseJsonSchema`, sonuç Zod ile yeniden doğrulanır | `claude-haiku-5-5` |
Groq: OpenAI uyumlu `https://api.groq.com/openai/v1/chat/completions`, SDK yok (fetch). Karar `GROQ_MODEL` (varsayılan `llama-3.3-70b-versatile`, function calling); karantina `GROQ_QUARANTINE_MODEL` (varsayılan `llama-3.1-8b-instant`, `response_format: json_object`, şema sistem mesajında, sonuç Zod ile doğrulanır).
Gemini ve Groq 429/5xx için üstel bekleme ile 3 deneme (`withRetry`). Ücretsiz katmanda istek kotası vardır; otonom mod 5 dk aralıkla çalışır.

## Akış
| Rol | Model | Ayar |
|---|---|---|
| Karar ajanı | `claude-opus-5-5` | `client.beta.messages.create`, `thinking: adaptive`, `output_config.effort: "medium"`, `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`, `tool_choice` verilmez (auto), system + son tool cache'li |
| Karantina | `claude-haiku-5-5` | `messages.parse` + `zodOutputFormat`, `effort: "low"`, tool yok, serbest metin alanı yok |
| Guardian | LLM yok | TypeScript kuralları |

- Tool döngüsü elle yazılmıştır (`ChatHost.run`): her `tool_use` MCP üzerinden guardian'a gider, sonuç `tool_result` olarak eklenir; en fazla 12 adım.
- `stop_reason`: `refusal` → kullanıcıya açıklama; `pause_turn` → devam; `tool_use` → tool çalıştır; diğer → bitir.
- Assistant içeriği (thinking blokları dahil) değiştirilmeden geri gönderilir.
- Sohbet modu kalıcı geçmiş; otonom tur her seferinde taze bağlam.
- Arayüz için `llm_traffic` olayı: LLM → guardian çağrıları ve guardian → LLM maskeli sonuçlar.

## Kurallar / sınırlar
- Güvenlik prompt'a dayanmaz; prompt sadece kullanılabilirlik içindir (etiket yazma, Türkçe, emoji yok).
- `strict: true` kullanılmıyor: guardian tüm girdiyi zaten doğruluyor ve saldırı girdilerinin audit'e düşmesi isteniyor (ADR 005).
- Tahmini maliyet: `response.usage` ile ölçülmeli; otonom mod 5 dk aralıkla.

## Nasıl test edilir
`npm run test:integration` → Haiku şema testi, Opus bakiye sorusunda `{{BAL:` etiketi ve trafikte gerçek bakiye olmaması.

## Son güncelleme
2026-10-17 · Groq sağlayıcısı eklendi (bulut ortamından api.groq.com engelli; canlı deneme kullanıcı PC'sinde).
