/*
 * Orbite — règles d'affichage de l'abonnement (pur, testé sous Node).
 * Les prix et l'état d'accès viennent TOUJOURS du serveur (table formules, fonction mon_acces) :
 * ce module ne fait que les présenter (prix par mois, réduction, mois offerts, jours restants).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.AbonnementCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var JOUR = 86400000;
  /* Vues accessibles sans abonnement actif : le profil, le compte et la page d'abonnement. */
  var VUES_LIBRES = ["profil", "compte", "abonnement", "admin"];

  function dt(millimes) { return Math.round(millimes) / 1000; }

  /* Offres présentées : la formule la plus longue est mise en avant et présélectionnée. */
  function offres(formules) {
    var liste = (formules || []).filter(function (f) { return f && f.mois > 0 && f.prix_millimes > 0; })
      .slice().sort(function (a, b) { return a.mois - b.mois; });
    if (!liste.length) return [];
    var reference = liste[0];
    var prixMoisRef = reference.prix_millimes / reference.mois;
    var plusLongue = liste[liste.length - 1];
    return liste.map(function (f) {
      var prixMois = f.prix_millimes / f.mois;
      var sansRemise = prixMoisRef * f.mois;
      var economie = Math.max(0, sansRemise - f.prix_millimes);
      return {
        cle: f.cle,
        libelle: f.libelle,
        mois: f.mois,
        prix: dt(f.prix_millimes),
        prixMois: Math.round(prixMois) / 1000,
        reductionPct: f === reference ? 0 : Math.round((1 - prixMois / prixMoisRef) * 100),
        economie: dt(economie),
        moisOfferts: f === reference ? 0 : Math.floor(economie / prixMoisRef + 1e-9),
        recommandee: f === plusLongue && liste.length > 1
      };
    });
  }

  function joursRestants(finIso, maintenantIso) {
    if (!finIso) return 0;
    var reste = Date.parse(finIso) - Date.parse(maintenantIso || new Date().toISOString());
    return reste > 0 ? Math.ceil(reste / JOUR) : 0;
  }

  /* Résumé de l'état d'accès pour l'interface. */
  function resume(acces) {
    var a = acces || {};
    var etat = ["essai", "actif", "offert", "expire"].indexOf(a.etat) === -1 ? "inconnu" : a.etat;
    var jours = etat === "essai" ? joursRestants(a.essai_fin, a.maintenant) : etat === "actif" ? joursRestants(a.fin, a.maintenant) : 0;
    var libelle = {
      essai: "Essai gratuit · " + (jours <= 1 ? "dernier jour" : jours + " jours restants"),
      actif: "Abonné" + (jours <= 7 ? " · " + jours + " j restants" : ""),
      offert: "Accès offert",
      expire: "Essai terminé",
      inconnu: ""
    }[etat];
    return {
      etat: etat,
      jours: jours,
      libelle: libelle,
      bloque: etat === "expire",
      /* Pastille visible pendant l'essai, à l'expiration, et à moins de 7 jours de la fin. */
      pastille: etat === "essai" || etat === "expire" || (etat === "actif" && jours <= 7),
      urgent: etat === "expire" || (etat === "essai" && jours <= 1) || (etat === "actif" && jours <= 3)
    };
  }

  function vueAutorisee(vue, acces) {
    return !resume(acces).bloque || VUES_LIBRES.indexOf(vue) !== -1;
  }

  /* Adresse de paiement renvoyée par le serveur : https ou chemin du site uniquement. */
  function adressePaiementSure(url) {
    if (typeof url !== "string" || url.length > 2000) return null;
    if (/^https:\/\/[^\s]+$/i.test(url)) return url;
    if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
    return null;
  }

  var REFERENCE = /^ORB-\d{8}-[A-Z0-9]{8}$/;

  return { offres: offres, joursRestants: joursRestants, resume: resume, vueAutorisee: vueAutorisee,
    adressePaiementSure: adressePaiementSure, REFERENCE: REFERENCE, VUES_LIBRES: VUES_LIBRES };
});
