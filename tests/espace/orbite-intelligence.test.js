'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../public/espace/js/orbite-intelligence.js');
const O = require('../../public/espace/js/orbite-calcul.js');
const MF = require('../../public/moteurs/vie/moteur-fiscal.js');

const MAINTENANT = new Date('2026-10-09T12:00:00');
/* Profil proche de celui de l'utilisateur : 4 000 DT brut × 17, trois crédits, un contrat d'assurance vie. */
const PROFIL = {
  montant: 4000, sens: 'brut', nombreSalaires: 17, situation: 'marie', chefDeFamille: true, anneeNaissance: 1992,
  baseBanque: 'brut', epargneDisponible: 5000, chargesFixes: 600,
  credits: [
    { type: 'immo', libelle: 'Crédit immobilier', tauxPct: 4.5, mensualite: 875.894, moisRestants: 148 },
    { type: 'auto', libelle: 'Crédit automobile', tauxPct: 4.5, mensualite: 695.008, moisRestants: 65 },
    { type: 'autre', libelle: 'Crédit mariage', tauxPct: 2, mensualite: 497.93, moisRestants: 68 }
  ],
  contrats: [{ type: 'av', libelle: 'Contrat', anneeDebut: 2021, moisDebut: 12, versementMensuel: 100 }]
};
const sy = (p) => O.synthese(p, {}, MAINTENANT);

