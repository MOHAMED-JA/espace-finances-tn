'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Scenario = require('../../public/outils/assurance-vie/js/scenario.js');
const Projection = require('../../public/outils/assurance-vie/js/projection.js');
const Moteur = require('../../public/outils/assurance-vie/js/moteur-fiscal.js');
const Stress = require('../../public/outils/assurance-vie/js/stress.js');
const Couple = require('../../public/outils/assurance-vie/js/couple.js');
const Objectifs = require('../../public/outils/assurance-vie/js/objectifs.js');
const Comparateur = require('../../public/outils/assurance-vie/js/comparateur.js');
const Historique = require('../../public/outils/assurance-vie/js/historique.js');
const Xlsx = require('../../public/outils/assurance-vie/js/xlsx.js');
const Releve = require('../../public/outils/assurance-vie/js/releve.js');
const Commandes = require('../../public/outils/assurance-vie/js/commandes.js');
const Rappels = require('../../public/outils/assurance-vie/js/rappels.js');

const etat = (x) => Object.assign(Scenario.defauts(), { revenu: 60000, versement: 400, versementCea: 200 }, x || {});

test('projection : pause des versements (facteursVersement)', () => {
  const p = { versement: 100, periodesParAn: 12, dureeAns: 3, rendementPct: 0 };
  assert.equal(Projection.projeter(p).totalVerse, 3600);
  assert.equal(Projection.projeter(Object.assign({ facteursVersement: [1, 0, 1] }, p)).totalVerse, 2400);
});

test('stress : chaque test dégrade le capital, la pause retire versements et économie', () => {
  const c = Scenario.calculer(etat());
  const r = Stress.tester(c, { anneeKrach: 3, chuteCeaPct: 30, debutPause: 2, dureePause: 1, baissePts: 2, inflationPct: 8 });
  const t = Object.fromEntries(r.tests.map((x) => [x.cle, x]));
  assert.ok(t.krach.ecart < 0);
  assert.ok(t.pause.ecart < 0);
  assert.equal(Math.round(t.pause.versementsManques), 7200);
  assert.ok(Math.abs(t.pause.economiePerdue - c.annuel[1].economie) < 1e-6);
  assert.ok(t.baisse.ecart < 0);
  assert.ok(Math.abs(t.inflation.capital - c.med.capitalFinal) < 1e-6);
  assert.ok(t.inflation.capitalReel < t.inflation.capital);
  assert.equal(Stress.tester(Scenario.calculer(etat({ versement: 0, versementCea: 0 }))), null);
  /* Options bornées à la durée */
  assert.equal(Stress.tester(c, { anneeKrach: 99 }).options.anneeKrach, 10);
});

test('couple : la répartition optimale fait au moins aussi bien que 50/50 et que tout sur un conjoint', () => {
  const f = { revenu1: 80000, revenu2: 25000, chef: 1, enfants: 2, budget: 20000 };
  const r = Couple.repartir(f);
  assert.ok(Math.abs(r.part1 + r.part2 - 20000) < 1e-6);
  assert.ok(r.total >= r.egalitaire - 1e-6 && r.total >= r.tout1 - 1e-6 && r.total >= r.tout2 - 1e-6);
  assert.ok(Math.abs(r.total - (r.economie1 + r.economie2)) < 1e-6);
  /* Contrôle direct de l'économie du conjoint 1 */
  const s = Moteur.simuler({ revenu: 80000, chef: true, enfants: 2, infirmes: 0, etudiants: 0, parents: 0, investissementAv: r.part1, investissementCea: 0 });
  assert.ok(Math.abs(s.economie - r.economie1) < 1e-6);
  assert.equal(Couple.repartir({ revenu1: 1, revenu2: 1, chef: 1, budget: -5 }), null);
});

