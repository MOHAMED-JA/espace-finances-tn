/*
 * Orbite — « Préparer ma négociation » (module pur, testé sous Node ; maquette validée le 12 oct. 2026).
 * À partir du profil : le brut à demander pour un objectif (+ % net, net ou brut par mois), trois paliers
 * (plancher = pouvoir d'achat retrouvé depuis la dernière hausse, cible, ancre = cible + marge arrondie aux 50 DT),
 * la part de chaque dinar de hausse qui reste en net, des alternatives au même gain net la première année
 * (prime unique, salaire de plus par an, hausse en deux temps), des arguments vérifiables et une phrase prête.
 * Onglet « Offre reçue » : net de l'offre face au salaire actuel et brut à contre-proposer pour +20 % net sur l'année.
 * Montants « par mois » : salaire de base brut d'un mois habituel ; net d'un mois habituel (primes du profil comprises).
 * L'inflation est celle de Ma progression (moyennes annuelles INS), comptée comme elle : prix de l'année de la hausse → aujourd'hui.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./progression-calcul.js"),
      require("../../moteurs/salaire/calcul.js"), require("../../moteurs/salaire/parametres.js"));
  } else racine.Negociateur = fabrique(racine.OrbiteCalcul, racine.Progression, racine.CalculSalaire, racine.PARAMETRES_PAIE);
})(typeof self !== "undefined" ? self : this, function (OC, PR, C, P) {
  "use strict";
  var MOIS = OC.MOIS;
  var MARGE_DEFAUT = 0.05, MARGE_MAX = 0.25, VISE_OFFRE = 0.2;
  var MAX_REUSSITES = 5, MAX_CAR = 140;

  function nombre(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function plafond(v, pas) { return Math.ceil(v / pas - 1e-9) * pas; }
  function grouper(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt0(v) { return grouper(String(Math.round(v))) + " DT"; }
  function pc1(v) { return (Math.round(v * 1000) / 10).toFixed(1).replace(".", ",") + " %"; }
  function texte(v) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CAR) : ""; }
  function date(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function duree(de, a) {
    var n = (a.getFullYear() - de.getFullYear()) * 12 + a.getMonth() - de.getMonth() - (a.getDate() < de.getDate() ? 1 : 0);
    n = Math.max(0, n);
    return { mois: n, ans: Math.floor(n / 12), reste: n % 12 };
  }
  function libDuree(d) {
    var a = d.ans ? d.ans + (d.ans > 1 ? " ans" : " an") : "", m = d.reste ? d.reste + " mois" : "";
    return a && m ? a + " et " + m : a || m || "moins d'un mois";
  }

  /* Entrée du moteur de paie ramenée au mois (salaire de base brut d'un mois habituel). */
  function baseMensuelle(p) {
    var e = Object.assign({}, OC.entreeBrut(p).entree);
    if (e.periode === "annuel") {
      var n = e.nombreSalaires || 12;
      e.montant = e.montant / n;
      ["primesImposables", "primesNonCotisables", "avantagesNature", "indemnitesNonImposables", "autresChargesMontant"].forEach(function (k) { e[k] = nombre(e[k]) / 12; });
      e.periode = "mensuel";
    }
    return e;
  }

  function fabriquer(base) {
    function calc(brut, extra) {
      var e = Object.assign({}, base, extra || {}, { montant: Math.max(0, brut) });
      var av = C.calculerAvecVersements(e, P), a = av.annee.annuel;
      return { brut: e.montant, net: av.versements.netMensuel, netAnnuel: a.netAPayer, brutAnnuel: a.brutTotal, cout: a.coutEmployeur / 12, coutAnnuel: a.coutEmployeur,
        cotisations: a.cotisations, irpp: a.irpp, css: a.css, salaires: av.versements.nombre };
    }
    function brutPourNet(net) { return C.calculerDepuisNet(Object.assign({}, base, { montant: net }), P).brut; }
    return { calc: calc, brutPourNet: brutPourNet };
  }

  /* Dernière hausse connue (historique daté), sinon l'embauche, sinon inconnue. */
  function reperes(p, m) {
    var emb = date(p.dateEmbauche), cle = m.getFullYear() * 12 + m.getMonth(), derniere = null;
    (p.historiqueSalaire || []).forEach(function (h) {
      if (h.annee > 0 && h.mois > 0 && h.annee * 12 + h.mois - 1 <= cle) derniere = new Date(h.annee, h.mois - 1, 1);
    });
    if (derniere && emb && derniere <= emb) derniere = null;
    var depuis = derniere || emb || null;
    return { embauche: emb && emb <= m ? emb : null, depuis: depuis && depuis <= m ? depuis : null, type: derniere ? "hausse" : emb ? "embauche" : null };
  }

  function lireObjectif(o, actuel, outils) {
    var mode = o && (o.mode === "net" || o.mode === "brut") ? o.mode : "pct", v = nombre(o && o.valeur);
    if (mode === "pct") { if (!(v > 0) || v > 100) return { erreur: "Indiquez une hausse entre 1 et 100 %." }; return { mode: mode, valeur: v, brut: outils.brutPourNet(actuel.net * (1 + v / 100)) }; }
    if (mode === "net") { if (!(v > actuel.net) || v > actuel.net * 2) return { erreur: "Indiquez un net mensuel au-dessus de " + dt0(Math.ceil(actuel.net)) + " et au plus le double." }; return { mode: mode, valeur: v, brut: outils.brutPourNet(v) }; }
    if (!(v > actuel.brut) || v > actuel.brut * 2) return { erreur: "Indiquez un brut mensuel au-dessus de " + dt0(Math.ceil(actuel.brut)) + " et au plus le double." };
    return { mode: mode, valeur: v, brut: v };
  }

  /* Prime brute unique (versée dans l'année) qui donne le même net supplémentaire sur l'année. */
  function primeEquivalente(outils, actuel, gainAn, primesBase) {
    if (!(gainAn > 0)) return 0;
    var bas = 0, haut = gainAn * 4 + 1000;
    for (var i = 0; i < 70; i++) {
      var mid = (bas + haut) / 2, r = outils.calc(actuel.brut, { primesImposables: primesBase + mid / 12 });
      if (r.netAnnuel - actuel.netAnnuel < gainAn) bas = mid; else haut = mid;
    }
    return haut;
  }

  function phrase(arg, ancre, reussites) {
    var s = "";
    if (arg.prix > 0.005) {
      if (arg.type === "hausse") s = "Depuis ma dernière augmentation en " + arg.depuisLib + ", les prix ont monté de " + pc1(arg.prix) + ". ";
      else if (arg.type === "embauche") s = "Depuis mon arrivée en " + arg.depuisLib + ", les prix ont monté de " + pc1(arg.prix) + ". ";
      else s = "Sur la dernière année, les prix ont monté de " + pc1(arg.prix) + ". ";
    }
    if (reussites.length) s += "Parmi mes réalisations : " + reussites[0].charAt(0).toLowerCase() + reussites[0].slice(1).replace(/[.;:!?]+$/, "") + ". ";
    return s + "Je souhaite que mon salaire de base soit porté à " + dt0(ancre) + " brut par mois.";
  }

  /* p : profil normalisé. objectif : { mode: "pct" | "net" | "brut", valeur }. options : { marge (fraction), reussites: [textes] }. */
  function preparer(p, objectif, options, maintenant) {
    if (!p || p.activite === "retraite" || !(p.montant > 0)) return null;
    var m = maintenant || new Date(), an = m.getFullYear(), opt = options || {};
    var base = baseMensuelle(p), outils = fabriquer(base), calc = outils.calc;
    var actuel = calc(base.montant);
    var obj = lireObjectif(objectif, actuel, outils);
    var rep = reperes(p, m);
    var reussites = (opt.reussites || []).map(texte).filter(Boolean).slice(0, MAX_REUSSITES);
    var anneeDepuis = rep.depuis ? rep.depuis.getFullYear() : an - 1;
    var indice = PR.indice(anneeDepuis, an), prix = indice - 1;
    var arg = {
      type: rep.type, depuisLib: rep.depuis ? MOIS[rep.depuis.getMonth()] + " " + rep.depuis.getFullYear() : null, anneeDepuis: anneeDepuis,
      prix: prix, pouvoirAchat: 1 / indice - 1, provisoire: !!(PR.PROVISOIRE && PR.PROVISOIRE[an]),
      anciennete: rep.embauche ? duree(rep.embauche, m) : null,
      sansHausse: rep.type === "hausse" ? duree(rep.depuis, m) : null
    };
    if (arg.anciennete) arg.ancienneteLib = libDuree(arg.anciennete);
    if (arg.sansHausse) arg.sansHausseLib = libDuree(arg.sansHausse);
    var res = { actuel: actuel, objectif: obj, arguments: arg, reussites: reussites, erreur: obj.erreur || null };
    if (obj.erreur) return res;

    var cible = calc(obj.brut);
    var marge = Math.min(Math.max(opt.marge == null ? MARGE_DEFAUT : nombre(opt.marge), 0), MARGE_MAX);
    var ancre = calc(marge > 0 ? plafond(cible.brut * (1 + marge), 50) : cible.brut);
    var plancher = calc(Math.max(actuel.brut, plafond(actuel.brut * indice, 10)));
    var dBrutAn = cible.brutAnnuel - actuel.brutAnnuel || 1;
    var gainAn = cible.netAnnuel - actuel.netAnnuel;

    res.marge = marge;
    res.cible = cible; res.ancre = ancre; res.plancher = plancher;
    res.cibleSousPlancher = cible.brut < plancher.brut - 0.5;
    res.hausse = {
      brut: cible.brut - actuel.brut, pct: cible.brut / actuel.brut - 1,
      net: cible.net - actuel.net, netPct: cible.net / actuel.net - 1, netAnnuel: gainAn,
      cout: cible.cout - actuel.cout, coutPct: cible.cout / actuel.cout - 1
    };
    /* Où part chaque dinar de hausse brute (sur l'année). */
    res.garde = {
      net: gainAn / dBrutAn, cnss: (cible.cotisations - actuel.cotisations) / dBrutAn,
      irpp: (cible.irpp - actuel.irpp) / dBrutAn, css: (cible.css - actuel.css) / dBrutAn
    };
    var n = actuel.salaires, plus = n < 16 ? calc(actuel.brut, { nombreSalaires: n + 1 }) : null;
    var moitie = calc(actuel.brut + (cible.brut - actuel.brut) / 2);
    var gainDeux = (moitie.netAnnuel - actuel.netAnnuel) / 2 + gainAn / 2;
    res.alternatives = {
      prime: primeEquivalente(outils, actuel, gainAn, nombre(base.primesImposables)),
      salaireDePlus: plus ? { rang: n + 1, gain: plus.netAnnuel - actuel.netAnnuel, part: gainAn > 0 ? (plus.netAnnuel - actuel.netAnnuel) / gainAn : 0 } : null,
      deuxTemps: { moitie: (cible.brut - actuel.brut) / 2, part: gainAn > 0 ? gainDeux / gainAn : 0 }
    };
    res.phrase = phrase(arg, ancre.brut, reussites);
    return res;
  }

  /* Offre reçue : { brut (mensuel), salaires }. Primes de l'employeur actuel non reprises. */
  function offre(p, o, maintenant) {
    if (!p || p.activite === "retraite" || !(p.montant > 0)) return null;
    var base = baseMensuelle(p), actuel = fabriquer(base).calc(base.montant);
    var b = nombre(o && o.brut), n = Math.round(nombre(o && o.salaires) || 12);
    if (!(b > 0)) return { actuel: actuel, erreur: "Indiquez le brut mensuel proposé." };
    if (n < 12 || n > 16) return { actuel: actuel, erreur: "Indiquez entre 12 et 16 salaires par an." };
    var nue = Object.assign({}, base, { primesImposables: 0, primesNonCotisables: 0, avantagesNature: 0, indemnitesNonImposables: 0, autresChargesPct: 0, autresChargesMontant: 0, nombreSalaires: n });
    var calc = fabriquer(nue).calc, propose = calc(b);
    var vise = actuel.netAnnuel * (1 + VISE_OFFRE), bas = 0, haut = Math.max(b, actuel.brut) * 3;
    for (var i = 0; i < 70; i++) { var mid = (bas + haut) / 2; if (calc(mid).netAnnuel < vise) bas = mid; else haut = mid; }
    var contre = plafond(haut, 50), atteint = contre <= b;
    return {
      actuel: actuel, propose: propose, salaires: n, vise: vise, visePct: VISE_OFFRE,
      ecartMois: propose.net - actuel.net, ecartAnnuel: propose.netAnnuel - actuel.netAnnuel, ecartAnnuelPct: propose.netAnnuel / actuel.netAnnuel - 1,
      atteint: atteint, contre: atteint ? propose : calc(contre), ecartContre: atteint ? 0 : contre - b
    };
  }

  return { preparer: preparer, offre: offre, MARGE_DEFAUT: MARGE_DEFAUT, MARGE_MAX: MARGE_MAX, VISE_OFFRE: VISE_OFFRE, MAX_REUSSITES: MAX_REUSSITES, _dt0: dt0, _pc1: pc1 };
});
