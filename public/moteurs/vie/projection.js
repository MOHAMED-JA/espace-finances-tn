/* Projection du capital constitué : fonctions pures, hypothèses fournies par l'utilisateur.
   Les versements ont lieu en fin de période ; l'économie d'impôt de l'année est perçue en fin d'année. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Projection = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ECART_SCENARIOS = 2; /* écart par défaut (en points de rendement) entre scénarios prudent, médian et dynamique */

  function tauxPeriode(rendementPct, periodesParAn) {
    var annuel = Math.max(rendementPct, -99) / 100;
    return Math.pow(1 + annuel, 1 / periodesParAn) - 1;
  }

  /* p = { versement (par période), periodesParAn, dureeAns, rendementPct, fraisPct, economieAnnuelle, reinvestir,
           croissancePct (hausse annuelle des versements, défaut 0), economies (économie d'impôt de chaque année, facultatif),
           inflationPct (défaut 0, sert au capital en valeur réelle),
           versementInitial (versé au début de la 1re année), fraisEntreePct (frais prélevés sur chaque versement),
           versementsLibres ({ année: montant }, versés en fin d'année),
           retraitDebut, retraitMontant (retrait annuel en fin d'année à partir de l'année retraitDebut, borné au capital),
           rendementsAnnuels (facultatif : rendement de chaque année, en %, à la place de rendementPct),
           facteursVersement (facultatif : part des versements périodiques effectués chaque année, 0 = pause) } */
  function projeter(p) {
    var tp = tauxPeriode(p.rendementPct - (p.fraisPct || 0), p.periodesParAn);
    var croissance = 1 + (p.croissancePct || 0) / 100;
    var inflation = 1 + (p.inflationPct || 0) / 100;
    var net = 1 - (p.fraisEntreePct || 0) / 100;
    var initial = p.versementInitial > 0 ? p.versementInitial : 0;
    var libres = p.versementsLibres || {};
    var capital = initial * net, verse = initial, economieCumulee = 0, retire = 0;
    var annees = [{ annee: 0, verse: initial, capital: capital, capitalReel: capital, retire: 0 }];
    var flux = [];
    for (var a = 1; a <= p.dureeAns; a++) {
      var versement = p.versement * Math.pow(croissance, a - 1) * (p.facteursVersement && p.facteursVersement[a - 1] != null ? p.facteursVersement[a - 1] : 1);
      var economie = p.economies && p.economies[a - 1] != null ? p.economies[a - 1] : (p.economieAnnuelle || 0);
      /* Rendement propre à l'année (simulation Monte-Carlo), sinon rendement constant */
      var tpa = p.rendementsAnnuels ? tauxPeriode(p.rendementsAnnuels[a - 1] - (p.fraisPct || 0), p.periodesParAn) : tp;
      for (var k = 0; k < p.periodesParAn; k++) {
        capital = capital * (1 + tpa) + versement * net;
        verse += versement;
      }
      var libre = libres[a] > 0 ? libres[a] : 0;
      capital += libre * net;
      verse += libre;
      economieCumulee += economie;
      if (p.reinvestir) capital += economie;
      var retrait = 0;
      if (p.retraitMontant > 0 && p.retraitDebut >= 1 && a >= p.retraitDebut) {
        retrait = Math.min(p.retraitMontant, capital);
        capital -= retrait;
        retire += retrait;
      }
      flux.push({ versement: versement, economie: economie, libre: libre, retrait: retrait });
      annees.push({ annee: a, verse: verse, capital: capital, capitalReel: capital / Math.pow(inflation, a), retire: retire });
    }
    return {
      annees: annees,
      flux: flux,
      initial: initial,
      capitalFinal: capital,
      capitalFinalReel: annees[annees.length - 1].capitalReel,
      totalVerse: verse,
      totalRetire: retire,
      valeurFinale: capital + retire,
      gain: capital + retire - verse - (p.reinvestir ? economieCumulee : 0),
      economieCumulee: economieCumulee
    };
  }

  /* Additionne deux projections de même durée (assurance vie + CEA) */
  function combiner(x, y) {
    if (!y) return x;
    if (!x) return y;
    return {
      annees: x.annees.map(function (a, i) {
        var b = y.annees[i];
        return { annee: a.annee, verse: a.verse + b.verse, capital: a.capital + b.capital, capitalReel: a.capitalReel + b.capitalReel, retire: a.retire + b.retire };
      }),
      flux: x.flux.map(function (f, i) {
        var g = y.flux[i];
        return { versement: f.versement + g.versement, economie: f.economie + g.economie, libre: f.libre + g.libre, retrait: f.retrait + g.retrait };
      }),
      initial: x.initial + y.initial,
      capitalFinal: x.capitalFinal + y.capitalFinal,
      capitalFinalReel: x.capitalFinalReel + y.capitalFinalReel,
      totalVerse: x.totalVerse + y.totalVerse,
      totalRetire: x.totalRetire + y.totalRetire,
      valeurFinale: x.valeurFinale + y.valeurFinale,
      gain: x.gain + y.gain,
      economieCumulee: x.economieCumulee + y.economieCumulee
    };
  }

  function ecartDe(p) { return p.ecartPct != null && isFinite(p.ecartPct) ? Math.max(0, p.ecartPct) : ECART_SCENARIOS; }

  /* Trois scénarios autour du rendement médian saisi (jamais en dessous de 0 %) */
  function scenarios(p) {
    var ecart = ecartDe(p);
    function avec(delta) {
      var copie = {};
      Object.keys(p).forEach(function (k) { copie[k] = p[k]; });
      copie.rendementPct = Math.max(0, p.rendementPct + delta);
      return projeter(copie);
    }
    return { prudent: avec(-ecart), median: avec(0), dynamique: avec(ecart), ecart: ecart };
  }

  /* Placement classique de mêmes versements (initial, périodiques, libres, retraits), sans avantage fiscal ni frais.
     Renvoie la valeur finale (capital + retraits perçus). */
  function placementClassique(p, tauxPct) {
    return projeter({
      versement: p.versement, periodesParAn: p.periodesParAn, dureeAns: p.dureeAns,
      rendementPct: tauxPct, fraisPct: 0, economieAnnuelle: 0, reinvestir: false,
      croissancePct: p.croissancePct, inflationPct: p.inflationPct,
      versementInitial: p.versementInitial, versementsLibres: p.versementsLibres,
      retraitDebut: p.retraitDebut, retraitMontant: p.retraitMontant
    }).valeurFinale;
  }

  /* Rendement annuel effectif (TRI) d'une projection : versement initial, versements et versements libres
     sortants ; économie d'impôt, retraits et capital final entrants. `proj` = résultat de projeter (sans
     réinvestissement de l'économie), `periodesParAn` = nombre de versements par an. Renvoie null sans solution. */
  function triProjection(proj, periodesParAn) {
    var duree = proj.flux.length;
    if (!duree) return null;
    function vaNette(i) {
      var v = -proj.initial;
      for (var a = 0; a < duree; a++) {
        var f = proj.flux[a];
        for (var k = 1; k <= periodesParAn; k++) v -= f.versement / Math.pow(1 + i, a + k / periodesParAn);
        v += (f.economie + f.retrait - f.libre) / Math.pow(1 + i, a + 1);
      }
      return v + proj.capitalFinal / Math.pow(1 + i, duree);
    }
    var bas = -0.99, haut = 10;
    if (vaNette(bas) * vaNette(haut) > 0) return null;
    for (var n = 0; n < 200; n++) {
      var milieu = (bas + haut) / 2;
      if (vaNette(bas) * vaNette(milieu) <= 0) haut = milieu; else bas = milieu;
    }
    return (bas + haut) / 2 * 100;
  }

  /* Rendement effectif d'un jeu d'hypothèses (compatibilité) */
  function rendementEffectif(p) {
    if (!(p.versement > 0 || p.versementInitial > 0) || !(p.dureeAns > 0)) return null;
    var copie = {};
    Object.keys(p).forEach(function (k) { copie[k] = p[k]; });
    copie.reinvestir = false;
    return triProjection(projeter(copie), p.periodesParAn);
  }

  return {
    ECART_SCENARIOS: ECART_SCENARIOS,
    projeter: projeter,
    scenarios: scenarios,
    placementClassique: placementClassique,
    rendementEffectif: rendementEffectif,
    triProjection: triProjection,
    combiner: combiner
  };
});
