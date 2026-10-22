/* Service Worker - MotorLog Pro (khusus repository ini)
 * Prinsip:
 *  - Hanya mengelola cache berawalan CACHE_PREFIX milik aplikasi ini.
 *  - Hanya menangani request same-origin yang berada di dalam scope SW (subpath repo).
 *  - Resource CDN (Tailwind, FontAwesome, Chart.js, Google Fonts) TIDAK disentuh.
 *  - Network-first: HTML/resource lokal selalu coba jaringan dulu, cache hanya fallback.
 */
// Cache Storage dipakai bersama seluruh repo di origin github.io -> namespace diikat ke path scope repo ini
const SCOPE_PATH = new URL(self.registration.scope).pathname;   // mis. "/nama-repo/"
const CACHE_PREFIX = 'motorlog-pro-shell:' + SCOPE_PATH + ':';
const CACHE_VERSION = 'v2';                       // naikkan saat mengubah daftar SHELL
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Path relatif terhadap lokasi sw.js -> otomatis benar di /nama-repo/
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

const SCOPE_URL = self.registration.scope; // mis. https://user.github.io/nama-repo/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Satu file gagal tidak menggagalkan instalasi
      Promise.all(SHELL.map((p) =>
        cache.add(new Request(p, { cache: 'reload' })).catch(() => {})
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        // HANYA hapus cache milik aplikasi ini yang versinya lama
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Abaikan lintas-origin (CDN) dan apa pun di luar scope repo
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE_URL)) return;

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // 'no-cache' memaksa revalidasi ke server -> perubahan index.html tidak tertahan
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    return new Response('Tidak ada koneksi internet.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
