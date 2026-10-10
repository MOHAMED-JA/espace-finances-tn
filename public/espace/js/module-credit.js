/*
 * Orbite — module Crédit (vue #credit de l'application).
 * Interface du moteur public/moteurs/credit/credit.js (window.MoteurCredit) :
 * l'essentiel (scénario, résultat, éligibilité, graphiques, tableau, scénarios A/B/C)
 * reste visible ; les outils avancés se déplient et ne sont construits qu'à l'ouverture.
 * Aucun style en ligne (CSP) : les valeurs dynamiques passent par style.setProperty.
 * Graphiques dessinés en SVG, sans bibliothèque externe.
 */
(function () {
  "use strict";

  var MC = window.MoteurCredit, OC = window.OrbiteCalcul, doc = document;
  var racine = doc.getElementById("credit-racine");
  var vue = doc.getElementById("vue-credit");
  if (!MC || !racine || !vue) return;
  function Orb() { return window.Orbite || null; }
  var mouvementReduit = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* ===================================================================
     Formats
     =================================================================== */
  function nbsp(s) { return String(s).replace(/[  ]/g, " "); }
  var nfCache = {};
  function nf(max, min) {
    var k = max + ":" + min;
    return nfCache[k] || (nfCache[k] = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  var F = (Orb() && Orb().F) || {
    dt3: function (v) { return nbsp(nf(3, 3).format(Math.round(v * 1000) / 1000)); },
    dt0: function (v) { return nbsp(nf(0, 0).format(Math.round(v))); },
    saisie: function (v) { return v ? nbsp(nf(3, 0).format(v)) : ""; },
    lire: function (t) {
      t = String(t == null ? "" : t).replace(/[\s  ]/g, "").replace(",", ".");
      if (t === "") return { vide: true, valide: true, valeur: 0 };
      var n = Number(t);
      return !isFinite(n) || n < 0 || n > 1e9 ? { vide: false, valide: false, valeur: 0 } : { vide: false, valide: true, valeur: n };
    }
  };
  function dt(v) { return isFinite(v) ? F.dt3(v) + " DT" : "—"; }
  function dt0(v) { return isFinite(v) ? F.dt0(v) + " DT" : "—"; }
  function nombre(v, d) { return nbsp(nf(d === undefined ? 3 : d, 0).format(v)); }
  function pc(v, d) { return isFinite(v) ? nombre(v, d === undefined ? 2 : d) + " %" : "—"; }
  function saisieNb(v) { return v === 0 ? "0" : F.saisie(v); }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return nombre(v / 1e6, 1) + " M";
    if (a >= 1e3) return nombre(v / 1e3, a >= 1e4 ? 0 : 1) + " k";
    return nombre(v, 0);
  }
  function signe(v, fn) { return (v > 0 ? "+" : v < 0 ? "−" : "") + (fn || dt)(Math.abs(v)); }
  function pluriel(n, mot, motPl) { return n + " " + (n > 1 ? (motPl || mot + "s") : mot); }
  function dureeLib(m) {
    m = Math.round(m);
    var a = Math.floor(m / 12), r = m % 12;
    if (!a) return pluriel(r, "mois", "mois");
    return pluriel(a, "an") + (r ? " et " + r + " mois" : "");
  }
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function moisAn(d) { return d ? MOIS[d.getMonth()] + " " + d.getFullYear() : "—"; }
  function moisAnC(d) { return d ? MOIS_C[d.getMonth()] + " " + d.getFullYear() : "—"; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function premierMoisSuivant() { var d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ico(nom, cls) { return '<svg class="' + (cls || "ico") + '" aria-hidden="true"><use href="/orbite/icones.svg#' + nom + '"/></svg>'; }
  function $(id) { return doc.getElementById(id); }
  function $$(sel, el) { return Array.prototype.slice.call((el || racine).querySelectorAll(sel)); }
  function arr(v) { return MC.arrondi(v); }
  function borne(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function anti(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function toast(t, o) { var O = Orb(); if (O) O.toast(t, o); }
  function modifie() { var O = Orb(); if (O && O.modifie) O.modifie("credit"); }
  var signalerModif = anti(modifie, 400);

  /* Lecture d'un nombre saisi « à la française » (signe accepté si demandé). */
  function lireNombre(texte, signeOk) {
    var t = String(texte == null ? "" : texte).trim(), neg = false;
    if (signeOk && /^[-−]/.test(t)) { neg = true; t = t.replace(/^[-−]\s*/, ""); }
    var r = F.lire(t);
    if (r.valide && neg) r.valeur = -r.valeur;
    return r;
  }

  /* ===================================================================
     Types, préréglages et scénarios
     =================================================================== */
  var TYPES = {
    immo: { nom: "Immobilier", long: "Crédit immobilier", icone: "maison" },
    auto: { nom: "Auto", long: "Crédit auto", icone: "voiture" },
    conso: { nom: "Consommation", long: "Crédit consommation", icone: "salaire" },
    libre: { nom: "Libre", long: "Crédit", icone: "crayon" }
  };
  var TMM_REF = MC.DEFAUTS.tmm;
  var AGE_MAX = MC.DEFAUTS.ageMax;
  var LETTRES = ["A", "B", "C"];

  /* Taux personnel du profil pour ce type (taux choisi pour l'immobilier, ou taux d'un crédit en cours du même type) :
     il remplace le taux du marché par défaut, en taux fixe. Rien si le profil ne donne que le taux du marché. */
  function tauxProfil(type) {
    try {
      var O = Orb(), sy = O && O.synthese ? O.synthese() : null;
      var t = sy && OC && OC.tauxNouveaux ? OC.tauxNouveaux(sy.profil)[type] : null;
      return t && t.source !== "marche" && t.tauxPct >= 0 ? t.tauxPct : null;
    } catch (e) { return null; }
  }
  function scenarioVierge(type, capital) {
    var pr = MC.appliquerPreset(type) || { mois: 120, taux: 10, tmm: null };
    var tp = tauxProfil(type);
    if (tp !== null) pr = { mois: pr.mois, taux: tp, tmm: null };
    return {
      type: type, capital: capital, mois: pr.mois,
      mode: pr.tmm ? "tmm" : "fixe", taux: pr.taux, tmm: pr.tmm ? pr.tmm.tmm : TMM_REF, marge: pr.tmm ? pr.tmm.marge : 3,
      dateDebut: premierMoisSuivant(), periodicite: 1, amort: "constant",
      apport: { on: false, prix: 0, apport: 0 },
      variation: { on: false, delta: 1, des: 13 },
      differe: { on: false, mois: 6, type: "partiel" },
      assurance: { on: false, taux: 0.4, base: "crd" },
      frais: { on: false, dossierPct: 1, dossierFixe: 0, garantie: 0, autres: 0 },
      ras: [],
      versement: { on: false, montant: 1000, frequence: "annee", des: 12 },
      indemnite: 0, raMode: "duree", reduction: false
    };
  }
  function copie(o) { return JSON.parse(JSON.stringify(o)); }

  /* Applique un préréglage de type (durée et taux) sans toucher au capital ni aux options. */
  function appliquerType(sc, type) {
    sc.type = type;
    var pr = MC.appliquerPreset(type);
    if (!pr) return;
    sc.mois = Math.max(sc.periodicite, Math.round(pr.mois / sc.periodicite) * sc.periodicite);
    var tp = tauxProfil(type);
    if (tp !== null) { sc.mode = "fixe"; sc.taux = tp; }
    else if (pr.tmm) { sc.mode = "tmm"; sc.tmm = pr.tmm.tmm; sc.marge = pr.tmm.marge; sc.taux = pr.taux; }
    else { sc.mode = "fixe"; sc.taux = pr.taux; }
  }
  function tauxApplique(sc) { return sc.mode === "tmm" ? MC.tauxTmm(sc.tmm, sc.marge) : sc.taux; }
  function nbEcheances(sc) { return Math.round(sc.mois / sc.periodicite); }

  var S = {
    scenarios: [scenarioVierge("immo", 150000)],
    actif: 0,
    emp: { age: 35, net: 0, brut: 0, charges: 0, quotiteNet: 0.4, quotiteBrut: 0.4, base: "net", banque: "", annuel: true, touche: false },
    profilCharge: false,
    vueTableau: "mensuel",
    vueGraphe: "crd",
    dernier: null,
    precedentM: null,
    routeAppliquee: "",
    cible: null
  };
  function sc0() { return S.scenarios[S.actif]; }

  /* Entrée du moteur à partir d'un scénario (les blocs désactivés ou incomplets sont ignorés). */
  function entree(sc, avecEmprunteur) {
    var p = sc.periodicite || 1, N = Math.round(sc.mois / p);
    var e = {
      type: sc.type, capital: sc.capital, mois: sc.mois, taux: tauxApplique(sc), dateDebut: sc.dateDebut || "",
      periodicite: p, amort: sc.amort, differe: null, tmm: null, variation: null, assurance: null, frais: null, apport: null,
      ras: [], versement: null, indemnite: sc.indemnite || 0, raMode: sc.raMode,
      /* Règle des 8 % : réservée aux crédits à taux fixe. */
      reduction: !!sc.reduction && sc.mode !== "tmm"
    };
    if (sc.differe.on && sc.differe.mois > 0 && sc.differe.mois < sc.mois && sc.differe.mois % p === 0) e.differe = { mois: sc.differe.mois, type: sc.differe.type };
    if (sc.mode === "tmm") {
      e.tmm = { tmm: sc.tmm, marge: sc.marge };
      var v = sc.variation;
      if (v.on && v.delta !== 0 && Math.abs(v.delta) <= 20 && v.des >= 2 && v.des <= N) e.variation = { delta: v.delta, des: v.des };
    }
    if (sc.assurance.on && sc.assurance.taux > 0 && sc.assurance.taux <= 10) e.assurance = { taux: sc.assurance.taux, base: sc.assurance.base };
    var f = sc.frais;
    if (f.on && (f.dossierPct || 0) + (f.dossierFixe || 0) + (f.garantie || 0) + (f.autres || 0) > 0 && f.dossierPct <= 10)
      e.frais = { dossierPct: f.dossierPct || 0, dossierFixe: f.dossierFixe || 0, garantie: f.garantie || 0, autres: f.autres || 0 };
    if (sc.apport.on && sc.apport.prix > 0 && sc.apport.apport >= 0 && sc.apport.apport < sc.apport.prix) e.apport = { prix: sc.apport.prix, apport: sc.apport.apport };
    e.ras = sc.ras.filter(function (x) { return x.apres >= 1 && x.apres < N && (x.total || x.montant > 0); }).slice(0, 10)
      .map(function (x) { return { apres: x.apres, total: !!x.total, montant: x.total ? null : x.montant }; });
    var vs = sc.versement;
    if (vs.on && vs.montant > 0 && vs.des >= 1 && vs.des < N) e.versement = { montant: vs.montant, frequence: vs.frequence, des: vs.des };
    if (avecEmprunteur && S.emp.net > 0) e.emprunteur = { age: S.emp.age, revenus: S.emp.net, charges: S.emp.charges };
    return e;
  }
  function valide(sc) {
    return sc.capital > 0 && sc.capital <= 1e8 && sc.mois >= 1 && sc.mois <= 300 && sc.mois % sc.periodicite === 0 && isFinite(tauxApplique(sc)) && tauxApplique(sc) >= 0 && tauxApplique(sc) <= 100;
  }

  /* Scénario à partir d'un lien décodé (decoderLien). */
  function depuisLien(v) {
    var sc = scenarioVierge(v.type && TYPES[v.type] ? v.type : "libre", v.capital);
    sc.type = v.type || "libre";
    sc.mois = v.mois; sc.periodicite = v.periodicite || 1; sc.amort = v.amort || "constant";
    sc.dateDebut = v.dateDebut || "";
    if (v.tmm) { sc.mode = "tmm"; sc.tmm = v.tmm.tmm; sc.marge = v.tmm.marge; sc.taux = v.taux; }
    else { sc.mode = "fixe"; sc.taux = v.taux; }
    if (v.variation) sc.variation = { on: true, delta: v.variation.delta, des: v.variation.des };
    if (v.differe) sc.differe = { on: true, mois: v.differe.mois, type: v.differe.type };
    if (v.assurance) sc.assurance = { on: true, taux: v.assurance.taux, base: v.assurance.base };
    if (v.frais) sc.frais = { on: true, dossierPct: v.frais.dossierPct || 0, dossierFixe: v.frais.dossierFixe || 0, garantie: v.frais.garantie || 0, autres: v.frais.autres || 0 };
    if (v.apport) sc.apport = { on: true, prix: v.apport.prix, apport: v.apport.apport };
    sc.ras = (v.ras || []).map(function (x) { return { apres: x.apres, total: !!x.total, montant: x.total ? 0 : x.montant }; });
    if (v.versement) sc.versement = { on: true, montant: v.versement.montant, frequence: v.versement.frequence, des: v.versement.des };
    sc.indemnite = v.indemnite || 0; sc.raMode = v.raMode || "duree"; sc.reduction = !!v.reduction;
    return sc;
  }

  /* ===================================================================
     Gabarits
     =================================================================== */
  var idAuto = 0;
  function uid(p) { idAuto += 1; return (p || "cr-u") + idAuto; }

  /* Champ texte numérique. o : {id, k (chemin dans le scénario), t (type), lib, unite, aide, grande, min, max, outil} */
  function champ(o) {
    var id = o.id || uid();
    var attrs = ' id="' + id + '"' + (o.k ? ' data-k="' + o.k + '"' : "") + (o.c ? ' data-c="' + o.c + '"' : "") +
      ' data-t="' + (o.t || "montant") + '"' + (o.min != null ? ' data-min="' + o.min + '"' : "") + (o.max != null ? ' data-max="' + o.max + '"' : "") +
      (o.t === "date" ? ' type="date"' : (o.t === "texte" ? ' type="text"' : ' type="text" inputmode="' + (o.t === "entier" ? "numeric" : "decimal") + '"')) +
      ' autocomplete="off"' + (o.valeur != null ? ' value="' + esc(o.valeur) + '"' : "") + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") +
      (o.aide ? ' aria-describedby="' + id + '-aide"' : "");
    return '<div class="champ' + (o.cls ? " " + o.cls : "") + '"' + (o.attr || "") + '><label for="' + id + '">' + o.lib + '</label>' +
      '<div class="saisie' + (o.grande ? " saisie--grande" : "") + '"><input' + attrs + '>' + (o.unite ? '<span class="saisie__unite">' + o.unite + '</span>' : "") + '</div>' +
      (o.aide ? '<p class="champ__aide" id="' + id + '-aide">' + o.aide + '</p>' : "") + '</div>';
  }
  function selection(o) {
    var id = o.id || uid();
    return '<div class="champ' + (o.cls ? " " + o.cls : "") + '"><label for="' + id + '">' + o.lib + '</label><div class="saisie"><select id="' + id + '"' +
      (o.k ? ' data-k="' + o.k + '"' : "") + (o.c ? ' data-c="' + o.c + '"' : "") + ' data-t="' + (o.t || "texte") + '">' +
      o.options.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join("") +
      '</select>' + ico("chevron", "saisie__chevron") + '</div></div>';
  }
  function bascule(o) {
    var nom = o.nom || uid("cr-b");
    return '<div class="bascule' + (o.cls ? " " + o.cls : "") + '" role="radiogroup" aria-label="' + esc(o.lib) + '"' + (o.id ? ' id="' + o.id + '"' : "") + '>' +
      o.options.map(function (x, i) {
        return '<label><input type="radio" name="' + nom + '" value="' + esc(x[0]) + '"' + (o.k ? ' data-k="' + o.k + '"' : "") + (o.c ? ' data-c="' + o.c + '"' : "") +
          ' data-t="texte"' + (i === 0 ? " checked" : "") + '><span>' + esc(x[1]) + '</span></label>';
      }).join("") + '<i class="bascule__pastille" aria-hidden="true"></i></div>';
  }
  function interrupteur(o) {
    return '<label class="interrupteur' + (o.cls ? " " + o.cls : "") + '"><span><strong>' + o.lib + '</strong>' + (o.aide ? '<small>' + o.aide + '</small>' : "") + '</span>' +
      '<input type="checkbox"' + (o.id ? ' id="' + o.id + '"' : "") + (o.k ? ' data-k="' + o.k + '"' : "") + (o.c ? ' data-c="' + o.c + '"' : "") + ' data-t="bool"' + (o.coche ? " checked" : "") + '>' +
      '<span class="interrupteur__piste" aria-hidden="true"></span></label>';
  }
  function stat(lib, val, note, cls) {
    return '<div class="cr-stat' + (cls ? " " + cls : "") + '"><span class="cr-stat__lib">' + lib + '</span><strong class="cr-stat__val chiffre">' + val + '</strong>' + (note ? '<small class="cr-stat__note">' + note + '</small>' : "") + '</div>';
  }
  function encart(type, icone, html) {
    return '<div class="encart cr-encart' + (type ? " encart--" + type : "") + '">' + ico(icone) + '<div>' + html + '</div></div>';
  }
  function option(cle, icone, titre, corps) {
    return '<details class="cr-option" data-option="' + cle + '" id="cr-opt-' + cle + '"><summary><span class="cr-option__icone">' + ico(icone) + '</span>' +
      '<span class="cr-option__texte">' + titre + '<small id="cr-opt-' + cle + '-etat"></small></span>' + ico("chevron", "chevron") + '</summary>' +
      '<div class="cr-option__corps">' + corps + '</div></details>';
  }

  function htmlEditeur() {
    var puces = ["immo", "auto", "conso", "libre"].map(function (t) {
      return '<label class="cr-puce"><input type="radio" name="cr-type" value="' + t + '" data-k="type" data-t="texte"><span>' + ico(TYPES[t].icone) + TYPES[t].nom + '</span></label>';
    }).join("");
    var opts =
      option("apport", "maison", "Prix du bien et apport",
        interrupteur({ lib: "Indiquer le prix et l'apport", aide: "Le montant emprunté devient prix − apport.", k: "apport.on" }) +
        '<div class="cr-grille-champs" data-si="apport.on">' +
          champ({ id: "cr-prix", k: "apport.prix", lib: "Prix du bien", unite: "DT", min: 1, max: 1e8 }) +
          champ({ id: "cr-apport", k: "apport.apport", lib: "Apport personnel", unite: "DT", min: 0, max: 1e8, aide: '<span id="cr-apport-pct">—</span>' }) +
        '</div>') +
      option("variation", "hausse", "Variation future du TMM",
        '<p class="cr-texte">Le taux suit le TMM : s\'il bouge, la banque recalcule l\'échéance. Testez une hausse (ou une baisse) à partir d\'une échéance donnée.</p>' +
        interrupteur({ lib: "Simuler une variation du TMM", k: "variation.on" }) +
        '<div class="cr-grille-champs" data-si="variation.on">' +
          champ({ id: "cr-var-delta", k: "variation.delta", t: "signe", lib: "Variation", unite: "points", min: -20, max: 20, aide: "Ex. 1 pour +1 point, −0,5 pour une baisse." }) +
          champ({ id: "cr-var-des", k: "variation.des", t: "entier", lib: "À partir de l'échéance n°", min: 2, aide: '<span id="cr-var-date">—</span>' }) +
        '</div>') +
      option("modalites", "horloge", "Périodicité et amortissement",
        '<div class="cr-grille-champs">' +
          selection({ id: "cr-periodicite", k: "periodicite", t: "entier", lib: "Échéances", options: MC.PERIODICITES.map(function (x) { return [x.p, x.nom]; }) }) +
          selection({ id: "cr-amort", k: "amort", lib: "Amortissement", options: [["constant", "Échéances constantes"], ["lineaire", "Amortissement constant"], ["infine", "In fine"]] }) +
        '</div><p class="cr-texte cr-texte--doux" id="cr-amort-aide"></p>') +
      option("differe", "horloge", "Différé de remboursement",
        interrupteur({ lib: "Commencer par un différé", aide: "Compris dans la durée totale.", k: "differe.on" }) +
        '<div class="cr-pile" data-si="differe.on">' +
          bascule({ lib: "Type de différé", k: "differe.type", options: [["partiel", "Partiel : intérêts seuls"], ["total", "Total : rien à payer"]] }) +
          champ({ id: "cr-diff-mois", k: "differe.mois", t: "entier", lib: "Durée du différé", unite: "mois", min: 1 }) +
          '<p class="cr-texte cr-texte--doux">Différé partiel : vous ne payez que les intérêts. Différé total : vous ne payez rien, mais les intérêts s\'ajoutent au capital.</p>' +
        '</div>') +
      option("assurance", "bouclier", "Assurance emprunteur",
        interrupteur({ lib: "Ajouter l'assurance décès-invalidité", k: "assurance.on" }) +
        '<div class="cr-pile" data-si="assurance.on">' +
          champ({ id: "cr-ass-taux", k: "assurance.taux", t: "taux", lib: "Taux annuel de l'assurance", unite: "%", min: 0.001, max: 10, aide: "Souvent entre 0,3 % et 0,6 % par an." }) +
          bascule({ lib: "Base de calcul de l'assurance", k: "assurance.base", options: [["initial", "Capital initial"], ["crd", "Capital restant dû"]] }) +
        '</div>') +
      option("frais", "outils", "Frais et TEG",
        interrupteur({ lib: "Ajouter les frais du crédit", aide: "Ils entrent dans le TEG (taux effectif global).", k: "frais.on" }) +
        '<div class="cr-grille-champs" data-si="frais.on">' +
          champ({ id: "cr-f-pct", k: "frais.dossierPct", t: "taux", lib: "Frais de dossier", unite: "%", min: 0, max: 10 }) +
          champ({ id: "cr-f-fixe", k: "frais.dossierFixe", lib: "Frais de dossier fixes", unite: "DT", min: 0, max: 1e6 }) +
          champ({ id: "cr-f-gar", k: "frais.garantie", lib: "Garantie (hypothèque…)", unite: "DT", min: 0, max: 1e6 }) +
          champ({ id: "cr-f-autres", k: "frais.autres", lib: "Autres frais", unite: "DT", min: 0, max: 1e6 }) +
        '</div><p class="cr-texte" id="cr-frais-total" data-si="frais.on"></p>') +
      option("ra", "fleche", "Remboursements anticipés",
        '<p class="cr-texte">Rembourser une partie du capital plus tôt fait baisser les intérêts. Ajoutez un versement ponctuel ou régulier.</p>' +
        '<ul class="cr-ras" id="cr-ras"></ul>' +
        '<button type="button" class="bouton bouton--petit" id="cr-ra-ajouter">' + ico("plus") + 'Ajouter un remboursement</button>' +
        '<div class="cr-sous-bloc">' +
          interrupteur({ lib: "Versements réguliers", aide: "Chaque échéance ou une fois par an.", k: "versement.on" }) +
          '<div class="cr-grille-champs" data-si="versement.on">' +
            champ({ id: "cr-vs-mt", k: "versement.montant", lib: "Montant", unite: "DT", min: 1, max: 1e8 }) +
            selection({ id: "cr-vs-freq", k: "versement.frequence", lib: "Fréquence", options: [["annee", "Une fois par an"], ["periode", "À chaque échéance"]] }) +
            champ({ id: "cr-vs-des", k: "versement.des", t: "entier", lib: "Dès l'échéance n°", min: 1 }) +
          '</div></div>' +
        '<div class="cr-grille-champs">' +
          champ({ id: "cr-indem", k: "indemnite", t: "taux", lib: "Indemnité de remboursement anticipé", unite: "%", min: 0, max: 20, aide: "Pénalité de la banque, en % du montant remboursé." }) +
        '</div>' +
        '<div class="champ"><span class="champ__lib" id="cr-ramode-lib">Après le remboursement</span>' +
          bascule({ lib: "Après le remboursement", k: "raMode", options: [["duree", "Réduire la durée"], ["mensualite", "Réduire l'échéance"]] }) + '</div>' +
        '<div id="cr-ra-bilan" class="cr-bilan" aria-live="polite"></div>') +
      option("reduction", "cible", "Réduction de taux (règle des 8 %)",
        '<p class="cr-texte"><strong>La règle :</strong> pour un crédit de plus de 7 ans (84 mois), si les intérêts payés sur les 3 dernières années dépassent 8 % du capital qu\'il vous reste à rembourser, la banque doit diviser votre taux par deux (loi n° 2024-41 du 2 août 2024). Le contrôle se fait dès la 37<sup>e</sup> mensualité, puis chaque mois tant que la condition n\'est pas remplie ; après une réduction, le contrôle suivant a lieu 3 ans plus tard.</p>' +
        interrupteur({ lib: "Appliquer la réduction dans la simulation", aide: "La banque l'accorde sur demande : pensez à la réclamer.", k: "reduction" }) +
        '<div id="cr-red-bilan" class="cr-bilan" aria-live="polite"></div>');

    return '<section class="panneau cr-editeur" aria-labelledby="cr-ed-titre">' +
      '<div class="cr-editeur__tete"><h2 id="cr-ed-titre" class="panneau__titre">Votre crédit</h2>' +
        '<div class="cr-scenarios"><div class="onglets cr-onglets-sc" role="tablist" aria-label="Scénarios" id="cr-onglets-sc"></div>' +
        '<button type="button" class="bouton bouton--petit cr-dupliquer" id="cr-dupliquer">' + ico("copier") + '<span>Dupliquer</span></button>' +
        '<button type="button" class="bouton bouton--petit cr-dupliquer cr-supprimer" id="cr-supprimer" hidden>' + ico("poubelle") + '<span>Supprimer</span></button></div>' +
      '</div>' +
      '<div class="cr-formulaire" id="cr-formulaire" role="tabpanel" aria-labelledby="cr-tab-0">' +
        '<fieldset class="cr-groupe"><legend class="champ__lib">Type de crédit</legend><div class="cr-puces" id="cr-types">' + puces + '</div></fieldset>' +
        champ({ id: "cr-capital", k: "capital", lib: "Montant emprunté", unite: "DT", grande: true, min: 100, max: 1e8, aide: '<span id="cr-capital-aide-txt">&nbsp;</span>' }) +
        '<div class="champ cr-duree"><div class="cr-duree__tete"><label for="cr-annees">Durée</label><output id="cr-duree-lib" for="cr-annees cr-mois-sup" class="chiffre"></output></div>' +
          '<input type="range" class="curseur" id="cr-annees" min="0" max="25" step="1" data-k="annees" data-t="entier" aria-describedby="cr-duree-lib">' +
          '<div class="cr-duree__pied"><span aria-hidden="true">0</span><span aria-hidden="true">5</span><span aria-hidden="true">10</span><span aria-hidden="true">15</span><span aria-hidden="true">20</span><span aria-hidden="true">25 ans</span></div>' +
          champ({ id: "cr-mois-sup", k: "moisSup", t: "entier", lib: "Mois en plus", unite: "mois", min: 0, max: 11, cls: "cr-champ-court" }) +
        '</div>' +
        '<fieldset class="cr-groupe"><legend class="champ__lib">Taux d\'intérêt</legend>' +
          bascule({ id: "cr-mode", lib: "Type de taux", k: "mode", options: [["fixe", "Taux fixe"], ["tmm", "TMM + marge"]] }) +
          '<div class="cr-taux" id="cr-taux">' +
            champ({ id: "cr-taux-fixe", k: "taux", t: "taux", lib: "Taux annuel", unite: "%", min: 0, max: 100, cls: "cr-si-fixe" }) +
            champ({ id: "cr-tmm", k: "tmm", t: "taux", lib: "TMM", unite: "%", min: 0, max: 30, cls: "cr-si-tmm", aide: "Taux moyen du marché monétaire." }) +
            champ({ id: "cr-marge", k: "marge", t: "signe", lib: "Marge de la banque", unite: "points", min: -20, max: 20, cls: "cr-si-tmm", aide: "Négative si votre taux est inférieur au TMM (taux préférentiel)." }) +
            '<p class="cr-taux__total cr-si-tmm" id="cr-taux-total"></p>' +
          '</div></fieldset>' +
        champ({ id: "cr-date", k: "dateDebut", t: "date", lib: "Première échéance", aide: "Le tableau et le calendrier sont datés à partir de ce mois." }) +
        '<div class="cr-options"><h3 class="cr-options__titre">Options du crédit</h3>' + opts + '</div>' +
      '</div>' +
    '</section>';
  }

  function htmlResultat() {
    return '<section class="cosmos cr-resultat" id="cr-resultat" aria-labelledby="cr-res-lib">' +
      '<div class="cr-resultat__tete"><h2 class="cr-resultat__lib" id="cr-res-lib">Mensualité</h2><span class="cr-resultat__scen" id="cr-res-scen">Scénario A</span></div>' +
      '<div class="cr-resultat__chiffre"><strong id="cr-res-m" class="chiffre">—</strong><span class="cr-resultat__unite">DT</span><span class="ecart" id="cr-res-ecart" aria-hidden="true"></span></div>' +
      '<p class="cr-resultat__sous" id="cr-res-sous"></p>' +
      '<p class="cr-resultat__palier" id="cr-res-palier" hidden></p>' +
      '<dl class="cr-chiffres">' +
        '<div><dt>Intérêts totaux</dt><dd id="cr-res-int" class="chiffre">—</dd></div>' +
        '<div><dt>Coût total du crédit</dt><dd id="cr-res-cout" class="chiffre">—</dd><dd class="cr-chiffres__note"><small id="cr-res-cout-note"></small></dd></div>' +
        '<div><dt>TEG</dt><dd id="cr-res-teg" class="chiffre">—</dd><dd class="cr-chiffres__note"><small id="cr-res-teg-note"></small></dd></div>' +
        '<div><dt>Dernière échéance</dt><dd id="cr-res-fin">—</dd><dd class="cr-chiffres__note"><small id="cr-res-fin-note"></small></dd></div>' +
      '</dl>' +
      '<div class="cr-repartition"><p class="cr-repartition__titre" id="cr-rep-titre">Ce que vous rembourserez au total : <strong id="cr-rep-total" class="chiffre">—</strong></p>' +
        '<div class="cr-pile-barre" id="cr-rep-barre" role="img" aria-labelledby="cr-rep-titre cr-rep-desc">' +
          '<i class="cr-seg cr-seg--capital"></i><i class="cr-seg cr-seg--interet"></i><i class="cr-seg cr-seg--assurance"></i><i class="cr-seg cr-seg--frais"></i></div>' +
        '<ul class="cr-legende" id="cr-rep-desc"></ul></div>' +
      '<div class="cr-resultat__actions">' +
        '<button type="button" class="bouton bouton--petit" id="cr-copier-resume">' + ico("copier") + 'Copier le résumé</button>' +
        '<button type="button" class="bouton bouton--petit" id="cr-imprimer">' + ico("imprimer") + 'Imprimer</button>' +
      '</div>' +
    '</section>';
  }

  function htmlEligibilite() {
    return '<section class="panneau cr-elig" aria-labelledby="cr-elig-titre">' +
      '<p class="encart encart--alerte requiert-naissance">Indiquez votre <a href="#profil?section=identite">date de naissance</a> : la banque limite la durée du crédit selon votre âge.</p>' +
      '<div class="cr-elig__tete"><div><h2 class="panneau__titre" id="cr-elig-titre">Éligibilité</h2><p class="panneau__sous" id="cr-elig-sous">Ce que la banque regardera, d\'après votre profil.</p></div><span class="puce" id="cr-elig-verdict"></span></div>' +
      '<div class="cr-accord" id="cr-accord" aria-live="polite"></div><ul class="cr-criteres" id="cr-criteres"></ul>' +
      '<details class="cr-option cr-emprunteur" id="cr-emprunteur"><summary><span class="cr-option__icone">' + ico("profil") + '</span><span class="cr-option__texte">Emprunteur<small id="cr-emp-etat"></small></span>' + ico("chevron", "chevron") + '</summary>' +
        '<div class="cr-option__corps"><p class="cr-texte cr-texte--doux">Repris de votre profil. Vous pouvez ajuster ces valeurs pour cette simulation seulement.</p><div class="cr-grille-champs" id="cr-emp-champs">' +
          champ({ id: "cr-emp-age", c: "age", t: "entier", lib: "Âge", unite: "ans", min: 18, max: 80 }) +
          champ({ id: "cr-emp-net", c: "net", lib: "Revenu net mensuel retenu", unite: "DT", min: 0, max: 1e7 }) +
          champ({ id: "cr-emp-brut", c: "brut", lib: "Revenu brut mensuel retenu", unite: "DT", min: 0, max: 1e7 }) +
          champ({ id: "cr-emp-charges", c: "charges", lib: "Mensualités en cours", unite: "DT", min: 0, max: 1e7 }) +
          champ({ id: "cr-emp-qn", c: "quotiteNet", t: "taux", lib: "Quotité sur le net", unite: "%", min: 10, max: 80 }) +
          champ({ id: "cr-emp-qb", c: "quotiteBrut", t: "taux", lib: "Quotité sur le brut", unite: "%", min: 10, max: 80 }) +
        '</div></div></details>' +
      '<a class="lien-action cr-lien-profil" href="#profil?section=credits">Modifier mon profil et mes crédits en cours' + ico("fleche") + '</a>' +
    '</section>';
  }

  function htmlBas() {
    return '<section class="panneau cr-graphes" aria-labelledby="cr-gr-titre">' +
        '<div class="cr-panneau-tete"><h2 class="panneau__titre" id="cr-gr-titre">Évolution du crédit</h2>' +
          '<div class="onglets" role="tablist" aria-label="Graphique affiché" id="cr-gr-onglets">' +
            '<button type="button" role="tab" id="cr-gr-tab-crd" aria-selected="true" aria-controls="cr-gr-zone" data-graphe="crd">Capital restant dû</button>' +
            '<button type="button" role="tab" id="cr-gr-tab-annee" aria-selected="false" aria-controls="cr-gr-zone" data-graphe="annee" tabindex="-1">Intérêts et capital par an</button>' +
          '</div></div>' +
        '<div class="cr-graphe cr-anim-attente" id="cr-gr-zone" role="tabpanel" aria-labelledby="cr-gr-tab-crd"></div>' +
        '<p class="cr-graphe__resume" id="cr-gr-resume"></p>' +
      '</section>' +
      '<section class="panneau cr-comparaison" id="cr-comparaison" aria-labelledby="cr-cmp-titre" hidden>' +
        '<div class="cr-panneau-tete"><div><h2 class="panneau__titre" id="cr-cmp-titre">Scénarios comparés</h2><p class="panneau__sous">La meilleure valeur de chaque ligne est mise en avant.</p></div></div>' +
        '<div id="cr-cmp-corps"></div>' +
      '</section>' +
      '<section class="panneau cr-tableau-panneau" aria-labelledby="cr-tab-titre">' +
        '<div class="cr-panneau-tete"><h2 class="panneau__titre" id="cr-tab-titre">Tableau d\'amortissement</h2>' +
          '<div class="cr-tab-actions"><div class="onglets" role="tablist" aria-label="Détail du tableau" id="cr-tab-onglets">' +
            '<button type="button" role="tab" id="cr-tab-mensuel" aria-selected="true" aria-controls="cr-tab-cadre" data-vue="mensuel">Par échéance</button>' +
            '<button type="button" role="tab" id="cr-tab-annuel" aria-selected="false" aria-controls="cr-tab-cadre" data-vue="annuel" tabindex="-1">Par année</button></div>' +
            '<button type="button" class="bouton bouton--petit" id="cr-csv">' + ico("telecharger") + 'CSV</button></div></div>' +
        '<div class="tableau-cadre cr-tableau-cadre" id="cr-tab-cadre" role="tabpanel" tabindex="0" aria-labelledby="cr-tab-titre"><table class="tableau cr-tableau" id="cr-tableau"></table></div>' +
      '</section>';
  }

  /* Outils avancés : construits à la première ouverture. */
  var OUTILS = [
    { cle: "capacite", icone: "cible", titre: "Capacité d'emprunt", sous: "Sur le net et sur le brut, d'après votre profil" },
    { cle: "inverse", icone: "comparer", titre: "Calcul inverse", sous: "Partir de la mensualité pour trouver le capital, la durée ou le taux" },
    { cle: "plan", icone: "liste", titre: "Plan de financement", sous: "Plusieurs prêts, mensualité globale et lissage" },
    { cle: "offres", icone: "comparer", titre: "Comparer des offres bancaires", sous: "Taux, frais et assurance : l'offre la moins chère" },
    { cle: "reneg", icone: "hausse", titre: "Renégociation ou rachat", sous: "Changer de taux vaut-il le coût ?" },
    { cle: "stress", icone: "alerte", titre: "Stress test du TMM", sous: "1 000 trajectoires du TMM et leurs effets" },
    { cle: "louer", icone: "maison", titre: "Louer ou acheter ?", sous: "Patrimoine comparé année après année" },
    { cle: "optim", icone: "outils", titre: "Optimiseur de stratégie", sous: "Durée, apport et remboursements sous votre budget" },
    { cle: "quand", icone: "cible", titre: "Quand demander la réduction ?", sous: "Règle des 8 % et lettre à la banque" },
    { cle: "mon", icone: "credit", titre: "Mon crédit en cours", sous: "Où en êtes-vous aujourd'hui ?" },
    { cle: "sensib", icone: "hausse", titre: "Sensibilité au TMM", sous: "Échéance et intérêts si le TMM bouge de −1 à +2 points" },
    { cle: "calendrier", icone: "horloge", titre: "Calendrier des échéances", sous: "Vue par mois et export vers votre agenda (.ics)" },
    { cle: "va", icone: "hausse", titre: "Valeur actuelle", sous: "Ce que pèsent vos remboursements, inflation déduite" },
    { cle: "audit", icone: "valide", titre: "Vérifier l'échéancier de ma banque", sous: "Collez les lignes du tableau bancaire et comparez" }
  ];
  function htmlOutils() {
    return '<section class="cr-outils" aria-labelledby="cr-outils-titre">' +
      '<div class="cr-section-tete"><h2 id="cr-outils-titre">Outils avancés</h2><p>Pour aller plus loin : chaque outil part de votre scénario et de votre profil.</p></div>' +
      '<div class="cr-outils__liste">' + OUTILS.map(function (o) {
        return '<details class="depliant cr-outil" data-outil="' + o.cle + '" id="cr-outil-' + o.cle + '"><summary><span class="depliant__icone">' + ico(o.icone) + '</span>' +
          '<span>' + o.titre + '<small>' + o.sous + '</small></span>' + ico("chevron", "chevron") + '</summary><div class="depliant__corps cr-outil__corps" id="cr-o-' + o.cle + '"></div></details>';
      }).join("") + '</div></section>';
  }

  function construire() {
    racine.innerHTML =
      '<div class="cr-mini" aria-hidden="true"><div class="cr-mini__pilule"><span id="cr-mini-lib">Mensualité</span><strong id="cr-mini-m" class="chiffre">—</strong></div></div>' +
      '<div class="cr-grille">' +
        '<div class="cr-gauche">' + htmlEditeur() + '</div>' +
        '<div class="cr-droite">' + htmlResultat() + htmlEligibilite() + '</div>' +
      '</div>' +
      '<div class="cr-bas">' + htmlBas() + htmlOutils() + '</div>' +
      '<div class="cache" aria-live="polite" id="cr-annonce"></div>';
  }

  /* ===================================================================
     Lecture et écriture de l'éditeur
     =================================================================== */
  function chemin(obj, k) { return k.split(".").reduce(function (o, p) { return o == null ? undefined : o[p]; }, obj); }
  function poser(obj, k, v) { var p = k.split("."), o = obj; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }

  function formater(t, v) {
    if (v == null || (typeof v === "number" && !isFinite(v))) return "";
    if (t === "montant") return saisieNb(v);
    if (t === "taux" || t === "signe") return (v < 0 ? "−" : "") + nbsp(nf(4, 0).format(Math.abs(v)));
    if (t === "entier") return String(Math.round(v));
    return String(v);
  }
  function valeurChamp(sc, k) {
    if (k === "annees") return Math.floor(sc.mois / 12);
    if (k === "moisSup") return sc.mois % 12;
    return chemin(sc, k);
  }
  function ecrireChamp(el, v) {
    var t = el.getAttribute("data-t");
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.type === "radio") el.checked = String(el.value) === String(v);
    else if (el.tagName === "SELECT") el.value = String(v);
    else if (el.type === "range") el.value = String(v);
    else if (doc.activeElement !== el) el.value = formater(t, v);
  }
  function ecrireEditeur() {
    var sc = sc0();
    $$("#cr-formulaire [data-k]").forEach(function (el) {
      var k = el.getAttribute("data-k");
      if (/^ras\./.test(k)) return;
      ecrireChamp(el, valeurChamp(sc, k));
      marquer(el, null);
    });
    rendreRas();
    majVisibilite();
    majCurseur();
  }
  function majVisibilite() {
    var sc = sc0();
    $$("#cr-formulaire [data-si]").forEach(function (el) { el.hidden = !chemin(sc, el.getAttribute("data-si")); });
    $("cr-taux").setAttribute("data-mode", sc.mode);
    $("cr-opt-variation").hidden = sc.mode !== "tmm";
  }
  function majCurseur() {
    var c = $("cr-annees"), sc = sc0();
    c.value = String(Math.floor(sc.mois / 12));
    c.style.setProperty("--p", (Math.floor(sc.mois / 12) / 25 * 100) + "%");
    c.style.setProperty("--c", "var(--credit)");
    c.setAttribute("aria-valuetext", dureeLib(sc.mois));
    $("cr-duree-lib").textContent = dureeLib(sc.mois) + " · " + pluriel(nbEcheances(sc), "échéance");
  }

  /* Affiche ou retire le message d'erreur d'un champ. */
  function marquer(el, msg) {
    var champEl = el.closest(".champ");
    var ancien = champEl && champEl.querySelector(".erreur-champ");
    if (!msg) {
      el.removeAttribute("aria-invalid");
      if (ancien) { ancien.remove(); }
      var d0 = (el.getAttribute("aria-describedby") || "").split(" ").filter(function (x) { return x && !/-err$/.test(x); }).join(" ");
      if (d0) el.setAttribute("aria-describedby", d0); else el.removeAttribute("aria-describedby");
      return;
    }
    el.setAttribute("aria-invalid", "true");
    if (!champEl) return;
    if (!el.id) el.id = uid();
    if (!ancien) { ancien = doc.createElement("p"); ancien.className = "erreur-champ"; ancien.id = el.id + "-err"; champEl.appendChild(ancien); }
    ancien.textContent = msg;
    var d = (el.getAttribute("aria-describedby") || "").split(" ").filter(function (x) { return x && x !== ancien.id; });
    d.push(ancien.id);
    el.setAttribute("aria-describedby", d.join(" "));
  }

  /* Lit un champ ; renvoie {ok, v}. Les bornes data-min / data-max sont contrôlées. */
  function lireChamp(el) {
    var t = el.getAttribute("data-t");
    if (el.type === "checkbox") return { ok: true, v: el.checked };
    if (t === "texte") return { ok: true, v: el.value };
    if (t === "date") return { ok: el.value === "" || /^\d{4}-\d{2}-\d{2}$/.test(el.value), v: el.value };
    if (el.type === "range" || el.tagName === "SELECT") return { ok: true, v: t === "entier" ? parseInt(el.value, 10) : el.value };
    var r = lireNombre(el.value, t === "signe");
    if (!r.valide || r.vide) { marquer(el, r.vide ? "Valeur requise." : "Nombre invalide."); return { ok: false }; }
    var v = t === "entier" ? Math.round(r.valeur) : r.valeur;
    var min = el.getAttribute("data-min"), max = el.getAttribute("data-max");
    if ((min != null && v < +min) || (max != null && v > +max)) {
      var u = el.parentNode.querySelector(".saisie__unite");
      u = u ? " " + u.textContent : "";
      marquer(el, min != null && max != null ? "Entre " + formater(t === "entier" ? "entier" : "taux", +min) + " et " + formater(t === "entier" ? "entier" : "taux", +max) + u + "." : (min != null ? "Au moins " + formater("taux", +min) + u + "." : "Au plus " + formater("taux", +max) + u + "."));
      return { ok: false };
    }
    marquer(el, null);
    return { ok: true, v: v };
  }

  /* Saisie dans l'éditeur. discret = changement ponctuel (puce, bascule, sortie du champ) : chiffres animés. */
  function surSaisie(el, discret) {
    var k = el.getAttribute("data-k");
    if (!k) return;
    if (el.type === "radio" && !el.checked) return;
    var r = lireChamp(el);
    if (!r.ok) return;
    var sc = sc0(), v = r.v;
    if (k === "type") { appliquerType(sc, v); ecrireEditeur(); calculer(true); signalerModif(); return; }
    if (k === "annees" || k === "moisSup") {
      var a = k === "annees" ? v : Math.floor(sc.mois / 12), m = k === "moisSup" ? v : sc.mois % 12;
      var tot = borne(a * 12 + m, 1, 300);
      sc.mois = Math.max(sc.periodicite, Math.round(tot / sc.periodicite) * sc.periodicite);
      if (k === "annees" && a === 25) sc.mois = 300;
      majCurseur();
      if (k === "annees") ecrireChamp($("cr-mois-sup"), sc.mois % 12);
      apresDuree(sc);
      calculer(discret || k === "annees");
      signalerModif();
      return;
    }
    if (k === "mode") {
      if (v === "fixe" && sc.mode === "tmm") sc.taux = MC.tauxTmm(sc.tmm, sc.marge);
      /* Le taux reste le même : un taux inférieur au TMM donne une marge négative (taux préférentiel). */
      if (v === "tmm" && sc.mode === "fixe") sc.marge = MC.arrondi6(sc.taux - sc.tmm);
      sc.mode = v;
      ecrireEditeur();
      calculer(true); signalerModif();
      return;
    }
    if (k === "periodicite") {
      sc.periodicite = v;
      sc.mois = Math.max(v, Math.round(sc.mois / v) * v);
      sc.differe.mois = Math.max(v, Math.round(sc.differe.mois / v) * v);
      ecrireEditeur();
      calculer(true); signalerModif();
      return;
    }
    /* Un montant saisi à la main remplace l'échéance cible. */
    if (S.cible && (k === "capital" || k === "apport.prix" || k === "apport.apport")) S.cible = null;
    poser(sc, k, v);
    /* Dépendances : prix, apport et capital restent cohérents */
    if (k === "apport.on" && v) {
      if (!(sc.apport.prix > sc.capital)) { sc.apport.apport = Math.round(sc.capital * 0.25); sc.apport.prix = sc.capital + sc.apport.apport; }
      else sc.capital = Math.max(100, arr(sc.apport.prix - sc.apport.apport));
      ecrireEditeur();
    } else if ((k === "apport.prix" || k === "apport.apport") && sc.apport.on) {
      if (sc.apport.prix > sc.apport.apport) { sc.capital = arr(sc.apport.prix - sc.apport.apport); ecrireChamp($("cr-capital"), sc.capital); marquer($("cr-capital"), null); }
    } else if (k === "capital" && sc.apport.on) {
      if (sc.apport.prix > sc.capital) { sc.apport.apport = arr(sc.apport.prix - sc.capital); ecrireChamp($("cr-apport"), sc.apport.apport); }
      else { sc.apport.prix = arr(sc.capital + sc.apport.apport); ecrireChamp($("cr-prix"), sc.apport.prix); }
    }
    if (/\.on$/.test(k) || k === "reduction") majVisibilite();
    if (/^ras\.\d+\.total$/.test(k)) rendreRas();
    if (/\.on$/.test(k) && v) requestAnimationFrame(function () { var O = Orb(); if (O) O.placerPastilles(el.closest(".cr-option") || racine); });
    calculer(discret);
    signalerModif();
  }
  function apresDuree(sc) {
    var N = nbEcheances(sc);
    if (sc.differe.mois >= sc.mois) sc.differe.mois = Math.max(sc.periodicite, Math.floor((sc.mois - 1) / sc.periodicite) * sc.periodicite);
    if (sc.variation.des > N) sc.variation.des = Math.max(2, Math.min(13, N));
    ecrireChamp($("cr-diff-mois"), sc.differe.mois);
    ecrireChamp($("cr-var-des"), sc.variation.des);
  }

  /* Liste des remboursements anticipés ponctuels */
  function rendreRas() {
    var sc = sc0(), ul = $("cr-ras");
    if (!sc.ras.length) { ul.innerHTML = '<li class="cr-ras__vide">Aucun remboursement ponctuel.</li>'; return; }
    ul.innerHTML = sc.ras.map(function (x, i) {
      return '<li class="cr-ra">' +
        '<div class="cr-ra__tete"><strong>Remboursement ' + (i + 1) + '</strong><button type="button" class="bouton bouton--fantome bouton--icone bouton--petit" data-ra-retirer="' + i + '" aria-label="Retirer le remboursement ' + (i + 1) + '">' + ico("poubelle") + '</button></div>' +
        '<div class="cr-grille-champs">' +
          champ({ id: "cr-ra-ap-" + i, k: "ras." + i + ".apres", t: "entier", lib: "Après l'échéance n°", min: 1, valeur: x.apres, aide: '<span data-ra-date="' + i + '"></span>' }) +
          (x.total ? '<div class="champ"><span class="champ__lib">Montant</span><p class="cr-ra__solde">Solde de tout le capital restant</p></div>' :
            champ({ id: "cr-ra-mt-" + i, k: "ras." + i + ".montant", lib: "Montant remboursé", unite: "DT", min: 1, max: 1e8, valeur: saisieNb(x.montant) })) +
        '</div>' +
        interrupteur({ lib: "Solder tout le crédit", k: "ras." + i + ".total", coche: x.total, cls: "cr-interrupteur-petit" }) +
      '</li>';
    }).join("");
    majDatesRas();
  }
  function dateEcheance(k) {
    var sc = sc0(), d = MC.lireDate(sc.dateDebut);
    return d ? new Date(d.getFullYear(), d.getMonth() + (k - 1) * sc.periodicite, 1) : null;
  }
  function majDatesRas() {
    $$("[data-ra-date]").forEach(function (el) {
      var x = sc0().ras[+el.getAttribute("data-ra-date")];
      el.textContent = x && dateEcheance(x.apres) ? "Après l'échéance de " + moisAn(dateEcheance(x.apres)) + "." : "";
    });
    var vd = $("cr-var-date"), sc = sc0();
    if (vd) vd.textContent = dateEcheance(sc.variation.des) ? "Soit " + moisAn(dateEcheance(sc.variation.des)) + "." : "Échéance 2 au plus tôt.";
  }

  /* ===================================================================
     Calcul et affichage du résultat
     =================================================================== */
  var lourdEnAttente = null;
  /* Échéance cible (lien « Simuler » du calendrier de la marge) : le capital est recalculé pour que
     l'échéance reste la même quand le taux, la durée ou la périodicité changent. */
  function capitalCible(sc) {
    var p = sc.periodicite || 1, n = sc.mois / p, m = S.cible.mensualite * p, i = tauxApplique(sc) / 100 * p / 12;
    if (!(n > 0) || !isFinite(i)) return sc.capital;
    return Math.max(100, Math.floor(i === 0 ? m * n : m * (1 - Math.pow(1 + i, -n)) / i));
  }
  function suivreCible(sc) {
    if (!S.cible) return;
    if (S.cible.scenario !== sc) { S.cible = null; return; }
    var c = capitalCible(sc);
    if (c === sc.capital) return;
    sc.capital = c;
    if (sc.apport.on) sc.apport.prix = arr(c + sc.apport.apport);
    ecrireChamp($("cr-capital"), c); marquer($("cr-capital"), null);
  }

  function calculer(anime) {
    var sc = sc0();
    suivreCible(sc);
    if (!valide(sc)) return;
    var e = entree(sc, true), r;
    try { r = MC.echeancier(e); } catch (err) { if (window.console) console.error(err); return; }
    S.dernier = { e: e, r: r, sc: sc };
    majResultat(e, r, anime);
    majEligibilite(e, r);
    majOptions(e, r);
    majOnglets();
    clearTimeout(lourdEnAttente);
    lourdEnAttente = setTimeout(rendreLourd, anime ? 0 : 140);
    annoncer();
  }
  function rendreLourd() {
    rendreGraphe();
    rendreTableau();
    rendreComparaison();
    OUTILS.forEach(function (o) {
      var d = $("cr-outil-" + o.cle);
      if (d && d.open && OUTIL_FN[o.cle] && OUTIL_FN[o.cle].suit) { try { OUTIL_FN[o.cle].calc($("cr-o-" + o.cle)); } catch (err) { if (window.console) console.error(err); } }
    });
  }
  var annoncer = anti(function () {
    var d = S.dernier; if (!d) return;
    var r = d.r;
    $("cr-annonce").textContent = MC.infoPeriodicite(r.p).echeance + " : " + dt(MC.totalLigne(MC.premiereLigne(r))) + ". Coût du crédit : " + dt(r.coutCredit) + (isFinite(r.teg) ? ". TEG : " + pc(r.teg, 2) : "") + ".";
  }, 900);

  function premiereEcheance(r) { return MC.totalLigne(MC.premiereLigne(r)); }

  function majResultat(e, r, anime) {
    var O = Orb(), m = premiereEcheance(r), info = MC.infoPeriodicite(r.p);
    var elM = $("cr-res-m");
    $("cr-res-lib").textContent = info.echeance;
    $("cr-mini-lib").textContent = info.echeance;
    $("cr-res-scen").textContent = S.scenarios.length > 1 ? "Scénario " + LETTRES[S.actif] : TYPES[e.type] ? TYPES[e.type].long : "Crédit";
    if (O && O.animerNombre) {
      O.animerNombre(elM, m, F.dt3, { instantane: !anime, ecart: anime ? $("cr-res-ecart") : null });
    } else elM.textContent = F.dt3(m);
    $("cr-mini-m").textContent = dt(m);
    var der = r.lignes[r.lignes.length - 1];
    var sous = [];
    if (r.lignes[r.D] && r.lignes[r.D].assurance > 0) sous.push("dont " + dt(MC.premiereLigne(r).assurance) + " d'assurance");
    sous.push(pluriel(r.n - r.D, "échéance") + (r.p === 1 ? "" : " (" + info.nom.toLowerCase() + "s)"));
    if (r.D) sous.push("après " + dureeLib(r.D * r.p) + " de différé" + (r.diffTotal ? " total" : " à " + dt(MC.totalLigne(r.lignes[0])) ));
    $("cr-res-sous").textContent = sous.join(" · ");
    var pal = $("cr-res-palier"), txt = "";
    if (r.amort === "lineaire" && r.lignes.length > r.D + 1) txt = "Échéances dégressives : la dernière vaut " + dt(MC.totalLigne(der)) + ".";
    else if (r.amort === "infine") txt = "Intérêts seuls, puis le capital est remboursé à la dernière échéance (" + dt(MC.totalLigne(der)) + ").";
    else if (r.reductions.length) {
      var red = r.reductions[0];
      txt = "Puis " + dt(red.M + (r.lignes[red.mois - 1] ? r.lignes[red.mois - 1].assurance : 0)) + " dès l'échéance " + red.mois + (red.date ? " (" + moisAn(red.date) + ")" : "") + " : taux divisé par deux, de " + pc(red.avant, 3) + " à " + pc(red.apres, 3) + ".";
    } else if (r.paliers.length > 1) {
      var pl = r.paliers[1];
      txt = "Puis " + dt(pl.M) + " dès l'échéance " + pl.mois + " avec le TMM révisé (taux " + pc(pl.taux, 3) + ").";
    } else if (r.ras.length && e.raMode === "mensualite") {
      var l1 = r.lignes[r.ras[0].mois];
      if (l1) txt = "Après le remboursement anticipé : " + dt(MC.totalLigne(l1)) + " par échéance.";
    }
    pal.hidden = !txt; pal.textContent = txt;
    if (O && O.animerNombre) {
      O.animerNombre($("cr-res-int"), r.totI, dt, { instantane: !anime });
      O.animerNombre($("cr-res-cout"), r.coutCredit, dt, { instantane: !anime });
    } else { $("cr-res-int").textContent = dt(r.totI); $("cr-res-cout").textContent = dt(r.coutCredit); }
    var parts = ["intérêts"]; if (r.totAss) parts.push("assurance"); if (r.frais) parts.push("frais"); if (r.totIndem) parts.push("indemnités");
    $("cr-res-cout-note").textContent = parts.join(" + ");
    $("cr-taux-total").innerHTML = e.tmm ? "Taux appliqué : TMM " + pc(e.tmm.tmm, 3) + (e.tmm.marge < 0 ? " − " : " + ") + nombre(Math.abs(e.tmm.marge), 3) + " points = <strong>" + pc(e.taux, 3) + "</strong>" : "";
    $("cr-res-teg").textContent = pc(r.teg, 2);
    $("cr-res-teg-note").textContent = "taux nominal " + pc(e.taux, 3);
    $("cr-res-fin").textContent = der.date ? moisAn(der.date) : "Échéance " + der.mois;
    $("cr-res-fin-note").textContent = dureeLib(r.n * r.p) + (r.n < r.nPrevu ? " au lieu de " + dureeLib(r.nPrevu * r.p) : "");
    /* Répartition du total remboursé */
    var segs = [["capital", "Capital", r.C], ["interet", "Intérêts", r.totI], ["assurance", "Assurance", r.totAss], ["frais", "Frais et indemnités", arr(r.frais + r.totIndem)]];
    var total = segs.reduce(function (s, x) { return s + x[2]; }, 0);
    $("cr-rep-total").textContent = dt(total);
    var barre = $("cr-rep-barre");
    segs.forEach(function (x) {
      var seg = barre.querySelector(".cr-seg--" + x[0]);
      seg.style.setProperty("--l", (total > 0 ? x[2] / total * 100 : 0) + "%");
    });
    $("cr-rep-desc").innerHTML = segs.filter(function (x) { return x[2] > 0; }).map(function (x) {
      return '<li><i class="cr-point cr-point--' + x[0] + '" aria-hidden="true"></i><span>' + x[1] + '</span><strong class="chiffre">' + dt0(x[2]) + '</strong><small>' + pc(x[2] / total * 100, 1) + '</small></li>';
    }).join("");
    /* Capacité affichée sous le capital */
    var aide = $("cr-capital-aide-txt");
    if (S.cible && S.cible.scenario === sc0()) {
      aide.textContent = "Montant calculé pour une échéance de " + dt0(S.cible.mensualite) + " par mois : il augmente quand le taux baisse ou que la durée s'allonge. Saisissez un montant pour le fixer.";
    } else if (S.emp.net > 0) {
      var cap = capaciteBanque(e);
      aide.textContent = cap.capital > 0 ? "Votre capacité sur cette durée et à ce taux : " + dt0(cap.capital) + " (échéance maximale " + dt0(cap.mensualiteMax) + ")." : "Vos crédits en cours ne laissent pas de capacité d'emprunt sur votre " + S.emp.base + ".";
    } else aide.textContent = "Renseignez votre salaire dans le profil pour voir votre capacité.";
    S.precedentM = m;
  }

  /* Capacité selon la règle de la banque de l'utilisateur (net ou brut, revenu retenu du profil). */
  function capaciteBanque(e) {
    var emp = S.emp, brut = emp.base === "brut";
    return MC.capaciteEmprunt({ base: emp.base, revenuNet: emp.net, revenuBrut: emp.brut, quotite: brut ? emp.quotiteBrut : emp.quotiteNet, charges: emp.charges, dureeMois: e.mois, tauxAnnuelPct: e.taux, ageActuel: emp.age, ageMax: AGE_MAX });
  }

  /* Encadré « Ce que la banque peut vous accorder » : échéance et montant maximum, comparés à la demande. */
  function majAccord(e, mensuel) {
    var box = $("cr-accord"), emp = S.emp;
    if (!(emp.net > 0 || emp.brut > 0)) { box.innerHTML = ""; return; }
    var cap = capaciteBanque(e), qui = emp.banque ? esc(emp.banque) : "La banque";
    var rev = emp.base === "brut" ? emp.brut : emp.net, q = emp.base === "brut" ? emp.quotiteBrut : emp.quotiteNet;
    var ok = cap.mensualiteMax > 0 && mensuel <= cap.mensualiteMax + 0.5;
    var demande = ok
      ? "Votre demande (" + dt0(e.capital) + ", échéance " + dt0(mensuel) + ") est dans la limite."
      : cap.mensualiteMax > 0 ? "Votre demande (échéance " + dt0(mensuel) + ") dépasse la limite de " + dt0(mensuel - cap.mensualiteMax) + " par mois : visez au plus " + dt0(cap.capital) + " sur cette durée."
      : "Vos crédits en cours atteignent déjà la limite : aucun nouveau crédit pour l'instant.";
    box.className = "cr-accord " + (ok ? "cr-accord--ok" : "cr-accord--alerte");
    box.innerHTML = '<p class="cr-accord__titre">' + qui + ' peut vous accorder</p>' +
      '<div class="cr-accord__chiffres"><div><span>Échéance maximale</span><strong class="chiffre">' + dt0(Math.max(0, cap.mensualiteMax)) + '</strong><small>par mois</small></div>' +
      '<div><span>Montant maximal</span><strong class="chiffre">' + dt0(Math.max(0, cap.capital)) + '</strong><small>sur ' + dureeLib(cap.dureeMois || e.mois) + ' à ' + pc(e.taux, 2) + '</small></div></div>' +
      '<p class="cr-accord__regle">' + pc(q * 100, 0) + ' de ' + dt0(rev) + ' ' + emp.base + ' par mois' + (emp.annuel ? ' (salaires et primes de l\'année ÷ 12)' : '') + ', moins ' + dt0(emp.charges) + ' de crédits en cours.</p>' +
      '<p class="cr-accord__demande">' + demande + '</p>';
  }

  function majEligibilite(e, r) {
    var emp = S.emp, el = MC.eligibilite(e, r, { endettementMax: emp.quotiteNet * 100, ageMax: AGE_MAX, apportMin: MC.DEFAUTS.apportMin });
    var mensuel = arr(premiereEcheance(r) / r.p), items = [];
    majAccord(e, mensuel);
    function jauge(v, seuil, max) { return { p: Math.min(100, v / max * 100), s: Math.min(100, seuil / max * 100) }; }
    if (el.endettement) {
      items.push({ cle: "net", autre: emp.base !== "net", titre: "Endettement sur le net" + (emp.base !== "net" ? " (autres banques)" : ""), etat: el.endettement.ok ? "ok" : "alerte",
        valeur: pc(el.endettement.taux, 1), note: "Limite " + pc(el.endettement.max, 0) + " · " + dt0(mensuel + emp.charges) + " de crédits sur " + dt0(emp.net),
        jauge: jauge(el.endettement.taux, el.endettement.max, Math.max(80, el.endettement.taux)) });
    } else items.push({ cle: "net", titre: "Endettement sur le net", etat: "neutre", valeur: "—", note: "Ajoutez votre salaire dans le profil." });
    if (emp.brut > 0) {
      var tb = (mensuel + emp.charges) / emp.brut * 100, mb = emp.quotiteBrut * 100;
      items.push({ cle: "brut", autre: emp.base !== "brut", titre: "Endettement sur le brut" + (emp.base === "brut" && emp.banque ? " (" + esc(emp.banque) + ")" : emp.base !== "brut" ? " (autres banques)" : ""), etat: tb <= mb ? "ok" : "alerte", valeur: pc(tb, 1),
        note: "Limite " + pc(mb, 0) + " du brut (" + dt0(emp.brut) + ")" + (emp.base === "brut" ? ", règle de votre banque" : ", règle de certaines banques"), jauge: jauge(tb, mb, Math.max(80, tb)) });
    }
    if (el.resteAVivre) {
      var rav = el.resteAVivre.montant;
      items.push({ cle: "rav", titre: "Reste à vivre", etat: rav > 0 ? (rav < emp.net * 0.4 ? "alerte" : "ok") : "alerte", valeur: dt0(rav),
        note: rav > 0 ? (rav < emp.net * 0.4 ? "Moins de 40 % de votre net après les crédits : budget serré." : "Ce qui reste chaque mois après tous vos crédits.") : "Vos crédits dépasseraient vos revenus." });
    }
    if (el.age) items.push({ cle: "age", titre: "Âge en fin de crédit", etat: el.age.ok ? "ok" : "alerte", valeur: nombre(Math.floor(el.age.fin), 0) + " ans",
      note: el.age.ok ? "Les banques prêtent jusqu'à " + el.age.max + " ans en fin de crédit." : "Au-delà de " + el.age.max + " ans : raccourcissez la durée." });
    if (el.apport) items.push({ cle: "apport", titre: "Apport personnel", etat: el.apport.ok ? "ok" : "alerte", valeur: pc(el.apport.pct, 1),
      note: el.apport.ok ? "Au moins " + el.apport.min + " % du prix, comme le demandent les banques." : "Les banques demandent souvent " + el.apport.min + " % du prix.", jauge: jauge(el.apport.pct, el.apport.min, Math.max(50, el.apport.pct)) });
    else if (e.type === "immo" || e.type === "auto") items.push({ cle: "apport", titre: "Apport personnel", etat: "neutre", valeur: "—", note: '<button type="button" class="lien-action cr-lien-bouton" data-ouvrir-option="apport">Indiquer le prix et l\'apport</button>' });

    $("cr-criteres").innerHTML = items.map(function (x) {
      return '<li class="cr-critere" data-etat="' + x.etat + '">' +
        '<span class="cr-critere__icone">' + ico(x.etat === "ok" ? "valide" : x.etat === "alerte" ? "alerte" : "info") + '</span>' +
        '<div class="cr-critere__corps"><div class="cr-critere__ligne"><span class="cr-critere__titre">' + x.titre + '</span><strong class="chiffre">' + x.valeur + '</strong></div>' +
        (x.jauge ? '<div class="cr-jauge" aria-hidden="true"><i class="cr-jauge__rempli" data-p="' + x.jauge.p + '"></i><i class="cr-jauge__seuil" data-s="' + x.jauge.s + '"></i></div>' : "") +
        '<p class="cr-critere__note"><span class="cache">' + (x.etat === "ok" ? "Conforme. " : x.etat === "alerte" ? "Attention. " : "") + '</span>' + x.note + '</p></div></li>';
    }).join("");
    $$("#cr-criteres .cr-jauge__rempli").forEach(function (i) { i.style.setProperty("--p", i.getAttribute("data-p") + "%"); });
    $$("#cr-criteres .cr-jauge__seuil").forEach(function (i) { i.style.setProperty("--s", i.getAttribute("data-s") + "%"); });
    var alertes = items.filter(function (x) { return x.etat === "alerte" && !x.autre; }).length, connus = items.filter(function (x) { return x.etat !== "neutre"; }).length;
    var v = $("cr-elig-verdict");
    v.className = "puce " + (!connus ? "" : alertes ? "puce--alerte" : "puce--succes");
    v.textContent = !connus ? "À compléter" : alertes ? pluriel(alertes, "point à revoir", "points à revoir") : "Dossier solide";
    $("cr-emp-etat").textContent = (emp.age ? emp.age + " ans · " : "") + (emp.net > 0 ? "net " + dt0(emp.net) : "revenu non renseigné") + (emp.charges > 0 ? " · " + dt0(emp.charges) + " de crédits" : "");
  }

  function majOptions(e, r) {
    var sc = sc0();
    function etat(cle, t) { var el = $("cr-opt-" + cle + "-etat"); if (el) el.textContent = t; }
    etat("apport", e.apport ? "Prix " + dt0(e.apport.prix) + " · apport " + pc(e.apport.apport / e.apport.prix * 100, 1) : "Non renseigné");
    var ap = $("cr-apport-pct");
    if (ap) ap.textContent = sc.apport.prix > 0 ? "Soit " + pc(sc.apport.apport / sc.apport.prix * 100, 1) + " du prix." : "—";
    etat("variation", e.variation ? signe(e.variation.delta, function (x) { return nombre(x, 2); }) + " point dès l'échéance " + e.variation.des : "Aucune");
    etat("modalites", MC.infoPeriodicite(e.periodicite).nom + " · " + { constant: "échéances constantes", lineaire: "amortissement constant", infine: "in fine" }[e.amort]);
    $("cr-amort-aide").textContent = { constant: "Le même montant à chaque échéance : au début surtout des intérêts, à la fin surtout du capital.", lineaire: "Le capital baisse du même montant à chaque échéance : les premières échéances sont plus lourdes, puis elles diminuent.", infine: "Vous ne payez que les intérêts, et tout le capital à la dernière échéance." }[e.amort];
    etat("differe", e.differe ? dureeLib(e.differe.mois) + (e.differe.type === "total" ? " · total" : " · partiel") : "Aucun");
    etat("assurance", e.assurance ? pc(e.assurance.taux, 3) + " · " + dt0(r.totAss) + " au total" : "Non incluse");
    etat("frais", e.frais ? dt0(r.frais) + " · TEG " + pc(r.teg, 2) : "Aucun");
    var ft = $("cr-frais-total");
    if (ft) ft.textContent = "Total des frais : " + dt(r.frais) + ". TEG : " + pc(r.teg, 2) + " pour un taux nominal de " + pc(e.taux, 3) + ".";
    var nRa = e.ras.length + (e.versement ? 1 : 0);
    etat("ra", nRa ? pluriel(nRa, "versement") + " · " + dt0(r.totRA) : "Aucun");
    var ir = doc.querySelector('#cr-formulaire input[data-k="reduction"]');
    if (ir) ir.disabled = sc.mode === "tmm";
    if (sc.mode === "tmm") etat("reduction", "Non concerné (taux variable)");
    else etat("reduction", e.reduction ? (r.reductions.length ? "Appliquée dès l'échéance " + r.reductions[0].mois : (e.mois > 84 ? "Demandée, pas encore atteinte" : "Crédit de 84 mois ou moins")) : (e.mois > 84 ? "Non appliquée" : "Non concerné (84 mois ou moins)"));
    majDatesRas();
    /* Bilan des remboursements anticipés */
    var bilan = $("cr-ra-bilan");
    if (nRa) {
      var ra = MC.remboursementAnticipe(e);
      var lignes = ["Vous remboursez " + dt(ra.totRA) + " par anticipation."];
      lignes.push("Intérêts et assurance économisés : <strong>" + dt(ra.economie) + "</strong>" + (ra.totIndem ? ", moins " + dt(ra.totIndem) + " d'indemnités, soit un gain net de <strong>" + dt(ra.gainNet) + "</strong>" : "") + ".");
      if (ra.effet === "duree") lignes.push("Le crédit se termine " + dureeLib(ra.moisGagnes) + " plus tôt.");
      else if (ra.effet === "solde") lignes.push("Le crédit est soldé après l'échéance " + ra.soldeApres + ".");
      else if (ra.effet === "mensualite" && ra.echeanceApres != null) lignes.push("L'échéance passe de " + dt(ra.echeanceSans) + " à " + dt(ra.echeanceApres) + ".");
      if (ra.limite) lignes.push("Un montant dépassait le capital restant dû : il a été limité.");
      bilan.innerHTML = encart(ra.gainNet > 0 ? "succes" : "", "valide", lignes.map(function (x) { return "<p>" + x + "</p>"; }).join(""));
    } else bilan.innerHTML = "";
    /* Bilan de la règle des 8 % */
    var rb = $("cr-red-bilan"), an = MC.analyseReduction(entree(sc, false));
    if (sc.mode === "tmm") rb.innerHTML = encart("", "info", "<p>Taux variable (TMM + marge) : la règle des 8 % ne concerne que les crédits à taux fixe.</p>");
    else if (!an.dureeOk) rb.innerHTML = encart("", "info", "<p>Ce crédit dure 84 mois ou moins : la règle ne s'applique pas.</p>");
    else if (an.reductions.length) {
      var red = an.reductions[0];
      rb.innerHTML = encart("succes", "valide", "<p>La condition est remplie dès l'échéance <strong>" + red.mois + "</strong>" + (red.date ? " (" + moisAn(red.date) + ")" : "") + " : ratio de " + pc(red.ratio * 100, 2) + ". Votre taux passerait de " + pc(red.avant, 3) + " à " + pc(red.apres, 3) + ".</p>" +
        "<p>Intérêts économisés : <strong>" + dt(an.economie) + "</strong>" + (an.reductions.length > 1 ? " (" + an.reductions.length + " réductions successives)" : "") + ".</p>" +
        (an.modalitesOk ? "" : "<p>Attention : la banque applique surtout cette règle aux crédits mensuels à échéances constantes, sans différé.</p>"));
    } else rb.innerHTML = encart("", "info", "<p>Avec ce taux et cette durée, les intérêts des 3 dernières années ne dépassent jamais 8 % du capital restant : pas de réduction possible.</p>");
  }

  /* ===================================================================
     Onglets des scénarios A / B / C
     =================================================================== */
  function majOnglets() {
    var box = $("cr-onglets-sc");
    var html = S.scenarios.map(function (sc, i) {
      var m = NaN;
      if (valide(sc)) { try { m = premiereEcheance(i === S.actif && S.dernier ? S.dernier.r : MC.echeancier(entree(sc, false))); } catch (e) { m = NaN; } }
      return '<button type="button" role="tab" id="cr-tab-' + i + '" aria-selected="' + (i === S.actif) + '" aria-controls="cr-formulaire"' + (i === S.actif ? "" : ' tabindex="-1"') + ' data-sc="' + i + '">' +
        '<span class="cr-onglet__lettre">' + LETTRES[i] + '</span><span class="cr-onglet__val chiffre">' + (isFinite(m) ? dt0(m) : "—") + '</span>' +
        (S.scenarios.length > 1 && i > 0 ? '' : '') + '</button>';
    }).join("");
    if (box.innerHTML !== html) box.innerHTML = html;
    $("cr-formulaire").setAttribute("aria-labelledby", "cr-tab-" + S.actif);
    var dup = $("cr-dupliquer");
    dup.disabled = S.scenarios.length >= 3;
    dup.setAttribute("aria-label", S.scenarios.length >= 3 ? "Trois scénarios au maximum" : "Dupliquer le scénario " + LETTRES[S.actif] + " en scénario " + LETTRES[S.scenarios.length]);
    var sup = $("cr-supprimer");
    sup.hidden = S.scenarios.length < 2;
    sup.setAttribute("aria-label", "Supprimer le scénario " + LETTRES[S.actif]);
    sup.title = "Supprimer le scénario " + LETTRES[S.actif];
  }
  function choisirScenario(i) {
    if (i === S.actif || !S.scenarios[i]) return;
    S.actif = i;
    ecrireEditeur();
    calculer(true);
    var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
  }
  function dupliquer() {
    if (S.scenarios.length >= 3) return;
    var n = copie(sc0());
    S.scenarios.push(n);
    var src = $("cr-tab-" + S.actif);
    S.actif = S.scenarios.length - 1;
    ecrireEditeur();
    calculer(true);
    var O = Orb();
    if (O && O.puceVolante) O.puceVolante(src, $("cr-tab-" + S.actif), LETTRES[S.actif], "credit");
    toast("Scénario " + LETTRES[S.actif] + " créé : modifiez-le pour comparer.");
    var t = $("cr-tab-" + S.actif); if (t) t.focus();
    signalerModif();
  }
  /* Supprime un scénario (le dernier restant est conservé) ; les suivants changent de lettre. Annulable. */
  function supprimerScenario(i) {
    if (S.scenarios.length < 2 || !S.scenarios[i]) return;
    var retire = S.scenarios.splice(i, 1)[0], actifAvant = S.actif, lettre = LETTRES[i];
    if (S.actif > i || S.actif >= S.scenarios.length) S.actif = Math.max(0, S.actif - 1);
    ecrireEditeur();
    calculer(true);
    var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
    var t = $("cr-tab-" + S.actif); if (t) t.focus();
    signalerModif();
    toast("Scénario " + lettre + " supprimé.", { action: { libelle: "Annuler", fn: function () {
      if (S.scenarios.length >= 3) return;
      S.scenarios.splice(i, 0, retire);
      S.actif = actifAvant;
      ecrireEditeur();
      calculer(true);
      var O2 = Orb(); if (O2) requestAnimationFrame(function () { O2.placerPastilles(racine); });
      signalerModif();
    } } });
  }

  function rendreComparaison() {
    var sec = $("cr-comparaison");
    if (S.scenarios.length < 2) { sec.hidden = true; return; }
    sec.hidden = false;
    var res = S.scenarios.map(function (sc) { return valide(sc) ? MC.echeancier(entree(sc, false)) : null; });
    var lignes = [
      ["Échéance (assurance comprise)", function (r) { return premiereEcheance(r); }, dt],
      ["Durée", function (r) { return r.n * r.p; }, dureeLib],
      ["Intérêts totaux", function (r) { return r.totI; }, dt],
      ["Coût total du crédit", function (r) { return r.coutCredit; }, dt],
      ["TEG", function (r) { return isFinite(r.teg) ? r.teg : 0; }, function (v) { return pc(v, 2); }]
    ];
    var desc = S.scenarios.map(function (sc, i) {
      return '<th scope="col"><span class="cr-cmp__lettre">' + LETTRES[i] + '</span>' + (i === S.actif ? ' <span class="puce puce--credit">affiché</span>' : "") + '<small>' + esc((TYPES[sc.type] || TYPES.libre).nom) + ' · ' + dt0(sc.capital) + ' · ' + pc(tauxApplique(sc), 2) + '</small></th>';
    }).join("");
    var corps = lignes.map(function (l) {
      var vals = res.map(function (r) { return r ? l[1](r) : NaN; });
      var min = Math.min.apply(null, vals.filter(isFinite)), nbMin = vals.filter(function (v) { return Math.abs(v - min) < 0.0005; }).length;
      return '<tr><th scope="row">' + l[0] + '</th>' + vals.map(function (v) {
        var best = isFinite(v) && Math.abs(v - min) < 0.0005 && nbMin < vals.length;
        return '<td' + (best ? ' class="cr-meilleur"' : "") + '>' + (isFinite(v) ? l[2](v) : "—") + (best ? '<span class="cache"> (meilleur)</span>' : "") + '</td>';
      }).join("") + '</tr>';
    }).join("");
    var ecartTxt = "";
    if (res[0] && res[1]) {
      var c = MC.comparerAB(res[0], res[1]), dCout = arr(res[1].coutCredit - res[0].coutCredit);
      ecartTxt = '<p class="cr-texte">' + (Math.abs(dCout) < 0.0005 ? "A et B coûtent autant." : "Le scénario " + (dCout > 0 ? "A" : "B") + " coûte <strong>" + dt(Math.abs(dCout)) + "</strong> de moins que le scénario " + (dCout > 0 ? "B" : "A") + ".") +
        " Écart de paiements cumulés après 5 ans (B − A) : " + signe(valEcart(c.ecart, 60)) + ".</p>";
    }
    $("cr-cmp-corps").innerHTML =
      '<div class="tableau-cadre cr-cmp-cadre" role="region" aria-label="Tableau comparatif des scénarios" tabindex="0"><table class="tableau cr-cmp"><caption class="cache">Comparaison des scénarios</caption><thead><tr><th scope="col">Indicateur</th>' + desc + '</tr></thead><tbody>' + corps + '</tbody></table></div>' +
      ecartTxt +
      '<div class="cr-graphe" id="cr-cmp-graphe"></div><p class="cr-graphe__resume" id="cr-cmp-resume"></p>' +
      '<div class="cr-cmp-actions">' + S.scenarios.map(function (sc, i) {
        return '<button type="button" class="bouton bouton--petit bouton--fantome" data-sc-suppr="' + i + '">' + ico("poubelle") + 'Supprimer le scénario ' + LETTRES[i] + '</button>';
      }).join("") + '</div>';
    var zone = $("cr-cmp-graphe"), w = largeur(zone);
    var series = res.map(function (r, i) {
      if (!r) return null;
      var pts = [[0, r.C]]; r.lignes.forEach(function (l) { pts.push([l.mois * r.p, MC.resteFin(l)]); });
      return { pts: pts, classe: "cr-serie--sc" + i, nom: "Scénario " + LETTRES[i] };
    }).filter(Boolean);
    zone.innerHTML = grapheLignes({ w: w, h: hauteurGraphe(), series: series, fmtY: compact, ticksX: ticksMois(Math.max.apply(null, series.map(function (s) { return s.pts[s.pts.length - 1][0]; }))),
      titre: "Capital restant dû des scénarios", desc: "Courbes du capital restant dû de chaque scénario au fil des mois." }) + legende(series);
    $("cr-cmp-resume").textContent = series.map(function (s, i) { return s.nom + " : soldé en " + dureeLib(s.pts[s.pts.length - 1][0]); }).join(" · ") + ".";
  }
  function valEcart(ecart, m) { var v = 0; ecart.forEach(function (p) { if (p[0] <= m) v = p[1]; }); return v; }

  /* ===================================================================
     Graphiques SVG
     =================================================================== */
  var NS_ID = 0;
  function largeur(el) { return Math.max(280, Math.round((el && el.clientWidth) || 640)); }
  function hauteurGraphe() { return window.innerWidth < 640 ? 220 : 280; }
  function graduations(min, max, n) {
    if (!(max > min)) { max = min + 1; }
    var pas = (max - min) / (n || 4), p10 = Math.pow(10, Math.floor(Math.log(pas) / Math.LN10)), f = pas / p10;
    pas = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p10;
    var d = Math.floor(min / pas) * pas, out = [];
    for (var v = d; v <= max + pas * 0.5; v += pas) { out.push(Math.round(v * 1e6) / 1e6); if (v >= max) break; }
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + pas);
    return out;
  }
  function ticksMois(nMois) {
    var dDeb = MC.lireDate(sc0().dateDebut), annees = nMois / 12, pas = annees <= 6 ? 1 : annees <= 12 ? 2 : 5, out = [];
    for (var a = 0; a * 12 <= nMois + 0.01; a += pas) {
      out.push({ v: a * 12, lib: dDeb ? String(dDeb.getFullYear() + a) : (a === 0 ? "0" : "an " + a) });
    }
    return out;
  }
  function chem(pts, X, Y) { return pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(""); }

  /* Graphique en lignes / aires. */
  function grapheLignes(o) {
    var W = o.w, H = o.h, g = { l: 54, r: 12, t: 12, b: 30 };
    var xs = [], ys = [];
    (o.series || []).forEach(function (s) { s.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    (o.bandes || []).forEach(function (b) { b.haut.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); b.bas.forEach(function (p) { ys.push(p[1]); }); });
    if (o.seuil != null) ys.push(o.seuil);
    if (!xs.length) return "";
    var xmin = o.xmin != null ? o.xmin : Math.min.apply(null, xs), xmax = o.xmax != null ? o.xmax : Math.max.apply(null, xs);
    var ymin0 = o.ymin != null ? o.ymin : Math.min(0, Math.min.apply(null, ys)), ymax0 = Math.max.apply(null, ys);
    var ty = graduations(ymin0, ymax0, 4), ymin = ty[0], ymax = ty[ty.length - 1];
    if (xmax === xmin) xmax = xmin + 1;
    function X(v) { return g.l + (v - xmin) / (xmax - xmin) * (W - g.l - g.r); }
    function Y(v) { return H - g.b - (v - ymin) / (ymax - ymin) * (H - g.t - g.b); }
    NS_ID += 1;
    var tid = "cr-svg-t" + NS_ID, did = "cr-svg-d" + NS_ID;
    var s = '<svg class="cr-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-labelledby="' + tid + ' ' + did + '"><title id="' + tid + '">' + esc(o.titre || "Graphique") + '</title><desc id="' + did + '">' + esc(o.desc || "") + '</desc>';
    (o.zones || []).forEach(function (z) { s += '<rect class="cr-zone" x="' + X(z[0]).toFixed(1) + '" y="' + g.t + '" width="' + Math.max(1, X(z[1]) - X(z[0])).toFixed(1) + '" height="' + (H - g.t - g.b) + '"/>'; });
    s += '<g class="cr-axe">';
    ty.forEach(function (v) { s += '<line x1="' + g.l + '" x2="' + (W - g.r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (g.l - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fmtY || compact)(v)) + '</text>'; });
    var tx = o.ticksX || graduations(xmin, xmax, 5).map(function (v) { return { v: v, lib: (o.fmtX || compact)(v) }; });
    var dernierX = -1e9;
    tx.forEach(function (t) {
      if (t.v < xmin - 1e-9 || t.v > xmax + 1e-9) return;
      var x = X(t.v);
      if (x - dernierX < 34) return;
      dernierX = x;
      s += '<text x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(t.lib) + '</text>';
    });
    s += '</g>';
    (o.bandes || []).forEach(function (b) {
      var d = chem(b.haut, X, Y) + b.bas.slice().reverse().map(function (p) { return "L" + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join("") + "Z";
      s += '<path class="cr-bande ' + (b.classe || "") + '" d="' + d + '"/>';
    });
    (o.series || []).forEach(function (se) {
      if (se.aire) s += '<path class="cr-aire ' + se.classe + '" d="' + chem(se.pts, X, Y) + 'L' + X(se.pts[se.pts.length - 1][0]).toFixed(1) + ' ' + Y(Math.max(ymin, 0)).toFixed(1) + 'L' + X(se.pts[0][0]).toFixed(1) + ' ' + Y(Math.max(ymin, 0)).toFixed(1) + 'Z"/>';
    });
    if (o.seuil != null) s += '<line class="cr-seuil" x1="' + g.l + '" x2="' + (W - g.r) + '" y1="' + Y(o.seuil).toFixed(1) + '" y2="' + Y(o.seuil).toFixed(1) + '"/>' + (o.seuilLib ? '<text class="cr-seuil__lib" x="' + (W - g.r - 4) + '" y="' + (Y(o.seuil) - 6).toFixed(1) + '" text-anchor="end">' + esc(o.seuilLib) + '</text>' : "");
    (o.series || []).forEach(function (se) {
      s += '<path class="cr-ligne cr-trace ' + se.classe + (se.pointille ? " cr-ligne--pointille" : "") + '" pathLength="1" d="' + chem(se.pts, X, Y) + '"/>';
    });
    (o.marqueurs || []).forEach(function (m) { s += '<circle class="cr-marqueur ' + (m.classe || "") + '" cx="' + X(m.x).toFixed(1) + '" cy="' + Y(m.y).toFixed(1) + '" r="5"><title>' + esc(m.lib || "") + '</title></circle>'; });
    if (o.curseurX != null) s += '<line class="cr-curseur-x" x1="' + X(o.curseurX).toFixed(1) + '" x2="' + X(o.curseurX).toFixed(1) + '" y1="' + g.t + '" y2="' + (H - g.b) + '"/>';
    return s + '</svg>';
  }

  /* Barres empilées. cats : [{lib, parts:[{v, classe}]}] */
  function grapheBarres(o) {
    var W = o.w, H = o.h, g = { l: 54, r: 10, t: 12, b: 30 }, n = o.cats.length;
    var max = Math.max.apply(null, o.cats.map(function (c) { return c.parts.reduce(function (s, p) { return s + Math.max(0, p.v); }, 0); }));
    var ty = graduations(0, max || 1, 4), ymax = ty[ty.length - 1];
    function Y(v) { return H - g.b - v / ymax * (H - g.t - g.b); }
    var bande = (W - g.l - g.r) / n, bw = Math.max(3, Math.min(34, bande * 0.66));
    NS_ID += 1;
    var tid = "cr-svg-t" + NS_ID, did = "cr-svg-d" + NS_ID;
    var s = '<svg class="cr-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-labelledby="' + tid + ' ' + did + '"><title id="' + tid + '">' + esc(o.titre) + '</title><desc id="' + did + '">' + esc(o.desc || "") + '</desc><g class="cr-axe">';
    ty.forEach(function (v) { s += '<line x1="' + g.l + '" x2="' + (W - g.r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (g.l - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fmtY || compact)(v)) + '</text>'; });
    var pasLib = Math.ceil(n / Math.max(1, Math.floor((W - g.l) / 38)));
    o.cats.forEach(function (c, i) { if (i % pasLib === 0) s += '<text x="' + (g.l + bande * (i + 0.5)).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(c.lib) + '</text>'; });
    s += '</g><g class="cr-barres">';
    o.cats.forEach(function (c, i) {
      var y0 = 0, x = g.l + bande * (i + 0.5) - bw / 2;
      c.parts.forEach(function (p) {
        if (!(p.v > 0)) return;
        var h = p.v / ymax * (H - g.t - g.b);
        s += '<rect class="cr-barre ' + p.classe + '" x="' + x.toFixed(1) + '" y="' + (Y(y0) - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, h).toFixed(1) + '" rx="2"><title>' + esc(c.titre || c.lib) + ' · ' + esc(p.nom || "") + ' : ' + esc(dt0(p.v)) + '</title></rect>';
        y0 += p.v;
      });
    });
    return s + '</g></svg>';
  }
  function legende(series) {
    return '<ul class="cr-legende cr-legende--graphe">' + series.map(function (s) { return '<li><i class="cr-point ' + s.classe + (s.pointille ? " cr-point--pointille" : "") + '" aria-hidden="true"></i><span>' + esc(s.nom) + '</span></li>'; }).join("") + '</ul>';
  }

  /* Dessin à la première apparition (trait qui se trace), une seule fois. */
  var observateur = window.IntersectionObserver ? new IntersectionObserver(function (entrees) {
    entrees.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      observateur.unobserve(el);
      el.classList.remove("cr-anim-attente");
      el.classList.add("cr-anim");
      setTimeout(function () { el.classList.remove("cr-anim"); }, 1300);
    });
  }, { threshold: 0.25 }) : null;
  function preparerDessin(el) {
    if (!el || el.getAttribute("data-dessine")) return;
    el.setAttribute("data-dessine", "1");
    if (!observateur || mouvementReduit.matches) { el.classList.remove("cr-anim-attente"); return; }
    el.classList.add("cr-anim-attente");
    observateur.observe(el);
  }

  function dessinUnique(corps, z) { if (corps.getAttribute("data-dessin")) return; corps.setAttribute("data-dessin", "1"); preparerDessin(z); }

  function rendreGraphe() {
    var d = S.dernier; if (!d) return;
    var zone = $("cr-gr-zone"), r = d.r, w = largeur(zone), h = hauteurGraphe();
    preparerDessin(zone);
    if (S.vueGraphe === "crd") {
      var pts = [[0, r.C]]; r.lignes.forEach(function (l) { pts.push([l.mois * r.p, MC.resteFin(l)]); });
      var series = [{ pts: pts, classe: "cr-serie--capital", aire: true, nom: "Capital restant dû" }];
      if (d.e.ras.length || d.e.versement) {
        var sans = MC.echeancier(Object.assign({}, d.e, { ras: [], versement: null }));
        var p2 = [[0, sans.C]]; sans.lignes.forEach(function (l) { p2.push([l.mois * sans.p, MC.resteFin(l)]); });
        series.push({ pts: p2, classe: "cr-serie--sans", pointille: true, nom: "Sans remboursement anticipé" });
      }
      var marq = r.reductions.map(function (x) { return { x: (x.mois - 1) * r.p, y: x.reste, lib: "Réduction de taux à l'échéance " + x.mois, classe: "cr-marqueur--reduction" }; });
      zone.innerHTML = grapheLignes({ w: w, h: h, series: series, marqueurs: marq, fmtY: compact, ticksX: ticksMois(Math.max(r.nPrevu * r.p, pts[pts.length - 1][0])), xmax: Math.max(pts[pts.length - 1][0], series[1] ? series[1].pts[series[1].pts.length - 1][0] : 0),
        titre: "Capital restant dû au fil du temps", desc: "Le capital restant dû part de " + dt0(r.C) + " et atteint zéro après " + dureeLib(r.n * r.p) + "." }) +
        legende(series.concat(marq.length ? [{ classe: "cr-point--reduction", nom: "Réduction de taux" }] : []));
      var mi = r.lignes[Math.min(r.lignes.length - 1, Math.floor(r.lignes.length / 2) - 1)];
      $("cr-gr-resume").textContent = "Vous empruntez " + dt0(r.C) + ". À mi-parcours (échéance " + (mi ? mi.mois : 1) + "), il reste " + dt0(mi ? MC.resteFin(mi) : r.C) + " à rembourser ; le crédit est soldé après " + dureeLib(r.n * r.p) + (r.reductions.length ? ", avec une réduction de taux dès l'échéance " + r.reductions[0].mois : "") + ".";
    } else {
      var an = MC.agregerAnnuel(r), dDeb = MC.lireDate(d.e.dateDebut);
      var cats = an.map(function (a) {
        var lib = a.debut ? String(a.debut.getFullYear()) : "an " + a.annee;
        return { lib: dDeb ? lib : String(a.annee), titre: "Année " + a.annee + (a.debut ? " (" + moisAnC(a.debut) + " – " + moisAnC(a.fin) + ")" : ""),
          parts: [{ v: a.principal, classe: "cr-serie--capital", nom: "Capital" }, { v: a.interet, classe: "cr-serie--interet", nom: "Intérêts" }, { v: a.assurance, classe: "cr-serie--assurance", nom: "Assurance" }] };
      });
      var series2 = [{ classe: "cr-serie--capital", nom: "Capital remboursé" }, { classe: "cr-serie--interet", nom: "Intérêts" }];
      if (r.totAss) series2.push({ classe: "cr-serie--assurance", nom: "Assurance" });
      var bascule = an.filter(function (a) { return a.principal >= a.interet; })[0];
      zone.innerHTML = grapheBarres({ w: w, h: h, cats: cats, titre: "Intérêts et capital remboursés chaque année", desc: "Barres empilées par année : capital remboursé, intérêts" + (r.totAss ? " et assurance" : "") + "." }) + legende(series2);
      $("cr-gr-resume").textContent = "La 1re année, vous payez " + dt0(an[0].interet) + " d'intérêts pour " + dt0(an[0].principal) + " de capital. " +
        (bascule ? "Le capital remboursé dépasse les intérêts à partir de l'année " + bascule.annee + "." : "Les intérêts restent supérieurs au capital remboursé chaque année.");
    }
  }

  /* ===================================================================
     Tableau d'amortissement
     =================================================================== */
  function rendreTableau() {
    var d = S.dernier; if (!d) return;
    var r = d.r, t = $("cr-tableau"), avecAss = r.totAss > 0, info = MC.infoPeriodicite(r.p), h;
    if (S.vueTableau === "annuel") {
      var an = MC.agregerAnnuel(r);
      h = '<caption>Tableau d\'amortissement par année · ' + pluriel(an.length, "année") + ' · montants en dinars</caption><thead><tr><th scope="col">Année</th><th scope="col">Période</th><th scope="col">Payé</th><th scope="col">Intérêts</th><th scope="col">Capital</th>' + (avecAss ? '<th scope="col">Assurance</th>' : "") + '<th scope="col">Restant dû</th></tr></thead><tbody>' +
        an.map(function (a) {
          return '<tr' + (a.reduit ? ' class="cr-ligne-reduite"' : "") + '><th scope="row">' + a.annee + '</th><td>' + (a.debut ? moisAnC(a.debut) + " – " + moisAnC(a.fin) : pluriel(a.nb, "échéance")) + '</td><td>' + F.dt3(a.paiement) + '</td><td>' + F.dt3(a.interet) + '</td><td>' + F.dt3(a.principal) + (a.ra ? ' <span class="cr-badge">RA</span>' : "") + '</td>' + (avecAss ? '<td>' + F.dt3(a.assurance) + '</td>' : "") + '<td>' + F.dt3(a.reste) + '</td></tr>';
        }).join("") + '</tbody>';
    } else {
      h = '<caption>Tableau d\'amortissement · ' + pluriel(r.n, info.echeance.toLowerCase()) + ' · montants en dinars</caption><thead><tr><th scope="col">N°</th><th scope="col">Date</th><th scope="col">' + info.echeance + '</th><th scope="col">Intérêts</th><th scope="col">Capital</th>' + (avecAss ? '<th scope="col">Assurance</th>' : "") + '<th scope="col">Restant dû</th></tr></thead><tbody>' +
        r.lignes.map(function (l) {
          var marques = (l.differe ? ' <span class="cr-badge">différé</span>' : "") + (l.reduction ? ' <span class="cr-badge cr-badge--ok">taux ÷ 2</span>' : "") + (l.revise ? ' <span class="cr-badge">TMM révisé</span>' : "");
          var ligne = '<tr' + (l.reduit ? ' class="cr-ligne-reduite"' : "") + '><th scope="row">' + l.mois + '</th><td>' + (l.date ? moisAnC(l.date) : "—") + marques + '</td><td>' + F.dt3(l.paiement) + '</td><td>' + F.dt3(l.interet) + '</td><td>' + F.dt3(l.principal) + '</td>' + (avecAss ? '<td>' + F.dt3(l.assurance) + '</td>' : "") + '<td>' + F.dt3(l.reste) + '</td></tr>';
          if (l.ra) ligne += '<tr class="cr-ligne-ra"><th scope="row"><span class="cache">Après l\'échéance ' + l.mois + '</span></th><td colspan="2">Remboursement anticipé' + (l.ra.indemnite ? " (indemnité " + F.dt3(l.ra.indemnite) + ")" : "") + '</td><td></td><td>' + F.dt3(l.ra.montant) + '</td>' + (avecAss ? '<td></td>' : "") + '<td>' + F.dt3(l.ra.reste) + '</td></tr>';
          return ligne;
        }).join("") + '</tbody>';
    }
    h += '<tfoot><tr><th scope="row">Total</th><td></td><td>' + F.dt3(arr(r.totM - r.totRA - r.totIndem)) + '</td><td>' + F.dt3(r.totI) + '</td><td>' + F.dt3(r.totP) + '</td>' + (avecAss ? '<td>' + F.dt3(r.totAss) + '</td>' : "") + '<td></td></tr></tfoot>';
    t.innerHTML = h;
  }

  /* ===================================================================
     Exports : CSV, impression, résumé, téléchargements
     =================================================================== */
  function telecharger(nom, contenu, type) {
    var blob = new Blob([contenu], { type: type }), url = URL.createObjectURL(blob), a = doc.createElement("a");
    a.href = url; a.download = nom; a.hidden = true;
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function csvNb(v) { return String(arr(v)).replace(".", ","); }
  function exporterCsv() {
    var d = S.dernier; if (!d) return;
    var r = d.r, l0 = [["N°", "Date", "Échéance", "Intérêts", "Capital amorti", "Assurance", "Remboursement anticipé", "Capital restant dû"]];
    r.lignes.forEach(function (l) {
      l0.push([l.mois, l.date ? iso(l.date) : "", csvNb(l.paiement), csvNb(l.interet), csvNb(l.principal), csvNb(l.assurance), l.ra ? csvNb(l.ra.montant) : "", csvNb(MC.resteFin(l))]);
    });
    l0.push([]);
    l0.push(["Total", "", csvNb(arr(r.totM - r.totRA - r.totIndem)), csvNb(r.totI), csvNb(r.totP), csvNb(r.totAss), csvNb(r.totRA), ""]);
    l0.push(["TEG (%)", isFinite(r.teg) ? csvNb(r.teg) : ""]);
    var txt = "﻿" + l0.map(function (x) { return x.join(";"); }).join("\r\n");
    telecharger("echeancier-credit-" + Math.round(r.C) + "dt-" + r.n * r.p + "mois.csv", txt, "text/csv;charset=utf-8");
    toast("Échéancier exporté au format CSV.");
  }
  function texteResume() {
    var d = S.dernier; if (!d) return "";
    var e = d.e, r = d.r, info = MC.infoPeriodicite(r.p);
    var l = [nomScenario(d.sc), "",
      "Montant emprunté : " + dt(r.C),
      "Durée : " + dureeLib(e.mois) + " (" + pluriel(r.nPrevu, "échéance") + ")",
      "Taux : " + (e.tmm ? "TMM " + pc(e.tmm.tmm, 3) + (e.tmm.marge < 0 ? " − " : " + ") + nombre(Math.abs(e.tmm.marge), 3) + " points = " : "") + pc(e.taux, 3),
      info.echeance + " : " + dt(premiereEcheance(r)) + (r.totAss ? " (assurance comprise)" : ""),
      "Intérêts totaux : " + dt(r.totI),
      "Coût total du crédit : " + dt(r.coutCredit),
      "TEG : " + pc(r.teg, 2)];
    var der = r.lignes[r.lignes.length - 1];
    if (der.date) l.push("Dernière échéance : " + moisAn(der.date));
    if (r.reductions.length) l.push("Réduction de taux (règle des 8 %) dès l'échéance " + r.reductions[0].mois);
    l.push("", "Simulation indicative réalisée avec Orbite.");
    return l.join("\n");
  }
  function copierTexte(txt, message) {
    function repli() {
      var ta = doc.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.className = "cache";
      doc.body.appendChild(ta); ta.select();
      var ok = false; try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? message : "Copie impossible : sélectionnez le texte à la main.", ok ? undefined : { erreur: true });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(message); }, repli);
    else repli();
  }

  /* ===================================================================
     Outils avancés
     =================================================================== */
  function lireC(corps, c) {
    var el = corps.querySelector('[data-c="' + c + '"]');
    if (!el) return NaN;
    if (el.type === "radio") { var x = corps.querySelector('[data-c="' + c + '"]:checked'); return x ? x.value : null; }
    var r = lireChamp(el);
    return r.ok ? r.v : NaN;
  }
  function poserC(corps, c, v) {
    var els = corps.querySelectorAll('[data-c="' + c + '"]');
    Array.prototype.forEach.call(els, function (el) { ecrireChamp(el, v); });
  }
  function sortie(corps) { return corps.querySelector(".cr-outil__sortie"); }
  function d0() { return S.dernier; }
  function boutonAppliquer(lib, data) { return '<button type="button" class="bouton bouton--credit bouton--petit" data-appliquer=\'' + esc(JSON.stringify(data)) + '\'>' + ico("fleche") + esc(lib) + '</button>'; }
  function revenusProfil() { return { net: S.emp.net, brut: S.emp.brut, charges: S.emp.charges, age: S.emp.age }; }

  var OUTIL_FN = {
    capacite: {
      suit: false,
      html: function () {
        var d = d0(), e = d.e, rp = revenusProfil();
        return '<div class="cr-grille-champs">' +
          champ({ c: "net", lib: "Revenu net mensuel", unite: "DT", valeur: saisieNb(rp.net), min: 0, max: 1e7 }) +
          champ({ c: "brut", lib: "Revenu brut mensuel", unite: "DT", valeur: saisieNb(rp.brut), min: 0, max: 1e7 }) +
          champ({ c: "charges", lib: "Mensualités en cours", unite: "DT", valeur: saisieNb(rp.charges), min: 0, max: 1e7 }) +
          champ({ c: "age", t: "entier", lib: "Âge", unite: "ans", valeur: rp.age, min: 18, max: 80 }) +
          champ({ c: "ans", t: "entier", lib: "Durée souhaitée", unite: "ans", valeur: Math.max(1, Math.round(e.mois / 12)), min: 1, max: 25 }) +
          champ({ c: "taux", t: "taux", lib: "Taux annuel", unite: "%", valeur: formater("taux", e.taux), min: 0, max: 100 }) +
          champ({ c: "qn", t: "taux", lib: "Quotité sur le net", unite: "%", valeur: formater("taux", S.emp.quotiteNet * 100), min: 10, max: 80 }) +
          champ({ c: "qb", t: "taux", lib: "Quotité sur le brut", unite: "%", valeur: formater("taux", S.emp.quotiteBrut * 100), min: 10, max: 80 }) +
          '</div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var o = { revenuNet: lireC(c, "net"), revenuBrut: lireC(c, "brut"), charges: lireC(c, "charges") || 0, dureeMois: lireC(c, "ans") * 12, tauxAnnuelPct: lireC(c, "taux"), ageActuel: lireC(c, "age"), ageMax: AGE_MAX };
        if (![o.dureeMois, o.tauxAnnuelPct].every(isFinite)) return;
        var res = ["net", "brut"].map(function (b) { return MC.capaciteEmprunt(Object.assign({}, o, { base: b, quotite: (b === "net" ? lireC(c, "qn") : lireC(c, "qb")) / 100 })); });
        var meilleure = res[1].capital > res[0].capital ? 1 : 0;
        sortie(c).innerHTML = '<div class="cr-duo">' + res.map(function (x, i) {
          var titre = i === 0 ? "Banque qui calcule sur le net" : "Banque qui calcule sur le brut";
          var corps;
          if (!x.valide) corps = '<p class="cr-texte">Renseignez le revenu ' + (i === 0 ? "net" : "brut") + '.</p>';
          else if (x.motif === "charges-trop-elevees") corps = '<p class="cr-texte">Vos mensualités en cours dépassent déjà ' + pc(x.quotite * 100, 0) + ' de ce revenu.</p>';
          else if (x.motif === "age-max-atteint") corps = '<p class="cr-texte">L\'âge maximal en fin de crédit (' + AGE_MAX + ' ans) est déjà atteint.</p>';
          else corps = '<p class="cr-carte__grand chiffre">' + dt0(x.capital) + '</p>' +
            stat("Mensualité maximale", dt(x.mensualiteMax), pc(x.quotite * 100, 0) + " de " + dt0(x.revenu) + (x.charges ? " − " + dt0(x.charges) : "")) +
            stat("Durée retenue", dureeLib(x.dureeMois), x.dureeLimiteeParAge ? "Limitée par l'âge (" + AGE_MAX + " ans en fin de crédit)" : (x.horsLimite ? "Plus de 25 ans : rarement accepté" : "")) +
            (x.capital > 0 && x.dureeMois <= 300 ? boutonAppliquer("Simuler ce montant", { capital: Math.floor(x.capital / 100) * 100, mois: x.dureeMois, taux: o.tauxAnnuelPct }) : "");
          return '<div class="cr-carte' + (i === meilleure && res[0].capital !== res[1].capital ? " cr-carte--mieux" : "") + '"><h3 class="cr-carte__titre">' + titre + (i === meilleure && res[0].capital !== res[1].capital && x.capital > 0 ? ' <span class="puce puce--credit">la plus favorable</span>' : "") + '</h3>' + corps + '</div>';
        }).join("") + '</div>';
      }
    },

    inverse: {
      suit: false,
      html: function () {
        var d = d0(), e = d.e;
        return bascule({ lib: "Valeur à trouver", c: "mode", options: [["capital", "Le capital"], ["duree", "La durée"], ["taux", "Le taux"]] }) +
          '<div class="cr-grille-champs cr-espace-haut">' +
          champ({ c: "m", lib: "Mensualité souhaitée", unite: "DT", valeur: saisieNb(Math.round(d.r.M1)), min: 1, max: 1e7 }) +
          champ({ c: "capital", lib: "Capital", unite: "DT", valeur: saisieNb(e.capital), min: 1, max: 1e8, cls: "cr-inv-capital" }) +
          champ({ c: "mois", t: "entier", lib: "Durée", unite: "mois", valeur: e.mois, min: 1, max: 300, cls: "cr-inv-mois" }) +
          champ({ c: "taux", t: "taux", lib: "Taux annuel", unite: "%", valeur: formater("taux", e.taux), min: 0, max: 100, cls: "cr-inv-taux" }) +
          '</div><p class="cr-texte cr-texte--doux">Calcul pour un crédit mensuel à échéances constantes, sans frais ni assurance.</p><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var mode = lireC(c, "mode") || "capital";
        c.setAttribute("data-mode", mode);
        var o = { mode: mode, mensualite: lireC(c, "m"), capital: lireC(c, "capital"), mois: lireC(c, "mois"), taux: lireC(c, "taux") };
        var r = MC.calculInverse(o), out = sortie(c);
        if (!r) { out.innerHTML = encart("", "info", "<p>Complétez les champs.</p>"); return; }
        if (r.erreur) {
          out.innerHTML = encart("alerte", "alerte", "<p>" + ({ "interets-non-couverts": "Cette mensualité ne couvre même pas les intérêts du premier mois (" + dt(r.interetsPremierMois) + ").", "plus-de-300-mois": "Il faudrait plus de 25 ans pour rembourser avec cette mensualité.", "mensualite-trop-faible": "Même sans intérêts, cette mensualité ne rembourse pas le capital sur cette durée.", "taux-superieur-100": "Le taux trouvé dépasserait 100 %." })[r.erreur] + "</p>");
          return;
        }
        var principal = mode === "capital" ? stat("Capital empruntable", dt(r.capital), "Intérêts : " + dt(r.interets), "cr-stat--fort") :
          mode === "duree" ? stat("Durée nécessaire", dureeLib(r.mois), pluriel(r.mois, "mensualité") + " de " + dt(r.mensualiteReelle), "cr-stat--fort") :
          stat("Taux correspondant", pc(r.taux, 3), "Mensualité exacte : " + dt(r.mensualiteReelle), "cr-stat--fort");
        out.innerHTML = '<div class="cr-stats">' + principal + '</div>' + boutonAppliquer("Utiliser dans mon scénario", { capital: r.capital, mois: r.mois, taux: r.taux });
      }
    },

    plan: {
      suit: false,
      prets: null,
      html: function () {
        var d = d0(), e = d.e;
        this.prets = [{ nom: "Prêt principal", capital: e.capital, mois: e.mois, taux: e.taux, differe: 0 }, { nom: "Prêt complémentaire", capital: 20000, mois: 84, taux: 9.5, differe: 0 }];
        return '<ul class="cr-prets" data-liste></ul><div class="cr-ligne-actions"><button type="button" class="bouton bouton--petit" data-plan-ajouter>' + ico("plus") + 'Ajouter un prêt</button>' +
          interrupteur({ lib: "Lisser la mensualité", aide: "Le prêt le plus long s'ajuste pour garder une mensualité globale constante.", c: "lisser" }) + '</div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      liste: function (c) {
        var self = this;
        c.querySelector("[data-liste]").innerHTML = self.prets.map(function (p, i) {
          return '<li class="cr-pret"><div class="cr-ra__tete"><strong>Prêt ' + (i + 1) + '</strong>' + (self.prets.length > 1 ? '<button type="button" class="bouton bouton--fantome bouton--icone bouton--petit" data-plan-retirer="' + i + '" aria-label="Retirer le prêt ' + (i + 1) + '">' + ico("poubelle") + '</button>' : "") + '</div><div class="cr-grille-champs cr-grille-champs--5">' +
            champ({ c: "nom-" + i, t: "texte", lib: "Nom", valeur: p.nom }) +
            champ({ c: "capital-" + i, lib: "Capital", unite: "DT", valeur: saisieNb(p.capital), min: 1, max: 1e8 }) +
            champ({ c: "mois-" + i, t: "entier", lib: "Durée", unite: "mois", valeur: p.mois, min: 1, max: 300 }) +
            champ({ c: "taux-" + i, t: "taux", lib: "Taux", unite: "%", valeur: formater("taux", p.taux), min: 0, max: 100 }) +
            champ({ c: "differe-" + i, t: "entier", lib: "Différé partiel", unite: "mois", valeur: p.differe, min: 0, max: 299 }) +
          '</div></li>';
        }).join("");
      },
      lire: function (c) {
        this.prets = this.prets.map(function (p, i) {
          return { nom: (c.querySelector('[data-c="nom-' + i + '"]') || {}).value || p.nom, capital: lireC(c, "capital-" + i), mois: lireC(c, "mois-" + i), taux: lireC(c, "taux-" + i), differe: lireC(c, "differe-" + i) || 0 };
        });
      },
      calc: function (c) {
        if (!c.querySelector(".cr-pret")) this.liste(c);
        this.lire(c);
        var r = MC.planFinancement(this.prets, { lisser: lireC(c, "lisser") === true || (c.querySelector('[data-c="lisser"]') || {}).checked }), out = sortie(c);
        if (!r) { out.innerHTML = encart("", "info", "<p>Complétez au moins un prêt.</p>"); return; }
        var noms = r.prets.map(function (p) { return p.nom; });
        var msg = r.messageLissage === "differe-principal" ? "Lissage impossible : le prêt le plus long a un différé." : r.messageLissage === "lissage-impossible" ? "Lissage impossible : les autres prêts dépassent à eux seuls la mensualité lissée." : "";
        out.innerHTML = '<div class="cr-stats">' + stat("Capital total", dt(r.capitalTotal)) + stat("Intérêts totaux", dt(r.totI), r.lissage ? "Surcoût du lissage : " + dt(r.lissage.surcout) : "") + stat("Durée totale", dureeLib(r.nMax)) + (r.lissage ? stat("Mensualité lissée", dt(r.lissage.T)) : "") + '</div>' +
          (msg ? encart("alerte", "alerte", "<p>" + msg + "</p>") : "") + (r.ignores ? encart("", "info", "<p>" + pluriel(r.ignores, "prêt incomplet ignoré", "prêts incomplets ignorés") + ".</p>") : "") +
          '<div class="tableau-cadre" role="region" aria-label="Paliers de mensualité" tabindex="0"><table class="tableau"><caption>Mensualité globale par palier</caption><thead><tr><th scope="col">Mois</th><th scope="col">Total</th>' + noms.map(function (n) { return '<th scope="col">' + esc(n) + '</th>'; }).join("") + '</tr></thead><tbody>' +
          r.paliers.map(function (p) { return '<tr><th scope="row">' + (p.debut === p.fin ? p.debut : p.debut + " à " + p.fin) + '</th><td><strong>' + F.dt3(p.total) + '</strong></td>' + p.det.map(function (x) { return '<td>' + F.dt3(x) + '</td>'; }).join("") + '</tr>'; }).join("") +
          '</tbody></table></div>';
      }
    },

    offres: {
      suit: true,
      html: function () {
        var e = d0().e;
        var base = [["Banque A", e.taux, 1, 0, 0.4], ["Banque B", MC.arrondi6(e.taux - 0.25), 1.5, 0, 0.5], ["Banque C", MC.arrondi6(e.taux + 0.25), 0.5, 0, 0.35]];
        return '<p class="cr-texte cr-texte--doux" data-offres-base></p><div class="cr-offres">' + base.map(function (b, i) {
          return '<fieldset class="cr-offre"><legend>Offre ' + (i + 1) + '</legend><div class="cr-grille-champs cr-grille-champs--offre">' +
            champ({ c: "nom-" + i, t: "texte", lib: "Banque", valeur: b[0] }) +
            champ({ c: "taux-" + i, t: "taux", lib: "Taux", unite: "%", valeur: formater("taux", b[1]), min: 0, max: 100 }) +
            champ({ c: "fdp-" + i, t: "taux", lib: "Frais de dossier", unite: "%", valeur: formater("taux", b[2]), min: 0, max: 10 }) +
            champ({ c: "ff-" + i, lib: "Frais fixes", unite: "DT", valeur: saisieNb(b[3]), min: 0, max: 1e6 }) +
            champ({ c: "as-" + i, t: "taux", lib: "Assurance", unite: "%/an", valeur: formater("taux", b[4]), min: 0, max: 10 }) +
            selection({ c: "ab-" + i, lib: "Base assurance", options: [["initial", "Capital initial"], ["crd", "Restant dû"]] }) +
          '</div></fieldset>';
        }).join("") + '</div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var e = d0().e, offres = [];
        c.querySelector("[data-offres-base]").textContent = "Pour " + dt0(e.capital) + " sur " + dureeLib(e.mois) + " (repris de votre scénario).";
        for (var i = 0; i < 3; i++) offres.push({ nom: (c.querySelector('[data-c="nom-' + i + '"]') || {}).value || "Offre " + (i + 1), taux: lireC(c, "taux-" + i), fraisDossierPct: lireC(c, "fdp-" + i) || 0, fraisFixes: lireC(c, "ff-" + i) || 0, assurancePct: lireC(c, "as-" + i) || 0, assuranceBase: (c.querySelector('[data-c="ab-' + i + '"]') || {}).value });
        var r = MC.comparerOffres({ capital: e.capital, mois: e.mois, offres: offres }), out = sortie(c);
        if (!r) { out.innerHTML = ""; return; }
        out.innerHTML = '<div class="tableau-cadre" role="region" aria-label="Comparatif des offres" tabindex="0"><table class="tableau"><caption>Offres classées par coût du crédit</caption><thead><tr><th scope="col">Offre</th><th scope="col">Mensualité</th><th scope="col">Avec assurance</th><th scope="col">Intérêts</th><th scope="col">Assurance</th><th scope="col">Frais</th><th scope="col">Coût du crédit</th><th scope="col">TEG</th></tr></thead><tbody>' +
          r.offres.slice().sort(function (a, b) { return a.coutCredit - b.coutCredit; }).map(function (o) {
            var best = o === r.meilleure;
            return '<tr' + (best ? ' class="cr-ligne-meilleure"' : "") + '><th scope="row">' + esc(o.nom) + (best ? ' <span class="puce puce--succes">la moins chère</span>' : "") + '</th><td>' + F.dt3(o.mensualite) + '</td><td>' + F.dt3(o.mensualiteAvecAssurance) + '</td><td>' + F.dt3(o.interets) + '</td><td>' + F.dt3(o.coutAssurance) + '</td><td>' + F.dt3(o.frais) + '</td><td><strong>' + F.dt3(o.coutCredit) + '</strong></td><td>' + pc(o.teg, 2) + '</td></tr>';
          }).join("") + '</tbody></table></div>' +
          (r.economie != null ? '<p class="cr-texte"><strong>' + esc(r.meilleure.nom) + '</strong> vous fait économiser <strong>' + dt(r.economie) + '</strong> par rapport à ' + esc(r.seconde.nom) + '.</p>' : "") +
          boutonAppliquer("Reprendre l'offre la moins chère", { taux: r.meilleure.entree.taux, frais: r.meilleure.entree.frais, assurance: r.meilleure.entree.assurance });
      }
    },

    reneg: {
      suit: false,
      html: function () {
        return selectCredits() + '<div class="cr-grille-champs">' +
          champ({ c: "crd", lib: "Capital restant dû", unite: "DT", valeur: saisieNb(80000), min: 1, max: 1e8 }) +
          champ({ c: "ta", t: "taux", lib: "Taux actuel", unite: "%", valeur: formater("taux", 11), min: 0, max: 100 }) +
          champ({ c: "n", t: "entier", lib: "Mois restants", unite: "mois", valeur: 180, min: 1, max: 300 }) +
          champ({ c: "tn", t: "taux", lib: "Nouveau taux", unite: "%", valeur: formater("taux", 9.5), min: 0, max: 100 }) +
          champ({ c: "nn", t: "entier", lib: "Nouvelle durée", unite: "mois", valeur: 180, min: 1, max: 300 }) +
          champ({ c: "ind", t: "taux", lib: "Indemnité de remboursement", unite: "% du CRD", valeur: "3", min: 0, max: 20 }) +
          champ({ c: "fd", lib: "Frais de dossier", unite: "DT", valeur: saisieNb(300), min: 0, max: 1e6 }) +
          champ({ c: "fg", lib: "Frais de garantie", unite: "DT", valeur: saisieNb(500), min: 0, max: 1e6 }) +
          '</div>' + interrupteur({ lib: "Financer les frais dans le nouveau crédit", c: "financer" }) + '<div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var o = { crd: lireC(c, "crd"), tauxActuel: lireC(c, "ta"), moisRestants: lireC(c, "n"), nouveauTaux: lireC(c, "tn"), nouvelleDuree: lireC(c, "nn"), indemnitePct: lireC(c, "ind") || 0, fraisDossier: lireC(c, "fd") || 0, fraisGarantie: lireC(c, "fg") || 0, financer: !!(c.querySelector('[data-c="financer"]') || {}).checked };
        var r = MC.renegociation(o), out = sortie(c);
        if (!r) { out.innerHTML = encart("", "info", "<p>Complétez les champs.</p>"); return; }
        out.innerHTML = encart(r.rentable ? "succes" : "alerte", r.rentable ? "valide" : "alerte", "<p><strong>" + (r.rentable ? "Opération rentable" : "Opération non rentable") + "</strong> : " + (r.rentable ? "vous économisez " + dt(r.economie) + " au total, frais compris." : "elle vous coûterait " + dt(-r.economie) + " de plus, frais compris.") + "</p>" + (r.dureePlusLongue ? "<p>La nouvelle durée est plus longue : la mensualité baisse, mais vous payez plus longtemps.</p>" : "")) +
          '<div class="cr-stats">' + stat("Mensualité actuelle", dt(r.actuel.M1)) + stat("Nouvelle mensualité", dt(r.nouveau.M1), signe(-r.gainMensuel) + " par mois") + stat("Coût de l'opération", dt(r.cout), o.financer ? "financé dans le crédit" : "payé à part") + stat("Point mort", r.pointMort ? pluriel(r.pointMort, "mois", "mois") : "—", r.pointMort ? "Les frais sont remboursés par le gain mensuel après ce délai." : "") + stat("Total restant à payer", dt(r.totalActuel), "aujourd'hui") + stat("Total après opération", dt(r.totalNouveau), "frais compris") + '</div>';
      }
    },

    stress: {
      suit: true,
      html: function () {
        var e = d0().e, tmm = e.tmm ? e.tmm.tmm : TMM_REF, marge = e.tmm ? e.tmm.marge : Math.max(0, MC.arrondi6(e.taux - TMM_REF));
        var seuil = S.emp.net > 0 ? Math.max(0, S.emp.net * S.emp.quotiteNet - S.emp.charges) : 0;
        return '<p class="cr-texte cr-texte--doux" data-stress-base></p><div class="cr-grille-champs">' +
          champ({ c: "tmm", t: "taux", lib: "TMM de départ", unite: "%", valeur: formater("taux", tmm), min: 0, max: 30 }) +
          champ({ c: "marge", t: "taux", lib: "Marge", unite: "points", valeur: formater("taux", marge), min: 0, max: 20 }) +
          champ({ c: "vol", t: "taux", lib: "Volatilité annuelle", unite: "points", valeur: "0,5", min: 0, max: 5, aide: "Écart-type de la variation du TMM d'une année à l'autre." }) +
          champ({ c: "tend", t: "signe", lib: "Tendance annuelle", unite: "points", valeur: "0", min: -3, max: 3 }) +
          champ({ c: "plancher", t: "taux", lib: "TMM plancher", unite: "%", valeur: "3", min: 0, max: 30 }) +
          champ({ c: "seuil", lib: "Mensualité à ne pas dépasser", unite: "DT", valeur: saisieNb(Math.round(seuil)), min: 0, max: 1e7, aide: "Par défaut : votre capacité de remboursement." }) +
          '</div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var e = d0().e;
        c.querySelector("[data-stress-base]").textContent = "Pour " + dt0(e.capital) + " sur " + dureeLib(e.mois) + ", mensualité recalculée chaque année (1 000 trajectoires, tirage reproductible).";
        var o = { capital: e.capital, mois: e.mois, tmm: lireC(c, "tmm"), marge: lireC(c, "marge"), volatilite: lireC(c, "vol"), tendance: lireC(c, "tend") || 0, plancher: lireC(c, "plancher") || 0, seuil: lireC(c, "seuil") || Infinity, n: 1000 };
        if (![o.tmm, o.marge, o.volatilite].every(isFinite)) return;
        var r = MC.monteCarloTmm(o), out = sortie(c);
        var annees = r.bandes.length, ptsAn = function (k) { return r.bandes.map(function (b, i) { return [i, b[k]]; }); };
        out.innerHTML = '<div class="cr-stats">' + stat("Intérêts (médiane)", dt0(r.interetsMedian), "Sans variation : " + dt0(r.interetsSansVariation)) + stat("Intérêts (pire 5 %)", dt0(r.interetsP95)) + stat("Mensualité max (médiane)", dt0(r.mensualiteMaxMediane)) + stat("Mensualité max (9 cas sur 10)", dt0(r.mensualiteMaxP90)) +
          (isFinite(o.seuil) ? stat("Risque de dépasser " + dt0(o.seuil), pc(r.probaDepasse * 100, 1), "des trajectoires", r.probaDepasse > 0.1 ? "cr-stat--alerte" : "") : "") + '</div>' +
          '<div class="cr-graphe cr-graphe--outil" data-g></div><p class="cr-graphe__resume">Dans 9 cas sur 10, le TMM resterait entre ' + pc(r.bandes[annees - 1].p5, 2) + ' et ' + pc(r.bandes[annees - 1].p95, 2) + ' la dernière année (médiane ' + pc(r.bandes[annees - 1].p50, 2) + ').</p>';
        var z = out.querySelector("[data-g]");
        z.innerHTML = grapheLignes({ w: largeur(z), h: hauteurGraphe(), bandes: [{ haut: ptsAn("p95"), bas: ptsAn("p5"), classe: "cr-bande--large" }, { haut: ptsAn("p75"), bas: ptsAn("p25"), classe: "cr-bande--etroite" }], series: [{ pts: ptsAn("p50"), classe: "cr-serie--capital", nom: "TMM médian" }],
          fmtY: function (v) { return nombre(v, 1) + " %"; }, fmtX: function (v) { return "an " + Math.round(v); }, ymin: Math.max(0, Math.floor(Math.min.apply(null, r.bandes.map(function (b) { return b.p5; })) - 1)),
          titre: "Évolution possible du TMM", desc: "Bandes de centiles du TMM simulé année par année : 5 à 95 % et 25 à 75 %, avec la médiane." }) +
          legende([{ classe: "cr-serie--capital", nom: "TMM médian" }, { classe: "cr-bande--etroite", nom: "1 cas sur 2" }, { classe: "cr-bande--large", nom: "9 cas sur 10" }]);
        dessinUnique(c, z);
      }
    },

    louer: {
      suit: false,
      html: function () {
        var d = d0(), e = d.e, prix = e.apport ? e.apport.prix : Math.round(e.capital * 1.25), ap = e.apport ? e.apport.apport : prix - e.capital;
        return '<div class="cr-grille-champs">' +
          champ({ c: "prix", lib: "Prix du logement", unite: "DT", valeur: saisieNb(prix), min: 1, max: 1e8 }) +
          champ({ c: "apport", lib: "Apport", unite: "DT", valeur: saisieNb(ap), min: 0, max: 1e8 }) +
          champ({ c: "frais", t: "taux", lib: "Frais d'achat", unite: "% du prix", valeur: "6", min: 0, max: 30, aide: "Enregistrement, notaire, conservation foncière…" }) +
          champ({ c: "taux", t: "taux", lib: "Taux du crédit", unite: "%", valeur: formater("taux", e.taux), min: 0, max: 100 }) +
          champ({ c: "ans", t: "entier", lib: "Durée du crédit", unite: "ans", valeur: borne(Math.round(e.mois / 12), 1, 30), min: 1, max: 30 }) +
          champ({ c: "charges", t: "taux", lib: "Charges du propriétaire", unite: "%/an", valeur: "1", min: 0, max: 10 }) +
          champ({ c: "loyer", lib: "Loyer équivalent", unite: "DT/mois", valeur: saisieNb(Math.round(prix * 0.045 / 12)), min: 1, max: 1e6 }) +
          champ({ c: "hl", t: "taux", lib: "Hausse des loyers", unite: "%/an", valeur: "5", min: 0, max: 30 }) +
          champ({ c: "hb", t: "signe", lib: "Revalorisation du bien", unite: "%/an", valeur: "3", min: -20, max: 30 }) +
          champ({ c: "rend", t: "taux", lib: "Rendement de l'épargne", unite: "%/an", valeur: "6", min: 0, max: 30 }) +
          '</div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var o = { prix: lireC(c, "prix"), apport: lireC(c, "apport"), fraisPct: lireC(c, "frais"), taux: lireC(c, "taux"), ans: lireC(c, "ans"), chargesPct: lireC(c, "charges"), loyer: lireC(c, "loyer"), hausseLoyerPct: lireC(c, "hl"), revalorisationPct: lireC(c, "hb"), rendementPct: lireC(c, "rend") };
        var r = MC.louerOuAcheter(o), out = sortie(c);
        if (!r) { out.innerHTML = encart("", "info", "<p>Vérifiez les champs : l'apport doit être inférieur au prix.</p>"); return; }
        var ach = r.points.map(function (p) { return [p.an, p.achat]; }), loc = r.points.map(function (p) { return [p.an, p.location]; });
        out.innerHTML = encart(r.verdict === "acheter" ? "succes" : "", r.verdict === "acheter" ? "maison" : "info", "<p><strong>" + (r.verdict === "acheter" ? "Acheter est plus avantageux" : "Louer est plus avantageux") + "</strong> sur " + pluriel(o.ans, "an") + " : écart de patrimoine de " + dt0(Math.abs(r.ecart)) + ".</p>" + (r.pointMort ? "<p>L'achat devient gagnant à partir de l'année " + r.pointMort + ".</p>" : "")) +
          '<div class="cr-stats">' + stat("Mensualité du crédit", dt(r.mensualite)) + stat("Patrimoine si achat", dt0(ach[ach.length - 1][1])) + stat("Patrimoine si location", dt0(loc[loc.length - 1][1])) + '</div>' +
          '<div class="cr-graphe cr-graphe--outil" data-g></div><p class="cr-graphe__resume">Patrimoine net chaque année : bien moins capital restant dû si vous achetez, épargne placée si vous louez.</p>';
        var z = out.querySelector("[data-g]");
        var series = [{ pts: ach, classe: "cr-serie--capital", nom: "Acheter" }, { pts: loc, classe: "cr-serie--interet", nom: "Louer et placer" }];
        z.innerHTML = grapheLignes({ w: largeur(z), h: hauteurGraphe(), series: series, fmtX: function (v) { return "an " + Math.round(v); }, titre: "Patrimoine : acheter ou louer", desc: "Deux courbes de patrimoine net année par année." }) + legende(series);
        dessinUnique(c, z);
      }
    },

    optim: {
      suit: false,
      html: function () {
        var d = d0(), e = d.e, prix = e.apport ? e.apport.prix : e.capital, apMax = e.apport ? e.apport.apport : 0;
        var budget = S.emp.net > 0 ? Math.max(0, S.emp.net * S.emp.quotiteNet - S.emp.charges) : Math.round(d.r.M1);
        return '<div class="cr-grille-champs">' +
          champ({ c: "prix", lib: "Montant du projet", unite: "DT", valeur: saisieNb(prix), min: 1, max: 1e8 }) +
          champ({ c: "apMax", lib: "Apport maximal", unite: "DT", valeur: saisieNb(apMax), min: 0, max: 1e8 }) +
          champ({ c: "budget", lib: "Mensualité maximale", unite: "DT", valeur: saisieNb(Math.round(budget)), min: 1, max: 1e7 }) +
          champ({ c: "ep", lib: "Épargne mensuelle possible", unite: "DT", valeur: "0", min: 0, max: 1e7, aide: "Sert à des remboursements anticipés annuels." }) +
          champ({ c: "taux", t: "taux", lib: "Taux", unite: "%", valeur: formater("taux", e.taux), min: 0, max: 100 }) +
          champ({ c: "ind", t: "taux", lib: "Indemnité de remboursement", unite: "%", valeur: formater("taux", e.indemnite || 0), min: 0, max: 20 }) +
          '</div>' + interrupteur({ lib: "Tenir compte de la réduction de taux (règle des 8 %)", c: "reduc", coche: true }) +
          '<div class="cr-ligne-actions"><button type="button" class="bouton bouton--plein bouton--petit" data-optim-lancer>' + ico("outils") + 'Chercher la meilleure stratégie</button></div><div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      auto: false,
      calc: function (c) {
        var e = d0().e;
        var o = { prix: lireC(c, "prix"), apportMax: lireC(c, "apMax") || 0, budget: lireC(c, "budget"), epargne: lireC(c, "ep") || 0, indemnite: lireC(c, "ind") || 0, taux: lireC(c, "taux"), reduction: !!(c.querySelector('[data-c="reduc"]') || {}).checked, dateDebut: e.dateDebut, assurance: e.assurance, frais: e.frais, actuel: { apport: e.apport ? e.apport.apport : 0, mois: e.mois } };
        var t0 = performance.now(), r = MC.optimiser(o), out = sortie(c), ms = Math.round(performance.now() - t0);
        if (r.erreur) { out.innerHTML = encart("alerte", "alerte", "<p>" + (r.erreur === "aucune-combinaison" ? "Aucune combinaison ne respecte cette mensualité maximale : augmentez le budget ou l'apport." : "Valeurs invalides : l'apport doit être inférieur au montant du projet.") + "</p>"); return; }
        function ligne(x, i) {
          return '<tr' + (i === 0 ? ' class="cr-ligne-meilleure"' : "") + '><th scope="row">' + (i === 0 ? '<span class="puce puce--succes">la moins chère</span>' : "Option " + (i + 1)) + '</th><td>' + pluriel(x.o.ans, "an") + (x.duree * 1 !== x.o.ans * 12 ? " <small>(soldé en " + dureeLib(x.duree) + ")</small>" : "") + '</td><td>' + dt0(x.o.apport) + '</td><td>' + (x.o.versement ? dt0(x.o.versement) + "/an" : "—") + '</td><td>' + F.dt3(x.M) + '</td><td><strong>' + dt0(x.cout) + '</strong></td><td>' + (x.red ? "oui" : "non") + '</td></tr>';
        }
        var m = r.meilleure;
        out.innerHTML = encart("succes", "valide", "<p>Meilleure stratégie : <strong>" + pluriel(m.o.ans, "an") + "</strong>, apport de " + dt0(m.o.apport) + (m.o.versement ? ", remboursement anticipé de " + dt0(m.o.versement) + " chaque année" : "") + " : coût de " + dt0(m.cout) + " pour une mensualité de " + dt(m.M) + ".</p>" +
            (r.economieVsActuel != null && r.economieVsActuel > 0 ? "<p>Soit " + dt0(r.economieVsActuel) + " de moins que votre scénario actuel.</p>" : "")) +
          '<div class="tableau-cadre" role="region" aria-label="Stratégies proposées" tabindex="0"><table class="tableau"><caption>Stratégies du meilleur compromis mensualité / coût</caption><thead><tr><th scope="col">Stratégie</th><th scope="col">Durée</th><th scope="col">Apport</th><th scope="col">Versement</th><th scope="col">Mensualité</th><th scope="col">Coût</th><th scope="col">Réduction</th></tr></thead><tbody>' + r.solutions.map(ligne).join("") + '</tbody></table></div>' +
          '<p class="cr-texte cr-texte--doux">' + r.tous.length + ' combinaisons calculées en ' + ms + ' ms. Un remboursement anticipé baisse les intérêts, donc aussi le ratio des 8 % : il peut retarder une réduction de taux, ce qui est pris en compte.</p>' +
          boutonAppliquer("Appliquer cette stratégie", { capital: m.C, mois: m.o.ans * 12, taux: o.taux, prix: o.prix, apport: m.o.apport, versement: m.o.versement, reduction: o.reduction });
      }
    },

    quand: {
      suit: true,
      k: null,
      html: function () {
        return '<div data-quand-corps></div><div class="cr-outil__sortie" aria-live="polite"></div>' +
          '<details class="cr-option cr-lettre" data-lettre><summary><span class="cr-option__icone">' + ico("crayon") + '</span><span class="cr-option__texte">Lettre à la banque<small>Demande de réduction de taux, remboursement anticipé ou tableau actualisé</small></span>' + ico("chevron", "chevron") + '</summary><div class="cr-option__corps">' +
            bascule({ lib: "Type de courrier", c: "type", options: [["reduction", "Réduction de taux"], ["ra", "Remboursement anticipé"], ["tableau", "Tableau actualisé"]] }) +
            '<div class="cr-grille-champs cr-espace-haut">' +
              champ({ c: "nom", t: "texte", lib: "Nom et prénom", placeholder: "Ex. Sami Ben Salah" }) +
              champ({ c: "banque", t: "texte", lib: "Banque et agence", placeholder: "Ex. agence Tunis Centre" }) +
              champ({ c: "num", t: "texte", lib: "N° du crédit", placeholder: "Ex. 0495950100470" }) +
              champ({ c: "ville", t: "texte", lib: "Ville", placeholder: "Ex. Tunis" }) +
            '</div><pre class="cr-lettre__texte" data-lettre-texte tabindex="0" aria-label="Aperçu de la lettre"></pre>' +
            '<div class="cr-ligne-actions"><button type="button" class="bouton bouton--petit" data-lettre-copier>' + ico("copier") + 'Copier le texte</button><button type="button" class="bouton bouton--petit" data-lettre-dl>' + ico("telecharger") + 'Télécharger (.txt)</button></div>' +
          '</div></details>';
      },
      calc: function (c) {
        var d = d0(), e = entree(d.sc, false), self = this;
        var q = MC.quandDemanderReduction(e, self.k), zone = c.querySelector("[data-quand-corps]"), out = sortie(c);
        self.dernier = q;
        if (!q.eligible) {
          zone.innerHTML = "";
          out.innerHTML = encart("", "info", "<p>" + (q.motif === "credit-trop-court" ? "Le crédit est trop court pour atteindre la 37e échéance." : "La règle des 8 % concerne les crédits mensuels de plus de 84 mois, à échéances constantes et sans différé. Allongez la durée ou changez les modalités du scénario.") + "</p>");
          self.lettre(c);
          return;
        }
        var n = q.base.n;
        if (!zone.querySelector("input")) {
          zone.innerHTML = '<div class="champ"><div class="cr-duree__tete"><label for="cr-quand-k">Demande à l\'échéance n°</label><output id="cr-quand-k-lib" for="cr-quand-k" class="chiffre"></output></div><input type="range" class="curseur" id="cr-quand-k" min="37" max="' + n + '" step="1" value="' + q.k + '" data-quand-k></div>';
        }
        var cur = zone.querySelector("[data-quand-k]");
        cur.max = String(n); cur.value = String(q.k);
        cur.style.setProperty("--p", ((q.k - 37) / Math.max(1, n - 37) * 100) + "%"); cur.style.setProperty("--c", "var(--credit)");
        $("cr-quand-k-lib").textContent = q.k + (q.date ? " · " + moisAn(q.date) : "");
        cur.setAttribute("aria-valuetext", "Échéance " + q.k + (q.date ? ", " + moisAn(q.date) : ""));
        out.innerHTML = '<div class="cr-stats">' + stat("Ratio à l'échéance " + q.k, pc(q.ratio, 2), q.recevable ? "Au-dessus de 8 % : demande recevable" : "8 % ou moins : demande refusée", q.recevable ? "cr-stat--ok" : "cr-stat--alerte") +
            stat("Mensualité actuelle", dt(q.mensualiteActuelle)) +
            (q.recevable ? stat("Nouvelle mensualité", dt(q.nouvelleMensualite)) + stat("Intérêts économisés", dt(q.economie), "", "cr-stat--fort") : stat("Prochaine date possible", q.prochaine ? "Échéance " + q.prochaine : "Aucune")) + '</div>' +
          '<div class="cr-graphe cr-graphe--outil" data-g></div><p class="cr-graphe__resume">' + (q.premiere ? "Première date possible : échéance " + q.premiere + (q.base.lignes[q.premiere - 1].date ? " (" + moisAn(q.base.lignes[q.premiere - 1].date) + ")" : "") + ". Plus la demande est tôt, plus l'économie est grande." : "Le ratio ne dépasse jamais strictement 8 % sur la durée du crédit.") + '</p>';
        var z = out.querySelector("[data-g]");
        z.innerHTML = grapheLignes({ w: largeur(z), h: hauteurGraphe(), series: [{ pts: q.ratios, classe: "cr-serie--interet", nom: "Ratio intérêts 36 mois / capital restant dû" }], seuil: 8, seuilLib: "8 %", zones: q.zones, curseurX: q.k, ymin: 0,
          fmtY: function (v) { return nombre(v, 1) + " %"; }, ticksX: graduations(37, n, 5).map(function (v) { return { v: v, lib: "n° " + Math.round(v) }; }), xmin: 37, xmax: n,
          titre: "Ratio de la règle des 8 %", desc: "Ratio des intérêts des 36 derniers mois sur le capital restant dû, à chaque échéance ; la réduction est possible au-dessus de 8 %." }) +
          legende([{ classe: "cr-serie--interet", nom: "Ratio" }, { classe: "cr-zone-leg", nom: "Zone où la demande est recevable" }]);
        self.lettre(c);
      },
      lettre: function (c) {
        var t = c.querySelector("[data-lettre-texte]"); if (!t) return;
        var type = lireC(c, "type") || "reduction", v = function (k) { var el = c.querySelector('[data-c="' + k + '"]'); return el && el.value.trim() ? el.value.trim() : "…"; };
        var q = this.dernier, d = d0(), num = v("num");
        var date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        var L = [v("nom"), "", "À l'attention de Madame, Monsieur le Directeur", v("banque"), "", v("ville") + ", le " + date, ""];
        if (type === "reduction") {
          var crd = q && q.eligible ? MC.resteFin(q.base.lignes[q.k - 2]) : NaN, int36 = q && q.eligible ? arr(q.ratio / 100 * crd) : NaN;
          L.push("Objet : demande de réduction du taux d'intérêt — crédit n° " + num, "Lettre recommandée avec accusé de réception", "", "Madame, Monsieur,", "",
            "Titulaire du crédit n° " + num + " contracté auprès de votre établissement, je vous prie de bien vouloir procéder à la réduction de moitié du taux d'intérêt appliqué, en application des dispositions de la loi n° 2024-41 du 2 août 2024 relatives aux crédits dont les intérêts payés au cours des trois dernières années dépassent 8 % du capital restant dû.", "",
            "Les conditions sont réunies, comme le montre le calcul établi à partir du tableau d'amortissement :",
            "- Intérêts payés sur les 36 derniers mois : " + (isFinite(int36) ? dt(int36) : "…"),
            "- Capital restant dû : " + (isFinite(crd) ? dt(crd) : "…"),
            "- Rapport intérêts / capital restant dû : " + (q && q.eligible ? pc(q.ratio, 3) : "…"),
            "- Taux actuel : " + pc(d.e.taux, 3) + " ; taux demandé : " + pc(d.e.taux / 2, 3), "",
            "Je vous remercie de bien vouloir m'adresser le nouveau tableau d'amortissement tenant compte de ce taux réduit, ainsi que la date de sa prise d'effet.");
        } else if (type === "ra") {
          var ra = d.e.ras[0];
          L.push("Objet : demande de remboursement anticipé — crédit n° " + num, "", "Madame, Monsieur,", "",
            "Je souhaite procéder à un remboursement anticipé " + (ra && !ra.total ? "partiel de " + dt(ra.montant) : "total") + " de mon crédit n° " + num + ".", "",
            "Je vous serais reconnaissant(e) de me communiquer le décompte détaillé de l'opération (capital, intérêts courus, indemnité éventuelle) ainsi que le nouveau tableau d'amortissement, " + (d.e.raMode === "mensualite" ? "en réduisant le montant des échéances et en conservant la durée." : "en réduisant la durée du crédit et en conservant le montant des échéances."));
        } else {
          L.push("Objet : demande de tableau d'amortissement actualisé — crédit n° " + num, "", "Madame, Monsieur,", "",
            "Je vous prie de bien vouloir m'adresser le tableau d'amortissement actualisé de mon crédit n° " + num + ", indiquant le taux appliqué, le capital restant dû et les échéances restantes, ainsi qu'un relevé des intérêts payés depuis l'origine du crédit.");
        }
        L.push("", "Dans l'attente de votre réponse, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.", "", v("nom"));
        t.textContent = L.join("\n");
      }
    },

    mon: {
      suit: false,
      html: function () {
        return selectCredits() + '<div class="cr-grille-champs">' +
          champ({ c: "capital", lib: "Capital restant dû au départ", unite: "DT", valeur: saisieNb(80000), min: 1, max: 1e8, aide: "Le capital restant dû juste avant l'échéance ci-dessous." }) +
          champ({ c: "date", t: "date", lib: "Date de cette échéance", valeur: premierMoisSuivant() }) +
          champ({ c: "mois", t: "entier", lib: "Échéances restantes", unite: "mois", valeur: 180, min: 1, max: 300 }) +
          champ({ c: "taux", t: "taux", lib: "Taux actuel", unite: "%", valeur: formater("taux", 10), min: 0, max: 99 }) +
          champ({ c: "duree", t: "entier", lib: "Durée initiale du crédit", unite: "mois", valeur: 240, min: 1, max: 480, aide: "Sert à la règle des 84 mois." }) +
          '</div>' + interrupteur({ lib: "Tenir compte de la réduction de taux (règle des 8 %)", c: "reduc", coche: true }) +
          '<div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var m = { capital: lireC(c, "capital"), date: (c.querySelector('[data-c="date"]') || {}).value, mois: lireC(c, "mois"), taux: lireC(c, "taux"), dureeTotale: lireC(c, "duree"), reduction: !!(c.querySelector('[data-c="reduc"]') || {}).checked };
        var r = MC.monCredit(m), out = sortie(c);
        if (!r) { out.innerHTML = encart("", "info", "<p>Complétez les champs (date au format jour/mois/année).</p>"); return; }
        var pr = r.prochaine;
        out.innerHTML = '<div class="cr-progression"><div class="cr-progression__barre" aria-hidden="true"><i data-p="' + r.pctRembourse + '"></i></div><p>' + pc(r.pctRembourse, 1) + ' du capital de départ remboursé</p></div>' +
          '<div class="cr-stats">' + stat("Capital restant dû aujourd'hui", dt(r.crd), "", "cr-stat--fort") + stat("Prochaine échéance", pr ? dt(MC.totalLigne(pr)) : "—", pr && pr.date ? moisAn(pr.date) : "") + stat("Échéances restantes", String(r.restantes)) + stat("Intérêts encore à payer", dt(r.interetsRestants)) + '</div>' +
          (r.reductions.length ? encart("succes", "valide", "<p>Réduction de taux possible dès l'échéance " + r.reductions[0].mois + (r.reductions[0].date ? " (" + moisAn(r.reductions[0].date) + ")" : "") + " : le taux passerait de " + pc(r.reductions[0].avant, 3) + " à " + pc(r.reductions[0].apres, 3) + ". Pensez à la demander.</p>") : (m.reduction && m.dureeTotale > 84 ? encart("", "info", "<p>Aucune réduction de taux à venir avec ce taux.</p>") : "")) +
          '<div class="cr-ligne-actions"><button type="button" class="bouton bouton--petit" data-vers-reneg>' + ico("hausse") + 'Étudier une renégociation</button>' +
          boutonAppliquer("Charger comme scénario", { capital: m.capital, mois: m.mois, taux: m.taux, dateDebut: m.date, type: "libre" }) + '</div>';
        var bar = out.querySelector("[data-p]"); if (bar) bar.style.setProperty("--p", Math.max(0, Math.min(100, r.pctRembourse)) + "%");
      }
    },

    sensib: {
      suit: true,
      html: function () { return '<div class="cr-outil__sortie" aria-live="polite"></div>'; },
      calc: function (c) {
        var d = d0(), e = entree(d.sc, false), out = sortie(c);
        if (!e.tmm) { out.innerHTML = encart("", "info", "<p>Votre scénario est à taux fixe : il ne bouge pas avec le TMM.</p>") + '<button type="button" class="bouton bouton--petit" data-passer-tmm>Passer en TMM + marge</button>'; return; }
        var lignes = MC.sensibiliteTmm(e);
        out.innerHTML = '<div class="tableau-cadre" role="region" aria-label="Sensibilité au TMM" tabindex="0"><table class="tableau"><caption>Si le TMM varie dès aujourd\'hui (marge de ' + nombre(e.tmm.marge, 3) + ' points)</caption><thead><tr><th scope="col">Variation du TMM</th><th scope="col">TMM</th><th scope="col">Taux</th><th scope="col">Mensualité</th><th scope="col">Écart</th><th scope="col">Intérêts totaux</th><th scope="col">Écart</th></tr></thead><tbody>' +
          lignes.map(function (l) { return '<tr' + (l.d === 0 ? ' class="cle"' : "") + '><th scope="row">' + (l.d === 0 ? "Aujourd'hui" : signe(l.d, function (x) { return nombre(x, 2); }) + " pt") + '</th><td>' + pc(l.tmm, 3) + '</td><td>' + pc(l.taux, 3) + '</td><td>' + F.dt3(l.M) + '</td><td>' + (l.d ? signe(l.dM, F.dt3) : "—") + '</td><td>' + F.dt3(l.I) + '</td><td>' + (l.d ? signe(l.dI, F.dt3) : "—") + '</td></tr>'; }).join("") +
          '</tbody></table></div><p class="cr-texte cr-texte--doux">Un point de TMM en plus coûte ' + dt(lignes.filter(function (l) { return l.d === 1; })[0].dM) + ' par mois et ' + dt0(lignes.filter(function (l) { return l.d === 1; })[0].dI) + ' d\'intérêts sur la durée.</p>';
      }
    },

    calendrier: {
      suit: true,
      html: function () { return '<div class="cr-outil__sortie" aria-live="polite"></div>'; },
      calc: function (c) {
        var d = d0(), r = d.r, out = sortie(c);
        if (!r.debut) { out.innerHTML = encart("", "info", "<p>Indiquez la date de la première échéance dans votre scénario pour dater le calendrier.</p>"); return; }
        var cal = MC.calendrier(r);
        out.innerHTML = '<p class="cr-texte cr-texte--doux">Plus la case est foncée, plus la part d\'intérêts de l\'échéance est grande. Le mois en cours est entouré.</p>' +
          '<div class="tableau-cadre cr-cal-cadre" role="region" aria-label="Calendrier des échéances" tabindex="0"><table class="cr-cal"><caption class="cache">Calendrier des échéances, part d\'intérêts par mois</caption><thead><tr><th scope="col">Année</th>' + MOIS_C.map(function (m) { return '<th scope="col">' + m + '</th>'; }).join("") + '</tr></thead><tbody>' +
          cal.map(function (a) {
            return '<tr><th scope="row">' + a.annee + '</th>' + a.cases.map(function (x, mo) {
              if (!x) return '<td class="cr-cal__vide"></td>';
              var niv = Math.min(4, Math.floor(x.part * 5));
              return '<td class="cr-cal__case" data-niv="' + niv + '"' + (x.courant ? ' data-courant="1"' : "") + '><span class="cache">' + MOIS[mo] + " " + a.annee + " : échéance " + x.mois + ", intérêts " + pc(x.part * 100, 0) + (x.ra ? ", remboursement anticipé" : "") + (x.reduction ? ", réduction de taux" : "") + '</span>' + (x.ra ? '<b aria-hidden="true">RA</b>' : x.reduction ? '<b aria-hidden="true">÷2</b>' : "") + '</td>';
            }).join("") + '</tr>';
          }).join("") + '</tbody></table></div>' +
          '<div class="cr-ligne-actions"><button type="button" class="bouton bouton--petit" data-ics>' + ico("telecharger") + 'Ajouter à mon agenda (.ics)</button></div>';
      }
    },

    va: {
      suit: true,
      html: function () { return '<div class="cr-grille-champs">' + champ({ c: "inf", t: "taux", lib: "Inflation annuelle", unite: "%", valeur: "5,5", min: 0, max: 50, aide: "Hausse moyenne des prix attendue sur la durée." }) + '</div><div class="cr-outil__sortie" aria-live="polite"></div>'; },
      calc: function (c) {
        var d = d0(), r = d.r, inf = lireC(c, "inf"), out = sortie(c);
        if (!isFinite(inf)) return;
        var va = MC.valeurActuelle(r, inf), nominal = arr(r.totM + r.frais);
        out.innerHTML = '<div class="cr-stats">' + stat("Total payé (en dinars courants)", dt(nominal)) + stat("Valeur actuelle", dt(va), "en dinars d'aujourd'hui", "cr-stat--fort") + stat("Effet de l'inflation", dt(arr(nominal - va))) + stat("Coût réel du crédit", dt(arr(va - r.C)), "valeur actuelle moins capital") + '</div>' +
          '<p class="cr-texte">Avec ' + pc(inf, 1) + ' d\'inflation par an, une échéance payée dans 10 ans pèse ' + pc(100 / Math.pow(1 + inf / 100, 10), 0) + ' de sa valeur d\'aujourd\'hui. ' + (va < r.C ? "Ici, l'inflation fait plus qu'effacer les intérêts : le crédit vous coûte moins que le capital reçu, en pouvoir d'achat." : "") + '</p>';
      }
    },

    audit: {
      suit: true,
      html: function () {
        return '<p class="cr-texte">Collez les lignes du tableau de votre banque (une échéance par ligne) ou importez un fichier CSV. Colonnes attendues, dans cet ordre : <strong>N° ; échéance ; intérêts ; capital amorti ; capital restant dû</strong>. Une date peut figurer sur la ligne, et des colonnes intermédiaires (assurance, TVA…) sont comptées comme frais accessoires.</p>' +
          '<p class="cr-texte cr-texte--doux">La comparaison se fait avec votre scénario actuel : renseignez d\'abord le capital, la durée, le taux et la date de votre crédit.</p>' +
          '<div class="champ"><label for="cr-audit-txt">Lignes du tableau bancaire</label><textarea id="cr-audit-txt" class="cr-zone-texte" rows="7" data-c="lignes" data-t="texte" spellcheck="false" placeholder="1 ; 01/11/2026 ; 1 447,530 ; 1 250,000 ; 197,530 ; 149 802,470"></textarea></div>' +
          '<div class="cr-ligne-actions"><label class="bouton bouton--petit cr-fichier">' + ico("telecharger") + 'Importer un CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" data-audit-fichier class="cache"></label>' +
          '<button type="button" class="bouton bouton--petit bouton--fantome" data-audit-exemple>Exemple : coller l\'échéancier simulé</button></div>' +
          '<div class="cr-outil__sortie" aria-live="polite"></div>';
      },
      calc: function (c) {
        var txt = (c.querySelector('[data-c="lignes"]') || {}).value || "", out = sortie(c), d = d0(), r = d.r;
        var lignes = lireTableauBancaire(txt);
        if (!lignes.length) { out.innerHTML = encart("", "info", "<p>Aucune ligne lue pour l'instant.</p>"); return; }
        out.innerHTML = auditer(lignes, r, d.e);
      }
    }
  };

  /* Liste des crédits du profil (pour « Mon crédit en cours » et la renégociation). */
  function selectCredits() {
    var O = Orb(), p = O && O.profil ? O.profil() : null, cr = p && p.credits ? p.credits : [];
    if (!cr.length) return '<p class="cr-texte cr-texte--doux">Aucun crédit en cours dans votre profil. <a href="#profil?section=credits">Ajouter un crédit</a></p>';
    var id = uid();
    return '<div class="champ cr-choix-credit"><label for="' + id + '">Crédit de mon profil</label><div class="saisie"><select id="' + id + '" data-choix-credit><option value="">Saisie libre</option>' +
      cr.map(function (x, i) { return '<option value="' + i + '">' + esc(x.libelle) + ' · ' + esc(dt0(x.capitalRestant)) + ' restants</option>'; }).join("") + '</select>' + ico("chevron", "saisie__chevron") + '</div></div>';
  }
  function remplirDepuisCredit(cle, corps, index) {
    var O = Orb(), p = O && O.profil ? O.profil() : null, x = p && p.credits ? p.credits[index] : null;
    if (!x) return;
    var sel = corps.querySelector("[data-choix-credit]"); if (sel) sel.value = String(index);
    if (cle === "mon") {
      poserC(corps, "capital", x.capitalRestant || (OC && x.mensualite > 0 ? Math.round(OC.capitalPourMensualite(x.mensualite, x.tauxPct || 0, x.moisRestants || 1) * 1000) / 1000 : 0));
      poserC(corps, "mois", x.moisRestants || 1);
      poserC(corps, "taux", x.tauxPct || 0);
      poserC(corps, "date", premierMoisSuivant());
      poserC(corps, "duree", x.dureeMois || Math.max(x.moisRestants || 1, { immo: 240, auto: 60, conso: 36 }[x.type] || x.moisRestants || 1));
      /* Règle des 8 % : seulement pour un crédit déclaré à taux fixe. */
      var rc = corps.querySelector('[data-c="reduc"]'); if (rc) rc.checked = x.tauxType === "fixe";
    } else if (cle === "reneg") {
      poserC(corps, "crd", x.capitalRestant || 0);
      poserC(corps, "ta", x.tauxPct || 0);
      poserC(corps, "n", x.moisRestants || 1);
      poserC(corps, "nn", x.moisRestants || 1);
      poserC(corps, "tn", Math.max(0, (x.tauxPct || 0) - 1.5));
    }
  }

  /* Lecture du tableau bancaire collé (format français ou anglais). */
  function lireTableauBancaire(txt) {
    var out = [];
    txt.split(/\r?\n/).forEach(function (brute) {
      var l = brute.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, " ").replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
      var cellules;
      if (/[;\t]/.test(l)) cellules = l.split(/[;\t]/);
      else cellules = l.match(/\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) || [];
      var nums = cellules.map(function (x) { var t = String(x).replace(/[\s  ]/g, ""); if (!/^\d+(?:[.,]\d+)?$/.test(t)) return null; return Number(t.replace(",", ".")); }).filter(function (x) { return x !== null && isFinite(x); });
      if (nums.length < 4) return;
      var o = nums.length >= 5 && Number.isInteger(nums[0]) && nums[0] <= 600 ? { n: nums[0], v: nums.slice(1) } : { n: out.length ? out[out.length - 1].n + 1 : 1, v: nums };
      var v = o.v;
      if (v.length < 4) return;
      out.push({ n: o.n, ech: v[0], int: v[1], am: v[2], extras: v.slice(3, v.length - 1).reduce(function (s, x) { return s + x; }, 0), crd: v[v.length - 1] });
    });
    return out;
  }
  function auditer(L, r, e) {
    var anomalies = [], prevCrd = null, totIB = 0, totIS = 0, int36 = [];
    L.forEach(function (b, i) {
      var s = r.lignes[b.n - 1];
      totIB += b.int;
      if (Math.abs(b.ech - (b.int + b.am + b.extras)) > 0.011) anomalies.push({ g: "lecture", n: b.n, txt: "Échéance " + b.n + " : " + dt(b.ech) + " ≠ intérêts + capital + accessoires (" + dt(arr(b.int + b.am + b.extras)) + ")." });
      if (prevCrd !== null && Math.abs(prevCrd - b.am - b.crd) > 0.011) {
        var ec = arr(prevCrd - b.am - b.crd);
        anomalies.push({ g: ec > 0 ? "info" : "erreur", n: b.n, txt: ec > 0 ? "Avant l'échéance " + b.n + " : le capital baisse de " + dt(ec) + " de plus que l'amortissement (remboursement anticipé ?)." : "Échéance " + b.n + " : le capital restant dû augmente de " + dt(-ec) + " sans explication." });
      }
      if (s) {
        totIS += s.interet;
        var crdAvant = b.n === 1 ? r.C : MC.resteFin(r.lignes[b.n - 2]);
        var tauxP = crdAvant > 0 ? s.interet / crdAvant : 0;
        var attendu = prevCrd !== null ? arr(prevCrd * tauxP) : s.interet;
        if (Math.abs(b.int - attendu) > 0.011 + attendu * 0.0005) anomalies.push({ g: "erreur", n: b.n, txt: "Échéance " + b.n + " : intérêts facturés " + dt(b.int) + ", attendus " + dt(attendu) + " (écart " + signe(arr(b.int - attendu)) + ")." });
        else if (Math.abs(b.crd - MC.resteFin(s)) > 1) anomalies.push({ g: "info", n: b.n, txt: "Échéance " + b.n + " : capital restant dû " + dt(b.crd) + " contre " + dt(MC.resteFin(s)) + " dans la simulation." });
      } else anomalies.push({ g: "info", n: b.n, txt: "Échéance " + b.n + " : au-delà de la durée de votre scénario." });
      int36.push(b.int);
      if (int36.length > 36) int36.shift();
      prevCrd = b.crd;
    });
    /* Règle des 8 % sur les intérêts réellement facturés */
    var possible = null, s36 = [], ref = (e.dureeTotale || e.mois) > 84;
    for (var i = 0; i < L.length && ref; i++) {
      if (s36.length === 36 && i > 0) {
        var crd = L[i - 1].crd, ratio = crd > 0 ? s36.reduce(function (a, x) { return a + x; }, 0) / crd : 0;
        if (ratio > 0.08) { possible = { n: L[i].n, ratio: ratio }; break; }
      }
      s36.push(L[i].int); if (s36.length > 36) s36.shift();
    }
    var nbErr = anomalies.filter(function (a) { return a.g === "erreur" || a.g === "lecture"; }).length;
    var h = encart(nbErr ? "alerte" : "succes", nbErr ? "alerte" : "valide", "<p><strong>" + pluriel(L.length, "ligne lue", "lignes lues") + "</strong> · " + (nbErr ? pluriel(nbErr, "anomalie", "anomalies") + " à vérifier" : "aucune anomalie de calcul") + ".</p><p>Intérêts facturés : " + dt(arr(totIB)) + " · simulés sur les mêmes échéances : " + dt(arr(totIS)) + ".</p>");
    if (possible) h += encart("succes", "cible", "<p>D'après les intérêts facturés, la réduction de taux (règle des 8 %) était possible dès l'échéance <strong>" + possible.n + "</strong> (ratio " + pc(possible.ratio * 100, 2) + "). Vérifiez qu'elle a bien été appliquée.</p>");
    if (anomalies.length) h += '<ul class="cr-constats">' + anomalies.slice(0, 40).map(function (a) { return '<li data-g="' + a.g + '">' + ico(a.g === "info" ? "info" : "alerte") + '<span>' + esc(a.txt) + '</span></li>'; }).join("") + (anomalies.length > 40 ? '<li data-g="info">' + ico("info") + '<span>… et ' + (anomalies.length - 40) + ' autres constats.</span></li>' : "") + '</ul>';
    return h;
  }

  /* Export du calendrier au format iCalendar. */
  function exporterIcs() {
    var d = d0(); if (!d || !d.r.debut) return;
    var r = d.r, now = new Date(), stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    function jour(dt0x) { return dt0x.getFullYear() + String(dt0x.getMonth() + 1).padStart(2, "0") + String(dt0x.getDate()).padStart(2, "0"); }
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbite//Credit//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Échéances de crédit"];
    r.lignes.forEach(function (l) {
      if (!l.date) return;
      var fin = new Date(l.date.getFullYear(), l.date.getMonth(), l.date.getDate() + 1);
      L.push("BEGIN:VEVENT", "UID:orbite-credit-" + Math.round(r.C) + "-" + l.mois + "-" + jour(l.date) + "@orbite", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + jour(l.date), "DTEND;VALUE=DATE:" + jour(fin),
        "SUMMARY:Échéance de crédit n° " + l.mois + " : " + F.dt3(MC.totalLigne(l)) + " DT",
        "DESCRIPTION:Intérêts " + F.dt3(l.interet) + " DT\\, capital " + F.dt3(l.principal) + " DT\\, restant dû " + F.dt3(MC.resteFin(l)) + " DT.",
        "TRANSP:TRANSPARENT", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    telecharger("echeances-credit.ics", L.join("\r\n") + "\r\n", "text/calendar;charset=utf-8");
    toast("Calendrier exporté : ouvrez le fichier avec votre agenda.");
  }

  /* Ouvre un outil (construction paresseuse à la première ouverture). */
  function construireOutil(cle) {
    var corps = $("cr-o-" + cle), fn = OUTIL_FN[cle];
    if (!corps || !fn || corps.getAttribute("data-pret")) return corps;
    if (!S.dernier) calculer(false);
    corps.innerHTML = fn.html();
    corps.setAttribute("data-pret", "1");
    var lancer = anti(function () { try { fn.calc(corps); } catch (err) { if (window.console) console.error(err); } }, 160);
    corps.addEventListener("input", function (ev) {
      if (ev.target.matches("[data-quand-k]")) { OUTIL_FN.quand.k = +ev.target.value; fn.calc(corps); return; }
      if (ev.target.closest("[data-lettre]")) { OUTIL_FN.quand.lettre(corps); return; }
      if (cle === "optim") return;
      lancer();
    });
    corps.addEventListener("change", function (ev) {
      var O = Orb();
      if (ev.target.matches("[data-choix-credit]")) { if (ev.target.value !== "") remplirDepuisCredit(cle, corps, +ev.target.value); fn.calc(corps); return; }
      if (ev.target.matches("[data-audit-fichier]")) {
        var f = ev.target.files && ev.target.files[0];
        if (f) { var rd = new FileReader(); rd.onload = function () { corps.querySelector('[data-c="lignes"]').value = String(rd.result || "").slice(0, 200000); fn.calc(corps); }; rd.readAsText(f); }
        return;
      }
      if (ev.target.closest("[data-lettre]")) { OUTIL_FN.quand.lettre(corps); return; }
      if (ev.target.type === "radio" || ev.target.type === "checkbox" || ev.target.tagName === "SELECT") { if (cle !== "optim") fn.calc(corps); }
      if (O && ev.target.type === "radio") O.placerPastilles(corps);
    });
    corps.addEventListener("toggle", function (ev) { var O = Orb(); if (O && ev.target.open) requestAnimationFrame(function () { O.placerPastilles(ev.target); }); }, true);
    if (cle !== "optim") fn.calc(corps);
    else sortie(corps).innerHTML = '<p class="cr-texte cr-texte--doux">Réglez vos contraintes, puis lancez la recherche (345 combinaisons).</p>';
    var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(corps); });
    return corps;
  }

  /* Applique au scénario les valeurs proposées par un outil. */
  function appliquer(data, source) {
    var sc = sc0();
    if (data.type && TYPES[data.type]) sc.type = data.type;
    if (data.capital > 0) sc.capital = arr(data.capital);
    if (data.mois >= 1 && data.mois <= 300) { sc.mois = Math.max(sc.periodicite, Math.round(data.mois / sc.periodicite) * sc.periodicite); }
    if (isFinite(data.taux)) {
      if (sc.mode === "tmm" && data.taux >= sc.tmm) sc.marge = MC.arrondi6(data.taux - sc.tmm);
      else { sc.mode = "fixe"; sc.taux = data.taux; }
    }
    if (data.dateDebut) sc.dateDebut = data.dateDebut;
    if ("frais" in data) { if (data.frais) sc.frais = { on: true, dossierPct: data.frais.dossierPct, dossierFixe: data.frais.dossierFixe, garantie: data.frais.garantie || 0, autres: data.frais.autres || 0 }; else sc.frais.on = false; }
    if ("assurance" in data) { if (data.assurance) sc.assurance = { on: true, taux: data.assurance.taux, base: data.assurance.base }; else sc.assurance.on = false; }
    if (data.prix > 0 && data.apport >= 0 && data.apport < data.prix) sc.apport = { on: data.apport > 0, prix: data.prix, apport: data.apport };
    if ("versement" in data) { if (data.versement > 0) sc.versement = { on: true, montant: data.versement, frequence: "annee", des: 12 }; else sc.versement.on = false; }
    if ("reduction" in data) sc.reduction = !!data.reduction;
    apresDuree(sc);
    ecrireEditeur();
    calculer(true);
    signalerModif();
    var O = Orb();
    if (O && O.puceVolante && source) O.puceVolante(source, $("cr-res-m"), dt0(premiereEcheance(S.dernier.r)), "credit");
    if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
    toast("Scénario mis à jour.");
  }

  /* ===================================================================
     Évènements
     =================================================================== */
  function brancher() {
    var form = $("cr-formulaire");
    form.addEventListener("input", function (ev) {
      var el = ev.target;
      if (!el.hasAttribute("data-k")) return;
      if (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT") return;
      surSaisie(el, false);
    });
    form.addEventListener("change", function (ev) {
      var el = ev.target;
      if (!el.hasAttribute("data-k")) return;
      if (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT" || el.type === "date") { surSaisie(el, true); return; }
      if (el.type === "range") return;
      /* Sortie d'un champ texte : remise en forme */
      var r = lireChamp(el);
      if (r.ok && el.getAttribute("data-t") !== "texte") el.value = formater(el.getAttribute("data-t"), r.v);
    });
    form.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-ra-retirer]");
      if (b) { sc0().ras.splice(+b.getAttribute("data-ra-retirer"), 1); rendreRas(); calculer(true); signalerModif(); var a = $("cr-ra-ajouter"); if (a) a.focus(); return; }
      if (ev.target.closest("#cr-ra-ajouter")) {
        var sc = sc0(), N = nbEcheances(sc);
        if (sc.ras.length >= 10) { toast("Dix remboursements au maximum."); return; }
        var der = sc.ras.length ? sc.ras[sc.ras.length - 1].apres : 0;
        sc.ras.push({ apres: Math.min(N - 1, der + Math.max(1, Math.round(12 / sc.periodicite)) * (der ? 1 : 2)), total: false, montant: Math.round(sc.capital * 0.1 / 100) * 100 || 1000 });
        rendreRas(); calculer(true); signalerModif();
        var champs = $$("#cr-ras input"); if (champs.length) champs[champs.length - 2 >= 0 ? champs.length - 2 : 0].focus();
      }
    });
    racine.addEventListener("toggle", function (ev) {
      var t = ev.target;
      if (!t.open) return;
      var O = Orb();
      if (O) requestAnimationFrame(function () { O.placerPastilles(t); });
      if (t.classList.contains("cr-outil")) construireOutil(t.getAttribute("data-outil"));
    }, true);
    /* Scénarios */
    $("cr-onglets-sc").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-sc]");
      if (!b) return;
      choisirScenario(+b.getAttribute("data-sc"));
      /* Les onglets sont redessinés : le focus revient sur l'onglet choisi. */
      var t = $("cr-tab-" + S.actif); if (t && doc.activeElement !== t) t.focus();
    });
    $("cr-onglets-sc").addEventListener("keydown", function (ev) {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(ev.key) === -1) return;
      ev.preventDefault();
      var n = S.scenarios.length, i = ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : (S.actif + (ev.key === "ArrowRight" ? 1 : -1) + n) % n;
      choisirScenario(i);
      var t = $("cr-tab-" + i); if (t) t.focus();
    });
    $("cr-dupliquer").addEventListener("click", dupliquer);
    $("cr-supprimer").addEventListener("click", function () { supprimerScenario(S.actif); });
    /* Touche Suppr sur un onglet de scénario. */
    $("cr-onglets-sc").addEventListener("keydown", function (ev) {
      var b = ev.target.closest("[data-sc]");
      if (b && (ev.key === "Delete" || ev.key === "Backspace")) { ev.preventDefault(); supprimerScenario(+b.getAttribute("data-sc")); }
    });
    /* Onglets graphiques et tableau (clavier compris) */
    ongletsSimples($("cr-gr-onglets"), "data-graphe", function (v) { S.vueGraphe = v; $("cr-gr-zone").setAttribute("aria-labelledby", "cr-gr-tab-" + v); rendreGraphe(); });
    ongletsSimples($("cr-tab-onglets"), "data-vue", function (v) { S.vueTableau = v; rendreTableau(); });
    $("cr-csv").addEventListener("click", exporterCsv);
    $("cr-imprimer").addEventListener("click", function () { S.vueTableau = S.vueTableau || "mensuel"; window.print(); });
    $("cr-copier-resume").addEventListener("click", function () { copierTexte(texteResume(), "Résumé copié : collez-le où vous voulez."); });
    /* Délégation globale : outils, éligibilité, comparaison */
    racine.addEventListener("click", function (ev) {
      var t = ev.target;
      var ap = t.closest("[data-appliquer]");
      if (ap) { try { appliquer(JSON.parse(ap.getAttribute("data-appliquer")), ap); } catch (e) { if (window.console) console.error(e); } return; }
      var oo = t.closest("[data-ouvrir-option]");
      if (oo) { var cle = oo.getAttribute("data-ouvrir-option"), det = $("cr-opt-" + cle); if (det) { det.open = true; if (cle === "apport" && !sc0().apport.on) { var cb = det.querySelector('[data-k="apport.on"]'); cb.checked = true; surSaisie(cb, true); } det.scrollIntoView({ behavior: mouvementReduit.matches ? "auto" : "smooth", block: "center" }); var f = det.querySelector("input"); if (f) f.focus({ preventScroll: true }); } return; }
      var sp = t.closest("[data-sc-suppr]");
      if (sp) { supprimerScenario(+sp.getAttribute("data-sc-suppr")); return; }
      if (t.closest("[data-ics]")) { exporterIcs(); return; }
      if (t.closest("[data-passer-tmm]")) { var mb = racine.querySelector('#cr-mode input[value="tmm"]'); mb.checked = true; surSaisie(mb, true); var O = Orb(); if (O) O.placerPastilles($("cr-mode")); return; }
      if (t.closest("[data-optim-lancer]")) { var c = $("cr-o-optim"); sortie(c).innerHTML = '<p class="cr-texte cr-texte--doux">Calcul en cours…</p>'; setTimeout(function () { OUTIL_FN.optim.calc(c); }, 20); return; }
      var pa = t.closest("[data-plan-ajouter]");
      if (pa) { var cp = $("cr-o-plan"); OUTIL_FN.plan.lire(cp); if (OUTIL_FN.plan.prets.length < 5) OUTIL_FN.plan.prets.push({ nom: "Prêt " + (OUTIL_FN.plan.prets.length + 1), capital: 10000, mois: 60, taux: 10, differe: 0 }); OUTIL_FN.plan.liste(cp); OUTIL_FN.plan.calc(cp); return; }
      var pr = t.closest("[data-plan-retirer]");
      if (pr) { var cp2 = $("cr-o-plan"); OUTIL_FN.plan.lire(cp2); OUTIL_FN.plan.prets.splice(+pr.getAttribute("data-plan-retirer"), 1); OUTIL_FN.plan.liste(cp2); OUTIL_FN.plan.calc(cp2); return; }
      if (t.closest("[data-audit-exemple]")) {
        var ca = $("cr-o-audit"), rr = S.dernier.r;
        ca.querySelector('[data-c="lignes"]').value = rr.lignes.slice(0, 60).map(function (l) { return [l.mois, l.date ? l.date.toLocaleDateString("fr-FR") : "", F.dt3(l.paiement), F.dt3(l.interet), F.dt3(l.principal), F.dt3(l.reste)].join(" ; "); }).join("\n");
        OUTIL_FN.audit.calc(ca); return;
      }
      if (t.closest("[data-lettre-copier]")) { copierTexte($("cr-o-quand").querySelector("[data-lettre-texte]").textContent, "Lettre copiée."); return; }
      if (t.closest("[data-lettre-dl]")) { telecharger("lettre-banque.txt", "﻿" + $("cr-o-quand").querySelector("[data-lettre-texte]").textContent.replace(/\n/g, "\r\n"), "text/plain;charset=utf-8"); toast("Lettre téléchargée."); return; }
      if (t.closest("[data-vers-reneg]")) {
        var cm = $("cr-o-mon"), det2 = $("cr-outil-reneg");
        det2.open = true;
        var cr2 = construireOutil("reneg");
        poserC(cr2, "crd", lireC(cm, "capital")); poserC(cr2, "ta", lireC(cm, "taux")); poserC(cr2, "n", lireC(cm, "mois")); poserC(cr2, "nn", lireC(cm, "mois"));
        poserC(cr2, "tn", Math.max(0, lireC(cm, "taux") - 1.5));
        OUTIL_FN.reneg.calc(cr2);
        det2.scrollIntoView({ behavior: mouvementReduit.matches ? "auto" : "smooth", block: "start" });
      }
    });
    /* Emprunteur : saisies manuelles */
    $("cr-emp-champs").addEventListener("input", function (ev) {
      var el = ev.target, c = el.getAttribute("data-c"); if (!c) return;
      var r = lireChamp(el); if (!r.ok) return;
      S.emp[c] = c === "quotiteNet" || c === "quotiteBrut" ? r.v / 100 : r.v;
      S.emp.touche = true;
      calculer(false);
    });
    $("cr-emp-champs").addEventListener("change", function (ev) { var el = ev.target, r = lireChamp(el); if (r.ok) el.value = formater(el.getAttribute("data-t"), r.v); });
    /* Mini-barre de résultat (téléphone) : visible quand la carte de résultat sort de l'écran */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (en) { racine.classList.toggle("cr-mini-visible", !en[0].isIntersecting && en[0].boundingClientRect.top < 0); }, { threshold: 0 }).observe($("cr-resultat"));
    }
    var largeurAvant = window.innerWidth;
    window.addEventListener("resize", anti(function () {
      if (vue.hidden || Math.abs(window.innerWidth - largeurAvant) < 8) return;
      largeurAvant = window.innerWidth;
      rendreGraphe(); rendreComparaison();
      ["stress", "louer", "quand"].forEach(function (k) { var d = $("cr-outil-" + k); if (d && d.open) OUTIL_FN[k].calc($("cr-o-" + k)); });
    }, 200));
    doc.addEventListener("orbite:vue", function (ev) {
      if (!ev.detail || ev.detail.vue !== "credit") return;
      appliquerRoute(ev.detail.params);
    });
  }
  function ongletsSimples(liste, attr, fn) {
    function choisir(b, focus) {
      $$('[role="tab"]', liste).forEach(function (x) { var on = x === b; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; });
      if (focus) b.focus();
      fn(b.getAttribute(attr));
    }
    liste.addEventListener("click", function (ev) { var b = ev.target.closest('[role="tab"]'); if (b) choisir(b, false); });
    liste.addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      var tabs = $$('[role="tab"]', liste), i = tabs.indexOf(doc.activeElement);
      choisir(tabs[(i + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length], true);
    });
  }

  /* ===================================================================
     Route : #credit?type=auto&capital=30000&mois=60&taux=10.5 · #credit?mon=0
     =================================================================== */
  function appliquerRoute(params) {
    if (!params) return;
    var cleRoute = params.toString();
    if (!cleRoute) { S.routeAppliquee = ""; return; }
    if (cleRoute === S.routeAppliquee) return;
    S.routeAppliquee = cleRoute;
    var num = function (k) { if (!params.has(k)) return NaN; var r = F.lire(params.get(k)); return r.valide && !r.vide ? r.valeur : NaN; };
    if (params.has("mon")) {
      var idx = parseInt(params.get("mon"), 10), det = $("cr-outil-mon");
      det.open = true;
      var corps = construireOutil("mon");
      remplirDepuisCredit("mon", corps, idx);
      OUTIL_FN.mon.calc(corps);
      setTimeout(function () { det.scrollIntoView({ behavior: mouvementReduit.matches ? "auto" : "smooth", block: "start" }); var s = det.querySelector("summary"); if (s) s.focus({ preventScroll: true }); }, 60);
      return;
    }
    var t = params.get("type"), sc = sc0(), change = false;
    if (t && /^(immo|immo25|auto|conso|libre)$/.test(t)) {
      appliquerType(sc, t === "immo25" ? "immo" : t);
      if (t === "immo25") sc.mois = 300;
      change = true;
    }
    var capital = num("capital"), mois = num("mois"), taux = num("taux"), prix = num("prix"), apport = num("apport"), mensualite = num("mensualite");
    S.cible = mensualite > 0 && mensualite <= 1e6 ? { mensualite: mensualite, scenario: sc } : null;
    if (prix > 0 && apport >= 0 && apport < prix) { sc.apport = { on: true, prix: prix, apport: apport }; sc.capital = arr(prix - apport); change = true; }
    if (capital > 0) { sc.capital = arr(capital); if (sc.apport.on && sc.apport.prix > capital) sc.apport.apport = arr(sc.apport.prix - capital); change = true; }
    if (mois >= 1 && mois <= 300) { sc.mois = Math.max(sc.periodicite, Math.round(mois / sc.periodicite) * sc.periodicite); change = true; }
    /* Un taux transmis par un lien est le taux du crédit : on l'affiche en taux fixe, tel quel. */
    if (taux >= 0 && taux <= 100) { sc.mode = "fixe"; sc.taux = taux; change = true; }
    if (!change) return;
    apresDuree(sc);
    ecrireEditeur();
    calculer(true);
    var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
  }

  /* ===================================================================
     Profil
     =================================================================== */
  function syntheseDe(profil) {
    var O = Orb(), sy = null;
    try { sy = profil && OC ? OC.synthese(profil) : (O && O.synthese ? O.synthese() : null); } catch (e) { sy = O && O.synthese ? O.synthese() : null; }
    return sy;
  }
  function empDepuis(sy) {
    if (!sy) return;
    S.emp.age = sy.age || S.emp.age;
    /* Revenu retenu par la banque (salaires et primes ÷ 12, ou salaire mensuel), comme dans « Mon orbite ». */
    S.emp.net = arr(sy.capacite ? sy.capacite.net.revenu : sy.salaire ? sy.salaire.netMensuel : 0);
    S.emp.brut = arr(sy.capacite ? sy.capacite.brut.revenu : sy.salaire ? sy.salaire.brutMensuel : 0);
    S.emp.base = sy.profil && sy.profil.baseBanque === "brut" ? "brut" : "net";
    S.emp.banque = sy.profil ? sy.profil.banque || "" : "";
    S.emp.annuel = !sy.profil || sy.profil.revenuBanque !== "mensuel";
    S.emp.charges = arr(sy.chargesCredits || 0);
    S.emp.quotiteNet = sy.profil ? sy.profil.quotiteNet : 0.4;
    S.emp.quotiteBrut = sy.profil ? sy.profil.quotiteBrut : 0.4;
    S.emp.touche = false;
    ecrireEmprunteur();
  }
  function ecrireEmprunteur() {
    var m = { age: S.emp.age, net: S.emp.net, brut: S.emp.brut, charges: S.emp.charges, quotiteNet: S.emp.quotiteNet * 100, quotiteBrut: S.emp.quotiteBrut * 100 };
    $$("#cr-emp-champs [data-c]").forEach(function (el) { ecrireChamp(el, m[el.getAttribute("data-c")]); marquer(el, null); });
  }

  /* ===================================================================
     Contrat avec l'application
     =================================================================== */
  function nomScenario(sc) {
    var t = (TYPES[sc.type] || TYPES.libre).long;
    return t + " " + F.dt0(sc.capital) + " DT · " + dureeLib(sc.mois);
  }
  window.ModuleCredit = {
    outil: "credit",
    etat: function () {
      var sc = sc0();
      if (!valide(sc)) sc = scenarioVierge("immo", 150000);
      return MC.encoderLien(entree(sc, false), { reduc: !!sc.reduction });
    },
    resume: function () {
      var sc = sc0();
      if (!valide(sc)) return null;
      var e = entree(sc, false), r = S.dernier && S.dernier.sc === sc ? S.dernier.r : MC.echeancier(e), info = MC.infoPeriodicite(r.p);
      var ligne = (TYPES[sc.type] || TYPES.libre).nom + " · " + F.dt0(r.C) + " DT sur " + dureeLib(e.mois) + " · " + (e.tmm ? "TMM " + nombre(e.tmm.tmm, 3) + " % + " + nombre(e.tmm.marge, 3) : "taux " + nombre(e.taux, 3) + " %") + (isFinite(r.teg) ? " · TEG " + nombre(r.teg, 2) + " %" : "");
      return {
        principal: { libelle: info.echeance + (r.totAss ? " (assurance comprise)" : ""), valeur: arr(premiereEcheance(r)), unite: "DT" },
        secondaires: [
          { libelle: "Capital emprunté", valeur: arr(r.C), unite: "DT" },
          { libelle: "Durée", valeur: e.mois, unite: "mois" },
          { libelle: "Taux nominal", valeur: Math.round(e.taux * 1000) / 1000, unite: "%" },
          { libelle: "Coût du crédit", valeur: arr(r.coutCredit), unite: "DT" }
        ],
        ligne: ligne.slice(0, 140)
      };
    },
    nomParDefaut: function () { return nomScenario(sc0()); },
    charger: function (texte) {
      var v = null;
      try { v = MC.decoderLien(String(texte || "")); } catch (e) { v = null; }
      if (!v) return false;
      S.scenarios = [depuisLien(v)];
      S.actif = 0;
      S.precedentM = null;
      ecrireEditeur();
      calculer(true);
      var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
      return true;
    },
    depuisProfil: function (profil) {
      var sy = syntheseDe(profil);
      empDepuis(sy);
      if (!S.profilCharge) {
        S.profilCharge = true;
        /* Montant de départ : la capacité réelle sur la base de la banque (brut ou net, selon le profil).
           Capacité nulle aujourd'hui : le premier montant du calendrier de la marge. Sans profil : exemple de 150 000 DT. */
        var base = sy && sy.profil ? sy.profil.baseBanque : "net";
        var capB = sy && sy.capacite ? sy.capacite[base] || sy.capacite.net : null;
        var cap = capB ? capB.credits.filter(function (c) { return c.cle === "immo"; })[0] : null;
        var capital = cap && cap.capital > 0 ? Math.floor(cap.capital / 1000) * 1000 : 0;
        if (capital < 1000 && capB && capB.paliers && capB.paliers.length) {
          var o1 = (capB.paliers[0].offres || []).filter(function (x) { return x.cle === "immo"; })[0];
          if (o1 && o1.capital > 0) { capital = Math.floor(o1.capital / 1000) * 1000; cap = { dureeMois: o1.dureeMois, dureeLimitee: o1.dureeMois < 240 }; }
        }
        var sc = scenarioVierge("immo", capital >= 1000 ? Math.min(capital, 2000000) : 150000);
        if (cap && cap.dureeLimitee && cap.dureeMois >= 12) sc.mois = Math.floor(cap.dureeMois / 12) * 12;
        S.scenarios[0] = sc;
        S.actif = 0;
        S.precedentM = null;
        ecrireEditeur();
      }
      calculer(false);
      $$(".cr-outil__corps[data-pret]").forEach(function (c) {
        var cle = c.parentNode.getAttribute("data-outil");
        if (cle === "capacite") { var rp = revenusProfil(); poserC(c, "net", rp.net); poserC(c, "brut", rp.brut); poserC(c, "charges", rp.charges); poserC(c, "age", rp.age); OUTIL_FN.capacite.calc(c); }
      });
      var O = Orb(); if (O) requestAnimationFrame(function () { O.placerPastilles(racine); });
    },
    afficher: function () {
      var O = Orb();
      requestAnimationFrame(function () {
        if (O) O.placerPastilles(racine);
        if (S.dernier) { rendreGraphe(); rendreComparaison(); }
      });
    }
  };

  /* ===================================================================
     Démarrage
     =================================================================== */
  construire();
  brancher();
  ecrireEditeur();
  ecrireEmprunteur();
  calculer(false);
  var Ob = Orb();
  if (Ob && Ob.surProfil) Ob.surProfil(function (sy) {
    if (!S.profilCharge) return;
    if (!S.emp.touche) { empDepuis(sy); if (S.dernier) calculer(false); }
  });
})();
