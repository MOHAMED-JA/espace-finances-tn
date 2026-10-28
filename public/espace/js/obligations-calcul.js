/*
 * Orbite — obligations de l'année (Mon mois › Obligations, choisi le 28 oct. 2026) : fonctions pures, testées sous Node.
 * Vignette (taxe de circulation) des voitures, assurance auto et factures du logement REPRISES de Patrimoine › Assurances
 * et de Mon mois › Factures (jamais saisies deux fois), rentrée scolaire, Ramadan et Aïd ; somme à mettre de côté par mois.
 * Règles vérifiées (sources dans MEMOIRE.md) :
 *  - vignette des personnes physiques : avant le 5 mars (immatriculation paire), avant le 5 avril (impaire) ; paiement en
 *    ligne, sans autocollant depuis 2026 ; barème particulier par puissance fiscale et carburant (sites concordants, texte
 *    officiel non lu : montant modifiable) ; voiture 100 % électrique : moitié du tarif essence ; hybride : carburant du
 *    moteur thermique ;
 *  - Ramadan et Aïd : calendrier hégirien (umm al-qura) du navigateur, à un jour près (observation de la lune).
 * Node : require('.../obligations-calcul.js') — navigateur : window.ObligationsCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.ObligationsCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  /* Barème 2026 des voitures particulières (DT) : [puissance maximale de la tranche, essence, diesel, GPL]. */
  var BAREME = [[4, 65, 215, 390], [7, 130, 280, 455], [8, 180, 330, 505], [9, 180, 405, 580], [11, 230, 455, 630],
    [13, 1050, 1275, 1450], [15, 1400, 1625, 1800], [99, 2100, 2325, 2500]];
  var CARBURANTS = ["essence", "diesel", "gpl", "electrique"];
  var NOMS_CARBURANT = { essence: "Essence", diesel: "Diesel", gpl: "GPL", electrique: "100 % électrique" };
  var EVENEMENTS = ["rentree", "ramadan", "aid-fitr", "aid-adha"];
  var NOMS_EVENEMENT = { rentree: "Rentrée scolaire", ramadan: "Ramadan", "aid-fitr": "Aïd el-Fitr", "aid-adha": "Aïd el-Adha" };
  /* Factures du logement et des communications reprises de Mon mois › Factures (catégories de pilotage-calcul.js). */
  var CATS_FACTURES = ["electricite", "eau", "internet", "syndic"];
  var MAX_VEHICULES = 5;

  function num(v, d) { var n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v); return isFinite(n) ? n : d; }
  function borne(v, a, b, d) { var n = num(v, d); return Math.min(b, Math.max(a, n)); }
  function arr(v) { return Math.round(v * 1000) / 1000; }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function iso(a, m0, j) { return a + "-" + String(m0 + 1).padStart(2, "0") + "-" + String(j).padStart(2, "0"); }
  function isoDe(d) { return iso(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoValide(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00:00").getTime()); }
  function libDate(s) { var j = +s.slice(8, 10); return (j === 1 ? "1er" : j) + " " + MOIS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4); }
  function moisEntre(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
  function joursEntre(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }

  /* ---------- Vignette ---------- */
  function montantVignette(cv, carburant) {
    var c = Math.max(1, Math.round(num(cv, 4))), t = BAREME.filter(function (l) { return c <= l[0]; })[0] || BAREME[BAREME.length - 1];
    if (carburant === "electrique") return t[1] / 2;
    return t[carburant === "diesel" ? 2 : carburant === "gpl" ? 3 : 1];
  }
  /* Échéance de l'année a selon le dernier chiffre de l'immatriculation. */
  function dateVignette(parite, a) { return iso(a, parite === "impair" ? 3 : 2, 5); }

  /* ---------- Fêtes (calendrier hégirien du navigateur) ---------- */
  var cacheHegire = {};
  function fetesHegiriennes(annee) {
    if (cacheHegire[annee] !== undefined) return cacheHegire[annee];
    var r = null;
    try {
      var f = new Intl.DateTimeFormat("fr-FR-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" });
      if (f.resolvedOptions().calendar !== "islamic-umalqura") throw new Error("calendrier absent");
      r = {};
      for (var d = new Date(annee, 0, 1, 12); d.getFullYear() === annee; d.setDate(d.getDate() + 1)) {
        var p = f.formatToParts(d), m = 0, j = 0;
        p.forEach(function (x) { if (x.type === "month") m = +x.value; if (x.type === "day") j = +x.value; });
        var k = isoDe(d);
        if (m === 9 && j === 1 && !r.ramadan) r.ramadan = k;
        if (m === 10 && j === 1 && !r["aid-fitr"]) r["aid-fitr"] = k;
        if (m === 12 && j === 10 && !r["aid-adha"]) r["aid-adha"] = k;
      }
    } catch (e) { r = null; }
    cacheHegire[annee] = r;
    return r;
  }
  /* Prochaine date d'un événement à partir d'aujourd'hui (rentrée : jour et mois choisis, 15 septembre par défaut). */
  function prochaineFete(ev, auj) {
    var a = +auj.slice(0, 4);
    for (var y = a; y <= a + 1; y++) {
      var d = ev.type === "rentree" ? y + "-" + (ev.jourMois || "09-15") : (fetesHegiriennes(y) || {})[ev.type];
      if (d && d >= auj) return d;
    }
    return "";
  }

  /* ---------- Données gardées dans le profil (profil.obligations) ---------- */
  function normaliser(o0) {
    var o = o0 && typeof o0 === "object" ? o0 : {}, vus = {};
    var vehicules = (Array.isArray(o.vehicules) ? o.vehicules : []).slice(0, MAX_VEHICULES).map(function (v, i) {
      v = v || {};
      var id = /^v[a-z0-9]{1,12}$/.test(v.id) && !vus[v.id] ? v.id : "v" + i; while (vus[id]) id += "b";
      vus[id] = true;
      return { id: id, nom: texte(v.nom, 40) || "Ma voiture", cv: Math.round(borne(v.cv, 1, 40, 5)), carburant: CARBURANTS.indexOf(v.carburant) >= 0 ? v.carburant : "essence",
        parite: v.parite === "impair" ? "impair" : "pair", montant: arr(borne(v.montant, 0, 1e5, 0)), payeAnnee: Math.round(borne(v.payeAnnee, 0, 2100, 0)) };
    });
    var parType = {};
    (Array.isArray(o.evenements) ? o.evenements : []).forEach(function (e) { if (e && EVENEMENTS.indexOf(e.type) >= 0) parType[e.type] = e; });
    var evenements = EVENEMENTS.map(function (t) {
      var e = parType[t] || {};
      return { type: t, actif: !!e.actif, budget: arr(borne(e.budget, 0, 1e5, 0)),
        jourMois: t === "rentree" && typeof e.jourMois === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(e.jourMois) ? e.jourMois : t === "rentree" ? "09-15" : undefined };
    });
    return { vehicules: vehicules, evenements: evenements };
  }

  /* Somme à mettre de côté chaque mois jusqu'à l'échéance (le mois de l'échéance compris). */
  function parMois(montant, auj, date) { return montant > 0 && date ? arr(montant / Math.max(1, moisEntre(auj, date) + 1)) : 0; }

  /**
   * Toutes les obligations à venir, dans l'ordre des dates.
   * ctx = { aujourdhui (AAAA-MM-JJ), obligations (profil.obligations), assurances (normalisées), factures (normalisées),
   *         prochaineFacture: fn(facture, auj) → date } (Mon mois › Factures calcule déjà la prochaine date).
   * → { lignes: [{ cle, type, libelle, date, montant, etat, parMois, jours, detail, lien }], parMois, prochaine, factures, fetesInconnues }
   */
  function analyser(ctx) {
    var c = ctx || {}, auj = c.aujourdhui || isoDe(new Date()), o = normaliser(c.obligations), a = +auj.slice(0, 4), l = [];
    o.vehicules.forEach(function (v) {
      var calc = montantVignette(v.cv, v.carburant), montant = v.montant > 0 ? v.montant : calc, ech = dateVignette(v.parite, a);
      var paye = v.payeAnnee >= a, retard = !paye && ech < auj, date = paye ? dateVignette(v.parite, Math.max(a, v.payeAnnee) + 1) : ech;
      l.push({ cle: "vignette-" + v.id, type: "vignette", id: v.id, libelle: "Vignette : " + v.nom, date: date, montant: montant, montantCalcule: calc,
        etat: retard ? "retard" : paye ? "paye" : "avenir", parMois: retard ? 0 : parMois(montant, auj, date),
        detail: (v.parite === "pair" ? "Immatriculation paire : avant le 5 mars" : "Immatriculation impaire : avant le 5 avril") + " · " + v.cv + " CV · " + NOMS_CARBURANT[v.carburant] +
          (retard ? " · Vignette " + a + " non payée : à régler au plus vite en ligne (taxe-circulation.finances.gov.tn)." : paye ? " · Vignette " + Math.max(a, v.payeAnnee) + " payée." : "") });
    });
    (c.assurances || []).filter(function (x) { return x.type === "auto" && x.echeance; }).forEach(function (x) {
      var d = x.echeance, k = 0; while (d < auj && k < 100) { k++; var b = new Date(x.echeance + "T12:00:00"); b.setFullYear(b.getFullYear() + k); d = isoDe(b); }
      l.push({ cle: "assurance-" + x.id, type: "assurance", libelle: "Assurance auto" + (x.nom ? " : " + x.nom : ""), date: d, montant: x.prime > 0 ? x.prime : null, etat: "avenir",
        parMois: x.paie ? 0 : parMois(x.prime, auj, d), detail: (x.assureur ? x.assureur + " · " : "") + (x.paie ? "prélevée avec le salaire" : "échéance annuelle"), lien: "#placements?onglet=assurances" });
    });
    o.evenements.filter(function (e) { return e.actif; }).forEach(function (e) {
      var d = prochaineFete(e, auj);
      if (!d) return;
      l.push({ cle: "fete-" + e.type, type: "fete", sousType: e.type, libelle: NOMS_EVENEMENT[e.type], date: d, montant: e.budget > 0 ? e.budget : null, etat: "avenir",
        parMois: parMois(e.budget, auj, d), detail: e.type === "rentree" ? "Date que vous avez choisie" : "Date estimée, à un jour près (observation de la lune)" });
    });
    l.forEach(function (x) { x.jours = joursEntre(auj, x.date); x.dateLib = libDate(x.date); });
    l.sort(function (x, y) { return (x.etat === "retard" ? 0 : 1) - (y.etat === "retard" ? 0 : 1) || (x.date < y.date ? -1 : x.date > y.date ? 1 : 0); });
    var factures = (c.factures || []).filter(function (f) { return CATS_FACTURES.indexOf(f.cat) >= 0; }).map(function (f) {
      var d = c.prochaineFacture ? c.prochaineFacture(f, auj) : f.prochaine || "";
      return { id: f.id, nom: f.nom, cat: f.cat, montant: f.montant, periode: f.periode, date: d, dateLib: d ? libDate(d) : "" };
    });
    var total = arr(l.reduce(function (s, x) { return s + (x.parMois || 0); }, 0));
    return { lignes: l, parMois: total, prochaine: l.filter(function (x) { return x.etat !== "paye"; })[0] || null, factures: factures,
      fetesInconnues: !fetesHegiriennes(a), categoriesFactures: CATS_FACTURES.slice() };
  }

  /* Événements d'un mois pour le calendrier de l'argent (Mon mois › Calendrier, fil du mois). */
  function evenementsMois(analyse, a, m0) {
    var debut = iso(a, m0, 1), fin = iso(a, m0, new Date(a, m0 + 1, 0).getDate());
    return ((analyse && analyse.lignes) || []).filter(function (x) { return x.date >= debut && x.date <= fin && x.etat !== "paye"; }).map(function (x) {
      return { date: x.date, jour: +x.date.slice(8, 10), type: "obligation", libelle: x.libelle, montant: x.montant, detail: x.detail };
    });
  }

  return { BAREME: BAREME, CARBURANTS: CARBURANTS, NOMS_CARBURANT: NOMS_CARBURANT, EVENEMENTS: EVENEMENTS, NOMS_EVENEMENT: NOMS_EVENEMENT, CATS_FACTURES: CATS_FACTURES,
    MAX_VEHICULES: MAX_VEHICULES, montantVignette: montantVignette, dateVignette: dateVignette, fetesHegiriennes: fetesHegiriennes, prochaineFete: prochaineFete,
    normaliser: normaliser, analyser: analyser, evenementsMois: evenementsMois, parMois: parMois };
});
