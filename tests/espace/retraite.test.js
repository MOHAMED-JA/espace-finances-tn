'use strict';
/* Retraite CNSS / CNRPS (lot 4) : règles validées, cas de la maquette, départ anticipé, durées minimales, plafond, écart. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const R = require('../../public/espace/js/retraite-calcul.js');

const M = new Date(2026, 9, 11);
const proche = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
function leila(extra) {
  return OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 5500, sens: 'brut', periode: 'mensuel', nombreSalaires: 12, chefDeFamille: true, enfants: 2,
    dateNaissance: '1984-03-10', debutCarriere: '2008-09-01' }, extra || {}));
}
const sy = (p) => OC.synthese(p, {}, M);

test('taux CNSS : 40 % à 40 trimestres, +0,5 % par trimestre, 80 % au plus', () => {
  assert.equal(R.tauxCnss(40), 40);
  assert.equal(R.tauxCnss(60), 50);
  assert.equal(R.tauxCnss(120), 80);
  assert.equal(R.tauxCnss(160), 80);
});

test('taux CNRPS : 2 % · 3 % · 2 % par an, 35 % à 15 ans, 90 % à 40 ans', () => {
  assert.equal(R.tauxCnrps(10), 20);
  assert.equal(R.tauxCnrps(15), 35);
  assert.equal(R.tauxCnrps(20), 50);
  assert.equal(R.tauxCnrps(40), 90);
  assert.equal(R.tauxCnrps(45), 90);
});

test('CNSS à 60 ans (maquette) : 142 trimestres, 80 %, plafond 6 SMIG, écart et épargne', () => {
  const p = leila(), e = R.estimer(p, sy(p), { age: 60, maintenant: M });
  assert.equal(e.etat, 'ok');
  assert.equal(e.caisse, 'cnss');
  assert.equal(e.trimestres, 142);
  assert.equal(e.taux, 80);
  proche(e.reference, 6 * 554.736, 0.001);
  proche(e.depassePlafond, 5500 - 6 * 554.736, 0.001);
  proche(e.brut, 2662.733, 0.01);
  proche(e.net, 2388.8, 0.2);
  proche(e.cible, e.netActuel * 0.8, 1e-9);
  proche(e.ecart, 509.4, 0.5);
  proche(e.capital, R.capitalRente(e.ecart, 20, 2), 1e-6);
  proche(e.mensuel, 403, 1);
  assert.equal(e.depart.getFullYear(), 2044);
  assert.equal(e.tauxMaxLe.getFullYear(), 2038);
});

test('CNSS anticipé : −2 points par année avant 60 ans, refusé sans 360 mois', () => {
  const p = leila(), e = R.estimer(p, sy(p), { age: 55, maintenant: M });
  assert.equal(e.etat, 'ok');
  assert.equal(e.reduction, 10);
  assert.equal(e.taux, 70);
  const tard = leila({ debutCarriere: '2015-01-01' }), f = R.estimer(tard, sy(tard), { age: 55, maintenant: M });
  assert.equal(f.etat, 'anticipe-ferme');
  assert.equal(f.brut, 0);
});

test('durées minimales : 120 mois à la CNSS, 15 ans à la CNRPS ; années sans cotisation retirées', () => {
  const p = leila({ dateNaissance: '1970-01-01', debutCarriere: '2022-01-01' }), e = R.estimer(p, sy(p), { age: 60, maintenant: M });
  assert.equal(e.etat, 'insuffisant');
  const q = leila({ secteur: 'public', dateNaissance: '1970-01-01', debutCarriere: '2020-01-01' }), f = R.estimer(q, sy(q), { age: 62, maintenant: M });
  assert.equal(f.etat, 'insuffisant');
  const s = leila({ anneesSansCotisation: 5 }), g = R.estimer(s, sy(s), { age: 60, maintenant: M });
  assert.equal(g.trimestres, 142 - 20);
});

test('CNRPS : 62 ans, dernière rémunération, pas de plafond 6 SMIG, pas d\'écart pour la maquette', () => {
  const p = leila({ secteur: 'public' }), e = R.estimer(p, sy(p), { age: 62, maintenant: M });
  assert.equal(e.caisse, 'cnrps');
  proche(e.annees, 37.5, 1e-9);
  proche(e.taux, 85, 1e-9);
  proche(e.brut, 4675, 0.01);
  assert.equal(e.depassePlafond, 0);
  assert.equal(e.ecart, 0);
  assert.equal(e.mensuel, 0);
  assert.deepEqual([R.bornes(p, M).min, R.bornes(p, M).max, R.bornes(p, M).legal], [62, 65, 62]);
});

test('salaire net converti, primes comprises dans le brut moyen ; hausse réelle relève la référence', () => {
  const p = leila({ montant: 2000, nombreSalaires: 14 }), e = R.estimer(p, sy(p), { age: 60, maintenant: M });
  proche(e.reference, 2000 * 14 / 12, 0.01);
  const h = R.estimer(p, sy(p), { age: 60, maintenant: M, hausseReelle: 0.01 });
  assert.ok(h.reference > e.reference);
  const n = leila({ montant: 1500, sens: 'net' }), f = R.estimer(n, sy(n), { age: 60, maintenant: M });
  assert.ok(f.reference > 1500, 'référence en brut');
});

test('minimum de pension : 2/3 du SMIG', () => {
  const p = leila({ montant: 400 }), e = R.estimer(p, sy(p), { age: 60, maintenant: M });
  assert.ok(e.auMinimum);
  proche(e.brut, 554.736 * 2 / 3, 1e-6);
});

test('états : retraité, date de naissance manquante, carrière inconnue ; bornes sans âge passé', () => {
  assert.equal(R.estimer(leila({ activite: 'retraite' }), sy(leila()), { maintenant: M }).etat, 'retraite');
  assert.equal(R.estimer(leila({ dateNaissance: '' }), sy(leila()), { maintenant: M }).etat, 'naissance');
  assert.equal(R.estimer(leila({ debutCarriere: '', dateEmbauche: '' }), sy(leila()), { maintenant: M }).etat, 'carriere');
  const emb = leila({ debutCarriere: '', dateEmbauche: '2010-01-01' }), e = R.estimer(emb, sy(emb), { age: 60, maintenant: M });
  assert.equal(e.debutConnu, false);
  assert.equal(e.etat, 'ok');
  const vieux = leila({ dateNaissance: '1968-06-01' }), b = R.bornes(vieux, M);
  assert.equal(b.min, 59);
  assert.equal(b.defaut, 60);
  assert.equal(R.courbe(vieux, sy(vieux), { maintenant: M }).length, 7);
});
