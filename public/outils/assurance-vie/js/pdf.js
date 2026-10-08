/* Rapport PDF généré dans le navigateur avec jsPDF (assets/vendor) : aucun envoi à un serveur.
   Entrée : les données préparées par interface.js (textes déjà traduits en français ou en anglais).
   Sortie : un Blob PDF. Polices standard du PDF (Helvetica) : alphabet latin uniquement. */
(function (racine) {
  'use strict';

  var W = 210, H = 297, M = 14, BAS = H - 18;
  var BASE = {
    encre: [18, 22, 49], texte: [54, 60, 92], gris: [103, 109, 140], trait: [225, 229, 240], fond: [244, 246, 251],
    indigo: [79, 70, 229], violet: [124, 58, 237], fuchsia: [192, 38, 211], vert: [5, 150, 105], vertClair: [236, 253, 245],
    orange: [234, 88, 12], rouge: [225, 29, 72], ambre: [245, 158, 11], ambreClair: [255, 247, 230], sarcelle: [20, 184, 166]
  };

  /* Caractères absents de l'encodage des polices standard */
  function txt(s) {
    return String(s == null ? '' : s)
      .replace(/−/g, '-').replace(/[   ]/g, ' ')
      .replace(/★/g, '*').replace(/≥/g, '>=').replace(/≤/g, '<=');
  }

  /* Palette du document : couleurs d'origine, ou celles de l'agence (principale, secondaire, tertiaire en RVB) */
  function paletteRapport(c) {
    var p = {};
    Object.keys(BASE).forEach(function (k) { p[k] = BASE[k]; });
    if (c && c.principale) { p.indigo = c.principale; p.violet = c.secondaire || c.principale; p.fuchsia = c.tertiaire || p.violet; }
    return p;
  }

  function melange(a, b, p) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * p); }); }

  function fmtCourt(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e3) return Math.round(v / 1e3) + ' k';
    return String(Math.round(v));
  }

  function generer(d) {
    var jsPDF = racine.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var t = d.t;
    var y = 0;
    var C = paletteRapport(d.couleur);
    var TITRE = d.proposition ? t('Proposition commerciale') : t('Rapport de simulation');

    function couleur(fn, c) { doc[fn](c[0], c[1], c[2]); }
    function police(taille, gras, c) {
      doc.setFont('helvetica', gras ? 'bold' : 'normal');
      doc.setFontSize(taille);
      couleur('setTextColor', c || C.encre);
    }

    function degrade(x, yy, w, h) {
      var n = 90;
      for (var i = 0; i < n; i++) {
        var p = i / (n - 1);
        var c = p < 0.5 ? melange(C.indigo, C.violet, p * 2) : melange(C.violet, C.fuchsia, (p - 0.5) * 2);
        couleur('setFillColor', c);
        doc.rect(x + w * i / n, yy, w / n + 0.3, h, 'F');
      }
    }

    function logo(x, yy, taille) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, yy, taille, taille, 3, 3, 'F');
      doc.setLineWidth(1.1 * taille / 16);
      dessinerPousse(doc, x + taille / 2, yy + taille / 2, taille * 0.04, C.indigo, C.vert);
    }

    /* Logo de l'agence, centré dans un carré blanc arrondi */
    function logoAgence(x, yy, taille) {
      var lg = d.agence.logo;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, yy, taille, taille, 3, 3, 'F');
      var marge = 1.6, cote = taille - 2 * marge;
      var k = Math.min(cote / lg.l, cote / lg.h);
      var w = lg.l * k, h = lg.h * k;
      try { doc.addImage(lg.src, lg.format, x + (taille - w) / 2, yy + (taille - h) / 2, w, h); } catch (e) { logo(x, yy, taille); }
    }

    function enteteComplete() {
      degrade(0, 0, W, 36);
      if (d.agence && d.agence.logo) logoAgence(M, 9, 17); else logo(M, 9, 17);
      police(17, true, [255, 255, 255]);
      doc.text(txt(TITRE), M + 22, 15.5);
      police(9.5, false, [255, 255, 255]);
      doc.text(txt(t('Assurance vie et CEA') + ' · ' + t('Barème : {0}', [d.bareme])), M + 22, 21.5);
      doc.text(txt(t('Édité le {0}', [d.date.toLocaleDateString(d.langue === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })])), M + 22, 26.5);
      police(8, false, [255, 255, 255]);
      doc.text(txt(t('Dossier')), W - M, 14, { align: 'right' });
      police(11, true, [255, 255, 255]);
      doc.text(txt(d.dossier), W - M, 19.5, { align: 'right' });
      y = 44;
    }

    function enteteSuite() {
      degrade(0, 0, W, 11);
      police(9, true, [255, 255, 255]);
      doc.text(txt(TITRE + ' · ' + t('Assurance vie et CEA')), M, 7.2);
      doc.text(txt(t('Dossier') + ' ' + d.dossier), W - M, 7.2, { align: 'right' });
      y = 20;
    }

    function place(h) {
      if (y + h > BAS) { doc.addPage(); enteteSuite(); return true; }
      return false;
    }

    function titre(s) {
      place(22);
      y += 3;
      couleur('setFillColor', C.indigo);
      doc.roundedRect(M, y, 1.6, 6.2, 0.8, 0.8, 'F');
      police(12.5, true);
      doc.text(txt(s), M + 4.5, y + 5);
      y += 10;
    }

    function paragraphe(s, taille, c) {
      police(taille || 9, false, c || C.texte);
      var l = doc.splitTextToSize(txt(s), W - 2 * M);
      var h = l.length * (taille || 9) * 0.42 + 1.5;
      place(h);
      police(taille || 9, false, c || C.texte);
      doc.text(l, M, y + (taille || 9) * 0.35);
      y += h;
    }

    function rangee(lib, val, cls) {
      police(9.5, cls === 'fort', C.texte);
      var libs = doc.splitTextToSize(txt(lib), 128);
      var h = libs.length * 4.1 + 3;
      place(h);
      police(9.5, cls === 'fort', C.texte);
      if (cls === 'fort') { couleur('setFillColor', C.vertClair); doc.rect(M, y, W - 2 * M, h, 'F'); }
      doc.text(libs, M + 2, y + 4.6);
      police(9.5, true, cls === 'fort' ? C.vert : cls === 'perte' ? C.rouge : C.encre);
      doc.text(txt(val), W - M - 2, y + 4.6, { align: 'right' });
      couleur('setDrawColor', C.trait);
      doc.setLineWidth(0.2);
      doc.line(M, y + h, W - M, y + h);
      y += h;
    }

    function tuiles(liste) {
      var n = liste.length, ecart = 4, w = (W - 2 * M - ecart * (n - 1)) / n, h = 24;
      place(h + 4);
      liste.forEach(function (tl, i) {
        var x = M + i * (w + ecart);
        couleur('setFillColor', tl.c);
        doc.roundedRect(x, y, w, h, 3, 3, 'F');
        police(8.5, false, [255, 255, 255]);
        doc.text(txt(tl.lib), x + 4, y + 7);
        police(tl.val.length > 16 ? 12 : 14, true, [255, 255, 255]);
        doc.text(txt(tl.val), x + 4, y + 15.5);
        if (tl.sous) { police(7.5, false, [255, 255, 255]); doc.text(txt(tl.sous), x + 4, y + 20.5); }
      });
      y += h + 5;
    }

    /* Graphique en lignes : series = [{ pts: [[x, y]…], c, epaisseur, pointille, aire }] */
    function graphe(o) {
      var h = o.h || 58;
      place(h + 16);
      var x0 = M + 14, x1 = W - M - 2, y0 = y + 3, y1 = y + h;
      function X(v) { return x0 + (o.xMax > 0 ? v / o.xMax : 0) * (x1 - x0); }
      function Y(v) { return y1 - (o.yMax > 0 ? v / o.yMax : 0) * (y1 - y0); }
      doc.setLineWidth(0.15);
      police(7, false, C.gris);
      for (var i = 0; i <= 4; i++) {
        var vy = o.yMax * i / 4;
        couleur('setDrawColor', C.trait);
        doc.line(x0, Y(vy), x1, Y(vy));
        doc.text(fmtCourt(vy), x0 - 2, Y(vy) + 1, { align: 'right' });
        var vx = o.entier ? Math.round(o.xMax * i / 4) : o.xMax * i / 4;
        doc.text(fmtCourt(vx), X(vx), y1 + 4.2, { align: 'center' });
      }
      doc.text(txt(o.xLib), (x0 + x1) / 2, y1 + 8.5, { align: 'center' });
      o.series.forEach(function (s) {
        if (s.bande) {
          /* Zone entre deux courbes : haut (aller) puis bas (retour) */
          var tour = s.bande.haut.concat(s.bande.bas.slice().reverse());
          var relB = [];
          for (var b = 1; b < tour.length; b++) relB.push([X(tour[b][0]) - X(tour[b - 1][0]), Y(tour[b][1]) - Y(tour[b - 1][1])]);
          couleur('setFillColor', s.c);
          doc.lines(relB, X(tour[0][0]), Y(tour[0][1]), [1, 1], 'F', true);
          return;
        }
        var pts = s.pts;
        if (s.aire) {
          couleur('setFillColor', s.aire);
          var rel = [];
          for (var k = 1; k < pts.length; k++) rel.push([X(pts[k][0]) - X(pts[k - 1][0]), Y(pts[k][1]) - Y(pts[k - 1][1])]);
          rel.push([0, Y(0) - Y(pts[pts.length - 1][1])]);
          rel.push([X(pts[0][0]) - X(pts[pts.length - 1][0]), 0]);
          doc.lines(rel, X(pts[0][0]), Y(pts[0][1]), [1, 1], 'F', true);
        }
        couleur('setDrawColor', s.c);
        doc.setLineWidth(s.epaisseur || 0.7);
        if (s.pointille) doc.setLineDashPattern([1.2, 1.2], 0);
        for (var j = 1; j < pts.length; j++) doc.line(X(pts[j - 1][0]), Y(pts[j - 1][1]), X(pts[j][0]), Y(pts[j][1]));
        if (s.pointille) doc.setLineDashPattern([], 0);
      });
      if (o.repere > 0 && o.repere <= o.xMax) {
        couleur('setDrawColor', C.vert);
        doc.setLineWidth(0.4);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(X(o.repere), y0, X(o.repere), y1);
        doc.setLineDashPattern([], 0);
        police(7.5, true, C.vert);
        doc.text(txt(t('Optimal')), Math.min(X(o.repere) + 1.5, x1 - 12), y0 + 3);
      }
      if (o.point) {
        couleur('setDrawColor', C.indigo);
        doc.setFillColor(255, 255, 255);
        doc.setLineWidth(0.8);
        doc.circle(X(Math.min(o.point[0], o.xMax)), Y(o.point[1]), 1.3, 'FD');
      }
      y = y1 + 12;
      if (o.legende) {
        y += 3;
        var lx = M;
        police(7.5, false, C.gris);
        o.legende.forEach(function (l) {
          if (l.zone) {
            couleur('setFillColor', l.c);
            doc.rect(lx, y - 2.6, 6, 3.2, 'F');
          } else {
            couleur('setDrawColor', l.c);
            doc.setLineWidth(0.9);
            if (l.pointille) doc.setLineDashPattern([1, 1], 0);
            doc.line(lx, y - 1, lx + 6, y - 1);
            doc.setLineDashPattern([], 0);
          }
          doc.text(txt(l.lib), lx + 8, y);
          lx += 12 + doc.getTextWidth(txt(l.lib));
        });
        y += 5;
      }
    }

    function tableauTranches(sim) {
      var cols = [
        [t('Tranche (TND)'), 46, 'left'], [t('Taux'), 18, 'right'], [t('Impôt sans inv.'), 40, 'right'],
        [t('Impôt avec inv.'), 40, 'right'], [t('Économie'), 38, 'right']
      ];
      function enTete() {
        couleur('setFillColor', C.fond);
        doc.rect(M, y, W - 2 * M, 7, 'F');
        police(7.5, true, C.gris);
        var x = M;
        cols.forEach(function (c) {
          doc.text(txt(c[0]).toUpperCase(), c[2] === 'left' ? x + 2 : x + c[1] - 2, y + 4.7, { align: c[2] });
          x += c[1];
        });
        y += 7;
      }
      place(9 + 6.2 * 3);
      enTete();
      var totAv = 0, totAp = 0;
      function ligneT(vals, gras) {
        if (place(6.5)) enTete();
        var xx = M;
        vals.forEach(function (v, i) {
          police(8.5, gras, gras ? C.encre : (i === 4 && v.eco ? C.vert : C.texte));
          doc.text(txt(v.s), cols[i][2] === 'left' ? xx + 2 : xx + cols[i][1] - 2, y + 4.4, { align: cols[i][2] });
          xx += cols[i][1];
        });
        couleur('setDrawColor', C.trait);
        doc.setLineWidth(0.2);
        doc.line(M, y + 6.2, W - M, y + 6.2);
        y += 6.2;
      }
      sim.avant.parTranche.forEach(function (bd, i) {
        var ad = sim.apres.parTranche[i] || { impot: 0 };
        totAv += bd.impot; totAp += ad.impot;
        var debut = bd.min > 0 ? bd.min + 1 : 0;
        var fin = bd.max === Infinity ? t('et plus') : d.fmtEntier(bd.max);
        ligneT([
          { s: d.fmtEntier(debut) + (bd.max === Infinity ? ' ' : ' – ') + fin },
          { s: (bd.taux * 100).toFixed(0) + ' %' },
          { s: d.fmtAmount(bd.impot) }, { s: d.fmtAmount(ad.impot) },
          { s: d.fmtAmount(bd.impot - ad.impot), eco: bd.impot - ad.impot > 0.0005 }
        ], false);
      });
      ligneT([{ s: t('Total') }, { s: '' }, { s: d.fmtAmount(totAv) }, { s: d.fmtAmount(totAp) }, { s: d.fmtAmount(totAv - totAp) }], true);
      y += 3;
    }

    /* Tableau simple : colonnes = libellés, largeurs en mm (la 1re colonne alignée à gauche) */
    function tableau(colonnes, lignes, largeurs) {
      var total = largeurs.reduce(function (a, b) { return a + b; }, 0);
      var k = (W - 2 * M) / total;
      var lg = largeurs.map(function (l) { return l * k; });
      function enTete() {
        police(7, true, C.gris);
        var hs = colonnes.map(function (c, i) { return doc.splitTextToSize(txt(c).toUpperCase(), lg[i] - 3); });
        var h = Math.max.apply(null, hs.map(function (x) { return x.length; })) * 3 + 3.6;
        couleur('setFillColor', C.fond);
        doc.rect(M, y, W - 2 * M, h, 'F');
        var x = M;
        hs.forEach(function (l, i) {
          doc.text(l, i ? x + lg[i] - 1.5 : x + 1.5, y + 4, { align: i ? 'right' : 'left' });
          x += lg[i];
        });
        y += h;
      }
      place(16);
      enTete();
      lignes.forEach(function (ligne) {
        if (place(6.2)) enTete();
        var x = M;
        ligne.forEach(function (v, i) {
          police(8.2, i === 0, i === 0 ? C.encre : C.texte);
          doc.text(txt(v), i ? x + lg[i] - 1.5 : x + 1.5, y + 4.2, { align: i ? 'right' : 'left' });
          x += lg[i];
        });
        couleur('setDrawColor', C.trait);
        doc.setLineWidth(0.2);
        doc.line(M, y + 6, W - M, y + 6);
        y += 6;
      });
      y += 3;
    }

    function puces(liste, c) {
      liste.forEach(function (s) {
        police(9, false, C.texte);
        var l = doc.splitTextToSize(txt(s), W - 2 * M - 7);
        var h = l.length * 4.1 + 2;
        place(h);
        couleur('setFillColor', c || C.indigo);
        doc.circle(M + 1.6, y + 2.4, 0.9, 'F');
        police(9, false, C.texte);
        doc.text(l, M + 5, y + 3.4);
        y += h;
      });
      y += 1;
    }

    function sectionMonteCarlo(mc) {
      titre(mc.titre);
      paragraphe(mc.texte, 8.5, C.gris);
      y += 1;
      puces(mc.phrases, C.vert);
      var n = mc.centiles.p50.length - 1;
      function pts(v) { return v.map(function (val, i) { return [i, val]; }); }
      var yMax = Math.max(Math.max.apply(null, mc.centiles.p90), mc.verses[mc.verses.length - 1], mc.objectif || 0) || 1;
      var series = [
        { bande: { haut: pts(mc.centiles.p90), bas: pts(mc.centiles.p10) }, c: melange(C.indigo, [255, 255, 255], 0.85) },
        { bande: { haut: pts(mc.centiles.p75), bas: pts(mc.centiles.p25) }, c: melange(C.indigo, [255, 255, 255], 0.68) },
        { pts: pts(mc.verses), c: C.gris, pointille: true, epaisseur: 0.5 },
        { pts: pts(mc.centiles.p50), c: C.indigo, epaisseur: 0.8 }
      ];
      var legende = [
        { lib: mc.legende[0], c: melange(C.indigo, [255, 255, 255], 0.85), zone: true },
        { lib: mc.legende[1], c: melange(C.indigo, [255, 255, 255], 0.68), zone: true },
        { lib: mc.legende[2], c: C.indigo }, { lib: mc.legende[3], c: C.gris, pointille: true }
      ];
      if (mc.objectif > 0) {
        series.push({ pts: [[0, mc.objectif], [n, mc.objectif]], c: C.vert, pointille: true, epaisseur: 0.5 });
        legende.push({ lib: mc.legende[4], c: C.vert, pointille: true });
      }
      graphe({ xMax: n || 1, yMax: yMax, xLib: t('Années'), entier: true, series: series, legende: legende });
    }

    function signatures() {
      place(62);
      titre(t('Bon pour accord'));
      paragraphe(t('Le client reconnaît avoir reçu cette proposition et les informations sur les produits présentés. Cette signature ne vaut pas souscription : le contrat définitif reste soumis aux conditions générales de l\'assureur.'), 8.2, C.texte);
      y += 2;
      var w = (W - 2 * M - 8) / 2;
      [[t('Le client'), d.client], [t('Le conseiller'), d.conseiller || (d.agence && d.agence.nom) || '']].forEach(function (s, i) {
        var x = M + i * (w + 8);
        couleur('setDrawColor', C.trait);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, w, 40, 2, 2, 'S');
        police(9.5, true, C.encre);
        doc.text(txt(s[0]), x + 4, y + 6.5);
        if (s[1]) { police(8.5, false, C.texte); doc.text(txt(s[1]).slice(0, 48), x + 4, y + 11.5); }
        police(7.5, false, C.gris);
        doc.text(txt(t('Date :')), x + 4, y + 18);
        doc.text(txt(t('Mention « Lu et approuvé » et signature')), x + 4, y + 24);
      });
      y += 46;
    }

    function qrCode(x, yy, taille) {
      var qr = d.qr, n = qr.getModuleCount(), cote = taille / n;
      doc.setFillColor(255, 255, 255);
      doc.rect(x - 1.5, yy - 1.5, taille + 3, taille + 3, 'F');
      couleur('setFillColor', C.encre);
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (qr.isDark(r, c)) doc.rect(x + c * cote, yy + r * cote, cote + 0.02, cote + 0.02, 'F');
        }
      }
    }

    /* ------------------------------------------------------------------ */
    var calc = d.calc, sim = calc.sim;
    enteteComplete();

    if (d.proposition) {
      /* Couverture : destinataire, chiffres clés et recommandation */
      police(10, false, C.gris);
      doc.text(txt(t('Préparée pour')), M, y + 2);
      police(20, true, C.encre);
      doc.text(txt(d.client || t('Notre client')), M, y + 11);
      y += 16;
      var auteur = [d.conseiller ? t('Conseiller : {0}', [d.conseiller]) : '', d.agence && d.agence.nom ? d.agence.nom : ''].filter(Boolean).join(' · ');
      if (auteur) { police(9.5, false, C.texte); doc.text(txt(auteur), M, y); y += 5; }
      if (d.agence) {
        var co = [d.agence.tel, d.agence.email, d.agence.adresse].filter(Boolean).join('   ·   ');
        if (co) { police(8.5, false, C.gris); doc.text(doc.splitTextToSize(txt(co), W - 2 * M), M, y); y += 5; }
      }
      y += 4;
      var capital = calc.actif ? (d.mc ? d.mc.centiles.p50[d.mc.centiles.p50.length - 1] : calc.sc.median.capitalFinal) : null;
      tuiles([
        { lib: t('Économie d\'impôt'), val: d.fmtTND(sim.economie), sous: t('par an'), c: C.vert },
        capital != null ? { lib: t('Capital au terme (médian)'), val: d.fmtTND(capital), sous: t('dans {0} ans', [calc.etat.dureeAns]), c: C.indigo }
          : { lib: t('Taux de réduction d\'impôt'), val: d.fmtPct(sim.tauxReduction), sous: t('55 % au maximum'), c: C.indigo },
        { lib: t('Effort d\'épargne réel'), val: d.fmtTND(Math.max(0, calc.investissement - sim.economie) / 12), sous: t('par mois, après économie d\'impôt'), c: C.orange }
      ]);
      titre(t('Notre recommandation'));
      var rec = d.recommandation;
      rec.lignes.forEach(function (l) { rangee(l, '', 'fort'); });
      puces([rec.economie, rec.effort].concat(rec.optimal ? [rec.optimal] : []));
      if (d.mc) paragraphe(d.mc.fourchette, 9, C.texte);
    }

    if (!d.proposition && d.agence && (d.agence.nom || d.agence.tel || d.agence.email || d.agence.adresse)) {
      police(9, false, C.texte);
      var coords = [d.agence.tel, d.agence.email, d.agence.adresse].filter(Boolean).join('   ·   ');
      var lignesAg = coords ? doc.splitTextToSize(txt(coords), W - 2 * M - 8) : [];
      var hAg = 7 + lignesAg.length * 4.2 + (d.agence.nom ? 0 : -4);
      couleur('setFillColor', C.fond);
      doc.roundedRect(M, y - 2, W - 2 * M, hAg + 2, 2, 2, 'F');
      var yy = y + 3.4;
      if (d.agence.nom) { police(10, true, C.indigo); doc.text(txt(d.agence.nom), M + 4, yy); yy += 4.6; }
      if (lignesAg.length) { police(8.5, false, C.texte); doc.text(lignesAg, M + 4, yy); }
      y += hAg + 4;
    }
    if (!d.proposition && (d.client || d.conseiller)) {
      couleur('setFillColor', C.fond);
      doc.roundedRect(M, y - 2, W - 2 * M, 10, 2, 2, 'F');
      police(9.5, false, C.texte);
      doc.text(txt([d.client ? t('Client : {0}', [d.client]) : '', d.conseiller ? t('Conseiller : {0}', [d.conseiller]) : ''].filter(Boolean).join('   ·   ')), M + 4, y + 4.4);
      y += 13;
    }
    if (d.provisoire) {
      couleur('setFillColor', C.ambreClair);
      doc.roundedRect(M, y - 2, W - 2 * M, 9, 2, 2, 'F');
      police(8.5, true, [146, 64, 14]);
      doc.text(txt(t('Barème provisoire : à confirmer avec le texte officiel.')), M + 4, y + 3.8);
      y += 12;
    }

    if (!d.proposition) tuiles([
      { lib: t('Économie d\'impôt'), val: d.fmtTND(sim.economie), sous: t('par an'), c: C.vert },
      { lib: t('Taux de réduction d\'impôt'), val: d.fmtPct(sim.tauxReduction), sous: t('55 % au maximum'), c: C.violet },
      { lib: t('Montant optimal en assurance vie'), val: d.fmtTND(sim.optimal), sous: t('par an'), c: C.orange }
    ]);

    titre(d.proposition ? t('Votre situation') : t('Hypothèses'));
    d.hypotheses.forEach(function (l) { rangee(l[0], l[1]); });

    titre(t('Impôt annuel'));
    rangee(t('Impôt total avant investissement'), d.fmtTND(sim.impotAvant));
    rangee(t('Impôt total après investissement'), d.fmtTND(sim.impotApres));
    rangee(t('Minimum d\'impôt (45 %)'), d.fmtTND(sim.impotMinimum));
    if (sim.economieCea > 0) { rangee(t('Économie due à l\'assurance vie'), d.fmtTND(sim.economieAv)); rangee(t('Économie due au CEA (40 % de l\'impôt au plus)'), d.fmtTND(sim.economieCea)); }
    rangee(t('Économie d\'impôt'), d.fmtTND(sim.economie), 'fort');

    if (!d.proposition) {
    titre(t('Revenu net imposable'));
    d.deductions.forEach(function (l) {
      var moins = l[2].indexOf('moins') !== -1;
      if (moins && l[1] === 0) return;
      rangee(l[0], (moins && l[1] > 0 ? '− ' : '') + d.fmtTND(l[1]), l[2].indexOf('total') !== -1 ? 'fort' : '');
    });

    titre(t('Impôt par tranche'));
    tableauTranches(sim);

    titre(t('Économie selon le montant investi'));
    var pts = d.points;
    graphe({
      xMax: pts[pts.length - 1][0] || 1,
      yMax: Math.max.apply(null, pts.map(function (p) { return p[1]; })) || 1,
      xLib: t('Assurance vie investie par an (TND)'),
      series: [{ pts: pts, c: C.indigo, aire: [232, 234, 252], epaisseur: 0.8 }],
      repere: sim.optimal,
      point: sim.investissementAv > 0 ? [sim.investissementAv, Math.min(sim.economie, Math.max.apply(null, pts.map(function (p) { return p[1]; })))] : null
    });
    }

    if (d.projection) {
      titre(t('Projection du capital'));
      paragraphe(d.hypothesesProjection, 8.5, C.gris);
      y += 1;
      tuiles(d.scenarios.map(function (s, i) { return { lib: s[0], val: s[1], c: [C.orange, C.indigo, C.vert][i] }; }));
      var sc = calc.sc;
      function serie(p, cle) { return p.annees.map(function (a) { return [a.annee, a[cle]]; }); }
      var series = [
        { pts: serie(sc.median, 'verse'), c: C.gris, pointille: true, epaisseur: 0.5 },
        { pts: serie(sc.prudent, 'capital'), c: C.orange },
        { pts: serie(sc.median, 'capital'), c: C.indigo },
        { pts: serie(sc.dynamique, 'capital'), c: C.vert }
      ];
      var legende = [
        { lib: t('Dynamique'), c: C.vert }, { lib: t('Médian'), c: C.indigo },
        { lib: t('Prudent'), c: C.orange }, { lib: t('Versements cumulés'), c: C.gris, pointille: true }
      ];
      if (calc.etat.inflationPct > 0) {
        series.push({ pts: serie(sc.median, 'capitalReel'), c: C.sarcelle, pointille: true });
        legende.push({ lib: t('Médian en dinars constants'), c: C.sarcelle, pointille: true });
      }
      graphe({
        xMax: calc.etat.dureeAns, yMax: sc.dynamique.capitalFinal || 1, xLib: t('Années'), entier: true,
        series: series, legende: legende
      });
      d.projection.forEach(function (l) { rangee(l[0], l[1], l[2]); });
      if (d.mc) sectionMonteCarlo(d.mc);
      if (d.strategie) {
        titre(d.strategie.titre);
        paragraphe(d.strategie.texte, 9, C.texte);
        tableau(d.strategie.colonnes, d.strategie.lignes, [16, 34, 34, 40, 32]);
      }
      if (d.contrats) {
        titre(d.contrats.titre);
        tableau(d.contrats.colonnes, d.contrats.lignes, [40, 34, 34, 30, 26]);
      }
      if (d.comparatif) {
        titre(t('Comparatif des placements au terme'));
        var maxCmp = Math.max.apply(null, d.comparatif.map(function (c) { return c[2]; })) || 1;
        var couleursCmp = [C.vert, C.indigo, C.orange, C.gris];
        d.comparatif.forEach(function (c, i) {
          police(8.5, false, C.texte);
          var lib = doc.splitTextToSize(txt(c[0]), W - 2 * M - 40);
          place(lib.length * 3.8 + 11);
          doc.text(lib, M, y + 3);
          police(9, true, C.encre);
          doc.text(txt(c[1]), W - M, y + 3, { align: 'right' });
          var yb = y + lib.length * 3.8 + 1;
          couleur('setFillColor', C.fond);
          doc.roundedRect(M, yb, W - 2 * M, 3.2, 1.6, 1.6, 'F');
          couleur('setFillColor', couleursCmp[i % couleursCmp.length]);
          var lb = Math.max(3.2, (W - 2 * M) * Math.max(0, c[2]) / maxCmp);
          doc.roundedRect(M, yb, lb, 3.2, 1.6, 1.6, 'F');
          y = yb + 6.5;
        });
      }
    }

    if (d.proposition && d.attention && d.attention.length) {
      titre(t('Points d\'attention'));
      puces(d.attention, C.ambre);
    }
    if (d.rachat && !d.proposition) {
      titre(d.rachat.titre);
      d.rachat.lignes.forEach(function (l) { rangee(l[0], l[1], l[2]); });
    }
    if (d.prevoyance && !d.proposition) {
      titre(d.prevoyance.titre);
      d.prevoyance.lignes.forEach(function (l) { rangee(l[0], l[1], l[2]); });
    }

    if (d.qr) {
      titre(t('Retrouver cette simulation'));
      place(40);
      qrCode(M + 1.5, y + 1.5, 32);
      police(9.5, false, C.texte);
      var l1 = doc.splitTextToSize(txt(t('Scannez le QR code ou ouvrez le lien ci-dessous pour retrouver la simulation dans le simulateur.')), W - 2 * M - 42);
      doc.text(l1, M + 40, y + 6);
      police(7.5, false, C.indigo);
      var l2 = doc.splitTextToSize(d.lien, W - 2 * M - 42);
      doc.text(l2.slice(0, 5), M + 40, y + 8 + l1.length * 4.3);
      doc.link(M, y, 36, 36, { url: d.lien });
      y += 40;
    }

    titre(t('Mentions légales'));
    paragraphe(t('Simulation indicative, non contractuelle.') + ' ' + t('Elle ne constitue ni un conseil en investissement ni un engagement de l\'assureur. Les rendements et les frais de la projection sont des hypothèses modifiables, non garanties : la valeur d\'un contrat peut varier à la hausse comme à la baisse. Le calcul de l\'impôt suit le Code de l\'impôt sur le revenu des personnes physiques et de l\'impôt sur les sociétés tel que saisi dans le simulateur ; seules les dispositions officielles en vigueur font foi.'), 8.2, C.texte);

    if (d.proposition) signatures();

    /* Pied de page numéroté */
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      couleur('setDrawColor', C.trait);
      doc.setLineWidth(0.3);
      doc.line(M, H - 12, W - M, H - 12);
      police(7.5, false, C.gris);
      var pied = t('Simulation indicative, non contractuelle') + ' · ' + t('Dossier') + ' ' + d.dossier;
      if (d.agence && d.agence.nom) pied = d.agence.nom.slice(0, 50) + ' · ' + pied;
      doc.text(txt(pied), M, H - 7.5);
      doc.text(txt(t('Page {0} / {1}', [p, n])), W - M, H - 7.5, { align: 'right' });
    }
    doc.setProperties({ title: txt(TITRE + ' ' + d.dossier), subject: txt(t('Assurance vie et CEA')), creator: 'Simulateur Assurance Vie et CEA' });
    return doc.output('blob');
  }

  /* Logo de l'application : pousse (tracé repris de l'icône, repère 24 × 24), tige en indigo, feuilles en vert.
     (cx, cy) reçoit le centre du dessin, k est l'échelle en mm par unité. */
  function dessinerPousse(doc, cx, cy, k, tige, feuille) {
    function P(x, y) { return [cx + (x - 11.6) * k, cy + (y - 12.5) * k]; }
    doc.setLineJoin('round');
    doc.setLineCap('round');
    doc.setDrawColor(tige[0], tige[1], tige[2]);
    var a = P(7, 20); doc.lines([[10, 0]], a[0], a[1], [k, k], 'S', false);
    a = P(10, 20); doc.lines([[5.5, -2.5, 0.8, -6.4, 3, -10]], a[0], a[1], [k, k], 'S', false);
    doc.setDrawColor(feuille[0], feuille[1], feuille[2]);
    a = P(9.5, 9.4); doc.lines([[1.1, 0.8, 1.8, 2.2, 2.3, 3.7], [-2, 0.4, -3.5, 0.4, -4.8, -0.3], [-1.2, -0.6, -2.3, -1.9, -3, -4.2], [2.8, -0.5, 4.4, 0, 5.5, 0.8]], a[0], a[1], [k, k], 'S', true);
    a = P(14.1, 6); doc.lines([[-0.7, 1.2, -1.1, 2.6, -1.1, 4], [1.9, -0.1, 3.3, -0.6, 4.3, -1.4], [1, -1, 1.6, -2.3, 1.7, -4.6], [-2.7, 0.1, -4, 1, -4.9, 2]], a[0], a[1], [k, k], 'S', true);
  }

  /* Affiche A4 à imprimer : QR code qui ouvre l'application sur sa fenêtre d'installation.
     d = { t, lien, qr (matrice), agence } */
  function affiche(d) {
    var jsPDF = racine.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var t = d.t;
    var C = paletteRapport(d.couleur);
    function couleur(fn, c) { doc[fn](c[0], c[1], c[2]); }
    function police(taille, gras, c) { doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); couleur('setTextColor', c || C.encre); }
    /* En-tête en dégradé */
    var n = 120;
    for (var i = 0; i < n; i++) {
      var p = i / (n - 1);
      couleur('setFillColor', p < 0.5 ? melange(C.indigo, C.violet, p * 2) : melange(C.violet, C.fuchsia, (p - 0.5) * 2));
      doc.rect(W * i / n, 0, W / n + 0.3, 78, 'F');
    }
    /* Logo */
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(W / 2 - 13, 12, 26, 26, 6, 6, 'F');
    doc.setLineWidth(1.6);
    dessinerPousse(doc, W / 2, 25, 26 * 0.04, C.indigo, C.vert);
    police(24, true, [255, 255, 255]);
    doc.text(txt(t('Simulateur Assurance Vie & CEA')), W / 2, 52, { align: 'center' });
    police(12.5, false, [255, 255, 255]);
    doc.text(txt(t('Calculez votre économie d\'impôt en quelques secondes, même sans réseau.')), W / 2, 62, { align: 'center' });
    /* Appel */
    police(22, true, C.encre);
    doc.text(txt(t('Scannez pour installer l\'application')), W / 2, 94, { align: 'center' });
    police(12, false, C.gris);
    doc.text(txt(t('Ouvrez l\'appareil photo du téléphone et visez le code.')), W / 2, 102, { align: 'center' });
    /* QR code */
    var cote = 84, xq = (W - cote) / 2, yq = 118;
    couleur('setFillColor', C.fond);
    doc.roundedRect(xq - 8, yq - 8, cote + 16, cote + 16, 6, 6, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(xq - 3, yq - 3, cote + 6, cote + 6, 'F');
    if (d.qr) {
      var m = d.qr.getModuleCount(), c = cote / m;
      couleur('setFillColor', C.encre);
      for (var r = 0; r < m; r++) for (var col = 0; col < m; col++) if (d.qr.isDark(r, col)) doc.rect(xq + col * c, yq + r * c, c + 0.03, c + 0.03, 'F');
    }
    doc.link(xq, yq, cote, cote, { url: d.lien });
    /* Étapes */
    var y = yq + cote + 14;
    var colonnes = [
      [t('Android'), [t('Scannez le code.'), t('Touchez « Installer l\'application ».'), t('Confirmez « Installer ».')]],
      [t('iPhone et iPad'), [t('Scannez le code, puis ouvrez le lien dans Safari.'), t('Touchez Partager, puis « Sur l\'écran d\'accueil ».'), t('Touchez « Ajouter ».')]]
    ];
    var lc = (W - 2 * M - 8) / 2;
    colonnes.forEach(function (colonne, ic) {
      var xc = M + ic * (lc + 8);
      couleur('setFillColor', C.fond);
      doc.roundedRect(xc, y, lc, 44, 4, 4, 'F');
      police(13, true, ic ? C.orange : C.indigo);
      doc.text(txt(colonne[0]), xc + 6, y + 9);
      colonne[1].forEach(function (e, ie) {
        var yy = y + 18 + ie * 9.5;
        couleur('setFillColor', ic ? C.orange : C.indigo);
        doc.circle(xc + 8.5, yy - 1.3, 3, 'F');
        police(9, true, [255, 255, 255]);
        doc.text(String(ie + 1), xc + 8.5, yy + 0.1, { align: 'center' });
        police(10, false, C.texte);
        doc.text(doc.splitTextToSize(txt(e), lc - 18).slice(0, 2), xc + 14, yy);
      });
    });
    y += 52;
    police(9.5, false, C.indigo);
    doc.text(txt(d.lien), W / 2, y, { align: 'center' });
    if (d.agence && (d.agence.nom || d.agence.tel || d.agence.email)) {
      y += 8;
      police(12, true, C.encre);
      if (d.agence.nom) { doc.text(txt(d.agence.nom), W / 2, y, { align: 'center' }); y += 6; }
      police(10, false, C.texte);
      var coords = [d.agence.tel, d.agence.email, d.agence.adresse].filter(Boolean).join('   ·   ');
      if (coords) doc.text(doc.splitTextToSize(txt(coords), W - 2 * M), W / 2, y, { align: 'center' });
    }
    police(8, false, C.gris);
    doc.text(txt(t('Gratuit, sans inscription, aucune donnée envoyée. Simulation indicative, non contractuelle.')), W / 2, H - 7, { align: 'center' });
    doc.setProperties({ title: txt(t('Scannez pour installer l\'application')), creator: 'Simulateur Assurance Vie et CEA' });
    return doc.output('blob');
  }

  racine.RapportPDF = { generer: generer, affiche: affiche };
})(typeof self !== 'undefined' ? self : this);
