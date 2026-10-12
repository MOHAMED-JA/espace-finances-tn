/*
 * Orbite — lien de partage vers une page publique préremplie (Lot 2, décision du 12 oct. 2026).
 * Le lien ne porte que des montants : jamais le nom, l'adresse e-mail ni le profil. Les valeurs voyagent après le « # » :
 * le navigateur ne les envoie pas au serveur, elles n'apparaissent dans aucun journal.
 * Chaque page publique a ses champs ; ce qu'une page ne sait pas montrer est listé dans « ecarts », pour que la personne
 * qui partage sache exactement ce que verra son correspondant.
 * Fonctions pures. Node : require('.../partage-lien.js') — navigateur : window.PartageLien.
 */
(function (racine, fabrique) {
  "use strict";
  var API = fabrique();
  if (typeof module === "object" && module.exports) module.exports = API;
  else racine.PartageLien = API;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Champs acceptés par page, dans l'ordre du lien. Bornes = celles des pages (pages-publiques.js lit au plus 1 000 000). */
  var MAX = 1e6;
  var PAGES = {
    pret: { chemin: "/simulateur-credit-tunisie", titre: "Simulateur de crédit",
      champs: [["type", "choix", ["immo", "auto", "conso"]], ["montant", "montant"], ["duree", "entier", 1, 25], ["marge", "nombre", 0, 15]] },
    salaire: { chemin: "/salaire-net-tunisie", titre: "Salaire net",
      champs: [["montant", "montant"], ["secteur", "choix", ["prive", "public"]], ["chef", "bool"], ["enfants", "entier", 0, 4]] },
    vie: { chemin: "/simulateur-assurance-vie-tunisie", titre: "Simulateur d'assurance vie",
      champs: [["versement", "nombre", 0, 1e5], ["duree", "entier", 1, 40], ["rendement", "nombre", 0, 15], ["montant", "montant"]] },
    cea: { chemin: "/calcul-cea-tunisie", titre: "Calcul du CEA",
      champs: [["depot", "nombre", 0, MAX], ["montant", "montant"]] }
  };
  /* Durées maximales du simulateur public de crédit (pages-calcul.js, CREDIT_DEF). */
  var DUREE_MAX = { immo: 25, auto: 7, conso: 7 };
  var TYPES_LIB = { immo: "Logement", auto: "Voiture", conso: "Consommation" };

  function arr(v, d) { var f = Math.pow(10, d == null ? 3 : d); return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * f) / f; }
  function fini(v) { return typeof v === "number" && isFinite(v); }
  var NB = " ";
  function nombre(v, d) {
    var p = Math.abs(v).toFixed(d == null ? 3 : d).split("."), e = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    var dec = p[1] ? p[1].replace(/0+$/, "") : "";
    return (v < 0 ? "−" : "") + e + (dec ? "," + dec : "");
  }
  function dt(v) { return nombre(v, 3) + " DT"; }
  function pct(v) { return nombre(v, 3) + " %"; }
  function ans(n) { return n + (n > 1 ? " ans" : " an"); }

  /* Valeur d'un champ → texte du lien ; null si la valeur n'est pas acceptable pour la page. */
  function ecrire(def, v) {
    var genre = def[1];
    if (genre === "choix") return def[2].indexOf(v) !== -1 ? v : null;
    if (genre === "bool") return v ? "1" : "0";
    if (!fini(v)) return null;
    if (genre === "montant") return v > 0 && v <= MAX ? String(arr(v)) : null;
    if (genre === "entier") return v === Math.round(v) && v >= def[2] && v <= def[3] ? String(v) : null;
    return v >= def[2] && v <= def[3] ? String(arr(v)) : null;
  }
  /* Texte du lien → valeur ; undefined si le texte n'est pas acceptable (on ignore, la page garde son exemple). */
  function lireValeur(def, t) {
    var genre = def[1];
    if (genre === "choix") return def[2].indexOf(t) !== -1 ? t : undefined;
    if (genre === "bool") return t === "1" ? true : t === "0" ? false : undefined;
    if (!/^-?\d{1,9}(\.\d{1,3})?$/.test(t)) return undefined;
    var n = Number(t);
    if (genre === "montant") return n > 0 && n <= MAX ? n : undefined;
    if (genre === "entier") return n === Math.round(n) && n >= def[2] && n <= def[3] ? n : undefined;
    return n >= def[2] && n <= def[3] ? n : undefined;
  }

  /** valeurs { champ: valeur } → « montant=150000&duree=20 » (champs inconnus ou invalides ignorés, ordre fixe). */
  function encoder(page, valeurs) {
    var P = PAGES[page], v = valeurs || {};
    if (!P) return "";
    return P.champs.map(function (def) {
      if (!Object.prototype.hasOwnProperty.call(v, def[0]) || v[def[0]] == null) return null;
      var t = ecrire(def, v[def[0]]);
      return t == null ? null : def[0] + "=" + t;
    }).filter(Boolean).join("&");
  }
  /** « #montant=150000&… » → { montant: 150000, … } ; seuls les champs de la page, validés. */
  function decoder(page, hash) {
    var P = PAGES[page], res = {};
    if (!P) return res;
    var brut = String(hash || "").replace(/^[#?]/, "");
    if (brut.length > 400) return res;
    var lus = {};
    brut.split("&").forEach(function (p) {
      var i = p.indexOf("=");
      if (i > 0) { var k = p.slice(0, i), t = p.slice(i + 1); try { t = decodeURIComponent(t); } catch (e) { return; } lus[k] = t; }
    });
    P.champs.forEach(function (def) {
      if (!Object.prototype.hasOwnProperty.call(lus, def[0])) return;
      var v = lireValeur(def, lus[def[0]]);
      if (v !== undefined) res[def[0]] = v;
    });
    return res;
  }
  /** Adresse complète : origine + chemin + « # » + valeurs. */
  function adresse(origine, page, valeurs) {
    var P = PAGES[page], h = encoder(page, valeurs);
    return String(origine || "").replace(/\/+$/, "") + P.chemin + (h ? "#" + h : "");
  }
  /** Entrée de PagesCalcul.affichage pour l'aperçu (mêmes noms que pages-publiques.js). */
  function entreeCalcul(page, v) {
    if (page === "pret") return { type: v.type, montant: v.montant, dureeAns: v.duree, marge: v.marge };
    if (page === "salaire") return { montant: v.montant, secteur: v.secteur, chef: !!v.chef, enfants: v.chef ? v.enfants || 0 : 0 };
    if (page === "vie") return { montant: v.montant, versement: v.versement, dureeAns: v.duree, rendement: v.rendement };
    if (page === "cea") return { montant: v.montant, depot: v.depot };
    return {};
  }

  /* ------------------------------------------------------------------
     Adaptateurs : simulation d'Orbite → page publique, avec la liste honnête de ce qui change.
     ------------------------------------------------------------------ */

  /**
   * Crédit. c = { type, capital, mois, taux (taux appliqué, %), tmm: {tmm, marge} | null, nonRepris: [libellés] }.
   * tmmJour = TMM du simulateur public (OrbiteCalcul.TMM).
   */
  function depuisCredit(c, tmmJour) {
    var ecarts = [], x = c || {};
    var type = DUREE_MAX[x.type] ? x.type : (x.mois > 84 ? "immo" : "conso");
    if (type !== x.type) ecarts.push("Type affiché : " + TYPES_LIB[type].toLowerCase() + " (la page publique n'a pas de crédit « libre »).");
    var montant = fini(x.capital) ? arr(x.capital) : 0;
    if (montant > MAX) { ecarts.push("Montant ramené à " + dt(MAX) + " (plafond de la page publique)."); montant = MAX; }
    var mois = fini(x.mois) ? x.mois : 12, duree = Math.max(1, Math.round(mois / 12));
    if (duree > DUREE_MAX[type]) { duree = DUREE_MAX[type]; ecarts.push("Durée ramenée à " + ans(duree) + " (maximum pour ce type de crédit)."); }
    else if (duree * 12 !== mois) ecarts.push("Durée arrondie à " + ans(duree) + " (" + mois + " mois dans Orbite).");
    var taux = fini(x.taux) ? x.taux : tmmJour, marge = arr(taux - tmmJour);
    if (x.tmm && fini(x.tmm.tmm) && Math.abs(x.tmm.tmm - tmmJour) > 1e-9) ecarts.push("TMM du jour : " + pct(tmmJour) + " (" + pct(x.tmm.tmm) + " dans Orbite).");
    if (x.tmm && fini(x.tmm.marge)) marge = arr(x.tmm.marge);
    if (marge < 0) { ecarts.push("Taux affiché : " + pct(tmmJour) + " (la page publique ne descend pas sous le TMM ; " + pct(taux) + " dans Orbite)."); marge = 0; }
    if (marge > 15) { ecarts.push("Marge ramenée à 15 points (plafond de la page publique)."); marge = 15; }
    (x.nonRepris || []).forEach(function (l) { ecarts.push("Non repris : " + l + "."); });
    return { page: "pret", valeurs: { type: type, montant: montant, duree: duree, marge: marge }, ecarts: ecarts,
      contenu: [TYPES_LIB[type], dt(montant), ans(duree), "TMM + " + pct(marge)] };
  }

  /**
   * Salaire. s = { brut (mensuel), secteur, chef, enfants, nonRepris: [] }. options.famille : la situation de famille
   * n'est jointe que si la personne le choisit (case décochée par défaut).
   */
  function depuisSalaire(s, options) {
    var x = s || {}, o = options || {}, ecarts = [], famille = !!o.famille;
    var montant = fini(x.brut) ? arr(x.brut) : 0;
    if (montant > MAX) { ecarts.push("Brut ramené à " + dt(MAX) + "."); montant = MAX; }
    var enfants = Math.max(0, Math.min(4, Math.round(x.enfants || 0)));
    var v = { montant: montant, secteur: x.secteur === "public" ? "public" : "prive" };
    if (famille) { v.chef = !!x.chef; v.enfants = x.chef ? enfants : 0; if (x.chef && (x.enfants || 0) > 4) ecarts.push("Enfants : 4 au plus (comme les déductions)."); }
    else if (x.chef || x.enfants > 0) ecarts.push("Calculé sans votre situation de famille (célibataire, sans enfant) : cochez la case pour la joindre.");
    (x.nonRepris || []).forEach(function (l) { ecarts.push("Non repris : " + l + "."); });
    var contenu = [dt(montant) + " brut par mois", v.secteur === "public" ? "public (CNRPS)" : "privé (CNSS)"];
    if (famille) contenu.push(v.chef ? "chef de famille" + (v.enfants ? ", " + v.enfants + " enfant" + (v.enfants > 1 ? "s" : "") : "") : "célibataire");
    return { page: "salaire", valeurs: v, ecarts: ecarts, contenu: contenu, sensible: { cle: "famille", libelle: "Joindre ma situation de famille", inclus: famille, utile: !!(x.chef || x.enfants > 0) } };
  }

  /**
   * Épargne. e = { mode: av|cea|ac, versementMensuel (assurance vie), depotAnnuel (CEA), dureeAns, rendementPct, fraisPct,
   * brut (mensuel, du profil, ou null), nonRepris: [] }. options.salaire : le brut n'est joint que si la personne le choisit.
   */
  function depuisEpargne(e, options) {
    var x = e || {}, o = options || {}, ecarts = [], avecBrut = !!o.salaire && fini(x.brut) && x.brut > 0;
    var cea = x.mode === "cea", v, contenu;
    if (cea) {
      var depot = Math.min(MAX, Math.max(0, arr(x.depotAnnuel || 0)));
      v = { depot: depot }; contenu = ["CEA", dt(depot) + " cette année"];
    } else {
      var vers = Math.min(1e5, Math.max(0, arr(x.versementMensuel || 0)));
      var duree = Math.max(1, Math.min(40, Math.round(x.dureeAns || 10)));
      var rend = Math.max(0, Math.min(15, arr((x.rendementPct || 0) - (x.fraisPct || 0))));
      if ((x.fraisPct || 0) > 0) ecarts.push("Rendement net de frais : " + pct(rend) + " (" + pct(x.rendementPct || 0) + " moins " + pct(x.fraisPct) + " de frais).");
      if ((x.rendementPct || 0) - (x.fraisPct || 0) > 15) ecarts.push("Rendement ramené à 15 % (plafond de la page publique).");
      if (x.mode === "ac" && x.depotAnnuel > 0) ecarts.push("Le CEA (" + dt(x.depotAnnuel) + " par an) n'est pas repris : cette page montre l'assurance vie.");
      v = { versement: vers, duree: duree, rendement: rend }; contenu = ["Assurance vie", dt(vers) + " par mois", ans(duree), pct(rend) + " par an"];
    }
    if (avecBrut) { v.montant = Math.min(MAX, arr(x.brut)); contenu.push(dt(v.montant) + " brut par mois"); }
    else ecarts.push("Économie d'impôt calculée sur un salaire type (2 500 DT brut par mois) : cochez la case pour joindre le vôtre.");
    (x.nonRepris || []).forEach(function (l) { ecarts.push("Non repris : " + l + "."); });
    return { page: cea ? "cea" : "vie", valeurs: v, ecarts: ecarts, contenu: contenu,
      sensible: { cle: "salaire", libelle: "Joindre mon salaire brut (pour l'économie d'impôt)", inclus: avecBrut, utile: fini(x.brut) && x.brut > 0 } };
  }

  /** Message prêt à envoyer (WhatsApp, e-mail) : une phrase, le lien, et rien de personnel. */
  function message(page, url) {
    var P = PAGES[page];
    return { sujet: "Une simulation pour vous : " + P.titre.toLowerCase(), texte: "Voici une simulation faite avec Orbite (" + P.titre.toLowerCase() + ") : " + url };
  }

  return { PAGES: PAGES, DUREE_MAX: DUREE_MAX, encoder: encoder, decoder: decoder, adresse: adresse, entreeCalcul: entreeCalcul,
    depuisCredit: depuisCredit, depuisSalaire: depuisSalaire, depuisEpargne: depuisEpargne, message: message };
});
