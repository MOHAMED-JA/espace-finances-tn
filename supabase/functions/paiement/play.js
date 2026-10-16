/*
 * Orbite — paiement par Google Play (application Android, Trusted Web Activity) : module pur, testé sous Node.
 * L'achat se fait dans l'application (Digital Goods API + Payment Request, méthode https://play.google.com/billing) ;
 * le navigateur transmet seulement le jeton d'achat. Le serveur le vérifie auprès de Google (Google Play Developer API,
 * purchases.products), l'enregistre une seule fois (empreinte SHA-256 du jeton), active l'abonnement, puis le consomme
 * (un produit consommé peut être racheté : chaque achat prolonge l'abonnement, comme avec les autres passerelles).
 *
 * Compte de service Google (JSON) : secret Supabase GOOGLE_PLAY_COMPTE_SERVICE, jamais dans le dépôt.
 * Produits à créer dans la Play Console (produits intégrés, « consommables ») : orbite_mensuel, orbite_semestriel, orbite_annuel.
 */

export const PAQUET = "tn.orbite.app";
export const PRODUITS = { orbite_mensuel: "mensuel", orbite_semestriel: "semestriel", orbite_annuel: "annuel" };
/* Jeton d'achat Google : lettres, chiffres, point, tiret, soulignement (longueur bornée). */
export const JETON_VALIDE = /^[A-Za-z0-9._-]{20,4096}$/;
const PORTEE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/";

export function formuleDe(produit) {
  return Object.prototype.hasOwnProperty.call(PRODUITS, produit) ? PRODUITS[produit] : null;
}

function base64url(octets) {
  let s = "";
  const t = new Uint8Array(octets);
  for (let i = 0; i < t.length; i++) s += String.fromCharCode(t[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function texteEnOctets(t) { return new TextEncoder().encode(t); }

/** Compte de service : JSON du secret → { email, cle, tokenUri } (erreur claire si incomplet). */
export function lireCompte(json) {
  let c;
  try { c = typeof json === "string" ? JSON.parse(json) : json; } catch { throw new Error("Compte de service illisible"); }
  if (!c || !c.client_email || !c.private_key) throw new Error("Compte de service incomplet");
  return { email: c.client_email, cle: c.private_key, tokenUri: c.token_uri || "https://oauth2.googleapis.com/token" };
}

async function cleSignature(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const brut = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", brut, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** Assertion signée (JWT RS256) pour obtenir un jeton d'accès OAuth 2 du compte de service. */
export async function assertion(compte, maintenantSec) {
  const iat = Math.floor(maintenantSec != null ? maintenantSec : Date.now() / 1000);
  const tete = base64url(texteEnOctets(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const corps = base64url(texteEnOctets(JSON.stringify({ iss: compte.email, scope: PORTEE, aud: compte.tokenUri, iat, exp: iat + 3600 })));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await cleSignature(compte.cle), texteEnOctets(tete + "." + corps));
  return tete + "." + corps + "." + base64url(signature);
}

/** Jeton d'accès Google (valable une heure). f = fetch (injecté pour les tests). */
export async function jetonAcces(compte, f, maintenantSec) {
  const r = await f(compte.tokenUri, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(await assertion(compte, maintenantSec))
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error("Google refuse le compte de service");
  return d.access_token;
}

function urlAchat(produit, jeton) {
  return API + encodeURIComponent(PAQUET) + "/purchases/products/" + encodeURIComponent(produit) + "/tokens/" + encodeURIComponent(jeton);
}

/** Lecture de l'achat chez Google : null si Google ne le connaît pas (jeton faux ou d'une autre application). */
export async function lireAchat(produit, jeton, acces, f) {
  const r = await f(urlAchat(produit, jeton), { headers: { authorization: "Bearer " + acces } });
  if (r.status === 404 || r.status === 400 || r.status === 410) return null;
  if (!r.ok) throw new Error("Google Play ne répond pas (" + r.status + ")");
  return r.json();
}

/** État utile d'un achat (purchaseState : 0 payé, 1 annulé, 2 en attente ; purchaseType 0 : achat de test). */
export function etatAchat(a, produit) {
  if (!a) return { connu: false, paye: false, attente: false };
  const autreProduit = a.productId != null && a.productId !== produit;
  return {
    connu: !autreProduit,
    paye: !autreProduit && a.purchaseState === 0,
    attente: !autreProduit && a.purchaseState === 2,
    consomme: a.consumptionState === 1,
    test: a.purchaseType === 0,
    commande: typeof a.orderId === "string" ? a.orderId.slice(0, 64) : null
  };
}

/** Consommer l'achat (vaut accusé de réception : sans lui, Google rembourse au bout de 3 jours). */
export async function consommer(produit, jeton, acces, f) {
  const r = await f(urlAchat(produit, jeton) + ":consume", { method: "POST", headers: { authorization: "Bearer " + acces } });
  return r.ok;
}

/** Empreinte du jeton gardée en base (le jeton lui-même n'est jamais conservé). */
export async function empreinte(jeton) {
  const h = await crypto.subtle.digest("SHA-256", texteEnOctets(jeton));
  return "play-" + Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
