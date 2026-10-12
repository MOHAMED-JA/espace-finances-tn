/*
 * Orbite — reconnaître un document reçu par « Partager » (Lot 2) : fiche de paie, tableau d'amortissement ou offre de banque.
 * Fonction pure (texte lu sur l'appareil + nom du fichier), testée sous Node. Chaque indice ajoute des points ;
 * un tableau se reconnaît surtout à ses lignes « date + plusieurs montants ». Sous 3 points : on demande à la personne.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.RecevoirCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var TYPES = {
    fiche: { titre: "Fiche de paie", action: "Contrôler ma fiche de paie" },
    tableau: { titre: "Tableau d'amortissement", action: "Contrôler le tableau de ma banque" },
    offre: { titre: "Offre de crédit", action: "Lire l'offre de la banque" }
  };
  var INDICES = {
    fiche: [/bulletin de (paie|salaire)/, /fiche de paie/, /salaire de base/, /net (à|a) payer/, /\bcnss\b|\bcnrps\b/, /matricule/, /\birpp\b|imp(ô|o)t sur le revenu/, /cotisations? (salariales?|patronales?)/, /cong(é|e)s? pay(é|e)s?/, /contribution sociale de solidarit/, /brut (imposable|mensuel)/, /كشف الأجر|الأجر الصافي/],
    tableau: [/tableau d'amortissement/, /(é|e)ch(é|e)ancier/, /capital restant( d(û|u))?/, /amortissement/, /int(é|e)r(ê|e)ts?/, /n(°|o)\s*(é|e)ch(é|e)ance/, /jadwal|جدول الاستهلاك/],
    offre: [/offre (de|d') ?(pr(ê|e)t|cr(é|e)dit|financement)/, /proposition (de|d') ?(pr(ê|e)t|cr(é|e)dit|financement)/, /accord de principe/, /simulation (de|d') ?(pr(ê|e)t|cr(é|e)dit)/, /dur(é|e)e du (pr(ê|e)t|cr(é|e)dit)/, /frais de dossier/, /taux (fixe|variable|nominal|effectif global)|\bteg\b/, /montant (du|de votre) (pr(ê|e)t|cr(é|e)dit|financement)/, /\btmm\b/]
  };
  var DATE = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b(0?[1-9]|1[0-2])[\/.\-](19|20)\d{2}\b/;
  var MONTANT = /\d{1,3}(?:[ .  ]\d{3})*[,.]\d{2,3}\b|\b\d{2,}[,.]\d{3}\b/g;

  function classer(texte, nom) {
    var t = String(texte || "").toLowerCase(), n = String(nom || "").toLowerCase();
    var pts = { fiche: 0, tableau: 0, offre: 0 }, raisons = { fiche: [], tableau: [], offre: [] };
    Object.keys(INDICES).forEach(function (k) {
      INDICES[k].forEach(function (re) { var m = re.exec(t); if (m) { pts[k] += 1; raisons[k].push(m[0]); } });
    });
    /* Lignes d'échéance : une date et au moins trois montants. */
    var lignesEch = t.split(/\n/).filter(function (l) { return DATE.test(l) && (l.match(MONTANT) || []).length >= 3; }).length;
    if (lignesEch >= 6) { pts.tableau += 4; raisons.tableau.push(lignesEch + " lignes d'échéance"); }
    else if (lignesEch >= 3) { pts.tableau += 2; raisons.tableau.push(lignesEch + " lignes d'échéance"); }
    /* Une offre cite des taux mais n'a pas de lignes d'échéance : sans elles, « intérêts » ou « amortissement » pèsent moins. */
    if (lignesEch < 3 && pts.tableau > 0) pts.tableau = Math.max(0, pts.tableau - 1);
    /* Nom du fichier : un indice de plus. */
    if (/paie|salaire|bulletin|payslip/.test(n)) { pts.fiche += 2; raisons.fiche.push("nom du fichier"); }
    if (/amorti|echeanc|échéanc|tableau/.test(n)) { pts.tableau += 2; raisons.tableau.push("nom du fichier"); }
    if (/offre|proposition|simulation|devis/.test(n)) { pts.offre += 2; raisons.offre.push("nom du fichier"); }
    var ordre = Object.keys(pts).sort(function (a, b) { return pts[b] - pts[a]; });
    var premier = ordre[0], second = ordre[1];
    var type = pts[premier] >= 3 && pts[premier] > pts[second] ? premier : null;
    return { type: type, points: pts, raisons: type ? raisons[type] : [], sur: type ? (pts[premier] - pts[second] >= 3 ? "sur" : "probable") : null };
  }
  return { classer: classer, TYPES: TYPES };
});
