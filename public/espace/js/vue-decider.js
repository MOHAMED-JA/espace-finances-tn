/*
 * Orbite — « Rembourser ou épargner ? » (Vie & impôts › Décider, #vie?onglet=decider ; maquette validée le 13 oct. 2026).
 * Une somme (une prime, une économie) et trois choix comparés sur 5 ou 10 ans avec les chiffres du profil :
 * rembourser le crédit le plus cher, assurance vie / CEA (économie d'impôt), épargne de précaution ; puis un conseil.
 * Calculs : decider-calcul.js. Rien n'est modifié dans le profil, sauf les deux hypothèses de rendement.
 * #vie?onglet=decider&somme=3000 préremplit la somme (conseil de Mon orbite quand une prime arrive).
 */
(function () {
  "use strict";
  var O = window.Orbite, D = window.DeciderCalcul, OI = window.OrbiteIntelligence, doc = document;
  if (!O || !D) return;
  var F = O.F, $ = O.$;
  var somme = null, horizon = 5, saisieTouchee = false;

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dt(v) { return F.dt0(v) + " DT"; }
  function signe(v) { return (v >= 0 ? "+" : "−") + F.dt0(Math.abs(v)); }
  function pct(v) { return String(Math.round(v * 10) / 10).replace(".", ",") + " %"; }
  function mois1(v) { return String(Math.round(v * 10) / 10).replace(".", ","); }
  function lire(id) { var r = F.lire($(id).value); return r.valide && !r.vide ? r.valeur : null; }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* Somme par défaut : la prochaine prime, sinon 1 000 DT. */
  function sommeDefaut(sy) { var pr = D.prochainesPrimes(sy, 1)[0]; return pr ? pr.montant : 1000; }

  function puces(sy) {
    var z = $("dc-puces"), pr = D.prochainesPrimes(sy, 2), html = "", choisi = false;
    /* Une seule pastille marquée, même si deux primes ont le même montant. */
    function on(v) { if (choisi || Math.abs(somme - v) >= 0.5) return ""; choisi = true; return " dc-puce--on"; }
    pr.forEach(function (x) {
      html += '<button type="button" class="dc-puce' + on(x.montant) + '" data-somme="' + x.montant + '">Prime de ' + x.mois + " · " + F.dt0(x.montant) + "</button>";
    });
    if (sy.profil.epargneDisponible > 0) html += '<button type="button" class="dc-puce' + on(sy.profil.epargneDisponible) + '" data-somme="' + sy.profil.epargneDisponible + '">Mon épargne disponible · ' + F.dt0(sy.profil.epargneDisponible) + "</button>";
    html += '<button type="button" class="dc-puce" data-autre>Autre montant</button>';
    z.innerHTML = html;
  }

  function carte(c, r, sy) {
    var ic = { rembourser: "credit", placer: "epargne", reserve: "bouclier" }[c.cle], txt = "";
    if (c.cle === "rembourser") {
      if (!c.disponible) txt = c.raison || "Aucun crédit avec un taux connu : renseignez le taux de vos crédits dans votre profil.";
      else if (c.solde) txt = "Taux de " + pct(c.tauxPct) + " : le crédit est soldé tout de suite (" + dt(c.verse) + " suffisent). " + dt(c.interetsEvites) + " d'intérêts évités.";
      else txt = "Le plus cher (" + pct(c.tauxPct) + "). " + dt(c.interetsEvites) + " d'intérêts évités, fin " + c.moisGagnes + " mois plus tôt (" + c.finApres + " au lieu de " + c.finAvant + "). Somme non récupérable.";
    } else if (c.cle === "placer") {
      var rep = c.av > 0 && c.cea > 0 ? " (meilleur partage : " + dt(c.av) + " en assurance vie, " + dt(c.cea) + " en CEA)" : c.cea > 0 ? " (en CEA, le plus avantageux pour vous)" : "";
      txt = c.economieImpot > 0.5
        ? dt(c.economieImpot) + " d'impôt en moins pour " + (sy.maintenant || new Date()).getFullYear() + rep + ", puis " + pct(r.hypotheses.rendementAv) + " par an. Avantage gardé si le contrat va à son terme (assurance vie " + c.dureeAv + " ans, CEA " + c.dureeCea + " ans)."
        : "Pas d'impôt à réduire (impôt nul ou plafonds atteints) : seulement le rendement de " + pct(r.hypotheses.rendementAv) + " par an.";
    } else {
      txt = "Disponible à tout moment. Votre réserve passe de " + mois1(c.moisAvant) + " à " + mois1(c.moisApres) + " mois de dépenses" + (c.points > 0 ? " : +" + c.points + " points de santé." : ".");
    }
    var badge = r.meilleur === c.cle ? ' <span class="dc-badge">Le plus rentable</span>' : "";
    return '<li class="dc-choix__item' + (r.meilleur === c.cle ? " dc-choix__item--top" : "") + (c.disponible ? "" : " dc-choix__item--off") + '" data-choix="' + c.cle + '">' +
      '<span class="dc-ic dc-ic--' + c.cle + '"><svg aria-hidden="true"><use href="/orbite/icones.svg#' + ic + '"/></svg></span>' +
      '<div class="dc-choix__txt"><b>' + esc(c.libelle) + badge + "</b><p>" + esc(txt) + "</p></div>" +
      (c.disponible ? '<div class="dc-choix__v"><strong>' + signe(c.gain) + "</strong><small>DT gagnés en " + r.horizon + " ans</small></div>" : "") + "</li>";
  }

  function conseil(r, sy) {
    var z = $("dc-conseil");
    if (!(r.somme > 0)) { z.hidden = true; return; }
    z.hidden = false;
    var parts = r.conseil.parts, ch = {}; r.choix.forEach(function (c) { ch[c.cle] = c; });
    var phr = [];
    function dest(cle, montant) {
      if (cle === "reserve") return "en épargne de précaution";
      if (cle === "rembourser") return "pour rembourser le " + ch.rembourser.credit.toLowerCase();
      var e = OI.economieVersement(sy, montant).eco;
      return "en assurance vie ou CEA" + (e > 0.5 ? " : " + dt(e) + " d'impôt en moins" : "");
    }
    if (parts.length > 1) {
      phr.push("D'abord " + dt(parts[0].montant) + " " + dest(parts[0].cle, parts[0].montant) + " (votre réserve couvre " + mois1(r.reserve.mois) + " mois de dépenses pour " + dt(r.reserve.cible) + " visés), puis " + dt(parts[1].montant) + " " + dest(parts[1].cle, parts[1].montant) + ".");
    } else if (parts[0] && parts[0].cle === "reserve") {
      phr.push("Tout " + dest("reserve") + " : votre réserve couvre " + mois1(r.reserve.mois) + " mois de dépenses, l'objectif de votre réserve de sécurité est " + dt(r.reserve.cible) + ".");
    } else if (parts[0]) {
      phr.push("Votre réserve couvre déjà " + mois1(r.reserve.mois) + " mois de dépenses : " + dt(parts[0].montant) + " " + dest(parts[0].cle, parts[0].montant) + ".");
    }
    if (ch.rembourser && ch.rembourser.disponible && ch.placer.disponible) {
      phr.push(ch.rembourser.gain < ch.placer.gain
        ? "Le " + ch.rembourser.credit.toLowerCase() + " à " + pct(ch.rembourser.tauxPct) + " rapporte moins à rembourser que l'assurance vie à votre niveau d'impôt."
        : "Rembourser le " + ch.rembourser.credit.toLowerCase() + " à " + pct(ch.rembourser.tauxPct) + " rapporte plus que le placer.");
    }
    var titre = parts.length > 1 ? "Notre conseil : partager" : "Notre conseil";
    var mix = parts.map(function (x) { return '<i class="dc-mix--' + x.cle + '" data-part="' + (x.montant / r.somme) + '"></i>'; }).join("");
    z.innerHTML = "<b>" + titre + "</b><p>" + esc(phr.join(" ")) + '</p><div class="dc-mix" aria-hidden="true">' + mix + "</div>";
    z.querySelectorAll("[data-part]").forEach(function (i) { i.style.setProperty("--part", (+i.getAttribute("data-part") * 100).toFixed(2) + "%"); });
  }

  function barres(r) {
    var z = $("dc-barres"), dispo = r.choix.filter(function (c) { return c.disponible; });
    if (!dispo.length) { z.innerHTML = ""; return; }
    var max = Math.max.apply(null, dispo.map(function (c) { return c.valeur; }));
    var noms = { rembourser: "Rembourser", placer: "Assurance vie", reserve: "Précaution" };
    var sig = dispo.map(function (c) { return c.cle; }).join("|");
    /* Mêmes barres : mise à jour sur place, pour que la largeur glisse d'une valeur à l'autre. */
    if (z.getAttribute("data-sig") !== sig) {
      z.innerHTML = '<p class="dc-barres__titre"></p>' + dispo.map(function (c) {
        return '<div class="dc-barre" data-b="' + c.cle + '"><span>' + noms[c.cle] + '</span><i class="dc-barre__b dc-barre__b--' + c.cle + '"></i><span></span></div>';
      }).join("");
      z.setAttribute("data-sig", sig);
    }
    z.querySelector(".dc-barres__titre").textContent = "Ce que vaut la somme dans " + r.horizon + " ans";
    dispo.forEach(function (c) {
      var b = z.querySelector('[data-b="' + c.cle + '"]');
      b.querySelector("i").style.setProperty("--l", (Math.max(0.04, c.valeur / max) * 100).toFixed(2) + "%");
      b.lastChild.textContent = F.dt0(c.valeur);
    });
  }

  function rendre() {
    var sy = O.synthese(); if (!sy || !$("vie-panneau-decider") || $("vie-panneau-decider").hidden) return;
    if (somme === null) somme = sommeDefaut(sy);
    if (!saisieTouchee && doc.activeElement !== $("dc-somme")) $("dc-somme").value = F.saisie(somme);
    var h = D.hypotheses(sy.profil);
    $("dc-hyp-av").textContent = String(h.rendementAv).replace(".", ","); $("dc-hyp-ep").textContent = String(h.rendementEpargne).replace(".", ",");
    if (doc.activeElement !== $("dc-rend-av")) $("dc-rend-av").value = String(h.rendementAv).replace(".", ",");
    if (doc.activeElement !== $("dc-rend-ep")) $("dc-rend-ep").value = String(h.rendementEpargne).replace(".", ",");
    var r = D.comparer(sy, { somme: somme, horizon: horizon });
    puces(sy);
    $("dc-choix").innerHTML = r.choix.map(function (c) { return carte(c, r, sy); }).join("");
    barres(r); conseil(r, sy);
    O.placerPastilles($("vie-panneau-decider"));
  }

  $("dc-somme").addEventListener("input", function () {
    saisieTouchee = true;
    var v = lire("dc-somme"); if (v === null) return;
    somme = Math.min(v, 1e7); rendre();
  });
  $("dc-somme").addEventListener("blur", function () { saisieTouchee = false; if (somme !== null) this.value = F.saisie(somme); });
  $("dc-puces").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-autre")) { var c = $("dc-somme"); c.focus(); c.select(); return; }
    somme = +b.getAttribute("data-somme"); saisieTouchee = false; rendre();
  });
  doc.querySelectorAll('input[name="dc-horizon"]').forEach(function (i) {
    i.addEventListener("change", function () { horizon = +i.value === 10 ? 10 : 5; rendre(); });
  });
  ["dc-rend-av", "dc-rend-ep"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      var v = lire(id), p = O.profil(); if (v === null || !p) return;
      var d = Object.assign({}, p.decider || {}); d[id === "dc-rend-av" ? "rendementAv" : "rendementEpargne"] = Math.min(15, v);
      O.majProfil({ decider: d });
    });
  });

  doc.addEventListener("orbite:decider", function () {
    var r = O.lireRoute ? O.lireRoute() : null, s = r && r.params.get("somme");
    if (s && isFinite(+s) && +s > 0) { somme = Math.min(+s, 1e7); saisieTouchee = false; }
    rendre();
  });
  O.surProfil(function () { if ($("vue-vie") && !$("vue-vie").hidden) rendre(); });
})();
