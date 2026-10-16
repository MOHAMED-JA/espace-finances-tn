/*
 * Orbite — double authentification dans Paramètres › Sécurité (16 oct. 2026, maquette validée).
 * Activer (code QR + clé + premier code), ajouter un appareil de secours, désactiver.
 * Supabase MFA (TOTP) ; commun/mfa.js pour la vérification ; migration 0016 pour l'exigence côté serveur.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, MFA = window.EFMfa, doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var bloc = $("bloc-2fa"), dlg = $("dlg-2fa");
  if (!bloc || !dlg || !MFA || !E) return;
  var client = E.client, enCours = null; /* facteur créé, pas encore vérifié */

  function erreur(texte) {
    var el = $("code-activer-2fa-erreur"), input = $("code-activer-2fa");
    el.textContent = texte || ""; el.hidden = !texte;
    input.setAttribute("aria-invalid", texte ? "true" : "false");
  }
  /* Le code QR arrive en SVG brut dans une adresse « data: » : un « # » (couleur) la couperait ; on l'encode. */
  function qrSur(src) {
    var m = /^data:image\/svg\+xml;utf-8,([\s\S]*)$/.exec(String(src || ""));
    return m ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m[1]) : src;
  }
  function occupe(b, oui) { b.disabled = oui; b.setAttribute("aria-busy", oui ? "true" : "false"); }

  /* État affiché : activée ou non, nombre d'appareils. */
  function rendre() {
    return client.auth.mfa.listFactors().then(function (r) {
      var liste = (r.data && r.data.totp) || [], actif = liste.length > 0;
      var etat = $("etat-2fa");
      etat.textContent = actif ? "Activée" : "Désactivée";
      etat.setAttribute("data-actif", actif ? "oui" : "non");
      $("activer-2fa").hidden = actif;
      $("secours-2fa").hidden = !actif;
      $("desactiver-2fa").hidden = !actif;
      var ap = $("appareils-2fa");
      ap.hidden = !actif;
      ap.textContent = actif ? (liste.length === 1 ? "1 appareil enregistré. Ajoutez un appareil de secours si vous le pouvez." : liste.length + " appareils enregistrés (dont un de secours).") : "";
      return liste;
    }).catch(function () { return []; });
  }

  /* Facteurs créés mais jamais vérifiés (fenêtre fermée en route) : on les retire. */
  function nettoyer() {
    return client.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      var restes = ((u && u.factors) || []).filter(function (f) { return f.status !== "verified"; });
      return Promise.all(restes.map(function (f) { return client.auth.mfa.unenroll({ factorId: f.id }).catch(function () {}); }));
    }).catch(function () {});
  }

  function ouvrir(secours) {
    var b = secours ? $("secours-2fa") : $("activer-2fa");
    if (E.horsLigne && E.horsLigne()) { O.toast("Connectez-vous à Internet pour activer la double authentification."); return; }
    occupe(b, true);
    nettoyer().then(function () {
      return client.auth.mfa.enroll({ factorType: "totp", friendlyName: (secours ? "Secours " : "Téléphone ") + new Date().toISOString().slice(0, 16), issuer: "Orbite" });
    }).then(function (r) {
      if (r.error) throw r.error;
      enCours = r.data.id;
      $("dlg-2fa-titre").textContent = secours ? "Ajouter un appareil de secours" : "Activer la double authentification";
      $("dlg-2fa-sous").textContent = secours ? "Sur le second appareil, ouvrez l'application d'authentification et scannez ce nouveau code." : "2 minutes, une seule fois. Il vous faut une application d'authentification gratuite sur votre téléphone.";
      $("qr-2fa").src = qrSur(r.data.totp.qr_code);
      $("cle-2fa").textContent = String(r.data.totp.secret || "").replace(/(.{4})/g, "$1 ").trim();
      $("code-activer-2fa").value = "";
      $("valider-2fa").textContent = secours ? "Ajouter" : "Activer";
      erreur("");
      dlg.showModal();
      $("code-activer-2fa").focus();
    }).catch(function (err) { O.toast(MFA.messageErreur(err)); })
      .finally(function () { occupe(b, false); });
  }

  function valider() {
    var code = $("code-activer-2fa").value.replace(/\s/g, ""), b = $("valider-2fa");
    if (!MFA.codeValide(code)) { erreur("Tapez les 6 chiffres affichés dans votre application."); $("code-activer-2fa").focus(); return; }
    if (!enCours || b.disabled) return;
    occupe(b, true);
    client.auth.mfa.challengeAndVerify({ factorId: enCours, code: code }).then(function (r) {
      if (r.error) throw r.error;
      var secours = $("valider-2fa").textContent === "Ajouter";
      enCours = null;
      dlg.close();
      return rendre().then(function () {
        O.toast(secours ? "Appareil de secours ajouté." : "Double authentification activée : le code sera demandé sur chaque nouvel appareil, puis plus sur celui-ci.");
      });
    }).catch(function (err) { erreur(MFA.messageErreur(err)); $("code-activer-2fa").select(); })
      .finally(function () { occupe(b, false); });
  }

  function annuler() {
    var id = enCours; enCours = null;
    if (dlg.open) dlg.close();
    if (id) client.auth.mfa.unenroll({ factorId: id }).catch(function () {});
  }

  /* Confirmation dans une vraie fenêtre (jamais confirm()). */
  function confirmerDesactivation() {
    var d = $("dlg-2fa-off");
    d.returnValue = "";
    return new Promise(function (fin) {
      d.addEventListener("close", function () { fin(d.returnValue === "ok"); }, { once: true });
      d.showModal();
    });
  }
  function desactiver() {
    confirmerDesactivation().then(function (oui) { if (oui) retirerTout(); });
  }
  function retirerTout() {
    var b = $("desactiver-2fa");
    occupe(b, true);
    client.auth.mfa.listFactors().then(function (r) {
      var liste = (r.data && r.data.all) || [];
      return liste.reduce(function (p, f) {
        return p.then(function () { return client.auth.mfa.unenroll({ factorId: f.id }).then(function (x) { if (x.error) throw x.error; }); });
      }, Promise.resolve());
    }).then(function () { return client.auth.refreshSession().catch(function () {}); })
      .then(rendre)
      .then(function () { O.toast("Double authentification désactivée."); })
      .catch(function (err) { O.toast(MFA.messageErreur(err)); })
      .finally(function () { occupe(b, false); });
  }

  $("activer-2fa").addEventListener("click", function () { ouvrir(false); });
  $("secours-2fa").addEventListener("click", function () { ouvrir(true); });
  $("desactiver-2fa").addEventListener("click", desactiver);
  $("valider-2fa").addEventListener("click", valider);
  $("annuler-2fa").addEventListener("click", annuler);
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); annuler(); });
  $("code-activer-2fa").addEventListener("input", function () {
    if (this.getAttribute("aria-invalid") === "true") erreur("");
    if (this.value.replace(/\s/g, "").length === 6 && MFA.codeValide(this.value)) valider();
  });
  $("code-activer-2fa").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); valider(); } });

  if (O.pret) rendre(); else doc.addEventListener("orbite:pret", rendre, { once: true });
  window.OrbiteSecurite = { rendre: rendre };
})();
