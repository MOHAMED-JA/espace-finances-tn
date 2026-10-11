/*
 * Orbite — retraite CNSS / CNRPS (lot 4, module pur testé sous Node). Règles validées par l'utilisateur le 11 oct. 2026
 * (sources dans REGLES.sources ; sites officiels non consultables : estimation, réserves affichées).
 * - CNSS (secteur privé) : 60 ans ; 120 mois au minimum ; 40 % pour 40 trimestres, +0,5 % par trimestre, 80 % au plus ;
 *   salaire de référence = moyenne des 10 dernières années, plafond 6 SMIG ; départ dès 55 ans avec 360 mois,
 *   −2 points par année avant 60 ans (définitif) ; minimum 2/3 du SMIG.
 * - CNRPS (secteur public) : 62 ans, jusqu'à 65 ans sur demande ; 15 ans au minimum ; 2 % par an (10 premières années),
 *   3 % (10 suivantes), 2 % ensuite, 90 % au plus ; salaire de référence = dernière rémunération ; minimum 2/3 du SMIG.
 * - Net : moteur des pensions (retenue maladie 4 %, abattement de la loi de finances 2026).
 * Tout est en dinars d'aujourd'hui (tient lieu d'actualisation) : salaire constant, ou hausse réelle choisie.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-calcul.js"), require("../../moteurs/salaire/pension.js"));
  else racine.Retraite = fabrique(racine.OrbiteCalcul, racine.CalculPension);
})(typeof self !== "undefined" ? self : this, function (OC, CP) {
  "use strict";

  var SMIG = 554.736;  /* SMIG mensuel 48 h, 2026 (décret n° 2026-67) */
  var REGLES = {
    smig: SMIG,
    cnss: { ageLegal: 60, ageMin: 55, ageMax: 65, moisMin: 120, moisAnticipe: 360, tauxBase: 40, trimBase: 40, parTrimestre: 0.5, tauxMax: 80, anneesReference: 10, plafondSmig: 6, reductionParAn: 2 },
    cnrps: { ageLegal: 62, ageMin: 62, ageMax: 65, anneesMin: 15, tauxMax: 90 },
    minimumSmig: 2 / 3, cible: 0.8, ansRetraite: 20, rendementReel: 2,
    sources: [
      { titre: "CLEISS : le régime tunisien de sécurité sociale (salariés)", url: "https://www.cleiss.fr/docs/regimes/regime_tunisie_salaries.html" },
      { titre: "Business News (11/11/2025) : règles de départ, public et privé", url: "https://businessnews.com.tn/2025/11/11/age-duree-de-service-regime-laamouri-detaille-les-regles-de-depart-a-la-retraite-dans-les-secteurs-public-et-prive/1372142/" },
      { titre: "Loi n° 2019-37 du 30 avril 2019 (CNRPS)", url: "https://legislation-securite.tn/latest-laws/loi-n-2019-37-du-30-avril-2019-modifiant-et-completant-la-loi-n-85-12-du-5-mars-1985-relative-au-regime-des-pensions-civiles-et-militaires-de-retraite-et-des-survivants-dans-le-secteur-p/" },
      { titre: "CRES, lettre n° 3 : niveau des pensions du secteur public", url: "http://www.cres.tn/uploads/tx_wdbiblio/lettre_cres_n_3.pdf" },
      { titre: "secu.tn : calculateurs CNSS et CNRPS", url: "https://secu.tn/" }
    ]
  };

  function date(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function moisEntre(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); }
  function caisseDe(p) { return p.secteur === "public" ? "cnrps" : "cnss"; }

  /* Âge (années pleines) à une date. */
  function ageA(naissance, d) {
    var a = d.getFullYear() - naissance.getFullYear();
    if (d.getMonth() < naissance.getMonth() || (d.getMonth() === naissance.getMonth() && d.getDate() < naissance.getDate())) a--;
    return a;
  }

  /* Bornes du curseur d'âge : jamais un âge déjà dépassé. */
  function bornes(p, maintenant) {
    var m = maintenant || new Date(), c = caisseDe(p), R = REGLES[c], n = date(p.dateNaissance);
    var actuel = n ? ageA(n, m) : 0, min = Math.max(R.ageMin, actuel + 1);
    return { caisse: c, min: min, max: R.ageMax, legal: R.ageLegal, defaut: Math.min(R.ageMax, Math.max(min, R.ageLegal)), possible: min <= R.ageMax, ageActuel: actuel };
  }

  /* Taux CNRPS : 2 % par an les 10 premières années, 3 % les 10 suivantes, 2 % ensuite, 90 % au plus. */
  function tauxCnrps(annees) {
    var a = Math.max(0, annees);
    return Math.min(REGLES.cnrps.tauxMax, 2 * Math.min(a, 10) + 3 * Math.min(Math.max(a - 10, 0), 10) + 2 * Math.max(a - 20, 0));
  }
  function tauxCnss(trimestres) {
    var R = REGLES.cnss;
    return Math.min(R.tauxMax, R.tauxBase + R.parTrimestre * Math.max(0, trimestres - R.trimBase));
  }

  /* Capital qui sert une rente mensuelle pendant n années (rendement réel r % par an). */
  function capitalRente(mensuel, ans, rPct) {
    var n = ans * 12, i = rPct / 100 / 12;
    return mensuel > 0 ? (i ? mensuel * (1 - Math.pow(1 + i, -n)) / i : mensuel * n) : 0;
  }

  /*
   * estimer(p, sy, { age, maintenant, hausseReelle, cible }) → estimation à cet âge de départ.
   * etat : "ok" | "naissance" (date de naissance manquante) | "retraite" (déjà retraité) | "depasse" (âge choisi passé)
   *        | "insuffisant" (durée minimale non atteinte) | "anticipe-ferme" (CNSS : moins de 360 mois avant 60 ans).
   */
  function estimer(p, sy, o) {
    var opt = o || {}, m = opt.maintenant || new Date(), c = caisseDe(p), R = REGLES[c];
    var res = { caisse: c, etat: "ok", raisons: [] };
    if (p.activite === "retraite") { res.etat = "retraite"; return res; }
    var naissance = date(p.dateNaissance);
    if (!naissance) { res.etat = "naissance"; return res; }
    var b = bornes(p, m), age = opt.age != null ? Math.round(opt.age) : b.defaut;
    res.age = age; res.bornes = b;
    var depart = new Date(naissance.getFullYear() + age, naissance.getMonth(), 1);
    res.depart = depart;
    if (depart <= m) { res.etat = "depasse"; return res; }
    var debutIso = p.debutCarriere || p.dateEmbauche, debut = date(debutIso);
    res.debutConnu = !!p.debutCarriere; res.debut = debut;
    if (!debut) { res.etat = "carriere"; return res; }
    var sans = (p.anneesSansCotisation || 0) * 12;
    var mois = Math.max(0, moisEntre(debut, depart) - sans), moisFaits = Math.max(0, Math.min(mois, moisEntre(debut, m) - sans));
    res.mois = mois; res.moisFaits = moisFaits; res.moisAVenir = Math.max(0, moisEntre(m, depart));
    /* Revenu en dinars d'aujourd'hui : brut moyen par mois, primes comprises. */
    var s = sy.salaire, base = (s.brutAnnuel || s.brutMensuel * 12) / 12, h = opt.hausseReelle || 0, ansAvant = res.moisAVenir / 12;
    var aDate = function (t) { return base * Math.pow(1 + h, Math.max(0, t)); };
    res.netActuel = (s.netAnnuel || s.netMensuel * 12) / 12;
    res.cible = res.netActuel * (opt.cible != null ? opt.cible : REGLES.cible);
    var minimum = SMIG * REGLES.minimumSmig;
    if (c === "cnss") {
      var trim = Math.floor(mois / 3), refBrute = 0, nAns = REGLES.cnss.anneesReference;
      for (var k = 0; k < nAns; k++) refBrute += aDate(ansAvant - k - 0.5);
      refBrute /= nAns;
      var plafond = SMIG * REGLES.cnss.plafondSmig;
      res.trimestres = trim; res.refBrute = refBrute; res.plafond = plafond; res.depassePlafond = Math.max(0, refBrute - plafond);
      res.reference = Math.min(refBrute, plafond);
      res.tauxBrut = tauxCnss(trim);
      res.reduction = age < REGLES.cnss.ageLegal ? REGLES.cnss.reductionParAn * (REGLES.cnss.ageLegal - age) : 0;
      res.taux = Math.max(0, res.tauxBrut - res.reduction);
      /* Taux maximum atteint après 30 ans (120 trimestres) de cotisation. */
      res.tauxMaxLe = new Date(debut.getFullYear(), debut.getMonth() + 360 + sans, 1);
      if (mois < REGLES.cnss.moisMin) { res.etat = "insuffisant"; res.raisons.push("Il faut au moins 120 mois (10 ans) de cotisation pour une pension CNSS."); }
      else if (age < REGLES.cnss.ageLegal && mois < REGLES.cnss.moisAnticipe) { res.etat = "anticipe-ferme"; res.raisons.push("Avant 60 ans, il faut 360 mois (30 ans) de cotisation."); }
    } else {
      var annees = mois / 12;
      res.annees = annees; res.reference = aDate(ansAvant); res.refBrute = res.reference; res.depassePlafond = 0; res.reduction = 0;
      res.taux = res.tauxBrut = tauxCnrps(annees);
      res.tauxMaxLe = new Date(debut.getFullYear(), debut.getMonth() + 480 + sans, 1);
      if (annees < REGLES.cnrps.anneesMin) { res.etat = "insuffisant"; res.raisons.push("Il faut au moins 15 ans de service pour une pension CNRPS."); }
    }
    res.brut = res.etat === "ok" ? Math.max(res.reference * res.taux / 100, minimum) : 0;
    res.auMinimum = res.etat === "ok" && res.reference * res.taux / 100 < minimum;
    res.net = res.brut > 0 ? CP.calculerDepuisBrut({ brutMensuel: res.brut, chefDeFamille: !!p.chefDeFamille, enfants: 0, etudiants: 0, handicapes: 0, parents: 0, etranger: false, annee: Math.min(depart.getFullYear(), 2100) }).mensuel.net : 0;
    res.remplacement = res.netActuel > 0 ? res.net / res.netActuel : 0;
    res.ecart = res.etat === "ok" ? Math.max(0, res.cible - res.net) : 0;
    res.capital = capitalRente(res.ecart, REGLES.ansRetraite, REGLES.rendementReel);
    res.mensuel = OC.versementPourCapital(res.capital, res.moisAVenir, REGLES.rendementReel);
    return res;
  }

  /* Toutes les estimations du curseur (une par âge). */
  function courbe(p, sy, o) {
    var b = bornes(p, (o && o.maintenant) || new Date()), out = [];
    for (var a = b.min; a <= b.max; a++) out.push(estimer(p, sy, Object.assign({}, o, { age: a })));
    return out;
  }

  return { REGLES: REGLES, caisseDe: caisseDe, bornes: bornes, tauxCnss: tauxCnss, tauxCnrps: tauxCnrps, capitalRente: capitalRente, estimer: estimer, courbe: courbe };
});
