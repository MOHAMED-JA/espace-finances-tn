'use strict';
/* Chronologie de la famille : situation et charges de famille datées. La retenue de chaque mois suit la situation
   du mois ; l'impôt de l'année retient la situation au 1er janvier (Code de l'IRPP, art. 40) ; l'écart se règle
   dans la déclaration annuelle. Profils fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');

const MAINTENANT = new Date(2026, 9, 26);
const MARIE = { situation: 'marie', chefDeFamille: true, enfants: 2, etudiants: 0, handicapes: 0, parents: 0 };
const DIVORCE = { situation: 'divorce', chefDeFamille: false, enfants: 0, etudiants: 0, handicapes: 0, parents: 0 };
function profil(historiqueFamille, extra) {
  return Object.assign(OC.profilParDefaut(), { dateNaissance: '1988-03-01', montant: 3000, sens: 'brut', nombreSalaires: 12,
    situation: 'marie', chefDeFamille: true, enfants: 2, historiqueFamille: historiqueFamille }, extra || {});
}
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
/* Marié·e, chef de famille, 2 enfants jusqu'en mai 2026 ; divorcé·e sans la garde à partir de juin 2026. */
const DIVORCE_JUIN = [Object.assign({ mois: 0, annee: 0 }, MARIE), Object.assign({ mois: 6, annee: 2026 }, DIVORCE)];

test('normalisation : bornes, tri par date, champs inconnus retirés', () => {
  const p = OC.normaliser(profil([{ situation: 'pirate', enfants: 99, parents: 7, mois: 13, annee: 2026, x: 1 }, Object.assign({ mois: 2, annee: 2025 }, DIVORCE)]));
  assert.equal(p.historiqueFamille.length, 2);
  assert.equal(p.historiqueFamille[0].annee, 2025, 'trié');
  const f = p.historiqueFamille[1];
  assert.equal(f.situation, 'celibataire');
  assert.equal(f.enfants, 15);
  assert.equal(f.parents, 2);
  assert.equal(f.mois, 12);
  assert.equal('x' in f, false);
  assert.deepEqual(OC.normaliser({}).historiqueFamille, []);
});

test('situation en vigueur : la dernière date passée ; le profil suit la situation du jour', () => {
  const p = OC.normaliser(profil(DIVORCE_JUIN));
  assert.equal(OC.familleEnVigueur(p, 2026, 4).situation, 'marie', 'mai');
  assert.equal(OC.familleEnVigueur(p, 2026, 5).situation, 'divorce', 'juin');
  assert.equal(OC.appliquerFamille(p, new Date(2026, 4, 10)).change, false);
  const a = OC.appliquerFamille(p, MAINTENANT);
  assert.equal(a.change, true);
  assert.equal(a.profil.chefDeFamille, false);
  assert.equal(a.profil.enfants, 0);
  const sy = OC.synthese(profil(DIVORCE_JUIN), {}, MAINTENANT);
  assert.equal(sy.profil.situation, 'divorce');
  assert.equal(sy.famille.enVigueur.situation, 'divorce');
  assert.equal(sy.famille.futurs.length, 0);
});

test('sans chronologie : rien ne change (pas d\'impôt de l\'année à part)', () => {
  const sy = OC.synthese(profil([]), {}, MAINTENANT);
  assert.equal(sy.famille, null);
  assert.equal(sy.salaireAnnee, null);
  assert.equal(OC.familleVarie(OC.normaliser(profil([])), 2026), false);
});

