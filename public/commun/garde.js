/*
 * Garde d'accès, chargée en tête des pages réservées aux membres.
 * Vérification immédiate et synchrone : sans session enregistrée, on part
 * tout de suite vers la page de connexion (sans afficher la page).
 * La validité réelle du jeton est ensuite contrôlée par session.js.
 * Rappel : les données, elles, sont protégées côté serveur par les règles RLS.
 */
(function () {
  "use strict";
  var cle = (window.EF_CONFIG && window.EF_CONFIG.cleSession) || "ef-session";
  var present = false;
  try { present = !!localStorage.getItem(cle); } catch (e) { present = false; }
  if (!present) {
    var suite = location.pathname + location.search + location.hash;
    location.replace("/connexion.html?suite=" + encodeURIComponent(suite));
    return;
  }

  /* Simulation ouverte depuis l'espace (?espace=<id>) : mémorisée, puis retirée de l'adresse
     avant que l'outil ne lise ses propres paramètres. */
  try {
    var q = new URLSearchParams(location.search);
    var id = q.get("espace");
    if (id !== null) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) window.EF_SIMULATION_OUVERTE = id.toLowerCase();
      q.delete("espace");
      var reste = q.toString();
      history.replaceState(history.state, "", location.pathname + (reste ? "?" + reste : "") + location.hash);
    }
  } catch (e) { /* adresse non modifiable : sans effet */ }
})();
