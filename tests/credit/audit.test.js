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
