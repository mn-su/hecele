/*
 * Ses işçisi (Web Worker, modül): EMA Lightning modeli ve tüm ses işlemleri
 * burada çalışır; böylece hece seçimi, perde ölçümü ve esnetme gibi ağır
 * hesaplar arayüzü (düğmeleri) kilitlemez. İşleme fonksiyonları js/ses-islem.js'de.
 *
 * Gelen:  { tip: 'yukle', taban, arkalar, hassasiyet }
 *         { tip: 'sentez', id, metin, tur, hiz, ton, oncelikli }
 *         { tip: 'onHazirIptal' }   → kuyrukta bekleyen ön hazırlıkları at
 * Giden:  { tip: 'ilerleme', p } | { tip: 'hazir', arka } | { tip: 'yuklemeHatasi', mesaj }
 *         { tip: 'sonuc', id, ses, parcalar, puan } | { tip: 'hata', id, mesaj }
 */
import {
  VARSAYILAN_HIZ, adaylar, adayUret, sonIslem, birSentez, olc, kirilma, uzat, esitle, yenidenOrnekle
} from './ses-islem.js';

let ema = null, arka = null;
let ayar = { hiz: VARSAYILAN_HIZ, ton: 0 };

/*
 * Doğrulanmış ses tablosu (js/ses-tablosu.json, araclar/ses-tablosu.html ile üretilir):
 * havuzdaki her hece ve kelime için konuşma tanımayla doğru telaffuz ettiği doğrulanmış
 * aday; cümleler için doğrulanmış tohum. Varsa tek seferde o aday üretilir; yoksa aşağıdaki seçim yapılır.
 */
