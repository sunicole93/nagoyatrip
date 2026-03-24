// Service Worker - 支援離線瀏覽行程
const CACHE_NAME = "nagoya-trip-v1";

// 需要快取的靜態資源
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/data.js",
  "./manifest.json",
];

// 安裝時快取資源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
  self.skipWaiting();
});

// 啟動時清除舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// 攔截請求：優先從快取讀取（行程資料離線也能看）
self.addEventListener("fetch", (event) => {
  // API 請求不快取（Firebase、Gemini）
  if (
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("firebaseio.com") ||
    event.request.url.includes("firestore.googleapis.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    }),
  );
});
