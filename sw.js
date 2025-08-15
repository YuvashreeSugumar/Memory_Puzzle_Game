const CACHE = "kpop-match-v1";
const OFFLINE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "favicon.png",
  "app.js",
  "assets/audio/bgm.wav",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  // cards
  "assets/cards/lightstick.svg",
  "assets/cards/microphone.svg",
  "assets/cards/headphones.svg",
  "assets/cards/vinyl.svg",
  "assets/cards/star.svg",
  "assets/cards/heart.svg",
  "assets/cards/crown.svg",
  "assets/cards/dancer.svg",
  "assets/cards/note.svg",
  "assets/cards/stage.svg",
  "assets/cards/thunder.svg",
  "assets/cards/glowstick.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k===CACHE?null:caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then(res => res || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return resp;
      }).catch(()=>caches.match("index.html")))
    );
  }
});
