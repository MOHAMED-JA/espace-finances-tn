/*
 * Orbite — « Vie & impôts » (route #vie, onglet par #vie?onglet=vie|fiscal|scenarios|decider ; « Et si… » : vue-scenarios.js ;
 * « Décider » : vue-decider.js).
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
    if (ONGLETS.indexOf(cle) === -1) cle = "vie";
    ONGLETS.forEach(function (c) {
      var t = $("vie-tab-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      $("vie-panneau-" + c).hidden = !on;
    });
    if (focus) $("vie-tab-" + cle).focus();
    if (cle === "fiscal") rendreFiscal(); else if (cle === "vie") calculer();
    else if (cle === "decider") doc.dispatchEvent(new CustomEvent("orbite:decider"));
    else doc.dispatchEvent(new CustomEvent("orbite:etsi"));
  }
  var ONGLETS = ["vie", "fiscal", "scenarios", "decider"];
  var tabs = doc.querySelector(".vie-onglets");
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-onglet]"); if (!b) return;
    history.replaceState(null, "", "#vie?onglet=" + b.getAttribute("data-onglet"));
    ouvrirOnglet(b.getAttribute("data-onglet"));
  });
  tabs.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var i = ONGLETS.indexOf(doc.activeElement && doc.activeElement.getAttribute("data-onglet"));
    var cle = ONGLETS[(Math.max(0, i) + (e.key === "ArrowRight" ? 1 : ONGLETS.length - 1)) % ONGLETS.length];
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
    rendrePlan(sy, opt);
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
    $("fi-simuler").href = "#epargne?av=" + Math.round(opt.complement.av) + "&cea=" + Math.round(opt.complement.cea);
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
    /* Détail du calcul de l'impôt restant. */
    var d = pa.detail, ol = $("fi-paie-calcul"); ol.textContent = "";
    if (d) {
      function etape(t) { ol.appendChild(cree("li", null, t)); }
      etape("Impôt de l'année retenu sur vos paies : " + F.dt3(d.impotAn) + " DT (impôt sur le revenu et contribution de solidarité).");
      if (d.moisParMois) etape("Votre salaire change dans l'année : chaque paie restante retient l'impôt au salaire de son mois, soit " + F.dt3(d.avantPart) + " DT d'ici le 31 décembre.");
      else {
        etape(pa.moisRestants + " paie" + (pa.moisRestants > 1 ? "s" : "") + " restante" + (pa.moisRestants > 1 ? "s" : "") + " × " + F.dt3(d.impotMois) + " DT = " + F.dt3(pa.moisRestants * d.impotMois) + " DT.");
        if (pa.primesRestantes > 0) etape(String(pa.primesRestantes).replace(".", ",") + " salaire" + (pa.primesRestantes > 1 ? "s" : "") + " de prime × " + F.dt3(d.impotParVersement) + " DT = " + F.dt3(pa.primesRestantes * d.impotParVersement) + " DT (une prime s'ajoute à vos autres revenus : elle est imposée au taux le plus haut de votre barème).");
        etape("Total encore à retenir : " + F.dt3(d.avantPart) + " DT.");
      }
      if (d.appliquee) etape("Moins la part déjà couverte par vos contrats en cours (" + F.dt0(d.ecoActuelle) + " DT d'économie par an, soit " + F.pct(d.part, 1) + " de votre impôt) : " + F.dt3(d.avantPart) + " × (1 − " + F.pct(d.part, 1) + ") = " + F.dt3(pa.impotRestant) + " DT.");
      else if (d.contrats) etape("Votre employeur ne tient pas compte de vos contrats en cours : rien n'est déduit, l'impôt restant reste " + F.dt3(pa.impotRestant) + " DT.");
      etape("Votre employeur ne peut pas rendre plus que cet impôt restant : c'est le maximum récupérable sur vos paies cette année ; le reste passe par la déclaration annuelle.");
      $("fi-paie-employeur").hidden = !d.contrats;
      var v = O.profil().avPaie === false ? "non" : "oui";
      doc.querySelectorAll('input[name="fi-av-paie"]').forEach(function (r) { r.checked = r.value === v; });
      if (d.contrats && $("fi-paie-detail").open) O.placerPastilles($("fi-paie-employeur"));
    }
    var op = opt.optimalPaie, txt = $("fi-paie-opt");
    txt.textContent = "";
    if (op) {
      txt.appendChild(doc.createTextNode("Pour que tout l'avantage revienne sur vos paies de cette année, versez "));
      txt.appendChild(cree("strong", null, F.dt0(op.total) + " DT"));
      txt.appendChild(doc.createTextNode(" (" + [op.av ? F.dt0(op.av) + " DT en assurance vie" : "", op.cea ? F.dt0(op.cea) + " DT en CEA" : ""].filter(Boolean).join(" et ") + ") : environ "));
      txt.appendChild(cree("strong", null, F.dt0(op.gain) + " DT d'impôt en moins"));
      txt.appendChild(doc.createTextNode(" d'ici décembre. Au-delà, l'économie supplémentaire passe par la déclaration annuelle."));
    } else txt.textContent = "Tout l'avantage fiscal restant peut revenir sur vos paies d'ici le 31 décembre.";
  }
  /* ===================================================================
     Mon plan de versement (14 oct. 2026) : ce que la situation permet de verser d'ici le 31 décembre,
     réparti entre assurance vie et CEA selon un pourcentage choisi, et le calendrier des versements.
     Les curseurs recalculent en direct ; le réglage est gardé dans le profil quand on le lâche.
     =================================================================== */
  var MOIS_PLAN = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var planEssai = null, dernierPlan = null, dernierFiscal = null;
  function reglagesPlan() { return Object.assign({}, O.profil().planVersement || {}, planEssai || {}); }
  function dateCourte(d) {
    var a = new Date();
    return d.getFullYear() === a.getFullYear() && d.getMonth() === a.getMonth() && d.getDate() === a.getDate() ? "Aujourd'hui" : d.getDate() + " " + MOIS_PLAN[d.getMonth()];
  }
  function pctEntier(v) { return Math.round(v * 100) + " %"; }
  function curseur(id, v) { var c = $(id); if (doc.activeElement !== c) c.value = String(Math.round(v * 100)); c.style.setProperty("--p", c.value + "%"); }
  function rendrePlan(sy, opt) {
    var sec = $("fi-plan");
    sec.hidden = opt.statut !== "a_optimiser";
    dernierFiscal = { sy: sy, opt: opt };
    if (sec.hidden) { dernierPlan = null; return; }
    var r = OI.planVersement(sy, reglagesPlan(), { optimiseur: opt, maintenant: sy.maintenant });
    dernierPlan = r;
    $("fi-plan-annee").textContent = String(r.annee);
    $("fi-plan-total").textContent = F.dt0(r.versement) + " DT";
    $("fi-plan-sur").textContent = "sur " + F.dt0(r.besoin) + " DT qui donneraient l'économie maximale (" + F.dt0(r.economieMax) + " DT d'impôt en moins)";
    var base = Math.max(1, r.besoin);
    $("fi-plan-p-av").style.setProperty("--l", Math.min(100, r.av / base * 100) + "%");
    $("fi-plan-p-cea").style.setProperty("--l", Math.min(100, r.cea / base * 100) + "%");
    var leg = $("fi-plan-legende"); leg.textContent = "";
    [["av", "Assurance vie " + F.dt0(r.av) + " DT"], ["cea", "CEA " + F.dt0(r.cea) + " DT"], ["reste", "Reste possible " + F.dt0(Math.max(0, r.besoin - r.versement)) + " DT"]].forEach(function (x) {
      var li = cree("li", "plan__legende-" + x[0]); li.appendChild(cree("i", null)); li.appendChild(doc.createTextNode(x[1])); leg.appendChild(li);
    });

    /* 1. Sources */
    var mg = r.marge;
    $("fi-plan-marge-mt").textContent = F.dt0(mg.total) + " DT";
    $("fi-plan-marge-txt").textContent = mg.libre < 10
      ? (mg.source === "budget" ? "Votre budget du mois répartit déjà tout votre salaire : il ne reste rien chaque mois. Les primes et l'épargne restent possibles."
        : "Après crédits, logement et contrats, il ne reste rien chaque mois.")
      : "Il vous reste " + F.dt0(mg.libre) + " DT par mois après crédits, logement, contrats et dépenses de vie (" +
        (mg.source === "budget" ? "selon votre budget du mois" : "estimées à la moitié du reste, faute de budget du mois") + "). J'en verse " + pctEntier(mg.part) +
        " : " + F.dt0(mg.mensuel) + " DT × " + mg.mois + " mois.";
    $("fi-plan-marge").disabled = mg.libre < 10;
    curseur("fi-plan-marge", mg.part);
    var pr = r.primes, blocP = $("fi-plan-primes-bloc");
    blocP.hidden = !pr.liste.length;
    if (pr.liste.length) {
      var netP = pr.liste.reduce(function (t, x) { return t + x.net; }, 0);
      $("fi-plan-primes-mt").textContent = F.dt0(pr.total) + " DT";
      $("fi-plan-primes-txt").textContent = (pr.liste.length > 1 ? "Primes de " + pr.liste.map(function (x) { return MOIS_PLAN[x.mois]; }).join(" et ") : "Prime de " + MOIS_PLAN[pr.liste[0].mois]) +
        " : environ " + F.dt0(netP) + " DT net, versés le " + pr.liste.map(function (x) { return dateCourte(x.date); }).join(" et le ") + ". J'en place " + pctEntier(pr.part) + ".";
      curseur("fi-plan-primes", pr.part);
    }
    var ep = r.epargne;
    $("fi-plan-ep-mt").textContent = F.dt0(ep.utilisable) + " DT";
    $("fi-plan-ep-txt").textContent = ep.disponible > 0 ? F.dt0(ep.disponible) + " DT sur vos comptes, moins la réserve que vous gardez." : "Aucune épargne disponible déclarée dans votre profil.";
    var res = $("fi-plan-reserve");
    res.placeholder = F.saisie(ep.reserveConseillee);
    if (doc.activeElement !== res) res.value = r.reglages.reserve === null ? "" : F.saisie(ep.reserve);
    $("fi-plan-abordable").textContent = F.dt0(r.abordable) + " DT";
    $("fi-plan-garde").textContent = "Réserve conseillée : 3 mois de dépenses (" + F.dt0(ep.reserveConseillee) + " DT), gardée si le champ est vide." +
      (r.surplus > 0.5 ? " Au-delà de " + F.dt0(r.besoin) + " DT, un versement de plus ne baisse plus l'impôt cette année : " + F.dt0(r.surplus) + " DT restent libres." : "");

    /* 2. Répartition */
    var choix = r.reglages.partAv === null ? "conseil" : Math.abs(r.reglages.partAv - 0.7) < 0.001 ? "70" : Math.abs(r.reglages.partAv - 0.5) < 0.001 ? "50" : "perso";
    $("fi-plan-conseil-pct").textContent = Math.round(r.conseille.partAv * 100) + " / " + (100 - Math.round(r.conseille.partAv * 100));
    doc.querySelectorAll("#fi-plan-puces [data-part]").forEach(function (b) {
      var on = b.getAttribute("data-part") === choix; b.classList.toggle("plan__puce--on", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    });
    curseur("fi-plan-av", r.partAv);
    $("fi-plan-av-pct").textContent = pctEntier(r.partAv); $("fi-plan-cea-pct").textContent = pctEntier(1 - r.partAv);
    $("fi-plan-av-mt").textContent = F.dt0(r.av) + " DT"; $("fi-plan-cea-mt").textContent = F.dt0(r.cea) + " DT";
    $("fi-plan-av-txt").textContent = r.dureeAv + " ans au moins pour garder l'avantage · capital selon le contrat";
    $("fi-plan-cea-txt").textContent = "Bloqué " + r.dureeCea + " ans · placé en bourse, le capital peut baisser";
    $("fi-plan-gain").textContent = F.dt0(r.gain) + " DT"; $("fi-plan-cout").textContent = F.dt0(r.coutReel) + " DT"; $("fi-plan-taux").textContent = pctEntier(r.taux);
    var pa = $("fi-plan-paie");
    pa.hidden = !r.paie || !(r.gain > 0.5);
    if (!pa.hidden) pa.textContent = r.paie.declaration > 0.5
      ? F.dt0(r.paie.surPaie) + " DT reviennent sur vos paies d'ici décembre et " + F.dt0(r.paie.declaration) + " DT via la déclaration annuelle, l'an prochain."
      : "Tout l'avantage revient sur vos paies d'ici décembre : rien à attendre de la déclaration annuelle.";
    var al = $("fi-plan-alerte");
    al.hidden = !(r.perte > 1);
    if (!al.hidden) {
      al.textContent = "";
      al.appendChild(cree("b", null, "Cette répartition fait perdre " + F.dt0(r.perte) + " DT d'économie"));
      al.appendChild(doc.createTextNode((r.ceaUtile ? "Au-delà de " + F.dt0(r.ceaUtile) + " DT en CEA, l'impôt ne baisse plus (il ne descend pas sous " + pctEntier(r.plancherCea) + " de l'impôt de départ). " : "") +
        "Passez le reste en assurance vie, ou choisissez « Conseillé »."));
    }

    /* 3. Calendrier */
    var ol = $("fi-plan-cal"); ol.textContent = "";
    var LIB = { epargne: "Épargne disponible", marge: "Marge du mois", prime: "Part de la prime" };
    r.calendrier.forEach(function (c) {
      var li = cree("li", c.date.getMonth() === 11 && c.date.getDate() >= 20 ? "plan__cal-fin" : null);
      var t = cree("time", null, dateCourte(c.date)); t.setAttribute("datetime", c.date.getFullYear() + "-" + String(c.date.getMonth() + 1).padStart(2, "0") + "-" + String(c.date.getDate()).padStart(2, "0"));
      li.appendChild(t); li.appendChild(cree("strong", "chiffre", F.dt0(c.montant) + " DT"));
      li.appendChild(cree("small", null, [c.av > 0.5 ? "Assurance vie " + F.dt0(c.av) : "", c.cea > 0.5 ? "CEA " + F.dt0(c.cea) : ""].filter(Boolean).join(" · ")));
      li.appendChild(cree("small", "plan__cal-src", c.sources.map(function (x) { return LIB[x]; }).join(" + ") + (li.className ? " · avant le 31" : "")));
      ol.appendChild(li);
    });
    $("fi-plan-vide").hidden = r.calendrier.length > 0;
    $("fi-plan-rappel").disabled = !r.calendrier.length;
    $("fi-plan-simuler").href = "#epargne?av=" + Math.round(r.av) + "&cea=" + Math.round(r.cea);
  }
  function replanifier() { if (dernierFiscal) rendrePlan(dernierFiscal.sy, dernierFiscal.opt); }
  function essai(partiel) { planEssai = Object.assign({}, planEssai || {}, partiel); compter("plan"); replanifier(); }
  function garderPlan() {
    if (!planEssai) return;
    var r = Object.assign({}, O.profil().planVersement || {}, planEssai); planEssai = null;
    O.majProfil({ planVersement: r });
  }
  [["fi-plan-marge", "partMarge"], ["fi-plan-primes", "partPrimes"], ["fi-plan-av", "partAv"]].forEach(function (x) {
    var c = $(x[0]);
    c.addEventListener("input", function () { var o = {}; o[x[1]] = Number(c.value) / 100; essai(o); });
    c.addEventListener("change", garderPlan);
  });
  $("fi-plan-reserve").addEventListener("input", function () { var v = lire(this.value); essai({ reserve: this.value.trim() === "" ? null : (v >= 0 ? v : null) }); });
  $("fi-plan-reserve").addEventListener("change", garderPlan);
  $("fi-plan-puces").addEventListener("click", function (e) {
    var b = e.target.closest("[data-part]"); if (!b) return;
    var k = b.getAttribute("data-part");
    if (k === "perso") { $("fi-plan-av").focus(); return; }
    essai({ partAv: k === "conseil" ? null : Number(k) / 100 }); garderPlan();
  });
  $("fi-plan-puces").addEventListener("keydown", function (e) {
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].indexOf(e.key) === -1) return;
    var l = Array.prototype.slice.call(this.querySelectorAll("[data-part]")), i = l.indexOf(doc.activeElement); if (i < 0) return;
    e.preventDefault(); var n = l[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : l.length - 1)) % l.length]; n.focus(); n.click();
  });
  $("fi-plan-rappel").addEventListener("click", function () {
    var r = dernierPlan; if (!r || !r.calendrier.length) return;
    var p = O.profil(), avant = p.rappelsPerso.slice(), parMois = {}, cles = [];
    r.calendrier.forEach(function (c) {
      var k = c.date.getFullYear() + "-" + c.date.getMonth();
      if (!parMois[k]) { parMois[k] = { an: c.date.getFullYear(), mois: c.date.getMonth(), montant: 0, av: 0, cea: 0 }; cles.push(k); }
      parMois[k].montant += c.montant; parMois[k].av += c.av; parMois[k].cea += c.cea;
    });
    var nouveaux = cles.map(function (k) {
      var x = parMois[k];
      return { id: "plan" + x.an + String(x.mois + 1).padStart(2, "0"), titre: "Mon plan d'épargne : verser " + F.dt0(x.montant) + " DT en " + MOIS_PLAN[x.mois],
        corps: "Prévu dans votre plan : " + [x.av > 0.5 ? F.dt0(x.av) + " DT en assurance vie" : "", x.cea > 0.5 ? F.dt0(x.cea) + " DT en CEA" : ""].filter(Boolean).join(" et ") +
          ". Chaque versement fait avant le 31 décembre réduit votre impôt " + r.annee + ".",
        url: "/espace/#vie?onglet=fiscal", mois: x.mois + 1, annee: x.an };
    });
    var autres = avant.filter(function (x) { return !/^plan\d{6}$/.test(x.id); });
    O.majProfil({ rappelsPerso: autres.slice(0, Math.max(0, 20 - nouveaux.length)).concat(nouveaux) }, { immediat: true });
    compter("plan-rappel");
    O.toast(nouveaux.length + (nouveaux.length > 1 ? " rappels ajoutés" : " rappel ajouté") + " : le 1er de chaque mois concerné, dans Orbite (et par e-mail si vos rappels e-mail sont activés).",
      { action: { libelle: "Annuler", fn: function () { O.majProfil({ rappelsPerso: avant }, { immediat: true }); O.toast("Rappels retirés."); } } });
  });

  $("fi-paie-detail").addEventListener("toggle", function () { if (this.open) O.placerPastilles($("fi-paie-employeur")); });
  doc.querySelectorAll('input[name="fi-av-paie"]').forEach(function (r) {
    r.addEventListener("change", function () {
      O.majProfil({ avPaie: r.value === "oui" });
      O.toast(r.value === "oui" ? "Noté : votre employeur déduit déjà votre assurance vie de la retenue mensuelle." : "Noté : votre employeur ne déduit pas votre assurance vie ; l'impôt restant est recalculé.");
    });
  });

  /* ---------- Navigation ---------- */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "vie") return;
    ouvrirOnglet(e.detail.params.get("onglet") || ONGLETS.filter(function (c) { return !$("vie-panneau-" + c).hidden; })[0] || "vie");
    /* #vie?onglet=fiscal&plan=1 : directement sur « Mon plan de versement ». */
    if (e.detail.params.get("plan") && !$("fi-plan").hidden) setTimeout(function () { $("fi-plan").scrollIntoView({ block: "start" }); }, 60);
  });
  O.surProfil(function () {
    if ($("vue-vie").hidden) return;
    if (!$("vie-panneau-fiscal").hidden) rendreFiscal(); else if (!$("vie-panneau-vie").hidden) calculer();
  });
})();
