const CACHE_NAME = 'personalocr-cloudflare-gold-v3.8.0';

const ASSETS = [
  '/',
  '/app.js',
  '/icon-192.png',
  '/icon-512.png',
  '/index.html',
  '/js/manga/manga_engine.js',
  '/js/onnx/onnx_support.js',
  '/js/onnx/ort-wasm-simd-threaded.jsep.mjs',
  '/js/onnx/ort-wasm-simd-threaded.jsep.wasm',
  '/js/onnx/ort-wasm-simd-threaded.wasm',
  '/js/onnx/ort-wasm-simd.wasm',
  '/js/onnx/ort-wasm-threaded.wasm',
  '/js/onnx/ort-wasm.wasm',
  '/js/onnx/ort.min.js',
  '/js/paddle/paddle_core.js',
  '/js/paddle/paddle_engine.js',
  '/js/tesseract/tesseract_engine.js',
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
  '/manifest.json',
  '/models/manga/config.json',
  '/models/manga/manifest.json',
  '/models/manga/preprocessor_config.json',
  '/models/manga/vocab.json',
  '/models/paddle/japan_dict.txt',
  '/models/paddle/manifest.json',
  '/settings.js',
  '/styles.css'
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

  // Simplified Strategy: Cache Match -> Network Fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached asset if found
      if (cachedResponse) return cachedResponse;

      // Otherwise, fetch from network
      return fetch(event.request).catch(() => {
        // Silent fail for network errors (e.g., offline with no cache)
        return null;
      });
    })
  );
});
