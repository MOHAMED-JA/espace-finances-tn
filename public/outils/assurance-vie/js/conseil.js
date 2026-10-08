/* Outils de conseil (fonctions pures) : objectif de capital, âge de retraite, revenu à la retraite,
   statistiques et sauvegarde du portefeuille. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./scenario.js'), require('./partage.js'));
  else racine.Conseil = fabrique(racine.Scenario, racine.Partage);
})(typeof self !== 'undefined' ? self : this, function (Scenario, Partage) {
  'use strict';

  var FORMAT_SAUVEGARDE = 'simulateur-av/portefeuille';

  function capitalMedian(etat, versement) {
    var c = Scenario.calculer(Object.assign({}, etat, { versement: versement }));
    return c.actif ? c.med.capitalFinal : 0;
  }

  /* Versement par période (fréquence de l'état) qui permet d'atteindre `cible` au terme, scénario médian.
     Tient compte des frais, de la hausse annuelle des versements et du réinvestissement de l'économie d'impôt.
     Renvoie null si les hypothèses de projection sont invalides. */
  function versementPourCapital(etat, cible) {
    if (Scenario.erreurHypotheses(etat)) return null;
    if (!(cible > 0)) return { versement: 0, capital: 0 };
    var bas = 0, haut = Math.max(1, cible);
    while (capitalMedian(etat, haut) < cible && haut < 1e12) haut *= 2;
    for (var n = 0; n < 80; n++) {
      var milieu = (bas + haut) / 2;
      if (capitalMedian(etat, milieu) >= cible) haut = milieu; else bas = milieu;
    }
    /* Arrondi au millime supérieur : le capital visé est atteint */
    var v = Math.ceil(haut * 1000 - 1e-7) / 1000;
    return { versement: v, capital: capitalMedian(etat, v) };
  }

  /* Durée jusqu'à la retraite : { duree } ou { erreur } */
  function dureeRetraite(ageActuel, ageDepart, dureeMax) {
    if (!(ageActuel >= 18 && ageActuel <= 75) || Math.floor(ageActuel) !== ageActuel) return { erreur: 'age' };
    if (!(ageDepart >= 40 && ageDepart <= 80) || Math.floor(ageDepart) !== ageDepart) return { erreur: 'depart' };
    var d = ageDepart - ageActuel;
    if (d < 1 || d > (dureeMax || 40)) return { erreur: 'ecart' };
    return { duree: d };
  }

  /* Revenu mensuel à la retraite : pension estimée + rente du contrat */
  function revenuRetraite(pensionMensuelle, renteMensuelle) {
    var pension = pensionMensuelle > 0 ? pensionMensuelle : 0;
    var total = pension + renteMensuelle;
    return { pension: pension, rente: renteMensuelle, total: total, partRente: total > 0 ? renteMensuelle / total * 100 : 0 };
  }

  /* Chiffres clés d'un portefeuille (résumés de Scenario.resume) */
  function statistiques(resumes) {
    var s = { nombre: resumes.length, epargneAnnuelle: 0, economieAnnuelle: 0, capitalMedian: 0, tauxMoyen: 0 };
    resumes.forEach(function (r) {
      s.epargneAnnuelle += r.investissementAnnuel || 0;
      s.economieAnnuelle += r.economie || 0;
      s.capitalMedian += r.capitalMedian || 0;
      s.tauxMoyen += r.tauxReduction || 0;
    });
    if (s.nombre) s.tauxMoyen /= s.nombre;
    return s;
  }

  /* Sauvegarde du portefeuille dans un fichier JSON */
  function exporterSauvegarde(enregistrements, maintenant) {
    return JSON.stringify({ format: FORMAT_SAUVEGARDE, version: 1, date: (maintenant || new Date()).toISOString(), simulations: enregistrements }, null, 2);
  }

  function texte(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

  /* Lit une sauvegarde : renvoie { simulations } (enregistrements vérifiés) ou { erreur }.
     Les états sont revalidés champ par champ (mêmes règles que le lien de partage). */
  function importerSauvegarde(contenu) {
    var d;
    try { d = JSON.parse(contenu); } catch (e) { return { erreur: 'format' }; }
    if (!d || d.format !== FORMAT_SAUVEGARDE || !Array.isArray(d.simulations)) return { erreur: 'format' };
    var vues = {};
    var simulations = [];
    d.simulations.forEach(function (s) {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !/^[\w-]{1,40}$/.test(s.id) || vues[s.id]) return;
      if (!s.etat || typeof s.etat !== 'object') return;
      var etat = Object.assign(Scenario.defauts(), Partage.decoder(Partage.encoder(s.etat)));
      if (!(etat.revenu > 0)) return;
      vues[s.id] = true;
      var horodatage = isFinite(s.horodatage) ? Number(s.horodatage) : Date.now();
      simulations.push({
        id: s.id,
        date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : new Date(horodatage).toISOString().slice(0, 10),
        horodatage: horodatage,
        client: texte(s.client, 80), conseiller: texte(s.conseiller, 80), ref: texte(s.ref, 40),
        etat: etat,
        resume: Scenario.resume(Scenario.calculer(etat))
      });
    });
    return { simulations: simulations };
  }

  return {
    versementPourCapital: versementPourCapital,
    dureeRetraite: dureeRetraite,
    revenuRetraite: revenuRetraite,
    statistiques: statistiques,
    exporterSauvegarde: exporterSauvegarde,
    importerSauvegarde: importerSauvegarde
  };
});
