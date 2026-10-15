'use strict';
/* « Rembourser ou épargner ? » et « Patrimoine net » (13 oct. 2026). Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../../public/espace/js/orbite-calcul.js');
const I = require('../../public/espace/js/orbite-intelligence.js');
const D = require('../../public/espace/js/decider-calcul.js');

const MAINTENANT = new Date('2026-10-13T12:00:00');
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.01), (msg || '') + ' : ' + a + ' ≠ ' + b);
const BASE = {
  montant: 3200, sens: 'brut', nombreSalaires: 14, calendrierPrimes: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], situation: 'marie', chefDeFamille: true,
  epargneDisponible: 4000, chargesFixes: 500,
  credits: [
    { type: 'immo', libelle: 'Crédit immobilier', tauxPct: 3, mensualite: 650, moisRestants: 200, capitalRestant: 98000 },
    { type: 'auto', libelle: 'Crédit auto', tauxPct: 9, mensualite: 520, moisRestants: 48 }
  ],
  contrats: [{ type: 'av', libelle: 'Assurance vie', anneeDebut: 2022, moisDebut: 1, versementMensuel: 150 }],
  patrimoine: { logement: 260000 }
};
const sy = (x) => O.synthese(Object.assign({}, BASE, x), {}, MAINTENANT);

/* Échéancier indépendant : intérêts jusqu'au solde, même mensualité. */
function interets(crd, M, t) { let it = 0, n = 0; while (crd > 0.0005) { const i = crd * t / 1200; const p = Math.min(M, crd + i); it += i; crd = crd + i - p; n++; } return { it, n }; }

test('profil : patrimoine et hypothèses normalisés, bornés, par défaut', () => {
  const p = O.normaliser({ patrimoine: { logement: -5, autres: 'x', hausseLogement: 99 }, decider: { rendementAv: 40 } });
  assert.deepEqual(p.patrimoine, { logement: 0, autres: 0, hausseLogement: 15 });
  assert.deepEqual(p.decider, { rendementAv: 15, rendementEpargne: 5 });
  const d = O.normaliser({});
  assert.deepEqual(d.patrimoine, { logement: 0, autres: 0, hausseLogement: 2 });
  assert.deepEqual(d.decider, { rendementAv: 6, rendementEpargne: 5 });
});

test('rembourser : le crédit le plus cher, intérêts évités exacts, même mensualité, fin plus tôt', () => {
  const r = D.comparer(sy(), { somme: 3000, horizon: 5 });
  const c = r.choix.find((x) => x.cle === 'rembourser');
  assert.equal(c.credit, 'Crédit auto');
  const crd = O.capitalPourMensualite(520, 9, 48);
  const a = interets(crd, 520, 9), b = interets(crd - 3000, 520, 9);
  proche(c.interetsEvites, a.it - b.it, 0.001, 'intérêts évités');
  assert.equal(c.moisGagnes, a.n - b.n);
  assert.equal(c.finAvant, 'septembre 2030', '48 échéances, la première en octobre 2026');
  assert.ok(c.gain > c.interetsEvites, 'mensualités libérées placées en plus');
  /* Somme supérieure au reste dû : crédit soldé, le reste va en épargne. */
  const s = D.comparer(sy(), { somme: 30000, horizon: 5 }).choix.find((x) => x.cle === 'rembourser');
  assert.ok(s.solde && Math.abs(s.verse - crd) < 0.01, 'soldé');
});

test("assurance vie / CEA : économie d'impôt du moteur fiscal, rendement à l'horizon", () => {
  const S = sy(), r = D.comparer(S, { somme: 3000, horizon: 10 });
  const c = r.choix.find((x) => x.cle === 'placer');
  proche(c.economieImpot, I.economieVersement(S, 3000).eco, 0.001);
  assert.ok(c.economieImpot > 0 && c.tauxImpot < 0.4, 'économie positive et plausible');
  proche(c.valeur, 3000 * Math.pow(1.06, 10) + c.economieImpot * Math.pow(1.05, 10), 0.001, 'valeur');
  /* Hypothèses du profil prises en compte. */
  const r2 = D.comparer(sy({ decider: { rendementAv: 2, rendementEpargne: 1 } }), { somme: 3000, horizon: 10 });
  assert.ok(r2.choix.find((x) => x.cle === 'placer').valeur < c.valeur);
});

test('réserve et conseil : compléter 3 mois de dépenses avant de placer', () => {
  const r = D.comparer(sy(), { somme: 3000 });
  const dep = r.reserve.depensesMois;
  proche(r.reserve.manque, Math.round(3 * dep / 100) * 100 - 4000, 0.001, 'réserve de sécurité : 3 mois de dépenses arrondis à la centaine');
  assert.equal(r.conseil.parts.length, 2);
  assert.equal(r.conseil.parts[0].cle, 'reserve');
  assert.equal(r.conseil.parts[0].montant, Math.ceil(r.reserve.manque / 10) * 10);
  proche(r.conseil.parts[0].montant + r.conseil.parts[1].montant, 3000, 0.001, 'tout est réparti');
  /* Réserve déjà suffisante : tout au choix le plus rentable (hors réserve). */
  const r2 = D.comparer(sy({ epargneDisponible: 20000 }), { somme: 3000 });
  assert.equal(r2.conseil.parts.length, 1);
  assert.notEqual(r2.conseil.parts[0].cle, 'reserve');
  const res = r.choix.find((x) => x.cle === 'reserve');
  assert.ok(res.moisApres > res.moisAvant && res.points >= 0);
});

