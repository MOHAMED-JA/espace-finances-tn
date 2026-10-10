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
