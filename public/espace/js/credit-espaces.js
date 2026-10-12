/*
 * Orbite — module Crédit, point 5 (validé le 12 oct. 2026) : onglets « Simuler », « Mon projet immobilier »,
 * « Comparer mes offres », « Regrouper mes crédits ». Route : #credit?espace=projet|offres|regrouper.
 * Calculs : public/moteurs/credit/projets.js (pur, testé). Les règles (frais d'achat, indemnité, Premier logement)
 * sont celles validées par l'utilisateur ; toutes restent modifiables et « à confirmer » quand la source n'est pas officielle.
 */
(function () {
  "use strict";
  var O = window.Orbite, P = window.CreditProjets, OC = window.OrbiteCalcul, doc = document;
  if (!O || !P || !OC) return;
  var $ = O.$, F = O.F;
  var ESPACES = ["simuler", "projet", "offres", "regrouper"];
  var etat = { projet: null, offres: null, regrouper: null };

  /* ---------- Petits outils ---------- */
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var NB = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3, minimumFractionDigits: 3 }), N0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  var N2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  function sp(t) { return t.replace(/[  ]/g, " "); }
  function dt3(v) { return sp(NB.format(v)) + " DT"; }
  function dt0(v) { return sp(N0.format(Math.round(v))) + " DT"; }
  function pc(v) { return sp(N2.format(v)) + " %"; }
  function ico(n, cls) { return '<svg aria-hidden="true"' + (cls ? ' class="' + cls + '"' : "") + '><use href="/orbite/icones.svg#' + n + '"/></svg>'; }
  var uidN = 0; function uid(p) { return (p || "ce") + "-" + (++uidN); }
  function lire(el, def) { if (!el) return def; var l = F.lire(el.value); return l.valide && !l.vide ? l.valeur : def; }
  function champ(o) {
    var id = o.id || uid();
    return '<div class="champ' + (o.cls ? " " + o.cls : "") + '"><label for="' + id + '">' + o.lib + '</label><div class="saisie' + (o.grande ? " saisie--grande" : "") + '">' +
      '<input id="' + id + '" data-c="' + o.c + '" type="text" inputmode="' + (o.entier ? "numeric" : "decimal") + '" autocomplete="off" value="' + esc(o.valeur) + '">' +
      (o.unite ? '<span class="saisie__unite">' + o.unite + '</span>' : "") + '</div>' + (o.aide ? '<p class="champ__aide">' + o.aide + '</p>' : "") + '</div>';
  }
  function stat(lib, val, note, cls) { return '<div class="cr-stat' + (cls ? " " + cls : "") + '"><span class="cr-stat__lib">' + lib + '</span><strong class="cr-stat__val chiffre">' + val + '</strong>' + (note ? '<small class="cr-stat__note">' + note + '</small>' : "") + '</div>'; }
  function encart(type, icone, html) { return '<div class="encart cr-encart' + (type ? " encart--" + type : "") + '">' + ico(icone) + '<div>' + html + '</div></div>'; }
  function sy() { try { return O.synthese(); } catch (e) { return null; } }
  function profil() { try { return OC.normaliser(O.profil() || {}); } catch (e) { return OC.normaliser({}); } }
  function capaciteBanque() {
    var s = sy(), p = profil();
    if (!s || !s.capacite) return null;
    return s.capacite[p.baseBanque] || s.capacite.net;
  }
  function tauxType(cle) { try { var t = OC.tauxNouveaux(profil()); return t[cle].tauxPct; } catch (e) { return OC.TMM + ({ immo: 2.5, auto: 3, conso: 3.5 }[cle] || 3); } }
  function frais(v) { return Math.round(v * 1000) / 1000; }
  function saisie(v) { return F.saisie(v) || "0"; }
  var anti = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };

  /* ===================================================================
     Onglets
     =================================================================== */
  var tabs = $("credit-espaces");
  if (!tabs) return;
  function ouvrir(cle, focus) {
    if (ESPACES.indexOf(cle) === -1) cle = "simuler";
    ESPACES.forEach(function (c) {
      var t = $("ce-tab-" + c), p = $(c === "simuler" ? "credit-racine" : "credit-" + c), on = c === cle;
      t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      if (p) p.hidden = !on;
    });
    if (focus) $("ce-tab-" + cle).focus();
    if (cle === "projet") rendreProjet();
    if (cle === "offres") rendreOffres();
    if (cle === "regrouper") rendreRegrouper();
    requestAnimationFrame(function () { O.placerPastilles($("vue-credit")); });
  }
  function choisir(cle, focus) {
    var h = "#credit" + (cle === "simuler" ? "" : "?espace=" + cle);
    if (location.hash !== h) history.replaceState(null, "", h);
    ouvrir(cle, focus);
  }
  tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-espace]"); if (b) choisir(b.getAttribute("data-espace")); });
  tabs.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    var i = ESPACES.indexOf(doc.activeElement && doc.activeElement.getAttribute("data-espace"));
    var j = e.key === "Home" ? 0 : e.key === "End" ? ESPACES.length - 1 : (Math.max(0, i) + (e.key === "ArrowRight" ? 1 : ESPACES.length - 1)) % ESPACES.length;
    choisir(ESPACES[j], true);
  });
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "credit") return;
    var esp = e.detail.params.get("espace");
    /* Un lien vers un crédit (type, capital…) ouvre toujours l'onglet « Simuler ». */
    ouvrir(esp && ESPACES.indexOf(esp) !== -1 ? esp : "simuler");
  });

  /* Remplir l'onglet « Simuler » avec un crédit, puis y aller. */
  function simuler(e, toast) {
    if (window.OrbiteHistorique) window.OrbiteHistorique.avant("credit");
    var ok = window.ModuleCredit && window.ModuleCredit.charger(window.MoteurCredit.encoderLien(e, {}));
    if (O.detacherSimulation) O.detacherSimulation("credit");
    choisir("simuler");
    if (ok && toast) O.toast(toast, { detail: "Ctrl Z revient à la simulation d'avant." });
    var r = $("credit-racine"); if (r && r.scrollIntoView) r.scrollIntoView({ behavior: O.mouvementReduit && O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
    return ok;
  }

  /* ===================================================================
     Mon projet immobilier
     =================================================================== */
  function htmlProjet() {
    var cap = capaciteBanque(), s = sy(), reste = s && s.budget ? Math.max(0, s.budget.reste) : 0, R = P.FRAIS, PL = P.PREMIER;
    var ep = Math.round(reste * 0.5 / 10) * 10;
    return '<section class="panneau ce-panneau" aria-labelledby="ce-projet-titre">' +
      '<div class="cr-section-tete"><h2 id="ce-projet-titre">Mon projet immobilier</h2><p>De l\'apport au jour de la signature : tous les frais d\'un logement neuf acheté chez un promoteur.</p></div>' +
      '<div class="ce-grille">' +
        '<div class="ce-champs">' +
          champ({ lib: "Prix du logement (TTC)", c: "prix", valeur: saisie(250000), unite: "DT", grande: true, id: "ce-prix" }) +
          '<div class="grille-champs">' +
            champ({ lib: "Apport disponible", c: "apport", valeur: saisie(Math.round(profil().epargneDisponible || 30000)), unite: "DT", id: "ce-apport" }) +
            champ({ lib: "Durée du crédit", c: "ans", valeur: "20", unite: "ans", entier: true, id: "ce-ans" }) +
            champ({ lib: "Taux du crédit", c: "taux", valeur: saisie(Math.round(tauxType("immo") * 100) / 100), unite: "%", id: "ce-taux" }) +
            champ({ lib: "Épargne par mois pour l'apport", c: "epargne", valeur: saisie(ep), unite: "DT", id: "ce-epargne", aide: "Sert à calculer quand vous pourrez acheter." }) +
          '</div>' +
          '<label class="interrupteur"><span><strong>Programme « Premier logement »</strong><small>L\'État prête l\'apport (' + PL.partPct + ' % du prix). Conditions à confirmer auprès de votre banque.</small></span><input type="checkbox" id="ce-premier" data-c="premier"><span class="interrupteur__piste" aria-hidden="true"></span></label>' +
          '<details class="depliant ce-regles"><summary><span>Taux des frais et du programme<small>Valeurs par défaut validées, modifiables</small></span>' + ico("chevron", "chevron") + '</summary><div class="depliant__corps grille-champs">' +
            champ({ lib: "Droit d'enregistrement par page", c: "droitParPage", valeur: saisie(R.droitParPage), unite: "DT", id: "ce-r-page" }) +
            champ({ lib: "Nombre de pages de l'acte", c: "pages", valeur: String(R.pages), entier: true, id: "ce-r-pages" }) +
            champ({ lib: "Conservation foncière", c: "conservationPct", valeur: saisie(R.conservationPct), unite: "%", id: "ce-r-cons" }) +
            champ({ lib: "Acte (notaire ou avocat)", c: "actePct", valeur: saisie(R.actePct), unite: "%", id: "ce-r-acte" }) +
            champ({ lib: "Hypothèque de la banque", c: "hypothequePct", valeur: saisie(R.hypothequePct), unite: "% du prêt", id: "ce-r-hyp" }) +
            champ({ lib: "Frais de dossier bancaire", c: "dossierPct", valeur: saisie(R.dossierPct), unite: "% du prêt", id: "ce-r-dos" }) +
            champ({ lib: "Premier logement : prix maximal", c: "plafond", valeur: saisie(PL.plafond), unite: "DT", id: "ce-r-plafond" }) +
            champ({ lib: "Premier logement : taux du prêt de l'État", c: "tauxEtat", valeur: saisie(PL.tauxPct), unite: "%", id: "ce-r-tetat" }) +
            champ({ lib: "Premier logement : durée du prêt de l'État", c: "moisEtat", valeur: String(PL.mois), unite: "mois", entier: true, id: "ce-r-metat" }) +
          '</div></details>' +
        '</div>' +
        '<div class="ce-resultat" id="ce-projet-res" aria-live="polite"></div>' +
      '</div>' +
      '<p class="ce-note">' + ico("info") + 'Logement neuf chez un promoteur : jusqu\'à 500 000 DT, droit d\'enregistrement fixe ; au-delà, droit proportionnel « à confirmer avec le notaire ». Sources : barèmes publiés (Code des droits d\'enregistrement et de timbre, droits de conservation foncière) ; la TVA est comprise dans le prix TTC du promoteur. Capacité calculée sur votre profil (' + (cap ? dt0(cap.mensualiteMax) + " par mois" : "profil à compléter") + ').</p>' +
    '</section>';
  }
  function entreeProjet(racine) {
    function v(c, d) { return lire(racine.querySelector('[data-c="' + c + '"]'), d); }
    var R = P.FRAIS, PL = P.PREMIER;
    return {
      prix: v("prix", 0), apport: v("apport", 0), mois: Math.round(Math.max(1, Math.min(25, v("ans", 20))) * 12), tauxPct: v("taux", 10), epargneMensuelle: v("epargne", 0),
      regles: { droitParPage: v("droitParPage", R.droitParPage), pages: Math.round(v("pages", R.pages)), conservationPct: v("conservationPct", R.conservationPct),
        actePct: v("actePct", R.actePct), hypothequePct: v("hypothequePct", R.hypothequePct), dossierPct: v("dossierPct", R.dossierPct) },
      premier: { actif: $("ce-premier").checked, partPct: PL.partPct, plafond: v("plafond", PL.plafond), tauxPct: v("tauxEtat", PL.tauxPct), mois: Math.round(v("moisEtat", PL.mois)) }
    };
  }
  function calculerProjet() {
    var racine = $("credit-projet"), e = entreeProjet(racine), out = $("ce-projet-res");
    if (!(e.prix > 0)) { out.innerHTML = encart("", "info", "<p>Indiquez le prix du logement.</p>"); return; }
    var p = P.projet(e), cap = capaciteBanque(), capM = cap ? cap.mensualiteMax : null;
    etat.projet = { entree: e, res: p };
    var h = '<div class="cr-stats">' +
      stat("Coût total du projet", dt0(p.coutTotal), "prix + " + dt0(p.frais) + " de frais", "cr-stat--fort") +
      stat("Crédit nécessaire", dt0(p.credit), p.apportExcedent > 0 ? "l'apport couvre tout (" + dt0(p.apportExcedent) + " de reste)" : "frais bancaires compris") +
      stat("Mensualité", dt3(p.mensualite), e.mois / 12 + " ans à " + pc(e.tauxPct)) +
      (p.premier ? stat("Prêt de l'État", p.premier.eligible ? dt0(p.premier.montant) : "non éligible", p.premier.eligible ? dt3(p.premier.mensualite) + " par mois, " + p.premier.mois + " mois" : "prix au-dessus de " + dt0(p.premier.plafond)) : "") +
    '</div>';
    if (capM != null) {
      var ok = p.mensualiteTotale <= capM + 0.0005;
      h += encart(ok ? "succes" : "alerte", ok ? "valide" : "alerte", ok ? "<p><strong>Dans votre capacité</strong> : " + dt3(p.mensualiteTotale) + " par mois pour " + dt0(capM) + " possibles.</p>"
        : "<p><strong>Au-dessus de votre capacité</strong> : " + dt3(p.mensualiteTotale) + " par mois pour " + dt0(capM) + " possibles. Augmentez l'apport, allongez la durée ou attendez la date ci-dessous.</p>");
    }
    h += '<table class="ce-table"><caption>Les frais, un par un</caption><thead><tr><th scope="col">Frais</th><th scope="col">Règle</th><th scope="col" class="nb">Montant</th></tr></thead><tbody>' +
      p.lignes.map(function (l) { return '<tr><th scope="row">' + esc(l.libelle) + '</th><td>' + esc(l.detail) + '</td><td class="nb chiffre">' + dt3(l.montant) + '</td></tr>'; }).join("") +
      '</tbody><tfoot><tr><th scope="row" colspan="2">Total des frais</th><td class="nb chiffre">' + dt3(p.frais) + '</td></tr></tfoot></table>';
    if (p.aConfirmer) h += encart("alerte", "alerte", "<p>Au-delà de 500 000 DT, le droit d'enregistrement proportionnel est <strong>à confirmer avec le notaire</strong>.</p>");
    /* Quand pourrai-je acheter ? */
    if (cap) {
      var q = P.quandAcheter(Object.assign({}, e, { capacite: [{ mois: 0, mensualiteMax: cap.mensualiteMax }].concat((cap.paliers || []).map(function (x) { return { mois: x.mois, mensualiteMax: x.mensualiteMax }; })) }));
      var quand = q ? (q.mois === 0 ? "Dès aujourd'hui." : "En " + OC.MOIS[new Date(new Date().getFullYear(), new Date().getMonth() + q.mois, 1).getMonth()] + " " + new Date(new Date().getFullYear(), new Date().getMonth() + q.mois, 1).getFullYear() + ", dans " + q.mois + " mois.") : "Pas dans les 10 prochaines années avec ces chiffres.";
      h += '<div class="ce-quand">' + ico("horloge") + '<div><strong>Quand pourrai-je acheter ?</strong><p>' + quand + (q && q.mois > 0 ? " Votre apport aura atteint " + dt0(e.apport + e.epargneMensuelle * q.mois) + " et votre capacité " + dt0(q.capacite) + " par mois." : "") + '</p></div></div>';
    }
    h += '<div class="ce-actions"><button type="button" class="bouton bouton--plein bouton--petit" id="ce-projet-simuler">' + ico("calculatrice") + 'Simuler ce crédit</button>' +
      '<button type="button" class="bouton bouton--petit" id="ce-projet-dossier">' + ico("fiche") + 'Préparer mon dossier banque</button></div>';
    out.innerHTML = h;
  }
  function creditDuProjet() {
    var x = etat.projet; if (!x || !(x.res.credit > 0)) return null;
    return { type: "immo", capital: Math.round(x.res.credit), mois: x.entree.mois, taux: x.entree.tauxPct, periodicite: 1, amort: "constant" };
  }
  function rendreProjet() {
    var r = $("credit-projet");
    if (!r.getAttribute("data-pret")) {
      r.innerHTML = htmlProjet(); r.setAttribute("data-pret", "1");
      var re = anti(calculerProjet, 150);
      r.addEventListener("input", re); r.addEventListener("change", re);
      r.addEventListener("click", function (ev) {
        if (ev.target.closest("#ce-projet-simuler")) { var c = creditDuProjet(); if (c) simuler(c, "Votre crédit immobilier est prêt à simuler."); }
        if (ev.target.closest("#ce-projet-dossier")) { var c2 = creditDuProjet(); if (c2 && simuler(c2) && O.ouvrirDossier) setTimeout(O.ouvrirDossier, 200); }
      });
      r.querySelectorAll('input[inputmode="decimal"]').forEach(function (el) { el.addEventListener("blur", function () { var l = F.lire(el.value); if (l.valide && !l.vide) el.value = F.saisie(l.valeur) || "0"; }); });
    }
    calculerProjet();
  }

  /* ===================================================================
     Comparer mes offres
     =================================================================== */
  var MAX_OFFRES = 4;
  function offreLigne(i, of) {
    var o = of || {};
    return '<fieldset class="ce-offre" data-i="' + i + '"><legend><span class="ce-offre__lettre">' + "ABCD".charAt(i) + '</span>' +
      '<input class="ce-offre__nom" data-o="nom" type="text" maxlength="40" value="' + esc(o.nom || "Banque " + "ABCD".charAt(i)) + '" aria-label="Nom de l\'offre ' + "ABCD".charAt(i) + '"></legend>' +
      '<div class="bascule bascule--compacte" role="radiogroup" aria-label="Type de taux, offre ' + "ABCD".charAt(i) + '">' +
        '<label><input type="radio" name="ce-mode-' + i + '" data-o="mode" value="tmm"' + (o.mode !== "fixe" ? " checked" : "") + '><span>TMM + marge</span></label>' +
        '<label><input type="radio" name="ce-mode-' + i + '" data-o="mode" value="fixe"' + (o.mode === "fixe" ? " checked" : "") + '><span>Taux fixe</span></label><i class="bascule__pastille" aria-hidden="true"></i></div>' +
      '<div class="grille-champs grille-champs--4">' +
        '<div class="champ"><label for="ce-o' + i + '-t">' + (o.mode === "fixe" ? "Taux" : "Marge") + '</label><div class="saisie"><input id="ce-o' + i + '-t" data-o="taux" type="text" inputmode="decimal" autocomplete="off" value="' + esc(saisie(o.taux != null ? o.taux : 2.5)) + '"><span class="saisie__unite">%</span></div></div>' +
        '<div class="champ"><label for="ce-o' + i + '-fd">Frais de dossier</label><div class="saisie"><input id="ce-o' + i + '-fd" data-o="fraisDossierPct" type="text" inputmode="decimal" autocomplete="off" value="' + esc(saisie(o.fraisDossierPct != null ? o.fraisDossierPct : 1)) + '"><span class="saisie__unite">%</span></div></div>' +
        '<div class="champ"><label for="ce-o' + i + '-ff">Frais fixes</label><div class="saisie"><input id="ce-o' + i + '-ff" data-o="fraisFixes" type="text" inputmode="decimal" autocomplete="off" value="' + esc(saisie(o.fraisFixes || 0)) + '"><span class="saisie__unite">DT</span></div></div>' +
        '<div class="champ"><label for="ce-o' + i + '-as">Assurance</label><div class="saisie"><input id="ce-o' + i + '-as" data-o="assurancePct" type="text" inputmode="decimal" autocomplete="off" value="' + esc(saisie(o.assurancePct != null ? o.assurancePct : 0.3)) + '"><span class="saisie__unite">% / an</span></div></div>' +
      '</div>' +
      '<div class="ce-offre__actions"><label class="bouton bouton--petit bouton--fantome">' + ico("photo") + '<span>Lire l\'offre (photo, PDF)</span><input type="file" accept="application/pdf,image/*" data-lire-offre class="cache"></label>' +
        (i > 1 ? '<button type="button" class="bouton bouton--petit bouton--fantome" data-retirer>' + ico("poubelle") + 'Retirer</button>' : "") +
        '<span class="ce-offre__etat" data-etat role="status"></span></div>' +
    '</fieldset>';
  }
  function htmlOffres() {
    var sc = window.ModuleCredit && window.ModuleCredit.resume ? window.ModuleCredit.resume() : null;
    var cap = sc && sc.secondaires ? (sc.secondaires.filter(function (x) { return /Capital/.test(x.libelle); })[0] || {}).valeur : 0;
    var dur = sc && sc.secondaires ? (sc.secondaires.filter(function (x) { return /Durée/.test(x.libelle); })[0] || {}).valeur : 0;
    return '<section class="panneau ce-panneau" aria-labelledby="ce-offres-titre">' +
      '<div class="cr-section-tete"><h2 id="ce-offres-titre">Comparer mes offres</h2><p>Même montant, plusieurs banques : classées par coût total (intérêts, frais et assurance). TMM du mois : ' + pc(OC.TMM) + '.</p></div>' +
      '<div class="grille-champs">' + champ({ lib: "Montant emprunté", c: "capital", valeur: saisie(cap > 0 ? cap : 150000), unite: "DT", id: "ce-o-capital" }) +
        champ({ lib: "Durée", c: "ans", valeur: String(dur > 0 ? Math.max(1, Math.round(dur / 12)) : 20), unite: "ans", entier: true, id: "ce-o-ans" }) + '</div>' +
      '<div class="ce-offres" id="ce-offres-liste">' + [0, 1].map(function (i) { return offreLigne(i, i === 1 ? { nom: "Banque B", mode: "fixe", taux: Math.round((OC.TMM + 2.3) * 100) / 100, fraisDossierPct: 0.5, fraisFixes: 300, assurancePct: 0.25 } : null); }).join("") + '</div>' +
      '<button type="button" class="bouton bouton--petit" id="ce-offre-plus">' + ico("plus") + 'Ajouter une offre</button>' +
      '<div class="ce-resultat ce-resultat--large" id="ce-offres-res" aria-live="polite"></div>' +
    '</section>';
  }
  function lireOffres() {
    var r = $("credit-offres");
    return [].slice.call(r.querySelectorAll(".ce-offre")).map(function (f) {
      var g = function (k) { return f.querySelector('[data-o="' + k + '"]'); }, mode = (f.querySelector('[data-o="mode"]:checked') || {}).value || "tmm", t = lire(g("taux"), NaN);
      return { nom: (g("nom").value || "").trim().slice(0, 40) || "Offre", mode: mode, taux: mode === "fixe" ? t : undefined, marge: mode === "tmm" ? t : undefined,
        fraisDossierPct: lire(g("fraisDossierPct"), 0), fraisFixes: lire(g("fraisFixes"), 0), assurancePct: lire(g("assurancePct"), 0), assuranceBase: "initial" };
    });
  }
  function calculerOffres() {
    var r = $("credit-offres"), out = $("ce-offres-res");
    var capital = lire(r.querySelector('[data-c="capital"]'), 0), mois = Math.round(Math.max(1, Math.min(25, lire(r.querySelector('[data-c="ans"]'), 20))) * 12);
    var offres = lireOffres(), res = P.comparer({ capital: capital, mois: mois, tmm: OC.TMM, offres: offres });
    etat.offres = { capital: capital, mois: mois, offres: offres, res: res };
    if (!res || res.classement.length < 1) { out.innerHTML = encart("", "info", "<p>Complétez le montant, la durée et au moins une offre.</p>"); return; }
    var max = res.classement[res.classement.length - 1].coutCredit || 1, prem = res.classement[0];
    var h = '<table class="ce-table ce-table--offres"><caption>Classement par coût total</caption><thead><tr><th scope="col">Offre</th><th scope="col">Taux</th><th scope="col" class="nb">Mensualité</th><th scope="col" class="nb">Frais + assurance</th><th scope="col" class="nb">Coût total</th></tr></thead><tbody>' +
      res.classement.map(function (o, k) {
        return '<tr' + (k === 0 ? ' class="ce-meilleure"' : "") + '><th scope="row">' + (k === 0 ? '<span class="ce-badge">' + ico("valide") + 'la moins chère</span>' : "") + esc(o.nom) + '</th>' +
          '<td>' + (o.variable ? "TMM + " + pc(o.marge) + " (" + pc(o.taux) + ")" : pc(o.taux) + " fixe") + (isFinite(o.teg) ? '<small>TEG ' + pc(Math.round(o.teg * 100) / 100) + '</small>' : "") + '</td>' +
          '<td class="nb chiffre">' + dt3(o.mensualiteAvecAssurance) + (o.plusUnPoint ? '<small>TMM +1 point : +' + dt3(o.plusUnPoint.ecart) + '</small>' : "") + '</td>' +
          '<td class="nb chiffre">' + dt0(o.frais + o.coutAssurance) + '</td><td class="nb chiffre"><strong>' + dt0(o.coutCredit) + '</strong>' +
          '<span class="ce-barre"><i data-largeur="' + Math.round(o.coutCredit / max * 1000) / 10 + '"></i></span></td></tr>';
      }).join("") + '</tbody></table>';
    if (res.classement.length > 1) {
      var der = res.classement[res.classement.length - 1], m = res.mensualiteLaPlusBasse;
      var phrase = "<p><strong>" + esc(prem.nom) + "</strong> coûte le moins au total : " + dt0(der.coutCredit - prem.coutCredit) + " de moins que " + esc(der.nom) + ".";
      if (m !== prem) phrase += " " + esc(m.nom) + " a une mensualité plus basse, mais coûte " + dt0(m.coutCredit - prem.coutCredit) + " de plus au total" + (m.variable ? ", et son taux suit le TMM" : "") + ".";
      out.innerHTML = h + encart("succes", "valide", phrase + "</p>");
    } else out.innerHTML = h;
    out.querySelectorAll(".ce-barre i").forEach(function (i) { i.style.setProperty("--l", i.getAttribute("data-largeur") + "%"); });
    out.insertAdjacentHTML("beforeend", '<div class="ce-actions"><button type="button" class="bouton bouton--petit" id="ce-offres-simuler">' + ico("calculatrice") + 'Simuler la moins chère</button>' +
      '<button type="button" class="bouton bouton--plein bouton--petit" id="ce-offres-enregistrer">' + ico("enregistrer") + 'Enregistrer les offres dans mes simulations</button></div>');
  }
  function entreeOffre(o, capital, mois) {
    var e = { type: "immo", capital: capital, mois: mois, taux: o.taux, periodicite: 1, amort: "constant" };
    if (o.variable) e.tmm = { tmm: OC.TMM, marge: o.marge };
    if (o.fraisDossierPct > 0 || o.fraisFixes > 0) e.frais = { dossierPct: o.fraisDossierPct || 0, dossierFixe: o.fraisFixes || 0, garantie: 0, autres: 0 };
    if (o.assurancePct > 0) e.assurance = { taux: o.assurancePct, base: "initial" };
    return e;
  }
  function enregistrerOffres() {
    var x = etat.offres, E = window.Espace;
    if (!x || !x.res || !E || !E.simulations) return;
    var b = $("ce-offres-enregistrer"); b.disabled = true;
    var travaux = x.res.offres.map(function (o) {
      var src = x.offres[o.i], e = entreeOffre(Object.assign({}, o, { fraisDossierPct: src.fraisDossierPct, fraisFixes: src.fraisFixes, assurancePct: src.assurancePct }), x.capital, x.mois);
      var resume = { principal: { libelle: "Mensualité (assurance comprise)", valeur: Math.round(o.mensualiteAvecAssurance * 1000) / 1000, unite: "DT" },
        secondaires: [{ libelle: "Capital emprunté", valeur: x.capital, unite: "DT" }, { libelle: "Durée", valeur: x.mois, unite: "mois" },
          { libelle: "Taux nominal", valeur: Math.round(o.taux * 1000) / 1000, unite: "%" }, { libelle: "Coût du crédit", valeur: Math.round(o.coutCredit), unite: "DT" }],
        ligne: ("Offre " + o.nom + " · " + dt0(x.capital) + " sur " + x.mois / 12 + " ans").slice(0, 140) };
      return E.simulations.creer("credit", ("Offre " + o.nom).slice(0, 120), window.MoteurCredit.encoderLien(e, {}), resume);
    });
    Promise.all(travaux).then(function () {
      O.toast(travaux.length + " offres enregistrées dans vos simulations.", { type: "ok", detail: "Simulations › Comparer pour les revoir côte à côte." });
      if (window.OrbiteSimulations) window.OrbiteSimulations.recharger();
    }).catch(function (er) { O.toast((window.EFModele && window.EFModele.messageErreur(er)) || "Enregistrement impossible.", { erreur: true }); })
      .finally(function () { b.disabled = false; });
  }
  function lireOffreFichier(fs, fichier) {
    var st = fs.querySelector("[data-etat]"), FL = window.FicheLecture, CA = window.CreditAudit;
    if (!FL || !CA || !fichier) return;
    st.textContent = "Lecture sur votre appareil…";
    FL.lire(fichier, { pagesMax: 3, progres: function (e, x) { st.textContent = "Lecture… " + Math.round((x || 0) * 100) + " %"; } }).then(function (res) {
      var a = CA.analyserOffre(CA.texteDeLignes(res.lignes)), trouve = [];
      function poser(k, v) { var el = fs.querySelector('[data-o="' + k + '"]'); if (el && v != null && isFinite(v)) { el.value = F.saisie(v) || "0"; trouve.push(k); } }
      if (a.marge != null) { fs.querySelector('[data-o="mode"][value="tmm"]').checked = true; poser("taux", a.marge); }
      else if (a.taux != null) { fs.querySelector('[data-o="mode"][value="fixe"]').checked = true; poser("taux", a.taux); }
      if (a.fraisPct != null) poser("fraisDossierPct", a.fraisPct);
      if (a.fraisFixe != null) poser("fraisFixes", a.fraisFixe);
      if (a.assurance != null) poser("assurancePct", a.assurance);
      st.textContent = trouve.length ? "Lu : vérifiez les valeurs remplies." : "Rien de reconnu : remplissez à la main.";
      O.placerPastilles(fs);
      calculerOffres();
    }).catch(function (e) { st.textContent = (e && e.message) || "Lecture impossible."; });
  }
  function rendreOffres() {
    var r = $("credit-offres");
    if (!r.getAttribute("data-pret")) {
      r.innerHTML = htmlOffres(); r.setAttribute("data-pret", "1");
      var re = anti(calculerOffres, 150);
      r.addEventListener("input", re);
      r.addEventListener("change", function (ev) {
        var f = ev.target.closest(".ce-offre");
        if (ev.target.matches("[data-lire-offre]")) { lireOffreFichier(f, ev.target.files && ev.target.files[0]); ev.target.value = ""; return; }
        if (ev.target.matches('[data-o="mode"]')) { f.querySelector('label[for$="-t"]').textContent = ev.target.value === "fixe" ? "Taux" : "Marge"; O.placerPastilles(f); }
        re();
      });
      r.addEventListener("click", function (ev) {
        if (ev.target.closest("#ce-offre-plus")) {
          var l = $("ce-offres-liste"), n = l.querySelectorAll(".ce-offre").length;
          if (n >= MAX_OFFRES) return;
          l.insertAdjacentHTML("beforeend", offreLigne(n, { nom: "Banque " + "ABCD".charAt(n) }));
          $("ce-offre-plus").hidden = n + 1 >= MAX_OFFRES;
          O.placerPastilles(l); calculerOffres();
          l.lastElementChild.querySelector(".ce-offre__nom").focus();
        }
        if (ev.target.closest("[data-retirer]")) {
          ev.target.closest(".ce-offre").remove();
          $("ce-offres-liste").querySelectorAll(".ce-offre").forEach(function (f, i) { f.setAttribute("data-i", i); f.querySelector(".ce-offre__lettre").textContent = "ABCD".charAt(i); });
          $("ce-offre-plus").hidden = false; calculerOffres();
        }
        if (ev.target.closest("#ce-offres-simuler")) {
          var x = etat.offres; if (!x || !x.res) return;
          var m = x.res.classement[0], s = x.offres[m.i];
          simuler(entreeOffre(Object.assign({}, m, s), x.capital, x.mois), "L'offre « " + m.nom + " » est prête à simuler.");
        }
        if (ev.target.closest("#ce-offres-enregistrer")) enregistrerOffres();
      });
      O.placerPastilles(r);
    }
    calculerOffres();
  }

  /* ===================================================================
     Regrouper mes crédits
     =================================================================== */
  function creditsProfil() {
    var p = profil();
    return p.credits.filter(function (c) { return c.mensualite > 0 && c.moisRestants > 0; });
  }
  function htmlRegrouper() {
    var cr = creditsProfil();
    if (!cr.length) return '<section class="panneau ce-panneau"><div class="cr-section-tete"><h2>Regrouper mes crédits</h2><p>Un seul crédit à la place de plusieurs.</p></div>' +
      encart("", "info", '<p>Aucun crédit en cours dans votre profil. Ajoutez-les dans <a href="#profil?section=credits">Mon profil › Crédits</a> : le regroupement part de là, rien à ressaisir.</p>') + '</section>';
    var immo = cr.some(function (c) { return c.type === "immo"; });
    return '<section class="panneau ce-panneau" aria-labelledby="ce-reg-titre">' +
      '<div class="cr-section-tete"><h2 id="ce-reg-titre">Regrouper mes crédits</h2><p>Un seul crédit à la place de plusieurs : mensualité et coût total, indemnités et frais compris. Vos crédits viennent de votre profil.</p></div>' +
      '<fieldset class="ce-credits"><legend>Crédits à regrouper</legend>' + cr.map(function (c, i) {
        return '<label class="ce-credit"><input type="checkbox" data-cr="' + i + '"' + (c.type === "immo" ? "" : " checked") + '><span><b>' + esc(c.libelle) + '</b><small>' + dt3(c.mensualite) + ' par mois · ' + c.moisRestants + ' mois restants · ' + pc(c.tauxPct) + '</small></span></label>';
      }).join("") + (immo ? '<p class="champ__aide">Le crédit immobilier est décoché par défaut : regroupé, il allonge souvent tout le reste.</p>' : "") + '</fieldset>' +
      '<div class="grille-champs grille-champs--4">' +
        champ({ lib: "Taux du nouveau crédit", c: "taux", valeur: saisie(Math.round(tauxType("conso") * 100) / 100), unite: "%", id: "ce-r-taux" }) +
        champ({ lib: "Durée du nouveau crédit", c: "ans", valeur: "5", unite: "ans", entier: true, id: "ce-r-ans" }) +
        champ({ lib: "Indemnité de remboursement anticipé", c: "ira", valeur: saisie(P.IRA_PCT), unite: "%", id: "ce-r-ira", aide: "Fixée par chaque contrat : vérifiez le vôtre." }) +
        champ({ lib: "Frais du nouveau dossier", c: "fraisDossier", valeur: saisie(150), unite: "DT", id: "ce-r-frais" }) +
      '</div>' +
      '<div class="ce-resultat ce-resultat--large" id="ce-reg-res" aria-live="polite"></div>' +
    '</section>';
  }
  function calculerRegrouper() {
    var r = $("credit-regrouper"), out = $("ce-reg-res");
    if (!out) return;
    var cr = creditsProfil(), choisis = {};
    r.querySelectorAll("[data-cr]").forEach(function (c) { choisis[c.getAttribute("data-cr")] = c.checked; });
    var v = function (c, d) { return lire(r.querySelector('[data-c="' + c + '"]'), d); };
    var res = P.regrouper({ credits: cr.map(function (c, i) { return Object.assign({}, c, { inclus: !!choisis[i] }); }), tauxPct: v("taux", 10),
      mois: Math.round(Math.max(1, Math.min(25, v("ans", 5))) * 12), iraPct: v("ira", P.IRA_PCT), fraisDossier: v("fraisDossier", 150) });
    etat.regrouper = res;
    if (!res) { out.innerHTML = encart("", "info", "<p>Cochez au moins un crédit.</p>"); return; }
    var h = '<table class="ce-table"><caption>Ce qui est remboursé</caption><thead><tr><th scope="col">Crédit</th><th scope="col" class="nb">Restant dû</th><th scope="col" class="nb">Indemnité (' + pc(res.iraPct) + ')</th><th scope="col" class="nb">Reste à payer</th></tr></thead><tbody>' +
      res.lignes.map(function (l) { return '<tr><th scope="row">' + esc(l.libelle) + '</th><td class="nb chiffre">' + dt3(l.restantDu) + '</td><td class="nb chiffre">' + dt3(l.indemnite) + '</td><td class="nb chiffre">' + dt3(l.resteAPayer) + '</td></tr>'; }).join("") +
      '</tbody><tfoot><tr><th scope="row">Nouveau crédit</th><td class="nb chiffre" colspan="3">' + dt3(res.capital) + ' <small>dont ' + dt0(res.indemnites) + ' d\'indemnités et ' + dt0(res.fraisDossier) + ' de frais</small></td></tr></tfoot></table>' +
      '<div class="cr-stats">' + stat("Mensualités aujourd'hui", dt3(res.mensualiteAvant), "jusqu'à " + res.finAvantMois + " mois") +
        stat("Nouvelle mensualité", dt3(res.mensualiteApres), res.mois + " mois", "cr-stat--fort") +
        stat(res.difference > 0 ? "Coût en plus" : "Coût en moins", dt0(Math.abs(res.difference)), "sur toute la durée", res.difference > 0 ? "" : "cr-stat--ok") + '</div>';
    var t = { gagnant: ["succes", "valide", "Regrouper est gagnant : la mensualité baisse de " + dt3(res.gainMensuel) + " et le coût total de " + dt0(-res.difference) + "."],
      moins_cher_mensualite_plus_haute: ["succes", "valide", "Regrouper coûte " + dt0(-res.difference) + " de moins au total, mais la mensualité monte de " + dt3(-res.gainMensuel) + "."],
      mensualite_baisse_cout_monte: ["alerte", "alerte", "Attention : la mensualité baisse de " + dt3(res.gainMensuel) + ", mais le regroupement coûte <strong>" + dt0(res.difference) + " de plus</strong> au total (durée plus longue, indemnités et frais). Utile seulement si votre budget est trop serré."],
      perdant: ["alerte", "alerte", "Regrouper ne vaut pas le coup : la mensualité monte et le coût total aussi (" + dt0(res.difference) + " de plus)."] }[res.verdict];
    out.innerHTML = h + encart(t[0], t[1], "<p>" + t[2] + "</p>") + '<div class="ce-actions"><button type="button" class="bouton bouton--petit" id="ce-reg-simuler">' + ico("calculatrice") + 'Simuler le nouveau crédit</button></div>';
  }
  function rendreRegrouper() {
    var r = $("credit-regrouper");
    r.innerHTML = htmlRegrouper(); r.setAttribute("data-pret", "1");
    if (!r.getAttribute("data-ecoute")) {
      r.setAttribute("data-ecoute", "1");
      var re = anti(calculerRegrouper, 150);
      r.addEventListener("input", re); r.addEventListener("change", re);
      r.addEventListener("click", function (ev) {
        if (!ev.target.closest("#ce-reg-simuler") || !etat.regrouper) return;
        var x = etat.regrouper;
        simuler({ type: "conso", capital: Math.round(x.capital), mois: x.mois, taux: x.tauxPct, periodicite: 1, amort: "constant" }, "Le crédit de regroupement est prêt à simuler.");
      });
    }
    calculerRegrouper();
  }
  /* Le profil change (crédits ajoutés…) : l'onglet ouvert se recalcule. */
  if (O.surProfil) O.surProfil(function () {
    if ($("credit-regrouper") && !$("credit-regrouper").hidden && $("credit-regrouper").getAttribute("data-pret")) rendreRegrouper();
    if ($("credit-projet") && !$("credit-projet").hidden && $("credit-projet").getAttribute("data-pret")) calculerProjet();
  });

  window.OrbiteCreditEspaces = { ouvrir: choisir };
})();
