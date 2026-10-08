/* Couleur de l'agence : palette dérivée d'une couleur principale (fonctions pures). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Theme = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function versRvb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function versHex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); }

  function versTsl(c) {
    var r = c[0] / 255, v = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, v, b), min = Math.min(r, v, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (v - b) / d + (v < b ? 6 : 0) : max === v ? (b - r) / d + 2 : (r - v) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function depuisTsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }

  function luminance(c) {
    var x = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
  }
  function contraste(a, b) { var la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  /* Palette : principale (lisible sur blanc, contraste ≥ 4,5), secondaire et tertiaire (teintes voisines pour
     les dégradés), claire (texte sur fond sombre). Renvoie null si la couleur est invalide. */
  function palette(hex) {
    var c = versRvb(hex);
    if (!c) return null;
    var hsl = versTsl(c);
    var h = hsl[0], s = Math.max(45, hsl[1]), l = Math.min(hsl[2], 50);
    var base = depuisTsl(h, s, l);
    while (contraste(base, [255, 255, 255]) < 4.5 && l > 10) { l -= 2; base = depuisTsl(h, s, l); }
    return {
      principale: versHex(base),
      secondaire: versHex(depuisTsl(h + 22, s, Math.min(l + 6, 55))),
      tertiaire: versHex(depuisTsl(h + 48, s, Math.min(l + 10, 58))),
      claire: versHex(depuisTsl(h, Math.min(s, 90), 78)),
      rvb: base.map(Math.round),
      contrasteBlanc: contraste(base, [255, 255, 255])
    };
  }

  return { palette: palette, versRvb: versRvb, contraste: contraste };
});
