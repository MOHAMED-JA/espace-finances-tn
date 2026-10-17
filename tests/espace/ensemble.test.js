/* Lot C (17 oct. 2026) : patrimoine 360° (relevés mensuels, ce mois-ci) et liberté financière. Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../public/espace/js/ensemble-calcul.js');

const R = {
  actifs: [{ cle: 'immo-locatif', libelle: 'Immobilier locatif', montant: 240000, estime: true }, { cle: 'taux', libelle: 'Placements à taux connu', montant: 25000 },
    { cle: 'or', libelle: 'Or', montant: 22530 }, { cle: 'bourse', libelle: 'Bourse, SICAV et FCP', montant: 18640 }, { cle: 'epargne', libelle: 'Épargne disponible', montant: 8000 },
    { cle: 'contrats', libelle: 'Assurance vie et CEA', montant: 6400 }, { cle: 'proches', libelle: 'Prêté aux proches', montant: 1300 }],
  passifs: [{ cle: 'credit-0', libelle: 'Crédit logement', montant: 92400 }, { cle: 'proches-dette', libelle: 'Dû à des proches', montant: 500 }],
  totalActifs: 321870, totalPassifs: 92900, net: 228970
};

test('relevé du mois, historique sans mois inventé, lignes 360° avec leur module', () => {
  const i = E.instantane(R, new Date(2026, 9, 17));
  assert.equal(i.m, '2026-10');
  assert.equal(i.net, 228970);
  assert.equal(i.a.or, 22530);
  const h = E.avecInstantane([{ m: '2026-08', net: 1 }, { m: 'x', net: 2 }, { m: '2026-10', net: 5 }], i);
  assert.deepEqual(h.map((x) => x.m), ['2026-08', '2026-10']);
  assert.equal(h[1].net, 228970, 'le relevé du mois remplace l\'ancien');
  assert.equal(E.changeA(h, i), false);
  assert.equal(E.changeA(h, Object.assign({}, i, { net: 1 })), true);
  assert.equal(E.normaliserHistorique(Array.from({ length: 50 }, (_, k) => ({ m: E.cleMois(new Date(2020, k, 1)), net: k }))).length, 36);
  const l = E.lignes360(R);
  assert.equal(l.length, 9);
  assert.deepEqual(l.find((x) => x.cle === 'credit-0'), { cle: 'credit-0', lib: 'Crédit logement (reste dû)', v: -92400, estime: false, lien: '#credit' });
  assert.equal(l.find((x) => x.cle === 'bourse').lien, '#placements?onglet=bourse');
});

test('ce mois-ci : estimé sans relevé précédent, réel avec', () => {
  const i = E.instantane(R, new Date(2026, 9, 17));
  const est = E.ceMois([], i, { credits: [{ crd: 92400, mensualite: 1081, tauxPct: 9.5, actif: true }], versementsEpargne: 400 });
  assert.equal(est.reel, false);
  /* Intérêts du mois : 92 400 × 9,5 % ÷ 12 = 731,5 → capital remboursé 349,5. */
  assert.deepEqual(est.lignes.map((x) => [x.cle, x.v]), [['capital', 350], ['epargne', 400]]);
  assert.equal(est.variation, 750);
  const prec = { m: '2026-09', net: 227790, actifs: 321040, dettes: 93250, a: { 'immo-locatif': 240000, taux: 25000, or: 22300, bourse: 18440, epargne: 7600, contrats: 6400, proches: 1300 } };
  const reel = E.ceMois([prec], i, {});
  assert.equal(reel.reel, true);
  assert.equal(reel.depuis, '2026-09');
  assert.equal(reel.variation, 1180);
  assert.deepEqual(reel.lignes.map((x) => [x.cle, x.v]), [['capital', 350], ['epargne', 400], ['placements', 430]]);
});

test('liberté financière : objectif 25 ans de dépenses, année, leviers en années gagnées', () => {
  const l = E.liberte({ patrimoine: 228970, residence: 0, depensesMois: 2300, epargneMois: 600, rendementReel: 2, tauxRetrait: 4, anneeNaissance: 1990, maintenant: new Date(2026, 9, 17) });
  assert.equal(l.cible, 690000);
  assert.equal(Math.round(l.pct * 100), 33);
  assert.equal(l.revenusMois, 763);
  assert.equal(l.ans, 25);
  assert.ok(l.annee > 2040 && l.annee < 2070, 'année : ' + l.annee);
  assert.equal(l.age, l.annee - 1990);
  assert.equal(l.leviers.length, 3);
  assert.ok(l.leviers[0].ans >= l.leviers[1].ans && l.leviers[1].ans >= l.leviers[2].ans, 'du plus efficace au moins efficace');
  assert.equal(l.leviers[0].cle, 'depenses', 'dépenser moins agit deux fois : objectif plus bas, épargne plus haute');
  const loge = E.liberte({ patrimoine: 228970, residence: 200000, depensesMois: 2300, epargneMois: 600 });
  assert.equal(loge.actuel, 28970, 'le logement occupé ne rapporte rien : retiré');
  assert.equal(E.liberte({ patrimoine: 800000, depensesMois: 2300 }).atteint, true);
  assert.equal(E.liberte({ patrimoine: 0, depensesMois: 2300, epargneMois: 0, rendementReel: 0 }).mois, null);
});
