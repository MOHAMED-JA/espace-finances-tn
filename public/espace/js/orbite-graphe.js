/*
 * Orbite — moteur commun des graphiques (maquette « Graphiques unifiés » validée le 12 oct. 2026).
 * Un seul style pour toutes les courbes et colonnes : palette --g1…--g4 (claire et sombre, validée pour le daltonisme),
 * grille fine, traits de 2 px, lavis léger, colonnes de 24 px au plus aux bouts arrondis, 2 px entre les segments,
 * bulle au survol ET au clavier (viseur sur les courbes, bulle par colonne), légende dès deux séries, phrase-résumé
 * pour les lecteurs d'écran, « Voir le tableau », tracé à la première apparition (sauf mouvement réduit),
 * nouveau rendu automatique quand la largeur change. Couleurs par classes (og-c1…og-c4, og-cn) : rien en style="".
 *
 *   OrbiteGraphe.lignes(zone, {
 *     series:  [{ nom, pts: [[x, y]…], c: 1-4 | "n", tirets, pointille, aire, marche }],
 *     bandes:  [{ nom, haut: [[x, y]…], bas: [[x, y]…], c, force: "large" | "etroite" }],
 *     zones:   [{ de, a, nom, ton: "ok" | "danger" }],  verticales: [{ x, lib }],  seuil: { y, lib },
 *     marqueurs: [{ x, y, lib, c }],  curseurX,  etiquetteFin: fn(y) | true,
 *     xmin, xmax, ymin, ymax, ticksX: [{ v, lib }] | fmtX, fmtY, fmtV, titreX: fn(x),
 *     zonesY: [{ de, a, ton, lib, classe }], legende: false, series[].classe,
 *     titre, resume, hauteur, tableau: false | { pas, colX },  surSurvol: fn(x | null)
 *   })
 *   OrbiteGraphe.colonnes(zone, { cats: [{ lib, titre, parts: [{ v, nom, c }] }], fmtY, fmtV, titre, resume, tableau })
 *
 * Node : require(".../orbite-graphe.js") expose les fonctions pures (graduations, indicesX, plusProche, chemin).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(null);
  else racine.OrbiteGraphe = fabrique(racine.document);
})(typeof self !== "undefined" ? self : this, function (doc) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  /* ---------- Fonctions pures ---------- */
  /* Graduations « rondes » (1, 2, 2,5, 5, 10 × 10ⁿ) couvrant [min, max], environ n intervalles. */
  function graduations(min, max, n) {
    if (!(max > min)) max = min + 1;
    var pas = (max - min) / (n || 4), p10 = Math.pow(10, Math.floor(Math.log(pas) / Math.LN10)), f = pas / p10;
    pas = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p10;
    var d = Math.floor(min / pas + 1e-9) * pas, out = [];
    for (var v = d; v <= max + pas * 0.5; v += pas) { out.push(Math.round(v * 1e6) / 1e6); if (v >= max - 1e-9) break; }
    if (out[out.length - 1] < max - 1e-9) out.push(Math.round((out[out.length - 1] + pas) * 1e6) / 1e6);
    return out;
  }
  /* Positions (en pixels, croissantes) → indices à étiqueter : au moins « ecart » px entre deux, la dernière gardée. */
  function indicesX(pos, ecart) {
    var garde = [], der = -1e9, e = ecart || 52;
    pos.forEach(function (p, i) { if (p - der >= e) { garde.push(i); der = p; } });
    var n = pos.length - 1;
    if (n >= 0 && garde[garde.length - 1] !== n) { if (pos[n] - pos[garde[garde.length - 1]] < e && garde.length > 1) garde.pop(); garde.push(n); }
    return garde;
  }
  /* Indice du point le plus proche de x dans une liste triée de points [[x, y]…]. */
  function plusProche(pts, x) {
    if (!pts.length) return -1;
    var lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (pts[m][0] < x) lo = m; else hi = m; }
    return Math.abs(pts[lo][0] - x) <= Math.abs(pts[hi][0] - x) ? lo : hi;
  }
  /* Escalier : indice de la dernière marche commencée en x. */
  function marcheA(pts, x) { var j = -1; for (var i = 0; i < pts.length && pts[i][0] <= x + 1e-9; i++) j = i; return j; }
  /* Tracé SVG ; « marche » : escalier (la valeur tient jusqu'au point suivant). */
  function chemin(pts, X, Y, marche) {
    var d = "";
    pts.forEach(function (p, i) {
      var x = X(p[0]).toFixed(1), y = Y(p[1]).toFixed(1);
      if (!i) d += "M" + x + " " + y;
      else if (marche) d += "H" + x + "V" + y;
      else d += "L" + x + " " + y;
    });
    return d;
  }
  var NF = typeof Intl !== "undefined" ? function (d) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: 0 }); } : null;
  function nb(v, d) { return NF ? NF(d).format(v).replace(/[  ]/g, " ") : String(Math.round(v)); }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return nb(v / 1e6, 1) + " M";
    if (a >= 1e3) return nb(v / 1e3, a >= 1e4 ? 0 : 1) + " k";
    return nb(v, a < 10 && v % 1 ? 1 : 0);
  }
  function dt(v) { return nb(Math.round(v), 0) + " DT"; }

  var PURES = { graduations: graduations, indicesX: indicesX, plusProche: plusProche, marcheA: marcheA, chemin: chemin, compact: compact };
  if (!doc) return PURES;

  /* ---------- Rendu ---------- */
  var reduit = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function mouvementReduit() { return reduit.matches || doc.documentElement.getAttribute("data-mouvement") === "reduit"; }
  function el(tag, attrs, parent, svg) {
    var e = svg === false ? doc.createElement(tag) : doc.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function html(tag, cls, txt, parent) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (parent) parent.appendChild(e); return e; }
  function cl(c) { return "og-c" + (c == null ? 1 : c); }
  var ID = 0;

  /* Nouveau rendu quand la largeur change ; tracé à la première apparition. */
  var suivi = window.ResizeObserver ? new ResizeObserver(function (entrees) {
    entrees.forEach(function (en) {
      var z = en.target, w = Math.round(en.contentRect.width);
      if (!z.__og || !w || Math.abs(w - (z.__og.w || 0)) < 8) return;
      clearTimeout(z.__og.t); z.__og.t = setTimeout(function () { if (z.__og) z.__og.rendre(); }, 120);
    });
  }) : null;
  var apparition = window.IntersectionObserver ? new IntersectionObserver(function (entrees) {
    entrees.forEach(function (en) {
      if (!en.isIntersecting) return;
      apparition.unobserve(en.target);
      en.target.classList.remove("og-attente"); en.target.classList.add("og-trace");
      setTimeout(function () { en.target.classList.remove("og-trace"); }, 1300);
    });
  }, { threshold: 0.25 }) : null;
  function installer(zone, rendre) {
    var nouveau = !zone.__og;
    zone.__og = zone.__og || {};
    zone.__og.rendre = rendre;
    zone.classList.add("og");
    if (nouveau && suivi) suivi.observe(zone);
    if (nouveau && apparition && !mouvementReduit()) { zone.classList.add("og-attente"); apparition.observe(zone); }
    rendre();
  }
  function largeur(zone) { return Math.max(280, Math.round(zone.clientWidth || (zone.parentNode && zone.parentNode.clientWidth) || 640)); }
  function hauteur(o, w) { return o.hauteur || (w < 520 ? 230 : 280); }

  function legende(items, type) {
    var ul = html("ul", "og-legende"); ul.setAttribute("role", "list");
    items.forEach(function (it) {
      var li = html("li", null, null, ul), k = html("span", "og-cle og-cle--" + (it.type || type) + " " + cl(it.c) + (it.tirets ? " og-tirets" : "") + (it.pointille ? " og-pointille" : "") + (it.ton ? " og-ton-" + it.ton : "") + (it.force ? " og-force-" + it.force : ""));
      k.setAttribute("aria-hidden", "true"); li.appendChild(k); li.appendChild(doc.createTextNode(it.nom));
    });
    return ul;
  }
  function bulle(zone) { var b = html("div", "og-bulle", null, zone); b.hidden = true; b.setAttribute("aria-hidden", "true"); return b; }
  function remplir(b, titre, lignes) {
    b.textContent = ""; html("div", "og-bulle__titre", titre, b);
    lignes.forEach(function (l) {
      var r = html("div", "og-bulle__ligne", null, b);
      html("span", "og-bulle__cle " + cl(l.c) + (l.tirets || l.pointille ? " og-tirets" : "") + (l.bande ? " og-bulle__cle--bande" : ""), null, r);
      html("span", "og-bulle__nom", l.nom, r); html("span", "og-bulle__val", l.val, r);
    });
  }
  function placer(b, zone, x, y, dessus) {
    var zw = zone.clientWidth, bw = b.offsetWidth, bh = b.offsetHeight, bx, by;
    if (dessus) { bx = Math.max(0, Math.min(zw - bw, x - bw / 2)); by = Math.max(0, y - bh - 10); }
    else { bx = x + 14; if (bx + bw > zw) bx = x - bw - 14; bx = Math.max(0, bx); by = Math.max(0, y - bh / 2); }
    b.style.left = Math.round(bx) + "px"; b.style.top = Math.round(by) + "px";
  }
  function tableau(zone, titre, entetes, lignes) {
    var d = html("details", "og-tableau", null, zone), s = html("summary", null, "Voir le tableau", d), t = html("table", null, null, d);
    var cap = html("caption", "cache", titre, t), thead = html("thead", null, null, t), tr = html("tr", null, null, thead);
    entetes.forEach(function (e, i) { var th = html("th", null, e, tr); th.scope = "col"; if (i) th.className = "nb"; });
    var tb = html("tbody", null, null, t);
    lignes.forEach(function (l) { var r = html("tr", null, null, tb); l.forEach(function (v, i) { var c = html(i ? "td" : "th", i ? "nb" : null, v, r); if (!i) c.scope = "row"; }); });
    void s; void cap;
    return d;
  }

  /* ---------- Courbes, aires, bandes ---------- */
  function lignes(zone, o) {
    installer(zone, function () { dessinerLignes(zone, o); });
    return { montrer: function (x) { if (zone.__og && zone.__og.montrer) zone.__og.montrer(x); } };
  }
  function dessinerLignes(zone, o) {
    var W = largeur(zone), H = hauteur(o, W), series = o.series || [], bandes = o.bandes || [];
    var xs = [], ys = [];
    series.forEach(function (s) { s.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    bandes.forEach(function (b) { b.haut.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); b.bas.forEach(function (p) { ys.push(p[1]); }); });
    (o.marqueurs || []).forEach(function (m) { ys.push(m.y); });
    if (o.seuil) ys.push(o.seuil.y);
    zone.textContent = "";
    if (!xs.length) return;
    var xmin = o.xmin != null ? o.xmin : Math.min.apply(null, xs), xmax = o.xmax != null ? o.xmax : Math.max.apply(null, xs);
    if (xmax <= xmin) xmax = xmin + 1;
    var ty = graduations(o.ymin != null ? o.ymin : Math.min(0, Math.min.apply(null, ys)), o.ymax != null ? o.ymax : Math.max.apply(null, ys), 4);
    var ymin = ty[0], ymax = ty[ty.length - 1], fmtY = o.fmtY || compact, fmtV = o.fmtV || dt;
    var fin = o.etiquetteFin ? 58 : 12, g = { l: 50, r: fin, t: 10, b: 28 };
    function X(v) { return g.l + (v - xmin) / (xmax - xmin) * (W - g.l - g.r); }
    function Y(v) { return H - g.b - (v - ymin) / (ymax - ymin) * (H - g.t - g.b); }
    ID += 1;
    var tid = "og-t" + ID;
    var svg = el("svg", { class: "og-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-labelledby": tid, tabindex: 0 });
    el("title", { id: tid }, svg).textContent = (o.titre || "Graphique") + (o.resume ? ". " + o.resume : "");
    (o.zones || []).forEach(function (z) { el("rect", { class: "og-zone og-ton-" + (z.ton || "ok"), x: X(z.de).toFixed(1), y: g.t, width: Math.max(1, X(z.a) - X(z.de)).toFixed(1), height: H - g.t - g.b }, svg); });
    /* Zone horizontale (entre deux valeurs), par exemple « refus probable » sous zéro. */
    (o.zonesY || []).forEach(function (z) {
      var ya = Y(Math.min(ymax, Math.max(ymin, z.a))), yd = Y(Math.min(ymax, Math.max(ymin, z.de)));
      el("rect", { class: "og-zone og-ton-" + (z.ton || "danger") + (z.classe ? " " + z.classe : ""), x: g.l, y: Math.min(ya, yd).toFixed(1), width: W - g.l - g.r, height: Math.abs(yd - ya).toFixed(1) }, svg);
      if (z.lib) el("text", { class: "og-seuil__lib", x: W - g.r - 6, y: (Math.max(ya, yd) - 6).toFixed(1), "text-anchor": "end" }, svg).textContent = z.lib;
    });
    var ax = el("g", { class: "og-axe" }, svg);
    ty.forEach(function (v) { el("line", { x1: g.l, x2: W - g.r, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1) }, ax); el("text", { x: g.l - 8, y: (Y(v) + 4).toFixed(1), "text-anchor": "end" }, ax).textContent = fmtY(v); });
    var tx = (o.ticksX || graduations(xmin, xmax, 5).map(function (v) { return { v: v, lib: (o.fmtX || compact)(v) }; })).filter(function (t) { return t.v >= xmin - 1e-9 && t.v <= xmax + 1e-9; });
    indicesX(tx.map(function (t) { return X(t.v); }), 48).forEach(function (i) {
      var t = tx[i], x = X(t.v), ancre = x < g.l + 14 ? "start" : x > W - g.r - 14 ? "end" : "middle";
      el("text", { x: x.toFixed(1), y: H - 8, "text-anchor": ancre }, ax).textContent = t.lib;
    });
    bandes.forEach(function (b) {
      var d = chemin(b.haut, X, Y) + b.bas.slice().reverse().map(function (p) { return "L" + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join("") + "Z";
      el("path", { class: "og-bande " + cl(b.c) + " og-force-" + (b.force || "large"), d: d }, svg);
    });
    var base = Y(Math.max(ymin, Math.min(0, ymax)));
    series.forEach(function (s) {
      if (!s.aire || !s.pts.length) return;
      el("path", { class: "og-aire " + cl(s.c), d: chemin(s.pts, X, Y, s.marche) + "L" + X(s.pts[s.pts.length - 1][0]).toFixed(1) + " " + base.toFixed(1) + "L" + X(s.pts[0][0]).toFixed(1) + " " + base.toFixed(1) + "Z" }, svg);
    });
    if (o.seuil) {
      el("line", { class: "og-seuil", x1: g.l, x2: W - g.r, y1: Y(o.seuil.y).toFixed(1), y2: Y(o.seuil.y).toFixed(1) }, svg);
      if (o.seuil.lib) el("text", { class: "og-seuil__lib", x: W - g.r - 4, y: (Y(o.seuil.y) - 6).toFixed(1), "text-anchor": "end" }, svg).textContent = o.seuil.lib;
    }
    (o.verticales || []).forEach(function (v) {
      el("line", { class: "og-verticale", x1: X(v.x).toFixed(1), x2: X(v.x).toFixed(1), y1: g.t, y2: H - g.b }, svg);
      if (v.lib) el("text", { class: "og-verticale__lib", x: (X(v.x) + (X(v.x) > W - 90 ? -6 : 6)).toFixed(1), y: g.t + 12, "text-anchor": X(v.x) > W - 90 ? "end" : "start" }, svg).textContent = v.lib;
    });
    series.forEach(function (s) {
      if (!s.pts.length) return;
      el("path", { class: "og-ligne og-trace-chemin " + cl(s.c) + (s.tirets ? " og-tirets" : "") + (s.pointille ? " og-pointille" : "") + (s.classe ? " " + s.classe : ""), pathLength: 1, d: chemin(s.pts, X, Y, s.marche) }, svg);
    });
    (o.marqueurs || []).forEach(function (m) {
      var c = el("circle", { class: "og-marqueur " + cl(m.c != null ? m.c : "ok"), cx: X(m.x).toFixed(1), cy: Y(m.y).toFixed(1), r: 5 }, svg);
      if (m.lib) el("title", {}, c).textContent = m.lib;
      if (m.texte) el("text", { class: "og-marqueur__txt", x: X(m.x).toFixed(1), y: (Y(m.y) - 11).toFixed(1), "text-anchor": "middle" }, svg).textContent = m.texte;
    });
    if (o.curseurX != null) el("line", { class: "og-curseur", x1: X(o.curseurX).toFixed(1), x2: X(o.curseurX).toFixed(1), y1: g.t, y2: H - g.b }, svg);
    if (o.etiquetteFin && series[0] && series[0].pts.length) {
      var s0 = series[0], p = s0.pts[s0.pts.length - 1];
      el("circle", { class: "og-point " + cl(s0.c), cx: X(p[0]).toFixed(1), cy: Y(p[1]).toFixed(1), r: 4.5 }, svg);
      el("text", { class: "og-etiquette", x: (X(p[0]) + 9).toFixed(1), y: (Y(p[1]) + 4).toFixed(1) }, svg).textContent = typeof o.etiquetteFin === "function" ? o.etiquetteFin(p[1]) : fmtV(p[1]);
    }
    /* Viseur et points mobiles. */
    var viseur = el("line", { class: "og-viseur", y1: g.t, y2: H - g.b, visibility: "hidden" }, svg);
    var mob = series.map(function (s) { return el("circle", { class: "og-point " + cl(s.c), r: 4.5, visibility: "hidden" }, svg); });
    /* Abscisses de référence pour le viseur : celles de la série la plus longue. */
    var ref = series.concat(bandes.map(function (b) { return { pts: b.haut }; })).reduce(function (a, s) { return s.pts.length > a.length ? s.pts : a; }, []);

    var items = [];
    series.forEach(function (s) { if (s.nom) items.push({ nom: s.nom, c: s.c, tirets: s.tirets, pointille: s.pointille, type: "ligne" }); });
    bandes.forEach(function (b) { if (b.nom) items.push({ nom: b.nom, c: b.c, force: b.force, type: "bande" }); });
    (o.zones || []).forEach(function (z) { if (z.nom) items.push({ nom: z.nom, ton: z.ton || "ok", type: "zone" }); });
    if ((o.marqueurs || []).length && o.nomMarqueurs) items.push({ nom: o.nomMarqueurs, c: "ok", type: "marqueur" });
    if (items.length >= 2 && o.legende !== false) zone.appendChild(legende(items));
    var cadre = html("div", "og-cadre", null, zone); cadre.appendChild(svg);
    var b = bulle(cadre);
    zone.__og.w = W;
    function montrer(i) {
      if (i < 0 || !ref[i]) return;
      var x = ref[i][0], lignesB = [], hautY = H;
      viseur.setAttribute("x1", X(x).toFixed(1)); viseur.setAttribute("x2", X(x).toFixed(1)); viseur.setAttribute("visibility", "visible");
      series.forEach(function (s, k) {
        var dedans = s.pts.length && x >= s.pts[0][0] - 1e-9 && x <= s.pts[s.pts.length - 1][0] + 1e-9, j, px;
        /* Escalier : la marche en cours sous le viseur ; sinon le point le plus proche (à un pas près). */
        if (s.marche) { j = dedans ? marcheA(s.pts, x) : -1; px = x; }
        else { j = plusProche(s.pts, x); px = j < 0 ? x : s.pts[j][0]; if (j >= 0 && Math.abs(px - x) > (xmax - xmin) / Math.max(12, ref.length) * 1.01) j = -1; }
        if (j < 0 || !dedans) { mob[k].setAttribute("visibility", "hidden"); return; }
        var y = s.pts[j][1]; mob[k].setAttribute("cx", X(px).toFixed(1)); mob[k].setAttribute("cy", Y(y).toFixed(1)); mob[k].setAttribute("visibility", "visible");
        hautY = Math.min(hautY, Y(y)); if (s.nom) lignesB.push({ nom: s.nom, c: s.c, tirets: s.tirets || s.pointille, val: fmtV(y) });
      });
      bandes.forEach(function (bd) {
        var j = plusProche(bd.haut, x); if (j < 0 || !bd.nom) return;
        var lo = bd.bas[Math.min(j, bd.bas.length - 1)][1], hi = bd.haut[j][1];
        hautY = Math.min(hautY, Y(hi)); lignesB.push({ nom: bd.nom, c: bd.c, bande: true, val: fmtV(lo) + " à " + fmtV(hi) });
      });
      remplir(b, o.titreX ? o.titreX(x) : (o.fmtX || compact)(x), lignesB); b.hidden = !lignesB.length;
      var k2 = cadre.clientWidth / W; placer(b, cadre, X(x) * k2, hautY * k2);
      if (o.surSurvol) o.surSurvol(x, i);
    }
    function cacher() { viseur.setAttribute("visibility", "hidden"); mob.forEach(function (m) { m.setAttribute("visibility", "hidden"); }); b.hidden = true; if (o.surSurvol) o.surSurvol(null); }
    var cur = ref.length - 1;
    svg.addEventListener("pointermove", function (e) { var r = svg.getBoundingClientRect(), x = xmin + ((e.clientX - r.left) * W / r.width - g.l) / (W - g.l - g.r) * (xmax - xmin); cur = plusProche(ref, x); montrer(cur); });
    svg.addEventListener("pointerleave", cacher);
    svg.addEventListener("focus", function () { montrer(cur); });
    svg.addEventListener("blur", cacher);
    svg.addEventListener("keydown", function (e) {
      var pas = e.shiftKey ? Math.max(1, Math.round(ref.length / 10)) : 1;
      if (e.key === "ArrowLeft") cur = Math.max(0, cur - pas); else if (e.key === "ArrowRight") cur = Math.min(ref.length - 1, cur + pas);
      else if (e.key === "Home") cur = 0; else if (e.key === "End") cur = ref.length - 1; else return;
      e.preventDefault(); montrer(cur);
    });
    zone.__og.montrer = function (x) { cur = plusProche(ref, x); montrer(cur); };
    if (o.tableau !== false && series.length) {
      var t = o.tableau || {}, cols = series.filter(function (s) { return s.nom; }), pasT = t.pas || Math.max(1, Math.ceil(ref.length / 24)), lignesT = [];
      for (var i = 0; i < ref.length; i += pasT) {
        var x = ref[i][0];
        lignesT.push([(t.colX || o.titreX || o.fmtX || compact)(x)].concat(cols.map(function (s) { var j = plusProche(s.pts, x); return j < 0 || x < s.pts[0][0] || x > s.pts[s.pts.length - 1][0] ? "—" : fmtV(s.pts[j][1]); })));
      }
      if ((ref.length - 1) % pasT) { var xl = ref[ref.length - 1][0]; lignesT.push([(t.colX || o.titreX || o.fmtX || compact)(xl)].concat(cols.map(function (s) { var j = plusProche(s.pts, xl); return j < 0 || xl > s.pts[s.pts.length - 1][0] ? "—" : fmtV(s.pts[j][1]); }))); }
      tableau(zone, o.titre || "Graphique", [t.entete || ""].concat(cols.map(function (s) { return s.nom; })), lignesT);
    }
  }

  /* ---------- Colonnes empilées ---------- */
  function colonnes(zone, o) {
    installer(zone, function () { dessinerColonnes(zone, o); });
    return { montrer: function (i) { if (zone.__og && zone.__og.montrer) zone.__og.montrer(i); } };
  }
  function dessinerColonnes(zone, o) {
    var W = largeur(zone), H = hauteur(o, W), cats = o.cats || [], n = cats.length, fmtY = o.fmtY || compact, fmtV = o.fmtV || dt;
    zone.textContent = "";
    if (!n) return;
    var tot = cats.map(function (c) { return c.parts.reduce(function (s, p) { return s + Math.max(0, p.v || 0); }, 0); });
    var ty = graduations(0, Math.max.apply(null, tot) || 1, 4), ymax = ty[ty.length - 1], g = { l: 50, r: 8, t: 10, b: 28 };
    function Y(v) { return H - g.b - v / ymax * (H - g.t - g.b); }
    var bande = (W - g.l - g.r) / n, bw = Math.max(3, Math.min(24, bande * 0.62));
    ID += 1;
    var tid = "og-t" + ID;
    var svg = el("svg", { class: "og-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-labelledby": tid, tabindex: 0 });
    el("title", { id: tid }, svg).textContent = (o.titre || "Graphique") + (o.resume ? ". " + o.resume : "");
    var ax = el("g", { class: "og-axe" }, svg);
    ty.forEach(function (v) { el("line", { x1: g.l, x2: W - g.r, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1) }, ax); el("text", { x: g.l - 8, y: (Y(v) + 4).toFixed(1), "text-anchor": "end" }, ax).textContent = fmtY(v); });
    function CX(i) { return g.l + bande * (i + 0.5); }
    indicesX(cats.map(function (c, i) { return CX(i); }), 44).forEach(function (i) { el("text", { x: CX(i).toFixed(1), y: H - 8, "text-anchor": "middle" }, ax).textContent = cats[i].lib; });
    var grp = el("g", { class: "og-colonnes" }, svg), cols = [];
    cats.forEach(function (c, i) {
      var cg = el("g", { class: "og-colonne" }, grp), y0 = Y(0), x0 = CX(i) - bw / 2, vis = c.parts.filter(function (p) { return p.v > 0; });
      vis.forEach(function (p, k) {
        var hgt = (Y(0) - Y(p.v)) - (k ? 2 : 0), y = y0 - (Y(0) - Y(p.v));
        if (hgt <= 0.4) { y0 = y; return; }
        var bottom = y + (Y(0) - Y(p.v)) - (k ? 2 : 0);
        if (k === vis.length - 1) {
          var r = Math.min(4, hgt / 2);
          el("path", { class: "og-barre " + cl(p.c), d: "M" + x0.toFixed(1) + " " + bottom.toFixed(1) + "V" + (y + r).toFixed(1) + "Q" + x0.toFixed(1) + " " + y.toFixed(1) + " " + (x0 + r).toFixed(1) + " " + y.toFixed(1) + "H" + (x0 + bw - r).toFixed(1) + "Q" + (x0 + bw).toFixed(1) + " " + y.toFixed(1) + " " + (x0 + bw).toFixed(1) + " " + (y + r).toFixed(1) + "V" + bottom.toFixed(1) + "Z" }, cg);
        } else el("rect", { class: "og-barre " + cl(p.c), x: x0.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: hgt.toFixed(1) }, cg);
        y0 = y;
      });
      el("rect", { class: "og-cible", x: (CX(i) - bande / 2).toFixed(1), y: g.t, width: bande.toFixed(1), height: H - g.t - g.b }, cg);
      cols.push({ g: cg, top: Y(tot[i]) });
      cg.addEventListener("pointerenter", function () { cur = i; montrer(i); });
      cg.addEventListener("pointerleave", cacher);
    });
    var noms = [], vus = {};
    cats.forEach(function (c) { c.parts.forEach(function (p) { if (p.nom && !vus[p.nom] && p.v > 0) { vus[p.nom] = 1; noms.push({ nom: p.nom, c: p.c, type: "barre" }); } }); });
    if (noms.length >= 2) zone.appendChild(legende(noms));
    var cadre = html("div", "og-cadre", null, zone); cadre.appendChild(svg);
    var b = bulle(cadre), cur = 0;
    zone.__og.w = W;
    function montrer(i) {
      cols.forEach(function (c, k) { c.g.classList.toggle("og-actif", k === i); }); grp.classList.add("og-survol");
      var c = cats[i];
      remplir(b, (c.titre || c.lib) + " · " + fmtV(tot[i]), c.parts.filter(function (p) { return p.v > 0; }).map(function (p) { return { nom: p.nom, c: p.c, val: fmtV(p.v) }; }).reverse());
      b.hidden = false;
      var k2 = cadre.clientWidth / W; placer(b, cadre, CX(i) * k2, cols[i].top * k2, true);
    }
    function cacher() { cols.forEach(function (c) { c.g.classList.remove("og-actif"); }); grp.classList.remove("og-survol"); b.hidden = true; }
    svg.addEventListener("focus", function () { montrer(cur); }); svg.addEventListener("blur", cacher);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") cur = Math.max(0, cur - 1); else if (e.key === "ArrowRight") cur = Math.min(n - 1, cur + 1);
      else if (e.key === "Home") cur = 0; else if (e.key === "End") cur = n - 1; else return;
      e.preventDefault(); montrer(cur);
    });
    zone.__og.montrer = function (i) { cur = Math.max(0, Math.min(n - 1, i)); montrer(cur); };
    if (o.tableau !== false) {
      var tn = []; cats.forEach(function (c) { c.parts.forEach(function (p) { if (p.nom && tn.indexOf(p.nom) === -1) tn.push(p.nom); }); });
      tableau(zone, o.titre || "Graphique", [(o.tableau && o.tableau.entete) || ""].concat(tn, ["Total"]), cats.map(function (c, i) {
        return [c.titre || c.lib].concat(tn.map(function (nm) { var p = c.parts.filter(function (x) { return x.nom === nm; })[0]; return p ? fmtV(p.v) : "—"; }), [fmtV(tot[i])]);
      }));
    }
  }

  function oublier(zone) { if (!zone || !zone.__og) return; if (suivi) suivi.unobserve(zone); zone.__og = null; }

  var API = { lignes: lignes, colonnes: colonnes, oublier: oublier, compact: compact, dt: dt };
  for (var k in PURES) API[k] = PURES[k];
  return API;
});
