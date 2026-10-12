/*
 * Orbite — recevoir un document partagé depuis le téléphone (Lot 2, choix validé le 12 oct. 2026 :
 * fiche de paie, tableau de la banque, offre). Orbite installée apparaît dans « Partager » ; le service worker garde
 * les fichiers (cache « orbite-recus ») et ouvre #recevoir. Ici : lecture du cache puis effacement immédiat,
 * lecture sur l'appareil (fiche-lecture.js), reconnaissance (RecevoirCalcul) et ouverture du bon outil.
 * Une image n'est pas lue d'avance (la lecture d'une photo prend du temps) : la personne choisit.
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var $ = O.$, dlg = $("dlg-recevoir"), RC = window.RecevoirCalcul;
  if (!dlg || !dlg.showModal || !RC) return;
  var RECUS = "orbite-recus", fichiers = [], jeton = 0;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function taille(o) { return o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + " ko" : (Math.round(o / 104857.6) / 10).toString().replace(".", ",") + " Mo"; }
  function estPdf(f) { return /pdf/i.test(f.type) || /\.pdf$/i.test(f.name); }

  /* Fichiers déposés par le service worker, puis effacés : rien ne reste sur l'appareil. */
  function lireRecus() {
    if (!window.caches) return Promise.resolve([]);
    return caches.open(RECUS).then(function (c) {
      return c.match("/__orbite/recu/liste").then(function (r) { return r ? r.json() : { n: 0 }; }).then(function (l) {
        var n = Math.min(5, l.n || 0), lus = [];
        for (var i = 0; i < n; i++) lus.push(c.match("/__orbite/recu/" + i));
        return Promise.all(lus);
      });
    }).then(function (reps) {
      return Promise.all(reps.filter(Boolean).map(function (r, i) {
        var nom = "document"; try { nom = decodeURIComponent(r.headers.get("X-Orbite-Nom") || "document"); } catch (e) {}
        var type = r.headers.get("Content-Type") || "application/octet-stream";
        return r.blob().then(function (b) { return new File([b], nom || "document-" + (i + 1), { type: type }); });
      }));
    }).then(function (liste) { return caches.delete(RECUS).then(function () { return liste; }); })
      .catch(function () { return caches.delete(RECUS).catch(function () {}).then(function () { return []; }); });
  }

  function etat(t, erreur) { var e = $("recevoir-etat"); e.textContent = t || ""; e.classList.toggle("recevoir__etat--erreur", !!erreur); e.hidden = !t; }
  function proposer(type, sur) {
    var res = $("recevoir-resultat"), ch = $("recevoir-choix");
    if (type) {
      $("recevoir-type").textContent = RC.TYPES[type].titre.toLowerCase();
      $("recevoir-action").textContent = RC.TYPES[type].action;
      $("recevoir-action").setAttribute("data-type", type);
      res.hidden = false;
      $("recevoir-choix-titre").textContent = "Ce n'est pas ça ? Choisissez :";
      etat(sur === "sur" ? "" : "Vérifiez : la reconnaissance n'est pas certaine.");
    } else {
      res.hidden = true;
      $("recevoir-choix-titre").textContent = "Quel est ce document ?";
    }
    ch.hidden = false;
    dlg.querySelectorAll("[data-recevoir]").forEach(function (b) { b.hidden = b.getAttribute("data-recevoir") === type; });
    requestAnimationFrame(function () { (type ? $("recevoir-action") : dlg.querySelector("[data-recevoir]")).focus(); });
  }

  function reconnaitre() {
    var f = fichiers[0], ici = ++jeton;
    $("recevoir-resultat").hidden = true; $("recevoir-choix").hidden = true;
    if (!estPdf(f) || !window.FicheLecture || !window.CreditAudit) {
      var r0 = RC.classer("", f.name);
      etat(estPdf(f) ? "" : "Photo reçue : dites à Orbite de quel document il s'agit.");
      proposer(r0.type, r0.sur);
      return;
    }
    etat("Lecture sur votre appareil…");
    window.FicheLecture.lire(f, { pagesMax: 2, progres: function (e, x) { if (ici === jeton) etat("Lecture sur votre appareil… " + Math.round((x || 0) * 100) + " %"); } })
      .then(function (res) {
        if (ici !== jeton) return;
        var r = RC.classer(window.CreditAudit.texteDeLignes(res.lignes), f.name);
        etat("");
        proposer(r.type, r.sur);
      })
      .catch(function (e) { if (ici !== jeton) return; etat((e && e.message) || "Ce document n'a pas pu être lu ; choisissez ce qu'il contient.", true); proposer(null); });
  }

  /* Va sur une vue, puis agit une fois la vue affichée. */
  function surVue(vue, fn) {
    if (O.lireRoute().vue === vue) { setTimeout(fn, 60); return; }
    var une = function (e) { if (e.detail.vue !== vue) return; doc.removeEventListener("orbite:vue", une); setTimeout(fn, 120); };
    doc.addEventListener("orbite:vue", une);
    location.hash = "#" + vue;
  }
  function ouvrirOutil(type) {
    var liste = fichiers.slice();
    jeton++;
    dlg.close();
    if (type === "fiche") surVue("salaire", function () { if (window.OrbiteFiche) { window.OrbiteFiche.ouvrir(); window.OrbiteFiche.lancer(liste[0]); } });
    else surVue("credit", function () {
      var ok = window.ModuleCredit && window.ModuleCredit.lireDocument(type === "tableau" ? "audit" : "offre", type === "tableau" ? liste : [liste[0]]);
      if (!ok) O.toast("L'outil n'a pas pu s'ouvrir : ouvrez-le dans Crédit › Outils avancés.", { erreur: true });
    });
  }
  $("recevoir-action").addEventListener("click", function () { ouvrirOutil(this.getAttribute("data-type")); });
  dlg.querySelectorAll("[data-recevoir]").forEach(function (b) { b.addEventListener("click", function () { ouvrirOutil(b.getAttribute("data-recevoir")); }); });
  dlg.addEventListener("close", function () { jeton++; });

  function montrer(liste) {
    fichiers = liste;
    var ul = $("recevoir-fichiers"); ul.textContent = "";
    liste.forEach(function (f) {
      var li = cree("li"), ico = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), u = doc.createElementNS("http://www.w3.org/2000/svg", "use");
      u.setAttribute("href", "/orbite/icones.svg#" + (estPdf(f) ? "fiche" : "photo")); ico.setAttribute("aria-hidden", "true"); ico.appendChild(u);
      li.appendChild(ico); li.appendChild(cree("span", "recevoir__nom", f.name)); li.appendChild(cree("small", null, taille(f.size)));
      ul.appendChild(li);
    });
    dlg.showModal();
    reconnaitre();
  }

  function demarrer() {
    if (!/^#recevoir/.test(location.hash)) return;
    var erreur = /erreur=1/.test(location.hash);
    history.replaceState(history.state, "", location.pathname + location.search + "#orbite");
    lireRecus().then(function (liste) {
      if (!liste.length) { O.toast(erreur ? "Le document partagé n'a pas pu être reçu. Réessayez, ou ouvrez-le depuis l'outil." : "Aucun document reçu.", { erreur: erreur }); return; }
      /* La personne vient de partager ce document : il passe devant une éventuelle fenêtre « Quoi de neuf »
         (ouverte au même moment, elle reste dessous et se lira ensuite). */
      setTimeout(function () { montrer(liste); }, 300);
    });
  }
  /* Au démarrage (après la redirection du service worker), ou si l'adresse passe à #recevoir dans une page déjà ouverte. */
  if (O.pret) demarrer(); else doc.addEventListener("orbite:pret", demarrer, { once: true });
  window.addEventListener("hashchange", function () { if (O.pret && /^#recevoir/.test(location.hash)) demarrer(); });
  window.OrbiteRecevoir = { montrer: montrer };
})();
