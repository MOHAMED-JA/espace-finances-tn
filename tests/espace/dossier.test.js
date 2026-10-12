'use strict';
/* « Mon dossier banque » : revenus selon la règle de la banque, crédits en cours, capacité, crédit demandé, deux noms, PDF. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const D = require('../../public/espace/js/dossier-calcul.js');

const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const M = new Date(2026, 9, 12, 12);
const PROFIL = {
  prenom: 'Aziz', nom: 'Démo', dateNaissance: '1988-03-14', dateEmbauche: '2014-09-01', montant: 3000, sens: 'brut',
  employeur: 'Société Exemple SA', poste: "Chargé d'études", banque: 'Banque Exemple', telephone: '+21620000000',
  credits: [{ type: 'auto', libelle: 'Crédit auto', mensualite: 520, tauxPct: 10.5, dureeMois: 84, moisDebut: 4, anneeDebut: 2022 }]
};
const sy = (p) => OC.synthese(Object.assign({}, PROFIL, p || {}), {}, M);

test('profil : employeur et poste gardés, nettoyés et bornés', () => {
  const p = OC.normaliser({ employeur: '  <b>ACME</b>  ', poste: 'x'.repeat(80) });
  assert.equal(p.employeur, 'bACME/b');
  assert.equal(p.poste.length, 60);
  assert.equal(OC.normaliser({}).employeur, '');
});

test('demandeur, revenus retenus (net de l\'année ÷ 12) et crédit en cours au reste dû estimé', () => {
  const d = D.construire(sy(), null, {}, M);
  assert.equal(d.demandeur.nom, 'Aziz Démo');
  assert.equal(d.demandeur.dateNaissance, '14/03/1988');
  assert.equal(d.demandeur.age, 38);
  assert.equal(d.demandeur.employeur, 'Société Exemple SA');
  assert.equal(d.demandeur.anciennete, 12);
  assert.equal(d.demandeur.telephone, '+216 20 000 000');
  proche(d.revenus.netMensuel, 2161.884);
  proche(d.revenus.retenu, 2161.884);
  assert.equal(d.revenus.regle, "Net de l'année ÷ 12");
  assert.equal(d.credits.length, 1);
  assert.equal(d.credits[0].fin, 'avril 2029');
  assert.equal(d.credits[0].estime, true);
  proche(d.credits[0].capitalRestant, 13668.272);
  assert.match(d.reference, /^DB-20261012-[0-9A-Z]{4}$/);
});

test('capacité seule : 40 % du revenu moins les crédits, montant maximum par type, étapes dans le temps', () => {
  const d = D.construire(sy(), null, {}, M);
  assert.equal(d.demande, null);
  proche(d.capacite.plafond, 864.754);
  proche(d.capacite.disponible, 344.754);
  proche(d.capacite.endettement, 520 / 2161.884, 1e-9);
  assert.deepEqual(d.maxParType.map((x) => x.type), ['immo', 'auto', 'conso']);
  proche(d.maxParType[2].capital, 20134.611);
  assert.deepEqual(d.paliers.map((x) => x.date), ["Aujourd'hui", 'Avril 2029']);
  assert.equal(d.paliers[1].evenement, 'Fin du crédit auto');
  proche(d.paliers[1].disponible, 864.754);
});

test('crédit demandé : mensualité, endettement avant → après, plafond respecté, échéancier qui solde le capital', () => {
  const d = D.construire(sy(), { type: 'conso', montant: 15000, dureeMois: 84, objet: 'Équipement' }, {}, M);
  const dm = d.demande;
  assert.equal(dm.tauxPct, 11);  /* taux du marché repris quand rien n'est saisi */
  proche(dm.mensualite, 256.837);
  proche(dm.endettementApres, (520 + dm.mensualite) / 2161.884, 1e-9);
  assert.equal(dm.respecte, true);
  proche(dm.capitalMax, 20134.611);
  assert.equal(dm.echeancier.length, 7);
  proche(dm.echeancier.reduce((t, l) => t + l.capital, 0), 15000);
  proche(dm.echeancier[6].reste, 0);
  proche(dm.interets, 6574.270);
  assert.ok(d.pieces.includes("Devis ou facture pro forma de l'objet financé"));
});

