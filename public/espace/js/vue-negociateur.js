/*
 * Orbite — fenêtre « Préparer ma négociation » (maquette validée le 12 oct. 2026 : entrées partout, note PDF
 * « pour moi » ou « pour mon responsable », onglet « Offre reçue »). Calculs : negociateur-calcul.js ; PDF :
 * negociateur-pdf.js et jsPDF, chargés à la demande. Entrées : module Salaire (bouton), Ma progression › Carrière,
 * palette (Ctrl K), lien #salaire?nego=1. Réussites gardées sur l'appareil (localStorage, sous try/catch), jamais envoyées.
 * CSP stricte : positions et largeurs posées par CSSOM, aucun attribut style.
 */
(function () {
  "use strict";
  var O = window.Orbite, N = window.Negociateur, doc = document;
  if (!O || !N) return;
  var $ = O.$, F = O.F, dlg = $("dlg-nego");
  if (!dlg) return;
  var CLE = "orbite_nego_reussites";
  var UNITES = { pct: "% net", net: "DT net / mois", brut: "DT brut / mois" };
  var LIBS = { pct: "Hausse du net visée", net: "Net mensuel visé", brut: "Brut mensuel visé" };
  var dernier = null;

  function dt(v) { return F.dt0(v) + " DT"; }
  function signe(v, f) { return (v >= 0 ? "+" : "−") + f(Math.abs(v)); }
  function lire(id) { var v = F.lire($(id).value); return v.valide && !v.vide ? v.valeur : null; }
  function choisi(nom) { var r = dlg.querySelector('input[name="' + nom + '"]:checked'); return r ? r.value : null; }
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function gras(parent, morceaux) {
    parent.textContent = "";
    morceaux.forEach(function (m) { parent.appendChild(typeof m === "string" ? doc.createTextNode(m) : cree("b", "chiffre", m.b)); });
  }
  function reussites() { return $("ng-reussites").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); }
  function garderReussites() { try { localStorage.setItem(CLE, $("ng-reussites").value.slice(0, 720)); } catch (e) {} }
  function reussitesGardees() { try { return localStorage.getItem(CLE) || ""; } catch (e) { return ""; } }

  function mode() { return choisi("ng-mode") || "hausse"; }
  function montrerMode() {
    var m = mode();
    dlg.querySelectorAll("[data-ng]").forEach(function (e) { e.hidden = e.getAttribute("data-ng") !== m; });
  }

  /* ---------- Profil repris ---------- */
  function situation(p, r) {
    var dl = $("ng-situation"), a = r.arguments;
    dl.textContent = "";
    function ligne(t, v, sous) {
      var d = cree("div"), dd = cree("dd", "chiffre", v);
      d.appendChild(cree("dt", null, t));
      if (sous) { dd.appendChild(cree("small", null, sous)); }
      d.appendChild(dd); dl.appendChild(d);
    }
    ligne("Salaire actuel", dt(r.actuel.brut) + " brut", dt(r.actuel.net) + " net");
    ligne("Salaires par an", String(r.actuel.salaires));
    var fam = p.chefDeFamille ? "Chef de famille" + (p.enfants ? ", " + p.enfants + (p.enfants > 1 ? " enfants" : " enfant") : "") : "Sans charge de famille";
    ligne("Situation", fam);
    ligne(a.type === "hausse" ? "Dernière hausse" : "Embauche", a.depuisLib ? a.depuisLib.charAt(0).toUpperCase() + a.depuisLib.slice(1) : "Non renseignée");
    $("ng-profil").hidden = !!a.anciennete && a.type === "hausse";
    $("ng-profil").textContent = a.anciennete ? "Ajouter une hausse passée dans mon profil" : "Ajouter ma date d'embauche dans mon profil";
  }

  /* ---------- Objectif ---------- */
  function majCurseur(r) {
    var v = choisi("ng-vise"), c = $("ng-curseur"), a = r.actuel;
    var b = v === "pct" ? [1, 50, 1] : v === "net" ? [Math.ceil(a.net / 10) * 10 + 10, Math.round(a.net * 1.5 / 10) * 10, 10] : [Math.ceil(a.brut / 50) * 50 + 50, Math.round(a.brut * 1.6 / 50) * 50, 50];
    c.min = b[0]; c.max = b[1]; c.step = b[2];
    $("ng-unite").textContent = UNITES[v];
    $("ng-objectif-lib").textContent = LIBS[v];
  }
  function objectif() { return { mode: choisi("ng-vise"), valeur: lire("ng-objectif") || 0 }; }
  function options() { var m = lire("ng-marge"); return { marge: m == null ? 0 : m / 100, reussites: reussites() }; }

  /* ---------- Rendu : augmentation ---------- */
  function position(el, v, min, max) { el.style.left = Math.max(0, Math.min(100, (v - min) / (max - min) * 100)) + "%"; }
  function rendre() {
    var p = O.profil(); if (!p) return;
    var r = N.preparer(p, objectif(), options(), new Date());
    if (!r) return;
    dernier = r;
    situation(p, r);
    var err = $("ng-erreur");
    err.hidden = !r.erreur; err.textContent = r.erreur || "";
    dlg.classList.toggle("nego--erreur", !!r.erreur);
    $("ng-telecharger").disabled = !!r.erreur;
    $("ng-obtenu").disabled = !!r.erreur;
    if (r.erreur) { $("ng-objectif-aide").textContent = ""; return; }
    var v = choisi("ng-vise"), h = r.hausse, a = r.arguments;
    $("ng-objectif-aide").textContent = v === "pct" ? "Net visé : " + dt(r.cible.net) + " par mois." : v === "net" ? "Soit " + signe(h.netPct, function (x) { return F.pct(x); }) + " net." : "Soit " + dt(r.cible.net) + " net par mois.";

    $("ng-cible").textContent = F.dt0(r.cible.brut);
    gras($("ng-ligne"), [{ b: signe(h.brut, dt) }, " brut (" + signe(h.pct, function (x) { return F.pct(x); }) + ") pour ", { b: signe(h.net, dt) }, " net par mois, soit ", { b: dt(r.cible.net) },
      " net. Votre employeur paierait ", { b: signe(h.cout, dt) }, " par mois en moyenne, charges comprises."]);

    var sp = $("ng-sous-plancher");
    sp.hidden = !r.cibleSousPlancher;
    if (r.cibleSousPlancher) sp.textContent = "Cette cible reste sous votre plancher : elle ne rattrape pas la hausse des prix depuis " + (a.depuisLib || "un an") + ". Visez au moins " + dt(r.plancher.brut) + " brut.";

    var g = r.garde, parts = [["net", "Net pour vous"], ["cnss", "CNSS"], ["irpp", "IRPP"], ["css", "CSS"]];
    $("ng-garde-lib").textContent = "Sur 100 DT de hausse brute, vous gardez " + Math.round(g.net * 100) + " DT net";
    parts.forEach(function (x) { $("ng-g-" + x[0]).style.flexBasis = Math.max(0, g[x[0]] * 100) + "%"; });
    var leg = $("ng-g-leg"); leg.textContent = "";
    parts.forEach(function (x) { var n = Math.round(g[x[0]] * 100); if (n > 0) leg.appendChild(cree("span", "ng-l-" + x[0], x[1] + " " + n)); });

    /* Échelle des paliers. */
    var min = r.actuel.brut, max = Math.max(r.ancre.brut, r.plancher.brut, r.cible.brut) * 1.02 || min + 1;
    position($("ng-j-actuel"), r.actuel.brut, min, max);
    position($("ng-j-plancher"), r.plancher.brut, min, max);
    position($("ng-j-cible"), r.cible.brut, min, max);
    position($("ng-j-ancre"), r.ancre.brut, min, max);
    $("ng-j-plancher").hidden = r.plancher.brut <= r.actuel.brut + 0.5;
    $("ng-j-ancre").hidden = r.ancre.brut <= r.cible.brut + 0.5;
    /* Étiquettes : vers l'intérieur aux deux bouts ; si deux jalons sont trop proches, la moins utile se tait. */
    var PRIO = { cible: 4, ancre: 3, plancher: 2, actuel: 1 }, larg = $("ng-j-actuel").parentNode.clientWidth || 600;
    var jal = ["actuel", "plancher", "cible", "ancre"].map(function (k) { return { k: k, el: $("ng-j-" + k), v: r[k === "actuel" ? "actuel" : k].brut }; })
      .filter(function (j) { return !j.el.hidden; }).sort(function (x, y) { return x.v - y.v; });
    jal.forEach(function (j, i) {
      j.el.classList.toggle("nego__jalon--debut", i === 0);
      j.el.classList.toggle("nego__jalon--fin", i === jal.length - 1 && i > 0);
      j.el.classList.remove("nego__jalon--muet");
    });
    for (var i = 1; i < jal.length; i++) {
      var ecart = (jal[i].v - jal[i - 1].v) / (max - min) * larg;
      if (ecart < 74) { var muet = PRIO[jal[i].k] < PRIO[jal[i - 1].k] ? jal[i] : jal[i - 1]; muet.el.classList.add("nego__jalon--muet"); }
    }
    $("ng-plancher").textContent = dt(r.plancher.brut);
    $("ng-plancher-d").textContent = a.prix > 0.005 ? "Retrouver votre pouvoir d'achat de " + a.anneeDepuis + " : " + dt(r.plancher.net) + " net. En dessous, vous perdez." : "Les prix n'ont presque pas bougé depuis votre dernière hausse : votre salaire actuel.";
    $("ng-cible2").textContent = dt(r.cible.brut);
    $("ng-cible-d").textContent = dt(r.cible.net) + " net par mois.";
    $("ng-ancre").textContent = dt(r.ancre.brut);
    $("ng-ancre-d").textContent = r.marge > 0 ? dt(r.ancre.net) + " net. Cible + " + F.pct(r.marge, 0) + ", arrondi aux 50 DT." : "Sans marge : vous annoncez votre cible.";

    /* Alternatives. */
    var al = r.alternatives;
    $("ng-prime").textContent = dt(al.prime);
    $("ng-plus-carte").hidden = !al.salaireDePlus;
    if (al.salaireDePlus) {
      $("ng-plus-t").textContent = al.salaireDePlus.rang === 13 ? "Un 13ᵉ mois" : "Un " + al.salaireDePlus.rang + "ᵉ salaire par an";
      $("ng-plus").textContent = signe(al.salaireDePlus.gain, dt) + " net";
      $("ng-plus-d").textContent = "par an, soit " + Math.round(al.salaireDePlus.part * 100) + " % de votre demande.";
    }
    $("ng-deux").textContent = "+" + dt(al.deuxTemps.moitie) + " puis +" + dt(al.deuxTemps.moitie);
    $("ng-deux-d").textContent = "brut, maintenant puis dans 6 mois : " + Math.round(al.deuxTemps.part * 100) + " % du gain la première année, 100 % ensuite.";

    /* Arguments. */
    var ul = $("ng-arguments"); ul.textContent = "";
    function argument(cls, morceaux, source) {
      var li = cree("li", "nego__arg nego__arg--" + cls), p2 = cree("p");
      gras(p2, morceaux);
      if (source) p2.appendChild(cree("small", null, source));
      li.appendChild(p2); ul.appendChild(li);
    }
    if (a.prix > 0.005) argument("prix", ["Les prix ont monté de ", { b: F.pct(a.prix) }, (a.type === "hausse" ? " depuis votre dernière hausse (" + a.depuisLib + ")" : a.type === "embauche" ? " depuis votre arrivée (" + a.depuisLib + ")" : " sur la dernière année") +
      " : à salaire égal, votre pouvoir d'achat a baissé de ", { b: F.pct(-a.pouvoirAchat) }, "."], "Moyennes annuelles INS, les mêmes que dans Ma progression" + (a.provisoire ? " (" + new Date().getFullYear() + " provisoire)." : "."));
    if (a.anciennete) argument("anciennete", [{ b: a.ancienneteLib }, " dans l'entreprise" + (a.sansHausse ? ", dont " : "."), a.sansHausse ? { b: a.sansHausseLib } : "", a.sansHausse ? " sans augmentation." : ""], "D'après vos dates d'embauche et de dernière hausse.");
    argument("cout", ["Pour l'entreprise, votre cible coûte ", { b: signe(h.cout, dt) }, " par mois, soit ", { b: signe(h.coutPct, function (x) { return F.pct(x); }) }, " de ce que vous lui coûtez aujourd'hui."], "Cotisations patronales comprises, selon le moteur de paie d'Orbite.");
    if (r.reussites.length) argument("reussites", [{ b: "Vos réussites" }, " : " + r.reussites.map(function (s) { return s.replace(/[.;]+$/, ""); }).join(" ; ") + "."], "Ce que vous avez écrit à gauche.");
    else argument("reussites", [{ b: "Vos réussites" }, " : ajoutez-en une ou deux à gauche. Elles pèsent souvent plus que les chiffres."]);

    $("ng-phrase").textContent = "« " + r.phrase + " »";
    majVersion();
  }

  function majVersion() {
    $("ng-version-aide").textContent = choisi("ng-version") === "responsable"
      ? "Une demande propre à remettre : salaire actuel, salaire demandé (le chiffre annoncé), vos arguments et vos réussites. Ni plancher, ni marge, ni alternatives."
      : "Votre aide-mémoire d'une page : plancher, cible, ancre, part gardée, arguments, alternatives et phrase prête. À ne pas remettre.";
  }

  /* ---------- Rendu : offre reçue ---------- */
  function rendreOffre() {
    var p = O.profil(); if (!p) return;
    var o = N.offre(p, { brut: lire("ng-offre-brut") || 0, salaires: lire("ng-offre-salaires") || 12 }, new Date());
    if (!o) return;
    var err = $("ng-offre-erreur");
    err.hidden = !o.erreur; err.textContent = o.erreur || "";
    dlg.classList.toggle("nego--erreur", !!o.erreur);
    if (o.erreur) return;
    var a = o.actuel;
    $("ng-o-net").textContent = dt(o.propose.net) + " net";
    gras($("ng-o-net-d"), [{ b: signe(o.ecartMois, dt) }, " par rapport à aujourd'hui (" + dt(a.net) + ")."]);
    $("ng-o-net-d").classList.toggle("nego--baisse", o.ecartMois < 0);
    $("ng-o-an").textContent = dt(o.propose.netAnnuel) + " net";
    gras($("ng-o-an-d"), [{ b: signe(o.ecartAnnuel, dt) + " (" + signe(o.ecartAnnuelPct, function (x) { return F.pct(x); }) + ")" }, " sur l'année, " + o.salaires + " salaires."]);
    $("ng-o-an-d").classList.toggle("nego--baisse", o.ecartAnnuel < 0);
    $("ng-o-sur").textContent = o.atteint ? "L'offre atteint déjà +" + F.pct(o.visePct, 0) + " net sur l'année" : "Pour gagner " + F.pct(o.visePct, 0) + " net de plus qu'aujourd'hui sur l'année";
    $("ng-o-contre").textContent = F.dt0(o.contre.brut);
    $("ng-o-contre-lib").textContent = o.atteint ? "DT brut par mois proposés : vous pouvez accepter ou viser plus" : "DT brut par mois à contre-proposer";
    gras($("ng-o-contre-d"), o.atteint ? ["Sur " + o.salaires + " salaires : ", { b: dt(o.contre.netAnnuel) }, " net par an, pour un objectif de " + dt(o.vise) + "."]
      : ["Sur " + o.salaires + " salaires : ", { b: dt(o.contre.netAnnuel) }, " net par an, soit ", { b: signe(o.ecartContre, dt) }, " brut par mois de plus que l'offre."]);
  }

  function tout() { montrerMode(); if (mode() === "offre") rendreOffre(); else rendre(); }

  /* ---------- Ouverture ---------- */
  function ouvrir(o) {
    var p = O.profil();
    if (!p || O.profilVierge() || p.activite === "retraite") return;
    o = o || {};
    if (!dlg.open) {
      var m = dlg.querySelector('input[name="ng-mode"][value="' + (o.mode === "offre" ? "offre" : "hausse") + '"]'); if (m) m.checked = true;
      if (!$("ng-objectif").value) {
        var v = dlg.querySelector('input[name="ng-vise"][value="pct"]'); v.checked = true;
        $("ng-objectif").value = "10"; $("ng-marge").value = "5";
        $("ng-reussites").value = reussitesGardees();
      }
      if (!$("ng-offre-salaires").value) $("ng-offre-salaires").value = String(Math.max(12, Math.min(16, p.nombreSalaires || 12)));
      if (!$("ng-offre-brut").value) {
        var b = N.preparer(p, { mode: "pct", valeur: 10 }, {}, new Date());
        if (b && b.actuel) $("ng-offre-brut").value = F.saisie(Math.round(b.actuel.brut * 1.15 / 50) * 50);
      }
    }
    var r0 = N.preparer(p, { mode: "pct", valeur: 10 }, {}, new Date());
    majCurseur(r0);
    $("ng-curseur").value = lire("ng-objectif") || 0;
    tout();
    if (!dlg.open) { dlg.returnValue = ""; dlg.showModal(); }
    O.placerPastilles(dlg);
  }

  /* ---------- Saisie ---------- */
  dlg.addEventListener("change", function (e) {
    var n = e.target.name;
    if (n === "ng-vise") {
      /* Même cible exprimée dans la nouvelle unité. */
      var r = dernier, v = e.target.value;
      if (r && r.cible) $("ng-objectif").value = v === "pct" ? String(Math.round(r.hausse.netPct * 100)) : F.saisie(v === "net" ? Math.round(r.cible.net / 10) * 10 : Math.round(r.cible.brut / 50) * 50);
      majCurseur(r || N.preparer(O.profil(), { mode: "pct", valeur: 10 }, {}, new Date()));
      $("ng-curseur").value = lire("ng-objectif") || 0;
    }
    if (n === "ng-version") { majVersion(); return; }
    if (n === "ng-mode" || n === "ng-vise") { tout(); O.placerPastilles(dlg); }
  });
  dlg.addEventListener("input", function (e) {
    var id = e.target.id;
    if (e.target.type === "radio") return;
    if (id === "ng-curseur") $("ng-objectif").value = F.saisie(+e.target.value);
    else if (id === "ng-objectif") $("ng-curseur").value = lire("ng-objectif") || 0;
    if (id === "ng-reussites") garderReussites();
    tout();
  });
  /* Montants remis en forme en quittant le champ. */
  dlg.addEventListener("focusout", function (e) {
    if (["ng-objectif", "ng-offre-brut"].indexOf(e.target.id) === -1) return;
    var v = lire(e.target.id); if (v != null) e.target.value = F.saisie(v);
  });

  $("ng-copier").addEventListener("click", function () {
    var t = $("ng-phrase").textContent.replace(/^« | »$/g, ""), lib = $("ng-copier-lib");
    function fini() { lib.textContent = "Copiée"; setTimeout(function () { lib.textContent = "Copier"; }, 1600); }
    function selection() { var r = doc.createRange(); r.selectNodeContents($("ng-phrase")); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    try { navigator.clipboard.writeText(t).then(fini, selection); } catch (er) { selection(); }
  });

  /* « J'ai obtenu… » : la fenêtre du salaire, préremplie avec la cible dans l'unité du profil. */
  $("ng-obtenu").addEventListener("click", function () {
    var r = dernier, p = O.profil();
    if (!r || r.erreur || !p) return;
    var net = p.sens === "net", an = p.periode === "annuel";
    var montant = net ? (an ? r.cible.netAnnuel : r.cible.net) : (an ? r.cible.brut * r.cible.salaires : r.cible.brut);
    dlg.close("obtenu");
    O.mettreAJourSalaire({ montant: Math.round(montant * 1000) / 1000, sens: p.sens, periode: p.periode });
  });

  /* PDF : jsPDF (copie locale) et la mise en page, chargés à la première demande. */
  var promesse = null;
  function charger(src) { return new Promise(function (ok, ko) { var s = doc.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; doc.head.appendChild(s); }); }
  function outils() {
    if (window.jspdf && window.NegociateurPDF) return Promise.resolve();
    if (!promesse) promesse = (window.jspdf ? Promise.resolve() : charger("/espace/vendor/jspdf.umd.min.js")).then(function () { return window.NegociateurPDF ? null : charger("/espace/js/negociateur-pdf.js"); });
    return promesse;
  }
  var MOIS = window.OrbiteCalcul.MOIS;
  $("form-nego").addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok") return;
    ev.preventDefault();
    var r = dernier, p = O.profil();
    if (!r || r.erreur) return;
    var version = choisi("ng-version") || "moi", bouton = $("ng-telecharger"), m = new Date();
    bouton.disabled = true;
    outils().then(function () {
      var blob = window.NegociateurPDF.generer({
        r: r, version: version, annee: m.getFullYear(),
        nom: [p.prenom, p.nom].filter(Boolean).join(" "), poste: p.poste || "", employeur: p.employeur || "",
        dateTexte: m.getDate() + " " + MOIS[m.getMonth()] + " " + m.getFullYear()
      });
      var jour = m.getFullYear() + String(m.getMonth() + 1).padStart(2, "0") + String(m.getDate()).padStart(2, "0");
      O.telecharger((version === "responsable" ? "demande-de-revision-de-salaire-" : "ma-negociation-") + jour + ".pdf", blob);
      O.toast(version === "responsable" ? "Demande téléchargée. Elle n'a été envoyée à personne." : "Votre aide-mémoire est téléchargé. Gardez-le pour vous.");
    }).catch(function (e) {
      if (window.console) console.warn(e);
      promesse = null;
      O.toast("Le PDF n'a pas pu être créé. Vérifiez votre connexion puis réessayez.");
    }).then(function () { bouton.disabled = false; });
  });

  /* ---------- Entrées ---------- */
  function visible() { var p = O.profil(); return !!p && !O.profilVierge() && p.activite !== "retraite" && p.montant > 0; }
  function majEntrees() {
    var ok = visible();
    ["nego-ouvrir", "pg-nego"].forEach(function (id) { var b = $(id); if (b) b.hidden = !ok; });
    var c = $("pg-nego-carte"); if (c) c.hidden = !ok;
  }
  ["nego-ouvrir", "pg-nego"].forEach(function (id) { var b = $(id); if (b) b.addEventListener("click", function () { ouvrir(); }); });
  O.surProfil(majEntrees);
  doc.addEventListener("orbite:pret", majEntrees);
  /* Lien direct : #salaire?nego=1 (et &mode=offre). */
  function depuisRoute() {
    var r = O.lireRoute && O.lireRoute();
    if (r && r.vue === "salaire" && r.params && r.params.get("nego") === "1" && O.pret) {
      var md = r.params.get("mode");
      history.replaceState(null, "", "#salaire");
      ouvrir({ mode: md });
    }
  }
  window.addEventListener("hashchange", depuisRoute);
  doc.addEventListener("orbite:pret", depuisRoute);
  if (O.pret) { majEntrees(); depuisRoute(); }
  O.ouvrirNegociation = ouvrir;
  O.negociationPossible = visible;
})();
