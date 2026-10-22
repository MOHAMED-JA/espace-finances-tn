/*
 * Orbite — menu complet sur téléphone (15 oct. 2026, maquette validée).
 * Le bouton ☰ de la barre du haut et l'onglet « Menu » du bas ouvrent un panneau qui reprend la barre latérale
 * du grand écran : toutes les rubriques, groupées comme elle, et toutes leurs sous-rubriques (SousRubriques.items).
 * Un appui ouvre la page ou la partie et ferme le panneau ; la rubrique affichée est marquée « Vous êtes ici ».
 * 22 oct. 2026 (retour d'un utilisateur : sous-rubriques difficiles à trouver, affichage chargé) : liste dépliante.
 * Rubriques en lignes courtes groupées par blocs ; une rubrique à sous-rubriques se déplie (une seule à la fois,
 * celle où l'on est dépliée d'office) et montre ses sous-rubriques en liste verticale, la partie en cours repérée.
 * Le panneau est reconstruit à chaque ouverture : rubriques masquées (Administration) et parties disponibles à jour.
 */
(function () {
  "use strict";
  var doc = document, dlg = doc.getElementById("dlg-menu");
  if (!dlg || !dlg.showModal) return;
  var liste = doc.getElementById("menu-liste"), boutons = [doc.getElementById("menu-ouvrir"), doc.getElementById("onglet-menu")].filter(Boolean);

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function vueActive() { return doc.body.getAttribute("data-vue-active") || "orbite"; }

  var CHEVRON = '<svg class="menu-complet__chevron" aria-hidden="true"><use href="/orbite/icones.svg#chevron"/></svg>';
  /* Rubrique dépliée : une seule à la fois (liste dépliante, choix du 22 oct. 2026). */
  var ouverte = null;

  function construire() {
    var SR = window.SousRubriques, ici = vueActive(), h = "", bloc = "";
    ouverte = null;
    function fermerBloc() { if (bloc) h += '<div class="menu-complet__bloc">' + bloc + "</div>"; bloc = ""; }
    doc.querySelectorAll(".rail > .rail__titre, .rail > .rail__liens").forEach(function (n) {
      if (n.classList.contains("rail__titre")) { fermerBloc(); h += '<p class="menu-complet__groupe">' + esc(n.textContent.trim()) + "</p>"; return; }
      n.querySelectorAll(":scope > li").forEach(function (li) {
        if (li.hidden) return;
        var a = li.querySelector(":scope > a[data-vue]"); if (!a) return;
        var v = a.getAttribute("data-vue"), nom = (a.querySelector("span") || a).textContent.trim(), svg = a.querySelector("svg");
        var badge = li.querySelector(".rail__badge:not([hidden])"), mod = a.getAttribute("data-module");
        var sous = SR ? SR.items(v) : [], actif = SR && v === ici ? SR.active(v) : null, estIci = v === ici, tiroir = sous.length > 1;
        if (tiroir && estIci) ouverte = v;
        var tete = '<span class="menu-complet__ico">' + (svg ? svg.outerHTML : "") + "</span>" +
          '<span class="menu-complet__nom">' + esc(nom) + "</span>" +
          (badge && badge.textContent.trim() ? '<span class="menu-complet__badge">' + esc(badge.textContent.trim()) + "</span>" : "") +
          (estIci ? '<span class="menu-complet__ici">Vous êtes ici</span>' : "");
        bloc += '<section class="menu-complet__ru' + (estIci ? " menu-complet__ru--ici" : "") + '" data-ru="' + v + '"' + (mod ? ' data-module="' + mod + '"' : "") + ">";
        if (tiroir) {
          bloc += '<button type="button" class="menu-complet__lien" data-ru="' + v + '" aria-expanded="false" aria-controls="menu-sous-' + v + '">' + tete +
            '<span class="menu-complet__compte" aria-hidden="true">' + sous.length + "</span>" + CHEVRON + "</button>" +
            '<div class="menu-complet__tiroir" id="menu-sous-' + v + '"><ul class="menu-complet__sous" role="list" aria-label="Sous-rubriques de ' + esc(nom) + '">' + sous.map(function (it) {
              return '<li><a class="menu-complet__puce" href="' + esc(it.href) + '"' + (it.cle === actif ? ' aria-current="true"' : "") + ">" + esc(it.lib) + "</a></li>";
            }).join("") + "</ul></div>";
        } else {
          bloc += '<a class="menu-complet__lien" href="#' + v + '"' + (estIci ? ' aria-current="page"' : "") + ">" + tete + "</a>";
        }
        bloc += "</section>";
      });
      fermerBloc();
    });
    liste.innerHTML = h;
    deplier(ouverte, false);
    /* Invitation à installer Orbite (installer.js), en tête de liste tant qu'elle n'est pas installée. */
    var inst = window.OrbiteInstaller && window.OrbiteInstaller.carteMenu();
    if (inst) liste.insertBefore(inst, liste.firstChild);
  }

  /* Déplie la rubrique v (et replie les autres) ; v identique : elle se replie. */
  function deplier(v, basculer) {
    if (basculer && v === ouverte) v = null;
    ouverte = v;
    liste.querySelectorAll(".menu-complet__ru").forEach(function (ru) {
      var o = ru.getAttribute("data-ru") === v, b = ru.querySelector("button.menu-complet__lien");
      ru.classList.toggle("menu-complet__ru--ouverte", o && !!b);
      if (b) b.setAttribute("aria-expanded", o ? "true" : "false");
      var t = ru.querySelector(".menu-complet__tiroir");
      if (t) { if (o) t.removeAttribute("inert"); else t.setAttribute("inert", ""); }
    });
  }

  function etat(ouvert) { boutons.forEach(function (b) { b.setAttribute("aria-expanded", ouvert ? "true" : "false"); }); }
  function ouvrir() {
    if (dlg.open) return;
    construire();
    dlg.showModal(); etat(true);
    liste.scrollTop = 0;
    /* Rubrique en cours hors de l'écran : son titre vient en haut de la liste (positions mesurées dans la liste). */
    var ici = liste.querySelector(".menu-complet__ru--ici");
    if (ici) {
      var r = ici.getBoundingClientRect(), l = liste.getBoundingClientRect();
      if (r.bottom > l.bottom) liste.scrollTop = Math.max(0, r.top - l.top - 12);
    }
  }
  function fermer() { if (dlg.open) dlg.close(); }

  boutons.forEach(function (b) { b.addEventListener("click", ouvrir); });
  doc.getElementById("menu-fermer").addEventListener("click", fermer);
  dlg.addEventListener("close", function () { etat(false); });
  /* Appui hors du panneau (sur le voile) : fermeture. */
  dlg.addEventListener("click", function (e) { if (e.target === dlg) fermer(); });
  /* Une rubrique à sous-rubriques se déplie ; un lien suivi ferme le panneau, l'adresse change et la page s'ouvre. */
  liste.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var b = e.target.closest("button.menu-complet__lien");
    if (b) {
      deplier(b.getAttribute("data-ru"), true);
      var ru = b.closest(".menu-complet__ru");
      /* Rubrique ouverte en bas de l'écran : on la fait remonter pour voir ses sous-rubriques. */
      if (ouverte && ru) setTimeout(function () { var r = ru.getBoundingClientRect(), l = liste.getBoundingClientRect(); if (r.bottom > l.bottom - 8) liste.scrollBy({ top: Math.min(r.bottom - l.bottom + 16, r.top - l.top - 8), behavior: "smooth" }); }, 360);
      return;
    }
    if (e.target.closest("a[href]")) fermer();
  });
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
