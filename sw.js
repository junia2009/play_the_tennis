// Service Worker — オフラインでも遊べるようにキャッシュする
// ファイルを更新したら CACHE のバージョンを上げる
const CACHE = 'tennis-v3.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './js/main.js',
  './js/config.js',
  './js/physics.js',
  './js/score.js',
  './js/match.js',
  './js/input.js',
  './js/ui.js',
  './js/audio.js',
  './js/render/scene.js',
  './js/render/character.js',
  './js/lib/three.module.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネット優先・失敗したらキャッシュ（更新がすぐ反映され、オフラインでも動く）
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
