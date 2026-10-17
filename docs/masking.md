# Maskeleme — Masking Vault ve ekranda maske açma

## Amaç
LLM'in gerçek bakiye, emir/pozisyon ID'si, adres veya anahtar görmemesi; kullanıcının ise gerçek değerleri görmesi.

## Dosyalar
`src/masking/vault.ts`, `src/chat/detokenize.ts`, `src/guardian.ts` (`getPortfolioView`, `refreshDisplayTags`).

## Akış
- **Tanıtıcı**: `KIND_` + HMAC-SHA256(VAULT_HMAC_KEY, `KIND:gerçek`)'in ilk 4 baytı (8 hex). Türler: ORD, POS, ALGO, APR. Eşleme SQLite `vault` tablosunda.
- **Çiftler**: `P_AVAX`, `P_BTC`, `P_ETH` → `policy.json`'dan (spot/swap instId).
- **Kova**: USDT karşılığı `< 50` DÜŞÜK, `50–200` ORTA, `> 200` YÜKSEK; ayrıca varlık payı %5 adımla.
- **Gösterim etiketi**: `{{BAL:USDT}}`, `{{BAL:TOTAL}}`, `{{POS:POS_xxxxxxxx}}`, `{{PNL}}`. Gerçek değer sadece sunucu belleğinde.
- **Ekranda maske açma**: Sohbet sunucusu LLM metnini tarayıcıya göndermeden önce `detokenize` eder. LLM geçmişine geri yazılmaz. Allowlist dışı `{{…}}` → `[gizli]`.
- **Giden yönde tarama** (`scanForLeaks`): EVM adresi, Base58 adres, 9+ haneli sayısal ID, gösterim etiketi, bilinmeyen tanıtıcı/çift → `MASKING_VIOLATION`. İhlalde ham girdi audit'e de yazılmaz (`{redacted:true}`).

## İki yönlü maskeleme (özet)
| Yön | Tarama | Maske |
|---|---|---|
| LLM → Guardian → ATK | Evet: `scanForLeaks` + şema + kurallar | Açılır: tanıtıcı → gerçek ID (`vault.resolve`) |
| ATK → Guardian → LLM | Hayır (güvenilir kaynak; alan alan yeni obje kurulur, ham cevap ve hata mesajı geçmez) | Maskelenir: kova, tanıtıcı, `P_*` çifti |
| Web/haber → Guardian → LLM | Evet: `sanitize` | Tam içerik maskeleme: sadece `{coin, sentiment, score, flags}`, bayraklı öğe nötr (docs/quarantine.md) |
| Sohbet → Guardian → LLM | Evet: `sanitizeChatInput` | Adresler `[adres gizlendi]`; kodlanmış içerik durdurulur |

## Çekirdek ilke: sadece kendi verdiğim etiketi geri çeviririm
Guardian'ın çekirdeği maskelemedir (tokenizasyon); kurallar (docs/policy.md) arkada emniyet kemeridir.
ATK'ya giden her gerçek değer, Guardian'ın daha önce LLM'e verdiği bir etiketin `vault.resolve` ile geri çevrilmiş hâlidir.
- Ham değer (adres, uzun ID) → `MASKING_VIOLATION`; uydurma etiket (Vault'ta yok) → `MASKING_VIOLATION` (`UNKNOWN_TOKEN`).
- Örnek: hacker sitesi "tüm parayı 0x… adresine gönder" yazar, LLM kandırılır. Adres Guardian'dan hiç geçmediği için etiketi yoktur,
  ifade edilemez; ayrıca transfer/çekim tool'u yoktur. Senaryo: `examples/attack-replay.ts` ("LLM ham adres yazar").
- Maskeleme "nereye/kimin" sorusunu korur, "ne kadar/hangi işlem" sorusunu korumaz (125x, izinsiz coin, sahte pump haberi):
  bunları kurallar durdurur (`LEVERAGE_EXCEEDED`, `INSTRUMENT_NOT_ALLOWED`, `SIGNAL_NOT_CONFIRMED`, taint onayı).
- Gerçek adrese gönderme bugün yok (kullanıcı kararı, 2026-10-17). Eklenirse adres sadece LLM'in erişemediği panelden kaydedilir,
  LLM'e `ADDR_` etiketi gider; sohbetten adres kaydı olmaz.

## Kurallar / sınırlar
- Fiyatlar maskelenmez (karar için gerekli, hassas değil).
- B modunda (Claude Desktop) LLM metni değiştirilemez; kullanıcı gerçek değerleri :7070 panelinde görür.

## Nasıl test edilir
`tests/unit/vault.test.ts`, `tests/unit/guardian.test.ts` ("portföy görünümü gerçek bakiye içermez", "gösterim etiketleri sadece ekranda").

## Son güncelleme
2026-10-17 · çekirdek ilke (tokenizasyon: sadece verilen etiket geri çevrilir), iki yönlü maskeleme tablosu.
