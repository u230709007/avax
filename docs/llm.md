# LLM — modeller ve ayarlar

## Amaç
Karar ajanı ve karantina modeli seçimleri, API ayarları, system prompt.

## Dosyalar
`src/llm/provider.ts` (sağlayıcı seçimi), `src/llm/anthropic.ts`, `src/llm/gemini.ts`, `src/chat/host.ts` (AgentHost arayüzü, ortak MCP yardımcıları,
Opus döngüsü, SYSTEM_PROMPT, AUTONOMOUS_TASK), `src/chat/geminiHost.ts` (Gemini döngüsü), `src/llm/groq.ts` + `src/chat/groqHost.ts` (Groq, OpenAI uyumlu, düz fetch), `src/llm/quarantine.ts`.

## Sağlayıcı seçimi
`.env` → `LLM_PROVIDER=groq`, `gemini` veya `anthropic` (boşsa anahtarı olan: anthropic > groq > gemini). Üç host da aynı `AgentHost` arayüzünü ve aynı olayları kullanır;
tool'lar her iki durumda da sadece MCP üzerinden guardian'a gider. Güvenlik sağlayıcıdan bağımsızdır (ADR 006).

| Rol | Groq (varsayılan) | Gemini (ücretsiz katman) | Anthropic |
|---|---|---|---|
| Karar ajanı | `GROQ_MODEL` (varsayılan `openai/gpt-oss-120b`), OpenAI tarzı `tools`/`tool_calls`, geçmişe sadece role/content/tool_calls döner | `GEMINI_MODEL` (varsayılan `gemini-flash-latest`), function calling, model içeriği (düşünce imzaları dahil) aynen geri gönderilir | `claude-opus-5-5` |
| Karantina | `GROQ_QUARANTINE_MODEL` (varsayılan `openai/gpt-oss-20b`), `response_format: json_schema` (strict kapalı), sonuç Zod ile doğrulanır | `GEMINI_QUARANTINE_MODEL` (varsayılan `gemini-flash-lite-latest`), `responseMimeType: application/json` + `responseJsonSchema`, sonuç Zod ile yeniden doğrulanır | `claude-haiku-5-5` |
Groq hataları `classifyGroqError` ile aynı mantıkla ayrılır (mesajdaki TPD/RPD → günlük, TPM/RPM → dakikalık; bekleme `retry-after` veya "try again in"), karar modelinde 429'da `GROQ_FALLBACK_MODEL`'e geçilir, arayüze `describeGroqError` gider. Gemini hataları `classifyGeminiError` ile ayrılır: dakikalık 429 ve 5xx → sunucunun `retryDelay`'i kadar (en fazla 30 sn) bekleyip 3 deneme (`withRetry`); günlük 429 (`PerDay`) → tekrar denenmez. Karar modelinin kotası dolarsa `GEMINI_FALLBACK_MODEL`'e (varsayılan `gemini-flash-lite-latest`, ücretsiz katmanda kota model başınadır) geçilir (`withModelFallback`). Arayüze ham JSON değil `describeGeminiError` açıklaması gider. Ücretsiz günlük kota Pasifik gece yarısı (TR 10:00) sıfırlanır; otonom mod 5 dk aralıkla aynı kotayı tüketir.

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
2026-10-17 · Gemini sağlayıcısı eklendi; gerçek API ile karantina ve ajan döngüsü doğrulandı.
