/*
 * Orbite — apparence personnelle (maquette validée le 13 oct. 2026) : couleur d'accent, densité, taille du texte.
 * Paramètres › Préférences et Ctrl K. Le choix vit dans user_metadata (orbite_accent, orbite_densite, orbite_taille :
 * tous les appareils) et dans localStorage « ef-apparence » (theme-init.js l'applique avant l'affichage, sans clignotement).
 * Valeurs par défaut (Encre, Confortable, Normale) : aucun attribut, rien n'est enregistré.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, T = window.EFTheme, doc = document, racine = doc.documentElement;
  if (!O || !E || !T) return;

  var NOMS = {
    accent: { "": "Encre", sidi: "Sidi Bou Saïd", olivier: "Olivier", djerba: "Djerba", bougain: "Bougainvillier" },
    densite: { "": "Confortable", compacte: "Compacte" },
    taille: { "": "Normale", grande: "Grande", "tres-grande": "Très grande" }
  };
  var CLES = { accent: "orbite_accent", densite: "orbite_densite", taille: "orbite_taille" };

  function actuelle() {
    return T.normaliserApparence({ accent: racine.getAttribute("data-accent"), densite: racine.getAttribute("data-densite"), taille: racine.getAttribute("data-taille") });
  }
  function parDefaut(a) { return !a.accent && !a.densite && !a.taille; }
  function cocher(a) {
    Object.keys(CLES).forEach(function (k) {
      doc.querySelectorAll("#choix-" + k + " input").forEach(function (r) { r.checked = r.value === a[k]; });
    });
    var b = doc.getElementById("apparence-origine"); if (b) b.disabled = parDefaut(a);
  }
  function poser(v) {
    var avant = actuelle(), a = T.poserApparence(v);
    try { if (parDefaut(a)) localStorage.removeItem("ef-apparence"); else localStorage.setItem("ef-apparence", JSON.stringify(a)); } catch (e) {}
    cocher(a);
    /* Pastilles glissantes et graphiques se recalent sur les nouvelles tailles. */
    if (avant.densite !== a.densite || avant.taille !== a.taille) requestAnimationFrame(function () { O.placerPastilles(doc); window.dispatchEvent(new Event("resize")); });
    else requestAnimationFrame(function () { O.placerPastilles(doc); });
    doc.dispatchEvent(new CustomEvent("orbite:apparence", { detail: a }));
    return a;
  }
  function enregistrer(a, annoncer, message) {
    var maj = {}; Object.keys(CLES).forEach(function (k) { maj[CLES[k]] = a[k] || null; });
    if (annoncer) E.toast(message, { detail: "Retenu sur votre compte, sur tous vos appareils." });
    return E.compte.preferences(maj).then(function (d) {
      var u = d && (d.user || d); if (u && u.id) O.definirUtilisateur(u);
    }).catch(function () { if (annoncer) E.toast("Appliqué sur cet appareil ; l'enregistrement sur le compte a échoué.", { erreur: true }); });
  }
  /* definir({ accent: "sidi" }) : ne change que les réglages donnés. */
  function definir(partiel, options) {
    var o = options || {}, a = actuelle();
    Object.keys(partiel || {}).forEach(function (k) { if (k in a) a[k] = partiel[k] || ""; });
    a = poser(a);
    var k = Object.keys(partiel || {})[0];
    var msg = k === "accent" ? "Couleur d'accent : " + NOMS.accent[a.accent] + "." : k === "densite" ? "Densité : " + NOMS.densite[a.densite].toLowerCase() + "." : "Taille du texte : " + NOMS.taille[a.taille].toLowerCase() + ".";
    return enregistrer(a, o.annoncer !== false, msg);
  }
  function origine() {
    var a = poser({});
    return enregistrer(a, true, "Apparence d'origine : Encre, confortable, texte normal.");
  }
  /* Au démarrage, le compte fait foi (choix fait sur un autre appareil). */
  function synchroniser() {
    var u = O.utilisateur(), m = (u && u.user_metadata) || {};
    var voulu = T.normaliserApparence({ accent: m.orbite_accent, densite: m.orbite_densite, taille: m.orbite_taille });
    var a = actuelle();
    if (voulu.accent !== a.accent || voulu.densite !== a.densite || voulu.taille !== a.taille) poser(voulu); else cocher(a);
  }
  Object.keys(CLES).forEach(function (k) {
    var g = doc.getElementById("choix-" + k);
    if (g) g.addEventListener("change", function (e) { if (e.target.name === k) { var p = {}; p[k] = e.target.value; definir(p); } });
  });
  var bo = doc.getElementById("apparence-origine");
  if (bo) bo.addEventListener("click", origine);
  if (O.pret) synchroniser(); else doc.addEventListener("orbite:pret", synchroniser, { once: true });
  window.OrbiteApparence = { actuelle: actuelle, definir: definir, origine: origine, NOMS: NOMS };
})();
