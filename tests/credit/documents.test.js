"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../public/moteurs/credit/credit.js");
const A = require("../../public/moteurs/credit/audit.js");
global.Xlsx = require("../../public/moteurs/vie/xlsx.js");
const CD = require("../../public/espace/js/credit-documents.js");

function echeancier() {
  const r = M.echeancier({ capital: 80000, mois: 60, taux: 9.5, periodicite: 1, amort: "constant", dateDebut: "2026-11-30" });
  const lignes = r.lignes.map((l) => ({ n: l.mois, date: new Date(l.date), ech: l.paiement, int: l.interet, am: l.principal, ass: 0, ra: 0, crd: l.reste }));
  return { titre: "Échéancier · Crédit auto de 80 000,000 DT", sousTitre: "60 échéances", cartes: [["Échéance", "1 680,111 DT"], ["Intérêts totaux", "20 808,949 DT"]],
    lignes, totaux: { ech: lignes.reduce((a, l) => a + l.ech, 0), int: r.totI, am: r.totP, ass: 0, ra: 0 } };
}
/* Lecture minimale d'une archive ZIP « stockée » : noms et contenus. */
function lireZip(u8) {
  const b = Buffer.from(u8), out = {};
  let i = 0;
  while (b.readUInt32LE(i) === 0x04034b50) {
    const taille = b.readUInt32LE(i + 18), ln = b.readUInt16LE(i + 26), le = b.readUInt16LE(i + 28);
    const nom = b.slice(i + 30, i + 30 + ln).toString("utf8");
    out[nom] = b.slice(i + 30 + ln + le, i + 30 + ln + le + taille).toString("utf8");
    i += 30 + ln + le + taille;
  }
  return out;
}

test("échéancier Excel : 2 feuilles, 60 lignes, totaux en formules", () => {
  const z = lireZip(CD.echeancierXlsx(echeancier()));
  assert.ok(z["xl/worksheets/sheet1.xml"] && z["xl/worksheets/sheet2.xml"]);
  assert.match(z["xl/workbook.xml"], /name="Échéancier"/);
  assert.match(z["xl/worksheets/sheet1.xml"], /<f>SUM\(D5:D64\)<\/f>/);
  assert.equal((z["xl/worksheets/sheet1.xml"].match(/<row /g) || []).length, 4 + 60 + 1);
});

test("lettre Word : document .docx valide, texte et caractères échappés", () => {
  const z = lireZip(CD.lettreDocx("Demande", "Madame, Monsieur,\nJe demande la réduction de 9,5 % → 4,75 % <svp> & merci."));
  assert.ok(z["[Content_Types].xml"].includes("wordprocessingml.document.main+xml"));
  assert.match(z["word/document.xml"], /Madame, Monsieur,/);
  assert.match(z["word/document.xml"], /&lt;svp&gt; &amp; merci/);
  assert.equal((z["word/document.xml"].match(/<w:p>/g) || []).length, 2);
});

test("PDF : échéancier et rapport de contrôle générés (jsPDF local)", async () => {
  global.self = global;
  global.jspdf = require("../../public/espace/vendor/jspdf.umd.min.js");
  const blob = await CD.echeancierPdf(echeancier());
  const t = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.match(t, /^%PDF-/);
  assert.ok((t.match(/\/Type \/Page\b/g) || []).length >= 2);
  const txt = "BIAT\n" + echeancier().lignes.map((l) => l.n + " 30/" + String(l.date.getUTCMonth() + 1).padStart(2, "0") + "/" + l.date.getUTCFullYear() + " " + (l.crd + l.am).toFixed(3).replace(".", ",") + " " + l.am.toFixed(3).replace(".", ",") + " " + l.int.toFixed(3).replace(".", ",") + " " + l.ech.toFixed(3).replace(".", ",")).join("\n");
  const au = A.auditerTableau(A.analyserTableau(txt), new Date(2026, 9, 12));
  const b2 = await CD.auditPdf(au);
  assert.match(Buffer.from(await b2.arrayBuffer()).toString("latin1"), /^%PDF-/);
  const z = lireZip(CD.auditXlsx(au));
  assert.match(z["xl/worksheets/sheet2.xml"], /exacte au millime/);
  delete global.jspdf;
});

test("texte PDF : caractères hors Windows-1252 remplacés", () => {
  assert.equal(CD.txt("9,5 % → 4,75 % ≠ −1"), "9,5 % -> 4,75 % <> -1");
});
