/* Comparateur de scénarios du même client (fonctions pures) : variantes automatiques et chiffres clés. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./scenario.js'), require('./moteur-fiscal.js'));
  else racine.Comparateur = fabrique(racine.Scenario, racine.MoteurFiscal);
})(typeof self !== 'undefined' ? self : this, function (Scenario, Moteur) {
  'use strict';

  var MAX = 4;

  function cloner(e) { return JSON.parse(JSON.stringify(e)); }
  function arrondi(v) { return Math.round(v * 1000) / 1000; }

  /* Chiffres clés d'un état */
  function mesurer(etat) {
    var c = Scenario.calculer(etat);
    var s = c.sim, f = c.facteur;
    return {
      versementAv: c.etat.versement, versementCea: c.etat.versementCea, frequence: c.etat.frequence,
      investissement: c.investissement, mensuelTotal: c.investissement / 12,
      economie: s.economie, impotApres: s.impotApres, tauxReduction: s.tauxReduction,
      effortMensuel: Math.max(0, c.investissement - s.economie) / 12,
      capital: c.actif ? c.med.capitalFinal : null, valeur: c.actif ? c.valeurTotale : null,
      rendement: c.actif ? c.effectif : null, duree: c.etat.dureeAns, facteur: f
    };
  }

  /* Variantes proposées à partir de l'état courant (même client, mêmes hypothèses) */
  function variantes(etat) {
    var c = Scenario.calculer(etat);
    var e = c.etat, f = c.facteur;
    var budget = e.versement + e.versementCea;
    var v = [];
    var opt = cloner(e);
    var fixe = Math.max(0, c.investissementAv - e.versement * f);
    opt.versement = c.sim.optimal > 0 ? Math.max(0, Math.ceil((c.sim.optimal - fixe) / f * 1000) / 1000) : e.versement;
    v.push({ cle: 'optimal', etat: opt });
    if (budget > 0) {
      var av = cloner(e); av.versement = arrondi(budget); av.versementCea = 0;
      v.push({ cle: 'avSeule', etat: av });
      var mi = cloner(e); mi.versement = arrondi(budget / 2); mi.versementCea = arrondi(budget / 2);
      v.push({ cle: 'moitie', etat: mi });
    }
    var plus = cloner(e); plus.versement = arrondi(e.versement + 100 * 12 / f);
    v.push({ cle: 'plus100', etat: plus });
    return v;
  }

  /* Indice du meilleur scénario pour chaque critère (null si égalité parfaite ou moins de 2 valeurs) */
  function meilleurs(mesures) {
    function choisir(cle, sens) {
      var vals = mesures.map(function (m) { return m[cle]; });
      if (vals.filter(function (x) { return x != null; }).length < 2) return null;
      var best = null;
      vals.forEach(function (x, i) { if (x != null && (best === null || sens * x > sens * vals[best] + 1e-6)) best = i; });
      var egal = vals.every(function (x) { return x == null || Math.abs(x - vals[best]) < 1e-6; });
      return egal ? null : best;
    }
    return { economie: choisir('economie', 1), impotApres: choisir('impotApres', -1), effortMensuel: choisir('effortMensuel', -1),
      capital: choisir('capital', 1), valeur: choisir('valeur', 1), rendement: choisir('rendement', 1) };
  }

  return { MAX: MAX, mesurer: mesurer, variantes: variantes, meilleurs: meilleurs };
});
