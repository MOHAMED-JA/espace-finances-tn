'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lireNombre } = require('../../public/moteurs/vie/saisie.js');

test('écriture française : espaces et virgule décimale', () => {
  assert.equal(lireNombre('45 000').v, 45000);
  assert.equal(lireNombre('45 000,5').v, 45000.5);
  assert.equal(lireNombre('0,5').v, 0.5);
  assert.equal(lireNombre(',5').v, 0.5);
});

test('écriture anglo-saxonne sans ambiguïté', () => {
  assert.equal(lireNombre('1,234,567').v, 1234567);
  assert.equal(lireNombre('45,000.5').v, 45000.5);
  assert.equal(lireNombre('1.234,56').v, 1234.56);
});

test('« 45,000 » est signalé ambigu : lu 45 par défaut, alternative 45 000', () => {
  const r = lireNombre('45,000');
  assert.equal(r.v, 45);
  assert.equal(r.ambigu, true);
  assert.equal(r.alternative, 45000);
  assert.equal(lireNombre('45.000').ambigu, true);
});

test('pas d\'ambiguïté quand la lecture est claire', () => {
  assert.equal(lireNombre('45,5').ambigu, false);
  assert.equal(lireNombre('12,3456').ambigu, false);
  assert.equal(lireNombre('1234,567').ambigu, false);
  assert.equal(lireNombre('0,500').ambigu, false);
});

test('saisies invalides et vides', () => {
  assert.ok(Number.isNaN(lireNombre('abc').v));
  assert.ok(Number.isNaN(lireNombre('-3').v));
  assert.ok(Number.isNaN(lireNombre('1,23,456').v));
  assert.ok(Number.isNaN(lireNombre('12,34.5,6').v));
  assert.equal(lireNombre('').vide, true);
  assert.equal(lireNombre(null).vide, true);
});
