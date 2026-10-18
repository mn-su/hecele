/* Öğrenilen harflerden hece / kelime / cümle üretir */
(function (kok) {
  'use strict';

  var T = kok.Turkce || (typeof require !== 'undefined' && require('./turkce.js'));
  var V = kok.Veri || (typeof require !== 'undefined' && require('./veri.js'));

  // Çocuk uygulamasında çıkmaması gereken heceler
  var YASAK_HECE = {
    am: 1, sik: 1, 'göt': 1, bok: 1, 'piç': 1, 'sıç': 1, 'kıç': 1, 'çük': 1, 'döl': 1,
    'oç': 1, yarak: 1, meme: 1,
    // argo ya da olumsuz anlamlı heceler
    lan: 1, 'öl': 1, it: 1, 'öç': 1, kin: 1, yas: 1, 'göm': 1, sus: 1, kak: 1, of: 1
  };

  function kume(dizi) {
    var k = {};
    dizi.forEach(function (h) { k[T.kucuk(h)] = true; });
    return k;
  }

  function karistir(dizi) {
    for (var i = dizi.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = dizi[i]; dizi[i] = dizi[j]; dizi[j] = t;
    }
    return dizi;
  }

  function tekillestir(dizi) {
    var gorulen = {};
    return dizi.filter(function (x) {
      var a = T.kucuk(x);
      if (gorulen[a]) return false;
      gorulen[a] = true;
      return true;
    });
  }

  // Havuzdaki gerçek kelimelerde geçen heceler (ÜVÜ heceler yalnızca bunlardan seçilir:
  // "zöç" gibi Türkçede pek geçmeyen heceler çıkmaz, doğrulanmış ses tablosu da kapsar)
  var DOGAL = {};
  V.KELIMELER.forEach(function (k) { T.hecele(T.kucuk(k)).forEach(function (h) { DOGAL[h] = true; }); });

  /* Heceler: Ü (ünlü), ÜV (ünsüz+ünlü), VÜ ve gerçek kelimelerde geçen ÜVÜ */
  function heceUret(harfler) {
    var unlu = harfler.filter(T.unluMu);
    var unsuz = harfler.filter(function (h) { return !T.unluMu(h); });
    var bas = unsuz.filter(function (h) { return h !== 'ğ'; }); // ğ ile hece başlamaz
    var sonuc = { V: [], CV: [], VC: [], CVC: [] };
    unlu.forEach(function (u) {
      sonuc.V.push(u);
      bas.forEach(function (c) { sonuc.CV.push(c + u); });
      unsuz.forEach(function (c) { sonuc.VC.push(u + c); });
      bas.forEach(function (c1) {
        unsuz.forEach(function (c2) { if (DOGAL[c1 + u + c2]) sonuc.CVC.push(c1 + u + c2); });
      });
    });
    Object.keys(sonuc).forEach(function (k) {
      sonuc[k] = sonuc[k].filter(function (h) { return !YASAK_HECE[h]; });
    });
    return sonuc;
  }

  /* Seçili harflerle okunabilen tüm içerik */
  function havuz(harfler) {
    var izin = kume(harfler);
    var kelimeler = tekillestir(V.KELIMELER.filter(function (k) { return T.okunabilirMi(k, izin); }));
    var cumleler = tekillestir(V.CUMLELER.filter(function (c) { return T.okunabilirMi(c, izin); }));

    // Gerçek kelimelerden gelen heceler (doğal heceler) ayrıca tutulur
    var dogal = {};
    kelimeler.forEach(function (k) {
      T.hecele(T.kucuk(k)).forEach(function (h) { if (!YASAK_HECE[h]) dogal[h] = true; });
    });

    return {
      harfler: harfler.slice(),
      heceTurleri: heceUret(harfler.map(T.kucuk)),
      dogalHeceler: Object.keys(dogal),
      kelimeler: kelimeler,
      cumleler: cumleler
    };
  }

  // Hece türü payları: ÜV en sık, sonra VÜ ve ÜVÜ; tek ünlü az
  var HECE_PAY = { CV: 40, VC: 25, CVC: 25, V: 10 };

  function heceTuru(h) {
    if (h.length === 1) return 'V';
    if (h.length === 2) return T.unluMu(h[0]) ? 'VC' : 'CV';
    return 'CVC';   // ÜVÜ ve "tren", "kart" gibi gerçek heceler
  }

  /* Hece adayları ve taban ağırlıkları: türün payı, türdeki hece sayısına bölünür
     (böylece tür oranları korunur); gerçek kelimelerde geçen heceler biraz öne çıkar. */
  function heceAdaylari(h) {
    var dogal = {}, tum = {};
    h.dogalHeceler.forEach(function (x) { dogal[x] = true; tum[x] = true; });
    Object.keys(h.heceTurleri).forEach(function (k) { h.heceTurleri[k].forEach(function (x) { tum[x] = true; }); });
    var liste = Object.keys(tum), sayi = {};
    liste.forEach(function (x) { var t = heceTuru(x); sayi[t] = (sayi[t] || 0) + 1; });
    var taban = {};
    liste.forEach(function (x) { var t = heceTuru(x); taban[x] = HECE_PAY[t] / sayi[t] * (dogal[x] ? 1.5 : 1); });
    return { liste: liste, taban: taban };
  }

  /* Ağırlıklı, tekrarsız seçim (havuz küçükse tekrar eder ama art arda değil) */
  function agirlikliSec(adaylar, adet, agirlikFn) {
    var secilen = [];
    var kalan = adaylar.slice();
    while (secilen.length < adet && adaylar.length) {
      if (!kalan.length) kalan = adaylar.slice();
      var son = secilen[secilen.length - 1];
      var uygun = kalan.filter(function (x) { return x !== son; });
      if (!uygun.length) uygun = kalan;
      var agirliklar = uygun.map(agirlikFn);
      var toplam = agirliklar.reduce(function (s, a) { return s + a; }, 0);
      var r = Math.random() * toplam, i = 0;
      for (; i < uygun.length - 1; i++) { r -= agirliklar[i]; if (r <= 0) break; }
      secilen.push(uygun[i]);
      kalan.splice(kalan.indexOf(uygun[i]), 1);
    }
    return secilen;
  }

  function oge(tur, metin) {
    var o = { tur: tur, metin: metin };
    if (tur === 'cumle') {
      o.parcalar = T.parcala(metin).map(function (p) {
        if (p.tur === 'kelime') p.heceler = T.hecele(p.metin);
        return p;
      });
    } else {
      o.heceler = tur === 'hece' ? [metin] : T.hecele(metin);
    }
    return o;
  }

  /*
   * ayar: { harfler, tur: 'hece'|'kelime'|'cumle'|'karisik', adet,
   *         yeniHarf, zorluk: {metin: puan}, gorulme: {metin: kaç kez gösterildi} }
   *
   * Seçim ağırlığı = taban × tazelik × zorluk × yeni harf
   *  - tazelik: en az gösterilenler öne çıkar (her fazla gösterim ×0,25). Havuzdaki her
   *    öğe sırayla gelir ama sıra rastgeledir; aynı öğeler sürekli seçilmez.
   *  - zorluk: önceden yanlış okunanlar daha sık gelir (en fazla ×3).
   *  - yeni harf: öğrencinin yeni eklediği harfi içerenler biraz öne çıkar (×1,5).
   */
  function tur(ayar) {
    var h = havuz(ayar.harfler);
    var adet = ayar.adet || 10;
    var zorluk = ayar.zorluk || {};
    var gorulme = ayar.gorulme || {};
    var yeni = ayar.yeniHarf ? T.kucuk(ayar.yeniHarf) : null;

    function sec(adaylar, n, taban) {
      if (!adaylar.length || n <= 0) return [];
      var kac = function (m) { return gorulme[T.kucuk(m)] || 0; };
      var enAz = Math.min.apply(null, adaylar.map(kac));
      return agirlikliSec(adaylar, n, function (m) {
        var k = T.kucuk(m);
        var a = (taban ? taban[m] : 1) * Math.pow(0.25, kac(m) - enAz);
        a *= 1 + 0.5 * Math.min(4, Math.max(0, zorluk[k] || 0));
        if (yeni && T.harflerinde(m).indexOf(yeni) !== -1) a *= 1.5;
        return a;
      });
    }

    function heceler(n) {
      var ha = heceAdaylari(h);
      return sec(ha.liste, n, ha.taban).map(function (x) { return oge('hece', x); });
    }
    function kelimeler(n) {
      return sec(h.kelimeler, n).map(function (x) { return oge('kelime', x); });
    }
    function cumleler(n) {
      return sec(h.cumleler, n).map(function (x) { return oge('cumle', x); });
    }

    var liste;
    if (ayar.tur === 'hece') liste = heceler(adet);
    else if (ayar.tur === 'kelime') liste = kelimeler(adet);
    else if (ayar.tur === 'cumle') liste = cumleler(adet);
    else {
      // Karışık: kolaydan zora — heceler, kelimeler, cümleler
      var nC = h.cumleler.length ? Math.round(adet * 0.2) : 0;
      var nK = h.kelimeler.length ? Math.round(adet * 0.5) : 0;
      var nH = adet - nC - nK;
      liste = heceler(nH).concat(kelimeler(nK), cumleler(nC));
    }
    return { havuz: h, ogeler: liste };
  }

  // Doğrulanmış ses tablosunun kapsaması gereken tüm heceler ve kelimeler (küçük harf) ve cümleler
  function tumOgeler() {
    var harfler = T.SIRALAR.klasik.harfler;
    var h = heceUret(harfler), heceler = {};
    Object.keys(h).forEach(function (k) { h[k].forEach(function (x) { heceler[x] = true; }); });
    Object.keys(DOGAL).forEach(function (x) { if (!YASAK_HECE[x]) heceler[x] = true; });
    return { heceler: Object.keys(heceler), kelimeler: tekillestir(V.KELIMELER.map(T.kucuk)), cumleler: tekillestir(V.CUMLELER) };
  }

  var Uretici = { havuz: havuz, tur: tur, heceUret: heceUret, tumOgeler: tumOgeler, karistir: karistir, YASAK_HECE: YASAK_HECE };
  kok.Uretici = Uretici;
  if (typeof module !== 'undefined' && module.exports) module.exports = Uretici;
})(typeof window !== 'undefined' ? window : globalThis);
