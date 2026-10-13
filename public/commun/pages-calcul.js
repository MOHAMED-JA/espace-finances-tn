/*
 * Orbite — pages publiques (salaire net, capacité de crédit, impôt, retraite, simulateur de crédit, assurance vie, CEA,
 * règle des 8 %, remboursement anticipé, regroupement de crédits, coût employeur) : chiffres des mini-calculs (module pur, testé).
 * Tout passe par les moteurs d'Orbite (OrbiteCalcul, OrbiteIntelligence, Retraite) : rien n'est écrit en dur. Les exemples
 * sont définis par rapport à la date du jour (âge, carrière) pour ne pas vieillir. Calcul sur l'appareil, rien n'est envoyé.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("../espace/js/orbite-calcul.js"), require("../espace/js/orbite-intelligence.js"),
      require("../espace/js/retraite-calcul.js"), require("../moteurs/salaire/parametres.js"),
      require("../moteurs/vie/moteur-fiscal.js"), require("../moteurs/vie/projection.js"),
      require("../moteurs/salaire/calcul.js"), require("../moteurs/credit/projets.js"));
  } else racine.PagesCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.Retraite, racine.PARAMETRES_PAIE, racine.MoteurFiscal, racine.Projection,
    racine.CalculSalaire, racine.CreditProjets);
})(typeof self !== "undefined" ? self : this, function (OC, OI, RT, P, MF, PR, CS, CPJ) {
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

  /* Simulateur de crédit : mensualité à taux fixe (TMM + marge de la banque), intérêts et coût total.
     Exemples par type ; durée bornée (immobilier 25 ans, autres crédits 7 ans). */
  var CREDIT_DEF = {
    immo: { libelle: "Logement", montant: 120000, ans: 20, marge: 2.5, max: 25 },
    auto: { libelle: "Voiture", montant: 40000, ans: 7, marge: 3, max: 7 },
    conso: { libelle: "Consommation", montant: 15000, ans: 5, marge: 3.5, max: 7 }
  };
  function simulCredit(e) {
    var x = e || {}, t = CREDIT_DEF[x.type] ? x.type : "auto", d = CREDIT_DEF[t];
    var montant = borne(x.montant, d.montant, 0, 1e7), ans = Math.round(borne(x.dureeAns, d.ans, 1, d.max)), marge = borne(x.marge, d.marge, 0, 15);
    var taux = OC.TMM + marge, n = ans * 12, mens = OC.mensualitePourCapital(montant, taux, n), total = mens * n;
    return { type: t, libelle: d.libelle, montant: montant, dureeAns: ans, dureeMois: n, dureeMax: d.max, marge: marge, tmm: OC.TMM, taux: taux,
      mensualite: mens, interets: Math.max(0, total - montant), total: total };
  }

  /* Revenu fiscal de l'exemple (même entrée que l'optimiseur fiscal d'Orbite). */
  function entreeFiscale(e, m) {
    var r = synthese(e, m), s = r.sy.salaire;
    return { revenu: s.revenuFiscal, chef: r.p.chefDeFamille, enfants: r.p.enfants, abattementTaux: s.abattementTaux, leger: true };
  }
  function regleProduit(cle) { return MF.regles().produits[cle]; }

  /* Assurance vie : capital estimé (versements mensuels, rendement annuel net de frais) et impôt économisé chaque année. */
  function assuranceVie(e, m0) {
    var m = m0 || new Date(), x = e || {};
    var versement = borne(x.versement, 200, 0, 1e5), ans = Math.round(borne(x.dureeAns, 10, 1, 40)), rendement = borne(x.rendement, 6, 0, 15);
    var sim = MF.simuler(Object.assign(entreeFiscale(x, m), { investissementAv: versement * 12 }));
    var pr = PR.projeter({ versement: versement, periodesParAn: 12, dureeAns: ans, rendementPct: rendement, fraisPct: 0 }), fin = pr.annees[ans];
    var av = regleProduit("av");
    return { versement: versement, dureeAns: ans, rendement: rendement, capital: fin.capital, verse: fin.verse, interets: Math.max(0, fin.capital - fin.verse),
      economie: sim.economie, impot: sim.impotAvant, impotMinimumTaux: av.impotMinimumTaux, plafond: av.plafond, dureeMinimale: av.dureeMinimaleAns };
  }

  /* CEA : impôt économisé pour un dépôt de l'année, dépôt utile au maximum (au-delà, l'impôt ne baisse plus), date de déblocage. */
  function cea(e, m0) {
    var m = m0 || new Date(), x = e || {}, depot = borne(x.depot, 3000, 0, 1e6), c = regleProduit("cea");
    var base = entreeFiscale(x, m), sim = MF.simuler(Object.assign({}, base, { investissementCea: depot, leger: false }));
    return { depot: depot, economie: sim.economie, impot: sim.impotAvant, impotMinimum: sim.impotMinimumCea, impotMinimumTaux: c.impotMinimumTaux,
      utile: Math.max(0, sim.ceaUtile || 0), plafond: c.plafond, blocage: c.dureeBlocageAns, disponible: m.getFullYear() + 1 + c.dureeBlocageAns };
  }


  /* Règle des 8 % (loi n° 2024-41) : moteur d'Orbite (OrbiteCalcul.reductionsTaux), crédit à taux fixe.
     Exemple : 150 000 DT à 9 % sur 20 ans, première échéance en janvier 2024. */
  var R8_DEF = { mensualite: 1349.589, taux: 9, duree: 240, mois: 1, annee: 2024 };
  function regle8(e, m0) {
    var m = m0 || new Date(), x = e || {};
    var c = { mensualite: borne(x.mensualite, R8_DEF.mensualite, 0, 1e6), tauxPct: borne(x.taux, R8_DEF.taux, 0, 40), dureeMois: Math.round(borne(x.duree, R8_DEF.duree, 1, 480)),
      moisDebut: Math.round(borne(x.mois, R8_DEF.mois, 1, 12)), anneeDebut: Math.round(borne(x.annee, R8_DEF.annee, 1980, 2100)), tauxType: "fixe" };
    var r = OC.reductionsTaux(c, m);
    return { credit: c, applicable: r.applicable, motif: r.motif, reductions: r.reductions || [], possibleDepuis: r.possibleDepuis };
  }

  /* Remboursement anticipé partiel : intérêts évités selon le choix (durée plus courte ou mensualité plus basse),
     hors indemnité de la banque. Exemple : 100 000 DT à 10 % sur 20 ans, 20 000 DT versés après 60 mensualités. */
  var RA_DEF = { montant: 100000, taux: 10, duree: 240, payees: 60, somme: 20000 };
  function anticipe(e) {
    var x = e || {}, K = borne(x.montant, RA_DEF.montant, 0, 1e8), t = borne(x.taux, RA_DEF.taux, 0, 40), n = Math.round(borne(x.duree, RA_DEF.duree, 1, 480));
    var p = Math.round(borne(x.payees, RA_DEF.payees, 0, n)), S = borne(x.somme, RA_DEF.somme, 0, 1e8), r = t / 1200;
    var M = OC.mensualitePourCapital(K, t, n), reste = n - p;
    var crd = reste <= 0 ? 0 : Math.max(0, r > 0 ? K * Math.pow(1 + r, p) - M * (Math.pow(1 + r, p) - 1) / r : K - M * p);
    var interetsAvant = Math.max(0, M * reste - crd), verse = Math.min(S, crd), crd2 = Math.max(0, crd - verse);
    /* Durée plus courte : même mensualité, la dernière plus petite. */
    var mois = 0, k = crd2, paye = 0;
    while (k > 0.0005 && mois < reste) { var i = k * r, du = Math.min(M, k + i); paye += du; k = k + i - du; mois++; }
    var M2 = reste > 0 && crd2 > 0.0005 ? OC.mensualitePourCapital(crd2, t, reste) : 0;
    return { montant: K, taux: t, duree: n, payees: p, somme: S, verse: verse, mensualite: M, restantDu: crd, moisRestants: reste, interetsAvant: interetsAvant,
      solde: reste > 0 && crd2 <= 0.0005,
      courte: { mois: mois, gagnes: reste - mois, economie: Math.max(0, interetsAvant - Math.max(0, paye - crd2)) },
      basse: { mensualite: M2, baisse: M - M2, economie: Math.max(0, interetsAvant - Math.max(0, M2 * reste - crd2)) } };
  }

  /* Regroupement de crédits : moteur d'Orbite (CreditProjets.regrouper), indemnités et frais de dossier compris.
     Exemple : voiture 320 DT/mois à 10 % (30 mois restants) + consommation 210 DT/mois à 11 % (17 mois), regroupés à 10,5 % sur 36 mois. */
  var RG_DEF = { credits: [{ mensualite: 320, taux: 10, mois: 30 }, { mensualite: 210, taux: 11, mois: 17 }, { mensualite: 0, taux: 0, mois: 0 }], taux: 10.5, duree: 36, ira: CPJ ? CPJ.IRA_PCT : 1.5, frais: 150 };
  function regroupement(e) {
    var x = e || {}, cr = x.credits || RG_DEF.credits;
    var credits = cr.slice(0, 3).map(function (c, i) {
      return { libelle: "Crédit " + (i + 1), mensualite: borne(c.mensualite, 0, 0, 1e6), tauxPct: borne(c.taux, 0, 0, 40), moisRestants: Math.round(borne(c.mois, 0, 0, 480)), inclus: c.inclus !== false };
    });
    /* Sans le moteur (ancienne copie en cache) : pas de résultat plutôt qu'une page cassée. */
    var r = !CPJ ? null : CPJ.regrouper({ credits: credits, tauxPct: borne(x.taux, RG_DEF.taux, 0, 40), mois: Math.round(borne(x.duree, RG_DEF.duree, 1, 300)),
      iraPct: borne(x.ira, RG_DEF.ira, 0, 10), fraisDossier: borne(x.frais, RG_DEF.frais, 0, 1e5) });
    return { credits: credits.map(function (c) { return Object.assign({}, c, { restantDu: CPJ && c.inclus && c.mensualite > 0 && c.moisRestants > 0 ? CPJ.restantDu(c) : 0 }); }), resultat: r };
  }

  /* Coût employeur : brut → net, charges patronales et partage de chaque dinar (salarié, caisse, État), moteur de paie. */
  function employeur(e, m0) {
    var m = m0 || new Date(), r = synthese({ montant: e && e.montant != null ? e.montant : 2000, secteur: e && e.secteur }, m), s = r.sy.salaire, a = s.resultat.annuel;
    var rep = CS.repartitionCoutEmployeur(s.resultat), regime = P.regimes[r.p.secteur];
    return { brut: s.brutMensuel, net: s.netMensuel, cout: rep.total / 12, charges: a.chargesPatronales / 12, coutAn: rep.total, caisse: regime.caisse,
      tauxCharges: s.brutMensuel > 0 ? a.chargesPatronales / 12 / s.brutMensuel : 0,
      lignes: a.chargesPatronalesLignes.map(function (l) { return { code: l.code, libelle: l.libelle, taux: l.taux, montant: l.montant / 12 }; }),
      parts: { salarie: rep.salarie.part, caisse: rep.caisse.part, etat: rep.etat.part } };
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
  /* « 5 ans et 8 mois », « 8 mois », « 2 ans ». */
  function dureeTxt(mois) {
    var a = Math.floor(mois / 12), r = mois % 12, ta = a ? a + (a > 1 ? " ans" : " an") : "", tm = r ? r + " mois" : "";
    return ta && tm ? ta + " et " + tm : ta || tm || "0 mois";
  }
  /* Taux : « 9 % », « 4,5 % », « 1,125 % ». */
  function taux(v) { var c = Math.round(v * 1000), d = c % 1000 === 0 ? 0 : c % 100 === 0 ? 1 : c % 10 === 0 ? 2 : 3; return nombre(v, d) + " %"; }

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
    } else if (page === "pret") {
      var k = simulCredit(x);
      grand(o, "mens", k.mensualite);
      var c100 = Math.round(k.taux * 100);
      o.taux = nombre(k.taux, c100 % 100 === 0 ? 0 : c100 % 10 === 0 ? 1 : 2) + " %";
      o.taux_lib = "TMM " + nombre(k.tmm, 1) + " % + " + nombre(k.marge, k.marge % 1 ? 1 : 0) + (k.marge > 1 ? " points" : " point");
      o.capital = dt(k.montant, 0); o.interets = dt(k.interets, 0); o.total = dt(k.total, 0);
      o.duree_lib = k.dureeAns + (k.dureeAns > 1 ? " ans" : " an") + " · " + k.dureeMois + " mensualités";
      o.parts = { capital: k.total > 0 ? k.montant / k.total : 0, interets: k.total > 0 ? k.interets / k.total : 0 };
      o.etat = k.montant > 0 ? "ok" : "vide";
    } else if (page === "vie") {
      var a = assuranceVie(x, m);
      o.cap_ent = nombre(a.capital, 0); o.cap_dec = " DT";
      o.cap_lib = "Capital estimé dans " + a.dureeAns + (a.dureeAns > 1 ? " ans" : " an");
      o.verse = dt(a.verse, 0); o.interets = dt(a.interets, 0); o.eco = dt(a.economie, 0);
      o.eco_lib = a.economie > 0 ? "chaque année, tant que le salaire ne change pas" : "ce salaire n'est pas imposé : rien à économiser";
      o.parts = { verse: a.capital > 0 ? Math.min(1, a.verse / a.capital) : 0, interets: a.capital > 0 ? a.interets / a.capital : 0 };
      o.etat = a.versement > 0 ? "ok" : "vide";
    } else if (page === "cea") {
      var c2 = cea(x, m);
      o.eco_ent = nombre(c2.economie, 0); o.eco_dec = " DT";
      o.utile = dt(c2.utile, 0); o.impot_min = dt(c2.impotMinimum, 0);
      o.impot_min_lib = "Impôt qui reste au minimum (" + pct(c2.impotMinimumTaux) + ")";
      o.dispo = "1er janvier " + c2.disponible;
      o.jauge = c2.utile > 0 ? Math.min(1, c2.depot / c2.utile) : 0;
      o.etat = c2.impot <= 0 ? "sans_impot" : c2.depot > c2.utile + 0.5 ? "au_dela" : "ok";
      o.au_dela = c2.depot > c2.utile + 0.5 ? "Au-delà de " + dt(c2.utile, 0) + ", un dépôt de plus ne fait plus baisser l'impôt de cette année." : "";
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
    } else if (page === "regle8") {
      var g = regle8(x, m), r1 = g.reductions[0];
      o.etat = r1 ? "ok" : "non";
      var quand = g.possibleDepuis ? g.possibleDepuis.date : r1 ? r1.date : "", sp = quand.lastIndexOf(" ");
      o.quand_lib = g.possibleDepuis ? "Réduction possible depuis" : "Réduction possible dès";
      o.quand_ent = r1 ? quand.slice(0, sp) : "—"; o.quand_dec = r1 ? quand.slice(sp) : "";
      o.avant_taux = r1 ? taux(r1.tauxAvant) : "—"; o.avant_mens = r1 ? dt(r1.mensualiteAvant) + "/mois" : "";
      o.apres_lib = r1 ? (g.possibleDepuis ? "Dès votre demande" : "Dès " + r1.date) : "";
      o.apres_taux = r1 ? taux(r1.tauxPct) : "—"; o.apres_mens = r1 ? dt(r1.mensualite) + "/mois" : "";
      o.gain = r1 ? "−" + dt(r1.mensualiteAvant - r1.mensualite) + " par mois" : "";
      o.gain_txt = r1 ? (g.possibleDepuis ? ", à demander à votre banque par écrit dès maintenant." : ", à demander à votre banque par écrit.") : "";
      for (var j = 0; j < 3; j++) {
        var rj = g.reductions[j];
        o["r" + (j + 1)] = rj ? rj.date.charAt(0).toUpperCase() + rj.date.slice(1) : "";
        o["r" + (j + 1) + "_txt"] = rj ? (j ? "Encore divisé par deux : " : "Le taux passe de " + taux(rj.tauxAvant) + " à ") + taux(rj.tauxPct) : "";
        o["r" + (j + 1) + "_mens"] = rj ? dt(rj.mensualite) : "";
      }
      o.raison = r1 ? "" : g.motif === "duree" ? "La règle des 8 % concerne les crédits à taux fixe de plus de 7 ans (84 mensualités)." :
        g.motif === "fini" ? "D'après ces dates, ce crédit est déjà entièrement remboursé." : g.motif === "donnees" ? "Indiquez la mensualité et le taux du crédit." :
        "Avec ces valeurs, les intérêts restent sous le seuil de 8 % jusqu'à la fin du crédit : pas de réduction de taux.";
    } else if (page === "anticipe") {
      var ra = anticipe(x), mx = Math.max(ra.courte.economie, ra.basse.economie);
      o.etat = ra.moisRestants <= 0 || ra.verse <= 0 ? "non" : ra.solde ? "solde" : "ok";
      o.eco_ent = nombre(mx, 0); o.eco_dec = " DT";
      o.mens_lib = "Mensualité : " + dt(ra.mensualite); o.crd_lib = "Reste dû : " + dt(ra.restantDu);
      o.courte = "−" + ra.courte.gagnes + " mois"; o.courte_txt = "Même mensualité, fin " + dureeTxt(ra.courte.gagnes) + " plus tôt."; o.courte_eco = "≈ " + dt(ra.courte.economie, 0);
      o.basse = dt(ra.basse.mensualite); o.basse_txt = "−" + dt(ra.basse.baisse) + " par mois, même date de fin."; o.basse_eco = "≈ " + dt(ra.basse.economie, 0);
      o.solde_txt = ra.solde ? "Cette somme couvre tout le reste dû (" + dt(ra.restantDu) + ") : le crédit est soldé." : "";
      o.raison = ra.moisRestants <= 0 ? "D'après ces valeurs, le crédit est déjà remboursé." : ra.verse <= 0 ? "Indiquez la somme que vous voulez verser en plus." : "";
    } else if (page === "regroupement") {
      var rg = regroupement(x), rr = rg.resultat;
      rg.credits.forEach(function (c, n) { o["crd" + (n + 1)] = c.restantDu > 0 ? dt(c.restantDu, 0) : "—"; });
      o.etat = rr ? "ok" : "non";
      grand(o, "mens", rr ? rr.mensualiteApres : 0);
      o.avant = rr ? dt(rr.mensualiteAvant, rr.mensualiteAvant % 1 ? 3 : 0) : "—";
      o.avant_lib = rr ? rr.lignes.length + (rr.lignes.length > 1 ? " crédits" : " crédit") : "";
      o.apres = rr ? dt(rr.mensualiteApres) : "—"; o.capital = rr ? "1 crédit · " + dt(rr.capital, 0) : "";
      o.verdict_fort = !rr ? "" : rr.gainMensuel > 0 ? "−" + dt(rr.gainMensuel) + " par mois" : "+" + dt(-rr.gainMensuel) + " par mois";
      o.verdict_suite = !rr ? "" : rr.difference > 0 ? (rr.gainMensuel > 0 ? ", mais " : " et ") + "+" + dt(rr.difference, 0) + " de coût total sur la durée." :
        (rr.gainMensuel > 0 ? " et " : ", mais ") + dt(-rr.difference, 0) + " de moins au total.";
      o.raison = rr ? "" : "Indiquez au moins un crédit en cours (mensualité, taux et mois restants).";
    } else if (page === "employeur") {
      var ce = employeur(x, m);
      grand(o, "cout", ce.cout);
      o.part_sal = nombre(ce.parts.salarie * 100, 1) + " DT"; o.part_caisse = nombre(ce.parts.caisse * 100, 1) + " DT"; o.part_etat = nombre(ce.parts.etat * 100, 1) + " DT";
      o.caisse_lib = "pour la " + ce.caisse;
      o.net = dt(ce.net); o.charges = dt(ce.charges); o.charges_lib = "Charges patronales (" + pct(ce.tauxCharges, 2) + " du brut)"; o.an = dt(ce.coutAn);
      o.parts = { salarie: ce.parts.salarie, caisse: ce.parts.caisse, etat: ce.parts.etat };
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

  return { DEFAUT: DEFAUT, TABLE_BRUTS: TABLE_BRUTS, CREDIT_DEF: CREDIT_DEF, profil: profil, salaire: salaire, credit: credit, impot: impot, retraite: retraite, pont: pont, tableauNet: tableauNet, bareme: bareme,
    simulCredit: simulCredit, assuranceVie: assuranceVie, cea: cea, regle8: regle8, anticipe: anticipe, regroupement: regroupement, employeur: employeur,
    R8_DEF: R8_DEF, RA_DEF: RA_DEF, RG_DEF: RG_DEF, dureeTxt: dureeTxt, taux: taux,
    affichage: affichage, nombre: nombre, dt: dt, pct: pct, annee: P.annee };
});
