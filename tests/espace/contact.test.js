'use strict';
/* Coordonnées facultatives du profil : email de contact, téléphone (Tunisie ou étranger), accords. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');

test('email : vide accepté, forme vérifiée, minuscules', () => {
  assert.deepEqual(OC.lireEmail(''), { valide: true, valeur: '' });
  assert.equal(OC.lireEmail('  Aziz.J@Exemple.TN ').valeur, 'aziz.j@exemple.tn');
  for (const x of ['aziz', 'a@b', 'a b@c.tn', '<a>@b.tn', 'a@b.c']) assert.equal(OC.lireEmail(x).valide, false, x);
});

test('téléphone : 8 chiffres tunisiens, +216, indicatif étranger, refus du reste', () => {
  assert.equal(OC.lireTelephone('22 123 456').valeur, '+21622123456');
  assert.equal(OC.lireTelephone('+216 98-765-432').valeur, '+21698765432');
  assert.equal(OC.lireTelephone('00216 71 123 456').valeur, '+21671123456');
  assert.equal(OC.lireTelephone('+33 6 12 34 56 78').valeur, '+33612345678');
  assert.equal(OC.formatTelephone('+21622123456'), '+216 22 123 456');
  assert.equal(OC.formatTelephone('+33612345678'), '+33612345678');
  for (const x of ['1234567', '12345678', '+216 1234567', '+216 12 345 678', 'abc', '+0123456789', '+1234567890123456']) assert.equal(OC.lireTelephone(x).valide, false, x);
  assert.deepEqual(OC.lireTelephone(''), { valide: true, valeur: '' });
});

test('profil : coordonnées invalides écartées, date d\'accord gardée seulement avec l\'accord', () => {
  const p = OC.normaliser({ emailContact: 'pas un email', telephone: '22123456', contactOk: true, contactOkLe: '2026-10-10T09:00:00.000Z', rappelsEmail: 1 });
  assert.equal(p.emailContact, '');
  assert.equal(p.telephone, '+21622123456');
  assert.equal(p.contactOk, true);
  assert.equal(p.contactOkLe, '2026-10-10T09:00:00.000Z');
  assert.equal(p.rappelsEmail, true);
  const q = OC.normaliser({ contactOk: false, contactOkLe: '2026-10-10T09:00:00.000Z' });
  assert.equal(q.contactOkLe, '');
  assert.equal(OC.normaliser({ contactOk: true, contactOkLe: '<script>' }).contactOkLe, '');
});
