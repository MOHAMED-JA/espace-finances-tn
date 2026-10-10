/*
 * Moteur de calcul d'une pension de retraite — Tunisie (pur, sans navigateur, testé sous Node).
 * Pension brute → retenue maladie (CNAM) → abattement forfaitaire → déductions de famille → IRPP (barème annuel) → net.
 * Pas de frais professionnels ni de contribution sociale de solidarité sur les pensions (choix validé par l'utilisateur).
 * Les déductions de famille et le barème sont ceux du moteur de paie (parametres.js / calcul.js).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./calcul.js"), require("./parametres.js"));
  else racine.CalculPension = fabrique(racine.CalculSalaire, racine.PARAMETRES_PAIE);
})(typeof self !== "undefined" ? self : this, function (C, P) {
  "use strict";

  var PARAMETRES = {
    /* Retenue d'assurance maladie sur toutes les pensions (CNSS et CNRPS). */
    cnam: { taux: 0.04, source: "Cotisation d'assurance maladie des retraités (CNAM), 4 % de la pension brute" },
    /* Abattement forfaitaire sur la pension, à la place des frais professionnels des salariés. */
    abattement: {
      parAnnee: { 2026: 0.25, 2027: 0.30, 2028: 0.40, 2029: 0.50 },
      source: "Code de l'IRPP et de l'IS, art. 25 (25 %) ; loi n° 2025-17 (LF 2026), art. 56 : 30 % en 2027, 40 % en 2028, 50 % à partir de 2029"
    },
    /* Pensions et rentes venant de l'étranger et transférées en Tunisie. */
    abattementEtranger: { taux: 0.80, source: "Code de l'IRPP et de l'IS, art. 25" },
    versementsParAn: 12
  };

  function nombre(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
  function entier(v, max) { return Math.min(max, Math.floor(nombre(v))); }

  /* Taux d'abattement d'une année : la dernière année connue s'applique ensuite, la première avant. */
  function tauxAbattement(annee, etranger) {
    if (etranger) return PARAMETRES.abattementEtranger.taux;
    var t = PARAMETRES.abattement.parAnnee, ans = Object.keys(t).map(Number).sort(function (a, b) { return a - b; });
    var a = Number(annee) || ans[0], r = t[ans[0]];
    ans.forEach(function (x) { if (x <= a) r = t[x]; });
    return r;
  }

  /* e : { brutMensuel, etranger, chefDeFamille, enfants, etudiants, handicapes, parents, annee } */
  function calculerDepuisBrut(e0) {
    var e = {
      brutMensuel: nombre(e0.brutMensuel), etranger: !!e0.etranger, annee: Number(e0.annee) || new Date().getFullYear(),
      chefDeFamille: !!e0.chefDeFamille, enfants: entier(e0.enfants, 15), etudiants: entier(e0.etudiants, 15), handicapes: entier(e0.handicapes, 15), parents: entier(e0.parents, 2)
    };
    var n = PARAMETRES.versementsParAn, brut = e.brutMensuel * n;
    var cnam = brut * PARAMETRES.cnam.taux;
    var apresRetenues = brut - cnam;
    var taux = tauxAbattement(e.annee, e.etranger);
    var abattement = apresRetenues * taux;
    var revenuNet = apresRetenues - abattement;
    var ded = C.calculerDeductions(e, revenuNet, P);
    var imposable = Math.max(0, revenuNet - ded.total);
    var bareme = C.calculerImpotBareme(imposable, P.irpp.bareme);
    var net = brut - cnam - bareme.impot;
    return {
      entree: e,
      annuel: { brut: brut, cnam: cnam, apresRetenues: apresRetenues, tauxAbattement: taux, abattement: abattement, revenuNet: revenuNet,
        deductions: ded.total, deductionsLignes: ded.lignes, imposable: imposable, irpp: bareme.impot, irppTranches: bareme.tranches, net: net },
      mensuel: { brut: e.brutMensuel, cnam: cnam / n, irpp: bareme.impot / n, net: net / n },
      /* Revenu de référence pour l'avantage assurance vie / CEA : pension après retenue maladie. */
      revenuFiscal: apresRetenues
    };
  }

  /* Pension brute qui donne le net mensuel voulu (recherche par dichotomie, au millime). */
  function calculerDepuisNet(e0) {
    var cible = nombre(e0.netMensuel), bas = cible, haut = Math.max(cible * 2, 1);
    function net(b) { return calculerDepuisBrut(Object.assign({}, e0, { brutMensuel: b })).mensuel.net; }
    while (net(haut) < cible) haut *= 2;
    for (var k = 0; k < 80 && haut - bas > 0.0001; k++) { var m = (bas + haut) / 2; if (net(m) < cible) bas = m; else haut = m; }
    var b = Math.round(haut * 1000) / 1000;
    return calculerDepuisBrut(Object.assign({}, e0, { brutMensuel: b }));
  }

  /* Net mensuel de chaque année d'un intervalle (hausse de l'abattement), à pension brute constante. */
  function projection(e0, de, a) {
    var out = [];
    for (var y = de; y <= a; y++) { var r = calculerDepuisBrut(Object.assign({}, e0, { annee: y })); out.push({ annee: y, tauxAbattement: r.annuel.tauxAbattement, netMensuel: r.mensuel.net, irppMensuel: r.mensuel.irpp }); }
    return out;
  }

  return { PARAMETRES: PARAMETRES, tauxAbattement: tauxAbattement, calculerDepuisBrut: calculerDepuisBrut, calculerDepuisNet: calculerDepuisNet, projection: projection };
});
