/*
 * Orbite — fonction serveur « rappels-email » (Supabase Edge Function, envoi par Brevo).
 *
 * Appels :
 *   POST { action: "quotidien" } + en-tête x-orbite-cron  → envoi du jour (déclenché à 12 h 30, heure de Tunis, par pg_cron).
 *        Le jeton est tiré au hasard dans le coffre Supabase (Vault) et vérifié par la base : rappels_verifier_cron.
 *   POST { action: "confirmation" } + Authorization: Bearer <jeton de l'utilisateur>
 *        → envoie tout de suite l'email « Confirmez votre adresse » si l'adresse de contact n'est pas encore confirmée.
 *   POST ?desinscription=<jeton> → désinscription en un clic depuis la messagerie (en-tête List-Unsubscribe-Post, RFC 8058).
 *
 * Secrets (Supabase → Edge Functions → Secrets), jamais dans le dépôt :
 *   BREVO_API_KEY       clé API Brevo (créée par le propriétaire du compte Brevo)
 *   ORBITE_EXPEDITEUR   adresse d'expéditeur validée dans Brevo (sert aussi d'adresse de réponse)
 *   ORBITE_REPONSE      facultatif : autre adresse de réponse (« Répondre à »)
 *   URL_APPLICATION     facultatif (par défaut l'adresse Cloudflare d'Orbite)
 * Les journaux ne contiennent que des compteurs : aucune adresse, aucun texte de rappel.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { aEnvoyer, email, confirmation, adresses } from "./gabarit.js";

const env = Deno.env.toObject();
const APP = (env.URL_APPLICATION || "https://espace-finances-tn.jaouadimohamedaziz.workers.dev").replace(/\/+$/, "");
const URL_FONCTION = (env.SUPABASE_URL || "") + "/functions/v1/rappels-email";
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Offre gratuite de Brevo : 300 emails par jour. Marge gardée pour les confirmations. */
const MAX_PAR_JOUR = 280;

function entetes(req: Request, type = "application/json; charset=utf-8") {
  const o = req.headers.get("origin");
  const h: Record<string, string> = { "Content-Type": type, "Cache-Control": "no-store", "Vary": "Origin" };
  if (o && (o === APP || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o))) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}
function repondre(req: Request, corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes(req) });
}

