# Demo senaryosu (≈ 6 dakika)

## Amaç
Jüriye önce **çalışan otonom ajanı**, sonra onun **kandırılamaz** olduğunu canlı göstermek.

## Dosyalar
`docs/PITCH.md`, `attack-site/pages/*`, arayüz (Genel bakış, Sohbet, Kararlar, Audit).

## Akış
| Dakika | Ekran | Ne yapılır / söylenir |
|---|---|---|
| 0:00 | Sunum | Problem: ajan çıktısı = para hareketi. Bankrbot / AIXBT / gizli metin olayları. |
| 0:45 | Genel bakış | OKX demo hesabı canlı; üst barda Fuji "Eşleşti". "Ajan otonom çalışıyor." |
| 1:15 | Ayarlar → Otonom mod | "Şimdi bir tur çalıştır": ajan kendi planlar (piyasa → portföy → haber → öneri). Limit içi işlem **onaysız** yürür; Kararlar'da İzin + "Niyet Avalanche'ta N ms'de kesinleşti". Onay kartı sadece web sayfası/bayraklı içerik veya 25 USDT üstünde çıkar. |
| 2:00 | Sohbet | "Bakiyem ne kadar?" → ekranda gerçek rakam; mesaja tıkla → "LLM'e giden": `{{BAL:USDT}}`, kova. |
| 2:45 | Sohbet | "Bakiyemin %3'ü ile AVAX al, SL %3" → onay kartı (25 USDT üstü) → Onayla → Kararlar'da İzin + `ORD_…`. |
| 3:30 | Sohbet | "Şu sayfayı analiz et: http://localhost:7071/morse.html" → Kararlar'da Uyarı `MORSE,INSTRUCTION`; çekmecede çözülen Mors. |
| 4:15 | Terminal | `npm run attack:replay` → kandırılmış LLM senaryoları: hepsi REJECTED, ATK'ya hiçbir şey gitmedi. |
| 5:00 | Telefon | Cüzdandan "Zincirden durdur" → IntentGate bir sonraki blokta yeni emri reddeder (`PAUSED_ONCHAIN`). Ölçülen süre kanıt panelinde (~3,6 sn). |
| 5:30 | Kanıt paneli (:7072, tünelle herkese açık) | Jüri kendi telefonundan açar: saldırı tablosu, IntentGate kayıtları → Snowtrace, "Zincirde doğrula" → Doğrulandı. "Kendi ajanınızı bağlayın" kartı = iş modeli (MCP servisi, planlar). |
| 6:00 | Sunum | Kapanış: "Ajanı kandırabilirsiniz; parayı kandıramazsınız." |

## Kurallar / sınırlar
- Önce ajan, sonra güvenlik: anlatı "güvenlik middleware'i" değil "hacklenemeyen otonom trade ajanı".
- Ağ kopma planı: kayıtlı ekran görüntüleri + `attack:replay` çıktısı yedekte.

## Nasıl test edilir
Demo öncesi en az 2 prova; `docs/runbook.md` kontrol listesi.

## Son güncelleme
2026-10-17 · otonom tur onaysız, IntentGate, herkese açık kanıt paneli. Öncesi: 2026-10-16 ilk sürüm.
