/*
 * Orbite — visite guidée de la première connexion.
 * Démarre juste après le « premier pas » (le salaire saisi : les vrais chiffres sont à l'écran), une seule fois par
 * compte (user_metadata.orbite_visite). On la revoit avec le bouton « ? » de la barre ou depuis Paramètres → Préférences.
 * Une bulle désigne chaque rubrique ; sur téléphone, les rubriques absentes des onglets du bas sont présentées
 * au centre de l'écran. Clavier : flèches, Entrée, Échap.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document, $ = O.$;

  /* cibles : sélecteurs essayés dans l'ordre ; le premier visible est désigné. Sans cible visible, bulle centrée. */
  var ETAPES = [
    { titre: "Bienvenue dans Orbite", texte: "Votre salaire est au centre, et tout le reste tourne autour : impôt, épargne, crédit, projets. Cette visite vous montre chaque rubrique en une minute." },
    { cibles: [".scene"], titre: "Mon orbite", texte: "Votre tableau de bord. Au centre, votre net du mois ; autour, vos crédits, contrats et projets en satellites. Touchez-en un pour sa fiche, puis voyagez dans le temps : vous voyez votre marge grandir à la fin de chaque crédit." },
    { cibles: [".fiche-orbite"], titre: "Votre fiche", texte: "Vos repères du moment (tranche d'impôt, mensualité possible, impôt économisable), votre endettement et la liste de tout ce qui est en orbite. Elle suit le mois choisi dans le voyage." },
    { cibles: ["#capacite", "#vue-orbite .requiert-naissance"], titre: "Ce que la banque peut vous prêter", texte: "Le montant possible pour un crédit immobilier, auto ou à la consommation, selon la règle de votre banque. Les taux sont modifiables juste en dessous, et le calendrier de la marge montre ce que libère chaque crédit qui se termine." },
    { cibles: [".rail a[data-vue='profil']", ".onglets-bas a[data-vue='profil']"], titre: "Mon profil", texte: "Le cœur d'Orbite : nom, date de naissance (obligatoire pour la capacité d'emprunt), date d'embauche, famille, salaire, crédits en cours, contrats et budget. Tout est enregistré automatiquement et visible par vous seul." },
    { cibles: [".rail a[data-vue='salaire']", ".onglets-bas a[data-vue='salaire']"], titre: "Salaire", texte: "Du brut au net au millime près : CNSS ou CNRPS, IRPP et CSS, primes, 13ᵉ mois et plus. Simulez une augmentation et voyez combien coûte votre salaire à l'employeur." },
    { cibles: [".rail a[data-vue='epargne']", ".onglets-bas a[data-vue='epargne']"], titre: "Épargne vie & CEA", texte: "Projetez votre assurance vie et votre CEA, et voyez l'impôt que chaque versement vous fait économiser." },
    { cibles: [".rail a[data-vue='credit']", ".onglets-bas a[data-vue='credit']"], titre: "Crédit", texte: "Simulez un crédit à taux fixe ou TMM + marge : mensualité, coût total, tableau d'amortissement, et comparez plusieurs offres." },
    { cibles: [".rail a[data-vue='vie']", ".onglets-bas a[data-vue='profil']"], titre: "Vie & impôts", texte: "Le simulateur de vie (mariage, naissance, voiture, logement : l'effet sur votre budget) et l'optimiseur fiscal, qui indique combien verser et avant quelle date pour payer moins d'impôt. Sur téléphone, vous le trouvez dans « Moi »." },
    { cibles: [".rail a[data-vue='assistant']", "#bulle-assistant"], titre: "Assistant", texte: "Posez vos questions en français ou en darija, par exemple « Najjem nechri karhba fi 2029 ? ». Il répond avec vos propres chiffres." },
    { cibles: [".rail a[data-vue='simulations']"], titre: "Simulations", texte: "Toutes les simulations que vous enregistrez, à retrouver, renommer, comparer ou supprimer." },
    { cibles: [".rail a[data-vue='compte']", ".onglets-bas a[data-vue='profil']"], titre: "Paramètres", texte: "Photo, apparence, sécurité, abonnement et vos données : export, suppression, et partage facultatif de votre fiche." },
    { cibles: ["#aide-visite"], titre: "Revoir cette visite", texte: "Ce bouton relance la visite à tout moment. Commencez par compléter « Mon profil » : plus il est précis, plus vos conseils le sont.", fin: true }
  ];

  var etat = null; /* { i, racine, halo, bulle, precedent } */

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }
  function cibleDe(etape) {
    var l = etape.cibles || [];
    for (var k = 0; k < l.length; k++) { var el = doc.querySelector(l[k]); if (visible(el)) return el; }
    return null;
  }
  function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function construire() {
    var racine = el("div", "visite"), halo = el("div", "visite__halo"), bulle = el("div", "visite__bulle");
    halo.setAttribute("aria-hidden", "true");
    bulle.setAttribute("role", "dialog"); bulle.setAttribute("aria-modal", "true");
    bulle.setAttribute("aria-labelledby", "visite-titre"); bulle.setAttribute("aria-describedby", "visite-texte");
    var tete = el("div", "visite__tete");
    tete.appendChild(el("span", "visite__compteur")).id = "visite-compteur";
    var passer = el("button", "visite__passer", "Passer"); passer.type = "button"; passer.id = "visite-passer";
    tete.appendChild(passer);
    bulle.appendChild(tete);
    bulle.appendChild(el("h2", "visite__titre")).id = "visite-titre";
    bulle.appendChild(el("p", "visite__texte")).id = "visite-texte";
    var points = el("div", "visite__points"); points.setAttribute("aria-hidden", "true");
    ETAPES.forEach(function () { points.appendChild(el("i")); });
    bulle.appendChild(points);
    var pied = el("div", "visite__pied");
    var prec = el("button", "bouton bouton--petit bouton--fantome", "Précédent"); prec.type = "button"; prec.id = "visite-prec";
    var suiv = el("button", "bouton bouton--petit bouton--plein", "Suivant"); suiv.type = "button"; suiv.id = "visite-suiv";
    pied.appendChild(prec); pied.appendChild(suiv);
    bulle.appendChild(pied);
    racine.appendChild(halo); racine.appendChild(bulle);
    passer.addEventListener("click", function () { terminer(false); });
    prec.addEventListener("click", function () { aller(etat.i - 1); });
    suiv.addEventListener("click", function () { if (etat.i >= ETAPES.length - 1) terminer(true); else aller(etat.i + 1); });
    /* Un clic hors de la bulle ne ferme pas la visite (évite les fermetures accidentelles) ; Échap la ferme. */
    racine.addEventListener("keydown", clavier);
    return { racine: racine, halo: halo, bulle: bulle };
  }

  function clavier(e) {
    if (e.key === "Escape") { e.preventDefault(); terminer(false); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); if (etat.i < ETAPES.length - 1) aller(etat.i + 1); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); if (etat.i > 0) aller(etat.i - 1); return; }
    if (e.key === "Tab") { /* focus gardé dans la bulle */
      var f = [].slice.call(etat.bulle.querySelectorAll("button:not([disabled])")), a = doc.activeElement, k = f.indexOf(a);
      if (e.shiftKey && (k <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  /* Défilement et redimensionnement : un seul repositionnement par image affichée. */
  var imagePrevue = false;
  function placerBientot() {
    if (imagePrevue) return;
    imagePrevue = true;
    requestAnimationFrame(function () { imagePrevue = false; placer(); });
  }
  function placer() {
    if (!etat) return;
    var etape = ETAPES[etat.i], cible = cibleDe(etape), b = etat.bulle, h = etat.halo;
    var vw = doc.documentElement.clientWidth, vh = window.innerHeight, marge = 12;
    var bw = Math.min(380, vw - 2 * 16);
    b.style.width = bw + "px";
    var bh = b.offsetHeight;
    if (!cible) {
      etat.racine.classList.add("visite--centre");
      h.style.transform = "translate(" + (vw / 2) + "px," + (vh / 2) + "px)"; h.style.width = "0px"; h.style.height = "0px";
      b.style.transform = "translate(" + Math.round((vw - bw) / 2) + "px," + Math.round(Math.max(16, (vh - bh) / 2)) + "px)";
      return;
    }
    etat.racine.classList.remove("visite--centre");
    var r = cible.getBoundingClientRect(), pad = 6;
    var x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    var w = Math.min(vw - 8, r.right + pad) - x, hh = Math.min(vh - 8, r.bottom + pad) - y;
    h.style.transform = "translate(" + x + "px," + y + "px)"; h.style.width = w + "px"; h.style.height = Math.max(0, hh) + "px";
    /* Position de la bulle : à droite de la cible si elle est étroite (barre latérale), sinon dessous ou dessus. */
    var bx, by;
    if (r.right + marge + bw <= vw - 16 && r.width < vw / 3) { bx = r.right + marge; by = Math.min(Math.max(16, r.top + r.height / 2 - bh / 2), vh - bh - 16); }
    else if (r.bottom + marge + bh <= vh - 16) { bx = Math.min(Math.max(16, r.left + r.width / 2 - bw / 2), vw - bw - 16); by = r.bottom + marge; }
    else if (r.top - marge - bh >= 16) { bx = Math.min(Math.max(16, r.left + r.width / 2 - bw / 2), vw - bw - 16); by = r.top - marge - bh; }
    else { bx = Math.round((vw - bw) / 2); by = Math.max(16, vh - bh - 16); }
    b.style.transform = "translate(" + Math.round(bx) + "px," + Math.round(by) + "px)";
  }

  function aller(i) {
    if (!etat) return;
    etat.i = Math.max(0, Math.min(ETAPES.length - 1, i));
    var etape = ETAPES[etat.i], cible = cibleDe(etape);
    $("visite-compteur").textContent = "Étape " + (etat.i + 1) + " sur " + ETAPES.length;
    $("visite-titre").textContent = etape.titre;
    $("visite-texte").textContent = etape.texte;
    $("visite-prec").hidden = etat.i === 0;
    $("visite-suiv").textContent = etat.i === 0 ? "Commencer" : etat.i === ETAPES.length - 1 ? "Terminer" : "Suivant";
    $("visite-passer").hidden = etat.i === ETAPES.length - 1;
    [].forEach.call(etat.bulle.querySelectorAll(".visite__points i"), function (p, k) { p.classList.toggle("actif", k === etat.i); });
    etat.bulle.classList.remove("visite__bulle--entre");
    void etat.bulle.offsetWidth;
    etat.bulle.classList.add("visite__bulle--entre");
    if (cible) {
      var r = cible.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) cible.scrollIntoView({ block: "center", behavior: "auto" });
    }
    placer();
    $("visite-suiv").focus({ preventScroll: true });
  }

  function lancer() {
    if (etat) return;
    var c = construire();
    etat = { i: 0, racine: c.racine, halo: c.halo, bulle: c.bulle, precedent: doc.activeElement };
    var ouvrir = function () {
      doc.body.appendChild(etat.racine);
      /* Feuille de style pas encore à jour (ancienne version en cache) : on n'affiche pas une visite sans mise en forme. */
      if (getComputedStyle(etat.racine).position !== "fixed") { etat.racine.remove(); etat = null; return; }
      doc.body.classList.add("visite-ouverte");
      window.addEventListener("resize", placerBientot);
      window.addEventListener("scroll", placerBientot, true);
      aller(0);
    };
    if (!/^#orbite\b|^#?$/.test(location.hash)) { location.hash = "#orbite"; setTimeout(ouvrir, 350); }
    else ouvrir();
  }

  function terminer(complete) {
    if (!etat) return;
    window.removeEventListener("resize", placerBientot);
    window.removeEventListener("scroll", placerBientot, true);
    etat.racine.remove();
    doc.body.classList.remove("visite-ouverte");
    var prec = etat.precedent;
    etat = null;
    if (prec && prec.focus && doc.contains(prec)) prec.focus({ preventScroll: true });
    marquerVue();
    if (complete) O.toast("Bonne découverte ! Commencez par compléter « Mon profil ».");
  }

  function dejaVue() {
    var u = O.utilisateur && O.utilisateur(), m = (u && u.user_metadata) || {};
    return !!m.orbite_visite;
  }
  function marquerVue() {
    if (dejaVue()) return;
    E.compte.preferences({ orbite_visite: new Date().toISOString() }).then(function (d) {
      var u = d && (d.user || d);
      if (u && u.id) O.definirUtilisateur(u);
    }).catch(function () {});
  }

  /* Premier pas validé : la visite démarre une fois, quand l'orbite s'est animée avec les vrais chiffres. */
  doc.addEventListener("orbite:premier-pas", function () {
    if (dejaVue()) return;
    setTimeout(lancer, 1200);
  });
  doc.addEventListener("click", function (e) {
    if (e.target.closest("#aide-visite, #param-visite")) { e.preventDefault(); lancer(); }
  });

  window.OrbiteVisite = { lancer: lancer, terminer: terminer, etapes: ETAPES.length };
})();
