/* Stratégie pluriannuelle (fonctions pures) : pour chaque année, la répartition du budget d'épargne entre
   assurance vie et CEA qui maximise la valeur au terme (capital du scénario médian + économie d'impôt).
   Le problème est séparable année par année : un dinar versé l'année a croît jusqu'au terme au rendement net
   de son produit, et l'économie d'impôt de l'année dépend seulement de la répartition de cette année.
   Contraintes : pas de CEA les 5 dernières années (le dépôt serait encore bloqué au terme et sa déduction
   reprise) ; si la durée est inférieure à 8 ans, la déduction de l'assurance vie serait reprise au terme. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./moteur-fiscal.js'));
  else racine.Strategie = fabrique(racine.MoteurFiscal);
})(typeof self !== 'undefined' ? self : this, function (Moteur) {
  'use strict';

  var PAS = 20; /* répartition testée par pas de 5 % */

  /* Facteur de croissance d'un dinar versé en milieu d'année a jusqu'au terme (rendement net de frais) */
  function croissance(rendementPct, fraisPct, duree, a) {
    return Math.pow(1 + (rendementPct - (fraisPct || 0)) / 100, duree - a + 0.5);
  }

  /* calc = Scenario.calculer (actif). Renvoie le plan année par année et la comparaison avec la répartition saisie. */
  function optimiser(calc) {
    if (!calc || !calc.actif) return null;
    var e = calc.etat, f = calc.facteur, n = e.dureeAns;
    var P = Moteur.produits(calc.sim.regles);
    var g = 1 + (e.croissancePct || 0) / 100;
    var libres = {};
    (e.libres || []).forEach(function (l) { if (l && l.montant > 0) libres[l.annee] = (libres[l.annee] || 0) + l.montant; });
    var avValable = n >= P.av.dureeMinimaleAns;
    var entree = 1 - (e.fraisEntreePct || 0) / 100;
    var plan = [], totalOpt = 0, totalActuel = 0;
    for (var a = 1; a <= n; a++) {
      var ga = Math.pow(g, a - 1);
      var av0 = e.versement * f * ga + (a === 1 ? e.initialAv : 0) + (libres[a] || 0);
      var cea0 = e.versementCea * f * ga + (a === 1 ? e.initialCea : 0);
      var budget = av0 + cea0;
      var ceaPermis = a <= n - P.cea.dureeBlocageAns;
      var fAv = croissance(e.rendementPct, e.fraisPct, n, a) * entree;
      var fCea = croissance(e.rendementCeaPct, e.fraisCeaPct, n, a);
      var revenu = e.revenu * ga;
      var meilleur = null;
      function valeur(av, cea) {
        var s = Moteur.simuler({ revenu: revenu, chef: e.chef, enfants: e.enfants, infirmes: e.infirmes, etudiants: e.etudiants, parents: e.parents,
          investissementAv: avValable ? av : 0, investissementCea: ceaPermis ? cea : 0, leger: true }, e.annee);
        return { economie: s.economie, total: av * fAv + cea * fCea + s.economie };
      }
      for (var k = 0; k <= PAS; k++) {
        var part = k / PAS;
        if (!ceaPermis && part > 0) break;
        var cea = budget * part, av = budget - cea;
        var v = valeur(av, cea);
        if (!meilleur || v.total > meilleur.total + 1e-9) meilleur = { av: av, cea: cea, partCea: part * 100, economie: v.economie, total: v.total };
      }
      var actuel = valeur(av0, cea0);
      totalOpt += meilleur.total;
      totalActuel += actuel.total;
      plan.push({ annee: a, budget: budget, av: meilleur.av, cea: meilleur.cea, partCea: meilleur.partCea, economie: meilleur.economie,
        ceaPermis: ceaPermis, valeurOptimale: meilleur.total, valeurActuelle: actuel.total });
    }
    return {
      plan: plan, valeurOptimale: totalOpt, valeurActuelle: totalActuel, gain: totalOpt - totalActuel,
      avValable: avValable, dureeBlocageCea: P.cea.dureeBlocageAns, dureeMinimaleAv: P.av.dureeMinimaleAns
    };
  }

  return { optimiser: optimiser, croissance: croissance };
});
