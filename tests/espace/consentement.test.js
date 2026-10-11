'use strict';
/* Acceptation obligatoire de la politique de confidentialité et des CGV : décision, accord local, version = date de la politique. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../../public/commun/consentement.js');

const V = K.VERSION, T = Date.UTC(2026, 9, 11, 19, 0);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

test('décision : déjà acceptée → ok ; cochée à l\'inscription → auto ; sinon écran', () => {
  assert.equal(K.decider(V, undefined, false), 'ok');
  assert.equal(K.decider(null, V, false), 'auto');
  assert.equal(K.decider(null, undefined, true), 'auto');
  assert.equal(K.decider(null, undefined, false), 'ecran');
  assert.equal(K.decider('2020-01-01', undefined, false), 'ecran');
  assert.equal(K.decider('2020-01-01', '2020-01-01', false), 'ecran');
});

test('motif de l\'écran : jamais acceptée ou nouvelle version', () => {
  assert.equal(K.motif(null), 'nouveau');
  assert.equal(K.motif('2020-01-01'), 'mise-a-jour');
});

test('accord local : bonne version, moins d\'un jour, sinon refusé (et jamais d\'erreur)', () => {
  assert.equal(K.accordLocal(JSON.stringify({ version: V, t: T }), T + 3600e3), true);
  assert.equal(K.accordLocal({ version: V, t: T }, T + 25 * 3600e3), false);
  assert.equal(K.accordLocal({ version: '2020-01-01', t: T }, T), false);
  assert.equal(K.accordLocal({ version: V, t: T + 1000 }, T), false);
  assert.equal(K.accordLocal('pas du json', T), false);
  assert.equal(K.accordLocal(null, T), false);
});

test('la version est la date affichée en tête de la politique de confidentialité', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/confidentialite.html'), 'utf8');
  const [a, m, j] = V.split('-').map(Number);
  assert.match(html, new RegExp('Dernière mise à jour : ' + j + ' ' + MOIS[m - 1] + ' ' + a));
});

test('garantir : enregistre sans écran quand la case a été cochée à l\'inscription, ne relance rien si déjà acceptée', async () => {
  const appels = [];
  const api = (derniere) => ({
    dernier: () => Promise.resolve(derniere ? { version: derniere, accepte_le: '2026-10-11T19:00:00Z' } : null),
    accepter: (v) => { appels.push(v); return Promise.resolve({ version: v }); },
    deconnecter: () => {}, horsLigne: () => false
  });
  assert.deepEqual(await K.garantir({ user_metadata: {} }, api(V), null), { version: V, accepte_le: '2026-10-11T19:00:00Z' });
  assert.equal(appels.length, 0);
  assert.deepEqual(await K.garantir({ user_metadata: { orbite_consentement: V } }, api(null), null), { version: V });
  assert.deepEqual(appels, [V]);
});

test('garantir : hors connexion, l\'application s\'ouvre sans bloquer', async () => {
  const api = { dernier: () => Promise.reject(new Error('Failed to fetch')), accepter: () => {}, deconnecter: () => {}, horsLigne: () => true };
  assert.equal(await K.garantir({}, api, null), null);
});

test('migration : RLS, lecture et ajout seulement, date posée par le serveur, export complété', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0013_consentements.sql'), 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select, insert on public\.consentements to authenticated/);
  assert.equal(/for (update|delete)/.test(sql), false);
  assert.match(sql, /new\.accepte_le := now\(\)/);
  assert.match(sql, /'consentements', coalesce/);
});
