/*
 * Configuration publique de l'Espace Finances TN.
 * La clé « publishable » est faite pour être exposée dans le navigateur :
 * elle ne donne accès qu'à ce que les règles RLS autorisent (rien sans connexion).
 * Aucune clé secrète ne doit jamais figurer dans ce dépôt.
 */
(function (racine) {
  "use strict";
  var CONFIG = Object.freeze({
    supabaseUrl: "https://txrwgqgnqdkipwtwpevl.supabase.co",
    supabaseCle: "sb_publishable_mKAmNg3uuxbcD3cvn7UwJg_s0o3AXlI",
    cleSession: "ef-session",
    /* Cloudflare Turnstile (anti-robots) : clé de SITE, publique par nature. Vide = vérification désactivée.
       La clé SECRÈTE correspondante ne va que dans Supabase (Authentication → Bot and Abuse Protection). */
    turnstileCle: "0x4AAAAAAFSsJoQNyLaiL5tt",
    nomApplication: "Espace Finances TN"
  });
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else racine.EF_CONFIG = CONFIG;
})(typeof self !== "undefined" ? self : this);
