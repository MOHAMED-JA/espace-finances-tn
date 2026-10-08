/* Palette de commandes (fonctions pures) : recherche approximative sans accents et lecture des saisies
   directes (« 60000 », « av 500 », « cea 200 », « 20 ans », « 2 enfants »). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Commandes = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normaliser(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim(); }

  /* Score de correspondance : 0 = aucune ; plus haut = meilleur */
  function score(cible, requete) {
    var c = normaliser(cible), q = normaliser(requete);
    if (!q) return 1;
    if (c === q) return 1000;
    if (c.indexOf(q) === 0) return 800 - c.length;
    var mots = c.split(' ');
    if (mots.some(function (m) { return m.indexOf(q) === 0; })) return 600 - c.length;
    var idx = c.indexOf(q);
    if (idx > 0) return 400 - idx;
    /* Tous les mots de la requête présents */
    var qm = q.split(' ');
    if (qm.length > 1 && qm.every(function (m) { return c.indexOf(m) !== -1; })) return 300 - c.length;
    /* Sous-séquence */
    var j = 0, trous = 0, dernier = -1;
    for (var i = 0; i < c.length && j < q.length; i++) {
      if (c.charAt(i) === q.charAt(j)) { if (dernier >= 0 && i - dernier > 1) trous++; dernier = i; j++; }
    }
    return j === q.length && q.length >= 2 ? Math.max(1, 150 - trous * 10 - c.length) : 0;
  }

  /* liste = [{ id, libelle, motsCles }] → éléments triés par pertinence */
  function chercher(liste, requete) {
    return liste.map(function (x, i) {
      var s = Math.max(score(x.libelle, requete), x.motsCles ? score(x.motsCles, requete) * 0.9 : 0);
      return { x: x, s: s, i: i };
    }).filter(function (r) { return r.s > 0; }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (r) { return r.x; });
  }

  function nombre(s) {
    var t = s.replace(/[\s ]/g, '');
    var k = /k$/i.test(t);
    t = t.replace(/k$/i, '');
    if (/,\d{1,3}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    var v = parseFloat(t);
    return isFinite(v) ? v * (k ? 1000 : 1) : null;
  }
  var NB = '(\\d[\\d\\s.,]*k?)';

  /* Saisie directe : renvoie [{ champ, valeur }] (vide si la requête n'est pas une saisie) */
  function interpreter(requete) {
    var q = normaliser(requete);
    var m, r = [];
    if ((m = new RegExp('^(?:av|assurance vie|versement|verser)\\s*:?\\s*' + NB + '(?:\\s*(?:tnd|dt))?(?:\\s*(?:par mois|/mois|mois))?$').exec(q)) ||
        (m = new RegExp('^' + NB + '\\s*(?:tnd|dt)?\\s*(?:par mois|/mois)$').exec(q))) r.push({ champ: 'versement', valeur: nombre(m[1]) });
    else if ((m = new RegExp('^cea\\s*:?\\s*' + NB + '(?:\\s*(?:tnd|dt))?$').exec(q))) r.push({ champ: 'versementCea', valeur: nombre(m[1]) });
    else if ((m = /^(?:duree\s*:?\s*)?(\d{1,2})\s*ans?$/.exec(q)) || (m = /^duree\s*:?\s*(\d{1,2})$/.exec(q))) r.push({ champ: 'duree', valeur: parseInt(m[1], 10) });
    else if ((m = /^(\d{1,2})\s*enfants?$/.exec(q)) || (m = /^enfants?\s*:?\s*(\d{1,2})$/.exec(q))) r.push({ champ: 'enfants', valeur: parseInt(m[1], 10) });
    else if ((m = new RegExp('^(?:revenu|salaire)?\\s*:?\\s*' + NB + '(?:\\s*(?:tnd|dt))?$').exec(q)) && /\d/.test(q)) r.push({ champ: 'revenu', valeur: nombre(m[1]) });
    return r.filter(function (x) { return x.valeur != null && x.valeur >= 0; });
  }

  return { normaliser: normaliser, score: score, chercher: chercher, interpreter: interpreter };
});
