/*
 * Faux Supabase (Auth + PostgREST) pour les tests de bout en bout, branché sur
 * page.route() de Playwright. Il imite le contrat HTTP utilisé par supabase-js
 * et applique la même règle d'isolation que la RLS : un utilisateur ne voit
 * que ses propres lignes.
 */
"use strict";
const crypto = require("node:crypto");

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }

/* Double authentification (migration 0016) : code TOTP à 6 chiffres (RFC 6238, SHA-1, 30 s), clé en base32. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf) { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function debase32(s) { let bits = ""; for (const c of s.replace(/[\s=]/g, "").toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, decalage) {
  const pas = Math.floor(Date.now() / 30000) + (decalage || 0), c = Buffer.alloc(8);
  c.writeUInt32BE(Math.floor(pas / 2 ** 32), 0); c.writeUInt32BE(pas >>> 0, 4);
  const h = crypto.createHmac("sha1", debase32(secret)).update(c).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, "0");
}

function creer() {
  const comptes = new Map();   // email -> { user, mdp }
  const jetons = new Map();    // access_token -> user id
  const rafraich = new Map();  // refresh_token -> user id
  let simulations = [];
  /* « Ma progression » (migration 0012) : objectifs et versements, lignes de l'utilisateur seulement. */
  let objectifs = [], versementsObj = [];
  /* Acceptation de la politique et des CGV (migration 0013) : lecture et ajout seulement, date posée par le serveur. */
  let consentements = [];
  const profils = new Map();
  const journal = [];
  /* Abonnements : même contrat que la migration 0003 (essai de 3 jours, formules prépayées). */
  const FORMULES = [
    { cle: "mensuel", libelle: "Mensuel", mois: 1, prix_millimes: 9900, ordre: 1 },
    { cle: "semestriel", libelle: "Semestriel", mois: 6, prix_millimes: 49900, ordre: 2 },
    { cle: "annuel", libelle: "Annuel", mois: 12, prix_millimes: 79900, ordre: 3 }
  ];
  const abonnements = new Map();  // user id -> { essai_fin, fin, formule, offert }
  let paiements = [];
  const photos = new Map();  // chemin -> Buffer (stockage privé « avatars »)
  /* Administration (migration 0006) : admins, alertes d'inscription, compteurs anonymes. */
  const admins = new Set();
  /* Accords de partage avec l'admin (migration 0009) et journal des consultations. */
  const partages = new Map(), consultations = [];
  const etatPartage = (id) => { const c = consultations.filter((x) => x.user_id === id); return { accorde: partages.has(id), accorde_le: partages.get(id) || null, derniere_consultation: c.length ? c[c.length - 1].consulte_le : null, consultations: c.length }; };
  const compteParId = (id) => [...comptes.values()].find((c) => c.user.id === id);
  let dernierAssistant = null, assistantBientot = false, dernierAuth = null;
  const alertes = [];
  const reglages = { offert_nouveaux: false };
  /* TMM du mois (migration 0015) : mois « AAAA-MM-01 » → taux. */
  const tmm = new Map();
  const usage = new Map();  // "type:cle" -> nombre
  /* Rappels par email (migration 0011) : plan, désinscription par jeton, confirmations demandées. */
  const rappelsEmail = new Map();  // user id -> { plan, jeton, desinscrit_le, adresse_confirmee, confirmation_adresse, confirmation_envoyee_le, confirmation_jeton }
  const confirmationsEnvoyees = [];
  function ligneRappels(id) {
    if (!rappelsEmail.has(id)) rappelsEmail.set(id, { plan: [], jeton: crypto.randomUUID(), desinscrit_le: null, adresse_confirmee: null, confirmation_adresse: null, confirmation_envoyee_le: null, confirmation_jeton: null });
    return rappelsEmail.get(id);
  }
  const etatRappels = (r) => ({ desinscrit_le: r.desinscrit_le, adresse_confirmee: r.adresse_confirmee, confirmation_adresse: r.confirmation_adresse, confirmation_envoyee_le: r.confirmation_envoyee_le });
  function metaRappels(id, v) { const c = compteParId(id); if (c && c.user.user_metadata && c.user.user_metadata.orbite) c.user.user_metadata.orbite.rappelsEmail = v; }
  /* Codes promo et parrainage (migration 0007) : même règles que prix_formule / activer_paiement. */
  const codes = new Map();       // code -> { code, libelle, remise_pct, formules, fin, max_utilisations, utilisations, automatique, actif }
  const parrains = new Map();    // user id -> code
  const parrainages = new Map(); // filleul -> { parrain, recompense }
  function codeValide(c, formule) {
    return c && c.actif && (!c.fin || Date.parse(c.fin) > Date.now()) && (!c.max_utilisations || c.utilisations < c.max_utilisations) && (!c.formules || c.formules.includes(formule));
  }
  function prixFormule(cle, saisi) {
    const f = FORMULES.find((x) => x.cle === cle);
    let m = [...codes.values()].filter((c) => c.automatique && codeValide(c, cle)).sort((a, b) => b.remise_pct - a.remise_pct)[0] || null;
    const s = saisi && codes.get(String(saisi).toUpperCase());
    if (s && !s.automatique && codeValide(s, cle) && (!m || s.remise_pct > m.remise_pct)) m = s;
    const prix = m ? Math.max(1000, Math.round(f.prix_millimes * (100 - m.remise_pct) / 100 / 100) * 100) : f.prix_millimes;
    return { formule: cle, prix_initial: f.prix_millimes, prix, code: m ? m.code : null, remise_pct: m ? m.remise_pct : 0, libelle: m ? m.libelle : null, automatique: m ? m.automatique : false, fin: m ? m.fin : null };
  }
  function abonnementDe(id) {
    if (!abonnements.has(id)) abonnements.set(id, { essai_fin: new Date(Date.now() + 3 * 86400000).toISOString(), fin: null, formule: null, offert: false, testeur: false });
    return abonnements.get(id);
  }
  function acces(id) {
    const a = abonnementDe(id), n = Date.now();
    const etat = a.offert ? "offert" : a.fin && Date.parse(a.fin) > n ? "actif" : Date.parse(a.essai_fin) > n ? "essai" : "expire";
    return { etat, essai_fin: a.essai_fin, fin: a.fin, formule: a.formule, maintenant: new Date(n).toISOString() };
  }
  function activer(p) {
    if (p.statut === "paye") return;
    const f = FORMULES.find((x) => x.cle === p.formule), a = abonnementDe(p.user_id);
    const depart = new Date(Math.max(Date.now(), a.fin ? Date.parse(a.fin) : 0, a.offert ? 0 : Date.parse(a.essai_fin)));
    depart.setMonth(depart.getMonth() + f.mois);
    if (p.code_promo && codes.get(p.code_promo)) codes.get(p.code_promo).utilisations++;
    const pa = parrainages.get(p.user_id);
    if (pa && !pa.recompense) {
      depart.setMonth(depart.getMonth() + 1);
      const ap = abonnementDe(pa.parrain), dp = new Date(Math.max(Date.now(), ap.fin ? Date.parse(ap.fin) : 0, ap.offert ? 0 : Date.parse(ap.essai_fin)));
      dp.setMonth(dp.getMonth() + 1); ap.fin = dp.toISOString(); pa.recompense = true;
    }
    a.fin = depart.toISOString(); a.formule = f.cle;
    p.statut = "paye"; p.paye_le = new Date().toISOString();
  }

  const aalJeton = new Map();   // access_token -> "aal1" | "aal2"
  const aalRafraich = new Map();
  const secrets = new Map();    // factor id -> clé base32
  const defis = new Map();      // challenge id -> factor id
  function jeton(user, aal) {
    const niveau = aal || "aal1";
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: crypto.randomUUID(), aal: niveau, amr: [{ method: niveau === "aal2" ? "totp" : "password", timestamp: exp - 3600 }] }) + ".c2lnbmF0dXJl";
    const refresh = crypto.randomBytes(12).toString("hex");
    jetons.set(access, user.id); aalJeton.set(access, niveau);
    rafraich.set(refresh, user.id); aalRafraich.set(refresh, niveau);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user };
  }
  /* Comme la migration 0016 : un compte protégé ne touche à ses données qu'en « aal2 ». */
  function mfaOk(req, u) {
    const t = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
    return !(u.factors || []).some((f) => f.status === "verified") || aalJeton.get(t) === "aal2";
  }
  function userParId(id) { for (const c of comptes.values()) if (c.user.id === id) return c.user; return null; }
  function auth(req) {
    const h = req.headers()["authorization"] || "";
    const t = h.replace(/^Bearer\s+/i, "");
    return jetons.has(t) ? userParId(jetons.get(t)) : null;
  }
  function ajouterCompte(email, mdp, meta, fournisseur) {
    const user = {
      id: crypto.randomUUID(), aud: "authenticated", role: "authenticated", email,
      email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(),
      app_metadata: { provider: fournisseur || "email", providers: [fournisseur || "email"] },
      user_metadata: meta || {}
    };
    comptes.set(email, { user, mdp });
    if (reglages.offert_nouveaux) abonnements.set(user.id, { essai_fin: new Date(Date.now() + 3 * 86400000).toISOString(), fin: null, formule: null, offert: true, offert_par: "nouveaux", testeur: false });
    alertes.unshift({ id: alertes.length + 1, type: "inscription", libelle: email, cree_le: new Date().toISOString(), lue: false });
    profils.set(user.id, { id: user.id, nom_affiche: (meta && meta.full_name) || email.split("@")[0], cree_le: new Date().toISOString() });
    return user;
  }

  function filtres(url) {
    const f = [];
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset", "columns"].includes(k)) continue;
      const m = /^eq\.(.*)$/.exec(v);
      if (m) f.push([k, m[1]]);
    }
    return f;
  }
  function correspond(ligne, f) { return f.every(([k, v]) => String(ligne[k]) === v); }

  async function repondre(route, statut, corps, entetes) {
    await route.fulfill({
      status: statut,
      headers: Object.assign({ "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }, entetes || {}),
      body: corps === undefined ? "" : JSON.stringify(corps)
    });
  }
  /* Corps d'un envoi de fichier : brut, ou partie « image » d'un formulaire multipart (comme storage-js). */
  function fichierEnvoye(req) {
    const brut = req.postDataBuffer() || Buffer.alloc(0);
    const m = /boundary=([^;]+)/.exec(req.headers()["content-type"] || "");
    if (!m) return brut;
    const sep = Buffer.from("--" + m[1]);
    let debut = 0, idx;
    while ((idx = brut.indexOf(sep, debut)) !== -1) {
      const fin = brut.indexOf(sep, idx + sep.length);
      if (fin === -1) break;
      const partie = brut.subarray(idx + sep.length, fin);
      const entete = partie.indexOf("\r\n\r\n");
      if (entete !== -1 && /content-type:\s*image\//i.test(partie.subarray(0, entete).toString())) return partie.subarray(entete + 4, partie.length - 2);
      debut = fin;
    }
    return brut;
  }
  function unique(req) { return (req.headers()["accept"] || "").includes("vnd.pgrst.object"); }

  async function gerer(route) {
    const req = route.request();
    const url = new URL(req.url());
    const methode = req.method();
    const corps = req.postData() ? (() => { try { return JSON.parse(req.postData()); } catch (e) { return null; } })() : null;
    journal.push(methode + " " + url.pathname + url.search);
    if (methode === "OPTIONS") return repondre(route, 200, {});

    /* ---------- Auth ---------- */
    if (url.pathname === "/auth/v1/signup") {
      if (comptes.has(corps.email)) return repondre(route, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
      if (!corps.password || corps.password.length < 10) return repondre(route, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 10 characters." });
      const user = ajouterCompte(corps.email, corps.password, corps.data);
      return repondre(route, 200, jeton(user));
    }
    if (url.pathname === "/auth/v1/token") {
      const type = url.searchParams.get("grant_type");
      if (type === "password") {
        dernierAuth = corps;
        const c = comptes.get(corps.email);
        if (!c || c.mdp !== corps.password) return repondre(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return repondre(route, 200, jeton(c.user));
      }
      if (type === "refresh_token") {
        const id = rafraich.get(corps.refresh_token);
        if (!id) return repondre(route, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        return repondre(route, 200, jeton(userParId(id), aalRafraich.get(corps.refresh_token)));
      }
    }
    if (url.pathname === "/auth/v1/user") {
      const u = auth(req);
      if (!u) return repondre(route, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      if (methode === "PUT") {
        const c = comptes.get(u.email);
        if (corps.password) {
          if (corps.password === c.mdp) return repondre(route, 422, { code: 422, error_code: "same_password", msg: "New password should be different from the old password." });
          c.mdp = corps.password;
        }
        if (corps.data && typeof corps.data === "object") c.user.user_metadata = Object.assign({}, c.user.user_metadata, corps.data);
        return repondre(route, 200, c.user);
      }
      return repondre(route, 200, u);
    }
    /* ---------- Double authentification (TOTP) ---------- */
    if (url.pathname.startsWith("/auth/v1/factors")) {
      const u = auth(req);
      if (!u) return repondre(route, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const t = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
      const m = url.pathname.match(/^\/auth\/v1\/factors(?:\/([^/]+))?(?:\/(challenge|verify))?$/);
      u.factors = u.factors || [];
      if (methode === "POST" && !m[1]) {
        if (u.factors.some((f) => f.friendly_name === corps.friendly_name)) return repondre(route, 422, { code: 422, error_code: "mfa_factor_name_conflict", msg: "A factor with the friendly name already exists" });
        if (u.factors.some((f) => f.status === "verified") && aalJeton.get(t) !== "aal2") return repondre(route, 403, { code: 403, error_code: "insufficient_aal", msg: "AAL2 required to enroll a new factor" });
        const id = crypto.randomUUID(), secret = base32(crypto.randomBytes(20));
        u.factors.push({ id, friendly_name: corps.friendly_name, factor_type: "totp", status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        secrets.set(id, secret);
        const uri = "otpauth://totp/" + encodeURIComponent((corps.issuer || "Orbite") + ":" + u.email) + "?secret=" + secret + "&issuer=" + encodeURIComponent(corps.issuer || "Orbite");
        return repondre(route, 200, { id, type: "totp", friendly_name: corps.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/></svg>', secret, uri } });
      }
      const f = u.factors.find((x) => x.id === m[1]);
      if (!f) return repondre(route, 404, { code: 404, error_code: "mfa_factor_not_found", msg: "Factor not found" });
      if (methode === "POST" && m[2] === "challenge") { const id = crypto.randomUUID(); defis.set(id, f.id); return repondre(route, 200, { id, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 }); }
      if (methode === "POST" && m[2] === "verify") {
        if (defis.get(corps.challenge_id) !== f.id) return repondre(route, 422, { code: 422, error_code: "mfa_challenge_expired", msg: "Challenge expired" });
        const secret = secrets.get(f.id), code = String(corps.code || "");
        if (![-1, 0, 1].some((d) => totp(secret, d) === code)) return repondre(route, 422, { code: 422, error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
        defis.delete(corps.challenge_id);
        f.status = "verified"; f.updated_at = new Date().toISOString();
        return repondre(route, 200, jeton(u, "aal2"));
      }
      if (methode === "DELETE") {
        if (f.status === "verified" && aalJeton.get(t) !== "aal2") return repondre(route, 403, { code: 403, error_code: "insufficient_aal", msg: "AAL2 required to unenroll a verified factor" });
        u.factors = u.factors.filter((x) => x.id !== f.id); secrets.delete(f.id);
        return repondre(route, 200, { id: f.id });
      }
    }
    if (url.pathname === "/auth/v1/logout") {
      const t = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
      const id = jetons.get(t);
      if (url.searchParams.get("scope") === "global" && id) for (const [k, v] of jetons) if (v === id) jetons.delete(k);
      jetons.delete(t);
      return repondre(route, 204);
    }
    if (url.pathname === "/auth/v1/recover") return repondre(route, 200, {});
    if (url.pathname === "/auth/v1/settings") return repondre(route, 200, { external: { email: true, google: true } });

    /* ---------- Stockage « avatars » (privé : un dossier par compte, lecture par URL signée) ---------- */
    const mSigne = /^\/storage\/v1\/object\/sign\/avatars\/(.+)$/.exec(url.pathname);
    if (mSigne && methode === "GET") {
      const b = photos.get(decodeURIComponent(mSigne[1]));
      if (!b || !url.searchParams.get("token")) return repondre(route, 404, { message: "not found" });
      return route.fulfill({ status: 200, headers: { "Content-Type": "image/webp", "Access-Control-Allow-Origin": "*" }, body: b });
    }
    if (url.pathname.startsWith("/storage/v1/")) {
      const us = auth(req);
      if (!us) return repondre(route, 401, { message: "unauthorized" });
      if (mSigne && methode === "POST") {
        const chemin = decodeURIComponent(mSigne[1]);
        if (!chemin.startsWith(us.id + "/") || !photos.has(chemin)) return repondre(route, 400, { message: "Object not found" });
        return repondre(route, 200, { signedURL: "/object/sign/avatars/" + chemin + "?token=jeton-" + Date.now() });
      }
      const mObj = /^\/storage\/v1\/object\/avatars\/(.+)$/.exec(url.pathname);
      if (mObj && (methode === "POST" || methode === "PUT")) {
        const chemin = decodeURIComponent(mObj[1]);
        if (!chemin.startsWith(us.id + "/")) return repondre(route, 403, { message: "new row violates row-level security policy" });
        photos.set(chemin, fichierEnvoye(req));
        return repondre(route, 200, { Key: "avatars/" + chemin, Id: crypto.randomUUID() });
      }
      if (url.pathname === "/storage/v1/object/avatars" && methode === "DELETE") {
        ((corps && corps.prefixes) || []).filter((c) => c.startsWith(us.id + "/")).forEach((c) => photos.delete(c));
        return repondre(route, 200, []);
      }
      return repondre(route, 404, { message: "Route de stockage inconnue : " + methode + " " + url.pathname });
    }

    /* ---------- Liens des emails de rappel (sans connexion, par jeton) ---------- */
    if (url.pathname === "/rest/v1/rpc/rappels_desinscrire" || url.pathname === "/rest/v1/rpc/rappels_reabonner" || url.pathname === "/rest/v1/rpc/rappels_confirmer_adresse") {
      const nom = url.pathname.split("/").pop();
      const ent = [...rappelsEmail.entries()].find(([, r]) => (nom === "rappels_confirmer_adresse" ? r.confirmation_jeton : r.jeton) === corps.p_jeton);
      if (!ent) return repondre(route, 200, { ok: false });
      const [id, r] = ent;
      if (nom === "rappels_desinscrire") { r.desinscrit_le = r.desinscrit_le || new Date().toISOString(); metaRappels(id, false); const o = (compteParId(id).user.user_metadata || {}).orbite || {}; return repondre(route, 200, { ok: true, prenom: o.prenom || "" }); }
      if (nom === "rappels_reabonner") { r.desinscrit_le = null; metaRappels(id, true); return repondre(route, 200, { ok: true }); }
      r.adresse_confirmee = r.confirmation_adresse; r.confirmation_adresse = null; r.confirmation_jeton = null;
      return repondre(route, 200, { ok: true, adresse: r.adresse_confirmee });
    }

    /* ---------- Formules (lecture publique) ---------- */
    if (url.pathname === "/rest/v1/formules") return repondre(route, 200, FORMULES);

    /* ---------- PostgREST ---------- */
    const u = auth(req);

    /* ---------- Fonction serveur « paiement » (mode test) ---------- */
    /* Assistant (IA) simulé : renvoie une réponse fixe et garde la dernière requête pour les vérifications. */
    if (url.pathname === "/functions/v1/assistant") {
      if (!u) return repondre(route, 401, { erreur: "Connexion requise" });
      dernierAssistant = corps;
      if (assistantBientot) return repondre(route, 200, { erreur: "L'Assistant Orbite arrive très bientôt.", code: "bientot" });
      if (!corps || !corps.question || corps.question.length < 2) return repondre(route, 400, { erreur: "Posez votre question.", code: "invalide" });
      return repondre(route, 200, { reponse: "Oui, à partir de **mars 2032** :\n- mensualité possible : 893 DT\n- endettement sous 40 %", refus: false, restantes: 29 });
    }
    if (url.pathname === "/functions/v1/rappels-email") {
      if (!u) return repondre(route, 401, { erreur: "Connexion requise" });
      if (corps.action !== "confirmation") return repondre(route, 400, { erreur: "Action inconnue" });
      const o = ((compteParId(u.id).user.user_metadata || {}).orbite) || {}, r = ligneRappels(u.id), c = String(o.emailContact || "").toLowerCase();
      if (!o.rappelsEmail || r.desinscrit_le) return repondre(route, 200, { envoye: false, raison: "inactif" });
      if (!c || c === u.email.toLowerCase() || c === r.adresse_confirmee) return repondre(route, 200, { envoye: false, raison: "deja" });
      if (r.confirmation_envoyee_le && Date.now() - Date.parse(r.confirmation_envoyee_le) < 3600000) return repondre(route, 200, { envoye: false, raison: "limite", adresse: c });
      Object.assign(r, { confirmation_adresse: c, confirmation_jeton: crypto.randomUUID(), confirmation_envoyee_le: new Date().toISOString() });
      confirmationsEnvoyees.push({ user: u.id, adresse: c, jeton: r.confirmation_jeton });
      return repondre(route, 200, { envoye: true, raison: null, adresse: c });
    }
    if (url.pathname === "/functions/v1/paiement") {
      if (!u) return repondre(route, 401, { erreur: "Connexion requise" });
      const ab = abonnementDe(u.id);
      if ((corps.action === "creer" || corps.action === "simuler") && !(ab.testeur || ab.offert)) {
        return repondre(route, 200, { erreur: "Le paiement en ligne ouvre très bientôt. Votre essai reste actif ; vous serez prévenu dès l'ouverture.", code: "bientot" });
      }
      if (corps.action === "creer") {
        const f = FORMULES.find((x) => x.cle === corps.formule);
        if (!f) return repondre(route, 400, { erreur: "Formule inconnue" });
        const reference = "ORB-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        const px = prixFormule(f.cle, corps.code);
        paiements.push({ reference, user_id: u.id, formule: f.cle, montant_millimes: px.prix, code_promo: px.code, prix_initial_millimes: px.code ? px.prix_initial : null, passerelle: "test", statut: "cree", cree_le: new Date().toISOString(), paye_le: null, test: null });
        return repondre(route, 200, { url: url.origin.replace(/.*/, "") + "/espace/paiement-test.html?ref=" + reference, reference });
      }
      const p = paiements.find((x) => x.reference === corps.reference && x.user_id === u.id);
      if (!p) return repondre(route, 404, { erreur: "Commande introuvable" });
      if (corps.action === "detail") {
        const f = FORMULES.find((x) => x.cle === p.formule);
        return repondre(route, 200, { reference: p.reference, formule: p.formule, libelle: f.libelle, mois: f.mois, montant_millimes: p.montant_millimes, prix_initial_millimes: p.prix_initial_millimes, code_promo: p.code_promo, statut: p.statut, passerelle: "test" });
      }
      if (corps.action === "simuler") {
        if (p.statut !== "cree") return repondre(route, 200, { statut: p.statut });
        if (corps.resultat === "ok") { activer(p); return repondre(route, 200, { statut: "paye", fin: abonnementDe(u.id).fin }); }
        p.statut = "echec"; return repondre(route, 200, { statut: "echec" });
      }
      if (corps.action === "verifier") return repondre(route, 200, { statut: p.statut === "cree" ? "en_attente" : p.statut });
      return repondre(route, 400, { erreur: "Action inconnue" });
    }
    if (url.pathname.startsWith("/rest/v1/") && !u) return repondre(route, 401, { code: "PGRST301", message: "JWT expired" });
    if (url.pathname.startsWith("/rest/v1/") && !mfaOk(req, u)) return repondre(route, 403, { code: "42501", message: "Double authentification requise" });

    if (url.pathname === "/rest/v1/simulations") {
      const f = filtres(url);
      const miennes = () => simulations.filter((s) => s.user_id === u.id);
      if (methode === "GET") {
        let l = miennes().filter((s) => correspond(s, f)).sort((a, b) => b.modifie_le.localeCompare(a.modifie_le));
        if (unique(req)) return l.length ? repondre(route, 200, l[0]) : repondre(route, 406, { code: "PGRST116", message: "0 rows" });
        return repondre(route, 200, l);
      }
      if (methode === "POST") {
        const lignes = (Array.isArray(corps) ? corps : [corps]).map((c) => {
          if (miennes().length >= 200) throw new Error("quota");
          const maintenant = new Date(Date.now() + simulations.length).toISOString();
          return { id: crypto.randomUUID(), user_id: u.id, favori: false, cree_le: maintenant, modifie_le: maintenant, ...c };
        });
        if (lignes.some((l) => l.user_id !== u.id)) return repondre(route, 403, { code: "42501", message: "new row violates row-level security policy" });
        simulations.push(...lignes);
        return repondre(route, 201, unique(req) ? lignes[0] : lignes);
      }
      if (methode === "PATCH") {
        const cibles = miennes().filter((s) => correspond(s, f));
        cibles.forEach((s) => { Object.assign(s, corps, { modifie_le: new Date().toISOString() }); });
        return repondre(route, 200, unique(req) ? cibles[0] : cibles);
      }
      if (methode === "DELETE") {
        const avant = simulations.length;
        simulations = simulations.filter((s) => !(s.user_id === u.id && correspond(s, f)));
        return repondre(route, avant === simulations.length ? 200 : 204);
      }
    }
    if (url.pathname === "/rest/v1/objectifs" || url.pathname === "/rest/v1/objectifs_versements") {
      const estObj = url.pathname.endsWith("/objectifs"), f = filtres(url);
      const table = () => (estObj ? objectifs : versementsObj);
      const miennes = () => table().filter((x) => x.user_id === u.id);
      if (methode === "GET") return repondre(route, 200, miennes().filter((x) => correspond(x, f)));
      if (methode === "POST") {
        if (estObj && miennes().length >= 12) return repondre(route, 400, { code: "P0001", message: "Limite de 12 objectifs atteinte" });
        if (!estObj && !objectifs.some((o) => o.id === corps.objectif_id && o.user_id === u.id)) return repondre(route, 400, { code: "P0001", message: "Objectif introuvable" });
        const maintenant = new Date().toISOString();
        const l = estObj ? { id: crypto.randomUUID(), user_id: u.id, libelle: "", cible: 0, depart: 0, echeance: null, credit: null, cree_le: maintenant, ...corps }
          : { id: crypto.randomUUID(), user_id: u.id, le: maintenant.slice(0, 10), cree_le: maintenant, ...corps };
        table().push(l);
        return repondre(route, 201, unique(req) ? l : [l]);
      }
      if (methode === "PATCH" && estObj) {
        const cibles = miennes().filter((x) => correspond(x, f));
        cibles.forEach((x) => Object.assign(x, corps));
        return repondre(route, 200, unique(req) ? cibles[0] : cibles);
      }
      if (methode === "DELETE") {
        const ids = miennes().filter((x) => correspond(x, f)).map((x) => x.id);
        if (estObj) { objectifs = objectifs.filter((x) => !ids.includes(x.id)); versementsObj = versementsObj.filter((v) => !ids.includes(v.objectif_id)); }
        else versementsObj = versementsObj.filter((x) => !ids.includes(x.id));
        return repondre(route, 204);
      }
    }
    if (url.pathname === "/rest/v1/consentements") {
      const miennes = consentements.filter((c) => c.user_id === u.id).sort((a, b) => b.accepte_le.localeCompare(a.accepte_le));
      if (methode === "GET") return repondre(route, 200, miennes.slice(0, Number(url.searchParams.get("limit")) || miennes.length).map(({ version, accepte_le }) => ({ version, accepte_le })));
      if (methode === "POST") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(corps.version || "")) return repondre(route, 400, { code: "23514", message: "check constraint" });
        if (miennes.some((c) => c.version === corps.version)) return repondre(route, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
        const l = { id: crypto.randomUUID(), user_id: u.id, version: corps.version, documents: "confidentialite+cgv", accepte_le: new Date().toISOString() };
        consentements.push(l);
        const vue = { version: l.version, accepte_le: l.accepte_le };
        return repondre(route, 201, unique(req) ? vue : [vue]);
      }
      return repondre(route, 403, { code: "42501", message: "permission denied for table consentements" });
    }
    if (url.pathname === "/rest/v1/profils") {
      const p = profils.get(u.id);
      if (methode === "GET") return unique(req) ? repondre(route, 200, p) : repondre(route, 200, [p]);
      if (methode === "PATCH") { Object.assign(p, { nom_affiche: corps.nom_affiche }); return repondre(route, 204); }
    }
    if (url.pathname === "/rest/v1/rpc/mon_acces") return repondre(route, 200, acces(u.id));
    if (url.pathname === "/rest/v1/rpc/rappels_plan_enregistrer") {
      if (!Array.isArray(corps.p_plan) || corps.p_plan.length > 40) return repondre(route, 400, { code: "22023", message: "Plan de rappels invalide" });
      const r = ligneRappels(u.id); r.plan = corps.p_plan; r.plan_maj = new Date().toISOString(); return repondre(route, 200, etatRappels(r));
    }
    if (url.pathname === "/rest/v1/rpc/rappels_mon_etat") return repondre(route, 200, rappelsEmail.has(u.id) ? etatRappels(rappelsEmail.get(u.id)) : {});
    if (url.pathname === "/rest/v1/rpc/rappels_reactiver") { const r = ligneRappels(u.id); r.desinscrit_le = null; return repondre(route, 200, etatRappels(r)); }
    if (url.pathname === "/rest/v1/rpc/est_admin") return repondre(route, 200, admins.has(u.id));
    if (url.pathname === "/rest/v1/rpc/tmm_historique") return repondre(route, 200, [...tmm.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, corps.p_mois || 24).map(([mois, taux]) => ({ mois, taux })));
    if (url.pathname === "/rest/v1/rpc/offres_en_cours") return repondre(route, 200, FORMULES.map((f) => prixFormule(f.cle, corps.p_code)));
    if (url.pathname === "/rest/v1/rpc/verifier_code") {
      const c = codes.get(String(corps.p_code || "").trim().toUpperCase());
      if (!c || c.automatique || !c.actif) return repondre(route, 200, { valide: false, message: "Ce code n'existe pas." });
      if (c.fin && Date.parse(c.fin) <= Date.now()) return repondre(route, 200, { valide: false, message: "Ce code a expiré." });
      if (c.max_utilisations && c.utilisations >= c.max_utilisations) return repondre(route, 200, { valide: false, message: "Ce code a atteint son nombre maximal d'utilisations." });
      return repondre(route, 200, { valide: true, code: c.code, remise_pct: c.remise_pct, libelle: c.libelle, formules: c.formules, fin: c.fin });
    }
    if (url.pathname === "/rest/v1/rpc/mon_parrainage") {
      if (!parrains.has(u.id)) parrains.set(u.id, crypto.randomBytes(8).toString("hex").toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(8, "Z").slice(0, 8));
      const filleuls = [...parrainages.entries()].filter(([, v]) => v.parrain === u.id);
      return repondre(route, 200, { code: parrains.get(u.id), filleuls: filleuls.length, recompenses: filleuls.filter(([, v]) => v.recompense).length,
        parrain_saisi: parrainages.has(u.id), filleul_recompense: !!(parrainages.get(u.id) || {}).recompense,
        peut_saisir: !parrainages.has(u.id) && !paiements.some((x) => x.user_id === u.id && x.statut === "paye") });
    }
    if (url.pathname === "/rest/v1/rpc/utiliser_code_parrain") {
      const code = String(corps.p_code || "").toUpperCase(), p = [...parrains.entries()].find(([, c]) => c === code);
      if (!p) return repondre(route, 200, { ok: false, message: "Ce code de parrainage n'existe pas." });
      if (p[0] === u.id) return repondre(route, 200, { ok: false, message: "Vous ne pouvez pas utiliser votre propre code." });
      if (parrainages.has(u.id)) return repondre(route, 200, { ok: false, message: "Un code de parrainage est déjà enregistré sur votre compte." });
      parrainages.set(u.id, { parrain: p[0], recompense: false });
      return repondre(route, 200, { ok: true });
    }
    if (url.pathname === "/rest/v1/rpc/partage_admin_etat") return repondre(route, 200, etatPartage(u.id));
    if (url.pathname === "/rest/v1/rpc/partage_admin_definir") { if (corps.p_accord) { if (!partages.has(u.id)) partages.set(u.id, new Date().toISOString()); } else partages.delete(u.id); return repondre(route, 200, etatPartage(u.id)); }
    if (url.pathname === "/rest/v1/rpc/compter_usage") { const k = corps.p_type + ":" + corps.p_cle; usage.set(k, (usage.get(k) || 0) + 1); return repondre(route, 204); }
    if (url.pathname.indexOf("/rest/v1/rpc/admin_") === 0 && !admins.has(u.id)) return repondre(route, 403, { code: "42501", message: "Réservé à l'administrateur" });
    if (url.pathname === "/rest/v1/rpc/admin_tableau") {
      const liste = [...comptes.values()].map(({ user }) => ({ id: user.id, offert_par: abonnementDe(user.id).offert_par || null, nom: (user.user_metadata || {}).nom || "", email: user.email, methode: "email", inscrit_le: user.created_at, derniere_connexion: user.last_sign_in_at || user.created_at, etat: acces(user.id).etat, formule: abonnementDe(user.id).formule, testeur: !!abonnementDe(user.id).testeur }));
      const n = liste.length;
      return repondre(route, 200, { maintenant: new Date().toISOString(), inscrits: n, nouveaux_jour: n, nouveaux_7j: n, nouveaux_30j: n, connectes_jour: n, connectes_7j: n,
        essais: liste.filter((x) => x.etat === "essai").length, abonnes: liste.filter((x) => x.etat === "actif").length, offerts: liste.filter((x) => x.etat === "offert").length,
        offerts_admin: liste.filter((x) => x.etat === "offert" && x.offert_par).length, offert_nouveaux: reglages.offert_nouveaux, expires: liste.filter((x) => x.etat === "expire").length,
        par_formule: {}, revenus_total: 0, revenus_30j: 0, paiements_30j: 0, paiements_test: paiements.filter((p) => p.statut === "paye").length,
        essais_termines: 0, convertis: 0, desabonnes: 0, inscriptions_30j: [{ jour: new Date().toISOString().slice(0, 10), n }], utilisateurs: liste, alertes_non_lues: alertes.filter((a) => !a.lue).length });
    }
    if (url.pathname === "/rest/v1/rpc/admin_contacts") {
      return repondre(route, 200, [...comptes.values()].map((x) => x.user).filter((c) => ((c.user_metadata || {}).orbite || {}).contactOk === true).map((c) => {
        const o = c.user_metadata.orbite;
        return { id: c.id, nom: ((o.prenom || "") + " " + (o.nom || "")).trim(), nom_compte: c.user_metadata.nom || "", email: o.emailContact || c.email, telephone: o.telephone || null, accorde_le: o.contactOkLe || null, rappels_email: o.rappelsEmail === true };
      }));
    }
    if (url.pathname === "/rest/v1/rpc/admin_fiches") {
      return repondre(route, 200, [...partages.keys()].map((id) => { const c = compteParId(id).user, o = (c.user_metadata || {}).orbite || {};
        return { id, email: c.email, accorde_le: partages.get(id), nom: ((o.prenom || "") + " " + (o.nom || "")).trim(), nom_compte: (c.user_metadata || {}).nom || "" }; }));
    }
    if (url.pathname === "/rest/v1/rpc/admin_fiche") {
      if (!partages.has(corps.p_user)) return repondre(route, 403, { code: "42501", message: "Ce compte n'a pas donné son accord" });
      const c = compteParId(corps.p_user).user;
      consultations.push({ user_id: corps.p_user, consulte_le: new Date().toISOString() });
      return repondre(route, 200, { id: c.id, email: c.email, inscrit_le: c.created_at, derniere_connexion: c.last_sign_in_at || c.created_at, accorde_le: partages.get(c.id), profil: (c.user_metadata || {}).orbite || {} });
    }
    if (url.pathname === "/rest/v1/rpc/admin_alertes_liste") return repondre(route, 200, alertes);
    /* Accès offert à vie (migration 0014) : retirer remet l'essai ou l'abonnement payé tel quel. */
    const etatOffert = () => { const l = [...comptes.values()].map(({ user }) => abonnementDe(user.id));
      return { nouveaux: reglages.offert_nouveaux, offerts: l.filter((a) => a.offert).length, offerts_admin: l.filter((a) => a.offert && a.offert_par).length, comptes: l.length }; };
    if (url.pathname === "/rest/v1/rpc/admin_offert_etat") return repondre(route, 200, etatOffert());
    if (url.pathname === "/rest/v1/rpc/admin_offrir") {
      if (!compteParId(corps.p_user)) return repondre(route, 400, { code: "22023", message: "Compte introuvable" });
      const a = abonnementDe(corps.p_user);
      if (corps.p_offert && !a.offert) Object.assign(a, { offert: true, offert_par: "compte" });
      if (!corps.p_offert && a.offert) Object.assign(a, { offert: false, offert_par: null });
      return repondre(route, 200, etatOffert());
    }
    if (url.pathname === "/rest/v1/rpc/admin_offrir_tous") {
      [...comptes.values()].forEach(({ user }) => { const a = abonnementDe(user.id);
        if (corps.p_offert && !a.offert) Object.assign(a, { offert: true, offert_par: "tous" });
        if (!corps.p_offert && a.offert && a.offert_par) Object.assign(a, { offert: false, offert_par: null }); });
      return repondre(route, 200, etatOffert());
    }
    if (url.pathname === "/rest/v1/rpc/admin_tmm_saisir") {
      const t = Number(corps.p_taux), m = String(corps.p_mois || "").slice(0, 7) + "-01";
      if (!(t > 0 && t < 30) || !/^\d{4}-\d{2}-01$/.test(m)) return repondre(route, 400, { code: "22023", message: "TMM invalide" });
      tmm.set(m, Math.round(t * 1000) / 1000);
      return repondre(route, 200, { mois: m, taux: tmm.get(m) });
    }
    if (url.pathname === "/rest/v1/rpc/admin_tmm_supprimer") { tmm.delete(String(corps.p_mois || "").slice(0, 7) + "-01"); return repondre(route, 200, null); }
    if (url.pathname === "/rest/v1/rpc/admin_offrir_nouveaux") { reglages.offert_nouveaux = !!corps.p_actif; return repondre(route, 200, etatOffert()); }
    if (url.pathname === "/rest/v1/rpc/admin_codes") {
      const l = [...parrainages.values()];
      return repondre(route, 200, { codes: [...codes.values()], parrainages: l.length, parrainages_recompenses: l.filter((x) => x.recompense).length, parrains_actifs: new Set(l.map((x) => x.parrain)).size });
    }
    if (url.pathname === "/rest/v1/rpc/admin_code_enregistrer") {
      const c = corps.p, code = String(c.code).toUpperCase(), avant = codes.get(code);
      codes.set(code, { code, libelle: c.libelle || "", remise_pct: c.remise_pct, formules: c.formules && c.formules.length ? c.formules : null, fin: c.fin || null,
        max_utilisations: c.max_utilisations || null, utilisations: avant ? avant.utilisations : 0, automatique: !!c.automatique, actif: c.actif !== false });
      return repondre(route, 200, codes.get(code));
    }
    if (url.pathname === "/rest/v1/rpc/admin_code_activer") { const c = codes.get(corps.p_code); if (c) c.actif = !!corps.p_actif; return repondre(route, 204); }
    if (url.pathname === "/rest/v1/rpc/admin_alertes_lues") { alertes.forEach((a) => { a.lue = true; }); return repondre(route, 204); }
    if (url.pathname === "/rest/v1/rpc/admin_statistiques") {
      const de = (t) => [...usage.entries()].filter(([k]) => k.indexOf(t + ":") === 0).map(([k, v]) => ({ cle: k.slice(t.length + 1), n: v })).sort((a, b) => b.n - a.n);
      return repondre(route, 200, { jours: corps.p_jours || 30, vues: de("vue"), simulations: de("simulation"), par_jour: [] });
    }
    if (url.pathname === "/rest/v1/paiements") {
      return repondre(route, 200, paiements.filter((p) => p.user_id === u.id).sort((a, b) => b.cree_le.localeCompare(a.cree_le))
        .map(({ reference, formule, montant_millimes, statut, cree_le, paye_le }) => ({ reference, formule, montant_millimes, statut, cree_le, paye_le })));
    }
    if (url.pathname === "/rest/v1/rpc/exporter_mes_donnees") {
      return repondre(route, 200, { exporte_le: new Date().toISOString(), profil: profils.get(u.id), simulations: simulations.filter((s) => s.user_id === u.id) });
    }
    if (url.pathname === "/rest/v1/rpc/supprimer_mon_compte") {
      simulations = simulations.filter((s) => s.user_id !== u.id);
      profils.delete(u.id);
      comptes.delete(u.email);
      for (const [k, v] of jetons) if (v === u.id) jetons.delete(k);
      return repondre(route, 204);
    }
    return repondre(route, 404, { message: "Route inconnue du faux Supabase : " + methode + " " + url.pathname });
  }

  return {
    gerer,
    ajouterCompte,
    simulations: () => simulations,
    objectifs: () => objectifs,
    versementsObjectifs: () => versementsObj,
    consentementsDe(email) { const id = comptes.get(email).user.id; return consentements.filter((c) => c.user_id === id); },
    accepterPour(email, version) { consentements.push({ id: crypto.randomUUID(), user_id: comptes.get(email).user.id, version, documents: "confidentialite+cgv", accepte_le: new Date().toISOString() }); },
    paiements: () => paiements,
    photos: () => photos,
    abonnementDe(email) { return abonnementDe(comptes.get(email).user.id); },
    partageDe(email) { return etatPartage(comptes.get(email).user.id); },
    marquerAdmin(email) { admins.add(comptes.get(email).user.id); },
    tmm() { return new Map(tmm); },
    dernierAssistant() { return dernierAssistant; },
    dernierAuth() { return dernierAuth; },
    assistantSansCle(v) { assistantBientot = v; },
    abonnementDe(email) { return abonnementDe(comptes.get(email).user.id); },
    paiementsDe(email) { const id = comptes.get(email).user.id; return paiements.filter((p) => p.user_id === id); },
    usage() { return new Map(usage); },
    marquerTesteur(email) { abonnementDe(comptes.get(email).user.id).testeur = true; },
    expirerEssai(email) { abonnementDe(comptes.get(email).user.id).essai_fin = new Date(Date.now() - 60000).toISOString(); },
    rappelsEmailDe(email) { return rappelsEmail.get(comptes.get(email).user.id) || null; },
    confirmationsEnvoyees: () => confirmationsEnvoyees,
    comptes,
    journal,
    jetonPour(email) { return jeton(comptes.get(email).user); },
    /* Code à 6 chiffres actuel pour une clé (la personne qui lit son application d'authentification). */
    totp
  };
}

module.exports = { creer, totp };
