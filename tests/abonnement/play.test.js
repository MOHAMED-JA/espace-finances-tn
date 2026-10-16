'use strict';
/* Paiement Google Play (application Android) : compte de service, jeton d'accès, lecture et consommation de l'achat. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, createVerify, createHash } = require('node:crypto');
const chemin = require('node:path').resolve(__dirname, '../../supabase/functions/paiement/play.js');
const charger = () => import(chemin);

/* Clé RSA fictive générée à la volée (jamais un vrai compte de service). */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const COMPTE_JSON = JSON.stringify({ type: 'service_account', client_email: 'orbite@projet-fictif.iam.gserviceaccount.com', private_key: PEM, token_uri: 'https://oauth2.googleapis.com/token' });
const JETON = 'abcdefghijklmnopqrstuvwxyz.AO-J1Oz_0123456789';

function decoder(b64url) { return Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function fauxFetch(reponses) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url, init: init || {} });
    const cle = Object.keys(reponses).find((k) => url.includes(k));
    const r = cle ? reponses[cle] : { status: 404, corps: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.corps };
  };
  f.appels = appels;
  return f;
}

test('produits : trois formules, rien d\'autre', async () => {
  const P = await charger();
  assert.equal(P.PAQUET, 'tn.orbite.app');
  assert.equal(P.formuleDe('orbite_mensuel'), 'mensuel');
  assert.equal(P.formuleDe('orbite_semestriel'), 'semestriel');
  assert.equal(P.formuleDe('orbite_annuel'), 'annuel');
  assert.equal(P.formuleDe('toString'), null);
  assert.equal(P.formuleDe('orbite_vie'), null);
  assert.ok(P.JETON_VALIDE.test(JETON));
  assert.ok(!P.JETON_VALIDE.test('court'));
  assert.ok(!P.JETON_VALIDE.test(JETON + '/../x'));
});

test('compte de service : lu depuis le secret, refusé s\'il est incomplet ou illisible', async () => {
  const P = await charger();
  const c = P.lireCompte(COMPTE_JSON);
  assert.equal(c.email, 'orbite@projet-fictif.iam.gserviceaccount.com');
  assert.equal(c.tokenUri, 'https://oauth2.googleapis.com/token');
  assert.throws(() => P.lireCompte('{pas du json'), /illisible/);
  assert.throws(() => P.lireCompte('{"client_email":"x"}'), /incomplet/);
  assert.equal(P.lireCompte({ client_email: 'a', private_key: 'b' }).tokenUri, 'https://oauth2.googleapis.com/token');
});

test('assertion : JWT RS256 signé, portée androidpublisher, valable une heure', async () => {
  const P = await charger();
  const jwt = await P.assertion(P.lireCompte(COMPTE_JSON), 1_800_000_000);
  const [tete, corps, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(decoder(tete)), { alg: 'RS256', typ: 'JWT' });
  const c = JSON.parse(decoder(corps));
  assert.equal(c.iss, 'orbite@projet-fictif.iam.gserviceaccount.com');
  assert.equal(c.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.equal(c.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(c.exp - c.iat, 3600);
  const v = createVerify('RSA-SHA256');
  v.update(tete + '.' + corps);
  assert.ok(v.verify(publicKey, decoder(sig)), 'signature vérifiable avec la clé publique');
});

test('jeton d\'accès : échange de l\'assertion, erreur claire si Google refuse', async () => {
  const P = await charger();
  const compte = P.lireCompte(COMPTE_JSON);
  const f = fauxFetch({ 'oauth2.googleapis.com/token': { status: 200, corps: { access_token: 'ya29.fictif', expires_in: 3599 } } });
  assert.equal(await P.jetonAcces(compte, f), 'ya29.fictif');
  assert.equal(f.appels[0].init.method, 'POST');
  assert.match(f.appels[0].init.body, /^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=ey/);
  const refus = fauxFetch({ 'oauth2.googleapis.com/token': { status: 400, corps: { error: 'invalid_grant' } } });
  await assert.rejects(P.jetonAcces(compte, refus), /refuse le compte de service/);
});

test('achat : lu chez Google avec le jeton d\'accès, inconnu → null, panne → erreur', async () => {
  const P = await charger();
  const f = fauxFetch({ '/purchases/products/orbite_annuel/tokens/': { status: 200, corps: { productId: 'orbite_annuel', purchaseState: 0, consumptionState: 0, orderId: 'GPA.1234-5678' } } });
  const a = await P.lireAchat('orbite_annuel', JETON, 'ya29.fictif', f);
  assert.equal(a.orderId, 'GPA.1234-5678');
  assert.match(f.appels[0].url, /^https:\/\/androidpublisher\.googleapis\.com\/androidpublisher\/v3\/applications\/tn\.orbite\.app\/purchases\/products\/orbite_annuel\/tokens\//);
  assert.equal(f.appels[0].init.headers.authorization, 'Bearer ya29.fictif');
  for (const status of [400, 404, 410]) assert.equal(await P.lireAchat('orbite_annuel', JETON, 'x', fauxFetch({ tokens: { status, corps: {} } })), null);
  await assert.rejects(P.lireAchat('orbite_annuel', JETON, 'x', fauxFetch({ tokens: { status: 503, corps: {} } })), /ne répond pas \(503\)/);
});

test('état de l\'achat : payé, en attente, annulé, autre produit, test, consommé', async () => {
  const P = await charger();
  assert.deepEqual(P.etatAchat(null, 'orbite_mensuel'), { connu: false, paye: false, attente: false });
  const paye = P.etatAchat({ productId: 'orbite_mensuel', purchaseState: 0, consumptionState: 0, purchaseType: 0, orderId: 'GPA.1' }, 'orbite_mensuel');
  assert.deepEqual(paye, { connu: true, paye: true, attente: false, consomme: false, test: true, commande: 'GPA.1' });
  assert.equal(P.etatAchat({ purchaseState: 2 }, 'orbite_mensuel').attente, true);
  assert.equal(P.etatAchat({ purchaseState: 1 }, 'orbite_mensuel').paye, false);
  const autre = P.etatAchat({ productId: 'orbite_mensuel', purchaseState: 0 }, 'orbite_annuel');
  assert.equal(autre.connu, false, 'un jeton mensuel ne paie pas une formule annuelle');
  assert.equal(autre.paye, false);
  assert.equal(P.etatAchat({ purchaseState: 0, consumptionState: 1 }, 'orbite_annuel').consomme, true);
  assert.equal(P.etatAchat({ purchaseState: 0 }, 'orbite_annuel').test, false);
});

test('consommation et empreinte : POST :consume, SHA-256 du jeton (jamais le jeton lui-même)', async () => {
  const P = await charger();
  const f = fauxFetch({ ':consume': { status: 204, corps: {} } });
  assert.equal(await P.consommer('orbite_semestriel', JETON, 'ya29.fictif', f), true);
  assert.equal(f.appels[0].init.method, 'POST');
  assert.match(f.appels[0].url, /\/tokens\/[^/]+:consume$/);
  assert.equal(await P.consommer('orbite_semestriel', JETON, 'x', fauxFetch({})), false);
  const e = await P.empreinte(JETON);
  assert.equal(e, 'play-' + createHash('sha256').update(JETON).digest('hex'));
  assert.ok(!e.includes(JETON));
});
