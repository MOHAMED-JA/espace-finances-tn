"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../public/moteurs/credit/credit.js");
const A = require("../../public/moteurs/credit/audit.js");

/* Tableau « de la banque » fabriqué avec le moteur d'Orbite : n° · date · capital dû · amortissement · intérêts · échéance */
const f3 = (v) => v.toFixed(3).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, " ");
function tableau(e, modif) {
  const r = M.echeancier(Object.assign({ periodicite: 1, amort: "constant" }, e));
  let crd = r.C;
  const lignes = r.lignes.map((l, i) => {
    const d = new Date(l.date), x = { n: i + 1, date: String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear(), crd, am: l.principal, int: l.interet, ech: l.paiement };
    crd = Math.round((crd - l.principal) * 1000) / 1000;
    return x;
  });
  if (modif) modif(lignes);
  return "BIAT · Tableau d'amortissement · Durée : " + e.mois + " mois\n" + lignes.map((x) => x.n + "  " + x.date + "  " + f3(x.crd) + "  " + f3(x.am) + "  " + f3(x.int) + "  " + f3(x.ech)).join("\n");
}

test("tableau exact : colonnes reconnues, aucun écart, taux retrouvé, banque et durée lues", () => {
  const tab = A.analyserTableau(tableau({ capital: 120000, mois: 84, taux: 9.25, dateDebut: "2024-01-31" }));
  assert.equal(tab.lignes.length, 84);
  assert.equal(tab.info.banque, "BIAT");
  assert.equal(tab.info.dureeTotale, 84);
  const au = A.auditerTableau(tab, new Date(2026, 9, 12));
  assert.equal(au.anomalies.filter((a) => a.g === "erreur").length, 0, JSON.stringify(au.anomalies.slice(0, 2)));
  assert.equal(au.phases.length >= 1, true);
  assert.equal(au.phases[0].taux, 9.25);
  assert.equal(au.complet, true);
  assert.ok(Math.abs(au.totA - 120000) < 0.01);
});

test("intérêts surfacturés sur une ligne : écart signalé au millime", () => {
  const txt = tableau({ capital: 120000, mois: 84, taux: 9.25, dateDebut: "2024-01-31" }, (L) => { L[10].int += 0.5; L[10].ech += 0.5; });
  const au = A.auditerTableau(A.analyserTableau(txt), new Date(2026, 9, 12));
  const err = au.anomalies.filter((a) => a.g === "erreur");
  assert.equal(err.length, 1);
  assert.match(err[0].txt, /Échéance 11/);
  assert.match(err[0].txt, /écart \+0,500/);
});

test("ligne manquante (page perdue) et chiffre mal lu corrigé par recoupement", () => {
  const txt = tableau({ capital: 60000, mois: 48, taux: 10, dateDebut: "2024-01-31" }, (L) => { L.splice(20, 2); L[30].ech += 9; });
  const au = A.auditerTableau(A.analyserTableau(txt), new Date(2026, 9, 12));
  assert.ok(au.anomalies.some((a) => a.g === "lecture" && /2 échéances absentes/.test(a.txt)), JSON.stringify(au.anomalies));
  assert.ok(au.infos.some((a) => /corrigé/.test(a.txt)));
});

test("règle des 8 % : réduction possible signalée quand elle n'apparaît pas", () => {
  const au = A.auditerTableau(A.analyserTableau(tableau({ capital: 200000, mois: 240, taux: 7, dateDebut: "2020-01-31" })), new Date(2026, 9, 12));
  assert.ok(au.possibles.length === 1);
  assert.ok(au.anomalies.some((a) => a.g === "alerte" && /réduction de taux était possible/.test(a.txt)));
});

test("document qui n'est pas un tableau : rien d'inventé", () => {
  assert.equal(A.analyserTableau("Bonjour\nVotre relevé de compte du 01/10/2026 : 1 250,000").lignes.length, 0);
});

test("offre bancaire : taux, TMM + marge, TEG, durée, montant, frais, assurance, mensualité", () => {
  const o = A.analyserOffre("Montant du prêt : 120 000,000 DT\nDurée : 180 mois\nTaux : TMM + 2,75 %\nTEG : 11,2 %\nFrais de dossier : 1 %\nAssurance décès 0,35 %\nMensualité : 1 389,402");
  assert.equal(o.capital, 120000);
  assert.equal(o.mois, 180);
  assert.equal(o.marge, 2.75);
  assert.equal(o.taux, undefined);
  assert.equal(o.teg, 11.2);
  assert.equal(o.fraisPct, 1);
  assert.equal(o.assurance, 0.35);
  assert.equal(o.mensualite, 1389.402);
  const f = A.analyserOffre("Crédit auto · capital 45.000 · durée 5 ans · taux d'intérêt fixe 10,5 % · frais de dossier 150,000");
  assert.equal(f.capital, 45000);
  assert.equal(f.mois, 60);
  assert.equal(f.taux, 10.5);
  assert.equal(f.fraisFixe, 150);
});

