'use strict';
/* Lot 6 « Mon année en orbite » : période, salaire mois par mois, pouvoir d'achat, crédits, épargne, année suivante, faits sans montant. */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../public/espace/js/annee-calcul.js');
const OC = require('../../public/espace/js/orbite-calcul.js');

const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const PROFIL = {
  montant: 3000, sens: 'brut', periode: 'mensuel', dateNaissance: '1990-03-01',
  historiqueSalaire: [{ montant: 2800, sens: 'brut', periode: 'mensuel', mois: 0, annee: 0 }, { montant: 3000, sens: 'brut', periode: 'mensuel', mois: 4, annee: 2026 }],
  credits: [
    { type: 'immo', libelle: 'Appartement', mensualite: 700, tauxPct: 8, dureeMois: 240, moisDebut: 3, anneeDebut: 2021 },
    { type: 'auto', libelle: 'Voiture de 15 000 DT', mensualite: 350, tauxPct: 9, dureeMois: 60, moisDebut: 6, anneeDebut: 2021 }
  ],
  contrats: [{ type: 'av', libelle: 'AV', versementMensuel: 100, anneeDebut: 2025, moisDebut: 1 }]
};
const DONNEES = {
  objectifs: [{ id: 'o1', type: 'precaution', libelle: 'Coussin de 4 000 DT', cible: 4000, depart: 0, cree_le: '2026-01-05' }],
  versements: [1, 2, 3, 4, 5, 6, 7].map((k) => ({ id: 'v' + k, objectif: 'o1', montant: k < 7 ? 370 : 380, le: '2026-' + String(k + 5).padStart(2, '0') + '-10' }))
};
const DEC = new Date(2026, 11, 20);

test('période : année en cours jusqu\'à aujourd\'hui (salaire du mois à partir du 25), année précédente complète en janvier', () => {
  assert.deepEqual([A.periode(DEC).annee, A.periode(DEC).complete, A.periode(DEC).mois, A.periode(DEC).rendezVous], [2026, false, 11, true]);
  assert.equal(A.periode(new Date(2026, 11, 26)).mois, 12);
  assert.equal(A.periode(new Date(2026, 5, 3)).rendezVous, false);
  const j = A.periode(new Date(2027, 0, 10));
  assert.deepEqual([j.annee, j.complete, j.mois, j.rendezVous], [2026, true, 12, true]);
});

test('salaire : mois par mois avec la hausse d\'avril, retenues qui s\'additionnent', () => {
  const s = A.salaire(OC.normaliser(Object.assign(OC.profilParDefaut(), PROFIL)), A.periode(new Date(2027, 0, 10)));
  const avant = OC.salaire(OC.normaliser(Object.assign(OC.profilParDefaut(), PROFIL, { montant: 2800 })));
  const apres = OC.salaire(OC.normaliser(Object.assign(OC.profilParDefaut(), PROFIL, { montant: 3000 })));
  proche(s.net, avant.netAnnuel * 3 / 12 + apres.netAnnuel * 9 / 12);
  proche(s.brut, 2800 * 3 + 3000 * 9);
  proche(s.brut - s.cotisations - s.impot, s.net, 0.01);
  assert.equal(s.hausses.length, 1);
  assert.equal(s.hausses[0].mois, 3);
  proche(s.hausses[0].brut, 200);
  assert.ok(s.pourVous > 0.7 && s.pourVous < 0.75);
});

test('pouvoir d\'achat : hausse du brut comparée à l\'inflation de l\'année', () => {
  const b = A.bilan(PROFIL, DONNEES, DEC), pa = b.cartes.find((c) => c.id === 'pouvoir').pouvoir;
  proche(pa.evolution, 3000 / 2800 - 1, 1e-9);
  proche(pa.inflation, 0.056, 1e-9);
  proche(pa.gain, (3000 / 2800) / 1.056 - 1, 1e-9);
  const sans = A.bilan({ montant: 2000 }, {}, DEC).cartes.find((c) => c.id === 'pouvoir').pouvoir;
  assert.ok(sans.gain < 0, 'sans hausse, le pouvoir d\'achat recule');
});

test('crédits : capital remboursé et intérêts = mensualités payées, crédit soldé dans l\'année', () => {
  const cr = A.bilan(PROFIL, DONNEES, new Date(2027, 0, 10)).cartes.find((c) => c.id === 'credits').credits;
  const immo = cr.liste.find((c) => c.type === 'immo'), auto = cr.liste.find((c) => c.type === 'auto');
  assert.equal(immo.payees, 12);
  proche(immo.capital + immo.interets, 700 * 12);
  assert.equal(auto.solde, true);
  proche(auto.capital + auto.interets, 350 * auto.payees);
  assert.equal(cr.margeLiberee, 350);
  proche(cr.capital, immo.capital + auto.capital);
  assert.equal(A.bilan({ montant: 2000 }, {}, DEC).cartes.some((c) => c.id === 'credits'), false, 'pas de crédit, pas de carte');
});

test('épargne : contrats au prorata, « J\'ai épargné » de l\'année, série, objectif mis en avant', () => {
  const ep = A.bilan(PROFIL, DONNEES, DEC).cartes.find((c) => c.id === 'epargne').epargne;
  proche(ep.contrats, 100 * 11);
  proche(ep.objectifs, 6 * 370 + 380);
  assert.equal(ep.serie, 7);
  assert.equal(ep.objectif.type, 'precaution');
  proche(ep.objectif.pct, 0.65, 1e-9);
  assert.ok(ep.impotEvite > 0);
});

test('année suivante : capacité retrouvée, impôt de décembre, objectif à finir (3 au plus)', () => {
  const av = A.bilan(PROFIL, DONNEES, DEC).cartes.find((c) => c.id === 'avenir').items;
  assert.ok(av.length >= 1 && av.length <= 3);
  const cap = av.find((i) => i.type === 'capacite');
  assert.ok(cap && cap.capital > 0 && cap.grace === true);
  const imp = av.find((i) => i.type === 'impot-jours');
  assert.ok(imp && imp.jours === 11 && imp.gain > 0);
});

test('faits de partage : jamais de montant ni de libellé saisi, 4 au plus', () => {
  const f = A.bilan(PROFIL, DONNEES, DEC).faits;
  assert.ok(f.length >= 1 && f.length <= 4);
  assert.deepEqual(f.map((x) => x.cle), ['credit', 'pouvoir', 'objectif', 'serie']);
  for (const x of f) {
    assert.equal(/DT|dinar|\d{3}/.test(x.texte), false, x.texte);
    assert.equal(/Appartement|Voiture de|Coussin/.test(x.texte), false, 'libellé saisi : ' + x.texte);
  }
  assert.equal(f[0].texte, 'Crédit voiture soldé');
});

test('profil minimal : cartes essentielles seulement, synthèse toujours présente', () => {
  const b = A.bilan({ montant: 1800 }, {}, new Date(2026, 5, 3));
  assert.deepEqual(b.cartes.map((c) => c.id).filter((i) => i !== 'avenir'), ['intro', 'salaire', 'impot', 'pouvoir', 'synthese']);
  assert.ok(b.faits.length === 1);
});
