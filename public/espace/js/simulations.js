/* Orbite — simulations enregistrées et compte (la navigation est gérée par app.js). */
(function () {
  "use strict";
  var E = window.Espace, M = window.EFModele;
  var $ = function (id) { return document.getElementById(id); };
  var utilisateur = null, profil = null, liste = [], chargee = false;
  var dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  /* ---------- Cartes ---------- */
  var modele = $("modele-carte");

  function carte(s) {
    var o = M.OUTILS[s.outil];
    var noeud = modele.content.firstElementChild.cloneNode(true);
    noeud.setAttribute("data-outil", s.outil);
    noeud.setAttribute("data-id", s.id);
    var lien = noeud.querySelector(".carte__lien");
    lien.href = "#" + ({ salaire: "salaire", assurance_vie: "epargne", credit: "credit" })[s.outil];
    lien.addEventListener("click", function (e) { e.preventDefault(); window.Orbite.ouvrirSimulation(s); });
    lien.setAttribute("aria-label", s.nom + " — " + o.court + ", ouvrir");
    noeud.querySelector(".carte__outil").textContent = o.court;
    noeud.querySelector(".carte__date").textContent = dateFmt.format(new Date(s.modifie_le));
    noeud.querySelector(".carte__nom").textContent = s.nom;
    var r = M.resumeValide(s.resume);
    var principal = noeud.querySelector(".carte__principal");
    if (r.principal) {
      noeud.querySelector(".carte__principal-lib").textContent = r.principal.libelle;
      noeud.querySelector(".carte__principal-val").textContent = M.formaterIndicateur(r.principal);
    } else principal.hidden = true;
    var sec = noeud.querySelector(".carte__secondaires");
    r.secondaires.forEach(function (x) {
      var sp = document.createElement("span");
      sp.appendChild(document.createTextNode(x.libelle + " "));
      var st = document.createElement("strong");
      st.textContent = M.formaterIndicateur(x);
      sp.appendChild(st);
      sec.appendChild(sp);
    });
    var fav = noeud.querySelector(".carte__favori");
    fav.setAttribute("aria-pressed", s.favori ? "true" : "false");
    fav.setAttribute("aria-label", (s.favori ? "Retirer des favoris : " : "Ajouter aux favoris : ") + s.nom);
    noeud.querySelector(".carte__menu").setAttribute("aria-label", "Actions pour " + s.nom);
    return noeud;
  }

  function vide(texte, action) {
    var li = document.createElement("li");
    li.className = "vide";
    var p = document.createElement("strong");
    p.textContent = texte;
    li.appendChild(p);
    if (action) {
      var a = document.createElement("a");
      a.className = "bouton bouton--plein bouton--petit";
      a.href = action.href;
      a.textContent = action.libelle;
      li.appendChild(a);
    }
    return li;
  }

  function squelettes(ul, n) {
    ul.textContent = "";
    for (var i = 0; i < n; i++) { var li = document.createElement("li"); li.className = "squelette squelette-carte"; li.setAttribute("aria-hidden", "true"); ul.appendChild(li); }
  }

  function rendreToutes() {
    if (!chargee) return;
    var ul = $("toutes");
    var outil = (document.querySelector("#filtres-outil input:checked") || {}).value || "";
    var texte = $("recherche").value.trim().toLowerCase();
    var tri = $("tri").value;
    var res = liste.filter(function (s) {
      return (!outil || s.outil === outil) && (!texte || s.nom.toLowerCase().indexOf(texte) !== -1);
    });
    res.sort(function (a, b) {
      if (tri === "nom") return a.nom.localeCompare(b.nom, "fr");
      if (tri === "ancien") return new Date(a.modifie_le) - new Date(b.modifie_le);
      if (tri === "favori" && a.favori !== b.favori) return a.favori ? -1 : 1;
      return new Date(b.modifie_le) - new Date(a.modifie_le);
    });
    ul.textContent = "";
    ul.setAttribute("aria-busy", "false");
    if (!res.length) {
      ul.appendChild(liste.length ? vide("Aucune simulation ne correspond à ce filtre.") :
        vide("Votre liste est vide. Dans chaque module, touchez « Enregistrer » en haut de l'écran.", { href: "#salaire", libelle: "Ouvrir le module Salaire" }));
    } else res.forEach(function (s) { ul.appendChild(carte(s)); });
  }

  function majCompteurs() {
    $("compte-total").textContent = liste.length ? String(liste.length) : "";
    $("quota").textContent = liste.length ? liste.length + " sur 200 enregistrées, sur tous vos appareils." : "Vos calculs enregistrés, sur tous vos appareils.";
  }

  function rendreTout() { majCompteurs(); rendreToutes(); }

  function charger() {
    squelettes($("toutes"), 3);
    return E.simulations.lister().then(function (data) {
      liste = data || [];
      chargee = true;
      rendreTout();
    }).catch(function (err) {
      chargee = true;
      $("toutes").textContent = "";
      $("toutes").appendChild(vide(M.messageErreur(err)));
      E.toast(M.messageErreur(err), { erreur: true });
    });
  }

  /* ---------- Actions sur une carte ---------- */
  var menu = $("menu-actions"), cible = null, declencheur = null;
  function trouver(id) { for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i]; return null; }
  function fermerMenu(rendreFocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (declencheur) { declencheur.setAttribute("aria-expanded", "false"); if (rendreFocus) declencheur.focus(); }
    cible = null;
  }
  function ouvrirMenu(bouton, s) {
    cible = s; declencheur = bouton;
    bouton.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    var r = bouton.getBoundingClientRect(), largeur = menu.offsetWidth, hauteur = menu.offsetHeight;
    var gauche = Math.max(8, Math.min(r.right - largeur, innerWidth - largeur - 8));
    var haut = r.bottom + 6 + hauteur > innerHeight - 8 ? r.top - hauteur - 6 : r.bottom + 6;
    menu.style.left = gauche + "px";
    menu.style.top = Math.max(8, haut) + "px";
    menu.querySelector("button").focus();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".carte__menu");
    if (b) {
      var s = trouver(b.closest(".carte").getAttribute("data-id"));
      if (cible && declencheur === b) { fermerMenu(true); return; }
      fermerMenu(false);
      if (s) ouvrirMenu(b, s);
      return;
    }
    var f = e.target.closest(".carte__favori");
    if (f) { basculerFavori(trouver(f.closest(".carte").getAttribute("data-id")), f); return; }
    if (!e.target.closest("#menu-actions")) fermerMenu(false);
  });
  menu.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll("button"));
    var i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { items[(i + 1) % items.length].focus(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
    else if (e.key === "Escape") { fermerMenu(true); e.preventDefault(); }
    else if (e.key === "Tab") fermerMenu(false);
  });
  menu.addEventListener("click", function (e) {
    var b = e.target.closest("[data-action]");
    if (!b || !cible) return;
    var s = cible, action = b.getAttribute("data-action");
    fermerMenu(action !== "renommer");
    if (action === "ouvrir") window.Orbite.ouvrirSimulation(s);
    else if (action === "renommer") renommer(s);
    else if (action === "dupliquer") dupliquer(s);
    else if (action === "supprimer") supprimer(s);
  });
  window.addEventListener("resize", function () { fermerMenu(false); });
  window.addEventListener("scroll", function () { fermerMenu(false); }, { passive: true });

  function remplacer(s) {
    liste = liste.map(function (x) { return x.id === s.id ? s : x; });
    liste.sort(function (a, b) { return new Date(b.modifie_le) - new Date(a.modifie_le); });
    rendreTout();
  }

  function basculerFavori(s, bouton) {
    if (!s) return;
    var valeur = !s.favori;
    bouton.setAttribute("aria-pressed", valeur ? "true" : "false");
    E.simulations.favori(s.id, valeur).then(function (maj) {
      s.favori = maj.favori;
      rendreTout();
    }).catch(function (err) {
      bouton.setAttribute("aria-pressed", s.favori ? "true" : "false");
      E.toast(M.messageErreur(err), { erreur: true });
    });
  }

  function renommer(s) {
    var dlg = $("dlg-renommer"), champ = $("nouveau-nom");
    champ.value = s.nom;
    dlg.returnValue = "";
    dlg.showModal();
    champ.select();
    dlg.addEventListener("close", function fin() {
      dlg.removeEventListener("close", fin);
      if (declencheur) declencheur.focus();
      if (dlg.returnValue !== "ok") return;
      var nom = M.nomValide(champ.value);
      if (!nom || nom === s.nom) return;
      E.simulations.renommer(s.id, nom).then(function (maj) { remplacer(maj); E.toast("Simulation renommée."); })
        .catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
    });
  }

  function dupliquer(s) {
    E.simulations.creer(s.outil, (s.nom + " (copie)").slice(0, 120), s.parametres && s.parametres.etat || "", s.resume)
      .then(function (copie) { liste.unshift(copie); rendreTout(); E.toast("Copie créée."); })
      .catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
  }

  /* Suppression avec annulation pendant 6 s : effacée côté serveur, restaurée si « Annuler ». */
  function supprimer(s) {
    document.querySelectorAll('.carte[data-id="' + s.id + '"]').forEach(function (c) { c.classList.add("retrait"); });
    setTimeout(function () {
      liste = liste.filter(function (x) { return x.id !== s.id; });
      rendreTout();
    }, 160);
    E.simulations.supprimer(s.id).then(function () {
      E.toast("« " + s.nom + " » supprimée.", {
        duree: 6000,
        action: { libelle: "Annuler", fn: function () {
          E.simulations.restaurer(s).then(function (r) { liste.push(r); remplacer(r); E.toast("Simulation restaurée."); })
            .catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
        } }
      });
    }).catch(function (err) {
      liste.push(s); remplacer(s);
      E.toast(M.messageErreur(err), { erreur: true });
    });
  }

  ["recherche", "tri"].forEach(function (id) { $(id).addEventListener("input", rendreToutes); });
  $("filtres-outil").addEventListener("change", function () {
    var v = (document.querySelector("#filtres-outil input:checked") || {}).value || "";
    rendreToutes();
  });

  /* ---------- Compte ---------- */
  function remplirCompte() {
    var meta = utilisateur.user_metadata || {};
    var nom = (profil && profil.nom_affiche) || meta.full_name || meta.name || utilisateur.email.split("@")[0];
    $("nom-affiche").value = (profil && profil.nom_affiche) || "";
    $("nom-affiche").placeholder = nom;
    $("email-compte").textContent = utilisateur.email || "";
    var fournisseurs = (utilisateur.app_metadata && utilisateur.app_metadata.providers) || [utilisateur.app_metadata && utilisateur.app_metadata.provider].filter(Boolean);
    var libelles = fournisseurs.map(function (p) { return p === "google" ? "Google" : p === "email" ? "E-mail et mot de passe" : p; });
    $("methode-compte").textContent = libelles.join(" · ") || "E-mail";
    $("bloc-mdp").hidden = fournisseurs.indexOf("email") === -1;
  }

  $("form-nom").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = this.querySelector("button[type=submit]");
    b.disabled = true;
    E.compte.renommer($("nom-affiche").value).then(function () {
      profil = profil || {};
      profil.nom_affiche = $("nom-affiche").value.replace(/\s+/g, " ").trim() || null;
      remplirCompte();
      E.toast("Profil enregistré.");
    }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); })
      .finally(function () { b.disabled = false; });
  });

  document.querySelectorAll(".afficher").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = $(b.getAttribute("aria-controls")), visible = input.type === "password";
      input.type = visible ? "text" : "password";
      b.textContent = visible ? "Masquer" : "Afficher";
      b.setAttribute("aria-pressed", visible ? "true" : "false");
    });
  });
  $("nouveau-mdp").addEventListener("input", function () { $("jauge-compte").setAttribute("data-niveau", String(M.forceMotDePasse(this.value))); });
  $("form-mdp").addEventListener("submit", function (e) {
    e.preventDefault();
    var champ = $("nouveau-mdp"), err = $("nouveau-mdp-erreur"), mdp = champ.value;
    var probleme = mdp.length < 10 ? "10 caractères au moins." : M.forceMotDePasse(mdp) < 3 ? "Trop prévisible : ajoutez majuscules, chiffres ou symboles." : "";
    err.textContent = probleme; err.hidden = !probleme; champ.setAttribute("aria-invalid", probleme ? "true" : "false");
    if (probleme) { champ.focus(); return; }
    var b = this.querySelector("button[type=submit]");
    b.disabled = true;
    /* Refus des mots de passe présents dans des fuites connues (seuls 5 caractères de l'empreinte sont envoyés). */
    (window.EFFuites ? window.EFFuites.verifier(mdp) : Promise.resolve(0)).then(function (fuites) {
      if (fuites > 0) {
        err.textContent = window.EFFuites.MESSAGE; err.hidden = false; champ.setAttribute("aria-invalid", "true"); champ.focus();
        throw { dejaAffiche: true };
      }
      return E.compte.changerMotDePasse(mdp);
    }).then(function () {
      champ.value = ""; $("jauge-compte").setAttribute("data-niveau", "0");
      E.toast("Mot de passe modifié.");
    }).catch(function (er) { if (!(er && er.dejaAffiche)) E.toast(M.messageErreur(er), { erreur: true }); })
      .finally(function () { b.disabled = false; });
  });

  /* Export */
  $("exporter").addEventListener("click", function () {
    var b = this;
    b.setAttribute("aria-busy", "true"); b.disabled = true;
    E.compte.exporter().then(function (donnees) {
      var u = window.Orbite.utilisateur();
      donnees = Object.assign({}, donnees, { profil_orbite: (u && u.user_metadata && u.user_metadata.orbite) || (window.Orbite.profil() || null) });
      var blob = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "orbite-mes-donnees-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      E.toast("Export téléchargé.");
    }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); })
      .finally(function () { b.removeAttribute("aria-busy"); b.disabled = false; });
  });

  /* Déconnexion */
  $("deconnexion-partout").addEventListener("click", function () {
    document.documentElement.removeAttribute("data-protege");
    E.client.auth.signOut({ scope: "global" }).catch(function () {}).then(function () { E.deconnexion(); });
  });

  /* Suppression du compte */
  var dlgSc = $("dlg-supprimer-compte"), confirmation = $("sc-confirmation"), valider = $("sc-valider");
  confirmation.addEventListener("input", function () { valider.disabled = confirmation.value.trim().toUpperCase() !== "SUPPRIMER"; });
  $("supprimer-compte").addEventListener("click", function () {
    $("sc-nombre").textContent = String(liste.length);
    confirmation.value = ""; valider.disabled = true; dlgSc.returnValue = "";
    dlgSc.showModal();
    confirmation.focus();
  });
  dlgSc.addEventListener("close", function () {
    if (dlgSc.returnValue !== "ok" || confirmation.value.trim().toUpperCase() !== "SUPPRIMER") return;
    E.compte.supprimer().then(function () {
      try { localStorage.removeItem(window.EF_CONFIG.cleSession); } catch (e) {}
      location.replace("/?compte-supprime=1");
    }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
  });

  /* ---------- Démarrage (après la vérification de session faite par app.js) ---------- */
  /* La session peut être prête avant le chargement de ce script : on démarre alors tout de suite. */
  function demarrer() {
    utilisateur = window.Orbite.utilisateur();
    remplirCompte();
    E.compte.profil().then(function (p) { profil = p; remplirCompte(); }).catch(function () {});
    charger();
  }
  if (window.Orbite && window.Orbite.pret) demarrer();
  else document.addEventListener("orbite:pret", demarrer, { once: true });
  document.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "simulations") rendreToutes(); });

  window.OrbiteSimulations = { recharger: charger, liste: function () { return liste; } };
})();
