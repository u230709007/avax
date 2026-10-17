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

## Kurallar / sınırlar
- Fiyatlar maskelenmez (karar için gerekli, hassas değil).
- B modunda (Claude Desktop) LLM metni değiştirilemez; kullanıcı gerçek değerleri :7070 panelinde görür.

## Nasıl test edilir
`tests/unit/vault.test.ts`, `tests/unit/guardian.test.ts` ("portföy görünümü gerçek bakiye içermez", "gösterim etiketleri sadece ekranda").

## Son güncelleme
2026-10-16 · ilk sürüm.
