"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../public/moteurs/credit/phrase.js");

test("phrase complète : montant, durée, TMM + marge, apport", () => {
  const r = P.analyser("150 000 sur 20 ans à TMM + 2,5 avec 30 000 d'apport");
  assert.equal(r.capital, 150000);
  assert.equal(r.mois, 240);
  assert.ok(Number.isNaN(r.tmm.tmm));
  assert.equal(r.tmm.marge, 2.5);
  assert.equal(r.apport, 30000);
  assert.equal(r.prix, 180000);
});

test("taux fixe, mois, type auto", () => {
  const r = P.analyser("Crédit voiture de 45 000 DT sur 60 mois à 10,5 %");
  assert.equal(r.type, "auto");
  assert.equal(r.capital, 45000);
  assert.equal(r.mois, 60);
  assert.equal(r.taux, 10.5);
  assert.equal(r.tmm, undefined);
});

test("assurance et frais ne sont pas pris pour le taux", () => {
  const r = P.analyser("prêt de 100 000 sur 15 ans à 9 % assurance 0,4 % frais de dossier 1 %");
  assert.equal(r.taux, 9);
  assert.equal(r.assurance, 0.4);
  assert.equal(r.fraisPct, 1);
  assert.equal(r.mois, 180);
});

test("TMM chiffré, différé et périodicité", () => {
  const r = P.analyser("logement 200 mille, TMM 7,5 + 3, 25 ans, différé de 6 mois, échéances trimestrielles");
  assert.equal(r.type, "immo");
  assert.equal(r.capital, 200000);
  assert.deepEqual(r.tmm, { tmm: 7.5, marge: 3 });
  assert.equal(r.mois, 300);
  assert.deepEqual(r.differe, { mois: 6, type: "partiel" });
  assert.equal(r.periodicite, 3);
});

test("prix du bien et apport : le capital est déduit", () => {
  const r = P.analyser("appartement à 250 000 avec un apport de 50 000 sur 20 ans à 8 %");
  assert.equal(r.prix, 250000);
  assert.equal(r.apport, 50000);
  assert.equal(r.capital, 200000);
});

test("arabe : chiffres arabes-indiens et « ألف »", () => {
  const r = P.analyser("قرض سيارة ٨٠ ألف على ٧ سنوات بنسبة ٩٫٥٪");
  assert.equal(r.type, "auto");
  assert.equal(r.capital, 80000);
  assert.equal(r.mois, 84);
  assert.equal(r.taux, 9.5);
});

test("valeurs aberrantes ignorées, rien de reconnu → résumé vide", () => {
  assert.equal(P.analyser("150 000 sur 99 ans à 9 %").mois, undefined);
  assert.equal(P.analyser("150 000 à 75 %").taux, undefined);
  assert.deepEqual(P.analyser("bonjour").resume, []);
});

test("résumé lisible dans l'ordre parlé", () => {
  const r = P.analyser("crédit immobilier 120 000 sur 20 ans à TMM 7,49 + 2,5");
  assert.deepEqual(r.resume, ["crédit immobilier", "120 000 DT empruntés", "20 ans", "TMM 7,49 % + 2,5 %"]);
});

test("montants : séparateurs et suffixes", () => {
  assert.equal(P.valeurMontant("150.000", ""), 150000);
  assert.equal(P.valeurMontant("1,5", "million"), 1500000);
  assert.equal(P.valeurMontant("90", "k"), 90000);
});
