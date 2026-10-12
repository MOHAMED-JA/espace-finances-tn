/*
 * Orbite — partager une simulation (Lot 2, choix validé le 12 oct. 2026 : lien vers une page publique préremplie).
 * La personne qui reçoit le lien n'a pas besoin de compte : la page publique s'ouvre avec les montants.
 * Le lien ne porte que des montants (PartageLien) ; le salaire brut (épargne) et la situation de famille (salaire)
 * ne sont joints que si l'on coche la case. L'aperçu est calculé par PagesCalcul, la fonction même de la page publique :
 * ce qui est affiché ici est ce que verra la personne. QR code dessiné sur l'appareil (qrcode-generator, MIT, auto-hébergé).
 */
(function () {
  "use strict";
  var O = window.Orbite, L = window.PartageLien, doc = document;
  if (!O || !L) return;
  var $ = O.$, dlg = $("dlg-partager");
  if (!dlg || !dlg.showModal) return;
  var MODULES = { salaire: "ModuleSalaire", credit: "ModuleCredit", epargne: "ModuleEpargne" };
  var etat = { vue: null, options: {}, r: null, url: "" };
  var promesses = {};

  function charger(src, globale) {
    if (window[globale]) return Promise.resolve(window[globale]);
    if (!promesses[src]) promesses[src] = new Promise(function (ok, ko) {
      var s = doc.createElement("script"); s.src = src;
      s.onload = function () { ok(window[globale]); };
      s.onerror = function () { promesses[src] = null; ko(new Error("Chargement impossible : vérifiez la connexion.")); };
      doc.head.appendChild(s);
    });
    return promesses[src];
  }
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* ---------- Aperçu : ce que la page publique affichera ---------- */
  function apercu(r) {
    var chiffre = "", lib = "", second = "";
    try {
      var a = window.PagesCalcul.affichage(r.page, L.entreeCalcul(r.page, r.valeurs), new Date());
      if (r.page === "pret") { chiffre = a.mens_ent + a.mens_dec; lib = "par mois"; second = "Taux " + a.taux + " · " + a.duree_lib + " · coût total " + a.total; }
      else if (r.page === "salaire") { chiffre = a.net_ent + a.net_dec; lib = "net par mois"; second = "Impôt " + a.irpp + " · " + a.cot_lib.toLowerCase() + " " + a.cot; }
      else if (r.page === "vie") { chiffre = a.cap_ent + a.cap_dec; lib = a.cap_lib.charAt(0).toLowerCase() + a.cap_lib.slice(1); second = "Impôt économisé : " + a.eco + " par an · versé " + a.verse; }
      else if (r.page === "cea") { chiffre = a.eco_ent + a.eco_dec; lib = "d'impôt en moins cette année"; second = "Dépôt utile jusqu'à " + a.utile + " · disponible le " + a.dispo; }
    } catch (e) { second = ""; }
    $("partager-chiffre").textContent = chiffre;
    $("partager-chiffre-lib").textContent = lib;
    $("partager-second").textContent = second;
    $("partager-second").hidden = !second;
  }

  function rendre() {
    var mod = window[MODULES[etat.vue]], r = mod && mod.pourPartage ? mod.pourPartage(etat.options) : { erreur: "Rien à partager sur cette page." };
    var err = $("partager-erreur");
    if (r.erreur) { err.textContent = r.erreur; err.hidden = false; return false; }
    err.hidden = true;
    etat.r = r;
    etat.url = L.adresse(location.origin, r.page, r.valeurs);
    dlg.setAttribute("data-teinte", etat.vue);
    $("partager-page").textContent = L.PAGES[r.page].titre;
    var ul = $("partager-contenu"); ul.textContent = "";
    r.contenu.forEach(function (t) { ul.appendChild(cree("li", null, t)); });
    var s = r.sensible, bloc = $("partager-sensible");
    bloc.hidden = !(s && s.utile);
    if (s && s.utile) { $("partager-sensible-lib").textContent = s.libelle; $("partager-sensible-case").checked = s.inclus; }
    var det = $("partager-ecarts"), liste = $("partager-ecarts-liste");
    liste.textContent = "";
    r.ecarts.forEach(function (t) { liste.appendChild(cree("li", null, t)); });
    det.hidden = !r.ecarts.length;
    $("partager-ecarts-titre").textContent = r.ecarts.length === 1 ? "1 différence avec votre simulation" : r.ecarts.length + " différences avec votre simulation";
    $("partager-url").value = etat.url;
    var m = L.message(r.page, etat.url);
    $("partager-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(m.texte);
    $("partager-email").href = "mailto:?subject=" + encodeURIComponent(m.sujet) + "&body=" + encodeURIComponent(m.texte);
    $("partager-ouvrir").href = etat.url;
    $("partager-natif").hidden = !navigator.share;
    if (window.PagesCalcul) apercu(r);
    if (!$("partager-qr").hidden) dessinerQr();
    return true;
  }

  /* ---------- QR code ---------- */
  function matrice() {
    var q = window.qrcode(0, "M"); q.addData(etat.url); q.make();
    var n = q.getModuleCount(), m = [];
    for (var y = 0; y < n; y++) { m.push([]); for (var x = 0; x < n; x++) m[y].push(q.isDark(y, x)); }
    return m;
  }
  function dessinerQr() {
    var boite = $("partager-qr-image");
    return charger("/espace/vendor/qrcode-generator-1.4.4.js", "qrcode").then(function () {
      var m = matrice(), n = m.length, marge = 4, t = n + marge * 2, d = "";
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += "M" + (x + marge) + " " + (y + marge) + "h1v1h-1z";
      var NS = "http://www.w3.org/2000/svg", svg = doc.createElementNS(NS, "svg"), fond = doc.createElementNS(NS, "rect"), p = doc.createElementNS(NS, "path");
      svg.setAttribute("viewBox", "0 0 " + t + " " + t); svg.setAttribute("shape-rendering", "crispEdges"); svg.setAttribute("aria-hidden", "true");
      fond.setAttribute("width", t); fond.setAttribute("height", t); fond.setAttribute("fill", "#fff");
      p.setAttribute("d", d); p.setAttribute("fill", "#0B1220");
      svg.appendChild(fond); svg.appendChild(p);
      boite.textContent = ""; boite.appendChild(svg);
    }).catch(function (e) { boite.textContent = e.message; });
  }
  $("partager-qr-bouton").addEventListener("click", function () {
    var q = $("partager-qr"), ouvrir = q.hidden;
    q.hidden = !ouvrir;
    this.setAttribute("aria-expanded", ouvrir ? "true" : "false");
    if (ouvrir) dessinerQr();
  });
  $("partager-qr-png").addEventListener("click", function () {
    charger("/espace/vendor/qrcode-generator-1.4.4.js", "qrcode").then(function () {
      var m = matrice(), n = m.length, marge = 4, px = 10, t = (n + marge * 2) * px, c = doc.createElement("canvas");
      c.width = t; c.height = t;
      var g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, t, t); g.fillStyle = "#0B1220";
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) g.fillRect((x + marge) * px, (y + marge) * px, px, px);
      c.toBlob(function (b) { if (b) O.telecharger("orbite-qr-" + etat.r.page + ".png", b); }, "image/png");
    }).catch(function (e) { O.toast(e.message, { type: "erreur" }); });
  });

  /* ---------- Copier, partager ---------- */
  var minuterie = null;
  $("partager-copier").addEventListener("click", function () {
    var champ = $("partager-url"), lib = $("partager-copier-lib");
    function fait() {
      lib.textContent = "Copié";
      clearTimeout(minuterie); minuterie = setTimeout(function () { lib.textContent = "Copier"; }, 2200);
      O.toast("Lien copié : collez-le où vous voulez.", { type: "ok" });
    }
    var copie = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(etat.url) : Promise.reject();
    copie.then(fait, function () { champ.focus(); champ.select(); try { if (doc.execCommand("copy")) fait(); } catch (e) { /* le lien reste sélectionné */ } });
  });
  $("partager-url").addEventListener("focus", function () { this.select(); });
  $("partager-natif").addEventListener("click", function () {
    var m = L.message(etat.r.page, etat.url);
    navigator.share({ title: m.sujet, text: m.texte.replace(etat.url, "").trim(), url: etat.url }).catch(function () {});
  });
  $("partager-sensible-case").addEventListener("change", function () {
    var cle = etat.r && etat.r.sensible && etat.r.sensible.cle;
    if (cle) { etat.options[cle] = this.checked; rendre(); }
  });

  function ouvrir(vue) {
    etat.vue = vue || (O.lireRoute && O.lireRoute().vue);
    etat.options = {};
    $("partager-qr").hidden = true; $("partager-qr-bouton").setAttribute("aria-expanded", "false");
    $("partager-qr-image").textContent = "";
    if (!MODULES[etat.vue]) return;
    var mod = window[MODULES[etat.vue]], r = mod && mod.pourPartage && mod.pourPartage({});
    if (!r || r.erreur) { O.toast((r && r.erreur) || "Rien à partager sur cette page.", { type: "erreur" }); return; }
    $("partager-chiffre").textContent = ""; $("partager-chiffre-lib").textContent = ""; $("partager-second").textContent = "";
    rendre();
    dlg.showModal();
    /* Aperçu calculé par la page publique elle-même : chargé à la première ouverture. */
    charger("/commun/pages-calcul.js", "PagesCalcul").then(function () { if (etat.r) apercu(etat.r); }, function () { $("partager-second").textContent = "Aperçu indisponible hors connexion."; $("partager-second").hidden = false; });
  }

  $("partager-sim").addEventListener("click", function () { ouvrir(); });
  window.OrbitePartage = { ouvrir: ouvrir };
})();
