/*
 * Orbite — vue « Mon orbite » : scène orbitale, budget, conseils, capacité d'emprunt,
 * suggestions d'épargne et projets. Tout vient de OrbiteCalcul.synthese().
 */
(function () {
  "use strict";
  var O = window.Orbite, F = O.F, $ = O.$, doc = document;
  var OC = window.OrbiteCalcul;
  var NS = "http://www.w3.org/2000/svg";
  var base = "net", baseChoisie = false;

  /* ---------- Scène orbitale ---------- */
  var ORBITES = [
    { cle: "salaire", rx: 150, ry: 62, incl: -18, vitesse: 1 / 78, angle: 200 },
    { cle: "credit", rx: 172, ry: 78, incl: 22, vitesse: 1 / 96, angle: 330 },
    { cle: "epargne", rx: 118, ry: 100, incl: 8, vitesse: 1 / 64, angle: 95 }
  ];
  var CIBLES = { salaire: 196, credit: 338, epargne: 92 };
  var visuel = doc.querySelector(".scene__visuel");
  var groupe = $("orbites");
  ORBITES.forEach(function (o) {
    var e = doc.createElementNS(NS, "ellipse");
    e.setAttribute("rx", o.rx); e.setAttribute("ry", o.ry);
    e.setAttribute("transform", "rotate(" + o.incl + ")");
    e.setAttribute("class", "orbite orbite--" + o.cle);
    groupe.appendChild(e);
    var p = doc.createElementNS(NS, "circle");
    p.setAttribute("r", "7");
    p.setAttribute("class", "planete planete--" + o.cle);
    groupe.appendChild(p);
    o.planete = p;
    o.etiquette = $("sat-" + o.cle);
  });

  function position(o, angleDeg) {
    var a = angleDeg * Math.PI / 180, i = o.incl * Math.PI / 180;
    var x = o.rx * Math.cos(a), y = o.ry * Math.sin(a);
    return { x: x * Math.cos(i) - y * Math.sin(i), y: x * Math.sin(i) + y * Math.cos(i) };
  }
  var RAYON_NOYAU = 64;
  function poser() {
    var r = visuel.getBoundingClientRect(), echelle = Math.min(r.width, r.height) / 400;
    visuel.style.setProperty("--d", (RAYON_NOYAU * 2 * echelle).toFixed(1) + "px");
    ORBITES.forEach(function (o) {
      var p = position(o, o.angle);
      o.planete.setAttribute("cx", p.x.toFixed(2));
      o.planete.setAttribute("cy", p.y.toFixed(2));
      o.etiquette.style.setProperty("--x", (r.width / 2 + p.x * echelle).toFixed(1) + "px");
      o.etiquette.style.setProperty("--y", (r.height / 2 + p.y * echelle).toFixed(1) + "px");
      /* L'étiquette se place du côté extérieur de la planète : elle ne recouvre jamais le noyau. */
      var l = Math.sqrt(p.x * p.x + p.y * p.y) || 1, nx = p.x / l, ny = p.y / l;
      var w = o.etiquette.offsetWidth, h = o.etiquette.offsetHeight, marge = 6;
      var gx = r.width / 2 + p.x * echelle - (0.5 - 0.5 * nx) * w + nx * 14;
      var gy = r.height / 2 + p.y * echelle - (0.5 - 0.5 * ny) * h + ny * 14;
      /* … et reste toujours dans le cadre de la scène. */
      gx = Math.max(marge, Math.min(r.width - w - marge, gx));
      gy = Math.max(marge, Math.min(r.height - h - marge, gy));
      o.etiquette.style.setProperty("--gx", gx.toFixed(1) + "px");
      o.etiquette.style.setProperty("--gy", gy.toFixed(1) + "px");
      o.etiquette.classList.toggle("satellite--derriere", Math.sin(o.angle * Math.PI / 180) < -0.35);
    });
  }

  var alignement = null, dernierT = null, boucle = null;
  function tic(t) {
    boucle = null;
    if ($("vue-orbite").hidden || doc.hidden) { dernierT = null; return; }
    var dt = dernierT === null ? 0 : Math.min(0.05, (t - dernierT) / 1000);
    dernierT = t;
    if (alignement) {
      var p = Math.min(1, (t - alignement.debut) / 900);
      var e = 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 1.2) ;
      ORBITES.forEach(function (o) { o.angle = alignement.depart[o.cle] + alignement.delta[o.cle] * Math.min(1.04, e); });
      if (p >= 1) alignement = null;
    } else if (!O.mouvementReduit.matches) {
      ORBITES.forEach(function (o) { o.angle = (o.angle + 360 * o.vitesse * dt) % 360; });
    }
    poser();
    if (!O.mouvementReduit.matches || alignement) boucle = requestAnimationFrame(tic);
  }
  function lancer() { if (!boucle) boucle = requestAnimationFrame(tic); }
  function aligner() {
    if (O.mouvementReduit.matches) { ORBITES.forEach(function (o) { o.angle = CIBLES[o.cle]; }); poser(); return; }
    var depart = {}, delta = {};
    ORBITES.forEach(function (o) {
      depart[o.cle] = o.angle;
      var d = ((CIBLES[o.cle] - o.angle) % 360 + 540) % 360 - 180;
      delta[o.cle] = d;
    });
    alignement = { debut: performance.now(), depart: depart, delta: delta };
    var n = $("noyau");
    n.classList.remove("pulse"); void n.getBoundingClientRect(); n.classList.add("pulse");
    lancer();
  }
  doc.addEventListener("visibilitychange", function () { if (!doc.hidden) lancer(); });
  window.addEventListener("resize", poser);

  /* ---------- Rendu ---------- */
  function cree(tag, classe, texte) { var e = doc.createElement(tag); if (classe) e.className = classe; if (texte != null) e.textContent = texte; return e; }
  function icone(nom) {
    var s = doc.createElementNS(NS, "svg"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS(NS, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }
  var premierRendu = true;

  function rendreScene(sy) {
    var s = sy.salaire, cap = sy.capacite[base];
    var mensuel = sy.profil.periode !== "annuel";
    O.animerNombre($("noyau-val"), s.netMensuel, function (v) { return F.dt0(v) + " DT"; });
    $("noyau-lib").textContent = "Net par mois";
    $("noyau-sous").textContent = "sur " + F.dt0(s.brutMensuel) + " DT brut" + (s.versements.nombre > 12 ? " · " + s.versements.nombre + " salaires" : "");
    var tr = F.pct(s.tranche.taux, 0);
    $("sat-salaire-val").textContent = tr;
    var capVue = cap.futur ? cap.futur.capacite : cap;
    $("sat-credit-lib").textContent = cap.futur ? "Mensualité dès " + cap.futur.date : "Mensualité possible";
    O.animerNombre($("sat-credit-val"), capVue.mensualiteMax, function (v) { return F.dt0(v) + " DT"; });
    var opt = sy.epargne.propositions[sy.epargne.propositions.length - 1];
    var eco = opt ? opt.economieAnnuelle : 0;
    O.animerNombre($("sat-epargne-val"), eco, function (v) { return F.dt0(v) + " DT/an"; });
    $("liste-salaire").textContent = F.dt3(s.netMensuel) + " DT net, tranche à " + tr;
    $("liste-credit").textContent = cap.futur ? "Aucune marge aujourd'hui, " + F.dt0(capVue.mensualiteMax) + " DT par mois dès " + cap.futur.date : F.dt0(cap.mensualiteMax) + " DT de mensualité possible";
    $("liste-epargne").textContent = F.dt0(eco) + " DT d'impôt économisable par an";
    var p = sy.profil;
    $("phrase-orbite").textContent = "Avec " + F.dt0(s.netMensuel) + " DT net par mois" +
      (p.credits.length ? " et " + p.credits.length + " crédit" + (p.credits.length > 1 ? "s" : "") + " en cours" : "") +
      ", voici ce que votre salaire rend possible." + (mensuel ? "" : "");
    aligner();
  }

  function rendreBudget(sy) {
    var b = sy.budget, cumul = 0;
    [["credits", b.parts.credits], ["logement", b.parts.logement], ["epargne", b.parts.epargne], ["reste", b.parts.reste]].forEach(function (x) {
      var arc = $("arc-" + x[0]), longueur = Math.max(0, x[1] * 100 - (x[1] > 0.02 ? 1.2 : 0));
      arc.style.setProperty("--l", longueur.toFixed(2));
      arc.style.setProperty("--o", (-cumul).toFixed(2));
      cumul += x[1] * 100;
    });
    function dt(v) { return F.dt0(v) + " DT"; }
    O.animerNombre($("budget-reste"), b.reste, dt);
    $("budget-reste-2").textContent = dt(b.reste);
    $("budget-credits").textContent = dt(b.credits);
    $("budget-logement").textContent = dt(b.logement);
    $("budget-epargne").textContent = dt(b.epargne);
    var nbSal = sy.profil.nombreSalaires;
    $("budget-sous").textContent = "Sur " + F.dt0(b.net) + " DT net par mois" + (nbSal > 12 ? " en moyenne (vos " + nbSal + " salaires répartis sur 12 mois)" : "") + (b.credits > 0 ? ". Vos crédits se remboursent en 12 échéances par an" : "") + ".";
    var al = $("budget-alerte");
    al.hidden = !b.alerte;
    al.textContent = b.alerte === "deficit" ? "Vos dépenses déclarées dépassent votre net de " + F.dt0(-b.reste) + " DT par mois." :
      b.alerte === "endettement" ? "Vos crédits représentent " + F.pct(b.endettementBanque, 0) + " de votre revenu " + sy.profil.baseBanque + " mensuel retenu par la banque, au-delà des " + F.pct(sy.profil.baseBanque === "brut" ? sy.profil.quotiteBrut : sy.profil.quotiteNet, 0) + " admis par " + (sy.profil.banque || "les banques") + "." : "";
  }

  var ICONES_MODULE = { salaire: "salaire", credit: "credit", epargne: "epargne", budget: "maison" };
  function rendreConseils(sy) {
    var ol = $("conseils");
    ol.textContent = "";
    var liste = sy.conseils.slice(0, 6);
    if (!liste.length) {
      var li0 = cree("li", "conseil conseil--vide");
      li0.appendChild(cree("p", null, "Tout est en ordre. Complétez votre profil (crédits, contrats, projets) pour des conseils plus précis."));
      ol.appendChild(li0);
      return;
    }
    liste.forEach(function (c, i) {
      var li = cree("li", "conseil conseil--" + c.module + (c.niveau >= 3 ? " conseil--urgent" : ""));
      li.style.setProperty("--i", String(i));
      var ic = cree("span", "conseil__icone"); ic.appendChild(icone(c.niveau >= 3 ? "alerte" : ICONES_MODULE[c.module] || "info"));
      var tx = cree("div", "conseil__texte");
      tx.appendChild(cree("strong", null, c.titre));
      tx.appendChild(cree("p", null, c.texte));
      li.appendChild(ic); li.appendChild(tx);
      if (c.lien) {
        var a = cree("a", "lien-action conseil__lien"); a.href = c.lien.href; a.textContent = c.lien.libelle;
        a.setAttribute("aria-label", c.lien.libelle + " (conseil : " + c.titre + ")");
        a.appendChild(icone("fleche")); li.appendChild(a);
      }
      ol.appendChild(li);
    });
  }

  /* Par défaut, la base de calcul est celle de la banque de l'utilisateur (profil). */
  function syncBase(sy) {
    if (baseChoisie || base === sy.profil.baseBanque) return;
    base = sy.profil.baseBanque;
    var r = doc.querySelector('input[name="base-capacite"][value="' + base + '"]');
    if (r) { r.checked = true; if (O.placerPastilles) O.placerPastilles(r.closest(".bloc-orbite")); }
  }
  function rendreCapacite(sy) {
    syncBase(sy);
    var cap = sy.capacite[base], autre = sy.capacite[base === "net" ? "brut" : "net"];
    /* Aucune marge aujourd'hui : on montre ce qui redevient possible à la fin des crédits en cours. */
    var futur = cap.futur || null, vue = futur ? futur.capacite : cap;
    $("capacite").classList.toggle("capacite--futur", !!futur);
    $("cap-tete-lib").textContent = futur ? "Mensualité possible à partir de " + futur.date : "Mensualité maximale";
    O.animerNombre($("cap-mensualite"), vue.mensualiteMax, function (v) { return F.dt0(v) + " DT"; });
    $("cap-revenu").textContent = futur
      ? "Aujourd'hui, vos crédits en cours (" + F.dt0(cap.charges) + " DT par mois) dépassent déjà " + F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT : aucun nouveau crédit n'est possible avant " + futur.date + "."
      : F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT " + (base === "net" ? "net" : "brut") + (cap.charges > 0 ? ", moins " + F.dt0(cap.charges) + " DT de crédits en cours" : "") + ".";
    var pr = sy.profil, annuel = pr.revenuBanque === "annuel";
    var revenuTxt = "Revenu retenu : " + (annuel ? "vos " + pr.nombreSalaires + " salaires et primes de l'année ÷ 12" : "votre salaire mensuel") + " = " + F.dt0(cap.revenu) + " DT " + base + " par mois, remboursé en 12 échéances par an. ";
    $("capacite-sous").textContent = revenuTxt + (autre.mensualiteMax < 1 && cap.mensualiteMax < 1
      ? "Calculé à " + F.pct(cap.quotite, 0) + " du salaire " + (base === "net" ? "net" : "brut") + ", crédits en cours déduits. Ni sur le net ni sur le brut, il n'y a de marge aujourd'hui."
      : base === "net"
      ? "Règle la plus courante : 40 % du salaire net. Sur le brut, la mensualité possible serait de " + F.dt0(autre.mensualiteMax) + " DT."
      : "Certaines banques calculent sur le brut. Sur le net, la mensualité possible serait de " + F.dt0(autre.mensualiteMax) + " DT.");
    var ul = $("cap-liste");
    if (ul.children.length !== cap.credits.length) {
      ul.textContent = "";
      cap.credits.forEach(function (c) {
        var li = cree("li", "capacite__ligne panneau");
        li.setAttribute("data-cle", c.cle);
        var tete = cree("div", "capacite__type");
        tete.appendChild(icone(c.cle.indexOf("immo") === 0 ? "maison" : c.cle === "auto" ? "voiture" : "credit"));
        tete.appendChild(cree("span", "capacite__lib"));
        li.appendChild(tete);
        li.appendChild(cree("strong", "capacite__capital chiffre"));
        li.appendChild(cree("span", "capacite__cond"));
        var a = cree("a", "lien-action", "Simuler"); a.appendChild(icone("fleche"));
        li.appendChild(a);
        ul.appendChild(li);
      });
    }
    vue.credits.forEach(function (c, i) {
      var li = ul.children[i];
      li.querySelector(".capacite__lib").textContent = c.libelle;
      O.animerNombre(li.querySelector(".capacite__capital"), c.capital, function (v) { return F.dt0(v) + " DT"; });
      li.querySelector(".capacite__cond").textContent = (futur ? "Dès " + futur.date + " · " : "") + (c.dureeMois / 12).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ans à " + F.pct(c.tauxPct / 100, 2) + (c.dureeLimitee ? " (durée limitée par l'âge)" : "");
      var a = li.querySelector("a");
      a.href = "#credit?type=" + c.cle + "&capital=" + Math.floor(c.capital) + "&mois=" + c.dureeMois + "&taux=" + c.tauxPct;
      a.setAttribute("aria-label", "Simuler un " + c.libelle.toLowerCase() + " de " + F.dt0(c.capital) + " DT");
    });
    rendrePaliers(sy, cap);
  }

  /* Calendrier de la marge : une étape par fin de crédit qui augmente la mensualité possible. */
  function rendrePaliers(sy, cap) {
    var bloc = $("cap-paliers"), ol = $("cap-paliers-liste"), paliers = cap.paliers || [];
    bloc.hidden = !paliers.length;
    if (!paliers.length) return;
    var p = sy.profil;
    $("cap-paliers-sous").textContent = "Calcul à " + F.pct(cap.quotite, 0) + " de " + F.dt0(cap.revenu) + " DT " + base + " par mois (" + (p.revenuBanque === "annuel" ? "salaires et primes de l'année ÷ 12" : "salaire mensuel") + ")" + (p.banque && base === p.baseBanque ? ", comme " + p.banque : "") +
      ". Chaque crédit qui se termine libère une partie de votre capacité d'emprunt. Les montants d'une même étape ne s'additionnent pas : c'est l'un ou l'autre.";
    ol.textContent = "";
    paliers.forEach(function (x) {
      var li = cree("li", "palier");
      var tete = cree("div", "palier__tete");
      tete.appendChild(cree("span", "palier__date", x.date.charAt(0).toUpperCase() + x.date.slice(1)));
      tete.appendChild(cree("span", "palier__fin", "Fin " + (x.credits.length > 1 ? "des crédits " : "du crédit ") + x.credits.map(function (c) { return c.toLowerCase().replace(/^crédit /, ""); }).join(" et ")));
      li.appendChild(tete);
      var corps = cree("div", "palier__corps");
      corps.appendChild(cree("strong", "palier__mensualite chiffre", F.dt0(x.mensualiteMax) + " DT par mois"));
      corps.appendChild(cree("span", "palier__capital", "soit jusqu'à " + F.dt0(x.capitalImmo) + " DT en immobilier sur " + Math.round(x.dureeImmoMois / 12) + " ans à 10 %"));
      var a = cree("a", "lien-action", "Simuler"); a.appendChild(icone("fleche"));
      a.href = "#credit?type=immo&capital=" + Math.floor(x.capitalImmo) + "&mois=" + x.dureeImmoMois + "&taux=10";
      a.setAttribute("aria-label", "Simuler un crédit immobilier de " + F.dt0(x.capitalImmo) + " DT, possible en " + x.date);
      corps.appendChild(a);
      li.appendChild(corps);
      ol.appendChild(li);
    });
  }

  function rendreSuggestions(sy) {
    var ul = $("suggestions"), ep = sy.epargne, choisie = O.choix().epargne;
    ul.textContent = "";
    $("suggestions-sous").textContent = ep.versementsExistants.av + ep.versementsExistants.cea > 0
      ? "Vos contrats actuels vous font déjà économiser " + F.dt0(ep.economieContrats) + " DT d'impôt par an. Voici ce que rapporterait un versement de plus."
      : "Assurance vie : vos versements réduisent votre impôt (art. 39 du Code de l'IRPP) et se capitalisent.";
    ep.propositions.forEach(function (x, i) {
      var li = cree("li", "suggestion panneau" + (x.cle === choisie ? " suggestion--choisie" : ""));
      li.style.setProperty("--i", String(i));
      var tete = cree("div", "suggestion__tete");
      tete.appendChild(cree("span", "puce puce--epargne", x.libelle));
      li.appendChild(tete);
      var v = cree("p", "suggestion__montant");
      v.appendChild(cree("strong", "chiffre", F.dt0(x.versementMensuel)));
      v.appendChild(cree("span", null, " DT par mois"));
      li.appendChild(v);
      li.appendChild(cree("p", "suggestion__phrase", x.phrase));
      var dl = cree("dl", "suggestion__chiffres");
      [["Impôt économisé", F.dt0(x.economieAnnuelle) + " DT / an"], ["Coût réel", F.dt0(x.coutReelMensuel) + " DT / mois"], ["Capital en " + x.dureeAns + " ans", F.dt0(x.capital) + " DT"]].forEach(function (l) {
        var d = cree("div"); d.appendChild(cree("dt", null, l[0])); d.appendChild(cree("dd", "chiffre", l[1])); dl.appendChild(d);
      });
      li.appendChild(dl);
      var actions = cree("div", "suggestion__actions");
      var b = cree("button", "bouton bouton--petit" + (x.cle === choisie ? " bouton--epargne" : ""), x.cle === choisie ? "Dans mon budget" : "Ajouter à mon budget");
      b.type = "button";
      b.setAttribute("aria-pressed", x.cle === choisie && O.choix().ajouterEpargne ? "true" : "false");
      b.addEventListener("click", function () {
        var deja = O.choix().epargne === x.cle && O.choix().ajouterEpargne;
        O.choisir("epargne", x.cle);
        O.choisir("ajouterEpargne", !deja);
        if (!deja) O.puceVolante(b, $("arc-epargne"), "+" + F.dt0(x.versementMensuel) + " DT", "epargne");
      });
      if (x.cle === choisie && O.choix().ajouterEpargne) b.textContent = "Retirer du budget";
      actions.appendChild(b);
      var a = cree("a", "lien-action", "Simuler en détail"); a.href = "#epargne?versement=" + x.versementMensuel; a.appendChild(icone("fleche"));
      actions.appendChild(a);
      li.appendChild(actions);
      ul.appendChild(li);
    });
    $("rendement-note") && ($("rendement-note").textContent = "");
  }

  var STATUTS = { ok: ["puce--succes", "À votre portée"], a_preparer: ["puce--alerte", "À préparer"], hors_portee: ["puce--erreur", "Hors de portée aujourd'hui"] };
  function rendreProjets(sy) {
    var ul = $("projets");
    ul.textContent = "";
    if (!sy.projets.length) {
      var li0 = cree("li", "projet projet--vide panneau panneau--plat");
      li0.appendChild(cree("p", null, "Ajoutez un projet (logement, voiture, études, retraite…) : Orbite calcule le crédit mobilisable, l'apport nécessaire et l'effort d'épargne mensuel."));
      ul.appendChild(li0);
      return;
    }
    sy.projets.forEach(function (pr) {
      var li = cree("li", "projet panneau");
      var st = STATUTS[pr.statut];
      var tete = cree("div", "projet__tete");
      tete.appendChild(cree("strong", null, pr.libelle));
      tete.appendChild(cree("span", "puce " + st[0], st[1]));
      li.appendChild(tete);
      li.appendChild(cree("p", "projet__montant chiffre", F.dt0(pr.montant) + " DT" + (pr.horizonAns ? " · dans " + pr.horizonAns + " an" + (pr.horizonAns > 1 ? "s" : "") : "")));
      var dl = cree("dl", "suggestion__chiffres");
      var lignes = [];
      if (pr.credit) {
        lignes.push(["Crédit possible (" + pr.credit.court.toLowerCase() + ")", F.dt0(pr.credit.capitalMax) + " DT"]);
        lignes.push(["Apport minimal", F.dt0(pr.apportMin) + " DT"]);
        lignes.push(["Mensualité du crédit nécessaire", F.dt0(pr.credit.mensualite) + " DT"]);
      }
      if (pr.epargneMensuelle > 0) lignes.push(["À épargner chaque mois", F.dt0(pr.epargneMensuelle) + " DT"]);
      lignes.forEach(function (l) { var d = cree("div"); d.appendChild(cree("dt", null, l[0])); d.appendChild(cree("dd", "chiffre", l[1])); dl.appendChild(d); });
      li.appendChild(dl);
      if (pr.credit) {
        var a = cree("a", "lien-action", "Simuler ce crédit");
        a.href = "#credit?type=" + pr.credit.cle + "&capital=" + Math.round(pr.credit.besoin) + "&mois=" + pr.credit.dureeMois + "&taux=" + pr.credit.tauxPct + "&prix=" + Math.round(pr.montant) + "&apport=" + Math.round(pr.apportDisponible);
        a.appendChild(icone("fleche")); li.appendChild(a);
      }
      ul.appendChild(li);
    });
  }

  function rendre(sy) {
    if (sy) syncBase(sy);
    if (!sy) return;
    $("demarrage").hidden = !O.profilVierge();
    $("orbite-contenu").classList.toggle("en-attente", O.profilVierge());
    rendreScene(sy);
    rendreBudget(sy);
    rendreConseils(sy);
    rendreCapacite(sy);
    rendreSuggestions(sy);
    rendreProjets(sy);
    var badge = $("badge-profil");
    badge.hidden = !O.profilVierge();
    if (premierRendu) { premierRendu = false; doc.body.classList.add("orbite-entree"); setTimeout(function () { doc.body.classList.remove("orbite-entree"); }, 1200); }
    O.remplirUtilisateur();
  }

  doc.querySelectorAll('input[name="base-capacite"]').forEach(function (r) {
    r.addEventListener("change", function () { base = this.value; baseChoisie = true; var sy = O.synthese(); if (sy) rendreCapacite(sy); if (sy) rendreScene(sy); });
  });

  /* ---------- Premier pas ---------- */
  var formD = $("form-demarrage");
  formD.addEventListener("change", function (e) {
    if (e.target.name === "d-sens") $("d-montant-lib").textContent = "Salaire " + e.target.value + " par mois";
  });
  formD.addEventListener("submit", function (e) {
    e.preventDefault();
    var lu = F.lire($("d-montant").value);
    var champ = $("d-montant");
    if (!lu.valide || lu.vide || lu.valeur <= 0) { champ.setAttribute("aria-invalid", "true"); champ.focus(); O.toast("Indiquez votre salaire, par exemple 2 500."); return; }
    champ.setAttribute("aria-invalid", "false");
    O.majProfil({
      montant: lu.valeur, periode: "mensuel",
      sens: (formD.querySelector('input[name="d-sens"]:checked') || {}).value,
      secteur: (formD.querySelector('input[name="d-secteur"]:checked') || {}).value,
      chefDeFamille: $("d-chef").checked
    }, { immediat: true });
    O.toast("Votre orbite est en mouvement. Complétez « Mon profil » pour des conseils encore plus précis.");
    var scene = doc.querySelector(".scene");
    if (scene) scene.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
  });

  O.surProfil(rendre);
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue === "orbite") { requestAnimationFrame(function () { poser(); lancer(); }); }
    /* #orbite?section=marge : défile jusqu'au calendrier de la marge (ou à la capacité). */
    if (e.detail.vue === "orbite" && e.detail.params.get("section") === "marge") {
      setTimeout(function () {
        var cible = !$("cap-paliers").hidden ? $("cap-paliers") : doc.querySelector("[aria-labelledby=titre-capacite]");
        if (cible) cible.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "start" });
      }, 120);
    }
  });
  poser();
  lancer();
})();
