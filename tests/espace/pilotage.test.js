/* Lot B (17 oct. 2026) : factures, assurances, proches, prévision sur 90 jours. Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PI = require('../../public/espace/js/pilotage-calcul.js');

const AUJ = '2026-10-16';

test('normaliser : bornes, catégories, périodes, historique trié, proches', () => {
  const n = PI.normaliser({
    factures: [{ id: 'f1', nom: ' <i>Forfait</i> ', cat: 'crypto', montant: -4, periode: 5, historique: [{ d: '2026-09-05', v: 40 }, { d: '2026-08-05', v: 40 }, { d: 'x', v: 3 }] }, { id: 'f1' }],
    assurances: [{ type: 'moto', prime: '640', couverture: 150, echeance: '2026-02-30' }],
    proches: [{ sens: 'autre', nom: '', montant: 500, recus: [{ d: '2026-10-01', v: 100 }, { d: '2026-09-01', v: 100 }] }]
  });
  assert.equal(n.factures[0].nom, 'iForfait/i');
  assert.equal(n.factures[0].cat, 'autre');
  assert.equal(n.factures[0].montant, 0);
  assert.equal(n.factures[0].periode, 1);
  assert.deepEqual(n.factures[0].historique.map((h) => h.d), ['2026-08-05', '2026-09-05']);
  assert.notEqual(n.factures[1].id, 'f1');
  assert.equal(n.assurances[0].type, 'autre');
  assert.equal(n.assurances[0].prime, 640);
  assert.equal(n.assurances[0].couverture, 100);
  assert.equal(n.assurances[0].echeance, '');
  assert.equal(n.proches[0].sens, 'prete');
  assert.equal(n.proches[0].nom, 'Proche');
  assert.deepEqual(n.proches[0].recus.map((r) => r.d), ['2026-09-01', '2026-10-01']);
});

test('factures repérées dans un relevé : mensuelles, tous les 2 et 3 mois, achats répétés et mensualités écartés', () => {
  const ops = [];
  ['2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05'].forEach((d, i) => ops.push({ date: d, libelle: 'PRLV OOREDOO 216' + i, montant: i < 4 ? 40 : 45, sens: 'debit' }));
  [['2026-05-12', 92], ['2026-07-11', 104], ['2026-09-12', 88]].forEach(([d, v]) => ops.push({ date: d, libelle: 'STEG FACTURE ' + d, montant: v, sens: 'debit' }));
  [['2026-04-03', 11], ['2026-07-03', 12.4]].forEach(([d, v]) => ops.push({ date: d, libelle: 'SONEDE', montant: v, sens: 'debit' }));
  [['2026-06-02', 23], ['2026-07-02', 81], ['2026-08-02', 9]].forEach(([d, v]) => ops.push({ date: d, libelle: 'CARREFOUR MARKET', montant: v, sens: 'debit' }));
  ['2026-07-05', '2026-08-05', '2026-09-05'].forEach((d) => ops.push({ date: d, libelle: 'ECHEANCE PRET', montant: 610, sens: 'debit' }));
  ['2026-07-27', '2026-08-27'].forEach((d) => ops.push({ date: d, libelle: 'VIREMENT SALAIRE', montant: 2300, sens: 'credit' }));
  ['2026-08-10', '2026-09-10'].forEach((d) => ops.push({ date: d, libelle: 'RETRAIT DAB', montant: 200, sens: 'debit' }));
  const t = PI.detecterFactures(ops, [{ id: 'f9', cle: 'SONEDE' }], [{ mensualite: 610 }]);
  const parCle = Object.fromEntries(t.map((x) => [x.cle, x]));
  assert.deepEqual(Object.keys(parCle).sort(), ['OOREDOO', 'SONEDE', 'STEG']);
  assert.equal(parCle.OOREDOO.periode, 1);
  assert.equal(parCle.OOREDOO.cat, 'mobile');
  assert.equal(parCle.OOREDOO.montant, 45);
  assert.equal(parCle.OOREDOO.prochaine, '2026-10-05');
  assert.equal(parCle.STEG.periode, 2);
  assert.equal(parCle.STEG.cat, 'electricite');
  assert.equal(parCle.SONEDE.periode, 3);
  assert.equal(parCle.SONEDE.existe, 'f9');
  const l = PI.fusionner([{ id: 'f9', nom: 'Eau', cat: 'eau', montant: 10, periode: 3, cle: 'SONEDE', historique: [{ d: '2026-01-03', v: 10 }] }], t);
  assert.equal(l.length, 3);
  assert.equal(l[0].historique.length, 3, 'historique fusionné');
  assert.ok(l.every((f) => f.source === 'releve' || f.id === 'f9'));
});

test('factures : coût mensuel, hausses de prix, prochaine date, gain si arrêt', () => {
  const fs = PI.normaliser({ factures: [
    { id: 'f1', nom: 'Forfait mobile', cat: 'mobile', montant: 45, periode: 1, prochaine: '2026-10-05', historique: [{ d: '2026-08-05', v: 40 }, { d: '2026-09-05', v: 45 }] },
    { id: 'f2', nom: 'Électricité', cat: 'electricite', montant: 88, periode: 2, prochaine: '2026-11-12', historique: [{ d: '2026-05-12', v: 92 }, { d: '2026-07-11', v: 104 }, { d: '2026-09-12', v: 88 }] },
    { id: 'f3', nom: 'Salle de sport', cat: 'sport', montant: 60, periode: 1, prochaine: '2026-11-01', aRevoir: true }
  ] }).factures;
  const a = PI.analyserFactures(fs, { aujourdhui: AUJ, netMensuel: 2300, reserve: { manque: 3600, parMois: 300 } });
  assert.equal(a.lignes[0].prochaineEstimee, '2026-11-05', 'date passée repoussée d\'un mois');
  assert.equal(a.lignes[1].mensuel, 47.333);
  assert.equal(a.totalMois, 45 + 47.333 + 60);
  assert.equal(a.hausses.length, 1);
  assert.equal(a.hausses[0].hausse.ecart, 5);
  assert.deepEqual(a.revoir, [{ id: 'f3', nom: 'Salle de sport', gainAn: 720, moisPlusTot: 2 }]);
  assert.equal(Math.round(a.partNet * 100), 7);
  assert.deepEqual(a.prochaines.map((x) => x.id), ['f3', 'f1', 'f2']);
});

test('assurances : vie depuis l\'épargne, bien loué sans habitation, crédit couvert, famille, échéance proche', () => {
  const as = PI.normaliser({ assurances: [
    { id: 'a1', type: 'auto', nom: 'Auto tous risques', assureur: 'Assureur A', prime: 640, echeance: '2025-11-05' },
    { id: 'a2', type: 'deces', prime: 120, credit: 'Crédit logement', couverture: 100 },
    { id: 'a3', type: 'sante', prime: 420, paie: true }
  ] }).assurances;
  const profil = { situation: 'marie', enfants: 1, contrats: [{ type: 'av', libelle: 'Assurance vie', versementMensuel: 50, versementsLibresAn: 200, anneeDebut: 2024, moisDebut: 1 }], patrimoine: { logement: 0 } };
  const r = PI.analyserAssurances(as, { aujourdhui: AUJ, profil, biens: [{ id: 'b1', nom: 'Appartement S+2', loyer: 750 }],
    credits: [{ libelle: 'Crédit logement', type: 'immo', actif: true }, { libelle: 'Crédit conso', type: 'conso', actif: true }] });
  assert.equal(r.lignes.length, 4);
  assert.equal(r.total, 640 + 120 + 420 + 800);
  assert.equal(r.prochaine.d, '2026-11-05');
  assert.equal(r.prochaine.jours, 20);
  const cles = Object.fromEntries(r.verifs.map((v) => [v.cle, v.ton]));
  assert.equal(cles['bien-b1'], 'faible');
  assert.equal(cles['credit-Crédit logement'], 'fort');
  assert.equal(cles['credit-Crédit conso'], 'faible');
  assert.equal(cles.famille, undefined, 'l\'assurance vie protège la famille');
  assert.equal(cles['echeance-a1'], 'faible');
  assert.equal(r.manques, 3);
  const sansVie = PI.analyserAssurances([], { aujourdhui: AUJ, profil: { situation: 'marie', contrats: [] } });
  assert.ok(sansVie.verifs.some((v) => v.cle === 'famille'));
});

test('proches : reste dû, échéancier mensuel, prochain remboursement, retard, solde', () => {
  const xs = PI.normaliser({ proches: [
    { id: 'x1', sens: 'prete', nom: 'K.', montant: 1200, mensualite: 200, debut: '2026-09-01', recus: [{ d: '2026-09-01', v: 200 }, { d: '2026-10-01', v: 200 }] },
    { id: 'x2', sens: 'prete', nom: 'S.', montant: 500, echeance: '2026-11-01' },
    { id: 'x3', sens: 'emprunte', nom: 'Papa', montant: 500, note: 'Pour la voiture' },
    { id: 'x4', sens: 'prete', nom: 'R.', montant: 300, mensualite: 100, debut: '2026-08-15', recus: [{ d: '2026-08-15', v: 100 }] }
  ] }).proches;
  const r = PI.analyserProches(xs, { aujourdhui: AUJ });
  const [k, s, papa, rr] = r.lignes;
  assert.equal(k.reste, 800);
  assert.equal(k.nbEcheances, 6);
  assert.equal(k.payees, 2);
  assert.deepEqual(k.prochaine, { d: '2026-11-01', v: 200 });
  assert.equal(s.jours, 16);
  assert.equal(papa.prochaine, null);
  assert.equal(rr.retard, 200, 'échéances des 15 sept. et 15 oct. non reçues');
  assert.equal(r.onVousDoit, 800 + 500 + 200);
  assert.equal(r.vousDevez, 500);
  assert.equal(r.solde, 1000);
  assert.deepEqual(r.prochains.map((x) => x.nom), ['R.', 'K.', 'S.'], 'le retard d\'abord');
});

test('prévision 90 jours : salaire, crédit, factures, assurance annuelle, découvert repéré et solution', () => {
  const fact = PI.analyserFactures(PI.normaliser({ factures: [
    { id: 'f1', nom: 'Forfait mobile', cat: 'mobile', montant: 45, periode: 1, prochaine: '2026-11-05' }
  ] }).factures, { aujourdhui: AUJ }).lignes;
  const ass = PI.analyserAssurances(PI.normaliser({ assurances: [{ id: 'a1', type: 'auto', nom: 'Auto', prime: 640, echeance: '2025-12-20' }] }).assurances,
    { aujourdhui: AUJ, profil: {} }).lignes;
  const pro = PI.analyserProches(PI.normaliser({ proches: [{ id: 'x2', sens: 'prete', nom: 'S.', montant: 500, echeance: '2026-11-01' }] }).proches, { aujourdhui: AUJ }).lignes;
  const ctx = {
    aujourdhui: AUJ, jours: 90, solde: { v: 1240, d: '2026-10-16' },
    paie: { montant: 2300, jour: 27 }, credits: [{ libelle: 'Crédit logement', mensualite: 610, jour: 5, restantes: 120 }],
    epargne: { montant: 400, jour: 28 }, logement: { montant: 0 }, vieMois: 1600, factures: fact, assurances: ass, proches: pro,
    reserve: { disponible: 5000, depensesMois: 2300 }
  };
  const p = PI.prevision(ctx);
  assert.equal(p.aucun, false);
  assert.equal(p.points[0].d, AUJ);
  assert.equal(p.points[0].v, 1240);
  assert.equal(p.points.length, 91);
  assert.equal(p.fin.d, '2027-01-14');
  /* Dépenses de vie (sans le forfait, déjà compté) : (1600 − 45) × 12 / 365 par jour. */
  assert.equal(p.vieJour, 51.123);
  assert.ok(p.evenements.some((e) => e.type === 'assurance' && e.d === '2026-12-20' && e.v === -640));
  assert.ok(p.evenements.some((e) => e.type === 'proche' && e.d === '2026-11-01' && e.v === 500));
  assert.equal(p.paies.length, 3);
  assert.ok(p.decouvert, 'découvert repéré');
  assert.equal(p.decouvert.cause.type, 'assurance');
  assert.ok(p.decouvert.debut > '2026-12-20' && p.decouvert.debut < '2026-12-27');
  assert.equal(p.decouvert.veillePaie, true);
  assert.equal(p.decouvert.solution.montant % 50, 0);
  assert.ok(p.decouvert.solution.montant >= -p.decouvert.min + 50);
  assert.equal(p.decouvert.solution.le, PI.decaler(p.decouvert.debut, -1));
  assert.ok(p.decouvert.solution.reserveApres > 1.9 && p.decouvert.solution.reserveApres < 2.2);
  /* Sans l'assurance, plus de découvert. */
  const sans = PI.prevision(Object.assign({}, ctx, { assurances: [] }));
  assert.equal(sans.decouvert, null);
  assert.equal(PI.prevision(Object.assign({}, ctx, { solde: null })).aucun, true);
  /* Solde ancien : la prévision part de sa date ; les opérations passées sont comptées. */
  const ancien = PI.prevision(Object.assign({}, ctx, { solde: { v: 1240, d: '2026-10-01' } }));
  assert.equal(ancien.ancien, 15);
  assert.ok(ancien.points[0].v < 1240 - 610, 'mensualité du 5 oct. et dépenses déjà passées');
});

