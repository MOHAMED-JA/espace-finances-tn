/*
 * Orbite — « Ma progression » (lot 3) : carrière et objectifs (module pur, testé sous Node).
 * - Inflation INS (moyennes annuelles validées par l'utilisateur) ; pouvoir d'achat calculé sur le BRUT
 *   (indépendant des changements d'impôt), net affiché au barème actuel.
 * - carriere(p, m) : étapes datées (historique du salaire), hausses comparées à l'inflation de la période, bilan.
 * - projection(p, sy, { hausse, inflation, ans }) : brut, net, pouvoir d'achat, capacité d'emprunt année par année.
 * - etatObjectif(o, versements, sy, p, m), defis(...), badges(...), serie(...) : suivi des objectifs.
 * Objectif : { id, type: "projet" | "precaution" | "credit" | "impot", libelle, cible, echeance ("AAAA-MM-JJ"), credit (index), depart }.
 * Versement : { objectif (id), montant, le ("AAAA-MM-JJ") }.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-calcul.js"));
  else racine.Progression = fabrique(racine.OrbiteCalcul);
})(typeof self !== "undefined" ? self : this, function (OC) {
  "use strict";

  /* Inflation (variation annuelle moyenne des prix à la consommation, en %). */
  var INFLATION = { 2015: 4.4, 2016: 3.6, 2017: 5.3, 2018: 7.3, 2019: 6.7, 2020: 5.6, 2021: 5.7, 2022: 8.3, 2023: 9.3, 2024: 7.0, 2025: 5.3, 2026: 5.6 };
  var PROVISOIRE = { 2026: "5,6 % sur un an en septembre 2026 ; remplacé par la moyenne de l'année en janvier 2027" };
  var SOURCES = "Moyennes annuelles des prix à la consommation : INS (2019, 2022 à 2025), BCT (2021), Banque mondiale d'après l'INS (2015 à 2018, 2020).";
  var ANS = Object.keys(INFLATION).map(Number).sort(function (a, b) { return a - b; });
  var PREMIERE = ANS[0], DERNIERE = ANS[ANS.length - 1];
  var TYPES = ["projet", "precaution", "credit", "impot"];
  var MAX_OBJECTIFS = 12;
  var NOMS_TYPES = { projet: "Projet", precaution: "Épargne de précaution", credit: "Crédit à solder", impot: "Impôt de l'année" };
  var MOIS = OC.MOIS;

  function inflation(annee) {
    if (annee < PREMIERE) return null;
    return INFLATION[annee] != null ? INFLATION[annee] : INFLATION[DERNIERE];
  }
  /* Rapport des niveaux de prix entre deux années (moyennes annuelles) : indice(2019, 2026) = prix 2026 / prix 2019. */
  function indice(de, a) {
    if (a === de) return 1;
    if (a < de) return 1 / indice(a, de);
    var r = 1;
    for (var y = Math.max(de, PREMIERE - 1) + 1; y <= a; y++) r *= 1 + (inflation(y) || 0) / 100;
    return r;
  }
  function pct(v) { return Math.round(v * 1000) / 10; }
  function arrondi(v, pas) { return Math.round(v / (pas || 1)) * (pas || 1); }
  function moisEntre(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); }
  function date(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function libMois(d) { return MOIS[d.getMonth()] + " " + d.getFullYear(); }

  /* ---------- Carrière ---------- */
  function brutDe(p, h, annee) { return OC.salaireDe(Object.assign({}, p, { historiqueSalaire: [] }), h, annee).brutMensuel; }

  function carriere(p, maintenant) {
    var m = maintenant || new Date(), an = m.getFullYear();
    var emb = date(p.dateEmbauche);
    var hist = (p.historiqueSalaire || []).slice();
    if (!hist.length && p.montant > 0) hist.push({ montant: p.montant, sens: p.sens, periode: p.periode, mois: 0, annee: 0 });
    /* Étapes datées : une entrée sans date prend la date d'embauche (sinon elle ne sert que de point de départ inconnu). */
    var etapes = hist.map(function (h) {
      var dt = h.annee > 0 && h.mois > 0 ? new Date(h.annee, h.mois - 1, 1) : emb ? new Date(emb.getFullYear(), emb.getMonth(), 1) : null;
      return dt ? { date: dt, annee: dt.getFullYear(), mois: dt.getMonth() + 1, brut: brutDe(p, h, dt.getFullYear()), net: OC.salaireDe(Object.assign({}, p, { historiqueSalaire: [] }), h, an).netMensuel, h: h } : null;
    }).filter(function (e) { return e && e.date <= m; }).sort(function (a, b) { return a.date - b.date; });
    /* Deux étapes au même mois : la dernière l'emporte. */
    etapes = etapes.filter(function (e, i) { return !etapes[i + 1] || etapes[i + 1].date - e.date !== 0; });
    var res = { etapes: etapes, suffisant: etapes.length >= 1 && etapes[0].annee < an, hausses: [], bilan: null, moyenneHausse: null, avantInflation: !!etapes.length && etapes[0].annee < PREMIERE };
    etapes.forEach(function (e, i) {
      if (!i) return;
      var a = etapes[i - 1], hausse = e.brut / a.brut - 1, prix = indice(a.annee, e.annee) - 1;
      var ecart = (1 + hausse) / (1 + prix) - 1;
      res.hausses.push({ date: e.date, annee: e.annee, mois: e.mois, avant: a.brut, apres: e.brut, hausse: hausse, prix: prix, depuis: a.annee,
        verdict: Math.abs(ecart) < 0.005 ? "egal" : ecart > 0 ? "gagne" : "perdu" });
    });
    if (!etapes.length) return res;
    var premier = etapes[0], dernier = etapes[etapes.length - 1];
    var debut = Math.max(premier.annee, PREMIERE), brutDebut = premier.brut, brutFin = dernier.brut;
    var prix = indice(debut, an) - 1, hausse = brutFin / brutDebut - 1;
    res.bilan = {
      depuis: debut, brutDebut: brutDebut, brutFin: brutFin, hausse: hausse, prix: prix,
      pouvoirAchat: (1 + hausse) / (1 + prix) - 1,
      brutPourGarder: brutDebut * (1 + prix), manque: Math.max(0, brutDebut * (1 + prix) - brutFin),
      provisoire: !!PROVISOIRE[an]
    };
    var mois = moisEntre(premier.date, m);
    if (mois >= 12 && brutFin > brutDebut) res.moyenneHausse = Math.pow(brutFin / brutDebut, 12 / mois) - 1;
    /* Série annuelle pour la courbe : brut en vigueur au 1er juillet de chaque année, et sa valeur en dinars de l'année de départ. */
    res.annuel = [];
    for (var y = premier.annee; y <= an; y++) {
      var cle = new Date(y, 6, 1), courant = premier;
      etapes.forEach(function (e) { if (e.date <= cle) courant = e; });
      res.annuel.push({ annee: y, brut: courant.brut, reel: y >= PREMIERE ? courant.brut / indice(debut, y) : null });
    }
    return res;
  }

  /* ---------- Projection ---------- */
  function projection(p, sy, o) {
    var opt = o || {}, m = sy.maintenant || new Date(), an = m.getFullYear();
    var hausse = opt.hausse != null ? opt.hausse : 0.03, inf = opt.inflation != null ? opt.inflation : 0.055, n = opt.ans || 10;
    var brut0 = sy.salaire.brutMensuel, base = p.baseBanque === "brut" ? "brut" : "net", q = base === "brut" ? p.quotiteBrut : p.quotiteNet;
    var age0 = OC.age(p, m), taux = OC.tauxNouveaux(p), out = [];
    for (var y = 0; y <= n; y++) {
      var brut = brut0 * Math.pow(1 + hausse, y);
      var s = y ? OC.salaire(Object.assign({}, p, { historiqueSalaire: [], montant: brut, sens: "brut", periode: "mensuel" }), an) : sy.salaire;
      /* Crédits encore en cours cette année-là (mensualités qui comptent dans l'endettement). */
      var charges = (sy.credits || []).reduce(function (t, c, i) { return t + (c.restantes > y * 12 ? p.credits[i].mensualite : 0); }, 0);
      var revenu = (base === "brut" ? brut : s.netMensuel) + (p.autresRevenus || 0);
      var cap = OC.capacite(revenu, q, charges, age0 + y, taux), immo = cap.credits.filter(function (c) { return c.cle === "immo"; })[0] || cap.credits[0];
      out.push({ annee: an + y, brut: brut, net: s.netMensuel, pouvoirAchat: Math.pow(1 + hausse, y) / Math.pow(1 + inf, y) - 1, capacite: immo ? immo.capital : 0, mensualiteMax: cap.mensualiteMax });
    }
    return out;
  }

  /* ---------- Objectifs ---------- */
  function normaliserObjectif(o) {
    o = o || {};
    var type = TYPES.indexOf(o.type) !== -1 ? o.type : "projet";
    var cible = Math.max(0, Math.min(1e8, Number(o.cible) || 0)), depart = Math.max(0, Math.min(1e8, Number(o.depart) || 0));
    return {
      id: o.id, type: type, libelle: String(o.libelle || "").replace(/\s+/g, " ").trim().slice(0, 60),
      cible: Math.round(cible * 1000) / 1000, depart: Math.round(depart * 1000) / 1000,
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(o.echeance || "") ? o.echeance : null,
      credit: type === "credit" && o.credit != null && o.credit >= 0 ? Math.floor(o.credit) : null,
      cree_le: o.cree_le || null
    };
  }
  /* Cible suggérée pour l'épargne de précaution : n mois de dépenses fixes (crédits, logement, charges), sinon la moitié du net. */
  function ciblePrecaution(sy, p, n) {
    var fixes = (sy.budget.credits || 0) + (sy.budget.logement || 0) + (p.chargesFixes || 0);
    var mensuel = fixes > 0 ? Math.max(fixes, sy.salaire.netMensuel * 0.5) : sy.salaire.netMensuel * 0.5;
    return arrondi(mensuel * (n || 6), 100);
  }
  function capitalRestantCredit(c, mois) { return OC.capitalPourMensualite(c.mensualite, c.tauxPct, Math.max(0, mois)); }

  function etatObjectif(o0, versements, sy, p, maintenant) {
    var o = normaliserObjectif(o0), m = maintenant || sy.maintenant || new Date();
    var ech = date(o.echeance), moisRestants = ech ? Math.max(0, moisEntre(m, ech)) : null;
    var res = { objectif: o, auto: false, fait: 0, cible: o.cible, pct: 0, reste: 0, mensuelNecessaire: null, rythme: 0, dateAtteinte: null, retardMois: 0, etat: "ok", phrase: "" };
    if (o.type === "credit") {
      var c = p.credits[o.credit], sc = (sy.credits || [])[o.credit];
      res.auto = true;
      if (!c || !sc) { res.etat = "introuvable"; res.phrase = "Ce crédit n'est plus dans votre profil."; return res; }
      var total = (sc.payees || 0) + (sc.restantes || 0), duree = c.dureeMois || total || sc.restantes;
      var initial = capitalRestantCredit(c, duree), restant = capitalRestantCredit(c, sc.restantes);
      res.cible = initial; res.fait = Math.max(0, initial - restant); res.reste = restant;
      res.pct = initial > 0 ? res.fait / initial : 0;
      if (sc.restantes <= 0) { res.etat = "atteint"; res.pct = 1; res.phrase = "Crédit soldé."; return res; }
      res.etat = "auto";
      if (ech && moisRestants < sc.restantes) {
        /* Capital à rembourser par anticipation à la date voulue pour solder le crédit. */
        res.anticipe = capitalRestantCredit(c, sc.restantes - moisRestants);
        res.phrase = "Pour le solder en " + libMois(ech) + " au lieu de " + sc.fin + ", un remboursement anticipé d'environ " + Math.round(res.anticipe).toLocaleString("fr-FR") + " DT à cette date suffit.";
      } else res.phrase = "Fin prévue en " + sc.fin + " : votre objectif est déjà tenu.";
      return res;
    }
    var annee = m.getFullYear(), sesV = (versements || []).filter(function (v) { return v.objectif === o.id; });
    if (o.type === "impot") sesV = sesV.filter(function (v) { return (v.le || "").slice(0, 4) === String(annee); });
    var somme = sesV.reduce(function (t, v) { return t + (Number(v.montant) || 0); }, 0);
    res.fait = (o.type === "impot" ? 0 : o.depart) + somme;
    res.reste = Math.max(0, o.cible - res.fait);
    res.pct = o.cible > 0 ? Math.min(1, res.fait / o.cible) : 0;
    /* Rythme : moyenne mensuelle des versements des 3 derniers mois (ou depuis le premier versement, s'il est plus récent). */
    var il3 = new Date(m.getFullYear(), m.getMonth() - 2, 1), premier = sesV.map(function (v) { return date(v.le); }).filter(Boolean).sort(function (a, b) { return a - b; })[0];
    var nMois = premier ? Math.max(1, Math.min(3, moisEntre(premier, m) + 1)) : 3;
    res.rythme = sesV.filter(function (v) { var d = date(v.le); return d && d >= il3 && d <= m; }).reduce(function (t, v) { return t + v.montant; }, 0) / nMois;
    if (res.reste <= 0 && o.cible > 0) { res.etat = "atteint"; res.phrase = "Objectif atteint. Bravo !"; return res; }
    if (moisRestants != null) res.mensuelNecessaire = res.reste / Math.max(1, moisRestants);
    if (res.rythme > 0) {
      var n = Math.ceil(res.reste / res.rythme);
      res.dateAtteinte = new Date(m.getFullYear(), m.getMonth() + n, 1);
      if (ech) res.retardMois = Math.max(0, moisEntre(ech, res.dateAtteinte));
    }
    if (ech && moisRestants === 0) res.etat = "retard";
    else if (ech && res.rythme > 0) res.etat = res.retardMois >= 1 ? "retard" : moisEntre(res.dateAtteinte, ech) >= 1 ? "avance" : "ok";
    else if (ech && res.rythme === 0 && res.mensuelNecessaire > 0) res.etat = "a-lancer";
    var dt = function (v) { return Math.round(v).toLocaleString("fr-FR") + " DT"; };
    if (res.etat === "retard" && res.dateAtteinte) res.phrase = "Il faut " + dt(res.mensuelNecessaire) + " par mois d'ici " + libMois(ech) + " ; vous mettez " + dt(res.rythme) + ". +" + dt(res.mensuelNecessaire - res.rythme) + " par mois, ou décaler à " + libMois(res.dateAtteinte) + ".";
    else if (res.etat === "retard") res.phrase = "L'échéance est arrivée : encore " + dt(res.reste) + ". Repoussez-la ou terminez l'effort.";
    else if (res.dateAtteinte) res.phrase = "Encore " + dt(res.reste) + " : objectif atteint en " + libMois(res.dateAtteinte) + " à votre rythme actuel.";
    else if (res.mensuelNecessaire) res.phrase = "Mettez " + dt(res.mensuelNecessaire) + " de côté par mois pour l'atteindre en " + libMois(ech) + ".";
    else res.phrase = "Encore " + dt(res.reste) + ".";
    return res;
  }

  /* Mois consécutifs (jusqu'à ce mois-ci ou le précédent) avec au moins un versement. */
  function serie(versements, maintenant) {
    var m = maintenant || new Date(), mois = {};
    (versements || []).forEach(function (v) { var d = date(v.le); if (d && v.montant > 0) mois[d.getFullYear() * 12 + d.getMonth()] = true; });
    var k = m.getFullYear() * 12 + m.getMonth();
    if (!mois[k]) k--;
    var n = 0;
    while (mois[k]) { n++; k--; }
    return n;
  }

  /* Défis du mois (3 au plus), choisis selon le profil ; chacun est vérifiable par Orbite. */
  function defis(sy, p, objectifs, versements, maintenant, fiscal) {
    var m = maintenant || new Date(), cle = m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
    var duMois = (versements || []).filter(function (v) { return (v.le || "").slice(0, 7) === cle; }).reduce(function (t, v) { return t + v.montant; }, 0);
    var epargnes = (objectifs || []).filter(function (o) { return o.type === "projet" || o.type === "precaution"; });
    var liste = [];
    if (!(objectifs || []).length) liste.push({ id: "premier", titre: "Créez votre premier objectif", detail: "Un projet, une épargne de précaution ou un crédit à solder plus tôt.", fait: false });
    if (epargnes.length) {
      var etats = epargnes.map(function (o) { return etatObjectif(o, versements, sy, p, m); }).filter(function (e) { return e.etat !== "atteint"; });
      var besoin = etats.reduce(function (t, e) { return Math.max(t, e.mensuelNecessaire || 0); }, 0);
      var reste = Math.max(0, sy.budget.reste || 0);
      var cible = Math.max(50, Math.min(arrondi(besoin || reste * 0.15, 10), arrondi(Math.max(50, reste * 0.3), 10)));
      if (etats.length) liste.push({ id: "epargne-" + cle, titre: "Mettez " + cible.toLocaleString("fr-FR") + " DT de côté ce mois-ci", detail: "Sur l'un de vos objectifs.", fait: duMois >= cible, progres: Math.min(duMois, cible), cible: cible });
    }
    var moisN = m.getMonth();
    if (moisN >= 9 && fiscal && fiscal.gainPossible > 20) {
      var impot = (objectifs || []).filter(function (o) { return o.type === "impot"; })[0];
      var fait = !!impot && etatObjectif(impot, versements, sy, p, m).fait > 0;
      liste.push({ id: "assurance-vie-" + m.getFullYear(), titre: "Prévoyez votre versement d'assurance vie", detail: "Avant le 31 décembre : jusqu'à " + Math.round(fiscal.gainPossible).toLocaleString("fr-FR") + " DT d'impôt en moins.", fait: fait });
    }
    if (!(objectifs || []).some(function (o) { return o.type === "precaution"; }) && (objectifs || []).length) liste.push({ id: "precaution", titre: "Créez votre épargne de précaution", detail: "3 à 6 mois de dépenses fixes, pour les imprévus.", fait: false });
    var dernier = (p.historiqueSalaire || []).filter(function (x) { return x.annee > 0; }).slice(-1)[0];
    if (!dernier || (m.getFullYear() * 12 + m.getMonth()) - (dernier.annee * 12 + dernier.mois - 1) > 12) liste.push({ id: "salaire", titre: "Vérifiez votre salaire actuel", detail: "Votre dernière hausse enregistrée a plus d'un an : indiquez-la si vous en avez eu une.", fait: false });
    return liste.slice(0, 3);
  }

  function badges(objectifs, versements, sy, p, maintenant) {
    var m = maintenant || new Date(), etats = (objectifs || []).map(function (o) { return etatObjectif(o, versements, sy, p, m); });
    var n = serie(versements, m);
    return [
      { id: "premier", titre: "Premier objectif", gagne: etats.length > 0 },
      { id: "serie3", titre: "3 mois de suite", gagne: n >= 3 },
      { id: "precaution", titre: "Précaution 6 mois", gagne: etats.some(function (e) { return e.objectif.type === "precaution" && e.etat === "atteint"; }) },
      { id: "atteint", titre: "Objectif atteint", gagne: etats.some(function (e) { return e.etat === "atteint" && e.objectif.type !== "credit"; }) },
      { id: "credit", titre: "Crédit soldé", gagne: etats.some(function (e) { return e.objectif.type === "credit" && e.etat === "atteint"; }) }
    ];
  }

  /* Rappels des échéances d'objectifs (un mois avant), textes d'email sans montant. */
  function rappels(objectifs, maintenant) {
    var m = maintenant || new Date(), t = m.getTime(), out = [];
    (objectifs || []).forEach(function (o0) {
      var o = normaliserObjectif(o0), ech = date(o.echeance);
      if (!ech || !o.id || o.type === "credit") return;
      var quand = new Date(ech.getFullYear(), ech.getMonth() - 1, ech.getDate(), 9), fin = new Date(ech.getFullYear(), ech.getMonth(), ech.getDate(), 23, 59);
      if (fin.getTime() < t) return;
      var nom = o.libelle || "votre objectif", idc = String(o.id).replace(/[^a-z0-9_-]/gi, "").slice(0, 36);
      out.push({ id: "objectif-" + idc + "-" + o.echeance, titre: "Objectif « " + nom + " » : échéance dans un mois", corps: "Faites le point dans Ma progression : où en êtes-vous, faut-il ajuster l'effort ou la date ?",
        url: "/espace/#progression?onglet=objectifs", quand: new Date(Math.max(quand.getTime(), t)).toISOString(), jusqua: fin.toISOString(), type: "perso",
        /* Email : nom générique du type (le libellé saisi pourrait contenir un montant). */
        mail: { etiquette: "Objectif · " + libMois(ech), titre: "Échéance dans un mois : votre objectif « " + NOMS_TYPES[o.type] + " »", corps: "Votre objectif arrive à échéance le mois prochain. Faites le point dans Ma progression.", conseil: "Si l'objectif est hors de portée, repousser la date d'un trimestre vaut mieux qu'abandonner.", bouton: "Voir mes objectifs" } });
    });
    return out;
  }

  return {
    INFLATION: INFLATION, PROVISOIRE: PROVISOIRE, SOURCES: SOURCES, TYPES: TYPES, NOMS_TYPES: NOMS_TYPES, MAX_OBJECTIFS: MAX_OBJECTIFS,
    inflation: inflation, indice: indice, carriere: carriere, projection: projection,
    normaliserObjectif: normaliserObjectif, ciblePrecaution: ciblePrecaution, etatObjectif: etatObjectif,
    serie: serie, defis: defis, badges: badges, rappels: rappels, pct: pct
  };
});
