/* Simulation du couple (fonctions pures) : chacun des deux conjoints déclare ses revenus ; les déductions
   familiales (chef de famille, enfants, parents) reviennent au chef de famille. Le simulateur cherche la
   répartition d'un même budget annuel d'assurance vie entre les deux contrats qui maximise l'économie du foyer. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./moteur-fiscal.js'));
  else racine.Couple = fabrique(racine.MoteurFiscal);
})(typeof self !== 'undefined' ? self : this, function (Moteur) {
  'use strict';

  var PAS = 200;

  /* f = { revenu1, revenu2, chef (1 ou 2), enfants, infirmes, etudiants, parents, budget (assurance vie par an),
           cea1, cea2 (CEA annuel de chacun, facultatif) } */
  function entree(f, i, av) {
    var chef = f.chef === i;
    return {
      revenu: i === 1 ? f.revenu1 : f.revenu2, chef: chef,
      enfants: chef ? f.enfants || 0 : 0, infirmes: chef ? f.infirmes || 0 : 0,
      etudiants: chef ? f.etudiants || 0 : 0, parents: chef ? f.parents || 0 : 0,
      investissementAv: av, investissementCea: (i === 1 ? f.cea1 : f.cea2) || 0, leger: true
    };
  }
  function economies(f, a1, annee) {
    var s1 = Moteur.simuler(entree(f, 1, a1), annee), s2 = Moteur.simuler(entree(f, 2, f.budget - a1), annee);
    return { s1: s1, s2: s2, total: s1.economie + s2.economie };
  }

  function repartir(f, annee) {
    if (!(f.budget >= 0) || !(f.revenu1 >= 0) || !(f.revenu2 >= 0)) return null;
    var meilleur = null;
    var essais = [];
    for (var k = 0; k <= PAS; k++) essais.push(f.budget * k / PAS);
    /* Points de bascule exacts : montant optimal de chacun (plancher atteint) */
    [Moteur.simuler(Object.assign(entree(f, 1, 0), { leger: false }), annee).optimal,
     f.budget - Moteur.simuler(Object.assign(entree(f, 2, 0), { leger: false }), annee).optimal].forEach(function (x) {
      if (x > 0 && x < f.budget) essais.push(x);
    });
    essais.forEach(function (a1) {
      var r = economies(f, a1, annee);
      /* À économie égale, on garde la répartition la plus équilibrée */
      if (!meilleur || r.total > meilleur.total + 1e-6 || (Math.abs(r.total - meilleur.total) <= 1e-6 && Math.abs(a1 - f.budget / 2) < Math.abs(meilleur.part1 - f.budget / 2))) {
        meilleur = { part1: a1, part2: f.budget - a1, economie1: r.s1.economie, economie2: r.s2.economie, total: r.total,
          impot1: r.s1.impotApres, impot2: r.s2.impotApres, impotAvant1: r.s1.impotAvant, impotAvant2: r.s2.impotAvant };
      }
    });
    var moitie = economies(f, f.budget / 2, annee).total;
    var tout1 = economies(f, f.budget, annee).total;
    var tout2 = economies(f, 0, annee).total;
    meilleur.egalitaire = moitie;
    meilleur.tout1 = tout1;
    meilleur.tout2 = tout2;
    meilleur.gain = meilleur.total - Math.min(moitie, tout1, tout2);
    meilleur.gainVsEgalitaire = meilleur.total - moitie;
    return meilleur;
  }

  return { repartir: repartir };
});
