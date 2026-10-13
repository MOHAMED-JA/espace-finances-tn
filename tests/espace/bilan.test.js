'use strict';
/* Bilan annuel en PDF (13 oct. 2026). Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OI = require('../../public/espace/js/orbite-intelligence.js');
const AN = require('../../public/espace/js/annee-calcul.js');
const DC = require('../../public/espace/js/decider-calcul.js');
const BC = require('../../public/espace/js/bilan-calcul.js');

const M = new Date('2026-10-13T12:00:00');
const P = {
  prenom: 'Sami', nom: 'Fictif', montant: 3200, sens: 'brut', nombreSalaires: 14, situation: 'marie', chefDeFamille: true,
  epargneDisponible: 4000, employeur: 'Société fictive', poste: 'Ingénieur', telephone: '+216 20 000 000',
  credits: [
    { type: 'immo', libelle: 'Crédit immobilier', tauxPct: 3, mensualite: 650, moisRestants: 200, capitalRestant: 98000 },
    { type: 'auto', libelle: 'Crédit auto', tauxPct: 9, mensualite: 520, moisRestants: 48 }
  ],
  contrats: [{ type: 'av', libelle: 'Assurance vie', anneeDebut: 2022, moisDebut: 1, versementMensuel: 150 }],
  patrimoine: { logement: 260000 }
};
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.01), (msg || '') + ' : ' + a + ' ≠ ' + b);

test('chiffres repris des moteurs : année, crédits, patrimoine, score', () => {
  const b = BC.construire(P, {}, M);
  const an = AN.bilan(P, {}, M), sal = an.cartes.find((c) => c.id === 'salaire').salaire;
  assert.equal(b.annee, 2026);
  assert.equal(b.periode, 'Janvier à octobre 2026');
  proche(b.revenus.net, sal.net, 0.001, 'net de l\'année');
  proche(b.revenus.impot, sal.impot, 0.001, 'impôt');
  proche(b.cles.net, b.revenus.net, 0, 'tuile = section');
  const sy = OC.synthese(OC.normaliser(P), {}, M);
  assert.equal(b.cles.score, OI.scoreSante(sy, { maintenant: M }).score);
  assert.deepEqual(b.credits.liste.map((c) => c.fin), ['mai 2043', 'septembre 2030']);
  assert.ok(b.credits.liste[1].estime && !b.credits.liste[0].estime, 'reste dû estimé signalé');
  proche(b.patrimoine.net, DC.patrimoine(sy).net, 0.001, 'patrimoine net');
  proche(b.credits.charges, 1170, 0.001);
  assert.ok(b.sante.composantes.length === 6 && b.sante.conseils.length >= 1);
});

test('sections : coordonnées seulement si cochées, sections décochées absentes', () => {
  const sans = BC.construire(P, {}, M);
  assert.equal(sans.coordonnees, undefined, 'coordonnées non cochées par défaut');
  assert.deepEqual(BC.PAR_DEFAUT, { revenus: true, credits: true, patrimoine: true, sante: true, coordonnees: false });
  const avec = BC.construire(P, {}, M, { coordonnees: true, credits: false, sante: false }, { email: 'sami@exemple.tn' });
  assert.deepEqual(avec.coordonnees, { nom: 'Sami Fictif', email: 'sami@exemple.tn', telephone: OC.formatTelephone(OC.normaliser(P).telephone), employeur: 'Société fictive', poste: 'Ingénieur', dateEmbauche: '' });
  assert.equal(avec.credits, undefined);
  assert.equal(avec.sante, undefined);
  assert.ok(avec.revenus && avec.patrimoine);
  assert.equal(BC.nomFichier(avec), 'bilan-orbite-2026.pdf');
});

test('janvier : l\'année précédente complète', () => {
  const b = BC.construire(P, {}, new Date('2027-01-10T12:00:00'));
  assert.equal(b.annee, 2026);
  assert.ok(b.complete);
  assert.equal(b.periode, 'Année 2026');
});

test('PDF : généré sans erreur (jsPDF local), caractères remplacés, coordonnées absentes si non cochées', async () => {
  global.self = global;
  global.jspdf = require('../../public/espace/vendor/jspdf.umd.min.js');
  require('../../public/espace/js/bilan-pdf.js');
  const PDF = global.BilanPDF;
  assert.equal(PDF._txt('a → b ÷ 12 − 3'), 'a -> b / 12 - 3');
  const lire = async (blob) => Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const t1 = await lire(PDF.generer(BC.construire(P, {}, M, { coordonnees: true }, { email: 'sami@exemple.tn' })));
  assert.match(t1, /^%PDF-/);
  assert.ok((t1.match(/\/Type \/Page\b/g) || []).length >= 1);
  const t2 = await lire(PDF.generer(BC.construire(P, {}, M)));
  assert.ok(t1.length > t2.length, 'la section coordonnées ajoute du contenu');
  const vide = PDF.generer(BC.construire({}, {}, M));
  assert.ok(vide.size > 1000, 'profil vide : PDF quand même');
  delete global.jspdf; delete global.BilanPDF;
});
