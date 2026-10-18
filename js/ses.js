/*
 * Ses katmanı
 *  - Seslendirme: EMA Lightning (ema/ klasörü, tarayıcıda ONNX; WebGPU ya da WASM).
 *    Model yüklenemezse tarayıcının Türkçe sesine (Web Speech API) düşer.
 *  - Konuşma tanıma: Web Speech API (Chrome/Edge).
 *  - Efekt sesleri: Web Audio ile üretilir, dosya gerekmez.
 */
(function (kok) {
  'use strict';

  var EMA_YOL = new URL('ema/', document.baseURI).href;
  var RATE = 48000;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  var ayar = { hiz: 0.85, ton: 0, hassasiyet: 'fp32' };

  /* ---------- Ortak ses bağlamı ---------- */

  var ctx = null;
  function baglam() {
    if (!ctx) {
      var AC = kok.AudioContext || kok.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ sampleRate: RATE }); } catch (e) { ctx = new AC(); }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ---------- EMA Lightning motoru (arka plan işçisinde) ---------- */

  var motor = {
    durum: 'bekliyor',   // bekliyor | yukleniyor | hazir | hata
    ilerleme: 0,
    arka: null,          // webgpu | wasm
    hata: null,
    isci: null,
    yukleme: null,
    dinleyiciler: []
  };

  /* ---------- Çökme koruması ----------
   * Bazı cihazlarda model yüklenirken sayfa çökebilir. Yüklemeden önce bir işaret bırakılır;
   * sonraki açılışta işaret hâlâ duruyorsa önceki yükleme çökmüş olabilir. Arka arkaya İKİ
   * açılışta böyle olursa bir kademe güvenli moda geçilir:
   *   0: normal (WebGPU varsa o, yoksa WASM)
   *   1: güvenli (ekran kartı yerine işlemci/WASM; model aynı, doğrulanmış ses tablosu geçerli)
   *   2: model kapalı, tarayıcının Türkçe sesi
   * Yükleme sürerken sayfayı kapatmak / başka adrese geçmek çökme değildir: tarayıcı o
   * durumda "pagehide" gönderir ve işaret temizlenir (gerçek çökmede bu olay gelmez).
   */
  var KORUMA = 'hecele.ses-koruma.v2';
  // eski sürümlerin kayıtları ("hecele.ses-koruma" yanlış alarmlıydı, silinir; diğeri taşınır)
  try {
    var eskiKoruma = localStorage.getItem('mn-su.hecele.ses-koruma');
    if (eskiKoruma && !localStorage.getItem(KORUMA)) localStorage.setItem(KORUMA, eskiKoruma);
    localStorage.removeItem('mn-su.hecele.ses-koruma'); localStorage.removeItem('hecele.ses-koruma');
  } catch (e) { /* yoksay */ }
  function korumaOku() {
    try { return JSON.parse(localStorage.getItem(KORUMA)) || { seviye: 0, supheli: 0 }; } catch (e) { return { seviye: 0, supheli: 0 }; }
  }
  function korumaYaz() { try { localStorage.setItem(KORUMA, JSON.stringify(koruma)); } catch (e) { /* yoksay */ } }
  var koruma = korumaOku();
  if (koruma.yukleniyor) {
    koruma.yukleniyor = false;
    koruma.supheli = (koruma.supheli || 0) + 1;
    if (koruma.supheli >= 2) {            // iki açılış üst üste yükleme sırasında çöktü
      koruma.seviye = Math.min(2, (koruma.seviye || 0) + 1);
      koruma.supheli = 0;
    }
    korumaYaz();
  }
  kok.addEventListener('pagehide', function () {
    if (koruma.yukleniyor) { koruma.yukleniyor = false; korumaYaz(); }   // normal kapanış/geçiş
  });
  function guvenliSeviye() { return koruma.seviye || 0; }
  function yuklemeBitti() {
    if (koruma.yukleniyor || koruma.supheli) { koruma.yukleniyor = false; koruma.supheli = 0; korumaYaz(); }
  }

  function bildir() {
    motor.dinleyiciler.forEach(function (f) { try { f(motorDurumu()); } catch (e) { /* yoksay */ } });
  }
  function motorDurumu() {
    return {
      durum: motor.durum, ilerleme: motor.ilerleme, arka: motor.arka, hata: motor.hata,
      hassasiyet: motor.hassasiyet || ayar.hassasiyet, seviye: guvenliSeviye(), cokmeSeviyesi: koruma.seviye || 0
    };
  }

  var bekleyenler = {};   // id -> { coz, reddet }
  var sonId = 0;

  function isciMesaji(e) {
    var m = e.data;
    if (m.tip === 'ilerleme') {
      motor.ilerleme = m.p; bildir();
    } else if (m.tip === 'hazir') {
      yuklemeBitti();
      motor.arka = m.arka; motor.durum = 'hazir'; motor.ilerleme = 1; motor.hata = null; bildir();
      if (motor.yuklemeCoz) motor.yuklemeCoz(true);
    } else if (m.tip === 'yuklemeHatasi') {
      yuklemeBitti();
      motor.durum = 'hata'; motor.hata = m.mesaj; bildir();
      if (motor.yuklemeCoz) motor.yuklemeCoz(false);
    } else if (m.tip === 'sonuc' || m.tip === 'hata') {
      var b = bekleyenler[m.id];
      if (!b) return;
      delete bekleyenler[m.id];
      if (m.tip === 'sonuc') b.coz({ ses: m.ses, parcalar: m.parcalar, sure: m.ses.length / RATE, puan: m.puan });
      else b.reddet(new Error(m.mesaj));
    }
  }

  function emaYukle() {
    if (motor.yukleme) return motor.yukleme;
    if (location.protocol === 'file:') {
      motor.durum = 'hata';
      motor.hata = 'Uygulama dosyadan açıldı. EMA sesi için "baslat.command" ile yerel sunucudan açın.';
      bildir();
      return (motor.yukleme = Promise.resolve(false));
    }
    var seviye = guvenliSeviye();
    if (seviye >= 2) {
      motor.durum = 'hata';
      motor.hata = 'Bu cihazda ses modeli önceki açılışlarda çöktüğü için kapatıldı; tarayıcının Türkçe sesi kullanılıyor.';
      bildir();
      return (motor.yukleme = Promise.resolve(false));
    }
    motor.hassasiyet = ayar.hassasiyet;
    koruma.yukleniyor = true;
    korumaYaz();
    motor.durum = 'yukleniyor';
    motor.ilerleme = 0;
    motor.hata = null;
    bildir();
    motor.yukleme = new Promise(function (coz) {
      motor.yuklemeCoz = coz;
      try {
        if (!motor.isci) {
          motor.isci = new Worker(new URL('js/ses-isci.js', document.baseURI), { type: 'module' });
          motor.isci.onmessage = isciMesaji;
          motor.isci.onerror = function (e) {
            console.warn('Ses işçisi hatası:', e);
            yuklemeBitti();
            motor.durum = 'hata'; motor.hata = 'Ses işçisi başlatılamadı'; bildir();
            coz(false);
          };
        }
        motor.isci.postMessage({
          tip: 'yukle', taban: EMA_YOL, hassasiyet: motor.hassasiyet,
          arkalar: (seviye === 0 && navigator.gpu && !IOS) ? ['webgpu', 'wasm'] : ['wasm']
        });
      } catch (e) {
        motor.durum = 'hata'; motor.hata = e && e.message ? e.message : String(e); bildir();
        coz(false);
      }
    });
    return motor.yukleme;
  }

  // Ayarlardaki "Ses motorunu yeniden dene": güvenli moddan normal moda dön
  function korumaSifirla() {
    koruma = { seviye: 0, supheli: 0 };
    korumaYaz();
    return emaYenidenYukle();
  }

  async function emaYenidenYukle() {
    if (motor.yukleme) await motor.yukleme;
    motor.yukleme = null;
    onbellek.clear();
    return emaYukle();
  }

  var onbellek = new Map();
  var ONBELLEK_SINIR = 300;

  function anahtar(metin, tur) { return ayar.hiz + '|' + ayar.ton + '|' + tur + '|' + metin; }

  /*
   * metin -> Promise<{ ses: Float32Array, parcalar: [{ kelimeler, baslar, bas }], sure, puan }>
   * tur: 'hece' | 'kelime' | 'cumle' | 'ham' (ayrıntılar ses-isci.js'de)
   * oncelikli: "Dinle" gibi şimdi çalınacak istekler kuyruğun önüne geçer.
   */
  function sentezle(metin, tur, oncelikli) {
    tur = tur || 'cumle';
    var k = anahtar(metin, tur);
    var var_olan = onbellek.get(k);
    if (var_olan) {
      // Ön hazırlıkta bekliyorsa öne al
      if (oncelikli && var_olan.bekliyor) {
        motor.isci.postMessage({ tip: 'sentez', id: var_olan.id, metin: metin, tur: tur, hiz: ayar.hiz, ton: ayar.ton, oncelikli: true });
      }
      return var_olan.soz;
    }
    if (motor.durum !== 'hazir') return Promise.reject(new Error('model hazır değil'));
    var id = ++sonId;
    var kayit = { id: id, bekliyor: true, soz: null };
    kayit.soz = new Promise(function (coz, reddet) {
      bekleyenler[id] = {
        coz: function (r) { kayit.bekliyor = false; coz(r); },
        reddet: function (h) { kayit.bekliyor = false; if (onbellek.get(k) === kayit) onbellek.delete(k); reddet(h); }
      };
    });
    kayit.soz.catch(function () {});
    onbellek.set(k, kayit);
    if (onbellek.size > ONBELLEK_SINIR) onbellek.delete(onbellek.keys().next().value);
    motor.isci.postMessage({ tip: 'sentez', id: id, metin: metin, tur: tur, hiz: ayar.hiz, ton: ayar.ton, oncelikli: !!oncelikli });
    return kayit.soz;
  }

  /* ---------- Çalma ve kelime takibi ---------- */

  var nesil = 0;        // her konuşma/susturma bir artırır; eski istekler sessizce düşer
  var calan = null;     // { kaynak, bitir }

  function cal(sonuc, kelimeFn) {
    return new Promise(function (coz) {
      var c = baglam();
      if (!c || !sonuc.ses.length) { coz(); return; }
      var buf = c.createBuffer(1, sonuc.ses.length, RATE);
      buf.copyToChannel(sonuc.ses, 0);
      var kaynak = c.createBufferSource();
      kaynak.buffer = buf;
      kaynak.connect(c.destination);
      var t0 = c.currentTime + 0.03;
      var bitti = false, sonKelime = -1;

      // Parçalardaki kelimeleri tek sıraya diz: [başlangıç saniyesi]
      var baslar = [];
      sonuc.parcalar.forEach(function (p) {
        p.kelimeler.forEach(function (_, i) { baslar.push(p.bas + (p.baslar[i] || 0)); });
      });

      function izle() {
        if (bitti) return;
        var t = c.currentTime - t0, w = -1;
        for (var i = 0; i < baslar.length; i++) if (baslar[i] <= t) w = i;
        if (w !== sonKelime && kelimeFn) { sonKelime = w; kelimeFn(w); }
        requestAnimationFrame(izle);
      }
      function bitir() {
        if (bitti) return;
        bitti = true;
        if (calan && calan.kaynak === kaynak) calan = null;
        coz();
      }
      kaynak.onended = bitir;
      calan = { kaynak: kaynak, bitir: bitir };
      kaynak.start(t0);
      if (kelimeFn) requestAnimationFrame(izle);
    });
  }

  /* ---------- Yedek: tarayıcı sesi ---------- */

  var sentez = kok.speechSynthesis;
  var yedekSes = null, tutulan = null;
  function yedekSesSec() {
    if (!sentez) return;
    var tr = sentez.getVoices().filter(function (v) { return /^tr/i.test(v.lang); });
    yedekSes = tr.filter(function (v) { return /yelda/i.test(v.name); })[0] ||
      tr.filter(function (v) { return /google/i.test(v.name); })[0] || tr[0] || null;
  }
  if (sentez) {
    yedekSesSec();
    if (sentez.addEventListener) sentez.addEventListener('voiceschanged', yedekSesSec);
  }

  function tarayiciKonus(metin, kelimeFn) {
    return new Promise(function (coz) {
      if (!sentez) { coz(); return; }
      var u = new SpeechSynthesisUtterance(metin);
      u.lang = 'tr-TR';
      if (yedekSes) u.voice = yedekSes;
      u.rate = ayar.hiz;
      u.pitch = ayar.ton ? 1.3 : 1;
      var bitti = false;
      var zaman = setTimeout(son, 1500 + metin.length * 180 / u.rate);
      function son() { if (!bitti) { bitti = true; clearTimeout(zaman); coz(); } }
      u.onend = son;
      u.onerror = son;
      if (kelimeFn) {
        var kelimeBaslari = [];
        metin.replace(/\S+/g, function (m, i) { kelimeBaslari.push(i); return m; });
        u.onboundary = function (e) {
          if (e.name === 'sentence') return;
          var w = -1;
          for (var i = 0; i < kelimeBaslari.length; i++) if (kelimeBaslari[i] <= e.charIndex) w = i;
          kelimeFn(w);
        };
      }
      tutulan = u;
      sentez.speak(u);
    });
  }

  /* ---------- Dışa açık konuşma API'si ---------- */

  /*
   * Metni seslendirir. secenek.tur: 'hece' | 'kelime' | 'cumle' (varsayılan);
   * secenek.kelime(i) okunan kelimenin sırasıyla çağrılır.
   * Model henüz yükleniyorsa bekler; yüklenemediyse tarayıcı sesini kullanır.
   */
  async function konus(metin, secenek) {
    secenek = secenek || {};
    var benim = ++nesil;
    durdurCalan();
    baglam(); // iOS: dokunma anında ses bağlamını aç
    if (motor.durum === 'bekliyor') emaYukle();
    if (motor.durum === 'yukleniyor') await motor.yukleme;
    if (benim !== nesil) return false;

    if (motor.durum === 'hazir') {
      try {
        var sonuc = await sentezle(metin, secenek.tur, true);
        if (benim !== nesil) return false;
        await cal(sonuc, secenek.kelime);
        return benim === nesil;
      } catch (e) {
        console.warn('EMA seslendiremedi, tarayıcı sesi kullanılıyor:', e);
      }
    }
    if (benim !== nesil) return false;
    await tarayiciKonus(metin, secenek.kelime);
    return benim === nesil;
  }

  // Sıradaki kartın seslerini önceden hazırla (Dinle'ye basınca beklemesin)
  // ogeler: [{ metin, tur }]
  function onHazirla(ogeler) {
    if (motor.durum !== 'hazir') return;
    // Önceki kartın kuyrukta bekleyen ön hazırlıkları artık gereksiz: önbellekten düş, işçiye bildir
    onbellek.forEach(function (kayit, k) { if (kayit.bekliyor) onbellek.delete(k); });
    motor.isci.postMessage({ tip: 'onHazirIptal' });
    ogeler.forEach(function (o) { sentezle(o.metin, o.tur).catch(function () {}); });
  }

  function durdurCalan() {
    if (calan) {
      var c = calan;
      try { c.kaynak.stop(); } catch (e) { /* yoksay */ }
      c.bitir();
    }
    if (sentez) sentez.cancel();
  }

  function sustur() { nesil++; durdurCalan(); }

  function bekle(ms) { return new Promise(function (c) { setTimeout(c, ms); }); }

  /* ---------- Konuşma tanıma ---------- */

  var Tanima = kok.SpeechRecognition || kok.webkitSpeechRecognition;
  var aktifTanima = null;

  function dinle(secenek) {
    secenek = secenek || {};
    return new Promise(function (coz, reddet) {
      if (!Tanima) { reddet(new Error('desteklenmiyor')); return; }
      var r = new Tanima();
      aktifTanima = r;
      r.lang = 'tr-TR';
      r.interimResults = false;
      r.maxAlternatives = 5;
      r.continuous = false;
      var sonuc = [], bitti = false;
      var zaman = setTimeout(function () { try { r.stop(); } catch (e) { /* yoksay */ } }, secenek.sure || 7000);
      function kapat() { bitti = true; clearTimeout(zaman); aktifTanima = null; }
      r.onresult = function (e) {
        for (var i = 0; i < e.results.length; i++) {
          for (var j = 0; j < e.results[i].length; j++) sonuc.push(e.results[i][j].transcript);
        }
      };
      r.onerror = function (e) {
        if (bitti) return;
        kapat();
        if (e.error === 'no-speech' || e.error === 'aborted') coz([]);
        else reddet(new Error(e.error));
      };
      r.onend = function () { if (!bitti) { kapat(); coz(sonuc); } };
      try { r.start(); } catch (e) { kapat(); reddet(e); }
    });
  }

  function dinlemeyiDurdur() {
    if (aktifTanima) { try { aktifTanima.stop(); } catch (e) { /* yoksay */ } }
  }

  /* ---------- Efekt sesleri ---------- */

  var efektAcik = true;
  function nota(frekans, baslangic, sure, tip, siddet) {
    var c = baglam();
    if (!c || !efektAcik) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = tip || 'sine';
    o.frequency.value = frekans;
    var t = c.currentTime + baslangic;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(siddet || 0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + sure + 0.05);
  }

  var Efekt = {
    dogru: function () { [523, 659, 784, 1047].forEach(function (f, i) { nota(f, i * 0.09, 0.3, 'triangle'); }); },
    tekrar: function () { nota(440, 0, 0.18, 'sine', 0.18); nota(370, 0.16, 0.28, 'sine', 0.18); },
    tik: function () { nota(880, 0, 0.06, 'square', 0.05); },
    kutlama: function () {
      [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { nota(f, i * 0.12, 0.35, 'triangle', 0.22); });
      nota(1319, 0.75, 0.6, 'sine', 0.15);
    },
    ac: function (deger) { efektAcik = deger; }
  };

  kok.Ses = {
    destek: { tanima: !!Tanima, webgpu: !!navigator.gpu && !IOS },
    yukle: emaYukle,
    yenidenYukle: emaYenidenYukle,
    korumaSifirla: korumaSifirla,
    durum: motorDurumu,
    durumDinle: function (f) { motor.dinleyiciler.push(f); f(motorDurumu()); },
    ayarla: function (a) {
      var degisti = false;
      ['hiz', 'ton', 'hassasiyet'].forEach(function (k) {
        if (a[k] !== undefined && a[k] !== ayar[k]) { ayar[k] = a[k]; degisti = k === 'hassasiyet' || degisti; }
      });
      return degisti; // true: modelin yeniden yüklenmesi gerekir
    },
    konus: konus,
    onHazirla: onHazirla,
    sustur: sustur,
    bekle: bekle,
    dinle: dinle,
    dinlemeyiDurdur: dinlemeyiDurdur,
    Efekt: Efekt,
    _sentezle: function (m, t) { return sentezle(m, t, true); }   // ses-karsilastir.html için
  };
})(window);
