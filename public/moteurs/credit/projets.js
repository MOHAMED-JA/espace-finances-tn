/*
 * Orbite — point 5 : projet immobilier, comparateur d'offres, regroupement de crédits (fonctions pures, testées).
 * Règles validées par l'utilisateur le 12 oct. 2026 (MEMOIRE « 3 decnonagies ») ; toutes les valeurs sont modifiables.
 *  - Logement neuf chez un promoteur : jusqu'à 500 000 DT, droit d'enregistrement fixe (30 DT par page) ; au-delà,
 *    3 % sur la part au-dessus de 500 000 DT et un droit complémentaire sur tout le prix (2 % jusqu'à 999 999 DT, 4 % au-delà),
 *    « à confirmer avec le notaire ». Conservation foncière 1 % du prix ; hypothèque de la banque 0,2 % du prêt ;
 *    acte (notaire ou avocat) 1,5 % ; frais de dossier bancaire 1 % du prêt.
 *  - Indemnité de remboursement anticipé : fixée par le contrat ; 1,5 % du capital restant dû par défaut.
 *  - « Premier logement » : apport (20 % du prix) prêté par l'État, plafond et taux à confirmer.
 * Node : require('.../projets.js') — navigateur : window.CreditProjets (MoteurCredit facultatif pour le comparateur).
 */
