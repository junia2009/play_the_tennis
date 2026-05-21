// ─── バージョンここだけ変える ────────────────────────────────────
const CACHE = 'tennis-v2.0.1';
// ─────────────────────────────────────────────────────────────────

const LOCAL_ASSETS = [
  '/play_the_tennis/',
  '/play_the_tennis/index.html',
  '/play_the_tennis/manifest.json',
  '/play_the_tennis/sw.js',
  '/play_the_tennis/js/main.js',
  '/play_the_tennis/js/game.js',
  '/play_the_tennis/js/render3d.js',
  '/play_the_tennis/js/input.js',
  '/play_the_tennis/js/ui.js',
  '/play_the_tennis/assets/player.glb'
];

// CDN modules — pre-fetch best-effort but tolerate failures
const CDN_ASSETS = [
  'https://unpkg.com/three@0.169.0/build/three.module.js',
  'https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.169.0/examples/jsm/utils/SkeletonUtils.js',
  'https://unpkg.com/three@0.169.0/examples/jsm/utils/BufferGeometryUtils.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // Local: must succeed
      await c.addAll(LOCAL_ASSETS);
      // CDN: best-effort
      await Promise.allSettled(CDN_ASSETS.map(u =>
        fetch(u).then(r => r.ok ? c.put(u, r) : null).catch(() => null)
      ));
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }));
      }))
  );
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => null);
      return cached || fetchPromise;
    })
  );
});
