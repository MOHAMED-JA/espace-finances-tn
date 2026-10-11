/*
 * Orbite — scène de la page de connexion : ciel étoilé (léger relief selon la souris), planète salaire en particules,
 * satellites Crédit, Épargne et Impôt sur des orbites inclinées (traînées, étiquettes), rotation au doigt ou à la souris.
 * window.OrbiteConnexion.decoller(prenom) → Promise : transition de connexion réussie (la planète grandit, éclat,
 * « Bienvenue »), résolue au bout de ~0,85 s (tout de suite si l'appareil demande moins de mouvement).
 * Canvas 2D sans bibliothèque ; pause onglet caché ou hors écran ; mouvement réduit : image fixe.
 * Couleurs lues dans les variables CSS (--c-net, --c-credit, --c-epargne, --c-impot, --c-etoile), selon le thème.
 */
(function () {
  "use strict";
  var doc = document, win = window;
  var ciel = doc.getElementById("ciel"), cv = doc.getElementById("planete-connexion");
  var mq = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var reduit = mq.matches;
  if (!ciel || !cv || !ciel.getContext) { win.OrbiteConnexion = { decoller: function () { return Promise.resolve(); } }; return; }

  var C = {};
  function hexa(v, defaut) {
    var h = String(v || "").trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(h)) return defaut;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(",");
  }
  function couleurs() {
    var s = getComputedStyle(doc.documentElement);
    C = {
      net: hexa(s.getPropertyValue("--c-net"), "74,222,128"), credit: hexa(s.getPropertyValue("--c-credit"), "126,162,255"),
      epargne: hexa(s.getPropertyValue("--c-epargne"), "183,148,246"), impot: hexa(s.getPropertyValue("--c-impot"), "245,183,10"),
      etoile: hexa(s.getPropertyValue("--c-etoile"), "220,230,255"), sombre: doc.documentElement.getAttribute("data-theme") !== "light"
    };
    aDessiner = true;
  }

  /* ---------- Ciel ---------- */
  var xe = ciel.getContext("2d"), etoiles = [], souris = { x: 0, y: 0 }, lisse = { x: 0, y: 0 };
  function tailleCiel() {
    var d = Math.min(2, win.devicePixelRatio || 1), w = win.innerWidth, h = win.innerHeight;
    ciel.width = Math.round(w * d); ciel.height = Math.round(h * d);
    xe.setTransform(d, 0, 0, d, 0, 0);
    etoiles = [];
    var n = Math.min(420, Math.round(w * h / 5200));
    for (var i = 0; i < n; i++) etoiles.push({ x: Math.random() * w, y: Math.random() * h, z: Math.random(), p: Math.random() * 6.28 });
    aDessiner = true;
  }

  /* ---------- Planète ---------- */
  var x = cv.getContext("2d"), W = 0, H = 0, petit = win.innerWidth < 640;
  var N = petit ? 900 : 1500, pts = [];
  for (var i = 0; i < N; i++) pts.push({ u: Math.random(), v: Math.random(), a: Math.random() * 6.2832, r: Math.random() });
  var SAT = [{ r: 1.75, inc: 0.45, v: 0.32, ph: 0, c: "credit" }, { r: 2.25, inc: -0.3, v: 0.22, ph: 2.1, c: "epargne" }, { r: 2.75, inc: 0.18, v: 0.15, ph: 4.2, c: "impot" }];
  var traines = SAT.map(function () { return []; });
  var etiquettes = [].slice.call(doc.querySelectorAll("[data-sat]"));
  var rotY = 0.6, rotX = 0.32, vY = 0.004, glisse = null, zoom = 1, cibleZoom = 1, visible = true, aDessiner = true, debut = performance.now();
  function taillePlanete() {
    var d = Math.min(2, win.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    x.setTransform(d, 0, 0, d, 0, 0);
    aDessiner = true;
  }
  function projeter(X, Y, Z, cx, cy) {
    var ax = rotX + lisse.y * 0.3, cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(ax), sX = Math.sin(ax);
    var x1 = X * cY - Z * sY, z1 = X * sY + Z * cY, y1 = Y * cX - z1 * sX, z2 = Y * sX + z1 * cX, s = 520 / (520 + z2);
    return [cx + x1 * s, cy + y1 * s, z2, s];
  }

  function dessiner(t) {
    lisse.x += (souris.x - lisse.x) * (reduit ? 1 : 0.05);
    lisse.y += (souris.y - lisse.y) * (reduit ? 1 : 0.05);
    /* étoiles qui scintillent */
    var w = win.innerWidth, h = win.innerHeight;
    xe.clearRect(0, 0, w, h);
    for (var k = 0; k < etoiles.length; k++) {
      var e = etoiles[k], sc = reduit ? 0.8 : 0.45 + 0.55 * Math.sin(t * (0.6 + e.z) + e.p);
      xe.fillStyle = "rgba(" + C.etoile + "," + ((C.sombre ? 0.25 + 0.6 * e.z : 0.14 + 0.28 * e.z) * sc).toFixed(3) + ")";
      var tl = 0.6 + e.z * 1.4;
      xe.fillRect(e.x - lisse.x * 30 * e.z, e.y - lisse.y * 30 * e.z, tl, tl);
    }
    if (!W || !H) return;
    if (!glisse && !reduit) { rotY += vY; vY += (0.004 - vY) * 0.02; }
    zoom += (cibleZoom - zoom) * (reduit ? 1 : 0.08);
    var cx = W / 2 + lisse.x * 18, cy = H / 2 + lisse.y * 12, R = Math.min(W, H) * 0.18 * zoom, rh = Math.min(R * 2.2, Math.min(W, H) / 2);
    x.clearRect(0, 0, W, H);
    var halo = x.createRadialGradient(cx, cy, Math.min(R * 0.2, rh * 0.5), cx, cy, rh);
    halo.addColorStop(0, "rgba(" + C.net + "," + (C.sombre ? 0.22 : 0.16) + ")"); halo.addColorStop(1, "rgba(" + C.net + ",0)");
    x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, rh, 0, 6.2832); x.fill();
    /* orbites */
    SAT.forEach(function (s) {
      x.beginPath();
      for (var a = 0; a <= 6.3; a += 0.08) {
        var X = Math.cos(a) * R * s.r, Z = Math.sin(a) * R * s.r, p = projeter(X, Z * Math.sin(s.inc), Z * Math.cos(s.inc), cx, cy);
        if (a === 0) x.moveTo(p[0], p[1]); else x.lineTo(p[0], p[1]);
      }
      x.strokeStyle = "rgba(" + C[s.c] + ",.18)"; x.lineWidth = 1; x.stroke();
    });
    /* cœur de particules (le salaire) */
    var liste = new Array(N);
    for (var j = 0; j < N; j++) {
      var q = pts[j], ph = Math.acos(2 * q.v - 1), th = q.a + t * 0.05, rr = R * (q.u < 0.9 ? 1 : 1 + q.r * 0.25) * (1 + (zoom - 1) * q.r * 0.6);
      liste[j] = projeter(rr * Math.sin(ph) * Math.cos(th), rr * Math.cos(ph), rr * Math.sin(ph) * Math.sin(th), cx, cy);
    }
    liste.sort(function (a, b) { return b[2] - a[2]; });
    x.globalCompositeOperation = C.sombre ? "lighter" : "source-over";
    for (var m = 0; m < N; m++) {
      var L = liste[m], al = Math.max(0.12, Math.min(0.92, 0.72 - L[2] / (R * 5))), tp = 1.6 * L[3];
      x.fillStyle = "rgba(" + C.net + "," + al.toFixed(2) + ")";
      x.fillRect(L[0], L[1], tp, tp);
    }
    /* satellites, traînées, étiquettes */
    SAT.forEach(function (s, i) {
      var a = s.ph + (reduit ? 0 : t * s.v), X = Math.cos(a) * R * s.r, Z = Math.sin(a) * R * s.r;
      var p = projeter(X, Z * Math.sin(s.inc), Z * Math.cos(s.inc), cx, cy), tr = traines[i];
      if (!reduit) { tr.push([p[0], p[1]]); if (tr.length > 26) tr.shift(); }
      for (var n = 1; n < tr.length; n++) {
        x.strokeStyle = "rgba(" + C[s.c] + "," + (n / tr.length * 0.5).toFixed(2) + ")";
        x.lineWidth = 2.2 * p[3] * n / tr.length;
        x.beginPath(); x.moveTo(tr[n - 1][0], tr[n - 1][1]); x.lineTo(tr[n][0], tr[n][1]); x.stroke();
      }
      var g = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16 * p[3]);
      g.addColorStop(0, "rgba(" + C[s.c] + ",.95)"); g.addColorStop(0.25, "rgba(" + C[s.c] + ",.6)"); g.addColorStop(1, "rgba(" + C[s.c] + ",0)");
      x.fillStyle = g; x.beginPath(); x.arc(p[0], p[1], 16 * p[3], 0, 6.2832); x.fill();
      var el = etiquettes[i];
      if (el) {
        var devant = p[2] < 0 || Math.hypot(p[0] - cx, p[1] - cy) > R * 1.05;
        el.style.transform = "translate(" + Math.round(p[0] + 14) + "px," + Math.round(p[1] - 26) + "px)";
        el.style.opacity = devant ? "1" : ".15";
      }
    });
    x.globalCompositeOperation = "source-over";
  }

  function boucle(maintenant) {
    win.requestAnimationFrame(boucle);
    var anime = !reduit && visible && !doc.hidden;
    if (!anime && !aDessiner) return;
    aDessiner = false;
    dessiner((maintenant - debut) / 1000);
  }

  /* ---------- Interactions ---------- */
  win.addEventListener("pointermove", function (e) {
    souris.x = e.clientX / win.innerWidth - 0.5; souris.y = e.clientY / win.innerHeight - 0.5;
  }, { passive: true });
  var aide = doc.getElementById("aide-glisser");
  cv.addEventListener("pointerdown", function (e) {
    glisse = { x: e.clientX, y: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    if (aide) aide.classList.add("aide-glisser--vue");
  });
  cv.addEventListener("pointermove", function (e) {
    if (!glisse) return;
    var dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
    rotY += dx * 0.008; vY = dx * 0.0006; rotX = Math.max(-0.2, Math.min(1, rotX + dy * 0.005));
    glisse = { x: e.clientX, y: e.clientY }; aDessiner = true;
  });
  function lacher() { glisse = null; }
  cv.addEventListener("pointerup", lacher);
  cv.addEventListener("pointercancel", lacher);
  win.addEventListener("resize", function () { tailleCiel(); taillePlanete(); });
  if ("IntersectionObserver" in win) new win.IntersectionObserver(function (e) { visible = e[0].isIntersecting; aDessiner = true; }).observe(cv);
  doc.addEventListener("ef:theme", couleurs);
  if (win.MutationObserver) new win.MutationObserver(couleurs).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (mq.addEventListener) mq.addEventListener("change", function (e) { reduit = e.matches; aDessiner = true; });

  couleurs(); tailleCiel(); taillePlanete();
  win.requestAnimationFrame(boucle);

  /* ---------- Connexion réussie ---------- */
  win.OrbiteConnexion = {
    decoller: function (prenom) {
      var bienvenue = doc.getElementById("bienvenue-t");
      if (bienvenue) bienvenue.textContent = prenom ? "Bienvenue, " + prenom + " ✦" : "Bienvenue ✦";
      if (reduit) return Promise.resolve();
      var r = cv.getBoundingClientRect(), eclat = doc.getElementById("eclat");
      if (eclat && r.width) { eclat.style.setProperty("--x", Math.round(r.left + r.width / 2) + "px"); eclat.style.setProperty("--y", Math.round(r.top + r.height / 2) + "px"); }
      cibleZoom = 1.55;
      doc.body.classList.add("decolle");
      return new Promise(function (ok) { setTimeout(ok, 850); });
    }
  };
})();
