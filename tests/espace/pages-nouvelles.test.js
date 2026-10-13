'use strict';
/* Pages publiques du 13 oct. 2026 : règle des 8 %, remboursement anticipé, regroupement de crédits, coût employeur.
   Chaque chiffre vient des moteurs d'Orbite ; les cas limites donnent un message clair au lieu d'un chiffre faux. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/commun/pages-calcul.js');
const OC = require('../../public/espace/js/orbite-calcul.js');
const CPJ = require('../../public/moteurs/credit/projets.js');
const G = require('../../scripts/pages-publiques.js');

const M = new Date(2026, 9, 12);
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.001), (msg || '') + ' : ' + a + ' ≠ ' + b);

test('règle des 8 % : exemple = moteur du module Crédit, date future, réductions successives', () => {
  const D = C.R8_DEF, g = C.regle8({}, M);
  const ref = OC.reductionsTaux({ mensualite: D.mensualite, tauxPct: D.taux, dureeMois: D.duree, moisDebut: D.mois, anneeDebut: D.annee, tauxType: 'fixe' }, M);
  assert.deepEqual(g.reductions, ref.reductions);
  proche(OC.mensualitePourCapital(150000, 9, 240), D.mensualite, 0.001, 'mensualité de 150 000 DT à 9 % sur 20 ans');
  assert.equal(g.possibleDepuis, null, "l'exemple reste dans le futur à la date des pages");
  const a = C.affichage('regle8', {}, M);
  assert.equal(a.etat, 'ok');
  assert.equal(a.quand_lib, 'Réduction possible dès');
  assert.equal(a.quand_ent + a.quand_dec, g.reductions[0].date);
  assert.equal(a.apres_taux.replace(/\s/g, ' '), '4,5 %');
  assert.ok(a.r1 && a.r2 && a.r3, 'trois réductions dans la frise');
  assert.ok(g.reductions[1].tauxPct === g.reductions[0].tauxPct / 2);
});

test('règle des 8 % : déjà possible → « depuis » ; 7 ans ou moins → explication', () => {
  const deja = C.affichage('regle8', { mensualite: 1349.592, taux: 9, duree: 240, mois: 1, annee: 2022 }, M);
  assert.equal(deja.etat, 'ok');
  assert.equal(deja.quand_lib, 'Réduction possible depuis');
  assert.equal(deja.apres_lib, 'Dès votre demande');
  const court = C.affichage('regle8', { mensualite: 600, taux: 9, duree: 84, mois: 1, annee: 2024 }, M);
  assert.equal(court.etat, 'non');
  assert.match(court.raison, /plus de 7 ans/);
  assert.equal(court.r1, '');
  const fini = C.affichage('regle8', { mensualite: 600, taux: 9, duree: 120, mois: 1, annee: 2010 }, M);
  assert.equal(fini.etat, 'non');
  assert.match(fini.raison, /remboursé/);
});

test('remboursement anticipé : reste dû, deux choix, durée plus courte toujours au moins aussi avantageuse', () => {
  const D = C.RA_DEF, a = C.anticipe({});
  const r = D.taux / 1200, Mn = OC.mensualitePourCapital(D.montant, D.taux, D.duree);
  proche(a.mensualite, Mn);
  proche(a.restantDu, D.montant * (1 + r) ** D.payees - Mn * ((1 + r) ** D.payees - 1) / r, 0.001, 'reste dû');
  proche(a.basse.mensualite, OC.mensualitePourCapital(a.restantDu - D.somme, D.taux, D.duree - D.payees), 0.001, 'nouvelle mensualité');
  assert.equal(a.courte.gagnes, 68);
  assert.ok(a.courte.economie >= a.basse.economie && a.basse.economie > 0);
  /* Les intérêts restants après versement se retrouvent en déroulant l'échéancier mois par mois. */
  let k = a.restantDu - D.somme, payes = 0;
  for (let i = 0; i < a.courte.mois; i++) { const int = k * r, du = Math.min(a.mensualite, k + int); payes += int; k = k + int - du; }
  proche(a.interetsAvant - payes, a.courte.economie, 0.01, 'intérêts évités (durée plus courte)');
  for (let p = 12; p <= 180; p += 24) {
    const x = C.anticipe({ montant: 80000, taux: 8, duree: 240, payees: p, somme: 5000 });
    assert.ok(x.courte.economie >= x.basse.economie - 0.001, 'après ' + p + ' mois');
  }
});

