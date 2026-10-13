/*
 * Orbite — « Rembourser ou épargner ? » et « Patrimoine net » (maquette validée le 13 oct. 2026). Pur, testé sous Node.
 *   comparer(sy, options)   : pour une somme (une prime…), trois choix comparés à un horizon de 5 ou 10 ans :
 *                             rembourser par anticipation le crédit le plus cher (durée plus courte, même mensualité),
 *                             verser en assurance vie / CEA (économie d'impôt du moteur fiscal, puis rendement),
 *                             garder en épargne de précaution ; puis un conseil (réserve de 3 mois d'abord).
 *   patrimoine(sy, options) : ce que l'on possède (logement, autres biens, épargne, contrats) moins ce que l'on doit
 *                             (reste dû des crédits), courbe année par année et jalons (fin des crédits…).
 * Toutes les règles viennent d'OrbiteCalcul (crédits, contrats) et d'OrbiteIntelligence (impôt) : rien n'est dupliqué.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-intelligence.js"));
  } else {
    racine.DeciderCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence);
  }
})(typeof self !== "undefined" ? self : this, function (OC, OI) {
  "use strict";

  var MOIS = OC.MOIS;
  /* Hypothèses par défaut (modifiables par l'utilisateur, gardées dans son profil). */
  var DEFAUTS = { rendementAv: 6, rendementEpargne: 5, hausseLogement: 2 };
  var RESERVE_MOIS = 3;

  function borne(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function dateDans(m, k) { var d = new Date(m.getFullYear(), m.getMonth() + k, 1); return MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function hypotheses(p, o) {
    var h = (p && p.decider) || {}, pa = (p && p.patrimoine) || {};
    o = o || {};
    return {
      rendementAv: borne(num(o.rendementAv, num(h.rendementAv, DEFAUTS.rendementAv)), 0, 15),
      rendementEpargne: borne(num(o.rendementEpargne, num(h.rendementEpargne, DEFAUTS.rendementEpargne)), 0, 15),
      hausseLogement: borne(num(o.hausseLogement, num(pa.hausseLogement, DEFAUTS.hausseLogement)), -10, 15)
    };
  }

  /* Reste dû d'un crédit : saisi, sinon déduit de la mensualité, du taux et des échéances restantes. */
  function resteDu(c, restantes) {
    if (!(restantes > 0) || !(c.mensualite > 0)) return 0;
    if (c.capitalRestant > 0) return c.capitalRestant;
    return c.tauxPct > 0 ? OC.capitalPourMensualite(c.mensualite, c.tauxPct, restantes) : c.mensualite * restantes;
  }
  function creditsEnCours(sy) {
    var p = sy.profil;
    return p.credits.map(function (c, i) {
      var r = sy.credits && sy.credits[i] ? sy.credits[i].restantes : c.moisRestants;
      return { i: i, c: c, restantes: r, crd: resteDu(c, r) };
    }).filter(function (x) { return x.restantes > 0 && x.c.mensualite > 0 && x.crd > 0; });
  }

  /* Un mois d'un crédit : intérêts, échéance payée (la dernière peut être plus petite), nouveau reste dû. */
  function moisCredit(crd, M, tauxPct) {
    var it = crd * tauxPct / 1200, paye = Math.min(M, crd + it);
    return { it: it, paye: paye, crd: Math.max(0, crd + it - paye) };
  }
  /* Échéancier jusqu'au solde : nombre d'échéances et intérêts. Plafonné (480 mois) pour un crédit mal saisi. */
  function solder(crd, M, tauxPct) {
    var n = 0, it = 0;
    while (crd > 0.0005 && n < 480) { var m = moisCredit(crd, M, tauxPct); it += m.it; crd = m.crd; n++; }
    return { mois: n, interets: it };
  }

  /* Profil où l'épargne disponible a augmenté : mois de réserve et points de santé. */
  function depensesReserve(sy) {
    var p = sy.profil, net = sy.salaire.netMoyen + p.autresRevenus;
    var d = sy.chargesCredits + p.loyer + p.chargesFixes;
    /* Même règle que le score de santé : des dépenses déclarées trop faibles comptent pour la moitié du net. */
    return d < net * 0.3 ? net * 0.5 : d;
  }
  function pointsReserve(mois) { return mois >= 6 ? 20 : mois >= 3 ? 13 : mois >= 1 ? 6 : 0; }

  /* ===================================================================
     Rembourser ou épargner ?
     =================================================================== */
  function comparer(sy, options) {
    var o = options || {}, p = sy.profil, m = sy.maintenant || new Date();
    var somme = Math.max(0, Math.round(num(o.somme, 0) * 1000) / 1000);
    var H = o.horizon === 10 ? 10 : 5, nH = H * 12;
    var hy = hypotheses(p, o), re = hy.rendementEpargne / 100, ra = hy.rendementAv / 100;
    var reM = Math.pow(1 + re, 1 / 12) - 1;
    var choix = [];

    /* 1. Rembourser le crédit le plus cher (taux le plus haut ; à taux égal, le plus long). */
    var cr = creditsEnCours(sy).filter(function (x) { return x.c.tauxPct > 0; })
      .sort(function (a, b) { return b.c.tauxPct - a.c.tauxPct || b.restantes - a.restantes; })[0];
    if (cr && somme > 0) {
      var verse = Math.min(somme, cr.crd), M = cr.c.mensualite, t = cr.c.tauxPct;
      var avant = solder(cr.crd, M, t), apres = solder(cr.crd - verse, M, t);
      /* Valeur à l'horizon : reste dû en moins + mensualités libérées (placées en épargne) une fois le crédit soldé. */
      var a = cr.crd, b = cr.crd - verse, libere = 0;
      for (var k = 0; k < nH; k++) {
        libere *= 1 + reM;
        if (a > 0.0005) { var ma = moisCredit(a, M, t); a = ma.crd; if (b > 0.0005) b = moisCredit(b, M, t).crd; else libere += ma.paye; }
      }
      var valeurR = (a - b) + libere + (somme - verse) * Math.pow(1 + re, H);
      choix.push({
        cle: "rembourser", disponible: true, libelle: "Rembourser le " + cr.c.libelle.toLowerCase(), credit: cr.c.libelle, index: cr.i,
        tauxPct: t, verse: verse, interetsEvites: Math.max(0, avant.interets - apres.interets), moisGagnes: Math.max(0, avant.mois - apres.mois),
        /* La première échéance restante est celle du mois en cours. */
        finAvant: dateDans(m, avant.mois - 1), finApres: apres.mois > 0 ? dateDans(m, apres.mois - 1) : "tout de suite", solde: apres.mois === 0,
        valeur: valeurR, gain: valeurR - somme, disponibleAToutMoment: false
      });
    } else {
      choix.push({ cle: "rembourser", disponible: false, libelle: "Rembourser un crédit", raison: cr ? "" : "Aucun crédit en cours à rembourser.", valeur: somme, gain: 0 });
    }

    /* 2. Assurance vie ou CEA : économie d'impôt de cette année (moteur fiscal), placée en épargne, puis rendement. */
    var ev = OI.economieVersement(sy, somme);
    var valeurP = somme * Math.pow(1 + ra, H) + ev.eco * Math.pow(1 + re, H);
    choix.push({
      cle: "placer", disponible: somme > 0, libelle: "Assurance vie ou CEA", economieImpot: ev.eco, av: ev.av, cea: ev.cea, horsPlafond: ev.horsPlafond || 0,
      tauxImpot: somme > 0 ? ev.eco / somme : 0, dureeAv: ev.dureeAv, dureeCea: ev.dureeCea,
      valeur: valeurP, gain: valeurP - somme, disponibleAToutMoment: false
    });

    /* 3. Épargne de précaution : disponible à tout moment. */
    var dep = depensesReserve(sy), moisAvant = dep > 0 ? p.epargneDisponible / dep : 0, moisApres = dep > 0 ? (p.epargneDisponible + somme) / dep : 0;
    var valeurE = somme * Math.pow(1 + re, H);
    choix.push({
      cle: "reserve", disponible: somme > 0, libelle: "Épargne de précaution", moisAvant: moisAvant, moisApres: moisApres,
      points: pointsReserve(moisApres) - pointsReserve(moisAvant), valeur: valeurE, gain: valeurE - somme, disponibleAToutMoment: true
    });

    var dispo = choix.filter(function (c) { return c.disponible; });
    var meilleur = dispo.slice().sort(function (x, y) { return y.gain - x.gain; })[0] || null;

    /* Conseil : compléter d'abord une réserve de 3 mois de dépenses, puis le choix le plus rentable. */
    var manque = Math.max(0, RESERVE_MOIS * dep - p.epargneDisponible), parts = [];
    var meilleurPlace = dispo.filter(function (c) { return c.cle !== "reserve"; }).sort(function (x, y) { return y.gain - x.gain; })[0];
    if (somme > 0) {
      var versReserve = manque > 0 ? Math.min(somme, Math.ceil(manque / 10) * 10) : 0;
      if (versReserve > 0) parts.push({ cle: "reserve", montant: versReserve });
      if (somme - versReserve > 0.0005) parts.push({ cle: meilleurPlace ? meilleurPlace.cle : "reserve", montant: somme - versReserve });
    }
    return {
      somme: somme, horizon: H, hypotheses: hy, choix: choix, meilleur: meilleur ? meilleur.cle : null,
      reserve: { depensesMois: dep, cible: RESERVE_MOIS * dep, manque: manque, mois: moisAvant },
      conseil: { parts: parts, partage: parts.length > 1 }
    };
  }

  /* Prochaines primes (versements en plus du salaire habituel) : mois et montant net estimé. */
  function prochainesPrimes(sy, n) {
    var p = sy.profil, m = sy.maintenant || new Date(), cal = OC.calendrierPrimes(p), out = [];
    var net = sy.salaire.netMensuel;
    for (var k = 0; k < 12 && out.length < (n || 2); k++) {
      var d = new Date(m.getFullYear(), m.getMonth() + k, 1), x = cal[d.getMonth()];
      if (x > 0) out.push({ mois: MOIS[d.getMonth()], annee: d.getFullYear(), salaires: x, montant: Math.round(x * net / 10) * 10, dansMois: k });
    }
    return out;
  }

  /* ===================================================================
     Patrimoine net
     =================================================================== */
  function patrimoine(sy, options) {
    var o = options || {}, p = sy.profil, m = sy.maintenant || new Date(), pa = p.patrimoine || {};
    var hy = hypotheses(p, o), ra = hy.rendementAv / 100, hl = hy.hausseLogement / 100;
    var logement = Math.max(0, num(o.logement, num(pa.logement, 0))), autres = Math.max(0, num(o.autres, num(pa.autres, 0)));
    var contrats = (sy.contrats || []).filter(function (c, i) { return OC.contratCommence(p.contrats[i], m); });
    var capContrats = contrats.reduce(function (t, c) { return t + c.capital; }, 0);
    var credits = creditsEnCours(sy);
    var actifs = [];
    if (logement > 0) actifs.push({ cle: "logement", libelle: "Logement", montant: logement, estime: true });
    if (autres > 0) actifs.push({ cle: "autres", libelle: "Autres biens", montant: autres, estime: true });
    actifs.push({ cle: "epargne", libelle: "Épargne disponible", montant: p.epargneDisponible });
    if (capContrats > 0) actifs.push({ cle: "contrats", libelle: "Assurance vie et CEA", montant: capContrats, estime: contrats.some(function (c) { return c.estime; }) });
    var passifs = credits.map(function (x) { return { cle: "credit-" + x.i, libelle: x.c.libelle, montant: x.crd, estime: !(x.c.capitalRestant > 0) }; });
    var totA = actifs.reduce(function (t, a) { return t + a.montant; }, 0), totP = passifs.reduce(function (t, a) { return t + a.montant; }, 0);

    /* Projection mois par mois : logement +hausse par an, contrats au rendement avec leurs versements, crédits amortis. */
    var finMax = credits.reduce(function (t, x) { return Math.max(t, x.restantes); }, 0);
    var ans = borne(Math.ceil(finMax / 12) + 3, 10, 25);
    var raM = Math.pow(1 + ra, 1 / 12) - 1, hlM = Math.pow(1 + hl, 1 / 12) - 1;
    var versements = p.contrats.reduce(function (t, c) { return t + c.versementMensuel; }, 0);
    var etat = credits.map(function (x) { return { crd: x.crd, M: x.c.mensualite, t: x.c.tauxPct, x: x, fin: null }; });
    var lg = logement, ct = capContrats, courbe = [], netA = totA - totP, an0 = m.getFullYear() + m.getMonth() / 12;
    courbe.push({ x: an0, annee: m.getFullYear(), net: netA, dettes: totP, actifs: totA });
    var net12 = null;
    for (var k = 1; k <= ans * 12; k++) {
      lg *= 1 + hlM; ct = ct * (1 + raM) + versements;
      var dettes = 0;
      etat.forEach(function (e) {
        if (e.crd > 0.0005) { e.crd = e.t > 0 ? moisCredit(e.crd, e.M, e.t).crd : Math.max(0, e.crd - e.M); if (e.crd <= 0.0005 && e.fin === null) e.fin = k; }
        dettes += e.crd;
      });
      var actifsK = lg + autres + p.epargneDisponible + ct, netK = actifsK - dettes;
      if (k === 12) net12 = netK;
      if (k % 12 === 0) courbe.push({ x: an0 + k / 12, annee: m.getFullYear() + k / 12, net: netK, dettes: dettes, actifs: actifsK });
    }
    /* Jalons : fin de chaque crédit (marge libérée), patrimoine doublé, logement payé. */
    var jalons = [];
    etat.filter(function (e) { return e.fin !== null; }).sort(function (a, b) { return a.fin - b.fin; }).forEach(function (e) {
      var d = new Date(m.getFullYear(), m.getMonth() + e.fin - 1, 1);
      jalons.push({ cle: "credit", x: d.getFullYear() + d.getMonth() / 12, annee: d.getFullYear(), mois: MOIS[d.getMonth()], libelle: e.x.c.libelle, marge: e.M, logement: e.x.c.type === "immo" && logement > 0 });
    });
    if (netA > 0) {
      var dbl = courbe.filter(function (c) { return c.net >= 2 * netA; })[0];
      if (dbl) jalons.push({ cle: "double", annee: dbl.annee });
    }
    jalons.sort(function (a, b) { return a.annee - b.annee; });
    return {
      actifs: actifs, passifs: passifs, totalActifs: totA, totalPassifs: totP, net: netA,
      parMois: net12 === null ? 0 : (net12 - netA) / 12, courbe: courbe, jalons: jalons, hypotheses: hy,
      logementSaisi: logement > 0
    };
  }

  return { DEFAUTS: DEFAUTS, RESERVE_MOIS: RESERVE_MOIS, hypotheses: hypotheses, resteDu: resteDu, solder: solder, comparer: comparer, prochainesPrimes: prochainesPrimes, patrimoine: patrimoine };
});
