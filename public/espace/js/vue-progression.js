/*
 * Orbite — « Ma progression » (route #progression, onglet par #progression?onglet=carriere|objectifs).
 * Carrière : salaire brut face à l'inflation (Progression.carriere), courbe SVG construite en DOM, projection réglable.
 * Objectifs : cartes avec jauge, « J'ai épargné » (versement + épargne disponible du profil, annulable), crédit suivi
 * automatiquement, défis du mois, série et badges. Données : tables objectifs / objectifs_versements (Espace.objectifs).
 * Retraite : estimation CNSS / CNRPS (Retraite.estimer), curseur d'âge, écart à 80 % du net, objectif « Retraite ».
 * Expose window.OrbiteProgression.objectifs() pour les rappels d'échéance (appli.js) ; événement « orbite:objectifs ».
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, P = window.Progression, RT = window.Retraite, OC = window.OrbiteCalcul, OI = window.OrbiteIntelligence;
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
  var ONGLETS = ["carriere", "objectifs", "retraite", "liberte"], barre = doc.querySelector(".pg-onglets");
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
    var i = ONGLETS.indexOf(barre.getAttribute("data-o")), cle = ONGLETS[(Math.max(0, i) + (e.key === "ArrowRight" ? 1 : ONGLETS.length - 1)) % ONGLETS.length];
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

  /* ---------- Courbe : brut en escalier, valeur réelle, projection (moteur commun des graphiques) ---------- */
  /* Retraite : la frise est redessinée quand la largeur change (rotation du téléphone). */
  var minuterieTaille = null;
  window.addEventListener("resize", function () {
    clearTimeout(minuterieTaille);
    minuterieTaille = setTimeout(function () { if (!$("vue-progression").hidden && ongletActif() === "retraite") rendreRetraite(); }, 200);
  });
  function dessiner(c, pr, inf) {
    var boite = $("pg-graphe"), etroit = (boite.clientWidth || 680) < 520;
    var m = new Date(), an = m.getFullYear(), maintenant = an + m.getMonth() / 12;
    var x0 = c.etapes[0].annee + (c.etapes[0].mois - 1) / 12, x1 = pr[pr.length - 1].annee + 1;
    var debut = c.bilan.depuis, ixAuj = P.indice(debut, an), ret = retraite(), mot = ret ? "pension brute" : "salaire brut";
    var reel = c.annuel.filter(function (a) { return a.reel != null; }).map(function (a) { return [a.annee + 0.5, a.reel]; });
    var projB = pr.slice(1).map(function (q) { return [q.annee + 0.5, q.brut]; });
    var projR = pr.slice(1).map(function (q, i) { return [q.annee + 0.5, q.brut / (ixAuj * Math.pow(1 + inf, i + 1))]; });
    var marches = c.etapes.map(function (e) { return [e.annee + (e.mois - 1) / 12, e.brut]; }), dernier = c.etapes[c.etapes.length - 1].brut;
    marches.push([maintenant, dernier]);
    var vals = marches.map(function (q) { return q[1]; }).concat(reel.map(function (r) { return r[1]; }), projB.map(function (r) { return r[1]; }), projR.map(function (r) { return r[1]; }));
    var vmin = Math.min.apply(null, vals), ticks = [];
    for (var a = Math.ceil(x0); a < x1; a++) ticks.push({ v: a + 0.5, lib: String(a) });
    var series = [{ nom: ret ? "Pension brute" : "Brut", c: 3, pts: marches, marche: true, aire: true }];
    if (reel.length > 1) series.push({ nom: "En dinars de " + debut, c: 2, pts: reel, tirets: true });
    series.push({ nom: "Projection", c: 3, pts: [[maintenant, dernier]].concat(projB), pointille: true });
    if (reel.length) series.push({ nom: "Projection en dinars de " + debut, c: 2, pts: [reel[reel.length - 1]].concat(projR), pointille: true });
    window.OrbiteGraphe.lignes(boite, {
      titre: "Votre " + mot + " depuis " + c.etapes[0].annee, resume: "Courbe du " + mot + " depuis " + c.etapes[0].annee + ", sa valeur en dinars de " + debut + " et la projection jusqu'en " + pr[pr.length - 1].annee + ".",
      series: series, xmin: x0, xmax: x1, ymin: Math.max(0, Math.floor(vmin * 0.9 / 500) * 500), ticksX: ticks, hauteur: etroit ? 250 : 300,
      verticales: [{ x: maintenant, lib: "Aujourd'hui" }],
      marqueurs: c.hausses.map(function (h) { return { x: h.annee + (h.mois - 1) / 12, y: h.apres, c: h.verdict === "perdu" ? "danger" : "ok", texte: signe(h.hausse), lib: "Hausse de " + signe(h.hausse) + " en " + MOIS[h.mois - 1] + " " + h.annee }; }),
      titreX: function (x) { var y = Math.floor(x); return String(y) + (y > an ? " · projection" : ""); },
      fmtV: dt, fmtY: function (v) { return F.dt0(v); }, tableau: { entete: "Année" }
    });
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


  /* ===================================================================
     Retraite (lot 4)
     =================================================================== */
  var ageChoisi = null;
  function rendreRetraite() {
    var p = O.profil(), sy = O.synthese(); if (!p || !sy || !RT) return;
    var m = new Date(), b = RT.bornes(p, m), vide = $("pr-vide"), plein = $("pr-plein"), act = $("pr-vide-actions");
    function videAvec(texte, liens) {
      vide.hidden = false; plein.hidden = true; $("pr-vide-texte").textContent = texte; act.textContent = "";
      liens.forEach(function (l) { var a = cree("a", "bouton bouton--petit " + (l[2] ? "bouton--plein" : "bouton--fantome"), l[0]); a.href = l[1]; act.appendChild(a); });
    }
    if (p.activite === "retraite") return videAvec("Vous êtes à la retraite : votre pension, son détail et la hausse prévue par la loi de finances 2026 sont dans « Ma pension ».", [["Voir ma pension", "#salaire", true]]);
    if (!p.dateNaissance) return videAvec("Indiquez votre date de naissance dans votre profil : Orbite en déduit votre âge de départ et votre pension.", [["Compléter mon profil", "#profil?section=identite", true]]);
    if (!b.possible) return videAvec("Vous avez dépassé l'âge maximal de départ de votre caisse : demandez la liquidation de votre pension à la " + (b.caisse === "cnss" ? "CNSS." : "CNRPS."), []);
    if (!p.debutCarriere && !p.dateEmbauche) return videAvec("Indiquez le début de votre carrière (premier emploi déclaré) : Orbite compte vos années de cotisation.", [["Ajouter le début de carrière", "#profil?section=salaire", true]]);
    vide.hidden = true; plein.hidden = false;
    var curseur = $("pr-age");
    curseur.min = b.min; curseur.max = b.max;
    if (ageChoisi == null || ageChoisi < b.min || ageChoisi > b.max) ageChoisi = b.defaut;
    curseur.value = String(ageChoisi);
    var e = RT.estimer(p, sy, { age: ageChoisi, maintenant: m }), cnss = e.caisse === "cnss";
    var depLib = libMois(e.depart);
    $("pr-info").textContent = (cnss ? "CNSS (secteur privé)" : "CNRPS (secteur public)") + " · début de carrière : " + (e.debut ? MOIS[e.debut.getMonth()] + " " + e.debut.getFullYear() : "?") +
      (e.debutConnu ? "" : " (date d'embauche)") + (p.anneesSansCotisation ? " · " + p.anneesSansCotisation + " an" + (p.anneesSansCotisation > 1 ? "s" : "") + " sans cotisation" : "") + " · ";
    var lien = cree("a", "", e.debutConnu ? "modifier dans Mon profil" : "préciser dans Mon profil"); lien.href = "#profil?section=salaire"; $("pr-info").appendChild(lien);
    $("pr-age-v").textContent = ageChoisi + " ans";
    reperesAge(b);
    var ok = e.etat === "ok";
    $("pr-refus").hidden = ok; $("pr-refus").textContent = ok ? "" : e.raisons.join(" ");
    $("pr-lib").textContent = "Pension nette estimée, à " + ageChoisi + " ans (" + depLib + ")";
    $("pr-net").textContent = ok ? F.dt0(e.net) : "—";
    $("pr-sous").textContent = ok ? "en dinars d'aujourd'hui · brute " + dt(e.brut) + " · taux " + F.pct(e.taux / 100, e.taux % 1 ? 1 : 0) + " du salaire de référence" +
      (e.reduction ? " (dont −" + e.reduction + " points pour départ anticipé, définitif)" : "") + (e.auMinimum ? " · minimum de pension appliqué" : "") : "Pas de pension à cet âge avec vos années de cotisation.";
    var pa = $("pr-pastille"); pa.hidden = !ok;
    pa.textContent = F.pct(e.remplacement, 0) + " de votre net actuel"; pa.className = "pr-pastille " + (e.ecart > 0 ? "pr-pastille--court" : "pr-pastille--ok");
    /* Barre : pension, écart, objectif 80 %, échelle = net actuel. */
    var ech = Math.max(e.netActuel, e.net) * 1.02 || 1;
    $("pr-b-pension").style.setProperty("width", (e.net / ech * 100) + "%");
    $("pr-b-manque").style.setProperty("left", (e.net / ech * 100) + "%"); $("pr-b-manque").style.setProperty("width", (e.ecart / ech * 100) + "%");
    $("pr-b-cible").style.setProperty("left", (e.cible / ech * 100) + "%");
    $("pr-barre").setAttribute("aria-label", "Pension nette " + dt(e.net) + ", objectif " + dt(e.cible) + ", net actuel " + dt(e.netActuel));
    $("pr-l-pension").textContent = F.dt0(e.net); $("pr-l-ecart").textContent = F.dt0(e.ecart); $("pr-l-cible").textContent = F.dt0(e.cible); $("pr-l-net").textContent = F.dt0(e.netActuel);
    friseRetraite(e, m);
    var pl = $("pr-plafond"); pl.hidden = !(cnss && e.depassePlafond > 1);
    if (!pl.hidden) pl.textContent = "Votre brut moyen (" + dt(e.refBrute) + " par mois, primes comprises) dépasse le plafond de la CNSS de base, 6 SMIG (" + dt(e.plafond) + ") : " + dt(e.depassePlafond) + " ne comptent pas pour cette pension. Une retraite complémentaire, si votre employeur en a une, viendrait en plus (non comptée ici).";
    /* Écart et objectif. */
    var ex = $("pr-ecart"), a0 = e.ecart > 0.5 && ok;
    ex.textContent = !ok ? "—" : a0 ? dt(e.ecart) + " / mois" : "Aucun écart"; ex.classList.toggle("pr-ecart--zero", ok && !a0);
    $("pr-capital").textContent = !ok ? "" : a0 ? "Soit un capital d'environ " + dt(Math.round(e.capital / 100) * 100) + " pour 20 ans de retraite." : "Votre pension estimée dépasse 80 % de votre net actuel : rien à combler à cet âge.";
    $("pr-effort").hidden = !a0; $("pr-objectif").hidden = !a0; $("pr-astuce").hidden = !a0;
    if (a0) {
      $("pr-mensuel").textContent = dt(e.mensuel);
      $("pr-jusqua").textContent = "jusqu'à " + depLib + " (rendement réel supposé : 2 % par an)";
      var existant = objectifRetraite();
      $("pr-objectif").textContent = existant ? "Mettre à jour l'objectif « Retraite »" : "Créer l'objectif « Retraite »";
    }
    /* Calcul détaillé. */
    var L = cnss ? [["Trimestres cotisés au départ", F.dt0(e.trimestres)], ["Taux (40 % + 0,5 % par trimestre au-delà de 40, 80 % au plus)", F.pct(e.tauxBrut / 100, 0)]]
      : [["Années de service au départ", String(Math.round(e.annees * 10) / 10).replace(".", ",")], ["Taux (2 % · 3 % · 2 % par an, 90 % au plus)", F.pct(e.tauxBrut / 100, e.tauxBrut % 1 ? 1 : 0)]];
    if (e.reduction) L.push(["Réduction pour départ avant 60 ans", "−" + e.reduction + " points"]);
    L.push([cnss ? "Salaire de référence (moyenne 10 ans, 6 SMIG au plus)" : "Salaire de référence (dernière rémunération)", dt(e.reference)]);
    if (ok) { L.push(["Pension brute", dt(e.brut)]); L.push(["Retenue maladie (4 %) et impôt", "−" + dt(e.brut - e.net)]); L.push(["Pension nette", dt(e.net)]); }
    var dl = $("pr-calcul"); dl.textContent = "";
    L.forEach(function (l) { var d = cree("div"); d.appendChild(cree("dt", "", l[0])); d.appendChild(cree("dd", "chiffre", l[1])); dl.appendChild(d); });
    /* Réserves et sources. */
    var res = [["!", "Estimation, pas un relevé officiel : demandez votre relevé de carrière à la " + (cnss ? "CNSS" : "CNRPS") + " avant toute décision."]];
    if (cnss) res.push(["!", "Départ avant 60 ans : la réduction de 2 points par année reste à vie, même après 60 ans."]);
    else res.push(["!", "Départ à 57 ans avec 15 ans de service : mesure exceptionnelle, non simulée ici (renseignez-vous auprès de la CNRPS)."]);
    if (!e.debutConnu) res.push(["!", "Début de carrière inconnu : Orbite compte depuis votre date d'embauche. Précisez-le dans Mon profil si vous avez travaillé avant."]);
    res.push(["≈", "Calcul en dinars d'aujourd'hui, salaire supposé constant jusqu'au départ" + (cnss ? " ; brut moyen par mois, primes comprises." : " ; primes non soumises à retenue comprises.")]);
    res.push(["≈", "20 ans de retraite ; rendement réel de l'épargne 2 % par an" + (cnss ? " ; réduction anticipée en points de taux." : ".")]);
    var ul = $("pr-reserves"); ul.textContent = "";
    res.forEach(function (r) { var li = cree("li", r[0] === "≈" ? "pr-reserves__hyp" : ""), i = cree("span", "pr-reserves__ico", r[0]); i.setAttribute("aria-hidden", "true"); li.appendChild(i); li.appendChild(cree("span", "", r[1])); ul.appendChild(li); });
    var us = $("pr-sources");
    if (!us.firstChild) RT.REGLES.sources.forEach(function (x) { var li = cree("li"), a = cree("a", "", x.titre); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; li.appendChild(a); us.appendChild(li); });
    dernierRetraite = e;
  }
  var dernierRetraite = null;
  function reperesAge(b) {
    var box = $("pr-reperes"); box.textContent = "";
    var pts = b.caisse === "cnss" ? [[55, "55 ans · anticipé"], [60, "60 ans · âge légal"], [65, "65 ans"]] : [[62, "62 ans · âge légal"], [65, "65 ans · sur demande"]];
    pts.filter(function (x) { return x[0] >= b.min && x[0] <= b.max; }).forEach(function (x) {
      var sp = cree("span", x[0] === b.legal ? "pr-reperes__legal" : "", x[1]), pc = b.max > b.min ? (x[0] - b.min) / (b.max - b.min) : 0;
      sp.style.setProperty("--pc", pc);
      if (pc === 0) sp.classList.add("pr-reperes__debut"); else if (pc === 1) sp.classList.add("pr-reperes__fin");
      box.appendChild(sp);
    });
  }
  function friseRetraite(e, m) {
    var boite = $("pr-frise"); boite.textContent = "";
    var etroit = (boite.clientWidth || 640) < 480, W = etroit ? 360 : 640, H = 92, g = 8, d = 8, y = 34, h = 14;
    var x0 = e.debut.getFullYear() + e.debut.getMonth() / 12, x1 = e.depart.getFullYear() + e.depart.getMonth() / 12, xa = m.getFullYear() + m.getMonth() / 12;
    function X(a) { return g + Math.max(0, Math.min(1, (a - x0) / (x1 - x0))) * (W - g - d); }
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Cotisation de " + libMois(e.debut) + " à " + libMois(e.depart) + " : " + Math.floor(e.moisFaits / 3) + " trimestres à ce jour" });
    s.appendChild(svg("rect", { class: "pr-f-fond", x: g, y: y, width: W - g - d, height: h, rx: 7 }));
    s.appendChild(svg("rect", { class: "pr-f-fait", x: g, y: y, width: Math.max(0, X(xa) - g), height: h, rx: 7 }));
    s.appendChild(svg("rect", { class: "pr-f-avenir", x: X(xa), y: y, width: Math.max(0, X(x1) - X(xa)), height: h }));
    s.appendChild(svg("line", { class: "pr-f-trait", x1: X(xa), x2: X(xa), y1: y - 10, y2: y + h + 4 }));
    var t = svg("text", { class: "pr-f-fort", x: X(xa), y: y - 14, "text-anchor": X(xa) < 90 ? "start" : X(xa) > W - 90 ? "end" : "middle" });
    t.textContent = "Aujourd'hui · " + (e.caisse === "cnss" ? Math.floor(e.moisFaits / 3) + " trimestres" : (Math.round(e.moisFaits / 12 * 10) / 10 + " ans").replace(".", ",")); s.appendChild(t);
    var xm = e.tauxMaxLe.getFullYear() + e.tauxMaxLe.getMonth() / 12;
    if (xm < x1 && xm > x0) {
      s.appendChild(svg("line", { class: "pr-f-max", x1: X(xm), x2: X(xm), y1: y - 4, y2: y + h + 4 }));
      var tm = svg("text", { class: "pr-f-txt", x: X(xm), y: y + h + 18, "text-anchor": X(xm) > W - 70 ? "end" : "middle" }); tm.textContent = (e.caisse === "cnss" ? "80 %" : "90 %") + " atteint (" + e.tauxMaxLe.getFullYear() + ")"; s.appendChild(tm);
    }
    s.appendChild(svg("circle", { class: "pr-f-depart", cx: X(x1), cy: y + h / 2, r: 7 }));
    var t1 = svg("text", { class: "pr-f-txt", x: g, y: y + h + 34 }); t1.textContent = String(e.debut.getFullYear()); s.appendChild(t1);
    var t2 = svg("text", { class: "pr-f-txt", x: W - d, y: y + h + 34, "text-anchor": "end" }); t2.textContent = "Départ " + libMois(e.depart); s.appendChild(t2);
    boite.appendChild(s);
  }
  function objectifRetraite() { return donnees.objectifs.filter(function (o) { return o.type === "projet" && /^retraite$/i.test(o.libelle); })[0] || null; }
  $("pr-age").addEventListener("input", function () { ageChoisi = +this.value; compter("retraite"); rendreRetraite(); });
  $("pr-objectif").addEventListener("click", function () {
    var e = dernierRetraite; if (!e || !(e.capital > 0) || enCours) return;
    var fin = new Date(e.depart.getFullYear(), e.depart.getMonth() + 1, 0);
    var o = { type: "projet", libelle: "Retraite", cible: Math.round(e.capital / 100) * 100, depart: 0,
      echeance: fin.getFullYear() + "-" + String(fin.getMonth() + 1).padStart(2, "0") + "-" + String(fin.getDate()).padStart(2, "0") };
    var existant = objectifRetraite(), b = this; enCours = true; b.disabled = true;
    if (existant) o.depart = existant.depart;
    (existant ? E.objectifs.modifier(existant.id, o) : E.objectifs.creer(o)).then(function (r) {
      enCours = false; b.disabled = false;
      if (existant) donnees.objectifs = donnees.objectifs.map(function (x) { return x.id === r.id ? r : x; }); else donnees.objectifs.push(r);
      compter("objectif-retraite"); signaler(); rendre();
      O.toast(existant ? "Objectif « Retraite » mis à jour : " + dt(r.cible) + " avant " + libMois(e.depart) + "." : "Objectif « Retraite » créé : " + dt(r.cible) + " avant " + libMois(e.depart) + ".", {
        type: "ok", detail: "Suivez-le dans l'onglet Objectifs, avec « J'ai épargné ».", action: { libelle: "Voir", fn: function () { history.replaceState(null, "", "#progression?onglet=objectifs"); ouvrirOnglet("objectifs"); } } });
    }, function (err) {
      enCours = false; b.disabled = false;
      O.toast(/Limite/.test(String(err && err.message)) ? "12 objectifs au plus : terminez ou supprimez-en un." : "L'objectif n'a pas été enregistré. Vérifiez votre connexion.", { type: "erreur" });
    });
  });

  /* ---------- Rendu et navigation ---------- */
  function rendre() {
    if ($("vue-progression").hidden) return;
    var o = ongletActif();
    if (o === "objectifs") rendreObjectifs(); else if (o === "retraite") rendreRetraite();
    else if (o === "liberte") { if (window.OrbiteLiberte) window.OrbiteLiberte.rendre(); } else rendreCarriere();
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
