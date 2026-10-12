'use strict';
/* « Préparer ma négociation » : brut à demander, paliers, part gardée, alternatives, arguments, phrase, offre reçue. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const PR = require('../../public/espace/js/progression-calcul.js');
const N = require('../../public/espace/js/negociateur-calcul.js');

const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const M = new Date(2026, 9, 12, 12);
const BASE = {
  montant: 2500, sens: 'brut', chefDeFamille: true, enfants: 2, dateEmbauche: '2022-07-01',
  historiqueSalaire: [
    { montant: 2200, sens: 'brut', periode: 'mensuel', mois: 7, annee: 2022 },
    { montant: 2500, sens: 'brut', periode: 'mensuel', mois: 1, annee: 2024 }
  ]
};
const profil = (p) => OC.normaliser(Object.assign({}, BASE, p || {}));

test('+20 % net : brut cible exact, net atteint, hausse et coût employeur', () => {
  const r = N.preparer(profil(), { mode: 'pct', valeur: 20 }, {}, M);
  proche(r.actuel.brut, 2500);
  proche(r.cible.net, r.actuel.net * 1.2, 0.005);
  assert.ok(r.cible.brut > 3090 && r.cible.brut < 3105, 'brut cible ' + r.cible.brut);
  proche(r.hausse.netPct, 0.2, 1e-6);
  proche(r.hausse.brut, r.cible.brut - 2500);
  assert.ok(r.hausse.cout > r.hausse.brut, 'le coût employeur dépasse la hausse brute');
  assert.equal(r.erreur, null);
});

test('net et brut visés donnent le même résultat que le pourcentage équivalent', () => {
  const a = N.preparer(profil(), { mode: 'pct', valeur: 15 }, {}, M);
  const b = N.preparer(profil(), { mode: 'net', valeur: a.cible.net }, {}, M);
  const c = N.preparer(profil(), { mode: 'brut', valeur: a.cible.brut }, {}, M);
  proche(b.cible.brut, a.cible.brut, 0.01);
  proche(c.cible.net, a.cible.net, 0.01);
});

test('ancre : cible + marge arrondie aux 50 DT au-dessus ; sans marge, ancre = cible', () => {
  const r = N.preparer(profil(), { mode: 'brut', valeur: 3000 }, { marge: 0.05 }, M);
  assert.equal(r.ancre.brut, 3150);
  assert.equal(r.ancre.brut % 50, 0);
  const s = N.preparer(profil(), { mode: 'brut', valeur: 3000 }, { marge: 0 }, M);
  assert.equal(s.ancre.brut, 3000);
  const t = N.preparer(profil(), { mode: 'brut', valeur: 3000 }, { marge: 0.9 }, M);
  assert.equal(t.marge, N.MARGE_MAX, 'marge bornée');
});

test('plancher : pouvoir d\'achat depuis la dernière hausse, comme Ma progression', () => {
  const r = N.preparer(profil(), { mode: 'pct', valeur: 20 }, {}, M);
  const indice = PR.indice(2024, 2026);
  assert.equal(r.arguments.type, 'hausse');
  assert.equal(r.arguments.depuisLib, 'janvier 2024');
  proche(r.arguments.prix, indice - 1, 1e-9);
  assert.equal(r.plancher.brut, Math.ceil(2500 * indice / 10) * 10);
  assert.equal(r.cibleSousPlancher, false);
  const bas = N.preparer(profil(), { mode: 'pct', valeur: 3 }, {}, M);
  assert.equal(bas.cibleSousPlancher, true, 'une petite hausse ne rattrape pas les prix');
});

test('repères : sans historique daté, l\'embauche ; sans rien, la dernière année', () => {
  const e = N.preparer(profil({ historiqueSalaire: [] }), { mode: 'pct', valeur: 10 }, {}, M);
  assert.equal(e.arguments.type, 'embauche');
  assert.equal(e.arguments.depuisLib, 'juillet 2022');
  assert.equal(e.arguments.sansHausse, null);
  assert.match(e.phrase, /^Depuis mon arrivée en juillet 2022/);
  const x = N.preparer(profil({ historiqueSalaire: [], dateEmbauche: '' }), { mode: 'pct', valeur: 10 }, {}, M);
  assert.equal(x.arguments.type, null);
  proche(x.arguments.prix, PR.indice(2025, 2026) - 1, 1e-9);
  assert.match(x.phrase, /^Sur la dernière année/);
  assert.equal(x.arguments.anciennete, null);
});

test('ancienneté et durée sans hausse, en années et mois', () => {
  const r = N.preparer(profil(), { mode: 'pct', valeur: 20 }, {}, M);
  assert.equal(r.arguments.ancienneteLib, '4 ans et 3 mois');
  assert.equal(r.arguments.sansHausseLib, '2 ans et 9 mois');
});

test('part gardée : net + CNSS + IRPP + CSS = 100 % de la hausse brute', () => {
  const r = N.preparer(profil(), { mode: 'pct', valeur: 20 }, {}, M);
  const g = r.garde;
  proche(g.net + g.cnss + g.irpp + g.css, 1, 1e-6);
  assert.ok(g.net > 0.55 && g.net < 0.7, 'part nette ' + g.net);
});

test('alternatives : même gain net la première année', () => {
  const p = profil();
  const r = N.preparer(p, { mode: 'pct', valeur: 20 }, {}, M);
  /* La prime unique donne exactement le gain net de l'année. */
  const e = OC.entreeBrut(p).entree;
  const C = require('../../public/moteurs/salaire/calcul.js'), P = require('../../public/moteurs/salaire/parametres.js');
  const avec = C.calculerAvecVersements(Object.assign({}, e, { primesImposables: r.alternatives.prime / 12 }), P).annee.annuel.netAPayer;
  proche(avec - r.actuel.netAnnuel, r.hausse.netAnnuel, 0.05);
  assert.equal(r.alternatives.salaireDePlus.rang, 13);
  assert.ok(r.alternatives.salaireDePlus.part > 0.2 && r.alternatives.salaireDePlus.part < 0.6);
  assert.ok(r.alternatives.deuxTemps.part > 0.7 && r.alternatives.deuxTemps.part < 0.8);
  const seize = N.preparer(profil({ nombreSalaires: 16 }), { mode: 'pct', valeur: 20 }, {}, M);
  assert.equal(seize.alternatives.salaireDePlus, null, 'pas de 17e salaire');
});

