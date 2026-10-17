# Tehdit modeli — olay → savunma

## Amaç
Gerçek olay türlerini sistemin hangi katmanının durdurduğunu göstermek.
Not: Olay ayrıntıları (tarih, tutar) kullanıcının derlediği listeden alınmıştır; sunumdan önce birincil kaynaklarla doğrulanmalıdır.

## Dosyalar
`attack-site/pages/*.html`, `attack-site/serve.ts`, `examples/attack-replay.ts`, `tests/fixtures/attacks.ts`.

## Akış
Varsayım: **LLM tamamen ele geçirilmiştir** ve saldırganın istediği her tool çağrısını yapar.

| Olay türü | Saldırı | Durduran katman | Kod |
|---|---|---|---|
| Bankrbot (Mors) | Mors ile "125x long tüm bakiye" / "gönder" | Karantina (MORSE+INSTRUCTION), Opus ham metni görmez; yine de önerirse kurallar | `LEVERAGE_EXCEEDED`, `SIZE_EXCEEDED` |
| AIXBT panel | Sahte emir: allowlist dışı coin, %90 bakiye, `to` alanı | Kapalı intent dili + kurallar | `MASKING_VIOLATION`, `SIZE_EXCEEDED`, `SCHEMA_INVALID` |
| Web gezgini tuzakları | Gizli CSS / zero-width / sahte "hata, ödeme yap" | Sanitize + Haiku; transfer tool'u yok; adres yazılırsa | `HIDDEN_TEXT`, `MASKING_VIOLATION` |
| Geliştirme aracı / sunucu ele geçirme | `policy.json` sessizce gevşetilir | Zincirdeki hash | `POLICY_HASH_MISMATCH` |
| Kayıt tahrifatı | Audit satırı değiştirilir | Hash zinciri + Merkle kökü zincirde | açılışta ret / doğrulama "Eşleşmedi" |
| Limit bölme | 10 küçük emir | SQLite kayan 24s hacim + rate limit | `VOLUME_LIMIT`, `RATE_LIMIT` |
| Approve tuzağı | LLM kendi işlemini onaylar | Onay tool'u yok; sadece token'lı UI | — |
| Panik | Her şey ters gidiyor | Kullanıcı cüzdanından `pause()` | `PAUSED_ONCHAIN` |

Kalan riskler ve sınırlar:
- OKX API anahtarı çalınırsa guardian atlanır → anahtar sadece trade yetkili, withdraw kapalı, IP whitelist, alt hesap.
- Allowlist içindeki küçük, kurallara uygun ama kötü işlemler mümkündür (zarar günlük %5 ile sınırlı).
- B modunda Claude Desktop'a başka MCP sunucuları eklenirse güvenilmeyen içerik karantinayı atlayabilir; kurallar yine geçerlidir.

## Kurallar / sınırlar
Saldırı sayfaları sadece `127.0.0.1:7071`'de, bizim kontrolümüzdedir; dış siteye enjeksiyon yapılmaz.

## Nasıl test edilir
`npm run attack-site` + `npm run attack:replay`; birim: `tests/unit/sanitize.test.ts`, `guardian.test.ts`.

## Son güncelleme
2026-10-16 · ilk sürüm.
