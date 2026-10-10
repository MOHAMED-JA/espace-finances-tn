'use strict';
/* Pensions de retraite : CNAM 4 %, abattement 25 % (2026) puis 30 / 40 / 50 % (LF 2026), pas de CSS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CP = require('../../public/moteurs/salaire/pension.js');
const MF = require('../../public/moteurs/vie/moteur-fiscal.js');
const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('pension de 2 000 DT brut, chef de famille, 2026 : calcul détaillé', () => {
  const r = CP.calculerDepuisBrut({ brutMensuel: 2000, chefDeFamille: true, annee: 2026 });
  proche(r.annuel.cnam, 960);
  proche(r.annuel.abattement, 23040 * 0.25);
  proche(r.annuel.imposable, 17280 - 300);
  proche(r.annuel.irpp, 750 + 6980 * 0.25);
  proche(r.mensuel.net, (24000 - 960 - 2495) / 12);
});

test('abattement : 25 % jusqu\'en 2026, 30 / 40 / 50 % ensuite, 80 % pour une pension étrangère', () => {
  assert.deepEqual([2025, 2026, 2027, 2028, 2029, 2035].map((a) => CP.tauxAbattement(a)), [0.25, 0.25, 0.30, 0.40, 0.50, 0.50]);
  assert.equal(CP.tauxAbattement(2026, true), 0.80);
  const p = CP.projection({ brutMensuel: 2000, chefDeFamille: true }, 2026, 2029);
  assert.ok(p[1].netMensuel > p[0].netMensuel && p[2].netMensuel > p[1].netMensuel && p[3].netMensuel > p[2].netMensuel, 'le net augmente chaque année');
  proche(p[3].netMensuel - p[0].netMensuel, (2495 - (750 + 1220 * 0.25)) / 12, 0.01);
});

test('net → brut : retrouve la pension brute au millime', () => {
  const r = CP.calculerDepuisNet({ netMensuel: 1712.083, chefDeFamille: true, annee: 2026 });
  proche(r.mensuel.brut, 2000, 0.002);
  const z = CP.calculerDepuisBrut({ brutMensuel: 400, annee: 2026 });
  proche(z.annuel.irpp, 0);
});

test('assurance vie d\'un retraité : abattement de 25 % à la place des frais professionnels (identique à AgentPro)', () => {
  const r = MF.simuler({ revenu: 30000, chef: true, investissementAv: 3000, abattementTaux: 0.25 });
  proche(r.deductions, 7800);
  proche(r.impotAvant, 3910);
  proche(r.economie, 860);
  const s = MF.simuler({ revenu: 30000, chef: true, investissementAv: 3000 });
  proche(s.deductions, 2300, 0.001);
});

const OC = require('../../public/espace/js/orbite-calcul.js');
const OI = require('../../public/espace/js/orbite-intelligence.js');
const SCN = require('../../public/espace/js/scenarios-calcul.js');
const OS = require('../../public/espace/js/orbite-systeme.js');
const M = new Date(2026, 9, 10);
const RETRAITE = { activite: 'retraite', caissePension: 'cnrps', montant: 2000, sens: 'brut', chefDeFamille: true, dateNaissance: '1960-03-01', nombreSalaires: 17, baseBanque: 'net' };

test('profil retraité : la synthèse lit la pension (12 versements, pas de CSS, pas de primes)', () => {
  const sy = OC.synthese(RETRAITE, {}, M);
  proche(sy.salaire.netMensuel, (24000 - 960 - 2495) / 12);
  assert.equal(sy.salaire.versements.nombre, 12);
  assert.equal(sy.salaire.css, 0);
  assert.deepEqual(OC.calendrierPrimes(sy.profil), Array(12).fill(0));
  const net = OC.synthese({ ...RETRAITE, sens: 'net', montant: 1712.083 }, {}, M);
  proche(net.salaire.brutMensuel, 2000, 0.002);
  assert.equal(OC.normaliser({ activite: 'n\'importe quoi' }).activite, 'salarie');
});

test('loi de finances 2026 : trois hausses du net (janvier 2027, 2028, 2029), dans Mon orbite et la capacité', () => {
  const sy = OC.synthese(RETRAITE, {}, M);
  assert.deepEqual(sy.futursRevenu.map((f) => [f.date, f.tauxAbattement]), [['janvier 2027', 0.3], ['janvier 2028', 0.4], ['janvier 2029', 0.5]]);
  proche(sy.futursRevenu[2].netMensuel, CP.calculerDepuisBrut({ brutMensuel: 2000, chefDeFamille: true, annee: 2029 }).mensuel.net);
  const m = OS.modele(sy);
  const j = m.jalons.filter((x) => x.genre === 'salaire');
  assert.equal(j.length, 3);
  assert.equal(j[0].lib, 'Loi de finances : abattement de 30 % sur votre pension');
  proche(m.etat(40).netMensuel, sy.futursRevenu[2].netMensuel);
  const etr = OC.synthese({ ...RETRAITE, pensionEtrangere: true }, {}, M);
  assert.equal(etr.futursRevenu.length, 0, 'pension étrangère : 80 % dès aujourd\'hui');
});

test('assurance vie et « Et si… » d\'un retraité : abattement de l\'année', () => {
  const sy = OC.synthese(RETRAITE, {}, M);
  const e = OI.optimiseurFiscal ? OI.optimiseurFiscal(sy) : null;
  assert.ok(!e || e.impotAvant === undefined || e.impotAvant >= 0);
  const r = MF.simuler({ revenu: sy.salaire.revenuFiscal, chef: true, investissementAv: 3000, abattementTaux: 0.25 });
  proche(r.impotAvant, 2495);
  const c = SCN.calculer(RETRAITE, null, M);
  proche(c.mois[0].netMensuel, sy.salaire.netMensuel);
  proche(c.mois[40].netMensuel, sy.futursRevenu[2].netMensuel);
  const a = c.annees.map((x) => Math.round(x.impotRetenu));
  assert.ok(a[0] > a[1] && a[1] > a[2] && a[2] > a[3], 'impôt de l\'année en baisse de 2026 à 2029 : ' + a.join(', '));
});
