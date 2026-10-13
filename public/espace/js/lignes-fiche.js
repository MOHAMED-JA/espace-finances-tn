/*
 * Orbite — « Autres lignes de ma fiche de paie » (Profil › Votre emploi et votre salaire, maquette validée le 13 oct. 2026).
 * Trois listes de lignes mensuelles (libellé + montant) et l'impôt aligné sur la fiche :
 * - retenues en plus de la caisse (retraite complémentaire, assurance groupe…) : déduites du revenu imposable ;
 * - versements non imposables (bonification de crédit…) : ajoutés au net ;
 * - retenues sur le net (syndicat, assurance auto, tickets restaurant…) : retirées après l'impôt ;
 * - impôt aligné : IRPP et CSS de la fiche pour le brut de la fiche (au-delà, le calcul d'Orbite reprend).
 * Le net obtenu (OrbiteCalcul.salaire) sert partout dans Orbite. Enregistré dans le profil (lignesFiche, impotFiche).
 */
(function () {
  "use strict";
  var O = window.Orbite, OC = window.OrbiteCalcul, doc = document, bloc = doc.getElementById("lf-bloc");
  if (!O || !OC || !bloc) return;

  var GROUPES = [
    { cle: "sociales", titre: "Retenues en plus de la CNSS", aide: "Retraite complémentaire, assurance groupe… Elles font baisser l'impôt.", signe: "−", exemple: "Ex. retraite complémentaire" },
    { cle: "gains", titre: "Versements en plus, non imposables", aide: "Bonification de crédit, remboursement de frais…", signe: "+", exemple: "Ex. bonification crédit logement" },
    { cle: "nettes", titre: "Retenues sur le net", aide: "Syndicat, assurance auto, tickets restaurant… Retirées après l'impôt.", signe: "−", exemple: "Ex. assurance auto" }
  ];
  var MAX = 8, f3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function dt(v) { return f3.format(Math.round(v * 1000) / 1000).replace(/[  ]/g, " "); }
  function lire(t) { var n = Number(String(t || "").replace(/[\s  ]/g, "").replace(",", ".")); return isFinite(n) && n >= 0 ? n : null; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* Lignes affichées (y compris une ligne vide qu'on vient d'ajouter, gardée tant qu'on ne quitte pas le bloc). */
  var etat = { lignes: { sociales: [], gains: [], nettes: [] }, impot: { actif: false, irpp: 0, css: 0, brut: 0 } };
  var minuterie = null;

  function caisse(p) { return p && p.secteur === "public" ? "CNRPS" : "CNSS"; }
  /* Brut mensuel du salaire actuel, calculé sans l'impôt aligné (repère de la fiche). */
  function brutActuel(p) {
    try { return OC.salaire(OC.normaliser(Object.assign({}, p, { impotFiche: {} }))).brutMensuel; } catch (e) { return 0; }
  }

  function ligneHtml(g, l, i) {
    var n = i + 1;
    return '<div class="lf__ligne" data-g="' + g.cle + '" data-i="' + i + '">' +
      '<div class="saisie"><input type="text" class="lf__lib" maxlength="40" autocomplete="off" placeholder="' + esc(g.exemple) + '" value="' + esc(l.libelle || "") + '" aria-label="' + esc(g.titre) + ', ligne ' + n + ' : libellé"></div>' +
      '<div class="saisie lf__mt"><input type="text" class="lf__montant" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (l.montant > 0 ? dt(l.montant) : "") + '" aria-label="' + esc(g.titre) + ', ligne ' + n + ' : montant par mois"><span class="saisie__unite">DT</span></div>' +
      '<button type="button" class="bouton bouton--icone bouton--fantome lf__retirer" aria-label="Retirer la ligne ' + n + ' (' + esc(g.titre) + ')"><svg aria-hidden="true"><use href="/orbite/icones.svg#fermer"/></svg></button></div>';
  }

  function rendre(p) {
    var cs = caisse(p);
    bloc.innerHTML =
      '<div class="lf__tete"><span class="champ__lib" id="lf-titre">Autres lignes de ma fiche de paie</span><small>Pour que votre net soit celui de votre fiche, au millime. Montants par mois.</small></div>' +
      GROUPES.map(function (g) {
        var titre = g.cle === "sociales" ? "Retenues en plus de la " + cs : g.titre, liste = etat.lignes[g.cle];
        return '<section class="lf__groupe lf__groupe--' + g.cle + '" aria-labelledby="lf-t-' + g.cle + '">' +
          '<div class="lf__gt"><i aria-hidden="true"></i><span class="lf__gtt"><b id="lf-t-' + g.cle + '">' + esc(titre) + '</b><small>' + esc(g.aide) + '</small></span><span class="lf__total" data-total="' + g.cle + '"></span></div>' +
          liste.map(function (l, i) { return ligneHtml(g, l, i); }).join("") +
          (liste.length < MAX ? '<button type="button" class="lien-action lf__ajouter" data-ajouter="' + g.cle + '"><svg aria-hidden="true"><use href="/orbite/icones.svg#plus"/></svg>Ajouter une ligne</button>' : "") +
          "</section>";
      }).join("") +
      '<div class="lf__aligne">' +
        '<label class="interrupteur"><span><strong>Impôt aligné sur ma fiche</strong><small>Orbite reprend l\'IRPP et la CSS retenus par votre employeur pour le net du mois. Son propre calcul reste affiché à côté.</small></span><input type="checkbox" id="lf-aligne" role="switch"' + (etat.impot.actif ? " checked" : "") + '><span class="interrupteur__piste" aria-hidden="true"></span></label>' +
        '<div class="lf__duo" id="lf-impot"' + (etat.impot.actif ? "" : " hidden") + '>' +
          '<div class="champ"><label for="lf-irpp">IRPP du mois</label><div class="saisie"><input id="lf-irpp" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (etat.impot.irpp > 0 ? dt(etat.impot.irpp) : "") + '"><span class="saisie__unite">DT</span></div></div>' +
          '<div class="champ"><label for="lf-css">CSS du mois</label><div class="saisie"><input id="lf-css" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (etat.impot.css > 0 ? dt(etat.impot.css) : "") + '"><span class="saisie__unite">DT</span></div></div>' +
        "</div>" +
        '<p class="lf__ecart" id="lf-ecart" aria-live="polite" hidden></p>' +
      "</div>" +
      '<p class="profil-resume" id="lf-resume" aria-live="polite" hidden></p>';
    majTextes(p);
  }

  /* Totaux, écart d'impôt et net : recalculés à chaque changement, sans reconstruire les champs. */
  function majTextes(p, sy) {
    GROUPES.forEach(function (g) {
      var t = etat.lignes[g.cle].reduce(function (s, l) { return s + (l.montant || 0); }, 0), el = bloc.querySelector('[data-total="' + g.cle + '"]');
      if (el) el.textContent = t > 0 ? g.signe + " " + dt(t) + " DT" : "";
    });
    var s = sy && sy.salaire ? sy.salaire : null;
    if (!s) { try { s = OC.salaire(OC.normaliser(p)); } catch (e) { s = null; } }
    var ecart = doc.getElementById("lf-ecart"), resume = doc.getElementById("lf-resume");
    if (ecart) {
      var a = s && s.impotAligne;
      if (!etat.impot.actif) ecart.hidden = true;
      else if (a) {
        ecart.hidden = false;
        var e = a.ecart, abs = dt(Math.abs(e));
        ecart.innerHTML = "Calcul d'Orbite : <b>" + dt(a.irppOrbite) + " DT</b> d'IRPP et " + dt(a.cssOrbite) + " DT de CSS. " +
          (Math.abs(e) < 0.0005 ? "Votre fiche retient exactement le même impôt." : "Votre employeur retient <b>" + abs + " DT " + (e > 0 ? "de moins" : "de plus") + "</b> ce mois-ci (régularisation sur les primes de l'année, en général).");
      } else if (etat.impot.irpp + etat.impot.css > 0) {
        ecart.hidden = false;
        ecart.textContent = "Votre salaire brut n'est plus celui de cette fiche : Orbite reprend son propre calcul de l'impôt. Saisissez l'IRPP et la CSS de votre nouvelle fiche.";
      } else ecart.hidden = true;
    }
    var avec = GROUPES.some(function (g) { return etat.lignes[g.cle].some(function (l) { return l.montant > 0; }); }) || (s && s.impotAligne);
    if (resume) {
      resume.hidden = !(avec && s);
      if (!resume.hidden) resume.innerHTML = "Net de votre fiche : <b>" + dt(s.netMensuel) + " DT par mois</b>. Les crédits retenus sur la paie restent dans le module Crédit.";
    }
  }

  function lireBloc() {
    GROUPES.forEach(function (g) {
      etat.lignes[g.cle] = Array.prototype.map.call(bloc.querySelectorAll('.lf__ligne[data-g="' + g.cle + '"]'), function (div) {
        var m = lire(div.querySelector(".lf__montant").value);
        return { libelle: div.querySelector(".lf__lib").value.trim().slice(0, 40), montant: m == null ? 0 : Math.round(m * 1000) / 1000 };
      });
    });
    var c = doc.getElementById("lf-aligne");
    etat.impot.actif = !!(c && c.checked);
    var ir = lire((doc.getElementById("lf-irpp") || {}).value), cs = lire((doc.getElementById("lf-css") || {}).value);
    etat.impot.irpp = ir || 0; etat.impot.css = cs || 0;
  }

  /* Enregistre (lignes vides ignorées par le profil). repere : le brut de la fiche est repris du salaire actuel. */
  function enregistrer(repere) {
    clearTimeout(minuterie);
    minuterie = setTimeout(function () {
      var p = O.profil() || {}, impot = Object.assign({}, etat.impot);
      impot.brut = repere || !(p.impotFiche && p.impotFiche.brut > 0) ? brutActuel(p) : p.impotFiche.brut;
      O.majProfil({ lignesFiche: JSON.parse(JSON.stringify(etat.lignes)), impotFiche: impot });
    }, 350);
  }

  bloc.addEventListener("input", function (e) {
    if (!e.target.matches("input[type=text]")) return;
    var champImpot = e.target.id === "lf-irpp" || e.target.id === "lf-css";
    if (e.target.matches(".lf__montant, #lf-irpp, #lf-css")) e.target.setAttribute("aria-invalid", lire(e.target.value) == null && e.target.value.trim() ? "true" : "false");
    lireBloc(); majTextes(O.profil() || {}); enregistrer(champImpot);
  });
  bloc.addEventListener("change", function (e) {
    if (e.target.id === "lf-aligne") {
      lireBloc();
      doc.getElementById("lf-impot").hidden = !etat.impot.actif;
      if (etat.impot.actif) { var f = doc.getElementById("lf-irpp"); if (f && !f.value) f.focus(); }
      enregistrer(true);
    }
  });
  bloc.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el.matches(".lf__montant, #lf-irpp, #lf-css")) { var v = lire(el.value); if (v != null && el.value.trim()) el.value = dt(v); }
  });
  bloc.addEventListener("click", function (e) {
    var aj = e.target.closest("[data-ajouter]"), ret = e.target.closest(".lf__retirer");
    if (!aj && !ret) return;
    lireBloc();
    var p = O.profil() || {};
    if (aj) {
      var g = aj.getAttribute("data-ajouter");
      if (etat.lignes[g].length >= MAX) return;
      etat.lignes[g].push({ libelle: "", montant: 0 });
      rendre(p);
      var lignes = bloc.querySelectorAll('.lf__ligne[data-g="' + g + '"]');
      lignes[lignes.length - 1].querySelector(".lf__lib").focus();
    } else {
      var div = ret.closest(".lf__ligne"), gg = div.getAttribute("data-g"), i = Number(div.getAttribute("data-i"));
      etat.lignes[gg].splice(i, 1);
      rendre(p);
      var reste = bloc.querySelectorAll('.lf__ligne[data-g="' + gg + '"]'), cible = reste[Math.min(i, reste.length - 1)];
      (cible ? cible.querySelector(".lf__lib") : bloc.querySelector('[data-ajouter="' + gg + '"]')).focus();
      enregistrer(false);
    }
  });

  /* Profil chargé ou modifié ailleurs : on reprend ses lignes, sauf pendant la saisie dans le bloc. */
  O.surProfil(function (sy, p) {
    if (bloc.contains(doc.activeElement)) { majTextes(p, sy); return; }
    var pn = OC.normaliser(p);
    etat = { lignes: JSON.parse(JSON.stringify(pn.lignesFiche)), impot: Object.assign({}, pn.impotFiche) };
    rendre(p);
    majTextes(p, sy);
  });
})();
