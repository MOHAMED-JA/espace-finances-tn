/* Orbite — pages publiques : mini-calcul en direct (salaire net, capacité de crédit, impôt, retraite, simulateur de crédit,
   assurance vie, CEA).
   Les textes viennent de PagesCalcul.affichage, la même fonction qui a écrit le HTML : avant et après le script, mêmes formats.
   Aucune donnée n'est envoyée ni enregistrée. CSP stricte : styles posés par CSSOM (style.setProperty), jamais en attribut. */
(function () {
  "use strict";
  var doc = document, page = doc.body.getAttribute("data-page"), C = window.PagesCalcul, form = doc.getElementById("calc");

  /* En-tête : boutons selon la session (même règle que l'accueil). */
  var connecte = false;
  try { connecte = !!localStorage.getItem(window.EF_CONFIG.cleSession); } catch (e) {}
  doc.querySelectorAll(connecte ? "[data-si-deconnecte]" : "[data-si-connecte]").forEach(function (el) { el.hidden = true; });
  doc.querySelectorAll(connecte ? "[data-si-connecte]" : "[data-si-deconnecte]").forEach(function (el) { el.hidden = false; });
  if (!C || !form) return;

  function lire(t, zero) {
    var n = Number(String(t).replace(/[\s  ]/g, "").replace(",", "."));
    return isFinite(n) && (zero ? n >= 0 : n > 0) ? Math.min(n, 1e6) : null;
  }
  function champ(nom) { return form.elements[nom]; }
  function coche(nom) { var c = form.querySelector("input[name='" + nom + "']:checked"); return c ? c.value : null; }
  function enfants() { var o = form.querySelector("output[name='enfants']"); return o ? Number(o.value || o.textContent) || 0 : 0; }

  /* Saisie → entrée du calcul ; null si un champ obligatoire est invalide. */
  function entree() {
    var mt = champ("montant"), montant = lire(mt.value), ok = montant != null;
    mt.setAttribute("aria-invalid", ok ? "false" : "true");
    var e = { montant: montant, secteur: coche("secteur") || "prive", chef: !!(champ("chef") && champ("chef").checked), enfants: enfants() };
    if (page === "credit") {
      var enc = champ("encours"), v = lire(enc.value, true);
      enc.setAttribute("aria-invalid", v == null && enc.value.trim() !== "" ? "true" : "false");
      e = { net: montant, encours: v || 0 };
    }
    if (page === "pret" || page === "vie" || page === "cea") {
      var bons = {
        pret: function () { return { type: coche("type") || "auto", montant: montant, dureeAns: lire(champ("duree").value), marge: lire(champ("marge").value, true) }; },
        vie: function () { return { montant: montant, versement: lire(champ("versement").value, true), dureeAns: lire(champ("duree").value), rendement: lire(champ("rendement").value, true) }; },
        cea: function () { return { montant: montant, depot: lire(champ("depot").value, true) }; }
      }[page]();
      Object.keys(bons).forEach(function (k) {
        if (k === "type" || k === "montant") return;
        var nom = k === "dureeAns" ? "duree" : k, el = champ(nom), bon = bons[k] != null;
        el.setAttribute("aria-invalid", bon ? "false" : "true"); if (!bon) ok = false;
      });
      e = bons;
    }
    if (page === "retraite") {
      ["anneeNaissance", "anneeDebut"].forEach(function (k) {
        var el = champ(k), n = Number(el.value), bon = /^\d{4}$/.test(el.value.trim()) && n > 1900;
        el.setAttribute("aria-invalid", bon ? "false" : "true"); if (!bon) ok = false; e[k] = n;
      });
    }
    return ok ? e : null;
  }

  function poser(aff) {
    doc.querySelectorAll("[data-v]").forEach(function (el) {
      var k = el.getAttribute("data-v");
      if (Object.prototype.hasOwnProperty.call(aff, k) && el.textContent !== aff[k]) el.textContent = aff[k];
    });
    if (aff.parts) doc.querySelectorAll("[data-part]").forEach(function (el) { el.style.setProperty("--part", String(aff.parts[el.getAttribute("data-part")] || 0)); });
    doc.querySelectorAll("[data-jauge]").forEach(function (el) { el.style.setProperty("--p", ((aff.jauge || 0) * 100).toFixed(1) + "%"); el.style.setProperty("opacity", aff.jauge > 0 ? "1" : "0"); });
    doc.querySelectorAll("[data-si-etat]").forEach(function (el) { el.hidden = !!aff.etat && el.getAttribute("data-si-etat") !== aff.etat; });
    doc.querySelectorAll("[data-si-tard]").forEach(function (el) { el.hidden = !aff.tard; });
  }
  function calculer() {
    var e = entree();
    if (!e) return;
    try { poser(C.affichage(page, e, new Date())); } catch (er) { /* valeurs déjà affichées conservées */ }
  }

  /* Bascules (pastille glissante, positionnée par CSSOM). */
  function placer() {
    form.querySelectorAll(".bascule").forEach(function (g) {
      var c = g.querySelector("input:checked"), p = g.querySelector(".bascule__pastille");
      if (!c || !p) return;
      var l = c.closest("label");
      p.style.setProperty("--x", (l.offsetLeft - 4) + "px");
      p.style.setProperty("--l", l.offsetWidth + "px");
    });
  }

  /* Compteur d'enfants (0 à 4, comme les déductions). */
  form.querySelectorAll(".compteur").forEach(function (cpt) {
    var out = cpt.querySelector("output"), moins = cpt.querySelector("[data-pas='-1']"), plus = cpt.querySelector("[data-pas='1']");
    cpt.addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-pas]");
      if (!b || b.disabled) return;
      var n = Math.max(0, Math.min(4, (Number(out.value || out.textContent) || 0) + Number(b.getAttribute("data-pas"))));
      out.value = String(n); out.textContent = String(n);
      out.classList.remove("saute"); void out.offsetWidth; out.classList.add("saute");
      moins.disabled = n <= 0; plus.disabled = n >= 4;
      calculer();
    });
  });

  var frappe;
  form.addEventListener("input", function (ev) {
    if (ev.target.matches("input[type='text']")) { clearTimeout(frappe); frappe = setTimeout(calculer, 80); }
  });
  /* Simulateur de crédit : un autre type reprend son exemple (montant, durée, marge). */
  form.addEventListener("change", function (ev) {
    if (ev.target.name === "type" && page === "pret") {
      var r = ev.target, fmt = function (n) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n).replace(/[\u00a0\u202f]/g, " "); };
      champ("montant").value = fmt(Number(r.getAttribute("data-montant")));
      champ("duree").value = r.getAttribute("data-duree");
      champ("marge").value = fmt(Number(r.getAttribute("data-marge")));
    }
  });
  form.addEventListener("change", function (ev) { if (!ev.target.matches("input[type='text']")) { placer(); calculer(); } });
  form.addEventListener("submit", function (ev) { ev.preventDefault(); calculer(); });
  form.querySelectorAll("input[inputmode='decimal']").forEach(function (el) {
    el.addEventListener("blur", function () {
      var v = lire(el.value, ["encours", "versement", "rendement", "marge", "depot"].indexOf(el.name) !== -1);
      if (v != null) el.value = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(v).replace(/[  ]/g, " ");
    });
  });

  placer();
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placer);
  window.addEventListener("resize", placer);
  calculer();
})();