test('retenue de chaque mois : situation du mois ; impôt de l\'année : situation du 1er janvier ; écart à récupérer', () => {
  const sy = OC.synthese(profil(DIVORCE_JUIN), {}, MAINTENANT);
  const sa = sy.salaireAnnee, marie = OC.synthese(profil([]), {}, MAINTENANT).salaire;
  const seul = OC.synthese(profil([], DIVORCE), {}, MAINTENANT).salaire;
  assert.ok(sa && sa.famille, 'l\'année varie');
  proche(sa.parMois[4].retenue, marie.impotMois);
  proche(sa.parMois[5].retenue, seul.impotMois);
  assert.ok(seul.impotMois > marie.impotMois, 'sans chef de famille ni enfants, la retenue monte');
  assert.equal(sa.parMois[5].famille.situation, 'divorce');
  /* Impôt de l'année : situation au 1er janvier (marié·e, chef de famille, 2 enfants). */
  assert.equal(sa.famille.janvier.situation, 'marie');
  proche(sa.irpp, marie.irpp, 0.05);
  proche(sa.famille.retenues, 5 * marie.impotMois + 7 * seul.impotMois, 0.05);
  proche(sa.famille.retenuesJanvier, 12 * marie.impotMois, 0.05);
  proche(sa.famille.ecart, 7 * (seul.impotMois - marie.impotMois), 0.05);
  assert.ok(sa.famille.ecart > 0, 'trop retenu : à récupérer dans la déclaration');
  assert.equal(sa.famille.changements.length, 1);
  /* Le salaire affiché aujourd'hui est celui de la fiche d'octobre (divorcé·e). */
  proche(sy.salaire.impotMois, seul.impotMois);
});

test('remariage : complément à payer quand la situation devient plus favorable en cours d\'année', () => {
  const h = [Object.assign({ mois: 0, annee: 0 }, DIVORCE), Object.assign({ mois: 9, annee: 2026 }, MARIE)];
  const sa = OC.synthese(profil(h, DIVORCE), {}, MAINTENANT).salaireAnnee;
  assert.equal(sa.famille.janvier.situation, 'divorce');
  assert.ok(sa.famille.ecart < 0, 'moins retenu que dû : complément à payer');
});

test('changement au 1er janvier : toute l\'année suit la nouvelle situation, sans écart', () => {
  const h = [Object.assign({ mois: 0, annee: 0 }, MARIE), Object.assign({ mois: 1, annee: 2026 }, DIVORCE)];
  const p = OC.normaliser(profil(h));
  assert.equal(OC.familleVarie(p, 2026), false);
  assert.equal(OC.familleVarie(p, 2025), false);
  const sy = OC.synthese(profil(h), {}, MAINTENANT);
  assert.equal(sy.salaireAnnee, null);
  assert.equal(sy.profil.situation, 'divorce');
});

test('changement à venir : appliqué tout seul à son mois, l\'année suivante garde le 1er janvier', () => {
  const h = [Object.assign({ mois: 0, annee: 0 }, MARIE), Object.assign({ mois: 3, annee: 2027 }, DIVORCE)];
  const sy = OC.synthese(profil(h), {}, MAINTENANT);
  assert.equal(sy.profil.situation, 'marie');
  assert.equal(sy.famille.futurs.length, 1);
  const an2027 = OC.synthese(profil(h), {}, new Date(2027, 5, 1));
  assert.equal(an2027.profil.situation, 'divorce');
  assert.equal(an2027.salaireAnnee.famille.janvier.situation, 'marie');
});

test('avec une hausse de salaire la même année : les deux chronologies se combinent', () => {
  const sy = OC.synthese(profil(DIVORCE_JUIN, { historiqueSalaire: [{ montant: 3000, sens: 'brut', mois: 0, annee: 0 }, { montant: 3300, sens: 'brut', mois: 8, annee: 2026 }] }), {}, MAINTENANT);
  const sa = sy.salaireAnnee;
  assert.equal(sa.parMois[6].brutMensuel, 3000);
  assert.equal(sa.parMois[7].brutMensuel, 3300);
  assert.equal(sa.parMois[7].famille.situation, 'divorce');
  /* L'écart ne mesure que l'effet de la famille : même salaire de chaque mois, avec la situation du 1er janvier. */
  const s3300 = OC.synthese(profil([], Object.assign({ montant: 3300 }, DIVORCE)), {}, MAINTENANT).salaire;
  const m3300 = OC.synthese(profil([], { montant: 3300 }), {}, MAINTENANT).salaire;
  proche(sa.parMois[7].retenue - sa.parMois[7].retenueJanvier, s3300.impotMois - m3300.impotMois);
});

test('retraité : la pension suit aussi la situation du mois', () => {
  const sy = OC.synthese(profil(DIVORCE_JUIN, { activite: 'retraite', montant: 2500 }), {}, MAINTENANT);
  assert.ok(sy.salaireAnnee && sy.salaireAnnee.famille);
  assert.ok(sy.salaireAnnee.parMois[11].retenue >= sy.salaireAnnee.parMois[0].retenue);
});
