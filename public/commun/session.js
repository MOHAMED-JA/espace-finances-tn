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

  /* Réseau absent (et non session refusée) : on ne déconnecte jamais pour une simple coupure. */
  var horsLigne = false;
  function estErreurReseau(e) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    return !!e && (e.name === "AuthRetryableFetchError" || e.status === 0 || /fetch|network|réseau|Load failed/i.test(String(e.message || "")));
  }

  /* Pages réservées : redirige si la session est absente ou invalide.
     Hors connexion, la session enregistrée sur l'appareil suffit pour relire ses propres données (lecture seule côté serveur). */
  function exigerConnexion() {
    return client.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { location.replace(adresseConnexion()); return new Promise(function () {}); }
      var verifie = client.auth.getUser().then(function (rr) {
        if (rr.error && estErreurReseau(rr.error)) { horsLigne = true; return s.user; }
        return rr.error || !rr.data ? null : rr.data.user;
      }, function (e) { if (estErreurReseau(e)) { horsLigne = true; return s.user; } return null; });
      return verifie.then(function (u) {
        if (!u) {
          return client.auth.signOut({ scope: "local" }).finally(function () { location.replace(adresseConnexion()); })
            .then(function () { return new Promise(function () {}); });
        }
        /* Double authentification : une session sans le code (« aal1 ») repasse par l'étape du code.
           Hors connexion, la session de l'appareil suffit (le serveur, lui, refuse sans « aal2 »). */
        if (window.EFMfa && !horsLigne && window.EFMfa.requis(u, s)) {
          var suiteCode = location.pathname + location.search + location.hash;
          location.replace("/connexion.html?mfa=1&suite=" + encodeURIComponent(suiteCode));
          return new Promise(function () {});
        }
        /* Politique de confidentialité et CGV : acceptation obligatoire (écran bloquant si besoin). */
        if (!window.EFConsentement) return u;
        return window.EFConsentement.garantir(u, {
          dernier: consentements.dernier, accepter: consentements.accepter, deconnecter: deconnexion,
          horsLigne: function (e) { return horsLigne || estErreurReseau(e); }
        }, document).then(function (c) { consentementActuel = c || null; return u; });
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
  function appelPaiement(corps) { return appelFonction("paiement", corps, "Le service de paiement ne répond pas."); }
  function appelFonction(nom, corps, indisponible) {
    return client.functions.invoke(nom, { body: corps }).then(function (r) {
      if (!r.error && r.data && r.data.erreur) { var b = new Error(r.data.erreur); b.code = r.data.code; throw b; }
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && typeof ctx.json === "function") {
        return ctx.json().then(function (d) { var e = new Error((d && d.erreur) || indisponible); e.statut = ctx.status; e.code = d && d.code; throw e; },
          function () { throw new Error(indisponible); });
      }
      throw new Error(indisponible);
    });
  }
  /* Assistant (IA) : question, échanges précédents et résumé chiffré du profil, calculé sur l'appareil. */
  var assistant = {
    demander: function (question, historique, contexte, calcul) {
      return appelFonction("assistant", { question: question, historique: historique, contexte: contexte, calcul: calcul || "" }, "L'Assistant ne répond pas pour le moment.");
    }
  };
  /* ---------- Rappels par email ----------
   * Le plan (rappels datés, textes sans montant) est calculé sur l'appareil ; la fonction serveur « rappels-email »
   * l'envoie à 12 h 30 les jours où un rappel arrive. Confirmation immédiate d'une adresse de contact différente. */
  var rappelsEmail = {
    enregistrer: function (plan) { return client.rpc("rappels_plan_enregistrer", { p_plan: plan }).then(verifier); },
    etat: function () { return client.rpc("rappels_mon_etat").then(verifier); },
    reactiver: function () { return client.rpc("rappels_reactiver").then(verifier); },
    confirmer: function () { return appelFonction("rappels-email", { action: "confirmation" }, "L'email de confirmation ne part pas pour le moment."); }
  };
  /* ---------- Objectifs (« Ma progression ») ----------
   * Tables objectifs et objectifs_versements (RLS : ses propres lignes ; 12 objectifs, 600 versements au plus). */
  var COL_OBJ = "id, type, libelle, cible, depart, echeance, credit, cree_le";
  function ligneObjectif(o) {
    return { id: o.id, type: o.type, libelle: o.libelle || "", cible: Number(o.cible) || 0, depart: Number(o.depart) || 0, echeance: o.echeance || null, credit: o.credit == null ? null : Number(o.credit), cree_le: o.cree_le };
  }
  function champsObjectif(o) {
    var t = ["projet", "precaution", "credit", "impot"].indexOf(o.type) !== -1 ? o.type : null;
    if (!t) return null;
    var borne = function (v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1e8, Math.round(v * 1000) / 1000)) : 0; };
    return { type: t, libelle: String(o.libelle || "").replace(/\s+/g, " ").trim().slice(0, 60), cible: borne(o.cible), depart: borne(o.depart),
      echeance: /^\d{4}-\d{2}-\d{2}$/.test(o.echeance || "") ? o.echeance : null,
      credit: t === "credit" && o.credit != null && o.credit >= 0 && o.credit < 50 ? Math.floor(o.credit) : null };
  }
  var objectifs = {
    lister: function () {
      return Promise.all([
        client.from("objectifs").select(COL_OBJ).order("cree_le", { ascending: true }).limit(12).then(verifier),
        client.from("objectifs_versements").select("id, objectif_id, montant, le").order("le", { ascending: true }).limit(600).then(verifier)
      ]).then(function (r) {
        return { objectifs: (r[0] || []).map(ligneObjectif),
          versements: (r[1] || []).map(function (v) { return { id: v.id, objectif: v.objectif_id, montant: Number(v.montant) || 0, le: v.le }; }) };
      });
    },
    creer: function (o) {
      var c = champsObjectif(o); if (!c) return Promise.reject(new Error("Objectif invalide."));
      return client.from("objectifs").insert(c).select(COL_OBJ).single().then(verifier).then(ligneObjectif);
    },
    modifier: function (id, o) {
      var c = champsObjectif(o); if (!c) return Promise.reject(new Error("Objectif invalide."));
      return client.from("objectifs").update(c).eq("id", id).select(COL_OBJ).single().then(verifier).then(ligneObjectif);
    },
    supprimer: function (id) { return client.from("objectifs").delete().eq("id", id).then(verifier); },
    verser: function (objectif, montant, le) {
      var m = Math.round(Number(montant) * 1000) / 1000;
      if (!(m > 0 && m <= 1e7)) return Promise.reject(new Error("Montant invalide."));
      var ligne = { objectif_id: objectif, montant: m };
      if (/^\d{4}-\d{2}-\d{2}$/.test(le || "")) ligne.le = le;
      return client.from("objectifs_versements").insert(ligne).select("id, objectif_id, montant, le").single().then(verifier)
        .then(function (v) { return { id: v.id, objectif: v.objectif_id, montant: Number(v.montant) || 0, le: v.le }; });
    },
    annulerVersement: function (id) { return client.from("objectifs_versements").delete().eq("id", id).then(verifier); }
  };
  /* ---------- Acceptation de la politique et des CGV (table consentements : lecture et ajout seulement) ---------- */
  var consentementActuel = null;
  var consentements = {
    dernier: function () {
      return client.from("consentements").select("version, accepte_le").order("accepte_le", { ascending: false }).limit(1)
        .then(verifier).then(function (r) { return (r && r[0]) || null; });
    },
    accepter: function (version) {
      return client.from("consentements").insert({ version: version, documents: "confidentialite+cgv" }).select("version, accepte_le").single()
        .then(function (r) {
          /* Déjà enregistrée (autre onglet, double clic) : on relit la ligne existante. */
          if (r.error && r.error.code === "23505") return consentements.dernier();
          return verifier(r);
        });
    },
    actuel: function () { return consentementActuel; }
  };
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
      return client.from("paiements").select("reference, formule, montant_millimes, statut, cree_le, paye_le, passerelle")
        .order("cree_le", { ascending: false }).limit(20).then(verifier);
    },
    /* Prix affichés (offre de lancement, code promo éventuel) : toujours calculés par le serveur. */
    offres: function (code) { return client.rpc("offres_en_cours", { p_code: code || null }).then(verifier); },
    verifierCode: function (code) { return client.rpc("verifier_code", { p_code: code }).then(verifier); },
    commander: function (formule, code) { return appelPaiement({ action: "creer", formule: formule, code: code || undefined }); },
    verifier: function (reference) { return appelPaiement({ action: "verifier", reference: reference }); },
    detail: function (reference) { return appelPaiement({ action: "detail", reference: reference }); },
    simuler: function (reference, resultat) { return appelPaiement({ action: "simuler", reference: reference, resultat: resultat }); },
    /* Application Android : achat Google Play vérifié, enregistré une fois et consommé par le serveur. */
    play: function (produit, jeton) { return appelPaiement({ action: "play", produit: produit, jeton: jeton }); }
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
    statistiques: function (jours) { return client.rpc("admin_statistiques", { p_jours: jours || 30 }).then(verifier); },
    fiches: function () { return client.rpc("admin_fiches").then(verifier); },
    fiche: function (id) { return client.rpc("admin_fiche", { p_user: id }).then(verifier); },
    contacts: function () { return client.rpc("admin_contacts").then(verifier); },
    /* Accès offert à vie, retirable : un compte, tous les comptes, ou les comptes créés à partir de maintenant. */
    offertEtat: function () { return client.rpc("admin_offert_etat").then(verifier); },
    offrir: function (id, oui) { return client.rpc("admin_offrir", { p_user: id, p_offert: !!oui }).then(verifier); },
    offrirTous: function (oui) { return client.rpc("admin_offrir_tous", { p_offert: !!oui }).then(verifier); },
    offrirNouveaux: function (oui) { return client.rpc("admin_offrir_nouveaux", { p_actif: !!oui }).then(verifier); },
    /* TMM du mois (point 5) : saisi par l'administrateur, appliqué à tout Orbite. mois : « AAAA-MM-01 ». */
    tmmSaisir: function (mois, taux) { return client.rpc("admin_tmm_saisir", { p_mois: mois, p_taux: taux }).then(verifier); },
    tmmSupprimer: function (mois) { return client.rpc("admin_tmm_supprimer", { p_mois: mois }).then(verifier); },
    /* Mode conseiller (migration 0018) : le rôle n'est donné que par l'administrateur. */
    conseillers: function () { return client.rpc("admin_conseillers").then(verifier); },
    conseillerDefinir: function (email, nom, actif) { return client.rpc("admin_conseiller_definir", { p_email: email, p_nom: nom, p_actif: !!actif }).then(verifier); }
  };
  /* Mode conseiller (lot C, migration 0018) : lecture seule, double authentification exigée côté serveur. */
  var conseiller = {
    moi: function () { return client.rpc("conseiller_moi").then(verifier); },
    inviter: function () { return client.rpc("conseiller_inviter").then(verifier); },
    invitations: function () { return client.rpc("conseiller_invitations_en_cours").then(verifier); },
    clients: function () { return client.rpc("conseiller_clients").then(verifier); }
  };
  /* Côté client : accepter un conseiller avec son code, voir les consultations, retirer l'accord. */
  var partageConseiller = {
    etat: function () { return client.rpc("partage_conseiller_etat").then(verifier); },
    voir: function (code) { return client.rpc("partage_conseiller_voir", { p_code: code }).then(verifier); },
    accepter: function (code) { return client.rpc("partage_conseiller_accepter", { p_code: code }).then(verifier); },
    retirer: function (id) { return client.rpc("partage_conseiller_retirer", { p_conseiller: id }).then(verifier); }
  };
  /* Historique du TMM (lecture pour tout compte connecté), du plus récent au plus ancien. */
  var tmm = {
    historique: function (n) { return client.rpc("tmm_historique", { p_mois: n || 24 }).then(verifier); }
  };
  /* Accord de l'utilisateur pour que l'administrateur consulte sa fiche (révocable à tout moment). */
  var partage = {
    etat: function () { return client.rpc("partage_admin_etat").then(verifier); },
    definir: function (oui) { return client.rpc("partage_admin_definir", { p_accord: !!oui }).then(verifier); }
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

  /* Toast : icône (fait / information / problème), titre, détail facultatif, action facultative (« Annuler »),
     barre du temps restant ; pause au survol, au focus et onglet caché ; erreurs persistantes ; 3 au plus à l'écran.
     options : { type: "ok" | "info" | "erreur", erreur (= type erreur), detail, action: { libelle, fn }, duree } */
  var ICONES_TOAST = {
    ok: '<path d="M4.4 8.4l2.3 2.3 4.9-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<path d="M8 7.2v4.3M8 4.6v.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    erreur: '<path d="M8 4.2v4.4M8 11.3v.1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  function toast(texte, options) {
    var o = options || {}, type = o.erreur ? "erreur" : (ICONES_TOAST[o.type] ? o.type : "ok");
    var t = document.createElement("div");
    t.className = "toast toast--" + type;
    t.setAttribute("role", type === "erreur" ? "alert" : "status");
    var ico = document.createElement("span");
    ico.className = "toast__ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<svg viewBox="0 0 16 16">' + ICONES_TOAST[type] + "</svg>";
    t.appendChild(ico);
    var corps = document.createElement("span");
    corps.className = "toast__corps";
    var s = document.createElement("span");
    s.className = "toast__t";
    s.textContent = texte;
    corps.appendChild(s);
    if (o.detail) {
      var d = document.createElement("span");
      d.className = "toast__d";
      d.textContent = o.detail;
      corps.appendChild(d);
    }
    t.appendChild(corps);
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
    if (type === "erreur") {
      var x = document.createElement("button");
      x.type = "button";
      x.textContent = "Fermer";
      x.className = "toast__fermer";
      x.addEventListener("click", fermer);
      t.appendChild(x);
    }
    var zone = zoneToasts();
    zone.appendChild(t);
    /* Trois au plus : les plus anciennes (hors erreurs) s'effacent. */
    var vivants = [].filter.call(zone.children, function (c) { return !c.classList.contains("sortie") && !c.classList.contains("toast--erreur"); });
    while (vivants.length > 3) { var v = vivants.shift(); v.classList.add("sortie"); setTimeout(v.remove.bind(v), 170); }
    if (type !== "erreur") {
      var reste = o.duree || 4800, debut = Date.now(), minuterie = null;
      var barre = document.createElement("span");
      barre.className = "toast__barre";
      barre.setAttribute("aria-hidden", "true");
      barre.style.setProperty("animation-duration", reste + "ms");
      t.appendChild(barre);
      var lancer = function () { if (minuterie || !t.isConnected) return; debut = Date.now(); minuterie = setTimeout(fermer, reste); t.classList.remove("toast--pause"); };
      var pause = function () { if (minuterie) { clearTimeout(minuterie); minuterie = null; reste -= Date.now() - debut; } t.classList.add("toast--pause"); };
      t.addEventListener("pointerenter", pause);
      t.addEventListener("pointerleave", lancer);
      t.addEventListener("focusin", pause);
      t.addEventListener("focusout", lancer);
      document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); else lancer(); });
      lancer();
    }
    return fermer;
  }

  /* Thème : clé propre à l'Espace pour ne pas gêner les outils. */
  var CLE_THEME = "ef-theme";
  function themeActuel() {
    var t = null;
    try { t = localStorage.getItem(CLE_THEME); } catch (e) {}
    return t === "dark" || t === "light" || t === "heure" ? t : null;
  }
  function appliquerTheme(t) {
    var r = document.documentElement;
    try { if (t) localStorage.setItem(CLE_THEME, t); else localStorage.removeItem(CLE_THEME); } catch (e) {}
    if (window.EFTheme) window.EFTheme.appliquer(); else if (t) r.setAttribute("data-theme", t); else r.removeAttribute("data-theme");
  }
  function themeEffectif() {
    if (window.EFTheme && window.EFTheme.effectif) return window.EFTheme.effectif();
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
    admin: admin, partage: partage, tmm: tmm, conseiller: conseiller, partageConseiller: partageConseiller,
    parrainage: parrainage,
    assistant: assistant,
    rappelsEmail: rappelsEmail,
    objectifs: objectifs,
    consentements: consentements,
    estErreurReseau: estErreurReseau,
    horsLigne: function () { return horsLigne || (typeof navigator !== "undefined" && navigator.onLine === false); },
    compterUsage: compterUsage,
    compte: compte,
    toast: toast,
    themeActuel: themeActuel,
    themeEffectif: themeEffectif,
    appliquerTheme: appliquerTheme,
    initiales: initiales
  };
})();