let tablo = { h: {}, k: {}, c: {} };
fetch(new URL('ses-tablosu.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : null))
  .then((t) => { if (t) tablo = t; })
  .catch(() => {});

/*
 * Doğrulanmış ses yalnızca varsayılan hız ve tonda doğru okunuyor: model başka hız ya da tonda
 * bambaşka bir okuma üretiyor. Bu yüzden ses o ayarda üretilir, hız ve ton sonradan uygulanır:
 * önce perde korunarak esnetilir (uzat), tonda sonra yeniden örneklenip perde yükseltilir.
 * Kör dinlemede hece/kelimede (çocuk sesi) ve cümlede (hız) bu yol tercih edildi; çocuk sesindeki
 * cümlelerde ise modelin kendi tonlu okuması daha iyi bulundu.
 */
function donustur(ses, hiz, ton) {
  const oran = Math.pow(2, (ton || 0) / 12), uzama = oran * VARSAYILAN_HIZ / hiz;
  let x = Math.abs(uzama - 1) > 0.01 ? uzat(ses, uzama, 1024, 300) : ses;
  if (ton) x = yenidenOrnekle(oran)(x).slice();
  return x;
}

/*
 * tur: 'hece'   → tabloda varsa o aday; yoksa adaylardan perdesi en temiz olan
 *      'kelime' → tabloda varsa o aday; yoksa kırılmasız ilk aday
 *      'cumle'  → tek seferde (uzun girdilerde model zaten doğru)
 *      'ham'    → işlem yok; yalnızca karşılaştırma sayfası için
 */
async function uret(metin, tur) {
  if (tur === 'cumle' || tur === 'ham') {
    // Cümlelerde de kısa olanlar ünlü kaydırabiliyor: tabloda doğrulanmış tohum varsa o kullanılır
    const tohum = tur === 'cumle' && tablo.c && tablo.c[metin] !== undefined ? tablo.c[metin] : 7;
    if (tur === 'cumle' && !ayar.ton && Math.abs(ayar.hiz - VARSAYILAN_HIZ) > 0.01) {
      const r = await birSentez(ema, metin, VARSAYILAN_HIZ, tohum, 0);
      const k = VARSAYILAN_HIZ / ayar.hiz;   // kelime zamanları da aynı oranda kayar
      const parcalar = r.parcalar.map((p) => ({ kelimeler: p.kelimeler, baslar: p.baslar.map((b) => b * k), bas: p.bas * k }));
      return { ses: esitle(donustur(r.ses, ayar.hiz, 0)), parcalar, puan: 1 };
    }
    const sonuc = await birSentez(ema, metin, ayar.hiz, tohum, ayar.ton);
    if (tur === 'ham') return { ses: sonuc.ses, parcalar: [], puan: olc(sonuc.ses).puan };
    esitle(sonuc.ses);
    return { ses: sonuc.ses, parcalar: sonuc.parcalar, puan: 1 };
  }
  const kayit = (tur === 'hece' ? tablo.h : tablo.k)[metin.toLocaleLowerCase('tr-TR')];
  if (kayit) {
    // Doğrulanmış aday varsayılan hız ve tonda üretilir; hız ve ton sonradan uygulanır
    const { ses } = await adayUret(ema, metin, tur, kayit, VARSAYILAN_HIZ, 0);
    return { ses: sonIslem(donustur(ses, ayar.hiz, ayar.ton), metin, tur), parcalar: [], puan: 1, dogrulanmis: true };
  }
  const liste = adaylar(metin, tur, arka === 'webgpu');
  let enIyi = null;
  for (const a of liste) {
    const { ses } = await adayUret(ema, metin, tur, a, ayar.hiz, ayar.ton);
    const o = olc(ses);
    if (tur === 'hece') {
      if (!enIyi || o.puan > enIyi.puan) enIyi = { ses, puan: o.puan };
      if (o.puan >= 0.9) break;
    } else {
      const bozukluk = kirilma(ses, metin) + (o.seslilik >= 0.6 && o.aktifSn >= 0.15 ? 0 : 10);
      if (!enIyi || bozukluk < enIyi.bozukluk) enIyi = { ses, puan: o.puan, bozukluk };
      if (bozukluk <= 1) break;   // tek kare (10 ms) duyulmaz
    }
  }
  return { ses: sonIslem(enIyi.ses, metin, tur), parcalar: [], puan: enIyi.puan };
}

/* ---------- Model yükleme ---------- */

async function yukle(m) {
  const mod = await import(m.taban + 'tts.js');
  let sonHata = null;
  for (const a of m.arkalar) {
    try {
      const e = await mod.EMA.load(a, m.taban + 'models/', (_, p) => postMessage({ tip: 'ilerleme', p }), m.hassasiyet);
      for await (const _ of e.stream('Merhaba.')) { /* ısınma: ekran kartı gölgelendiricileri derlenir */ }
      if (ema) await ema.release();
      ema = e;
      arka = a;
      postMessage({ tip: 'hazir', arka: a });
      return;
    } catch (e) {
      console.warn('EMA yüklenemedi (' + a + '):', e);
      sonHata = e;
    }
  }
  postMessage({ tip: 'yuklemeHatasi', mesaj: sonHata && sonHata.message ? sonHata.message : String(sonHata) });
}

/* ---------- İş kuyruğu: "Dinle" istekleri ön hazırlıkların önüne geçer ---------- */

const oncelikli = [], arkaPlan = [];
const gorulen = new Set();
let calisiyor = false;

async function isle() {
  if (calisiyor) return;
  calisiyor = true;
  while (oncelikli.length || arkaPlan.length) {
    const is = oncelikli.length ? oncelikli.shift() : arkaPlan.shift();
    try {
      if (!ema) throw new Error('model hazır değil');
      ayar = { hiz: is.hiz, ton: is.ton };
      const r = await uret(is.metin, is.tur);
      postMessage({ tip: 'sonuc', id: is.id, ses: r.ses, parcalar: r.parcalar, puan: r.puan }, [r.ses.buffer]);
    } catch (e) {
      postMessage({ tip: 'hata', id: is.id, mesaj: e && e.message ? e.message : String(e) });
    }
  }
  calisiyor = false;
}

onmessage = (e) => {
  const m = e.data;
  if (m.tip === 'yukle') {
    yukle(m).catch((h) => postMessage({ tip: 'yuklemeHatasi', mesaj: h && h.message ? h.message : String(h) }));
  } else if (m.tip === 'sentez') {
    if (gorulen.has(m.id)) {
      // Ön hazırlıkta bekleyen iş "Dinle" ile öne alınır; çalışıyorsa ya da bittiyse dokunma
      const i = arkaPlan.findIndex((x) => x.id === m.id);
      if (i !== -1 && m.oncelikli) oncelikli.push(arkaPlan.splice(i, 1)[0]);
      return;
    }
    gorulen.add(m.id);
    (m.oncelikli ? oncelikli : arkaPlan).push(m);
    isle();
  } else if (m.tip === 'onHazirIptal') {
    arkaPlan.splice(0).forEach((x) => postMessage({ tip: 'hata', id: x.id, mesaj: 'iptal' }));
  }
};
