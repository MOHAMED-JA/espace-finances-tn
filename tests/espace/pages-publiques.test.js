'use strict';
/* Pages publiques (salaire net, capacité de crédit, impôt, retraite) : chiffres des mini-calculs, cohérents avec les moteurs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/commun/pages-calcul.js');
const P = require('../../public/moteurs/salaire/parametres.js');

const M = new Date(2026, 9, 11);
const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('salaire : 2 500 DT brut, célibataire, privé → net de l\'accueil, retenues qui s\'additionnent', () => {
  const s = C.salaire({ montant: 2500 }, M);
  proche(s.net, 1849.31);
  proche(s.cotisations, 242);
  proche(s.brut - s.cotisations - s.irpp - s.css, s.net);
  proche(s.parts.net + s.parts.cotisations + s.parts.irpp + s.parts.css, 1, 1e-9);
  assert.equal(s.caisse, 'CNSS');
  proche(s.tauxCotisation, 0.0968, 1e-9);
  assert.equal(s.tranche, 0.3);
});

test('salaire : secteur public (CNRPS), chef de famille et enfants font baisser l\'impôt', () => {
  const pub = C.salaire({ montant: 2500, secteur: 'public' }, M);
  assert.equal(pub.caisse, 'CNRPS');
  proche(pub.tauxCotisation, 0.1295, 1e-9);
  const seul = C.salaire({ montant: 3000 }, M), famille = C.salaire({ montant: 3000, chef: true, enfants: 2 }, M);
  assert.ok(famille.irpp < seul.irpp && famille.net > seul.net);
});

test('salaire : saisies hors bornes ramenées dans les limites, jamais d\'erreur', () => {
  assert.ok(C.salaire({ montant: '' }, M).net > 0);
  assert.ok(C.salaire({ montant: -5, enfants: 99 }, M).net > 0);
  assert.ok(isFinite(C.salaire({ montant: 5e9 }, M).net));
});

test('crédit : mensualité maximale = 40 % du net, crédits en cours déduits, capital par type', () => {
  const c = C.credit({ net: 1849.31 }, M);
  proche(c.mensualiteMax, 1849.31 * 0.4, 0.01);
  assert.deepEqual(c.types.map((t) => t.cle), ['immo', 'auto', 'conso']);
  assert.ok(c.types.every((t) => t.capital > 0 && t.dureeMois > 0 && t.taux > 0));
  const avec = C.credit({ net: 1849.31, encours: 300 }, M);
  proche(avec.mensualiteMax, c.mensualiteMax - 300, 0.01);
  assert.ok(avec.types[0].capital < c.types[0].capital);
  const sature = C.credit({ net: 1000, encours: 900 }, M);
  assert.equal(sature.mensualiteMax, 0);
  assert.ok(sature.types.every((t) => t.capital === 0));
});

test('impôt : versements assurance vie et CEA, gain borné par l\'impôt de l\'année', () => {
  const i = C.impot({ montant: 2500 }, M);
  assert.equal(i.annee, 2026);
  proche(i.impot, 4778.8, 0.01);
  proche(i.gain, 2628.34, 0.01);
  proche(i.av + i.cea, i.total, 1e-9);
  assert.ok(i.gain <= i.impot - i.impotMinimum + 0.01);
  assert.equal(i.jours, 81);
  assert.equal(C.impot({ montant: 400 }, M).gain, 0); // sous le seuil d'imposition : rien à économiser
});

test('retraite : CNSS à 60 ans au taux maximum, CNRPS à 62 ans puis 65 ans', () => {
  const r = C.retraite({ montant: 2500, anneeNaissance: 1990, anneeDebut: 2014 }, M);
  assert.equal(r.etat, 'ok');
  assert.equal(r.caisse, 'CNSS');
  assert.equal(r.age, 60);
  assert.equal(r.annee, 2050);
  assert.equal(r.taux, 80);
  assert.ok(r.net > 0 && r.net <= r.brut);
  const p = C.retraite({ montant: 3200, secteur: 'public', anneeNaissance: 1970, anneeDebut: 1995 }, M);
  assert.equal(p.caisse, 'CNRPS');
  assert.equal(p.age, 62);
  assert.ok(p.tard && p.tard.age === 65 && p.tard.taux > p.taux && p.tard.net > p.net);
});

test('retraite : carrière trop courte ou départ passé, état expliqué sans chiffre', () => {
  const court = C.retraite({ montant: 2500, anneeNaissance: 1968, anneeDebut: 2024 }, M);
  assert.equal(court.etat, 'insuffisant');
  assert.ok(court.raisons.length > 0 && court.net === undefined);
  const passe = C.retraite({ montant: 2500, anneeNaissance: 1950, anneeDebut: 1975 }, M);
  assert.notEqual(passe.etat, 'ok');
});

test('pont : le même salaire donne la capacité logement, l\'impôt évitable et la retraite', () => {
  const p = C.pont({ montant: 2500 }, M);
  proche(p.net, 1849.31);
  assert.equal(p.logement.cle, 'immo');
  proche(p.logement.capital, C.credit({ net: p.net }, M).types[0].capital, 0.5);
  proche(p.gainImpot, C.impot({ montant: 2500 }, M).gain, 1e-9);
  assert.equal(p.retraite.age, 60);
});

test('tableau brut → net et barème : croissants, lus dans les paramètres', () => {
  const t = C.tableauNet(M);
  assert.deepEqual(t.map((l) => l.brut), C.TABLE_BRUTS);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].net > t[i - 1].net && t[i].impot > t[i - 1].impot);
  const b = C.bareme();
  assert.equal(b.length, P.irpp.bareme.length);
  assert.equal(b[0].de, 0);
  assert.equal(b[b.length - 1].a, null);
  assert.ok(b.every((x, i) => i === 0 || x.de === b[i - 1].a));
});

test('les exemples ne vieillissent pas : un an plus tard, même âge de départ, année + 1', () => {
  const a = C.pont({ montant: 2500 }, M), b = C.pont({ montant: 2500 }, new Date(2027, 9, 11));
  assert.equal(b.retraite.age, a.retraite.age);
  assert.equal(b.retraite.annee, a.retraite.annee + 1);
});
