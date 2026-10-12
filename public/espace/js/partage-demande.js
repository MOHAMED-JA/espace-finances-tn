/*
 * Orbite — demande de partage de la fiche avec l'administrateur, posée une fois à chaque compte.
 * L'accord reste exprès (loi organique 2004-63) : rien n'est coché d'avance, « Partager ma fiche » est le bouton
 * mis en avant et « Pas maintenant » est toujours possible. Le choix est retenu dans user_metadata.orbite_partage_demande
 * (pas de nouvelle demande ensuite) ; on change d'avis à tout moment dans Paramètres.
 * Jamais pendant le premier pas, la visite guidée ou une autre fenêtre : la demande attend son tour.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document;
  var ATTENTE_MS = 2500, ESSAIS = 40;

  function $(id) { return doc.getElementById(id); }
  function meta() { var u = O.utilisateur && O.utilisateur(); return (u && u.user_metadata) || {}; }
  function occupe() { return !!doc.querySelector("dialog[open]") || doc.body.classList.contains("visite-ouverte") || doc.body.classList.contains("attente"); }

  function retenir(reponse) {
    return E.compte.preferences({ orbite_partage_demande: new Date().toISOString(), orbite_partage_reponse: reponse })
      .then(function (d) { var u = d && (d.user || d); if (u && u.id) O.definirUtilisateur(u); })
      .catch(function () { /* hors ligne : la question reviendra une fois, au prochain lancement */ });
  }

  function ouvrir() {
    var d = $("dlg-partage"), oui = $("dlg-partage-oui"), non = $("dlg-partage-non"), err = $("dlg-partage-erreur");
    if (!d || !d.showModal) return;
    var fini = false;
    function fin(reponse) { if (fini) return; fini = true; retenir(reponse); }
    oui.addEventListener("click", function (e) {
      e.preventDefault();
      oui.disabled = non.disabled = true; err.hidden = true;
      E.partage.definir(true).then(function (etat) {
        fin("oui");
        d.close("oui");
        doc.dispatchEvent(new CustomEvent("orbite:partage", { detail: etat }));
        E.toast("Merci ! Votre fiche est partagée avec l'administrateur.", { type: "ok", detail: "Vous pouvez le retirer à tout moment dans Paramètres." });
      }).catch(function () { err.hidden = false; })
        .finally(function () { oui.disabled = non.disabled = false; });
    });
    /* « Pas maintenant », Échap : la réponse est retenue, Orbite ne redemande pas. */
    d.addEventListener("close", function () { if (d.returnValue !== "oui") fin("non"); }, { once: true });
    d.returnValue = "";
    d.showModal();
  }

  function proposer(essai) {
    if (meta().orbite_partage_demande) return;
    if (occupe()) { if (essai < ESSAIS) setTimeout(function () { proposer(essai + 1); }, ATTENTE_MS); return; }
    ouvrir();
  }

  function demarrer() {
    /* Nouveau compte : d'abord le premier pas et la visite ; la question vient au lancement suivant. */
    if (!E.partage || meta().orbite_partage_demande || O.profilVierge()) return;
    Promise.all([E.partage.etat(), E.admin.est()]).then(function (r) {
      if ((r[0] && r[0].accorde) || r[1]) return; /* déjà partagée, ou compte administrateur */
      setTimeout(function () { proposer(0); }, ATTENTE_MS);
    }).catch(function () {});
  }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });
})();
