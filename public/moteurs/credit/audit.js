/*
 * Offre bancaire et tableau d'amortissement de la banque : lecture et contrôle au millime.
 * -----------------------------------------------------------------------------------------
 * Fonctions pures (aucun DOM), reprises du simulateur de crédit :
 *  - analyserOffre(texte)      : taux, TMM + marge, TEG, durée, montant, frais, assurance, mensualité ;
 *  - analyserTableau(texte)    : lignes datées du tableau de la banque, rôle des colonnes deviné
 *                                (capital dû, amortissement, intérêts, échéance) quel que soit leur ordre ;
 *  - auditerTableau(tableau)   : chiffres mal lus corrigés par recoupement, échéances manquantes,
 *                                intérêts recalculés ligne par ligne, phases de taux, remboursements
 *                                anticipés, mensualité théorique, règle des 8 % (réduction de moitié du taux).
 * Node : require('.../audit.js') — navigateur : window.CreditAudit.
 */
(function (racine, fabrique) {
  'use strict';
  var API = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = API;
  else racine.CreditAudit = API;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function r3(v) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
  function pmt(rate, n, pv) { if (Math.abs(rate) < 1e-12) return pv / n; return pv * rate / (1 - Math.pow(1 + rate, -n)); }
  function mensualite(cap, tmPct, n) { var r = tmPct / 100; if (!isFinite(cap) || !isFinite(r) || !isFinite(n) || n <= 0) return NaN; return r3(pmt(r, n, cap)); }
  function tauxPeriodePct(ta, p) { return parseFloat((ta * p / 12).toFixed(6)); }
  function dec(x) { return parseFloat(String(x).replace(/\s/g, '').replace(',', '.')); }

  var NB = ' ';
  function grp(v, d) { var p = Math.abs(v).toFixed(d).split('.'); return (v < 0 ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (d ? ',' + p[1] : ''); }
  function dt(v) { return grp(v, 3) + ' DT'; }
  function signe(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + grp(Math.abs(v), 3) + ' DT'; }
  function tauxPrecis(v) { return String(Math.round(v * 1e6) / 1e6).replace('.', ',') + ' %'; }
  function pct(v, d) { return grp(v, d) + ' %'; }
  function moisAnnee(d) { return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); }
  function libMois(n) { return n + ' mois'; }

  /* ---------- Montants ---------- */
  function valeurMontant(nb) {
    var s = String(nb).replace(/[   ]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s.replace(',', '.'));
  }
  /* Montant bancaire : « 102 816,611 », « 1012,500 », « 1641841 » (virgule perdue à la lecture) */
  var RE_MONTANT_BANQUE = /\d+(?:[   ]\d{3})*[,.]\d{3}(?!\d)|\d{4,}/g;
  function montantBanque(s) {
    var c = s.replace(/[   ]/g, '');
    if (/[,.]\d{3}$/.test(c)) return parseFloat(c.replace(',', '.'));
    return parseInt(c, 10) / 1000;
  }

  /* ===================================================================
     Offre bancaire
     =================================================================== */
  function analyserOffre(texte) {
    var s = ' ' + String(texte || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ') + ' ';
    var bas = s.toLowerCase(), r = {}, m;
    if ((m = /t\.?e\.?g\.?[^\d\n]{0,40}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas)) || (m = /taux (?:annuel )?effectif global[^\d\n]{0,30}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas))) r.teg = dec(m[1]);
    if ((m = /tmm\s*\+\s*(\d{1,2}(?:[.,]\d{1,4})?)\s*%?/.exec(bas))) r.marge = dec(m[1]);
    if ((m = /taux(?: d'intérêt| d'interet| nominal| annuel| débiteur| debiteur| fixe)*[^\d\n%]{0,30}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas.replace(/taux (?:annuel )?effectif global[^\n]*/g, ' ')))) r.taux = dec(m[1]);
    if (r.marge != null && r.taux === r.marge) delete r.taux;
    if ((m = /(?:durée|duree)[^\d\n]{0,25}?(\d{1,3})\s*(mois|ans?|années?)/.exec(bas))) r.mois = parseInt(m[1], 10) * (/an/.test(m[2]) ? 12 : 1);
    else if ((m = /(\d{1,3})\s*(mensualités|mensualites|échéances|echeances)/.exec(bas))) r.mois = parseInt(m[1], 10);
    var reM = '(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+(?:,\\d{1,3})?|\\d{4,}(?:[.,]\\d{1,3})?)';
    if ((m = new RegExp("(?:montant|capital)(?: du| de)?(?: prêt| pret| crédit| credit| financement| emprunté| emprunte)?[^\\d\\n]{0,25}?" + reM).exec(bas))) r.capital = valeurMontant(m[1]);
    if ((m = new RegExp("frais de dossier[^\\d\\n]{0,25}?(\\d{1,2}(?:[.,]\\d{1,3})?)\\s*%").exec(bas))) r.fraisPct = dec(m[1]);
    else if ((m = new RegExp("frais de dossier[^\\d\\n]{0,25}?" + "(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})*(?:,\\d{1,3})?|\\d{4,}(?:[.,]\\d{1,3})?)").exec(bas))) r.fraisFixe = valeurMontant(m[1]);
    if ((m = /assurance[^\d\n]{0,40}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas))) r.assurance = dec(m[1]);
    if ((m = new RegExp("(?:mensualité|mensualite|échéance|echeance)[^\\d\\n]{0,25}?" + reM).exec(bas))) r.mensualite = valeurMontant(m[1]);
    Object.keys(r).forEach(function (k) { if (!isFinite(r[k])) delete r[k]; });
    return r;
  }

  /* ===================================================================
     Tableau d'amortissement de la banque
     =================================================================== */
  var BANQUES = [['BH Bank', /\bBH\b|BH\s*BANK/i], ['BIAT', /\bBIAT\b/i], ['STB', /\bSTB\b|soci[ée]t[ée] tunisienne de banque/i], ['BNA', /\bBNA\b|banque nationale agricole/i],
    ['Attijari Bank', /attijari/i], ['Amen Bank', /amen\s*bank/i], ['UIB', /\bUIB\b/i], ['Banque de Tunisie', /banque de tunisie|\bBT\b/], ['ATB', /\bATB\b|arab tunisian bank/i],
    ['UBCI', /\bUBCI\b/i], ['QNB', /\bQNB\b/i], ['Banque Zitouna', /zitouna/i], ['Wifak Bank', /wifak/i], ['Al Baraka', /baraka/i], ['BTK', /\bBTK\b/i], ['BTL', /\bBTL\b/i], ['TSB', /\bTSB\b/i]];

  function analyserTableau(texte) {
    var brut = String(texte || ''), info = {}, m;
    if ((m = /dur[ée]e\s*:?\s*(\d{2,3})\s*mois/i.exec(brut))) info.dureeTotale = parseInt(m[1], 10);
    if ((m = /(?:mt|montant)\s+d[ée]bloqu[ée]\s*:?\s*([\d .,]+)/i.exec(brut))) info.debloque = parseFloat(m[1].replace(/\s/g, '').replace(/[.,](\d{3})$/, '.$1'));
    BANQUES.some(function (b) { if (b[1].test(brut)) { info.banque = b[0]; return true; } return false; });
    var parDate = {};
    brut.split(/\n/).forEach(function (ligne) {
      var d = /(\d{2})\s?[\/.-]\s?(\d{2})\s?[\/.-]\s?(\d{4})/.exec(ligne), jour, mois, an, fin;
      if (d) { jour = +d[1]; mois = +d[2]; an = +d[3]; fin = d.index + d[0].length; }
      else if ((d = /(^|[^\d\/])(\d{2})\/(\d{4})(?!\d)/.exec(ligne))) { jour = 1; mois = +d[2]; an = +d[3]; fin = d.index + d[0].length; }
      else return;
      if (mois < 1 || mois > 12 || an < 1990 || an > 2100) return;
      /* Les pourcentages (taux, ratios) ne sont pas des montants */
      var vals = (ligne.slice(fin).replace(/\d+(?:[.,]\d+)?\s*%/g, ' ').match(RE_MONTANT_BANQUE) || []).map(montantBanque).filter(function (v) { return isFinite(v); });
      if (vals.length < 3) return;
      var cle = an * 12 + mois - 1;
      parDate[cle] = { cle: cle, date: new Date(an, mois - 1, jour), vals: vals };
    });
    var lignes = Object.keys(parDate).map(Number).sort(function (a, b) { return a - b; }).map(function (c) { return parDate[c]; });
    if (lignes.length < 3) return { info: info, lignes: [] };
    /* Rôle des colonnes : la disposition (capital dû, amortissement, intérêts, échéance) qui vérifie le plus souvent
       « échéance = amortissement + intérêts + accessoires », la continuité du capital et un intérêt plausible */
    function idx(sig, k) { return sig.map(function (x) { return x < 0 ? k + x : x; }); }
    function sigDe(p, k) { return p.map(function (x) { return x === k - 1 ? -1 : x; }); }
    function coherent(v, q) {
      if (!(v[q[2]] <= (v[q[0]] + v[q[1]]) * 0.03)) return false;
      if (Math.abs(v[q[1]] + v[q[2]] - v[q[3]]) <= 0.002) return true;
      var ex = 0; for (var z = 0; z < v.length; z++) if (q.indexOf(z) < 0 && v[z] < v[q[3]]) ex += v[z];
      return Math.abs(v[q[1]] + v[q[2]] + ex - v[q[3]]) <= 0.002;
    }
    var votes = {};
    lignes.forEach(function (l) {
      var k = l.vals.length, vus = {};
      for (var c = 0; c < k; c++) for (var a2 = 0; a2 < k; a2++) for (var i2 = 0; i2 < k; i2++) for (var e2 = 0; e2 < k; e2++) {
        if (c === a2 || c === i2 || c === e2 || a2 === i2 || a2 === e2 || i2 === e2) continue;
        var q = [c, a2, i2, e2];
        if (!coherent(l.vals, q)) continue;
        var cle2 = sigDe(q, k).join(',');
        if (!vus[cle2]) { vus[cle2] = 1; votes[cle2] = (votes[cle2] || 0) + 1; }
      }
    });
    var candidats = Object.keys(votes).sort(function (x, y) { return votes[y] - votes[x]; });
    if (!candidats.length) candidats = ['0,1,2,-1'];
    var meilleur = null, meilleurScore = -1;
    candidats.slice(0, 12).forEach(function (cs) {
      var sig = cs.split(',').map(Number), score = (votes[cs] || 0) * 2, stab = 0, prec = null;
      for (var r = 0; r + 1 < lignes.length; r++) {
        var q1 = idx(sig, lignes[r].vals.length), q2 = idx(sig, lignes[r + 1].vals.length), v1 = lignes[r].vals, v2 = lignes[r + 1].vals;
        if (q1.some(function (x) { return x >= v1.length; }) || q2.some(function (x) { return x >= v2.length; })) continue;
        if (Math.abs(v1[q1[0]] - v1[q1[1]] - v2[q2[0]]) <= 0.002 || Math.abs(v1[q1[0]] - v2[q2[1]] - v2[q2[0]]) <= 0.002) score += 3;
        var rap = v1[q1[2]] / v1[q1[0]];
        if (prec !== null && Math.abs(rap - prec) / (prec || 1) < 0.002) stab++;
        prec = rap;
      }
      score += stab;
      if (score > meilleurScore) { meilleurScore = score; meilleur = sig; }
    });
    lignes.forEach(function (l, n0) {
      var v = l.vals, k = v.length, q = idx(meilleur, k);
      if (k === 3 || q.some(function (x) { return x >= k; })) {
        /* Échéance illisible : seules trois valeurs lues (capital, amortissement, intérêts) */
        var q3 = idx(meilleur, 4);
        l.crd = v[Math.min(q3[0], k - 1)]; l.am = v[Math.min(q3[1], k - 1)]; l.int = v[Math.min(q3[2], k - 1)]; l.ech = NaN; l.extras = 0; l.coherente = false;
      } else {
        l.crd = v[q[0]]; l.am = v[q[1]]; l.int = v[q[2]]; l.ech = v[q[3]];
        var ex = 0; for (var z = 0; z < k; z++) if (q.indexOf(z) < 0 && v[z] < v[q[3]]) ex += v[z];
        l.extras = Math.abs(v[q[1]] + v[q[2]] - v[q[3]]) <= 0.002 ? 0 : r3(ex);
        l.coherente = coherent(v, q);
      }
      l.n = n0 + 1;
    });
    return { info: info, lignes: lignes };
  }

  function auditerTableau(tab, maintenant) {
    var L = tab.lignes, n = L.length, anomalies = [], infos = [], i;
    if (!n) return null;
    var auj = maintenant || new Date();
    /* Convention du capital restant dû : avant ou après l'échéance */
    var avant = 0, apres = 0;
    for (i = 0; i + 1 < n; i++) {
      if (Math.abs(r3(L[i].crd - L[i].am) - L[i + 1].crd) <= 0.002) avant++;
      if (Math.abs(r3(L[i].crd - L[i + 1].am) - L[i + 1].crd) <= 0.002) apres++;
    }
    var convAvant = avant >= apres;
    /* Recoupements pour corriger les chiffres mal lus (photo, scan) */
    function suit(a, b) { return L[a] && L[b] && L[b].cle - L[a].cle === 1; }
    function echVoisine(k) { for (var d = 1; d < 5; d++) { if (L[k - d] && L[k - d].coherente) return L[k - d].ech; if (L[k + d] && L[k + d].coherente) return L[k + d].ech; } return NaN; }
    L.forEach(function (l, k) {
      if (l.coherente) return;
      var somme = r3(l.am + l.int + l.extras), voisine = echVoisine(k);
      if (Math.abs(somme - voisine) <= 0.002 || (!isFinite(l.ech) && isFinite(somme))) { l.ech = somme; l.coherente = true; l.corrige = 'échéance'; return; }
      if (Math.abs(l.ech - voisine) <= 0.002 && suit(k, k + 1)) {
        var amC = convAvant ? r3(l.crd - L[k + 1].crd) : r3(l.crd - (L[k - 1] ? L[k - 1].crd : NaN));
        if (isFinite(amC) && Math.abs(r3(amC + l.int + l.extras) - l.ech) <= 0.002) { l.am = amC; l.coherente = true; l.corrige = 'amortissement'; return; }
        var intC = r3(l.ech - l.am - l.extras);
        if (intC >= 0) { l.int = intC; l.coherente = true; l.corrige = 'intérêts'; }
      }
    });
    for (i = 1; i + 1 < n; i++) {
      var pr = L[i - 1], cu = L[i], nx = L[i + 1];
      if (!suit(i - 1, i) || !suit(i, i + 1)) continue;
      var att = convAvant ? r3(pr.crd - pr.am) : r3(pr.crd - cu.am);
      var suivant = convAvant ? r3(att - cu.am) : r3(att - nx.am);
      if (Math.abs(cu.crd - att) > 0.002 && Math.abs(suivant - nx.crd) <= 0.002) { cu.crd = att; cu.corrige = 'capital restant dû'; }
    }
    var corriges = L.filter(function (l) { return l.corrige; });
    if (corriges.length) infos.push({ g: 'info', i: L.indexOf(corriges[0]), txt: corriges.length + ' chiffre' + (corriges.length > 1 ? 's' : '') + ' mal lu' + (corriges.length > 1 ? 's' : '') + ' corrigé' + (corriges.length > 1 ? 's' : '') + ' par recoupement (échéances ' + corriges.map(function (l) { return l.n; }).join(', ') + ').' });
    L.forEach(function (l, k) { l.crdAv = convAvant ? l.crd : (k ? L[k - 1].crd : r3(l.crd + l.am)); l.crdAp = r3(l.crdAv - l.am); });
    /* Périodicité du tableau (1 = mensuel, 3 = trimestriel, 12 = annuel) et échéances manquantes */
    var ecarts = {};
    for (i = 1; i < n; i++) { var g0 = L[i].cle - L[i - 1].cle; ecarts[g0] = (ecarts[g0] || 0) + 1; }
    var periode = +Object.keys(ecarts).sort(function (x, y) { return ecarts[y] - ecarts[x]; })[0] || 1;
    if (periode > 1) infos.push({ g: 'info', i: 0, txt: 'Tableau à échéances tous les ' + periode + ' mois : les contrôles de taux sont faits sur cette base.' });
    for (i = 1; i < n; i++) {
      var saut = (L[i].cle - L[i - 1].cle) / periode;
      if (saut > 1 && saut === Math.round(saut)) anomalies.push({ g: 'lecture', i: i, txt: (saut - 1) + ' échéance' + (saut > 2 ? 's' : '') + ' absente' + (saut > 2 ? 's' : '') + ' entre ' + moisAnnee(L[i - 1].date) + ' et ' + moisAnnee(L[i].date) + ' : page manquante ou ligne illisible.' });
    }
    /* Taux de chaque ligne et phases de taux */
    L.forEach(function (l) { l.taux = l.crdAv > 0 && isFinite(l.int) ? l.int / l.crdAv * 1200 / periode : NaN; });
    var phases = [], cur = null;
    L.forEach(function (l, k) {
      if (!l.coherente || !isFinite(l.taux)) return;
      var tr = Math.round(l.taux * 1000) / 1000;
      var derniereLigne = k === L.length - 1 && cur && Math.abs(tr - cur.tauxBrut) <= 0.02;
      if (!cur || Math.abs(tr - cur.tauxBrut) > 0.02 || (Math.abs(l.ech - cur.derniere) > 0.0015 && !derniereLigne)) { cur = { debut: k, fin: k, tauxBrut: tr, valeurs: [], ech: {} }; phases.push(cur); }
      cur.derniere = l.ech; cur.fin = k; cur.valeurs.push(tr);
      cur.ech[l.ech] = (cur.ech[l.ech] || 0) + 1;
    });
    phases.forEach(function (ph) {
      var sI = 0, sC = 0;
      for (var q = ph.debut; q <= ph.fin; q++) if (L[q].coherente && isFinite(L[q].int)) { sI += L[q].int; sC += L[q].crdAv; }
      var moy = sC > 0 ? sI * 1200 / periode / sC : ph.valeurs[0];
      ph.taux = Math.round(moy * 10000) / 10000;
      [4, 3, 2, 1].forEach(function (d) { var r = Math.round(moy * Math.pow(10, d)) / Math.pow(10, d), nb = ph.fin - ph.debut + 1; if (Math.abs(r - moy) < 0.00005 + 0.6 / Math.max(1, sC / nb) / Math.sqrt(nb)) ph.taux = r; });
      ph.echeance = +Object.keys(ph.ech).sort(function (a, b) { return ph.ech[b] - ph.ech[a]; })[0];
    });
    /* Une phase d'une seule ligne prend le taux de la phase voisine au taux proche */
    phases.forEach(function (ph, k) {
      if (ph.fin > ph.debut) return;
      [phases[k - 1], phases[k + 1]].some(function (vo) { if (vo && vo.fin > vo.debut && Math.abs(vo.taux - ph.taux) < 0.02) { ph.taux = vo.taux; return true; } return false; });
    });
    function somme(cle) { return r3(L.reduce(function (a, l) { return a + (isFinite(l[cle]) ? l[cle] : 0); }, 0)); }
    /* Taux différent presque à chaque ligne : pas un échéancier détaillé, pas de contrôle au millime */
    if (phases.length > Math.max(3, n / 3)) {
      L.forEach(function (l) { l.ratio = NaN; });
      return { info: tab.info, lignes: L, phases: [], infos: infos, reductions: [], possibles: [], convAvant: convAvant, complet: false, periode: periode,
        anomalies: [{ g: 'lecture', i: 0, txt: "Ce document ne ressemble pas à un tableau d'amortissement détaillé (taux différent à chaque ligne). Utilisez le tableau complet fourni par la banque, échéance par échéance." }],
        totI: somme('int'), totA: somme('am'), totE: somme('ech'), dureeTotale: tab.info.dureeTotale || n, nonDetaille: true };
    }
    /* Contrôles ligne par ligne */
    L.forEach(function (l, k) {
      if (!l.coherente) { anomalies.push({ g: 'lecture', i: k, txt: 'Échéance ' + l.n + ' (' + moisAnnee(l.date) + ') : ' + dt(l.ech) + ' ≠ amortissement + intérêts + accessoires (' + dt(r3(l.am + (l.int || 0) + l.extras)) + '). Ligne mal lue ou erreur de la banque.' }); return; }
      var ph = phases.filter(function (p) { return k >= p.debut && k <= p.fin; })[0];
      if (ph) {
        l.attendu = r3(l.crdAv * ph.taux * periode / 1200);
        l.ecart = r3(l.int - l.attendu);
        if (Math.abs(l.ecart) > 0.0015) anomalies.push({ g: 'erreur', i: k, txt: 'Échéance ' + l.n + ' (' + moisAnnee(l.date) + ') : intérêts facturés ' + dt(l.int) + ', attendus ' + dt(l.attendu) + ' au taux de ' + tauxPrecis(ph.taux) + ' (écart ' + signe(l.ecart) + ').' });
      }
      if (k + 1 < n && L[k + 1].cle - l.cle === periode) {
        var ecartCrd = r3(l.crdAp - L[k + 1].crdAv);
        if (ecartCrd > 0.002) { l.ra = ecartCrd; infos.push({ g: 'info', i: k, txt: "Après l'échéance " + l.n + ' (' + moisAnnee(l.date) + ') : le capital baisse de ' + dt(ecartCrd) + " de plus que l'amortissement : remboursement anticipé." }); }
        else if (ecartCrd < -0.002) anomalies.push({ g: 'erreur', i: k, txt: "Après l'échéance " + l.n + ' (' + moisAnnee(l.date) + ') : le capital restant dû augmente de ' + dt(-ecartCrd) + ' sans explication.' });
      }
    });
    /* Mensualité théorique de chaque phase (tableau complet jusqu'au solde) */
    var complet = Math.abs(L[n - 1].crdAp) <= 0.01;
    phases.forEach(function (ph) {
      var l0 = L[ph.debut], reste = n - ph.debut;
      ph.date = l0.date; ph.lignes = ph.fin - ph.debut + 1;
      /* Une phase d'une seule ligne est déjà signalée par son écart d'intérêts : pas de second constat. */
      if (complet && reste > 0 && ph.fin > ph.debut && !L.slice(ph.debut).some(function (x) { return x.ra; })) {
        ph.theorique = mensualite(l0.crdAv, tauxPeriodePct(ph.taux, periode), reste);
        var hors = r3(ph.echeance - (l0.extras || 0));
        if (isFinite(ph.theorique) && Math.abs(ph.theorique - hors) > 0.01 + reste * 0.0005) anomalies.push({ g: 'alerte', i: ph.debut, txt: 'Phase au taux de ' + tauxPrecis(ph.taux) + ' : échéance ' + dt(hors) + ' hors accessoires, alors que ' + dt(ph.theorique) + ' solde exactement le capital sur ' + libMois(reste) + '.' });
      }
    });
    /* Règle des 8 % : réduction de moitié du taux possible quand les intérêts des 36 derniers mois dépassent 8 % du capital restant */
    var dureeTot = tab.info.dureeTotale || n, reductions = [], possibles = [], cumul = [];
    L.forEach(function (l, k) { cumul[k] = (k ? cumul[k - 1] : 0) + (isFinite(l.int) ? l.int : 0); });
    function ratioAvant(k) { if (k < 36) return NaN; var s = cumul[k - 1] - (k > 36 ? cumul[k - 37] : 0); return L[k].crdAv > 0 ? s / L[k].crdAv : NaN; }
    L.forEach(function (l, k) { l.ratio = ratioAvant(k); });
    var dernier = 0;
    for (var p = 1; p < phases.length; p++) {
      var a = phases[p - 1], b = phases[p];
      if (Math.abs(b.taux - a.taux / 2) < 0.01) {
        var r = L[b.debut].ratio;
        reductions.push({ i: b.debut, date: L[b.debut].date, avant: a.taux, apres: b.taux, ratio: r, conforme: !isFinite(r) || r > 0.08 });
        if (isFinite(r) && r <= 0.08) anomalies.push({ g: 'alerte', i: b.debut, txt: "Réduction appliquée à l'échéance " + L[b.debut].n + " alors que le ratio n'est que de " + pct(r * 100, 3) + '.' });
        dernier = b.debut;
      }
    }
    if (dureeTot > 84) {
      var depuis = reductions.length ? dernier + 36 : 36;
      for (i = depuis; i < n; i++) {
        if (isFinite(L[i].ratio) && L[i].ratio > 0.08) {
          var deja = reductions.some(function (z) { return z.i === i; });
          if (!deja) possibles.push({ i: i, date: L[i].date, ratio: L[i].ratio, passe: L[i].date < auj });
          if (possibles.length) break;
        }
      }
    }
    possibles.forEach(function (x) {
      if (x.passe) anomalies.push({ g: 'alerte', i: x.i, txt: "La réduction de taux était possible dès l'échéance " + L[x.i].n + ' (' + moisAnnee(x.date) + ', ratio ' + pct(x.ratio * 100, 3) + ") mais n'apparaît pas dans le tableau." });
    });
    return { info: tab.info, lignes: L, phases: phases, anomalies: anomalies, infos: infos, reductions: reductions, possibles: possibles, periode: periode,
      convAvant: convAvant, complet: complet, totI: somme('int'), totA: somme('am'), totE: somme('ech'), dureeTotale: dureeTot };
  }

  /* ---------- Du tableau contrôlé au crédit en cours du profil ----------
     Valeurs à la date du jour, au format d'un crédit du profil (orbite-calcul.js › normaliserCredit) :
     mensualité (échéance suivante, accessoires compris : ce qui est prélevé), capital restant dû après la dernière
     échéance passée, taux de la période en cours, début et durée (tableau mensuel commençant à l'échéance 1),
     jour du prélèvement, dernière réduction de taux (règle des 8 %), taux variable si le taux change autrement.
     Null si le tableau n'est pas détaillé. */
  var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function creditDepuisAudit(au, maintenant) {
    if (!au || au.nonDetaille || !au.lignes || au.lignes.length < 3) return null;
    var m = maintenant || new Date(), L = au.lignes, fin = new Date(m.getFullYear(), m.getMonth(), m.getDate(), 23, 59, 59);
    var k = -1; for (var i = 0; i < L.length; i++) if (L[i].date <= fin) k = i;
    var proch = k + 1 < L.length ? L[k + 1] : null, ref = proch || L[L.length - 1];
    var kRef = proch ? k + 1 : L.length - 1;
    var capital = k >= 0 ? Math.max(0, r3(L[k].crdAp)) : Math.max(0, r3(L[0].crdAv));
    var ph = (au.phases || []).filter(function (p) { return kRef >= p.debut && kRef <= p.fin; })[0] || (au.phases || [])[au.phases.length - 1];
    var r = {
      banque: (au.info && au.info.banque) || '',
      mensualite: proch && isFinite(proch.ech) ? r3(proch.ech) : 0,
      capitalRestant: capital,
      tauxPct: ph && isFinite(ph.taux) ? ph.taux : null,
      tauxType: null,
      jourPrelevement: ref.date.getDate(),
      moisDebut: 0, anneeDebut: 0, dureeMois: 0,
      moisRestants: proch ? L.length - (k + 1) : 0,
      reductionMois: 0, reductionAnnee: 0,
      termine: !proch && capital <= 0.01
    };
    /* Taux qui change sans être une réduction de moitié : taux variable (TMM). */
    var reducs = au.reductions || [], chg = 0;
    for (var p = 1; p < (au.phases || []).length; p++) {
      var a = au.phases[p - 1], b = au.phases[p];
      if (Math.abs(b.taux - a.taux) > 0.02 && !reducs.some(function (z) { return z.i === b.debut; })) chg++;
    }
    if (chg) r.tauxType = 'variable'; else if (reducs.length) r.tauxType = 'fixe';
    var der = reducs.filter(function (z) { return z.conforme; }).pop();
    if (der) { r.reductionMois = der.date.getMonth() + 1; r.reductionAnnee = der.date.getFullYear(); }
    /* Dates : tableau mensuel complet depuis l'échéance 1 (la première tombe le mois suivant le déblocage). */
    var n0 = L[0].n;
    if (au.periode === 1 && (n0 === 1 || !isFinite(n0))) {
      var d0 = new Date(L[0].date.getFullYear(), L[0].date.getMonth() - 1, 1);
      r.moisDebut = d0.getMonth() + 1; r.anneeDebut = d0.getFullYear();
      r.dureeMois = au.complet ? L.length : (au.dureeTotale || 0);
      if (r.dureeMois) {
        var payees = Math.max(0, (m.getFullYear() - r.anneeDebut) * 12 + (m.getMonth() + 1 - r.moisDebut));
        r.moisRestants = Math.max(0, r.dureeMois - Math.min(payees, r.dureeMois));
      }
    }
    var dl = L[L.length - 1].date;
    r.finTexte = au.complet ? MOIS_LONG[dl.getMonth()] + ' ' + dl.getFullYear() : '';
    return r;
  }
  /* Crédit du profil le plus proche (mensualité à 10 % près), sinon -1. */
  function creditCorrespondant(credits, valeurs) {
    var best = -1, ecart = Infinity;
    (credits || []).forEach(function (c, i) {
      if (!(c.mensualite > 0) || !(valeurs.mensualite > 0)) return;
      var e = Math.abs(c.mensualite - valeurs.mensualite) / valeurs.mensualite;
      if (e <= 0.1 && e < ecart) { ecart = e; best = i; }
    });
    return best;
  }

  /* Texte d'un document lu par FicheLecture : une ligne par ligne du document. */
  function texteDeLignes(lignes) { return (lignes || []).map(function (l) { return l.texte; }).join('\n'); }

  return { analyserOffre: analyserOffre, analyserTableau: analyserTableau, auditerTableau: auditerTableau, texteDeLignes: texteDeLignes,
    creditDepuisAudit: creditDepuisAudit, creditCorrespondant: creditCorrespondant,
    montantBanque: montantBanque, mensualite: mensualite, moisAnnee: moisAnnee };
});
