# Karantina — güvenilmeyen metin

## Amaç
Haber ve web sayfalarındaki gizli talimatların (Mors, gizli CSS, zero-width, unicode tag, base64) karar veren LLM'e hiç ulaşmaması.

## Dosyalar
`src/ingest/sanitize.ts` (deterministik), `src/llm/quarantine.ts` (Haiku 5.5), `src/guardian.ts` (`readUrl`, `getNewsDigest`).

## Akış
1. `read_url`: host allowlist (`READ_URL_ALLOWLIST`), 10 sn zaman aşımı, yönlendirme yok, sadece text/html/json, en fazla 2 MB.
2. `sanitize`: HTML → metin (sayısal entity'ler çözülür), gizli eleman içeriği ayrıca yakalanır, unicode tag ASCII'ye çözülür, zero-width silinir, NFKC; Mors/base64/hex çözülür; talimat ve adres kalıpları aranır.
   Bayraklar: `HIDDEN_TEXT, INVISIBLE_CHARS, UNICODE_TAGS, MORSE, BASE64, HEX_TEXT, INSTRUCTION, ADDRESS`.
3. Haiku 5.5 temiz metni okur, sadece şu şemayı döner: `{ items: [{ coin, sentiment, score, flags }] }` (serbest metin yok). Şema dışı → `QUARANTINE_FAILED`.
4. Opus sadece bu JSON'u görür. Çözülmüş gizli içerik sadece audit detayında ve arayüz çekmecesinde görünür.

## Kurallar / sınırlar
- Bayraklar risk sinyalidir; güvenlik bunlara dayanmaz (kandırılmış Opus'un önerisini yine guardian kuralları durdurur).
- Haiku çağrısı başarısız olsa bile deterministik bayraklar korunur.

## Nasıl test edilir
`tests/unit/sanitize.test.ts` (fixture'lar + `attack-site/pages/*`), entegrasyon: Haiku şema testi.

## Son güncelleme
2026-10-16 · HTML entity açığı kapatıldı (LEARN L-002).
