/*
 * Ses işleme (modül): EMA çıktısından hece/kelime sesi üretme, ölçme ve son işlem.
 * Hem ses işçisi (js/ses-isci.js) hem doğrulanmış ses tablosu aracı
 * (araclar/ses-tablosu.html) kullanır.
 */
export const RATE = 48000;
export const VARSAYILAN_HIZ = 0.85;

// Ses tonu için doğrusal yeniden örnekleme (ema-lightning-web'deki yaklaşım)
function yenidenOrnekle(oran) {
  if (oran === 1) return function (x) { return x; };
  var konum = 0, onceki = 0;
  return function (x) {
    var n = x.length, y = new Float32Array(Math.ceil((n - konum) / oran) + 1), k = 0;
    for (; konum <= n - 1; konum += oran) {
      var i = Math.floor(konum), f = konum - i;
      var a = i < 0 ? onceki : x[i], b = i + 1 < n ? x[i + 1] : a;
      y[k++] = a + (b - a) * f;
    }
    konum -= n; onceki = x[n - 1];
    return y.subarray(0, k);
  };
}

/* ---------- Ses kalitesi ölçümü ----------
 * Model sesi rastgele gürültüden üretir; kısa girdilerde (tek hece) sonuç
 * tohuma göre çok değişir. Her aday için sesli bölümün periyodikliği ve
 * perde (F0) kararlılığı ölçülür, en temiz aday seçilir.
 */
