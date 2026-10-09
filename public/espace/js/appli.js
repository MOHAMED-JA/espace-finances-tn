/*
 * Orbite — application installable (service worker /sw.js), invitation à l'installation, rappels sur l'appareil.
 * Les rappels sont calculés ici (RappelsCalcul) puis confiés au service worker, qui les affiche à la bonne date :
 * tout de suite quand Orbite est ouverte, et par synchronisation périodique quand l'application installée est fermée
 * (Chrome / Edge). Préférence propre à l'appareil : localStorage « ef-rappels ».
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, R = window.RappelsCalcul, OI = window.OrbiteIntelligence, $ = O.$, doc = document;
  var DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  var invitation = null, enregistrement = null;
  function pref() { try { return localStorage.getItem("ef-rappels") === "1"; } catch (e) { return false; } }
  function definirPref(v) { try { if (v) localStorage.setItem("ef-rappels", "1"); else localStorage.removeItem("ef-rappels"); } catch (e) {} }
  function installee() { return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }

  /* ---------- Service worker ---------- */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(127\.0\.0\.1|localhost)$/.test(location.hostname))) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function (r) { enregistrement = r; majAppli(); envoyerRappels(); surveillerVersion(r); }).catch(function () { majAppli(); });
  }

  /* ---------- Nouvelle version : bandeau « Mettre à jour » ---------- */
  /* Vérifie à l'ouverture, au retour sur l'application et toutes les 30 minutes. Une version en attente
     (installée mais pas encore active) déclenche le bandeau ; « Mettre à jour » l'active puis recharge la page. */
  var rechargementDemande = false;
  function surveillerVersion(r) {
    if (!navigator.serviceWorker.controller) return; /* première visite : pas d'ancienne version à remplacer */
    if (r.waiting) proposerMaj(r.waiting);
    r.addEventListener("updatefound", function () {
      var nv = r.installing;
      if (!nv) return;
      nv.addEventListener("statechange", function () { if (nv.state === "installed" && navigator.serviceWorker.controller) proposerMaj(nv); });
    });
    var verifier = function () { r.update().catch(function () {}); };
    setInterval(verifier, 30 * 60 * 1000);
    doc.addEventListener("visibilitychange", function () { if (doc.visibilityState === "visible") verifier(); });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!rechargementDemande) return;
      rechargementDemande = false;
      try { sessionStorage.setItem("orbite-maj", "1"); } catch (e) {}
      location.reload();
    });
  }
  function proposerMaj(sw) {
    var bandeau = $("maj-bandeau");
    if (!bandeau || bandeau.getAttribute("data-ferme") === "1") return;
    bandeau.hidden = false;
    $("maj-appliquer").onclick = function () {
      this.disabled = true;
      this.textContent = "Mise à jour…";
      rechargementDemande = true;
      sw.postMessage({ type: "activer" });
      /* Filet : si l'activation tarde, on recharge quand même (la page suivante prendra la nouvelle version). */
      setTimeout(function () { if (rechargementDemande) { try { sessionStorage.setItem("orbite-maj", "1"); } catch (e) {} location.reload(); } }, 4000);
    };
    $("maj-plus-tard").onclick = function () { bandeau.hidden = true; bandeau.setAttribute("data-ferme", "1"); };
  }

  /* ---------- Quoi de neuf ---------- */
  /* Montré une fois par version de notes (nouveautes.js) aux utilisateurs qui avaient déjà Orbite ; jamais à la toute première visite. */
  function montrerNouveautes() {
    var N = window.ORBITE_NOUVEAUTES, cle = "orbite-nouveautes";
    if (!N || !N.version) return;
    var vue = null, maj = false;
    try { vue = localStorage.getItem(cle); maj = sessionStorage.getItem("orbite-maj") === "1"; sessionStorage.removeItem("orbite-maj"); } catch (e) { return; }
    try { localStorage.setItem(cle, N.version); } catch (e) {}
    /* Sans trace d'une version vue : nouveau venu (profil vierge) → rien ; utilisateur d'avant cette fonction → les notes. */
    if (vue === N.version || (!vue && !maj && O.profilVierge())) { if (maj) O.toast("Orbite est à jour."); return; }
    var dlg = $("dlg-nouveautes"), ul = $("nouveautes-liste");
    if (!dlg || !dlg.showModal) { O.toast("Orbite est à jour."); return; }
    ul.textContent = "";
    N.points.forEach(function (p) {
      var li = doc.createElement("li"), t = doc.createElement("strong");
      t.textContent = p.titre;
      li.appendChild(t);
      li.appendChild(doc.createTextNode(" " + p.texte));
      ul.appendChild(li);
    });
    $("nouveautes-date").textContent = N.date || "";
    dlg.showModal();
  }
  window.OrbiteMaj = { proposer: proposerMaj, nouveautes: montrerNouveautes };
  if (O.pret) setTimeout(montrerNouveautes, 600);
  else doc.addEventListener("orbite:pret", function () { setTimeout(montrerNouveautes, 600); }, { once: true });

  /* ---------- Installation ---------- */
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); invitation = e; majAppli(); });
  window.addEventListener("appinstalled", function () { invitation = null; majAppli(); O.toast("Orbite est installée : retrouvez-la sur votre écran d'accueil."); });
  function majAppli() {
    var etat = $("appli-etat"), b = $("appli-installer"), ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !installee();
    b.hidden = !invitation;
    $("appli-ios").hidden = !ios;
    etat.textContent = installee() ? "Orbite est installée sur cet appareil." :
      invitation ? "Orbite peut être installée sur cet appareil." :
      ios ? "Ajoutez Orbite à votre écran d'accueil depuis Safari." :
      enregistrement || (navigator.serviceWorker && navigator.serviceWorker.controller) ? "Orbite fonctionne hors connexion sur ce navigateur. Pour l'installer, utilisez le menu du navigateur (« Installer l'application »)." :
      "L'installation n'est pas proposée par ce navigateur.";
  }
  $("appli-installer").addEventListener("click", function () {
    if (!invitation) return;
    invitation.prompt();
    invitation.userChoice.then(function () { invitation = null; majAppli(); }).catch(function () {});
  });

  /* ---------- Rappels ---------- */
  function liste() {
    var sy = O.synthese(); if (!sy || !R) return [];
    var acces = window.OrbiteAbonnement && window.OrbiteAbonnement.acces();
    var fiscal = null;
    try { fiscal = OI ? OI.optimiseurFiscal(sy) : null; } catch (e) { fiscal = null; }
    return R.rappels(sy, acces, fiscal, new Date());
  }
  function envoyerRappels() {
    rendreRappels();
    if (!pref() || !("Notification" in window) || Notification.permission !== "granted" || !navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then(function (r) {
      if (r.active) r.active.postMessage({ type: "rappels", rappels: liste() });
      /* Application installée : vérification quotidienne, même fermée (si le navigateur le permet). */
      if (r.periodicSync) r.periodicSync.register("orbite-rappels", { minInterval: 12 * 3600 * 1000 }).catch(function () {});
    }).catch(function () {});
  }
  function rendreRappels() {
    var etat = $("rappels-etat"), act = $("rappels-activer"), cou = $("rappels-couper"), ul = $("rappels-liste");
    var support = "Notification" in window && "serviceWorker" in navigator;
    var perm = support ? Notification.permission : "denied", on = pref() && perm === "granted";
    act.hidden = on || !support; cou.hidden = !on;
    etat.textContent = !support ? "Les notifications ne sont pas disponibles sur ce navigateur." :
      perm === "denied" ? "Les notifications sont bloquées pour Orbite dans les réglages du navigateur." :
      on ? "Rappels activés sur cet appareil." + (installee() ? "" : " Installez Orbite pour les recevoir aussi quand elle est fermée.") :
      "Rappels désactivés.";
    ul.textContent = "";
    if (!on) return;
    var l = liste();
    if (!l.length) { var v = doc.createElement("li"); v.textContent = "Aucun rappel prévu pour le moment."; ul.appendChild(v); return; }
    l.slice(0, 6).forEach(function (x) {
      var li = doc.createElement("li"), s = doc.createElement("strong"), t = doc.createElement("small");
      s.textContent = x.titre; t.textContent = "À partir du " + DATE.format(new Date(x.quand));
      li.appendChild(s); li.appendChild(t); ul.appendChild(li);
    });
  }
  $("rappels-activer").addEventListener("click", function () {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(function (p) {
      if (p === "granted") { definirPref(true); envoyerRappels(); O.toast("Rappels activés sur cet appareil."); }
      else { definirPref(false); rendreRappels(); }
    });
  });
  $("rappels-couper").addEventListener("click", function () {
    definirPref(false);
    if (navigator.serviceWorker) navigator.serviceWorker.ready.then(function (r) { if (r.active) r.active.postMessage({ type: "rappels", rappels: [] }); if (r.periodicSync) r.periodicSync.unregister("orbite-rappels").catch(function () {}); }).catch(function () {});
    rendreRappels();
    O.toast("Rappels coupés sur cet appareil.");
  });

  /* Rappels mis à jour à chaque changement du profil (et au démarrage), sans surcharger : une fois par seconde au plus. */
  var minuterie = null;
  O.surProfil(function () { clearTimeout(minuterie); minuterie = setTimeout(envoyerRappels, 1000); });
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "compte") { majAppli(); rendreRappels(); } });
  majAppli();
})();
