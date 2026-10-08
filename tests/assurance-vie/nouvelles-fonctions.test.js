'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../public/moteurs/vie/moteur-fiscal.js');
const P = require('../../public/moteurs/vie/projection.js');
const S = require('../../public/moteurs/vie/scenario.js');
const R = require('../../public/moteurs/vie/rachat.js');
const Pv = require('../../public/moteurs/vie/prevoyance.js');
const Pa = require('../../public/moteurs/vie/partage.js');
const X = require('../../public/moteurs/vie/export-tableur.js');
const Pf = require('../../public/moteurs/vie/portefeuille.js');
const Baremes = require('../../public/moteurs/vie/baremes.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = () => Object.assign(S.defauts(), { revenu: 45000, versement: 500 });

/* ---------- Mode inverse ---------- */
test('mode inverse : l\'investissement trouvé procure bien l\'économie visée', () => {
  const sim = M.simuler({ revenu: 45000, investissement: 0 });
  [500, 1500, 3000, 5846] .forEach((cible) => {
    const r = M.investissementPourEconomie(sim, cible);
    assert.equal(r.possible, true);
    proche(M.economiePourInvestissement(sim, r.investissementAnnuel), cible, 1e-3);
  });
});

test('mode inverse : cible au-delà du plancher légal impossible', () => {
  const sim = M.simuler({ revenu: 45000, investissement: 0 });
  const r = M.investissementPourEconomie(sim, sim.impotAvant);
  assert.equal(r.possible, false);
  proche(r.economieMax, sim.impotAvant * 0.55);
  assert.equal(M.investissementPourEconomie(sim, 0).investissementAnnuel, 0);
});

/* ---------- Projection réaliste ---------- */
test('projection : sans croissance ni inflation, résultat inchangé', () => {
  const p = { versement: 100, periodesParAn: 12, dureeAns: 10, rendementPct: 5, fraisPct: 0, economieAnnuelle: 0 };
  const r = P.projeter(p);
  proche(r.capitalFinalReel, r.capitalFinal);
  proche(r.totalVerse, 12000);
});

test('projection : versements croissants et capital en valeur réelle', () => {
  const p = { versement: 100, periodesParAn: 1, dureeAns: 3, rendementPct: 0, fraisPct: 0, economieAnnuelle: 0, croissancePct: 10, inflationPct: 10 };
  const r = P.projeter(p);
  proche(r.totalVerse, 100 + 110 + 121);
  proche(r.capitalFinal, 331);
  proche(r.capitalFinalReel, 331 / 1.331);
});

test('projection : économies annuelles explicites (revenu croissant)', () => {
  const p = { versement: 0, periodesParAn: 1, dureeAns: 3, rendementPct: 0, fraisPct: 0, economies: [100, 200, 300], reinvestir: true };
  const r = P.projeter(p);
  proche(r.economieCumulee, 600);
  proche(r.capitalFinal, 600);
});

test('projection : écart entre scénarios paramétrable', () => {
  const p = { versement: 100, periodesParAn: 12, dureeAns: 10, rendementPct: 6, fraisPct: 0, economieAnnuelle: 0, ecartPct: 4 };
  const sc = P.scenarios(p);
  assert.equal(sc.ecart, 4);
  assert.ok(sc.dynamique.capitalFinal > sc.median.capitalFinal && sc.median.capitalFinal > sc.prudent.capitalFinal);
  assert.equal(P.scenarios(Object.assign({}, p, { ecartPct: undefined })).ecart, P.ECART_SCENARIOS);
});

test('TRI : versements croissants pris en compte', () => {
  const p = { versement: 100, periodesParAn: 1, dureeAns: 2, rendementPct: 0, fraisPct: 0, economieAnnuelle: 0, croissancePct: 10 };
  /* sorties 100 (t=1) et 110 (t=2), entrée 210 (t=2) : TRI = 0 */
  proche(P.rendementEffectif(p), 0, 1e-6);
});

/* ---------- Scénario ---------- */
test('scénario : cohérence avec le moteur et la projection', () => {
  const c = S.calculer(base());
  assert.equal(c.investissement, 6000);
  assert.equal(c.actif, true);
  proche(c.sim.economie, M.simuler({ revenu: 45000, investissement: 6000 }).economie);
  assert.ok(c.p.economies.every((x) => Math.abs(x - c.sim.economie) < 1e-9));
  assert.ok(c.valeurTotale > c.med.capitalFinal);
});

test('scénario : hypothèses invalides ou versement nul → inactif', () => {
  assert.equal(S.calculer(Object.assign(base(), { versement: 0 })).actif, false);
  assert.equal(S.calculer(Object.assign(base(), { dureeAns: 0 })).erreur.code, 'duree');
  assert.equal(S.calculer(Object.assign(base(), { dureeAns: 41 })).erreur.code, 'duree');
  assert.equal(S.calculer(Object.assign(base(), { rendementPct: 60 })).erreur.code, 'rendement');
  assert.equal(S.calculer(Object.assign(base(), { inflationPct: NaN })).erreur.code, 'inflation');
  assert.equal(S.calculer(base()).erreur, null);
});

test('scénario : revenu croissant → économies calculées année par année', () => {
  const c = S.calculer(Object.assign(base(), { croissancePct: 5, dureeAns: 5 }));
  assert.equal(c.p.economies.length, 5);
  proche(c.p.economies[0], c.sim.economie);
  assert.ok(c.p.economies.every((e) => e >= 0));
});

test('scénario : le résumé reprend les chiffres clés', () => {
  const c = S.calculer(base());
  const r = S.resume(c);
  proche(r.capitalMedian, c.med.capitalFinal);
  assert.equal(r.dureeAns, 10);
  assert.equal(S.resume(S.calculer(S.defauts())).capitalMedian, null);
});

/* ---------- Rachat ---------- */
test('rachat avant la durée minimale : réintégration fiscale + pénalité', () => {
  const c = S.calculer(Object.assign(base(), { dureeAns: 10 }));
  const r = R.simuler(c, { annee: 5, partPct: 100, penalitePct: 2 });
  assert.equal(r.anticipe, true);
  proche(r.montantReintegre, 30000);
  const rev = c.sim.revenuNet;
  proche(r.impotReintegration, M.impotDetaille(rev + 30000).total - M.impotDetaille(rev).total);
  proche(r.penalite, r.capitalRachete * 0.02);
  proche(r.netRecu, r.capitalRachete - r.penalite - r.impotReintegration);
  proche(r.coutSortie, r.penalite + r.impotReintegration);
});

test('rachat partiel : proportionnel', () => {
  const c = S.calculer(base());
  const total = R.simuler(c, { annee: 4, partPct: 100, penalitePct: 0 });
  const moitie = R.simuler(c, { annee: 4, partPct: 50, penalitePct: 0 });
  proche(moitie.capitalRachete, total.capitalRachete / 2);
  proche(moitie.montantReintegre, total.montantReintegre / 2);
});

test('rachat à la durée minimale : aucune réintégration', () => {
  const c = S.calculer(Object.assign(base(), { dureeAns: 12 }));
  const r = R.simuler(c, { annee: 10, partPct: 100, penalitePct: 0 });
  assert.equal(r.anticipe, false);
  assert.equal(r.impotReintegration, 0);
  proche(r.netRecu, r.capitalRachete);
});

test('rachat : paramètres hors bornes ou scénario inactif → null', () => {
  const c = S.calculer(base());
  assert.equal(R.simuler(c, { annee: 0, partPct: 100 }), null);
  assert.equal(R.simuler(c, { annee: 11, partPct: 100 }), null);
  assert.equal(R.simuler(c, { annee: 3, partPct: 0 }), null);
  assert.equal(R.simuler(c, { annee: 3, partPct: 101 }), null);
  assert.equal(R.simuler(S.calculer(S.defauts()), { annee: 1, partPct: 100 }), null);
});

/* ---------- Prévoyance ---------- */
test('rente estimée : taux nul = capital / durée ; taux positif = rente plus élevée', () => {
  proche(Pv.renteEstimee(100000, 20, 0).annuelle, 5000);
  proche(Pv.renteEstimee(100000, 20, 0).mensuelle, 5000 / 12);
  assert.ok(Pv.renteEstimee(100000, 20, 3).annuelle > 5000);
  assert.equal(Pv.renteEstimee(0, 20, 3).annuelle, 0);
  /* le capital placé à 3 % puis rente de fin d'année : valeur actuelle = capital */
  const rente = Pv.renteEstimee(100000, 20, 3).annuelle;
  proche(rente * (1 - Math.pow(1.03, -20)) / 0.03, 100000, 1e-6);
});

test('capital décès : plus élevé entre capital acquis, versements et capital garanti', () => {
  const annees = [{ annee: 0, verse: 0, capital: 0 }, { annee: 1, verse: 1000, capital: 900 }, { annee: 2, verse: 2000, capital: 2100 }];
  assert.deepEqual([Pv.capitalDeces(annees, 1).capitalDeces, Pv.capitalDeces(annees, 1).origine], [1000, 'verses']);
  assert.deepEqual([Pv.capitalDeces(annees, 2).capitalDeces, Pv.capitalDeces(annees, 2).origine], [2100, 'acquis']);
  assert.deepEqual([Pv.capitalDeces(annees, 2, 50000).capitalDeces, Pv.capitalDeces(annees, 2, 50000).origine], [50000, 'garanti']);
  assert.equal(Pv.capitalDeces(annees, 99).annee, 2);
});

/* ---------- Partage ---------- */
test('lien de partage : aller-retour sans perte', () => {
  const e = Object.assign(base(), { chef: true, enfants: 2, parents: 1, frequence: 'Trimestriel', croissancePct: 3.5, reinvestir: true, annee: '2025' });
  assert.deepEqual(Object.assign(S.defauts(), Pa.decoder(Pa.encoder(e))), e);
  const e2 = Object.assign(base(), { versementCea: 300, initialAv: 5000, initialCea: 2000, tauxGarantiPct: 3.5, fraisEntreePct: 2,
    rendementCeaPct: 9, fraisCeaPct: 0.4, ecartCeaPct: 5, libres: [{ annee: 3, montant: 4000 }, { annee: 7, montant: 1500.5 }], retraitDebut: 9, retraitMontant: 1200 });
  assert.deepEqual(Object.assign(S.defauts(), Pa.decoder(Pa.encoder(e2))), e2);
  assert.ok(Pa.lien('https://exemple.tn/app/?x=1#ancien', e).startsWith('https://exemple.tn/app/?x=1#r=45000'));
});

test('lien de partage : valeurs invalides ignorées', () => {
  const d = Pa.decoder('#r=abc&v=-5&d=99&f=Hebdo&a=1999&e=2.5&p=3&c=2&z=99&y=6&x=1e3&L=0:5,3:abc');
  assert.deepEqual(d, { rendementPct: 6 });
  assert.deepEqual(Pa.decoder(''), {});
  assert.deepEqual(Pa.decoder('r=%E0%A4%A'), {});
});

test('lien de partage : ne contient jamais les noms du client ni du conseiller', () => {
  const t = Pa.encoder(Object.assign(base(), { client: 'Mme Ben Salah', conseiller: 'Ali', ref: 'AV-1' }));
  assert.ok(!/Salah|Ali|AV-1/.test(t));
});

/* ---------- Export tableur ---------- */
test('CSV : séparateur point-virgule, virgule décimale, BOM, échappement', () => {
  const t = X.csv([['a', 'b;c', 'd"e'], [1.5, null, 1234.5678]]);
  assert.ok(t.startsWith('﻿'));
  assert.ok(t.includes('a;"b;c";"d""e"\r\n1,5;;1234,568\r\n'));
});

test('CSV : neutralise l\'injection de formule', () => {
  assert.ok(X.csv([['=CMD()', '+1', '@x', '-2']]).includes("'=CMD();'+1;'@x;'-2"));
});

test('CSV : portefeuille et projection annuelle', () => {
  const enr = [Pf.creerEnregistrement(base(), S.resume(S.calculer(base())), { client: 'Test', ref: 'R1' }, new Date('2026-03-04T10:00:00Z'))];
  const t = X.portefeuille(enr, [['Économie', 'economie']]);
  assert.ok(t.split('\r\n')[0].endsWith('Économie'));
  assert.ok(t.split('\r\n')[1].startsWith('2026-03-04;Test;R1;2070'));
  const a = X.projectionAnnuelle([{ annee: 0, verse: 0, capital: 0, capitalReel: 0 }, { annee: 1, verse: 1, capital: 2, capitalReel: 1.5 }], ['A', 'B', 'C', 'D']);
  assert.ok(a.includes('1;1;2;1,5'));
});

/* ---------- Portefeuille ---------- */
test('portefeuille : enregistrement autonome et sans référence à l\'état d\'origine', () => {
  const e = base();
  const enr = Pf.creerEnregistrement(e, {}, { client: 'x'.repeat(200) }, new Date('2026-01-02T00:00:00Z'));
  e.revenu = 1;
  assert.equal(enr.etat.revenu, 45000);
  assert.equal(enr.client.length, 80);
  assert.equal(enr.date, '2026-01-02');
  assert.notEqual(enr.id, Pf.creerEnregistrement(base(), {}, {}).id);
});

/* ---------- Barèmes ---------- */
test('un seul barème en vigueur : aucun barème provisoire', () => {
  assert.deepEqual(Object.keys(Baremes.annees), ['2025']);
  assert.equal(Baremes.parDefaut, '2025');
  assert.ok(!Baremes.annees['2025'].provisoire);
});

test('lien de partage : une année absente du barème est ignorée', () => {
  assert.deepEqual(Pa.decoder('#a=2026&r=45000'), { revenu: 45000 });
});
