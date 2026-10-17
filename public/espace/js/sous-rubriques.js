/*
 * Orbite — sous-rubriques (13 oct. 2026) : les pages longues sont découpées en parties affichées une à la fois.
 * - Grand écran : la rubrique active de la barre latérale se déplie et liste ses sous-rubriques (curseur qui glisse).
 * - Téléphone et tablette : pastilles en haut de la page (collantes sous la barre du haut).
 * - Pages qui ont déjà des onglets (Crédit, Vie & impôts, Ma progression, Mon mois, Paramètres) : la barre latérale
 *   reprend leurs onglets et reste synchronisée avec eux (le Crédit découpe en plus « Simuler » en trois parties).
 * Adresse : #salaire?partie=offres (#credit?espace=projet, #vie?onglet=fiscal pour les onglets existants).
 * Une partie masquée porte data-sr-masque (display: none). Tout élément d'une partie masquée qu'on fait défiler
 * (scrollIntoView) ou qu'on focalise révèle d'abord sa partie : liens internes, visite guidée, palette, « Ajouter »…
 */
(function () {
  "use strict";
  var doc = document, O = window.Orbite;
  if (!O) return;
  var reduit = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* Parties de chaque page : cle, libellé, éléments (sélecteurs dans la page) ; espace = onglet du Crédit à ouvrir. */
  var CONFIG = {
    orbite: { parties: [
      { cle: "apercu", lib: "Vue d'ensemble", cibles: ["#orbite-contenu", ".budget", "#foyer", "#orbite-expert"] },
      { cle: "patrimoine", lib: "Patrimoine", cibles: ["#patrimoine"] },
      { cle: "sante", lib: "Santé financière", cibles: ["#sante", "#solde-orbite"] },
      { cle: "conseils", lib: "Conseils", cibles: ["[aria-labelledby='titre-conseils']"] },
      { cle: "capacite", lib: "Capacité d'emprunt", cibles: ["[aria-labelledby='titre-capacite']"] },
      { cle: "epargne", lib: "Épargne et projets", cibles: ["[aria-labelledby='titre-suggestions']", "[aria-labelledby='titre-projets']"] }
    ], depuis: function (pr) { return pr.get("section") === "marge" ? "capacite" : null; } },
    profil: { ouvrir: true, parties: [
      { cle: "identite", lib: "Vous", cibles: ["#sec-identite"] },
      { cle: "salaire", lib: "Emploi et salaire", cibles: ["#sec-salaire"] },
      { cle: "foyer", lib: "Foyer et budget", cibles: ["#sec-foyer", "#sec-budget"] },
      { cle: "credits", lib: "Crédits et épargne", cibles: ["#sec-credits", "#sec-contrats"] },
      { cle: "projets", lib: "Projets et banque", cibles: ["#sec-projets", "#sec-banque"] }
    ], depuis: function (pr) { var s = pr.get("section"); return s ? partieDe("profil", doc.getElementById("sec-" + s)) : null; } },
    salaire: { parties: [
      { cle: "calcul", lib: "Calcul du net", cibles: ["#pension-vue", ".scene-salaire"] },
      { cle: "hausse", lib: "Augmentation", cibles: ["#section-hausse"] },
      { cle: "repartition", lib: "Où va votre brut", cibles: ["#section-cent", "#section-employeur"] },
      { cle: "offres", lib: "Deux offres", cibles: ["#section-offres"] },
      { cle: "detail", lib: "Calcul détaillé", cibles: ["#section-detail", "#section-courbe", ".methode"] }
    ] },
    epargne: { parties: [
      { cle: "simulation", lib: "Simulation", cibles: [".ep-scene"] },
      { cle: "projection", lib: "Projection", cibles: [".ep-sections"] },
      { cle: "expert", lib: "Mode expert", cibles: [".ep-expert"] }
    ] },
    credit: { espaces: "#credit-espaces", parties: [
      { cle: "simuler", lib: "Simuler", espace: "simuler", cibles: [".cr-grille"] },
      { cle: "echeancier", lib: "Échéancier", espace: "simuler", cibles: [".cr-temps", ".cr-graphes", ".cr-tableau-panneau"] },
      { cle: "outils", lib: "Outils avancés", espace: "simuler", cibles: [".cr-outils"] },
      { cle: "projet", lib: "Projet immobilier", espace: "projet" },
      { cle: "offres", lib: "Comparer mes offres", espace: "offres" },
      { cle: "banques", lib: "Comparer les banques", espace: "banques" },
      { cle: "regrouper", lib: "Regrouper mes crédits", espace: "regrouper" },
      { cle: "tmm", lib: "Le TMM", espace: "tmm" }
    ], depuis: function (pr) { var e = pr.get("espace"); return e && e !== "simuler" ? e : null; } },
    vie: { onglets: ".vie-onglets" },
    progression: { onglets: ".pg-onglets" },
    mois: { onglets: ".mo-onglets" },
    placements: { onglets: ".pa-onglets" },
    compte: { onglets: ".param-nav" }
  };
  var actives = {}, vueCourante = null, applique = false;

  function vueEl(v) { return doc.getElementById("vue-" + v); }
  function elements(v, p) {
    var racine = vueEl(v), out = [];
    (p.cibles || []).forEach(function (s) { racine.querySelectorAll(s).forEach(function (e) { if (out.indexOf(e) === -1) out.push(e); }); });
    return out;
  }
  /* Masqué par l'application elle-même (hidden), pas par une sous-rubrique. */
  /* (On s'arrête à la page : une page non affichée garde ses parties disponibles, pour le menu complet.) */
  function cacheParAppli(e) { for (var x = e; x && x !== doc.body && !(x.matches && x.matches("section.vue")); x = x.parentElement) if (x.hidden) return true; return false; }
  function disponible(v, p) {
    if (p.espace && !(p.cibles && p.cibles.length)) return true;
    return elements(v, p).some(function (e) { return !cacheParAppli(e); });
  }
  function partieDe(v, el) {
    var c = CONFIG[v]; if (!c || !c.parties || !el) return null;
    for (var i = 0; i < c.parties.length; i++) if (elements(v, c.parties[i]).some(function (e) { return e === el || e.contains(el); })) return c.parties[i].cle;
    return null;
  }

  /* ---------- Onglets existants (Vie & impôts, Ma progression, Mon mois, Paramètres) ---------- */
  function ongletsDe(v) {
    var t = vueEl(v).querySelector(CONFIG[v].onglets); if (!t) return [];
    return Array.prototype.map.call(t.querySelectorAll('[role="tab"]'), function (b) {
      return { cle: b.getAttribute("data-onglet"), lib: b.textContent.replace(/\s+/g, " ").trim(), bouton: b };
    }).filter(function (o) { return o.cle; });
  }
  function ongletActif(v) { var o = ongletsDe(v).filter(function (x) { return x.bouton.getAttribute("aria-selected") === "true"; })[0]; return o ? o.cle : null; }

  /* ---------- Rendu : barre latérale et pastilles ---------- */
  function items(v) {
    var c = CONFIG[v];
    if (c.onglets) return ongletsDe(v).filter(function (o) { return !o.bouton.hidden; }).map(function (o) { return { cle: o.cle, lib: o.lib, href: "#" + v + "?onglet=" + o.cle }; });
    return c.parties.filter(function (p) { return disponible(v, p); }).map(function (p) {
      return { cle: p.cle, lib: p.lib, href: "#" + v + (p.espace && !(p.cibles && p.cibles.length) ? "?espace=" + p.espace : "?partie=" + p.cle) };
    });
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function lienHtml(it, cls) { return '<a class="' + cls + '" href="' + it.href + '" data-sr="' + it.cle + '">' + esc(it.lib) + "</a>"; }

  function construire() {
    Object.keys(CONFIG).forEach(function (v) {
      var racine = vueEl(v); if (!racine) return;
      /* Barre latérale : sous la rubrique. */
      var lien = doc.querySelector('.rail__liens a[data-vue="' + v + '"]');
      if (lien && !lien.parentElement.querySelector(".rail__sous")) {
        var bloc = doc.createElement("div");
        bloc.className = "rail__sous"; bloc.setAttribute("data-sr-vue", v);
        bloc.innerHTML = '<ul role="list" aria-label="Sous-rubriques"><i class="rail__sous-curseur" aria-hidden="true"></i></ul>';
        lien.parentElement.appendChild(bloc);
      }
      /* Pastilles : pages découpées par Orbite (les onglets existants ont déjà leur barre). */
      if (CONFIG[v].parties && !racine.querySelector(".sr-nav")) {
        var nav = doc.createElement("nav");
        nav.className = "sr-nav"; nav.setAttribute("aria-label", "Sous-rubriques"); nav.setAttribute("data-sr-vue", v); nav.hidden = true;
        nav.innerHTML = '<div class="sr-nav__piste"><i class="sr-nav__pastille" aria-hidden="true"></i></div>';
        nav.firstChild.addEventListener("scroll", function () { bords(this); }, { passive: true });
        var tete = racine.querySelector(":scope > .vue__tete");
        if (tete) tete.insertAdjacentElement("afterend", nav); else racine.insertBefore(nav, racine.firstChild);
      }
    });
  }

  function majNav(v) {
    var liste = items(v), cle = actives[v], seule = liste.length < 2;
    var bloc = doc.querySelector('.rail__sous[data-sr-vue="' + v + '"]');
    if (bloc) {
      var ul = bloc.querySelector("ul"), cur = ul.querySelector(".rail__sous-curseur");
      var sig = liste.map(function (i) { return i.cle + ":" + i.lib; }).join("|");
      if (ul.getAttribute("data-sig") !== sig) {
        ul.querySelectorAll("li").forEach(function (li) { li.remove(); });
        liste.forEach(function (it) { var li = doc.createElement("li"); li.innerHTML = lienHtml(it, "rail__sous-lien"); ul.appendChild(li); });
        ul.setAttribute("data-sig", sig);
      }
      bloc.classList.toggle("rail__sous--vide", seule);
      var actif = null;
      ul.querySelectorAll("a[data-sr]").forEach(function (a) { var on = a.getAttribute("data-sr") === cle; if (on) { a.setAttribute("aria-current", "true"); actif = a; } else a.removeAttribute("aria-current"); });
      if (actif) { cur.style.setProperty("--y", actif.parentElement.offsetTop + "px"); cur.style.setProperty("--h", actif.parentElement.offsetHeight + "px"); cur.style.opacity = "1"; } else cur.style.opacity = "0";
    }
    var nav = vueEl(v) && vueEl(v).querySelector('.sr-nav[data-sr-vue="' + v + '"]');
    if (nav) {
      /* Crédit : les pastilles découpent « Simuler » seulement (les autres espaces ont leurs onglets). */
      var pl = CONFIG[v].espaces ? liste.filter(function (i) { var p = partie(v, i.cle); return p && p.espace === "simuler"; }) : liste;
      var simulerActif = !CONFIG[v].espaces || (partie(v, cle) || {}).espace === "simuler";
      nav.hidden = pl.length < 2 || !simulerActif;
      var piste = nav.querySelector(".sr-nav__piste"), sig2 = pl.map(function (i) { return i.cle + ":" + i.lib; }).join("|");
      if (piste.getAttribute("data-sig") !== sig2) {
        piste.querySelectorAll("a").forEach(function (a) { a.remove(); });
        pl.forEach(function (it) { piste.insertAdjacentHTML("beforeend", lienHtml(it, "sr-nav__lien")); });
        piste.setAttribute("data-sig", sig2);
      }
      var on = null;
      piste.querySelectorAll("a[data-sr]").forEach(function (a) { var x = a.getAttribute("data-sr") === cle; if (x) { a.setAttribute("aria-current", "true"); on = a; } else a.removeAttribute("aria-current"); });
      var pa = piste.querySelector(".sr-nav__pastille");
      if (on && !nav.hidden) {
        pa.style.setProperty("--x", on.offsetLeft + "px"); pa.style.setProperty("--l", on.offsetWidth + "px"); pa.style.opacity = "1";
        /* La pastille active reste visible dans la piste (sans faire défiler la page). */
        var g = on.offsetLeft - piste.clientWidth / 2 + on.offsetWidth / 2;
        piste.scrollTo({ left: Math.max(0, g), behavior: reduit.matches ? "auto" : "smooth" });
      } else pa.style.opacity = "0";
      bords(piste);
    }
  }
  /* Fondu sur le bord quand des pastilles dépassent (on devine qu'il y en a d'autres). */
  function bords(piste) {
    var max = piste.scrollWidth - piste.clientWidth;
    piste.classList.toggle("sr-nav__piste--g", piste.scrollLeft > 4);
    piste.classList.toggle("sr-nav__piste--d", piste.scrollLeft < max - 4);
  }
  function partie(v, cle) { var c = CONFIG[v]; return c.parties ? c.parties.filter(function (p) { return p.cle === cle; })[0] || null : null; }

  /* ---------- Afficher une partie ---------- */
  function appliquer(v, cle, anime) {
    var c = CONFIG[v]; if (!c || !vueEl(v)) return;
    if (c.onglets) {
      var o = ongletsDe(v).filter(function (x) { return x.cle === cle; })[0];
      if (o && o.bouton.getAttribute("aria-selected") !== "true") o.bouton.click();
      actives[v] = ongletActif(v) || cle; majNav(v); return;
    }
    var dispo = c.parties.filter(function (p) { return disponible(v, p); });
    var p = partie(v, cle);
    if (!p || dispo.indexOf(p) === -1) p = dispo[0] || c.parties[0];
    var avant = actives[v];
    actives[v] = p.cle;
    /* Crédit : ouvrir l'onglet (espace) de la partie. */
    if (c.espaces && p.espace) {
      var t = doc.querySelector(c.espaces + ' [data-espace="' + p.espace + '"]');
      if (t && t.getAttribute("aria-selected") !== "true") { applique = true; t.click(); applique = false; }
    }
    var toutes = dispo.length < 2, montres = [];
    applique = true;
    c.parties.forEach(function (q) {
      if (!(q.cibles && q.cibles.length)) return;
      var montrer = toutes || q === p || (p.espace && q.espace !== p.espace);
      elements(v, q).forEach(function (e) {
        var etait = e.hasAttribute("data-sr-masque");
        if (montrer) { if (etait) { e.removeAttribute("data-sr-masque"); montres.push(e); } }
        else if (!etait) e.setAttribute("data-sr-masque", "");
      });
    });
    applique = false;
    if (c.ouvrir && !toutes) elements(v, p).forEach(function (e) { if (e.tagName === "DETAILS") e.open = true; });
    /* Entrée douce de la partie affichée (pas au premier affichage de la page : le fondu de page s'en charge). */
    if (anime && avant && avant !== p.cle && !reduit.matches) montres.forEach(function (e, i) {
      e.classList.remove("sr-entree"); void e.offsetWidth; e.style.setProperty("--sr-i", String(i)); e.classList.add("sr-entree");
      setTimeout(function () { e.classList.remove("sr-entree"); }, 700);
    });
    majNav(v);
    if (window.Orbite.placerPastilles) requestAnimationFrame(function () { window.Orbite.placerPastilles(vueEl(v)); });
    if (avant !== p.cle) { window.dispatchEvent(new Event("resize")); doc.dispatchEvent(new CustomEvent("orbite:partie", { detail: { vue: v, partie: p.cle } })); }
  }

  /* Révéler la partie d'un élément (lien interne, défilement, focus, visite guidée). */
  function reveler(el) {
    if (!el || !el.closest) return false;
    var m = el.closest("[data-sr-masque]"); if (!m) return false;
    var vue = m.closest("section.vue"), v = vue && vue.getAttribute("data-vue"), cle = partieDe(v, el);
    if (!cle) return false;
    appliquer(v, cle, false);
    try { history.replaceState(null, "", "#" + v + "?partie=" + cle); } catch (e) {}
    return true;
  }
  var defiler = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () { reveler(this); return defiler.apply(this, arguments); };
  [window.HTMLElement, window.SVGElement].forEach(function (C) {
    if (!C || !C.prototype.focus) return;
    var focaliser = C.prototype.focus;
    C.prototype.focus = function () { reveler(this); return focaliser.apply(this, arguments); };
  });

  /* ---------- Navigation ---------- */
  doc.addEventListener("orbite:vue", function (e) {
    var v = e.detail.vue, c = CONFIG[v];
    doc.querySelectorAll(".rail__sous").forEach(function (b) { b.parentElement.classList.toggle("sr-ouvert", b.getAttribute("data-sr-vue") === v); });
    if (!c) { vueCourante = v; return; }
    var pr = e.detail.params, cle = c.onglets ? (pr.get("onglet") || ongletActif(v)) : (pr.get("partie") || (c.depuis && c.depuis(pr)) || null);
    /* Adresse sans partie (lien de la rubrique, simulation ouverte…) : la page reprend à sa première partie. */
    if (!cle && !c.onglets) cle = c.parties[0].cle;
    var memeVue = vueCourante === v;
    vueCourante = v;
    /* Après les modules (rendu, onglets) : ils réagissent au même événement. */
    requestAnimationFrame(function () { appliquer(v, cle, memeVue); });
  });
  /* Onglets cliqués directement (barre d'onglets de la page) : la barre latérale suit. */
  function suivreOnglet(e) {
    var t = e.target.closest && e.target.closest('[role="tab"]');
    if (!t || applique) return;
    var vue = t.closest("section.vue"), v = vue && vue.getAttribute("data-vue"), c = CONFIG[v];
    if (!c || v !== vueCourante) return;
    setTimeout(function () {
      if (c.onglets) { actives[v] = ongletActif(v); majNav(v); }
      else if (c.espaces) {
        var esp = espaceActif(v), p = c.parties.filter(function (q) { return q.espace === esp; })[0];
        if (p && (partie(v, actives[v]) || {}).espace !== esp) appliquer(v, p.cle, true);
      }
    }, 0);
  }
  doc.addEventListener("click", suivreOnglet);
  /* Flèches du clavier dans une barre d'onglets. */
  doc.addEventListener("keyup", suivreOnglet);
  /* Remise à jour sans navigation : on suit l'onglet que la page a pu choisir elle-même (jamais l'inverse). */
  function espaceActif(v) { var t = doc.querySelector(CONFIG[v].espaces + ' [data-espace][aria-selected="true"]'); return t ? t.getAttribute("data-espace") : null; }
  function reappliquer() {
    var v = vueCourante, c = CONFIG[v];
    if (!c || !actives[v]) return;
    if (c.onglets) { actives[v] = ongletActif(v) || actives[v]; majNav(v); return; }
    var cle = actives[v];
    if (c.espaces) {
      var e = espaceActif(v), p = partie(v, cle);
      if (e && p && p.espace !== e) { var q = c.parties.filter(function (x) { return x.espace === e; })[0]; if (q) cle = q.cle; }
    }
    appliquer(v, cle, false);
  }
  /* Contenu rendu après coup (modules) : on remasque ce qui doit l'être. */
  var attente = null;
  var obs = new MutationObserver(function () {
    if (applique || attente) return;
    attente = requestAnimationFrame(function () { attente = null; reappliquer(); });
  });
  Object.keys(CONFIG).forEach(function (v) { var r = vueEl(v); if (r && CONFIG[v].parties) obs.observe(r, { childList: true, subtree: true }); });
  /* Profil modifié (retraité, mode Expert…) : parties disponibles recalculées. */
  O.surProfil(function () { requestAnimationFrame(reappliquer); });
  window.addEventListener("resize", function () { if (vueCourante && CONFIG[vueCourante]) majNav(vueCourante); });
  /* Hauteur de la barre du haut : les pastilles collent juste en dessous. */
  function hauteurBarre() { var b = doc.querySelector(".barre"); if (b) doc.documentElement.style.setProperty("--barre-h", b.offsetHeight + "px"); }
  window.addEventListener("resize", hauteurBarre);

  construire(); hauteurBarre();
  window.SousRubriques = { CONFIG: CONFIG, reveler: reveler, appliquer: appliquer, active: function (v) { return actives[v] || null; }, partieDe: partieDe, items: function (v) { return CONFIG[v] && vueEl(v) ? items(v) : []; } };
})();
