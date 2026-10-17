/* Mon patrimoine (lot A, 16 oct. 2026) : bourse, placements à taux connu, immobilier locatif, or, synthèse. Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../../public/espace/js/placements-calcul.js');
const P = require('../../public/moteurs/salaire/parametres.js');

const FISC = { bareme: P.irpp.bareme, cssTaux: P.css.taux, cssSeuil: P.css.seuilDispense };
const AUJ = '2026-10-16';
const PROFIL = {
  titres: [
    { id: 't1', nom: 'SICAV obligataire A', type: 'sicav_oblig', quantite: 120, investi: 8090, cours: 71.25, coursDu: '2026-10-15' },
    { id: 't2', nom: 'Actions banque X', type: 'action', quantite: 300, investi: 3100, cours: 12.4, coursDu: '2026-10-15' },
    { id: 't3', nom: 'Actions industrie Y', type: 'action', quantite: 150, investi: 2480, cours: 15.8, coursDu: '2026-10-01' },
    { id: 't4', nom: 'FCP mixte B', type: 'fcp', quantite: 40, investi: 3550, cours: 100, coursDu: '2026-09-30' }
  ],
  revenus: [{ d: '2026-05-20', v: 300, lib: 'Dividende banque X' }, { d: '2026-06-10', v: 186 }, { d: '2025-06-10', v: 250 }],
  taux: [
    { id: 'p1', type: 'dat', banque: 'Banque A', montant: 10000, tauxBrut: 8.25, debut: '2025-10-28', fin: '2026-10-28' },
    { id: 'p2', type: 'bta', montant: 10000, tauxBrut: 8.1, fin: '2029-06-30' },
    { id: 'p3', type: 'cse', banque: 'Banque B', montant: 5000, tauxBrut: 6 }
  ],
  biens: [{ id: 'b1', nom: 'Appartement S+2', valeur: 240000, loyer: 750, charges: 1380, credit: 'Crédit logement' }],
  or: [{ id: 'o1', nom: 'Bijoux', grammes: 86, carats: 18, prixAchat: 12200 }, { id: 'o2', nom: 'Lingot', grammes: 20, carats: 24 }],
  coursOr: { g18: 200, du: '2026-10-10' }
};
const CTX = {
  aujourdhui: AUJ, revenuImposable: 25000, fisc: FISC, liquidites: 8000, contrats: 0, inflationDefaut: 5.3,
  credits: [{ libelle: 'Crédit logement', mensualite: 610, tauxPct: 9.5, crd: 92400, actif: true }]
};

test('normaliser : bornes, types, identifiants uniques, revenus triés, prix de l\'or', () => {
  const n = PL.normaliser({ titres: [{ id: 'a', nom: ' <b>X</b> ', type: 'crypto', quantite: -3, cours: '12,5' }, { id: 'a' }],
    taux: [{ type: 'dat', tauxBrut: 99, fin: '2026-02-30' }], or: [{ carats: 19 }],
    revenus: [{ d: '2026-02-01', v: 5 }, { d: 'x', v: 1 }, { d: '2026-01-01', v: 3 }, { d: '2026-03-01', v: -2 }], inflation: '' });
  assert.equal(n.titres[0].nom, 'bX/b');
  assert.equal(n.titres[0].type, 'autre');
  assert.equal(n.titres[0].quantite, 0);
  assert.notEqual(n.titres[1].id, n.titres[0].id);
  assert.equal(n.taux[0].tauxBrut, 30);
  assert.equal(n.taux[0].fin, '');
  assert.equal(n.or[0].carats, 18);
  assert.deepEqual(n.revenus.map((r) => r.d), ['2026-01-01', '2026-02-01']);
  assert.equal(n.inflation, null);
  assert.equal(PL.vide(n), false);
  assert.equal(PL.vide(PL.normaliser(null)), true);
  assert.equal(PL.nouvelId([{ id: 't1' }, { id: 't3' }], 't'), 't2');
});

test('bourse : valeur, plus-value par ligne et au total, répartition, revenus, cours anciens, impôt d\'une vente', () => {
  const a = PL.analyser(PROFIL, CTX).bourse;
  assert.equal(a.valeur, 18640);
  assert.equal(a.revient, 17220);
  assert.equal(a.pv, 1420);
  assert.equal(Math.round(a.pvPct * 1000) / 10, 8.2);
  assert.deepEqual(a.lignes.map((l) => Math.round(l.pvPct * 1000) / 10), [5.7, 20, -4.4, 12.7]);
  assert.deepEqual(a.repartition.map((r) => [r.cle, Math.round(r.part * 100)]), [['sicav_oblig', 46], ['action', 33], ['fcp', 21]]);
  assert.equal(a.revenusAnnee, 486);
  assert.equal(a.revenus12, 486, 'le dividende de juin 2025 est hors des 12 mois');
  assert.equal(a.anciens, 2, 'cours du 1er oct. et du 30 sept. : plus de 7 jours');
  assert.deepEqual(a.venteActions, { pv: 510, abattement: 10000, impot: 0 });
});

test('taux connu : intérêts nets (retenue 20 %, compte spécial d\'épargne déductible), échéances, échus', () => {
  const t = PL.analyser(PROFIL, CTX).taux;
  assert.equal(t.total, 25000);
  assert.deepEqual(t.lignes.map((l) => l.interetsNets), [660, 648, 300]);
  assert.equal(t.interetsNets, 1608);
  assert.equal(Math.round(t.tauxNetMoyen * 100) / 100, 6.43);
  assert.equal(t.prochaine.jours, 12);
  assert.equal(t.prochaine.d, '2026-10-28');
  assert.equal(t.lignes[0].nom, 'Dépôt à terme');
  const echu = PL.analyser(Object.assign({}, PROFIL, { taux: [{ type: 'dat', montant: 5000, tauxBrut: 8, fin: '2026-10-01' }] }), CTX).taux;
  assert.equal(echu.echus, 1);
  assert.equal(echu.total, 0, 'un placement échu n\'est plus compté');
  /* Au-delà de 6 000 DT d'intérêts par an, la part en trop est imposée (20 %). */
  const gros = PL.analyser({ taux: [{ type: 'cse', montant: 150000, tauxBrut: 6 }] }, CTX).taux;
  assert.equal(gros.lignes[0].interetsBruts, 9000);
  assert.equal(gros.lignes[0].retenue, 600);
  assert.equal(gros.plafondEpargneDepasse, true);
});

