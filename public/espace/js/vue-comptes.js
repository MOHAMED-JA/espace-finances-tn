/*
 * Orbite — Mes comptes (Mon mois › Comptes ; maquette validée le 16 oct. 2026, choix de l'utilisateur :
 * saisie + relevé, plusieurs comptes, gardés dans le compte Orbite, l'épargne disponible suit automatiquement).
 * - Total de tous les comptes, courbe sur 90 jours (point le plus bas des comptes courants), liste des comptes.
 * - « Nouveau solde » : un solde daté tapé, ou les soldes datés lus dans un relevé (ReleveCalcul, sur l'appareil).
 * - À chaque changement : épargne disponible du profil recalculée (ComptesCalcul.epargneDisponible), donc score de santé,
 *   réserve de sécurité et conseils refaits ; « avant → après » gardé (profil.comptesAnalyse) et montré ici et dans
 *   Mon orbite (« Ce que dit votre solde »). Chaque changement s'annule depuis le message.
 */
(function () {
  "use strict";
  var O = window.Orbite, CC = window.ComptesCalcul, OC = window.OrbiteCalcul, R = window.ReleveCalcul;
  if (!O || !CC || !OC || !document.getElementById("mo-comptes")) return;
  var OI = window.OrbiteIntelligence, OG = window.OrbiteGraphe;
  var F = O.F, $ = O.$, doc = document, SVG = "http://www.w3.org/2000/svg";
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function dt3(v) { return (v < 0 ? "−" : "") + F.dt3(Math.abs(v)) + " DT"; }
  function signe(v) { return (v >= 0 ? "+" : "−") + F.dt0(Math.abs(v)) + " DT"; }
  function aujourdhui() { return CC.iso(new Date()); }
  function cloner(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function comptes() { var p = O.profil(); return CC.normaliser(p && p.comptes); }
  function libMaj(d) {
    var n = Math.round((new Date(aujourdhui() + "T12:00:00") - new Date(d + "T12:00:00")) / 864e5);
    return n <= 0 ? "Mis à jour aujourd'hui" : n === 1 ? "Mis à jour hier" : n < 8 ? "Mis à jour il y a " + n + " jours" : "Mis à jour le " + CC.libDate(d);
  }
  /* Montant tapé : espaces, virgule, signe moins (−120 pour un découvert). */
  function lireMontant(t) {
    var s = String(t == null ? "" : t).replace(/[\s  ]/g, "").replace(/[−–]/g, "-").replace(",", ".");
    if (s === "") return { vide: true };
    var n = Number(s); return { vide: false, valide: isFinite(n) && n >= -1e7 && n <= 1e9, valeur: n };
  }

  /* ---------- Contexte de calcul (profil et synthèse) ---------- */
  function contexte() {
    var sy = O.synthese(), p = O.profil() || {};
    return { depensesMois: sy ? OC.depensesMois(sy).total : 0, jourPaie: p.jourPaie || 0, maintenant: new Date(),
      cibleReserve: sy ? OC.cibleReserve(sy) : 0, moisReserve: (p.reserve && p.reserve.mois) || 3 };
  }
  /* Photo des chiffres qui bougent avec le solde : score de santé, réserve (mois de dépenses), épargne disponible. */
  function photo() {
    var sy = O.synthese(), p = O.profil(); if (!sy || !p) return null;
    var dep = OC.depensesMois(sy).total, ep = p.epargneDisponible || 0;
    return { score: OI && OI.scoreSante ? OI.scoreSante(sy).score : 0, mois: dep > 0 ? Math.round(ep / dep * 10) / 10 : 0, epargne: Math.round(ep) };
  }

  /* ---------- Enregistrer : comptes + épargne disponible, puis « avant → après » ---------- */
  function appliquer(nouveaux, detail) {
    var p = O.profil() || {}, retour = { comptes: cloner(p.comptes || []), epargneDisponible: p.epargneDisponible || 0, comptesAnalyse: cloner(p.comptesAnalyse || null) };
    var avant = photo(), liste = CC.normaliser(nouveaux), maj = { comptes: liste };
    var dispo = CC.epargneDisponible(liste, contexte());
    if (dispo.n) maj.epargneDisponible = dispo.libre;
    O.majProfil(maj, { immediat: true });
    var apres = photo();
    if (detail && avant && apres) O.majProfil({ comptesAnalyse: { d: aujourdhui(), compte: detail.compte || "", soldeDu: detail.soldeDu || aujourdhui(), avant: avant, apres: apres } }, { immediat: true });
    return { retour: retour, avant: avant, apres: apres };
  }
  function annulable(message, r, detail) {
    O.toast(message, { detail: detail, action: { libelle: "Annuler", fn: function () {
      O.majProfil(r.retour, { immediat: true });
      O.toast("Annulé : vos comptes et votre épargne disponible sont revenus comme avant.", { type: "info" });
    } } });
  }
  function resumeDelta(r) {
    if (!r.avant || !r.apres) return "";
    var t = [];
    if (r.apres.score !== r.avant.score) t.push("Score de santé " + r.avant.score + " → " + r.apres.score);
    if (r.apres.epargne !== r.avant.epargne) t.push("épargne disponible " + F.dt0(r.avant.epargne) + " → " + dt(r.apres.epargne));
    return t.length ? t.join(" · ") + "." : "Vos chiffres n'ont pas changé.";
  }

  /* ===================================================================
     Rendu
     =================================================================== */
  function rendreGraphe(a) {
    var zone = $("cpt-graphe"); if (!zone) return;
    zone.textContent = "";
    if (!OG || a.serie.length < 2) {
      zone.appendChild(cree("p", "cpt-note", "La courbe apparaît dès deux soldes à des dates différentes."));
      return;
    }
    var s = a.serie, iDe = {}; s.forEach(function (p, i) { iDe[p.d] = i; });
    var ticks = s.map(function (p, i) { return p.d.slice(8) === "01" ? { v: i, lib: "1er " + MOIS[+p.d.slice(5, 7) - 1] } : null; }).filter(Boolean);
    if (ticks.length < 2) ticks = [{ v: 0, lib: CC.libDate(s[0].d) }, { v: s.length - 1, lib: "Aujourd'hui" }];
    var series = [{ nom: "Tout votre argent", pts: s.map(function (p, i) { return [i, p.v]; }), c: 1, aire: true, marche: true }];
    var deuxTypes = a.comptes.some(function (c) { return c.type === "epargne" && c.soldes.length; }) && a.serieCourant.length > 1;
    if (deuxTypes) series.push({ nom: "Comptes courants", pts: a.serieCourant.filter(function (p) { return p.d in iDe; }).map(function (p) { return [iDe[p.d], p.v]; }), c: 2, marche: true });
    /* Point bas des comptes courants : sur leur courbe (ou sur le total quand il n'y a que des comptes courants). */
    var marq = a.pointBas && a.pointBas.d in iDe ? [{ x: iDe[a.pointBas.d], y: a.pointBas.v, lib: "Point bas " + dt(a.pointBas.v), c: deuxTypes ? 2 : 1 }] : [];
    var min = Math.min.apply(null, s.map(function (p) { return p.v; }).concat(a.serieCourant.map(function (p) { return p.v; })));
    OG.lignes(zone, {
      series: series, marqueurs: marq, seuil: min < 0 ? { y: 0, lib: "0 DT" } : undefined,
      ticksX: ticks, fmtV: dt, fmtY: function (v) { return F.dt0(v); }, titreX: function (x) { var p = s[Math.round(x)]; return p ? CC.libDate(p.d) : ""; },
      titre: "Solde de vos comptes jour par jour", hauteur: 220, legende: deuxTypes,
      resume: "Solde total aujourd'hui : " + dt(a.total) + (a.pointBas ? ". Point le plus bas des comptes courants : " + dt(a.pointBas.v) + " le " + CC.libDate(a.pointBas.d) : "") + ".",
      tableau: { pas: 7 }
    });
  }

  function rendreListe(a) {
    var ul = $("cpt-liste"); ul.textContent = "";
    a.comptes.forEach(function (c) {
      var der = CC.dernier(c), prec = c.soldes.length > 1 ? c.soldes[c.soldes.length - 2] : null;
      var li = cree("li"), b = cree("button", "cpt-ligne"); b.type = "button"; b.setAttribute("data-compte", c.id);
      var ico = cree("span", "cpt-ligne__ico" + (c.type === "epargne" ? " cpt-ligne__ico--ep" : "")); ico.appendChild(icone(c.type === "epargne" ? "epargne" : "portefeuille"));
      var txt = cree("span", "cpt-ligne__txt"); txt.appendChild(cree("b", null, c.nom));
      txt.appendChild(cree("small", null, [c.banque, der ? CC.libDate(der.d) : "aucun solde"].filter(Boolean).join(" · ")));
      var mt = cree("span", "cpt-ligne__mt chiffre"); mt.appendChild(cree("b", der && der.v < 0 ? "cpt-neg" : null, der ? dt3(der.v) : "—"));
      var sous = c.type === "epargne" ? "argent de côté" : "";
      /* Écart avec le solde précédent, en dinars (un pourcentage n'a pas de sens autour du jour de paie). */
      if (prec && c.type !== "epargne" && der.v !== prec.v) sous = (der.v > prec.v ? "▲ " : "▼ ") + dt(Math.abs(der.v - prec.v)) + " depuis le " + CC.libDate(prec.d);
      mt.appendChild(cree("small", null, sous));
      b.appendChild(ico); b.appendChild(txt); b.appendChild(mt);
      b.setAttribute("aria-label", c.nom + (c.banque ? ", " + c.banque : "") + " : " + (der ? dt3(der.v) + " le " + CC.libDate(der.d) : "aucun solde") + ". Modifier ce compte");
      var crayon = cree("span", "cpt-ligne__mod"); crayon.appendChild(icone("crayon")); b.appendChild(crayon);
      li.appendChild(b); ul.appendChild(li);
    });
  }

  /* « Ce que dit votre solde » : dans Mon mois › Comptes et dans Mon orbite (même rendu). */
  function rendreAnalyse(zone, a) {
    zone.textContent = "";
    var p = O.profil() || {}, an = p.comptesAnalyse;
    if (an) {
      var r = cree("div", "cpt-refait");
      var t = cree("p", "cpt-refait__titre");
      t.appendChild(cree("b", null, an.d === aujourdhui() ? "Analyse refaite aujourd'hui" : "Analyse refaite le " + CC.libDate(an.d)));
      t.appendChild(doc.createTextNode(" · nouveau solde" + (an.compte ? " « " + an.compte + " »" : "") + " du " + CC.libDate(an.soldeDu)));
      r.appendChild(t);
      var g = cree("dl", "cpt-delta");
      [["Score de santé", an.avant.score, an.apres.score, function (v) { return String(v); }, function (d) { return (d > 0 ? "+" : "−") + Math.abs(d); }],
       ["Réserve", an.avant.mois, an.apres.mois, function (v) { return String(v).replace(".", ",") + " mois"; }, function (d) { return (d > 0 ? "+" : "−") + String(Math.round(Math.abs(d) * 10) / 10).replace(".", ","); }],
       ["Épargne disponible", an.avant.epargne, an.apres.epargne, function (v) { return F.dt0(v) + " DT"; }, function (d) { return (d > 0 ? "+" : "−") + F.dt0(Math.abs(d)); }]
      ].forEach(function (x) {
        var div = cree("div"), d = Math.round((x[2] - x[1]) * 10) / 10;
        div.appendChild(cree("dt", null, x[0]));
        var dd = cree("dd", "chiffre", x[3](x[2])); if (d) dd.appendChild(cree("em", d > 0 ? "cpt-plus" : "cpt-moins", " " + x[4](d)));
        div.appendChild(dd); g.appendChild(div);
      });
      r.appendChild(g); zone.appendChild(r);
    }
    var forts = a.points.filter(function (x) { return x.ton === "fort"; }), faibles = a.points.filter(function (x) { return x.ton === "faible"; });
    if (!forts.length && !faibles.length) { zone.appendChild(cree("p", "cpt-note", "Ajoutez des soldes sur quelques semaines : l'analyse s'affine avec l'historique.")); return; }
    var grille = cree("div", "cpt-points");
    [[forts, "Vos points forts", "fort", "valide"], [faibles, "À améliorer", "faible", "alerte"]].forEach(function (g) {
      if (!g[0].length) return;
      var col = cree("div"); col.appendChild(cree("h3", "cpt-points__t cpt-points__t--" + g[2], g[1]));
      var ul = cree("ul", "cpt-points__liste"); ul.setAttribute("role", "list");
      g[0].forEach(function (pt) {
        var li = cree("li", "cpt-point cpt-point--" + g[2]), ic = cree("span", "cpt-point__ico"); ic.appendChild(icone(g[3]));
        var tx = cree("div"); tx.appendChild(cree("b", null, pt.titre)); tx.appendChild(cree("span", null, pt.texte));
        if (pt.lien) { var l = cree("a", "lien-action", pt.lien.lib); l.href = pt.lien.href; tx.appendChild(l); }
        li.appendChild(ic); li.appendChild(tx); ul.appendChild(li);
      });
      col.appendChild(ul); grille.appendChild(col);
    });
    zone.appendChild(grille);
  }

  /* Mon profil : l'épargne disponible suit Mes comptes dès qu'un compte a un solde (le dire sous le champ). */
  function aideProfil(a) {
    var champ = $("p-epargne"), aide = champ && champ.closest(".champ") && champ.closest(".champ").querySelector(".champ__aide");
    if (!aide) return;
    if (!aide.hasAttribute("data-origine")) aide.setAttribute("data-origine", aide.textContent);
    aide.textContent = a.aucun ? aide.getAttribute("data-origine") : "Suit Mes comptes (Mon mois › Comptes) : recalculée à chaque nouveau solde";
  }
  function rendre() {
    var p = O.profil(); if (!p) return;
    var a = CC.analyser(p.comptes, contexte());
    aideProfil(a);
    var blocOrbite = $("solde-orbite");
    if (blocOrbite) { blocOrbite.hidden = a.aucun; if (!a.aucun) rendreAnalyse(blocOrbite.querySelector("[data-analyse]"), a); }
    if ($("vue-mois").hidden || $("mo-comptes").hidden) return;
    $("cpt-vide").hidden = !a.aucun;
    $("cpt-plein").hidden = a.aucun;
    $("cpt-analyse-bloc").hidden = a.aucun;
    if (a.aucun) return;
    $("cpt-total").textContent = dt3(a.total);
    $("cpt-total").classList.toggle("cpt-neg", a.total < 0);
    $("cpt-maj").textContent = libMaj(a.maj);
    var td = $("cpt-tendance"); td.textContent = ""; td.className = "cpt-tendance";
    if (a.tendance30 != null) { td.classList.add(a.tendance30 >= 0 ? "cpt-tendance--hausse" : "cpt-tendance--baisse"); td.textContent = (a.tendance30 >= 0 ? "▲ " : "▼ ") + signe(a.tendance30) + " en 30 jours"; }
    else td.textContent = "La tendance apparaît après 30 jours de soldes.";
    var nb = a.comptes.length;
    $("cpt-dispo").textContent = nb + (nb > 1 ? " comptes" : " compte") + " · épargne disponible " + dt(a.dispo.libre) + " (mise à jour dans votre profil)" +
      (a.dispo.coussin > 0 && a.dispo.courant > 0 ? ". Orbite garde " + dt(Math.min(a.dispo.coussin, a.dispo.courant)) + " des comptes courants pour les dépenses jusqu'à la paie." : ".");
    rendreListe(a);
    rendreGraphe(a);
    rendreAnalyse($("cpt-analyse-bloc").querySelector("[data-analyse]"), a);
  }

  /* ===================================================================
     Fenêtre « Nouveau solde »
     =================================================================== */
  var dlg = $("dlg-solde"), trouves = [];
  function compteChoisi() { return $("cpt-compte").value; }
  function remplirComptes(prefere) {
    var sel = $("cpt-compte"), l = comptes(); sel.textContent = "";
    l.forEach(function (c) { var o = cree("option", null, c.nom + (c.banque ? " · " + c.banque : "")); o.value = c.id; sel.appendChild(o); });
    if (l.length < CC.MAX_COMPTES) { var n = cree("option", null, l.length ? "Nouveau compte…" : "Mon premier compte"); n.value = "__nv"; sel.appendChild(n); }
    sel.value = prefere && l.some(function (c) { return c.id === prefere; }) ? prefere : (l.length ? l[0].id : "__nv");
    majNouveau();
  }
  function majNouveau() { $("cpt-nv").hidden = compteChoisi() !== "__nv"; apercu(); }
  function typeNouveau() { var r = doc.querySelector('input[name="cpt-nv-type"]:checked'); return r ? r.value : "courant"; }
  function erreur(t) { var e = $("cpt-err"); e.textContent = t || ""; e.hidden = !t; }
  function etatRel(t, type) { var e = $("cpt-rel-etat"); e.textContent = t || ""; e.hidden = !t; e.className = "cpt-rel__etat" + (type ? " cpt-rel__etat--" + type : ""); }

  /* Ce que donnerait la fenêtre si on enregistrait : { liste, id, soldes, compte } ou { erreur }. */
  function brouillon() {
    var l = comptes(), id = compteChoisi(), nom, soldes = [];
    if (id === "__nv") {
      id = CC.nouvelId(l);
      nom = $("cpt-nv-nom").value.trim() || (typeNouveau() === "epargne" ? "Compte épargne" : "Compte courant");
      l.push({ id: id, nom: nom, banque: $("cpt-nv-banque").value.trim(), type: typeNouveau(), soldes: [] });
    } else nom = (l.filter(function (c) { return c.id === id; })[0] || {}).nom;
    var m = lireMontant($("cpt-montant").value), d = $("cpt-date").value;
    if (!m.vide) {
      if (!m.valide) return { erreur: "Ce solde n'est pas un montant valide." };
      if (!CC.isoValide(d)) return { erreur: "Choisissez la date du solde." };
      if (d > aujourdhui()) return { erreur: "La date ne peut pas être dans le futur." };
      soldes.push({ d: d, v: m.valeur, src: "saisie" });
    }
    trouves.forEach(function (t, i) { var c = $("cpt-trouve-" + i); if (c && c.checked && !soldes.some(function (s) { return s.d === t.d; })) soldes.push({ d: t.d, v: t.v, src: "releve" }); });
    if (!soldes.length) return { erreur: "Tapez un solde, ou cochez au moins un solde lu dans le relevé." };
    return { liste: CC.ajouterSoldes(l, id, soldes), id: id, soldes: soldes, compte: nom };
  }
  function apercu() {
    var el = $("cpt-apres"), b = brouillon();
    if (b.erreur) { el.hidden = true; return; }
    var p = O.profil() || {}, ctx = contexte(), dispo = CC.epargneDisponible(b.liste, ctx), avant = p.epargneDisponible || 0;
    var c = b.liste.filter(function (x) { return x.id === b.id; })[0], der = CC.dernier(c), plusRecent = b.soldes.reduce(function (m, s) { return s.d > m ? s.d : m; }, "");
    el.textContent = "";
    el.appendChild(doc.createTextNode("Après enregistrement : "));
    el.appendChild(cree("b", null, "épargne disponible " + F.dt0(avant) + " → " + dt(dispo.libre)));
    var suite = ".";
    if (dispo.courant > 0 && dispo.coussin > 0) suite = ". Orbite garde sur les comptes courants les dépenses qui restent jusqu'à la paie (" + dt(Math.min(dispo.coussin, dispo.courant)) + ") ; le reste compte comme argent de côté.";
    if (der && plusRecent < der.d) suite += " Ce solde est plus ancien que le dernier connu (" + CC.libDate(der.d) + ") : il complète la courbe sans changer le solde actuel.";
    el.appendChild(doc.createTextNode(suite));
    el.hidden = false;
  }
  function viderReleve() { trouves = []; $("cpt-trouves").textContent = ""; etatRel(""); }
  function ouvrir(prefere, lireTout) {
    remplirComptes(prefere);
    $("cpt-nv-nom").value = ""; $("cpt-nv-banque").value = "";
    var r = doc.querySelector('input[name="cpt-nv-type"][value="courant"]'); if (r) r.checked = true;
    $("cpt-montant").value = ""; $("cpt-date").value = aujourdhui(); $("cpt-date").max = aujourdhui();
    erreur(""); viderReleve(); apercu();
    dlg.showModal();
    if (lireTout) $("cpt-rel-fichier").click();
    else (compteChoisi() === "__nv" ? $("cpt-nv-nom") : $("cpt-montant")).focus();
  }
  $("cpt-compte").addEventListener("change", majNouveau);
  ["cpt-montant", "cpt-date", "cpt-nv-nom"].forEach(function (id) { $(id).addEventListener("input", function () { erreur(""); apercu(); }); });
  doc.querySelectorAll('input[name="cpt-nv-type"]').forEach(function (r) { r.addEventListener("change", apercu); });
  $("cpt-trouves").addEventListener("change", function () { erreur(""); apercu(); });

  /* Relevé : soldes datés imprimés par la banque (colonne « Solde », lignes « Solde au … »), lus sur l'appareil. */
  function estTexte(f) { return /\.(csv|txt)$/i.test(f.name || "") || /^text\//i.test(f.type || "") || /csv/i.test(f.type || ""); }
  $("cpt-rel-choisir").addEventListener("click", function () { $("cpt-rel-fichier").click(); });
  $("cpt-rel-fichier").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f || !R) return;
    viderReleve();
    if (/\.(xlsx?|ods)$/i.test(f.name || "")) { etatRel("Enregistrez d'abord ce fichier Excel au format CSV, puis choisissez-le ici.", "erreur"); return; }
    if (f.size > 15 * 1024 * 1024) { etatRel("Ce fichier dépasse 15 Mo.", "erreur"); return; }
    etatRel("Lecture du relevé sur votre appareil…");
    var m = new Date(), lecture;
    if (estTexte(f)) lecture = f.text().then(function (t) { return R.depuisCsv(t, m); });
    else if (window.FicheLecture) lecture = window.FicheLecture.lire(f, { pagesMax: 12, progres: function (q, v) { if (v < 1) etatRel("Lecture du relevé sur votre appareil… " + Math.round(v * 100) + " %"); } }).then(function (r) { return R.depuisLignes(r.lignes, m); });
    else lecture = Promise.reject(new Error("Lecteur indisponible."));
    lecture.then(function (ops) {
      var s = (ops && ops.soldes) || [];
      if (!s.length) { etatRel("Aucun solde daté dans ce relevé : il faut la colonne « Solde » ou des lignes « Solde au … ». Tapez le solde à la main.", "erreur"); return; }
      trouves = s.slice(-31);
      var bas = trouves.reduce(function (b, x, i) { return b < 0 || x.v < trouves[b].v ? i : b; }, -1), ul = $("cpt-trouves");
      etatRel(trouves.length + (trouves.length > 1 ? " soldes trouvés" : " solde trouvé") + " dans « " + (f.name || "relevé").slice(0, 40) + " » (lu sur votre appareil) :");
      trouves.forEach(function (t, i) {
        var li = cree("li"), lab = cree("label", "cpt-trouve"), cb = cree("input"); cb.type = "checkbox"; cb.id = "cpt-trouve-" + i; cb.checked = true;
        lab.appendChild(cb); lab.appendChild(cree("span", null, "Solde au " + CC.libDate(t.d) + (i === bas && trouves.length > 2 ? " (le plus bas)" : "")));
        lab.appendChild(cree("b", "chiffre" + (t.v < 0 ? " cpt-neg" : ""), (t.v < 0 ? "−" : "") + F.dt3(Math.abs(t.v))));
        li.appendChild(lab); ul.appendChild(li);
      });
      apercu();
    }, function (e) { etatRel((e && e.message) || "Ce fichier n'a pas pu être lu.", "erreur"); });
  });

  $("form-solde").addEventListener("submit", function (e) {
    var v = e.submitter && e.submitter.value;
    if (v !== "ok") return;
    var b = brouillon();
    if (b.erreur) { e.preventDefault(); erreur(b.erreur); return; }
    var dernierDu = b.soldes.reduce(function (m, s) { return s.d > m ? s.d : m; }, "");
    var r = appliquer(b.liste, { compte: b.compte, soldeDu: dernierDu });
    annulable(b.soldes.length > 1 ? b.soldes.length + " soldes enregistrés · analyse refaite" : "Solde enregistré · analyse refaite", r, resumeDelta(r));
    rendre();
  });

  /* ===================================================================
     Fenêtre « Modifier le compte »
     =================================================================== */
  var dlgC = $("dlg-compte"), edite = null;
  function ouvrirCompte(id) {
    var c = comptes().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    edite = { id: id, retires: {} };
    $("cpt-ed-nom").value = c.nom; $("cpt-ed-banque").value = c.banque;
    doc.querySelectorAll('input[name="cpt-ed-type"]').forEach(function (r) { r.checked = r.value === c.type; });
    var ul = $("cpt-ed-soldes"); ul.textContent = "";
    c.soldes.slice(-12).reverse().forEach(function (s) {
      var li = cree("li", "cpt-hist__ligne"); li.setAttribute("data-d", s.d);
      li.appendChild(cree("span", null, CC.libDate(s.d) + " " + s.d.slice(0, 4) + (s.src === "releve" ? " · relevé" : "")));
      li.appendChild(cree("b", "chiffre" + (s.v < 0 ? " cpt-neg" : ""), dt3(s.v)));
      var bt = cree("button", "bouton bouton--icone bouton--petit"); bt.type = "button"; bt.setAttribute("data-retirer", s.d);
      bt.setAttribute("aria-label", "Retirer le solde du " + CC.libDate(s.d)); bt.appendChild(icone("poubelle"));
      li.appendChild(bt); ul.appendChild(li);
    });
    if (!c.soldes.length) ul.appendChild(cree("li", "cpt-note", "Aucun solde."));
    $("cpt-ed-confirmer").hidden = true;
    dlgC.showModal();
  }
  $("cpt-ed-soldes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-retirer]"); if (!b || !edite) return;
    var d = b.getAttribute("data-retirer"), li = b.closest("li"), on = !edite.retires[d];
    edite.retires[d] = on; li.classList.toggle("cpt-hist__ligne--retire", on);
    b.setAttribute("aria-label", (on ? "Garder" : "Retirer") + " le solde du " + CC.libDate(d));
    b.textContent = ""; b.appendChild(icone(on ? "annuler" : "poubelle"));
  });
  $("cpt-ed-supprimer").addEventListener("click", function () {
    var c = comptes().filter(function (x) { return x.id === edite.id; })[0]; if (!c) return;
    $("cpt-ed-confirmer-txt").textContent = "Supprimer « " + c.nom + " » et ses " + c.soldes.length + (c.soldes.length > 1 ? " soldes" : " solde") + " ? L'analyse sera refaite sans ce compte.";
    $("cpt-ed-confirmer").hidden = false; $("cpt-ed-supprimer-oui").focus();
  });
  $("cpt-ed-supprimer-oui").addEventListener("click", function () {
    var c = comptes().filter(function (x) { return x.id === edite.id; })[0];
    var r = appliquer(comptes().filter(function (x) { return x.id !== edite.id; }), null);
    dlgC.close(); edite = null;
    annulable("Compte « " + (c ? c.nom : "") + " » supprimé", r, resumeDelta(r));
    rendre();
  });
  $("form-compte").addEventListener("submit", function (e) {
    if (!e.submitter || e.submitter.value !== "ok" || !edite) return;
    var t = doc.querySelector('input[name="cpt-ed-type"]:checked'), id = edite.id, ret = edite.retires;
    var l = comptes().map(function (c) {
      if (c.id !== id) return c;
      return { id: c.id, nom: $("cpt-ed-nom").value.trim() || c.nom, banque: $("cpt-ed-banque").value.trim(), type: t ? t.value : c.type,
        soldes: c.soldes.filter(function (s) { return !ret[s.d]; }) };
    });
    var r = appliquer(l, null);
    edite = null;
    annulable("Compte mis à jour · analyse refaite", r, resumeDelta(r));
    rendre();
  });

  /* ---------- Points d'entrée ---------- */
  $("cpt-commencer").addEventListener("click", function () { ouvrir(null, false); });
  $("cpt-nouveau").addEventListener("click", function () { ouvrir(null, false); });
  $("cpt-lire").addEventListener("click", function () { ouvrir(null, true); });
  $("cpt-liste").addEventListener("click", function (e) { var b = e.target.closest("[data-compte]"); if (b) ouvrirCompte(b.getAttribute("data-compte")); });

  window.OrbiteComptes = { rendre: rendre, ouvrir: ouvrir };
  O.surProfil(function () { rendre(); });
  doc.addEventListener("orbite:vue", function (e) { if (e.detail && (e.detail.vue === "orbite" || e.detail.vue === "mois")) rendre(); });
})();
