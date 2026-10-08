/*
 * Orbite — page de paiement de TEST (remplace la passerelle tant que PASSERELLE=test côté serveur).
 * Le serveur refuse la simulation dès qu'une vraie passerelle est configurée.
 */
(function () {
  "use strict";
  var E = window.Espace, A = window.AbonnementCalcul;
  var $ = function (id) { return document.getElementById(id); };
  var ref = new URLSearchParams(location.search).get("ref") || "";
  function erreur(t) { var e = $("pt-erreur"); e.textContent = t; e.hidden = false; }
  function retour(echec) { location.replace("/espace/?paiement=" + encodeURIComponent(ref) + (echec ? "&echec=1" : "")); }
  function montant(m) { return new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(m / 1000).replace(/\s/g, " ") + " DT"; }

  if (!A.REFERENCE.test(ref)) { erreur("Référence de commande invalide."); return; }
  E.exigerConnexion().then(function () { return E.abonnement.detail(ref); }).then(function (d) {
    $("pt-formule").textContent = d.libelle || d.formule;
    $("pt-duree").textContent = d.mois === 1 ? "1 mois" : d.mois + " mois";
    $("pt-ref").textContent = d.reference;
    $("pt-montant").textContent = montant(d.montant_millimes) + (d.prix_initial_millimes && d.code_promo ? " (au lieu de " + montant(d.prix_initial_millimes) + ", code " + d.code_promo + ")" : "");
    $("pt-recap").setAttribute("aria-busy", "false");
    if (d.statut !== "cree") { erreur("Cette commande est déjà traitée."); return; }
    $("pt-ok").disabled = false; $("pt-refus").disabled = false;
  }).catch(function (x) { erreur((x && x.message) || "Commande introuvable."); });

  function simuler(resultat) {
    $("pt-ok").disabled = true; $("pt-refus").disabled = true;
    E.abonnement.simuler(ref, resultat).then(function (r) { retour(!(r && r.statut === "paye")); })
      .catch(function (x) { erreur((x && x.message) || "Simulation impossible."); });
  }
  $("pt-ok").addEventListener("click", function () { simuler("ok"); });
  $("pt-refus").addEventListener("click", function () { simuler("refuse"); });
})();
