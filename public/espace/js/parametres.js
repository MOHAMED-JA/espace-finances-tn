/*
 * Orbite — Paramètres (route #compte, onglet par #compte?onglet=profil|preferences|securite|abonnement|utilisation|donnees).
 * Photo de profil (Google ou importée, recadrée 256 × 256 en WebP), surnom, activité,
 * animations, page d'ouverture et statistiques d'utilisation.
 * Les champs historiques (nom, mot de passe, thème, export, suppression) restent gérés par simulations.js.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document, $ = O.$;
  var ONGLETS = ["profil", "preferences", "securite", "abonnement", "utilisation", "donnees"];
  var DATE = new Intl.DateTimeFormat("fr-TN", { day: "numeric", month: "long", year: "numeric" });
  var DATE_HEURE = new Intl.DateTimeFormat("fr-TN", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  /* ---------- Onglets (motif ARIA « tabs », flèches du clavier) ---------- */
  var nav = doc.querySelector(".param-nav");
  function ouvrir(cle, focus) {
    if (ONGLETS.indexOf(cle) === -1) cle = "profil";
    ONGLETS.forEach(function (c) {
      var t = $("tab-" + c), p = $("onglet-" + c), actif = c === cle;
      t.setAttribute("aria-selected", actif ? "true" : "false");
      t.tabIndex = actif ? 0 : -1;
      p.hidden = !actif;
    });
    if (focus) $("tab-" + cle).focus();
    O.placerPastilles($("onglet-" + cle));
    if (cle === "utilisation") rendreUtilisation();
  }
  nav.addEventListener("click", function (e) {
    var t = e.target.closest("[data-onglet]");
    if (!t) return;
    history.replaceState(null, "", "#compte?onglet=" + t.getAttribute("data-onglet"));
    ouvrir(t.getAttribute("data-onglet"));
  });
  nav.addEventListener("keydown", function (e) {
    var i = ONGLETS.indexOf(doc.activeElement && doc.activeElement.getAttribute("data-onglet"));
    if (i === -1) return;
    var n = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? ONGLETS.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    var cle = ONGLETS[(n + ONGLETS.length) % ONGLETS.length];
    history.replaceState(null, "", "#compte?onglet=" + cle);
    ouvrir(cle, true);
  });
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue === "compte") ouvrir(e.detail.params.get("onglet") || "profil");
  });

  /* ---------- Utilisateur à jour après chaque enregistrement de préférences ---------- */
  function majUtilisateur(d) {
    var u = d && (d.user || d);
    if (u && u.id) O.definirUtilisateur(u);
    remplir();
    return O.rafraichirAvatar();
  }

  /* ---------- Photo de profil ---------- */
  var erreurPhoto = $("param-photo-erreur");
  function signalerPhoto(t) { erreurPhoto.textContent = t || ""; erreurPhoto.hidden = !t; }
  function etatPhoto() {
    var u = O.utilisateur(), m = (u && u.user_metadata) || {};
    var google = E.avatar.google(u), choix = m.orbite_avatar || (google ? "google" : "aucun");
    $("param-google").hidden = !google || choix === "google";
    $("param-retirer").hidden = choix === "aucun";
  }
  /* Recadrage carré centré et réduction à 256 × 256 px, en WebP (≈ 15 à 40 ko). */
  function preparer(fichier) {
    if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) return Promise.reject(new Error("Format accepté : PNG, JPEG ou WebP."));
    if (fichier.size > 10 * 1024 * 1024) return Promise.reject(new Error("Photo trop lourde : 10 Mo au maximum."));
    return createImageBitmap(fichier).then(function (img) {
      var cote = Math.min(img.width, img.height), taille = 256;
      var c = doc.createElement("canvas"); c.width = taille; c.height = taille;
      var ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, taille, taille);
      return new Promise(function (ok, ko) { c.toBlob(function (b) { if (b) ok(b); else ko(new Error("Conversion impossible.")); }, "image/webp", 0.86); });
    }, function () { throw new Error("Cette image n'a pas pu être lue."); });
  }
  $("param-photo").addEventListener("change", function () {
    var f = this.files && this.files[0], champ = this;
    if (!f) return;
    signalerPhoto("");
    var etiquette = champ.closest("label");
    etiquette.setAttribute("aria-busy", "true");
    preparer(f).then(function (blob) { return E.avatar.envoyer(blob); }).then(majUtilisateur).then(function () {
      etatPhoto(); E.toast("Photo de profil mise à jour.");
    }).catch(function (x) { signalerPhoto((x && x.message && !/^[a-z_ ]+$/i.test(x.message)) ? x.message : "La photo n'a pas pu être enregistrée. Réessayez."); })
      .finally(function () { etiquette.removeAttribute("aria-busy"); champ.value = ""; });
  });
  $("param-google").addEventListener("click", function () {
    var b = this; b.disabled = true;
    E.avatar.choisir("google").then(majUtilisateur).then(function () { etatPhoto(); E.toast("Photo Google utilisée."); })
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); }).finally(function () { b.disabled = false; });
  });
  $("param-retirer").addEventListener("click", function () {
    var b = this; b.disabled = true;
    var u = O.utilisateur(), m = (u && u.user_metadata) || {};
    (m.orbite_avatar === "stockage" ? E.avatar.supprimer() : E.avatar.choisir("aucun")).then(majUtilisateur).then(function () { etatPhoto(); E.toast("Photo retirée : vos initiales s'affichent."); })
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); }).finally(function () { b.disabled = false; });
  });

  /* ---------- Vous connaître : surnom et activité ---------- */
  function remplir() {
    var u = O.utilisateur(), m = (u && u.user_metadata) || {};
    if (doc.activeElement !== $("param-appel")) $("param-appel").value = m.orbite_appel || "";
    $("param-metier").value = m.orbite_metier || "";
    $("param-accueil").value = m.orbite_accueil || "orbite";
    var der = u && u.last_sign_in_at;
    $("param-connexion").textContent = (der ? "Dernière connexion : " + DATE_HEURE.format(new Date(der)) + ". " : "") + "Fermez Orbite sur tous vos appareils, par exemple après avoir utilisé un ordinateur partagé.";
    etatPhoto();
  }
  $("form-identite").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = this.querySelector("button[type=submit]"); b.disabled = true;
    var appel = $("param-appel").value.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    E.compte.preferences({ orbite_appel: appel || null, orbite_metier: $("param-metier").value || null }).then(majUtilisateur).then(function () {
      E.toast(appel ? "Enchanté, " + appel + " !" : "Préférences enregistrées.");
    }).catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); }).finally(function () { b.disabled = false; });
  });

  /* ---------- Préférences : animations (cet appareil) et page d'ouverture (tous les appareils) ---------- */
  var choixMouvement = (function () { try { return localStorage.getItem("ef-mouvement") || ""; } catch (e) { return ""; } })();
  doc.querySelectorAll('#choix-mouvement input').forEach(function (r) { r.checked = r.value === choixMouvement; });
  $("choix-mouvement").addEventListener("change", function (e) {
    var v = e.target.value;
    try { if (v) localStorage.setItem("ef-mouvement", v); else localStorage.removeItem("ef-mouvement"); } catch (x) {}
    if (v === "reduit") doc.documentElement.setAttribute("data-mouvement", "reduit"); else doc.documentElement.removeAttribute("data-mouvement");
    E.toast(v === "reduit" ? "Animations réduites." : "Animations selon votre appareil.");
  });
  $("param-accueil").addEventListener("change", function () {
    var v = this.value;
    E.compte.preferences({ orbite_accueil: v }).then(majUtilisateur).then(function () { E.toast("Orbite s'ouvrira sur « " + $("param-accueil").selectedOptions[0].textContent + " »."); })
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); });
  });

  /* ---------- Utilisation ---------- */
  function rendreUtilisation() {
    var u = O.utilisateur();
    if (!u) return;
    $("u-membre").textContent = u.created_at ? DATE.format(new Date(u.created_at)) : "—";
    $("u-connexion").textContent = u.last_sign_in_at ? DATE_HEURE.format(new Date(u.last_sign_in_at)) : "—";
    var p = O.profil() || {}, points = 0;
    if (p.prenom) points++;
    if (p.montant > 0) points += 2;
    if (p.situation !== "celibataire" || p.chefDeFamille || p.enfants) points++;
    if (p.credits && p.credits.length) points++;
    if (p.contrats && p.contrats.length) points++;
    if (p.loyer || p.chargesFixes || p.epargneDisponible) points++;
    if (p.projets && p.projets.length) points++;
    var pc = Math.min(100, Math.round(points / 8 * 100));
    $("u-profil").textContent = pc + " %";
    $("u-profil-barre").style.setProperty("--p", pc + "%");
    var n = window.OrbiteSimulations ? window.OrbiteSimulations.liste().length : 0;
    $("u-simulations").textContent = n + " sur 200";
    $("u-simulations-barre").style.setProperty("--p", Math.min(100, n / 2) + "%");
    var a = window.OrbiteAbonnement && window.OrbiteAbonnement.acces(), r = window.AbonnementCalcul ? window.AbonnementCalcul.resume(a) : null;
    $("u-abonnement").textContent = r && r.libelle ? r.libelle : "—";
    var sy = O.synthese();
    $("u-conseils").textContent = sy && sy.conseils ? String(sy.conseils.length) : "—";
  }

  function demarrer() { remplir(); O.rafraichirAvatar(); }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });
})();