function olc(ses) {
  // 48 kHz → 16 kHz (3'lü ortalama): perde ölçümü için yeterli, ~9 kat hızlı
  var x = new Float32Array(Math.floor(ses.length / 3)), i, j, L;
  for (i = 0; i < x.length; i++) x[i] = (ses[3 * i] + ses[3 * i + 1] + ses[3 * i + 2]) / 3;
  var W = 400, H = 160, mx = 0, ORAN = 16000;
  for (i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
  var aktif = 0, sesli = 0, perToplam = 0, f0lar = [];
  for (i = 0; i + W <= x.length; i += H) {
    var e = 0;
    for (j = 0; j < W; j++) e += x[i + j] * x[i + j];
    if (Math.sqrt(e / W) <= 0.05 * mx) continue;
    aktif++;
    var rr = [], enIyi = 0;
    for (L = 40; L <= 229; L++) {                  // 70–400 Hz
      var a = 0, b = 0, c = 0;
      for (j = 0; j < W - L; j++) { a += x[i + j] * x[i + j + L]; b += x[i + j] * x[i + j]; c += x[i + j + L] * x[i + j + L]; }
      var r = a / Math.sqrt(b * c + 1e-12);
      rr.push(r);
      if (r > enIyi) enIyi = r;
    }
    // En kısa gecikmeli güçlü tepe: perdenin yarısını (oktav hatası) bulmayı önler
    var gecikme = 0;
    for (var q = 1; q < rr.length - 1; q++) {
      if (rr[q] >= 0.9 * enIyi && rr[q] >= rr[q - 1] && rr[q] >= rr[q + 1]) { gecikme = 40 + q; break; }
    }
    if (enIyi > 0.6 && gecikme) { sesli++; perToplam += enIyi; f0lar.push(ORAN / gecikme); }
  }
  var aktifSn = aktif * H / ORAN;
  if (!aktif || !sesli) return { puan: 0, aktifSn: aktifSn, seslilik: 0 };
  f0lar.sort(function (p, q2) { return p - q2; });
  var orta = f0lar[f0lar.length >> 1], kare = 0;
  f0lar.forEach(function (f) { var y = 12 * Math.log2(f / orta); kare += y * y; });
  var sapma = Math.sqrt(kare / f0lar.length);         // perde dalgalanması (yarım ton)
  var puan = (perToplam / sesli) * (sesli / aktif) / (1 + (sapma / 2) * (sapma / 2)) * (aktifSn < 0.12 ? 0.6 : 1);
  return { puan: puan, aktifSn: aktifSn, seslilik: sesli / aktif };
}

/*
 * WSOLA: sesi perdesini değiştirmeden uzatır. Cümleden kesilen ünlüler temiz
 * ama kısa (~0,18 sn); çocuğa hece okurken biraz daha uzun söylenir.
 */
function uzat(x, oran, N, tol) {
  var Hs = N >> 1, Ha = Hs / oran, i, k;
  var w = new Float32Array(N);
  for (i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  var boy = Math.ceil(x.length * oran) + N;
  var y = new Float32Array(boy), ws = new Float32Array(boy), onceki = 0;
  for (k = 0; ; k++) {
    var op = k * Hs, nom = Math.round(k * Ha);
    if (nom + N + tol >= x.length || op + N >= boy) break;
    var en = nom;
    if (k > 0) {
      var dogal = onceki + Hs, eb = -Infinity;
      var benzer = function (p) {
        if (p < 0 || p + Hs > x.length || dogal + Hs > x.length) return -Infinity;
        var c = 0, e1 = 0, e2 = 0;
        for (var t = 0; t < Hs; t += 2) { c += x[p + t] * x[dogal + t]; e1 += x[p + t] * x[p + t]; e2 += x[dogal + t] * x[dogal + t]; }
        return c / Math.sqrt(e1 * e2 + 1e-12);
      };
      for (var d = -tol; d <= tol; d += 3) { var r = benzer(nom + d); if (r > eb) { eb = r; en = nom + d; } }
      var kaba = en;
      for (var d2 = -2; d2 <= 2; d2++) { var r2 = benzer(kaba + d2); if (r2 > eb) { eb = r2; en = kaba + d2; } }
    }
    for (i = 0; i < N; i++) { y[op + i] += x[en + i] * w[i]; ws[op + i] += w[i]; }
    onceki = en;
  }
  var son = 0;
  for (i = 0; i < boy; i++) if (ws[i] > 1e-3) { y[i] /= ws[i]; son = i; }
  return y.slice(0, son);
}

// Kaliteyi koruyan esnetmeyi seç (önce tam oran, sonra yarısı); hiçbiri korumuyorsa olduğu gibi bırak
function korumaliUzat(x, olcum) {
  var oran = Math.min(2, 0.32 / Math.max(0.05, olcum.aktifSn));
  if (oran < 1.15) return x;
  var esik = olcum.puan * 0.92;
  var oranlar = [oran, 1 + (oran - 1) / 2];
  var pencereler = [[768, 260], [1024, 300], [1536, 360]];
  for (var i = 0; i < oranlar.length; i++) {
    for (var j = 0; j < pencereler.length; j++) {
      var u = uzat(x, oranlar[i], pencereler[j][0], pencereler[j][1]);
      if (olc(u).puan >= esik) return u;
    }
  }
  return x;
}

// Kısa seslerde baştaki/sondaki sessizliği kırp, kenarlara yumuşak geçiş ver
function kirp(x) {
  var mx = 0, i;
  for (i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
  var esik = mx * 0.02, bas = 0, son = x.length - 1;
  while (bas < son && Math.abs(x[bas]) < esik) bas++;
  while (son > bas && Math.abs(x[son]) < esik) son--;
  bas = Math.max(0, bas - Math.round(0.03 * RATE));
  son = Math.min(x.length, son + Math.round(0.06 * RATE));
  var y = x.slice(bas, son), kenar = Math.min(Math.round(0.008 * RATE), y.length >> 2);
  for (i = 0; i < kenar; i++) { var g = i / kenar; y[i] *= g; y[y.length - 1 - i] *= g; }
  return y;
}

/*
 * 10 ms'lik karelere ayırıp her kareyi sınıflandırır (16 kHz'de):
 *  db: en gür kareye göre düzey, f0: titreşimliyse (periyodikse) perde (Hz) yoksa 0,
 *  gurultulu: sıfır geçiş oranı yüksek. "e", "i" gibi ön ünlüler titreşimli olduğu
 *  halde yüksek olabilir; fısıltı/sürtünme = titreşimsiz VE gürültülü.
 */
function kareler(ses) {
  const x = new Float32Array(Math.floor(ses.length / 3));
  for (let i = 0; i < x.length; i++) x[i] = (ses[3 * i] + ses[3 * i + 1] + ses[3 * i + 2]) / 3;
  const W = 320, H = 160, sonuc = [];
  let mx = 0;
  for (let i = 0; i + W <= x.length; i += H) {
    let e = 0, zc = 0;
    for (let j = 0; j < W; j++) { e += x[i + j] * x[i + j]; if (j && (x[i + j] >= 0) !== (x[i + j - 1] >= 0)) zc++; }
    const rms = Math.sqrt(e / W);
    mx = Math.max(mx, rms);
    let enIyi = 0;
    const rr = [];
    for (let L = 40; L <= 229; L++) {
      let a = 0, b = 0, c = 0;
      for (let j = 0; j < W - L; j++) { a += x[i + j] * x[i + j + L]; b += x[i + j] * x[i + j]; c += x[i + j + L] * x[i + j + L]; }
      const r = a / Math.sqrt(b * c + 1e-12);
      rr.push(r);
      if (r > enIyi) enIyi = r;
    }
    let g = 0;
    for (let q = 1; q < rr.length - 1; q++) if (rr[q] >= 0.9 * enIyi && rr[q] >= rr[q - 1] && rr[q] >= rr[q + 1]) { g = 40 + q; break; }
    const gurultulu = zc * 50 > 2500;                 // saniyede 2500'den çok sıfır geçişi
    sonuc.push({ bas: i * 3, rms, f0: enIyi > 0.6 && g ? 16000 / g : 0, gurultulu });
  }
  sonuc.forEach((k) => { k.db = 20 * Math.log10(k.rms / (mx || 1) + 1e-9); });
  return sonuc;
}

// Ünlüyle biten seste son titreşimli karede kes: sonraki fısıltı ("e" → "eh/eç") atılır
function sesliSonKirp(x) {
  const k = kareler(x);
  let son = -1;
  for (let i = k.length - 1; i >= 0; i--) if (k[i].f0 && !k[i].gurultulu && k[i].db > -30) { son = i; break; }
  if (son < 0) return x;
  const bitis = Math.min(x.length, k[son].bas + 960 + 480);   // karenin sonu + 10 ms
  const y = x.slice(0, bitis), kenar = Math.min(Math.round(0.025 * RATE), y.length >> 2);
  for (let i = 0; i < kenar; i++) y[y.length - 1 - i] *= i / kenar;
  return y;
}

/*
 * Kelimede kırılma: ortada gürültülü kopukluk (yalnızca titreşimli seslerden oluşan
 * kelimelerde, ör. "nine" → "ni-h-ne") ya da kareler arasında ani perde sıçraması.
 * Doğal tonlama (yavaş yükselip alçalma) cezalandırılmaz.
 */
const TITRESIMSIZ = /[pçtkfhsş]/;
function kirilma(ses, metin) {
  const k = kareler(ses);
  // Gövde: en gür bölgeye göre -20 dB içindeki ilk ve son titreşimli kare (sondaki sönüm hariç)
  const govde = k.map((x, i) => (x.f0 && x.db > -20 ? i : -1)).filter((i) => i >= 0);
  if (govde.length < 3) return 99;
  let sayi = 0;
  const ilk = govde[0], son = govde[govde.length - 1];
  if (!TITRESIMSIZ.test(metin)) {
    for (let i = ilk; i <= son; i++) if (!k[i].f0 && k[i].gurultulu && k[i].db > -35) sayi++;
  }
  for (let i = ilk + 1; i <= son; i++) {
    if (k[i].f0 && k[i - 1].f0) {
      const fark = Math.abs(12 * Math.log2(k[i].f0 / k[i - 1].f0));
      if (fark > 4 && fark < 10) sayi++;            // ~12 yarım ton: ölçümün oktav hatası, sayma
    }
  }
  return sayi;
}

// Ünlüyle biten hecelerde, ses söndükten sonra kalan nefes/kıpırtı kuyruğunu at
// (cümle sonundaki "i" çoğu zaman fısıltıyla biter; tek hece kartında garip duyulur)
function kuyrukKirp(x) {
  const W = 480, zarf = [];
  let mx = 0, enYer = 0;
  for (let i = 0; i + W <= x.length; i += W) {
    let e = 0;
    for (let j = 0; j < W; j++) e += x[i + j] * x[i + j];
    zarf.push(Math.sqrt(e / W));
  }
  zarf.forEach((v, i) => { if (v > mx) { mx = v; enYer = i; } });
  let son = zarf.length;
  for (let i = enYer + 1; i < zarf.length; i++) {
    if (zarf[i] < mx * 0.063) { son = i; break; }   // tepeden -24 dB aşağı düşünce ünlü bitmiştir
  }
  const bitis = Math.min(x.length, (son + 2) * W);
  const y = x.slice(0, bitis), kenar = Math.min(Math.round(0.03 * RATE), y.length >> 2);
  for (let i = 0; i < kenar; i++) y[y.length - 1 - i] *= i / kenar;
  return y;
}

// Ses düzeyini eşitle: tek heceler cümlelerden 4–5 kat kısık çıkıyor
var HEDEF_RMS = 0.06, TEPE_SINIR = 0.9;
function esitle(x) {
  var W = 1200, mx = 0, e = 0, n = 0, i, j;
  for (i = 0; i < x.length; i++) mx = Math.max(mx, Math.abs(x[i]));
  if (!mx) return x;
  for (i = 0; i + W <= x.length; i += W) {
    var s = 0;
    for (j = 0; j < W; j++) s += x[i + j] * x[i + j];
    if (Math.sqrt(s / W) > 0.05 * mx) { e += s / W; n++; }
  }
  var rms = n ? Math.sqrt(e / n) : mx / 4;
  var kazanc = Math.min(HEDEF_RMS / rms, TEPE_SINIR / mx, 12);
  for (i = 0; i < x.length; i++) x[i] *= kazanc;
  return x;
}

async function birSentez(ema, metin, hiz, tohum, ton) {
  var oran = Math.pow(2, (ton || 0) / 12), kaydir = yenidenOrnekle(oran);
  var parcalar = [], parcaSes = [], toplam = 0;
  var akis = ema.stream(metin, {
    speed: hiz / oran,
    seed: tohum,
    onPiece: function (bilgi) {
      parcalar.push({
        kelimeler: bilgi.words,
        baslar: bilgi.starts.map(function (s) { return s / oran; }),
        bas: toplam / RATE
      });
    }
  });
  for await (var ham of akis) {
    var c = kaydir(ham);
    if (!c.length) continue;
    parcaSes.push(c);
    toplam += c.length;
  }
  var ses = new Float32Array(toplam), o = 0;
  parcaSes.forEach(function (c) { ses.set(c, o); o += c.length; });
  return { ses: ses, parcalar: parcalar };
}

// Taşıyıcı cümlenin son kelimesini kes ("Bak, a." → "a.")
function sonKelime(sonuc) {
  var p = sonuc.parcalar[sonuc.parcalar.length - 1];
  if (!p || !p.kelimeler.length) return sonuc.ses;
  var bas = Math.round((p.bas + p.baslar[p.kelimeler.length - 1]) * RATE);
  return sonuc.ses.slice(Math.min(bas, sonuc.ses.length - 1));
}

/* ---------- Adaylar ----------
 * Kısa girdiler (tek hece, kısa kelime) tek başına verilince model ünlüleri kaydırabiliyor
 * ("elma" → "alma", "ten" → "tan") ve perdesi titreyebiliyor. Aynı ses kısa bir cümlenin
 * sonunda daha doğru söyleniyor. Taşıyıcının ünlüsü hedefe uyumlu seçilir: ince ünlüde
 * "Bil, ten.", kalın ünlüde "Bak, lat.".
 * Aday: [yöntem, hız katsayısı, tohum]; yöntem U = uyumlu taşıyıcı, D = tek başına.
 */
const INCE = /[eiöü]/;
const UNLU_SON = /[aeıioöuü]$/;

export function tasiyici(metin) {
  const unluler = metin.match(/[aeıioöuü]/g) || ['a'];
  return (INCE.test(unluler[unluler.length - 1]) ? 'Bil, ' : 'Bak, ') + metin + '.';
}

function dizi(yontem, hiz, tohumlar) { return tohumlar.map((t) => [yontem, hiz, t]); }

// genis: tablo aracı için daha çok aday
export function adaylar(metin, tur, gpu, genis) {
  if (tur === 'hece' && metin.length === 1) {
    if (genis) return [...dizi('U', 0.65, [0, 1, 2, 3, 4, 5]), ...dizi('U', 0.82, [0, 1, 2, 3, 4, 5]), ...dizi('D', 0.8, [0, 1, 2, 3])];
    return gpu ? [...dizi('U', 0.65, [0, 1, 2, 3]), ...dizi('U', 0.82, [0, 1, 2, 3]), ...dizi('D', 0.8, [0, 1])]
      : [['U', 0.65, 0], ['U', 0.82, 1], ['D', 0.8, 0]];
  }
  if (tur === 'hece') {
    if (genis) return [...dizi('U', 1, [0, 1, 2, 3, 4, 5, 6, 7]), ...dizi('U', 0.88, [0, 1, 2, 3]), ...dizi('D', 0.95, [0, 1, 2, 3])];
    return gpu ? [...dizi('U', 1, [0, 1, 2, 3, 4, 5]), ...dizi('U', 0.88, [0, 1, 2]), ...dizi('D', 0.95, [0, 1])]
      : [['U', 1, 0], ['U', 1, 1], ['U', 0.88, 0]];
  }
  if (genis) return [...dizi('U', 1, [0, 1, 2, 3, 4, 5]), ...dizi('D', 1, [7, 3, 11, 5]), ...dizi('U', 0.9, [0, 1, 2])];
  return gpu ? [...dizi('U', 1, [0, 1, 2, 3]), ...dizi('D', 1, [7, 3])] : [['U', 1, 0], ['U', 1, 1], ['D', 1, 7]];
}

/*
 * Adayı üretir. ses: çalınacak (kesilmiş, kırpılmış) ses; tam: taşıyıcı dahil ham ses
 * (tablo aracı doğrulamayı bağlamla yapar, bağlam konuşma tanımayı çok iyileştiriyor).
 */
export async function adayUret(ema, metin, tur, aday, hiz, ton) {
  const [yontem, hizK, tohum] = aday;
  const girdi = yontem === 'U' ? tasiyici(metin) : metin;
  const r = await birSentez(ema, girdi, hiz * hizK, tohum, ton);
  let ses = kirp(yontem === 'U' ? sonKelime(r) : r.ses);
  if (UNLU_SON.test(metin)) ses = tur === 'hece' ? sesliSonKirp(kuyrukKirp(ses)) : sesliSonKirp(ses);
  return { ses, tam: r.ses };
}

// Son işlem: tek ünlü kaliteyi bozmadan uzatılır; ses düzeyi eşitlenir
export function sonIslem(ses, metin, tur) {
  let x = ses;
  if (tur === 'hece' && metin.length === 1) x = korumaliUzat(x, olc(x));
  return esitle(x);
}

export { yenidenOrnekle, olc, uzat, korumaliUzat, kareler, sesliSonKirp, kirilma, kuyrukKirp, kirp, esitle, birSentez, sonKelime };
