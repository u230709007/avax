# Karantina — güvenilmeyen metin

## Amaç
Haber ve web sayfalarındaki gizli talimatların (Mors, gizli CSS, zero-width, unicode tag, base64) karar veren LLM'e hiç ulaşmaması.

## Dosyalar
`src/ingest/sanitize.ts` (deterministik, `sanitizeChatInput` dahil), `src/llm/quarantine.ts` (Haiku 5.5 / Gemini / Groq), `src/guardian.ts` (`readUrl`, `getNewsDigest`, `neutralizeFlagged`), `src/server.ts` (`/api/chat`).

## Akış
1. `read_url`: host allowlist (`READ_URL_ALLOWLIST`), 10 sn zaman aşımı, yönlendirme yok, sadece text/html/json, en fazla 2 MB.
2. `sanitize`: HTML → metin (sayısal entity'ler çözülür), gizli eleman içeriği ayrıca yakalanır, unicode tag ASCII'ye çözülür, zero-width silinir, NFKC; Mors/base64/hex çözülür; talimat ve adres kalıpları aranır.
   Bayraklar: `HIDDEN_TEXT, INVISIBLE_CHARS, UNICODE_TAGS, MORSE, BASE64, HEX_TEXT, INSTRUCTION, ADDRESS`.
3. Haiku 5.5 temiz metni okur, sadece şu şemayı döner: `{ items: [{ coin, sentiment, score, flags }] }` (serbest metin yok). Şema dışı → `QUARANTINE_FAILED`.
4. **Nötrleme** (`neutralizeFlagged`, kod): bayrağı olan her öğenin duygusu `neutral`, skoru `0` yapılır. Kandırılmış karantina modelinin sahte
   "positive 0.99" çıktısı karar LLM'ine ulaşmaz. Haberde bayraklar tüm makalelerden toplanır, yani tek kötü makale tüm özeti nötrler (bilinçli olarak temkinli).
   Model çıktısının ham hali (`rawItems`) sadece audit'te durur.
5. Karar LLM'i sadece bu JSON'u görür. Çözülmüş gizli içerik sadece audit detayında ve arayüz çekmecesinde görünür.

## Sohbet girdisi (`/api/chat`)
Kullanıcı güvenilirdir, yapıştırdığı içerik değildir. `sanitizeChatInput`:
- `UNICODE_TAGS`, `MORSE`, `BASE64`, `HEX_TEXT` → mesaj ajana hiç gitmez, `422 CHAT_INPUT_BLOCKED`; audit'e `REJECTED` + çözülmüş içerik yazılır.
- Görünmez karakterler silinir, EVM/Base58 adresleri `[adres gizlendi]` olur; diğer bayraklar `WARNING` olarak audit'e yazılır.
- `INSTRUCTION` sohbette engel değildir ("emri gönder" meşru istek); işlemi guardian kuralları ve UI onayı durdurur.
- B modunda (Claude Desktop) sohbet metni guardian'dan geçmez; bu katman sadece A modunda vardır.

## Okumadan sonra (taint)
`read_url` / `get_news_digest` taint penceresini başlatır (docs/policy.md, kural 13 ve `UNTRUSTED_CONTENT` onayı).
Karantina kandırılıp nötrlemeyi de atlatan bir duygu skoru taşınsa bile: işlem yönü piyasa verisiyle doğrulanmalı ve insan onaylamalıdır.

## Kurallar / sınırlar
- Bayraklar risk sinyalidir; güvenlik bunlara dayanmaz (kandırılmış Opus'un önerisini yine guardian kuralları durdurur).
- Haiku çağrısı başarısız olsa bile deterministik bayraklar korunur.

## Nasıl test edilir
`tests/unit/sanitize.test.ts` (fixture'lar + `attack-site/pages/*`, `sanitizeChatInput`), `tests/unit/guardian.test.ts` ("içerik maskeleme"), entegrasyon: karantina şema testi.

## Son güncelleme
2026-10-17 · bayraklı öğe nötrleme + sohbet girdisi sanitize.