(function (racine, fabrique) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./credit.js"));
  else racine.CreditProjets = fabrique(racine.MoteurCredit);
})(typeof self !== "undefined" ? self : this, function (MC) {
  "use strict";

  var FRAIS = { droitParPage: 30, pages: 6, seuil: 500000, seuilHaut: 1000000, tauxAuDela: 3, complement: 2, complementHaut: 4,
    conservationPct: 1, hypothequePct: 0.2, actePct: 1.5, dossierPct: 1 };
  var PREMIER = { partPct: 20, plafond: 220000, tauxPct: 2, mois: 84 };
  var IRA_PCT = 1.5;

  function arr(v) { return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 1000) / 1000; }
  function num(v, def) { var n = Number(v); return isFinite(n) && v !== "" && v !== null && v !== undefined ? n : def; }
  function mensualite(k, tauxPct, n) {
    if (!(k > 0) || !(n > 0)) return 0;
    var i = tauxPct / 1200;
    return i === 0 ? k / n : k * i / (1 - Math.pow(1 + i, -n));
  }
  function capitalPour(m, tauxPct, n) {
    if (!(m > 0) || !(n > 0)) return 0;
    var i = tauxPct / 1200;
    return i === 0 ? m * n : m * (1 - Math.pow(1 + i, -n)) / i;
  }

  /* ---------- Frais d'achat ---------- */
  /** Frais qui ne dépendent que du prix : enregistrement, conservation foncière, acte. */
  function fraisPrix(prix, r0) {
    var r = Object.assign({}, FRAIS, r0 || {}), p = Math.max(0, num(prix, 0)), lignes = [], aConfirmer = false;
    var enreg;
    if (p <= r.seuil) enreg = r.droitParPage * r.pages;
    else {
      aConfirmer = true;
      enreg = (p - r.seuil) * r.tauxAuDela / 100 + p * (p < r.seuilHaut ? r.complement : r.complementHaut) / 100;
    }
    lignes.push({ cle: "enregistrement", libelle: "Droits d'enregistrement", montant: arr(enreg),
      detail: p <= r.seuil ? "Droit fixe : " + r.droitParPage + " DT × " + r.pages + " pages" : r.tauxAuDela + " % au-delà de 500 000 DT + droit complémentaire de " + (p < r.seuilHaut ? r.complement : r.complementHaut) + " %" });
    lignes.push({ cle: "conservation", libelle: "Conservation foncière", montant: arr(p * r.conservationPct / 100), detail: r.conservationPct + " % du prix" });
    lignes.push({ cle: "acte", libelle: "Acte (notaire ou avocat)", montant: arr(p * r.actePct / 100), detail: r.actePct + " % du prix" });
    return { lignes: lignes, total: arr(lignes.reduce(function (s, l) { return s + l.montant; }, 0)), aConfirmer: aConfirmer, regles: r };
  }

  /**
   * Projet immobilier : coût total, crédit nécessaire (frais bancaires compris), mensualité.
   * o = { prix, apport, mois, tauxPct, regles?, premier?: { actif, partPct, plafond, tauxPct, mois } }
   */
  function projet(o) {
    var x = o || {}, prix = Math.max(0, num(x.prix, 0)), apport = Math.max(0, num(x.apport, 0));
    var mois = Math.round(num(x.mois, 240)), taux = num(x.tauxPct, 10);
    var fp = fraisPrix(prix, x.regles), r = fp.regles;
    var pr = Object.assign({}, PREMIER, x.premier || {}), premier = null;
    if (x.premier && x.premier.actif) {
      var eligible = prix > 0 && prix <= pr.plafond, montantEtat = eligible ? arr(prix * pr.partPct / 100) : 0;
      premier = { eligible: eligible, montant: montantEtat, mensualite: arr(mensualite(montantEtat, pr.tauxPct, pr.mois)), tauxPct: pr.tauxPct, mois: pr.mois, plafond: pr.plafond };
    }
    var besoin = prix + fp.total - apport - (premier ? premier.montant : 0);
    var partBanque = (r.hypothequePct + r.dossierPct) / 100;
    var credit = besoin > 0 ? arr(besoin / (1 - partBanque)) : 0;
    var hyp = arr(credit * r.hypothequePct / 100), dossier = arr(credit * r.dossierPct / 100);
    var lignes = fp.lignes.concat([
      { cle: "hypotheque", libelle: "Hypothèque de la banque", montant: hyp, detail: r.hypothequePct + " % du prêt" },
      { cle: "dossier", libelle: "Frais de dossier bancaire", montant: dossier, detail: r.dossierPct + " % du prêt" }]);
    var frais = arr(fp.total + hyp + dossier), m = arr(mensualite(credit, taux, mois));
    return { prix: prix, apport: apport, frais: frais, lignes: lignes, coutTotal: arr(prix + frais), credit: credit, mois: mois, tauxPct: taux,
      mensualite: m, premier: premier, mensualiteTotale: arr(m + (premier ? premier.mensualite : 0)),
      apportExcedent: besoin < 0 ? arr(-besoin) : 0, aConfirmer: fp.aConfirmer, interets: arr(Math.max(0, m * mois - credit)) };
  }

  /**
   * « Quand pourrai-je acheter ? » : premier mois (0 = aujourd'hui) où l'apport épargné et la capacité suffisent.
   * o = projet() + { epargneMensuelle, capacite: [{ mois, mensualiteMax }] (paliers, le premier à 0), horizon (mois, 120 par défaut) }
   */
  function quandAcheter(o) {
    var x = o || {}, ep = Math.max(0, num(x.epargneMensuelle, 0)), pal = (x.capacite || []).slice().sort(function (a, b) { return a.mois - b.mois; });
    var horizon = Math.round(num(x.horizon, 120));
    function capA(t) { var c = 0; pal.forEach(function (p) { if (p.mois <= t) c = p.mensualiteMax; }); return c; }
    for (var t = 0; t <= horizon; t++) {
      var p = projet(Object.assign({}, x, { apport: num(x.apport, 0) + ep * t }));
      if (p.mensualiteTotale <= capA(t) + 0.0005) return { mois: t, projet: p, capacite: capA(t) };
    }
    return null;
  }

  /* ---------- Comparateur d'offres ---------- */
  /**
   * offres : [{ nom, mode: 'fixe'|'tmm', taux (fixe) | marge (tmm), fraisDossierPct, fraisFixes, assurancePct }]
   * Classées par coût total (intérêts + frais + assurance) ; pour une offre au TMM, l'effet d'un TMM plus haut d'un point.
   */
  function comparer(o) {
    if (!MC) return null;
    var x = o || {}, tmm = num(x.tmm, 7.5);
    var offres = (x.offres || []).map(function (of) {
      var variable = of.mode === "tmm";
      return { nom: of.nom, taux: variable ? tmm + num(of.marge, 0) : num(of.taux, NaN), fraisDossierPct: num(of.fraisDossierPct, 0), fraisFixes: num(of.fraisFixes, 0),
        assurancePct: num(of.assurancePct, 0), assuranceBase: of.assuranceBase, variable: variable, marge: num(of.marge, 0) };
    });
    var r = MC.comparerOffres({ capital: num(x.capital, 0), mois: Math.round(num(x.mois, 0)), offres: offres });
    if (!r) return null;
    r.offres.forEach(function (of) {
      var src = offres[of.i];
      of.variable = src.variable; of.marge = src.marge; of.taux = src.taux;
      of.coutTotal = of.coutCredit;
      if (src.variable) {
        var plus = MC.comparerOffres({ capital: num(x.capital, 0), mois: Math.round(num(x.mois, 0)), offres: [Object.assign({}, src, { taux: src.taux + 1 })] });
        of.plusUnPoint = plus ? { mensualite: plus.offres[0].mensualiteAvecAssurance, ecart: arr(plus.offres[0].mensualiteAvecAssurance - of.mensualiteAvecAssurance), coutTotal: plus.offres[0].coutCredit } : null;
      }
    });
    r.classement = r.offres.slice().sort(function (a, b) { return a.coutCredit - b.coutCredit; });
    var moinsMens = r.offres.slice().sort(function (a, b) { return a.mensualiteAvecAssurance - b.mensualiteAvecAssurance; })[0];
    r.mensualiteLaPlusBasse = moinsMens;
    r.ecartMax = r.classement.length > 1 ? arr(r.classement[r.classement.length - 1].coutCredit - r.classement[0].coutCredit) : 0;
    return r;
  }

  /* ---------- Regrouper des crédits ---------- */
  /** Capital restant dû : celui du profil s'il est connu, sinon la valeur actuelle des échéances restantes. */
  function restantDu(c) {
    if (num(c.capitalRestant, 0) > 0) return arr(c.capitalRestant);
    return arr(capitalPour(num(c.mensualite, 0), num(c.tauxPct, 0), Math.round(num(c.moisRestants, 0))));
  }
  /**
   * o = { credits: [{ libelle, mensualite, tauxPct, moisRestants, capitalRestant?, inclus }], iraPct, fraisDossier, tauxPct, mois }
   */
  function regrouper(o) {
    var x = o || {}, ira = num(x.iraPct, IRA_PCT), frais = Math.max(0, num(x.fraisDossier, 150));
    var lignes = (x.credits || []).filter(function (c) { return c && c.inclus !== false && num(c.mensualite, 0) > 0 && num(c.moisRestants, 0) > 0; }).map(function (c) {
      var rd = restantDu(c), n = Math.round(num(c.moisRestants, 0));
      return { libelle: c.libelle, type: c.type, mensualite: arr(c.mensualite), tauxPct: num(c.tauxPct, 0), moisRestants: n, restantDu: rd,
        indemnite: arr(rd * ira / 100), resteAPayer: arr(num(c.mensualite, 0) * n) };
    });
    if (!lignes.length) return null;
    var somme = function (k) { return arr(lignes.reduce(function (s, l) { return s + l[k]; }, 0)); };
    var capital = arr(somme("restantDu") + somme("indemnite") + frais), mois = Math.round(num(x.mois, 60)), taux = num(x.tauxPct, 10);
    var nouvelle = arr(mensualite(capital, taux, mois)), avant = somme("mensualite"), coutAvant = somme("resteAPayer"), coutApres = arr(nouvelle * mois);
    var difference = arr(coutApres - coutAvant), dernierAvant = Math.max.apply(null, lignes.map(function (l) { return l.moisRestants; }));
    var verdict = difference <= 0 ? (nouvelle < avant ? "gagnant" : "moins_cher_mensualite_plus_haute") : (nouvelle < avant ? "mensualite_baisse_cout_monte" : "perdant");
    return { lignes: lignes, restantDu: somme("restantDu"), indemnites: somme("indemnite"), fraisDossier: frais, capital: capital, mois: mois, tauxPct: taux,
      mensualiteAvant: avant, mensualiteApres: nouvelle, gainMensuel: arr(avant - nouvelle), coutAvant: coutAvant, coutApres: coutApres, difference: difference,
      finAvantMois: dernierAvant, finApresMois: mois, verdict: verdict, iraPct: ira };
  }

  /* ---------- TMM ---------- */
  /** lignes [{ mois: 'AAAA-MM-01', taux }] (ordre quelconque) → série du plus ancien au plus récent, dernier, variation du mois. */
  function serieTMM(lignes) {
    var s = (lignes || []).filter(function (l) { return l && /^\d{4}-\d{2}-01/.test(String(l.mois)) && num(l.taux, 0) > 0; })
      .map(function (l) { return { mois: String(l.mois).slice(0, 10), taux: Math.round(num(l.taux, 0) * 1000) / 1000 }; })
      .sort(function (a, b) { return a.mois < b.mois ? -1 : a.mois > b.mois ? 1 : 0; });
    var d = s[s.length - 1] || null, p = s[s.length - 2] || null;
    return { serie: s, dernier: d, precedent: p, variation: d && p ? Math.round((d.taux - p.taux) * 1000) / 1000 : 0,
      min: s.length ? Math.min.apply(null, s.map(function (x) { return x.taux; })) : null, max: s.length ? Math.max.apply(null, s.map(function (x) { return x.taux; })) : null };
  }
  /**
   * Effet d'une variation du TMM sur des crédits à taux variable : mensualité recalculée sur le restant dû et les mois restants.
   * credits : profil (tauxType 'variable') ; delta en points. Sans crédit variable : l'exemple 150 000 DT, 20 ans, TMM + 2,5.
   */
  function effetTMM(o) {
    var x = o || {}, delta = num(x.delta, 0), tmm = num(x.tmm, 7.5);
    var liste = (x.credits || []).filter(function (c) { return c && c.tauxType === "variable" && num(c.mensualite, 0) > 0 && num(c.moisRestants, 0) > 0; });
    var exemple = !liste.length;
    if (exemple) liste = [{ libelle: "Exemple : 150 000 DT sur 20 ans à TMM + 2,5", capitalRestant: 150000, moisRestants: 240, tauxPct: tmm + 2.5, mensualite: arr(mensualite(150000, tmm + 2.5, 240)) }];
    var lignes = liste.map(function (c) {
      var rd = restantDu(c), n = Math.round(num(c.moisRestants, 0)), t = num(c.tauxPct, 0);
      var avant = arr(mensualite(rd, t, n)), apres = arr(mensualite(rd, Math.max(0, t + delta), n)), plus1 = arr(mensualite(rd, t + 1, n));
      return { libelle: c.libelle, restantDu: rd, moisRestants: n, tauxPct: t, avant: avant, apres: apres, ecart: arr(apres - avant), plusUnPoint: arr(plus1 - avant) };
    });
    return { exemple: exemple, lignes: lignes, ecartTotal: arr(lignes.reduce(function (s, l) { return s + l.ecart; }, 0)),
      plusUnPointTotal: arr(lignes.reduce(function (s, l) { return s + l.plusUnPoint; }, 0)) };
  }

  return { FRAIS: FRAIS, PREMIER: PREMIER, IRA_PCT: IRA_PCT, fraisPrix: fraisPrix, projet: projet, quandAcheter: quandAcheter,
    comparer: comparer, regrouper: regrouper, restantDu: restantDu, mensualite: mensualite, serieTMM: serieTMM, effetTMM: effetTMM };
});
