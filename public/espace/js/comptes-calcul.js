/*
 * Orbite — Mes comptes (Mon mois › Comptes ; maquette validée le 16 oct. 2026).
 * Plusieurs comptes (courant ou épargne), chacun avec ses soldes datés : saisis, ou lus dans un relevé importé.
 * Le dernier solde de chaque compte donne l'épargne disponible du profil : les comptes d'épargne en entier, les comptes
 * courants au-delà des dépenses qui restent jusqu'à la prochaine paie. Chaque nouveau solde refait l'analyse :
 * courbe sur 90 jours, point le plus bas, jours à découvert, tendance, mois de dépenses couverts, points forts et faibles.
 * Gardé dans le profil (profil.comptes), donc protégé comme lui (RLS + double authentification exigée par le serveur).
 * Fonctions pures. Node : require('.../comptes-calcul.js') — navigateur : window.ComptesCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.ComptesCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MAX_COMPTES = 8, MAX_SOLDES = 400, FENETRE = 90, JOUR = 864e5;
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function arr(v) { return Math.round(v * 1000) / 1000; }
  function num(v, def) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : def; }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function deux(n) { return (n < 10 ? "0" : "") + n; }
  /* Dates du jour en « AAAA-MM-JJ » (heure locale) : comparables comme du texte. */
  function iso(d) { return d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()); }
  function dateDe(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12); }
  function isoValide(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = dateDe(s); return iso(d) === s && d.getFullYear() >= 2000 && d.getFullYear() <= 2100;
  }
  function decaler(s, jours) { var d = dateDe(s); d.setDate(d.getDate() + jours); return iso(d); }
  function ecart(a, b) { return Math.round((dateDe(b) - dateDe(a)) / JOUR); }
  function libDate(s) { var d = dateDe(s); return (d.getDate() === 1 ? "1er" : d.getDate()) + " " + MOIS[d.getMonth()]; }
  function arrondi50(v) { return Math.max(50, Math.round(v / 50) * 50); }

  /* ---------- Normalisation (profil.comptes) ---------- */
  function normaliserSolde(s) {
    if (!s || !isoValide(s.d)) return null;
    var v = num(s.v, NaN); if (!isFinite(v) || v < -1e7 || v > 1e9) return null;
    return { d: s.d, v: arr(v), src: s.src === "releve" ? "releve" : "saisie" };
  }
  function normaliserCompte(c, i) {
    c = c || {};
    var parDate = {};
    (Array.isArray(c.soldes) ? c.soldes : []).forEach(function (s) { var n = normaliserSolde(s); if (n) parDate[n.d] = n; });
    var soldes = Object.keys(parDate).sort().map(function (d) { return parDate[d]; }).slice(-MAX_SOLDES);
    return { id: texte(c.id, 12).replace(/[^\w-]/g, "") || "c" + (i + 1), nom: texte(c.nom, 30) || "Compte", banque: texte(c.banque, 30),
      type: c.type === "epargne" ? "epargne" : "courant", soldes: soldes };
  }
  function normaliser(liste) {
    var vus = {}, r = [];
    (Array.isArray(liste) ? liste : []).slice(0, MAX_COMPTES).forEach(function (c, i) {
      var n = normaliserCompte(c, i);
      while (vus[n.id]) n.id = n.id.slice(0, 9) + "-" + (i + 1);
      vus[n.id] = true; r.push(n);
    });
    return r;
  }
  function valeursAnalyse(x) {
    x = x || {};
    return { score: Math.round(num(x.score, 0)), mois: Math.round(num(x.mois, 0) * 10) / 10, epargne: Math.round(num(x.epargne, 0)) };
  }
  /* Dernière analyse refaite (après un nouveau solde) : avant / après, gardée pour l'afficher au retour. */
  function normaliserAnalyse(a) {
    if (!a || !isoValide(a.d) || !a.avant || !a.apres) return null;
    return { d: a.d, compte: texte(a.compte, 30), soldeDu: isoValide(a.soldeDu) ? a.soldeDu : a.d, avant: valeursAnalyse(a.avant), apres: valeursAnalyse(a.apres) };
  }
  function nouvelId(liste) { var i = 1, ids = (liste || []).map(function (c) { return c.id; }); while (ids.indexOf("c" + i) !== -1) i++; return "c" + i; }

  /* ---------- Lecture des soldes ---------- */
  function dernier(c) { return c && c.soldes.length ? c.soldes[c.soldes.length - 1] : null; }
  /* Solde d'un compte à une date : le dernier connu ce jour-là ou avant (null s'il n'y en a pas encore). */
  function soldeA(c, d) {
    var v = null;
    for (var i = 0; i < c.soldes.length && c.soldes[i].d <= d; i++) v = c.soldes[i].v;
    return v;
  }
  /* Total à une date. Avant son premier solde, un compte compte pour ce premier solde (rien de mieux n'est connu). */
  function totalA(liste, d) {
    return arr(liste.reduce(function (t, c) {
      if (!c.soldes.length) return t;
      var v = soldeA(c, d); return t + (v == null ? c.soldes[0].v : v);
    }, 0));
  }
  function ajouterSoldes(liste, id, soldes) {
    var l = normaliser(liste), c = l.filter(function (x) { return x.id === id; })[0];
    if (!c) return l;
    c.soldes = c.soldes.concat(soldes || []);
    return normaliser(l);
  }
  function retirerSolde(liste, id, d) {
    var l = normaliser(liste);
    l.forEach(function (c) { if (c.id === id) c.soldes = c.soldes.filter(function (s) { return s.d !== d; }); });
    return l;
  }
  /* Courbe du total, jour par jour, sur la fenêtre (90 jours) : depuis le premier solde connu au plus tôt. */
  function serie(liste, maintenant, jours) {
    var fin = iso(maintenant || new Date()), avec = liste.filter(function (c) { return c.soldes.length; });
    if (!avec.length) return [];
    var premier = avec.reduce(function (m, c) { return c.soldes[0].d < m ? c.soldes[0].d : m; }, fin);
    var debut = decaler(fin, -(jours || FENETRE)); if (premier > debut) debut = premier;
    var pts = [];
    for (var d = debut; d <= fin; d = decaler(d, 1)) pts.push({ d: d, v: totalA(avec, d) });
    return pts;
  }

  /* ---------- Paie et épargne disponible ---------- */
  function paieApres(d, jourPaie) {
    var x = dateDe(d), j = Math.round(num(jourPaie, 0));
    function paieDe(a, m) { var dernierJ = new Date(a, m + 1, 0).getDate(); return new Date(a, m, j >= 1 ? Math.min(j, dernierJ) : dernierJ, 12); }
    var p = paieDe(x.getFullYear(), x.getMonth());
    if (iso(p) < d) p = paieDe(x.getFullYear(), x.getMonth() + 1);
    return iso(p);
  }
  /* Jours à tenir jusqu'à la prochaine paie (au moins 1). */
  function joursAvantPaie(d, jourPaie) { return Math.max(1, ecart(d, paieApres(d, jourPaie))); }
  /**
   * Épargne disponible d'après les derniers soldes : comptes d'épargne en entier ; comptes courants au-delà du « coussin »,
   * les dépenses qui restent jusqu'à la paie (dépenses du mois × jours restants ÷ 30). Un découvert est déduit.
   * o = { depensesMois, jourPaie, maintenant }
   */
  function epargneDisponible(liste, o) {
    o = o || {};
    var d = iso(o.maintenant || new Date()), epargne = 0, courant = 0, n = 0;
    liste.forEach(function (c) { var s = dernier(c); if (!s) return; n++; if (c.type === "epargne") epargne += s.v; else courant += s.v; });
    var coussin = arr(Math.max(0, num(o.depensesMois, 0)) * Math.min(1, joursAvantPaie(d, o.jourPaie) / 30));
    var libre = courant < 0 ? epargne + courant : epargne + Math.max(0, courant - coussin);
    return { n: n, epargne: arr(epargne), courant: arr(courant), coussin: coussin, libre: arr(Math.max(0, libre)), total: arr(epargne + courant) };
  }

  /* ---------- Analyse ---------- */
  /**
   * o = { depensesMois, jourPaie, maintenant, cibleReserve (DT), moisReserve (3 par défaut) }
   * → { aucun, total, maj, serie, couverture, tendance30, tendance90, pointBas, joursDecouvert, dispo, moisCouverts, anciens, points }
   */
  function analyser(liste, o) {
    o = o || {};
    var l = normaliser(liste), m = o.maintenant || new Date(), auj = iso(m), dep = Math.max(0, num(o.depensesMois, 0));
    var avec = l.filter(function (c) { return c.soldes.length; });
    if (!avec.length) return { aucun: true, comptes: l, points: [] };
    var pts = serie(avec, m, FENETRE), total = pts.length ? pts[pts.length - 1].v : totalA(avec, auj);
    var couverture = pts.length ? ecart(pts[0].d, auj) : 0;
    var maj = avec.reduce(function (x, c) { var d = dernier(c).d; return d > x ? d : x; }, "");
    var valA = function (d) { var p = pts.filter(function (x) { return x.d === d; })[0]; return p ? p.v : null; };
    var tendance30 = couverture >= 30 ? arr(total - valA(decaler(auj, -30))) : null;
    var tendance90 = couverture >= 60 ? arr(total - pts[0].v) : null;
    /* Point bas et découvert : sur les comptes courants seulement (l'argent des comptes d'épargne n'est pas dépensé). */
    var courants = avec.filter(function (c) { return c.type === "courant"; }), ptsC = serie(courants, m, FENETRE);
    var couvC = ptsC.length ? ecart(ptsC[0].d, auj) : 0;
    var bas = ptsC.reduce(function (b, p) { return !b || p.v < b.v ? p : b; }, null);
    var pointBas = bas && couvC >= 20 ? { d: bas.d, v: bas.v, joursAvantPaie: ecart(bas.d, paieApres(bas.d, o.jourPaie)) } : null;
    var joursDecouvert = ptsC.filter(function (p) { return p.v < 0; }).length;
    var dispo = epargneDisponible(avec, { depensesMois: dep, jourPaie: o.jourPaie, maintenant: m });
    var moisCouverts = dep > 0 ? Math.round(dispo.libre / dep * 10) / 10 : null;
    var anciens = avec.filter(function (c) { return ecart(dernier(c).d, auj) > 35; }).map(function (c) { return { nom: c.nom, jours: ecart(dernier(c).d, auj) }; });
    var moisCible = num(o.moisReserve, 3) || 3, cible = num(o.cibleReserve, dep * moisCible);

    var forts = [], faibles = [];
    function dt(v) { return String(Math.round(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " DT"; }
    function signe(v) { return (v >= 0 ? "+" : "−") + dt(v); }
    /* Découvert */
    if (joursDecouvert > 0) faibles.push({ cle: "decouvert", titre: "À découvert " + joursDecouvert + (joursDecouvert > 1 ? " jours" : " jour") + " sur " + ptsC.length,
      texte: "Le plus bas : " + (bas.v < 0 ? "−" : "") + dt(bas.v) + " le " + libDate(bas.d) + ". Chaque jour à découvert coûte des agios : gardez une avance sur le compte courant." });
    else if (courants.length && couvC >= 30) forts.push({ cle: "decouvert", titre: "Jamais à découvert depuis " + couvC + " jours", texte: "Votre solde n'est jamais passé sous zéro." });
    /* Tendance : la hausse se lit sur 30 jours (et 90 si connu) ; la baisse seulement si elle dure (30 et 90 jours).
       Un écart de moins de 50 DT (ou 5 % des dépenses du mois) n'est pas une tendance. */
    var seuilT = Math.max(50, dep * 0.05);
    if (tendance30 != null && tendance30 > seuilT && (tendance90 == null || tendance90 > 0))
      forts.push({ cle: "tendance", titre: tendance90 != null ? "En hausse depuis " + Math.round(couverture / 30) + " mois" : "En hausse ce mois-ci", texte: signe(tendance30) + " en 30 jours" + (tendance90 != null ? ", " + signe(tendance90) + " en " + couverture + " jours." : ".") });
    else if (tendance30 != null && tendance30 < -seuilT && tendance90 != null && tendance90 < -seuilT)
      faibles.push({ cle: "tendance", titre: "En baisse depuis " + Math.round(couverture / 30) + " mois", texte: signe(tendance30) + " en 30 jours, " + signe(tendance90) + " en " + couverture + " jours : vos sorties dépassent vos rentrées." });
    /* Fin de mois */
    if (pointBas && pointBas.v >= 0 && dep > 0) {
      var seuil = arrondi50(Math.max(150, dep * 0.2)), avant = pointBas.joursAvantPaie;
      if (pointBas.v < seuil) faibles.push({ cle: "fin_mois", titre: "Fin de mois tendue",
        texte: dt(pointBas.v) + " le " + libDate(pointBas.d) + (avant > 0 && avant <= 10 ? ", " + avant + (avant > 1 ? " jours" : " jour") + " avant la paie" : "") + ". Gardez " + dt(seuil) + " d'avance sur le compte courant." });
      else if (couvC >= 30 && pointBas.v >= seuil * 2) forts.push({ cle: "fin_mois", titre: "Fins de mois sereines", texte: "Jamais sous " + dt(pointBas.v) + ", même juste avant la paie." });
    }
    /* Réserve de sécurité */
    if (moisCouverts != null && cible > 0) {
      if (dispo.libre >= cible) forts.push({ cle: "reserve", titre: "Réserve de sécurité complète", texte: String(moisCouverts).replace(".", ",") + " mois de dépenses de côté (objectif : " + dt(cible) + ")." });
      else faibles.push({ cle: "reserve", titre: "Réserve encore incomplète", texte: String(moisCouverts).replace(".", ",") + " mois de dépenses de côté : il manque " + dt(cible - dispo.libre) + " pour atteindre " + dt(cible) + ".", lien: { href: "#progression?onglet=objectifs&reserve=1", lib: "Voir ma réserve" } });
    }
    /* Argent qui dort sur le compte courant */
    var surplus = dispo.courant - dispo.coussin;
    if (dep > 0 && surplus > Math.max(500, dep * 2)) faibles.push({ cle: "dort", titre: "De l'argent qui dort",
      texte: dt(surplus) + " restent sur le compte courant au-delà de vos dépenses jusqu'à la paie : sur un compte d'épargne ou une assurance vie, ils rapporteraient.", lien: { href: "#epargne", lib: "Simuler une épargne" } });
    /* Soldes anciens */
    if (anciens.length) faibles.push({ cle: "anciens", titre: "Soldes à mettre à jour",
      texte: anciens.map(function (a) { return a.nom + " : " + a.jours + " jours"; }).join(", ") + ". L'analyse se base sur ces chiffres anciens." });

    var points = forts.map(function (p) { p.ton = "fort"; return p; }).concat(faibles.map(function (p) { p.ton = "faible"; return p; }));
    return { aucun: false, comptes: l, total: total, maj: maj, serie: pts, couverture: couverture, tendance30: tendance30, tendance90: tendance90,
      serieCourant: ptsC, pointBas: pointBas, joursDecouvert: joursDecouvert, dispo: dispo, moisCouverts: moisCouverts, anciens: anciens, points: points };
  }

  return { MAX_COMPTES: MAX_COMPTES, MAX_SOLDES: MAX_SOLDES, FENETRE: FENETRE, iso: iso, isoValide: isoValide, decaler: decaler, libDate: libDate,
    normaliser: normaliser, normaliserAnalyse: normaliserAnalyse, nouvelId: nouvelId, dernier: dernier, soldeA: soldeA, totalA: totalA,
    ajouterSoldes: ajouterSoldes, retirerSolde: retirerSolde, serie: serie, paieApres: paieApres, joursAvantPaie: joursAvantPaie,
    epargneDisponible: epargneDisponible, analyser: analyser };
});