test('sans crédit ni somme : choix indisponibles, pas de conseil', () => {
  const r = D.comparer(sy({ credits: [] }), { somme: 2000 });
  assert.equal(r.choix.find((x) => x.cle === 'rembourser').disponible, false);
  const z = D.comparer(sy(), { somme: 0 });
  assert.equal(z.conseil.parts.length, 0);
  assert.equal(z.meilleur, null);
});

test('prochaines primes : mois et montant net estimé', () => {
  const pr = D.prochainesPrimes(sy(), 2);
  assert.deepEqual(pr.map((x) => x.mois + ' ' + x.annee), ['décembre 2026', 'juin 2027']);
  assert.ok(pr[0].montant > 2000 && pr[0].montant % 10 === 0);
});

test('patrimoine : possédé − dû, reste dû estimé, courbe et jalons', () => {
  const S = sy(), r = D.patrimoine(S);
  const crdAuto = O.capitalPourMensualite(520, 9, 48);
  assert.ok(r.passifs.find((x) => x.libelle === 'Crédit auto').estime);
  proche(r.totalPassifs, 98000 + crdAuto, 0.01, 'dettes');
  proche(r.net, r.totalActifs - r.totalPassifs, 0.001, 'net');
  assert.ok(r.parMois > 0, 'le patrimoine grandit');
  assert.ok(r.courbe.length >= 11 && r.courbe[r.courbe.length - 1].dettes < 0.01, 'crédits soldés en fin de courbe');
  const fins = r.jalons.filter((j) => j.cle === 'credit');
  assert.equal(fins[0].libelle, 'Crédit auto');
  assert.equal(fins[0].annee + ' ' + fins[0].mois, '2030 septembre');
  assert.ok(fins[1].logement, 'logement payé à la fin du crédit immobilier');
  /* Sans logement saisi : signalé, et le net n'en tient pas compte. */
  const r2 = D.patrimoine(sy({ patrimoine: {} }));
  assert.equal(r2.logementSaisi, false);
  proche(r.net - r2.net, 260000, 0.001);
});

test('conseil de Mon orbite quand une prime arrive (mois en cours ou suivant)', () => {
  const novembre = O.synthese(BASE, {}, new Date('2026-11-10T12:00:00'));
  const c = novembre.conseils.find((x) => /^Une prime arrive en décembre/.test(x.titre));
  assert.ok(c && /onglet=decider&somme=\d+/.test(c.lien.href), 'lien vers Décider avec la somme');
  const aout = O.synthese(BASE, {}, new Date('2026-08-10T12:00:00'));
  assert.ok(!aout.conseils.some((x) => /^Une prime arrive/.test(x.titre)), 'pas de prime en août ni en septembre');
});

test('comparateur de banques : règle de chaque banque (net / brut, mois / année ÷ 12, quotité), crédits en cours déduits', () => {
  const S = sy({ dateNaissance: '1990-03-01' }), s = S.salaire;
  const r = D.banques(S, null, 'immo');
  /* Par défaut : la banque du profil puis les trois autres règles. */
  assert.equal(r.lignes.length, 4);
  assert.deepEqual(r.lignes.map((x) => x.base + '/' + x.revenu).sort(), ['brut/annee', 'brut/mois', 'net/annee', 'net/mois']);
  const bruteAn = r.lignes.find((x) => x.base === 'brut' && x.revenu === 'annee');
  proche(bruteAn.revenuMensuel, s.brutAnnuel / 12, 0.001);
  proche(bruteAn.mensualite, s.brutAnnuel / 12 * 0.4 - S.chargesCredits, 0.001, 'quotité moins les crédits en cours');
  proche(bruteAn.capital, O.capitalPourMensualite(bruteAn.mensualite, bruteAn.tauxPct, bruteAn.dureeMois), 0.01);
  assert.equal(r.lignes[r.meilleur].base + '/' + r.lignes[r.meilleur].revenu, 'brut/annee', '14 salaires sur le brut : la plus favorable');
  assert.ok(r.ecart > 0);
  /* Liste de l'utilisateur, quotité bornée ; type de crédit choisi. */
  const r2 = D.banques(S, [{ nom: 'X', base: 'net', revenu: 'mois', quotite: 0.95 }], 'auto');
  assert.equal(r2.lignes[0].quotite, 0.8);
  assert.equal(r2.type, 'auto');
  /* Profil : liste normalisée (6 au plus). */
  const p = O.normaliser({ banques: Array.from({ length: 9 }, (_, i) => ({ nom: 'B' + i, base: 'brut', revenu: 'annee', quotite: 0.45 })) });
  assert.equal(p.banques.length, 6);
  assert.deepEqual(p.banques[0], { nom: 'B0', base: 'brut', revenu: 'annee', quotite: 0.45 });
});
