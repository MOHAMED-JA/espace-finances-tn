/*
 * Orbite — mode conseiller (lot C, maquette C4 validée le 16 oct. 2026 ; migration 0018).
 *   Mes clients (#clients) : réservé aux comptes à qui l'administrateur a donné le rôle, avec la double authentification.
 *     Clients qui ont accepté (lecture seule), alertes du moment, bilan PDF pour le rendez-vous, invitation par code.
 *   Paramètres › Vos données : le client accepte un conseiller avec son code, voit chaque consultation, retire l'accord.
 *   Administration : donner ou retirer le rôle de conseiller.
 * Le serveur vérifie tout (SECURITY DEFINER, aal2) ; ici, seulement l'affichage. Les calculs réutilisent les moteurs d'Orbite
 * sur le profil du client, sans jamais l'enregistrer.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document;
  if (!O || !E || !E.conseiller || !doc.getElementById("vue-clients")) return;
  var F = O.F, $ = O.$, SVG = "http://www.w3.org/2000/svg", OC = window.OrbiteCalcul, OI = window.OrbiteIntelligence, D = window.DeciderCalcul,
    PL = window.PlacementsCalcul, BC = window.BilanCalcul;
  var DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  var DATEH = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  var moi = null, clients = [], invitations = [], ouvert = null;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function bouton(lib, cls, ico, attrs) {
    var b = cree("button", "bouton " + (cls || "")); b.type = "button";
    if (ico) b.appendChild(icone(ico)); if (lib) b.appendChild(doc.createTextNode(lib));
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }
  function dt(v) { return F.dt0(v) + " DT"; }
  function initiales(nom) { return String(nom || "?").split(/\s+/).map(function (m) { return m.charAt(0); }).join("").slice(0, 2).toUpperCase(); }
  function erreur(x) { return E.modele && E.modele.messageErreur ? E.modele.messageErreur(x) : "Une erreur est survenue."; }

  /* ===================================================================
     Analyse d'un client (lecture seule)
     =================================================================== */
  function analyser(c) {
    var p = OC.normaliser(c.profil || {}), r = { patrimoine: null, score: null, alertes: [] };
    try {
      var sy = OC.synthese(p);
      r.patrimoine = D ? D.patrimoine(sy).net : null;
      r.score = OI ? OI.scoreSante(sy).score : null;
      r.net = sy.salaire.netMensuel;
      var pv = window.OrbitePilotage ? window.OrbitePilotage.prevision(p, sy) : null;
      if (pv && !pv.aucun && pv.decouvert) r.alertes.push({ cle: "decouvert", texte: "Découvert prévu", d: pv.decouvert.debut });
      if (PL && p.placements) {
        var t = PL.analyser(p.placements, { aujourdhui: PL.iso(new Date()) }).taux;
        if (t.prochaine && t.prochaine.jours <= 30) r.alertes.push({ cle: "echeance", texte: t.prochaine.nom + " à échéance", d: t.prochaine.d });
      }
      if (window.OrbitePilotage && window.OrbitePilotage.alertes) r.alertes = r.alertes.concat(window.OrbitePilotage.alertes(p, sy));
      r.sy = sy; r.p = p;
    } catch (e) { r.erreur = true; }
    return r;
  }
  function libJour(d) { return d ? DATE.format(new Date(d + "T12:00:00")).replace(/ \d{4}$/, "") : ""; }

  /* ===================================================================
     Mes clients
     =================================================================== */
  function rendreClients() {
    var z = $("cl-zone"); if (!z || $("vue-clients").hidden) return;
    z.textContent = "";
    var bandeau = cree("div", "cf-bandeau cl-bandeau"); bandeau.appendChild(icone("bouclier"));
    var bt = cree("div"); bt.appendChild(cree("b", null, "Lecture seule. Chaque client a donné son accord et peut le retirer à tout moment."));
    bt.appendChild(cree("span", null, "Il voit chaque consultation. Double authentification obligatoire pour vous.")); bandeau.appendChild(bt); z.appendChild(bandeau);
    if (!moi || !moi.conseiller) { z.appendChild(cree("p", "cpt-note", "Cet espace est réservé aux conseillers désignés par l'administrateur d'Orbite.")); return; }
    if (!moi.aal2) {
      var p = cree("section", "panneau cf-ferme"); p.appendChild(cree("h2", null, "Double authentification requise"));
      p.appendChild(cree("p", null, "Pour voir les comptes de vos clients, activez la double authentification puis reconnectez-vous avec votre code à 6 chiffres."));
      var a = cree("a", "bouton bouton--plein", "Activer la double authentification"); a.href = "#compte?onglet=securite"; p.appendChild(a);
      z.appendChild(p); return;
    }
    if (!clients.length) {
      var v = cree("section", "panneau cf-ferme"), ic = cree("span", "pa-vide__ico"); ic.appendChild(icone("profil")); v.appendChild(ic);
      v.appendChild(cree("h2", null, "Aucun client pour l'instant"));
      v.appendChild(cree("p", null, "Créez un code d'invitation et donnez-le à votre client : il l'entre dans Paramètres › Vos données et accepte. Vous voyez alors son Orbite en lecture seule."));
      z.appendChild(v);
    }
    clients.forEach(function (c) {
      var a = c.analyse || (c.analyse = analyser(c));
      var s = cree("section", "panneau cl-client"), tete = cree("div", "cl-client__tete");
      var av = cree("span", "cl-avatar", initiales(c.nom)); av.setAttribute("aria-hidden", "true"); tete.appendChild(av);
      var nm = cree("div"); nm.appendChild(cree("h2", null, c.nom)); nm.appendChild(cree("small", null, "Accord depuis le " + DATE.format(new Date(c.accorde_le)))); tete.appendChild(nm);
      tete.appendChild(cree("span", "cl-puce " + (a.alertes.length ? "cl-puce--alerte" : "cl-puce--ok"), a.alertes.length ? a.alertes.length + (a.alertes.length > 1 ? " alertes" : " alerte") : "Tout va bien"));
      s.appendChild(tete);
      var g = cree("dl", "cpt-delta pa-deux");
      [["Patrimoine net", a.patrimoine != null ? dt(a.patrimoine) : "—"], ["Score de santé", a.score != null ? a.score + " / 100" : "—"]].forEach(function (x) {
        var d = cree("div"); d.appendChild(cree("dt", null, x[0])); d.appendChild(cree("dd", "chiffre", x[1])); g.appendChild(d);
      });
      s.appendChild(g);
      if (a.alertes.length) {
        var ul = cree("ul", "cl-alertes"); ul.setAttribute("role", "list");
        a.alertes.forEach(function (x) { var li = cree("li"); li.appendChild(icone("alerte")); li.appendChild(cree("span", null, x.texte)); li.appendChild(cree("b", null, libJour(x.d))); ul.appendChild(li); });
        s.appendChild(ul);
      }
      if (ouvert === c.id && a.sy) s.appendChild(details(a));
      var act = cree("div", "pa-actions");
      act.appendChild(bouton("Bilan PDF", "bouton--petit", "telecharger", { "data-cl-bilan": c.id }));
      act.appendChild(bouton(ouvert === c.id ? "Refermer" : "Ouvrir", "bouton--petit bouton--plein", ouvert === c.id ? "chevron" : "fleche", { "data-cl-ouvrir": c.id, "aria-expanded": ouvert === c.id ? "true" : "false" }));
      s.appendChild(act);
      z.appendChild(s);
    });
    var inv = cree("section", "panneau pa-carte");
    inv.appendChild(cree("h2", "pa-carte__titre", "Inviter un client"));
    inv.appendChild(cree("p", "cpt-note", "Un code à usage unique, valable 7 jours. Donnez-le de vive voix ou par message : votre client l'entre dans Orbite et accepte. Sans code, personne ne peut partager son compte avec vous."));
    if (invitations.length) {
      var li2 = cree("ul", "cl-codes"); li2.setAttribute("role", "list");
      invitations.forEach(function (i) { var l = cree("li"); l.appendChild(cree("b", "cl-code", i.code.replace(/(.{5})/, "$1 "))); l.appendChild(cree("small", null, "valable jusqu'au " + DATE.format(new Date(i.expire_le)))); li2.appendChild(l); });
      inv.appendChild(li2);
    }
    inv.appendChild(bouton("Créer un code d'invitation", "bouton--plein", "plus", { "data-cl": "inviter" }));
    z.appendChild(inv);
  }
  function details(a) {
    var p = a.p, sy = a.sy, d = cree("dl", "admin__fiche-grille cl-details");
    function ligne(t, v) { d.appendChild(cree("dt", null, t)); d.appendChild(cree("dd", null, v)); }
    ligne("Salaire net", dt(sy.salaire.netMensuel) + " par mois");
    ligne("Crédits en cours", (p.credits || []).length ? p.credits.map(function (c) { return (c.libelle || "Crédit") + " : " + dt(c.mensualite) + " par mois"; }).join(" · ") : "Aucun");
    ligne("Assurance vie et CEA", (p.contrats || []).length ? p.contrats.map(function (c) { return (c.type === "cea" ? "CEA" : "Assurance vie") + " : " + dt(c.versementMensuel) + " par mois"; }).join(" · ") : "Aucun contrat");
    ligne("Épargne disponible", dt(p.epargneDisponible || 0));
    var cap = sy.capacite && (sy.capacite[p.baseBanque] || sy.capacite.net);
    if (cap) ligne("Capacité d'emprunt", dt(cap.mensualiteMax) + " de mensualité possible");
    return d;
  }

  function charger() {
    return E.conseiller.moi().then(function (m) {
      moi = m || null;
      $("rail-clients").hidden = !(moi && moi.conseiller);
      if (!moi || !moi.conseiller || !moi.aal2 || $("vue-clients").hidden) return rendreClients();
      return Promise.all([E.conseiller.clients(), E.conseiller.invitations()]).then(function (r) {
        clients = r[0] || []; invitations = r[1] || []; rendreClients();
      });
    }).catch(function (x) { if ($("vue-clients").hidden) return; O.toast(erreur(x), { erreur: true }); rendreClients(); });
  }

  /* Bilan PDF du client (mêmes outils que Ma progression, chargés à la demande ; rien n'est envoyé). */
  var outils = null;
  function chargerScript(src) { return new Promise(function (ok, ko) { var s = doc.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; doc.head.appendChild(s); }); }
  function bilan(c) {
    if (!BC) return;
    if (!outils) outils = (window.jspdf ? Promise.resolve() : chargerScript("/espace/vendor/jspdf.umd.min.js")).then(function () { return window.BilanPDF ? null : chargerScript("/espace/js/bilan-pdf.js"); });
    outils.then(function () {
      var b = BC.construire(c.profil || {}, {}, new Date(), BC.PAR_DEFAUT, null);
      O.telecharger("bilan-" + String(c.nom).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + new Date().getFullYear() + ".pdf", window.BilanPDF.generer(b));
      O.toast("Bilan de " + c.nom + " téléchargé", { detail: "Créé sur votre appareil, sans les coordonnées du client." });
    }).catch(function () { outils = null; O.toast("Le PDF n'a pas pu être créé", { erreur: true }); });
  }

  $("vue-clients").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cl], [data-cl-ouvrir], [data-cl-bilan]");
    if (!b) return;
    if (b.getAttribute("data-cl") === "inviter") {
      b.disabled = true;
      E.conseiller.inviter().then(function (i) {
        invitations.unshift(i); rendreClients();
        O.toast("Code créé : " + i.code, { detail: "Valable 7 jours, pour un seul client." });
      }).catch(function (x) { O.toast(erreur(x), { erreur: true }); }).then(function () { b.disabled = false; });
      return;
    }
    var id = b.getAttribute("data-cl-ouvrir") || b.getAttribute("data-cl-bilan"), c = clients.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (b.hasAttribute("data-cl-bilan")) return bilan(c);
    ouvert = ouvert === id ? null : id; rendreClients();
  });

  /* ===================================================================
     Côté client : Paramètres › Vos données
     =================================================================== */
  var codeVu = null;
  function rendrePartage(l) {
    var z = $("pc-liste"); if (!z) return;
    z.textContent = "";
    if (!l || !l.length) { z.appendChild(cree("p", "reglage__desc", "Aucun conseiller n'a accès à votre Orbite.")); return; }
    l.forEach(function (c) {
      var d = cree("div", "pc-conseiller"), t = cree("div");
      t.appendChild(cree("strong", null, c.nom));
      t.appendChild(cree("small", null, "Accès depuis le " + DATE.format(new Date(c.accorde_le)) + " · " + (c.consultations ? "consulté " + c.consultations + " fois, dernière fois le " + DATEH.format(new Date(c.dernieres[0])) : "pas encore consulté")));
      if (c.dernieres && c.dernieres.length > 1) {
        var det = cree("details"), su = cree("summary", null, "Voir l'historique des consultations"); det.appendChild(su);
        var ul = cree("ul"); c.dernieres.forEach(function (x) { ul.appendChild(cree("li", null, DATEH.format(new Date(x)))); }); det.appendChild(ul);
        t.appendChild(det);
      }
      d.appendChild(t);
      d.appendChild(bouton("Retirer l'accord", "bouton--petit bouton--danger", null, { "data-pc-retirer": c.conseiller, "data-pc-nom": c.nom }));
      z.appendChild(d);
    });
  }
  function chargerPartage() { if (E.partageConseiller) E.partageConseiller.etat().then(rendrePartage).catch(function () { rendrePartage(null); }); }
  function etatCode(t, type) { var e = $("pc-etat"); e.textContent = t || ""; e.hidden = !t; e.className = "reglage__desc pc-etat" + (type ? " pc-etat--" + type : ""); }
  $("pc-voir").addEventListener("click", function () {
    var code = $("pc-code").value.replace(/\s/g, "").toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) { etatCode("Le code compte 10 caractères (lettres et chiffres).", "erreur"); return; }
    E.partageConseiller.voir(code).then(function (r) {
      codeVu = code;
      $("pc-confirmer-txt").textContent = r.nom + " vous invite à partager votre Orbite en lecture seule. Il verra votre profil, vos crédits, votre épargne et vos placements, sans rien pouvoir modifier. Vous voyez chaque consultation et pouvez retirer l'accord à tout moment.";
      $("pc-confirmer").hidden = false; etatCode("");
      $("pc-accepter").focus();
    }).catch(function (x) { etatCode(erreur(x), "erreur"); });
  });
  $("pc-accepter").addEventListener("click", function () {
    if (!codeVu) return;
    E.partageConseiller.accepter(codeVu).then(function (l) {
      codeVu = null; $("pc-code").value = ""; $("pc-confirmer").hidden = true;
      rendrePartage(l); O.toast("Accès accordé à votre conseiller", { detail: "Vous pouvez le retirer ici à tout moment." });
    }).catch(function (x) { etatCode(erreur(x), "erreur"); });
  });
  $("pc-refuser").addEventListener("click", function () { codeVu = null; $("pc-confirmer").hidden = true; $("pc-code").value = ""; });
  $("pc-liste").addEventListener("click", function (e) {
    var b = e.target.closest("[data-pc-retirer]"); if (!b) return;
    var nom = b.getAttribute("data-pc-nom");
    /* Deux gestes : le premier demande confirmation, le second retire (effet immédiat). */
    if (b.getAttribute("data-confirmer") !== "oui") { b.setAttribute("data-confirmer", "oui"); b.classList.add("bouton--danger-plein"); b.textContent = "Confirmer : retirer l'accès"; return; }
    retirer(b, nom);
  });
  function retirer(b, nom) {
    b.disabled = true;
    E.partageConseiller.retirer(b.getAttribute("data-pc-retirer")).then(function (l) { rendrePartage(l); O.toast("Accès retiré : " + nom + " ne voit plus votre Orbite"); })
      .catch(function (x) { b.disabled = false; O.toast(erreur(x), { erreur: true }); });
  }

  /* ===================================================================
     Administration : donner ou retirer le rôle
     =================================================================== */
  function rendreAdmin(l) {
    var ul = $("admin-conseillers"); if (!ul) return;
    ul.textContent = "";
    if (!l || !l.length) { ul.appendChild(cree("li", "admin__vide", "Aucun conseiller pour l'instant.")); return; }
    l.forEach(function (c) {
      var li = cree("li", "admin__contact");
      li.appendChild(cree("strong", null, c.nom));
      li.appendChild(cree("span", "admin__contact-liens", c.email));
      li.appendChild(cree("small", null, "Depuis le " + DATE.format(new Date(c.ajoute_le)) + " · " + c.clients + (c.clients > 1 ? " clients" : " client")));
      li.appendChild(bouton("Retirer le rôle", "bouton--petit bouton--danger", null, { "data-ac-retirer": c.email, "data-ac-nom": c.nom }));
      ul.appendChild(li);
    });
  }
  /* Seulement pour l'administrateur : un compte ordinaire qui ouvre #admin ne doit pas déclencher de refus du serveur. */
  function chargerAdmin() { if (E.admin && E.admin.conseillers && E.admin.est) E.admin.est().then(function (oui) { return oui ? E.admin.conseillers().then(rendreAdmin) : null; }).catch(function () {}); }
  $("form-conseiller").addEventListener("submit", function (e) {
    e.preventDefault();
    var em = $("acn-email").value.trim(), nom = $("acn-nom").value.trim(), err = $("acn-erreur");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || nom.length < 2) { err.textContent = "Indiquez l'adresse du compte et le nom affiché aux clients (2 caractères au moins)."; err.hidden = false; return; }
    err.hidden = true;
    E.admin.conseillerDefinir(em, nom, true).then(function (l) { rendreAdmin(l); $("acn-email").value = ""; $("acn-nom").value = ""; O.toast(nom + " est conseiller", { detail: "Il doit activer la double authentification pour voir ses clients." }); })
      .catch(function (x) { err.textContent = erreur(x); err.hidden = false; });
  });
  $("admin-conseillers").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ac-retirer]"); if (!b) return;
    E.admin.conseillerDefinir(b.getAttribute("data-ac-retirer"), b.getAttribute("data-ac-nom"), false).then(function (l) { rendreAdmin(l); O.toast("Rôle retiré : ses clients ne lui sont plus visibles"); })
      .catch(function (x) { O.toast(erreur(x), { erreur: true }); });
  });

  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue === "clients") charger();
    else if (e.detail.vue === "compte") chargerPartage();
    else if (e.detail.vue === "admin") chargerAdmin();
  });
  function demarrer() { charger(); }
  if (O.pret) demarrer(); else doc.addEventListener("orbite:pret", demarrer, { once: true });
  window.OrbiteConseiller = { charger: charger, analyser: analyser };
})();
