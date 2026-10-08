/*
 * Orbite — vue « Mon profil » : toutes les informations qui orientent les conseils.
 * Champs simples (data-p), compteurs (data-pp), listes (crédits, contrats, projets).
 * Chaque modification met à jour le profil partagé (enregistré automatiquement).
 */
(function () {
  "use strict";
  var O = window.Orbite, F = O.F, $ = O.$, doc = document;
  var OC = window.OrbiteCalcul;
  var form = $("form-profil-complet");
  var MAX = { enfants: 15, etudiants: 15, handicapes: 15, parents: 2, nombreSalaires: 18 };
  var MIN = { nombreSalaires: 12 };
  var LISTES = { credits: "modele-credit", contrats: "modele-contrat", projets: "modele-projet" };
  var enEdition = false;

  /* ---------- Lecture / écriture des valeurs ---------- */
  function versTexte(type, v) {
    if (type === "montant") return v ? F.saisie(v) : "";
    if (type === "pourcent") return v ? String(Math.round(v * 1000) / 10).replace(".", ",") : "";
    if (type === "decimal") return v ? String(v).replace(".", ",") : "";
    return v === 0 || v ? String(v) : "";
  }
  function depuisTexte(type, t) {
    var lu = F.lire(t);
    if (!lu.valide) return undefined;
    if (type === "pourcent") return lu.vide ? undefined : lu.valeur / 100;
    if (type === "entier") return lu.vide ? 0 : Math.round(lu.valeur);
    return lu.valeur;
  }

  function remplirChamps(p) {
    form.querySelectorAll("[data-p]").forEach(function (el) {
      var cle = el.getAttribute("data-p"), v = p[cle];
      if (el === doc.activeElement) return;
      if (el.type === "radio") el.checked = el.value === v;
      else if (el.type === "checkbox") el.checked = !!v;
      else if (el.tagName === "SELECT") el.value = v;
      else el.value = cle === "anneeNaissance" ? String(v) : versTexte(el.getAttribute("data-type"), v);
    });
    form.querySelectorAll("[data-po]").forEach(function (o) {
      var cle = o.getAttribute("data-po");
      o.textContent = String(p[cle]);
      form.querySelectorAll('[data-pp="' + cle + '"]').forEach(function (b) {
        var pas = Number(b.getAttribute("data-pas"));
        b.disabled = pas < 0 ? p[cle] <= (MIN[cle] || 0) : p[cle] >= MAX[cle];
      });
    });
    ["credits", "contrats", "projets"].forEach(function (k) { remplirListe(k, p[k]); });
  }

  function remplirListe(cle, items) {
    var ul = $("liste-" + cle);
    var enCours = ul.contains(doc.activeElement);
    if (enCours && ul.children.length === items.length) return;
    ul.textContent = "";
    items.forEach(function (it, i) {
      var li = $(LISTES[cle]).content.firstElementChild.cloneNode(true);
      li.setAttribute("data-index", String(i));
      li.querySelectorAll("[data-c]").forEach(function (el, j) {
        var c = el.getAttribute("data-c"), v = it[c];
        var id = "l-" + cle + "-" + i + "-" + c;
        el.id = id;
        var lab = el.closest(".champ") && el.closest(".champ").querySelector("label");
        if (lab) lab.setAttribute("for", id);
        if (el.tagName === "SELECT") el.value = v;
        else el.value = c === "anneeDebut" ? String(v) : versTexte(el.getAttribute("data-type"), v);
      });
      var analyser = li.querySelector("[data-analyser]");
      if (analyser) analyser.href = "#credit?mon=" + i;
      ul.appendChild(li);
    });
  }

  function lireListe(cle) {
    var ul = $("liste-" + cle), res = [];
    Array.prototype.forEach.call(ul.children, function (li) {
      var it = {};
      li.querySelectorAll("[data-c]").forEach(function (el) {
        var c = el.getAttribute("data-c"), type = el.getAttribute("data-type");
        if (el.tagName === "SELECT" || !type) it[c] = el.value;
        else { var v = depuisTexte(type, el.value); if (v !== undefined) it[c] = v; }
      });
      res.push(it);
    });
    return res;
  }

  /* ---------- Événements ---------- */
  function majDepuis(el) {
    var cle = el.getAttribute("data-p");
    var partiel = {};
    if (el.type === "radio") { if (!el.checked) return; partiel[cle] = el.value; }
    else if (el.type === "checkbox") partiel[cle] = el.checked;
    else if (el.tagName === "SELECT") partiel[cle] = el.value;
    else if (cle === "prenom") partiel[cle] = el.value;
    else if (cle === "anneeNaissance") { var a = parseInt(el.value, 10); if (!(a > 1900)) return; partiel[cle] = a; }
    else {
      var v = depuisTexte(el.getAttribute("data-type"), el.value);
      el.setAttribute("aria-invalid", v === undefined ? "true" : "false");
      if (v === undefined) return;
      partiel[cle] = v;
    }
    O.majProfil(partiel);
  }

  var minuterie = null;
  form.addEventListener("input", function (e) {
    var el = e.target;
    enEdition = true;
    if (el.hasAttribute("data-p")) {
      if (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT") return;
      clearTimeout(minuterie);
      minuterie = setTimeout(function () { majDepuis(el); }, 250);
    } else if (el.hasAttribute("data-c")) {
      var cle = el.closest("[data-liste]").getAttribute("data-liste");
      clearTimeout(minuterie);
      minuterie = setTimeout(function () { var o = {}; o[cle] = lireListe(cle); O.majProfil(o); }, 300);
    }
  });
  form.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-p") && (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT")) majDepuis(el);
    else if (el.hasAttribute("data-c") && el.tagName === "SELECT") { var cle = el.closest("[data-liste]").getAttribute("data-liste"); var o = {}; o[cle] = lireListe(cle); O.majProfil(o); }
  });
  form.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute("data-type") === "montant") { var lu = F.lire(el.value); if (lu.valide && !lu.vide) el.value = F.saisie(lu.valeur); }
    enEdition = false;
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  form.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pp]");
    if (b && !b.disabled) {
      var cle = b.getAttribute("data-pp"), p = O.profil(), o = {};
      o[cle] = Math.max(MIN[cle] || 0, Math.min(MAX[cle], p[cle] + Number(b.getAttribute("data-pas"))));
      O.majProfil(o);
      var out = form.querySelector('[data-po="' + cle + '"]');
      if (out && !O.mouvementReduit.matches) { out.classList.remove("saute"); void out.offsetWidth; out.classList.add("saute"); }
      return;
    }
    var aj = e.target.closest("[data-ajouter]");
    if (aj) {
      var k = aj.getAttribute("data-ajouter"), courant = O.profil()[k].slice();
      var neuf = k === "credits" ? { libelle: "", type: "conso", mensualite: 0 } : k === "contrats" ? { libelle: "", type: "av", versementMensuel: 0, anneeDebut: new Date().getFullYear() } : { type: "logement", montant: 0, horizonAns: 3 };
      courant.push(neuf);
      var o2 = {}; o2[k] = courant;
      O.majProfil(o2);
      var ul = $("liste-" + k);
      remplirListe(k, O.profil()[k]);
      var dernier = ul.lastElementChild;
      if (dernier) { var champ = dernier.querySelector("input, select"); if (champ) champ.focus(); }
      return;
    }
    var rt = e.target.closest("[data-retirer]");
    if (rt) {
      var li = rt.closest("[data-liste]"), k2 = li.getAttribute("data-liste"), idx = Number(li.getAttribute("data-index"));
      var avant = O.profil()[k2].slice(), retire = avant.splice(idx, 1)[0];
      var o3 = {}; o3[k2] = avant;
      O.majProfil(o3);
      remplirListe(k2, O.profil()[k2]);
      O.toast("Élément retiré.", { duree: 6000, action: { libelle: "Annuler", fn: function () {
        var l = O.profil()[k2].slice(); l.splice(idx, 0, retire); var o4 = {}; o4[k2] = l; O.majProfil(o4); remplirListe(k2, O.profil()[k2]);
      } } });
    }
  });

  /* ---------- Résumés et progression ---------- */
  function progression(p) {
    var points = 0, total = 8;
    if (p.prenom) points++;
    if (p.montant > 0) points += 2;
    if (p.situation !== "celibataire" || p.chefDeFamille || p.enfants) points++;
    if (p.credits.length) points++;
    if (p.contrats.length) points++;
    if (p.loyer || p.chargesFixes || p.epargneDisponible) points++;
    if (p.projets.length) points++;
    return Math.min(1, points / total);
  }
  function rendre(sy, p) {
    if (!sy) return;
    if (!enEdition) remplirChamps(p);
    var s = sy.salaire;
    $("p-age").textContent = sy.age + " ans";
    $("p-montant-lib").textContent = "Salaire " + (p.sens === "net" ? "net" : "brut") + (p.periode === "annuel" ? " par an" : " par mois");
    var n = p.nombreSalaires;
    $("p-aide-salaires").textContent = n === 12 ? "12 = sans 13ᵉ mois" : n === 13 ? "13 = avec un 13ᵉ mois" : "dont " + (n - 12) + " versements en plus";
    $("p-resume-salaire").innerHTML = "";
    var r = $("p-resume-salaire");
    r.appendChild(doc.createTextNode("Net à payer : "));
    var b1 = doc.createElement("strong"); b1.textContent = F.dt3(s.netMensuel) + " DT par mois"; r.appendChild(b1);
    r.appendChild(doc.createTextNode(" · brut " + F.dt0(s.brutMensuel) + " DT · tranche d'impôt à " + F.pct(s.tranche.taux, 0) + "."));
    var nc = p.credits.length, nk = p.contrats.length, np = p.projets.length;
    $("sec-credits-sous").textContent = nc ? nc + " crédit" + (nc > 1 ? "s" : "") + " · " + F.dt0(sy.chargesCredits) + " DT par mois" : "Aucun crédit déclaré";
    $("sec-contrats-sous").textContent = nk ? nk + " contrat" + (nk > 1 ? "s" : "") + " · " + F.dt0(sy.epargne.economieContrats) + " DT d'impôt économisé par an" : "Aucun contrat déclaré";
    $("sec-projets-sous").textContent = np ? np + " projet" + (np > 1 ? "s" : "") : "Aucun projet";
    var pr = progression(p);
    $("profil-jauge").style.setProperty("--p", String(pr));
    $("profil-progression-texte").textContent = "Profil complété à " + Math.round(pr * 100) + " %" + (pr < 1 ? " : chaque information affine vos conseils." : ". Merci, vos conseils sont aussi précis que possible.");
  }
  O.surProfil(rendre);

  /* Ouverture d'une section précise : #profil?section=budget */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "profil") return;
    var sec = e.detail.params.get("section");
    if (!sec) return;
    var d = $("sec-" + sec);
    if (d) { d.open = true; setTimeout(function () { d.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "start" }); }, 60); }
  });
})();
