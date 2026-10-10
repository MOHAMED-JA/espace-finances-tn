/*
 * Orbite — rappels datés (pur, testé sous Node) : fin de l'essai, fin de l'abonnement,
 * dernière échéance d'un crédit, réduction de taux à demander (règle des 8 %), échéance fiscale de fin d'année,
 * rappels programmés par l'utilisateur (profil.rappelsPerso).
 * Chaque rappel : { id (unique, stable), titre, corps, url, quand (ISO : à partir de quand l'afficher), jusqua (ISO, facultatif) }.
 * Aucun montant précis du profil n'est mis dans les rappels transmis au service worker au-delà de ce que l'utilisateur voit déjà.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.RappelsCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var JOUR = 86400000;
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function dt(v) { return Math.round(v).toLocaleString("fr-FR") + " DT"; }
  function iso(d) { return new Date(d).toISOString(); }

  /* sy : synthèse OrbiteCalcul ; acces : mon_acces() ; fiscal : optimiseurFiscal(sy) ; m : maintenant. */
  function rappels(sy, acces, fiscal, m) {
    var maintenant = m || new Date(), t = maintenant.getTime(), liste = [];
    var a = acces || {};
    if (a.etat === "essai" && a.essai_fin) {
      var fe = Date.parse(a.essai_fin);
      if (fe > t) liste.push({ id: "essai-" + a.essai_fin.slice(0, 10), titre: "Votre essai gratuit se termine demain",
        corps: "Choisissez une formule pour garder vos calculs, vos conseils et vos simulations.", url: "/espace/#abonnement", quand: iso(fe - JOUR), jusqua: iso(fe) });
    }
    if (a.etat === "actif" && a.fin) {
      var fa = Date.parse(a.fin);
      if (fa > t) liste.push({ id: "abonnement-" + a.fin.slice(0, 10), titre: "Votre abonnement se termine dans 3 jours",
        corps: "Prolongez-le pour ne rien perdre : la nouvelle période s'ajoute à la fin de l'actuelle.", url: "/espace/#abonnement", quand: iso(fa - 3 * JOUR), jusqua: iso(fa) });
    }
    if (sy && sy.profil) {
      var p = sy.profil;
      (sy.credits || []).forEach(function (c, i) {
        var cr = p.credits[i];
        if (!cr || !(c.restantes > 0) || c.restantes > 13) return;
        /* Le mois de la dernière échéance, au 1er du mois à 9 h. */
        var d = new Date(maintenant.getFullYear(), maintenant.getMonth() + c.restantes - 1, 1, 9, 0, 0);
        var fin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        liste.push({ id: "credit-" + i + "-" + d.getFullYear() + "-" + (d.getMonth() + 1), titre: "Dernière échéance : " + cr.libelle.toLowerCase(),
          corps: "Ce mois-ci (" + MOIS[d.getMonth()] + " " + d.getFullYear() + "), " + dt(cr.mensualite) + " par mois se libèrent : votre capacité d'emprunt augmente.",
          url: "/espace/#orbite?section=marge", quand: iso(Math.max(d.getTime(), t)), jusqua: iso(fin) });
      });
    }
    /* Règle des 8 % : un mois avant la prochaine réduction de taux, rappeler de la demander à la banque. */
    if (sy && sy.profil) {
      (sy.credits || []).forEach(function (c, i) {
        var cr = sy.profil.credits[i], rt = c.reduction;
        if (!cr || !rt || !rt.applicable) return;
        var nomCr = cr.libelle.charAt(0).toLowerCase() + cr.libelle.slice(1);
        function pc(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }
        if (rt.possibleDepuis) {
          liste.push({ id: "reduction-" + i + "-depuis-" + rt.possibleDepuis.echeance, titre: "Réduction de taux à demander : " + nomCr,
            corps: "Depuis " + rt.possibleDepuis.date + ", la règle des 8 % permet de diviser votre taux par deux. Demandez-le à votre banque.",
            url: "/espace/#orbite", quand: iso(t), jusqua: iso(t + 60 * JOUR) });
          return;
        }
        var r = rt.reductions[0];
        if (!r) return;
        var d = new Date(maintenant.getFullYear(), maintenant.getMonth() + r.t, 1, 9, 0, 0);
        var avant = new Date(d.getFullYear(), d.getMonth() - 1, 1, 9, 0, 0), fin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        liste.push({ id: "reduction-" + i + "-" + d.getFullYear() + "-" + (d.getMonth() + 1), titre: "Réduction de taux le mois prochain : " + nomCr,
          corps: "En " + MOIS[d.getMonth()] + " " + d.getFullYear() + ", la règle des 8 % divise votre taux par deux (" + pc(r.tauxAvant) + " → " + pc(r.tauxPct) + "). Pensez à la demander à votre banque.",
          url: "/espace/#orbite", quand: iso(Math.max(avant.getTime(), t)), jusqua: iso(fin) });
      });
    }
    /* Rappels programmés par l'utilisateur : le 1er du mois choisi à 9 h, visibles 45 jours. */
    if (sy && sy.profil) {
      (sy.profil.rappelsPerso || []).forEach(function (r) {
        var d = new Date(r.annee, r.mois - 1, 1, 9, 0, 0), fin = d.getTime() + 45 * JOUR;
        if (fin < t) return;
        liste.push({ id: "perso-" + r.id, titre: r.titre, corps: r.corps, url: r.url, quand: iso(Math.max(d.getTime(), t)), jusqua: iso(fin) });
      });
    }
    if (fiscal && fiscal.statut === "a_optimiser" && fiscal.gainPossible > 20) {
      var an = maintenant.getFullYear();
      [[1, 31], [15, 17]].forEach(function (x) {
        var d2 = new Date(an, 11, x[0], 9, 0, 0), fin2 = new Date(an, 11, 31, 23, 59, 59);
        if (fin2.getTime() <= t) return;
        liste.push({ id: "fiscal-" + an + "-12-" + x[0], titre: "Plus que " + x[1] + " jours pour réduire votre impôt " + an,
          corps: "Jusqu'à " + dt(fiscal.gainPossible) + " d'économie avec l'assurance vie et le CEA. Versez avant le 31 décembre.",
          url: "/espace/#vie?onglet=fiscal", quand: iso(Math.max(d2.getTime(), t)), jusqua: iso(fin2) });
      });
    }
    return liste.sort(function (x, y) { return Date.parse(x.quand) - Date.parse(y.quand); });
  }

  /* Rappels à afficher maintenant (échus, non expirés, pas encore vus). */
  function aAfficher(liste, vus, m) {
    var t = (m || new Date()).getTime(), deja = vus || {};
    return (liste || []).filter(function (x) { return !deja[x.id] && Date.parse(x.quand) <= t && (!x.jusqua || Date.parse(x.jusqua) >= t); });
  }

  return { rappels: rappels, aAfficher: aAfficher };
});
