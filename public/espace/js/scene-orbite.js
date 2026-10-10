/*
 * Orbite — scène 3D de « Mon orbite » (canvas 2D, perspective calculée à la main).
 * La planète (nuage de particules) porte le net ; chaque crédit, contrat ou projet est un satellite sur son orbite.
 * Taille : mensualité (crédit) ou capital (contrat). Traîne : mois restants. Un crédit terminé se libère :
 * des étincelles rejoignent le noyau. Chaque satellite est un vrai bouton posé sur le canvas (clavier, lecteurs d'écran).
 * Pause hors écran et vue cachée ; mouvement réduit : rien ne tourne, la scène se redessine seulement quand elle change.
 */
(function (racine) {
  "use strict";
  var TOUR = Math.PI * 2;
  var VERT = [74, 222, 128];
  var PALETTES = {
    credit: [[96, 200, 255], [184, 200, 255], [126, 162, 255], [140, 226, 255], [160, 176, 255], [110, 140, 235]],
    vie: [[167, 139, 250], [200, 180, 255]],
    cea: [[214, 160, 255], [186, 150, 255]],
    projet: [[242, 244, 248]],
    vide: [[242, 244, 248]]
  };
  var INCL = [0.12, -0.18, 0.32, 0.06, -0.24, 0.2, -0.08, 0.27];

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")"; }
  function melange(c, k, d) { return [Math.round(c[0] + (d[0] - c[0]) * k), Math.round(c[1] + (d[1] - c[1]) * k), Math.round(c[2] + (d[2] - c[2]) * k)]; }

  function creer(o) {
    var ciel = o.ciel, toile = o.toile, calque = o.calque, doc = toile.ownerDocument, win = doc.defaultView;
    var ctx = toile.getContext("2d");
    var reduit = o.reduit || function () { return false; };
    var W = 0, H = 0, R = 50, FOC = 800;
    var cam = { rotY: 0.6, rotX: 0.34, vY: 0, cibleY: null, cibleX: 0.34 };
    var horloge = 0, vitesse = 1, visible = true, actif = true, sale = true, glisse = null, dernier = 0, pulse = 0, boucle = 0;
    var sats = [], parId = {}, choisi = null, etat = null, etincelles = [];

    var NP = 1300, pts = [], etoiles = [], i;
    for (i = 0; i < NP; i++) pts.push({ ph: Math.acos(2 * Math.random() - 1), th: Math.random() * TOUR, r: 0.92 + Math.random() * 0.08 });
    for (i = 0; i < 140; i++) etoiles.push({ x: Math.random(), y: Math.random(), a: 0.12 + Math.random() * 0.4, t: Math.random() < 0.12 ? 1.6 : 1 });

    function dimensionner() {
      var r = ciel.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var d = Math.min(2, win.devicePixelRatio || 1);
      W = r.width; H = r.height;
      toile.width = Math.round(W * d); toile.height = Math.round(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      /* Sur téléphone, les orbites se resserrent et peuvent frôler les bords : la planète reste lisible. */
      var etroit = W < 560, n = sats.length, pas = n > 1 ? Math.min(etroit ? 0.3 : 0.42, (etroit ? 1.1 : 1.56) / (n - 1)) : 0;
      sats.forEach(function (s, k) { s.a = (etroit ? 1.6 : 1.8) + k * pas; });
      var aMax = sats.reduce(function (m, s) { return Math.max(m, s.a); }, 2.4);
      R = Math.max(30, Math.min(W / (2 * aMax + (etroit ? 0.5 : 1.5)), H * (etroit ? 0.16 : 0.14)));
      mesurerNoyau();
      FOC = Math.max(700, 4.2 * aMax * R);
      NP = W < 560 ? 1000 : 1300;
      sale = true;
    }

    var zoneNoyau = null, mesureNoyau = 0;
    function mesurerNoyau() {
      if (!o.noyau) return;
      var a = ciel.getBoundingClientRect(), b = o.noyau.getBoundingClientRect();
      zoneNoyau = b.width ? { l: b.left - a.left - 6, r: b.right - a.left + 6, t: b.top - a.top - 4, b: b.bottom - a.top + 4 } : null;
    }
    function projeter(X, Y, Z) {
      var cY = Math.cos(cam.rotY), sY = Math.sin(cam.rotY), cX = Math.cos(cam.rotX), sX = Math.sin(cam.rotX);
      var x1 = X * cY - Z * sY, z1 = X * sY + Z * cY, y1 = Y * cX - z1 * sX, z2 = Y * sX + z1 * cX, s = FOC / (FOC + z2);
      return [W / 2 + x1 * s, H / 2 + y1 * s, z2, s];
    }
    function surOrbite(s, th) {
      var a = s.a * R, x = a * Math.cos(th), z = a * Math.sin(th);
      var y2 = -z * Math.sin(s.inc), z2 = z * Math.cos(s.inc), cn = Math.cos(s.noeud), sn = Math.sin(s.noeud);
      return [x * cn - z2 * sn, y2, x * sn + z2 * cn];
    }
    function angle(s) { return s.phase + horloge * TOUR / s.periode; }
    function etatSat(s) { return (etat && etat.satellites[s.id]) || { actif: true }; }
    function rayon(s) {
      if (s.genre === "credit") return R * Math.max(0.1, 0.2 * Math.sqrt(s.mensualite / s.ref));
      if (s.genre === "vie" || s.genre === "cea") { var c = etatSat(s).capital || 0; return R * Math.min(0.27, Math.max(0.09, 0.11 * Math.sqrt(c / s.ref))); }
      return R * 0.13;
    }

    /* ---------- Satellites (boutons) ---------- */
    function poserSatellites(liste) {
      var garde = {};
      var maxM = liste.reduce(function (m, s) { return s.genre === "credit" ? Math.max(m, s.mensualite) : m; }, 1);
      var compte = {};
      var nouveaux = liste.map(function (d, k) {
        var ancien = parId[d.id];
        var p = PALETTES[d.genre] || PALETTES.projet, j = compte[d.genre] = (compte[d.genre] || 0) + 1;
        var s = ancien || { alpha: 1, anneau: 0 };
        Object.keys(d).forEach(function (cle) { s[cle] = d[cle]; });
        s.coul = p[(j - 1) % p.length];
        s.inc = INCL[k % INCL.length]; s.noeud = 0.3 + k * 2.4; s.periode = 62 + k * 9;
        if (!ancien) s.phase = 0.6 + k * 1.9;
        s.ref = s.genre === "credit" ? maxM : Math.max(1000, (o.capitalRef && o.capitalRef(s)) || 1000);
        if (!s.bouton) {
          var b = doc.createElement("button");
          b.type = "button"; b.className = "satellite"; b.setAttribute("aria-pressed", "false");
          var tag = doc.createElement("span"); tag.className = "satellite__tag";
          var nom = doc.createElement("b"), sous = doc.createElement("small");
          tag.appendChild(nom); tag.appendChild(sous); b.appendChild(tag);
          b.addEventListener("click", function (e) { e.stopPropagation(); choisir(choisi === s.id ? null : s.id, true); });
          s.bouton = b; s.tagNom = nom; s.tagSous = sous; s.tag = tag;
        }
        s.bouton.dataset.genre = s.genre;
        s.tagNom.textContent = s.nom;
        garde[s.id] = s;
        return s;
      });
      sats.forEach(function (s) { if (!garde[s.id] && s.bouton) s.bouton.remove(); });
      nouveaux.forEach(function (s) { calque.appendChild(s.bouton); });
      sats = nouveaux; parId = garde;
      if (choisi && !parId[choisi]) choisi = null;
      dimensionner();
    }

    function majTextes() {
      sats.forEach(function (s) {
        var t = o.texteTag ? o.texteTag(s, etatSat(s)) : "";
        if (s.tagSous.textContent !== t) { s.tagSous.textContent = t; s.largeurTag = 0; }
        if (!s.largeurTag) s.largeurTag = s.tag.offsetWidth;
        var l = o.libelle ? o.libelle(s, etatSat(s)) : s.nom;
        if (s.bouton.getAttribute("aria-label") !== l) s.bouton.setAttribute("aria-label", l);
      });
    }

    /* ---------- Animation ---------- */
    function mettreAJour(dt) {
      var rm = reduit();
      vitesse += ((choisi ? 0 : 1) - vitesse) * Math.min(1, dt * 3);
      if (!rm) horloge += dt * vitesse;
      if (cam.cibleY !== null) {
        var k = rm ? 1 : Math.min(1, dt * 4.5);
        cam.rotY += (cam.cibleY - cam.rotY) * k; cam.rotX += (cam.cibleX - cam.rotX) * k;
        if (Math.abs(cam.cibleY - cam.rotY) < 0.002) { cam.rotY = cam.cibleY; if (!choisi) cam.cibleY = null; }
      } else if (!glisse && !rm) { cam.rotY += (0.035 + cam.vY) * dt; cam.vY *= Math.pow(0.04, dt); }
      sats.forEach(function (s) {
        var e = etatSat(s), c = e.actif === false ? 0 : 1, an = e.fiscalAcquis ? 1 : 0;
        s.alpha = rm ? c : s.alpha + (c - s.alpha) * Math.min(1, dt * 3.2);
        s.anneau = rm ? an : s.anneau + (an - s.anneau) * Math.min(1, dt * 3);
      });
      pulse = Math.max(0, pulse - dt * 1.4);
      for (var k2 = etincelles.length - 1; k2 >= 0; k2--) {
        var e2 = etincelles[k2]; e2.v += dt / e2.duree;
        if (e2.v >= 1) { etincelles.splice(k2, 1); pulse = Math.min(1, pulse + 0.06); }
      }
    }

    function tracerOrbite(s, devant) {
      var seg = 96, x = ctx, premier = true;
      x.beginPath();
      for (var j = 0; j <= seg; j++) {
        var p = surOrbite(s, j / seg * TOUR), P = projeter(p[0], p[1], p[2]);
        var ok = devant ? p[2] < 0 : p[2] >= 0;
        if (!ok) { premier = true; continue; }
        if (premier) { x.moveTo(P[0], P[1]); premier = false; } else x.lineTo(P[0], P[1]);
      }
      var sel = choisi === s.id, a = s.genre === "credit" ? s.alpha : 1;
      x.strokeStyle = sel ? rgba(s.coul, devant ? 0.6 : 0.3) : "rgba(242,244,248," + ((devant ? 0.15 : 0.065) * a).toFixed(3) + ")";
      x.lineWidth = sel ? 1.5 : 1;
      if (s.genre === "vide" || s.genre === "projet") x.setLineDash([2, 5]);
      x.stroke(); x.setLineDash([]);
    }
    function tracerTraine(s, devant) {
      var e = etatSat(s);
      if (s.genre !== "credit" || !e.restantes || s.alpha < 0.01) return;
      var span = Math.min(2.5, e.restantes * 0.017), th0 = angle(s), nt = 22, x = ctx;
      x.lineCap = "round";
      for (var q = 0; q < nt; q++) {
        var b1 = th0 - span + span * q / nt, b2 = th0 - span + span * (q + 1) / nt;
        var p1 = surOrbite(s, b1), p2 = surOrbite(s, b2);
        if ((p1[2] < 0) !== devant) continue;
        var A = projeter(p1[0], p1[1], p1[2]), B = projeter(p2[0], p2[1], p2[2]), k = (q + 1) / nt;
        x.strokeStyle = rgba(s.coul, 0.5 * k * k * s.alpha);
        x.lineWidth = Math.max(1, rayon(s) * 0.9 * k * A[3]);
        x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke();
      }
    }
    function dessinerSat(s) {
      var x = ctx, P = s.ecran, r = rayon(s) * P[3], a = s.genre === "credit" ? s.alpha : 1, c = s.coul, sel = choisi === s.id;
      if (a < 0.01) return;
      if (s.genre === "vide" || s.genre === "projet") {
        if (s.genre === "projet") { x.fillStyle = rgba(c, 0.14); x.beginPath(); x.arc(P[0], P[1], r + 3, 0, TOUR); x.fill(); }
        x.setLineDash([3, 3]); x.strokeStyle = rgba(c, sel ? 0.9 : 0.6); x.lineWidth = 1.2;
        x.beginPath(); x.arc(P[0], P[1], r + 3, 0, TOUR); x.stroke(); x.setLineDash([]);
        if (s.genre === "vide") {
          x.strokeStyle = rgba(c, sel ? 0.95 : 0.7); x.lineWidth = 1.4; x.beginPath();
          x.moveTo(P[0] - r * 0.5, P[1]); x.lineTo(P[0] + r * 0.5, P[1]); x.moveTo(P[0], P[1] - r * 0.5); x.lineTo(P[0], P[1] + r * 0.5); x.stroke();
        } else { x.fillStyle = rgba(c, 0.9); x.beginPath(); x.arc(P[0], P[1], r * 0.32, 0, TOUR); x.fill(); }
      } else {
        x.globalCompositeOperation = "lighter";
        var g = x.createRadialGradient(P[0], P[1], 0, P[0], P[1], r * 3.2);
        g.addColorStop(0, rgba(c, 0.32 * a)); g.addColorStop(1, rgba(c, 0));
        x.fillStyle = g; x.beginPath(); x.arc(P[0], P[1], r * 3.2, 0, TOUR); x.fill();
        x.globalCompositeOperation = "source-over";
        var sph = x.createRadialGradient(P[0] - r * 0.38, P[1] - r * 0.42, r * 0.08, P[0], P[1], r);
        sph.addColorStop(0, rgba(melange(c, 0.65, [255, 255, 255]), a));
        sph.addColorStop(0.55, rgba(c, a));
        sph.addColorStop(1, rgba(melange(c, 0.55, [8, 12, 24]), a));
        x.fillStyle = sph; x.beginPath(); x.arc(P[0], P[1], r, 0, TOUR); x.fill();
        if (s.anneau > 0.01) {
          x.strokeStyle = rgba([214, 200, 255], 0.85 * s.anneau); x.lineWidth = 1.3;
          x.beginPath(); x.ellipse(P[0], P[1], r * (1.25 + 0.6 * s.anneau), r * (0.38 + 0.18 * s.anneau), -0.35, 0, TOUR); x.stroke();
        }
      }
      if (sel) {
        var ph = reduit() ? 0 : (Math.sin(dernier / 380) + 1) / 2;
        x.strokeStyle = rgba(c, 0.55 + 0.35 * ph); x.lineWidth = 1.5;
        x.beginPath(); x.arc(P[0], P[1], r + 7 + ph * 2, 0, TOUR); x.stroke();
      }
    }
    function dessinerPlanete() {
      var x = ctx, cx = W / 2, cy = H / 2, Rp = R * (1 + pulse * 0.05), Rh = Rp * (1.9 + pulse * 0.6);
      var halo = x.createRadialGradient(cx, cy, Rp * 0.3, cx, cy, Rh);
      halo.addColorStop(0, rgba(VERT, 0.16 + pulse * 0.18)); halo.addColorStop(1, rgba(VERT, 0));
      x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, Rh, 0, TOUR); x.fill();
      var occ = x.createRadialGradient(cx, cy, 0, cx, cy, Rp * 1.02);
      occ.addColorStop(0, "rgba(9,14,18,.96)"); occ.addColorStop(0.85, "rgba(9,14,18,.9)"); occ.addColorStop(1, "rgba(9,14,18,0)");
      x.fillStyle = occ; x.beginPath(); x.arc(cx, cy, Rp * 1.02, 0, TOUR); x.fill();
      var cY = Math.cos(cam.rotY * 0.4), sY = Math.sin(cam.rotY * 0.4), cX = Math.cos(cam.rotX), sX = Math.sin(cam.rotX);
      x.globalCompositeOperation = "lighter";
      for (var k = 0; k < NP; k++) {
        var p = pts[k], th = p.th + horloge * 0.05, rr = Rp * p.r;
        var X = rr * Math.sin(p.ph) * Math.cos(th), Y = rr * Math.cos(p.ph), Z = rr * Math.sin(p.ph) * Math.sin(th);
        var x1 = X * cY - Z * sY, z1 = X * sY + Z * cY, y1 = Y * cX - z1 * sX, z2 = Y * sX + z1 * cX;
        var al = Math.max(0.08, Math.min(0.85, 0.5 - z2 / (Rp * 2.2))), tl = z2 < 0 ? 1.8 : 1.4;
        x.fillStyle = "rgba(74,222,128," + al.toFixed(2) + ")";
        x.fillRect(cx + x1 - tl / 2, cy + y1 - tl / 2, tl, tl);
      }
      x.globalCompositeOperation = "source-over";
    }

    function dessiner() {
      var x = ctx;
      x.clearRect(0, 0, W, H);
      var dx = ((cam.rotY * 18) % W + W) % W;
      for (var k = 0; k < etoiles.length; k++) {
        var st = etoiles[k];
        x.fillStyle = "rgba(242,244,248," + st.a + ")";
        x.fillRect((st.x * W + dx) % W, st.y * H, st.t, st.t);
      }
      sats.forEach(function (s) { var p = surOrbite(s, angle(s)); s.ecran = projeter(p[0], p[1], p[2]); });
      var parZ = sats.slice().sort(function (a, b) { return b.ecran[2] - a.ecran[2]; });
      /* derrière la planète, puis la planète, puis devant */
      sats.forEach(function (s) { if (s.genre !== "credit" || s.alpha > 0.01) tracerOrbite(s, false); });
      sats.forEach(function (s) { tracerTraine(s, false); });
      parZ.forEach(function (s) { if (s.ecran[2] >= 0) dessinerSat(s); });
      dessinerPlanete();
      sats.forEach(function (s) { if (s.genre !== "credit" || s.alpha > 0.01) tracerOrbite(s, true); });
      sats.forEach(function (s) { tracerTraine(s, true); });
      parZ.forEach(function (s) { if (s.ecran[2] < 0) dessinerSat(s); });
      if (etincelles.length) {
        x.globalCompositeOperation = "lighter";
        for (var e = 0; e < etincelles.length; e++) {
          var t = etincelles[e], v = Math.max(0, t.v), q = v * v;
          var px = (1 - q) * (1 - q) * t.x0 + 2 * (1 - q) * q * t.cx + q * q * W / 2;
          var py = (1 - q) * (1 - q) * t.y0 + 2 * (1 - q) * q * t.cy + q * q * H / 2;
          x.fillStyle = rgba(melange(t.coul, v, VERT), t.v < 0 ? 0 : 0.9 - v * 0.4);
          x.beginPath(); x.arc(px, py, t.r * (1 - v * 0.5), 0, TOUR); x.fill();
        }
        x.globalCompositeOperation = "source-over";
      }
      placerBoutons();
    }

    function placerBoutons() {
      var etroit = W < 560, poses = [];
      /* Du plus proche au plus lointain : une étiquette qui en chevaucherait une autre déjà posée reste cachée. */
      var ordre = sats.slice().sort(function (u, v) { return (u.id === choisi ? -1e9 : u.ecran[2]) - (v.id === choisi ? -1e9 : v.ecran[2]); });
      ordre.forEach(function (s) {
        var P = s.ecran, b = s.bouton, a = s.genre === "credit" ? s.alpha : 1, montre = a > 0.05;
        if (b.hidden === montre) b.hidden = !montre;
        if (!montre) return;
        b.style.transform = "translate3d(" + P[0].toFixed(1) + "px," + P[1].toFixed(1) + "px,0)";
        b.style.zIndex = String(Math.max(1, Math.round(2000 - P[2])));
        var devant = Math.max(0, Math.min(1, 0.5 - P[2] / (s.a * R * 2)));
        var dc = Math.sqrt((P[0] - W / 2) * (P[0] - W / 2) + (P[1] - H / 2) * (P[1] - H / 2));
        /* L'étiquette ne recouvre jamais le net affiché au centre, ni une autre étiquette. */
        var gauche = P[0] > W * 0.62, lt = s.largeurTag || 120, ht = etroit ? 24 : 36;
        var r = { l: gauche ? P[0] - 16 - lt : P[0] + 16, t: P[1] - ht / 2 }; r.r = r.l + lt; r.b = r.t + ht;
        function touche(z) { return z && r.r > z.l && r.l < z.r && r.b > z.t && r.t < z.b; }
        var cache = choisi !== s.id && ((etroit && P[2] > R * 0.4) || (P[2] > 0 && dc < R * 1.7) || dc < R * 1.15 || touche(zoneNoyau) || poses.some(touche));
        if (!cache) poses.push(r);
        s.tag.style.opacity = cache ? "0" : ((0.4 + 0.6 * devant) * a).toFixed(2);
        if (b.classList.contains("satellite--gauche") !== gauche) b.classList.toggle("satellite--gauche", gauche);
      });
    }

    function tic(t) {
      boucle = 0;
      if (!actif || !visible || doc.hidden) { dernier = 0; return; }
      var dt = dernier ? Math.min(0.05, (t - dernier) / 1000) : 0.016; dernier = t;
      if (t - mesureNoyau > 600) { mesureNoyau = t; mesurerNoyau(); }
      var anime = !reduit() || etincelles.length || cam.cibleY !== null || glisse;
      if (anime || sale) { sale = false; mettreAJour(dt); dessiner(); }
      if (anime) boucle = win.requestAnimationFrame(tic);
    }
    function relancer() { sale = true; if (!boucle) boucle = win.requestAnimationFrame(tic); }

    /* ---------- Interactions ---------- */
    function choisir(id, parUtilisateur) {
      if (id && !parId[id]) id = null;
      choisi = id;
      sats.forEach(function (s) { s.bouton.setAttribute("aria-pressed", String(s.id === id)); });
      if (id) {
        var s = parId[id], p = surOrbite(s, angle(s)), al = Math.atan2(p[2], p[0]);
        var d = (-Math.PI / 2 + 0.3 - al) - cam.rotY;
        d = ((d + Math.PI) % TOUR + TOUR) % TOUR - Math.PI;
        cam.cibleY = cam.rotY + d; cam.cibleX = 0.3;
      } else { cam.cibleY = null; cam.cibleX = 0.34; }
      relancer();
      if (o.surChoix) o.surChoix(id, !!parUtilisateur);
    }
    toile.addEventListener("pointerdown", function (e) {
      glisse = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
      try { toile.setPointerCapture(e.pointerId); } catch (er) {}
      relancer();
    });
    toile.addEventListener("pointermove", function (e) {
      if (!glisse) return;
      var dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if (Math.abs(e.clientX - glisse.x0) + Math.abs(e.clientY - glisse.y0) > 4) cam.cibleY = null;
      cam.rotY += dx * 0.008; cam.vY = dx * 0.02; cam.rotX = Math.max(0.05, Math.min(1, cam.rotX + dy * 0.005)); cam.cibleX = cam.rotX;
      glisse.x = e.clientX; glisse.y = e.clientY; relancer();
    });
    toile.addEventListener("pointerup", function (e) {
      if (!glisse) return;
      var bouge = Math.abs(e.clientX - glisse.x0) + Math.abs(e.clientY - glisse.y0);
      glisse = null;
      if (bouge < 5 && choisi) choisir(null, true);
    });
    toile.addEventListener("pointercancel", function () { glisse = null; });
    if ("IntersectionObserver" in win) new win.IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) relancer(); }).observe(ciel);
    if ("ResizeObserver" in win) new win.ResizeObserver(function () { dimensionner(); relancer(); }).observe(ciel);
    else win.addEventListener("resize", function () { dimensionner(); relancer(); });
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) relancer(); });

    return {
      /* Satellites du modèle (OrbiteSysteme) ; garde la caméra et le satellite choisi s'il existe encore. */
      satellites: function (liste) { poserSatellites(liste); majTextes(); relancer(); },
      /* État du système au mois affiché (OrbiteSysteme.modele().etat(t)). */
      etat: function (e) { etat = e; majTextes(); relancer(); },
      choisir: function (id) { choisir(id, false); },
      choisi: function () { return choisi; },
      /* Fin d'un crédit : ses étincelles rejoignent le noyau. */
      liberer: function (id) {
        var s = parId[id];
        if (!s || !s.ecran || reduit()) { pulse = 1; relancer(); return; }
        for (var k = 0; k < 34; k++) {
          var an = Math.random() * TOUR, d = R * (0.4 + Math.random() * 1.2);
          etincelles.push({ x0: s.ecran[0], y0: s.ecran[1], cx: (s.ecran[0] + W / 2) / 2 + Math.cos(an) * d, cy: (s.ecran[1] + H / 2) / 2 + Math.sin(an) * d,
            v: -Math.random() * 0.35, duree: 0.9 + Math.random() * 0.5, r: 1.2 + Math.random() * 1.8, coul: s.coul });
        }
        relancer();
      },
      pulser: function () { pulse = 1; relancer(); },
      couleur: function (id) { var s = parId[id]; return s ? "rgb(" + s.coul.join(",") + ")" : null; },
      activer: function (v) { actif = !!v; if (actif) { dimensionner(); relancer(); } },
      redessiner: relancer
    };
  }

  racine.OrbiteScene = { creer: creer };
})(typeof self !== "undefined" ? self : this);
