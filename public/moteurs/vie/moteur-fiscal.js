/* Moteur de calcul fiscal : fonctions pures, sans accès au DOM (testables sous Node). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./baremes.js'));
  else racine.MoteurFiscal = fabrique(racine.Baremes);
})(typeof self !== 'undefined' ? self : this, function (Baremes) {
  'use strict';

  var FACTEURS = { Mensuel: 12, Trimestriel: 4, Semestriel: 2, Annuel: 1 };

  function regles(cle) {
    var k = cle || Baremes.parDefaut;
    var r = Baremes.annees[k];
    if (!r) throw new Error('Barème inconnu : ' + k);
    return r;
  }

  function largeur(tranche) { return tranche.max === Infinity ? Infinity : tranche.max - tranche.min; }

  function detailDeductions(revenu, chefDeFamille, enfants, enfantsInfirmes, etudiants, parents, r) {
    var d = (r || regles()).deductions;
    return {
      fraisProfessionnels: Math.min(d.fraisProfessionnelsTaux * revenu, d.fraisProfessionnelsMax),
      chefDeFamille: chefDeFamille ? d.chefDeFamille : 0,
      enfants: Math.min(enfants * d.enfant, d.enfantsMax),
      enfantsInfirmes: enfantsInfirmes * d.enfantInfirme,
      etudiants: Math.min(etudiants * d.etudiant, d.etudiantsMax),
      parents: parents * d.parent
    };
  }

  function totalDeductions(det) {
    return det.fraisProfessionnels + det.chefDeFamille + det.enfants + det.enfantsInfirmes + det.etudiants + det.parents;
  }

  /* Impôt progressif par tranche, avec le détail de chacune */
  function impotDetaille(revenuNet, r) {
    var tranches = (r || regles()).tranches;
    var reste = Math.max(revenuNet, 0);
    var total = 0;
    var parTranche = tranches.map(function (t) {
      var montant = Math.min(reste, largeur(t));
      var impot = montant * t.taux;
      reste -= montant;
      total += impot;
      return { min: t.min, max: t.max, taux: t.taux, montant: montant, impot: impot };
    });
    return { total: total, parTranche: parTranche };
  }

  /* Ramène l'impôt au minimum légal en le répartissant sur les tranches, de la plus basse à la plus haute */
  function appliquerImpotMinimum(details, impotMinimum, r) {
    if (details.total >= impotMinimum) return details;
    var tranches = (r || regles()).tranches;
    var reste = impotMinimum;
    var ajuste = { total: 0, parTranche: [] };
    tranches.forEach(function (t) {
      var w = largeur(t);
      var impotMax = w === Infinity ? Infinity : w * t.taux;
      var impot = reste > 0 ? Math.min(reste, impotMax) : 0;
      ajuste.parTranche.push({ min: t.min, max: t.max, taux: t.taux, montant: t.taux > 0 ? impot / t.taux : 0, impot: impot });
      ajuste.total += impot;
      reste -= impot;
    });
    return ajuste;
  }

  /* Investissement qui ramène l'impôt au minimum légal */
  function investissementOptimal(revenuNet, impotInitial, r) {
    var rg = r || regles();
    if (revenuNet <= rg.tranches[0].max) {
      return { investissementOptimal: 0, revenuNetApres: revenuNet, impotApres: impotInitial };
    }
    var impotMin = rg.impotMinimumTaux * impotInitial;
    var netApres = 0;
    var reste = impotMin;
    for (var i = 0; i < rg.tranches.length; i++) {
      var t = rg.tranches[i];
      var w = largeur(t);
      var impotMaxTranche = w === Infinity ? Infinity : w * t.taux;
      if (reste <= impotMaxTranche) {
        netApres += t.taux > 0 ? reste / t.taux : 0;
        break;
      }
      netApres += w;
      reste -= impotMaxTranche;
    }
    return { investissementOptimal: Math.min(revenuNet - netApres, revenuNet), revenuNetApres: netApres, impotApres: impotMin };
  }

  function produits(r) {
    var p = (r || regles()).produits || {};
    return {
      av: p.av || { plafond: Infinity, impotMinimumTaux: (r || regles()).impotMinimumTaux, dureeMinimaleAns: 0 },
      cea: p.cea || { plafond: Infinity, impotMinimumTaux: (r || regles()).impotMinimumTaux, dureeBlocageAns: 0 }
    };
  }

  /* Impôt après déduction de l'assurance vie (av) et du CEA (cea), montants annuels bruts.
     Règles : chaque déduction est plafonnée ; l'impôt final ne descend jamais sous le minimum de l'assurance vie
     (45 %) ; la part de réduction due au CEA ne dépasse jamais (1 − 60 %) de l'impôt initial, de sorte qu'un CEA
     seul laisse au moins 60 % de l'impôt. Renvoie le détail par tranche ajusté et la part de chaque produit. */
  function impotApresDeductions(revenuNet, impotInitial, av, cea, r) {
    var rg = r || regles();
    var P = produits(rg);
    var dAv = Math.min(Math.max(av || 0, 0), P.av.plafond);
    var dCea = Math.min(Math.max(cea || 0, 0), P.cea.plafond);
    var minAv = impotInitial * P.av.impotMinimumTaux;
    var reductionCeaMax = impotInitial * (1 - P.cea.impotMinimumTaux);
    var apresAv = Math.max(impotDetaille(Math.max(revenuNet - dAv, 0), rg).total, dAv > 0 ? minAv : 0);
    if (dAv === 0) apresAv = impotInitial;
    var netApres = Math.max(revenuNet - dAv - dCea, 0);
    var details = impotDetaille(netApres, rg);
    var final = Math.max(details.total, dAv > 0 || dCea > 0 ? minAv : 0, dCea > 0 ? apresAv - reductionCeaMax : 0);
    final = Math.min(final, impotInitial);
    var ajuste = details.total < final - 1e-9 ? appliquerImpotMinimum(details, final, rg) : details;
    return {
      revenuNetApres: netApres, details: ajuste, total: ajuste.total,
      deductionAv: dAv, deductionCea: dCea,
      economieAv: Math.max(0, impotInitial - apresAv),
      economieCea: Math.max(0, apresAv - ajuste.total)
    };
  }

  /* Impôt après un investissement donné (plancher appliqué) */
  function impotApresInvestissement(revenuNet, impotInitial, investissement, r) {
    var a = impotApresDeductions(revenuNet, impotInitial, investissement, 0, r);
    return { revenuNetApres: a.revenuNetApres, details: a.details };
  }

  /* Assurance vie qui, avec le CEA donné, ramène l'impôt au minimum légal (plafond compris) */
  function complementAv(revenuNet, impotInitial, cea, rg) {
    var P = produits(rg);
    var cible = impotInitial * P.av.impotMinimumTaux;
    if (!(impotInitial > 0)) return 0;
    if (!(cea > 0)) {
      var opt = investissementOptimal(revenuNet, impotInitial, rg).investissementOptimal;
      return Math.min(opt, P.av.plafond);
    }
    var haut = Math.min(P.av.plafond, revenuNet);
    if (impotApresDeductions(revenuNet, impotInitial, haut, cea, rg).total > cible + 1e-7) return haut;
    var bas = 0;
    for (var n = 0; n < 200 && haut - bas > 1e-9; n++) {
      var m = (bas + haut) / 2;
      if (impotApresDeductions(revenuNet, impotInitial, m, cea, rg).total <= cible + 1e-7) haut = m; else bas = m;
    }
    return haut;
  }

  /* CEA au-delà duquel un dépôt supplémentaire ne réduit plus l'impôt (assurance vie donnée) */
  function ceaUtile(revenuNet, impotInitial, av, rg) {
    var P = produits(rg);
    if (!(impotInitial > 0)) return 0;
    var haut = Math.min(P.cea.plafond, revenuNet);
    var mini = impotApresDeductions(revenuNet, impotInitial, av, haut, rg).total;
    var bas = 0;
    for (var n = 0; n < 200 && haut - bas > 1e-9; n++) {
      var m = (bas + haut) / 2;
      if (impotApresDeductions(revenuNet, impotInitial, av, m, rg).total <= mini + 1e-7) haut = m; else bas = m;
    }
    return haut;
  }

  /* Simulation complète : entrée = saisies de l'utilisateur, sortie = tous les chiffres affichés.
     entree.investissementAv (ou investissement) et entree.investissementCea : montants annuels ;
     entree.leger = true : sans recherche du montant optimal ni du CEA utile (calculs répétés). */
  function simuler(entree, cle) {
    var rg = regles(cle);
    var P = produits(rg);
    var revenu = entree.revenu || 0;
    var det = detailDeductions(revenu, !!entree.chef, entree.enfants || 0, entree.infirmes || 0, entree.etudiants || 0, entree.parents || 0, rg);
    var deductions = totalDeductions(det);
    var revenuNet = Math.max(revenu - deductions, 0);
    var avant = impotDetaille(revenuNet, rg);
    var invAv = entree.investissementAv != null ? entree.investissementAv : (entree.investissement || 0);
    var invCea = entree.investissementCea || 0;
    var apres = impotApresDeductions(revenuNet, avant.total, invAv, invCea, rg);
    var economie = Math.max(0, avant.total - apres.total);
    return {
      regles: rg,
      produits: P,
      revenu: revenu,
      deductionsDetail: det,
      deductions: deductions,
      revenuNet: revenuNet,
      avant: avant,
      impotAvant: avant.total,
      impotMinimum: avant.total * P.av.impotMinimumTaux,
      impotMinimumCea: avant.total * P.cea.impotMinimumTaux,
      investissement: invAv + invCea,
      investissementAv: invAv,
      investissementCea: invCea,
      deductionAv: apres.deductionAv,
      deductionCea: apres.deductionCea,
      horsPlafondAv: Math.max(0, invAv - P.av.plafond),
      horsPlafondCea: Math.max(0, invCea - P.cea.plafond),
      revenuNetApres: apres.revenuNetApres,
      apres: apres.details,
      impotApres: apres.total,
      economie: economie,
      economieAv: apres.economieAv,
      economieCea: apres.economieCea,
      tauxReduction: avant.total > 0 ? economie / avant.total * 100 : 0,
      /* Assurance vie qui complète le CEA saisi pour atteindre le plancher */
      optimal: entree.leger ? null : complementAv(revenuNet, avant.total, invCea, rg),
      /* CEA au-delà duquel le dépôt ne réduit plus l'impôt, avec l'assurance vie saisie */
      ceaUtile: entree.leger ? null : ceaUtile(revenuNet, avant.total, invAv, rg)
    };
  }

  /* Économie d'impôt pour un investissement annuel en assurance vie donné, CEA saisi inchangé (courbe) */
  function economiePourInvestissement(sim, investissement) {
    var a = impotApresDeductions(sim.revenuNet, sim.impotAvant, investissement, sim.investissementCea || 0, sim.regles);
    return Math.max(0, sim.impotAvant - a.total);
  }

  /* Mode inverse : assurance vie annuelle minimale (CEA saisi inchangé) qui procure l'économie visée.
     Renvoie { possible, investissementAnnuel, economieMax }. */
  function investissementPourEconomie(sim, cible) {
    var economieMax = economiePourInvestissement(sim, Math.min(sim.produits.av.plafond, Math.max(sim.revenuNet, 0)));
    if (!(cible > 0)) return { possible: true, investissementAnnuel: 0, economieMax: economieMax };
    if (cible > economieMax + 0.0005) return { possible: false, investissementAnnuel: null, economieMax: economieMax };
    if (economiePourInvestissement(sim, 0) >= cible) return { possible: true, investissementAnnuel: 0, economieMax: economieMax };
    var bas = 0, haut = Math.max(sim.optimal, 1);
    for (var n = 0; n < 100; n++) {
      var milieu = (bas + haut) / 2;
      if (economiePourInvestissement(sim, milieu) >= cible) haut = milieu; else bas = milieu;
    }
    return { possible: true, investissementAnnuel: haut, economieMax: economieMax };
  }

  return {
    FACTEURS: FACTEURS,
    regles: regles,
    detailDeductions: detailDeductions,
    totalDeductions: totalDeductions,
    impotDetaille: impotDetaille,
    appliquerImpotMinimum: appliquerImpotMinimum,
    investissementOptimal: investissementOptimal,
    impotApresInvestissement: impotApresInvestissement,
    impotApresDeductions: impotApresDeductions,
    produits: produits,
    simuler: simuler,
    economiePourInvestissement: economiePourInvestissement,
    investissementPourEconomie: investissementPourEconomie
  };
});