test("montants bancaires : virgule perdue à la lecture", () => {
  assert.equal(A.montantBanque("1 641,841"), 1641.841);
  assert.equal(A.montantBanque("1641841"), 1641.841);
});

/* Tableau fabriqué à la main : taux qui change à l'échéance « a » (nouvelle mensualité, même date de fin). */
function tableauTaux(C, n, phases, debut) {
  const r3 = (v) => Math.round(v * 1000) / 1000, L = [];
  let crd = C, t = phases[0][1], ech = 0;
  for (let k = 1; k <= n; k++) {
    const ph = phases.filter((p) => k >= p[0]).pop();
    if (k === 1 || ph[0] === k) { t = ph[1]; const i = t / 1200; ech = r3(crd * i / (1 - Math.pow(1 + i, -(n - k + 1)))); }
    const int = r3(crd * t / 1200), am = k === n ? crd : r3(ech - int), d = new Date(debut[0], debut[1] - 1 + k, 5);
    L.push(k + "  " + String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() + "  " + f3(crd) + "  " + f3(am) + "  " + f3(int) + "  " + f3(r3(am + int)));
    crd = r3(crd - am);
  }
  return "STB · Tableau d'amortissement\n" + L.join("\n");
}

test("crédit du profil d'après le tableau : mensualité, capital restant, taux, dates, jour du prélèvement", () => {
  const au = A.auditerTableau(A.analyserTableau(tableauTaux(30000, 60, [[1, 10.75]], [2024, 4])), new Date(2026, 9, 13));
  const v = A.creditDepuisAudit(au, new Date(2026, 9, 13));
  /* Échéances le 5 du mois, de mai 2024 à avril 2029 ; 29 payées au 13 octobre 2026 (mai 2024 → septembre 2026, plus octobre déjà passé). */
  assert.equal(v.banque, "STB");
  assert.equal(v.tauxPct, 10.75);
  assert.equal(v.jourPrelevement, 5);
  assert.deepEqual([v.moisDebut, v.anneeDebut, v.dureeMois], [4, 2024, 60]);
  assert.equal(v.moisRestants, 30);
  const L = au.lignes, oct = L.findIndex((l) => l.date.getFullYear() === 2026 && l.date.getMonth() === 9);
  assert.equal(v.capitalRestant, Math.round(L[oct].crdAp * 1000) / 1000, "capital après l'échéance d'octobre 2026");
  assert.equal(v.mensualite, L[oct + 1].ech, "mensualité de l'échéance suivante");
  assert.equal(v.tauxType, null, "taux unique : type non deviné");
  assert.equal(v.finTexte, "avril 2029");
  assert.equal(v.termine, false);
  /* Le même calcul que le profil pour les échéances restantes. */
  const OC = require("../../public/espace/js/orbite-calcul.js");
  assert.equal(OC.echeancier({ moisDebut: v.moisDebut, anneeDebut: v.anneeDebut, dureeMois: v.dureeMois }, new Date(2026, 9, 13)).restantes, v.moisRestants);
});

test("crédit du profil : taux variable (TMM qui bouge), crédit reconnu par sa mensualité, tableau non détaillé ignoré", () => {
  const au = A.auditerTableau(A.analyserTableau(tableauTaux(80000, 120, [[1, 9], [25, 10.25]], [2023, 1])), new Date(2026, 9, 13));
  const v = A.creditDepuisAudit(au, new Date(2026, 9, 13));
  assert.equal(v.tauxType, "variable");
  assert.equal(v.tauxPct, 10.25);
  const credits = [{ libelle: "Immobilier", mensualite: 1500 }, { libelle: "Auto", mensualite: Math.round(v.mensualite * 1.05) }, { libelle: "Conso", mensualite: 210 }];
  assert.equal(A.creditCorrespondant(credits, v), 1);
  assert.equal(A.creditCorrespondant([{ mensualite: v.mensualite * 1.3 }], v), -1, "au-delà de 10 % : nouveau crédit");
  assert.equal(A.creditDepuisAudit({ nonDetaille: true, lignes: au.lignes }), null);
  assert.equal(A.creditDepuisAudit(null), null);
});

test("crédit du profil : réduction de moitié du taux (règle des 8 %) reprise avec sa date, taux fixe", () => {
  const au = A.auditerTableau(A.analyserTableau(tableauTaux(200000, 240, [[1, 8], [61, 4]], [2018, 0])), new Date(2026, 9, 13));
  assert.equal(au.reductions.length, 1, JSON.stringify(au.phases.map((p) => p.taux)));
  const v = A.creditDepuisAudit(au, new Date(2026, 9, 13));
  assert.equal(v.tauxType, "fixe");
  assert.equal(v.tauxPct, 4);
  const d = au.reductions[0].date;
  assert.deepEqual([v.reductionMois, v.reductionAnnee], [d.getMonth() + 1, d.getFullYear()]);
});
