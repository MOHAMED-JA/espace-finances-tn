/*
 * Session et données de l'utilisateur (navigateur).
 * Dépend de : vendor/supabase.js, config.js, modele.js.
 * Expose window.Espace : client Supabase, session, simulations, outils d'interface.
 */
(function () {
  "use strict";
  var C = window.EF_CONFIG, M = window.EFModele;

  var client = window.supabase.createClient(C.supabaseUrl, C.supabaseCle, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: C.cleSession
    }
  });

  var adresseConnexion = function () {
    var suite = location.pathname + location.search + location.hash;
    return "/connexion.html?suite=" + encodeURIComponent(suite);
  };

  /* Session vérifiée auprès du serveur (le jeton local seul ne suffit pas). */
  function utilisateur() {
    return client.auth.getUser().then(function (r) {
      return r.error || !r.data ? null : r.data.user;
    }).catch(function () { return null; });
  }

  /* Pages réservées : redirige si la session est absente ou invalide. */
  function exigerConnexion() {
    return client.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { location.replace(adresseConnexion()); return new Promise(function () {}); }
      return utilisateur().then(function (u) {
        if (!u) {
          return client.auth.signOut({ scope: "local" }).finally(function () { location.replace(adresseConnexion()); })
            .then(function () { return new Promise(function () {}); });
        }
        return u;
      });
    });
  }

  /* Sortie volontaire : la redirection automatique des pages protégées est suspendue. */
  function sortieVolontaire() { document.documentElement.removeAttribute("data-protege"); }

  function deconnexion() {
    sortieVolontaire();
    return client.auth.signOut().catch(function () {}).then(function () {
      try { localStorage.removeItem(C.cleSession); } catch (e) {}
      location.replace("/connexion.html?au-revoir=1");
    });
  }

  client.auth.onAuthStateChange(function (evt) {
    if (evt === "SIGNED_OUT" && document.documentElement.hasAttribute("data-protege")) {
      location.replace(adresseConnexion());
    }
  });

  /* ---------- Simulations ---------- */
  var COLONNES = "id, outil, nom, parametres, resume, favori, cree_le, modifie_le";

  function verifier(r) {
    if (r.error) throw r.error;
    return r.data;
  }

  var simulations = {
    lister: function (outil) {
      var q = client.from("simulations").select(COLONNES).order("modifie_le", { ascending: false }).limit(200);
      if (outil) q = q.eq("outil", outil);
      return q.then(verifier);
    },
    lire: function (id) {
      return client.from("simulations").select(COLONNES).eq("id", id).maybeSingle().then(verifier);
    },
    creer: function (outil, nom, etat, resume) {
      var n = M.nomValide(nom), e = M.nettoyerEtat(etat);
      if (!M.outilValide(outil) || n === null || e === null) return Promise.reject(new Error("Simulation invalide."));
      return client.from("simulations")
        .insert({ outil: outil, nom: n, parametres: { v: 1, etat: e }, resume: M.resumeValide(resume) })
        .select(COLONNES).single().then(verifier);
    },
    mettreAJour: function (id, etat, resume) {
      var e = M.nettoyerEtat(etat);
      if (e === null) return Promise.reject(new Error("Simulation invalide."));
      return client.from("simulations").update({ parametres: { v: 1, etat: e }, resume: M.resumeValide(resume) })
        .eq("id", id).select(COLONNES).single().then(verifier);
    },
    renommer: function (id, nom) {
      var n = M.nomValide(nom);
      if (n === null) return Promise.reject(new Error("Nom invalide."));
      return client.from("simulations").update({ nom: n }).eq("id", id).select(COLONNES).single().then(verifier);
    },
    favori: function (id, valeur) {
      return client.from("simulations").update({ favori: !!valeur }).eq("id", id).select(COLONNES).single().then(verifier);
    },
    supprimer: function (id) {
      return client.from("simulations").delete().eq("id", id).then(verifier);
    },
    restaurer: function (s) {
      return client.from("simulations")
        .insert({ outil: s.outil, nom: s.nom, parametres: s.parametres, resume: s.resume, favori: s.favori })
        .select(COLONNES).single().then(verifier);
    }
  };

  var compte = {
    profil: function () {
      return client.from("profils").select("id, nom_affiche, cree_le").maybeSingle().then(verifier);
    },
    renommer: function (nom) {
      var n = typeof nom === "string" ? nom.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      return utilisateur().then(function (u) {
        if (!u) throw new Error("not authenticated");
        return client.from("profils").update({ nom_affiche: n || null }).eq("id", u.id).then(verifier);
      });
    },
    exporter: function () {
      return client.rpc("exporter_mes_donnees").then(verifier);
    },
    supprimer: function () {
      sortieVolontaire();
      /* La photo de profil (espace privé) est effacée d'abord, puis le compte et toutes ses données. */
      return avatar.supprimer().catch(function () {}).then(function () { return client.rpc("supprimer_mon_compte"); }).then(verifier).then(function () {
        return client.auth.signOut({ scope: "local" }).catch(function () {});
      }, function (err) {
        document.documentElement.setAttribute("data-protege", "");
        throw err;
      });
    },
    /* Préférences synchronisées entre appareils (user_metadata) : surnom, activité, page d'ouverture. */
    preferences: function (donnees) { return client.auth.updateUser({ data: donnees }).then(verifier); },
    changerMotDePasse: function (mdp) {
      return client.auth.updateUser({ password: mdp }).then(verifier);
    }
  };

  /* ---------- Abonnement ----------
   * Lecture seule côté navigateur (RLS) ; les commandes et l'activation passent par la
   * fonction serveur « paiement », qui vérifie chaque paiement auprès de la passerelle. */
  function appelPaiement(corps) {
    return client.functions.invoke("paiement", { body: corps }).then(function (r) {
      if (!r.error && r.data && r.data.erreur) { var b = new Error(r.data.erreur); b.code = r.data.code; throw b; }
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function") {
        return ctx.json().then(function (d) { var e = new Error((d && d.erreur) || "Le service de paiement ne répond pas."); e.statut = ctx.status; throw e; },
          function () { throw new Error("Le service de paiement ne répond pas."); });
      }
      throw new Error("Le service de paiement ne répond pas.");
    });
  }
  /* ---------- Photo de profil ----------
   * Préférence dans user_metadata.orbite_avatar : "stockage" (photo importée, espace privé),
   * "google" (photo du compte Google), "aucun" (initiales). Par défaut : Google s'il y en a une. */
  var CHEMIN_AVATAR = function (id) { return id + "/avatar.webp"; };
  function photoGoogle(u) {
    var m = (u && u.user_metadata) || {}, url = m.avatar_url || m.picture || "";
    return /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(url) ? url : null;
  }
  var avatar = {
    google: photoGoogle,
    /* Adresse à afficher (ou null pour les initiales). */
    source: function (u) {
      var m = (u && u.user_metadata) || {}, choix = m.orbite_avatar || (photoGoogle(u) ? "google" : "aucun");
      if (choix === "google") return Promise.resolve(photoGoogle(u));
      if (choix !== "stockage") return Promise.resolve(null);
      return client.storage.from("avatars").createSignedUrl(CHEMIN_AVATAR(u.id), 3600).then(function (r) { return r.error ? null : r.data.signedUrl; }).catch(function () { return null; });
    },
    envoyer: function (blob) {
      return utilisateur().then(function (u) {
        if (!u) throw new Error("not authenticated");
        return client.storage.from("avatars").upload(CHEMIN_AVATAR(u.id), blob, { upsert: true, contentType: "image/webp", cacheControl: "3600" }).then(verifier);
      }).then(function () { return client.auth.updateUser({ data: { orbite_avatar: "stockage", orbite_avatar_v: Date.now() } }).then(verifier); });
    },
    choisir: function (choix) { return client.auth.updateUser({ data: { orbite_avatar: choix } }).then(verifier); },
    supprimer: function () {
      return utilisateur().then(function (u) {
        if (!u) throw new Error("not authenticated");
        return client.storage.from("avatars").remove([CHEMIN_AVATAR(u.id)]).then(function () {});
      }).then(function () { return client.auth.updateUser({ data: { orbite_avatar: "aucun" } }).then(verifier); });
    }
  };

  var abonnement = {
    acces: function () { return client.rpc("mon_acces").then(verifier); },
    formules: function () { return client.from("formules").select("cle, libelle, mois, prix_millimes, ordre").order("ordre").then(verifier); },
    paiements: function () {
      return client.from("paiements").select("reference, formule, montant_millimes, statut, cree_le, paye_le")
        .order("cree_le", { ascending: false }).limit(20).then(verifier);
    },
    /* Prix affichés (offre de lancement, code promo éventuel) : toujours calculés par le serveur. */
    offres: function (code) { return client.rpc("offres_en_cours", { p_code: code || null }).then(verifier); },
    verifierCode: function (code) { return client.rpc("verifier_code", { p_code: code }).then(verifier); },
    commander: function (formule, code) { return appelPaiement({ action: "creer", formule: formule, code: code || undefined }); },
    verifier: function (reference) { return appelPaiement({ action: "verifier", reference: reference }); },
    detail: function (reference) { return appelPaiement({ action: "detail", reference: reference }); },
    simuler: function (reference, resultat) { return appelPaiement({ action: "simuler", reference: reference, resultat: resultat }); }
  };

  /* Administration : chaque fonction vérifie côté serveur que le compte est administrateur. */
  var parrainage = {
    moi: function () { return client.rpc("mon_parrainage").then(verifier); },
    utiliser: function (code) { return client.rpc("utiliser_code_parrain", { p_code: code }).then(verifier); }
  };
  var admin = {
    codes: function () { return client.rpc("admin_codes").then(verifier); },
    codeEnregistrer: function (c) { return client.rpc("admin_code_enregistrer", { p: c }).then(verifier); },
    codeActiver: function (code, actif) { return client.rpc("admin_code_activer", { p_code: code, p_actif: actif }).then(verifier); },
    est: function () { return client.rpc("est_admin").then(verifier).then(function (v) { return v === true; }, function () { return false; }); },
    tableau: function () { return client.rpc("admin_tableau").then(verifier); },
    alertes: function () { return client.rpc("admin_alertes_liste").then(verifier); },
    alertesLues: function () { return client.rpc("admin_alertes_lues").then(verifier); },
    statistiques: function (jours) { return client.rpc("admin_statistiques", { p_jours: jours || 30 }).then(verifier); }
  };
  /* Statistiques anonymes : un simple compteur (type, page), jamais d'identifiant ni de contenu. Sans effet en cas d'erreur. */
  function compterUsage(type, cle) {
    try { return client.rpc("compter_usage", { p_type: type, p_cle: cle }).then(function () {}, function () {}); } catch (e) { return Promise.resolve(); }
  }

  /* ---------- Interface ---------- */
  function zoneToasts() {
    var z = document.querySelector(".toasts");
    if (!z) {
      z = document.createElement("div");
      z.className = "toasts";
      z.setAttribute("aria-live", "polite");
      document.body.appendChild(z);
    }
    return z;
  }

  /* Toast : pause au survol, au focus et onglet caché ; erreurs persistantes. */
  function toast(texte, options) {
    var o = options || {};
    var t = document.createElement("div");
    t.className = "toast";
    if (o.erreur) t.setAttribute("role", "alert");
    var s = document.createElement("span");
    s.textContent = texte;
    t.appendChild(s);
    var fermer = function () {
      if (t.classList.contains("sortie")) return;
      t.classList.add("sortie");
      setTimeout(function () { t.remove(); }, 170);
    };
    if (o.action) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = o.action.libelle;
      b.addEventListener("click", function () { o.action.fn(); fermer(); });
      t.appendChild(b);
    }
    if (o.erreur) {
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "Fermer";
      x.addEventListener("click", fermer);
      t.appendChild(x);
    }
    zoneToasts().appendChild(t);
    if (!o.erreur) {
      var reste = o.duree || 4200, debut = Date.now(), minuterie = null;
      var lancer = function () { debut = Date.now(); minuterie = setTimeout(fermer, reste); };
      var pause = function () { if (minuterie) { clearTimeout(minuterie); minuterie = null; reste -= Date.now() - debut; } };
      t.addEventListener("pointerenter", pause);
      t.addEventListener("pointerleave", lancer);
      t.addEventListener("focusin", pause);
      t.addEventListener("focusout", lancer);
      document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); else if (!minuterie && t.isConnected) lancer(); });
      lancer();
    }
    return fermer;
  }

  /* Thème : clé propre à l'Espace pour ne pas gêner les outils. */
  var CLE_THEME = "ef-theme";
  function themeActuel() {
    var t = null;
    try { t = localStorage.getItem(CLE_THEME); } catch (e) {}
    return t === "dark" || t === "light" ? t : null;
  }
  function appliquerTheme(t) {
    var r = document.documentElement;
    try { if (t) localStorage.setItem(CLE_THEME, t); else localStorage.removeItem(CLE_THEME); } catch (e) {}
    if (window.EFTheme) window.EFTheme.appliquer(); else if (t) r.setAttribute("data-theme", t); else r.removeAttribute("data-theme");
  }
  function themeEffectif() {
    var t = themeActuel();
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function initiales(nom, email) {
    var source = (nom || email || "?").trim();
    var mots = source.split(/[\s@._-]+/).filter(Boolean);
    var i = mots.length > 1 ? mots[0][0] + mots[1][0] : source.slice(0, 2);
    return i.toUpperCase();
  }

  window.Espace = {
    client: client,
    modele: M,
    utilisateur: utilisateur,
    exigerConnexion: exigerConnexion,
    deconnexion: deconnexion,
    simulations: simulations,
    abonnement: abonnement,
    avatar: avatar,
    admin: admin,
    parrainage: parrainage,
    compterUsage: compterUsage,
    compte: compte,
    toast: toast,
    themeActuel: themeActuel,
    themeEffectif: themeEffectif,
    appliquerTheme: appliquerTheme,
    initiales: initiales
  };
})();
