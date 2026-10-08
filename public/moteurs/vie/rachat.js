/* Sortie anticipée (fonctions pures) : rachat d'assurance vie ou retrait du CEA à l'année N, et avance sur contrat.
   Modèle simplifié, paramètres dans baremes.js (à confirmer avec le texte en vigueur) :
   - assurance vie : si le contrat a moins de `dureeMinimaleAns` ans, la part rachetée des primes déduites
     est réintégrée au revenu imposable de l'année du rachat ;
   - CEA : un dépôt de l'année k reste bloqué jusqu'à la fin de l'année k + `dureeBlocageAns` (5 ans à compter
     du 1er janvier suivant le dépôt) ; un retrait en fin d'année N fait réintégrer la part retirée des dépôts
     encore bloqués (années k > N − 5). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./moteur-fiscal.js'));
  else racine.Rachat = fabrique(racine.MoteurFiscal);
})(typeof self !== 'undefined' ? self : this, function (Moteur) {
  'use strict';

  function reglesProduits(calc) { return Moteur.produits(calc.sim.regles); }

  /* calc = résultat de Scenario.calculer (actif) ; r = { produit: 'av' | 'cea', annee, partPct, penalitePct }
     Renvoie null si le scénario n'est pas exploitable ou si les paramètres sont hors bornes. */
  function simuler(calc, r) {
    if (!calc || !calc.actif) return null;
    var produit = r.produit === 'cea' ? 'cea' : 'av';
    var n = r.annee, part = r.partPct / 100, pen = (r.penalitePct || 0) / 100;
    if (!(n >= 1 && n <= calc.etat.dureeAns) || Math.floor(n) !== n) return null;
    if (!(part > 0 && part <= 1) || !(pen >= 0 && pen < 1)) return null;
    var proj = produit === 'cea' ? calc.medCea : calc.medAv;
    if (!proj) return null;

    var P = reglesProduits(calc);
    var cleDeduction = produit === 'cea' ? 'deductionCea' : 'deductionAv';
    var cleEconomie = produit === 'cea' ? 'economieCea' : 'economieAv';
    var anticipe, deduitConcerne = 0, duree;
    if (produit === 'av') {
      duree = P.av.dureeMinimaleAns;
      anticipe = n < duree;
      if (anticipe) for (var a = 1; a <= n; a++) deduitConcerne += calc.annuel[a - 1][cleDeduction];
    } else {
      duree = P.cea.dureeBlocageAns;
      for (var k = Math.max(1, n - duree + 1); k <= n; k++) deduitConcerne += calc.annuel[k - 1][cleDeduction];
      anticipe = deduitConcerne > 0;
    }
    var reintegre = deduitConcerne * part;
    var base = calc.annuel[n - 1].revenuNet;
    var regles = calc.sim.regles;
    var impotReintegration = reintegre > 0
      ? Moteur.impotDetaille(base + reintegre, regles).total - Moteur.impotDetaille(base, regles).total
      : 0;

    var ligne = proj.annees[n];
    var capitalRachete = ligne.capital * part;
    var penalite = capitalRachete * pen;
    var netRecu = capitalRachete - penalite - impotReintegration;
    var versementsRachetes = ligne.verse * part;
    var economieObtenue = 0;
    for (var j = 0; j < n; j++) economieObtenue += calc.annuel[j][cleEconomie];

    return {
      produit: produit, annee: n, partPct: r.partPct, anticipe: anticipe, dureeMinimale: duree,
      capitalRachete: capitalRachete, penalite: penalite,
      montantReintegre: reintegre, impotReintegration: impotReintegration,
      netRecu: netRecu, versementsRachetes: versementsRachetes,
      coutSortie: penalite + impotReintegration,
      gainNet: netRecu - versementsRachetes,
      economieObtenue: economieObtenue * part
    };
  }

  /* Avance sur contrat d'assurance vie : prêt de l'assureur garanti par l'épargne, remboursé par mensualités.
     a = { annee, montant, tauxPct, dureeMois, penalitePct } ; renvoie aussi le coût d'un rachat du même montant. */
  function avance(calc, a) {
    if (!calc || !calc.actif || !calc.medAv) return null;
    var n = a.annee;
    if (!(n >= 1 && n <= calc.etat.dureeAns) || Math.floor(n) !== n) return null;
    if (!(a.montant > 0) || !(a.tauxPct >= 0 && a.tauxPct <= 30) || !(a.dureeMois >= 1 && a.dureeMois <= 360) || Math.floor(a.dureeMois) !== a.dureeMois) return null;
    var capital = calc.medAv.annees[n].capital;
    if (!(capital > 0)) return { possible: false, capitalDisponible: 0 };
    if (a.montant > capital) return { possible: false, capitalDisponible: capital };
    var i = a.tauxPct / 100 / 12;
    var mensualite = i === 0 ? a.montant / a.dureeMois : a.montant * i / (1 - Math.pow(1 + i, -a.dureeMois));
    var interets = mensualite * a.dureeMois - a.montant;
    var rachat = simuler(calc, { produit: 'av', annee: n, partPct: a.montant / capital * 100, penalitePct: a.penalitePct || 0 });
    return {
      possible: true, capitalDisponible: capital, montant: a.montant,
      mensualite: mensualite, interets: interets,
      coutRachat: rachat ? rachat.coutSortie : null,
      netRachat: rachat ? rachat.netRecu : null
    };
  }

  return { simuler: simuler, avance: avance };
});
