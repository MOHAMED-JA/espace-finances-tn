/*
 * Orbite — palette de commandes (maquette validée le 12 oct. 2026). Ctrl/⌘ + K, « / » hors d'un champ, ou la loupe de
 * la barre ouvrent une fenêtre : quelques lettres suffisent pour sauter à une vue, une section ou une action, ou pour
 * poser une question à l'Assistant. Recherche sans accents, par morceaux de mots, avec quelques mots de darija.
 * Palette vide : les 3 derniers choix (identifiants seulement, gardés sur l'appareil) et les actions du moment.
 * Aucun chiffre du profil n'apparaît ici. CSP stricte : aucun style en ligne.
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var $ = O.$, dlg = $("dlg-palette");
  if (!dlg) return;
  var champ = $("palette-q"), liste = $("palette-liste");
  var CLE_RECENTS = "orbite_palette_recents";

  /* ---------- Catalogue ---------- */
  function vue(id, hash, titre, sous, mots, teinte) { return { id: id, groupe: "Vues", titre: titre, sous: sous, mots: mots, teinte: teinte, fin: hash, faire: function () { aller(hash); } }; }
  function section(id, hash, titre, sous, mots, teinte) { return { id: id, groupe: "Sections", titre: titre, sous: sous, mots: mots, teinte: teinte, fin: hash, faire: function () { aller(hash); } }; }
  function action(id, titre, sous, mots, faire) { return { id: id, groupe: "Actions", titre: titre, sous: sous, mots: mots, teinte: "action", fin: "Entrée", faire: faire }; }

  /* Même adresse qu'actuellement : on réaffiche la vue (le navigateur ignorerait le changement d'adresse). */
  function aller(hash) { if (location.hash === hash) O.enregistrerModule(O.lireRoute().vue); else location.hash = hash; }
  /* Une action sur une autre vue : on y va, puis on agit une fois la vue affichée. */
  function surVue(nom, fn) {
    var r = O.lireRoute();
    if (r.vue === nom) { fn(); return; }
    var une = function (e) { if (e.detail.vue !== nom) return; doc.removeEventListener("orbite:vue", une); setTimeout(fn, 80); };
    doc.addEventListener("orbite:vue", une);
    location.hash = "#" + nom;
  }
  function cliquer(id) { var b = $(id); if (b && !b.disabled) b.click(); }

  function catalogue() {
    var sombre = doc.documentElement.getAttribute("data-theme") !== "light";
    var expert = O.expert(), retraite = O.profil() && O.profil().activite === "retraite";
    var L = [
      vue("v-orbite", "#orbite", "Mon orbite", "Vue d'ensemble", "orbite accueil tableau de bord", "orbite"),
      vue("v-profil", "#profil", "Mon profil", "Vous, votre salaire, vos crédits", "profil moi compte", "orbite"),
      vue("v-salaire", "#salaire", retraite ? "Ma pension" : "Salaire", retraite ? "Pension nette, impôt" : "Brut ⇄ net, impôt, augmentation", "salaire paie net brut khedma chhar pension", "salaire"),
      vue("v-epargne", "#epargne", "Épargne vie & CEA", "Impôt économisé, capital", "epargne assurance vie cea impot dhariba", "epargne"),
      vue("v-credit", "#credit", "Crédit", "Mensualité, capacité, renégociation", "credit pret banque kridi dyn", "credit"),
      vue("v-progression", "#progression", "Ma progression", "Pouvoir d'achat, objectifs, retraite", "progression carriere objectifs retraite t9a3od", "orbite"),
      vue("v-mois", "#mois", "Mon mois", "Budget par enveloppe, calendrier de l'argent", "mois budget enveloppes depenses calendrier agenda dates paie prelevement masrouf", "orbite"),
      vue("v-vie", "#vie", "Vie & impôts", "Score, Et si…, optimiseur fiscal", "vie impots scenarios et si fiscal", "epargne"),
      vue("v-assistant", "#assistant", "Assistant", "Posez une question sur vos chiffres", "assistant question aide", "orbite"),
      vue("v-simulations", "#simulations", "Mes simulations", "Simulations enregistrées", "simulations enregistrees", "orbite"),
      vue("v-compte", "#compte", "Paramètres", "Thème, photo, préférences, données", "parametres reglages theme compte", "orbite"),
      section("s-retraite", "#progression?onglet=retraite", "Retraite", "Ma progression › Retraite", "retraite cnss cnrps pension t9a3od", "orbite"),
      section("s-objectifs", "#progression?onglet=objectifs", "Objectifs", "Ma progression › Objectifs", "objectifs epargne defis", "orbite"),
      section("s-annee", "#progression?onglet=annee", "Mon année en orbite", "Ma progression › Mon année", "annee bilan", "orbite"),
      section("s-credits", "#profil?section=credits", "Mes crédits en cours", "Mon profil › Crédits", "credits en cours profil kridi", "credit"),
      section("s-historique", "#profil?section=salaire", "Historique du salaire", "Mon profil › Salaire", "historique salaire hausse augmentation", "salaire"),
      section("s-budget", "#profil?section=budget", "Budget et épargne disponible", "Mon profil › Budget", "budget loyer charges epargne", "epargne"),
      section("s-banque", "#profil?section=banque", "Ma banque", "Mon profil › Banque", "banque quotite taux", "credit"),
      section("s-foyer", "#profil?section=foyer", "Mode couple / foyer", "Mon profil › Foyer", "foyer couple conjoint mariage", "orbite"),
      section("s-fiscal", "#vie?onglet=fiscal", "Optimiseur fiscal", "Vie & impôts › Impôt", "optimiseur fiscal impot 31 decembre dhariba", "epargne"),
      section("s-reserve", "#progression?onglet=objectifs&reserve=1", "Ma réserve de sécurité", "Ma progression › Objectifs : 3 mois de dépenses de côté", "reserve securite precaution epargne imprevus urgence mois de depenses coussin", "epargne"),
      section("s-plan", "#vie?onglet=fiscal&plan=1", "Mon plan de versement", "Vie & impôts › Impôt : combien verser, assurance vie ou CEA", "plan versement assurance vie cea pourcentage repartition abordable combien verser prime reserve", "epargne"),
      section("s-etsi", "#vie?onglet=scenarios", "Et si…", "Vie & impôts › Scénarios", "et si scenarios mariage enfant achat", "epargne"),
      section("s-depense", "#mois?onglet=budget", "Noter une dépense", "Mon mois › Budget", "depense noter ajouter courses essence cafe masrouf", "orbite"),
      section("s-bilan", "#progression?bilan=1", "Mon bilan en PDF", "Ma progression › revenus, impôt, crédits, patrimoine et score sur une page", "bilan pdf annuel annee rapport conseiller banque imprimer telecharger", "orbite"),
      section("s-releve", "#mois?onglet=budget&releve=1", "Importer mon relevé bancaire", "Mon mois › Budget : dépenses rangées par enveloppe", "releve bancaire importer csv pdf operations depenses banque extrait compte", "orbite"),
      section("s-calendrier", "#mois?onglet=calendrier", "Calendrier de l'argent", "Mon mois › Calendrier : paie, prélèvements, 31 décembre", "calendrier agenda dates paie prelevement echeance ics", "orbite"),
      section("s-projet", "#credit?espace=projet", "Mon projet immobilier", "Crédit › Projet : frais, crédit, quand acheter", "projet immobilier logement maison appartement achat promoteur frais notaire enregistrement premier logement dar", "credit"),
      section("s-offres", "#credit?espace=offres", "Comparer mes offres", "Crédit › Offres de plusieurs banques", "comparer offres banques comparateur cout total moins cher", "credit"),
      section("s-banques", "#credit?espace=banques", "Comparer les banques", "Crédit › Combien chaque banque me prêterait", "banques comparer quotite brut net capacite emprunt regle banque", "credit"),
      section("s-tmm", "#credit?espace=tmm", "Le TMM et mes crédits", "Crédit › TMM du mois, courbe, effet", "tmm taux marche monetaire bct variable revision", "credit"),
      section("s-regrouper", "#credit?espace=regrouper", "Regrouper mes crédits", "Crédit › Rachat et regroupement", "regrouper rachat regroupement credits restructurer", "credit"),
      section("s-marge", "#orbite?section=marge", "Calendrier de la marge", "Mon orbite › Marge", "marge calendrier fin credit", "credit"),
      /* Sous-rubriques (13 oct. 2026) : chaque partie d'une page longue. */
      section("s-decider", "#vie?onglet=decider", "Rembourser ou épargner ?", "Vie & impôts › Décider : que faire d'une prime ou d'une somme", "decider rembourser epargner placer prime somme anticipe reserve", "epargne"),
      section("s-patrimoine", "#orbite?partie=patrimoine", "Mon patrimoine net", "Mon orbite › Ce que je possède moins ce que je dois", "patrimoine net fortune logement appartement biens dettes", "orbite"),
      section("s-sal-hausse", "#salaire?partie=hausse", "Simuler une augmentation", "Salaire › Augmentation", "augmentation hausse simuler brut net", "salaire"),
      section("s-sal-repartition", "#salaire?partie=repartition", "Où va votre brut", "Salaire › Sur 100 dinars, coût employeur", "repartition cout employeur cnss 100 dinars charges patronales", "salaire"),
      section("s-sal-offres", "#salaire?partie=offres", "Comparer deux offres d'emploi", "Salaire › Deux offres", "comparer offre emploi nouveau poste", "salaire"),
      section("s-sal-detail", "#salaire?partie=detail", "Calcul détaillé de l'impôt", "Salaire › Tranches, courbe, méthode", "detail tranches bareme irpp css courbe methode", "salaire"),
      section("s-sante", "#orbite?partie=sante", "Santé financière", "Mon orbite › Score", "sante score note financiere", "orbite"),
      section("s-conseils", "#orbite?partie=conseils", "Mes conseils", "Mon orbite › Conseils", "conseils recommandations nasi7a", "orbite"),
      section("s-capacite", "#orbite?partie=capacite", "Capacité d'emprunt", "Mon orbite › Combien puis-je emprunter", "capacite emprunt combien emprunter", "credit"),
      section("s-echeancier", "#credit?partie=echeancier", "Échéancier du crédit", "Crédit › Voyage dans le temps, graphiques, tableau", "echeancier tableau amortissement graphique voyage temps", "credit"),
      section("s-outils", "#credit?partie=outils", "Outils avancés du crédit", "Crédit › Remboursement anticipé, renégociation, audit", "outils anticipe renegociation audit avance", "credit"),
      section("s-ep-projection", "#epargne?partie=projection", "Projection de l'épargne", "Épargne › Capital année par année", "projection capital epargne annees", "epargne"),
      section("s-preferences", "#compte?onglet=preferences", "Préférences", "Paramètres › Préférences", "preferences theme page ouverture expert", "orbite"),
      section("s-donnees", "#compte?onglet=donnees", "Mes données", "Paramètres › Données", "donnees export suppression", "orbite"),
      action("a-salaire", retraite ? "Mettre à jour ma pension" : "Mettre à jour mon salaire", "Nouveau montant et mois d'effet", "mettre a jour salaire augmentation hausse nouveau pension", function () { O.mettreAJourSalaire(); }),
      action("a-nego", "Préparer ma négociation", "Brut à demander, paliers, arguments", "negociation negocier augmentation hausse demander offre emploi zyeda", function () { surVue("salaire", function () { O.ouvrirNegociation(); }); }),
      action("a-dossier", "Préparer mon dossier banque", "PDF à remettre au conseiller", "dossier banque pdf pret credit kridi", function () { surVue("credit", function () { O.ouvrirDossier(); }); }),
      action("a-fiche", "Contrôler ma fiche de paie", "Lecture sur l'appareil, sans envoi", "fiche de paie controler verifier bulletin", function () { surVue("salaire", function () { cliquer("fiche-controle"); }); }),
      action("a-visite", "Revoir la visite guidée", "L'essentiel ou les nouveautés", "visite guide aide nouveautes", function () { cliquer("aide-visite"); }),
      Object.assign(action("a-theme", sombre ? "Passer en thème clair" : "Passer en thème sombre", "Le thème « Soleil » est dans les Préférences", "theme clair sombre soleil lune nuit jour", function () { cliquer("bascule-theme"); }), { ico: sombre ? "soleil" : "lune" }),
      action("a-expert", expert ? "Désactiver le mode Expert" : "Activer le mode Expert", "Paie mois par mois, classeur Excel", "mode expert excel csv", function () { O.definirExpert(!O.expert()); O.toast(O.expert() ? "Mode Expert activé." : "Mode Expert désactivé."); }),
      action("a-export", "Exporter mes données", "Fichier JSON de tout votre profil", "exporter donnees json sauvegarde", function () { aller("#compte?onglet=donnees"); surVue("compte", function () { cliquer("exporter"); }); }),
      action("a-deconnexion", "Se déconnecter", "", "deconnexion sortir quitter", function () { cliquer("deconnexion"); })
    ];
    /* Lot 2 : haute lisibilité, annuler / rétablir, partager. */
    var LI = window.OrbiteLisibilite, H = window.OrbiteHistorique;
    if (LI) L.push(action("a-lisible", LI.actif() ? "Revenir à la lisibilité normale" : "Activer la haute lisibilité", "Texte plus grand et plus contrasté, sur tous vos appareils", "lisibilite lisible lire texte grand gros taille contraste vue malvoyant accessibilite police", function () { LI.definir(!LI.actif()); }));
    /* Apparence personnelle : couleur d'accent, densité, taille du texte. */
    var AP = window.OrbiteApparence;
    if (AP) {
      var ap = AP.actuelle(), suite = { "": "grande", grande: "tres-grande", "tres-grande": "" }[ap.taille];
      L.push(action("a-accent", "Changer la couleur d'accent", "Encre, Sidi Bou Saïd, Olivier, Djerba, Bougainvillier", "couleur accent apparence personnaliser theme bleu vert rose terre cuite olivier djerba sidi bou said bougainvillier lawn", function () {
        /* Préférences ouvertes sur le nuancier, la couleur actuelle prête au clavier (← →). */
        var viser = function () { var c = doc.querySelector("#choix-accent input:checked") || doc.querySelector("#choix-accent input"); if (c) { c.closest(".reglage").scrollIntoView({ block: "center" }); c.focus({ preventScroll: true }); } };
        if (O.lireRoute().vue === "compte") { aller("#compte?onglet=preferences"); setTimeout(viser, 120); return; }
        var une = function (e) { if (e.detail.vue !== "compte") return; doc.removeEventListener("orbite:vue", une); setTimeout(viser, 120); };
        doc.addEventListener("orbite:vue", une);
        location.hash = "#compte?onglet=preferences";
      }));
      L.push(action("a-densite", ap.densite ? "Revenir à la densité confortable" : "Passer en densité compacte", ap.densite ? "L'espace habituel d'Orbite" : "Marges et boutons plus serrés, même texte", "densite compacte serre confortable espace marges apparence", function () { AP.definir({ densite: ap.densite ? "" : "compacte" }); }));
      L.push(action("a-taille", suite ? (ap.taille ? "Agrandir encore le texte" : "Agrandir le texte") : "Revenir au texte normal", "Taille du texte : " + AP.NOMS.taille[suite] , "taille texte agrandir grand gros police zoom lire normal apparence", function () { AP.definir({ taille: suite }); }));
    }
    if (H && H.possible(-1)) L.push(action("a-annuler", "Annuler la dernière modification", "Ctrl Z", "annuler retour arriere defaire modification ctrl z", function () { H.annuler(); }));
    if (H && H.possible(1)) L.push(action("a-retablir", "Rétablir la modification", "Ctrl Y", "retablir refaire ctrl y", function () { H.retablir(); }));
    if (window.OrbitePartage && /^(salaire|credit|epargne)$/.test(O.lireRoute().vue)) L.push(action("a-partager", "Partager cette simulation", "Lien, QR code, WhatsApp, e-mail", "partager envoyer lien qr whatsapp email mail", function () { window.OrbitePartage.ouvrir(); }));
    if (window.OrbiteGuidee) [["credit", "un crédit", "credit pret banque kridi"], ["salaire", "mon salaire", "salaire brut net paie khedma"], ["epargne", "mon épargne", "epargne assurance vie cea impot"]].forEach(function (x) {
      L.push(Object.assign(action("a-guidee-" + x[0], "Simulation guidée : " + x[1], "Quelques questions, puis le résultat", "simulation guidee pas a pas etapes questions debutant aide " + x[2], function () { surVue(x[0], function () { window.OrbiteGuidee.ouvrir(x[0]); }); }), { ico: "etapes" }));
    });
    /* Lanceur et simulateurs, ouverts dans Orbite. */
    L.push(action("a-apps", "Mes applications", "Les parties d'Orbite et les simulateurs", "applications apps lanceur outils simulateurs", function () { O.ouvrirApps(); }));
    (O.SIMULATEURS || []).forEach(function (x) {
      L.push({ id: "a-sim-" + x.cle, groupe: "Simulateurs", titre: x.titre, sous: "S'ouvre dans Orbite", mots: x.mots, teinte: x.cle === "vie" ? "epargne" : x.cle === "credit" ? "credit" : x.cle === "salaire" ? "salaire" : "action", ico: x.ico, fin: "Entrée",
        faire: function () { O.ouvrirSimulateur(x.cle); } });
    });
    if (retraite) L = L.filter(function (x) { return x.id !== "a-fiche"; });
    if (!O.negociationPossible || !O.negociationPossible()) L = L.filter(function (x) { return x.id !== "a-nego"; });
    return L;
  }

  /* Actions du moment (dates seulement, aucun chiffre du profil). */
  function moment() {
    var m = new Date(), mois = m.getMonth(), jour = m.getDate(), L = [];
    if (mois >= 9 && (mois > 9 || jour >= 15)) {
      var reste = Math.ceil((new Date(m.getFullYear(), 11, 31) - new Date(m.getFullYear(), mois, jour)) / 864e5);
      L.push({ id: "m-fiscal", groupe: "En ce moment", titre: "Verser avant le 31 décembre", sous: "Optimiseur fiscal : il reste " + reste + (reste > 1 ? " jours" : " jour"), teinte: "action", fin: "#vie?onglet=fiscal", faire: function () { aller("#vie?onglet=fiscal"); } });
    }
    if ((mois === 11 && jour >= 15) || mois === 0) L.push({ id: "m-annee", groupe: "En ce moment", titre: "Mon année en orbite", sous: "Votre bilan de l'année, en cartes", teinte: "orbite", fin: "#progression?onglet=annee", faire: function () { aller("#progression?onglet=annee"); } });
    return L;
  }

  /* ---------- Recherche ---------- */
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " "); }
  function recents() { try { return JSON.parse(localStorage.getItem(CLE_RECENTS) || "[]").slice(0, 3); } catch (e) { return []; } }
  function noterRecent(id) {
    if (!/^[vsa]-/.test(id)) return;
    try { localStorage.setItem(CLE_RECENTS, JSON.stringify([id].concat(recents().filter(function (x) { return x !== id; })).slice(0, 3))); } catch (e) {}
  }
  function chercher(q) {
    var cat = catalogue(), nq = norm(q).trim();
    if (!nq) {
      var r = [];
      recents().forEach(function (id) { var e = cat.filter(function (x) { return x.id === id; })[0]; if (e) r.push(Object.assign({}, e, { groupe: "Récents" })); });
      return r.concat(moment());
    }
    var mots = nq.split(/\s+/);
    var trouves = cat.map(function (e) {
      var base = norm(e.titre + " " + e.sous + " " + e.mots), t = norm(e.titre);
      if (!mots.every(function (m) { return base.indexOf(m) !== -1; })) return null;
      return { e: e, score: t.indexOf(mots[0]) === 0 ? 0 : t.indexOf(mots[0]) >= 0 ? 1 : 2 };
    }).filter(Boolean);
    /* Un groupe par titre : le groupe qui a le meilleur résultat passe devant (à égalité : Vues, Sections, Actions). */
    var ORDRE = { Vues: 0, Sections: 1, Actions: 2, Simulateurs: 3 }, meilleur = {};
    trouves.forEach(function (x) { var g = x.e.groupe; if (meilleur[g] == null || x.score < meilleur[g]) meilleur[g] = x.score; });
    trouves = trouves.sort(function (a, b) {
      var ga = a.e.groupe, gb = b.e.groupe;
      return (meilleur[ga] - meilleur[gb]) || (ORDRE[ga] - ORDRE[gb]) || (a.score - b.score);
    }).map(function (x) { return x.e; });
    var phrase = q.trim().split(/\s+/).length >= 3 || !trouves.length;
    if (phrase && q.trim().length <= 200) {
      var question = q.trim();
      trouves.push({ id: "q", groupe: "Assistant", titre: "Demander à l'Assistant : « " + question + " »", sous: "Réponse calculée sur vos chiffres", teinte: "orbite", fin: "Entrée", brut: true,
        faire: function () { location.hash = "#assistant?q=" + encodeURIComponent(question); } });
    }
    return trouves;
  }

  /* ---------- Rendu ---------- */
  var resultats = [], sel = 0;
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function titreSurligne(b, titre, q) {
    var n = norm(titre), m = norm(q).trim().split(/\s+/)[0] || "", i = m ? n.indexOf(m) : -1;
    if (i < 0) { b.textContent = titre; return; }
    b.appendChild(doc.createTextNode(titre.slice(0, i)));
    b.appendChild(cree("mark", null, titre.slice(i, i + m.length)));
    b.appendChild(doc.createTextNode(titre.slice(i + m.length)));
  }
  function rendre() {
    var q = champ.value;
    resultats = chercher(q);
    sel = Math.min(sel, Math.max(0, resultats.length - 1));
    liste.textContent = "";
    if (!resultats.length) { liste.appendChild(cree("li", "palette__vide", "Rien ne correspond. Essayez un autre mot, ou posez votre question en une phrase.")); champ.removeAttribute("aria-activedescendant"); return; }
    var groupe = "";
    resultats.forEach(function (e, i) {
      if (e.groupe !== groupe) { groupe = e.groupe; var g = cree("li", "palette__groupe", groupe); g.setAttribute("role", "presentation"); liste.appendChild(g); }
      var li = cree("li", "palette__item palette__item--" + e.teinte);
      li.id = "palette-opt-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", i === sel ? "true" : "false"); li.setAttribute("data-id", e.id);
      var ico = cree("span", "palette__ico"), svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"), use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "/orbite/icones.svg#" + (e.ico || ICO[e.id] || ICONES[e.teinte])); svg.setAttribute("aria-hidden", "true"); svg.appendChild(use); ico.appendChild(svg);
      var txt = cree("span", "palette__txt"), b = cree("b");
      if (e.brut) b.textContent = e.titre; else titreSurligne(b, e.titre, q);
      txt.appendChild(b); if (e.sous) txt.appendChild(cree("small", null, e.sous));
      li.appendChild(ico); li.appendChild(txt); li.appendChild(cree("span", "palette__fin", e.fin));
      li.addEventListener("mousemove", function () { if (sel !== i) { sel = i; majSelection(); } });
      li.addEventListener("click", function () { choisir(e); });
      liste.appendChild(li);
    });
    majSelection();
  }
  var ICONES = { orbite: "orbite", salaire: "salaire", epargne: "epargne", credit: "credit", action: "etoile" };
  /* Une icône par entrée : la couleur dit le module, le dessin dit la chose. */
  var ICO = { "v-orbite": "orbite", "v-profil": "profil", "v-salaire": "salaire", "v-epargne": "epargne", "v-credit": "credit", "v-progression": "hausse", "v-mois": "calendrier", "s-depense": "panier", "s-calendrier": "calendrier", "v-vie": "bouclier", "v-assistant": "etoile", "v-simulations": "liste", "v-compte": "compte", "s-retraite": "horloge", "s-objectifs": "cible", "s-annee": "etoile", "s-credits": "credit", "s-historique": "hausse", "s-budget": "epargne", "s-banque": "credit", "s-foyer": "profil", "s-fiscal": "epargne", "s-plan": "calendrier", "s-reserve": "bouclier", "s-etsi": "comparer", "s-marge": "horloge", "s-projet": "maison", "s-offres": "comparer", "s-regrouper": "liste", "s-tmm": "hausse", "s-preferences": "outils", "s-donnees": "telecharger", "a-salaire": "hausse", "a-nego": "cible", "a-apps": "grille", "a-dossier": "fiche", "a-fiche": "fiche", "a-visite": "boussole", "a-expert": "outils", "a-export": "telecharger", "a-deconnexion": "sortie", "a-lisible": "lisible", "a-accent": "outils", "a-densite": "liste", "a-taille": "lisible", "a-annuler": "annuler", "a-retablir": "retablir", "a-partager": "partager", "m-fiscal": "horloge", "m-annee": "etoile" };
  function majSelection() {
    liste.querySelectorAll("[role=option]").forEach(function (li, i) { li.setAttribute("aria-selected", i === sel ? "true" : "false"); });
    var s = liste.querySelector('[aria-selected="true"]');
    if (s) { champ.setAttribute("aria-activedescendant", s.id); s.scrollIntoView({ block: "nearest" }); }
  }
  function choisir(e) {
    fermer();
    noterRecent(e.id);
    try { e.faire(); } catch (er) { if (window.console) console.warn(er); }
  }

  /* ---------- Ouverture / fermeture ---------- */
  function ouvrir(texte) {
    if (dlg.open) return;
    champ.value = texte || ""; sel = 0;
    dlg.showModal();
    rendre();
    champ.focus();
  }
  function fermer() { if (dlg.open) dlg.close(); }
  function champActif(t) { return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }

  doc.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "k" || ev.key === "K")) { ev.preventDefault(); dlg.open ? fermer() : ouvrir(""); return; }
    if (dlg.open) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); sel = Math.min(resultats.length - 1, sel + 1); majSelection(); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sel = Math.max(0, sel - 1); majSelection(); }
      else if (ev.key === "Enter") { ev.preventDefault(); if (resultats[sel]) choisir(resultats[sel]); }
      return;
    }
    /* « / » hors d'un champ et hors d'une autre fenêtre : ouverture rapide, sans écrire le « / ». */
    if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !champActif(ev.target) && !doc.querySelector("dialog[open]") && !O.profilVierge()) { ev.preventDefault(); ouvrir(""); }
  });
  champ.addEventListener("input", function () { sel = 0; rendre(); });
  dlg.addEventListener("click", function (ev) { if (ev.target === dlg) fermer(); });
  $("palette-ouvrir").addEventListener("click", function () { ouvrir(""); });

  O.ouvrirPalette = ouvrir;
})();
