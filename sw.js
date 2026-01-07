const CACHE_NAME = 'health-aware-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap',
    'https://unpkg.com/html5-qrcode',
    'https://unpkg.com/lucide@latest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
