"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../public/espace/js/recevoir-calcul.js");

const TABLEAU = ["BANQUE DÉMO — Tableau d'amortissement", "N° échéance  Date  Échéance  Intérêts  Capital  Capital restant dû"]
  .concat(Array.from({ length: 12 }, (_, i) => `${i + 1}  01/${String(i + 1).padStart(2, "0")}/2026  1 349,589  1 125,000  224,589  149 775,411`)).join("\n");
const FICHE = "BULLETIN DE PAIE — Octobre 2026\nMatricule 0042\nSalaire de base 2 500,000\nCotisations salariales CNSS 229,750\nIRPP 241,500\nContribution sociale de solidarité 11,353\nNet à payer 1 849,310";
const OFFRE = "Offre de prêt immobilier\nMontant du prêt : 150 000 DT\nDurée du prêt : 20 ans\nTaux variable : TMM + 2,5 %\nFrais de dossier : 1 %\nTEG : 10,9 %";

test("tableau d'amortissement : lignes d'échéance", () => {
  const r = R.classer(TABLEAU, "releve.pdf");
  assert.equal(r.type, "tableau");
  assert.equal(r.sur, "sur");
});
test("fiche de paie", () => {
  const r = R.classer(FICHE, "scan.pdf");
  assert.equal(r.type, "fiche");
});
test("offre de crédit : taux et frais, sans lignes d'échéance", () => {
  const r = R.classer(OFFRE, "document.pdf");
  assert.equal(r.type, "offre");
});
test("nom du fichier seul : indice insuffisant ; texte vide : on demande", () => {
  assert.equal(R.classer("", "fiche-paie-octobre.pdf").type, null);
  assert.equal(R.classer("Bonjour, voici le document.", "doc.pdf").type, null);
  assert.equal(R.classer("Net à payer 1 200,000\nCNSS", "bulletin-paie.pdf").type, "fiche");
});
