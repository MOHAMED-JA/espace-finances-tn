/*
 * Orbite — cœur de l'application : navigation, profil partagé, enregistrement, outils d'interface.
 * Expose window.Orbite, utilisé par les vues et les modules.
 * Le profil est conservé dans les métadonnées du compte (Supabase Auth, visibles par l'utilisateur seul).
 */
(function () {
  "use strict";
  var E = window.Espace, M = window.EFModele, OC = window.OrbiteCalcul;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  /* Mouvement réduit : réglage de l'appareil OU choix « Réduites » dans les paramètres. */
  var mqMouvement = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var mouvementReduit = { get matches() { return mqMouvement.matches || doc.documentElement.getAttribute("data-mouvement") === "reduit"; } };

  /* ---------- Formats ---------- */
  function nbsp(s) { return String(s).replace(/[  ]/g, " "); }
  var formats = {};
  function fmt(d, min) {
    var k = d + ":" + (min === undefined ? d : min);
    return formats[k] || (formats[k] = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: min === undefined ? d : min, maximumFractionDigits: d }));
  }
  var F = {
    dt3: function (v) { return nbsp(fmt(3).format(Math.round(v * 1000) / 1000)); },
    dt0: function (v) { return nbsp(fmt(0).format(Math.round(v))); },
    dt: function (v) { return Math.abs(v) >= 1000 ? F.dt0(v) : F.dt3(v); },
    pct: function (v, d) { return nbsp(fmt(d === undefined ? 1 : d, 0).format(v * 100)) + " %"; },
    saisie: function (v) { return v ? nbsp(fmt(3, 0).format(v)) : ""; },
    lire: function (texte) {
      var t = String(texte == null ? "" : texte).replace(/[\s  ]/g, "").replace(",", ".");
      if (t === "") return { vide: true, valide: true, valeur: 0 };
      var n = Number(t);
      if (!isFinite(n) || n < 0 || n > 1e9) return { vide: false, valide: false, valeur: 0 };
      return { vide: false, valide: true, valeur: n };
    }
  };

  /* ---------- Bascules à pastille glissante (hors module Salaire, qui gère les siennes) ---------- */
  function placerPastille(groupe, animer) {
    var coche = groupe.querySelector("input:checked"), pastille = groupe.querySelector(".bascule__pastille");
    if (!coche || !pastille || !groupe.offsetParent) return;
    var lab = coche.closest("label");
    var sans = !animer || mouvementReduit.matches;
    if (sans) groupe.classList.add("sans-anim");
    pastille.style.setProperty("--x", (lab.offsetLeft - 4) + "px");
    pastille.style.setProperty("--l", lab.offsetWidth + "px");
    if (sans) requestAnimationFrame(function () { groupe.classList.remove("sans-anim"); });
  }
  function placerPastilles(racine) {
    (racine || doc).querySelectorAll(".bascule").forEach(function (g) { placerPastille(g, false); });
  }
  doc.addEventListener("change", function (e) {
    var g = e.target.closest && e.target.closest(".bascule");
    if (g && !g.closest("#vue-salaire")) placerPastille(g, true);
  });
  window.addEventListener("resize", function () { placerPastilles(); });

  /* ---------- Chiffres qui roulent ---------- */
  /* Chaque chiffre est une colonne 0-9 qui roule jusqu'à sa valeur (pseudo-élément : le texte de l'élément reste
     le montant exact, lu par les lecteurs d'écran et les tests). Jamais pendant la frappe (option instantane). */
  var tweens = new WeakMap();
  function rouler(el, txt, instant) {
    var forme = txt.replace(/\d/g, "0"), vis = el.lastChild;
    var neuf = !vis || !vis.classList || !vis.classList.contains("roule") || el.getAttribute("data-forme") !== forme;
    if (neuf) {
      el.textContent = "";
      var sr = doc.createElement("span"); sr.className = "cache";
      vis = doc.createElement("span"); vis.className = "roule"; vis.setAttribute("aria-hidden", "true");
      for (var i = 0; i < txt.length; i++) {
        var c = txt.charAt(i), sp = doc.createElement("span");
        if (/\d/.test(c)) sp.className = "roule__c"; else { sp.className = "roule__s"; sp.setAttribute("data-c", c); }
        vis.appendChild(sp);
      }
      el.appendChild(sr); el.appendChild(vis); el.setAttribute("data-forme", forme);
      if (!instant) void vis.offsetWidth;
    }
    el.firstChild.textContent = txt;
    var cols = vis.children;
    if (instant) vis.classList.add("roule--fixe");
    for (var k = 0; k < txt.length; k++) { var ch = txt.charAt(k); if (/\d/.test(ch)) cols[k].style.setProperty("--d", ch); }
    if (instant) { void vis.offsetWidth; vis.classList.remove("roule--fixe"); }
  }
  function animerNombre(el, valeur, format, options) {
    var o = options || {};
    var avant = tweens.has(el) ? tweens.get(el).valeur : null;
    tweens.set(el, { valeur: valeur });
    var instant = avant === null || mouvementReduit.matches || o.instantane || Math.abs(avant - valeur) < 1e-9;
    rouler(el, format(valeur), instant);
    if (!instant && o.ecart && Math.abs(valeur - avant) > 0.0005) montrerEcart(o.ecart, valeur - avant, o.formatEcart || format);
  }
  function montrerEcart(el, d, format) {
    el.textContent = (d > 0 ? "+" : "−") + format(Math.abs(d));
    el.className = "ecart " + (d > 0 ? "ecart--hausse" : "ecart--baisse");
    void el.offsetWidth;
    el.classList.add("visible");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("visible"); }, 2200);
  }

  /* ---------- Retour haptique ---------- */
  /* Vibration brève (Android ; Safari sur iPhone ne le permet pas aux sites), désactivable dans les paramètres. */
  function vibrer(motif) {
    try { if (localStorage.getItem("ef-vibrations") === "non") return false; } catch (e) {}
    try { return !!(navigator.vibrate && navigator.vibrate(motif)); } catch (e) { return false; }
  }

  /* ---------- Puce qui vole jusqu'à sa destination ---------- */
  function puceVolante(depuis, vers, texte, couleur) {
    if (mouvementReduit.matches || !depuis || !vers || !depuis.animate) return;
    var a = depuis.getBoundingClientRect(), b = vers.getBoundingClientRect();
    if (!b.width) return;
    var p = doc.createElement("span");
    p.className = "puce puce-volante puce--" + (couleur || "credit");
    p.textContent = texte;
    doc.body.appendChild(p);
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    var w = p.offsetWidth / 2, h = p.offsetHeight / 2, haut = Math.min(y0, y1) - 80;
    p.animate([
      { transform: "translate(" + (x0 - w) + "px," + (y0 - h) + "px) scale(.9)", opacity: 0 },
      { transform: "translate(" + ((x0 + x1) / 2 - w) + "px," + (haut - h) + "px) scale(1)", opacity: 1, offset: .5 },
      { transform: "translate(" + (x1 - w) + "px," + (y1 - h) + "px) scale(.6)", opacity: 0 }
    ], { duration: 640, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = function () { p.remove(); };
  }

  /* ---------- Profil partagé ---------- */
  var utilisateur = null, profil = null, choix = { epargne: "equilibree" }, synthese = null, abonnes = [];
  var etatEnr = $("etat-enregistrement"), minuterieProfil = null, profilVierge = true;

  function metaProfil(u) { var m = (u && u.user_metadata) || {}; return m.orbite && typeof m.orbite === "object" ? m.orbite : null; }
  function recalculer() {
    /* Date de naissance obligatoire : sans elle, la capacité d'emprunt (qui dépend de l'âge) reste masquée. */
    doc.body.classList.toggle("sans-naissance", !!profil && !profil.dateNaissance);
    try { synthese = OC.synthese(profil, choix); } catch (e) { synthese = null; if (window.console) console.error(e); }
    abonnes.forEach(function (fn) { try { fn(synthese, profil); } catch (e) { if (window.console) console.error(e); } });
  }
  function surProfil(fn) { abonnes.push(fn); if (profil) fn(synthese, profil); }

  /* Enregistre le profil (avec un court délai pour regrouper les frappes). */
  function majProfil(partiel, options) {
    var o = options || {};
    /* Salaire corrigé à la main alors qu'un historique existe : l'entrée en vigueur suit la correction
       (sinon l'historique remettrait l'ancien montant). */
    if (!partiel.historiqueSalaire && profil && profil.historiqueSalaire && profil.historiqueSalaire.length && ("montant" in partiel || "sens" in partiel || "periode" in partiel)) {
      var mt = new Date(), ici = OC.salaireEnVigueur(profil, mt.getFullYear(), mt.getMonth());
      if (ici) {
        var hist = profil.historiqueSalaire.map(function (h) { return h === ici ? Object.assign({}, h, { montant: "montant" in partiel ? partiel.montant : h.montant, sens: partiel.sens || h.sens, periode: partiel.periode || h.periode }) : h; });
        partiel = Object.assign({}, partiel, { historiqueSalaire: hist });
      }
    }
    profil = OC.normaliser(Object.assign({}, profil, partiel));
    profilVierge = false;
    recalculer();
    clearTimeout(minuterieProfil);
    etatEnr.textContent = "Modifications…";
    etatEnr.className = "barre__etat";
    minuterieProfil = setTimeout(sauverProfil, o.immediat ? 0 : 900);
  }
  function sauverProfil() {
    etatEnr.textContent = "Enregistrement…";
    E.client.auth.updateUser({ data: { orbite: Object.assign({ v: 1 }, profil) } }).then(function (r) {
      if (r.error) throw r.error;
      etatEnr.textContent = "Profil enregistré";
      etatEnr.className = "barre__etat barre__etat--ok";
      setTimeout(function () { if (etatEnr.textContent === "Profil enregistré") etatEnr.textContent = ""; }, 2400);
    }).catch(function (err) {
      /* Hors connexion : le profil reste sur l'appareil et part dès le retour du réseau. */
      if (E.estErreurReseau(err)) {
        profilEnAttente = true;
        etatEnr.textContent = "Enregistré au retour du réseau";
        etatEnr.className = "barre__etat";
        return;
      }
      etatEnr.textContent = "Non enregistré";
      etatEnr.className = "barre__etat barre__etat--erreur";
      E.toast(M.messageErreur(err), { erreur: true });
    });
  }
  var profilEnAttente = false;
  /* Bandeau « hors connexion » et reprise automatique au retour du réseau. */
  function majReseau() {
    var b = $("hors-ligne");
    if (b) b.hidden = navigator.onLine;
    doc.documentElement.toggleAttribute("data-hors-ligne", !navigator.onLine);
  }
  window.addEventListener("offline", majReseau);
  window.addEventListener("online", function () {
    majReseau();
    if (profilEnAttente) { profilEnAttente = false; sauverProfil(); }
    /* Session ouverte hors connexion : vérification auprès du serveur maintenant que le réseau est revenu. */
    if (E.horsLigne()) E.client.auth.getUser().then(function (r) {
      if (r.data && r.data.user) { utilisateur = r.data.user; remplirUtilisateur(); majReseau(); }
    }).catch(function () {});
  });
  function choisir(cle, valeur) { choix[cle] = valeur; recalculer(); }

  /* ---------- Modules et enregistrement des simulations ---------- */
  var MODULES = {
    salaire: { outil: "salaire", objet: function () { return window.ModuleSalaire; }, nom: "Salaire", couleur: "salaire" },
    epargne: { outil: "assurance_vie", objet: function () { return window.ModuleEpargne; }, nom: "Épargne", couleur: "epargne" },
    credit: { outil: "credit", objet: function () { return window.ModuleCredit; }, nom: "Crédit", couleur: "credit" }
  };
  var OUTIL_VERS_VUE = { salaire: "salaire", assurance_vie: "epargne", credit: "credit" };
  var simulationOuverte = {}; /* vue → { id, nom } */
  var modulesInities = {};

  function moduleCourant() { var r = lireRoute(); return MODULES[r.vue] ? r.vue : null; }
  function modifie(vue) {
    var s = simulationOuverte[vue];
    if (s && moduleCourant() === vue) $("enregistrer-lib").textContent = "Mettre à jour";
  }

  function apercuResume(res) {
    var box = $("enr-apercu");
    box.textContent = "";
    if (!res || !res.principal) return;
    var l = doc.createElement("span"); l.textContent = res.principal.libelle;
    var v = doc.createElement("strong"); v.className = "chiffre"; v.textContent = M.formaterIndicateur(res.principal);
    var s = doc.createElement("small"); s.textContent = res.ligne || "";
    box.appendChild(l); box.appendChild(v); box.appendChild(s);
  }

  function enregistrer() {
    var vue = moduleCourant(); if (!vue) return;
    var mod = MODULES[vue], obj = mod.objet(); if (!obj) return;
    var etat = obj.etat(), resume = obj.resume();
    var ouverte = simulationOuverte[vue];
    if (ouverte) {
      E.simulations.mettreAJour(ouverte.id, etat, resume).then(function () {
        E.toast("« " + ouverte.nom + " » mise à jour.");
        $("enregistrer-lib").textContent = "Enregistré";
        window.OrbiteSimulations && window.OrbiteSimulations.recharger();
      }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
      return;
    }
    var dlg = $("dlg-enregistrer"), champ = $("enr-nom");
    var versP = !!obj.versProfil;
    $("enr-profil-ligne").hidden = !versP;
    $("enr-profil").checked = false;
    $("enr-profil-lib").textContent = vue === "credit" ? "Ajouter aussi à mes crédits ou mes projets" : "Ajouter aussi à mes contrats";
    apercuResume(resume);
    champ.value = obj.nomParDefaut();
    dlg.returnValue = "";
    dlg.showModal();
    champ.select();
    dlg.addEventListener("close", function fin() {
      dlg.removeEventListener("close", fin);
      $("enregistrer").focus();
      if (dlg.returnValue !== "ok") return;
      var nom = M.nomValide(champ.value) || obj.nomParDefaut();
      E.simulations.creer(mod.outil, nom, etat, resume).then(function (s) {
        simulationOuverte[vue] = { id: s.id, nom: s.nom };
        $("enregistrer-lib").textContent = "Enregistré";
        E.toast("« " + s.nom + " » enregistrée dans vos simulations.");
        puceVolante($("enregistrer"), doc.querySelector('.rail a[data-vue="simulations"]') || doc.querySelector('.onglets-bas a[data-vue="profil"]'), "+1", mod.couleur);
        window.OrbiteSimulations && window.OrbiteSimulations.recharger();
        if (versP && $("enr-profil").checked) setTimeout(ajouterAuProfil, 250);
      }).catch(function (err) { E.toast(M.messageErreur(err), { erreur: true }); });
    });
  }
  $("enregistrer").addEventListener("click", enregistrer);
  $("reprendre-profil").addEventListener("click", function () {
    var vue = moduleCourant(), obj = vue && MODULES[vue].objet();
    if (obj && obj.depuisProfil) { obj.depuisProfil(profil); simulationOuverte[vue] = null; $("enregistrer-lib").textContent = "Enregistrer"; E.toast("Valeurs de votre profil reprises."); }
  });

  /* ---------- Simulation → profil : crédits en cours, projets, contrats d'épargne ---------- */
  var MOIS_NOMS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function el(tag, classe, texte, attrs) {
    var e = doc.createElement(tag);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function champTexte(id, lib, valeur, unite) {
    var c = el("div", "champ"), l = el("label", null, lib, { "for": id }), sa = el("div", "saisie");
    var i = el("input", null, null, { id: id, type: "text", autocomplete: "off", maxlength: "60" }); i.value = valeur == null ? "" : String(valeur);
    if (unite) { i.setAttribute("inputmode", "decimal"); sa.appendChild(i); sa.appendChild(el("span", "saisie__unite", unite)); } else sa.appendChild(i);
    c.appendChild(l); c.appendChild(sa); return c;
  }
  function champChoix(id, lib, options, valeur) {
    var c = el("div", "champ"), l = el("label", null, lib, { "for": id }), sa = el("div", "saisie"), se = el("select", null, null, { id: id });
    options.forEach(function (o) { var op = el("option", null, o[1], { value: String(o[0]) }); se.appendChild(op); });
    se.value = String(valeur);
    var u = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); u.setAttribute("class", "saisie__chevron"); u.setAttribute("aria-hidden", "true");
    var us = doc.createElementNS("http://www.w3.org/2000/svg", "use"); us.setAttribute("href", "/orbite/icones.svg#chevron"); u.appendChild(us);
    sa.appendChild(se); sa.appendChild(u); c.appendChild(l); c.appendChild(sa); return c;
  }
  /* Groupe de choix : [[valeur, titre, détail]], le premier coché par défaut (ou « defaut »). */
  function groupeRadios(nom, legende, choix, defaut) {
    var fs = el("fieldset", "ajout-profil__choix"), lg = el("legend", "champ__lib", legende);
    fs.appendChild(lg);
    choix.forEach(function (c, i) {
      var lab = el("label", "ajout-profil__option" + (c[3] ? " ajout-profil__option--inactif" : ""));
      var r = el("input", null, null, { type: "radio", name: nom, value: String(c[0]) });
      r.checked = defaut != null ? String(defaut) === String(c[0]) : i === 0;
      if (c[3]) r.disabled = true;
      var t = el("span"); t.appendChild(el("strong", null, c[1])); if (c[2]) t.appendChild(el("small", null, c[2]));
      lab.appendChild(r); lab.appendChild(t); fs.appendChild(lab);
    });
    return fs;
  }
  function valeurRadio(nom) { var r = doc.querySelector('#profil-corps input[name="' + nom + '"]:checked'); return r ? r.value : null; }
  function nombreLu(id) { var v = F.lire($(id).value); return v.valide && !v.vide ? v.valeur : null; }
  function pcTxt(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }

  function ajouterAuProfil() {
    var vue = moduleCourant(); if (vue !== "credit" && vue !== "epargne") return;
    var obj = MODULES[vue].objet(); if (!obj || !obj.versProfil || !profil) return;
    var d = obj.versProfil();
    if (!d) return;
    if (d.erreur) { E.toast(d.erreur, { erreur: true }); return; }
    var corps = $("profil-corps"), maintenant = new Date(), appliquer;
    corps.textContent = "";
    if (d.genre === "credit") {
      $("dlg-profil-titre").textContent = "Ajouter ce crédit à mon profil";
      var c = d.credit, sit = d.situation;
      corps.appendChild(groupeRadios("ap-statut", "Ce crédit est", [
        ["signe", "Déjà signé", c ? "Il rejoint vos crédits en cours et compte dans votre endettement." : d.motif, !c],
        ["projet", "En projet", "Il rejoint vos projets : Orbite vous dit à partir de quand il devient possible."]
      ], c && !sit.avenir ? "signe" : "projet"));
      /* Déjà signé : situation du jour tirée du tableau simulé */
      var bS = el("div", "ajout-profil__bloc", null, { "data-pour": "signe" });
      if (c) {
        bS.appendChild(champTexte("ap-nom-credit", "Nom du crédit", c.libelle));
        var res = el("p", "ajout-profil__resume");
        res.textContent = (sit.avenir ? "Première échéance à venir. " : "Situation en " + MOIS_NOMS[maintenant.getMonth()] + " " + maintenant.getFullYear() + " : ") +
          "mensualité " + F.dt3(c.mensualite) + " DT hors assurance · taux " + pcTxt(c.tauxPct) + (c.tauxType === "fixe" ? " fixe" : " variable") +
          " · " + sit.restantes + " échéance" + (sit.restantes > 1 ? "s" : "") + " restante" + (sit.restantes > 1 ? "s" : "") + " (dernière en " + sit.fin + ")" +
          (c.reductionAnnee ? " · taux divisé par deux en " + MOIS_NOMS[c.reductionMois - 1] + " " + c.reductionAnnee : "") + ".";
        bS.appendChild(res);
        var cands = profil.credits.map(function (x, i) { return [i, x]; });
        var proche = cands.filter(function (x) { return x[1].type === c.type && (x[1].libelle === c.libelle || Math.abs(x[1].mensualite - c.mensualite) <= c.mensualite * 0.15); })[0];
        bS.appendChild(groupeRadios("ap-dest-credit", "Dans vos crédits", [["nouveau", "Ajouter un nouveau crédit", null]].concat(cands.map(function (x) {
          return ["maj-" + x[0], "Mettre à jour « " + x[1].libelle + " »", F.dt3(x[1].mensualite) + " DT par mois aujourd'hui"]; })), proche ? "maj-" + proche[0] : "nouveau"));
      }
      corps.appendChild(bS);
      /* En projet */
      var pr = d.projet, bP = el("div", "ajout-profil__bloc", null, { "data-pour": "projet" });
      bP.appendChild(champTexte("ap-nom-projet", "Nom du projet", pr.libelle));
      var ligne = el("div", "grille-champs");
      ligne.appendChild(champTexte("ap-montant-projet", "Montant du projet", F.saisie(pr.montant), "DT"));
      var hz = []; for (var a = 0; a <= 15; a++) hz.push([a, a === 0 ? "Cette année" : "Dans " + a + " an" + (a > 1 ? "s" : "")]);
      ligne.appendChild(champChoix("ap-horizon", "Quand ?", hz, 1));
      bP.appendChild(ligne);
      var candP = profil.projets.map(function (x, i) { return [i, x]; }).filter(function (x) { return x[1].type === pr.type; });
      bP.appendChild(groupeRadios("ap-dest-projet", "Dans vos projets", [["nouveau", "Ajouter un nouveau projet", null]].concat(candP.map(function (x) {
        return ["maj-" + x[0], "Mettre à jour « " + (x[1].libelle || "Projet") + " »", F.dt0(x[1].montant) + " DT"]; }))));
      corps.appendChild(bP);
      var basculer = function () { var st = valeurRadio("ap-statut"); corps.querySelectorAll("[data-pour]").forEach(function (b) { b.hidden = b.getAttribute("data-pour") !== st; }); };
      corps.addEventListener("change", basculer); basculer();
      appliquer = function () {
        var st = valeurRadio("ap-statut");
        if (st === "signe" && c) {
          var nc = Object.assign({}, c, { libelle: ($("ap-nom-credit").value || c.libelle).trim().slice(0, 60), capitalRestant: 0, moisRestants: 0 });
          var dest = valeurRadio("ap-dest-credit"), liste = profil.credits.slice();
          if (dest && dest.indexOf("maj-") === 0) liste[+dest.slice(4)] = Object.assign({}, liste[+dest.slice(4)], nc); else liste.push(nc);
          return { partiel: { credits: liste }, texte: "« " + nc.libelle + " » " + (dest && dest.indexOf("maj-") === 0 ? "mis à jour dans" : "ajouté à") + " vos crédits en cours." };
        }
        var np = { type: pr.type, libelle: ($("ap-nom-projet").value || pr.libelle).trim().slice(0, 60), montant: nombreLu("ap-montant-projet") || pr.montant, horizonAns: +$("ap-horizon").value };
        var dP = valeurRadio("ap-dest-projet"), lp = profil.projets.slice();
        if (dP && dP.indexOf("maj-") === 0) lp[+dP.slice(4)] = Object.assign({}, lp[+dP.slice(4)], np); else lp.push(np);
        return { partiel: { projets: lp }, texte: "« " + np.libelle + " » " + (dP && dP.indexOf("maj-") === 0 ? "mis à jour dans" : "ajouté à") + " vos projets." };
      };
    } else {
      $("dlg-profil-titre").textContent = "Ajouter à mes contrats d'épargne";
      if (d.motif) { E.toast(d.motif, { erreur: true }); return; }
      var mois = MOIS_NOMS.map(function (m, i) { return [i + 1, m.charAt(0).toUpperCase() + m.slice(1)]; });
      d.contrats.forEach(function (k, j) {
        var b = el("div", "ajout-profil__bloc");
        b.appendChild(el("h3", "ajout-profil__titre", (k.type === "cea" ? "CEA" : "Assurance vie") + " · " + F.dt3(k.versementMensuel) + " DT par mois"));
        var lg = el("div", "grille-champs");
        lg.appendChild(champChoix("ap-mois-" + j, "Début : mois", mois, maintenant.getMonth() + 1));
        lg.appendChild(champTexte("ap-annee-" + j, "Début : année", maintenant.getFullYear()));
        b.appendChild(lg);
        var cand = profil.contrats.map(function (x, i) { return [i, x]; }).filter(function (x) { return x[1].type === k.type; });
        b.appendChild(groupeRadios("ap-dest-" + j, "Dans vos contrats", [["nouveau", "Ouvrir un nouveau contrat", "À partir du mois indiqué ci-dessus."]].concat(cand.map(function (x) {
          return ["maj-" + x[0], "Mettre à jour « " + (x[1].libelle || "Contrat") + " »", "Versement actuel : " + F.dt3(x[1].versementMensuel) + " DT par mois ; sa date d'ouverture est conservée."]; })), cand.length === 1 ? "maj-" + cand[0][0] : "nouveau"));
        corps.appendChild(b);
      });
      appliquer = function () {
        var lc = profil.contrats.slice(), noms = [];
        d.contrats.forEach(function (k, j) {
          var dest = valeurRadio("ap-dest-" + j), an = parseInt($("ap-annee-" + j).value, 10);
          if (dest && dest.indexOf("maj-") === 0) { var i = +dest.slice(4); lc[i] = Object.assign({}, lc[i], { versementMensuel: k.versementMensuel }); noms.push((lc[i].libelle || "Contrat") + " mis à jour"); }
          else { lc.push({ type: k.type, libelle: k.libelle, versementMensuel: k.versementMensuel, moisDebut: +$("ap-mois-" + j).value, anneeDebut: an >= 1970 && an <= 2100 ? an : maintenant.getFullYear() }); noms.push(k.libelle + " ajouté"); }
        });
        return { partiel: { contrats: lc }, texte: noms.join(", ") + " dans vos contrats." };
      };
    }
    var dlg = $("dlg-profil");
    dlg.returnValue = "";
    dlg.showModal();
    dlg.addEventListener("close", function fin() {
      dlg.removeEventListener("close", fin);
      if (dlg.returnValue !== "ok") return;
      var plan = appliquer();
      var avant = { credits: profil.credits.slice(), projets: profil.projets.slice(), contrats: profil.contrats.slice() };
      majProfil(plan.partiel, { immediat: true });
      E.toast(plan.texte, { action: { libelle: "Annuler", fn: function () { majProfil(avant, { immediat: true }); E.toast("Ajout annulé : votre profil est revenu comme avant."); } } });
      puceVolante($("ajouter-profil").hidden ? $("enregistrer") : $("ajouter-profil"), doc.querySelector('.rail a[data-vue="profil"]') || doc.querySelector('.onglets-bas a[data-vue="profil"]'), "+1", MODULES[vue].couleur);
      vibrer(10);
    });
  }
  $("ajouter-profil").addEventListener("click", ajouterAuProfil);

  /* ---------- Historique du salaire : nouveau salaire et mois d'effet ---------- */
  /* « Annuler » d'un changement de salaire : seulement si l'historique n'a pas bougé depuis (les messages s'empilent). */
  function annulationSalaire(avant, message) {
    var apres = JSON.stringify(profil.historiqueSalaire);
    return { libelle: "Annuler", fn: function () {
      if (JSON.stringify(profil.historiqueSalaire) !== apres) { E.toast("Annulation impossible : l'historique du salaire a changé depuis."); return; }
      majProfil(avant, { immediat: true }); if (message) E.toast(message);
    } };
  }
  function libSalaire(h) { return F.saisie(h.montant) + " DT " + h.sens + (h.periode === "annuel" ? " par an" : " par mois"); }
  /* o : { montant, sens, periode } proposés (module Salaire), sinon le salaire actuel du profil. */
  function mettreAJourSalaire(o) {
    if (!profil) return;
    o = o || {};
    var sens = o.sens || profil.sens, periode = o.periode || profil.periode, maint = new Date();
    var hist = profil.historiqueSalaire || [], ici = OC.salaireEnVigueur(profil, maint.getFullYear(), maint.getMonth());
    $("sal-actuel").textContent = "Salaire actuel : " + libSalaire(profil) + (ici && ici.annee ? ", depuis " + MOIS_NOMS[ici.mois - 1] + " " + ici.annee : "") + ".";
    $("sal-montant-lib").textContent = "Nouveau salaire " + sens + (periode === "annuel" ? " par an" : " par mois");
    $("sal-montant").value = o.montant ? F.saisie(o.montant) : "";
    $("sal-mois").value = String(maint.getMonth() + 1);
    $("sal-annee").value = String(maint.getFullYear());
    /* Premier changement : le salaire d'avant est gardé (modifiable s'il avait déjà été remplacé à la main). */
    $("sal-avant-bloc").hidden = hist.length > 0;
    $("sal-avant-lib").textContent = "Votre salaire " + profil.sens + " avant cette date" + (profil.periode === "annuel" ? " (par an)" : " (par mois)");
    $("sal-avant").value = F.saisie(profil.montant);
    ["sal-montant-err", "sal-annee-err"].forEach(function (id) { $(id).hidden = true; });
    var dlg = $("dlg-salaire");
    function lire() {
      var m = F.lire($("sal-montant").value), an = parseInt($("sal-annee").value, 10), mo = +$("sal-mois").value, av = F.lire($("sal-avant").value);
      return { montant: m.valide && !m.vide ? m.valeur : null, annee: an, mois: mo, avant: av.valide && !av.vide ? av.valeur : profil.montant };
    }
    function effet() {
      var v = lire(), out = $("sal-effet");
      if (!(v.montant > 0)) { out.textContent = ""; return; }
      try {
        var sN = OC.salaireDe(profil, { montant: v.montant, sens: sens, periode: periode });
        /* Comparaison avec le salaire en vigueur le mois d'avant la date choisie. */
        var hAv = $("sal-avant-bloc").hidden ? (OC.salaireEnVigueur(profil, v.annee, v.mois - 2) || profil) : { montant: v.avant, sens: profil.sens, periode: profil.periode };
        var sA = OC.salaireDe(profil, hAv);
        var d = sA.brutMensuel > 0 ? sN.brutMensuel / sA.brutMensuel - 1 : 0, futur = v.annee * 12 + v.mois - 1 > maint.getFullYear() * 12 + maint.getMonth();
        out.textContent = (d >= 0 ? "+" : "−") + F.pct(Math.abs(d), 1) + " de brut : votre net passe de " + F.dt3(sA.netMensuel) + " à " + F.dt3(sN.netMensuel) + " DT par mois" +
          (futur ? ". Hausse prévue : elle s'appliquera toute seule en " + MOIS_NOMS[v.mois - 1] + " " + v.annee + "." : ".");
      } catch (e) { out.textContent = ""; }
    }
    dlg.oninput = effet; dlg.onchange = effet; effet();
    dlg.returnValue = "";
    dlg.showModal();
    $("sal-montant").focus();
    $("form-salaire").onsubmit = function (ev) {
      if (ev.submitter && ev.submitter.value !== "ok") return;
      var v = lire(), ok = true;
      $("sal-montant-err").hidden = v.montant > 0; if (!(v.montant > 0)) { $("sal-montant-err").textContent = "Indiquez le nouveau salaire."; ok = false; }
      var anOk = v.annee >= 1990 && v.annee <= 2100;
      $("sal-annee-err").hidden = anOk; if (!anOk) { $("sal-annee-err").textContent = "Année entre 1990 et 2100."; ok = false; }
      if (!ok) { ev.preventDefault(); return; }
    };
    dlg.onclose = function () {
      dlg.onclose = null;
      if (dlg.returnValue !== "ok") return;
      var v = lire(); if (!(v.montant > 0)) return;
      var avant = { historiqueSalaire: hist.slice(), montant: profil.montant, sens: profil.sens, periode: profil.periode };
      var h2 = hist.slice();
      if (!h2.length) h2.push({ montant: v.avant, sens: profil.sens, periode: profil.periode, mois: 0, annee: 0 });
      h2 = h2.filter(function (h) { return !(h.mois === v.mois && h.annee === v.annee); });
      h2.push({ montant: v.montant, sens: sens, periode: periode, mois: v.mois, annee: v.annee });
      var p2 = OC.normaliser(Object.assign({}, profil, { historiqueSalaire: h2 }));
      var ap = OC.appliquerHistorique(p2, maint).profil;
      majProfil({ historiqueSalaire: h2, montant: ap.montant, sens: ap.sens, periode: ap.periode }, { immediat: true });
      var futur = v.annee * 12 + v.mois - 1 > maint.getFullYear() * 12 + maint.getMonth();
      E.toast((futur ? "Hausse prévue en " : "Nouveau salaire enregistré depuis ") + MOIS_NOMS[v.mois - 1] + " " + v.annee + " : " + F.saisie(v.montant) + " DT " + sens + ".",
        { action: annulationSalaire(avant, "Historique du salaire revenu comme avant.") });
      vibrer(10);
    };
  }
  /* Retire une entrée de l'historique ; le salaire en vigueur est recalculé. */
  function retirerSalaire(i) {
    var hist = (profil.historiqueSalaire || []).slice(), retiree = hist[i]; if (!retiree) return;
    var avant = { historiqueSalaire: profil.historiqueSalaire.slice(), montant: profil.montant, sens: profil.sens, periode: profil.periode };
    hist.splice(i, 1);
    var partiel;
    if (hist.length === 1 && OC.cleHausse(hist[0]) < 0) partiel = { historiqueSalaire: [], montant: hist[0].montant, sens: hist[0].sens, periode: hist[0].periode };
    else { var ap = OC.appliquerHistorique(OC.normaliser(Object.assign({}, profil, { historiqueSalaire: hist })), new Date()).profil; partiel = { historiqueSalaire: hist, montant: ap.montant, sens: ap.sens, periode: ap.periode }; }
    majProfil(partiel, { immediat: true });
    E.toast("Salaire de " + (retiree.annee ? MOIS_NOMS[retiree.mois - 1] + " " + retiree.annee : "départ") + " retiré de l'historique.", { action: annulationSalaire(avant) });
  }

  /* Ouvre une simulation enregistrée dans son module. */
  function ouvrirSimulation(s) {
    var vue = OUTIL_VERS_VUE[s.outil]; if (!vue) return;
    var etat = s.parametres && s.parametres.etat;
    location.hash = "#" + vue;
    var essais = 0;
    (function charger() {
      var obj = MODULES[vue].objet();
      if (!obj || !modulesInities[vue]) { if (essais++ < 40) return setTimeout(charger, 50); return; }
      if (obj.charger(etat || "")) { simulationOuverte[vue] = { id: s.id, nom: s.nom }; $("enregistrer-lib").textContent = "Mettre à jour"; E.toast("« " + s.nom + " » ouverte."); }
      else E.toast("Cette simulation n'a pas pu être relue.", { erreur: true });
    })();
  }

  /* ---------- Navigation ---------- */
  var VUES = ["orbite", "profil", "salaire", "epargne", "credit", "simulations", "abonnement", "compte", "admin", "vie", "assistant"];
  var TITRES = { orbite: "Mon orbite", profil: "Mon profil", salaire: "Salaire", epargne: "Épargne vie & CEA", credit: "Crédit", simulations: "Simulations", abonnement: "Abonnement", compte: "Paramètres", admin: "Administration", vie: "Vie & impôts", assistant: "Assistant" };
  /* Garde d'accès (abonnement) : une vue refusée mène à la page d'abonnement. */
  var garde = null;
  function lireRoute() {
    var h = location.hash.replace(/^#/, ""), i = h.indexOf("?");
    var vue = (i === -1 ? h : h.slice(0, i)) || "orbite";
    if (VUES.indexOf(vue) === -1) vue = "orbite";
    if (garde && !garde(vue)) { vue = "abonnement"; i = -1; }
    return { vue: vue, params: new URLSearchParams(i === -1 ? "" : h.slice(i + 1)) };
  }
  /* Statistiques anonymes : un simulateur compte une fois par visite, dès la première modification. */
  var simulesCompte = {};
  function compterSimulation(m) { if (simulesCompte[m]) return; simulesCompte[m] = true; E.compterUsage("simulation", m); }
  ["salaire", "epargne", "credit"].forEach(function (m) {
    var v = $("vue-" + m);
    if (!v) return;
    v.addEventListener("input", function () { compterSimulation(m); }, true);
    v.addEventListener("change", function () { compterSimulation(m); }, true);
    v.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("button, label, [data-appliquer]")) compterSimulation(m); }, true);
  });
  /* Une simulation ouverte depuis un lien (« Simuler », conseil, simulation enregistrée) compte aussi. */
  doc.addEventListener("orbite:vue", function (e) { if (/^(salaire|epargne|credit)$/.test(e.detail.vue) && e.detail.params && e.detail.params.toString()) compterSimulation(e.detail.vue); });
  var vueAffichee = null;
  function afficher(focus) {
    var r = lireRoute();
    var changer = function () {
      doc.querySelectorAll("section.vue").forEach(function (s) { s.hidden = s.getAttribute("data-vue") !== r.vue; });
      doc.body.setAttribute("data-vue-active", r.vue);
      if (r.vue !== vueAffichee) {
        var entree = doc.querySelector('section.vue[data-vue="' + r.vue + '"]');
        if (entree) { entree.classList.add("vue--entree"); setTimeout(function () { entree.classList.remove("vue--entree"); }, 900); }
      }
      doc.querySelectorAll("a[data-vue]").forEach(function (a) {
        var vues = (a.getAttribute("data-vues") || a.getAttribute("data-vue")).split(" ");
        if (vues.indexOf(r.vue) !== -1) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      doc.title = TITRES[r.vue] + " — Orbite";
      $("barre-titre").textContent = TITRES[r.vue];
      var mod = MODULES[r.vue];
      $("barre-actions").hidden = !mod;
      $("ajouter-profil").hidden = !(r.vue === "credit" || r.vue === "epargne");
      if (mod) {
        $("enregistrer-lib").textContent = simulationOuverte[r.vue] ? "Mettre à jour" : "Enregistrer";
        var obj = mod.objet();
        if (obj && profil && !modulesInities[r.vue]) { modulesInities[r.vue] = true; if (obj.depuisProfil) obj.depuisProfil(profil); }
        if (obj && obj.afficher) obj.afficher();
      }
      doc.dispatchEvent(new CustomEvent("orbite:vue", { detail: { vue: r.vue, params: r.params } }));
      requestAnimationFrame(function () { placerPastilles($("vue-" + r.vue)); });
      if (focus) {
        window.scrollTo(0, 0);
        var h1 = doc.querySelector('section.vue[data-vue="' + r.vue + '"] h1');
        if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
      }
      if (r.vue !== vueAffichee) E.compterUsage("vue", r.vue);
      vueAffichee = r.vue;
    };
    if (vueAffichee && vueAffichee !== r.vue && doc.startViewTransition && !mouvementReduit.matches) {
      doc.documentElement.setAttribute("data-transition", VUES.indexOf(r.vue) >= VUES.indexOf(vueAffichee) ? "avant" : "arriere");
      doc.startViewTransition(changer);
    } else changer();
  }
  window.addEventListener("hashchange", function () { afficher(true); });


  /* ---------- Thème ---------- */
  function majTheme() {
    var sombre = E.themeEffectif() === "dark";
    var b = $("bascule-theme");
    b.querySelector("use").setAttribute("href", "/orbite/icones.svg#" + (sombre ? "soleil" : "lune"));
    b.setAttribute("aria-label", sombre ? "Passer au thème clair" : "Passer au thème sombre");
    doc.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute("content", sombre ? "#07090F" : "#F3F4F8"); });
    var r = doc.querySelector('#choix-theme input[value="' + (E.themeActuel() || "") + '"]');
    if (r) { r.checked = true; placerPastille($("choix-theme"), false); }
    var aide = $("theme-aide"), so = window.EFTheme && window.EFTheme.soleil && window.EFTheme.soleil();
    if (aide && so) {
      var hm = function (m) { m = Math.round(m); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); };
      aide.textContent = "Comme votre appareil, clair, sombre, ou « Soleil » : aujourd'hui à Tunis, clair de " + hm(so.lever) + " à " + hm(so.coucher) + ", sombre ensuite.";
    }
    doc.dispatchEvent(new CustomEvent("orbite:theme"));
  }
  doc.addEventListener("ef:theme", majTheme);
  function changerTheme(t) {
    var appliquer = function () { E.appliquerTheme(t); majTheme(); };
    if (doc.startViewTransition && !mouvementReduit.matches) doc.startViewTransition(appliquer); else appliquer();
  }
  $("bascule-theme").addEventListener("click", function () { changerTheme(E.themeEffectif() === "dark" ? "light" : "dark"); });
  $("choix-theme").addEventListener("change", function (e) { changerTheme(e.target.value || null); });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", majTheme);
  $("deconnexion").addEventListener("click", function () { E.deconnexion(); });

  /* ---------- Identité ---------- */
  /* « MOHAMED AZIZ » saisi en majuscules s'affiche « Mohamed Aziz ». */
  function casse(t) {
    return t && t === t.toUpperCase() && /[A-ZÀ-Þ]/.test(t) ? t.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }) : t;
  }
  function nomAffiche() {
    var meta = (utilisateur && utilisateur.user_metadata) || {};
    var complet = [(profil && profil.prenom) || "", (profil && profil.nom) || ""].map(casse).join(" ").trim();
    return complet || meta.full_name || meta.name || (utilisateur && utilisateur.email ? utilisateur.email.split("@")[0] : "");
  }
  /* Photo de profil (Google ou importée) ; initiales si absente ou illisible. */
  function peindreAvatar(el, url, initiales) {
    if (!el) return;
    el.textContent = "";
    el.classList.toggle("avatar--photo", !!url);
    if (!url) { el.textContent = initiales; return; }
    var img = new Image();
    img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function () { el.classList.remove("avatar--photo"); el.textContent = initiales; });
    img.src = url;
    el.appendChild(img);
  }
  var avatarUrl = null;
  function rafraichirAvatar() {
    if (!utilisateur) return Promise.resolve(null);
    var meta = utilisateur.user_metadata || {};
    var ini = E.initiales(meta.full_name || nomAffiche(), utilisateur.email);
    return E.avatar.source(utilisateur).then(function (url) {
      avatarUrl = url;
      doc.querySelectorAll("#avatar, #param-avatar").forEach(function (el) { peindreAvatar(el, url, ini); });
      return url;
    });
  }
  function remplirUtilisateur() {
    if (!utilisateur) return;
    var nom = nomAffiche(), meta = utilisateur.user_metadata || {};
    /* Prénom et nom saisis dans le profil ; à défaut, le nom du compte Google. */
    $("nom-utilisateur").textContent = nom;
    $("email-utilisateur").textContent = utilisateur.email || "";
    if (!$("avatar").firstChild) $("avatar").textContent = E.initiales(meta.full_name || nom, utilisateur.email);
    var heure = new Date().getHours();
    /* Le nom choisi dans « Comment Orbite doit vous appeler ? » prime sur le prénom. */
    var appel = (meta.orbite_appel || "").trim() || casse((profil && profil.prenom) || "").trim() || (nom ? nom.split(" ")[0] : "");
    $("salutation").textContent = (heure >= 18 || heure < 5 ? "Bonsoir" : "Bonjour") + (appel ? ", " + appel : "");
  }

  /* ---------- API publique ---------- */
  window.Orbite = {
    F: F,
    $: $,
    toast: function (t, o) { return E.toast(t, o); },
    mouvementReduit: mouvementReduit,
    animerNombre: animerNombre,
    mettreAJourSalaire: mettreAJourSalaire,
    retirerSalaire: retirerSalaire,
    rouler: rouler,
    vibrer: vibrer,
    puceVolante: puceVolante,
    placerPastilles: placerPastilles,
    profil: function () { return profil; },
    synthese: function () { return synthese; },
    choix: function () { return choix; },
    choisir: choisir,
    majProfil: majProfil,
    surProfil: surProfil,
    profilVierge: function () { return profilVierge; },
    utilisateur: function () { return utilisateur; },
    modifie: modifie,
    ouvrirSimulation: ouvrirSimulation,
    lireRoute: lireRoute,
    remplirUtilisateur: remplirUtilisateur,
    enregistrerModule: function (vue) { if (lireRoute().vue === vue) afficher(false); },
    definirGarde: function (fn) { garde = fn; afficher(false); },
    rafraichirAvatar: rafraichirAvatar,
    peindreAvatar: peindreAvatar,
    avatarUrl: function () { return avatarUrl; },
    definirUtilisateur: function (u) { if (u) { utilisateur = u; remplirUtilisateur(); } }
  };

  /* ---------- Démarrage ---------- */
  majTheme();
  E.exigerConnexion().then(function (u) {
    utilisateur = u;
    var p = metaProfil(u);
    profilVierge = !p;
    profil = OC.normaliser(p || {});
    /* Hausse de salaire datée arrivée à son mois : le profil passe au nouveau salaire. */
    var hs = OC.appliquerHistorique(profil, new Date());
    if (p && hs.change) {
      profil = OC.normaliser(hs.profil);
      setTimeout(function () { sauverProfil(); E.toast("Votre salaire de " + F.saisie(hs.entree.montant) + " DT " + hs.entree.sens + " s'applique depuis " + MOIS_NOMS[hs.entree.mois - 1] + " " + hs.entree.annee + " : Orbite est à jour."); }, 800);
    }
    recalculer();
    remplirUtilisateur();
    rafraichirAvatar();
    /* Page d'ouverture choisie dans les paramètres (seulement sans adresse précise). */
    var accueil = (u.user_metadata || {}).orbite_accueil;
    if (!location.hash && accueil && VUES.indexOf(accueil) !== -1 && accueil !== "orbite") history.replaceState(null, "", "#" + accueil);
    doc.body.classList.remove("attente");
    afficher(false);
    window.Orbite.pret = true;
    majReseau();
    doc.dispatchEvent(new CustomEvent("orbite:pret"));
  });
})();
