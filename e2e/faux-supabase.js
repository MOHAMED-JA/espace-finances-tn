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
  const photos = new Map();  // chemin -> Buffer (stockage privé « avatars »)
  /* Administration (migration 0006) : admins, alertes d'inscription, compteurs anonymes. */
  const admins = new Set();
  const alertes = [];
  const usage = new Map();  // "type:cle" -> nombre
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

    /* ---------- Formules (lecture publique) ---------- */
    if (url.pathname === "/rest/v1/formules") return repondre(route, 200, FORMULES);

    /* ---------- PostgREST ---------- */
    const u = auth(req);

    /* ---------- Fonction serveur « paiement » (mode test) ---------- */
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
    if (url.pathname === "/rest/v1/rpc/est_admin") return repondre(route, 200, admins.has(u.id));
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
    if (url.pathname === "/rest/v1/rpc/compter_usage") { const k = corps.p_type + ":" + corps.p_cle; usage.set(k, (usage.get(k) || 0) + 1); return repondre(route, 204); }
    if (url.pathname.indexOf("/rest/v1/rpc/admin_") === 0 && !admins.has(u.id)) return repondre(route, 403, { code: "42501", message: "Réservé à l'administrateur" });
    if (url.pathname === "/rest/v1/rpc/admin_tableau") {
      const liste = [...comptes.values()].map(({ user }) => ({ nom: (user.user_metadata || {}).nom || "", email: user.email, methode: "email", inscrit_le: user.created_at, derniere_connexion: user.last_sign_in_at || user.created_at, etat: acces(user.id).etat, formule: abonnementDe(user.id).formule, testeur: !!abonnementDe(user.id).testeur }));
      const n = liste.length;
      return repondre(route, 200, { maintenant: new Date().toISOString(), inscrits: n, nouveaux_jour: n, nouveaux_7j: n, nouveaux_30j: n, connectes_jour: n, connectes_7j: n,
        essais: liste.filter((x) => x.etat === "essai").length, abonnes: liste.filter((x) => x.etat === "actif").length, offerts: 0, expires: liste.filter((x) => x.etat === "expire").length,
        par_formule: {}, revenus_total: 0, revenus_30j: 0, paiements_30j: 0, paiements_test: paiements.filter((p) => p.statut === "paye").length,
        essais_termines: 0, convertis: 0, desabonnes: 0, inscriptions_30j: [{ jour: new Date().toISOString().slice(0, 10), n }], utilisateurs: liste, alertes_non_lues: alertes.filter((a) => !a.lue).length });
    }
    if (url.pathname === "/rest/v1/rpc/admin_alertes_liste") return repondre(route, 200, alertes);
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
    paiements: () => paiements,
    photos: () => photos,
    abonnementDe(email) { return abonnementDe(comptes.get(email).user.id); },
    marquerAdmin(email) { admins.add(comptes.get(email).user.id); },
    abonnementDe(email) { return abonnementDe(comptes.get(email).user.id); },
    paiementsDe(email) { const id = comptes.get(email).user.id; return paiements.filter((p) => p.user_id === id); },
    usage() { return new Map(usage); },
    marquerTesteur(email) { abonnementDe(comptes.get(email).user.id).testeur = true; },
    expirerEssai(email) { abonnementDe(comptes.get(email).user.id).essai_fin = new Date(Date.now() - 60000).toISOString(); },
    comptes,
    journal,
    jetonPour(email) { return jeton(comptes.get(email).user); }
  };
}

module.exports = { creer };
