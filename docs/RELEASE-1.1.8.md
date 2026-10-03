Ahir Book 1.1.8 (versionCode 49)

- İhyâ'nın mevcut kaydı korunarak 29 yeni dini kitap/cilt eklendi. Ed-Dürrü'l-Mensûr'un 15 cildi dahil kaynak sayfadaki 30 PDF indirildi ve doğrulandı.
- Kitaplar uygulama paketine dahil edilmez; kullanıcının İndir düğmesiyle GitHub Pages içerik sunucusundan alınır. Yeni dosyalarda SHA-256 doğrulaması uygulanır.
- Okuyucuya Kitap Bölümleri düğmesi ve soldan açılan içindekiler / yer imleri paneli eklendi. PDF outline ve fihrist bağlantıları, EPUB navigation ve Risale paketinin bölüm listesi desteklenir.
- Bildirim alıntıları, Risale'nin açıklamalı kelime etiketleri arasından da eşleştirilip renkle vurgulanır. Eski q parametreli bildirimler desteklenir.
- Boş/taranmış PDF sayfalarının sayfa numaraları korunur. Kaynağında bölüm bilgisi olmayan dosyalarda panel bunu belirtir.

Kontroller: Vitest; TypeScript + mobil Vite derlemesi; imzalı AAB ve APK derlemesi; gerçek Sözler paketinde vurgu/fihrist/yer imi, gerçek Mektûbât PDF'sinde içe aktarma ve bölüm bağlantısı kontrolü.

İçerik yayını: https://github.com/swietcherdps/ahir-book-content/pull/1
GitHub Pages mevcut koruma kuralı yalnız main dalından yayına izin verir. İçerik PR'ı birleştirildikten sonra Publish content catalog iş akışı collection=dini ile çalıştırılmalıdır. Mevcut 44 Risale kitabı hash doğrulamasıyla korunur. Yeni kitapların indirme URL'leri yayından önce kullanılamaz.

Android imzalama: mevcut keystore kullanılır. AHIR_KEYSTORE_PATH, AHIR_KEYSTORE_PASSWORD ve AHIR_KEY_PASSWORD ortam değişkenleriyle yapılandırılır; anahtar/parolalar repoya eklenmez.
