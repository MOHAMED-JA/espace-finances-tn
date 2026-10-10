'use strict';
/* Mode Expert : tableau d'amortissement (règle des 8 %), paie mois par mois, CSV, classeur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const SC = require('../../public/espace/js/scenarios-calcul.js');
const EX = require('../../public/espace/js/expert-calcul.js');
const X = require('../../public/moteurs/vie/xlsx.js');

const M = new Date(2026, 9, 10);
const P = { dateNaissance: '1990-01-01', montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, baseBanque: 'brut',
  credits: [
    { libelle: 'Crédit auto', type: 'auto', mensualite: 695.008, tauxPct: 4.5, moisRestants: 65, tauxType: 'fixe' },
    { libelle: 'Crédit immobilier', type: 'immo', mensualite: 765.003, tauxPct: 2.25, moisDebut: 2, anneeDebut: 2023, dureeMois: 191, tauxType: 'fixe', reductionMois: 3, reductionAnnee: 2026 }],
  contrats: [{ type: 'av', versementMensuel: 100, moisDebut: 12, anneeDebut: 2021 }] };
const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('amortissement du crédit immobilier : 147 échéances, réductions de taux, solde nul en janvier 2039', () => {
  const sy = OC.synthese(P, {}, M), a = EX.amortissement(sy, 1);
  assert.equal(a.lignes.length, 147);
  assert.deepEqual([a.lignes[0].n, a.lignes[0].date], [45, 'novembre 2026']);
  const last = a.lignes[146];
  assert.deepEqual([last.n, last.date, last.restant], [191, 'janvier 2039', 0]);
  const r = a.lignes.filter((l) => l.reduction).map((l) => [l.n, l.date, l.tauxPct]);
  assert.deepEqual(r, [[103, 'septembre 2031', 1.125], [179, 'janvier 2038', 0.5625]]);
  proche(a.lignes[58].mensualite, 734.081);
  proche(a.lignes.reduce((s, l) => s + l.capital, 0), a.capitalRestant, 0.01);
  proche(a.totalMensualites - a.totalInterets, a.capitalRestant, 0.01);
  assert.equal(EX.amortissement(sy, 0).lignes[0].n, 1, 'sans dates : numéros des échéances restantes');
});

test('paie de l\'année : 17 salaires, primes en décembre, total = net de l\'année ; hausse datée mois par mois', () => {
  const sy = OC.synthese(P, {}, M), pa = EX.paieAnnee(sy);
  assert.equal(pa.total.salaires, 17);
  assert.equal(pa.lignes[11].salaires, 6);
  proche(pa.total.net, sy.salaire.netAnnuel, 0.01);
  proche(pa.total.brut, sy.salaire.brutAnnuel, 0.01);
  const sy2 = OC.synthese(Object.assign({}, P, { historiqueSalaire: [{ montant: 3600, mois: 0, annee: 0 }, { montant: 4000, mois: 7, annee: 2026 }] }), {}, M);
  const pa2 = EX.paieAnnee(sy2);
  assert.ok(pa2.varie);
  assert.ok(pa2.lignes[5].brut < pa2.lignes[6].brut, 'juillet au nouveau salaire');
});

test('CSV : point-virgule, virgule décimale, BOM, pas de formule injectée', () => {
  const t = EX.csv([['Mois', 'Montant'], ['=SOMME(A1)', 1234.5678], ['a;b', null]]);
  assert.ok(t.startsWith('﻿Mois;Montant\r\n'));
  assert.ok(t.includes("'=SOMME(A1);1234,568"));
  assert.ok(t.includes('"a;b";'));
});

test('classeur : feuilles Profil, Paie, crédits, contrats, Mon orbite, Impôt, Scénarios ; fichier xlsx valide', () => {
  const sy = OC.synthese(P, {}, M);
  const comp = SC.comparer(P, [{ nom: 'Épargne', changements: [{ type: 'epargne', produit: 'av', versementMensuel: 200, mois: 1, annee: 2027 }] }], M);
  const f = EX.classeur(sy, comp, ['Épargne']);
  assert.deepEqual(f.map((x) => x.nom), ['Profil', 'Paie 2026', '1. Crédit auto', '2. Crédit immobilier', 'Contrats', 'Mon orbite', 'Impôt', 'Scénarios', 'Scénarios, bilan']);
  assert.equal(f[5].lignes.length, 122);
  const octets = X.classeur(f, { titre: 'Orbite' });
  assert.equal(octets[0], 0x50); assert.equal(octets[1], 0x4b, 'archive ZIP');
});