test('score de santé : entre 0 et 100, somme des composantes, objectifs triés par gain', () => {
  const s = I.scoreSante(sy(PROFIL), { maintenant: MAINTENANT });
  assert.ok(s.score >= 0 && s.score <= 100);
  assert.equal(s.score, s.composantes.reduce((t, c) => t + c.points, 0));
  assert.equal(s.composantes.reduce((t, c) => t + c.max, 0), 100);
  assert.deepEqual(s.composantes.map((c) => c.cle), ['endettement', 'budget', 'precaution', 'long_terme', 'fiscal', 'taux']);
  s.composantes.forEach((c) => assert.ok(c.points >= 0 && c.points <= c.max, c.cle));
  assert.ok(s.objectifs.length >= 1 && s.objectifs.length <= 3);
  for (let i = 1; i < s.objectifs.length; i++) assert.ok(s.objectifs[i - 1].gain >= s.objectifs[i].gain);
  s.objectifs.forEach((o) => assert.match(o.lien, /^#/));
  /* Endettement à 37 % du brut pour 40 % admis : 12 points sur 25, et la date où il redevient confortable. */
  const end = s.composantes[0];
  assert.equal(end.points, 12);
  assert.match(end.action, /mars 2032/);
  assert.equal(s.composantes[5].points, 10, 'taux inférieurs au marché');
});

test('score de santé : un profil sans dette, avec réserve et épargne, est excellent', () => {
  const p = { montant: 3000, sens: 'brut', anneeNaissance: 1990, epargneDisponible: 30000, loyer: 500, chargesFixes: 300,
    contrats: [{ type: 'av', libelle: 'AV', anneeDebut: 2020, versementMensuel: 300 }] };
  const s = I.scoreSante(sy(p), { maintenant: MAINTENANT });
  assert.equal(s.composantes[0].points, 25);
  assert.equal(s.composantes[2].points, 20);
  assert.ok(s.score >= 80, String(s.score));
  assert.equal(s.niveau, 'Excellente');
});

test('score de santé : un budget déficitaire et sans épargne est à redresser', () => {
  const p = { montant: 1200, sens: 'brut', anneeNaissance: 1995, loyer: 600, chargesFixes: 400,
    credits: [{ type: 'conso', libelle: 'Crédit conso', tauxPct: 14, mensualite: 400, moisRestants: 30 }] };
  const s = I.scoreSante(sy(p), { maintenant: MAINTENANT });
  assert.equal(s.composantes[1].points, 0, 'reste à vivre négatif');
  assert.equal(s.composantes[2].points, 0);
  assert.ok(s.composantes[5].points < 10, 'taux au-dessus du marché');
  assert.ok(s.score < 40, String(s.score));
  assert.equal(s.niveau, 'À redresser');
});

test("optimiseur fiscal : le complément atteint l'économie maximale, sans dépasser les plafonds", () => {
  const o = I.optimiseurFiscal(sy(PROFIL), { maintenant: MAINTENANT });
  assert.equal(o.statut, 'a_optimiser');
  assert.deepEqual(o.actuel, { av: 1200, cea: 0 });
  assert.ok(o.economieMax > o.economieActuelle);
  assert.ok(Math.abs(o.economieOptimum - o.economieMax) <= 2, o.economieOptimum + ' vs ' + o.economieMax);
  assert.equal(o.complement.total, o.complement.av + o.complement.cea);
  assert.ok(o.optimum.av <= o.plafonds.av && o.optimum.cea <= o.plafonds.cea);
  /* Vérification indépendante avec le moteur fiscal. */
  const e = MF.simuler({ revenu: sy(PROFIL).salaire.revenuFiscal, chef: true, enfants: 0, investissementAv: o.optimum.av, investissementCea: o.optimum.cea }).economie;
  assert.ok(Math.abs(e - o.economieOptimum) < 1);
  /* Un montant plus petit n'atteint pas l'optimum (le complément est minimal, à la recherche près). */
  const moins = MF.simuler({ revenu: sy(PROFIL).salaire.revenuFiscal, chef: true, investissementAv: o.optimum.av - 300, investissementCea: o.optimum.cea - 300 }).economie;
  assert.ok(moins < o.economieMax - 1);
  assert.equal(o.joursAvantFin, 84);
  assert.equal(o.moisRestants, 3);
  assert.equal(o.rappel, true, 'rappel dans les trois derniers mois');
});

test('optimiseur fiscal : budget limité → meilleure répartition de ce budget', () => {
  const o = I.optimiseurFiscal(sy(PROFIL), { maintenant: MAINTENANT, budgetAnnuel: 3000 });
  assert.ok(o.avecBudget);
  assert.ok(Math.abs(o.avecBudget.av + o.avecBudget.cea - 3000) <= 20);
  assert.ok(o.avecBudget.gain > 0 && o.avecBudget.economie <= o.economieMax);
  /* Aucune autre répartition testée des 3 000 DT ne fait mieux. */
  const base = sy(PROFIL).salaire.revenuFiscal;
  for (let av = 0; av <= 3000; av += 500) {
    const e = MF.simuler({ revenu: base, chef: true, investissementAv: 1200 + av, investissementCea: 3000 - av }).economie;
    assert.ok(e <= o.avecBudget.economie + 1, av + ' : ' + e);
  }
});

test("optimiseur fiscal : sans impôt, rien à optimiser ; en janvier, pas de rappel", () => {
  const petit = I.optimiseurFiscal(sy({ montant: 500, sens: 'brut', anneeNaissance: 2000 }), { maintenant: MAINTENANT });
  assert.equal(petit.statut, 'sans_impot');
  const janvier = I.optimiseurFiscal(sy(PROFIL), { maintenant: new Date('2026-01-10T12:00:00') });
  assert.equal(janvier.rappel, false);
  assert.equal(janvier.moisRestants, 12);
});

test('simulateur de vie : naissance et voiture, recalcul complet avant / après', () => {
  const v = I.simulateurVie(PROFIL, [{ type: 'naissance' }, { type: 'voiture', prix: 60000, apport: 10000, dureeAns: 7 }], MAINTENANT);
  assert.equal(v.evenements.length, 2);
  const l = Object.fromEntries(v.lignes.map((x) => [x.cle, x]));
  assert.ok(l.impotAnnuel.apres < l.impotAnnuel.avant, "un enfant de plus réduit l'impôt");
  assert.equal(l.impotAnnuel.sens, 'mieux');
  assert.ok(l.reste.apres < l.reste.avant);
  assert.equal(l.epargneDisponible.apres, 0, "l'apport est pris sur l'épargne");
  assert.equal(v.profilApres.enfants, 1);
  const cr = v.profilApres.credits[v.profilApres.credits.length - 1];
  assert.equal(cr.type, 'auto');
  assert.equal(cr.moisRestants, 84, '7 ans au plus');
  assert.equal(cr.tauxPct, 4.5, 'taux du crédit auto en cours');
  assert.ok(Math.abs(cr.mensualite - O.mensualitePourCapital(50000, 4.5, 84)) < 0.01);
  assert.ok(v.alertes.some((a) => /40 %/.test(a)), 'endettement au-delà de 40 %');
  /* Le profil d'origine n'est pas modifié. */
  assert.equal(PROFIL.credits.length, 3);
});

test('simulateur de vie : augmentation, mutation avec loyer, achat immobilier qui supprime le loyer', () => {
  const p = { montant: 2500, sens: 'brut', anneeNaissance: 1993, loyer: 700, epargneDisponible: 40000 };
  const aug = I.simulateurVie(p, [{ type: 'augmentation', pct: 10 }], MAINTENANT);
  const n = aug.lignes.find((x) => x.cle === 'netMensuel');
  assert.ok(n.apres > n.avant && n.sens === 'mieux');
  const mut = I.simulateurVie(p, [{ type: 'mutation', pctSalaire: 5, loyer: 900 }], MAINTENANT);
  assert.equal(mut.profilApres.loyer, 900);
  const immo = I.simulateurVie(p, [{ type: 'immobilier', prix: 200000, apport: 40000, dureeAns: 25, tauxPct: 9, quitterLocation: true }], MAINTENANT);
  assert.equal(immo.profilApres.loyer, 0);
  assert.equal(immo.profilApres.credits[0].moisRestants, 300);
  assert.equal(immo.apres.epargneDisponible, 0);
  /* Événement inconnu ignoré. */
  assert.equal(I.simulateurVie(p, [{ type: 'loterie' }], MAINTENANT).evenements.length, 0);
});
