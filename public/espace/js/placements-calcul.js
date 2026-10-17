/*
 * Orbite — Mon patrimoine (placements ; maquette lot A validée le 16 oct. 2026).
 * Bourse (titres cotés, SICAV, FCP), placements à taux connu (dépôts à terme, bons du Trésor, comptes spéciaux
 * d'épargne), immobilier locatif et or. Valeurs, revenus nets d'impôt, échéances, répartition, rendement comparé à
 * l'inflation et points à surveiller. Tout est saisi par l'utilisateur (aucune source gratuite des cours de la BVMT ni
 * du prix de l'or) ; Orbite signale les cours trop anciens.
 * Règles fiscales (personnes physiques résidentes), sources dans MEMOIRE.md :
 *   - intérêts des dépôts et bons : retenue à la source de 20 % ;
 *   - comptes spéciaux d'épargne : intérêts déductibles du revenu imposable jusqu'à 6 000 DT par an
 *     (art. 39-II du Code de l'IRPP, décret-loi n° 2021-21, LF 2022) : la retenue est récupérée à la déclaration ;
 *   - loyers : déduction forfaitaire de 20 % (depuis la LF 2016), puis barème de l'IRPP et CSS (taux marginal) ;
 *   - plus-values sur actions cotées : 10 % au-delà de 10 000 DT de plus-values nettes par an.
 * Gardé dans le profil (profil.placements), donc protégé comme lui (RLS + double authentification).
 * Fonctions pures. Node : require('.../placements-calcul.js') — navigateur : window.PlacementsCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.PlacementsCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MAX = { titres: 30, revenus: 120, taux: 20, biens: 8, or: 12 };
  var JOUR = 864e5;
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var FISC = {
    retenueInterets: 0.20, plafondEpargne: 6000, deductionLoyers: 0.20, tauxPlusValue: 0.10, abattementPlusValue: 10000,
    sources: {
      interets: "Retenue à la source de 20 % sur les intérêts (Code de l'IRPP)",
      epargne: "Art. 39-II du Code de l'IRPP, décret-loi n° 2021-21 (LF 2022) : intérêts des comptes spéciaux d'épargne déductibles jusqu'à 6 000 DT par an",
      loyers: "Revenus fonciers : déduction forfaitaire de 20 % depuis la LF 2016, puis barème de l'IRPP",
      plusValues: "Plus-values sur actions cotées : 10 % au-delà d'un abattement annuel de 10 000 DT"
    }
  };
  var TYPES_TITRE = ["action", "sicav_oblig", "sicav_mixte", "fcp", "autre"];
  var NOMS_TITRE = { action: "Actions", sicav_oblig: "SICAV obligataires", sicav_mixte: "SICAV mixtes", fcp: "FCP", autre: "Autres titres" };
  var TYPES_TAUX = ["dat", "bta", "btct", "cse", "autre"];
  var NOMS_TAUX = { dat: "Dépôt à terme", bta: "Bons du Trésor (BTA)", btct: "Bons du Trésor (BTCT)", cse: "Compte spécial d'épargne", autre: "Placement à taux fixe" };
  var CARATS = [9, 18, 21, 22, 24];
  var CLASSES = [
    { cle: "immo", lib: "Immobilier" }, { cle: "taux", lib: "Taux connu" }, { cle: "or", lib: "Or" },
    { cle: "bourse", lib: "Bourse" }, { cle: "contrats", lib: "Assurance vie et CEA" }, { cle: "liquidites", lib: "Liquidités" }
  ];

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
  function libDate(s) { var d = dateDe(s); return (d.getDate() === 1 ? "1er" : d.getDate()) + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
  function id(v, prefixe, i) { return texte(v, 12).replace(/[^\w-]/g, "") || prefixe + (i + 1); }
  function idsUniques(liste) {
    var vus = {};
    liste.forEach(function (x, i) { while (vus[x.id]) x.id = x.id.slice(0, 9) + "-" + (i + 1); vus[x.id] = true; });
    return liste;
  }
  function liste(v, max, f) { return idsUniques((Array.isArray(v) ? v : []).slice(0, max).map(f)); }
  function nouvelId(liste, prefixe) { var i = 1, ids = (liste || []).map(function (x) { return x.id; }); while (ids.indexOf(prefixe + i) !== -1) i++; return prefixe + i; }

  /* ---------- Normalisation (profil.placements) ---------- */
  function normaliserTitre(t, i) {
    t = t || {};
    return { id: id(t.id, "t", i), nom: texte(t.nom, 40) || "Titre", type: choix(t.type, TYPES_TITRE, "autre"),
      /* investi : montant total payé pour la ligne (frais compris) ; cours : dernier cours ou valeur liquidative, par titre. */
      quantite: arr(borne(t.quantite, 0, 1e8, 0)), investi: arr(borne(t.investi, 0, 1e9, 0)), cours: arr(borne(t.cours, 0, 1e7, 0)),
      coursDu: isoValide(t.coursDu) ? t.coursDu : "" };
  }
  function normaliserRevenu(r) {
    r = r || {};
    if (!isoValide(r.d)) return null;
    var v = num(r.v, NaN); if (!(v > 0) || v > 1e8) return null;
    return { d: r.d, v: arr(v), lib: texte(r.lib, 40) };
  }
  function normaliserTaux(x, i) {
    x = x || {};
    return { id: id(x.id, "p", i), nom: texte(x.nom, 40), type: choix(x.type, TYPES_TAUX, "autre"), banque: texte(x.banque, 30),
      montant: arr(borne(x.montant, 0, 1e9, 0)), tauxBrut: Math.round(borne(x.tauxBrut, 0, 30, 0) * 1000) / 1000,
      debut: isoValide(x.debut) ? x.debut : "", fin: isoValide(x.fin) ? x.fin : "" };
  }
  function normaliserBien(b, i) {
    b = b || {};
    return { id: id(b.id, "b", i), nom: texte(b.nom, 40) || "Bien immobilier", valeur: arr(borne(b.valeur, 0, 1e9, 0)),
      loyer: arr(borne(b.loyer, 0, 1e7, 0)), charges: arr(borne(b.charges, 0, 1e8, 0)), credit: texte(b.credit, 60) };
  }
  function normaliserOr(o, i) {
    o = o || {};
    return { id: id(o.id, "o", i), nom: texte(o.nom, 40) || "Or", grammes: arr(borne(o.grammes, 0, 1e6, 0)),
      carats: choix(Math.round(num(o.carats, 18)), CARATS, 18), prixAchat: arr(borne(o.prixAchat, 0, 1e9, 0)) };
  }
  function normaliser(p) {
    p = p && typeof p === "object" ? p : {};
    var revenus = (Array.isArray(p.revenus) ? p.revenus : []).map(normaliserRevenu).filter(Boolean)
      .sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }).slice(-MAX.revenus);
    var c = p.coursOr || {};
    var inflation = p.inflation == null || p.inflation === "" ? null : Math.round(borne(p.inflation, 0, 40, 0) * 10) / 10;
    return {
      titres: liste(p.titres, MAX.titres, normaliserTitre),
      revenus: revenus,
      taux: liste(p.taux, MAX.taux, normaliserTaux),
      biens: liste(p.biens, MAX.biens, normaliserBien),
      or: liste(p.or, MAX.or, normaliserOr),
      /* Prix d'un gramme d'or 18 carats (cours le plus courant en Tunisie) ; les autres titres s'en déduisent. */
      coursOr: { g18: arr(borne(c.g18, 0, 1e5, 0)), du: isoValide(c.du) ? c.du : "" },
      inflation: inflation
    };
  }
  function vide(pl) { return !pl || !(pl.titres.length || pl.taux.length || pl.biens.length || pl.or.length); }

  /* ---------- Impôt (barème annuel de l'IRPP + CSS) ---------- */
  function bareme(r, b) {
    var t = 0;
    for (var k = 0; k < b.length; k++) {
      var de = b[k].de, a = k + 1 < b.length ? b[k + 1].de : Infinity;
      if (r > de) t += (Math.min(r, a) - de) * b[k].taux;
    }
    return t;
  }
  /* Impôt en plus dû à un revenu ajouté (base annuelle) : différence de barème + CSS. fisc : { bareme, cssTaux, cssSeuil }. */
  function impotEnPlus(base, ajout, fisc) {
    if (!(ajout > 0) || !fisc || !fisc.bareme) return 0;
    var b = Math.max(0, base || 0), apres = b + ajout;
    var css = function (r) { return r > (fisc.cssSeuil || 0) ? r * (fisc.cssTaux || 0) : 0; };
    return Math.max(0, bareme(apres, fisc.bareme) - bareme(b, fisc.bareme) + css(apres) - css(b));
  }

  /* ---------- Bourse ---------- */
  function coursAge(du, auj) { return du ? Math.max(0, ecart(du, auj)) : null; }
  function bourse(pl, ctx) {
    var auj = ctx.aujourdhui, an = auj.slice(0, 4);
    var lignes = pl.titres.map(function (t) {
      var valeur = arr(t.quantite * t.cours), revient = t.investi, pv = arr(valeur - revient);
      var age = coursAge(t.coursDu, auj);
      return { id: t.id, nom: t.nom, type: t.type, quantite: t.quantite, cours: t.cours, investi: t.investi, coursDu: t.coursDu,
        valeur: valeur, revient: revient, pv: pv, pvPct: revient > 0 ? pv / revient : null, coursAge: age, ancien: age == null || age > 7 };
    });
    var valeur = arr(lignes.reduce(function (s, l) { return s + l.valeur; }, 0));
    var revient = arr(lignes.reduce(function (s, l) { return s + l.revient; }, 0));
    var parType = {};
    lignes.forEach(function (l) { parType[l.type] = (parType[l.type] || 0) + l.valeur; });
    var repartition = TYPES_TITRE.filter(function (k) { return parType[k] > 0; }).map(function (k) { return { cle: k, lib: NOMS_TITRE[k], valeur: arr(parType[k]), part: valeur > 0 ? parType[k] / valeur : 0 }; })
      .sort(function (a, b) { return b.valeur - a.valeur; });
    var revenusAnnee = arr(pl.revenus.filter(function (r) { return r.d.slice(0, 4) === an; }).reduce(function (s, r) { return s + r.v; }, 0));
    /* Si tout était vendu aujourd'hui : actions cotées seulement (10 % au-delà de 10 000 DT de plus-values nettes). */
    var pvActions = arr(lignes.filter(function (l) { return l.type === "action"; }).reduce(function (s, l) { return s + l.pv; }, 0));
    var imposable = Math.max(0, pvActions - FISC.abattementPlusValue);
    return { lignes: lignes, valeur: valeur, revient: revient, pv: arr(valeur - revient), pvPct: revient > 0 ? (valeur - revient) / revient : null,
      repartition: repartition, revenusAnnee: revenusAnnee, revenus12: revenus12(pl.revenus, auj),
      anciens: lignes.filter(function (l) { return l.ancien && l.quantite > 0; }).length,
      venteActions: { pv: pvActions, abattement: FISC.abattementPlusValue, impot: arr(imposable * FISC.tauxPlusValue) } };
  }
  /* Revenus reçus sur les 12 derniers mois (dividendes et coupons, nets). */
  function revenus12(revenus, auj) {
    var d = dateDe(auj); d.setFullYear(d.getFullYear() - 1); var depuis = iso(d);
    return arr(revenus.filter(function (r) { return r.d > depuis && r.d <= auj; }).reduce(function (s, r) { return s + r.v; }, 0));
  }

  /* ---------- Placements à taux connu ---------- */
  function placementsTaux(pl, ctx) {
    var auj = ctx.aujourdhui, epargneBrut = 0;
    pl.taux.forEach(function (x) { if (x.type === "cse") epargneBrut += x.montant * x.tauxBrut / 100; });
    /* Comptes spéciaux d'épargne : la part des intérêts au-delà du plafond reste imposée (20 %), répartie au prorata. */
    var partExoneree = epargneBrut > 0 ? Math.min(1, FISC.plafondEpargne / epargneBrut) : 1;
    var lignes = pl.taux.map(function (x) {
      var brut = arr(x.montant * x.tauxBrut / 100);
      var retenue = arr(x.type === "cse" ? brut * (1 - partExoneree) * FISC.retenueInterets : brut * FISC.retenueInterets);
      var reste = x.fin ? ecart(auj, x.fin) : null;
      return { id: x.id, nom: x.nom || NOMS_TAUX[x.type], type: x.type, typeLib: NOMS_TAUX[x.type], banque: x.banque, montant: x.montant, tauxBrut: x.tauxBrut,
        debut: x.debut, fin: x.fin, interetsBruts: brut, retenue: retenue, interetsNets: arr(brut - retenue),
        tauxNet: x.montant > 0 ? (brut - retenue) / x.montant * 100 : 0, joursAvantFin: reste, echu: reste != null && reste < 0, exonere: x.type === "cse" };
    });
    var enCours = lignes.filter(function (l) { return !l.echu; });
    var total = arr(enCours.reduce(function (s, l) { return s + l.montant; }, 0));
    var nets = arr(enCours.reduce(function (s, l) { return s + l.interetsNets; }, 0));
    var echeances = lignes.filter(function (l) { return l.fin; }).map(function (l) { return { id: l.id, d: l.fin, lib: libDate(l.fin), montant: l.montant, nom: l.nom, jours: l.joursAvantFin, echu: l.echu }; })
      .sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var prochaine = echeances.filter(function (e) { return !e.echu; })[0] || null;
    return { lignes: lignes, total: total, interetsNets: nets, tauxNetMoyen: total > 0 ? nets / total * 100 : 0, echeances: echeances, prochaine: prochaine,
      echus: lignes.filter(function (l) { return l.echu; }).length, plafondEpargneDepasse: epargneBrut > FISC.plafondEpargne };
  }
  /* À l'échéance : renouveler au même taux ou rembourser le crédit le plus cher (première année). credits : [{ libelle, tauxPct, crd }] */
  function decisionEcheance(ligne, credits) {
    var cher = (credits || []).filter(function (c) { return c.crd > 0 && c.tauxPct > 0; }).sort(function (a, b) { return b.tauxPct - a.tauxPct; })[0];
    var renouveler = arr(ligne.interetsNets);
    if (!cher) return { renouveler: renouveler, credit: null };
    var somme = Math.min(ligne.montant, cher.crd), economie = arr(somme * cher.tauxPct / 100);
    var gainRenouv = arr(somme * ligne.tauxNet / 100);
    return { renouveler: renouveler, credit: { libelle: cher.libelle, tauxPct: cher.tauxPct, somme: arr(somme), economie: economie, gainRenouvelerMeme: gainRenouv,
      meilleur: economie > gainRenouv + 0.5 ? "rembourser" : gainRenouv > economie + 0.5 ? "renouveler" : "egal" } };
  }

  /* ---------- Immobilier locatif ---------- */
  /* credits : [{ libelle, mensualite, actif }] ; revenuImposable : revenu imposable annuel du foyer (salaire), avant loyers. */
  function immobilier(pl, ctx) {
    var loyersImposables = pl.biens.reduce(function (s, b) { return s + b.loyer * 12 * (1 - FISC.deductionLoyers); }, 0);
    var impotTotal = impotEnPlus(ctx.revenuImposable || 0, loyersImposables, ctx.fisc);
    var biens = pl.biens.map(function (b) {
      var loyerAn = arr(b.loyer * 12), base = loyerAn * (1 - FISC.deductionLoyers);
      var impot = loyersImposables > 0 ? arr(impotTotal * base / loyersImposables) : 0;
      var cr = b.credit ? (ctx.credits || []).filter(function (c) { return c.libelle === b.credit && c.actif; })[0] : null;
      var netAn = arr(loyerAn - b.charges - impot);
      return { id: b.id, nom: b.nom, valeur: b.valeur, loyer: b.loyer, loyerAn: loyerAn, charges: b.charges, impot: impot, netAn: netAn,
        rendementNet: b.valeur > 0 ? netAn / b.valeur : null, credit: cr ? { libelle: cr.libelle, mensualite: cr.mensualite } : null,
        creditLie: b.credit, effortMois: arr(netAn / 12 - (cr ? cr.mensualite : 0)), loue: b.loyer > 0 };
    });
    return { biens: biens, total: arr(biens.reduce(function (s, b) { return s + b.valeur; }, 0)), netAn: arr(biens.reduce(function (s, b) { return s + b.netAn; }, 0)),
      impotTotal: arr(impotTotal) };
  }

  /* ---------- Or ---------- */
  function or(pl, ctx) {
    var g18 = pl.coursOr.g18, auj = ctx.aujourdhui;
    var lignes = pl.or.map(function (o) {
      var prixG = arr(g18 * o.carats / 18), valeur = arr(o.grammes * prixG);
      return { id: o.id, nom: o.nom, grammes: o.grammes, carats: o.carats, prixG: prixG, valeur: valeur, prixAchat: o.prixAchat,
        pvPct: o.prixAchat > 0 && valeur > 0 ? (valeur - o.prixAchat) / o.prixAchat : null };
    });
    var achat = lignes.reduce(function (s, l) { return s + (l.prixAchat > 0 ? l.prixAchat : 0); }, 0);
    var valeurAchetee = lignes.reduce(function (s, l) { return s + (l.prixAchat > 0 ? l.valeur : 0); }, 0);
    var age = coursAge(pl.coursOr.du, auj);
    return { lignes: lignes, valeur: arr(lignes.reduce(function (s, l) { return s + l.valeur; }, 0)), cours18: g18, coursDu: pl.coursOr.du, coursAge: age,
      ancien: lignes.length > 0 && (age == null || age > 30), sansCours: lignes.length > 0 && !(g18 > 0),
      pvPct: achat > 0 && valeurAchetee > 0 ? (valeurAchetee - achat) / achat : null };
  }

  /* ---------- Synthèse ---------- */
  function fmt(v) { var r = Math.round(v), s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); return (r < 0 ? "−" : "") + s + " DT"; }
  function pct(x, d) { return (Math.round(x * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toString().replace(".", ","); }
  /* ctx : { aujourdhui: "AAAA-MM-JJ", revenuImposable, fisc, credits: [{ libelle, mensualite, tauxPct, crd, actif }],
           liquidites (épargne disponible), contrats (capital assurance vie et CEA), inflationDefaut, depensesMois } */
  function analyser(p, ctx) {
    var pl = normaliser(p), c = Object.assign({ aujourdhui: iso(new Date()) }, ctx || {});
    var b = bourse(pl, c), t = placementsTaux(pl, c), im = immobilier(pl, c), o = or(pl, c);
    var liq = Math.max(0, num(c.liquidites, 0)), ct = Math.max(0, num(c.contrats, 0));
    var parts = { immo: im.total, taux: t.total, or: o.valeur, bourse: b.valeur, contrats: ct, liquidites: liq };
    var total = arr(Object.keys(parts).reduce(function (s, k) { return s + parts[k]; }, 0));
    var repartition = CLASSES.filter(function (x) { return parts[x.cle] > 0; }).map(function (x) { return { cle: x.cle, lib: x.lib, valeur: arr(parts[x.cle]), part: total > 0 ? parts[x.cle] / total : 0 }; })
      .sort(function (a, b2) { return b2.valeur - a.valeur; });
    /* Revenus annuels connus : loyers nets, intérêts nets, dividendes reçus (12 derniers mois). Hausse de valeur non comptée. */
    var revenusAn = arr(im.netAn + t.interetsNets + b.revenus12);
    var inflation = pl.inflation != null ? pl.inflation : num(c.inflationDefaut, 0);
    var rendement = total > 0 ? revenusAn / total * 100 : 0;
    var reel = rendement - inflation;
    var points = [];
    var placesHorsLiq = total - liq;
    if (!vide(pl)) {
      var gros = repartition[0];
      if (gros && gros.part > 0.6 && repartition.length > 1 && gros.cle !== "liquidites")
        points.push({ ton: "faible", cle: "concentration", titre: pct(gros.part * 100) + " % dans « " + gros.lib.toLowerCase() + " »",
          texte: "Un imprévu sur ce placement pèse sur tout votre patrimoine. Vos prochains placements gagneraient à aller ailleurs." });
      else if (repartition.length >= 3 && gros && gros.part <= 0.5)
        points.push({ ton: "fort", cle: "diversifie", titre: "Patrimoine bien réparti", texte: repartition.length + " familles de placements, aucune au-dessus de la moitié." });
      if (total > 0 && revenusAn > 0 && inflation > 0) {
        if (reel < 0) points.push({ ton: "faible", cle: "inflation", titre: "Vos revenus ne suivent pas l'inflation",
          texte: "Vos placements rapportent " + pct(rendement, 1) + " % par an, l'inflation est à " + pct(inflation, 1) + " %." });
        else points.push({ ton: "fort", cle: "inflation", titre: "Vos revenus battent l'inflation", texte: pct(rendement, 1) + " % par an contre " + pct(inflation, 1) + " % d'inflation." });
      }
      if (t.prochaine && t.prochaine.jours <= 30)
        points.push({ ton: "faible", cle: "echeance", titre: "Échéance dans " + t.prochaine.jours + (t.prochaine.jours > 1 ? " jours" : " jour"),
          texte: t.prochaine.nom + " : " + fmt(t.prochaine.montant) + " le " + t.prochaine.lib + ". Décidez avant : renouveler, placer ailleurs ou rembourser un crédit.", lien: { onglet: "depots" } });
      if (t.echus) points.push({ ton: "faible", cle: "echus", titre: t.echus + (t.echus > 1 ? " placements arrivés" : " placement arrivé") + " à échéance",
        texte: "Indiquez s'il a été renouvelé (nouvelle date) ou retiré : il n'est plus compté.", lien: { onglet: "depots" } });
      if (b.anciens) points.push({ ton: "faible", cle: "cours", titre: "Cours à mettre à jour", texte: b.anciens + (b.anciens > 1 ? " titres ont" : " titre a") + " un cours de plus de 7 jours.", lien: { onglet: "bourse" } });
      if (o.sansCours) points.push({ ton: "faible", cle: "or", titre: "Prix de l'or à saisir", texte: "Sans le prix du gramme, votre or n'est pas compté.", lien: { onglet: "immo" } });
      else if (o.ancien) points.push({ ton: "faible", cle: "or", titre: "Prix de l'or à mettre à jour", texte: "Le prix saisi a plus de 30 jours.", lien: { onglet: "immo" } });
      im.biens.forEach(function (x) {
        if (x.credit && x.effortMois < 0) points.push({ ton: "faible", cle: "effort-" + x.id, titre: "« " + x.nom + " » vous coûte " + fmt(-x.effortMois) + " par mois",
          texte: "Loyer net d'impôt et de charges inférieur à la mensualité du crédit (le capital remboursé reste à vous).", lien: { onglet: "immo" } });
      });
      if (t.plafondEpargneDepasse) points.push({ ton: "faible", cle: "plafond", titre: "Plafond d'exonération dépassé",
        texte: "Au-delà de 6 000 DT d'intérêts par an, les intérêts des comptes spéciaux d'épargne sont imposés." });
    }
    return { vide: vide(pl), placements: pl, bourse: b, taux: t, immobilier: im, or: o, total: total, totalPlace: arr(placesHorsLiq),
      repartition: repartition, revenusAn: revenusAn, rendement: rendement, inflation: inflation, reel: reel, points: points };
  }

  return {
    MAX: MAX, FISC: FISC, TYPES_TITRE: TYPES_TITRE, NOMS_TITRE: NOMS_TITRE, TYPES_TAUX: TYPES_TAUX, NOMS_TAUX: NOMS_TAUX, CARATS: CARATS,
    normaliser: normaliser, vide: vide, nouvelId: nouvelId, iso: iso, isoValide: isoValide, libDate: libDate,
    bareme: bareme, impotEnPlus: impotEnPlus, decisionEcheance: decisionEcheance, analyser: analyser
  };
});
