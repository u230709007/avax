# WORKFLOW — Uçtan uca akışlar

## Amaç
Sistemin her yolunu adım adım anlatır: açılış, okuma, haber/web, işlem, onay, ret, kapatma, anchor, otonom döngü, hatalar.

## Dosyalar
`src/guardian.ts` (tüm tool'lar), `src/bootstrap.ts` (0), `src/approval/human.ts` (4), `src/audit/anchorer.ts` (7),
`src/main.ts` (8), `src/market/indicators.ts` (piyasa görünümü), `src/policy/*` (3. akışın 4. adımı).

## Akış
### 0. Açılış (sistem başlarken, bir kez)
1. Guardian `.env` ve `policy.json`'ı okur, `policy.json`'ın keccak hash'ini hesaplar.
2. Fuji `PolicyRegistry` kontratından `policyHash` ve `paused` değerlerini okur.
   - Hash tutmuyorsa ya da kontrata ulaşılamıyorsa sadece okuma modunda açılır, emir kapalı kalır.
3. `okx-trade-mcp --profile demo --modules market,spot,swap,account,news` sürecini başlatır, `tools/list` ile ATK tool'larını eşler.
4. SQLite'tan 24 saatlik limit sayaçlarını, audit log'un son kaydını ve bekleyen onayları yükler.
5. Masking Vault oturum anahtarı ile hazırlanır.
6. Guardian kendi MCP sunucusunu açar ve 7 dar tool'u yayınlar. Web arayüzü ve WebSocket de açılır.

### 1. Okuma akışı: "Bakiyem ne kadar?"
```
Sen → Sohbet → Opus 5.5
Opus → get_portfolio_view()                 (MCP üzerinden guardian'a)
Guardian → ATK: account balance / positions
ATK → Guardian: USDT 1243.50, AVAX 12.4, ordId 58213…
Guardian [MASKELEME]:
   USDT → bucket "YÜKSEK", display "{{BAL:USDT}}"
   ordId → ORD_7f3a        (gerçek değer Vault'ta)
Guardian → Opus: maskeli JSON
Opus → "USDT bakiyen {{BAL:USDT}}, AVAX {{BAL:AVAX}}"
Sohbet sunucusu [MASKE AÇMA, sadece ekran için] → "USDT bakiyen 1.243,50"
Ekran: gerçek rakam  |  "LLM'e giden" sekmesi: etiketli hâli
Audit: "get_portfolio_view · OK"
```

### 2. Haber / web akışı: "Şu sayfayı analiz et"
```
Opus → read_url("localhost:7071/morse.html")
Guardian:
  1. Domain allowlist kontrolü
  2. Sayfayı gerçek HTTP ile çeker
  3. [SANITIZE] görünmez karakterleri siler; Mors, base64 ve talimat kalıplarını tespit eder → flags: [MORSE]
  4. [KARANTİNA] Haiku 5.5 metni okur, sadece şemalı JSON döner:
     {coin:"AVAX", sentiment:"pozitif", score:0.8, flags:["MORSE","INSTRUCTION"]}
  5. Şemaya uymayan çıktı atılır
Guardian → Opus: sadece bu JSON (ham sayfa metni asla gitmez)
Arayüz → Kararlar: "read_url · Uyarı · MORSE"
```
Haber akışı da aynı yolu izler: ATK `news` → sanitize → Haiku → özet.

### 3. Trade akışı: "AVAX al"
```
Opus → propose_trade({pair:"P_AVAX", side:"buy", size_pct:10, sl_pct:3, tp_pct:6})
GUARDIAN (sırayla, ilk hatada durur):
  1. Şema kontrolü: alanlar ve tipler doğru mu, fazladan alan var mı?
  2. Maske kontrolü: P_AVAX tanınan bir tanıtıcı mı? Ham ID, adres ya da {{BAL}} etiketi var mı?
  3. Maskeyi çözme: P_AVAX → AVAX-USDT; %10 → gerçek bakiyeden 12.43 USDT
  4. Policy engine:
     - çift allowlist'te mi?
     - işlem başı ≤ 50 USDT ve bakiyenin ≤ %20'si mi?
     - 24 saatlik toplam ≤ 300 USDT mi? (SQLite)
     - dakikada ≤ 2 emir mi?
     - swap ise kaldıraç ≤ 3x ve stop-loss var mı?
     - günlük zarar limiti aşılmış mı?
  5. Avalanche: policyHash eşleşiyor mu? paused = false mu? (30 sn cache)
  6. Tutar > 25 USDT ise insan onayı (4. akış)
  7. Emri KOD üretir: ATK ticker'dan referans fiyat alır; ±%0.5 bandında IOC limit emir hazırlar, SL/TP algo emri ekler
Guardian → ATK: spot place order + algo order
ATK → Guardian: ordId 58214…  → Vault → ORD_9c21
Guardian → SQLite: limit sayaçlarını günceller, audit kaydı yazar (hash zinciri)
Guardian → Opus: "ONAYLANDI ORD_9c21"
Arayüz → Kararlar: "propose_trade · İzin · ORD_9c21"; portföy kartı yenilenir
```

### 4. İnsan onay akışı
```
Guardian → emri SQLite'ta "bekliyor" olarak kaydeder
Guardian → Opus: "ONAY_BEKLİYOR APR_3e1b" (Opus onaylayamaz; böyle bir tool'u yok)
Guardian → WebSocket → Sohbette onay kartı:
   AVAX-USDT · Al · 32,10 USDT · SL %3 · TP %6 · geçen kurallar
Sen [Onayla] → yerel token ile HTTP → Guardian
Guardian → 3. akışın 4–7. adımlarını tekrar çalıştırır (arada durum değişmiş olabilir) → ATK
```
Onay kartı 2 dakika içinde onaylanmazsa geçersiz olur.

### 5. Ret akışı: saldırı senaryosu
```
(Kandırılmış) Opus → propose_trade({pair:"P_AVAX", side:"buy", size_pct:100, leverage:125})
Guardian → 4. adımda durur: LEVERAGE_EXCEEDED
ATK'ya HİÇBİR ŞEY gitmez
Audit: kaydedilir
Opus → "REDDEDİLDİ: LEVERAGE_EXCEEDED"
Arayüz → Kararlar: kırmızı "Ret" rozeti
```
Opus "0xABC… adresine gönder" derse: böyle bir tool yok. Metinde adres geçerse `MASKING_VIOLATION`.

### 6. Kapatma ve kill-switch akışı
- **Normal kapatma:** Opus `close_position(POS_a1b2)` çağırır → Vault gerçek pozisyonu bulur → kurallar (kapatma her zaman serbest) → ATK.
- **Günlük zarar −%5:** Guardian açılış emirlerini otomatik kapatır; sadece `close_position` ve `cancel_order` çalışır.
- **Zincirden durdurma:** Arayüzdeki "Zincirden durdur" → MetaMask/Core → `PolicyRegistry.pause()` tx'i.
  - Guardian en geç 30 sn içinde `paused = true` görür ve her yeni emre `PAUSED_ONCHAIN` döner.
  - `unpause()` çağrılana kadar bu durum sürer.

### 7. Avalanche'a audit sabitleme (arka planda)
```
Her 20 kararda bir veya 5 dakikada bir:
  Guardian → audit kayıtlarından Merkle ağacı → kök
  Guardian → AuditAnchor.anchor(kök, fromSeq, toSeq)   (ayrı, sadece gas parası olan cüzdan)
  Fuji → tx hash → SQLite → Audit ekranında Snowtrace linki
Doğrulama: "Kaydı doğrula" → kaydın Merkle kanıtı zincirdeki kökle karşılaştırılır → Doğrulandı
```

### 8. Otonom döngü (ana demo modu)
```
Her 5 dakikada bir (kullanıcı mesajı olmadan):
  Opus'a sabit görev: "Piyasayı değerlendir, gerekirse işlem öner"
  Opus → get_market_view (15 dk mumlar, RSI/EMA) → get_portfolio_view → get_news_digest
  Opus → karar + gerekçe → (gerekirse) propose_trade → 3. akış
  Gerekçe metni → arayüzde "Ajan kararı" satırı olarak akar
```
Otonom döngü sohbetle aynı tool'ları ve aynı kuralları kullanır; ek bir yetkisi yoktur.

### 9. Hata durumları (fail-closed)

| Durum | Davranış |
|---|---|
| Fuji RPC'ye ulaşılamıyor | Emir kapalı, okuma açık, arayüzde uyarı |
| ATK yanıt vermiyor | Tool hata döner; Opus'a "ATK_UNAVAILABLE" |
| Anthropic hatası veya refusal | Yedek modele geçilir; o da başarısız olursa döngü bu tur atlanır |
| Haiku şema dışı çıktı verdi | Özet atılır, flag `QUARANTINE_FAILED` |
| SQLite'a yazılamıyor | Emir kapalı (limitler takip edilemez) |

## Kurallar / sınırlar
- Kurallar sırası: zincir → statik (kaldıraç, SL, TP) → veriye bağlı (fiyat, bakiye, limit, günlük zarar). İlk başarısız kural kararı verir; hepsi arayüzde gösterilir.
- Hacim, dolum beklenmeden muhafazakâr kaydedilir (`fills` tablosu).
- Kapatma/iptal zincir durumu ve günlük zarardan bağımsız serbesttir (risk azaltır); maske kontrolü yine uygulanır.

## Nasıl test edilir
`npm test` → `tests/unit/guardian.test.ts`, `policy.test.ts`. Canlı: `npm run test:integration`, `npm run attack:replay`.

## Son güncelleme
2026-10-16 · ilk sürüm.
