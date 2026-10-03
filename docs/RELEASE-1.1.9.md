# Ahir Book 1.1.9 — versionCode 50

29 yeni kitap/cilt ayrı bir e-kitap klasörüne taşınmadan ana kütüphanede gösterilir. İhya'nın mevcut kaydı korunur. 75 hazır kitap için 36 özgün, dikey kapak tasarımı uygulamaya dahil edilmiştir; kapaklar kitap indirilmeden ve çevrimdışı da görünür. Cilt ve Osmanlıca sürüm rozetleri gösterilir.

İçe aktarılan PDF'lerde boş ilk sayfalar atlanıp kapak 900 piksel yükseklikte çıkarılır. EPUB'un gömülü kapağı doğrulanıp korunur. Kapağı olmayan ya da kapağı yüklenemeyen kitaplarda başlık ve yazarla yerel kapak oluşturulur.

İndirme adresleri bir kez kodlanır. HTTP hataları, dosya imzası ve varsa SHA-256 doğrulaması tamamlanmadan kitap kurulmaz. Dosya ve okuma sayfaları tek veritabanı işleminde kaydedilir. Katalog güncellemeleri eski kitap kimliklerini ve indirilmiş içeriği silmez. Bildirim bağlantıları kalıcı kaynak anahtarı taşır; indirilmemiş kitabın okuyucusunda indirme, eski eksik indekslerde yeniden hazırlama seçeneği vardır.

Önceki düzenlemeler: PDF/EPUB fihristinin korunması, üst düğmeyle açılan sol bölüm ve yer imi paneli, Risale bildirim alıntılarının kelime açıklamalarını koruyarak renkli vurgulanması.

## Doğrulama

- 42 test: bildirimler, Risale paketleri, bağlantılar, fihrist, alıntı vurgusu, indirme hata senaryoları, kapak hatası ve 75 kitabın çevrimdışı kapak dosyaları.
- TypeScript, mobil Vite derlemesi ve Android senkronizasyonu.
- Mevcut 46 kitap indirme adresi HTTP 200.
- Uygulama üzerinden Kur'an EPUB indirmesi ve okuyucuda açılması.
- Gerçek dosyayla PDF'de boş ilk sayfayı atlayarak kapak çıkarılması; EPUB gömülü kapağı ve kapaksız EPUB'a otomatik kapak.
- İçerik deposunda 44 Risale paketi, 30 kaynak PDF ve 30 PDF kapağı doğrulandı.

## İçerik yayını

İçerik PR #1 ve kaynak sitenin eksik ara sertifika zincirini tamamlayan PR #2 main'e birleştirildi. `Publish content catalog` çalışması 37148192517 başarıyla tamamlandı: https://github.com/swietcherdps/ahir-book-content/actions/runs/37148192517

75 uygulama indirme adresi canlı sunucuda HTTP 200 döndü; dosya boyutları katalogla eşleşti. Yayındaki PDF kataloğunun hash, boyut, dosya ve kapak yolları uygulamanın kataloğuyla birebir doğrulandı. Yeni Mektûbât PDF'si uygulamadan indirilip açıldı; 512 sayfa ve 316 bölüm doğrulandı, ilk bölüm bağlantısı 7. sayfaya gitti. Eski kitap kimliği ve kalıcı kaynak anahtarıyla gönderilen Risale bağlantısı doğru kitaba yönlenip alıntının tamamını vurguladı.

İmzalı AAB/APK'de 36 çevrimdışı kapak var. AAB imzası doğrulandı; APK sertifikası önceki sürümle aynı. Paket kimliği `com.ahirbook.app`, sürüm `1.1.9`, sürüm kodu `50`.

Kapaklar yerleşik ImageGen aracıyla üretildi. Varlıklar `public/covers/`, istemler `docs/cover-prompts.json` ve `docs/cover-prompts-risale.json` içindedir. Kitap içerikleri AAB'ye dahil edilmez.
