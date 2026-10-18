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
  VARSAYILAN_HIZ, adaylar, adayUret, sonIslem, birSentez, olc, kirilma, uzat, esitle
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
 * tur: 'hece'   → tabloda varsa o aday; yoksa adaylardan perdesi en temiz olan
 *      'kelime' → tabloda varsa o aday; yoksa kırılmasız ilk aday
 *      'cumle'  → tek seferde (uzun girdilerde model zaten doğru)
 *      'ham'    → işlem yok; yalnızca karşılaştırma sayfası için
 */
async function uret(metin, tur) {
  if (tur === 'cumle' || tur === 'ham') {
    // Cümlelerde de kısa olanlar ünlü kaydırabiliyor: tabloda doğrulanmış tohum varsa o kullanılır
    const tohum = tur === 'cumle' && tablo.c && tablo.c[metin] !== undefined ? tablo.c[metin] : 7;
    const sonuc = await birSentez(ema, metin, ayar.hiz, tohum, ayar.ton);
    if (tur === 'ham') return { ses: sonuc.ses, parcalar: [], puan: olc(sonuc.ses).puan };
    esitle(sonuc.ses);
    return { ses: sonuc.ses, parcalar: sonuc.parcalar, puan: 1 };
  }
  const kayit = (tur === 'hece' ? tablo.h : tablo.k)[metin.toLocaleLowerCase('tr-TR')];
  if (kayit && !ayar.ton) {
    // Doğrulanmış aday varsayılan hızda üretilir; farklı hız istenirse perde korunarak esnetilir
    let { ses } = await adayUret(ema, metin, tur, kayit, VARSAYILAN_HIZ, 0);
    if (Math.abs(ayar.hiz - VARSAYILAN_HIZ) > 0.01) ses = uzat(ses, VARSAYILAN_HIZ / ayar.hiz, 1024, 300);
    return { ses: sonIslem(ses, metin, tur), parcalar: [], puan: 1, dogrulanmis: true };
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
