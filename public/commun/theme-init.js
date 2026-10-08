/* Applique le thème mémorisé avant l'affichage (évite le flash de thème). */
(function () {
  try {
    var t = localStorage.getItem("ef-theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* stockage indisponible : thème du système */ }
})();
