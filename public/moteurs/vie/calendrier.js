/* Calendrier des versements et dates clés au format iCalendar (.ics), lisible par tous les agendas. Fonctions pures. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Calendrier = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREQ = { Mensuel: ['MONTHLY', 1, 12], Trimestriel: ['MONTHLY', 3, 4], Semestriel: ['MONTHLY', 6, 2], Annuel: ['YEARLY', 1, 1] };

  function deuxChiffres(n) { return (n < 10 ? '0' : '') + n; }
  function dateIcs(d) { return d.getFullYear() + deuxChiffres(d.getMonth() + 1) + deuxChiffres(d.getDate()); }
  function horodatage(d) {
    return d.getUTCFullYear() + deuxChiffres(d.getUTCMonth() + 1) + deuxChiffres(d.getUTCDate()) + 'T' +
      deuxChiffres(d.getUTCHours()) + deuxChiffres(d.getUTCMinutes()) + deuxChiffres(d.getUTCSeconds()) + 'Z';
  }
  function echapper(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

  /* Repli des lignes à 75 octets (RFC 5545), sans couper un caractère UTF-8 */
  function plier(ligne) {
    var octets = 0, sortie = '', courant = '';
    for (var i = 0; i < ligne.length; i++) {
      var c = ligne.charAt(i);
      var code = ligne.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < ligne.length) { c += ligne.charAt(++i); }
      var taille = unescape(encodeURIComponent(c)).length;
      if (octets + taille > (sortie ? 74 : 75)) { sortie += courant + '\r\n '; courant = ''; octets = 0; }
      courant += c; octets += taille;
    }
    return sortie + courant;
  }

  function evenement(uid, debut, titre, description, rrule, rappelJours, maintenant) {
    var fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
    var l = ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + horodatage(maintenant), 'DTSTART;VALUE=DATE:' + dateIcs(debut), 'DTEND;VALUE=DATE:' + dateIcs(fin),
      'SUMMARY:' + echapper(titre), 'DESCRIPTION:' + echapper(description)];
    if (rrule) l.push('RRULE:' + rrule);
    if (rappelJours > 0) l.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + echapper(titre), 'TRIGGER:-P' + rappelJours + 'D', 'END:VALARM');
    l.push('END:VEVENT');
    return l;
  }

  /* e = état de saisie ; o = { debut (Date du 1er versement), t (traduction), fmt (format des montants), dureeMinimaleAv, dureeBlocageCea, maintenant } */
  function generer(e, o) {
    var t = o.t || function (s, v) { return s.replace(/\{(\d+)\}/g, function (m, i) { return v[i]; }); };
    var fmt = o.fmt || String;
    var d0 = new Date(o.debut.getFullYear(), o.debut.getMonth(), o.debut.getDate());
    var maintenant = o.maintenant || new Date();
    var base = 'simulateur-av-' + dateIcs(d0);
    var fr = FREQ[e.frequence] || FREQ.Mensuel;
    var nb = fr[2] * e.dureeAns;
    var rrule = 'FREQ=' + fr[0] + ';INTERVAL=' + fr[1] + ';COUNT=' + nb;
    var lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Simulateur Assurance Vie et CEA//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + echapper(t('Épargne assurance vie et CEA'))];
    if (e.versement > 0) lignes = lignes.concat(evenement(base + '-av@simulateur', d0, t('Versement assurance vie : {0} TND', [fmt(e.versement)]),
      t('Versement programmé sur le contrat d\'assurance vie.'), rrule, 1, maintenant));
    if (e.versementCea > 0) lignes = lignes.concat(evenement(base + '-cea@simulateur', d0, t('Versement CEA : {0} TND', [fmt(e.versementCea)]),
      t('Dépôt programmé sur le Compte Épargne en Actions.'), rrule, 1, maintenant));
    if (e.versement > 0 || e.initialAv > 0) {
      var huit = new Date(d0.getFullYear() + (o.dureeMinimaleAv || 8), d0.getMonth(), d0.getDate());
      lignes = lignes.concat(evenement(base + '-av8@simulateur', huit, t('Assurance vie : {0} ans atteints', [o.dureeMinimaleAv || 8]),
        t('Durée minimale atteinte : un rachat n\'entraîne plus de réintégration fiscale.'), null, 7, maintenant));
    }
    if (e.versementCea > 0 || e.initialCea > 0) {
      var bloc = o.dureeBlocageCea || 5;
      for (var a = 1; a <= e.dureeAns; a++) {
        if (a > 1 && !(e.versementCea > 0)) break;
        var fin = new Date(d0.getFullYear() + a + bloc - 1, 11, 31);
        lignes = lignes.concat(evenement(base + '-cea' + a + '@simulateur', fin, t('CEA : fin de blocage des dépôts de {0}', [d0.getFullYear() + a - 1]),
          t('Les dépôts de cette année sont disponibles sans réintégration fiscale.'), null, 7, maintenant));
      }
    }
    var terme = new Date(d0.getFullYear() + e.dureeAns, d0.getMonth(), d0.getDate());
    lignes = lignes.concat(evenement(base + '-terme@simulateur', terme, t('Terme de l\'épargne ({0} ans)', [e.dureeAns]),
      t('Fin de la période simulée : choisir entre sortie en capital et rente.'), null, 30, maintenant));
    lignes.push('END:VCALENDAR');
    return lignes.map(plier).join('\r\n') + '\r\n';
  }

  return { generer: generer, plier: plier, dateIcs: dateIcs };
});
