'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../public/espace/js/abonnement-calcul.js');

const FORMULES = [
  { cle: 'annuel', libelle: 'Annuel', mois: 12, prix_millimes: 79900 },
  { cle: 'mensuel', libelle: 'Mensuel', mois: 1, prix_millimes: 9900 },
  { cle: 'semestriel', libelle: 'Semestriel', mois: 6, prix_millimes: 49900 }
];

test('offres : triées par durée, prix par mois, réduction et mois offerts', () => {
  const o = A.offres(FORMULES);
  assert.deepEqual(o.map((x) => x.cle), ['mensuel', 'semestriel', 'annuel']);
  assert.equal(o[0].reductionPct, 0);
  assert.equal(o[1].prixMois, 8.317);
  assert.equal(o[1].reductionPct, 16);
  assert.equal(o[2].prixMois, 6.658);
  assert.equal(o[2].reductionPct, 33);
  assert.equal(o[2].economie, 38.9);
  assert.equal(o[2].moisOfferts, 3);
  assert.equal(o[2].recommandee, true);
  assert.equal(o[0].recommandee, false);
  assert.deepEqual(A.offres([]), []);
});

test('jours restants : arrondis au jour supérieur, jamais négatifs', () => {
  const n = '2026-10-08T12:00:00Z';
  assert.equal(A.joursRestants('2026-10-11T12:00:00Z', n), 3);
  assert.equal(A.joursRestants('2026-10-08T13:00:00Z', n), 1);
  assert.equal(A.joursRestants('2026-10-07T12:00:00Z', n), 0);
  assert.equal(A.joursRestants(null, n), 0);
});

test('résumé : essai, dernier jour, abonné, offert, expiré, inconnu', () => {
  const n = '2026-10-08T12:00:00Z';
  const essai = A.resume({ etat: 'essai', essai_fin: '2026-10-10T12:00:00Z', maintenant: n });
  assert.equal(essai.libelle, 'Essai gratuit · 2 jours restants');
  assert.equal(essai.pastille, true);
  assert.equal(essai.bloque, false);
  assert.equal(A.resume({ etat: 'essai', essai_fin: '2026-10-08T20:00:00Z', maintenant: n }).urgent, true);
  const actif = A.resume({ etat: 'actif', fin: '2027-04-08T12:00:00Z', maintenant: n });
  assert.equal(actif.libelle, 'Abonné');
  assert.equal(actif.pastille, false);
  assert.equal(A.resume({ etat: 'actif', fin: '2026-10-12T12:00:00Z', maintenant: n }).pastille, true);
  assert.equal(A.resume({ etat: 'offert' }).bloque, false);
  assert.equal(A.resume({ etat: 'expire' }).bloque, true);
  assert.equal(A.resume(null).etat, 'inconnu');
  assert.equal(A.resume({ etat: 'pirate' }).bloque, false, 'état inconnu : on ne bloque pas par erreur');
});

test('vues : à l\'expiration, seuls le profil, le compte et l\'abonnement restent ouverts', () => {
  const exp = { etat: 'expire' };
  assert.equal(A.vueAutorisee('salaire', exp), false);
  assert.equal(A.vueAutorisee('orbite', exp), false);
  assert.equal(A.vueAutorisee('profil', exp), true);
  assert.equal(A.vueAutorisee('abonnement', exp), true);
  assert.equal(A.vueAutorisee('credit', { etat: 'essai', essai_fin: '2999-01-01T00:00:00Z' }), true);
});

test('adresse de paiement : https ou chemin du site, rien d\'autre', () => {
  assert.equal(A.adressePaiementSure('https://pay.konnect.network/p/1'), 'https://pay.konnect.network/p/1');
  assert.equal(A.adressePaiementSure('/espace/paiement-test.html?ref=X'), '/espace/paiement-test.html?ref=X');
  assert.equal(A.adressePaiementSure('javascript:alert(1)'), null);
  assert.equal(A.adressePaiementSure('//evil.example'), null);
  assert.equal(A.adressePaiementSure('http://insecure.example'), null);
  assert.ok(A.REFERENCE.test('ORB-20261008-AB12CD34'));
});
