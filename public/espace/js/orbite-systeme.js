/*
 * Orbite — le système orbital de « Mon orbite » (pur, sans navigateur, testé sous Node).
 * À partir de la synthèse d'OrbiteCalcul : un satellite par crédit, contrat d'épargne et projet,
 * les jalons du voyage dans le temps (fin d'un crédit, durée fiscale d'un contrat, horizon d'un projet)
 * et l'état du système à un mois t donné (mensualités, capacité d'emprunt, capital restant, épargne).
 * Salaire : celui du profil, puis les hausses prévues de l'historique à leur mois. Capacité : celle du moteur à chaque fin de crédit (paliers), règle de la banque.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-calcul.js"));
  else racine.OrbiteSysteme = fabrique(racine.OrbiteCalcul);
})(typeof self !== "undefined" ? self : this, function (OC) {
  "use strict";
  var MOIS = OC.MOIS;
  var HORIZON_MAX = 480;

  function dateDe(debut, t) { var m = debut.mois + t; return { mois: ((m % 12) + 12) % 12, annee: debut.annee + Math.floor(m / 12) }; }
  function dateTexte(debut, t) { var d = dateDe(debut, t); return MOIS[d.mois] + " " + d.annee; }

  /* base : « net » ou « brut » (par défaut, la règle de la banque enregistrée dans le profil). */
  function modele(sy, base0) {
    var p = sy.profil, m = sy.maintenant || new Date();
    var debut = { annee: m.getFullYear(), mois: m.getMonth() };
    var base = base0 === "net" || base0 === "brut" ? base0 : p.baseBanque === "brut" ? "brut" : "net";
    var cap = sy.capacite[base];
    var sats = [], jalons = [];

    /* Crédits : du plus proche de sa fin au plus lointain (orbites intérieures d'abord). */
    p.credits.forEach(function (c, i) {
      if (!(c.mensualite > 0)) return;
      var info = sy.credits[i] || {}, n = info.restantes > 0 ? info.restantes : 0;
      var rt = info.reduction || { applicable: false, motif: null, reductions: [] };
      /* Règle des 8 % : réductions de taux à venir (avant la fin du crédit). */
      var reds = rt.reductions.filter(function (r) { return !n || r.t < n; });
      var nom = c.libelle.charAt(0).toLowerCase() + c.libelle.slice(1);
      sats.push({ id: "credit-" + i, genre: "credit", type: c.type, nom: c.libelle, mensualite: c.mensualite, tauxPct: c.tauxPct, tauxType: c.tauxType,
        restantes: n, fin: n ? info.fin : null, derniere: n ? (info.calcule ? info.fin : dateTexte(debut, n - 1)) : null, regle8: rt, reductions: reds });
      reds.forEach(function (r) {
        jalons.push({ t: r.t, sat: "credit-" + i, genre: "reduction", gain: r.mensualiteAvant - r.mensualite, reduction: r,
          lib: "Réduction de taux du " + nom + " : " + String(Math.round(r.tauxPct * 10000) / 10000).replace(".", ",") + " %" });
      });
      if (n) jalons.push({ t: n, sat: "credit-" + i, genre: "credit", lib: "Fin du " + nom, gain: reds.length ? reds[reds.length - 1].mensualite : c.mensualite });
    });
    sats.sort(function (a, b) { return (a.restantes || 1e4) - (b.restantes || 1e4); });

    p.contrats.forEach(function (c, i) {
      var e = sy.contrats[i];
      var finMois = c.moisDebut - 1 + e.dureeFiscale * 12;
      var tFiscal = (c.anneeDebut + Math.floor(finMois / 12)) * 12 + (finMois % 12) - (debut.annee * 12 + debut.mois);
      var nom = c.libelle && c.libelle !== "Contrat" ? c.libelle : c.type === "cea" ? "Compte épargne en actions" : "Assurance vie";
      sats.push({ id: "contrat-" + i, genre: c.type === "cea" ? "cea" : "vie", nom: nom, versement: c.versementMensuel,
        depuis: MOIS[c.moisDebut - 1] + " " + c.anneeDebut, dureeFiscale: e.dureeFiscale, dateFiscale: e.dateDureeFiscale,
        tFiscal: tFiscal, contrat: c, capitalSaisi: c.capitalActuel > 0 });
      if (tFiscal > 0) jalons.push({ t: tFiscal, sat: "contrat-" + i, genre: "contrat", lib: nom + " : " + e.dureeFiscale + " ans, avantage fiscal acquis" });
    });

    sy.projets.forEach(function (pr, i) {
      var t = pr.horizonAns * 12;
      sats.push({ id: "projet-" + i, genre: "projet", nom: pr.libelle, montant: pr.montant, horizonAns: pr.horizonAns, statut: pr.statut,
        horizon: t > 0 ? dateTexte(debut, t) : null, credit: pr.credit || null, epargneMensuelle: pr.epargneMensuelle || 0 });
      if (t > 0) jalons.push({ t: t, sat: "projet-" + i, genre: "projet", lib: "Horizon : " + pr.libelle.charAt(0).toLowerCase() + pr.libelle.slice(1) });
    });
    if (!sy.projets.length) sats.push({ id: "projet-nouveau", genre: "vide", nom: "Un projet ?" });

    /* Hausses de salaire prévues (historique du salaire) : le net change à leur mois. */
    var hausses = sy.historique ? sy.historique.futurs : [];
    hausses.forEach(function (f) {
      jalons.push({ t: f.mois, sat: null, genre: "salaire", lib: "Hausse de salaire : " + String(Math.round(f.brutMensuel)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + " DT brut par mois", net: f.netMensuel });
    });
    jalons.sort(function (a, b) { return a.t - b.t; });
    var horizon = jalons.reduce(function (h, j) { return Math.max(h, j.t); }, 0);
    horizon = Math.min(HORIZON_MAX, horizon);
    jalons = jalons.filter(function (j) { return j.t <= horizon; });

    /* Capacité d'emprunt : aujourd'hui, puis à chaque fin de crédit (paliers du moteur). */
    var immo0 = (cap.credits || []).filter(function (c) { return c.cle === "immo"; })[0];
    var etapes = [{ mois: 0, revenu: cap.revenu, mensualiteMax: cap.mensualiteMax, capitalImmo: immo0 ? immo0.capital : 0, dureeImmoMois: immo0 ? immo0.dureeMois : 240, tauxPct: immo0 ? immo0.tauxPct : sy.tauxImmo && sy.tauxImmo.tauxPct }]
      .concat((cap.paliers || []).map(function (x) { return { mois: x.mois, revenu: x.revenu || cap.revenu, mensualiteMax: x.mensualiteMax, capitalImmo: x.capitalImmo, dureeImmoMois: x.dureeImmoMois, tauxPct: x.tauxPct }; }));

    function capaciteAu(t) {
      var e = etapes[0];
      for (var k = 1; k < etapes.length; k++) if (etapes[k].mois <= t) e = etapes[k];
      return e;
    }

    function etat(t) {
      t = Math.max(0, Math.min(horizon, Math.round(t)));
      var d = new Date(debut.annee, debut.mois + t, 15);
      var charges = 0, parSat = {};
      sats.forEach(function (s) {
        if (s.genre === "credit") {
          var reste = s.restantes ? Math.max(0, s.restantes - t) : null;
          var actif = reste === null || reste > 0;
          /* Mensualité et taux au mois t : ceux de la dernière réduction de taux déjà passée. */
          var mens = s.mensualite, tx = s.tauxPct, apres = [];
          s.reductions.forEach(function (r) { if (r.t <= t) { mens = r.mensualite; tx = r.tauxPct; } else apres.push(r); });
          if (actif) charges += mens;
          var k = reste ? OC.capitalPourMensualite(mens, tx, reste) : 0;
          /* Intérêts restants : total des mensualités à venir (qui baissent à chaque réduction) moins le capital. */
          var aPayer = 0, de = t, m0 = mens;
          if (reste) { apres.forEach(function (r) { aPayer += m0 * (r.t - 1 - de); m0 = r.mensualite; de = r.t - 1; }); aPayer += m0 * (s.restantes - de); }
          parSat[s.id] = { actif: actif, restantes: reste, capitalRestant: reste === null ? null : k, interets: reste === null ? null : Math.max(0, aPayer - k),
            mensualite: mens, tauxPct: tx, prochaine: apres[0] || null };
        } else if (s.genre === "vie" || s.genre === "cea") {
          var e = OC.estimationContrat(s.contrat, d), capital = e.capital;
          if (s.capitalSaisi && t > 0) {
            /* Capital du dernier relevé, qui continue de croître au rendement estimé avec les versements. */
            var i = OC.RENDEMENT_ESTIME / 100 / 12, f = Math.pow(1 + i, t);
            capital = s.contrat.capitalActuel * f + s.versement * (f - 1) / i;
          }
          parSat[s.id] = { actif: true, verse: e.verse, capital: capital, gains: Math.max(0, capital - e.verse), fiscalAcquis: t >= s.tFiscal };
        } else parSat[s.id] = { actif: true };
      });
      var c = capaciteAu(t), net = sy.salaire.netMensuel;
      hausses.forEach(function (f) { if (f.mois <= t) net = f.netMensuel; });
      return { t: t, date: dateTexte(debut, t), netMensuel: net, charges: charges, endettement: c.revenu > 0 ? charges / c.revenu : 0,
        capacite: c.mensualiteMax, capitalImmo: c.capitalImmo, dureeImmoMois: c.dureeImmoMois, tauxImmoPct: c.tauxPct, satellites: parSat };
    }

    return { debut: debut, base: base, quotite: cap.quotite, revenu: cap.revenu, horizon: horizon, satellites: sats, jalons: jalons,
      etat: etat, dateTexte: function (t) { return dateTexte(debut, t); },
      ecart: function (t) {
        if (!t) return "Aujourd'hui";
        var a = Math.floor(t / 12), mo = t % 12, x = [];
        if (a) x.push(a + (a > 1 ? " ans" : " an"));
        if (mo) x.push(mo + " mois");
        return "Dans " + x.join(" et ");
      } };
  }

  return { modele: modele, HORIZON_MAX: HORIZON_MAX };
});
