'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OS = require('../../public/espace/js/orbite-systeme.js');

const MAINTENANT = new Date(2026, 9, 9);
function profil(extra) {
  return Object.assign(OC.profilParDefaut(), {
    dateNaissance: '1990-01-01', montant: 4000, sens: 'brut', secteur: 'prive', nombreSalaires: 17, chefDeFamille: true, baseBanque: 'brut',
    credits: [
      { libelle: 'Crédit immobilier', type: 'immo', mensualite: 875.894, tauxPct: 4.5, moisRestants: 148 },
      { libelle: 'Crédit auto', type: 'auto', mensualite: 695.008, tauxPct: 4.5, moisRestants: 65 },
      { libelle: 'Crédit mariage', type: 'autre', mensualite: 497.93, tauxPct: 2, moisRestants: 68 }
    ],
    contrats: [{ type: 'av', versementMensuel: 100, moisDebut: 12, anneeDebut: 2021 }]
  }, extra || {});
}
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('satellites : crédits du plus proche de sa fin au plus lointain, puis contrat, puis place libre', () => {
  const m = OS.modele(OC.synthese(profil(), {}, MAINTENANT));
  assert.deepEqual(m.satellites.map((s) => s.nom), ['Crédit auto', 'Crédit mariage', 'Crédit immobilier', 'Assurance vie', 'Un projet ?']);
  assert.deepEqual(m.satellites.map((s) => s.genre), ['credit', 'credit', 'credit', 'vie', 'vide']);
  const auto = m.satellites[0];
  assert.equal(auto.fin, 'mars 2032');
  assert.equal(auto.derniere, 'février 2032');
  assert.equal(m.satellites[3].depuis, 'décembre 2021');
});

test('jalons et horizon : durée fiscale de l\'assurance vie, puis fin de chaque crédit', () => {
  const m = OS.modele(OC.synthese(profil(), {}, MAINTENANT));
  assert.deepEqual(m.jalons.map((j) => j.t), [38, 65, 68, 148]);
  assert.equal(m.jalons[0].lib, 'Assurance vie : 8 ans, avantage fiscal acquis');
  assert.equal(m.jalons[1].lib, 'Fin du crédit auto');
  assert.equal(m.horizon, 148);
  assert.equal(m.dateTexte(38), 'décembre 2029');
  assert.equal(m.ecart(0), "Aujourd'hui");
  assert.equal(m.ecart(65), 'Dans 5 ans et 5 mois');
  assert.equal(m.ecart(12), 'Dans 1 an');
});

test('capacité au fil du temps : identique aux paliers du moteur (règle de la banque sur le brut)', () => {
  const sy = OC.synthese(profil(), {}, MAINTENANT);
  const m = OS.modele(sy);
  proche(m.etat(0).capacite, sy.capacite.brut.mensualiteMax);
  proche(m.etat(0).capacite, 197.835);
  proche(m.etat(64).capacite, 197.835);
  proche(m.etat(65).capacite, 892.843);
  proche(m.etat(68).capacite, 1390.773);
  proche(m.etat(148).capacite, 2266.667);
  proche(m.etat(65).capitalImmo, sy.capacite.brut.paliers[0].capitalImmo);
  proche(m.etat(0).capitalImmo, 31270.82, 0.5);
});

test('mensualités, endettement, capital restant et intérêts au mois t', () => {
  const m = OS.modele(OC.synthese(profil(), {}, MAINTENANT));
  const e0 = m.etat(0);
  proche(e0.charges, 2068.832);
  proche(e0.endettement, 2068.832 / (68000 / 12), 1e-6);
  proche(e0.satellites['credit-0'].capitalRestant, 99345.42);
  proche(e0.satellites['credit-0'].interets, 875.894 * 148 - 99345.42);
  const e66 = m.etat(66);
  proche(e66.charges, 875.894 + 497.93);
  assert.equal(e66.satellites['credit-1'].actif, false);
  assert.equal(e66.satellites['credit-1'].restantes, 0);
  assert.equal(e66.satellites['credit-1'].capitalRestant, 0);
  assert.equal(e66.satellites['credit-2'].restantes, 2);
  assert.equal(m.etat(999).t, 148, 'borné à l\'horizon');
});

test('assurance vie : capital estimé du moteur, versé, avantage fiscal acquis à son jalon', () => {
  const sy = OC.synthese(profil(), {}, MAINTENANT);
  const m = OS.modele(sy);
  const v0 = m.etat(0).satellites['contrat-0'];
  proche(v0.capital, sy.contrats[0].capital);
  assert.equal(v0.verse, 5900);
  assert.equal(v0.fiscalAcquis, false);
  const v38 = m.etat(38).satellites['contrat-0'];
  assert.equal(v38.fiscalAcquis, true);
  assert.equal(v38.verse, 5900 + 38 * 100);
  assert.ok(v38.capital > v0.capital);
});

test('capital du dernier relevé : il continue de croître avec les versements', () => {
  const p = profil({ contrats: [{ type: 'av', versementMensuel: 100, moisDebut: 12, anneeDebut: 2021, capitalActuel: 7000 }] });
  const m = OS.modele(OC.synthese(p, {}, MAINTENANT));
  proche(m.etat(0).satellites['contrat-0'].capital, 7000);
  const i = OC.RENDEMENT_ESTIME / 1200, f = Math.pow(1 + i, 12);
  proche(m.etat(12).satellites['contrat-0'].capital, 7000 * f + 100 * (f - 1) / i);
});

test('crédit sans durée restante : satellite sans jalon, jamais terminé', () => {
  const p = profil({ credits: [{ libelle: 'Crédit conso', type: 'conso', mensualite: 300, tauxPct: 11 }], contrats: [] });
  const m = OS.modele(OC.synthese(p, {}, MAINTENANT));
  assert.equal(m.satellites[0].restantes, 0);
  assert.equal(m.jalons.length, 0);
  assert.equal(m.horizon, 0);
  const e = m.etat(0).satellites['credit-0'];
  assert.equal(e.actif, true);
  assert.equal(e.capitalRestant, null);
});

test('projets : un satellite par projet, jalon à l\'horizon, plus de place libre', () => {
  const p = profil({ credits: [], contrats: [], projets: [{ type: 'voiture', montant: 60000, horizonAns: 3 }] });
  const m = OS.modele(OC.synthese(p, {}, MAINTENANT));
  assert.deepEqual(m.satellites.map((s) => s.genre), ['projet']);
  assert.equal(m.satellites[0].horizon, 'octobre 2029');
  assert.equal(m.jalons[0].t, 36);
  assert.equal(m.horizon, 36);
});

test('profil vide : seulement la place libre, pas de voyage dans le temps', () => {
  const m = OS.modele(OC.synthese(OC.profilParDefaut(), {}, MAINTENANT));
  assert.deepEqual(m.satellites.map((s) => s.genre), ['vide']);
  assert.equal(m.horizon, 0);
  assert.equal(m.etat(0).charges, 0);
});
