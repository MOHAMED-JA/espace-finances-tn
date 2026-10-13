/*
 * Orbite — fiche de paie (lot 7, module pur testé sous Node).
 * analyser(lignes) : retrouve sur les lignes lues (FicheLecture) le mois, le brut, le salaire de base, les primes,
 *   la caisse, les retenues (cotisations, IRPP, CSS, autres), le net et la date d'entrée. Chaque valeur garde le
 *   texte d'où elle vient et son état : « lu », « verifier » (chiffre peu net ou total qui ne tombe pas juste) ou
 *   « calcule » (déduite des autres lignes).
 * controle(valeurs, profil) : compare la fiche au calcul d'Orbite pour un mois habituel (même brut, même caisse,
 *   situation de famille du profil) ; écart signalé au-delà de 1 DT, avec des pistes d'explication.
 * appliquer(valeurs, choix, profil, maintenant) : le changement de profil à enregistrer (salaire de base, primes,
 *   caisse, date d'embauche) et l'entrée de l'historique du salaire au mois de la fiche ; depuis le 13 oct. 2026, aussi
 *   les autres lignes de la fiche (retenues déduites de l'impôt, versements, retenues sur le net, prêts → crédits)
 *   et l'impôt aligné sur la fiche (analyser() les range dans « autres » avec un groupe proposé).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("../../moteurs/salaire/parametres.js"));
  } else racine.FicheCalcul = fabrique(racine.OrbiteCalcul, racine.PARAMETRES_PAIE);
})(typeof self !== "undefined" ? self : this, function (OC, P) {
  "use strict";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var RE_MOIS = /\b(janv(?:ier)?|f[e]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)\.?\s*(?:[-/]\s*)?((?:19|20)\d\d)\b/;
  var PREFIXES = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "aou", "sep", "oct", "nov", "dec"];
  var SEUIL_CONFIANCE = 0.8;
  var TOLERANCE = 1;  /* DT : en deçà, l'écart vient des arrondis */

  /* ---------- Texte ---------- */
  function norm(t) {
    return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[’`´]/g, "'").replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
  }
  /* Une ligne venant de FicheLecture, ou du texte brut (cellules séparées par 2 espaces, une tabulation ou |). */
  function versLigne(l) {
    if (l && typeof l === "object" && l.cellules) {
      var c = l.cellules.slice();
      return { texte: l.texte || c.join("   "), cellules: c, confiances: l.confiances || c.map(function () { return l.confiance == null ? 1 : l.confiance; }) };
    }
    var cs = String(l || "").split(/\t|\s*\|\s*|\s{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    return { texte: cs.join("   "), cellules: cs, confiances: cs.map(function () { return 1; }) };
  }
  function versLignes(entree) {
    var ls = typeof entree === "string" ? entree.split(/\r?\n/) : (entree || []);
    return ls.map(versLigne).filter(function (l) { return l.cellules.length; });
  }

  /* ---------- Montants au format tunisien (2 700,000 · 2.700,000 · 2700.000 · 290,400) ---------- */
  function montant(cellule) {
    var t = String(cellule == null ? "" : cellule).replace(/[   ]/g, " ").trim()
      .replace(/\s*(?:dt|tnd|dinars?|d)\.?$/i, "").trim();
    if (!t || /%/.test(t)) return null;
    /* Confusions fréquentes de la lecture de photo : O pour 0 au milieu des chiffres. */
    t = t.replace(/(\d)[oO](?=[\d\s.,oO]|$)/g, "$10").replace(/(\d)[oO](?=[\d\s.,oO]|$)/g, "$10");
    var neg = /^[-−–]/.test(t);
    t = t.replace(/^[-−–]\s*/, "");
    if (!/^\d[\d ., ]*$/.test(t) || /[ .,]{2,}/.test(t)) return null;
    var ent = t, dec = "", i = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
    if (i >= 0) {
      var sep = t[i], apres = t.slice(i + 1);
      /* Un seul séparateur suivi de 1 à 3 chiffres : les millimes. Plusieurs fois le même : des milliers. */
      if (t.split(sep).length === 2 && /^\d{1,3}$/.test(apres)) { ent = t.slice(0, i); dec = apres; }
    }
    if (/ /.test(ent) && !/^\d{1,3}( \d{3})+$/.test(ent)) return null;   /* « 18 261 » n'est pas un nombre */
    ent = ent.replace(/[ .,]/g, "");
    if (!/^\d+$/.test(ent) || ent.length > 9) return null;
    var v = parseFloat(ent + (dec ? "." + dec : ""));
    /* Plus de 100 000 DT sans millimes : la virgule des millimes a été perdue (« 3000000 » pour 3 000,000). */
    if (!dec && v >= 100000 && /000$|[ .,]\d{3}$/.test(t)) v = v / 1000;
    return neg ? -v : v;
  }
  /* Nombre en fin de cellule mêlée de texte (« Net à payer : 2 141,885 »), jamais un pourcentage ni une date. */
  function montantFinal(cellule) {
    var m = String(cellule).match(/(?:^|[^\d/.,])(\d[\d ., ]*\d|\d)\s*(?:dt|tnd)?\.?\s*$/i);
    if (!m || /[/]\d*$/.test(cellule.slice(0, cellule.length - m[0].length + 1))) return null;
    return montant(m[1]);
  }
  function taux(cellule) {
    var m = String(cellule).match(/(\d{1,2}(?:[.,]\d{1,3})?)\s*%/);
    return m ? parseFloat(m[1].replace(",", ".")) : null;
  }
  /* Montants d'une ligne : { v, conf, i } dans l'ordre, sans les pourcentages ; et les taux de la ligne. */
  function nombres(l) {
    var res = [], tx = [];
    l.cellules.forEach(function (c, i) {
      var t = taux(c); if (t != null) tx.push(t);
      if (/%/.test(c) && !/%\s*:?\s*[-\d]/.test(c)) return;
      var v = montant(c);
      if (v == null && /[a-z]/i.test(c)) v = montantFinal(c.replace(/^.*%\s*:?\s*/, ""));
      if (v != null && !/\d[/]\d/.test(c)) res.push({ v: v, conf: l.confiances[i] == null ? 1 : l.confiances[i], i: i });
    });
    return { montants: res, taux: tx };
  }
  /* Retenue sociale d'une ligne : le montant égal à base × taux salarial (le plus petit taux), sinon le dernier. */
  function retenueDe(l) {
    var n = nombres(l), ms = n.montants;
    if (!ms.length) return null;
    var tx = n.taux.filter(function (t) { return t > 0 && t < 20; }).sort(function (a, b) { return a - b; });
    if (tx.length && ms.length >= 2) {
      for (var j = 1; j < ms.length; j++) for (var i = 0; i < j; i++) {
        if (Math.abs(ms[i].v * tx[0] / 100 - ms[j].v) <= Math.max(0.01, ms[j].v * 0.003)) return ms[j];
      }
    }
    return ms[ms.length - 1];
  }
  function dernier(l) { var ms = nombres(l).montants; return ms.length ? ms[ms.length - 1] : null; }

  /* ---------- Repérage des lignes ---------- */
  var EXCLU_PAT = /patronal|employeur|part pat|charges? pat|cumul|annuel|depuis le debut/;
  var REGLES = {
    brut: { cherche: [/salaire brut|brut (?:mensuel|du mois|a payer)|total brut|brut total|remuneration brute|traitement brut|^brut\b/, /total des gains|total gains/],
      exclut: /imposable|cotisable|fiscal|net|soumis/ },
    base: { cherche: [/salaire de base|salaire base|traitement de base|salaire mensuel de base|traitement mensuel|appointements?/], exclut: /brut|net|total/ },
    irpp: { cherche: [/\bi\.?r\.?p\.?p+\b|\birp+\b|impot sur le revenu|retenue a la source|\bimpot\b|\bi\.?r\.?\b/], exclut: /css|solidarite|imposable|base/ },
    css: { cherche: [/\bc\.?s\.?s\b|contribution sociale|solidarite/], exclut: /\bcss patronal/ },
    net: { cherche: [/net a payer|net a percevoir|net paye|net verse|net du mois|salaire net|net mensuel/, /\bnet\b/],
      exclut: /imposable|fiscal|brut|avant|apres cotis/ },
    imposable: { cherche: [/salaire imposable|net imposable|revenu imposable|base imposable|montant imposable|\bimposable\b/], exclut: /non imposable|brut/ },
    totalRetenues: { cherche: [/total (?:des )?retenues|total retenu|retenues totales/], exclut: /patronal/ }
  };
  var RE_COTIS = /\bcnss\b|\bc\.n\.s\.s\b|cnrps|cnam|cotisations?|securite sociale|perte d'?\s?emploi|capital deces|prevoyance sociale|assurance maladie|\bretraite\b|pensions? civiles?/;
  var RE_AUTRES = /avance|acompte|\bpret\b|mutuelle|assurance groupe|cantine|opposition|saisie|retenue diverse|cotisation syndicale|syndicat|remboursement de pret/;
  /* Autres lignes de la fiche (13 oct. 2026), rangées dans les groupes du profil (lignesFiche) ou dans les crédits. */
  var RE_GAIN_NET = /bonif/;
  var RE_SOCIALE = /\bcavis\b|retraite complementaire|regime complementaire|assurance groupe|ass\.? groupe|mutuelle|prevoyance complementaire/;
  var RE_CREDIT = /\bpret\b|remboursement de pret|echeance (?:du )?pret|\bcredit\b/;
  var RE_NETTE = /avance|acompte|cantine|opposition|saisie|retenue diverse|cotisation syndicale|syndica|\bugtt\b|assurance auto|ass\.? auto|tickets? restaurant|complement (?:de )?retraite/;
  function groupeAutre(lib) {
    if (RE_GAIN_NET.test(lib)) return "gains";
    if (RE_SOCIALE.test(lib)) return "sociales";
    if (RE_CREDIT.test(lib)) return "credit";
    if (RE_NETTE.test(lib)) return "nettes";
    return null;
  }
  /* Libellé d'une ligne : la première cellule avec des lettres, sans montant ni taux. */
  function libelleDe(l) {
    var c = l.cellules.filter(function (x) { return /[a-zà-ÿ]/i.test(x); })[0] || l.texte;
    return c.replace(/[-−]?\d[\d .,]*\s*%?/g, " ").replace(/\s+/g, " ").replace(/[:·]\s*$/, "").trim().slice(0, 40) || "Ligne de la fiche";
  }
  var RE_PRIME = /prime|indemnite|gratification|bonus|heures? sup|majoration|allocation|avantage|commission|13e mois|treizieme|sursalaire|rappel/;
  var RE_PAS_PRIME = /salaire de base|brut|net|total|imposable|cotisable|retenue|cumul|patronal|employeur|irpp|\bcss\b|cnss|cnrps|conge/;

  function trouver(lignes, regle, extracteur) {
    for (var k = 0; k < regle.cherche.length; k++) {
      for (var i = 0; i < lignes.length; i++) {
        var lib = norm(lignes[i].texte);
        if (!regle.cherche[k].test(lib) || (regle.exclut && regle.exclut.test(lib)) || EXCLU_PAT.test(lib)) continue;
        var n = (extracteur || dernier)(lignes[i]);
        if (n) return { valeur: n.v, conf: n.conf, source: lignes[i].texte, ligne: i };
      }
    }
    return null;
  }
  function champ(t, etat) {
    if (!t) return null;
    return { valeur: t.valeur, source: t.source, conf: t.conf == null ? 1 : t.conf, etat: etat || (t.conf != null && t.conf < SEUIL_CONFIANCE ? "verifier" : "lu") };
  }

  function moisDe(lignes) {
    var meilleur = null;
    for (var i = 0; i < lignes.length; i++) {
      var lib = norm(lignes[i].texte), m = lib.match(RE_MOIS), r = null;
      if (m) {
        var k = PREFIXES.findIndex(function (p) { return m[1].indexOf(p) === 0; });
        if (k >= 0) r = { mois: k + 1, annee: +m[2] };
      } else if (/periode|mois|paie|bulletin|du \d/.test(lib)) {
        var d = lib.match(/\b(?:(\d{1,2})[/.-])?(\d{1,2})[/.-]((?:19|20)\d\d)\b/);
        if (d && +d[2] >= 1 && +d[2] <= 12) r = { mois: +d[2], annee: +d[3] };
      }
      if (!r) continue;
      var prio = /periode|mois de|paie|bulletin|salaire du/.test(lib) ? 2 : 1;
      if (!meilleur || prio > meilleur.prio) meilleur = Object.assign({ prio: prio, valeur: r }, cellule(lignes[i], m ? RE_MOIS : /\d{1,2}[/.-](?:19|20)\d\d/));
      if (prio === 2) break;
    }
    return meilleur;
  }
  function dateEntreeDe(lignes, maintenant) {
    for (var i = 0; i < lignes.length; i++) {
      var lib = norm(lignes[i].texte);
      if (!/date d'?\s?entree|date d'?\s?embauche|entree le|embauche le|date entree|date d'?\s?anciennete|\bentree\b|\bembauche\b/.test(lib)) continue;
      var d = lib.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
      if (!d) continue;
      var an = +d[3] < 100 ? (+d[3] > 50 ? 1900 : 2000) + +d[3] : +d[3], mo = +d[2], j = +d[1];
      var dt = new Date(an, mo - 1, j);
      if (dt.getMonth() !== mo - 1 || an < 1960 || dt > (maintenant || new Date())) continue;
      return Object.assign({ valeur: an + "-" + String(mo).padStart(2, "0") + "-" + String(j).padStart(2, "0") }, cellule(lignes[i], /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/));
    }
    return null;
  }
  /* Texte d'origine montré à l'utilisateur : la cellule où la valeur a été trouvée (sinon la ligne). */
  function cellule(l, re) {
    var i = l.cellules.findIndex(function (x) { return re.test(norm(x)); });
    return i >= 0 ? { source: l.cellules[i], conf: l.confiances[i] } : { source: l.texte, conf: Math.min.apply(null, l.confiances) };
  }
  function familleDe(lignes) {
    var f = {};
    lignes.forEach(function (l) {
      var lib = norm(l.texte), m;
      if ((m = lib.match(/(?:nombre d'?\s?enfants?|nb\.? enfants?|enfants?(?: a charge)?)\s*:?\s*(\d{1,2})\b/)) && f.enfants == null) f.enfants = +m[1];
      if ((m = lib.match(/chef de famille\s*:?\s*(oui|non|o|n)\b/)) && f.chef == null) f.chef = m[1][0] === "o";
      if ((m = lib.match(/\b(celibataire|mariee?|divorcee?|veuf|veuve)\b/)) && f.situation == null) f.situation = { celibataire: "celibataire", marie: "marie", mariee: "marie", divorce: "divorce", divorcee: "divorce", veuf: "veuf", veuve: "veuf" }[m[1]];
    });
    return f;
  }
  function typePrime(lib) {
    if (/avantage|en nature|logement de fonction|voiture de fonction/.test(lib)) return "avantagesNature";
    if (/non imposable|exonere|kilometrique|frais de mission|frais de deplacement|remboursement de frais/.test(lib)) return "indemnitesNonImposables";
    if (/non cotisable|non soumis/.test(lib)) return "primesNonCotisables";
    return "primesImposables";
  }

  /* ---------- Analyse ---------- */
  function analyser(entree, maintenant) {
    var lignes = versLignes(entree), c = {}, alertes = [];
    var t;
    if ((t = moisDe(lignes))) c.mois = champ(t);
    if ((t = trouver(lignes, REGLES.brut))) c.brut = champ(t);
    if ((t = trouver(lignes, REGLES.base))) c.base = champ(t);
    if ((t = trouver(lignes, REGLES.net))) c.net = champ(t);
    if ((t = trouver(lignes, REGLES.irpp))) c.irpp = champ(t);
    if ((t = trouver(lignes, REGLES.css, retenueDe))) c.css = champ(t);
    if ((t = trouver(lignes, REGLES.imposable))) c.imposable = champ(t);
    var totalRet = trouver(lignes, REGLES.totalRetenues);
    if ((t = dateEntreeDe(lignes, maintenant))) c.dateEmbauche = champ(t);

    /* Cotisations sociales : toutes les lignes salariales (CNSS, perte d'emploi, CNRPS, CNAM, capital décès…). */
    var cot = 0, cotConf = 1, cotSources = [], caisse = null;
    var primes = [], autres = 0, autresSources = [], extras = [], gains = 0, gainsSources = [];
    lignes.forEach(function (l, i) {
      var lib = norm(l.texte), sansNon = lib.replace(/non (?:imposable|cotisable|soumis)/g, "");
      if (EXCLU_PAT.test(lib) || /total|imposable|cotisable|brut|net a/.test(sansNon)) return;
      /* Autres lignes (retraite complémentaire, assurance groupe, bonification, syndicat, prêt…) : avant les cotisations,
         car « retraite complémentaire » contient « retraite ». */
      var grp = groupeAutre(lib);
      if (grp) {
        var x = dernier(l); if (!x || x.v <= 0) return;
        extras.push({ libelle: libelleDe(l), montant: x.v, groupe: grp, source: l.texte, conf: x.conf, ligne: i });
        if (grp === "gains") { gains += x.v; gainsSources.push(l.texte); } else { autres += x.v; autresSources.push(l.texte); }
        return;
      }
      if (RE_COTIS.test(lib) && !RE_AUTRES.test(lib)) {
        var r = retenueDe(l); if (!r) return;
        cot += r.v; cotConf = Math.min(cotConf, r.conf); cotSources.push(l.texte);
        if (/cnrps|pensions? civiles?|capital deces/.test(lib)) caisse = "CNRPS";
        else if (/cnss|c\.n\.s\.s|perte d'?\s?emploi/.test(lib) && !caisse) caisse = "CNSS";
        return;
      }
      if (RE_AUTRES.test(lib)) { var a = dernier(l); if (a) { autres += a.v; autresSources.push(l.texte); } return; }
      if (RE_PRIME.test(lib) && !RE_PAS_PRIME.test(sansNon)) {
        var p = dernier(l); if (!p || p.v <= 0) return;
        primes.push({ libelle: l.cellules[0], montant: p.v, type: typePrime(lib), source: l.texte, conf: p.conf, ligne: i });
      }
    });
    if (cotSources.length) c.cotisations = champ({ valeur: Math.round(cot * 1000) / 1000, conf: cotConf, source: cotSources.join(" · ") });
    if (caisse) c.caisse = { valeur: caisse, secteur: caisse === "CNRPS" ? "public" : "prive", source: cotSources[0], etat: "lu", conf: 1 };
    if (autresSources.length) c.autresRetenues = champ({ valeur: Math.round(autres * 1000) / 1000, conf: 1, source: autresSources.join(" · ") });
    if (gainsSources.length) c.gains = champ({ valeur: Math.round(gains * 1000) / 1000, conf: 1, source: gainsSources.join(" · ") });

    /* Primes par catégorie du profil ; le brut fait foi : ce qui manque entre le salaire de base et le brut
       est compté comme prime imposable (ligne non reconnue). */
    var parType = { primesImposables: 0, primesNonCotisables: 0, avantagesNature: 0, indemnitesNonImposables: 0 }, primeConf = 1;
    primes.forEach(function (p) { parType[p.type] += p.montant; primeConf = Math.min(primeConf, p.conf); });
    var dansBrut = parType.primesNonCotisables + parType.avantagesNature, lusImposables = parType.primesImposables, primesAVerifier = false;
    if (c.brut) {
      if (!c.base) c.base = { valeur: Math.max(0, c.brut.valeur - lusImposables - dansBrut), source: "Brut moins les primes lues", conf: 1, etat: "calcule" };
      var reste = c.brut.valeur - c.base.valeur - dansBrut;   /* primes imposables que le brut implique */
      if (reste < -TOLERANCE) alertes.push("Le salaire de base lu dépasse le brut : vérifiez ces deux montants.");
      else if (Math.abs(reste - lusImposables) > TOLERANCE) {
        if (reste > lusImposables) primes.push({ libelle: "Autres éléments du brut", montant: reste - lusImposables, type: "primesImposables", source: "Brut moins le salaire de base et les primes lues", calcule: true });
        else primesAVerifier = true;
        parType.primesImposables = Math.max(0, reste);
      }
    } else if (c.base) {
      c.brut = { valeur: c.base.valeur + lusImposables + dansBrut, source: "Salaire de base plus les primes lues", conf: 1, etat: "calcule" };
    }
    primes = primes.filter(function (p) { return p.montant > 0.0005; });
    Object.keys(parType).forEach(function (k) {
      if (parType[k] > 0.0005 || k === "primesImposables" && c.brut) {
        var srcs = primes.filter(function (p) { return p.type === k; });
        c[k] = { valeur: Math.round(parType[k] * 1000) / 1000, source: srcs.map(function (p) { return p.source || p.libelle; }).join(" · ") || "Aucune prime lue",
          conf: primeConf, etat: k === "primesImposables" && primesAVerifier || primeConf < SEUIL_CONFIANCE ? "verifier" : srcs.some(function (p) { return p.calcule; }) ? "calcule" : "lu" };
      }
    });

    /* Le total tombe-t-il juste ? brut − cotisations − IRPP − CSS − autres retenues − avantages en nature
       + indemnités non imposables = net à payer. Si oui, les chiffres peu nets sont confirmés. */
    var coherent = null;
    if (c.brut && c.net && c.cotisations && c.irpp) {
      var attendu = c.brut.valeur - c.cotisations.valeur - c.irpp.valeur - (c.css ? c.css.valeur : 0) - (c.autresRetenues ? c.autresRetenues.valeur : 0)
        - (c.avantagesNature ? c.avantagesNature.valeur : 0) + (c.indemnitesNonImposables ? c.indemnitesNonImposables.valeur : 0) + (c.gains ? c.gains.valeur : 0);
      coherent = Math.abs(attendu - c.net.valeur) <= TOLERANCE;
      if (!coherent && totalRet) {
        /* Retenues non reconnues une à une mais présentes dans le total de la fiche. */
        var lues = c.cotisations.valeur + c.irpp.valeur + (c.css ? c.css.valeur : 0) + (c.autresRetenues ? c.autresRetenues.valeur : 0);
        var manque = totalRet.valeur - lues;
        if (manque > TOLERANCE && Math.abs(attendu - manque - c.net.valeur) <= TOLERANCE) {
          c.autresRetenues = { valeur: Math.round(((c.autresRetenues ? c.autresRetenues.valeur : 0) + manque) * 1000) / 1000, source: totalRet.source, conf: 1, etat: "calcule" };
          coherent = true;
        }
      }
      ["brut", "net", "cotisations", "irpp", "css"].forEach(function (k) {
        if (!c[k] || c[k].etat === "calcule") return;
        c[k].etat = coherent ? "lu" : (c[k].conf < 0.9 || k === "net" ? "verifier" : c[k].etat);
      });
      /* Total juste et salaire de base + primes = brut : la décomposition du brut est confirmée elle aussi. */
      if (coherent && c.base && c.primesImposables && Math.abs(c.base.valeur + c.primesImposables.valeur + dansBrut - c.brut.valeur) <= TOLERANCE && !primesAVerifier) {
        ["base", "primesImposables"].forEach(function (k) { if (c[k].etat === "verifier") c[k].etat = "lu"; });
      }
      if (!coherent) alertes.push("Les montants lus ne tombent pas juste (brut − retenues ≠ net) : vérifiez les cases marquées « à vérifier ».");
    }
    var trouve = ["brut", "base", "net", "irpp", "cotisations"].filter(function (k) { return c[k]; }).length;
    extras.forEach(function (x) { x.etat = x.conf < SEUIL_CONFIANCE && !coherent ? "verifier" : "lu"; });
    return { champs: c, primes: primes, autres: extras, famille: familleDe(lignes), coherent: coherent, alertes: alertes, lisible: trouve >= 2 && !!(c.brut || c.net), lignes: lignes.length };
  }

  /* Valeurs simples (nombres) depuis les champs analysés, que l'interface laisse corriger. */
  function valeurs(champs) {
    var v = {};
    Object.keys(champs || {}).forEach(function (k) { v[k] = champs[k] && champs[k].valeur; });
    if (champs && champs.caisse) v.secteur = champs.caisse.secteur;
    return v;
  }

  /* ---------- Contrôle ---------- */
  var LIB = { cotisations: "Cotisations", irpp: "Impôt (IRPP)", css: "CSS", net: "Net à payer" };
  function dt(v) { return (Math.round(Math.abs(v) * 1000) / 1000).toFixed(3).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  function profilDeControle(v, profil) {
    var brut = v.brut || 0, nonCot = v.primesNonCotisables || 0, av = v.avantagesNature || 0;
    var primes = v.primesImposables != null ? v.primesImposables : 0;
    var base = v.base != null ? v.base : brut - primes - nonCot - av;
    return OC.normaliser(Object.assign({}, profil || {}, {
      activite: "salarie", historiqueSalaire: [], calendrierPrimes: [], nombreSalaires: 12,
      /* Le contrôle compare la fiche au barème : sans les lignes ni l'impôt aligné du profil, mais avec les retenues
         déduites de l'impôt lues sur cette fiche (retraite complémentaire, assurance groupe), qui changent l'IRPP. */
      lignesFiche: v.sociales > 0 ? { sociales: [{ libelle: "Retenues de la fiche", montant: v.sociales }] } : {}, impotFiche: {},
      montant: Math.max(0, base), sens: "brut", periode: "mensuel",
      primesImposables: Math.max(0, primes), primesNonCotisables: nonCot, avantagesNature: av, indemnitesNonImposables: v.indemnitesNonImposables || 0,
      secteur: v.secteur || (profil && profil.secteur) || "prive"
    }));
  }

  function controle(v, profil, famille) {
    if (!(v && v.brut > 0)) return { possible: false, raison: "Il faut au moins le salaire brut de la fiche pour la contrôler." };
    var p = profilDeControle(v, profil), s = OC.salaire(p), a = s.resultat.annuel;
    var orbite = { cotisations: a.cotisations / 12, irpp: a.irpp / 12, css: a.css / 12, net: a.netAPayer / 12 - (v.autresRetenues || 0) - (v.nettes || 0) + (v.gains || 0) };
    var lignes = ["cotisations", "irpp", "css", "net"].filter(function (k) { return v[k] != null && !isNaN(v[k]); }).map(function (k) {
      var e = v[k] - orbite[k];
      return { cle: k, libelle: k === "cotisations" ? "Cotisations " + (p.secteur === "public" ? "CNRPS" : "CNSS") : LIB[k], fiche: v[k], orbite: orbite[k], ecart: e, ok: Math.abs(e) <= TOLERANCE };
    });
    var res = { possible: true, lignes: lignes, orbite: orbite, profil: p, pistes: [], baremes: P.annee };
    if (v.mois && v.mois.annee && v.mois.annee !== P.annee) res.pistes.push("Fiche de " + v.mois.annee + " : Orbite la compare aux barèmes " + P.annee + ", qui ont pu changer depuis.");
    var ecarts = lignes.filter(function (l) { return !l.ok; });
    if (!lignes.length) {
      res.etat = "incomplet";
      res.titre = "Rien à comparer pour l'instant";
      res.texte = "Ajoutez au moins le net à payer ou l'impôt de la fiche : Orbite les comparera à son calcul.";
      return res;
    }
    if (!ecarts.length) {
      res.etat = "coherent";
      res.titre = "Votre fiche est cohérente";
      res.texte = "Cotisations, impôt et net concordent avec les barèmes " + P.annee + ", à moins de 1 DT près.";
      return res;
    }
    var ordre = ["irpp", "cotisations", "css", "net"], principal = ordre.map(function (k) { return ecarts.find(function (l) { return l.cle === k; }); }).filter(Boolean)[0];
    var plus = principal.ecart > 0;
    res.etat = "ecart";
    res.titre = { irpp: "Un écart sur l'impôt", cotisations: "Un écart sur les cotisations", css: "Un écart sur la CSS", net: "Un écart sur le net" }[principal.cle];
    res.texte = principal.cle === "net"
      ? "Votre fiche verse " + dt(principal.ecart) + " DT " + (plus ? "de plus" : "de moins") + " que le calcul d'Orbite."
      : "Votre fiche retient " + dt(principal.ecart) + " DT " + (principal.cle === "irpp" ? "d'IRPP" : principal.cle === "css" ? "de CSS" : "de cotisations") + " " + (plus ? "de plus" : "de moins") + " que le calcul d'Orbite.";
    var f = famille || {}, pr = profil || {};
    if (ecarts.some(function (l) { return l.cle === "irpp" || l.cle === "css"; })) {
      if (f.enfants != null && f.enfants !== (pr.enfants || 0)) res.pistes.push("Votre fiche compte " + f.enfants + " enfant" + (f.enfants > 1 ? "s" : "") + " à charge, votre profil " + (pr.enfants || 0) + ". Le bon nombre change l'impôt.");
      if (f.chef != null && f.chef !== !!pr.chefDeFamille) res.pistes.push(f.chef ? "Votre fiche vous compte comme chef de famille, pas votre profil." : "Votre profil vous indique chef de famille, pas votre fiche.");
      var irppE = ecarts.find(function (l) { return l.cle === "irpp"; }) || principal;
      if (irppE.ecart > 0) {
        if (pr.chefDeFamille || (pr.enfants || 0) > 0 || (pr.parents || 0) > 0) res.pistes.push("Votre employeur sait-il que vous êtes chef de famille, et combien d'enfants vous avez à charge ? Sans ces informations, il retient l'impôt d'une personne seule.");
        else res.pistes.push("Orbite calcule avec la situation de famille de votre profil (personne seule, sans enfant à charge) : vérifiez qu'elle est à jour.");
        res.pistes.push("Une régularisation de l'impôt sur les mois précédents peut aussi expliquer l'écart.");
      } else {
        res.pistes.push("Votre employeur applique peut-être des déductions absentes de votre profil (enfants étudiants ou handicapés, parents à charge) : complétez votre profil si c'est le cas.");
        res.pistes.push("Une régularisation en votre faveur sur les mois précédents peut aussi expliquer l'écart.");
      }
    }
    if (ecarts.some(function (l) { return l.cle === "cotisations"; })) {
      var c = ecarts.find(function (l) { return l.cle === "cotisations"; });
      var tauxFiche = v.brut > 0 ? c.fiche / (v.brut - (v.primesNonCotisables || 0)) : 0;
      res.pistes.push("Cotisations de la fiche : " + (tauxFiche * 100).toFixed(2).replace(".", ",") + " % du brut soumis, contre " + (c.orbite / (v.brut - (v.primesNonCotisables || 0)) * 100).toFixed(2).replace(".", ",") +
        " % dans le calcul d'Orbite. Une prime non soumise à cotisation, une autre caisse ou un régime particulier peuvent l'expliquer.");
    }
    if (principal.cle === "net" && ecarts.length === 1) res.pistes.push("Une retenue ou une indemnité de la fiche n'a peut-être pas été lue : vérifiez les lignes du bas de la fiche.");
    return res;
  }

  /* ---------- Mise à jour du profil ---------- */
  function appliquer(v, choix, profil, maintenant) {
    var m = maintenant || new Date(), ch = choix || {}, pr = profil || {}, partiel = {}, resume = [];
    if (ch.salaire && v.brut > 0) {
      var pc = profilDeControle(v, pr);
      var mo = v.mois && v.mois.mois ? v.mois.mois : m.getMonth() + 1, an = v.mois && v.mois.annee ? v.mois.annee : m.getFullYear();
      var hist = (pr.historiqueSalaire || []).slice(), base = Math.round(pc.montant * 1000) / 1000;
      /* Salaire déjà en vigueur ce mois-là (même montant brut mensuel) : l'historique ne change pas. */
      var enVigueur = hist.length ? OC.salaireEnVigueur(pr, an, mo - 1) : { montant: pr.montant, sens: pr.sens, periode: pr.periode };
      var deja = !!enVigueur && Math.abs(enVigueur.montant - base) < 0.0005 && enVigueur.sens === "brut" && enVigueur.periode === "mensuel";
      /* Primes décochées : celles du profil restent telles quelles. */
      var primes = ch.primes === false ? {} : { primesImposables: pc.primesImposables, primesNonCotisables: pc.primesNonCotisables,
        avantagesNature: pc.avantagesNature, indemnitesNonImposables: pc.indemnitesNonImposables };
      Object.assign(partiel, primes);
      if (!deja) {
        if (!hist.length) hist.push({ montant: pr.montant, sens: pr.sens, periode: pr.periode, mois: 0, annee: 0 });
        hist = hist.filter(function (h) { return !(h.mois === mo && h.annee === an); });
        hist.push({ montant: base, sens: "brut", periode: "mensuel", mois: mo, annee: an });
        var p2 = OC.normaliser(Object.assign({}, pr, primes, { historiqueSalaire: hist }));
        var ap = OC.appliquerHistorique(p2, m).profil;
        Object.assign(partiel, { historiqueSalaire: p2.historiqueSalaire, montant: ap.montant, sens: ap.sens, periode: ap.periode });
        resume.push("salaire de base " + dt(base) + " DT brut depuis " + MOIS[mo - 1] + " " + an);
      }
      var tot = pc.primesImposables + pc.primesNonCotisables + pc.avantagesNature;
      var primesChangent = ch.primes !== false && ["primesImposables", "primesNonCotisables", "avantagesNature", "indemnitesNonImposables"].some(function (k) { return Math.abs((pr[k] || 0) - pc[k]) >= 0.0005; });
      if (primesChangent) resume.push(tot > 0 ? "primes " + dt(tot) + " DT par mois" : "primes retirées");
    }
    if (ch.caisse && (v.secteur === "public" || v.secteur === "prive") && v.secteur !== pr.secteur) {
      partiel.secteur = v.secteur;
      resume.push(v.secteur === "public" ? "secteur public (CNRPS)" : "secteur privé (CNSS)");
    }
    if (ch.dateEmbauche && /^\d{4}-\d{2}-\d{2}$/.test(v.dateEmbauche || "") && v.dateEmbauche !== pr.dateEmbauche) {
      partiel.dateEmbauche = v.dateEmbauche;
      resume.push("date d'embauche");
    }
    var al = autresLignes(v, ch, pr, m);
    if (al.lignesFiche) { partiel.lignesFiche = al.lignesFiche; resume.push(al.nLignes + " autre" + (al.nLignes > 1 ? "s" : "") + " ligne" + (al.nLignes > 1 ? "s" : "") + " de la fiche"); }
    if (al.credits) { partiel.credits = al.credits; resume.push(al.nCredits > 1 ? al.nCredits + " crédits ajoutés" : "crédit « " + al.nomCredit + " » ajouté"); }
    var imp = impotAligne(v, ch, pr, partiel);
    if (imp) { partiel.impotFiche = imp; resume.push("impôt aligné sur la fiche"); }
    return { partiel: partiel, resume: resume, vide: !Object.keys(partiel).length };
  }

  /* ---------- Autres lignes de la fiche → profil ---------- */
  var GROUPES = ["sociales", "gains", "nettes"];
  function cleLib(t) { return norm(t).replace(/[^a-z0-9]+/g, " ").trim(); }
  function moisV(v, m) { return v.mois && v.mois.annee ? OC.cleMois(v.mois.annee, v.mois.mois - 1) : OC.cleMois(m.getFullYear(), m.getMonth()); }
  /* Lignes retenues ({ libelle, montant, groupe }) : une ligne du même nom en vigueur ce mois-là change de montant à partir
     du mois de la fiche (lignes datées) ; une nouvelle ligne vaut pour tous les mois ; un prêt devient un crédit du profil. */
  function autresLignes(v, ch, pr, m) {
    /* v.autres : lignes cochées à l'écran de vérification ; ch.autres / ch.credit : cases de l'aperçu avant → après. */
    var choisies = (v.autres || []).filter(function (x) { return x && x.montant > 0 && x.libelle && (x.groupe === "credit" ? ch.credit : ch.autres); });
    if (!choisies.length) return {};
    var cle = moisV(v, m), lf = OC.normaliser({ lignesFiche: pr.lignesFiche }).lignesFiche, change = false, n = 0;
    var credits = (pr.credits || []).map(function (c) { return Object.assign({}, c); }), nC = 0, nomC = "";
    choisies.forEach(function (x) {
      var montant = Math.round(x.montant * 1000) / 1000;
      if (x.groupe === "credit") {
        var deja = credits.some(function (c) { return Math.abs((c.mensualite || 0) - montant) < 0.0005 || cleLib(c.libelle) === cleLib(x.libelle); });
        if (!deja) { credits.push({ libelle: x.libelle, type: "autre", mensualite: montant }); nC++; nomC = x.libelle; }
        return;
      }
      if (GROUPES.indexOf(x.groupe) === -1) return;
      var l = lf[x.groupe], i = l.findIndex(function (y) { return cleLib(y.libelle) === cleLib(x.libelle) && OC.ligneActive(y, cle); });
      if (i >= 0) {
        if (Math.abs(l[i].montant - montant) < 0.0005) return;
        lf[x.groupe] = OC.ficheChanger(l, i, montant, cle);
      } else {
        if (l.length >= OC.MAX_LIGNES_FICHE) return;
        l.push({ libelle: x.libelle, montant: montant, debut: "", fin: "" });
      }
      change = true; n++;
    });
    return { lignesFiche: change ? lf : null, nLignes: n, credits: nC ? credits : null, nCredits: nC, nomCredit: nomC };
  }
  /* Impôt aligné : IRPP et CSS de la fiche, pour le brut d'un mois habituel du profil (après mise à jour). Pas repris si
     la fiche est celle d'un mois inhabituel (brut différent : prime, rappel…). */
  function brutHabituel(pr, partiel) {
    try { return OC.salaire(OC.normaliser(Object.assign({}, pr, partiel, { impotFiche: {} }))).brutMensuel; } catch (e) { return 0; }
  }
  function impotAligne(v, ch, pr, partiel) {
    if (!ch.impot || !(v.irpp > 0) || !(v.brut > 0)) return null;
    var b = brutHabituel(pr, partiel || {});
    if (Math.abs(b - v.brut) > TOLERANCE) return null;
    var f = { actif: true, irpp: Math.round(v.irpp * 1000) / 1000, css: Math.round((v.css || 0) * 1000) / 1000, brut: b };
    /* Impôt de la fiche égal à celui d'Orbite (au millime près) : rien à aligner. */
    try {
      var al = OC.salaire(OC.normaliser(Object.assign({}, pr, partiel || {}, { impotFiche: f }))).impotAligne;
      if (al && Math.abs(al.ecart) < 0.0015) return null;
    } catch (e) { /* calcul impossible : on garde la proposition */ }
    var a = pr.impotFiche || {};
    return a.actif && Math.abs(a.irpp - f.irpp) < 0.0005 && Math.abs(a.css - f.css) < 0.0005 && Math.abs(a.brut - f.brut) < 0.0005 ? null : f;
  }
  /* Net d'Orbite une fois le profil mis à jour, comparé au net de la fiche (prêts retenus sur la paie remis). */
  function netApres(v, partiel, profil, credits) {
    try {
      var n = OC.salaire(OC.normaliser(Object.assign({}, profil, partiel))).netMensuel;
      var fiche = v.net != null ? v.net + (credits || 0) : null;
      return { orbite: n, fiche: fiche, egal: fiche != null && Math.abs(n - fiche) <= TOLERANCE };
    } catch (e) { return null; }
  }

  /* Avant → après pour l'écran de contrôle (maquette validée le 13 oct. 2026) : une ligne par réglage repris de la fiche,
     avec la valeur du profil, celle de la fiche et « inchangé » quand elles concordent. Même logique que appliquer(). */
  function apercu(v, profil, maintenant) {
    var m = maintenant || new Date(), pr = profil || {}, L = [];
    if (v.brut > 0) {
      var pc = profilDeControle(v, pr);
      var mo = v.mois && v.mois.mois ? v.mois.mois : m.getMonth() + 1, an = v.mois && v.mois.annee ? v.mois.annee : m.getFullYear();
      var base = Math.round(pc.montant * 1000) / 1000, hist = pr.historiqueSalaire || [];
      var ev = hist.length ? OC.salaireEnVigueur(pr, an, mo - 1) : { montant: pr.montant, sens: pr.sens, periode: pr.periode };
      var egal = !!ev && Math.abs(ev.montant - base) < 0.0005 && ev.sens === "brut" && ev.periode === "mensuel";
      var avant = ev && ev.montant > 0 ? dt(ev.montant) + " DT " + (ev.sens === "net" ? "net" : "brut") + (ev.periode === "annuel" ? " par an" : "") : "non renseigné";
      L.push({ cle: "salaire", lib: "Salaire de base brut", avant: avant, apres: dt(base) + " DT", note: egal ? "" : "depuis " + MOIS[mo - 1] + " " + an, egal: egal });
      var totA = (pr.primesImposables || 0) + (pr.primesNonCotisables || 0) + (pr.avantagesNature || 0), totN = pc.primesImposables + pc.primesNonCotisables + pc.avantagesNature;
      var pEgal = !["primesImposables", "primesNonCotisables", "avantagesNature", "indemnitesNonImposables"].some(function (k) { return Math.abs((pr[k] || 0) - pc[k]) >= 0.0005; });
      L.push({ cle: "primes", lib: "Primes et avantages", avant: totA > 0 ? dt(totA) + " DT par mois" : "aucune", apres: totN > 0 ? dt(totN) + " DT par mois" : "aucune", egal: pEgal });
    }
    if (v.secteur === "public" || v.secteur === "prive") {
      var nom = function (x) { return x === "public" ? "CNRPS (public)" : "CNSS (privé)"; };
      L.push({ cle: "caisse", lib: "Caisse", avant: pr.secteur ? nom(pr.secteur) : "non renseignée", apres: nom(v.secteur), egal: v.secteur === (pr.secteur || "prive") });
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.dateEmbauche || "")) {
      var fr = function (d) { var x = d.split("-"); return x[2] + "/" + x[1] + "/" + x[0]; };
      L.push({ cle: "dateEmbauche", lib: "Date d'embauche", avant: pr.dateEmbauche ? fr(pr.dateEmbauche) : "non renseignée", apres: fr(v.dateEmbauche), egal: v.dateEmbauche === pr.dateEmbauche });
    }
    /* Autres lignes cochées à l'écran de vérification (13 oct. 2026). */
    var autres = (v.autres || []).filter(function (x) { return x.montant > 0; });
    var lignes = autres.filter(function (x) { return x.groupe !== "credit"; }), prets = autres.filter(function (x) { return x.groupe === "credit"; });
    if (lignes.length) {
      var al = autresLignes(v, { autres: true }, pr, m), tot = function (lf) { return GROUPES.reduce(function (t, g) { return t + ((lf && lf[g]) || []).filter(function (y) { return OC.ligneActive(y, moisV(v, m)); }).length; }, 0); };
      var nA = tot(OC.normaliser({ lignesFiche: pr.lignesFiche }).lignesFiche);
      L.push({ cle: "autres", lib: "Autres lignes de la fiche", avant: nA ? nA + " ligne" + (nA > 1 ? "s" : "") : "aucune",
        apres: al.lignesFiche ? tot(al.lignesFiche) + " ligne" + (tot(al.lignesFiche) > 1 ? "s" : "") : (nA ? nA + " ligne" + (nA > 1 ? "s" : "") : "aucune"), egal: !al.lignesFiche,
        note: al.lignesFiche ? "dont " + al.nLignes + " nouvelle" + (al.nLignes > 1 ? "s" : "") + " ou modifiée" + (al.nLignes > 1 ? "s" : "") : "" });
    }
    if (prets.length) {
      var ac = autresLignes(v, { credit: true }, pr, m), nb = (pr.credits || []).length;
      L.push({ cle: "credit", lib: "Crédits", avant: nb ? nb + " crédit" + (nb > 1 ? "s" : "") : "aucun", apres: ac.credits ? ac.credits.length + " crédit" + (ac.credits.length > 1 ? "s" : "") : (nb ? nb + " crédit" + (nb > 1 ? "s" : "") : "aucun"),
        egal: !ac.credits, note: ac.credits ? "+ « " + ac.nomCredit + " » " + dt(prets[0].montant) + " DT par mois" : "" });
    }
    if (v.irpp > 0) {
      /* Brut d'un mois habituel une fois le salaire et les primes de la fiche repris. */
      var p0 = appliquer(v, { salaire: true, primes: true }, pr, m).partiel;
      var ok = impotAligne(v, { impot: true }, pr, p0), a = pr.impotFiche || {}, b = brutHabituel(pr, p0);
      if (Math.abs(b - v.brut) <= TOLERANCE || ok) {
        L.push({ cle: "impot", lib: "Impôt aligné sur la fiche", avant: a.actif ? "IRPP " + dt(a.irpp) + " + CSS " + dt(a.css) : "calcul d'Orbite",
          apres: "IRPP " + dt(v.irpp) + " + CSS " + dt(v.css || 0), egal: !ok });
      }
    }
    return L;
  }

  return { norm: norm, versLignes: versLignes, montant: montant, nombres: nombres, analyser: analyser, valeurs: valeurs,
    controle: controle, appliquer: appliquer, apercu: apercu, netApres: netApres, groupeAutre: groupeAutre, MOIS: MOIS, TOLERANCE: TOLERANCE };
});
