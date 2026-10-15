/*
 * Orbite — menu complet sur téléphone (15 oct. 2026, maquette validée).
 * Le bouton ☰ de la barre du haut et l'onglet « Menu » du bas ouvrent un panneau qui reprend la barre latérale
 * du grand écran : toutes les rubriques, groupées comme elle, et toutes leurs sous-rubriques (SousRubriques.items).
 * Un appui ouvre la page ou la partie et ferme le panneau ; la rubrique affichée est marquée « Vous êtes ici ».
 * Le panneau est reconstruit à chaque ouverture : rubriques masquées (Administration) et parties disponibles à jour.
 */
(function () {
  "use strict";
  var doc = document, dlg = doc.getElementById("dlg-menu");
  if (!dlg || !dlg.showModal) return;
  var liste = doc.getElementById("menu-liste"), boutons = [doc.getElementById("menu-ouvrir"), doc.getElementById("onglet-menu")].filter(Boolean);

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function vueActive() { return doc.body.getAttribute("data-vue-active") || "orbite"; }

  function construire() {
    var SR = window.SousRubriques, ici = vueActive(), h = "";
    doc.querySelectorAll(".rail > .rail__titre, .rail > .rail__liens").forEach(function (n) {
      if (n.classList.contains("rail__titre")) { h += '<p class="menu-complet__groupe">' + esc(n.textContent.trim()) + "</p>"; return; }
      n.querySelectorAll(":scope > li").forEach(function (li) {
        if (li.hidden) return;
        var a = li.querySelector(":scope > a[data-vue]"); if (!a) return;
        var v = a.getAttribute("data-vue"), nom = (a.querySelector("span") || a).textContent.trim(), svg = a.querySelector("svg");
        var badge = li.querySelector(".rail__badge:not([hidden])"), mod = a.getAttribute("data-module");
        var sous = SR ? SR.items(v) : [], actif = SR && v === ici ? SR.active(v) : null, estIci = v === ici;
        h += '<section class="menu-complet__ru' + (estIci ? " menu-complet__ru--ici" : "") + '"' + (mod ? ' data-module="' + mod + '"' : "") + ">" +
          '<a class="menu-complet__lien" href="#' + v + '"' + (estIci ? ' aria-current="page"' : "") + ">" +
          '<span class="menu-complet__ico">' + (svg ? svg.outerHTML : "") + "</span>" +
          '<span class="menu-complet__nom">' + esc(nom) + "</span>" +
          (badge && badge.textContent.trim() ? '<span class="menu-complet__badge">' + esc(badge.textContent.trim()) + "</span>" : "") +
          (estIci ? '<span class="menu-complet__ici">Vous êtes ici</span>' : "") + "</a>";
        if (sous.length > 1) h += '<ul class="menu-complet__sous" role="list" aria-label="Sous-rubriques de ' + esc(nom) + '">' + sous.map(function (it) {
          return '<li><a class="menu-complet__puce" href="' + esc(it.href) + '"' + (it.cle === actif ? ' aria-current="true"' : "") + ">" + esc(it.lib) + "</a></li>";
        }).join("") + "</ul>";
        h += "</section>";
      });
    });
    liste.innerHTML = h;
    /* Invitation à installer Orbite (installer.js), en tête de liste tant qu'elle n'est pas installée. */
    var inst = window.OrbiteInstaller && window.OrbiteInstaller.carteMenu();
    if (inst) liste.insertBefore(inst, liste.firstChild);
  }

  function etat(ouvert) { boutons.forEach(function (b) { b.setAttribute("aria-expanded", ouvert ? "true" : "false"); }); }
  function ouvrir() {
    if (dlg.open) return;
    construire();
    dlg.showModal(); etat(true);
    liste.scrollTop = 0;
    var ici = liste.querySelector(".menu-complet__ru--ici");
    if (ici && ici.offsetTop + ici.offsetHeight > liste.clientHeight) liste.scrollTop = ici.offsetTop - 12;
  }
  function fermer() { if (dlg.open) dlg.close(); }

  boutons.forEach(function (b) { b.addEventListener("click", ouvrir); });
  doc.getElementById("menu-fermer").addEventListener("click", fermer);
  dlg.addEventListener("close", function () { etat(false); });
  /* Appui hors du panneau (sur le voile) : fermeture. */
  dlg.addEventListener("click", function (e) { if (e.target === dlg) fermer(); });
  /* Un lien suivi ferme le panneau ; l'adresse change et la page s'ouvre. */
  liste.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a[href]")) fermer(); });
  doc.getElementById("menu-recherche").addEventListener("click", function () {
    fermer();
    var p = doc.getElementById("palette-ouvrir"); if (p) p.click();
  });
  /* L'onglet « Menu » du bas reste allumé dans les rubriques qui ne sont pas dans la barre du bas. */
  doc.addEventListener("orbite:vue", function (e) {
    var b = doc.getElementById("onglet-menu"); if (!b) return;
    var dans = (b.getAttribute("data-vues") || "").split(" ").indexOf(e.detail.vue) !== -1;
    if (dans) b.setAttribute("data-actif", ""); else b.removeAttribute("data-actif");
  });

  window.OrbiteMenu = { ouvrir: ouvrir, fermer: fermer };
})();
