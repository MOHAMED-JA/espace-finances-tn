/*
 * Orbite — « Ma réserve de sécurité » (15 oct. 2026, maquette validée) : carte en tête de Ma progression › Objectifs
 * et tuile sur Mon orbite. Moteur : OrbiteIntelligence.reserve (même définition des dépenses partout : OC.depensesMois).
 * Les curseurs recalculent en direct ; le réglage est gardé dans le profil (profil.reserve) quand on le lâche.
 */
(function () {
  "use strict";
  var O = window.Orbite, OI = window.OrbiteIntelligence, F = O.F, $ = O.$, doc = document;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var essai = null, dernier = null;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function lire(v) { var r = F.lire(String(v == null ? "" : v)); return r.valide && !r.vide ? r.valeur : NaN; }
  function moisAn(d) { return MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function nbMois(v) { var x = Math.round(v * 10) / 10; return String(x).replace(".", ",") + " mois"; }
  function reglages() { return Object.assign({}, O.profil().reserve || {}, essai || {}); }
  function visible(id) { var v = $(id); return v && !v.hidden; }

  function calculer() {
    var sy = O.synthese(); if (!sy || !OI || !OI.reserve) return null;
    try { return OI.reserve(sy, reglages(), {}); } catch (e) { return null; }
  }

  /* ---------- Tuile de Mon orbite ---------- */
  function rendreTuile(r) {
    var t = $("reserve-tuile"); if (!t) return;
    t.hidden = !r;
    if (!r) return;
    $("reserve-tuile-rond").style.setProperty("--p", Math.round(r.pct * 100) + "%");
    $("reserve-tuile-pct").textContent = Math.round(r.pct * 100) + " %";
    $("reserve-tuile-titre").textContent = r.complete ? "Réserve de sécurité complète" : "Réserve : " + F.dt0(r.actuel) + " / " + dt(r.cible);
    $("reserve-tuile-sous").textContent = r.complete ? nbMois(r.moisCouverts) + " de dépenses de côté"
      : r.dateAtteinte ? (r.mensuel > 0 ? dt(r.mensuel) + " par mois · " : "Avec vos primes · ") + "complète en " + moisAn(r.dateAtteinte)
      : "Choisissez une part de votre marge ou de vos primes";
  }

  /* ---------- Carte de Ma progression ---------- */
  function rendreCarte(r) {
    var sec = $("pg-reserve"); if (!sec) return;
    sec.hidden = !r;
    if (!r) return;
    var rg = r.reglages, dm = r.depenses;
    var etat = $("rs-etat");
    etat.textContent = r.complete ? "Complète · " + nbMois(r.moisCouverts) + " couverts" : r.statut === "a_commencer" ? "À commencer" : "À construire · " + nbMois(r.moisCouverts) + " couvert" + (r.moisCouverts >= 2 ? "s" : "");
    etat.setAttribute("data-etat", r.statut);
    $("rs-actuel").textContent = dt(r.actuel);
    $("rs-sur").textContent = r.complete ? "pour " + dt(r.cible) + " visés : objectif atteint" : "sur " + dt(r.cible) + " visés · il manque " + dt(r.manque);
    /* Jauge : repères 1, 3 et 6 mois, trait à l'objectif, « Vous » à l'épargne disponible. */
    var max = Math.max(r.reperes[2].montant, r.cible, r.actuel, 1);
    var pos = function (v) { return Math.min(100, v / max * 100) + "%"; };
    $("rs-plein").style.setProperty("--x", pos(r.actuel));
    $("rs-vous").style.setProperty("--x", pos(r.actuel)); $("rs-vous").textContent = "Vous · " + dt(r.actuel);
    $("rs-trait").style.setProperty("--x", pos(r.cible));
    var ol = $("rs-reperes"); ol.textContent = "";
    r.reperes.forEach(function (x) {
      var li = cree("li", rg.mois === x.mois ? "reserve__repere--on" : null, x.mois + " mois" + (rg.mois === x.mois ? " · " + dt(x.montant) : ""));
      li.style.setProperty("--x", pos(x.montant)); ol.appendChild(li);
    });
    $("rs-jauge-lib").textContent = dt(r.actuel) + " de côté, soit " + nbMois(r.moisCouverts) + " de dépenses ; objectif " + dt(r.cible) + ".";
    /* Objectif */
    doc.querySelectorAll("#rs-puces [data-mois]").forEach(function (b) {
      var on = Number(b.getAttribute("data-mois")) === rg.mois;
      b.classList.toggle("plan__puce--on", on); b.setAttribute("aria-checked", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    });
    $("rs-libre-bloc").hidden = rg.mois !== 0;
    var lib = $("rs-libre"); if (doc.activeElement !== lib) lib.value = rg.mois === 0 && rg.montant > 0 ? F.saisie(rg.montant) : "";
    $("rs-depenses").textContent = "Dépenses d'un mois : " + dt(dm.total) + " (crédits " + F.dt0(dm.credits) + (dm.logement > 0 ? " · logement " + F.dt0(dm.logement) : "") +
      (dm.contrats > 0 ? " · contrats " + F.dt0(dm.contrats) : "") + " · vie courante " + F.dt0(dm.vie) + (dm.source === "budget" ? ", d'après votre budget du mois" : ", estimée faute de budget du mois") +
      "). La même réserve sert partout : score de santé, « Rembourser ou épargner ? » et plan de versement.";
    /* Comment l'atteindre */
    $("rs-mensuel").textContent = dt(r.mensuel);
    $("rs-mensuel-txt").textContent = dm.libre < 10
      ? (dm.source === "budget" ? "Votre budget du mois répartit déjà tout votre salaire : rien ne reste chaque mois. Vos primes peuvent construire la réserve." : "Après crédits, logement et contrats, il ne reste rien chaque mois.")
      : Math.round(rg.partMarge * 100) + " % de ce qui reste chaque mois (" + dt(dm.libre) + ") après crédits, logement, contrats et dépenses de vie, le jour de paie.";
    $("rs-part-marge").disabled = dm.libre < 10;
    curseur("rs-part-marge", rg.partMarge);
    var pr = r.prochainePrime, bloc = $("rs-prime-bloc");
    bloc.hidden = !pr;
    if (pr) {
      $("rs-prime-mt").textContent = dt(Math.floor(pr.net * rg.partPrimes / 10) * 10);
      $("rs-prime-txt").textContent = "Prime de " + MOIS[pr.mois] + (pr.an !== new Date().getFullYear() ? " " + pr.an : "") + " (≈ " + dt(pr.net) + " net) : " +
        Math.round(rg.partPrimes * 100) + " % pour la réserve" + (pr.partPlan > 0 ? ", " + Math.round(pr.partPlan * 100) + " % pour votre plan de versement (assurance vie)." : ".");
      $("rs-partage-r").style.setProperty("--l", Math.round(rg.partPrimes * 100) + "%");
      $("rs-partage-a").style.setProperty("--l", Math.round(pr.partPlan * 100) + "%");
      curseur("rs-part-primes", rg.partPrimes);
    }
    $("rs-date-lib").textContent = r.complete ? "Réserve complète" : r.dateAtteinte ? "Réserve complète en" : "À ce rythme";
    $("rs-date").textContent = r.complete ? "Bravo" : r.dateAtteinte ? moisAn(r.dateAtteinte) : "jamais : augmentez une part";
    $("rs-rappel").disabled = r.complete;
    rendreGraphe(r);
    rendreOrdre(r);
  }
  function curseur(id, v) { var c = $(id); if (doc.activeElement !== c) c.value = String(Math.round(v * 100)); c.style.setProperty("--p", c.value + "%"); }

  function rendreGraphe(r) {
    var zone = $("rs-graphe");
    if (!window.OrbiteGraphe || r.points.length < 2) {
      zone.textContent = ""; zone.appendChild(cree("p", "reserve__note", r.complete ? "Votre réserve est complète : gardez-la à ce niveau." : "Pas encore de versement prévu : choisissez une part de votre marge ou de vos primes."));
      return;
    }
    var d0 = r.points[0].date, x = function (d) { return (d.getFullYear() - d0.getFullYear()) * 12 + d.getMonth() - d0.getMonth() + (d.getDate() - 1) / 31; };
    var pts = r.points.map(function (p) { return [x(p.date), p.cumul]; }), xmax = Math.max(1, Math.ceil(pts[pts.length - 1][0]));
    var pas = xmax > 18 ? 3 : xmax > 9 ? 2 : 1, ticks = [];
    for (var k = 0; k <= xmax; k += pas) { var dk = new Date(d0.getFullYear(), d0.getMonth() + k, 1); ticks.push({ v: k, lib: MOIS_COURT[dk.getMonth()] + (dk.getMonth() === 0 ? " " + String(dk.getFullYear()).slice(2) : "") }); }
    window.OrbiteGraphe.lignes(zone, {
      titre: "Votre réserve mois après mois", resume: "La réserve passe de " + dt(r.actuel) + " à " + dt(r.cible) + (r.dateAtteinte ? ", atteinte en " + moisAn(r.dateAtteinte) : "") + ".",
      series: [{ nom: "Réserve", pts: pts, c: 1, aire: true, marche: true }],
      seuil: { y: r.cible, lib: "Objectif " + dt(r.cible) }, xmin: 0, xmax: xmax, ymin: 0, ticksX: ticks, hauteur: 220,
      marqueurs: r.points.filter(function (p) { return p.prime; }).map(function (p) { return { x: x(p.date), y: p.cumul, c: "ok", lib: "Prime de " + MOIS[p.date.getMonth()] }; }),
      titreX: function (v) { var dk = new Date(d0.getFullYear(), d0.getMonth() + Math.floor(v), 1); return MOIS[dk.getMonth()] + " " + dk.getFullYear(); },
      fmtV: dt, fmtY: function (v) { return F.dt0(v); }, tableau: { entete: "Mois" }
    });
  }

  function rendreOrdre(r) {
    var ol = $("rs-ordre"); ol.textContent = "";
    var ici = r.ordre.filter(function (o) { return !o.fait; })[0];
    r.ordre.forEach(function (o) {
      var li = cree("li", "reserve__etape" + (o === ici ? " reserve__etape--ici" : "") + (o.fait ? " reserve__etape--fait" : ""));
      var t, sous, lien = null;
      if (o.cle === "reserve") { t = "Réserve de sécurité"; sous = o.fait ? "Complète : " + dt(o.montant) + "." : "Jusqu'à " + dt(o.montant) + "." + (o === ici ? " Vous êtes ici." : ""); }
      else if (o.cle === "impot") { t = "Assurance vie avant le 31 décembre"; sous = "Votre plan de versement : " + dt(o.gain) + " d'impôt en moins en " + o.annee + "."; lien = "#vie?onglet=fiscal&plan=1"; }
      else { t = "Remboursement anticipé"; sous = "Ensuite, le " + (o.libelle || "crédit").toLowerCase() + " à " + String(o.tauxPct).replace(".", ",") + " % : comparez dans « Rembourser ou épargner ? »."; lien = "#vie?onglet=decider"; }
      var corps = lien ? cree("a", "reserve__etape-lien") : cree("div", "reserve__etape-lien");
      if (lien) corps.href = lien;
      corps.appendChild(cree("b", null, t)); corps.appendChild(cree("span", null, sous));
      li.appendChild(corps); ol.appendChild(li);
    });
  }

  function rendre() {
    var surOrbite = visible("vue-orbite"), surProg = visible("vue-progression");
    if (!surOrbite && !surProg) return;
    var r = calculer(); dernier = r;
    if (surOrbite) rendreTuile(r);
    if (surProg) rendreCarte(r);
  }

  /* ---------- Réglages ---------- */
  function garder() {
    if (!essai) return;
    var r = Object.assign({}, O.profil().reserve || {}, essai); essai = null;
    O.majProfil({ reserve: r });
  }
  function tester(partiel) { essai = Object.assign({}, essai || {}, partiel); var r = calculer(); dernier = r; rendreCarte(r); }
  [["rs-part-marge", "partMarge"], ["rs-part-primes", "partPrimes"]].forEach(function (x) {
    var c = $(x[0]); if (!c) return;
    c.addEventListener("input", function () { var o = {}; o[x[1]] = Number(c.value) / 100; tester(o); });
    c.addEventListener("change", garder);
  });
  $("rs-puces").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mois]"); if (!b) return;
    var m = Number(b.getAttribute("data-mois")), o = { mois: m };
    if (m === 0 && !(reglages().montant > 0)) o.montant = dernier ? dernier.cible : null;
    tester(o); garder();
    if (m === 0) $("rs-libre").focus();
  });
  $("rs-puces").addEventListener("keydown", function (e) {
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].indexOf(e.key) === -1) return;
    var l = Array.prototype.slice.call(this.querySelectorAll("[data-mois]")), i = l.indexOf(doc.activeElement); if (i < 0) return;
    e.preventDefault(); var n = l[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : l.length - 1)) % l.length]; n.focus(); n.click();
  });
  $("rs-libre").addEventListener("input", function () { var v = lire(this.value); if (v > 0) tester({ mois: 0, montant: v }); });
  $("rs-libre").addEventListener("change", garder);

  /* « J'ai mis de côté » : l'épargne disponible du profil augmente, annulable. */
  $("rs-ajout").addEventListener("submit", function (e) {
    e.preventDefault();
    var champ = $("rs-ajout-mt"), v = lire(champ.value);
    if (!(v > 0)) { champ.setAttribute("aria-invalid", "true"); champ.focus(); return; }
    champ.removeAttribute("aria-invalid");
    var avant = O.profil().epargneDisponible || 0;
    O.majProfil({ epargneDisponible: Math.round((avant + v) * 1000) / 1000 }, { immediat: true });
    champ.value = "";
    O.toast(dt(v) + " ajoutés à votre réserve : " + dt(avant + v) + " de côté.", { action: { libelle: "Annuler", fn: function () { O.majProfil({ epargneDisponible: avant }, { immediat: true }); O.toast("Ajout annulé."); } } });
  });

  /* Rappels : le 1er de chaque mois jusqu'à la réserve complète (6 au plus), dans Orbite et par e-mail si activé. */
  $("rs-rappel").addEventListener("click", function () {
    var r = dernier; if (!r || r.complete) return;
    var p = O.profil(), avant = p.rappelsPerso.slice(), m = new Date(), nouveaux = [];
    var fin = r.dateAtteinte || new Date(m.getFullYear(), m.getMonth() + 5, 1);
    for (var k = 0; k < 6; k++) {
      var d = new Date(m.getFullYear(), m.getMonth() + k, 1);
      if (d > fin) break;
      nouveaux.push({ id: "reserve" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0"), titre: "Ma réserve de sécurité : mettre " + dt(r.mensuel || 0) + " de côté ce mois-ci",
        corps: "Encore " + dt(r.manque) + " pour atteindre " + dt(r.cible) + ". Gardez-les sur un compte disponible à tout moment, puis notez-les dans Orbite.",
        url: "/espace/#progression?onglet=objectifs&reserve=1", mois: d.getMonth() + 1, annee: d.getFullYear() });
    }
    var autres = avant.filter(function (x) { return !/^reserve\d{6}$/.test(x.id); });
    O.majProfil({ rappelsPerso: autres.slice(0, Math.max(0, 20 - nouveaux.length)).concat(nouveaux) }, { immediat: true });
    O.toast(nouveaux.length + (nouveaux.length > 1 ? " rappels ajoutés" : " rappel ajouté") + " : le 1er de chaque mois, dans Orbite (et par e-mail si vos rappels e-mail sont activés).",
      { action: { libelle: "Annuler", fn: function () { O.majProfil({ rappelsPerso: avant }, { immediat: true }); O.toast("Rappels retirés."); } } });
  });

  /* ---------- Navigation ---------- */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "orbite" && e.detail.vue !== "progression") return;
    setTimeout(function () {
      rendre();
      if (e.detail.vue === "progression" && e.detail.params && e.detail.params.get("reserve") && visible("pg-objectifs")) $("pg-reserve").scrollIntoView({ block: "start" });
    }, 0);
  });
  O.surProfil(function () { essai = null; rendre(); });
  window.OrbiteReserve = { rendre: rendre };
})();
