/*
 * Orbite — visite guidée en trois chapitres (maquette validée le 12 oct. 2026, nouveautés d'octobre ajoutées le même jour, puis celles du Lot 2 et du point 5).
 * Elle s'ouvre toujours sur un choix : « L'essentiel » (8 étapes, proposé aux nouveaux venus), « Les nouveautés »
 * (8 étapes, proposé à ceux qui ont déjà vu l'essentiel ; badge tant que cette version n'a pas été vue) et
 * « Pour aller plus loin » (10 étapes : les nouveautés précédentes).
 * Démarre juste après le « premier pas » (une fois par compte, user_metadata.orbite_visite) ; on la revoit avec le
 * bouton « ? » de la barre ou depuis Paramètres → Préférences. Une étape peut ouvrir une autre page (« vue ») avant de
 * désigner sa rubrique ; à la fin, on revient là où la visite a commencé. Une bulle désigne chaque rubrique ; sans
 * cible visible (téléphone, profil vierge), la bulle est centrée. Clavier : flèches, Entrée, Échap.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document, $ = O.$;
  var VERSION_NOUVEAUTES = "2026-10-12c";

  /* cibles : sélecteurs essayés dans l'ordre ; le premier visible est désigné. vue : page à ouvrir d'abord. */
  var CHAPITRES = {
    essentiel: {
      nom: "L'essentiel", resume: "Votre orbite, le profil et les 3 modules · 1 minute",
      etapes: [
        { vue: "#orbite", titre: "Bienvenue dans Orbite", texte: "Votre salaire est au centre, et tout le reste tourne autour : impôt, épargne, crédit, projets. Voici l'essentiel en une minute." },
        { vue: "#orbite", cibles: [".scene"], titre: "Mon orbite", texte: "Votre tableau de bord. Au centre, votre net du mois ; autour, vos crédits, contrats et projets en satellites. Touchez-en un pour sa fiche, puis voyagez dans le temps : votre marge grandit à la fin de chaque crédit." },
        { vue: "#orbite", cibles: ["#capacite", "#vue-orbite .requiert-naissance"], titre: "Ce que la banque peut vous prêter", texte: "Le montant possible pour un crédit immobilier, auto ou à la consommation, selon la règle de votre banque, et ce que libère chaque crédit qui se termine." },
        { vue: "#orbite", cibles: [".rail a[data-vue='profil']", ".onglets-bas a[data-vue='profil']"], titre: "Mon profil", texte: "Le cœur d'Orbite : famille, salaire, crédits, contrats et budget, enregistrés automatiquement et visibles par vous seul. Le plus rapide pour le remplir : votre fiche de paie, lue sur votre appareil." },
        { vue: "#orbite", cibles: [".rail a[data-vue='salaire']", ".onglets-bas a[data-vue='salaire']"], titre: "Salaire", texte: "Du brut au net au millime près : CNSS ou CNRPS, IRPP et CSS, primes, 13ᵉ mois et plus. Simulez une augmentation et voyez ce que coûte votre salaire à l'employeur." },
        { vue: "#orbite", cibles: [".rail a[data-vue='epargne']", ".onglets-bas a[data-vue='epargne']"], titre: "Épargne vie & CEA", texte: "Projetez votre assurance vie et votre CEA, et voyez l'impôt que chaque versement vous fait économiser." },
        { vue: "#orbite", cibles: [".rail a[data-vue='credit']", ".onglets-bas a[data-vue='credit']"], titre: "Crédit", texte: "Taux fixe ou TMM + marge : mensualité, coût total, tableau d'amortissement, remboursement anticipé, plusieurs offres comparées, et le contrôle du tableau remis par votre banque." },
        { vue: "#orbite", cibles: [".rail a[data-vue='assistant']", "#bulle-assistant"], titre: "Assistant et « ? »", texte: "Posez vos questions en français ou en darija, par exemple « Najjem nechri karhba fi 2029 ? ». Le bouton « ? » relance la visite : essayez ensuite « Les nouveautés ».", fin: true }
      ]
    },
    nouveautes: {
      nom: "Les nouveautés", resume: "Mon mois, projet immobilier, offres, TMM, partager, comparer · 2 minutes",
      etapes: [
        { vue: "#mois?onglet=budget", cibles: ["#mo-ajout"], titre: "Mon mois : le budget", texte: "Des enveloppes proposées à partir de votre profil, le reste à vivre et ce que vous pouvez dépenser par jour jusqu'à la paie. Notez une dépense en une phrase : « 45 dinars d'essence »." },
        { vue: "#mois?onglet=calendrier", cibles: ["#mo-cal-grille"], titre: "Le calendrier de l'argent", texte: "Paie, prélèvements des crédits, versements d'épargne, dernière échéance et 31 décembre sur une seule vue. « Ajouter à mon agenda » les envoie dans le calendrier du téléphone." },
        { vue: "#credit", cibles: ["#credit-espaces"], titre: "Crédit : 4 nouveaux onglets", texte: "Mon projet immobilier (frais d'achat, crédit, quand acheter), Comparer mes offres (classées par coût total), Regrouper mes crédits, et le TMM du mois avec son effet sur vos mensualités." },
        { vue: "#credit", cibles: ["[data-guidee='credit']"], titre: "Simulation guidée", texte: "Quelques questions simples, une à la fois, puis le résultat : dans Crédit, Salaire et Épargne. Le module est rempli pour vous, tout reste modifiable." },
        { vue: "#credit", cibles: ["#partager-sim", "#vue-credit .partager-mobile"], titre: "Partager une simulation", texte: "Un lien, un QR code, WhatsApp ou un e-mail : la personne ouvre la page publique d'Orbite déjà remplie, sans compte. Seuls les montants voyagent, jamais votre nom ni votre profil." },
        { vue: "#simulations", cibles: ["#comparer-mode"], titre: "Comparer vos simulations", texte: "Cochez 2 ou 3 simulations du même module : elles s'affichent côte à côte, et la meilleure mensualité, le coût le plus bas ou l'économie la plus haute sont marqués." },
        { vue: "#credit", cibles: [".barre__histo", "#palette-ouvrir"], titre: "Annuler, rétablir", texte: "Une erreur de saisie ? ↶ ou Ctrl Z revient en arrière, ↷ ou Ctrl Y rétablit, dans Crédit, Salaire et Épargne. Sur téléphone : Ctrl K (la loupe), « Annuler »." },
        { vue: "#compte?onglet=preferences", cibles: ["[aria-labelledby='r-lisible']"], titre: "Haute lisibilité", texte: "Texte plus grand, gris plus foncés, liens soulignés : un réglage retenu sur votre compte, sur tous vos appareils. Le chapitre « Pour aller plus loin » montre les autres fonctions.", fin: true }
      ]
    },
    plus: {
      nom: "Pour aller plus loin", resume: "Fiche de paie, progression, retraite, Ctrl K, négociation… · 3 minutes",
      etapes: [
        { vue: "#profil?section=salaire", cibles: ["#fiche-entree-profil"], titre: "Lire ma fiche de paie", texte: "Photo ou PDF : Orbite lit votre fiche sur votre appareil (rien n'est envoyé), montre chaque montant trouvé, la compare à son propre calcul et met votre profil à jour en un clic." },
        { vue: "#profil?section=salaire", cibles: ["#hs-bloc"], titre: "Historique du salaire", texte: "Chaque hausse avec sa date : l'impôt de l'année se calcule mois par mois, et une hausse annoncée s'applique toute seule à son mois." },
        { vue: "#progression?onglet=carriere", cibles: ["#pg-carriere .pg-bilan", "#pg-tab-carriere"], titre: "Ma progression", texte: "Votre salaire face à l'inflation depuis votre embauche : le pouvoir d'achat gagné ou perdu, et le brut qu'il faudrait pour le garder." },
        { vue: "#progression?onglet=objectifs", cibles: ["#pg-tab-objectifs"], titre: "Objectifs", texte: "Un projet, une épargne de précaution, un crédit à solder plus tôt : Orbite dit si vous êtes en avance ou en retard. « J'ai épargné » en un geste, annulable." },
        { vue: "#progression?onglet=retraite", cibles: ["#pg-tab-retraite"], titre: "Retraite", texte: "Âge de départ et pension nette estimée selon les règles de la CNSS ou de la CNRPS, et l'épargne à prévoir pour garder votre niveau de vie." },
        { vue: "#progression?onglet=carriere", cibles: ["#btn-annee"], titre: "Mon année en orbite", texte: "Votre bilan de l'année en quelques cartes : salaire reçu, impôt, pouvoir d'achat, crédits, épargne. L'image à partager ne montre aucun montant." },
        { vue: "#vie?onglet=scenarios", cibles: ["#vie-tab-scenarios"], titre: "Et si… ?", texte: "Testez une décision avant de la prendre (crédit, hausse, naissance…) : jusqu'à 3 avenirs comparés sur 10 ans, puis appliquez-la à votre profil ou non." },
        { vue: "#vie?onglet=fiscal", cibles: ["#vie-tab-fiscal"], titre: "Vie & impôts", texte: "Le simulateur de vie et l'optimiseur fiscal : combien verser, et avant quelle date, pour payer moins d'impôt cette année." },
        { vue: "#orbite", cibles: ["#palette-ouvrir"], titre: "Ctrl K : tout trouver", texte: "Ctrl K (⌘ K sur Mac), « / » ou la loupe : tapez quelques lettres (« kridi », « retraite », « dossier »…) pour sauter à une page, une section ou une action. Une phrase entière part à l'Assistant." },
        { vue: "#orbite", cibles: ["#apps-ouvrir"], titre: "Mes applications", texte: "Toutes les parties d'Orbite et les simulateurs (crédit, assurance vie, assurance auto, salaire) au même endroit. Un simulateur s'ouvre dans Orbite : « ← Orbite » vous ramène où vous étiez." },
        { vue: "#salaire", cibles: ["#nego-ouvrir"], titre: "Préparer ma négociation", texte: "Dites ce que vous voulez toucher : Orbite trouve le brut à demander, vos trois paliers, des arguments chiffrés et une note PDF. L'onglet « Offre reçue » juge une offre d'emploi." },
        { vue: "#credit", cibles: ["#cr-outil-audit"], titre: "Envoyer un document depuis le téléphone", texte: "Orbite installée apparaît dans « Partager » : envoyez-lui une fiche de paie, le tableau de votre banque ou une offre de crédit. Orbite reconnaît le document et ouvre le bon outil, sans rien envoyer." },
        { vue: "#credit", cibles: ["#dossier-ouvrir"], titre: "Dossier banque", texte: "Un PDF propre à remettre à votre conseiller : revenus, charges, capacité et crédit demandé, préparés à partir de votre profil." },
        { vue: "#compte?onglet=preferences", cibles: ["[aria-labelledby='r-expert']"], titre: "Mode Expert", texte: "La paie mois par mois, Mon orbite mois par mois, et vos tableaux en CSV ou en classeur Excel. À activer ici quand vous voulez tout le détail." },
        { vue: "#compte?onglet=preferences", cibles: ["[aria-labelledby='r-rappels']"], titre: "Rappels", texte: "Fin d'un crédit, réduction de taux, date limite pour l'impôt : Orbite vous prévient sur cet appareil, ou par e-mail (réglage dans Mon profil), sans aucun montant. Et d'autres nouveautés arrivent régulièrement.", fin: true }
      ]
    }
  };

  var etat = null; /* { chap, etapes, i (-1 = écran de choix), racine, halo, bulle, precedent, retour } */

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }
  function cibleDe(etape) {
    var l = (etape && etape.cibles) || [];
    for (var k = 0; k < l.length; k++) { var el = doc.querySelector(l[k]); if (visible(el)) return el; }
    return null;
  }
  function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function meta() { var u = O.utilisateur && O.utilisateur(); return (u && u.user_metadata) || {}; }
  function dejaVue() { return !!meta().orbite_visite; }
  function nouveautesVues() { return meta().orbite_visite_nouveautes === VERSION_NOUVEAUTES; }

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
    /* Écran de choix : deux chapitres. */
    var choix = el("div", "visite__chapitres"); choix.id = "visite-chapitres";
    Object.keys(CHAPITRES).forEach(function (cle) {
      var c = CHAPITRES[cle], b = el("button", "visite__chap visite__chap--" + cle); b.type = "button"; b.id = "visite-chap-" + cle; b.dataset.chap = cle;
      var ico = el("span", "visite__chap-ico", String(c.etapes.length)); ico.setAttribute("aria-hidden", "true");
      var txt = el("span", "visite__chap-txt"), nom = el("b", null, c.nom);
      if (cle === "nouveautes") { var badge = el("span", "visite__badge"); badge.id = "visite-badge"; nom.appendChild(badge); }
      txt.appendChild(nom); txt.appendChild(el("small", null, c.resume));
      b.appendChild(ico); b.appendChild(txt);
      b.addEventListener("click", function () { commencer(cle); });
      choix.appendChild(b);
    });
    bulle.appendChild(choix);
    var points = el("div", "visite__points"); points.id = "visite-points"; points.setAttribute("aria-hidden", "true");
    bulle.appendChild(points);
    var pied = el("div", "visite__pied"); pied.id = "visite-pied";
    var prec = el("button", "bouton bouton--petit bouton--fantome", "Précédent"); prec.type = "button"; prec.id = "visite-prec";
    var suiv = el("button", "bouton bouton--petit bouton--plein", "Suivant"); suiv.type = "button"; suiv.id = "visite-suiv";
    pied.appendChild(prec); pied.appendChild(suiv);
    bulle.appendChild(pied);
    racine.appendChild(halo); racine.appendChild(bulle);
    passer.addEventListener("click", function () { terminer(false); });
    prec.addEventListener("click", function () { if (etat.i <= 0) montrerChoix(); else aller(etat.i - 1); });
    suiv.addEventListener("click", function () { if (etat.i >= etat.etapes.length - 1) terminer(true); else aller(etat.i + 1); });
    /* Un clic hors de la bulle ne ferme pas la visite (évite les fermetures accidentelles) ; Échap la ferme. */
    racine.addEventListener("keydown", clavier);
    return { racine: racine, halo: halo, bulle: bulle };
  }

  function clavier(e) {
    if (e.key === "Escape") { e.preventDefault(); terminer(false); return; }
    if (etat.i >= 0 && e.key === "ArrowRight") { e.preventDefault(); if (etat.i < etat.etapes.length - 1) aller(etat.i + 1); return; }
    if (etat.i >= 0 && e.key === "ArrowLeft") { e.preventDefault(); if (etat.i > 0) aller(etat.i - 1); return; }
    if (etat.i < 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      var bs = [].slice.call(etat.bulle.querySelectorAll(".visite__chap")), k = bs.indexOf(doc.activeElement);
      bs[(k + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus();
      return;
    }
    if (e.key === "Tab") { /* focus gardé dans la bulle */
      var f = [].slice.call(etat.bulle.querySelectorAll("button:not([disabled])")).filter(visible), a = doc.activeElement, j = f.indexOf(a);
      if (e.shiftKey && (j <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && j === f.length - 1) { e.preventDefault(); f[0].focus(); }
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
    var etape = etat.i >= 0 ? etat.etapes[etat.i] : null, cible = cibleDe(etape), b = etat.bulle, h = etat.halo;
    var vw = doc.documentElement.clientWidth, vh = window.innerHeight, marge = 12;
    var bw = Math.min(etat.i < 0 ? 420 : 380, vw - 2 * 16);
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

  function animerEntree() {
    etat.bulle.classList.remove("visite__bulle--entre");
    void etat.bulle.offsetWidth;
    etat.bulle.classList.add("visite__bulle--entre");
  }

  /* Écran de choix : le chapitre conseillé est mis en avant et reçoit le focus. */
  function montrerChoix() {
    etat.i = -1;
    var conseil = !dejaVue() ? "essentiel" : (nouveautesVues() ? "essentiel" : "nouveautes");
    $("visite-compteur").textContent = "Visite guidée";
    $("visite-titre").textContent = "Par quoi voulez-vous commencer ?";
    $("visite-texte").textContent = dejaVue() ? "Revoyez l'essentiel, ou découvrez ce qui est arrivé dans Orbite depuis votre première visite." : "Une minute pour l'essentiel. Les nouveautés se découvrent quand vous voulez, avec le bouton « ? ».";
    $("visite-chapitres").hidden = false;
    $("visite-points").hidden = true;
    $("visite-pied").hidden = true;
    $("visite-passer").hidden = false;
    $("visite-passer").textContent = "Plus tard";
    var badge = $("visite-badge");
    badge.textContent = nouveautesVues() ? "déjà vues" : CHAPITRES.nouveautes.etapes.length + " nouvelles";
    badge.classList.toggle("visite__badge--vu", nouveautesVues());
    [].forEach.call(etat.bulle.querySelectorAll(".visite__chap"), function (b) { b.classList.toggle("visite__chap--conseil", b.dataset.chap === conseil); });
    animerEntree();
    placer();
    $("visite-chap-" + conseil).focus({ preventScroll: true });
  }

  function commencer(cle) {
    etat.chap = cle;
    etat.etapes = CHAPITRES[cle].etapes;
    var points = $("visite-points"); points.textContent = "";
    etat.etapes.forEach(function () { points.appendChild(el("i")); });
    $("visite-chapitres").hidden = true;
    $("visite-points").hidden = false;
    $("visite-pied").hidden = false;
    $("visite-passer").textContent = "Passer";
    aller(0);
  }

  /* Ouvre la page de l'étape si besoin, puis désigne sa rubrique une fois la page affichée. */
  function aller(i) {
    if (!etat) return;
    etat.i = Math.max(0, Math.min(etat.etapes.length - 1, i));
    var n = etat.i, etape = etat.etapes[n], total = etat.etapes.length;
    $("visite-compteur").textContent = CHAPITRES[etat.chap].nom + " · " + (n + 1) + " sur " + total;
    $("visite-titre").textContent = etape.titre;
    $("visite-texte").textContent = etape.texte;
    $("visite-prec").textContent = n === 0 ? "Chapitres" : "Précédent";
    $("visite-suiv").textContent = n === total - 1 ? "Terminer" : "Suivant";
    $("visite-passer").hidden = n === total - 1;
    [].forEach.call(etat.bulle.querySelectorAll(".visite__points i"), function (p, k) { p.classList.toggle("actif", k === n); });
    animerEntree();
    var montrer = function () {
      if (!etat || etat.i !== n) return;
      etat.racine.classList.remove("visite--transit");
      var cible = cibleDe(etape);
      if (cible) {
        var r = cible.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 90) cible.scrollIntoView({ block: "center", behavior: "auto" });
      }
      placer();
    };
    if (etape.vue && location.hash !== etape.vue) {
      etat.racine.classList.add("visite--transit");
      location.hash = etape.vue;
      setTimeout(montrer, 420);
    } else montrer();
    $("visite-suiv").focus({ preventScroll: true });
  }

  function lancer() {
    if (etat) return;
    var c = construire();
    etat = { chap: null, etapes: [], i: -1, racine: c.racine, halo: c.halo, bulle: c.bulle, precedent: doc.activeElement, retour: location.hash || "#orbite" };
    doc.body.appendChild(etat.racine);
    /* Feuille de style pas encore à jour (ancienne version en cache) : on n'affiche pas une visite sans mise en forme. */
    if (getComputedStyle(etat.racine).position !== "fixed") { etat.racine.remove(); etat = null; return; }
    doc.body.classList.add("visite-ouverte");
    window.addEventListener("resize", placerBientot);
    window.addEventListener("scroll", placerBientot, true);
    montrerChoix();
  }

  function terminer(complete) {
    if (!etat) return;
    window.removeEventListener("resize", placerBientot);
    window.removeEventListener("scroll", placerBientot, true);
    etat.racine.remove();
    doc.body.classList.remove("visite-ouverte");
    var prec = etat.precedent, chap = etat.chap, retour = etat.retour, ailleurs = chap && location.hash !== retour;
    etat = null;
    if (ailleurs) location.hash = retour;
    if (prec && prec.focus && doc.contains(prec)) prec.focus({ preventScroll: true });
    marquerVue(chap, complete);
    if (complete) O.toast(chap === "nouveautes" ? "Vous avez fait le tour des nouveautés. D'autres arrivent bientôt !" : chap === "plus" ? "Vous connaissez maintenant tout Orbite." : "Bonne découverte ! Commencez par compléter « Mon profil ».");
  }

  /* L'essentiel est marqué vu à la première fermeture ; les nouveautés, quand leur chapitre est parcouru jusqu'au bout. */
  function marquerVue(chap, complete) {
    var maj = {};
    if (!dejaVue()) maj.orbite_visite = new Date().toISOString();
    if (chap === "nouveautes" && complete && !nouveautesVues()) maj.orbite_visite_nouveautes = VERSION_NOUVEAUTES;
    if (!Object.keys(maj).length) return;
    E.compte.preferences(maj).then(function (d) {
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

  window.OrbiteVisite = { lancer: lancer, terminer: terminer, chapitres: { essentiel: CHAPITRES.essentiel.etapes.length, nouveautes: CHAPITRES.nouveautes.etapes.length } };
})();
