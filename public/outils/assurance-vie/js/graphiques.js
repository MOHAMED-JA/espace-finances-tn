/* Graphiques SVG sans dépendance : chaque fonction renvoie une chaîne SVG (couleurs par variables CSS). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Graphiques = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var L = 640, H = 260, MG = { g: 62, d: 16, h: 16, b: 34 };

  function arrondi(v) { return Math.round(v * 10) / 10; }

  function gabarit(xMax, yMax) {
    var w = L - MG.g - MG.d, h = H - MG.h - MG.b;
    return {
      x: function (v) { return arrondi(MG.g + (xMax > 0 ? v / xMax : 0) * w); },
      y: function (v) { return arrondi(MG.h + h - (yMax > 0 ? v / yMax : 0) * h); }
    };
  }

  function fmtCourt(v) {
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (v >= 1e3) return Math.round(v / 1e3) + ' k';
    return String(Math.round(v));
  }

  /* entier = true : graduations horizontales sur des valeurs entières (années) */
  function axes(g, xMax, yMax, xLibelle, entier) {
    var s = '';
    for (var i = 0; i <= 4; i++) {
      var vy = yMax * i / 4;
      s += '<line x1="' + MG.g + '" x2="' + (L - MG.d) + '" y1="' + g.y(vy) + '" y2="' + g.y(vy) + '" class="g-grille"/>';
      s += '<text x="' + (MG.g - 8) + '" y="' + (g.y(vy) + 4) + '" text-anchor="end" class="g-txt">' + fmtCourt(vy) + '</text>';
    }
    for (var j = 0; j <= 4; j++) {
      var vx = entier ? Math.round(xMax * j / 4) : xMax * j / 4;
      s += '<text x="' + g.x(vx) + '" y="' + (H - MG.b + 18) + '" text-anchor="middle" class="g-txt">' + fmtCourt(vx) + '</text>';
    }
    return s + '<text x="' + (MG.g + (L - MG.g - MG.d) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="g-txt">' + xLibelle + '</text>';
  }

  function chemin(points, g) {
    return points.map(function (p, i) { return (i ? 'L' : 'M') + g.x(p[0]) + ' ' + g.y(p[1]); }).join(' ');
  }

  function libelles(txt, defauts) {
    var r = {};
    Object.keys(defauts).forEach(function (k) { r[k] = txt && txt[k] ? echapper(txt[k]) : defauts[k]; });
    return r;
  }
  function echapper(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* Économie d'impôt en fonction du montant investi par an.
     donnees = { points: [[montant, economie]…], optimal, courant } ; txt = libellés traduits (facultatif) */
  function courbeEconomie(donnees, txt) {
    var lb = libelles(txt, { aria: 'Courbe de l\'économie d\'impôt selon le montant investi par an', x: 'Montant investi par an (TND)', optimal: 'Optimal' });
    var pts = donnees.points;
    var xMax = pts[pts.length - 1][0] || 1;
    var yMax = Math.max.apply(null, pts.map(function (p) { return p[1]; })) || 1;
    var g = gabarit(xMax, yMax);
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" class="graphique" role="img" aria-label="' + lb.aria + '" data-xmax="' + xMax + '" data-ymax="' + yMax + '">';
    s += axes(g, xMax, yMax, lb.x);
    s += '<path d="' + chemin(pts, g) + ' L' + g.x(xMax) + ' ' + g.y(0) + ' L' + g.x(0) + ' ' + g.y(0) + 'Z" class="g-aire"/>';
    s += '<path d="' + chemin(pts, g) + '" class="g-ligne g-l1 g-trace" pathLength="1"/>';
    if (donnees.optimal > 0) {
      s += '<line x1="' + g.x(donnees.optimal) + '" x2="' + g.x(donnees.optimal) + '" y1="' + g.y(0) + '" y2="' + MG.h + '" class="g-repere"/>';
      s += '<text x="' + Math.min(g.x(donnees.optimal) + 6, L - 70) + '" y="' + (MG.h + 12) + '" class="g-txt g-fort">' + lb.optimal + '</text>';
    }
    if (donnees.courant > 0) {
      var ec = donnees.economieCourante;
      s += '<circle cx="' + g.x(Math.min(donnees.courant, xMax)) + '" cy="' + g.y(ec) + '" r="5" class="g-point"/>';
    }
    return s + '</svg>';
  }

  /* Capital constitué par année pour les trois scénarios, avec les versements cumulés.
     donnees = { prudent, median, dynamique } (résultats de Projection.scenarios) ;
     txt = libellés traduits ; reel = true ajoute le capital médian en dinars constants */
  function courbeCapital(donnees, txt, reel) {
    var lb = libelles(txt, { aria: 'Capital constitué par année selon trois scénarios de rendement', x: 'Années' });
    var ann = donnees.median.annees;
    var xMax = ann[ann.length - 1].annee || 1;
    /* Échelle : plus haute valeur de toutes les séries (avec des retraits, le maximum peut précéder le terme) */
    var yMax = Math.max.apply(null, [donnees.prudent, donnees.median, donnees.dynamique].reduce(function (t, p) {
      return t.concat(p.annees.map(function (a) { return Math.max(a.capital, a.verse); }));
    }, [0])) || 1;
    var g = gabarit(xMax, yMax);
    function serie(proj, cle) { return proj.annees.map(function (a) { return [a.annee, a[cle]]; }); }
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" class="graphique" role="img" aria-label="' + lb.aria + '" data-xmax="' + xMax + '" data-ymax="' + yMax + '">';
    s += axes(g, xMax, yMax, lb.x, true);
    s += '<path d="' + chemin(serie(donnees.median, 'verse'), g) + '" class="g-ligne g-verse"/>';
    s += '<path d="' + chemin(serie(donnees.prudent, 'capital'), g) + '" class="g-ligne g-l3 g-trace" pathLength="1"/>';
    s += '<path d="' + chemin(serie(donnees.median, 'capital'), g) + '" class="g-ligne g-l1 g-trace" pathLength="1"/>';
    s += '<path d="' + chemin(serie(donnees.dynamique, 'capital'), g) + '" class="g-ligne g-l2 g-trace" pathLength="1"/>';
    if (reel) s += '<path d="' + chemin(serie(donnees.median, 'capitalReel'), g) + '" class="g-ligne g-reel"/>';
    return s + '</svg>';
  }

  /* Éventail Monte-Carlo : bandes 10–90 % et 25–75 %, médiane, versements cumulés, objectif éventuel.
     mc = MonteCarlo.simuler ; verses = versements cumulés par année ; txt = libellés traduits */
  function eventail(mc, verses, txt) {
    var lb = libelles(txt, { aria: 'Éventail des capitaux possibles selon 5 000 trajectoires de marché', x: 'Années', objectif: 'Objectif' });
    var n = mc.annees.length - 1, xMax = n || 1;
    var yMax = Math.max(mc.centiles.p90[n], Math.max.apply(null, mc.centiles.p90), verses[verses.length - 1], mc.objectif || 0) || 1;
    var g = gabarit(xMax, yMax);
    function bande(haut, bas) {
      var d = haut.map(function (v, i) { return (i ? 'L' : 'M') + g.x(i) + ' ' + g.y(v); }).join(' ');
      for (var i = bas.length - 1; i >= 0; i--) d += ' L' + g.x(i) + ' ' + g.y(bas[i]);
      return d + 'Z';
    }
    function ligne(v) { return v.map(function (y, i) { return (i ? 'L' : 'M') + g.x(i) + ' ' + g.y(y); }).join(' '); }
    var s = '<svg viewBox="0 0 ' + L + ' ' + H + '" class="graphique" role="img" aria-label="' + lb.aria + '" data-xmax="' + xMax + '" data-ymax="' + yMax + '">';
    s += axes(g, xMax, yMax, lb.x, true);
    s += '<path d="' + bande(mc.centiles.p90, mc.centiles.p10) + '" class="g-bande1"/>';
    s += '<path d="' + bande(mc.centiles.p75, mc.centiles.p25) + '" class="g-bande2"/>';
    s += '<path d="' + ligne(verses) + '" class="g-ligne g-verse"/>';
    s += '<path d="' + ligne(mc.centiles.p50) + '" class="g-ligne g-l1 g-trace" pathLength="1"/>';
    if (mc.objectif > 0) {
      s += '<line x1="' + g.x(0) + '" x2="' + g.x(xMax) + '" y1="' + g.y(mc.objectif) + '" y2="' + g.y(mc.objectif) + '" class="g-repere"/>';
      s += '<text x="' + (MG.g + 6) + '" y="' + (g.y(mc.objectif) - 6) + '" class="g-txt g-fort">' + lb.objectif + '</text>';
    }
    return s + '</svg>';
  }

  return { courbeEconomie: courbeEconomie, courbeCapital: courbeCapital, eventail: eventail, dimensions: { L: L, H: H, MG: MG } };
});
