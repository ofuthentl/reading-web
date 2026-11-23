/* Ofu's Library — Ultra-thin PWA App Shell Service Worker (D-036 QĐ-D) */
const CACHE_NAME = 'ofu-shell-mwti1teo';
const CACHE_PREFIX = 'ofu-shell-';

const STATIC_ROOT_FILES = new Set([
  '/manifest.webmanifest',
  '/logo-128.png',
  '/icon-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/title.png',
  '/cursors/miku-sheet.png',
]);

const HASHED_ASSET_EXT_RE = /\.(?:js|css|woff2|png|webp|svg)$/i;
const FORBIDDEN_ROUTE_RE =
  /(?:^|\/)(?:api|usage|locked|entrance|books|guest-packs|models|textures)(?:\/|$)/i;
const FORBIDDEN_FILE_EXT_RE = /\.(?:epub|docx|pack|pdf|glb)$/i;

function resolveRelativePath(pathname) {
  const scopePathname = new URL(self.registration.scope).pathname.replace(/\/+$/, '');
  if (scopePathname && pathname.startsWith(scopePathname)) {
    const sliced = pathname.slice(scopePathname.length);
    return sliced.startsWith('/') ? sliced : `/${sliced}`;
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;

  const url = new URL(req.url);
  // Bỏ qua tuyệt đối mọi cross-origin request (Cloudflare Worker API, AniList, v.v.)
  if (url.origin !== self.location.origin) return;

  const relPath = resolveRelativePath(url.pathname);

  // QĐ-D: Bỏ qua tuyệt đối /api/*, /usage, /locked, /entrance và mọi dữ liệu sách / gói bảo mật
  if (FORBIDDEN_ROUTE_RE.test(relPath) || FORBIDDEN_FILE_EXT_RE.test(relPath)) {
    return;
  }

  // NetworkFirst cho trang gốc index.html để luôn nhận bản deploy mới nhất
  const isRootHtmlNavigation =
    req.mode === 'navigate' && (relPath === '/' || relPath === '/index.html');
  if (isRootHtmlNavigation) {
    const indexKey = new URL('./index.html', self.registration.scope).href;
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok && networkRes.type === 'basic') {
            const copy = networkRes.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(indexKey, copy))
              .catch(() => undefined);
          }
          return networkRes;
        })
        .catch(() => caches.match(indexKey).then((cached) => cached || Response.error())),
    );
    return;
  }

  // CacheFirst chỉ dành cho tài sản tĩnh đã gắn hash (/assets/*) và bộ icon PWA chuẩn
  const cleanPath = relPath.replace(/\?.*$/, '');
  const isHashedStaticAsset =
    cleanPath.startsWith('/assets/') && HASHED_ASSET_EXT_RE.test(cleanPath);
  const isAllowedRootStatic = STATIC_ROOT_FILES.has(cleanPath);

  if (!isHashedStaticAsset && !isAllowedRootStatic) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const copy = networkRes.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, copy))
            .catch(() => undefined);
        }
        return networkRes;
      });
    }),
  );
});
