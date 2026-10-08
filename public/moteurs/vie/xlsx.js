/* Classeur Excel (.xlsx) sans bibliothèque (fonctions pures) : archive ZIP sans compression contenant le
   SpreadsheetML minimal, avec plusieurs feuilles, formats TND / %, en-têtes en gras, volets figés et formules.
   Cellule : nombre, texte, null, ou { v, f (formule sans « = »), s ('tnd' | 'pct' | 'gras' | 'entier' | 'titre') }. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Xlsx = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- ZIP (méthode « stockée ») ---------- */
  var TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(o) { var c = 0xFFFFFFFF; for (var i = 0; i < o.length; i++) c = TABLE[(c ^ o[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var b = unescape(encodeURIComponent(s)), o = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
    return o;
  }
  function zip(fichiers) {
    var parties = [], central = [], decalage = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    fichiers.forEach(function (f) {
      var nom = utf8(f.nom), donnees = utf8(f.contenu), crc = crc32(donnees);
      var entete = [].concat([0x50, 0x4b, 3, 4], u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(donnees.length), u32(donnees.length), u16(nom.length), u16(0));
      parties.push(new Uint8Array(entete), nom, donnees);
      central.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(donnees.length), u32(donnees.length), u16(nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(decalage))), nom);
      decalage += entete.length + nom.length + donnees.length;
    });
    var tailleCentrale = central.reduce(function (t, p) { return t + p.length; }, 0);
    var fin = new Uint8Array([].concat([0x50, 0x4b, 5, 6], u16(0), u16(0), u16(fichiers.length), u16(fichiers.length), u32(tailleCentrale), u32(decalage), u16(0)));
    var tout = parties.concat(central, [fin]);
    var total = tout.reduce(function (t, p) { return t + p.length; }, 0);
    var sortie = new Uint8Array(total), pos = 0;
    tout.forEach(function (p) { sortie.set(p, pos); pos += p.length; });
    return sortie;
  }

  /* ---------- SpreadsheetML ---------- */
  function xml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colonne(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  var STYLES = { aucun: 0, gras: 1, tnd: 2, pct: 3, entier: 4, titre: 5, tndGras: 6 };

  function feuille(f) {
    var lignes = f.lignes || [];
    var largeurs = f.largeurs || [];
    var s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    if (f.figer) s += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + f.figer + '" topLeftCell="A' + (f.figer + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    if (largeurs.length) s += '<cols>' + largeurs.map(function (l, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + l + '" customWidth="1"/>'; }).join('') + '</cols>';
    s += '<sheetData>';
    lignes.forEach(function (ligne, r) {
      s += '<row r="' + (r + 1) + '">';
      ligne.forEach(function (c, k) {
        if (c == null || c === '') return;
        var ref = colonne(k) + (r + 1);
        var o = typeof c === 'object' ? c : { v: c };
        var st = STYLES[o.s] || 0;
        var attr = ' r="' + ref + '"' + (st ? ' s="' + st + '"' : '');
        if (o.f) s += '<c' + attr + '><f>' + xml(o.f) + '</f>' + (typeof o.v === 'number' && isFinite(o.v) ? '<v>' + o.v + '</v>' : '') + '</c>';
        else if (typeof o.v === 'number' && isFinite(o.v)) s += '<c' + attr + '><v>' + o.v + '</v></c>';
        else s += '<c' + attr + ' t="inlineStr"><is><t xml:space="preserve">' + xml(o.v == null ? '' : o.v) + '</t></is></c>';
      });
      s += '</row>';
    });
    return s + '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
  }

  /* feuilles = [{ nom, lignes, largeurs, figer }] ; renvoie un Uint8Array */
  function classeur(feuilles, meta) {
    var noms = feuilles.map(function (f, i) { return (String(f.nom || 'Feuille ' + (i + 1)).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31)) || 'Feuille'; });
    var f = [];
    f.push({ nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      feuilles.map(function (x, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' });
    f.push({ nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' });
    f.push({ nom: 'docProps/core.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xml(meta && meta.titre || '') + '</dc:title><dc:creator>Simulateur Assurance Vie et CEA</dc:creator></cp:coreProperties>' });
    f.push({ nom: 'xl/workbook.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      noms.map(function (n, i) { return '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' });
    f.push({ nom: 'xl/_rels/workbook.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      feuilles.map(function (x, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (feuilles.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    f.push({ nom: 'xl/styles.xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.000 &quot;TND&quot;"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF4F46E5"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF0FB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    feuilles.forEach(function (x, i) { f.push({ nom: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenu: feuille(x) }); });
    return zip(f);
  }

  return { classeur: classeur, zip: zip, crc32: crc32, colonne: colonne };
});
