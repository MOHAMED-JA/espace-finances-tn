/*
 * Fabrique e2e/fixtures/tableau-banque.pdf : un tableau d'amortissement « de banque » (profil fictif),
 * calculé par le moteur d'Orbite, avec une erreur d'intérêts glissée à l'échéance 14 (+0,750 DT).
 * Usage : node e2e/fixtures/fabriquer-tableau.js
 */
"use strict";
const path = require("node:path"), fs = require("node:fs");
const M = require("../../public/moteurs/credit/credit.js");
const { jsPDF } = require("../../public/espace/vendor/jspdf.umd.min.js");
const r = M.echeancier({ capital: 80000, mois: 60, taux: 9.5, periodicite: 1, amort: "constant", dateDebut: "2025-01-31" });
const f3 = (v) => v.toFixed(3).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, " ");
const doc = new jsPDF({ unit: "pt", format: "a4" });
let y = 50, crd = r.C;
doc.setFontSize(13); doc.text("Banque de démonstration · Tableau d'amortissement", 40, y); y += 18;
doc.setFontSize(10); doc.text("Client : Aziz Démo · Durée : 60 mois · Montant débloqué : 80 000,000", 40, y); y += 24;
doc.text("N°", 40, y); doc.text("Date", 70, y); doc.text("Capital dû", 170, y); doc.text("Amortissement", 270, y); doc.text("Intérêts", 380, y); doc.text("Échéance", 470, y); y += 16;
r.lignes.forEach((l, i) => {
  const d = new Date(l.date), date = "30/" + String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear();
  const int = i === 13 ? l.interet + 0.75 : l.interet, ech = i === 13 ? l.paiement + 0.75 : l.paiement;
  doc.text(String(i + 1), 40, y); doc.text(date, 70, y); doc.text(f3(crd), 170, y); doc.text(f3(l.principal), 270, y); doc.text(f3(int), 380, y); doc.text(f3(ech), 470, y);
  crd = Math.round((crd - l.principal) * 1000) / 1000; y += 14;
  if (y > 800) { doc.addPage(); y = 50; }
});
fs.writeFileSync(path.join(__dirname, "tableau-banque.pdf"), Buffer.from(doc.output("arraybuffer")));
console.log("ok", r.lignes.length, "lignes");
