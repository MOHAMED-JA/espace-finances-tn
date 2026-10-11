/*
 * Orbite — « Ma fiche de paie » (lot 7, maquette validée le 11 oct. 2026). Fenêtre en quatre écrans :
 * déposer (photo ou PDF), lecture sur l'appareil (FicheLecture), vérifier les valeurs lues (texte d'origine et état
 * de chaque valeur, corrigeables, cases à décocher), contrôle face au calcul d'Orbite (FicheCalcul), puis mise à jour
 * du profil avec « Annuler ». La fiche n'est ni envoyée ni gardée : seules les valeurs validées vont dans le profil.
 * Entrées : Mon profil › Salaire « Remplir avec ma fiche de paie » ; module Salaire « Contrôler ma fiche de paie ».
 */
(function () {
  "use strict";
  var O = window.Orbite, FL = window.FicheLecture, FC = window.FicheCalcul, doc = document;
  if (!O || !FL || !FC) return;
  var $ = O.$, F = O.F, dlg = $("dlg-fiche");
  if (!dlg) return;
  var MOIS = FC.MOIS;
  var ECRANS = ["depot", "lecture", "verifier", "controle"];
  var TITRES = { depot: "Ma fiche de paie", lecture: "Lecture de la fiche…", verifier: "Vérifiez ce que nous avons lu", controle: "Contrôle de votre fiche" };
  var ETAPES_LECTURE = { ouvrir: "Ouverture du PDF", image: "Préparation de la photo", outil: "Chargement de l'outil de lecture", lire: "Reconnaissance du texte", fin: "Analyse des montants" };
  var reduit = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var etat = { jeton: 0, analyse: null, url: null, manuel: false, k: null };

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt3(v) { return F.dt3(v); }
  function moisCle(m) { return m && m.annee ? m.annee + "-" + String(m.mois).padStart(2, "0") : ""; }
  function libMois(m) { return MOIS[m.mois - 1] + " " + m.annee; }

  /* ---------- Écrans ---------- */
  function montrer(ecran, focus) {
    ECRANS.forEach(function (e) { dlg.querySelector('[data-ecran="' + e + '"]').hidden = e !== ecran; });
    dlg.dataset.ecran = ecran;
    $("fiche-titre").textContent = TITRES[ecran];
    var n = ECRANS.indexOf(ecran);
    $("fiche-etapes").hidden = ecran === "controle";
    Array.prototype.forEach.call($("fiche-etapes").children, function (i, k) { i.classList.toggle("on", k <= n); });
    $("fiche-retour").hidden = ecran !== "verifier";
    $("fiche-retour").textContent = "Recommencer";
    $("fiche-controler").hidden = ecran !== "verifier";
    $("fiche-fermer-sans").hidden = ecran !== "controle";
    $("fiche-maj").hidden = ecran !== "controle";
    $("fiche-pied").hidden = ecran === "depot" || ecran === "lecture";
    if (focus !== false) $("fiche-titre").focus({ preventScroll: true });
    dlg.querySelector(".fiche__corps").scrollTop = 0;
  }

  function liberer() {
    if (etat.url) { URL.revokeObjectURL(etat.url); etat.url = null; }
    ["fiche-photo", "fiche-fichier"].forEach(function (id) { $(id).value = ""; });
  }

  function ouvrir() {
    etat.jeton++; etat.analyse = null; etat.k = null; etat.manuel = false;
    liberer();
    $("fiche-photo-lib").hidden = !(window.matchMedia && matchMedia("(pointer: coarse)").matches);
    montrer("depot", false);
    dlg.showModal();
    $("fiche-titre").focus({ preventScroll: true });
  }

  /* ---------- 2. Lecture ---------- */
  function progres(etape, p) {
    $("fiche-prog-etape").textContent = ETAPES_LECTURE[etape] || "Lecture";
    var v = Math.max(0, Math.min(1, p || 0));
    $("fiche-prog-barre").style.setProperty("--p", v.toFixed(3));
    $("fiche-prog-pct").textContent = Math.round(v * 100) + " %";
  }

  function feuilleVide() {
    var c = $("fiche-feuille-contenu"); c.textContent = "";
    var v = cree("div", "fiche-feuille__vide");
    for (var i = 0; i < 12; i++) v.appendChild(cree("i"));
    c.appendChild(v);
  }

  function lancer(fichier) {
    if (!fichier) return;
    var jeton = ++etat.jeton;
    liberer();
    etat.manuel = false;
    montrer("lecture");
    $("fiche-erreur").hidden = true;
    $("fiche-prog").hidden = false;
    $("fiche-prog-aide").hidden = false;
    progres(FL.estPdf(fichier) ? "ouvrir" : "image", 0.02);
    var feuille = $("fiche-feuille"), c = $("fiche-feuille-contenu");
    if (FL.estImage(fichier) && !FL.estPdf(fichier) && !/hei[cf]/i.test(fichier.type + fichier.name)) {
      etat.url = URL.createObjectURL(fichier);
      c.textContent = "";
      var img = cree("img"); img.alt = ""; img.src = etat.url; c.appendChild(img);
    } else feuilleVide();
    feuille.classList.add("lit");
    FL.lire(fichier, { progres: function (e, p) { if (jeton === etat.jeton) progres(e, p); } }).then(function (r) {
      if (jeton !== etat.jeton) return;
      progres("fin", 1);
      var a = FC.analyser(r.lignes, new Date());
      if (!a.lisible) {
        echec("Aucun salaire trouvé", "Nous n'avons pas reconnu de fiche de paie dans ce document. Essayez le PDF de votre employeur, ou une photo plus nette, prise à plat et bien éclairée.");
        return;
      }
      etat.analyse = a;
      montrerLignes(r.lignes, a);
      feuille.classList.remove("lit");
      setTimeout(function () { if (jeton === etat.jeton && dlg.open) verifier(); }, reduit ? 0 : 1300);
    }, function (e) {
      if (jeton !== etat.jeton) return;
      echec("Lecture impossible", (e && e.message) || "Le document n'a pas pu être lu.");
    });
  }

  /* Les lignes lues apparaissent sur la feuille ; celles d'où viennent les valeurs sont surlignées. */
  function montrerLignes(lignes, a) {
    var sources = [];
    Object.keys(a.champs).forEach(function (k) { String(a.champs[k].source || "").split(" · ").forEach(function (s) { if (s) sources.push(s); }); });
    var c = $("fiche-feuille-contenu"); c.textContent = "";
    lignes.filter(function (l) { return l.texte.trim(); }).slice(0, 18).forEach(function (l, i) {
      var ligne = cree("div", "fiche-feuille__l");
      var cs = l.cellules, dernier = cs.length > 1 ? cs[cs.length - 1] : "";
      ligne.appendChild(cree("span", null, (cs.length > 1 ? cs.slice(0, -1) : cs).join("  ")));
      ligne.appendChild(cree("span", null, dernier));
      if (sources.some(function (s) { return s === l.texte || cs.indexOf(s) >= 0; })) ligne.classList.add("surl");
      ligne.style.setProperty("--i", String(i));
      c.appendChild(ligne);
    });
  }

  function echec(titre, detail) {
    $("fiche-feuille").classList.remove("lit");
    $("fiche-prog").hidden = true;
    $("fiche-prog-aide").hidden = true;
    $("fiche-erreur-t").textContent = titre;
    $("fiche-erreur-d").textContent = detail;
    $("fiche-erreur").hidden = false;
    $("fiche-pied").hidden = false;
    $("fiche-retour").hidden = false;
    $("fiche-retour").textContent = "Choisir un autre fichier";
  }

  /* ---------- 3. Vérifier ---------- */
  var LIGNES = [
    { groupe: "À reprendre dans votre profil" },
    { cle: "mois", lib: "Mois de la fiche", type: "mois" },
    { cle: "brut", lib: "Salaire brut", type: "montant", choix: "salaire" },
    { cle: "primes", lib: "Primes et avantages", type: "montant", choix: "primes" },
    { cle: "indemnitesNonImposables", lib: "Indemnités non imposables", type: "montant", choix: "primes", siLu: true },
    { cle: "caisse", lib: "Caisse", type: "caisse", choix: "caisse" },
    { cle: "dateEmbauche", lib: "Date d'embauche", type: "date", choix: "dateEmbauche" },
    { groupe: "Pour le contrôle · non enregistré" },
    { cle: "cotisations", lib: "Cotisations sociales", type: "montant" },
    { cle: "irpp", lib: "Impôt (IRPP)", type: "montant" },
    { cle: "css", lib: "CSS", type: "montant" },
    { cle: "autresRetenues", lib: "Autres retenues", type: "montant", siLu: true },
    { cle: "net", lib: "Net à payer", type: "montant" }
  ];
  var ETATS = { lu: "lu", verifier: "à vérifier", calcule: "calculé", absent: "non lu", corrige: "corrigé" };

  /* Primes du brut regroupées (imposables, non cotisables, avantages en nature) pour la vérification. */
  function champPrimes(c) {
    var ks = ["primesImposables", "primesNonCotisables", "avantagesNature"].filter(function (k) { return c[k]; });
    if (!ks.length) return null;
    var v = ks.reduce(function (s, k) { return s + c[k].valeur; }, 0);
    var e = ks.some(function (k) { return c[k].etat === "verifier"; }) ? "verifier" : ks.some(function (k) { return c[k].etat === "calcule"; }) ? "calcule" : "lu";
    return { valeur: v, etat: e, source: ks.map(function (k) { return c[k].source; }).join(" · ") };
  }

  function optionsMois(sel, lu) {
    var m = new Date(), vus = {};
    var ajoute = function (an, mo) { var k = an + "-" + String(mo).padStart(2, "0"); if (vus[k]) return; vus[k] = 1; var o = cree("option", null, libMois({ mois: mo, annee: an })); o.value = k; sel.appendChild(o); };
    for (var i = 0; i < 24; i++) { var d = new Date(m.getFullYear(), m.getMonth() - i, 1); ajoute(d.getFullYear(), d.getMonth() + 1); }
    if (lu && !vus[moisCle(lu)]) ajoute(lu.annee, lu.mois);
    sel.value = lu ? moisCle(lu) : moisCle({ mois: m.getMonth() + 1, annee: m.getFullYear() });
  }

  function etiquette(b, e) {
    var old = b.querySelector(".fiche-etat"); if (old) old.remove();
    var s = cree("span", "fiche-etat fiche-etat--" + e, ETATS[e]);
    b.appendChild(s);
  }

  function ligneChamp(def, c, profil) {
    var ch = def.cle === "primes" ? champPrimes(c) : c[def.cle];
    if (def.siLu && !ch) return null;
    var e = ch ? ch.etat : "absent";
    var row = cree("div", "fiche-champ" + (e === "verifier" ? " fiche-champ--doute" : ""));
    row.dataset.cle = def.cle;
    var idv = "fiche-v-" + def.cle;
    var caseCol;
    if (def.choix) {
      caseCol = cree("input"); caseCol.type = "checkbox"; caseCol.dataset.choix = def.choix;
      caseCol.setAttribute("aria-label", "Reprendre « " + def.lib + " » dans mon profil");
      caseCol.checked = !!ch || def.choix === "salaire" && etat.manuel;
      if (profil.activite === "retraite" && (def.choix === "salaire" || def.choix === "primes")) { caseCol.checked = false; caseCol.disabled = true; }
    } else caseCol = cree("span");
    row.appendChild(caseCol);
    var lib = cree("span", "fiche-champ__lib"), b = cree("b"), l = cree("label", null, def.lib);
    l.htmlFor = idv; b.appendChild(l); etiquette(b, e); lib.appendChild(b);
    var src = cree("small");
    if (ch && ch.source && e !== "calcule") { src.textContent = "« " + ch.source + " »" + (e === "verifier" ? " (chiffre peu net)" : ""); src.title = ch.source; }
    else if (ch && e === "calcule") src.textContent = ch.source;
    else src.textContent = def.cle === "mois" ? "Mois de paie non trouvé : choisissez-le." : etat.manuel ? "Recopiez le montant de votre fiche." : "Introuvable sur la fiche : saisissez-le si besoin.";
    lib.appendChild(src);
    if (def.cle === "primes") { var base = cree("small", "fiche-base"); base.id = "fiche-base"; lib.appendChild(base); }
    row.appendChild(lib);
    var champ;
    if (def.type === "mois") { champ = cree("select", "fiche-val"); optionsMois(champ, ch && ch.valeur); }
    else if (def.type === "caisse") {
      champ = cree("select", "fiche-val");
      [["prive", "CNSS · privé"], ["public", "CNRPS · public"]].forEach(function (x) { var o = cree("option", null, x[1]); o.value = x[0]; champ.appendChild(o); });
      champ.value = ch ? ch.secteur : (profil.secteur || "prive");
    } else {
      champ = cree("input", "fiche-val"); champ.type = "text"; champ.autocomplete = "off"; champ.spellcheck = false;
      if (def.type === "date") { champ.inputMode = "numeric"; champ.placeholder = "jj/mm/aaaa"; champ.maxLength = 10; if (ch) { var p = ch.valeur.split("-"); champ.value = p[2] + "/" + p[1] + "/" + p[0]; } }
      else { champ.inputMode = "decimal"; champ.placeholder = "0,000"; if (ch) champ.value = dt3(ch.valeur); }
    }
    champ.id = idv;
    champ.addEventListener("input", function () {
      row.classList.remove("fiche-champ--doute", "fiche-champ--faux");
      etiquette(b, "corrige");
      if (caseCol.dataset && caseCol.dataset.choix && !caseCol.disabled) caseCol.checked = true;
      majBase();
    });
    row.appendChild(champ);
    return row;
  }

  function verifier() {
    var a = etat.analyse || { champs: {}, alertes: [], famille: {} }, c = a.champs, profil = O.profil() || {};
    var cont = $("fiche-champs"); cont.textContent = "";
    LIGNES.forEach(function (def) {
      if (def.groupe) { cont.appendChild(cree("p", "fiche-groupe", def.groupe)); return; }
      var r = ligneChamp(def, c, profil); if (r) cont.appendChild(r);
    });
    /* Les deux cases « primes » (primes et indemnités) vont ensemble. */
    var cases = cont.querySelectorAll('input[data-choix="primes"]');
    Array.prototype.forEach.call(cases, function (x) { x.addEventListener("change", function () { Array.prototype.forEach.call(cases, function (y) { y.checked = x.checked; }); }); });
    var al = [];
    if (profil.activite === "retraite") al.push("Votre profil est celui d'un retraité : passez-le en « Salarié » pour reprendre ce salaire. Le contrôle reste possible.");
    al = al.concat(a.alertes || []);
    $("fiche-verif-alerte").textContent = al.join(" ");
    $("fiche-verif-alerte").hidden = !al.length;
    $("fiche-verif-intro").textContent = etat.manuel
      ? "Recopiez les montants de votre fiche : Orbite les compare ensuite à son propre calcul. Décochez ce que vous ne voulez pas reprendre dans votre profil."
      : "Chaque valeur montre le texte d'où elle vient. Corrigez directement dans la case, et décochez ce que vous ne voulez pas reprendre dans votre profil.";
    majBase();
    montrer("verifier");
  }

  function lireMontant(cle) {
    var e = $("fiche-v-" + cle); if (!e || !e.value.trim()) return null;
    var v = FC.montant(e.value);
    return v == null || v < 0 ? NaN : v;
  }
  function majBase() {
    var b = $("fiche-base"); if (!b) return;
    var brut = lireMontant("brut"), pr = lireMontant("primes") || 0;
    b.textContent = brut > 0 && pr >= 0 && brut - pr >= 0 ? "Salaire de base : " + dt3(brut - pr) + " DT" : "";
  }

  /* Valeurs corrigées → valeurs de FicheCalcul. La répartition des primes lues est gardée ; une correction
     du total porte sur les primes imposables. */
  function lireValeurs() {
    var c = (etat.analyse && etat.analyse.champs) || {}, v = {}, fautes = [];
    var m = $("fiche-v-mois").value.split("-");
    v.mois = { annee: +m[0], mois: +m[1] };
    ["brut", "primes", "indemnitesNonImposables", "cotisations", "irpp", "css", "autresRetenues", "net"].forEach(function (k) {
      var x = lireMontant(k);
      if (x != null && isNaN(x)) { fautes.push(k); return; }
      if (x != null) v[k] = x;
    });
    var nc = c.primesNonCotisables ? c.primesNonCotisables.valeur : 0, av = c.avantagesNature ? c.avantagesNature.valeur : 0;
    var totalPrimes = v.primes || 0;
    v.primesNonCotisables = Math.min(nc, totalPrimes);
    v.avantagesNature = Math.min(av, Math.max(0, totalPrimes - v.primesNonCotisables));
    v.primesImposables = Math.max(0, totalPrimes - v.primesNonCotisables - v.avantagesNature);
    v.base = v.brut != null ? v.brut - totalPrimes : null;
    delete v.primes;
    v.secteur = $("fiche-v-caisse").value;
    var d = $("fiche-v-dateEmbauche").value.trim();
    if (d) {
      var p = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/), ok = false;
      if (p) { var dd = new Date(+p[3], +p[2] - 1, +p[1]); ok = dd.getMonth() === +p[2] - 1 && dd <= new Date() && +p[3] >= 1960; }
      if (ok) v.dateEmbauche = p[3] + "-" + p[2].padStart(2, "0") + "-" + p[1].padStart(2, "0"); else fautes.push("dateEmbauche");
    }
    if (!(v.brut > 0)) fautes.push("brut");
    else if (v.base < 0) fautes.push("primes");
    var choix = {};
    Array.prototype.forEach.call($("fiche-champs").querySelectorAll("input[data-choix]"), function (x) { if (x.checked) choix[x.dataset.choix] = true; });
    if (!choix.primes) choix.primes = false;
    return { v: v, fautes: fautes, choix: choix };
  }

  function controler() {
    var r = lireValeurs();
    Array.prototype.forEach.call($("fiche-champs").querySelectorAll(".fiche-champ--faux"), function (x) { x.classList.remove("fiche-champ--faux"); });
    if (r.fautes.length) {
      r.fautes.forEach(function (k) { var row = $("fiche-champs").querySelector('[data-cle="' + k + '"]'); if (row) row.classList.add("fiche-champ--faux"); });
      var msg = r.fautes.indexOf("brut") >= 0 ? "Indiquez le salaire brut de la fiche (en dinars, par exemple 2 700,000)."
        : r.fautes.indexOf("primes") >= 0 ? "Les primes dépassent le salaire brut : vérifiez ces deux montants."
        : r.fautes.indexOf("dateEmbauche") >= 0 ? "Date d'embauche à écrire jj/mm/aaaa (par exemple 01/09/2014)." : "Un montant n'est pas un nombre : vérifiez les cases en rouge.";
      $("fiche-verif-alerte").textContent = msg; $("fiche-verif-alerte").hidden = false;
      var premier = $("fiche-champs").querySelector(".fiche-champ--faux .fiche-val"); if (premier) premier.focus();
      return;
    }
    var profil = O.profil() || {};
    var k = FC.controle(r.v, profil, (etat.analyse && etat.analyse.famille) || {});
    etat.k = { r: r, k: k };
    afficherControle(k, r, profil);
    montrer("controle");
  }

  /* ---------- 4. Contrôle ---------- */
  function signe(e) { return (e > 0 ? "+" : "−") + dt3(Math.abs(e)); }
  function afficherControle(k, r, profil) {
    var ok = k.etat === "coherent", vide = k.etat === "incomplet";
    $("fiche-verdict").className = "fiche-verdict" + (ok ? " fiche-verdict--ok" : vide ? " fiche-verdict--neutre" : "");
    $("fiche-verdict").querySelector(".fiche-verdict__ico").textContent = ok ? "✓" : vide ? "i" : "!";
    $("fiche-verdict-t").textContent = ok ? "Votre fiche est cohérente avec les barèmes " + k.baremes : k.titre;
    $("fiche-verdict-d").textContent = ok ? "Cotisations, impôt et net concordent avec le calcul d'Orbite, à moins de 1 DT près." : k.texte;
    dlg.querySelector(".fiche-tableau").hidden = vide;
    var corps = $("fiche-table-corps"); corps.textContent = "";
    k.lignes.forEach(function (l) {
      var tr = cree("tr", l.cle === "net" ? "net" : null);
      tr.appendChild(cree("td", null, l.libelle));
      tr.appendChild(cree("td", null, dt3(l.fiche)));
      tr.appendChild(cree("td", null, dt3(l.orbite)));
      var td = cree("td", l.ok ? "fiche-ok" : "fiche-ecart", l.ok ? "✓" : signe(l.ecart));
      if (l.ok) td.setAttribute("aria-label", "Concorde");
      tr.appendChild(td);
      corps.appendChild(tr);
    });
    var pistes = $("fiche-pistes"); pistes.textContent = "";
    k.pistes.forEach(function (p) { pistes.appendChild(cree("li", null, p)); });
    var p = k.profil, enf = p.enfants || 0;
    $("fiche-hypotheses").textContent = "Calcul d'Orbite pour un mois habituel : " + (p.secteur === "public" ? "secteur public (CNRPS)" : "secteur privé (CNSS)") + ", " +
      (p.chefDeFamille ? "chef de famille" : "personne seule") + ", " + (enf ? enf + " enfant" + (enf > 1 ? "s" : "") + " à charge" : "sans enfant à charge") +
      " (votre profil), barèmes " + k.baremes + ".";
    /* Bouton de mise à jour : seulement si quelque chose change vraiment. */
    var ap = FC.appliquer(r.v, r.choix, profil, new Date()), change = Object.keys(ap.partiel).some(function (cle) { return JSON.stringify(ap.partiel[cle]) !== JSON.stringify(profil[cle]); });
    etat.k.ap = ap;
    var b = $("fiche-maj");
    b.disabled = !change;
    var coche = Object.keys(r.choix).some(function (cle) { return r.choix[cle] === true; });
    b.textContent = change ? "Mettre à jour mon profil" : coche ? "Profil déjà à jour" : "Rien de coché à reprendre";
  }

  function mettreAJour() {
    if (!etat.k || !etat.k.ap || etat.k.ap.vide) return;
    var profil = O.profil() || {}, partiel = etat.k.ap.partiel, avant = {};
    Object.keys(partiel).forEach(function (cle) { avant[cle] = profil[cle] === undefined ? null : JSON.parse(JSON.stringify(profil[cle])); });
    if (avant.historiqueSalaire === null) avant.historiqueSalaire = [];
    O.majProfil(partiel, { immediat: true });
    var resume = etat.k.ap.resume;
    dlg.close();
    O.toast("Profil mis à jour avec votre fiche de paie.", {
      detail: resume.length ? resume.join(", ").replace(/^./, function (x) { return x.toUpperCase(); }) + "." : undefined,
      action: { libelle: "Annuler", fn: function () { O.majProfil(avant, { immediat: true }); O.toast("Profil revenu comme avant la fiche de paie.", { type: "info" }); } }
    });
    if (O.vibrer) O.vibrer(10);
  }

  /* ---------- Événements ---------- */
  ["fiche-photo", "fiche-fichier"].forEach(function (id) {
    $(id).addEventListener("change", function () { var f = this.files && this.files[0]; if (f) lancer(f); });
  });
  var depot = $("fiche-depot");
  ["dragenter", "dragover"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("survol"); }); });
  ["dragleave", "drop"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.remove("survol"); }); });
  depot.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) lancer(f); });
  $("fiche-main").addEventListener("click", function () { etat.jeton++; etat.analyse = null; etat.manuel = true; verifier(); });
  $("fiche-retour").addEventListener("click", function () { etat.jeton++; liberer(); montrer("depot"); });
  $("fiche-corriger").addEventListener("click", function () { montrer("verifier"); });
  $("fiche-controler").addEventListener("click", controler);
  $("fiche-maj").addEventListener("click", mettreAJour);
  $("fiche-fermer-sans").addEventListener("click", function () { dlg.close(); });
  $("fiche-fermer").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("close", function () { etat.jeton++; liberer(); $("fiche-feuille").classList.remove("lit"); });
  /* Entrée dans une case montant : contrôle direct depuis l'écran de vérification. */
  $("fiche-champs").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type === "text") { e.preventDefault(); controler(); } });

  var b1 = $("fiche-remplir"), b2 = $("fiche-controle");
  if (b1) b1.addEventListener("click", ouvrir);
  if (b2) b2.addEventListener("click", ouvrir);

  window.OrbiteFiche = { ouvrir: ouvrir, lancer: lancer };
})();
