/*
 * Orbite — « Ma progression » (route #progression, onglet par #progression?onglet=carriere|objectifs).
 * Carrière : salaire brut face à l'inflation (Progression.carriere), courbe SVG construite en DOM, projection réglable.
 * Objectifs : cartes avec jauge, « J'ai épargné » (versement + épargne disponible du profil, annulable), crédit suivi
 * automatiquement, défis du mois, série et badges. Données : tables objectifs / objectifs_versements (Espace.objectifs).
 * Expose window.OrbiteProgression.objectifs() pour les rappels d'échéance (appli.js) ; événement « orbite:objectifs ».
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, P = window.Progression, OC = window.OrbiteCalcul, OI = window.OrbiteIntelligence;
  var F = O.F, $ = O.$, doc = document, SVG = "http://www.w3.org/2000/svg";
  var donnees = { objectifs: [], versements: [] }, charge = false, chargement = null, enCours = false;
  var reglageTouche = false, faitsAvant = null, compte = {};
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var ICONES = { projet: "maison", precaution: "bouclier", credit: "credit", impot: "cible" };
  var BADGES = { premier: "🌱", serie3: "🔥", precaution: "🛟", atteint: "🏁", credit: "🪐" };

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function svg(tag, attrs) { var e = doc.createElementNS(SVG, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function icone(nom) { var s = svg("svg", { "aria-hidden": "true" }); s.appendChild(svg("use", { href: "/orbite/icones.svg#" + nom })); return s; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function signe(v, d) { return (v >= 0 ? "+" : "−") + F.pct(Math.abs(v), d == null ? 1 : d); }
  function libMois(d) { return MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function lire(v) { var r = F.lire(String(v == null ? "" : v)); return r.valide && !r.vide ? r.valeur : NaN; }
  function aujourdhui() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function compter(cle) { if (compte[cle]) return; compte[cle] = true; E.compterUsage("simulation", cle); }
  function retraite() { var p = O.profil(); return !!p && p.activite === "retraite"; }
  function fiscal(sy) { try { return OI ? OI.optimiseurFiscal(sy) : null; } catch (e) { return null; } }
  function signaler() { doc.dispatchEvent(new CustomEvent("orbite:objectifs")); }

  /* ---------- Onglets ---------- */
  var ONGLETS = ["carriere", "objectifs"], barre = doc.querySelector(".pg-onglets");
  function ouvrirOnglet(cle, focus) {
    if (ONGLETS.indexOf(cle) === -1) cle = "carriere";
    barre.setAttribute("data-o", cle);
    ONGLETS.forEach(function (c) {
      var t = $("pg-tab-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      $("pg-" + c).hidden = !on;
    });
    if (focus) $("pg-tab-" + cle).focus();
    rendre();
  }
  barre.addEventListener("click", function (e) {
    var b = e.target.closest("[data-onglet]"); if (!b) return;
    history.replaceState(null, "", "#progression?onglet=" + b.getAttribute("data-onglet"));
    ouvrirOnglet(b.getAttribute("data-onglet"));
  });
  barre.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var cle = barre.getAttribute("data-o") === "carriere" ? "objectifs" : "carriere";
    history.replaceState(null, "", "#progression?onglet=" + cle);
    ouvrirOnglet(cle, true);
  });
  function ongletActif() { return barre.getAttribute("data-o"); }

  /* ===================================================================
     Carrière
     =================================================================== */
  function rendreCarriere() {
    var p = O.profil(), sy = O.synthese(); if (!p || !sy) return;
    var m = new Date(), an = m.getFullYear(), c = P.carriere(p, m), ret = retraite(), mot = ret ? "pension brute" : "brut";
    $("pg-t-bilan").textContent = ret ? "Votre pension et vos prix" : "Votre salaire et vos prix";
    var vide = !c.etapes.length;
    $("pg-carriere-vide").hidden = !vide;
    $("pg-bilan-plein").hidden = vide;
    /* Hausse par défaut : la moyenne passée (arrondie au demi-point), tant que l'utilisateur n'a pas touché au curseur. */
    if (!reglageTouche) $("pg-hausse").value = String(c.moyenneHausse != null ? Math.max(0, Math.min(12, Math.round(c.moyenneHausse * 200) / 2)) : 3);
    $("pg-hausse-aide").textContent = c.moyenneHausse != null ? "Votre moyenne depuis " + c.etapes[0].annee + " : " + F.pct(c.moyenneHausse, 1) + " par an." : "Pas encore assez d'historique : 3 % par défaut.";
    rendreEtapes(c, ret);
    if (vide) { $("pg-bilan-sous").textContent = ""; rendreProjection(p, sy, c); return; }
    var b = c.bilan, dep = c.etapes[0], emb = p.dateEmbauche && /^\d{4}-\d{2}/.test(p.dateEmbauche);
    var nbH = c.hausses.length;
    $("pg-bilan-sous").textContent = (emb ? "Embauche en " + MOIS[+p.dateEmbauche.slice(5, 7) - 1] + " " + p.dateEmbauche.slice(0, 4) : "Depuis " + MOIS[dep.mois - 1] + " " + dep.annee) +
      " · " + (nbH ? nbH + (nbH > 1 ? " hausses enregistrées" : " hausse enregistrée") : "aucune hausse enregistrée") + " dans votre historique" + (c.avantInflation ? " · inflation suivie depuis " + b.depuis : "") + ".";
    $("pg-t1-lib").textContent = "Votre " + mot + " depuis " + b.depuis;
    $("pg-t2-lib").textContent = "Les prix depuis " + b.depuis + " (INS)";
    $("pg-t1").textContent = signe(b.hausse);
    $("pg-t2").textContent = signe(b.prix);
    $("pg-t3").textContent = signe(b.pouvoirAchat);
    var gagne = b.pouvoirAchat >= 0;
    $("pg-t3-boite").classList.toggle("pg-tuile--gagne", gagne);
    var ph = $("pg-phrase"); ph.textContent = ""; ph.classList.toggle("pg-phrase--gagne", gagne);
    var gras = function (t) { ph.appendChild(cree("b", "", t)); }, txt = function (t) { ph.appendChild(doc.createTextNode(t)); };
    if (!nbH) { txt("Votre " + mot + " n'a pas bougé depuis " + b.depuis + " (" + F.dt0(b.brutFin) + " DT), alors que les prix ont augmenté de " + F.pct(b.prix, 1) + ". "); }
    else { txt("Votre " + mot + " est passé" + (ret ? "e" : "") + " de "); gras(F.dt0(b.brutDebut)); txt(" à "); gras(dt(b.brutFin)); txt(gagne ? ", plus vite que les prix. " : ", mais les prix ont augmenté plus vite. "); }
    if (gagne) { txt("Votre pouvoir d'achat a progressé de "); gras(F.pct(b.pouvoirAchat, 1)); txt(" depuis " + b.depuis + "."); }
    else {
      txt("Pour garder le pouvoir d'achat de " + b.depuis + ", il faudrait aujourd'hui "); gras(dt(b.brutPourGarder) + " " + (ret ? "brut" : "brut")); txt(", soit "); gras(dt(b.manque) + " de plus"); txt(" par mois" + (ret ? "." : " : un argument chiffré pour votre prochain entretien."));
    }
    if (b.provisoire) txt(" (Inflation " + an + " provisoire.)");
    $("pg-leg-reel").textContent = "Ce que vaut votre " + mot + " en dinars de " + b.depuis;
    rendreInflation(b.depuis);
    rendreProjection(p, sy, c);
  }

  function rendreEtapes(c, ret) {
    var ol = $("pg-etapes"); ol.textContent = "";
    if (!c.etapes.length) { ol.appendChild(cree("li", "pg-etapes__vide", "Aucune étape datée pour le moment.")); return; }
    c.etapes.forEach(function (e, i) {
      var li = cree("li"), h = i ? c.hausses[i - 1] : null, corps = cree("div");
      li.appendChild(cree("span", "chiffre", String(e.annee)));
      if (!h) { corps.appendChild(doc.createTextNode((i === 0 && O.profil().dateEmbauche ? "Embauche" : "Départ") + " · ")); }
      else corps.appendChild(doc.createTextNode((h.hausse >= 0 ? "Hausse de " : "Baisse de ") + F.pct(Math.abs(h.hausse), 1) + " · "));
      corps.appendChild(cree("b", "", dt(e.brut))); corps.appendChild(doc.createTextNode(" brut"));
      var sm = cree("small");
      if (!h) sm.textContent = "Net " + dt(e.net) + " au barème actuel";
      else {
        var periode = h.annee - h.depuis <= 1 ? "Inflation de " + (h.annee - h.depuis === 1 ? "l'année" : "la période") : "Prix " + h.depuis + " → " + h.annee;
        sm.textContent = periode + " : " + signe(h.prix) + " · " + (h.verdict === "gagne" ? "gagné" : h.verdict === "perdu" ? "perdu" : "à égalité");
        li.setAttribute("data-verdict", h.verdict);
      }
      corps.appendChild(sm); li.appendChild(corps); ol.appendChild(li);
    });
  }

  function rendreInflation(depuis) {
    var t = $("pg-inflation"); t.textContent = "";
    var ans = Object.keys(P.INFLATION).map(Number).filter(function (a) { return a >= Math.min(depuis, 2019); });
    var th = cree("thead"), tr = cree("tr"), tb = cree("tbody"), tr2 = cree("tr");
    tr.appendChild(cree("th", "", "Année")); tr2.appendChild(cree("td", "", "Inflation (%)"));
    ans.forEach(function (a) { tr.appendChild(cree("th", "", a + (P.PROVISOIRE[a] ? "*" : ""))); tr2.appendChild(cree("td", "", String(P.INFLATION[a]).replace(".", ","))); });
    th.appendChild(tr); tb.appendChild(tr2); t.appendChild(th); t.appendChild(tb);
    var prov = Object.keys(P.PROVISOIRE).map(function (a) { return "* " + a + " provisoire : " + P.PROVISOIRE[a] + "."; }).join(" ");
    $("pg-sources-texte").textContent = P.SOURCES + " " + prov;
  }

  function rendreProjection(p, sy, c) {
    var h = +$("pg-hausse").value / 100, inf = +$("pg-inf").value / 100;
    $("pg-hausse-v").textContent = F.pct(h, h * 100 % 1 ? 1 : 0);
    $("pg-inf-v").textContent = F.pct(inf, inf * 100 % 1 ? 1 : 0);
    var pr = P.projection(p, sy, { hausse: h, inflation: inf, ans: 10 }), fin = pr[pr.length - 1];
    $("pg-r-brut-lib").textContent = (retraite() ? "Pension brute" : "Brut") + " en " + fin.annee;
    $("pg-r-net-lib").textContent = (retraite() ? "Pension nette" : "Net") + " en " + fin.annee + " (barème actuel)";
    $("pg-r-brut").textContent = dt(fin.brut);
    $("pg-r-net").textContent = dt(fin.net);
    var pa = $("pg-r-pa"); pa.textContent = signe(fin.pouvoirAchat); pa.classList.toggle("pg-negatif", fin.pouvoirAchat < 0); pa.classList.toggle("pg-positif", fin.pouvoirAchat >= 0);
    $("pg-r-cap").textContent = dt(Math.round(fin.capacite / 1000) * 1000);
    if (c.etapes.length) dessiner(c, pr, inf);
  }

  /* ---------- Courbe : brut en escalier, valeur réelle (pointillés), projection ---------- */
  var tracee = false, largeurDessin = null, minuterieTaille = null;
  /* Passage téléphone ⇄ ordinateur (rotation, fenêtre redimensionnée) : la courbe est redessinée. */
  window.addEventListener("resize", function () {
    clearTimeout(minuterieTaille);
    minuterieTaille = setTimeout(function () {
      if ($("vue-progression").hidden || ongletActif() !== "carriere" || largeurDessin === null) return;
      if (($("pg-graphe").clientWidth < 520) !== largeurDessin) rendreCarriere();
    }, 200);
  });
  function dessiner(c, pr, inf) {
    var boite = $("pg-graphe"); boite.textContent = "";
    /* Écran étroit : repère plus petit, pour des libellés lisibles une fois la courbe mise à l'échelle. */
    var etroit = (boite.clientWidth || 680) < 520, W = etroit ? 380 : 680, H = etroit ? 260 : 300, g = etroit ? 44 : 52, d = etroit ? 10 : 18, ht = 18, bs = 34;
    largeurDessin = etroit;
    var m = new Date(), an = m.getFullYear(), maintenant = an + m.getMonth() / 12;
    var x0 = c.etapes[0].annee + (c.etapes[0].mois - 1) / 12, x1 = pr[pr.length - 1].annee + 1;
    var debut = c.bilan.depuis, ixAuj = P.indice(debut, an);
    var reel = c.annuel.filter(function (a) { return a.reel != null; }).map(function (a) { return [a.annee + 0.5, a.reel]; });
    var projB = pr.slice(1).map(function (q) { return [q.annee + 0.5, q.brut]; });
    var projR = pr.slice(1).map(function (q, i) { return [q.annee + 0.5, q.brut / (ixAuj * Math.pow(1 + inf, i + 1))]; });
    var vals = c.etapes.map(function (e) { return e.brut; }).concat(reel.map(function (r) { return r[1]; }), projB.map(function (r) { return r[1]; }), projR.map(function (r) { return r[1]; }));
    var vmax = Math.max.apply(null, vals), vmin = Math.min.apply(null, vals);
    var pas = vmax - vmin > 6000 ? 2000 : vmax - vmin > 2500 ? 1000 : 500;
    var min = Math.max(0, Math.floor(vmin * 0.92 / pas) * pas), max = Math.ceil(vmax * 1.04 / pas) * pas;
    function X(a) { return g + (a - x0) / (x1 - x0) * (W - g - d); }
    function Y(v) { return ht + (1 - (v - min) / (max - min)) * (H - ht - bs); }
    function chemin(pts) { return "M" + pts.map(function (q) { return X(q[0]).toFixed(1) + " " + Y(q[1]).toFixed(1); }).join(" L"); }
    var ret = retraite(), mot = ret ? "pension brute" : "salaire brut";
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Courbe du " + mot + " depuis " + c.etapes[0].annee + ", sa valeur en dinars de " + debut + " et la projection jusqu'en " + pr[pr.length - 1].annee + "." });
    var defs = svg("defs", {}), lg = svg("linearGradient", { id: "pg-degrade", x1: "0", x2: "0", y1: "0", y2: "1" });
    lg.appendChild(svg("stop", { offset: "0", class: "pg-stop-haut" })); lg.appendChild(svg("stop", { offset: "1", class: "pg-stop-bas" }));
    defs.appendChild(lg); s.appendChild(defs);
    var axe = svg("g", { class: "pg-axe" });
    for (var v = min; v <= max + 0.1; v += pas) {
      axe.appendChild(svg("line", { x1: g, x2: W - d, y1: Y(v), y2: Y(v) }));
      var t = svg("text", { x: g - 8, y: Y(v) + 4, "text-anchor": "end" }); t.textContent = F.dt0(v); axe.appendChild(t);
    }
    var nbAns = Math.ceil(x1 - x0), saut = Math.max(1, Math.ceil(nbAns / (etroit ? 4 : 6)));
    for (var a = Math.ceil(x0); a < x1; a += saut) { var ta = svg("text", { x: X(a + 0.5), y: H - 10, "text-anchor": "middle" }); ta.textContent = String(a); axe.appendChild(ta); }
    s.appendChild(axe);
    /* Brut en escalier jusqu'à aujourd'hui. */
    var pts = [];
    c.etapes.forEach(function (e, i) {
      var xe = e.annee + (e.mois - 1) / 12;
      if (i) pts.push([xe, c.etapes[i - 1].brut]);
      pts.push([xe, e.brut]);
    });
    var dernier = c.etapes[c.etapes.length - 1].brut;
    pts.push([maintenant, dernier]);
    s.appendChild(svg("path", { class: "pg-aire", d: chemin(pts) + " L" + X(maintenant).toFixed(1) + " " + Y(min) + " L" + X(x0).toFixed(1) + " " + Y(min) + " Z" }));
    var lb = svg("path", { class: "pg-l-brut", d: chemin(pts) }); s.appendChild(lb);
    var lr = reel.length > 1 ? svg("path", { class: "pg-l-reel", d: chemin(reel) }) : null; if (lr) s.appendChild(lr);
    s.appendChild(svg("path", { class: "pg-l-proj", d: chemin([[maintenant, dernier]].concat(projB)) }));
    if (reel.length) s.appendChild(svg("path", { class: "pg-l-reel pg-l-reel--proj", d: chemin([reel[reel.length - 1]].concat(projR)) }));
    var auj = svg("g", { class: "pg-aujourdhui" });
    auj.appendChild(svg("line", { x1: X(maintenant), x2: X(maintenant), y1: ht, y2: H - bs }));
    var tj = svg("text", { x: X(maintenant) + 6, y: ht + 10 }); tj.textContent = "Aujourd'hui"; auj.appendChild(tj); s.appendChild(auj);
    c.hausses.forEach(function (h) {
      var gx = svg("g", { class: "pg-hausse" + (h.verdict === "perdu" ? " pg-hausse--perdu" : "") }), xh = X(h.annee + (h.mois - 1) / 12);
      gx.appendChild(svg("circle", { cx: xh, cy: Y(h.apres), r: 5 }));
      var th = svg("text", { x: xh, y: Y(h.apres) - 12, "text-anchor": "middle" }); th.textContent = signe(h.hausse); gx.appendChild(th);
      s.appendChild(gx);
    });
    var curseur = svg("line", { class: "pg-curseur", x1: 0, x2: 0, y1: ht, y2: H - bs }); s.appendChild(curseur);
    boite.appendChild(s);
    var bulle = cree("div", "pg-bulle"); bulle.setAttribute("aria-hidden", "true"); boite.appendChild(bulle);
    /* Tracé animé à la première apparition (CSSOM : compatible avec la politique de sécurité). */
    if (!tracee && !O.mouvementReduit.matches) {
      [lb, lr].forEach(function (l) { if (!l) return; var L = Math.ceil(l.getTotalLength()); if (!L) return; l.style.setProperty("--long", L); l.classList.add("pg-trace"); });
      if (lb.getTotalLength()) tracee = true;
    }
    function valeurs(an2) {
      var cle = new Date(an2, 6, 1), courant = null;
      c.etapes.forEach(function (e) { if (e.date <= cle) courant = e; });
      if (an2 <= an) { if (!courant) return null; var ix = an2 >= debut ? P.indice(debut, an2) : null; return { brut: courant.brut, reel: ix ? courant.brut / ix : null, proj: false }; }
      var q = pr[an2 - an]; if (!q) return null;
      return { brut: q.brut, reel: q.brut / (ixAuj * Math.pow(1 + inf, an2 - an)), proj: true };
    }
    s.addEventListener("pointermove", function (e) {
      var r = s.getBoundingClientRect(), xv = (e.clientX - r.left) / r.width * W;
      var a2 = Math.floor(x0 + (xv - g) / (W - g - d) * (x1 - x0));
      var vv = valeurs(a2); if (!vv) { bulle.classList.remove("pg-bulle--on"); return; }
      bulle.textContent = "";
      bulle.appendChild(cree("b", "", String(a2))); bulle.appendChild(doc.createTextNode(" · " + (ret ? "pension " : "brut ") + dt(vv.brut)));
      if (vv.reel != null) { bulle.appendChild(cree("br")); bulle.appendChild(doc.createTextNode("en dinars de " + debut + " : " + dt(vv.reel))); }
      if (vv.proj) { bulle.appendChild(cree("br")); bulle.appendChild(cree("i", "", "projection")); }
      bulle.style.setProperty("left", (e.clientX - r.left) + "px"); bulle.style.setProperty("top", (e.clientY - r.top) + "px");
      bulle.classList.add("pg-bulle--on");
      var xc = X(a2 + 0.5); curseur.setAttribute("x1", xc); curseur.setAttribute("x2", xc); curseur.classList.add("pg-curseur--on");
    });
    s.addEventListener("pointerleave", function () { bulle.classList.remove("pg-bulle--on"); curseur.classList.remove("pg-curseur--on"); });
  }

  ["pg-hausse", "pg-inf"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (id === "pg-hausse") reglageTouche = true;
      compter("progression");
      var p = O.profil(), sy = O.synthese(); if (p && sy) rendreProjection(p, sy, P.carriere(p, new Date()));
    });
  });
  doc.querySelectorAll("#vue-progression [data-hausse]").forEach(function (b) {
    b.addEventListener("click", function () { O.mettreAJourSalaire(); });
  });

  /* ===================================================================
     Objectifs
     =================================================================== */
  function charger(force) {
    if (!E.objectifs) return Promise.resolve();
    if (chargement && !force) return chargement;
    chargement = E.objectifs.lister().then(function (d) {
      donnees = d; charge = true; $("pg-obj-erreur").hidden = true;
      faitsAvant = null;
      signaler(); rendre();
    }, function () {
      chargement = null;
      var er = $("pg-obj-erreur"); er.hidden = false; er.textContent = "";
      er.appendChild(doc.createTextNode("Vos objectifs ne se chargent pas pour le moment. "));
      var b = cree("button", "lien-action", "Réessayer"); b.type = "button"; b.addEventListener("click", function () { charger(true); }); er.appendChild(b);
      rendre();
    });
    return chargement;
  }

  function rendreObjectifs() {
    var p = O.profil(), sy = O.synthese(); if (!p || !sy) return;
    var m = new Date(), liste = $("pg-liste"); liste.textContent = "";
    if (!charge) { for (var k = 0; k < 2; k++) liste.appendChild(cree("div", "pg-obj pg-obj--squelette")); }
    else donnees.objectifs.forEach(function (o) { liste.appendChild(carte(o, sy, p, m)); });
    if (charge && donnees.objectifs.length < P.MAX_OBJECTIFS) liste.appendChild(carteAjout());
    requestAnimationFrame(function () { liste.querySelectorAll(".pg-jauge i[data-p]").forEach(function (j) { j.style.setProperty("width", j.getAttribute("data-p") + "%"); }); });
    rendreDefis(sy, p, m);
  }

  function carte(o, sy, p, m) {
    var e = P.etatObjectif(o, donnees.versements, sy, p, m), on = P.normaliserObjectif(o);
    var art = cree("article", "pg-obj"); art.setAttribute("data-type", on.type); art.setAttribute("data-id", o.id);
    var tete = cree("div", "pg-obj__tete"), ico = cree("span", "pg-obj__ico"); ico.appendChild(icone(ICONES[on.type]));
    var tx = cree("div"), nom = on.libelle || (on.type === "credit" && p.credits[on.credit] ? "Solder « " + (p.credits[on.credit].libelle || "mon crédit") + " » plus tôt" : P.NOMS_TYPES[on.type]);
    tx.appendChild(cree("h3", "", nom));
    var ech = on.echeance ? new Date(+on.echeance.slice(0, 4), +on.echeance.slice(5, 7) - 1, 1) : null;
    tx.appendChild(cree("p", "", on.type === "credit" ? (ech ? "Avant " + libMois(ech) : "Suivi de votre crédit") : dt(e.cible) + (ech ? " · " + (on.type === "impot" ? "avant le 31 décembre" : "avant " + libMois(ech)) : "")));
    tete.appendChild(ico); tete.appendChild(tx);
    var ETATS = { retard: "En retard", avance: "En avance", ok: "Dans les temps", auto: "Suivi automatique", atteint: "Atteint", "a-lancer": "À lancer", introuvable: "Crédit retiré" };
    if (e.etat === "retard" && e.retardMois >= 1) ETATS.retard = "En retard de " + e.retardMois + " mois";
    tx.appendChild(cree("span", "pg-etat pg-etat--" + e.etat, ETATS[e.etat] || ""));
    var mod = cree("button", "bouton bouton--fantome bouton--icone bouton--petit pg-obj__modifier"); mod.type = "button"; mod.setAttribute("aria-label", "Modifier « " + nom + " »");
    mod.appendChild(icone("crayon")); mod.addEventListener("click", function () { ouvrirDialogue(o); }); tete.appendChild(mod);
    art.appendChild(tete);
    var pc = Math.round(Math.min(1, e.pct) * 1000) / 10;
    var jauge = cree("div", "pg-jauge"); jauge.setAttribute("role", "progressbar"); jauge.setAttribute("aria-valuemin", "0"); jauge.setAttribute("aria-valuemax", "100"); jauge.setAttribute("aria-valuenow", String(Math.round(pc)));
    jauge.setAttribute("aria-label", "Progression de « " + nom + " »");
    var ji = cree("i"); ji.setAttribute("data-p", String(pc)); jauge.appendChild(ji); art.appendChild(jauge);
    var mt = cree("div", "pg-montants"), g = cree("span");
    g.appendChild(cree("b", "chiffre", F.dt0(e.fait))); g.appendChild(doc.createTextNode(" / " + dt(e.cible) + (e.auto ? " remboursés" : "")));
    mt.appendChild(g); mt.appendChild(cree("span", "chiffre", F.dt0(pc) + " %")); art.appendChild(mt);
    if (e.phrase) art.appendChild(cree("p", "pg-conseil", e.phrase));
    if (on.type === "credit") {
      var act = cree("div", "pg-actions"), a = cree("a", "bouton bouton--fantome bouton--petit", "Voir le crédit"); a.href = "#credit"; act.appendChild(a); art.appendChild(act);
    } else if (e.etat !== "atteint") {
      var f = cree("form", "pg-verser"), id = "pg-v-" + o.id, lab = cree("label", "cache", "Montant mis de côté pour « " + nom + " »"); lab.htmlFor = id;
      var inp = cree("input"); inp.id = id; inp.type = "text"; inp.inputMode = "decimal"; inp.autocomplete = "off"; inp.placeholder = e.mensuelNecessaire ? F.dt0(Math.ceil(e.mensuelNecessaire / 10) * 10) : "Montant";
      var bt = cree("button", "bouton bouton--plein bouton--petit", on.type === "impot" ? "J'ai versé" : "J'ai épargné"); bt.type = "submit";
      f.appendChild(lab); f.appendChild(inp); f.appendChild(bt);
      f.addEventListener("submit", function (ev) { ev.preventDefault(); verser(o, inp, bt); });
      art.appendChild(f);
    }
    return art;
  }

  function carteAjout() {
    var d = cree("div", "pg-obj pg-ajout"), t = cree("p", "pg-ajout__titre");
    t.appendChild(cree("b", "", "+")); t.appendChild(doc.createTextNode("Nouvel objectif")); d.appendChild(t);
    var types = cree("div", "pg-ajout__types");
    [["projet", "Projet", "logement, voiture, études…"], ["precaution", "Précaution", "3 à 6 mois de dépenses"], ["credit", "Crédit", "le solder plus tôt"], ["impot", "Impôt", "assurance vie avant le 31/12"]].forEach(function (x) {
      var b = cree("button"); b.type = "button"; b.setAttribute("data-type", x[0]);
      var tt = cree("b"); tt.appendChild(icone(ICONES[x[0]])); tt.appendChild(doc.createTextNode(x[1])); b.appendChild(tt); b.appendChild(doc.createTextNode(x[2]));
      b.addEventListener("click", function () { ouvrirDialogue(null, x[0]); });
      types.appendChild(b);
    });
    d.appendChild(types);
    return d;
  }

  /* « J'ai épargné » : versement enregistré, épargne disponible du profil augmentée (sauf versement d'assurance vie), annulable. */
  function verser(o, inp, bt) {
    var v = lire(inp.value);
    if (!(v > 0) || v > 1e7) { inp.setAttribute("aria-invalid", "true"); inp.focus(); O.toast("Indiquez un montant, par exemple 150.", { type: "erreur" }); return; }
    if (enCours) return; enCours = true; bt.disabled = true;
    inp.removeAttribute("aria-invalid");
    var p = O.profil(), avant = p.epargneDisponible || 0, ajoute = o.type !== "impot";
    E.objectifs.verser(o.id, v, aujourdhui()).then(function (ver) {
      enCours = false;
      donnees.versements.push(ver);
      if (ajoute) O.majProfil({ epargneDisponible: Math.round((avant + v) * 1000) / 1000 });
      compter("objectif-versement");
      signaler(); rendre();
      O.toast((o.type === "impot" ? "Versement noté : " : "Bravo, ") + dt(v) + (o.type === "impot" ? "." : " de plus mis de côté."), {
        type: "ok", detail: ajoute ? "Votre épargne disponible passe à " + dt(avant + v) + "." : null,
        action: { libelle: "Annuler", fn: function () {
          E.objectifs.annulerVersement(ver.id).then(function () {
            donnees.versements = donnees.versements.filter(function (x) { return x.id !== ver.id; });
            if (ajoute) O.majProfil({ epargneDisponible: avant }, { immediat: true });
            faitsAvant = null; signaler(); rendre(); O.toast("Versement annulé.");
          }, function () { O.toast("L'annulation n'a pas abouti. Réessayez.", { type: "erreur" }); });
        } }
      });
    }, function () {
      enCours = false; bt.disabled = false;
      O.toast("Le versement n'a pas été enregistré. Vérifiez votre connexion.", { type: "erreur" });
    });
  }

  /* ---------- Défis, série, badges ---------- */
  function rendreDefis(sy, p, m) {
    var ul = $("pg-defis"); ul.textContent = "";
    $("pg-t-defis").textContent = "Défis " + (/^[aeiouéè]/.test(MOIS[m.getMonth()]) ? "d'" : "de ") + MOIS[m.getMonth()];
    var liste = charge ? P.defis(sy, p, donnees.objectifs, donnees.versements, m, fiscal(sy)) : [];
    var faits = {};
    liste.forEach(function (d) {
      var li = cree("li", "pg-defi" + (d.fait ? " pg-defi--fait" : "")), cs = cree("span", "pg-defi__case"); cs.setAttribute("aria-hidden", "true"); cs.appendChild(icone("valide"));
      var tx = cree("div"); tx.appendChild(cree("b", "", d.titre)); tx.appendChild(cree("small", "", d.detail));
      li.appendChild(cs); li.appendChild(tx);
      if (d.fait) { li.appendChild(cree("span", "pg-defi__p", "réussi")); faits[d.id] = true; }
      else if (d.cible) li.appendChild(cree("span", "pg-defi__p chiffre", F.dt0(d.progres || 0) + " / " + F.dt0(d.cible)));
      else {
        var b = cree("button", "bouton bouton--fantome bouton--petit", "Faire"); b.type = "button"; b.setAttribute("aria-label", "Faire : " + d.titre);
        b.addEventListener("click", function () { actionDefi(d.id); }); li.appendChild(b);
      }
      li.appendChild(cree("span", "cache", d.fait ? " (réussi)" : " (à faire)"));
      ul.appendChild(li);
    });
    /* Défi réussi pendant la visite : petite pluie de particules. */
    if (faitsAvant && Object.keys(faits).some(function (k) { return !faitsAvant[k]; })) celebrer();
    if (charge) faitsAvant = faits;
    var n = P.serie(donnees.versements, m), se = $("pg-serie"); se.textContent = "";
    for (var i = 5; i >= 0; i--) {
      var k = new Date(m.getFullYear(), m.getMonth() - i, 1), cle = k.getFullYear() + "-" + String(k.getMonth() + 1).padStart(2, "0");
      var somme = donnees.versements.filter(function (v) { return (v.le || "").slice(0, 7) === cle; }).reduce(function (t, v) { return t + v.montant; }, 0);
      var bar = cree("span", somme > 0 ? "" : "pg-mois-vide"); bar.title = MOIS[k.getMonth()] + " " + k.getFullYear() + (somme > 0 ? " : " + dt(somme) : " : aucun versement");
      bar.style.setProperty("--h", (somme > 0 ? 14 + Math.min(1, somme / Math.max.apply(null, [1].concat(donnees.versements.map(function (v) { return v.montant; })))) * 22 : 10) + "px");
      se.appendChild(bar);
    }
    se.appendChild(cree("small", "", n ? "Série : " + n + " mois de suite" : "Aucune série en cours"));
    se.setAttribute("aria-label", n ? "Série de " + n + " mois avec un versement" : "Aucune série en cours");
    se.setAttribute("role", "img");
    var bu = $("pg-badges"); bu.textContent = "";
    P.badges(donnees.objectifs, donnees.versements, sy, p, m).forEach(function (b) {
      var li = cree("li", "pg-badge" + (b.gagne ? " pg-badge--gagne" : "")), i = cree("i", "", BADGES[b.id]); i.setAttribute("aria-hidden", "true");
      li.appendChild(i); li.appendChild(doc.createTextNode(b.titre)); li.appendChild(cree("span", "cache", b.gagne ? " : gagné" : " : à gagner"));
      bu.appendChild(li);
    });
  }
  function actionDefi(id) {
    if (id === "premier") ouvrirDialogue(null, "projet");
    else if (id === "precaution") ouvrirDialogue(null, "precaution");
    else if (/^assurance-vie/.test(id)) {
      var imp = donnees.objectifs.filter(function (o) { return o.type === "impot"; })[0];
      if (imp) location.hash = "#vie?onglet=fiscal"; else ouvrirDialogue(null, "impot");
    } else if (id === "salaire") O.mettreAJourSalaire();
  }
  function celebrer() {
    if (O.mouvementReduit.matches) return;
    var cv = cree("canvas", "pg-confettis"); cv.setAttribute("aria-hidden", "true"); doc.body.appendChild(cv);
    var x = cv.getContext("2d"), r = window.devicePixelRatio || 1, Wd = innerWidth, Hd = innerHeight;
    if (!x) { cv.remove(); return; }
    cv.width = Wd * r; cv.height = Hd * r; x.scale(r, r);
    var st = getComputedStyle(doc.documentElement), cs = ["--salaire", "--credit", "--epargne", "--ambre"].map(function (v) { return st.getPropertyValue(v).trim() || "#12B76A"; }), ps = [];
    for (var i = 0; i < 90; i++) ps.push({ x: Wd / 2, y: Hd * 0.55, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 3, c: cs[i % 4], t: Math.random() * 3 + 2 });
    var n = 0;
    (function f() {
      x.clearRect(0, 0, Wd, Hd);
      ps.forEach(function (q) { q.vy += 0.35; q.x += q.vx; q.y += q.vy; x.fillStyle = q.c; x.globalAlpha = Math.max(0, 1 - n / 70); x.fillRect(q.x, q.y, q.t, q.t * 1.6); });
      if (++n < 70) requestAnimationFrame(f); else cv.remove();
    })();
  }

  /* ---------- Dialogue : créer / modifier un objectif ---------- */
  var dlg = $("dlg-objectif"), edite = null;
  function typeChoisi() { var r = doc.querySelector('input[name="obj-type"]:checked'); return r ? r.value : "projet"; }
  function majDialogue() {
    var t = typeChoisi(), p = O.profil(), sy = O.synthese(), cr = t === "credit";
    $("obj-credit-bloc").hidden = !cr;
    $("obj-montants").hidden = cr;
    $("obj-depart-bloc").hidden = t === "impot";
    $("obj-libelle").placeholder = cr ? "Solder mon crédit plus tôt" : P.NOMS_TYPES[t];
    var sug = $("obj-suggestion"), val = null, txt = "";
    if (t === "precaution" && sy) { val = P.ciblePrecaution(sy, p, 6); txt = "Suggestion : 6 mois de dépenses, " + dt(val); }
    if (t === "impot" && sy) { var fi = fiscal(sy); if (fi && fi.complement && fi.complement.total > 0) { val = fi.complement.total; txt = "Suggestion de l'optimiseur fiscal : " + dt(val) + " cette année"; } }
    sug.hidden = !val; sug.textContent = txt; sug.setAttribute("data-val", val || "");
    apercu();
  }
  function lireDialogue() {
    var t = typeChoisi(), mo = $("obj-mois").value, an = parseInt($("obj-annee").value, 10), echeance = null, err = null;
    if (mo) {
      var maint = new Date();
      if (!(an >= maint.getFullYear() && an <= maint.getFullYear() + 40)) err = "Année entre " + maint.getFullYear() + " et " + (maint.getFullYear() + 40) + ".";
      else echeance = an + "-" + String(mo).padStart(2, "0") + "-" + String(new Date(an, +mo, 0).getDate()).padStart(2, "0");
    }
    return { o: { id: edite ? edite.id : "apercu", type: t, libelle: $("obj-libelle").value, cible: lire($("obj-cible").value) || 0, depart: t === "impot" ? 0 : lire($("obj-depart").value) || 0,
      echeance: echeance, credit: t === "credit" ? +$("obj-credit").value : null }, errAnnee: err };
  }
  function apercu() {
    var l = lireDialogue(), p = O.profil(), sy = O.synthese(), out = $("obj-apercu");
    if (!p || !sy || (l.o.type !== "credit" && !(l.o.cible > 0)) || (l.o.type === "credit" && !p.credits.length)) { out.textContent = l.o.type === "credit" && !p.credits.length ? "Ajoutez d'abord un crédit à votre profil." : ""; return; }
    out.textContent = P.etatObjectif(l.o, donnees.versements, sy, p, new Date()).phrase;
  }
  function ouvrirDialogue(o, type) {
    var p = O.profil(); if (!p) return;
    edite = o || null;
    var t = o ? o.type : type || "projet";
    doc.querySelectorAll('input[name="obj-type"]').forEach(function (r) { r.checked = r.value === t; r.disabled = !!o && r.value !== t; });
    var sel = $("obj-credit"); sel.textContent = "";
    p.credits.forEach(function (c, i) { var op = cree("option", "", (c.libelle || "Crédit " + (i + 1)) + " · " + F.dt0(c.mensualite) + " DT/mois"); op.value = String(i); sel.appendChild(op); });
    if (o && o.credit != null) sel.value = String(o.credit);
    $("obj-libelle").value = o ? o.libelle : "";
    $("obj-cible").value = o && o.cible ? F.saisie(o.cible) : "";
    $("obj-depart").value = o && o.depart ? F.saisie(o.depart) : "";
    var maint = new Date();
    if (o && o.echeance) { $("obj-mois").value = String(+o.echeance.slice(5, 7)); $("obj-annee").value = o.echeance.slice(0, 4); }
    else if (t === "impot") { $("obj-mois").value = "12"; $("obj-annee").value = String(maint.getFullYear()); }
    else { $("obj-mois").value = ""; $("obj-annee").value = ""; }
    ["obj-cible-err", "obj-annee-err"].forEach(function (id) { $(id).hidden = true; });
    $("dlg-obj-titre").textContent = o ? "Modifier l'objectif" : "Nouvel objectif";
    $("obj-valider").textContent = o ? "Enregistrer" : "Créer l'objectif";
    $("obj-supprimer").hidden = !o;
    majDialogue();
    dlg.showModal();
    setTimeout(function () { (o ? $("obj-libelle") : doc.querySelector('input[name="obj-type"]:checked')).focus(); }, 30);
  }
  $("obj-types").addEventListener("change", majDialogue);
  ["obj-libelle", "obj-cible", "obj-depart", "obj-annee"].forEach(function (id) { $(id).addEventListener("input", apercu); });
  ["obj-mois", "obj-credit"].forEach(function (id) { $(id).addEventListener("change", apercu); });
  $("obj-suggestion").addEventListener("click", function () { var v = +this.getAttribute("data-val"); if (v > 0) { $("obj-cible").value = F.saisie(v); apercu(); } });
  $("form-objectif").addEventListener("submit", function (ev) {
    if (!ev.submitter || ev.submitter.value !== "ok") return;
    ev.preventDefault();
    var l = lireDialogue(), o = l.o, p = O.profil(), ok = true;
    $("obj-cible-err").hidden = true; $("obj-annee-err").hidden = true;
    if (o.type === "credit" && !p.credits.length) { O.toast("Ajoutez d'abord un crédit à votre profil (module Crédit ou Mon profil).", { type: "erreur" }); return; }
    if (o.type !== "credit" && !(o.cible > 0)) { $("obj-cible-err").textContent = "Indiquez le montant visé."; $("obj-cible-err").hidden = false; ok = false; }
    if (l.errAnnee) { $("obj-annee-err").textContent = l.errAnnee; $("obj-annee-err").hidden = false; ok = false; }
    if (!ok) return;
    if (o.type === "credit") { o.cible = 0; o.depart = 0; }
    var b = $("obj-valider"); b.disabled = true;
    var req = edite ? E.objectifs.modifier(edite.id, o) : E.objectifs.creer(o);
    req.then(function (r) {
      b.disabled = false;
      if (edite) donnees.objectifs = donnees.objectifs.map(function (x) { return x.id === r.id ? r : x; }); else donnees.objectifs.push(r);
      var nouveau = !edite;
      dlg.close("ok"); edite = null;
      compter(nouveau ? "objectif-creation" : "objectif-modification");
      signaler(); rendre();
      O.toast(nouveau ? "Objectif créé : Orbite le suit pour vous." : "Objectif mis à jour.", { type: "ok", detail: r.echeance && r.type !== "credit" ? "Un rappel vous sera proposé un mois avant l'échéance." : null });
    }, function (err) {
      b.disabled = false;
      O.toast(/Limite/.test(String(err && err.message)) ? "12 objectifs au plus : terminez ou supprimez-en un." : "L'objectif n'a pas été enregistré. Vérifiez votre connexion.", { type: "erreur" });
    });
  });
  $("obj-supprimer").addEventListener("click", function () {
    var o = edite; if (!o) return;
    var sesV = donnees.versements.filter(function (v) { return v.objectif === o.id; });
    dlg.close("supprimer"); edite = null;
    E.objectifs.supprimer(o.id).then(function () {
      donnees.objectifs = donnees.objectifs.filter(function (x) { return x.id !== o.id; });
      donnees.versements = donnees.versements.filter(function (v) { return v.objectif !== o.id; });
      faitsAvant = null; signaler(); rendre();
      O.toast("Objectif supprimé.", { action: { libelle: "Annuler", fn: function () {
        E.objectifs.creer(o).then(function (r) {
          donnees.objectifs.push(r);
          return sesV.reduce(function (pr, v) { return pr.then(function () { return E.objectifs.verser(r.id, v.montant, v.le).then(function (nv) { donnees.versements.push(nv); }); }); }, Promise.resolve());
        }).then(function () { faitsAvant = null; signaler(); rendre(); O.toast("Objectif rétabli."); }, function () { charger(true); O.toast("Le rétablissement n'a pas abouti entièrement.", { type: "erreur" }); });
      } } });
    }, function () { O.toast("La suppression n'a pas abouti. Vérifiez votre connexion.", { type: "erreur" }); });
  });

  /* ---------- Rendu et navigation ---------- */
  function rendre() {
    if ($("vue-progression").hidden) return;
    if (ongletActif() === "objectifs") rendreObjectifs(); else rendreCarriere();
  }
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "progression") return;
    if (!charge) charger();
    ouvrirOnglet(e.detail.params.get("onglet") || ongletActif());
  });
  O.surProfil(function () { rendre(); });
  /* Objectifs chargés dès le démarrage : leurs échéances alimentent les rappels. */
  if (O.pret) charger(); else doc.addEventListener("orbite:pret", function () { charger(); }, { once: true });

  window.OrbiteProgression = {
    objectifs: function () { return donnees.objectifs.slice(); },
    versements: function () { return donnees.versements.slice(); },
    recharger: function () { return charger(true); }
  };
})();
