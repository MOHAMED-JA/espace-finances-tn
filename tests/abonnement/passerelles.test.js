'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chemin = require('node:path').resolve(__dirname, '../../supabase/functions/paiement/passerelles.js');
const charger = () => import(chemin);

/* Faux fetch : enregistre les appels et renvoie la réponse prévue pour chaque adresse. */
function fauxFetch(reponses) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url, init: init || {} });
    const cle = Object.keys(reponses).find((k) => url.includes(k));
    const r = cle ? reponses[cle] : { status: 404, corps: {} };
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.corps) };
  };
  f.appels = appels;
  return f;
}
const COMMANDE = { reference: 'ORB-20261008-ABCD1234', montantMillimes: 79900, description: 'Orbite', urlRetour: 'https://app/espace/?paiement=R', urlEchec: 'https://app/e', urlWebhook: 'https://fn?webhook=1&ref=R' };

test('passerelle par défaut : test, avec page de paiement simulée sur le site', async () => {
  const { passerelle } = await charger();
  const pg = passerelle({ URL_APPLICATION: 'https://orbite.tn' });
  assert.equal(pg.nom, 'test');
  const c = await pg.creer(COMMANDE);
  assert.equal(c.url, 'https://orbite.tn/espace/paiement-test.html?ref=ORB-20261008-ABCD1234');
  assert.deepEqual(await pg.verifier({ detail: {} }), { paye: false, statut: 'en_attente' });
  assert.deepEqual(await pg.verifier({ detail: { test: 'ok' } }), { paye: true, statut: 'paye' });
  assert.deepEqual(await pg.verifier({ detail: { test: 'refuse' } }), { paye: false, statut: 'echec' });
});

test('passerelle inconnue : retombe sur le mode test', async () => {
  const { passerelle } = await charger();
  assert.equal(passerelle({ PASSERELLE: 'paypal', URL_APPLICATION: 'x' }).nom, 'test');
});

test('Konnect : création (montant en millimes, TND, webhook) puis vérification', async () => {
  const { passerelle } = await charger();
  const f = fauxFetch({
    'init-payment': { status: 200, corps: { payUrl: 'https://pay.konnect/p/1', paymentRef: 'KREF' } },
    '/payments/KREF': { status: 200, corps: { payment: { status: 'completed' } } }
  });
  const pg = passerelle({ PASSERELLE: 'konnect', KONNECT_API_KEY: 'k', KONNECT_WALLET_ID: 'w' }, f);
  const c = await pg.creer(COMMANDE);
  assert.deepEqual(c, { url: 'https://pay.konnect/p/1', referencePasserelle: 'KREF' });
  const corps = JSON.parse(f.appels[0].init.body);
  assert.equal(corps.amount, 79900);
  assert.equal(corps.token, 'TND');
  assert.equal(corps.orderId, COMMANDE.reference);
  assert.equal(corps.webhook, COMMANDE.urlWebhook);
  assert.match(f.appels[0].url, /sandbox/, 'bac à sable par défaut');
  assert.equal(f.appels[0].init.headers['x-api-key'], 'k');
  assert.deepEqual(await pg.verifier({ reference_passerelle: 'KREF' }), { paye: true, statut: 'paye' });
});

test('Konnect : configuration manquante refusée, paiement en attente non activé', async () => {
  const { passerelle } = await charger();
  assert.throws(() => passerelle({ PASSERELLE: 'konnect' }), /KONNECT_API_KEY/);
  const f = fauxFetch({ '/payments/K2': { status: 200, corps: { payment: { status: 'pending' } } } });
  const pg = passerelle({ PASSERELLE: 'konnect', KONNECT_API_KEY: 'k', KONNECT_WALLET_ID: 'w' }, f);
  assert.deepEqual(await pg.verifier({ reference_passerelle: 'K2' }), { paye: false, statut: 'en_attente' });
  assert.deepEqual(await pg.verifier({}), { paye: false, statut: 'en_attente' });
});

test('Flouci : création puis vérification SUCCESS', async () => {
  const { passerelle } = await charger();
  const f = fauxFetch({
    generate_payment: { status: 200, corps: { result: { success: true, link: 'https://flouci/p', payment_id: 'FID' } } },
    'verify_payment/FID': { status: 200, corps: { success: true, result: { status: 'SUCCESS' } } }
  });
  const pg = passerelle({ PASSERELLE: 'flouci', FLOUCI_APP_TOKEN: 't', FLOUCI_APP_SECRET: 's' }, f);
  assert.deepEqual(await pg.creer(COMMANDE), { url: 'https://flouci/p', referencePasserelle: 'FID' });
  const corps = JSON.parse(f.appels[0].init.body);
  assert.equal(corps.amount, '79900');
  assert.equal(corps.developer_tracking_id, COMMANDE.reference);
  assert.deepEqual(await pg.verifier({ reference_passerelle: 'FID' }), { paye: true, statut: 'paye' });
  assert.equal(f.appels[1].init.headers.appsecret, 's');
});

test('ClicToPay : register.do (788 = dinar) puis getOrderStatusExtended (2 = payé)', async () => {
  const { passerelle } = await charger();
  const f = fauxFetch({
    'register.do': { status: 200, corps: { orderId: 'CID', formUrl: 'https://test.clictopay.com/form' } },
    'getOrderStatusExtended.do': { status: 200, corps: { orderStatus: 2 } }
  });
  const pg = passerelle({ PASSERELLE: 'clictopay', CLICTOPAY_USER: 'u', CLICTOPAY_PASSWORD: 'p' }, f);
  assert.deepEqual(await pg.creer(COMMANDE), { url: 'https://test.clictopay.com/form', referencePasserelle: 'CID' });
  const q = new URLSearchParams(f.appels[0].init.body);
  assert.equal(q.get('currency'), '788');
  assert.equal(q.get('amount'), '79900');
  assert.equal(q.get('orderNumber'), COMMANDE.reference);
  assert.match(f.appels[0].url, /test\.clictopay/);
  assert.deepEqual(await pg.verifier({ reference_passerelle: 'CID' }), { paye: true, statut: 'paye' });
});

test('ClicToPay : refus de la commande et paiement refusé', async () => {
  const { passerelle } = await charger();
  const f = fauxFetch({
    'register.do': { status: 200, corps: { errorCode: '5', errorMessage: 'Access denied' } },
    'getOrderStatusExtended.do': { status: 200, corps: { orderStatus: 6 } }
  });
  const pg = passerelle({ PASSERELLE: 'clictopay', CLICTOPAY_USER: 'u', CLICTOPAY_PASSWORD: 'p' }, f);
  await assert.rejects(pg.creer(COMMANDE), /refusé/);
  assert.deepEqual(await pg.verifier({ reference_passerelle: 'CID' }), { paye: false, statut: 'echec' });
});

test('référence de commande : format ORB-AAAAMMJJ-XXXXXXXX', async () => {
  const { nouvelleReference, REFERENCE_VALIDE } = await charger();
  const r = nouvelleReference(new Date('2026-10-08T10:00:00Z'), () => 'ab12cd34');
  assert.equal(r, 'ORB-20261008-AB12CD34');
  assert.ok(REFERENCE_VALIDE.test(r));
  assert.ok(REFERENCE_VALIDE.test(nouvelleReference()));
  assert.ok(!REFERENCE_VALIDE.test("ORB-20261008-AB12CD34' or 1=1"));
});
