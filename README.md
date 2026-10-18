# Hecele – Okumayı Öğreniyorum

İlk okuma-yazma sürecindeki çocuklar için okuma alıştırması. Uygulama, öğrencinin **bildiği harflerden**
oluşan hece, kelime ve cümleleri gösterir. Öğrenci önce kendisi okur, sonra seslendirmeyi dinleyip
doğru okuyup okumadığını görür.

**▶ Hemen kullan:** https://mn-su.github.io/hecele/

Kurulum gerekmez; tablet, akıllı tahta ve bilgisayarda tarayıcıdan açılır. En iyi deneyim için
Chrome veya Edge önerilir (mikrofonla kontrol yalnızca bu tarayıcılarda çalışır).

## Uygulama olarak yükleme ve internetsiz kullanım

Hecele bir PWA'dır: tablete ya da telefona uygulama gibi yüklenir, tam ekran açılır ve bir kez
internetliyken açıldıktan sonra internet olmadan da çalışır (sınıfta bağlantı zayıfsa önemli).

- **Android / Chrome / Edge:** ⚙️ Ayarlar → *Uygulama olarak yükle* (ya da tarayıcının yükle simgesi).
- **iPad / iPhone (Safari):** *Paylaş* → *Ana Ekrana Ekle*.
- İlk açılışta ses modeli ve ses kütüphanesi (~50–60 MB) indirilir; bunu okulun Wi-Fi'sinde bir kez
  yapmak yeterli. Ayarlarda “İnternet olmadan da çalışır” yazısı görünce hazırdır.
- Uygulama dosyaları her açılışta önce internetten denenir (en fazla 3 sn), olmazsa kayıtlı sürüm
  açılır; böylece GitHub'a yüklenen güncellemeler kendiliğinden gelir.
- İlk açılışta dosyalar (~50 MB) arka planda kendiliğinden indirilir; ayarlardaki “İnternetsiz
  kullanıma hazır” bunu gösterir. “Uygulama olarak yüklü” ayrı satırdadır: tarayıcıda açıkken
  internetsiz kullanıma hazır olmak, yüklü olmak anlamına gelmez.
- **Ad çakışması yok:** aynı kökendeki (ör. `mn-su.github.io`) bütün uygulamalar önbellekleri ve
  tarayıcı kayıtlarını (localStorage) paylaşır. Hecele'nin bütün adları `hecele` ile başlar
  (`hecele-uygulama`, `hecele-kutuphane`, `hecele-ema-models-v1`, `hecele.v1`…) ve yalnızca kendi
  adlarına dokunur. Eski sürümlerin farklı adlarındaki Hecele dosyaları ve ilerleme kayıtları yeni
  adlara taşınır; başka uygulamaların dosyalarına dokunulmaz. `ema/tts.js` bu yüzden özgün
  ema-lightning-web'den farklıdır (önbellek adı ve taşıma).
