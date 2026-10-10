/*
 * Orbite — service worker : application installable et utilisable hors connexion, rappels.
 * - Pages (navigation) : réseau d'abord, copie locale si le réseau manque (l'application reste consultable).
 * - Fichiers du site (scripts, styles, icônes, polices) : copie locale servie tout de suite, mise à jour en arrière-plan.
 * - Jamais mis en cache : les autres domaines (Supabase, etc.), les requêtes autres que GET, les paramètres de paiement.
 *   Les données personnelles ne passent donc jamais par ce cache : elles restent dans la session Supabase de l'appareil.
 * - Rappels : la page dépose une courte liste de rappels datés (/__orbite/rappels.json, dans le cache) ;
 *   la synchronisation périodique (application installée) les affiche même quand Orbite est fermée.
 */
"use strict";
var VERSION = "orbite-2026-10-10s";
var CACHE = VERSION + "-site";
var RAPPELS = "/__orbite/rappels.json";
var DEJA = "/__orbite/rappels-vus.json";
var ESSENTIELS = ["/espace/", "/manifest.webmanifest", "/orbite/icone.svg", "/orbite/icone-192.png", "/orbite/icones.svg"];

/* Liste des fichiers d'une page : scripts, styles, icônes, puis polices citées par les feuilles de style. */
function fichiersDe(html, base) {
  var urls = [], re = /(?:src|href)="(\/[^"#?]+\.(?:js|css|svg|png|webmanifest))"/g, m;
  while ((m = re.exec(html))) urls.push(new URL(m[1], base).pathname);
  return urls;
}
function policesDe(css, base) {
  var urls = [], re = /url\(["']?(\/[^"')]+\.woff2)["']?\)/g, m;
  while ((m = re.exec(css))) urls.push(new URL(m[1], base).pathname);
  return urls;
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return fetch("/espace/", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("page indisponible");
      return r.clone().text().then(function (html) {
        var liste = ESSENTIELS.concat(fichiersDe(html, self.location.origin)).filter(function (u, i, t) { return t.indexOf(u) === i; });
        return c.put("/espace/", r).then(function () { return Promise.all(liste.map(function (u) { return u === "/espace/" ? null : c.add(new Request(u, { cache: "reload" })).catch(function () {}); })); })
          .then(function () {
            /* Polices citées dans les feuilles de style déjà mises en cache. */
            return Promise.all(liste.filter(function (u) { return /\.css$/.test(u); }).map(function (u) {
              return c.match(u).then(function (rc) { return rc ? rc.text() : ""; }).then(function (css) {
                return Promise.all(policesDe(css, self.location.origin).map(function (f) { return c.add(f).catch(function () {}); }));
              });
            }));
          });
      });
    }).catch(function () { return c.addAll(ESSENTIELS).catch(function () {}); });
  }));
  /* Pas de skipWaiting automatique : la nouvelle version attend que l'utilisateur clique « Mettre à jour »
     (ou s'applique d'elle-même quand Orbite a été fermée partout). Première installation : active tout de suite. */
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf("orbite-") === 0 && k !== CACHE && k !== "orbite-rappels"; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.indexOf("/__orbite/") === 0) return;
  /* Retour de paiement : toujours le réseau (la vérification doit se faire auprès du serveur). */
  if (url.searchParams.has("paiement") || /paiement-test\.html$/.test(url.pathname)) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok && /^\/espace\/?(index\.html)?$/.test(url.pathname)) { var copie = r.clone(); caches.open(CACHE).then(function (c) { c.put("/espace/", copie); }); }
      return r;
    }).catch(function () {
      return caches.match(/^\/espace\//.test(url.pathname) ? "/espace/" : url.pathname).then(function (r) {
        return r || caches.match("/espace/") || new Response("Hors connexion", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      });
    }));
    return;
  }
  if (!/\.(?:js|css|svg|png|woff2|webmanifest)$/.test(url.pathname)) return;
  /* Polices et images : le cache d'abord (elles ne changent pas). */
  if (/\.(?:woff2|png)$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(url.pathname).then(function (enCache) {
        return enCache || fetch(req).then(function (r) { if (r.ok) c.put(url.pathname, r.clone()); return r; });
      });
    }));
    return;
  }
  /* Scripts, styles et icônes : le réseau d'abord, pour que la page, ses scripts et ses styles soient toujours de la
     même version (sinon une nouvelle page peut s'afficher avec une ancienne feuille de style) ; le cache hors connexion. */
  e.respondWith(caches.open(CACHE).then(function (c) {
    return fetch(req, { cache: "no-cache" }).then(function (r) { if (r.ok) c.put(url.pathname, r.clone()); return r; })
      .catch(function () { return c.match(url.pathname).then(function (enCache) { return enCache || Response.error(); }); });
  }));
});

/* ---------- Rappels ---------- */
function lireJson(cle) {
  return caches.open("orbite-rappels").then(function (c) { return c.match(cle); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
}
function ecrireJson(cle, v) {
  return caches.open("orbite-rappels").then(function (c) { return c.put(cle, new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } })); });
}
/* Affiche les rappels arrivés à échéance, une seule fois chacun. */
function afficherRappels() {
  return Promise.all([lireJson(RAPPELS), lireJson(DEJA)]).then(function (r) {
    var liste = (r[0] && r[0].rappels) || [], vus = r[1] || {}, maintenant = Date.now(), montres = [];
    liste.forEach(function (x) {
      if (!x || !x.id || vus[x.id] || Date.parse(x.quand) > maintenant || (x.jusqua && Date.parse(x.jusqua) < maintenant)) return;
      vus[x.id] = maintenant;
      montres.push(self.registration.showNotification(x.titre, { body: x.corps, tag: x.id, icon: "/orbite/icone-192.png", badge: "/orbite/icone-192.png", data: { url: x.url || "/espace/" } }));
    });
    return Promise.all(montres).then(function () { return ecrireJson(DEJA, vus); });
  });
}
self.addEventListener("periodicsync", function (e) { if (e.tag === "orbite-rappels") e.waitUntil(afficherRappels()); });
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "activer") { self.skipWaiting(); return; }
  if (e.data && e.data.type === "rappels") e.waitUntil(ecrireJson(RAPPELS, { rappels: e.data.rappels || [], maj: Date.now() }).then(afficherRappels));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var cible = (e.notification.data && e.notification.data.url) || "/espace/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (fen) {
    for (var i = 0; i < fen.length; i++) {
      if (new URL(fen[i].url).pathname.indexOf("/espace/") === 0 && "focus" in fen[i]) { fen[i].navigate(cible).catch(function () {}); return fen[i].focus(); }
    }
    return self.clients.openWindow(cible);
  }));
});
