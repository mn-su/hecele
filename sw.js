/*
 * Hecele service worker: çevrimdışı çalışma ve hızlı açılış.
 *
 *  - Uygulama dosyaları: önce ağ (en fazla 3 sn), olmazsa önbellek. Böylece yeni sürüm
 *    yüklendiğinde öğrenciler onu görür; internet yoksa son sürüm önbellekten açılır.
 *  - onnxruntime (jsDelivr, sürümlü) ve yazı tipleri: önce önbellek (değişmezler).
 *  - Ses modeli dosyaları (ema/models/*.onnx, .wasm) burada tutulmaz: ema/tts.js onları
 *    zaten kendi önbelleğinde ("hecele-ema-models-v1") saklıyor.
 *  - Bütün adlar "hecele" ile başlar: önbellekler kökendeki tüm uygulamalarca paylaşılır.
 */
const UYGULAMA = 'hecele-uygulama';
const KUTUPHANE = 'hecele-kutuphane';
const DOSYALAR = [
  './', 'index.html', 'manifest.webmanifest', 'css/stil.css',
  'js/turkce.js', 'js/veri.js', 'js/uretici.js', 'js/ses.js', 'js/ses-isci.js', 'js/ses-islem.js',
  'js/ses-tablosu.json', 'js/uygulama.js',
  'ema/tts.js', 'ema/normalizer.js', 'ema/models/meta.json',
  'ikonlar/ikon-192.png', 'ikonlar/ikon-512.png', 'ikonlar/apple-touch-icon.png'
];
const AG_SURESI = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(UYGULAMA).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

// Eski sürümlerin önbellek adları (ses modeli bir süre genel "ema-models-v1" ve "mn-su.hecele-…"
// adlarındaydı). Yalnızca bu uygulamanın kapsamındaki dosyalar yeni ada taşınır (model yeniden
// indirilmesin); başka uygulamaların dosyalarına dokunulmaz. Eski uygulama/kütüphane önbellekleri silinir.
const MODEL = 'hecele-ema-models-v1';
const ESKI_MODELLER = ['mn-su.hecele-ema-models-v1', 'ema-models-v1'];
const ESKI_DIGER = ['mn-su.hecele-uygulama', 'mn-su.hecele-kutuphane'];
async function eskiOnbellekleriTasi() {
  const yeni = await caches.open(MODEL);
  for (const ad of ESKI_MODELLER) {
    if (!(await caches.has(ad))) continue;
    const eski = await caches.open(ad);
    for (const istek of await eski.keys()) {
      if (!istek.url.startsWith(self.registration.scope)) continue;   // başka uygulamanın dosyası: dokunma
      const yanit = await eski.match(istek);
      if (yanit) await yeni.put(istek, yanit);
      await eski.delete(istek);
    }
    if ((await eski.keys()).length === 0) await caches.delete(ad);
  }
  for (const ad of ESKI_DIGER) await caches.delete(ad);
}

self.addEventListener('activate', (e) => {
  e.waitUntil(eskiOnbellekleriTasi().catch(() => {}).then(() => self.clients.claim()));
});

async function onceAg(istek) {
  const onbellek = await caches.open(UYGULAMA);
  // "no-cache": tarayıcının HTTP önbelleği (GitHub Pages: 10 dk) yerine sunucuya sor; dosya
  // değişmediyse ucuz bir 304 döner. Böylece güncellemeler beklemeden gelir.
  const yeniIstek = istek.mode === 'navigate'
    ? fetch(istek.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(istek, { cache: 'no-cache' });
  const ag = yeniIstek.then((y) => {
    if (y.ok) onbellek.put(istek, y.clone());
    return y;
  });
  const sure = new Promise((coz) => setTimeout(coz, AG_SURESI, null));
  try {
    const y = await Promise.race([ag, sure]);
    if (y) return y;
  } catch (e) { /* ağ yok: önbelleğe bak */ }
  const kayit = await onbellek.match(istek, { ignoreSearch: true });
  return kayit || ag;   // önbellekte de yoksa ağı beklemeye devam
}

async function onceOnbellek(istek) {
  const onbellek = await caches.open(KUTUPHANE);
  let kayit = null;
  try {
    kayit = await onbellek.match(istek);
  } catch (e) {
    // Cross-origin isolation (COEP) altında eski sürümün opak kaydı okunamaz: sil, yeniden indir
    await onbellek.delete(istek);
  }
  if (kayit) return kayit;
  const y = await fetch(istek);
  if (y.ok || y.type === 'opaque') onbellek.put(istek, y.clone());
  return y;
}

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin === self.location.origin) {
    // Büyük model dosyaları tts.js'in kendi önbelleğinde; araçlar sayfası geliştirme içindir
    if (/\/ema\/models\/.+\.(onnx|wasm)$/.test(url.pathname) || url.pathname.includes('/araclar/')) return;
    e.respondWith(onceAg(istek));
  } else if (/(^|\.)cdn\.jsdelivr\.net$|^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(onceOnbellek(istek));
  }
});
