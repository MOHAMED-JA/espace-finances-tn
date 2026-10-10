'use strict';
/* Scénarios « Et si… » : vérifiés sur le profil de l'utilisateur (4 000 DT brut, 17 salaires, crédits auto, mariage,
   immobilier réduit par la règle des 8 %, assurance vie de 100 DT), au 10 octobre 2026. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const SC = require('../../public/espace/js/scenarios-calcul.js');

const M = new Date(2026, 9, 10);
const P = { dateNaissance: '1990-01-01', montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, situation: 'marie', baseBanque: 'brut', revenuBanque: 'annuel',
  credits: [
    { libelle: 'Crédit auto', type: 'auto', mensualite: 695.008, tauxPct: 4.5, moisRestants: 65, tauxType: 'fixe' },
    { libelle: 'Crédit mariage', type: 'conso', mensualite: 497.93, tauxPct: 2, moisRestants: 68, tauxType: 'fixe' },
    { libelle: 'Crédit immobilier', type: 'immo', mensualite: 765.003, tauxPct: 2.25, moisDebut: 2, anneeDebut: 2023, dureeMois: 191, tauxType: 'fixe', reductionMois: 3, reductionAnnee: 2026 }],
  contrats: [{ type: 'av', versementMensuel: 100, moisDebut: 12, anneeDebut: 2021 }] };
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const terrain = (mois, annee) => ({ nom: 'Terrain', changements: [{ type: 'credit', libelle: 'Crédit terrain', typeCredit: 'immo', capital: 90000, tauxPct: 4.5, dureeMois: 180, mois, annee }] });

test('référence : identique à la synthèse d\'Orbite, crédits qui finissent et réduction de taux', () => {
  const r = SC.calculer(P, null, M), sy = OC.synthese(P, {}, M);
  proche(r.mois[0].netMensuel, sy.salaire.netMensuel);
  proche(r.mois[0].marge, sy.capacite.brut.mensualiteMax);
  proche(r.mois[0].charges, 695.008 + 497.93 + 765.003);
  assert.equal(r.mois[59].date, 'septembre 2031');
  proche(r.mois[59].charges, 695.008 + 497.93 + 734.081);
  proche(r.mois[120].charges, 734.081);
  assert.deepEqual(r.evenements.map((e) => e.date + ' ' + e.lib), ['mars 2032 Fin du crédit auto', 'juin 2032 Fin du crédit mariage']);
  assert.equal(r.annees[0].annee, 2026);
  assert.ok(r.annees[0].avantageFiscal > 0, 'assurance vie : avantage fiscal compté');
});

test('nouveau crédit : refus probable en 2028, accepté en 2032, intérêts échéance par échéance', () => {
  const c = SC.comparer(P, [terrain(6, 2028), terrain(7, 2032)], M);
  const [a, b] = c.scenarios, mens = OC.mensualitePourCapital(90000, 4.5, 180);
  assert.equal(a.alertes[0].genre, 'endettement');
  assert.ok(a.alertes[0].endettement > 0.46 && a.alertes[0].endettement < 0.48);
  assert.equal(b.alertes.length, 0);
  proche(a.mois[20].charges - c.reference.mois[20].charges, mens);
  /* Intérêts des 100 premières échéances (juin 2028 → septembre 2036). */
  let k = 90000, i100 = 0; for (let e = 0; e < 100; e++) { const it = k * 0.045 / 12; i100 += it; k -= mens - it; }
  proche(a.totaux.interetsNouveaux, i100, 0.001);
  proche(a.ecart.reste, -(mens * 100), 0.01);
});

test('salaire, épargne et enfant : historique du salaire, capital de l\'assurance vie, impôt de l\'année', () => {
  const s = { nom: 'C', changements: [
    { type: 'salaire', montant: 4600, sens: 'brut', periode: 'mensuel', mois: 1, annee: 2027 },
    { type: 'epargne', produit: 'av', versementMensuel: 300, mois: 1, annee: 2027 },
    { type: 'vie', evenement: 'enfant', mois: 5, annee: 2028 }] };
  const r = SC.calculer(P, s, M), ref = SC.calculer(P, null, M);
  const s4600 = OC.salaire(OC.normaliser(Object.assign({}, P, { montant: 4600 })));
  proche(r.mois[3].netMensuel, s4600.netMensuel);
  proche(r.mois[2].netMensuel, ref.mois[2].netMensuel);
  assert.ok(r.mois[19].netMensuel > r.mois[18].netMensuel, 'enfant : déduction en mai 2028');
  /* Assurance vie : 300 DT par mois depuis janvier 2027, à 5 % par an. */
  const i = 0.05 / 12, n = 120 - 3 + 1;
  proche(r.mois[120].capitalEpargne - ref.mois[120].capitalEpargne, 300 * (Math.pow(1 + i, n) - 1) / i, 0.01);
  assert.equal(r.annees[1].versementsAv, 12 * 400);
  assert.ok(r.annees[1].avantageFiscal > ref.annees[1].avantageFiscal);
  proche(r.annees[1].impotNet, r.annees[1].impotRetenu - r.annees[1].avantageFiscal);
});

test('remboursement anticipé et mariage', () => {
  const r = SC.calculer(P, { nom: 'R', changements: [{ type: 'vie', evenement: 'rembourser', credit: 0, mois: 1, annee: 2028 }] }, M);
  const ref = SC.calculer(P, null, M);
  proche(r.mois[15].charges, ref.mois[15].charges - 695.008);
  assert.equal(r.soldes.length, 1);
  proche(r.soldes[0].montant, OC.capitalPourMensualite(695.008, 4.5, 65 - 15), 0.01);
  assert.ok(!r.evenements.some((e) => e.lib === 'Fin du crédit auto'), 'plus de fin de crédit après un remboursement');
  const celib = Object.assign({}, P, { chefDeFamille: false, situation: 'celibataire' });
  const m = SC.calculer(celib, { nom: 'M', changements: [{ type: 'vie', evenement: 'mariage', mois: 6, annee: 2027 }] }, M);
  assert.ok(m.mois[8].netMensuel > m.mois[7].netMensuel, 'mariage : chef de famille');
});

test('normalisation : bornes, types inconnus, 3 scénarios et 8 changements au plus, conservés dans le profil', () => {
  assert.equal(OC.normaliserChangement({ type: 'inconnu' }), null);
  assert.equal(OC.normaliserChangement({ type: 'credit', capital: -5, dureeMois: 12 }), null);
  const c = OC.normaliserChangement({ type: 'credit', libelle: '<b>x</b>', capital: 1e9, dureeMois: 999, tauxPct: 80, mois: 15, annee: 3000 });
  assert.deepEqual([c.capital, c.dureeMois, c.tauxPct, c.mois, c.annee], [5e6, 360, 30, 12, 2100]);
  assert.ok(!/[<>]/.test(c.libelle));
  const beaucoup = Array.from({ length: 12 }, () => ({ type: 'epargne', versementMensuel: 50, mois: 1, annee: 2027 }));
  const p = OC.normaliser({ scenarios: [{ nom: 'A', changements: beaucoup }, {}, {}, {}, {}] });
  assert.equal(p.scenarios.length, 3);
  assert.equal(p.scenarios[0].changements.length, 8);
  assert.equal(p.scenarios[1].nom, 'Scénario B');
});
