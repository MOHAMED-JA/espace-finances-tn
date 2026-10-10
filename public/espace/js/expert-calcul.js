/*
 * Orbite — mode Expert (pur, sans navigateur, testé sous Node) : tableau d'amortissement d'un crédit du profil
 * (réductions de taux de la règle des 8 % comprises), paie de l'année mois par mois, voyage de Mon orbite,
 * texte CSV (point-virgule, virgule décimale : lisible par Excel en français) et feuilles du classeur « Tout exporter ».
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-calcul.js"), require("./scenarios-calcul.js"));
  else racine.ExpertCalcul = fabrique(racine.OrbiteCalcul, racine.Scenarios);
})(typeof self !== "undefined" ? self : this, function (OC, SC) {
  "use strict";
  var MOIS = OC.MOIS;
  function maj(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function arr3(v) { return Math.round(v * 1000) / 1000; }
  function dateTexte(m, t) { var k = m.getMonth() + t; return MOIS[((k % 12) + 12) % 12] + " " + (m.getFullYear() + Math.floor(k / 12)); }

  /* Tableau d'amortissement du crédit i du profil, à partir de la prochaine échéance. null si le taux ou la durée manquent. */
  function amortissement(sy, i) {
    var c = sy.profil.credits[i], info = sy.credits[i], m = sy.maintenant || new Date();
    if (!c || !info || !(c.mensualite > 0) || !(info.restantes > 0)) return null;
    var n = info.restantes, mens = c.mensualite, tx = c.tauxPct;
    var rt = info.reduction || c.reductionTaux, reds = rt && rt.applicable ? rt.reductions.filter(function (r) { return r.t <= n; }) : [];
    var K = OC.capitalPourMensualite(mens, tx, n), depart = K, lignes = [], totM = 0, totI = 0;
    for (var t = 1; t <= n; t++) {
      var red = null;
      reds.forEach(function (r) { if (r.t === t) red = r; });
      if (red) { mens = red.mensualite; tx = red.tauxPct; }
      var it = K * tx / 1200, cap = Math.min(K, mens - it);
      K = Math.max(0, K - cap);
      if (t === n) K = 0;
      totM += mens; totI += it;
      lignes.push({ n: info.calcule ? info.payees + t : t, t: t, date: dateTexte(m, t), tauxPct: tx, mensualite: mens, interets: it, capital: cap, restant: K, reduction: !!red });
    }
    return { libelle: c.libelle, capitalRestant: depart, restantes: n, duree: info.duree, calcule: info.calcule, lignes: lignes, totalMensualites: totM, totalInterets: totI };
  }

  /* Paie de l'année civile mois par mois : salaire alors en vigueur (historique), salaires en plus selon le calendrier des primes. */
  function paieAnnee(sy) {
    var p = sy.profil, m = sy.maintenant || new Date(), Y = m.getFullYear(), cal = OC.calendrierPrimes(p), cache = {}, lignes = [];
    var tot = { salaires: 0, brut: 0, impot: 0, net: 0 };
    for (var k = 0; k < 12; k++) {
      var h = OC.salaireEnVigueur(p, Y, k) || p, cle = h.montant + "|" + h.sens + "|" + h.periode;
      var S = cache[cle] || (cache[cle] = OC.salaireDe(p, h)), V = S.versements;
      var l = { mois: k, libelle: maj(MOIS[k]), salaires: 1 + cal[k], brut: S.brutMensuel + cal[k] * V.brutSupplementaire,
        impot: S.impotMois + cal[k] * S.impotParVersement, net: S.netMensuel + cal[k] * V.netSupplementaire, primes: cal[k] > 0 };
      tot.salaires += l.salaires; tot.brut += l.brut; tot.impot += l.impot; tot.net += l.net;
      lignes.push(l);
    }
    return { annee: Y, lignes: lignes, total: tot, varie: Object.keys(cache).length > 1 };
  }

  /* ---------- CSV ---------- */
  function cellule(v) {
    if (typeof v === "number") return isFinite(v) ? String(arr3(v)).replace(".", ",") : "";
    var s = v == null ? "" : String(v);
    /* Pas de formule déclenchée à l'ouverture (=, +, -, @ en tête). */
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(lignes) { return "﻿" + lignes.map(function (l) { return l.map(cellule).join(";"); }).join("\r\n") + "\r\n"; }

  function tableAmortissement(a) {
    return [["Échéance", "Date", "Taux (%)", "Mensualité (DT)", "Intérêts (DT)", "Capital remboursé (DT)", "Restant dû (DT)"]].concat(a.lignes.map(function (l) {
      return [l.n, l.date, l.tauxPct, l.mensualite, l.interets, l.capital, l.restant];
    }));
  }
  function tablePaie(pa) {
    return [["Mois", "Salaires", "Brut (DT)", "Impôt retenu (DT)", "Net à payer (DT)"]].concat(pa.lignes.map(function (l) {
      return [l.libelle, l.salaires, l.brut, l.impot, l.net];
    })).concat([["Année " + pa.annee, pa.total.salaires, pa.total.brut, pa.total.impot, pa.total.net]]);
  }
  function tableVoyage(r) {
    return [["Mois", "Net par mois (DT)", "Crédits (DT)", "Endettement (%)", "Marge de crédit (DT)", "Épargne accumulée (DT)", "Reste par mois (DT)"]].concat(r.mois.map(function (x) {
      return [maj(x.date), x.netMensuel, x.charges, Math.round(x.endettement * 1000) / 10, x.marge, x.capitalEpargne, x.reste];
    }));
  }
  /* Séries mois par mois de la référence et de chaque scénario, côte à côte. */
  function tableScenarios(comp, noms) {
    var tous = [comp.reference].concat(comp.scenarios), entete = ["Mois"];
    tous.forEach(function (r, k) { var n = k ? noms[k - 1] : "Aujourd'hui"; entete.push(n + " : reste (DT)", n + " : marge (DT)", n + " : épargne (DT)"); });
    var lignes = [entete];
    for (var t = 0; t < comp.reference.mois.length; t++) {
      var l = [maj(comp.reference.mois[t].date)];
      tous.forEach(function (r) { var x = r.mois[t]; l.push(x.reste, x.marge, x.capitalEpargne); });
      lignes.push(l);
    }
    return lignes;
  }

  /* ---------- Classeur « Tout exporter » (format de moteurs/vie/xlsx.js) ---------- */
  function styler(table, styles) {
    return table.map(function (l, r) {
      return l.map(function (v, k) { return r === 0 ? { v: v, s: "gras" } : typeof v === "number" && styles[k] ? { v: arr3(v), s: styles[k] } : v; });
    });
  }
  function classeur(sy, comp, noms) {
    var p = sy.profil, s = sy.salaire, m = sy.maintenant || new Date(), base = p.baseBanque, cap = sy.capacite[base];
    var date = m.getDate() + " " + MOIS[m.getMonth()] + " " + m.getFullYear();
    var feuilles = [];
    var profil = [[{ v: "Orbite : votre situation au " + date, s: "titre" }], [],
      [{ v: "Salaire", s: "gras" }, { v: arr3(p.montant), s: "tnd" }, p.sens + (p.periode === "annuel" ? " par an" : " par mois")],
      ["Net par mois", { v: arr3(s.netMensuel), s: "tnd" }], ["Brut par mois", { v: arr3(s.brutMensuel), s: "tnd" }],
      ["Net de l'année", { v: arr3(s.netAnnuel), s: "tnd" }], ["Salaires par an", p.nombreSalaires],
      ["Tranche d'impôt", { v: s.tranche.taux, s: "pct" }], [],
      [{ v: "Famille", s: "gras" }], ["Situation", p.situation], ["Chef de famille", p.chefDeFamille ? "oui" : "non"], ["Enfants à charge", p.enfants], [],
      [{ v: "Crédits", s: "gras" }]];
    p.credits.forEach(function (c, i) { profil.push([c.libelle, { v: arr3(c.mensualite), s: "tnd" }, (sy.credits[i] && sy.credits[i].restantes ? sy.credits[i].restantes + " échéances restantes" : ""), c.tauxPct ? c.tauxPct + " %" : ""]); });
    profil.push(["Total des mensualités", { v: arr3(sy.chargesCredits), s: "tndGras" }], ["Marge de crédit (règle de la banque, " + base + ")", { v: arr3(cap.mensualiteMax), s: "tnd" }], [],
      [{ v: "Budget", s: "gras" }], ["Loyer", { v: arr3(p.loyer), s: "tnd" }], ["Charges fixes", { v: arr3(p.chargesFixes), s: "tnd" }], ["Épargne disponible", { v: arr3(p.epargneDisponible), s: "tnd" }]);
    feuilles.push({ nom: "Profil", lignes: profil, largeurs: [42, 18, 26, 10] });
    var pa = paieAnnee(sy);
    feuilles.push({ nom: "Paie " + pa.annee, lignes: styler(tablePaie(pa), { 2: "tnd", 3: "tnd", 4: "tnd" }), largeurs: [16, 10, 16, 18, 18], figer: 1 });
    p.credits.forEach(function (c, i) {
      var a = amortissement(sy, i);
      if (a) feuilles.push({ nom: (i + 1) + ". " + c.libelle, lignes: styler(tableAmortissement(a), { 3: "tnd", 4: "tnd", 5: "tnd", 6: "tnd" }), largeurs: [10, 18, 10, 16, 16, 20, 18], figer: 1 });
    });
    if (p.contrats.length) {
      var ct = [["Contrat", "Début", "Versement mensuel (DT)", "Total versé (DT)", "Capital (DT)", "Avantage fiscal acquis"]];
      p.contrats.forEach(function (c, i) {
        var e = sy.contrats[i];
        ct.push([c.libelle && c.libelle !== "Contrat" ? c.libelle : c.type === "cea" ? "CEA" : "Assurance vie", MOIS[c.moisDebut - 1] + " " + c.anneeDebut, c.versementMensuel, e.verse, e.capital, (e.dureeAtteinte ? "depuis " : "en ") + e.dateDureeFiscale]);
      });
      feuilles.push({ nom: "Contrats", lignes: styler(ct, { 2: "tnd", 3: "tnd", 4: "tnd" }), largeurs: [24, 16, 20, 16, 16, 24], figer: 1 });
    }
    if (comp) {
      feuilles.push({ nom: "Mon orbite", lignes: styler(tableVoyage(comp.reference), { 1: "tnd", 2: "tnd", 4: "tnd", 5: "tnd", 6: "tnd" }), largeurs: [18, 16, 14, 14, 18, 18, 18], figer: 1 });
      var im = [["Année", "Impôt retenu (DT)", "Avantage assurance vie / CEA (DT)", "Impôt net (DT)"]].concat(comp.reference.annees.map(function (a) { return [a.annee, a.impotRetenu, a.avantageFiscal, a.impotNet]; }));
      feuilles.push({ nom: "Impôt", lignes: styler(im, { 1: "tnd", 2: "tnd", 3: "tnd" }), largeurs: [10, 18, 30, 16], figer: 1 });
      if (comp.scenarios.length) {
        var st = {}; for (var k = 1; k <= 3 * (comp.scenarios.length + 1); k++) st[k] = "tnd";
        feuilles.push({ nom: "Scénarios", lignes: styler(tableScenarios(comp, noms), st), largeurs: [18].concat(Array(3 * (comp.scenarios.length + 1)).fill(18)), figer: 1 });
        var bl = [["Scénario", "Changements", "Reste pour vivre sur 10 ans (DT)", "Épargne dans 10 ans (DT)", "Impôt sur la période (DT)", "Intérêts des nouveaux crédits (DT)"]];
        [comp.reference].concat(comp.scenarios).forEach(function (r, k) {
          bl.push([k ? noms[k - 1] : "Aujourd'hui", r.changements.map(function (c) { return SC.libelleChangement(c, p) + " (" + MOIS[c.mois - 1] + " " + c.annee + ")"; }).join(" ; "),
            r.totaux.reste, r.totaux.capitalEpargne, r.totaux.impotNet, r.totaux.interetsNouveaux]);
        });
        feuilles.push({ nom: "Scénarios, bilan", lignes: styler(bl, { 2: "tnd", 3: "tnd", 4: "tnd", 5: "tnd" }), largeurs: [24, 60, 26, 22, 22, 26], figer: 1 });
      }
    }
    return feuilles;
  }

  return { amortissement: amortissement, paieAnnee: paieAnnee, csv: csv, cellule: cellule, tableAmortissement: tableAmortissement, tablePaie: tablePaie,
    tableVoyage: tableVoyage, tableScenarios: tableScenarios, classeur: classeur };
});