test('remboursement anticipé : somme qui couvre tout → crédit soldé ; crédit fini ou somme nulle → message', () => {
  const solde = C.affichage('anticipe', { somme: 500000 }, M);
  assert.equal(solde.etat, 'solde');
  assert.match(solde.solde_txt, /soldé/);
  const fini = C.affichage('anticipe', { payees: 240 }, M);
  assert.equal(fini.etat, 'non');
  assert.match(fini.raison, /déjà remboursé/);
  assert.equal(C.affichage('anticipe', { somme: 0 }, M).etat, 'non');
  assert.equal(C.dureeTxt(68), '5 ans et 8 mois');
  assert.equal(C.dureeTxt(12), '1 an');
  assert.equal(C.dureeTxt(7), '7 mois');
});

test('regroupement : résultat du moteur du module Crédit ; ligne décochée ou vide ignorée', () => {
  const D = C.RG_DEF, g = C.regroupement({});
  const ref = CPJ.regrouper({ credits: D.credits.map((c, i) => ({ libelle: 'Crédit ' + (i + 1), mensualite: c.mensualite, tauxPct: c.taux, moisRestants: c.mois, inclus: true })),
    tauxPct: D.taux, mois: D.duree, iraPct: D.ira, fraisDossier: D.frais });
  assert.deepEqual(g.resultat, ref);
  assert.equal(g.resultat.lignes.length, 2, 'la troisième ligne vide est ignorée');
  const a = C.affichage('regroupement', {}, M);
  assert.equal(a.etat, 'ok');
  assert.match(a.verdict_fort, /^−/);
  assert.match(a.verdict_suite, /^, mais \+/);
  const sans2 = C.regroupement({ credits: [D.credits[0], Object.assign({}, D.credits[1], { inclus: false })] });
  assert.equal(sans2.resultat.lignes.length, 1);
  assert.equal(sans2.credits[1].restantDu, 0);
  const vide = C.affichage('regroupement', { credits: [{ mensualite: 0, taux: 0, mois: 0 }] }, M);
  assert.equal(vide.etat, 'non');
  assert.match(vide.raison, /au moins un crédit/);
});

test('coût employeur : brut + charges, parts qui font 100 DT, secteur public sans TFP', () => {
  const e = C.employeur({ montant: 2000 }, M);
  proche(e.cout, e.brut + e.charges, 0.001, 'coût = brut + charges');
  proche(e.parts.salarie + e.parts.caisse + e.parts.etat, 1, 1e-9, 'parts');
  proche(e.net, C.salaire({ montant: 2000 }, M).net, 0.001, 'net = page salaire');
  proche(e.cout, 2411.4, 0.001);
  const p = C.employeur({ montant: 2000, secteur: 'public' }, M);
  assert.equal(p.caisse, 'CNRPS');
  assert.ok(!p.lignes.some((l) => l.code === 'tfp' || l.code === 'accident_travail'));
  const a = C.affichage('employeur', { montant: 2000 }, M);
  assert.equal((a.cout_ent + a.cout_dec).replace(/\s/g, ' '), '2 411,400 DT');
  assert.equal(a.part_sal, '63,6 DT');
});

test('nouvelles pages : menu (Crédit ou Salaire en cours), états cachés au départ, aucun texte vide affiché', () => {
  const pages = G.generer();
  const voir = (slug) => pages[slug + '.html'];
  for (const slug of ['regle-8-pourcent-credit-tunisie', 'remboursement-anticipe-credit-tunisie', 'regroupement-credits-tunisie']) {
    assert.ok(voir(slug).includes('<a href="/simulateur-credit-tunisie" aria-current="true">Crédit</a>'), slug);
    assert.ok(voir(slug).includes('<script src="/moteurs/credit/projets.js"></script>'), slug + ' charge le moteur du regroupement');
  }
  assert.ok(voir('cout-employeur-tunisie').includes('<a href="/salaire-net-tunisie" aria-current="true">Salaire net</a>'));
  /* Message d'erreur caché quand l'exemple est valide. */
  for (const slug of ['regle-8-pourcent-credit-tunisie', 'remboursement-anticipe-credit-tunisie', 'regroupement-credits-tunisie']) {
    assert.match(voir(slug), /<p class="calc__alerte" data-si-etat="non" hidden data-v="raison"><\/p>/, slug);
  }
  assert.match(voir('remboursement-anticipe-credit-tunisie'), /<p class="verdict" data-si-etat="solde" hidden data-v="solde_txt"><\/p>/);
  assert.ok(voir('regle-8-pourcent-credit-tunisie').includes('value="01/2024"'));
});
