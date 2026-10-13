/*
 * Orbite — comparateur de banques (Crédit › Banques, #credit?espace=banques ; maquette validée le 13 oct. 2026).
 * Même salaire, mêmes crédits en cours : combien chaque banque prêterait selon sa règle (net ou brut, salaire du mois
 * ou salaires et primes de l'année ÷ 12, quotité). Banques nommées et réglées par l'utilisateur, gardées dans le profil.
 * Orbite ne connaît pas les règles internes des banques : rien n'est attribué à une banque réelle.
 * Calculs : DeciderCalcul.banques (pur, testé).
 */
(function () {
  "use strict";
  var O = window.Orbite, D = window.DeciderCalcul, doc = document;
  if (!O || !D) return;
  var F = O.F, $ = O.$;
  var type = "immo", liste = null, sauver = null;
  var TYPES = { immo: "Crédit immobilier", auto: "Auto", conso: "Consommation" };

  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function dt(v) { return F.dt0(v) + " DT"; }
  function ans(m) { var a = Math.floor(m / 12), r = m % 12; return a ? a + " ans" + (r ? " " + r + " mois" : "") : r + " mois"; }
  function pct(v) { return String(Math.round(v * 100) / 100).replace(".", ",") + " %"; }
  function sel(nom, val, opts, lib) {
    return '<div class="saisie"><select data-b="' + nom + '" aria-label="' + lib + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
      '</select><svg class="saisie__chevron" aria-hidden="true"><use href="/orbite/icones.svg#chevron"/></svg></div>';
  }
  function courante() {
    var p = O.profil(); if (!p) return [];
    if (!liste) liste = (p.banques && p.banques.length ? p.banques : D.banquesParDefaut(p)).map(function (b) { return Object.assign({}, b); });
    return liste;
  }

  function squelette() {
    var z = $("credit-banques"); if (!z || z.querySelector(".cb")) return;
    z.innerHTML = '<section class="panneau ce-panneau cb" aria-labelledby="cb-titre">' +
      '<div class="cr-section-tete"><h2 id="cb-titre">Combien chaque banque vous prêterait ?</h2>' +
      "<p>Chaque banque a sa règle : sur le net ou le brut, sur le salaire du mois ou sur l'année (primes comprises ÷ 12), et sa quotité. Même salaire, montants très différents.</p></div>" +
      '<div class="cb-types" id="cb-types" role="radiogroup" aria-label="Type de crédit"></div>' +
      '<div class="cb-tete" aria-hidden="true"><span>Banque</span><span>Base</span><span>Revenu retenu</span><span>Quotité</span><span>Elle vous prête</span></div>' +
      '<ol class="cb-liste" id="cb-liste" role="list"></ol>' +
      '<button type="button" class="lien-action cb-plus" id="cb-plus">+ Ajouter une banque</button>' +
      '<div class="dc-barres cb-barres" id="cb-barres"></div>' +
      '<div class="dc-conseil" id="cb-avis" aria-live="polite"></div>' +
      '<p class="dc-note" id="cb-note"></p></section>';
    $("cb-types").addEventListener("click", function (e) { var b = e.target.closest("[data-type]"); if (!b) return; type = b.getAttribute("data-type"); rendre(); });
    $("cb-plus").addEventListener("click", function () {
      var L = courante(); if (L.length >= D.MAX_BANQUES) return;
      L.push({ nom: "Banque " + String.fromCharCode(65 + L.length), base: "brut", revenu: "annee", quotite: 0.4 });
      enregistrer(); rendre(true);
    });
    var z2 = $("cb-liste");
    z2.addEventListener("change", lireLigne);
    z2.addEventListener("input", function (e) { if (e.target.matches("[data-b=quotite], [data-b=nom]")) lireLigne(e); });
    z2.addEventListener("click", function (e) {
      var b = e.target.closest("[data-retirer]"); if (!b) return;
      courante().splice(+b.getAttribute("data-retirer"), 1); enregistrer(); rendre(true);
    });
  }

  function lireLigne(e) {
    var li = e.target.closest("[data-i]"); if (!li) return;
    var b = courante()[+li.getAttribute("data-i")], k = e.target.getAttribute("data-b"); if (!b || !k) return;
    if (k === "nom") b.nom = e.target.value.slice(0, 30);
    else if (k === "quotite") { var v = F.lire(e.target.value); if (!v.valide || v.vide) return; b.quotite = Math.min(0.8, Math.max(0.1, v.valeur / 100)); }
    else b[k] = e.target.value;
    enregistrer(); rendre(false);
  }
  function enregistrer() {
    clearTimeout(sauver);
    sauver = setTimeout(function () { O.majProfil({ banques: courante().map(function (b) { return { nom: b.nom, base: b.base, revenu: b.revenu, quotite: b.quotite }; }) }); }, 400);
  }

  function rendre(structure) {
    var z = $("credit-banques"); if (!z || z.hidden) return;
    var sy = O.synthese(); if (!sy) return;
    squelette();
    var r = D.banques(sy, courante(), type), max = r.max || 1;
    var c0 = r.lignes[0] || {};
    /* Puces : créées une fois puis mises à jour sur place (un clic n'est jamais perdu pendant un nouveau rendu). */
    var zt = $("cb-types");
    if (!zt.children.length) zt.innerHTML = Object.keys(TYPES).map(function (k) { return '<button type="button" role="radio" class="dc-puce" data-type="' + k + '"></button>'; }).join("");
    Object.keys(TYPES).forEach(function (k) {
      var l = D.banques(sy, courante().slice(0, 1), k).lignes[0] || {}, b = zt.querySelector('[data-type="' + k + '"]');
      b.classList.toggle("dc-puce--on", k === type); b.setAttribute("aria-checked", String(k === type));
      b.textContent = TYPES[k] + (l.dureeMois ? " · " + ans(l.dureeMois) + " · " + pct(l.tauxPct) : "");
    });
    /* Lignes : reconstruites seulement si leur nombre change (la saisie en cours garde le focus). */
    var ol = $("cb-liste");
    if (structure !== false || ol.children.length !== r.lignes.length) {
      ol.innerHTML = r.lignes.map(function (x, i) {
        return '<li class="cb-ligne" data-i="' + i + '">' +
          '<div class="saisie cb-nom"><input type="text" data-b="nom" maxlength="30" value="' + esc(courante()[i].nom) + '" aria-label="Nom de la banque ' + (i + 1) + '"></div>' +
          sel("base", x.base, [["net", "Net"], ["brut", "Brut"]], "Base de calcul") +
          sel("revenu", x.revenu, [["mois", "Mois"], ["annee", "Année ÷ 12"]], "Revenu retenu") +
          '<div class="saisie cb-q"><input type="text" inputmode="decimal" data-b="quotite" value="' + String(Math.round(x.quotite * 1000) / 10).replace(".", ",") + '" aria-label="Quotité"><span class="saisie__unite">%</span></div>' +
          '<div class="cb-v"><strong class="chiffre"></strong><small></small></div>' +
          (i > 0 ? '<button type="button" class="cb-x" data-retirer="' + i + '" aria-label="Retirer ' + esc(courante()[i].nom) + '">×</button>' : '<span class="cb-x" aria-hidden="true"></span>') + "</li>";
      }).join("");
    }
    r.lignes.forEach(function (x, i) {
      var li = ol.children[i]; if (!li) return;
      li.classList.toggle("cb-ligne--top", i === r.meilleur && r.ecart > 1);
      li.querySelector(".cb-v strong").textContent = F.dt0(x.capital);
      li.querySelector(".cb-v small").textContent = x.mensualite > 0 ? F.dt0(x.mensualite) + " DT par mois" : "aucune marge";
    });
    $("cb-plus").hidden = r.lignes.length >= D.MAX_BANQUES;
    /* Barres : mêmes éléments, la largeur glisse. */
    var zb = $("cb-barres"), sig = r.lignes.length;
    if (+zb.getAttribute("data-n") !== sig) {
      zb.innerHTML = r.lignes.map(function (x, i) { return '<div class="dc-barre" data-k="' + i + '"><span></span><i class="dc-barre__b dc-barre__b--rembourser"></i><span></span></div>'; }).join("");
      zb.setAttribute("data-n", String(sig));
    }
    r.lignes.forEach(function (x, i) {
      var b = zb.querySelector('[data-k="' + i + '"]'); if (!b) return;
      b.firstChild.textContent = x.nom; b.lastChild.textContent = F.dt0(x.capital);
      b.querySelector("i").style.setProperty("--l", (Math.max(0.03, x.capital / max) * 100).toFixed(2) + "%");
    });
    var best = r.lignes[r.meilleur] || c0, av = $("cb-avis");
    if (r.ecart < 1) av.innerHTML = "<b>Toutes vos banques prêtent la même somme</b><p>Leurs règles reviennent au même pour votre salaire.</p>";
    else {
      var regle = (best.base === "brut" ? "le brut" : "le net") + (best.revenu === "annee" ? " et vos " + sy.profil.nombreSalaires + " salaires de l'année" : " du mois");
      var fois = c0.capital > 0 ? best.capital / c0.capital : 0;
      av.innerHTML = "<b>Jusqu'à " + esc(dt(r.ecart)) + " de plus selon la banque</b><p>" + esc(r.meilleur === 0
        ? "Votre banque a déjà la règle la plus favorable pour vous parmi celles-ci."
        : "Une banque qui compte " + regle + " vous prête " + (fois >= 1.5 ? (Math.round(fois * 10) / 10).toString().replace(".", ",") + " fois plus" : dt(best.capital - c0.capital) + " de plus") + " que « " + c0.nom + " ». Demandez la règle exacte avant de déposer votre dossier.") + "</p>";
    }
    $("cb-note").textContent = "Vos crédits en cours (" + dt(r.charges) + " par mois) sont déduits partout ; même taux et même durée pour toutes" +
      (c0.dureeLimitee ? " (durée réduite par votre âge)" : "") + ". Orbite ne connaît pas les règles internes des banques : nommez et réglez chaque banque d'après ce qu'elle vous a dit.";
  }

  doc.addEventListener("orbite:credit-banques", function () { liste = null; rendre(true); });
  /* Profil changé ailleurs : montants recalculés ; lignes reconstruites seulement si la liste des banques a changé
     (et jamais pendant une saisie dans le comparateur). */
  function memeListe(p) {
    var cle = function (L) { return JSON.stringify((L || []).map(function (b) { return [b.nom, b.base, b.revenu, b.quotite]; })); };
    return !!liste && (!p.banques || !p.banques.length || cle(p.banques) === cle(liste));
  }
  O.surProfil(function () {
    var z = $("credit-banques"), p = O.profil(); if (!z || z.hidden || !p) return;
    if (memeListe(p)) rendre(false);
    else if (doc.activeElement && !z.contains(doc.activeElement)) { liste = null; rendre(true); }
  });
})();
