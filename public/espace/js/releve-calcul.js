/*
 * Orbite — import du relevé bancaire (Mon mois › Budget ; point 5 du programme d'améliorations, maquette validée le 13 oct. 2026).
 * Le relevé (CSV, PDF ou photo) est lu sur l'appareil ; chaque opération est rangée dans une enveloppe du budget :
 * d'abord la mémoire « libellé → enveloppe » (les choix de l'utilisateur), puis des mots-clés tunisiens (STEG, AGIL, CARREFOUR…).
 * Seuls les totaux par enveloppe et par mois sont gardés dans le profil, avec cette mémoire et l'empreinte du relevé
 * (dates et montants hachés, sans libellé) pour ne pas l'ajouter deux fois.
 * Fonctions pures. Node : require('.../releve-calcul.js') — navigateur : window.ReleveCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.ReleveCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var ENVELOPPES = ["credits", "logement", "courses", "transport", "sante", "loisirs", "epargne", "divers"];
  var IMPORTS_MAX = 24;

  /* Mots-clés (texte sans accents, en minuscules). L'ordre compte : un prêt avant tout le reste. */
  var MOTS = [
    ["credits", /\b(pret|prets|credit|echeance|ech pret|remb pret|traite|leasing)\b/],
    ["logement", /\b(steg|sonede|loyer|syndic|ooredoo|orange|tunisie telecom|tt|topnet|globalnet|hexabyte|bee|internet|fibre|adsl|gaz)\b/],
    ["transport", /\b(agil|shell|total|totalenergies|oilibya|ola|star oil|staroil|station|carburant|essence|gasoil|parking|peage|autoroute|tunisair|nouvelair|sncft|transtu|taxi|louage|bolt|uber|yassir|garage|vidange|pneu)\b/],
    ["courses", /\b(carrefour|monoprix|magasin general|mg|geant|aziza|superette|market|supermarche|hypermarche|boulangerie|patisserie|boucherie|marche|epicerie|fruits|legumes)\b/],
    ["sante", /\b(pharmacie|pharma|clinique|hopital|labo|laboratoire|analyses|dr|docteur|medecin|dentiste|optique|opticien|kine|radiologie|cnam)\b/],
    ["loisirs", /\b(restaurant|resto|cafe|salon de the|cinema|pathe|netflix|spotify|youtube|hotel|voyage|voyages|sport|fitness|gym|club|zara|decathlon|jumia|amazon|aliexpress|cadeau|fleurs)\b/],
    ["epargne", /\b(epargne|assurance vie|cea|placement|compte epargne)\b/],
    ["divers", /\b(retrait|dab|gab|frais|commission|commissions|agios|cotisation|tenue de compte|timbre|abonnement)\b/]
  ];
  var REVENU = /\b(salaire|salaires|sal|paie|pension|retraite|allocation|bourse|prime|vir recu|virement recu|vir de|virement de|versement especes|remboursement)\b/;
  var SOLDE = /\b(solde|report)\b/, TOTAL = /\b(total|totaux|cumul|sous total)\b/;
  var STOP = /^(paiement|paiem|paie|pai|cb|carte|card|achat|ach|tpe|prlv|prelevement|prel|vir|virement|virt|retrait|dab|gab|facture|fact|ref|num|no|n|du|le|la|les|de|des|et|au|aux|en|sur|par|a|sa|sarl|suarl|ste|tunis|tunisie|com|www)$/;

  var GENERIQUE = /^(boutique|magasin|societe|station|pharmacie|restaurant|resto|cafe|librairie|superette|epicerie|boulangerie|patisserie|boucherie|clinique|cabinet|garage|hotel|agence|centre|espace|shop|store|market)$/;

  function arr(v) { return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 1000) / 1000; }
  function sansAccents(t) { return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function texteCle(t) { return " " + sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " "; }
  function deux(n) { return String(n).padStart(2, "0"); }

  /* ---------- Montants et dates ---------- */
  /** « 1 234,500 », « 1.234,500 », « -84.500 », « (60,000) », « 2 290,000 DT » → nombre signé ; NaN sinon. */
  function montant(s) {
    var t = String(s == null ? "" : s).replace(/[−–]/g, "-").replace(/[\s  ]/g, "").replace(/(dt|tnd|dinars?)$/i, "");
    var neg = /^-|-$|^\(.*\)$/.test(t);
    t = t.replace(/^[+-]|[+-]$|^\(|\)$/g, "");
    if (!/^\d[\d.,]*$/.test(t)) return NaN;
    var iP = t.lastIndexOf("."), iV = t.lastIndexOf(","), dec = Math.max(iP, iV), ent = t, frac = "";
    if (dec >= 0) {
      var sep = t.charAt(dec), autre = sep === "." ? "," : ".";
      /* Un seul séparateur répété (1.234.500) : milliers, sauf le dernier groupe s'il n'a pas 3 chiffres. */
      if (t.indexOf(autre) === -1 && t.split(sep).length > 2 && t.length - dec - 1 === 3) { ent = t.split(sep).join(""); frac = ""; }
      else { ent = t.slice(0, dec).replace(/[.,]/g, ""); frac = t.slice(dec + 1); }
    }
    if (frac.length > 3) return NaN;
    var v = Number(ent + (frac ? "." + frac : ""));
    return isFinite(v) ? (neg ? -v : v) : NaN;
  }
  /* Une cellule de PDF n'est un montant que si elle a des décimales (sinon c'est une référence, un numéro…). */
  var RE_MONTANT = /^[-+(−]?\s?\d{1,3}(?:[\s.  ]\d{3})*[.,]\d{2,3}\)?\s?-?(?:\s?(?:dt|tnd))?$|^[-+(−]?\d+[.,]\d{2,3}\)?-?$/i;
  function estMontant(c) { return RE_MONTANT.test(String(c || "").trim()) && isFinite(montant(c)); }

  var RE_DATE = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/, RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  /** « 02/10/2026 », « 02.10.26 », « 02/10 » (année donnée), « 2026-10-02 » → « 2026-10-02 » ; null sinon. */
  function date(s, annee) {
    var t = String(s == null ? "" : s).trim(), m = RE_ISO.exec(t), a, mo, j;
    if (m) { a = +m[1]; mo = +m[2]; j = +m[3]; }
    else {
      m = RE_DATE.exec(t); if (!m) return null;
      j = +m[1]; mo = +m[2]; a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : annee;
    }
    if (!(a >= 2000 && a <= 2100) || mo < 1 || mo > 12 || j < 1 || j > new Date(a, mo, 0).getDate()) return null;
    return a + "-" + deux(mo) + "-" + deux(j);
  }
  function premierMot(c) { return String(c || "").trim().split(/\s+/)[0]; }

  /* ---------- Lecture ---------- */
  /** Année des dates sans année : la plus fréquente parmi les dates complètes du relevé, sinon celle d'aujourd'hui. */
  function anneeDu(textes, maintenant) {
    var n = {}, max = 0, a = (maintenant || new Date()).getFullYear();
    textes.forEach(function (t) {
      (String(t).match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](20\d{2})\b/g) || []).forEach(function (d) { var y = d.slice(-4); n[y] = (n[y] || 0) + 1; if (n[y] > max) { max = n[y]; a = +y; } });
    });
    return a;
  }
  /* Une date sans année plus tard qu'aujourd'hui (de plus d'un mois) appartient à l'année d'avant (relevé de décembre lu en janvier). */
  function recaler(d, sansAnnee, maintenant) {
    if (!sansAnnee || !d) return d;
    var m = maintenant || new Date(), lim = new Date(m.getFullYear(), m.getMonth() + 1, m.getDate());
    var x = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    return x > lim ? (+d.slice(0, 4) - 1) + d.slice(4) : d;
  }

  /* Sens d'une opération : la variation du solde (le plus sûr), sinon la colonne, le signe, puis les mots. */
  function finaliser(ops) {
    var solde = null, r = [];
    ops.forEach(function (o) {
      /* Ligne de solde (« Solde au 01/10 ») : pas une opération, elle pose le solde de départ. */
      if (o.marqueur) { solde = o.solde; return; }
      if (o.solde != null && solde != null && Math.abs(Math.abs(o.solde - solde) - o.montant) < 0.0105) o.sens = o.solde > solde ? "credit" : "debit";
      if (!o.sens) o.sens = REVENU.test(texteCle(o.libelle)) ? "credit" : "debit";
      if (o.solde != null) solde = o.solde;
      else if (solde != null) solde = arr(solde + (o.sens === "credit" ? o.montant : -o.montant));
      if (o.montant > 0) r.push({ date: o.date, libelle: o.libelle, montant: arr(o.montant), sens: o.sens });
    });
    return r;
  }

  /**
   * Lignes reconstruites d'un PDF ou d'une photo (FicheLecture : { cellules, positions }) → opérations.
   * Les colonnes « Débit », « Crédit », « Solde » sont repérées sur la ligne d'en-tête (répétée à chaque page).
   */
  function depuisLignes(lignes, maintenant) {
    var L = (lignes || []).filter(function (l) { return l && l.cellules && l.cellules.length; });
    var annee = anneeDu(L.map(function (l) { return l.cellules.join(" "); }), maintenant);
    var cols = null, ops = [], derniere = null;
    function centre(l, i) { var p = l.positions && l.positions[i]; return p ? (p.x + p.fin) / 2 : null; }
    function colonne(l, i) {
      if (!cols) return null;
      var c = centre(l, i), meilleur = null, d = Infinity;
      if (c == null) return null;
      Object.keys(cols).forEach(function (k) { var e = Math.abs(cols[k] - c); if (e < d) { d = e; meilleur = k; } });
      return meilleur;
    }
    L.forEach(function (l) {
      var cs = l.cellules.map(function (c) { return String(c).trim(); }), bas = texteCle(cs.join(" "));
      /* En-tête de colonnes. */
      if (/\bdebit\b/.test(bas) && /\bcredit\b/.test(bas) && cs.filter(estMontant).length === 0) {
        cols = {};
        cs.forEach(function (c, i) {
          var t = texteCle(c), x = centre(l, i); if (x == null) return;
          if (/\bdebit\b/.test(t)) cols.debit = x; if (/\bcredit\b/.test(t)) cols.credit = x; if (/\bsolde\b/.test(t)) cols.solde = x;
        });
        if (!cols.debit || !cols.credit) cols = null;
        derniere = null; return;
      }
      var mot0 = premierMot(cs[0]), brute = date(mot0, annee), d = recaler(brute, brute && !/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(mot0), maintenant);
      var montants = [], textes = [];
      cs.forEach(function (c, i) {
        var reste = i === 0 && d ? c.slice(mot0.length).trim() : c;
        if (!reste) return;
        /* Date de valeur (ou deuxième date) : ignorée. */
        if (date(premierMot(reste), annee) && premierMot(reste) === reste) return;
        if (i > 0 && estMontant(reste)) montants.push({ v: montant(reste), col: colonne(l, i) });
        else textes.push(i === 0 && date(premierMot(reste), annee) ? reste.slice(premierMot(reste).length).trim() : reste);
      });
      var libelle = textes.join(" ").replace(/\s+/g, " ").trim();
      /* Ligne de solde (« Solde au 01/10 ») : elle sert à trouver le sens des opérations suivantes. */
      if (TOTAL.test(texteCle(libelle))) { derniere = null; return; }
      if (SOLDE.test(texteCle(libelle)) && montants.length) { ops.push({ marqueur: true, solde: montants[montants.length - 1].v }); derniere = null; return; }
      if (!d) {
        /* Suite du libellé de l'opération précédente (deuxième ligne). */
        if (derniere && !montants.length && libelle && libelle.length < 60 && !SOLDE.test(texteCle(libelle))) derniere.libelle = (derniere.libelle + " " + libelle).slice(0, 80);
        return;
      }
      if (!montants.length) return;
      var o = { date: d, libelle: libelle.slice(0, 80) || "Opération", montant: 0, sens: null, solde: null };
      if (cols) {
        montants.forEach(function (m) {
          if (m.col === "solde") o.solde = m.v;
          else if (!o.montant) { o.montant = Math.abs(m.v); o.sens = m.col === "credit" ? "credit" : "debit"; }
        });
        if (!o.montant && o.solde != null) return;
      } else {
        if (montants.length > 1) o.solde = montants[montants.length - 1].v;
        var m0 = montants[0].v;
        o.montant = Math.abs(m0); if (m0 < 0) o.sens = "debit";
      }
      ops.push(o); derniere = o;
    });
    return finaliser(ops);
  }

  /* ---------- CSV ---------- */
  function decouper(ligne, sep) {
    var r = [], c = "", q = false;
    for (var i = 0; i < ligne.length; i++) {
      var ch = ligne.charAt(i);
      if (q) { if (ch === '"') { if (ligne.charAt(i + 1) === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { r.push(c.trim()); c = ""; }
      else c += ch;
    }
    r.push(c.trim());
    return r;
  }
  /** Texte d'un fichier CSV (séparateur ; , ou tabulation, en-tête reconnu) → opérations. */
  function depuisCsv(texte, maintenant) {
    var lignes = String(texte || "").replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(function (l) { return l.trim(); });
    if (!lignes.length) return [];
    var echant = lignes.slice(0, 10).join("\n"), sep = [";", "\t", ","].sort(function (a, b) { return echant.split(b).length - echant.split(a).length; })[0];
    var rangs = lignes.map(function (l) { return decouper(l, sep); });
    var annee = anneeDu(lignes, maintenant), iTete = -1, col = {};
    for (var k = 0; k < Math.min(15, rangs.length) && iTete < 0; k++) {
      var t = rangs[k].map(texteCle);
      if (t.some(function (x) { return /\bdate\b/.test(x); }) && t.some(function (x) { return /\b(debit|credit|montant|amount)\b/.test(x); })) {
        iTete = k;
        t.forEach(function (x, i) {
          if (/\bdate\b/.test(x)) { if (col.date == null || /operation|op /.test(x)) col.date = col.date == null || /valeur/.test(t[col.date]) ? i : col.date; }
          else if (/\bdebit\b/.test(x) && col.debit == null) col.debit = i;
          else if (/\bcredit\b/.test(x) && col.credit == null) col.credit = i;
          else if (/\b(montant|amount)\b/.test(x) && col.montant == null) col.montant = i;
          else if (/\bsolde\b/.test(x) && col.solde == null) col.solde = i;
          else if (/\b(libelle|libell|description|operation|detail|details|motif|intitule|nature)\b/.test(x) && col.libelle == null) col.libelle = i;
        });
      }
    }
    var ops = [];
    rangs.slice(iTete + 1).forEach(function (r) {
      var cDate = col.date != null ? r[col.date] : r.filter(function (c) { return date(premierMot(c), annee); })[0];
      var brute = date(premierMot(cDate), annee); if (!brute) return;
      var d = recaler(brute, !/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d/.test(premierMot(cDate)), maintenant);
      var o = { date: d, libelle: "", montant: 0, sens: null, solde: null };
      if (col.libelle != null) o.libelle = r[col.libelle] || "";
      else o.libelle = r.filter(function (c, i) { return i !== col.date && !date(premierMot(c), annee) && !isFinite(montant(c)) && /[a-z]/i.test(c); }).join(" ");
      var db = col.debit != null ? montant(r[col.debit]) : NaN, cr = col.credit != null ? montant(r[col.credit]) : NaN;
      if (Math.abs(db) > 0) { o.montant = Math.abs(db); o.sens = "debit"; }
      else if (Math.abs(cr) > 0) { o.montant = Math.abs(cr); o.sens = "credit"; }
      else {
        var mt = col.montant != null ? montant(r[col.montant]) : r.map(montant).filter(function (v, i) { return isFinite(v) && v !== 0 && i !== col.date && /[.,]/.test(r[i]); })[0];
        if (!(Math.abs(mt) > 0)) return;
        o.montant = Math.abs(mt); o.sens = mt < 0 ? "debit" : (col.montant != null ? "credit" : null);
      }
      if (col.solde != null && isFinite(montant(r[col.solde]))) o.solde = montant(r[col.solde]);
      o.libelle = String(o.libelle).replace(/\s+/g, " ").trim().slice(0, 80) || "Opération";
      ops.push(o);
    });
    return finaliser(ops);
  }

  /* ---------- Enveloppes ---------- */
  /** Libellé → nom du commerçant pour la mémoire : premier mot significatif (« CB CARREFOUR LA MARSA 02/10 » → « CARREFOUR »). */
  function cleMarchand(libelle) {
    var mots = sansAccents(libelle).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(function (m) {
      return m.length >= 3 && !/\d/.test(m) && !STOP.test(m.toLowerCase());
    });
    /* Un mot générique (« BOUTIQUE ELYSSA », « STATION AGIL ») laisse la place au nom qui suit. */
    var nom = mots.filter(function (m) { return !GENERIQUE.test(m.toLowerCase()); })[0] || mots[0] || "";
    return nom.slice(0, 30);
  }

  /**
   * Enveloppe proposée : { cle, raison } — raison « memoire », « mot », « credit » (mensualité d'un crédit du profil),
   * « revenu » (entrée d'argent, ignorée) ou « defaut » (Divers).
   */
  function categoriser(op, memoire, credits) {
    if (op.sens === "credit") return { cle: "revenu", raison: "revenu" };
    var k = cleMarchand(op.libelle), mem = memoire || {};
    if (k && mem[k] && (ENVELOPPES.indexOf(mem[k]) !== -1 || mem[k] === "ignore")) return { cle: mem[k], raison: "memoire" };
    var t = texteCle(op.libelle);
    if ((credits || []).some(function (c) { return c && c.mensualite > 0 && Math.abs(c.mensualite - op.montant) <= 1; })) return { cle: "credits", raison: "credit" };
    for (var i = 0; i < MOTS.length; i++) if (MOTS[i][1].test(t)) return { cle: MOTS[i][0], raison: "mot" };
    return { cle: "divers", raison: "defaut" };
  }

  function cleMoisDe(d) { return d.slice(0, 7); }
  /** Mois gardés par le budget : les 12 derniers, jusqu'au mois en cours. */
  function moisGarde(cle, maintenant) {
    var m = maintenant || new Date(), fin = m.getFullYear() * 12 + m.getMonth(), x = +cle.slice(0, 4) * 12 + (+cle.slice(5, 7) - 1);
    return x <= fin && x > fin - 12;
  }

  /**
   * Totaux à ajouter : ops = [{ date, montant, sens, cle }] (cle : enveloppe, « revenu » ou « ignore »),
   * budget = budget du profil (dépenses déjà notées). Les mensualités de crédit déjà notées dans le mois
   * (bouton « Payé ») ne sont pas comptées deux fois.
   */
  function bilan(ops, budget, maintenant) {
    var b = budget || {}, deja = b.mois || {}, parMois = {}, brut = {}, n = 0, hors = 0;
    (ops || []).forEach(function (o) {
      if (o.sens !== "debit" || ENVELOPPES.indexOf(o.cle) === -1) return;
      var cm = cleMoisDe(o.date);
      if (!moisGarde(cm, maintenant)) { hors++; return; }
      brut[cm] = brut[cm] || {}; brut[cm][o.cle] = arr((brut[cm][o.cle] || 0) + o.montant); n++;
    });
    var dejaCompte = {}, parEnveloppe = {}, total = 0;
    Object.keys(brut).sort().forEach(function (cm) {
      parMois[cm] = {};
      Object.keys(brut[cm]).forEach(function (cle) {
        var v = brut[cm][cle];
        if (cle === "credits") {
          var note = (deja[cm] && deja[cm].credits) || 0;
          if (note >= v - 0.5) { dejaCompte[cm] = true; return; }
          v = arr(v - note);
        }
        parMois[cm][cle] = v; parEnveloppe[cle] = arr((parEnveloppe[cle] || 0) + v); total = arr(total + v);
      });
    });
    return { parMois: parMois, parEnveloppe: parEnveloppe, total: total, depenses: n, dejaCompte: dejaCompte, horsPeriode: hors };
  }

  /** Empreinte d'un relevé (dates, montants et sens seulement, jamais les libellés) : FNV-1a 32 bits. */
  function empreinte(ops) {
    var s = (ops || []).map(function (o) { return o.date + "|" + o.montant.toFixed(3) + "|" + o.sens; }).sort().join(";"), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8) + "-" + (ops || []).length;
  }

  /**
   * Nouveau budget : totaux ajoutés aux dépenses de chaque mois, mémoire des choix de l'utilisateur, empreinte retenue.
   * enveloppes : plan du budget à poser s'il n'était encore qu'une proposition. choix : { « CARREFOUR » : « courses » }.
   */
  function appliquer(budget, bl, choix, emp, enveloppes) {
    var b = JSON.parse(JSON.stringify(budget || {})), mois = b.mois || {};
    if ((!b.enveloppes || !b.enveloppes.length) && enveloppes) b.enveloppes = enveloppes.map(function (e) { return { cle: e.cle, libelle: e.libelle, prevu: e.prevu }; });
    Object.keys(bl.parMois).forEach(function (cm) {
      var d = mois[cm] = Object.assign({}, mois[cm] || {});
      Object.keys(bl.parMois[cm]).forEach(function (cle) { d[cle] = arr((d[cle] || 0) + bl.parMois[cm][cle]); });
    });
    b.mois = mois;
    b.memoire = Object.assign({}, b.memoire || {}, choix || {});
    b.imports = (b.imports || []).concat(emp ? [emp] : []).slice(-IMPORTS_MAX);
    return b;
  }

  /** « Relevé d'octobre 2026 » ou « Relevé du 28/09 au 05/10/2026 ». */
  function periode(ops) {
    var ds = (ops || []).map(function (o) { return o.date; }).sort();
    if (!ds.length) return "Relevé";
    var a = ds[0], z = ds[ds.length - 1], fmt = function (d, an) { return d.slice(8, 10) + "/" + d.slice(5, 7) + (an ? "/" + d.slice(0, 4) : ""); };
    if (a.slice(0, 7) === z.slice(0, 7)) { var nom = MOIS[+a.slice(5, 7) - 1]; return "Relevé " + (/^[ao]/.test(nom) ? "d'" : "de ") + nom + " " + a.slice(0, 4); }
    return "Relevé du " + fmt(a, a.slice(0, 4) !== z.slice(0, 4)) + " au " + fmt(z, true);
  }

  return { montant: montant, estMontant: estMontant, date: date, depuisLignes: depuisLignes, depuisCsv: depuisCsv, cleMarchand: cleMarchand,
    categoriser: categoriser, bilan: bilan, empreinte: empreinte, appliquer: appliquer, periode: periode, moisGarde: moisGarde,
    ENVELOPPES: ENVELOPPES, IMPORTS_MAX: IMPORTS_MAX };
});
