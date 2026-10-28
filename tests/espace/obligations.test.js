'use strict';
/* Obligations de l'année : vignette (barème, échéance paire / impaire, payée, en retard), assurance auto et factures reprises
   (jamais saisies deux fois), fêtes du calendrier hégirien, somme à mettre de côté chaque mois. Profils fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OB = require('../../public/espace/js/obligations-calcul.js');
const OC = require('../../public/espace/js/orbite-calcul.js');

test('barème de la vignette : tranches de puissance, carburant, électrique à moitié du tarif essence', () => {
  assert.equal(OB.montantVignette(4, 'essence'), 65);
  assert.equal(OB.montantVignette(5, 'essence'), 130);
  assert.equal(OB.montantVignette(7, 'diesel'), 280);
  assert.equal(OB.montantVignette(8, 'essence'), 180);
  assert.equal(OB.montantVignette(9, 'diesel'), 405);
  assert.equal(OB.montantVignette(11, 'essence'), 230);
  assert.equal(OB.montantVignette(12, 'essence'), 1050);
  assert.equal(OB.montantVignette(15, 'diesel'), 1625);
  assert.equal(OB.montantVignette(20, 'gpl'), 2500);
  assert.equal(OB.montantVignette(6, 'electrique'), 65);
});

test('échéance : 5 mars (pair), 5 avril (impair) ; payée → année suivante ; dépassée sans paiement → en retard', () => {
  const auj = '2026-02-10';
  const r = OB.analyser({ aujourdhui: auj, obligations: { vehicules: [{ id: 'v1', nom: 'A', cv: 5, parite: 'pair' }, { id: 'v2', nom: 'B', cv: 5, parite: 'impair' }] } });
  assert.equal(r.lignes.find((x) => x.id === 'v1').date, '2026-03-05');
  assert.equal(r.lignes.find((x) => x.id === 'v2').date, '2026-04-05');
  const juin = OB.analyser({ aujourdhui: '2026-06-01', obligations: { vehicules: [{ id: 'v1', cv: 5, parite: 'pair' }, { id: 'v2', cv: 5, parite: 'impair', payeAnnee: 2026 }] } });
  const retard = juin.lignes.find((x) => x.id === 'v1'), payee = juin.lignes.find((x) => x.id === 'v2');
  assert.equal(retard.etat, 'retard');
  assert.equal(retard.parMois, 0, 'pas de provision pour une vignette en retard : elle est à payer tout de suite');
  assert.equal(juin.lignes[0].etat, 'retard', 'le retard passe en tête');
  assert.equal(payee.etat, 'paye');
  assert.equal(payee.date, '2027-04-05');
});

test('somme à mettre de côté : montant ÷ mois restants (le mois de l\'échéance compris), montant choisi prioritaire', () => {
  const r = OB.analyser({ aujourdhui: '2026-11-15', obligations: { vehicules: [{ id: 'v1', cv: 5, carburant: 'essence', parite: 'impair', payeAnnee: 2026, montant: 150 }] } });
  const v = r.lignes[0];
  assert.equal(v.date, '2027-04-05');
  assert.equal(v.montant, 150);
  assert.equal(v.montantCalcule, 130);
  assert.equal(v.parMois, 150 / 6);
  assert.equal(r.parMois, 25);
});

test('assurance auto et factures reprises des données existantes, sans copie', () => {
  const assurances = [{ id: 'a1', type: 'auto', nom: 'Clio', assureur: 'X', prime: 600, echeance: '2025-12-20', paie: false },
    { id: 'a2', type: 'habitation', prime: 200, echeance: '2026-12-01' }];
  const factures = [{ id: 'f1', nom: 'STEG', cat: 'electricite', montant: 90, periode: 2, prochaine: '2026-12-10' },
    { id: 'f2', nom: 'Forfait', cat: 'mobile', montant: 30, periode: 1 }, { id: 'f3', nom: 'SONEDE', cat: 'eau', montant: 40, periode: 3 }];
  const r = OB.analyser({ aujourdhui: '2026-11-01', assurances, factures, prochaineFacture: (f) => f.prochaine || '2026-11-20' });
  const a = r.lignes.find((x) => x.type === 'assurance');
  assert.equal(a.date, '2026-12-20', 'prochain anniversaire');
  assert.equal(r.lignes.filter((x) => x.type === 'assurance').length, 1, 'seule l\'assurance auto');
  assert.equal(a.parMois, 300);
  assert.deepEqual(r.factures.map((f) => f.nom), ['STEG', 'SONEDE'], 'électricité, eau, internet, syndic seulement');
  assert.equal(r.factures[1].date, '2026-11-20');
  const prelevee = OB.analyser({ aujourdhui: '2026-11-01', assurances: [Object.assign({}, assurances[0], { paie: true })] });
  assert.equal(prelevee.lignes[0].parMois, 0, 'prime prélevée avec le salaire : rien à mettre de côté');
});

test('fêtes : dates du calendrier hégirien, rentrée choisie, seulement celles suivies', () => {
  const f = OB.fetesHegiriennes(2026);
  assert.ok(f && f.ramadan && f['aid-fitr'] && f['aid-adha'], 'calendrier hégirien disponible');
  assert.ok(f.ramadan < f['aid-fitr'] && f['aid-fitr'] < f['aid-adha']);
  assert.equal(Math.round((new Date(f['aid-fitr']) - new Date(f.ramadan)) / 864e5) >= 29, true, 'Ramadan dure 29 ou 30 jours');
  const r = OB.analyser({ aujourdhui: '2026-10-28', obligations: { evenements: [{ type: 'rentree', actif: true, budget: 600, jourMois: '09-16' }, { type: 'aid-adha', actif: true, budget: 1200 }, { type: 'ramadan', actif: false }] } });
  const rentree = r.lignes.find((x) => x.sousType === 'rentree'), adha = r.lignes.find((x) => x.sousType === 'aid-adha');
  assert.equal(rentree.date, '2027-09-16', 'rentrée 2026 passée : celle de 2027');
  assert.ok(adha.date > '2027-01-01' && adha.date < '2027-07-01');
  assert.equal(r.lignes.some((x) => x.sousType === 'ramadan'), false, 'non suivie');
  assert.ok(Math.abs(rentree.parMois - 600 / 12) < 1e-9);
});

test('calendrier : seules les obligations du mois, non payées', () => {
  const r = OB.analyser({ aujourdhui: '2026-02-01', obligations: { vehicules: [{ id: 'v1', nom: 'A', cv: 5, parite: 'pair' }] } });
  const e = OB.evenementsMois(r, 2026, 2);
  assert.equal(e.length, 1);
  assert.equal(e[0].type, 'obligation');
  assert.equal(e[0].jour, 5);
  assert.equal(OB.evenementsMois(r, 2026, 3).length, 0);
});

test('normalisation : 5 voitures au plus, bornes, identifiants stables, types de fêtes connus seulement', () => {
  const o = OB.normaliser({ vehicules: Array.from({ length: 8 }, (_, i) => ({ nom: 'V' + i, cv: 999, carburant: 'kérosène', parite: 'x', montant: -5 })), evenements: [{ type: 'noel', actif: true }] });
  assert.equal(o.vehicules.length, 5);
  assert.equal(o.vehicules[0].cv, 40);
  assert.equal(o.vehicules[0].carburant, 'essence');
  assert.equal(o.vehicules[0].parite, 'pair');
  assert.equal(o.vehicules[0].montant, 0);
  assert.deepEqual(OB.normaliser(o).vehicules.map((v) => v.id), o.vehicules.map((v) => v.id), 'identifiants stables');
  assert.deepEqual(o.evenements.map((e) => e.type), ['rentree', 'ramadan', 'aid-fitr', 'aid-adha']);
  assert.equal(OC.normaliser({ obligations: o }).obligations.vehicules.length, 5, 'gardé dans le profil');
});

test('rappels : vignette 15 jours avant (puis en retard), fête suivie 7 jours avant, sans montant dans l\'email', () => {
  const R = require('../../public/espace/js/rappels-calcul.js');
  const profil = { dateNaissance: '1985-01-01', montant: 2500, obligations: { vehicules: [{ id: 'v1', nom: 'Clio', cv: 5, parite: 'pair' }], evenements: [{ type: 'aid-adha', actif: true, budget: 900 }] } };
  const m = new Date(2027, 1, 25, 10);
  const sy = OC.synthese(profil, {}, m);
  const l = R.rappels(sy, {}, null, m).filter((x) => x.type === 'obligation');
  const v = l.find((x) => x.id.startsWith('vignette-'));
  assert.ok(v, 'rappel de vignette');
  assert.ok(/5 mars/.test(v.titre));
  assert.ok(Date.parse(v.quand) <= m.getTime());
  const fete = l.find((x) => x.id.startsWith('fete-aid-adha'));
  assert.ok(fete && Date.parse(fete.quand) > m.getTime(), 'Aïd el-Adha : rappel 7 jours avant, plus tard');
  for (const x of l) assert.ok(!/\d+\s*DT/.test(JSON.stringify(x.mail)), 'aucun montant dans l\'email');
  const retard = R.rappels(OC.synthese(profil, {}, new Date(2027, 3, 1, 10)), {}, null, new Date(2027, 3, 1, 10)).find((x) => x.id.startsWith('vignette-'));
  assert.ok(/en retard/i.test(retard.titre));
});
