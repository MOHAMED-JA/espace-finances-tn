/*
 * Orbite — comparer 2 ou 3 simulations enregistrées du même outil (Lot 2). Fonction pure, testée sous Node.
 * Lignes : l'indicateur principal puis les secondaires, dans l'ordre de la première simulation, par libellé.
 * Le « meilleur » n'est marqué que lorsque le sens est sans ambiguïté (mensualité, coût, intérêts, impôt, effort :
 * le plus bas ; net, économie, capital au terme : le plus haut) et que les unités sont les mêmes.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.ComparerCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MAX = 3;
  function sens(libelle) {
    var l = String(libelle || "").toLowerCase();
    if (/employeur|emprunt|brut/.test(l)) return 0;
    if (/économie|economie|net|au terme|gain|capacité/.test(l)) return 1;
    if (/mensualit|échéance|echeance|coût|cout|intérêt|interet|effort|impôt|impot|prélèvement|prelevement|taux|teg/.test(l)) return -1;
    return 0;
  }
  /** sims : [{ nom, outil, resume: { principal, secondaires } }] (résumés déjà validés). */
  function comparer(sims) {
    var liste = (sims || []).slice(0, MAX);
    if (liste.length < 2) return { erreur: "Choisissez au moins 2 simulations." };
    var outil = liste[0].outil;
    if (liste.some(function (s) { return s.outil !== outil; })) return { erreur: "Comparez des simulations du même module." };
    function indicateurs(s) { var r = s.resume || {}; return [r.principal].concat(r.secondaires || []).filter(function (x) { return x && x.libelle; }); }
    var ordre = [], vus = {};
    liste.forEach(function (s) { indicateurs(s).forEach(function (x) { if (!vus[x.libelle]) { vus[x.libelle] = 1; ordre.push(x.libelle); } }); });
    var lignes = ordre.map(function (lib, i) {
      var cellules = liste.map(function (s) { return indicateurs(s).filter(function (x) { return x.libelle === lib; })[0] || null; });
      var d = sens(lib), presents = cellules.filter(Boolean), memeUnite = presents.every(function (c) { return c.unite === presents[0].unite; });
      var meilleur = -1;
      if (d !== 0 && presents.length === cellules.length && memeUnite) {
        var vals = cellules.map(function (c) { return c.valeur; }), cible = d > 0 ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
        var nbCible = vals.filter(function (v) { return Math.abs(v - cible) < 1e-9; }).length;
        if (nbCible === 1) meilleur = vals.indexOf(cible);
      }
      var ecart = null;
      if (presents.length === cellules.length && memeUnite && cellules.length >= 2) {
        var vs = cellules.map(function (c) { return c.valeur; });
        ecart = { valeur: Math.max.apply(null, vs) - Math.min.apply(null, vs), unite: presents[0].unite };
      }
      return { libelle: lib, principal: i === 0, cellules: cellules, meilleur: meilleur, sens: d, ecart: ecart };
    });
    return { outil: outil, noms: liste.map(function (s) { return s.nom; }), lignes: lignes };
  }
  return { comparer: comparer, sens: sens, MAX: MAX };
});
