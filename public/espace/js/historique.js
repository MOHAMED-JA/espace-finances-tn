/*
 * Orbite — annuler / rétablir dans les modules Salaire, Crédit et Épargne (Lot 2).
 * Chaque module signale ses changements (O.modifie → « orbite:modifie ») ; on garde un instantané par pause de saisie
 * (700 ms), 50 au plus par module, en mémoire seulement (rien n'est envoyé ni stocké).
 * Ctrl Z / ⌘ Z annule, Ctrl Y ou Ctrl ⇧ Z rétablit — sauf dans un champ de texte, où le navigateur garde
 * son propre « annuler » de la frappe. Boutons ↶ ↷ dans la barre, et dans Ctrl K.
 * Instantané : module.instantane() / restaurer() s'ils existent (Crédit : les 3 scénarios), sinon etat() / charger().
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var $ = O.$, MODULES = { salaire: "ModuleSalaire", credit: "ModuleCredit", epargne: "ModuleEpargne" };
  var LIB = { salaire: "Salaire", credit: "Crédit", epargne: "Épargne" };
  var MAX = 50, PAUSE = 700, CALME = 900;
  var piles = {}, minuteries = {}, attente = {}, retour = null;

  function mod(vue) { return window[MODULES[vue]]; }
  function lire(vue) {
    var m = mod(vue);
    if (!m) return null;
    try { return m.instantane ? m.instantane() : m.etat(); } catch (e) { return null; }
  }
  function poser(vue, t) {
    var m = mod(vue);
    try { return m.restaurer ? m.restaurer(t) : m.charger(t); } catch (e) { return false; }
  }
  function pile(vue) { return piles[vue] || (piles[vue] = { etats: [], i: -1 }); }
  function vueCourante() { var v = O.lireRoute && O.lireRoute().vue; return MODULES[v] ? v : null; }

  /* Instantané si l'état a changé depuis le dernier ; ce qui suivait (rétablir) est abandonné. */
  function noter(vue) {
    if (retour && retour.vue === vue) return;
    var t = lire(vue), p = pile(vue);
    if (t == null || t === p.etats[p.i]) return;
    p.etats = p.etats.slice(0, p.i + 1);
    p.etats.push(t);
    if (p.etats.length > MAX) p.etats.shift();
    p.i = p.etats.length - 1;
    majBoutons();
  }
  /* Point de départ : l'état affiché quand on arrive sur le module (avant toute modification). */
  function depart(vue) {
    setTimeout(function () { if (pile(vue).i === -1) noter(vue); }, 300);
  }

  function aller(sens) {
    var vue = vueCourante();
    if (!vue) return false;
    clearTimeout(minuteries[vue]); attente[vue] = false;
    noter(vue); /* une saisie en attente devient un état avant de reculer */
    var p = pile(vue), j = p.i + sens;
    if (j < 0 || j >= p.etats.length) return false;
    retour = { vue: vue };
    if (!poser(vue, p.etats[j])) { retour = null; return false; }
    p.i = j;
    /* La restauration recalcule et signale des modifications : on les laisse passer, puis l'état normalisé remplace l'instantané. */
    setTimeout(function () { var t = lire(vue); if (t != null) p.etats[p.i] = t; retour = null; majBoutons(); }, CALME);
    majBoutons();
    O.toast(sens < 0 ? "Modification annulée." : "Modification rétablie.", { type: "info", detail: LIB[vue] + " · Ctrl Z pour annuler, Ctrl Y pour rétablir" });
    return true;
  }
  function possible(sens) {
    var vue = vueCourante();
    if (!vue) return false;
    var p = pile(vue), j = p.i + sens;
    return (sens < 0 && attente[vue] && p.i >= 0) || (j >= 0 && j < p.etats.length && !(sens > 0 && attente[vue]));
  }
  function majBoutons() {
    var a = $("histo-annuler"), r = $("histo-retablir");
    if (!a || !r) return;
    var vue = vueCourante(), p = vue ? pile(vue) : null, enAttente = !!(vue && attente[vue]);
    a.disabled = !p || (p.i <= 0 && !enAttente);
    r.disabled = !p || p.i >= p.etats.length - 1 || !!enAttente;
  }

  doc.addEventListener("orbite:modifie", function (e) {
    var vue = e.detail && e.detail.vue;
    if (!MODULES[vue] || (retour && retour.vue === vue)) return;
    if (pile(vue).i === -1) return; /* aucun état de départ connu : rien à annuler */
    clearTimeout(minuteries[vue]);
    attente[vue] = true;
    minuteries[vue] = setTimeout(function () { attente[vue] = false; noter(vue); majBoutons(); }, PAUSE);
    majBoutons();
  });
  /* Avant chaque geste dans un module (phase de capture : le module n'a pas encore réagi), l'état affiché est noté.
     Une rafale de frappes ne compte qu'une fois : l'état d'avant la rafale, puis celui d'après (pause de saisie). */
  var rafale = {};
  function avantGeste(e) {
    var vue = vueCourante();
    if (!vue || retour) return;
    var racine = $("vue-" + vue);
    if (!racine || !racine.contains(e.target)) return;
    if (!rafale[vue]) noter(vue);
    clearTimeout(rafale[vue]);
    rafale[vue] = setTimeout(function () { rafale[vue] = null; }, 1200);
  }
  ["input", "change", "click"].forEach(function (t) { doc.addEventListener(t, avantGeste, true); });

  doc.addEventListener("orbite:vue", function (e) {
    var vue = e.detail && e.detail.vue;
    if (MODULES[vue]) depart(vue);
    majBoutons();
  });
  if ($("histo-annuler")) {
    $("histo-annuler").addEventListener("click", function () { aller(-1); });
    $("histo-retablir").addEventListener("click", function () { aller(1); });
  }
  doc.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var k = e.key.toLowerCase(), annuler = k === "z" && !e.shiftKey, retablir = k === "y" || (k === "z" && e.shiftKey);
    if (!annuler && !retablir) return;
    var cible = e.target;
    if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) && !/^(radio|checkbox|range|button)$/.test(cible.type || ""))) return;
    if (doc.querySelector("dialog[open]") || !vueCourante()) return;
    if (aller(annuler ? -1 : 1)) e.preventDefault();
  });
  /* Premier affichage : le module courant a peut-être été rendu avant ce script. */
  doc.addEventListener("orbite:pret", function () { var v = vueCourante(); if (v) depart(v); }, { once: true });

  window.OrbiteHistorique = { annuler: function () { return aller(-1); }, retablir: function () { return aller(1); }, possible: possible,
    /* Position dans l'historique du module affiché (tests). */
    position: function () { var v = vueCourante(), p = v ? pile(v) : null; return p ? { vue: v, i: p.i, n: p.etats.length } : null; } };
})();
