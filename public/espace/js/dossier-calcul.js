/*
 * Orbite — « Mon dossier banque » (module pur, testé sous Node). À partir de la synthèse du profil, prépare toutes les
 * données du PDF à remettre au conseiller : demandeur, revenus comptés selon la règle de la banque (net ou brut,
 * salaires et primes de l'année ÷ 12), crédits en cours, capacité, et l'effet exact du crédit demandé (facultatif) :
 * mensualité, endettement avant → après, respect de la quotité, montant maximum, échéancier par année.
 * Dossier à deux noms (mode foyer) : revenus et crédits du conjoint ajoutés, comme dans « Mon orbite ».
 * Aucun envoi : le PDF est fabriqué sur l'appareil (dossier-pdf.js).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-intelligence.js"));
  } else racine.Dossier = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence);
})(typeof self !== "undefined" ? self : this, function (OC, OI) {
  "use strict";
  var MOIS = OC.MOIS;
  var TYPES = {
    immo: { libelle: "Crédit immobilier", court: "Immobilier", dureeMois: 240, dureeMax: 300 },
    auto: { libelle: "Crédit auto", court: "Auto", dureeMois: 84, dureeMax: 84 },
    conso: { libelle: "Crédit à la consommation", court: "Consommation", dureeMois: 84, dureeMax: 84 }
  };
  var SITUATIONS = { celibataire: "Célibataire", marie: "Marié·e", divorce: "Divorcé·e", veuf: "Veuf·ve" };
  var STATUTS = { cdi: "CDI", cdd: "CDD", fonctionnaire: "Fonctionnaire titulaire", contractuel: "Contractuel", autre: "Autre contrat" };
  var TYPES_CREDIT = { immo: "Immobilier", auto: "Auto", conso: "Consommation", autre: "Autre" };

  function nombre(v, def, min, max) { var n = Number(v); return v === "" || v == null || !isFinite(n) ? def : Math.min(max, Math.max(min, n)); }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function dateFr(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  function moisAnnee(d) { return MOIS[d.getMonth()] + " " + d.getFullYear(); }

  /* Taux proposé pour un type : celui retenu par Orbite (choisi, crédit en cours du même type, ou marché). */
  function tauxPropose(sy, type) { var t = OC.tauxNouveaux(sy.profil)[type]; return t ? t.tauxPct : null; }

  /* Demande lue et bornée ; null si aucun crédit précis (dossier « capacité seule »). */
  function lireDemande(d, sy) {
    if (!d || !TYPES[d.type]) return null;
    var ty = TYPES[d.type];
    var montant = nombre(d.montant, 0, 0, 1e8);
    if (!(montant > 0)) return null;
    var taux = nombre(d.tauxPct, tauxPropose(sy, d.type), 0, 30);
    return { type: d.type, montant: montant, dureeMois: Math.round(nombre(d.dureeMois, ty.dureeMois, 1, ty.dureeMax)), tauxPct: taux, objet: texte(d.objet, 60) };
  }

  /* Échéancier à annuités constantes, regroupé par année de crédit. */
  function echeancierAnnuel(capital, tauxPct, n) {
    var m = OC.mensualitePourCapital(capital, tauxPct, n), i = tauxPct / 1200, reste = capital, lignes = [], interets = 0;
    for (var a = 0; a * 12 < n; a++) {
      var cap = 0, int = 0;
      for (var k = 0; k < 12 && a * 12 + k < n; k++) {
        var ik = reste * i, ck = Math.min(reste, m - ik);
        int += ik; cap += ck; reste -= ck;
      }
      interets += int;
      lignes.push({ annee: a + 1, capital: cap, interets: int, reste: Math.max(0, reste) });
    }
    return { mensualite: m, lignes: lignes, interets: interets, coutTotal: capital + interets };
  }

  /* Pièces habituellement demandées (indicatif : chaque banque fixe sa liste). */
  function pieces(p, demande, deuxNoms) {
    var l = ["Carte d'identité nationale"];
    if (p.activite === "retraite") l.push("Attestation de pension (" + (p.caissePension === "cnrps" ? "CNRPS" : "CNSS") + ") et 3 derniers relevés de pension");
    else l.push("3 dernières fiches de paie", "Attestation de travail récente", "Attestation de salaire ou de domiciliation du salaire");
    l.push("Relevés de compte des 3 à 6 derniers mois");
    if (p.credits.some(function (c) { return c.mensualite > 0 && !OC.creditTermine(c); })) l.push("Tableaux d'amortissement des crédits en cours");
    if (demande && demande.type === "immo") l.push("Promesse de vente ou compromis, et certificat de propriété du bien");
    else if (demande && demande.type === "auto") l.push("Facture pro forma du concessionnaire");
    else if (demande) l.push("Devis ou facture pro forma de l'objet financé");
    if (deuxNoms) l.push("Les mêmes pièces pour le co-emprunteur");
    return l;
  }

  /* Référence stable du dossier pour une journée et un profil donnés. */
  function reference(sy, demande, m) {
    var cle = [sy.profil.nom, sy.profil.prenom, Math.round(sy.salaire.brutMensuel), demande ? demande.montant + demande.type + demande.dureeMois : "cap"].join("|");
    var h = 0;
    for (var i = 0; i < cle.length; i++) h = (h * 31 + cle.charCodeAt(i)) >>> 0;
    var j = m.getFullYear() + ("0" + (m.getMonth() + 1)).slice(-2) + ("0" + m.getDate()).slice(-2);
    return "DB-" + j + "-" + ("0000" + (h % 1679616).toString(36).toUpperCase()).slice(-4);
  }

  /*
   * sy : synthèse d'OrbiteCalcul ; demande : { type, montant, dureeMois, tauxPct, objet } ou null ;
   * options : { deuxNoms } ; maintenant : date du jour (tests).
   */
  function construire(sy, demande0, options, maintenant) {
    var o = options || {}, m = maintenant || sy.maintenant || new Date();
    var p = sy.profil, s = sy.salaire, b = p.baseBanque, cap = sy.capacite[b];
    var annuel = p.revenuBanque === "annuel", retraite = p.activite === "retraite";
    var q = b === "brut" ? p.quotiteBrut : p.quotiteNet;
    var fo = o.deuxNoms && OI ? OI.foyer(sy) : null;
    var demande = lireDemande(demande0, sy);

    /* Crédits en cours (terminés et vides exclus) ; capital restant estimé s'il n'est pas saisi. */
    var credits = [];
    p.credits.forEach(function (c, i) {
      if (!(c.mensualite > 0) || OC.creditTermine(c)) return;
      var info = sy.credits[i] || {}, reste = c.capitalRestant, estime = false;
      if (!(reste > 0) && c.tauxPct > 0 && c.moisRestants > 0) { reste = OC.capitalPourMensualite(c.mensualite, c.tauxPct, c.moisRestants); estime = true; }
      credits.push({ libelle: c.libelle, type: c.type, typeLibelle: TYPES_CREDIT[c.type], mensualite: c.mensualite, capitalRestant: reste || 0, estime: estime,
        tauxPct: c.tauxPct || null, fin: info.fin || null });
    });
    var totalMensualites = sy.chargesCredits, totalReste = credits.reduce(function (t, c) { return t + c.capitalRestant; }, 0);

    /* Revenu retenu et charges : seul, ou à deux noms (revenus additionnés, crédits des deux déduits). */
    var revenu = fo ? fo.revenuBanque : cap.revenu;
    var charges = fo ? totalMensualites + p.conjointCredits : totalMensualites;
    var plafond = revenu * q, disponible = Math.max(0, plafond - charges);
    var ageMois = Math.max(0, (OC.AGE_MAX - sy.age) * 12);

    var res = {
      reference: reference(sy, demande, m),
      date: m, dateTexte: m.getDate() + " " + MOIS[m.getMonth()] + " " + m.getFullYear(),
      base: b, quotite: q, annuel: annuel, retraite: retraite, deuxNoms: !!fo,
      /* Parties facultatives du PDF (toutes présentes par défaut). */
      options: { echeancier: o.echeancier !== false, paliers: o.paliers !== false, pieces: o.pieces !== false },
      coordonnees: o.coordonnees !== false,
      banque: p.banque || "",
      demandeur: {
        nom: [p.prenom, p.nom].filter(Boolean).join(" "),
        dateNaissance: dateFr(p.dateNaissance), age: sy.age,
        situation: SITUATIONS[p.situation] + ", " + p.enfants + (p.enfants > 1 ? " enfants" : " enfant") + " à charge",
        contrat: retraite ? "Retraité·e (" + (p.caissePension === "cnrps" ? "CNRPS" : "CNSS") + ")" : STATUTS[p.statut] + " · secteur " + (p.secteur === "public" ? "public" : "privé"),
        employeur: retraite ? "" : texte(p.employeur, 60), poste: retraite ? "" : texte(p.poste, 60),
        dateEmbauche: retraite ? "" : dateFr(p.dateEmbauche), anciennete: retraite || !p.dateEmbauche ? null : p.anciennete,
        telephone: p.telephone ? OC.formatTelephone(p.telephone) : "", email: p.emailContact || ""
      },
      revenus: {
        brutMensuel: s.brutMensuel, netMensuel: s.netMensuel, nombreSalaires: retraite ? 12 : p.nombreSalaires,
        brutAnnuel: s.brutAnnuel, netAnnuel: s.netAnnuel, autres: p.autresRevenus,
        retenu: cap.revenu,
        regle: (b === "brut" ? "Brut" : "Net") + (annuel ? " de l'année ÷ 12" : " du mois") + (p.autresRevenus > 0 ? " + autres revenus" : ""),
        hausses: (sy.futursRevenu || []).map(function (f) {
          var d = new Date(m.getFullYear(), m.getMonth() + f.mois, 1);
          return { date: moisAnnee(d), brutMensuel: f.brutMensuel, netMensuel: f.netMensuel };
        })
      },
      conjoint: fo ? { prenom: fo.prenom, netMensuel: fo.conjoint.netMensuel, brutMensuel: fo.conjoint.brutMensuel, retenu: fo.conjoint.revenuBanque, credits: fo.conjoint.credits } : null,
      credits: credits, totalMensualites: totalMensualites, totalReste: totalReste,
      loyer: p.loyer,
      capacite: { revenu: revenu, quotite: q, plafond: plafond, charges: charges, disponible: disponible, endettement: revenu > 0 ? charges / revenu : 0 },
      /* Montant maximum par type avec la mensualité disponible (durée limitée par l'âge de fin, 70 ans). */
      maxParType: ["immo", "auto", "conso"].map(function (t) {
        var n = Math.min(TYPES[t].dureeMois, ageMois), tx = tauxPropose(sy, t);
        return { type: t, libelle: TYPES[t].court, tauxPct: tx, dureeMois: n, capital: OC.capitalPourMensualite(disponible, tx, n) };
      }),
      demande: null,
      paliers: [],
      pieces: pieces(p, demande, !!fo)
    };

    if (demande) {
      var e = echeancierAnnuel(demande.montant, demande.tauxPct, demande.dureeMois);
      var apres = charges + e.mensualite;
      res.demande = {
        type: demande.type, typeLibelle: TYPES[demande.type].libelle, court: TYPES[demande.type].court, objet: demande.objet,
        montant: demande.montant, dureeMois: demande.dureeMois, tauxPct: demande.tauxPct,
        mensualite: e.mensualite, interets: e.interets, coutTotal: e.coutTotal, echeancier: e.lignes,
        endettementAvant: res.capacite.endettement, endettementApres: revenu > 0 ? apres / revenu : 1,
        respecte: apres <= plafond + 1e-6,
        depassement: Math.max(0, apres - plafond),
        capitalMax: OC.capitalPourMensualite(disponible, demande.tauxPct, Math.min(demande.dureeMois, ageMois)),
        /* La banque limite en général la fin du crédit à 70 ans. */
        ageFin: sy.age + Math.ceil(demande.dureeMois / 12), dureeTropLongue: demande.dureeMois > ageMois
      };
    }

    /* Capacité dans le temps (seul) : aujourd'hui, puis chaque étape où des crédits se terminent ou le salaire augmente. */
    if (!fo) {
      res.paliers.push({ date: "Aujourd'hui", evenement: credits.length ? credits.length + (credits.length > 1 ? " crédits en cours" : " crédit en cours") : "Aucun crédit en cours", disponible: disponible });
      (cap.paliers || []).forEach(function (x) {
        var ev = OC.evenementEtape(x);
        res.paliers.push({ date: x.date.charAt(0).toUpperCase() + x.date.slice(1), evenement: ev.charAt(0).toUpperCase() + ev.slice(1), disponible: x.mensualiteMax });
      });
    }
    return res;
  }

  return { TYPES: TYPES, construire: construire, echeancierAnnuel: echeancierAnnuel, tauxPropose: tauxPropose, lireDemande: lireDemande };
});
