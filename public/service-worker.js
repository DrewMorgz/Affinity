/* Affinity Core — service worker
 * ---------------------------------------------------------------------------
 * This exists to make the application INSTALLABLE, not to work offline.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: cache any client data, or any response
 * from the database. A conventional PWA caches API responses so the app works
 * on a train. For this application that would be wrong twice over:
 *
 *   1. It would put beneficial ownership records, bank mandates and CDD
 *      material into the browser cache on staff laptops in six jurisdictions,
 *      outside Affinity's control and outside its retention policy.
 *   2. It would show yesterday's register as though it were current. A stale
 *      shareholding or a satisfied charge still showing as live is worse than
 *      an error message.
 *
 * So: the shell is cached (so it launches like an app and survives a flaky
 * connection long enough to tell you), and everything else goes to the
 * network. If the network is not there, the user is told plainly.
 * ---------------------------------------------------------------------------
 */

const SHELL_CACHE = "affinity-shell-v1";

// Only the files needed to render the frame and say something useful.
const SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A missing file must not stop the worker installing; the app still
      // works, it just is not installable until the next deploy.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch anything that is not a plain GET from this origin. That rules
  // out every Supabase call, every write, and every cross-origin request in
  // one condition rather than by maintaining a list of things to exclude.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache the authentication callback or anything carrying a token.
  if (url.hash.includes("access_token") || url.search.includes("code=")) return;

  // Hashed build assets are immutable, so cache-first is safe and makes launch
  // fast. Their filenames change on every deploy, so this can never serve an
  // old version of the code.
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // The document itself: network first, so a deploy is picked up immediately
  // and nobody is left running last week's build. The cached shell is only a
  // fallback for when the network is genuinely unavailable.
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit || offlineNotice()))
    );
  }
});

// Shown when the app is opened with no connection. It says what is happening
// rather than presenting an empty frame that looks like a fault, and it is
// explicit that no data is held on the device.
function offlineNotice() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Affinity Core — no connection</title>
     <style>
       body { margin:0; min-height:100vh; display:flex; align-items:center;
              justify-content:center; background:#001242; color:#fff;
              font-family: Catamaran, system-ui, -apple-system, sans-serif;
              text-align:center; padding:24px; }
       h1 { color:#00C4CC; font-size:30px; margin:0 0 8px; }
       p  { font-size:14px; line-height:1.7; opacity:0.85; max-width:24em; margin:0 auto 8px; }
       .q { font-size:12px; opacity:0.6; margin-top:18px; }
     </style></head><body><div>
       <h1>Affinity</h1>
       <p>Affinity Core needs a connection. Client records are never stored on
          this device, so there is nothing to show until you are back online.</p>
       <p class="q">Reconnect and reopen the app.</p>
     </div></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Signing out clears the shell cache, so a shared or returned device is not
// left holding anything at all.
self.addEventListener("message", (event) => {
  if (event.data === "affinity-signed-out") {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
});
