/* Orbite — page d'accueil : aperçu vivant (moteurs réels), état connecté, effets du héros. */
(function () {
  "use strict";
  var OC = window.OrbiteCalcul, P = window.PARAMETRES_PAIE;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  var reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fin = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Lien « Ouvrir mon orbite » si une session est enregistrée (vérifiée ensuite par l'application). */
  var connecte = false;
  try { connecte = !!localStorage.getItem(window.EF_CONFIG.cleSession); } catch (e) {}
  doc.querySelectorAll(connecte ? "[data-si-deconnecte]" : "[data-si-connecte]").forEach(function (el) { el.hidden = true; });
  doc.querySelectorAll(connecte ? "[data-si-connecte]" : "[data-si-deconnecte]").forEach(function (el) { el.hidden = false; });
  if (P) doc.querySelectorAll("[data-annee]").forEach(function (el) { el.textContent = String(P.annee); });

  var bandeau = $("bandeau");
  if (bandeau && /[?&]compte-supprime=1/.test(location.search)) {
    bandeau.textContent = "Votre compte, votre profil et toutes vos simulations ont été supprimés définitivement.";
    bandeau.hidden = false;
    try { history.replaceState(null, "", "/"); } catch (e) {}
  }

  /* ---------- Aperçu ---------- */
  var form = $("apercu");
  function nbsp(s) { return s.replace(/[  ]/g, " "); }
  var f3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  var f0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  function lire(t) { var n = Number(String(t).replace(/[\s  ]/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? Math.min(n, 1e6) : null; }

  var valeurs = {};
  function tween(el, v, fmt) {
    var avant = valeurs[el.id];
    valeurs[el.id] = v;
    if (avant === undefined || reduit) { el.textContent = fmt(v); return; }
    var t0 = performance.now();
    (function pas(t) {
      if (valeurs[el.id] !== v) return;
      var p = Math.min(1, (t - t0) / 420), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(avant + (v - avant) * e);
      if (p < 1) requestAnimationFrame(pas);
    })(t0);
  }

  /* Planète salaire en 3D : le cœur est le net, les anneaux les cotisations et l'impôt. */
  var planete = window.OrbitePlanete && $("planete") ? window.OrbitePlanete.creer($("planete"), { reduit: reduit }) : null;

  function calculer(anime) {
    var brut = lire($("brut").value);
    $("brut").setAttribute("aria-invalid", brut === null ? "true" : "false");
    if (brut === null || !OC) return;
    var secteur = form.querySelector("input[name=secteur]:checked").value;
    var sy = OC.synthese({ montant: brut, sens: "brut", periode: "mensuel", secteur: secteur, chefDeFamille: $("chef").checked, enfants: $("chef").checked ? 2 : 0, anneeNaissance: new Date().getFullYear() - 35 });
    var immo = sy.capacite.net.credits[0];
    var opt = sy.epargne.propositions[sy.epargne.propositions.length - 1];
    var poser = anime ? tween : function (el, v, fmt) { valeurs[el.id] = v; el.textContent = fmt(v); };
    poser($("net"), sy.salaire.netMensuel, function (v) { return nbsp(f3.format(v)) + "\u00a0DT"; });
    poser($("credit"), immo.capital, function (v) { return nbsp(f0.format(v)) + "\u00a0DT"; });
    poser($("epargne"), opt ? opt.economieAnnuelle : 0, function (v) { return nbsp(f0.format(v)) + "\u00a0DT / an"; });
    $("tranche").textContent = Math.round(sy.salaire.tranche.taux * 100) + " %";
    var cot = sy.salaire.cotisations / 12, imp = sy.salaire.impotMois;
    $("p-cnss").textContent = nbsp(f0.format(cot)) + "\u00a0DT";
    $("p-impot").textContent = nbsp(f0.format(imp)) + "\u00a0DT";
    if (planete) planete.maj({ brut: sy.salaire.brutMensuel, net: sy.salaire.netMensuel, cnss: cot, impot: imp });
    $("lib-caisse").textContent = secteur === "public" ? "CNRPS" : "CNSS";
  }
  if (form) {
    var frappe = null;
    $("brut").addEventListener("input", function () { clearTimeout(frappe); frappe = setTimeout(function () { calculer(false); }, 80); });
    $("brut").addEventListener("blur", function () { var v = lire(this.value); if (v) this.value = nbsp(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(v)); });
    form.addEventListener("change", function () { placer(); calculer(true); });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    calculer(false);
  }

  /* Pastille des bascules */
  function placer() {
    doc.querySelectorAll(".bascule").forEach(function (g) {
      var c = g.querySelector("input:checked"), p = g.querySelector(".bascule__pastille");
      if (!c || !p) return;
      var l = c.closest("label");
      p.style.setProperty("--x", (l.offsetLeft - 4) + "px");
      p.style.setProperty("--l", l.offsetWidth + "px");
    });
  }
  placer();
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placer);
  window.addEventListener("resize", placer);

  /* ---------- Effets du héros : grille de points éclairée et carte inclinée ---------- */
  var heros = doc.querySelector(".heros"), carte = doc.querySelector(".apercu");
  if (heros && fin && !reduit) {
    var prevu = false, mx = 0, my = 0;
    heros.addEventListener("pointermove", function (e) {
      var r = heros.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      if (prevu) return;
      prevu = true;
      requestAnimationFrame(function () {
        prevu = false;
        heros.style.setProperty("--mx", mx + "px");
        heros.style.setProperty("--my", my + "px");
        heros.classList.add("eclaire");
        if (carte) {
          var rc = carte.getBoundingClientRect();
          var dx = (mx + r.left - (rc.left + rc.width / 2)) / rc.width, dy = (my + r.top - (rc.top + rc.height / 2)) / rc.height;
          if (Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2 && !carte.contains(doc.activeElement)) {
            carte.style.setProperty("--ry", (dx * 6).toFixed(2) + "deg");
            carte.style.setProperty("--rx", (-dy * 6).toFixed(2) + "deg");
            carte.style.setProperty("--gx", ((dx + .5) * 100).toFixed(1) + "%");
            carte.style.setProperty("--gy", ((dy + .5) * 100).toFixed(1) + "%");
          } else { carte.style.setProperty("--rx", "0deg"); carte.style.setProperty("--ry", "0deg"); }
        }
      });
    });
    heros.addEventListener("pointerleave", function () {
      heros.classList.remove("eclaire");
      if (carte) { carte.style.setProperty("--rx", "0deg"); carte.style.setProperty("--ry", "0deg"); }
    });
  }

  /* Étapes : un trait relie les numéros quand la section apparaît */
  var etapes = $("etapes");
  if (etapes && "IntersectionObserver" in window && !reduit) {
    etapes.classList.add("attente");
    var obs = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return;
      etapes.classList.remove("attente");
      etapes.classList.add("joue");
      obs.disconnect();
    }, { threshold: .35 });
    obs.observe(etapes);
  }
})();
