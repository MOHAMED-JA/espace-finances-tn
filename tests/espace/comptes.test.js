/* Mes comptes (16 oct. 2026) : soldes datés, épargne disponible dérivée, analyse (points forts et faibles). Profils fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/espace/js/comptes-calcul.js');
const R = require('../../public/espace/js/releve-calcul.js');
const OC = require('../../public/espace/js/orbite-calcul.js');

const MAINTENANT = new Date('2026-10-16T12:00:00');

/* Compte courant fictif : salaire le 27, dépenses régulières, point bas le 24 septembre. */
function courant() {
  return { id: 'c1', nom: 'Compte courant', banque: 'Banque A', type: 'courant', soldes: [
    { d: '2026-07-20', v: 900 }, { d: '2026-07-27', v: 3000 }, { d: '2026-08-24', v: 600 }, { d: '2026-08-27', v: 2900 },
    { d: '2026-09-16', v: 1100 }, { d: '2026-09-24', v: 186.04 }, { d: '2026-09-27', v: 2500 }, { d: '2026-10-16', v: 1240.5 }
  ] };
}
const epargne = { id: 'c2', nom: 'Compte épargne', type: 'epargne', soldes: [{ d: '2026-07-01', v: 6000 }, { d: '2026-10-01', v: 6800 }] };

test('normaliser : tri, un solde par jour, bornes, identifiants uniques', () => {
  const l = C.normaliser([
    { id: 'a', nom: '  Courant <b>  ', type: 'x', soldes: [{ d: '2026-10-02', v: '10' }, { d: '2026-10-01', v: 5 }, { d: '2026-10-02', v: 12 }, { d: '2026-02-30', v: 1 }, { d: '2026-10-03', v: 2e9 }] },
    { id: 'a', nom: '', type: 'epargne' }
  ]);
  assert.equal(l.length, 2);
  assert.equal(l[0].nom, 'Courant b');
  assert.equal(l[0].type, 'courant');
  assert.deepEqual(l[0].soldes.map((s) => [s.d, s.v, s.src]), [['2026-10-01', 5, 'saisie'], ['2026-10-02', 12, 'saisie']]);
  assert.notEqual(l[1].id, l[0].id);
  assert.equal(l[1].nom, 'Compte');
  assert.equal(C.normaliser(Array.from({ length: 12 }, () => ({}))).length, C.MAX_COMPTES);
  assert.equal(C.nouvelId([{ id: 'c1' }, { id: 'c3' }]), 'c2');
});

test('solde à une date, total (avant son premier solde, un compte compte pour celui-ci), ajout et retrait', () => {
  const l = C.normaliser([courant(), epargne]);
  assert.equal(C.soldeA(l[0], '2026-09-25'), 186.04);
  assert.equal(C.soldeA(l[0], '2026-07-01'), null);
  assert.equal(C.totalA(l, '2026-07-10'), 6900);
  const l2 = C.ajouterSoldes(l, 'c1', [{ d: '2026-10-16', v: 1300, src: 'releve' }, { d: '2026-10-10', v: 1500 }]);
  assert.equal(C.dernier(l2[0]).v, 1300);
  assert.equal(C.dernier(l2[0]).src, 'releve');
  assert.equal(C.retirerSolde(l2, 'c1', '2026-10-16')[0].soldes.slice(-1)[0].d, '2026-10-10');
});

test('épargne disponible : épargne en entier, courant au-delà des dépenses jusqu\'à la paie, découvert déduit', () => {
  const l = C.normaliser([courant(), epargne]);
  /* Paie le 27 : 11 jours à tenir le 16 octobre ; 2 700 DT de dépenses par mois → coussin 990 DT. */
  const e = C.epargneDisponible(l, { depensesMois: 2700, jourPaie: 27, maintenant: MAINTENANT });
  assert.equal(e.coussin, 990);
  assert.equal(e.libre, 7050.5);
  assert.equal(e.total, 8040.5);
  const dec = C.normaliser([{ id: 'x', type: 'courant', soldes: [{ d: '2026-10-16', v: -200 }] }, epargne]);
  assert.equal(C.epargneDisponible(dec, { depensesMois: 2700, jourPaie: 27, maintenant: MAINTENANT }).libre, 6600);
  assert.equal(C.joursAvantPaie('2026-10-16', 0), 15);
  assert.equal(C.paieApres('2026-10-28', 27), '2026-11-27');
});

