'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/espace/js/rappels-calcul.js');
const O = require('../../public/espace/js/orbite-calcul.js');
const I = require('../../public/espace/js/orbite-intelligence.js');

const M = new Date('2026-10-09T12:00:00');
const PROFIL = {
  montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, anneeNaissance: 1992, baseBanque: 'brut',
  credits: [
    { type: 'auto', libelle: 'Crédit automobile', tauxPct: 4.5, mensualite: 695.008, moisRestants: 3 },
    { type: 'immo', libelle: 'Crédit immobilier', tauxPct: 4.5, mensualite: 875.894, moisRestants: 148 }
  ]
};

test("essai : rappel la veille de la fin, jusqu'à la fin", () => {
  const l = R.rappels(null, { etat: 'essai', essai_fin: '2026-10-11T10:00:00.000Z' }, null, M);
  assert.equal(l.length, 1);
  assert.equal(l[0].id, 'essai-2026-10-11');
  assert.equal(l[0].quand, '2026-10-10T10:00:00.000Z');
  assert.equal(l[0].jusqua, '2026-10-11T10:00:00.000Z');
  assert.match(l[0].url, /#abonnement$/);
});

test('abonnement actif : rappel 3 jours avant la fin ; essai expiré : rien', () => {
  const l = R.rappels(null, { etat: 'actif', fin: '2027-04-08T00:00:00.000Z' }, null, M);
  assert.equal(l[0].quand, '2027-04-05T00:00:00.000Z');
  assert.equal(R.rappels(null, { etat: 'expire', essai_fin: '2026-10-01T00:00:00.000Z' }, null, M).length, 0);
});

test('crédits : dernière échéance dans les 13 prochains mois seulement', () => {
  const sy = O.synthese(PROFIL, {}, M);
  const l = R.rappels(sy, null, null, M).filter((x) => x.id.startsWith('credit-'));
  assert.equal(l.length, 1, 'le crédit immobilier (148 mois) est trop lointain');
  assert.equal(l[0].id, 'credit-0-2026-12');
  assert.match(l[0].titre, /crédit automobile/);
  assert.match(l[0].corps, /décembre 2026/);
  assert.match(l[0].corps, /695/);
});

test("fiscal : rappels les 1er et 15 décembre s'il reste une économie à saisir", () => {
  const sy = O.synthese(PROFIL, {}, M);
  const f = I.optimiseurFiscal(sy, { maintenant: M });
  const l = R.rappels(sy, null, f, M).filter((x) => x.id.startsWith('fiscal-'));
  assert.deepEqual(l.map((x) => x.id), ['fiscal-2026-12-1', 'fiscal-2026-12-15']);
  assert.match(l[0].titre, /31 jours/);
  assert.match(l[1].titre, /17 jours/);
  assert.equal(R.rappels(sy, null, Object.assign({}, f, { statut: 'optimise' }), M).filter((x) => x.id.startsWith('fiscal-')).length, 0);
});

test('à afficher : échus, non expirés, pas encore vus ; liste triée', () => {
  const l = [
    { id: 'a', quand: '2026-10-01T00:00:00Z', jusqua: '2026-10-05T00:00:00Z' },
    { id: 'b', quand: '2026-10-08T00:00:00Z' },
    { id: 'c', quand: '2026-10-20T00:00:00Z' },
    { id: 'd', quand: '2026-10-09T00:00:00Z' }
  ];
  assert.deepEqual(R.aAfficher(l, { d: 1 }, M).map((x) => x.id), ['b']);
  const sy = O.synthese(PROFIL, {}, M);
  const tous = R.rappels(sy, { etat: 'essai', essai_fin: '2026-10-11T10:00:00.000Z' }, I.optimiseurFiscal(sy, { maintenant: M }), M);
  for (let i = 1; i < tous.length; i++) assert.ok(Date.parse(tous[i - 1].quand) <= Date.parse(tous[i].quand));
});