- Mikrofonla kontrol internet ister (Chrome'un konuşma tanıması çevrimiçi); internetsizken
  öğrenci kendini kontrol eder.
- iPad/iPhone, uzun süre açılmayan uygulamaların kayıtlı dosyalarını silebilir; o durumda bir
  sonraki açılışta yeniden indirilir.
- **Çökme koruması:** Ses modeli yüklenirken sayfa üst üste iki açılışta çökerse uygulama güvenli
  moda geçer (ekran kartı yerine işlemci, daha yavaş); yine çökerse modeli kapatıp tarayıcının
  Türkçe sesini kullanır. Yükleme sürerken sayfayı kapatmak ya da yenilemek çökme sayılmaz. Ayarlar → Ses → *Ses motorunu yeniden dene* ile normal moda dönülür.
- **Android 8 ve öncesi:** Chrome'un “Uygulamayı yükle” ile ürettiği paket (WebAPK) bu sürümlerde
  açılır açılmaz çöküyor (Google'ın sunucusu paketi Android 9+ biçiminde, DEX 039, üretiyor; Android
  8.1 en fazla 038 okuyabiliyor). Bu Hecele'ye özgü değil; o cihaza yeni yüklenen her PWA'da olur.
  Çözüm: yüklü simgeyi silip Chrome menüsü → *Ana ekrana ekle* → *Kısayol oluştur*. Uygulama bu
  cihazlarda yükle düğmesini gizler ve bu yönlendirmeyi gösterir.

## Yerelde çalıştırma

`baslat.command` dosyasına çift tıklayın (ya da terminalde):

```bash
python3 -m http.server 8765
```

Sonra tarayıcıda `http://localhost:8765` adresini açın. EMA sesi ve mikrofon için sayfanın
yerel sunucudan (veya HTTPS'ten) açılması gerekir; `index.html` dosyaya çift tıklanarak açılırsa
uygulama tarayıcının kendi Türkçe sesine düşer.

İlk açılışta ses modeli (~35 MB) indirilir ve tarayıcı önbelleğine alınır; sonraki açılışlarda
beklemeden gelir.

## Akış

1. **Harf seçimi:** Öğrenci açılışta öğrendiği harflere dokunur (en az bir sesli ve bir sessiz harf).
   Sonradan ana sayfadaki “Harflerimi değiştir” ile güncellenir. Sonradan eklenen harf 14 gün
   boyunca “yeni” rozetiyle gösterilir ve o harfi içeren öğeler biraz daha sık gelir.
2. **Mod seçimi:** Heceler, Kelimeler, Cümleler veya Karışık (kolaydan zora).
3. **Okuma kartı:** Öğrenci okur → “Okudum, dinleyelim!” → EMA kartı okur, okunan hece/kelime
   sarı ile parlar → öğrenci “Doğru okudum” ya da “Bir daha” der. “Bir daha”da kart hece hece
   (cümlede kelime kelime) yavaşça okunur ve öğrenci yeniden dener.
4. **Mikrofon modu (isteğe bağlı):** Öğrenci mikrofona okur; Chrome/Edge konuşma tanıma ile
   karşılaştırılır. Tanıma kısa hecelerde yanılabildiği için “Doğru okumuştum” düğmesi vardır.
5. **Tur sonu:** İlk denemede okunanlar altın, tekrar ile okunanlar gümüş yıldız. Zorlanılan
   öğeler listelenir ve sonraki turlarda daha sık çıkar.
6. **Seçim:** Her öğenin kaç kez gösterildiği hatırlanır; en az gösterilenler öne çıkar. Havuzdaki
   her öğe sırayla ama rastgele sırayla gelir, aynı öğeler sürekli seçilmez. Zorlanılan öğeler en
   fazla 3 kat, yeni harfli öğeler 1,5 kat ağırlık alır.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `js/turkce.js` | Türkçe büyük/küçük harf, ses grubu sıraları, heceleme (an‑ne, türk‑çe, ti‑yat‑ro), benzerlik |
| `js/veri.js` | Kelime (~1150) ve cümle (~780) havuzu; yeni öğe eklemek için buraya yazmak yeterli (sonra ses tablosunu güncelleyin) |
| `js/uretici.js` | Seçili harflerle okunabilenleri süzer; kurallı hece üretir (Ü, ÜV, VÜ, ÜVÜ), uygunsuz heceleri eler |
| `js/ses.js` | Seslendirme istemcisi (önbellek, ön hazırlık, çalma, kelime vurgusu), konuşma tanıma, efektler |
| `js/ses-isci.js` | Web Worker: EMA modeli, iş kuyruğu, doğrulanmış tablo ya da aday seçimi |
| `js/ses-islem.js` | Ses işleme: taşıyıcı ve adaylar, perde/kırılma ölçümü, kırpma, esnetme, ses düzeyi |
| `js/ses-tablosu.json` | Doğrulanmış ses tablosu (hece/kelime → aday, cümle → tohum) |
| `araclar/ses-tablosu.html` | Tabloyu Whisper ile üreten geliştirme aracı |
| `sw.js`, `manifest.webmanifest`, `ikonlar/` | PWA: çevrimdışı önbellek, uygulama tanımı, simgeler |
| `js/uygulama.js` | Ekranlar, okuma akışı, yıldızlar, öğretmen ayarları, kayıt (localStorage) |
| `ema/` | [ema-lightning-web](https://github.com/ozcancelik/ema-lightning-web) motoru ve modelleri (Apache‑2.0) |

Öğretmen/veli ayarları (⚙️): harf sırası (klasik A‑N‑E‑T‑İ‑L… veya MEB E‑L‑A‑K‑İ‑N…), yazı biçimi
(doğal / küçük / BÜYÜK), hece renkleri, tur uzunluğu, model hassasiyeti (fp32/fp16), ses tonu
(normal/çocuk), okuma hızı, heceleyerek okuma, efekt sesleri, mikrofon.

## İçerik ilkesi

Uygulama çocuklara yalnızca olumlu ya da nötr çağrışımlı içerik gösterir:

- Hakaret olarak kullanılabilen, korkutucu, şiddet, hastalık, acı ya da olumsuz bir durum/özellik
  çağrıştıran kelimeler (ör. öküz, cadı, bıçak, iğne, yanlış, kırık) ve cümleler (“Taş atma.”,
  “Ayna kırık.”) havuzdan çıkarıldı. Argo ya da olumsuz anlamlı heceler (“lan”, “öl”, “öç”, “kin”…)
  hece üreticisinin yasaklı listesindedir (`js/uretici.js`).
- **500 olumlu kelime** [TDK Türkçe kelime listesinden](https://github.com/ERENSISMAN61/TDK_Turkce_Kelimeler)
  seçildi: liste mekanik olarak süzüldü (özel isimler, mastarlar, türetmeler, “-sız” ekliler, 4+
  hece), hızlı bir dil modeli 6–7 yaşındaki çocuğun bildiği ve olumlu anlamlı kelimeleri önerdi,
  öneriler elle gözden geçirildi. İlk harflerle okunabilen kelime az olduğu için ilk 16 harften
  oluşan kelimeler ayrıca tarandı. Yeni kelimeler `js/veri.js`'te harf gruplarına göre sıralıdır.
- Yeni kelimelerin her biri en az bir cümlede geçer: 512 yeni cümle harf gruplarına göre yazıldı;
  her cümle yalnızca kendi grubuna kadar öğrenilen harflerle okunabilir (ör. ilk grupta
  “Anneanne, kek al.”, sonra “Martı limana iner.”, “Kanarya öter.”…).

## Hece seslerinin kalitesi

EMA Lightning cümlelerle eğitildiği için tek başına verilen kısa girdilerde (tek hece, kısa kelime)
ünlüleri kaydırabiliyor (“ten” → “tan”, “elma” → “alma”), perdesi titreyebiliyor ve sonuna fısıltı
ekleyebiliyor. Hazır ses dosyası yoktur: bütün sesler tarayıcıda o anda üretilir; iyileştirmeler
modelin ağırlıklarını değil, modele verilen girdiyi, üretim ayarlarını, aday seçimini ve sonradan
işlemeyi değiştirir:

- Hece ve kelimeler kısa bir taşıyıcı cümlenin sonunda seslendirilip modelin kelime zamanlamasıyla
  kesilir. Taşıyıcının ünlüsü hedefe uyumludur: ince ünlüde “Bil, ten.”, kalın ünlüde “Bak, lat.”.
- **Doğrulanmış ses tablosu** (`js/ses-tablosu.json`): havuzdaki her hece ve kelime için birkaç aday
  üretilip Whisper konuşma tanımayla bağlamı içinde dinletilmiş, doğru telaffuz edilen aday tabloya
  yazılmıştır. Uygulama tablodaki adayı tek seferde üretir (hızlı ve deterministik). Tablo
  `araclar/ses-tablosu.html` ile oluşturulur; Whisper yalnızca bu araçta kullanılır, uygulamaya
  eklenmez. Kelime havuzuna yeni kelime eklendiğinde araçta “Yalnızca eksikler” çalıştırılıp çıkan
  dosya `js/ses-tablosu.json` olarak kaydedilir. Kısa cümlelerde de aynı sorun görüldüğü için
  (“Nine, nane at.” → “Nene nane at”) cümleler de tabloya alındı: doğru okunan tohum saklanır.
  Tabloda olmayan öğeler için uygulama birkaç aday
  üretip perde kalitesine ve kırılma kontrolüne göre seçer.
- Tek ünlüler kaliteyi bozmuyorsa perdesi korunarak (WSOLA) biraz uzatılır. Ünlüyle biten hece ve
  kelimeler son titreşimli karede kesilir (sondaki “eh” fısıltısı duyulmaz). Ses düzeyi eşitlenir.

Model ve tüm bu hesaplar arka plandaki bir Web Worker'da (`js/ses-isci.js`, işleme fonksiyonları
`js/ses-islem.js`) çalışır; arayüz kilitlenmez. “Dinle” ile istenen ses, kuyrukta bekleyen ön
hazırlıkların önüne geçer.

Eski ve yeni yöntemi kulakla karşılaştırmak için: https://mn-su.github.io/hecele/ses-karsilastir.html

## GitHub Pages ile yayınlama

Depo derleme adımı gerektirmeyen statik bir sitedir. GitHub'da **Settings → Pages → Build and
deployment → Deploy from a branch → `main` / `(root)`** seçilir; birkaç dakika sonra site
https://mn-su.github.io/hecele/ adresinde açılır. (`.nojekyll` dosyası Jekyll işlemini atlatır.)

## Kendi sunucunda yayınlama (daha hızlı ses)

Ses motoru (WASM) tarayıcı sayfayı “cross-origin isolated” kabul ettiğinde birden çok işlemci
çekirdeği kullanır; bunun için sunucu şu iki başlığı göndermelidir (GitHub Pages gönderemez):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

jsDelivr (onnxruntime) ve Google Fonts `Cross-Origin-Resource-Policy: cross-origin` gönderdiği için
başka değişiklik gerekmez. Ölçüm (WASM, 12 çekirdek): motorun hazır olması 2,5 → 1,3 sn, 8 sesin
üretimi 1,1 → 0,4 sn. Caddy örneği:

```
hecele.ornek.alan {
	root * /srv/hecele
	file_server
	header {
		Cache-Control no-cache
		Cross-Origin-Opener-Policy same-origin
		Cross-Origin-Embedder-Policy require-corp
		Content-Security-Policy "default-src 'none'; script-src 'self' blob: https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
	}
}
```

**CSP (içerik güvenlik politikası):** sayfa yalnızca kendi dosyalarını, jsDelivr'deki onnxruntime'ı ve
Google Fonts'u yükleyebilir; başka hiçbir adrese istek atamaz, form gönderemez, çerçeve içinde
açılamaz. Aynı sunucudaki başka bir uygulamaya (ör. ayrı bir alt alan adındaki) tarayıcı üzerinden
istek gidemez. `blob:` izinleri onnxruntime'ın kendi iş parçacıkları için gereklidir; blob işçileri
de aynı politikaya tabidir. Satır içi betik/stil yoktur (satır içi `style=` yazmayın).

## Lisanslar

- Seslendirme: [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning) modeli ve
  [ema-lightning-web](https://github.com/ozcancelik/ema-lightning-web), Apache‑2.0 — `ema/LICENSE`, `ema/NOTICE`.
- onnxruntime-web (MIT) çalışma anında jsDelivr'dan yüklenir.
- Yazı tipleri: Andika ve Nunito (Google Fonts, OFL).
