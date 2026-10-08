/* Historique des saisies (fonctions pures) : annuler et rétablir, sans doublon consécutif. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Historique = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function creer(max) {
    var pile = [], pos = -1, limite = max || 50;
    return {
      /* Enregistre un état ; renvoie false s'il est identique au courant */
      ajouter: function (etat) {
        var s = JSON.stringify(etat);
        if (pos >= 0 && pile[pos] === s) return false;
        pile = pile.slice(0, pos + 1);
        pile.push(s);
        if (pile.length > limite) pile.shift();
        pos = pile.length - 1;
        return true;
      },
      peutAnnuler: function () { return pos > 0; },
      peutRetablir: function () { return pos < pile.length - 1; },
      annuler: function () { if (pos <= 0) return null; pos--; return JSON.parse(pile[pos]); },
      retablir: function () { if (pos >= pile.length - 1) return null; pos++; return JSON.parse(pile[pos]); },
      courant: function () { return pos >= 0 ? JSON.parse(pile[pos]) : null; },
      precedent: function () { return pos > 0 ? JSON.parse(pile[pos - 1]) : null; },
      taille: function () { return pile.length; },
      position: function () { return pos; }
    };
  }

  return { creer: creer };
});
