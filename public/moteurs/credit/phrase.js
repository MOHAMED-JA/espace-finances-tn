/*
 * Crédit décrit en une phrase (français ou arabe) → valeurs du simulateur.
 * « 150 000 sur 20 ans à TMM + 2,5 avec 30 000 d'apport », « قرض 80 ألف على 7 سنوات بنسبة 9 % ».
 * Fonction pure, reprise du simulateur de crédit (analyserTexte), sans DOM.
 * Node : require('.../phrase.js') — navigateur : window.CreditPhrase.
 */
(function (racine, fabrique) {
  'use strict';
  var API = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = API;
  else racine.CreditPhrase = API;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function arr3(v) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
  var RE_MONTANT = '(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*(millions?|mille|milles|mdt|md|k|m|ألف|الف|آلاف|مليون)?(?![a-zà-ÿ\\u0600-\\u06ff])';
  function valeurMontant(nb, suffixe) {
    var s = nb.replace(/[   ]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    suffixe = (suffixe || '').toLowerCase();
    if (/^million/.test(suffixe) || suffixe === 'm' || suffixe === 'مليون') v *= 1e6;
    else if (/^mille/.test(suffixe) || suffixe === 'k' || suffixe === 'mdt' || suffixe === 'md' || /^(ألف|الف|آلاف)$/.test(suffixe)) v *= 1000;
    return v;
  }
  function dec(s) { return parseFloat(String(s).replace(',', '.')); }

  var NB = ' ';
  function grp(v, d) {
    var p = Math.abs(v).toFixed(d).split('.'), e = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB);
    return (v < 0 ? '−' : '') + e + (p[1] && +p[1] ? ',' + p[1].replace(/0+$/, '') : '');
  }
  function dt(v) { return grp(v, 3) + ' DT'; }
  function pct(v) { return grp(v, 3) + ' %'; }
  function duree(m) { return m % 12 === 0 ? (m / 12) + ' an' + (m >= 24 ? 's' : '') : m + ' mois'; }
  var PERIODES = { 3: 'trimestriel', 6: 'semestriel', 12: 'annuel' };
  var AMORT = { infine: 'in fine', lineaire: 'amortissement constant' };
  var TYPES = { immo: 'crédit immobilier', auto: 'crédit auto', conso: 'crédit consommation' };

  function analyser(texte) {
    var s = ' ' + String(texte || '').toLowerCase()
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); })
      .replace(/[’`]/g, "'").replace(/٫/g, ',').replace(/٪/g, '%') + ' ';
    var res = {}, m;
    function retirer(x) { s = s.replace(x, ' '.repeat(x.length)); }
    /* Type de crédit */
    if (/(maison|appartement|logement|immobili|terrain|villa|habitation|سكن|عقار|منزل|شقة|دار)/.test(s)) res.type = 'immo';
    else if (/(voiture|auto\b|automobile|véhicule|vehicule|سيارة|كرهبة|كرهبه)/.test(s)) res.type = 'auto';
    else if (/(conso|consommation|équipement|equipement|études|etudes|mariage|استهلاك)/.test(s)) res.type = 'conso';
    /* Périodicité et amortissement */
    if (/trimestri|ثلاثي/.test(s)) res.periodicite = 3;
    else if (/semestri|سداسي/.test(s)) res.periodicite = 6;
    else if (/(échéances?|echeances?|remboursements?|paiements?) annuel|annuités|سنوية/.test(s)) res.periodicite = 12;
    if (/in fine/.test(s)) res.amort = 'infine';
    else if (/amortissement constant|dégressi|degressi/.test(s)) res.amort = 'lineaire';
    /* Différé */
    if ((m = new RegExp("(?:différé|differe|délai de grâce|delai de grace|grâce|grace|إمهال)\\D{0,15}?(\\d+)\\s*(mois|ans?|années?|شهر|أشهر|سنة|سنوات)").exec(s))) {
      res.differe = { mois: parseInt(m[1], 10) * (/an|ann|سن/.test(m[2]) ? 12 : 1), type: /total|كلي/.test(s) ? 'total' : 'partiel' };
      retirer(m[0]);
    }
    /* Assurance et frais de dossier (pourcentages à ne pas confondre avec le taux) */
    if ((m = /assurance\D{0,20}?(\d+(?:[.,]\d+)?)\s*%/.exec(s)) || (m = /تأمين\D{0,15}?(\d+(?:[.,]\d+)?)\s*%/.exec(s))) { res.assurance = dec(m[1]); retirer(m[0]); }
    if ((m = /frais(?: de dossier)?\D{0,15}?(\d+(?:[.,]\d+)?)\s*%/.exec(s)) || (m = /مصاريف\D{0,15}?(\d+(?:[.,]\d+)?)\s*%/.exec(s))) { res.fraisPct = dec(m[1]); retirer(m[0]); }
    /* TMM + marge */
    if ((m = /(?:tmm|معدل السوق النقدية|م\.س\.ن)\s*(?:à|a|de|=|:)?\s*(\d+(?:[.,]\d+)?)?\s*%?\s*\+\s*(?:marge\s*(?:de)?\s*)?(\d+(?:[.,]\d+)?)\s*%?/.exec(s))) {
      res.tmm = { tmm: m[1] ? dec(m[1]) : NaN, marge: dec(m[2]) }; retirer(m[0]);
    } else if ((m = /marge\D{0,10}?(\d+(?:[.,]\d+)?)\s*%?/.exec(s))) {
      res.tmm = { tmm: NaN, marge: dec(m[1]) };
      var mt = /tmm\D{0,8}?(\d+(?:[.,]\d+)?)/.exec(s);
      if (mt) { res.tmm.tmm = dec(mt[1]); retirer(mt[0]); }
      retirer(m[0]);
    }
    /* Taux fixe */
    if (!res.tmm && ((m = /(?:taux|à|a|au|نسبة|بنسبة)\s*(?:de|d'intérêt|fixe)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(s)) || (m = /(\d+(?:[.,]\d+)?)\s*%/.exec(s)))) {
      res.taux = dec(m[1]); retirer(m[0]);
    }
    /* Durée */
    if ((m = /(\d+(?:[.,]\d+)?)\s*(ans?|années?|annees?|سنة|سنوات|عام|أعوام)(?![a-zà-ÿ])/.exec(s))) { res.mois = Math.round(dec(m[1]) * 12); retirer(m[0]); }
    else if ((m = /(\d+)\s*(mois|شهر|أشهر|شهرا|شهرًا)/.exec(s))) { res.mois = parseInt(m[1], 10); retirer(m[0]); }
    /* Prix du bien et apport */
    if ((m = new RegExp("(?:apport|autofinancement|مساهمة)\\D{0,25}?" + RE_MONTANT).exec(s)) || (m = new RegExp(RE_MONTANT + "\\s*(?:dt|tnd|dinars?|د\\.?ت)?\\s*(?:d'apport|de l'apport|en apport|كمساهمة)").exec(s))) {
      res.apport = valeurMontant(m[1], m[2]); retirer(m[0]);
    }
    if ((m = new RegExp("(?:prix|bien|maison|appartement|villa|terrain|logement|voiture|véhicule|ثمن|سعر)\\D{0,25}?(?:de|à|a|:|بـ|ب)?\\s*" + RE_MONTANT).exec(s))) {
      var vp = valeurMontant(m[1], m[2]);
      if (vp >= 1000) { res.prix = vp; retirer(m[0]); }
    }
    /* Capital emprunté */
    if ((m = new RegExp("(?:emprunt\\w*|crédit|credit|prêt|pret|capital|financ\\w*|قرض|اقتراض)\\D{0,25}?(?:de|:)?\\s*" + RE_MONTANT).exec(s))) {
      var vc = valeurMontant(m[1], m[2]);
      if (vc >= 100) { res.capital = vc; retirer(m[0]); }
    }
    if (res.capital == null) {
      var re = new RegExp(RE_MONTANT, 'g'), mm;
      while ((mm = re.exec(s))) { var v = valeurMontant(mm[1], mm[2]); if (v >= 1000) { res.capital = v; break; } }
    }
    if (res.prix != null && res.apport == null && res.capital == null) { res.capital = res.prix; res.prix = null; }
    if (res.prix != null && res.apport == null && res.capital != null) {
      if (res.prix > res.capital) res.apport = arr3(res.prix - res.capital); else res.prix = null;
    }
    if (res.prix != null && res.apport != null && res.capital == null) res.capital = arr3(res.prix - res.apport);
    if (res.prix == null && res.apport != null && res.capital != null) res.prix = arr3(res.capital + res.apport);
    if (res.prix != null && res.apport != null && res.apport >= res.prix) { res.apport = null; res.prix = null; }
    /* Bornes raisonnables : une valeur aberrante est ignorée plutôt qu'appliquée */
    if (res.mois != null && !(res.mois >= 1 && res.mois <= 360)) delete res.mois;
    if (res.taux != null && !(res.taux >= 0 && res.taux <= 40)) delete res.taux;
    if (res.tmm && !(res.tmm.marge >= -5 && res.tmm.marge <= 15)) delete res.tmm;
    if (res.assurance != null && !(res.assurance >= 0 && res.assurance <= 5)) delete res.assurance;
    if (res.fraisPct != null && !(res.fraisPct >= 0 && res.fraisPct <= 10)) delete res.fraisPct;
    if (res.capital != null && !(res.capital >= 100 && res.capital <= 1e8)) delete res.capital;
    res.resume = resume(res);
    return res;
  }

  /* Ce qui a été compris, en français, dans l'ordre où on le dirait. */
  function resume(res) {
    var l = [];
    if (res.type) l.push(TYPES[res.type]);
    if (res.capital != null) l.push(dt(res.capital) + ' empruntés');
    if (res.prix != null) l.push('prix ' + dt(res.prix));
    if (res.apport != null) l.push('apport ' + dt(res.apport));
    if (res.mois != null) l.push(duree(res.mois));
    if (res.tmm) l.push(isFinite(res.tmm.tmm) ? 'TMM ' + pct(res.tmm.tmm) + ' + ' + pct(res.tmm.marge) : 'TMM + ' + pct(res.tmm.marge));
    if (res.taux != null) l.push('taux ' + pct(res.taux));
    if (res.periodicite) l.push('échéances ' + PERIODES[res.periodicite] + 's');
    if (res.amort) l.push(AMORT[res.amort]);
    if (res.differe) l.push('différé ' + (res.differe.type === 'total' ? 'total ' : '') + duree(res.differe.mois));
    if (res.assurance != null) l.push('assurance ' + pct(res.assurance));
    if (res.fraisPct != null) l.push('frais de dossier ' + pct(res.fraisPct));
    return l;
  }

  return { analyser: analyser, valeurMontant: valeurMontant };
});
