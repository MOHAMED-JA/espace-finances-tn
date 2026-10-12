/*
 * Orbite — budget du mois (point 5, choix validé le 12 oct. 2026 : totaux par enveloppe ; l'import d'un relevé viendra plus tard).
 * Enveloppes proposées à partir du profil (crédits, logement et charges, épargne), le reste réparti en courses, transport,
 * santé, loisirs et divers. Une dépense se note en une phrase : « 45 dinars d'essence » va dans Transport.
 * Fonctions pures. Node : require('.../budget-calcul.js') — navigateur : window.BudgetCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.BudgetCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ENVELOPPES = [
    { cle: "credits", libelle: "Crédits", icone: "credit" },
    { cle: "logement", libelle: "Logement et charges", icone: "maison" },
    { cle: "courses", libelle: "Courses", icone: "panier" },
    { cle: "transport", libelle: "Transport", icone: "voiture" },
    { cle: "sante", libelle: "Santé", icone: "bouclier" },
    { cle: "loisirs", libelle: "Loisirs et sorties", icone: "etoile" },
    { cle: "epargne", libelle: "Épargne", icone: "epargne" },
    { cle: "divers", libelle: "Divers", icone: "points" }
  ];
  /* Part du reste (après crédits, logement et épargne) proposée pour chaque enveloppe libre. */
  var PARTS = { courses: 0.4, transport: 0.15, sante: 0.08, loisirs: 0.12, divers: 0.25 };
  var MOTS = {
    transport: /essence|carburant|gasoil|taxi|louage|bus|m[ée]tro|train|parking|p[ée]age|uber|bolt|voiture|garage|vidange|بنزين|تاكسي|لواج/,
    courses: /courses?|march[ée]|supermarch[ée]|monoprix|carrefour|aziza|magasin g[ée]n[ée]ral|g[ée]ant|pain|l[ée]gumes|fruits|viande|lait|épicerie|epicerie|خضرة|سوق|حانوت/,
    sante: /pharmacie|m[ée]decin|docteur|dentiste|clinique|analyse|lunettes|m[ée]dicament|دواء|طبيب/,
    loisirs: /caf[ée]|restaurant|resto|cin[ée]ma|sortie|voyage|vacances|sport|salle|abonnement netflix|jeu|cadeau|قهوة|مطعم/,
    logement: /loyer|steg|sonede|[ée]lectricit[ée]|eau|gaz|internet|t[ée]l[ée]phone|ooredoo|orange|tunisie telecom|syndic|كراء|ضوء|ماء/,
    credits: /cr[ée]dit|pr[êe]t|[ée]ch[ée]ance|traite|قرض/,
    epargne: /[ée]pargne|assurance vie|cea|versement|placement|ادخار/
  };

  function arr(v) { return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 1000) / 1000; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function dizaine(v) { return Math.max(0, Math.floor(v / 10 + 1e-9) * 10); }
  function cleMois(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }

  /** Enveloppes proposées : p = profil normalisé (crédits avec moisRestants), net = net mensuel, m = aujourd'hui. */
  function proposition(p, net, m) {
    var x = p || {}, credits = 0, epargne = 0, mt = m || new Date();
    (x.credits || []).forEach(function (c) { if (num(c.mensualite, 0) > 0 && !(c.moisRestants === 0 && c.dureeMois > 0)) credits += num(c.mensualite, 0); });
    (x.contrats || []).forEach(function (c) { if (!(c.anneeDebut > 0) || c.anneeDebut * 12 + (c.moisDebut || 1) - 1 <= mt.getFullYear() * 12 + mt.getMonth()) epargne += num(c.versementMensuel, 0); });
    var logement = num(x.loyer, 0) + num(x.chargesFixes, 0), reste = Math.max(0, num(net, 0) - credits - logement - epargne);
    /* Enveloppes libres arrondies à la dizaine inférieure ; « Divers » reçoit le reste exact (au dinar inférieur) :
       la proposition ne dépasse jamais le revenu. */
    var libres = 0;
    ENVELOPPES.forEach(function (e) { if (PARTS[e.cle] && e.cle !== "divers") libres += dizaine(reste * PARTS[e.cle]); });
    return ENVELOPPES.map(function (e) {
      var prevu = e.cle === "credits" ? arr(credits) : e.cle === "logement" ? arr(logement) : e.cle === "epargne" ? arr(epargne)
        : e.cle === "divers" ? Math.max(0, Math.floor(reste - libres)) : dizaine(reste * (PARTS[e.cle] || 0));
      return { cle: e.cle, libelle: e.libelle, prevu: prevu };
    });
  }

  /** Normalise le budget gardé dans le profil : plan des enveloppes et dépenses des 12 derniers mois. */
  function normaliser(b) {
    var x = b && typeof b === "object" ? b : {}, cles = ENVELOPPES.map(function (e) { return e.cle; });
    var env = Array.isArray(x.enveloppes) ? x.enveloppes.filter(function (e) { return e && cles.indexOf(e.cle) !== -1; }).map(function (e) {
      return { cle: e.cle, libelle: String(e.libelle || "").slice(0, 40) || ENVELOPPES[cles.indexOf(e.cle)].libelle, prevu: Math.min(1e6, Math.max(0, num(e.prevu, 0))) };
    }) : [];
    var mois = {}, liste = x.mois && typeof x.mois === "object" ? Object.keys(x.mois).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort().slice(-12) : [];
    liste.forEach(function (k) {
      var d = {}; Object.keys(x.mois[k] || {}).forEach(function (c) { if (cles.indexOf(c) !== -1) { var v = Math.min(1e6, Math.max(0, num(x.mois[k][c], 0))); if (v > 0) d[c] = arr(v); } });
      mois[k] = d;
    });
    return { enveloppes: env, mois: mois };
  }

  /** Jours à tenir jusqu'à la prochaine paie (jourPaie 0 = dernier jour du mois) : aujourd'hui compris, le jour de paie non (au moins 1). */
  function joursAvantPaie(m, jourPaie) {
    var mt = m || new Date(), j = Math.round(num(jourPaie, 0));
    function paieDe(a, mo) { var dernier = new Date(a, mo + 1, 0).getDate(); return new Date(a, mo, j >= 1 ? Math.min(j, dernier) : dernier); }
    var aujourdhui = new Date(mt.getFullYear(), mt.getMonth(), mt.getDate()), p = paieDe(mt.getFullYear(), mt.getMonth());
    if (p < aujourdhui) p = paieDe(mt.getFullYear(), mt.getMonth() + 1);
    return Math.max(1, Math.round((p - aujourdhui) / 864e5));
  }

  /** État du mois : o = { net, enveloppes, depenses: { cle: montant }, maintenant, jourPaie } */
  function etat(o) {
    var x = o || {}, dep = x.depenses || {}, net = num(x.net, 0);
    var lignes = (x.enveloppes || []).map(function (e) {
      var d = arr(num(dep[e.cle], 0)), p = num(e.prevu, 0);
      return { cle: e.cle, libelle: e.libelle, prevu: p, depense: d, reste: arr(p - d), depasse: d > p + 0.0005 ? arr(d - p) : 0, part: p > 0 ? Math.min(1.5, d / p) : (d > 0 ? 1.5 : 0) };
    });
    var totalPrevu = arr(lignes.reduce(function (s, l) { return s + l.prevu; }, 0)), totalDepense = arr(lignes.reduce(function (s, l) { return s + l.depense; }, 0));
    var resteAVivre = arr(net - totalDepense), jours = joursAvantPaie(x.maintenant, x.jourPaie);
    var depassements = lignes.filter(function (l) { return l.depasse > 0; });
    return { lignes: lignes, net: net, totalPrevu: totalPrevu, totalDepense: totalDepense, resteAVivre: resteAVivre, jours: jours,
      parJour: arr(Math.max(0, resteAVivre) / jours), depassements: depassements, totalDepassement: arr(depassements.reduce(function (s, l) { return s + l.depasse; }, 0)),
      planDepasseNet: totalPrevu > net + 0.0005 };
  }

  /** « 45 dinars d'essence », « café 3,5 », « ٢٠ دينار خضرة » → { montant, cle } (cle : null si aucun mot reconnu). */
  function phrase(texte) {
    var s = " " + String(texte || "").toLowerCase().replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); }).replace(/٫/g, ",") + " ";
    var m = /(\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?)\s*(mille|k)?/.exec(s);
    if (!m) return null;
    var v = Number(m[1].replace(/[   ]/g, "").replace(",", "."));
    if (m[2]) v *= 1000;
    if (!(v > 0 && v <= 1e6)) return null;
    var cle = null;
    ["transport", "courses", "sante", "loisirs", "logement", "credits", "epargne"].some(function (k) { if (MOTS[k].test(s)) { cle = k; return true; } return false; });
    return { montant: arr(v), cle: cle };
  }

  return { ENVELOPPES: ENVELOPPES, proposition: proposition, normaliser: normaliser, etat: etat, phrase: phrase, joursAvantPaie: joursAvantPaie, cleMois: cleMois };
});
