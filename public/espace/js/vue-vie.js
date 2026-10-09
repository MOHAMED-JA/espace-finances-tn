/*
 * Orbite — « Vie & impôts » (route #vie, onglet par #vie?onglet=vie|fiscal).
 * Simulateur de vie : événements ajoutés à une copie du profil, comparaison avant / après (OrbiteIntelligence).
 * Optimiseur fiscal : meilleure répartition assurance vie / CEA, montant utile avant le 31 décembre.
 * Rien n'est modifié dans le profil sans action explicite (« C'est fait : mettre mon profil à jour »), annulable.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, OI = window.OrbiteIntelligence, F = O.F, $ = O.$, doc = document;
  var evts = [], idSuivant = 1, dernier = null, compte = {};

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }
  function lire(v) { var r = F.lire(String(v == null ? "" : v)); return r.valide && !r.vide ? r.valeur : NaN; }
  function compter(cle) { if (compte[cle]) return; compte[cle] = true; E.compterUsage("simulation", cle); }

  /* ---------- Onglets ---------- */
  function ouvrirOnglet(cle, focus) {
    if (cle !== "fiscal") cle = "vie";
    ["vie", "fiscal"].forEach(function (c) {
      var t = $("vie-tab-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      $("vie-panneau-" + c).hidden = !on;
    });
    if (focus) $("vie-tab-" + cle).focus();
    if (cle === "fiscal") rendreFiscal(); else calculer();
  }
  var tabs = doc.querySelector(".vie-onglets");
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-onglet]"); if (!b) return;
    history.replaceState(null, "", "#vie?onglet=" + b.getAttribute("data-onglet"));
    ouvrirOnglet(b.getAttribute("data-onglet"));
  });
  tabs.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var cle = doc.activeElement && doc.activeElement.getAttribute("data-onglet") === "vie" ? "fiscal" : "vie";
    history.replaceState(null, "", "#vie?onglet=" + cle);
    ouvrirOnglet(cle, true);
  });

  /* ===================================================================
     Simulateur de vie
     =================================================================== */
  var MODELES = {
    mariage: { titre: "Mariage", icone: "etoile", champs: [{ k: "chefDeFamille", lib: "Je serai chef de famille", t: "case", def: true }] },
    naissance: { titre: "Naissance", icone: "plus", champs: [{ k: "nombre", lib: "Nombre d'enfants", t: "entier", def: 1, min: 1, max: 5 }] },
    immobilier: { titre: "Achat immobilier", icone: "maison", champs: [
      { k: "prix", lib: "Prix du bien", u: "DT", def: 200000 }, { k: "apport", lib: "Apport", u: "DT", def: 0 },
      { k: "dureeAns", lib: "Durée", u: "ans", def: 20, min: 1, max: 25 }, { k: "tauxPct", lib: "Taux", u: "%", def: null },
      { k: "quitterLocation", lib: "Je quitte ma location", t: "case", def: true, siLoyer: true }] },
    voiture: { titre: "Voiture", icone: "voiture", champs: [
      { k: "prix", lib: "Prix", u: "DT", def: 60000 }, { k: "apport", lib: "Apport", u: "DT", def: 0 },
      { k: "dureeAns", lib: "Durée (7 ans au plus)", u: "ans", def: 7, min: 1, max: 7 }, { k: "tauxPct", lib: "Taux", u: "%", def: null }] },
    mutation: { titre: "Mutation", icone: "retour", champs: [
      { k: "pctSalaire", lib: "Variation du salaire", u: "%", def: 0, min: -50, max: 200 }, { k: "loyer", lib: "Nouveau loyer", u: "DT", def: "" }] },
    augmentation: { titre: "Augmentation", icone: "hausse", champs: [{ k: "pct", lib: "Augmentation", u: "%", def: 10, min: -50, max: 200 }] }
  };

  function tauxDefaut(type) {
    var p = O.profil(); if (!p || !window.OrbiteCalcul) return "";
    var t = window.OrbiteCalcul.tauxNouveaux(window.OrbiteCalcul.normaliser(p))[type === "immobilier" ? "immo" : "auto"];
    return t ? t.tauxPct : "";
  }

  function ajouter(type) {
    var m = MODELES[type]; if (!m) return;
    var e = { id: idSuivant++, type: type };
    m.champs.forEach(function (c) { e[c.k] = c.k === "tauxPct" ? tauxDefaut(type) : c.def; });
    evts.push(e);
    rendreListe();
    var champ = doc.querySelector('#vie-liste [data-evt="' + e.id + '"] input');
    if (champ) champ.focus();
    calculer();
  }
  doc.querySelector(".vie-ajout").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ajout]"); if (b) ajouter(b.getAttribute("data-ajout"));
  });

  function rendreListe() {
    var ol = $("vie-liste"), p = O.profil() || {};
    ol.textContent = "";
    evts.forEach(function (e) {
      var m = MODELES[e.type], li = cree("li", "vie-evt"); li.setAttribute("data-evt", String(e.id));
      var tete = cree("div", "vie-evt__tete");
      tete.appendChild(icone(m.icone));
      tete.appendChild(cree("strong", null, m.titre));
      var x = cree("button", "bouton bouton--icone bouton--fantome bouton--petit"); x.type = "button"; x.setAttribute("data-retirer", String(e.id));
      x.setAttribute("aria-label", "Retirer : " + m.titre); x.appendChild(icone("fermer"));
      tete.appendChild(x);
      li.appendChild(tete);
      var g = cree("div", "vie-evt__champs");
      m.champs.forEach(function (c) {
        if (c.siLoyer && !(p.loyer > 0)) return;
        var id = "vie-" + e.id + "-" + c.k;
        if (c.t === "case") {
          var lab = cree("label", "vie-case"), cb = cree("input"); cb.type = "checkbox"; cb.id = id; cb.checked = !!e[c.k]; cb.setAttribute("data-k", c.k);
          lab.appendChild(cb); lab.appendChild(doc.createTextNode(" " + c.lib)); g.appendChild(lab); return;
        }
        var ch = cree("div", "champ"), l = cree("label", null, c.lib); l.htmlFor = id; ch.appendChild(l);
        var sa = cree("div", "saisie"), inp = cree("input"); inp.id = id; inp.type = "text"; inp.inputMode = c.t === "entier" ? "numeric" : "decimal"; inp.autocomplete = "off";
        inp.setAttribute("data-k", c.k); inp.value = e[c.k] === "" || e[c.k] == null ? "" : (c.u === "DT" ? F.saisie(e[c.k]) : String(e[c.k]).replace(".", ","));
        if (c.k === "loyer") inp.placeholder = String(Math.round(p.loyer || 0));
        sa.appendChild(inp);
        if (c.u) sa.appendChild(cree("span", "saisie__unite", c.u));
        ch.appendChild(sa); g.appendChild(ch);
      });
      li.appendChild(g);
      ol.appendChild(li);
    });
  }
  $("vie-liste").addEventListener("click", function (e) {
    var b = e.target.closest("[data-retirer]"); if (!b) return;
    var id = +b.getAttribute("data-retirer");
    evts = evts.filter(function (x) { return x.id !== id; });
    rendreListe(); calculer();
  });
  var minuterie = null;
  function surSaisie(e) {
    var inp = e.target, li = inp.closest("[data-evt]"); if (!li || !inp.getAttribute("data-k")) return;
    var ev = evts.filter(function (x) { return x.id === +li.getAttribute("data-evt"); })[0]; if (!ev) return;
    var k = inp.getAttribute("data-k");
    if (inp.type === "checkbox") ev[k] = inp.checked;
    else { var v = lire(inp.value); ev[k] = inp.value.trim() === "" ? (k === "loyer" ? "" : 0) : (isFinite(v) ? v : ev[k]); }
    clearTimeout(minuterie); minuterie = setTimeout(calculer, 160);
  }
  $("vie-liste").addEventListener("input", surSaisie);
  $("vie-liste").addEventListener("change", surSaisie);

  function valeur(l, v) {
    if (l.unite === "pct") return F.pct(v, 1);
    if (l.unite === "points") return String(Math.round(v));
    return F.dt0(v) + " DT";
  }
  function ecart(l) {
    if (l.sens === "egal") return "=";
    var d = l.delta, signe = d > 0 ? "+" : "−", a = Math.abs(d);
    if (l.unite === "pct") return signe + (Math.round(a * 1000) / 10).toLocaleString("fr-FR") + " pt";
    if (l.unite === "points") return signe + Math.round(a);
    return signe + F.dt0(a) + " DT";
  }

  function calculer() {
    var p = O.profil(), tb = $("vie-lignes"), table = $("vie-table"), al = $("vie-alertes");
    dernier = null;
    tb.textContent = ""; al.textContent = "";
    if (!p || !evts.length) { table.hidden = true; $("vie-appliquer").hidden = true; $("vie-resume").textContent = "Ajoutez un événement pour voir son effet."; return; }
    var r;
    try { r = OI.simulateurVie(p, evts.map(function (e) { return Object.assign({}, e, { loyer: e.loyer === "" ? null : e.loyer }); })); }
    catch (x) { if (window.console) console.error(x); return; }
    dernier = r;
    compter("vie");
    $("vie-resume").textContent = r.evenements.join(" · ");
    r.alertes.forEach(function (a) { var li = cree("li", "encart encart--alerte", a); al.appendChild(li); });
    r.lignes.forEach(function (l) {
      var tr = cree("tr", "vie-ligne vie-ligne--" + l.sens);
      tr.appendChild(cree("th", null, l.libelle)); tr.firstChild.scope = "row";
      tr.appendChild(cree("td", "chiffre", valeur(l, l.avant)));
      tr.appendChild(cree("td", "chiffre", valeur(l, l.apres)));
      var td = cree("td", "chiffre vie-ecart", ecart(l));
      if (l.sens !== "egal") td.setAttribute("aria-label", ecart(l) + (l.sens === "mieux" ? ", favorable" : ", défavorable"));
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    table.hidden = false;
    $("vie-appliquer").hidden = false;
  }

  $("vie-appliquer").addEventListener("click", function () {
    if (!dernier) return;
    var avant = JSON.parse(JSON.stringify(O.profil())), apres = dernier.profilApres;
    O.majProfil({ situation: apres.situation, chefDeFamille: apres.chefDeFamille, enfants: apres.enfants, montant: apres.montant,
      loyer: apres.loyer, credits: apres.credits, epargneDisponible: apres.epargneDisponible }, { immediat: true });
    evts = []; rendreListe(); calculer();
    O.toast("Profil mis à jour avec ces changements.", { action: { libelle: "Annuler", fn: function () { O.majProfil(avant, { immediat: true }); O.toast("Profil rétabli."); } } });
  });

  /* ===================================================================
     Optimiseur fiscal
     =================================================================== */
  var budgetSaisi = null;
  function rendreFiscal() {
    var sy = O.synthese(); if (!sy || !OI) return;
    var opt = OI.optimiseurFiscal(sy);
    $("fi-annee").textContent = String(opt.annee);
    $("fi-duree-av").textContent = String(opt.dureeAv);
    $("fi-duree-cea").textContent = String(opt.dureeCea);
    var kpi = $("fi-kpi"); kpi.textContent = "";
    [["Impôt sur le revenu", F.dt0(opt.impotAvant) + " DT", "par an, avant épargne"],
     ["Économie actuelle", F.dt0(opt.economieActuelle) + " DT", "grâce à vos contrats"],
     ["Économie maximale", F.dt0(opt.economieMax) + " DT", "plancher légal de l'impôt"],
     ["Jours restants", String(opt.joursAvantFin), "avant le 31 décembre"]].forEach(function (k) {
      var d = cree("div"); d.appendChild(cree("dt", null, k[0])); d.appendChild(cree("dd", "chiffre", k[1])); d.appendChild(cree("dd", "fiscal__sous", k[2])); kpi.appendChild(d);
    });
    var etat = $("fi-etat"), bloc = $("fi-optimum-bloc");
    etat.className = "encart" + (opt.statut === "a_optimiser" ? " encart--alerte" : " encart--succes");
    etat.textContent = opt.statut === "sans_impot" ? "Vous ne payez pas d'impôt sur le revenu : l'assurance vie reste utile pour épargner, mais elle ne réduira pas d'impôt."
      : opt.statut === "optimise" ? "Vos versements prévus profitent déjà de presque tout l'avantage fiscal possible cette année. Bravo !"
      : "Vous pouvez encore économiser " + F.dt0(opt.gainPossible) + " DT d'impôt cette année.";
    bloc.hidden = opt.statut !== "a_optimiser";
    if (opt.statut !== "a_optimiser") return;
    $("fi-opt-sous").textContent = "Pour atteindre l'économie maximale, ajoutez " + F.dt0(opt.complement.total) + " DT de versements d'ici le 31 décembre" +
      (opt.moisRestants > 1 ? " (environ " + F.dt0(opt.parMoisRestant) + " DT par mois sur " + opt.moisRestants + " mois)" : "") + ".";
    rendrePaie(opt);
    var rep = $("fi-repart"); rep.textContent = "";
    [["av", "Assurance vie", opt.complement.av], ["cea", "CEA", opt.complement.cea]].forEach(function (x) {
      var d = cree("div", "fiscal__produit fiscal__produit--" + x[0]);
      d.appendChild(cree("span", null, x[1]));
      d.appendChild(cree("strong", "chiffre", "+ " + F.dt0(x[2]) + " DT"));
      var j = cree("i", "fiscal__jauge"); j.style.setProperty("--p", (opt.complement.total > 0 ? x[2] / opt.complement.total * 100 : 0) + "%"); j.setAttribute("aria-hidden", "true");
      d.appendChild(j);
      rep.appendChild(d);
    });
    var champ = $("fi-budget");
    if (budgetSaisi == null && doc.activeElement !== champ) {
      var budgetMois = sy.epargne && sy.epargne.plafondBudget > 0 ? sy.epargne.plafondBudget : 0;
      var defaut = Math.min(opt.complement.total, Math.max(100, Math.round(budgetMois * Math.max(1, opt.moisRestants) / 10) * 10));
      champ.value = F.saisie(defaut);
    }
    resultatBudget(sy, opt);
  }
  /* Paie d'ici le 31 décembre ou déclaration annuelle : l'employeur ne peut rendre que l'impôt qui reste à retenir. */
  function rendrePaie(opt) {
    var bloc = $("fi-paie"), pa = opt.paie;
    bloc.hidden = !pa || !(opt.gainPossible > 0);
    if (bloc.hidden) return;
    var detail = pa.moisRestants + " paie" + (pa.moisRestants > 1 ? "s" : "") + (pa.primesRestantes > 0 ? " et " + String(pa.primesRestantes).replace(".", ",") + " salaire" + (pa.primesRestantes > 1 ? "s" : "") + " de prime" : "");
    var kpi = $("fi-paie-kpi"); kpi.textContent = "";
    [["Sur vos paies d'ici le 31 décembre", F.dt0(pa.recuperable) + " DT", "impôt restant à retenir sur " + detail],
     ["Via la déclaration annuelle", F.dt0(pa.declaration) + " DT", pa.declaration > 0 ? "restitution de l'impôt retenu en trop, l'an prochain" : "rien à récupérer de ce côté"]].forEach(function (k) {
      var d = cree("div"); d.appendChild(cree("dt", null, k[0])); d.appendChild(cree("dd", "chiffre", k[1])); d.appendChild(cree("dd", "fiscal__sous", k[2])); kpi.appendChild(d);
    });
    var op = opt.optimalPaie, txt = $("fi-paie-opt"), bt = $("fi-paie-utiliser");
    txt.textContent = "";
    bt.hidden = !op;
    if (op) {
      txt.appendChild(doc.createTextNode("Pour que tout l'avantage revienne sur vos paies de cette année, versez "));
      txt.appendChild(cree("strong", null, F.dt0(op.total) + " DT"));
      txt.appendChild(doc.createTextNode(" (" + [op.av ? F.dt0(op.av) + " DT en assurance vie" : "", op.cea ? F.dt0(op.cea) + " DT en CEA" : ""].filter(Boolean).join(" et ") + ") : environ "));
      txt.appendChild(cree("strong", null, F.dt0(op.gain) + " DT d'impôt en moins"));
      txt.appendChild(doc.createTextNode(" d'ici décembre. Au-delà, l'économie supplémentaire passe par la déclaration annuelle."));
      bt.onclick = function () { $("fi-budget").value = F.saisie(op.total); budgetSaisi = $("fi-budget").value; var sy = O.synthese(); if (sy) resultatBudget(sy, OI.optimiseurFiscal(sy)); };
    } else txt.textContent = "Tout l'avantage fiscal restant peut revenir sur vos paies d'ici le 31 décembre.";
  }
  function resultatBudget(sy, opt) {
    var b = lire($("fi-budget").value), res = $("fi-budget-res"), lien = $("fi-simuler");
    if (!(b > 0)) { res.textContent = "Indiquez un montant."; return; }
    var o = b >= opt.complement.total ? { av: opt.complement.av, cea: opt.complement.cea, gain: opt.gainPossible, economie: opt.economieMax } : OI.optimiseurFiscal(sy, { budgetAnnuel: b }).avecBudget;
    if (!o) { res.textContent = ""; return; }
    res.textContent = "Avec " + F.dt0(b) + " DT : " + (o.av ? F.dt0(o.av) + " DT en assurance vie" : "") + (o.av && o.cea ? " et " : "") + (o.cea ? F.dt0(o.cea) + " DT en CEA" : "") +
      " → " + F.dt0(o.gain) + " DT d'impôt en moins (" + Math.round(o.gain / b * 100) + " % de ce que vous versez)" +
      (opt.paie ? (function () { var pp = Math.min(o.gain, opt.paie.impotRestant), dd = Math.max(0, o.gain - pp);
        return " : " + F.dt0(pp) + " DT sur vos paies d'ici décembre" + (dd > 0.5 ? " et " + F.dt0(dd) + " DT via la déclaration annuelle." : "."); })() : ".");
    var mois = Math.max(1, opt.moisRestants);
    lien.href = "#epargne?versement=" + Math.max(10, Math.round(b / mois / 10) * 10);
  }
  $("fi-budget").addEventListener("input", function () {
    budgetSaisi = this.value; compter("fiscal");
    var sy = O.synthese(); if (sy) resultatBudget(sy, OI.optimiseurFiscal(sy));
  });

  /* ---------- Navigation ---------- */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "vie") return;
    ouvrirOnglet(e.detail.params.get("onglet") || (!$("vie-panneau-fiscal").hidden ? "fiscal" : "vie"));
  });
  O.surProfil(function () {
    if ($("vue-vie").hidden) return;
    if (!$("vie-panneau-fiscal").hidden) rendreFiscal(); else calculer();
  });
})();
