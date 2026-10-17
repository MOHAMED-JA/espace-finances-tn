/*
 * Orbite — « Rembourser ou épargner ? » et « Patrimoine net » (maquette validée le 13 oct. 2026). Pur, testé sous Node.
 *   comparer(sy, options)   : pour une somme (une prime…), trois choix comparés à un horizon de 5 ou 10 ans :
 *                             rembourser par anticipation le crédit le plus cher (durée plus courte, même mensualité),
 *                             verser en assurance vie / CEA (économie d'impôt du moteur fiscal, puis rendement),
 *                             garder en épargne de précaution ; puis un conseil (réserve de 3 mois d'abord).
 *   banques(sy, liste, type)  : combien chaque banque prêterait selon sa règle (net / brut, mois / année ÷ 12, quotité).
 *   patrimoine(sy, options) : ce que l'on possède (logement, autres biens, épargne, contrats) moins ce que l'on doit
 *                             (reste dû des crédits), courbe année par année et jalons (fin des crédits…).
 * Toutes les règles viennent d'OrbiteCalcul (crédits, contrats) et d'OrbiteIntelligence (impôt) : rien n'est dupliqué.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-intelligence.js"), require("./placements-calcul.js"), require("./pilotage-calcul.js"));
  } else {
    racine.DeciderCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.PlacementsCalcul, racine.PilotageCalcul);
  }
})(typeof self !== "undefined" ? self : this, function (OC, OI, PL, PI) {
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
  /* Dépenses d'un mois : même définition que la réserve de sécurité et le score de santé (OC.depensesMois, 15 oct. 2026). */
  function depensesReserve(sy) { return OC.depensesMois(sy).total; }
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

    /* 3. Réserve de sécurité : disponible à tout moment. */
    var dep = depensesReserve(sy), moisAvant = dep > 0 ? p.epargneDisponible / dep : 0, moisApres = dep > 0 ? (p.epargneDisponible + somme) / dep : 0;
    var valeurE = somme * Math.pow(1 + re, H);
    choix.push({
      cle: "reserve", disponible: somme > 0, libelle: "Réserve de sécurité", moisAvant: moisAvant, moisApres: moisApres,
      points: pointsReserve(moisApres) - pointsReserve(moisAvant), valeur: valeurE, gain: valeurE - somme, disponibleAToutMoment: true
    });

    var dispo = choix.filter(function (c) { return c.disponible; });
    var meilleur = dispo.slice().sort(function (x, y) { return y.gain - x.gain; })[0] || null;

    /* Conseil : compléter d'abord la réserve de sécurité (3 mois de dépenses par défaut, réglable dans Ma progression),
       puis le choix le plus rentable. */
    var cibleR = OC.cibleReserve(sy), manque = Math.max(0, cibleR - p.epargneDisponible), parts = [];
    var meilleurPlace = dispo.filter(function (c) { return c.cle !== "reserve"; }).sort(function (x, y) { return y.gain - x.gain; })[0];
    if (somme > 0) {
      var versReserve = manque > 0 ? Math.min(somme, Math.ceil(manque / 10) * 10) : 0;
      if (versReserve > 0) parts.push({ cle: "reserve", montant: versReserve });
      if (somme - versReserve > 0.0005) parts.push({ cle: meilleurPlace ? meilleurPlace.cle : "reserve", montant: somme - versReserve });
    }
    return {
      somme: somme, horizon: H, hypotheses: hy, choix: choix, meilleur: meilleur ? meilleur.cle : null,
      reserve: { depensesMois: dep, cible: cibleR, manque: manque, mois: moisAvant },
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
    /* Mon patrimoine (lot A) : biens loués, placements à taux connu (en cours), bourse et or, à leur valeur saisie. */
    var plac = PL && p.placements ? PL.analyser(p.placements, { aujourdhui: PL.iso(m) }) : null, valPlac = 0;
    if (plac && !plac.vide) {
      [["immo-locatif", "Immobilier locatif", plac.immobilier.total, true], ["taux", "Placements à taux connu", plac.taux.total, false],
       ["bourse", "Bourse, SICAV et FCP", plac.bourse.valeur, true], ["or", "Or", plac.or.valeur, true]].forEach(function (x) {
        if (x[2] > 0) { actifs.push({ cle: x[0], libelle: x[1], montant: x[2], estime: x[3] }); valPlac += x[2]; }
      });
    }
    if (capContrats > 0) actifs.push({ cle: "contrats", libelle: "Assurance vie et CEA", montant: capContrats, estime: contrats.some(function (c) { return c.estime; }) });
    var passifs = credits.map(function (x) { return { cle: "credit-" + x.i, libelle: x.c.libelle, montant: x.crd, estime: !(x.c.capitalRestant > 0) }; });
    /* Entre proches (lot B) : ce qu'on vous doit est un actif, ce que vous devez une dette ; constants dans la projection. */
    var pro = PI && p.proches && p.proches.length ? PI.analyserProches(p.proches, { aujourdhui: PI.iso(m) }) : null, detteProches = 0;
    if (pro) {
      if (pro.onVousDoit > 0) { actifs.push({ cle: "proches", libelle: "Prêté aux proches", montant: pro.onVousDoit }); valPlac += pro.onVousDoit; }
      if (pro.vousDevez > 0) { passifs.push({ cle: "proches-dette", libelle: "Dû à des proches", montant: pro.vousDevez }); detteProches = pro.vousDevez; }
    }
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
      var dettes = detteProches;
      etat.forEach(function (e) {
        if (e.crd > 0.0005) { e.crd = e.t > 0 ? moisCredit(e.crd, e.M, e.t).crd : Math.max(0, e.crd - e.M); if (e.crd <= 0.0005 && e.fin === null) e.fin = k; }
        dettes += e.crd;
      });
      var actifsK = lg + autres + p.epargneDisponible + ct + valPlac, netK = actifsK - dettes;
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

  /* ===================================================================
     Comparateur de banques (Crédit › Banques, maquette validée le 13 oct. 2026)
     Chaque banque : base (net ou brut), revenu retenu (salaire du mois, ou salaires et primes de l'année ÷ 12),
     quotité. Mêmes crédits en cours, même âge, mêmes taux pour toutes : seule la règle change.
     =================================================================== */
  var MAX_BANQUES = 6;
  function revenuBanque(sy, base, revenu) {
    var s = sy.salaire, p = sy.profil;
    var m = base === "brut" ? (revenu === "annee" ? s.brutAnnuel / 12 : s.brutMensuel) : (revenu === "annee" ? s.netAnnuel / 12 : s.netMensuel);
    return m + (p.autresRevenus || 0);
  }
  function maBanque(p) {
    return { nom: p.banque || "Ma banque", base: p.baseBanque === "brut" ? "brut" : "net", revenu: p.revenuBanque === "annuel" ? "annee" : "mois",
      quotite: p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet };
  }
  /* Sans banque enregistrée : la règle de la banque du profil, puis les trois autres règles (quotité de 40 %). */
  function banquesParDefaut(p) {
    var m = maBanque(p), out = [m], noms = ["Banque B", "Banque C", "Banque D"], k = 0;
    [["net", "mois"], ["net", "annee"], ["brut", "mois"], ["brut", "annee"]].forEach(function (r) {
      if (r[0] === m.base && r[1] === m.revenu) return;
      out.push({ nom: noms[k++], base: r[0], revenu: r[1], quotite: OC.QUOTITE });
    });
    return out;
  }
  function banques(sy, liste, cle) {
    var p = sy.profil, L = (liste && liste.length ? liste : banquesParDefaut(p)).slice(0, MAX_BANQUES), taux = OC.tauxNouveaux(p);
    var lignes = L.map(function (b) {
      var base = b.base === "brut" ? "brut" : "net", revenu = b.revenu === "annee" ? "annee" : "mois", q = borne(num(b.quotite, OC.QUOTITE), 0.1, 0.8);
      var rev = revenuBanque(sy, base, revenu), cap = OC.capacite(rev, q, sy.chargesCredits, sy.age, taux);
      var c = cap.credits.filter(function (x) { return x.cle === (cle || "immo"); })[0] || cap.credits[0];
      return { nom: b.nom || "Banque", base: base, revenu: revenu, quotite: q, revenuMensuel: rev, mensualite: cap.mensualiteMax,
        capital: c.capital, dureeMois: c.dureeMois, tauxPct: c.tauxPct, dureeLimitee: c.dureeLimitee };
    });
    var vals = lignes.map(function (x) { return x.capital; }), max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([max]));
    var meilleur = lignes.length ? vals.indexOf(max) : -1;
    return { lignes: lignes, meilleur: meilleur, max: max, ecart: max - min, ecartMienne: lignes.length ? max - lignes[0].capital : 0,
      charges: sy.chargesCredits, type: cle || "immo" };
  }

  return { DEFAUTS: DEFAUTS, RESERVE_MOIS: RESERVE_MOIS, MAX_BANQUES: MAX_BANQUES, hypotheses: hypotheses, resteDu: resteDu, solder: solder, comparer: comparer, prochainesPrimes: prochainesPrimes, patrimoine: patrimoine,
    revenuBanque: revenuBanque, banquesParDefaut: banquesParDefaut, banques: banques };
});
