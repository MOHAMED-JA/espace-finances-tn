'use strict';
/* Ma réserve de sécurité (15 oct. 2026) : une seule définition des dépenses, objectif, chemin, partage avec le plan. Profils fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OI = require('../../public/espace/js/orbite-intelligence.js');
const D = require('../../public/espace/js/decider-calcul.js');
const PG = require('../../public/espace/js/progression-calcul.js');

const M = new Date('2026-10-14T12:00:00');
const P = {
  montant: 3600, sens: 'brut', nombreSalaires: 14, calendrierPrimes: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], situation: 'marie', chefDeFamille: true, jourPaie: 26,
  epargneDisponible: 1200,
  credits: [{ type: 'immo', tauxPct: 3, mensualite: 650, moisRestants: 200, capitalRestant: 98000 }, { type: 'auto', libelle: 'Crédit auto', tauxPct: 9, mensualite: 420, moisRestants: 48 }],
  contrats: [{ type: 'av', anneeDebut: 2022, moisDebut: 1, versementMensuel: 150 }]
};
const sy = (x) => OC.synthese(OC.normaliser(Object.assign({}, P, x || {})), {}, M);
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.01), (msg || '') + ' : ' + a + ' ≠ ' + b);

test('dépenses d\'un mois : crédits, logement, contrats, vie (budget ou estimation), plancher à 30 % du net', () => {
  const s = sy(), d = OC.depensesMois(s), net = s.salaire.netMensuel;
  assert.equal(d.source, 'estimation');
  proche(d.base, net - 1070 - 150, 0.001);
  proche(d.vie, d.base / 2, 0.001);
  proche(d.total, 1070 + 150 + d.vie, 0.001);
  const b = OC.depensesMois(sy({ budget: { enveloppes: [{ cle: 'courses', prevu: 400 }, { cle: 'loisirs', prevu: 100 }, { cle: 'logement', prevu: 80 }] } }));
  assert.equal(b.source, 'budget');
  proche(b.vie, 580, 0.001, 'logement du budget au-delà du profil compté');
  const vide = OC.depensesMois(sy({ credits: [], contrats: [], budget: { enveloppes: [{ cle: 'courses', prevu: 10 }] } }));
  assert.ok(vide.plancher && Math.abs(vide.total - net * 0.3) < 0.001);
});

test('une seule cible partout : réserve, score de santé, Décider, objectifs, plan de versement', () => {
  const s = sy(), dep = OC.depensesMois(s).total, cible = Math.round(3 * dep / 100) * 100;
  assert.equal(OC.cibleReserve(s), cible);
  assert.equal(OC.cibleReserve(sy({ reserve: { mois: 6 } })), Math.round(6 * dep / 100) * 100);
  assert.equal(OC.cibleReserve(sy({ reserve: { mois: 0, montant: 4321 } })), 4321);
  assert.equal(OI.reserve(s, {}, { maintenant: M }).cible, cible);
  assert.equal(D.comparer(s, { somme: 1000 }).reserve.cible, cible);
  assert.equal(OI.planVersement(s, {}, { maintenant: M }).epargne.reserveConseillee, cible);
  assert.equal(PG.ciblePrecaution(s, s.profil, 6), Math.round(6 * dep / 100) * 100);
  const sc = OI.scoreSante(s, { maintenant: M }).composantes.find((c) => c.cle === 'precaution');
  assert.match(sc.action, /réserve de sécurité/);
  assert.equal(sc.lien, '#progression?onglet=objectifs&reserve=1');
});

test('chemin : part de la marge chaque jour de paie et des primes, date d\'atteinte, points cumulés', () => {
  const s = sy(), r = OI.reserve(s, {}, { maintenant: M }), d = OC.depensesMois(s);
  assert.equal(r.statut, 'en_cours');
  assert.equal(r.manque, r.cible - 1200);
  assert.equal(r.mensuel, Math.floor(d.libre * 0.5 / 10) * 10);
  assert.ok(r.dateAtteinte instanceof Date && r.dateAtteinte > M);
  const der = r.points[r.points.length - 1];
  assert.ok(der.cumul >= r.cible - 0.5 && der.cumul < r.cible + r.mensuel + 2000, 'on s\'arrête à la cible');
  assert.ok(r.points.some((p) => p.prime && p.date.getMonth() === 11), 'prime de décembre');
  assert.equal(r.points[0].cumul, 1200);
  for (let i = 1; i < r.points.length; i++) assert.ok(r.points[i].cumul > r.points[i - 1].cumul);
  assert.deepEqual(r.reperes.map((x) => x.mois), [1, 3, 6]);
  assert.equal(r.prochainePrime.partReserve, 0.5);
});

test('réserve complète, sans marge ni prime, montant libre', () => {
  const c = OI.reserve(sy({ epargneDisponible: 50000 }), {}, { maintenant: M });
  assert.equal(c.statut, 'complete'); assert.ok(c.complete); assert.equal(c.points.length, 1);
  const z = OI.reserve(sy({ epargneDisponible: 0, nombreSalaires: 12, calendrierPrimes: [], budget: { enveloppes: [{ cle: 'courses', prevu: 5000 }] } }), {}, { maintenant: M });
  assert.equal(z.statut, 'a_commencer'); assert.equal(z.mensuel, 0); assert.equal(z.dateAtteinte, null);
  const l = OI.reserve(sy(), { mois: 0, montant: 2000 }, { maintenant: M });
  assert.equal(l.cible, 2000);
});

test('partage avec le plan de versement : la réserve d\'abord, le plan dans ce qui reste', () => {
  /* Réserve à construire : le plan ne prend pas plus que ce que la réserve laisse. */
  const s = sy(), r = OI.reserve(s, {}, { maintenant: M }), p = OI.planVersement(s, { partMarge: 1, partPrimes: 1 }, { maintenant: M });
  const libre = OC.depensesMois(s).libre;
  assert.ok(p.marge.reserve > 0);
  assert.ok(p.marge.mensuel <= Math.floor((libre - r.mensuel) / 10) * 10 + 10, 'marge partagée');
  const dec = p.primes.liste.find((x) => x.mois === 11);
  assert.ok(dec.reserve > 0 && dec.montant + dec.reserve <= dec.net + 0.001, 'prime partagée');
  /* Réserve complète : le plan reprend toute sa part. */
  const s2 = sy({ epargneDisponible: 50000 }), p2 = OI.planVersement(s2, { partMarge: 1, partPrimes: 1 }, { maintenant: M });
  assert.equal(p2.marge.reserve, 0);
  assert.equal(p2.primes.liste.find((x) => x.mois === 11).reserve, 0);
});

test('ordre conseillé : réserve, impôt de l\'année, crédit le plus cher ; réglages gardés dans le profil', () => {
  const r = OI.reserve(sy(), {}, { maintenant: M });
  assert.deepEqual(r.ordre.map((x) => x.cle), ['reserve', 'impot', 'credit']);
  assert.equal(r.ordre[2].tauxPct, 9);
  assert.deepEqual(OC.normaliser({}).reserve, { mois: 3, montant: null, partMarge: 0.5, partPrimes: 0.5 });
  assert.deepEqual(OC.normaliser({ reserve: { mois: 4, montant: '', partMarge: 2, partPrimes: -1 } }).reserve, { mois: 3, montant: null, partMarge: 1, partPrimes: 0 });
});
