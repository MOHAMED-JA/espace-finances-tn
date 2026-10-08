/*
 * Faux Supabase (Auth + PostgREST) pour les tests de bout en bout, branché sur
 * page.route() de Playwright. Il imite le contrat HTTP utilisé par supabase-js
 * et applique la même règle d'isolation que la RLS : un utilisateur ne voit
 * que ses propres lignes.
 */
"use strict";
const crypto = require("node:crypto");

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }

function creer() {
  const comptes = new Map();   // email -> { user, mdp }
  const jetons = new Map();    // access_token -> user id
  const rafraich = new Map();  // refresh_token -> user id
  let simulations = [];
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
  function abonnementDe(id) {
    if (!abonnements.has(id)) abonnements.set(id, { essai_fin: new Date(Date.now() + 3 * 86400000).toISOString(), fin: null, formule: null, offert: false });
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
    a.fin = depart.toISOString(); a.formule = f.cle;
    p.statut = "paye"; p.paye_le = new Date().toISOString();
  }

  function jeton(user) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = b64url({ alg: "HS256", typ: "JWT" }) + "." + b64url({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: crypto.randomUUID() }) + ".c2lnbmF0dXJl";
    const refresh = crypto.randomBytes(12).toString("hex");
    jetons.set(access, user.id);
    rafraich.set(refresh, user.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user };
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
        const c = comptes.get(corps.email);
        if (!c || c.mdp !== corps.password) return repondre(route, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return repondre(route, 200, jeton(c.user));
      }
      if (type === "refresh_token") {
        const id = rafraich.get(corps.refresh_token);
        if (!id) return repondre(route, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        return repondre(route, 200, jeton(userParId(id)));
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
    if (url.pathname === "/auth/v1/logout") {
      const t = (req.headers()["authorization"] || "").replace(/^Bearer\s+/i, "");
      const id = jetons.get(t);
      if (url.searchParams.get("scope") === "global" && id) for (const [k, v] of jetons) if (v === id) jetons.delete(k);
      jetons.delete(t);
      return repondre(route, 204);
    }
    if (url.pathname === "/auth/v1/recover") return repondre(route, 200, {});
    if (url.pathname === "/auth/v1/settings") return repondre(route, 200, { external: { email: true, google: true } });

    /* ---------- Formules (lecture publique) ---------- */
    if (url.pathname === "/rest/v1/formules") return repondre(route, 200, FORMULES);

    /* ---------- PostgREST ---------- */
    const u = auth(req);

    /* ---------- Fonction serveur « paiement » (mode test) ---------- */
    if (url.pathname === "/functions/v1/paiement") {
      if (!u) return repondre(route, 401, { erreur: "Connexion requise" });
      if (corps.action === "creer") {
        const f = FORMULES.find((x) => x.cle === corps.formule);
        if (!f) return repondre(route, 400, { erreur: "Formule inconnue" });
        const reference = "ORB-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        paiements.push({ reference, user_id: u.id, formule: f.cle, montant_millimes: f.prix_millimes, passerelle: "test", statut: "cree", cree_le: new Date().toISOString(), paye_le: null, test: null });
        return repondre(route, 200, { url: url.origin.replace(/.*/, "") + "/espace/paiement-test.html?ref=" + reference, reference });
      }
      const p = paiements.find((x) => x.reference === corps.reference && x.user_id === u.id);
      if (!p) return repondre(route, 404, { erreur: "Commande introuvable" });
      if (corps.action === "detail") {
        const f = FORMULES.find((x) => x.cle === p.formule);
        return repondre(route, 200, { reference: p.reference, formule: p.formule, libelle: f.libelle, mois: f.mois, montant_millimes: p.montant_millimes, statut: p.statut, passerelle: "test" });
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
    if (url.pathname === "/rest/v1/profils") {
      const p = profils.get(u.id);
      if (methode === "GET") return unique(req) ? repondre(route, 200, p) : repondre(route, 200, [p]);
      if (methode === "PATCH") { Object.assign(p, { nom_affiche: corps.nom_affiche }); return repondre(route, 204); }
    }
    if (url.pathname === "/rest/v1/rpc/mon_acces") return repondre(route, 200, acces(u.id));
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
    paiements: () => paiements,
    abonnementDe(email) { return abonnementDe(comptes.get(email).user.id); },
    expirerEssai(email) { abonnementDe(comptes.get(email).user.id).essai_fin = new Date(Date.now() - 60000).toISOString(); },
    comptes,
    journal,
    jetonPour(email) { return jeton(comptes.get(email).user); }
  };
}

module.exports = { creer };
