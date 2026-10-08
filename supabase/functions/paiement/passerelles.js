/*
 * Orbite — adaptateurs de passerelles de paiement (module pur, testé sous Node).
 * Chaque passerelle expose :
 *   creer({ reference, montantMillimes, description, urlRetour, urlEchec, urlWebhook }) → { url, referencePasserelle }
 *   verifier({ reference, referencePasserelle }) → { paye: bool, statut: texte }
 * Aucune confiance n'est accordée au retour du navigateur : seule `verifier`, qui interroge
 * la passerelle depuis le serveur, peut déclencher l'activation d'un abonnement.
 *
 * Les points d'API sont ceux publiés par chaque passerelle ; ils sont à confirmer avec la
 * documentation remise à l'ouverture du compte marchand (voir MEMOIRE.md).
 */

export const PASSERELLES = ["test", "konnect", "flouci", "clictopay"];

function exiger(env, cles) {
  const manquantes = cles.filter((c) => !env[c]);
  if (manquantes.length) throw new Error("Configuration manquante : " + manquantes.join(", "));
}

async function json(reponse) {
  const texte = await reponse.text();
  try { return JSON.parse(texte); } catch { throw new Error("Réponse illisible de la passerelle (" + reponse.status + ")"); }
}

/* ---------- Test : paiement simulé, pour développer sans compte marchand ---------- */
function test(env) {
  return {
    nom: "test",
    async creer(c) {
      return { url: env.URL_APPLICATION + "/espace/paiement-test.html?ref=" + encodeURIComponent(c.reference), referencePasserelle: "test-" + c.reference };
    },
    /* En mode test, le paiement est « payé » quand la page de test l'a simulé (detail.test = "ok"). */
    async verifier(p) {
      const r = p.detail && p.detail.test;
      return { paye: r === "ok", statut: r === "ok" ? "paye" : r === "refuse" ? "echec" : "en_attente" };
    }
  };
}

/* ---------- Konnect (konnect.network) ---------- */
function konnect(env, f) {
  exiger(env, ["KONNECT_API_KEY", "KONNECT_WALLET_ID"]);
  const base = env.KONNECT_SANDBOX === "0" ? "https://api.konnect.network/api/v2" : "https://api.sandbox.konnect.network/api/v2";
  return {
    nom: "konnect",
    async creer(c) {
      const r = await f(base + "/payments/init-payment", {
        method: "POST",
        headers: { "x-api-key": env.KONNECT_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverWalletId: env.KONNECT_WALLET_ID, token: "TND", amount: c.montantMillimes, type: "immediate",
          description: c.description, acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"], lifespan: 30,
          checkoutForm: false, addPaymentFeesToAmount: false, orderId: c.reference,
          webhook: c.urlWebhook, silentWebhook: true, successUrl: c.urlRetour, failUrl: c.urlEchec, theme: "light"
        })
      });
      const d = await json(r);
      if (!r.ok || !d.payUrl) throw new Error("Konnect a refusé la commande");
      return { url: d.payUrl, referencePasserelle: d.paymentRef };
    },
    async verifier(p) {
      if (!p.reference_passerelle) return { paye: false, statut: "en_attente" };
      const r = await f(base + "/payments/" + encodeURIComponent(p.reference_passerelle), { headers: { "x-api-key": env.KONNECT_API_KEY } });
      const d = await json(r);
      const s = d && d.payment && d.payment.status;
      return { paye: s === "completed", statut: s === "completed" ? "paye" : s === "pending" ? "en_attente" : "echec" };
    }
  };
}

/* ---------- Flouci (flouci.com) ---------- */
function flouci(env, f) {
  exiger(env, ["FLOUCI_APP_TOKEN", "FLOUCI_APP_SECRET"]);
  const base = "https://developers.flouci.com/api";
  return {
    nom: "flouci",
    async creer(c) {
      const r = await f(base + "/generate_payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_token: env.FLOUCI_APP_TOKEN, app_secret: env.FLOUCI_APP_SECRET, amount: String(c.montantMillimes),
          accept_card: "true", session_timeout_secs: 1200, success_link: c.urlRetour, fail_link: c.urlEchec,
          developer_tracking_id: c.reference
        })
      });
      const d = await json(r);
      const res = d && d.result;
      if (!r.ok || !res || !res.link) throw new Error("Flouci a refusé la commande");
      return { url: res.link, referencePasserelle: res.payment_id };
    },
    async verifier(p) {
      if (!p.reference_passerelle) return { paye: false, statut: "en_attente" };
      const r = await f(base + "/verify_payment/" + encodeURIComponent(p.reference_passerelle), {
        headers: { apppublic: env.FLOUCI_APP_TOKEN, appsecret: env.FLOUCI_APP_SECRET }
      });
      const d = await json(r);
      const s = d && d.result && d.result.status;
      return { paye: s === "SUCCESS", statut: s === "SUCCESS" ? "paye" : s === "PENDING" ? "en_attente" : "echec" };
    }
  };
}

/* ---------- ClicToPay (SMT) ---------- */
function clictopay(env, f) {
  exiger(env, ["CLICTOPAY_USER", "CLICTOPAY_PASSWORD"]);
  const base = env.CLICTOPAY_TEST === "0" ? "https://ipay.clictopay.com/payment/rest" : "https://test.clictopay.com/payment/rest";
  const identifiants = () => new URLSearchParams({ userName: env.CLICTOPAY_USER, password: env.CLICTOPAY_PASSWORD });
  return {
    nom: "clictopay",
    async creer(c) {
      const q = identifiants();
      q.set("orderNumber", c.reference); q.set("amount", String(c.montantMillimes)); q.set("currency", "788");
      q.set("returnUrl", c.urlRetour); q.set("failUrl", c.urlEchec); q.set("language", "fr"); q.set("description", c.description);
      const r = await f(base + "/register.do", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q.toString() });
      const d = await json(r);
      if (!d.formUrl || (d.errorCode && d.errorCode !== "0")) throw new Error("ClicToPay a refusé la commande");
      return { url: d.formUrl, referencePasserelle: d.orderId };
    },
    async verifier(p) {
      if (!p.reference_passerelle) return { paye: false, statut: "en_attente" };
      const q = identifiants(); q.set("orderId", p.reference_passerelle);
      const r = await f(base + "/getOrderStatusExtended.do", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: q.toString() });
      const d = await json(r);
      const s = Number(d.orderStatus);
      return { paye: s === 2, statut: s === 2 ? "paye" : s === 0 ? "en_attente" : "echec" };
    }
  };
}

const FABRIQUES = { test, konnect, flouci, clictopay };

/* Passerelle choisie par la variable PASSERELLE (« test » par défaut). */
export function passerelle(env, f) {
  const nom = PASSERELLES.includes(env.PASSERELLE) ? env.PASSERELLE : "test";
  return FABRIQUES[nom](env, f || fetch);
}

/* Référence de commande lisible et unique : ORB-AAAAMMJJ-XXXXXXXX. */
export function nouvelleReference(maintenant, aleatoire) {
  const d = maintenant || new Date();
  const jour = d.toISOString().slice(0, 10).replace(/-/g, "");
  const suffixe = (aleatoire || (() => crypto.randomUUID().replace(/-/g, "").slice(0, 8)))().toUpperCase();
  return "ORB-" + jour + "-" + suffixe;
}

export const REFERENCE_VALIDE = /^ORB-\d{8}-[A-Z0-9]{8}$/;
