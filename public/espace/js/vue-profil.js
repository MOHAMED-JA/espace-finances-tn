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
  var MAX = { enfants: 15, etudiants: 15, handicapes: 15, parents: 2, nombreSalaires: 18, conjointSalaires: 18 };
  var MIN = { nombreSalaires: 12, conjointSalaires: 12 };
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
      else if (el.getAttribute("data-type") === "date") el.value = v || "";
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
    remplirPrimes(p);
  }
  /* Champs du conjoint : affichés dès que le mode couple est activé (même pendant une saisie). */
  /* Calendrier des versements supplémentaires : visible au-delà de 12 salaires ; par défaut, tout en décembre. */
  function remplirPrimes(p) {
    var bloc = $("p-primes-bloc"); if (!bloc) return;
    bloc.hidden = p.nombreSalaires <= 12;
    var cal = OC.calendrierPrimes(p);
    form.querySelectorAll("[data-prime]").forEach(function (el) { var v = cal[+el.getAttribute("data-prime")]; el.value = v ? String(v).replace(".", ",") : ""; });
    controlePrimes(p, cal);
  }
  function controlePrimes(p, cal) {
    var total = cal.reduce(function (t, v) { return t + v; }, 0), attendu = p.nombreSalaires - 12, bloc = $("p-primes-bloc");
    var ecart = Math.abs(total - attendu) > 0.01;
    if (ecart) bloc.setAttribute("data-ecart", ""); else bloc.removeAttribute("data-ecart");
    $("p-primes-aide").textContent = ecart
      ? "Total réparti : " + String(total).replace(".", ",") + " versement(s) sur " + attendu + " prévus (" + p.nombreSalaires + " salaires par an). Ajustez les mois ou le nombre de salaires."
      : "En nombre de salaires, par pas de 0,5 (ex. 1,5 en décembre). Sert à calculer l'impôt qui reste à retenir sur vos paies.";
  }
  function lirePrimes() {
    var cal = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    form.querySelectorAll("[data-prime]").forEach(function (el) { var r = F.lire(el.value); cal[+el.getAttribute("data-prime")] = r.valide && !r.vide ? Math.min(6, Math.round(r.valeur * 2) / 2) : 0; });
    return cal;
  }

  function rendreFoyer(p) {
    var fc = $("foyer-champs"), avant = fc.hidden;
    fc.hidden = !p.foyer;
    if (avant && !fc.hidden) requestAnimationFrame(function () { O.placerPastilles(fc); });
    $("sec-foyer-sous").textContent = p.foyer && p.conjointMontant > 0 ? "Mode couple · " + (p.conjointPrenom || "conjoint") + " : " + F.dt0(p.conjointMontant) + " DT " + p.conjointSens : "Mode couple : deux salaires, un budget et une capacité communs";
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
        else if ((c === "anneeDebut" || c === "dureeMois" || c === "reductionAnnee") && !v) el.value = "";
        else el.value = c === "anneeDebut" || c === "reductionAnnee" ? String(v) : versTexte(el.getAttribute("data-type"), v);
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
    else if (cle === "prenom" || cle === "nom" || cle === "banque" || cle === "conjointPrenom") partiel[cle] = el.value;
    else if (el.getAttribute("data-type") === "date") {
      var ok = el.value === "" || /^\d{4}-\d{2}-\d{2}$/.test(el.value);
      el.setAttribute("aria-invalid", ok && !(el.required && !el.value) ? "false" : "true");
      if (!ok) return;
      partiel[cle] = el.value;
    }
    else if (cle === "anneeNaissance") { var a = parseInt(el.value, 10); if (!(a > 1900)) return; partiel[cle] = a; }
    else {
      var v = depuisTexte(el.getAttribute("data-type"), el.value);
      el.setAttribute("aria-invalid", v === undefined ? "true" : "false");
      if (v === undefined) return;
      partiel[cle] = v;
    }
    O.majProfil(partiel);
  }

  /* Un délai par champ ou par liste : une saisie rapide dans un autre champ n'annule jamais la précédente. */
  var attentes = {};
  function planifier(cle, fn, delai) {
    if (attentes[cle]) clearTimeout(attentes[cle].t);
    attentes[cle] = { fn: fn, t: setTimeout(function () { delete attentes[cle]; fn(); }, delai) };
  }
  function vider(cle) {
    var a = attentes[cle];
    if (!a) return;
    clearTimeout(a.t); delete attentes[cle]; a.fn();
  }
  function majListe(cle) { var o = {}; o[cle] = lireListe(cle); O.majProfil(o); }

  form.addEventListener("input", function (e) {
    var el = e.target;
    enEdition = true;
    if (el.hasAttribute("data-p")) {
      if (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT") return;
      planifier("p:" + el.getAttribute("data-p"), function () { majDepuis(el); }, 250);
    } else if (el.hasAttribute("data-c")) {
      var cle = el.closest("[data-liste]").getAttribute("data-liste");
      planifier("l:" + cle, function () { majListe(cle); }, 300);
    } else if (el.hasAttribute("data-prime")) {
      planifier("primes", function () { var cal = lirePrimes(); O.majProfil({ calendrierPrimes: cal }); controlePrimes(O.profil(), cal); }, 300);
    }
  });
  form.addEventListener("change", function (e) {
    var el = e.target;
    if (el.hasAttribute("data-p") && (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT")) majDepuis(el);
    else if (el.hasAttribute("data-c") && el.tagName === "SELECT") majListe(el.closest("[data-liste]").getAttribute("data-liste"));
  });
  form.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute("data-p")) vider("p:" + el.getAttribute("data-p"));
    else if (el.hasAttribute && el.hasAttribute("data-c")) vider("l:" + el.closest("[data-liste]").getAttribute("data-liste"));
    else if (el.hasAttribute && el.hasAttribute("data-prime")) vider("primes");
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
      var k = aj.getAttribute("data-ajouter");
      vider("l:" + k);
      var courant = O.profil()[k].slice();
      var neuf = k === "credits" ? { libelle: "", type: "conso", mensualite: 0 } : k === "contrats" ? { libelle: "", type: "av", versementMensuel: 0, anneeDebut: new Date().getFullYear(), moisDebut: new Date().getMonth() + 1 } : { type: "logement", montant: 0, horizonAns: 3 };
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
      vider("l:" + k2);
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
    rendreFoyer(p);
    var s = sy.salaire;
    $("p-age").textContent = p.dateNaissance ? sy.age + " ans" : "Obligatoire : la banque en tient compte pour la durée du crédit.";
    $("p-naissance").setAttribute("aria-invalid", p.dateNaissance ? "false" : "true");
    $("p-anciennete-aide").textContent = p.dateEmbauche ? p.anciennete + " an" + (p.anciennete > 1 ? "s" : "") + " d'ancienneté" : "Facultatif : sert au calcul de votre ancienneté.";
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
    /* Sous chaque crédit : échéances payées et restantes, date de fin (12 échéances par an). */
    var lc = $("liste-credits").children;
    (sy.credits || []).forEach(function (e, i) {
      var li = lc[i]; if (!li) return;
      var info = li.querySelector("[data-echeancier]"), champ = li.querySelector('[data-c="moisRestants"]');
      if (champ) { champ.readOnly = e.calcule; champ.closest(".saisie").classList.toggle("saisie--calculee", e.calcule); }
      if (champ && e.calcule && champ !== doc.activeElement) champ.value = String(e.restantes);
      if (!info) return;
      info.textContent = e.calcule
        ? e.payees + " échéances payées sur " + e.duree + " · " + e.restantes + " restantes · dernière échéance en " + e.fin
        : e.restantes > 0 ? e.restantes + " échéances restantes · fin prévue en " + e.fin + ". Indiquez la date de début et la durée pour un calcul exact." : "Indiquez la date de début et la durée : Orbite calcule les échéances restantes et la date de fin.";
      /* Règle des 8 % : où en est ce crédit ? */
      var r8 = li.querySelector("[data-reduction]"), rt = e.reduction;
      if (r8) {
        var t8 = texteRegle8(rt);
        r8.textContent = t8.texte; r8.hidden = !t8.texte; r8.classList.toggle("ligne-liste__info--alerte", !!t8.alerte);
      }
    });
    /* Sous chaque contrat : total versé et capital estimé (ou saisi). */
    var lis = $("liste-contrats").children;
    (sy.contrats || []).forEach(function (e, i) {
      var info = lis[i] && lis[i].querySelector("[data-estimation]");
      if (!info) return;
      if (!(e.verse > 0)) { info.textContent = "Indiquez vos versements : Orbite estimera le capital accumulé."; return; }
      info.textContent = F.dt0(e.verse) + " DT versés depuis l'ouverture · " + (e.estime ? "capital estimé ≈ " + F.dt0(e.capitalEstime) + " DT (5 % net par an)" : "capital " + F.dt0(e.capital) + " DT") +
        " · " + (e.dureeAtteinte ? e.dureeFiscale + " ans atteints" : e.dureeFiscale + " ans en " + e.dateDureeFiscale);
    });
    $("sec-banque-sous").textContent = (p.banque ? p.banque + " · " : "") + "calcul sur le " + p.baseBanque + " à " + F.pct(p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet, 0) + (p.revenuBanque === "annuel" ? ", salaires et primes de l'année ÷ 12" : ", salaire mensuel seul");
    var pr = progression(p);
    $("profil-jauge").style.setProperty("--p", String(pr));
    $("profil-progression-texte").textContent = "Profil complété à " + Math.round(pr * 100) + " %" + (pr < 1 ? " : chaque information affine vos conseils." : ". Merci, vos conseils sont aussi précis que possible.");
  }
  /* Règle des 8 % (loi n° 2024-41) : une phrase par crédit, sans promettre de gain tant que le taux n'est pas « fixe ». */
  function texteRegle8(rt) {
    function pc(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }
    function ratio(x) { return (x * 100).toFixed(2).replace(".", ",") + " %"; }
    if (!rt) return { texte: "" };
    if (rt.motif === "type") return { texte: "Taux fixe ou variable ? Pour un crédit à taux fixe de plus de 7 ans, la règle des 8 % peut diviser votre taux par deux : précisez-le.", alerte: true };
    if (rt.motif === "dates") return { texte: "Règle des 8 % : indiquez la date de début et la durée totale pour savoir quand demander une réduction de taux.", alerte: true };
    if (rt.motif === "variable") return { texte: "Taux variable : non concerné par la règle des 8 % (réservée aux taux fixes)." };
    if (rt.motif === "duree") return { texte: "7 ans ou moins : non concerné par la règle des 8 % (crédits de plus de 84 mois)." };
    if (!rt.applicable) return { texte: "" };
    if (rt.possibleDepuis) return { texte: "Réduction de taux possible depuis " + rt.possibleDepuis.date + " (intérêts des 3 dernières années : " + ratio(rt.possibleDepuis.ratio) + " du capital restant). Demandez-la à votre banque ; si elle est déjà obtenue, indiquez sa date.", alerte: true };
    var r = rt.reductions[0];
    if (r) return { texte: "Règle des 8 % : prochaine réduction de taux en " + r.date + " (" + pc(r.tauxAvant) + " → " + pc(r.tauxPct) + ", mensualité " + F.dt3(r.mensualiteAvant) + " → " + F.dt3(r.mensualite) + " DT)" + (rt.prochainControle && !rt.prochainControle.ok ? ". Premier contrôle en " + rt.prochainControle.date + " : " + ratio(rt.prochainControle.ratio) + ", sous le seuil de 8 %." : ".") };
    return { texte: "Règle des 8 % : aucune nouvelle réduction de taux d'ici la fin de ce crédit." };
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
