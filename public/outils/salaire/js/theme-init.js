/* Thème mémorisé, appliqué avant l'affichage pour éviter un flash */
try {
  var t = localStorage.getItem("calc-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
