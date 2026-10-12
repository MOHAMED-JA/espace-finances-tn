"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../public/moteurs/credit/projets.js");

test("frais d'achat sous 500 000 DT : droit fixe, conservation 1 %, acte 1,5 %", () => {
  const f = P.fraisPrix(250000);
  const m = Object.fromEntries(f.lignes.map((l) => [l.cle, l.montant]));
  assert.equal(m.enregistrement, 180);
  assert.equal(m.conservation, 2500);
  assert.equal(m.acte, 3750);
  assert.equal(f.aConfirmer, false);
});

test("au-delà de 500 000 DT : exemple publié (600 000 DT → 21 000 DT de droits et conservation)", () => {
  const f = P.fraisPrix(600000);
  const m = Object.fromEntries(f.lignes.map((l) => [l.cle, l.montant]));
  assert.equal(m.enregistrement + m.conservation, 21000);
  assert.equal(f.aConfirmer, true);
  const g = P.fraisPrix(1200000);
  assert.equal(Object.fromEntries(g.lignes.map((l) => [l.cle, l.montant])).enregistrement, 700000 * 0.03 + 1200000 * 0.04);
});

test("projet : le crédit couvre aussi l'hypothèque et le dossier (calculés sur le prêt lui-même)", () => {
  const p = P.projet({ prix: 250000, apport: 50000, mois: 240, tauxPct: 10 });
  const hyp = p.lignes.find((l) => l.cle === "hypotheque").montant, dos = p.lignes.find((l) => l.cle === "dossier").montant;
  assert.ok(Math.abs(p.credit - (250000 + 180 + 2500 + 3750 - 50000 + hyp + dos)) < 0.01, "crédit = besoin + frais bancaires");
  assert.ok(Math.abs(hyp - p.credit * 0.002) < 0.001 && Math.abs(dos - p.credit * 0.01) < 0.001);
  assert.equal(p.coutTotal, Math.round((250000 + p.frais) * 1000) / 1000);
  assert.ok(Math.abs(p.mensualite - P.mensualite(p.credit, 10, 240)) < 0.001);
});

test("Premier logement : l'apport de l'État réduit le crédit bancaire, avec sa propre mensualité ; au-dessus du plafond, rien", () => {
  const sans = P.projet({ prix: 200000, apport: 0, mois: 240, tauxPct: 10 });
  const avec = P.projet({ prix: 200000, apport: 0, mois: 240, tauxPct: 10, premier: { actif: true } });
  assert.equal(avec.premier.montant, 40000);
  assert.ok(avec.credit < sans.credit - 39000);
  assert.ok(avec.premier.mensualite > 0 && avec.mensualiteTotale > avec.mensualite);
  assert.equal(P.projet({ prix: 300000, apport: 0, mois: 240, tauxPct: 10, premier: { actif: true } }).premier.eligible, false);
});

test("quand acheter : épargne mensuelle et capacité qui monte à la fin d'un crédit", () => {
  const base = { prix: 150000, apport: 20000, mois: 240, tauxPct: 10, epargneMensuelle: 500 };
  const r = P.quandAcheter(Object.assign({}, base, { capacite: [{ mois: 0, mensualiteMax: 900 }, { mois: 30, mensualiteMax: 1300 }] }));
  assert.ok(r && r.mois > 0 && r.mois <= 30, "date trouvée : " + (r && r.mois));
  assert.ok(r.projet.mensualiteTotale <= r.capacite);
  assert.equal(P.quandAcheter(Object.assign({}, base, { epargneMensuelle: 0, capacite: [{ mois: 0, mensualiteMax: 100 }] })), null);
});

test("comparateur : classement par coût total ; une offre au TMM montre l'effet d'un point de plus", () => {
  const r = P.comparer({ capital: 150000, mois: 240, tmm: 7.2, offres: [
    { nom: "Banque A", mode: "tmm", marge: 2.25, fraisDossierPct: 1, assurancePct: 0.3 },
    { nom: "Banque B", mode: "fixe", taux: 9.5, fraisFixes: 500, assurancePct: 0.2 },
    { nom: "Banque C", mode: "tmm", marge: 2.75, fraisDossierPct: 1.5, assurancePct: 0.35 }] });
  assert.equal(r.classement.length, 3);
  assert.ok(r.classement[0].coutCredit <= r.classement[1].coutCredit && r.classement[1].coutCredit <= r.classement[2].coutCredit);
  const a = r.offres.find((o) => o.nom === "Banque A");
  assert.equal(a.taux, 9.45);
  assert.ok(a.plusUnPoint.ecart > 50 && a.plusUnPoint.ecart < 150, "+1 point : " + a.plusUnPoint.ecart);
  assert.equal(r.offres.find((o) => o.nom === "Banque B").plusUnPoint, undefined);
});

test("regrouper : restant dû, indemnité 1,5 %, verdict honnête quand la mensualité baisse mais le coût monte", () => {
  const credits = [
    { libelle: "Auto", mensualite: 320, tauxPct: 10, moisRestants: 30 },
    { libelle: "Conso", mensualite: 210, tauxPct: 11, moisRestants: 17, capitalRestant: 3292 },
    { libelle: "Exclu", mensualite: 100, tauxPct: 9, moisRestants: 10, inclus: false }];
  const r = P.regrouper({ credits, tauxPct: 10, mois: 60 });
  assert.equal(r.lignes.length, 2);
  assert.equal(r.lignes[1].restantDu, 3292);
  assert.ok(Math.abs(r.lignes[0].indemnite - r.lignes[0].restantDu * 0.015) < 0.001);
  assert.equal(r.mensualiteAvant, 530);
  assert.ok(r.mensualiteApres < 530 && r.difference > 0);
  assert.equal(r.verdict, "mensualite_baisse_cout_monte");
  assert.equal(P.regrouper({ credits: [] }), null);
});

test("TMM : série triée, variation du mois ; effet sur un crédit variable, ou l'exemple sans crédit variable", () => {
  const s = P.serieTMM([{ mois: "2026-10-01", taux: 7.2 }, { mois: "2026-09-01", taux: 7.45 }, { mois: "x", taux: 3 }, { mois: "2026-08-01", taux: 7.5 }]);
  assert.deepEqual(s.serie.map((x) => x.mois), ["2026-08-01", "2026-09-01", "2026-10-01"]);
  assert.equal(s.dernier.taux, 7.2);
  assert.equal(s.variation, -0.25);
  const ex = P.effetTMM({ delta: -0.25, tmm: 7.2, credits: [{ tauxType: "fixe", mensualite: 300, moisRestants: 20 }] });
  assert.equal(ex.exemple, true);
  assert.ok(ex.lignes[0].ecart < -20 && ex.lignes[0].ecart > -30, "baisse d'environ 25 DT : " + ex.lignes[0].ecart);
  assert.ok(ex.lignes[0].plusUnPoint > 95 && ex.lignes[0].plusUnPoint < 105);
  const v = P.effetTMM({ delta: 0.5, tmm: 7.5, credits: [{ libelle: "Maison", tauxType: "variable", mensualite: 1200, tauxPct: 10, moisRestants: 180 }] });
  assert.equal(v.exemple, false);
  assert.ok(v.ecartTotal > 0);
});
