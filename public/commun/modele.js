/*
 * Modèle de l'Espace : règles pures, sans navigateur (testées sous Node).
 * - description des trois outils ;
 * - validation de l'état d'une simulation (chaîne de paramètres d'adresse) ;
 * - construction de l'adresse d'ouverture ;
 * - validation de l'adresse de retour après connexion (anti-redirection ouverte) ;
 * - mise en forme des montants, force du mot de passe, messages d'erreur.
 */
(function (racine) {
  "use strict";

  var OUTILS = {
    salaire: {
      cle: "salaire",
      nom: "Salaire brut ⇄ net",
      court: "Salaire",
      chemin: "/outils/salaire/",
      separateur: "?",
      description: "Brut, net, coût employeur, CNSS ou CNRPS, IRPP et CSS 2026."
    },
    assurance_vie: {
      cle: "assurance_vie",
      nom: "Assurance vie & CEA",
      court: "Assurance vie & CEA",
      chemin: "/outils/assurance-vie/",
      separateur: "#",
      description: "Économie d'impôt (art. 39), projection du capital, rachat, CEA."
    },
    credit: {
      cle: "credit",
      nom: "Crédit bancaire",
      court: "Crédit",
      chemin: "/outils/credit/",
      separateur: "?",
      description: "Mensualité, TMM + marge, TEG, tableau d'amortissement, remboursement anticipé."
    }
  };

  var TAILLE_ETAT_MAX = 4000;
  var MOTIF_ETAT = /^[A-Za-z0-9_.,:%=&+\-]*$/;

  function outilValide(cle) {
    return Object.prototype.hasOwnProperty.call(OUTILS, cle);
  }

  /* L'état est la partie « paramètres » d'un lien de partage, sans « ? » ni « # ». */
  function nettoyerEtat(etat) {
    if (typeof etat !== "string") return null;
    var e = etat.replace(/^[?#]/, "");
    if (e.length > TAILLE_ETAT_MAX || !MOTIF_ETAT.test(e)) return null;
    return e;
  }

  function adresseOuverture(outil, etat, id) {
    if (!outilValide(outil)) return null;
    var o = OUTILS[outil];
    var e = nettoyerEtat(etat || "");
    if (e === null) return null;
    var base = o.chemin;
    var marque = id && /^[0-9a-f-]{36}$/i.test(id) ? "espace=" + id : "";
    if (o.separateur === "#") {
      return base + (marque ? "?" + marque : "") + (e ? "#" + e : "");
    }
    var q = [e, marque].filter(Boolean).join("&");
    return base + (q ? "?" + q : "");
  }

  /* Adresse de retour après connexion : chemin relatif du même site uniquement. */
  function suiteSure(suite) {
    if (typeof suite !== "string" || !suite) return "/espace/";
    if (suite.charAt(0) !== "/" || suite.charAt(1) === "/" || suite.charAt(1) === "\\") return "/espace/";
    if (/[\u0000-\u001f]/.test(suite) || /^\/connexion\.html/.test(suite)) return "/espace/";
    if (suite.length > 2000) return "/espace/";
    return suite;
  }

  function nomValide(nom) {
    if (typeof nom !== "string") return null;
    var n = nom.replace(/\s+/g, " ").trim();
    if (!n || n.length > 120) return null;
    return n;
  }

  /* Résumé affiché sur les cartes : uniquement des nombres et de courts libellés. */
  function resumeValide(r) {
    if (!r || typeof r !== "object") return { principal: null, secondaires: [] };
    function indicateur(x) {
      if (!x || typeof x !== "object") return null;
      var v = Number(x.valeur);
      if (!isFinite(v)) return null;
      return {
        libelle: String(x.libelle || "").slice(0, 60),
        valeur: v,
        unite: String(x.unite || "").slice(0, 12)
      };
    }
    var sec = Array.isArray(r.secondaires) ? r.secondaires.map(indicateur).filter(Boolean).slice(0, 4) : [];
    return { principal: indicateur(r.principal), secondaires: sec, ligne: String(r.ligne || "").slice(0, 140) };
  }

  var fmtCache = {};
  function formater(valeur, decimales) {
    var d = decimales === undefined ? (Math.abs(valeur) >= 1000 ? 0 : 2) : decimales;
    var f = fmtCache[d] || (fmtCache[d] = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
    return f.format(valeur).replace(/ /g, " ");
  }

  function formaterIndicateur(ind) {
    if (!ind) return "";
    var u = ind.unite;
    if (u === "%") return formater(ind.valeur, 2) + " %";
    if (u === "DT" || u === "TND") return formater(ind.valeur, Math.abs(ind.valeur) >= 10000 ? 0 : 3) + " DT";
    if (!u && Number.isInteger(ind.valeur)) return formater(ind.valeur, 0);
    return formater(ind.valeur) + (u ? " " + u : "");
  }

  /* Force du mot de passe : 0 (vide) à 4. Minimum exigé : 10 caractères. */
  function forceMotDePasse(mdp) {
    if (!mdp) return 0;
    if (mdp.length < 10) return 1;
    var points = 1;
    if (mdp.length >= 14) points++;
    if (/[a-z]/.test(mdp) && /[A-Z]/.test(mdp)) points++;
    if (/\d/.test(mdp) && /[^A-Za-z0-9]/.test(mdp)) points++;
    return Math.min(4, points);
  }

  var MESSAGES = [
    [/invalid login credentials/i, "Adresse e-mail ou mot de passe incorrect."],
    [/email not confirmed/i, "Votre adresse n'est pas encore confirmée. Ouvrez le lien reçu par e-mail."],
    [/user already registered|already been registered/i, "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez le mot de passe."],
    [/password should be at least|weak password|password is too weak/i, "Mot de passe trop faible : 10 caractères au moins, avec lettres, chiffres et symbole."],
    [/rate limit|too many requests|429/i, "Trop de tentatives. Patientez quelques minutes avant de réessayer."],
    [/unable to validate email|invalid email|email address .* invalid/i, "Adresse e-mail invalide."],
    [/same password|should be different/i, "Le nouveau mot de passe doit être différent de l'ancien."],
    [/limite de 200/i, "Vous avez atteint la limite de 200 simulations. Supprimez-en quelques-unes."],
    [/jwt|session.*(expired|missing)|not authenticated|non authentifi/i, "Votre session a expiré. Reconnectez-vous."],
    [/failed to fetch|network|load failed/i, "Connexion au serveur impossible. Vérifiez votre accès à Internet."]
  ];
  function messageErreur(err) {
    var texte = err && (err.message || err.error_description || err.msg) ? String(err.message || err.error_description || err.msg) : String(err || "");
    for (var i = 0; i < MESSAGES.length; i++) if (MESSAGES[i][0].test(texte)) return MESSAGES[i][1];
    return "Une erreur est survenue. Réessayez dans un instant.";
  }

  function emailValide(e) {
    return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  }

  var API = {
    OUTILS: OUTILS,
    TAILLE_ETAT_MAX: TAILLE_ETAT_MAX,
    outilValide: outilValide,
    nettoyerEtat: nettoyerEtat,
    adresseOuverture: adresseOuverture,
    suiteSure: suiteSure,
    nomValide: nomValide,
    resumeValide: resumeValide,
    formater: formater,
    formaterIndicateur: formaterIndicateur,
    forceMotDePasse: forceMotDePasse,
    messageErreur: messageErreur,
    emailValide: emailValide
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.EFModele = API;
})(typeof self !== "undefined" ? self : this);
