/*
 * Orbite — vue d'ensemble (lot C, maquettes C1 et C2 validées le 16 oct. 2026) :
 *   • Patrimoine 360° : un relevé par mois du patrimoine net (historique réel, jamais inventé), ce qui l'a fait bouger ce mois-ci ;
 *   • Liberté financière : le patrimoine qui rapporte face à 25 ans de dépenses (règle des 4 %), l'année où l'objectif
 *     serait atteint à ce rythme et les trois leviers les plus efficaces, en dinars constants (inflation retirée).
 * Fonctions pures. Node : require('.../ensemble-calcul.js') — navigateur : window.EnsembleCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.EnsembleCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MAX_MOIS = 36;
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  /* Familles du relevé mensuel (clés de DeciderCalcul.patrimoine). */
  var FAMILLES = {
    immobilier: ["logement", "immo-locatif", "autres"], placements: ["taux", "bourse", "or"], epargne: ["epargne", "contrats"], proches: ["proches"]
  };
  /* Où s'ouvre chaque ligne (module d'origine). */
  var LIENS = {
    logement: "#orbite?partie=patrimoine", autres: "#orbite?partie=patrimoine", epargne: "#mois?onglet=comptes", contrats: "#epargne",
    "immo-locatif": "#placements?onglet=immo", taux: "#placements?onglet=depots", bourse: "#placements?onglet=bourse", or: "#placements?onglet=immo",
    proches: "#placements?onglet=proches", "proches-dette": "#placements?onglet=proches"
  };

  function arr(v) { return Math.round(v * 1000) / 1000; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function cleMois(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function libMois(k) { return MOIS[+k.slice(5, 7) - 1] + " " + k.slice(0, 4); }
  function moisAvant(k) { var a = +k.slice(0, 4), m = +k.slice(5, 7) - 1; return cleMois(new Date(a, m - 1, 1)); }
  function lien(cle) { return LIENS[cle] || (/^credit-/.test(cle) ? "#credit" : "#orbite?partie=patrimoine"); }

  /* ===================================================================
     Patrimoine 360°
     =================================================================== */
  /* Relevé du mois : r = DeciderCalcul.patrimoine(sy). */
  function instantane(r, maintenant) {
    var a = {};
    (r.actifs || []).forEach(function (x) { a[x.cle] = arr((a[x.cle] || 0) + x.montant); });
    return { m: cleMois(maintenant || new Date()), net: Math.round(r.net), actifs: Math.round(r.totalActifs), dettes: Math.round(r.totalPassifs), a: a };
  }
  function normaliserHistorique(l) {
    if (!Array.isArray(l)) return [];
    var vus = {};
    l.forEach(function (x) {
      if (!x || !/^\d{4}-\d{2}$/.test(x.m) || !isFinite(num(x.net, NaN))) return;
      var a = {};
      if (x.a && typeof x.a === "object") Object.keys(x.a).slice(0, 30).forEach(function (k) { if (/^[\w-]{1,20}$/.test(k) && isFinite(num(x.a[k], NaN))) a[k] = Math.round(num(x.a[k], 0)); });
      vus[x.m] = { m: x.m, net: Math.round(num(x.net, 0)), actifs: Math.round(num(x.actifs, 0)), dettes: Math.round(num(x.dettes, 0)), a: a };
    });
    return Object.keys(vus).sort().slice(-MAX_MOIS).map(function (k) { return vus[k]; });
  }
  /* Le relevé du mois remplace celui du même mois ; rien n'est ajouté pour les mois passés (pas d'historique inventé). */
  function avecInstantane(histo, inst) {
    var l = normaliserHistorique(histo).filter(function (x) { return x.m !== inst.m; });
    l.push(inst);
    return normaliserHistorique(l);
  }
  function changeA(histo, inst) {
    var h = normaliserHistorique(histo), d = h.filter(function (x) { return x.m === inst.m; })[0];
    return !d || d.net !== inst.net || d.actifs !== inst.actifs || d.dettes !== inst.dettes;
  }
  function somme(a, cles) { return cles.reduce(function (t, k) { return t + num(a[k], 0); }, 0); }
  /**
   * Ce qui a fait bouger le patrimoine ce mois-ci.
   * o = { credits: [{ crd, mensualite, tauxPct, actif }], versementsEpargne (DT par mois) }.
   * Avec le relevé du mois précédent : écarts réels par famille ; sans lui : capital remboursé et épargne versée, estimés.
   */
  function ceMois(histo, inst, o) {
    var x = o || {}, h = normaliserHistorique(histo), prec = h.filter(function (y) { return y.m === moisAvant(inst.m); })[0];
    var capital = (x.credits || []).reduce(function (t, c) {
      if (!c.actif || !(c.crd > 0) || !(c.mensualite > 0)) return t;
      var interets = c.crd * num(c.tauxPct, 0) / 1200;
      return t + Math.max(0, Math.min(c.crd, c.mensualite - interets));
    }, 0);
    var lignes = [];
    if (prec) {
      lignes.push({ cle: "capital", lib: "Dettes en moins (crédits remboursés)", v: Math.round(prec.dettes - inst.dettes) });
      lignes.push({ cle: "epargne", lib: "Comptes et épargne", v: Math.round(somme(inst.a, FAMILLES.epargne) - somme(prec.a, FAMILLES.epargne)) });
      lignes.push({ cle: "placements", lib: "Placements, or et bourse", v: Math.round(somme(inst.a, FAMILLES.placements) - somme(prec.a, FAMILLES.placements)) });
      lignes.push({ cle: "immobilier", lib: "Immobilier", v: Math.round(somme(inst.a, FAMILLES.immobilier) - somme(prec.a, FAMILLES.immobilier)) });
      lignes.push({ cle: "proches", lib: "Prêté aux proches", v: Math.round(somme(inst.a, FAMILLES.proches) - somme(prec.a, FAMILLES.proches)) });
      return { reel: true, depuis: prec.m, variation: inst.net - prec.net, lignes: lignes.filter(function (l) { return l.v !== 0; }) };
    }
    lignes.push({ cle: "capital", lib: "Capital du crédit remboursé", v: Math.round(capital) });
    lignes.push({ cle: "epargne", lib: "Épargne versée", v: Math.round(num(x.versementsEpargne, 0)) });
    lignes = lignes.filter(function (l) { return l.v > 0; });
    return { reel: false, depuis: null, variation: lignes.reduce(function (t, l) { return t + l.v; }, 0), lignes: lignes };
  }
  /* Lignes affichées : actifs puis dettes (négatives), chacune avec le lien vers son module. */
  function lignes360(r) {
    return (r.actifs || []).filter(function (a) { return a.montant > 0; }).map(function (a) { return { cle: a.cle, lib: a.libelle, v: Math.round(a.montant), estime: !!a.estime, lien: lien(a.cle) }; })
      .concat((r.passifs || []).map(function (p) { return { cle: p.cle, lib: p.libelle + (/^credit-/.test(p.cle) ? " (reste dû)" : ""), v: -Math.round(p.montant), estime: !!p.estime, lien: lien(p.cle) }; }));
  }

  /* ===================================================================
     Liberté financière
     =================================================================== */
  /**
   * o = {
   *   patrimoine (net, DT), residence (valeur du logement occupé : ne rapporte rien, retirée), depensesMois (sans crédits ni épargne),
   *   epargneMois (mise de côté chaque mois), rendementReel (% par an, 2 par défaut), tauxRetrait (% par an, 4 par défaut),
   *   anneeNaissance, maintenant
   * }
   * → { cible, actuel, pct, revenusMois, mois (null : pas avant 60 ans), annee, age, leviers }
   */
  function simuler(depart, epargne, r, cible) {
    if (depart >= cible) return 0;
    var p = depart, rm = Math.pow(1 + r / 100, 1 / 12) - 1;
    for (var k = 1; k <= 720; k++) { p = p * (1 + rm) + epargne; if (p >= cible) return k; }
    return null;
  }
  function liberte(o) {
    var x = o || {}, m = x.maintenant || new Date(), r = num(x.rendementReel, 2), tr = num(x.tauxRetrait, 4);
    var dep = Math.max(0, num(x.depensesMois, 0)), ep = Math.max(0, num(x.epargneMois, 0));
    var actuel = Math.max(0, num(x.patrimoine, 0) - Math.max(0, num(x.residence, 0)));
    var cible = tr > 0 ? dep * 12 / (tr / 100) : 0;
    function resultat(depM, epM, rr) {
      var c = tr > 0 ? depM * 12 / (tr / 100) : 0, k = c > 0 ? simuler(actuel, epM, rr, c) : null;
      return { cible: c, mois: k };
    }
    var base = resultat(dep, ep, r);
    function quand(k) {
      if (k == null) return { annee: null, age: null };
      var d = new Date(m.getFullYear(), m.getMonth() + k, 1);
      return { annee: d.getFullYear(), age: x.anneeNaissance > 0 ? d.getFullYear() - x.anneeNaissance : null };
    }
    var q = quand(base.mois);
    function gain(res) { return base.mois == null || res.mois == null ? (res.mois != null && base.mois == null ? Infinity : null) : Math.floor((base.mois - res.mois) / 12); }
    var leviers = [
      { cle: "depenses", titre: "Dépenser 10 % de moins", detail: Math.round(dep * 0.1) + " DT par mois", ans: gain(resultat(dep * 0.9, ep + dep * 0.1, r)) },
      { cle: "rendement", titre: "Gagner 1 % de plus par an", detail: "placements mieux répartis", ans: gain(resultat(dep, ep, r + 1)) },
      { cle: "epargne", titre: "Épargner 200 DT de plus par mois", detail: "en plus de " + Math.round(ep) + " DT", ans: gain(resultat(dep, ep + 200, r)) }
    ].filter(function (l) { return l.ans != null && l.ans !== 0; }).sort(function (a, b) { return b.ans - a.ans; });
    return { cible: Math.round(cible), actuel: Math.round(actuel), pct: cible > 0 ? Math.min(1, actuel / cible) : 0, revenusMois: Math.round(actuel * tr / 100 / 12),
      depensesMois: Math.round(dep), epargneMois: Math.round(ep), rendementReel: r, tauxRetrait: tr, ans: tr > 0 ? Math.round(100 / tr) : 0,
      mois: base.mois, annee: q.annee, age: q.age, atteint: base.mois === 0, leviers: leviers };
  }

  return { MAX_MOIS: MAX_MOIS, FAMILLES: FAMILLES, cleMois: cleMois, libMois: libMois, moisAvant: moisAvant, lien: lien,
    instantane: instantane, normaliserHistorique: normaliserHistorique, avecInstantane: avecInstantane, changeA: changeA, ceMois: ceMois, lignes360: lignes360,
    liberte: liberte, simuler: simuler };
});
