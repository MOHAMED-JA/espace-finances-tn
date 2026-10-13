/*
 * Orbite — « Mon bilan en PDF » (Ma progression, à côté de « Mon année en orbite » ; maquette validée le 13 oct. 2026).
 * Fenêtre : aperçu de la première page (vrais chiffres), sections à cocher (coordonnées décochées par défaut), téléchargement.
 * Calculs : BilanCalcul.construire ; mise en page : bilan-pdf.js + jsPDF, chargés à la première demande. Rien n'est envoyé.
 */
(function () {
  "use strict";
  var O = window.Orbite, BC = window.BilanCalcul, doc = document;
  var dlg = doc.getElementById("dlg-bilan");
  if (!O || !BC || !dlg) return;
  var $ = O.$, F = O.F;
  var CASES = { revenus: "bl-revenus", credits: "bl-credits", patrimoine: "bl-patrimoine", sante: "bl-sante", coordonnees: "bl-coord" };

  function dt0(v) { return F.dt0(v) + " DT"; }
  function donnees() {
    var P = window.OrbiteProgression;
    return P ? { objectifs: P.objectifs(), versements: P.versements() } : { objectifs: [], versements: [] };
  }
  function sections() { var r = {}; Object.keys(CASES).forEach(function (k) { r[k] = $(CASES[k]).checked; }); return r; }
  function construire() { return BC.construire(O.profil(), donnees(), new Date(), sections()); }

  /* Aperçu : la première page en miniature, avec les vrais chiffres. */
  function apercu() {
    var b;
    try { b = construire(); } catch (e) { return null; }
    $("bl-titre").textContent = "Mon bilan " + b.annee + " en PDF";
    $("bl-ap-titre").textContent = "Bilan " + b.annee + " · Orbite";
    $("bl-ap-net").textContent = dt0(b.cles.net);
    $("bl-ap-net-lib").textContent = b.complete ? "Net " + b.annee : "Net à ce jour";
    $("bl-ap-impot").textContent = dt0(b.cles.impot);
    $("bl-ap-score").textContent = b.cles.score + "/100";
    var ul = $("bl-ap-lignes"); ul.textContent = "";
    var lignes = [];
    if (b.credits) lignes.push(["Crédits restants", b.credits.liste.reduce(function (s, c) { return s + (c.resteDu || 0); }, 0)]);
    if (b.patrimoine) { lignes.push(["Épargne et contrats", b.patrimoine.actifs.filter(function (a) { return a.libelle !== "Logement" && a.libelle !== "Autres biens"; }).reduce(function (s, a) { return s + a.montant; }, 0)]); lignes.push(["Patrimoine net", b.patrimoine.net]); }
    if (b.patrimoine && b.patrimoine.epargneAnnee) lignes.push(["Économie d'impôt", b.patrimoine.epargneAnnee.impotEvite]);
    lignes.slice(0, 4).forEach(function (l) {
      var li = doc.createElement("li"); li.appendChild(doc.createElement("span")).textContent = l[0];
      li.appendChild(doc.createElement("b")).textContent = F.dt0(l[1]); ul.appendChild(li);
    });
    $("bl-ap-coord").hidden = !b.sections.coordonnees;
    var aucune = !Object.keys(CASES).some(function (k) { return b.sections[k]; });
    $("bl-valider").disabled = aucune;
    $("bl-aide").textContent = aucune ? "Cochez au moins une partie." : "Créé sur votre appareil, envoyé à personne.";
    return b;
  }

  function ouvrir() {
    var p = O.profil();
    if (!p || (O.profilVierge && O.profilVierge())) { O.toast("Indiquez d'abord votre salaire : le bilan se construit à partir de votre profil."); return; }
    Object.keys(CASES).forEach(function (k) { $(CASES[k]).checked = BC.PAR_DEFAUT[k]; });
    apercu();
    dlg.returnValue = "";
    dlg.showModal();
  }

  /* jsPDF (copie locale) et la mise en page, chargés à la première demande. */
  var promesse = null;
  function charger(src) { return new Promise(function (ok, ko) { var s = doc.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; doc.head.appendChild(s); }); }
  function outils() {
    if (window.jspdf && window.BilanPDF) return Promise.resolve();
    if (!promesse) promesse = (window.jspdf ? Promise.resolve() : charger("/espace/vendor/jspdf.umd.min.js")).then(function () { return window.BilanPDF ? null : charger("/espace/js/bilan-pdf.js"); });
    return promesse;
  }
  function telecharger() {
    var bouton = $("bl-valider"); bouton.disabled = true;
    outils().then(function () {
      var b = construire();
      O.telecharger(BC.nomFichier(b), window.BilanPDF.generer(b));
      dlg.close("ok");
      O.toast("Bilan " + b.annee + " téléchargé. Il a été créé sur votre appareil et envoyé à personne.");
      if (window.Espace && window.Espace.compterUsage) window.Espace.compterUsage("simulation", "bilan-pdf");
    }).catch(function (e) {
      if (window.console) console.warn(e);
      promesse = null;
      O.toast("Le PDF n'a pas pu être créé. Vérifiez votre connexion puis réessayez.");
    }).then(function () { bouton.disabled = false; });
  }

  dlg.addEventListener("change", apercu);
  $("form-bilan").addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok") return;
    ev.preventDefault();
    telecharger();
  });
  doc.addEventListener("click", function (e) { if (e.target.closest("[data-ouvrir-bilan]")) { e.preventDefault(); ouvrir(); } });
  /* #progression?bilan=1 (palette Ctrl K) ouvre la fenêtre. */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue === "progression" && e.detail.params.get("bilan") === "1") setTimeout(ouvrir, 0);
  });
  function majAcces() { var b = $("btn-bilan"); if (b) b.hidden = !O.profil() || !!(O.profilVierge && O.profilVierge()); }
  if (O.pret) majAcces(); else doc.addEventListener("orbite:pret", majAcces, { once: true });
  O.surProfil(majAcces);
  window.OrbiteBilan = { ouvrir: ouvrir };
})();
