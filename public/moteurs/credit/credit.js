/*
 * Moteur de calcul du crédit bancaire — Tunisie
 * ---------------------------------------------
 * Fonctions pures extraites du simulateur de crédit
 * (public/outils/credit/js/app.js) : aucune dépendance au navigateur,
 * aucun accès au DOM. Mêmes formules, mêmes arrondis et mêmes cas limites
 * que l'application d'origine (vérifié par les tests de parité,
 * tests/credit/parite.test.js).
 *
 * Conventions :
 *  - montants arrondis au millime (3 décimales) à chaque étape ;
 *  - taux de période = taux annuel × p ÷ 12, arrondi à 6 décimales
 *    (p = 1, 3, 6 ou 12 mois) ;
 *  - taux exprimés en % (7.5 signifie 7,5 %), sauf mention contraire.
 *
 * Node : const M = require('.../credit.js') — navigateur : window.MoteurCredit.
 */
(function (racine, fabrique) {
  'use strict';
  var API = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = API;
  else racine.MoteurCredit = API;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===================================================================
     Constantes et paramètres par défaut
     =================================================================== */
  var PREC = 3;

  /** Périodicités possibles (p = nombre de mois par échéance). */
  var PERIODICITES = [
    { p: 1, nom: 'Mensuelle', echeance: 'Mensualité' },
    { p: 3, nom: 'Trimestrielle', echeance: 'Trimestrialité' },
    { p: 6, nom: 'Semestrielle', echeance: 'Semestrialité' },
    { p: 12, nom: 'Annuelle', echeance: 'Annuité' }
  ];

  /** Types d'amortissement. */
  var AMORTISSEMENTS = [
    { cle: 'constant', nom: 'Échéances constantes' },
    { cle: 'lineaire', nom: 'Amortissement constant' },
    { cle: 'infine', nom: 'In fine' }
  ];

  /** Types de crédit. */
  var TYPES = [
    { cle: 'immo', nom: 'Immobilier' },
    { cle: 'auto', nom: 'Auto' },
    { cle: 'conso', nom: 'Consommation' },
    { cle: 'libre', nom: 'Libre' }
  ];

  /**
   * Paramètres par défaut de l'agence (agenceDefaut() d'origine).
   * endettementMax et apportMin sont en % ; ageMax en années.
   * @returns {{tmm:number, ageMax:number, endettementMax:number, apportMin:number, types:Object}}
   */
  function defauts() {
    return {
      tmm: 7.5, ageMax: 70, endettementMax: 40, apportMin: 20,
      types: {
        immo: { duree: 20, mode: 'tmm', valeur: 2.5 },
        auto: { duree: 5, mode: 'tmm', valeur: 3 },
        conso: { duree: 3, mode: 'fixe', valeur: 11 }
      }
    };
  }
  var DEFAUTS = defauts();
  /** Préréglages par type : durée en années, taux « tmm » (TMM + valeur) ou « fixe ». */
  var PRESETS = DEFAUTS.types;

  /* ===================================================================
     Utilitaires numériques
     =================================================================== */
  /** Arrondi au millime (roundPrec d'origine). */
  function arrondi(v) { var p = Math.pow(10, PREC); return Math.round((v + Number.EPSILON) * p) / p; }
  /** Arrondi à 6 décimales (round6 d'origine). */
  function arrondi6(v) { return parseFloat(v.toFixed(6)); }
  /**
   * Échéance constante (non arrondie).
   * @param {number} rate taux de période (fraction, 0.00625 = 0,625 %)
   * @param {number} n nombre d'échéances
   * @param {number} pv capital
   */
  function pmt(rate, n, pv) { if (Math.abs(rate) < 1e-12) return pv / n; return pv * rate / (1 - Math.pow(1 + rate, -n)); }
  /**
   * Échéance constante arrondie au millime.
   * @param {number} cap capital
   * @param {number} tmPct taux de période en %
   * @param {number} n nombre d'échéances
   * @returns {number} NaN si les entrées sont invalides
   */
  function mensualite(cap, tmPct, n) {
    var r = tmPct / 100;
    if (!isFinite(cap) || !isFinite(r) || !isFinite(n) || n <= 0) return NaN;
    return arrondi(pmt(r, n, cap));
  }
  /** Taux mensuel en % (taux annuel ÷ 12, arrondi à 6 décimales). */
  function tauxMensuelPct(ta) { return parseFloat((ta / 12).toFixed(6)); }
  /** Taux de la période en % (taux annuel × p ÷ 12, arrondi à 6 décimales). */
  function tauxPeriodePct(ta, p) { return parseFloat((ta * p / 12).toFixed(6)); }
  /**
   * Nombre d'échéances nécessaires pour rembourser P avec une échéance M au taux r.
   * @param {number} r taux de période (fraction)
   * @returns {number} NaN si M ne couvre pas les intérêts
   */
  function nombreEcheances(r, M, P) {
    if (Math.abs(r) < 1e-12) return Math.max(1, Math.ceil(P / M - 1e-9));
    var x = 1 - r * P / M;
    if (x <= 0) return NaN;
    return Math.max(1, Math.ceil(-Math.log(x) / Math.log(1 + r) - 1e-9));
  }
  /** Date locale « AAAA-MM-JJ » → Date (ou null). */
  function lireDate(v) {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    var p = v.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  /** Informations d'une périodicité. */
  function infoPeriodicite(p) { return PERIODICITES.filter(function (x) { return x.p === p; })[0] || PERIODICITES[0]; }

  /**
   * Frais totaux : dossier (% du capital et/ou fixe), garantie, autres.
   * @param {{capital:number, frais?:{dossierPct?:number, dossierFixe?:number, garantie?:number, autres?:number}}} e
   */
  function fraisTotal(e) {
    var f = e.frais;
    if (!f) return 0;
    return arrondi((f.dossierPct || 0) * e.capital / 100 + (f.dossierFixe || 0) + (f.garantie || 0) + (f.autres || 0));
  }

  /* ===================================================================
     Échéancier
     =================================================================== */
  /**
   * Tableau d'amortissement complet (calculerEcheancier d'origine).
   *
   * @param {Object} e entrée
   * @param {number} e.capital capital emprunté
   * @param {number} e.mois durée en mois (multiple de la périodicité)
   * @param {number} e.taux taux nominal annuel en %
   * @param {string} [e.dateDebut] « AAAA-MM-JJ » : date de la 1re échéance
   * @param {number} [e.periodicite=1] 1, 3, 6 ou 12
   * @param {'constant'|'lineaire'|'infine'} [e.amort='constant']
   * @param {{mois:number, type:'partiel'|'total'}} [e.differe] différé compris dans la durée
   * @param {{delta:number, des:number}} [e.variation] variation du taux (points) dès l'échéance « des »
   * @param {Array<{apres:number, total:boolean, montant:number}>} [e.ras] remboursements anticipés ponctuels
   * @param {{montant:number, frequence:'periode'|'annee', des:number}} [e.versement] versements réguliers
   * @param {number} [e.indemnite=0] indemnité de remboursement anticipé en %
   * @param {'duree'|'mensualite'} [e.raMode='duree'] effet des remboursements anticipés
   * @param {{taux:number, base:'initial'|'crd'}} [e.assurance] assurance annuelle en %
   * @param {{dossierPct?:number, dossierFixe?:number, garantie?:number, autres?:number}} [e.frais]
   * @param {number} [e.dureeTotale] durée initiale (règle des 84 mois) si différente de e.mois
   * @param {boolean} [reduire] appliquer la règle de réduction de moitié du taux
   *   (par défaut : e.reduction)
   * @returns {Object} { lignes, paliers, M1, M2, ta2, reductions, totI, totP, totM, totIndem,
   *   totAss, totRA, frais, coutTotal, coutCredit, n, nPrevu, C, p, amort, D, diffTotal, tm,
   *   debut, ras, reduc, reducDemandee, teg }
   */
  function echeancier(e, reduire) {
    if (reduire === undefined) reduire = !!e.reduction;
    var C = e.capital, p = e.periodicite || 1, amort = e.amort || 'constant';
    var nFin = Math.round(e.mois / p);
    var D = e.differe ? Math.round(e.differe.mois / p) : 0, diffTotal = !!(e.differe && e.differe.type === 'total');
    var debut = lireDate(e.dateDebut);
    var v = e.variation || null;
    var ras = e.ras || [], vers = e.versement || null, indemPct = e.indemnite || 0, modeRa = e.raMode === 'mensualite' ? 'mensualite' : 'duree';
    var ass = e.assurance || null;
    /* Réduction de moitié du taux (crédit de plus de 84 mois) : avant chaque
       échéance testée, intérêts des 36 derniers mois / capital restant dû
       strictement supérieur à 8 %. Premier test à l'échéance 37 ; en cas
       d'échec, nouveau test à l'échéance suivante (fenêtre glissante) ;
       après une réduction, prochain test 36 mois plus tard. */
    var fen = 36 / p;
    var reduc = !!reduire && (e.dureeTotale || e.mois) > 84 && fen === Math.round(fen);
    var parAn = 12 / p;
    var lignes = [], paliers = [], raListe = [], reductions = [];
    var reste = C, totI = 0, totP = 0, totM = 0, totIndem = 0, totAss = 0, totRA = 0;
    var M = NaN, P = NaN, tmCourant = NaN, recalcul = false, fini = false, M2 = null, apresRa = false;
    var facteur = 1, prochainTest = fen + 1, int36 = 0;

    function tauxBase(k) {
      var ta = e.taux + (v && k >= v.des ? v.delta : 0);
      return ta < 0 ? 0 : ta;
    }
    function tauxDuPeriode(k) { return tauxBase(k) * facteur; }
    /* Taux réduit non arrondi, comme dans la version d'origine */
    function tmDuPeriode(k) { var ta = tauxDuPeriode(k); return facteur < 1 ? ta * p / 12 : tauxPeriodePct(ta, p); }

    for (var k = 1; k <= nFin && !fini; k++) {
      var nouvelleReduc = false, test = null;
      if (reduc && k >= prochainTest && k > D) {
        var ratioT = reste > 0 ? int36 / reste : 0;
        test = { ratio: ratioT, ok: ratioT > 0.08 };
        lignes[k - 2].test = test;
        if (test.ok) {
          var avant = tauxDuPeriode(k);
          facteur /= 2;
          nouvelleReduc = true;
          prochainTest = k + fen;
          reductions.push({ mois: k, date: debut ? new Date(debut.getFullYear(), debut.getMonth() + (k - 1) * p, 1) : null,
            avant: avant, apres: tauxDuPeriode(k), ratio: ratioT, interets: int36, reste: reste, M: NaN });
        } else prochainTest = k + 1;
      }
      var tm = tmDuPeriode(k), r = tm / 100;
      var enDiff = k <= D;
      var resteAvant = reste;
      var interet = arrondi(reste * r);
      var principal, paiement;
      if (enDiff) {
        if (diffTotal) { principal = arrondi(-interet); paiement = 0; }
        else { principal = 0; paiement = interet; }
      } else {
        if (k === D + 1 || tm !== tmCourant || recalcul || nouvelleReduc) {
          if (amort === 'constant') M = mensualite(reste, tm, nFin - k + 1);
          else if (amort === 'lineaire' && (k === D + 1 || recalcul)) P = arrondi(reste / (nFin - k + 1));
          tmCourant = tm;
          recalcul = false;
          if (nouvelleReduc && amort === 'constant') { reductions[reductions.length - 1].M = M; if (M2 === null) M2 = M; }
          if (amort === 'constant' && (!paliers.length || paliers[paliers.length - 1].M !== M)) paliers.push({ mois: k, M: M, taux: tauxDuPeriode(k) });
        }
        if (amort === 'constant') { principal = arrondi(M - interet); paiement = M; }
        else if (amort === 'lineaire') { principal = P; paiement = arrondi(P + interet); }
        else { principal = 0; paiement = interet; }
        if (k === nFin || ((apresRa || amort === 'lineaire') && principal >= reste)) {
          principal = arrondi(reste);
          paiement = arrondi(interet + principal);
          fini = true;
        }
      }
      reste = arrondi(reste - principal);
      var prime = ass ? arrondi((ass.base === 'crd' ? resteAvant : C) * ass.taux / 100 * p / 12) : 0;
      totI = arrondi(totI + interet);
      totP = arrondi(totP + principal);
      totM = arrondi(totM + paiement + prime);
      totAss = arrondi(totAss + prime);
      var ligne = {
        mois: k,
        date: debut ? new Date(debut.getFullYear(), debut.getMonth() + (k - 1) * p, 1) : null,
        paiement: paiement, interet: interet, principal: principal, assurance: prime, reste: reste,
        reduit: facteur < 1, reduction: nouvelleReduc ? reductions.length : 0, revise: !!(v && k === v.des), differe: enDiff
      };
      lignes.push(ligne);
      int36 = arrondi(int36 + interet - (k > fen ? lignes[k - 1 - fen].interet : 0));

      /* Remboursements anticipés ponctuels et versements réguliers, après l'échéance k */
      if (!fini && reste > 0) {
        var verse = 0, limite = false;
        ras.forEach(function (x) {
          var dispo = arrondi(reste - verse);
          if (x.apres !== k || dispo <= 0) return;
          var mt = x.total ? dispo : Math.min(x.montant, dispo);
          if (!x.total && x.montant > dispo + 0.0005) limite = true;
          verse = arrondi(verse + mt);
        });
        if (vers && k >= vers.des && (vers.frequence === 'periode' || (k - vers.des) % parAn === 0)) {
          var dispo2 = arrondi(reste - verse);
          if (dispo2 > 0) verse = arrondi(verse + Math.min(vers.montant, dispo2));
        }
        if (verse > 0) {
          var indem = arrondi(verse * indemPct / 100);
          reste = arrondi(reste - verse);
          totP = arrondi(totP + verse);
          totM = arrondi(totM + verse + indem);
          totIndem = arrondi(totIndem + indem);
          totRA = arrondi(totRA + verse);
          ligne.ra = { montant: verse, indemnite: indem, reste: reste, limite: limite };
          raListe.push({ mois: k, date: ligne.date, montant: verse, indemnite: indem, limite: limite });
          apresRa = true;
          if (reste <= 0) fini = true;
          else if (k >= D) {
            if (modeRa === 'duree' && amort === 'constant' && isFinite(M)) {
              var kc = nombreEcheances(tmDuPeriode(k + 1) / 100, M, reste);
              if (isFinite(kc)) nFin = k + kc; else recalcul = true;
            } else if (modeRa === 'duree' && amort === 'lineaire' && P > 0) {
              nFin = k + Math.max(1, Math.ceil(reste / P - 1e-9));
            } else if (amort !== 'infine') recalcul = true;
          }
        }
      }
    }

    if (reduc) {
      var cumul = 0;
      lignes.forEach(function (l, i) {
        cumul = arrondi(cumul + l.interet - (i >= fen ? lignes[i - fen].interet : 0));
        l.int36 = i + 1 >= fen ? cumul : null;
        var crd = resteFin(l);
        l.ratio = i + 1 >= fen && crd > 0 ? cumul / crd : null;
      });
    }
    var frais = fraisTotal(e);
    var premiere = lignes[Math.min(D, lignes.length - 1)];
    var res = {
      lignes: lignes, paliers: paliers,
      M1: amort === 'constant' && paliers.length ? paliers[0].M : (premiere ? premiere.paiement : NaN),
      M2: M2, ta2: reductions.length ? reductions[0].apres : null, reductions: reductions,
      totI: totI, totP: totP, totM: totM, totIndem: totIndem, totAss: totAss, totRA: totRA, frais: frais,
      coutTotal: arrondi(C + totI + totAss + totIndem + frais),
      coutCredit: arrondi(totI + totAss + totIndem + frais),
      n: lignes.length, nPrevu: Math.round(e.mois / p), C: C, p: p, amort: amort, D: D, diffTotal: diffTotal,
      tm: tauxPeriodePct(e.taux, p), debut: debut, ras: raListe, reduc: reduc && reductions.length > 0, reducDemandee: reduc
    };
    res.teg = teg(res);
    return res;
  }

  /**
   * TEG en % : taux actuariel de période des flux réels (capital moins frais,
   * échéances, assurance, remboursements anticipés et indemnités), trouvé par
   * dichotomie sur [-90 % ; 200 %] (200 itérations), × nombre de périodes par an.
   * @param {{C:number, frais:number, lignes:Array, p:number}} r résultat d'echeancier
   * @returns {number} NaN si aucune racine dans l'intervalle
   */
  function teg(r) {
    var flux = [r.C - r.frais];
    r.lignes.forEach(function (l) { flux.push(-(l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0))); });
    function van(i) {
      var s = 0, f = 1;
      for (var t = 0; t < flux.length; t++) { s += flux[t] / f; f *= 1 + i; }
      return s;
    }
    var bas = -0.9, haut = 2;
    var vb = van(bas), vh = van(haut);
    if (!isFinite(vb) || !isFinite(vh) || vb * vh > 0) return NaN;
    for (var it = 0; it < 200; it++) {
      var mil = (bas + haut) / 2, vm = van(mil);
      if (vb * vm <= 0) haut = mil; else { bas = mil; vb = vm; }
    }
    return (bas + haut) / 2 * (12 / r.p) * 100;
  }

  /** Capital restant dû après la ligne (après un éventuel remboursement anticipé). */
  function resteFin(l) { return l.ra ? l.ra.reste : l.reste; }
  /** Échéance + assurance de la ligne. */
  function totalLigne(l) { return arrondi(l.paiement + l.assurance); }
  /** Première échéance hors différé (ou dernière ligne). */
  function premiereLigne(r) { return r.lignes[Math.min(r.D, r.lignes.length - 1)]; }

  /**
   * Regroupement annuel de l'échéancier (assurance et remboursements anticipés
   * inclus dans « paiement »).
   * @param {Object} res résultat d'echeancier
   * @returns {Array<{annee, debut, fin, paiement, interet, principal, assurance, reste, reduit, differe, nb, ra}>}
   */
  function agregerAnnuel(res) {
    var out = [], parAn = 12 / (res.p || 1);
    for (var i = 0; i < res.lignes.length; i += parAn) {
      var g = res.lignes.slice(i, i + parAn);
      var der = g[g.length - 1];
      var a = { annee: i / parAn + 1, debut: g[0].date, fin: der.date, paiement: 0, interet: 0, principal: 0, assurance: 0, reste: resteFin(der), reduit: false, differe: false, nb: g.length, ra: null };
      g.forEach(function (l) {
        a.paiement = arrondi(a.paiement + l.paiement + l.assurance);
        a.interet = arrondi(a.interet + l.interet);
        a.principal = arrondi(a.principal + l.principal);
        a.assurance = arrondi(a.assurance + l.assurance);
        if (l.ra) {
          a.paiement = arrondi(a.paiement + l.ra.montant + l.ra.indemnite);
          a.principal = arrondi(a.principal + l.ra.montant);
          a.ra = l.ra;
        }
        if (l.reduit) a.reduit = true;
        if (l.differe) a.differe = true;
      });
      out.push(a);
    }
    return out;
  }

  /**
   * Valeur actuelle des remboursements, actualisés au taux d'inflation annuel (en %),
   * frais ajoutés sans actualisation (analyse visuelle d'origine).
   */
  function valeurActuelle(r, inflation) {
    var im = Math.pow(1 + inflation / 100, 1 / 12) - 1, va = 0;
    r.lignes.forEach(function (l) {
      var flux = l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0);
      va += flux / Math.pow(1 + im, l.mois * r.p);
    });
    return arrondi(va + r.frais);
  }

  /* ===================================================================
     Préréglages, TMM
     =================================================================== */
  /**
   * Durée et taux préréglés d'un type de crédit (appliquerType d'origine).
   * @param {'immo'|'auto'|'conso'} cle
   * @param {Object} [agence=DEFAUTS] paramètres { tmm, types }
   * @returns {{type, mois, annees, taux, tmm:{tmm,marge}|null}|null}
   */
  function appliquerPreset(cle, agence) {
    agence = agence || DEFAUTS;
    var p = agence.types[cle];
    if (!p) return null;
    var tmm = p.mode === 'tmm' ? { tmm: agence.tmm, marge: p.valeur } : null;
    return { type: cle, annees: p.duree, mois: Math.round(p.duree * 12), taux: tmm ? arrondi6(agence.tmm + p.valeur) : p.valeur, tmm: tmm };
  }
  /** Taux appliqué = TMM + marge (arrondi à 6 décimales). */
  function tauxTmm(tmm, marge) { return arrondi6(tmm + marge); }

  /**
   * Sensibilité au TMM : échéance et intérêts si le TMM varie de −1, −0,5, 0,
   * +0,5, +1, +2 points dès aujourd'hui (variation future ignorée).
   * @param {Object} e entrée d'echeancier avec e.tmm = {tmm, marge}
   * @param {boolean} [reduire]
   * @param {number[]} [ecarts=[-1,-0.5,0,0.5,1,2]]
   * @returns {Array<{d, tmm, taux, M, dM, I, dI}>|null} null sans TMM
   */
  function sensibiliteTmm(e, reduire, ecarts) {
    if (!e.tmm) return null;
    if (reduire === undefined) reduire = !!e.reduction;
    var base = Object.assign({}, e, { variation: null });
    var ref = echeancier(base, reduire);
    return (ecarts || [-1, -0.5, 0, 0.5, 1, 2]).map(function (d) {
      var ta = Math.max(0, arrondi6(e.taux + d));
      var x = d === 0 ? ref : echeancier(Object.assign({}, base, { taux: ta }), reduire);
      return { d: d, tmm: Math.max(0, arrondi6(e.tmm.tmm + d)), taux: ta, M: x.M1, dM: arrondi(x.M1 - ref.M1), I: x.totI, dI: arrondi(x.totI - ref.totI) };
    });
  }

  /* ===================================================================
     Remboursements anticipés
     =================================================================== */
  /**
   * Effet des remboursements anticipés (carte « Remboursements anticipés »).
   * @param {Object} e entrée d'echeancier avec e.ras et/ou e.versement
   * @param {boolean} [reduire]
   * @returns {{avec, sans, totRA, totIndem, economie, gainNet, effet:'solde'|'duree'|'mensualite'|null,
   *   soldeApres?, nouvelleDuree?, ancienneDuree?, moisGagnes?, echeanceApres?, echeanceSans?, limite:boolean}}
   */
  function remboursementAnticipe(e, reduire) {
    if (reduire === undefined) reduire = !!e.reduction;
    var r = echeancier(e, reduire);
    var b = echeancier(Object.assign({}, e, { ras: [], versement: null }), reduire);
    var eco = arrondi((b.totI + b.totAss) - (r.totI + r.totAss)), gain = arrondi(eco - r.totIndem);
    var out = { avec: r, sans: b, totRA: r.totRA, totIndem: r.totIndem, economie: eco, gainNet: gain, effet: null,
      limite: r.ras.some(function (x) { return x.limite; }) };
    if (!r.ras.length) return out;
    var der = r.lignes[r.lignes.length - 1];
    if (der.ra && der.ra.reste <= 0) { out.effet = 'solde'; out.soldeApres = der.mois; }
    else if (e.raMode !== 'mensualite' && r.amort !== 'infine') {
      out.effet = 'duree'; out.nouvelleDuree = r.n; out.ancienneDuree = b.n; out.moisGagnes = (b.n - r.n) * r.p;
    } else {
      out.effet = 'mensualite';
      var dernierRa = r.ras[r.ras.length - 1].mois, l1 = r.lignes[dernierRa], l0 = b.lignes[dernierRa];
      out.echeanceApres = l1 ? l1.paiement : null;
      out.echeanceSans = l0 ? l0.paiement : null;
    }
    return out;
  }

  /**
   * Analyse de la réduction de taux (bouton « Réduire le taux ») : conditions
   * (durée > 84 mois, ratio > 8 %), réductions obtenues et économie d'intérêts.
   * @param {Object} e entrée d'echeancier
   * @returns {{modalitesOk:boolean, dureeOk:boolean, ratio37:number, reductions:Array, eligible:boolean, economie:number, avec, sans}}
   */
  function analyseReduction(e) {
    var x = echeancier(e, true), sans = echeancier(e, false);
    var l36 = x.lignes[35], ratio37 = l36 && l36.ratio != null ? l36.ratio : NaN;
    var condDuree = e.mois > 84, nb = x.reductions.length;
    /* Le bouton d'origine refuse les crédits non mensuels, non constants ou avec différé */
    var modalitesOk = (e.periodicite || 1) === 1 && (e.amort || 'constant') === 'constant' && !e.differe;
    return { modalitesOk: modalitesOk, dureeOk: condDuree, ratio37: ratio37, reductions: x.reductions, eligible: modalitesOk && condDuree && nb > 0,
      economie: arrondi(sans.totI - x.totI), avec: x, sans: sans };
  }

  /* ===================================================================
     Emprunteur : capacité, éligibilité, budget
     =================================================================== */
  /**
   * Capacité d'emprunt : mensualité maximale = revenu × quotité − charges,
   * capital = valeur actuelle de cette mensualité au taux mensuel
   * (taux annuel ÷ 12, non arrondi, comme l'outil d'origine).
   *
   * Nouveauté : base « brut » (quotité appliquée au salaire mensuel brut) en plus
   * de la base « net » ; durée plafonnée pour que l'âge en fin de crédit ≤ ageMax.
   *
   * @param {Object} o
   * @param {number} [o.revenuNet] revenu mensuel net
   * @param {number} [o.revenuBrut] revenu mensuel brut
   * @param {'net'|'brut'} [o.base='net']
   * @param {number} [o.quotite=0.40] part maximale du revenu (fraction)
   * @param {number} [o.charges=0] charges mensuelles existantes (autres crédits…)
   * @param {number} o.dureeMois durée souhaitée (arrondie au mois)
   * @param {number} o.tauxAnnuelPct taux annuel en %
   * @param {number} [o.ageActuel] âge de l'emprunteur (années)
   * @param {number} [o.ageMax=70]
   * @returns {{valide:boolean, motif?:'entrees-incompletes'|'charges-trop-elevees'|'age-max-atteint',
   *   base, revenu, quotite, charges, capaciteEndettement, mensualiteMax, dureeDemandee, duree, dureeMois,
   *   dureeMaxAge, dureeLimiteeParAge, montant, capital, horsLimite}}
   *   montant = capital (arrondi au millime) ; duree = dureeMois (après plafonnement par l'âge).
   */
  function capaciteEmprunt(o) {
    o = o || {};
    var base = o.base === 'brut' ? 'brut' : 'net';
    var rev = base === 'brut' ? o.revenuBrut : o.revenuNet;
    var quotite = o.quotite != null ? o.quotite : DEFAUTS.endettementMax / 100;
    var ch = isFinite(o.charges) ? o.charges : 0;
    var dur = o.dureeMois, taux = o.tauxAnnuelPct;
    var ageMax = o.ageMax != null ? o.ageMax : DEFAUTS.ageMax;
    var out = { valide: false, base: base, revenu: rev, quotite: quotite, charges: ch, mensualiteMax: 0, capital: 0, montant: 0, dureeMois: 0, duree: 0 };
    if (!(rev > 0) || !(dur > 0) || !isFinite(taux) || taux < 0 || !(quotite > 0)) { out.motif = 'entrees-incompletes'; return out; }
    dur = Math.round(dur);
    out.dureeDemandee = dur;
    out.dureeMaxAge = null;
    out.dureeLimiteeParAge = false;
    if (o.ageActuel != null && isFinite(o.ageActuel)) {
      var dMax = Math.floor((ageMax - o.ageActuel) * 12 + 1e-9);
      out.dureeMaxAge = Math.max(0, dMax);
      if (dur > dMax) { dur = Math.max(0, dMax); out.dureeLimiteeParAge = true; }
    }
    out.duree = out.dureeMois = dur;
    var capEnd = rev * quotite;
    var mMax = capEnd - ch;
    out.capaciteEndettement = arrondi(capEnd);
    out.mensualiteMax = arrondi(mMax);
    out.valide = true;
    out.horsLimite = dur > 300;
    if (mMax <= 0) { out.motif = 'charges-trop-elevees'; out.mensualiteMax = 0; return out; }
    if (dur <= 0) { out.motif = 'age-max-atteint'; return out; }
    var i = taux / 100 / 12;
    var montant = i === 0 ? mMax * dur : mMax * ((1 - Math.pow(1 + i, -dur)) / i);
    out.montant = out.capital = arrondi(montant);
    return out;
  }

  /**
   * Éligibilité (panneau « Éligibilité ») : apport, âge en fin de crédit,
   * taux d'endettement et reste à vivre.
   * @param {Object} e entrée d'echeancier ; e.apport = {prix, apport},
   *   e.emprunteur = {age, revenus, charges}
   * @param {Object} [r] résultat d'echeancier (calculé sinon)
   * @param {Object} [regles=DEFAUTS] { ageMax, endettementMax, apportMin }
   * @returns {{apport, age, endettement, resteAVivre, eligible:boolean}}
   *   chaque critère vaut null s'il ne s'applique pas ; resteAVivre.ok vaut
   *   null (indication) s'il est positif, false sinon.
   */
  function eligibilite(e, r, regles) {
    regles = Object.assign({}, DEFAUTS, regles || {});
    if (!r) r = echeancier(e);
    var out = { apport: null, age: null, endettement: null, resteAVivre: null };
    if (e.apport) {
      var pct = e.apport.apport / e.apport.prix * 100;
      out.apport = { pct: pct, min: regles.apportMin, ok: pct >= regles.apportMin };
    }
    var em = e.emprunteur;
    if (em && em.age != null) {
      var fin = em.age + e.mois / 12;
      out.age = { fin: fin, max: regles.ageMax, ok: fin <= regles.ageMax };
    }
    if (em && em.revenus) {
      var charges = em.charges || 0;
      var mensuel = arrondi(totalLigne(premiereLigne(r)) / r.p);
      var endet = (mensuel + charges) / em.revenus * 100;
      out.endettement = { taux: endet, max: regles.endettementMax, mensuel: mensuel, ok: endet <= regles.endettementMax };
      var rav = arrondi(em.revenus - charges - mensuel);
      out.resteAVivre = { montant: rav, ok: rav > 0 ? null : false };
    }
    out.eligible = [out.apport, out.age, out.endettement, out.resteAVivre].every(function (x) { return !x || x.ok !== false; });
    return out;
  }

  /**
   * Étape « Budget » et conseils de la simulation guidée.
   * @param {Object} g { type, prix, apport, montant, ans, taux, revenus, charges, age }
   *   (pour immo/auto : capital = prix − apport ; sinon capital = montant)
   * @param {Object} [regles=DEFAUTS]
   * @returns {{capital, resultat, endettement, ok, mensualiteMax?, capitalMax?, dureeNecessaire?,
   *   chargesTropElevees?, ageFin?, ageDepasse:boolean, apportInsuffisant:boolean}|null}
   */
  function budgetGuide(g, regles) {
    regles = Object.assign({}, DEFAUTS, regles || {});
    var C = (g.type === 'immo' || g.type === 'auto') ? (g.prix > 0 ? arrondi(g.prix - (g.apport || 0)) : NaN) : g.montant;
    var ta = g.taux;
    if (!(C > 0) || !(g.ans > 0) || !isFinite(ta)) return null;
    var r = echeancier({ capital: C, mois: Math.round(g.ans * 12), taux: ta, dateDebut: g.dateDebut || '' }, false);
    var endet = g.revenus > 0 ? (r.M1 + (g.charges || 0)) / g.revenus * 100 : NaN;
    var out = { capital: C, resultat: r, endettement: endet, ok: isFinite(endet) ? endet <= regles.endettementMax : null,
      ageDepasse: false, apportInsuffisant: false };
    if (isFinite(endet) && endet > regles.endettementMax) {
      var Mmax = g.revenus * regles.endettementMax / 100 - (g.charges || 0);
      if (Mmax > 0) {
        var tm = tauxMensuelPct(ta) / 100, n = Math.round(g.ans * 12);
        var Cmax = tm > 0 ? Mmax * (1 - Math.pow(1 + tm, -n)) / tm : Mmax * n;
        var nNec = nombreEcheances(tm, Mmax, C);
        out.mensualiteMax = arrondi(Mmax);
        out.capitalMax = Math.floor(Cmax / 100) * 100;
        out.dureeNecessaire = isFinite(nNec) && nNec <= 300 ? nNec : null;
      } else out.chargesTropElevees = true;
    }
    if (g.age > 0) { out.ageFin = g.age + g.ans; out.ageDepasse = g.age + g.ans > regles.ageMax; }
    if ((g.type === 'immo' || g.type === 'auto') && g.prix > 0 && (g.apport || 0) / g.prix * 100 < regles.apportMin) out.apportInsuffisant = true;
    return out;
  }

  /* ===================================================================
     Outils
     =================================================================== */
  /**
   * Calcul inverse (crédit mensuel à échéances constantes, sans frais ni assurance).
   * @param {Object} o
   * @param {'capital'|'duree'|'taux'} o.mode valeur à trouver
   * @param {number} o.mensualite échéance souhaitée
   * @param {number} [o.capital]
   * @param {number} [o.mois] entier, 1 à 300
   * @param {number} [o.taux] taux annuel en %
   * @returns {null|{erreur:string, interetsPremierMois?:number}|{capital, mois, taux, interets?, mensualiteReelle?}}
   *   null si les entrées sont incomplètes.
   */
  function calculInverse(o) {
    var M = o.mensualite, C = o.capital, n = o.mois, ta = o.taux, mode = o.mode || 'capital';
    if (!(M > 0)) return null;
    if (mode === 'capital') {
      if (!(n >= 1 && n <= 300) || !(ta >= 0 && ta <= 100)) return null;
      var r = tauxMensuelPct(ta) / 100;
      var cap = Math.abs(r) < 1e-12 ? M * n : M * (1 - Math.pow(1 + r, -n)) / r;
      cap = Math.floor(cap * 1000) / 1000;
      return { capital: cap, mois: n, taux: ta, interets: arrondi(M * n - cap) };
    } else if (mode === 'duree') {
      if (!(C > 0) || !(ta >= 0 && ta <= 100)) return null;
      var r2 = tauxMensuelPct(ta) / 100;
      if (M <= C * r2) return { erreur: 'interets-non-couverts', interetsPremierMois: arrondi(C * r2) };
      var nb = nombreEcheances(r2, M, C);
      if (!isFinite(nb) || nb > 300) return { erreur: 'plus-de-300-mois' };
      return { capital: C, mois: nb, taux: ta, mensualiteReelle: mensualite(C, tauxMensuelPct(ta), nb) };
    }
    if (!(C > 0) || !(n >= 1 && n <= 300)) return null;
    if (M * n < C - 0.0005) return { erreur: 'mensualite-trop-faible' };
    var bas = 0, haut = 1;
    for (var it = 0; it < 200; it++) { var mil = (bas + haut) / 2; if (pmt(mil, n, C) > M) haut = mil; else bas = mil; }
    var taux = Math.round(bas * 12 * 100 * 1000) / 1000;
    if (taux > 100) return { erreur: 'taux-superieur-100' };
    return { capital: C, mois: n, taux: taux, mensualiteReelle: mensualite(C, tauxMensuelPct(taux), n) };
  }

  /**
   * Plan de financement : plusieurs prêts mensuels à échéances constantes
   * (différé partiel), mensualité globale par paliers, lissage facultatif
   * (le prêt le plus long — à égalité le plus gros — s'ajuste).
   * @param {Array<{nom?, capital, mois, taux, differe?}>} prets prêts valides seulement
   *   (capital > 0, 1 ≤ mois ≤ 300, 0 ≤ taux ≤ 100, 0 ≤ différé < mois) ; les autres sont ignorés.
   * @param {{lisser?:boolean}} [options]
   * @returns {{prets, ignores, echeanciers, nMax, paliers:Array<{debut,fin,total,det}>, totalMois:number[],
   *   capitalTotal, totI, totISansLissage, lissage:{T, lignes, totI, negatif, surcout, principal}|null,
   *   messageLissage:null|'differe-principal'|'lissage-impossible'}}
   */
  function planFinancement(prets, options) {
    options = options || {};
    var liste = [], ignores = 0;
    (prets || []).forEach(function (x, i) {
      var df = x.differe || 0;
      var ok = x.capital > 0 && x.mois >= 1 && x.mois <= 300 && x.mois === Math.floor(x.mois) && x.taux >= 0 && x.taux <= 100 && df >= 0 && df < x.mois;
      if (ok) liste.push({ nom: x.nom || 'Prêt ' + (i + 1), capital: x.capital, mois: x.mois, taux: x.taux, differe: df });
      else ignores++;
    });
    if (!liste.length) return null;
    var ech = liste.map(function (x) {
      return echeancier({ capital: x.capital, mois: x.mois, taux: x.taux, dateDebut: '', differe: x.differe ? { mois: x.differe, type: 'partiel' } : null }, false);
    });
    var nMax = Math.max.apply(null, liste.map(function (x) { return x.mois; }));
    var lisser = !!options.lisser && liste.length > 1;
    var msgLissage = null, echL = null, iPrincipal = -1;
    if (lisser) {
      iPrincipal = 0;
      liste.forEach(function (x, i) { if (x.mois > liste[iPrincipal].mois || (x.mois === liste[iPrincipal].mois && x.capital > liste[iPrincipal].capital)) iPrincipal = i; });
      var P = liste[iPrincipal];
      if (P.differe) msgLissage = 'differe-principal';
      else {
        var r = tauxMensuelPct(P.taux) / 100;
        var autres = [];
        for (var m = 1; m <= P.mois; m++) {
          var s = 0;
          ech.forEach(function (x, i) { if (i !== iPrincipal && x.lignes[m - 1]) s += x.lignes[m - 1].paiement; });
          autres.push(s);
        }
        var somV = 0, somO = 0, v = 1;
        for (var m2 = 1; m2 <= P.mois; m2++) { v = v / (1 + r); somV += v; somO += autres[m2 - 1] * v; }
        var T = (P.capital + somO) / somV;
        if (autres.some(function (o) { return T - o < 0; })) msgLissage = 'lissage-impossible';
        else {
          var reste = P.capital, lignes = [], totIL = 0, negatif = 0;
          for (var m3 = 1; m3 <= P.mois; m3++) {
            var interet = arrondi(reste * r);
            var paiement = arrondi(T - autres[m3 - 1]);
            var principal = arrondi(paiement - interet);
            if (m3 === P.mois) { principal = arrondi(reste); paiement = arrondi(interet + principal); }
            if (principal < 0) negatif++;
            reste = arrondi(reste - principal);
            totIL = arrondi(totIL + interet);
            lignes.push({ paiement: paiement, interet: interet });
          }
          echL = { lignes: lignes, totI: totIL, T: arrondi(T), negatif: negatif, principal: iPrincipal };
        }
      }
    }
    var paliers = [], totalMois = [];
    for (var m4 = 1; m4 <= nMax; m4++) {
      var det = ech.map(function (x, i) {
        var l = (echL && i === iPrincipal) ? echL.lignes[m4 - 1] : x.lignes[m4 - 1];
        return l ? l.paiement : 0;
      });
      var tot = arrondi(det.reduce(function (a, b) { return a + b; }, 0));
      totalMois.push(tot);
      var dern = paliers[paliers.length - 1];
      if (dern && Math.abs(dern.total - tot) < 0.0015 && det.every(function (x, j) { return Math.abs(x - dern.det[j]) < 0.0015; })) dern.fin = m4;
      else paliers.push({ debut: m4, fin: m4, total: tot, det: det });
    }
    var totI = ech.reduce(function (a, x, i) { return a + ((echL && i === iPrincipal) ? echL.totI : x.totI); }, 0);
    var capTotal = liste.reduce(function (a, x) { return a + x.capital; }, 0);
    var totIsans = ech.reduce(function (a, x) { return a + x.totI; }, 0);
    if (echL) echL.surcout = arrondi(echL.totI - ech[iPrincipal].totI);
    return { prets: liste, ignores: ignores, echeanciers: ech, nMax: nMax, paliers: paliers, totalMois: totalMois,
      capitalTotal: arrondi(capTotal), totI: arrondi(totI), totISansLissage: arrondi(totIsans), lissage: echL, messageLissage: msgLissage };
  }

  /**
   * Comparateur d'offres bancaires, classées par coût du crédit.
   * @param {{capital:number, mois:number, offres:Array<{nom?, taux, fraisDossierPct?, fraisFixes?, assurancePct?, assuranceBase?:'initial'|'crd'}>}} o
   * @returns {{offres:Array<{i, nom, entree, resultat, mensualite, assurance1, mensualiteAvecAssurance, interets,
   *   coutAssurance, frais, coutCredit, teg}>, meilleure, seconde, economie}|null}
   */
  function comparerOffres(o) {
    var C = o.capital, n = o.mois;
    if (!(C > 0) || !(n >= 1 && n <= 300)) return null;
    var res = [];
    (o.offres || []).forEach(function (of, i) {
      var ta = of.taux;
      if (!(ta >= 0 && ta <= 100)) return;
      var fdp = of.fraisDossierPct, ff = of.fraisFixes, as = of.assurancePct;
      var e = { capital: C, mois: n, taux: ta, dateDebut: '',
        frais: (fdp > 0 || ff > 0) ? { dossierPct: fdp > 0 ? fdp : 0, dossierFixe: ff > 0 ? ff : 0, garantie: 0, autres: 0 } : null,
        assurance: as > 0 ? { taux: as, base: of.assuranceBase === 'crd' ? 'crd' : 'initial' } : null };
      var r = echeancier(e, false);
      res.push({ i: i, nom: of.nom || 'Offre ' + (i + 1), entree: e, resultat: r,
        mensualite: r.M1, assurance1: r.lignes[0].assurance, mensualiteAvecAssurance: totalLigne(r.lignes[0]),
        interets: r.totI, coutAssurance: r.totAss, frais: r.frais, coutCredit: r.coutCredit, teg: r.teg });
    });
    if (!res.length) return null;
    var tri = res.slice().sort(function (a, b) { return a.coutCredit - b.coutCredit; });
    return { offres: res, meilleure: tri[0], seconde: tri[1] || null,
      economie: tri[1] ? arrondi(tri[1].coutCredit - tri[0].coutCredit) : null };
  }

  /**
   * Renégociation ou rachat de crédit.
   * @param {Object} o
   * @param {number} o.crd capital restant dû
   * @param {number} o.tauxActuel taux actuel en %
   * @param {number} o.moisRestants durée restante (mois)
   * @param {number} o.nouveauTaux
   * @param {number} [o.nouvelleDuree=moisRestants]
   * @param {number} [o.indemnitePct=0] indemnité de remboursement anticipé en % du CRD
   * @param {number} [o.fraisDossier=0]
   * @param {number} [o.fraisGarantie=0]
   * @param {boolean} [o.financer=false] frais et indemnité intégrés au nouveau capital
   * @returns {{cout, actuel, nouveau, capitalNouveau, totalActuel, totalNouveau, economie, rentable, gainMensuel, pointMort}|null}
   */
  function renegociation(o) {
    var crd = o.crd, ta = o.tauxActuel, n = o.moisRestants, tn = o.nouveauTaux;
    var nn = o.nouvelleDuree == null ? n : o.nouvelleDuree;
    var ind = isFinite(o.indemnitePct) ? o.indemnitePct : 0, fd = isFinite(o.fraisDossier) ? o.fraisDossier : 0, fg = isFinite(o.fraisGarantie) ? o.fraisGarantie : 0;
    var financer = !!o.financer;
    if (!(crd > 0) || !(ta >= 0 && ta <= 100) || !(n >= 1 && n <= 300) || !(tn >= 0 && tn <= 100) || !(nn >= 1 && nn <= 300)) return null;
    var cout = arrondi(crd * ind / 100 + fd + fg);
    var actuel = echeancier({ capital: crd, mois: n, taux: ta, dateDebut: '' }, false);
    var capNv = arrondi(crd + (financer ? cout : 0));
    var nouveau = echeancier({ capital: capNv, mois: nn, taux: tn, dateDebut: '' }, false);
    var totalActuel = actuel.totM, totalNouveau = arrondi(nouveau.totM + (financer ? 0 : cout));
    var eco = arrondi(totalActuel - totalNouveau);
    var gainMois = arrondi(actuel.M1 - nouveau.M1);
    var pointMort = null;
    if (!financer && cout > 0 && gainMois > 0) pointMort = Math.ceil(cout / gainMois);
    return { cout: cout, actuel: actuel, nouveau: nouveau, capitalNouveau: capNv, totalActuel: totalActuel, totalNouveau: totalNouveau,
      economie: eco, rentable: eco > 0, gainMensuel: gainMois, pointMort: pointMort, dureePlusLongue: nn > n };
  }

  /** Générateur pseudo-aléatoire reproductible (mulberry32) : renvoie une fonction → [0 ; 1[. */
  function generateurAleatoire(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Centile p (0 à 1) d'un tableau trié, par interpolation linéaire. */
  function centile(trie, p) {
    if (!trie.length) return NaN;
    var i = (trie.length - 1) * p, b = Math.floor(i), h = Math.ceil(i);
    return trie[b] + (trie[h] - trie[b]) * (i - b);
  }

  /**
   * Stress test du TMM (Monte-Carlo) : le TMM varie chaque année de
   * tendance + volatilité × N(0,1) (Box-Muller), sans descendre sous le plancher ;
   * la mensualité est recalculée à chaque révision annuelle.
   * @param {Object} o
   * @param {number} o.capital
   * @param {number} o.mois
   * @param {number} o.tmm TMM de départ (%)
   * @param {number} o.marge marge de la banque (points)
   * @param {number} o.volatilite écart-type annuel (points)
   * @param {number} [o.tendance=0] dérive annuelle (points)
   * @param {number} [o.plancher=0] TMM minimal
   * @param {number} [o.seuil=Infinity] mensualité à ne pas dépasser
   * @param {number} [o.n=1000] nombre de trajectoires
   * @param {number} [o.graine=20261001]
   * @returns {{interets, tI, tM, bandes, probaDepasse, n, interetsMedian, interetsP95, mensualiteMaxMediane,
   *   mensualiteMaxP90, interetsSansVariation}}
   */
  function monteCarloTmm(o) {
    o = Object.assign({ n: 1000, graine: 20261001, tendance: 0, plancher: 0, seuil: Infinity }, o);
    var alea = generateurAleatoire(o.graine || 20261001);
    function normale() { var u = 1 - alea(), v = alea(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var annees = Math.ceil(o.mois / 12), interets = [], maxM = [], chemins = [], depasse = 0;
    for (var s = 0; s < o.n; s++) {
      var tmm = o.tmm, reste = o.capital, totI = 0, mMax = 0, M = 0, chemin = [tmm];
      for (var m = 1; m <= o.mois; m++) {
        if (m === 1 || (m - 1) % 12 === 0) {
          if (m > 1) { tmm = Math.max(o.plancher, tmm + o.tendance + o.volatilite * normale()); chemin.push(tmm); }
          M = mensualite(reste, tauxMensuelPct(tmm + o.marge), o.mois - m + 1);
          if (M > mMax) mMax = M;
        }
        var interet = arrondi(reste * tauxMensuelPct(tmm + o.marge) / 100);
        var principal = m === o.mois ? reste : arrondi(M - interet);
        reste = arrondi(reste - principal);
        totI += interet;
      }
      interets.push(arrondi(totI)); maxM.push(mMax); chemins.push(chemin);
      if (mMax > o.seuil + 0.0005) depasse++;
    }
    var bandes = [];
    for (var a = 0; a < annees; a++) {
      var vals = chemins.map(function (c) { return c[Math.min(a, c.length - 1)]; }).sort(function (x, y) { return x - y; });
      bandes.push({ p5: centile(vals, 0.05), p25: centile(vals, 0.25), p50: centile(vals, 0.5), p75: centile(vals, 0.75), p95: centile(vals, 0.95) });
    }
    var tI = interets.slice().sort(function (x, y) { return x - y; }), tM = maxM.slice().sort(function (x, y) { return x - y; });
    var ref = echeancier({ capital: o.capital, mois: o.mois, taux: o.tmm + o.marge, dateDebut: '' }, false);
    return { interets: interets, tI: tI, tM: tM, bandes: bandes, probaDepasse: depasse / o.n, n: o.n,
      interetsMedian: centile(tI, 0.5), interetsP95: centile(tI, 0.95),
      mensualiteMaxMediane: centile(tM, 0.5), mensualiteMaxP90: centile(tM, 0.9), interetsSansVariation: ref.totI };
  }

  /**
   * Louer ou acheter : patrimoine comparé chaque année. L'écart mensuel entre
   * dépenses d'achat (échéance + charges du propriétaire) et loyer est placé
   * (ou prélevé) au rendement de l'épargne ; le loyer augmente une fois par an.
   * @param {Object} o
   * @param {number} o.prix
   * @param {number} o.apport
   * @param {number} o.fraisPct frais d'acquisition (% du prix)
   * @param {number} o.taux taux du crédit (%)
   * @param {number} o.ans durée du crédit (1 à 30)
   * @param {number} o.chargesPct charges du propriétaire (% de la valeur par an)
   * @param {number} o.loyer loyer mensuel de départ
   * @param {number} o.hausseLoyerPct hausse annuelle des loyers (%)
   * @param {number} o.revalorisationPct revalorisation annuelle du bien (%, peut être négative)
   * @param {number} o.rendementPct rendement annuel de l'épargne (%)
   * @returns {{mensualite, points:Array<{an, achat, location}>, pointMort, ecart, verdict:'acheter'|'louer'}|null}
   */
  function louerOuAcheter(o) {
    var prix = o.prix, apport = o.apport, fr = o.fraisPct, ta = o.taux, ans = o.ans, ch = o.chargesPct, loyer = o.loyer;
    var hl = o.hausseLoyerPct, hb = o.revalorisationPct, ep = o.rendementPct;
    if (!(prix > 0) || !(apport >= 0) || apport >= prix || !(ans >= 1 && ans <= 30) || !(ta >= 0) || !(loyer > 0) || ![fr, ch, hl, hb, ep].every(isFinite)) return null;
    var mois = ans * 12, credit = prix - apport;
    var ech = echeancier({ capital: credit, mois: mois, taux: ta, dateDebut: '' }, false);
    var rEp = Math.pow(1 + ep / 100, 1 / 12) - 1;
    var portefeuille = apport + prix * fr / 100, valeur = prix, loyerM = loyer, points = [{ an: 0, achat: valeur - credit, location: portefeuille }];
    var pointMort = null;
    for (var m = 1; m <= mois; m++) {
      var l = ech.lignes[m - 1];
      var sortieAchat = l.paiement + valeur * ch / 100 / 12;
      portefeuille = portefeuille * (1 + rEp) + (sortieAchat - loyerM);
      valeur *= Math.pow(1 + hb / 100, 1 / 12);
      if (m % 12 === 0) {
        loyerM *= 1 + hl / 100;
        var pa = valeur - l.reste, pl = portefeuille;
        points.push({ an: m / 12, achat: pa, location: pl });
        if (pointMort === null && pa >= pl) pointMort = m / 12;
      }
    }
    var fin = points[points.length - 1], ecart = fin.achat - fin.location;
    return { mensualite: ech.M1, echeancier: ech, points: points, pointMort: pointMort, ecart: ecart, verdict: ecart >= 0 ? 'acheter' : 'louer' };
  }

  /**
   * Optimiseur de stratégie : durées de 3 à 25 ans × 5 niveaux d'apport
   * (0, 25, 50, 75, 100 % de l'apport maximal) × versements annuels
   * (0, 6 ou 12 mois d'épargne, dès l'échéance 12) ; garde les combinaisons dont
   * l'échéance respecte le budget, puis la moins chère et le front de Pareto.
   * @param {Object} o
   * @param {number} o.prix montant du projet
   * @param {number} o.apportMax
   * @param {number} o.budget échéance maximale
   * @param {number} [o.epargne=0] épargne mensuelle possible
   * @param {number} [o.indemnite=0] indemnité de remboursement anticipé (%)
   * @param {number} o.taux
   * @param {boolean} [o.reduction=true] règle des 8 % (si durée > 84 mois)
   * @param {string} [o.dateDebut]
   * @param {Object} [o.assurance] @param {Object} [o.frais] repris du scénario
   * @param {{apport:number, mois:number}} [o.actuel] scénario actuel à situer
   * @returns {{tous:Array, ok:Array, front:Array, meilleure, solutions:Array, actuel}|{erreur:string}}
   */
  function optimiser(o) {
    var prixV = o.prix, apMax = o.apportMax, budget = o.budget, ep = o.epargne || 0, indem = o.indemnite || 0, taux = o.taux;
    var reduc = o.reduction !== false;
    if (!(prixV > 0) || !(apMax >= 0) || !(budget > 0) || !(ep >= 0) || !(indem >= 0) || !(taux >= 0) || apMax >= prixV) return { erreur: 'valeurs-invalides' };
    function evaluer(x) {
      var C = arrondi(x.prix - x.apport);
      if (!(C > 0)) return null;
      var ent = { capital: C, mois: x.ans * 12, taux: x.taux, dateDebut: o.dateDebut || '', ras: [], indemnite: x.indem, raMode: 'duree',
        versement: x.versement > 0 ? { montant: x.versement, frequence: 'annee', des: 12 } : null, assurance: o.assurance || null, frais: o.frais || null };
      var r = echeancier(ent, x.reduc && x.ans * 12 > 84);
      return { o: x, C: C, r: r, M: r.M1, cout: arrondi(r.totI + r.totIndem + r.totAss + r.frais), duree: r.n, red: r.reductions ? r.reductions.length : 0 };
    }
    var tous = [];
    var apports = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return arrondi(apMax * f); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var versements = ep > 0 ? [0, arrondi(ep * 6), arrondi(ep * 12)] : [0];
    for (var ans = 3; ans <= 25; ans++) apports.forEach(function (ap) { versements.forEach(function (vs) {
      var x = evaluer({ prix: prixV, apport: ap, ans: ans, taux: taux, indem: indem, versement: vs, reduc: reduc });
      if (x) { x.ok = x.M <= budget + 0.0005; tous.push(x); }
    }); });
    var ok = tous.filter(function (x) { return x.ok; });
    if (!ok.length) return { erreur: 'aucune-combinaison', tous: tous };
    ok.sort(function (a, b) { return a.cout - b.cout; });
    var front = [];
    ok.slice().sort(function (a, b) { return a.M - b.M || a.cout - b.cout; }).forEach(function (x) { if (!front.length || x.cout < front[front.length - 1].cout - 0.0005) front.push(x); });
    var meilleur = ok[0];
    var actuel = o.actuel ? evaluer({ prix: prixV, apport: o.actuel.apport || 0, ans: Math.round(o.actuel.mois / 12), taux: taux, indem: indem, versement: 0, reduc: reduc }) : null;
    var solutions = [meilleur].concat(front.filter(function (x) { return x !== meilleur; }).slice(0, 4));
    return { tous: tous, ok: ok, front: front, meilleure: meilleur, solutions: solutions, actuel: actuel,
      economieVsActuel: actuel ? arrondi(actuel.cout - meilleur.cout) : null };
  }

  /**
   * Quand demander la réduction de taux ? Ratio intérêts des 36 derniers mois /
   * capital restant dû avant chaque échéance k ≥ 37, zones où il dépasse 8 %,
   * et effet d'une demande à l'échéance k (taux divisé par deux dès k, simulé
   * par une variation de −taux/2 comme dans l'outil d'origine).
   * Réservé aux crédits mensuels à échéances constantes, sans différé, > 84 mois.
   * @param {Object} e entrée d'echeancier
   * @param {number} [k] échéance de la demande (défaut : première date possible, sinon 37)
   * @returns {{eligible:false, motif:string}|{eligible:true, ratios:Array<[number,number]>, zones:Array<[number,number]>,
   *   premiere:number|null, k, ratio, recevable, nouvelleMensualite?, mensualiteActuelle, economie?, prochaine?}}
   */
  function quandDemanderReduction(e, k) {
    if ((e.periodicite || 1) !== 1 || (e.amort || 'constant') !== 'constant' || e.differe || e.mois <= 84) return { eligible: false, motif: 'credit-non-concerne' };
    var base = echeancier(Object.assign({}, e, { variation: null }), false), L = base.lignes, n = L.length;
    var ratios = [], s36 = 0;
    for (var j = 1; j <= n; j++) {
      if (j >= 37) { var crdAv = resteFin(L[j - 2]); ratios.push([j, crdAv > 0 ? s36 / crdAv * 100 : 0]); }
      s36 = arrondi(s36 + L[j - 1].interet - (j > 36 ? L[j - 37].interet : 0));
    }
    if (!ratios.length) return { eligible: false, motif: 'credit-trop-court' };
    var zones = [], debutZ = null;
    ratios.forEach(function (r, i) {
      if (r[1] > 8 && debutZ === null) debutZ = r[0];
      if ((r[1] <= 8 || i === ratios.length - 1) && debutZ !== null) { zones.push([debutZ, r[1] > 8 ? r[0] : r[0] - 1]); debutZ = null; }
    });
    var premier = ratios.filter(function (r) { return r[1] > 8; })[0];
    if (k == null) k = premier ? premier[0] : 37;
    k = Math.max(37, Math.min(n, Math.round(k)));
    var r = ratios[k - 37], ok = r[1] > 8;
    var out = { eligible: true, base: base, ratios: ratios, zones: zones, premiere: premier ? premier[0] : null, k: k, date: L[k - 1].date,
      ratio: r[1], recevable: ok, mensualiteActuelle: base.M1 };
    if (ok) {
      var avec = echeancier(Object.assign({}, e, { variation: { des: k, delta: -e.taux / 2 } }), false);
      out.nouvelleMensualite = avec.lignes[k - 1].paiement;
      out.economie = arrondi(base.totI - avec.totI);
    } else {
      var proch = ratios.filter(function (x) { return x[0] > k && x[1] > 8; })[0];
      out.prochaine = proch ? proch[0] : null;
    }
    return out;
  }

  /**
   * Mon crédit en cours : position à la date du jour à partir du tableau bancaire.
   * @param {{capital, date:string, mois, taux, dureeTotale?, reduction?:boolean}} m
   *   capital restant dû au point de départ, date de la 1re échéance suivante, échéances restantes
   * @param {Date} [aujourdhui=new Date()]
   * @returns {{resultat, passees, crd, pctRembourse, prochaine, restantes, interetsRestants, reductions}|null}
   */
  function monCredit(m, aujourdhui) {
    if (!(m && m.capital > 0 && m.mois >= 1 && m.mois <= 300 && m.taux >= 0 && m.taux < 100 && /^\d{4}-\d{2}-\d{2}$/.test(m.date || ''))) return null;
    var dureeTotale = m.dureeTotale > 0 ? m.dureeTotale : m.mois;
    var r = echeancier({ capital: m.capital, mois: m.mois, taux: m.taux, dateDebut: m.date, dureeTotale: dureeTotale }, m.reduction !== false);
    var auj = aujourdhui || new Date();
    var passees = r.lignes.filter(function (l) { return l.date && new Date(l.date.getFullYear(), l.date.getMonth() + 1, 0) < auj; }).length;
    var proch = r.lignes[passees] || null;
    var crd = passees ? resteFin(r.lignes[passees - 1]) : r.C;
    return { resultat: r, passees: passees, crd: crd, pctRembourse: (1 - crd / r.C) * 100, prochaine: proch, restantes: r.n - passees,
      interetsRestants: arrondi(r.lignes.slice(passees).reduce(function (s, l) { return s + l.interet; }, 0)), reductions: r.reductions };
  }

  /**
   * Comparateur A / B : indicateurs, capital restant dû et écart cumulé de
   * paiements (B − A) mois par mois (≈ 120 points).
   * @param {Object} ra résultat d'echeancier du scénario A
   * @param {Object} rb résultat d'echeancier du scénario B
   * @returns {{indicateurs:Array<{cle, a, b, meilleur:'a'|'b'|null}>, crdA, crdB, cumulA, cumulB, ecart}}
   */
  function comparerAB(ra, rb) {
    function crd(r) { var pts = [[0, r.C]]; r.lignes.forEach(function (l) { pts.push([l.mois * r.p, resteFin(l)]); }); return pts; }
    function cumul(r) { var s = 0, pts = [[0, 0]]; r.lignes.forEach(function (l) { s += l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0); pts.push([l.mois * r.p, s]); }); return pts; }
    var ca = cumul(ra), cb = cumul(rb), nMax = Math.max(ca[ca.length - 1][0], cb[cb.length - 1][0]);
    function val(pts, m) { var v = 0; for (var i = 0; i < pts.length && pts[i][0] <= m; i++) v = pts[i][1]; return v; }
    var ecart = [];
    for (var m = 0; m <= nMax; m += Math.max(1, Math.round(nMax / 120))) ecart.push([m, val(cb, m) - val(ca, m)]);
    function ind(cle, va, vb) {
      var egal = Math.abs(va - vb) < 0.0005;
      return { cle: cle, a: va, b: vb, meilleur: egal ? null : (va < vb ? 'a' : 'b') };
    }
    return {
      indicateurs: [
        ind('mensualite', ra.M1, rb.M1), ind('dureeMois', ra.n * ra.p, rb.n * rb.p), ind('interets', ra.totI, rb.totI),
        ind('coutCredit', ra.coutCredit, rb.coutCredit), ind('teg', isFinite(ra.teg) ? ra.teg : 0, isFinite(rb.teg) ? rb.teg : 0)
      ],
      crdA: crd(ra), crdB: crd(rb), cumulA: ca, cumulB: cb, ecart: ecart
    };
  }

  /**
   * Calendrier des échéances : grille année × mois (0 à 11), chaque case
   * indiquant la part d'intérêts de l'échéance (0 à 1).
   * @param {Object} r résultat d'echeancier
   * @param {Date} [aujourdhui=new Date()] pour marquer le mois courant
   * @returns {Array<{annee:number, cases:Array<null|{mois, part, interet, principal, ra:boolean, reduction:boolean, courant:boolean}>}>}
   */
  function calendrier(r, aujourdhui) {
    var auj = aujourdhui || new Date(), parAn = 12 / r.p;
    var annees = {}, ordre = [];
    r.lignes.forEach(function (l) {
      var an = l.date ? l.date.getFullYear() : Math.ceil(l.mois / parAn), mo = l.date ? l.date.getMonth() : ((l.mois - 1) % parAn) * r.p;
      if (!annees[an]) { annees[an] = {}; ordre.push(an); }
      annees[an][mo] = l;
    });
    return ordre.map(function (an) {
      var cases = [];
      for (var mo = 0; mo < 12; mo++) {
        var l = annees[an][mo];
        if (!l) { cases.push(null); continue; }
        var tot = l.paiement > 0 ? l.paiement : 1, part = Math.max(0, Math.min(1, l.interet / tot));
        cases.push({ mois: l.mois, part: part, interet: l.interet, principal: l.principal, ra: !!l.ra, reduction: !!l.reduction,
          courant: !!(l.date && l.date.getFullYear() === auj.getFullYear() && l.date.getMonth() === auj.getMonth()) });
      }
      return { annee: an, cases: cases };
    });
  }

  /* ===================================================================
     Lien de partage
     =================================================================== */
  /**
   * Paramètres de lien de partage (lienSimulation d'origine, sans l'adresse).
   * @param {Object} e entrée (comme echeancier) + type, tmm {tmm, marge}, apport {prix, apport}
   * @param {{reduc?:boolean}} [options] reduc : réduction de taux effectivement appliquée (r=1)
   * @returns {string} « c=…&m=…&t=… »
   */
  function encoderLien(e, options) {
    options = options || {};
    var ras = e.ras || [];
    var p = ['c=' + arrondi(e.capital), 'm=' + e.mois, 't=' + e.taux];
    if (e.dateDebut) p.push('d=' + e.dateDebut);
    if (options.reduc) p.push('r=1');
    if (e.type && e.type !== 'libre') p.push('ty=' + e.type);
    if (e.tmm) {
      p.push('i=' + e.tmm.tmm, 'mg=' + e.tmm.marge);
      if (e.variation) p.push('dv=' + e.variation.delta, 'dn=' + e.variation.des);
    }
    if ((e.periodicite || 1) !== 1) p.push('pe=' + e.periodicite);
    if ((e.amort || 'constant') !== 'constant') p.push('am=' + (e.amort === 'lineaire' ? 'l' : 'i'));
    if (e.differe) p.push('df=' + e.differe.mois, 'dt=' + (e.differe.type === 'total' ? 't' : 'p'));
    if (e.assurance) p.push('as=' + e.assurance.taux, 'ab=' + (e.assurance.base === 'crd' ? 'c' : 'i'));
    if (e.frais) {
      if (e.frais.dossierPct) p.push('fp=' + e.frais.dossierPct);
      if (e.frais.dossierFixe) p.push('ff=' + e.frais.dossierFixe);
      if (e.frais.garantie) p.push('fg=' + e.frais.garantie);
      if (e.frais.autres) p.push('fa=' + e.frais.autres);
    }
    if (e.apport) p.push('pb=' + e.apport.prix, 'ap=' + e.apport.apport);
    if (ras.length) p.push('ra=' + ras.map(function (x) { return x.apres + ':' + (x.total ? 'tot' : arrondi(x.montant)); }).join(','));
    if (e.versement) p.push('vm=' + e.versement.montant, 'vf=' + (e.versement.frequence === 'annee' ? 'a' : 'p'), 'vd=' + e.versement.des);
    if (ras.length || e.versement) {
      if (e.indemnite) p.push('ri=' + e.indemnite);
      if (e.raMode === 'mensualite') p.push('ro=m');
    }
    return p.join('&');
  }

  /**
   * Lecture d'un lien de partage (lireLienPartage d'origine), avec les mêmes
   * validations. Accepte aussi l'ancien format (ra = échéance, rm = montant).
   * @param {string|URLSearchParams} recherche « ?c=…&m=… » ou « c=…&m=… » ou une adresse complète
   * @returns {Object|null} valeurs de simulation, ou null si c, m ou t manquent ou sont invalides
   */
  function decoderLien(recherche) {
    var q;
    if (typeof recherche === 'string') {
      var s = recherche.indexOf('?') !== -1 ? recherche.slice(recherche.indexOf('?') + 1) : recherche;
      if (s.indexOf('#') !== -1) s = s.slice(0, s.indexOf('#'));
      q = new URLSearchParams(s);
    } else q = recherche;
    if (!q || !q.has('c') || !q.has('m') || !q.has('t')) return null;
    function num(k) { return q.has(k) ? parseFloat(q.get(k)) : NaN; }
    function ent(k) { return q.has(k) ? parseInt(q.get(k), 10) : NaN; }
    var capital = num('c'), mois = ent('m'), taux = num('t');
    var date = q.get('d') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    var p = [1, 3, 6, 12].indexOf(ent('pe')) !== -1 ? ent('pe') : 1;
    var valide = isFinite(capital) && capital > 0 && isFinite(mois) && mois >= 1 && mois <= 300 && mois % p === 0 && isFinite(taux) && taux >= 0 && taux <= 100;
    if (!valide) return null;
    var N = mois / p;
    var v = { capital: capital, mois: mois, taux: taux, dateDebut: date, reduction: q.get('r') === '1', tmm: null, variation: null, periodicite: p };
    var ty = q.get('ty');
    v.type = TYPES.some(function (x) { return x.cle === ty; }) ? ty : 'libre';
    var tmm = num('i'), mg = num('mg');
    if (isFinite(tmm) && isFinite(mg) && tmm >= 0 && mg >= -tmm && mg <= 20) {
      v.tmm = { tmm: tmm, marge: mg };
      var dv = num('dv'), dn = ent('dn');
      if (isFinite(dv) && dv !== 0 && Math.abs(dv) <= 20 && dn >= 2 && dn <= N) v.variation = { delta: dv, des: dn };
    }
    v.amort = q.get('am') === 'l' ? 'lineaire' : (q.get('am') === 'i' ? 'infine' : 'constant');
    var df = ent('df');
    v.differe = null;
    if (df > 0 && df < mois && df % p === 0) v.differe = { mois: df, type: q.get('dt') === 't' ? 'total' : 'partiel' };
    var as = num('as');
    v.assurance = null;
    if (as > 0 && as <= 10) v.assurance = { taux: as, base: q.get('ab') === 'c' ? 'crd' : 'initial' };
    var fr = { dossierPct: num('fp'), dossierFixe: num('ff'), garantie: num('fg'), autres: num('fa') };
    Object.keys(fr).forEach(function (k) { fr[k] = isFinite(fr[k]) && fr[k] > 0 ? fr[k] : 0; });
    if (fr.dossierPct > 10) fr.dossierPct = 0;
    v.frais = fr.dossierPct + fr.dossierFixe + fr.garantie + fr.autres > 0 ? fr : null;
    var pb = num('pb'), ap = num('ap');
    v.apport = pb > 0 && ap >= 0 && ap < pb ? { prix: pb, apport: ap } : null;
    var ras = [];
    if (q.has('rm')) {
      var a1 = ent('ra');
      if (a1 >= 1 && a1 < N && (q.get('rm') === 'tot' || num('rm') > 0)) ras.push({ apres: a1, total: q.get('rm') === 'tot', montant: q.get('rm') === 'tot' ? null : num('rm') });
    } else if (q.get('ra')) {
      q.get('ra').split(',').forEach(function (x) {
        var m = /^(\d+):(tot|\d+(?:\.\d+)?)$/.exec(x.trim());
        if (!m) return;
        var ap1 = parseInt(m[1], 10);
        if (ap1 >= 1 && ap1 < N && ras.length < 10) ras.push({ apres: ap1, total: m[2] === 'tot', montant: m[2] === 'tot' ? null : parseFloat(m[2]) });
      });
    }
    v.ras = ras;
    var vm = num('vm'), vd = ent('vd');
    v.versement = vm > 0 && vd >= 1 && vd < N ? { montant: vm, frequence: q.get('vf') === 'a' ? 'annee' : 'periode', des: vd } : null;
    var ri = num('ri');
    v.indemnite = isFinite(ri) && ri >= 0 && ri <= 20 ? ri : 0;
    v.raMode = q.get('ro') === 'm' ? 'mensualite' : 'duree';
    return v;
  }

  /* ===================================================================
     API
     =================================================================== */
  return {
    PREC: PREC, PERIODICITES: PERIODICITES, AMORTISSEMENTS: AMORTISSEMENTS, TYPES: TYPES,
    DEFAUTS: DEFAUTS, PRESETS: PRESETS, defauts: defauts,
    arrondi: arrondi, arrondi6: arrondi6, pmt: pmt, mensualite: mensualite,
    tauxMensuelPct: tauxMensuelPct, tauxPeriodePct: tauxPeriodePct, nombreEcheances: nombreEcheances,
    lireDate: lireDate, infoPeriodicite: infoPeriodicite, fraisTotal: fraisTotal,
    echeancier: echeancier, teg: teg, resteFin: resteFin, totalLigne: totalLigne, premiereLigne: premiereLigne,
    agregerAnnuel: agregerAnnuel, valeurActuelle: valeurActuelle,
    appliquerPreset: appliquerPreset, tauxTmm: tauxTmm, sensibiliteTmm: sensibiliteTmm,
    remboursementAnticipe: remboursementAnticipe, analyseReduction: analyseReduction,
    capaciteEmprunt: capaciteEmprunt, eligibilite: eligibilite, budgetGuide: budgetGuide,
    calculInverse: calculInverse, planFinancement: planFinancement, comparerOffres: comparerOffres,
    renegociation: renegociation, generateurAleatoire: generateurAleatoire, centile: centile,
    monteCarloTmm: monteCarloTmm, louerOuAcheter: louerOuAcheter, optimiser: optimiser,
    quandDemanderReduction: quandDemanderReduction, monCredit: monCredit, comparerAB: comparerAB,
    calendrier: calendrier, encoderLien: encoderLien, decoderLien: decoderLien
  };
});
