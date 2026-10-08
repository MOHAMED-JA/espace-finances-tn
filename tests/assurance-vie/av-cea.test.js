'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../public/outils/assurance-vie/js/moteur-fiscal.js');
const P = require('../../public/outils/assurance-vie/js/projection.js');
const S = require('../../public/outils/assurance-vie/js/scenario.js');
const R = require('../../public/outils/assurance-vie/js/rachat.js');
const Pv = require('../../public/outils/assurance-vie/js/prevoyance.js');
const Baremes = require('../../public/outils/assurance-vie/js/baremes.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = (x) => Object.assign(S.defauts(), { revenu: 60000 }, x || {});

test('barème : règles propres à l\'assurance vie et au CEA', () => {
  const p = Baremes.annees[Baremes.parDefaut].produits;
  assert.equal(p.av.plafond, 100000);
  assert.equal(p.av.dureeMinimaleAns, 8);
  assert.equal(p.av.impotMinimumTaux, 0.45);
  assert.equal(p.cea.plafond, 100000);
  assert.equal(p.cea.impotMinimumTaux, 0.60);
  assert.equal(p.cea.dureeBlocageAns, 5);
});

test('CEA seul : l\'impôt ne descend jamais sous 60 % de l\'impôt initial', () => {
  const s = M.simuler({ revenu: 60000, investissementCea: 50000 });
  proche(s.impotApres, s.impotAvant * 0.6);
  proche(s.economieCea, s.impotAvant * 0.4);
  assert.equal(s.economieAv, 0);
  const petit = M.simuler({ revenu: 60000, investissementCea: 1000 });
  assert.ok(petit.impotApres > petit.impotAvant * 0.6);
});

test('assurance vie seule : inchangé (plancher 45 %)', () => {
  const s = M.simuler({ revenu: 60000, investissementAv: 50000 });
  proche(s.impotApres, s.impotAvant * 0.45);
  assert.equal(s.economieCea, 0);
  proche(M.simuler({ revenu: 45000, investissement: 6000 }).economie, 2070);
});

test('assurance vie + CEA : plancher global 45 %, part du CEA limitée à 40 %', () => {
  [[5000, 5000], [10000, 40000], [0, 30000], [30000, 0], [2000, 60000]].forEach(([av, cea]) => {
    const s = M.simuler({ revenu: 60000, investissementAv: av, investissementCea: cea });
    assert.ok(s.impotApres >= s.impotAvant * 0.45 - 1e-6, `${av}/${cea}`);
    assert.ok(s.economieCea <= s.impotAvant * 0.4 + 1e-6, `${av}/${cea}`);
    proche(s.economieAv + s.economieCea, s.economie);
    proche(s.apres.parTranche.reduce((t, b) => t + b.impot, 0), s.impotApres);
  });
});

test('plafonds de 100 000 TND par produit', () => {
  const s = M.simuler({ revenu: 400000, investissementAv: 150000, investissementCea: 120000 });
  assert.equal(s.deductionAv, 100000);
  assert.equal(s.deductionCea, 100000);
  assert.equal(s.horsPlafondAv, 50000);
  assert.equal(s.horsPlafondCea, 20000);
});

test('montant optimal en assurance vie, compte tenu du CEA', () => {
  const sans = M.simuler({ revenu: 60000 });
  const avec = M.simuler({ revenu: 60000, investissementCea: 10000 });
  assert.ok(avec.optimal < sans.optimal);
  const r = M.simuler({ revenu: 60000, investissementAv: avec.optimal, investissementCea: 10000 });
  proche(r.impotApres, r.impotAvant * 0.45, 1e-4);
  /* Revenu très élevé : l'optimal est borné par le plafond */
  assert.equal(M.simuler({ revenu: 1e6 }).optimal, 100000);
});

test('CEA utile : au-delà, un dépôt ne réduit plus l\'impôt', () => {
  const s = M.simuler({ revenu: 60000 });
  const e1 = M.simuler({ revenu: 60000, investissementCea: s.ceaUtile }).impotApres;
  const e2 = M.simuler({ revenu: 60000, investissementCea: s.ceaUtile + 5000 }).impotApres;
  proche(e1, e2, 1e-4);
  assert.ok(M.simuler({ revenu: 60000, investissementCea: s.ceaUtile - 100 }).impotApres > e1);
});

test('mode inverse avec CEA : complément d\'assurance vie', () => {
  const s = M.simuler({ revenu: 60000, investissementCea: 5000 });
  const r = M.investissementPourEconomie(s, s.economie + 1000);
  proche(M.economiePourInvestissement(s, r.investissementAnnuel), s.economie + 1000, 1e-3);
  assert.equal(M.investissementPourEconomie(s, s.economie - 1).investissementAnnuel, 0);
});

test('projection : versement initial, frais d\'entrée, versements libres et retraits', () => {
  const r = P.projeter({ versement: 0, periodesParAn: 1, dureeAns: 3, rendementPct: 0, fraisPct: 0,
    versementInitial: 1000, fraisEntreePct: 10, versementsLibres: { 2: 500 }, retraitDebut: 3, retraitMontant: 200 });
  proche(r.totalVerse, 1500);
  proche(r.capitalFinal, 900 + 450 - 200);
  proche(r.totalRetire, 200);
  proche(r.valeurFinale, 1350);
  /* retrait borné au capital */
  const vide = P.projeter({ versement: 0, periodesParAn: 1, dureeAns: 2, rendementPct: 0, versementInitial: 100, retraitDebut: 1, retraitMontant: 500 });
  proche(vide.capitalFinal, 0);
  proche(vide.totalRetire, 100);
});

test('TRI : initial seul, rendement nul → 0 % ; rendement 5 % sans frais → 5 %', () => {
  proche(P.triProjection(P.projeter({ versement: 0, periodesParAn: 12, dureeAns: 5, rendementPct: 0, versementInitial: 1000 }), 12), 0, 1e-6);
  proche(P.triProjection(P.projeter({ versement: 0, periodesParAn: 1, dureeAns: 5, rendementPct: 5, versementInitial: 1000 }), 1), 5, 1e-6);
});

test('scénario : deux produits, capitaux séparés et total', () => {
  const c = S.calculer(base({ versement: 400, versementCea: 300, initialAv: 5000 }));
  assert.equal(c.actif, true);
  proche(c.investissementAv, 400 * 12 + 5000);
  proche(c.investissementCea, 3600);
  proche(c.med.capitalFinal, c.medAv.capitalFinal + c.medCea.capitalFinal);
  assert.ok(c.annuel[0].deductionAv > c.annuel[1].deductionAv, 'le versement initial ne compte que la 1re année');
  /* CEA seul : actif, sans assurance vie */
  const cea = S.calculer(base({ versementCea: 500 }));
  assert.equal(cea.actif, true);
  proche(cea.medAv.capitalFinal, 0);
});

test('scénario : le prudent de l\'assurance vie ne descend pas sous le taux garanti', () => {
  const c = S.calculer(base({ versement: 500, rendementPct: 5, tauxGarantiPct: 4, ecartPct: 2 }));
  assert.equal(c.taux.av.prudent, 4);
  assert.equal(c.taux.av.dynamique, 7);
});

test('scénario : erreurs des nouvelles hypothèses', () => {
  assert.equal(S.erreurHypotheses(base({ tauxGarantiPct: 7, rendementPct: 6 })).code, 'garanti');
  assert.equal(S.erreurHypotheses(base({ fraisEntreePct: 12 })).code, 'fraisEntree');
  assert.equal(S.erreurHypotheses(base({ rendementCeaPct: 80 })).code, 'rendementCea');
  assert.equal(S.erreurHypotheses(base({ libres: [{ annee: 11, montant: 100 }] })).code, 'libres');
  assert.equal(S.erreurHypotheses(base({ retraitMontant: 100, retraitDebut: 5 })).code, 'retraitTot');
  assert.equal(S.erreurHypotheses(base({ retraitMontant: 100, retraitDebut: 11 })).code, 'retraitDebut');
  assert.equal(S.erreurHypotheses(base({ retraitMontant: 100, retraitDebut: 8 })), null);
});

test('rachat CEA : seuls les dépôts encore bloqués (5 ans) sont réintégrés', () => {
  const c = S.calculer(base({ versementCea: 500, dureeAns: 10 }));
  const r3 = R.simuler(c, { produit: 'cea', annee: 3, partPct: 100 });
  proche(r3.montantReintegre, c.annuel[0].deductionCea * 3);
  const r7 = R.simuler(c, { produit: 'cea', annee: 7, partPct: 100 });
  proche(r7.montantReintegre, c.annuel[0].deductionCea * 5);
  assert.equal(r7.anticipe, true);
  const u = S.calculer(base({ initialCea: 10000, dureeAns: 10 }));
  assert.equal(R.simuler(u, { produit: 'cea', annee: 6, partPct: 100 }).anticipe, false);
  assert.equal(R.simuler(u, { produit: 'cea', annee: 5, partPct: 100 }).anticipe, true);
});

test('rachat assurance vie : durée minimale de 8 ans', () => {
  const c = S.calculer(base({ versement: 500, dureeAns: 12 }));
  assert.equal(R.simuler(c, { produit: 'av', annee: 7, partPct: 100 }).anticipe, true);
  assert.equal(R.simuler(c, { produit: 'av', annee: 8, partPct: 100 }).anticipe, false);
  assert.equal(R.simuler(S.calculer(base({ versementCea: 100 })), { produit: 'av', annee: 1, partPct: 100 }).capitalRachete, 0);
});

test('avance sur contrat : mensualité, intérêts et comparaison avec un rachat', () => {
  const c = S.calculer(base({ versement: 500, dureeAns: 10 }));
  const a = R.avance(c, { annee: 5, montant: 10000, tauxPct: 0, dureeMois: 20 });
  proche(a.mensualite, 500);
  proche(a.interets, 0);
  const b = R.avance(c, { annee: 5, montant: 10000, tauxPct: 6, dureeMois: 24 });
  proche(b.mensualite, 10000 * 0.005 / (1 - Math.pow(1.005, -24)));
  assert.ok(b.coutRachat > 0);
  assert.equal(R.avance(c, { annee: 5, montant: 1e7, tauxPct: 6, dureeMois: 24 }).possible, false);
  assert.equal(R.avance(c, { annee: 5, montant: 1000, tauxPct: 6, dureeMois: 0 }), null);
});

test('sortie au terme : capital ou rente', () => {
  const r = Pv.comparerSortie(100000, 6000, 20);
  assert.equal(r.totalRentes, 120000);
  assert.equal(r.supplement, 20000);
  assert.equal(r.anneesPourCapital, 17);
});
