/* Projection probabiliste (Monte-Carlo) : fonctions pures, générateur pseudo-aléatoire à graine (résultats reproductibles).
   Chaque trajectoire tire un rendement annuel par produit : loi normale de moyenne le rendement médian saisi et
   d'écart-type la volatilité saisie ; l'assurance vie ne descend jamais sous le taux minimum garanti, le CEA
   (actions) peut perdre jusqu'à 90 % sur une année. Les flux (versements, économies, retraits) sont ceux du scénario. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./projection.js'));
  else racine.MonteCarlo = fabrique(racine.Projection);
})(typeof self !== 'undefined' ? self : this, function (Proj) {
  'use strict';

  /* Générateur mulberry32 : rapide, reproductible */
  function generateur(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Loi normale centrée réduite (Box-Muller) */
  function normale(alea) {
    var u = 0, v = 0;
    while (u === 0) u = alea();
    while (v === 0) v = alea();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function quantile(trie, q) {
    if (!trie.length) return 0;
    var pos = (trie.length - 1) * q, b = Math.floor(pos), h = Math.ceil(pos);
    return trie[b] + (trie[h] - trie[b]) * (pos - b);
  }

  function avec(p, cle, valeur) {
    var c = {};
    Object.keys(p).forEach(function (k) { c[k] = p[k]; });
    c[cle] = valeur;
    return c;
  }

  /* calc = Scenario.calculer (actif) ; o = { trajectoires, volatiliteAv, volatiliteCea, graine, objectif }
     Renvoie les centiles 10/25/50/75/90 du capital total par année, et des probabilités utiles. */
  function simuler(calc, o) {
    if (!calc || !calc.actif) return null;
    var n = Math.max(100, Math.min(20000, Math.floor(o.trajectoires || 5000)));
    var volAv = Math.max(0, o.volatiliteAv || 0), volCea = Math.max(0, o.volatiliteCea || 0);
    var e = calc.etat, duree = e.dureeAns;
    var alea = generateur(o.graine == null ? 20260930 : o.graine);
    var parAnnee = [];
    for (var a = 0; a <= duree; a++) parAnnee.push(new Float64Array(n));
    var finaux = new Float64Array(n);
    var valeurs = new Float64Array(n);
    var verse = calc.med.totalVerse;
    for (var i = 0; i < n; i++) {
      var rAv = [], rCea = [];
      for (var k = 0; k < duree; k++) {
        rAv.push(Math.max(e.tauxGarantiPct || 0, e.rendementPct + volAv * normale(alea)));
        rCea.push(Math.max(-90, e.rendementCeaPct + volCea * normale(alea)));
      }
      var pa = Proj.projeter(avec(calc.p, 'rendementsAnnuels', rAv));
      var pc = calc.aCea ? Proj.projeter(avec(calc.pCea, 'rendementsAnnuels', rCea)) : null;
      for (var j = 0; j <= duree; j++) parAnnee[j][i] = pa.annees[j].capital + (pc ? pc.annees[j].capital : 0);
      finaux[i] = parAnnee[duree][i];
      valeurs[i] = pa.valeurFinale + (pc ? pc.valeurFinale : 0) + (e.reinvestir ? 0 : pa.economieCumulee);
    }
    var centiles = { p10: [], p25: [], p50: [], p75: [], p90: [] };
    parAnnee.forEach(function (tab) {
      var t = Array.prototype.slice.call(tab).sort(function (x, y) { return x - y; });
      centiles.p10.push(quantile(t, 0.10));
      centiles.p25.push(quantile(t, 0.25));
      centiles.p50.push(quantile(t, 0.50));
      centiles.p75.push(quantile(t, 0.75));
      centiles.p90.push(quantile(t, 0.90));
    });
    function proportion(tab, seuil) {
      var c = 0;
      for (var m = 0; m < tab.length; m++) if (tab[m] >= seuil) c++;
      return c / tab.length * 100;
    }
    var annees = [];
    for (var y = 0; y <= duree; y++) annees.push(y);
    return {
      trajectoires: n, annees: annees, centiles: centiles,
      finalP10: centiles.p10[duree], finalP50: centiles.p50[duree], finalP90: centiles.p90[duree],
      probaVersements: proportion(valeurs, verse),
      probaObjectif: o.objectif > 0 ? proportion(finaux, o.objectif) : null,
      objectif: o.objectif > 0 ? o.objectif : null
    };
  }

  return { generateur: generateur, normale: normale, quantile: quantile, simuler: simuler };
});
