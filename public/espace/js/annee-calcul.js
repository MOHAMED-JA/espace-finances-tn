/*
 * Orbite — « Mon année en orbite » (lot 6, module pur testé sous Node). Bilan d'une année calculé depuis le profil :
 * salaire mois par mois (historique daté), impôt et cotisations, pouvoir d'achat face à l'inflation, crédits (capital
 * remboursé, intérêts, crédits soldés), épargne (contrats, « J'ai épargné », série, impôt évité), l'année suivante,
 * et des faits SANS MONTANT pour l'image de partage. Une carte sans données n'est pas produite.
 * Période : l'année en cours jusqu'à aujourd'hui ; en janvier, l'année précédente complète.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrique(require("./orbite-calcul.js"), require("./orbite-intelligence.js"), require("./progression-calcul.js"));
  } else racine.Annee = fabrique(racine.OrbiteCalcul, racine.OrbiteIntelligence, racine.Progression);
})(typeof self !== "undefined" ? self : this, function (OC, OI, PG) {
  "use strict";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var CREDIT_NOM = { immo: "logement", auto: "voiture", conso: "consommation", autre: "" };

  /* Période couverte et mise en avant (du 15 décembre au 31 janvier). */
  function periode(maintenant) {
    var m = maintenant || new Date(), Y = m.getFullYear(), mo = m.getMonth();
    if (mo === 0) return { annee: Y - 1, complete: true, mois: 12, fin: new Date(Y - 1, 11, 31, 12), rendezVous: true };
    var mois = mo + (m.getDate() >= 25 ? 1 : 0);  /* le salaire du mois en cours compte à partir du 25 */
    return { annee: Y, complete: false, mois: Math.max(1, mois), fin: m, rendezVous: mo === 11 && m.getDate() >= 15 };
  }

  function salaireMois(p, Y, k) {
    var h = OC.salaireEnVigueur(p, Y, k) || { montant: p.montant, sens: p.sens, periode: p.periode };
    return { entree: h, s: OC.salaireDe(OC.profilAuMois(p, Y, k), h, Y) };
  }

  /* Salaire, impôt et cotisations sur les mois couverts (primes réparties selon le calendrier du profil). */
  function salaire(p, per) {
    var Y = per.annee, cal = OC.calendrierPrimes(p), n = 12 + cal.reduce(function (a, b) { return a + b; }, 0);
    var r = { net: 0, brut: 0, impot: 0, cotisations: 0, mois: [], hausses: [] }, prec = null;
    for (var k = 0; k < per.mois; k++) {
      var x = salaireMois(p, Y, k), s = x.s, f = (1 + cal[k]) / n;
      r.net += s.netAnnuel * f; r.brut += s.brutAnnuel * f; r.impot += (s.irpp + s.css) * f; r.cotisations += s.cotisations * f;
      r.mois.push({ mois: k, brutMensuel: s.brutMensuel, netMensuel: s.netMensuel, hausse: false });
      if (prec && s.brutMensuel > prec.brutMensuel + 0.0005) {
        r.mois[k].hausse = true;
        r.hausses.push({ mois: k, brut: s.brutMensuel - prec.brutMensuel, net: s.netMensuel - prec.netMensuel });
      }
      prec = s;
    }
    r.brutDebut = r.mois[0].brutMensuel; r.brutFin = r.mois[r.mois.length - 1].brutMensuel;
    r.pourVous = r.brut > 0 ? r.net / r.brut : 0;
    return r;
  }

  function pouvoirAchat(sal, per) {
    var inf = PG.inflation(per.annee) / 100, evol = sal.brutDebut > 0 ? sal.brutFin / sal.brutDebut - 1 : 0;
    return { evolution: evol, inflation: inf, gain: (1 + evol) / (1 + inf) - 1, provisoire: !!PG.PROVISOIRE[per.annee] };
  }

  /* Crédits : échéances payées dans l'année (de décembre précédent à la fin de la période). */
  function credits(p, per) {
    var debutRef = new Date(per.annee - 1, 11, 15), finRef = per.complete ? new Date(per.annee, 11, 15) : per.fin;
    var r = { capital: 0, interets: 0, soldes: [], liste: [] };
    (p.credits || []).forEach(function (c) {
      if (!(c.mensualite > 0) || !(c.tauxPct > 0)) return;
      var e0 = OC.echeancier(c, debutRef), e1 = OC.echeancier(c, finRef);
      if (!e0 || !e1) return;
      var payees = e0.restantes - e1.restantes;
      if (payees <= 0) return;
      var cap = OC.capitalPourMensualite(c.mensualite, c.tauxPct, e0.restantes) - OC.capitalPourMensualite(c.mensualite, c.tauxPct, e1.restantes);
      var ligne = { libelle: c.libelle || "", type: c.type, mensualite: c.mensualite, payees: payees, capital: cap, interets: Math.max(0, c.mensualite * payees - cap), solde: e1.restantes === 0, fin: e1.fin };
      r.capital += cap; r.interets += ligne.interets; r.liste.push(ligne);
      if (ligne.solde) r.soldes.push(ligne);
    });
    r.margeLiberee = r.soldes.reduce(function (t, c) { return t + c.mensualite; }, 0);
    return r.liste.length ? r : null;
  }

  /* Épargne : contrats (versements prévus au prorata des mois couverts), « J'ai épargné », série, impôt évité. */
  function epargne(p, sy, donnees, per) {
    var Y = per.annee, fin = per.fin, r = { contrats: 0, av: 0, cea: 0, objectifs: 0, impotEvite: 0, serie: 0, objectif: null };
    (p.contrats || []).forEach(function (c) {
      var debut = Math.max(Y * 12, c.anneeDebut * 12 + c.moisDebut - 1), dernier = Y * 12 + per.mois - 1, mois = Math.max(0, dernier - debut + 1);
      if (!mois) return;
      var v = c.versementMensuel * mois + c.versementsLibresAn * per.mois / 12;
      r.contrats += v; if (c.type === "cea") r.cea += v; else r.av += v;
    });
    var vers = (donnees && donnees.versements) || [], objs = (donnees && donnees.objectifs) || [];
    r.objectifs = vers.filter(function (v) { return (v.le || "").slice(0, 4) === String(Y) && v.montant > 0; }).reduce(function (t, v) { return t + v.montant; }, 0);
    r.serie = PG.serie(vers, fin);
    try { var fi = OI.optimiseurFiscal(sy, { maintenant: fin }); r.impotEvite = (fi.economieActuelle || 0) * per.mois / 12; } catch (e) { r.impotEvite = 0; }
    /* Objectif mis en avant : épargne de précaution, sinon le projet le plus avancé. */
    var etats = objs.filter(function (o) { return o.type === "precaution" || o.type === "projet"; })
      .map(function (o) { return PG.etatObjectif(o, vers, sy, p, fin); }).filter(function (e) { return e.cible > 0; });
    etats.sort(function (a, b) { return (b.objectif.type === "precaution") - (a.objectif.type === "precaution") || b.pct - a.pct; });
    if (etats[0]) r.objectif = { type: etats[0].objectif.type, nom: PG.NOMS_TYPES[etats[0].objectif.type], pct: Math.min(1, etats[0].pct), fait: etats[0].fait, cible: etats[0].cible, reste: etats[0].reste, mensuel: etats[0].mensuelNecessaire, atteint: etats[0].etat === "atteint" };
    r.total = r.contrats + r.objectifs;
    return r.total > 0 || r.objectif ? r : null;
  }

  /* L'année suivante : fin d'un crédit, capacité d'emprunt, impôt, objectif à finir (3 au plus). */
  function avenir(p, sy, cr, ep, per, maintenant) {
    var m = maintenant || new Date(), Y1 = per.annee + 1, items = [];
    (p.credits || []).forEach(function (c) {
      if (items.some(function (i) { return i.type === "credit-fin"; })) return;
      var e = OC.echeancier(c, m); if (!e || !(e.restantes > 0)) return;
      var finA = Number(String(e.fin).split(" ").pop());
      if (finA === Y1 || (per.complete && finA === per.annee + 1)) items.push({ type: "credit-fin", nom: CREDIT_NOM[c.type] || "", fin: e.fin, mensualite: c.mensualite });
    });
    var immo = ((sy.capacite && sy.capacite.net && sy.capacite.net.credits) || []).filter(function (x) { return x.cle === "immo"; })[0];
    if (immo && immo.capital > 0) items.push({ type: "capacite", capital: immo.capital, mensualite: sy.capacite.net.mensualiteMax, grace: !!(cr && cr.soldes.length) });
    try {
      var fi = OI.optimiseurFiscal(sy, { maintenant: m }), jours = Math.max(0, Math.ceil((new Date(m.getFullYear(), 11, 31) - new Date(m.getFullYear(), m.getMonth(), m.getDate())) / 864e5));
      if (fi.gainPossible > 20) items.push(per.complete ? { type: "impot", annee: m.getFullYear(), gain: fi.gainPossible } : { type: "impot-jours", annee: per.annee, jours: jours, gain: fi.gainPossible });
    } catch (e) { /* sans optimiseur : pas d'élément impôt */ }
    if (ep && ep.objectif && !ep.objectif.atteint && ep.objectif.reste > 0) items.push({ type: "objectif", nom: ep.objectif.nom, reste: ep.objectif.reste, mensuel: ep.objectif.mensuel || ep.objectif.reste / 12 });
    return items.slice(0, 3);
  }

  /* Faits sans aucun montant (image de partage) : 4 au plus, par ordre d'importance. */
  function faits(sal, pa, cr, ep) {
    var f = [];
    (cr ? cr.soldes : []).forEach(function (c) { f.push({ cle: "credit", texte: "Crédit " + (CREDIT_NOM[c.type] ? CREDIT_NOM[c.type] + " " : "") + "soldé" }); });
    if (pa && pa.gain > 0.0005) f.push({ cle: "pouvoir", texte: "+" + fr(pa.gain * 100, 1) + " % de pouvoir d'achat" });
    else if (sal && sal.hausses.length) f.push({ cle: "hausse", texte: "Une hausse de salaire" });
    if (ep && ep.objectif) f.push({ cle: "objectif", texte: ep.objectif.atteint ? "Objectif « " + ep.objectif.nom + " » atteint" : fr(ep.objectif.pct * 100, 0) + " % de mon objectif « " + ep.objectif.nom.toLowerCase() + " »" });
    if (ep && ep.serie >= 2) f.push({ cle: "serie", texte: ep.serie + " mois d'épargne d'affilée" });
    if (ep && ep.impotEvite > 0) f.push({ cle: "impot", texte: "Impôt réduit grâce à mon épargne" });
    if (!f.length) f.push({ cle: "profil", texte: "Mes finances suivies mois après mois" });
    return f.slice(0, 4);
  }
  function fr(v, d) { return v.toFixed(d).replace(".", ","); }

  /* Bilan complet : cartes dans l'ordre de l'histoire (celles sans données sont absentes). */
  function bilan(p0, donnees, maintenant) {
    var m = maintenant || new Date(), per = periode(m);
    var p = OC.normaliser(p0 || {});
    var sy = OC.synthese(p, {}, per.complete ? per.fin : m);
    var sal = salaire(p, per), pa = pouvoirAchat(sal, per), cr = credits(p, per), ep = epargne(p, sy, donnees, per), av = avenir(p, sy, cr, ep, per, m);
    var cartes = [{ id: "intro" }, { id: "salaire", salaire: sal }, { id: "impot", salaire: sal }, { id: "pouvoir", pouvoir: pa, salaire: sal }];
    if (cr) cartes.push({ id: "credits", credits: cr });
    if (ep) cartes.push({ id: "epargne", epargne: ep });
    if (av.length) cartes.push({ id: "avenir", items: av });
    var f = faits(sal, pa, cr, ep);
    cartes.push({ id: "synthese", faits: f });
    return { annee: per.annee, complete: per.complete, mois: per.mois, rendezVous: per.rendezVous, debut: "janvier", fin: per.complete ? "décembre" : MOIS[m.getMonth()],
      dateFin: per.complete ? new Date(per.annee, 11, 31) : m, cartes: cartes, faits: f };
  }

  return { periode: periode, salaire: salaire, pouvoirAchat: pouvoirAchat, credits: credits, epargne: epargne, avenir: avenir, faits: faits, bilan: bilan, CREDIT_NOM: CREDIT_NOM };
});
