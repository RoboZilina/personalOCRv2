const CACHE_NAME = 'personalocr-v3.8.5-gold-patch1';

/**
 * Normalize URL to pathname-only for consistent cache keys.
 * Strips query parameters to align install-time and runtime caching.
 * @param {string} urlString - Full URL (may include query params like ?v=3.8.5)
 * @returns {string} Normalized pathname
 */
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString, self.location.origin);
    return url.pathname;
  } catch (e) {
    // Fallback: if URL parsing fails, return as-is (should not happen for same-origin)
    return urlString.split('?')[0];
  }
}

const ASSETS = [
  '/',
  '/app.js?v=3.8.5',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/js/manga/manga_engine.js?v=3.8.5',
  '/js/manga/manga_preload_worker.js?v=3.8.5',
  '/js/onnx/onnx_support.js?v=3.8.5',
  '/js/onnx/ort-wasm-simd-threaded.jsep.mjs',
  '/js/onnx/ort-wasm-simd-threaded.jsep.wasm',
  '/js/onnx/ort-wasm-simd-threaded.wasm',
  '/js/onnx/ort-wasm-simd.wasm',
  '/js/onnx/ort-wasm-threaded.wasm',
  '/js/onnx/ort-wasm.wasm',
  '/js/onnx/ort.min.js',
  '/js/paddle/paddle_core.js?v=3.8.5',
  '/js/paddle/paddle_engine.js?v=3.8.5',
  '/js/paddle/paddle_preload_worker.js?v=3.8.5',
  '/js/tesseract/tesseract_engine.js?v=3.8.5',
  '/js/tesseract/worker.min.js',
  '/js/tesseract/tesseract.min.js',
  '/js/tesseract/core/tesseract-core.wasm',
  '/js/tesseract/core/tesseract-core.wasm.js',
  '/js/tesseract/core/tesseract-core-lstm.wasm',
  '/js/tesseract/core/tesseract-core-lstm.wasm.js',
  '/js/tesseract/core/tesseract-core-simd.wasm',
  '/js/tesseract/core/tesseract-core-simd.wasm.js',
  '/js/tesseract/core/tesseract-core-simd-lstm.wasm',
  '/js/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  '/js/utils/fetch_utils.js?v=3.8.5',
  '/manifest.json',
  '/models/manga/config.json',
  '/models/manga/manifest.json',
  '/models/manga/preprocessor_config.json',
  '/models/manga/vocab.json',
  '/models/paddle/japan_dict.txt',
  '/models/paddle/manifest.json',
  '/settings.js?v=3.8.5',
  '/styles.css?v=3.8.5'
];

// 1. Installs Assets (Cache-First)
// Normalize ASSETS to pathname-only to match fetch handler cache keys
const NORMALIZED_ASSETS = ASSETS.map(normalizeUrl);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Thread cache reference so the integrity check reuses the same handle
      // instead of issuing a redundant second caches.open() call.
      .then((cache) => cache.addAll(ASSETS).then(() => cache))
      .then((cache) => cache.keys().then(keys => ({ cache, keys })))
      .then(({ cache, keys }) => {
        // Integrity check: verify cached keys match normalized assets
        const cachedPaths = keys.map(r => new URL(r.url).pathname);
        const missing = NORMALIZED_ASSETS.filter(a => a !== '/' && !cachedPaths.includes(a));
        const extra = cachedPaths.filter(c => c !== '/' && !NORMALIZED_ASSETS.includes(c));
        if (missing.length > 0) {
          console.warn('[SW:INSTALL] Cache mismatch - missing assets:', missing);
          // Auto-heal: re-populate missing assets
          console.log('[SW:INSTALL] Auto-healing cache with missing assets...');
          return cache.addAll(missing);
        }
        if (extra.length > 0) {
          console.warn('[SW:INSTALL] Cache mismatch - unexpected extra assets:', extra);
        }
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Simple Fetch Handler with Cross-Origin Isolation (Guard v3.8)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // CRITICAL: Only handle same-origin requests.
  // This ensures that remote R2 Models and GitHub Releases are NOT intercepted or cached.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Cache-First Strategy: Match exact URL (including version query params)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(async (networkResponse) => {
        // Cache successful same-origin responses for future offline use
        // But avoid caching HTML fallbacks for JS/JSON/WASM requests
        if (networkResponse && networkResponse.status === 200) {
          const contentType = networkResponse.headers.get('content-type') || '';
          const url = event.request.url;
          const isAsset = url.endsWith('.js') || url.endsWith('.json') || url.endsWith('.wasm') || url.endsWith('.mjs');
          const isHtml = contentType.includes('text/html');
          
          // Don't cache HTML responses for asset requests (prevents SPA fallback pollution)
          if (!isAsset || !isHtml) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          } else if (isAsset && isHtml) {
            console.warn('[SW:FETCH] Refusing to cache HTML response for asset:', url);
          }
        }
        return networkResponse;
      }).catch(async () => {
        // Network failed: try to find any cached version
        const fallbackMatch = await caches.match(event.request);
        if (fallbackMatch) {
          return fallbackMatch;
        }
        // Return a minimal offline response for navigation requests
        if (event.request.mode === 'navigate') {
          return new Response('Offline - App not cached', { 
            status: 503, 
            headers: { 'Content-Type': 'text/plain' } 
          });
        }
        return null;
      });
    })
  );
});
