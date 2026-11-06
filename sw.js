// Service Worker: запоминает сайт, шрифты и Tailwind, чтобы приложение открывалось без интернета.
// Запросы к API (workers.dev) не кэшируются никогда: данные тем хранит сам index.html.

const CACHE = 'cards-v1';
const SHELL = ['./', './index.html'];
const EXTRA = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;700&family=Playfair+Display:ital,wght@0,600;0,700;1,700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL).catch(() => {});
    // Внешние файлы кладём по одному: если один недоступен, остальные всё равно сохранятся
    await Promise.all(EXTRA.map(u =>
      fetch(new Request(u, { mode: 'no-cors' })).then(r => cache.put(u, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Сначала сеть (чтобы обновления сайта приходили сразу), при её отсутствии — копия из кэша
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('workers.dev')) return;      // API: напрямую, без кэша
  e.respondWith(handle(req));
});

async function handle(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  try {
    // Если копия есть, долго ждать сеть не нужно: при плохой связи быстро берём кэш
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(reject, cached ? 4000 : 20000))
    ]);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return cached || (req.mode === 'navigate' ? await cache.match('./index.html') : Response.error());
  }
}
