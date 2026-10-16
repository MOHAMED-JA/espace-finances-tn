/* Applique le thème avant l'affichage (évite le flash) : choix mémorisé, sinon celui de l'appareil.
   L'attribut data-theme est toujours posé, et suit l'appareil tant qu'aucun choix n'est mémorisé.
   Choix « heure » : clair le jour, sombre après le coucher du soleil à Tunis (vérifié chaque minute). */
(function () {
  var racine = document.documentElement;
  function memorise() { try { var t = localStorage.getItem("ef-theme"); return t === "dark" || t === "light" || t === "heure" ? t : null; } catch (e) { return null; } }
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  /* Lever et coucher du soleil à Tunis (formules de la NOAA), en minutes depuis minuit, heure de Tunis (UTC+1, sans heure d'été). */
  function soleil(d) {
    d = d || new Date();
    var rad = Math.PI / 180, lat = 36.8065, lon = 10.1815;
    var n = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
    var g = 2 * Math.PI / 365 * (n - 1);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var de = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(de)) - Math.tan(lat * rad) * Math.tan(de)) / rad;
    return { lever: 720 - 4 * (lon + ha) - eqt + 60, coucher: 720 - 4 * (lon - ha) - eqt + 60 };
  }
  function nuitATunis(d) {
    d = d || new Date();
    var s = soleil(d), m = (d.getUTCHours() * 60 + d.getUTCMinutes() + 60) % 1440;
    return m < s.lever || m >= s.coucher;
  }
  function effectif() {
    var t = memorise();
    if (t === "heure") return nuitATunis() ? "dark" : "light";
    return t || (mq && mq.matches ? "dark" : "light");
  }
  function appliquer() { racine.setAttribute("data-theme", effectif()); }
  appliquer();
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (!memorise()) appliquer(); });
  setInterval(function () {
    if (memorise() !== "heure") return;
    var avant = racine.getAttribute("data-theme");
    appliquer();
    if (racine.getAttribute("data-theme") !== avant) document.dispatchEvent(new CustomEvent("ef:theme"));
  }, 60000);
  /* Animations réduites choisies dans les paramètres (en plus du réglage de l'appareil). */
  try { if (localStorage.getItem("ef-mouvement") === "reduit") racine.setAttribute("data-mouvement", "reduit"); } catch (e) {}
  /* Haute lisibilité (Lot 2) : retenue sur le compte, recopiée sur l'appareil pour s'appliquer avant l'affichage. */
  try { if (localStorage.getItem("ef-lisible") === "oui") { racine.setAttribute("data-lisible", "oui"); racine.setAttribute("data-mouvement", "reduit"); } } catch (e) {}
  /* Apparence personnelle (accent, densité, taille du texte) : retenue sur le compte, recopiée sur l'appareil
     (« ef-apparence ») pour s'appliquer avant l'affichage ; seulement dans l'espace (accueil et pages publiques inchangés). */
  var APPARENCE = { accent: ["sidi", "olivier", "djerba", "bougain"], densite: ["compacte"], taille: ["grande", "tres-grande"] };
  function normaliserApparence(v) {
    var o = v && typeof v === "object" ? v : {}, r = {};
    Object.keys(APPARENCE).forEach(function (k) { r[k] = APPARENCE[k].indexOf(o[k]) >= 0 ? o[k] : ""; });
    return r;
  }
  function poserApparence(v) {
    var a = normaliserApparence(v);
    Object.keys(a).forEach(function (k) { if (a[k]) racine.setAttribute("data-" + k, a[k]); else racine.removeAttribute("data-" + k); });
    return a;
  }
  try { if (/^\/espace\//.test(location.pathname)) poserApparence(JSON.parse(localStorage.getItem("ef-apparence") || "null")); } catch (e) {}
  /* Application Android (Google Play) : ouverte avec ?source=play ou depuis l'application (referrer android-app://).
     Retenu pour l'onglet seulement (sessionStorage) : Chrome partage le localStorage avec l'application. */
  var play = false;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("source") === "play" || /^android-app:\/\/tn\.orbite\.app/.test(document.referrer || "")) sessionStorage.setItem("ef-play", "oui");
    play = sessionStorage.getItem("ef-play") === "oui";
    if (q.has("source") && q.get("source") === "play" && history.replaceState) {
      q.delete("source");
      var reste = q.toString();
      history.replaceState(history.state, "", location.pathname + (reste ? "?" + reste : "") + location.hash);
    }
  } catch (e) {}
  if (play) racine.setAttribute("data-play", "oui");
  window.EFTheme = { play: play, appliquer: appliquer, effectif: effectif, soleil: soleil, nuitATunis: nuitATunis, APPARENCE: APPARENCE, normaliserApparence: normaliserApparence, poserApparence: poserApparence };
  if (typeof module !== "undefined" && module.exports) module.exports = window.EFTheme;
})();
