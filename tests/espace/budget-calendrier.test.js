"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../public/espace/js/budget-calcul.js");
const K = require("../../public/espace/js/calendrier-calcul.js");

const M = new Date("2026-10-12T10:00:00");
const PROFIL = { loyer: 450, chargesFixes: 0, jourPaie: 25, jourVersement: 15,
  credits: [{ libelle: "Auto", mensualite: 320, moisRestants: 31, jourPrelevement: 5 }, { libelle: "Conso", mensualite: 210, moisRestants: 2, jourPrelevement: 10 }],
  contrats: [{ type: "av", versementMensuel: 150, moisDebut: 1, anneeDebut: 2025 }], calendrierPrimes: [] , nombreSalaires: 13 };

test("budget : enveloppes proposées depuis le profil, le reste réparti", () => {
  const e = B.proposition(PROFIL, 1862, M);
  const p = Object.fromEntries(e.map((x) => [x.cle, x.prevu]));
  assert.equal(p.credits, 530);
  assert.equal(p.logement, 450);
  assert.equal(p.epargne, 150);
  const reste = 1862 - 530 - 450 - 150;
  assert.equal(p.courses, Math.round(reste * 0.4 / 10) * 10);
  assert.ok(e.reduce((s, x) => s + x.prevu, 0) <= 1862 + 10);
});

test("budget : reste à vivre, montant par jour jusqu'à la paie, dépassements", () => {
  const env = B.proposition(PROFIL, 1862, M);
  const r = B.etat({ net: 1862, enveloppes: env, depenses: { credits: 530, logement: 450, courses: 310, transport: 160, loisirs: 110 }, maintenant: M, jourPaie: 25 });
  assert.equal(r.totalDepense, 1560);
  assert.equal(r.resteAVivre, 302);
  assert.equal(r.jours, 13);
  assert.equal(r.parJour, Math.round(302 / 13 * 1000) / 1000);
  assert.equal(B.joursAvantPaie(new Date("2026-10-26T09:00:00"), 25), 30);
  assert.equal(B.joursAvantPaie(new Date("2026-10-31T09:00:00"), 0), 1);
});

test("budget : une dépense en une phrase (français, darija, chiffres arabes)", () => {
  assert.deepEqual(B.phrase("45 dinars d'essence"), { montant: 45, cle: "transport" });
  assert.deepEqual(B.phrase("café 3,5"), { montant: 3.5, cle: "loisirs" });
  assert.deepEqual(B.phrase("٢٠ دينار خضرة"), { montant: 20, cle: "courses" });
  assert.equal(B.phrase("bonjour"), null);
  assert.equal(B.phrase("12 trucs").cle, null);
});

test("budget : normalisation (enveloppes connues, 12 derniers mois, montants bornés)", () => {
  const mois = {}; for (let i = 1; i <= 14; i++) mois["2025-" + String(i > 12 ? 12 : i).padStart(2, "0")] = { courses: 10 };
  mois["2026-10"] = { courses: -5, inconnu: 3, transport: 2e7 };
  const n = B.normaliser({ enveloppes: [{ cle: "courses", prevu: 300 }, { cle: "x", prevu: 1 }], mois });
  assert.equal(n.enveloppes.length, 1);
  assert.equal(Object.keys(n.mois).length, 12);
  assert.deepEqual(n.mois["2026-10"], { transport: 1e6 });
});

test("calendrier : échéances, dernière échéance, épargne, paie, 13e mois, 31 décembre, rappels", () => {
  const oct = K.evenements(PROFIL, 2026, 9, { maintenant: M, net: 1862, rappels: [{ quand: "2026-10-20T09:00:00", titre: "Votre essai se termine", type: "essai" }, { quand: "2026-10-15T09:00:00", titre: "x", type: "versement" }] });
  const t = oct.map((e) => e.jour + ":" + e.type);
  assert.deepEqual(t, ["5:credit", "10:credit", "15:epargne", "20:rappel", "25:paie"]);
  const nov = K.evenements(PROFIL, 2026, 10, { maintenant: M, net: 1862 });
  assert.ok(nov.some((e) => e.type === "fin" && /Conso/.test(e.libelle)), "dernière échéance du crédit conso en novembre");
  assert.ok(!K.evenements(PROFIL, 2026, 11, { maintenant: M }).some((e) => /Conso/.test(e.libelle)), "plus de crédit conso en décembre");
  const dec = K.evenements(PROFIL, 2026, 11, { maintenant: M });
  assert.ok(dec.some((e) => e.type === "prime") && dec.some((e) => e.type === "fiscal" && e.jour === 31));
  assert.equal(K.resume(oct).prelevements, 680);
  assert.equal(K.evenements(PROFIL, 2026, 8, { maintenant: M }).length, 0, "le passé ne porte pas d'échéance");
});

test("calendrier : grille du lundi au dimanche, fichier .ics valide", () => {
  const g = K.grille(2026, 10);
  assert.deepEqual(g[0], [null, null, null, null, null, null, 1]);
  assert.equal(g.flat().filter(Boolean).length, 30);
  const ics = K.ics([{ date: "2026-11-05", jour: 5, type: "credit", libelle: "Auto, prêt\; test", montant: 320, detail: "" }], M);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106/);
  assert.match(ics, /SUMMARY:Auto\\, prêt\\; test · 320\\,000 DT/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
