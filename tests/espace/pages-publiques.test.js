'use strict';
/* Pages publiques (salaire net, capacité de crédit, impôt, retraite) : chiffres des mini-calculs, cohérents avec les moteurs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/commun/pages-calcul.js');
const P = require('../../public/moteurs/salaire/parametres.js');

const M = new Date(2026, 9, 11);
const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('salaire : 2 500 DT brut, célibataire, privé → net de l\'accueil, retenues qui s\'additionnent', () => {
  const s = C.salaire({ montant: 2500 }, M);
  proche(s.net, 1849.31);
  proche(s.cotisations, 242);
  proche(s.brut - s.cotisations - s.irpp - s.css, s.net);
  proche(s.parts.net + s.parts.cotisations + s.parts.irpp + s.parts.css, 1, 1e-9);
  assert.equal(s.caisse, 'CNSS');
  proche(s.tauxCotisation, 0.0968, 1e-9);
  assert.equal(s.tranche, 0.3);
});

test('salaire : secteur public (CNRPS), chef de famille et enfants font baisser l\'impôt', () => {
  const pub = C.salaire({ montant: 2500, secteur: 'public' }, M);
  assert.equal(pub.caisse, 'CNRPS');
  proche(pub.tauxCotisation, 0.1295, 1e-9);
  const seul = C.salaire({ montant: 3000 }, M), famille = C.salaire({ montant: 3000, chef: true, enfants: 2 }, M);
  assert.ok(famille.irpp < seul.irpp && famille.net > seul.net);
});

test('salaire : saisies hors bornes ramenées dans les limites, jamais d\'erreur', () => {
  assert.ok(C.salaire({ montant: '' }, M).net > 0);
  assert.ok(C.salaire({ montant: -5, enfants: 99 }, M).net > 0);
  assert.ok(isFinite(C.salaire({ montant: 5e9 }, M).net));
});

test('crédit : mensualité maximale = 40 % du net, crédits en cours déduits, capital par type', () => {
  const c = C.credit({ net: 1849.31 }, M);
  proche(c.mensualiteMax, 1849.31 * 0.4, 0.01);
  assert.deepEqual(c.types.map((t) => t.cle), ['immo', 'auto', 'conso']);
  assert.ok(c.types.every((t) => t.capital > 0 && t.dureeMois > 0 && t.taux > 0));
  const avec = C.credit({ net: 1849.31, encours: 300 }, M);
  proche(avec.mensualiteMax, c.mensualiteMax - 300, 0.01);
  assert.ok(avec.types[0].capital < c.types[0].capital);
  const sature = C.credit({ net: 1000, encours: 900 }, M);
  assert.equal(sature.mensualiteMax, 0);
  assert.ok(sature.types.every((t) => t.capital === 0));
});

test('impôt : versements assurance vie et CEA, gain borné par l\'impôt de l\'année', () => {
  const i = C.impot({ montant: 2500 }, M);
  assert.equal(i.annee, 2026);
  proche(i.impot, 4778.8, 0.01);
  proche(i.gain, 2628.34, 0.01);
  proche(i.av + i.cea, i.total, 1e-9);
  assert.ok(i.gain <= i.impot - i.impotMinimum + 0.01);
  assert.equal(i.jours, 81);
  assert.equal(C.impot({ montant: 400 }, M).gain, 0); // sous le seuil d'imposition : rien à économiser
});

test('retraite : CNSS à 60 ans au taux maximum, CNRPS à 62 ans puis 65 ans', () => {
  const r = C.retraite({ montant: 2500, anneeNaissance: 1990, anneeDebut: 2014 }, M);
  assert.equal(r.etat, 'ok');
  assert.equal(r.caisse, 'CNSS');
  assert.equal(r.age, 60);
  assert.equal(r.annee, 2050);
  assert.equal(r.taux, 80);
  assert.ok(r.net > 0 && r.net <= r.brut);
  const p = C.retraite({ montant: 3200, secteur: 'public', anneeNaissance: 1970, anneeDebut: 1995 }, M);
  assert.equal(p.caisse, 'CNRPS');
  assert.equal(p.age, 62);
  assert.ok(p.tard && p.tard.age === 65 && p.tard.taux > p.taux && p.tard.net > p.net);
});

test('retraite : carrière trop courte ou départ passé, état expliqué sans chiffre', () => {
  const court = C.retraite({ montant: 2500, anneeNaissance: 1968, anneeDebut: 2024 }, M);
  assert.equal(court.etat, 'insuffisant');
  assert.ok(court.raisons.length > 0 && court.net === undefined);
  const passe = C.retraite({ montant: 2500, anneeNaissance: 1950, anneeDebut: 1975 }, M);
  assert.notEqual(passe.etat, 'ok');
});

test('pont : le même salaire donne la capacité logement, l\'impôt évitable et la retraite', () => {
  const p = C.pont({ montant: 2500 }, M);
  proche(p.net, 1849.31);
  assert.equal(p.logement.cle, 'immo');
  proche(p.logement.capital, C.credit({ net: p.net }, M).types[0].capital, 0.5);
  proche(p.gainImpot, C.impot({ montant: 2500 }, M).gain, 1e-9);
  assert.equal(p.retraite.age, 60);
});

test('tableau brut → net et barème : croissants, lus dans les paramètres', () => {
  const t = C.tableauNet(M);
  assert.deepEqual(t.map((l) => l.brut), C.TABLE_BRUTS);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].net > t[i - 1].net && t[i].impot > t[i - 1].impot);
  const b = C.bareme();
  assert.equal(b.length, P.irpp.bareme.length);
  assert.equal(b[0].de, 0);
  assert.equal(b[b.length - 1].a, null);
  assert.ok(b.every((x, i) => i === 0 || x.de === b[i - 1].a));
});

test('les exemples ne vieillissent pas : un an plus tard, même âge de départ, année + 1', () => {
  const a = C.pont({ montant: 2500 }, M), b = C.pont({ montant: 2500 }, new Date(2027, 9, 11));
  assert.equal(b.retraite.age, a.retraite.age);
  assert.equal(b.retraite.annee, a.retraite.annee + 1);
});

test('simulateur de crédit : mensualité à annuités constantes au taux TMM + marge, durée bornée par type', () => {
  const OC = require('../../public/espace/js/orbite-calcul.js');
  const k = C.simulCredit({ type: 'auto', montant: 40000, dureeAns: 7, marge: 3 });
  assert.equal(k.taux, OC.TMM + 3);
  proche(k.mensualite, 674.427);
  proche(k.interets, k.mensualite * 84 - 40000);
  proche(k.total, k.montant + k.interets);
  assert.equal(C.simulCredit({ type: 'auto', dureeAns: 15 }).dureeAns, 7);
  assert.equal(C.simulCredit({ type: 'immo', dureeAns: 30 }).dureeAns, 25);
  assert.equal(C.simulCredit({ type: 'inconnu' }).type, 'auto');
  const a = C.affichage('pret', { type: 'immo', montant: 120000, dureeAns: 20, marge: 2.5 }, M);
  assert.equal(a.taux, '10\u00a0%');
  assert.equal(a.taux_lib, 'TMM 7,5 % + 2,5 points');
  proche(a.parts.capital + a.parts.interets, 1, 1e-9);
});

test('assurance vie : capital de 200 DT par mois sur 10 ans à 6 %, impôt économisé = moteur fiscal (taux marginal 30 %)', () => {
  const a = C.assuranceVie({ montant: 2500, versement: 200, dureeAns: 10, rendement: 6 }, M);
  assert.equal(a.verse, 24000);
  proche(a.capital, 32494.688, 0.01);
  proche(a.interets, a.capital - a.verse);
  assert.equal(a.economie, 720);
  assert.equal(a.dureeMinimale, 8);
  /* Économie plafonnée : jamais plus de 55 % de l'impôt (impôt minimum 45 %). */
  const gros = C.assuranceVie({ montant: 2500, versement: 5000 }, M);
  assert.ok(gros.economie <= gros.impot * (1 - gros.impotMinimumTaux) + 0.01);
  assert.equal(C.affichage('vie', { montant: 400, versement: 200 }, M).eco, '0\u00a0DT');
});

test('CEA : impôt économisé, dépôt utile (impôt minimum 60 %), déblocage au 1er janvier après 5 ans', () => {
  const c = C.cea({ montant: 2500, depot: 3000 }, M);
  assert.equal(c.economie, 900);
  proche(c.impotMinimum, c.impot * 0.6, 0.01);
  assert.ok(c.utile > 3000 && c.utile < 10000);
  assert.equal(c.disponible, 2032);
  const au = C.cea({ montant: 2500, depot: c.utile + 2000 }, M);
  proche(au.economie, c.impot - c.impotMinimum, 0.01);
  assert.equal(C.affichage('cea', { montant: 2500, depot: c.utile + 2000 }, M).etat, 'au_dela');
  assert.equal(C.affichage('cea', { montant: 400, depot: 3000 }, M).etat, 'sans_impot');
  assert.equal(C.affichage('cea', { montant: 2500, depot: 3000 }, M).dispo, '1er janvier 2032');
});
