/* Rappels de versement (fonctions pures) : échéance du mois selon le jour choisi et la fréquence. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Rappels = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MOIS = { Mensuel: 1, Trimestriel: 3, Semestriel: 6, Annuel: 12 };

  function joursDansMois(a, m) { return new Date(a, m + 1, 0).getDate(); }
  function cle(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

  /* Dernière échéance passée ou du jour : jour du mois (borné à la fin du mois), mois de départ et pas en mois */
  function derniereEcheance(r, maintenant) {
    var pas = MOIS[r.frequence] || 1;
    var depart = r.depart ? new Date(r.depart) : new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    var a = maintenant.getFullYear(), m = maintenant.getMonth();
    for (var k = 0; k < 13; k++) {
      var ecart = (a - depart.getFullYear()) * 12 + (m - depart.getMonth());
      if (ecart >= 0 && ecart % pas === 0) {
        var d = new Date(a, m, Math.min(r.jour, joursDansMois(a, m)));
        if (cle(d) <= cle(maintenant)) return d;
      }
      m--; if (m < 0) { m = 11; a--; }
    }
    return null;
  }

  /* r = { jour (1–31), frequence, depart (date ISO du 1er mois), dernier (AAAAMMJJ du dernier rappel affiché) } */
  function estDu(r, maintenant) {
    if (!r || !(r.jour >= 1 && r.jour <= 31)) return null;
    var d = derniereEcheance(r, maintenant);
    if (!d || (r.dernier && r.dernier >= cle(d))) return null;
    return { date: d, cle: cle(d) };
  }

  function prochaine(r, maintenant) {
    var pas = MOIS[r.frequence] || 1;
    for (var k = 0; k <= 12; k++) {
      var a = maintenant.getFullYear(), m = maintenant.getMonth() + k;
      var d = new Date(a, m, 1);
      var depart = r.depart ? new Date(r.depart) : new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      var ecart = (d.getFullYear() - depart.getFullYear()) * 12 + (d.getMonth() - depart.getMonth());
      if (ecart < 0 || ecart % pas) continue;
      var e = new Date(d.getFullYear(), d.getMonth(), Math.min(r.jour, joursDansMois(d.getFullYear(), d.getMonth())));
      if (cle(e) > cle(maintenant)) return e;
    }
    return null;
  }

  return { estDu: estDu, prochaine: prochaine, cle: cle };
});
