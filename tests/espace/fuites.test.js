'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../public/commun/fuites.js');

test('SHA-1 locale (référence connue : « password »)', async () => {
  assert.equal(await F.sha1Hex('password'), '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
});

test('k-anonymat : seuls les 5 premiers caractères de l\'empreinte sont envoyés', async () => {
  const appels = [];
  const fauxFetch = async (url, init) => { appels.push({ url, init }); return { ok: true, text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0000000000000000000000000000000000A:0' }; };
  const n = await F.verifier('password', { fetch: fauxFetch });
  assert.equal(n, 3861493);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, 'https://api.pwnedpasswords.com/range/5BAA6');
  assert.equal(appels[0].url.split('/range/')[1].length, 5, 'seulement le préfixe');
  assert.equal(appels[0].init.headers['Add-Padding'], 'true');
});

test('mot de passe inconnu des fuites : 0 ; lignes de rembourrage ignorées', async () => {
  const fauxFetch = async () => ({ ok: true, text: async () => 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0\r\nAAAA:12' });
  assert.equal(await F.verifier('Un-mot-de-passe-tres-long-2026!', { fetch: fauxFetch }), 0);
});

test('service en panne ou injoignable : -1 (on ne bloque pas l\'utilisateur)', async () => {
  assert.equal(await F.verifier('x', { fetch: async () => ({ ok: false, status: 503, text: async () => '' }) }), -1);
  assert.equal(await F.verifier('x', { fetch: async () => { throw new Error('réseau'); } }), -1);
  assert.equal(await F.verifier('', { fetch: async () => ({ ok: true, text: async () => '' }) }), -1);
});

test('lecture des suffixes : insensible à la casse, compte numérique', () => {
  assert.equal(F.occurrences('abc:5\nDEF:7', 'ABC'), 5);
  assert.equal(F.occurrences('abc:5', 'XYZ'), 0);
});
