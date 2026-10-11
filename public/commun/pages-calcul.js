/*
 * Orbite — pages publiques (salaire net, capacité de crédit, impôt, retraite) : chiffres des mini-calculs (module pur, testé).
 * Tout passe par les moteurs d'Orbite (OrbiteCalcul, OrbiteIntelligence, Retraite) : rien n'est écrit en dur. Les exemples
 * sont définis par rapport à la date du jour (âge, carrière) pour ne pas vieillir. Calcul sur l'appareil, rien n'est envoyé.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("../espace/js/orbite-calcul.js"), require("../espace/js/orbite-intelligence.js"),
      require("../espace/js/retraite-calcul.js"), require("../moteurs/salaire/parametres.js"));
  } else racine.PagesCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.Retraite, racine.PARAMETRES_PAIE);
})(typeof self !== "undefined" ? self : this, function (OC, OI, RT, P) {
  "use strict";
  var MAX = 1e6;
  var TYPES = { immo: "Logement", immo25: "Logement sur 25 ans", auto: "Voiture", conso: "Consommation" };
  /* Exemples par défaut (mêmes valeurs que le HTML statique lu par les moteurs de recherche). */
  var DEFAUT = { brut: 2500, net: 1849.31, secteur: "prive", chef: false, enfants: 0, encours: 0, ageExemple: 36, carriereExemple: 12 };
  var TABLE_BRUTS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];

  function borne(v, def, min, max) { var n = Number(v); return isFinite(n) && v !== "" && v !== null ? Math.min(max, Math.max(min, n)) : def; }
  function iso(a, mo) { return a + "-" + String(mo).padStart(2, "0") + "-01"; }
  /* Âge et carrière d'exemple, par rapport à l'année en cours (le pont de la page salaire n'a pas de date de naissance). */
  function datesExemple(m) { var A = m.getFullYear(); return { dateNaissance: iso(A - DEFAUT.ageExemple, 3), debutCarriere: iso(A - DEFAUT.carriereExemple, 9) }; }

  function profil(e, m) {
    var x = e || {}, d = datesExemple(m);
    var p = {
      montant: borne(x.montant, DEFAUT.brut, 1, MAX), sens: x.sens === "net" ? "net" : "brut", periode: "mensuel",
      secteur: x.secteur === "public" ? "public" : "prive", chefDeFamille: !!x.chef, situation: x.chef ? "marie" : "celibataire",
      enfants: Math.round(borne(x.enfants, 0, 0, 4)),
      dateNaissance: x.dateNaissance || d.dateNaissance, debutCarriere: x.debutCarriere || d.debutCarriere, credits: []
    };
    var encours = borne(x.encours, 0, 0, MAX);
    if (encours > 0) p.credits.push({ type: "conso", libelle: "Crédits en cours", mensualite: encours });
    return OC.normaliser(Object.assign(OC.profilParDefaut(), p));
  }
  function synthese(e, m) { var p = profil(e, m); return { p: p, sy: OC.synthese(p, {}, m) }; }
  function fiscal(sy, m) { try { return OI.optimiseurFiscal(sy, { maintenant: m }); } catch (er) { return null; } }

  /* Salaire : brut → net (ou net → brut) et décomposition. */
  function salaire(e, m0) {
    var m = m0 || new Date(), r = synthese(e, m), s = r.sy.salaire, cot = s.cotisations / 12, irpp = s.irpp / 12, css = s.css / 12;
    var brut = s.brutMensuel;
    var regime = P.regimes[r.p.secteur], taux = (regime.salarie || []).reduce(function (t, l) { return t + l.taux; }, 0);
    return { brut: brut, net: s.netMensuel, cotisations: cot, irpp: irpp, css: css, tranche: s.tranche ? s.tranche.taux : 0, caisse: regime.caisse, tauxCotisation: taux,
      parts: { net: s.netMensuel / brut, cotisations: cot / brut, irpp: irpp / brut, css: css / brut } };
  }

  /* Capacité de crédit : mensualité maximale (40 % du net, crédits en cours déduits) et capital par type. */
  function credit(e, m0) {
    var m = m0 || new Date(), x = Object.assign({}, e, { sens: "net", montant: e && e.net != null ? e.net : DEFAUT.net });
    var r = synthese(x, m), cap = r.sy.capacite.net, net = r.sy.salaire.netMensuel;
    var types = (cap.credits || []).filter(function (c) { return c.cle !== "immo25"; }).map(function (c) {
      return { cle: c.cle, libelle: TYPES[c.cle] || c.cle, capital: Math.max(0, c.capital || 0), dureeMois: c.dureeMois, taux: c.tauxPct };
    });
    return { net: net, quotite: r.p.quotiteNet, encours: borne(x.encours, 0, 0, MAX), mensualiteMax: Math.max(0, cap.mensualiteMax || 0),
      endettement: net > 0 ? r.sy.budget.tauxEndettement : 0, types: types };
  }

  /* Impôt : versements assurance vie et CEA qui font baisser l'impôt de l'année. */
  function impot(e, m0) {
    var m = m0 || new Date(), r = synthese(e, m), fi = fiscal(r.sy, m);
    var fin = new Date(m.getFullYear(), 11, 31), jours = Math.max(0, Math.ceil((fin - new Date(m.getFullYear(), m.getMonth(), m.getDate())) / 864e5));
    if (!fi) return { annee: m.getFullYear(), impot: (r.sy.salaire.irpp || 0), gain: 0, av: 0, cea: 0, total: 0, jours: jours };
    var c = fi.complement || { av: 0, cea: 0, total: 0 };
    return { annee: fi.annee, impot: fi.impotAvant, impotMinimum: fi.impotMinimum, gain: fi.gainPossible || 0, av: c.av || 0, cea: c.cea || 0, total: c.total || 0,
      dureeAv: fi.dureeAv, dureeCea: fi.dureeCea, jours: jours, statut: fi.statut };
  }

  /* Retraite : âge légal, taux et pension nette estimée, en dinars d'aujourd'hui. */
  function retraite(e, m0) {
    var m = m0 || new Date(), x = Object.assign({}, e), A = m.getFullYear();
    var naissance = Math.round(borne(x.anneeNaissance, A - DEFAUT.ageExemple, A - 70, A - 16));
    var debut = Math.round(borne(x.anneeDebut, A - DEFAUT.carriereExemple, naissance + 14, A));
    x.dateNaissance = iso(naissance, 7); x.debutCarriere = iso(debut, 7);
    var r = synthese(x, m), est = RT.estimer(r.p, r.sy, { maintenant: m });
    var out = { caisse: est.caisse === "cnrps" ? "CNRPS" : "CNSS", etat: est.etat, raisons: est.raisons || [], anneeNaissance: naissance, anneeDebut: debut, netActuel: r.sy.salaire.netMensuel };
    if (est.etat !== "ok") return out;
    out.age = est.age; out.annee = est.depart.getFullYear(); out.taux = est.taux; out.brut = est.brut; out.net = est.net; out.remplacement = est.remplacement;
    if (est.caisse === "cnrps" && est.bornes && est.bornes.max > est.age) {
      var e2 = RT.estimer(r.p, r.sy, { maintenant: m, age: est.bornes.max });
      if (e2.etat === "ok") out.tard = { age: e2.age, taux: e2.taux, net: e2.net };
    }
    return out;
  }

  /* Pont vers Orbite (page salaire) : ce que le même salaire donne en crédit, impôt et retraite. */
  function pont(e, m0) {
    var m = m0 || new Date(), s = salaire(e, m);
    var cr = credit({ net: s.net }, m), im = impot(e, m);
    var re = retraite({ montant: s.brut, secteur: e && e.secteur, chef: e && e.chef, enfants: e && e.enfants }, m);
    var logement = cr.types.filter(function (t) { return t.cle === "immo"; })[0] || null;
    return { net: s.net, brut: s.brut, quotite: cr.quotite, logement: logement, mensualiteMax: cr.mensualiteMax, gainImpot: im.gain, annee: im.annee, retraite: re.etat === "ok" ? re : null };
  }

  /* ---------- Affichage : mêmes textes pour le HTML généré (moteurs de recherche, sans JavaScript) et dans le navigateur ---------- */
  function nombre(v, dec) {
    var s = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
    return s.replace(/[  ]/g, " ");
  }
  function dt(v, dec) { return nombre(v, dec == null ? 3 : dec) + " DT"; }
  function pct(v, dec) { return nombre(v * 100, dec || 0) + " %"; }
  /* Grand chiffre : partie entière et « ,310 DT » séparés (le second est plus petit). */
  function grand(o, cle, v) { var t = nombre(v, 3), i = t.lastIndexOf(","); o[cle + "_ent"] = t.slice(0, i); o[cle + "_dec"] = t.slice(i) + " DT"; }
  function ans(mois) { return nombre(mois / 12, 0) + " ans"; }

  /* Satellites du pont : les trois sujets autres que celui de la page. */
  function satellites(page, e, m) {
    var p = pont(e, m), o = {};
    o.pont_net = dt(p.net, 0);
    o.sat_salaire = dt(p.net); o.sat_salaire_txt = "net par mois, après cotisations, impôt sur le revenu et contribution de solidarité";
    o.sat_credit = p.logement ? dt(p.logement.capital, 0) : dt(0, 0);
    o.sat_credit_txt = p.logement && p.mensualiteMax > 0 ? "empruntables sur " + ans(p.logement.dureeMois) + " pour un logement (mensualité de " + dt(p.mensualiteMax) + ", " + pct(p.quotite) + " du net)" : "de capacité : vos mensualités atteignent déjà la limite de " + pct(p.quotite) + " du net";
    o.sat_impot = dt(p.gainImpot, 0);
    o.sat_impot_txt = p.gainImpot > 0 ? "d'impôt évitables en " + p.annee + " avec l'assurance vie et le CEA, avant le 31 décembre" : "d'impôt à économiser : ce salaire est sous le seuil d'imposition";
    o.sat_retraite = p.retraite ? p.retraite.age + " ans · " + nombre(p.retraite.taux, 0) + " %" : "—";
    o.sat_retraite_txt = p.retraite ? "pension " + p.retraite.caisse + " estimée à " + dt(p.retraite.net) + " net par mois en " + p.retraite.annee + " (exemple : " + DEFAUT.ageExemple + " ans, " + DEFAUT.carriereExemple + " ans de carrière)" : "estimation impossible avec ces valeurs";
    return o;
  }

  function affichage(page, e, m0) {
    var m = m0 || new Date(), o = {}, x = e || {};
    if (page === "salaire") {
      var s = salaire(x, m);
      grand(o, "net", s.net);
      o.cot = dt(s.cotisations); o.irpp = dt(s.irpp); o.css = dt(s.css);
      o.cot_lib = "Cotisations " + s.caisse + " (" + pct(s.tauxCotisation, 2) + ")";
      o.irpp_lib = "Impôt sur le revenu · tranche " + pct(s.tranche);
      o.brut_lib = x.sens === "net" ? "Brut correspondant : " + dt(s.brut) : "";
      o.parts = { net: s.parts.net, cot: s.parts.cotisations, irpp: s.parts.irpp, css: s.parts.css };
      Object.assign(o, satellites(page, x, m));
    } else if (page === "credit") {
      var c = credit(x, m);
      grand(o, "mens", c.mensualiteMax);
      o.mens_pct = c.net > 0 ? "soit " + pct(c.mensualiteMax / c.net) + " de votre net, crédits en cours déduits" : "";
      o.jauge = c.net > 0 ? Math.min(1, c.mensualiteMax / c.net) : 0;
      c.types.forEach(function (t) { o["cap_" + t.cle] = dt(t.capital, 0); o["dur_" + t.cle] = ans(t.dureeMois) + " · " + nombre(t.taux, t.taux % 1 ? 1 : 0) + " %"; });
      o.etat = c.mensualiteMax > 0 ? "ok" : "sature";
      Object.assign(o, satellites(page, { montant: c.net, sens: "net" }, m));
    } else if (page === "impot") {
      var i = impot(x, m);
      grand(o, "gain", i.gain);
      o.impot_an = dt(i.impot); o.av = dt(i.av, 0); o.cea = dt(i.cea, 0);
      o.impot_an_lib = "sur l'année " + i.annee;
      o.jours = i.gain > 0 ? "Il reste " + i.jours + (i.jours > 1 ? " jours" : " jour") + " pour verser en " + i.annee + " (jusqu'au 31 décembre)." : "";
      o.etat = i.gain > 0 ? "ok" : "sans_impot";
      Object.assign(o, satellites(page, x, m));
    } else if (page === "retraite") {
      var r = retraite(x, m);
      o.etat = r.etat === "ok" ? "ok" : "erreur";
      o.raison = r.etat === "ok" ? "" : (r.raisons[0] || (r.etat === "depasse" ? "L'âge de départ est déjà atteint : la pension se calcule avec votre caisse." : "Vérifiez l'année de naissance et l'année de début de carrière."));
      grand(o, "pens", r.etat === "ok" ? r.net : 0);
      o.depart = r.etat === "ok" ? r.annee + " · " + r.age + " ans" : "—";
      o.depart_lib = "âge légal " + r.caisse;
      o.taux = r.etat === "ok" ? nombre(r.taux, r.taux % 1 ? 1 : 0) + " %" : "—";
      o.taux_lib = r.caisse === "CNSS" ? "80 % au plus à la CNSS" : "90 % au plus à la CNRPS";
      o.jauge = r.etat === "ok" ? r.taux / 100 : 0;
      o.tard = r.tard ? nombre(r.tard.taux, r.tard.taux % 1 ? 1 : 0) + " % · " + dt(r.tard.net) : "";
      o.tard_lib = r.tard ? "En partant à " + r.tard.age + " ans" : "";
      Object.assign(o, satellites(page, { montant: x.montant, secteur: x.secteur, chef: x.chef }, m));
    }
    return o;
  }

  /* Tableau des bruts les plus recherchés (célibataire, privé, 12 salaires). */
  function tableauNet(m0) {
    var m = m0 || new Date();
    return TABLE_BRUTS.map(function (b) { var s = salaire({ montant: b }, m); return { brut: b, impot: s.irpp, net: s.net }; });
  }
  /* Barème annuel de l'IRPP : tranches [de, à, taux]. */
  function bareme() {
    var t = P.irpp.bareme;
    return t.map(function (x, i) { return { de: x.de, a: i + 1 < t.length ? t[i + 1].de : null, taux: x.taux }; });
  }

  return { DEFAUT: DEFAUT, TABLE_BRUTS: TABLE_BRUTS, profil: profil, salaire: salaire, credit: credit, impot: impot, retraite: retraite, pont: pont, tableauNet: tableauNet, bareme: bareme,
    affichage: affichage, nombre: nombre, dt: dt, pct: pct, annee: P.annee };
});