test('analyse : point bas avant la paie, jamais à découvert, hausse, réserve incomplète', () => {
  const a = C.analyser([courant(), epargne], { depensesMois: 2700, jourPaie: 27, maintenant: MAINTENANT, cibleReserve: 8100 });
  assert.equal(a.aucun, false);
  assert.equal(a.total, 8040.5);
  assert.equal(a.serie.length, 91);
  assert.deepEqual(a.pointBas, { d: '2026-09-24', v: 186.04, joursAvantPaie: 3 });
  assert.equal(a.joursDecouvert, 0);
  assert.equal(a.tendance30, 940.5); // 16 sept. : 1 100 (courant) + 6 000 (épargne)
  const cles = (ton) => a.points.filter((p) => p.ton === ton).map((p) => p.cle);
  assert.deepEqual(cles('fort'), ['decouvert', 'tendance']);
  assert.deepEqual(cles('faible'), ['fin_mois', 'reserve']);
  const fin = a.points.find((p) => p.cle === 'fin_mois');
  assert.match(fin.texte, /186 DT le 24 sept\., 3 jours avant la paie\. Gardez 550 DT d'avance/);
  assert.match(a.points.find((p) => p.cle === 'reserve').texte, /2,6 mois .* il manque 1 050 DT/);
});

test('analyse : découvert, baisse durable, argent qui dort, soldes anciens, aucun compte', () => {
  const baisse = { id: 'b', nom: 'Courant B', type: 'courant', soldes: [{ d: '2026-07-10', v: 3000 }, { d: '2026-09-10', v: 1500 }, { d: '2026-10-05', v: -120 }, { d: '2026-10-10', v: 400 }] };
  const a = C.analyser([baisse], { depensesMois: 1500, jourPaie: 0, maintenant: MAINTENANT });
  assert.equal(a.joursDecouvert, 5);
  assert.deepEqual(a.points.filter((p) => p.ton === 'faible').map((p) => p.cle), ['decouvert', 'tendance', 'reserve']);
  const dort = { id: 'd', nom: 'Courant', type: 'courant', soldes: [{ d: '2026-08-01', v: 9000 }] };
  const b = C.analyser([dort], { depensesMois: 1500, jourPaie: 0, maintenant: MAINTENANT });
  assert.deepEqual(b.points.filter((p) => p.ton === 'faible').map((p) => p.cle), ['dort', 'anciens']);
  assert.match(b.points.find((p) => p.cle === 'anciens').texte, /Courant : 76 jours/);
  /* Un écart minime (−14 DT) n'est pas une tendance. */
  const stable = { id: 's', nom: 'Courant', type: 'courant', soldes: [{ d: '2026-07-20', v: 1014 }, { d: '2026-09-16', v: 1010 }, { d: '2026-10-16', v: 1000 }] };
  assert.equal(C.analyser([stable], { depensesMois: 900, maintenant: MAINTENANT }).points.some((p) => p.cle === 'tendance'), false);
  assert.equal(C.analyser([], {}).aucun, true);
  assert.equal(C.analyser([{ nom: 'Vide' }], {}).aucun, true);
});

test('dernière analyse gardée : valeurs bornées, date valide', () => {
  assert.equal(C.normaliserAnalyse({ d: 'x' }), null);
  assert.deepEqual(C.normaliserAnalyse({ d: '2026-10-16', avant: { score: 67.6, mois: 2.04, epargne: 6800.4 }, apres: { score: 72, mois: 2.3, epargne: 7050 } }),
    { d: '2026-10-16', compte: '', soldeDu: '2026-10-16', avant: { score: 68, mois: 2, epargne: 6800 }, apres: { score: 72, mois: 2.3, epargne: 7050 } });
});

test('profil : les comptes sont gardés par la normalisation du profil', () => {
  const p = OC.normaliser({ comptes: [courant()], comptesAnalyse: { d: '2026-10-16', avant: {}, apres: {} } });
  assert.equal(p.comptes.length, 1);
  assert.equal(p.comptes[0].soldes.length, 8);
  assert.equal(p.comptesAnalyse.d, '2026-10-16');
});

test('relevé : soldes datés imprimés (ligne « Solde au », colonne Solde, ordre récent → ancien)', () => {
  const pos = (n) => [{ x: 0, fin: 40 }, { x: 50, fin: 200 }, { x: 210, fin: 260 }, { x: 270, fin: 320 }, { x: 330, fin: 380 }].slice(0, n);
  const L = [
    { cellules: ['Date', 'Libellé', 'Débit', 'Crédit', 'Solde'], positions: pos(5) },
    { cellules: ['SOLDE AU 31/08/2026', '1 012,300'], positions: [{ x: 0, fin: 200 }, { x: 330, fin: 380 }] },
    { cellules: ['02/09/2026', 'CB CARREFOUR', '45,000', '967,300'], positions: [{ x: 0, fin: 40 }, { x: 50, fin: 200 }, { x: 210, fin: 260 }, { x: 330, fin: 380 }] },
    { cellules: ['02/09/2026', 'STEG', '60,000', '907,300'], positions: [{ x: 0, fin: 40 }, { x: 50, fin: 200 }, { x: 210, fin: 260 }, { x: 330, fin: 380 }] }
  ];
  const ops = R.depuisLignes(L, MAINTENANT);
  assert.equal(ops.length, 2);
  assert.deepEqual(ops.soldes, [{ d: '2026-08-31', v: 1012.3 }, { d: '2026-09-02', v: 907.3 }]);
  const csv = 'Date;Libellé;Débit;Crédit;Solde\n03/10/2026;SHELL;35,000;;1 100,000\n02/10/2026;AZIZA;20,000;;1 135,000\n02/10/2026;CAFE;5,000;;1 155,000';
  assert.deepEqual(R.depuisCsv(csv, MAINTENANT).soldes, [{ d: '2026-10-02', v: 1135 }, { d: '2026-10-03', v: 1100 }]);
  assert.deepEqual(R.depuisCsv('Date;Libellé;Montant\n03/10/2026;SHELL;-35,000', MAINTENANT).soldes, []);
});

test('découvert bancaire : −10 points dans le score de santé, même sans épargne déclarée', () => {
  const OI = require('../../public/espace/js/orbite-intelligence.js');
  const base = { montant: 2500, periode: 'mensuel', sens: 'net', secteur: 'prive', loyer: 800, jourPaie: 27, enfants: 0 };
  const score = (comptes) => {
    let p = OC.normaliser(Object.assign({}, base, { comptes: C.normaliser(comptes) }));
    const d = C.epargneDisponible(p.comptes, { depensesMois: OC.depensesMois(OC.synthese(p)).total, jourPaie: 27, maintenant: MAINTENANT });
    p = OC.normaliser(Object.assign({}, base, { comptes: p.comptes, epargneDisponible: d.libre }));
    return OI.scoreSante(OC.synthese(p));
  };
  const courant = (v) => [{ id: 'c1', nom: 'Courant', type: 'courant', soldes: [{ d: '2026-10-13', v }] }];
  const sans = score([]), debit = score(courant(-120)), positif = score(courant(1240));
  assert.equal(debit.score, sans.score - 10);
  assert.equal(debit.malus.points, -10);
  assert.equal(positif.score, sans.score);
  assert.equal(positif.malus, null);
  assert.equal(debit.objectifs[0].cle, 'decouvert');
  assert.ok(score(courant(-99999)).score >= 0);
});
