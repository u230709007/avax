# Hesap girişi ve ziyaretçi demosu

Ziyaretçi demosu yalnızca tarayıcıda örnek senaryolar gösterir; yönetici API'si, işlem motoru veya MCP anahtarı kullanmaz.
Kişisel hesap Supabase Auth ile e-posta + şifre kullanır (Giriş yap / Kayıt ol sekmeleri; `signInWithPassword`, `signUp`). Google girişi kapalıdır. Yönetici UI_TOKEN akışı bağımsızdır. Kişisel hesap oturumu yönetici API'lerine erişim sağlamaz.

## Kurulum
1. Supabase projesi oluştur. `web/.env.local` içine `web/.env.example` dosyasındaki URL ve publishable key alanlarını doldur. Service-role/secret anahtarını frontend'e koyma.
2. Auth URL Configuration içinde Site URL'yi asıl site adresine ayarla. Redirect URLs listesine `http://127.0.0.1:7070/` ve geliştirme için `http://127.0.0.1:5173/` ekle. Yayında yalnızca kullandığın HTTPS adreslerini ekle.
3. Email sağlayıcısını etkinleştir (Authentication → Providers → Email). "Confirm email" açıksa kayıttan sonra kullanıcı e-postadaki bağlantıya tıklar, sonra giriş yapar; kapalıysa kayıt doğrudan oturum açar. Minimum şifre uzunluğunu 8 yap. Gerçek kullanıcılara gönderim için kendi SMTP sağlayıcını yapılandır.
4. Google sağlayıcısını Supabase'de kapalı tut; arayüzde Google düğmesi yoktur.
5. `supabase/accounts.sql` dosyasını Supabase SQL Editor'de çalıştır. RLS kullanıcıların sadece kendi ajan taslaklarını görmesini/değiştirmesini sağlar.
6. `npm run web:build`. Vite geliştirme sunucusunu ortam değişkenleri değiştiyse yeniden başlat.

## Kapsam
Giriş yapan kullanıcı kendi OKX demo API anahtarını bağlar ve kendi Guardian'ının gerçek paneline girer: ayrı veritabanı, onaylar, limitler ve ATK süreci. Ayrıntılar: tenants.md. Yönetici MCP anahtarları ve zincir kill-switch'i yalnızca UI token ile kullanılır. `guardian_agents` taslak tablosu artık arayüzde kullanılmıyor.

## Doğrulama
Yerel demo ve yapılandırılmamış giriş durumu sağlayıcı olmadan test edilebilir. E-posta kayıt/giriş uçtan uca ve iki farklı kullanıcı ile RLS testleri gerçek Supabase projesi kurulduktan sonra tamamlanmalıdır. Yanlış şifre, doğrulanmamış e-posta, aynı e-postayla ikinci kayıt, çıkış, kullanıcı A'nın B kaydını okuyamaması/değiştirememesi kontrol edilmelidir.

Kaynaklar: https://supabase.com/docs/reference/javascript/auth-signup · https://supabase.com/docs/reference/javascript/auth-signinwithpassword · https://supabase.com/docs/guides/database/postgres/row-level-security

Ziyaretçi demosu DemoPanel.tsx ile gerçek Shell, Overview ve Decisions bileşenlerini kullanır. Örnek bakiye ve kararlar yereldir; API/WS bağlantısı açılmaz. Diğer sekmeler salt okunur panel önizlemesidir. readOnly karar ayrıntılarında zincir doğrulaması API çağrısını engeller.
