/*
 * Orbite — fonction serveur « assistant » (Supabase Edge Function).
 * POST JSON, utilisateur connecté (Authorization: Bearer <jeton>) :
 *   { question, historique?: [{ role, contenu }], contexte?: "résumé chiffré du profil" }
 *   → { reponse, restantes } ou { erreur, code }
 * Contrôles : accès en cours (essai, abonnement ou offert), quota quotidien, tailles bornées (regles.js).
 * Rien n'est conservé par Orbite hormis le nombre de questions du jour.
 *
 * Secrets (Supabase → Edge Functions → Secrets), jamais dans le dépôt :
 *   ANTHROPIC_API_KEY  (obligatoire : sans elle, l'assistant répond « bientôt disponible »)
 *   ASSISTANT_MODELE   (facultatif, par défaut claude-opus-5-5)
 *   ASSISTANT_QUOTA    (facultatif, questions par jour et par compte, 30 par défaut)
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { SYSTEME, nettoyer, messages, reponseTexte } from "./regles.js";

const env = Deno.env.toObject();
const URL_APPLICATION = (env.URL_APPLICATION || "https://espace-finances-tn.jaouadimohamedaziz.workers.dev").replace(/\/+$/, "");
const MODELE = env.ASSISTANT_MODELE || "claude-opus-5-5";
const QUOTA = Math.max(1, Math.min(500, parseInt(env.ASSISTANT_QUOTA || "30", 10) || 30));
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const claude = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }) : null;

function origineAutorisee(o: string | null) {
  if (!o) return null;
  if (o === URL_APPLICATION) return o;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) return o;
  return null;
}
function entetes(req: Request) {
  const o = origineAutorisee(req.headers.get("origin"));
  const h: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" };
  if (o) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}
function repondre(req: Request, corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes(req) });
}

async function accesActif(userId: string) {
  const { data } = await admin.from("abonnements").select("essai_fin, fin, offert").eq("user_id", userId).maybeSingle();
  if (!data) return false;
  const n = Date.now();
  return !!(data.offert || (data.fin && Date.parse(data.fin) > n) || (data.essai_fin && Date.parse(data.essai_fin) > n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes(req) });
  if (req.method !== "POST") return repondre(req, { erreur: "Méthode non autorisée" }, 405);
  const jeton = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = jeton ? await admin.auth.getUser(jeton) : { data: null };
  const user = u && u.user;
  if (!user) return repondre(req, { erreur: "Connexion requise" }, 401);
  /* Réponse 200 : état normal tant que la clé n'est pas configurée. */
  if (!claude) return repondre(req, { erreur: "L'Assistant Orbite arrive très bientôt.", code: "bientot" });
  if (!(await accesActif(user.id))) return repondre(req, { erreur: "L'Assistant est inclus dans l'abonnement : choisissez une formule pour l'utiliser.", code: "abonnement" });

  let corps: unknown;
  try { corps = await req.json(); } catch { return repondre(req, { erreur: "Requête invalide" }, 400); }
  const e = nettoyer(corps);
  if ("erreur" in e) return repondre(req, { erreur: e.erreur, code: "invalide" }, 400);

  const { data: restantes, error: eq } = await admin.rpc("assistant_reserver", { p_user: user.id, p_quota: QUOTA });
  if (eq) return repondre(req, { erreur: "Assistant momentanément indisponible." }, 503);
  if (restantes < 0) return repondre(req, { erreur: "Vous avez posé " + QUOTA + " questions aujourd'hui : l'Assistant sera de nouveau disponible demain.", code: "quota" }, 429);

  try {
    const r = await claude.beta.messages.create({
      model: MODELE,
      max_tokens: 4000,
      /* Conversation : effort faible (réponses courtes et rapides), réflexion adaptative par défaut. */
      output_config: { effort: "low" },
      /* Consignes fixes en premier, mises en cache ; la question et le profil viennent après. */
      system: [{ type: "text", text: SYSTEME, cache_control: { type: "ephemeral" } }],
      messages: messages(e),
      /* Refus d'un classifieur de sécurité : un autre modèle reprend automatiquement la même requête. */
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as any);
    const t = reponseTexte(r);
    return repondre(req, { reponse: t.texte, refus: t.refus, restantes });
  } catch (x) {
    /* La question n'a pas abouti : elle n'est pas décomptée. */
    await admin.rpc("assistant_rendre", { p_user: user.id }).then(() => {}, () => {});
    const statut = x instanceof Anthropic.RateLimitError ? 429 : 502;
    return repondre(req, { erreur: statut === 429 ? "L'Assistant est très sollicité : réessayez dans une minute." : "L'Assistant ne répond pas pour le moment. Réessayez dans un instant." }, statut);
  }
});
