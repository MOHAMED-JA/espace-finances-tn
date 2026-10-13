/*
 * Orbite — mise en page du bilan annuel en PDF (jsPDF, copie locale chargée à la demande). Rien ne quitte l'appareil :
 * la sortie est un Blob. Entrée : l'objet préparé par bilan-calcul.js (BilanCalcul.construire).
 * Polices standard du PDF (Helvetica) : les caractères hors de l'encodage Windows-1252 sont remplacés.
 */
(function (racine) {
  "use strict";

  var W = 210, H = 297, M = 16, BAS = H - 20;
  var C = {
    encre: [20, 26, 51], texte: [52, 58, 88], doux: [91, 98, 131], trait: [227, 230, 240], fond: [245, 246, 251],
    violet: [74, 63, 208], violetClair: [243, 241, 255], vert: [17, 135, 90], vertClair: [236, 249, 242],
    rouge: [201, 58, 58], rougeClair: [253, 240, 240], ambre: [176, 112, 0], gris: [154, 161, 191]
  };

  function txt(s) {
    return String(s == null ? "" : s)
      .replace(/[   ]/g, " ").replace(/→/g, "->").replace(/[−–]/g, "-")
      .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/ᵉ/g, "e").replace(/÷/g, "/");
  }
  function grouper(n) { return n.replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt3(v) { var s = (Math.round(Math.abs(v) * 1000) / 1000).toFixed(3).split("."); return (v < 0 ? "-" : "") + grouper(s[0]) + "," + s[1] + " DT"; }
  function dt0(v) { return (v < 0 ? "-" : "") + grouper(String(Math.round(Math.abs(v)))) + " DT"; }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %"; }
  function signe(v, d) { return (v > 0 ? "+" : "") + pct(v, d); }
  function ans(m) { var a = Math.floor(m / 12), r = m % 12; return a ? a + " ans" + (r ? " " + r + " mois" : "") : r + " mois"; }

  function generer(b) {
    var doc = new racine.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    var y = 0;

    function couleur(fn, c) { doc[fn](c[0], c[1], c[2]); }
    function police(taille, gras, c) { doc.setFont("helvetica", gras ? "bold" : "normal"); doc.setFontSize(taille); couleur("setTextColor", c || C.encre); }
    function texte(s, x, yy, opt) { doc.text(txt(s), x, yy, opt); }
    function logo(x, yy) {
      couleur("setDrawColor", C.violet); doc.setLineWidth(0.7);
      doc.circle(x + 2.6, yy + 2.6, 2.6, "S");
      couleur("setFillColor", C.violet); doc.circle(x + 2.6, yy + 2.6, 0.9, "F");
      doc.circle(x + 4.9, yy + 1.2, 0.55, "F");
      police(12, true); texte("Orbite", x + 7, yy + 3.9);
    }
    function entete(premiere) {
      logo(M, 13);
      police(8.5, false, C.doux);
      texte("Établi le " + b.date, W - M, 14.5, { align: "right" });
      texte(b.periode, W - M, 18.8, { align: "right" });
      y = premiere ? 30 : 26;
    }
    function pied() {
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        couleur("setDrawColor", C.trait); doc.setLineWidth(0.2); doc.line(M, H - 13, W - M, H - 13);
        police(7.5, false, C.doux);
        texte("Bilan indicatif établi avec Orbite à partir des informations déclarées. Créé sur l'appareil, envoyé à personne.", M, H - 9);
        texte("Page " + i + " sur " + n, W - M, H - 9, { align: "right" });
      }
    }
    function place(h) { if (y + h > BAS) { doc.addPage(); entete(false); return true; } return false; }
    function section(s, besoin) {
      y += 4;
      place(9.5 + (besoin || 12));
      police(8.5, true, C.violet);
      texte(s.toUpperCase(), M, y);
      couleur("setDrawColor", C.trait); doc.setLineWidth(0.25); doc.line(M, y + 1.8, W - M, y + 1.8);
      y += 6.5;
    }
    function paires(liste) {
      var col = (W - 2 * M - 8) / 2, l = liste.filter(function (x) { return x && x[1] !== "" && x[1] != null; });
      for (var i = 0; i < l.length; i += 2) {
        place(6.2);
        [l[i], l[i + 1]].forEach(function (p, k) {
          if (!p) return;
          var x = M + k * (col + 8);
          police(8.8, false, C.doux); texte(p[0], x, y + 3.6);
          police(8.8, true, p[2] || C.encre); texte(p[1], x + col, y + 3.6, { align: "right" });
          couleur("setDrawColor", C.trait); doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 0.8], 0); doc.line(x, y + 5.2, x + col, y + 5.2); doc.setLineDashPattern([], 0);
        });
        y += 6.2;
      }
      y += 1;
    }
    function tableau(cols, lignes, total) {
      var hT = (lignes.length + 1 + (total ? 1 : 0)) * 6 + 2;
      if (hT < BAS - 30) place(hT);
      function ligne(vals, gras, tete) {
        place(6);
        var x = M;
        police(tete ? 7.8 : 8.6, gras || tete, tete ? C.doux : C.encre);
        vals.forEach(function (v, i) { var c = cols[i]; texte(v, c.droite ? x + c.l - 1.5 : x + 1.5, y + 4, c.droite ? { align: "right" } : undefined); x += c.l; });
        couleur("setDrawColor", gras ? C.encre : C.trait); doc.setLineWidth(gras || tete ? 0.3 : 0.15);
        if (gras) doc.line(M, y, W - M, y);
        doc.line(M, y + 6, W - M, y + 6);
        y += 6;
      }
      ligne(cols.map(function (c) { return c.titre; }), false, true);
      lignes.forEach(function (l) { ligne(l, false); });
      if (total) ligne(total, true);
      y += 2;
    }
    function note(s, fond, bord) {
      police(8.4, false, C.texte);
      var l = doc.splitTextToSize(txt(s), W - 2 * M - 8), h = l.length * 3.7 + 4.4;
      place(h + 1);
      couleur("setFillColor", fond || C.violetClair); doc.rect(M, y, W - 2 * M, h, "F");
      couleur("setFillColor", bord || C.violet); doc.rect(M, y, 0.9, h, "F");
      police(8.4, false, C.texte); doc.text(l, M + 4, y + 4.4);
      y += h + 2.5;
    }
    function tuiles(liste) {
      var g = 4, w = (W - 2 * M - g * (liste.length - 1)) / liste.length, h = 17;
      place(h + 3);
      liste.forEach(function (t, i) {
        var x = M + i * (w + g);
        couleur("setFillColor", t.fond || [255, 255, 255]); couleur("setDrawColor", t.bord || C.trait); doc.setLineWidth(0.3);
        doc.roundedRect(x, y, w, h, 1.8, 1.8, "FD");
        police(7, true, C.doux); texte(t.lib.toUpperCase(), x + 3.5, y + 5.6);
        police(13.5, true, t.c || C.encre); texte(t.val, x + 3.5, y + 13);
      });
      y += h + 5;
    }
    /* Barre de score (0 à 100) et barres par composante. */
    function barre(x, yy, w, part, c) {
      couleur("setFillColor", C.fond); doc.roundedRect(x, yy, w, 2.6, 1.3, 1.3, "F");
      if (part > 0) { couleur("setFillColor", c); doc.roundedRect(x, yy, Math.max(2.6, w * Math.min(1, part)), 2.6, 1.3, 1.3, "F"); }
    }
    function couleurScore(s) { return s >= 80 ? C.vert : s >= 60 ? C.violet : s >= 40 ? C.ambre : C.rouge; }

    /* ---------------- En-tête ---------------- */
    entete(true);
    police(19, true); texte("Mon bilan " + b.annee, M, y + 4);
    police(9, false, C.doux);
    texte((b.coordonnees && b.coordonnees.nom ? b.coordonnees.nom + " · " : "") + b.periode + (b.complete ? "" : " (année en cours)"), M, y + 10);
    y += 16;
    tuiles([
      { lib: b.complete ? "Net de l'année" : "Net depuis janvier", val: dt0(b.cles.net) },
      { lib: "Impôt (IRPP + CSS)", val: dt0(b.cles.impot) },
      { lib: "Santé financière", val: b.cles.score + "/100", c: couleurScore(b.cles.score), fond: C.violetClair, bord: C.violetClair }
    ]);

    var co = b.coordonnees;
    if (co) {
      section("Mes coordonnées", 14);
      paires([["Nom", co.nom], ["E-mail", co.email], ["Téléphone", co.telephone], ["Employeur", co.employeur], ["Poste", co.poste],
        ["Date d'embauche", co.dateEmbauche ? co.dateEmbauche.split("-").reverse().join("/") : ""]]);
    }

    var rv = b.revenus;
    if (rv) {
      section("Revenus et impôt", 30);
      paires([["Brut " + (b.complete ? "de l'année" : "depuis janvier"), dt3(rv.brut)], ["Net " + (b.complete ? "de l'année" : "depuis janvier"), dt3(rv.net)],
        ["Cotisations sociales", dt3(rv.cotisations)], ["Impôt (IRPP + CSS)", dt3(rv.impot)],
        ["Net mensuel actuel", dt3(rv.netMensuel)], ["Brut mensuel actuel", dt3(rv.brutMensuel)],
        ["Salaires par an", String(rv.salaires)], ["Part du brut pour vous", pct(rv.pourVous)]]);
      if (rv.hausses.length) note("Hausse" + (rv.hausses.length > 1 ? "s" : "") + " de salaire : " + rv.hausses.map(function (h) { return h.mois + " (+" + dt3(h.net) + " net par mois)"; }).join(", ") + ".", C.vertClair, C.vert);
      if (rv.pouvoir) note("Pouvoir d'achat : salaire " + signe(rv.pouvoir.evolution) + " pour une inflation de " + pct(rv.pouvoir.inflation) + (rv.pouvoir.provisoire ? " (provisoire)" : "") +
        ", soit " + signe(rv.pouvoir.gain) + " de pouvoir d'achat.", rv.pouvoir.gain >= 0 ? C.vertClair : C.rougeClair, rv.pouvoir.gain >= 0 ? C.vert : C.rouge);
      if (rv.impotFiche) note("Impôt aligné sur votre fiche de paie.");
    }

    var cr = b.credits;
    if (cr) {
      section("Crédits et capacité", 24);
      if (cr.liste.length) {
        var lc = cr.liste.map(function (c) {
          return [c.libelle, c.tauxPct ? pct(c.tauxPct / 100, 2) : "-", dt3(c.mensualite), c.resteDu != null ? dt0(c.resteDu) + (c.estime ? "*" : "") : "-", c.fin || (c.restantes ? ans(c.restantes) : "-")];
        });
        var tot = cr.liste.reduce(function (s, c) { return s + c.mensualite; }, 0), totR = cr.liste.reduce(function (s, c) { return s + (c.resteDu || 0); }, 0);
        tableau([{ titre: "Crédit", l: 58 }, { titre: "Taux", l: 22, droite: true }, { titre: "Mensualité", l: 32, droite: true }, { titre: "Reste dû", l: 32, droite: true }, { titre: "Fin", l: 34, droite: true }],
          lc, cr.liste.length > 1 ? ["Total", "", dt3(tot), dt0(totR), ""] : null);
        if (cr.liste.some(function (c) { return c.estime; })) { police(7.5, false, C.doux); texte("* reste dû estimé d'après la mensualité, le taux et les échéances restantes.", M, y + 2); y += 5; }
      } else note("Aucun crédit en cours.", C.vertClair, C.vert);
      if (cr.annee) paires([["Capital remboursé cette année", dt3(cr.annee.capital)], ["Intérêts payés cette année", dt3(cr.annee.interets)]]);
      if (cr.annee && cr.annee.soldes.length) note("Soldé cette année : " + cr.annee.soldes.join(", ") + ".", C.vertClair, C.vert);
      paires([["Endettement (" + cr.base + ")", pct(cr.endettement)], ["Plafond de la banque", pct(cr.quotite, 0)], ["Mensualités en cours", dt3(cr.charges)], ["Mensualité encore possible", dt3(cr.mensualiteMax)]]);
      var capa = cr.capacite.filter(function (c) { return c.capital > 0; });
      if (capa.length) tableau([{ titre: "Nouveau crédit possible", l: 80 }, { titre: "Durée", l: 34, droite: true }, { titre: "Taux", l: 30, droite: true }, { titre: "Montant", l: 34, droite: true }],
        capa.map(function (c) { return [c.type, ans(c.dureeMois), pct(c.tauxPct / 100, 2), dt0(c.capital)]; }));
      else note("Aucune marge pour un nouveau crédit avec la règle actuelle de votre banque.", C.rougeClair, C.rouge);
    }

    var pt = b.patrimoine;
    if (pt) {
      section("Épargne et patrimoine", 30);
      var n = Math.max(pt.actifs.length, pt.passifs.length), lp = [];
      for (var i = 0; i < n; i++) {
        var a = pt.actifs[i], d = pt.passifs[i];
        lp.push([a ? a.libelle : "", a ? dt0(a.montant) : "", d ? d.libelle + (d.estime ? "*" : "") : "", d ? dt0(d.montant) : ""]);
      }
      tableau([{ titre: "Ce que vous possédez", l: 58 }, { titre: "", l: 31, droite: true }, { titre: "Ce que vous devez", l: 58 }, { titre: "", l: 31, droite: true }], lp,
        ["Total", dt0(pt.totalActifs), "", dt0(pt.totalPassifs)]);
      tuiles([{ lib: "Patrimoine net", val: dt0(pt.net), c: pt.net >= 0 ? C.vert : C.rouge, fond: C.vertClair, bord: C.vertClair }, { lib: "Il grandit de", val: dt0(pt.parMois) + "/mois" }]);
      if (!pt.logementSaisi) note("Valeur du logement non indiquée : ajoutez-la dans Mon orbite › Patrimoine pour un chiffre complet.");
      var e = pt.epargneAnnee;
      if (e) { place(14); paires([["Versé sur l'assurance vie", dt3(e.av)], ["Versé sur le CEA", dt3(e.cea)], ["Épargne notée (objectifs)", dt3(e.objectifs)], ["Impôt évité grâce à l'épargne", dt3(e.impotEvite)]]); }
    }

    var sa = b.sante;
    if (sa) {
      section("Score de santé et conseils", 40);
      police(22, true, couleurScore(sa.score)); texte(sa.score + "/100", M, y + 7);
      police(10, true, C.encre); texte(sa.niveau, M + 34, y + 7);
      y += 12;
      sa.composantes.forEach(function (c) {
        police(8.6, true, C.encre);
        var l = doc.splitTextToSize(txt(c.detail || ""), W - 2 * M - 70), h = Math.max(10, l.length * 3.6 + 3.5);
        place(h);
        texte(c.libelle, M, y + 3.6);
        police(8.6, true, C.doux); texte(c.points + "/" + c.max, M + 58, y + 3.6, { align: "right" });
        barre(M, y + 5, 58, c.max ? c.points / c.max : 0, couleurScore(c.max ? c.points / c.max * 100 : 0));
        police(8, false, C.texte); doc.text(l, M + 64, y + 3.6);
        y += h;
      });
      if (sa.conseils.length) {
        y += 2;
        sa.conseils.forEach(function (c) { note(c.titre + (c.texte ? " — " + c.texte : "")); });
      }
    }

    pied();
    return doc.output("blob");
  }

  racine.BilanPDF = { generer: generer, _txt: txt };
})(typeof self !== "undefined" ? self : this);
