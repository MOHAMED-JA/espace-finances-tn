/*
 * Orbite — calendrier de l'argent (point 5, choix validé le 12 oct. 2026 : nouvelle page du menu).
 * Une seule vue : échéances des crédits et leur dernière échéance, versements d'épargne, paie et versements en plus
 * (13e mois, primes), date limite fiscale du 31 décembre, et les rappels déjà en place (essai, abonnement, réduction de taux,
 * rappels personnels). Export vers l'agenda du téléphone (.ics).
 * Fonctions pures. Node : require('.../calendrier-calcul.js') — navigateur : window.CalendrierCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.CalendrierCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function deux(n) { return String(n).padStart(2, "0"); }
  function iso(a, m0, j) { return a + "-" + deux(m0 + 1) + "-" + deux(j); }
  function dernierJour(a, m0) { return new Date(a, m0 + 1, 0).getDate(); }
  function jourDans(a, m0, j) { var d = dernierJour(a, m0); return j >= 1 ? Math.min(Math.round(j), d) : d; }

  /**
   * Événements du mois (a, m0 : année et mois 0-11). p : profil normalisé (crédits avec moisRestants), o :
   * { maintenant, net (paie du mois), rappels: [{ quand, titre, type, url }] }.
   * Seuls les mois à venir (ou le mois en cours) portent les échéances : le passé ne se reconstitue pas.
   */
  function evenements(p, a, m0, o) {
    var x = p || {}, opt = o || {}, mt = opt.maintenant || new Date(), res = [];
    var ecart = (a * 12 + m0) - (mt.getFullYear() * 12 + mt.getMonth());
    function ajouter(j, type, libelle, montant, detail) { res.push({ date: iso(a, m0, j), jour: j, type: type, libelle: libelle, montant: montant == null ? null : Math.round(montant * 1000) / 1000, detail: detail || "" }); }
    if (ecart >= 0) {
      (x.credits || []).forEach(function (c) {
        var n = Math.round(num(c.moisRestants, 0));
        if (!(num(c.mensualite, 0) > 0) || ecart >= n) return;
        var j = jourDans(a, m0, num(c.jourPrelevement, 0) || 1);
        ajouter(j, "credit", c.libelle || "Crédit", c.mensualite, num(c.jourPrelevement, 0) ? "" : "jour du prélèvement à préciser");
        if (ecart === n - 1) ajouter(j, "fin", "Dernière échéance : " + (c.libelle || "crédit"), null, "La mensualité se libère le mois suivant.");
      });
      var ep = 0;
      (x.contrats || []).forEach(function (c) { if (!(c.anneeDebut > 0) || c.anneeDebut * 12 + (c.moisDebut || 1) - 1 <= a * 12 + m0) ep += num(c.versementMensuel, 0); });
      if (ep > 0) ajouter(jourDans(a, m0, num(x.jourVersement, 0) || 1), "epargne", "Versement d'épargne", ep, num(x.jourVersement, 0) ? "" : "jour du versement à préciser");
      var jp = jourDans(a, m0, num(x.jourPaie, 0));
      if (x.activite !== "retraite" || num(x.montant, 0) > 0) ajouter(jp, "paie", x.activite === "retraite" ? "Pension" : "Paie", num(opt.net, 0) > 0 ? opt.net : null);
      var cal = Array.isArray(x.calendrierPrimes) && x.calendrierPrimes.length === 12 ? x.calendrierPrimes : null, plus = 0;
      if (cal) plus = num(cal[m0], 0);
      else if (m0 === 11 && num(x.nombreSalaires, 12) > 12) plus = num(x.nombreSalaires, 12) - 12;
      if (plus > 0) ajouter(jp, "prime", "Versement en plus : " + String(plus).replace(".", ",") + " salaire" + (plus > 1 ? "s" : ""), null);
    }
    if (m0 === 11) ajouter(31, "fiscal", "Dernier jour pour réduire l'impôt " + a, null, "Versements en assurance vie et CEA pris en compte pour l'année.");
    /* Rappels déjà en place (sauf ceux que le calendrier montre déjà). */
    (opt.rappels || []).forEach(function (r) {
      if (!r || !r.quand || ["versement", "fiscal", "credit"].indexOf(r.type) !== -1) return;
      var d = new Date(r.quand);
      if (d.getFullYear() === a && d.getMonth() === m0) ajouter(d.getDate(), "rappel", r.titre, null, r.corps ? String(r.corps).slice(0, 140) : "");
    });
    var ordre = { paie: 0, prime: 1, credit: 2, fin: 3, epargne: 4, fiscal: 5, rappel: 6 };
    res.sort(function (u, v) { return u.jour - v.jour || ordre[u.type] - ordre[v.type]; });
    return res;
  }

  /** Grille du mois (semaines du lundi au dimanche) : cases null hors du mois. */
  function grille(a, m0) {
    var premier = (new Date(a, m0, 1).getDay() + 6) % 7, n = dernierJour(a, m0), cases = [], semaines = [];
    for (var i = 0; i < premier; i++) cases.push(null);
    for (var j = 1; j <= n; j++) cases.push(j);
    while (cases.length % 7) cases.push(null);
    for (var k = 0; k < cases.length; k += 7) semaines.push(cases.slice(k, k + 7));
    return semaines;
  }

  /** Résumé : prélèvements du mois (crédits + épargne), entrées (paie). */
  function resume(evts) {
    var prelev = 0, entree = 0;
    (evts || []).forEach(function (e) { if (e.montant == null) return; if (e.type === "credit" || e.type === "epargne") prelev += e.montant; if (e.type === "paie") entree += e.montant; });
    return { prelevements: Math.round(prelev * 1000) / 1000, entrees: Math.round(entree * 1000) / 1000 };
  }

  /** Fichier .ics (agenda) : un événement d'une journée par date. */
  function ics(evts, maintenant) {
    var m = maintenant || new Date(), stamp = m.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    function echap(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function plier(l) { var out = [], s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); }
    var lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbite//Calendrier//FR", "CALSCALE:GREGORIAN"];
    (evts || []).forEach(function (e, i) {
      var d = e.date.replace(/-/g, ""), fin = new Date(Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, "");
      var titre = e.libelle + (e.montant != null ? " · " + String(e.montant.toFixed(3)).replace(".", ",") + " DT" : "");
      lignes.push("BEGIN:VEVENT", "UID:orbite-" + d + "-" + e.type + "-" + i + "@orbite", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + fin,
        plier("SUMMARY:" + echap(titre)), e.detail ? plier("DESCRIPTION:" + echap(e.detail)) : null, "END:VEVENT");
    });
    lignes.push("END:VCALENDAR");
    return lignes.filter(Boolean).join("\r\n") + "\r\n";
  }

  return { evenements: evenements, grille: grille, resume: resume, ics: ics, dernierJour: dernierJour };
});
