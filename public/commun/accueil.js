/* Accueil : calculateur signature (moteur réel du simulateur de salaire) et état connecté. */
(function () {
  "use strict";
  var P = window.PARAMETRES_PAIE, C = window.CalculSalaire, M = window.EFModele;
  var $ = function (id) { return document.getElementById(id); };

  /* Lien « Mon espace » si une session est enregistrée (vérifiée ensuite par l'espace). */
  var connecte = false;
  try { connecte = !!localStorage.getItem(window.EF_CONFIG.cleSession); } catch (e) {}
  document.querySelectorAll(connecte ? "[data-si-deconnecte]" : "[data-si-connecte]").forEach(function (el) { el.hidden = true; });
  document.querySelectorAll(connecte ? "[data-si-connecte]" : "[data-si-deconnecte]").forEach(function (el) { el.hidden = false; });

  var bandeau = $("bandeau");
  if (bandeau && /[?&]compte-supprime=1/.test(location.search)) {
    bandeau.textContent = "Votre compte et toutes vos simulations ont été supprimés définitivement.";
    bandeau.hidden = false;
    try { history.replaceState(null, "", "/"); } catch (e) {}
  }

  var form = $("instrument");
  if (!form || !P || !C) return;
  var champBrut = $("brut"), sortieEnfants = $("enfants");
  var enfants = 2;

  function lireMontant(texte) {
    var n = Number(String(texte).replace(/[\s  ]/g, "").replace(",", "."));
    return isFinite(n) && n >= 0 ? Math.min(n, 1e6) : null;
  }
  var f3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  var f0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var fSaisie = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
  function dt(v) { return f3.format(v).replace(/ /g, " "); }

  var precedent = null;
  function calculer() {
    var brut = lireMontant(champBrut.value);
    champBrut.setAttribute("aria-invalid", brut === null ? "true" : "false");
    if (brut === null) return;
    var secteur = form.querySelector("input[name=secteur]:checked").value;
    var r = C.calculerDepuisBrut({
      montant: brut, periode: "mensuel", secteur: secteur,
      chefDeFamille: form.elements.chef.checked, enfants: enfants
    }, P);
    var a = r.annuel, n = 12;
    var net = a.netAPayer / n, coti = a.cotisations / n, impot = (a.irpp + a.css) / n, cout = a.coutEmployeur / n;
    var elNet = $("net");
    elNet.textContent = dt(net);
    $("coti").textContent = dt(coti);
    $("impot").textContent = dt(impot);
    $("cout").textContent = dt(cout);
    $("lib-caisse").textContent = r.regime.caisse;
    var total = Math.max(brut, 0.0001);
    $("part-net").style.width = (net / total * 100) + "%";
    $("part-coti").style.width = (coti / total * 100) + "%";
    $("part-impot").style.width = (impot / total * 100) + "%";
    if (precedent !== null && Math.abs(precedent - net) > 0.0005) {
      elNet.classList.remove("change");
      void elNet.offsetWidth;
      elNet.classList.add("change");
    }
    precedent = net;
  }

  champBrut.addEventListener("input", calculer);
  champBrut.addEventListener("blur", function () {
    var v = lireMontant(champBrut.value);
    if (v !== null) champBrut.value = fSaisie.format(v).replace(/ /g, " ");
  });
  form.addEventListener("change", calculer);
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  form.querySelectorAll(".compteur__pas").forEach(function (b) {
    b.addEventListener("click", function () {
      enfants = Math.max(0, Math.min(10, enfants + Number(b.getAttribute("data-pas"))));
      sortieEnfants.textContent = String(enfants);
      form.querySelector('[data-pas="-1"]').disabled = enfants === 0;
      form.querySelector('[data-pas="1"]').disabled = enfants === 10;
      calculer();
    });
  });

  calculer();
  var exemple = C.calculerDepuisBrut({ montant: 2500, periode: "mensuel", secteur: "prive", chefDeFamille: true, enfants: 2 }, P);
  var ex = $("exemple-salaire");
  if (ex && M) ex.textContent = f0.format(exemple.annuel.netAPayer / 12).replace(/ /g, " ") + " DT net";
})();
