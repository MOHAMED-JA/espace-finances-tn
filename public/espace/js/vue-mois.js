/*
 * Orbite — « Mon mois » (route #mois, onglet par #mois?onglet=budget|calendrier|comptes|prevision|factures ; Comptes : vue-comptes.js ;
 * Prévision et Factures : vue-pilotage.js). Point 5, choix validés le 12 oct. 2026.
 * Budget : enveloppes proposées depuis le profil (BudgetCalcul.proposition) tant que l'utilisateur ne les a pas modifiées,
 * dépense notée en une phrase (BudgetCalcul.phrase), reste à vivre et montant par jour jusqu'à la paie. Seuls les totaux par
 * enveloppe sont gardés, dans le profil (profil.budget) ; chaque changement s'annule depuis le message.
 * Calendrier : paie, primes, échéances des crédits (et la dernière), versements d'épargne, 31 décembre et rappels déjà en
 * place (CalendrierCalcul.evenements), sur 12 mois, avec export .ics vers l'agenda du téléphone.
 */
(function () {
  "use strict";
  var O = window.Orbite, B = window.BudgetCalcul, K = window.CalendrierCalcul;
  if (!O || !B || !K) return;
  var F = O.F, $ = O.$, doc = document, SVG = "http://www.w3.org/2000/svg";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
  var FIXES = { credits: "Prélevé chaque mois", logement: "Loyer et charges du profil", epargne: "Versements de vos contrats" };
  var LIB_TYPE = { paie: "Paie", prime: "Versement en plus", credit: "Crédit", fin: "Fin de crédit", epargne: "Épargne", fiscal: "Impôt", rappel: "Rappel" };
  var decalB = 0, decalC = 0, ouvert = null, jourVu = 0;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function lireMontant(v) { var r = F.lire(String(v == null ? "" : v)); return r.valide && !r.vide ? r.valeur : NaN; }
  function majuscule(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function moisDe(decal) { var m = new Date(); return new Date(m.getFullYear(), m.getMonth() + decal, 1); }
  function libMois(d) { return majuscule(MOIS[d.getMonth()]) + " " + d.getFullYear(); }
  function libJourPaie(j) { return j >= 1 ? "le " + (j === 1 ? "1er" : j) : "le dernier jour du mois"; }
  function info(def) { return B.ENVELOPPES.filter(function (e) { return e.cle === def; })[0]; }

  /* ---------- Onglets ---------- */
  var ONGLETS = ["budget", "calendrier", "comptes", "prevision", "factures"], barre = doc.querySelector(".mo-onglets");
  function ouvrirOnglet(cle, focus) {
    if (ONGLETS.indexOf(cle) === -1) cle = "budget";
    barre.setAttribute("data-o", cle);
    ONGLETS.forEach(function (c) {
      var t = $("mo-tab-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      $("mo-" + c).hidden = !on;
    });
    if (focus) $("mo-tab-" + cle).focus();
    rendre();
  }
  function choisir(cle, focus) { history.replaceState(null, "", "#mois?onglet=" + cle); ouvrirOnglet(cle, focus); }
  barre.addEventListener("click", function (e) { var b = e.target.closest("[data-onglet]"); if (b) choisir(b.getAttribute("data-onglet")); });
  barre.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var i = ONGLETS.indexOf(barre.getAttribute("data-o")), n = ONGLETS.length;
    choisir(ONGLETS[(Math.max(0, i) + (e.key === "ArrowRight" ? 1 : n - 1)) % n], true);
  });
  function ongletActif() { return barre.getAttribute("data-o"); }

  /* ===================================================================
     Budget
     =================================================================== */
  function revenu() {
    var sy = O.synthese(), p = O.profil();
    if (!sy || !p) return 0;
    return Math.round(((sy.salaire && sy.salaire.netMensuel) || 0) + (p.autresRevenus || 0));
  }
  function budgetProfil() { var p = O.profil(); return (p && p.budget) || { enveloppes: [], mois: {} }; }
  /* Plan du mois : celui que l'utilisateur a réglé (toutes les enveloppes, dans l'ordre), sinon la proposition. */
  function plan() {
    var b = budgetProfil(), prop = B.proposition(O.synthese() ? O.synthese().profil : O.profil(), revenu(), new Date());
    if (!b.enveloppes.length) return { enveloppes: prop, propose: true };
    var regle = {}; b.enveloppes.forEach(function (e) { regle[e.cle] = e; });
    return { enveloppes: B.ENVELOPPES.map(function (e) { var r = regle[e.cle]; return { cle: e.cle, libelle: e.libelle, prevu: r ? r.prevu : 0 }; }), propose: false };
  }
  function cloner(b) { return JSON.parse(JSON.stringify(b || { enveloppes: [], mois: {} })); }
  function enregistrer(nouveau, message, detail) {
    var avant = cloner(budgetProfil());
    O.majProfil({ budget: nouveau }, { immediat: true });
    O.toast(message, { detail: detail, action: { libelle: "Annuler", fn: function () { O.majProfil({ budget: avant }, { immediat: true }); O.toast("Annulé : votre budget est revenu comme avant.", { type: "info" }); } } });
  }

  function rendreBudget() {
    var p = O.profil(); if (!p) return;
    var mt = new Date(), m = moisDe(decalB), cle = B.cleMois(m), courant = decalB === 0;
    var net = revenu(), pl = plan(), b = budgetProfil(), dep = b.mois[cle] || {};
    var fin = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12);
    var st = B.etat({ net: net, enveloppes: pl.enveloppes, depenses: dep, maintenant: courant ? mt : fin, jourPaie: p.jourPaie });
    $("mo-b-mois").textContent = libMois(m);
    $("mo-b-prec").disabled = decalB <= -11;
    $("mo-b-suiv").disabled = decalB >= 0;

    var reste = $("mo-reste");
    reste.textContent = (st.resteAVivre < 0 ? "−" : "") + dt(Math.abs(st.resteAVivre));
    reste.classList.toggle("mo-reste__chiffre--negatif", st.resteAVivre < 0);
    var parJour = $("mo-par-jour");
    if (!net) parJour.textContent = "Indiquez votre salaire dans Mon profil : le reste à vivre part de votre revenu du mois.";
    else if (courant) parJour.textContent = st.resteAVivre > 0
      ? "Jusqu'à la paie (" + libJourPaie(p.jourPaie) + ") : " + st.jours + " jour" + (st.jours > 1 ? "s" : "") + ", soit " + dt(st.parJour) + " par jour."
      : "Le revenu du mois est dépassé : rien de plus avant la paie (" + libJourPaie(p.jourPaie) + ").";
    else parJour.textContent = st.resteAVivre >= 0 ? "Mois terminé : " + dt(st.resteAVivre) + " non dépensés." : "Mois terminé avec " + dt(-st.resteAVivre) + " de plus que le revenu.";
    var part = net > 0 ? Math.min(100, st.totalDepense / net * 100) : (st.totalDepense > 0 ? 100 : 0);
    var jauge = $("mo-jauge");
    jauge.style.width = part.toFixed(1) + "%";
    jauge.parentNode.classList.toggle("mo-jauge--alerte", st.totalDepense > net);
    $("mo-net").textContent = dt(net);
    $("mo-prevu").textContent = dt(st.totalPrevu);
    $("mo-depense").textContent = dt(st.totalDepense);
    var alerte = $("mo-alerte");
    if (st.planDepasseNet && net > 0) { alerte.hidden = false; alerte.textContent = "Vos enveloppes prévoient " + dt(st.totalPrevu) + ", plus que votre revenu du mois (" + dt(net) + "). Réduisez-en une pour garder l'équilibre."; }
    else if (st.depassements.length) { alerte.hidden = false; alerte.textContent = (st.depassements.length > 1 ? "Enveloppes dépassées : " : "Enveloppe dépassée : ") + st.depassements.map(function (l) { return l.libelle + " (+" + dt(l.depasse) + ")"; }).join(", ") + "."; }
    else alerte.hidden = true;

    $("mo-env-sous").textContent = pl.propose
      ? "Proposition faite à partir de votre profil : crédits, loyer et épargne, puis le reste réparti. Modifiez une enveloppe pour en faire votre budget."
      : "Votre budget. Le même plan sert chaque mois ; les dépenses, elles, repartent de zéro le 1er.";
    $("mo-env-reinit").hidden = pl.propose;

    var ul = $("mo-env-liste"); ul.textContent = "";
    st.lignes.forEach(function (l) {
      var e = info(l.cle), li = cree("li", "mo-ligne"), ouverte = ouvert === l.cle;
      li.setAttribute("data-cle", l.cle);
      if (l.depasse > 0) li.classList.add("mo-ligne--depasse");
      var tete = cree("div", "mo-ligne__tete");
      var ico = cree("span", "mo-ligne__ico"); ico.appendChild(icone(e.icone)); tete.appendChild(ico);
      var nom = cree("span", "mo-ligne__nom"); nom.appendChild(cree("b", null, l.libelle));
      nom.appendChild(cree("small", null, l.depasse > 0 ? "Dépassé de " + dt(l.depasse) : l.prevu > 0 ? dt(Math.max(0, l.reste)) + " restants" : (FIXES[l.cle] && !l.depense ? FIXES[l.cle] : "Aucune somme prévue")));
      tete.appendChild(nom);
      var chiffres = cree("span", "mo-ligne__chiffres chiffre"); chiffres.appendChild(cree("b", null, F.dt0(l.depense))); chiffres.appendChild(doc.createTextNode(" / " + dt(l.prevu)));
      tete.appendChild(chiffres);
      var btn = cree("button", "bouton bouton--icone bouton--petit mo-ligne__modifier"); btn.type = "button";
      btn.setAttribute("aria-expanded", ouverte ? "true" : "false"); btn.setAttribute("aria-controls", "mo-edit-" + l.cle);
      btn.setAttribute("aria-label", "Modifier l'enveloppe " + l.libelle); btn.setAttribute("data-modifier", l.cle);
      btn.appendChild(icone("crayon")); tete.appendChild(btn);
      li.appendChild(tete);
      var barreL = cree("div", "mo-ligne__barre"); barreL.setAttribute("aria-hidden", "true");
      var i = cree("i"); i.style.width = Math.min(100, l.part * 100).toFixed(1) + "%"; barreL.appendChild(i); li.appendChild(barreL);
      var ed = cree("form", "mo-ligne__edition"); ed.id = "mo-edit-" + l.cle; ed.hidden = !ouverte; ed.setAttribute("data-cle", l.cle); ed.noValidate = true;
      ed.appendChild(champ("mo-p-" + l.cle, "Prévu chaque mois", l.prevu, "prevu"));
      ed.appendChild(champ("mo-d-" + l.cle, "Dépensé en " + MOIS[m.getMonth()], l.depense, "depense"));
      var act = cree("div", "mo-ligne__actions");
      var ok = cree("button", "bouton bouton--plein bouton--petit", "Valider"); ok.type = "submit"; act.appendChild(ok);
      if (FIXES[l.cle] && l.prevu > 0 && l.depense < l.prevu) {
        var paye = cree("button", "bouton bouton--fantome bouton--petit", "Payé : " + dt(l.prevu)); paye.type = "button"; paye.setAttribute("data-paye", l.cle); act.appendChild(paye);
      }
      ed.appendChild(act);
      li.appendChild(ed);
      ul.appendChild(li);
    });
    remplirSelect();
  }
  function champ(id, lib, valeur, quoi) {
    var c = cree("div", "champ"), l = cree("label", null, lib); l.htmlFor = id; c.appendChild(l);
    var s = cree("div", "saisie"), inp = cree("input"); inp.id = id; inp.type = "text"; inp.inputMode = "decimal"; inp.value = F.saisie(valeur); inp.setAttribute("data-quoi", quoi);
    s.appendChild(inp); s.appendChild(cree("span", "saisie__unite", "DT")); c.appendChild(s); return c;
  }
  function remplirSelect() {
    var sel = $("mo-env"), garde = sel.value;
    if (sel.options.length !== B.ENVELOPPES.length) {
      sel.textContent = "";
      B.ENVELOPPES.forEach(function (e) { var o = cree("option", null, e.libelle); o.value = e.cle; sel.appendChild(o); });
    }
    sel.value = garde || "courses";
  }

  $("mo-env-liste").addEventListener("click", function (e) {
    var m = e.target.closest("[data-modifier]");
    if (m) {
      var cle = m.getAttribute("data-modifier");
      ouvert = ouvert === cle ? null : cle;
      rendreBudget();
      if (ouvert) { var inp = $("mo-p-" + cle); if (inp) inp.focus(); }
      return;
    }
    var p = e.target.closest("[data-paye]");
    if (p) {
      var k = p.getAttribute("data-paye"), l = plan().enveloppes.filter(function (x) { return x.cle === k; })[0];
      ajouterDepense(k, l.prevu, true);
    }
  });
  $("mo-env-liste").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, cle = f.getAttribute("data-cle");
    var prevu = lireMontant(f.querySelector('[data-quoi="prevu"]').value), dep = lireMontant(f.querySelector('[data-quoi="depense"]').value);
    if (f.querySelector('[data-quoi="prevu"]').value.trim() === "") prevu = 0;
    if (f.querySelector('[data-quoi="depense"]').value.trim() === "") dep = 0;
    if (!(prevu >= 0) || !(dep >= 0)) { O.toast("Montant non reconnu", { erreur: true, detail: "Écrivez un nombre, par exemple 350 ou 12,5." }); return; }
    var pl = plan(), nb = cloner(budgetProfil()), cm = B.cleMois(moisDe(decalB));
    nb.enveloppes = pl.enveloppes.map(function (x) { return { cle: x.cle, libelle: x.libelle, prevu: x.cle === cle ? prevu : x.prevu }; });
    nb.mois[cm] = Object.assign({}, nb.mois[cm] || {}); nb.mois[cm][cle] = dep;
    ouvert = null;
    enregistrer(B.normaliser(nb), "Enveloppe « " + info(cle).libelle + " » enregistrée", pl.propose ? "La proposition devient votre budget : vous pouvez y revenir à tout moment." : null);
  });
  $("mo-env-reinit").addEventListener("click", function () {
    var nb = cloner(budgetProfil()); nb.enveloppes = [];
    enregistrer(B.normaliser(nb), "Enveloppes recalculées depuis votre profil", "Vos dépenses notées sont gardées.");
  });
  $("mo-b-prec").addEventListener("click", function () { if (decalB > -11) { decalB--; ouvert = null; rendreBudget(); } });
  $("mo-b-suiv").addEventListener("click", function () { if (decalB < 0) { decalB++; ouvert = null; rendreBudget(); } });

  function ajouterDepense(cle, montant, paye) {
    var nb = cloner(budgetProfil()), cm = B.cleMois(moisDe(decalB)), pl = plan();
    if (!nb.enveloppes.length) nb.enveloppes = pl.enveloppes.map(function (x) { return { cle: x.cle, libelle: x.libelle, prevu: x.prevu }; });
    nb.mois[cm] = Object.assign({}, nb.mois[cm] || {});
    nb.mois[cm][cle] = Math.round(((nb.mois[cm][cle] || 0) + montant) * 1000) / 1000;
    if (paye) nb.mois[cm][cle] = montant;
    enregistrer(B.normaliser(nb), paye ? "« " + info(cle).libelle + " » marqué payé : " + dt(montant) : dt(montant) + " ajoutés à « " + info(cle).libelle + " »",
      decalB === 0 ? null : "Ajouté au mois de " + MOIS[moisDe(decalB).getMonth()] + ".");
  }
  var phrase = $("mo-phrase"), aide = $("mo-phrase-aide"), choixManuel = false;
  phrase.addEventListener("input", function () {
    var r = B.phrase(phrase.value);
    aide.classList.remove("mo-aide--erreur");
    if (!phrase.value.trim()) { aide.textContent = ""; choixManuel = false; return; }
    if (!r) { aide.textContent = "Ajoutez le montant, par exemple « 12 café »."; return; }
    if (r.cle && !choixManuel) $("mo-env").value = r.cle;
    aide.textContent = dt(r.montant) + " → " + info($("mo-env").value).libelle + (r.cle || choixManuel ? "" : " (choisissez l'enveloppe)");
  });
  $("mo-env").addEventListener("change", function () { choixManuel = true; phrase.dispatchEvent(new Event("input")); });
  $("mo-ajout").addEventListener("submit", function (e) {
    e.preventDefault();
    var r = B.phrase(phrase.value);
    if (!r) { aide.textContent = "Montant non reconnu : écrivez par exemple « 45 dinars d'essence »."; aide.classList.add("mo-aide--erreur"); phrase.focus(); return; }
    ajouterDepense($("mo-env").value, r.montant, false);
    phrase.value = ""; aide.textContent = ""; choixManuel = false; phrase.focus();
  });

  /* ===================================================================
     Calendrier
     =================================================================== */
  function rappels() { try { return window.OrbiteRappels ? window.OrbiteRappels.liste() : []; } catch (e) { return []; } }
  function evenementsDe(d, rs) {
    var sy = O.synthese(); if (!sy) return [];
    return K.evenements(sy.profil, d.getFullYear(), d.getMonth(), { maintenant: new Date(), net: sy.salaire ? sy.salaire.netMensuel : 0, rappels: rs });
  }
  function rendreCalendrier() {
    var sy = O.synthese(); if (!sy) return;
    var d = moisDe(decalC), mt = new Date(), evts = evenementsDe(d, rappels()), rs = K.resume(evts);
    $("mo-c-mois").textContent = libMois(d);
    $("mo-c-prec").disabled = decalC <= 0;
    $("mo-c-suiv").disabled = decalC >= 11;
    var morceaux = [];
    if (rs.prelevements > 0) morceaux.push("Prélèvements : " + dt(rs.prelevements));
    if (rs.entrees > 0) morceaux.push((sy.profil.activite === "retraite" ? "Pension : " : "Paie : ") + dt(rs.entrees));
    $("mo-cal-resume").textContent = morceaux.join(" · ") || "Ajoutez vos crédits et vos contrats dans Mon profil pour remplir le calendrier.";

    var parJour = {}; evts.forEach(function (e) { (parJour[e.jour] = parJour[e.jour] || []).push(e); });
    var g = $("mo-cal-grille"); g.textContent = "";
    JOURS.forEach(function (j) { g.appendChild(cree("span", "mo-cal__jsem", j.charAt(0).toUpperCase() + j.slice(1, 3))); });
    K.grille(d.getFullYear(), d.getMonth()).forEach(function (sem) {
      sem.forEach(function (j) {
        var c = cree("span", "mo-cal__case");
        if (j == null) { c.classList.add("mo-cal__case--vide"); g.appendChild(c); return; }
        c.appendChild(cree("b", null, String(j)));
        if (decalC === 0 && j === mt.getDate()) c.classList.add("mo-cal__case--auj");
        if (parJour[j]) {
          c.classList.add("mo-cal__case--evt"); c.setAttribute("data-jour", j);
          if (jourVu === j) c.classList.add("mo-cal__case--vu");
          var pts = cree("span", "mo-cal__points");
          parJour[j].slice(0, 4).forEach(function (e) { var p = cree("i"); p.setAttribute("data-t", e.type === "fin" ? "credit" : e.type === "prime" ? "paie" : e.type); pts.appendChild(p); });
          c.appendChild(pts);
        }
        g.appendChild(c);
      });
    });

    var ol = $("mo-agenda"); ol.textContent = "";
    $("mo-agenda-vide").hidden = evts.length > 0;
    evts.forEach(function (e) {
      var li = cree("li", "mo-evt"); li.setAttribute("data-t", e.type); li.setAttribute("data-jour", e.jour);
      if (jourVu === e.jour) li.classList.add("mo-evt--vu");
      var date = cree("span", "mo-evt__date");
      date.appendChild(cree("b", null, String(e.jour)));
      date.appendChild(cree("small", null, JOURS[(new Date(d.getFullYear(), d.getMonth(), e.jour).getDay() + 6) % 7]));
      li.appendChild(date);
      var corps = cree("span", "mo-evt__corps");
      var t = cree("span", "mo-evt__titre"); t.appendChild(cree("i", "mo-evt__type", LIB_TYPE[e.type])); t.appendChild(doc.createTextNode(e.libelle)); corps.appendChild(t);
      if (e.detail) {
        var det = cree("small", null, e.detail);
        corps.appendChild(det);
        if (/à préciser|à choisir/.test(e.detail)) { var pr = cree("button", "mo-lien", "Préciser"); pr.type = "button"; pr.setAttribute("data-dates", ""); det.appendChild(doc.createTextNode(" · ")); det.appendChild(pr); }
      }
      li.appendChild(corps);
      if (e.montant != null) li.appendChild(cree("b", "mo-evt__montant chiffre", (e.type === "paie" ? "+" : "−") + dt(e.montant)));
      ol.appendChild(li);
    });
    rendreDates();
  }
  $("mo-cal-grille").addEventListener("click", function (e) {
    var c = e.target.closest("[data-jour]"); if (!c) return;
    jourVu = +c.getAttribute("data-jour"); rendreCalendrier();
    var li = doc.querySelector('.mo-evt[data-jour="' + jourVu + '"]');
    if (li) li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  $("mo-agenda").addEventListener("click", function (e) {
    if (!e.target.closest("[data-dates]")) return;
    var d = $("mo-dates"); d.open = true; d.scrollIntoView({ block: "nearest", behavior: "smooth" });
    var s = d.querySelector("select"); if (s) s.focus();
  });
  $("mo-c-prec").addEventListener("click", function () { if (decalC > 0) { decalC--; jourVu = 0; rendreCalendrier(); } });
  $("mo-c-suiv").addEventListener("click", function () { if (decalC < 11) { decalC++; jourVu = 0; rendreCalendrier(); } });

  /* Réglage des dates : jour de paie, jour de prélèvement de chaque crédit, jour de versement de l'épargne. */
  function selectJours(id, lib, valeur, zero, max, data) {
    var c = cree("div", "champ"), l = cree("label", null, lib); l.htmlFor = id; c.appendChild(l);
    var s = cree("div", "saisie"), sel = cree("select"); sel.id = id;
    Object.keys(data).forEach(function (k) { sel.setAttribute(k, data[k]); });
    var o0 = cree("option", null, zero); o0.value = "0"; sel.appendChild(o0);
    for (var j = 1; j <= max; j++) { var o = cree("option", null, j === 1 ? "Le 1er" : "Le " + j); o.value = String(j); sel.appendChild(o); }
    sel.value = String(valeur || 0);
    s.appendChild(sel); s.appendChild(icone("chevron")); s.lastChild.setAttribute("class", "saisie__chevron");
    c.appendChild(s); return c;
  }
  function rendreDates() {
    var p = O.profil(), box = $("mo-dates-champs"); if (!p) return;
    if (box.contains(doc.activeElement)) return;
    box.textContent = "";
    box.appendChild(selectJours("mo-jour-paie", p.activite === "retraite" ? "Jour de la pension" : "Jour de la paie", p.jourPaie, "Dernier jour du mois", 28, { "data-jour": "paie" }));
    (p.credits || []).forEach(function (c, i) {
      if (!(c.mensualite > 0)) return;
      box.appendChild(selectJours("mo-jour-credit-" + i, c.libelle + " : prélevé", c.jourPrelevement, "Non précisé", 31, { "data-jour": "credit", "data-i": String(i) }));
    });
    if ((p.contrats || []).some(function (c) { return c.versementMensuel > 0; })) {
      var ch = selectJours("mo-jour-epargne", "Versement d'épargne (et son rappel)", p.jourVersement, "Pas de date", 28, { "data-jour": "epargne" });
      box.appendChild(ch);
    }
  }
  $("mo-dates-champs").addEventListener("change", function (e) {
    var s = e.target.closest("select[data-jour]"); if (!s) return;
    var v = +s.value, p = O.profil(), quoi = s.getAttribute("data-jour");
    if (quoi === "paie") O.majProfil({ jourPaie: v });
    else if (quoi === "epargne") O.majProfil({ jourVersement: v });
    else {
      var i = +s.getAttribute("data-i");
      O.majProfil({ credits: p.credits.map(function (c, k) { return k === i ? Object.assign({}, c, { jourPrelevement: v }) : c; }) });
    }
    s.blur(); rendreCalendrier();
  });

  $("mo-ics").addEventListener("click", function () {
    var rs = rappels(), tous = [];
    for (var k = 0; k < 12; k++) tous = tous.concat(evenementsDe(moisDe(k), rs));
    if (!tous.length) { O.toast("Rien à ajouter pour l'instant", { type: "info", detail: "Ajoutez vos crédits et vos contrats dans Mon profil." }); return; }
    O.telecharger("orbite-calendrier.ics", K.ics(tous, new Date()), "text/calendar;charset=utf-8");
    O.toast("Fichier agenda prêt : " + tous.length + " dates sur 12 mois", { detail: "Ouvrez-le sur votre téléphone pour les ajouter à votre agenda. Il est créé sur l'appareil, rien n'est envoyé." });
  });

  /* ---------- Rendu et navigation ---------- */
  function rendre() {
    if ($("vue-mois").hidden) return;
    var o = ongletActif();
    if (o === "calendrier") rendreCalendrier(); else if (o === "comptes") { if (window.OrbiteComptes) window.OrbiteComptes.rendre(); }
    else if (o === "prevision" || o === "factures") { if (window.OrbitePilotage) window.OrbitePilotage.rendre(o); } else rendreBudget();
  }
  /* Pour le fil du mois de l'accueil (fil-mois.js) : état du mois en cours et prochaines dates, mêmes calculs que cette page. */
  function etatDuMois() {
    var p = O.profil(); if (!p) return null;
    var mt = new Date(), b = budgetProfil();
    return B.etat({ net: revenu(), enveloppes: plan().enveloppes, depenses: b.mois[B.cleMois(mt)] || {}, maintenant: mt, jourPaie: p.jourPaie });
  }
  function prochains(n) {
    var mt = new Date(), rs = rappels();
    return K.prochains([evenementsDe(mt, rs), evenementsDe(new Date(mt.getFullYear(), mt.getMonth() + 1, 1), rs)], mt, n);
  }
  /* Pour l'import du relevé (releve-import.js) : plan du mois et enregistrement avec « Annuler ». */
  window.OrbiteBudget = { plan: plan, enregistrer: enregistrer, etatDuMois: etatDuMois, prochains: prochains };
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "mois") return;
    ouvrirOnglet(e.detail.params.get("onglet") || ongletActif());
  });
  O.surProfil(function () { rendre(); });
})();
