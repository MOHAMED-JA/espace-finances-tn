/*
 * Orbite — présentation vidéo de l'accueil (14 oct. 2026, emplacement validé : bande sous le haut de page).
 * 30 s muettes en boucle quand la bande est visible ; jamais d'elle-même si l'utilisateur préfère moins d'animations
 * ou économise ses données (l'affiche reste). Boutons : son, pause (WCAG 2.2.2), « Voir la vidéo · 1 min » en grand.
 */
(function () {
  "use strict";
  var doc = document, v = doc.getElementById("film-video");
  if (!v) return;
  var son = doc.getElementById("film-son"), pause = doc.getElementById("film-pause"), complet = doc.getElementById("film-complet");
  var dlg = doc.getElementById("film-dlg"), v2 = doc.getElementById("film-video-complete"), fermer = doc.getElementById("film-fermer");
  var reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var eco = !!(navigator.connection && navigator.connection.saveData);
  var arretVoulu = reduit || eco, visible = false;

  function etat() {
    pause.setAttribute("aria-pressed", arretVoulu ? "true" : "false");
    pause.setAttribute("aria-label", arretVoulu ? "Lire la vidéo" : "Mettre la vidéo en pause");
    son.setAttribute("aria-pressed", v.muted ? "false" : "true");
    son.setAttribute("aria-label", v.muted ? "Activer le son" : "Couper le son");
  }
  function jouer() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function suivre() {
    if (visible && !arretVoulu && !doc.hidden && !(dlg && dlg.open)) jouer();
    else if (!v.paused) v.pause();
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; suivre(); }, { threshold: 0.35 }).observe(v);
  } else { visible = true; suivre(); }
  doc.addEventListener("visibilitychange", suivre);

  son.addEventListener("click", function () {
    v.muted = !v.muted;
    if (!v.muted) { arretVoulu = false; jouer(); }
    etat();
  });
  pause.addEventListener("click", function () {
    arretVoulu = !arretVoulu;
    if (!arretVoulu) visible = true;
    suivre(); etat();
  });
  complet.addEventListener("click", function () {
    if (!dlg || !dlg.showModal) { window.location.href = "/medias/orbite-v3-60s.mp4"; return; }
    v.pause();
    /* L'affiche de la version longue n'est chargée qu'à l'ouverture (82 Ko économisés à l'arrivée). */
    if (!v2.poster && v2.dataset.poster) v2.poster = v2.dataset.poster;
    dlg.showModal();
    v2.currentTime = 0;
    var p = v2.play(); if (p && p.catch) p.catch(function () {});
  });
  if (fermer) fermer.addEventListener("click", function () { dlg.close(); });
  if (dlg) {
    dlg.addEventListener("close", function () { v2.pause(); suivre(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }
  etat();
  window.OrbiteFilm = { etat: function () { return { joue: !v.paused, muet: v.muted, arret: arretVoulu }; } };
})();
