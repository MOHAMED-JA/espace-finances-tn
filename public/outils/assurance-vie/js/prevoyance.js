/* Volet prévoyance : rente viagère estimée au terme et capital décès (fonctions pures, hypothèses saisies). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Prevoyance = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Rente annuelle constante servie pendant `dureeAns` ans (paiements en fin d'année), sur un capital
     placé au taux technique `tauxPct`. Estimation indicative : la rente viagère réelle dépend des tables de mortalité. */
  function renteEstimee(capital, dureeAns, tauxPct) {
    if (!(capital > 0) || !(dureeAns > 0)) return { annuelle: 0, mensuelle: 0 };
    var i = (tauxPct || 0) / 100;
    var annuite = i === 0 ? dureeAns : (1 - Math.pow(1 + i, -dureeAns)) / i;
    var annuelle = capital / annuite;
    return { annuelle: annuelle, mensuelle: annuelle / 12 };
  }

  /* Capital versé aux bénéficiaires si l'assuré décède à l'année `annee` : le plus élevé entre
     le capital acquis, les versements effectués et un éventuel capital garanti saisi. */
  function capitalDeces(annees, annee, capitalGaranti) {
    var ligne = annees[Math.max(0, Math.min(annee, annees.length - 1))];
    var garanti = capitalGaranti > 0 ? capitalGaranti : 0;
    var capitalDecesTotal = Math.max(ligne.capital, ligne.verse, garanti);
    var origine = capitalDecesTotal === garanti && garanti > 0 ? 'garanti' : (capitalDecesTotal === ligne.verse && ligne.verse > ligne.capital ? 'verses' : 'acquis');
    return { annee: ligne.annee, capitalAcquis: ligne.capital, totalVerse: ligne.verse, capitalDeces: capitalDecesTotal, origine: origine };
  }

  /* Sortie au terme : capital en une fois ou rente. Nombre d'années de rente pour récupérer le capital. */
  function comparerSortie(capital, renteAnnuelle, dureeRente) {
    var total = renteAnnuelle * dureeRente;
    return {
      capital: capital, renteAnnuelle: renteAnnuelle, totalRentes: total, supplement: total - capital,
      anneesPourCapital: renteAnnuelle > 0 ? Math.ceil(capital / renteAnnuelle - 1e-9) : null
    };
  }

  return { renteEstimee: renteEstimee, capitalDeces: capitalDeces, comparerSortie: comparerSortie };
});
