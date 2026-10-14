'use strict';
/* Mon plan de versement (14 oct. 2026) : abordable, répartition assurance vie / CEA en pourcentage, calendrier. Profils fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const OI = require('../../public/espace/js/orbite-intelligence.js');

const M = new Date('2026-10-14T12:00:00');
const P = {
  montant: 3600, sens: 'brut', nombreSalaires: 14, calendrierPrimes: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], situation: 'marie', chefDeFamille: true, jourPaie: 26,
  epargneDisponible: 9000,
  credits: [{ type: 'immo', tauxPct: 3, mensualite: 650, moisRestants: 200, capitalRestant: 98000 }, { type: 'auto', tauxPct: 9, mensualite: 420, moisRestants: 48 }],
  contrats: [{ type: 'av', anneeDebut: 2022, moisDebut: 1, versementMensuel: 150 }]
};
const sy = (p) => OC.synthese(OC.normaliser(p || P), {}, M);
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.01), (msg || '') + ' : ' + a + ' ≠ ' + b);

test('à économie égale, l\'assurance vie est préférée au CEA (correction du partage)', () => {
  const s = sy(), o = OI.optimiseurFiscal(s, { maintenant: M });
  assert.equal(o.statut, 'a_optimiser');
  assert.equal(o.complement.cea, 0, 'le CEA n\'apporte rien de plus ici');
  assert.ok(o.complement.av > 0);
  const e = OI.economieVersement(s, 2000);
  assert.deepEqual([e.av, e.cea], [2000, 0]);
});

test('sources : marge du mois (sans les primes), primes à venir, épargne au-delà de la réserve', () => {
  const s = sy(), r = OI.planVersement(s, {}, { maintenant: M });
  const base = s.salaire.netMensuel - 1070 - 150;
  proche(r.marge.base, base, 0.001, 'salaire mensuel − crédits − contrats');
  assert.equal(r.marge.source, 'estimation');
  proche(r.marge.vie, base / 2, 0.001, 'sans budget du mois : la moitié par prudence');
  assert.equal(r.marge.mensuel, Math.floor(base / 2 * 0.5 / 10) * 10);
  assert.equal(r.marge.mois, 3, 'octobre, novembre, décembre');
  assert.equal(r.primes.liste.length, 1, 'seule la prime de décembre reste (juillet est passée)');
  proche(r.primes.netParSalaire, (s.salaire.netAnnuel - 12 * s.salaire.netMensuel) / 2, 0.001);
  assert.equal(r.epargne.reserveConseillee, Math.round(3 * (1070 + 150 + r.marge.vie) / 100) * 100);
  assert.equal(r.epargne.utilisable, Math.floor((9000 - r.epargne.reserveConseillee) / 10) * 10);
  assert.equal(r.abordable, r.marge.total + r.primes.total + r.epargne.utilisable);
  assert.equal(r.versement, Math.min(r.abordable, r.besoin));
});

test('budget du mois : les dépenses de vie prévues remplacent l\'estimation ; budget tout réparti = aucune marge', () => {
  const net = sy().salaire.netMensuel, libre = net - 1070 - 150;
  const p = Object.assign({}, P, { budget: { enveloppes: [{ cle: 'credits', prevu: 1070 }, { cle: 'courses', prevu: 300 }, { cle: 'divers', prevu: 100 }, { cle: 'epargne', prevu: 150 }] } });
  const r = OI.planVersement(sy(p), {}, { maintenant: M });
  assert.equal(r.marge.source, 'budget');
  proche(r.marge.libre, libre - 400, 0.001);
  const plein = Object.assign({}, P, { budget: { enveloppes: [{ cle: 'courses', prevu: libre }] } });
  const r2 = OI.planVersement(sy(plein), {}, { maintenant: M });
  assert.equal(r2.marge.mensuel, 0);
  assert.ok(r2.calendrier.every((c) => c.sources.indexOf('marge') === -1));
});

test('pourcentage choisi : montants AV / CEA, économie identique sous le plancher du CEA', () => {
  const s = sy(), c = OI.planVersement(s, {}, { maintenant: M }), r = OI.planVersement(s, { partAv: 0.7 }, { maintenant: M });
  assert.equal(r.av + r.cea, r.versement);
  assert.equal(r.av, Math.round(r.versement * 0.7));
  proche(r.gain, c.gain, 1, 'sous le plancher, chaque dinar rend autant');
  assert.equal(r.perte, 0);
  assert.equal(c.reglages.partAv, null, 'répartition conseillée par défaut');
  assert.equal(c.cea, 0);
});

test('100 % CEA sur un gros montant : perte signalée et dépôt CEA utile au-delà duquel l\'impôt ne baisse plus', () => {
  const s = sy(), r = OI.planVersement(s, { partAv: 0, partMarge: 1, partPrimes: 1, reserve: 0 }, { maintenant: M });
  const p2 = Object.assign({}, P, { epargneDisponible: 30000 });
  const r2 = OI.planVersement(sy(p2), { partAv: 0, reserve: 0 }, { maintenant: M });
  assert.equal(r2.versement, r2.besoin, 'plafonné au complément utile');
  assert.ok(r2.surplus > 0);
  assert.ok(r2.perte > 100, 'le CEA seul n\'atteint pas l\'économie maximale');
  assert.ok(r2.ceaUtile > 0 && r2.ceaUtile < r2.cea);
  const ok = OI.planVersement(sy(p2), { partAv: 1, reserve: 0 }, { maintenant: M });
  proche(ok.gain, ok.economieMax, 1, 'tout en assurance vie : économie maximale');
  assert.ok(r.gain > 0);
});

test('calendrier : épargne d\'abord, puis jour de paie ; somme = versement ; répartition suivie à chaque date', () => {
  const r = OI.planVersement(sy(), { partAv: 0.7 }, { maintenant: M });
  const total = r.calendrier.reduce((t, c) => t + c.montant, 0);
  proche(total, r.versement, 0.001);
  assert.equal(r.calendrier.reduce((t, c) => t + c.av, 0), r.av);
  assert.equal(r.calendrier[0].sources[0], 'epargne');
  assert.equal(r.calendrier[0].date.getDate(), 14, 'dès aujourd\'hui');
  assert.deepEqual(r.calendrier.slice(1).map((c) => [c.date.getMonth(), c.date.getDate()]), [[9, 26], [10, 26], [11, 26]]);
  assert.deepEqual(r.calendrier[3].sources, ['marge', 'prime']);
  r.calendrier.forEach((c) => assert.equal(c.av + c.cea, c.montant));
});

test('réglages gardés dans le profil, bornés ; impôt nul : rien à verser', () => {
  const n = OC.normaliser({ planVersement: { partMarge: 3, partPrimes: -1, reserve: '', partAv: 0.25 } }).planVersement;
  assert.deepEqual(n, { partMarge: 1, partPrimes: 0, reserve: null, partAv: 0.25 });
  assert.deepEqual(OC.normaliser({}).planVersement, { partMarge: 0.5, partPrimes: 0.5, reserve: null, partAv: null });
  const r = OI.planVersement(sy({ montant: 500, sens: 'brut', nombreSalaires: 12, epargneDisponible: 5000 }), {}, { maintenant: M });
  assert.equal(r.statut, 'sans_impot');
  assert.equal(r.versement, 0);
  assert.equal(r.gain, 0);
  assert.equal(r.calendrier.length, 0);
});
