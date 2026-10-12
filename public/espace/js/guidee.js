/*
 * Orbite — simulation guidée (Lot 2, choix validé le 12 oct. 2026 : dans les modules Crédit, Salaire et Épargne).
 * Une question à la fois, des réponses toutes prêtes (avec « autre montant » quand il le faut), puis le résultat.
 * Les réponses remplissent le module par ses propres fonctions (charger) : le détail reste modifiable,
 * et l'état d'avant est gardé dans l'historique (Ctrl Z le rétablit).
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var $ = O.$, dlg = $("dlg-guidee");
  if (!dlg || !dlg.showModal) return;
  var M = window.EFModele, OC = window.OrbiteCalcul, F = O.F;
  var MODULES = { salaire: "ModuleSalaire", credit: "ModuleCredit", epargne: "ModuleEpargne" };
  var NOMS = { salaire: "Salaire", credit: "Crédit", epargne: "Épargne vie & CEA" };
  var MARGE = { immo: 2.5, auto: 3, conso: 3.5 };
  var EXEMPLE = { immo: 150000, auto: 40000, conso: 15000 };
  var DUREES = { immo: [10, 15, 20, 25], auto: [3, 5, 7], conso: [2, 3, 5, 7] };

  function nb(v) { return F && F.dt0 ? F.dt0(v) : String(Math.round(v)); }
  function pct(v) { return String(Math.round(v * 100) / 100).replace(".", ",") + " %"; }
  function lireMontant(t) {
    var n = Number(String(t).replace(/[\s  ]/g, "").replace(",", "."));
    return isFinite(n) ? n : NaN;
  }

  /* ---------- Les questions de chaque module ---------- */
  var PARCOURS = {
    credit: {
      depart: function () { return { type: "immo", ans: 20, taux: "habituel" }; },
      etapes: [
        { cle: "type", q: "Que voulez-vous financer ?", aide: "Le type de crédit fixe la durée possible et la marge habituelle des banques.", genre: "choix",
          options: function () { return [{ v: "immo", lib: "Un logement", sous: "Achat, construction : jusqu'à 25 ans" }, { v: "auto", lib: "Une voiture", sous: "Jusqu'à 7 ans" }, { v: "conso", lib: "Un autre achat", sous: "Crédit à la consommation : jusqu'à 7 ans" }]; },
          apres: function (r) { if (DUREES[r.type].indexOf(r.ans) === -1) r.ans = DUREES[r.type][DUREES[r.type].length - 2]; if (!r.montantSaisi) r.montant = EXEMPLE[r.type]; } },
        { cle: "montant", q: "Combien voulez-vous emprunter ?", aide: "Le montant prêté par la banque, apport déduit. Vous pourrez l'ajuster ensuite.", genre: "montant", unite: "DT", min: 1000, max: 5e6,
          defaut: function (r) { return r.montant || EXEMPLE[r.type]; }, apres: function (r) { r.montantSaisi = true; } },
        { cle: "ans", q: "Sur combien d'années ?", aide: "Plus long : mensualité plus petite, mais intérêts plus élevés.", genre: "choix",
          options: function (r) { return DUREES[r.type].map(function (a) { return { v: a, lib: a + " ans", sous: a * 12 + " mensualités" }; }); } },
        { cle: "taux", q: "Quel taux vous propose la banque ?", aide: "Pas encore d'offre ? Prenez le taux habituel : vous comparerez ensuite.", genre: "choix",
          options: function (r) { return [{ v: "habituel", lib: "Taux habituel : " + pct(OC.TMM + MARGE[r.type]), sous: "TMM " + pct(OC.TMM) + " + marge courante de " + pct(MARGE[r.type]) }, { v: "fixe", lib: "J'ai un taux", sous: "Taux fixe annuel indiqué par la banque" }]; } },
        { cle: "tauxFixe", si: function (r) { return r.taux === "fixe"; }, q: "Quel est ce taux ?", aide: "Le taux annuel, hors assurance.", genre: "montant", unite: "%", min: 0.1, max: 30,
          defaut: function (r) { return r.tauxFixe || Math.round((OC.TMM + MARGE[r.type]) * 10) / 10; } }
      ],
      appliquer: function (r) {
        var e = { type: r.type, capital: r.montant, mois: r.ans * 12, periodicite: 1, amort: "constant" };
        if (r.taux === "fixe") e.taux = r.tauxFixe;
        else { e.tmm = { tmm: OC.TMM, marge: MARGE[r.type] }; e.taux = OC.TMM + MARGE[r.type]; }
        return window.ModuleCredit.charger(window.MoteurCredit.encoderLien(e, {}));
      }
    },
    salaire: {
      depart: function () {
        var d = window.EtatSimulation.decoder(window.ModuleSalaire.etat()).a || {};
        return { sens: d.sens === "net" ? "net" : "brut", montant: d.montant > 0 ? d.montant : 2500, secteur: d.secteur === "public" ? "public" : "prive",
          famille: d.chefDeFamille ? 1 + Math.min(4, d.enfants || 0) : 0 };
      },
      etapes: [
        { cle: "sens", q: "Quel salaire connaissez-vous ?", aide: "Le brut est sur le contrat ; le net est ce qui arrive sur le compte.", genre: "choix",
          options: function () { return [{ v: "brut", lib: "Mon brut", sous: "Je veux savoir combien je toucherai" }, { v: "net", lib: "Mon net", sous: "Je veux connaître le brut correspondant" }]; } },
        { cle: "montant", q: function (r) { return r.sens === "net" ? "Quel est votre net par mois ?" : "Quel est votre brut par mois ?"; }, aide: "Le salaire d'un mois habituel, sans les primes.", genre: "montant", unite: "DT", min: 100, max: 1e6,
          defaut: function (r) { return r.montant; } },
        { cle: "secteur", q: "Où travaillez-vous ?", aide: "La caisse de sécurité sociale change les cotisations.", genre: "choix",
          options: function () { return [{ v: "prive", lib: "Secteur privé", sous: "Cotisations CNSS" }, { v: "public", lib: "Secteur public", sous: "Cotisations CNRPS" }]; } },
        { cle: "famille", q: "Votre situation de famille ?", aide: "Le chef de famille a droit à des déductions sur l'impôt, et à une déduction par enfant à charge (4 au plus).", genre: "choix",
          options: function () { return [{ v: 0, lib: "Célibataire, ou pas chef de famille" }, { v: 1, lib: "Chef de famille, sans enfant à charge" }, { v: 2, lib: "Chef de famille, 1 enfant" }, { v: 3, lib: "Chef de famille, 2 enfants" }, { v: 4, lib: "Chef de famille, 3 enfants" }, { v: 5, lib: "Chef de famille, 4 enfants ou plus" }]; } }
      ],
      appliquer: function (r) {
        var ES = window.EtatSimulation, d = ES.decoder(window.ModuleSalaire.etat());
        var a = Object.assign({}, d.a, { sens: r.sens, montant: r.montant, periode: "mensuel", secteur: r.secteur, chefDeFamille: r.famille > 0, enfants: Math.max(0, r.famille - 1) });
        return window.ModuleSalaire.charger(ES.encoder(a, d.b || null));
      }
    },
    epargne: {
      depart: function () {
        var PA = window.Partage, t = window.ModuleEpargne.etat(), e = PA.decoder(t), f = { Mensuel: 1, Trimestriel: 1 / 3, Semestriel: 1 / 6, Annuel: 1 / 12 }[e.frequence] || 1;
        var mode = (/(?:^|&)Xp=(av|cea|ac)/.exec(t) || [])[1] || "av";
        return { objectif: mode, av: Math.round((e.versement || 200) * f) || 200, cea: Math.round((e.versementCea || 100) * f) || 100, ans: e.dureeAns || 10 };
      },
      etapes: [
        { cle: "objectif", q: "Quel est votre objectif ?", aide: "Les deux placements réduisent l'impôt sur le revenu ; leurs règles diffèrent.", genre: "choix",
          options: function () { return [{ v: "av", lib: "Préparer l'avenir", sous: "Assurance vie : capital pour un projet, la retraite, la famille" }, { v: "cea", lib: "Réduire mon impôt", sous: "CEA : épargne bloquée 5 ans, déduction plus forte" }, { v: "ac", lib: "Les deux", sous: "Assurance vie et CEA" }]; } },
        { cle: "av", si: function (r) { return r.objectif !== "cea"; }, q: "Combien sur l'assurance vie, chaque mois ?", aide: "Un montant que vous pourrez tenir dans la durée.", genre: "montant", unite: "DT", min: 10, max: 1e5,
          defaut: function (r) { return r.av; } },
        { cle: "cea", si: function (r) { return r.objectif !== "av"; }, q: "Combien sur le CEA, chaque mois ?", aide: "Le dépôt utile au CEA est plafonné : Orbite vous le montre ensuite.", genre: "montant", unite: "DT", min: 10, max: 1e5,
          defaut: function (r) { return r.cea; } },
        { cle: "ans", si: function (r) { return r.objectif !== "cea"; }, q: "Pendant combien d'années ?", aide: "Au moins 10 ans pour garder l'avantage fiscal de l'assurance vie.", genre: "choix",
          options: function () { return [5, 8, 10, 15, 20, 25].map(function (a) { return { v: a, lib: a + " ans", sous: a < 10 ? "Moins de 10 ans : l'avantage fiscal peut être repris" : "" }; }); } }
      ],
      appliquer: function (r) {
        var PA = window.Partage, t = window.ModuleEpargne.etat(), e = PA.decoder(t);
        e.frequence = "Mensuel";
        e.versement = r.objectif === "cea" ? 0 : r.av;
        e.versementCea = r.objectif === "av" ? 0 : r.cea;
        if (r.objectif !== "cea") e.dureeAns = r.ans;
        var extra = t.split("&").filter(function (p) { return /^X[cs]=/.test(p); }).join("&");
        return window.ModuleEpargne.charger(PA.encoder(e) + "&Xp=" + r.objectif + (extra ? "&" + extra : ""));
      }
    }
  };

  /* ---------- Déroulé ---------- */
  var cours = null; /* { vue, r, pile: [index d'étape], fini } */

  function etapesActives() { var P = PARCOURS[cours.vue]; return P.etapes.filter(function (e) { return !e.si || e.si(cours.r); }); }
  function etapeCourante() { return cours.pile.length ? PARCOURS[cours.vue].etapes[cours.pile[cours.pile.length - 1]] : null; }
  function texte(x) { return typeof x === "function" ? x(cours.r) : x; }
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function points() {
    var ol = $("guidee-points"), act = etapesActives(), courante = etapeCourante(), n = act.length + 1;
    ol.textContent = "";
    var pos = cours.fini ? n - 1 : Math.max(0, act.indexOf(courante));
    for (var i = 0; i < n; i++) { var li = cree("li"); if (i < pos) li.className = "fait"; if (i === pos) li.className = "ici"; ol.appendChild(li); }
    $("guidee-progression").textContent = cours.fini ? "Résultat" : "Question " + (pos + 1) + " sur " + act.length;
  }

  function rendre() {
    var e = etapeCourante(), rep = $("guidee-reponse"), err = $("guidee-erreur");
    err.hidden = true; rep.textContent = "";
    dlg.setAttribute("data-teinte", cours.vue);
    $("guidee-module").textContent = "Simulation guidée · " + NOMS[cours.vue];
    $("guidee-retour").hidden = cours.pile.length <= 1 && !cours.fini;
    $("guidee-suivant").hidden = false;
    points();
    if (cours.fini) { rendreResultat(); return; }
    $("guidee-question").textContent = texte(e.q);
    $("guidee-aide").textContent = texte(e.aide) || "";
    $("guidee-suivant").textContent = suivanteIndex() === -1 ? "Voir le résultat" : "Suivant";
    if (e.genre === "choix") {
      var liste = cree("div", "guidee__choix"); liste.setAttribute("role", "radiogroup"); liste.setAttribute("aria-labelledby", "guidee-question");
      e.options(cours.r).forEach(function (o, i) {
        var l = cree("label", "guidee__option"), inp = cree("input"), t = cree("span", "guidee__option-texte");
        inp.type = "radio"; inp.name = "guidee-choix"; inp.value = String(o.v);
        inp.checked = String(cours.r[e.cle]) === String(o.v) || (cours.r[e.cle] == null && i === 0);
        t.appendChild(cree("b", null, o.lib));
        if (o.sous) t.appendChild(cree("small", null, o.sous));
        l.appendChild(inp); l.appendChild(t); liste.appendChild(l);
        /* Un choix au clic avance tout de suite (clavier : flèches puis Entrée). */
        l.addEventListener("click", function (ev) { if (ev.detail > 0) setTimeout(suivant, 120); });
      });
      rep.appendChild(liste);
    } else {
      var champ = cree("div", "saisie saisie--grande guidee__saisie"), inp2 = cree("input"), u = cree("span", "saisie__unite", e.unite);
      inp2.id = "guidee-montant"; inp2.type = "text"; inp2.inputMode = "decimal"; inp2.autocomplete = "off";
      inp2.setAttribute("aria-labelledby", "guidee-question"); inp2.setAttribute("aria-describedby", "guidee-aide guidee-erreur");
      var dv = e.defaut(cours.r);
      inp2.value = e.unite === "%" ? String(dv).replace(".", ",") : nb(dv);
      champ.appendChild(inp2); champ.appendChild(u); rep.appendChild(champ);
    }
    requestAnimationFrame(function () {
      var f = rep.querySelector("input:checked") || rep.querySelector("input");
      if (f) { f.focus(); if (f.select && f.type === "text") f.select(); }
    });
  }

  function lireReponse() {
    var e = etapeCourante(), err = $("guidee-erreur");
    if (e.genre === "choix") {
      var c = $("guidee-reponse").querySelector("input:checked");
      if (!c) return false;
      var opt = e.options(cours.r).filter(function (o) { return String(o.v) === c.value; })[0];
      cours.r[e.cle] = opt.v;
    } else {
      var v = lireMontant($("guidee-montant").value);
      if (!(v >= e.min && v <= e.max)) {
        err.textContent = isFinite(v) ? "Indiquez une valeur entre " + nb(e.min) + " et " + nb(e.max) + " " + e.unite + "." : "Écrivez un nombre, par exemple " + (e.unite === "%" ? "9,5" : "2 500") + ".";
        err.hidden = false; $("guidee-montant").setAttribute("aria-invalid", "true"); $("guidee-montant").focus();
        return false;
      }
      cours.r[e.cle] = v;
    }
    if (e.apres) e.apres(cours.r);
    return true;
  }
  function suivanteIndex() {
    var P = PARCOURS[cours.vue], i = cours.pile[cours.pile.length - 1] + 1;
    while (i < P.etapes.length && P.etapes[i].si && !P.etapes[i].si(cours.r)) i++;
    return i < P.etapes.length ? i : -1;
  }
  function suivant() {
    if (cours.fini) { dlg.close(); return; }
    if (!lireReponse()) return;
    var j = suivanteIndex();
    if (j === -1) { terminer(); return; }
    cours.pile.push(j);
    rendre();
    $("guidee-question").focus();
  }
  function retour() {
    if (cours.fini) { cours.fini = false; rendre(); return; }
    if (cours.pile.length > 1) { cours.pile.pop(); rendre(); }
  }

  function terminer() {
    if (window.OrbiteHistorique) window.OrbiteHistorique.avant(cours.vue);
    var ok = false;
    try { ok = PARCOURS[cours.vue].appliquer(cours.r); } catch (e) { ok = false; }
    if (!ok) { var err = $("guidee-erreur"); err.textContent = "La simulation n'a pas pu être remplie. Vérifiez vos réponses."; err.hidden = false; return; }
    if (O.detacherSimulation) O.detacherSimulation(cours.vue);
    cours.fini = true;
    rendre();
  }
  function rendreResultat() {
    var mod = window[MODULES[cours.vue]], res = null;
    try { res = mod.resume(); } catch (e) { res = null; }
    $("guidee-question").textContent = "Votre résultat";
    $("guidee-aide").textContent = "Le module est rempli avec vos réponses : tout le détail est modifiable. Ctrl Z revient à la simulation d'avant.";
    $("guidee-suivant").textContent = "Voir le détail";
    var rep = $("guidee-reponse"), carte = cree("div", "guidee__resultat");
    if (res && res.principal) {
      carte.appendChild(cree("p", "guidee__resultat-lib", res.principal.libelle));
      carte.appendChild(cree("p", "guidee__resultat-val", M.formaterIndicateur(res.principal)));
      var ul = cree("ul", "guidee__resultat-liste");
      (res.secondaires || []).forEach(function (x) { var li = cree("li"); li.appendChild(cree("span", null, x.libelle)); li.appendChild(cree("b", null, M.formaterIndicateur(x))); ul.appendChild(li); });
      carte.appendChild(ul);
    } else carte.appendChild(cree("p", null, "Le résultat est affiché dans le module."));
    rep.appendChild(carte);
    requestAnimationFrame(function () { $("guidee-suivant").focus(); });
  }

  function ouvrir(vue) {
    vue = vue || (O.lireRoute && O.lireRoute().vue);
    if (!PARCOURS[vue] || !window[MODULES[vue]]) return;
    var r;
    try { r = PARCOURS[vue].depart(); } catch (e) { r = {}; }
    cours = { vue: vue, r: r, pile: [0], fini: false };
    rendre();
    dlg.showModal();
  }

  $("guidee-suivant").addEventListener("click", suivant);
  $("guidee-retour").addEventListener("click", retour);
  $("guidee-form").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.isComposing && e.target.tagName !== "BUTTON") { e.preventDefault(); suivant(); }
  });
  dlg.addEventListener("close", function () {
    var fini = cours && cours.fini, vue = cours && cours.vue;
    cours = null;
    if (fini) {
      var racine = $(vue + "-racine") || $("vue-" + vue);
      if (racine && racine.scrollIntoView) racine.scrollIntoView({ behavior: O.mouvementReduit && O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
    }
  });
  doc.querySelectorAll("[data-guidee]").forEach(function (b) { b.addEventListener("click", function () { ouvrir(b.getAttribute("data-guidee")); }); });
  window.OrbiteGuidee = { ouvrir: ouvrir };
})();