test('crédit qui se termine : plus de mensualité après la dernière échéance', () => {
  const p = PI.prevision({ aujourdhui: AUJ, jours: 90, solde: { v: 0, d: AUJ }, credits: [{ libelle: 'Conso', mensualite: 100, jour: 5, restantes: 1 }], vieMois: 0 });
  assert.deepEqual(p.evenements.filter((e) => e.type === 'credit').map((e) => e.d), ['2026-11-05']);
  assert.equal(p.fin.v, -100);
});

test('patrimoine net : prêté aux proches en actif, dû à un proche en dette, gardé par la normalisation du profil', () => {
  const OC = require('../../public/espace/js/orbite-calcul.js');
  const D = require('../../public/espace/js/decider-calcul.js');
  const base = { montant: 2500, periode: 'mensuel', sens: 'net', secteur: 'prive', epargneDisponible: 8000 };
  const proches = [{ id: 'x1', sens: 'prete', nom: 'K.', montant: 1300 }, { id: 'x2', sens: 'emprunte', nom: 'Papa', montant: 500 }];
  const sans = D.patrimoine(OC.synthese(base));
  const avec = D.patrimoine(OC.synthese(Object.assign({}, base, { proches })));
  assert.equal(avec.actifs.find((a) => a.cle === 'proches').montant, 1300);
  assert.equal(avec.passifs.find((a) => a.cle === 'proches-dette').montant, 500);
  assert.equal(Math.round(avec.net - sans.net), 800);
  assert.equal(Math.round(avec.courbe[1].net - sans.courbe[1].net), 800, 'constant dans la projection');
  const n = OC.normaliser({ proches, factures: [{ nom: 'Internet', cat: 'internet', montant: 39 }], assurances: [{ type: 'auto', prime: 640 }] });
  assert.equal(n.proches.length, 2);
  assert.equal(n.factures[0].cat, 'internet');
  assert.equal(n.assurances[0].prime, 640);
});
