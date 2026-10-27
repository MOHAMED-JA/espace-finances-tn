'use strict';
/* Campagne de cohérence (méthode ISTQB : partitions d'équivalence, valeurs limites, tables de décision, tests
   métamorphiques et différentiels). Profils fictifs tirés d'un générateur à graine fixe : résultats reproductibles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const MF = require('../../public/moteurs/vie/moteur-fiscal.js');

const MAINTENANT = new Date(2026, 9, 27);
function hasard(graine) { let s = graine >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const alea = hasard(20261027);
const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));
function profilAuHasard() {
  return { dateNaissance: '1985-01-01', sens: 'brut', montant: entre(400, 20000), chefDeFamille: alea() < 0.6, situation: 'marie',
    enfants: entre(0, 6), etudiants: entre(0, 3), handicapes: entre(0, 2), parents: entre(0, 2), secteur: alea() < 0.5 ? 'prive' : 'public',
    nombreSalaires: entre(12, 16), activite: alea() < 0.15 ? 'retraite' : 'salarie' };
}
const PROFILS = Array.from({ length: 600 }, profilAuHasard);
const salaire = (p) => OC.synthese(p, {}, MAINTENANT).salaire;
const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || '') + ' ' + a + ' ≠ ' + b);

test('différentiel : le moteur de l\'épargne et celui du salaire donnent le même impôt (600 profils)', () => {
  for (const p0 of PROFILS) {
    const sy = OC.synthese(p0, {}, MAINTENANT), s = sy.salaire, p = sy.profil;
    const m = MF.simuler({ revenu: s.revenuFiscal, chef: p.chefDeFamille, enfants: p.enfants, infirmes: p.handicapes, etudiants: p.etudiants,
      parents: p.parents, leger: true, abattementTaux: s.abattementTaux });
    proche(m.impotAvant, s.irpp, 1, JSON.stringify(p0));
  }
});

test('invariants : net ≤ brut, impôt et cotisations jamais négatifs, aucun NaN', () => {
  for (const p of PROFILS) {
    const s = salaire(p);
    for (const k of ['netMensuel', 'brutMensuel', 'irpp', 'css', 'cotisations', 'netAnnuel', 'brutAnnuel']) assert.ok(Number.isFinite(s[k]), k + ' ' + JSON.stringify(p));
    assert.ok(s.netMensuel <= s.brutMensuel + 1e-6, 'net > brut ' + JSON.stringify(p));
    assert.ok(s.irpp >= 0 && s.css >= 0 && s.cotisations >= 0, JSON.stringify(p));
  }
});

test('métamorphique : un brut plus élevé ne donne jamais un net plus faible', () => {
  for (const p of PROFILS.slice(0, 200)) {
    const a = salaire(p), b = salaire(Object.assign({}, p, { montant: p.montant + 50 }));
    assert.ok(b.netMensuel >= a.netMensuel - 1e-6 && b.irpp >= a.irpp - 1e-6, JSON.stringify(p));
  }
});

test('table de décision « chef de famille » : sans chef, les enfants ne changent rien ; avec chef, un enfant de plus ne fait jamais monter l\'impôt', () => {
  for (const p of PROFILS.slice(0, 200)) {
    const sansChef = Object.assign({}, p, { chefDeFamille: false });
    proche(salaire(Object.assign({}, sansChef, { enfants: 0, etudiants: 0, handicapes: 0 })).irpp, salaire(sansChef).irpp, 1e-6, 'enfants comptés sans chef');
    const chef = Object.assign({}, p, { chefDeFamille: true });
    assert.ok(salaire(Object.assign({}, chef, { enfants: chef.enfants + 1 })).irpp <= salaire(chef).irpp + 1e-6);
    assert.ok(salaire(chef).irpp <= salaire(Object.assign({}, chef, { chefDeFamille: false })).irpp + 1e-6, 'devenir chef fait monter l\'impôt');
  }
});

test('valeurs limites : 4 rangs d\'enfants au plus, étudiants d\'abord, enfants handicapés hors rang', () => {
  const base = { dateNaissance: '1985-01-01', montant: 4000, sens: 'brut', chefDeFamille: true };
  const i = (x) => salaire(Object.assign({}, base, x)).irpp;
  proche(i({ enfants: 4 }), i({ enfants: 9 }), 1e-6, 'au-delà de 4 enfants');
  proche(i({ etudiants: 4, enfants: 3 }), i({ etudiants: 4 }), 1e-6, 'enfants au-delà de 4 rangs');
  assert.ok(i({ etudiants: 4, handicapes: 1 }) < i({ etudiants: 4 }), 'enfant handicapé hors rang');
});

test('aller-retour : un net saisi redonne le même net (au millime)', () => {
  for (const p of PROFILS.slice(0, 120)) {
    const s = salaire(p);
    const r = salaire(Object.assign({}, p, { sens: 'net', montant: Math.round(s.netMensuel * 1000) / 1000 }));
    proche(r.netMensuel, s.netMensuel, 0.002, JSON.stringify(p));
  }
});

test('partitions invalides : montants négatifs, texte, infini et valeurs énormes sont ramenés à des bornes sûres', () => {
  for (const v of [-1, -1e9, 'abc', NaN, Infinity, 1e15, null, undefined, '', '12,5']) {
    const p = OC.normaliser({ montant: v, enfants: v, etudiants: v, handicapes: v, parents: v, nombreSalaires: v });
    for (const k of ['montant', 'enfants', 'etudiants', 'handicapes', 'parents', 'nombreSalaires']) assert.ok(Number.isFinite(p[k]) && p[k] >= 0, k + ' ← ' + String(v));
    assert.ok(p.enfants <= 15 && p.parents <= 2 && p.nombreSalaires >= 12 && p.nombreSalaires <= 18);
    const s = salaire(Object.assign({ dateNaissance: '1985-01-01' }, p));
    assert.ok(Number.isFinite(s.netMensuel));
  }
});
