'use strict';
/* Application Android : prix Google Play présentés, réponses du serveur, achat et reprise des achats (API simulées). */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../public/espace/js/play-achat.js');

const FORMULES = [
  { cle: 'mensuel', libelle: 'Mensuel', mois: 1, prix_millimes: 9900 },
  { cle: 'semestriel', libelle: 'Semestriel', mois: 6, prix_millimes: 49900 },
  { cle: 'annuel', libelle: 'Annuel', mois: 12, prix_millimes: 79900 }
];
const detail = (itemId, value, currency) => ({ itemId, title: itemId, price: { value: String(value), currency: currency || 'TND' } });

test('offres : prix Google Play, réduction et mois offerts recalculés, formule annuelle en avant', () => {
  const o = P.offres(FORMULES, [detail('orbite_mensuel', 9.9), detail('orbite_semestriel', 49.9), detail('orbite_annuel', 79.9)]);
  assert.deepEqual(o.map((x) => [x.cle, x.sku, x.prix, x.reductionPct, x.moisOfferts, x.recommandee]), [
    ['mensuel', 'orbite_mensuel', 9.9, 0, 0, false],
    ['semestriel', 'orbite_semestriel', 49.9, 16, 0, false],
    ['annuel', 'orbite_annuel', 79.9, 33, 3, true]
  ]);
  assert.match(o[2].prixTexte.replace(/\s/g, ' '), /79,900 DT|79,9 DT|TND/);
  assert.ok(o[2].economieTexte);
  assert.equal(o[0].economieTexte, '');
});

test('offres : produit absent, prix nul, devise mélangée ou produit étranger ignorés', () => {
  assert.deepEqual(P.offres(FORMULES, []), []);
  assert.deepEqual(P.offres(FORMULES, null), []);
  const o = P.offres(FORMULES, [detail('orbite_mensuel', 3, 'USD'), detail('orbite_annuel', 25, 'USD'), detail('orbite_semestriel', 0, 'USD'), detail('autre_app', 1, 'USD')]);
  assert.deepEqual(o.map((x) => x.cle), ['mensuel', 'annuel']);
  assert.equal(o[0].devise, 'USD');
  const m = P.offres(FORMULES, [detail('orbite_mensuel', 3, 'USD'), detail('orbite_annuel', 80, 'TND')]);
  assert.deepEqual(m.map((x) => x.cle), ['mensuel'], 'une seule devise, celle de la formule la plus courte');
});

test('issue : payé, déjà enregistré, en attente, refusé', () => {
  assert.equal(P.issue({ statut: 'paye' }).ok, true);
  assert.match(P.issue({ statut: 'paye', deja: true }).texte, /déjà enregistré/);
  const att = P.issue({ statut: 'en_attente' });
  assert.equal(att.ok, false);
  assert.equal(att.attente, true);
  assert.match(P.issue({ statut: 'echec' }).texte, /aucun montant/);
  assert.match(P.issue(null).texte, /aucun montant/);
  assert.equal(P.formuleDuSku('orbite_annuel'), 'annuel');
  assert.equal(P.formuleDuSku('hasOwnProperty'), null);
});

/* Simule l'application : Digital Goods API, Payment Request et le serveur Orbite. */
function application({ annule, jeton = 'jeton-achat-fictif-0123456789', serveur, achats = [] } = {}) {
  const journal = { complete: [], serveur: [] };
  global.window = {
    getDigitalGoodsService: async (m) => {
      assert.equal(m, 'https://play.google.com/billing');
      return { getDetails: async (ids) => ids.map((id) => detail(id, 10)), listPurchases: async () => achats };
    },
    PaymentRequest: function () {}
  };
  global.PaymentRequest = function (methodes) {
    journal.methodes = methodes;
    this.show = async () => {
      if (annule) { const e = new Error('fermé'); e.name = 'AbortError'; throw e; }
      return { details: { purchaseToken: jeton }, complete: async (etat) => { journal.complete.push(etat); } };
    };
  };
  const espace = { abonnement: { play: async (sku, j) => { journal.serveur.push([sku, j]); return serveur ? serveur(sku, j) : { statut: 'paye' }; } } };
  return { journal, espace };
}
function nettoyer() { delete global.window; delete global.PaymentRequest; }

test('achat : fenêtre Google Play avec le bon produit, jeton transmis au serveur, fenêtre fermée sur succès', async (t) => {
  t.after(nettoyer);
  const { journal, espace } = application();
  const r = await P.acheter('annuel', espace);
  assert.equal(r.ok, true);
  assert.deepEqual(journal.methodes, [{ supportedMethods: 'https://play.google.com/billing', data: { sku: 'orbite_annuel' } }]);
  assert.deepEqual(journal.serveur, [['orbite_annuel', 'jeton-achat-fictif-0123456789']]);
  assert.deepEqual(journal.complete, ['success']);
  await assert.rejects(P.acheter('vie', espace), /Formule inconnue/);
});

test('achat : fermé sans payer → null ; en attente → « unknown » ; erreur serveur → « fail » puis erreur', async (t) => {
  t.after(nettoyer);
  assert.equal(await P.acheter('mensuel', application({ annule: true }).espace), null);
  const att = application({ serveur: () => ({ statut: 'en_attente' }) });
  assert.equal((await P.acheter('mensuel', att.espace)).attente, true);
  assert.deepEqual(att.journal.complete, ['unknown']);
  const ko = application({ serveur: () => { throw new Error('Achat introuvable chez Google Play.'); } });
  await assert.rejects(P.acheter('mensuel', ko.espace), /introuvable/);
  assert.deepEqual(ko.journal.complete, ['fail']);
});

test('reprise : seuls les produits Orbite sont renvoyés au serveur, les nouvelles activations sont comptées', async (t) => {
  t.after(nettoyer);
  const achats = [{ itemId: 'orbite_mensuel', purchaseToken: 'a'.repeat(30) }, { itemId: 'autre', purchaseToken: 'b'.repeat(30) }, { itemId: 'orbite_annuel', purchaseToken: 'c'.repeat(30) }];
  const { journal, espace } = application({ achats, serveur: (sku) => ({ statut: 'paye', deja: sku === 'orbite_mensuel' }) });
  assert.equal(await P.restaurer(espace), 1);
  assert.deepEqual(journal.serveur.map((x) => x[0]), ['orbite_mensuel', 'orbite_annuel']);
});

test('hors application : service indisponible (navigateur ordinaire)', async () => {
  global.window = {};
  try { await assert.rejects(P.details(), /indisponible/); } finally { nettoyer(); }
});
