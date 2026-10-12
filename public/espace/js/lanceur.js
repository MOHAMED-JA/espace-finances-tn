/*
 * Orbite — lanceur d'applications (maquette validée le 12 oct. 2026 : les simulateurs s'ouvrent DANS Orbite).
 * Icône en grille dans la barre : les parties d'Orbite et les quatre simulateurs. Un simulateur s'ouvre en plein
 * écran dans un cadre isolé (iframe en bac à sable, origine différente : il ne voit ni le compte ni le profil),
 * avec « ← Orbite » pour revenir et « Ouvrir à part » en secours. Chaque simulateur garde son état tant que la page
 * reste ouverte. Le bouton « retour » du téléphone ferme le simulateur. Lien direct : #<vue>?simulateur=<clé>.
 * CSP : frame-src https://mohamed-ja.github.io (règle /espace/* de _headers).
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var $ = O.$, dlgApps = $("dlg-apps"), dlgSim = $("dlg-simulateur");
  if (!dlgApps || !dlgSim) return;
  var BASE = "https://mohamed-ja.github.io/";
  var SIMULATEURS = [
    { cle: "credit", court: "Crédit pro", titre: "Simulateur de crédit", url: BASE + "simulateur-credit/", ico: "calculatrice", teinte: "credit",
      mots: "simulateur credit pret banque audit tableau offre agence conseiller kridi" },
    { cle: "vie", court: "Assurance vie", titre: "Simulateur d'assurance vie et CEA", url: BASE + "simulateur-assurance-vie/", ico: "bouclier", teinte: "epargne",
      mots: "simulateur assurance vie cea impot conseiller portefeuille" },
    { cle: "auto", court: "Assurance auto", titre: "Simulateur d'assurance automobile", url: BASE + "simulateur-Assurance-Automobile/", ico: "voiture", teinte: "ambre",
      mots: "simulateur assurance auto automobile voiture karhba prime" },
    { cle: "salaire", court: "Calcul salaire", titre: "Calculateur de salaire", url: BASE + "portail-rh/calculateur-salaire/", ico: "salaire", teinte: "salaire",
      mots: "calculateur salaire brut net paie rh khedma" }
  ];
  var ORBITE = [
    { court: "Mon orbite", hash: "#orbite", ico: "orbite", teinte: "cosmos" },
    { court: "Salaire", hash: "#salaire", ico: "salaire", teinte: "salaire" },
    { court: "Épargne", hash: "#epargne", ico: "epargne", teinte: "epargne" },
    { court: "Crédit", hash: "#credit", ico: "credit", teinte: "credit" },
    { court: "Négociation", ico: "hausse", teinte: "salaire", faire: function () { allerPuis("salaire", function () { if (O.ouvrirNegociation) O.ouvrirNegociation(); }); }, possible: function () { return !O.negociationPossible || O.negociationPossible(); } },
    { court: "Dossier banque", ico: "fiche", teinte: "credit", faire: function () { allerPuis("credit", function () { if (O.ouvrirDossier) O.ouvrirDossier(); }); } },
    { court: "Progression", hash: "#progression", ico: "cible", teinte: "epargne" },
    { court: "Assistant", hash: "#assistant", ico: "etoile", teinte: "cosmos" }
  ];

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), u = doc.createElementNS("http://www.w3.org/2000/svg", "use");
    s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }
  function tuile(el, x, externe) {
    el.className = "apps__app apps__app--" + x.teinte + (externe ? " apps__app--sim" : "");
    var i = cree("i", "apps__ico"); i.appendChild(icone(x.ico)); el.appendChild(i);
    el.appendChild(cree("span", "apps__nom", x.court));
    return el;
  }
  /* Va sur une vue, puis agit quand elle est affichée. */
  function allerPuis(vue, fn) {
    if (O.lireRoute().vue === vue) { fn(); return; }
    var une = function (e) { if (e.detail.vue !== vue) return; doc.removeEventListener("orbite:vue", une); setTimeout(fn, 80); };
    doc.addEventListener("orbite:vue", une);
    location.hash = "#" + vue;
  }

  /* ---------- Fenêtre « Mes applications » ---------- */
  function construire() {
    var ul = $("apps-orbite"); ul.textContent = "";
    ORBITE.forEach(function (x) {
      if (x.possible && !x.possible()) return;
      var li = cree("li"), el;
      if (x.hash) { el = cree("a"); el.href = x.hash; el.addEventListener("click", function () { dlgApps.close(); }); }
      else { el = cree("button"); el.type = "button"; el.addEventListener("click", function () { dlgApps.close(); x.faire(); }); }
      li.appendChild(tuile(el, x, false)); ul.appendChild(li);
    });
    var us = $("apps-sim"); us.textContent = "";
    SIMULATEURS.forEach(function (x) {
      var li = cree("li"), b = cree("button"); b.type = "button"; b.setAttribute("data-sim", x.cle);
      b.setAttribute("aria-label", x.titre + " (s'ouvre dans Orbite)");
      b.addEventListener("click", function () { dlgApps.close(); ouvrirSimulateur(x.cle); });
      li.appendChild(tuile(b, x, true)); us.appendChild(li);
    });
  }
  function ouvrirApps() {
    if (dlgApps.open) { dlgApps.close(); return; }
    construire();
    dlgApps.showModal();
    var premier = dlgApps.querySelector(".apps__app"); if (premier) premier.focus();
  }
  $("apps-ouvrir").addEventListener("click", ouvrirApps);
  $("apps-fermer").addEventListener("click", function () { dlgApps.close(); });
  dlgApps.addEventListener("click", function (e) { if (e.target === dlgApps) dlgApps.close(); });

  /* ---------- Simulateur dans Orbite ---------- */
  var cadres = {}, courant = null, minuterie = null, avecHistorique = false;
  function trouver(cle) { return SIMULATEURS.filter(function (x) { return x.cle === cle; })[0] || null; }
  function attente(visible, texte) {
    $("sim-attente").hidden = !visible;
    if (texte) $("sim-attente-lib").textContent = texte;
    $("sim-attente").classList.toggle("simulateur__attente--lent", !!texte && texte.indexOf("temps") > 0);
  }
  function cadre(x) {
    if (cadres[x.cle]) return cadres[x.cle];
    var f = cree("iframe", "simulateur__cadre");
    f.title = x.titre;
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("allow", "clipboard-write");
    f.dataset.charge = "";
    f.addEventListener("load", function () {
      f.dataset.charge = "1";
      if (courant === x.cle) { clearTimeout(minuterie); attente(false); }
    });
    f.src = x.url;
    $("sim-corps").appendChild(f);
    cadres[x.cle] = f;
    return f;
  }
  function ouvrirSimulateur(cle) {
    var x = trouver(cle); if (!x) return;
    courant = cle;
    $("sim-titre").textContent = x.titre;
    $("sim-externe").href = x.url;
    dlgSim.className = "simulateur simulateur--" + x.teinte;
    var f = cadre(x);
    Object.keys(cadres).forEach(function (k) { cadres[k].hidden = k !== cle; });
    clearTimeout(minuterie);
    if (!navigator.onLine && !f.dataset.charge) attente(true, "Vous êtes hors connexion : le simulateur s'ouvrira dès le retour du réseau.");
    else if (!f.dataset.charge) {
      attente(true, "Ouverture du simulateur…");
      minuterie = setTimeout(function () { if (!f.dataset.charge && courant === cle) attente(true, "Le simulateur prend du temps à répondre. Vérifiez votre connexion, ou ouvrez-le à part."); }, 12000);
    } else attente(false);
    if (!dlgSim.open) {
      dlgSim.showModal();
      /* Le bouton « retour » du téléphone ramène à Orbite. */
      try { history.pushState({ simulateur: cle }, "", location.href); avecHistorique = true; } catch (e) { avecHistorique = false; }
    }
    $("sim-retour").focus();
  }
  function fermerSimulateur() {
    if (!dlgSim.open) return;
    dlgSim.close();
  }
  dlgSim.addEventListener("close", function () {
    clearTimeout(minuterie);
    courant = null;
    if (avecHistorique) { avecHistorique = false; if (history.state && history.state.simulateur) history.back(); }
  });
  window.addEventListener("popstate", function () { if (dlgSim.open) { avecHistorique = false; dlgSim.close(); } });
  $("sim-retour").addEventListener("click", fermerSimulateur);
  window.addEventListener("online", function () { if (courant && !cadres[courant].dataset.charge) { cadres[courant].src = trouver(courant).url; attente(true, "Ouverture du simulateur…"); } });

  /* Lien direct : #<vue>?simulateur=<clé>. */
  function depuisRoute() {
    var r = O.lireRoute && O.lireRoute();
    var cle = r && r.params && r.params.get("simulateur");
    if (!cle || !trouver(cle)) return;
    var p = new URLSearchParams(r.params); p.delete("simulateur");
    history.replaceState(null, "", "#" + r.vue + (p.toString() ? "?" + p.toString() : ""));
    ouvrirSimulateur(cle);
  }
  window.addEventListener("hashchange", depuisRoute);
  doc.addEventListener("orbite:pret", depuisRoute);
  if (O.pret) depuisRoute();

  O.ouvrirApps = ouvrirApps;
  O.ouvrirSimulateur = ouvrirSimulateur;
  O.SIMULATEURS = SIMULATEURS;
})();
