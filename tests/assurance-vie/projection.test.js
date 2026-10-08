'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../public/moteurs/vie/projection.js');
const G = require('../../public/moteurs/vie/graphiques.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = { versement: 100, periodesParAn: 12, dureeAns: 10, rendementPct: 6, fraisPct: 1, economieAnnuelle: 300, reinvestir: false };

test('rendement nul : le capital égale les versements', () => {
  const r = P.projeter({ ...base, rendementPct: 0, fraisPct: 0 });
  proche(r.capitalFinal, 12000);
  proche(r.totalVerse, 12000);
  proche(r.gain, 0);
});

test('capital connu : rente annuelle à 5 %', () => {
  const r = P.projeter({ versement: 1000, periodesParAn: 1, dureeAns: 3, rendementPct: 5, fraisPct: 0, economieAnnuelle: 0, reinvestir: false });
  proche(r.capitalFinal, 1000 * 1.05 * 1.05 + 1000 * 1.05 + 1000);
});

test('les frais réduisent le capital', () => {
  const sans = P.projeter({ ...base, fraisPct: 0 });
  const avec = P.projeter({ ...base, fraisPct: 2 });
  assert.ok(avec.capitalFinal < sans.capitalFinal);
});

test('réinvestir l\'économie d\'impôt augmente le capital', () => {
  const non = P.projeter(base);
  const oui = P.projeter({ ...base, reinvestir: true });
  assert.ok(oui.capitalFinal > non.capitalFinal + 300 * 10 - 1e-6);
  proche(oui.economieCumulee, 3000);
});

test('trois scénarios ordonnés : prudent ≤ médian ≤ dynamique', () => {
  const s = P.scenarios(base);
  assert.ok(s.prudent.capitalFinal < s.median.capitalFinal);
  assert.ok(s.median.capitalFinal < s.dynamique.capitalFinal);
});

test('scénario prudent : rendement jamais négatif', () => {
  const s = P.scenarios({ ...base, rendementPct: 1, fraisPct: 0 });
  assert.ok(s.prudent.capitalFinal >= s.prudent.totalVerse - 1e-6);
});

test('la série annuelle a un point de plus que la durée', () => {
  assert.equal(P.projeter(base).annees.length, 11);
});

test('placement classique au même taux, sans frais ni économie', () => {
  const classique = P.placementClassique(base, 6);
  const sansFrais = P.projeter({ ...base, fraisPct: 0, economieAnnuelle: 0 });
  proche(classique, sansFrais.capitalFinal);
});

test('rendement effectif : sans économie d\'impôt ni frais, égal au rendement brut', () => {
  const r = P.rendementEffectif({ ...base, fraisPct: 0, economieAnnuelle: 0 });
  proche(r, 6, 1e-4);
});

test('rendement effectif : l\'économie d\'impôt l\'augmente', () => {
  const sans = P.rendementEffectif({ ...base, economieAnnuelle: 0 });
  const avec = P.rendementEffectif(base);
  assert.ok(avec > sans);
});

test('rendement effectif : null sans versement', () => {
  assert.equal(P.rendementEffectif({ ...base, versement: 0 }), null);
});

test('graphiques : SVG valide, sans NaN', () => {
  const eco = G.courbeEconomie({
    points: [[0, 0], [1000, 200], [2000, 380], [3000, 380]], optimal: 2000, courant: 1500, economieCourante: 300
  });
  const cap = G.courbeCapital(P.scenarios(base));
  [eco, cap].forEach((svg) => {
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.ok(!/NaN|Infinity|undefined/.test(svg));
  });
});

test('graphiques : courbe d\'économie sans donnée utile ne plante pas', () => {
  const svg = G.courbeEconomie({ points: [[0, 0], [1, 0]], optimal: 0, courant: 0, economieCourante: 0 });
  assert.ok(!/NaN/.test(svg));
});
