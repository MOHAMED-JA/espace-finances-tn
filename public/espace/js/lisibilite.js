/*
 * Orbite — haute lisibilité (Lot 2, choix validé le 12 oct. 2026 : Paramètres › Préférences et Ctrl K, retenue sur le compte).
 * Texte plus grand, gris plus foncés, filets plus marqués, liens soulignés, contour de focus épais, animations coupées.
 * Le choix vit dans user_metadata.orbite_lisible (tous les appareils) et dans localStorage « ef-lisible »
 * (theme-init.js l'applique avant l'affichage, sans clignotement).
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document, racine = doc.documentElement;
  if (!O || !E) return;

  function actif() { return racine.getAttribute("data-lisible") === "oui"; }
  function poser(on) {
    if (on) racine.setAttribute("data-lisible", "oui"); else racine.removeAttribute("data-lisible");
    /* Animations coupées en haute lisibilité ; sinon, le réglage « Animations » de l'appareil reprend la main. */
    var reduit = on; try { reduit = on || localStorage.getItem("ef-mouvement") === "reduit"; } catch (e) {}
    if (reduit) racine.setAttribute("data-mouvement", "reduit"); else racine.removeAttribute("data-mouvement");
    try { if (on) localStorage.setItem("ef-lisible", "oui"); else localStorage.removeItem("ef-lisible"); } catch (e) {}
    doc.querySelectorAll("#choix-lisible input").forEach(function (r) { r.checked = r.value === (on ? "oui" : ""); });
    /* Les pastilles glissantes et les graphiques se recalent sur les nouvelles tailles. */
    requestAnimationFrame(function () { O.placerPastilles(doc); window.dispatchEvent(new Event("resize")); });
    doc.dispatchEvent(new CustomEvent("orbite:lisible", { detail: { actif: on } }));
  }
  function definir(on, options) {
    var o = options || {};
    poser(!!on);
    if (o.annoncer !== false) E.toast(on ? "Haute lisibilité activée : texte plus grand et plus contrasté." : "Lisibilité normale.", { detail: "Retenu sur votre compte, sur tous vos appareils." });
    return E.compte.preferences({ orbite_lisible: on ? "oui" : null }).then(function (d) {
      var u = d && (d.user || d); if (u && u.id) O.definirUtilisateur(u);
    }).catch(function () { if (o.annoncer !== false) E.toast("Appliqué sur cet appareil ; l'enregistrement sur le compte a échoué.", { erreur: true }); });
  }
  /* Au démarrage, le compte fait foi (choix fait sur un autre appareil). */
  function synchroniser() {
    var u = O.utilisateur(), m = (u && u.user_metadata) || {};
    var voulu = m.orbite_lisible === "oui";
    if (voulu !== actif()) poser(voulu);
    else doc.querySelectorAll("#choix-lisible input").forEach(function (r) { r.checked = r.value === (voulu ? "oui" : ""); });
  }
  var choix = doc.getElementById("choix-lisible");
  if (choix) choix.addEventListener("change", function (e) { if (e.target.name === "lisible") definir(e.target.value === "oui"); });
  if (O.pret) synchroniser(); else doc.addEventListener("orbite:pret", synchroniser, { once: true });
  window.OrbiteLisibilite = { actif: actif, definir: definir };
})();