test('objectifs : mensualité, capital déjà disponible et couverture par échéance', () => {
  assert.ok(Math.abs(Objectifs.mensualite(12000, 1, 0) - 1000) < 1e-9);
  const m = Objectifs.mensualite(100000, 10, 5);
  /* Vérification par accumulation */
  const r = Math.pow(1.05, 1 / 12) - 1;
  let cap = 0; for (let i = 0; i < 120; i++) cap = cap * (1 + r) + m;
  assert.ok(Math.abs(cap - 100000) < 1e-6);
  assert.equal(Objectifs.mensualite(1000, 5, 5, 5000), 0);
  const p = Objectifs.planifier([{ nom: 'Retraite', montant: 120000, ans: 20 }, { nom: 'Études', montant: 12000, ans: 1 }, { nom: 'x', montant: -1, ans: 2 }], 0, 1200);
  const etudes = p.objectifs[1], retraite = p.objectifs[0];
  assert.equal(etudes.alloue, 1000);
  assert.equal(etudes.atteint, true);
  assert.equal(retraite.alloue, 200);
  assert.equal(Math.round(retraite.couverture), 40);
  assert.equal(p.objectifs[2].valide, false);
  assert.equal(p.besoin, 1500);
  assert.equal(p.manque, 300);
});

test('comparateur : variantes et meilleurs par critère', () => {
  const e = etat();
  const v = Comparateur.variantes(e);
  assert.deepEqual(v.map((x) => x.cle), ['optimal', 'avSeule', 'moitie', 'plus100']);
  assert.equal(v[1].etat.versement, 600);
  assert.equal(v[1].etat.versementCea, 0);
  assert.equal(v[3].etat.versement, 500);
  const m = [e, v[0].etat, v[3].etat].map(Comparateur.mesurer);
  const b = Comparateur.meilleurs(m);
  assert.equal(b.economie, 1);
  assert.equal(b.effortMensuel, 0);
  assert.equal(Comparateur.meilleurs([m[0], m[0]]).economie, null);
});

test('historique : annuler, rétablir, pas de doublon, branche coupée', () => {
  const h = Historique.creer(3);
  assert.equal(h.ajouter({ a: 1 }), true);
  assert.equal(h.ajouter({ a: 1 }), false);
  h.ajouter({ a: 2 }); h.ajouter({ a: 3 });
  assert.deepEqual(h.annuler(), { a: 2 });
  assert.equal(h.peutRetablir(), true);
  assert.deepEqual(h.retablir(), { a: 3 });
  h.annuler(); h.ajouter({ a: 9 });
  assert.equal(h.peutRetablir(), false);
  h.ajouter({ a: 10 });
  assert.equal(h.taille(), 3);
  assert.deepEqual(h.annuler(), { a: 9 });
});

