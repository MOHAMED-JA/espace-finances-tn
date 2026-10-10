'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../public/espace/js/rappels-calcul.js');
const O = require('../../public/espace/js/orbite-calcul.js');
const I = require('../../public/espace/js/orbite-intelligence.js');
const chemin = require('node:path').resolve(__dirname, '../../supabase/functions/rappels-email/gabarit.js');
const charger = () => import(chemin);

const M = new Date('2026-12-01T12:00:00');
const PROFIL = {
  prenom: 'Sami', montant: 4000, sens: 'brut', nombreSalaires: 17, chefDeFamille: true, anneeNaissance: 1992, baseBanque: 'brut',
  credits: [
    { type: 'auto', libelle: 'Crédit automobile', tauxPct: 4.5, mensualite: 695.008, moisRestants: 3 },
    { type: 'immo', libelle: 'Crédit immobilier', tauxPct: 4.5, mensualite: 875.894, moisRestants: 148 }
  ],
  rappelsPerso: [{ id: 'etsi1', titre: 'Naissance : ajoutez votre enfant au profil', corps: 'Prévu en janvier 2027.', url: '/espace/#profil?section=identite', mois: 12, annee: 2026 }]
};
function plan(m) {
  const sy = O.synthese(PROFIL, {}, m || M);
  const liste = R.rappels(sy, { etat: 'essai', essai_fin: '2026-12-02T10:00:00.000Z' }, I.optimiseurFiscal(sy), m || M);
  return { liste, plan: R.planEmail(liste) };
}
/* Aucun montant : ni « DT », ni pourcentage chiffré, ni nombre à 3 chiffres ou plus. */
const MONTANT = /\bDT\b|\d+(,\d+)? ?%|\d{3,}(?![-\d]*\d{2}T)/;

test('planEmail : chaque rappel a type et textes d\'email, sans aucun montant', () => {
  const { liste, plan: p } = plan();
  assert.ok(p.length >= 3, 'essai, crédit, fiscal, rappel perso');
  assert.equal(p.length, liste.length);
  for (const x of p) {
    assert.ok(['essai', 'abonnement', 'credit', 'reduction', 'perso', 'fiscal'].includes(x.type), x.id);
    assert.ok(x.titre && x.bouton && x.etiquette, x.id);
    for (const champ of ['titre', 'corps', 'conseil', 'etiquette', 'bouton']) {
      const t = String(x[champ]).replace(/\b20\d\d\b/g, '');
      assert.doesNotMatch(t, MONTANT, x.id + ' · ' + champ + ' : ' + x[champ]);
    }
  }
  const f = p.find((x) => x.type === 'fiscal');
  assert.match(f.corps, /Le montant exact vous attend dans Orbite/);
  /* Le rappel affiché dans l'appli garde son montant : seul l'email en est privé. */
  assert.match(liste.find((x) => x.type === 'fiscal').corps, /DT/);
});

test('réduction de taux : texte d\'email sans les taux, à venir comme déjà possible', () => {
  const m = new Date(2026, 9, 9);
  const immo = { libelle: 'Crédit immobilier', type: 'immo', mensualite: 765.003, tauxPct: 2.25, moisDebut: 2, anneeDebut: 2023, dureeMois: 191, tauxType: 'fixe', reductionMois: 3, reductionAnnee: 2026 };
  const cas = [immo, { ...immo, mensualite: 875.894, tauxPct: 4.5, reductionMois: 0, reductionAnnee: 0 }];
  const corps = cas.map((c) => {
    const sy = O.synthese(Object.assign(O.profilParDefaut(), { montant: 4000, credits: [c] }), {}, m);
    const r = R.planEmail(R.rappels(sy, {}, null, m)).filter((x) => x.type === 'reduction');
    assert.equal(r.length, 1);
    assert.equal(r[0].titre, 'Demandez la réduction de votre taux');
    assert.doesNotMatch(r[0].corps, /\d,\d+ %|→/);
    return r[0].corps;
  });
  assert.match(corps[0], /En septembre 2031, la règle des 8 % divise le taux de votre crédit immobilier par deux/);
  assert.match(corps[1], /Depuis mars 2026/);
});