test('crédit demandé trop lourd : plafond dépassé, dépassement chiffré ; durée bornée par type', () => {
  const d = D.construire(sy(), { type: 'immo', montant: 120000, dureeMois: 999, tauxPct: 10 }, {}, M);
  assert.equal(d.demande.dureeMois, 300);
  assert.equal(d.demande.respecte, false);
  proche(d.demande.depassement, 520 + d.demande.mensualite - 864.7536);
  assert.equal(D.construire(sy(), { type: 'auto', montant: 10000, dureeMois: 120 }, {}, M).demande.dureeMois, 84);
  assert.equal(D.construire(sy(), { type: 'auto', montant: 0 }, {}, M).demande, null);
  assert.equal(D.construire(sy(), { type: 'inconnu', montant: 5000 }, {}, M).demande, null);
});

test('fin du crédit après 70 ans signalée', () => {
  const d = D.construire(sy({ dateNaissance: '1965-01-01' }), { type: 'immo', montant: 50000, dureeMois: 240 }, {}, M);
  assert.equal(d.demande.dureeTropLongue, true);
  assert.equal(d.demande.ageFin, 81);
});

test('dossier à deux noms : revenus additionnés et crédits du conjoint déduits ; ignoré hors mode foyer', () => {
  const s2 = sy({ foyer: true, situation: 'marie', conjointPrenom: 'Sarra', conjointMontant: 2200, conjointCredits: 150 });
  const seul = D.construire(s2, null, {}, M), deux = D.construire(s2, null, { deuxNoms: true }, M);
  assert.equal(seul.deuxNoms, false);
  assert.equal(deux.deuxNoms, true);
  assert.equal(deux.conjoint.prenom, 'Sarra');
  proche(deux.capacite.revenu, seul.capacite.revenu + deux.conjoint.retenu);
  proche(deux.capacite.charges, 520 + 150);
  assert.equal(deux.paliers.length, 0);
  assert.ok(deux.pieces.includes('Les mêmes pièces pour le co-emprunteur'));
  assert.equal(D.construire(sy(), null, { deuxNoms: true }, M).deuxNoms, false);
});

test('retraité : pas d\'employeur, pièces de pension', () => {
  const d = D.construire(sy({ activite: 'retraite', caissePension: 'cnrps', montant: 1800 }), null, {}, M);
  assert.equal(d.retraite, true);
  assert.equal(d.demandeur.employeur, '');
  assert.match(d.demandeur.contrat, /CNRPS/);
  assert.ok(d.pieces.some((x) => /Attestation de pension \(CNRPS\)/.test(x)));
  assert.ok(!d.pieces.includes('3 dernières fiches de paie'));
});

test('base brut : revenu retenu sur le brut de l\'année ÷ 12', () => {
  const d = D.construire(sy({ baseBanque: 'brut' }), null, {}, M);
  assert.equal(d.base, 'brut');
  proche(d.revenus.retenu, 3000);
  assert.equal(d.revenus.regle, "Brut de l'année ÷ 12");
});

test('PDF : généré sans erreur (jsPDF local), deux pages, caractères remplacés', async () => {
  global.self = global;
  global.jspdf = require('../../public/espace/vendor/jspdf.umd.min.js');
  require('../../public/espace/js/dossier-pdf.js');
  const P = global.DossierPDF;
  assert.equal(P._txt('a b → c'), 'a b -> c');
  assert.equal(P._dt3(1234567.8915), '1 234 567,892 DT');
  const d = D.construire(sy(), { type: 'conso', montant: 15000, dureeMois: 84 }, {}, M);
  const blob = P.generer(d);
  const texte = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(texte, /^%PDF-/);
  assert.equal((texte.match(/\/Type \/Page\b/g) || []).length, 2);
  const sans = P.generer(D.construire(sy(), null, { pieces: false, paliers: false }, M));
  assert.ok(sans.size > 1000);
  delete global.jspdf; delete global.DossierPDF;
});
