/* Export tableur : CSV (séparateur « ; », virgule décimale, BOM UTF-8) que Excel ouvre directement. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.ExportTableur = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOM = '﻿';

  function cellule(v) {
    if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000).replace('.', ',');
    var t = String(v);
    /* Neutralise l'injection de formules (=, +, -, @ en début de texte) */
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function csv(lignes) { return BOM + lignes.map(function (l) { return l.map(cellule).join(';'); }).join('\r\n') + '\r\n'; }

  /* colonnes = [[libellé, clé du résumé]…] ; enregistrements = portefeuille */
  function portefeuille(enregistrements, colonnes) {
    var tete = [['Date', 'Client', 'Référence'].concat(colonnes.map(function (c) { return c[0]; }))];
    return csv(tete.concat(enregistrements.map(function (e) {
      return [e.date, e.client || '', e.ref || ''].concat(colonnes.map(function (c) { return e.resume[c[1]]; }));
    })));
  }

  /* Détail annuel d'une projection (scénario médian) */
  function projectionAnnuelle(annees, entetes) {
    return csv([entetes].concat(annees.map(function (a) { return [a.annee, a.verse, a.capital, a.capitalReel]; })));
  }

  return { csv: csv, portefeuille: portefeuille, projectionAnnuelle: projectionAnnuelle };
});
