/* Türkçe yardımcıları: harf sıraları, küçük/büyük harf, heceleme */
(function (kok) {
  'use strict';

  // Ses grubu sıraları (öğretmen ayarlardan seçer)
  var SIRALAR = {
    klasik: {
      ad: 'Klasik sıra (A N E T İ L …)',
      harfler: ['a', 'n', 'e', 't', 'i', 'l', 'o', 'k', 'u', 'r', 'ı', 'm', 'ü', 's', 'ö', 'y', 'd', 'z', 'ç', 'b', 'g', 'c', 'ş', 'ğ', 'p', 'h', 'v', 'f', 'j']
    },
    meb: {
      ad: 'MEB 2019 sırası (E L A K İ N …)',
      harfler: ['e', 'l', 'a', 'k', 'i', 'n', 'o', 'm', 'u', 't', 'ü', 'y', 'ö', 'r', 'ı', 'd', 's', 'b', 'z', 'ç', 'g', 'ş', 'c', 'p', 'h', 'v', 'ğ', 'f', 'j']
    }
  };

  var UNLULER = ['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü'];
  var UNLU_SET = {};
  UNLULER.forEach(function (h) { UNLU_SET[h] = true; });

  // Şapkalı harfleri sade karşılığına indir (kâğıt -> kağıt)
  var SAPKA = { 'â': 'a', 'î': 'i', 'û': 'u', 'Â': 'A', 'Î': 'İ', 'Û': 'U' };

  function kucuk(s) { return String(s).toLocaleLowerCase('tr-TR'); }
  function buyuk(s) { return String(s).toLocaleUpperCase('tr-TR'); }

  function sade(s) {
    return String(s).replace(/[âîûÂÎÛ]/g, function (c) { return SAPKA[c]; });
  }

  function harfMi(c) { return /[a-zçğıöşüâîû]/.test(kucuk(c)); }
  function unluMu(c) { return !!UNLU_SET[kucuk(c)]; }

  // Metindeki harfler (küçük, sade) — noktalama/boşluk atılır
  function harflerinde(metin) {
    var sonuc = [];
    var s = kucuk(sade(metin));
    for (var i = 0; i < s.length; i++) if (harfMi(s[i])) sonuc.push(s[i]);
    return sonuc;
  }

  // Metin yalnızca izin verilen harflerden mi oluşuyor?
  function okunabilirMi(metin, izinliSet) {
    var h = harflerinde(metin);
    if (!h.length) return false;
    for (var i = 0; i < h.length; i++) if (!izinliSet[h[i]]) return false;
    return true;
  }

  /*
   * Türkçe heceleme: her hecede bir ünlü bulunur.
   * İki ünlü arasında ünsüz yoksa ünlülerin arasından,
   * en az bir ünsüz varsa son ünsüzün önünden bölünür.
   *   an-ne, sa-at, türk-çe, ki-tap
   */
  function hecele(kelime) {
    var k = String(kelime);
    var unluYer = [];
    for (var i = 0; i < k.length; i++) if (unluMu(sade(k[i]))) unluYer.push(i);
    if (unluYer.length < 2) return [k];
    var parcalar = [];
    var bas = 0;
    for (var j = 1; j < unluYer.length; j++) {
      var onceki = unluYer[j - 1], simdiki = unluYer[j];
      var arada = simdiki - onceki - 1;
      var kesim = arada === 0 ? simdiki : simdiki - 1;
      parcalar.push(k.slice(bas, kesim));
      bas = kesim;
    }
    parcalar.push(k.slice(bas));
    return parcalar;
  }

  // Cümleyi kelime ve aradaki işaretlere ayır: [{tur:'kelime'|'ara', metin}]
  function parcala(cumle) {
    var sonuc = [];
    var re = /([A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû']+)|([^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû']+)/g;
    var m;
    while ((m = re.exec(cumle)) !== null) {
      sonuc.push(m[1] ? { tur: 'kelime', metin: m[1] } : { tur: 'ara', metin: m[2] });
    }
    return sonuc;
  }

  // Karşılaştırma için normalleştir (küçük harf, sadece harf ve tek boşluk)
  function normal(s) {
    return kucuk(sade(s)).replace(/[^a-zçğıöşü ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Levenshtein benzerliği (0..1)
  function benzerlik(a, b) {
    a = normal(a); b = normal(b);
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    var onceki = [], i, j;
    for (j = 0; j <= b.length; j++) onceki[j] = j;
    for (i = 1; i <= a.length; i++) {
      var satir = [i];
      for (j = 1; j <= b.length; j++) {
        var maliyet = a[i - 1] === b[j - 1] ? 0 : 1;
        satir[j] = Math.min(onceki[j] + 1, satir[j - 1] + 1, onceki[j - 1] + maliyet);
      }
      onceki = satir;
    }
    return 1 - onceki[b.length] / Math.max(a.length, b.length);
  }

  var Turkce = {
    SIRALAR: SIRALAR,
    UNLULER: UNLULER,
    kucuk: kucuk,
    buyuk: buyuk,
    sade: sade,
    unluMu: unluMu,
    harflerinde: harflerinde,
    okunabilirMi: okunabilirMi,
    hecele: hecele,
    parcala: parcala,
    normal: normal,
    benzerlik: benzerlik
  };

  kok.Turkce = Turkce;
  if (typeof module !== 'undefined' && module.exports) module.exports = Turkce;
})(typeof window !== 'undefined' ? window : globalThis);
