/*
 * Orbite — « Autres lignes de ma fiche de paie » (Profil › Votre emploi et votre salaire, maquettes validées le 13 oct. 2026).
 * Trois listes de lignes mensuelles (libellé + montant) et l'impôt aligné sur la fiche :
 * - retenues en plus de la caisse (retraite complémentaire, assurance groupe…) : déduites du revenu imposable ;
 * - versements non imposables (bonification de crédit…) : ajoutés au net ;
 * - retenues sur le net (syndicat, assurance auto, tickets restaurant…) : retirées après l'impôt ;
 * - impôt aligné : IRPP et CSS de la fiche pour le brut de la fiche (au-delà, le calcul d'Orbite reprend).
 * Lignes datées : changer le montant d'une ligne déjà enregistrée ou la retirer demande « à partir de quel mois ? »
 * (OrbiteCalcul.ficheChanger / ficheRetirer) ; les mois d'avant gardent l'ancien montant. Une nouvelle ligne vaut pour tous les mois.
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
  var MAX = 8, MOIS = OC.MOIS, f3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function dt(v) { return f3.format(Math.round(v * 1000) / 1000).replace(/[  ]/g, " "); }
  function lire(t) { var n = Number(String(t || "").replace(/[\s  ]/g, "").replace(",", ".")); return isFinite(n) && n >= 0 ? n : null; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function moisTxt(cle) { return MOIS[+cle.slice(5, 7) - 1] + " " + cle.slice(0, 4); }
  function cleAujourdhui() { var m = new Date(); return OC.cleMois(m.getFullYear(), m.getMonth()); }

  /* Toutes les lignes du profil (en cours, terminées, à venir) ; une ligne vide qu'on vient d'ajouter y figure aussi. */
  var etat = { lignes: { sociales: [], gains: [], nettes: [] }, impot: { actif: false, irpp: 0, css: 0, brut: 0 } };
  /* Changement en attente de sa date : { g, i, op: "montant" | "retrait", montant }. */
  var attente = null, minuterie = null;

  function caisse(p) { return p && p.secteur === "public" ? "CNRPS" : "CNSS"; }
  /* Brut mensuel du salaire actuel, calculé sans l'impôt aligné (repère de la fiche). */
  function brutActuel(p) {
    try { return OC.salaire(OC.normaliser(Object.assign({}, p, { impotFiche: {} }))).brutMensuel; } catch (e) { return 0; }
  }

  /* Étiquette sous une ligne : depuis quand, montant d'avant, changement ou retrait à venir (annulable). */
  function etiquettes(v) {
    var x = v.ligne, h = [];
    if (!v.active && x.debut) h.push('<span class="lf-puce lf-puce--futur">à partir de <b>' + moisTxt(x.debut) + '</b> · <button type="button" class="lf__lien" data-lf-annuler-ligne="1">annuler</button></span>');
    else if (x.debut) h.push('<span class="lf-puce">depuis <b>' + moisTxt(x.debut) + "</b>" + (v.avant ? " · avant " + dt(v.avant.montant) + " DT" : "") + "</span>");
    if (v.suivante) h.push('<span class="lf-puce lf-puce--futur">passe à <b>' + dt(v.suivante.montant) + " DT</b> à partir de <b>" + moisTxt(v.suivante.debut) + '</b> · <button type="button" class="lf__lien" data-lf-annuler-futur="1">annuler</button></span>');
    else if (x.fin) h.push('<span class="lf-puce lf-puce--futur">retirée à partir de <b>' + moisTxt(OC.moisSuivant(x.fin)) + '</b> · <button type="button" class="lf__lien" data-lf-annuler-futur="1">annuler</button></span>');
    return h.length ? '<div class="lf__info">' + h.join("") + "</div>" : "";
  }

  /* Question « à partir de quel mois ? » (mois en cours par défaut ; deux ans avant, deux ans après). */
  function panneauHtml(g, x) {
    var ici = cleAujourdhui(), an = +ici.slice(0, 4), mo = +ici.slice(5, 7) - 1, montant = attente.op === "montant";
    var q = montant ? esc(x.libelle || "Cette ligne") + " : " + dt(x.montant) + " → " + dt(attente.montant) + " DT. À partir de quel mois ?" : esc(x.libelle || "Cette ligne") + " : retirée à partir de quel mois ?";
    var aide = montant ? "Les mois d'avant gardent " + dt(x.montant) + " DT : l'impôt et la paie de l'année restent exacts." : "Les mois d'avant la gardent : l'impôt et la paie de l'année restent exacts.";
    var ans = []; for (var a = an - 2; a <= an + 2; a++) ans.push('<option value="' + a + '"' + (a === an ? " selected" : "") + ">" + a + "</option>");
    return '<div class="lf-dt" role="group" aria-labelledby="lf-dt-q">' +
      '<p class="lf-dt__q" id="lf-dt-q">' + q + "<small>" + aide + "</small></p>" +
      '<div class="lf-dt__choix">' +
        '<div class="lf-dt__mois"><div class="saisie"><select id="lf-dt-mois" aria-label="Mois">' + MOIS.map(function (m, k) { return '<option value="' + k + '"' + (k === mo ? " selected" : "") + ">" + m.charAt(0).toUpperCase() + m.slice(1) + "</option>"; }).join("") + '</select><svg class="saisie__chevron" aria-hidden="true"><use href="/orbite/icones.svg#chevron"/></svg></div>' +
        '<div class="saisie"><select id="lf-dt-an" aria-label="Année">' + ans.join("") + '</select><svg class="saisie__chevron" aria-hidden="true"><use href="/orbite/icones.svg#chevron"/></svg></div></div>' +
        '<button type="button" class="bouton bouton--plein bouton--petit" data-lf-dt="appliquer">Appliquer</button>' +
        '<button type="button" class="bouton bouton--petit" data-lf-dt="erreur">' + (montant ? "C'était une erreur de saisie" : "C'était une erreur : supprimer") + "</button>" +
        '<button type="button" class="bouton bouton--fantome bouton--petit" data-lf-dt="annuler">Annuler</button>' +
      "</div></div>";
  }

  function ligneHtml(g, v) {
    var x = v.ligne, i = v.i, n = i + 1, enAttente = attente && attente.g === g.cle && attente.i === i;
    var montant = enAttente && attente.op === "montant" ? attente.montant : x.montant;
    return '<div class="lf__ligne" data-g="' + g.cle + '" data-i="' + i + '"' + (v.active ? "" : ' data-futur="1"') + ">" +
      '<div class="saisie"><input type="text" class="lf__lib" maxlength="40" autocomplete="off" placeholder="' + esc(g.exemple) + '" value="' + esc(x.libelle || "") + '" aria-label="' + esc(g.titre) + ", ligne " + n + ' : libellé"></div>' +
      '<div class="saisie lf__mt"><input type="text" class="lf__montant" inputmode="decimal" autocomplete="off" placeholder="0" data-m0="' + x.montant + '" value="' + (montant > 0 ? dt(montant) : "") + '" aria-label="' + esc(g.titre) + ", ligne " + n + ' : montant par mois"><span class="saisie__unite">DT</span></div>' +
      '<button type="button" class="bouton bouton--icone bouton--fantome lf__retirer" aria-label="Retirer la ligne ' + n + " (" + esc(g.titre) + ')"><svg aria-hidden="true"><use href="/orbite/icones.svg#fermer"/></svg></button></div>' +
      etiquettes(v) + (enAttente ? panneauHtml(g, x) : "");
  }

  function rendre(p) {
    var cs = caisse(p), ici = cleAujourdhui();
    bloc.innerHTML =
      '<div class="lf__tete"><span class="champ__lib" id="lf-titre">Autres lignes de ma fiche de paie</span><small>Pour que votre net soit celui de votre fiche, au millime. Montants par mois.</small></div>' +
      GROUPES.map(function (g) {
        var titre = g.cle === "sociales" ? "Retenues en plus de la " + cs : g.titre, vue = OC.ficheVue(etat.lignes[g.cle], ici);
        return '<section class="lf__groupe lf__groupe--' + g.cle + '" aria-labelledby="lf-t-' + g.cle + '">' +
          '<div class="lf__gt"><i aria-hidden="true"></i><span class="lf__gtt"><b id="lf-t-' + g.cle + '">' + esc(titre) + "</b><small>" + esc(g.aide) + '</small></span><span class="lf__total" data-total="' + g.cle + '"></span></div>' +
          vue.visibles.map(function (v) { return ligneHtml(g, v); }).join("") +
          (vue.visibles.length < MAX && etat.lignes[g.cle].length < OC.MAX_LIGNES_FICHE ? '<button type="button" class="lien-action lf__ajouter" data-lf-ajouter="' + g.cle + '"><svg aria-hidden="true"><use href="/orbite/icones.svg#plus"/></svg>Ajouter une ligne</button>' : "") +
          (vue.terminees.length ? '<details class="lf__passe"><summary>Lignes terminées (' + vue.terminees.length + ")</summary><ul>" + vue.terminees.map(function (t) {
            var x = t.ligne; return "<li>" + esc(x.libelle || "Ligne") + " : " + dt(x.montant) + " DT, " + (x.debut ? "de " + moisTxt(x.debut) + " à " : "jusqu'en ") + moisTxt(x.fin) + "</li>";
          }).join("") + "</ul></details>" : "") +
          "</section>";
      }).join("") +
      '<div class="lf__aligne">' +
        '<label class="interrupteur"><span><strong>Impôt aligné sur ma fiche</strong><small>Orbite reprend l\'IRPP et la CSS retenus par votre employeur pour le net du mois. Son propre calcul reste affiché à côté.</small></span><input type="checkbox" id="lf-aligne" role="switch"' + (etat.impot.actif ? " checked" : "") + '><span class="interrupteur__piste" aria-hidden="true"></span></label>' +
        '<div class="lf__duo" id="lf-impot"' + (etat.impot.actif ? "" : " hidden") + ">" +
          '<div class="champ"><label for="lf-irpp">IRPP du mois</label><div class="saisie"><input id="lf-irpp" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (etat.impot.irpp > 0 ? dt(etat.impot.irpp) : "") + '"><span class="saisie__unite">DT</span></div></div>' +
          '<div class="champ"><label for="lf-css">CSS du mois</label><div class="saisie"><input id="lf-css" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (etat.impot.css > 0 ? dt(etat.impot.css) : "") + '"><span class="saisie__unite">DT</span></div></div>' +
        "</div>" +
        '<p class="lf__ecart" id="lf-ecart" aria-live="polite" hidden></p>' +
      "</div>" +
      '<p class="profil-resume" id="lf-resume" aria-live="polite" hidden></p>';
    majTextes(p);
  }

  /* Totaux du mois en cours, écart d'impôt et net : recalculés à chaque changement, sans reconstruire les champs. */
  function majTextes(p, sy) {
    var ici = cleAujourdhui();
    GROUPES.forEach(function (g) {
      var t = etat.lignes[g.cle].filter(function (l) { return OC.ligneActive(l, ici); }).reduce(function (s, l) { return s + (l.montant || 0); }, 0), el = bloc.querySelector('[data-total="' + g.cle + '"]');
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

  /* Enregistre (lignes vides ignorées par le profil). repere : le brut de la fiche est repris du salaire actuel. */
  function enregistrer(repere, immediat) {
    clearTimeout(minuterie);
    minuterie = setTimeout(function () {
      var p = O.profil() || {}, impot = Object.assign({}, etat.impot);
      impot.brut = repere || !(p.impotFiche && p.impotFiche.brut > 0) ? brutActuel(p) : p.impotFiche.brut;
      O.majProfil({ lignesFiche: JSON.parse(JSON.stringify(etat.lignes)), impotFiche: impot });
    }, immediat ? 0 : 350);
  }
  function lireImpot() {
    var c = doc.getElementById("lf-aligne");
    etat.impot.actif = !!(c && c.checked);
    var ir = lire((doc.getElementById("lf-irpp") || {}).value), cs = lire((doc.getElementById("lf-css") || {}).value);
    etat.impot.irpp = ir || 0; etat.impot.css = cs || 0;
  }
  function ligneDe(el) { var d = el.closest(".lf__ligne") || el.closest(".lf__info") && el.closest(".lf__info").previousElementSibling; return d ? { g: d.getAttribute("data-g"), i: Number(d.getAttribute("data-i")), div: d } : null; }
  function refaire(focusSel) {
    rendre(O.profil() || {});
    var f = focusSel && bloc.querySelector(focusSel); if (f) f.focus();
  }

  bloc.addEventListener("input", function (e) {
    var el = e.target;
    if (el.id === "lf-irpp" || el.id === "lf-css") {
      el.setAttribute("aria-invalid", lire(el.value) == null && el.value.trim() ? "true" : "false");
      lireImpot(); majTextes(O.profil() || {}); enregistrer(true); return;
    }
    var L = ligneDe(el); if (!L) return;
    var x = etat.lignes[L.g][L.i];
    if (el.classList.contains("lf__lib")) {
      /* Renommer : la ligne et ses montants passés et à venir (même libellé) suivent. */
      var avant = x.libelle, nv = el.value.trim().slice(0, 40);
      etat.lignes[L.g].forEach(function (y) { if (y === x || (avant && y.libelle === avant)) y.libelle = nv; });
      majTextes(O.profil() || {}); enregistrer(false);
    } else if (el.classList.contains("lf__montant")) {
      var v = lire(el.value);
      el.setAttribute("aria-invalid", v == null && el.value.trim() ? "true" : "false");
      /* Ligne nouvelle (sans montant enregistré) : le montant s'applique tout de suite, à tous les mois. */
      if (!(Number(el.getAttribute("data-m0")) > 0) && v != null) { x.montant = Math.round(v * 1000) / 1000; majTextes(O.profil() || {}); enregistrer(false); }
    }
  });
  /* Montant d'une ligne déjà enregistrée changé : on demande à partir de quel mois (à la sortie du champ). */
  bloc.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "lf-aligne") {
      lireImpot();
      doc.getElementById("lf-impot").hidden = !etat.impot.actif;
      if (etat.impot.actif) { var f = doc.getElementById("lf-irpp"); if (f && !f.value) f.focus(); }
      enregistrer(true); return;
    }
    if (!el.classList.contains("lf__montant")) return;
    var L = ligneDe(el), m0 = Number(el.getAttribute("data-m0")), v = lire(el.value);
    if (!L || !(m0 > 0) || v == null || Math.abs(v - m0) < 0.0005) return;
    attente = { g: L.g, i: L.i, op: "montant", montant: Math.round(v * 1000) / 1000 };
    refaire("#lf-dt-mois");
  });
  bloc.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el.matches(".lf__montant, #lf-irpp, #lf-css")) { var v = lire(el.value); if (v != null && el.value.trim()) el.value = dt(v); }
  });
  bloc.addEventListener("keydown", function (e) { if (e.key === "Escape" && attente) { attente = null; refaire(); } });
  bloc.addEventListener("click", function (e) {
    var t = e.target, aj = t.closest("[data-lf-ajouter]"), ret = t.closest(".lf__retirer"), dtb = t.closest("[data-lf-dt]");
    var af = t.closest("[data-lf-annuler-futur]"), al = t.closest("[data-lf-annuler-ligne]");
    if (aj) {
      var g = aj.getAttribute("data-lf-ajouter");
      attente = null;
      etat.lignes[g].push({ libelle: "", montant: 0, debut: "", fin: "" });
      refaire('.lf__ligne[data-g="' + g + '"][data-i="' + (etat.lignes[g].length - 1) + '"] .lf__lib');
    } else if (ret) {
      var L = ligneDe(ret), x = etat.lignes[L.g][L.i];
      /* Ligne vide ou jamais enregistrée : retirée tout de suite ; sinon, à partir de quel mois ? */
      var enregistree = Number(L.div.querySelector(".lf__montant").getAttribute("data-m0")) > 0;
      if (!enregistree || !(x.montant > 0)) { etat.lignes[L.g].splice(L.i, 1); attente = null; refaire('[data-lf-ajouter="' + L.g + '"]'); enregistrer(false); }
      else { attente = { g: L.g, i: L.i, op: "retrait" }; refaire("#lf-dt-mois"); }
    } else if (dtb && attente) {
      var a = attente, quoi = dtb.getAttribute("data-lf-dt"), liste = etat.lignes[a.g];
      var mois = OC.cleMois(Number(doc.getElementById("lf-dt-an").value), Number(doc.getElementById("lf-dt-mois").value));
      if (quoi === "appliquer") etat.lignes[a.g] = a.op === "montant" ? OC.ficheChanger(liste, a.i, a.montant, mois) : OC.ficheRetirer(liste, a.i, mois);
      else if (quoi === "erreur") etat.lignes[a.g] = a.op === "montant" ? OC.ficheChanger(liste, a.i, a.montant, "") : OC.ficheRetirer(liste, a.i, "");
      attente = null;
      refaire('[data-lf-ajouter="' + a.g + '"]');
      if (quoi !== "annuler") {
        enregistrer(false, true);
        if (quoi === "appliquer") O.toast(a.op === "montant" ? "Nouveau montant à partir de " + moisTxt(mois) + "." : "Ligne retirée à partir de " + moisTxt(mois) + ".");
      }
    } else if (af || al) {
      var L2 = ligneDe(af || al);
      if (!L2) return;
      etat.lignes[L2.g] = af ? OC.ficheAnnulerFutur(etat.lignes[L2.g], L2.i) : OC.ficheRetirer(etat.lignes[L2.g], L2.i, "");
      attente = null;
      refaire('[data-lf-ajouter="' + L2.g + '"]');
      enregistrer(false, true);
    }
  });

  /* Profil chargé ou modifié ailleurs : on reprend ses lignes, sauf pendant la saisie dans le bloc ou une question en attente. */
  O.surProfil(function (sy, p) {
    if (bloc.contains(doc.activeElement) || attente) { majTextes(p, sy); return; }
    var pn = OC.normaliser(p);
    etat = { lignes: JSON.parse(JSON.stringify(pn.lignesFiche)), impot: Object.assign({}, pn.impotFiche) };
    rendre(p);
    majTextes(p, sy);
  });
})();
