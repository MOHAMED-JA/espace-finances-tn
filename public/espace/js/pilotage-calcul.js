/*
 * Orbite — pilotage (lot B, maquettes B1 à B4 validées le 16 oct. 2026) :
 *   • factures et abonnements qui reviennent (repérés dans les relevés importés ou ajoutés à la main) ;
 *   • assurances (contrats, échéances, manques évidents) ;
 *   • argent prêté et emprunté entre proches (échéancier, remboursements reçus) ;
 *   • prévision du compte courant jour par jour sur 90 jours (découvert repéré à l'avance, solution proposée).
 * Fonctions pures. Node : require('.../pilotage-calcul.js') — navigateur : window.PilotageCalcul.
 * Rien n'est envoyé à personne : un prénom ou des initiales suffisent pour les proches ; aucun relevé n'est gardé.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.PilotageCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MAX = { factures: 40, historique: 24, assurances: 20, proches: 20, recus: 120 };
  var JOUR = 864e5;
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  var CATS = ["mobile", "internet", "electricite", "eau", "gaz", "sport", "video", "syndic", "ecole", "assurance", "autre"];
  var NOMS_CAT = { mobile: "Forfait mobile", internet: "Internet", electricite: "Électricité et gaz", eau: "Eau", gaz: "Gaz",
    sport: "Salle de sport", video: "Vidéo et musique en ligne", syndic: "Syndic", ecole: "École, crèche", assurance: "Assurance", autre: "Autre" };
  /* Factures payées sur le budget « Logement et charges » (déjà dans le loyer et les charges du profil) ou sur les dépenses de vie. */
  var CATS_LOGEMENT = ["electricite", "eau", "gaz", "syndic"];
  var PERIODES = [1, 2, 3, 6, 12];
  var NOMS_PERIODE = { 1: "chaque mois", 2: "tous les 2 mois", 3: "tous les 3 mois", 6: "tous les 6 mois", 12: "chaque année" };
  var MOTS_CAT = [
    ["electricite", /\bSTEG\b|ELECTRICITE/], ["eau", /SONEDE|\bEAU\b/],
    ["internet", /TOPNET|GLOBALNET|HEXABYTE|ADSL|FIBRE|INTERNET|\bBEE\b/],
    ["mobile", /OOREDOO|ORANGE|TUNISIE ?TELECOM|\bTT\b|MOBILE|RECHARGE/],
    ["video", /NETFLIX|SPOTIFY|SHAHID|YOUTUBE|DEEZER|ANGHAMI|\bOSN\b|DISNEY|APPLE|GOOGLE/],
    ["sport", /\bGYM\b|FITNESS|SPORT|CLUB/], ["syndic", /SYNDIC/], ["ecole", /ECOLE|CRECHE|JARDIN D ENFANT|LYCEE|COLLEGE/],
    ["assurance", /ASSUR|\bSTAR\b|\bGAT\b|COMAR|MAGHREBIA|CARTE|\bAMI\b|LLOYD|ASTREE|BIAT ASS/]
  ];
  /* Lignes qui ne sont jamais des factures : retraits, virements, opérations de carte isolées. */
  var EXCLUS = /RETRAIT|\bDAB\b|\bGAB\b|VIREMENT|\bVIR\b|VERSEMENT|ESPECES|CHEQUE|\bCHQ\b|FRAIS|COMMISSION|AGIOS|INTERET/;

  var TYPES_A = ["auto", "habitation", "sante", "deces", "prevoyance", "autre"];
  var NOMS_A = { auto: "Auto", habitation: "Habitation", sante: "Santé", deces: "Décès-invalidité", prevoyance: "Prévoyance", autre: "Autre", vie: "Assurance vie" };

  /* ---------- Outils ---------- */
  function arr(v) { return Math.round(v * 1000) / 1000; }
  function num(v, def) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : def; }
  function borne(v, min, max, def) { var n = num(v, def); return n < min ? min : n > max ? max : n; }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function choix(v, liste, def) { return liste.indexOf(v) !== -1 ? v : def; }
  function deux(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()); }
  function dateDe(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12); }
  function isoValide(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = dateDe(s); return iso(d) === s && d.getFullYear() >= 1980 && d.getFullYear() <= 2100;
  }
  function ecart(a, b) { return Math.round((dateDe(b) - dateDe(a)) / JOUR); }
  function decaler(s, n) { var d = dateDe(s); d.setDate(d.getDate() + n); return iso(d); }
  /* Même jour n mois plus tard (31 janv. + 1 mois → 28 ou 29 févr.). */
  function plusMois(s, n, jour) {
    var d = dateDe(s), j = jour || d.getDate(), a = d.getFullYear(), m = d.getMonth() + n;
    var dernier = new Date(a, m + 1, 0).getDate();
    return iso(new Date(a, m, Math.min(j, dernier), 12));
  }
  function libDate(s, avecAnnee) { var d = dateDe(s); return (d.getDate() === 1 ? "1er" : d.getDate()) + " " + MOIS[d.getMonth()] + (avecAnnee ? " " + d.getFullYear() : ""); }
  function id(v, prefixe, i) { return texte(v, 12).replace(/[^\w-]/g, "") || prefixe + (i + 1); }
  function idsUniques(liste) {
    var vus = {};
    liste.forEach(function (x, i) { while (vus[x.id]) x.id = x.id.slice(0, 9) + "-" + (i + 1); vus[x.id] = true; });
    return liste;
  }
  function nouvelId(liste, prefixe) { var i = 1, ids = (liste || []).map(function (x) { return x.id; }); while (ids.indexOf(prefixe + i) !== -1) i++; return prefixe + i; }
  function liste(v, f, max) { return Array.isArray(v) ? idsUniques(v.slice(0, max).map(f)) : []; }
  function cinquante(v) { return Math.ceil(v / 50 - 1e-9) * 50; }
  function sansAccents(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function cleTexte(s) { return " " + sansAccents(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim() + " "; }
  function moisJour(jour, a, m0) { var dernier = new Date(a, m0 + 1, 0).getDate(); return iso(new Date(a, m0, jour >= 1 ? Math.min(jour, dernier) : dernier, 12)); }

  /* ===================================================================
     Factures et abonnements
     =================================================================== */
  function normaliserFacture(f, i) {
    f = f || {};
    var hist = Array.isArray(f.historique) ? f.historique.filter(function (h) { return h && isoValide(h.d) && num(h.v, 0) > 0; })
      .map(function (h) { return { d: h.d, v: arr(borne(h.v, 0, 1e5, 0)) }; }) : [];
    hist.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    hist = hist.filter(function (h, k) { return k === 0 || h.d !== hist[k - 1].d; }).slice(-MAX.historique);
    return {
      id: id(f.id, "f", i), nom: texte(f.nom, 40) || NOMS_CAT[choix(f.cat, CATS, "autre")], cat: choix(f.cat, CATS, "autre"),
      montant: arr(borne(f.montant, 0, 1e5, 0)), periode: PERIODES.indexOf(+f.periode) !== -1 ? +f.periode : 1,
      prochaine: isoValide(f.prochaine) ? f.prochaine : "", historique: hist, aRevoir: !!f.aRevoir,
      source: f.source === "releve" ? "releve" : "saisie", cle: texte(f.cle, 30).toUpperCase().replace(/[^A-Z0-9 ]/g, "")
    };
  }
  /* Prochaine échéance à partir d'aujourd'hui (la date gardée est repoussée de période en période). */
  function prochaineDate(f, auj) {
    var d = f.prochaine || (f.historique.length ? plusMois(f.historique[f.historique.length - 1].d, f.periode) : "");
    if (!d) return "";
    var jour = dateDe(d).getDate(), n = 0;
    while (d < auj && n < 400) { n++; d = plusMois(f.prochaine || f.historique[f.historique.length - 1].d, f.periode * n, jour); }
    return d;
  }
  /* Montant moyen par échéance (6 dernières factures connues), puis ramené au mois. */
  function varie(f) { return f.periode > 1 || CATS_LOGEMENT.indexOf(f.cat) !== -1; }
  function moyenne(f) {
    /* Prix fixe (forfait, abonnement) : le dernier montant ; factures qui varient : la moyenne. */
    if (!varie(f)) return f.montant || (f.historique.length ? f.historique[f.historique.length - 1].v : 0);
    var h = f.historique.slice(-6);
    return h.length >= 2 ? h.reduce(function (t, x) { return t + x.v; }, 0) / h.length : (f.montant || (h[0] ? h[0].v : 0));
  }
  function hausseDe(f) {
    var h = f.historique;
    if (h.length < 2) return null;
    var a = h[h.length - 2].v, b = h[h.length - 1].v;
    /* Un abonnement à prix fixe qui augmente (forfait, salle de sport) ; les factures qui varient (STEG, SONEDE) ne sont pas signalées. */
    if (f.periode === 1 && CATS_LOGEMENT.indexOf(f.cat) === -1 && b > a + 0.5) return { de: a, a: b, ecart: arr(b - a), depuis: h[h.length - 1].d };
    return null;
  }
  /**
   * ctx = { aujourdhui, netMensuel, reserve: { manque, parMois } } (réserve de sécurité : ce qui manque et l'effort mensuel actuel).
   */
  function analyserFactures(l, ctx) {
    var c = ctx || {}, auj = c.aujourdhui || iso(new Date());
    var lignes = (l || []).map(function (f) {
      var moy = moyenne(f), mensuel = moy / f.periode, d = prochaineDate(f, auj);
      return Object.assign({}, f, { moyenne: arr(moy), mensuel: arr(mensuel), annuel: arr(mensuel * 12), prochaineEstimee: d,
        jours: d ? ecart(auj, d) : null, hausse: hausseDe(f), varie: varie(f) });
    });
    var totalMois = lignes.reduce(function (t, x) { return t + x.mensuel; }, 0);
    var r = c.reserve || {};
    var revoir = lignes.filter(function (x) { return x.aRevoir; }).map(function (x) {
      var plusTot = null;
      if (r.manque > 0 && r.parMois > 0) {
        var avant = Math.ceil(r.manque / r.parMois), apres = Math.ceil(r.manque / (r.parMois + x.mensuel));
        plusTot = Math.max(0, avant - apres);
      }
      return { id: x.id, nom: x.nom, gainAn: arr(x.mensuel * 12), moisPlusTot: plusTot };
    });
    var prochaines = lignes.filter(function (x) { return x.prochaineEstimee && x.jours <= 45; })
      .sort(function (a, b) { return a.prochaineEstimee < b.prochaineEstimee ? -1 : 1; })
      .map(function (x) { return { id: x.id, nom: x.nom, d: x.prochaineEstimee, jours: x.jours, v: x.moyenne, estime: x.varie }; });
    return { lignes: lignes, totalMois: arr(totalMois), totalAn: arr(totalMois * 12),
      partNet: c.netMensuel > 0 ? totalMois / c.netMensuel : null, hausses: lignes.filter(function (x) { return x.hausse; }),
      revoir: revoir, prochaines: prochaines };
  }

  /* Clé d'un prélèvement : les deux premiers mots utiles du libellé, sans chiffres (« PRLV STEG 123456 » → « STEG »). */
  var VIDES = /^(PRLV|PRELEVEMENT|PRELEV|PAIEMENT|PAIE|ACHAT|CB|CARTE|TPE|FACTURE|FACT|REF|NO|DU|DE|LA|LE|LES|AU|ET|SEPA|INTERNET|WEB|ONLINE|TN|TUNIS|SARL|SA|STE)$/;
  function cleFacture(libelle) {
    var mots = cleTexte(libelle).trim().split(" ").filter(function (m) { return m.length >= 2 && !/\d/.test(m) && !VIDES.test(m); });
    return mots.slice(0, 2).join(" ");
  }
  function categorie(libelle) {
    var t = cleTexte(libelle);
    for (var i = 0; i < MOTS_CAT.length; i++) if (MOTS_CAT[i][1].test(t)) return MOTS_CAT[i][0];
    return "autre";
  }
  function periodeDe(jours) {
    if (jours >= 25 && jours <= 36) return 1;
    if (jours >= 54 && jours <= 70) return 2;
    if (jours >= 82 && jours <= 100) return 3;
    if (jours >= 165 && jours <= 200) return 6;
    if (jours >= 345 && jours <= 385) return 12;
    return 0;
  }
  function mediane(t) { var s = t.slice().sort(function (a, b) { return a - b; }), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
  /**
   * Factures qui reviennent dans les opérations d'un ou plusieurs relevés : ops = [{ date, libelle, montant, sens }].
   * credits = mensualités du profil (jamais prises pour une facture). existantes = factures déjà gardées (repérées par leur clé).
   * → [{ cle, nom, cat, montant, periode, prochaine, historique, existe (id ou null) }]
   */
  function detecterFactures(ops, existantes, credits) {
    var groupes = {}, mens = (credits || []).map(function (c) { return num(c.mensualite, 0); }).filter(function (v) { return v > 0; });
    (ops || []).forEach(function (o) {
      if (!o || o.sens !== "debit" || !isoValide(o.date) || !(o.montant > 0)) return;
      var t = cleTexte(o.libelle);
      if (EXCLUS.test(t) || mens.some(function (v) { return Math.abs(v - o.montant) <= 1; })) return;
      var k = cleFacture(o.libelle);
      if (k.length < 3) return;
      (groupes[k] = groupes[k] || { libelles: [], ops: [] }).ops.push({ d: o.date, v: arr(o.montant) });
      groupes[k].libelles.push(o.libelle);
    });
    var res = [];
    Object.keys(groupes).forEach(function (k) {
      var g = groupes[k], parDate = {};
      g.ops.forEach(function (x) { parDate[x.d] = arr((parDate[x.d] || 0) + x.v); });
      var hist = Object.keys(parDate).sort().map(function (d) { return { d: d, v: parDate[d] }; });
      if (hist.length < 2) return;
      var ecarts = []; for (var i = 1; i < hist.length; i++) ecarts.push(ecart(hist[i - 1].d, hist[i].d));
      var periode = periodeDe(mediane(ecarts));
      /* Médiane brouillée par une ligne en trop (deux paiements rapprochés) : on essaie avec les écarts de plus de 20 jours. */
      var longs = ecarts.filter(function (e) { return e > 20; });
      if (!periode && longs.length) periode = periodeDe(mediane(longs));
      if (!periode) return;
      /* Un paiement à moins de 60 % d'une période du précédent n'est pas une échéance : il est écarté (achat ponctuel, rattrapage). */
      var gardes = [hist[0]];
      for (var j = 1; j < hist.length; j++) if (ecart(gardes[gardes.length - 1].d, hist[j].d) >= periode * 30 * 0.6) gardes.push(hist[j]);
      if (gardes.length < 2) return;
      hist = gardes; ecarts = [];
      for (var q = 1; q < hist.length; q++) ecarts.push(ecart(hist[q - 1].d, hist[q].d));
      periode = periodeDe(mediane(ecarts)) || periode;
      /* Tous les écarts doivent tenir dans la période (une ligne manquante, soit 2 périodes, est tolérée). */
      if (ecarts.some(function (e) { var p = periodeDe(e); return p !== periode && p !== periode * 2 && !(periode === 1 && p === 2); })) return;
      var vals = hist.map(function (h) { return h.v; }), moy = vals.reduce(function (t, v) { return t + v; }, 0) / vals.length;
      var cat = categorie(g.libelles.join(" "));
      var et = Math.sqrt(vals.reduce(function (t, v) { return t + (v - moy) * (v - moy); }, 0) / vals.length);
      /* Montants trop différents : achats répétés chez le même commerçant, pas une facture (sauf eau, électricité, gaz). */
      if (CATS_LOGEMENT.indexOf(cat) === -1 && et / moy > 0.25) return;
      var deja = (existantes || []).filter(function (f) { return f.cle === k; })[0];
      var nom = cat !== "autre" ? NOMS_CAT[cat] : k.charAt(0) + k.slice(1).toLowerCase();
      res.push({ cle: k, nom: nom, cat: cat, montant: vals[vals.length - 1], periode: periode,
        prochaine: plusMois(hist[hist.length - 1].d, periode), historique: hist.slice(-MAX.historique), existe: deja ? deja.id : null });
    });
    return res.sort(function (a, b) { return b.montant / b.periode - a.montant / a.periode; });
  }
  /* Ajoute les factures repérées (choisies par l'utilisateur) : historique fusionné pour celles qui existaient. */
  function fusionner(factures, trouvees) {
    var l = (factures || []).map(function (f) { return JSON.parse(JSON.stringify(f)); });
    (trouvees || []).forEach(function (t) {
      var f = t.existe ? l.filter(function (x) { return x.id === t.existe; })[0] : null;
      if (f) {
        var vus = {}; f.historique.concat(t.historique).forEach(function (h) { vus[h.d] = h.v; });
        f.historique = Object.keys(vus).sort().map(function (d) { return { d: d, v: vus[d] }; }).slice(-MAX.historique);
        f.montant = f.historique[f.historique.length - 1].v; f.prochaine = t.prochaine > (f.prochaine || "") ? t.prochaine : f.prochaine;
      } else if (l.length < MAX.factures) {
        l.push({ id: nouvelId(l, "f"), nom: t.nom, cat: t.cat, montant: t.montant, periode: t.periode, prochaine: t.prochaine,
          historique: t.historique, aRevoir: false, source: "releve", cle: t.cle });
      }
    });
    return l.map(normaliserFacture);
  }

  /* ===================================================================
     Assurances
     =================================================================== */
  function normaliserAssurance(a, i) {
    a = a || {};
    return {
      id: id(a.id, "a", i), type: choix(a.type, TYPES_A, "autre"), nom: texte(a.nom, 40), assureur: texte(a.assureur, 30),
      prime: arr(borne(a.prime, 0, 1e6, 0)), echeance: isoValide(a.echeance) ? a.echeance : "",
      bien: texte(a.bien, 12), credit: texte(a.credit, 60), couverture: Math.round(borne(a.couverture, 0, 100, 100)), paie: !!a.paie
    };
  }
  /* Prochaine échéance annuelle à partir d'aujourd'hui. */
  function anniversaire(d, auj) { if (!d) return ""; var n = 0, x = d; while (x < auj && n < 100) { n++; x = plusMois(d, 12 * n); } return x; }
  /**
   * ctx = { aujourdhui, profil (normalisé), biens (Mon patrimoine : [{ id, nom, loyer }]), credits: [{ libelle, type, actif }] }
   * → { lignes, total, prochaine, verifs: [{ ton, cle, titre, texte }], manques }
   */
  function analyserAssurances(l, ctx) {
    var c = ctx || {}, p = c.profil || {}, auj = c.aujourdhui || iso(new Date()), m = dateDe(auj);
    var lignes = (l || []).map(function (a) {
      var d = anniversaire(a.echeance, auj);
      return Object.assign({}, a, { libType: NOMS_A[a.type], prochaine: d, jours: d ? ecart(auj, d) : null, source: "saisie" });
    });
    /* Assurance vie : depuis le module Épargne (rien à ressaisir). */
    (p.contrats || []).forEach(function (k, i) {
      if (k.type !== "av") return;
      var commence = !(k.anneeDebut > 0) || k.anneeDebut * 12 + (k.moisDebut || 1) - 1 <= m.getFullYear() * 12 + m.getMonth();
      if (!commence) return;
      var prime = num(k.versementMensuel, 0) * 12 + num(k.versementsLibresAn, 0);
      lignes.push({ id: "av" + (i + 1), type: "vie", libType: NOMS_A.vie, nom: k.libelle || "Assurance vie", assureur: "", prime: arr(prime),
        echeance: "", prochaine: "", jours: null, source: "epargne" });
    });
    var total = lignes.reduce(function (t, a) { return t + a.prime; }, 0);
    var aVenir = lignes.filter(function (a) { return a.prochaine; }).sort(function (a, b) { return a.prochaine < b.prochaine ? -1 : 1; });
    var verifs = [];
    function vf(ton, cle, titre, txt) { verifs.push({ ton: ton, cle: cle, titre: titre, texte: txt }); }
    var hab = lignes.filter(function (a) { return a.type === "habitation"; });
    (c.biens || []).forEach(function (b) {
      if (hab.some(function (a) { return a.bien === b.id; })) vf("fort", "bien-" + b.id, "« " + b.nom + " » est assuré", "Une multirisque habitation couvre ce bien.");
      else vf("faible", "bien-" + b.id, (b.loyer > 0 ? "L'appartement loué « " : "Le bien « ") + b.nom + " » n'est pas assuré",
        "Un dégât des eaux ou un incendie resterait à votre charge. Demandez des devis de multirisque habitation" + (b.loyer > 0 ? " pour propriétaire." : "."));
    });
    if (p.patrimoine && p.patrimoine.logement > 0 && !hab.some(function (a) { return a.bien === "logement" || !a.bien; }))
      vf("faible", "logement", "Votre logement n'est pas assuré", "Une multirisque habitation couvre l'incendie, le dégât des eaux et votre responsabilité envers les voisins.");
    var deces = lignes.filter(function (a) { return a.type === "deces"; });
    (c.credits || []).filter(function (k) { return k.actif && (k.type === "immo" || k.type === "auto" || k.type === "conso"); }).forEach(function (k) {
      var a = deces.filter(function (x) { return x.credit === k.libelle; })[0];
      if (!a) vf("faible", "credit-" + k.libelle, "« " + k.libelle + " » : assurance du crédit non notée", "Les banques l'exigent presque toujours : notez-la (souvent dans le tableau d'amortissement) pour vérifier qu'elle couvre bien 100 % du reste dû.");
      else if (a.couverture < 100) vf("faible", "credit-" + k.libelle, "« " + k.libelle + " » couvert à " + a.couverture + " %", "En cas de décès ou d'invalidité, " + (100 - a.couverture) + " % du reste dû resterait à rembourser par votre famille.");
      else vf("fort", "credit-" + k.libelle, "« " + k.libelle + " » est couvert à 100 %", "En cas de décès ou d'invalidité, l'assurance rembourse le reste dû.");
    });
    var famille = p.situation === "marie" || num(p.enfants, 0) > 0 || !!p.foyer;
    if (famille && !lignes.some(function (a) { return a.type === "vie" || a.type === "prevoyance" || (a.type === "deces" && !a.credit); }))
      vf("faible", "famille", "Votre famille n'est pas protégée en cas de décès", "Ni assurance vie ni prévoyance notée. Une prévoyance décès verse un capital à vos proches ; l'assurance vie (module Épargne) aussi.");
    if ((c.credits || []).some(function (k) { return k.actif && k.type === "auto"; }) && !lignes.some(function (a) { return a.type === "auto"; }))
      vf("faible", "auto", "Assurance auto non notée", "Votre crédit auto est en cours : l'assurance de la voiture est obligatoire.");
    aVenir.filter(function (a) { return a.jours <= 30; }).forEach(function (a) {
      vf("faible", "echeance-" + a.id, "Échéance le " + libDate(a.prochaine) + " : " + (a.nom || a.libType).toLowerCase(),
        "Le bon moment pour demander d'autres devis : à garanties égales, comparez avant que le contrat se renouvelle.");
    });
    return { lignes: lignes, total: arr(total), prochaine: aVenir[0] ? { id: aVenir[0].id, nom: aVenir[0].nom || aVenir[0].libType, d: aVenir[0].prochaine, jours: aVenir[0].jours } : null,
      verifs: verifs, manques: verifs.filter(function (v) { return v.ton === "faible"; }).length };
  }

  /* ===================================================================
     Argent entre proches
     =================================================================== */
  function normaliserProche(x, i) {
    x = x || {};
    var recus = Array.isArray(x.recus) ? x.recus.filter(function (r) { return r && isoValide(r.d) && num(r.v, 0) > 0; })
      .map(function (r) { return { d: r.d, v: arr(borne(r.v, 0, 1e7, 0)) }; }).slice(-MAX.recus) : [];
    recus.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    return {
      id: id(x.id, "x", i), sens: x.sens === "emprunte" ? "emprunte" : "prete", nom: texte(x.nom, 20) || "Proche",
      montant: arr(borne(x.montant, 0, 1e7, 0)), mensualite: arr(borne(x.mensualite, 0, 1e7, 0)),
      debut: isoValide(x.debut) ? x.debut : "", echeance: isoValide(x.echeance) ? x.echeance : "", note: texte(x.note, 40), recus: recus
    };
  }
  /* Échéancier : mensuel à partir de « debut » (dernière échéance = le reste), ou en une fois à « echeance » (ou sans date). */
  function echeancier(x) {
    var e = [];
    if (x.mensualite > 0 && x.debut) {
      var n = Math.ceil(x.montant / x.mensualite - 1e-9), jour = dateDe(x.debut).getDate();
      for (var k = 0; k < Math.min(n, 240); k++) e.push({ d: plusMois(x.debut, k, jour), v: arr(Math.min(x.mensualite, x.montant - k * x.mensualite)) });
    } else if (x.echeance) e.push({ d: x.echeance, v: x.montant });
    return e;
  }
  function analyserProches(l, ctx) {
    var auj = (ctx && ctx.aujourdhui) || iso(new Date());
    var lignes = (l || []).map(function (x) {
      var rembourse = arr(x.recus.reduce(function (t, r) { return t + r.v; }, 0)), reste = arr(Math.max(0, x.montant - rembourse));
      var ech = echeancier(x), cumul = 0, prochaine = null, attenduAuj = 0;
      ech.forEach(function (e) {
        cumul += e.v;
        if (e.d <= auj) attenduAuj = cumul;
        if (!prochaine && cumul > rembourse + 0.0005) prochaine = { d: e.d, v: arr(Math.min(e.v, cumul - rembourse, reste)) };
      });
      var n = ech.length, payees = x.mensualite > 0 ? Math.min(n, Math.floor(rembourse / x.mensualite + 1e-9)) : null;
      return Object.assign({}, x, { rembourse: rembourse, reste: reste, solde: reste <= 0.0005, nbEcheances: x.mensualite > 0 ? n : null, payees: payees,
        prochaine: reste > 0 ? prochaine : null, jours: prochaine && reste > 0 ? ecart(auj, prochaine.d) : null,
        retard: arr(Math.max(0, Math.min(attenduAuj, x.montant) - rembourse)), echeancier: ech });
    });
    var doit = lignes.filter(function (x) { return x.sens === "prete"; }).reduce(function (t, x) { return t + x.reste; }, 0);
    var devez = lignes.filter(function (x) { return x.sens === "emprunte"; }).reduce(function (t, x) { return t + x.reste; }, 0);
    var prochains = lignes.filter(function (x) { return x.prochaine && x.jours <= 60; }).sort(function (a, b) { return a.prochaine.d < b.prochaine.d ? -1 : 1; })
      .map(function (x) { return { id: x.id, nom: x.nom, sens: x.sens, d: x.prochaine.d, v: x.prochaine.v, jours: x.jours }; });
    return { lignes: lignes, onVousDoit: arr(doit), vousDevez: arr(devez), solde: arr(doit - devez), prochains: prochains };
  }

  /* ===================================================================
     Prévision du compte courant sur 90 jours
     =================================================================== */
  /**
   * ctx = {
   *   aujourdhui, jours (90), solde: { v, d } (comptes courants, dernier solde connu),
   *   paie: { montant, jour (0 = dernier jour) }, credits: [{ libelle, mensualite, jour, restantes }],
   *   epargne: { montant, jour }, logement: { montant, jour } (loyer et charges du profil),
   *   vieMois (dépenses de vie du mois, budget ou estimation), factures (analyserFactures().lignes),
   *   assurances (analyserAssurances().lignes), proches (analyserProches().lignes),
   *   reserve: { disponible, depensesMois } (épargne disponible et dépenses d'un mois, pour « votre réserve reste à … mois »)
   * }
   * Les dépenses de vie sont réparties chaque jour ; les factures de forfaits et d'abonnements en sont retirées (déjà comptées),
   * celles d'eau, d'électricité, de gaz et de syndic sont retirées des charges du logement.
   */
  function prevision(ctx) {
    var c = ctx || {}, auj = c.aujourdhui || iso(new Date()), n = c.jours || 90;
    if (!c.solde || !isoValide(c.solde.d)) return { aucun: true };
    var depart = c.solde.d > auj ? auj : c.solde.d, fin = decaler(auj, n), evts = {};
    function ajouter(d, lib, v, type, cle) { if (d <= depart || d > fin || !v) return; (evts[d] = evts[d] || []).push({ d: d, lib: lib, v: arr(v), type: type, cle: cle || "" }); }
    /* Chaque mois au jour donné ; maxFuturs : nombre d'échéances encore dues après aujourd'hui (crédits). */
    function mensuel(jour, lib, v, type, maxFuturs, cle) {
      var a = dateDe(depart).getFullYear(), m0 = dateDe(depart).getMonth(), futurs = 0;
      for (var k = 0; k <= Math.ceil((n + ecart(depart, auj)) / 28) + 2; k++) {
        var d = moisJour(jour, a, m0 + k);
        if (d > auj) { futurs++; if (maxFuturs != null && futurs > maxFuturs) break; }
        ajouter(d, lib, v, type, cle);
      }
    }
    var paie = c.paie || {};
    if (paie.montant > 0) mensuel(paie.jour || 0, "Salaire", paie.montant, "paie", null, "paie");
    (c.credits || []).forEach(function (k, i) { if (k.mensualite > 0 && k.restantes > 0) mensuel(k.jour || 1, "Mensualité " + (k.libelle || "crédit"), -k.mensualite, "credit", k.restantes, "credit-" + i); });
    if (c.epargne && c.epargne.montant > 0) mensuel(c.epargne.jour || 1, "Versement d'épargne", -c.epargne.montant, "epargne", null, "epargne");
    var factLog = 0, factVie = 0;
    (c.factures || []).forEach(function (f) {
      if (CATS_LOGEMENT.indexOf(f.cat) !== -1) factLog += f.mensuel; else factVie += f.mensuel;
      if (!f.prochaineEstimee) return;
      var jour = dateDe(f.prochaineEstimee).getDate();
      /* Échéances passées depuis le dernier solde, puis à venir. */
      for (var k = -3; k <= Math.ceil(n / 28 / f.periode) + 1; k++) {
        var d = plusMois(f.prochaineEstimee, f.periode * k, jour);
        ajouter(d, f.nom + (f.varie ? " (estimée)" : ""), -f.moyenne, "facture", "facture-" + f.id);
      }
    });
    if (c.logement && c.logement.montant > 0) {
      var log = Math.max(0, c.logement.montant - factLog);
      if (log > 0) mensuel(c.logement.jour || 1, "Loyer et charges", -log, "logement", null, "logement");
    }
    (c.assurances || []).forEach(function (a) {
      if (a.paie || a.source !== "saisie" || !a.prochaine || !(a.prime > 0)) return;
      ajouter(a.prochaine, "Assurance " + (a.nom || a.libType).toLowerCase() + " (annuelle)", -a.prime, "assurance", "assurance-" + a.id);
    });
    (c.proches || []).forEach(function (x) {
      (x.echeancier || []).forEach(function (e) {
        if (e.d <= auj) return;
        ajouter(e.d, (x.sens === "prete" ? "Remboursement attendu de " : "À rendre à ") + x.nom, x.sens === "prete" ? e.v : -e.v, "proche", "proche-" + x.id);
      });
    });
    var vieJour = Math.max(0, num(c.vieMois, 0) - factVie) * 12 / 365;
    var solde = num(c.solde.v, 0), pts = [], tous = [];
    for (var d = decaler(depart, 1); d <= fin; d = decaler(d, 1)) {
      solde -= vieJour;
      (evts[d] || []).forEach(function (e) { solde += e.v; if (d > auj) tous.push(e); });
      if (d >= auj) pts.push({ d: d, v: arr(solde) });
    }
    if (depart === auj) pts.unshift({ d: auj, v: arr(num(c.solde.v, 0)) });
    else if (!pts.length || pts[0].d !== auj) pts.unshift({ d: auj, v: arr(solde) });
    var min = pts.reduce(function (m, x) { return x.v < m.v ? x : m; }, pts[0]);
    /* Premier découvert : du premier jour sous zéro jusqu'au retour au-dessus. */
    var deb = null, finD = null, minD = null;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].v < 0 && deb === null) { deb = pts[i].d; minD = pts[i]; }
      if (deb !== null) { if (pts[i].v < 0) { finD = pts[i].d; if (pts[i].v < minD.v) minD = pts[i]; } else break; }
    }
    var decouvert = null;
    if (deb) {
      /* Cause : la plus grosse sortie inhabituelle (hors salaire, crédit et loyer) des 30 jours précédents. */
      var avant = tous.filter(function (e) { return e.v < 0 && e.d <= deb && ecart(e.d, deb) <= 30 && ["facture", "assurance", "proche"].indexOf(e.type) !== -1; })
        .sort(function (a, b) { return a.v - b.v; });
      var montant = cinquante(-minD.v + 50), veille = decaler(deb, -1) < auj ? auj : decaler(deb, -1);
      var paieSuivante = tous.filter(function (e) { return e.type === "paie" && e.d > deb; })[0];
      var r = c.reserve || {};
      decouvert = { debut: deb, fin: finD, min: minD.v, minLe: minD.d, cause: avant[0] || null,
        veillePaie: !!paieSuivante && ecart(finD, paieSuivante.d) <= 1,
        solution: { montant: montant, le: veille, possible: !(r.disponible >= 0) || r.disponible >= montant,
          reserveApres: r.depensesMois > 0 && r.disponible >= 0 ? Math.round(Math.max(0, r.disponible - montant) / r.depensesMois * 10) / 10 : null } };
    }
    var marquants = tous.filter(function (e) { return e.type !== "paie" && Math.abs(e.v) >= 20; });
    return { aucun: false, depart: { d: depart, v: arr(num(c.solde.v, 0)) }, ancien: ecart(depart, auj), points: pts, min: min, fin: pts[pts.length - 1],
      decouvert: decouvert, evenements: marquants.slice(0, 40), paies: tous.filter(function (e) { return e.type === "paie"; }).map(function (e) { return e.d; }),
      vieJour: arr(vieJour), entrees: arr(tous.filter(function (e) { return e.v > 0; }).reduce(function (t, e) { return t + e.v; }, 0)) };
  }

  /* ---------- Normalisation (profil.factures, profil.assurances, profil.proches) ---------- */
  function normaliser(p) {
    var x = p || {};
    return { factures: liste(x.factures, normaliserFacture, MAX.factures), assurances: liste(x.assurances, normaliserAssurance, MAX.assurances),
      proches: liste(x.proches, normaliserProche, MAX.proches) };
  }

  return {
    MAX: MAX, CATS: CATS, NOMS_CAT: NOMS_CAT, PERIODES: PERIODES, NOMS_PERIODE: NOMS_PERIODE, TYPES_A: TYPES_A, NOMS_A: NOMS_A, CATS_LOGEMENT: CATS_LOGEMENT,
    iso: iso, isoValide: isoValide, libDate: libDate, decaler: decaler, plusMois: plusMois, ecart: ecart, nouvelId: nouvelId,
    normaliser: normaliser, normaliserFacture: normaliserFacture, normaliserAssurance: normaliserAssurance, normaliserProche: normaliserProche,
    analyserFactures: analyserFactures, detecterFactures: detecterFactures, fusionner: fusionner, cleFacture: cleFacture, categorie: categorie,
    analyserAssurances: analyserAssurances, analyserProches: analyserProches, echeancier: echeancier, prevision: prevision
  };
});
