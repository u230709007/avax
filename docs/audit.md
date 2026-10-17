# Audit — hash zinciri, Merkle, anchor

## Amaç
Guardian'ın her kararını değiştirilemez ve zincirde doğrulanabilir biçimde kaydetmek.

## Dosyalar
`src/audit/log.ts`, `src/audit/merkle.ts`, `src/audit/anchorer.ts`, `src/store/db.ts`, `scripts/verify-audit.ts`.

## Akış
- Kayıt: `seq, ts, source(llm|human|system), tool, input(maskeli), outcome, code, detail, prev_hash, hash`.
- `hash = keccak256(prev_hash | kanonik JSON)`; kanonik JSON anahtarları sıralar. Açılışta `verifyChain()`; bozuksa guardian başlamaz.
- Merkle: yapraklar = kayıt hash'leri; tek kalan yaprak kendisiyle eşlenir. `proofFor(seq, from, to)`.
- Anchor: kontratın `nextSeq`'inden son kayda kadar (en fazla 256) kök → `AuditAnchor.anchor` → SQLite `anchors`.
- Doğrulama: arayüz "Zincirde doğrula" → `/api/verify/:seq` → zincirdeki kök ile yerel kanıt karşılaştırılır.
- SQLite tabloları: `audit`, `fills` (24s hacim/rate-limit), `approvals`, `anchors`, `vault`, `kv` (gün başı değer, otonom mod).

## Kurallar / sınırlar
- Maskeleme ihlalinde ham girdi yazılmaz.
- Kalıcı durum restart'ta sıfırlanmaz (limit bölme saldırısı restart ile aşılamaz).

## Nasıl test edilir
`tests/unit/audit.test.ts`, `npm run audit:verify -- <seq>`.

## Son güncelleme
2026-10-16 · ilk sürüm.
