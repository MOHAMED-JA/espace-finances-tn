/*
 * Orbite — accueil « scroll-cinéma » (lot 5) : chiffres du voyage d'un salaire et des trois cas types (module pur, testé).
 * Tout est calculé par les moteurs d'Orbite, jamais écrit en dur ; les profils sont définis par rapport à la date du jour
 * (âges, ancienneté, crédits) pour que les exemples ne vieillissent pas. Personnes fictives, marquées « Exemple ».
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("../espace/js/orbite-calcul.js"), require("../espace/js/orbite-intelligence.js"),
      require("../espace/js/retraite-calcul.js"), require("../espace/js/progression-calcul.js"));
  } else racine.RecitCalcul = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.Retraite, racine.Progression);
})(typeof self !== "undefined" ? self : this, function (OC, OI, RT, PG) {
  "use strict";
  var MOIS = OC.MOIS;
  function iso(y, m, d) { return y + "-" + String(m).padStart(2, "0") + "-" + String(d || 1).padStart(2, "0"); }
  function profil(p) { return OC.normaliser(Object.assign(OC.profilParDefaut(), p)); }
  function fiscal(sy, m) { try { return OI.optimiseurFiscal(sy, { maintenant: m }); } catch (e) { return null; } }
  function capImmo(cap) { var c = (cap.credits || []).filter(function (x) { return x.cle === "immo"; })[0]; return c ? c.capital : 0; }

  /* Profils (par rapport à l'année en cours A). */
  function profils(m) {
    var A = m.getFullYear(), M = m.getMonth() + 1;
    return {
      voyage: { montant: 2500, sens: "brut", periode: "mensuel", situation: "marie", chefDeFamille: true, enfants: 2, dateNaissance: iso(A - 36, 1), debutCarriere: iso(A - 12, 9) },
      yasmine: { prenom: "Yasmine", montant: 1900, sens: "brut", periode: "mensuel", dateNaissance: iso(A - 26, 4), loyer: 450 },
      karim: { prenom: "Karim", montant: 3800, sens: "brut", periode: "mensuel", situation: "marie", chefDeFamille: true, enfants: 2, dateNaissance: iso(A - 38, 2),
        credits: [
          /* Appartement depuis 5 ans et demi (20 ans) ; voiture dont il reste 27 mensualités. */
          { type: "immo", libelle: "Appartement", mensualite: 900, tauxPct: 8.5, dureeMois: 240, moisDebut: ((M - 1 + 12 - 7) % 12) + 1, anneeDebut: A - 5 - (M <= 7 ? 1 : 0) },
          { type: "auto", libelle: "Voiture", mensualite: 350, tauxPct: 9, dureeMois: 60, moisDebut: ((M - 1 + 12 - 33 % 12) % 12) + 1, anneeDebut: A - Math.floor(33 / 12) - (M - 1 < 33 % 12 ? 1 : 0) }
        ] },
      habib: { prenom: "Habib", montant: 3200, sens: "brut", periode: "mensuel", secteur: "public", situation: "marie", chefDeFamille: true, enfants: 1, dateNaissance: iso(A - 56, 6), debutCarriere: iso(A - 31, 9) }
    };
  }

  /* Le voyage d'un salaire : 4 chapitres. */
  function voyage(m0) {
    var m = m0 || new Date(), p = profil(profils(m).voyage), sy = OC.synthese(p, {}, m), s = sy.salaire;
    var cap = sy.capacite.net, fi = fiscal(sy, m);
    var pr = PG.projection(p, sy, { hausse: 0.05, inflation: 0.055, ans: 10 }), fin = pr[pr.length - 1];
    var ret = RT.estimer(p, sy, { maintenant: m, age: 60 });
    return {
      brut: s.brutMensuel, cotisations: s.cotisations / 12, impot: s.impotMois, net: s.netMensuel, tranche: s.tranche ? s.tranche.taux : 0,
      mensualiteMax: cap.mensualiteMax, capacite: capImmo(cap),
      versements: fi && fi.complement ? fi.complement.total : 0, gainImpot: fi ? fi.gainPossible : 0,
      anneeProjection: fin.annee, brutProjection: fin.brut, capaciteProjection: fin.capacite,
      retraite: ret.etat === "ok" ? { annee: ret.depart.getFullYear(), age: ret.age, net: ret.net, taux: ret.taux, debut: +p.debutCarriere.slice(0, 4) } : null
    };
  }

  function yasmine(m) {
    var p = profil(profils(m).yasmine), sy = OC.synthese(p, {}, m), fi = fiscal(sy, m), net = sy.salaire.netMensuel;
    return { age: OC.age(p, m), net: net, loyerPart: p.loyer / sy.budget.net, reste: sy.budget.reste, precaution: PG.ciblePrecaution(sy, p, 6), gainImpot: fi ? fi.gainPossible : 0, tranche: sy.salaire.tranche.taux };
  }
  function karim(m) {
    var p = profil(profils(m).karim), sy = OC.synthese(p, {}, m), fi = fiscal(sy, m);
    var auto = sy.credits[1], finAuto = OC.echeancier(p.credits[1], m), apres = null;
    if (finAuto && finAuto.restantes > 0) {
      var d = new Date(m.getFullYear(), m.getMonth() + finAuto.restantes, 15), sy2 = OC.synthese(p, {}, d);
      apres = { fin: finAuto.fin, endettement: sy2.budget.tauxEndettement, marge: sy2.capacite.net.mensualiteMax };
    }
    return { age: OC.age(p, m), net: sy.salaire.netMensuel, endettement: sy.budget.tauxEndettement, refus: sy.budget.tauxEndettement > p.quotiteNet,
      apres: apres, gainImpot: fi ? fi.gainPossible : 0, tranche: sy.salaire.tranche.taux, credits: auto ? 2 : 1 };
  }
  function habib(m) {
    var p = profil(profils(m).habib), sy = OC.synthese(p, {}, m);
    var e = RT.estimer(p, sy, { maintenant: m }), e65 = RT.estimer(p, sy, { maintenant: m, age: 65 });
    return { age: OC.age(p, m), net: sy.salaire.netMensuel, depuis: +p.debutCarriere.slice(0, 4),
      retraite: e.etat === "ok" ? { age: e.age, mois: MOIS[e.depart.getMonth()], annee: e.depart.getFullYear(), taux: e.taux, net: e.net, remplacement: e.remplacement } : null,
      a65: e65.etat === "ok" ? { taux: e65.taux, net: e65.net } : null };
  }
  function vies(m0) { var m = m0 || new Date(); return { yasmine: yasmine(m), karim: karim(m), habib: habib(m) }; }

  return { profils: profils, voyage: voyage, vies: vies };
});
