/*
 * Orbite — Mon patrimoine (#placements ; lot A, maquette validée le 16 oct. 2026).
 * Quatre onglets : Bourse (titres, cours, revenus), Dépôts (placements à taux connu, échéances, « renouveler ou
 * rembourser ? »), Immo & or (biens loués reliés aux crédits, or au cours saisi), Synthèse (répartition, revenus comparés
 * à l'inflation, points à surveiller). Une seule fenêtre de saisie, dont les champs dépendent de l'objet.
 * Calculs : placements-calcul.js. Gardé dans le profil (profil.placements) ; chaque changement s'annule depuis le message.
 * Le patrimoine net de Mon orbite compte ces placements (decider-calcul.js).
 */
(function () {
  "use strict";
  var O = window.Orbite, PL = window.PlacementsCalcul, doc = document;
  if (!O || !PL || !doc.getElementById("vue-placements")) return;
  var F = O.F, $ = O.$, SVG = "http://www.w3.org/2000/svg", D = window.DeciderCalcul, PG = window.Progression, PP = window.PARAMETRES_PAIE;

  /* ---------- Outils ---------- */
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return (v < 0 ? "−" : "") + F.dt0(Math.abs(v)) + " DT"; }
  function dt3(v) { return (v < 0 ? "−" : "") + F.dt3(Math.abs(v)) + " DT"; }
  function pct(x, d) { return (x < 0 ? "−" : "") + String(Math.round(Math.abs(x) * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).replace(".", ",") + " %"; }
  function signePct(x) { return (x >= 0 ? "+" : "−") + String(Math.round(Math.abs(x) * 1000) / 10).replace(".", ",") + " %"; }
  function cloner(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function aujourdhui() { return PL.iso(new Date()); }
  function placements() { var p = O.profil(); return PL.normaliser(p && p.placements); }
  function bouton(lib, cls, ico, attrs) {
    var b = cree("button", "bouton " + (cls || "")); b.type = "button";
    if (ico) b.appendChild(icone(ico));
    b.appendChild(doc.createTextNode(lib));
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }
  function panneau(titre, cls) { var s = cree("section", "panneau pa-carte" + (cls ? " " + cls : "")); if (titre) s.appendChild(cree("h2", "pa-carte__titre", titre)); return s; }
  function ligneLR(gauche, droite, clsD) { var r = cree("div", "pa-rang"); r.appendChild(cree("span", null, gauche)); r.appendChild(cree("b", "chiffre" + (clsD ? " " + clsD : ""), droite)); return r; }

  /* ---------- Contexte de calcul ---------- */
  function contexte() {
    var sy = O.synthese(), p = O.profil() || {}, m = new Date();
    var credits = (p.credits || []).map(function (c, i) {
      var r = sy && sy.credits && sy.credits[i] ? sy.credits[i].restantes : c.moisRestants;
      return { libelle: c.libelle, mensualite: c.mensualite, tauxPct: c.tauxPct, crd: D && D.resteDu ? D.resteDu(c, r) : c.capitalRestant, actif: r > 0 && c.mensualite > 0 };
    });
    var contrats = sy && sy.contrats ? sy.contrats.reduce(function (t, c) { return t + (c.capital || 0); }, 0) : 0;
    return {
      aujourdhui: aujourdhui(), revenuImposable: sy && sy.salaire ? sy.salaire.revenuImposable || 0 : 0,
      fisc: PP && PP.irpp ? { bareme: PP.irpp.bareme, cssTaux: PP.css.taux, cssSeuil: PP.css.seuilDispense } : null,
      credits: credits, liquidites: p.epargneDisponible || 0, contrats: contrats,
      inflationDefaut: PG && PG.inflation ? PG.inflation(m.getFullYear()) || 0 : 0
    };
  }
  function analyse() { var p = O.profil(); return PL.analyser(p && p.placements, contexte()); }

  /* ---------- Enregistrer (annulable) ---------- */
  function enregistrer(nouveau, message) {
    var p = O.profil() || {}, avant = cloner(p.placements || null);
    O.majProfil({ placements: PL.normaliser(nouveau) }, { immediat: true });
    O.toast(message, { action: { libelle: "Annuler", fn: function () {
      O.majProfil({ placements: avant }, { immediat: true });
      O.toast("Annulé : Mon patrimoine est revenu comme avant.", { type: "info" });
    } } });
    rendre();
  }

  /* ===================================================================
     Onglets
     =================================================================== */
  var ONGLETS = ["bourse", "depots", "immo", "assurances", "proches", "synthese"], barre = doc.querySelector(".pa-onglets");
  function ouvrirOnglet(cle, focus) {
    if (ONGLETS.indexOf(cle) === -1) cle = "bourse";
    barre.setAttribute("data-o", cle);
    ONGLETS.forEach(function (c) {
      var t = $("pa-tab-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      $("pa-" + c).hidden = !on;
    });
    if (focus) $("pa-tab-" + cle).focus();
    rendre();
  }
  function choisir(cle, focus) { history.replaceState(null, "", "#placements?onglet=" + cle); ouvrirOnglet(cle, focus); }
  barre.addEventListener("click", function (e) { var b = e.target.closest("[data-onglet]"); if (b) choisir(b.getAttribute("data-onglet")); });
  barre.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var i = ONGLETS.indexOf(barre.getAttribute("data-o")), n = ONGLETS.length;
    choisir(ONGLETS[(Math.max(0, i) + (e.key === "ArrowRight" ? 1 : n - 1)) % n], true);
  });
  function actif() { return barre.getAttribute("data-o"); }

  /* ===================================================================
     Rendu
     =================================================================== */
  function vide(zone, titre, texte, actions) {
    var s = panneau(null, "pa-vide");
    var ico = cree("span", "pa-vide__ico"); ico.appendChild(icone("portefeuille")); s.appendChild(ico);
    s.appendChild(cree("h2", null, titre)); s.appendChild(cree("p", null, texte));
    var bt = cree("div", "pa-actions"); actions.forEach(function (b) { bt.appendChild(b); }); s.appendChild(bt);
    zone.appendChild(s);
  }
  function barreRepartition(parts, classe) {
    var b = cree("div", "pa-barre"); b.setAttribute("aria-hidden", "true");
    parts.forEach(function (x) { var i = cree("i", "pa-c-" + x.cle); i.style.setProperty("width", (x.part * 100).toFixed(2) + "%"); b.appendChild(i); });
    var leg = cree("ul", "pa-leg" + (classe ? " " + classe : "")); leg.setAttribute("role", "list");
    parts.forEach(function (x) { var li = cree("li", "pa-c-" + x.cle); li.appendChild(cree("span", null, x.lib + " " + pct(x.part * 100, 0))); leg.appendChild(li); });
    return [b, leg];
  }
  function itemListe(ul, o) {
    var li = cree("li"), b = cree("button", "cpt-ligne pa-ligne"); b.type = "button";
    Object.keys(o.data).forEach(function (k) { b.setAttribute("data-" + k, o.data[k]); });
    var ico = cree("span", "cpt-ligne__ico pa-ico pa-c-" + o.c, o.ini); ico.setAttribute("aria-hidden", "true");
    var txt = cree("span", "cpt-ligne__txt"); txt.appendChild(cree("b", null, o.nom)); txt.appendChild(cree("small", null, o.sous));
    var mt = cree("span", "cpt-ligne__mt chiffre"); mt.appendChild(cree("b", null, o.montant)); var sm = cree("small", o.clsSous || null, o.droite || ""); mt.appendChild(sm);
    var crayon = cree("span", "cpt-ligne__mod"); crayon.appendChild(icone("crayon"));
    b.appendChild(ico); b.appendChild(txt); b.appendChild(mt); b.appendChild(crayon);
    b.setAttribute("aria-label", o.aria + ". Modifier");
    li.appendChild(b); ul.appendChild(li);
  }
  function liste() { var ul = cree("ul", "cpt-liste"); ul.setAttribute("role", "list"); return ul; }

  /* ---------- Bourse ---------- */
  var INI = { action: "AC", sicav_oblig: "SO", sicav_mixte: "SM", fcp: "FC", autre: "T" };
  function rendreBourse(a) {
    var z = $("pa-bourse"); z.textContent = "";
    var b = a.bourse;
    if (!b.lignes.length) {
      vide(z, "Votre portefeuille de titres", "Actions de la Bourse de Tunis, SICAV et FCP : ajoutez chaque ligne avec le nombre de titres, le montant investi et le dernier cours. Orbite calcule la plus-value et la répartition.",
        [bouton("Ajouter un titre", "bouton--plein", "plus", { "data-ajouter": "titre" })]);
      return;
    }
    var c = panneau(null, "pa-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, "Portefeuille titres · " + b.lignes.length + (b.lignes.length > 1 ? " lignes" : " ligne")));
    c.appendChild(tete);
    c.appendChild(cree("p", "cpt-total__chiffre chiffre", dt3(b.valeur)));
    if (b.revient > 0) c.appendChild(cree("p", "cpt-tendance " + (b.pv >= 0 ? "cpt-tendance--hausse" : "cpt-tendance--baisse"),
      (b.pv >= 0 ? "▲ +" : "▼ ") + dt(b.pv) + " de plus-value latente (" + signePct(b.pvPct) + ")"));
    if (b.repartition.length) barreRepartition(b.repartition.map(function (r) { return { cle: r.cle, lib: r.lib, part: r.part }; })).forEach(function (e) { c.appendChild(e); });
    z.appendChild(c);
    var l = panneau("Vos titres"), ul = liste();
    b.lignes.forEach(function (x) {
      var sous = (x.quantite ? F.dt0(x.quantite) + " × " + F.dt3(x.cours) : "") + (x.coursDu ? " · cours du " + PL.libDate(x.coursDu) : " · cours à saisir");
      itemListe(ul, { data: { titre: x.id }, c: x.type, ini: INI[x.type], nom: x.nom, sous: sous, montant: dt3(x.valeur),
        droite: x.pvPct != null ? signePct(x.pvPct) : "", clsSous: x.pvPct == null ? null : x.pvPct >= 0 ? "cpt-plus" : "cpt-moins",
        aria: x.nom + " : " + dt3(x.valeur) + (x.pvPct != null ? ", " + signePct(x.pvPct) : "") });
    });
    l.appendChild(ul); z.appendChild(l);
    var r = panneau(null);
    r.appendChild(ligneLR("Dividendes et coupons reçus en " + aujourdhui().slice(0, 4), dt(b.revenusAnnee)));
    if (b.venteActions.pv > 0) r.appendChild(ligneLR("Impôt si vous vendiez vos actions aujourd'hui", b.venteActions.impot > 0 ? dt(b.venteActions.impot) : "0 DT (sous l'abattement de 10 000 DT)"));
    r.appendChild(ligneLR("Cours à mettre à jour", b.anciens ? b.anciens + (b.anciens > 1 ? " lignes de plus de 7 jours" : " ligne de plus de 7 jours") : "aucun", b.anciens ? "cpt-moins" : null));
    z.appendChild(r);
    var act = cree("div", "pa-actions");
    act.appendChild(bouton("Ajouter un titre", "bouton--plein", "plus", { "data-ajouter": "titre" }));
    act.appendChild(bouton("Mettre à jour les cours", "", "hausse", { "data-ajouter": "cours" }));
    act.appendChild(bouton("Dividende reçu", "", "plus", { "data-ajouter": "revenu" }));
    z.appendChild(act);
  }

  /* ---------- Dépôts ---------- */
  var INI_T = { dat: "DAT", bta: "BTA", btct: "BTC", cse: "CSE", autre: "%" };
  function rendreDepots(a, ctx) {
    var z = $("pa-depots"); z.textContent = "";
    var t = a.taux;
    if (!t.lignes.length) {
      vide(z, "Vos placements à taux connu", "Dépôts à terme, bons du Trésor, comptes spéciaux d'épargne : Orbite calcule les intérêts nets d'impôt, vous rappelle chaque échéance et vous aide à décider quoi en faire.",
        [bouton("Ajouter un placement", "bouton--plein", "plus", { "data-ajouter": "taux" })]);
      return;
    }
    if (t.prochaine && t.prochaine.jours <= 30) {
      var ligne = t.lignes.filter(function (l) { return l.id === t.prochaine.id; })[0], dec = PL.decisionEcheance(ligne, ctx.credits);
      var al = cree("div", "pa-alerte");
      al.appendChild(icone("horloge"));
      var tx = cree("div");
      tx.appendChild(cree("b", null, "Échéance dans " + t.prochaine.jours + (t.prochaine.jours > 1 ? " jours" : " jour") + " : " + t.prochaine.nom.toLowerCase() + " de " + dt(t.prochaine.montant) + " le " + t.prochaine.lib + "."));
      var s = "Renouvelé au même taux, il rapporte " + dt(dec.renouveler) + " net par an.";
      if (dec.credit) s += " Rembourser « " + dec.credit.libelle + " » (" + pct(dec.credit.tauxPct, 2) + ") avec " + dt(dec.credit.somme) + " vous ferait économiser environ " + dt(dec.credit.economie) + " d'intérêts la première année" +
        (dec.credit.meilleur === "rembourser" ? " : c'est le meilleur choix en chiffres (gardez votre réserve de sécurité)." : dec.credit.meilleur === "renouveler" ? " : le placement rapporte plus." : ".");
      tx.appendChild(cree("span", null, s));
      al.appendChild(tx); z.appendChild(al);
    }
    var c = panneau(null, "pa-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, "Placé à taux connu · " + (t.lignes.length - t.echus) + " en cours")); c.appendChild(tete);
    c.appendChild(cree("p", "cpt-total__chiffre chiffre", dt3(t.total)));
    var g = cree("dl", "cpt-delta pa-deux");
    [["Intérêts nets par an", dt(t.interetsNets)], ["Taux net moyen", pct(t.tauxNetMoyen, 2)]].forEach(function (x) { var d = cree("div"); d.appendChild(cree("dt", null, x[0])); d.appendChild(cree("dd", "chiffre", x[1])); g.appendChild(d); });
    c.appendChild(g); z.appendChild(c);
    var l = panneau("Vos placements"), ul = liste();
    t.lignes.forEach(function (x) {
      var sous = [x.banque, pct(x.tauxBrut, 2) + " brut", x.fin ? (x.echu ? "échu le " + PL.libDate(x.fin) : "fin " + PL.libDate(x.fin)) : (x.type === "cse" ? "sans échéance" : "")].filter(Boolean).join(" · ");
      itemListe(ul, { data: { taux: x.id }, c: "taux", ini: INI_T[x.type], nom: x.nom, sous: sous, montant: dt3(x.montant),
        droite: x.echu ? "à mettre à jour" : "+" + dt(x.interetsNets) + " net / an", clsSous: x.echu ? "cpt-moins" : "cpt-plus",
        aria: x.nom + " : " + dt3(x.montant) + ", " + pct(x.tauxBrut, 2) + " brut" });
    });
    l.appendChild(ul);
    l.appendChild(cree("p", "cpt-note", t.lignes.some(function (x) { return x.exonere; })
      ? "Intérêts nets de la retenue de 20 %. Comptes spéciaux d'épargne : intérêts déductibles de votre revenu imposable jusqu'à 6 000 DT par an (la retenue est récupérée à la déclaration)."
      : "Intérêts nets de la retenue à la source de 20 %."));
    z.appendChild(l);
    if (t.echeances.length) {
      var e = panneau("Calendrier des échéances");
      t.echeances.forEach(function (x) { e.appendChild(ligneLR(x.lib + (x.echu ? " (passée)" : x.jours <= 30 ? " · dans " + x.jours + " j" : ""), dt(x.montant), x.echu ? "cpt-moins" : null)); });
      z.appendChild(e);
    }
    var act = cree("div", "pa-actions"); act.appendChild(bouton("Ajouter un placement", "bouton--plein", "plus", { "data-ajouter": "taux" })); z.appendChild(act);
  }

  /* ---------- Immobilier et or ---------- */
  function rendreImmo(a) {
    var z = $("pa-immo"); z.textContent = "";
    var im = a.immobilier, o = a.or;
    if (!im.biens.length && !o.lignes.length) {
      vide(z, "Vos biens loués et votre or", "Un appartement loué : loyer, charges, impôt et crédit relié donnent ce qu'il rapporte vraiment chaque mois. L'or : en grammes et en carats, au prix du jour que vous saisissez.",
        [bouton("Ajouter un bien", "bouton--plein", "plus", { "data-ajouter": "bien" }), bouton("Ajouter de l'or", "", "plus", { "data-ajouter": "or" })]);
      return;
    }
    im.biens.forEach(function (b) {
      var c = panneau(null, "pa-bien");
      var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, b.nom + (b.loue ? " · loué" : "")));
      var mod = bouton("Modifier", "bouton--petit bouton--fantome", "crayon", { "data-bien": b.id }); tete.appendChild(mod); c.appendChild(tete);
      c.appendChild(cree("p", "pa-gros chiffre", dt(b.valeur) + " estimés"));
      if (b.loue) {
        c.appendChild(ligneLR("Loyer", dt(b.loyer) + " / mois"));
        c.appendChild(ligneLR("Charges, taxe, assurance", dt(-b.charges) + " / an"));
        c.appendChild(ligneLR("Impôt sur le loyer (estimé)", dt(-b.impot) + " / an"));
        if (b.credit) c.appendChild(ligneLR("Mensualité de « " + b.credit.libelle + " »", dt(-b.credit.mensualite) + " / mois"));
        else if (b.creditLie) c.appendChild(ligneLR("Crédit relié", "« " + b.creditLie + " » introuvable ou terminé", "cpt-moins"));
        var g = cree("dl", "cpt-delta pa-deux");
        [["Rendement net", b.rendementNet != null ? pct(b.rendementNet * 100, 1) : "—", null], [b.credit ? "Effort chaque mois" : "Ce qu'il rapporte", (b.effortMois >= 0 ? "+" : "") + dt(b.effortMois) + " / mois", b.effortMois >= 0 ? "cpt-plus" : "cpt-moins"]]
          .forEach(function (x) { var d = cree("div"); d.appendChild(cree("dt", null, x[0])); d.appendChild(cree("dd", "chiffre" + (x[2] ? " " + x[2] : ""), x[1])); g.appendChild(d); });
        c.appendChild(g);
      } else c.appendChild(cree("p", "cpt-note", "Pas de loyer saisi : ce bien compte dans votre patrimoine à sa valeur estimée."));
      z.appendChild(c);
    });
    if (o.lignes.length) {
      var c2 = panneau(null, "pa-or");
      var tete2 = cree("div", "cpt-total__tete"); tete2.appendChild(cree("h2", null, "Or"));
      tete2.appendChild(cree("span", "cpt-puce", o.coursDu ? "Prix saisi le " + PL.libDate(o.coursDu) : "Prix à saisir")); c2.appendChild(tete2);
      c2.appendChild(cree("p", "pa-gros chiffre", dt(o.valeur)));
      o.lignes.forEach(function (l) {
        var r = ligneLR(F.dt3(l.grammes).replace(/,000$/, "") + " g en " + l.carats + " carats" + (l.nom && l.nom !== "Or" ? " · " + l.nom : ""), dt(l.valeur));
        var bt = bouton("", "bouton--icone bouton--petit bouton--fantome", "crayon", { "data-or": l.id, "aria-label": "Modifier " + l.nom }); r.appendChild(bt);
        c2.appendChild(r);
      });
      if (o.pvPct != null) c2.appendChild(ligneLR("Depuis l'achat", signePct(o.pvPct), o.pvPct >= 0 ? "cpt-plus" : "cpt-moins"));
      c2.appendChild(cree("p", "cpt-note", "Prix du gramme en 18 carats : " + (o.cours18 > 0 ? dt3(o.cours18) : "à saisir") + ". Les autres titres en sont déduits (24 carats = 18 carats × 24 / 18)."));
      z.appendChild(c2);
    }
    var act = cree("div", "pa-actions");
    act.appendChild(bouton("Ajouter un bien", "bouton--plein", "plus", { "data-ajouter": "bien" }));
    act.appendChild(bouton("Ajouter de l'or", "", "plus", { "data-ajouter": "or" }));
    if (o.lignes.length) act.appendChild(bouton("Prix de l'or", "", "hausse", { "data-ajouter": "coursOr" }));
    z.appendChild(act);
  }

  /* ---------- Synthèse ---------- */
  function donut(parts) {
    var s = doc.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("class", "pa-donut"); s.setAttribute("aria-hidden", "true");
    var r = 46, cir = 2 * Math.PI * r, deb = 0;
    var fond = doc.createElementNS(SVG, "circle"); fond.setAttribute("cx", 60); fond.setAttribute("cy", 60); fond.setAttribute("r", r); fond.setAttribute("class", "pa-donut__fond"); s.appendChild(fond);
    parts.forEach(function (x) {
      var c = doc.createElementNS(SVG, "circle"), l = x.part * cir;
      c.setAttribute("cx", 60); c.setAttribute("cy", 60); c.setAttribute("r", r); c.setAttribute("class", "pa-c-" + x.cle);
      c.setAttribute("stroke-dasharray", l.toFixed(2) + " " + (cir - l).toFixed(2)); c.setAttribute("stroke-dashoffset", (-deb).toFixed(2));
      c.setAttribute("transform", "rotate(-90 60 60)"); s.appendChild(c); deb += l;
    });
    return s;
  }
  function rendreSynthese(a) {
    var z = $("pa-synthese"); z.textContent = "";
    if (a.vide) {
      vide(z, "La synthèse de vos placements", "Ajoutez un titre, un dépôt, un bien ou de l'or : Orbite montre la répartition de tout ce que vous avez placé et ce que cela rapporte une fois l'inflation retirée.",
        [bouton("Commencer par la bourse", "bouton--plein", null, { "data-aller": "bourse" }), bouton("Un dépôt", "", null, { "data-aller": "depots" })]);
      return;
    }
    var c = panneau(null, "pa-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, "Tous vos placements")); c.appendChild(tete);
    c.appendChild(cree("p", "cpt-total__chiffre chiffre", dt(a.total)));
    var grille = cree("div", "pa-synth");
    grille.appendChild(donut(a.repartition));
    var leg = cree("ul", "pa-leg pa-leg--col"); leg.setAttribute("role", "list");
    a.repartition.forEach(function (x) { var li = cree("li", "pa-c-" + x.cle); li.appendChild(cree("span", null, x.lib)); li.appendChild(cree("b", "chiffre", pct(x.part * 100, 0) + " · " + dt(x.valeur))); leg.appendChild(li); });
    grille.appendChild(leg); c.appendChild(grille);
    z.appendChild(c);
    var r = panneau("Ce que vos placements rapportent");
    r.appendChild(ligneLR("Revenus nets par an (loyers, intérêts, dividendes)", dt(a.revenusAn)));
    r.appendChild(ligneLR("Soit, sur tout ce que vous avez placé", pct(a.rendement, 1) + " par an"));
    r.appendChild(ligneLR("Inflation" + (a.placements.inflation != null ? " (saisie)" : " (INS)"), pct(a.inflation, 1)));
    r.appendChild(ligneLR("Après inflation", (a.reel >= 0 ? "+" : "") + pct(a.reel, 1) + " par an", a.reel >= 0 ? "cpt-plus" : "cpt-moins"));
    r.appendChild(cree("p", "cpt-note", "La hausse de valeur de l'immobilier, de l'or et des titres n'est pas comptée ici : elle n'est connue qu'à la revente (la plus-value latente des titres est dans l'onglet Bourse)."));
    r.appendChild(bouton("Changer l'inflation", "bouton--petit bouton--fantome", "outils", { "data-ajouter": "inflation" }));
    z.appendChild(r);
    if (a.points.length) {
      var forts = a.points.filter(function (x) { return x.ton === "fort"; }), faibles = a.points.filter(function (x) { return x.ton === "faible"; });
      var p = panneau("Points à surveiller"), gr = cree("div", "cpt-points");
      [[faibles, "À regarder", "faible", "alerte"], [forts, "Points forts", "fort", "valide"]].forEach(function (g) {
        if (!g[0].length) return;
        var col = cree("div"); col.appendChild(cree("h3", "cpt-points__t cpt-points__t--" + g[2], g[1]));
        var ul = cree("ul", "cpt-points__liste"); ul.setAttribute("role", "list");
        g[0].forEach(function (pt) {
          var li = cree("li", "cpt-point cpt-point--" + g[2]), ic = cree("span", "cpt-point__ico"); ic.appendChild(icone(g[3]));
          var tx = cree("div"); tx.appendChild(cree("b", null, pt.titre)); tx.appendChild(cree("span", null, pt.texte));
          if (pt.lien) { var l = cree("a", "lien-action", "Voir"); l.href = "#placements?onglet=" + pt.lien.onglet; tx.appendChild(l); }
          li.appendChild(ic); li.appendChild(tx); ul.appendChild(li);
        });
        col.appendChild(ul); gr.appendChild(col);
      });
      p.appendChild(gr); z.appendChild(p);
    }
    z.appendChild(cree("p", "cpt-note pa-neutre", "Orbite ne conseille aucun produit ni aucune banque : il montre la répartition et le rendement réel, la décision vous appartient. Votre assurance vie et votre CEA (module Épargne) et votre épargne disponible sont comptés dans la synthèse."));
  }

  function rendre() {
    if ($("vue-placements").hidden) return;
    var o = actif();
    $("pa-source").hidden = o === "assurances" || o === "proches";
    if (o === "assurances" || o === "proches") { if (window.OrbitePilotage) window.OrbitePilotage.rendre(o); return; }
    var ctx = contexte(), a = PL.analyser((O.profil() || {}).placements, ctx);
    if (o === "bourse") rendreBourse(a);
    else if (o === "depots") rendreDepots(a, ctx);
    else if (o === "immo") rendreImmo(a);
    else rendreSynthese(a);
    $("pa-source").textContent = "Règles fiscales appliquées : " + [PL.FISC.sources.interets, PL.FISC.sources.epargne, PL.FISC.sources.loyers, PL.FISC.sources.plusValues].join(" ; ") + ". Estimations à partir de vos saisies.";
  }

  /* ===================================================================
     Fenêtre de saisie (une seule, champs selon l'objet)
     =================================================================== */
  var dlg = $("dlg-placement"), edition = null;
  function opts(liste, noms) { return liste.map(function (k) { return [k, noms[k]]; }); }
  /* Définition des champs : [clé, libellé, type (texte|montant|nombre|pct|date|choix), options, aide, facultatif] */
  var FORMES = {
    titre: { titre: "un titre", liste: "titres", prefixe: "t", champs: [
      ["nom", "Nom du titre", "texte", null, "Ex. SICAV obligataire de votre banque"],
      ["type", "Type", "choix", opts(PL.TYPES_TITRE, PL.NOMS_TITRE)],
      ["quantite", "Nombre de titres ou de parts", "nombre"],
      ["investi", "Montant investi (total, frais compris)", "montant", null, "Pour calculer la plus-value", true],
      ["cours", "Dernier cours ou valeur liquidative (par titre)", "nombre", null, "Sur le site de la Bourse ou de votre intermédiaire"],
      ["coursDu", "Date du cours", "date"]
    ] },
    revenu: { titre: "un dividende ou un coupon reçu", champs: [
      ["lib", "Titre concerné", "texte", null, "Facultatif", true], ["v", "Montant reçu (net)", "montant"], ["d", "Date", "date"]] },
    taux: { titre: "un placement à taux connu", liste: "taux", prefixe: "p", champs: [
      ["type", "Type", "choix", opts(PL.TYPES_TAUX, PL.NOMS_TAUX)],
      ["nom", "Nom", "texte", null, "Facultatif", true],
      ["banque", "Banque", "texte", null, "Facultatif", true],
      ["montant", "Montant placé", "montant"],
      ["tauxBrut", "Taux annuel brut", "pct"],
      ["debut", "Date de début", "date", null, "Facultatif", true],
      ["fin", "Date d'échéance", "date", null, "Vide pour un compte d'épargne sans échéance", true]
    ] },
    bien: { titre: "un bien immobilier", liste: "biens", prefixe: "b", champs: [
      ["nom", "Nom du bien", "texte", null, "Ex. Appartement S+2 à Sousse"],
      ["valeur", "Valeur estimée aujourd'hui", "montant", null, "Votre estimation (prix des biens semblables)"],
      ["loyer", "Loyer mensuel", "montant", null, "0 s'il n'est pas loué", true],
      ["charges", "Charges par an (taxe, syndic, assurance, entretien)", "montant", null, "Facultatif", true],
      ["credit", "Crédit relié (module Crédit)", "choix", null, "Sa mensualité est déduite de ce que rapporte le bien", true]
    ] },
    or: { titre: "de l'or", liste: "or", prefixe: "o", champs: [
      ["nom", "Description", "texte", null, "Ex. bijoux, lingot", true],
      ["grammes", "Poids en grammes", "nombre"],
      ["carats", "Titre", "choix", PL.CARATS.map(function (c) { return [String(c), c + " carats"]; })],
      ["prixAchat", "Prix payé (total)", "montant", null, "Facultatif : pour voir ce qu'il a gagné", true]
    ] },
    coursOr: { titre: "le prix de l'or", champs: [
      ["g18", "Prix d'un gramme d'or 18 carats", "nombre", null, "Prix d'achat chez un bijoutier ou cours publié"], ["du", "Date du prix", "date"]] },
    inflation: { titre: "l'inflation retenue", champs: [
      ["inflation", "Inflation annuelle", "pct", null, "Vide : chiffre de l'INS utilisé par Orbite", true]] }
  };
  function champHtml(f, valeur) {
    var cle = f[0], id = "pa-f-" + cle, ch = cree("div", "champ");
    var lab = cree("label", null, f[1]); lab.setAttribute("for", id); ch.appendChild(lab);
    var sa = cree("div", "saisie"), inp;
    if (f[2] === "choix") {
      inp = cree("select"); (f[3] || []).forEach(function (o) { var op = cree("option", null, o[1]); op.value = o[0]; inp.appendChild(op); });
      sa.appendChild(inp); var chev = icone("chevron"); chev.setAttribute("class", "saisie__chevron"); sa.appendChild(chev);
      if (valeur != null) inp.value = String(valeur);
    } else {
      inp = cree("input"); inp.autocomplete = "off";
      if (f[2] === "date") { inp.type = "date"; inp.value = valeur || ""; }
      else if (f[2] === "texte") { inp.type = "text"; inp.maxLength = 40; inp.value = valeur || ""; }
      else { inp.type = "text"; inp.inputMode = "decimal"; inp.value = valeur ? String(valeur).replace(".", ",") : ""; }
      sa.appendChild(inp);
      if (f[2] === "montant") sa.appendChild(cree("span", "saisie__unite", "DT"));
      if (f[2] === "pct") sa.appendChild(cree("span", "saisie__unite", "%"));
    }
    inp.id = id; inp.setAttribute("data-champ", cle);
    ch.appendChild(sa);
    if (f[4]) { var aide = cree("span", "champ__aide", f[4]); aide.id = id + "-aide"; inp.setAttribute("aria-describedby", aide.id); ch.appendChild(aide); }
    return ch;
  }
  function erreur(t) { var e = $("pa-dlg-err"); e.textContent = t || ""; e.hidden = !t; }
  function lireForm(forme) {
    var r = {}, err = null;
    forme.champs.forEach(function (f) {
      if (err) return;
      var el = $("pa-f-" + f[0]), v = el.value;
      if (f[2] === "texte" || f[2] === "choix") { r[f[0]] = v.trim(); return; }
      if (f[2] === "date") {
        if (!v) { if (!f[5]) err = "Choisissez : " + f[1].toLowerCase() + "."; r[f[0]] = ""; return; }
        r[f[0]] = v; return;
      }
      var l = F.lire(v);
      if (!l.valide) { err = "« " + f[1] + " » n'est pas un nombre valide."; return; }
      if (l.vide && !f[5]) { err = "Indiquez : " + f[1].toLowerCase() + "."; return; }
      r[f[0]] = l.vide ? (f[2] === "pct" && f[0] === "inflation" ? null : 0) : l.valeur;
    });
    return err ? { erreur: err } : r;
  }
  function apercu() {
    var el = $("pa-dlg-apercu"); el.hidden = true;
    if (!edition || (edition.type !== "taux" && edition.type !== "titre")) return;
    var r = lireForm(FORMES[edition.type]); if (r.erreur) return;
    if (edition.type === "taux" && r.montant > 0 && r.tauxBrut > 0) {
      var a = PL.analyser({ taux: [r] }, contexte()).taux.lignes[0];
      el.textContent = "Intérêts : " + dt(a.interetsBruts) + " brut, " + dt(a.interetsNets) + " net par an" + (a.exonere ? " (retenue récupérée à la déclaration)." : " (après la retenue de 20 %).");
      el.hidden = false;
    } else if (edition.type === "titre" && r.quantite > 0 && r.cours > 0) {
      var v = r.quantite * r.cours;
      el.textContent = "Valeur aujourd'hui : " + dt3(v) + (r.investi > 0 ? " · plus-value " + (v >= r.investi ? "+" : "") + dt(v - r.investi) + " (" + signePct((v - r.investi) / r.investi) + ")" : "") + ".";
      el.hidden = false;
    }
  }
  function ouvrir(type, id) {
    var forme = FORMES[type], pl = placements(), obj = null;
    if (forme.liste && id) obj = pl[forme.liste].filter(function (x) { return x.id === id; })[0] || null;
    edition = { type: type, id: obj ? obj.id : null };
    $("pa-dlg-titre").textContent = (obj ? "Modifier " : type === "coursOr" || type === "inflation" ? "Modifier " : "Ajouter ") + forme.titre;
    var zone = $("pa-dlg-champs"); zone.textContent = "";
    var valeurs = obj ? cloner(obj) : {};
    if (type === "coursOr") valeurs = { g18: pl.coursOr.g18 || "", du: pl.coursOr.du || aujourdhui() };
    if (type === "inflation") valeurs = { inflation: pl.inflation };
    if (!obj && (type === "titre")) valeurs.coursDu = aujourdhui();
    if (!obj && type === "revenu") valeurs.d = aujourdhui();
    if (!obj && type === "or") valeurs.carats = 18;
    if (type === "bien") {
      var p = O.profil() || {}, choix = [["", "Aucun"]].concat((p.credits || []).map(function (c) { return [c.libelle, c.libelle]; }));
      forme.champs[4][3] = choix;
    }
    forme.champs.forEach(function (f) { zone.appendChild(champHtml(f, valeurs[f[0]])); });
    if (type === "cours") construireCours(zone, pl);
    var aide = $("pa-dlg-aide");
    aide.hidden = type !== "inflation";
    if (type === "inflation") aide.textContent = "Inflation de l'INS pour cette année : " + pct(contexte().inflationDefaut, 1) + ".";
    $("pa-dlg-supprimer").hidden = !obj; $("pa-dlg-confirmer").hidden = true;
    erreur(""); apercu();
    dlg.showModal();
    var premier = zone.querySelector("input, select"); if (premier) premier.focus();
  }
  /* Mettre à jour les cours : une ligne par titre, une date commune. */
  FORMES.cours = { titre: "les cours", champs: [["du", "Date des cours", "date"]] };
  function construireCours(zone, pl) {
    $("pa-f-du").value = aujourdhui();
    pl.titres.forEach(function (t) {
      zone.appendChild(champHtml(["cours-" + t.id, t.nom + " (dernier : " + F.dt3(t.cours) + ")", "nombre", null, null, true], t.cours));
    });
  }
  $("pa-dlg-champs").addEventListener("input", function () { erreur(""); apercu(); });

  $("form-placement").addEventListener("submit", function (e) {
    var v = e.submitter && e.submitter.value;
    if (v !== "ok" || !edition) return;
    var type = edition.type, forme = FORMES[type], pl = placements(), msg;
    var r = lireForm(forme);
    if (r.erreur) { e.preventDefault(); erreur(r.erreur); return; }
    if (type === "cours") {
      if (r.du > aujourdhui()) { e.preventDefault(); erreur("La date ne peut pas être dans le futur."); return; }
      pl.titres.forEach(function (t) { var l = F.lire($("pa-f-cours-" + t.id).value); if (l.valide && !l.vide && l.valeur > 0) { t.cours = l.valeur; t.coursDu = r.du; } });
      msg = "Cours mis à jour";
    } else if (type === "coursOr") {
      if (!(r.g18 > 0)) { e.preventDefault(); erreur("Indiquez le prix du gramme."); return; }
      pl.coursOr = { g18: r.g18, du: r.du }; msg = "Prix de l'or enregistré";
    } else if (type === "inflation") {
      pl.inflation = r.inflation; msg = r.inflation == null ? "Inflation de l'INS utilisée" : "Inflation enregistrée";
    } else if (type === "revenu") {
      if (!(r.v > 0)) { e.preventDefault(); erreur("Indiquez le montant reçu."); return; }
      pl.revenus.push(r); msg = "Revenu enregistré";
    } else {
      if (type === "taux" && r.fin && r.debut && r.fin <= r.debut) { e.preventDefault(); erreur("L'échéance doit être après la date de début."); return; }
      if (type === "titre" && !(r.quantite > 0)) { e.preventDefault(); erreur("Indiquez le nombre de titres."); return; }
      if (type === "or" && !(r.grammes > 0)) { e.preventDefault(); erreur("Indiquez le poids en grammes."); return; }
      if (type === "taux" && !(r.montant > 0)) { e.preventDefault(); erreur("Indiquez le montant placé."); return; }
      if (type === "bien" && !(r.valeur > 0)) { e.preventDefault(); erreur("Indiquez la valeur estimée."); return; }
      if (type === "or") r.carats = +r.carats;
      var l = pl[forme.liste];
      if (edition.id) { var i = l.findIndex(function (x) { return x.id === edition.id; }); r.id = edition.id; if (i >= 0) l[i] = Object.assign({}, l[i], r); msg = "Modifié"; }
      else {
        if (l.length >= PL.MAX[forme.liste]) { e.preventDefault(); erreur("Limite atteinte : " + PL.MAX[forme.liste] + " au plus."); return; }
        r.id = PL.nouvelId(l, forme.prefixe); l.push(r); msg = "Ajouté à Mon patrimoine";
      }
    }
    edition = null;
    enregistrer(pl, msg);
  });
  $("pa-dlg-supprimer").addEventListener("click", function () {
    if (!edition || !edition.id) return;
    $("pa-dlg-confirmer-txt").textContent = "Supprimer cette ligne de Mon patrimoine ?";
    $("pa-dlg-confirmer").hidden = false; $("pa-dlg-supprimer-oui").focus();
  });
  $("pa-dlg-supprimer-oui").addEventListener("click", function () {
    var forme = FORMES[edition.type], pl = placements(), id = edition.id;
    pl[forme.liste] = pl[forme.liste].filter(function (x) { return x.id !== id; });
    dlg.close(); edition = null;
    enregistrer(pl, "Supprimé de Mon patrimoine");
  });

  /* ---------- Points d'entrée ---------- */
  $("vue-placements").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ajouter], [data-titre], [data-taux], [data-bien], [data-or], [data-aller]");
    if (!b) return;
    if (b.hasAttribute("data-aller")) return choisir(b.getAttribute("data-aller"));
    if (b.hasAttribute("data-ajouter")) return ouvrir(b.getAttribute("data-ajouter"));
    if (b.hasAttribute("data-titre")) return ouvrir("titre", b.getAttribute("data-titre"));
    if (b.hasAttribute("data-taux")) return ouvrir("taux", b.getAttribute("data-taux"));
    if (b.hasAttribute("data-bien")) return ouvrir("bien", b.getAttribute("data-bien"));
    if (b.hasAttribute("data-or")) return ouvrir("or", b.getAttribute("data-or"));
  });

  window.OrbitePlacements = { rendre: rendre, ouvrir: ouvrir, analyse: analyse };
  O.surProfil(function () { rendre(); });
  doc.addEventListener("orbite:vue", function (e) {
    if (!e.detail || e.detail.vue !== "placements") return;
    var o = e.detail.params && e.detail.params.get("onglet");
    ouvrirOnglet(o || actif());
  });
})();
