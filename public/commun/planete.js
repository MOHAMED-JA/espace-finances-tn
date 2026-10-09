/*
 * Orbite — planète salaire en 3D (accueil, formulaire « Essayez avec votre salaire »).
 * Des particules dessinent le salaire net (le cœur) ; les cotisations et l'impôt forment deux anneaux dont la largeur
 * suit leur part du brut. La planète tourne seule, se fait pivoter au doigt et se recompose à chaque calcul.
 * Canvas 2D (perspective calculée à la main), en pause hors écran ; mouvement réduit : image fixe, sans rotation.
 */
(function (racine) {
  "use strict";
  var COUL = { net: [74, 222, 128], cnss: [126, 162, 255], impot: [245, 183, 10] };

  function creer(canvas, options) {
    var o = options || {}, doc = canvas.ownerDocument, win = doc.defaultView;
    var reduit = !!o.reduit, N = o.particules || 1700;
    var pts = [], i;
    for (i = 0; i < N; i++) pts.push({ u: Math.random(), v: Math.random(), r: Math.random(), a: Math.random() * 6.2832 });
    /* Parts du brut : cible (dernier calcul) et état affiché (lissé). */
    var cible = { net: 0.74, cnss: 0.1, impot: 0.16, echelle: 1 }, etat = { net: 0.74, cnss: 0.1, impot: 0.16, echelle: 1 };
    var rotY = 0.7, rotX = 0.38, vY = 0.0035, glisse = null, visible = true, aDessiner = true, g = null;

    function dimensionner() {
      var d = Math.min(2, win.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      var x = canvas.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
      g = { x: x, w: w, h: h }; aDessiner = true;
    }

    function dessiner(t) {
      if (!g) return;
      var lisse = reduit ? 1 : 0.07;
      ["net", "cnss", "impot", "echelle"].forEach(function (k) { etat[k] += (cible[k] - etat[k]) * lisse; });
      if (!glisse && !reduit) { rotY += vY; vY += (0.0035 - vY) * 0.02; }
      var x = g.x, w = g.w, h = g.h, cx = w / 2, cy = h / 2;
      var R = Math.min(w * 0.2, h * 0.36) * etat.echelle;
      x.clearRect(0, 0, w, h);
      var pNet = etat.net, pCnss = etat.cnss, pImp = Math.max(0.0001, 1 - pNet - pCnss);
      var cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(rotX), sX = Math.sin(rotX);
      var r1 = R * 1.42, l1 = R * 1.5 * pCnss + 3, r2 = r1 + l1 + R * 0.12, l2 = R * 1.5 * pImp + 3;
      var liste = new Array(N);
      for (var j = 0; j < N; j++) {
        var p = pts[j], X, Y, Z, c;
        if (p.u < pNet) {
          var ph = Math.acos(2 * p.v - 1), th = p.a + t * 0.04;
          X = R * Math.sin(ph) * Math.cos(th); Y = R * Math.cos(ph); Z = R * Math.sin(ph) * Math.sin(th); c = COUL.net;
        } else {
          var cnss = p.u < pNet + pCnss, rr = cnss ? r1 + p.r * l1 : r2 + p.r * l2, an = p.a + t * (cnss ? 0.2 : 0.12);
          X = rr * Math.cos(an); Z = rr * Math.sin(an); Y = (p.v - 0.5) * 3; c = cnss ? COUL.cnss : COUL.impot;
        }
        var x1 = X * cY - Z * sY, z1 = X * sY + Z * cY, y1 = Y * cX - z1 * sX, z2 = Y * sX + z1 * cX, s = 480 / (480 + z2);
        liste[j] = [cx + x1 * s, cy + y1 * s, z2, c, s];
      }
      liste.sort(function (a, b) { return b[2] - a[2]; });
      /* halo du cœur, puis particules en lumière additive */
      var halo = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5);
      halo.addColorStop(0, "rgba(74,222,128,.16)"); halo.addColorStop(1, "rgba(74,222,128,0)");
      x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, R * 1.5, 0, 6.2832); x.fill();
      x.globalCompositeOperation = "lighter";
      for (var k = 0; k < N; k++) {
        var q = liste[k], al = Math.max(0.1, Math.min(0.9, 0.7 - q[2] / (R * 5))), tl = 1.5 * q[4];
        x.fillStyle = "rgba(" + q[3][0] + "," + q[3][1] + "," + q[3][2] + "," + al.toFixed(2) + ")";
        x.fillRect(q[0], q[1], tl, tl);
      }
      x.globalCompositeOperation = "source-over";
    }

    function boucle(t) {
      win.requestAnimationFrame(boucle);
      if ((!visible || reduit) && !aDessiner) return;
      aDessiner = false;
      dessiner(t / 1000);
      /* mouvement réduit : quelques images pour atteindre la nouvelle forme, puis rien */
    }

    canvas.addEventListener("pointerdown", function (e) { glisse = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} });
    canvas.addEventListener("pointermove", function (e) {
      if (!glisse) return;
      var dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      rotY += dx * 0.008; vY = dx * 0.0006; rotX = Math.max(-0.15, Math.min(1.05, rotX + dy * 0.006));
      glisse = { x: e.clientX, y: e.clientY }; aDessiner = true;
    });
    function lacher() { glisse = null; }
    canvas.addEventListener("pointerup", lacher);
    canvas.addEventListener("pointercancel", lacher);
    win.addEventListener("resize", dimensionner);
    if ("IntersectionObserver" in win) new win.IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) aDessiner = true; }).observe(canvas);
    dimensionner();
    win.requestAnimationFrame(boucle);

    return {
      /* Montants mensuels : brut, net, cotisations, impôt (IRPP + CSS). */
      maj: function (m) {
        var brut = Math.max(1, m.brut || (m.net + m.cnss + m.impot));
        cible.net = Math.max(0.05, Math.min(0.95, m.net / brut));
        cible.cnss = Math.max(0.01, m.cnss / brut);
        /* la planète grossit doucement avec le net (racine, bornée) */
        cible.echelle = Math.max(0.78, Math.min(1.12, 0.78 + 0.34 * Math.sqrt(Math.min(m.net, 8000) / 8000)));
        aDessiner = true;
      }
    };
  }

  var API = { creer: creer };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.OrbitePlanete = API;
})(typeof self !== "undefined" ? self : this);
