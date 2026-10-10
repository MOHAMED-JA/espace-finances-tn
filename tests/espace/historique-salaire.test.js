'use strict';
/* Historique du salaire : salaire en vigueur selon la date d'effet, impôt de l'année mois par mois (primes comprises),
   hausses futures dans la capacité d'emprunt et le voyage dans le temps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OS = require('../../public/espace/js/orbite-systeme.js');

const MAINTENANT = new Date(2026, 9, 9);
const CAL = [0, 0, 1, 0, 0, 1, 0, 0, 1.5, 0, 0, 1.5];
function profil(historique, extra) {
  return Object.assign(OC.profilParDefaut(), { dateNaissance: '1990-01-01', montant: 4000, sens: 'brut', nombreSalaires: 17, calendrierPrimes: CAL,
    chefDeFamille: true, baseBanque: 'brut', historiqueSalaire: historique }, extra || {});
}
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const HAUSSE_JUILLET = [{ montant: 4000, sens: 'brut', mois: 0, annee: 0 }, { montant: 4400, sens: 'brut', mois: 7, annee: 2026 }];

test('salaire en vigueur : la dernière date d\'effet passée, même si le profil n\'est pas encore à jour', () => {
  const sy = OC.synthese(profil(HAUSSE_JUILLET), {}, MAINTENANT);
  assert.equal(sy.salaire.brutMensuel, 4400);
  assert.equal(sy.historique.depuis, 'juillet 2026');
  proche(sy.historique.hausse, 0.1, 1e-9);
  assert.equal(sy.historique.brutPrecedent, 4000);
  const p = OC.normaliser(profil(HAUSSE_JUILLET));
  assert.equal(OC.appliquerHistorique(p, new Date(2026, 5, 15)).change, false, 'en juin, 4 000 DT');
  const a = OC.appliquerHistorique(p, MAINTENANT);
  assert.equal(a.change, true);
  assert.equal(a.profil.montant, 4400);
});

test('impôt de l\'année mois par mois : chaque mois et chaque prime au salaire de son mois', () => {
  const sy = OC.synthese(profil(HAUSSE_JUILLET), {}, MAINTENANT);
  const sa = sy.salaireAnnee;
  /* Janvier-juin à 4 000 (6 mois + primes de mars et juin), juillet-décembre à 4 400 (6 mois + 1,5 + 1,5). */
  proche(sa.brutAnnuel, 4000 * 8 + 4400 * 9);
  const s4000 = OC.synthese(profil([]), {}, MAINTENANT).salaire, s4400 = OC.synthese(profil([], { montant: 4400 }), {}, MAINTENANT).salaire;
  assert.ok(sa.irpp > s4000.irpp && sa.irpp < s4400.irpp, 'impôt entre les deux salaires');
  /* Impôt qui reste à retenir d'octobre à décembre : au salaire de 4 400 DT. */
  const r = OC.impotRestantAnnee(sy, MAINTENANT);
  assert.equal(r.moisParMois, true);
  proche(r.montant, 3 * s4400.impotMois + 1.5 * s4400.impotParVersement, 0.01);
  assert.equal(OC.synthese(profil([]), {}, MAINTENANT).salaireAnnee, null, 'sans historique : calcul habituel');
});

test('hausse future : rien ne change aujourd\'hui, la capacité et le net augmentent à sa date', () => {
  const hist = HAUSSE_JUILLET.concat([{ montant: 4800, sens: 'brut', mois: 1, annee: 2027 }]);
  const sy = OC.synthese(profil(hist), {}, MAINTENANT);
  assert.equal(sy.salaire.brutMensuel, 4400);
  assert.equal(sy.historique.futurs.length, 1);
  assert.equal(sy.historique.futurs[0].mois, 3);
  assert.equal(sy.historique.futurs[0].date, 'janvier 2027');
  const pal = sy.capacite.brut.paliers[0];
  assert.equal(pal.date, 'janvier 2027');
  assert.equal(pal.hausse, true);
  assert.equal(OC.evenementEtape(pal), 'hausse de salaire');
  proche(pal.mensualiteMax, 0.4 * (4800 * 17 / 12));
  const m = OS.modele(sy);
  const j = m.jalons.filter((x) => x.genre === 'salaire')[0];
  assert.equal(j.t, 3);
  assert.ok(/Hausse de salaire : 4 800 DT brut/.test(j.lib), j.lib);
  proche(m.etat(0).netMensuel, sy.salaire.netMensuel);
  proche(m.etat(3).netMensuel, sy.historique.futurs[0].netMensuel);
  assert.ok(m.etat(3).capacite > m.etat(0).capacite);
});

test('historique normalisé : trié par date, entrées vides retirées, salaire d\'avant en premier', () => {
  const p = OC.normaliser(profil([{ montant: 4800, mois: 1, annee: 2027 }, { montant: 0, mois: 3, annee: 2026 }, { montant: 4000, mois: 0, annee: 0 }, { montant: 4400, mois: 7, annee: 2026 }]));
  assert.deepEqual(p.historiqueSalaire.map((h) => h.montant), [4000, 4400, 4800]);
  assert.equal(p.historiqueSalaire[0].sens, 'brut');
});
