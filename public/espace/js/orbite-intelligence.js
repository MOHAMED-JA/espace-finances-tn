/*
 * Orbite — intelligence financière (pur, sans navigateur, testé sous Node).
 *   scoreSante(sy)                 : score de santé financière de 0 à 100, détail et objectifs pour l'améliorer
 *   optimiseurFiscal(sy, options)  : meilleure répartition assurance vie / CEA, versement utile avant le 31 décembre
 *   simulateurVie(profil, evts)    : mariage, naissance, achat immobilier, voiture, mutation, augmentation ;
 *                                    tout le profil est recalculé, avec une comparaison avant / après
 * S'appuie sur OrbiteCalcul (synthèse du profil) et MoteurFiscal (règles de l'impôt) : aucune règle n'est dupliquée.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("../../moteurs/vie/moteur-fiscal.js"));
  } else {
    racine.OrbiteIntelligence = fabrique(racine.OrbiteCalcul, racine.MoteurFiscal);
  }
})(typeof self !== "undefined" ? self : this, function (OC, MF) {
  "use strict";

  function borne(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function arrondi(v, pas) { return Math.round(v / pas) * pas; }
  function dt(v) { return Math.round(v).toLocaleString("fr-FR") + "\u00a0DT"; }
  function nb(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }

  /* ===================================================================
     Fiscalité : économie d'impôt pour des montants annuels d'assurance vie et de CEA
     =================================================================== */
  function entreeFiscale(sy, av, cea) {
    var p = sy.profil;
    /* Revenu de l'année civile : calculé mois par mois si le salaire change dans l'année. */
    var s = sy.salaireAnnee || sy.salaire;
    return { revenu: s.revenuFiscal, chef: p.chefDeFamille, enfants: p.enfants, infirmes: p.handicapes,
      etudiants: p.etudiants, parents: p.parents, investissementAv: av, investissementCea: cea, leger: true, abattementTaux: sy.salaire.abattementTaux };
  }
  function economie(sy, av, cea) { return MF.simuler(entreeFiscale(sy, av, cea)).economie; }

  /* Versements annuels déjà prévus : mensualités × 12 + versements libres de l'année. */
  function versementsAnnuels(p) {
    var av = 0, cea = 0;
    p.contrats.forEach(function (c) { if (!OC.contratCommence(c)) return; var an = c.versementMensuel * 12 + c.versementsLibresAn; if (c.type === "cea") cea += an; else av += an; });
    return { av: av, cea: cea };
  }

  /* Meilleure répartition d'un montant supplémentaire D entre assurance vie et CEA (montants déjà versés en plancher). */
  function meilleurPartage(sy, ex, D, plafAv, plafCea) {
    var meilleur = { av: Math.min(D, Math.max(0, plafAv - ex.av)), cea: 0, eco: -1 };
    var pas = Math.max(10, D / 60), n = Math.ceil(D / pas - 1e-9);
    /* Parcours de « tout en assurance vie » vers « tout en CEA » : à économie égale, la première trouvée (la plus forte
       part d'assurance vie) est gardée — pas de blocage en bourse, capital garanti selon le contrat. (Corrigé le 14 oct. 2026 :
       le parcours inverse gardait le CEA à économie égale.) */
    for (var i = 0; i <= n; i++) {
      var x = Math.max(0, D - i * pas);
      var av = Math.min(x, Math.max(0, plafAv - ex.av)), cea = Math.min(D - x, Math.max(0, plafCea - ex.cea));
      var e = economie(sy, ex.av + av, ex.cea + cea);
      if (e > meilleur.eco + 0.5) meilleur = { av: av, cea: cea, eco: e };
    }
    return meilleur;
  }

  /* Économie d'impôt d'une somme versée en plus cette année (assurance vie et / ou CEA, meilleur partage,
     dans la limite des plafonds) : utilisée par « Rembourser ou épargner ? ». */
  function economieVersement(sy, D) {
    var P = MF.simuler(entreeFiscale(sy, 0, 0)).produits, revenu = (sy.salaireAnnee || sy.salaire).revenuFiscal;
    var plafAv = Math.min(isFinite(P.av.plafond) ? P.av.plafond : revenu, revenu);
    var plafCea = Math.min(isFinite(P.cea.plafond) ? P.cea.plafond : revenu, revenu);
    var ex = versementsAnnuels(sy.profil), avant = economie(sy, ex.av, ex.cea);
    if (!(D > 0)) return { eco: 0, av: 0, cea: 0, dureeAv: P.av.dureeMinimaleAns || 8, dureeCea: P.cea.dureeBlocageAns || 5 };
    var m = meilleurPartage(sy, ex, D, plafAv, plafCea);
    return { eco: Math.max(0, m.eco - avant), av: m.av, cea: m.cea, horsPlafond: Math.max(0, D - m.av - m.cea),
      dureeAv: P.av.dureeMinimaleAns || 8, dureeCea: P.cea.dureeBlocageAns || 5 };
  }

  function optimiseurFiscal(sy, options) {
    var o = options || {}, p = sy.profil, m = o.maintenant || sy.maintenant || new Date();
    var base = MF.simuler(entreeFiscale(sy, 0, 0));
    var P = base.produits, revenu = (sy.salaireAnnee || sy.salaire).revenuFiscal;
    var plafAv = Math.min(isFinite(P.av.plafond) ? P.av.plafond : revenu, revenu);
    var plafCea = Math.min(isFinite(P.cea.plafond) ? P.cea.plafond : revenu, revenu);
    var ex = versementsAnnuels(p);
    var ecoActuelle = economie(sy, ex.av, ex.cea);
    var ecoMax = economie(sy, Math.max(ex.av, plafAv), Math.max(ex.cea, plafCea));
    var fin = new Date(m.getFullYear(), 11, 31, 23, 59, 59);
    var jours = Math.max(0, Math.ceil((fin - m) / 86400000));
    var moisRestants = 12 - m.getMonth();
    var res = {
      impotAvant: base.impotAvant, impotMinimum: base.impotMinimum,
      plafonds: { av: P.av.plafond, cea: P.cea.plafond },
      dureeAv: P.av.dureeMinimaleAns || 8, dureeCea: P.cea.dureeBlocageAns || 5,
      actuel: ex, economieActuelle: ecoActuelle, economieMax: ecoMax,
      gainPossible: Math.max(0, ecoMax - ecoActuelle),
      annee: m.getFullYear(), joursAvantFin: jours, moisRestants: moisRestants,
      /* Rappel : les trois derniers mois de l'année, s'il reste une économie à saisir. */
      rappel: jours <= 92 && ecoMax - ecoActuelle > 20,
      complement: { av: 0, cea: 0, total: 0 }, optimum: { av: ex.av, cea: ex.cea }
    };
    /* Ce que la paie peut encore rendre d'ici le 31 décembre : l'impôt qui reste à retenir sur les salaires et primes à venir,
       net de l'avantage des contrats déjà pris en compte. Au-delà, l'économie se récupère par la déclaration annuelle. */
    var rest = OC.impotRestantAnnee ? OC.impotRestantAnnee(sy, m) : null;
    if (rest) {
      var sAn = sy.salaireAnnee || sy.salaire, impotAn = Math.max(1, sAn.irpp + sAn.css);
      /* L'employeur tient-il déjà compte des contrats en cours dans la retenue mensuelle ? Oui par défaut (profil.avPaie). */
      var applique = sy.profil.avPaie !== false && ecoActuelle > 0, part = applique ? ecoActuelle / impotAn : 0;
      res.paie = { moisRestants: rest.moisRestants, primesRestantes: rest.primesRestantes,
        impotRestant: Math.max(0, rest.montant * (1 - part)),
        detail: { impotAn: impotAn, impotMois: sAn.impotMois, impotParVersement: sAn.impotParVersement, moisParMois: !!rest.moisParMois,
          avantPart: rest.montant, ecoActuelle: ecoActuelle, part: part, appliquee: applique, contrats: ecoActuelle > 0 } };
    }
    if (base.impotAvant <= 0) { res.statut = "sans_impot"; return res; }
    if (res.gainPossible <= 20) { res.statut = "optimise"; return res; }
    /* Plus petit montant supplémentaire qui atteint (à 1 DT près) l'économie maximale : recherche par dichotomie. */
    var bas = 0, haut = Math.max(0, plafAv - ex.av) + Math.max(0, plafCea - ex.cea), part = null;
    for (var i = 0; i < 18 && haut - bas > 20; i++) {
      var mil = (bas + haut) / 2, essai = meilleurPartage(sy, ex, mil, plafAv, plafCea);
      if (essai.eco >= ecoMax - 1) { haut = mil; part = essai; } else bas = mil;
    }
    part = part || meilleurPartage(sy, ex, haut, plafAv, plafCea);
    var cAv = arrondi(part.av, 10), cCea = arrondi(part.cea, 10);
    res.statut = "a_optimiser";
    res.complement = { av: cAv, cea: cCea, total: cAv + cCea };
    res.optimum = { av: ex.av + cAv, cea: ex.cea + cCea };
    res.economieOptimum = economie(sy, ex.av + cAv, ex.cea + cCea);
    /* Avec un budget annuel limité (par exemple ce que le budget mensuel permet), meilleure répartition. */
    if (o.budgetAnnuel > 0 && o.budgetAnnuel < res.complement.total) {
      var b = meilleurPartage(sy, ex, o.budgetAnnuel, plafAv, plafCea);
      res.avecBudget = { budget: o.budgetAnnuel, av: arrondi(b.av, 10), cea: arrondi(b.cea, 10), economie: b.eco, gain: Math.max(0, b.eco - ecoActuelle) };
    }
    /* Calendrier : le versement compte pour l'année s'il est encaissé avant le 31 décembre. */
    res.parMoisRestant = moisRestants > 0 ? arrondi(res.complement.total / moisRestants, 10) : res.complement.total;
    if (res.paie) {
      var R0 = res.paie.impotRestant;
      res.paie.recuperable = Math.min(res.gainPossible, R0);
      res.paie.declaration = Math.max(0, res.gainPossible - R0);
      /* Versement « optimal paie » : le plus petit complément dont tout l'avantage revient sur les paies de l'année. */
      if (res.paie.declaration > 20) {
        var b0 = 0, h0 = res.complement.total, sol = null;
        for (var k = 0; k < 18 && h0 - b0 > 10; k++) {
          var mi = (b0 + h0) / 2, es = meilleurPartage(sy, ex, mi, plafAv, plafCea);
          if (es.eco - ecoActuelle >= R0 - 1) { h0 = mi; sol = es; } else b0 = mi;
        }
        sol = sol || meilleurPartage(sy, ex, h0, plafAv, plafCea);
        var oAv = arrondi(sol.av, 10), oCea = arrondi(sol.cea, 10);
        res.optimalPaie = { av: oAv, cea: oCea, total: oAv + oCea, gain: Math.min(R0, economie(sy, ex.av + oAv, ex.cea + oCea) - ecoActuelle) };
      }
    }
    res.dateConseillee = new Date(m.getFullYear(), 11, 15);
    return res;
  }

  /* ===================================================================
     Mon plan de versement (14 oct. 2026) : ce que la situation permet de verser d'ici le 31 décembre
     (marge du mois, primes à venir, épargne au-delà d'une réserve), réparti entre assurance vie et CEA
     selon un pourcentage choisi, l'économie d'impôt qui en découle et le calendrier des versements.
     =================================================================== */
  var PLAN_DEFAUT = { partMarge: 0.5, partPrimes: 0.5, reserve: null, partAv: null };
  var ENVELOPPES_VIE = ["courses", "transport", "sante", "loisirs", "divers"];
  function dizaineInf(v) { return Math.max(0, Math.floor(v / 10 + 1e-9) * 10); }
  function jourDe(an, mois, jour) { return new Date(an, mois, Math.min(jour, new Date(an, mois + 1, 0).getDate()), 12, 0, 0); }

  function planVersement(sy, reglages, options) {
    var o = options || {}, p = sy.profil, s = sy.salaire, m = o.maintenant || sy.maintenant || new Date();
    var r = Object.assign({}, PLAN_DEFAUT, p.planVersement || {}, reglages || {});
    r.partMarge = borne(Number(r.partMarge) || 0, 0, 1); r.partPrimes = borne(Number(r.partPrimes) || 0, 0, 1);
    if (r.partAv !== null && r.partAv !== undefined) r.partAv = borne(Number(r.partAv) || 0, 0, 1); else r.partAv = null;
    var opt = o.optimiseur || optimiseurFiscal(sy, { maintenant: m });
    var P = MF.simuler(entreeFiscale(sy, 0, 0)).produits, revenu = (sy.salaireAnnee || sy.salaire).revenuFiscal;
    var plafAv = Math.min(isFinite(P.av.plafond) ? P.av.plafond : revenu, revenu);
    var plafCea = Math.min(isFinite(P.cea.plafond) ? P.cea.plafond : revenu, revenu);
    var ex = versementsAnnuels(p), an = m.getFullYear(), mois = m.getMonth();
    var aujourdhui = new Date(an, mois, m.getDate(), 12, 0, 0);

    /* 1. Marge du mois : salaire mensuel habituel (sans les primes, comptées à part) moins crédits, logement, contrats
       en cours et dépenses de vie (budget du mois s'il existe, sinon la moitié de ce qui reste, par prudence). */
    var contratsMois = p.contrats.reduce(function (t, c) { return t + (OC.contratCommence(c, m) ? c.versementMensuel : 0); }, 0);
    var logement = p.loyer + p.chargesFixes;
    var base = Math.max(0, s.netMensuel + p.autresRevenus - sy.chargesCredits - logement - contratsMois);
    var env = p.budget && p.budget.enveloppes && p.budget.enveloppes.length ? p.budget.enveloppes : null, vie, source;
    if (env) {
      vie = env.reduce(function (t, e) { return t + (ENVELOPPES_VIE.indexOf(e.cle) !== -1 ? e.prevu : 0); }, 0);
      var envLog = env.filter(function (e) { return e.cle === "logement"; })[0];
      if (envLog) vie += Math.max(0, envLog.prevu - logement);
      source = "budget";
    } else { vie = base * 0.5; source = "estimation"; }
    var libre = Math.max(0, base - vie), mensuel = dizaineInf(libre * r.partMarge);
    var jp = p.jourPaie > 0 ? p.jourPaie : 28, entrees = [];
    for (var k = mois; k < 12; k++) {
      var d = jourDe(an, k, jp); if (d < aujourdhui) d = aujourdhui;
      if (mensuel > 0) entrees.push({ date: d, montant: mensuel, source: "marge" });
    }
    var nMois = 12 - mois;

    /* 2. Primes à venir cette année (calendrier des primes), au net d'un salaire de prime ; celles déjà versées sont écartées. */
    var cal = OC.calendrierPrimes(p), extra = cal.reduce(function (t, v) { return t + v; }, 0);
    var netPrime = extra > 0 ? Math.max(0, (s.netAnnuel - 12 * s.netMensuel) / extra) : 0;
    var primes = [];
    for (var j = mois; j < 12; j++) {
      if (!(cal[j] > 0) || !(netPrime > 0)) continue;
      var dp = jourDe(an, j, jp); if (dp < aujourdhui) continue;
      var net = cal[j] * netPrime, part = dizaineInf(net * r.partPrimes);
      primes.push({ mois: j, date: dp, salaires: cal[j], net: net, montant: part });
      if (part > 0) entrees.push({ date: dp, montant: part, source: "prime" });
    }

    /* 3. Épargne disponible au-delà d'une réserve (3 mois de dépenses par défaut). */
    var depenses = sy.chargesCredits + logement + contratsMois + vie;
    var reserveConseillee = Math.round(3 * depenses / 100) * 100;
    var reserve = r.reserve === null || r.reserve === undefined ? reserveConseillee : Math.max(0, r.reserve);
    var utilisable = dizaineInf(p.epargneDisponible - reserve);
    if (utilisable > 0) entrees.push({ date: aujourdhui, montant: utilisable, source: "epargne" });

    var totalMarge = mensuel * nMois, totalPrimes = primes.reduce(function (t, x) { return t + x.montant; }, 0);
    var abordable = totalMarge + totalPrimes + utilisable;
    /* Au-delà du complément qui atteint l'économie maximale, un versement de plus ne baisse plus l'impôt cette année. */
    var besoin = opt.statut === "a_optimiser" ? opt.complement.total : 0;
    var D = Math.min(abordable, besoin), surplus = Math.max(0, abordable - besoin);

    /* 4. Répartition : conseillée (meilleure économie, assurance vie d'abord) ou pourcentage choisi. */
    var best = D > 0 ? meilleurPartage(sy, ex, D, plafAv, plafCea) : { av: 0, cea: 0, eco: opt.economieActuelle };
    var avC = Math.round(best.av), conseil = { av: avC, cea: D - avC, partAv: D > 0 ? avC / D : 1 };
    var av, cea;
    if (r.partAv === null) { av = conseil.av; cea = conseil.cea; }
    else {
      av = Math.min(Math.round(D * r.partAv), Math.max(0, plafAv - ex.av)); cea = Math.min(D - av, Math.max(0, plafCea - ex.cea));
      av = D - cea > av ? Math.min(D - cea, Math.max(0, plafAv - ex.av)) : av;
    }
    var ecoPlan = economie(sy, ex.av + av, ex.cea + cea), gain = Math.max(0, ecoPlan - opt.economieActuelle);
    var gainConseil = D > 0 ? Math.max(0, economie(sy, ex.av + conseil.av, ex.cea + conseil.cea) - opt.economieActuelle) : 0;
    var perte = Math.max(0, gainConseil - gain), ceaUtile = null;
    if (perte > 1 && cea > 0) {
      /* Dépôt CEA au-delà duquel l'impôt ne baisse plus (plancher du CEA), l'assurance vie choisie restant la même. */
      var bas = 0, haut = cea;
      for (var n = 0; n < 30 && haut - bas > 1; n++) { var mi = (bas + haut) / 2; if (economie(sy, ex.av + av, ex.cea + mi) >= ecoPlan - 0.5) haut = mi; else bas = mi; }
      ceaUtile = dizaineInf(haut + 9.999);
    }

    /* 5. Calendrier : les versements les plus proches d'abord, jusqu'au montant utile ; chaque versement suit la répartition. */
    entrees.sort(function (a, b) { return a.date - b.date || (a.source === "epargne" ? -1 : 1); });
    var reste = D, ratio = D > 0 ? av / D : 1, calendrier = [], avCumul = 0;
    entrees.forEach(function (e) {
      if (reste <= 0.5) return;
      var mt = Math.min(e.montant, reste); reste -= mt;
      var prec = calendrier[calendrier.length - 1];
      if (prec && prec.date.getTime() === e.date.getTime()) { prec.montant += mt; prec.sources.push(e.source); }
      else calendrier.push({ date: e.date, montant: mt, sources: [e.source] });
    });
    calendrier.forEach(function (c, i) {
      var a = i === calendrier.length - 1 ? av - avCumul : Math.min(c.montant, Math.round(c.montant * ratio));
      a = Math.max(0, Math.min(c.montant, a)); avCumul += a;
      c.av = a; c.cea = c.montant - a;
    });

    var paie = opt.paie ? { surPaie: Math.min(gain, opt.paie.impotRestant), declaration: Math.max(0, gain - opt.paie.impotRestant) } : null;
    return {
      annee: an, statut: opt.statut, reglages: { partMarge: r.partMarge, partPrimes: r.partPrimes, reserve: r.reserve === null || r.reserve === undefined ? null : reserve, partAv: r.partAv },
      marge: { base: base, vie: vie, source: source, libre: libre, part: r.partMarge, mensuel: mensuel, mois: nMois, total: totalMarge },
      primes: { liste: primes, total: totalPrimes, part: r.partPrimes, netParSalaire: netPrime },
      epargne: { disponible: p.epargneDisponible, reserve: reserve, reserveConseillee: reserveConseillee, utilisable: utilisable },
      abordable: abordable, besoin: besoin, versement: D, surplus: surplus, economieMax: opt.gainPossible || 0,
      av: av, cea: cea, partAv: D > 0 ? av / D : (r.partAv === null ? conseil.partAv : r.partAv), conseille: conseil,
      gain: gain, coutReel: Math.max(0, D - gain), taux: D > 0 ? gain / D : 0, perte: perte, ceaUtile: ceaUtile,
      paie: paie, calendrier: calendrier, dureeAv: P.av.dureeMinimaleAns || 8, dureeCea: P.cea.dureeBlocageAns || 5, plancherCea: P.cea.impotMinimumTaux
    };
  }

  /* ===================================================================
     Score de santé financière (0 à 100)
     =================================================================== */
  var NIVEAUX = [[80, "Excellente"], [60, "Bonne"], [40, "Fragile"], [0, "À redresser"]];

  function scoreSante(sy, options) {
    var o = options || {}, p = sy.profil, s = sy.salaire;
    var b = p.baseBanque, cap = sy.capacite[b], q = b === "brut" ? p.quotiteBrut : p.quotiteNet;
    var net = s.netMoyen + p.autresRevenus;
    var composantes = [];

    /* 1. Endettement au regard de la règle de la banque (25 points) */
    var t = cap.tauxEndettementActuel, r = q > 0 ? t / q : 0;
    var pEnd = t <= 0 ? 25 : r <= 0.5 ? 22 : r <= 0.75 ? 18 : r <= 1 ? 12 : r <= 1.25 ? 5 : 0;
    var sortie = (cap.paliers || []).filter(function (x) { return x.charges <= cap.revenu * q * 0.75; })[0];
    composantes.push({ cle: "endettement", libelle: "Endettement", points: pEnd, max: 25,
      detail: t > 0 ? Math.round(t * 100) + " % de votre revenu " + b + ", pour " + Math.round(q * 100) + " % admis par la banque." : "Aucun crédit en cours.",
      action: pEnd < 18 ? (sortie ? "Votre endettement redevient confortable en " + sortie.date + ". D'ici là, évitez un nouveau crédit et pensez au remboursement anticipé du crédit le plus cher." : "Évitez tout nouveau crédit et envisagez un remboursement anticipé du crédit le plus cher.") : null,
      lien: "#profil?section=credits" });

    /* 2. Reste à vivre après crédits, logement, charges et épargne (20 points) */
    var reste = sy.budget.reste, part = net > 0 ? reste / net : 0;
    var pReste = part >= 0.3 ? 20 : part >= 0.2 ? 15 : part >= 0.1 ? 9 : part > 0 ? 4 : 0;
    composantes.push({ cle: "budget", libelle: "Reste à vivre", points: pReste, max: 20,
      detail: dt(reste) + " par mois après crédits, logement, charges et épargne (" + Math.round(part * 100) + " % de votre net).",
      action: pReste < 15 ? "Visez au moins 20 % de votre net disponible chaque mois : revoyez les charges fixes ou étalez un crédit." : null,
      lien: "#profil?section=budget" });

    /* 3. Épargne de précaution, en mois de dépenses incompressibles (20 points) */
    var depenses = sy.chargesCredits + p.loyer + p.chargesFixes;
    if (depenses < net * 0.3) depenses = net * 0.5;
    var mois = depenses > 0 ? p.epargneDisponible / depenses : 0;
    var pPrec = mois >= 6 ? 20 : mois >= 3 ? 13 : mois >= 1 ? 6 : 0;
    var cible = Math.round(depenses * 6 / 100) * 100;
    composantes.push({ cle: "precaution", libelle: "Épargne de précaution", points: pPrec, max: 20,
      detail: p.epargneDisponible > 0 ? dt(p.epargneDisponible) + " disponibles, soit " + (Math.round(mois * 10) / 10).toLocaleString("fr-FR") + " mois de dépenses." : "Aucune épargne disponible déclarée.",
      action: pPrec < 20 ? "Constituez une réserve de " + dt(cible) + " (6 mois de dépenses), disponible à tout moment." : null,
      lien: "#profil?section=budget" });

    /* 4. Épargne de long terme : versements annuels sur l'assurance vie et le CEA (15 points) */
    var ex = versementsAnnuels(p), tauxEp = net > 0 ? (ex.av + ex.cea) / (net * 12) : 0;
    var pLong = tauxEp >= 0.1 ? 15 : tauxEp >= 0.05 ? 10 : tauxEp > 0 ? 5 : 0;
    composantes.push({ cle: "long_terme", libelle: "Épargne de long terme", points: pLong, max: 15,
      detail: ex.av + ex.cea > 0 ? dt(ex.av + ex.cea) + " par an sur vos contrats (" + nb(tauxEp * 100) + "\u00a0% de votre net)." : "Aucun contrat d'assurance vie ou de CEA.",
      action: pLong < 15 ? "Épargnez régulièrement 10 % de votre net, par exemple " + dt(Math.max(10, Math.round(net * 0.1 / 10) * 10)) + " par mois." : null,
      lien: "#epargne" });

    /* 5. Avantage fiscal utilisé (10 points) */
    var opt = o.optimiseur || optimiseurFiscal(sy, { maintenant: o.maintenant });
    var ratio = opt.economieMax > 0 ? opt.economieActuelle / opt.economieMax : 1;
    var pFisc = opt.impotAvant <= 0 || ratio >= 0.9 ? 10 : ratio >= 0.5 ? 6 : ratio > 0 ? 3 : 0;
    composantes.push({ cle: "fiscal", libelle: "Avantage fiscal", points: pFisc, max: 10,
      detail: opt.impotAvant <= 0 ? "Vous ne payez pas d'impôt sur le revenu : rien à optimiser." : dt(opt.economieActuelle) + " économisés sur " + dt(opt.economieMax) + " possibles par an.",
      action: pFisc < 10 ? "Vous pouvez encore réduire votre impôt de " + dt(opt.gainPossible) + " par an : voir l'optimiseur fiscal." : null,
      lien: "#vie?onglet=fiscal" });

    /* 6. Coût des crédits : taux au-dessus du marché (10 points) */
    var hauts = OC.analyseTaux(p).hauts;
    var pTaux = Math.max(0, 10 - hauts.length * 4);
    composantes.push({ cle: "taux", libelle: "Coût des crédits", points: pTaux, max: 10,
      detail: !p.credits.length ? "Aucun crédit en cours." : hauts.length ? hauts.length + " crédit" + (hauts.length > 1 ? "s" : "") + " à un taux proche ou au-dessus du marché." : "Vos taux sont inférieurs à ceux du marché.",
      action: hauts.length ? "Demandez une renégociation ou un rachat de " + hauts.map(function (h) { return h.libelle.toLowerCase(); }).join(", ") + "." : null,
      lien: "#credit" });

    var score = composantes.reduce(function (t2, c) { return t2 + c.points; }, 0);
    var niveau = NIVEAUX.filter(function (n) { return score >= n[0]; })[0][1];
    var objectifs = composantes.filter(function (c) { return c.action; })
      .map(function (c) { return { cle: c.cle, libelle: c.libelle, gain: c.max - c.points, action: c.action, lien: c.lien }; })
      .sort(function (a, c) { return c.gain - a.gain; }).slice(0, 3);
    return { score: score, niveau: niveau, composantes: composantes, objectifs: objectifs };
  }

  /* ===================================================================
     Simulateur de vie : on applique des événements à une copie du profil et on compare
     =================================================================== */
  var TYPES_EVT = ["mariage", "naissance", "augmentation", "mutation", "immobilier", "voiture"];

  function appliquer(p0, evts) {
    var p = JSON.parse(JSON.stringify(p0)), notes = [];
    (evts || []).forEach(function (e) {
      if (!e || TYPES_EVT.indexOf(e.type) === -1) return;
      if (e.type === "mariage") {
        p.situation = "marie";
        if (e.chefDeFamille !== false) p.chefDeFamille = true;
        notes.push("Mariage" + (p.chefDeFamille ? " (chef de famille)" : ""));
      } else if (e.type === "naissance") {
        var n = borne(Math.round(e.nombre || 1), 1, 5);
        p.enfants = borne((p.enfants || 0) + n, 0, 15);
        notes.push(n > 1 ? n + " naissances" : "Naissance d'un enfant");
      } else if (e.type === "augmentation") {
        var pct = borne(Number(e.pct) || 0, -50, 200);
        p.montant = Math.round(p.montant * (1 + pct / 100) * 1000) / 1000;
        notes.push("Salaire " + (pct >= 0 ? "+" : "") + nb(pct) + "\u00a0%");
      } else if (e.type === "mutation") {
        var pm = borne(Number(e.pctSalaire) || 0, -50, 200);
        p.montant = Math.round(p.montant * (1 + pm / 100) * 1000) / 1000;
        if (e.loyer >= 0 && e.loyer !== null && e.loyer !== undefined && e.loyer !== "") p.loyer = Number(e.loyer);
        notes.push("Mutation" + (pm ? " (salaire " + (pm >= 0 ? "+" : "") + nb(pm) + "\u00a0%)" : "") + (e.loyer != null && e.loyer !== "" ? ", loyer de " + dt(Number(e.loyer)) : ""));
      } else if (e.type === "immobilier" || e.type === "voiture") {
        var immo = e.type === "immobilier";
        var prix = Math.max(0, Number(e.prix) || 0), apport = borne(Number(e.apport) || 0, 0, prix);
        var duree = borne(Math.round((Number(e.dureeAns) || (immo ? 20 : 7)) * 12), 12, immo ? 300 : 84);
        var taux = e.tauxPct >= 0 ? Number(e.tauxPct) : OC.tauxNouveaux(p)[immo ? "immo" : "auto"].tauxPct;
        var capital = Math.max(0, prix - apport);
        var mens = capital > 0 ? OC.mensualitePourCapital(capital, taux, duree) : 0;
        if (capital > 0) p.credits.push({ libelle: immo ? "Nouveau crédit immobilier" : "Nouveau crédit auto", type: immo ? "immo" : "auto",
          mensualite: Math.round(mens * 1000) / 1000, capitalRestant: capital, tauxPct: taux, moisRestants: duree });
        p.epargneDisponible = Math.max(0, (p.epargneDisponible || 0) - apport);
        if (immo && e.quitterLocation) p.loyer = 0;
        notes.push((immo ? "Achat immobilier de " : "Voiture de ") + dt(prix) + (capital > 0 ? ", crédit de " + dt(capital) + " sur " + nb(duree / 12) + " ans à " + nb(taux) + "\u00a0% (" + dt(mens) + " par mois)" : ", payée comptant"));
      }
    });
    return { profil: p, notes: notes };
  }

  function indicateurs(sy, maintenant) {
    var p = sy.profil, cap = sy.capacite[p.baseBanque], q = p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet;
    var immo = cap.credits.filter(function (c) { return c.cle === "immo"; })[0];
    return {
      netMensuel: sy.salaire.netMensuel,
      netMoyen: sy.salaire.netMoyen,
      impotAnnuel: sy.salaire.irpp,
      mensualiteMax: cap.mensualiteMax,
      capitalImmo: immo ? immo.capital : 0,
      endettement: cap.tauxEndettementActuel,
      quotite: q,
      reste: sy.budget.reste,
      epargneDisponible: p.epargneDisponible,
      score: scoreSante(sy, { maintenant: maintenant }).score
    };
  }

  var LIGNES = [
    ["netMensuel", "Salaire net mensuel", "dt", 1],
    ["impotAnnuel", "Impôt sur le revenu (an)", "dt", -1],
    ["reste", "Reste à vivre par mois", "dt", 1],
    ["endettement", "Endettement", "pct", -1],
    ["mensualiteMax", "Nouvelle mensualité possible", "dt", 1],
    ["capitalImmo", "Crédit immobilier possible", "dt", 1],
    ["epargneDisponible", "Épargne disponible", "dt", 1],
    ["score", "Score de santé", "points", 1]
  ];

  function simulateurVie(profil, evts, maintenant) {
    var m = maintenant || new Date();
    var syA = OC.synthese(profil, {}, m);
    var ap = appliquer(syA.profil, evts);
    var syB = OC.synthese(ap.profil, {}, m);
    var a = indicateurs(syA, m), b = indicateurs(syB, m);
    var lignes = LIGNES.map(function (l) {
      var d = b[l[0]] - a[l[0]];
      return { cle: l[0], libelle: l[1], unite: l[2], avant: a[l[0]], apres: b[l[0]], delta: d,
        sens: Math.abs(d) < (l[2] === "pct" ? 0.0005 : 0.5) ? "egal" : (d * l[3] > 0 ? "mieux" : "moins_bien") };
    });
    var alertes = [];
    if (b.reste < 0) alertes.push("Votre budget deviendrait déficitaire de " + dt(-b.reste) + " par mois.");
    if (b.endettement > b.quotite + 1e-9) alertes.push("Votre endettement dépasserait " + Math.round(b.quotite * 100) + " % : la banque refuserait probablement ce crédit.");
    return { evenements: ap.notes, avant: a, apres: b, lignes: lignes, alertes: alertes, profilApres: ap.profil, syntheseApres: syB };
  }

  /* ===================================================================
     Mode couple / foyer : deux salaires, un budget commun, une capacité d'emprunt commune
     =================================================================== */
  function foyer(sy) {
    var p = sy.profil;
    if (!p.foyer || !(p.conjointMontant > 0)) return null;
    /* Le conjoint est imposé séparément ; les déductions familiales restent à la personne déclarée chef de famille. */
    var sc = OC.salaire(OC.normaliser({ montant: p.conjointMontant, sens: p.conjointSens, nombreSalaires: p.conjointSalaires,
      secteur: p.conjointSecteur, situation: "marie", chefDeFamille: false, anneeNaissance: p.anneeNaissance }));
    var b = p.baseBanque, q = b === "brut" ? p.quotiteBrut : p.quotiteNet, annuel = p.revenuBanque === "annuel";
    var revConj = b === "brut" ? (annuel ? sc.brutAnnuel / 12 : sc.brutMensuel) : (annuel ? sc.netAnnuel / 12 : sc.netMensuel);
    var revMoi = sy.capacite[b].revenu;
    var charges = sy.chargesCredits + p.conjointCredits;
    var revenu = revMoi + revConj;
    var taux = OC.tauxNouveaux(p);
    var cap = OC.capacite(revenu, q, charges, sy.age, taux);
    var netMoi = sy.salaire.netMoyen + p.autresRevenus, netConj = sc.netMoyen, net = netMoi + netConj;
    var epargne = p.contrats.reduce(function (t, c) { return t + (OC.contratCommence(c, sy.maintenant) ? c.versementMensuel : 0); }, 0);
    var communes = p.loyer + p.chargesFixes;
    var partMoi = net > 0 ? netMoi / net : 1;
    return {
      prenom: p.conjointPrenom || "Conjoint",
      conjoint: { netMensuel: sc.netMensuel, netMoyen: sc.netMoyen, brutMensuel: sc.brutMensuel, impotAnnuel: sc.irpp, revenuBanque: revConj, credits: p.conjointCredits },
      moi: { netMoyen: netMoi, revenuBanque: revMoi, credits: sy.chargesCredits },
      netMoyen: net,
      budget: OC.budget(net, charges, communes, epargne),
      revenuBanque: revenu, quotite: q, base: b,
      capacite: cap,
      endettement: revenu > 0 ? charges / revenu : 0,
      partMoi: partMoi,
      /* Charges communes (logement et charges fixes) partagées au prorata des revenus nets. */
      contributions: { moi: communes * partMoi, conjoint: communes * (1 - partMoi), total: communes },
      gainCapacite: Math.max(0, cap.mensualiteMax - sy.capacite[b].mensualiteMax)
    };
  }

  /* ===================================================================
     Résumé chiffré du profil pour l'Assistant : aucune donnée d'identité (ni prénom, ni e-mail)
     =================================================================== */
  var MOIS_NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var SITUATIONS = { celibataire: "célibataire", marie: "marié(e)", divorce: "divorcé(e)", veuf: "veuf / veuve" };
  function pc(v) { return nb(v * 100) + "\u00a0%"; }

  function resumeAssistant(sy, options) {
    var o = options || {}, m = o.maintenant || sy.maintenant || new Date(), p = sy.profil, s = sy.salaire;
    var b = p.baseBanque, cap = sy.capacite[b], q = b === "brut" ? p.quotiteBrut : p.quotiteNet, L = [];
    L.push("Date du jour : " + m.getDate() + " " + MOIS_NOMS[m.getMonth()] + " " + m.getFullYear() + ".");
    L.push("Personne : " + sy.age + " ans, " + (SITUATIONS[p.situation] || p.situation) + (p.chefDeFamille ? ", chef de famille" : "") +
      ", " + p.enfants + " enfant(s) à charge" + (p.etudiants ? " dont " + p.etudiants + " étudiant(s)" : "") + ". Contrat : " + p.statut + ", secteur " + (p.secteur === "public" ? "public (CNRPS)" : "privé (CNSS)") + ".");
    if (p.activite === "retraite") L.push("Statut : retraité (" + (p.caissePension === "cnrps" ? "CNRPS" : "CNSS") + (p.pensionEtrangere ? ", pension venant de l'étranger" : "") +
      "). Pension : retenue maladie 4 %, abattement de " + pc(s.abattementTaux) + " (loi de finances 2026 : 30 % en 2027, 40 % en 2028, 50 % en 2029), pas de CSS.");
    L.push((p.activite === "retraite" ? "Pension : " : "Salaire : ") + dt(p.montant) + " " + p.sens + " par " + (p.periode === "annuel" ? "an" : "mois") + ", " + (p.activite === "retraite" ? 12 : p.nombreSalaires) + (p.activite === "retraite" ? " versements" : " salaires") + " par an. Net mensuel : " + dt(s.netMensuel) +
      " ; net moyen (année ÷ 12) : " + dt(s.netMoyen) + " ; brut annuel : " + dt(s.brutAnnuel) + " ; impôt sur le revenu : " + dt(s.irpp) + " par an (tranche à " + pc(s.tranche.taux) + ")." +
      (p.autresRevenus ? " Autres revenus : " + dt(p.autresRevenus) + " par mois." : ""));
    var hi = sy.historique;
    if (hi) {
      var hl = [];
      if (hi.depuis) hl.push("salaire actuel en vigueur depuis " + hi.depuis + (hi.hausse != null ? " (" + (hi.hausse >= 0 ? "+" : "") + pc(hi.hausse) + " de brut par rapport au précédent, " + dt(hi.brutPrecedent) + " brut par mois)" : ""));
      hi.futurs.forEach(function (f) { hl.push("hausse prévue en " + f.date + " : " + dt(f.brutMensuel) + " brut, " + dt(f.netMensuel) + " net par mois"); });
      if (sy.salaireAnnee) hl.push("impôt de l'année " + sy.salaireAnnee.annee + " calculé mois par mois : " + dt(sy.salaireAnnee.irpp) + " d'IRPP sur " + dt(sy.salaireAnnee.brutAnnuel) + " de brut");
      if (hl.length) L.push("Historique du salaire : " + hl.join(" ; ") + ".");
    }
    L.push("Banque : " + (p.banque || "non précisée") + ", prête jusqu'à " + pc(q) + " du " + b + " (revenu retenu : " + dt(cap.revenu) + " par mois, " +
      (p.revenuBanque === "annuel" ? "salaires et primes de l'année ÷ 12" : "salaire mensuel") + "). Endettement actuel : " + pc(cap.tauxEndettementActuel) + ". Nouvelle mensualité possible aujourd'hui : " + dt(cap.mensualiteMax) + ".");
    if (cap.mensualiteMax >= 1) L.push("Aujourd'hui, la banque peut prêter : " + cap.credits.filter(function (c) { return c.cle !== "immo25"; }).map(function (c) {
      return c.court + " " + dt(c.capital) + " (" + nb(c.dureeMois / 12) + " ans à " + nb(c.tauxPct) + "\u00a0%)"; }).join(" ; ") + ".");
    if (p.credits.length) {
      L.push("Crédits en cours (" + dt(sy.chargesCredits) + " par mois au total) :");
      p.credits.forEach(function (c, i) {
        var e = sy.credits[i] || {};
        var rt = e.reduction, r8 = "";
        /* Règle des 8 % (loi n° 2024-41) : taux fixe, plus de 84 mois ; taux divisé par deux, sur demande à la banque. */
        if (rt && rt.applicable) {
          if (rt.possibleDepuis) r8 = " Règle des 8 % : réduction de moitié du taux possible depuis " + rt.possibleDepuis.date + ", pas encore demandée.";
          else if (rt.reductions.length) r8 = " Règle des 8 % : réductions de taux prévues " + rt.reductions.map(function (r) { return "en " + r.date + " (" + nb(r.tauxAvant) + "\u00a0% → " + nb(r.tauxPct) + "\u00a0%, mensualité " + dt(r.mensualite) + ")"; }).join(", ") + ", à demander à la banque.";
          else r8 = " Règle des 8 % : plus de réduction de taux d'ici la fin.";
          if (rt.derniere) r8 = " Taux déjà divisé par deux en " + rt.derniere.date + "." + r8;
        } else if (rt && rt.motif === "type") r8 = " Type de taux (fixe ou variable) non précisé : règle des 8 % non évaluée.";
        L.push("- " + c.libelle + " (" + c.type + ") : " + dt(c.mensualite) + " par mois" + (c.tauxPct ? " à " + nb(c.tauxPct) + "\u00a0%" + (c.tauxType ? " " + c.tauxType : "") : "") +
          (e.restantes ? ", " + e.restantes + " échéances restantes, dernière en " + e.fin : "") + (c.capitalRestant ? ", capital restant " + dt(c.capitalRestant) : "") + "." + r8);
      });
    } else L.push("Aucun crédit en cours.");
    var pal = cap.paliers || [];
    if (pal.length) {
      L.push("Calendrier de la marge (à chaque fin de crédit ou réduction de taux, la mensualité possible augmente ; les montants d'une même étape sont l'un OU l'autre) :");
      pal.forEach(function (x) {
        L.push("- " + x.date + " (" + OC.evenementEtape(x) + ") : " + dt(x.mensualiteMax) + " par mois, soit " + (x.offres || []).map(function (of) {
          return of.libelle.toLowerCase() + " " + dt(of.capital) + " sur " + nb(of.dureeMois / 12) + " ans à " + nb(of.tauxPct) + "\u00a0%"; }).join(", ") + ".");
      });
    }
    L.push("Budget : loyer " + dt(p.loyer) + ", charges fixes " + dt(p.chargesFixes) + " par mois ; épargne disponible " + dt(p.epargneDisponible) + " ; reste à vivre " + dt(sy.budget.reste) + " par mois.");
    if (sy.contrats && sy.contrats.length) {
      L.push("Contrats d'épargne :");
      sy.contrats.forEach(function (c, i) {
        var cc = p.contrats[i];
        L.push("- " + (c.type === "cea" ? "CEA" : "Assurance vie") + " : " + dt(cc.versementMensuel) + " par mois" + (cc.versementsLibresAn ? " + " + dt(cc.versementsLibresAn) + " de versements libres cette année" : "") +
          ", " + dt(c.verse) + " versés, capital " + (c.estime ? "estimé " : "") + dt(c.capital) + ", durée fiscale (" + c.dureeFiscale + " ans) " + (c.dureeAtteinte ? "atteinte" : "atteinte en " + c.dateDureeFiscale) + ".");
      });
    }
    var f = optimiseurFiscal(sy, { maintenant: m });
    if (f.impotAvant > 0) L.push("Impôt et épargne : économie actuelle " + dt(f.economieActuelle) + " par an, maximale " + dt(f.economieMax) +
      (f.statut === "a_optimiser" ? " ; complément utile avant le 31 décembre : " + dt(f.complement.av) + " en assurance vie et " + dt(f.complement.cea) + " en CEA (" + f.joursAvantFin + " jours restants)" : "") + "." +
      (f.paie && f.statut === "a_optimiser" ? " Impôt restant à retenir sur les paies d'ici le 31 décembre : " + dt(f.paie.impotRestant) + " ; récupérable sur les paies : " + dt(f.paie.recuperable) +
        (f.paie.declaration > 20 ? ", le reste (" + dt(f.paie.declaration) + ") via la déclaration annuelle" + (f.optimalPaie ? " ; versement qui fait tout revenir sur les paies : " + dt(f.optimalPaie.total) : "") : "") + "." : ""));
    var sc = scoreSante(sy, { optimiseur: f, maintenant: m });
    L.push("Score de santé financière : " + sc.score + "/100 (" + sc.niveau + "). Priorités : " + sc.objectifs.map(function (x) { return x.libelle.toLowerCase(); }).join(", ") + ".");
    var fo = foyer(sy);
    if (fo) L.push("Foyer (mode couple) : conjoint " + dt(fo.conjoint.netMoyen) + " net moyen par mois, ses crédits " + dt(fo.conjoint.credits) + " ; net du foyer " + dt(fo.netMoyen) +
      ", mensualité possible ensemble " + dt(fo.capacite.mensualiteMax) + ", crédit immobilier possible ensemble " + dt((fo.capacite.credits.filter(function (c) { return c.cle === "immo"; })[0] || {}).capital || 0) + ".");
    if (sy.projets && sy.projets.length) {
      L.push("Projets :");
      sy.projets.forEach(function (x) { L.push("- " + x.libelle + " : " + dt(x.montant) + " dans " + x.horizonAns + " an(s), " + ({ ok: "finançable", a_preparer: "à préparer", hors_portee: "hors de portée pour l'instant" }[x.statut] || x.statut) + "."); });
    }
    return L.join("\n").slice(0, 9000);
  }

  return { resumeAssistant: resumeAssistant, foyer: foyer, scoreSante: scoreSante, optimiseurFiscal: optimiseurFiscal, economieVersement: economieVersement, planVersement: planVersement, simulateurVie: simulateurVie, appliquerEvenements: appliquer, TYPES_EVT: TYPES_EVT };
});