test('échéance : renouveler ou rembourser le crédit le plus cher', () => {
  const t = PL.analyser(PROFIL, CTX).taux;
  const d = PL.decisionEcheance(t.lignes[0], CTX.credits);
  assert.equal(d.renouveler, 660);
  assert.equal(d.credit.economie, 950);
  assert.equal(d.credit.meilleur, 'rembourser');
  assert.equal(PL.decisionEcheance(t.lignes[0], []).credit, null);
});

test('immobilier : impôt sur les loyers au taux marginal (20 % déduits), rendement net, crédit relié, effort mensuel', () => {
  const im = PL.analyser(PROFIL, CTX).immobilier;
  const b = im.biens[0];
  /* 9 000 DT de loyers − 20 % = 7 200 DT ajoutés à 25 000 : 5 000 à 30 % + 2 200 à 33 % + CSS 0,5 %. */
  assert.equal(b.impot, 2262);
  assert.equal(b.netAn, 5358);
  assert.equal(Math.round(b.rendementNet * 10000) / 100, 2.23);
  assert.deepEqual(b.credit, { libelle: 'Crédit logement', mensualite: 610 });
  assert.equal(b.effortMois, -163.5);
  assert.equal(PL.impotEnPlus(0, 4000, FISC), 0, 'sous le seuil, ni impôt ni CSS');
  const sansCredit = PL.analyser(Object.assign({}, PROFIL, { biens: [{ nom: 'Studio', valeur: 90000, loyer: 400, charges: 300, credit: 'Inconnu' }] }), CTX).immobilier.biens[0];
  assert.equal(sansCredit.credit, null);
});

test('or : prix du gramme selon les carats, plus-value sur les achats connus, cours manquant ou ancien', () => {
  const o = PL.analyser(PROFIL, CTX).or;
  assert.equal(o.lignes[1].prixG, 266.667);
  assert.equal(o.valeur, 22533.34);
  assert.equal(Math.round(o.pvPct * 1000) / 10, 41);
  assert.equal(o.ancien, false);
  const sans = PL.analyser({ or: [{ grammes: 10, carats: 18 }] }, CTX);
  assert.equal(sans.or.sansCours, true);
  assert.ok(sans.points.some((p) => p.cle === 'or' && /à saisir/.test(p.titre)));
});

test('synthèse : répartition, revenus comparés à l\'inflation, points à surveiller', () => {
  const s = PL.analyser(PROFIL, CTX);
  assert.equal(s.vide, false);
  assert.equal(s.total, 314173.34);
  assert.deepEqual(s.repartition.map((r) => [r.cle, Math.round(r.part * 100)]), [['immo', 76], ['taux', 8], ['or', 7], ['bourse', 6], ['liquidites', 3]]);
  assert.equal(s.revenusAn, 5358 + 1608 + 486);
  assert.equal(Math.round(s.rendement * 10) / 10, 2.4);
  assert.equal(s.inflation, 5.3);
  assert.ok(s.reel < 0);
  const cles = s.points.map((p) => p.cle);
  ['concentration', 'inflation', 'echeance', 'cours', 'effort-b1'].forEach((c) => assert.ok(cles.includes(c), c));
  assert.match(s.points.find((p) => p.cle === 'echeance').texte, /10 000 DT le 28 oct\. 2026/);
  assert.equal(PL.analyser(Object.assign({}, PROFIL, { inflation: 1.5 }), CTX).inflation, 1.5, 'inflation saisie prioritaire');
  assert.equal(PL.analyser(null, CTX).vide, true);
  assert.deepEqual(PL.analyser(null, CTX).points, []);
});

test('patrimoine net (Mon orbite) : les placements de Mon patrimoine sont comptés, une seule fois', () => {
  const OC = require('../../public/espace/js/orbite-calcul.js');
  const D = require('../../public/espace/js/decider-calcul.js');
  const base = { montant: 2500, periode: 'mensuel', sens: 'net', secteur: 'prive', epargneDisponible: 8000 };
  const sans = D.patrimoine(OC.synthese(base));
  const avec = D.patrimoine(OC.synthese(Object.assign({}, base, { placements: PROFIL })));
  const lignes = Object.fromEntries(avec.actifs.map((a) => [a.cle, a.montant]));
  assert.equal(lignes['immo-locatif'], 240000);
  assert.equal(lignes.taux, 25000);
  assert.equal(lignes.bourse, 18640);
  assert.equal(lignes.or, 22533.34);
  assert.equal(Math.round(avec.totalActifs - sans.totalActifs), 306173);
  assert.equal(OC.normaliser({ placements: PROFIL }).placements.titres.length, 4, 'gardé par la normalisation du profil');
});
