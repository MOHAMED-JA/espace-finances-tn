/*
 * Orbite — note de négociation en PDF (jsPDF, copie locale chargée à la demande), fabriquée sur l'appareil.
 * Deux versions : « pour moi » (aide-mémoire complet : plancher, cible, ancre, part gardée, alternatives, phrase)
 * et « pour mon responsable » (demande propre : salaire demandé = chiffre annoncé, arguments, réalisations ;
 * ni plancher, ni marge, ni alternatives). Entrée : { r (Negociateur.preparer), version: "moi" | "responsable",
 * nom, poste, employeur, dateTexte }. Polices standard du PDF (Helvetica, Windows-1252).
 */
(function (racine) {
  "use strict";

  var W = 210, H = 297, M = 18, BAS = H - 17;
  var C = {
    encre: [20, 26, 51], texte: [52, 58, 88], doux: [91, 98, 131], trait: [227, 230, 240], fond: [245, 246, 251],
    vert: [6, 118, 71], vertClair: [236, 249, 242], bleu: [31, 69, 199], bleuClair: [238, 242, 255],
    ambre: [138, 90, 0], ambreClair: [254, 244, 211], violet: [89, 37, 220]
  };

  function txt(s) {
    return String(s == null ? "" : s).replace(/[   ]/g, " ").replace(/→/g, "->").replace(/−/g, "-")
      .replace(/ᵉ/g, "e").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[“”]/g, '"');
  }
  function grouper(n) { return n.replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dt0(v) { return (v < 0 ? "-" : "") + grouper(String(Math.round(Math.abs(v)))) + " DT"; }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 1 : d).replace(".", ",") + " %"; }
  function signe(v, f) { return (v >= 0 ? "+" : "-") + f(Math.abs(v)); }

  function generer(d) {
    var doc = new racine.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    var r = d.r, a = r.arguments, moi = d.version !== "responsable", y = 0;

    function couleur(fn, c) { doc[fn](c[0], c[1], c[2]); }
    function police(t, gras, c) { doc.setFont("helvetica", gras ? "bold" : "normal"); doc.setFontSize(t); couleur("setTextColor", c || C.encre); }
    function texte(s, x, yy, o) { doc.text(txt(s), x, yy, o); }
    function place(h) { if (y + h > BAS) { doc.addPage(); y = 22; } }
    function section(s, besoin) {
      y += 3.5; place(9 + (besoin || 12));
      police(8.5, true, moi ? C.vert : C.bleu); texte(s.toUpperCase(), M, y);
      couleur("setDrawColor", C.trait); doc.setLineWidth(0.25); doc.line(M, y + 1.8, W - M, y + 1.8);
      y += 6;
    }
    function paragraphe(s, t, c) {
      police(t || 9.4, false, c || C.texte);
      var l = doc.splitTextToSize(txt(s), W - 2 * M), h = l.length * (t || 9.4) * 0.43 + 1;
      place(h); police(t || 9.4, false, c || C.texte); doc.text(l, M, y + 3.4); y += h + 1.5;
    }
    function puces(liste) {
      liste.forEach(function (s) {
        police(9.4, false, C.texte);
        var l = doc.splitTextToSize(txt(s), W - 2 * M - 6), h = l.length * 3.95 + 1.3;
        place(h);
        couleur("setFillColor", moi ? C.vert : C.bleu); doc.circle(M + 1.3, y + 2.3, 0.75, "F");
        police(9.4, false, C.texte); doc.text(l, M + 5, y + 3.4);
        y += h;
      });
      y += 1;
    }
    function paires(liste) {
      var col = (W - 2 * M - 10) / 2;
      for (var i = 0; i < liste.length; i += 2) {
        place(5.9);
        [liste[i], liste[i + 1]].forEach(function (p, k) {
          if (!p) return;
          var x = M + k * (col + 10);
          police(9, false, C.doux); texte(p[0], x, y + 3.8);
          police(9, true, p[2] || C.encre); texte(p[1], x + col, y + 3.8, { align: "right" });
          couleur("setDrawColor", C.trait); doc.setLineWidth(0.15); doc.setLineDashPattern([0.4, 0.8], 0); doc.line(x, y + 5.4, x + col, y + 5.4); doc.setLineDashPattern([], 0);
        });
        y += 5.9;
      }
      y += 0.5;
    }
    function encadre(s, fond, bord, t) {
      police(t || 10, false, C.encre);
      var l = doc.splitTextToSize(txt(s), W - 2 * M - 10), h = l.length * (t || 10) * 0.45 + 6;
      place(h + 1);
      couleur("setFillColor", fond); doc.rect(M, y, W - 2 * M, h, "F");
      couleur("setFillColor", bord); doc.rect(M, y, 1, h, "F");
      police(t || 10, false, C.encre); doc.text(l, M + 5, y + 5.2);
      y += h + 3;
    }
    function tuiles(liste) {
      var g = 4, w = (W - 2 * M - g * (liste.length - 1)) / liste.length, h = 20;
      place(h + 3);
      liste.forEach(function (t, i) {
        var x = M + i * (w + g);
        couleur("setFillColor", t.fond || [255, 255, 255]); couleur("setDrawColor", t.bord || C.trait); doc.setLineWidth(0.3);
        doc.roundedRect(x, y, w, h, 2, 2, "FD");
        if (t.trait) { couleur("setFillColor", t.trait); doc.rect(x + 0.6, y, w - 1.2, 1.1, "F"); }
        police(7, true, C.doux); texte(t.lib.toUpperCase(), x + 4, y + 6.4);
        police(14, true, t.c || C.encre); texte(t.val, x + 4, y + 12.8);
        police(8, false, C.doux); texte(t.sous || "", x + 4, y + 17.2);
      });
      y += h + 3;
    }
    function tableau(cols, lignes) {
      var hl = 5.9;
      place((lignes.length + 1) * hl + 2);
      function ligne(vals, entete) {
        var x = M;
        police(entete ? 7.8 : 9, entete, entete ? C.doux : C.encre);
        vals.forEach(function (v, i) { var c = cols[i]; texte(v, c.droite ? x + c.l - 1.5 : x + 1.5, y + 4.3, c.droite ? { align: "right" } : undefined); x += c.l; });
        couleur("setDrawColor", C.trait); doc.setLineWidth(entete ? 0.3 : 0.15); doc.line(M, y + hl, W - M, y + hl);
        y += hl;
      }
      ligne(cols.map(function (c) { return c.titre; }), true);
      lignes.forEach(function (l) { ligne(l, false); });
      y += 2;
    }

    /* Arguments vérifiables, communs aux deux versions. */
    function faits() {
      var l = [];
      if (a.prix > 0.005) l.push((a.type === "hausse" ? "Depuis ma dernière augmentation (" + a.depuisLib + ")" : a.type === "embauche" ? "Depuis mon arrivée (" + a.depuisLib + ")" : "Sur la dernière année") +
        ", les prix ont augmenté de " + pct(a.prix) + " : à salaire égal, le pouvoir d'achat a baissé de " + pct(-a.pouvoirAchat) + ".");
      if (a.anciennete) l.push(a.ancienneteLib + " dans l'entreprise" + (a.sansHausse ? ", dont " + a.sansHausseLib + " sans augmentation." : "."));
      return l;
    }

    /* ---------- En-tête ---------- */
    y = 18;
    police(8.5, false, C.doux);
    texte(d.dateTexte, W - M, y, { align: "right" });
    if (moi) { police(8, true, C.ambre); texte("DOCUMENT PERSONNEL - NE PAS REMETTRE", M, y); }
    y += 9;
    police(20, true); texte(moi ? "Ma négociation de salaire" : "Demande de révision de salaire", M, y);
    y += 7;
    police(10, false, C.doux);
    var qui = [d.nom, d.poste, d.employeur].filter(Boolean).join(" · ");
    if (qui) { texte(qui, M, y); y += 5; }
    y += 2;

    var act = r.actuel, dem = r.ancre;
    if (moi) {
      tuiles([
        { lib: "Plancher", val: dt0(r.plancher.brut), sous: dt0(r.plancher.net) + " net · ne pas accepter moins", trait: C.ambre },
        { lib: "Cible", val: dt0(r.cible.brut), sous: dt0(r.cible.net) + " net · ce que je veux", trait: C.vert },
        { lib: "Ancre", val: dt0(r.ancre.brut), sous: dt0(r.ancre.net) + " net · le chiffre à annoncer", trait: C.bleu }
      ]);
      if (r.cibleSousPlancher) encadre("Attention : la cible reste sous le plancher. Elle ne rattrape pas la hausse des prix depuis " + (a.depuisLib || "un an") + ".", C.ambreClair, C.ambre, 9.4);
      section("De mon salaire actuel à la cible", 26);
      paires([
        ["Brut actuel par mois", dt0(act.brut)], ["Net actuel par mois", dt0(act.net)],
        ["Brut cible par mois", dt0(r.cible.brut), C.vert], ["Net cible par mois", dt0(r.cible.net), C.vert],
        ["Hausse brute", signe(r.hausse.brut, dt0) + " (" + signe(r.hausse.pct, pct) + ")"], ["Hausse nette", signe(r.hausse.net, dt0) + " (" + signe(r.hausse.netPct, pct) + ")"],
        ["Net en plus sur l'année", signe(r.hausse.netAnnuel, dt0)], ["Coût en plus pour l'entreprise", signe(r.hausse.cout, dt0) + " par mois"]
      ]);
      var g = r.garde;
      paragraphe("Sur 100 DT de hausse brute, je garde " + Math.round(g.net * 100) + " DT net ; " + Math.round(g.cnss * 100) + " DT partent en CNSS, " + Math.round(g.irpp * 100) + " DT en IRPP" + (Math.round(g.css * 100) > 0 ? " et " + Math.round(g.css * 100) + " DT en CSS." : "."), 9);
    } else {
      tuiles([
        { lib: "Salaire actuel", val: dt0(act.brut), sous: "brut par mois" },
        { lib: "Salaire demandé", val: dt0(dem.brut), sous: "brut par mois", trait: C.bleu, c: C.bleu },
        { lib: "Évolution", val: signe(dem.brut / act.brut - 1, pct), sous: signe(dem.brut - act.brut, dt0) + " brut par mois" }
      ]);
    }

    var f = faits();
    if (f.length || !moi) {
      section(moi ? "Mes arguments" : "Pourquoi cette demande", f.length * 9 + 4);
      if (moi) f.push("Pour l'entreprise, la cible coûte " + signe(r.hausse.cout, dt0) + " par mois, cotisations patronales comprises (" + signe(r.hausse.coutPct, pct) + ").");
      if (f.length) puces(f); else paragraphe("Je souhaite faire le point sur mon salaire au regard de mon travail et de mon évolution.");
    }
    if (r.reussites.length) {
      section(moi ? "Mes réalisations à citer" : "Mes réalisations", r.reussites.length * 6 + 4);
      puces(r.reussites.map(function (s) { return s.replace(/[.;]+$/, "") + "."; }));
    }

    if (moi) {
      var al = r.alternatives, lg = W - 2 * M, lignes = [["Une prime unique dans l'année", dt0(al.prime) + " brut", "100 %"]];
      if (al.salaireDePlus) lignes.push(["Un " + al.salaireDePlus.rang + "e salaire par an", signe(al.salaireDePlus.gain, dt0) + " net par an", Math.round(al.salaireDePlus.part * 100) + " %"]);
      lignes.push(["En deux temps (maintenant, puis dans 6 mois)", "2 x " + dt0(al.deuxTemps.moitie) + " brut", Math.round(al.deuxTemps.part * 100) + " %"]);
      section("Si le salaire mensuel bloque", (lignes.length + 1) * 6.4 + 10);
      tableau([{ titre: "Alternative", l: lg * 0.5 }, { titre: "Montant", l: lg * 0.3, droite: true }, { titre: "Part du gain la 1re année", l: lg * 0.2, droite: true }], lignes);
      section("Ma phrase", 20);
      encadre("« " + r.phrase + " »", C.vertClair, C.vert);
      section("Pendant l'entretien", 14);
      puces(["Annoncer l'ancre en premier, puis laisser répondre. Ne pas descendre sous le plancher.", "Si le mensuel bloque, proposer une alternative du tableau.",
        "Faire confirmer le montant et le mois d'effet par écrit, puis l'enregistrer dans Orbite (« J'ai obtenu… »)."]);
    } else {
      section("Ma demande", 18);
      paragraphe(r.phrase.replace(/^Depuis[^.]*\.\s*/, "").replace(/^Sur la dernière année[^.]*\.\s*/, "").replace(/^Parmi mes réalisations[^.]*\.\s*/, "") +
        " Je reste disponible pour en parler et pour convenir ensemble de la date d'effet.", 10, C.encre);
    }

    /* Pied de page. */
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      couleur("setDrawColor", C.trait); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
      police(7.5, false, C.doux);
      texte((moi ? "Calculé avec Orbite (barème de paie " + d.annee + ")" : "Montants bruts mensuels hors primes") +
        (a.prix > 0.005 ? ". Prix : moyennes annuelles de l'INS" + (a.provisoire ? ", " + d.annee + " provisoire" : "") + "." : "."), M, H - 9.5);
      if (n > 1) texte("Page " + i + " sur " + n, W - M, H - 9.5, { align: "right" });
    }
    return doc.output("blob");
  }

  racine.NegociateurPDF = { generer: generer, _txt: txt };
})(typeof self !== "undefined" ? self : this);
