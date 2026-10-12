/*
 * Orbite — documents du module Crédit, fabriqués sur l'appareil (rien n'est envoyé) :
 *  - échéancier en PDF (jsPDF, copie locale chargée à la demande) et en Excel (moteurs/vie/xlsx.js) ;
 *  - rapport de contrôle du tableau de la banque en PDF et en Excel ;
 *  - lettre à la banque en Word (.docx minimal, même archive ZIP que le classeur).
 * Entrées préparées par module-credit.js : aucun calcul ici, seulement la mise en page.
 * Polices standard du PDF (Helvetica) : les caractères hors Windows-1252 sont remplacés.
 */
(function (racine) {
  "use strict";

  var W = 210, H = 297, M = 14;
  var C = { encre: [20, 26, 51], texte: [52, 58, 88], doux: [91, 98, 131], trait: [227, 230, 240], fond: [245, 246, 251],
    bleu: [47, 91, 234], bleuClair: [227, 234, 254], vert: [17, 135, 90], vertClair: [236, 249, 242], rouge: [201, 58, 58], rougeClair: [253, 240, 240] };

  function txt(s) {
    return String(s == null ? "" : s).replace(/[   ]/g, " ").replace(/→/g, "->").replace(/−/g, "-")
      .replace(/≠/g, "<>").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/ᵉ/g, "e").replace(/[^\x00-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "");
  }
  function grouper(n) { return n.replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt3(v) { if (!isFinite(v)) return "-"; var s = Math.abs(Math.round(v * 1000) / 1000).toFixed(3).split("."); return (v < 0 ? "-" : "") + grouper(s[0]) + "," + s[1]; }
  function jour(d) { return d ? String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() : ""; }
  function aujourdHui() { var d = new Date(); return jour(d); }

  /* Bibliothèques partagées : globales du navigateur, ou de Node pendant les tests. */
  function lib(nom) { return racine[nom] || (typeof globalThis !== "undefined" ? globalThis[nom] : undefined); }
  function chargerScript(src) {
    return new Promise(function (ok, ko) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { ko(new Error("Chargement impossible : vérifiez la connexion.")); }; document.head.appendChild(s); });
  }
  var promessePdf = null;
  function jspdf() {
    if (lib("jspdf")) return Promise.resolve(lib("jspdf"));
    if (!promessePdf) promessePdf = chargerScript("/espace/vendor/jspdf.umd.min.js").then(function () { return lib("jspdf"); }, function (e) { promessePdf = null; throw e; });
    return promessePdf;
  }

  /* ---------- Squelette commun des PDF ---------- */
  function nouveauPdf(lib, titre, sousTitre) {
    var doc = new lib.jsPDF({ unit: "mm", format: "a4", compress: true }), y = 0;
    function couleur(fn, c) { doc[fn](c[0], c[1], c[2]); }
    function police(t, g, c) { doc.setFont("helvetica", g ? "bold" : "normal"); doc.setFontSize(t); couleur("setTextColor", c || C.encre); }
    function texte(s, x, yy, o) { doc.text(txt(s), x, yy, o); }
    function entete() {
      couleur("setDrawColor", C.bleu); doc.setLineWidth(0.7); doc.circle(M + 2.6, 15.6, 2.6, "S");
      couleur("setFillColor", C.bleu); doc.circle(M + 2.6, 15.6, 0.9, "F"); doc.circle(M + 4.9, 14.2, 0.55, "F");
      police(12, true); texte("Orbite", M + 7, 16.9);
      police(8.5, false, C.doux); texte("Établi le " + aujourdHui(), W - M, 16.9, { align: "right" });
      y = 26;
    }
    entete();
    police(17, true); texte(titre, M, y + 6); y += 10;
    if (sousTitre) { police(9.5, false, C.doux); doc.splitTextToSize(txt(sousTitre), W - 2 * M).forEach(function (l) { doc.text(l, M, y + 4); y += 4.6; }); y += 2; }
    var api = {
      doc: doc, police: police, texte: texte, couleur: couleur,
      get y() { return y; }, set y(v) { y = v; },
      place: function (h) { if (y + h > H - 18) { doc.addPage(); entete(); return true; } return false; },
      paragraphe: function (s, taille, c, gras) {
        police(taille || 9.5, gras, c || C.texte);
        doc.splitTextToSize(txt(s), W - 2 * M).forEach(function (l) { api.place(5); doc.text(l, M, y + 4); y += (taille || 9.5) * 0.48; });
        y += 1.5;
      },
      cartes: function (liste) {
        var n = liste.length, g = 3, w = (W - 2 * M - g * (n - 1)) / n;
        api.place(18);
        liste.forEach(function (c, i) {
          var x = M + i * (w + g); couleur("setFillColor", C.fond); doc.roundedRect(x, y, w, 16, 2, 2, "F");
          police(7.5, false, C.doux); texte(c[0], x + 3, y + 5.5);
          police(11, true); texte(c[1], x + 3, y + 12);
        });
        y += 20;
      },
      tableau: function (entetes, larg, lignes, options) {
        var o = options || {}, xs = [], x = M;
        larg.forEach(function (l) { xs.push(x); x += l; });
        function tete() {
          couleur("setFillColor", C.bleuClair); doc.rect(M, y, W - 2 * M, 7, "F");
          police(7.5, true, C.encre);
          entetes.forEach(function (e, i) { texte(e, i < 2 ? xs[i] + 1.5 : xs[i] + larg[i] - 1.5, y + 4.8, i < 2 ? undefined : { align: "right" }); });
          y += 7;
        }
        if (!o.sansTete) tete();
        lignes.forEach(function (l, k) {
          if (api.place(5.2) && !o.sansTete) tete();
          if (o.marque && o.marque(k)) { couleur("setFillColor", C.rougeClair); doc.rect(M, y, W - 2 * M, 5.2, "F"); }
          else if (k % 2) { couleur("setFillColor", C.fond); doc.rect(M, y, W - 2 * M, 5.2, "F"); }
          police(7.5, false, C.texte);
          l.forEach(function (v, i) { texte(v, i < 2 ? xs[i] + 1.5 : xs[i] + larg[i] - 1.5, y + 3.7, i < 2 ? undefined : { align: "right" }); });
          y += 5.2;
        });
        y += 3;
      },
      fin: function (mention) {
        var n = doc.getNumberOfPages();
        for (var i = 1; i <= n; i++) {
          doc.setPage(i); couleur("setDrawColor", C.trait); doc.setLineWidth(0.2); doc.line(M, H - 13, W - M, H - 13);
          police(7.5, false, C.doux); texte(mention, M, H - 9); texte("Page " + i + " sur " + n, W - M, H - 9, { align: "right" });
        }
        return doc.output("blob");
      }
    };
    return api;
  }

  /* ---------- Échéancier ----------
   * e = { titre, sousTitre, cartes: [[lib, val]], lignes: [{ n, date, ech, int, am, ass, ra, crd }], totaux: { ech, int, am, ass, ra }, teg } */
  function echeancierPdf(e) {
    return jspdf().then(function (lib) {
      var p = nouveauPdf(lib, e.titre, e.sousTitre);
      p.cartes(e.cartes);
      var avecAss = e.lignes.some(function (l) { return l.ass > 0; }), avecRa = e.lignes.some(function (l) { return l.ra > 0; });
      var ent = ["N°", "Date", "Échéance", "Intérêts", "Capital"], larg = [12, 24, 30, 28, 30];
      if (avecAss) { ent.push("Assurance"); larg.push(24); }
      if (avecRa) { ent.push("Anticipé"); larg.push(24); }
      ent.push("Restant dû"); larg.push(0);
      var reste = W - 2 * M - larg.reduce(function (a, b) { return a + b; }, 0); larg[larg.length - 1] = reste;
      p.tableau(ent, larg, e.lignes.map(function (l) {
        var r = [String(l.n), jour(l.date), dt3(l.ech), dt3(l.int), dt3(l.am)];
        if (avecAss) r.push(dt3(l.ass)); if (avecRa) r.push(l.ra > 0 ? dt3(l.ra) : ""); r.push(dt3(l.crd)); return r;
      }));
      var t = e.totaux, tot = ["Total", "", dt3(t.ech), dt3(t.int), dt3(t.am)];
      if (avecAss) tot.push(dt3(t.ass)); if (avecRa) tot.push(dt3(t.ra)); tot.push("");
      p.police(7.5, true); p.tableau(ent, larg, [tot], { sansTete: true });
      return p.fin("Simulation indicative établie avec Orbite (montants en dinars). Elle ne vaut pas offre de la banque.");
    });
  }
  function echeancierXlsx(e) {
    var X = lib("Xlsx"), entetes = ["N°", "Date", "Échéance", "Intérêts", "Capital amorti", "Assurance", "Remboursement anticipé", "Capital restant dû"];
    var lignes = [[{ v: e.titre, s: "titre" }], [e.sousTitre || ""], [], entetes.map(function (h) { return { v: h, s: "gras" }; })];
    e.lignes.forEach(function (l) { lignes.push([l.n, jour(l.date), { v: l.ech, s: "tnd" }, { v: l.int, s: "tnd" }, { v: l.am, s: "tnd" }, { v: l.ass || 0, s: "tnd" }, l.ra > 0 ? { v: l.ra, s: "tnd" } : null, { v: l.crd, s: "tnd" }]); });
    var d = 5, f = 4 + e.lignes.length;
    lignes.push(["Total", "", { f: "SUM(C" + d + ":C" + f + ")", v: e.totaux.ech, s: "tndGras" }, { f: "SUM(D" + d + ":D" + f + ")", v: e.totaux.int, s: "tndGras" }, { f: "SUM(E" + d + ":E" + f + ")", v: e.totaux.am, s: "tndGras" }, { f: "SUM(F" + d + ":F" + f + ")", v: e.totaux.ass, s: "tndGras" }, { f: "SUM(G" + d + ":G" + f + ")", v: e.totaux.ra, s: "tndGras" }]);
    var resume = [[{ v: "Résumé", s: "titre" }], []].concat(e.cartes.map(function (c) { return [{ v: c[0], s: "gras" }, txt(c[1])]; }));
    return X.classeur([{ nom: "Échéancier", lignes: lignes, largeurs: [7, 12, 16, 16, 16, 14, 18, 18], figer: 4 }, { nom: "Résumé", lignes: resume, largeurs: [30, 30] }], { titre: e.titre });
  }

  /* ---------- Contrôle du tableau de la banque ---------- */
  function moisAnnee(d) { return String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }
  function auditPdf(au) {
    return jspdf().then(function (lib) {
      var L = au.lignes, graves = au.anomalies.filter(function (a) { return a.g === "erreur" || a.g === "alerte"; });
      var p = nouveauPdf(lib, "Contrôle du tableau d'amortissement", (au.info.banque ? au.info.banque + " · " : "") + L.length + " échéances lues (" + moisAnnee(L[0].date) + " -> " + moisAnnee(L[L.length - 1].date) + "). Chaque échéance recalculée au millime à partir du tableau de la banque.");
      p.cartes([["Points à vérifier", String(graves.length)], ["Intérêts facturés", dt3(au.totI) + " DT"], ["Capital remboursé", dt3(au.totA) + " DT"], ["Taux recalculé", au.phases.length ? au.phases.map(function (x) { return String(x.taux).replace(".", ",") + " %"; }).filter(function (x, k, a) { return a.indexOf(x) === k; }).slice(0, 2).join(" · ") : "-"]]);
      p.paragraphe(graves.length ? "Constats à présenter à votre banque :" : "Aucune erreur de calcul : chaque échéance lue est exacte au millime.", 11, C.encre, true);
      au.anomalies.concat(au.infos).forEach(function (a) { p.paragraphe("• " + a.txt, 9, a.g === "erreur" ? C.rouge : C.texte); });
      p.y += 2;
      p.tableau(["N°", "Date", "Capital dû", "Intérêts facturés", "Intérêts attendus", "Écart"], [12, 24, 40, 36, 36, 34], L.map(function (l) {
        return [String(l.n), moisAnnee(l.date), dt3(l.crdAv), dt3(l.int), dt3(l.attendu), isFinite(l.ecart) ? (Math.abs(l.ecart) > 0.0015 ? (l.ecart > 0 ? "+" : "") + dt3(l.ecart) : "0") : "-"];
      }), { marque: function (k) { return isFinite(L[k].ecart) && Math.abs(L[k].ecart) > 0.0015; } });
      return p.fin("Contrôle établi avec Orbite à partir du document de la banque. À confirmer avec votre conseiller.");
    });
  }
  function auditXlsx(au) {
    var X = lib("Xlsx"), L = au.lignes;
    var lignes = [[{ v: "Contrôle du tableau d'amortissement", s: "titre" }], [(au.info.banque ? au.info.banque + " · " : "") + L.length + " échéances"], [],
      ["N°", "Date", "Capital dû", "Amortissement", "Intérêts facturés", "Intérêts attendus", "Écart", "Échéance"].map(function (h) { return { v: h, s: "gras" }; })];
    L.forEach(function (l) { lignes.push([l.n, moisAnnee(l.date), { v: l.crdAv, s: "tnd" }, { v: l.am, s: "tnd" }, isFinite(l.int) ? { v: l.int, s: "tnd" } : null, isFinite(l.attendu) ? { v: l.attendu, s: "tnd" } : null, isFinite(l.ecart) ? { v: l.ecart, s: "tnd" } : null, isFinite(l.ech) ? { v: l.ech, s: "tnd" } : null]); });
    var constats = [[{ v: "Constats", s: "titre" }], []].concat(au.anomalies.concat(au.infos).map(function (a) { return [{ v: a.g === "erreur" ? "Erreur" : a.g === "alerte" ? "À vérifier" : a.g === "lecture" ? "Lecture" : "Info", s: "gras" }, a.txt]; }));
    if (constats.length === 2) constats.push(["", "Aucune erreur : chaque échéance est exacte au millime."]);
    return X.classeur([{ nom: "Échéances", lignes: lignes, largeurs: [7, 10, 16, 16, 16, 16, 12, 16], figer: 4 }, { nom: "Constats", lignes: constats, largeurs: [14, 110] }], { titre: "Contrôle du tableau de la banque" });
  }

  /* ---------- Lettre en Word (.docx) ---------- */
  function xml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function lettreDocx(titre, texte) {
    var paras = String(texte || "").split(/\r?\n/).map(function (l) {
      return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">' + xml(l) + '</w:t></w:r></w:p>';
    }).join("");
    var corps = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
    return lib("Xlsx").zip([
      { nom: "[Content_Types].xml", contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { nom: "_rels/.rels", contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { nom: "docProps/core.xml", contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + xml(titre || "") + '</dc:title><dc:creator>Orbite</dc:creator></cp:coreProperties>' },
      { nom: "word/document.xml", contenu: corps }
    ]);
  }

  var api = { echeancierPdf: echeancierPdf, echeancierXlsx: echeancierXlsx, auditPdf: auditPdf, auditXlsx: auditXlsx, lettreDocx: lettreDocx, txt: txt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.CreditDocuments = api;
})(typeof self !== "undefined" ? self : this);