async function envoyerBrevo(a: string, nom: string, m: { objet: string; html: string; texte: string }, jeton?: string) {
  const corps: Record<string, unknown> = {
    sender: { name: "Orbite", email: env.ORBITE_EXPEDITEUR },
    to: [{ email: a, ...(nom ? { name: nom } : {}) }],
    /* Brevo réécrit l'expéditeur Gmail en adresse technique (…@brevosend.com) : les réponses doivent revenir à Orbite. */
    replyTo: { email: env.ORBITE_REPONSE || env.ORBITE_EXPEDITEUR, name: "Orbite" },
    subject: m.objet, htmlContent: m.html, textContent: m.texte, tags: [jeton ? "rappels" : "confirmation"]
  };
  if (jeton) corps.headers = { "List-Unsubscribe": `<${URL_FONCTION}?desinscription=${jeton}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", "accept": "application/json" }, body: JSON.stringify(corps)
  });
  if (r.status === 401 || r.status === 403) throw new Error("brevo-refus");
  return r.ok;
}

async function envoyerConfirmation(d: Record<string, any>, adresse: string) {
  const { data: j, error } = await admin.rpc("rappels_demander_confirmation", { p_user: d.user_id, p_adresse: adresse });
  if (error || !j) return false;
  const m = confirmation({ prenom: d.prenom, adresse, urlConfirmer: `${APP}/rappels.html#c=${j}` });
  return envoyerBrevo(adresse, d.prenom, m);
}

async function quotidien() {
  const { data, error } = await admin.rpc("rappels_destinataires", { p_user: null });
  if (error) throw new Error("lecture-destinataires");
  const liste = (data || []) as Record<string, any>[], maintenant = new Date();
  const bilan = { comptes: liste.length, envoyes: 0, confirmations: 0, echecs: 0, limite: false };
  for (const d of liste) {
    if (bilan.envoyes + bilan.confirmations >= MAX_PAR_JOUR) { bilan.limite = true; break; }
    const adr = adresses(d);
    if (adr.aConfirmer) {
      /* Adresse de contact en attente : on relance seulement si l'adresse a changé ou si le lien a expiré (7 jours). */
      const depuis = d.confirmation_envoyee_le ? Date.parse(d.confirmation_envoyee_le) : 0;
      if (d.confirmation_adresse !== adr.aConfirmer || maintenant.getTime() - depuis > 7 * 86400000) {
        if (await envoyerConfirmation(d, adr.aConfirmer)) bilan.confirmations++;
      }
      continue;
    }
    if (!adr.envoyer) continue;
    const rs = aEnvoyer(d.plan, d.envoyes, maintenant, d.acces);
    if (!rs.length) continue;
    const m = email({ prenom: d.prenom, rappels: rs, urlApp: APP, urlDesinscription: `${APP}/rappels.html#d=${d.jeton}` });
    if (m && await envoyerBrevo(adr.envoyer, d.prenom, m, d.jeton)) {
      await admin.rpc("rappels_noter_envoi", { p_user: d.user_id, p_ids: rs.map((r: { id: string }) => r.id) });
      bilan.envoyes++;
    } else bilan.echecs++;
  }
  console.log("rappels-email", JSON.stringify(bilan));
  return bilan;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes(req) });
  const url = new URL(req.url);

  /* Désinscription en un clic depuis la messagerie. */
  const jd = url.searchParams.get("desinscription");
  if (jd !== null) {
    if (req.method !== "POST" || !UUID.test(jd)) return new Response("Lien de désinscription invalide.", { status: 400, headers: entetes(req, "text/plain; charset=utf-8") });
    await admin.rpc("rappels_desinscrire", { p_jeton: jd });
    return new Response("Désinscription enregistrée.", { status: 200, headers: entetes(req, "text/plain; charset=utf-8") });
  }
  if (req.method !== "POST") return repondre(req, { erreur: "Méthode non autorisée" }, 405);
  if (!env.BREVO_API_KEY || !env.ORBITE_EXPEDITEUR) return repondre(req, { erreur: "L'envoi des emails n'est pas encore configuré.", code: "configuration" }, 503);
  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { corps = {}; }

  try {
    if (corps.action === "quotidien") {
      const jeton = req.headers.get("x-orbite-cron") || "";
      const { data: ok } = await admin.rpc("rappels_verifier_cron", { p_jeton: jeton });
      if (ok !== true) return repondre(req, { erreur: "Non autorisé" }, 401);
      return repondre(req, await quotidien());
    }
    if (corps.action === "confirmation") {
      const jeton = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u, error } = jeton ? await admin.auth.getUser(jeton) : { data: { user: null }, error: true };
      if (error || !u.user) return repondre(req, { erreur: "Connexion requise" }, 401);
      const { data } = await admin.rpc("rappels_destinataires", { p_user: u.user.id });
      const d = ((data || []) as Record<string, any>[])[0];
      if (!d) return repondre(req, { envoye: false, raison: "inactif" });
      const adr = adresses(d);
      if (!adr.aConfirmer) return repondre(req, { envoye: false, raison: "deja" });
      const envoye = await envoyerConfirmation(d, adr.aConfirmer);
      return repondre(req, { envoye, raison: envoye ? null : "limite", adresse: adr.aConfirmer });
    }
    return repondre(req, { erreur: "Action inconnue" }, 400);
  } catch (e) {
    console.error("rappels-email", e instanceof Error ? e.message : "erreur");
    return repondre(req, { erreur: "Les emails ne partent pas pour le moment." }, 502);
  }
});
