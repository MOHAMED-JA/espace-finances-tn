/*
 * Orbite — « Mon année en orbite » (lot 6, maquette validée le 11 oct. 2026) : histoire en cartes plein écran
 * construite depuis Annee.bilan (profil + objectifs). Défilement automatique (7 s, pause au bouton, à l'appui long,
 * onglet masqué ou mouvement réduit), flèches du clavier, Échap pour fermer. Image de partage 1080 × 1350 dessinée
 * sur l'appareil, SANS AUCUN MONTANT (faits du bilan seulement). Rien n'est envoyé.
 * Accès : bouton dans Ma progression (toute l'année) et carte sur Mon orbite du 15 décembre au 31 janvier.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, A = window.Annee, doc = document, $ = O.$, F = O.F;
  var dlg = $("dlg-annee");
  if (!A || !dlg) return;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var DUREE = 7000, reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COULEURS = { credit: "#7EA2FF", pouvoir: "#F5B70A", hausse: "#4ADE80", objectif: "#A78BFA", serie: "#4ADE80", impot: "#A78BFA", profil: "#4ADE80" };
  var etat = { bilan: null, i: 0, minuteur: null, pause: false, appui: null, image: null };

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt0(v) { return F.dt0(v) + " DT"; }
  function dt3(v) { return F.dt3(v) + " DT"; }
  function pct1(v) { return (v >= 0 ? "+" : "−") + F.pct(Math.abs(v), 1); }
  function joindre(parent, enfants) { enfants.forEach(function (e) { if (e) parent.appendChild(e); }); return parent; }
  function phrase(parts) { var p = cree("p", "annee-txt"); parts.forEach(function (x) { p.appendChild(typeof x === "string" ? doc.createTextNode(x) : x); }); return p; }
  function gras(t) { return cree("b", null, t); }
  function grand(valeur, unite) { var p = cree("p", "annee-gros", valeur); if (unite) p.appendChild(cree("small", null, unite)); return p; }
  function legende(lignes) {
    var l = cree("div", "annee-leg");
    lignes.forEach(function (x) { var s = cree("span", "annee-leg__" + x[0], x[1]); l.appendChild(s); });
    return l;
  }
  function caisse() { var p = O.profil(); return p && p.secteur === "public" ? "CNRPS" : "CNSS"; }

  /* ---------- Cartes ---------- */
  var CARTES = {
    intro: function (c, b) {
      var orbe = cree("div", "annee-planete"); orbe.setAttribute("aria-hidden", "true");
      joindre(orbe, [cree("i"), cree("i"), cree("i"), cree("b"), cree("b")]);
      return { accent: "salaire", noeuds: [
        cree("p", "annee-sur", b.complete ? "Du 1er janvier au 31 décembre" : "Du 1er janvier au " + b.dateFin.getDate() + (b.dateFin.getDate() === 1 ? "er" : "") + " " + MOIS[b.dateFin.getMonth()]),
        cree("h3", "annee-h", "Votre année " + b.annee + " en orbite"), orbe,
        cree("p", "annee-txt", "Salaire, impôt, crédits, épargne : ce que votre argent a fait cette année, et ce qui vous attend en " + (b.annee + 1) + "."),
        cree("p", "annee-esti", "Touchez à droite pour avancer · " + b.cartes.length + " cartes")] };
    },
    salaire: function (c) {
      var s = c.salaire, bruts = s.mois.map(function (m) { return m.brutMensuel; }), max = Math.max.apply(null, bruts), min = Math.min.apply(null, bruts);
      var barres = cree("div", "annee-mois"); barres.setAttribute("aria-hidden", "true");
      s.mois.forEach(function (m, k) {
        /* Échelle resserrée entre le plus petit et le plus grand brut : une hausse se voit d'un coup d'œil. */
        var i = cree("i", m.brutMensuel >= max - 0.0005 && max > min ? "h" : "");
        i.style.setProperty("--h", (max > min ? 0.55 + 0.45 * (m.brutMensuel - min) / (max - min) : 0.85).toFixed(3)); i.style.setProperty("--d", (k * 45) + "ms");
        if (m.hausse) i.classList.add("a");
        barres.appendChild(i);
      });
      var dernier = s.mois[s.mois.length - 1], h = s.hausses[s.hausses.length - 1];
      var txt = h ? phrase(["En " + MOIS[h.mois] + ", ", gras("+" + dt0(h.brut) + " brut"), " : ", gras("+" + dt3(h.net) + " net"), " chaque mois depuis."])
        : phrase(["Un salaire stable : ", gras(dt3(dernier.netMensuel) + " net"), " par mois."]);
      return { accent: "salaire", noeuds: [cree("p", "annee-sur", "Salaire"), cree("h3", "annee-h", "Vous avez reçu"), grand(F.dt0(s.net), " DT net"), barres, txt,
        cree("p", "annee-esti", "Estimation mois par mois d'après votre historique de salaire.")] };
    },
    impot: function (c, b) {
      var s = c.salaire, vous = Math.round(s.pourVous * 100), cot = Math.round(s.cotisations / s.brut * 100);
      var grille = cree("div", "annee-cent"); grille.setAttribute("aria-hidden", "true");
      for (var k = 0; k < 100; k++) { var i = cree("i", k < vous ? "" : k < vous + cot ? "c" : "p"); i.style.setProperty("--d", (k * 7) + "ms"); grille.appendChild(i); }
      return { accent: "epargne", noeuds: [cree("p", "annee-sur", "Impôt et cotisations"), cree("h3", "annee-h", "Sur 100 DT de brut, " + vous + " DT pour vous"), grille,
        legende([["vous", "Vous : " + dt0(s.net)], ["caisse", caisse() + " : " + dt0(s.cotisations)], ["impot", "Impôt et CSS : " + dt0(s.impot)]]),
        cree("p", "annee-esti", "Estimation selon les barèmes " + b.annee + ".")] };
    },
    pouvoir: function (c, b) {
      var pa = c.pouvoir, gagne = pa.gain > 0, max = Math.max(pa.evolution, pa.inflation, 0.001);
      var duel = cree("div", "annee-duel");
      [["salaire", "Votre salaire brut", pa.evolution], ["prix", "Les prix (inflation " + b.annee + ")", pa.inflation]].forEach(function (x) {
        var d = cree("div", "annee-duel__" + x[0]), barre = cree("i");
        barre.style.setProperty("--w", Math.max(0.03, Math.max(0, x[2]) / max).toFixed(3));
        joindre(d, [cree("span", null, x[1]), barre, cree("b", null, pct1(x[2]))]);
        duel.appendChild(d);
      });
      var noeuds = [cree("p", "annee-sur", "Pouvoir d'achat"), cree("h3", "annee-h", gagne ? "Votre salaire a battu les prix" : "Les prix ont monté plus vite"), grand(pct1(pa.gain).replace(/ %$/, ""), " %"), duel];
      if (!gagne) noeuds.push(phrase(["Pour garder votre pouvoir d'achat, il faudrait ", gras(dt0(c.salaire.brutDebut * (1 + pa.inflation)) + " brut"), " par mois."]));
      noeuds.push(cree("p", "annee-esti", pa.provisoire ? "Inflation de l'INS, provisoire pour " + b.annee + "." : "Inflation de l'INS."));
      return { accent: "ambre", noeuds: noeuds };
    },
    credits: function (c) {
      var cr = c.credits, total = cr.capital + cr.interets || 1;
      var barre = cree("div", "annee-fond"); barre.setAttribute("aria-hidden", "true");
      var a = cree("i"), b = cree("i"); a.style.setProperty("--w", (cr.capital / total).toFixed(3)); b.style.setProperty("--w", (cr.interets / total).toFixed(3));
      joindre(barre, [a, b]);
      var noeuds = [cree("p", "annee-sur", "Crédits"), cree("h3", "annee-h", "Vos crédits ont fondu de"), grand(F.dt0(cr.capital), " DT"), barre,
        legende([["capital", "Capital remboursé : " + dt0(cr.capital)], ["interets", "Intérêts : " + dt0(cr.interets)]])];
      cr.soldes.slice(0, 2).forEach(function (s) { noeuds.push(cree("p", "annee-badge", "✓ Crédit " + (A.CREDIT_NOM[s.type] ? A.CREDIT_NOM[s.type] + " " : "") + "soldé en " + s.fin)); });
      noeuds.push(cree("p", "annee-esti", "D'après les dates, la durée, la mensualité et le taux de vos crédits."));
      return { accent: "credit", noeuds: noeuds };
    },
    epargne: function (c) {
      var ep = c.epargne, parts = [];
      if (ep.av > 0) parts.push(gras(dt0(ep.av)), " en assurance vie");
      if (ep.cea > 0) { if (parts.length) parts.push(", "); parts.push(gras(dt0(ep.cea)), " en CEA"); }
      if (ep.impotEvite > 0) parts.push(" : ", gras(dt0(ep.impotEvite)), " d'impôt évité");
      if (ep.objectifs > 0) { if (parts.length) parts.push(". "); parts.push(gras(dt0(ep.objectifs)), " notés avec « J'ai épargné »"); }
      var noeuds = [cree("p", "annee-sur", "Épargne"), cree("h3", "annee-h", ep.total > 0 ? "Vous avez mis de côté" : "Votre épargne"), ep.total > 0 ? grand(F.dt0(ep.total), " DT") : null];
      if (parts.length) { parts.push("."); noeuds.push(phrase(parts)); }
      if (ep.objectif) {
        var j = cree("div", "annee-jauge"), i = cree("i"); i.style.setProperty("--w", ep.objectif.pct.toFixed(3)); j.appendChild(i); j.setAttribute("aria-hidden", "true");
        noeuds.push(j, cree("p", "annee-txt", ep.objectif.atteint ? "Objectif « " + ep.objectif.nom + " » atteint." : F.pct(ep.objectif.pct, 0) + " de votre objectif « " + ep.objectif.nom.toLowerCase() + " »."));
      }
      if (ep.serie >= 1) {
        var s = cree("div", "annee-serie"); s.setAttribute("aria-hidden", "true");
        for (var k = 0; k < 12; k++) { var x = cree("i", k >= 12 - Math.min(ep.serie, 12) ? "ok" : ""); x.style.setProperty("--d", (k * 40) + "ms"); s.appendChild(x); }
        noeuds.push(cree("p", "annee-txt", ep.serie + (ep.serie > 1 ? " mois" : " mois") + " d'épargne d'affilée"), s);
      }
      noeuds.push(cree("p", "annee-esti", "Versements des contrats estimés d'après votre profil."));
      return { accent: "epargne", noeuds: noeuds };
    },
    avenir: function (c, b) {
      var ul = cree("ul", "annee-faits");
      c.items.forEach(function (it) {
        var li = cree("li", "annee-fait annee-fait--" + it.type), t = cree("span");
        if (it.type === "credit-fin") joindre(t, [doc.createTextNode("Votre crédit " + (it.nom ? it.nom + " " : "") + "se termine en " + it.fin + " : "), gras(dt0(it.mensualite) + " par mois"), doc.createTextNode(" libérés.")]);
        else if (it.type === "capacite") joindre(t, [gras(dt0(it.capital)), doc.createTextNode(" empruntables pour un logement (mensualité de " + dt3(it.mensualite) + ")" + (it.grace ? ", grâce à la marge retrouvée." : "."))]);
        else if (it.type === "impot-jours") joindre(t, [doc.createTextNode("Il reste "), gras(it.jours + (it.jours > 1 ? " jours" : " jour")), doc.createTextNode(" pour réduire votre impôt " + it.annee + " : jusqu'à " + dt0(it.gain) + " avec l'assurance vie et le CEA.")]);
        else if (it.type === "impot") joindre(t, [doc.createTextNode("En " + it.annee + ", jusqu'à "), gras(dt0(it.gain)), doc.createTextNode(" d'impôt évitables avec l'assurance vie et le CEA.")]);
        else if (it.type === "objectif") joindre(t, [gras(dt0(it.reste)), doc.createTextNode(" pour finir votre objectif « " + it.nom.toLowerCase() + " », soit " + dt0(it.mensuel) + " par mois.")]);
        li.appendChild(cree("i")); li.appendChild(t); ul.appendChild(li);
      });
      return { accent: "credit", noeuds: [cree("p", "annee-sur", "En " + (b.annee + 1)), cree("h3", "annee-h", "Ce qui vous attend"), ul] };
    },
    synthese: function (c, b) {
      var ul = cree("ul", "annee-faits annee-faits--synthese");
      c.faits.forEach(function (f) { var li = cree("li", "annee-fait annee-fait--" + f.cle); li.appendChild(cree("i")); li.appendChild(cree("span", null, f.texte)); ul.appendChild(li); });
      var pied = cree("div", "annee-pied"), partager = cree("button", "annee-action annee-action--plein", "Partager mon année (sans montants)"), revoir = cree("button", "annee-action", "Revoir depuis le début");
      partager.type = revoir.type = "button"; partager.id = "annee-ouvrir-partage";
      partager.addEventListener("click", ouvrirPartage);
      revoir.addEventListener("click", function () { montrer(0); });
      joindre(pied, [partager, revoir]);
      return { accent: "salaire", noeuds: [cree("p", "annee-sur", "Votre année en un coup d'œil"), cree("h3", "annee-h", b.annee + ", votre orbite"), ul, pied] };
    }
  };

  /* ---------- Histoire ---------- */
  var conteneur = $("annee-cartes"), barres = $("annee-barres"), scene = $("annee-scene");
  function construire(b) {
    conteneur.textContent = ""; barres.textContent = "";
    b.cartes.forEach(function (c, k) {
      var r = CARTES[c.id](c, b), s = cree("section", "annee-carte");
      s.setAttribute("data-accent", r.accent); s.setAttribute("aria-label", "Carte " + (k + 1) + " sur " + b.cartes.length);
      s.hidden = true;
      joindre(s, r.noeuds);
      conteneur.appendChild(s);
      var t = cree("i"); t.appendChild(cree("b")); barres.appendChild(t);
    });
    $("annee-titre").textContent = "Mon année " + b.annee + " en orbite";
  }
  function planifier() {
    clearTimeout(etat.minuteur);
    scene.classList.toggle("en-pause", etat.pause || reduit);
    if (etat.pause || reduit || etat.i >= etat.bilan.cartes.length - 1) return;
    etat.minuteur = setTimeout(function () { montrer(etat.i + 1); }, DUREE);
  }
  function montrer(n) {
    var cartes = conteneur.children;
    etat.i = Math.max(0, Math.min(cartes.length - 1, n));
    for (var k = 0; k < cartes.length; k++) { cartes[k].hidden = k !== etat.i; barres.children[k].className = k < etat.i ? "fait" : k === etat.i ? "encours" : ""; }
    /* Relance l'animation de la barre en cours. */
    var b = barres.children[etat.i].firstChild; b.style.animation = "none"; void b.offsetWidth; b.style.removeProperty("animation");
    scene.setAttribute("data-accent", cartes[etat.i].getAttribute("data-accent"));
    $("annee-prec").disabled = etat.i === 0; $("annee-suiv").disabled = etat.i === cartes.length - 1;
    planifier();
  }
  function basculerPause(v) {
    etat.pause = v == null ? !etat.pause : v;
    var bp = $("annee-pause"); bp.setAttribute("aria-pressed", etat.pause ? "true" : "false"); bp.setAttribute("aria-label", etat.pause ? "Reprendre" : "Mettre en pause");
    planifier();
  }

  function donnees() {
    var P = window.OrbiteProgression;
    return P ? { objectifs: P.objectifs(), versements: P.versements() } : { objectifs: [], versements: [] };
  }
  function ouvrir() {
    var p = O.profil();
    if (!p || (O.profilVierge && O.profilVierge())) { E.toast("Indiquez d'abord votre salaire : votre année se construit à partir de votre profil."); return; }
    try { etat.bilan = A.bilan(p, donnees(), new Date()); } catch (e) { E.toast("Le bilan n'a pas pu être calculé. Vérifiez votre profil.", { erreur: true }); return; }
    construire(etat.bilan);
    $("annee-partage").hidden = true;
    etat.pause = false;
    dlg.showModal();
    montrer(0);
    try { localStorage.setItem("orbite-annee-vue-" + etat.bilan.annee, "1"); } catch (e) {}
    majAcces();
    E.compterUsage("simulation", "annee");
  }
  function fermer() { clearTimeout(etat.minuteur); if (dlg.open) dlg.close(); }

  $("annee-suiv").addEventListener("click", function () { montrer(etat.i + 1); });
  $("annee-prec").addEventListener("click", function () { montrer(etat.i - 1); });
  $("annee-fermer").addEventListener("click", fermer);
  $("annee-pause").addEventListener("click", function () { basculerPause(); });
  dlg.addEventListener("close", function () { clearTimeout(etat.minuteur); });
  dlg.addEventListener("keydown", function (e) {
    if (!$("annee-partage").hidden) return;
    if (e.key === "ArrowRight") { e.preventDefault(); montrer(etat.i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); montrer(etat.i - 1); }
    else if (e.key === " " && e.target === scene) { e.preventDefault(); basculerPause(); }
  });
  /* Appui long (plus d'un tiers de seconde) : pause tant que le doigt reste posé, sans changer de carte. */
  scene.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button:not(.annee__zone), a")) return;
    etat.appui = { t: Date.now(), avant: etat.pause }; clearTimeout(etat.minuteur);
  });
  ["pointerup", "pointercancel"].forEach(function (n) {
    scene.addEventListener(n, function () {
      if (!etat.appui) return;
      var a = etat.appui; etat.appui = null; etat.long = Date.now() - a.t > 350;
      if (!a.avant) planifier();
    });
  });
  /* Après un appui long, le relâchement ne change pas de carte. */
  scene.addEventListener("click", function (e) {
    if (etat.long && e.target.classList.contains("annee__zone")) { e.stopPropagation(); e.preventDefault(); }
    etat.long = false;
  }, true);
  doc.addEventListener("visibilitychange", function () { if (!dlg.open) return; if (doc.hidden) clearTimeout(etat.minuteur); else planifier(); });
  doc.addEventListener("click", function (e) { if (e.target.closest("[data-ouvrir-annee]")) ouvrir(); });

  /* ---------- Image de partage (sans montant) ---------- */
  function dessiner(b) {
    var W = 1080, H = 1350, c = doc.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = "#0A0D16"; g.fillRect(0, 0, W, H);
    var lueur = g.createRadialGradient(W * 0.75, 140, 40, W * 0.75, 140, 760); lueur.addColorStop(0, "rgba(74,222,128,.22)"); lueur.addColorStop(1, "rgba(74,222,128,0)");
    g.fillStyle = lueur; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2; g.setLineDash([10, 12]);
    g.beginPath(); g.arc(W - 120, 150, 330, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(W - 120, 150, 210, 0, Math.PI * 2); g.stroke();
    var pl = g.createRadialGradient(W - 160, 110, 10, W - 120, 150, 110); pl.addColorStop(0, "#86EFAC"); pl.addColorStop(0.6, "#12B76A"); pl.addColorStop(1, "#065F46");
    g.fillStyle = pl; g.beginPath(); g.arc(W - 120, 150, 100, 0, Math.PI * 2); g.fill();
    [["#7EA2FF", W - 120 + 210 * Math.cos(2.4), 150 + 210 * Math.sin(2.4), 16], ["#A78BFA", W - 120 + 330 * Math.cos(2.1), 150 + 330 * Math.sin(2.1), 13]].forEach(function (s) { g.fillStyle = s[0]; g.beginPath(); g.arc(s[1], s[2], s[3], 0, Math.PI * 2); g.fill(); });
    g.fillStyle = "#4ADE80"; g.font = "700 34px 'Mona Sans', system-ui, sans-serif"; g.fillText("ORBITE", 90, 470);
    g.fillStyle = "#F2F4F8"; g.font = "800 96px 'Bricolage Grotesque', system-ui, sans-serif";
    g.fillText("Mon année " + b.annee, 90, 580); g.fillText("en orbite", 90, 690);
    var y = 820;
    g.font = "600 44px 'Mona Sans', system-ui, sans-serif";
    b.faits.forEach(function (f) {
      g.fillStyle = COULEURS[f.cle] || "#4ADE80"; g.beginPath(); g.arc(108, y - 15, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#F2F4F8"; g.fillText(f.texte, 145, y);
      y += 92;
    });
    g.fillStyle = "rgba(242,244,248,.6)"; g.font = "500 30px 'Mona Sans', system-ui, sans-serif";
    g.fillText("Salaire, crédit, impôt et retraite en Tunisie", 90, H - 120);
    g.fillText("espace-finances-tn.jaouadimohamedaziz.workers.dev", 90, H - 74);
    return c;
  }
  function ouvrirPartage() {
    var b = etat.bilan; basculerPause(true);
    var pret = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    pret.then(function () {
      dessiner(b).toBlob(function (blob) {
        if (!blob) { E.toast("L'image n'a pas pu être créée.", { erreur: true }); return; }
        if (etat.image) URL.revokeObjectURL(etat.image.url);
        var url = URL.createObjectURL(blob), fichier = typeof File === "function" ? new File([blob], "mon-annee-orbite-" + b.annee + ".png", { type: "image/png" }) : null;
        etat.image = { url: url, fichier: fichier };
        $("annee-image").src = url; $("annee-telecharger").href = url; $("annee-telecharger").download = "mon-annee-orbite-" + b.annee + ".png";
        $("annee-partager").hidden = !(fichier && navigator.canShare && navigator.canShare({ files: [fichier] }));
        $("annee-partage").hidden = false;
        $("annee-partage-fermer").focus();
      }, "image/png");
    });
  }
  $("annee-partager").addEventListener("click", function () {
    if (!etat.image || !etat.image.fichier) return;
    navigator.share({ files: [etat.image.fichier], title: "Mon année " + etat.bilan.annee + " en orbite", text: "Mon année " + etat.bilan.annee + " en orbite, avec Orbite." }).catch(function () {});
    E.compterUsage("simulation", "annee-partage");
  });
  $("annee-telecharger").addEventListener("click", function () { E.compterUsage("simulation", "annee-partage"); });
  $("annee-partage-fermer").addEventListener("click", function () { $("annee-partage").hidden = true; scene.focus(); });

  /* ---------- Accès : bouton de Ma progression, carte de fin d'année sur Mon orbite ---------- */
  function majAcces() {
    var per = A.periode(new Date()), vierge = !O.profil() || (O.profilVierge && O.profilVierge());
    var bouton = $("btn-annee"), rdv = $("annee-rdv");
    bouton.hidden = vierge;
    $("btn-annee-lib").textContent = "Mon année " + per.annee + (per.complete ? "" : " jusqu'ici");
    var vue = false; try { vue = localStorage.getItem("orbite-annee-vue-" + per.annee) === "1"; } catch (e) {}
    rdv.hidden = vierge || !per.rendezVous;
    $("annee-rdv-sur").textContent = per.complete ? "Bilan " + per.annee : "Bilan de fin d'année";
    $("annee-rdv-titre").textContent = vue ? "Revoir votre année " + per.annee : "Votre année " + per.annee + " est prête";
  }
  if (O.pret) majAcces(); else doc.addEventListener("orbite:pret", majAcces, { once: true });
  O.surProfil(majAcces);

  window.OrbiteAnnee = { ouvrir: ouvrir, bilan: function () { return etat.bilan; } };
})();
