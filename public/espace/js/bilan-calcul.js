/*
 * Orbite — bilan annuel en PDF (Ma progression › Mon année ; point 7 du programme d'améliorations, maquette validée le 13 oct. 2026).
 * Une page (ou deux) à garder ou à remettre à son conseiller : revenus et impôt, crédits et capacité, épargne et patrimoine,
 * score de santé et conseils, coordonnées (seulement si l'utilisateur les coche). Ce module prépare les chiffres (pur, testé) ;
 * bilan-pdf.js les met en page avec jsPDF, sur l'appareil.
 * Node : require('.../bilan-calcul.js') — navigateur : window.BilanCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-intelligence.js"), require("./annee-calcul.js"), require("./decider-calcul.js"));
  } else racine.BilanCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.Annee, racine.DeciderCalcul);
})(typeof self !== "undefined" ? self : this, function (OC, OI, AN, DC) {
  "use strict";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var SECTIONS = ["revenus", "credits", "patrimoine", "sante", "coordonnees"];
  var PAR_DEFAUT = { revenus: true, credits: true, patrimoine: true, sante: true, coordonnees: false };
  var TYPES = { immo: "Immobilier", auto: "Auto", conso: "Consommation", autre: "Autre" };
  var CAPA = { immo: "Immobilier", immo25: "Immobilier sur 25 ans", auto: "Auto", conso: "Consommation" };

  function arr(v) { return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 1000) / 1000; }
  function choisies(o) { var r = {}; SECTIONS.forEach(function (k) { r[k] = o && typeof o[k] === "boolean" ? o[k] : PAR_DEFAUT[k]; }); return r; }
  function jour(d) { return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }

  /**
   * p0 : profil ; donnees : { versements, objectifs } (Ma progression) ; sections : { revenus, credits, patrimoine, sante, coordonnees } ;
   * contact : { email } (adresse du compte, seulement avec les coordonnées).
   */
  function construire(p0, donnees, maintenant, sections, contact) {
    var m = maintenant || new Date(), s = choisies(sections), p = OC.normaliser(p0 || {});
    var an = AN.bilan(p, donnees || {}, m), per = AN.periode(m);
    var sy = OC.synthese(p, {}, per.complete ? per.fin : m);
    var carte = function (id) { return an.cartes.filter(function (c) { return c.id === id; })[0]; };
    var sal = (carte("salaire") || {}).salaire, pa = (carte("pouvoir") || {}).pouvoir, cr = (carte("credits") || {}).credits, ep = (carte("epargne") || {}).epargne;
    var sc = OI.scoreSante(sy, { maintenant: m });
    var r = {
      annee: an.annee, complete: an.complete, periode: an.complete ? "Année " + an.annee : "Janvier à " + an.fin + " " + an.annee,
      date: jour(m), sections: s,
      cles: { net: sal ? arr(sal.net) : 0, impot: sal ? arr(sal.impot) : 0, score: sc.score, niveau: sc.niveau }
    };
    if (s.revenus && sal) {
      r.revenus = {
        brut: arr(sal.brut), net: arr(sal.net), impot: arr(sal.impot), cotisations: arr(sal.cotisations), pourVous: sal.pourVous,
        netMensuel: arr(sy.salaire.netMensuel), brutMensuel: arr(sy.salaire.brutMensuel), salaires: p.nombreSalaires,
        tauxMoyen: sal.brut > 0 ? sal.impot / sal.brut : 0,
        hausses: sal.hausses.map(function (h) { return { mois: MOIS[h.mois], net: arr(h.net), brut: arr(h.brut) }; }),
        pouvoir: pa ? { evolution: pa.evolution, inflation: pa.inflation, gain: pa.gain, provisoire: pa.provisoire } : null,
        impotFiche: !!(p.impotFiche && p.impotFiche.actif)
      };
    }
    if (s.credits) {
      var cap = sy.capacite[p.baseBanque] || sy.capacite.net, pat = DC.patrimoine(sy);
      var restes = {}, fins = {};
      pat.passifs.forEach(function (x) { restes[x.libelle] = x; });
      pat.jalons.forEach(function (j) { if (j.cle === "credit") fins[j.libelle] = j.mois + " " + j.annee; });
      r.credits = {
        liste: (p.credits || []).filter(function (c) { return c.mensualite > 0; }).map(function (c) {
          var e = OC.echeancier(c, m), rd = restes[c.libelle || ""];
          return { libelle: c.libelle || TYPES[c.type] || "Crédit", type: TYPES[c.type] || "Autre", mensualite: arr(c.mensualite), tauxPct: c.tauxPct || 0,
            restantes: e ? e.restantes : (c.moisRestants > 0 ? c.moisRestants : null), fin: e && e.restantes > 0 ? e.fin : (c.moisRestants > 0 ? finDans(m, c.moisRestants) : fins[c.libelle || ""] || null), resteDu: rd ? arr(rd.montant) : null, estime: rd ? !!rd.estime : false };
        }),
        annee: cr ? { capital: arr(cr.capital), interets: arr(cr.interets), soldes: cr.soldes.map(function (c) { return c.libelle || TYPES[c.type] || "Crédit"; }) } : null,
        charges: arr(sy.chargesCredits), endettement: cap.tauxEndettementActuel, base: p.baseBanque,
        quotite: p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet, mensualiteMax: arr(Math.max(0, cap.mensualiteMax || 0)),
        capacite: (cap.credits || []).filter(function (x) { return CAPA[x.cle]; }).map(function (x) { return { type: CAPA[x.cle], capital: arr(Math.max(0, x.capital || 0)), dureeMois: x.dureeMois, tauxPct: x.tauxPct }; })
      };
    }
    if (s.patrimoine) {
      var pt = DC.patrimoine(sy);
      r.patrimoine = {
        net: arr(pt.net), actifs: pt.actifs.map(function (x) { return { libelle: x.libelle, montant: arr(x.montant) }; }),
        passifs: pt.passifs.map(function (x) { return { libelle: x.libelle, montant: arr(x.montant), estime: !!x.estime }; }),
        totalActifs: arr(pt.totalActifs), totalPassifs: arr(pt.totalPassifs), parMois: arr(pt.parMois), logementSaisi: pt.logementSaisi,
        epargneAnnee: ep ? { contrats: arr(ep.contrats), av: arr(ep.av), cea: arr(ep.cea), objectifs: arr(ep.objectifs), impotEvite: arr(ep.impotEvite) } : null
      };
    }
    if (s.sante) {
      r.sante = {
        score: sc.score, niveau: sc.niveau,
        composantes: sc.composantes.map(function (c) { return { libelle: c.libelle, points: c.points, max: c.max, detail: c.detail }; }),
        conseils: (sy.conseils || []).slice(0, 4).map(function (c) { return { titre: c.titre, texte: c.texte }; })
      };
    }
    if (s.coordonnees) {
      r.coordonnees = {
        nom: [p.prenom, p.nom].filter(Boolean).join(" "), email: (contact && contact.email) || p.emailContact || "",
        telephone: p.telephone ? OC.formatTelephone(p.telephone) : "",
        employeur: p.employeur || "", poste: p.poste || "", dateEmbauche: p.dateEmbauche || ""
      };
    }
    return r;
  }

  /* Dernière échéance quand il en reste n (la première est celle du mois en cours). */
  function finDans(m, n) { var d = new Date(m.getFullYear(), m.getMonth() + n - 1, 1); return MOIS[d.getMonth()] + " " + d.getFullYear(); }

  function nomFichier(b) { return "bilan-orbite-" + b.annee + ".pdf"; }

  return { construire: construire, nomFichier: nomFichier, SECTIONS: SECTIONS, PAR_DEFAUT: PAR_DEFAUT };
});
