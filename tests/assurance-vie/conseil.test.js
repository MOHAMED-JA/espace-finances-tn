'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../public/outils/assurance-vie/js/scenario.js');
const C = require('../../public/outils/assurance-vie/js/conseil.js');
const Pf = require('../../public/outils/assurance-vie/js/portefeuille.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = (x) => Object.assign(S.defauts(), { revenu: 45000, versement: 500 }, x || {});

test('objectif de capital : le versement trouvé atteint la cible, au millime près', () => {
  [base(), base({ reinvestir: true }), base({ croissancePct: 3, frequence: 'Annuel' })].forEach((e) => {
    const r = C.versementPourCapital(e, 100000);
    assert.ok(r.capital >= 100000, `${r.capital}`);
    const moins = S.calculer(Object.assign({}, e, { versement: r.versement - 0.002 })).med.capitalFinal;
    assert.ok(moins < 100000, 'le versement est minimal');
  });
});

test('objectif de capital : cas limites', () => {
  assert.deepEqual(C.versementPourCapital(base(), 0), { versement: 0, capital: 0 });
  assert.equal(C.versementPourCapital(base({ dureeAns: 0 }), 1000), null);
  /* rendement nul, sans frais : versement = cible / nombre de versements */
  const r = C.versementPourCapital(base({ rendementPct: 0, fraisPct: 0, dureeAns: 10 }), 12000);
  proche(r.versement, 100);
});

test('durée jusqu\'à la retraite', () => {
  assert.deepEqual(C.dureeRetraite(35, 60), { duree: 25 });
  assert.deepEqual(C.dureeRetraite(10, 60), { erreur: 'age' });
  assert.deepEqual(C.dureeRetraite(35, 30), { erreur: 'depart' });
  assert.deepEqual(C.dureeRetraite(62, 60), { erreur: 'ecart' });
  assert.deepEqual(C.dureeRetraite(18, 65), { erreur: 'ecart' });
  assert.deepEqual(C.dureeRetraite(35.5, 60), { erreur: 'age' });
});

test('revenu à la retraite : pension + rente', () => {
  const r = C.revenuRetraite(1500, 500);
  assert.equal(r.total, 2000);
  proche(r.partRente, 25);
  assert.equal(C.revenuRetraite(0, 0).partRente, 0);
  assert.equal(C.revenuRetraite(NaN, 300).total, 300);
});

test('comparatif : l\'impôt sur les intérêts réduit le placement classique', () => {
  const c = S.calculer(base());
  assert.ok(c.classiqueNet < c.classique);
  const sansImpot = S.calculer(base({ impotInteretsPct: 0 }));
  proche(sansImpot.classiqueNet, sansImpot.classique);
  assert.equal(S.calculer(base({ impotInteretsPct: 60 })).erreur.code, 'impotInterets');
});

test('statistiques du portefeuille', () => {
  const r1 = S.resume(S.calculer(base())), r2 = S.resume(S.calculer(base({ versement: 1000 })));
  const s = C.statistiques([r1, r2]);
  assert.equal(s.nombre, 2);
  proche(s.epargneAnnuelle, 18000);
  proche(s.economieAnnuelle, r1.economie + r2.economie);
  proche(s.tauxMoyen, (r1.tauxReduction + r2.tauxReduction) / 2);
  assert.equal(C.statistiques([]).tauxMoyen, 0);
});

test('sauvegarde : export puis import sans perte', () => {
  const enr = [
    Pf.creerEnregistrement(base(), {}, { client: 'Mme A', ref: 'R1' }, new Date('2026-01-02T10:00:00Z')),
    Pf.creerEnregistrement(base({ versement: 900, chef: true }), {}, { client: 'M. B' }, new Date('2026-01-03T10:00:00Z'))
  ];
  const r = C.importerSauvegarde(C.exporterSauvegarde(enr));
  assert.equal(r.simulations.length, 2);
  assert.equal(r.simulations[0].client, 'Mme A');
  assert.equal(r.simulations[1].etat.versement, 900);
  assert.equal(r.simulations[1].etat.chef, true);
  proche(r.simulations[0].resume.capitalMedian, S.resume(S.calculer(base())).capitalMedian);
});

test('sauvegarde : fichiers invalides ou altérés', () => {
  assert.deepEqual(C.importerSauvegarde('pas du json'), { erreur: 'format' });
  assert.deepEqual(C.importerSauvegarde('{"format":"autre","simulations":[]}'), { erreur: 'format' });
  const altere = JSON.stringify({ format: 'simulateur-av/portefeuille', simulations: [
    { id: 'a1', etat: { revenu: 45000, versement: -5, dureeAns: 999 }, client: 42 },
    { id: 'a1', etat: { revenu: 1 } },
    { id: '<script>', etat: { revenu: 1 } },
    { id: 'b2', etat: { revenu: 0 } },
    null
  ] });
  const r = C.importerSauvegarde(altere);
  assert.equal(r.simulations.length, 1);
  assert.equal(r.simulations[0].etat.versement, 0);
  assert.equal(r.simulations[0].etat.dureeAns, 10);
  assert.equal(r.simulations[0].client, '');
});
