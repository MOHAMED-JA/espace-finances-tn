/* Objectifs multiples (fonctions pures) : pour chaque projet (retraite, études, logement…), versement mensuel
   nécessaire au rendement net donné, puis répartition du versement actuel par ordre d'échéance. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Objectifs = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Versement mensuel (fin de mois) pour atteindre `montant` en `ans` années au rendement annuel net `tauxPct`,
     déduction faite d'un capital déjà disponible `deja` placé au même taux */
  function mensualite(montant, ans, tauxPct, deja) {
    var n = Math.round(ans * 12);
    if (!(montant > 0) || !(n > 0)) return 0;
    var r = Math.pow(1 + tauxPct / 100, 1 / 12) - 1;
    var reste = montant - (deja || 0) * Math.pow(1 + r, n);
    if (reste <= 0) return 0;
    return Math.abs(r) < 1e-12 ? reste / n : reste * r / (Math.pow(1 + r, n) - 1);
  }

  function valide(o) { return o && isFinite(o.montant) && o.montant > 0 && isFinite(o.ans) && o.ans >= 1 && o.ans <= 50; }

  /* objectifs = [{ nom, montant, ans, deja }] ; versementMensuel = épargne disponible par mois */
  function planifier(objectifs, tauxPct, versementMensuel) {
    var liste = objectifs.map(function (o, i) {
      return valide(o) ? { indice: i, nom: o.nom, montant: o.montant, ans: o.ans, deja: o.deja || 0, valide: true, mensuel: mensualite(o.montant, o.ans, tauxPct, o.deja) }
        : { indice: i, nom: o && o.nom, valide: false };
    });
    var valides = liste.filter(function (o) { return o.valide; });
    var besoin = valides.reduce(function (t, o) { return t + o.mensuel; }, 0);
    /* Les échéances les plus proches sont servies en premier */
    var reste = Math.max(0, versementMensuel || 0);
    valides.slice().sort(function (a, b) { return a.ans - b.ans || a.indice - b.indice; }).forEach(function (o) {
      o.alloue = Math.min(o.mensuel, reste);
      reste -= o.alloue;
      o.couverture = o.mensuel > 0 ? o.alloue / o.mensuel * 100 : 100;
      o.atteint = o.couverture >= 99.95;
    });
    return { objectifs: liste, besoin: besoin, disponible: versementMensuel || 0, manque: Math.max(0, besoin - (versementMensuel || 0)), surplus: Math.max(0, (versementMensuel || 0) - besoin) };
  }

  return { mensualite: mensualite, planifier: planifier, valide: valide };
});