test('nettoyerPlan : rejette les rappels mal formés et force des liens internes', async () => {
  const G = await charger();
  const p = G.nettoyerPlan([
    { id: 'ok-1', type: 'fiscal', quand: '2026-12-01T08:00:00Z', jusqua: '2026-12-31T22:00:00Z', titre: 'T', url: 'https://piege.example/' },
    { id: 'ok-1', type: 'fiscal', quand: '2026-12-01T08:00:00Z', titre: 'doublon' },
    { id: 'x<script>', type: 'fiscal', quand: '2026-12-01T08:00:00Z', titre: 'T' },
    { id: 'ok-2', type: 'inconnu', quand: '2026-12-01T08:00:00Z', titre: 'T' },
    { id: 'ok-3', type: 'perso', quand: 'pas une date', titre: 'T' },
    { id: 'ok-4', type: 'perso', quand: '2026-12-01T08:00:00Z', titre: '' },
    { id: 'ok-5', type: 'perso', quand: '2026-12-01T08:00:00Z', titre: 'A'.repeat(500), corps: 'x\u0000y', url: '/espace/#profil?section=credits' },
    null, 'texte'
  ]);
  assert.deepEqual(p.map((x) => x.id), ['ok-1', 'ok-5']);
  assert.equal(p[0].url, '/espace/#orbite');
  assert.equal(p[1].url, '/espace/#profil?section=credits');
  assert.equal(p[1].titre.length, 120);
  assert.equal(p[1].corps, 'x y');
  assert.deepEqual(G.nettoyerPlan('pas un tableau'), []);
  assert.equal(G.nettoyerPlan(Array.from({ length: 60 }, (_, i) => ({ id: 'r' + i, type: 'perso', quand: '2026-12-01T08:00:00Z', titre: 'T' }))).length, 40);
});

test('aEnvoyer : échus, non expirés, jamais deux fois, essai cohérent avec l\'abonnement réel', async () => {
  const G = await charger();
  const { plan: p } = plan();
  const essai = { etat: 'essai', essai_fin: '2026-12-02T10:00:00.000Z' };
  const a = G.aEnvoyer(p, [], M, essai);
  assert.ok(a.some((x) => x.type === 'essai'), 'essai qui finit demain');
  assert.ok(a.some((x) => x.type === 'fiscal'), '31 jours avant la fin de l\'année');
  assert.ok(a.every((x) => x.quand <= M.getTime()));
  /* Déjà envoyés : plus rien. */
  assert.equal(G.aEnvoyer(p, a.map((x) => x.id), M, essai).length, 0);
  /* Essai payé entre-temps : le rappel d'essai ne part pas. */
  assert.ok(!G.aEnvoyer(p, [], M, { etat: 'actif', fin: '2027-12-02T10:00:00.000Z' }).some((x) => x.type === 'essai'));
  /* Essai prolongé (autre date) : l'ancien rappel ne correspond plus. */
  assert.ok(!G.aEnvoyer(p, [], M, { etat: 'essai', essai_fin: '2026-12-20T10:00:00.000Z' }).some((x) => x.type === 'essai'));
  /* Après le 31 décembre : expiré. */
  assert.ok(!G.aEnvoyer(p, [], new Date('2027-01-02T12:00:00'), essai).some((x) => x.type === 'fiscal'));
  /* Trop tôt : rien. */
  assert.equal(G.aEnvoyer(p, [], new Date('2026-06-01T12:00:00'), essai).filter((x) => x.type === 'fiscal').length, 0);
  /* Six au plus par email. */
  const beaucoup = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, type: 'perso', quand: '2026-11-20T08:00:00Z', titre: 'T' + i }));
  assert.equal(G.aEnvoyer(beaucoup, [], M, {}).length, 6);
});

