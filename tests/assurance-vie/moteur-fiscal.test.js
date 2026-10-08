'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Baremes = require('../../public/moteurs/vie/baremes.js');
const M = require('../../public/moteurs/vie/moteur-fiscal.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('les tranches du barème sont contiguës et commencent à zéro', () => {
  Object.values(Baremes.annees).forEach((r) => {
    assert.equal(r.tranches[0].min, 0);
    for (let i = 1; i < r.tranches.length; i++) {
      assert.equal(r.tranches[i].min, r.tranches[i - 1].max, `trou ou chevauchement avant la tranche ${i}`);
    }
    assert.equal(r.tranches[r.tranches.length - 1].max, Infinity);
  });
});

test('l\'impôt est nul jusqu\'à 5 000 TND', () => {
  assert.equal(M.impotDetaille(0).total, 0);
  assert.equal(M.impotDetaille(5000).total, 0);
});

test('impôt exact aux bornes de tranche (régression : tranches décalées de 1 TND)', () => {
  proche(M.impotDetaille(10000).total, 750);
  proche(M.impotDetaille(20000).total, 3250);
  proche(M.impotDetaille(30000).total, 6250);
  proche(M.impotDetaille(40000).total, 9550);
  proche(M.impotDetaille(50000).total, 13150);
  proche(M.impotDetaille(70000).total, 20750);
  proche(M.impotDetaille(80000).total, 24750);
});

test('l\'impôt ignore un revenu net négatif', () => {
  assert.equal(M.impotDetaille(-100).total, 0);
});

test('le détail par tranche additionne bien le total', () => {
  const d = M.impotDetaille(45321.5);
  proche(d.parTranche.reduce((s, b) => s + b.impot, 0), d.total);
  proche(d.parTranche.reduce((s, b) => s + b.montant, 0), 45321.5);
});

test('l\'impôt est croissant avec le revenu', () => {
  let precedent = -1;
  for (let net = 0; net <= 90000; net += 250) {
    const t = M.impotDetaille(net).total;
    assert.ok(t >= precedent, `baisse à ${net}`);
    precedent = t;
  }
});

test('déductions : plafonds appliqués', () => {
  const d = M.detailDeductions(45000, true, 2, 0, 1, 1);
  assert.equal(d.fraisProfessionnels, 2000);
  assert.equal(d.chefDeFamille, 300);
  assert.equal(d.enfants, 200);
  assert.equal(d.etudiants, 1000);
  assert.equal(d.parents, 450);
  assert.equal(M.totalDeductions(d), 3950);
  assert.equal(M.detailDeductions(0, false, 9, 0, 9, 0).enfants, 400);
  assert.equal(M.detailDeductions(0, false, 9, 0, 9, 0).etudiants, 4000);
  proche(M.detailDeductions(8000, false, 0, 0, 0, 0).fraisProfessionnels, 800);
});

test('investissement optimal : revenu net 30 000', () => {
  const impot = M.impotDetaille(30000).total;
  const opt = M.investissementOptimal(30000, impot);
  proche(opt.investissementOptimal, 11750);
  proche(M.impotDetaille(30000 - opt.investissementOptimal).total, impot * 0.45);
});

test('pas d\'investissement optimal sous le seuil d\'imposition', () => {
  assert.equal(M.investissementOptimal(4000, 0).investissementOptimal, 0);
  assert.equal(M.investissementOptimal(5000, 0).investissementOptimal, 0);
});

test('simuler : investir l\'optimal atteint exactement le plancher de 45 %', () => {
  const base = { revenu: 60000, chef: true, enfants: 2, infirmes: 0, etudiants: 0, parents: 1 };
  const s0 = M.simuler(base);
  const s1 = M.simuler({ ...base, investissement: s0.optimal });
  proche(s1.impotApres, s0.impotAvant * 0.45);
  proche(s1.tauxReduction, 55, 1e-6);
});

test('simuler : investir au-delà de l\'optimal ne réduit plus l\'impôt', () => {
  const base = { revenu: 60000, chef: false, enfants: 0, infirmes: 0, etudiants: 0, parents: 0 };
  const s0 = M.simuler(base);
  const a = M.simuler({ ...base, investissement: s0.optimal });
  const b = M.simuler({ ...base, investissement: s0.optimal + 5000 });
  proche(b.impotApres, a.impotApres);
  proche(b.economie, a.economie);
});

test('simuler : l\'économie ne dépasse jamais 55 % de l\'impôt initial', () => {
  for (let revenu = 6000; revenu <= 150000; revenu += 4000) {
    for (const investissement of [0, 500, 3000, 12000, 60000]) {
      const s = M.simuler({ revenu, investissement });
      assert.ok(s.economie <= s.impotAvant * 0.55 + 1e-6, `revenu ${revenu}, inv. ${investissement}`);
      assert.ok(s.economie >= 0);
    }
  }
});

test('simuler : sans investissement, aucune économie', () => {
  const s = M.simuler({ revenu: 40000 });
  proche(s.impotApres, s.impotAvant);
  assert.equal(s.economie, 0);
});

test("appliquerImpotMinimum relève l'impôt jusqu'au minimum demandé", () => {
  const d = M.impotDetaille(15000);
  const ajuste = M.appliquerImpotMinimum(d, 2500);
  proche(ajuste.total, 2500);
  proche(ajuste.parTranche.reduce((s, b) => s + b.impot, 0), 2500);
});

test('appliquerImpotMinimum ne baisse jamais un impôt déjà supérieur au minimum', () => {
  const d = M.impotDetaille(15000);
  assert.equal(M.appliquerImpotMinimum(d, 1500), d);
});

test('économie pour un investissement donné : nulle à 0, plafonnée à l\'optimal', () => {
  const s = M.simuler({ revenu: 50000 });
  assert.equal(M.economiePourInvestissement(s, 0), 0);
  const plafond = M.economiePourInvestissement(s, s.optimal);
  proche(M.economiePourInvestissement(s, s.optimal * 3), plafond);
});

test('barème inconnu : erreur explicite', () => {
  assert.throws(() => M.regles('1999'), /Barème inconnu/);
});
