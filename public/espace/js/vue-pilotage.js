/*
 * Orbite — pilotage (lot B, maquettes B1 à B4 validées le 16 oct. 2026).
 *   Mon mois › Prévision : le compte courant jour par jour sur 90 jours, découvert repéré à l'avance et solution chiffrée.
 *   Mon mois › Factures : ce qui revient chaque mois (repéré dans les relevés, lus sur l'appareil, ou ajouté à la main).
 *   Mon patrimoine › Assurances : contrats, échéances, manques évidents.
 *   Mon patrimoine › Proches : argent prêté et emprunté, échéancier, remboursements reçus.
 * Calculs : pilotage-calcul.js. Gardé dans le profil (factures, assurances, proches) ; chaque changement s'annule depuis le message.
 * Les onglets appartiennent à vue-mois.js et vue-placements.js, qui appellent OrbitePilotage.rendre(onglet).
 */
(function () {
  "use strict";
  var O = window.Orbite, PI = window.PilotageCalcul, doc = document;
  if (!O || !PI || !doc.getElementById("dlg-pilotage")) return;
  var F = O.F, $ = O.$, SVG = "http://www.w3.org/2000/svg", OC = window.OrbiteCalcul, OI = window.OrbiteIntelligence, CC = window.ComptesCalcul,
    D = window.DeciderCalcul, PL = window.PlacementsCalcul, OG = window.OrbiteGraphe, R = window.ReleveCalcul;

  /* ---------- Outils ---------- */
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return (v < 0 ? "−" : "") + F.dt0(Math.abs(v)) + " DT"; }
  function dt3(v) { return (v < 0 ? "−" : "") + F.dt3(Math.abs(v)); }
  function signe(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + F.dt0(Math.abs(v)); }
  function cloner(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function aujourdhui() { return PI.iso(new Date()); }
  /* Fin de phrase : pas de second point après une date abrégée (« 6 nov. »). */
  function pt(t) { return /\.$/.test(t) ? t : t + "."; }
  function dans(j) { return j === 0 ? "aujourd'hui" : j === 1 ? "demain" : j < 0 ? "en retard de " + (-j) + " j" : "dans " + j + " j"; }
  function bouton(lib, cls, ico, attrs) {
    var b = cree("button", "bouton " + (cls || "")); b.type = "button";
    if (ico) b.appendChild(icone(ico));
    if (lib) b.appendChild(doc.createTextNode(lib));
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }
  function panneau(titre, cls) { var s = cree("section", "panneau pa-carte" + (cls ? " " + cls : "")); if (titre) s.appendChild(cree("h2", "pa-carte__titre", titre)); return s; }
  function ligneLR(gauche, droite, clsD) { var r = cree("div", "pa-rang"); r.appendChild(cree("span", null, gauche)); r.appendChild(cree("b", "chiffre" + (clsD ? " " + clsD : ""), droite)); return r; }
  function liste() { var ul = cree("ul", "cpt-liste"); ul.setAttribute("role", "list"); return ul; }
  function actions(btns) { var a = cree("div", "pa-actions"); btns.forEach(function (b) { a.appendChild(b); }); return a; }
  function vide(zone, ico, titre, texte, btns) {
    var s = panneau(null, "pa-vide");
    var i = cree("span", "pa-vide__ico"); i.appendChild(icone(ico)); s.appendChild(i);
    s.appendChild(cree("h2", null, titre)); s.appendChild(cree("p", null, texte));
    s.appendChild(actions(btns)); zone.appendChild(s);
  }
  /* Une ligne cliquable (comme Mes comptes) : pastille, nom et détail, montant et détail. */
  function item(ul, o) {
    var li = cree("li"), b = cree(o.lien ? "a" : "button", "cpt-ligne pa-ligne");
    if (o.lien) b.href = o.lien; else b.type = "button";
    Object.keys(o.data || {}).forEach(function (k) { b.setAttribute("data-" + k, o.data[k]); });
    var ico = cree("span", "cpt-ligne__ico pa-ico pi-c-" + (o.c || "autre")); ico.setAttribute("aria-hidden", "true");
    if (o.ico) ico.appendChild(icone(o.ico)); else ico.textContent = o.ini || "";
    var txt = cree("span", "cpt-ligne__txt"); txt.appendChild(cree("b", null, o.nom));
    var sous = cree("small", null, o.sous || ""); if (o.badge) { var bd = cree("em", "pi-badge pi-badge--" + o.badge[1], o.badge[0]); sous.appendChild(doc.createTextNode(" ")); sous.appendChild(bd); }
    txt.appendChild(sous);
    var mt = cree("span", "cpt-ligne__mt chiffre"); mt.appendChild(cree("b", o.clsMontant || null, o.montant)); mt.appendChild(cree("small", o.clsDroite || null, o.droite || ""));
    var fin = cree("span", "cpt-ligne__mod"); fin.appendChild(icone(o.lien ? "fleche" : "crayon"));
    b.appendChild(ico); b.appendChild(txt); b.appendChild(mt); b.appendChild(fin);
    b.setAttribute("aria-label", o.aria + (o.lien ? ". Ouvrir" : ". Modifier"));
    li.appendChild(b); ul.appendChild(li);
  }
  function points(titre, verifs, tons) {
    var p = panneau(titre), gr = cree("div", "cpt-points");
    tons.forEach(function (g) {
      var l = verifs.filter(function (v) { return v.ton === g[0]; });
      if (!l.length) return;
      var col = cree("div"); col.appendChild(cree("h3", "cpt-points__t cpt-points__t--" + g[0], g[1]));
      var ul = cree("ul", "cpt-points__liste"); ul.setAttribute("role", "list");
      l.forEach(function (v) {
        var li = cree("li", "cpt-point cpt-point--" + g[0]), ic = cree("span", "cpt-point__ico"); ic.appendChild(icone(g[2]));
        var tx = cree("div"); tx.appendChild(cree("b", null, v.titre)); tx.appendChild(cree("span", null, v.texte));
        if (v.lien) { var a = cree("a", "lien-action", v.lien[1]); a.href = v.lien[0]; tx.appendChild(a); }
        li.appendChild(ic); li.appendChild(tx); ul.appendChild(li);
      });
      col.appendChild(ul); gr.appendChild(col);
    });
    p.appendChild(gr);
    return p;
  }

  /* ---------- Enregistrer (annulable) ---------- */
  function enregistrer(cle, valeur, message) {
    var p = O.profil() || {}, avant = cloner(p[cle] || []), maj = {};
    maj[cle] = valeur;
    O.majProfil(maj, { immediat: true });
    O.toast(message, { action: { libelle: "Annuler", fn: function () {
      var r = {}; r[cle] = avant;
      O.majProfil(r, { immediat: true });
      O.toast("Annulé : c'est revenu comme avant.", { type: "info" });
    } } });
  }

  /* ===================================================================
     Contexte commun
     =================================================================== */
  /* p : un profil (celui du compte par défaut ; Mes clients passe celui d'un client, en lecture seule). */
  function donnees(p0) {
    var p = p0 || O.profil() || {}, n = PI.normaliser(p);
    return { profil: p, factures: n.factures, assurances: n.assurances, proches: n.proches };
  }
  function reserveInfo(sy) {
    try { var r = OI && OI.reserve ? OI.reserve(sy, (sy.profil && sy.profil.reserve) || {}, {}) : null; return r ? { manque: r.manque, parMois: r.mensuel, depenses: r.depenses.total } : null; }
    catch (e) { return null; }
  }
  function creditsActifs(sy, p) {
    return (p.credits || []).map(function (c, i) {
      var r = sy && sy.credits && sy.credits[i] ? sy.credits[i].restantes : c.moisRestants;
      return { libelle: c.libelle, type: c.type, mensualite: c.mensualite, jour: c.jourPrelevement, restantes: r, actif: r > 0 && c.mensualite > 0 };
    });
  }
  function analyseFactures(d, sy) {
    var r = sy ? reserveInfo(sy) : null, net = sy && sy.salaire ? sy.salaire.netMensuel + (d.profil.autresRevenus || 0) : 0;
    return PI.analyserFactures(d.factures, { aujourdhui: aujourdhui(), netMensuel: net, reserve: r ? { manque: r.manque, parMois: r.parMois } : null });
  }
  function biensPatrimoine(p) { return PL && p.placements ? PL.normaliser(p.placements).biens : []; }
  function analyseAssurances(d, sy) {
    return PI.analyserAssurances(d.assurances, { aujourdhui: aujourdhui(), profil: d.profil, biens: biensPatrimoine(d.profil), credits: creditsActifs(sy, d.profil) });
  }
  function analyseProches(d) { return PI.analyserProches(d.proches, { aujourdhui: aujourdhui() }); }

  /* ===================================================================
     Mon mois › Prévision
     =================================================================== */
  function soldeCourant(p) {
    if (!CC) return null;
    var l = CC.normaliser(p.comptes).filter(function (c) { return c.type !== "epargne" && c.soldes.length; });
    if (!l.length) return null;
    var d = l.reduce(function (m, c) { var x = CC.dernier(c).d; return x > m ? x : m; }, "");
    return { d: d, v: CC.totalA(l, d), n: l.length };
  }
  function calculPrevision(p0, sy0) {
    var d = donnees(p0), p = d.profil, sy = sy0 || O.synthese();
    if (!sy) return { aucun: true };
    var s = soldeCourant(p);
    if (!s) return { aucun: true };
    var dm = OC.depensesMois(sy), m = new Date();
    var epargne = (p.contrats || []).reduce(function (t, c) { return t + (OC.contratCommence(c, m) ? c.versementMensuel : 0); }, 0);
    var r = reserveInfo(sy);
    var pv = PI.prevision({
      aujourdhui: aujourdhui(), jours: 90, solde: { v: s.v, d: s.d },
      paie: { montant: sy.salaire.netMensuel + (p.autresRevenus || 0), jour: p.jourPaie || 0 },
      credits: creditsActifs(sy, p), epargne: { montant: epargne, jour: p.jourVersement },
      logement: { montant: (p.loyer || 0) + (p.chargesFixes || 0), jour: 1 }, vieMois: dm.vie,
      factures: analyseFactures(d, sy).lignes, assurances: analyseAssurances(d, sy).lignes, proches: analyseProches(d).lignes,
      reserve: { disponible: p.epargneDisponible || 0, depensesMois: r ? r.depenses : dm.total }
    });
    pv.comptes = s.n; pv.vie = dm.vie; pv.sourceVie = dm.source;
    return pv;
  }
  var ICO_EVT = { credit: "credit", facture: "liste", assurance: "bouclier", proche: "profil", epargne: "epargne", logement: "maison", paie: "salaire" };
  function rendrePrevision() {
    var z = $("mo-prevision"); z.textContent = "";
    var pv = calculPrevision();
    if (pv.aucun) {
      vide(z, "hausse", "Les 90 prochains jours de votre compte", "Orbite part du dernier solde de votre compte courant et de ce qu'il connaît déjà (salaire, crédits, budget, factures, assurances, proches) pour prévoir votre solde jour par jour et repérer à l'avance un découvert.",
        [Object.assign(cree("a", "bouton bouton--plein", "Noter le solde de mon compte courant"), { href: "#mois?onglet=comptes" })]);
      return;
    }
    var dc = pv.decouvert;
    var al = cree("div", dc ? "pa-alerte pi-alerte--danger" : "pa-alerte pi-alerte--ok");
    al.appendChild(icone(dc ? "alerte" : "valide"));
    var tx = cree("div");
    if (dc) {
      var jours = dc.debut === dc.fin ? "le " + PI.libDate(dc.debut) : "du " + PI.libDate(dc.debut) + " au " + PI.libDate(dc.fin);
      tx.appendChild(cree("b", null, "Découvert prévu " + jours + " : jusqu'à " + dt(dc.min) + (dc.veillePaie ? ", la veille du salaire." : ".")));
      if (dc.cause) tx.appendChild(cree("span", null, "Cause : " + dc.cause.lib.replace(/ \((annuelle|estimée)\)$/, "").toLowerCase() + " (" + dt(-dc.cause.v) + ") le " + pt(PI.libDate(dc.cause.d))));
    } else {
      tx.appendChild(cree("b", null, pt("Pas de découvert prévu d'ici le " + PI.libDate(pv.fin.d))));
      tx.appendChild(cree("span", null, pt("Point le plus bas : " + dt(pv.min.v) + " le " + PI.libDate(pv.min.d))));
    }
    al.appendChild(tx); z.appendChild(al);

    var c = panneau(null, "pi-courbe");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, (pv.comptes > 1 ? "Comptes courants" : "Compte courant") + " · prévision jusqu'au " + PI.libDate(pv.fin.d)));
    c.appendChild(tete);
    var g = cree("div", "pi-graphe"); c.appendChild(g);
    z.appendChild(c);
    dessiner(g, pv);
    if (pv.ancien > 7) c.appendChild(cree("p", "cpt-note pi-ancien", "Votre dernier solde date du " + PI.libDate(pv.depart.d) + " : les opérations prévues depuis sont comptées. Notez un nouveau solde dans Comptes pour une prévision plus juste."));

    var evts = pv.evenements.slice(0, 8);
    if (evts.length) {
      var l = panneau("À venir"), ul = cree("ul", "pi-evts"); ul.setAttribute("role", "list");
      evts.forEach(function (e) {
        var li = cree("li", "pi-evt pi-evt--" + e.type), ic = cree("span", "pi-evt__ico"); ic.appendChild(icone(ICO_EVT[e.type] || "points"));
        var t = cree("span", "pi-evt__txt"); t.appendChild(cree("b", null, e.lib)); t.appendChild(cree("small", null, PI.libDate(e.d)));
        li.appendChild(ic); li.appendChild(t); li.appendChild(cree("b", "chiffre " + (e.v > 0 ? "cpt-plus" : ""), signe(e.v)));
        ul.appendChild(li);
      });
      l.appendChild(ul); z.appendChild(l);
    }
    if (dc) {
      var s = panneau("Pour l'éviter"), ol = cree("ol", "pi-etapes"), li1 = cree("li");
      if (dc.solution.possible) {
        li1.appendChild(cree("b", null, pt("Virer " + dt(dc.solution.montant) + " de l'épargne le " + PI.libDate(dc.solution.le))));
        if (dc.solution.reserveApres != null) li1.appendChild(cree("span", null, "Votre réserve reste à " + String(dc.solution.reserveApres).replace(".", ",") + " mois de dépenses."));
      } else {
        li1.appendChild(cree("b", null, pt("Mettre " + dt(dc.solution.montant) + " de côté d'ici le " + PI.libDate(dc.solution.le))));
        li1.appendChild(cree("span", null, "Votre épargne disponible ne suffit pas : réduisez les dépenses de loisirs ou décalez une dépense prévue avant cette date."));
      }
      ol.appendChild(li1);
      if (dc.cause && dc.cause.type === "assurance") { var li2 = cree("li"); li2.appendChild(cree("b", null, "Ou payer l'assurance en plusieurs fois.")); li2.appendChild(cree("span", null, "La plupart des assureurs le proposent : demandez-le avant l'échéance.")); ol.appendChild(li2); }
      s.appendChild(ol); z.appendChild(s);
    }
    z.appendChild(cree("p", "cpt-note pi-hyp", "Estimation : salaire le " + (O.profil().jourPaie >= 1 ? O.profil().jourPaie : "dernier jour") + " de chaque mois, dépenses de vie réparties chaque jour (" + dt(pv.vieJour) + " par jour, d'après " +
      (pv.sourceVie === "budget" ? "votre budget" : "une estimation prudente") + "), mensualités, factures, assurances et remboursements des proches à leur date. Refaite à chaque nouveau solde."));
  }
  function dessiner(zone, pv) {
    if (!OG) return;
    var pts = pv.points, ticks = [], iDe = {};
    pts.forEach(function (p, i) { iDe[p.d] = i; });
    ticks.push({ v: 0, lib: PI.libDate(pts[0].d) });
    pts.forEach(function (p, i) { if (p.d.slice(8) === "01" && i > 4 && i < pts.length - 5) ticks.push({ v: i, lib: PI.libDate(p.d) }); });
    ticks.push({ v: pts.length - 1, lib: PI.libDate(pts[pts.length - 1].d) });
    var marq = pv.paies.filter(function (d) { return d in iDe; }).map(function (d) { return { x: iDe[d], y: pts[iDe[d]].v, lib: "Salaire le " + PI.libDate(d), texte: "salaire", c: 3 }; });
    if (pv.decouvert) marq.push({ x: iDe[pv.decouvert.minLe], y: pv.decouvert.min, lib: "Découvert : " + dt(pv.decouvert.min) + " le " + PI.libDate(pv.decouvert.minLe), c: "danger" });
    var min = Math.min.apply(null, pts.map(function (p) { return p.v; }));
    OG.lignes(zone, {
      series: [{ nom: "Solde prévu", pts: pts.map(function (p, i) { return [i, p.v]; }), c: 1, aire: true }],
      marqueurs: marq, seuil: min < 0 ? { y: 0, lib: "0 DT" } : undefined,
      zonesY: min < 0 ? [{ de: min, a: 0, ton: "danger" }] : undefined,
      ticksX: ticks, fmtV: dt, fmtY: function (v) { return F.dt0(v); }, titreX: function (x) { var p = pts[Math.round(x)]; return p ? PI.libDate(p.d) : ""; },
      titre: "Solde prévu du compte courant sur 90 jours", hauteur: 230, legende: false,
      resume: "Aujourd'hui " + dt(pts[0].v) + ", le " + PI.libDate(pv.fin.d) + " " + dt(pv.fin.v) + ". Point le plus bas : " + pt(dt(pv.min.v) + " le " + PI.libDate(pv.min.d)),
      tableau: { pas: 7 }
    });
  }

  /* ===================================================================
     Mon mois › Factures
     =================================================================== */
  var INI_CAT = { mobile: "M", internet: "@", electricite: "É", eau: "E", gaz: "G", sport: "S", video: "▶", syndic: "Sy", ecole: "Éc", assurance: "A", autre: "•" };
  var trouvees = [], opsSession = [];
  function majTrouvees() {
    var d = donnees();
    trouvees = PI.detecterFactures(opsSession, d.factures, d.profil.credits || []);
  }
  function rendreFactures() {
    var z = $("mo-factures"); z.textContent = "";
    var d = donnees(), sy = O.synthese(), a = analyseFactures(d, sy);
    var lire = bouton("Lire un relevé", a.lignes.length ? "" : "bouton--plein", "fiche", { "data-pi": "lire-releve" });
    if (trouvees.length) z.appendChild(blocTrouvees());
    if (!a.lignes.length) {
      vide(z, "liste", "Ce qui revient chaque mois", "Forfait, internet, STEG, SONEDE, syndic, salle de sport… Orbite repère les prélèvements qui reviennent dans vos relevés (2 ou 3 mois d'un coup, c'est mieux), signale les hausses de prix et estime la prochaine facture. Le relevé est lu sur votre appareil : seule la liste est gardée.",
        [lire, bouton("Ajouter à la main", "", "plus", { "data-pi-ajouter": "facture" })]);
      etatReleve(z);
      return;
    }
    var c = panneau(null, "pa-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, "Ce qui revient chaque mois · " + a.lignes.length + (a.lignes.length > 1 ? " lignes" : " ligne")));
    if (a.lignes.some(function (x) { return x.source === "releve"; })) tete.appendChild(cree("span", "cpt-puce", "Repéré dans vos relevés"));
    c.appendChild(tete);
    c.appendChild(cree("p", "cpt-total__chiffre chiffre", F.dt3(a.totalMois) + " DT / mois"));
    c.appendChild(cree("p", "cpt-note", "soit " + dt(a.totalAn) + " par an" + (a.partNet != null ? " · " + Math.round(a.partNet * 100) + " % de votre salaire net" : "")));
    z.appendChild(c);
    var l = panneau("Vos factures et abonnements"), ul = liste();
    a.lignes.slice().sort(function (x, y) { return y.mensuel - x.mensuel; }).forEach(function (f) {
      var j = f.prochaineEstimee ? dateDe(f.prochaineEstimee).getDate() : null, sous;
      if (f.periode === 1) sous = (j ? "le " + (j === 1 ? "1er" : j) : "chaque mois") + (f.hausse ? " · +" + F.dt0(f.hausse.ecart) + " DT depuis " + PI.libDate(f.hausse.depuis).replace(/^\S+ /, "") : "");
      else sous = PI.NOMS_PERIODE[f.periode] + (f.prochaineEstimee ? " · prochaine ≈ " + PI.libDate(f.prochaineEstimee) : "");
      item(ul, { data: { "pi-facture": f.id }, c: f.cat, ini: INI_CAT[f.cat], nom: f.nom, sous: sous,
        badge: f.aRevoir ? ["À revoir", "revoir"] : f.hausse ? ["Hausse", "hausse"] : null,
        montant: F.dt3(f.mensuel) + (f.varie ? " moy." : ""), droite: "/ mois",
        aria: f.nom + " : " + F.dt3(f.mensuel) + " DT par mois" + (f.varie ? " en moyenne" : "") + (f.aRevoir ? ", à revoir" : "") });
    });
    l.appendChild(ul); z.appendChild(l);
    a.revoir.forEach(function (x) {
      var t = cree("p", "pi-astuce"); t.appendChild(icone("info"));
      t.appendChild(cree("span", null, "Si vous arrêtez « " + x.nom + " » : " + dt(x.gainAn) + " de plus par an" +
        (x.moisPlusTot ? ", votre réserve de sécurité complète " + x.moisPlusTot + " mois plus tôt." : ".")));
      z.appendChild(t);
    });
    z.appendChild(actions([bouton("Ajouter une facture", "bouton--plein", "plus", { "data-pi-ajouter": "facture" }), lire]));
    etatReleve(z);
    z.appendChild(cree("p", "cpt-note", "Le relevé est lu sur votre appareil ; seule la liste des factures est gardée dans votre compte, jamais le relevé. Cochez « À revoir » sur un abonnement pour voir ce que vous gagneriez à l'arrêter."));
  }
  function dateDe(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12); }
  var etatRel = { texte: "", type: "" };
  function etatReleve(z) { if (!etatRel.texte) return; var p = cree("p", "mo-rel__etat" + (etatRel.type ? " mo-rel__etat--" + etatRel.type : ""), etatRel.texte); p.setAttribute("role", "status"); p.id = "pi-rel-etat"; z.appendChild(p); }
  function blocTrouvees() {
    var s = panneau("Repérées dans votre relevé", "pi-trouvees");
    s.appendChild(cree("p", "cpt-note", "Cochez celles à garder. Les montants viennent du relevé ; vous pourrez les modifier."));
    var ul = cree("ul", "cpt-trouves"); ul.setAttribute("role", "list"); ul.id = "pi-trouvees";
    trouvees.forEach(function (t, i) {
      var li = cree("li"), lab = cree("label", "cpt-trouve"), cb = cree("input"); cb.type = "checkbox"; cb.checked = true; cb.setAttribute("data-i", i);
      lab.appendChild(cb);
      var tx = cree("span"); tx.appendChild(cree("b", null, t.nom + (t.existe ? " (mise à jour)" : ""))); tx.appendChild(doc.createTextNode(" · " + PI.NOMS_PERIODE[t.periode] + " · " + t.historique.length + " fois"));
      lab.appendChild(tx); lab.appendChild(cree("span", "chiffre", F.dt3(t.montant)));
      li.appendChild(lab); ul.appendChild(li);
    });
    s.appendChild(ul);
    s.appendChild(actions([bouton("Ajouter la sélection", "bouton--plein", "plus", { "data-pi": "garder-trouvees" }), bouton("Ignorer", "bouton--fantome", null, { "data-pi": "ignorer-trouvees" })]));
    return s;
  }
  var entree = cree("input"); entree.type = "file"; entree.hidden = true; entree.id = "pi-fichier";
  entree.accept = ".pdf,.csv,.txt,application/pdf,text/csv,text/plain,image/*"; entree.multiple = true;
  doc.body.appendChild(entree);
  entree.addEventListener("change", function () {
    var fs = Array.prototype.slice.call(entree.files || []); entree.value = "";
    if (!fs.length || !R) return;
    etatRel = { texte: "Lecture sur votre appareil…", type: "" }; rendre("factures");
    var m = new Date();
    Promise.all(fs.map(function (f) {
      if (/\.(csv|txt)$/i.test(f.name || "") || /^text\//i.test(f.type || "") || /csv/i.test(f.type || "")) return f.text().then(function (t) { return R.depuisCsv(t, m); });
      if (!window.FicheLecture) return Promise.reject(new Error("lecture"));
      return window.FicheLecture.lire(f, { pagesMax: 12 }).then(function (r) { return R.depuisLignes(r.lignes, m); });
    })).then(function (lots) {
      lots.forEach(function (ops) { ajouterOps(ops); });
      var n = lots.reduce(function (t, o) { return t + o.length; }, 0);
      etatRel = trouvees.length ? { texte: n + " opérations lues : " + trouvees.length + (trouvees.length > 1 ? " factures qui reviennent repérées." : " facture qui revient repérée."), type: "ok" }
        : { texte: n + " opérations lues, aucune facture qui revient encore. Ajoutez le relevé d'un autre mois : il faut au moins deux prélèvements pour en repérer une.", type: "" };
      rendre("factures");
    }, function () { etatRel = { texte: "Ce fichier n'a pas pu être lu. Essayez le relevé en PDF tel que votre banque le donne, ou un export CSV.", type: "erreur" }; rendre("factures"); });
  });
  function ajouterOps(ops) {
    var cles = {}; opsSession.forEach(function (o) { cles[o.date + "|" + o.montant + "|" + o.libelle] = true; });
    (ops || []).forEach(function (o) { var k = o.date + "|" + o.montant + "|" + o.libelle; if (!cles[k]) { cles[k] = true; opsSession.push({ date: o.date, libelle: o.libelle, montant: o.montant, sens: o.sens }); } });
    majTrouvees();
  }
  /* Relevé importé dans le budget (releve-import.js) : ses opérations servent aussi à repérer les factures (en mémoire seulement). */
  doc.addEventListener("orbite:releve-lu", function (e) { if (e.detail && e.detail.ops) { ajouterOps(e.detail.ops); if (trouvees.length) etatRel = { texte: "", type: "" }; } });

  /* ===================================================================
     Mon patrimoine › Assurances
     =================================================================== */
  var ICO_A = { auto: "voiture", habitation: "maison", sante: "bouclier", deces: "bouclier", prevoyance: "bouclier", vie: "epargne", autre: "fiche" };
  function rendreAssurances() {
    var z = $("pa-assurances"); z.textContent = "";
    var d = donnees(), sy = O.synthese(), a = analyseAssurances(d, sy);
    if (!a.lignes.length) {
      vide(z, "bouclier", "Toutes vos assurances au même endroit", "Auto, habitation, santé, décès-invalidité du crédit : la prime, l'échéance et ce que chacune couvre. Orbite vérifie les manques évidents et vous prévient avant chaque échéance. Il ne vend ni ne recommande aucun assureur.",
        [bouton("Ajouter un contrat", "bouton--plein", "plus", { "data-pi-ajouter": "assurance" })]);
      if (a.verifs.length) z.appendChild(points("À vérifier", a.verifs, [["faible", "À vérifier", "alerte"], ["fort", "En ordre", "valide"]]));
      return;
    }
    var c = panneau(null, "pa-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, a.lignes.length + (a.lignes.length > 1 ? " contrats" : " contrat") + " · ce que vous payez")); c.appendChild(tete);
    c.appendChild(cree("p", "cpt-total__chiffre chiffre", dt(a.total) + " / an"));
    var g = cree("dl", "cpt-delta pa-deux");
    [["Prochaine échéance", a.prochaine ? PI.libDate(a.prochaine.d) + " · " + a.prochaine.nom.toLowerCase() : "aucune notée", null],
     ["Vérifications", a.manques ? a.manques + (a.manques > 1 ? " manques" : " manque") : "tout est en ordre", a.manques ? "cpt-moins" : "cpt-plus"]].forEach(function (x) {
      var dv = cree("div"); dv.appendChild(cree("dt", null, x[0])); dv.appendChild(cree("dd", x[2], x[1])); g.appendChild(dv);
    });
    c.appendChild(g); z.appendChild(c);
    var l = panneau("Vos contrats"), ul = liste();
    a.lignes.forEach(function (x) {
      var sous;
      if (x.source === "epargne") sous = "Depuis le module Épargne";
      else if (x.paie) sous = (x.assureur ? x.assureur + " · " : "") + "retenue sur la paie";
      else if (x.type === "deces" && x.credit) sous = "Liée à « " + x.credit + " » · couvre " + x.couverture + " %";
      else sous = [x.assureur, x.prochaine ? "échéance " + PI.libDate(x.prochaine) : ""].filter(Boolean).join(" · ") || "échéance à préciser";
      item(ul, { data: x.source === "epargne" ? {} : { "pi-assurance": x.id }, lien: x.source === "epargne" ? "#epargne" : null, c: "a-" + x.type, ico: ICO_A[x.type],
        nom: x.libType + (x.nom && x.nom !== x.libType ? " · " + x.nom : ""), sous: sous,
        badge: x.jours != null && x.jours <= 30 ? ["Échéance proche", "revoir"] : null,
        montant: F.dt0(x.prime), droite: "/ an", aria: x.libType + " " + (x.nom || "") + " : " + dt(x.prime) + " par an" });
    });
    l.appendChild(ul); z.appendChild(l);
    if (a.verifs.length) z.appendChild(points("Vérifications", a.verifs, [["faible", "À vérifier", "alerte"], ["fort", "En ordre", "valide"]]));
    z.appendChild(actions([bouton("Ajouter un contrat", "bouton--plein", "plus", { "data-pi-ajouter": "assurance" })]));
    z.appendChild(cree("p", "cpt-note", "Orbite ne vend ni ne recommande aucun assureur : il dit seulement quoi vérifier. L'assurance vie vient du module Épargne, rien à ressaisir. Une échéance proche apparaît aussi dans la Prévision de Mon mois."));
  }

  /* ===================================================================
     Mon patrimoine › Proches
     =================================================================== */
  function initiale(nom) { var m = String(nom || "?").trim(); return m.charAt(0).toUpperCase(); }
  function rendreProches() {
    var z = $("pa-proches"); z.textContent = "";
    var d = donnees(), a = analyseProches(d);
    if (!a.lignes.length) {
      vide(z, "profil", "Argent prêté et emprunté entre proches", "Ce que vous avez prêté à la famille ou aux amis, ou emprunté : montant, échéancier, remboursements reçus, et un rappel discret le jour prévu, pour vous seulement. Un prénom ou des initiales suffisent : rien n'est envoyé à personne.",
        [bouton("Prêt ou emprunt", "bouton--plein", "plus", { "data-pi-ajouter": "proche" })]);
      return;
    }
    var c = panneau(null, "pa-total");
    var g = cree("dl", "cpt-delta pa-deux pi-soldes");
    [["On vous doit", a.onVousDoit, "cpt-plus"], ["Vous devez", a.vousDevez, a.vousDevez > 0 ? "cpt-moins" : null]].forEach(function (x) {
      var dv = cree("div"); dv.appendChild(cree("dt", null, x[0])); dv.appendChild(cree("dd", "chiffre pi-gros " + (x[2] || ""), dt(x[1]))); g.appendChild(dv);
    });
    c.appendChild(g);
    c.appendChild(cree("p", "cpt-note", "Solde : " + (a.solde >= 0 ? "+" : "−") + dt(Math.abs(a.solde)) + ", compté dans votre patrimoine net."));
    z.appendChild(c);
    var l = panneau("Qui vous doit, à qui vous devez"), ul = liste();
    a.lignes.forEach(function (x) {
      var sous = dt(x.montant), droite, cls = null;
      if (x.mensualite > 0) sous += " · " + dt(x.mensualite) + " par mois · " + x.payees + " sur " + x.nbEcheances + (x.sens === "prete" ? " reçus" : " rendus");
      else if (x.echeance) sous += " · " + (x.sens === "prete" ? "à rendre" : "à rendre") + " le " + PI.libDate(x.echeance);
      else sous += (x.note ? " · " + x.note : "") + " · sans date";
      if (x.solde) { droite = "remboursé"; cls = "cpt-plus"; }
      else if (x.retard > 0) { droite = "en retard"; cls = "cpt-moins"; }
      else if (x.jours != null && x.mensualite <= 0) droite = dans(x.jours);
      else droite = x.sens === "prete" ? "reste dû" : "à rendre";
      item(ul, { data: { "pi-proche": x.id }, c: x.sens, ini: initiale(x.nom), nom: (x.sens === "prete" ? "Prêté à " : "Emprunté à ") + x.nom, sous: sous,
        montant: F.dt0(x.reste), droite: droite, clsDroite: cls, aria: (x.sens === "prete" ? "Prêté à " : "Emprunté à ") + x.nom + " : reste " + dt(x.reste) });
    });
    l.appendChild(ul); z.appendChild(l);
    if (a.prochains.length) {
      var p = panneau("Prochains remboursements");
      a.prochains.forEach(function (x) { p.appendChild(ligneLR((x.sens === "prete" ? x.nom + " vous rend" : "Vous rendez à " + x.nom) + " · " + PI.libDate(x.d) + (x.jours < 0 ? " (en retard)" : ""), dt(x.v), x.jours < 0 ? "cpt-moins" : null)); });
      z.appendChild(p);
    }
    var btns = [bouton("Prêt ou emprunt", "bouton--plein", "plus", { "data-pi-ajouter": "proche" })];
    if (a.lignes.some(function (x) { return !x.solde; })) btns.push(bouton("Marquer un remboursement", "", "valide", { "data-pi-ajouter": "recu" }));
    z.appendChild(actions(btns));
    z.appendChild(cree("p", "cpt-note", "Les remboursements attendus apparaissent dans la Prévision de Mon mois. Rien n'est jamais envoyé à la personne : le rappel, s'il est activé, est pour vous seul."));
  }

  /* ===================================================================
     Fenêtre de saisie (une seule, champs selon l'objet)
     =================================================================== */
  var dlg = $("dlg-pilotage"), edition = null;
  function opts(l, noms) { return l.map(function (k) { return [String(k), noms[k]]; }); }
  /* Champ : [clé, libellé, type (texte|montant|nombre|pct|date|choix|case), options, aide, facultatif, visible si (fn valeurs)] */
  var FORMES = {
    facture: { titre: "une facture ou un abonnement", cle: "factures", prefixe: "f", champs: [
      ["nom", "Nom", "texte", null, "Ex. Forfait mobile, STEG, salle de sport"],
      ["cat", "Catégorie", "choix", opts(PI.CATS, PI.NOMS_CAT)],
      ["montant", "Montant de chaque facture", "montant", null, "Pour une facture qui varie : un montant habituel"],
      ["periode", "Revient", "choix", opts(PI.PERIODES, PI.NOMS_PERIODE)],
      ["prochaine", "Prochaine date", "date", null, "Facultatif : pour la Prévision", true],
      ["aRevoir", "À revoir (je pourrais l'arrêter)", "case"]
    ] },
    assurance: { titre: "un contrat d'assurance", cle: "assurances", prefixe: "a", champs: [
      ["type", "Type", "choix", opts(PI.TYPES_A, PI.NOMS_A)],
      ["nom", "Nom du contrat", "texte", null, "Facultatif : ex. tous risques", true],
      ["assureur", "Assureur", "texte", null, "Facultatif", true],
      ["prime", "Prime par an", "montant"],
      ["echeance", "Échéance (date de renouvellement)", "date", null, "Facultatif : Orbite vous prévient avant", true],
      ["paie", "Retenue sur ma paie (par l'employeur)", "case"],
      ["bien", "Bien assuré", "choix", null, null, true, function (v) { return v.type === "habitation"; }],
      ["credit", "Crédit couvert", "choix", null, null, true, function (v) { return v.type === "deces"; }],
      ["couverture", "Part du reste dû couverte", "pct", null, "100 % : tout le reste dû est remboursé", true, function (v) { return v.type === "deces"; }]
    ] },
    proche: { titre: "un prêt ou un emprunt", cle: "proches", prefixe: "x", champs: [
      ["sens", "C'est…", "choix", [["prete", "de l'argent que j'ai prêté"], ["emprunte", "de l'argent que j'ai emprunté"]]],
      ["nom", "Prénom ou initiales", "texte", null, "Pas de nom complet ni de numéro : rien n'est envoyé"],
      ["montant", "Montant", "montant"],
      ["mensualite", "Remboursé chaque mois", "montant", null, "Vide : en une fois", true],
      ["debut", "Premier remboursement", "date", null, null, true, function (v) { return v.mensualite > 0; }],
      ["echeance", "À rendre le", "date", null, "Vide : sans date", true, function (v) { return !(v.mensualite > 0); }],
      ["note", "Note", "texte", null, "Facultatif : ex. pour la voiture", true]
    ] },
    recu: { titre: "un remboursement", champs: [
      ["proche", "Qui", "choix"], ["v", "Montant", "montant"], ["d", "Date", "date"]
    ] }
  };
  function champ(f, valeur) {
    var cle = f[0], id = "pi-f-" + cle, ch = cree("div", "champ" + (f[2] === "case" ? " champ--large" : ""));
    ch.setAttribute("data-champ-de", cle);
    var inp;
    if (f[2] === "case") {
      var lab = cree("label", "interrupteur"); lab.appendChild(cree("span", null, f[1]));
      inp = cree("input"); inp.type = "checkbox"; inp.setAttribute("role", "switch"); inp.checked = !!valeur; lab.appendChild(inp);
      var piste = cree("span", "interrupteur__piste"); piste.setAttribute("aria-hidden", "true"); lab.appendChild(piste);
      ch.appendChild(lab);
    } else {
      var l = cree("label", null, f[1]); l.setAttribute("for", id); ch.appendChild(l);
      var sa = cree("div", "saisie");
      if (f[2] === "choix") {
        inp = cree("select"); (f[3] || []).forEach(function (o) { var op = cree("option", null, o[1]); op.value = o[0]; inp.appendChild(op); });
        sa.appendChild(inp); var chev = icone("chevron"); chev.setAttribute("class", "saisie__chevron"); sa.appendChild(chev);
        if (valeur != null) inp.value = String(valeur);
      } else {
        inp = cree("input"); inp.autocomplete = "off";
        if (f[2] === "date") { inp.type = "date"; inp.value = valeur || ""; }
        else if (f[2] === "texte") { inp.type = "text"; inp.maxLength = cle === "nom" && edition && edition.type === "proche" ? 20 : 40; inp.value = valeur || ""; }
        else { inp.type = "text"; inp.inputMode = "decimal"; inp.value = valeur ? String(valeur).replace(".", ",") : ""; }
        sa.appendChild(inp);
        if (f[2] === "montant") sa.appendChild(cree("span", "saisie__unite", "DT"));
        if (f[2] === "pct") sa.appendChild(cree("span", "saisie__unite", "%"));
      }
      ch.appendChild(sa);
    }
    inp.id = id; inp.setAttribute("data-champ", cle);
    if (f[4]) { var aide = cree("span", "champ__aide", f[4]); aide.id = id + "-aide"; inp.setAttribute("aria-describedby", aide.id); ch.appendChild(aide); }
    return ch;
  }
  function erreur(t) { var e = $("pi-dlg-err"); e.textContent = t || ""; e.hidden = !t; }
  function valeursBrutes(forme) {
    var v = {};
    forme.champs.forEach(function (f) {
      var el = $("pi-f-" + f[0]); if (!el) return;
      if (f[2] === "case") v[f[0]] = el.checked;
      else if (f[2] === "montant" || f[2] === "nombre" || f[2] === "pct") { var l = F.lire(el.value); v[f[0]] = l.valide && !l.vide ? l.valeur : 0; }
      else v[f[0]] = el.value;
    });
    return v;
  }
  function visibilite(forme) {
    var v = valeursBrutes(forme);
    forme.champs.forEach(function (f) { if (f[6]) { var c = $("pi-dlg-champs").querySelector('[data-champ-de="' + f[0] + '"]'); if (c) c.hidden = !f[6](v); } });
  }
  function lireForm(forme) {
    var r = {}, err = null, v = valeursBrutes(forme);
    forme.champs.forEach(function (f) {
      if (err) return;
      if (f[6] && !f[6](v)) { r[f[0]] = f[2] === "date" || f[2] === "texte" || f[2] === "choix" ? "" : f[2] === "pct" ? 100 : 0; return; }
      var el = $("pi-f-" + f[0]), val = el.value;
      if (f[2] === "case") { r[f[0]] = el.checked; return; }
      if (f[2] === "texte" || f[2] === "choix") { r[f[0]] = val.trim(); if (!r[f[0]] && !f[5] && f[2] === "texte") err = "Indiquez : " + f[1].toLowerCase() + "."; return; }
      if (f[2] === "date") { if (!val && !f[5]) err = "Choisissez : " + f[1].toLowerCase() + "."; r[f[0]] = val || ""; return; }
      var l = F.lire(val);
      if (!l.valide) { err = "« " + f[1] + " » n'est pas un nombre valide."; return; }
      if (l.vide && !f[5]) { err = "Indiquez : " + f[1].toLowerCase() + "."; return; }
      r[f[0]] = l.vide ? (f[2] === "pct" ? 100 : 0) : l.valeur;
    });
    return err ? { erreur: err } : r;
  }
  function apercu() {
    var el = $("pi-dlg-apercu"); el.hidden = true;
    if (!edition) return;
    var v = valeursBrutes(FORMES[edition.type]);
    if (edition.type === "facture" && v.montant > 0) {
      var p = +v.periode || 1;
      el.textContent = p === 1 ? dt(v.montant * 12) + " par an." : "Soit " + F.dt3(v.montant / p) + " DT par mois, " + dt(v.montant * 12 / p) + " par an.";
      el.hidden = false;
    } else if (edition.type === "proche" && v.montant > 0 && v.mensualite > 0) {
      var n = Math.ceil(v.montant / v.mensualite - 1e-9);
      el.textContent = n + " remboursement" + (n > 1 ? "s" : "") + (v.debut ? ", le dernier en " + PI.libDate(PI.plusMois(v.debut, n - 1), true).replace(/^\S+ /, "") : "") + ".";
      el.hidden = false;
    }
  }
  function ouvrir(type, id) {
    var forme = FORMES[type], d = donnees(), obj = null, valeurs = {};
    if (forme.cle && id) obj = d[forme.cle].filter(function (x) { return x.id === id; })[0] || null;
    edition = { type: type, id: obj ? obj.id : null };
    $("pi-dlg-titre").textContent = (obj ? "Modifier " : type === "recu" ? "Noter " : "Ajouter ") + forme.titre;
    if (obj) valeurs = cloner(obj);
    else if (type === "facture") valeurs = { cat: "mobile", periode: 1 };
    else if (type === "assurance") valeurs = { type: "auto", couverture: 100 };
    else if (type === "proche") valeurs = { sens: "prete" };
    if (type === "assurance") {
      var biens = [["", "Votre logement"]].concat(biensPatrimoine(d.profil).map(function (b) { return [b.id, b.nom]; }));
      forme.champs[6][3] = biens;
      forme.champs[7][3] = [["", "Aucun"]].concat((d.profil.credits || []).map(function (c) { return [c.libelle, c.libelle]; }));
      if (valeurs.bien === "logement") valeurs.bien = "";
    }
    var aide = $("pi-dlg-aide"); aide.hidden = true;
    if (type === "recu") {
      var a = analyseProches(d), ouverts = a.lignes.filter(function (x) { return !x.solde; });
      forme.champs[0][3] = ouverts.map(function (x) { return [x.id, (x.sens === "prete" ? "Rendu par " : "Rendu à ") + x.nom + " (reste " + dt(x.reste) + ")"]; });
      var choisi = id ? ouverts.filter(function (x) { return x.id === id; })[0] : ouverts[0];
      valeurs = { proche: choisi ? choisi.id : "", v: choisi && choisi.prochaine ? choisi.prochaine.v : "", d: aujourdhui() };
    }
    if (type === "proche" && obj && obj.recus.length) {
      var der = obj.recus[obj.recus.length - 1];
      aide.textContent = obj.recus.length + (obj.recus.length > 1 ? " remboursements notés" : " remboursement noté") + ", le dernier le " + PI.libDate(der.d) + " (" + dt(der.v) + ").";
      aide.hidden = false;
    }
    var zone = $("pi-dlg-champs"); zone.textContent = "";
    forme.champs.forEach(function (f) { zone.appendChild(champ(f, valeurs[f[0]])); });
    if (type === "proche" && obj && obj.recus.length) {
      var b = bouton("Retirer le dernier remboursement noté", "bouton--petit bouton--fantome", "annuler", { id: "pi-retirer-recu" });
      var wrap = cree("div", "champ champ--large"); wrap.appendChild(b); zone.appendChild(wrap);
    }
    $("pi-dlg-supprimer").hidden = !obj; $("pi-dlg-confirmer").hidden = true;
    visibilite(forme); erreur(""); apercu();
    dlg.showModal();
    var premier = zone.querySelector("input:not([type=checkbox]), select"); if (premier) premier.focus();
  }
  $("pi-dlg-champs").addEventListener("input", function () { if (!edition) return; erreur(""); visibilite(FORMES[edition.type]); apercu(); });
  $("pi-dlg-champs").addEventListener("change", function () { if (!edition) return; visibilite(FORMES[edition.type]); apercu(); });
  $("pi-dlg-champs").addEventListener("click", function (e) {
    if (!e.target.closest("#pi-retirer-recu") || !edition) return;
    var d = donnees(), l = d.proches.map(function (x) { if (x.id === edition.id) x.recus = x.recus.slice(0, -1); return x; });
    dlg.close(); edition = null;
    enregistrer("proches", l, "Dernier remboursement retiré");
  });

  $("form-pilotage").addEventListener("submit", function (e) {
    var v = e.submitter && e.submitter.value;
    if (v !== "ok" || !edition) return;
    var type = edition.type, forme = FORMES[type], d = donnees(), msg;
    var r = lireForm(forme);
    function refus(t) { e.preventDefault(); erreur(t); }
    if (r.erreur) return refus(r.erreur);
    if (type === "recu") {
      if (!r.proche) return refus("Choisissez la personne.");
      if (!(r.v > 0)) return refus("Indiquez le montant.");
      if (r.d > aujourdhui()) return refus("La date ne peut pas être dans le futur.");
      var x = d.proches.filter(function (y) { return y.id === r.proche; })[0];
      var reste = x.montant - x.recus.reduce(function (t, y) { return t + y.v; }, 0);
      if (r.v > reste + 0.0005) return refus("C'est plus que le reste dû (" + dt(reste) + ").");
      x.recus.push({ d: r.d, v: r.v });
      edition = null;
      return enregistrer("proches", d.proches, r.v >= reste - 0.0005 ? "Remboursé en entier" : "Remboursement noté");
    }
    if (type === "facture" && !(r.montant > 0)) return refus("Indiquez le montant.");
    if (type === "assurance" && !(r.prime > 0)) return refus("Indiquez la prime par an.");
    if (type === "proche") {
      if (!(r.montant > 0)) return refus("Indiquez le montant.");
      if (r.mensualite > r.montant) return refus("Le remboursement mensuel dépasse le montant.");
      if (r.mensualite > 0 && !r.debut) return refus("Choisissez la date du premier remboursement.");
      r.nom = r.nom.replace(/\d/g, "").trim();
      if (!r.nom) return refus("Indiquez un prénom ou des initiales (sans chiffres).");
    }
    if (type === "assurance") { r.couverture = Math.round(r.couverture); if (r.couverture > 100) return refus("La couverture ne peut pas dépasser 100 %."); if (r.type === "habitation" && !r.bien) r.bien = "logement"; }
    if (type === "facture") r.periode = +r.periode;
    var l = d[forme.cle];
    if (edition.id) {
      var i = l.findIndex(function (y) { return y.id === edition.id; });
      if (i >= 0) {
        var ancien = l[i];
        /* Facture : le nouveau montant entre dans l'historique s'il change (pour repérer une hausse). */
        if (type === "facture" && ancien.montant !== r.montant && ancien.historique.length) r.historique = ancien.historique.concat([{ d: aujourdhui(), v: r.montant }]);
        l[i] = Object.assign({}, ancien, r, { id: edition.id });
      }
      msg = "Modifié";
    } else {
      if (l.length >= PI.MAX[forme.cle]) return refus("Limite atteinte : " + PI.MAX[forme.cle] + " au plus.");
      r.id = PI.nouvelId(l, forme.prefixe);
      if (type === "proche") r.recus = [];
      if (type === "facture") { r.source = "saisie"; r.historique = []; }
      l.push(r); msg = type === "facture" ? "Facture ajoutée" : type === "assurance" ? "Contrat ajouté" : "Ajouté";
    }
    edition = null;
    enregistrer(forme.cle, l, msg);
  });
  $("pi-dlg-supprimer").addEventListener("click", function () {
    if (!edition || !edition.id) return;
    $("pi-dlg-confirmer-txt").textContent = "Supprimer cette ligne ?";
    $("pi-dlg-confirmer").hidden = false; $("pi-dlg-supprimer-oui").focus();
  });
  $("pi-dlg-supprimer-oui").addEventListener("click", function () {
    var forme = FORMES[edition.type], d = donnees(), id = edition.id;
    var l = d[forme.cle].filter(function (x) { return x.id !== id; });
    dlg.close(); edition = null;
    enregistrer(forme.cle, l, "Supprimé");
  });

  /* ---------- Points d'entrée ---------- */
  function clic(e) {
    var b = e.target.closest("[data-pi], [data-pi-ajouter], [data-pi-facture], [data-pi-assurance], [data-pi-proche]");
    if (!b) return;
    if (b.hasAttribute("data-pi-ajouter")) return ouvrir(b.getAttribute("data-pi-ajouter"));
    if (b.hasAttribute("data-pi-facture")) return ouvrir("facture", b.getAttribute("data-pi-facture"));
    if (b.hasAttribute("data-pi-assurance")) return ouvrir("assurance", b.getAttribute("data-pi-assurance"));
    if (b.hasAttribute("data-pi-proche")) return ouvrir("proche", b.getAttribute("data-pi-proche"));
    var a = b.getAttribute("data-pi");
    if (a === "lire-releve") return entree.click();
    if (a === "ignorer-trouvees") { trouvees = []; opsSession = []; etatRel = { texte: "", type: "" }; return rendre("factures"); }
    if (a === "garder-trouvees") {
      var choisies = trouvees.filter(function (t, i) { var cb = doc.querySelector('#pi-trouvees input[data-i="' + i + '"]'); return cb && cb.checked; });
      if (!choisies.length) { O.toast("Cochez au moins une facture", { type: "info" }); return; }
      var d = donnees(), l = PI.fusionner(d.factures, choisies);
      trouvees = []; etatRel = { texte: "", type: "" };
      enregistrer("factures", l, choisies.length + (choisies.length > 1 ? " factures ajoutées" : " facture ajoutée"));
    }
  }
  ["mo-prevision", "mo-factures", "pa-assurances", "pa-proches"].forEach(function (id) { $(id).addEventListener("click", clic); });

  function rendre(o) {
    if (o === "prevision" && !$("mo-prevision").hidden) rendrePrevision();
    else if (o === "factures" && !$("mo-factures").hidden) rendreFactures();
    else if (o === "assurances" && !$("pa-assurances").hidden) rendreAssurances();
    else if (o === "proches" && !$("pa-proches").hidden) rendreProches();
  }
  /* Alertes du moment pour un profil (Mes clients) : échéances d'assurance, retards entre proches. */
  function alertes(p0, sy0) {
    var d = donnees(p0), sy = sy0 || O.synthese(), a = analyseAssurances(d, sy), x = analyseProches(d), l = [];
    if (a.prochaine && a.prochaine.jours <= 30) l.push({ cle: "assurance", texte: "Assurance " + a.prochaine.nom.toLowerCase() + " à renouveler", d: a.prochaine.d });
    x.lignes.filter(function (y) { return y.retard > 0; }).forEach(function (y) { l.push({ cle: "proche", texte: (y.sens === "prete" ? "Remboursement en retard (prêt à " : "Remboursement en retard (dû à ") + y.nom + ")", d: y.prochaine ? y.prochaine.d : "" }); });
    return l;
  }
  window.OrbitePilotage = { rendre: rendre, ouvrir: ouvrir, prevision: calculPrevision, alertes: alertes, ajouterOps: ajouterOps };
})();
