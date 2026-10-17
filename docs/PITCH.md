# Sunum (8 sayfa)

## Amaç
Jüri sunumunun iskeleti.

## Dosyalar
`docs/DEMO_SCRIPT.md`, `docs/threat-model.md`, `docs/ARCHITECTURE.md`.

## Akış
1. **Problem** — AI trade ajanlarında LLM çıktısı doğrudan para hareketine dönüşüyor; LLM tabanlı "guardian" da aynı hileyle kandırılıyor.
2. **Gerçek olaylar** — Mors ile gizlenmiş talimat, sahte panel emirleri, web sayfasına gizli metin (kaynakları doğrula).
3. **Fikir** — Şifreleme değil maskeleme + kapalı yetenek: LLM gerçek veriyi görmez, sadece 7 dar tool ile öneri yapar; son sözü kod söyler.
   Çekirdek tokenizasyon (bankaların kart numarası yöntemi): Guardian borsadan gelen her gerçek veriyi etikete çevirir, geri dönüşte sadece
   kendi verdiği etiketi gerçek değere çevirir. Hacker'ın adresi Guardian'dan hiç geçmediği için etiketi yoktur, borsaya ulaşamaz.
   Kurallar emniyet kemeridir: maskeleme "nereye"yi korur, 125x kaldıraç veya sahte pump gibi "ne kadar/hangi işlem"i kurallar durdurur
   (docs/masking.md "Çekirdek ilke").
4. **Mimari** — LLM → MCP → Guardian → ATK; Haiku karantina; Avalanche Proof of Guard (policy hash, kill-switch, audit Merkle).
5. **Canlı demo** — `docs/DEMO_SCRIPT.md`. Jüri kanıt panelini kendi telefonundan açar (salt okunur, tünel URL'si).
6. **İş modeli** — Ürün: her trade ajanının önüne takılan güvenlik katmanı, **uzak MCP servisi** olarak (`docs/service.md`). Ajan OKX'e değil
   guardian'a bağlanır; OKX.AI'da servis olarak listelenebilir (`/mcp/info` katalog kartı). Hedef kullanıcı: AI ajanıyla trade eden bireyler,
   ajan geliştiricileri / OKX.AI yayıncıları, ajanlara kısıtlı yetki veren masalar. Gelir: Sandbox ücretsiz (5 korunan işlem/gün), Pro 29 $/ay/ajan,
   Desk 0,05 $/korunan işlem. Reddedilen saldırı ücretlendirilmez: müşteri sadece guardian'ın geçirdiği işlem için öder. Pazara hazırlık: anahtar,
   kota ve kullanım sayacı çalışıyor; faturalama ve çok kiracılı barındırma sıradaki adım.
7. **Neden Avalanche** — her emir öncesi niyet hash'i IntentGate'te kesinleşir (Fuji'de ölçülen ~4 sn, genel RPC); kill-switch önbelleksiz, bir sonraki
   blokta etkili (ölçülen 3,6 sn). Borsa emri `clOrdId` ile zincir kaydına bağlı. Alt-saniye kesinleşme olmadan her emre zincir kapısı koymak pratik olmazdı.
8. **Yol haritası** — C-Chain mainnet, çok kiracılı servis, zincir üstü harcama limitli akıllı hesap, TEE imzalayıcı, ATK skill olarak paketleme.

## Kurallar / sınırlar
Rakamlar sadece canlı sistemden; mock grafik yok.

## Nasıl test edilir
Prova.

## Son güncelleme
2026-10-17 · fikir: tokenizasyon çekirdek + kurallar emniyet kemeri. Öncesi: iş modeli (MCP servisi), neden Avalanche (IntentGate). Öncesi: 2026-10-16 ilk sürüm.
