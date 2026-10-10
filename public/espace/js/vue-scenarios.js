/*
 * Orbite — « Et si… » (Vie & impôts, #vie?onglet=scenarios) : jusqu'à 3 scénarios datés comparés à aujourd'hui sur 10 ans.
 * Calculs : scenarios-calcul.js. Les scénarios sont enregistrés dans le profil (profil.scenarios), comme le reste.
 * « Appliquer à mon profil » : salaire → historique du salaire ; crédit → Mes projets ; épargne → contrat à sa date ;
 * mariage, enfant, remboursement anticipé → appliqués si leur mois est arrivé, sinon rappel programmé. Annulable.
 * CSP : aucun attribut style dans du HTML ; couleurs posées par CSSOM (variables --c).
 */
(function () {
  "use strict";
  var O = window.Orbite, OC = window.OrbiteCalcul, SC = window.Scenarios, EX = window.ExpertCalcul, F = O.F, $ = O.$, doc = document;
  var NS = "http://www.w3.org/2000/svg", LETTRES = ["A", "B", "C"], MOIS = OC.MOIS, HORIZON = SC.HORIZON;
  var liste = [], res = null, indic = "reste", T = 0, edition = null, maintenant = new Date();

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) {
    var s = doc.createElementNS(NS, "svg"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS(NS, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }
  function maj(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dt0(v) { return F.dt0(v) + " DT"; }
  function signe(v) { return (v > 0.5 ? "+" : v < -0.5 ? "−" : "") + F.dt0(Math.abs(v)) + " DT"; }
  function dateTexte(t) { var k = maintenant.getMonth() + t; return MOIS[((k % 12) + 12) % 12] + " " + (maintenant.getFullYear() + Math.floor(k / 12)); }
  function decalage(c) { return c.annee * 12 + c.mois - 1 - (maintenant.getFullYear() * 12 + maintenant.getMonth()); }
  function lire(id) { var r = F.lire($(id).value); return r.valide && !r.vide ? r.valeur : NaN; }
  function couleur(i) { return i < 0 ? "var(--etsi-ref)" : "var(--etsi-" + LETTRES[i] + ")"; }
  function visible() { return !$("vue-vie").hidden && !$("vie-panneau-scenarios").hidden; }

  /* ---------- Données ---------- */
  function sauver() { O.majProfil({ scenarios: JSON.parse(JSON.stringify(liste)) }); }
  function calculer() {
    maintenant = new Date();
    var p = O.profil(); if (!p) return;
    try { res = SC.comparer(p, liste, maintenant); } catch (e) { res = null; if (window.console) console.error(e); }
  }
  function libelle(c) { return SC.libelleChangement(c, O.profil()); }

  /* Modèles pour démarrer : préremplis à partir du profil, à ajuster ensuite. */
  function modeles() {
    var p = O.profil(), an = maintenant.getFullYear() + 1, sy = O.synthese(), s = sy ? sy.salaire : null;
    var brut = s ? Math.round(s.brutMensuel * 1.15 / 50) * 50 : 0, taux = OC.tauxNouveaux(p);
    return [
      { cle: "poste", icone: "salaire", lib: "Nouveau poste", nom: "Nouveau poste", ch: brut > 0 ? [{ type: "salaire", montant: brut, sens: "brut", periode: "mensuel", mois: 1, annee: an }] : [] },
      { cle: "credit", icone: "voiture", lib: "Acheter à crédit", nom: "Voiture à crédit", ch: [{ type: "credit", libelle: "Crédit voiture", typeCredit: "auto", capital: 40000, tauxPct: taux.auto.tauxPct, dureeMois: 84, mois: 1, annee: an }] },
      { cle: "epargne", icone: "epargne", lib: "Épargner chaque mois", nom: "Épargner 200 DT", ch: [{ type: "epargne", produit: "av", versementMensuel: 200, mois: 1, annee: an }] },
      { cle: "famille", icone: "profil", lib: "Agrandir la famille", nom: "Un enfant", ch: [{ type: "vie", evenement: "enfant", mois: maintenant.getMonth() + 1, annee: an }] }];
  }
  function creerDepuis(m) {
    if (liste.length >= SC.MAX_SCENARIOS) return;
    liste.push(OC.normaliserScenario({ id: "s" + Date.now().toString(36), nom: m.nom, changements: m.ch }, liste.length));
    sauver(); tout();
    O.toast("Scénario " + LETTRES[liste.length - 1] + " créé : ajustez-le ou ajoutez d'autres changements.");
  }

  /* ---------- Cartes ---------- */
  function quand(c) { var t = decalage(c); return t <= 0 ? "dès aujourd'hui" : "dès " + MOIS[c.mois - 1] + " " + c.annee; }
  function genre(c) { return c.type === "vie" ? "vie" : c.type; }
  var ICONE_GENRE = { salaire: "salaire", credit: "credit", epargne: "epargne", vie: "profil" };
  function rendreCartes() {
    var box = $("etsi-cartes"); box.textContent = "";
    var p = O.profil(), sy = O.synthese();
    var ref = cree("article", "etsi-carte etsi-carte--ref"), t = cree("div", "etsi-carte__tete");
    t.appendChild(cree("span", "etsi-carte__lettre", "=")); t.appendChild(cree("strong", "etsi-carte__ref", "Aujourd'hui")); ref.appendChild(t);
    if (p && sy) {
      var nc = p.credits.length, nk = p.contrats.length;
      ref.appendChild(cree("p", "etsi-carte__resume", "Votre profil tel qu'il est : " + F.dt0(p.montant) + " DT " + p.sens + (p.periode === "annuel" ? " par an" : " par mois") + ", " +
        p.nombreSalaires + " salaires, " + (nc ? nc + " crédit" + (nc > 1 ? "s" : "") : "aucun crédit") + (nk ? ", " + nk + " contrat" + (nk > 1 ? "s" : "") + " d'épargne" : "") + "."));
      if (res) { var r0 = res.reference.mois[0]; ref.appendChild(cree("p", "etsi-carte__ok", "Marge de crédit aujourd'hui : " + dt0(Math.max(0, r0.marge)) + " par mois (endettement " + F.pct(r0.endettement, 0) + ").")); }
    }
    box.appendChild(ref);
    liste.forEach(function (s, i) {
      var L = LETTRES[i], card = cree("article", "etsi-carte"); card.style.setProperty("--c", couleur(i));
      card.setAttribute("data-actif", String(!!edition && edition.i === i));
      var tete = cree("div", "etsi-carte__tete"); tete.appendChild(cree("span", "etsi-carte__lettre", L));
      var nom = cree("input", "etsi-carte__nom"); nom.type = "text"; nom.id = "etsi-nom-" + L; nom.value = s.nom; nom.maxLength = 40; nom.autocomplete = "off";
      nom.setAttribute("aria-label", "Nom du scénario " + L);
      nom.addEventListener("change", function () { s.nom = nom.value.trim().slice(0, 40) || "Scénario " + L; sauver(); tout(); });
      tete.appendChild(nom);
      var sup = cree("button", "bouton bouton--fantome bouton--icone bouton--petit"); sup.type = "button"; sup.appendChild(icone("poubelle"));
      sup.setAttribute("aria-label", "Supprimer le scénario " + L + " « " + s.nom + " »");
      sup.addEventListener("click", function () {
        var avant = JSON.parse(JSON.stringify(liste)); liste.splice(i, 1); edition = null; $("etsi-editeur").hidden = true; sauver(); tout();
        O.toast("Scénario « " + s.nom + " » supprimé.", { action: { libelle: "Annuler", fn: function () { liste = avant; sauver(); tout(); } } });
      });
      tete.appendChild(sup); card.appendChild(tete);
      var ul = cree("ul", "etsi-changements");
      s.changements.forEach(function (c, k) {
        var li = cree("li"), g = genre(c), ic = cree("span", "etsi-ch__ico etsi-ch__ico--" + g); ic.appendChild(icone(ICONE_GENRE[g])); li.appendChild(ic);
        var tx = cree("span", "etsi-ch__txt"); tx.appendChild(cree("strong", "", libelle(c))); tx.appendChild(cree("small", "", quand(c))); li.appendChild(tx);
        var x = cree("button", "bouton bouton--fantome bouton--icone bouton--petit"); x.type = "button"; x.appendChild(icone("fermer"));
        x.setAttribute("aria-label", "Retirer « " + libelle(c) + " »");
        x.addEventListener("click", function () { s.changements.splice(k, 1); sauver(); tout(); O.toast("Changement retiré du scénario " + L + "."); });
        li.appendChild(x); ul.appendChild(li);
      });
      if (!s.changements.length) ul.appendChild(cree("li", "etsi-changements__vide", "Aucun changement : ajoutez-en un."));
      card.appendChild(ul);
      var r = res && res.scenarios[i];
      if (r) {
        r.alertes.forEach(function (a) { card.appendChild(cree("p", "etsi-carte__alerte", a.genre === "endettement" ? "Refus probable de la banque : " + a.lib + "." : a.lib + ".")); });
        var cr = s.changements.filter(function (c) { return c.type === "credit"; })[0];
        if (cr && !r.alertes.some(function (a) { return a.genre === "endettement"; })) {
          var tc = Math.min(HORIZON, Math.max(0, decalage(cr)));
          card.appendChild(cree("p", "etsi-carte__ok", "Accepté par la règle de la banque : endettement de " + F.pct(r.mois[tc].endettement, 0) + " en " + dateTexte(tc) + "."));
        }
      }
      var aj = cree("button", "etsi-ajouter"); aj.type = "button"; aj.appendChild(icone("plus")); aj.appendChild(doc.createTextNode("Ajouter un changement"));
      aj.disabled = s.changements.length >= SC.MAX_CHANGEMENTS;
      aj.addEventListener("click", function () { ouvrirEditeur(i); });
      card.appendChild(aj);
      box.appendChild(card);
    });
    if (liste.length < SC.MAX_SCENARIOS) {
      var nv = cree("article", "etsi-carte etsi-carte--nouveau"), h = cree("div", "etsi-carte__tete");
      h.appendChild(cree("span", "etsi-carte__lettre", LETTRES[liste.length])); h.appendChild(cree("strong", "", liste.length ? "Un autre scénario ?" : "Votre premier scénario")); nv.appendChild(h);
      nv.appendChild(cree("p", "etsi-carte__resume", "Partez d'un modèle prérempli avec votre profil, puis ajustez-le."));
      var g = cree("div", "etsi-modeles");
      modeles().forEach(function (m) {
        if (!m.ch.length) return;
        var b = cree("button", "etsi-modele"); b.type = "button"; b.setAttribute("data-modele", m.cle); b.appendChild(icone(m.icone)); b.appendChild(doc.createTextNode(m.lib));
        b.addEventListener("click", function () { creerDepuis(m); });
        g.appendChild(b);
      });
      nv.appendChild(g); box.appendChild(nv);
    }
  }

  /* ---------- Éditeur d'un changement ---------- */
  var TYPES = [{ cle: "salaire", lib: "Salaire ou nouveau poste" }, { cle: "credit", lib: "Nouveau crédit" }, { cle: "epargne", lib: "Épargne mensuelle" }, { cle: "vie", lib: "Événement de vie" }];
  function champ(id, lib, controle, unite, large) {
    var c = cree("div", "champ" + (large ? " champ--large" : "")), l = cree("label", "", lib); l.htmlFor = id; c.appendChild(l);
    var s = cree("div", "saisie"); controle.id = id; s.appendChild(controle);
    if (controle.tagName === "SELECT") { var ch = icone("chevron"); ch.setAttribute("class", "saisie__chevron"); s.appendChild(ch); }
    if (unite) s.appendChild(cree("span", "saisie__unite", unite));
    c.appendChild(s); return c;
  }
  function entree(val, mode) { var i = cree("input"); i.type = "text"; i.inputMode = mode || "decimal"; i.autocomplete = "off"; i.value = val; return i; }
  function choix(options, val) { var s = cree("select"); options.forEach(function (o) { var op = cree("option", "", o[1]); op.value = String(o[0]); op.selected = String(o[0]) === String(val); s.appendChild(op); }); return s; }
  function ouvrirEditeur(i) {
    if (!edition || edition.i !== i) edition = { i: i, type: "salaire" };
    $("etsi-editeur").hidden = false;
    $("etsi-ed-titre").textContent = "Ajouter au scénario " + LETTRES[i] + " · " + liste[i].nom;
    $("etsi-ed-ok").textContent = "Ajouter au scénario " + LETTRES[i];
    rendreTypes(); rendreChamps(); rendreCartes();
    var premier = $("etsi-ed-champs").querySelector("input, select"); if (premier) premier.focus();
  }
  function fermerEditeur() { edition = null; $("etsi-editeur").hidden = true; rendreCartes(); }
  function rendreTypes() {
    var box = $("etsi-ed-types"); box.textContent = "";
    TYPES.forEach(function (t) {
      var b = cree("button", "etsi-type"); b.type = "button"; b.appendChild(icone(ICONE_GENRE[t.cle])); b.appendChild(doc.createTextNode(t.lib));
      b.setAttribute("aria-pressed", String(edition.type === t.cle)); b.setAttribute("data-type", t.cle);
      b.addEventListener("click", function () { edition.type = t.cle; rendreTypes(); rendreChamps(); });
      box.appendChild(b);
    });
  }
  function rendreChamps() {
    var box = $("etsi-ed-champs"), t = edition.type, p = O.profil(), sy = O.synthese(), an = maintenant.getFullYear() + 1, aide = "";
    box.textContent = ""; $("etsi-ed-erreur").hidden = true;
    var moisL = MOIS.map(function (m, k) { return [k + 1, maj(m)]; });
    if (t === "salaire") {
      var brut = sy ? Math.round(sy.salaire.brutMensuel * 1.1 / 50) * 50 : 0;
      box.appendChild(champ("etsi-montant", "Nouveau salaire", entree(F.saisie(brut)), "DT"));
      box.appendChild(champ("etsi-sens", "Montant", choix([["brut", "Brut par mois"], ["net", "Net par mois"]], "brut")));
      aide = "Même mécanique que « Mettre à jour mon salaire » : l'impôt de l'année se calcule mois par mois.";
    } else if (t === "credit") {
      var tx = OC.tauxNouveaux(p);
      box.appendChild(champ("etsi-lib", "Projet", entree("Crédit voiture", "text")));
      var tc = choix([["immo", "Logement, terrain"], ["auto", "Voiture"], ["conso", "Consommation"], ["autre", "Autre"]], "auto");
      box.appendChild(champ("etsi-tc", "Type", tc));
      box.appendChild(champ("etsi-capital", "Montant emprunté", entree("40 000"), "DT"));
      box.appendChild(champ("etsi-duree", "Durée", entree("84", "numeric"), "mois"));
      var taux = entree(String(tx.auto.tauxPct).replace(".", ","));
      box.appendChild(champ("etsi-taux", "Taux annuel", taux, "%"));
      tc.addEventListener("change", function () {
        var k = tc.value === "immo" ? "immo" : tc.value === "auto" ? "auto" : "conso";
        taux.value = String(tx[k].tauxPct).replace(".", ",");
        $("etsi-duree").value = tc.value === "immo" ? "240" : tc.value === "auto" ? "84" : "60";
      });
      aide = "Taux proposé : celui de votre profil pour ce type de crédit. La banque refuse au-delà de sa quotité.";
    } else if (t === "epargne") {
      box.appendChild(champ("etsi-produit", "Produit", choix([["av", "Assurance vie"], ["cea", "Compte épargne en actions (CEA)"]], "av")));
      box.appendChild(champ("etsi-versement", "Versement", entree("200"), "DT / mois"));
      aide = "L'avantage fiscal (article 39) est compté chaque année à la déclaration ; capital estimé à 5 % par an.";
    } else {
      var opts = [["mariage", "Mariage"], ["enfant", "Naissance d'un enfant"]];
      p.credits.forEach(function (c, k) { opts.push(["r" + k, "Rembourser le " + c.libelle.charAt(0).toLowerCase() + c.libelle.slice(1)]); });
      box.appendChild(champ("etsi-evenement", "Événement", choix(opts, "enfant"), null, true));
      aide = "Remboursement anticipé : le capital restant dû est payé ce mois-là et la mensualité disparaît.";
    }
    box.appendChild(champ("etsi-mois", "À partir de", choix(moisL, 1)));
    box.appendChild(champ("etsi-annee", "Année", entree(String(an), "numeric")));
    $("etsi-ed-aide").textContent = aide;
  }
  $("etsi-ed-annuler").addEventListener("click", fermerEditeur);
  $("etsi-editeur").addEventListener("keydown", function (e) { if (e.key === "Escape") fermerEditeur(); });
  $("etsi-ed-ok").addEventListener("click", function () {
    var i = edition.i, t = edition.type, c = { type: t, mois: Number($("etsi-mois").value), annee: Number(String($("etsi-annee").value).trim()) };
    var Y0 = maintenant.getFullYear(), err = $("etsi-ed-erreur");
    function erreur(m) { err.textContent = m; err.hidden = false; }
    if (!(c.annee >= Y0 && c.annee <= Y0 + 10) || c.annee * 12 + c.mois - 1 < Y0 * 12 + maintenant.getMonth()) return erreur("Choisissez un mois entre aujourd'hui et " + MOIS[maintenant.getMonth()] + " " + (Y0 + 10) + " : la frise couvre 10 ans.");
    if (t === "salaire") { c.montant = lire("etsi-montant"); c.sens = $("etsi-sens").value; c.periode = "mensuel"; }
    else if (t === "credit") { c.libelle = $("etsi-lib").value; c.typeCredit = $("etsi-tc").value; c.capital = lire("etsi-capital"); c.dureeMois = lire("etsi-duree"); c.tauxPct = lire("etsi-taux"); }
    else if (t === "epargne") { c.produit = $("etsi-produit").value; c.versementMensuel = lire("etsi-versement"); }
    else { var v = $("etsi-evenement").value; if (v.charAt(0) === "r") { c.evenement = "rembourser"; c.credit = Number(v.slice(1)); } else c.evenement = v; }
    if (t === "credit" && !(c.tauxPct >= 0 && c.tauxPct <= 30)) return erreur("Taux entre 0 et 30 %.");
    var n = OC.normaliserChangement(c);
    if (!n) return erreur(t === "credit" ? "Indiquez le montant emprunté et la durée." : "Indiquez un montant positif.");
    liste[i].changements.push(n);
    sauver(); edition = null; $("etsi-editeur").hidden = true; tout();
    O.toast("Ajouté au scénario " + LETTRES[i] + " : " + libelle(n) + ".");
    O.vibrer(10);
  });

  /* ---------- Frise ---------- */
  var INDICS = [
    { cle: "reste", lib: "Reste par mois", aide: "Net moyen (primes réparties sur l'année) − crédits − épargne versée − loyer et charges fixes.", v: function (r, t) { return r.mois[t].reste; } },
    { cle: "marge", lib: "Marge de crédit", aide: "Ce que la banque peut encore prêter par mois (quotité de votre revenu retenu − crédits).", v: function (r, t) { return r.mois[t].marge; } },
    { cle: "epargne", lib: "Épargne accumulée", aide: "Capital de vos contrats d'assurance vie et CEA (rendement estimé de 5 % par an).", v: function (r, t) { return r.mois[t].capitalEpargne; } },
    { cle: "impot", lib: "Impôt de l'année", aide: "Impôt retenu sur la paie − avantage assurance vie / CEA à la déclaration.", v: function (r, t) { return r.annees[Math.floor((maintenant.getMonth() + t) / 12)].impotNet; } },
    { cle: "net", lib: "Net par mois", aide: "Net d'un mois habituel, hors salaires en plus.", v: function (r, t) { return r.mois[t].netMensuel; } }];
  function indicateur() { return INDICS.filter(function (x) { return x.cle === indic; })[0]; }
  function nomDe(k) { return k ? LETTRES[k - 1] + " · " + liste[k - 1].nom : "Aujourd'hui"; }
  function rendreIndics() {
    var box = $("etsi-indic"); box.textContent = "";
    INDICS.forEach(function (x) {
      var b = cree("button", "", x.lib); b.type = "button"; b.setAttribute("aria-pressed", String(x.cle === indic)); b.setAttribute("data-indic", x.cle);
      b.addEventListener("click", function () { indic = x.cle; rendreIndics(); rendreGraphe(); rendreJalons(); });
      box.appendChild(b);
    });
    $("etsi-indic-aide").textContent = indicateur().aide;
    var lg = $("etsi-legende"); lg.textContent = "";
    [-1].concat(liste.map(function (s, i) { return i; })).forEach(function (i) {
      var sp = cree("span", i < 0 ? "etsi-legende__ref" : ""); sp.style.setProperty("--c", couleur(i)); sp.appendChild(cree("i")); sp.appendChild(doc.createTextNode(nomDe(i + 1))); lg.appendChild(sp);
    });
  }
  function graduations(min, max) {
    var etendue = max - min || 1, pas = Math.pow(10, Math.floor(Math.log10(etendue / 4))), k = [1, 2, 2.5, 5, 10];
    for (var j = 0; j < k.length; j++) if (etendue / (pas * k[j]) <= 5) { pas *= k[j]; break; }
    var a = Math.floor(min / pas) * pas, b = Math.ceil(max / pas) * pas, out = [];
    for (var v = a; v <= b + pas / 2; v += pas) out.push(Math.round(v * 100) / 100);
    return out;
  }
  function rendreGraphe() {
    var box = $("etsi-graphe"), bulle = $("etsi-bulle");
    Array.prototype.slice.call(box.querySelectorAll("svg.etsi-svg")).forEach(function (x) { x.remove(); });
    if (!res) return;
    var W = Math.max(300, box.clientWidth || 600), etroit = W < 560, H = etroit ? 240 : 300, g = { l: etroit ? 44 : 62, r: 12, t: 14, b: 40 + 6 * (liste.length + 1) };
    var ind = indicateur(), series = [res.reference].concat(res.scenarios), N = HORIZON, vals = [];
    series.forEach(function (r) { for (var t = 0; t <= N; t++) vals.push(ind.v(r, t)); });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    if (ind.cle !== "net") mn = Math.min(0, mn);
    var ticks = graduations(mn, mx); mn = ticks[0]; mx = ticks[ticks.length - 1];
    var X = function (t) { return g.l + (W - g.l - g.r) * t / N; }, Y = function (v) { return g.t + (H - g.t - g.b) * (1 - (v - mn) / (mx - mn || 1)); };
    var svg = doc.createElementNS(NS, "svg"); svg.setAttribute("class", "etsi-svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", ind.lib + " sur 10 ans : " + series.map(function (r, k) { return nomDe(k) + " " + dt0(ind.v(r, N)) + " en " + dateTexte(N); }).join(", "));
    function n(tag, at, cls) { var e = doc.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); if (cls) e.setAttribute("class", cls); svg.appendChild(e); return e; }
    if (ind.cle === "marge" && mn < 0) {
      n("rect", { x: g.l, y: Y(0), width: W - g.l - g.r, height: Y(mn) - Y(0) }, "etsi-refus");
      var tz = n("text", { x: W - g.r - 6, y: Y(mn) - 6, "text-anchor": "end" }, "etsi-refus__txt"); tz.textContent = "au-delà de la quotité : refus probable";
    }
    ticks.forEach(function (v) {
      n("line", { x1: g.l, x2: W - g.r, y1: Y(v), y2: Y(v) }, v === 0 ? "etsi-axe etsi-axe--zero" : "etsi-axe");
      var tx = n("text", { x: g.l - 8, y: Y(v) + 4, "text-anchor": "end" }); tx.textContent = Math.abs(v) >= 10000 ? F.dt0(v / 1000) + " k" : F.dt0(v);
    });
    for (var a = 0; a <= 10; a += etroit ? 2 : 1) {
      var lab = n("text", { x: X(Math.min(N, a * 12)), y: H - g.b + 16, "text-anchor": a === 0 ? "start" : a === 10 ? "end" : "middle" }); lab.textContent = String(maintenant.getFullYear() + a);
    }
    series.forEach(function (r, k) {
      var d = "";
      for (var t = 0; t <= N; t++) { var y = Y(ind.v(r, t)).toFixed(1); d += t ? "H" + X(t).toFixed(1) + "V" + y : "M" + X(0).toFixed(1) + " " + y; }
      var p = n("path", { d: d, fill: "none" }, "etsi-ligne" + (k ? "" : " etsi-ligne--ref")); p.style.setProperty("--c", couleur(k - 1));
    });
    series.forEach(function (r, k) {
      var y = H - g.b + 28 + k * 6;
      r.evenements.forEach(function (e) {
        if (!k && e.genre !== "fin" || k && e.genre === "fin") return;
        var c = n("circle", { cx: X(Math.min(N, e.t)), cy: y, r: 2.6 }, "etsi-evt"); c.style.setProperty("--c", couleur(k - 1));
        var ti = doc.createElementNS(NS, "title"); ti.textContent = e.date + " · " + e.lib; c.appendChild(ti);
      });
    });
    n("line", { x1: X(T), x2: X(T), y1: g.t, y2: H - g.b }, "etsi-repere");
    series.forEach(function (r, k) { var c = n("circle", { cx: X(T), cy: Y(ind.v(r, T)), r: 4 }, "etsi-point"); c.style.setProperty("--c", couleur(k - 1)); });
    box.insertBefore(svg, bulle);
    bulle.textContent = "";
    bulle.appendChild(cree("strong", "", maj(dateTexte(T))));
    series.forEach(function (r, k) {
      var l = cree("div"), nm = cree("span"), pt = cree("i"); pt.style.setProperty("--c", couleur(k - 1)); nm.appendChild(pt); nm.appendChild(doc.createTextNode(nomDe(k)));
      l.appendChild(nm); l.appendChild(cree("b", "", dt0(ind.v(r, T)))); bulle.appendChild(l);
    });
    if (!etroit) { var px = X(T) / W * box.clientWidth, demi = 120; bulle.style.setProperty("--x", Math.max(demi, Math.min(box.clientWidth - demi, px + (T < 60 ? 140 : -140))) + "px"); }
    $("etsi-curseur-date").textContent = maj(dateTexte(T));
    $("etsi-curseur").setAttribute("aria-valuetext", dateTexte(T));
    svg.addEventListener("pointermove", function (ev) {
      var rc = svg.getBoundingClientRect(), x = (ev.clientX - rc.left) / rc.width * W, t = Math.round((x - g.l) / (W - g.l - g.r) * N);
      if (t >= 0 && t <= N && t !== T) { T = t; $("etsi-curseur").value = String(t); rendreGraphe(); }
    });
  }
  $("etsi-curseur").addEventListener("input", function () { T = Number(this.value); rendreGraphe(); });

  /* ---------- Bilan, dates clés, séries ---------- */
  function rendreBilan() {
    var v = $("etsi-verdict"), b = $("etsi-bilans"); v.textContent = ""; b.textContent = "";
    if (!res || !res.scenarios.length) return;
    var ref = res.reference, base = ref.totaux.reste + ref.totaux.capitalEpargne;
    var best = res.scenarios.map(function (r, i) { return { r: r, i: i }; }).sort(function (x, y) { return y.r.score - x.r.score; })[0];
    var d = best.r.score - base;
    v.appendChild(cree("strong", "", d > 0.5 ? "Sur 10 ans, « " + liste[best.i].nom + " » vous laisse le plus d'argent disponible : " + signe(d) + " par rapport à aujourd'hui."
      : "Sur 10 ans, aucun scénario ne vous laisse plus d'argent disponible qu'aujourd'hui ; « " + liste[best.i].nom + " » s'en approche le plus (" + signe(d) + ")."));
    var refus = res.scenarios.map(function (r, i) { return r.alertes.some(function (a) { return a.genre === "endettement"; }) ? "« " + liste[i].nom + " »" : null; }).filter(Boolean);
    v.appendChild(cree("p", "", "Argent disponible = ce qui reste pour vivre + l'épargne constituée, hors valeur des biens achetés." + (refus.length ? " Attention : " + refus.join(" et ") + (refus.length > 1 ? " dépassent" : " dépasse") + " la règle de la banque." : "")));
    res.scenarios.forEach(function (r, i) {
      var c = cree("article", "etsi-bilan"); c.style.setProperty("--c", couleur(i));
      var t = cree("div", "etsi-bilan__tete"); t.appendChild(cree("i")); t.appendChild(doc.createTextNode(nomDe(i + 1))); c.appendChild(t);
      var dl = cree("dl");
      function ligne(lib, val, cls) { var x = cree("div"); x.appendChild(cree("dt", "", lib)); x.appendChild(cree("dd", cls || "", val)); dl.appendChild(x); }
      ligne("Reste pour vivre (10 ans)", signe(r.ecart.reste), r.ecart.reste > 0.5 ? "plus" : r.ecart.reste < -0.5 ? "moins" : "");
      ligne("Épargne constituée", signe(r.ecart.capitalEpargne), r.ecart.capitalEpargne > 0.5 ? "plus" : r.ecart.capitalEpargne < -0.5 ? "moins" : "");
      ligne("Impôt payé", signe(r.ecart.impotNet), r.ecart.impotNet > 0.5 ? "moins" : r.ecart.impotNet < -0.5 ? "plus" : "");
      if (r.totaux.interetsNouveaux > 0) ligne("Intérêts des nouveaux crédits (10 ans)", dt0(r.totaux.interetsNouveaux));
      if (r.totaux.remboursements > 0) ligne("Remboursements anticipés", dt0(r.totaux.remboursements));
      var m10 = r.mois[HORIZON]; ligne("Marge de crédit en " + m10.date, dt0(m10.marge) + " / mois", m10.marge < 0 ? "moins" : "");
      c.appendChild(dl); b.appendChild(c);
    });
  }
  function rendreJalons() {
    var tb = $("etsi-jalons"), ind = indicateur(); tb.textContent = "";
    if (!res) return;
    $("etsi-jalons-sous").textContent = ind.lib + ".";
    var lab = { 0: "Aujourd'hui", 12: "Dans 1 an", 36: "Dans 3 ans", 60: "Dans 5 ans", 120: "Dans 10 ans" };
    var th = cree("thead"), tr = cree("tr"); tr.appendChild(cree("th", "", "Scénario"));
    res.jalons.forEach(function (t) { var h = cree("th"); h.appendChild(doc.createTextNode(lab[t])); h.appendChild(cree("br")); h.appendChild(cree("small", "", dateTexte(t))); tr.appendChild(h); });
    th.appendChild(tr); tb.appendChild(th);
    var bd = cree("tbody");
    [res.reference].concat(res.scenarios).forEach(function (r, k) {
      var row = cree("tr"), c0 = cree("td"), pa = cree("span", "etsi-pastille"); pa.style.setProperty("--c", couleur(k - 1)); c0.appendChild(pa); c0.appendChild(doc.createTextNode(nomDe(k))); row.appendChild(c0);
      res.jalons.forEach(function (t) { row.appendChild(cree("td", "", dt0(ind.v(r, t)))); });
      bd.appendChild(row);
    });
    tb.appendChild(bd);
  }
  function noms() { return liste.map(function (s, i) { return LETTRES[i] + " · " + s.nom; }); }
  function rendreSeries() {
    var tb = $("etsi-series"); tb.textContent = "";
    if (!res || !O.expert() || !$("etsi-expert").open) return;
    var lignes = EX.tableScenarios(res, noms()), th = cree("thead"), tr = cree("tr");
    lignes[0].forEach(function (h) { tr.appendChild(cree("th", "", h.replace(" (DT)", ""))); }); th.appendChild(tr); tb.appendChild(th);
    var bd = cree("tbody");
    lignes.slice(1).forEach(function (l) { var row = cree("tr"); l.forEach(function (v, k) { row.appendChild(cree("td", "", k ? F.dt3(v) : v)); }); bd.appendChild(row); });
    tb.appendChild(bd);
  }
  $("etsi-expert").addEventListener("toggle", rendreSeries);
  doc.addEventListener("orbite:expert", function () { if (visible()) rendreSeries(); });
  $("etsi-csv").addEventListener("click", function () {
    if (!res) return;
    O.telecharger("orbite-scenarios-" + maintenant.toISOString().slice(0, 10) + ".csv", EX.csv(EX.tableScenarios(res, noms())));
    O.toast("Séries des scénarios téléchargées (CSV).");
  });

  /* ---------- Appliquer à mon profil ---------- */
  function rendreAppliquer() {
    var s = $("etsi-appliquer-choix"), v = s.value; s.textContent = "";
    liste.forEach(function (x, i) { var o = cree("option", "", LETTRES[i] + " · " + x.nom); o.value = String(i); s.appendChild(o); });
    if (v && Number(v) < liste.length) s.value = v;
    $("etsi-appliquer").disabled = !liste.length;
  }
  var TYPE_PROJET = { immo: "logement", auto: "voiture", conso: "travaux", autre: "autre" };
  function appliquer(i) {
    var s = liste[i], p = O.profil(); if (!s || !p) return;
    var cles = ["historiqueSalaire", "montant", "sens", "periode", "projets", "contrats", "rappelsPerso", "situation", "chefDeFamille", "enfants", "credits"];
    var avant = {}; cles.forEach(function (k) { avant[k] = JSON.parse(JSON.stringify(p[k])); });
    var hist = p.historiqueSalaire.slice(), projets = p.projets.slice(), contrats = p.contrats.slice(), rappels = p.rappelsPerso.slice();
    var fam = { situation: p.situation, chefDeFamille: p.chefDeFamille, enfants: p.enfants }, retirer = [], faits = [], ignores = [];
    var id = Date.now().toString(36);
    s.changements.forEach(function (c, k) {
      var t = decalage(c), date = MOIS[c.mois - 1] + " " + c.annee, arrive = t <= 0;
      if (c.type === "salaire") {
        if (!hist.length) hist.push({ montant: p.montant, sens: p.sens, periode: p.periode, mois: 0, annee: 0 });
        hist = hist.filter(function (h) { return !(h.mois === c.mois && h.annee === c.annee); });
        hist.push({ montant: c.montant, sens: c.sens, periode: c.periode, mois: c.mois, annee: c.annee });
        faits.push("salaire de " + date);
      } else if (c.type === "credit") {
        if (projets.length >= 8) { ignores.push(c.libelle + " (Mes projets est plein)"); return; }
        projets.push({ type: c.typeCredit === "immo" && /terrain/i.test(c.libelle) ? "terrain" : TYPE_PROJET[c.typeCredit], libelle: c.libelle, montant: c.capital, horizonAns: Math.max(0, Math.round(t / 12)) });
        faits.push(c.libelle.charAt(0).toLowerCase() + c.libelle.slice(1) + " dans Mes projets");
      } else if (c.type === "epargne") {
        if (contrats.length >= 12) { ignores.push("épargne (12 contrats au plus)"); return; }
        contrats.push({ type: c.produit, libelle: c.produit === "cea" ? "CEA" : "Assurance vie", versementMensuel: c.versementMensuel, moisDebut: c.mois, anneeDebut: c.annee });
        faits.push((c.produit === "cea" ? "CEA" : "assurance vie") + " à partir de " + date);
      } else if (arrive) {
        if (c.evenement === "mariage") { fam.situation = "marie"; fam.chefDeFamille = true; }
        else if (c.evenement === "enfant") fam.enfants = Math.min(15, fam.enfants + 1);
        else if (p.credits[c.credit]) retirer.push(c.credit);
        faits.push(libelle(c).charAt(0).toLowerCase() + libelle(c).slice(1));
      } else {
        if (rappels.length >= 20) { ignores.push(libelle(c) + " (20 rappels au plus)"); return; }
        var cr = c.evenement === "rembourser" ? p.credits[c.credit] : null;
        rappels.push({ id: "etsi" + id + k, mois: c.mois, annee: c.annee,
          titre: c.evenement === "mariage" ? "Mariage : mettez votre profil à jour" : c.evenement === "enfant" ? "Naissance : ajoutez votre enfant au profil" : "Remboursement anticipé : " + (cr ? cr.libelle.toLowerCase() : "crédit"),
          corps: c.evenement === "rembourser" ? "Prévu en " + date + " dans votre scénario « " + s.nom + " ». Une fois fait, retirez ce crédit de votre profil." : "Prévu en " + date + " dans votre scénario « " + s.nom + " ». Orbite recalculera votre impôt et votre budget.",
          url: c.evenement === "rembourser" ? "/espace/#profil?section=credits" : "/espace/#profil?section=identite" });
        faits.push("rappel en " + date);
      }
    });
    if (!faits.length) { O.toast(ignores.length ? "Rien n'a pu être appliqué : " + ignores.join(", ") + "." : "Ce scénario ne contient aucun changement."); return; }
    var partiel = { projets: projets, contrats: contrats, rappelsPerso: rappels, situation: fam.situation, chefDeFamille: fam.chefDeFamille, enfants: fam.enfants,
      credits: p.credits.filter(function (c, k) { return retirer.indexOf(k) === -1; }) };
    if (hist.length !== p.historiqueSalaire.length || s.changements.some(function (c) { return c.type === "salaire"; })) {
      var ap = OC.appliquerHistorique(OC.normaliser(Object.assign({}, p, { historiqueSalaire: hist })), maintenant).profil;
      Object.assign(partiel, { historiqueSalaire: hist, montant: ap.montant, sens: ap.sens, periode: ap.periode });
    }
    O.majProfil(partiel, { immediat: true });
    O.toast("« " + s.nom + " » appliqué : " + faits.join(", ") + "." + (ignores.length ? " Non appliqué : " + ignores.join(", ") + "." : ""),
      { duree: 9000, action: { libelle: "Annuler", fn: function () { O.majProfil(avant, { immediat: true }); O.toast("Profil revenu comme avant."); } } });
    O.vibrer([10, 40, 10]);
  }
  $("etsi-appliquer").addEventListener("click", function () { appliquer(Number($("etsi-appliquer-choix").value)); });

  /* ---------- Ensemble ---------- */
  function tout() {
    calculer();
    rendreCartes();
    $("etsi-resultats").hidden = !liste.length || !res;
    if (!liste.length || !res) return;
    if (T > HORIZON) T = HORIZON;
    rendreIndics(); rendreGraphe(); rendreBilan(); rendreJalons(); rendreSeries(); rendreAppliquer();
  }
  function depuisProfil() {
    var p = O.profil(); if (!p) return;
    /* Pendant une saisie (nom, éditeur), la liste locale fait foi. */
    if (doc.activeElement && doc.activeElement.closest && doc.activeElement.closest("#etsi-cartes, #etsi-editeur")) return;
    liste = JSON.parse(JSON.stringify(p.scenarios || []));
  }
  doc.addEventListener("orbite:etsi", function () { depuisProfil(); tout(); });
  O.surProfil(function () { if (!visible()) return; depuisProfil(); tout(); });
  var attente = 0;
  window.addEventListener("resize", function () { if (!visible()) return; clearTimeout(attente); attente = setTimeout(rendreGraphe, 150); });
  window.OrbiteEtSi = { liste: function () { return liste; }, resultat: function () { return res; }, appliquer: appliquer };
})();
