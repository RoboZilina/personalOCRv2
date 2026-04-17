const CACHE_NAME = 'personalocr-v3.8.4-gold-patch1';

const ASSETS = [
  '/',
  '/app.js?v=3.8.4',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/js/manga/manga_engine.js?v=3.8.4',
  '/js/onnx/onnx_support.js?v=3.8.4',
  '/js/onnx/ort-wasm-simd-threaded.jsep.mjs',
  '/js/onnx/ort-wasm-simd-threaded.jsep.wasm',
  '/js/onnx/ort-wasm-simd-threaded.wasm',
  '/js/onnx/ort-wasm-simd.wasm',
  '/js/onnx/ort-wasm-threaded.wasm',
  '/js/onnx/ort-wasm.wasm',
  '/js/onnx/ort.min.js',
  '/js/paddle/paddle_core.js?v=gold_3.8.4',
  '/js/paddle/paddle_engine.js?v=3.8.4',
  '/js/tesseract/tesseract_engine.js?v=3.8.4',
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
  '/js/utils/fetch_utils.js?v=3.8.4',
  '/manifest.json',
  '/models/manga/config.json',
  '/models/manga/manifest.json',
  '/models/manga/preprocessor_config.json',
  '/models/manga/vocab.json',
  '/models/paddle/japan_dict.txt',
  '/models/paddle/manifest.json',
  '/settings.js?v=3.8.4',
  '/styles.css?v=3.8.4'
];

// 1. Installs Assets (Cache-First)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
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

  // Normalize cache key: use pathname only (strip query params for consistent caching)
  // This aligns with ASSETS list which now includes versioned URLs
  const cacheKey = new Request(url.pathname, { method: 'GET' });

  // Cache-First Strategy: Return cached version immediately if available,
  // otherwise fetch from network and cache the response.
  event.respondWith(
    caches.match(cacheKey).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(async (networkResponse) => {
        // Cache successful same-origin responses for future offline use
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          // Must clone before reading/returning the response
          // Use normalized pathname as key (consistent with ASSETS)
          await cache.put(cacheKey, networkResponse.clone());
        }
        return networkResponse;
      }).catch(async () => {
        // Network failed: try to find any cached version
        const fallbackMatch = await caches.match(cacheKey);
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
