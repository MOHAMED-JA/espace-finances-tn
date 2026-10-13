'use strict';
/* Import du relevé bancaire (13 oct. 2026). Relevés fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/espace/js/releve-calcul.js');
const B = require('../../public/espace/js/budget-calcul.js');
const FL = require('../../public/espace/js/fiche-lecture.js');

const MAINTENANT = new Date('2026-10-28T12:00:00');

test('montants : formats tunisiens, signes, séparateurs', () => {
  assert.equal(R.montant('1 234,500'), 1234.5);
  assert.equal(R.montant('1.234,500'), 1234.5);
  assert.equal(R.montant('1,234.500'), 1234.5);
  assert.equal(R.montant('84.500'), 84.5);
  assert.equal(R.montant('-84,500'), -84.5);
  assert.equal(R.montant('(60,000)'), -60);
  assert.equal(R.montant('2 290,000 DT'), 2290);
  assert.equal(R.montant('1.234.500'), 1234500);
  assert.ok(Number.isNaN(R.montant('CARREFOUR')));
  assert.ok(R.estMontant('2 290,000') && R.estMontant('-84,500') && !R.estMontant('123456') && !R.estMontant('02/10'));
});

test('dates : jour/mois/année, année courte ou absente, ISO, invalides', () => {
  assert.equal(R.date('02/10/2026'), '2026-10-02');
  assert.equal(R.date('02.10.26'), '2026-10-02');
  assert.equal(R.date('2/10', 2026), '2026-10-02');
  assert.equal(R.date('2026-10-02'), '2026-10-02');
  assert.equal(R.date('31/02/2026'), null);
  assert.equal(R.date('02/10'), null, 'sans année connue');
});

/* Relevé PDF fictif : colonnes Date | Libellé | Valeur | Débit | Crédit | Solde (positions comme pdf.js les donne). */
function pdfFictif() {
  const items = [];
  let y = 100;
  const mot = (x, texte, l) => items.push({ x, y, l: l || texte.length * 5, h: 10, texte, conf: 1 });
  const ligne = (cells) => { cells.forEach(([x, t]) => mot(x, t)); y += 20; };
  ligne([[20, 'BANQUE FICTIVE — Relevé de compte'], [400, 'Période : octobre 2026']]);
  ligne([[20, 'Date'], [90, 'Libellé'], [300, 'Valeur'], [380, 'Débit'], [450, 'Crédit'], [520, 'Solde']]);
  ligne([[90, 'SOLDE AU 30/09/2026'], [515, '1 500,000']]);
  ligne([[20, '02/10'], [90, 'CB CARREFOUR LA MARSA'], [300, '02/10'], [375, '84,500'], [515, '1 415,500']]);
  ligne([[20, '03/10'], [90, 'PAIEMENT AGIL STATION ARIANA'], [300, '03/10'], [375, '60,000'], [515, '1 355,500']]);
  ligne([[20, '05/10'], [90, 'PRLV ECHEANCE PRET'], [300, '05/10'], [370, '650,000'], [515, '705,500']]);
  ligne([[20, '09/10'], [90, 'STEG FACTURE'], [300, '09/10'], [375, '58,000'], [520, '647,500']]);
  ligne([[90, 'REF 2026 0457']]);
  ligne([[20, '12/10'], [90, 'PHARMACIE CENTRALE'], [300, '12/10'], [375, '23,800'], [520, '623,700']]);
  ligne([[20, '14/10'], [90, 'BOUTIQUE INCONNUE'], [300, '14/10'], [375, '15,000'], [520, '608,700']]);
  ligne([[20, '25/10'], [90, 'VIR SALAIRE OCTOBRE'], [300, '25/10'], [440, '2 290,000'], [510, '2 898,700']]);
  ligne([[90, 'TOTAL DES MOUVEMENTS'], [370, '891,300'], [440, '2 290,000']]);
  return FL.lignesDepuisItems(items);
}

test('PDF : colonnes Débit / Crédit repérées, solde de départ, deuxième ligne du libellé, totaux ignorés', () => {
  const ops = R.depuisLignes(pdfFictif(), MAINTENANT);
  assert.deepEqual(ops.map((o) => [o.date, o.montant, o.sens]), [
    ['2026-10-02', 84.5, 'debit'], ['2026-10-03', 60, 'debit'], ['2026-10-05', 650, 'debit'], ['2026-10-09', 58, 'debit'],
    ['2026-10-12', 23.8, 'debit'], ['2026-10-14', 15, 'debit'], ['2026-10-25', 2290, 'credit']]);
  assert.equal(ops[0].libelle, 'CB CARREFOUR LA MARSA');
  assert.equal(ops[3].libelle, 'STEG FACTURE REF 2026 0457', 'libellé sur deux lignes');
  assert.equal(R.periode(ops), "Relevé d'octobre 2026");
});

test('PDF sans en-tête : le sens vient de la variation du solde', () => {
  const lignes = [
    { cellules: ['Solde au 30/09/2026', '1 000,000'] },
    { cellules: ['02/10/2026', 'RETRAIT DAB', '100,000', '900,000'] },
    { cellules: ['04/10/2026', 'REMISE CHEQUE', '250,000', '1 150,000'] }
  ];
  const ops = R.depuisLignes(lignes, MAINTENANT);
  assert.deepEqual(ops.map((o) => o.sens), ['debit', 'credit']);
});

