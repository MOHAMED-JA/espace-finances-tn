/* Scénario complet : enchaîne calcul fiscal et projection à partir d'un état de saisie (fonctions pures).
   Sert à l'interface, au comparateur, au portefeuille, au lien de partage et au PDF. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./baremes.js'), require('./moteur-fiscal.js'), require('./projection.js'));
  else racine.Scenario = fabrique(racine.Baremes, racine.MoteurFiscal, racine.Projection);
})(typeof self !== 'undefined' ? self : this, function (Baremes, Moteur, Proj) {
  'use strict';

  var DUREE_MAX = 40;

  /* Supports : écart de rendement (± points) entre scénarios prudent et dynamique */
  var SUPPORTS = { euros: 1, equilibre: 2, dynamique: 4 };

  function defauts() {
    return {
      annee: Baremes.parDefaut,
      revenu: 0, chef: false, enfants: 0, infirmes: 0, etudiants: 0, parents: 0,
      frequence: 'Mensuel',
      /* Assurance vie : versement par période, versement initial, versements libres, retraits programmés */
      versement: 0, initialAv: 0, libres: [], retraitDebut: 0, retraitMontant: 0,
      /* CEA : versement par période et versement initial */
      versementCea: 0, initialCea: 0,
      dureeAns: 10, rendementPct: 6, tauxGarantiPct: 0, fraisPct: 1, fraisEntreePct: 0,
      rendementCeaPct: 8, fraisCeaPct: 0.5, ecartCeaPct: 4,
      comparPct: 4, reinvestir: false,
      ecartPct: 2, croissancePct: 0, inflationPct: 0, impotInteretsPct: 20,
      ageActuel: 0, ageDepart: 0
    };
  }

  function dans(v, min, max) { return isFinite(v) && v >= min && v <= max; }
  function entier(v) { return Math.floor(v) === v; }

  /* Contrôle des hypothèses de projection : renvoie null ou { code, … } pour la première erreur */
  function erreurHypotheses(e0) {
    var e = Object.assign(defauts(), e0);
    if (!dans(e.dureeAns, 1, DUREE_MAX) || !entier(e.dureeAns)) return { code: 'duree', max: DUREE_MAX };
    if (!dans(e.rendementPct, 0, 50)) return { code: 'rendement' };
    if (!dans(e.tauxGarantiPct, 0, 20) || e.tauxGarantiPct > e.rendementPct) return { code: 'garanti' };
    if (!dans(e.fraisPct, 0, 20)) return { code: 'frais' };
    if (!dans(e.fraisEntreePct, 0, 10)) return { code: 'fraisEntree' };
    if (!dans(e.rendementCeaPct, 0, 50)) return { code: 'rendementCea' };
    if (!dans(e.fraisCeaPct, 0, 10)) return { code: 'fraisCea' };
    if (!dans(e.ecartCeaPct, 0, 30)) return { code: 'ecartCea' };
    if (!dans(e.comparPct, 0, 50)) return { code: 'compar' };
    if (!dans(e.ecartPct, 0, 20)) return { code: 'ecart' };
    if (!dans(e.croissancePct, 0, 20)) return { code: 'croissance' };
    if (!dans(e.inflationPct, 0, 30)) return { code: 'inflation' };
    if (!dans(e.impotInteretsPct, 0, 50)) return { code: 'impotInterets' };
    if (!dans(e.initialAv, 0, 1e9) || !dans(e.initialCea, 0, 1e9) || !dans(e.versementCea, 0, 1e9)) return { code: 'montant' };
    var libresOk = (e.libres || []).every(function (l) { return l && entier(l.annee) && dans(l.annee, 1, e.dureeAns) && dans(l.montant, 0, 1e9); });
    if (!libresOk) return { code: 'libres', max: e.dureeAns };
    if (e.retraitMontant > 0 || !isFinite(e.retraitMontant)) {
      var min = (Baremes.annees[e.annee] || Baremes.annees[Baremes.parDefaut]).produits.av.dureeMinimaleAns;
      if (!dans(e.retraitMontant, 0, 1e9)) return { code: 'montant' };
      if (!entier(e.retraitDebut) || !dans(e.retraitDebut, 1, e.dureeAns)) return { code: 'retraitDebut', max: e.dureeAns };
      if (e.retraitDebut < min) return { code: 'retraitTot', min: min };
    }
    return null;
  }

  function libresParAnnee(e) {
    var m = {};
    (e.libres || []).forEach(function (l) { if (l && l.annee >= 1 && l.montant > 0) m[l.annee] = (m[l.annee] || 0) + l.montant; });
    return m;
  }

  /* Montants investis l'année a (1 = première année) dans chaque produit */
  function montantsAnnee(e, facteur, a, libres) {
    var g = Math.pow(1 + (e.croissancePct || 0) / 100, a - 1);
    return {
      av: e.versement * facteur * g + (a === 1 ? e.initialAv || 0 : 0) + (libres[a] || 0),
      cea: e.versementCea * facteur * g + (a === 1 ? e.initialCea || 0 : 0)
    };
  }

  function simulerAnnee(e, a, m, leger) {
    var g = Math.pow(1 + (e.croissancePct || 0) / 100, a - 1);
    return Moteur.simuler({
      revenu: e.revenu * g, chef: e.chef, enfants: e.enfants, infirmes: e.infirmes,
      etudiants: e.etudiants, parents: e.parents, investissementAv: m.av, investissementCea: m.cea, leger: !!leger
    }, e.annee);
  }

  function avec(p, cle, valeur) {
    var c = {};
    Object.keys(p).forEach(function (k) { c[k] = p[k]; });
    c[cle] = valeur;
    return c;
  }

  /* e = état de saisie (voir defauts). Renvoie tout ce que l'interface affiche. */
  function calculer(e0) {
    var e = Object.assign(defauts(), e0);
    var facteur = Moteur.FACTEURS[e.frequence] || 12;
    var libres = libresParAnnee(e);
    var m1 = montantsAnnee(e, facteur, 1, libres);
    var sim = simulerAnnee(e, 1, m1);
    var res = {
      etat: e, facteur: facteur, sim: sim, erreur: erreurHypotheses(e), actif: false,
      investissement: m1.av + m1.cea, investissementAv: m1.av, investissementCea: m1.cea
    };
    var aAv = e.versement > 0 || e.initialAv > 0 || Object.keys(libres).length > 0;
    var aCea = e.versementCea > 0 || e.initialCea > 0;
    if (res.erreur || !(aAv || aCea)) return res;

    /* Impôt année par année (hausse des revenus, versement initial et versements libres) */
    var varie = e.croissancePct > 0 || e.initialAv > 0 || e.initialCea > 0 || Object.keys(libres).length > 0;
    var annuel = [];
    for (var a = 1; a <= e.dureeAns; a++) {
      var s = a === 1 || !varie ? sim : simulerAnnee(e, a, montantsAnnee(e, facteur, a, libres), true);
      annuel.push({ revenuNet: s.revenuNet, deductionAv: s.deductionAv, deductionCea: s.deductionCea, economie: s.economie, economieAv: s.economieAv, economieCea: s.economieCea });
    }
    var economies = annuel.map(function (x) { return x.economie; });
    var zeros = annuel.map(function () { return 0; });

    var pAv = {
      versement: e.versement, periodesParAn: facteur, dureeAns: e.dureeAns,
      rendementPct: e.rendementPct, fraisPct: e.fraisPct, fraisEntreePct: e.fraisEntreePct,
      versementInitial: e.initialAv, versementsLibres: libres,
      retraitDebut: e.retraitDebut, retraitMontant: e.retraitMontant,
      economies: economies, reinvestir: e.reinvestir,
      croissancePct: e.croissancePct, inflationPct: e.inflationPct
    };
    var pCea = {
      versement: e.versementCea, periodesParAn: facteur, dureeAns: e.dureeAns,
      rendementPct: e.rendementCeaPct, fraisPct: e.fraisCeaPct, versementInitial: e.initialCea,
      economies: zeros, reinvestir: false, croissancePct: e.croissancePct, inflationPct: e.inflationPct
    };
    /* Assurance vie : le scénario prudent ne descend jamais sous le taux minimum garanti */
    var taux = {
      av: {
        prudent: Math.max(e.tauxGarantiPct, e.rendementPct - e.ecartPct, 0),
        median: e.rendementPct,
        dynamique: e.rendementPct + e.ecartPct
      },
      cea: {
        prudent: Math.max(0, e.rendementCeaPct - e.ecartCeaPct),
        median: e.rendementCeaPct,
        dynamique: e.rendementCeaPct + e.ecartCeaPct
      }
    };
    var sc = {}, scAv = {}, scCea = {};
    ['prudent', 'median', 'dynamique'].forEach(function (k) {
      scAv[k] = Proj.projeter(avec(pAv, 'rendementPct', taux.av[k]));
      scCea[k] = aCea ? Proj.projeter(avec(pCea, 'rendementPct', taux.cea[k])) : null;
      sc[k] = Proj.combiner(scAv[k], scCea[k]);
    });
    var med = sc.median;
    var valeurTotale = med.valeurFinale + (e.reinvestir ? 0 : med.economieCumulee);
    var pTotal = {
      versement: e.versement + e.versementCea, periodesParAn: facteur, dureeAns: e.dureeAns,
      croissancePct: e.croissancePct, inflationPct: e.inflationPct,
      versementInitial: (e.initialAv || 0) + (e.initialCea || 0), versementsLibres: libres,
      retraitDebut: e.retraitDebut, retraitMontant: e.retraitMontant
    };
    var sansReinvest = Proj.combiner(Proj.projeter(avec(pAv, 'reinvestir', false)), aCea ? scCea.median : null);

    res.actif = true;
    res.aAv = aAv;
    res.aCea = aCea;
    res.annuel = annuel;
    res.p = pAv;
    res.pCea = pCea;
    res.taux = taux;
    res.sc = sc;
    res.scAv = scAv;
    res.scCea = scCea;
    res.med = med;
    res.medAv = scAv.median;
    res.medCea = scCea.median;
    res.valeurTotale = valeurTotale;
    res.classique = Proj.placementClassique(pTotal, e.comparPct);
    res.effectif = Proj.triProjection(sansReinvest, facteur);
    res.avantage = valeurTotale - res.classique;
    /* Même placement classique après impôt sur les intérêts (prélevé chaque année sur le rendement) */
    res.impotInteretsPct = e.impotInteretsPct || 0;
    res.classiqueNet = Proj.placementClassique(pTotal, e.comparPct * (1 - res.impotInteretsPct / 100));
    return res;
  }

  /* Chiffres clés d'un scénario, pour le portefeuille, le comparateur et les exports */
  function resume(calc) {
    var s = calc.sim;
    return {
      revenu: s.revenu,
      investissementAnnuel: calc.investissement,
      investissementAv: calc.investissementAv,
      investissementCea: calc.investissementCea,
      economieAv: s.economieAv,
      economieCea: s.economieCea,
      capitalAv: calc.actif ? calc.medAv.capitalFinal : null,
      capitalCea: calc.actif ? (calc.medCea ? calc.medCea.capitalFinal : 0) : null,
      dureeAns: calc.etat.dureeAns,
      economie: s.economie,
      tauxReduction: s.tauxReduction,
      optimal: s.optimal,
      capitalPrudent: calc.actif ? calc.sc.prudent.capitalFinal : null,
      capitalMedian: calc.actif ? calc.med.capitalFinal : null,
      capitalDynamique: calc.actif ? calc.sc.dynamique.capitalFinal : null,
      capitalReel: calc.actif ? calc.med.capitalFinalReel : null,
      totalVerse: calc.actif ? calc.med.totalVerse : null,
      valeurTotale: calc.actif ? calc.valeurTotale : null,
      rendementEffectif: calc.actif ? calc.effectif : null,
      avantage: calc.actif ? calc.avantage : null
    };
  }

  return { DUREE_MAX: DUREE_MAX, SUPPORTS: SUPPORTS, defauts: defauts, erreurHypotheses: erreurHypotheses, calculer: calculer, resume: resume };
});
