/* Lecture des nombres saisis : fonctions pures.
   Gère l'écriture française (45 000,5) et anglo-saxonne (45,000.5), et signale l'ambiguïté « 45,000 ». */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Saisie = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Renvoie { vide, v, ambigu, alternative }.
     - v = NaN si la saisie n'est pas un nombre ;
     - ambigu = true pour « 45,000 » ou « 45.000 » (un seul séparateur suivi de 3 chiffres, partie entière de 1 à 3 chiffres) :
       lu comme décimal (45 TND, le dinar a trois décimales), `alternative` donne la lecture « séparateur de milliers » (45 000). */
  function lireNombre(saisie) {
    var t = String(saisie == null ? '' : saisie).trim().replace(/[\s  ]/g, '');
    if (t === '') return { vide: true, v: 0, ambigu: false, alternative: null };
    if (!/^\d[\d.,]*$|^[.,]\d+$/.test(t)) return { vide: false, v: NaN, ambigu: false, alternative: null };

    var nbPoints = (t.match(/\./g) || []).length;
    var nbVirgules = (t.match(/,/g) || []).length;
    var dernier = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
    var texte;

    if (nbPoints + nbVirgules === 0) {
      texte = t;
    } else if (nbPoints > 0 && nbVirgules > 0) {
      /* Deux séparateurs différents : le dernier est décimal, l'autre sépare les milliers */
      var dec = t.charAt(dernier);
      var mil = dec === ',' ? '.' : ',';
      var morceaux = t.slice(0, dernier).split(mil);
      if (morceaux.slice(1).some(function (m) { return m.length !== 3; }) || t.slice(dernier + 1).indexOf(mil) !== -1) return invalide();
      texte = morceaux.join('') + '.' + t.slice(dernier + 1);
    } else if (nbPoints + nbVirgules > 1) {
      /* Même séparateur répété : séparateur de milliers (1,234,567 ou 1.234.567) */
      var sep = nbPoints ? '.' : ',';
      var parts = t.split(sep);
      if (parts[0].length < 1 || parts[0].length > 3 || parts.slice(1).some(function (m) { return m.length !== 3; })) return invalide();
      texte = parts.join('');
    } else {
      var apres = t.slice(dernier + 1);
      var avant = t.slice(0, dernier);
      texte = (avant === '' ? '0' : avant) + '.' + apres;
      if (apres.length === 3 && /^[1-9]\d{0,2}$/.test(avant)) {
        return { vide: false, v: Number(texte), ambigu: true, alternative: Number(avant + apres) };
      }
    }
    if (!/^\d+(\.\d*)?$/.test(texte)) return invalide();
    return { vide: false, v: Number(texte), ambigu: false, alternative: null };
  }

  function invalide() { return { vide: false, v: NaN, ambigu: false, alternative: null }; }

  return { lireNombre: lireNombre };
});