test('xlsx : archive ZIP valide avec feuilles, formules et caractères spéciaux', () => {
  const o = Xlsx.classeur([{ nom: 'Impôt', lignes: [['Libellé', 'Montant'], ['Économie & <test>', { v: 1234.5, s: 'tnd' }], ['Total', { f: 'SUM(B2:B2)', v: 1234.5, s: 'tndGras' }]], largeurs: [30, 18], figer: 1 }, { nom: 'Projection/2', lignes: [[1, 2]] }], { titre: 'Test' });
  assert.equal(o[0], 0x50); assert.equal(o[1], 0x4b);
  const s = Buffer.from(o).toString('utf8');
  assert.ok(s.includes('<f>SUM(B2:B2)</f>'));
  assert.ok(s.includes('Économie &amp; &lt;test&gt;'));
  assert.ok(s.includes('name="Projection 2"'));
  assert.equal(Xlsx.colonne(0), 'A'); assert.equal(Xlsx.colonne(27), 'AB');
  assert.equal(Xlsx.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('relevé PDF : texte extrait et valeurs repérées', async () => {
  const { jsPDF } = require('../../public/outils/assurance-vie/assets/vendor/jspdf.umd.min.js');
  const doc = new jsPDF({ compress: true });
  ['Valeur de rachat au 31/12/2025 : 12 345,678 TND', 'Taux de rendement net servi 2025 : 6,25 %', 'Taux minimum garanti : 2 %',
    'Frais de gestion annuels : 0,8 %', 'Frais sur versements : 3 %', 'Prime mensuelle : 450,000 TND'].forEach((l, i) => doc.text(l, 10, 10 + i * 10));
  const t = await Releve.texte(doc.output('arraybuffer'));
  assert.ok(t.includes('Valeur de rachat'));
  assert.deepEqual(Releve.analyser(t), { capital: 12345.678, versement: 450, tauxServi: 6.25, tauxGaranti: 2, fraisGestion: 0.8, fraisVersement: 3, trouves: 6 });
  await assert.rejects(Releve.texte(new TextEncoder().encode('pas un pdf').buffer));
  assert.equal(Releve.texteDuFlux('BT (A\\(b\\)) Tj ET BT [(Bon)-300(jour)] TJ ET'), 'A(b)\nBon jour\n');
  assert.equal(Releve.nombre('12.345,6'), 12345.6);
  assert.equal(Releve.nombre('12,345.6'), 12345.6);
});

test('commandes : recherche sans accents et saisies directes', () => {
  const liste = [{ id: 'pdf', libelle: 'Télécharger le rapport PDF' }, { id: 'rachat', libelle: 'Rachat anticipé' }, { id: 'sombre', libelle: 'Thème sombre', motsCles: 'dark nuit' }];
  assert.equal(Commandes.chercher(liste, 'rach')[0].id, 'rachat');
  assert.equal(Commandes.chercher(liste, 'theme')[0].id, 'sombre');
  assert.equal(Commandes.chercher(liste, 'nuit')[0].id, 'sombre');
  assert.equal(Commandes.chercher(liste, 'pdf')[0].id, 'pdf');
  assert.equal(Commandes.chercher(liste, 'zzz').length, 0);
  assert.deepEqual(Commandes.interpreter('60000'), [{ champ: 'revenu', valeur: 60000 }]);
  assert.deepEqual(Commandes.interpreter('60 k'), [{ champ: 'revenu', valeur: 60000 }]);
  assert.deepEqual(Commandes.interpreter('AV 500'), [{ champ: 'versement', valeur: 500 }]);
  assert.deepEqual(Commandes.interpreter('500 par mois'), [{ champ: 'versement', valeur: 500 }]);
  assert.deepEqual(Commandes.interpreter('cea 200,5'), [{ champ: 'versementCea', valeur: 200.5 }]);
  assert.deepEqual(Commandes.interpreter('20 ans'), [{ champ: 'duree', valeur: 20 }]);
  assert.deepEqual(Commandes.interpreter('Durée 15'), [{ champ: 'duree', valeur: 15 }]);
  assert.deepEqual(Commandes.interpreter('2 enfants'), [{ champ: 'enfants', valeur: 2 }]);
  assert.deepEqual(Commandes.interpreter('rachat'), []);
});

test('rappels : échéance du mois, fin de mois, fréquence et rappel déjà vu', () => {
  const r = { jour: 31, frequence: 'Mensuel', depart: '2026-01-01' };
  const d = Rappels.estDu(r, new Date(2026, 1, 28));
  assert.equal(d.cle, 20260228);
  assert.equal(Rappels.estDu(Object.assign({ dernier: 20260228 }, r), new Date(2026, 1, 28, 10)), null);
  assert.equal(Rappels.estDu({ jour: 10, frequence: 'Mensuel', depart: '2026-03-01' }, new Date(2026, 2, 5)), null);
  const t = { jour: 5, frequence: 'Trimestriel', depart: '2026-01-01' };
  assert.equal(Rappels.estDu(t, new Date(2026, 4, 20)).cle, 20260405);
  assert.equal(Rappels.prochaine(t, new Date(2026, 4, 20)).getMonth(), 6);
});
