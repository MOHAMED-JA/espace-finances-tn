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
  function montrerNouveautes(viergeAuDepart) {
    var N = window.ORBITE_NOUVEAUTES, cle = "orbite-nouveautes";
    if (!N || !N.version) return;
    var vue = null, maj = false;
    try { vue = localStorage.getItem(cle); maj = sessionStorage.getItem("orbite-maj") === "1"; sessionStorage.removeItem("orbite-maj"); } catch (e) { return; }
    try { localStorage.setItem(cle, N.version); } catch (e) {}
    /* Sans trace d'une version vue : nouveau venu (profil vierge) → rien ; utilisateur d'avant cette fonction → les notes. */
    var vierge = typeof viergeAuDepart === "boolean" ? viergeAuDepart : O.profilVierge();
    if (vue === N.version || (!vue && !maj && vierge)) { if (maj) O.toast("Orbite est à jour."); return; }
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
  /* Rappels en place (essai, abonnement, réduction de taux, objectifs…) : repris par le calendrier de « Mon mois ». */
  window.OrbiteRappels = { liste: function () { return liste(); } };
  /* Nouveau venu : décidé à l'ouverture (il peut remplir son premier pas avant l'affichage des notes). */
  function planifier() { var v = O.profilVierge(); setTimeout(function () { montrerNouveautes(v); }, 600); }
  if (O.pret) planifier();
  else doc.addEventListener("orbite:pret", planifier, { once: true });

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
    var l = R.rappels(sy, acces, fiscal, new Date());
    /* Échéances des objectifs (« Ma progression ») : un mois avant, type perso, email sans montant. */
    var PG = window.OrbiteProgression, PC = window.Progression;
    if (PG && PC) l = l.concat(PC.rappels(PG.objectifs(), new Date()));
    return l;
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

  /* ---------- Rappels par email ----------
     Plan daté (textes sans montant, RappelsCalcul.planEmail) enregistré seulement s'il a changé ; la fonction serveur
     « rappels-email » l'envoie à 12 h 30. Adresse de contact différente de la connexion : confirmation par un clic. */
  var RE = E && E.rappelsEmail, signatureEnvoyee = null, etatEmail = null, confirmationDemandee = "", relanceFaite = false, attente = null;
  function connexion() { var u = O.utilisateur && O.utilisateur(); return ((u && u.email) || "").toLowerCase(); }
  function signature(plan) { return JSON.stringify(plan.map(function (x) { return [x.id, String(x.quand).slice(0, 10), x.jusqua, x.etiquette, x.titre, x.corps, x.conseil, x.url]; })); }
  function recent(iso, jours) { var t = iso ? Date.parse(iso) : NaN; return isFinite(t) && Date.now() - t < jours * 86400000; }
  function synchroniserEmail() {
    var p = O.profil(); if (!p || !RE || !R || !R.planEmail) return;
    if (!p.rappelsEmail) { rendreEmail(); return; }
    var plan = R.planEmail(liste()), sig = signature(plan);
    if (sig === signatureEnvoyee) { rendreEmail(); return; }
    signatureEnvoyee = sig;
    /* Après une réactivation en cours, pour ne pas lire l'ancienne désinscription. */
    (attente || Promise.resolve()).then(function () { return RE.enregistrer(plan); }).then(apresEtat, function () { signatureEnvoyee = null; });
  }
  function apresEtat(etat) {
    etatEmail = etat || {};
    var p = O.profil();
    /* Désinscrit depuis un email : la case du profil suit (elle ne se recoche que par l'utilisateur). */
    if (p && p.rappelsEmail && etatEmail.desinscrit_le) { O.majProfil({ rappelsEmail: false }); return; }
    demanderConfirmation();
    rendreEmail();
  }
  function demanderConfirmation() {
    var p = O.profil(), e = etatEmail, c = p ? String(p.emailContact || "").toLowerCase() : "";
    if (!p || !p.rappelsEmail || !e || !c || c === connexion() || c === e.adresse_confirmee || confirmationDemandee === c) return;
    if (c === e.confirmation_adresse && recent(e.confirmation_envoyee_le, 7)) return;
    confirmationDemandee = c;
    RE.confirmer().then(function (r) {
      if (r && r.envoye) {
        etatEmail.confirmation_adresse = c; etatEmail.confirmation_envoyee_le = new Date().toISOString();
        O.toast("Email de confirmation envoyé à " + c + " : cliquez sur le lien qu'il contient.");
      } else if (r && r.raison === "inactif" && !relanceFaite) {
        /* Le profil (case cochée) n'était pas encore enregistré : un nouvel essai dans quelques secondes. */
        relanceFaite = true; confirmationDemandee = ""; setTimeout(demanderConfirmation, 5000);
      }
      rendreEmail();
    }, function () { confirmationDemandee = ""; });
  }
  function rendreEmail() {
    var aide = $("p-rappels-email-aide"), p = O.profil(); if (!aide || !p) return;
    var c = String(p.emailContact || "").toLowerCase(), e = etatEmail || {};
    if (!p.rappelsEmail) aide.textContent = "Fin d'un crédit, réduction de taux, 31 décembre : un email à 12 h 30, seulement les jours où un rappel arrive, sans aucun montant.";
    else if (c && c !== connexion() && c !== e.adresse_confirmee) aide.textContent = "Confirmez " + c + " : cliquez sur le lien de l'email envoyé à cette adresse (valable 7 jours). D'ici là, aucun rappel n'y part.";
    else aide.textContent = "Activé : vos rappels partent à " + (c || connexion()) + " à 12 h 30, les jours où il y en a un, sans aucun montant.";
  }
  var caseEmail = $("p-rappels-email");
  if (caseEmail && RE) caseEmail.addEventListener("change", function () {
    signatureEnvoyee = null; relanceFaite = false;
    /* Cochée par l'utilisateur : lève une désinscription faite depuis un email. Décochée : le plan est effacé. */
    attente = (caseEmail.checked ? RE.reactiver() : RE.enregistrer([])).then(function (e) { etatEmail = e || {}; rendreEmail(); }, function () {});
  });

  /* Rappels mis à jour à chaque changement du profil (et au démarrage), sans surcharger : une fois par seconde au plus. */
  var minuterie = null;
  function planifierRappels() { clearTimeout(minuterie); minuterie = setTimeout(function () { envoyerRappels(); synchroniserEmail(); }, 1000); }
  O.surProfil(planifierRappels);
  doc.addEventListener("orbite:objectifs", planifierRappels);
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "compte") { majAppli(); rendreRappels(); } });
  majAppli();
})();