test('email : objet, prénom, cartes, liens internes, désinscription, tout est échappé', async () => {
  const G = await charger();
  const rs = G.aEnvoyer([
    { id: 'perso-a', type: 'perso', quand: '2026-11-30T08:00:00Z', titre: 'Mon <b>rappel</b>', corps: '"guillemets" & <img src=x onerror=alert(1)>', url: '/espace/#profil', etiquette: 'Votre rappel', bouton: 'Ouvrir Orbite' },
    { id: 'fiscal-2026-12-1', type: 'fiscal', quand: '2026-12-01T08:00:00Z', jusqua: '2026-12-31T22:59:59Z', titre: 'Réduisez votre impôt avant le 31 décembre', corps: 'C', conseil: 'K', url: '/espace/#vie?onglet=fiscal', etiquette: 'Impôt 2026', bouton: 'Voir mon économie' }
  ], [], M, {});
  const m = G.email({ prenom: 'Sami<script>', rappels: rs, urlApp: 'https://orbite.example/', urlDesinscription: 'https://orbite.example/rappels.html#d=abc' });
  assert.equal(m.objet, 'Sami<script>, 2 rappels pour vos finances');
  assert.match(m.html, /Bonjour Sami&lt;script&gt;,/);
  assert.doesNotMatch(m.html, /<script|<img|<b>rappel/);
  assert.match(m.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(m.html, /href="https:\/\/orbite\.example\/espace\/#vie\?onglet=fiscal"/);
  assert.match(m.html, /Se désinscrire en un clic/);
  assert.match(m.html, /rappels\.html#d=abc/);
  assert.match(m.html, /Deux choses méritent votre attention/);
  assert.match(m.html, /Notre conseil :<\/b> K/);
  assert.match(m.texte, /Voir mon économie : https:\/\/orbite\.example\/espace\/#vie\?onglet=fiscal/);
  assert.match(m.texte, /Se désinscrire en un clic : https:\/\/orbite\.example\/rappels\.html#d=abc/);
  const un = G.email({ prenom: '', rappels: rs.slice(0, 1), urlApp: 'https://o.example', urlDesinscription: 'u' });
  assert.equal(un.objet, 'un rappel pour vos finances');
  assert.match(un.html, /Bonjour,/);
  assert.equal(G.email({ prenom: 'S', rappels: [], urlApp: '', urlDesinscription: '' }), null);
});

test('confirmation : adresse affichée échappée, lien de confirmation, objet clair', async () => {
  const G = await charger();
  const m = G.confirmation({ prenom: 'Sami', adresse: 'a"b@x.tn', urlConfirmer: 'https://o.example/rappels.html#c=123' });
  assert.equal(m.objet, "Confirmez votre adresse pour les rappels d'Orbite");
  assert.match(m.html, /a&quot;b@x\.tn/);
  assert.match(m.html, /rappels\.html#c=123/);
  assert.match(m.texte, /ignorez simplement cet email/);
});

test('adresses : connexion directe, contact seulement une fois confirmée', async () => {
  const G = await charger();
  assert.deepEqual(G.adresses({ email: 'A@x.tn', contact: '' }), { envoyer: 'a@x.tn', aConfirmer: null });
  assert.deepEqual(G.adresses({ email: 'a@x.tn', contact: 'A@X.TN' }), { envoyer: 'a@x.tn', aConfirmer: null });
  assert.deepEqual(G.adresses({ email: 'a@x.tn', contact: 'b@y.tn' }), { envoyer: null, aConfirmer: 'b@y.tn' });
  assert.deepEqual(G.adresses({ email: 'a@x.tn', contact: 'b@y.tn', adresse_confirmee: 'b@y.tn' }), { envoyer: 'b@y.tn', aConfirmer: null });
  assert.deepEqual(G.adresses({ email: 'a@x.tn', contact: 'c@z.tn', adresse_confirmee: 'b@y.tn' }), { envoyer: null, aConfirmer: 'c@z.tn' });
});
