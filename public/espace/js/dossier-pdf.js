/*
 * Orbite — mise en page du « dossier banque » en PDF (jsPDF, copie locale chargée à la demande). Aucune donnée ne quitte
 * l'appareil : la sortie est un Blob. Entrée : l'objet préparé par dossier-calcul.js (Dossier.construire).
 * Polices standard du PDF (Helvetica) : les caractères hors de l'encodage Windows-1252 sont remplacés.
 */
(function (racine) {
  "use strict";

  var W = 210, H = 297, M = 16, BAS = H - 20;
  var C = {
    encre: [20, 26, 51], texte: [52, 58, 88], doux: [91, 98, 131], trait: [227, 230, 240], fond: [245, 246, 251],
    violet: [74, 63, 208], violetClair: [243, 241, 255], vert: [17, 135, 90], vertClair: [236, 249, 242],
    rouge: [201, 58, 58], rougeClair: [253, 240, 240], gris: [154, 161, 191]
  };

  function txt(s) {
    return String(s == null ? "" : s)
      .replace(/[   ]/g, " ").replace(/→/g, "->").replace(/−/g, "-")
      .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/ᵉ/g, "e");
  }
  function grouper(n) { return n.replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt3(v) { var s = (Math.round(v * 1000) / 1000).toFixed(3).split("."); return (v < 0 ? "-" : "") + grouper(s[0].replace("-", "")) + "," + s[1] + " DT"; }
  function dt0(v) { return grouper(String(Math.round(v))) + " DT"; }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %"; }
  function tx(v) { return v == null ? "-" : v.toFixed(2).replace(".", ",") + " %"; }

  function generer(d) {
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
      texte("Établi le " + d.dateTexte, W - M, 14.5, { align: "right" });
      texte("Réf. " + d.reference, W - M, 18.8, { align: "right" });
      y = premiere ? 30 : 26;
    }

    function pied() {
      var n = doc.getNumberOfPages();
      for (var i = 1; i <= n; i++) {
        doc.setPage(i);
        couleur("setDrawColor", C.trait); doc.setLineWidth(0.2); doc.line(M, H - 13, W - M, H - 13);
        police(7.5, false, C.doux);
        texte("Simulation indicative établie avec Orbite, à partir des informations déclarées. Elle ne vaut pas accord de la banque.", M, H - 9);
        texte("Page " + i + " sur " + n, W - M, H - 9, { align: "right" });
      }
    }

    function place(h) { if (y + h > BAS) { doc.addPage(); entete(false); return true; } return false; }

    /* Titre de section : il reste avec le bloc qui suit (hauteur « besoin », en mm). */
    function section(s, besoin) {
      y += 4;
      place(9.5 + (besoin || 12));
      police(8.5, true, C.violet);
      texte(s.toUpperCase(), M, y);
      couleur("setDrawColor", C.trait); doc.setLineWidth(0.25); doc.line(M, y + 1.8, W - M, y + 1.8);
      y += 6.5;
    }

    /* Paires libellé / valeur sur deux colonnes. */
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

    /* Tableau : colonnes [{ titre, l (largeur mm), droite }], lignes de textes, pied facultatif (en gras). */
    function hTableau(n, total) { return (n + 1 + (total ? 1 : 0)) * 6 + 2; }
    function tableau(cols, lignes, total) {
      /* Un tableau qui tient sur une page n'est jamais coupé. */
      var hT = hTableau(lignes.length, total);
      if (hT < BAS - 30) place(hT);
      function ligne(vals, gras, entete) {
        place(6);
        var x = M;
        police(entete ? 7.8 : 8.6, gras || entete, entete ? C.doux : C.encre);
        vals.forEach(function (v, i) { var c = cols[i]; texte(v, c.droite ? x + c.l - 1.5 : x + 1.5, y + 4, c.droite ? { align: "right" } : undefined); x += c.l; });
        couleur("setDrawColor", gras ? C.encre : C.trait); doc.setLineWidth(gras || entete ? 0.3 : 0.15);
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

    function paragraphe(s, taille) {
      police(taille || 8.4, false, C.doux);
      var l = doc.splitTextToSize(txt(s), W - 2 * M), h = l.length * (taille || 8.4) * 0.42 + 1;
      place(h);
      police(taille || 8.4, false, C.doux); doc.text(l, M, y + 3); y += h + 1;
    }

    /* Tuiles clés en tête de dossier. */
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

    /* Jauge d'endettement : actuel (gris), après (vert ou rouge), trait du plafond. */
    function jauge(avant, apres, ok, q) {
      place(12);
      var w = W - 2 * M, max = Math.max(0.6, apres * 1.05, q * 1.25), xs = function (v) { return M + Math.min(1, v / max) * w; };
      couleur("setFillColor", C.fond); doc.roundedRect(M, y, w, 3.4, 1.7, 1.7, "F");
      if (apres != null) { couleur("setFillColor", ok ? C.vert : C.rouge); doc.roundedRect(M, y, Math.max(3.4, xs(apres) - M), 3.4, 1.7, 1.7, "F"); }
      couleur("setFillColor", C.gris); doc.roundedRect(M, y, Math.max(3.4, xs(avant) - M), 3.4, 1.7, 1.7, "F");
      couleur("setDrawColor", C.encre); doc.setLineWidth(0.5); doc.line(xs(q), y - 1.2, xs(q), y + 4.6);
      police(7.5, false, C.doux);
      texte("Gris : endettement actuel " + pct(avant), M, y + 8.2);
      if (apres != null) texte((ok ? "Vert" : "Rouge") + " : après le crédit demandé " + pct(apres), M + 58, y + 8.2);
      texte("Trait : plafond " + pct(q, 0), W - M, y + 8.2, { align: "right" });
      y += 12;
    }

    /* ---------------- Page 1 ---------------- */
    entete(true);
    var dem = d.demande, dn = d.demandeur, rv = d.revenus, cap = d.capacite;
    police(19, true); texte("Dossier de demande de crédit", M, y + 4);
    police(9, false, C.doux);
    texte("Situation financière de " + (dn.nom || "l'emprunteur") + (d.conjoint ? " et " + d.conjoint.prenom : "") + (d.banque ? ", à remettre à " + d.banque : ""), M, y + 10);
    y += 16;

    tuiles([
      { lib: d.deuxNoms ? "Revenu retenu du foyer" : "Revenu retenu", val: dt3(cap.revenu) },
      dem ? { lib: "Endettement après", val: pct(dem.endettementApres) } : { lib: "Disponible par mois", val: dt3(cap.disponible) },
      dem ? { lib: "Règle des " + pct(d.quotite, 0), val: dem.respecte ? "Respectée" : "Dépassée", c: dem.respecte ? C.vert : C.rouge, fond: dem.respecte ? C.vertClair : C.rougeClair, bord: dem.respecte ? C.vert : C.rouge }
        : { lib: "Endettement actuel", val: pct(cap.endettement) }
    ]);

    section("Demandeur");
    paires([
      ["Nom", dn.nom], ["Né·e le", dn.dateNaissance ? dn.dateNaissance + " (" + dn.age + " ans)" : dn.age + " ans"],
      ["Situation", dn.situation], ["Contrat", dn.contrat],
      ["Employeur", dn.employeur], ["Poste", dn.poste],
      ["Embauché·e le", dn.dateEmbauche ? dn.dateEmbauche + (dn.anciennete != null ? " (" + dn.anciennete + (dn.anciennete > 1 ? " ans)" : " an)") : "") : ""],
      ["Banque", d.banque], ["Téléphone", d.coordonnees ? dn.telephone : ""], ["Email", d.coordonnees ? dn.email : ""]
    ]);

    section(d.retraite ? "Pension" : "Revenus");
    paires([
      [d.retraite ? "Pension brute par mois" : "Salaire brut mensuel", dt3(rv.brutMensuel)], [d.retraite ? "Pension nette par mois" : "Salaire net mensuel", dt3(rv.netMensuel)],
      [d.retraite ? "Versements par an" : "Salaires par an", String(rv.nombreSalaires)], ["Net de l'année", dt3(rv.netAnnuel)],
      ["Autres revenus par mois", rv.autres > 0 ? dt3(rv.autres) : ""], ["Revenu retenu (" + rv.regle.toLowerCase() + ")", dt3(rv.retenu), C.violet]
    ]);
    rv.hausses.forEach(function (h) { note("Hausse de salaire prévue à partir de " + h.date + " : " + dt3(h.brutMensuel) + " brut, soit " + dt3(h.netMensuel) + " net par mois."); });

    if (d.conjoint) {
      section("Co-emprunteur : " + d.conjoint.prenom);
      paires([["Salaire brut mensuel", dt3(d.conjoint.brutMensuel)], ["Salaire net mensuel", dt3(d.conjoint.netMensuel)],
        ["Revenu retenu", dt3(d.conjoint.retenu), C.violet], ["Mensualités de ses crédits", dt3(d.conjoint.credits)]]);
    }

    section("Crédits en cours", d.credits.length ? hTableau(d.credits.length, d.credits.length > 1) : 8);
    if (d.credits.length) {
      var lg = W - 2 * M;
      tableau([{ titre: "Crédit", l: lg * 0.30 }, { titre: "Mensualité", l: lg * 0.18, droite: true }, { titre: "Reste dû", l: lg * 0.20, droite: true }, { titre: "Taux", l: lg * 0.12, droite: true }, { titre: "Fin", l: lg * 0.20, droite: true }],
        d.credits.map(function (c) { return [c.libelle, dt3(c.mensualite), (c.estime ? "env. " : "") + dt3(c.capitalRestant), tx(c.tauxPct), c.fin || "-"]; }),
        d.credits.length > 1 ? ["Total", dt3(d.totalMensualites), dt3(d.totalReste), "", ""] : null);
      if (d.credits.some(function (c) { return c.estime; })) paragraphe("« env. » : reste dû estimé d'après la mensualité, le taux et les échéances restantes.", 7.6);
    } else paragraphe("Aucun crédit en cours.", 8.8);
    if (d.loyer > 0) paragraphe("Loyer mensuel déclaré : " + dt3(d.loyer) + " (non compté par la banque dans le taux d'endettement).", 8);

    if (dem) {
      section("Crédit demandé", 34);
      paires([
        ["Type" + (dem.objet ? " · objet" : ""), dem.court + (dem.objet ? " · " + dem.objet : "")], ["Montant", dt3(dem.montant)],
        ["Durée · taux", dem.dureeMois + " mois · " + tx(dem.tauxPct)], ["Mensualité", dt3(dem.mensualite), C.violet],
        ["Coût des intérêts", dt3(dem.interets)], ["Coût total", dt3(dem.coutTotal)]
      ]);
      jauge(dem.endettementAvant, dem.endettementApres, dem.respecte, d.quotite);
      note("Capacité : " + pct(d.quotite, 0) + " × " + dt3(cap.revenu) + " = " + dt3(cap.plafond) + " par mois, moins " + dt3(cap.charges) + " de crédits en cours = " + dt3(cap.disponible) + " disponibles. " +
        (dem.respecte ? "Le crédit demandé en utilise " + dt3(dem.mensualite) + "." : "Le crédit demandé dépasse ce plafond de " + dt3(dem.depassement) + " par mois.") +
        " À ces conditions, le montant maximum est de " + dt0(Math.floor(dem.capitalMax)) + ".",
        dem.respecte ? C.violetClair : C.rougeClair, dem.respecte ? C.violet : C.rouge);
      if (dem.dureeTropLongue) note("Attention : le crédit se terminerait à " + dem.ageFin + " ans. Les banques limitent en général la fin du crédit à 70 ans.", C.rougeClair, C.rouge);
    } else {
      section("Capacité d'emprunt", 30);
      jauge(cap.endettement, null, true, d.quotite);
      note("Capacité : " + pct(d.quotite, 0) + " × " + dt3(cap.revenu) + " = " + dt3(cap.plafond) + " par mois, moins " + dt3(cap.charges) + " de crédits en cours = " + dt3(cap.disponible) + " disponibles chaque mois.");
      var lg2 = W - 2 * M;
      tableau([{ titre: "Type de crédit", l: lg2 * 0.34 }, { titre: "Durée", l: lg2 * 0.2, droite: true }, { titre: "Taux", l: lg2 * 0.18, droite: true }, { titre: "Montant maximum", l: lg2 * 0.28, droite: true }],
        d.maxParType.map(function (t) { return [t.libelle, t.dureeMois + " mois", tx(t.tauxPct), dt0(Math.floor(t.capital))]; }));
    }

    /* ---------------- Suite ---------------- */
    if (dem && d.options.echeancier) {
      var lg3 = W - 2 * M, ech = dem.echeancier;
      var lignes = ech.length <= 12 ? ech : ech.slice(0, 5).concat([null]).concat(ech.slice(-4));
      section("Échéancier du crédit demandé", hTableau(lignes.length, true));
      tableau([{ titre: "Année", l: lg3 * 0.22 }, { titre: "Capital remboursé", l: lg3 * 0.26, droite: true }, { titre: "Intérêts", l: lg3 * 0.24, droite: true }, { titre: "Reste dû en fin d'année", l: lg3 * 0.28, droite: true }],
        lignes.map(function (l) { return l ? ["Année " + l.annee, dt3(l.capital), dt3(l.interets), dt3(l.reste)] : ["...", "", "", ""]; }),
        ["Total", dt3(dem.montant), dt3(dem.interets), "Coût total " + dt3(dem.coutTotal)]);
    }

    if (d.options.paliers && d.paliers.length > 1) {
      section("Capacité dans le temps", hTableau(d.paliers.length));
      var lg4 = W - 2 * M;
      tableau([{ titre: "À partir de", l: lg4 * 0.24 }, { titre: "Ce qui change", l: lg4 * 0.48 }, { titre: "Disponible par mois", l: lg4 * 0.28, droite: true }],
        d.paliers.map(function (x) { return [x.date, x.evenement, dt3(x.disponible)]; }));
    }

    if (d.options.pieces) {
      section("Pièces habituellement demandées", Math.ceil(d.pieces.length / 2) * 5.4 + 6);
      var col = (W - 2 * M - 8) / 2, moitie = Math.ceil(d.pieces.length / 2);
      for (var i = 0; i < moitie; i++) {
        place(5.4);
        [d.pieces[i], d.pieces[i + moitie]].forEach(function (pc, k) {
          if (!pc) return;
          var x = M + k * (col + 8);
          couleur("setDrawColor", C.doux); doc.setLineWidth(0.25); doc.rect(x, y + 1.2, 2.6, 2.6, "S");
          police(8.4, false, C.texte);
          texte(doc.splitTextToSize(txt(pc), col - 5)[0], x + 4.5, y + 3.6);
        });
        y += 5.4;
      }
      paragraphe("Liste indicative : chaque banque fixe la sienne.", 7.6);
    }

    section("Comment ces chiffres sont calculés", 16);
    paragraphe((d.retraite ? "Pension nette" : "Salaire net") + " calculé selon le barème de l'IRPP et les cotisations " + (d.retraite ? "applicables aux pensions" : "sociales") + " en vigueur. " +
      "Revenu retenu : " + rv.regle.toLowerCase() + (d.deuxNoms ? ", revenus des deux co-emprunteurs additionnés" : "") + ". " +
      "Plafond d'endettement : " + pct(d.quotite, 0) + " du revenu retenu, moins les mensualités des crédits en cours. " +
      "Mensualités à taux fixe et échéances constantes ; fin du crédit limitée à 70 ans.");

    pied();
    return doc.output("blob");
  }

  racine.DossierPDF = { generer: generer, _txt: txt, _dt3: dt3 };
})(typeof self !== "undefined" ? self : this);
