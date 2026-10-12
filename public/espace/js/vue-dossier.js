/*
 * Orbite — fenêtre « Préparer mon dossier banque » (maquette validée le 12 oct. 2026). Le crédit demandé est
 * facultatif (sans lui : capacité seule et montant maximum par type) ; employeur et poste sont enregistrés dans le
 * profil ; en mode foyer, un dossier à deux noms ajoute les revenus et les crédits du conjoint. Effet en direct
 * (mensualité, endettement avant → après, règle de la banque), puis PDF fabriqué sur l'appareil (jsPDF chargé à la
 * demande, mise en page dossier-pdf.js). Entrée : module Crédit, bouton « Préparer mon dossier banque » ; lien #credit?dossier=1.
 */
(function () {
  "use strict";
  var O = window.Orbite, D = window.Dossier, doc = document;
  if (!O || !D) return;
  var $ = O.$, F = O.F, dlg = $("dlg-dossier");
  if (!dlg) return;
  var MAX = { immo: 300, auto: 84, conso: 84 };
  var DEFAUT = { immo: 240, auto: 84, conso: 84 };
  var MARGE = { immo: "2,5", auto: "3", conso: "3,5" };
  /* Saisie gardée d'une ouverture à l'autre (pas enregistrée). */
  var saisie = { type: "aucun", montant: {}, duree: {}, taux: {}, objet: "" };

  function type() { var r = dlg.querySelector('input[name="db-type"]:checked'); return r ? r.value : "aucun"; }
  function lireNombre(id) { var v = F.lire($(id).value); return v.valide && !v.vide ? v.valeur : null; }
  function deuxNomsPossible(p) { return !!(p.foyer && p.conjointMontant > 0); }

  function demande() {
    var t = type();
    if (t === "aucun") return null;
    return { type: t, montant: lireNombre("db-montant"), dureeMois: lireNombre("db-duree"), tauxPct: lireNombre("db-taux"), objet: $("db-objet").value };
  }
  function options() {
    return { deuxNoms: !$("db-deux-bloc").hidden && $("db-deux").checked, coordonnees: $("db-coord").checked,
      echeancier: $("db-ech").checked, paliers: $("db-pal").checked, pieces: $("db-pie").checked };
  }

  /* Taux et durée proposés pour un type (repris du profil ; durée limitée par la fin du crédit à 70 ans). */
  function proposer(t, sy) {
    var taux = O.F.saisie(Math.round(D.tauxPropose(sy, t) * 100) / 100);
    var src = window.OrbiteCalcul.tauxNouveaux(sy.profil)[t].source;
    $("db-taux-aide").textContent = src === "choisi" ? "Votre taux choisi dans le profil" : src === "credit" ? "Taux de votre crédit en cours du même type" : "Taux du marché (TMM + " + MARGE[t] + ")";
    var ageMois = Math.max(12, (window.OrbiteCalcul.AGE_MAX - sy.age) * 12);
    $("db-duree-aide").textContent = t === "immo" ? "25 ans (300 mois) au plus" : "7 ans (84 mois) au plus";
    return { taux: taux, duree: String(Math.min(DEFAUT[t], ageMois)) };
  }

  function choisirType(t, sy) {
    var aucun = t === "aucun";
    $("db-champs").hidden = aucun;
    $("db-aucun-aide").hidden = !aucun;
    $("db-ech-bloc").hidden = aucun;
    if (aucun) return;
    var pr = proposer(t, sy);
    $("db-montant").value = saisie.montant[t] || "";
    $("db-duree").value = saisie.duree[t] || pr.duree;
    $("db-taux").value = saisie.taux[t] || pr.taux;
  }

  function largeur(el, v, max) { el.style.width = Math.max(0, Math.min(100, v / max * 100)) + "%"; }

  function effet() {
    var sy = O.synthese(); if (!sy) return null;
    var dem = demande();
    var d = D.construire(sy, dem, options());
    var cap = d.capacite, dm = d.demande, bloc = $("db-effet");
    var max = Math.max(0.6, d.quotite * 1.25, dm ? dm.endettementApres * 1.05 : 0);
    largeur($("db-j1"), cap.endettement, max);
    largeur($("db-seuil"), d.quotite, max);
    $("db-j2").hidden = !dm;
    if (dm) {
      largeur($("db-j2"), dm.endettementApres, max);
      $("db-l1-lib").textContent = "Mensualité"; $("db-l1").textContent = F.dt3(dm.mensualite) + " DT";
      $("db-l2-lib").textContent = "Endettement aujourd'hui → après"; $("db-l2").textContent = F.pct(dm.endettementAvant) + " → " + F.pct(dm.endettementApres);
      bloc.dataset.etat = dm.respecte ? "ok" : "ko";
      $("db-verdict").textContent = (dm.respecte ? "Sous le plafond de " + F.pct(d.quotite, 0) + " : la règle de la banque est respectée. " : "Au-dessus du plafond de " + F.pct(d.quotite, 0) + " : la banque refusera probablement ce montant. ") +
        "À ces conditions, vous pouvez demander jusqu'à " + F.dt0(Math.floor(dm.capitalMax)) + " DT." + (dm.dureeTropLongue ? " Attention : le crédit se terminerait à " + dm.ageFin + " ans." : "");
    } else {
      $("db-l1-lib").textContent = "Disponible par mois"; $("db-l1").textContent = F.dt3(cap.disponible) + " DT";
      $("db-l2-lib").textContent = "Endettement aujourd'hui"; $("db-l2").textContent = F.pct(cap.endettement);
      bloc.dataset.etat = cap.disponible >= 1 ? "neutre" : "ko";
      $("db-verdict").textContent = cap.disponible >= 1
        ? "Montant maximum : " + d.maxParType.map(function (x) { return x.libelle.toLowerCase() + " " + F.dt0(Math.floor(x.capital)) + " DT"; }).join(", ") + "."
        : "Vos crédits atteignent déjà le plafond de " + F.pct(d.quotite, 0) + " : la banque ne prêtera pas davantage aujourd'hui.";
    }
    return d;
  }

  function ouvrir() {
    var sy = O.synthese(), p = O.profil();
    if (!sy || !p) return;
    var retraite = p.activite === "retraite";
    $("db-emploi").hidden = retraite;
    $("db-employeur").value = p.employeur || "";
    $("db-poste").value = p.poste || "";
    var deux = deuxNomsPossible(p);
    $("db-deux-bloc").hidden = !deux;
    if (deux) $("db-deux-aide").textContent = "Les revenus et les crédits de " + (p.conjointPrenom || "votre conjoint") + " sont ajoutés.";
    $("db-objet").value = saisie.objet;
    var r = dlg.querySelector('input[name="db-type"][value="' + saisie.type + '"]'); if (r) r.checked = true;
    choisirType(type(), sy);
    $("db-montant-err").hidden = true;
    effet();
    dlg.returnValue = "";
    dlg.showModal();
    O.placerPastilles(dlg);
  }

  /* jsPDF (copie locale) et la mise en page, chargés à la première demande. */
  var promesse = null;
  function charger(src) { return new Promise(function (ok, ko) { var s = doc.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; doc.head.appendChild(s); }); }
  function outils() {
    if (window.jspdf && window.DossierPDF) return Promise.resolve();
    if (!promesse) promesse = (window.jspdf ? Promise.resolve() : charger("/espace/vendor/jspdf.umd.min.js")).then(function () { return window.DossierPDF ? null : charger("/espace/js/dossier-pdf.js"); });
    return promesse;
  }

  function telecharger() {
    var p = O.profil(), emp = $("db-employeur").value.trim(), poste = $("db-poste").value.trim();
    if (p.activite !== "retraite" && (emp !== (p.employeur || "") || poste !== (p.poste || ""))) O.majProfil({ employeur: emp, poste: poste }, { immediat: true });
    var bouton = $("db-valider"); bouton.disabled = true;
    outils().then(function () {
      var d = effet();
      var blob = window.DossierPDF.generer(d);
      O.telecharger("dossier-banque-" + d.reference + ".pdf", blob);
      dlg.close("ok");
      O.toast("Dossier banque téléchargé. Il n'a été envoyé à personne.");
    }).catch(function (e) {
      if (window.console) console.warn(e);
      promesse = null;
      O.toast("Le PDF n'a pas pu être créé. Vérifiez votre connexion puis réessayez.");
    }).then(function () { bouton.disabled = false; });
  }

  /* Saisie gardée par type de crédit ; le choix du type (radio) est traité au « change », après l'« input ». */
  function garder() {
    var t = type();
    saisie.type = t; saisie.objet = $("db-objet").value;
    if (t !== "aucun") { saisie.montant[t] = $("db-montant").value; saisie.duree[t] = $("db-duree").value; saisie.taux[t] = $("db-taux").value; }
  }
  dlg.addEventListener("change", function (e) {
    if (e.target.name === "db-type") { choisirType(type(), O.synthese()); $("db-montant-err").hidden = true; }
    garder(); effet();
  });
  dlg.addEventListener("input", function (e) { if (e.target.name === "db-type") return; garder(); effet(); });
  $("form-dossier").addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok") return;
    ev.preventDefault();
    var dm = demande();
    if (dm && !(dm.montant > 0)) { $("db-montant-err").hidden = false; $("db-montant").focus(); return; }
    telecharger();
  });

  $("dossier-ouvrir").addEventListener("click", ouvrir);
  /* Lien direct : #credit?dossier=1 (Assistant, Mon orbite). */
  function depuisRoute() {
    var r = O.lireRoute && O.lireRoute();
    if (r && r.vue === "credit" && r.params && r.params.get("dossier") === "1" && O.pret) { history.replaceState(null, "", "#credit"); ouvrir(); }
  }
  window.addEventListener("hashchange", depuisRoute);
  doc.addEventListener("orbite:pret", depuisRoute);
  if (O.pret) depuisRoute();
  O.ouvrirDossier = ouvrir;
})();
