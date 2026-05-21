// ─── バージョンここだけ変える ────────────────────────────────────
const CACHE = 'tennis-v1.0.2';
// ─────────────────────────────────────────────────────────────────

const ASSETS = [
  '/play_the_tennis/',
  '/play_the_tennis/index.html',
  '/play_the_tennis/manifest.json',
  '/play_the_tennis/sw.js'
];

// ① 新 SW インストール時: キャッシュを作り即座に waiting をスキップ
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())  // waiting をスキップして即 active へ
  );
});

// ② activate 時: 旧バージョンのキャッシュを全削除 → 既存タブを掌握 → 更新通知
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())   // 既存タブのコントロールを奪取
      .then(() => {
        // 全タブに「新バージョンになったのでリロードして」と通知
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE }));
        });
      })
  );
});

// ③ fetch: キャッシュ優先 + バックグラウンドで最新を更新 (stale-while-revalidate)
self.addEventListener('fetch', e => {
  // chrome-extension や POST などはスルー
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
