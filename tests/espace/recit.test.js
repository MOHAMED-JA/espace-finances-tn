'use strict';
/* Accueil « scroll-cinéma » (lot 5) : chiffres du voyage et des trois cas types, calculés par les moteurs et stables dans le temps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/commun/recit-calcul.js');

const M = new Date(2026, 9, 11);
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('voyage : 2 500 DT brut → net de l\'aperçu de l\'accueil, capacité, impôt, projection, retraite', () => {
  const v = R.voyage(M);
  proche(v.brut, 2500);
  proche(v.cotisations, 242);
  proche(v.net, 1862.018, 0.001);
  proche(v.brut - v.cotisations - v.impot, v.net, 0.001);
  assert.equal(v.tranche, 0.3);
  assert.ok(v.capacite > 70000 && v.capacite < 85000);
  assert.ok(v.gainImpot > 0 && v.versements > 0);
  assert.equal(v.anneeProjection, 2036);
  proche(v.brutProjection, 2500 * Math.pow(1.05, 10), 0.01);
  assert.ok(v.retraite && v.retraite.age === 60 && v.retraite.taux === 80);
});

test('Yasmine : loyer, reste à vivre, épargne de précaution, impôt', () => {
  const y = R.vies(M).yasmine;
  assert.equal(y.age, 26);
  proche(y.loyerPart, 450 / y.net, 1e-9);
  proche(y.reste, y.net - 450, 1e-6);
  assert.equal(y.precaution, 5800, '6 mois de dépenses, même définition que la réserve de sécurité');
  assert.ok(y.gainImpot > 0);
});

test('Karim : endettement au-dessus de 40 %, marge retrouvée à la fin du crédit auto', () => {
  const k = R.vies(M).karim;
  assert.ok(k.refus);
  proche(k.endettement, 1250 / k.net, 1e-9);
  assert.equal(k.apres.fin, 'janvier 2029');
  proche(k.apres.endettement, 900 / k.net, 1e-9);
  assert.ok(k.apres.marge > 100 && k.apres.marge < 250);
});

test('Habib : retraite CNRPS à 62 ans, et à 65 ans', () => {
  const h = R.vies(M).habib;
  assert.equal(h.retraite.age, 62);
  assert.equal(h.retraite.annee, 2032);
  proche(h.retraite.taux, 83.5, 1e-9);
  assert.ok(h.a65.taux > h.retraite.taux && h.a65.net > h.retraite.net);
});

test('les exemples ne vieillissent pas : mêmes âges et mêmes durées un an plus tard', () => {
  const a = R.vies(M), b = R.vies(new Date(2027, 9, 11));
  assert.equal(b.yasmine.age, a.yasmine.age);
  assert.equal(b.habib.age, a.habib.age);
  assert.equal(b.habib.retraite.annee, a.habib.retraite.annee + 1);
  assert.equal(b.karim.apres.fin, 'janvier 2030');
  proche(b.karim.endettement, a.karim.endettement, 1e-9);
});
