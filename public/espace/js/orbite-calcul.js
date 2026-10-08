/*
 * Orbite — calculs croisés du profil (pur, sans navigateur, testé sous Node).
 * À partir d'un seul profil : salaire net, tranche d'impôt, effet d'une augmentation,
 * capacité d'emprunt (sur le net et sur le brut), suggestions d'épargne vie / CEA,
 * budget mensuel, faisabilité des projets et conseils d'orientation.
 * Dépend des moteurs : salaire (CalculSalaire, PARAMETRES_PAIE, EtatSimulation),
 * assurance vie (MoteurFiscal, Scenario). Aucune règle fiscale n'est dupliquée ici.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(
      require("../../moteurs/salaire/calcul.js"), require("../../moteurs/salaire/parametres.js"),
      require("../../moteurs/salaire/etat.js"), require("../../moteurs/vie/moteur-fiscal.js"),
      require("../../moteurs/vie/scenario.js")
    );
  } else {
    racine.OrbiteCalcul = fabrique(racine.CalculSalaire, racine.PARAMETRES_PAIE, racine.EtatSimulation, racine.MoteurFiscal, racine.Scenario);
  }
})(typeof self !== "undefined" ? self : this, function (C, P, E, MF, SC) {
  "use strict";

  /* Hypothèses par défaut des crédits types (modifiables dans le module Crédit). */
  var TMM = 7.5;
  var CREDITS_TYPES = [
    { cle: "immo", libelle: "Crédit immobilier", court: "Immobilier", dureeMois: 240, tauxPct: TMM + 2.5 },
    { cle: "immo25", libelle: "Crédit immobilier sur 25 ans", court: "Immobilier 25 ans", dureeMois: 300, tauxPct: TMM + 2.5 },
    { cle: "auto", libelle: "Crédit auto", court: "Auto", dureeMois: 60, tauxPct: TMM + 3 },
    { cle: "conso", libelle: "Crédit à la consommation", court: "Consommation", dureeMois: 36, tauxPct: 11 }
  ];
  var QUOTITE = 0.40;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var AGE_MAX = 70;
  var EPARGNE_DUREE = 10;
  var RENDEMENT_EPARGNE = 6;
  var PROJETS = {
    logement: { libelle: "Acheter un logement", credit: "immo", apportMin: 0.20 },
    terrain: { libelle: "Acheter un terrain", credit: "immo", apportMin: 0.30 },
    voiture: { libelle: "Acheter une voiture", credit: "auto", apportMin: 0.20 },
    travaux: { libelle: "Faire des travaux", credit: "conso", apportMin: 0 },
    etudes: { libelle: "Financer des études", credit: null },
    retraite: { libelle: "Préparer la retraite", credit: null },
    precaution: { libelle: "Constituer une épargne de précaution", credit: null },
    autre: { libelle: "Autre projet", credit: null }
  };

  function profilParDefaut() {
    return {
      prenom: "", anneeNaissance: 1990, situation: "celibataire", statut: "cdi", anciennete: 3,
      montant: 2500, sens: "brut", periode: "mensuel", secteur: "prive", nombreSalaires: 12,
      primesImposables: 0, primesNonCotisables: 0, avantagesNature: 0, indemnitesNonImposables: 0,
      chefDeFamille: false, enfants: 0, etudiants: 0, handicapes: 0, parents: 0,
      credits: [], contrats: [], projets: [],
      loyer: 0, chargesFixes: 0, epargneDisponible: 0, autresRevenus: 0,
      quotiteNet: QUOTITE, quotiteBrut: QUOTITE
    };
  }

  function nombre(v, def, min, max) {
    var n = Number(v);
    if (v === "" || v === null || v === undefined || !isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  function entier(v, def, min, max) { return Math.round(nombre(v, def, min, max)); }
  function choix(v, liste, def) { return liste.indexOf(v) !== -1 ? v : def; }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function anneeCourante(maintenant) { return (maintenant || new Date()).getFullYear(); }

  function normaliserCredit(c) {
    c = c || {};
    return {
      libelle: texte(c.libelle, 60) || "Crédit",
      type: choix(c.type, ["immo", "auto", "conso", "autre"], "autre"),
      mensualite: nombre(c.mensualite, 0, 0, 1e6),
      capitalRestant: nombre(c.capitalRestant, 0, 0, 1e8),
      tauxPct: nombre(c.tauxPct, 0, 0, 40),
      moisRestants: entier(c.moisRestants, 0, 0, 480)
    };
  }
  function normaliserContrat(c) {
    c = c || {};
    return {
      libelle: texte(c.libelle, 60) || "Contrat",
      type: choix(c.type, ["av", "cea"], "av"),
      versementMensuel: nombre(c.versementMensuel, 0, 0, 1e6),
      capitalActuel: nombre(c.capitalActuel, 0, 0, 1e8),
      anneeDebut: entier(c.anneeDebut, anneeCourante(), 1970, 2100)
    };
  }
  function normaliserProjet(c) {
    c = c || {};
    return {
      type: choix(c.type, Object.keys(PROJETS), "autre"),
      libelle: texte(c.libelle, 60),
      montant: nombre(c.montant, 0, 0, 1e8),
      horizonAns: entier(c.horizonAns, 3, 0, 40)
    };
  }

  /* Profil nettoyé : tout champ inconnu ou hors bornes reprend sa valeur par défaut. */
  function normaliser(p0) {
    var d = profilParDefaut(), p = p0 || {};
    function liste(v, fn, max) { return Array.isArray(v) ? v.slice(0, max).map(fn) : []; }
    return {
      prenom: texte(p.prenom, 40),
      anneeNaissance: entier(p.anneeNaissance, d.anneeNaissance, 1930, anneeCourante() - 16),
      situation: choix(p.situation, ["celibataire", "marie", "divorce", "veuf"], "celibataire"),
      statut: choix(p.statut, ["cdi", "cdd", "fonctionnaire", "contractuel", "autre"], "cdi"),
      anciennete: entier(p.anciennete, d.anciennete, 0, 50),
      montant: nombre(p.montant, d.montant, 0, 1e7),
      sens: p.sens === "net" ? "net" : "brut",
      periode: p.periode === "annuel" ? "annuel" : "mensuel",
      secteur: p.secteur === "public" ? "public" : "prive",
      nombreSalaires: entier(p.nombreSalaires, d.nombreSalaires, 12, 18),
      primesImposables: nombre(p.primesImposables, 0, 0, 1e6),
      primesNonCotisables: nombre(p.primesNonCotisables, 0, 0, 1e6),
      avantagesNature: nombre(p.avantagesNature, 0, 0, 1e6),
      indemnitesNonImposables: nombre(p.indemnitesNonImposables, 0, 0, 1e6),
      chefDeFamille: !!p.chefDeFamille,
      enfants: entier(p.enfants, 0, 0, 15),
      etudiants: entier(p.etudiants, 0, 0, 15),
      handicapes: entier(p.handicapes, 0, 0, 15),
      parents: entier(p.parents, 0, 0, 2),
      credits: liste(p.credits, normaliserCredit, 12),
      contrats: liste(p.contrats, normaliserContrat, 12),
      projets: liste(p.projets, normaliserProjet, 8),
      loyer: nombre(p.loyer, 0, 0, 1e6),
      chargesFixes: nombre(p.chargesFixes, 0, 0, 1e6),
      epargneDisponible: nombre(p.epargneDisponible, 0, 0, 1e9),
      autresRevenus: nombre(p.autresRevenus, 0, 0, 1e7),
      quotiteNet: nombre(p.quotiteNet, QUOTITE, 0.1, 0.8),
      quotiteBrut: nombre(p.quotiteBrut, QUOTITE, 0.1, 0.8)
    };
  }

  function age(p, maintenant) { return Math.max(16, anneeCourante(maintenant) - p.anneeNaissance); }

  /* État du simulateur de salaire correspondant au profil (format EtatSimulation). */
  function etatSalaire(p) {
    var e = E.etatParDefaut();
    ["sens", "secteur", "periode", "montant", "nombreSalaires", "chefDeFamille", "enfants", "etudiants", "handicapes", "parents",
     "primesImposables", "primesNonCotisables", "avantagesNature", "indemnitesNonImposables"].forEach(function (k) { e[k] = p[k]; });
    return e;
  }

  /* Entrée « brut » équivalente du moteur de salaire (le net saisi est d'abord converti). */
  function entreeBrut(p) {
    var entree = E.versEntree(etatSalaire(p));
    var inverse = null;
    if (p.sens === "net") {
      inverse = C.calculerDepuisNet(entree, P);
      var r0 = inverse.resultat;
      entree.montant = r0.periode === "annuel" ? r0.annuel.salaireBase : r0.annuel.salaireBase / r0.entree.nombreSalaires;
    }
    return { entree: entree, verifie: inverse ? inverse.verifie : true };
  }

  /* Tranche du barème IRPP pour un revenu imposable annuel. */
  function tranche(revenuImposable) {
    var b = P.irpp.bareme, i = 0;
    for (var k = 0; k < b.length; k++) if (revenuImposable > b[k].de) i = k;
    var suivante = b[i + 1] || null;
    return {
      index: i, taux: b[i].taux, de: b[i].de, a: suivante ? suivante.de : null,
      tauxSuivant: suivante ? suivante.taux : null,
      resteAvantSuivante: suivante ? Math.max(0, suivante.de - revenuImposable) : null
    };
  }

  function salaire(p) {
    var eb = entreeBrut(p);
    var av = C.calculerAvecVersements(eb.entree, P);
    var a = av.annee.annuel;
    return {
      entree: eb.entree,
      resultat: av.annee,
      versements: av.versements,
      netMensuel: av.versements.netMensuel,
      netAnnuel: a.netAPayer,
      netMoyen: a.netAPayer / 12,
      brutMensuel: av.versements.brutMensuel,
      brutAnnuel: a.brutTotal,
      cotisations: a.cotisations,
      irpp: a.irpp,
      css: a.css,
      coutEmployeur: a.coutEmployeur,
      revenuImposable: a.revenuImposable,
      /* Revenu de référence de l'assurance vie avant frais professionnels : brut − cotisations sociales */
      revenuFiscal: Math.max(0, a.brutTotal - a.cotisations),
      tranche: tranche(a.revenuImposable),
      tauxPrelevement: av.annee.indicateurs.tauxPrelevementGlobal,
      verifie: eb.verifie
    };
  }

  /* Salaire de base (même unité que la saisie) qui amène le revenu imposable au seuil donné. */
  function baseAuSeuil(entree, seuil) {
    var bas = entree.montant, haut = Math.max(entree.montant * 2, entree.montant + 1000);
    function ri(m) { return C.calculerDepuisBrut(Object.assign({}, entree, { montant: m }), P).annuel.revenuImposable; }
    var garde = 0;
    while (ri(haut) <= seuil && garde++ < 40) haut *= 2;
    for (var n = 0; n < 60; n++) {
      var m = (bas + haut) / 2;
      if (ri(m) > seuil) haut = m; else bas = m;
    }
    return haut;
  }

  /* Augmentation : net gagné, coût employeur et changement éventuel de tranche d'impôt.
     mode : "brut" (DT), "net" (DT) ou "pourcent" ; valeur exprimée dans l'unité de la saisie (mois ou an). */
  function augmentation(p0, mode, valeur) {
    var p = normaliser(p0);
    var eb = entreeBrut(p);
    var aug = C.simulerAugmentation(eb.entree, P, { mode: mode, valeur: valeur });
    var avantAn = C.calculerDepuisBrut(eb.entree, P);
    var apresAn = C.calculerDepuisBrut(Object.assign({}, eb.entree, { montant: aug.salaireBaseApres }), P);
    var tAvant = tranche(avantAn.annuel.revenuImposable), tApres = tranche(apresAn.annuel.revenuImposable);
    var hausseBase = aug.salaireBaseApres - eb.entree.montant;
    /* Hausse brute (même unité que la saisie) encore possible avant d'entrer dans la tranche suivante */
    var margeAvantTranche = null;
    if (tAvant.a !== null) margeAvantTranche = Math.max(0, baseAuSeuil(eb.entree, tAvant.a) - eb.entree.montant);
    return {
      calcul: aug,
      hausseBase: hausseBase,
      revenuImposableAvant: avantAn.annuel.revenuImposable,
      revenuImposableApres: apresAn.annuel.revenuImposable,
      trancheAvant: tAvant,
      trancheApres: tApres,
      changeTranche: tApres.index !== tAvant.index,
      tranchesFranchies: tApres.index - tAvant.index,
      margeAvantTranche: margeAvantTranche,
      /* Part du revenu supplémentaire imposée au nouveau taux (seule la part au-dessus du seuil l'est) */
      partAuNouveauTaux: tApres.index > tAvant.index ? apresAn.annuel.revenuImposable - tApres.de : 0,
      irppAvant: avantAn.annuel.irpp, irppApres: apresAn.annuel.irpp,
      tauxMarginalAvant: avantAn.indicateurs.tauxMarginalIrpp, tauxMarginalApres: apresAn.indicateurs.tauxMarginalIrpp
    };
  }

  /* Capital empruntable pour une mensualité donnée (annuité constante). */
  function capitalPourMensualite(m, tauxAnnuelPct, n) {
    if (!(m > 0) || !(n > 0)) return 0;
    var i = tauxAnnuelPct / 100 / 12;
    return i === 0 ? m * n : m * (1 - Math.pow(1 + i, -n)) / i;
  }
  function mensualitePourCapital(k, tauxAnnuelPct, n) {
    if (!(k > 0) || !(n > 0)) return 0;
    var i = tauxAnnuelPct / 100 / 12;
    return i === 0 ? k / n : k * i / (1 - Math.pow(1 + i, -n));
  }

  /* Taux du marché pour comparer les crédits déclarés (crédit « autre » : taux d'un crédit à la consommation). */
  var TAUX_MARCHE = { immo: TMM + 2.5, auto: TMM + 3, conso: 11, autre: 11 };

  /* Crédits en cours : ceux dont le taux est nettement inférieur au marché (à garder) ou supérieur (à renégocier). */
  function analyseTaux(p) {
    var bas = [], hauts = [];
    p.credits.forEach(function (c) {
      if (!(c.tauxPct > 0) || !(c.mensualite > 0)) return;
      var marche = TAUX_MARCHE[c.type] || 11;
      if (c.tauxPct <= marche - 2) bas.push({ libelle: c.libelle, tauxPct: c.tauxPct, marchePct: marche });
      else if (c.tauxPct >= marche - 0.5) hauts.push({ libelle: c.libelle, tauxPct: c.tauxPct, marchePct: marche });
    });
    return { bas: bas, hauts: hauts };
  }

  /* À quelle date l'endettement repasse sous la quotité, au fil de la fin des crédits en cours ? */
  function sortieEndettement(p, revenuMensuel, quotite) {
    var actifs = p.credits.filter(function (c) { return c.mensualite > 0; });
    var charges = actifs.reduce(function (t, c) { return t + c.mensualite; }, 0);
    if (!(revenuMensuel > 0) || charges <= revenuMensuel * quotite) return null;
    if (actifs.some(function (c) { return !(c.moisRestants > 0); })) return null;
    var tries = actifs.slice().sort(function (a, b) { return a.moisRestants - b.moisRestants; });
    var finis = [];
    for (var i = 0; i < tries.length; i++) {
      charges -= tries[i].mensualite;
      finis.push(tries[i].libelle);
      if (i + 1 < tries.length && tries[i + 1].moisRestants === tries[i].moisRestants) continue;
      if (charges <= revenuMensuel * quotite + 1e-9) {
        return { mois: tries[i].moisRestants, credits: finis.slice(), charges: Math.max(0, charges), taux: Math.max(0, charges) / revenuMensuel,
          mensualiteLiberee: Math.max(0, revenuMensuel * quotite - charges) };
      }
    }
    return null;
  }

  function chargesCredits(p) {
    return p.credits.reduce(function (s, c) { return s + (c.moisRestants === 0 && c.capitalRestant === 0 && c.mensualite === 0 ? 0 : c.mensualite); }, 0);
  }

  /* Capacité d'emprunt sur une base de revenu mensuel (net ou brut). */
  function capacite(revenuMensuel, quotite, charges, ageActuel) {
    var mensualiteMax = Math.max(0, revenuMensuel * quotite - charges);
    var moisMaxAge = Math.max(0, (AGE_MAX - ageActuel) * 12);
    return {
      revenu: revenuMensuel, quotite: quotite, charges: charges, mensualiteMax: mensualiteMax,
      tauxEndettementActuel: revenuMensuel > 0 ? charges / revenuMensuel : 0,
      credits: CREDITS_TYPES.map(function (t) {
        var n = Math.min(t.dureeMois, moisMaxAge);
        return {
          cle: t.cle, libelle: t.libelle, court: t.court, tauxPct: t.tauxPct, dureeMois: n, dureeLimitee: n < t.dureeMois,
          mensualite: n > 0 ? mensualiteMax : 0,
          capital: capitalPourMensualite(mensualiteMax, t.tauxPct, n)
        };
      })
    };
  }

  function versementsExistants(p) {
    var av = 0, cea = 0;
    p.contrats.forEach(function (c) { if (c.type === "cea") cea += c.versementMensuel * 12; else av += c.versementMensuel * 12; });
    return { av: av, cea: cea };
  }

  function simFiscale(s, p, av, cea) {
    return MF.simuler({ revenu: s.revenuFiscal, chef: p.chefDeFamille, enfants: p.enfants, infirmes: p.handicapes,
      etudiants: p.etudiants, parents: p.parents, investissementAv: av, investissementCea: cea });
  }

  /* Épargne : économie d'impôt supplémentaire et capital projeté pour un nouveau versement mensuel en assurance vie. */
  function epargnePour(versementMensuel, s, p) {
    var ex = versementsExistants(p);
    var ecoExistante = simFiscale(s, p, ex.av, ex.cea).economie;
    var ecoTotale = simFiscale(s, p, ex.av + versementMensuel * 12, ex.cea).economie;
    var e = Object.assign(SC.defauts(), {
      revenu: s.revenuFiscal, chef: p.chefDeFamille, enfants: p.enfants, infirmes: p.handicapes,
      etudiants: p.etudiants, parents: p.parents, frequence: "Mensuel", versement: versementMensuel,
      dureeAns: EPARGNE_DUREE, rendementPct: RENDEMENT_EPARGNE
    });
    var c = SC.calculer(e);
    var eco = Math.max(0, ecoTotale - ecoExistante);
    return {
      versementMensuel: versementMensuel,
      versementAnnuel: versementMensuel * 12,
      economieAnnuelle: eco,
      coutReelMensuel: Math.max(0, versementMensuel - eco / 12),
      capital: c.actif ? c.med.capitalFinal : 0,
      capitalPrudent: c.actif ? c.sc.prudent.capitalFinal : 0,
      dureeAns: EPARGNE_DUREE,
      rendementPct: RENDEMENT_EPARGNE
    };
  }

  function arrondiDix(v) { return Math.max(10, Math.round(v / 10) * 10); }

  /* Part de la marge mensuelle (net moyen − crédits − logement − épargne en cours) qu'une suggestion peut prendre. */
  var PART_MARGE_EPARGNE = 0.3;

  function suggestionsEpargne(s, p) {
    var ex = versementsExistants(p);
    var marge = s.netMoyen + p.autresRevenus - chargesCredits(p) - p.loyer - p.chargesFixes - (ex.av + ex.cea) / 12;
    var plafond = Math.max(10, Math.floor(Math.max(0, marge) * PART_MARGE_EPARGNE / 10) * 10);
    var base = simFiscale(s, p, ex.av, ex.cea);
    var avant = simFiscale(s, p, 0, 0);
    /* Assurance vie supplémentaire qui amène l'impôt au plancher légal, contrats existants compris */
    var complementAnnuel = Math.max(0, (base.optimal || 0) - ex.av);
    var net = s.netMoyen;
    var props = [
      { cle: "prudente", libelle: "Prudente", phrase: "5 % de votre net, sans vous priver.", mensuel: arrondiDix(net * 0.05) },
      { cle: "equilibree", libelle: "Équilibrée", phrase: "10 % de votre net, le repère le plus courant.", mensuel: arrondiDix(net * 0.10) }
    ];
    var mOptBudget = null;
    if (complementAnnuel > 120) {
      var mOpt = Math.min(complementAnnuel / 12, net * 0.25);
      mOptBudget = arrondiDix(mOpt);
      props.push({
        cle: "optimale", libelle: "Optimale pour l'impôt",
        phrase: mOpt < complementAnnuel / 12 - 0.5 ? "Le maximum utile pour l'impôt, plafonné à 25 % de votre net." : "Le versement qui réduit le plus votre impôt.",
        mensuel: mOptBudget
      });
    }
    /* Jamais plus que ce que le budget permet : au plus 30 % de la marge restante chaque mois. */
    props.forEach(function (x) {
      if (x.mensuel > plafond) {
        x.mensuel = plafond;
        x.plafonneBudget = true;
        x.phrase = "Ajustée à votre budget : 30 % de ce qui vous reste chaque mois après crédits et charges.";
      }
    });
    /* Deux propositions identiques après plafonnement : on ne garde que la première. */
    props = props.filter(function (x, i) { return !props.slice(0, i).some(function (y) { return y.mensuel === x.mensuel; }); });
    return {
      impotAvant: avant.impotAvant,
      economieContrats: base.economie,
      versementsExistants: ex,
      complementAnnuel: complementAnnuel,
      margeMensuelle: marge,
      plafondBudget: plafond,
      optimalSansContrainte: mOptBudget,
      plancherAtteint: complementAnnuel <= 120 && avant.impotAvant > 0,
      propositions: props.map(function (x) { return Object.assign(x, epargnePour(x.mensuel, s, p)); })
    };
  }

  /* Budget mensuel : comment le net se partage entre crédits, logement et charges, épargne et reste à vivre. */
  function budget(netMensuel, credits, logement, epargne) {
    var c = Math.max(0, credits || 0), l = Math.max(0, logement || 0), e = Math.max(0, epargne || 0);
    var reste = netMensuel - c - l - e;
    var total = Math.max(netMensuel, c + l + e, 1e-9);
    return {
      net: netMensuel, credits: c, logement: l, epargne: e, reste: reste,
      parts: { credits: c / total, logement: l / total, epargne: e / total, reste: Math.max(0, reste) / total },
      tauxEndettement: netMensuel > 0 ? c / netMensuel : 0,
      alerte: reste < 0 ? "deficit" : (netMensuel > 0 && c / netMensuel > QUOTITE ? "endettement" : null)
    };
  }

  /* Versement mensuel nécessaire pour réunir un capital en n mois (rendement annuel r %). */
  function versementPourCapital(capital, n, rPct) {
    if (!(capital > 0)) return 0;
    if (!(n > 0)) return capital;
    var i = rPct / 100 / 12;
    return i === 0 ? capital / n : capital * i / (Math.pow(1 + i, n) - 1);
  }

  /* Faisabilité d'un projet : crédit mobilisable, apport, effort d'épargne mensuel. */
  function projet(pr, cap, p, netMensuel) {
    var def = PROJETS[pr.type];
    var mois = pr.horizonAns * 12;
    var res = { type: pr.type, libelle: pr.libelle || def.libelle, montant: pr.montant, horizonAns: pr.horizonAns };
    if (def.credit) {
      var t = cap.credits.filter(function (c) { return c.cle === def.credit; })[0];
      var apportMin = pr.montant * def.apportMin;
      var apportPrevu = Math.min(p.epargneDisponible, pr.montant);
      var besoinCredit = Math.max(0, pr.montant - apportPrevu);
      var mensualite = mensualitePourCapital(besoinCredit, t.tauxPct, t.dureeMois);
      res.credit = { cle: t.cle, court: t.court, tauxPct: t.tauxPct, dureeMois: t.dureeMois, capitalMax: t.capital, besoin: besoinCredit, mensualite: mensualite };
      res.apportMin = apportMin;
      res.apportDisponible = apportPrevu;
      res.manqueApport = Math.max(0, apportMin - apportPrevu);
      res.financable = besoinCredit <= t.capital + 0.5 && res.manqueApport < 0.5;
      res.epargneMensuelle = versementPourCapital(Math.max(res.manqueApport, pr.montant - t.capital - apportPrevu, 0), mois, 3);
      res.statut = res.financable ? "ok" : (res.epargneMensuelle > 0 && mois > 0 && res.epargneMensuelle <= (netMensuel || 0) * 0.5 ? "a_preparer" : "hors_portee");
    } else {
      var reste = Math.max(0, pr.montant - p.epargneDisponible);
      res.epargneMensuelle = versementPourCapital(reste, mois, pr.type === "precaution" ? 2 : RENDEMENT_EPARGNE);
      res.statut = reste <= 0 ? "ok" : (res.epargneMensuelle <= (netMensuel || 0) * 0.5 ? "a_preparer" : "hors_portee");
    }
    return res;
  }

  /* Conseils d'orientation, classés du plus utile au moins utile. */
  function conseils(sy) {
    var p = sy.profil, s = sy.salaire, liste = [];
    function ajouter(niveau, module, titre, texte) { liste.push({ niveau: niveau, module: module, titre: titre, texte: texte }); }
    var cap = sy.capacite.net, endet = cap.tauxEndettementActuel;
    var taux = analyseTaux(p);
    function ent(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"); }
    function pct(x) { return String(Math.round(x * 10) / 10).replace(".", ","); }
    function liste_(noms) { return noms.length > 1 ? noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1] : noms[0]; }
    if (sy.budget.alerte === "deficit") ajouter(3, "budget", "Budget dépassé", "Vos dépenses fixes dépassent votre net. Commencez par revoir les charges" + (taux.hauts.length ? " ou renégocier un crédit." : "."));
    if (endet > p.quotiteNet) {
      var moyen = s.netMoyen + p.autresRevenus > 0 ? sy.chargesCredits / (s.netMoyen + p.autresRevenus) : endet;
      var txt = "Vos crédits en cours absorbent " + ent(endet * 100) + " % de votre salaire net mensuel";
      if (p.nombreSalaires > 12 && Math.round(moyen * 100) < Math.round(endet * 100)) txt += " (" + ent(moyen * 100) + " % en comptant vos " + p.nombreSalaires + " salaires sur l'année)";
      txt += " : la plupart des banques refuseront un nouveau crédit pour l'instant.";
      if (taux.hauts.length) txt += " Renégocier " + liste_(taux.hauts.map(function (c) { return "le " + c.libelle.toLowerCase(); })) + " peut libérer de la marge.";
      ajouter(3, "credit", "Endettement au-dessus de " + ent(p.quotiteNet * 100) + " %", txt);
      var sortie = sortieEndettement(p, cap.revenu, p.quotiteNet);
      if (sortie) {
        var ans = Math.floor(sortie.mois / 12), m = sortie.mois % 12;
        var duree = (ans ? ans + " an" + (ans > 1 ? "s" : "") : "") + (ans && m ? " et " : "") + (m ? m + " mois" : "");
        var date = "";
        if (sy.maintenant) { var d = new Date(sy.maintenant.getFullYear(), sy.maintenant.getMonth() + sortie.mois, 1); date = " (" + MOIS[d.getMonth()] + " " + d.getFullYear() + ")"; }
        ajouter(2, "credit", "Votre marge revient dans " + duree, "À la fin " + (sortie.credits.length > 1 ? "des crédits " : "du crédit ") + liste_(sortie.credits.map(function (x) { return x.toLowerCase().replace(/^crédit /, ""); })) + date +
          ", votre endettement tombera à " + ent(sortie.taux * 100) + " % : vous pourrez de nouveau emprunter, avec une mensualité possible d'environ " + ent(sortie.mensualiteLiberee) + " DT.");
      }
    }
    if (taux.bas.length) ajouter(2, "credit", "Des taux à garder", "Vos taux (" + liste_(taux.bas.map(function (c) { return pct(c.tauxPct) + " %"; }).filter(function (x, i, a) { return a.indexOf(x) === i; })) + ") sont bien inférieurs à ceux du marché (environ " + pct(taux.bas[0].marchePct) + " %) : inutile de renégocier, et ne remboursez pas ces crédits par anticipation. Votre épargne rapporte davantage ailleurs.");
    else if (p.credits.length && endet > 0) ajouter(1, "credit", "Marge d'endettement", "Vos crédits représentent " + ent(endet * 100) + " % de votre net ; il reste " + ent((p.quotiteNet - endet) * 100) + " points avant la limite habituelle.");
    if (sy.capacite.meilleure === "brut" && sy.capacite.brut.mensualiteMax - cap.mensualiteMax > 1) ajouter(2, "credit", "Comparez les banques", "Une banque qui calcule sur le brut vous prêterait davantage : la mensualité possible passe de " + ent(cap.mensualiteMax) + " à " + ent(sy.capacite.brut.mensualiteMax) + " DT.");
    var opt = sy.epargne.propositions.filter(function (x) { return x.cle === "optimale"; })[0];
    var meilleure = opt || sy.epargne.propositions[sy.epargne.propositions.length - 1];
    if (meilleure && meilleure.plafonneBudget && meilleure.economieAnnuelle > 50) {
      ajouter(2, "epargne", "Réduisez votre impôt, à votre rythme", "Dans votre budget actuel, un contrat vie de " + meilleure.versementMensuel + " DT par mois réduirait votre impôt de " + ent(meilleure.economieAnnuelle) + " DT par an" +
        (sy.epargne.optimalSansContrainte > meilleure.versementMensuel ? ". Le maximum utile (" + sy.epargne.optimalSansContrainte + " DT par mois) sera à viser quand vos crédits seront soldés." : "."));
    } else if (opt && opt.economieAnnuelle > 50) ajouter(2, "epargne", "Réduisez votre impôt", "Un contrat vie de " + opt.versementMensuel + " DT par mois réduirait votre impôt de " + ent(opt.economieAnnuelle) + " DT par an.");
    if (sy.epargne.plancherAtteint) ajouter(1, "epargne", "Avantage fiscal au maximum", "Vos contrats actuels réduisent déjà votre impôt au maximum autorisé : un versement de plus n'apporte plus d'économie d'impôt.");
    if (s.tranche.resteAvantSuivante !== null && s.tranche.resteAvantSuivante < 1500 && s.tranche.tauxSuivant) ajouter(1, "salaire", "Proche de la tranche suivante", "Il reste " + ent(s.tranche.resteAvantSuivante) + " DT de revenu imposable avant la tranche à " + ent(s.tranche.tauxSuivant * 100) + " %. Seule la part au-dessus sera taxée à ce taux.");
    if ((p.situation === "marie" || p.enfants > 0) && !p.chefDeFamille) ajouter(2, "salaire", "Chef de famille ?", "Si vous êtes le chef de famille au sens fiscal, cochez-le : 300 DT de déduction par an, plus les enfants à charge.");
    if (p.statut === "cdd" || p.statut === "contractuel") ajouter(1, "credit", "Contrat à durée déterminée", "Beaucoup de banques exigent un CDI ou une titularisation pour un crédit long ; préparez une attestation de l'employeur.");
    var precaution = s.netMoyen * 3;
    if (p.contrats.some(function (c) { return c.versementMensuel > 0 && !(c.capitalActuel > 0) && c.anneeDebut < anneeCourante(sy.maintenant); })) ajouter(1, "epargne", "Capital de vos contrats", "Indiquez le capital actuel de vos contrats vie dans votre profil : il compte dans votre épargne et dans vos projets.");
    if (p.epargneDisponible < precaution) ajouter(1, "epargne", "Épargne de précaution", "Visez environ trois mois de net de côté (" + ent(precaution) + " DT) avant d'investir à long terme.");
    sy.projets.forEach(function (pr) {
      if (pr.statut === "hors_portee") ajouter(2, pr.credit ? "credit" : "epargne", pr.libelle, "Ce projet dépasse aujourd'hui votre capacité" + (pr.epargneMensuelle > 0 ? " : il faudrait épargner " + ent(pr.epargneMensuelle) + " DT par mois" : "") + ". Allongez l'horizon, réduisez le montant ou augmentez l'apport.");
      else if (pr.statut === "a_preparer" && pr.epargneMensuelle > 0) ajouter(1, pr.credit ? "credit" : "epargne", pr.libelle, "Mettez de côté " + ent(pr.epargneMensuelle) + " DT par mois pendant " + pr.horizonAns + " an" + (pr.horizonAns > 1 ? "s" : "") + " pour le rendre possible.");
    });
    return liste.sort(function (a, b) { return b.niveau - a.niveau; });
  }

  /* Synthèse complète du profil, recalculée à chaque modification. */
  function synthese(p0, choix0, maintenant) {
    var p = normaliser(p0);
    var ch = choix0 || {};
    var ageActuel = age(p, maintenant);
    var s = salaire(p);
    var charges = chargesCredits(p);
    var capNet = capacite(s.netMensuel + p.autresRevenus, p.quotiteNet, charges, ageActuel);
    var capBrut = capacite(s.brutMensuel + p.autresRevenus, p.quotiteBrut, charges, ageActuel);
    var ep = suggestionsEpargne(s, p);
    var epChoisie = ep.propositions.filter(function (x) { return x.cle === (ch.epargne || "equilibree"); })[0] || ep.propositions[0];
    var epargneActuelle = p.contrats.reduce(function (t, c) { return t + c.versementMensuel; }, 0);
    var sy = {
      profil: p,
      age: ageActuel,
      salaire: s,
      chargesCredits: charges,
      capacite: { net: capNet, brut: capBrut, meilleure: capBrut.mensualiteMax > capNet.mensualiteMax ? "brut" : "net" },
      epargne: ep,
      epargneChoisie: epChoisie,
      /* Budget sur le net moyen : 13ᵉ mois et autres salaires répartis sur les 12 mois. */
      budget: budget(s.netMoyen + p.autresRevenus, charges + (ch.creditMensualite > 0 ? ch.creditMensualite : 0),
        p.loyer + p.chargesFixes, epargneActuelle + (ch.ajouterEpargne && epChoisie ? epChoisie.versementMensuel : 0))
    };
    sy.projets = p.projets.map(function (pr) { return projet(pr, capNet, p, s.netMensuel + p.autresRevenus); });
    sy.maintenant = maintenant || new Date();
    /* Capacité retrouvée à la fin des crédits qui dépassent la quotité (affichée quand elle est nulle aujourd'hui). */
    ["net", "brut"].forEach(function (b) {
      var c = sy.capacite[b], q = b === "net" ? p.quotiteNet : p.quotiteBrut;
      if (c.mensualiteMax >= 1) return;
      var so = sortieEndettement(p, c.revenu, q);
      if (!so) return;
      var d = new Date(sy.maintenant.getFullYear(), sy.maintenant.getMonth() + so.mois, 1);
      c.futur = { mois: so.mois, date: MOIS[d.getMonth()] + " " + d.getFullYear(), capacite: capacite(c.revenu, q, so.charges, ageActuel + Math.ceil(so.mois / 12)) };
    });
    sy.conseils = conseils(sy);
    return sy;
  }

  return {
    TMM: TMM, CREDITS_TYPES: CREDITS_TYPES, QUOTITE: QUOTITE, AGE_MAX: AGE_MAX, PROJETS: PROJETS,
    profilParDefaut: profilParDefaut, normaliser: normaliser, age: age, etatSalaire: etatSalaire, entreeBrut: entreeBrut,
    tranche: tranche, salaire: salaire, augmentation: augmentation,
    capitalPourMensualite: capitalPourMensualite, mensualitePourCapital: mensualitePourCapital, capacite: capacite,
    epargnePour: epargnePour, suggestionsEpargne: suggestionsEpargne, budget: budget, analyseTaux: analyseTaux, sortieEndettement: sortieEndettement,
    versementPourCapital: versementPourCapital, projet: projet, conseils: conseils, synthese: synthese
  };
});
