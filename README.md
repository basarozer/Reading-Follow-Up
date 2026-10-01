# Reading Follow Up

Kişisel kitaplık ve okuma takip uygulaması. GitHub Pages üzerinde çalışan, bağımlılık gerektirmeyen bir web uygulamasıdır. Kitaplık verileri GitHub reposuna veya herkese açık site dosyalarına yazılmaz.

## Özellikler

- ISBN-10 / ISBN-13 kontrolü ve eşdeğer ISBN mükerrer kontrolü.
- Google Books + Open Library üzerinden yalnızca aranan baskının bibliyografik bilgileri; eksik veya hatalı alanlar elle düzenlenebilir.
- Kitap kapakları, yazarlar, yayınevi, yayın tarihi, dil, sayfa sayısı, mevcutsa baskı/format, açıklama ve konular.
- Want to Read / Currently Reading / Read; puan, favori, kişisel notlar.
- İstenilen sayıda özel raf, bir kitabı birden fazla rafa ekleme, rafı yeniden adlandırma/silme.
- Tekrar okumaları da içeren, düzenlenebilir okuma geçmişi.
- Yıllık kitap/sayfa istatistikleri, aylık ayrıntı ve yıllar arası karşılaştırma.
- Kitap/yazar/ISBN araması, durum/raf/puan/favori filtreleri ve sıralama.
- Goodreads CSV: dosya seçme/sürükleme, önizleme, veri notları, mükerrerleri atlama ve toplu aktarım.
- JSON tam yedek/geri yükleme ve CSV dışa aktarma.
- Mobil ve masaüstü kapak/liste görünümü.

## Çalıştırma ve test

Node.js 22+ ve Python 3:

```sh
npm test
npm run build
npm start
```

http://localhost:4173 adresini açın. Üretim dosyaları `dist/` içine alınır. Alt klasörde çalışan GitHub Pages adresleri desteklenir. npm paket kurulumu gerekmez.

## GitHub Pages

1. Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions** seçin.
2. Actions → **Test and publish Reading Follow Up** → Run workflow.
3. Sonraki `main` değişiklikleri testlerden geçerse otomatik yayınlanır.

Beklenen adres: `https://basarozer.github.io/Reading-Follow-Up/`. Pages etkinleştirilmeden adres çalışmaz. Repo'nun bu ayarını değiştirmek repo yönetim yetkisi gerektirir.

## Depolama: yerel / bulut

Varsayılan yapılandırma **yerel moddur**: kayıtlar yalnızca kullanılan tarayıcının localStorage alanında tutulur. Tarayıcı/site verileri temizlenirse kaybolurlar. Site bunu görünür biçimde belirtir. Düzenli JSON yedeği alın. Birden çok sekmenin aynı kaydın üzerine yazmasını revision kontrolü ve Web Locks engeller.

Bulut kodu hazırdır fakat Supabase projesi ve hesap yapılandırılmadan cihazlar arası senkronizasyon çalışmaz. Hiçbir bağlantı varmış gibi gösterilmez. Bulut modu anonim ziyaretçilere kişisel kitaplık verisi sunmaz. Her kaydetme veritabanına gider; eşzamanlı cihaz değişikliği algılanırsa üzerine yazma reddedilir ve yenileme istenir. Çevrimdışı bulut düzenleme kuyruğu yoktur.

### Supabase kurulumu

1. Supabase projesinde SQL Editor ile `supabase/schema.sql` dosyasını çalıştırın.
2. Authentication → Users alanında kendi e-posta/şifrenizle bir kullanıcı oluşturun. Genel kayıt açılması gerekmez; tek kullanıcı için signup'ı kapalı tutun.
3. Oluşan kullanıcı UUID'sini `library_owners` tablosuna ekleyin:

```sql
insert into public.library_owners(user_id) values ('YOUR-USER-UUID');
```

