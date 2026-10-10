'use strict';
/* Impôt restant à retenir sur les paies d'ici le 31 décembre : détail et contrats déjà déduits (ou non) par l'employeur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OI = require('../../public/espace/js/orbite-intelligence.js');
const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const M = new Date(2026, 9, 10);
const P = { montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, dateNaissance: '1992-09-09', calendrierPrimes: [0, 0, 1, 0, 0, 1, 0, 0, 1.5, 0, 0, 1.5],
  contrats: [{ type: 'av', versementMensuel: 100, moisDebut: 12, anneeDebut: 2021 }] };

test('3 paies + 1,5 salaire de prime, moins la part de l\'assurance vie déjà déduite', () => {
  const f = OI.optimiseurFiscal(OC.synthese(P, {}, M), M), d = f.paie.detail;
  assert.equal(f.paie.moisRestants, 3);
  assert.equal(f.paie.primesRestantes, 1.5);
  proche(d.avantPart, 3 * d.impotMois + 1.5 * d.impotParVersement);
  proche(d.avantPart, 4566.355);
  assert.ok(d.appliquee && d.ecoActuelle > 400 && d.ecoActuelle < 500);
  proche(f.paie.impotRestant, d.avantPart * (1 - d.ecoActuelle / d.impotAn));
  proche(f.paie.impotRestant, 4443.219);
  proche(f.paie.recuperable + f.paie.declaration, f.gainPossible, 0.01);
});

test('employeur qui ne déduit pas l\'assurance vie : impôt restant entier', () => {
  const f = OI.optimiseurFiscal(OC.synthese({ ...P, avPaie: false }, {}, M), M);
  assert.equal(f.paie.detail.appliquee, false);
  proche(f.paie.impotRestant, 4566.355);
  assert.equal(OC.normaliser({}).avPaie, true, 'oui par défaut');
});
