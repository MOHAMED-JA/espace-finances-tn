/* Tests de résistance (fonctions pures) : que devient le capital si le marché chute, si les versements
   s'interrompent, si les rendements baissent durablement ou si l'inflation s'emballe ?
   Chaque test rejoue le scénario médian avec une seule hypothèse dégradée. */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique(require('./projection.js'));
  else racine.Stress = fabrique(racine.Projection);
})(typeof self !== 'undefined' ? self : this, function (Proj) {
  'use strict';

  function copie(p, ajouts) {
    var c = {};
    Object.keys(p).forEach(function (k) { c[k] = p[k]; });
    Object.keys(ajouts).forEach(function (k) { c[k] = ajouts[k]; });
    return c;
  }
  function serie(n, f) { var t = []; for (var a = 1; a <= n; a++) t.push(f(a)); return t; }
  function borne(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* calc = Scenario.calculer (actif) ; o = { anneeKrach, chuteCeaPct, debutPause, dureePause, baissePts, inflationPct } */
  function tester(calc, o0) {
    if (!calc || !calc.actif) return null;
    var e = calc.etat, n = e.dureeAns;
    var o = {
      anneeKrach: borne(Math.round(o0 && o0.anneeKrach || Math.min(3, n)), 1, n),
      chuteCeaPct: borne(o0 && o0.chuteCeaPct != null ? o0.chuteCeaPct : 30, 0, 90),
      debutPause: borne(Math.round(o0 && o0.debutPause || Math.min(2, n)), 1, n),
      dureePause: 0,
      baissePts: borne(o0 && o0.baissePts != null ? o0.baissePts : 2, 0, 20),
      inflationPct: borne(o0 && o0.inflationPct != null ? o0.inflationPct : 8, 0, 30)
    };
    o.dureePause = borne(Math.round(o0 && o0.dureePause || 1), 1, n - o.debutPause + 1);
    var base = calc.med;
    var reel = e.inflationPct > 0;
    function combine(pAv, pCea) { return Proj.combiner(Proj.projeter(pAv), calc.aCea ? Proj.projeter(pCea) : null); }
    function resultat(cle, proj, extra) {
      var valeur = proj.valeurFinale + (e.reinvestir ? 0 : proj.economieCumulee);
      return Object.assign({
        cle: cle, capital: proj.capitalFinal, capitalReel: proj.capitalFinalReel, valeur: valeur,
        ecart: proj.capitalFinal - base.capitalFinal, ecartPct: base.capitalFinal > 0 ? (proj.capitalFinal / base.capitalFinal - 1) * 100 : 0,
        ecartValeur: valeur - calc.valeurTotale, verse: proj.totalVerse
      }, extra || {});
    }

    /* 1. Krach l'année k : le CEA perd chuteCeaPct %, l'assurance vie ne sert que son taux garanti */
    var k = o.anneeKrach;
    var krach = combine(
      copie(calc.p, { rendementsAnnuels: serie(n, function (a) { return a === k ? e.tauxGarantiPct : e.rendementPct; }) }),
      copie(calc.pCea, { rendementsAnnuels: serie(n, function (a) { return a === k ? -o.chuteCeaPct : e.rendementCeaPct; }) })
    );
    /* 2. Pause des versements (perte d'emploi) : ni versement périodique ni économie d'impôt ces années-là */
    var dans = function (a) { return a >= o.debutPause && a < o.debutPause + o.dureePause; };
    var fac = serie(n, function (a) { return dans(a) ? 0 : 1; });
    var ecoAv = (calc.p.economies || []).map(function (x, i) { return dans(i + 1) ? 0 : x; });
    var pause = combine(copie(calc.p, { facteursVersement: fac, economies: ecoAv }), copie(calc.pCea, { facteursVersement: fac }));
    var economiePerdue = (calc.p.economies || []).reduce(function (t, x, i) { return t + (dans(i + 1) ? x : 0); }, 0);
    /* 3. Rendements durablement plus bas (assurance vie jamais sous le garanti, CEA jamais négatif en moyenne) */
    var baisse = combine(
      copie(calc.p, { rendementPct: Math.max(e.tauxGarantiPct, e.rendementPct - o.baissePts) }),
      copie(calc.pCea, { rendementPct: Math.max(0, e.rendementCeaPct - o.baissePts) })
    );
    /* 4. Inflation élevée : même capital, pouvoir d'achat réduit */
    var infl = combine(copie(calc.p, { inflationPct: o.inflationPct }), copie(calc.pCea, { inflationPct: o.inflationPct }));

    return {
      options: o,
      base: { capital: base.capitalFinal, capitalReel: base.capitalFinalReel, valeur: calc.valeurTotale, reel: reel },
      tests: [
        resultat('krach', krach, { annee: k }),
        resultat('pause', pause, { economiePerdue: economiePerdue, versementsManques: base.totalVerse - pause.totalVerse }),
        resultat('baisse', baisse),
        resultat('inflation', infl, { ecartReel: infl.capitalFinalReel - base.capitalFinalReel, pouvoirAchatPct: base.capitalFinal > 0 ? infl.capitalFinalReel / base.capitalFinal * 100 : 0 })
      ]
    };
  }

  return { tester: tester };
});
