/* Lecture d'un relevé ou d'un contrat d'assurance vie au format PDF (texte, non scanné), sans bibliothèque :
   extraction du texte des flux (FlateDecode via DecompressionStream), puis repérage des montants et des taux
   près des mots-clés usuels. Les valeurs trouvées sont proposées à l'utilisateur, jamais appliquées sans accord. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Releve = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function latin1(octets) {
    var s = '';
    for (var i = 0; i < octets.length; i += 8192) s += String.fromCharCode.apply(null, octets.subarray(i, i + 8192));
    return s;
  }
  function versOctets(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }

  function decompresser(octets) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('decompression'));
    var flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Response(flux).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /* Chaînes d'un flux de contenu : (texte) Tj, [(a) -2 (b)] TJ, <48656C6C6F> Tj ; retours à la ligne sur Td, TD, T*, ' et " */
  function texteDuFlux(s) {
    var sortie = '', i = 0, n = s.length;
    function chaine() {
      var prof = 1, r = '';
      i++;
      while (i < n && prof > 0) {
        var c = s.charAt(i);
        if (c === '\\') {
          var d = s.charAt(i + 1);
          var esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
          if (esc[d] !== undefined) { r += esc[d]; i += 2; continue; }
          if (/[0-7]/.test(d)) { var m = /^[0-7]{1,3}/.exec(s.slice(i + 1, i + 4))[0]; r += String.fromCharCode(parseInt(m, 8)); i += 1 + m.length; continue; }
          i += 2; continue;
        }
        if (c === '(') prof++;
        if (c === ')') { prof--; if (!prof) { i++; break; } }
        r += c; i++;
      }
      return r;
    }
    function hexa() {
      var fin = s.indexOf('>', i);
      var h = s.slice(i + 1, fin).replace(/\s+/g, '');
      i = fin + 1;
      var r = '';
      var pas = h.length % 4 === 0 && /^(00[0-9A-Fa-f]{2})+$/.test(h) ? 4 : 2;
      for (var k = 0; k < h.length; k += pas) r += String.fromCharCode(parseInt(h.substr(k, pas), 16));
      return r;
    }
    var morceau = '';
    while (i < n) {
      var c = s.charAt(i);
      if (c === '(') { morceau += chaine(); continue; }
      if (c === '<' && s.charAt(i + 1) !== '<') { morceau += hexa(); continue; }
      if (c === '[' ) { i++; continue; }
      if (c === ']') { i++; continue; }
      /* Opérateurs */
      var op = /^(Tj|TJ|Td|TD|T\*|ET|'|")(?=[\s\]\[(<\/]|$)/.exec(s.slice(i, i + 3));
      if (op) {
        if (op[1] === 'Tj' || op[1] === 'TJ') { sortie += morceau; morceau = ''; }
        if (op[1] === 'Td' || op[1] === 'TD' || op[1] === 'T*' || op[1] === 'ET') sortie += '\n';
        if (op[1] === "'" || op[1] === '"') { sortie += '\n' + morceau; morceau = ''; }
        i += op[1].length; continue;
      }
      /* Espacement négatif important dans TJ : séparateur de mots */
      var num = /^-?\d+(\.\d+)?/.exec(s.slice(i, i + 12));
      if (num && morceau && Math.abs(parseFloat(num[0])) > 200) morceau += ' ';
      i += num ? num[0].length : 1;
    }
    return sortie + morceau;
  }

  /* arrayBuffer → Promise<texte> */
  function texte(tampon) {
    var octets = new Uint8Array(tampon);
    var brut = latin1(octets);
    if (brut.slice(0, 5) !== '%PDF-') return Promise.reject(new Error('format'));
    var re = /<<([\s\S]*?)>>\s*stream\r?\n/g, m, taches = [];
    while ((m = re.exec(brut))) {
      var debut = m.index + m[0].length;
      var fin = brut.indexOf('endstream', debut);
      if (fin < 0) break;
      var dict = m[1].slice(m[1].lastIndexOf('<<') + 1);
      if (/\/Subtype\s*\/(Image|XML)|\/Type\s*\/(XObject|Metadata|XRef|ObjStm)|\/Length1|\/FontFile/.test(dict)) { re.lastIndex = fin; continue; }
      /* Longueur déclarée si elle est directe, sinon jusqu'à « endstream » sans la fin de ligne */
      var lg = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      var stop = fin;
      while (stop > debut && (brut.charAt(stop - 1) === '\n' || brut.charAt(stop - 1) === '\r')) stop--;
      if (lg && debut + +lg[1] <= fin) stop = debut + +lg[1];
      var donnees = octets.subarray(debut, stop);
      if (/\/FlateDecode/.test(dict)) taches.push(decompresser(donnees).then(latin1, function () { return ''; }));
      else if (!/\/Filter/.test(dict)) taches.push(Promise.resolve(latin1(donnees)));
      re.lastIndex = fin;
    }
    return Promise.all(taches).then(function (flux) {
      return flux.filter(function (f) { return /\b(Tj|TJ)\b/.test(f); }).map(texteDuFlux).join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    });
  }

  /* « 12 345,678 », « 12.345,678 », « 12,345.678 », « 12345 » → nombre */
  function nombre(s) {
    var t = s.replace(/[\s  ]/g, '');
    if (/,\d{1,3}$/.test(t) && /\./.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/\.\d{1,3}$/.test(t) && /,/.test(t)) t = t.replace(/,/g, '');
    else if (/,\d+$/.test(t)) t = t.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }

  var MONTANT = '[^\\n]{0,80}?(?<![\\d.,])(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+(?:,\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?)\\s*(?:TND|DT|dinars?)';
  var TAUX = '[^\\n]{0,80}?(?<![\\d.,])(\\d{1,2}(?:[.,]\\d{1,3})?)\\s*%';
  var MOTIFS = {
    capital: new RegExp('(?:valeur\\s+de\\s+rachat|capital\\s+(?:acquis|constitu[ée]|disponible)|[ée]pargne\\s+(?:acquise|constitu[ée]e)|provision\\s+math[ée]matique|encours)' + MONTANT, 'i'),
    versement: new RegExp('(?:prime|cotisation|versement)s?\\s+(?:p[ée]riodique|mensuel(?:le)?|trimestriel(?:le)?|programm[ée]e?|r[ée]guli[èe]re?)' + MONTANT, 'i'),
    tauxServi: new RegExp('(?:taux\\s+(?:de\\s+rendement|servi|net\\s+servi|de\\s+participation\\s+global)|rendement\\s+(?:net|servi|annuel))' + TAUX, 'i'),
    tauxGaranti: new RegExp('taux\\s+(?:minimum\\s+)?(?:technique|garanti|minimum\\s+garanti)' + TAUX, 'i'),
    fraisGestion: new RegExp('frais\\s+(?:de\\s+gestion|sur\\s+encours)' + TAUX, 'i'),
    fraisVersement: new RegExp("frais\\s+(?:sur\\s+(?:les\\s+)?versements?|d'entr[ée]e|de\\s+souscription|sur\\s+primes?)" + TAUX, 'i')
  };

  /* texte → { capital, versement, tauxServi, tauxGaranti, fraisGestion, fraisVersement } (null si absent) */
  function analyser(t) {
    var r = {};
    var plat = String(t || '').replace(/ /g, ' ');
    Object.keys(MOTIFS).forEach(function (k) {
      var m = MOTIFS[k].exec(plat);
      var v = m ? nombre(m[1]) : null;
      if (v != null && /^taux|^frais/.test(k) && v > 50) v = null;
      r[k] = v;
    });
    r.trouves = Object.keys(MOTIFS).filter(function (k) { return r[k] != null; }).length;
    return r;
  }

  return { texte: texte, texteDuFlux: texteDuFlux, analyser: analyser, nombre: nombre, versOctets: versOctets };
});