test('CSV : séparateur, en-tête, colonnes débit / crédit ou montant signé, guillemets', () => {
  const csv = '﻿Date opération;Date valeur;Libellé;Débit;Crédit\n02/10/2026;02/10/2026;"CB MONOPRIX; LAC 2";45,600;\n' +
    '25/10/2026;25/10/2026;VIR SALAIRE;;2 290,000\n';
  assert.deepEqual(R.depuisCsv(csv, MAINTENANT), [
    { date: '2026-10-02', libelle: 'CB MONOPRIX; LAC 2', montant: 45.6, sens: 'debit' },
    { date: '2026-10-25', libelle: 'VIR SALAIRE', montant: 2290, sens: 'credit' }]);
  const csv2 = 'date,description,amount\n2026-10-03,SHELL MENZAH,-35.000\n2026-10-04,REMBOURSEMENT,12.500\n';
  assert.deepEqual(R.depuisCsv(csv2, MAINTENANT).map((o) => [o.libelle, o.montant, o.sens]), [['SHELL MENZAH', 35, 'debit'], ['REMBOURSEMENT', 12.5, 'credit']]);
});

test('relevé de décembre lu en janvier : dates sans année ramenées à l\'année d\'avant', () => {
  const ops = R.depuisLignes([{ cellules: ['28/12', 'CB AZIZA', '12,000'] }], new Date('2027-01-05T12:00:00'));
  assert.equal(ops[0].date, '2026-12-28');
});

test('enveloppes : mémoire d\'abord, mensualité d\'un crédit, mots tunisiens, entrées ignorées, Divers par défaut', () => {
  const credits = [{ mensualite: 650 }];
  const cat = (libelle, montant = 10, sens = 'debit', mem) => R.categoriser({ libelle, montant, sens }, mem, credits);
  assert.deepEqual(cat('CB CARREFOUR LA MARSA'), { cle: 'courses', raison: 'mot' });
  assert.equal(cat('PAIEMENT AGIL STATION ARIANA').cle, 'transport');
  assert.equal(cat('STEG FACTURE').cle, 'logement');
  assert.equal(cat('PHARMACIE CENTRALE').cle, 'sante');
  assert.deepEqual(cat('PRLV BANQUE', 650.4), { cle: 'credits', raison: 'credit' });
  assert.deepEqual(cat('VIR SALAIRE', 2290, 'credit'), { cle: 'revenu', raison: 'revenu' });
  assert.deepEqual(cat('BOUTIQUE INCONNUE'), { cle: 'divers', raison: 'defaut' });
  assert.deepEqual(cat('CB CARREFOUR ARIANA', 10, 'debit', { CARREFOUR: 'loisirs' }), { cle: 'loisirs', raison: 'memoire' });
  assert.equal(R.cleMarchand('CB CARREFOUR LA MARSA 02/10'), 'CARREFOUR');
  assert.equal(R.cleMarchand('PRLV 0457 SONEDE'), 'SONEDE');
  assert.equal(R.cleMarchand('BOUTIQUE ELYSSA MENZAH'), 'ELYSSA');
  assert.equal(R.cleMarchand('PHARMACIE'), 'PHARMACIE', 'seul mot : gardé');
});

test('bilan : totaux par mois et par enveloppe, crédit déjà noté non compté deux fois, mois trop anciens écartés', () => {
  const ops = [
    { date: '2026-10-02', montant: 84.5, sens: 'debit', cle: 'courses' },
    { date: '2026-10-08', montant: 15.5, sens: 'debit', cle: 'courses' },
    { date: '2026-10-05', montant: 650, sens: 'debit', cle: 'credits' },
    { date: '2026-09-30', montant: 40, sens: 'debit', cle: 'transport' },
    { date: '2026-10-09', montant: 9, sens: 'debit', cle: 'ignore' },
    { date: '2026-10-25', montant: 2290, sens: 'credit', cle: 'revenu' },
    { date: '2025-09-30', montant: 5, sens: 'debit', cle: 'divers' }
  ];
  const b = R.bilan(ops, { mois: { '2026-10': { credits: 650 } } }, MAINTENANT);
  assert.deepEqual(b.parMois, { '2026-09': { transport: 40 }, '2026-10': { courses: 100 } });
  assert.deepEqual(b.dejaCompte, { '2026-10': true });
  assert.equal(b.total, 140);
  assert.equal(b.horsPeriode, 1);
  /* Sans « Payé » noté : la mensualité est ajoutée. */
  assert.equal(R.bilan(ops, {}, MAINTENANT).parMois['2026-10'].credits, 650);
});

test('appliquer : dépenses ajoutées, plan posé si proposé, mémoire et empreinte gardées, profil normalisé', () => {
  const ops = [{ date: '2026-10-02', montant: 84.5, sens: 'debit', cle: 'courses' }];
  const bl = R.bilan(ops, {}, MAINTENANT), emp = R.empreinte(ops);
  assert.match(emp, /^[0-9a-f]{8}-1$/);
  assert.equal(emp, R.empreinte([{ ...ops[0], libelle: 'autre libellé' }]), 'les libellés ne comptent pas');
  const plan = [{ cle: 'courses', libelle: 'Courses', prevu: 400 }];
  const nb = R.appliquer({ enveloppes: [], mois: { '2026-10': { courses: 10 } } }, bl, { CARREFOUR: 'courses' }, emp, plan);
  assert.deepEqual(nb.mois['2026-10'], { courses: 94.5 });
  assert.deepEqual(nb.enveloppes, plan);
  const n = B.normaliser(nb);
  assert.deepEqual(n.memoire, { CARREFOUR: 'courses' });
  assert.deepEqual(n.imports, [emp]);
  assert.deepEqual(B.normaliser({ memoire: { ab: 'courses', CB: 'x', STEG: 'logement' }, imports: ['nope'] }).memoire, { STEG: 'logement' });
});
