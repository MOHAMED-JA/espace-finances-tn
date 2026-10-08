/* Comparateur de contrats d'assurance vie (fonctions pures) : mêmes versements, offres différentes
   (taux servi estimé, taux garanti, frais de gestion, frais sur versement). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./projection.js'));
  else racine.Contrats = fabrique(racine.Projection);
})(typeof self !== 'undefined' ? self : this, function (Proj) {
  'use strict';

  function valide(o) {
    return o && isFinite(o.tauxServi) && o.tauxServi >= 0 && o.tauxServi <= 50 &&
      isFinite(o.tauxGaranti) && o.tauxGaranti >= 0 && o.tauxGaranti <= o.tauxServi &&
      isFinite(o.fraisGestion) && o.fraisGestion >= 0 && o.fraisGestion <= 20 &&
      isFinite(o.fraisVersement) && o.fraisVersement >= 0 && o.fraisVersement <= 10;
  }

  /* calc = Scenario.calculer (actif) ; offres = [{ nom, tauxServi, tauxGaranti, fraisGestion, fraisVersement }]
     Renvoie chaque offre avec capital médian, capital au taux garanti seul (plancher) et rendement effectif. */
  function comparer(calc, offres) {
    if (!calc || !calc.actif) return null;
    var res = offres.map(function (o, i) {
      if (!valide(o)) return { indice: i, nom: o && o.nom, valide: false };
      var p = {};
      Object.keys(calc.p).forEach(function (k) { p[k] = calc.p[k]; });
      p.fraisPct = o.fraisGestion;
      p.fraisEntreePct = o.fraisVersement;
      var median = Proj.projeter(Object.assign({}, p, { rendementPct: o.tauxServi }));
      var plancher = Proj.projeter(Object.assign({}, p, { rendementPct: o.tauxGaranti }));
      var sans = Proj.projeter(Object.assign({}, p, { rendementPct: o.tauxServi, reinvestir: false }));
      return {
        indice: i, nom: o.nom, valide: true,
        capital: median.capitalFinal, capitalGaranti: plancher.capitalFinal,
        valeur: median.valeurFinale + (p.reinvestir ? 0 : median.economieCumulee),
        /* Coût des frais au terme : écart avec la même offre sans aucun frais */
        frais: Proj.projeter(Object.assign({}, p, { rendementPct: o.tauxServi, fraisPct: 0, fraisEntreePct: 0 })).valeurFinale - median.valeurFinale,
        rendementEffectif: Proj.triProjection(sans, p.periodesParAn)
      };
    });
    var valides = res.filter(function (r) { return r.valide; });
    var meilleur = valides.reduce(function (m, r) { return !m || r.valeur > m.valeur ? r : m; }, null);
    res.forEach(function (r) { r.meilleur = !!meilleur && r === meilleur; r.ecart = r.valide && meilleur ? r.valeur - meilleur.valeur : null; });
    return res;
  }

  return { comparer: comparer, valide: valide };
});