4. `config.js` içinde `supabaseUrl` ve `supabaseKey` değerlerini projenin URL'si ve **publishable / anon** anahtarıyla doldurun. Bunlar istemci için tasarlanmış public yapılandırmadır. **service_role / secret key / GitHub token / şifre koymayın.**
5. Site yeniden yayınlanınca Verilerim ve hesabım bölümünden giriş yapın. Boş bulut kitaplığında yerel veriyi içeri aktarma düğmesi vardır. Alternatif olarak JSON yedeğinizi yükleyebilirsiniz.

Tablolarda RLS açıktır, anon/authenticated için doğrudan tablo erişimi kapalıdır; RPC'ler auth.uid ve owner allowlist doğrular. Kitaplık kaydı kullanıcıya bağlıdır. Session yalnızca sekme sessionStorage alanında tutulur; şifre saklanmaz. Gerçek Supabase projesi bağlanmadan uçtan uca bulut doğrulaması yapılmış sayılmaz.

## Goodreads aktarımı

Goodreads → My Books → Import and export → Export Library. İndirilen CSV dosyasını uygulamanın **Goodreads’ten aktar** alanına bırakın. Aktarım yalnızca son onay düğmesine basıldığında kaydedilir. Dosya üçüncü tarafa gönderilmez; tarayıcıda ayrıştırılır. Bulut modunda aktarım sonucu kendi Supabase hesabınıza kaydedilir.

- Title, Author, Additional Authors, ISBN/ISBN13, Publisher, Binding, Year Published, Number of Pages, My Rating, My Review, varsa Private Notes, Date Added, Date Read, Bookshelves, Exclusive Shelf, Book Id ve Read Count işlenir.
- `="ISBN"` biçimi, BOM, tırnaklı virgüller ve çok satırlı notlar desteklenir.
- Aynı ISBN veya Goodreads Book Id tekrar eklenmez. Kimliği olmayan kayıtlar ad+yazar ile karşılaştırılır. Mevcut kişisel düzenlemeler korunur.
- Goodreads CSV tam tekrar okuma tarihçesini içermez. Son okuma tarihi korunur; Read Count fazlası tarihsiz tamamlanmış okumalar olarak tutulur, uydurma tarih üretilmez.
- Bitirme tarihi olmayan kitaplar Read durumunda kalır ama yıllık sayılara katılmaz. Tarih girilerek düzeltilebilir.
- Goodreads CSV kapak içermez. ISBN üzerinden Open Library kapak URL'si kullanılır; bulunmayan kapak yerine kitap adı/yazarı gösterilir.
- En fazla 20 MB / 20.000 satır kabul edilir. Yerel tarayıcı depolama kotası daha düşük olabilir; hata halinde eski kayıt korunur.

## İstatistik tanımı

Yıllık kitap adedi, bitirme tarihi o yılda olan **tamamlanmış okuma kayıtlarıdır**. Aynı kitabın iki okuması iki adet sayılır. Sayfa toplamı bu okumaların sayfa adetlerinin toplamıdır; yıl içinde okunan günlük/yarım sayfalar değildir. Geçmişteki okumanın sayfa sayısı bir snapshot olarak saklanır; okuma geçmişi ekranından düzeltilebilir. Sayfa bilinmiyorsa toplama eklenmez, eksik kayıt sayısı görünür. Tarihsiz okumalar yıllık karşılaştırmaya girmez. Formdaki yeni tarih varsayılanı Türkiye takvimine göredir.

## API sınırları

Her ISBN için bütün alanlar bulunmayabilir; özellikle baskı ve sayfa bilgisi eksik olabilir. Google Books ve Open Library için timeout/hata durumu ele alınır. Google Books kotası gerekiyorsa `config.js` içindeki isteğe bağlı `googleBooksKey` alanına HTTP-referrer kısıtlamalı bir tarayıcı API anahtarı eklenebilir. Key olmadan deneme yapılır; kota reddinde Open Library kullanılmaya devam eder. Kitap görseli dış servisten istenir. İçe aktarılan notlar/kitap açıklamaları HTML olarak çalıştırılmaz.

Referanslar: [Google Books](https://developers.google.com/books/docs/v1/using), [Open Library Books API](https://openlibrary.org/dev/docs/api/books), [Supabase Auth](https://supabase.com/docs/guides/auth).
