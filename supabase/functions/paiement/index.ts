/*
 * Orbite — fonction serveur « paiement » (Supabase Edge Function).
 *
 * Actions (POST JSON, utilisateur connecté : en-tête Authorization: Bearer <jeton>) :
 *   { action: "creer", formule }        → crée la commande et renvoie l'adresse de la page de paiement
 *   { action: "verifier", reference }   → interroge la passerelle ; active l'abonnement si le paiement est confirmé
 *   { action: "detail", reference }     → résumé d'une commande de l'utilisateur (page de paiement de test)
 *   { action: "simuler", reference, resultat: "ok" | "refuse" } → mode test uniquement
 * Notification de la passerelle (GET ou POST, sans jeton) : ?webhook=1&ref=<référence>
 *   → ne fait JAMAIS confiance au contenu reçu : elle relance seulement la vérification côté serveur.
 *
 * Secrets (Supabase → Edge Functions → Secrets), jamais dans le dépôt :
 *   PASSERELLE = test | konnect | flouci | clictopay      (test par défaut)
 *   URL_APPLICATION (par défaut l'adresse Cloudflare d'Orbite)
 *   KONNECT_API_KEY, KONNECT_WALLET_ID, KONNECT_SANDBOX (0 = production)
 *   FLOUCI_APP_TOKEN, FLOUCI_APP_SECRET
 *   CLICTOPAY_USER, CLICTOPAY_PASSWORD, CLICTOPAY_TEST (0 = production)
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { passerelle, nouvelleReference, REFERENCE_VALIDE } from "./passerelles.js";

const env = Deno.env.toObject();
env.URL_APPLICATION = (env.URL_APPLICATION || "https://espace-finances-tn.jaouadimohamedaziz.workers.dev").replace(/\/+$/, "");
const URL_FONCTION = (env.SUPABASE_URL || "") + "/functions/v1/paiement";
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* Origines autorisées : l'application en ligne et les essais locaux. */
function origineAutorisee(o: string | null) {
  if (!o) return null;
  if (o === env.URL_APPLICATION) return o;
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

async function utilisateur(req: Request) {
  const jeton = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const { data, error } = await admin.auth.getUser(jeton);
  return error || !data.user ? null : data.user;
}

async function paiementDe(reference: string) {
  const { data } = await admin.from("paiements").select("*").eq("reference", reference).maybeSingle();
  return data;
}

/* Vérifie auprès de la passerelle et active l'abonnement si le paiement est confirmé. */
async function verifierEtActiver(p: Record<string, any>) {
  if (p.statut === "paye") return { statut: "paye", deja: true };
  const pg = passerelle({ ...env, PASSERELLE: p.passerelle });
  const v = await pg.verifier(p);
  if (v.paye) {
    const { data, error } = await admin.rpc("activer_paiement", { p_reference: p.reference, p_reference_passerelle: p.reference_passerelle });
    if (error) throw new Error("Activation impossible");
    return { statut: "paye", fin: data && data.fin };
  }
  if (v.statut === "echec") await admin.from("paiements").update({ statut: "echec" }).eq("id", p.id).eq("statut", "cree");
  return { statut: v.statut };
}

async function creer(req: Request, u: { id: string }, formule: string) {
  const { data: f } = await admin.from("formules").select("*").eq("cle", formule).eq("actif", true).maybeSingle();
  if (!f) return repondre(req, { erreur: "Formule inconnue" }, 400);
  /* Anti-abus : au plus 10 commandes non payées par heure et par compte. */
  const depuis = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("paiements").select("id", { count: "exact", head: true }).eq("user_id", u.id).eq("statut", "cree").gte("cree_le", depuis);
  if ((count || 0) >= 10) return repondre(req, { erreur: "Trop de tentatives : réessayez dans une heure." }, 429);

  let pg;
  try { pg = passerelle(env); } catch (_e) { return repondre(req, { erreur: "Le paiement est momentanément indisponible." }, 503); }
  const reference = nouvelleReference();
  const { error } = await admin.from("paiements").insert({ user_id: u.id, formule: f.cle, montant_millimes: f.prix_millimes, passerelle: pg.nom, reference });
  if (error) return repondre(req, { erreur: "Commande impossible" }, 500);
  try {
    const c = await pg.creer({
      reference, montantMillimes: f.prix_millimes, description: "Orbite — abonnement " + f.libelle.toLowerCase(),
      urlRetour: env.URL_APPLICATION + "/espace/?paiement=" + reference,
      urlEchec: env.URL_APPLICATION + "/espace/?paiement=" + reference + "&echec=1",
      urlWebhook: URL_FONCTION + "?webhook=1&ref=" + reference
    });
    await admin.from("paiements").update({ reference_passerelle: c.referencePasserelle }).eq("reference", reference);
    return repondre(req, { url: c.url, reference });
  } catch (_e) {
    await admin.from("paiements").update({ statut: "annule" }).eq("reference", reference);
    return repondre(req, { erreur: "La passerelle de paiement ne répond pas. Réessayez dans quelques minutes." }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetes(req) });
  const url = new URL(req.url);

  /* Notification de la passerelle : on revérifie, sans rien croire du message reçu. */
  if (url.searchParams.get("webhook") === "1") {
    const ref = url.searchParams.get("ref") || "";
    if (REFERENCE_VALIDE.test(ref)) {
      const p = await paiementDe(ref);
      if (p) { try { await verifierEtActiver(p); } catch (_e) { /* la passerelle renverra la notification */ } }
    }
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") return repondre(req, { erreur: "Méthode non autorisée" }, 405);
  const u = await utilisateur(req);
  if (!u) return repondre(req, { erreur: "Connexion requise" }, 401);
  let corps: Record<string, any>;
  try { corps = await req.json(); } catch { return repondre(req, { erreur: "Requête invalide" }, 400); }

  if (corps.action === "creer") return creer(req, u, String(corps.formule || ""));

  const ref = String(corps.reference || "");
  if (!REFERENCE_VALIDE.test(ref)) return repondre(req, { erreur: "Référence invalide" }, 400);
  const p = await paiementDe(ref);
  if (!p || p.user_id !== u.id) return repondre(req, { erreur: "Commande introuvable" }, 404);

  if (corps.action === "detail") {
    const { data: f } = await admin.from("formules").select("libelle, mois").eq("cle", p.formule).maybeSingle();
    return repondre(req, { reference: p.reference, formule: p.formule, libelle: f && f.libelle, mois: f && f.mois, montant_millimes: p.montant_millimes, statut: p.statut, passerelle: p.passerelle });
  }

  if (corps.action === "simuler") {
    /* Interdit dès que le serveur n'est plus en mode test, même pour d'anciennes commandes de test. */
    if (p.passerelle !== "test" || (env.PASSERELLE && env.PASSERELLE !== "test")) return repondre(req, { erreur: "Disponible en mode test uniquement" }, 403);
    if (p.statut !== "cree") return repondre(req, { statut: p.statut });
    const resultat = corps.resultat === "ok" ? "ok" : "refuse";
    await admin.from("paiements").update({ detail: { test: resultat } }).eq("id", p.id);
    p.detail = { test: resultat };
    return repondre(req, await verifierEtActiver(p));
  }

  if (corps.action === "verifier") {
    try { return repondre(req, await verifierEtActiver(p)); }
    catch (_e) { return repondre(req, { erreur: "Vérification impossible pour le moment" }, 502); }
  }

  return repondre(req, { erreur: "Action inconnue" }, 400);
});
