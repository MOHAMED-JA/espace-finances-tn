/*
 * Cloudflare Turnstile : vérification anti-robots des formulaires de connexion, d'inscription et de mot de passe oublié.
 * Mode « Managed » (choisi dans le tableau de bord Cloudflare) : le cadre se valide seul ; une case n'apparaît qu'en cas de doute.
 * Le jeton obtenu est transmis à Supabase (captchaToken), qui le vérifie côté serveur avec la clé secrète.
 * Sans clé de site dans config.js, rien n'est chargé et jeton() renvoie null (comportement inchangé).
 */
(function (racine) {
  "use strict";
  var SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  function creer(cle, conteneur, doc) {
    var jetonCourant = null, attentes = [], widget = null, erreur = null;
    function servir() { while (attentes.length) attentes.shift()(jetonCourant); }
    function rendre() {
      widget = racine.turnstile.render(conteneur, {
        sitekey: cle, language: "fr", theme: doc.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "auto",
        callback: function (t) { jetonCourant = t; erreur = null; servir(); },
        "expired-callback": function () { jetonCourant = null; },
        "error-callback": function () { erreur = "La vérification anti-robots n'a pas pu se faire. Rechargez la page puis réessayez."; servir(); }
      });
    }
    /* typeof : un élément d'id « turnstile » créerait une variable globale du même nom. */
    if (racine.turnstile && typeof racine.turnstile.render === "function") rendre();
    else {
      var s = doc.createElement("script");
      s.src = SCRIPT; s.async = true; s.defer = true;
      s.onload = rendre;
      s.onerror = function () { erreur = "La vérification anti-robots est bloquée (connexion ou extension du navigateur). Rechargez la page."; servir(); };
      doc.head.appendChild(s);
    }
    conteneur.hidden = false;
    return {
      /* Jeton à usage unique ; attend la fin de la vérification (au plus 20 s). */
      jeton: function () {
        if (jetonCourant) return Promise.resolve(jetonCourant);
        if (erreur) return Promise.reject(new Error(erreur));
        return new Promise(function (ok, ko) {
          var t = setTimeout(function () { ko(new Error("La vérification anti-robots prend trop de temps. Rechargez la page puis réessayez.")); }, 20000);
          attentes.push(function (v) { clearTimeout(t); if (v) ok(v); else ko(new Error(erreur || "Vérification anti-robots échouée.")); });
        });
      },
      /* Après chaque envoi : nouveau jeton (Supabase n'accepte chaque jeton qu'une fois). */
      renouveler: function () { jetonCourant = null; if (widget !== null && racine.turnstile && typeof racine.turnstile.reset === "function") racine.turnstile.reset(widget); }
    };
  }

  var API = {
    preparer: function (cle, conteneur, doc) {
      if (!cle || !conteneur) return { jeton: function () { return Promise.resolve(null); }, renouveler: function () {} };
      return creer(cle, conteneur, doc || racine.document);
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.EFTurnstile = API;
})(typeof self !== "undefined" ? self : this);
