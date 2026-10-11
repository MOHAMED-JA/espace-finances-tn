/*
 * Orbite — acceptation obligatoire de la politique de confidentialité et des CGV (choix validés le 11 oct. 2026) :
 * une fois par version, enregistrée sur le compte (table consentements : date posée par le serveur, sans modification
 * possible). Cochée à l'inscription (Google ou e-mail) : enregistrée automatiquement à l'arrivée dans l'application.
 * Sinon (comptes existants, connexion Google depuis « Se connecter », nouvelle version) : écran bloquant.
 * Partie pure (decider, accordLocal) testée sous Node ; l'écran utilise le <dialog id="dlg-consentement"> de l'Espace.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.EFConsentement = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  /* Version = date de la politique de confidentialité en vigueur (la changer redemande l'acceptation à tous, une fois). */
  var VERSION = "2026-10-11";
  var CLE_LOCALE = "ef-consentement";
  var VALIDITE_LOCALE = 24 * 3600 * 1000;  /* case cochée sur cet appareil : valable un jour (retour de Google, confirmation) */

  /* Accord coché sur cet appareil avant une inscription : { version, t } encore valable ? */
  function accordLocal(brut, maintenant) {
    try {
      var o = typeof brut === "string" ? JSON.parse(brut) : brut;
      return !!(o && o.version === VERSION && typeof o.t === "number" && maintenant - o.t >= 0 && maintenant - o.t < VALIDITE_LOCALE);
    } catch (e) { return false; }
  }
  /* « ok » : déjà accepté ; « auto » : coché à l'inscription, à enregistrer sans écran ; « ecran » : à demander.
     derniere = version la plus récente enregistrée (ou null), meta = user_metadata.orbite_consentement, local = accordLocal(). */
  function decider(derniere, meta, local) {
    if (derniere === VERSION) return "ok";
    if (meta === VERSION || local) return "auto";
    return "ecran";
  }
  /* Écran : « nouveau » (jamais accepté) ou « mise-a-jour » (une ancienne version a été acceptée). */
  function motif(derniere) { return derniere && derniere !== VERSION ? "mise-a-jour" : "nouveau"; }

  /* ---------- Navigateur ---------- */
  function memoriserLocal() { try { localStorage.setItem(CLE_LOCALE, JSON.stringify({ version: VERSION, t: Date.now() })); } catch (e) {} }
  function lireLocal() { try { return accordLocal(localStorage.getItem(CLE_LOCALE), Date.now()); } catch (e) { return false; } }
  function oublierLocal() { try { localStorage.removeItem(CLE_LOCALE); } catch (e) {} }

  /* Affiche l'écran bloquant et attend l'acceptation (la promesse ne se résout qu'une fois l'acceptation enregistrée). */
  function demander(doc, raison, enregistrer, deconnecter) {
    var dlg = doc.getElementById("dlg-consentement");
    if (!dlg || typeof dlg.showModal !== "function") { location.replace("/espace/"); return new Promise(function () {}); }
    var cas = doc.getElementById("consentement-case"), ok = doc.getElementById("consentement-accepter"),
      sortie = doc.getElementById("consentement-sortie"), err = doc.getElementById("consentement-erreur");
    doc.querySelectorAll("[data-consentement-motif]").forEach(function (el) { el.hidden = el.getAttribute("data-consentement-motif") !== raison; });
    cas.checked = false; ok.disabled = true; err.hidden = true;
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); });  /* Échap : impossible de fermer */
    cas.addEventListener("change", function () { ok.disabled = !cas.checked; err.hidden = true; });
    sortie.addEventListener("click", function () { deconnecter(); });
    dlg.showModal();
    return new Promise(function (resolu) {
      ok.addEventListener("click", function () {
        if (!cas.checked) return;
        ok.disabled = true; ok.setAttribute("aria-busy", "true");
        enregistrer().then(function (ligne) { dlg.close(); resolu(ligne); }, function () {
          err.hidden = false; ok.disabled = false; ok.removeAttribute("aria-busy");
        });
      });
    });
  }

  /* Garantit l'acceptation de la version en vigueur avant d'ouvrir l'application.
     api = { dernier(): Promise<{version, accepte_le}|null>, accepter(version): Promise<ligne>, deconnecter(), horsLigne() } */
  function garantir(u, api, doc) {
    return api.dernier().then(function (d) {
      var derniere = d && d.version, meta = (u && u.user_metadata || {}).orbite_consentement;
      var choix = decider(derniere, meta, lireLocal());
      if (choix === "ok") return d;
      if (choix === "auto") return api.accepter(VERSION).then(function (l) { oublierLocal(); return l; }, function () {
        return demander(doc, motif(derniere), function () { return api.accepter(VERSION); }, api.deconnecter);
      });
      return demander(doc, motif(derniere), function () { return api.accepter(VERSION).then(function (l) { oublierLocal(); return l; }); }, api.deconnecter);
    }, function (e) {
      /* Hors connexion : impossible de vérifier ; l'application s'ouvre et la vérification reprend au prochain chargement. */
      if (api.horsLigne(e)) return null;
      /* Autre erreur de lecture : l'écran s'affiche (jamais de page vide) ; « Accepter » réessaie l'enregistrement. */
      return demander(doc, "nouveau", function () { return api.accepter(VERSION).then(function (l) { oublierLocal(); return l; }); }, api.deconnecter);
    });
  }

  return { VERSION: VERSION, CLE_LOCALE: CLE_LOCALE, accordLocal: accordLocal, decider: decider, motif: motif,
    memoriserLocal: memoriserLocal, garantir: garantir };
});
