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
    /* Hors immobilier, la durée d'un crédit est plafonnée à 7 ans : c'est elle qui donne le montant maximal. */
    { cle: "auto", libelle: "Crédit auto", court: "Auto", dureeMois: 84, tauxPct: TMM + 3 },
    { cle: "conso", libelle: "Crédit à la consommation", court: "Consommation", dureeMois: 84, tauxPct: TMM + 3.5 }
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
      prenom: "", nom: "", dateNaissance: "", dateEmbauche: "", anneeNaissance: 1990, situation: "celibataire", statut: "cdi", anciennete: 3,
      montant: 2500, sens: "brut", periode: "mensuel", secteur: "prive", nombreSalaires: 12, calendrierPrimes: [],
      primesImposables: 0, primesNonCotisables: 0, avantagesNature: 0, indemnitesNonImposables: 0,
      chefDeFamille: false, enfants: 0, etudiants: 0, handicapes: 0, parents: 0,
      credits: [], contrats: [], projets: [], historiqueSalaire: [], scenarios: [], rappelsPerso: [],
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
  /* Date « AAAA-MM-JJ » valide et comprise entre deux bornes, sinon chaîne vide. */
  function dateIso(v, min, max) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
    var d = new Date(v + "T12:00:00");
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return "";
    return v >= min && v <= max ? v : "";
  }
  function isoDecale(ans, maintenant) { var m = maintenant || new Date(); return new Date(m.getFullYear() - ans, m.getMonth(), m.getDate(), 12).toISOString().slice(0, 10); }
  /* Années pleines écoulées depuis une date « AAAA-MM-JJ ». */
  function anneesDepuis(iso, maintenant) {
    var m = maintenant || new Date(), a = +iso.slice(0, 4), mo = +iso.slice(5, 7), j = +iso.slice(8, 10);
    var n = m.getFullYear() - a;
    if (m.getMonth() + 1 < mo || (m.getMonth() + 1 === mo && m.getDate() < j)) n--;
    return Math.max(0, n);
  }
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
      moisRestants: entier(c.moisRestants, 0, 0, 480),
      /* Facultatif : date de début et durée totale ; les échéances restantes en sont alors déduites. */
      moisDebut: entier(c.moisDebut, 0, 0, 12),
      anneeDebut: entier(c.anneeDebut, 0, 0, 2100),
      dureeMois: entier(c.dureeMois, 0, 0, 480),
      /* Règle des 8 % : type de taux (« fixe », « variable » ou non précisé) et dernière réduction de taux obtenue. */
      tauxType: choix(c.tauxType, ["fixe", "variable"], ""),
      reductionMois: entier(c.reductionMois, 0, 0, 12),
      reductionAnnee: entier(c.reductionAnnee, 0, 0, 2100)
    };
  }

  /* Échéances restantes d'après la date de début et la durée (12 échéances par an, la première le mois suivant le déblocage). */
  function echeancier(c, maintenant) {
    var m = maintenant || new Date();
    if (!(c.dureeMois > 0) || !(c.anneeDebut > 1970) || !(c.moisDebut > 0)) return null;
    var payees = Math.max(0, (m.getFullYear() - c.anneeDebut) * 12 + (m.getMonth() + 1 - c.moisDebut));
    var restantes = Math.max(0, c.dureeMois - Math.min(payees, c.dureeMois));
    var fin = c.moisDebut - 1 + c.dureeMois;
    return { payees: Math.min(payees, c.dureeMois), restantes: restantes, fin: MOIS[fin % 12] + " " + (c.anneeDebut + Math.floor(fin / 12)) };
  }
  function appliquerEcheanciers(p, maintenant) {
    p.credits.forEach(function (c) { var e = echeancier(c, maintenant); if (e) c.moisRestants = e.restantes; c.reductionTaux = reductionsTaux(c, maintenant); });
    return p;
  }

  /* Règle des 8 % (loi n° 2024-41 du 2 août 2024), crédit à taux fixe de plus de 84 mois : avant l'échéance k, si les
     intérêts des 36 échéances précédentes dépassent strictement 8 % du capital restant dû, le taux est divisé par deux
     et la mensualité baisse (même date de fin). Premier contrôle à l'échéance 37, puis chaque mois tant que la
     condition n'est pas remplie ; après une réduction, contrôle suivant 36 échéances plus tard, sans limite de nombre.
     Le passé est reconstitué à partir de la mensualité, du taux et des échéances restantes (taux et mensualité
     constants depuis le début du crédit, ou depuis la dernière réduction obtenue). */
  var REGLE_8 = { seuil: 0.08, fenetre: 36, dureeMin: 84 };
  function dateEcheance(c, k) { var i = c.moisDebut - 1 + k; return MOIS[i % 12] + " " + (c.anneeDebut + Math.floor(i / 12)); }
  function reductionsTaux(c, maintenant) {
    var res = { applicable: false, motif: null, reductions: [], prochainControle: null, possibleDepuis: null, derniere: null };
    if (!(c.mensualite > 0) || !(c.tauxPct > 0)) { res.motif = "donnees"; return res; }
    if (c.tauxType === "variable") { res.motif = "variable"; return res; }
    var e = echeancier(c, maintenant);
    if (c.dureeMois > 0 && c.dureeMois <= REGLE_8.dureeMin) { res.motif = "duree"; return res; }
    if (c.tauxType !== "fixe") { res.motif = "type"; return res; }
    if (!e) { res.motif = "dates"; return res; }
    var p = e.payees, n = e.restantes, fin = p + n, F0 = REGLE_8.fenetre;
    if (!(n > 0)) { res.motif = "fini"; return res; }
    res.applicable = true;
    var R = c.reductionAnnee > 1970 && c.reductionMois > 0 ? (c.reductionAnnee - c.anneeDebut) * 12 + (c.reductionMois - c.moisDebut) : 0;
    if (R < 1 || R > p) R = 0;
    if (R) res.derniere = { echeance: R, date: dateEcheance(c, R) };
    /* Intérêts payés depuis le début ou la dernière réduction (reconstitués à rebours) et capital restant après chaque échéance. */
    var r = c.tauxPct / 1200, M = c.mensualite, K = capitalPourMensualite(M, c.tauxPct, n), interets = {}, restes = {}, debut = Math.max(R, 1);
    restes[p] = K;
    for (var k = p, Kb = K; k >= debut; k--) { var Kav = (Kb + M) / (1 + r); interets[k] = Kav * r; restes[k - 1] = Kav; Kb = Kav; }
    function somme(a, b) { var t = 0; for (var j = a; j <= b; j++) t += interets[j]; return t; }
    var prochain = R ? R + F0 : F0 + 1;
    /* Contrôles déjà passés : réduction possible mais pas encore obtenue ? */
    for (k = prochain; k <= p; k++) {
      var ratio0 = somme(k - F0, k - 1) / restes[k - 1];
      if (ratio0 > REGLE_8.seuil) { res.possibleDepuis = { echeance: k, date: dateEcheance(c, k), ratio: ratio0 }; break; }
    }
    prochain = Math.max(prochain, p + 1);
    var fenetre = [];
    for (k = Math.max(debut, p - F0 + 1); k <= p; k++) fenetre.push(interets[k]);
    var taux = c.tauxPct, Kc = K, Mc = M;
    for (k = p + 1; k <= fin; k++) {
      if (k >= prochain) {
        var w = fenetre.slice(-F0), s = w.reduce(function (a, b) { return a + b; }, 0), ratio = Kc > 0 ? s / Kc : 0;
        var ok = w.length === F0 && ratio > REGLE_8.seuil;
        if (!res.prochainControle) res.prochainControle = { t: k - p, echeance: k, date: dateEcheance(c, k), ratio: ratio, ok: ok };
        if (ok) {
          var avant = taux, mAvant = Mc;
          taux /= 2; Mc = mensualitePourCapital(Kc, taux, fin - k + 1);
          res.reductions.push({ t: k - p, echeance: k, date: dateEcheance(c, k), tauxAvant: avant, tauxPct: taux, mensualiteAvant: mAvant, mensualite: Mc, ratio: ratio, capital: Kc });
          prochain = k + F0;
        } else prochain = k + 1;
      }
      var i = Kc * taux / 1200; fenetre.push(i); Kc -= Mc - i;
    }
    return res;
  }
  /* Taux d'origine d'un crédit dont le taux a déjà été divisé par deux (référence pour les futurs crédits). */
  function tauxOrigine(c) { return c.reductionAnnee > 1970 && c.reductionMois > 0 && c.tauxType === "fixe" ? c.tauxPct * 2 : c.tauxPct; }
  function normaliserContrat(c) {
    c = c || {};
    return {
      libelle: texte(c.libelle, 60) || "Contrat",
      type: choix(c.type, ["av", "cea"], "av"),
      versementMensuel: nombre(c.versementMensuel, 0, 0, 1e6),
      capitalActuel: nombre(c.capitalActuel, 0, 0, 1e8),
      anneeDebut: entier(c.anneeDebut, anneeCourante(), 1970, 2100),
      moisDebut: entier(c.moisDebut, 1, 1, 12),
      versementsLibres: nombre(c.versementsLibres, 0, 0, 1e8),
      versementsLibresAn: nombre(c.versementsLibresAn, 0, 0, 1e7)
    };
  }
  /* Historique du salaire : chaque entrée est un salaire et le mois à partir duquel il s'applique.
     mois = 0 et annee = 0 : le salaire d'avant la première date connue. */
  function normaliserHausse(h) {
    h = h || {};
    return { montant: nombre(h.montant, 0, 0, 1e7), sens: choix(h.sens, ["brut", "net"], "brut"), periode: choix(h.periode, ["mensuel", "annuel"], "mensuel"),
      mois: entier(h.mois, 0, 0, 12), annee: entier(h.annee, 0, 0, 2100) };
  }
  function cleHausse(h) { return h.annee > 0 && h.mois > 0 ? h.annee * 12 + h.mois - 1 : -1e9; }
  function normaliserProjet(c) {
    c = c || {};
    return {
      type: choix(c.type, Object.keys(PROJETS), "autre"),
      libelle: texte(c.libelle, 60),
      montant: nombre(c.montant, 0, 0, 1e8),
      horizonAns: entier(c.horizonAns, 3, 0, 40)
    };
  }

  /* Scénarios « Et si… » (calculés par scenarios-calcul.js) : 3 au plus, 8 changements datés chacun. */
  var MAX_SCENARIOS = 3, MAX_CHANGEMENTS = 8;
  var SC_TYPES = ["salaire", "credit", "epargne", "vie"], SC_EVENEMENTS = ["mariage", "enfant", "rembourser"];
  function normaliserChangement(c) {
    c = c || {};
    var type = SC_TYPES.indexOf(c.type) !== -1 ? c.type : null;
    if (!type) return null;
    var x = { type: type, mois: Math.round(nombre(c.mois, 1, 1, 12)), annee: Math.round(nombre(c.annee, 2026, 1990, 2100)) };
    if (type === "salaire") {
      x.montant = nombre(c.montant, 0, 0, 1e6); x.sens = c.sens === "net" ? "net" : "brut"; x.periode = c.periode === "annuel" ? "annuel" : "mensuel";
      if (!(x.montant > 0)) return null;
    } else if (type === "credit") {
      x.libelle = texte(c.libelle, 40) || "Nouveau crédit";
      x.typeCredit = ["immo", "auto", "conso", "autre"].indexOf(c.typeCredit) !== -1 ? c.typeCredit : "conso";
      x.capital = nombre(c.capital, 0, 0, 5e6); x.tauxPct = nombre(c.tauxPct, 0, 0, 30); x.dureeMois = Math.round(nombre(c.dureeMois, 0, 0, 360));
      if (!(x.capital > 0 && x.dureeMois > 0)) return null;
    } else if (type === "epargne") {
      x.produit = c.produit === "cea" ? "cea" : "av"; x.versementMensuel = nombre(c.versementMensuel, 0, 0, 1e5);
      if (!(x.versementMensuel > 0)) return null;
    } else {
      x.evenement = SC_EVENEMENTS.indexOf(c.evenement) !== -1 ? c.evenement : null;
      if (!x.evenement) return null;
      if (x.evenement === "rembourser") x.credit = Math.round(nombre(c.credit, -1, -1, 50));
    }
    return x;
  }
  function normaliserScenario(s, i) {
    s = s || {};
    return { id: texte(s.id, 20) || "s" + (i + 1), nom: texte(s.nom, 40) || "Scénario " + "ABC".charAt(i),
      changements: (Array.isArray(s.changements) ? s.changements : []).map(normaliserChangement).filter(Boolean).slice(0, MAX_CHANGEMENTS) };
  }

  /* Rappels que l'utilisateur a programmés (par exemple « Appliquer à mon profil » d'un scénario) : affichés au mois choisi. */
  function normaliserRappel(r) {
    r = r || {};
    var url = typeof r.url === "string" && /^\/espace\/#[a-z]+(\?[a-z0-9=&._-]*)?$/i.test(r.url) ? r.url : "/espace/#profil";
    return { id: texte(r.id, 40).replace(/[^a-z0-9_-]/gi, "") || "perso", titre: texte(r.titre, 90), corps: texte(r.corps, 240), url: url,
      mois: entier(r.mois, 1, 1, 12), annee: entier(r.annee, 0, 0, 2100) };
  }

  /* Coordonnées facultatives. Email : forme simple vérifiée. Téléphone : 8 chiffres = Tunisie (+216), sinon +indicatif (8 à 15 chiffres). */
  function lireEmail(v) {
    var t = String(v == null ? "" : v).trim().toLowerCase();
    if (!t) return { valide: true, valeur: "" };
    return t.length <= 120 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(t) ? { valide: true, valeur: t } : { valide: false, valeur: "" };
  }
  function lireTelephone(v) {
    var t = String(v == null ? "" : v).trim();
    if (!t) return { valide: true, valeur: "" };
    if (/[^\d\s().+-]/.test(t)) return { valide: false, valeur: "" };
    var plus = /^(\+|00)/.test(t), d = t.replace(/^00/, "").replace(/\D/g, "");
    if (!plus && d.length === 8 && /^[2-9]/.test(d)) return { valide: true, valeur: "+216" + d };
    if (plus && d.indexOf("216") === 0) return d.length === 11 && /^[2-9]/.test(d.charAt(3)) ? { valide: true, valeur: "+" + d } : { valide: false, valeur: "" };
    if (plus && d.length >= 8 && d.length <= 15 && d.charAt(0) !== "0") return { valide: true, valeur: "+" + d };
    return { valide: false, valeur: "" };
  }
  function formatTelephone(v) {
    if (!v) return "";
    var m = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(v);
    return m ? "+216 " + m[1] + " " + m[2] + " " + m[3] : v;
  }

  /* Profil nettoyé : tout champ inconnu ou hors bornes reprend sa valeur par défaut. */
  function normaliser(p0) {
    var d = profilParDefaut(), p = p0 || {};
    function liste(v, fn, max) { return Array.isArray(v) ? v.slice(0, max).map(fn) : []; }
    return {
      prenom: texte(p.prenom, 40),
      nom: texte(p.nom, 60),
      emailContact: lireEmail(p.emailContact).valeur,
      telephone: lireTelephone(p.telephone).valeur,
      /* Accord pour être recontacté (visible par l'administrateur seulement s'il est donné) et rappels par email. */
      contactOk: !!p.contactOk,
      contactOkLe: p.contactOk && typeof p.contactOkLe === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(p.contactOkLe) ? p.contactOkLe : "",
      rappelsEmail: !!p.rappelsEmail,
      /* Date de naissance complète (âge au jour près) ; l'année seule reste lue pour les anciens profils. */
      dateNaissance: dateIso(p.dateNaissance, "1930-01-01", isoDecale(16)),
      dateEmbauche: dateIso(p.dateEmbauche, "1960-01-01", isoDecale(0)),
      anneeNaissance: dateIso(p.dateNaissance, "1930-01-01", isoDecale(16)) ? +p.dateNaissance.slice(0, 4) : entier(p.anneeNaissance, d.anneeNaissance, 1930, anneeCourante() - 16),
      situation: choix(p.situation, ["celibataire", "marie", "divorce", "veuf"], "celibataire"),
      statut: choix(p.statut, ["cdi", "cdd", "fonctionnaire", "contractuel", "autre"], "cdi"),
      /* Ancienneté calculée depuis la date d'embauche quand elle est connue. */
      anciennete: dateIso(p.dateEmbauche, "1960-01-01", isoDecale(0)) ? Math.min(50, anneesDepuis(p.dateEmbauche)) : entier(p.anciennete, d.anciennete, 0, 50),
      montant: nombre(p.montant, d.montant, 0, 1e7),
      sens: p.sens === "net" ? "net" : "brut",
      periode: p.periode === "annuel" ? "annuel" : "mensuel",
      secteur: p.secteur === "public" ? "public" : "prive",
      nombreSalaires: entier(p.nombreSalaires, d.nombreSalaires, 12, 18),
      /* Versements supplémentaires par mois (janvier → décembre), en nombre de salaires, par pas de 0,5. Vide : tout en décembre. */
      calendrierPrimes: Array.isArray(p.calendrierPrimes) && p.calendrierPrimes.length === 12
        ? p.calendrierPrimes.map(function (v) { return Math.round(nombre(v, 0, 0, 6) * 2) / 2; }) : [],
      primesImposables: nombre(p.primesImposables, 0, 0, 1e6),
      primesNonCotisables: nombre(p.primesNonCotisables, 0, 0, 1e6),
      avantagesNature: nombre(p.avantagesNature, 0, 0, 1e6),
      indemnitesNonImposables: nombre(p.indemnitesNonImposables, 0, 0, 1e6),
      chefDeFamille: !!p.chefDeFamille,
      enfants: entier(p.enfants, 0, 0, 15),
      etudiants: entier(p.etudiants, 0, 0, 15),
      handicapes: entier(p.handicapes, 0, 0, 15),
      parents: entier(p.parents, 0, 0, 2),
      credits: liste(p.credits, normaliserCredit, 12).map(function (c) { var e = echeancier(c); if (e) c.moisRestants = e.restantes; return c; }),
      contrats: liste(p.contrats, normaliserContrat, 12),
      projets: liste(p.projets, normaliserProjet, 8),
      scenarios: liste(p.scenarios, normaliserScenario, MAX_SCENARIOS),
      rappelsPerso: liste(p.rappelsPerso, normaliserRappel, 20).filter(function (r) { return r.titre && r.annee > 0; }),
      historiqueSalaire: liste(p.historiqueSalaire, normaliserHausse, 40).filter(function (h) { return h.montant > 0; }).sort(function (a, b) { return cleHausse(a) - cleHausse(b); }),
      loyer: nombre(p.loyer, 0, 0, 1e6),
      chargesFixes: nombre(p.chargesFixes, 0, 0, 1e6),
      epargneDisponible: nombre(p.epargneDisponible, 0, 0, 1e9),
      autresRevenus: nombre(p.autresRevenus, 0, 0, 1e7),
      quotiteNet: nombre(p.quotiteNet, QUOTITE, 0.1, 0.8),
      quotiteBrut: nombre(p.quotiteBrut, QUOTITE, 0.1, 0.8),
      baseBanque: p.baseBanque === "brut" ? "brut" : "net",
      /* Revenu retenu par la banque : salaires et primes de l'année ÷ 12 (par défaut), ou le seul salaire mensuel. */
      revenuBanque: p.revenuBanque === "mensuel" ? "mensuel" : "annuel",
      banque: texte(p.banque, 40),
      /* Taux d'un nouveau crédit immobilier choisi par l'utilisateur (null : déduit automatiquement, voir tauxImmo). */
      tauxAutoPct: p.tauxAutoPct === null || p.tauxAutoPct === undefined || p.tauxAutoPct === "" ? null : nombre(p.tauxAutoPct, null, 0, 30),
      tauxConsoPct: p.tauxConsoPct === null || p.tauxConsoPct === undefined || p.tauxConsoPct === "" ? null : nombre(p.tauxConsoPct, null, 0, 30),
      tauxImmoPct: p.tauxImmoPct === null || p.tauxImmoPct === undefined || p.tauxImmoPct === "" ? null : nombre(p.tauxImmoPct, null, 0, 30),
      /* Mode couple / foyer : salaire du conjoint et mensualités de ses propres crédits (imposé séparément). */
      foyer: !!p.foyer,
      conjointPrenom: texte(p.conjointPrenom, 40),
      conjointMontant: nombre(p.conjointMontant, 0, 0, 1e7),
      conjointSens: p.conjointSens === "net" ? "net" : "brut",
      conjointSalaires: entier(p.conjointSalaires, 12, 12, 18),
      conjointSecteur: p.conjointSecteur === "public" ? "public" : "prive",
      conjointCredits: nombre(p.conjointCredits, 0, 0, 1e6)
    };
  }

  /* Taux retenu pour un nouveau crédit immobilier : celui choisi par l'utilisateur, sinon celui de son crédit
     immobilier en cours (souvent un taux préférentiel, par exemple pour le personnel de banque), sinon le marché. */
  function tauxImmo(p) {
    if (p.tauxImmoPct !== null && p.tauxImmoPct !== undefined && isFinite(p.tauxImmoPct)) return { tauxPct: p.tauxImmoPct, source: "choisi" };
    var c = (p.credits || []).filter(function (x) { return x.type === "immo" && x.tauxPct > 0; })[0];
    if (c) return { tauxPct: tauxOrigine(c), source: "credit", libelle: c.libelle, origine: tauxOrigine(c) !== c.tauxPct };
    return { tauxPct: TMM + 2.5, source: "marche" };
  }

  /* Taux retenu pour un nouveau crédit auto ou à la consommation : celui choisi par l'utilisateur, sinon celui de son
     crédit en cours du même type (taux préférentiel probable), sinon le marché (TMM + 3 points pour l'auto, + 3,5 pour la conso). */
  function tauxChoisiOuCredit(p, type, choisi, marche) {
    if (choisi !== null && choisi !== undefined && isFinite(choisi)) return { tauxPct: choisi, source: "choisi" };
    var c = (p.credits || []).filter(function (x) { return x.type === type && x.tauxPct > 0; })[0];
    if (c) return { tauxPct: tauxOrigine(c), source: "credit", libelle: c.libelle, origine: tauxOrigine(c) !== c.tauxPct };
    return { tauxPct: marche, source: "marche" };
  }

  /* Taux retenus pour chaque type de nouveau crédit. Hors immobilier : celui d'un crédit en cours du même type
     (taux préférentiel probable), sinon le taux du marché. */
  function tauxNouveaux(p) {
    return { immo: tauxImmo(p), auto: tauxChoisiOuCredit(p, "auto", p.tauxAutoPct, TMM + 3), conso: tauxChoisiOuCredit(p, "conso", p.tauxConsoPct, TMM + 3.5) };
  }
  function tauxDe(taux, cle) { var t = taux && taux[cle.indexOf("immo") === 0 ? "immo" : cle]; return t ? t.tauxPct : null; }

  function age(p, maintenant) {
    if (p.dateNaissance) return Math.max(16, anneesDepuis(p.dateNaissance, maintenant));
    return Math.max(16, anneeCourante(maintenant) - p.anneeNaissance);
  }

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
    var a = av.annee.annuel, mt = av.moisType.annuel, supp = av.versements.supplementaires;
    return {
      entree: eb.entree,
      /* Impôt (IRPP + CSS) retenu sur un mois habituel, et sur chaque versement supplémentaire (supplément de l'année). */
      impotMois: (mt.irpp + mt.css) / 12,
      impotParVersement: supp > 0 ? (a.irpp + a.css - mt.irpp - mt.css) / supp : 0,
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

  /* Calendrier des versements supplémentaires : celui du profil, sinon tous en décembre. */
  /* ---------- Historique du salaire ---------- */
  /* Salaire en vigueur un mois donné (mois0 : 0 à 11) : la dernière entrée dont la date est passée, sinon null. */
  function salaireEnVigueur(p, annee, mois0) {
    var cible = annee * 12 + mois0, r = null;
    (p.historiqueSalaire || []).forEach(function (h) { if (cleHausse(h) <= cible) r = h; });
    return r;
  }
  function memeSalaire(a, b) { return !!a && !!b && Math.abs(a.montant - b.montant) < 0.0005 && a.sens === b.sens && a.periode === b.periode; }
  function salaireDe(p, h) { return salaire(Object.assign({}, p, { montant: h.montant, sens: h.sens, periode: h.periode })); }
  /* Profil aligné sur le salaire en vigueur aujourd'hui (une hausse datée arrive à son mois). */
  function appliquerHistorique(p0, maintenant) {
    var m = maintenant || new Date(), h = salaireEnVigueur(p0, m.getFullYear(), m.getMonth());
    if (!h || memeSalaire(h, p0)) return { profil: p0, change: false, entree: h };
    return { profil: Object.assign({}, p0, { montant: h.montant, sens: h.sens, periode: h.periode }), change: true, entree: h };
  }
  /* Où en est le salaire : en vigueur, précédent (hausse en %), prochaine hausse prévue. */
  function infoHistorique(p, s, maintenant) {
    var hist = p.historiqueSalaire || [];
    if (!hist.length) return null;
    var m = maintenant || new Date(), cle = m.getFullYear() * 12 + m.getMonth();
    var ici = salaireEnVigueur(p, m.getFullYear(), m.getMonth()), i = ici ? hist.indexOf(ici) : -1, prec = null;
    for (var k = i - 1; k >= 0; k--) if (!memeSalaire(hist[k], ici)) { prec = hist[k]; break; }
    var sPrec = prec ? salaireDe(p, prec) : null;
    var futurs = hist.filter(function (h) { return cleHausse(h) > cle; }).map(function (h) {
      var sf = salaireDe(p, h);
      return { entree: h, mois: cleHausse(h) - cle, date: MOIS[h.mois - 1] + " " + h.annee, brutMensuel: sf.brutMensuel, netMensuel: sf.netMensuel, netAnnuel: sf.netAnnuel, brutAnnuel: sf.brutAnnuel };
    });
    return { liste: hist, enVigueur: ici, depuis: ici && ici.annee ? MOIS[ici.mois - 1] + " " + ici.annee : null,
      precedent: prec, hausse: sPrec && sPrec.brutMensuel > 0 ? s.brutMensuel / sPrec.brutMensuel - 1 : null, brutPrecedent: sPrec ? sPrec.brutMensuel : null, futurs: futurs };
  }
  /* Salaire de l'année civile calculé mois par mois : chaque mois (et chaque prime) au salaire alors en vigueur.
     L'impôt annuel porte sur le total de l'année. Renvoie null si le salaire ne change pas dans l'année. */
  function salaireAnnee(p, maintenant) {
    if (!(p.historiqueSalaire || []).length) return null;
    var Y = (maintenant || new Date()).getFullYear(), cal = calendrierPrimes(p), cache = {}, parMois = [], brutAn = 0, ids = {};
    for (var k = 0; k < 12; k++) {
      var h = salaireEnVigueur(p, Y, k) || { montant: p.montant, sens: p.sens, periode: p.periode };
      var id = h.montant + "|" + h.sens + "|" + h.periode, S = cache[id] || (cache[id] = salaireDe(p, h));
      ids[id] = true;
      parMois.push({ mois: k, brutMensuel: S.brutMensuel, primes: cal[k], retenue: S.impotMois + cal[k] * S.impotParVersement, salaire: h });
      brutAn += S.brutMensuel * (1 + cal[k]);
    }
    if (Object.keys(ids).length < 2) return null;
    var n = 12 + cal.reduce(function (a, b) { return a + b; }, 0);
    var sA = salaire(Object.assign({}, p, { sens: "brut", periode: "mensuel", montant: brutAn / n, nombreSalaires: n }));
    sA.parMois = parMois; sA.annee = Y; sA.varie = true;
    return sA;
  }

  function calendrierPrimes(p) {
    var extra = Math.max(0, p.nombreSalaires - 12), c = p.calendrierPrimes || [];
    if (c.length === 12 && c.some(function (v) { return v > 0; })) return c.slice();
    var d = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; d[11] = extra; return d;
  }

  /* Impôt sur le salaire qui reste à retenir d'ici le 31 décembre : les mois habituels restants (paie de fin de mois,
     mois en cours compris) et les versements supplémentaires prévus à partir du mois en cours. */
  function impotRestantAnnee(sy, maintenant) {
    var m = maintenant || sy.maintenant || new Date(), mois = m.getMonth(), s = sy.salaire;
    var cal = calendrierPrimes(sy.profil), primes = 0;
    for (var k = mois; k < 12; k++) primes += cal[k];
    var moisRestants = 12 - mois;
    /* Salaire qui change dans l'année : chaque paie restante retient l'impôt au salaire de son mois. */
    var sa = sy.salaireAnnee;
    if (sa && sa.parMois && sa.annee === m.getFullYear()) {
      var mt = 0; for (var j = mois; j < 12; j++) mt += sa.parMois[j].retenue;
      return { moisRestants: moisRestants, primesRestantes: primes, calendrier: cal, montant: mt, moisParMois: true };
    }
    return { moisRestants: moisRestants, primesRestantes: primes, calendrier: cal,
      montant: moisRestants * s.impotMois + primes * s.impotParVersement };
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
  var TAUX_MARCHE = { immo: TMM + 2.5, auto: TMM + 3, conso: TMM + 3.5, autre: TMM + 3.5 };

  /* Crédits en cours : ceux dont le taux est nettement inférieur au marché (à garder) ou supérieur (à renégocier). */
  function analyseTaux(p) {
    var bas = [], hauts = [];
    p.credits.forEach(function (c) {
      if (!(c.tauxPct > 0) || !(c.mensualite > 0)) return;
      var marche = TAUX_MARCHE[c.type] || TMM + 3.5;
      if (c.tauxPct <= marche - 2) bas.push({ libelle: c.libelle, tauxPct: c.tauxPct, marchePct: marche });
      else if (c.tauxPct >= marche - 0.5) hauts.push({ libelle: c.libelle, tauxPct: c.tauxPct, marchePct: marche });
    });
    return { bas: bas, hauts: hauts };
  }

  /* Évolution des mensualités en cours : fin de chaque crédit et, pour un crédit à taux fixe de plus de 84 mois,
     baisses de mensualité dues à la règle des 8 %. Regroupées par mois (depuis aujourd'hui), dans l'ordre. */
  function evolutionCharges(p) {
    var ev = [];
    p.credits.forEach(function (c, i) {
      if (!(c.mensualite > 0)) return;
      (c.reductionTaux && c.reductionTaux.reductions || []).forEach(function (r) {
        if (!(c.moisRestants > 0) || r.t < c.moisRestants) ev.push({ mois: r.t, i: i, mensualite: r.mensualite, reduction: true, libelle: c.libelle });
      });
      if (c.moisRestants > 0) ev.push({ mois: c.moisRestants, i: i, mensualite: 0, reduction: false, libelle: c.libelle });
    });
    ev.sort(function (a, b) { return a.mois - b.mois || (a.reduction ? -1 : 1); });
    var groupes = [];
    ev.forEach(function (e) { var g = groupes[groupes.length - 1]; if (!g || g.mois !== e.mois) groupes.push(g = { mois: e.mois, ev: [] }); g.ev.push(e); });
    return groupes;
  }
  /* Ajoute aux groupes les hausses de salaire prévues : { mois, revenu } (revenu retenu par la banque à partir de ce mois). */
  function avecHausses(groupes, hausses) {
    (hausses || []).forEach(function (h) {
      if (!(h.mois > 0)) return;
      var g = groupes.filter(function (x) { return x.mois === h.mois; })[0];
      if (!g) { g = { mois: h.mois, ev: [] }; groupes.push(g); }
      g.revenu = h.revenu;
    });
    return groupes.sort(function (a, b) { return a.mois - b.mois; });
  }
  function chargesActuelles(p) {
    var m = {};
    p.credits.forEach(function (c, i) { if (c.mensualite > 0) m[i] = c.mensualite; });
    return m;
  }
  function total(m) { return Object.keys(m).reduce(function (t, k) { return t + m[k]; }, 0); }

  /* À quelle date l'endettement repasse sous la quotité, au fil de la fin des crédits en cours (et des réductions de taux) ? */
  function sortieEndettement(p, revenuMensuel, quotite, hausses) {
    var actifs = p.credits.filter(function (c) { return c.mensualite > 0; });
    var m = chargesActuelles(p), charges = total(m);
    if (!(revenuMensuel > 0) || charges <= revenuMensuel * quotite) return null;
    if (actifs.some(function (c) { return !(c.moisRestants > 0); })) return null;
    var finis = [], reduits = [], groupes = avecHausses(evolutionCharges(p), hausses), hausse = false;
    for (var g = 0; g < groupes.length; g++) {
      if (groupes[g].revenu != null) { revenuMensuel = groupes[g].revenu; hausse = true; }
      groupes[g].ev.forEach(function (e) {
        if (e.mensualite > 0) m[e.i] = e.mensualite; else delete m[e.i];
        if (e.reduction) { if (reduits.indexOf(e.libelle) === -1) reduits.push(e.libelle); } else finis.push(e.libelle);
      });
      charges = total(m);
      if (charges <= revenuMensuel * quotite + 1e-9) {
        return { mois: groupes[g].mois, credits: finis.slice(), reduits: reduits.filter(function (l) { return finis.indexOf(l) === -1; }), hausse: hausse, revenu: revenuMensuel, charges: Math.max(0, charges), taux: Math.max(0, charges) / revenuMensuel,
          mensualiteLiberee: Math.max(0, revenuMensuel * quotite - charges) };
      }
    }
    return null;
  }

  /* Étapes de la marge d'emprunt : à chaque fin de crédit (ou réduction de taux d'un crédit à taux fixe), la mensualité possible augmente. */
  function paliersMarge(p, revenu, quotite, ageActuel, maintenant, hausses) {
    var mt = maintenant || new Date();
    var m = chargesActuelles(p), charges = total(m);
    var res = [], avant = Math.max(0, revenu * quotite - charges), finis = [], reduits = [], hausse = false, taux = tauxNouveaux(p), t = taux.immo.tauxPct;
    avecHausses(evolutionCharges(p), hausses).forEach(function (g) {
      if (g.revenu != null) { revenu = g.revenu; hausse = true; }
      g.ev.forEach(function (e) {
        if (e.mensualite > 0) m[e.i] = e.mensualite; else delete m[e.i];
        if (e.reduction) { if (reduits.indexOf(e.libelle) === -1) reduits.push(e.libelle); } else finis.push(e.libelle);
      });
      charges = total(m);
      var marge = Math.max(0, revenu * quotite - charges), mois = g.mois;
      /* Une réduction de taux seule ne fait une étape que si elle libère au moins 10 DT par mois. */
      var seuil = g.ev.every(function (e) { return e.reduction; }) ? 10 : 0.5;
      if (marge > avant + seuil) {
        var d = new Date(mt.getFullYear(), mt.getMonth() + mois, 1);
        var moisAge = Math.max(0, (AGE_MAX - ageActuel - Math.ceil(mois / 12)) * 12), n = Math.min(240, moisAge);
        /* Plafond de chaque type de crédit avec la même mensualité (immobilier 20 ans, autres 7 ans au plus). */
        var offres = ["immo", "auto", "conso"].map(function (cle) {
          var ty = CREDITS_TYPES.filter(function (x) { return x.cle === cle; })[0], nn = Math.min(ty.dureeMois, moisAge), tx = tauxDe(taux, cle);
          return { cle: cle, libelle: ty.court, dureeMois: nn, tauxPct: tx, capital: capitalPourMensualite(marge, tx, nn), source: taux[cle].source };
        });
        res.push({ mois: mois, date: MOIS[d.getMonth()] + " " + d.getFullYear(), credits: finis, reduits: reduits.filter(function (l) { return finis.indexOf(l) === -1; }), hausse: hausse, revenu: revenu, charges: Math.max(0, charges),
          mensualiteMax: marge, capitalImmo: capitalPourMensualite(marge, t, n), dureeImmoMois: n, tauxPct: t, offres: offres });
        finis = []; reduits = []; hausse = false;
      }
      avant = marge;
    });
    return res;
  }

  /* Libellé d'une étape : « fin du crédit auto », « réduction de taux du crédit immobilier », ou les deux. */
  function evenementEtape(x, darija) {
    function liste(l, et) { l = l.map(function (c) { return c.charAt(0).toLowerCase() + c.slice(1); }); return l.length > 1 ? l.slice(0, -1).join(", ") + et + l[l.length - 1] : l[0]; }
    var morceaux = [], cr = x.credits || [], rd = x.reduits || [];
    if (darija) {
      if (x.hausse) morceaux.push("ki yzid salaire mte3ek");
      if (cr.length) morceaux.push("ki yekmel " + liste(cr, " w "));
      if (rd.length) morceaux.push("ki yon9ess el taux mta3 " + liste(rd, " w "));
      return morceaux.join(" w ");
    }
    if (x.hausse) morceaux.push("hausse de salaire");
    if (cr.length) morceaux.push("fin " + (cr.length > 1 ? "des crédits " : "du crédit ") + liste(cr.map(function (c) { return c.replace(/^crédit /i, ""); }), " et "));
    if (rd.length) morceaux.push("réduction de taux " + (rd.length > 1 ? "des crédits " : "du crédit ") + liste(rd.map(function (c) { return c.replace(/^crédit /i, ""); }), " et "));
    return morceaux.join(" et ");
  }

  function chargesCredits(p) {
    return p.credits.reduce(function (s, c) { return s + (c.moisRestants === 0 && c.capitalRestant === 0 && c.mensualite === 0 ? 0 : c.mensualite); }, 0);
  }

  /* Capacité d'emprunt sur une base de revenu mensuel (net ou brut). */
  function capacite(revenuMensuel, quotite, charges, ageActuel, taux) {
    var mensualiteMax = Math.max(0, revenuMensuel * quotite - charges);
    var moisMaxAge = Math.max(0, (AGE_MAX - ageActuel) * 12);
    return {
      revenu: revenuMensuel, quotite: quotite, charges: charges, mensualiteMax: mensualiteMax,
      tauxEndettementActuel: revenuMensuel > 0 ? charges / revenuMensuel : 0,
      credits: CREDITS_TYPES.map(function (t0) {
        var tx = tauxDe(taux, t0.cle), t = tx >= 0 ? { cle: t0.cle, libelle: t0.libelle, court: t0.court, dureeMois: t0.dureeMois, tauxPct: tx } : t0;
        var n = Math.min(t.dureeMois, moisMaxAge);
        return {
          cle: t.cle, libelle: t.libelle, court: t.court, tauxPct: t.tauxPct, dureeMois: n, dureeLimitee: n < t.dureeMois,
          mensualite: n > 0 ? mensualiteMax : 0,
          capital: capitalPourMensualite(mensualiteMax, t.tauxPct, n)
        };
      })
    };
  }

  /* Versements de l'année (mensuels et libres) : ce sont eux qui ouvrent la déduction fiscale. */
  /* Un contrat dont le premier versement est à venir (ajouté depuis un scénario « Et si… ») ne compte qu'à partir de sa date. */
  function contratCommence(c, maintenant) { var m = maintenant || new Date(); return c.anneeDebut * 12 + c.moisDebut - 1 <= m.getFullYear() * 12 + m.getMonth(); }
  function versementsExistants(p) {
    var av = 0, cea = 0;
    p.contrats.forEach(function (c) { if (!contratCommence(c)) return; var an = c.versementMensuel * 12 + c.versementsLibresAn; if (c.type === "cea") cea += an; else av += an; });
    return { av: av, cea: cea };
  }

  /* Rendement net de frais retenu pour estimer le capital d'un contrat dont le relevé n'est pas saisi. */
  var RENDEMENT_ESTIME = 5;
  var DUREE_FISCALE = { av: 8, cea: 5 };

  /* Contrat en cours : mois écoulés, total versé, capital (saisi ou estimé) et date des 8 ans. */
  function estimationContrat(c, maintenant) {
    var m = maintenant || new Date();
    var mois = Math.max(0, (m.getFullYear() - c.anneeDebut) * 12 + (m.getMonth() + 1 - c.moisDebut) + 1);
    var i = RENDEMENT_ESTIME / 100 / 12;
    var programme = c.versementMensuel * (i === 0 ? mois : (Math.pow(1 + i, mois) - 1) / i);
    /* Versements libres : supposés faits, en moyenne, au milieu de la période. */
    var libres = c.versementsLibres * Math.pow(1 + i, mois / 2);
    var verse = c.versementMensuel * mois + c.versementsLibres;
    var estime = programme + libres;
    var duree = DUREE_FISCALE[c.type] || 8;
    var finMois = c.moisDebut - 1 + duree * 12;
    return {
      libelle: c.libelle, type: c.type, mois: mois, verse: verse, capitalEstime: estime,
      capital: c.capitalActuel > 0 ? c.capitalActuel : estime, estime: !(c.capitalActuel > 0),
      gainsEstimes: Math.max(0, estime - verse),
      dureeFiscale: duree, dureeAtteinte: mois >= duree * 12,
      dateDureeFiscale: MOIS[finMois % 12] + " " + (c.anneeDebut + Math.floor(finMois / 12))
    };
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
    /* Base de calcul de la banque de l'utilisateur (net ou brut) et sa quotité. */
    var b = p.baseBanque, q = b === "brut" ? p.quotiteBrut : p.quotiteNet;
    var cap = sy.capacite[b], endet = cap.tauxEndettementActuel;
    var nomBanque = p.banque ? p.banque : "votre banque";
    var taux = analyseTaux(p);
    function ent(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"); }
    function pct(x) { return String(Math.round(x * 10) / 10).replace(".", ","); }
    function liste_(noms) { return noms.length > 1 ? noms.slice(0, -1).join(", ") + " et " + noms[noms.length - 1] : noms[0]; }
    function court(x) { return x.toLowerCase().replace(/^crédit /, ""); }
    if (sy.budget.alerte === "deficit") ajouter(3, "budget", "Budget dépassé", "Vos dépenses fixes dépassent votre net. Commencez par revoir les charges" + (taux.hauts.length ? " ou renégocier un crédit." : "."));
    if (endet > q) {
      var txt;
      if (b === "brut") {
        txt = "Vos crédits en cours (" + ent(sy.chargesCredits) + " DT par mois) représentent " + ent(endet * 100) + " % de votre " + (p.revenuBanque === "annuel" && p.nombreSalaires > 12 ? "revenu brut mensuel (vos " + p.nombreSalaires + " salaires et primes de l'année ÷ 12 = " + ent(cap.revenu) + " DT)" : "salaire brut") + ". " + nomBanque.charAt(0).toUpperCase() + nomBanque.slice(1) + " prête jusqu'à " + ent(q * 100) + " % du brut, soit " + ent(cap.revenu * q) + " DT par mois : un nouveau crédit n'est pas possible pour l'instant.";
      } else {
        txt = "Vos crédits en cours (" + ent(sy.chargesCredits) + " DT par mois) absorbent " + ent(endet * 100) + " % de votre salaire net mensuel" +
          (p.revenuBanque === "annuel" && p.nombreSalaires > 12 ? " (vos " + p.nombreSalaires + " salaires et primes de l'année ÷ 12)" : "");
        txt += " : " + (p.banque ? p.banque + " refusera" : "la plupart des banques refuseront") + " un nouveau crédit pour l'instant.";
      }
      if (taux.hauts.length) txt += " Renégocier " + liste_(taux.hauts.map(function (c) { return "le " + c.libelle.toLowerCase(); })) + " peut libérer de la marge.";
      ajouter(3, "credit", "Endettement au-dessus de " + ent(q * 100) + " % du " + b, txt);
    }
    /* Calendrier de la marge : chaque fin de crédit libère une mensualité. */
    var paliers = cap.paliers || [];
    if (endet > q && paliers.length) {
      var p0 = paliers[0];
      var ans = Math.floor(p0.mois / 12), mm = p0.mois % 12;
      var duree = (ans ? ans + " an" + (ans > 1 ? "s" : "") : "") + (ans && mm ? " et " : "") + (mm ? mm + " mois" : "");
      var t2 = "En " + p0.date + ", à la fin " + (p0.credits.length > 1 ? "des crédits " : "du crédit ") + liste_(p0.credits.map(court)) + ", vous pourrez emprunter avec une mensualité d'environ " + ent(p0.mensualiteMax) + " DT (jusqu'à " + ent(p0.capitalImmo) + " DT en immobilier sur 20 ans).";
      paliers.slice(1, 3).forEach(function (x) {
        t2 += " En " + x.date + ", après " + (x.credits.length > 1 ? "les crédits " : "le crédit ") + liste_(x.credits.map(court)) + " : " + ent(x.mensualiteMax) + " DT par mois, soit environ " + ent(x.capitalImmo) + " DT.";
      });
      ajouter(2, "credit", "Votre marge revient dans " + duree, t2 + " Calcul sur le " + b + ", comme " + nomBanque + ".");
    }
    if (taux.bas.length) ajouter(2, "credit", "Des taux à garder", "Vos taux (" + liste_(taux.bas.map(function (c) { return pct(c.tauxPct) + " %"; }).filter(function (x, i, a) { return a.indexOf(x) === i; })) + ") sont bien inférieurs à ceux du marché (environ " + pct(taux.bas[0].marchePct) + " %) : inutile de renégocier, et ne remboursez pas ces crédits par anticipation. Votre épargne rapporte davantage ailleurs.");
    /* Marge disponible dès aujourd'hui, puis ses étapes à chaque fin de crédit. */
    if (endet <= q && cap.mensualiteMax >= 1) {
      var immo = cap.credits.filter(function (c) { return c.cle === "immo"; })[0];
      var t3 = (p.credits.length ? "Vos crédits représentent " + ent(endet * 100) + " % de votre revenu " + b + " retenu par " + nomBanque + " (" + ent(cap.revenu) + " DT par mois" + (p.revenuBanque === "annuel" && p.nombreSalaires > 12 ? ", salaires et primes de l'année ÷ 12" : "") + "). " : "") +
        "Vous pouvez emprunter dès aujourd'hui avec une mensualité d'environ " + ent(cap.mensualiteMax) + " DT" + (immo ? ", soit jusqu'à " + ent(immo.capital) + " DT en immobilier sur 20 ans" : "") + ".";
      paliers.slice(0, 2).forEach(function (x) {
        t3 += " En " + x.date + ", après " + (x.credits.length > 1 ? "les crédits " : "le crédit ") + liste_(x.credits.map(court)) + " : " + ent(x.mensualiteMax) + " DT par mois, soit environ " + ent(x.capitalImmo) + " DT.";
      });
      ajouter(2, "credit", "Votre capacité d'emprunt aujourd'hui", t3);
    }
    /* Autre base de calcul : une banque concurrente prêterait-elle davantage ? */
    var autreB = b === "net" ? "brut" : "net", capA = sy.capacite[autreB];
    if (capA.mensualiteMax - cap.mensualiteMax > 1) ajouter(2, "credit", "Comparez les banques", "Une banque qui calcule sur le " + autreB + " vous prêterait davantage : la mensualité possible passe de " + ent(cap.mensualiteMax) + " à " + ent(capA.mensualiteMax) + " DT.");
    else if (cap.mensualiteMax < 1 && capA.paliers && capA.paliers.length && paliers.length && capA.paliers[0].mois < paliers[0].mois) ajouter(1, "credit", "Comparez les banques", "Une banque qui calcule sur le " + autreB + " vous prêterait dès " + capA.paliers[0].date + ", plus tôt que " + nomBanque + ".");
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
    sy.contrats.forEach(function (e) {
      if (!(e.mois > 0) || !(e.verse > 0)) return;
      var nom = e.type === "cea" ? "Votre CEA" : "Votre contrat vie" + (e.libelle && e.libelle !== "Contrat" && e.libelle.length > 2 ? " « " + e.libelle + " »" : "");
      var texteC = nom + " : " + ent(e.verse) + " DT versés en " + (e.mois >= 12 ? Math.floor(e.mois / 12) + " an" + (e.mois >= 24 ? "s" : "") + (e.mois % 12 ? " et " + (e.mois % 12) + " mois" : "") : e.mois + " mois") + ", ";
      texteC += e.estime ? "capital estimé à environ " + ent(e.capitalEstime) + " DT (à " + RENDEMENT_ESTIME + " % net par an). Saisissez le montant de votre dernier relevé pour un chiffre exact." : "capital de " + ent(e.capital) + " DT.";
      texteC += e.dureeAtteinte ? " Il a passé " + e.dureeFiscale + " ans : l'avantage fiscal vous est acquis." : " Gardez-le au moins jusqu'en " + e.dateDureeFiscale + " (" + e.dureeFiscale + " ans) pour conserver l'avantage fiscal ; vos versements libres comptent aussi dans la déduction de l'année.";
      ajouter(1, "epargne", e.estime ? "Capital estimé de votre épargne" : "Votre épargne en cours", texteC);
    });
    if (p.epargneDisponible < precaution) ajouter(1, "epargne", "Épargne de précaution", "Visez environ trois mois de net de côté (" + ent(precaution) + " DT) avant d'investir à long terme.");
    sy.projets.forEach(function (pr) {
      if (pr.statut === "hors_portee") ajouter(2, pr.credit ? "credit" : "epargne", pr.libelle, "Ce projet dépasse aujourd'hui votre capacité" + (pr.epargneMensuelle > 0 ? " : il faudrait épargner " + ent(pr.epargneMensuelle) + " DT par mois" : "") + ". Allongez l'horizon, réduisez le montant ou augmentez l'apport.");
      else if (pr.statut === "a_preparer" && pr.epargneMensuelle > 0) ajouter(1, pr.credit ? "credit" : "epargne", pr.libelle, "Mettez de côté " + ent(pr.epargneMensuelle) + " DT par mois pendant " + pr.horizonAns + " an" + (pr.horizonAns > 1 ? "s" : "") + " pour le rendre possible.");
    });
    /* Chaque conseil mène à l'action utile (et non au module en général). */
    var immoAuj = (sy.capacite[b].credits || []).filter(function (c) { return c.cle === "immo"; })[0];
    var versementConseil = (meilleure && meilleure.versementMensuel) || 0;
    var LIENS = [
      [/^Budget dépassé/, "#profil?section=budget", "Revoir mon budget"],
      [/^Endettement/, "#profil?section=credits", "Voir mes crédits"],
      [/^Votre marge revient/, "#orbite?section=marge", "Voir le calendrier de ma marge"],
      [/^Des taux à garder/, "#profil?section=credits", "Voir mes crédits"],
      [/^Votre capacité d'emprunt/, immoAuj ? "#credit?type=immo&capital=" + Math.floor(immoAuj.capital) + "&mois=" + immoAuj.dureeMois + "&taux=" + immoAuj.tauxPct + "&mensualite=" + Math.floor(immoAuj.mensualite * 100) / 100 : "#credit", "Simuler ce crédit"],
      [/^Comparez les banques/, "#profil?section=banque", "Régler la règle de ma banque"],
      [/^Réduisez votre impôt/, "#epargne" + (versementConseil ? "?versement=" + versementConseil : ""), versementConseil ? "Simuler " + versementConseil + " DT par mois" : "Simuler"],
      [/^Avantage fiscal/, "#epargne", "Voir mon épargne"],
      [/^Proche de la tranche/, "#salaire", "Voir mon salaire"],
      [/^Chef de famille/, "#profil?section=identite", "Compléter ma situation"],
      [/^Contrat à durée/, "#profil?section=identite", "Voir mon profil"],
      [/^(Capital estimé|Votre épargne en cours)/, "#profil?section=contrats", "Mettre à jour mon contrat"],
      [/^Épargne de précaution/, "#profil?section=budget", "Indiquer mon épargne"]
    ];
    liste.forEach(function (c) {
      var r = LIENS.filter(function (l) { return l[0].test(c.titre); })[0];
      c.lien = r ? { href: r[1], libelle: r[2] } : c.module === "budget" ? null : { href: "#profil?section=projets", libelle: "Voir mes projets" };
    });
    return liste.sort(function (a, b) { return b.niveau - a.niveau; });
  }

  /* Synthèse complète du profil, recalculée à chaque modification. */
  function synthese(p0, choix0, maintenant) {
    /* Le salaire en vigueur aujourd'hui (historique) sert à tous les calculs. */
    var p = appliquerEcheanciers(appliquerHistorique(normaliser(p0), maintenant).profil, maintenant);
    var ch = choix0 || {};
    var ageActuel = age(p, maintenant);
    var s = salaire(p);
    var charges = chargesCredits(p);
    /* Capacité : revenu de l'année (tous les salaires et primes) ÷ 12, remboursé en 12 échéances par an. */
    var annuel = p.revenuBanque === "annuel";
    var capNet = capacite((annuel ? s.netAnnuel / 12 : s.netMensuel) + p.autresRevenus, p.quotiteNet, charges, ageActuel, tauxNouveaux(p));
    var capBrut = capacite((annuel ? s.brutAnnuel / 12 : s.brutMensuel) + p.autresRevenus, p.quotiteBrut, charges, ageActuel, tauxNouveaux(p));
    var ep = suggestionsEpargne(s, p);
    var epChoisie = ep.propositions.filter(function (x) { return x.cle === (ch.epargne || "equilibree"); })[0] || ep.propositions[0];
    var epargneActuelle = p.contrats.reduce(function (t, c) { return t + (contratCommence(c, maintenant) ? c.versementMensuel : 0); }, 0);
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
    sy.historique = infoHistorique(p, s, sy.maintenant);
    sy.salaireAnnee = salaireAnnee(p, sy.maintenant);
    sy.tauxImmo = tauxImmo(p);
    sy.contrats = p.contrats.map(function (c) { return estimationContrat(c, sy.maintenant); });
    sy.credits = p.credits.map(function (c) {
      var e = echeancier(c, sy.maintenant), mois = e ? e.restantes : c.moisRestants;
      var d = mois > 0 ? new Date(sy.maintenant.getFullYear(), sy.maintenant.getMonth() + mois, 1) : null;
      return { calcule: !!e, payees: e ? e.payees : null, restantes: mois, duree: c.dureeMois || null, fin: e ? e.fin : d ? MOIS[d.getMonth()] + " " + d.getFullYear() : null,
        reduction: c.reductionTaux || null };
    });
    /* L'alerte d'endettement du budget suit la règle de la banque (12 salaires, net ou brut). */
    var capBanque = sy.capacite[p.baseBanque], qBanque = p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet;
    if (sy.budget.alerte !== "deficit") sy.budget.alerte = capBanque.tauxEndettementActuel > qBanque ? "endettement" : null;
    sy.budget.endettementBanque = capBanque.tauxEndettementActuel;
    /* Capacité retrouvée à la fin des crédits qui dépassent la quotité (affichée quand elle est nulle aujourd'hui). */
    /* Hausses de salaire prévues : revenu retenu par la banque à partir de leur mois. */
    function haussesPour(b) {
      return sy.historique ? sy.historique.futurs.map(function (f) {
        return { mois: f.mois, revenu: (b === "net" ? (annuel ? f.netAnnuel / 12 : f.netMensuel) : (annuel ? f.brutAnnuel / 12 : f.brutMensuel)) + p.autresRevenus };
      }) : [];
    }
    ["net", "brut"].forEach(function (b) {
      var c = sy.capacite[b], q = b === "net" ? p.quotiteNet : p.quotiteBrut;
      c.paliers = paliersMarge(p, c.revenu, q, ageActuel, sy.maintenant, haussesPour(b));
      if (c.mensualiteMax >= 1) return;
      var so = sortieEndettement(p, c.revenu, q, haussesPour(b));
      if (!so) return;
      var d = new Date(sy.maintenant.getFullYear(), sy.maintenant.getMonth() + so.mois, 1);
      c.futur = { mois: so.mois, date: MOIS[d.getMonth()] + " " + d.getFullYear(), capacite: capacite(so.revenu || c.revenu, q, so.charges, ageActuel + Math.ceil(so.mois / 12), tauxNouveaux(p)) };
    });
    sy.conseils = conseils(sy);
    return sy;
  }

  return {
    TMM: TMM, CREDITS_TYPES: CREDITS_TYPES, salaireEnVigueur: salaireEnVigueur, salaireDe: salaireDe, lireEmail: lireEmail, lireTelephone: lireTelephone, formatTelephone: formatTelephone, contratCommence: contratCommence, normaliserChangement: normaliserChangement, normaliserScenario: normaliserScenario, MAX_SCENARIOS: MAX_SCENARIOS, MAX_CHANGEMENTS: MAX_CHANGEMENTS, appliquerHistorique: appliquerHistorique, salaireAnnee: salaireAnnee, infoHistorique: infoHistorique, memeSalaire: memeSalaire, cleHausse: cleHausse, REGLE_8: REGLE_8, reductionsTaux: reductionsTaux, evenementEtape: evenementEtape, tauxOrigine: tauxOrigine, QUOTITE: QUOTITE, AGE_MAX: AGE_MAX, PROJETS: PROJETS, MOIS: MOIS, RENDEMENT_ESTIME: RENDEMENT_ESTIME,
    profilParDefaut: profilParDefaut, normaliser: normaliser, age: age, etatSalaire: etatSalaire, entreeBrut: entreeBrut,
    tranche: tranche, salaire: salaire, augmentation: augmentation, calendrierPrimes: calendrierPrimes, impotRestantAnnee: impotRestantAnnee,
    capitalPourMensualite: capitalPourMensualite, mensualitePourCapital: mensualitePourCapital, capacite: capacite,
    epargnePour: epargnePour, suggestionsEpargne: suggestionsEpargne, budget: budget, estimationContrat: estimationContrat, paliersMarge: paliersMarge, tauxImmo: tauxImmo, tauxNouveaux: tauxNouveaux, echeancier: echeancier, analyseTaux: analyseTaux, sortieEndettement: sortieEndettement,
    versementPourCapital: versementPourCapital, projet: projet, conseils: conseils, synthese: synthese
  };
});
