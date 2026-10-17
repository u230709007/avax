# LEARN.md — Hatalardan çıkan kurallar

Format (tek satır): `[L-NNN] KURAL: … — NEDEN: … — ALAN: … — TARİH (xN tekrar)`
- Ne zaman: test Claude'un varsayımı yüzünden kırıldıysa, kullanıcı bir hatayı düzelttiyse, komut/API yanlış kullanıldıysa.
- Tekrar: aynı alanda benzer kural varsa yeni satır açma; mevcut satırı güncelle, sayacı artır.
- Sınır: 120 satır veya 40 kural. Aşılınca SIKIŞTIR:
  1. En az 2 kez tekrarlanmış veya hâlâ kritik kuralları `CLAUDE.md` → "Değişmez kurallar"a tek satır taşı (en fazla 10; doluysa en eskisini düşür).
  2. Silinmiş koda ait veya artık geçersiz kuralları at.
  3. Bu dosyayı sil, bu başlık + format bölümüyle sıfırdan yaz; altına "Sıkıştırma: TARİH, N kural taşındı, M atıldı" notu düş.

Sıkıştırma geçmişi: henüz yok.

## Kurallar
[L-001] KURAL: Foundry'de `forge test --use <yerel solc>` kullan; solc'yi GitHub release'den indir — NEDEN: binaries.soliditylang.org bulut ortamında engelli, forge solc indiremedi — ALAN: contracts — 2026-10-16
[L-002] KURAL: HTML'yi düz metne çevirirken sayısal entity'leri (&#8203;, &#x200B;) çöz, SONRA görünmez karakter taraması yap — NEDEN: entity olarak yazılmış zero-width karakterler tespitten kaçtı (hidden.html testi) — ALAN: src/ingest — 2026-10-16
[L-003] KURAL: Kural motorunda statik intent kuralları (kaldıraç/SL/TP) veriye bağlı kurallardan (fiyat/bakiye) önce gelsin — NEDEN: OKX okunamayınca 125x saldırısı PRICE_UNAVAILABLE ile reddedildi, asıl sebep görünmedi — ALAN: src/policy — 2026-10-16
[L-004] KURAL: Bu bulut ortamında OKX ve Fuji'ye çıkış yok (proxy 403); zincir testleri için `anvil --chain-id 43113` kullan, OKX testlerini kullanıcı makinesine bırak — NEDEN: canlı istekler CONNECT 403 verdi — ALAN: tests/integration — 2026-10-16
[L-005] KURAL: ATK'yı her zaman `--demo` + `OKX_DEMO=1` ile başlat; API anahtarı yoksa ATK `~/.okx/bin/okx-auth` arar ve ENOENT verir — NEDEN: entegrasyon testinde okx-auth spawn hatası — ALAN: src/upstream — 2026-10-16
[L-006] KURAL: Native modül yerine Node 22 `node:sqlite` kullan — NEDEN: better-sqlite3 derleme gerektirir, hackathon makinesinde risk — ALAN: src/store — 2026-10-16
[L-008] KURAL: Scratch TypeScript betiklerinde top-level await için `.mts` uzantısı kullan — NEDEN: tsx `.ts` dosyasını proje dışında CJS derledi, ERR_REQUIRE_ASYNC_MODULE — ALAN: scripts — 2026-10-17
[L-009] KURAL: Bir sağlayıcının erişilebilirliğini varsayma, `curl` ile dene: bu ortamda Google API açık, OKX/Fuji kapalı — NEDEN: önceki 403'ler tüm dış ağın kapalı olduğu izlenimi verdi — ALAN: tests/integration — 2026-10-17
[L-010] KURAL: Süreç durdururken `pkill -f`/`pgrep -f` desenini `[s]rc/main.ts` gibi yaz ve pkill'i ayrı bir Bash çağrısında çalıştır — NEDEN: desen kendi bash komut satırıyla (aynı satırdaki `tsx src/main.ts` dahil) eşleşti ve kabuğu öldürdü (exit 144) — ALAN: scripts — 2026-10-17 (x2 tekrar)
[L-007] KURAL: Tablo hücrelerinde uzun kodları `table-fixed` + `truncate` ile sınırla, sayfayı 390px'te yatay taşmaya karşı ekran görüntüsüyle kontrol et — NEDEN: uzun bayrak listesi tabloyu ve mobil sayfayı taşırdı — ALAN: web/src — 2026-10-16
[L-011] KURAL: `useEffect` gövdesini her zaman süslü parantezle yaz, ifade döndürme (`useEffect(() => { x(); }, …)`) — NEDEN: yeni Chromium'da `scrollIntoView` Promise döndürüyor, React bunu cleanup sanıp çağırdı: "l is not a function", sohbet ekranı çöktü — ALAN: web/src — 2026-10-17
