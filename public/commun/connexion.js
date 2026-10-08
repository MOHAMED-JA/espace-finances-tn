/* Page de connexion : connexion, inscription, mot de passe oublié, nouveau mot de passe, Google. */
(function () {
  "use strict";
  var E = window.Espace, M = window.EFModele, client = E.client;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var suite = M.suiteSure(params.get("suite"));
  var origine = location.origin;

  var TEXTES = {
    connexion: { titre: "Bon retour", sous: "Connectez-vous pour retrouver vos simulations.", bouton: "Se connecter" },
    inscription: { titre: "Créez votre espace", sous: "Gratuit. Vos simulations restent privées et accessibles partout.", bouton: "Créer mon compte" },
    oubli: { titre: "Mot de passe oublié", sous: "Saisissez votre adresse : nous vous envoyons un lien pour en choisir un nouveau.", bouton: "Envoyer le lien" },
    reinitialiser: { titre: "Nouveau mot de passe", sous: "Choisissez un mot de passe solide pour sécuriser votre espace.", bouton: "Enregistrer le mot de passe" }
  };

  var mode = "connexion";
  var form = $("form-auth"), msg = $("message"), envoyer = $("envoyer"), onglets = document.querySelector("[data-onglets]");
  var panneau = $("panneau-auth");

  function montrer(sel, visible) {
    document.querySelectorAll(sel).forEach(function (el) { el.hidden = !visible; });
  }
  function champ(nom, visible) { montrer('[data-champ="' + nom + '"]', visible); }

  function message(texte, type) {
    if (!texte) { msg.hidden = true; msg.textContent = ""; return; }
    msg.className = "message" + (type ? " message--" + type : "");
    msg.setAttribute("role", type === "erreur" ? "alert" : "status");
    msg.textContent = texte;
    msg.hidden = false;
  }

  function erreurChamp(id, texte) {
    var el = $(id + "-erreur"), input = $(id);
    if (el) { el.textContent = texte || ""; el.hidden = !texte; }
    if (input) input.setAttribute("aria-invalid", texte ? "true" : "false");
  }
  function effacerErreurs() { ["email", "mdp", "mdp2", "cgu"].forEach(function (c) { erreurChamp(c, ""); }); }

  function changerMode(m, options) {
    var o = options || {};
    mode = m;
    var t = TEXTES[m];
    $("titre-auth").textContent = t.titre;
    $("sous-titre-auth").textContent = t.sous;
    envoyer.textContent = t.bouton;
    var avecOnglets = m === "connexion" || m === "inscription";
    onglets.hidden = !avecOnglets;
    if (avecOnglets) {
      if (o.sansAnimation) onglets.classList.add("sans-anim"); else onglets.classList.remove("sans-anim");
      onglets.setAttribute("data-actif", m);
      onglets.querySelectorAll("[role=tab]").forEach(function (b) {
        var actif = b.getAttribute("data-mode") === m;
        b.setAttribute("aria-selected", actif ? "true" : "false");
        b.tabIndex = actif ? 0 : -1;
        if (actif) panneau.setAttribute("aria-labelledby", b.id);
      });
    }
    montrer('[data-groupe="identifiants"]', avecOnglets && googleActif);
    champ("nom", m === "inscription");
    champ("email", m !== "reinitialiser");
    champ("mdp", m !== "oubli");
    champ("mdp2", m === "inscription" || m === "reinitialiser");
    champ("cgu", m === "inscription");
    $("oubli").hidden = m !== "connexion";
    var nouveau = m === "inscription" || m === "reinitialiser";
    $("mdp").setAttribute("autocomplete", nouveau ? "new-password" : "current-password");
    $("jauge").hidden = !nouveau;
    $("mdp-aide").hidden = !nouveau;
    montrer('[data-mode-lien="connexion"]', m === "oubli");
    effacerErreurs();
    message("");
    if (!o.sansAnimation) {
      panneau.classList.remove("bascule");
      void panneau.offsetWidth;
      panneau.classList.add("bascule");
    }
    var url = new URL(location.href);
    if (m === "connexion") url.searchParams.delete("mode"); else url.searchParams.set("mode", m);
    try { history.replaceState(null, "", url.pathname + url.search); } catch (e) {}
  }

  /* Onglets : clic et flèches gauche/droite */
  onglets.addEventListener("click", function (e) {
    var b = e.target.closest("[role=tab]");
    if (b && b.getAttribute("data-mode") !== mode) changerMode(b.getAttribute("data-mode"));
  });
  onglets.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var suivant = mode === "connexion" ? "inscription" : "connexion";
    changerMode(suivant, { sansAnimation: true });
    onglets.querySelector('[data-mode="' + suivant + '"]').focus();
    e.preventDefault();
  });
  document.querySelectorAll("[data-mode-lien]").forEach(function (b) {
    b.addEventListener("click", function () { changerMode(b.getAttribute("data-mode-lien")); });
  });

  /* Afficher / masquer le mot de passe */
  document.querySelectorAll(".afficher").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = $(b.getAttribute("aria-controls"));
      var visible = input.type === "password";
      input.type = visible ? "text" : "password";
      b.textContent = visible ? "Masquer" : "Afficher";
      b.setAttribute("aria-pressed", visible ? "true" : "false");
    });
  });

  /* Une erreur disparaît dès que l'utilisateur corrige le champ */
  ["email", "mdp", "mdp2"].forEach(function (id) {
    $(id).addEventListener("input", function () { if ($(id).getAttribute("aria-invalid") === "true") erreurChamp(id, ""); });
  });
  $("cgu").addEventListener("change", function () { erreurChamp("cgu", ""); });

  $("mdp").addEventListener("input", function () {
    $("jauge").setAttribute("data-niveau", String(M.forceMotDePasse(this.value)));
  });

  function occupe(bouton, oui) {
    bouton.disabled = oui;
    bouton.setAttribute("aria-busy", oui ? "true" : "false");
  }

  function valider() {
    effacerErreurs();
    var premier = null;
    function echec(id, texte) { erreurChamp(id, texte); if (!premier) premier = id; }
    var email = $("email").value.trim(), mdp = $("mdp").value, mdp2 = $("mdp2").value;
    if (mode !== "reinitialiser" && !M.emailValide(email)) echec("email", "Saisissez une adresse e-mail valide, par exemple nom@exemple.tn.");
    if (mode === "connexion" && !mdp) echec("mdp", "Saisissez votre mot de passe.");
    if (mode === "inscription" || mode === "reinitialiser") {
      if (mdp.length < 10) echec("mdp", "10 caractères au moins.");
      else if (M.forceMotDePasse(mdp) < 3) echec("mdp", "Trop prévisible : ajoutez majuscules, chiffres ou symboles, ou allongez-le.");
      if (mdp2 !== mdp) echec("mdp2", "Les deux mots de passe ne correspondent pas.");
    }
    if (mode === "inscription" && !$("cgu").checked) echec("cgu", "Acceptez la politique de confidentialité pour continuer.");
    if (premier) { var el = $(premier); if (el) el.focus(); return null; }
    return { email: email, mdp: mdp, nom: $("nom").value.trim().slice(0, 80) };
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = valider();
    if (!v) return;
    message("");
    occupe(envoyer, true);
    /* Nouveau mot de passe : refusé s'il figure dans une fuite de données connue (k-anonymat). */
    var controle = (mode === "inscription" || mode === "reinitialiser") && window.EFFuites ? window.EFFuites.verifier(v.mdp) : Promise.resolve(0);
    controle.then(function (fuites) {
      if (fuites > 0) {
        occupe(envoyer, false);
        erreurChamp("mdp", window.EFFuites.MESSAGE);
        $("mdp").focus();
        return;
      }
      envoyerFormulaire(v);
    });
  });

  function envoyerFormulaire(v) {
    var action;
    if (mode === "connexion") {
      action = client.auth.signInWithPassword({ email: v.email, password: v.mdp }).then(function (r) {
        if (r.error) throw r.error;
        location.replace(suite);
      });
    } else if (mode === "inscription") {
      action = client.auth.signUp({
        email: v.email, password: v.mdp,
        options: { emailRedirectTo: origine + "/connexion.html?confirme=1&suite=" + encodeURIComponent(suite), data: v.nom ? { full_name: v.nom } : {} }
      }).then(function (r) {
        if (r.error) throw r.error;
        if (r.data.session) { location.replace(suite); return; }
        form.reset();
        $("jauge").setAttribute("data-niveau", "0");
        message("Compte créé. Ouvrez le lien de confirmation envoyé à " + v.email + " pour activer votre espace (pensez aux courriers indésirables).", "succes");
      });
    } else if (mode === "oubli") {
      action = client.auth.resetPasswordForEmail(v.email, { redirectTo: origine + "/connexion.html?mode=reinitialiser" }).then(function (r) {
        if (r.error) throw r.error;
        message("Si un compte existe pour " + v.email + ", un lien de réinitialisation vient d'être envoyé. Ouvrez-le dans ce même navigateur.", "succes");
      });
    } else {
      action = client.auth.updateUser({ password: v.mdp }).then(function (r) {
        if (r.error) throw r.error;
        E.toast("Mot de passe mis à jour.");
        location.replace("/espace/");
      });
    }
    action.catch(function (err) { message(M.messageErreur(err), "erreur"); })
      .finally(function () { occupe(envoyer, false); });
  }

  $("google").addEventListener("click", function () {
    var b = this;
    occupe(b, true);
    client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: origine + "/connexion.html?suite=" + encodeURIComponent(suite), queryParams: { prompt: "select_account" } }
    }).then(function (r) {
      if (r.error) throw r.error;
    }).catch(function (err) { occupe(b, false); message(M.messageErreur(err), "erreur"); });
  });

  /* Le bouton Google n'apparaît que si le fournisseur est réellement activé dans Supabase
     (sinon l'utilisateur tomberait sur une erreur brute « provider is not enabled »). */
  function verifierGoogle() {
    var C = window.EF_CONFIG;
    fetch(C.supabaseUrl + "/auth/v1/settings", { headers: { apikey: C.supabaseCle } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        var actif = !!(s && s.external && s.external.google);
        if (!actif && (mode === "connexion" || mode === "inscription")) montrer('[data-groupe="identifiants"]', false);
        googleActif = actif;
      })
      .catch(function () { /* en cas de doute, on laisse le bouton */ });
  }
  var googleActif = true;

  /* ---------- Démarrage ---------- */
  var modeDemande = params.get("mode");
  var erreurUrl = params.get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");
  changerMode(TEXTES[modeDemande] ? modeDemande : "connexion", { sansAnimation: true });
  verifierGoogle();
  if (erreurUrl) message(/expired|invalid/i.test(erreurUrl) ? "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau." : M.messageErreur({ message: erreurUrl }), "erreur");
  else if (params.get("au-revoir")) message("Vous êtes déconnecté. À bientôt.", "succes");
  else if (params.get("confirme")) message("Adresse confirmée. Bienvenue !", "succes");

  client.auth.onAuthStateChange(function (evt) {
    if (evt === "PASSWORD_RECOVERY") changerMode("reinitialiser");
  });

  if (modeDemande !== "reinitialiser") {
    client.auth.getSession().then(function (r) {
      if (r.data && r.data.session) location.replace(suite);
    });
  }
})();
