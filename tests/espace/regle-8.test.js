'use strict';
/* Règle des 8 % (loi n° 2024-41 du 2 août 2024), vérifiée sur un vrai tableau d'amortissement de banque :
   crédit immobilier de 270 000 DT à 4,5 % (mars 2023), remboursement partiel de 150 000 DT en janvier 2024,
   mensualité 875,894 DT jusqu'à l'échéance 36 ; taux divisé par deux à l'échéance 37 (mars 2026), mensualité
   765,003 DT, même date de fin (janvier 2039). */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OS = require('../../public/espace/js/orbite-systeme.js');

const MAINTENANT = new Date(2026, 9, 9);
const IMMO = { libelle: 'Crédit immobilier', type: 'immo', mensualite: 765.003, tauxPct: 2.25, moisDebut: 2, anneeDebut: 2023, dureeMois: 191, tauxType: 'fixe', reductionMois: 3, reductionAnnee: 2026 };
function profil(credits) {
  return Object.assign(OC.profilParDefaut(), { dateNaissance: '1990-01-01', montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, baseBanque: 'brut', credits });
}
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const regle = (c) => OC.reductionsTaux(OC.normaliser(profil([c])).credits[0], MAINTENANT);

test('taux déjà réduit en mars 2026 : prochain contrôle en mars 2029, puis réductions en septembre 2031 et janvier 2038', () => {
  const r = regle(IMMO);
  assert.equal(r.applicable, true);
  assert.equal(r.derniere.date, 'mars 2026');
  assert.equal(r.prochainControle.date, 'mars 2029');
  assert.equal(r.prochainControle.ok, false, 'sous le seuil de 8 %');
  assert.deepEqual(r.reductions.map((x) => [x.echeance, x.date, x.tauxPct]), [[103, 'septembre 2031', 1.125], [179, 'janvier 2038', 0.5625]]);
  proche(r.reductions[0].mensualite, 734.081);
  assert.ok(r.reductions[0].ratio > 0.08 && r.reductions[0].ratio < 0.081);
  assert.equal(r.possibleDepuis, null);
});

test('reconstitution du tableau de la banque : ratio et mensualité de l\'échéance 37', () => {
  /* Sans réduction saisie, avec la mensualité et le taux d'avant (à la veille de l'échéance 37). */
  const avant = { ...IMMO, mensualite: 875.894, tauxPct: 4.5, reductionMois: 0, reductionAnnee: 0 };
  const r = OC.reductionsTaux(OC.normaliser(profil([avant])).credits[0], new Date(2026, 1, 15));
  const x = r.reductions[0];
  assert.equal(x.date, 'mars 2026');
  assert.equal(x.tauxPct, 2.25);
  proche(x.mensualite, 765.003, 0.002);
});

test('réduction non demandée : « possible depuis » et appliquée dès l\'échéance suivante', () => {
  const r = regle({ ...IMMO, mensualite: 875.894, tauxPct: 4.5, reductionMois: 0, reductionAnnee: 0 });
  assert.equal(r.possibleDepuis.date, 'mars 2026');
  assert.equal(r.reductions[0].date, 'novembre 2026');
});

test('conditions : taux variable, 84 mois ou moins, type ou dates non précisés', () => {
  assert.equal(regle({ ...IMMO, tauxType: 'variable' }).motif, 'variable');
  assert.equal(regle({ ...IMMO, dureeMois: 84 }).motif, 'duree');
  assert.equal(regle({ ...IMMO, tauxType: '' }).motif, 'type');
  assert.equal(regle({ ...IMMO, tauxType: '' }).reductions.length, 0, 'aucun gain promis sans type de taux');
  assert.equal(regle({ ...IMMO, moisDebut: 0, anneeDebut: 0, dureeMois: 0 }).motif, 'dates');
});

test('capacité et calendrier de la marge suivent les baisses de mensualité', () => {
  const sy = OC.synthese(profil([IMMO,
    { libelle: 'Crédit consommation', type: 'conso', mensualite: 695.008, tauxPct: 4.5, moisDebut: 3, anneeDebut: 2025, dureeMois: 84, tauxType: 'fixe' }]), {}, MAINTENANT);
  const pal = sy.capacite.brut.paliers;
  assert.equal(pal[0].date, 'septembre 2031');
  assert.deepEqual(pal[0].reduits, ['Crédit immobilier']);
  assert.equal(OC.evenementEtape(pal[0]), 'réduction de taux du crédit immobilier');
  proche(pal[0].charges, 734.081 + 695.008);
  assert.equal(OC.evenementEtape(pal[1]), 'fin du crédit consommation');
  assert.equal(OC.evenementEtape(pal[1], true), 'ki yekmel crédit consommation');
  assert.ok(!pal.some((x) => x.date === 'janvier 2038'), 'une réduction de moins de 10 DT ne fait pas une étape');
  assert.equal(sy.tauxImmo.tauxPct, 4.5, 'futurs crédits : taux d\'origine (4,5 %), pas le taux réduit');
});

test('Mon orbite : jalons de réduction, mensualité, capital et intérêts au fil du temps', () => {
  const m = OS.modele(OC.synthese(profil([IMMO]), {}, MAINTENANT));
  const j = m.jalons.filter((x) => x.genre === 'reduction');
  assert.deepEqual(j.map((x) => [x.t, x.lib]), [[59, 'Réduction de taux du crédit immobilier : 1,125 %'], [135, 'Réduction de taux du crédit immobilier : 0,5625 %']]);
  proche(j[0].gain, 765.003 - 734.081);
  assert.equal(m.dateTexte(59), 'septembre 2031');
  const e0 = m.etat(0).satellites['credit-0'], e59 = m.etat(59).satellites['credit-0'];
  proche(e0.mensualite, 765.003);
  assert.equal(e0.prochaine.date, 'septembre 2031');
  proche(e59.mensualite, 734.081);
  assert.equal(e59.tauxPct, 1.125);
  proche(m.etat(59).charges, 734.081);
  /* Capital restant continu au passage de la réduction. */
  const k58 = m.etat(58).satellites['credit-0'].capitalRestant;
  proche(e59.capitalRestant, k58 * (1 + 0.01125 / 12) - 734.081, 0.05);
  assert.ok(e0.interets < 765.003 * 147 - e0.capitalRestant, 'les réductions baissent les intérêts restants');
});
