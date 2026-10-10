/*
 * Orbite — vue « Mon orbite » : scène orbitale, budget, conseils, capacité d'emprunt,
 * suggestions d'épargne et projets. Tout vient de OrbiteCalcul.synthese().
 */
(function () {
  "use strict";
  var O = window.Orbite, F = O.F, $ = O.$, doc = document;
  var OC = window.OrbiteCalcul;
  var NS = "http://www.w3.org/2000/svg";
  var base = "net";

  /* ---------- Scène orbitale : planète, satellites et voyage dans le temps ---------- */
  var OS = window.OrbiteSysteme;
  var modele = null, T = 0, repere = null;
  function vibrer(motif) { if (O.vibrer) O.vibrer(motif); }
  function dt0(v) { return F.dt0(v) + " DT"; }
  function majuscule(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function tauxTxt(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }
  function ratioTxt(x) { return (x * 100).toFixed(2).replace(".", ",") + " %"; }
  function ansTxt(n) { var a = Math.round(n / 12); return a + (a > 1 ? " ans" : " an"); }
  function etatSat(id) { return modele ? modele.etat(T).satellites[id] || {} : {}; }
  /* Jalon principal d'un satellite (fin du crédit, durée fiscale, horizon), hors réductions de taux. */
  function jalonDe(id) { return modele ? modele.jalons.filter(function (j) { return j.sat === id && j.genre !== "reduction"; })[0] : null; }

  function texteTag(s, e) {
    if (s.genre === "credit") return e.actif === false ? "Remboursé" : dt0(e.mensualite || s.mensualite) + " par mois";
    if (s.genre === "vie" || s.genre === "cea") return dt0(e.capital || 0) + (s.capitalSaisi && !T ? "" : " estimés");
    if (s.genre === "projet") return s.horizon ? "Objectif " + s.horizon : dt0(s.montant);
    return "Ajouter";
  }
  function libelleSat(s, e) {
    var t = s.nom + ", " + texteTag(s, e).toLowerCase();
    if (s.genre === "credit" && s.fin && e.actif !== false) t += ", fin " + s.fin;
    return t + ". Ouvrir sa fiche";
  }

  var scene = window.OrbiteScene.creer({
    ciel: $("ciel"), toile: $("ciel-toile"), calque: $("ciel-satellites"), noyau: doc.querySelector(".ciel .noyau__texte"),
    reduit: function () { return O.mouvementReduit.matches; },
    capitalRef: function (s) { var e = modele && modele.etat(0).satellites[s.id]; return e && e.capital; },
    texteTag: texteTag, libelle: libelleSat,
    surChoix: function (id, parUtilisateur) { if (parUtilisateur && id) vibrer(8); rendreFiche(true); }
  });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && scene.choisi() && !$("vue-orbite").hidden && !doc.querySelector("dialog[open]")) scene.choisir(null);
  });

  /* --- Voyage dans le temps --- */
  var curseur = $("voyage-curseur"), bJouer = $("voyage-jouer"), bAuj = $("voyage-auj"), bProchain = $("voyage-prochain");
  var annonce = $("ciel-annonce"), minuterieAnnonce = 0, anim = null;
  function annoncer(t) {
    annonce.textContent = t; annonce.classList.add("visible");
    clearTimeout(minuterieAnnonce); minuterieAnnonce = setTimeout(function () { annonce.classList.remove("visible"); }, 2800);
  }
  function majT(t, depuisCurseur) {
    if (!modele) return;
    t = Math.max(0, Math.min(modele.horizon, Math.round(t)));
    var ancien = T; if (t === ancien) return;
    T = t;
    if (!depuisCurseur) curseur.value = String(t);
    if (t > ancien) modele.jalons.forEach(function (j) {
      if (ancien < j.t && j.t <= t) {
        if (j.genre === "credit") scene.liberer(j.sat); else if (j.genre === "reduction" || j.genre === "salaire") scene.pulser();
        annoncer(majuscule(modele.dateTexte(j.t)) + " · " + j.lib + (j.genre === "credit" ? " : +" + dt0(j.gain) + " de marge" : j.genre === "reduction" ? " (−" + dt0(j.gain) + " par mois)" : j.genre === "salaire" ? " (" + dt0(j.net) + " net par mois)" : ""));
        vibrer([10, 40, 10]);
      }
    });
    scene.etat(modele.etat(T));
    majValeurs(false);
  }
  function arreter() {
    if (!anim) return;
    anim.stop = true; anim = null;
    bJouer.setAttribute("aria-label", "Lancer le voyage dans le temps");
    $("voyage-icone").setAttribute("d", "M4 2.5v11l9-5.5z");
  }
  function voyagerVers(cible) {
    arreter();
    var de = T, duree = O.mouvementReduit.matches ? 0 : Math.min(1600, 350 + Math.abs(cible - de) * 14), t0 = performance.now(), a = { stop: false };
    anim = a;
    (function pas(now) {
      if (a.stop) return;
      var k = duree ? Math.min(1, (now - t0) / duree) : 1, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      majT(de + (cible - de) * e);
      if (k < 1) requestAnimationFrame(pas); else if (anim === a) anim = null;
    })(t0);
  }
  function jouer() {
    if (anim) { arreter(); return; }
    if (!modele || !modele.horizon) return;
    if (T >= modele.horizon) majT(0);
    var a = { stop: false }, prec = performance.now(), acc = 0, pause = 0, pasMs = Math.max(40, Math.min(110, 11000 / modele.horizon));
    anim = a;
    bJouer.setAttribute("aria-label", "Mettre le voyage en pause");
    $("voyage-icone").setAttribute("d", "M4 2.5h3v11H4zM9 2.5h3v11H9z");
    (function pas(now) {
      if (a.stop) return;
      var d = now - prec; prec = now;
      if (pause > 0) pause -= d; else acc += d;
      while (acc >= pasMs && T < modele.horizon) {
        acc -= pasMs; majT(T + 1);
        if (modele.jalons.some(function (j) { return j.t === T; })) { pause = 900; acc = 0; break; }
      }
      if (T >= modele.horizon) { arreter(); return; }
      requestAnimationFrame(pas);
    })(prec);
  }
  curseur.addEventListener("input", function () { arreter(); majT(+curseur.value, true); });
  bJouer.addEventListener("click", jouer);
  bAuj.addEventListener("click", function () { voyagerVers(0); });
  bProchain.addEventListener("click", function () {
    var j = modele && modele.jalons.filter(function (x) { return x.t > T; })[0];
    voyagerVers(j ? j.t : 0);
  });

  function poserVoyage() {
    var h = modele.horizon;
    $("voyage").hidden = !h;
    curseur.max = String(Math.max(1, h));
    if (T > h) T = h;
    curseur.value = String(T);
    function pos(el, t) { el.style.left = "calc(10px + (100% - 20px) * " + (h ? t / h : 0).toFixed(4) + ")"; }
    var jal = $("voyage-jalons"); jal.textContent = "";
    modele.jalons.forEach(function (j) { var i = cree("i"); pos(i, j.t); i.style.background = scene.couleur(j.sat) || "#F2F4F8"; jal.appendChild(i); });
    var an = $("voyage-annees"); an.textContent = "";
    var a0 = modele.debut.annee, a1 = modele.debut.annee + Math.floor((modele.debut.mois + h) / 12), etapes = [a0];
    var n = Math.min($("ciel").clientWidth < 560 ? 3 : 4, a1 - a0);
    for (var k = 1; k <= n; k++) { var y = Math.round(a0 + (a1 - a0) * k / n); if (etapes.indexOf(y) === -1) etapes.push(y); }
    /* Positions des années, sans chevauchement (écart minimal selon la largeur). */
    var places = etapes.map(function (y, k) { return { y: y, t: k === 0 ? 0 : Math.min(h, (y - a0) * 12 - modele.debut.mois) }; });
    var mini = $("ciel").clientWidth < 560 ? 0.24 : 0.12, retenues = [places[0]];
    places.slice(1).forEach(function (x, k, reste) {
      var dernier = k === reste.length - 1;
      if (dernier) { if ((x.t - retenues[retenues.length - 1].t) / h < mini && retenues.length > 1) retenues.pop(); retenues.push(x); }
      else if ((x.t - retenues[retenues.length - 1].t) / h >= mini && (places[places.length - 1].t - x.t) / h >= mini) retenues.push(x);
    });
    places = retenues;
    places.forEach(function (x, k) {
      var sp = cree("span", k === 0 ? "premier" : k === places.length - 1 ? "dernier" : "", String(x.y)); pos(sp, x.t); an.appendChild(sp);
    });
  }

  /* --- Valeurs qui dépendent du mois affiché --- */
  function majValeurs(instant) {
    if (!modele) return;
    var e = modele.etat(T), o = { instantane: instant };
    $("ciel-date").textContent = majuscule(modele.dateTexte(T));
    var hausses = modele.jalons.some(function (x) { return x.genre === "salaire"; });
    $("ciel-ecart").textContent = modele.ecart(T) + (T ? (hausses ? ", avec vos hausses de salaire prévues" : ", à salaire constant") : "");
    /* Le noyau suit le net du mois affiché (hausses de salaire prévues). */
    if (hausses) O.animerNombre($("noyau-val"), e.netMensuel, function (v) { return F.dt0(v) + " DT"; }, o);
    O.animerNombre($("ciel-capa-val"), e.capacite, function (v) { return F.dt0(v) + " DT / mois"; }, o);
    var sous;
    if (e.capacite >= 1) sous = "soit " + dt0(e.capitalImmo) + " sur " + ansTxt(e.dureeImmoMois) + " à " + tauxTxt(e.tauxImmoPct);
    else {
      var fut = modele.jalons.filter(function (j) { return j.t > T && j.genre === "credit" && modele.etat(j.t).capacite >= 1; })[0];
      sous = fut ? "Aucune marge pour l'instant · " + dt0(modele.etat(fut.t).capacite) + " par mois dès " + modele.dateTexte(fut.t) : "Aucune marge pour l'instant";
    }
    $("ciel-capa-sous").textContent = sous;
    curseur.style.setProperty("--p", (modele.horizon ? T / modele.horizon * 100 : 0).toFixed(2) + "%");
    curseur.setAttribute("aria-valuetext", modele.dateTexte(T));
    bAuj.disabled = T === 0;
    var j = modele.jalons.filter(function (x) { return x.t > T; })[0];
    $("voyage-prochain-txt").textContent = j ? "Prochain jalon : " + modele.dateTexte(j.t) + " · " + j.lib : "Fin du voyage · revenir à aujourd'hui";
    $("voyage-prochain-point").style.background = j && j.sat ? scene.couleur(j.sat) || "#F2F4F8" : "var(--salaire-lum)";
    doc.querySelectorAll("#fiche-orbite [data-v]").forEach(function (el) {
      var cle = el.getAttribute("data-v");
      if (el.hasAttribute("data-montant")) { var v = valeurNum(cle, e); O.animerNombre(el, v.n, v.f, o); }
      else { var t = valeurTxt(cle, e); if (el.textContent !== t) el.textContent = t; }
    });
    var barre = $("fiche-endet");
    if (barre) {
      var q = modele.quotite || 0.4;
      barre.style.width = Math.min(100, e.endettement / q * 100).toFixed(1) + "%";
      barre.classList.toggle("alerte", e.endettement > q * 0.9);
    }
    doc.querySelectorAll("#fiche-orbite [data-ligne]").forEach(function (el) { el.classList.toggle("fini", e.satellites[el.getAttribute("data-ligne")].actif === false); });
  }
  function valeurNum(cle, e) {
    var p = cle.split(":"), x = e.satellites[p[1]] || {};
    var DT0 = function (v) { return F.dt0(v) + " DT"; }, DT3 = function (v) { return F.dt3(v) + " DT"; };
    switch (p[0]) {
      case "charges": return { n: e.charges, f: DT3 };
      case "endet": return { n: e.endettement, f: function (v) { return F.pct(v, 1); } };
      case "capa": return { n: e.capacite, f: function (v) { return F.dt0(v) + " DT / mois"; } };
      case "kres": return { n: x.capitalRestant || 0, f: DT0 };
      case "mensualite": return { n: x.mensualite || 0, f: DT3 };
      case "interets": return { n: x.interets || 0, f: DT0 };
      case "restantes": return { n: x.restantes || 0, f: function (v) { v = Math.round(v); return v ? v + " échéance" + (v > 1 ? "s" : "") : "Aucune"; } };
      case "capital": return { n: x.capital || 0, f: DT0 };
      case "verse": return { n: x.verse || 0, f: DT0 };
      case "gains": return { n: x.gains || 0, f: DT0 };
    }
    return { n: 0, f: DT0 };
  }
  function valeurTxt(cle, e) {
    var p = cle.split(":"), s = modele.satellites.filter(function (z) { return z.id === p[1]; })[0], x = e.satellites[p[1]] || {};
    switch (p[0]) {
      case "date": return majuscule(e.date);
      case "ligne": return s.genre === "credit" ? (x.actif === false ? "Remboursé" : dt0(s.mensualite) + " / mois") : texteTag(s, x);
      case "sous":
        if (s.genre === "credit") return x.actif === false ? "Remboursé en " + s.fin : s.fin ? "Fin " + s.fin + " · " + tauxTxt(s.tauxPct) : "Durée restante à préciser";
        if (s.genre === "vie" || s.genre === "cea") return F.dt0(s.versement) + " DT par mois depuis " + s.depuis;
        if (s.genre === "projet") return dt0(s.montant) + (s.horizon ? " · " + s.horizon : "");
        return "Voiture, logement, travaux…";
      case "statut": return x.actif === false ? "Remboursé en " + s.fin : "En cours";
      case "taux": return tauxTxt(x.tauxPct || s.tauxPct) + (s.tauxType === "fixe" ? " fixe" : s.tauxType === "variable" ? " variable" : "");
      case "prochaine": return x.prochaine ? x.prochaine.date + " : " + tauxTxt(x.prochaine.tauxPct) + ", " + F.dt3(x.prochaine.mensualite) + " DT" : "Aucune d'ici la fin";
      case "fiscal": return x.fiscalAcquis ? (s.tFiscal > 0 ? "Acquis depuis " + s.dateFiscale : "Acquis") : "Acquis en " + s.dateFiscale + " (" + s.dureeFiscale + " ans)";
      case "voyage": var j = jalonDe(p[1]); return j && T < j.t ? "Voyager jusqu'en " + modele.dateTexte(j.t) : "Revenir à aujourd'hui";
    }
    return "";
  }

  /* --- Fiche : vue d'ensemble ou satellite choisi --- */
  function el(tag, classe, texte, attrs) {
    var e = cree(tag, classe, texte);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function point(id) { var i = el("i", "fiche-orbite__point"); var c = scene.couleur(id); if (c) i.style.background = c; return i; }
  function lignes(items) {
    var ul = el("ul", "fiche-orbite__lignes");
    items.forEach(function (it) { var li = el("li"); li.appendChild(el("span", null, it[0])); var st = el("strong", null, it[1] || "", it[2]); li.appendChild(st); ul.appendChild(li); });
    return ul;
  }
  function tete(id, sur, titre) {
    var d = el("div");
    var r = el("button", "fiche-orbite__retour", null, { type: "button", "data-action": "retour" });
    r.appendChild(icone("fleche")); r.appendChild(doc.createTextNode("Vue d'ensemble"));
    var p = el("p", "fiche-orbite__sur"); p.appendChild(point(id)); p.appendChild(doc.createTextNode(sur));
    d.appendChild(p); d.appendChild(el("h3", "fiche-orbite__titre", titre));
    return [r, d];
  }
  function lien(href, texte, plein) { var a = el("a", "bouton bouton--petit" + (plein ? " bouton--plein" : ""), texte, { href: href }); return a; }
  function boutonVoyage(id) { return el("button", "bouton bouton--petit bouton--plein", "", { type: "button", "data-action": "voyage", "data-sat": id, "data-v": "voyage:" + id }); }

  function ficheEnsemble(f) {
    var d = el("div"); d.appendChild(el("p", "fiche-orbite__sur", "Votre système")); d.appendChild(el("h3", "fiche-orbite__titre", "", { "data-v": "date" }));
    f.appendChild(d);
    var rep = el("ul", "orbite-reperes");
    [["#salaire", "salaire", "Tranche d'impôt", repere.tranche, null],
     ["#credit", "credit", "Mensualité possible", "", { "data-v": "capa", "data-montant": "" }],
     ["#epargne", "epargne", "Impôt économisable", repere.eco, null]].forEach(function (r) {
      var li = el("li"), a = el("a", "orbite-repere", null, { href: r[0] });
      a.appendChild(el("span", "point point--" + r[1])); a.appendChild(el("span", "orbite-repere__lib", r[2])); a.appendChild(el("strong", "orbite-repere__val", r[3], r[4]));
      li.appendChild(a); rep.appendChild(li);
    });
    f.appendChild(rep);
    f.appendChild(lignes([["Net par mois", F.dt3(repere.net) + " DT"], ["Mensualités de crédit", "", { "data-v": "charges", "data-montant": "" }]]));
    var j = el("div", "fiche-orbite__jauge");
    var l1 = el("div", "fiche-orbite__leg"); l1.appendChild(el("span", null, "Endettement, selon votre banque")); l1.appendChild(el("strong", null, "", { "data-v": "endet", "data-montant": "" }));
    var barre = el("div", "fiche-orbite__barre"); barre.appendChild(el("i", null, null, { id: "fiche-endet" })); barre.appendChild(el("b"));
    var l2 = el("div", "fiche-orbite__leg"); l2.appendChild(el("span", null, "0 %")); l2.appendChild(el("span", null, "plafond " + F.pct(modele.quotite || 0.4, 0)));
    j.appendChild(l1); j.appendChild(barre); j.appendChild(l2); f.appendChild(j);
    var sec = el("div"); sec.appendChild(el("p", "fiche-orbite__sur", "En orbite"));
    var ul = el("ul", "fiche-orbite__sats");
    modele.satellites.forEach(function (s) {
      var li = el("li"), b = el("button", null, null, { type: "button", "data-choisir": s.id });
      b.appendChild(point(s.id));
      var nom = el("span", "nom"); nom.appendChild(el("b", null, s.nom)); nom.appendChild(el("small", null, "", { "data-v": "sous:" + s.id }));
      b.appendChild(nom); b.appendChild(el("span", "val", "", { "data-v": "ligne:" + s.id, "data-ligne": s.id }));
      li.appendChild(b); ul.appendChild(li);
    });
    sec.appendChild(ul); f.appendChild(sec);
  }
  function ficheCredit(f, s) {
    tete(s.id, "Crédit en cours", s.nom).forEach(function (n) { f.appendChild(n); });
    var g = el("div", "fiche-orbite__grand"); g.appendChild(el("span", null, "", { "data-v": "mensualite:" + s.id, "data-montant": "" })); g.appendChild(el("small", null, "par mois")); f.appendChild(g);
    var items = [["Statut", "", { "data-v": "statut:" + s.id }], ["Taux", "", { "data-v": "taux:" + s.id }]];
    if (s.regle8 && s.regle8.applicable) items.push(["Prochaine réduction de taux", "", { "data-v": "prochaine:" + s.id }]);
    if (s.restantes) items.push(["Échéances restantes", "", { "data-v": "restantes:" + s.id, "data-montant": "" }], ["Dernière échéance", s.derniere],
      ["Capital restant estimé", "", { "data-v": "kres:" + s.id, "data-montant": "" }], ["Intérêts encore à payer", "", { "data-v": "interets:" + s.id, "data-montant": "" }]);
    f.appendChild(lignes(items));
    var j = jalonDe(s.id), act = el("div", "fiche-orbite__actions");
    if (j) {
      var e = modele.etat(j.t), p = el("p", "encart encart--succes");
      if (e.capacite >= 1) {
        p.appendChild(doc.createTextNode("À partir de " + s.fin + ", "));
        p.appendChild(el("b", null, "+" + dt0(s.mensualite) + " de marge")); p.appendChild(doc.createTextNode(" chaque mois. La banque pourra vous prêter "));
        p.appendChild(el("b", null, dt0(e.capacite) + " par mois")); p.appendChild(doc.createTextNode(", soit " + dt0(e.capitalImmo) + " sur " + ansTxt(e.dureeImmoMois) + " à " + tauxTxt(e.tauxImmoPct) + "."));
      } else p.textContent = "À partir de " + s.fin + ", " + dt0(s.mensualite) + " de plus chaque mois dans votre budget. Vos autres mensualités restent au-dessus du plafond de la banque à cette date.";
      f.appendChild(p);
      act.appendChild(boutonVoyage(s.id));
    } else f.appendChild(el("p", "encart encart--alerte", "Indiquez la durée restante de ce crédit dans Mon profil : Orbite calculera sa fin et la marge qu'il vous rendra."));
    var r8 = encartRegle8(s);
    if (r8) f.appendChild(r8);
    act.appendChild(lien("#profil?section=credits", "Modifier dans Mon profil"));
    f.appendChild(act);
  }
  /* Règle des 8 % (loi n° 2024-41 du 2 août 2024) dans la fiche d'un crédit. */
  function encartRegle8(s) {
    var rt = s.regle8; if (!rt) return null;
    function pc(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }
    var p = el("p", "encart");
    if (rt.motif === "type") { p.className = "encart encart--alerte"; p.textContent = "Taux fixe ou variable ? Pour un crédit à taux fixe de plus de 7 ans, la règle des 8 % peut diviser votre taux par deux. Précisez-le dans Mon profil."; return p; }
    if (rt.motif === "dates") { p.className = "encart encart--alerte"; p.textContent = "Indiquez la date de début et la durée totale de ce crédit dans Mon profil : Orbite calculera quand demander une réduction de taux (règle des 8 %)."; return p; }
    if (!rt.applicable) return null;
    if (rt.possibleDepuis) {
      p.className = "encart encart--alerte";
      p.appendChild(el("b", null, "Réduction de taux possible depuis " + rt.possibleDepuis.date + ". "));
      p.appendChild(doc.createTextNode("Les intérêts des 3 dernières années atteignent " + ratioTxt(rt.possibleDepuis.ratio) + " du capital restant (seuil : 8 %). Demandez à votre banque de diviser votre taux par deux ; si c'est déjà fait, indiquez sa date dans Mon profil."));
      return p;
    }
    var r = rt.reductions[0];
    p.className = "encart encart--succes";
    if (!r) { p.textContent = "Règle des 8 % : aucune nouvelle réduction de taux d'ici la fin de ce crédit."; return p; }
    p.appendChild(doc.createTextNode("Règle des 8 % : en " + r.date + ", votre taux passe de " + pc(r.tauxAvant) + " à "));
    p.appendChild(el("b", null, pc(r.tauxPct)));
    p.appendChild(doc.createTextNode(", et la mensualité à "));
    p.appendChild(el("b", null, F.dt3(r.mensualite) + " DT"));
    p.appendChild(doc.createTextNode(" (même date de fin)." + (rt.prochainControle && !rt.prochainControle.ok ? " Premier contrôle en " + rt.prochainControle.date + " : " + ratioTxt(rt.prochainControle.ratio) + ", encore sous le seuil de 8 %." : "") + " La banque l'accorde sur demande : Orbite vous le rappellera un mois avant."));
    return p;
  }
  function ficheContrat(f, s) {
    tete(s.id, "Contrat d'épargne", s.nom).forEach(function (n) { f.appendChild(n); });
    var g = el("div", "fiche-orbite__grand"); g.appendChild(el("span", null, "", { "data-v": "capital:" + s.id, "data-montant": "" })); g.appendChild(el("small", null, s.capitalSaisi ? "" : "estimés")); f.appendChild(g);
    f.appendChild(lignes([["Versement", F.dt0(s.versement) + " DT par mois"], ["Depuis", s.depuis], ["Total versé", "", { "data-v": "verse:" + s.id, "data-montant": "" }],
      ["Gains estimés", "", { "data-v": "gains:" + s.id, "data-montant": "" }], ["Avantage fiscal", "", { "data-v": "fiscal:" + s.id }]]));
    var act = el("div", "fiche-orbite__actions");
    if (s.tFiscal > 0) {
      var p = el("p", "encart encart--epargne"); p.appendChild(doc.createTextNode("Gardez-le au moins jusqu'en ")); p.appendChild(el("b", null, s.dateFiscale));
      p.appendChild(doc.createTextNode(" (" + s.dureeFiscale + " ans) pour conserver l'avantage fiscal. Son satellite prend alors un anneau.")); f.appendChild(p);
      act.appendChild(boutonVoyage(s.id));
    }
    act.appendChild(lien("#epargne", "Ouvrir dans Épargne"));
    f.appendChild(act);
  }
  function ficheProjet(f, s) {
    tete(s.id, "Projet", s.nom).forEach(function (n) { f.appendChild(n); });
    var g = el("div", "fiche-orbite__grand", dt0(s.montant)); if (s.horizon) g.appendChild(el("small", null, "pour " + s.horizon)); f.appendChild(g);
    var st = s.statut === "ok" ? "Réalisable dès maintenant" : s.statut === "a_preparer" ? "À préparer : épargnez " + dt0(s.epargneMensuelle) + " par mois" : "Hors de portée pour l'instant";
    f.appendChild(lignes([["Où en êtes-vous", st]].concat(s.credit ? [["Crédit envisagé", s.credit.court + " · " + dt0(s.credit.mensualite) + " par mois"]] : [])));
    var act = el("div", "fiche-orbite__actions"); if (jalonDe(s.id)) act.appendChild(boutonVoyage(s.id));
    act.appendChild(lien("#profil?section=projets", "Voir mes projets")); f.appendChild(act);
  }
  function ficheVide(f) {
    tete("projet-nouveau", "Place libre", "Un projet en vue ?").forEach(function (n) { f.appendChild(n); });
    f.appendChild(el("p", "fiche-orbite__texte", "Une voiture, un logement, des travaux : ajoutez-le à votre profil. Il prend place sur cette orbite, et Orbite vous dit à partir de quand il devient possible, avec la mensualité et l'apport."));
    var act = el("div", "fiche-orbite__actions"); act.appendChild(lien("#profil?section=projets", "Ajouter un projet", true)); f.appendChild(act);
  }
  function rendreFiche(transition) {
    var f = $("fiche-orbite");
    if (!modele || !repere) return;
    var id = scene.choisi(), s = id && modele.satellites.filter(function (z) { return z.id === id; })[0];
    f.textContent = "";
    if (!s) ficheEnsemble(f);
    else if (s.genre === "credit") ficheCredit(f, s);
    else if (s.genre === "vie" || s.genre === "cea") ficheContrat(f, s);
    else if (s.genre === "projet") ficheProjet(f, s);
    else ficheVide(f);
    majValeurs(true);
    if (transition && !O.mouvementReduit.matches && f.animate) {
      f.animate([{ opacity: 0, transform: "translateY(8px)", filter: "blur(3px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }
  $("fiche-orbite").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-choisir")) scene.choisir(b.getAttribute("data-choisir"));
    else if (b.getAttribute("data-action") === "retour") scene.choisir(null);
    else if (b.getAttribute("data-action") === "voyage") { var j = jalonDe(b.getAttribute("data-sat")); voyagerVers(j && T < j.t ? j.t : 0); }
  });
  /* ---------- Rendu ---------- */
  function cree(tag, classe, texte) { var e = doc.createElement(tag); if (classe) e.className = classe; if (texte != null) e.textContent = texte; return e; }
  function icone(nom) {
    var s = doc.createElementNS(NS, "svg"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS(NS, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }
  var premierRendu = true;

  function rendreScene(sy, baseSeule) {
    var s = sy.salaire, p = sy.profil;
    O.animerNombre($("noyau-val"), s.netMensuel, function (v) { return F.dt0(v) + " DT"; });
    $("noyau-lib").textContent = p.activite === "retraite" ? "Pension nette par mois" : "Net par mois";
    $("noyau-sous").textContent = "sur " + F.dt0(s.brutMensuel) + " DT brut" + (s.versements.nombre > 12 ? " · " + s.versements.nombre + " salaires" : "");
    var opt = sy.epargne.propositions[sy.epargne.propositions.length - 1];
    repere = { net: s.netMensuel, tranche: F.pct(s.tranche.taux, 0), eco: F.dt0(opt ? opt.economieAnnuelle : 0) + " DT / an" };
    $("phrase-orbite").textContent = "Avec " + F.dt0(s.netMensuel) + " DT net par mois" +
      (p.credits.length ? " et " + p.credits.length + " crédit" + (p.credits.length > 1 ? "s" : "") + " en cours" : "") +
      ", voici ce que votre salaire rend possible.";
    modele = OS.modele(sy, base);
    if (T > modele.horizon) T = modele.horizon;
    scene.satellites(modele.satellites);
    scene.etat(modele.etat(T));
    poserVoyage();
    rendreFiche(false);
    if (!baseSeule) scene.pulser();
  }
  function rendreBudget(sy) {
    var b = sy.budget, cumul = 0;
    [["credits", b.parts.credits], ["logement", b.parts.logement], ["epargne", b.parts.epargne], ["reste", b.parts.reste]].forEach(function (x) {
      var arc = $("arc-" + x[0]), longueur = Math.max(0, x[1] * 100 - (x[1] > 0.02 ? 1.2 : 0));
      arc.style.setProperty("--l", longueur.toFixed(2));
      arc.style.setProperty("--o", (-cumul).toFixed(2));
      cumul += x[1] * 100;
    });
    function dt(v) { return F.dt0(v) + " DT"; }
    O.animerNombre($("budget-reste"), b.reste, dt);
    $("budget-reste-2").textContent = dt(b.reste);
    $("budget-credits").textContent = dt(b.credits);
    $("budget-logement").textContent = dt(b.logement);
    $("budget-epargne").textContent = dt(b.epargne);
    var nbSal = sy.profil.nombreSalaires;
    $("budget-sous").textContent = "Sur " + F.dt0(b.net) + " DT net par mois" + (nbSal > 12 ? " en moyenne (vos " + nbSal + " salaires répartis sur 12 mois)" : "") + (b.credits > 0 ? ". Vos crédits se remboursent en 12 échéances par an" : "") + ".";
    var al = $("budget-alerte");
    al.hidden = !b.alerte;
    al.textContent = b.alerte === "deficit" ? "Vos dépenses déclarées dépassent votre net de " + F.dt0(-b.reste) + " DT par mois." :
      b.alerte === "endettement" ? "Vos crédits représentent " + F.pct(b.endettementBanque, 0) + " de votre revenu " + sy.profil.baseBanque + " mensuel retenu par la banque, au-delà des " + F.pct(sy.profil.baseBanque === "brut" ? sy.profil.quotiteBrut : sy.profil.quotiteNet, 0) + " admis par " + (sy.profil.banque || "les banques") + "." : "";
  }

  var ICONES_MODULE = { salaire: "salaire", credit: "credit", epargne: "epargne", budget: "maison" };
  function rendreConseils(sy) {
    var ol = $("conseils");
    ol.textContent = "";
    var liste = sy.conseils.slice(0, 6);
    if (!liste.length) {
      var li0 = cree("li", "conseil conseil--vide");
      li0.appendChild(cree("p", null, "Tout est en ordre. Complétez votre profil (crédits, contrats, projets) pour des conseils plus précis."));
      ol.appendChild(li0);
      return;
    }
    liste.forEach(function (c, i) {
      var li = cree("li", "conseil conseil--" + c.module + (c.niveau >= 3 ? " conseil--urgent" : ""));
      li.style.setProperty("--i", String(i));
      var ic = cree("span", "conseil__icone"); ic.appendChild(icone(c.niveau >= 3 ? "alerte" : ICONES_MODULE[c.module] || "info"));
      var tx = cree("div", "conseil__texte");
      tx.appendChild(cree("strong", null, c.titre));
      tx.appendChild(cree("p", null, c.texte));
      li.appendChild(ic); li.appendChild(tx);
      if (c.lien) {
        var a = cree("a", "lien-action conseil__lien"); a.href = c.lien.href; a.textContent = c.lien.libelle;
        a.setAttribute("aria-label", c.lien.libelle + " (conseil : " + c.titre + ")");
        a.appendChild(icone("fleche")); li.appendChild(a);
      }
      ol.appendChild(li);
    });
  }

  /* Par défaut, la base de calcul est celle de la banque de l'utilisateur (profil). */
  function syncBase(sy) {
    if (base === sy.profil.baseBanque) return;
    base = sy.profil.baseBanque;
    var r = doc.querySelector('input[name="base-capacite"][value="' + base + '"]');
    if (r) { r.checked = true; if (O.placerPastilles) O.placerPastilles(r.closest(".bloc-orbite")); }
  }
  function rendreCapacite(sy) {
    syncBase(sy);
    var cap = sy.capacite[base], autre = sy.capacite[base === "net" ? "brut" : "net"];
    /* Aucune marge aujourd'hui : on montre ce qui redevient possible à la fin des crédits en cours. */
    var futur = cap.futur || null, vue = futur ? futur.capacite : cap;
    $("capacite").classList.toggle("capacite--futur", !!futur);
    $("cap-tete-lib").textContent = futur ? "Mensualité possible à partir de " + futur.date : "Mensualité maximale";
    O.animerNombre($("cap-mensualite"), vue.mensualiteMax, function (v) { return F.dt0(v) + " DT"; });
    $("cap-revenu").textContent = futur
      ? "Aujourd'hui, vos crédits en cours (" + F.dt0(cap.charges) + " DT par mois) dépassent déjà " + F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT : aucun nouveau crédit n'est possible avant " + futur.date + "."
      : F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT " + (base === "net" ? "net" : "brut") + (cap.charges > 0 ? ", moins " + F.dt0(cap.charges) + " DT de crédits en cours" : "") + ".";
    var pr = sy.profil, annuel = pr.revenuBanque === "annuel";
    var revenuTxt = "Revenu retenu : " + (annuel ? "vos " + pr.nombreSalaires + " salaires et primes de l'année ÷ 12" : "votre salaire mensuel") + " = " + F.dt0(cap.revenu) + " DT " + base + " par mois, remboursé en 12 échéances par an. ";
    $("capacite-sous").textContent = revenuTxt + (autre.mensualiteMax < 1 && cap.mensualiteMax < 1
      ? "Calculé à " + F.pct(cap.quotite, 0) + " du salaire " + (base === "net" ? "net" : "brut") + ", crédits en cours déduits. Ni sur le net ni sur le brut, il n'y a de marge aujourd'hui."
      : base === "net"
      ? "Règle la plus courante : 40 % du salaire net. Sur le brut, la mensualité possible serait de " + F.dt0(autre.mensualiteMax) + " DT."
      : "Certaines banques calculent sur le brut. Sur le net, la mensualité possible serait de " + F.dt0(autre.mensualiteMax) + " DT.");
    var ul = $("cap-liste");
    if (ul.children.length !== cap.credits.length) {
      ul.textContent = "";
      cap.credits.forEach(function (c) {
        var li = cree("li", "capacite__ligne panneau");
        li.setAttribute("data-cle", c.cle);
        var tete = cree("div", "capacite__type");
        tete.appendChild(icone(c.cle.indexOf("immo") === 0 ? "maison" : c.cle === "auto" ? "voiture" : "credit"));
        tete.appendChild(cree("span", "capacite__lib"));
        li.appendChild(tete);
        li.appendChild(cree("strong", "capacite__capital chiffre"));
        li.appendChild(cree("span", "capacite__cond"));
        var a = cree("a", "lien-action", "Simuler"); a.appendChild(icone("fleche"));
        li.appendChild(a);
        ul.appendChild(li);
      });
    }
    vue.credits.forEach(function (c, i) {
      var li = ul.children[i];
      li.querySelector(".capacite__lib").textContent = c.libelle;
      O.animerNombre(li.querySelector(".capacite__capital"), c.capital, function (v) { return F.dt0(v) + " DT"; });
      li.querySelector(".capacite__cond").textContent = (futur ? "Dès " + futur.date + " · " : "") + (c.dureeMois / 12).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ans à " + F.pct(c.tauxPct / 100, 2) + (c.dureeLimitee ? " (durée limitée par l'âge)" : "");
      var a = li.querySelector("a");
      a.href = "#credit?type=" + c.cle + "&capital=" + Math.floor(c.capital) + "&mois=" + c.dureeMois + "&taux=" + c.tauxPct;
      a.setAttribute("aria-label", "Simuler un " + c.libelle.toLowerCase() + " de " + F.dt0(c.capital) + " DT");
    });
    rendreTaux(sy);
    rendrePaliers(sy, cap);
  }

  function afficherTaux(t, idChamp, idAide, idRetour, marche, lib) {
    var champ = $(idChamp);
    if (doc.activeElement !== champ) champ.value = String(t.tauxPct).replace(".", ",");
    $(idAide).textContent = t.source === "choisi" ? "Taux que vous avez indiqué. Il sert à tous les montants " + lib + "."
      : t.source === "credit" ? "Repris de votre " + t.libelle.toLowerCase() + ". Indiquez le taux proposé par votre banque s'il est différent."
      : "Taux moyen du marché (" + marche + "). Indiquez le taux proposé par votre banque.";
    $(idRetour).hidden = t.source !== "choisi";
  }
  /* Taux des futurs crédits (immobilier, auto et consommation) : toujours visibles, même sans calendrier de la marge. */
  function rendreTaux(sy) {
    var ti = sy.tauxImmo, champTaux = $("cap-taux-immo");
    if (doc.activeElement !== champTaux) champTaux.value = String(ti.tauxPct).replace(".", ",");
    $("cap-taux-aide").textContent = ti.source === "choisi" ? "Taux que vous avez indiqué. Modifiez-le pour voir l'effet sur le capital."
      : ti.source === "credit" ? "Repris de votre " + ti.libelle.toLowerCase() + ". Indiquez le taux proposé par votre banque s'il est différent."
      : "Taux moyen du marché (TMM " + F.pct(OC.TMM / 100, 2) + " + 2,5 points). Indiquez le taux proposé par votre banque.";
    $("cap-taux-auto").hidden = ti.source !== "choisi";
    var tn = OC.tauxNouveaux(sy.profil);
    afficherTaux(tn.auto, "cap-taux-auto-pct", "cap-taux-auto-aide", "cap-taux-auto-reset", "TMM " + F.pct(OC.TMM / 100, 2) + " + 3 points", "« Auto »");
    afficherTaux(tn.conso, "cap-taux-conso", "cap-taux-conso-aide", "cap-taux-conso-auto", "TMM " + F.pct(OC.TMM / 100, 2) + " + 3,5 points", "« Consommation »");
  }

  /* Calendrier de la marge : une étape par fin de crédit qui augmente la mensualité possible. */
  function rendrePaliers(sy, cap) {
    var bloc = $("cap-paliers"), ol = $("cap-paliers-liste"), paliers = cap.paliers || [];
    bloc.hidden = !paliers.length;
    if (!paliers.length) return;
    var p = sy.profil;
    $("cap-paliers-sous").textContent = "Calcul à " + F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT " + base + " par mois (" + (p.revenuBanque === "annuel" ? "salaires et primes de l'année ÷ 12" : "salaire mensuel") + ")" + (p.banque && base === p.baseBanque ? ", comme " + p.banque : "") +
      ". Chaque crédit qui se termine libère une partie de votre capacité d'emprunt. Les montants d'une même étape ne s'additionnent pas : c'est l'un ou l'autre.";
    ol.textContent = "";
    paliers.forEach(function (x) {
      var li = cree("li", "palier");
      var tete = cree("div", "palier__tete");
      tete.appendChild(cree("span", "palier__date", x.date.charAt(0).toUpperCase() + x.date.slice(1)));
      var ev = OC.evenementEtape(x);
      tete.appendChild(cree("span", "palier__fin", ev.charAt(0).toUpperCase() + ev.slice(1)));
      li.appendChild(tete);
      var corps = cree("div", "palier__corps");
      corps.appendChild(cree("strong", "palier__mensualite chiffre", F.dt0(x.mensualiteMax) + " DT par mois"));
      corps.appendChild(cree("span", "palier__capital", "Montant maximal selon le crédit :"));
      li.appendChild(corps);
      /* Un plafond par type de crédit, avec la même mensualité ; « Simuler » transmet la mensualité pour que
         le capital suive le taux et la durée choisis dans le module Crédit. */
      var ul = cree("ul", "palier__offres");
      (x.offres || []).forEach(function (o) {
        var it = cree("li", "palier__offre");
        it.appendChild(icone(o.cle === "immo" ? "maison" : o.cle === "auto" ? "voiture" : "credit"));
        var txt = cree("span", "palier__offre-txt");
        txt.appendChild(cree("span", "palier__offre-lib", o.libelle));
        txt.appendChild(cree("small", "palier__offre-cond", (o.dureeMois / 12).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ans à " + F.pct(o.tauxPct / 100, 2)));
        it.appendChild(txt);
        it.appendChild(cree("strong", "palier__offre-capital chiffre", F.dt0(o.capital) + " DT"));
        var a = cree("a", "lien-action", "Simuler"); a.appendChild(icone("fleche"));
        a.href = "#credit?type=" + o.cle + "&capital=" + Math.floor(o.capital) + "&mois=" + o.dureeMois + "&taux=" + o.tauxPct + "&mensualite=" + Math.floor(x.mensualiteMax * 100) / 100;
        a.setAttribute("aria-label", "Simuler un crédit " + o.libelle.toLowerCase() + " de " + F.dt0(o.capital) + " DT, possible en " + x.date);
        it.appendChild(a);
        ul.appendChild(it);
      });
      li.appendChild(ul);
      ol.appendChild(li);
    });
  }

  function rendreSuggestions(sy) {
    var ul = $("suggestions"), ep = sy.epargne, choisie = O.choix().epargne;
    ul.textContent = "";
    $("suggestions-sous").textContent = ep.versementsExistants.av + ep.versementsExistants.cea > 0
      ? "Vos contrats actuels vous font déjà économiser " + F.dt0(ep.economieContrats) + " DT d'impôt par an. Voici ce que rapporterait un versement de plus."
      : "Assurance vie : vos versements réduisent votre impôt (art. 39 du Code de l'IRPP) et se capitalisent.";
    ep.propositions.forEach(function (x, i) {
      var li = cree("li", "suggestion panneau" + (x.cle === choisie ? " suggestion--choisie" : ""));
      li.style.setProperty("--i", String(i));
      var tete = cree("div", "suggestion__tete");
      tete.appendChild(cree("span", "puce puce--epargne", x.libelle));
      li.appendChild(tete);
      var v = cree("p", "suggestion__montant");
      v.appendChild(cree("strong", "chiffre", F.dt0(x.versementMensuel)));
      v.appendChild(cree("span", null, " DT par mois"));
      li.appendChild(v);
      li.appendChild(cree("p", "suggestion__phrase", x.phrase));
      var dl = cree("dl", "suggestion__chiffres");
      [["Impôt économisé", F.dt0(x.economieAnnuelle) + " DT / an"], ["Coût réel", F.dt0(x.coutReelMensuel) + " DT / mois"], ["Capital en " + x.dureeAns + " ans", F.dt0(x.capital) + " DT"]].forEach(function (l) {
        var d = cree("div"); d.appendChild(cree("dt", null, l[0])); d.appendChild(cree("dd", "chiffre", l[1])); dl.appendChild(d);
      });
      li.appendChild(dl);
      var actions = cree("div", "suggestion__actions");
      var b = cree("button", "bouton bouton--petit" + (x.cle === choisie ? " bouton--epargne" : ""), x.cle === choisie ? "Dans mon budget" : "Ajouter à mon budget");
      b.type = "button";
      b.setAttribute("aria-pressed", x.cle === choisie && O.choix().ajouterEpargne ? "true" : "false");
      b.addEventListener("click", function () {
        var deja = O.choix().epargne === x.cle && O.choix().ajouterEpargne;
        O.choisir("epargne", x.cle);
        O.choisir("ajouterEpargne", !deja);
        if (!deja) { O.puceVolante(b, $("arc-epargne"), "+" + F.dt0(x.versementMensuel) + " DT", "epargne"); vibrer(8); }
      });
      if (x.cle === choisie && O.choix().ajouterEpargne) b.textContent = "Retirer du budget";
      actions.appendChild(b);
      var a = cree("a", "lien-action", "Simuler en détail"); a.href = "#epargne?versement=" + x.versementMensuel; a.appendChild(icone("fleche"));
      actions.appendChild(a);
      li.appendChild(actions);
      ul.appendChild(li);
    });
    $("rendement-note") && ($("rendement-note").textContent = "");
  }

  var STATUTS = { ok: ["puce--succes", "À votre portée"], a_preparer: ["puce--alerte", "À préparer"], hors_portee: ["puce--erreur", "Hors de portée aujourd'hui"] };
  function rendreProjets(sy) {
    var ul = $("projets");
    ul.textContent = "";
    if (!sy.projets.length) {
      var li0 = cree("li", "projet projet--vide panneau panneau--plat");
      li0.appendChild(cree("p", null, "Ajoutez un projet (logement, voiture, études, retraite…) : Orbite calcule le crédit mobilisable, l'apport nécessaire et l'effort d'épargne mensuel."));
      ul.appendChild(li0);
      return;
    }
    sy.projets.forEach(function (pr) {
      var li = cree("li", "projet panneau");
      var st = STATUTS[pr.statut];
      var tete = cree("div", "projet__tete");
      tete.appendChild(cree("strong", null, pr.libelle));
      tete.appendChild(cree("span", "puce " + st[0], st[1]));
      li.appendChild(tete);
      li.appendChild(cree("p", "projet__montant chiffre", F.dt0(pr.montant) + " DT" + (pr.horizonAns ? " · dans " + pr.horizonAns + " an" + (pr.horizonAns > 1 ? "s" : "") : "")));
      var dl = cree("dl", "suggestion__chiffres");
      var lignes = [];
      if (pr.credit) {
        lignes.push(["Crédit possible (" + pr.credit.court.toLowerCase() + ")", F.dt0(pr.credit.capitalMax) + " DT"]);
        lignes.push(["Apport minimal", F.dt0(pr.apportMin) + " DT"]);
        lignes.push(["Mensualité du crédit nécessaire", F.dt0(pr.credit.mensualite) + " DT"]);
      }
      if (pr.epargneMensuelle > 0) lignes.push(["À épargner chaque mois", F.dt0(pr.epargneMensuelle) + " DT"]);
      lignes.forEach(function (l) { var d = cree("div"); d.appendChild(cree("dt", null, l[0])); d.appendChild(cree("dd", "chiffre", l[1])); dl.appendChild(d); });
      li.appendChild(dl);
      if (pr.credit) {
        var a = cree("a", "lien-action", "Simuler ce crédit");
        a.href = "#credit?type=" + pr.credit.cle + "&capital=" + Math.round(pr.credit.besoin) + "&mois=" + pr.credit.dureeMois + "&taux=" + pr.credit.tauxPct + "&prix=" + Math.round(pr.montant) + "&apport=" + Math.round(pr.apportDisponible);
        a.appendChild(icone("fleche")); li.appendChild(a);
      }
      ul.appendChild(li);
    });
  }

  /* ---------- Santé financière : score, critères, objectifs, rappel fiscal de fin d'année ---------- */
  var OI = window.OrbiteIntelligence, minuterieSante = null;
  function rendreSante(sy) {
    var bloc = $("sante");
    if (!OI || O.profilVierge()) { bloc.hidden = true; return; }
    bloc.hidden = false;
    var opt = OI.optimiseurFiscal(sy), r = OI.scoreSante(sy, { optimiseur: opt });
    O.animerNombre($("sante-score"), r.score, function (v) { return String(Math.round(v)); });
    $("sante-arc").style.setProperty("--p", String(r.score));
    var jauge = $("sante-jauge");
    jauge.setAttribute("data-niveau", r.score >= 80 ? "excellent" : r.score >= 60 ? "bon" : r.score >= 40 ? "fragile" : "faible");
    jauge.setAttribute("aria-label", "Score de santé financière : " + r.score + " sur 100, " + r.niveau.toLowerCase());
    $("sante-niveau").textContent = r.niveau;
    var ul = $("sante-criteres");
    ul.textContent = "";
    r.composantes.forEach(function (c) {
      var li = cree("li", "sante__critere");
      var t = cree("div", "sante__critere-tete");
      t.appendChild(cree("span", "sante__critere-lib", c.libelle));
      t.appendChild(cree("strong", "chiffre", c.points + " / " + c.max));
      li.appendChild(t);
      var j = cree("i", "sante__barre"); j.style.setProperty("--p", (c.points / c.max * 100) + "%"); j.setAttribute("aria-hidden", "true");
      li.appendChild(j);
      li.appendChild(cree("small", null, c.detail));
      ul.appendChild(li);
    });
    var ol = $("sante-objectifs");
    ol.textContent = "";
    $("sante-objectifs-bloc").hidden = !r.objectifs.length;
    r.objectifs.forEach(function (o) {
      var li = cree("li", "sante__objectif");
      var g = cree("span", "sante__gain chiffre", "+" + o.gain);
      g.setAttribute("aria-label", "jusqu'à " + o.gain + " points");
      li.appendChild(g);
      var txt = cree("div");
      txt.appendChild(cree("strong", null, o.libelle));
      txt.appendChild(cree("p", null, o.action));
      li.appendChild(txt);
      var a = cree("a", "lien-action", "Agir"); a.href = o.lien; a.appendChild(icone("fleche"));
      a.setAttribute("aria-label", "Agir sur : " + o.libelle);
      li.appendChild(a);
      ol.appendChild(li);
    });
    var rappel = $("sante-rappel");
    rappel.hidden = !opt.rappel;
    if (opt.rappel) $("sante-rappel-txt").textContent = "Plus que " + opt.joursAvantFin + " jours pour réduire votre impôt " + opt.annee + " : jusqu'à " + F.dt0(opt.gainPossible) + " DT d'économie possible.";
  }

  /* ---------- Foyer (mode couple) ---------- */
  function rendreFoyer(sy) {
    var bloc = $("foyer"), f = OI && OI.foyer(sy);
    bloc.hidden = !f;
    if (!f) return;
    var p = sy.profil, cap = f.capacite;
    $("foyer-sous").textContent = "Vous et " + f.prenom + " : revenus additionnés selon la règle de " + (p.banque || "votre banque") + " (" + F.pct(f.quotite, 0) + " du " + f.base + "), crédits des deux déduits.";
    var kpi = $("foyer-kpi"); kpi.textContent = "";
    [["Net du foyer", F.dt0(f.netMoyen) + " DT", "par mois, en moyenne sur l'année"],
     ["Reste à vivre commun", F.dt0(f.budget.reste) + " DT", "après crédits, logement, charges et épargne"],
     ["Endettement commun", F.pct(f.endettement, 1), "pour " + F.pct(f.quotite, 0) + " admis"],
     ["Mensualité possible ensemble", F.dt0(cap.mensualiteMax) + " DT", f.gainCapacite > 0 ? "+" + F.dt0(f.gainCapacite) + " DT grâce au second salaire" : "par mois"]].forEach(function (k, i) {
      var d = cree("div", i === 3 ? "foyer__k--fort" : null); d.appendChild(cree("dt", null, k[0])); d.appendChild(cree("dd", "chiffre", k[1])); d.appendChild(cree("dd", "foyer__sous", k[2])); kpi.appendChild(d);
    });
    var pm = Math.round(f.partMoi * 100);
    $("foyer-barre-moi").style.setProperty("--p", pm + "%");
    $("foyer-barre").setAttribute("aria-label", "Vous apportez " + pm + " % des revenus du foyer, " + f.prenom + " " + (100 - pm) + " %.");
    var lg = $("foyer-legende"); lg.textContent = "";
    [["moi", "Vous", f.moi.netMoyen, pm], ["conjoint", f.prenom, f.conjoint.netMoyen, 100 - pm]].forEach(function (x) {
      var li = cree("li", "foyer__leg foyer__leg--" + x[0]); li.appendChild(cree("i")); li.appendChild(cree("span", null, x[1]));
      li.appendChild(cree("strong", "chiffre", F.dt0(x[2]) + " DT · " + x[3] + " %")); lg.appendChild(li);
    });
    $("foyer-contrib").textContent = f.contributions.total > 0
      ? "Logement et charges communes (" + F.dt0(f.contributions.total) + " DT par mois), partagés au prorata : vous " + F.dt0(f.contributions.moi) + " DT, " + f.prenom + " " + F.dt0(f.contributions.conjoint) + " DT."
      : "Renseignez le loyer et les charges dans « Votre budget » pour voir comment les partager équitablement.";
    var ul = $("foyer-offres"); ul.textContent = "";
    cap.credits.filter(function (c) { return c.cle !== "immo25"; }).forEach(function (c) {
      var li = cree("li", "foyer__offre");
      li.appendChild(icone(c.cle === "immo" ? "maison" : c.cle === "auto" ? "voiture" : "credit"));
      var t = cree("span"); t.appendChild(cree("span", null, c.court)); t.appendChild(cree("small", null, (c.dureeMois / 12).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ans à " + F.pct(c.tauxPct / 100, 2))); li.appendChild(t);
      li.appendChild(cree("strong", "chiffre", F.dt0(c.capital) + " DT"));
      var a = cree("a", "lien-action", "Simuler"); a.appendChild(icone("fleche"));
      a.href = "#credit?type=" + c.cle + "&capital=" + Math.floor(c.capital) + "&mois=" + c.dureeMois + "&taux=" + c.tauxPct + "&mensualite=" + Math.floor(cap.mensualiteMax * 100) / 100;
      a.setAttribute("aria-label", "Simuler un crédit " + c.court.toLowerCase() + " commun de " + F.dt0(c.capital) + " DT");
      li.appendChild(a);
      ul.appendChild(li);
    });
    $("foyer-cap-note").textContent = cap.mensualiteMax < 1 ? "Aujourd'hui, vos crédits à deux atteignent déjà la limite de la banque." : "Avec une mensualité de " + F.dt0(cap.mensualiteMax) + " DT par mois. La banque demandera en général un crédit aux deux noms.";
  }

  function rendre(sy) {
    if (sy) syncBase(sy);
    if (!sy) return;
    $("demarrage").hidden = !O.profilVierge();
    $("orbite-contenu").classList.toggle("en-attente", O.profilVierge());
    rendreScene(sy);
    rendreBudget(sy);
    rendreConseils(sy);
    rendreCapacite(sy);
    rendreSuggestions(sy);
    rendreProjets(sy);
    try { rendreFoyer(sy); } catch (e) { if (window.console) console.error(e); }
    clearTimeout(minuterieSante);
    minuterieSante = setTimeout(function () { try { rendreSante(O.synthese() || sy); } catch (e) { if (window.console) console.error(e); } }, 120);
    var sansNaissance = !sy.profil.dateNaissance;
    var badge = $("badge-profil");
    badge.hidden = !O.profilVierge() && !sansNaissance;
    if (premierRendu) { premierRendu = false; doc.body.classList.add("orbite-entree"); setTimeout(function () { doc.body.classList.remove("orbite-entree"); }, 1200); }
    O.remplirUtilisateur();
  }

  doc.querySelectorAll('input[name="base-capacite"]').forEach(function (r) {
    /* Le choix est enregistré dans le profil (règle de la banque) : il reste valable à la prochaine visite
       et s'applique au calendrier de la marge, aux conseils et au module Crédit. */
    r.addEventListener("change", function () {
      base = this.value;
      var p = O.profil();
      if (p && p.baseBanque !== base) {
        O.majProfil({ baseBanque: base });
        O.toast("Calcul sur le " + base + (p.banque ? ", comme " + p.banque : "") + " : enregistré dans votre profil.");
      } else { var sy = O.synthese(); if (sy) { rendreCapacite(sy); rendreScene(sy, true); } }
    });
  });

  /* ---------- Premier pas ---------- */
  var formD = $("form-demarrage");
  formD.addEventListener("change", function (e) {
    if (e.target.name === "d-sens") $("d-montant-lib").textContent = "Salaire " + e.target.value + " par mois";
  });
  formD.addEventListener("submit", function (e) {
    e.preventDefault();
    var lu = F.lire($("d-montant").value);
    var champ = $("d-montant");
    if (!lu.valide || lu.vide || lu.valeur <= 0) { champ.setAttribute("aria-invalid", "true"); champ.focus(); O.toast("Indiquez votre salaire, par exemple 2 500."); return; }
    champ.setAttribute("aria-invalid", "false");
    O.majProfil({
      montant: lu.valeur, periode: "mensuel",
      sens: (formD.querySelector('input[name="d-sens"]:checked') || {}).value,
      secteur: (formD.querySelector('input[name="d-secteur"]:checked') || {}).value,
      chefDeFamille: $("d-chef").checked
    }, { immediat: true });
    O.toast("Votre orbite est en mouvement. Complétez « Mon profil » pour des conseils encore plus précis.");
    doc.dispatchEvent(new CustomEvent("orbite:premier-pas"));
    var scene = doc.querySelector(".scene");
    if (scene) scene.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
  });

  /* Taux du futur crédit immobilier : enregistré dans le profil, le calendrier et la capacité suivent. */
  var champTauxImmo = $("cap-taux-immo"), minuterieTaux = null;
  champTauxImmo.addEventListener("input", function () {
    clearTimeout(minuterieTaux);
    var lu = F.lire(champTauxImmo.value), ok = lu.valide && !lu.vide && lu.valeur >= 0 && lu.valeur <= 30;
    champTauxImmo.setAttribute("aria-invalid", ok || lu.vide ? "false" : "true");
    if (!ok) return;
    minuterieTaux = setTimeout(function () { O.majProfil({ tauxImmoPct: lu.valeur }); }, 350);
  });
  $("cap-taux-auto").addEventListener("click", function () {
    O.majProfil({ tauxImmoPct: null });
    O.toast("Taux automatique rétabli.");
  });
  /* Taux des futurs crédits auto et conso : même principe. */
  [["cap-taux-auto-pct", "cap-taux-auto-reset", "tauxAutoPct"], ["cap-taux-conso", "cap-taux-conso-auto", "tauxConsoPct"]].forEach(function (x) {
    var champ = $(x[0]), minuterie = null;
    champ.addEventListener("input", function () {
      clearTimeout(minuterie);
      var lu = F.lire(champ.value), ok = lu.valide && !lu.vide && lu.valeur >= 0 && lu.valeur <= 30;
      champ.setAttribute("aria-invalid", ok || lu.vide ? "false" : "true");
      if (!ok) return;
      minuterie = setTimeout(function () { var o = {}; o[x[2]] = lu.valeur; O.majProfil(o); }, 350);
    });
    $(x[1]).addEventListener("click", function () { var o = {}; o[x[2]] = null; O.majProfil(o); O.toast("Taux automatique rétabli."); });
  });

  O.surProfil(rendre);
  doc.addEventListener("orbite:vue", function (e) {
    scene.activer(e.detail.vue === "orbite");
    /* #orbite?section=marge : défile jusqu'au calendrier de la marge (ou à la capacité). */
    if (e.detail.vue === "orbite" && e.detail.params.get("section") === "marge") {
      setTimeout(function () {
        var cible = !$("cap-paliers").hidden ? $("cap-paliers") : doc.querySelector("[aria-labelledby=titre-capacite]");
        if (cible) cible.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
      }, 120);
    }
  });
})();
