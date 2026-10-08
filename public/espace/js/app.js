/*
 * Orbite — cœur de l'application : navigation, profil partagé, enregistrement, outils d'interface.
 * Expose window.Orbite, utilisé par les vues et les modules.
 * Le profil est conservé dans les métadonnées du compte (Supabase Auth, visibles par l'utilisateur seul).
 */
(function () {
  "use strict";
  var E = window.Espace, M = window.EFModele, OC = window.OrbiteCalcul;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  var mouvementReduit = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

  /* ---------- Formats ---------- */
  function nbsp(s) { return String(s).replace(/[  ]/g, " "); }
  var formats = {};
  function fmt(d, min) {
    var k = d + ":" + (min === undefined ? d : min);
    return formats[k] || (formats[k] = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min === undefined ? d : min, maximumFractionDigits: d }));
  }
  var F = {
    dt3: function (v) { return nbsp(fmt(3).format(Math.round(v * 1000) / 1000)); },
    dt0: function (v) { return nbsp(fmt(0).format(Math.round(v))); },
    dt: function (v) { return Math.abs(v) >= 1000 ? F.dt0(v) : F.dt3(v); },
    pct: function (v, d) { return nbsp(fmt(d === undefined ? 1 : d, 0).format(v * 100)) + " %"; },
    saisie: function (v) { return v ? nbsp(fmt(3, 0).format(v)) : ""; },
    lire: function (texte) {
      var t = String(texte == null ? "" : texte).replace(/[\s  ]/g, "").replace(",", ".");
      if (t === "") return { vide: true, valide: true, valeur: 0 };
      var n = Number(t);
      if (!isFinite(n) || n < 0 || n > 1e9) return { vide: false, valide: false, valeur: 0 };
      return { vide: false, valide: true, valeur: n };
    }
  };

  /* ---------- Bascules à pastille glissante (hors module Salaire, qui gère les siennes) ---------- */
  function placerPastille(groupe, animer) {
    var coche = groupe.querySelector("input:checked"), pastille = groupe.querySelector(".bascule__pastille");
    if (!coche || !pastille || !groupe.offsetParent) return;
    var lab = coche.closest("label");
    var sans = !animer || mouvementReduit.matches;
    if (sans) groupe.classList.add("sans-anim");
    pastille.style.setProperty("--x", (lab.offsetLeft - 4) + "px");
    pastille.style.setProperty("--l", lab.offsetWidth + "px");
    if (sans) requestAnimationFrame(function () { groupe.classList.remove("sans-anim"); });
  }
  function placerPastilles(racine) {
    (racine || doc).querySelectorAll(".bascule").forEach(function (g) { placerPastille(g, false); });
  }
  doc.addEventListener("change", function (e) {
    var g = e.target.closest && e.target.closest(".bascule");
    if (g && !g.closest("#vue-salaire")) placerPastille(g, true);
  });
  window.addEventListener("resize", function () { placerPastilles(); });

  /* ---------- Chiffres animés ---------- */
  var tweens = new WeakMap();
  function animerNombre(el, valeur, format, options) {
    var o = options || {};
    var avant = tweens.has(el) ? tweens.get(el).valeur : null;
    tweens.set(el, { valeur: valeur });
    if (avant === null || mouvementReduit.matches || o.instantane || Math.abs(avant - valeur) < 1e-9) { el.textContent = format(valeur); return; }
    var debut = performance.now(), duree = o.duree || 460, id = {};
    tweens.get(el).id = id;
    (function pas(t) {
      if (tweens.get(el).id !== id) return;
      var p = Math.min(1, (t - debut) / duree);
      var e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = format(avant + (valeur - avant) * e);
      if (p < 1) requestAnimationFrame(pas);
    })(debut);
    if (o.ecart && Math.abs(valeur - avant) > 0.0005) montrerEcart(o.ecart, valeur - avant, o.formatEcart || format);
  }
  function montrerEcart(el, d, format) {
    el.textContent = (d > 0 ? "+" : "−") + format(Math.abs(d));
    el.className = "ecart " + (d > 0 ? "ecart--hausse" : "ecart--baisse");
    void el.offsetWidth;
    el.classList.add("visible");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("visible"); }, 2200);
  }

  /* ---------- Puce qui vole jusqu'à sa destination ---------- */
  function puceVolante(depuis, vers, texte, couleur) {
    if (mouvementReduit.matches || !depuis || !vers || !depuis.animate) return;
    var a = depuis.getBoundingClientRect(), b = vers.getBoundingClientRect();
    if (!b.width) return;
    var p = doc.createElement("span");
    p.className = "puce puce-volante puce--" + (couleur || "credit");
    p.textContent = texte;
    doc.body.appendChild(p);
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    var w = p.offsetWidth / 2, h = p.offsetHeight / 2, haut = Math.min(y0, y1) - 80;
    p.animate([
      { transform: "translate(" + (x0 - w) + "px," + (y0 - h) + "px) scale(.9)", opacity: 0 },
      { transform: "translate(" + ((x0 + x1) / 2 - w) + "px," + (haut - h) + "px) scale(1)", opacity: 1, offset: .5 },
      { transform: "translate(" + (x1 - w) + "px," + (y1 - h) + "px) scale(.6)", opacity: 0 }
    ], { duration: 640, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = function () { p.remove(); };
  }

  /* ---------- Profil partagé ---------- */
  var utilisateur = null, profil = null, choix = { epargne: "equilibree" }, synthese = null, abonnes = [];
  var etatEnr = $("etat-enregistrement"), minuterieProfil = null, profilVierge = true;

  function metaProfil(u) { var m = (u && u.user_metadata) || {}; return m.orbite && typeof m.orbite === "object" ? m.orbite : null; }
  function recalculer() {
    try { synthese = OC.synthese(profil, choix); } catch (e) { synthese = null; if (window.console) console.error(e); }
    abonnes.forEach(function (fn) { try { fn(synthese, profil); } catch (e) { if (window.console) console.error(e); } });
  }
  function surProfil(fn) { abonnes.push(fn); if (profil) fn(synthese, profil); }

  /* Enregistre le profil (avec un court délai pour regrouper les frappes). */
  function majProfil(partiel, options) {
    var o = options || {};
    profil = OC.normaliser(Object.assign({}, profil, partiel));
    profilVierge = false;
    recalculer();
    clearTimeout(minuterieProfil);
    etatEnr.textContent = "Modifications…";
    etatEnr.className = "barre__etat";
    minuterieProfil = setTimeout(sauverProfil, o.immediat ? 0 : 900);
  }
  function sauverProfil() {
    etatEnr.textContent = "Enregistrement…";
    E.client.auth.updateUser({ data: { orbite: Object.assign({ v: 1 }, profil) } }).then(function (r) {
      if (r.error) throw r.error;
      etatEnr.textContent = "Profil enregistré";
      etatEnr.className = "barre__etat barre__etat--ok";
      setTimeout(function () { if (etatEnr.textContent === "Profil enregistré") etatEnr.textContent = ""; }, 2400);
    }).catch(function (err) {
      etatEnr.textContent = "Non enregistré";
      etatEnr.className = "barre__etat barre__etat--erreur";
      E.toast(M.messageErreur(err), { erreur: true });
    });
  }
  function choisir(cle, valeur) { choix[cle] = valeur; recalculer(); }

  /* ---------- Modules et enregistrement des simulations ---------- */
  var MODULES = {
    salaire: { outil: "salaire", objet: function () { return window.ModuleSalaire; }, nom: "Salaire", couleur: "salaire" },
    epargne: { outil: "assurance_vie", objet: function () { return window.ModuleEpargne; }, nom: "Épargne", couleur: "epargne" },
    credit: { outil: "credit", objet: function () { return window.ModuleCredit; }, nom: "Crédit", couleur: "credit" }
  };
  var OUTIL_VERS_VUE = { salaire: "salaire", assurance_vie: "epargne", credit: "credit" };
  var simulationOuverte = {}; /* vue → { id, nom } */
  var modulesInities = {};

  function moduleCourant() { var r = lireRoute(); return MODULES[r.vue] ? r.vue : null; }
  function modifie(vue) {
    var s = simulationOuverte[vue];
    if (s && moduleCourant() === vue) $("enregistrer-lib").textContent = "Mettre à jour";
  }

  function apercuResume(res) {
    var box = $("enr-apercu");
    box.textContent = "";
    if (!res || !res.principal) return;
    var l = doc.createElement("span"); l.textContent = res.principal.libelle;
    var v = doc.createElement("strong"); v.className = "chiffre"; v.textContent = M.formaterIndicateur(res.principal);
    var s = doc.createElement("small"); s.textContent = res.ligne || "";
    box.appendChild(l); box.appendChild(v); box.appendChild(s);
  }

  function enregistrer() {
    var vue = moduleCourant(); if (!vue) return;
    var mod = MODULES[vue], obj = mod.objet(); if (!obj) return;
    var etat = obj.etat(), resume = obj.resume();
    var ouverte = simulationOuverte[vue];
    if (ouverte) {
      E.simulations.mettreAJour(ouverte.id, etat, resume).then(function () {
        E.toast("« " + ouverte.nom + " » mise à jour.");
        $("enregistrer-lib").textContent = "Enregistré";
        window.OrbiteSimulations && window.OrbiteSimulations.recharger();
      }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
      return;
    }
    var dlg = $("dlg-enregistrer"), champ = $("enr-nom");
    apercuResume(resume);
    champ.value = obj.nomParDefaut();
    dlg.returnValue = "";
    dlg.showModal();
    champ.select();
    dlg.addEventListener("close", function fin() {
      dlg.removeEventListener("close", fin);
      $("enregistrer").focus();
      if (dlg.returnValue !== "ok") return;
      var nom = M.nomValide(champ.value) || obj.nomParDefaut();
      E.simulations.creer(mod.outil, nom, etat, resume).then(function (s) {
        simulationOuverte[vue] = { id: s.id, nom: s.nom };
        $("enregistrer-lib").textContent = "Enregistré";
        E.toast("« " + s.nom + " » enregistrée dans vos simulations.");
        puceVolante($("enregistrer"), doc.querySelector('.rail a[data-vue="simulations"]') || doc.querySelector('.onglets-bas a[data-vue="profil"]'), "+1", mod.couleur);
        window.OrbiteSimulations && window.OrbiteSimulations.recharger();
      }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
    });
  }
  $("enregistrer").addEventListener("click", enregistrer);
  $("reprendre-profil").addEventListener("click", function () {
    var vue = moduleCourant(), obj = vue && MODULES[vue].objet();
    if (obj && obj.depuisProfil) { obj.depuisProfil(profil); simulationOuverte[vue] = null; $("enregistrer-lib").textContent = "Enregistrer"; E.toast("Valeurs de votre profil reprises."); }
  });

  /* Ouvre une simulation enregistrée dans son module. */
  function ouvrirSimulation(s) {
    var vue = OUTIL_VERS_VUE[s.outil]; if (!vue) return;
    var etat = s.parametres && s.parametres.etat;
    location.hash = "#" + vue;
    var essais = 0;
    (function charger() {
      var obj = MODULES[vue].objet();
      if (!obj || !modulesInities[vue]) { if (essais++ < 40) return setTimeout(charger, 50); return; }
      if (obj.charger(etat || "")) { simulationOuverte[vue] = { id: s.id, nom: s.nom }; $("enregistrer-lib").textContent = "Mettre à jour"; E.toast("« " + s.nom + " » ouverte."); }
      else E.toast("Cette simulation n'a pas pu être relue.", { erreur: true });
    })();
  }

  /* ---------- Navigation ---------- */
  var VUES = ["orbite", "profil", "salaire", "epargne", "credit", "simulations", "compte"];
  var TITRES = { orbite: "Mon orbite", profil: "Mon profil", salaire: "Salaire", epargne: "Épargne vie & CEA", credit: "Crédit", simulations: "Simulations", compte: "Compte" };
  function lireRoute() {
    var h = location.hash.replace(/^#/, ""), i = h.indexOf("?");
    var vue = (i === -1 ? h : h.slice(0, i)) || "orbite";
    if (VUES.indexOf(vue) === -1) vue = "orbite";
    return { vue: vue, params: new URLSearchParams(i === -1 ? "" : h.slice(i + 1)) };
  }
  var vueAffichee = null;
  function afficher(focus) {
    var r = lireRoute();
    var changer = function () {
      doc.querySelectorAll("section.vue").forEach(function (s) { s.hidden = s.getAttribute("data-vue") !== r.vue; });
      if (r.vue !== vueAffichee) {
        var entree = doc.querySelector('section.vue[data-vue="' + r.vue + '"]');
        if (entree) { entree.classList.add("vue--entree"); setTimeout(function () { entree.classList.remove("vue--entree"); }, 900); }
      }
      doc.querySelectorAll("a[data-vue]").forEach(function (a) {
        var vues = (a.getAttribute("data-vues") || a.getAttribute("data-vue")).split(" ");
        if (vues.indexOf(r.vue) !== -1) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      doc.title = TITRES[r.vue] + " — Orbite";
      $("barre-titre").textContent = TITRES[r.vue];
      var mod = MODULES[r.vue];
      $("barre-actions").hidden = !mod;
      if (mod) {
        $("enregistrer-lib").textContent = simulationOuverte[r.vue] ? "Mettre à jour" : "Enregistrer";
        var obj = mod.objet();
        if (obj && profil && !modulesInities[r.vue]) { modulesInities[r.vue] = true; if (obj.depuisProfil) obj.depuisProfil(profil); }
        if (obj && obj.afficher) obj.afficher();
      }
      doc.dispatchEvent(new CustomEvent("orbite:vue", { detail: { vue: r.vue, params: r.params } }));
      requestAnimationFrame(function () { placerPastilles($("vue-" + r.vue)); });
      if (focus) {
        window.scrollTo(0, 0);
        var h1 = doc.querySelector('section.vue[data-vue="' + r.vue + '"] h1');
        if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
      }
      vueAffichee = r.vue;
    };
    if (vueAffichee && vueAffichee !== r.vue && doc.startViewTransition && !mouvementReduit.matches) {
      doc.documentElement.setAttribute("data-transition", VUES.indexOf(r.vue) >= VUES.indexOf(vueAffichee) ? "avant" : "arriere");
      doc.startViewTransition(changer);
    } else changer();
  }
  window.addEventListener("hashchange", function () { afficher(true); });


  /* ---------- Thème ---------- */
  function majTheme() {
    var sombre = E.themeEffectif() === "dark";
    var b = $("bascule-theme");
    b.querySelector("use").setAttribute("href", "/orbite/icones.svg#" + (sombre ? "soleil" : "lune"));
    b.setAttribute("aria-label", sombre ? "Passer au thème clair" : "Passer au thème sombre");
    doc.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute("content", sombre ? "#07090F" : "#F3F4F8"); });
    var r = doc.querySelector('#choix-theme input[value="' + (E.themeActuel() || "") + '"]');
    if (r) { r.checked = true; placerPastille($("choix-theme"), false); }
    doc.dispatchEvent(new CustomEvent("orbite:theme"));
  }
  function changerTheme(t) {
    var appliquer = function () { E.appliquerTheme(t); majTheme(); };
    if (doc.startViewTransition && !mouvementReduit.matches) doc.startViewTransition(appliquer); else appliquer();
  }
  $("bascule-theme").addEventListener("click", function () { changerTheme(E.themeEffectif() === "dark" ? "light" : "dark"); });
  $("choix-theme").addEventListener("change", function (e) { changerTheme(e.target.value || null); });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", majTheme);
  $("deconnexion").addEventListener("click", function () { E.deconnexion(); });

  /* ---------- Identité ---------- */
  function nomAffiche() {
    var meta = (utilisateur && utilisateur.user_metadata) || {};
    return (profil && profil.prenom) || meta.full_name || meta.name || (utilisateur && utilisateur.email ? utilisateur.email.split("@")[0] : "");
  }
  function remplirUtilisateur() {
    if (!utilisateur) return;
    var nom = nomAffiche();
    $("nom-utilisateur").textContent = (utilisateur.user_metadata && utilisateur.user_metadata.full_name) || nom;
    $("email-utilisateur").textContent = utilisateur.email || "";
    $("avatar").textContent = E.initiales((utilisateur.user_metadata && utilisateur.user_metadata.full_name) || nom, utilisateur.email);
    var heure = new Date().getHours();
    $("salutation").textContent = (heure >= 18 || heure < 5 ? "Bonsoir" : "Bonjour") + (nom ? ", " + nom.split(" ")[0] : "");
  }

  /* ---------- API publique ---------- */
  window.Orbite = {
    F: F,
    $: $,
    toast: function (t, o) { return E.toast(t, o); },
    mouvementReduit: mouvementReduit,
    animerNombre: animerNombre,
    puceVolante: puceVolante,
    placerPastilles: placerPastilles,
    profil: function () { return profil; },
    synthese: function () { return synthese; },
    choix: function () { return choix; },
    choisir: choisir,
    majProfil: majProfil,
    surProfil: surProfil,
    profilVierge: function () { return profilVierge; },
    utilisateur: function () { return utilisateur; },
    modifie: modifie,
    ouvrirSimulation: ouvrirSimulation,
    lireRoute: lireRoute,
    remplirUtilisateur: remplirUtilisateur,
    enregistrerModule: function (vue) { if (lireRoute().vue === vue) afficher(false); }
  };

  /* ---------- Démarrage ---------- */
  majTheme();
  E.exigerConnexion().then(function (u) {
    utilisateur = u;
    var p = metaProfil(u);
    profilVierge = !p;
    profil = OC.normaliser(p || {});
    recalculer();
    remplirUtilisateur();
    doc.body.classList.remove("attente");
    afficher(false);
    window.Orbite.pret = true;
    doc.dispatchEvent(new CustomEvent("orbite:pret"));
  });
})();
