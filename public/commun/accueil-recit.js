/*
 * Orbite — accueil « scroll-cinéma » (lot 5) : chiffres calculés en direct (RecitCalcul) et scène du voyage d'un salaire.
 * La scène reste fixée pendant 4 chapitres ; le défilement pilote la planète (canvas), le chiffre central et la barre.
 * Mouvement réduit : scène fixe redessinée au défilement, aucune animation continue. Sans JavaScript : textes et
 * chiffres par défaut déjà présents dans la page.
 */
(function () {
  "use strict";
  var R = window.RecitCalcul, doc = document;
  if (!R) return;
  var reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var m = new Date();
  function nb(v, d) { return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }).replace(/[  ]/g, " "); }
  function dt0(v) { return nb(Math.round(v)) + " DT"; }
  function dt3(v) { return nb(v, 3) + " DT"; }
  function pct(v, d) { return nb(v * 100, d || 0) + " %"; }

  /* ---------- Chiffres ---------- */
  var v = null, vi = null;
  try { v = R.voyage(m); vi = R.vies(m); } catch (e) { if (window.console) console.error(e); }
  var valeurs = {};
  if (v) {
    var fin = v.anneeProjection;
    Object.assign(valeurs, {
      "v.brut": dt3(v.brut), "v.cotisations": "−" + dt3(v.cotisations), "v.impot": "−" + dt3(v.impot), "v.net": dt3(v.net),
      "v.mensualiteMax": dt0(v.mensualiteMax) + " / mois", "v.capacite": dt0(v.capacite),
      "v.versements": dt0(v.versements), "v.gainImpot": "jusqu'à " + dt0(v.gainImpot),
      "v.brutProjectionLib": "Brut en " + fin + " (hausse de 5 % par an)", "v.brutProjection": dt0(v.brutProjection),
      "v.capaciteProjectionLib": "Capacité immobilière en " + fin, "v.capaciteProjection": dt0(v.capaciteProjection)
    });
    if (v.retraite) {
      valeurs["v.retraiteLib"] = "Pension nette estimée à " + v.retraite.age + " ans (" + v.retraite.annee + ")";
      valeurs["v.retraiteNet"] = dt0(v.retraite.net);
      valeurs["v.note"] = "Chiffres de l'exemple calculés par Orbite (barèmes " + m.getFullYear() + ", CNSS, 40 % d'endettement sur 20 ans à 10 %, début de carrière en " + v.retraite.debut + "). Estimations indicatives.";
    }
  }
  if (vi) {
    var y = vi.yasmine, k = vi.karim, h = vi.habib;
    Object.assign(valeurs, {
      "y.age": String(y.age), "y.net": dt3(y.net), "y.loyerPart": pct(y.loyerPart), "y.reste": dt0(y.reste), "y.precaution": dt0(y.precaution), "y.gainImpot": dt0(y.gainImpot),
      "k.age": String(k.age), "k.net": dt3(k.net), "k.endettement": pct(k.endettement), "k.tranche": pct(k.tranche), "k.gainImpot": dt0(k.gainImpot),
      "h.age": String(h.age), "h.net": dt3(h.net), "h.depuis": String(h.depuis)
    });
    if (k.apres) Object.assign(valeurs, { "k.fin": k.apres.fin, "k.endettementApres": pct(k.apres.endettement), "k.marge": dt0(k.apres.marge) });
    if (h.retraite) {
      Object.assign(valeurs, { "h.quand": h.retraite.age + " ans (" + h.retraite.mois + " " + h.retraite.annee + ")", "h.taux": nb(h.retraite.taux, h.retraite.taux % 1 ? 1 : 0) + " %", "h.pension": dt0(h.retraite.net),
        "h.comparaison": h.retraite.remplacement >= 1 ? ": plus que son net actuel, grâce à l'abattement de la loi de finances 2026." : ", soit " + pct(h.retraite.remplacement) + " de son net actuel." });
    }
    if (h.a65) Object.assign(valeurs, { "h.taux65": nb(h.a65.taux, h.a65.taux % 1 ? 1 : 0) + " %", "h.net65": dt0(h.a65.net) });
  }
  doc.querySelectorAll("[data-r]").forEach(function (el) { var c = el.getAttribute("data-r"); if (valeurs[c] != null) el.textContent = valeurs[c]; });

  /* ---------- Apparition des cartes (le contenu reste visible sans JavaScript) ---------- */
  if (!reduit && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("vu"); io.unobserve(e.target); } }); }, { threshold: 0.15 });
    doc.querySelectorAll(".vie, .contenu__carte, .confiance__grille li").forEach(function (el, i) { el.classList.add("apparait"); el.style.setProperty("--retard", (i % 4) * 80 + "ms"); io.observe(el); });
  }

  /* Hauteur réelle de l'en-tête collant : la scène fixée se place juste dessous. */
  var entete = doc.querySelector(".entete");
  function caleEntete() { if (entete) doc.documentElement.style.setProperty("--entete-h", Math.round(entete.getBoundingClientRect().height) + "px"); }
  caleEntete(); addEventListener("resize", caleEntete);

  /* ---------- Scène ---------- */
  var cv = doc.getElementById("scene-toile"); if (!cv || !v) return;
  var x = cv.getContext("2d"); if (!x) return;
  var chapitres = [].slice.call(doc.querySelectorAll(".chapitre")), barres = doc.querySelectorAll(".scene__barre i");
  var lib = doc.getElementById("scene-lib"), val = doc.getElementById("scene-val"), an = doc.getElementById("scene-annee");
  var W = 0, H = 0, ratio = Math.min(2, window.devicePixelRatio || 1), etat = { ch: 0, p: 0 }, vise = { ch: 0, p: 0 }, avant = performance.now(), visible = true;
  function taille() { var b = cv.getBoundingClientRect(); W = b.width; H = b.height; cv.width = Math.round(W * ratio); cv.height = Math.round(H * ratio); x.setTransform(ratio, 0, 0, ratio, 0, 0); }
  taille(); addEventListener("resize", function () { taille(); if (reduit) dessiner(performance.now()); });
  var etoiles = [], points = [], N = innerWidth < 700 ? 340 : 540;
  for (var i = 0; i < 150; i++) etoiles.push({ x: Math.random(), y: Math.random(), a: Math.random() * 0.7 + 0.1, z: Math.random() * 1.4 + 0.3 });
  for (var j = 0; j < N; j++) { var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2; points.push({ x: Math.sqrt(1 - u * u) * Math.cos(th), y: u, z: Math.sqrt(1 - u * u) * Math.sin(th) }); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function c01(t) { return Math.max(0, Math.min(1, t)); }
  function anneau(cx, cy, R, couleur, inclin, alpha, larg, fraction) {
    if (alpha <= 0.01) return;
    x.save(); x.translate(cx, cy); x.scale(1, inclin); x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2 * (fraction == null ? 1 : fraction));
    x.strokeStyle = couleur; x.globalAlpha = alpha; x.lineWidth = larg / inclin; x.stroke(); x.restore(); x.globalAlpha = 1;
  }
  function satellite(cx, cy, R, ang, inclin, couleur, rayon, alpha, texte) {
    if (alpha <= 0.01) return;
    var sx = cx + Math.cos(ang) * R, sy = cy + Math.sin(ang) * R * inclin;
    x.globalAlpha = alpha;
    var g = x.createRadialGradient(sx, sy, 0, sx, sy, rayon * 3); g.addColorStop(0, couleur); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.beginPath(); x.arc(sx, sy, rayon * 3, 0, Math.PI * 2); x.fill();
    x.fillStyle = couleur; x.beginPath(); x.arc(sx, sy, rayon, 0, Math.PI * 2); x.fill();
    if (texte) { x.font = "600 12px 'Mona Sans', system-ui, sans-serif"; x.fillStyle = "#F2F4F8"; x.textAlign = "center"; x.fillText(texte, sx, sy - rayon - 10); }
    x.globalAlpha = 1;
  }
  function lireDefilement() {
    var milieu = innerHeight * 0.5, ch = 0, p = 0;
    chapitres.forEach(function (c, i) {
      var b = c.getBoundingClientRect();
      if (b.top <= milieu) { ch = i; p = c01((milieu - b.top) / b.height); }
      c.classList.toggle("chapitre--actif", b.top < innerHeight * 0.72 && b.bottom > innerHeight * 0.28);
    });
    vise.ch = ch; vise.p = p;
    barres.forEach(function (b, i) { b.style.setProperty("--p", (i < ch ? 100 : i === ch ? p * 100 : 0) + "%"); });
    if (reduit) dessiner(performance.now());
  }
  addEventListener("scroll", lireDefilement, { passive: true });
  var A0 = m.getFullYear(), Ar = v.retraite ? v.retraite.annee : v.anneeProjection;
  function anneeChapitre4(p) {
    var t = c01(p * 1.4), A10 = v.anneeProjection;
    return Math.round(t < 0.5 ? lerp(A0, A10, t / 0.5) : lerp(A10, Ar, (t - 0.5) / 0.5));
  }
  function noyau(ch, p) {
    var t;
    if (ch === 0) { t = c01(p * 1.6); lib.textContent = t < 1 ? "Du brut au net" : "Net par mois"; val.textContent = t < 1 ? dt0(lerp(v.brut, v.net, t)) : dt3(v.net); }
    else if (ch === 1) { lib.textContent = "Crédit possible"; val.textContent = dt0(lerp(0, v.capacite, c01(p * 1.8))); }
    else if (ch === 2) { lib.textContent = "Impôt en moins"; val.textContent = dt0(lerp(0, v.gainImpot, c01(p * 1.8))); }
    else {
      /* Deux temps : les 10 ans de la projection (brut qui progresse), puis le chemin jusqu'à la retraite. */
      var yA = anneeChapitre4(p), A10 = v.anneeProjection;
      if (yA <= A10) { lib.textContent = "Brut en " + yA; val.textContent = dt0(v.brut * Math.pow(1.05, yA - A0)); }
      else if (yA < Ar) { lib.textContent = "Cap sur la retraite · " + yA; val.textContent = (Ar - yA) + (Ar - yA > 1 ? " ans" : " an"); }
      else { lib.textContent = "Pension nette à " + v.retraite.age + " ans"; val.textContent = dt0(v.retraite.net); }
    }
    an.textContent = ch < 3 ? String(A0) : String(anneeChapitre4(p));
  }
  function dessiner(now) {
    var dts = Math.min(0.1, (now - avant) / 1000); avant = now;
    etat.ch = vise.ch; etat.p = reduit ? vise.p : lerp(etat.p, vise.p, c01(dts * 6));
    var ch = etat.ch, p = etat.p, cx = W / 2, cy = H * 0.46, R0 = Math.min(W, H) * (W < 500 ? 0.17 : 0.2), t = reduit ? 0 : now / 1000;
    x.clearRect(0, 0, W, H);
    etoiles.forEach(function (s) { x.globalAlpha = s.a * (reduit ? 0.8 : 0.6 + 0.4 * Math.sin(t * s.z + s.x * 9)); x.fillStyle = "#fff"; x.fillRect(s.x * W, s.y * H, s.z, s.z); });
    x.globalAlpha = 1;
    var rp = R0 * (ch === 0 ? lerp(1, 0.82, c01(p * 1.6)) : 0.82), rot = t * 0.25;
    var halo = x.createRadialGradient(cx, cy, rp * 0.2, cx, cy, rp * 1.8); halo.addColorStop(0, "rgba(18,183,106,.25)"); halo.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = halo; x.beginPath(); x.arc(cx, cy, rp * 1.8, 0, Math.PI * 2); x.fill();
    var cs = Math.cos(rot), sn = Math.sin(rot);
    points.forEach(function (q) {
      var px = q.x * cs - q.z * sn, pz = q.x * sn + q.z * cs;
      x.globalAlpha = 0.25 + 0.75 * (pz + 1) / 2; x.fillStyle = pz > 0 ? "#6CE9A6" : "#12B76A"; x.fillRect(cx + px * rp, cy + q.y * rp, 1.8, 1.8);
    });
    x.globalAlpha = 1;
    /* Chapitre 1 : les anneaux « cotisations » et « impôt » se détachent. */
    var d1 = ch === 0 ? c01(p * 2) : 1, rC = rp * lerp(1.05, 1.9, d1), rI = rp * lerp(1.12, 2.35, d1);
    anneau(cx, cy, rC, "#FDA29B", 0.32, ch === 0 ? lerp(0.9, 0.35, d1) : 0.16, 3);
    anneau(cx, cy, rI, "#FEC84B", 0.28, ch === 0 ? lerp(0.9, 0.35, d1) : ch === 2 ? lerp(0.14, 0.04, c01(p * 2)) : 0.13, 3);
    if (ch === 0 && d1 > 0.2 && W > 360) {
      x.font = "600 12px 'Mona Sans', system-ui, sans-serif"; x.textAlign = "center"; x.globalAlpha = c01((d1 - 0.2) * 2);
      x.fillStyle = "#FDA29B"; x.fillText("Cotisations −" + dt0(v.cotisations).replace(/ /g, " "), cx - rC * 0.62, cy + rp * 1.9 * 0.32 + 26);
      x.fillStyle = "#FEC84B"; x.fillText("Impôt et CSS −" + dt0(v.impot).replace(/ /g, " "), cx + rI * 0.6, cy - rp * 2.35 * 0.28 - 14);
      x.globalAlpha = 1;
    }
    /* Chapitre 2 : satellite crédit ; chapitre 3 : satellite assurance vie ; chapitre 4 : le temps et la retraite. */
    var aC = ch >= 1 ? (ch === 1 ? c01(p * 2.4) : 1) : 0, aE = ch >= 2 ? (ch === 2 ? c01(p * 2.4) : 1) : 0;
    if (ch === 3) aC = lerp(1, 0.25, c01(p * 1.5));
    anneau(cx, cy, rp * 2.1, "#8FAEFF", 0.36, 0.35 * aC, 1.4);
    satellite(cx, cy, rp * 2.1, t * 0.5 + 1, 0.36, "#2F5BEA", 8 + 6 * (ch === 1 ? c01(p * 2) : 1), aC, aC > 0.5 ? "Crédit" : "");
    anneau(cx, cy, rp * 2.6, "#C3B5FD", 0.3, 0.35 * aE, 1.4);
    satellite(cx, cy, rp * 2.6, -t * 0.35 + 3, 0.3, "#7A5AF8", 9, aE, aE > 0.5 ? "Assurance vie" : "");
    if (ch === 3) {
      var k = c01(p * 1.4);
      x.setLineDash([3, 6]); anneau(cx, cy, rp * 3, "#F5B70A", 0.26, 0.5 * c01(p * 3), 1.2, k); x.setLineDash([]);
      satellite(cx, cy, rp * 3, t * 0.2 + 5, 0.26, "#F5B70A", 7 + 5 * k, c01(p * 3), k > 0.95 ? "Retraite" : "");
    }
    noyau(ch, p);
    if (!reduit && visible) requestAnimationFrame(dessiner);
  }
  /* Animation seulement quand la scène est à l'écran. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      var avantVisible = visible; visible = es[0].isIntersecting;
      if (visible && !avantVisible && !reduit) { avant = performance.now(); requestAnimationFrame(dessiner); }
    }).observe(cv);
  }
  lireDefilement();
  requestAnimationFrame(dessiner);
})();
