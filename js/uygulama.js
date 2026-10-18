/* Hecele – arayüz ve akış */
(function () {
  'use strict';

  var T = window.Turkce, U = window.Uretici, S = window.Ses;
  function $(id) { return document.getElementById(id); }
  function rastgele(dizi) { return dizi[Math.floor(Math.random() * dizi.length)]; }
  function el(etiket, sinif, metin) {
    var e = document.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin !== undefined) e.textContent = metin;
    return e;
  }

  /* ---------- Kayıt ---------- */

  var KAYIT = 'hecele.v1';            // önekli ad: kökendeki diğer uygulamalarla karışmasın
  try {                                // eski sürümün kaydını bir kez taşı
    var eskiKayit = localStorage.getItem('mn-su.hecele.v1');
    if (eskiKayit && !localStorage.getItem(KAYIT)) localStorage.setItem(KAYIT, eskiKayit);
    localStorage.removeItem('mn-su.hecele.v1');
  } catch (e) { /* yoksay */ }
  var veri = {
    ayar: {
      sira: 'klasik', harfler: [], yazi: 'dogal', renkli: true, hecele: true,
      hiz: 0.85, ton: 0, hassasiyet: 'fp32', mikrofon: false, adet: 10, efekt: true
    },
    yildiz: 0,
    turSayisi: 0,
    zorluk: {},
    gorulme: {},       // öğe → kaç kez gösterildi (seçimde az gösterilenler öne çıkar)
    harfEklenme: {}    // harf → sonradan eklendiği zaman (ilk seçimdeki harfler yeni sayılmaz)
  };

  try {
    var kayitli = JSON.parse(localStorage.getItem(KAYIT) || 'null');
    if (kayitli) {
      Object.assign(veri.ayar, kayitli.ayar || {});
      veri.yildiz = kayitli.yildiz || 0;
      veri.turSayisi = kayitli.turSayisi || 0;
      veri.zorluk = kayitli.zorluk || {};
      veri.gorulme = kayitli.gorulme || {};
      veri.harfEklenme = kayitli.harfEklenme || {};
    }
  } catch (e) { /* kayıt yoksa varsayılanlar */ }
  if (!T.SIRALAR[veri.ayar.sira]) veri.ayar.sira = 'klasik';

  function kaydet() {
    try { localStorage.setItem(KAYIT, JSON.stringify(veri)); } catch (e) { /* gizli pencere vb. */ }
  }

  /* ---------- Yardımcılar ---------- */

  function siraHarfleri() { return T.SIRALAR[veri.ayar.sira].harfler; }
  function seciliHarfler() {
    return siraHarfleri().filter(function (h) { return veri.ayar.harfler.indexOf(h) !== -1; });
  }
  // Son 14 günde sonradan eklenen harflerin en yenisi (yoksa null)
  var YENI_SURE = 14 * 24 * 3600 * 1000;
  function yeniHarf() {
    var enYeni = null, zaman = 0;
    seciliHarfler().forEach(function (h) {
      var t = veri.harfEklenme[h] || 0;
      if (t > zaman && Date.now() - t < YENI_SURE) { zaman = t; enYeni = h; }
    });
    return enYeni;
  }

  function goster(metin) {
    if (veri.ayar.yazi === 'buyuk') return T.buyuk(metin);
    if (veri.ayar.yazi === 'kucuk') return T.kucuk(metin);
    return metin;
  }

  function harfTasi(h, sinif) {
    var b = el('span', 'harf-tas ' + (T.unluMu(h) ? 'unlu' : 'unsuz') + (sinif ? ' ' + sinif : ''));
    b.appendChild(document.createTextNode(T.buyuk(h)));
    b.appendChild(el('small', '', h));
    return b;
  }

  // Maskotlar
  var sablon = $('maskot-sablon');
  document.querySelectorAll('[data-maskot]').forEach(function (yer) {
    yer.appendChild(sablon.content.cloneNode(true));
  });
  function maskot(yer, durum) {
    yer.classList.remove('mutlu', 'dinliyor', 'dusunuyor', 'konusuyor');
    void yer.offsetWidth;
    if (durum) yer.classList.add(durum);
  }
  function balon(yer, metin) {
    yer.textContent = metin;
    yer.classList.remove('yeni');
    void yer.offsetWidth;
    yer.classList.add('yeni');
  }

  function ekran(ad) {
    document.querySelectorAll('.ekran').forEach(function (e) {
      e.classList.toggle('aktif', e.id === 'ekran-' + ad);
    });
  }

  /* ---------- Harf seçimi (öğrenci) ---------- */

  var harfSecimi = [];

  function harfEkraniniAc(ilkKez, secimiKoru) {
    if (!secimiKoru) harfSecimi = veri.ayar.harfler.slice();
    $('harf-geri').hidden = !!ilkKez;
    var kap = $('harf-secim');
    kap.innerHTML = '';
    siraHarfleri().forEach(function (h) {
      var b = el('button', 'secim-tas ' + (T.unluMu(h) ? 'unlu' : 'unsuz'));
      b.type = 'button';
      b.appendChild(document.createTextNode(T.buyuk(h)));
      b.appendChild(el('small', '', h));
      b.setAttribute('aria-label', T.buyuk(h) + ' harfi');
      b.onclick = function () {
        var i = harfSecimi.indexOf(h);
        if (i === -1) harfSecimi.push(h); else harfSecimi.splice(i, 1);
        S.Efekt.tik();
        harfTaslariniGuncelle();
      };
      b.dataset.harf = h;
      kap.appendChild(b);
    });
    if (!secimiKoru) balon($('harf-balon'), ilkKez ? 'Merhaba! Hangi harfleri öğrendin? Bildiğin harflere dokun!' : 'Yeni harf mi öğrendin? Ona da dokun!');
    harfTaslariniGuncelle();
    ekran('harf');
  }

  function harfTaslariniGuncelle() {
    document.querySelectorAll('#harf-secim .secim-tas').forEach(function (b) {
      var secili = harfSecimi.indexOf(b.dataset.harf) !== -1;
      b.classList.toggle('secili', secili);
      b.setAttribute('aria-pressed', String(secili));
    });
    var unlu = harfSecimi.filter(T.unluMu).length;
    var unsuz = harfSecimi.length - unlu;
    var hazir = unlu > 0 && unsuz > 0;
    $('harf-tamam').disabled = !hazir;
    $('harf-ozet').textContent = harfSecimi.length ? harfSecimi.length + ' harf seçtin' : 'Henüz harf seçmedin';
    if (harfSecimi.length && !unlu) balon($('harf-balon'), 'Bir de sesli harf seç: a, e, ı, i, o, ö, u, ü');
    else if (harfSecimi.length && !unsuz) balon($('harf-balon'), 'Bir de sessiz harf seç: n, t, l, k…');
    else if (hazir && $('harf-balon').dataset.hazir !== '1') balon($('harf-balon'), 'Harika! Başka bildiğin harf varsa ona da dokun, sonra “Hazırım!”');
    $('harf-balon').dataset.hazir = hazir ? '1' : '';
  }

  $('harf-tamam').onclick = function () {
    var onceki = veri.ayar.harfler;
    if (onceki.length) {
      // Sonradan eklenen harfler "yeni" olarak işaretlenir; çıkarılanların işareti silinir
      harfSecimi.forEach(function (h) { if (onceki.indexOf(h) === -1) veri.harfEklenme[h] = Date.now(); });
      Object.keys(veri.harfEklenme).forEach(function (h) { if (harfSecimi.indexOf(h) === -1) delete veri.harfEklenme[h]; });
    }
    veri.ayar.harfler = harfSecimi.slice();
    kaydet();
    S.Efekt.dogru();
    anaEkraniniAc();
    maskot($('ekran-ana').querySelector('[data-maskot]'), 'mutlu');
    balon($('ana-balon'), 'Süper! Bu harflerle neler okuyabiliriz bakalım!');
  };
  $('harf-geri').onclick = anaEkraniniAc;
  $('harf-degistir').onclick = function () { harfEkraniniAc(false); };

  /* ---------- Ana ekran ---------- */

  function anaEkraniniAc() {
    var serit = $('ana-harfler');
    serit.innerHTML = '';
    var yeni = yeniHarf();
    seciliHarfler().forEach(function (h) {
      var t = harfTasi(h);
      if (h === yeni) t.appendChild(el('span', 'yeni-rozet', 'yeni'));
      serit.appendChild(t);
    });
    var h = U.havuz(seciliHarfler());
    var heceSayisi = Object.keys(h.heceTurleri).reduce(function (s, k) { return s + h.heceTurleri[k].length; }, 0);
    var sayilar = { hece: heceSayisi + ' hece', kelime: h.kelimeler.length + ' kelime', cumle: h.cumleler.length + ' cümle' };
    document.querySelectorAll('[data-sayi]').forEach(function (s) { s.textContent = sayilar[s.dataset.sayi]; });
    document.querySelector('[data-mod="kelime"]').disabled = !h.kelimeler.length;
    document.querySelector('[data-mod="cumle"]').disabled = !h.cumleler.length;
    $('ana-yildiz').textContent = veri.yildiz;
    balon($('ana-balon'), rastgele(['Merhaba! Bugün ne okuyalım?', 'Haydi okuyalım!', 'Hangisini seçeceksin?']));
    ekran('ana');
  }

  document.querySelectorAll('.mod-kart').forEach(function (b) {
    b.onclick = function () { turaBasla(b.dataset.mod); };
  });

  /* ---------- Okuma turu ---------- */

  var tur = null;
  var kartNo = 0;           // kart değişince süren okumalar durur
  var kelimeElleri = [];    // kartın kelime öğeleri
  var okumaMaskot = $('okuma-maskot');
  var okumaBalon = $('okuma-balon');

  var OVGULER = ['Aferin!', 'Harika!', 'Süpersin!', 'Çok güzel okudun!', 'Bravo!', 'Müthiş!', 'İşte böyle!'];
  var OKU_MESAJ = ['Önce sen oku!', 'Haydi, sen oku!', 'Hece hece, yavaşça oku.', 'Bunu okuyabilir misin?'];

  function mikrofonAcik() { return veri.ayar.mikrofon && S.destek.tanima && !(tur && tur.mikrofonKapandi); }

  var sonMod = 'karisik';

  function turaBasla(mod) {
    sonMod = mod;
    var sonuc = U.tur({
      harfler: seciliHarfler(), tur: mod, adet: +veri.ayar.adet, yeniHarf: yeniHarf(),
      zorluk: veri.zorluk, gorulme: veri.gorulme
    });
    if (!sonuc.ogeler.length) {
      maskot($('ekran-ana').querySelector('[data-maskot]'), 'dusunuyor');
      balon($('ana-balon'), 'Bu harflerle henüz okunacak bir şey yok. Biraz daha harf öğrenelim!');
      return;
    }
    tur = { mod: mod, ogeler: sonuc.ogeler, i: 0, sonuclar: [], yildiz: 0 };
    $('tur-yildiz').textContent = '0';
    ekran('okuma');
    kartGoster();
  }

  function grup(ad) {
    document.querySelectorAll('.kontroller .grup').forEach(function (g) { g.hidden = g.dataset.grup !== ad; });
  }

  function kilit(deger) {
    document.querySelectorAll('.kontroller .grup button, #tekrar-dinle').forEach(function (b) { b.disabled = deger; });
  }

  function ilerlemeCiz() {
    var kap = $('ilerleme');
    kap.innerHTML = '';
    tur.ogeler.forEach(function (_, i) {
      var nokta = el('i');
      var s = tur.sonuclar[i];
      if (s) nokta.className = s.gecildi ? 'gecti' : (s.altin ? 'altin' : 'gumus');
      else if (i === tur.i) nokta.className = 'simdi';
      kap.appendChild(nokta);
    });
  }

  function kelimeOgesi(metin, heceler) {
    var k = el('span', 'kelime');
    heceler.forEach(function (h, i) {
      var s = el('span', 'hece h' + (i % 2), goster(h));
      s.onclick = function () {
        if (tur && tur.mesgul) return;
        s.classList.add('aktif');
        S.konus(T.kucuk(h), { tur: 'hece' }).then(function () { s.classList.remove('aktif'); });
      };
      k.appendChild(s);
    });
    return k;
  }

  function kartCiz(oge) {
    var m = $('metin');
    m.innerHTML = '';
    m.className = 'metin ' + oge.tur + (veri.ayar.renkli ? ' renkli' : '');
    kelimeElleri = [];
    if (oge.tur === 'cumle') {
      if (oge.metin.length > 22) m.classList.add('uzun');
      var son = null;
      oge.parcalar.forEach(function (p) {
        if (p.tur === 'kelime') {
          son = el('span', 'sozcuk');
          var k = kelimeOgesi(p.metin, p.heceler);
          son.appendChild(k);
          m.appendChild(son);
          kelimeElleri.push(k);
        } else {
          var isaret = p.metin.trim();
          if (isaret && son) son.appendChild(el('span', 'noktalama', isaret));
        }
      });
    } else {
      var k = kelimeOgesi(oge.metin, oge.heceler);
      m.appendChild(k);
      kelimeElleri.push(k);
      if (oge.heceler.length === 1) m.classList.add('tek');
    }
  }

  function seslendirilecekler(oge) {
    var liste = [];
    if (oge.tur === 'kelime' && oge.heceler.length > 1) {
      oge.heceler.forEach(function (h) { liste.push({ metin: T.kucuk(h), tur: 'hece' }); });
    }
    liste.push({ metin: oge.tur === 'hece' ? T.kucuk(oge.metin) : oge.metin, tur: oge.tur });
    return liste;
  }

  function kartGoster() {
    kartNo++;
    var oge = tur.ogeler[tur.i];
    var gk = T.kucuk(oge.metin);
    veri.gorulme[gk] = (veri.gorulme[gk] || 0) + 1;
    kaydet();
    tur.deneme = 0;
    tur.oncedenDinledi = false;
    tur.mesgul = false;
    kartCiz(oge);
    var kart = $('kart');
    kart.classList.remove('git', 'basari', 'hata');
    void kart.offsetWidth;
    kart.classList.add('gel');
    $('duyulan').textContent = '';
    ilerlemeCiz();

    var mik = mikrofonAcik();
    $('mikrofon-dugme').hidden = !mik;
    $('itiraz-dugme').hidden = true;
    $('dinle-dugme').innerHTML = mik ? '<span>🔊</span> Dinle' : '<span>🔊</span> Okudum, dinleyelim!';
    $('dinle-dugme').className = 'dugme buyuk ' + (mik ? 'mavi' : 'mavi');
    grup('oku');
    kilit(false);
    maskot(okumaMaskot, null);
    balon(okumaBalon, mik ? 'Mikrofona dokun ve sesli oku!' : rastgele(OKU_MESAJ));

    // Bu kartın ve sonrakinin seslerini önceden hazırla
    var hazirla = seslendirilecekler(oge);
    if (tur.ogeler[tur.i + 1]) hazirla = hazirla.concat(seslendirilecekler(tur.ogeler[tur.i + 1]));
    S.onHazirla(hazirla);
  }

  function vurgula(kelimeIndeksi, heceIndeksi) {
    document.querySelectorAll('#metin .aktif').forEach(function (e) { e.classList.remove('aktif'); });
    var k = kelimeElleri[kelimeIndeksi];
    if (!k) return;
    if (heceIndeksi === undefined) k.classList.add('aktif');
    else if (k.children[heceIndeksi]) k.children[heceIndeksi].classList.add('aktif');
  }

  var sesBekleniyor = false;

  /* Kartı seslendirir. yavas: hece hece / kelime kelime okur. */
  async function kartiOku(yavas) {
    var benim = kartNo;
    var oge = tur.ogeler[tur.i];
    maskot(okumaMaskot, 'konusuyor');
    if (S.durum().durum === 'yukleniyor') {
      sesBekleniyor = true;
      balon(okumaBalon, 'Sesim hazırlanıyor, biraz bekle…');
    }
    var devam = true;
    function gecerli(sonuc) { sesBekleniyor = false; devam = sonuc !== false && benim === kartNo; return devam; }

    if (oge.tur === 'hece') {
      vurgula(0);
      gecerli(await S.konus(T.kucuk(oge.metin), { tur: 'hece' }));
    } else if (oge.tur === 'kelime') {
      if ((veri.ayar.hecele || yavas) && oge.heceler.length > 1) {
        for (var i = 0; i < oge.heceler.length && devam; i++) {
          vurgula(0, i);
          if (gecerli(await S.konus(T.kucuk(oge.heceler[i]), { tur: 'hece' }))) await S.bekle(160);
        }
        if (devam) await S.bekle(150);
      }
      if (devam && benim === kartNo) {
        vurgula(0);
        gecerli(await S.konus(oge.metin, { tur: 'kelime' }));
      }
    } else if (yavas) {
      var kelimeler = oge.parcalar.filter(function (p) { return p.tur === 'kelime'; });
      for (var j = 0; j < kelimeler.length && devam; j++) {
        vurgula(j);
        if (gecerli(await S.konus(kelimeler[j].metin, { tur: 'kelime' }))) await S.bekle(220);
      }
    } else {
      gecerli(await S.konus(oge.metin, { kelime: function (w) { if (benim === kartNo) vurgula(w); } }));
    }
    if (benim === kartNo) {
      vurgula(-1);
      maskot(okumaMaskot, null);
    }
    return devam && benim === kartNo;
  }

  $('dinle-dugme').onclick = async function () {
    if (!tur || tur.mesgul) return;
    tur.mesgul = true;
    kilit(true);
    if (mikrofonAcik()) tur.oncedenDinledi = true;
    else balon(okumaBalon, 'Şimdi dinle…');
    var tamam = await kartiOku(tur.deneme > 0);
    if (!tur) return;
    tur.mesgul = false;
    kilit(false);
    if (!tamam) return;
    if (mikrofonAcik()) {
      balon(okumaBalon, 'Şimdi sen oku! Mikrofona dokun.');
    } else {
      grup('degerlendir');
      balon(okumaBalon, 'Sen de böyle mi okudun?');
    }
  };

  $('tekrar-dinle').onclick = async function () {
    if (!tur || tur.mesgul) return;
    tur.mesgul = true;
    kilit(true);
    if (mikrofonAcik() && $('ekran-okuma').querySelector('[data-grup="oku"]').hidden === false) tur.oncedenDinledi = true;
    await kartiOku(true);
    if (!tur) return;
    tur.mesgul = false;
    kilit(false);
  };

  function zorlukDegistir(oge, fark) {
    var k = T.kucuk(oge.metin);
    var z = Math.max(0, Math.min(6, (veri.zorluk[k] || 0) + fark));
    if (z) veri.zorluk[k] = z; else delete veri.zorluk[k];
  }

  function yildizUcur(altin) {
    var kart = $('kart').getBoundingClientRect();
    var hedef = $('tur-yildiz').getBoundingClientRect();
    var y = el('span', 'ucan-yildiz', '⭐');
    if (!altin) y.style.filter = 'grayscale(1) brightness(1.15)';
    y.style.left = (kart.left + kart.width / 2 - 32) + 'px';
    y.style.top = (kart.top + kart.height / 2 - 32) + 'px';
    document.body.appendChild(y);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        y.style.transform = 'translate(' + (hedef.left - kart.left - kart.width / 2 + 20) + 'px,' +
          (hedef.top - kart.top - kart.height / 2 + 10) + 'px) scale(.4)';
        y.style.opacity = '.3';
      });
    });
    setTimeout(function () {
      y.remove();
      $('tur-yildiz').textContent = tur ? tur.yildiz : 0;
      var sayac = $('tur-yildiz').parentNode;
      sayac.classList.remove('zipla'); void sayac.offsetWidth; sayac.classList.add('zipla');
    }, 820);
  }

  async function dogruOkudu() {
    if (!tur) return;
    var oge = tur.ogeler[tur.i];
    var altin = tur.deneme === 0 && !tur.oncedenDinledi;
    zorlukDegistir(oge, altin ? -1 : 0);
    tur.sonuclar.push({ oge: oge, altin: altin });
    tur.yildiz++;
    veri.yildiz++;
    kaydet();
    tur.mesgul = true;
    kilit(true);
    S.Efekt.dogru();
    maskot(okumaMaskot, 'mutlu');
    balon(okumaBalon, rastgele(OVGULER));
    $('kart').classList.add('basari');
    yildizUcur(altin);
    ilerlemeCiz();
    var benim = kartNo;
    await S.bekle(1300);
    if (tur && benim === kartNo) sonrakiKart();
  }

  async function birDaha() {
    if (!tur || tur.mesgul) return;
    var oge = tur.ogeler[tur.i];
    tur.deneme++;
    zorlukDegistir(oge, 2);
    kaydet();
    tur.mesgul = true;
    kilit(true);
    S.Efekt.tekrar();
    maskot(okumaMaskot, 'dusunuyor');
    var kart = $('kart');
    kart.classList.remove('hata'); void kart.offsetWidth; kart.classList.add('hata');
    balon(okumaBalon, 'Sorun değil! Birlikte yavaşça okuyalım.');
    await S.bekle(700);
    var tamam = await kartiOku(true);
    if (!tur) return;
    tur.mesgul = false;
    kilit(false);
    if (!tamam) return;
    grup('oku');
    balon(okumaBalon, mikrofonAcik() ? 'Şimdi sen dene! Mikrofona dokun.' : 'Şimdi sen oku!');
  }

  $('dogru-dugme').onclick = dogruOkudu;
  $('tekrar-dugme').onclick = birDaha;
  $('itiraz-dugme').onclick = dogruOkudu;

  $('gec-dugme').onclick = function () {
    if (!tur) return;
    S.sustur();
    S.dinlemeyiDurdur();
    zorlukDegistir(tur.ogeler[tur.i], 1);
    kaydet();
    tur.sonuclar.push({ oge: tur.ogeler[tur.i], gecildi: true });
    sonrakiKart();
  };

  function sonrakiKart() {
    S.sustur();
    kartNo++;
    var kart = $('kart');
    kart.classList.remove('gel');
    kart.classList.add('git');
    setTimeout(function () {
      if (!tur) return;
      tur.i++;
      if (tur.i >= tur.ogeler.length) turBitti();
      else kartGoster();
    }, 330);
  }

  /* ---------- Mikrofonla okuma ---------- */

  function eslesir(oge, alternatifler) {
    var hedef = T.normal(oge.metin);
    return alternatifler.some(function (a) {
      var n = T.normal(a);
      if (n === hedef) return true;
      var kelimeler = n.split(' ');
      if (oge.tur === 'hece') return kelimeler.indexOf(hedef) !== -1 || T.benzerlik(n, hedef) >= 0.66;
      if (oge.tur === 'kelime') return kelimeler.indexOf(hedef) !== -1 || T.benzerlik(n, hedef) >= 0.8;
      return T.benzerlik(n, hedef) >= 0.8;
    });
  }

  $('mikrofon-dugme').onclick = async function () {
    if (!tur || tur.mesgul) return;
    var oge = tur.ogeler[tur.i];
    var benim = kartNo;
    S.sustur();
    tur.mesgul = true;
    grup('dinliyor');
    $('itiraz-dugme').hidden = true;
    $('duyulan').textContent = '';
    maskot(okumaMaskot, 'dinliyor');
    balon(okumaBalon, 'Dinliyorum… Sesli oku!');
    var alternatifler;
    try {
      alternatifler = await S.dinle({ sure: oge.tur === 'cumle' ? 9000 : 5000 });
    } catch (e) {
      if (!tur || benim !== kartNo) return;
      tur.mesgul = false;
      mikrofonHatasi(e);
      return;
    }
    if (!tur || benim !== kartNo) return;
    maskot(okumaMaskot, null);
    grup('oku');
    tur.mesgul = false;
    if (!alternatifler.length) {
      balon(okumaBalon, 'Seni duyamadım. Biraz daha yüksek sesle oku!');
      return;
    }
    var d = $('duyulan');
    d.textContent = 'Duyduğum: ';
    d.appendChild(el('b', '', alternatifler[0]));

    if (eslesir(oge, alternatifler)) {
      tur.mesgul = true;
      kilit(true);
      balon(okumaBalon, 'Doğru! Bir de benden dinle:');
      await kartiOku(false);
      if (!tur || benim !== kartNo) return;
      tur.mesgul = false;
      dogruOkudu();
    } else {
      tur.deneme++;
      zorlukDegistir(oge, 2);
      kaydet();
      S.Efekt.tekrar();
      tur.mesgul = true;
      kilit(true);
      balon(okumaBalon, 'Tam olmadı. Bir dinle bakalım:');
      await kartiOku(true);
      if (!tur || benim !== kartNo) return;
      tur.mesgul = false;
      kilit(false);
      balon(okumaBalon, 'Şimdi bir daha dene!');
      $('itiraz-dugme').hidden = false;
    }
  };

  $('dinlemeyi-bitir').onclick = function () { S.dinlemeyiDurdur(); };

  function mikrofonHatasi(e) {
    var mesaj = {
      'not-allowed': 'Mikrofon izni verilmedi. Kendin kontrol edelim.',
      'service-not-allowed': 'Mikrofon izni verilmedi. Kendin kontrol edelim.',
      'network': 'Mikrofon kontrolü için internet gerekiyor. Kendin kontrol edelim.',
      'audio-capture': 'Mikrofon bulunamadı. Kendin kontrol edelim.'
    }[e.message] || 'Mikrofon çalışmadı. Kendin kontrol edelim.';
    tur.mikrofonKapandi = true;
    maskot(okumaMaskot, 'dusunuyor');
    $('mikrofon-dugme').hidden = true;
    $('dinle-dugme').innerHTML = '<span>🔊</span> Okudum, dinleyelim!';
    grup('oku');
    kilit(false);
    balon(okumaBalon, mesaj);
  }

  /* ---------- Tur sonu ---------- */

  function konfeti(adet) {
    var kap = $('konfeti');
    var renkler = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#a855f7', '#ec4899'];
    for (var i = 0; i < adet; i++) {
      var p = el('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = rastgele(renkler);
      p.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      p.style.setProperty('--don', (Math.random() * 1080 - 540) + 'deg');
      p.style.animationDuration = (2 + Math.random() * 1.8) + 's';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      kap.appendChild(p);
    }
    setTimeout(function () { kap.innerHTML = ''; }, 4500);
  }

  function turBitti() {
    var altin = tur.sonuclar.filter(function (s) { return s.altin; }).length;
    var okunan = tur.sonuclar.filter(function (s) { return !s.gecildi; }).length;
    var toplam = tur.ogeler.length;
    veri.turSayisi++;
    kaydet();

    $('sonuc-baslik').textContent = altin === toplam ? 'Mükemmel!' : okunan >= toplam * 0.7 ? 'Harika!' : 'Aferin!';
    $('sonuc-alt').textContent = tur.yildiz + ' yıldız kazandın! ' +
      (altin ? altin + ' tanesini ilk denemede okudun.' : 'Çalıştıkça daha da iyi olacaksın.');

    var yildizlar = $('sonuc-yildizlar');
    yildizlar.innerHTML = '';
    tur.sonuclar.forEach(function (s, i) {
      var y = el('span', s.altin ? '' : 'gumus', s.gecildi ? '▫️' : '⭐');
      y.style.animationDelay = (0.3 + i * 0.08) + 's';
      yildizlar.appendChild(y);
    });

    var zorlar = $('sonuc-zorlar');
    zorlar.innerHTML = '';
    var gorulen = {};
    tur.sonuclar.forEach(function (s) {
      var k = T.kucuk(s.oge.metin);
      if (s.altin || gorulen[k]) return;
      gorulen[k] = true;
      var c = el('button', 'zor-cip', goster(s.oge.metin));
      c.type = 'button';
      c.onclick = function () { S.konus(s.oge.metin, { tur: s.oge.tur }); };
      zorlar.appendChild(c);
    });

    tur = null;
    ekran('sonuc');
    maskot($('sonuc-maskot'), 'mutlu');
    S.Efekt.kutlama();
    konfeti(110);
  }

  $('yeni-tur').onclick = function () { turaBasla(sonMod); };
  $('sonuc-ana').onclick = anaEkraniniAc;
  $('eve-don').onclick = function () {
    S.sustur();
    S.dinlemeyiDurdur();
    tur = null;
    kartNo++;
    anaEkraniniAc();
  };

  /* ---------- Ses motoru durumu ---------- */

  // Model dosyaları bu cihazda mı? (değilse ilk açılıştır, indirme sürer)
  var modelCihazda = false;
  function modelDosyalariCihazdaMi() {
    if (!window.caches) return Promise.resolve(false);
    return caches.has('hecele-ema-models-v1').then(function (var_) {
      if (!var_) return false;
      return caches.open('hecele-ema-models-v1').then(function (c) { return c.keys(); })
        .then(function (k) { return k.length >= 4; });
    }).catch(function () { return false; });
  }
  modelDosyalariCihazdaMi().then(function (v) { modelCihazda = v; });

  var ARKA_AD = { webgpu: 'ekran kartında (WebGPU)', wasm: 'işlemcide (WASM)' };

  S.durumDinle(function (d) {
    // Önceki açılışlarda çökme olduysa yeniden deneme düğmesi görünsün
    $('motor-sifirla').hidden = !d.cokmeSeviyesi;
    var cip = $('motor-cip');
    var bilgi = $('motor-bilgi');
    if (d.durum === 'yukleniyor') {
      var yuzde = Math.round(d.ilerleme * 100);
      cip.hidden = false;
      var ne = modelCihazda ? 'Ses motoru başlatılıyor' : 'Ses dosyaları indiriliyor (yalnızca ilk açılışta, ~50 MB)';
      // Satır içi style= yazılmaz (CSP); genişlik DOM üzerinden verilir
      cip.innerHTML = '🦉 ' + ne + ' <span class="cubuk"><i></i></span> %' + yuzde;
      cip.querySelector('.cubuk i').style.width = yuzde + '%';
      bilgi.textContent = modelCihazda
        ? 'EMA Lightning başlatılıyor… %' + yuzde + ' (dosyalar bu cihazda; her açılışta belleğe yüklenir)'
        : 'EMA Lightning indiriliyor… %' + yuzde + ' (yalnızca ilk açılışta; sonra cihazdan yüklenir)';
      if (sesBekleniyor) balon(okumaBalon, 'Sesim hazırlanıyor, biraz bekle… %' + yuzde);
    } else if (d.durum === 'hazir') {
      cip.hidden = true;
      bilgi.textContent = '✅ EMA Lightning ' + ARKA_AD[d.arka] + ' çalışıyor (' + d.hassasiyet + ').' +
        (d.seviye >= 1 ? ' Bu cihaz için güvenli mod: ekran kartı kullanılmıyor.' : '');
    } else if (d.durum === 'hata') {
      cip.hidden = false;
      cip.textContent = '⚠️ EMA sesi açılamadı, tarayıcı sesi kullanılıyor';
      bilgi.textContent = d.seviye >= 2 ? '⚠️ ' + d.hata :
        '⚠️ EMA Lightning yüklenemedi: ' + (d.hata || 'bilinmeyen hata') + ' Şimdilik tarayıcının Türkçe sesi kullanılıyor.';
    }
  });

  /* ---------- Öğretmen ayarları ---------- */

  var dlg = $('ayarlar');

  function ayarlariDoldur() {
    var a = veri.ayar;
    var sira = $('ayar-sira');
    sira.innerHTML = '';
    Object.keys(T.SIRALAR).forEach(function (k) {
      var o = el('option', '', T.SIRALAR[k].ad);
      o.value = k;
      sira.appendChild(o);
    });
    sira.value = a.sira;
    $('ayar-yazi').value = a.yazi;
    $('ayar-renkli').checked = a.renkli;
    $('ayar-adet').value = String(a.adet);
    $('ayar-hassasiyet').value = a.hassasiyet;
    $('ayar-ton').value = String(a.ton);
    $('ayar-hiz').value = a.hiz;
    $('hiz-deger').textContent = (+a.hiz).toFixed(2) + '×';
    $('ayar-hecele').checked = a.hecele;
    $('ayar-efekt').checked = a.efekt;
    $('ayar-mikrofon').checked = a.mikrofon && S.destek.tanima;
    $('ayar-mikrofon').disabled = !S.destek.tanima;
    var mu = $('mikrofon-uyari');
    mu.hidden = S.destek.tanima;
    mu.textContent = 'Bu tarayıcı konuşma tanımayı desteklemiyor (Chrome veya Edge kullanın). Öğrenci kendini kontrol eder.';

    var h = U.havuz(seciliHarfler());
    $('havuz-bilgi').textContent = 'Seçili harfler: ' + (seciliHarfler().join(' ') || '—') + ' → ' +
      h.kelimeler.length + ' kelime, ' + h.cumleler.length + ' cümle okunabiliyor.';

    var zorlar = Object.keys(veri.zorluk).sort(function (x, y) { return veri.zorluk[y] - veri.zorluk[x]; }).slice(0, 10);
    $('ilerleme-bilgi').textContent = 'Toplam ' + veri.yildiz + ' yıldız, ' + veri.turSayisi + ' tur.' +
      (zorlar.length ? ' En çok zorlanılanlar: ' + zorlar.join(', ') : '');
    uygulamaBolumunuDoldur();
  }

  function ayarlariUygula() {
    var a = veri.ayar;
    S.Efekt.ac(a.efekt);
    return S.ayarla({ hiz: +a.hiz, ton: +a.ton, hassasiyet: a.hassasiyet });
  }

  function ayarDegisti(anahtarAd, deger) {
    veri.ayar[anahtarAd] = deger;
    kaydet();
    if (ayarlariUygula()) S.yenidenYukle();
    ayarlariDoldur();
  }

  $('ayar-sira').onchange = function (e) { ayarDegisti('sira', e.target.value); };
  $('ayar-yazi').onchange = function (e) { ayarDegisti('yazi', e.target.value); };
  $('ayar-renkli').onchange = function (e) { ayarDegisti('renkli', e.target.checked); };
  $('ayar-adet').onchange = function (e) { ayarDegisti('adet', +e.target.value); };
  $('ayar-hassasiyet').onchange = function (e) { ayarDegisti('hassasiyet', e.target.value); };
  $('ayar-ton').onchange = function (e) { ayarDegisti('ton', +e.target.value); };
  $('ayar-hiz').oninput = function (e) { $('hiz-deger').textContent = (+e.target.value).toFixed(2) + '×'; };
  $('ayar-hiz').onchange = function (e) { ayarDegisti('hiz', +e.target.value); };
  $('ayar-hecele').onchange = function (e) { ayarDegisti('hecele', e.target.checked); };
  $('ayar-efekt').onchange = function (e) { ayarDegisti('efekt', e.target.checked); };
  $('ayar-mikrofon').onchange = function (e) { ayarDegisti('mikrofon', e.target.checked); };
  $('motor-sifirla').onclick = function () { S.korumaSifirla(); };
  $('ses-dene').onclick = function () { S.konus('Merhaba! Ben Bilge Baykuş. Haydi birlikte okuyalım.'); };
  $('sifirla').onclick = function () {
    if (!confirm('Yıldızlar ve zorlanılan kelimeler silinsin mi? (Seçili harfler kalır.)')) return;
    veri.yildiz = 0;
    veri.turSayisi = 0;
    veri.zorluk = {};
    veri.gorulme = {};
    kaydet();
    ayarlariDoldur();
  };

  function ayarlariAc() { ayarlariDoldur(); dlg.showModal(); }
  $('ayar-ac').onclick = ayarlariAc;
  $('ayar-ac-2').onclick = ayarlariAc;
  dlg.addEventListener('close', function () {
    if ($('ekran-ana').classList.contains('aktif')) anaEkraniniAc();
    else if ($('ekran-harf').classList.contains('aktif')) harfEkraniniAc(!veri.ayar.harfler.length, true);
  });

  /* ---------- Uygulama olarak yükleme ve çevrimdışı kullanım (PWA) ---------- */

  var yuklemeIstegi = null;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  var YUKLU = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  // Android 8 ve öncesi: Chrome'un ürettiği uygulama paketi (WebAPK) bu sürümlerde açılırken
  // çöküyor (paket kodu Android 9+ biçiminde). Yükleme yerine kısayol önerilir.
  // Not: Chrome, kullanıcı aracısı metninde her Android'i "Android 10" gösterir; gerçek sürüm
  // userAgentData'dan okunur (yoksa eski tarayıcıdır, metin gerçeği söyler).
  var ESKI_ANDROID = false;
  (function () {
    var uad = navigator.userAgentData;
    if (uad && uad.getHighEntropyValues) {
      if (uad.platform !== 'Android') return;
      uad.getHighEntropyValues(['platformVersion']).then(function (v) {
        ESKI_ANDROID = parseInt(v.platformVersion, 10) < 9;
        if (ESKI_ANDROID) $('yukle-dugme').hidden = true;
      }).catch(function () {});
    } else {
      var m = navigator.userAgent.match(/Android (\d+)/);
      ESKI_ANDROID = !!m && +m[1] < 9;
    }
  })();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker kaydedilemedi:', e); });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // tarayıcının kendi çubuğu yerine ayarlardaki düğme
    yuklemeIstegi = e;
    $('yukle-dugme').hidden = ESKI_ANDROID;   // eski Android'de yüklenen uygulama açılmıyor
  });
  window.addEventListener('appinstalled', function () {
    yuklemeIstegi = null;
    $('yukle-dugme').hidden = true;
  });
  $('yukle-dugme').onclick = function () {
    if (!yuklemeIstegi) return;
    yuklemeIstegi.prompt();
    yuklemeIstegi.userChoice.then(function () { yuklemeIstegi = null; $('yukle-dugme').hidden = true; });
  };

  // İnternetsiz kullanıma hazır mı? Yalnızca Hecele'nin kendi önbellekleri ve kapsamındaki dosyalar
  // sayılır (önbellekler aynı kökendeki tüm uygulamalarca paylaşılır).
  var MODEL_DOSYALARI = ['models/normalizer.wasm', 'models/text.onnx', 'models/decoder.onnx'];
  async function cevrimdisiDurumu() {
    if (!window.caches || !/^https?:$/.test(location.protocol)) return 'İnternetsiz kullanım için uygulamayı internet adresinden açın.';
    try {
      var uygulama = await caches.has('hecele-uygulama');
      var kutuphane = false, model = false;
      if (await caches.has('hecele-kutuphane')) {
        var k = await (await caches.open('hecele-kutuphane')).keys();
        kutuphane = k.some(function (r) { return /onnxruntime-web.*\.wasm$/.test(r.url); });
      }
      if (await caches.has('hecele-ema-models-v1')) {
        var taban = new URL('ema/', document.baseURI).href;
        var m = (await (await caches.open('hecele-ema-models-v1')).keys()).map(function (r) { return r.url; });
        model = MODEL_DOSYALARI.every(function (d) { return m.indexOf(taban + d) !== -1; }) &&
          m.some(function (u) { return /sound\.onnx$/.test(u) && u.indexOf(taban) === 0; });
      }
      if (uygulama && kutuphane && model) {
        return '✅ İnternetsiz kullanıma hazır: gerekli dosyalar (yaklaşık 50 MB) bu cihazda.' +
          (S.durum().durum === 'yukleniyor' ? ' Ses motoru şu an başlatılıyor.' : '');
      }
      return '⏳ İnternetsiz kullanım hazırlanıyor: ses dosyaları indiriliyor (yalnızca ilk açılışta).';
    } catch (e) {
      return 'İnternetsiz kullanım durumu okunamadı.';
    }
  }

  function uygulamaBolumunuDoldur() {
    $('ios-ipucu').hidden = !(IOS && !YUKLU);
    $('eski-android-ipucu').hidden = !ESKI_ANDROID;
    $('yukle-dugme').hidden = !yuklemeIstegi || ESKI_ANDROID;
    $('yukleme-bilgi').textContent = YUKLU
      ? '📲 Uygulama olarak yüklü (ana ekrandan açıldı).'
      : '🌐 Tarayıcıda açık; uygulama olarak yüklü değil.';
    cevrimdisiDurumu().then(function (m) { $('cevrimdisi-bilgi').textContent = m; });
  }

  /* ---------- Başlangıç ---------- */

  ayarlariUygula();
  // Model, ekran çizildikten sonra yüklenmeye başlar (açılış takılmasın)
  setTimeout(function () { S.yukle(); }, 600);
  if (veri.ayar.harfler.length) anaEkraniniAc();
  else harfEkraniniAc(true);
})();
