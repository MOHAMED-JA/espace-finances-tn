/*
 * Orbite — module Épargne vie & CEA (vue #epargne de l'application).
 * Économie d'impôt (article 39 du Code de l'IRPP et de l'IS), capital projeté, modes inverses et outils experts.
 * Tous les calculs viennent des moteurs testés de moteurs/vie/*.js : aucune règle fiscale n'est dupliquée ici.
 * Interface construite dans #epargne-racine ; graphiques en SVG dessinés ici (aucune dépendance, aucun réseau).
 * CSP stricte : aucun attribut style="", les variables CSS sont posées avec el.style.setProperty.
 */
(function () {
  "use strict";

  var doc = document;
  var R = doc.getElementById("epargne-racine");
  if (!R || !window.Orbite || !window.Scenario) return;

  var O = window.Orbite, F = O.F;
  var MF = window.MoteurFiscal, SC = window.Scenario, PJ = window.Projection, BA = window.Baremes, PA = window.Partage, OC = window.OrbiteCalcul;
  var reduit = O.mouvementReduit || { matches: false };
  var FACT = MF.FACTEURS;
  var PERIODE = { Mensuel: "par mois", Trimestriel: "par trimestre", Semestriel: "par semestre", Annuel: "par an" };
  var PERIODE_NOM = { Mensuel: "mois", Trimestriel: "trimestre", Semestriel: "semestre", Annuel: "an" };
  var NOMS_SCEN = { prudent: "Prudent", median: "Médian", dynamique: "Dynamique" };
  var SUPPORTS = [["euros", "Fonds en dinars"], ["equilibre", "Équilibré"], ["dynamique", "Unités de compte"], ["perso", "Personnalisé"]];

  /* ---------- Formats ---------- */
  function dt(v) { return F.dt(v) + " DT"; }
  function dt3(v) { return F.dt3(v) + " DT"; }
  function dt0(v) { return F.dt0(v) + " DT"; }
  function pc(v, d) { return F.pct((v || 0) / 100, d); }
  function signe(v, fn) { return (v >= 0.0005 ? "+" : v <= -0.0005 ? "−" : "") + (fn || dt)(Math.abs(v)); }
  function libre(v) { return v ? F.saisie(v) : "0"; }
  function court(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M";
    if (a >= 1e3) return (v / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: a >= 1e4 ? 0 : 1 }) + " k";
    return String(Math.round(v));
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ico(n, cls) { return '<svg aria-hidden="true"' + (cls ? ' class="' + cls + '"' : "") + '><use href="/orbite/icones.svg#' + n + '"/></svg>'; }
  function $(id) { return doc.getElementById(id); }
  function arr3(v) { return Math.round(v * 1000) / 1000; }
  function plafond3(v) { return Math.max(0, Math.ceil(v * 1000 - 1e-7) / 1000); }
  function borne(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pluriel(n, mot) { return n + " " + mot + (n > 1 ? "s" : ""); }
  function dateIso() { return new Date().toISOString().slice(0, 10); }
  function lireNb(id) { var el = $(id); return el ? F.lire(el.value) : { vide: true, valide: true, valeur: 0 }; }
  function poserR(racine) { (racine || R).querySelectorAll("[data-r]").forEach(function (el) { el.style.setProperty("--r", el.getAttribute("data-r")); }); }

  /* ---------- État ---------- */
  var etat = Object.assign(SC.defauts(), { versement: 0, dureeAns: 15 });
  var ui = {
    mode: "av", inclure: true, premier: true,
    existant: { av: 0, cea: 0, liste: [] },
    objectifOnglet: "economie",
    rente: { duree: 20, taux: 3 },
    scenarios: [], objectifs: [], offresTouchees: false
  };
  var res = null;          /* dernier calcul complet */
  var etatValide = true;   /* une saisie au moins est invalide ? */

  /* ===================================================================
     Calcul : scénario du moteur + contrats déjà détenus (économie supplémentaire)
     =================================================================== */
  function effectif() {
    var e = JSON.parse(JSON.stringify(etat));
    if (ui.mode === "av") { e.versementCea = 0; e.initialCea = 0; }
    if (ui.mode === "cea") { e.versement = 0; e.initialAv = 0; e.libres = []; e.retraitMontant = 0; e.retraitDebut = 0; }
    if (!(e.retraitMontant > 0)) { e.retraitMontant = 0; e.retraitDebut = 0; }
    return e;
  }
  function existant() { var x = ui.existant; return ui.inclure && (x.av > 0 || x.cea > 0) ? x : null; }

  function libresMap(e) {
    var m = {};
    (e.libres || []).forEach(function (l) { if (l && l.annee >= 1 && l.montant > 0) m[l.annee] = (m[l.annee] || 0) + l.montant; });
    return m;
  }
  function montantsAnnee(e, f, a, libres) {
    var g = Math.pow(1 + (e.croissancePct || 0) / 100, a - 1);
    return { g: g, av: e.versement * f * g + (a === 1 ? e.initialAv || 0 : 0) + (libres[a] || 0), cea: e.versementCea * f * g + (a === 1 ? e.initialCea || 0 : 0) };
  }
  function entreeFiscale(e, g, av, cea, leger) {
    return { revenu: e.revenu * g, chef: e.chef, enfants: e.enfants, infirmes: e.infirmes, etudiants: e.etudiants, parents: e.parents, investissementAv: av, investissementCea: cea, leger: !!leger };
  }

  function calculerComplet(e, ex) {
    var c = SC.calculer(e);
    var f = c.facteur, an = e.annee;
    var exAv = ex ? ex.av : 0, exCea = ex ? ex.cea : 0;
    var base = MF.simuler(entreeFiscale(e, 1, exAv, exCea, true), an);
    var tot = MF.simuler(entreeFiscale(e, 1, exAv + c.investissementAv, exCea + c.investissementCea, false), an);
    var avSeul = MF.simuler(entreeFiscale(e, 1, exAv + c.investissementAv, exCea, true), an);
    var s = Object.assign({}, tot);
    s.impotInitial = tot.impotAvant;
    s.impotAvant = base.impotApres;
    s.avant = ex ? base.apres : tot.avant;
    s.economie = Math.max(0, base.impotApres - tot.impotApres);
    s.economieAv = Math.min(s.economie, Math.max(0, base.impotApres - avSeul.impotApres));
    s.economieCea = Math.max(0, s.economie - s.economieAv);
    s.economieExistante = Math.max(0, tot.impotAvant - base.impotApres);
    s.optimal = Math.max(0, (tot.optimal || 0) - exAv);
    s.ceaUtile = Math.max(0, (tot.ceaUtile || 0) - exCea);
    s.investissementAv = c.investissementAv;
    s.investissementCea = c.investissementCea;
    s.investissement = c.investissement;
    s.exAv = exAv; s.exCea = exCea;
    var plafondAv = tot.produits.av.plafond;
    var mini = MF.impotApresDeductions(tot.revenuNet, tot.impotAvant, Math.min(plafondAv, tot.revenuNet), exCea + c.investissementCea, tot.regles).total;
    s.economieMax = Math.max(s.economie, base.impotApres - mini);
    s.tauxReduction = s.impotAvant > 0 ? s.economie / s.impotAvant * 100 : 0;
    s.plancherAtteint = tot.impotAvant > 0 && tot.impotApres <= tot.impotMinimum + 0.001 && (exAv + c.investissementAv) > 0;
    c.sim = s;

    if (c.actif && ex) {
      var libres = libresMap(e), cache = {}, eco = [];
      for (var a = 1; a <= e.dureeAns; a++) {
        var m = montantsAnnee(e, f, a, libres);
        var cle = m.g + "|" + m.av + "|" + m.cea, x;
        if (a === 1) x = s.economie;
        else if (cache[cle] != null) x = cache[cle];
        else {
          var b = MF.simuler(entreeFiscale(e, m.g, exAv, exCea, true), an);
          var t = MF.simuler(entreeFiscale(e, m.g, exAv + m.av, exCea + m.cea, true), an);
          x = Math.max(0, b.impotApres - t.impotApres);
        }
        cache[cle] = x;
        var l = c.annuel[a - 1], k = l.economie > 0 ? x / l.economie : 0;
        l.economieAv *= k; l.economieCea *= k; l.economie = x;
        eco.push(x);
      }
      c.p = Object.assign({}, c.p, { economies: eco });
      var scAv = {}, sc = {};
      ["prudent", "median", "dynamique"].forEach(function (k2) {
        scAv[k2] = PJ.projeter(Object.assign({}, c.p, { rendementPct: c.taux.av[k2] }));
        sc[k2] = PJ.combiner(scAv[k2], c.scCea[k2]);
      });
      c.scAv = scAv; c.sc = sc; c.med = sc.median; c.medAv = scAv.median;
      c.valeurTotale = c.med.valeurFinale + (e.reinvestir ? 0 : c.med.economieCumulee);
      c.effectif = PJ.triProjection(PJ.combiner(PJ.projeter(Object.assign({}, c.p, { reinvestir: false })), c.aCea ? c.scCea.median : null), f);
      c.avantage = c.valeurTotale - c.classique;
    }
    return c;
  }

  /* Économie supplémentaire pour une assurance vie annuelle donnée (CEA saisi inchangé) */
  function economiePour(av) {
    var s = res.sim;
    if (!(s.impotInitial > 0)) return 0;
    var t = MF.impotApresDeductions(s.revenuNet, s.impotInitial, s.exAv + av, s.exCea + s.investissementCea, s.regles).total;
    return Math.max(0, s.impotAvant - t);
  }
  /* Part fixe de l'assurance vie la 1re année (versement initial et libres) */
  function partFixeAv(c) { return Math.max(0, c.investissementAv - c.etat.versement * c.facteur); }

  /* ===================================================================
     Gabarits
     =================================================================== */
  function champ(id, lib, cle, type, unite, aide, attrs) {
    return '<div class="champ"><label for="' + id + '">' + lib + '</label><div class="saisie"><input id="' + id + '" type="text" inputmode="' + (type === "i" ? "numeric" : "decimal") + '" autocomplete="off" spellcheck="false"' +
      (cle ? ' data-ep="' + cle + '" data-t="' + type + '"' : "") + (aide ? ' aria-describedby="' + id + '-aide"' : "") + (attrs || "") + '><span class="saisie__unite" aria-hidden="true">' + unite + '</span></div>' +
      (aide ? '<span class="champ__aide" id="' + id + '-aide">' + aide + "</span>" : "") + "</div>";
  }
  function bascule(nom, lib, options, cls) {
    return '<div class="bascule' + (cls ? " " + cls : "") + '" role="radiogroup" aria-label="' + lib + '">' + options.map(function (o) {
      return '<label><input type="radio" name="' + nom + '" value="' + o[0] + '"><span>' + o[1] + "</span></label>";
    }).join("") + '<i class="bascule__pastille" aria-hidden="true"></i></div>';
  }
  function compteur(cle, titre, aide, max) {
    return '<div class="ep-ligne"><span class="ep-ligne__txt" id="ep-lib-' + cle + '"><strong>' + titre + "</strong><small>" + aide + '</small></span><span class="compteur" role="group" aria-labelledby="ep-lib-' + cle + '">' +
      '<button type="button" data-cpt="' + cle + '" data-pas="-1" aria-label="' + titre + ' : un de moins">' + ico("moins") + "</button>" +
      '<output id="ep-cpt-' + cle + '" aria-live="polite">0</output>' +
      '<button type="button" data-cpt="' + cle + '" data-pas="1" data-max="' + max + '" aria-label="' + titre + ' : un de plus">' + ico("plus") + "</button></span></div>";
  }
  function interrupteur(id, titre, aide) {
    return '<label class="ep-ligne interrupteur"><span class="ep-ligne__txt"><strong>' + titre + "</strong>" + (aide ? "<small>" + aide + "</small>" : "") + '</span><input type="checkbox" id="' + id + '" role="switch"><span class="interrupteur__piste" aria-hidden="true"></span></label>';
  }
  function lignes(liste) {
    return '<dl class="ep-lignes">' + liste.map(function (l) {
      return '<div class="ep-lig' + (l[2] ? " " + l[2] : "") + '"><dt>' + esc(l[0]) + "</dt><dd>" + esc(l[1]) + "</dd></div>";
    }).join("") + "</dl>";
  }
  function encart(type, texte, icone) {
    return '<p class="encart' + (type ? " encart--" + type : "") + '">' + ico(icone || (type === "alerte" ? "alerte" : type === "succes" ? "valide" : "info")) + "<span>" + esc(texte) + "</span></p>";
  }

  var annees = Object.keys(BA.annees).sort().reverse();

  R.innerHTML =
    '<div class="ep">' +
    '<div class="ep-scene">' +
      /* ----- Versements ----- */
      '<section class="panneau ep-versement" aria-labelledby="ep-t-versement">' +
        '<div class="ep-tete"><h2 id="ep-t-versement">Votre épargne</h2><span class="puce puce--epargne">Art. 39 · IRPP</span></div>' +
        bascule("ep-produit", "Produit", [["av", "Assurance vie"], ["cea", "CEA"], ["ac", "Les deux"]], "ep-produits") +
        bascule("ep-freq", "Fréquence des versements", [["Mensuel", "Mois"], ["Trimestriel", "Trimestre"], ["Semestriel", "Semestre"], ["Annuel", "An"]]) +
        '<div class="champ ep-grand-champ" id="ep-bloc-av"><label for="ep-v-av" id="ep-lib-v-av">Versement assurance vie par mois</label><div class="saisie saisie--grande"><input id="ep-v-av" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-ep="versement" data-t="m" aria-describedby="ep-v-av-aide"><span class="saisie__unite" aria-hidden="true">DT</span></div><span class="champ__aide" id="ep-v-av-aide"></span></div>' +
        '<div class="champ ep-grand-champ" id="ep-bloc-cea"><label for="ep-v-cea" id="ep-lib-v-cea">Dépôt CEA par mois</label><div class="saisie saisie--grande"><input id="ep-v-cea" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-ep="versementCea" data-t="m" aria-describedby="ep-v-cea-aide"><span class="saisie__unite" aria-hidden="true">DT</span></div><span class="champ__aide" id="ep-v-cea-aide"></span></div>' +
        '<div class="ep-duo">' +
          '<div id="ep-bloc-iav">' + champ("ep-i-av", "Versement initial (vie)", "initialAv", "m", "DT", "Versé au départ, déductible la 1re année") + "</div>" +
          '<div id="ep-bloc-icea">' + champ("ep-i-cea", "Dépôt initial (CEA)", "initialCea", "m", "DT", "Bloqué 5 ans") + "</div>" +
        "</div>" +
        '<div class="ep-curseur"><div class="ep-curseur__haut"><label for="ep-duree">Durée</label><output id="ep-duree-val" for="ep-duree">15 ans</output></div>' +
          '<input type="range" class="curseur" id="ep-duree" min="1" max="40" step="1" value="15" aria-describedby="ep-duree-aide">' +
          '<p class="champ__aide" id="ep-duree-aide">Assurance vie : 8 ans au moins pour garder l\'avantage fiscal.</p></div>' +
        '<div id="ep-plafonds" hidden></div>' +
      "</section>" +

      /* ----- Résultat (panneau d'encre) ----- */
      '<section class="cosmos ep-resultat" id="ep-resultat" aria-labelledby="ep-res-lib">' +
        '<div class="ep-res__haut"><p class="ep-res__lib" id="ep-res-lib">Économie d\'impôt par an</p><span class="ecart" id="ep-eco-ecart" aria-hidden="true"></span></div>' +
        '<p class="ep-grand"><span class="cache" id="ep-eco-lu" aria-live="polite" aria-atomic="true"></span><span id="ep-eco" aria-hidden="true">0</span><span class="ep-grand__u" aria-hidden="true">DT</span></p>' +
        '<p class="ep-res__sous" id="ep-eco-sous"></p>' +
        '<div class="ep-jauge" aria-hidden="true"><i class="ep-jauge__fill" id="ep-jauge"></i></div>' +
        '<p class="ep-jauge__txt" id="ep-jauge-txt"></p>' +
        '<div class="ep-impots">' +
          '<div class="ep-impot"><span>Impôt <span id="ep-lib-avant">aujourd\'hui</span></span><strong id="ep-imp-avant"></strong><i class="ep-impot__piste" aria-hidden="true"><b class="ep-impot__barre ep-impot__barre--avant" id="ep-b-avant"></b></i></div>' +
          '<div class="ep-impot"><span>Impôt avec cette épargne</span><strong id="ep-imp-apres"></strong><i class="ep-impot__piste" aria-hidden="true"><b class="ep-impot__barre" id="ep-b-apres"></b><em class="ep-impot__plancher" id="ep-b-plancher"></em></i></div>' +
        "</div>" +
        '<p class="ep-statut" id="ep-statut"></p>' +
        '<ul class="ep-tuiles">' +
          '<li><span>Effort réel par mois</span><strong id="ep-effort"></strong></li>' +
          '<li><span>1 DT versé vous coûte</span><strong id="ep-cout"></strong></li>' +
          '<li><span>Capital au terme</span><strong id="ep-cap"></strong></li>' +
          '<li><span>Valeur totale</span><strong id="ep-valeur"></strong></li>' +
        "</ul>" +
        '<div class="ep-optimal" id="ep-optimal"><div><span class="ep-optimal__lib">Montant optimal en assurance vie</span><strong id="ep-opt-val"></strong><small id="ep-opt-sous"></small></div>' +
          '<button type="button" class="bouton bouton--plein bouton--petit" id="ep-opt-appliquer">' + ico("valide") + "Appliquer</button></div>" +
        '<p class="ep-res__note" id="ep-cea-utile"></p>' +
        '<p class="ep-res__note" id="ep-note-contrats" hidden></p>' +
      "</section>" +

      /* ----- Situation ----- */
      '<section class="panneau ep-situation" aria-labelledby="ep-t-situation">' +
        '<div class="ep-tete"><h2 id="ep-t-situation">Votre situation</h2></div>' +
        champ("ep-revenu", "Revenu annuel imposable", "revenu", "m", "DT / an", "Brut annuel moins cotisations sociales, avant frais professionnels. Repris de votre profil.") +
        '<div class="ep-lignes-saisie">' +
          interrupteur("ep-chef", "Chef de famille", "300 DT de déduction par an") +
          compteur("enfants", "Enfants à charge", "100 DT chacun, 4 au plus", 15) +
          compteur("etudiants", "Enfants étudiants", "1 000 DT chacun, sans bourse", 15) +
          compteur("infirmes", "Enfants handicapés", "2 000 DT chacun", 15) +
          compteur("parents", "Parents à charge", "450 DT chacun, 2 au plus", 2) +
        "</div>" +
        '<div class="champ"><label for="ep-annee">Barème appliqué</label><div class="saisie"><select id="ep-annee">' + annees.map(function (a) { return '<option value="' + a + '">' + esc(BA.annees[a].libelle) + "</option>"; }).join("") + '</select>' + ico("chevron", "ep-select-ico") + "</div></div>" +
        '<div class="ep-contrats" id="ep-contrats"></div>' +
      "</section>" +

      /* ----- Partir d'un objectif ----- */
      '<section class="panneau ep-objectif" aria-labelledby="ep-t-objectif">' +
        '<div class="ep-tete"><h2 id="ep-t-objectif">Partir d\'un objectif</h2></div>' +
        '<div class="onglets" role="tablist" aria-label="Type d\'objectif">' +
          '<button type="button" role="tab" id="ep-tab-eco" aria-controls="ep-pan-eco" aria-selected="true">J\'économise par an</button>' +
          '<button type="button" role="tab" id="ep-tab-cap" aria-controls="ep-pan-cap" aria-selected="false" tabindex="-1">Je vise un capital</button>' +
        "</div>" +
        '<div role="tabpanel" id="ep-pan-eco" aria-labelledby="ep-tab-eco" class="ep-inverse">' +
          champ("ep-inv-eco", "Économie d'impôt souhaitée", null, "m", "DT / an", null, ' placeholder="Ex. 1 000"') +
          '<p class="ep-inverse__res" id="ep-inv-eco-res" aria-live="polite"></p>' +
          '<button type="button" class="bouton bouton--epargne bouton--petit" id="ep-inv-eco-app" hidden>' + ico("valide") + "Appliquer ce versement</button>" +
        "</div>" +
        '<div role="tabpanel" id="ep-pan-cap" aria-labelledby="ep-tab-cap" class="ep-inverse" hidden>' +
          champ("ep-inv-cap", "Capital visé au terme", null, "m", "DT", null, ' placeholder="Ex. 100 000"') +
          '<p class="ep-inverse__res" id="ep-inv-cap-res" aria-live="polite"></p>' +
          '<button type="button" class="bouton bouton--epargne bouton--petit" id="ep-inv-cap-app" hidden>' + ico("valide") + "Appliquer ce versement</button>" +
        "</div>" +
      "</section>" +
    "</div>" +

    /* ----- Résultats détaillés ----- */
    '<div class="ep-sections">' +
      '<section class="panneau ep-projection" aria-labelledby="ep-t-proj">' +
        '<div class="ep-tete"><div><h2 id="ep-t-proj">Capital au terme</h2><p class="panneau__sous" id="ep-proj-sous"></p></div></div>' +
        '<p class="ep-erreur" id="ep-proj-err" role="alert" hidden></p>' +
        '<p class="ep-vide" id="ep-proj-vide" hidden>Indiquez un versement pour voir la projection du capital.</p>' +
        '<div id="ep-proj-corps" class="ep-proj-grille"><div class="ep-proj-gauche">' +
          '<ul class="ep-scen" id="ep-scen"></ul>' +
          '<div class="ep-graphe" id="ep-g-proj"></div>' +
          '<div class="ep-legende" aria-hidden="true"><span class="l-bande">Prudent – dynamique</span><span class="l-med">Médian</span><span class="l-verse">Versements cumulés</span><span class="l-reel" id="ep-leg-reel" hidden>Médian en dinars constants</span></div>' +
          '<div class="ep-curseur ep-curseur--annee"><div class="ep-curseur__haut"><label for="ep-annee-lue">Lire une année</label><output id="ep-annee-lue-val" for="ep-annee-lue"></output></div><input type="range" class="curseur" id="ep-annee-lue" min="0" max="15" step="1" value="15"><p class="ep-graphe__info" id="ep-lecture" aria-live="polite"></p></div>' +
          '</div><div class="ep-proj-droite"><div id="ep-proj-lignes"></div>' +
          '<h3 class="ep-sous-titre">Face à une épargne classique</h3>' +
          '<div class="ep-comparatif" id="ep-comparatif"></div>' +
        "</div></div>" +
      "</section>" +
      '<section class="panneau ep-courbe" aria-labelledby="ep-t-courbe">' +
        '<div class="ep-tete"><div><h2 id="ep-t-courbe">Économie selon le montant versé</h2><p class="panneau__sous">Assurance vie versée par an, CEA saisi inchangé. Au-delà de l\'optimal, l\'impôt ne baisse plus.</p></div></div>' +
        '<div class="ep-graphe" id="ep-g-courbe"></div>' +
        '<p class="ep-graphe__info" id="ep-g-courbe-info"></p>' +
      "</section>" +
      '<section class="panneau ep-tranches" aria-labelledby="ep-t-tranches">' +
        '<div class="ep-tete"><div><h2 id="ep-t-tranches">Le calcul de l\'impôt</h2><p class="panneau__sous">Revenu net imposable, puis barème progressif tranche par tranche.</p></div></div>' +
        '<div id="ep-deductions"></div>' +
        '<div class="tableau-cadre" tabindex="0" role="region" aria-labelledby="ep-cap-tranches"><table class="tableau" id="ep-table-tranches"><caption id="ep-cap-tranches">Impôt par tranche, sans et avec cette épargne</caption><thead><tr><th scope="col">Tranche</th><th scope="col">Taux</th><th scope="col">Sans</th><th scope="col">Avec</th><th scope="col">Économie</th></tr></thead><tbody></tbody><tfoot></tfoot></table></div>' +
      "</section>" +
      '<section class="panneau ep-exports" aria-labelledby="ep-t-exports">' +
        '<div class="ep-tete"><div><h2 id="ep-t-exports">Emporter votre simulation</h2><p class="panneau__sous">Tout est préparé sur votre appareil : rien n\'est envoyé.</p></div></div>' +
        '<div class="ep-boutons">' +
          '<button type="button" class="bouton" data-export="pdf">' + ico("telecharger") + "Rapport PDF</button>" +
          '<button type="button" class="bouton" data-export="xlsx">' + ico("telecharger") + "Classeur Excel</button>" +
          '<button type="button" class="bouton" data-export="csv">' + ico("telecharger") + "Tableur CSV</button>" +
          '<button type="button" class="bouton" data-export="ics">' + ico("horloge") + "Rappels agenda</button>" +
          '<button type="button" class="bouton" data-export="recu">' + ico("partager") + "Reçu fiscal (image)</button>" +
          '<button type="button" class="bouton" data-export="texte">' + ico("copier") + "Copier le résumé</button>" +
        "</div>" +
      "</section>" +
    "</div>" +

    /* ----- Mode expert ----- */
    '<section class="ep-expert" aria-labelledby="ep-t-expert">' +
      '<div class="ep-expert__tete"><h2 id="ep-t-expert">Mode expert</h2><p>Hypothèses, sortie anticipée, retraite, risques et comparaisons. Chaque outil se calcule à l\'ouverture.</p></div>' +
      '<div class="ep-outils" id="ep-outils"></div>' +
    "</section>" +

    '<dialog class="dialogue ep-recu" id="ep-recu" aria-labelledby="ep-recu-titre"><div class="dialogue__tete"><h2 id="ep-recu-titre">Reçu fiscal</h2><button type="button" class="bouton bouton--icone bouton--fantome" id="ep-recu-fermer" aria-label="Fermer">' + ico("fermer") + '</button></div>' +
      '<div class="dialogue__corps"><canvas id="ep-recu-canvas" width="1080" height="1350" role="img" aria-label="Aperçu du reçu fiscal à partager"></canvas><p class="champ__aide">Image 1080 × 1350 sans donnée personnelle, prête pour WhatsApp ou LinkedIn.</p></div>' +
      '<div class="dialogue__pied"><button type="button" class="bouton" id="ep-recu-partager" hidden>' + ico("partager") + 'Partager</button><button type="button" class="bouton bouton--plein" id="ep-recu-dl">' + ico("telecharger") + "Télécharger</button></div></dialog>" +
    "</div>";

  /* ===================================================================
     Outils experts (rendus à la première ouverture)
     =================================================================== */
  var OUTILS = [
    { id: "libres", icone: "plus", titre: "Versements libres et retraits", sous: "Versements ponctuels, retraits programmés après 8 ans" },
    { id: "hypotheses", icone: "hausse", titre: "Hypothèses de rendement", sous: "Taux servi, garanti, frais, support, inflation" },
    { id: "rachat", icone: "alerte", titre: "Rachat anticipé et avance", sous: "Sortie avant terme, réintégration fiscale" },
    { id: "sortie", icone: "bouclier", titre: "Capital ou rente, protection", sous: "Rente estimée, capital décès" },
    { id: "retraite", icone: "horloge", titre: "Retraite", sous: "Âge de départ, revenu à la retraite" },
    { id: "mc", icone: "cible", titre: "Projection probabiliste", sous: "5 000 trajectoires de marché" },
    { id: "strategie", icone: "comparer", titre: "Répartition vie / CEA optimale", sous: "Année par année, même budget" },
    { id: "contrats", icone: "comparer", titre: "Comparer des contrats", sous: "2 ou 3 offres d'assurance vie" },
    { id: "scenarios", icone: "liste", titre: "Scénarios côte à côte", sous: "Jusqu'à 4 variantes" },
    { id: "couple", icone: "profil", titre: "Épargne du couple", sous: "Répartir le budget entre conjoints" },
    { id: "stress", icone: "alerte", titre: "Tests de résistance", sous: "Krach, pause, rendements bas, inflation" },
    { id: "objectifs", icone: "cible", titre: "Objectifs de vie", sous: "Études, logement, retraite…" },
    { id: "etsi", icone: "outils", titre: "Et si… ?", sous: "Curseurs sans toucher à la simulation" },
    { id: "annuel", icone: "liste", titre: "Projection année par année", sous: "Versements, capital, économie d'impôt" },
    { id: "methode", icone: "info", titre: "Méthode et règles", sous: "Article 39, plafonds, impôt minimum" }
  ];
  var outilsConstruits = {};
  $("ep-outils").innerHTML = OUTILS.map(function (o) {
    return '<details class="depliant ep-outil" data-outil="' + o.id + '" id="ep-d-' + o.id + '"><summary><span class="depliant__icone">' + ico(o.icone) + "</span><span>" + o.titre + "<small>" + o.sous + '</small></span><svg class="chevron" aria-hidden="true"><use href="/orbite/icones.svg#chevron"/></svg></summary><div class="depliant__corps" id="ep-o-' + o.id + '"></div></details>';
  }).join("");

  /* ===================================================================
     Remplissage des champs depuis l'état
     =================================================================== */
  function valeurChamp(el) {
    var k = el.getAttribute("data-ep"), t = el.getAttribute("data-t"), v = etat[k];
    if (t === "m") return v > 0 ? F.saisie(v) : "";
    if (t === "i") return v ? String(v) : "";
    return libre(v);
  }
  function remplirChamps(racine) {
    (racine || R).querySelectorAll("[data-ep]").forEach(function (el) {
      if (el === doc.activeElement && el.getAttribute("aria-invalid") === "true") return;
      el.value = valeurChamp(el);
      el.setAttribute("aria-invalid", "false");
    });
    cocher("ep-produit", ui.mode);
    cocher("ep-freq", etat.frequence);
    $("ep-chef").checked = !!etat.chef;
    $("ep-annee").value = etat.annee;
    ["enfants", "etudiants", "infirmes", "parents"].forEach(majCompteur);
    majDuree();
    majProduits();
  }
  function cocher(nom, v) { var r = R.querySelector('input[name="' + nom + '"][value="' + v + '"]'); if (r) r.checked = true; }
  function majCompteur(k, saute) {
    var o = $("ep-cpt-" + k);
    o.textContent = String(etat[k] || 0);
    if (saute && !reduit.matches) { o.classList.remove("saute"); void o.offsetWidth; o.classList.add("saute"); }
    R.querySelectorAll('[data-cpt="' + k + '"]').forEach(function (b) {
      b.disabled = Number(b.getAttribute("data-pas")) < 0 ? !(etat[k] > 0) : etat[k] >= Number(b.getAttribute("data-max"));
    });
  }
  function majCurseur(el) {
    var min = Number(el.min), max = Number(el.max), v = Number(el.value);
    el.style.setProperty("--p", (max > min ? (v - min) / (max - min) * 100 : 0) + "%");
    el.style.setProperty("--c", "var(--epargne)");
  }
  function majDuree() {
    var d = $("ep-duree");
    d.value = String(etat.dureeAns);
    d.disabled = etat.ageDepart > 0;
    $("ep-duree-val").textContent = pluriel(etat.dureeAns, "an");
    $("ep-duree-aide").textContent = etat.ageDepart > 0
      ? "Durée calée sur votre départ à la retraite à " + etat.ageDepart + " ans (mode expert, Retraite)."
      : "Assurance vie : 8 ans au moins pour garder l'avantage fiscal. CEA : chaque dépôt est bloqué 5 ans.";
    majCurseur(d);
  }
  function majProduits() {
    var f = etat.frequence, per = PERIODE[f];
    $("ep-bloc-av").hidden = ui.mode === "cea";
    $("ep-bloc-iav").hidden = ui.mode === "cea";
    $("ep-bloc-cea").hidden = ui.mode === "av";
    $("ep-bloc-icea").hidden = ui.mode === "av";
    $("ep-lib-v-av").textContent = "Versement assurance vie " + per;
    $("ep-lib-v-cea").textContent = "Dépôt CEA " + per;
    R.querySelector(".ep-duo").classList.toggle("ep-duo--seul", ui.mode !== "ac");
  }

  /* ===================================================================
     Rendu principal
     =================================================================== */
  var minuterieLu = null, premierRendu = true;

  function calculer(anime) {
    var e = effectif();
    res = calculerComplet(e, existant());
    rendre(!!anime);
  }
  var rafCalcul = null;
  function planifier(anime) {
    if (anime) { cancelAnimationFrame(rafCalcul); rafCalcul = null; calculer(true); return; }
    if (rafCalcul) return;
    rafCalcul = requestAnimationFrame(function () { rafCalcul = null; calculer(false); });
  }
  var minuterieModif = null;
  function signaler() { clearTimeout(minuterieModif); minuterieModif = setTimeout(function () { O.modifie("epargne"); }, 400); }

  function rendre(anime) {
    var c = res, s = c.sim, e = c.etat, f = c.facteur;
    var instant = !anime || premierRendu;
    /* Aides sous les champs */
    $("ep-v-av-aide").textContent = c.investissementAv > 0 ? "Soit " + dt(c.investissementAv) + " la 1re année" + (s.economieAv > 0.0005 ? " · économie " + dt(s.economieAv) : "") : "Plafond de déduction : " + dt0(s.produits.av.plafond) + " par an.";
    $("ep-v-cea-aide").textContent = c.investissementCea > 0 ? "Soit " + dt(c.investissementCea) + " la 1re année" + (s.economieCea > 0.0005 ? " · économie " + dt(s.economieCea) : "") : "Le CEA seul réduit l'impôt de 40 % au plus.";
    /* Plafonds */
    var msg = [];
    if (s.horsPlafondAv > 0) msg.push("Assurance vie : " + dt(s.horsPlafondAv) + " au-delà du plafond de " + dt0(s.produits.av.plafond) + " par an, non déductible.");
    if (s.horsPlafondCea > 0) msg.push("CEA : " + dt(s.horsPlafondCea) + " au-delà du plafond de " + dt0(s.produits.cea.plafond) + " par an, non déductible.");
    var pl = $("ep-plafonds");
    pl.hidden = !msg.length;
    pl.innerHTML = msg.length ? encart("alerte", msg.join(" ")) : "";

    /* ----- Résultat principal ----- */
    var elEco = $("ep-eco");
    O.animerNombre(elEco, s.economie, function (v) { return F.dt0(v); }, { instantane: instant, ecart: $("ep-eco-ecart"), formatEcart: function (v) { return F.dt0(v) + " DT"; } });
    clearTimeout(minuterieLu);
    minuterieLu = setTimeout(function () { $("ep-eco-lu").textContent = "Économie d'impôt : " + dt3(res.sim.economie) + " par an."; }, anime ? 50 : 700);
    $("ep-res-lib").textContent = s.exAv > 0 || s.exCea > 0 ? "Économie d'impôt supplémentaire par an" : "Économie d'impôt par an";
    $("ep-eco-sous").textContent = s.impotInitial > 0
      ? dt3(s.economie) + " par an, soit " + dt(s.economie / 12) + " par mois · " + pc(s.tauxReduction) + " d'impôt en moins"
      : "Votre revenu ne supporte pas d'impôt : aucune économie possible.";
    var ratio = s.economieMax > 0 ? Math.min(1, s.economie / s.economieMax) : 0;
    $("ep-jauge").style.setProperty("--r", ratio.toFixed(4));
    $("ep-jauge-txt").textContent = s.economieMax > 0.0005 ? Math.round(ratio * 100) + " % de l'économie maximale possible (" + dt(s.economieMax) + " par an)" : "";
    $("ep-lib-avant").textContent = s.exAv > 0 || s.exCea > 0 ? "avec vos contrats actuels" : "aujourd'hui";
    $("ep-imp-avant").textContent = dt(s.impotAvant);
    $("ep-imp-apres").textContent = dt(s.impotApres);
    var ref = s.impotAvant > 0 ? s.impotAvant : 1;
    $("ep-b-avant").style.setProperty("--r", s.impotAvant > 0 ? "1" : "0");
    $("ep-b-apres").style.setProperty("--r", (s.impotApres / ref).toFixed(4));
    var plancher = $("ep-b-plancher");
    plancher.hidden = !(s.impotAvant > 0);
    plancher.style.setProperty("--r", Math.min(1, s.impotMinimum / ref).toFixed(4));
    var statut = $("ep-statut");
    if (!(s.impotInitial > 0)) { statut.className = "ep-statut"; statut.innerHTML = ico("info") + "<span>Aucun impôt à réduire.</span>"; }
    else if (s.plancherAtteint) { statut.className = "ep-statut ep-statut--ok"; statut.innerHTML = ico("valide") + "<span>Plancher légal atteint : l'impôt est à 45 % de l'impôt initial.</span>"; }
    else if (s.economieMax - s.economie > 0.5) { statut.className = "ep-statut"; statut.innerHTML = ico("cible") + "<span>Encore " + esc(dt(s.economieMax - s.economie)) + " d'économie possible par an.</span>"; }
    else { statut.className = "ep-statut ep-statut--ok"; statut.innerHTML = ico("valide") + "<span>Économie maximale atteinte pour ce CEA.</span>"; }
    $("ep-effort").textContent = dt(Math.max(0, c.investissement - s.economie) / 12);
    $("ep-cout").textContent = c.investissement > 0 ? F.dt3(Math.max(0, 1 - s.economie / c.investissement)) + " DT" : "—";
    $("ep-cap").textContent = c.actif ? dt0(c.med.capitalFinal) : "—";
    $("ep-valeur").textContent = c.actif ? dt0(c.valeurTotale) : "—";
    /* Montant optimal */
    var opt = s.optimal, btn = $("ep-opt-appliquer");
    if (opt > 0) {
      var fixe = partFixeAv(c), per = plafond3((opt - fixe) / f);
      $("ep-opt-val").textContent = dt(opt) + " par an";
      $("ep-opt-sous").textContent = s.investissementCea > 0 ? "Avec votre CEA, soit " + dt(per) + " " + PERIODE[e.frequence] + "." : "Soit " + dt(per) + " " + PERIODE[e.frequence] + " pour atteindre le plancher de 45 %.";
      btn.hidden = false;
      btn.disabled = Math.abs((ui.mode === "cea" ? 0 : etat.versement) - per) < 0.0005;
      btn.setAttribute("data-valeur", String(per));
    } else {
      $("ep-opt-val").textContent = "—";
      $("ep-opt-sous").textContent = s.impotInitial > 0 ? "Vos contrats atteignent déjà le plancher légal." : "Aucun impôt à réduire.";
      btn.hidden = true;
    }
    var cu = $("ep-cea-utile");
    cu.textContent = s.impotInitial > 0 && ui.mode !== "av"
      ? "CEA : au-delà de " + dt(s.ceaUtile) + " par an, un dépôt de plus ne réduit plus l'impôt (impôt minimum 60 %)."
      : s.impotInitial > 0 ? "Le CEA peut compléter l'assurance vie : jusqu'à 40 % d'impôt en moins à lui seul." : "";
    var nc = $("ep-note-contrats");
    nc.hidden = !(s.exAv > 0 || s.exCea > 0);
    nc.textContent = "Vos contrats actuels (" + dt(s.exAv + s.exCea) + " par an) économisent déjà " + dt(s.economieExistante) + " : les chiffres ci-dessus s'y ajoutent.";

    rendreCourbe();
    rendreProjection(instant);
    rendreTranches();
    majInverses();
    majOutils();
    premierRendu = false;
  }

  /* ===================================================================
     Graphiques SVG
     =================================================================== */
  function largeur(el) { return Math.max(280, Math.round(el.clientWidth || el.getBoundingClientRect().width || 600)); }
  function joli(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function chemin(pts) { return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(""); }

  /* o = { el, aria, xMax, yMax, entier, hauteur, series: [{ type: 'ligne'|'aire'|'bande', pts | haut+bas, cls, anime }], verticales, points, horizontales, curseurX } */
  function graphe(o) {
    var W = largeur(o.el), H = o.hauteur || (W < 520 ? 220 : 260);
    var M = { g: W < 420 ? 44 : 54, d: 14, h: 14, b: 30 };
    var yMax = joli(o.yMax), xMax = o.xMax || 1;
    function X(v) { return M.g + v / xMax * (W - M.g - M.d); }
    function Y(v) { return M.h + (1 - v / yMax) * (H - M.h - M.b); }
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria) + '" class="ep-svg' + (o.anime ? " ep-trace" : "") + '" focusable="false">';
    for (var i = 0; i <= 4; i++) {
      var vy = yMax * i / 4, yy = Y(vy).toFixed(1);
      s += '<line class="ep-g-grille" x1="' + M.g + '" x2="' + (W - M.d) + '" y1="' + yy + '" y2="' + yy + '"/>';
      s += '<text class="ep-g-txt" x="' + (M.g - 8) + '" y="' + yy + '" dy="4" text-anchor="end">' + court(vy) + "</text>";
    }
    var pas = o.entier ? Math.max(1, Math.ceil(xMax / (W < 420 ? 4 : 8))) : xMax / 4;
    for (var vx = 0; vx <= xMax + 1e-9; vx += pas) {
      s += '<text class="ep-g-txt" x="' + X(vx).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + (o.entier ? String(Math.round(vx)) : court(vx)) + "</text>";
    }
    (o.series || []).forEach(function (se) {
      if (se.type === "bande") {
        var haut = se.haut.map(function (p) { return [X(p[0]), Y(p[1])]; }), bas = se.bas.map(function (p) { return [X(p[0]), Y(p[1])]; }).reverse();
        s += '<path class="' + se.cls + ' ep-anim-aire" d="' + chemin(haut) + bas.map(function (p) { return "L" + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("") + 'Z"/>';
      } else if (se.type === "aire") {
        var pts = se.pts.map(function (p) { return [X(p[0]), Y(p[1])]; });
        s += '<path class="' + se.cls + ' ep-anim-aire" d="' + chemin(pts) + "L" + pts[pts.length - 1][0].toFixed(1) + " " + Y(0).toFixed(1) + "L" + pts[0][0].toFixed(1) + " " + Y(0).toFixed(1) + 'Z"/>';
      } else {
        s += '<path class="' + se.cls + (se.anime !== false ? " ep-anim" : "") + '" pathLength="1" d="' + chemin(se.pts.map(function (p) { return [X(p[0]), Y(Math.min(p[1], yMax))]; })) + '"/>';
      }
    });
    (o.horizontales || []).forEach(function (h) {
      if (!(h.y > 0) || h.y > yMax) return;
      var yh = Y(h.y).toFixed(1);
      s += '<line class="' + h.cls + '" x1="' + M.g + '" x2="' + (W - M.d) + '" y1="' + yh + '" y2="' + yh + '"/><text class="ep-g-lib" x="' + (W - M.d) + '" y="' + yh + '" dy="-6" text-anchor="end">' + esc(h.lib) + "</text>";
    });
    (o.verticales || []).forEach(function (v) {
      if (!(v.x >= 0) || v.x > xMax) return;
      var xv = X(v.x).toFixed(1);
      s += '<line class="' + v.cls + '" x1="' + xv + '" x2="' + xv + '" y1="' + M.h + '" y2="' + (H - M.b) + '"/>';
      if (v.lib) s += '<text class="ep-g-lib" x="' + xv + '" y="' + (M.h + 10) + '" dx="' + (X(v.x) > W - 90 ? -6 : 6) + '" text-anchor="' + (X(v.x) > W - 90 ? "end" : "start") + '">' + esc(v.lib) + "</text>";
    });
    (o.points || []).forEach(function (p) {
      s += '<circle class="' + p.cls + '" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(Math.min(p.y, yMax)).toFixed(1) + '" r="' + (p.r || 6) + '"/>';
    });
    s += "</svg>";
    o.el.innerHTML = s;
    return { X: X, Y: Y, W: W, H: H };
  }
  var tracesFaits = {};
  function animerUneFois(cle) { if (tracesFaits[cle] || reduit.matches) return false; tracesFaits[cle] = true; return true; }

  function rendreCourbe() {
    var s = res.sim, el = $("ep-g-courbe");
    var inv = s.investissementAv;
    var xMax = joli(Math.max(s.optimal * 1.4, inv * 1.15, 1000));
    var pts = [];
    for (var i = 0; i <= 48; i++) { var x = xMax * i / 48; pts.push([x, economiePour(x)]); }
    var yMax = Math.max(s.economieMax, 1);
    var eco = economiePour(inv);
    graphe({
      el: el, aria: "Courbe de l'économie d'impôt selon l'assurance vie versée par an : " + dt(eco) + " pour " + dt(inv) + ", optimal à " + dt(s.optimal) + ".",
      xMax: xMax, yMax: yMax, anime: animerUneFois("courbe"),
      series: [{ type: "aire", pts: pts, cls: "ep-c-aire" }, { type: "ligne", pts: pts, cls: "ep-c-ligne" }],
      verticales: s.optimal > 0 ? [{ x: s.optimal, cls: "ep-c-opt", lib: "Optimal " + court(s.optimal) }] : [],
      points: inv > 0 ? [{ x: Math.min(inv, xMax), y: eco, cls: "ep-c-point" }] : []
    });
    $("ep-g-courbe-info").textContent = inv > 0
      ? "Avec " + dt(inv) + " par an en assurance vie : " + dt(eco) + " d'économie." + (s.optimal > 0 && inv < s.optimal - 1 ? " L'économie augmente jusqu'à " + dt(s.optimal) + " par an." : s.optimal > 0 && inv > s.optimal + 1 ? " Au-delà de " + dt(s.optimal) + ", le supplément ne réduit plus l'impôt." : "")
      : "Ajoutez un versement en assurance vie pour placer votre point sur la courbe.";
  }

  function libelleTaux(c, k) {
    var p = [];
    if (c.aAv) p.push((c.aCea ? "vie " : "") + pc(c.taux.av[k]));
    if (c.aCea) p.push((c.aAv ? "CEA " : "") + pc(c.taux.cea[k]));
    return p.join(" · ");
  }
  var MESSAGES = {
    duree: "La durée doit être un nombre entier d'années entre 1 et 40.", rendement: "Le taux servi doit être compris entre 0 et 50 %.",
    garanti: "Le taux garanti doit être compris entre 0 et 20 % et ne pas dépasser le taux servi.", frais: "Les frais de gestion doivent être compris entre 0 et 20 %.",
    fraisEntree: "Les frais sur versement doivent être compris entre 0 et 10 %.", rendementCea: "Le rendement du CEA doit être compris entre 0 et 50 %.",
    fraisCea: "Les frais du CEA doivent être compris entre 0 et 10 %.", ecartCea: "L'écart entre scénarios du CEA doit être compris entre 0 et 30 points.",
    compar: "Le taux de l'épargne classique doit être compris entre 0 et 50 %.", ecart: "L'écart entre scénarios doit être compris entre 0 et 20 points.",
    croissance: "La hausse annuelle doit être comprise entre 0 et 20 %.", inflation: "L'inflation doit être comprise entre 0 et 30 %.",
    impotInterets: "L'impôt sur les intérêts doit être compris entre 0 et 50 %.", montant: "Vérifiez les montants saisis."
  };
  var CHAMP_ERREUR = { rendement: "rendementPct", garanti: "tauxGarantiPct", frais: "fraisPct", fraisEntree: "fraisEntreePct", rendementCea: "rendementCeaPct", fraisCea: "fraisCeaPct", ecartCea: "ecartCeaPct", compar: "comparPct", ecart: "ecartPct", croissance: "croissancePct", inflation: "inflationPct", impotInterets: "impotInteretsPct", retraitDebut: "retraitDebut", retraitTot: "retraitDebut" };
  function messageErreur(err) {
    if (!err) return "";
    if (err.code === "libres") return "Chaque versement libre doit avoir une année entre 1 et " + err.max + " et un montant positif.";
    if (err.code === "retraitDebut") return "L'année de début des retraits doit être comprise entre 1 et " + err.max + ".";
    if (err.code === "retraitTot") return "Les retraits programmés commencent au plus tôt l'année " + err.min + " (durée minimale de l'assurance vie).";
    return MESSAGES[err.code] || "Vérifiez les hypothèses.";
  }
  function lignesProjection(c) {
    var e = c.etat, med = c.med;
    var l = [["Total versé sur " + pluriel(e.dureeAns, "an"), dt(med.totalVerse)], ["Capital au terme (médian)", dt(med.capitalFinal), "fort"]];
    if (c.aAv && c.aCea) l.push(["dont assurance vie", dt(c.medAv.capitalFinal), "sous"], ["dont CEA", dt(c.medCea.capitalFinal), "sous"]);
    if (med.totalRetire > 0) l.push(["Retraits programmés perçus", dt(med.totalRetire)]);
    l.push(["Gains financiers", signe(med.gain)]);
    l.push(["Économie d'impôt cumulée" + (e.reinvestir ? " (réinvestie)" : ""), dt(med.economieCumulee)]);
    l.push(["Valeur totale (capital + économie d'impôt)", dt(c.valeurTotale), "fort"]);
    if (e.inflationPct > 0) l.push(["Capital en dinars d'aujourd'hui (inflation " + pc(e.inflationPct) + ")", dt(med.capitalFinalReel)]);
    if (e.croissancePct > 0) l.push(["Versement de la dernière année (+" + pc(e.croissancePct) + " par an)", dt(med.flux[med.flux.length - 1].versement * c.facteur)]);
    l.push(["Rendement annuel effectif, économie d'impôt comprise", c.effectif == null ? "—" : pc(c.effectif)]);
    return l;
  }
  function elementsComparatif(c) {
    var e = c.etat;
    return [
      ["Votre épargne : capital + économie d'impôt", c.valeurTotale, "c1"],
      ["Épargne classique à " + pc(e.comparPct) + ", avant impôt", c.classique, "c2"],
      ["Épargne classique après impôt de " + pc(c.impotInteretsPct) + " sur les intérêts", c.classiqueNet, "c3"],
      ["Versements cumulés", c.med.totalVerse, "c4"]
    ];
  }
  function rendreProjection(instant) {
    var c = res, e = c.etat;
    var err = c.erreur;
    $("ep-proj-err").hidden = !err;
    $("ep-proj-err").textContent = messageErreur(err);
    $("ep-proj-vide").hidden = !!err || c.actif;
    $("ep-proj-corps").hidden = !c.actif;
    $("ep-proj-sous").textContent = "Dans " + pluriel(e.dureeAns, "an") + ", selon trois scénarios de rendement net de frais.";
    if (!c.actif) return;
    $("ep-scen").innerHTML = ["prudent", "median", "dynamique"].map(function (k) {
      return '<li class="ep-scen--' + k + '"><span>' + NOMS_SCEN[k] + " · " + esc(libelleTaux(c, k)) + "</span><strong>" + esc(dt0(c.sc[k].capitalFinal)) + "</strong></li>";
    }).join("");
    dessinerProjection(!instant ? false : animerUneFois("proj"));
    var curseur = $("ep-annee-lue");
    var garder = curseur.getAttribute("data-touche") === "1" && Number(curseur.value) <= e.dureeAns;
    curseur.max = String(e.dureeAns);
    if (!garder) curseur.value = String(e.dureeAns);
    majCurseur(curseur);
    lireAnnee();
    $("ep-proj-lignes").innerHTML = lignes(lignesProjection(c));
    var el = elementsComparatif(c), max = Math.max.apply(null, el.map(function (x) { return x[1]; })) || 1;
    $("ep-comparatif").innerHTML = el.map(function (x) {
      return '<div class="ep-cmp"><span class="ep-cmp__lib">' + esc(x[0]) + '</span><strong class="ep-cmp__val">' + esc(dt0(x[1])) + '</strong><i class="ep-cmp__piste" aria-hidden="true"><b class="ep-cmp__barre ' + x[2] + '" data-r="' + (Math.max(0, x[1]) / max).toFixed(4) + '"></b></i></div>';
    }).join("") + '<p class="ep-cmp__bilan">' + (c.avantage >= 0 ? "Avantage sur l'épargne classique : " : "Écart avec l'épargne classique : ") + "<strong>" + esc(signe(c.avantage, dt0)) + "</strong></p>";
    poserR($("ep-comparatif"));
  }
  var geoProj = null;
  function dessinerProjection(anime) {
    var c = res, sc = c.sc, e = c.etat;
    function serie(p, cle) { return p.annees.map(function (a) { return [a.annee, a[cle]]; }); }
    var yMax = Math.max(sc.dynamique.capitalFinal, c.med.totalVerse, 1);
    sc.dynamique.annees.forEach(function (a) { yMax = Math.max(yMax, a.capital); });
    var series = [
      { type: "bande", haut: serie(sc.dynamique, "capital"), bas: serie(sc.prudent, "capital"), cls: "ep-p-bande" },
      { type: "ligne", pts: serie(sc.median, "verse"), cls: "ep-p-verse", anime: false },
      { type: "ligne", pts: serie(sc.prudent, "capital"), cls: "ep-p-bord" },
      { type: "ligne", pts: serie(sc.dynamique, "capital"), cls: "ep-p-bord" }
    ];
    if (e.inflationPct > 0) series.push({ type: "ligne", pts: serie(sc.median, "capitalReel"), cls: "ep-p-reel", anime: false });
    series.push({ type: "ligne", pts: serie(sc.median, "capital"), cls: "ep-p-med" });
    $("ep-leg-reel").hidden = !(e.inflationPct > 0);
    var a = Number($("ep-annee-lue").value);
    if (!(a >= 0 && a <= e.dureeAns)) a = e.dureeAns;
    geoProj = graphe({
      el: $("ep-g-proj"), aria: "Capital constitué année par année : prudent " + dt0(sc.prudent.capitalFinal) + ", médian " + dt0(sc.median.capitalFinal) + ", dynamique " + dt0(sc.dynamique.capitalFinal) + " au terme.",
      xMax: e.dureeAns, yMax: yMax, entier: true, anime: anime, series: series,
      verticales: [{ x: a, cls: "ep-p-curseur" }],
      points: [{ x: a, y: sc.median.annees[a].capital, cls: "ep-p-point", r: 5 }]
    });
  }
  function lireAnnee() {
    if (!res || !res.actif) return;
    var c = res, a = Number($("ep-annee-lue").value), sc = c.sc;
    $("ep-annee-lue-val").textContent = a === 0 ? "Départ" : "Année " + a;
    var l = sc.median.annees[a];
    $("ep-lecture").textContent = (a === 0 ? "Au départ" : "Fin de l'année " + a) + " : versé " + dt0(l.verse) + ", capital médian " + dt0(l.capital) + " (prudent " + dt0(sc.prudent.annees[a].capital) + ", dynamique " + dt0(sc.dynamique.annees[a].capital) + ")" + (c.etat.inflationPct > 0 ? ", soit " + dt0(l.capitalReel) + " en dinars d'aujourd'hui" : "") + ".";
  }

  function rendreTranches() {
    var s = res.sim, det = s.deductionsDetail, d = s.regles.deductions, e = res.etat;
    var exist = s.exAv > 0 || s.exCea > 0;
    var l = [["Revenu annuel imposable", dt3(s.revenu)], ["Frais professionnels (10 %, " + F.dt0(d.fraisProfessionnelsMax) + " DT au plus)", "− " + dt3(det.fraisProfessionnels), "sous"]];
    if (det.chefDeFamille) l.push(["Chef de famille", "− " + dt3(det.chefDeFamille), "sous"]);
    if (det.enfants) l.push(["Enfants à charge (" + e.enfants + ")", "− " + dt3(det.enfants), "sous"]);
    if (det.enfantsInfirmes) l.push(["Enfants handicapés (" + e.infirmes + ")", "− " + dt3(det.enfantsInfirmes), "sous"]);
    if (det.etudiants) l.push(["Étudiants (" + e.etudiants + ")", "− " + dt3(det.etudiants), "sous"]);
    if (det.parents) l.push(["Parents à charge (" + e.parents + ")", "− " + dt3(det.parents), "sous"]);
    l.push(["Revenu net imposable", dt3(s.revenuNet), "fort"]);
    if (s.deductionAv > 0) l.push(["Assurance vie déduite" + (s.exAv > 0 ? " (contrats actuels compris)" : ""), "− " + dt3(Math.min(s.deductionAv, s.revenuNet)), "sous"]);
    if (s.deductionCea > 0) l.push(["CEA déduit" + (s.exCea > 0 ? " (contrats actuels compris)" : ""), "− " + dt3(Math.min(s.deductionCea, Math.max(0, s.revenuNet - s.deductionAv))), "sous"]);
    l.push(["Revenu après déduction", dt3(s.revenuNetApres), "fort"]);
    $("ep-deductions").innerHTML = lignes(l);
    $("ep-cap-tranches").textContent = "Impôt par tranche " + (exist ? "avec vos contrats actuels, puis avec cette épargne en plus" : "sans et avec cette épargne") + " (" + s.regles.libelle + "). Impôt minimum : 45 % de l'impôt initial avec l'assurance vie, 60 % avec le CEA seul.";
    var tAv = 0, tAp = 0;
    var corps = s.avant.parTranche.map(function (b, i) {
      var a = s.apres.parTranche[i] || { impot: 0 };
      tAv += b.impot; tAp += a.impot;
      var actif = b.impot > 0.0005 || a.impot > 0.0005 || b.montant > 0;
      var eco = b.impot - a.impot;
      return "<tr" + (actif ? "" : ' class="ep-inactif"') + "><td>" + F.dt0(b.min) + (b.max === Infinity ? " et plus" : " – " + F.dt0(b.max)) + "</td><td>" + F.pct(b.taux, 0) + '</td><td class="mono">' + F.dt3(b.impot) + '</td><td class="mono">' + F.dt3(a.impot) + '</td><td class="mono' + (eco > 0.0005 ? " ep-pos" : "") + '">' + (Math.abs(eco) < 0.0005 ? "—" : (eco < 0 ? "−" : "") + F.dt3(Math.abs(eco))) + "</td></tr>";
    }).join("");
    var tb = $("ep-table-tranches");
    tb.tBodies[0].innerHTML = corps;
    tb.tFoot.innerHTML = '<tr class="cle"><td>Total</td><td></td><td class="mono">' + F.dt3(tAv) + '</td><td class="mono">' + F.dt3(tAp) + '</td><td class="mono ep-pos">' + F.dt3(tAv - tAp) + "</td></tr>";
    tb.querySelector("thead th:nth-child(3)").textContent = exist ? "Aujourd'hui" : "Sans";
  }

  /* ===================================================================
     Modes inverses
     =================================================================== */
  var inverse = { eco: null, cap: null };
  function champVersement() { return ui.mode === "cea" ? "versementCea" : "versement"; }
  function majInverses() {
    var c = res, s = c.sim, f = c.facteur, per = PERIODE[c.etat.frequence];
    /* Économie visée */
    var r = lireNb("ep-inv-eco"), out = $("ep-inv-eco-res"), b = $("ep-inv-eco-app");
    inverse.eco = null; b.hidden = true; out.className = "ep-inverse__res";
    if (r.vide) out.textContent = "Indiquez l'économie souhaitée : le versement en assurance vie nécessaire s'affiche ici" + (c.investissementCea > 0 ? ", en plus de votre CEA." : ".");
    else if (!r.valide) { out.textContent = "Saisissez un montant valide (ex. 1 000)."; out.classList.add("ko"); }
    else if (!(s.impotInitial > 0)) out.textContent = "Aucune économie possible : votre impôt est nul.";
    else {
      var maxAv = Math.min(s.produits.av.plafond, Math.max(0, s.revenuNet));
      var ecoMax = economiePour(maxAv);
      if (r.valeur > ecoMax + 0.0005) { out.textContent = "Objectif hors de portée : l'économie maximale est de " + dt(ecoMax) + " par an (impôt minimum de 45 %)."; out.classList.add("ko"); }
      else {
        var bas = 0, haut = maxAv;
        if (economiePour(0) >= r.valeur) haut = 0;
        for (var n = 0; n < 70 && haut - bas > 1e-4; n++) { var m = (bas + haut) / 2; if (economiePour(m) >= r.valeur) haut = m; else bas = m; }
        var p = plafond3((haut - partFixeAv(c)) / f);
        out.textContent = "Versez " + dt(haut) + " par an en assurance vie, soit " + dt(p) + " " + per + ".";
        out.classList.add("ok");
        inverse.eco = p;
        b.hidden = Math.abs((ui.mode === "cea" ? -1 : etat.versement) - p) < 0.0005;
      }
    }
  }
  function capitalAvec(champ, v) {
    var e = effectif(); e[champ] = v;
    var c = calculerComplet(e, existant());
    return c.actif ? c.med.capitalFinal : 0;
  }
  var minuterieCap = null;
  function majCapital() {
    var r = lireNb("ep-inv-cap"), out = $("ep-inv-cap-res"), b = $("ep-inv-cap-app"), c = res;
    inverse.cap = null; b.hidden = true; out.className = "ep-inverse__res";
    if (r.vide) { out.textContent = "Indiquez le capital souhaité dans " + pluriel(c.etat.dureeAns, "an") + " : le versement nécessaire s'affiche ici (scénario médian)."; return; }
    if (!r.valide || !(r.valeur > 0)) { out.textContent = "Saisissez un montant valide (ex. 100 000)."; out.classList.add("ko"); return; }
    if (c.erreur) { out.textContent = "Corrigez d'abord les hypothèses de projection."; out.classList.add("ko"); return; }
    var champ = champVersement();
    var e0 = effectif();
    var sansVersement = capitalAvec(champ, 0);
    if (sansVersement >= r.valeur) { out.textContent = "Votre versement initial suffit déjà à atteindre ce capital."; out.classList.add("ok"); return; }
    var bas = 0, haut = Math.max(1, r.valeur / Math.max(1, e0.dureeAns * c.facteur));
    var garde = 0;
    while (capitalAvec(champ, haut) < r.valeur && garde++ < 40) haut *= 2;
    for (var n = 0; n < 50 && haut - bas > 0.0005; n++) { var m = (bas + haut) / 2; if (capitalAvec(champ, m) >= r.valeur) haut = m; else bas = m; }
    var v = plafond3(haut);
    out.textContent = "Versez " + dt(v) + " " + PERIODE[c.etat.frequence] + " " + (champ === "versementCea" ? "sur le CEA" : "en assurance vie") + " pour réunir " + dt0(capitalAvec(champ, v)) + " en " + pluriel(c.etat.dureeAns, "an") + " (médian)." + (c.etat.croissancePct > 0 ? " Montant de la 1re année, puis +" + pc(c.etat.croissancePct) + " par an." : "");
    out.classList.add("ok");
    inverse.cap = v;
    b.hidden = Math.abs(etat[champ] - v) < 0.0005;
  }
  function planifierCapital() { clearTimeout(minuterieCap); minuterieCap = setTimeout(majCapital, 160); }

  /* Applique un versement par période, avec la puce qui vole jusqu'au champ */
  function appliquerVersement(champ, v, source) {
    if (champ === "versement" && ui.mode === "cea") ui.mode = "ac";
    if (champ === "versementCea" && ui.mode === "av") ui.mode = "ac";
    etat[champ] = arr3(v);
    remplirChamps();
    O.placerPastilles(R);
    var cible = $(champ === "versementCea" ? "ep-v-cea" : "ep-v-av");
    O.puceVolante(source, cible, F.dt(v) + " DT", "epargne");
    planifier(true);
    signaler();
  }

  /* ===================================================================
     Contrats déjà détenus (profil)
     =================================================================== */
  function rendreContrats() {
    var x = ui.existant, box = $("ep-contrats"), annee = new Date().getFullYear();
    if (!x.liste.length) {
      box.innerHTML = '<p class="ep-contrats__vide">' + ico("info") + '<span>Aucun contrat d\'assurance vie ou CEA dans votre profil. <a href="#profil">Les déclarer</a> pour calculer l\'économie supplémentaire.</span></p>';
      return;
    }
    box.innerHTML = '<h3 class="ep-sous-titre">Vos contrats actuels</h3><ul class="ep-contrats__liste">' + x.liste.map(function (c) {
      var age = annee - c.anneeDebut, lim = c.type === "cea" ? 5 : 8;
      return '<li><span class="puce ' + (c.type === "cea" ? "" : "puce--epargne") + '">' + (c.type === "cea" ? "CEA" : "Vie") + "</span><span class=\"ep-contrats__nom\"><strong>" + esc(c.libelle) + "</strong><small>" + esc(dt(c.versementMensuel)) + " par mois" + (c.capitalActuel > 0 ? " · " + esc(dt0(c.capitalActuel)) + " acquis" : "") + " · depuis " + c.anneeDebut + (c.type === "av" ? (age >= lim ? " · 8 ans atteints" : " · 8 ans en " + (c.anneeDebut + lim)) : "") + "</small></span></li>";
    }).join("") + "</ul>" + interrupteur("ep-inclure", "Tenir compte de mes contrats", "L'économie affichée est alors celle qui s'ajoute à vos contrats.");
    $("ep-inclure").checked = ui.inclure;
  }
  function lireContrats(profil) {
    var p = OC.normaliser(profil || {}), av = 0, cea = 0;
    p.contrats.forEach(function (c) { if (c.type === "cea") cea += c.versementMensuel * 12; else av += c.versementMensuel * 12; });
    ui.existant = { av: av, cea: cea, liste: p.contrats };
  }

  /* ===================================================================
     Outils experts
     =================================================================== */
  function ouvert(id) { var d = $("ep-d-" + id); return d && d.open && outilsConstruits[id]; }
  function majOutils() {
    Object.keys(outilsConstruits).forEach(function (id) { if ($("ep-d-" + id).open && MAJ[id]) MAJ[id](); });
  }
  var CONSTRUIRE = {}, MAJ = {};

  /* --- Versements libres et retraits --- */
  CONSTRUIRE.libres = function () {
    return '<div class="ep-bloc"><h3 class="ep-sous-titre">Versements libres en assurance vie</h3><p class="champ__aide">Versés en fin d\'année, déductibles l\'année du versement. Dix au plus.</p><div id="ep-libres-liste" class="ep-libres"></div>' +
      '<button type="button" class="bouton bouton--petit" id="ep-libre-ajout">' + ico("plus") + "Ajouter un versement libre</button></div>" +
      '<div class="ep-bloc"><h3 class="ep-sous-titre">Retraits programmés</h3><p class="champ__aide">Un montant retiré chaque fin d\'année, à partir de la 8e année au plus tôt (au-delà, pas de réintégration).</p><div class="ep-champs">' +
      champ("ep-retrait-debut", "À partir de l'année", "retraitDebut", "i", "", null) + champ("ep-retrait-montant", "Montant par an", "retraitMontant", "m", "DT", null) + "</div></div>" +
      '<p class="ep-erreur" id="ep-libres-err" role="alert" hidden></p>';
  };
  function rendreLibres() {
    var box = $("ep-libres-liste");
    if (!box) return;
    box.innerHTML = (etat.libres || []).map(function (l, i) {
      return '<div class="ep-libre"><div class="champ"><label for="ep-lib-a-' + i + '">Année</label><div class="saisie"><input id="ep-lib-a-' + i + '" type="text" inputmode="numeric" autocomplete="off" data-libre="' + i + '" data-k="annee" value="' + esc(l.annee) + '"></div></div>' +
        '<div class="champ"><label for="ep-lib-m-' + i + '">Montant</label><div class="saisie"><input id="ep-lib-m-' + i + '" type="text" inputmode="decimal" autocomplete="off" data-libre="' + i + '" data-k="montant" value="' + esc(F.saisie(l.montant)) + '"><span class="saisie__unite" aria-hidden="true">DT</span></div></div>' +
        '<button type="button" class="bouton bouton--icone bouton--petit bouton--fantome" data-libre-suppr="' + i + '" aria-label="Retirer le versement libre de l\'année ' + esc(l.annee) + '">' + ico("poubelle") + "</button></div>";
    }).join("") || '<p class="ep-vide">Aucun versement libre.</p>';
    $("ep-libre-ajout").disabled = (etat.libres || []).length >= 10;
  }
  MAJ.libres = function () {
    var err = res.erreur, el = $("ep-libres-err");
    var concerne = err && ["libres", "retraitDebut", "retraitTot"].indexOf(err.code) !== -1;
    el.hidden = !concerne;
    el.textContent = concerne ? messageErreur(err) : "";
    if (ui.mode === "cea") { el.hidden = false; el.textContent = "Ces options concernent l'assurance vie : choisissez « Assurance vie » ou « Les deux »."; }
  };

  /* --- Hypothèses --- */
  CONSTRUIRE.hypotheses = function () {
    return '<div class="ep-bloc"><h3 class="ep-sous-titre">Assurance vie</h3><div class="ep-champs">' +
      champ("ep-h-rend", "Taux servi estimé", "rendementPct", "p", "%", "Net de participation aux bénéfices") +
      champ("ep-h-gar", "Taux minimum garanti", "tauxGarantiPct", "p", "%", "Le scénario prudent ne descend pas dessous") +
      champ("ep-h-frais", "Frais de gestion", "fraisPct", "p", "% / an", null) +
      champ("ep-h-fe", "Frais sur versement", "fraisEntreePct", "p", "%", null) + "</div>" +
      '<p class="ep-champ-lib" id="ep-lib-support">Support et écart entre scénarios</p>' + bascule("ep-support", "Support et écart entre scénarios", SUPPORTS, "ep-supports") +
      '<div class="ep-champs ep-champs--un">' + champ("ep-h-ecart", "Écart prudent / dynamique", "ecartPct", "p", "points", "± autour du taux servi") + "</div></div>" +
      '<div class="ep-bloc"><h3 class="ep-sous-titre">CEA</h3><div class="ep-champs">' +
      champ("ep-h-rcea", "Rendement estimé", "rendementCeaPct", "p", "%", "Actions cotées à Tunis") + champ("ep-h-fcea", "Frais", "fraisCeaPct", "p", "% / an", null) + champ("ep-h-ecea", "Écart entre scénarios", "ecartCeaPct", "p", "points", null) + "</div></div>" +
      '<div class="ep-bloc"><h3 class="ep-sous-titre">Comparaison et environnement</h3><div class="ep-champs">' +
      champ("ep-h-comp", "Taux d'une épargne classique", "comparPct", "p", "%", "Compte épargne, dépôt à terme") + champ("ep-h-ii", "Impôt sur les intérêts", "impotInteretsPct", "p", "%", "20 % par défaut, à confirmer") +
      champ("ep-h-cr", "Hausse annuelle des revenus et versements", "croissancePct", "p", "% / an", null) + champ("ep-h-inf", "Inflation", "inflationPct", "p", "% / an", "Pour le capital en dinars d'aujourd'hui") + "</div>" +
      '<div class="ep-lignes-saisie">' + interrupteur("ep-reinvestir", "Réinvestir l'économie d'impôt", "Elle est versée sur le contrat chaque année") + "</div></div>" +
      '<div class="ep-bloc"><h3 class="ep-sous-titre">Lire un relevé de contrat</h3><p class="champ__aide">PDF texte (non scanné) : taux et frais repérés, proposés avant d\'être appliqués. Le fichier reste sur votre appareil.</p>' +
      '<label class="bouton bouton--petit ep-fichier">' + ico("telecharger") + 'Choisir un relevé PDF<input type="file" id="ep-releve" accept="application/pdf,.pdf" class="cache"></label><div id="ep-releve-res" aria-live="polite"></div></div>' +
      '<p class="ep-erreur" id="ep-hyp-err" role="alert" hidden></p>';
  };
  function supportActuel() {
    var m = { 1: "euros", 2: "equilibre", 4: "dynamique" }[etat.ecartPct];
    return ui.supportPerso || !m ? "perso" : m;
  }
  MAJ.hypotheses = function () {
    cocher("ep-support", supportActuel());
    $("ep-h-ecart").readOnly = supportActuel() !== "perso";
    $("ep-reinvestir").checked = !!etat.reinvestir;
    var err = res.erreur, el = $("ep-hyp-err");
    var cle = err && CHAMP_ERREUR[err.code];
    R.querySelectorAll("#ep-o-hypotheses [data-ep]").forEach(function (i) { if (i !== doc.activeElement || F.lire(i.value).valide) i.setAttribute("aria-invalid", cle && i.getAttribute("data-ep") === cle ? "true" : "false"); });
    el.hidden = !(err && cle && cle !== "retraitDebut");
    el.textContent = el.hidden ? "" : messageErreur(err);
  };

  /* --- Rachat et avance --- */
  ui.rachatProduit = "av";
  CONSTRUIRE.rachat = function () {
    return '<div id="ep-r-produit-bloc">' + bascule("ep-r-produit", "Produit concerné", [["av", "Assurance vie"], ["cea", "CEA"]]) + "</div>" +
      '<div class="ep-champs">' + champ("ep-r-annee", "En fin d'année", null, "i", "", null, ' value="5" data-outil-champ') + champ("ep-r-part", "Part retirée", null, "p", "%", null, ' value="100" data-outil-champ') + champ("ep-r-pen", "Pénalité de rachat", null, "p", "%", null, ' value="0" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-r-err" role="alert" hidden></p><div id="ep-r-res"></div>' +
      '<div class="ep-bloc" id="ep-avance"><h3 class="ep-sous-titre">Ou une avance sur contrat ?</h3><p class="champ__aide">Prêt de l\'assureur garanti par votre épargne, la même année : le contrat continue.</p><div class="ep-champs">' +
      champ("ep-a-montant", "Montant", null, "m", "DT", null, ' placeholder="Ex. 5 000" data-outil-champ') + champ("ep-a-taux", "Taux", null, "p", "%", null, ' value="7" data-outil-champ') + champ("ep-a-duree", "Durée", null, "i", "mois", null, ' value="24" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-a-err" role="alert" hidden></p><div id="ep-a-res"></div></div>';
  };
  MAJ.rachat = function () {
    var c = res, err = $("ep-r-err"), out = $("ep-r-res");
    if (!c.actif) { out.innerHTML = '<p class="ep-vide">Indiquez un versement pour simuler une sortie anticipée.</p>'; $("ep-avance").hidden = true; err.hidden = true; return; }
    $("ep-r-produit-bloc").hidden = !(c.aAv && c.aCea);
    if (!c.aAv) ui.rachatProduit = "cea";
    if (!c.aCea) ui.rachatProduit = "av";
    cocher("ep-r-produit", ui.rachatProduit);
    var n = c.etat.dureeAns, a = lireNb("ep-r-annee").valeur, part = lireNb("ep-r-part").valeur, pen = lireNb("ep-r-pen").valeur;
    var m = "";
    if (!(a >= 1 && a <= n && Math.floor(a) === a)) m = "L'année doit être un nombre entier entre 1 et " + n + ".";
    else if (!(part > 0 && part <= 100)) m = "La part retirée doit être comprise entre 0 et 100 %.";
    else if (!(pen >= 0 && pen < 100)) m = "La pénalité doit être comprise entre 0 et 100 %.";
    err.hidden = !m; err.textContent = m;
    if (m) { out.innerHTML = ""; majAvance(); return; }
    var r = window.Rachat.simuler(c, { produit: ui.rachatProduit, annee: a, partPct: part, penalitePct: pen });
    if (!r) { out.innerHTML = ""; return; }
    var cea = r.produit === "cea";
    var texte = cea
      ? (r.anticipe ? "Les dépôts encore bloqués (moins de " + r.dureeMinimale + " ans) sont réintégrés au revenu imposable de l'année du retrait." : "Tous les dépôts ont passé les " + r.dureeMinimale + " ans de blocage : pas de réintégration.")
      : (r.anticipe ? "Rachat avant " + r.dureeMinimale + " ans : les primes déduites sont réintégrées au revenu imposable de l'année du rachat." : "Contrat d'au moins " + r.dureeMinimale + " ans : pas de réintégration fiscale.");
    out.innerHTML = encart(r.anticipe ? "alerte" : "succes", texte) + lignes([
      [(cea ? "Retiré du CEA" : "Capital racheté") + " fin d'année " + r.annee + " (" + pc(r.partPct) + ")", dt(r.capitalRachete)],
      ["Pénalité", (r.penalite > 0 ? "− " : "") + dt(r.penalite)],
      ["Montant réintégré au revenu", dt(r.montantReintegre)],
      ["Impôt supplémentaire", (r.impotReintegration > 0 ? "− " : "") + dt(r.impotReintegration)],
      ["Montant net perçu", dt(r.netRecu), "fort"],
      ["Versements correspondants", dt(r.versementsRachetes)],
      ["Gain ou perte sur ces versements", signe(r.gainNet), r.gainNet >= 0 ? "fort" : "perte"],
      ["Économies d'impôt déjà obtenues sur cette part", dt(r.economieObtenue)],
      ["Coût de la sortie (pénalité + impôt)", dt(r.coutSortie), r.coutSortie > 0 ? "perte" : ""]
    ]);
    ui.rachat = r;
    majAvance();
  };
  function majAvance() {
    var c = res, bloc = $("ep-avance"), err = $("ep-a-err"), out = $("ep-a-res");
    bloc.hidden = !(c.actif && c.aAv);
    ui.avance = null;
    if (bloc.hidden) return;
    var m = lireNb("ep-a-montant"), tx = lireNb("ep-a-taux"), d = lireNb("ep-a-duree"), an = lireNb("ep-r-annee").valeur;
    err.hidden = true; out.innerHTML = "";
    if (m.vide) { out.innerHTML = '<p class="ep-vide">Indiquez un montant pour comparer l\'avance au rachat.</p>'; return; }
    if (!(an >= 1 && an <= c.etat.dureeAns)) return;
    var v = window.Rachat.avance(c, { annee: an, montant: m.valeur, tauxPct: tx.valeur, dureeMois: d.valeur, penalitePct: lireNb("ep-r-pen").valeur });
    if (!v) { err.hidden = false; err.textContent = "Vérifiez le montant (positif), le taux (0 à 30 %) et la durée (1 à 360 mois)."; return; }
    if (!v.possible) { err.hidden = false; err.textContent = "L'avance ne peut pas dépasser le capital de l'assurance vie en année " + an + " : " + dt(v.capitalDisponible) + "."; return; }
    v.annee = an; ui.avance = v;
    out.innerHTML = lignes([
      ["Capital disponible en année " + an, dt(v.capitalDisponible)],
      ["Mensualité de remboursement", dt(v.mensualite)],
      ["Coût de l'avance (intérêts)", dt(v.interets), v.interets > 0 ? "perte" : ""],
      ["Coût d'un rachat du même montant", v.coutRachat == null ? "—" : dt(v.coutRachat), v.coutRachat > 0 ? "perte" : ""],
      [v.interets <= v.coutRachat ? "L'avance coûte moins cher, de" : "Le rachat coûte moins cher, de", dt(Math.abs(v.coutRachat - v.interets)), "fort"]
    ]);
  }

  /* --- Capital ou rente, protection --- */
  CONSTRUIRE.sortie = function () {
    return '<div class="ep-champs">' + champ("ep-v-duree", "Durée de la rente", null, "i", "ans", null, ' value="20" data-outil-champ') + champ("ep-v-taux", "Taux technique", null, "p", "%", "Indicatif : la rente réelle dépend des tables de mortalité", ' value="3" data-outil-champ') +
      champ("ep-v-deces", "Décès en fin d'année", null, "i", "", null, ' value="5" data-outil-champ') + champ("ep-v-garanti", "Capital décès garanti", null, "m", "DT", "Facultatif, selon le contrat", ' placeholder="0" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-v-err" role="alert" hidden></p><div class="ep-colonnes"><div><h3 class="ep-sous-titre">Rente et protection</h3><div id="ep-v-prev"></div></div><div><h3 class="ep-sous-titre">Capital ou rente au terme ?</h3><div id="ep-v-sortie"></div></div></div>';
  };
  function calculPrevoyance() {
    var c = res;
    if (!c.actif || !c.aAv) return null;
    var dr = ui.rente.duree, tx = ui.rente.taux, cap = c.medAv.capitalFinal;
    var rente = window.Prevoyance.renteEstimee(cap, dr, tx);
    return { capital: cap, dureeRente: dr, tauxRente: tx, rente: rente, sortie: window.Prevoyance.comparerSortie(cap, rente.annuelle, dr) };
  }
  MAJ.sortie = function () {
    var c = res, err = $("ep-v-err");
    if (!c.actif || !c.aAv) { $("ep-v-prev").innerHTML = '<p class="ep-vide">Concerne l\'assurance vie : indiquez un versement.</p>'; $("ep-v-sortie").innerHTML = ""; err.hidden = true; return; }
    var dr = lireNb("ep-v-duree").valeur, tx = lireNb("ep-v-taux").valeur, an = lireNb("ep-v-deces").valeur, g = lireNb("ep-v-garanti");
    var m = "";
    if (!(dr >= 1 && dr <= 50 && Math.floor(dr) === dr)) m = "La durée de la rente doit être un nombre entier entre 1 et 50 ans.";
    else if (!(tx >= 0 && tx <= 20)) m = "Le taux technique doit être compris entre 0 et 20 %.";
    else if (!(an >= 1 && an <= c.etat.dureeAns && Math.floor(an) === an)) m = "L'année doit être un nombre entier entre 1 et " + c.etat.dureeAns + ".";
    else if (!g.valide) m = "Saisissez un montant valide.";
    err.hidden = !m; err.textContent = m;
    if (m) return;
    ui.rente = { duree: dr, taux: tx };
    var p = calculPrevoyance();
    p.deces = window.Prevoyance.capitalDeces(c.medAv.annees, an, g.valeur);
    ui.prevoyance = p;
    var origine = { acquis: "capital acquis", verses: "versements remboursés", garanti: "capital garanti" }[p.deces.origine];
    $("ep-v-prev").innerHTML = lignes([
      ["Capital assurance vie au terme (médian)", dt(p.capital)],
      ["Rente annuelle estimée pendant " + dr + " ans", dt(p.rente.annuelle), "fort"],
      ["Soit par mois", dt(p.rente.mensuelle)],
      ["Décès en année " + p.deces.annee + " : capital acquis", dt(p.deces.capitalAcquis)],
      ["Versements cumulés à cette date", dt(p.deces.totalVerse)],
      ["Versé aux bénéficiaires (" + origine + ")", dt(p.deces.capitalDeces), "fort"]
    ]);
    var s = p.sortie;
    $("ep-v-sortie").innerHTML = lignes([
      ["Sortie en capital, en une fois", dt(s.capital)],
      ["Rentes perçues sur " + dr + " ans", dt(s.totalRentes)],
      ["Supplément grâce à la rente", signe(s.supplement), s.supplement >= 0 ? "fort" : "perte"],
      ["Années de rente pour égaler le capital", s.anneesPourCapital == null ? "—" : pluriel(s.anneesPourCapital, "an")]
    ]) + '<p class="champ__aide">Le capital laisse la main sur son usage ; la rente protège du risque de vivre longtemps. À la sortie, le contrat d\'au moins 8 ans ne subit pas de réintégration.</p>';
  };

  /* --- Retraite --- */
  CONSTRUIRE.retraite = function () {
    return '<div class="ep-lignes-saisie">' + interrupteur("ep-ret-actif", "Caler la durée sur mon départ", "La durée devient : âge de départ − âge actuel") + "</div>" +
      '<div class="ep-champs">' + champ("ep-ret-age", "Âge actuel", "ageActuel", "i", "ans", "Repris de votre profil") + champ("ep-ret-depart", "Âge de départ", null, "i", "ans", null, ' value="60" data-outil-champ') +
      champ("ep-ret-pension", "Pension mensuelle estimée", null, "m", "DT", "CNSS ou CNRPS, facultatif", ' placeholder="0" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-ret-err" role="alert" hidden></p><div id="ep-ret-res"></div>';
  };
  MAJ.retraite = function () {
    var c = res, err = $("ep-ret-err"), out = $("ep-ret-res");
    $("ep-ret-actif").checked = etat.ageDepart > 0;
    if (etat.ageDepart > 0 && doc.activeElement !== $("ep-ret-depart")) $("ep-ret-depart").value = String(etat.ageDepart);
    err.hidden = true;
    if (etat.ageDepart > 0) {
      var d = window.Conseil.dureeRetraite(etat.ageActuel, etat.ageDepart, SC.DUREE_MAX);
      if (d.erreur) { err.hidden = false; err.textContent = { age: "L'âge actuel doit être un nombre entier entre 18 et 75 ans.", depart: "L'âge de départ doit être un nombre entier entre 40 et 80 ans.", ecart: "L'écart entre les deux âges doit être compris entre 1 et 40 ans." }[d.erreur]; }
    }
    if (!c.actif || !c.aAv) { out.innerHTML = '<p class="ep-vide">Indiquez un versement en assurance vie pour estimer votre revenu de retraite.</p>'; return; }
    var p = calculPrevoyance(), pension = lireNb("ep-ret-pension");
    var rev = window.Conseil.revenuRetraite(pension.valide ? pension.valeur : 0, p.rente.mensuelle);
    var age = etat.ageActuel + c.etat.dureeAns;
    out.innerHTML = lignes([
      ["Capital assurance vie à " + age + " ans (médian)", dt(p.capital)],
      ["Rente mensuelle estimée (" + p.dureeRente + " ans, " + pc(p.tauxRente) + ")", dt(p.rente.mensuelle)],
      ["Pension mensuelle", dt(rev.pension)],
      ["Revenu mensuel à la retraite", dt(rev.total), "fort"],
      ["Part apportée par votre épargne", pc(rev.partRente)]
    ]) + '<p class="champ__aide">Durée et taux de la rente : outil « Capital ou rente, protection ».</p>';
  };
  function appliquerRetraite() {
    if (!(etat.ageDepart > 0)) return;
    var d = window.Conseil.dureeRetraite(etat.ageActuel, etat.ageDepart, SC.DUREE_MAX);
    if (!d.erreur) etat.dureeAns = d.duree;
  }

  /* --- Monte-Carlo --- */
  CONSTRUIRE.mc = function () {
    return '<div class="ep-champs">' + champ("ep-mc-vav", "Volatilité assurance vie", null, "p", "points", "Écart-type annuel, jamais sous le taux garanti", ' value="1,5" data-outil-champ') +
      champ("ep-mc-vcea", "Volatilité CEA", null, "p", "points", "Actions : 15 à 20 points", ' value="15" data-outil-champ') + champ("ep-mc-obj", "Capital visé", null, "m", "DT", "Facultatif : probabilité de l'atteindre", ' placeholder="Ex. 100 000" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-mc-err" role="alert" hidden></p><div id="ep-mc-phrases" class="ep-phrases" aria-live="polite"></div><div class="ep-graphe" id="ep-g-mc"></div>' +
      '<div class="ep-legende" aria-hidden="true"><span class="l-mc1">8 cas sur 10</span><span class="l-mc2">1 cas sur 2</span><span class="l-med">Médiane</span><span class="l-verse">Versements cumulés</span></div>';
  };
  var mc = { cle: null, res: null, minuterie: null };
  function calculerMc() {
    var c = res;
    var va = lireNb("ep-mc-vav"), vc = lireNb("ep-mc-vcea"), ob = lireNb("ep-mc-obj");
    var ok = va.valide && va.valeur <= 20 && vc.valide && vc.valeur <= 60 && ob.valide;
    $("ep-mc-err").hidden = ok;
    $("ep-mc-err").textContent = ok ? "" : "Volatilité : 0 à 20 points pour l'assurance vie, 0 à 60 pour le CEA.";
    if (!ok || !c.actif) return null;
    var cle = JSON.stringify([c.p, c.pCea, c.aCea, c.etat.tauxGarantiPct, va.valeur, vc.valeur, ob.valeur]);
    if (mc.cle === cle) return mc.res;
    mc.res = window.MonteCarlo.simuler(c, { trajectoires: 5000, volatiliteAv: va.valeur, volatiliteCea: vc.valeur, objectif: ob.valeur });
    mc.cle = cle; mc.vol = [va.valeur, vc.valeur];
    return mc.res;
  }
  function phrasesMc(m) {
    var p = [["fort", "9 chances sur 10 d'avoir au moins " + dt0(m.finalP10) + " au terme"], ["", "1 chance sur 2 de dépasser " + dt0(m.finalP50)], ["", "1 chance sur 10 de dépasser " + dt0(m.finalP90)],
      ["", "Probabilité que la valeur au terme dépasse les versements : " + pc(m.probaVersements, 0)]];
    if (m.objectif > 0) p.push(["cible", "Probabilité d'atteindre " + dt0(m.objectif) + " : " + pc(m.probaObjectif, 0)]);
    return p;
  }
  function afficherMc() {
    var c = res, m = calculerMc();
    if (!c.actif) { $("ep-mc-phrases").innerHTML = '<p class="ep-vide">Indiquez un versement pour lancer la simulation.</p>'; $("ep-g-mc").innerHTML = ""; return; }
    if (!m) return;
    $("ep-mc-phrases").innerHTML = phrasesMc(m).map(function (x) { return '<p class="ep-phrase ' + x[0] + '">' + esc(x[1]) + "</p>"; }).join("");
    var cent = m.centiles;
    function pts(v) { return v.map(function (y, i) { return [i, y]; }); }
    var yMax = Math.max(Math.max.apply(null, cent.p90), c.med.totalVerse, m.objectif || 0);
    graphe({
      el: $("ep-g-mc"), aria: "Éventail de 5 000 trajectoires : dans 8 cas sur 10, entre " + dt0(m.finalP10) + " et " + dt0(m.finalP90) + " au terme.",
      xMax: c.etat.dureeAns, yMax: yMax, entier: true, anime: animerUneFois("mc"),
      series: [{ type: "bande", haut: pts(cent.p90), bas: pts(cent.p10), cls: "ep-mc-b1" }, { type: "bande", haut: pts(cent.p75), bas: pts(cent.p25), cls: "ep-mc-b2" },
        { type: "ligne", pts: c.med.annees.map(function (a) { return [a.annee, a.verse]; }), cls: "ep-p-verse", anime: false }, { type: "ligne", pts: pts(cent.p50), cls: "ep-p-med" }],
      horizontales: m.objectif > 0 ? [{ y: m.objectif, cls: "ep-mc-obj", lib: "Objectif" }] : []
    });
  }
  MAJ.mc = function () { clearTimeout(mc.minuterie); mc.minuterie = setTimeout(afficherMc, 300); };

  /* --- Stratégie --- */
  CONSTRUIRE.strategie = function () {
    return '<div id="ep-st-resume"></div><div class="tableau-cadre" tabindex="0" role="region" aria-labelledby="ep-st-cap"><table class="tableau"><caption id="ep-st-cap">Répartition conseillée du même budget, année par année</caption><thead><tr><th scope="col">Année</th><th scope="col">Budget</th><th scope="col">Assurance vie</th><th scope="col">CEA</th><th scope="col">Économie</th></tr></thead><tbody id="ep-st-corps"></tbody></table></div>' +
      '<button type="button" class="bouton bouton--epargne bouton--petit" id="ep-st-appliquer" hidden>' + ico("valide") + "Appliquer la répartition de la 1re année</button>";
  };
  function repartitionConseillee() {
    var st = ui.strategie, e = res.etat;
    if (!st || !st.plan.length) return null;
    var per = e.versement + e.versementCea, cea = arr3(per * st.plan[0].partCea / 100);
    return { av: arr3(per - cea), cea: cea };
  }
  MAJ.strategie = function () {
    var c = res, box = $("ep-st-resume");
    ui.strategie = null;
    if (!c.actif) { box.innerHTML = '<p class="ep-vide">Indiquez un versement pour optimiser la répartition.</p>'; $("ep-st-corps").innerHTML = ""; $("ep-st-appliquer").hidden = true; return; }
    var st = window.Strategie.optimiser(c);
    ui.strategie = st;
    var h = st.gain > 1 ? encart("succes", "En répartissant autrement le même budget, la valeur au terme augmente de " + dt(st.gain) + " (capital médian et économies d'impôt).", "hausse") : encart("", "Votre répartition actuelle est déjà la meilleure pour ce budget.", "valide");
    if (!st.avValable) h += encart("alerte", "Durée inférieure à " + st.dureeMinimaleAv + " ans : la déduction de l'assurance vie n'est pas retenue ici.");
    if (st.plan.some(function (l) { return !l.ceaPermis; })) h += '<p class="champ__aide">Pas de CEA les ' + st.dureeBlocageCea + " dernières années : ces dépôts seraient encore bloqués au terme.</p>";
    if (existant()) h += '<p class="champ__aide">Calcul fait sans vos contrats actuels.</p>';
    box.innerHTML = h;
    $("ep-st-corps").innerHTML = st.plan.map(function (l) { return "<tr><td>" + l.annee + "</td><td>" + F.dt(l.budget) + "</td><td>" + F.dt(l.av) + "</td><td>" + F.dt(l.cea) + " <small>(" + Math.round(l.partCea) + " %)</small></td><td class=\"ep-pos\">" + F.dt(l.economie) + "</td></tr>"; }).join("");
    var cible = repartitionConseillee(), e = c.etat;
    $("ep-st-appliquer").hidden = !(e.versement + e.versementCea > 0) || !cible || (Math.abs(cible.av - e.versement) < 0.0005 && Math.abs(cible.cea - e.versementCea) < 0.0005);
  };

  /* --- Contrats --- */
  var CHAMPS_OFFRE = [["servi", "tauxServi", "Taux servi", "%"], ["garanti", "tauxGaranti", "Taux garanti", "%"], ["gestion", "fraisGestion", "Frais de gestion", "%"], ["versement", "fraisVersement", "Frais sur versement", "%"]];
  CONSTRUIRE.contrats = function () {
    return '<p class="champ__aide">L\'offre A reprend vos hypothèses tant que vous ne la modifiez pas. Mêmes versements pour toutes les offres.</p><div class="ep-offres">' + ["a", "b", "c"].map(function (k) {
      return '<fieldset class="ep-offre"><legend class="cache">Offre ' + k.toUpperCase() + '</legend><div class="champ"><label for="ep-o' + k + '-nom">Nom de l\'offre</label><div class="saisie"><input id="ep-o' + k + '-nom" type="text" maxlength="40" autocomplete="off" placeholder="Offre ' + k.toUpperCase() + '" data-outil-champ></div></div>' +
        CHAMPS_OFFRE.map(function (c) { return champ("ep-o" + k + "-" + c[0], c[2], null, "p", c[3], null, " data-outil-champ data-offre=\"" + k + "\""); }).join("") + "</fieldset>";
    }).join("") + '</div><div id="ep-co-res"></div>';
  };
  MAJ.contrats = function () {
    var c = res, out = $("ep-co-res");
    ui.contrats = null;
    if (!c.actif || !c.aAv) { out.innerHTML = '<p class="ep-vide">Concerne l\'assurance vie : indiquez un versement.</p>'; return; }
    var e = c.etat;
    if (!ui.offresTouchees) { $("ep-oa-servi").value = libre(e.rendementPct); $("ep-oa-garanti").value = libre(e.tauxGarantiPct); $("ep-oa-gestion").value = libre(e.fraisPct); $("ep-oa-versement").value = libre(e.fraisEntreePct); }
    var offres = ["a", "b", "c"].map(function (k) {
      var nom = $("ep-o" + k + "-nom"), o = { nom: nom.value.trim() || nom.placeholder, vide: lireNb("ep-o" + k + "-servi").vide };
      CHAMPS_OFFRE.forEach(function (ch) { var r = lireNb("ep-o" + k + "-" + ch[0]); o[ch[1]] = r.valide ? r.valeur : NaN; });
      return o;
    }).filter(function (o) { return !o.vide; });
    if (offres.length < 2) { out.innerHTML = '<p class="ep-vide">Renseignez au moins le taux servi d\'une deuxième offre.</p>'; return; }
    var r = window.Contrats.comparer(c, offres);
    ui.contrats = r;
    out.innerHTML = '<div class="tableau-cadre" tabindex="0" role="region" aria-labelledby="ep-co-cap"><table class="tableau"><caption id="ep-co-cap">Offres comparées sur ' + pluriel(e.dureeAns, "an") + ', meilleure valeur au terme marquée d\'une étoile</caption><thead><tr><th scope="col">Offre</th><th scope="col">Capital médian</th><th scope="col">Au seul taux garanti</th><th scope="col">Coût des frais</th><th scope="col">Rendement effectif</th><th scope="col">Écart</th></tr></thead><tbody>' +
      r.map(function (x) {
        if (!x.valide) return '<tr><th scope="row">' + esc(x.nom) + '</th><td colspan="5">Saisie incomplète ou taux garanti supérieur au taux servi</td></tr>';
        return "<tr" + (x.meilleur ? ' class="cle"' : "") + '><th scope="row">' + (x.meilleur ? '<span aria-label="Meilleure offre">★</span> ' : "") + esc(x.nom) + "</th><td>" + F.dt0(x.capital) + "</td><td>" + F.dt0(x.capitalGaranti) + "</td><td>" + F.dt0(x.frais) + "</td><td>" + (x.rendementEffectif == null ? "—" : pc(x.rendementEffectif)) + "</td><td>" + (x.meilleur ? "—" : esc(signe(x.ecart, dt0))) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  };

  /* --- Scénarios --- */
  var NOMS_VARIANTES = { optimal: "Montant optimal", avSeule: "Tout en assurance vie", moitie: "Moitié en CEA", plus100: "100 DT de plus par mois" };
  CONSTRUIRE.scenarios = function () {
    return '<div class="ep-boutons ep-boutons--petits"><button type="button" class="bouton bouton--petit bouton--plein" id="ep-scn-ajout">' + ico("plus") + "Ajouter la simulation actuelle</button>" +
      Object.keys(NOMS_VARIANTES).map(function (k) { return '<button type="button" class="bouton bouton--petit" data-variante="' + k + '">' + NOMS_VARIANTES[k] + "</button>"; }).join("") + "</div>" +
      '<div id="ep-scn-zone"></div>';
  };
  function etatScenario() { var e = effectif(); return e; }
  MAJ.scenarios = function () {
    var zone = $("ep-scn-zone"), l = ui.scenarios;
    R.querySelectorAll("[data-variante], #ep-scn-ajout").forEach(function (b) { b.disabled = l.length >= window.Comparateur.MAX; });
    if (!l.length) { zone.innerHTML = '<p class="ep-vide">Ajoutez la simulation actuelle ou une variante : jusqu\'à 4, comparées critère par critère.</p>'; return; }
    var m = l.map(function (x) { return window.Comparateur.mesurer(x.etat); }), b = window.Comparateur.meilleurs(m);
    function et(cle, i) { return b[cle] === i ? '<span aria-label="Meilleure valeur">★</span> ' : ""; }
    var L = [
      ["Assurance vie", function (x) { return F.dt(x.versementAv) + " <small>" + PERIODE[x.frequence] + "</small>"; }],
      ["CEA", function (x) { return F.dt(x.versementCea) + " <small>" + PERIODE[x.frequence] + "</small>"; }],
      ["Économie d'impôt / an", function (x) { return F.dt(x.economie); }, "economie"],
      ["Impôt après", function (x) { return F.dt(x.impotApres); }, "impotApres"],
      ["Effort réel / mois", function (x) { return F.dt(x.effortMensuel); }, "effortMensuel"],
      ["Capital médian", function (x) { return x.capital == null ? "—" : F.dt0(x.capital) + " <small>" + x.duree + " ans</small>"; }, "capital"],
      ["Valeur totale", function (x) { return x.valeur == null ? "—" : F.dt0(x.valeur); }, "valeur"],
      ["Rendement effectif", function (x) { return x.rendement == null ? "—" : pc(x.rendement); }, "rendement"]
    ];
    zone.innerHTML = '<div class="tableau-cadre" tabindex="0" role="region" aria-labelledby="ep-scn-cap"><table class="tableau ep-table-scn"><caption id="ep-scn-cap">Scénarios comparés (montants en DT), meilleure valeur marquée d\'une étoile</caption><thead><tr><th scope="col">Critère</th>' +
      l.map(function (x, i) { return '<th scope="col"><span class="ep-scn-nom">' + esc(x.nom) + '</span><span class="ep-scn-act"><button type="button" class="bouton bouton--petit" data-scn-app="' + i + '">Appliquer</button><button type="button" class="bouton bouton--petit bouton--icone bouton--fantome" data-scn-suppr="' + i + '" aria-label="Retirer ' + esc(x.nom) + '">' + ico("fermer") + "</button></span></th>"; }).join("") + "</tr></thead><tbody>" +
      L.map(function (lg) { return '<tr><th scope="row">' + lg[0] + "</th>" + m.map(function (x, i) { return "<td" + (lg[2] && b[lg[2]] === i ? ' class="ep-meilleur"' : "") + ">" + (lg[2] ? et(lg[2], i) : "") + lg[1](x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  };
  function ajouterScenario(nom, e) {
    var s = JSON.stringify(e);
    if (ui.scenarios.some(function (x) { return JSON.stringify(x.etat) === s; })) { O.toast("Ce scénario figure déjà dans la comparaison."); return; }
    if (ui.scenarios.length >= window.Comparateur.MAX) { O.toast("4 scénarios au plus : retirez-en un."); return; }
    ui.scenarios.push({ nom: nom, etat: e, mode: ui.mode });
    MAJ.scenarios();
  }

  /* --- Couple --- */
  ui.coupleChef = 1;
  CONSTRUIRE.couple = function () {
    return '<p class="champ__aide">Les déductions familiales reviennent au chef de famille. Le simulateur cherche la répartition du budget d\'assurance vie qui maximise l\'économie du foyer.</p><div class="ep-champs">' +
      champ("ep-cp-revenu", "Revenu annuel imposable du conjoint", null, "m", "DT", null, ' placeholder="Ex. 30 000" data-outil-champ') + champ("ep-cp-budget", "Budget vie du foyer par an", null, "m", "DT", "Par défaut : votre assurance vie actuelle", ' data-outil-champ') + "</div>" +
      '<p class="ep-champ-lib">Chef de famille</p>' + bascule("ep-cp-chef", "Chef de famille", [["1", "Vous"], ["2", "Votre conjoint"]]) + '<div id="ep-cp-res" aria-live="polite"></div>';
  };
  MAJ.couple = function () {
    var c = res, out = $("ep-cp-res"), e = c.etat;
    ui.couple = null;
    cocher("ep-cp-chef", String(ui.coupleChef));
    $("ep-cp-budget").placeholder = F.dt0(c.investissementAv);
    var r2 = lireNb("ep-cp-revenu"), b = lireNb("ep-cp-budget");
    if (r2.vide) { out.innerHTML = '<p class="ep-vide">Indiquez le revenu de votre conjoint pour comparer les répartitions.</p>'; return; }
    if (!r2.valide || !b.valide) { out.innerHTML = '<p class="ep-erreur">Saisissez un montant valide.</p>'; return; }
    var budget = b.vide ? c.investissementAv : b.valeur;
    var r = window.Couple.repartir({ revenu1: e.revenu, revenu2: r2.valeur, chef: ui.coupleChef, enfants: e.enfants, infirmes: e.infirmes, etudiants: e.etudiants, parents: e.parents, budget: budget, cea1: c.investissementCea, cea2: 0 }, e.annee);
    if (!r) { out.innerHTML = ""; return; }
    ui.couple = r;
    function tuile(t, part, eco, av, ap) { return '<div class="ep-cp-tuile"><span>' + t + "</span><strong>" + esc(dt(part)) + "</strong><small>par an, soit " + esc(dt(part / 12)) + " par mois</small><small>Économie " + esc(dt(eco)) + " · impôt " + esc(F.dt(av)) + " → " + esc(dt(ap)) + "</small></div>"; }
    out.innerHTML = '<div class="ep-cp-tuiles">' + tuile("Vous", r.part1, r.economie1, r.impotAvant1, r.impot1) + tuile("Votre conjoint", r.part2, r.economie2, r.impotAvant2, r.impot2) + "</div>" +
      encart("succes", "Économie du foyer : " + dt(r.total) + " par an." + (r.gainVsEgalitaire > 0.5 ? " C'est " + dt(r.gainVsEgalitaire) + " de plus qu'un partage moitié-moitié." : ""), "valide") +
      '<button type="button" class="bouton bouton--petit" id="ep-cp-app">' + ico("valide") + "Appliquer votre part à la simulation</button>";
  };

  /* --- Stress --- */
  CONSTRUIRE.stress = function () {
    return '<div class="ep-champs">' + champ("ep-st-krach", "Krach l'année", null, "i", "", null, ' value="3" data-outil-champ') + champ("ep-st-chute", "Chute du CEA", null, "p", "%", null, ' value="30" data-outil-champ') +
      champ("ep-st-pause", "Pause à partir de l'année", null, "i", "", null, ' value="2" data-outil-champ') + champ("ep-st-duree", "Durée de la pause", null, "i", "ans", null, ' value="1" data-outil-champ') +
      champ("ep-st-baisse", "Baisse des rendements", null, "p", "points", null, ' value="2" data-outil-champ') + champ("ep-st-infl", "Inflation élevée", null, "p", "% / an", null, ' value="8" data-outil-champ') + "</div>" +
      '<p class="ep-erreur" id="ep-st-err" role="alert" hidden></p><div id="ep-st-liste"></div>';
  };
  MAJ.stress = function () {
    var c = res, zone = $("ep-st-liste"), err = $("ep-st-err");
    if (!c.actif) { zone.innerHTML = '<p class="ep-vide">Indiquez un versement pour tester la résistance.</p>'; return; }
    var v = { anneeKrach: lireNb("ep-st-krach").valeur, chuteCeaPct: lireNb("ep-st-chute").valeur, debutPause: lireNb("ep-st-pause").valeur, dureePause: lireNb("ep-st-duree").valeur, baissePts: lireNb("ep-st-baisse").valeur, inflationPct: lireNb("ep-st-infl").valeur };
    var ok = ["ep-st-krach", "ep-st-chute", "ep-st-pause", "ep-st-duree", "ep-st-baisse", "ep-st-infl"].every(function (id) { return lireNb(id).valide; });
    err.hidden = ok; err.textContent = ok ? "" : "Saisissez des valeurs positives.";
    if (!ok) { zone.innerHTML = ""; return; }
    var r = window.Stress.tester(c, v), o = r.options;
    ui.stress = r;
    var D = {
      krach: ["alerte", "Krach boursier l'année " + o.anneeKrach, "Le CEA perd " + pc(o.chuteCeaPct, 0) + " et l'assurance vie ne sert que son taux garanti cette année-là."],
      pause: ["horloge", "Pause des versements", ""], baisse: ["hausse", "Rendements plus bas", "Rendements réduits de " + libre(o.baissePts) + " points chaque année (vie jamais sous le garanti)."],
      inflation: ["info", "Inflation élevée", ""]
    };
    zone.innerHTML = r.tests.map(function (x) {
      var d = D[x.cle], desc = d[2];
      if (x.cle === "pause") desc = "Aucun versement pendant " + pluriel(o.dureePause, "an") + " dès l'année " + o.debutPause + " : " + dt0(x.versementsManques) + " non versés, " + dt0(x.economiePerdue) + " d'économie perdue.";
      if (x.cle === "inflation") desc = "À " + pc(o.inflationPct, 0) + " d'inflation par an, le capital vaut " + dt0(x.capitalReel) + " d'aujourd'hui (" + pc(x.pouvoirAchatPct, 0) + " de son montant).";
      var montant = x.cle === "inflation" ? x.capitalReel : x.capital;
      var ratio = r.base.capital > 0 ? borne(montant / r.base.capital, 0, 1) : 0;
      var ecart = x.cle === "inflation" ? x.capitalReel - r.base.capital : x.ecart;
      return '<div class="ep-stress"><span class="ep-stress__ico">' + ico(d[0]) + '</span><div class="ep-stress__txt"><strong>' + esc(d[1]) + "</strong><span>" + esc(desc) + '</span><i class="ep-cmp__piste" aria-hidden="true"><b class="ep-cmp__barre c2" data-r="' + ratio.toFixed(4) + '"></b></i></div><div class="ep-stress__val"><strong>' + esc(dt0(montant)) + '</strong><span class="' + (ecart < -0.5 ? "perte" : "") + '">' + esc(signe(ecart, dt0)) + "</span></div></div>";
    }).join("") + '<p class="champ__aide">Référence : capital médian de ' + esc(dt0(r.base.capital)) + " au terme.</p>";
    poserR(zone);
  };

  /* --- Objectifs de vie --- */
  var MODELES = {
    retraite: function () { return { nom: "Retraite", montant: 200000, ans: etat.ageDepart > etat.ageActuel ? Math.min(50, etat.ageDepart - etat.ageActuel) : 20, deja: 0 }; },
    etudes: function () { return { nom: "Études des enfants", montant: 60000, ans: 12, deja: 0 }; },
    logement: function () { return { nom: "Achat immobilier", montant: 100000, ans: 7, deja: 0 }; },
    libre: function () { return { nom: "Autre projet", montant: 20000, ans: 5, deja: 0 }; }
  };
  CONSTRUIRE.objectifs = function () {
    return '<div class="ep-boutons ep-boutons--petits">' + [["retraite", "Retraite"], ["etudes", "Études"], ["logement", "Logement"], ["libre", "Autre projet"]].map(function (m) { return '<button type="button" class="bouton bouton--petit" data-modele="' + m[0] + '">' + ico("plus") + m[1] + "</button>"; }).join("") + "</div>" +
      '<div id="ep-obj-liste"></div><div id="ep-obj-bilan" aria-live="polite"></div>';
  };
  function construireObjectifs() {
    $("ep-obj-liste").innerHTML = ui.objectifs.map(function (o, i) {
      var id = "ep-obj" + i;
      return '<div class="ep-obj" data-i="' + i + '"><div class="ep-obj__champs">' +
        '<div class="champ ep-obj__nom"><label for="' + id + '-nom">Projet</label><div class="saisie"><input id="' + id + '-nom" type="text" maxlength="40" autocomplete="off" data-obj="' + i + '" data-k="nom" value="' + esc(o.nom) + '"></div></div>' +
        '<div class="champ"><label for="' + id + '-montant">Montant visé</label><div class="saisie"><input id="' + id + '-montant" type="text" inputmode="decimal" autocomplete="off" data-obj="' + i + '" data-k="montant" value="' + esc(F.saisie(o.montant)) + '"><span class="saisie__unite" aria-hidden="true">DT</span></div></div>' +
        '<div class="champ"><label for="' + id + '-ans">Dans</label><div class="saisie"><input id="' + id + '-ans" type="text" inputmode="numeric" autocomplete="off" data-obj="' + i + '" data-k="ans" value="' + esc(o.ans) + '"><span class="saisie__unite" aria-hidden="true">ans</span></div></div>' +
        '<div class="champ"><label for="' + id + '-deja">Déjà épargné</label><div class="saisie"><input id="' + id + '-deja" type="text" inputmode="decimal" autocomplete="off" placeholder="0" data-obj="' + i + '" data-k="deja" value="' + esc(o.deja ? F.saisie(o.deja) : "") + '"><span class="saisie__unite" aria-hidden="true">DT</span></div></div>' +
        '</div><button type="button" class="bouton bouton--icone bouton--petit bouton--fantome" data-obj-suppr="' + i + '" aria-label="Retirer le projet ' + esc(o.nom) + '">' + ico("poubelle") + '</button><div class="ep-obj__res" id="' + id + '-res"></div></div>';
    }).join("") || '<p class="ep-vide">Ajoutez un projet : le versement mensuel nécessaire s\'affiche, financé par ordre d\'échéance.</p>';
    R.querySelectorAll("[data-modele]").forEach(function (b) { b.disabled = ui.objectifs.length >= 5; });
    MAJ.objectifs();
  }
  MAJ.objectifs = function () {
    var c = res, bilan = $("ep-obj-bilan");
    if (!ui.objectifs.length) { bilan.innerHTML = ""; ui.planObjectifs = null; return; }
    var e = c.etat, taux = Math.max(0, e.rendementPct - e.fraisPct), dispo = (e.versement + e.versementCea) * c.facteur / 12;
    var p = window.Objectifs.planifier(ui.objectifs, taux, dispo);
    ui.planObjectifs = p;
    p.objectifs.forEach(function (o, i) {
      var el = $("ep-obj" + i + "-res");
      if (!el) return;
      if (!o.valide) { el.innerHTML = '<span class="ep-erreur">Montant positif et échéance entre 1 et 50 ans.</span>'; return; }
      el.innerHTML = "<span>" + esc(dt(o.mensuel)) + ' par mois nécessaires</span><i class="ep-cmp__piste" aria-hidden="true"><b class="ep-cmp__barre ' + (o.atteint ? "c1" : "c2") + '" data-r="' + (Math.min(100, o.couverture) / 100).toFixed(4) + '"></b></i><strong class="' + (o.atteint ? "ok" : "") + '">' + (o.atteint ? "Financé" : "Financé à " + Math.round(o.couverture) + " %") + "</strong>";
    });
    poserR($("ep-obj-liste"));
    bilan.innerHTML = '<ul class="ep-tuiles ep-tuiles--clair"><li><span>Besoin total par mois</span><strong>' + esc(dt(p.besoin)) + "</strong></li><li><span>Votre épargne actuelle</span><strong>" + esc(dt(p.disponible)) + "</strong></li></ul>" +
      (p.manque > 0.5 ? encart("alerte", "Il manque " + dt(p.manque) + " par mois pour tout financer au rendement net de " + pc(taux) + ".") + '<button type="button" class="bouton bouton--petit bouton--epargne" id="ep-obj-ajuster">' + ico("plus") + "Ajouter " + esc(dt(p.manque)) + " par mois à l'assurance vie</button>"
        : encart("succes", "Votre épargne finance tous ces projets, avec " + dt(p.surplus) + " de marge par mois."));
  };

  /* --- Et si --- */
  CONSTRUIRE.etsi = function () {
    return '<p class="champ__aide">Déplacez les curseurs : la simulation n\'est modifiée que si vous appliquez.</p>' +
      '<div class="ep-curseur"><div class="ep-curseur__haut"><label for="ep-si-v">Assurance vie par mois</label><output id="ep-si-v-val" for="ep-si-v"></output></div><input type="range" class="curseur" id="ep-si-v" min="0" max="3000" step="10"></div>' +
      '<div class="ep-curseur"><div class="ep-curseur__haut"><label for="ep-si-d">Durée</label><output id="ep-si-d-val" for="ep-si-d"></output></div><input type="range" class="curseur" id="ep-si-d" min="1" max="40" step="1"></div>' +
      '<div class="ep-curseur"><div class="ep-curseur__haut"><label for="ep-si-r">Taux servi</label><output id="ep-si-r-val" for="ep-si-r"></output></div><input type="range" class="curseur" id="ep-si-r" min="0" max="15" step="0.25"></div>' +
      '<ul class="ep-tuiles ep-tuiles--clair" id="ep-si-res" aria-live="polite"></ul><button type="button" class="bouton bouton--petit bouton--epargne" id="ep-si-app">' + ico("valide") + "Appliquer ces valeurs</button>";
  };
  var etsi = null;
  function initEtsi() {
    var c = res, mens = (ui.mode === "cea" ? 0 : etat.versement) * c.facteur / 12;
    etsi = { v: Math.round(mens / 10) * 10, d: etat.dureeAns, r: etat.rendementPct };
    var sv = $("ep-si-v");
    sv.max = String(Math.max(3000, Math.ceil(mens / 500) * 500));
    sv.value = String(etsi.v); $("ep-si-d").value = String(etsi.d); $("ep-si-r").value = String(etsi.r);
  }
  MAJ.etsi = function (depuisCurseur) {
    if (!etsi || !depuisCurseur) initEtsi();
    var v = Number($("ep-si-v").value), d = Number($("ep-si-d").value), r = Number($("ep-si-r").value);
    etsi = { v: v, d: d, r: r };
    ["ep-si-v", "ep-si-d", "ep-si-r"].forEach(function (id) { majCurseur($(id)); });
    $("ep-si-v-val").textContent = dt(v);
    $("ep-si-d-val").textContent = pluriel(d, "an");
    $("ep-si-r-val").textContent = pc(r, 2);
    var e = effectif(), f = res.facteur;
    e.versement = arr3(v * 12 / f); e.dureeAns = d; e.rendementPct = r; e.ageDepart = 0;
    if (e.tauxGarantiPct > r) e.tauxGarantiPct = r;
    var c = calculerComplet(e, existant()), b = res;
    function tuile(lib, val, ref, fmt) { return "<li><span>" + lib + "</span><strong>" + esc(fmt(val)) + "</strong><small>" + esc(ref == null ? "" : signe(val - ref, fmt) + " vs actuel") + "</small></li>"; }
    $("ep-si-res").innerHTML = tuile("Économie / an", c.sim.economie, b.sim.economie, dt) + tuile("Effort réel / mois", Math.max(0, c.investissement - c.sim.economie) / 12, Math.max(0, b.investissement - b.sim.economie) / 12, dt) +
      tuile("Capital médian", c.actif ? c.med.capitalFinal : 0, b.actif ? b.med.capitalFinal : 0, dt0) + tuile("Valeur totale", c.actif ? c.valeurTotale : 0, b.actif ? b.valeurTotale : 0, dt0);
  };

  /* --- Projection annuelle --- */
  CONSTRUIRE.annuel = function () {
    return '<div id="ep-an-zone"></div><button type="button" class="bouton bouton--petit" data-export="csv">' + ico("telecharger") + "Exporter en CSV</button>";
  };
  MAJ.annuel = function () {
    var c = res, z = $("ep-an-zone");
    if (!c.actif) { z.innerHTML = '<p class="ep-vide">Indiquez un versement pour voir la projection.</p>'; return; }
    var reel = c.etat.inflationPct > 0;
    z.innerHTML = '<div class="tableau-cadre" tabindex="0" role="region" aria-labelledby="ep-an-cap"><table class="tableau"><caption id="ep-an-cap">Projection année par année (DT, fin d\'année)</caption><thead><tr><th scope="col">Année</th><th scope="col">Versé cumulé</th><th scope="col">Économie d\'impôt</th><th scope="col">Prudent</th><th scope="col">Médian</th><th scope="col">Dynamique</th>' + (reel ? '<th scope="col">Médian réel</th>' : "") + "</tr></thead><tbody>" +
      c.med.annees.map(function (a, i) {
        return "<tr><td>" + a.annee + "</td><td>" + F.dt0(a.verse) + "</td><td>" + (i ? F.dt(c.med.flux[i - 1].economie) : "—") + "</td><td>" + F.dt0(c.sc.prudent.annees[i].capital) + "</td><td><strong>" + F.dt0(a.capital) + "</strong></td><td>" + F.dt0(c.sc.dynamique.annees[i].capital) + "</td>" + (reel ? "<td>" + F.dt0(a.capitalReel) + "</td>" : "") + "</tr>";
      }).join("") + "</tbody></table></div>";
  };

  /* --- Méthode --- */
  CONSTRUIRE.methode = function () {
    var r = MF.regles(etat.annee), P = MF.produits(r);
    return '<ul class="ep-methode"><li><strong>Assurance vie</strong> : primes déductibles du revenu imposable dans la limite de ' + esc(dt0(P.av.plafond)) + " par an (article 39 du Code de l'IRPP et de l'IS). L'impôt après déduction ne descend jamais sous " + Math.round(P.av.impotMinimumTaux * 100) + " % de l'impôt initial. Contrat d'au moins " + P.av.dureeMinimaleAns + " ans, sinon les primes déduites sont réintégrées l'année du rachat.</li>" +
      "<li><strong>CEA</strong> (Compte Épargne en Actions) : dépôts déductibles dans la limite de " + esc(dt0(P.cea.plafond)) + " par an ; la déduction ne ramène pas l'impôt sous " + Math.round(P.cea.impotMinimumTaux * 100) + " % de l'impôt dû. Chaque dépôt est bloqué " + P.cea.dureeBlocageAns + " ans à compter du 1er janvier suivant.</li>" +
      "<li><strong>Les deux</strong> : l'impôt ne descend jamais sous 45 % et la part de réduction due au CEA ne dépasse jamais 40 % de l'impôt initial.</li>" +
      "<li><strong>Revenu</strong> : brut annuel moins cotisations sociales ; le simulateur retire les frais professionnels (10 %, " + esc(dt0(r.deductions.fraisProfessionnelsMax)) + " au plus) et les déductions de famille, puis applique le barème progressif.</li>" +
      "<li><strong>Projection</strong> : versements en fin de période, économie d'impôt perçue en fin d'année ; trois scénarios autour du taux servi ; le rendement effectif (TRI) intègre l'économie d'impôt.</li>" +
      "<li><strong>Contrats actuels</strong> : quand ils sont pris en compte, leurs versements annuels forment le point de départ et l'économie affichée est celle qui s'y ajoute.</li></ul>" +
      '<p class="champ__aide">' + esc(r.libelle) + ". " + esc(r.source) + " Simulation indicative, non contractuelle.</p>";
  };

  /* Ouverture d'un outil : construction paresseuse */
  R.querySelectorAll("details.ep-outil").forEach(function (d) {
    d.addEventListener("toggle", function () {
      var id = d.getAttribute("data-outil");
      if (!d.open) return;
      if (!outilsConstruits[id]) {
        $("ep-o-" + id).innerHTML = CONSTRUIRE[id]();
        outilsConstruits[id] = true;
        remplirChamps($("ep-o-" + id));
        if (id === "libres") rendreLibres();
        if (id === "objectifs") construireObjectifs();
        O.placerPastilles(d);
      }
      if (res && MAJ[id]) MAJ[id]();
      O.placerPastilles(d);
    });
  });

  /* ===================================================================
     Événements
     =================================================================== */
  function lireChamp(t) {
    var r = F.lire(t.value), k = t.getAttribute("data-ep"), ty = t.getAttribute("data-t");
    var ok = r.valide && (ty !== "i" || Math.floor(r.valeur) === r.valeur);
    if (k === "ageActuel" && ok && !r.vide && (r.valeur > 80)) ok = false;
    t.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!ok) { etatValide = false; return false; }
    etatValide = true;
    etat[k] = r.vide ? 0 : r.valeur;
    if (k === "ecartPct") ui.supportPerso = true;
    if (k === "ageActuel") appliquerRetraite();
    return true;
  }

  R.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.hasAttribute("data-ep")) {
      lireChamp(t);
      if (t.getAttribute("data-ep") === "ageActuel") majDuree();
      planifier(false); signaler(); return;
    }
    if (t.id === "ep-duree") { etat.dureeAns = Number(t.value); $("ep-duree-val").textContent = pluriel(etat.dureeAns, "an"); majCurseur(t); planifier(false); signaler(); return; }
    if (t.id === "ep-annee-lue") { t.setAttribute("data-touche", "1"); majCurseur(t); dessinerProjection(false); lireAnnee(); return; }
    if (t.id === "ep-inv-eco") { majInverses(); return; }
    if (t.id === "ep-inv-cap") { planifierCapital(); return; }
    if (t.hasAttribute("data-libre")) {
      var i = Number(t.getAttribute("data-libre")), k = t.getAttribute("data-k"), r = F.lire(t.value);
      var ok = r.valide && !r.vide && (k !== "annee" || Math.floor(r.valeur) === r.valeur);
      t.setAttribute("aria-invalid", ok ? "false" : "true");
      if (ok && etat.libres[i]) { etat.libres[i][k] = r.valeur; planifier(false); signaler(); }
      return;
    }
    if (t.hasAttribute("data-obj")) {
      var j = Number(t.getAttribute("data-obj")), kk = t.getAttribute("data-k"), o = ui.objectifs[j];
      if (!o) return;
      if (kk === "nom") o.nom = t.value;
      else { var rr = F.lire(t.value); o[kk] = rr.valide ? rr.valeur : NaN; t.setAttribute("aria-invalid", rr.valide ? "false" : "true"); }
      MAJ.objectifs();
      return;
    }
    if (/^ep-si-/.test(t.id)) { MAJ.etsi(true); return; }
    if (t.id === "ep-ret-depart") {
      var rd = F.lire(t.value);
      if ($("ep-ret-actif").checked && rd.valide && !rd.vide) { etat.ageDepart = borne(Math.round(rd.valeur), 0, 80); appliquerRetraite(); majDuree(); planifier(false); signaler(); }
      else MAJ.retraite();
      return;
    }
    if (t.hasAttribute("data-outil-champ")) {
      var d = t.closest("details.ep-outil"), id = d && d.getAttribute("data-outil");
      if (t.hasAttribute("data-offre") && t.getAttribute("data-offre") === "a") ui.offresTouchees = true;
      if (id === "sortie" || id === "retraite") { MAJ.sortie && outilsConstruits.sortie && MAJ.sortie(); MAJ.retraite && outilsConstruits.retraite && MAJ.retraite(); return; }
      if (id && MAJ[id]) MAJ[id]();
    }
  });

  R.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.hasAttribute("data-ep") && t.getAttribute("aria-invalid") !== "true") { t.value = valeurChamp(t); return; }
    if (t.name === "ep-produit") { ui.mode = t.value; majProduits(); planifier(true); signaler(); O.placerPastilles(R); return; }
    if (t.name === "ep-freq") {
      var avant = FACT[etat.frequence], apres = FACT[t.value];
      etat.versement = arr3(etat.versement * avant / apres);
      etat.versementCea = arr3(etat.versementCea * avant / apres);
      etat.frequence = t.value;
      remplirChamps(); planifier(true); signaler(); return;
    }
    if (t.id === "ep-chef") { etat.chef = t.checked; planifier(true); signaler(); return; }
    if (t.id === "ep-annee") { etat.annee = t.value; planifier(true); signaler(); return; }
    if (t.id === "ep-inclure") { ui.inclure = t.checked; planifier(true); signaler(); return; }
    if (t.id === "ep-reinvestir") { etat.reinvestir = t.checked; planifier(true); signaler(); return; }
    if (t.name === "ep-support") {
      ui.supportPerso = t.value === "perso";
      if (!ui.supportPerso) etat.ecartPct = SC.SUPPORTS[t.value];
      remplirChamps($("ep-o-hypotheses")); planifier(true); signaler(); return;
    }
    if (t.name === "ep-r-produit") { ui.rachatProduit = t.value; MAJ.rachat(); return; }
    if (t.name === "ep-cp-chef") { ui.coupleChef = Number(t.value); MAJ.couple(); return; }
    if (t.id === "ep-ret-actif") {
      if (t.checked) { var dep = F.lire($("ep-ret-depart").value); etat.ageDepart = dep.valide && dep.valeur > 0 ? borne(Math.round(dep.valeur), 0, 80) : 60; appliquerRetraite(); }
      else etat.ageDepart = 0;
      majDuree(); planifier(true); signaler(); return;
    }
    if (t.id === "ep-releve") { lireReleve(t); return; }
    if (t.hasAttribute("data-libre") && t.getAttribute("data-k") === "montant") { var ll = etat.libres[Number(t.getAttribute("data-libre"))]; if (ll && t.getAttribute("aria-invalid") !== "true") t.value = F.saisie(ll.montant); }
    if (t.id === "ep-duree") { planifier(true); }
  });

  R.addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b || !R.contains(b)) return;
    var cpt = b.getAttribute("data-cpt");
    if (cpt) {
      var max = cpt === "parents" ? 2 : 15;
      etat[cpt] = borne((etat[cpt] || 0) + Number(b.getAttribute("data-pas")), 0, max);
      majCompteur(cpt, true); planifier(true); signaler(); return;
    }
    if (b.id === "ep-opt-appliquer") { appliquerVersement("versement", Number(b.getAttribute("data-valeur")), b); return; }
    if (b.id === "ep-inv-eco-app" && inverse.eco != null) { appliquerVersement("versement", inverse.eco, b); return; }
    if (b.id === "ep-inv-cap-app" && inverse.cap != null) { appliquerVersement(champVersement(), inverse.cap, b); return; }
    if (b.id === "ep-tab-eco" || b.id === "ep-tab-cap") { choisirOnglet(b.id === "ep-tab-eco" ? "eco" : "cap"); return; }
    if (b.id === "ep-libre-ajout") {
      if (etat.libres.length >= 10) return;
      var dernier = etat.libres.length ? etat.libres[etat.libres.length - 1].annee : 0;
      etat.libres.push({ annee: Math.min(etat.dureeAns, dernier + 1 || 1), montant: 1000 });
      if (ui.mode === "cea") { ui.mode = "ac"; remplirChamps(); O.placerPastilles(R); }
      rendreLibres(); planifier(true); signaler();
      var champs = R.querySelectorAll('[data-libre][data-k="montant"]'); if (champs.length) champs[champs.length - 1].focus();
      return;
    }
    if (b.hasAttribute("data-libre-suppr")) { etat.libres.splice(Number(b.getAttribute("data-libre-suppr")), 1); rendreLibres(); planifier(true); signaler(); $("ep-libre-ajout").focus(); return; }
    if (b.id === "ep-st-appliquer") {
      var cible = repartitionConseillee();
      if (!cible) return;
      etat.versement = cible.av; etat.versementCea = cible.cea; ui.mode = cible.cea > 0 && cible.av > 0 ? "ac" : cible.cea > 0 ? "cea" : "av";
      remplirChamps(); O.placerPastilles(R); planifier(true); signaler();
      O.toast("Répartition appliquée : " + dt(cible.av) + " en assurance vie et " + dt(cible.cea) + " en CEA " + PERIODE[etat.frequence] + ".");
      return;
    }
    if (b.id === "ep-scn-ajout") { ajouterScenario(ui.scenarios.length ? "Simulation " + (ui.scenarios.length + 1) : "Simulation actuelle", etatScenario()); return; }
    if (b.hasAttribute("data-variante")) {
      var x = window.Comparateur.variantes(etatScenario()).filter(function (z) { return z.cle === b.getAttribute("data-variante"); })[0];
      if (!x) { O.toast("Indiquez d'abord un versement."); return; }
      ajouterScenario(NOMS_VARIANTES[x.cle], x.etat); return;
    }
    if (b.hasAttribute("data-scn-app")) {
      var s = ui.scenarios[Number(b.getAttribute("data-scn-app"))];
      if (!s) return;
      etat = Object.assign(SC.defauts(), JSON.parse(JSON.stringify(s.etat)));
      ui.mode = etat.versement > 0 && etat.versementCea > 0 ? "ac" : etat.versementCea > 0 && !(etat.versement > 0) ? "cea" : "av";
      remplirChamps(); O.placerPastilles(R); planifier(true); signaler();
      O.toast("Scénario appliqué : " + s.nom + "."); return;
    }
    if (b.hasAttribute("data-scn-suppr")) { ui.scenarios.splice(Number(b.getAttribute("data-scn-suppr")), 1); MAJ.scenarios(); $("ep-scn-ajout").focus(); return; }
    if (b.id === "ep-cp-app" && ui.couple) {
      var cc = res, fixe = partFixeAv(cc);
      appliquerVersement("versement", Math.max(0, arr3((ui.couple.part1 - fixe) / cc.facteur)), b); return;
    }
    if (b.hasAttribute("data-modele")) {
      if (ui.objectifs.length >= 5) return;
      ui.objectifs.push(MODELES[b.getAttribute("data-modele")]());
      construireObjectifs();
      var lst = R.querySelectorAll('[data-obj][data-k="montant"]'); if (lst.length) lst[lst.length - 1].focus();
      return;
    }
    if (b.hasAttribute("data-obj-suppr")) { ui.objectifs.splice(Number(b.getAttribute("data-obj-suppr")), 1); construireObjectifs(); return; }
    if (b.id === "ep-obj-ajuster" && ui.planObjectifs) {
      var f = res.facteur;
      appliquerVersement("versement", (ui.mode === "cea" ? 0 : etat.versement) + ui.planObjectifs.manque * 12 / f, b); return;
    }
    if (b.id === "ep-si-app" && etsi) {
      etat.versement = arr3(etsi.v * 12 / res.facteur); etat.dureeAns = etsi.d; etat.rendementPct = etsi.r; etat.ageDepart = 0;
      if (etat.tauxGarantiPct > etsi.r) etat.tauxGarantiPct = etsi.r;
      if (ui.mode === "cea") ui.mode = "ac";
      remplirChamps(); O.placerPastilles(R); planifier(true); signaler();
      O.toast("Valeurs appliquées à la simulation."); return;
    }
    if (b.id === "ep-releve-app") { appliquerReleve(); return; }
    if (b.hasAttribute("data-export")) { exporter(b.getAttribute("data-export"), b); return; }
    if (b.id === "ep-recu-fermer") { $("ep-recu").close(); return; }
    if (b.id === "ep-recu-dl") { blobRecu(function (bl) { telecharger("recu-fiscal-" + dateIso() + ".png", bl); O.toast("Image téléchargée."); }); return; }
    if (b.id === "ep-recu-partager") {
      blobRecu(function (bl) {
        navigator.share({ files: [new File([bl], "recu-fiscal.png", { type: "image/png" })], title: "Reçu fiscal", text: "Mon économie d'impôt : " + dt(res.sim.economie) + " par an." })
          .catch(function (e) { if (!e || e.name !== "AbortError") O.toast("Partage impossible : téléchargez l'image."); });
      });
      return;
    }
  });

  /* Onglets de l'objectif (flèches du clavier) */
  function choisirOnglet(k) {
    ui.objectifOnglet = k;
    [["eco", "ep-tab-eco", "ep-pan-eco"], ["cap", "ep-tab-cap", "ep-pan-cap"]].forEach(function (x) {
      var sel = x[0] === k;
      $(x[1]).setAttribute("aria-selected", sel ? "true" : "false");
      $(x[1]).tabIndex = sel ? 0 : -1;
      $(x[2]).hidden = !sel;
    });
    if (k === "cap") majCapital(); else majInverses();
  }
  R.querySelector('[role="tablist"]').addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Home" && ev.key !== "End") return;
    ev.preventDefault();
    var k = ui.objectifOnglet === "eco" ? "cap" : "eco";
    if (ev.key === "Home") k = "eco"; if (ev.key === "End") k = "cap";
    choisirOnglet(k);
    $(k === "eco" ? "ep-tab-eco" : "ep-tab-cap").focus();
  });

  /* Pointeur sur le graphique de projection : lit l'année la plus proche */
  $("ep-g-proj").addEventListener("pointermove", function (ev) {
    if (!geoProj || !res || !res.actif) return;
    var svg = this.querySelector("svg"); if (!svg) return;
    var rect = svg.getBoundingClientRect(), x = (ev.clientX - rect.left) * geoProj.W / rect.width;
    var n = res.etat.dureeAns, a = borne(Math.round((x - geoProj.X(0)) / (geoProj.X(n) - geoProj.X(0)) * n), 0, n);
    var c = $("ep-annee-lue");
    if (Number(c.value) === a) return;
    c.value = String(a); c.setAttribute("data-touche", "1"); majCurseur(c); dessinerProjection(false); lireAnnee();
  });

  /* Relevé PDF */
  var releve = null;
  var CHAMPS_RELEVE = [["tauxServi", "Taux servi", "rendementPct", "%"], ["tauxGaranti", "Taux garanti", "tauxGarantiPct", "%"], ["fraisGestion", "Frais de gestion", "fraisPct", "%"], ["fraisVersement", "Frais sur versement", "fraisEntreePct", "%"], ["versement", "Versement périodique", "versement", "DT"], ["capital", "Capital acquis (information)", null, "DT"]];
  function lireReleve(input) {
    var f = input.files && input.files[0], out = $("ep-releve-res");
    input.value = "";
    if (!f) return;
    if (f.size > 15e6) { out.innerHTML = encart("alerte", "Fichier trop volumineux (15 Mo au plus)."); return; }
    out.innerHTML = '<p class="champ__aide">Lecture du relevé…</p>';
    f.arrayBuffer().then(function (b) { return window.Releve.texte(b); }).then(function (texte) {
      var r = window.Releve.analyser(texte);
      releve = r;
      if (!r.trouves) { out.innerHTML = encart("alerte", "Aucune valeur reconnue : le PDF est peut-être scanné (image). Saisissez les taux à la main."); return; }
      out.innerHTML = '<fieldset class="ep-releve"><legend>Valeurs trouvées : cochez celles à appliquer</legend>' + CHAMPS_RELEVE.filter(function (c) { return r[c[0]] != null; }).map(function (c) {
        return '<label class="ep-coche"><input type="checkbox" data-releve="' + c[0] + '"' + (c[2] ? " checked" : " disabled") + "><span>" + c[1] + " : <strong>" + esc(c[3] === "%" ? pc(r[c[0]], 2) : dt(r[c[0]])) + "</strong></span></label>";
      }).join("") + '<button type="button" class="bouton bouton--petit bouton--epargne" id="ep-releve-app">' + ico("valide") + "Appliquer la sélection</button></fieldset>";
    }).catch(function () { out.innerHTML = encart("alerte", "Lecture impossible : vérifiez qu'il s'agit d'un PDF texte."); });
  }
  function appliquerReleve() {
    if (!releve) return;
    var n = 0;
    R.querySelectorAll("[data-releve]:checked").forEach(function (cb) {
      var c = CHAMPS_RELEVE.filter(function (x) { return x[0] === cb.getAttribute("data-releve"); })[0];
      if (!c || !c[2]) return;
      etat[c[2]] = c[2] === "versement" ? arr3(releve[c[0]]) : releve[c[0]];
      if (c[2] === "versement" && ui.mode === "cea") ui.mode = "ac";
      n++;
    });
    if (etat.tauxGarantiPct > etat.rendementPct) etat.tauxGarantiPct = etat.rendementPct;
    remplirChamps(); planifier(true); signaler();
    O.toast(n ? pluriel(n, "valeur") + " appliquée" + (n > 1 ? "s" : "") + "." : "Aucune valeur cochée.");
  }

  /* ===================================================================
     Exports
     =================================================================== */
  function telecharger(nom, blob) {
    var url = URL.createObjectURL(blob), a = doc.createElement("a");
    a.href = url; a.download = nom; a.rel = "noopener";
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function exiger() {
    if (!res || !(res.etat.revenu > 0)) { O.toast("Indiquez d'abord votre revenu annuel imposable."); $("ep-revenu").focus(); return false; }
    return true;
  }
  function exporter(type, bouton) {
    if (!exiger()) return;
    if (type === "csv") return exporterCsv();
    if (type === "xlsx") return exporterXlsx();
    if (type === "ics") return exporterIcs();
    if (type === "recu") return ouvrirRecu();
    if (type === "texte") return copierResume(bouton);
    if (type === "pdf") return exporterPdf(bouton);
  }
  function exporterCsv() {
    var c = res;
    if (!c.actif) { O.toast("Indiquez un versement pour exporter la projection."); return; }
    var l = [["Année", "Versé cumulé (DT)", "Économie d'impôt de l'année (DT)", "Capital prudent (DT)", "Capital médian (DT)", "Capital dynamique (DT)", "Capital médian en dinars constants (DT)"]];
    c.med.annees.forEach(function (a, i) { l.push([a.annee, a.verse, i ? c.med.flux[i - 1].economie : 0, c.sc.prudent.annees[i].capital, a.capital, c.sc.dynamique.annees[i].capital, a.capitalReel]); });
    telecharger("epargne-projection-" + dateIso() + ".csv", new Blob([window.ExportTableur.csv(l)], { type: "text/csv;charset=utf-8" }));
    O.toast("Tableur CSV téléchargé.");
  }
  function exporterIcs() {
    var c = res, e = c.etat;
    if (!(e.versement > 0) && !(e.versementCea > 0) && !(e.initialAv > 0) && !(e.initialCea > 0)) { O.toast("Indiquez un versement pour créer les rappels."); return; }
    var m = new Date(), debut = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    var ics = window.Calendrier.generer(e, { debut: debut, fmt: function (v) { return F.saisie(v); }, dureeMinimaleAv: c.sim.produits.av.dureeMinimaleAns, dureeBlocageCea: c.sim.produits.cea.dureeBlocageAns, maintenant: m });
    telecharger("epargne-rappels-" + dateIso() + ".ics", new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    O.toast("Rappels téléchargés : ouvrez le fichier pour les ajouter à votre agenda.");
  }
  function texteResume() {
    var c = res, s = c.sim, e = c.etat, per = PERIODE[e.frequence], l = [];
    var prod = [];
    if (c.aAv) prod.push(dt(e.versement) + " " + per + " en assurance vie");
    if (c.aCea) prod.push(dt(e.versementCea) + " " + per + " sur un CEA");
    l.push("Mon épargne : " + (prod.join(" et ") || "aucun versement") + ".");
    l.push("Économie d'impôt" + (s.exAv + s.exCea > 0 ? " supplémentaire" : "") + " : " + dt(s.economie) + " par an (" + dt(s.economie / 12) + " par mois), impôt " + dt(s.impotAvant) + " → " + dt(s.impotApres) + ".");
    l.push("Effort réel : " + dt(Math.max(0, c.investissement - s.economie) / 12) + " par mois.");
    if (c.actif) l.push("Capital estimé dans " + pluriel(e.dureeAns, "an") + " : " + dt0(c.sc.prudent.capitalFinal) + " à " + dt0(c.sc.dynamique.capitalFinal) + " (médian " + dt0(c.med.capitalFinal) + ").");
    l.push("Simulation indicative (article 39 du Code de l'IRPP), faite avec Orbite.");
    return l.join("\n");
  }
  function copierResume(bouton) {
    var t = texteResume();
    function fini() { O.toast("Résumé copié : collez-le où vous voulez."); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(fini, function () { repli(t); fini(); });
    else { repli(t); fini(); }
    function repli(s) { var ta = doc.createElement("textarea"); ta.value = s; ta.setAttribute("readonly", ""); ta.className = "cache"; doc.body.appendChild(ta); ta.select(); try { doc.execCommand("copy"); } catch (e) { /* ignoré */ } ta.remove(); if (bouton) bouton.focus(); }
  }
  function exporterXlsx() {
    var c = res, s = c.sim, e = c.etat;
    var T = function (v) { return { v: arr3(v), s: "tnd" }; }, P = function (v) { return v == null ? "—" : { v: v / 100, s: "pct" }; }, G = function (v) { return { v: v, s: "gras" }; };
    var fe = [];
    var syn = [[{ v: "Simulation d'assurance vie et de CEA", s: "titre" }], ["Édité le " + new Date().toLocaleDateString("fr-FR"), "Barème : " + s.regles.libelle], [],
      [G("Hypothèses"), G("")], ["Revenu annuel imposable", T(e.revenu)],
      ["Situation familiale", (e.chef ? "Chef de famille" : "Non chef de famille") + " · " + e.enfants + " enfant(s), " + e.infirmes + " handicapé(s), " + e.etudiants + " étudiant(s), " + e.parents + " parent(s)"],
      ["Versement assurance vie " + PERIODE[e.frequence], T(e.versement)], ["Versement CEA " + PERIODE[e.frequence], T(e.versementCea)],
      ["Assurance vie la 1re année", T(c.investissementAv)], ["CEA la 1re année", T(c.investissementCea)], [],
      [G("Impôt annuel"), G("")], ["Impôt avant cette épargne", T(s.impotAvant)], ["Impôt après", T(s.impotApres)],
      ["Économie d'impôt", { f: "B13-B14", v: arr3(s.economie), s: "tndGras" }], ["Taux de réduction", P(s.tauxReduction)], ["Montant optimal en assurance vie", T(s.optimal)]];
    if (c.actif) syn.push([], [G("Projection du capital"), G("")], ["Durée", e.dureeAns + " ans"], ["Capital au terme (médian)", T(c.med.capitalFinal)], ["Valeur totale (capital + économie)", T(c.valeurTotale)], ["Rendement effectif", P(c.effectif)]);
    syn.push([], ["Simulation indicative, non contractuelle."]);
    fe.push({ nom: "Synthèse", lignes: syn, largeurs: [52, 30] });
    var tr = [[G("Tranche (DT)"), G("Taux"), G("Impôt sans"), G("Impôt avec"), G("Économie")]];
    s.avant.parTranche.forEach(function (b, i) {
      var a = s.apres.parTranche[i] || { impot: 0 }, r = tr.length + 1;
      tr.push([F.dt0(b.min) + (b.max === Infinity ? " et plus" : " – " + F.dt0(b.max)), { v: b.taux, s: "pct" }, T(b.impot), T(a.impot), { f: "C" + r + "-D" + r, v: arr3(b.impot - a.impot), s: "tnd" }]);
    });
    var n = tr.length;
    tr.push([G("Total"), "", { f: "SUM(C2:C" + n + ")", s: "tndGras" }, { f: "SUM(D2:D" + n + ")", s: "tndGras" }, { f: "SUM(E2:E" + n + ")", s: "tndGras" }]);
    fe.push({ nom: "Impôt par tranche", lignes: tr, largeurs: [26, 10, 18, 18, 18], figer: 1 });
    if (c.actif) {
      var pr = [[G("Année"), G("Total versé"), G("Prudent"), G("Médian"), G("Dynamique"), G("Gain financier"), G("Dinars constants")]];
      c.med.annees.forEach(function (a, i) { var r = i + 2; pr.push([a.annee, T(a.verse), T(c.sc.prudent.annees[i].capital), T(a.capital), T(c.sc.dynamique.annees[i].capital), { f: "D" + r + "-B" + r, v: arr3(a.capital - a.verse), s: "tnd" }, T(a.capitalReel)]); });
      fe.push({ nom: "Projection", lignes: pr, largeurs: [8, 18, 18, 18, 18, 18, 20], figer: 1 });
    }
    if (mc.res && outilsConstruits.mc) {
      var m = [[G("Année"), G("P10"), G("P25"), G("Médiane"), G("P75"), G("P90")]];
      mc.res.annees.forEach(function (a, i) { var ce = mc.res.centiles; m.push([a, T(ce.p10[i]), T(ce.p25[i]), T(ce.p50[i]), T(ce.p75[i]), T(ce.p90[i])]); });
      fe.push({ nom: "Projection probabiliste", lignes: m, largeurs: [8, 18, 18, 18, 18, 18], figer: 1 });
    }
    if (ui.strategie) {
      var st = [[G("Année"), G("Budget"), G("Assurance vie"), G("CEA"), G("Économie d'impôt")]];
      ui.strategie.plan.forEach(function (l) { st.push([l.annee, T(l.budget), T(l.av), T(l.cea), T(l.economie)]); });
      fe.push({ nom: "Stratégie optimale", lignes: st, largeurs: [8, 18, 18, 18, 18], figer: 1 });
    }
    if (ui.scenarios.length) {
      var ms = ui.scenarios.map(function (x) { return window.Comparateur.mesurer(x.etat); });
      var sc = [[G("Critère")].concat(ui.scenarios.map(function (x) { return G(x.nom); }))];
      [["Économie d'impôt par an", "economie"], ["Impôt après", "impotApres"], ["Effort réel par mois", "effortMensuel"], ["Capital médian", "capital"], ["Valeur totale", "valeur"]].forEach(function (lg) { sc.push([lg[0]].concat(ms.map(function (x) { return x[lg[1]] == null ? "—" : T(x[lg[1]]); }))); });
      fe.push({ nom: "Scénarios", lignes: sc, largeurs: [30].concat(ms.map(function () { return 22; })), figer: 1 });
    }
    if (ui.planObjectifs) {
      var ob = [[G("Projet"), G("Montant visé"), G("Dans"), G("Déjà épargné"), G("Par mois"), G("Financé")]];
      ui.planObjectifs.objectifs.forEach(function (o) { if (o.valide) ob.push([o.nom || "", T(o.montant), o.ans + " ans", T(o.deja), T(o.mensuel), P(o.couverture)]); });
      fe.push({ nom: "Objectifs de vie", lignes: ob, largeurs: [28, 18, 10, 18, 18, 12], figer: 1 });
    }
    var octets = window.Xlsx.classeur(fe, { titre: "Simulation d'assurance vie et de CEA" });
    telecharger("epargne-simulation-" + dateIso() + ".xlsx", new Blob([octets], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    O.toast("Classeur Excel téléchargé.");
  }

  /* Rapport PDF : jsPDF (copie locale) chargé à la demande, mise en page de moteurs/vie/pdf.js */
  function chargerScript(src) {
    return new Promise(function (ok, ko) {
      var s = doc.createElement("script");
      s.src = src; s.onload = ok; s.onerror = ko;
      doc.head.appendChild(s);
    });
  }
  var promessePdf = null;
  function outilsPdf() {
    if (window.jspdf && window.RapportPDF) return Promise.resolve();
    if (!promessePdf) promessePdf = (window.jspdf ? Promise.resolve() : chargerScript("/espace/vendor/jspdf.umd.min.js")).then(function () { return window.RapportPDF ? null : chargerScript("/moteurs/vie/pdf.js"); });
    return promessePdf;
  }
  function trad(s, v) { return String(s).replace(/\{(\d+)\}/g, function (m, i) { return v && v[i] != null ? v[i] : m; }); }
  function donneesRapport() {
    var c = res, s = c.sim, e = c.etat, per = PERIODE[e.frequence];
    var h = 0, cle = (PA.encoder(e) || "") + dateIso();
    for (var i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
    var det = s.deductionsDetail;
    if (outilsConstruits.mc && c.actif) calculerMc();
    var d = {
      langue: "fr", t: trad, fmtTND: function (v) { return dt3(v); }, fmtPct: function (v) { return pc(v); }, fmtEntier: function (v) { return F.dt0(v); }, fmtAmount: function (v) { return F.dt3(v); },
      date: new Date(), bareme: s.regles.libelle, provisoire: !!s.regles.provisoire,
      dossier: "SIM-" + dateIso().replace(/-/g, "") + "-" + ("000000" + h.toString(36).toUpperCase()).slice(-6),
      client: "", conseiller: "", agence: null, lien: "", qr: null, proposition: false,
      couleur: { principale: [122, 90, 248], secondaire: [89, 37, 220], tertiaire: [167, 139, 250] },
      calc: c,
      hypotheses: [
        ["Revenu annuel imposable", dt3(e.revenu)],
        ["Situation familiale", (e.chef ? "Chef de famille" : "Non chef de famille") + " · " + e.enfants + " enfant(s), " + e.infirmes + " handicapé(s), " + e.etudiants + " étudiant(s), " + e.parents + " parent(s)"],
        ["Assurance vie", dt3(c.investissementAv) + " la 1re année (" + dt3(e.versement) + " " + per + (e.initialAv > 0 ? " + initial " + dt3(e.initialAv) : "") + ")"],
        ["CEA", dt3(c.investissementCea) + " la 1re année (" + dt3(e.versementCea) + " " + per + (e.initialCea > 0 ? " + initial " + dt3(e.initialCea) : "") + ")"],
        ["Économie par produit", "assurance vie " + dt3(s.economieAv) + " · CEA " + dt3(s.economieCea)]
      ].concat(s.exAv + s.exCea > 0 ? [["Contrats actuels pris en compte", dt3(s.exAv + s.exCea) + " par an (économie déjà obtenue " + dt3(s.economieExistante) + ")"]] : [])
        .concat(e.ageDepart > 0 ? [["Retraite", "Âge actuel " + e.ageActuel + " ans, départ à " + e.ageDepart + " ans"]] : []),
      deductions: [
        ["Revenu annuel imposable", s.revenu, ""], ["Frais professionnels", det.fraisProfessionnels, "moins sous"], ["Chef de famille", det.chefDeFamille, "moins sous"],
        ["Enfants à charge", det.enfants, "moins sous"], ["Enfants handicapés", det.enfantsInfirmes, "moins sous"], ["Étudiants", det.etudiants, "moins sous"], ["Parents à charge", det.parents, "moins sous"],
        ["Revenu net imposable", s.revenuNet, "total"], ["Assurance vie déduite", Math.min(s.deductionAv, s.revenuNet), "moins inv"],
        ["CEA déduit", Math.min(s.deductionCea, Math.max(0, s.revenuNet - s.deductionAv)), "moins inv"], ["Revenu après déduction", s.revenuNetApres, "total"]
      ],
      points: (function () { var xm = Math.max(s.optimal * 1.5, s.investissementAv * 1.15, 100), p = []; for (var k = 0; k <= 40; k++) { var x = xm * k / 40; p.push([x, economiePour(x)]); } return p; })(),
      projection: c.actif ? lignesProjection(c).map(function (l) { return [l[0], l[1], l[2] === "fort" ? "fort" : ""]; }) : null,
      hypothesesProjection: c.actif ? e.dureeAns + " ans ; assurance vie : taux servi " + pc(e.rendementPct) + " (garanti " + pc(e.tauxGarantiPct) + "), frais " + pc(e.fraisPct) + ", frais sur versement " + pc(e.fraisEntreePct) + " ; CEA : rendement " + pc(e.rendementCeaPct) + ", frais " + pc(e.fraisCeaPct) + (e.croissancePct > 0 ? ", hausse annuelle " + pc(e.croissancePct) : "") + (e.inflationPct > 0 ? ", inflation " + pc(e.inflationPct) : "") + (e.reinvestir ? ", économie d'impôt réinvestie" : "") : "",
      scenarios: c.actif ? ["prudent", "median", "dynamique"].map(function (k) { return [NOMS_SCEN[k] + " · " + libelleTaux(c, k), dt3(c.sc[k].capitalFinal)]; }) : null,
      comparatif: c.actif ? elementsComparatif(c).map(function (x) { return [x[0], dt3(x[1]), x[1]]; }) : null,
      rachat: ui.rachat && outilsConstruits.rachat ? { titre: "Sortie anticipée · " + (ui.rachat.produit === "cea" ? "CEA" : "Assurance vie"), lignes: [["Capital retiré en fin d'année " + ui.rachat.annee, dt3(ui.rachat.capitalRachete)], ["Pénalité", dt3(ui.rachat.penalite)], ["Impôt de réintégration", dt3(ui.rachat.impotReintegration)], ["Montant net perçu", dt3(ui.rachat.netRecu), "fort"], ["Coût de la sortie", dt3(ui.rachat.coutSortie)]] } : null,
      prevoyance: ui.prevoyance && outilsConstruits.sortie ? { titre: "Prévoyance et sortie", lignes: [["Rente annuelle estimée (" + ui.prevoyance.dureeRente + " ans)", dt3(ui.prevoyance.rente.annuelle), "fort"], ["Soit par mois", dt3(ui.prevoyance.rente.mensuelle)], ["Capital décès en année " + ui.prevoyance.deces.annee, dt3(ui.prevoyance.deces.capitalDeces)], ["Rentes perçues au total", dt3(ui.prevoyance.sortie.totalRentes)]] } : null,
      mc: mc.res && outilsConstruits.mc && c.actif ? {
        titre: "Projection probabiliste", texte: F.dt0(mc.res.trajectoires) + " trajectoires de marché simulées, volatilité " + libre(mc.vol[0]) + " pts (vie) et " + libre(mc.vol[1]) + " pts (CEA).",
        phrases: phrasesMc(mc.res).map(function (x) { return x[1]; }), centiles: mc.res.centiles, verses: c.med.annees.map(function (a) { return a.verse; }), objectif: mc.res.objectif,
        legende: ["8 cas sur 10", "1 cas sur 2", "Médiane", "Versements cumulés", "Objectif"], fourchette: "Capital au terme dans 8 cas sur 10 : entre " + dt0(mc.res.finalP10) + " et " + dt0(mc.res.finalP90)
      } : null,
      strategie: ui.strategie && ui.strategie.gain > 1 && outilsConstruits.strategie ? { titre: "Répartition optimale année par année", texte: "En répartissant autrement le même budget, la valeur au terme augmente de " + dt3(ui.strategie.gain) + ".", colonnes: ["Année", "Budget", "Assurance vie", "CEA", "Économie"], lignes: ui.strategie.plan.map(function (l) { return [String(l.annee), dt3(l.budget), dt3(l.av), dt3(l.cea) + " (" + Math.round(l.partCea) + " %)", dt3(l.economie)]; }) } : null,
      contrats: ui.contrats && outilsConstruits.contrats ? { titre: "Comparateur de contrats", colonnes: ["Offre", "Capital médian", "Au taux garanti", "Coût des frais", "Rendement effectif"], lignes: ui.contrats.filter(function (r) { return r.valide; }).map(function (r) { return [(r.meilleur ? "* " : "") + r.nom, dt3(r.capital), dt3(r.capitalGaranti), dt3(r.frais), r.rendementEffectif == null ? "—" : pc(r.rendementEffectif)]; }) } : null,
      recommandation: { lignes: [], economie: "", effort: "", optimal: "" }, attention: []
    };
    return d;
  }
  function exporterPdf(bouton) {
    if (bouton) bouton.disabled = true;
    outilsPdf().then(function () {
      var d = donneesRapport();
      var blob = window.RapportPDF.generer(d);
      telecharger("epargne-" + d.dossier + ".pdf", blob);
      O.toast("Rapport PDF téléchargé.");
    }).catch(function (err) {
      if (window.console) console.warn(err);
      promessePdf = null;
      O.toast("PDF indisponible : la boîte d'impression prend le relais.");
      window.print();
    }).then(function () { if (bouton) bouton.disabled = false; });
  }

  /* Reçu fiscal (image PNG dessinée sur un canevas) */
  function dessinerRecu(cv) {
    var c = res, s = c.sim, e = c.etat, W = cv.width, H = cv.height, x = cv.getContext("2d");
    var AFF = '"Bricolage Grotesque", "Mona Sans", system-ui, sans-serif', TXT = '"Mona Sans", system-ui, sans-serif';
    function ecrire(t, px, py, taille, poids, coul, align, police) { x.font = poids + " " + taille + "px " + (police || TXT); x.fillStyle = coul; x.textAlign = align || "left"; x.fillText(t, px, py); }
    x.fillStyle = "#0A0D16"; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 160; i++) { var a = (i * 97.13) % W, b = (i * 61.7 + (i % 7) * 131) % H; x.fillStyle = "rgba(255,255,255," + (0.12 + (i % 5) * 0.06) + ")"; x.beginPath(); x.arc(a, b, (i % 3) * 0.6 + 0.6, 0, Math.PI * 2); x.fill(); }
    var g = x.createRadialGradient(W * 0.82, 140, 10, W * 0.82, 140, 520); g.addColorStop(0, "rgba(167,139,250,0.40)"); g.addColorStop(1, "rgba(167,139,250,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(167,139,250,0.35)"; x.lineWidth = 2; x.beginPath(); x.ellipse(W * 0.82, 140, 300, 110, -0.35, 0, Math.PI * 2); x.stroke();
    x.fillStyle = "#A78BFA"; x.beginPath(); x.arc(W * 0.82 + 270, 60, 16, 0, Math.PI * 2); x.fill();
    var L = 96;
    ecrire("Reçu fiscal", L, 190, 64, 780, "#F2F4F8", "left", AFF);
    ecrire("Assurance vie et CEA · article 39 du Code de l'IRPP", L, 240, 28, 500, "#B4BBCB");
    x.fillStyle = "#141927"; arrondi(x, L - 24, 300, W - 2 * L + 48, 700, 36); x.fill();
    ecrire(s.exAv + s.exCea > 0 ? "Mon économie d'impôt supplémentaire" : "Mon économie d'impôt", L + 20, 380, 32, 600, "#B4BBCB");
    ecrire(F.dt0(s.economie), L + 16, 540, 170, 800, "#A78BFA", "left", AFF);
    x.font = "800 170px " + AFF; var lg = x.measureText(F.dt0(s.economie)).width;
    ecrire("DT par an", L + 40 + lg, 540, 40, 700, "#F2F4F8");
    ecrire("soit " + dt(s.economie / 12) + " par mois · " + pc(s.tauxReduction) + " d'impôt en moins", L + 20, 600, 30, 500, "#F2F4F8");
    var yb = 680, larg = W - 2 * L - 40;
    function barre(lib, val, part, coul) {
      ecrire(lib, L + 20, yb, 26, 600, "#B4BBCB"); ecrire(dt(val), L + 20 + larg, yb, 26, 700, "#F2F4F8", "right");
      x.fillStyle = "rgba(255,255,255,0.10)"; arrondi(x, L + 20, yb + 16, larg, 18, 9); x.fill();
      x.fillStyle = coul; arrondi(x, L + 20, yb + 16, Math.max(18, larg * part), 18, 9); x.fill();
      yb += 90;
    }
    barre("Impôt avant", s.impotAvant, 1, "#5E6577");
    barre("Impôt après", s.impotApres, s.impotAvant > 0 ? s.impotApres / s.impotAvant : 0, "#4ADE80");
    var y = 1080, lignesR = [];
    if (c.investissementAv > 0) lignesR.push(["Assurance vie par an", dt(c.investissementAv)]);
    if (c.investissementCea > 0) lignesR.push(["CEA par an", dt(c.investissementCea)]);
    lignesR.push(["Effort réel par mois", dt(Math.max(0, c.investissement - s.economie) / 12)]);
    if (c.actif) lignesR.push(["Capital médian dans " + pluriel(e.dureeAns, "an"), dt0(c.med.capitalFinal)]);
    lignesR.slice(0, 4).forEach(function (l) { ecrire(l[0], L, y, 30, 500, "#B4BBCB"); ecrire(l[1], W - L, y, 30, 700, "#F2F4F8", "right"); y += 56; });
    ecrire("Orbite · simulation indicative, non contractuelle", W / 2, H - 50, 24, 600, "rgba(242,244,248,0.7)", "center");
  }
  function arrondi(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function ouvrirRecu() {
    var cv = $("ep-recu-canvas"), dlg = $("ep-recu");
    var pret = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    pret.then(function () {
      dessinerRecu(cv);
      try { $("ep-recu-partager").hidden = !(navigator.canShare && window.File && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch (e) { $("ep-recu-partager").hidden = true; }
      if (!dlg.open) dlg.showModal();
    });
  }
  function blobRecu(fn) { $("ep-recu-canvas").toBlob(function (b) { if (b) fn(b); }, "image/png"); }

  /* ===================================================================
     Contrat avec l'application
     =================================================================== */
  function encoderEtat() {
    var e = effectif();
    var s = PA.encoder(e) + "&Xp=" + ui.mode + "&Xc=" + (ui.inclure ? 1 : 0) + (ui.supportPerso ? "&Xs=1" : "");
    return s.replace(/[!'()*~]/g, function (ch) { return "%" + ch.charCodeAt(0).toString(16).toUpperCase(); });
  }
  function nomProduits() {
    var e = effectif(), p = PERIODE_NOM[e.frequence], parts = [];
    if (ui.mode !== "cea") parts.push((ui.mode === "ac" ? "Vie " : "Assurance vie ") + F.dt0(e.versement));
    if (ui.mode !== "av") parts.push("CEA " + F.dt0(e.versementCea));
    return parts.join(" + ") + " DT/" + p;
  }

  window.ModuleEpargne = {
    outil: "assurance_vie",
    etat: function () { return encoderEtat(); },
    resume: function () {
      if (!res) calculer(false);
      var c = res, s = c.sim, e = c.etat, sec = [];
      if (ui.mode !== "cea") sec.push({ libelle: "Assurance vie / mois", valeur: arr3(e.versement * c.facteur / 12), unite: "DT" });
      if (ui.mode !== "av") sec.push({ libelle: "CEA / mois", valeur: arr3(e.versementCea * c.facteur / 12), unite: "DT" });
      sec.push({ libelle: "Capital au terme (médian)", valeur: c.actif ? Math.round(c.med.capitalFinal) : 0, unite: "DT" });
      sec.push({ libelle: "Effort réel / mois", valeur: arr3(Math.max(0, c.investissement - s.economie) / 12), unite: "DT" });
      if (sec.length < 4) sec.push({ libelle: "Durée", valeur: e.dureeAns, unite: "ans" });
      var ligne = nomProduits() + " · " + pluriel(e.dureeAns, "an") + " · impôt " + F.dt0(s.impotAvant) + " → " + F.dt0(s.impotApres) + " DT" + (s.exAv + s.exCea > 0 ? " · contrats actuels inclus" : "");
      return { principal: { libelle: "Économie d'impôt / an", valeur: arr3(s.economie), unite: "DT" }, secondaires: sec.slice(0, 4), ligne: ligne.slice(0, 140) };
    },
    nomParDefaut: function () { return (nomProduits() + " · " + pluriel(etat.dureeAns, "an")).slice(0, 120); },
    charger: function (texte) {
      var brut = String(texte || "").replace(/^[#?]/, "");
      var d = PA.decoder(brut);
      if (!Object.keys(d).length) return false;
      var extra = {};
      brut.split("&").forEach(function (p) { var i = p.indexOf("="); if (i > 0 && /^X[a-z]$/.test(p.slice(0, i))) extra[p.slice(0, i)] = p.slice(i + 1); });
      etat = Object.assign(SC.defauts(), d);
      ui.mode = { av: "av", cea: "cea", ac: "ac" }[extra.Xp] || (etat.versement > 0 && etat.versementCea > 0 ? "ac" : etat.versementCea > 0 && !(etat.versement > 0) ? "cea" : "av");
      ui.inclure = extra.Xc !== "0";
      ui.supportPerso = extra.Xs === "1";
      ui.premier = false;
      appliquerRetraite();
      rendreContrats();
      remplirChamps();
      O.placerPastilles(R);
      calculer(true);
      return true;
    },
    depuisProfil: function (profil) {
      var p = OC.normaliser(profil || {});
      var sal = null;
      try { sal = OC.salaire(p); } catch (e) { sal = null; }
      if (sal) etat.revenu = arr3(sal.revenuFiscal);
      etat.chef = !!p.chefDeFamille; etat.enfants = p.enfants; etat.etudiants = p.etudiants; etat.infirmes = p.handicapes; etat.parents = p.parents;
      etat.ageActuel = borne(OC.age(p), 18, 80);
      lireContrats(p);
      if (ui.premier) {
        ui.premier = false;
        try {
          var sy = OC.synthese(p), eq = sy.epargne.propositions.filter(function (x) { return x.cle === "equilibree"; })[0];
          if (eq) { etat.versement = arr3(eq.versementMensuel * 12 / FACT[etat.frequence]); if (ui.mode === "cea") ui.mode = "av"; }
        } catch (e) { /* profil incomplet : on garde les valeurs actuelles */ }
      }
      appliquerRetraite();
      rendreContrats();
      remplirChamps();
      O.placerPastilles(R);
      calculer(false);
    },
    afficher: function () {
      O.placerPastilles(R);
      R.querySelectorAll(".curseur").forEach(majCurseur);
      if (res) { rendreCourbe(); if (res.actif) dessinerProjection(false); if (ouvert("mc")) afficherMc(); }
    }
  };

  /* Contrats du profil : suivis en direct */
  O.surProfil(function (sy, profil) {
    var avant = JSON.stringify(ui.existant);
    lireContrats(profil);
    if (JSON.stringify(ui.existant) === avant) return;
    rendreContrats();
    if (res) planifier(false);
  });

  /* Paramètre de route : #epargne?versement=250 (DT par mois en assurance vie) */
  doc.addEventListener("orbite:vue", function (ev) {
    var d = ev.detail || {};
    if (d.vue !== "epargne" || !d.params) return;
    var v = d.params.get("versement");
    if (v == null) return;
    var r = F.lire(v);
    if (!r.valide || r.vide) return;
    if (ui.mode === "cea") ui.mode = "av";
    etat.versement = arr3(r.valeur * 12 / FACT[etat.frequence]);
    remplirChamps();
    O.placerPastilles(R);
    calculer(true);
    signaler();
  });

  /* Redimensionnement : graphiques recalculés à la largeur réelle */
  var minuterieTaille = null, largeurAvant = 0;
  window.addEventListener("resize", function () {
    clearTimeout(minuterieTaille);
    minuterieTaille = setTimeout(function () {
      if (!res || $("vue-epargne").hidden) return;
      var l = R.clientWidth;
      if (l === largeurAvant) return;
      largeurAvant = l;
      window.ModuleEpargne.afficher();
    }, 180);
  });
  doc.addEventListener("orbite:theme", function () { if (res && !$("vue-epargne").hidden) window.ModuleEpargne.afficher(); });

  /* Premier rendu (valeurs par défaut, remplacées par le profil dès qu'il est lu) */
  rendreContrats();
  remplirChamps();
  calculer(false);
})();
