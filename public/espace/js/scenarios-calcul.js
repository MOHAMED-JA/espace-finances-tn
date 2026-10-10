/*
 * Orbite — scénarios « Et si… » (pur, sans navigateur, testé sous Node).
 * Un scénario = le profil d'aujourd'hui + des changements datés :
 *   salaire  { type: "salaire", montant, sens, periode, mois, annee }         nouveau salaire (poste, hausse)
 *   credit   { type: "credit", libelle, typeCredit, capital, tauxPct, dureeMois, mois, annee }
 *   epargne  { type: "epargne", produit: "av" | "cea", versementMensuel, mois, annee }
 *   vie      { type: "vie", evenement: "mariage" | "enfant" | "rembourser", credit (index), mois, annee }
 * Pour chaque mois des 10 ans à venir : net, crédits, marge de la banque, épargne versée et accumulée, reste à vivre ;
 * pour chaque année civile : impôt retenu, avantage fiscal assurance vie / CEA, impôt net.
 * Les crédits en cours suivent le modèle de « Mon orbite » (fins, réductions de taux de la règle des 8 %).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-systeme.js"), require("../../moteurs/vie/moteur-fiscal.js"));
  else racine.Scenarios = fabrique(racine.OrbiteCalcul, racine.OrbiteSysteme, racine.MoteurFiscal);
})(typeof self !== "undefined" ? self : this, function (OC, OS, MF) {
  "use strict";
  var MOIS = OC.MOIS;
  var HORIZON = 120;
  var MAX_SCENARIOS = OC.MAX_SCENARIOS, MAX_CHANGEMENTS = OC.MAX_CHANGEMENTS;

  /* Normalisation : dans orbite-calcul.js (le profil enregistré garde ses scénarios). */
  var normaliserChangement = OC.normaliserChangement, normaliserScenario = OC.normaliserScenario;
  function normaliserListe(l) { return (Array.isArray(l) ? l : []).slice(0, MAX_SCENARIOS).map(normaliserScenario); }

  /* ---------- Outils ---------- */
  function decalage(c, m) { return c.annee * 12 + c.mois - 1 - (m.getFullYear() * 12 + m.getMonth()); }
  function dateTexte(m, t) { var k = m.getMonth() + t; return MOIS[((k % 12) + 12) % 12] + " " + (m.getFullYear() + Math.floor(k / 12)); }
  var I_MOIS = OC.RENDEMENT_ESTIME / 100 / 12;
  function capitalVersements(v, k) { return k > 0 ? v * (Math.pow(1 + I_MOIS, k) - 1) / I_MOIS : 0; }
  function libelleChangement(c, p) {
    var dt = function (v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
    if (c.type === "salaire") return "Salaire à " + dt(c.montant) + " DT " + c.sens + (c.periode === "annuel" ? " par an" : " par mois");
    if (c.type === "credit") return c.libelle + " : " + dt(c.capital) + " DT sur " + (c.dureeMois % 12 ? c.dureeMois + " mois" : c.dureeMois / 12 + " ans");
    if (c.type === "epargne") return (c.produit === "cea" ? "CEA" : "Assurance vie") + " : " + dt(c.versementMensuel) + " DT par mois";
    if (c.evenement === "mariage") return "Mariage";
    if (c.evenement === "enfant") return "Naissance d'un enfant";
    var cr = p && p.credits[c.credit];
    return "Remboursement anticipé" + (cr ? " du " + cr.libelle.charAt(0).toLowerCase() + cr.libelle.slice(1) : "");
  }

  /* ---------- Calcul d'un scénario ---------- */
  function calculer(p0, sc, maintenant, horizon) {
    var m = maintenant || new Date(), H = horizon || HORIZON;
    var p = OC.normaliser(p0);
    var sy0 = OC.synthese(p, {}, m);
    p = sy0.profil;
    var mod = OS.modele(sy0, p.baseBanque);
    var chs = (sc && sc.changements ? sc.changements : []).map(function (c) { return Object.assign({ t: Math.max(0, decalage(c, m)) }, c); })
      .sort(function (a, b) { return a.t - b.t; });

    /* Salaire : les changements rejoignent l'historique (même mécanique que « Mettre à jour mon salaire »). */
    var hist = (p.historiqueSalaire || []).slice();
    var salaires = chs.filter(function (c) { return c.type === "salaire"; });
    if (salaires.length && !hist.length) hist.push({ montant: p.montant, sens: p.sens, periode: p.periode, mois: 0, annee: 0 });
    salaires.forEach(function (c) {
      var d = new Date(m.getFullYear(), m.getMonth() + c.t, 1);
      hist = hist.filter(function (h) { return !(h.annee === d.getFullYear() && h.mois === d.getMonth() + 1); });
      hist.push({ montant: c.montant, sens: c.sens, periode: c.periode, mois: d.getMonth() + 1, annee: d.getFullYear() });
    });
    var pH = OC.normaliser(Object.assign({}, p, { historiqueSalaire: hist }));

    /* Famille au mois t (événements de vie). Le mariage ouvre la déduction de chef de famille. */
    function familleAu(t) {
      var f = { situation: p.situation, chefDeFamille: p.chefDeFamille, enfants: p.enfants };
      chs.forEach(function (c) {
        if (c.type !== "vie" || c.t > t) return;
        if (c.evenement === "mariage") { f.situation = "marie"; f.chefDeFamille = true; }
        if (c.evenement === "enfant") f.enfants = Math.min(15, f.enfants + 1);
      });
      return f;
    }
    var cache = {};
    function salaireAu(t) {
      var d = new Date(m.getFullYear(), m.getMonth() + t, 1);
      var h = OC.salaireEnVigueur(pH, d.getFullYear(), d.getMonth()) || p, f = familleAu(Math.max(0, t));
      var cle = [h.montant, h.sens, h.periode, f.situation, f.chefDeFamille, f.enfants].join("|");
      return cache[cle] || (cache[cle] = OC.salaire(Object.assign({}, p, { montant: h.montant, sens: h.sens, periode: h.periode }, f)));
    }

    /* Crédits : ceux du profil (modèle de Mon orbite), moins ceux remboursés par anticipation, plus les nouveaux. */
    var rembourses = {};
    chs.forEach(function (c) { if (c.type === "vie" && c.evenement === "rembourser" && c.credit >= 0 && !(c.credit in rembourses)) rembourses[c.credit] = c.t; });
    var nouveaux = chs.filter(function (c) { return c.type === "credit"; }).map(function (c) {
      var mens = OC.mensualitePourCapital(c.capital, c.tauxPct, c.dureeMois), r = c.tauxPct / 1200, k = c.capital, dans = 0;
      /* Intérêts payés d'ici la fin de l'horizon, échéance par échéance. */
      for (var e = 0; e < c.dureeMois && c.t + e < H; e++) { var i = k * r; dans += i; k -= mens - i; }
      return { c: c, t0: c.t, fin: c.t + c.dureeMois, mensualite: mens, interets: Math.max(0, mens * c.dureeMois - c.capital), interetsHorizon: dans };
    });
    var epargnes = chs.filter(function (c) { return c.type === "epargne"; });
    var annuel = p.revenuBanque === "annuel", base = p.baseBanque, quotite = base === "brut" ? p.quotiteBrut : p.quotiteNet;
    var fixes = p.loyer + p.chargesFixes;

    function contratsExistants(t) {
      var d = new Date(m.getFullYear(), m.getMonth() + t, 15), verse = 0, capital = 0;
      p.contrats.forEach(function (c) {
        if (OC.contratCommence(c, d)) verse += c.versementMensuel;
        if (c.capitalActuel > 0) { var f = Math.pow(1 + I_MOIS, t); capital += c.capitalActuel * f + c.versementMensuel * (f - 1) / I_MOIS; }
        else capital += OC.estimationContrat(c, d).capital;
      });
      return { verse: verse, capital: capital };
    }

    var mois = [], soldes = [];
    for (var t = 0; t <= H; t++) {
      var S = salaireAu(t), e = mod.etat(Math.min(t, mod.horizon)), charges = 0, credits = [];
      p.credits.forEach(function (c, i) {
        var st = e.satellites["credit-" + i];
        if (!st || !st.actif) return;
        if (t >= mod.horizon && st.restantes !== null && st.restantes <= 0) return;
        if (i in rembourses && t >= rembourses[i]) return;
        charges += st.mensualite; credits.push(c.libelle);
      });
      nouveaux.forEach(function (n) { if (t >= n.t0 && t < n.fin) { charges += n.mensualite; credits.push(n.c.libelle); } });
      var ex = contratsExistants(t), epV = ex.verse, epK = ex.capital;
      epargnes.forEach(function (c) { if (t >= c.t) { epV += c.versementMensuel; epK += capitalVersements(c.versementMensuel, t - c.t + 1); } });
      var revenu = (base === "brut" ? (annuel ? S.brutAnnuel / 12 : S.brutMensuel) : (annuel ? S.netAnnuel / 12 : S.netMensuel)) + p.autresRevenus;
      var netMoyen = S.netMoyen + p.autresRevenus;
      mois.push({
        t: t, date: dateTexte(m, t), netMensuel: S.netMensuel, netMoyen: netMoyen, brutMensuel: S.brutMensuel,
        charges: charges, endettement: revenu > 0 ? charges / revenu : 0, marge: revenu * quotite - charges,
        epargneMensuelle: epV, capitalEpargne: epK, reste: netMoyen - charges - epV - fixes, credits: credits
      });
    }
    /* Remboursements anticipés : capital restant dû payé au mois choisi (sortie ponctuelle). */
    Object.keys(rembourses).forEach(function (i) {
      var t0 = rembourses[i], st = mod.etat(Math.min(t0, mod.horizon)).satellites["credit-" + i];
      if (st && st.actif && st.capitalRestant > 0) soldes.push({ t: t0, date: dateTexte(m, t0), credit: p.credits[i].libelle, montant: st.capitalRestant });
    });

    /* Années civiles : impôt retenu (mois par mois, primes comprises), avantage fiscal AV / CEA à la déclaration. */
    var annees = [], Y0 = m.getFullYear(), Yfin = new Date(m.getFullYear(), m.getMonth() + H, 1).getFullYear();
    for (var Y = Y0; Y <= Yfin; Y++) {
      var retenu = 0, revenuFiscal = 0, av = 0, cea = 0;
      for (var k = 0; k < 12; k++) {
        var tk = (Y - Y0) * 12 + k - m.getMonth(), Sk = salaireAu(tk);
        retenu += (Sk.irpp + Sk.css) / 12; revenuFiscal += Sk.revenuFiscal / 12;
      }
      p.contrats.forEach(function (c) {
        var debut = c.anneeDebut * 12 + c.moisDebut - 1, nb = 0;
        for (var k2 = 0; k2 < 12; k2++) if (Y * 12 + k2 >= debut) nb++;
        var v = c.versementMensuel * nb + (c.versementsLibresAn || 0);
        if (c.type === "cea") cea += v; else av += v;
      });
      epargnes.forEach(function (c) {
        var nb = 0;
        for (var k3 = 0; k3 < 12; k3++) if ((Y - Y0) * 12 + k3 - m.getMonth() >= c.t) nb++;
        if (c.produit === "cea") cea += c.versementMensuel * nb; else av += c.versementMensuel * nb;
      });
      var f = familleAu(Math.max(0, (Y - Y0) * 12 - m.getMonth()));
      var eco = av + cea > 0 ? MF.simuler({ revenu: revenuFiscal, chef: f.chefDeFamille, enfants: f.enfants, infirmes: p.handicapes,
        etudiants: p.etudiants, parents: p.parents, investissementAv: av, investissementCea: cea }).economie : 0;
      annees.push({ annee: Y, impotRetenu: retenu, avantageFiscal: eco, impotNet: Math.max(0, retenu - eco), versementsAv: av, versementsCea: cea });
    }

    /* Frise : changements du scénario et fins de crédit. */
    var evenements = chs.map(function (c) { return { t: c.t, date: dateTexte(m, c.t), genre: c.type === "vie" ? c.evenement : c.type, lib: libelleChangement(c, p) }; });
    mod.jalons.forEach(function (j) {
      if (j.genre !== "credit" || j.t > H) return;
      var i = Number(String(j.sat).replace("credit-", ""));
      if (i in rembourses && rembourses[i] <= j.t) return;
      evenements.push({ t: j.t, date: dateTexte(m, j.t), genre: "fin", lib: j.lib });
    });
    nouveaux.forEach(function (n) { if (n.fin <= H) evenements.push({ t: n.fin, date: dateTexte(m, n.fin), genre: "fin", lib: "Fin du " + n.c.libelle.charAt(0).toLowerCase() + n.c.libelle.slice(1) }); });
    evenements.sort(function (a, b) { return a.t - b.t; });

    /* Refus probable : un nouveau crédit qui fait dépasser la quotité de la banque le mois où il commence. */
    var alertes = nouveaux.filter(function (n) { return n.t0 <= H && mois[n.t0].marge < -0.5; }).map(function (n) {
      var x = mois[n.t0];
      return { genre: "endettement", t: n.t0, date: x.date, credit: n.c.libelle, endettement: x.endettement, quotite: quotite,
        lib: n.c.libelle + " en " + x.date + " : endettement de " + Math.round(x.endettement * 100) + " %, au-delà des " + Math.round(quotite * 100) + " % de la banque" };
    });
    mois.forEach(function (x) { if (x.reste < 0 && !alertes.some(function (a) { return a.genre === "reste"; })) alertes.push({ genre: "reste", t: x.t, date: x.date, lib: "Budget dans le rouge dès " + x.date }); });

    var sol = soldes.reduce(function (s, x) { return s + x.montant; }, 0);
    return {
      nom: sc ? sc.nom : "Aujourd'hui", changements: chs, mois: mois, annees: annees, evenements: evenements, alertes: alertes, soldes: soldes, horizon: H,
      totaux: {
        reste: mois.slice(0, H).reduce(function (s, x) { return s + x.reste; }, 0) - sol,
        capitalEpargne: mois[H].capitalEpargne,
        interetsNouveaux: nouveaux.reduce(function (s, n) { return s + n.interetsHorizon; }, 0),
        interetsTotaux: nouveaux.reduce(function (s, n) { return s + n.interets; }, 0),
        impotNet: annees.reduce(function (s, a) { return s + a.impotNet; }, 0),
        remboursements: sol
      }
    };
  }

  /* Comparaison : la référence (aujourd'hui, sans changement) et jusqu'à trois scénarios. */
  var JALONS_COMPARAISON = [0, 12, 36, 60, 120];
  function comparer(p, scenarios, maintenant, horizon) {
    var ref = calculer(p, null, maintenant, horizon), res = normaliserListe(scenarios).map(function (s) { return calculer(p, s, maintenant, horizon); });
    res.forEach(function (r) {
      r.ecart = { reste: r.totaux.reste - ref.totaux.reste, capitalEpargne: r.totaux.capitalEpargne - ref.totaux.capitalEpargne, impotNet: r.totaux.impotNet - ref.totaux.impotNet };
      /* Richesse sur 10 ans : ce qui reste pour vivre + l'épargne constituée (les intérêts payés sont déjà sortis du reste). */
      r.score = r.totaux.reste + r.totaux.capitalEpargne;
    });
    var classes = res.slice().sort(function (a, b) { return b.score - a.score; });
    return { reference: ref, scenarios: res, meilleur: classes.length ? classes[0] : null, jalons: JALONS_COMPARAISON.filter(function (t) { return t <= ref.horizon; }) };
  }

  return { calculer: calculer, comparer: comparer, normaliserScenario: normaliserScenario, normaliserListe: normaliserListe, normaliserChangement: normaliserChangement,
    libelleChangement: libelleChangement, HORIZON: HORIZON, MAX_SCENARIOS: MAX_SCENARIOS, MAX_CHANGEMENTS: MAX_CHANGEMENTS };
});