test('profil saisi en net et à l\'année : même salaire de base mensuel', () => {
  const s = OC.salaire(profil());
  const net = N.preparer(profil({ sens: 'net', montant: s.netMensuel }), { mode: 'pct', valeur: 10 }, {}, M);
  proche(net.actuel.brut, 2500, 0.01);
  const an = N.preparer(profil({ periode: 'annuel', montant: 2500 * 13, nombreSalaires: 13 }), { mode: 'pct', valeur: 10 }, {}, M);
  proche(an.actuel.brut, 2500, 0.01);
  assert.equal(an.actuel.salaires, 13);
});

test('objectifs refusés : nul, trop haut, sous le salaire actuel ; retraité exclu', () => {
  assert.match(N.preparer(profil(), { mode: 'pct', valeur: 0 }, {}, M).erreur, /entre 1 et 100/);
  assert.match(N.preparer(profil(), { mode: 'pct', valeur: 150 }, {}, M).erreur, /entre 1 et 100/);
  assert.match(N.preparer(profil(), { mode: 'brut', valeur: 2400 }, {}, M).erreur, /au-dessus de 2 500 DT/);
  assert.match(N.preparer(profil(), { mode: 'net', valeur: 100000 }, {}, M).erreur, /double/);
  assert.equal(N.preparer(profil({ activite: 'retraite' }), { mode: 'pct', valeur: 10 }, {}, M), null);
});

test('phrase prête : prix, première réussite, ancre ; réussites nettoyées et limitées', () => {
  const r = N.preparer(profil(), { mode: 'brut', valeur: 3000 }, { reussites: ['  Migration <b>livrée</b> en avance. ', '', 'x'.repeat(200), 'a', 'b', 'c', 'd'] }, M);
  assert.equal(r.reussites.length, N.MAX_REUSSITES);
  assert.equal(r.reussites[0], 'Migration b livrée /b en avance.');
  assert.equal(r.reussites[1].length, 140);
  assert.equal(r.phrase, 'Depuis ma dernière augmentation en janvier 2024, les prix ont monté de ' + N._pc1(PR.indice(2024, 2026) - 1) +
    '. Parmi mes réalisations : migration b livrée /b en avance. Je souhaite que mon salaire de base soit porté à 3 150 DT brut par mois.');
});

test('offre reçue : net comparé, contre-proposition pour +20 % net sur l\'année', () => {
  const p = profil();
  const o = N.offre(p, { brut: 2700, salaires: 12 }, M);
  assert.equal(o.atteint, false);
  assert.ok(o.contre.netAnnuel >= o.actuel.netAnnuel * 1.2 - 0.01);
  assert.equal(o.contre.brut % 50, 0);
  assert.ok(o.ecartContre > 0);
  const g = N.offre(p, { brut: 3500, salaires: 13 }, M);
  assert.equal(g.atteint, true);
  assert.equal(g.contre.brut, 3500);
  proche(g.ecartAnnuel, g.propose.netAnnuel - g.actuel.netAnnuel);
  assert.match(N.offre(p, { brut: 0, salaires: 12 }, M).erreur, /brut mensuel/);
  assert.match(N.offre(p, { brut: 3000, salaires: 18 }, M).erreur, /entre 12 et 16/);
});
