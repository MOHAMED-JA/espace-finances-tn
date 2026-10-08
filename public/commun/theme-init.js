/* Applique le thème avant l'affichage (évite le flash) : choix mémorisé, sinon celui de l'appareil.
   L'attribut data-theme est toujours posé, et suit l'appareil tant qu'aucun choix n'est mémorisé. */
(function () {
  var racine = document.documentElement;
  function memorise() { try { var t = localStorage.getItem("ef-theme"); return t === "dark" || t === "light" ? t : null; } catch (e) { return null; } }
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function appliquer() { racine.setAttribute("data-theme", memorise() || (mq && mq.matches ? "dark" : "light")); }
  appliquer();
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (!memorise()) appliquer(); });
  window.EFTheme = { appliquer: appliquer };
})();
