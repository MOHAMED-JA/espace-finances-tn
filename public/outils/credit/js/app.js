(function () {
  'use strict';

  /* ===================================================================
     Utilitaires
     =================================================================== */
  var PREC = 3;
  var CLE_HISTORIQUE = 'historiqueSimulations';
  var CLE_AGENCE = 'parametresAgence';
  var CLE_LANGUE = 'langue';
  var MAX_HISTORIQUE = 200;
  var mouvementReduit = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var stock = {
    lire: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    suppr: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  function echapper(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ===================================================================
     Langue : français ou arabe (de droite à gauche)
     Les exports PDF, Excel et e-mail restent en français.
     =================================================================== */
  var LANGUE = stock.lire(CLE_LANGUE, 'fr') === 'ar' ? 'ar' : 'fr';
  var forceFr = 0;
  function enArabe() { return !forceFr && LANGUE === 'ar'; }
  function enFrancais(fn) { forceFr++; try { return fn(); } finally { forceFr--; } }
  function t(s, v) {
    var r = (enArabe() && AR[s]) || s;
    if (v) r = r.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
    return r;
  }
  /* Texte d'interface retraduit à chaud lors d'un changement de langue */
  function T(s) { return '<span data-t="' + echapper(s) + '">' + echapper(t(s)) + '</span>'; }
  function A(attr, s) { return ' ' + attr + '="' + echapper(t(s)) + '" data-t-' + attr + '="' + echapper(s) + '"'; }
  var ATTRS_T = ['title', 'aria-label', 'placeholder'];
  function traduireDOM(racine) {
    $$('[data-t]', racine).forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    ATTRS_T.forEach(function (a) {
      $$('[data-t-' + a + ']', racine).forEach(function (el) { el.setAttribute(a, t(el.getAttribute('data-t-' + a))); });
    });
  }

  /* Accords en arabe : 1, 2, 3 à 10, 11 et plus */
  function accordAr(n, un, deux, pl, sg) { return n === 1 ? un : n === 2 ? deux : (n >= 3 && n <= 10 ? n + ' ' + pl : n + ' ' + sg); }
  function libMois(n) { return enArabe() ? accordAr(n, 'شهر واحد', 'شهران', 'أشهر', 'شهرًا') : n + ' mois'; }
  function libEcheances(n) { return enArabe() ? accordAr(n, 'قسط واحد', 'قسطان', 'أقساط', 'قسطًا') : n + ' échéance' + (n > 1 ? 's' : ''); }
  function libAns(v) {
    if (!enArabe()) return fmtSaisie(v) + (v >= 2 ? ' ans' : ' an');
    return Number.isInteger(v) ? accordAr(v, 'سنة واحدة', 'سنتان', 'سنوات', 'سنة') : iso(fmtSaisie(v)) + ' سنة';
  }
  function libAnnees(n) { return enArabe() ? accordAr(n, 'سنة واحدة', 'سنتان', 'سنوات', 'سنة') : n + ' année' + (n > 1 ? 's' : ''); }

  /* ===================================================================
     Formats
     =================================================================== */
  var nfMontant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: PREC, maximumFractionDigits: PREC });
  var nfLibre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
  var nf6 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  /* L'espace fine insécable (U+202F) d'Intl est absente de certaines polices : espace insécable classique */
  function espaces(s) { return s.replace(/ /g, ' '); }
  /* En arabe, un nombre est isolé (LRI … PDI) pour que « 1 234,5 » ne soit pas réordonné */
  function iso(s) { return enArabe() ? '⁦' + s + '⁩' : s; }
  function unite() { return t('TND'); }
  function fmtSaisie(v) { return espaces(nfLibre.format(v)); }
  function fmtNombre(v) { return iso(espaces(nfMontant.format(v))); }
  function fmtLibre(v) { return iso(fmtSaisie(v)); }
  function fmtMoney(v) { return fmtNombre(v) + ' ' + unite(); }
  function fmtMoneyHtml(v) { return echapper(fmtNombre(v)) + '<span class="unit">' + echapper(unite()) + '</span>'; }
  /* Montant pour les documents (PDF, Excel, e-mail) : espaces ordinaires */
  function fmtTexte(v) { return enArabe() ? fmtMoney(v) : nfMontant.format(v).replace(/[  ]/g, ' ') + ' TND'; }
  function fmtPct(v, d) { return iso(espaces(new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)) + ' %'); }
  function fmtTaux(v) { return iso(fmtSaisie(v) + ' %'); }
  function fmtTauxPrecis(v) { return iso(espaces(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(v)) + ' %'); }
  function fmtTm(v) { return iso(nf6.format(v) + ' %'); }
  function fmtSigne(v) { return iso((v > 0 ? '+' : v < 0 ? '-' : '') + fmtSaisie(Math.abs(v))); }
  function fmtCompact(v) { return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v); }

  /* Lecture tolérante d'un nombre saisi : « 50 000 », « 7,5 », « 7.5 » */
  function nettoyer(s) { return String(s).trim().replace(/[\s  ⁦-⁩]/g, '').replace(',', '.'); }
  function lireNombre(s) {
    if (s == null) return NaN;
    var x = nettoyer(s);
    if (x === '' || !/^(\d+\.?\d*|\.\d+)$/.test(x)) return NaN;
    return Number(x);
  }
  /* Nombre signé (variation du TMM) : « +1 », « -0,5 », « −0,25 » */
  function lireNombreSigne(s) {
    if (s == null) return NaN;
    var x = nettoyer(s).replace(/^−/, '-');
    if (x === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(x)) return NaN;
    return Number(x);
  }
  function lireEntier(s) { var v = lireNombre(s); return isFinite(v) && Math.floor(v) === v ? v : NaN; }

  /* « 1 234,567 TND » -> 1234.567 (compatibilité avec l'ancien historique) */
  function frMoneyToNumber(str) {
    if (!str) return NaN;
    var s = String(str).replace(/[^\d,.\-  \s]/g, '');
    s = s.replace(/[\s  ]/g, '');
    s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function roundPrec(v) { var p = Math.pow(10, PREC); return Math.round((v + Number.EPSILON) * p) / p; }
  function round6(v) { return parseFloat(v.toFixed(6)); }
  function pmt(rate, n, pv) { if (Math.abs(rate) < 1e-12) return pv / n; return pv * rate / (1 - Math.pow(1 + rate, -n)); }
  function mensualite(cap, tmPct, n) {
    var r = tmPct / 100;
    if (!isFinite(cap) || !isFinite(r) || !isFinite(n) || n <= 0) return NaN;
    return roundPrec(pmt(r, n, cap));
  }
  /* Taux mensuel en %, arrondi à 6 décimales comme dans la version d'origine */
  function tauxMensuelPct(ta) { return parseFloat((ta / 12).toFixed(6)); }

  function lireDate(v) {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    var p = v.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function aujourdHui() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function moisAnnee(d) { return iso(String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()); }
  function moisLong(d) { return d.toLocaleDateString(enArabe() ? 'ar-TN-u-nu-latn' : 'fr-FR', { month: 'long', year: 'numeric' }); }
  function dateCourte(v) { var d = lireDate(v); return d ? iso(d.toLocaleDateString('fr-FR')) : ''; }
  function dateDuJour() { return iso(new Date().toLocaleDateString('fr-FR')); }

  function ico(id, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }

  /* ===================================================================
     Notifications et boîtes de dialogue
     =================================================================== */
  function toast(message, type, duree) {
    type = type || 'succes';
    var zone = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    var icone = type === 'erreur' ? 'alert' : (type === 'info' ? 'info' : 'check');
    el.innerHTML = '<span class="t-ico">' + ico(icone) + '</span><span class="t-txt">' + echapper(message) + '</span>';
    zone.appendChild(el);
    while (zone.children.length > 3) zone.removeChild(zone.firstChild);
    setTimeout(function () {
      el.classList.add('sortie');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, duree || 3200);
  }

  function ouvrirDialogue(o) {
    var dlg = document.createElement('dialog');
    dlg.className = 'dlg' + (o.large ? ' large' : '');
    dlg.setAttribute('aria-labelledby', 'dlg-titre');
    dlg.innerHTML =
      '<div class="dlg-in">' +
        '<div class="dlg-head">' +
          '<span class="dlg-ico ' + (o.ton || '') + '">' + ico(o.icone || 'info') + '</span>' +
          '<div><h2 class="dlg-title" id="dlg-titre">' + echapper(o.titre) + '</h2>' +
          (o.sousTitre ? '<p class="dlg-sub">' + o.sousTitre + '</p>' : '') + '</div>' +
          '<button class="btn btn-quiet btn-sm btn-icon dlg-x" data-fermer aria-label="' + echapper(t('Fermer')) + '">' + ico('x') + '</button>' +
        '</div>' +
        '<div class="dlg-body">' + (o.corps || '') + '</div>' +
        (o.pied ? '<div class="dlg-foot">' + o.pied + '</div>' : '') +
      '</div>';
    document.body.appendChild(dlg);

    var ferme = false;
    function fermer(valeur) {
      if (ferme) return;
      ferme = true;
      if (o.surFermeture) o.surFermeture(valeur);
      var fin = function () { if (dlg.open) dlg.close(); if (dlg.parentNode) dlg.parentNode.removeChild(dlg); };
      if (mouvementReduit.matches) { fin(); return; }
      dlg.classList.add('fermeture');
      setTimeout(fin, 170);
    }
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); fermer(); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { fermer(); return; }
      if (e.target.closest('[data-fermer]')) fermer();
    });
    dlg.showModal();
    return { el: dlg, fermer: fermer };
  }

  function confirmer(message, options) {
    options = options || {};
    return new Promise(function (resoudre) {
      var d = ouvrirDialogue({
        titre: options.titre || t('Confirmer'),
        icone: 'alert',
        ton: 'red',
        corps: '<p style="color:var(--text-2)">' + echapper(message) + '</p>',
        pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Annuler')) + '</button>' +
              '<button class="btn btn-red" data-ok>' + echapper(options.libelle || t('Confirmer')) + '</button>',
        surFermeture: function (v) { resoudre(v === true); }
      });
      d.el.querySelector('[data-ok]').addEventListener('click', function () { d.fermer(true); });
      setTimeout(function () { var b = d.el.querySelector('[data-ok]'); if (b) b.focus(); }, 30);
    });
  }

  /* Valeur animée (compteur) */
  function animer(el, vers, rendu) {
    var de = parseFloat(el.dataset.val);
    el.dataset.val = vers;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (mouvementReduit.matches || !isFinite(de) || de === vers) { el.innerHTML = rendu(vers); return; }
    var t0 = performance.now(), duree = 520;
    function pas(tt) {
      var p = Math.min(1, (tt - t0) / duree);
      var e = 1 - Math.pow(1 - p, 3);
      el.innerHTML = rendu(p < 1 ? de + (vers - de) * e : vers);
      if (p < 1) el._raf = requestAnimationFrame(pas);
    }
    el._raf = requestAnimationFrame(pas);
  }

  /* ===================================================================
     Calculs financiers
     Échéancier généralisé, par période (mensuelle, trimestrielle,
     semestrielle ou annuelle) :
     - amortissement : échéances constantes, amortissement constant
       (échéances dégressives) ou in fine ;
     - différé partiel (intérêts seuls) ou total (intérêts capitalisés) ;
     - évolution du TMM, réduction de taux dès le 37e mois ;
     - remboursements anticipés ponctuels et versements réguliers, avec
       réduction de la durée ou de l'échéance ;
     - assurance emprunteur sur le capital initial ou restant dû ;
     - frais (dossier, garantie, autres) et TEG.
     Sans option, le résultat est identique au millime près à la version
     d'origine (taux mensuel = taux annuel ÷ 12 arrondi à 6 décimales,
     montants arrondis au millime à chaque échéance).
     =================================================================== */
  var PERIODICITES = [
    { p: 1, nom: 'Mensuelle', echeance: 'Mensualité', pluriel: '{n} mensuelles' },
    { p: 3, nom: 'Trimestrielle', echeance: 'Trimestrialité', pluriel: '{n} trimestrielles' },
    { p: 6, nom: 'Semestrielle', echeance: 'Semestrialité', pluriel: '{n} semestrielles' },
    { p: 12, nom: 'Annuelle', echeance: 'Annuité', pluriel: '{n} annuelles' }
  ];
  function infoPeriodicite(p) { return PERIODICITES.filter(function (x) { return x.p === p; })[0] || PERIODICITES[0]; }
  var AMORTISSEMENTS = [
    { cle: 'constant', nom: 'Échéances constantes' },
    { cle: 'lineaire', nom: 'Amortissement constant' },
    { cle: 'infine', nom: 'In fine' }
  ];
  function nomAmort(cle) { var x = AMORTISSEMENTS.filter(function (y) { return y.cle === cle; })[0]; return x ? x.nom : ''; }

  /* Taux de la période en % (taux annuel × p ÷ 12), arrondi à 6 décimales */
  function tauxPeriodePct(ta, p) { return parseFloat((ta * p / 12).toFixed(6)); }

  function nombreEcheances(r, M, P) {
    if (Math.abs(r) < 1e-12) return Math.max(1, Math.ceil(P / M - 1e-9));
    var x = 1 - r * P / M;
    if (x <= 0) return NaN;
    return Math.max(1, Math.ceil(-Math.log(x) / Math.log(1 + r) - 1e-9));
  }

  function fraisTotal(e) {
    var f = e.frais;
    if (!f) return 0;
    return roundPrec((f.dossierPct || 0) * e.capital / 100 + (f.dossierFixe || 0) + (f.garantie || 0) + (f.autres || 0));
  }

  function calculerEcheancier(e, reduire) {
    var C = e.capital, p = e.periodicite || 1, amort = e.amort || 'constant';
    var nFin = Math.round(e.mois / p);
    var D = e.differe ? Math.round(e.differe.mois / p) : 0, diffTotal = !!(e.differe && e.differe.type === 'total');
    var debut = lireDate(e.dateDebut);
    var v = e.variation || null;
    var ras = e.ras || [], vers = e.versement || null, indemPct = e.indemnite || 0, modeRa = e.raMode === 'mensualite' ? 'mensualite' : 'duree';
    var ass = e.assurance || null;
    /* Réduction de moitié du taux (crédit de plus de 84 mois) : avant chaque
       échéance testée, intérêts des 36 derniers mois / capital restant dû
       strictement supérieur à 8 %. Premier test à l'échéance 37 ; en cas
       d'échec, nouveau test à l'échéance suivante (fenêtre glissante) ;
       après une réduction, prochain test 36 mois plus tard. */
    var fen = 36 / p;
    var reduc = !!reduire && (e.dureeTotale || e.mois) > 84 && fen === Math.round(fen);
    var parAn = 12 / p;
    var lignes = [], paliers = [], raListe = [], reductions = [];
    var reste = C, totI = 0, totP = 0, totM = 0, totIndem = 0, totAss = 0, totRA = 0;
    var M = NaN, P = NaN, tmCourant = NaN, recalcul = false, fini = false, M2 = null, apresRa = false;
    var facteur = 1, prochainTest = fen + 1, int36 = 0;

    function tauxBase(k) {
      var ta = e.taux + (v && k >= v.des ? v.delta : 0);
      return ta < 0 ? 0 : ta;
    }
    function tauxDuPeriode(k) { return tauxBase(k) * facteur; }
    /* Taux réduit non arrondi, comme dans la version d'origine */
    function tmDuPeriode(k) { var ta = tauxDuPeriode(k); return facteur < 1 ? ta * p / 12 : tauxPeriodePct(ta, p); }

    for (var k = 1; k <= nFin && !fini; k++) {
      var nouvelleReduc = false, test = null;
      if (reduc && k >= prochainTest && k > D) {
        var ratioT = reste > 0 ? int36 / reste : 0;
        test = { ratio: ratioT, ok: ratioT > 0.08 };
        lignes[k - 2].test = test;
        if (test.ok) {
          var avant = tauxDuPeriode(k);
          facteur /= 2;
          nouvelleReduc = true;
          prochainTest = k + fen;
          reductions.push({ mois: k, date: debut ? new Date(debut.getFullYear(), debut.getMonth() + (k - 1) * p, 1) : null,
            avant: avant, apres: tauxDuPeriode(k), ratio: ratioT, interets: int36, reste: reste, M: NaN });
        } else prochainTest = k + 1;
      }
      var tm = tmDuPeriode(k), r = tm / 100;
      var enDiff = k <= D;
      var resteAvant = reste;
      var interet = roundPrec(reste * r);
      var principal, paiement;
      if (enDiff) {
        if (diffTotal) { principal = roundPrec(-interet); paiement = 0; }
        else { principal = 0; paiement = interet; }
      } else {
        if (k === D + 1 || tm !== tmCourant || recalcul || nouvelleReduc) {
          if (amort === 'constant') M = mensualite(reste, tm, nFin - k + 1);
          else if (amort === 'lineaire' && (k === D + 1 || recalcul)) P = roundPrec(reste / (nFin - k + 1));
          tmCourant = tm;
          recalcul = false;
          if (nouvelleReduc && amort === 'constant') { reductions[reductions.length - 1].M = M; if (M2 === null) M2 = M; }
          if (amort === 'constant' && (!paliers.length || paliers[paliers.length - 1].M !== M)) paliers.push({ mois: k, M: M, taux: tauxDuPeriode(k) });
        }
        if (amort === 'constant') { principal = roundPrec(M - interet); paiement = M; }
        else if (amort === 'lineaire') { principal = P; paiement = roundPrec(P + interet); }
        else { principal = 0; paiement = interet; }
        if (k === nFin || ((apresRa || amort === 'lineaire') && principal >= reste)) {
          principal = roundPrec(reste);
          paiement = roundPrec(interet + principal);
          fini = true;
        }
      }
      reste = roundPrec(reste - principal);
      var prime = ass ? roundPrec((ass.base === 'crd' ? resteAvant : C) * ass.taux / 100 * p / 12) : 0;
      totI = roundPrec(totI + interet);
      totP = roundPrec(totP + principal);
      totM = roundPrec(totM + paiement + prime);
      totAss = roundPrec(totAss + prime);
      var ligne = {
        mois: k,
        date: debut ? new Date(debut.getFullYear(), debut.getMonth() + (k - 1) * p, 1) : null,
        paiement: paiement, interet: interet, principal: principal, assurance: prime, reste: reste,
        reduit: facteur < 1, reduction: nouvelleReduc ? reductions.length : 0, revise: !!(v && k === v.des), differe: enDiff
      };
      lignes.push(ligne);
      int36 = roundPrec(int36 + interet - (k > fen ? lignes[k - 1 - fen].interet : 0));

      /* Remboursements anticipés ponctuels et versements réguliers, après l'échéance k */
      if (!fini && reste > 0) {
        var verse = 0, limite = false;
        ras.forEach(function (x) {
          var dispo = roundPrec(reste - verse);
          if (x.apres !== k || dispo <= 0) return;
          var mt = x.total ? dispo : Math.min(x.montant, dispo);
          if (!x.total && x.montant > dispo + 0.0005) limite = true;
          verse = roundPrec(verse + mt);
        });
        if (vers && k >= vers.des && (vers.frequence === 'periode' || (k - vers.des) % parAn === 0)) {
          var dispo2 = roundPrec(reste - verse);
          if (dispo2 > 0) verse = roundPrec(verse + Math.min(vers.montant, dispo2));
        }
        if (verse > 0) {
          var indem = roundPrec(verse * indemPct / 100);
          reste = roundPrec(reste - verse);
          totP = roundPrec(totP + verse);
          totM = roundPrec(totM + verse + indem);
          totIndem = roundPrec(totIndem + indem);
          totRA = roundPrec(totRA + verse);
          ligne.ra = { montant: verse, indemnite: indem, reste: reste, limite: limite };
          raListe.push({ mois: k, date: ligne.date, montant: verse, indemnite: indem, limite: limite });
          apresRa = true;
          if (reste <= 0) fini = true;
          else if (k >= D) {
            if (modeRa === 'duree' && amort === 'constant' && isFinite(M)) {
              var kc = nombreEcheances(tmDuPeriode(k + 1) / 100, M, reste);
              if (isFinite(kc)) nFin = k + kc; else recalcul = true;
            } else if (modeRa === 'duree' && amort === 'lineaire' && P > 0) {
              nFin = k + Math.max(1, Math.ceil(reste / P - 1e-9));
            } else if (amort !== 'infine') recalcul = true;
          }
        }
      }
    }

    if (reduc) {
      var cumul = 0;
      lignes.forEach(function (l, i) {
        cumul = roundPrec(cumul + l.interet - (i >= fen ? lignes[i - fen].interet : 0));
        l.int36 = i + 1 >= fen ? cumul : null;
        var crd = resteFin(l);
        l.ratio = i + 1 >= fen && crd > 0 ? cumul / crd : null;
      });
    }
    var frais = fraisTotal(e);
    var premiere = lignes[Math.min(D, lignes.length - 1)];
    var res = {
      lignes: lignes, paliers: paliers,
      M1: amort === 'constant' && paliers.length ? paliers[0].M : (premiere ? premiere.paiement : NaN),
      M2: M2, ta2: reductions.length ? reductions[0].apres : null, reductions: reductions,
      totI: totI, totP: totP, totM: totM, totIndem: totIndem, totAss: totAss, totRA: totRA, frais: frais,
      coutTotal: roundPrec(C + totI + totAss + totIndem + frais),
      coutCredit: roundPrec(totI + totAss + totIndem + frais),
      n: lignes.length, nPrevu: Math.round(e.mois / p), C: C, p: p, amort: amort, D: D, diffTotal: diffTotal,
      tm: tauxPeriodePct(e.taux, p), debut: debut, ras: raListe, reduc: reduc && reductions.length > 0, reducDemandee: reduc
    };
    res.teg = calculerTEG(res);
    return res;
  }

  /* TEG : taux de période (taux actuariel des flux réels : capital versé
     moins les frais, échéances, assurance, remboursements anticipés et
     indemnités) multiplié par le nombre de périodes dans l'année. */
  function calculerTEG(r) {
    var flux = [r.C - r.frais];
    r.lignes.forEach(function (l) { flux.push(-(l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0))); });
    function van(i) {
      var s = 0, f = 1;
      for (var t = 0; t < flux.length; t++) { s += flux[t] / f; f *= 1 + i; }
      return s;
    }
    var bas = -0.9, haut = 2;
    var vb = van(bas), vh = van(haut);
    if (!isFinite(vb) || !isFinite(vh) || vb * vh > 0) return NaN;
    for (var it = 0; it < 200; it++) {
      var mil = (bas + haut) / 2, vm = van(mil);
      if (vb * vm <= 0) haut = mil; else { bas = mil; vb = vm; }
    }
    return (bas + haut) / 2 * (12 / r.p) * 100;
  }

  function resteFin(l) { return l.ra ? l.ra.reste : l.reste; }
  function totalLigne(l) { return roundPrec(l.paiement + l.assurance); }

  function agregerAnnuel(res) {
    var out = [], parAn = 12 / (res.p || 1);
    for (var i = 0; i < res.lignes.length; i += parAn) {
      var g = res.lignes.slice(i, i + parAn);
      var der = g[g.length - 1];
      var a = { annee: i / parAn + 1, debut: g[0].date, fin: der.date, paiement: 0, interet: 0, principal: 0, assurance: 0, reste: resteFin(der), reduit: false, differe: false, nb: g.length, ra: null };
      g.forEach(function (l) {
        a.paiement = roundPrec(a.paiement + l.paiement + l.assurance);
        a.interet = roundPrec(a.interet + l.interet);
        a.principal = roundPrec(a.principal + l.principal);
        a.assurance = roundPrec(a.assurance + l.assurance);
        if (l.ra) {
          a.paiement = roundPrec(a.paiement + l.ra.montant + l.ra.indemnite);
          a.principal = roundPrec(a.principal + l.ra.montant);
          a.ra = l.ra;
        }
        if (l.reduit) a.reduit = true;
        if (l.differe) a.differe = true;
      });
      out.push(a);
    }
    return out;
  }

  /* Réductions de taux successives : « 2,25 % → 1,125 % dès l'échéance 103 (09/2031) » */
  function texteReductions(r) {
    return r.reductions.map(function (x) {
      return t('{a} → {b} dès l\'échéance {n}', { a: fmtTauxPrecis(x.avant), b: fmtTauxPrecis(x.apres), n: x.mois }) + (x.date ? ' (' + moisAnnee(x.date) + ')' : '');
    }).join(' ; ');
  }

  /* Description des échéances : « 1 000 TND puis 900 TND dès l'échéance 37 »,
     différé, amortissement constant ou in fine */
  function texteEcheances(r, fmt) {
    fmt = fmt || fmtTexte;
    var parts = [];
    if (r.D > 0) {
      parts.push(r.diffTotal
        ? t('aucun paiement pendant le différé ({n}, intérêts capitalisés)', { n: libEcheances(r.D) })
        : t('{m} pendant le différé ({n}, intérêts seuls)', { m: fmt(r.lignes[0].paiement), n: libEcheances(r.D) }));
    }
    var der = r.lignes[r.lignes.length - 1];
    if (r.amort === 'lineaire') {
      parts.push(t('{a} à la première échéance, puis dégressive jusqu\'à {b}', { a: fmt(r.M1), b: fmt(der.paiement) }));
    } else if (r.amort === 'infine') {
      parts.push(t('{a} (intérêts seuls), puis {b} à la dernière échéance', { a: fmt(r.M1), b: fmt(der.paiement) }));
    } else {
      var txt = fmt(r.M1);
      r.paliers.slice(1).forEach(function (q) { txt += ' ' + t('puis {m} dès l\'échéance {n}', { m: fmt(q.M), n: q.mois }); });
      parts.push(txt);
    }
    return parts.join(t(', puis '));
  }

  /* ===================================================================
     Paramètres de l'agence (logo, TMM de référence, types de crédit,
     règles d'éligibilité)
     =================================================================== */
  var TYPES = [
    { cle: 'immo', nom: 'Immobilier', ico: 'home' },
    { cle: 'auto', nom: 'Auto', ico: 'car' },
    { cle: 'conso', nom: 'Consommation', ico: 'bag' },
    { cle: 'libre', nom: 'Libre', ico: 'sliders' }
  ];
  function nomType(cle) { var x = TYPES.filter(function (y) { return y.cle === cle; })[0]; return x ? x.nom : ''; }

  function agenceDefaut() {
    return {
      nom: '', conseiller: '', tel: '', logo: '', logoL: 0, logoH: 0,
      tmm: 7.5, ageMax: 70, endettementMax: 40, apportMin: 20,
      types: {
        immo: { duree: 20, mode: 'tmm', valeur: 2.5 },
        auto: { duree: 5, mode: 'tmm', valeur: 3 },
        conso: { duree: 3, mode: 'fixe', valeur: 11 }
      }
    };
  }
  function lireAgence() {
    var a = agenceDefaut(), brut = null;
    try { brut = JSON.parse(stock.lire(CLE_AGENCE, 'null')); } catch (e) { brut = null; }
    if (!brut || typeof brut !== 'object') return a;
    ['nom', 'conseiller', 'tel', 'logo'].forEach(function (k) { if (typeof brut[k] === 'string') a[k] = brut[k]; });
    if (typeof brut.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(brut.couleur)) a.couleur = brut.couleur.toLowerCase();
    if (brut.logoL > 0 && brut.logoH > 0) { a.logoL = brut.logoL; a.logoH = brut.logoH; }
    if (isFinite(brut.tmm) && brut.tmm >= 0 && brut.tmm <= 50) a.tmm = Number(brut.tmm);
    if (isFinite(brut.ageMax) && brut.ageMax >= 18 && brut.ageMax <= 100) a.ageMax = Number(brut.ageMax);
    if (isFinite(brut.endettementMax) && brut.endettementMax > 0 && brut.endettementMax <= 100) a.endettementMax = Number(brut.endettementMax);
    if (isFinite(brut.apportMin) && brut.apportMin >= 0 && brut.apportMin <= 100) a.apportMin = Number(brut.apportMin);
    if (brut.types && typeof brut.types === 'object') {
      Object.keys(a.types).forEach(function (k) {
        var b = brut.types[k];
        if (!b) return;
        if (isFinite(b.duree) && b.duree > 0 && b.duree <= 25) a.types[k].duree = Number(b.duree);
        if (b.mode === 'tmm' || b.mode === 'fixe') a.types[k].mode = b.mode;
        if (isFinite(b.valeur) && b.valeur >= 0 && b.valeur <= 50) a.types[k].valeur = Number(b.valeur);
      });
    }
    return a;
  }
  var agence = lireAgence();
  function ligneAgence() {
    return [agence.nom, agence.conseiller ? t('Conseiller : {n}', { n: agence.conseiller }) : '', agence.tel ? t('Tél. : {n}', { n: agence.tel }) : '']
      .filter(Boolean).join(' · ');
  }

  /* ===================================================================
     Historique (clé compatible avec la version précédente)
     =================================================================== */
  function lireHistorique() {
    var brut;
    try { brut = JSON.parse(stock.lire(CLE_HISTORIQUE, '[]')); } catch (e) { brut = []; }
    if (!Array.isArray(brut)) brut = [];
    return brut.filter(function (s) { return s && typeof s === 'object'; }).map(function (s) {
      if (!s.n) {
        var mens = String(s.mensualite || '').split('→');
        s.n = {
          capital: lireNombre(s.capital),
          mois: parseInt(s.duree, 10),
          taux: lireNombre(s.tauxAnnuel),
          mensualite: frMoneyToNumber(mens[0]),
          mensualite2: mens[1] ? frMoneyToNumber(mens[1]) : null,
          interets: frMoneyToNumber(s.interets),
          reduction: !!mens[1]
        };
      }
      return s;
    });
  }
  function ecrireHistorique(h) { return stock.ecrire(CLE_HISTORIQUE, JSON.stringify(h)); }

  /* Options d'une simulation, au format de sc.appliquer (historique, lien) */
  function optionsDe(e) {
    return {
      type: e.type, tmm: e.tmm, variation: e.variation, periodicite: e.periodicite, amort: e.amort, differe: e.differe,
      assurance: e.assurance, frais: e.frais, apport: e.apport, ras: e.ras, versement: e.versement,
      indemnite: e.indemnite, raMode: e.raMode, emprunteur: e.emprunteur
    };
  }

  function sauvegarderSimulation(sc) {
    var e = sc.entrees, r = sc.resultat;
    if (!e || !r) return false;
    return enFrancais(function () {
      var h = lireHistorique();
      h.unshift({
        id: Date.now(),
        date: new Date().toLocaleString('fr-FR'),
        capital: String(e.capital),
        duree: String(e.mois),
        tauxAnnuel: String(e.taux),
        dateDebut: e.dateDebut,
        mensualite: r.M2 != null ? fmtMoney(r.M1) + ' → ' + fmtMoney(r.M2) : fmtMoney(r.M1),
        interets: fmtMoney(r.totI),
        scenario: sc.nom,
        client: e.client.nom || '',
        reference: e.client.ref || '',
        n: Object.assign({
          capital: e.capital, mois: e.mois, taux: e.taux, mensualite: r.M1, mensualite2: r.M2, interets: r.totI, reduction: r.reduc,
          cout: r.coutTotal, teg: r.teg
        }, optionsDe(e))
      });
      if (h.length > MAX_HISTORIQUE) h = h.slice(0, MAX_HISTORIQUE);
      return ecrireHistorique(h);
    });
  }

  function valeursHistorique(s) {
    var n = s.n;
    var ras = n.ras || (n.ra ? [{ apres: n.ra.apres, total: !!n.ra.total, montant: n.ra.montant }] : null);
    return {
      capital: n.capital, mois: n.mois, taux: n.taux, dateDebut: s.dateDebut || '', reduction: !!n.reduction,
      type: n.type || 'libre', tmm: n.tmm || null, variation: n.variation || null,
      periodicite: n.periodicite || 1, amort: n.amort || 'constant', differe: n.differe || null,
      assurance: n.assurance || null, frais: n.frais || null, apport: n.apport || null,
      ras: ras, versement: n.versement || null,
      indemnite: n.indemnite != null ? n.indemnite : (n.ra ? n.ra.indemnite : 0), raMode: n.raMode || (n.ra ? n.ra.mode : 'duree'),
      emprunteur: n.emprunteur || null,
      client: { nom: s.client || '', ref: s.reference || '' }
    };
  }

  /* ===================================================================
     Scénario (instancié pour A et B)
     =================================================================== */
  function champHtml(k, o) {
    var id = k + '-' + o.id;
    var attrs = o.type === 'date' ? ' type="date"'
      : ' type="text" inputmode="' + (o.mode || 'decimal') + '" autocomplete="off" spellcheck="false"' + (o.ph ? A('placeholder', o.ph) : '');
    return '<div class="field" data-champ="' + o.id + '">' +
      '<div class="field-top"><label for="' + id + '">' + T(o.label) + '</label>' +
        (o.chip ? '<span class="chip num" id="' + k + '-' + o.chip + '" aria-live="polite"></span>' : '') + '</div>' +
      '<div class="input-wrap">' + ico(o.ico) +
        '<input id="' + id + '"' + attrs + ' aria-describedby="' + id + '-err"' + (o.texte ? ' data-texte' : '') + '>' +
        (o.suffixe ? '<span class="suffix">' + T(o.suffixe) + '</span>' : '') + '</div>' +
      (o.range ? '<input class="range" type="range" id="' + id + '-r" min="' + o.range.min + '" max="' + o.range.max + '" step="' + o.range.step + '" value="0"' + A('aria-label', o.range.aria) + ' tabindex="-1">' +
        '<div class="range-scale">' + o.range.scale.map(function (s) { return '<span>' + T(s) + '</span>'; }).join('') + '</div>' : '') +
      '<p class="field-err" id="' + id + '-err"></p>' +
    '</div>';
  }

  function optionHtml(k, o) {
    return '<div class="opt" id="' + k + '-opt-' + o.cle + '" data-on="false">' +
      '<button type="button" class="opt-head" data-opt="' + o.cle + '" aria-controls="' + k + '-optb-' + o.cle + '"' +
        (o.interrupteur ? ' role="switch" aria-checked="false"' : ' aria-expanded="false"') + '>' +
        '<span class="opt-ico">' + ico(o.ico, 'ico-sm') + '</span>' +
        '<span class="opt-txt"><strong>' + T(o.titre) + '</strong><small' + (o.sousId ? ' id="' + k + '-' + o.sousId + '"' : '') + '>' + T(o.sous) + '</small></span>' +
        (o.interrupteur ? '<span class="switch" aria-hidden="true"></span>' : ico('chevron', 'chevron')) +
      '</button>' +
      '<div class="opt-body" id="' + k + '-optb-' + o.cle + '" hidden>' + o.corps + '</div>' +
    '</div>';
  }

  function segHtml(attr, libelle, items, actif, cls) {
    return '<div class="seg-champ"><span class="seg-lib">' + T(libelle) + '</span>' +
      '<div class="seg seg-block' + (cls ? ' ' + cls : '') + '" role="group"' + A('aria-label', libelle) + '>' +
      items.map(function (it) { return '<button type="button" data-' + attr + '="' + it[0] + '" aria-pressed="' + (it[0] === actif) + '">' + T(it[1]) + '</button>'; }).join('') +
      '</div></div>';
  }

  function ligneRaHtml() {
    return '<div class="ra-ligne">' +
      '<div class="input-wrap sm">' + ico('calendar', 'ico-sm') + '<input type="text" inputmode="numeric" class="ra-n" autocomplete="off"' + A('placeholder', 'Après n°') + A('aria-label', 'Après l\'échéance') + '></div>' +
      '<div class="input-wrap sm">' + ico('cash', 'ico-sm') + '<input type="text" inputmode="decimal" class="ra-m" autocomplete="off"' + A('placeholder', 'Montant') + A('aria-label', 'Montant remboursé') + '><span class="suffix">' + T('TND') + '</span></div>' +
      '<label class="check sm"><input type="checkbox" class="ra-t"><span class="check-box" aria-hidden="true">' + ico('check', 'ico-sm') + '</span>' + T('Solde') + '</label>' +
      '<button type="button" class="btn btn-quiet btn-sm btn-icon ra-suppr"' + A('aria-label', 'Supprimer ce remboursement') + A('title', 'Supprimer') + '>' + ico('x', 'ico-sm') + '</button>' +
      '<p class="field-err ra-err"></p>' +
    '</div>';
  }

  function gabaritScenario(k, nom) {
    var types = '<div class="types" role="group"' + A('aria-label', 'Type de crédit') + '>' + TYPES.map(function (ty) {
      return '<button type="button" class="type-chip" data-type="' + ty.cle + '" aria-pressed="' + (ty.cle === 'libre') + '">' + ico(ty.ico, 'ico-sm') + T(ty.nom) + '</button>';
    }).join('') + '</div>';

    var corpsApport =
      '<div class="field-row">' +
        champHtml(k, { id: 'pb', label: 'Prix du bien', ico: 'home', ph: 'Ex. 250 000', suffixe: 'TND' }) +
        champHtml(k, { id: 'ap', label: 'Apport personnel', ico: 'wallet', ph: 'Ex. 50 000', suffixe: 'TND' }) +
      '</div>' +
      '<p class="opt-note" id="' + k + '-ap-note">' + T('Le capital emprunté est le prix du bien moins l\'apport.') + '</p>';

    var corpsTmm =
      '<div class="field-row">' +
        champHtml(k, { id: 'tmm', label: 'TMM', ico: 'trend', ph: 'Ex. 7,5', suffixe: '%' }) +
        champHtml(k, { id: 'marge', label: 'Marge de la banque', ico: 'percent', ph: 'Ex. 2,5', suffixe: '%' }) +
      '</div>' +
      '<p class="opt-note">' + T('Le taux appliqué est la somme du TMM et de la marge.') + '</p>' +
      '<div class="opt-sep">' + T('Évolution du TMM (facultatif)') + '</div>' +
      '<div class="field-row">' +
        champHtml(k, { id: 'dv', label: 'Variation', ico: 'trend', ph: 'Ex. +1 ou -0,5', suffixe: 'pts', mode: 'text' }) +
        champHtml(k, { id: 'dn', label: 'Dès l\'échéance', ico: 'calendar', ph: 'Ex. 13', suffixe: 'n°', mode: 'numeric' }) +
      '</div>';

    var corpsModalites =
      segHtml('per', 'Périodicité', [['1', 'Mensuelle'], ['3', 'Trimestrielle'], ['6', 'Semestrielle'], ['12', 'Annuelle']], '1', 'seg-4') +
      segHtml('am', 'Amortissement', [['constant', 'Échéances constantes'], ['lineaire', 'Amortissement constant'], ['infine', 'In fine']], 'constant', 'seg-3') +
      '<p class="opt-note">' + T('Amortissement constant : le capital remboursé est le même à chaque échéance, qui diminue avec les intérêts. In fine : seuls les intérêts sont payés, le capital est remboursé à la dernière échéance.') + '</p>' +
      '<div class="opt-sep">' + T('Différé de remboursement (facultatif)') + '</div>' +
      champHtml(k, { id: 'df', label: 'Durée du différé', ico: 'clock', ph: 'Ex. 12', suffixe: 'mois', mode: 'numeric' }) +
      segHtml('dt', 'Pendant le différé', [['partiel', 'Intérêts payés (partiel)'], ['total', 'Rien à payer (total)']], 'partiel') +
      '<p class="opt-note">' + T('Le différé est compris dans la durée du crédit. En différé total, les intérêts s\'ajoutent au capital.') + '</p>';

    var corpsFrais =
      '<div class="opt-sep">' + T('Assurance emprunteur') + '</div>' +
      champHtml(k, { id: 'as', label: 'Taux d\'assurance annuel', ico: 'shield', ph: 'Ex. 0,4', suffixe: '%' }) +
      segHtml('ab', 'Calculée sur', [['initial', 'Capital initial'], ['crd', 'Capital restant dû']], 'initial') +
      '<div class="opt-sep">' + T('Frais') + '</div>' +
      '<div class="field-row">' +
        champHtml(k, { id: 'fdp', label: 'Frais de dossier', ico: 'percent', ph: 'Ex. 1', suffixe: '%' }) +
        champHtml(k, { id: 'fdf', label: 'ou montant fixe', ico: 'cash', ph: 'Ex. 150', suffixe: 'TND' }) +
      '</div>' +
      '<div class="field-row">' +
        champHtml(k, { id: 'fg', label: 'Garantie et hypothèque', ico: 'home', ph: 'Ex. 800', suffixe: 'TND' }) +
        champHtml(k, { id: 'fa', label: 'Autres frais', ico: 'coins', ph: 'Ex. 50', suffixe: 'TND' }) +
      '</div>' +
      '<p class="opt-note">' + T('Ces frais et l\'assurance entrent dans le coût total et dans le TEG.') + '</p>';

    var corpsRa =
      '<div class="opt-sep">' + T('Remboursements ponctuels') + '</div>' +
      '<div class="ra-liste" id="' + k + '-ra-liste">' + ligneRaHtml() + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm ra-ajout" id="' + k + '-ra-ajout">' + ico('plus', 'ico-sm') + T('Ajouter un remboursement') + '</button>' +
      '<div class="opt-sep">' + T('Versement régulier (facultatif)') + '</div>' +
      '<div class="field-row">' +
        champHtml(k, { id: 'vm', label: 'Montant du versement', ico: 'cash', ph: 'Ex. 200', suffixe: 'TND' }) +
        champHtml(k, { id: 'vd', label: 'Dès l\'échéance', ico: 'calendar', ph: 'Ex. 1', suffixe: 'n°', mode: 'numeric' }) +
      '</div>' +
      segHtml('vf', 'Fréquence', [['periode', 'À chaque échéance'], ['annee', 'Une fois par an']], 'periode') +
      '<div class="opt-sep">' + T('Conditions') + '</div>' +
      champHtml(k, { id: 'rai', label: 'Indemnité', ico: 'percent', ph: 'Ex. 0', suffixe: '%' }) +
      segHtml('ramode', 'Après chaque remboursement', [['duree', 'Réduire la durée'], ['mensualite', 'Réduire l\'échéance']], 'duree') +
      '<p class="opt-note">' + T('L\'indemnité s\'applique à tous les remboursements anticipés, ponctuels et réguliers.') + '</p>';

    var corpsEmprunteur =
      '<div class="field-row">' +
        champHtml(k, { id: 'age', label: 'Âge actuel', ico: 'user', ph: 'Ex. 35', suffixe: 'ans', mode: 'numeric' }) +
        champHtml(k, { id: 'rev', label: 'Revenus mensuels nets', ico: 'wallet', ph: 'Ex. 3 000', suffixe: 'TND' }) +
      '</div>' +
      champHtml(k, { id: 'chg', label: 'Autres charges mensuelles', ico: 'coins', ph: 'Ex. 400', suffixe: 'TND' });

    var corpsClient =
      champHtml(k, { id: 'clnom', label: 'Nom du client', ico: 'user', ph: 'Ex. Sami Ben Salah', mode: 'text', texte: true }) +
      champHtml(k, { id: 'clref', label: 'Référence du dossier', ico: 'file', ph: 'Ex. DOS-2026-0142', mode: 'text', texte: true });

    return '' +
    '<div class="scenario-grid">' +
      '<section class="card form-card" aria-labelledby="' + k + '-titre">' +
        '<div class="card-head">' +
          '<div><h2 class="card-title" id="' + k + '-titre">' + T('Paramètres du crédit') + '</h2><p class="card-sub">' + T('Les résultats se mettent à jour pendant la saisie.') + '</p></div>' +
          '<span class="badge-sc"' + A('aria-label', 'Scénario ' + nom) + '>' + nom + '</span>' +
        '</div>' +
        '<div class="nl-bar" data-hors-form>' +
          '<div class="nl-champ">' + ico('sparkle', 'ico-sm') + '<input type="text" id="' + k + '-nl" data-nl data-texte autocomplete="off" enterkeyhint="go"' + A('placeholder', 'Ex. 150 000 sur 20 ans à TMM + 2,5') + A('aria-label', 'Décrivez votre crédit en une phrase') + '></div>' +
          (vocalDisponible() ? '<button type="button" class="btn btn-quiet btn-sm btn-icon nl-micro" data-nl-micro' + A('aria-label', 'Dicter mon crédit (micro)') + A('title', 'Dicter mon crédit (micro)') + '>' + ico('mic', 'ico-sm') + '</button>' : '') +
          '<button type="button" class="btn btn-primary btn-sm" data-nl-go' + A('aria-label', 'Remplir le formulaire') + '>' + ico('sparkle', 'ico-sm') + '<span class="nl-go-lbl">' + T('Remplir') + '</span></button>' +
        '</div>' +
        types +
        '<div class="fields">' +
          '<div class="bloc capital-bloc">' +
            champHtml(k, { id: 'capital', label: 'Capital emprunté', ico: 'cash', ph: 'Ex. 50 000', suffixe: 'TND',
              range: { min: 0, max: 500000, step: 1000, aria: 'Capital emprunté, curseur', scale: ['0', '250 k', '500 k'] } }) +
            optionHtml(k, { cle: 'apport', titre: 'Prix du bien et apport', sous: 'Capital = prix du bien − apport personnel', ico: 'home', interrupteur: true, corps: corpsApport }) +
          '</div>' +
          champHtml(k, { id: 'annees', label: 'Durée', ico: 'clock', ph: 'Ex. 7', suffixe: 'ans', chip: 'mois',
            range: { min: 0, max: 25, step: 0.5, aria: 'Durée en années, curseur', scale: ['0', '12,5 ans', '25 ans'] } }) +
          '<div class="bloc taux-bloc">' +
            champHtml(k, { id: 'taux', label: 'Taux d\'intérêt annuel', ico: 'percent', ph: 'Ex. 7,5', suffixe: '%', chip: 'tm',
              range: { min: 0, max: 20, step: 0.05, aria: 'Taux annuel, curseur', scale: ['0 %', '10 %', '20 %'] } }) +
            optionHtml(k, { cle: 'tmm', titre: 'Taux indexé sur le TMM', sous: 'Taux = TMM + marge de la banque', ico: 'trend', interrupteur: true, corps: corpsTmm }) +
          '</div>' +
          champHtml(k, { id: 'date', label: 'Date de début du crédit', ico: 'calendar', type: 'date' }) +
          optionHtml(k, { cle: 'modalites', titre: 'Modalités de remboursement', sous: 'Périodicité, amortissement, différé', sousId: 'mod-sub', ico: 'sliders', interrupteur: false, corps: corpsModalites }) +
          optionHtml(k, { cle: 'frais', titre: 'Assurance et frais', sous: 'Assurance emprunteur, frais de dossier et de garantie, TEG', ico: 'shield', interrupteur: true, corps: corpsFrais }) +
          optionHtml(k, { cle: 'ra', titre: 'Remboursements anticipés', sous: 'Versements ponctuels ou réguliers en cours de crédit', ico: 'fast', interrupteur: true, corps: corpsRa }) +
          optionHtml(k, { cle: 'emprunteur', titre: 'Emprunteur et éligibilité', sous: 'Âge, revenus et charges : endettement et reste à vivre', ico: 'check', interrupteur: true, corps: corpsEmprunteur }) +
          optionHtml(k, { cle: 'client', titre: 'Dossier client', sous: 'Nom et référence repris sur les documents', ico: 'user', interrupteur: false, corps: corpsClient }) +
        '</div>' +
        '<div class="form-actions">' +
          '<button class="btn btn-primary btn-block" id="' + k + '-calculer">' + ico('calc') + T('Calculer et enregistrer') + '</button>' +
          '<div class="form-actions-row">' +
            '<button class="btn btn-ghost" id="' + k + '-reset">' + ico('reset') + T('Réinitialiser') + '</button>' +
            '<button class="btn btn-orange" id="' + k + '-reduire"' + A('title', 'Divise le taux par deux (crédit de plus de 84 mois) dès que les intérêts des 36 derniers mois dépassent strictement 8 % du capital restant dû, contrôlé dès l\'échéance 37 puis chaque mois ; nouvelle réduction possible 36 mois après la précédente') + '>' + ico('down') + T('Réduire le taux') + '</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<div class="results">' +
        '<div class="empty" id="' + k + '-vide">' +
          '<div>' +
            '<svg class="empty-art" viewBox="0 0 140 140" aria-hidden="true">' +
              '<defs><linearGradient id="' + k + '-g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8C5000"/><stop offset=".55" stop-color="#C27A1A"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>' +
              '<circle cx="70" cy="70" r="62" fill="url(#' + k + '-g1)" opacity=".12"/>' +
              '<circle cx="70" cy="70" r="44" fill="none" stroke="url(#' + k + '-g1)" stroke-width="12" stroke-dasharray="190 90" stroke-linecap="round" transform="rotate(-90 70 70)"/>' +
              '<path d="M52 78l12-12 9 9 16-17" fill="none" stroke="url(#' + k + '-g1)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
            '<h3>' + T('Votre simulation apparaîtra ici') + '</h3>' +
            '<p>' + T('Renseignez le capital, la durée et le taux : la mensualité, le coût du crédit et l\'échéancier s\'affichent instantanément.') + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="results-body" id="' + k + '-res" hidden>' +
          '<div class="kpis" aria-live="polite">' +
            '<div class="kpi vif k-violet" id="' + k + '-k1"><div class="kpi-label"><span class="pastille">' + ico('calendar', 'ico-sm') + '</span><span id="' + k + '-k1-lib">' + echapper(t('Mensualité')) + '</span></div>' +
              '<div class="kpi-value" id="' + k + '-mens"></div><div class="kpi-sub" id="' + k + '-mens-sub"></div></div>' +
            '<div class="kpi vif k-warm" id="' + k + '-k2"><div class="kpi-label"><span class="pastille">' + ico('coins', 'ico-sm') + '</span>' + T('Coût total des intérêts') + '</div>' +
              '<div class="kpi-value" id="' + k + '-int"></div><div class="kpi-sub" id="' + k + '-int-sub"></div></div>' +
            '<div class="kpi"><div class="kpi-label"><span class="pastille">' + ico('cash', 'ico-sm') + '</span>' + T('Coût total du crédit') + '</div>' +
              '<div class="kpi-value" id="' + k + '-tot"></div><div class="kpi-sub" id="' + k + '-tot-sub"></div></div>' +
            '<div class="kpi"><div class="kpi-label"><span class="pastille">' + ico('flag', 'ico-sm') + '</span>' + T('Dernière échéance') + '</div>' +
              '<div class="kpi-value" id="' + k + '-fin" style="text-transform:capitalize"></div><div class="kpi-sub" id="' + k + '-fin-sub"></div></div>' +
          '</div>' +

          '<div class="notice" id="' + k + '-reduc" hidden></div>' +

          '<div class="card split">' +
            '<div class="split-head"><strong style="font-size:14px">' + T('Répartition du coût') + '</strong>' +
              '<div class="split-legend"><span><i style="background:linear-gradient(90deg,#8C5000,#B86E00)"></i>' + T('Capital') + ' <b class="num" id="' + k + '-pc"></b></span>' +
              '<span><i style="background:linear-gradient(90deg,#C27A1A,#f97316)"></i>' + T('Intérêts') + ' <b class="num" id="' + k + '-pi"></b></span>' +
              '<span id="' + k + '-pa-leg" hidden><i style="background:linear-gradient(90deg,#0891b2,#22d3ee)"></i>' + T('Assurance et frais') + ' <b class="num" id="' + k + '-pa"></b></span></div></div>' +
            '<div class="split-bar" role="img" id="' + k + '-bar"><span class="s-cap" id="' + k + '-bc"></span><span class="s-int" id="' + k + '-bi"></span><span class="s-ass" id="' + k + '-ba"></span></div>' +
          '</div>' +

          '<div class="card cout-card" id="' + k + '-cout"></div>' +
          '<div class="card visu-card" id="' + k + '-visu" data-hors-form></div>' +
          '<div class="card elig-card" id="' + k + '-elig" hidden></div>' +
          '<div class="card ra-card" id="' + k + '-racard" hidden></div>' +
          '<div class="card sensi" id="' + k + '-sensi" hidden></div>' +
          '<div class="card temps-card" id="' + k + '-temps" data-hors-form></div>' +

          '<section class="card schedule" aria-labelledby="' + k + '-titre-ech">' +
            '<div class="schedule-head">' +
              '<div><h2 class="card-title" id="' + k + '-titre-ech">' + T('Tableau d\'amortissement') + '</h2><p class="card-sub" id="' + k + '-ech-sub"></p></div>' +
              '<div class="schedule-tools">' +
                '<div class="seg" role="group"' + A('aria-label', 'Période d\'affichage') + '>' +
                  '<button type="button" data-vue="mensuel" aria-pressed="true">' + T('Par échéance') + '</button>' +
                  '<button type="button" data-vue="annuel" aria-pressed="false">' + T('Annuel') + '</button>' +
                '</div>' +
                '<div class="seg" role="group"' + A('aria-label', 'Type d\'affichage') + '>' +
                  '<button type="button" data-aff="tableau" aria-pressed="true">' + ico('table', 'ico-sm') + T('Tableau') + '</button>' +
                  '<button type="button" data-aff="graphique" aria-pressed="false">' + ico('chart', 'ico-sm') + T('Graphique') + '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="export-bar">' +
              '<button class="btn btn-green btn-sm" id="' + k + '-xlsx">' + ico('sheet', 'ico-sm') + T('Exporter Excel') + '</button>' +
              '<button class="btn btn-orange btn-sm" id="' + k + '-pdf">' + ico('file', 'ico-sm') + T('Exporter PDF') + '</button>' +
              '<button class="btn btn-primary btn-sm" id="' + k + '-rapport"' + A('title', 'Rapport client premium : couverture, synthèse, conseils, échéancier et signatures') + '>' + ico('award', 'ico-sm') + T('Rapport client') + '</button>' +
              '<button class="btn btn-ghost btn-sm" id="' + k + '-print">' + ico('printer', 'ico-sm') + T('Imprimer') + '</button>' +
              '<button class="btn btn-blue btn-sm" id="' + k + '-mail">' + ico('mail', 'ico-sm') + T('Partager par e-mail') + '</button>' +
              '<button class="btn btn-whatsapp btn-sm" id="' + k + '-wa">' + ico('whatsapp', 'ico-sm') + T('WhatsApp') + '</button>' +
              '<button class="btn btn-violet btn-sm" id="' + k + '-qr">' + ico('qr', 'ico-sm') + T('QR code') + '</button>' +
              '<button class="btn btn-ghost btn-sm" id="' + k + '-ics">' + ico('calendar', 'ico-sm') + T('Agenda (.ics)') + '</button>' +
            '</div>' +
            '<div class="table-wrap" id="' + k + '-twrap" tabindex="0"' + A('aria-label', 'Tableau d\'amortissement, défilable') + '>' +
              '<table class="amort"><thead id="' + k + '-thead"></thead><tbody id="' + k + '-tbody"></tbody><tfoot id="' + k + '-tfoot"></tfoot></table>' +
            '</div>' +
            '<div class="chart-wrap" id="' + k + '-cwrap" hidden><canvas id="' + k + '-chart" role="img"' + A('aria-label', 'Graphique de l\'amortissement') + '></canvas></div>' +
          '</section>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var scenarios = {};
  var actif = 'a';

  var CHAMPS_NUM = ['capital', 'annees', 'taux', 'tmm', 'marge', 'dn', 'rai', 'pb', 'ap', 'df', 'as', 'fdp', 'fdf', 'fg', 'fa', 'vm', 'vd', 'age', 'rev', 'chg'];
  var CHAMPS_BASE = ['capital', 'annees', 'taux', 'tmm', 'marge', 'pb', 'ap'];
  var CHAMPS_ERR = ['capital', 'annees', 'taux', 'tmm', 'marge', 'dv', 'dn', 'rai', 'pb', 'ap', 'df', 'as', 'fdp', 'fdf', 'fg', 'fa', 'vm', 'vd', 'age', 'rev', 'chg'];
  var TOUS_CHAMPS = ['capital', 'annees', 'taux', 'date', 'tmm', 'marge', 'dv', 'dn', 'rai', 'pb', 'ap', 'df', 'as', 'fdp', 'fdf', 'fg', 'fa', 'vm', 'vd', 'age', 'rev', 'chg', 'clnom', 'clref'];

  function creerScenario(k, nom) {
    var racine = document.getElementById('scenario-' + k);
    racine.innerHTML = gabaritScenario(k, nom);
    var f = function (id) { return document.getElementById(k + '-' + id); };

    var sc = {
      cle: k, nom: nom, racine: racine,
      vue: 'mensuel', aff: 'tableau', reduction: false,
      type: 'libre', opts: { apport: false, tmm: false, modalites: false, frais: false, ra: false, emprunteur: false, client: false },
      choix: { per: '1', am: 'constant', dt: 'partiel', ab: 'initial', vf: 'periode', ramode: 'duree' },
      entrees: null, resultat: null, chart: null,
      champs: {}, curseurs: { capital: f('capital-r'), annees: f('annees-r'), taux: f('taux-r') }
    };
    TOUS_CHAMPS.forEach(function (id) { sc.champs[id] = f(id); });
    sc.champs.date.value = aujourdHui();

    /* --- Options repliables et sélecteurs --- */
    function reglerOption(cle, on) {
      sc.opts[cle] = on;
      var bloc = f('opt-' + cle), tete = bloc.querySelector('.opt-head');
      bloc.dataset.on = String(on);
      if (tete.getAttribute('role') === 'switch') tete.setAttribute('aria-checked', String(on));
      else tete.setAttribute('aria-expanded', String(on));
      f('optb-' + cle).hidden = !on;
      if (cle === 'tmm') {
        sc.champs.taux.readOnly = on;
        racine.querySelector('.taux-bloc').classList.toggle('indexe', on);
        if (on && sc.champs.tmm.value.trim() === '') sc.champs.tmm.value = fmtSaisie(agence.tmm);
      }
      if (cle === 'apport') {
        sc.champs.capital.readOnly = on;
        racine.querySelector('.capital-bloc').classList.toggle('indexe', on);
        if (on && sc.champs.pb.value.trim() === '' && isFinite(lireNombre(sc.champs.capital.value))) {
          sc.champs.pb.value = sc.champs.capital.value;
          sc.champs.ap.value = '0';
        }
      }
    }
    function reglerChoix(attr, val) {
      sc.choix[attr] = String(val);
      $$('[data-' + attr + ']', racine).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-' + attr) === sc.choix[attr])); });
    }
    function reglerType(cle) {
      sc.type = cle;
      $$('[data-type]', racine).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.type === cle)); });
    }
    function lignesRa() { return $$('.ra-ligne', f('ra-liste')); }
    function viderRa() {
      f('ra-liste').innerHTML = ligneRaHtml();
    }

    /* --- Saisie --- */
    function lireEntrees() {
      var c = sc.champs;
      var err = {};
      function rempli(ch) { return c[ch].value.trim() !== ''; }
      function num(ch) { return lireNombre(c[ch].value); }
      /* Montant facultatif : vide = 0, sinon nombre positif */
      function optionnel(ch, max, msg) {
        if (!rempli(ch)) return 0;
        var v = num(ch);
        if (!isFinite(v) || v > max) { err[ch] = msg; return NaN; }
        return v;
      }

      var p = +sc.choix.per, amort = sc.choix.am;
      var infoP = infoPeriodicite(p);

      /* Apport : capital = prix - apport */
      var apport = null;
      if (sc.opts.apport) {
        var prix = num('pb'), ap = rempli('ap') ? num('ap') : 0;
        if (rempli('pb') && (!isFinite(prix) || prix <= 0)) err.pb = t('Saisissez un montant valide (ex. 50 000).');
        if (!isFinite(ap)) err.ap = t('Saisissez un montant valide (ex. 50 000).');
        else if (isFinite(prix) && ap >= prix) err.ap = t('L\'apport doit être inférieur au prix du bien.');
        if (!err.pb && !err.ap && isFinite(prix) && isFinite(ap)) {
          apport = { prix: prix, apport: ap };
          c.capital.value = fmtSaisie(roundPrec(prix - ap));
        } else c.capital.value = '';
        synchroCurseur('capital');
      }

      var capital = num('capital');
      var annees = num('annees');
      var mois = NaN;
      if (rempli('capital') && !sc.opts.apport) {
        if (!isFinite(capital)) err.capital = t('Saisissez un montant valide (ex. 50 000).');
        else if (capital <= 0) err.capital = t('Le capital doit être supérieur à 0.');
      }
      if (rempli('annees')) {
        if (!isFinite(annees) || annees <= 0) err.annees = t('Saisissez une durée valide, en années (ex. 7 ou 2,5).');
        else {
          mois = Math.round(annees * 12);
          if (mois < 1 || mois > 300) err.annees = t('La durée doit être comprise entre 1 et 300 mois (0,08 à 25 ans).');
          else if (mois % p !== 0) err.annees = t('Avec une périodicité {x}, la durée doit être un multiple de {p} mois.', { x: t(infoP.nom).toLowerCase(), p: p });
        }
      }
      var N = isFinite(mois) && !err.annees ? mois / p : NaN;

      var taux = NaN, tmm = null, variation = null, tmmOk = true;
      if (sc.opts.tmm) {
        var vTmm = num('tmm'), vMarge = num('marge');
        if (rempli('tmm') && (!isFinite(vTmm) || vTmm > 50)) err.tmm = t('Saisissez un TMM valide (ex. 7,5).');
        if (rempli('marge') && (!isFinite(vMarge) || vMarge > 30)) err.marge = t('Saisissez une marge valide (ex. 2,5).');
        tmmOk = !err.tmm && !err.marge && isFinite(vTmm) && isFinite(vMarge);
        if (tmmOk) {
          taux = round6(vTmm + vMarge);
          tmm = { tmm: vTmm, marge: vMarge };
          c.taux.value = fmtSaisie(taux);
        } else c.taux.value = '';
        synchroCurseur('taux');
        var dv = lireNombreSigne(c.dv.value), dn = lireEntier(c.dn.value);
        if (rempli('dv') && (!isFinite(dv) || Math.abs(dv) > 20)) err.dv = t('Saisissez une variation en points (ex. +1 ou -0,5).');
        else if (isFinite(dv) && dv !== 0) {
          if (!rempli('dn')) err.dn = t('Indiquez l\'échéance de la révision.');
          else if (!isFinite(dn) || dn < 2 || (isFinite(N) && dn > N)) err.dn = t('Choisissez une échéance entre 2 et {n}.', { n: isFinite(N) ? N : 300 });
          else variation = { delta: dv, des: dn };
        }
      } else {
        taux = num('taux');
        if (rempli('taux')) {
          if (!isFinite(taux)) err.taux = t('Saisissez un taux valide (ex. 7,5).');
          else if (taux > 100) err.taux = t('Le taux ne peut pas dépasser 100 %.');
        }
      }

      /* Différé (compris dans la durée) */
      var differe = null;
      if (rempli('df')) {
        var dm = lireEntier(c.df.value);
        if (!isFinite(dm) || dm < 0) err.df = t('Saisissez une durée en mois (ex. 12).');
        else if (dm > 0 && dm % p !== 0) err.df = t('Le différé doit être un multiple de {p} mois.', { p: p });
        else if (dm > 0 && isFinite(mois) && dm >= mois) err.df = t('Le différé doit être plus court que la durée du crédit.');
        else if (dm > 0) differe = { mois: dm, type: sc.choix.dt };
      }
      var Ddiff = differe ? differe.mois / p : 0;

      var complet = !err.capital && !err.annees && !err.taux && !err.pb && !err.ap && tmmOk &&
        isFinite(capital) && capital > 0 && isFinite(mois) && isFinite(taux) && taux >= 0;

      /* Assurance et frais */
      var assurance = null, frais = null;
      if (sc.opts.frais) {
        var ta = optionnel('as', 10, t('Saisissez un taux entre 0 et 10 %.'));
        if (ta > 0) assurance = { taux: ta, base: sc.choix.ab };
        var fdp = optionnel('fdp', 10, t('Saisissez un taux entre 0 et 10 %.'));
        var fdf = optionnel('fdf', 1e7, t('Saisissez un montant valide (ex. 50 000).'));
        var fg = optionnel('fg', 1e7, t('Saisissez un montant valide (ex. 50 000).'));
        var fa = optionnel('fa', 1e7, t('Saisissez un montant valide (ex. 50 000).'));
        if ([fdp, fdf, fg, fa].every(isFinite) && (fdp + fdf + fg + fa) > 0) frais = { dossierPct: fdp, dossierFixe: fdf, garantie: fg, autres: fa };
      }

      /* Remboursements anticipés */
      var ras = [], versement = null, indemnite = 0;
      if (sc.opts.ra) {
        lignesRa().forEach(function (li) {
          var nI = li.querySelector('.ra-n'), mI = li.querySelector('.ra-m'), tot = li.querySelector('.ra-t').checked;
          var msg = '';
          mI.disabled = tot;
          var vn = lireEntier(nI.value), vmt = lireNombre(mI.value);
          if (nI.value.trim() === '' && (tot || mI.value.trim() === '')) { li.querySelector('.ra-err').textContent = ''; li.classList.remove('invalide'); return; }
          if (!isFinite(vn) || vn < 1 || (isFinite(N) && vn >= N)) msg = t('Choisissez une échéance entre 1 et {n}.', { n: isFinite(N) ? N - 1 : 299 });
          else if (!tot && (!isFinite(vmt) || vmt <= 0)) msg = mI.value.trim() === '' ? t('Indiquez le montant ou cochez « Solde ».') : t('Saisissez un montant valide (ex. 50 000).');
          li.querySelector('.ra-err').textContent = msg;
          li.classList.toggle('invalide', !!msg);
          if (!msg) ras.push({ apres: vn, total: tot, montant: tot ? null : vmt });
        });
        ras.sort(function (a, b) { return a.apres - b.apres; });
        var vmv = optionnel('vm', 1e8, t('Saisissez un montant valide (ex. 50 000).'));
        if (vmv > 0) {
          var vdv = rempli('vd') ? lireEntier(c.vd.value) : 1;
          if (!isFinite(vdv) || vdv < 1 || (isFinite(N) && vdv >= N)) err.vd = t('Choisissez une échéance entre 1 et {n}.', { n: isFinite(N) ? N - 1 : 299 });
          else versement = { montant: vmv, frequence: sc.choix.vf, des: vdv };
        }
        indemnite = rempli('rai') ? lireNombre(c.rai.value) : 0;
        if (!isFinite(indemnite) || indemnite > 20) { err.rai = t('L\'indemnité doit être comprise entre 0 et 20 %.'); indemnite = 0; }
      }

      /* Emprunteur */
      var emprunteur = null;
      if (sc.opts.emprunteur) {
        var age = rempli('age') ? lireEntier(c.age.value) : NaN;
        var rev = optionnel('rev', 1e8, t('Saisissez un montant valide (ex. 50 000).'));
        var chg = optionnel('chg', 1e8, t('Saisissez un montant valide (ex. 50 000).'));
        if (rempli('age') && (!isFinite(age) || age < 18 || age > 99)) { err.age = t('Saisissez un âge entre 18 et 99 ans.'); age = NaN; }
        if (isFinite(age) || rev > 0) emprunteur = { age: isFinite(age) ? age : null, revenus: rev > 0 ? rev : null, charges: isFinite(chg) ? chg : 0 };
      }

      return {
        capital: capital, annees: annees, mois: mois, taux: taux, dateDebut: c.date.value, err: err, complet: complet,
        type: sc.type, tmm: tmm, variation: variation,
        periodicite: p, amort: amort, differe: differe, D: Ddiff,
        assurance: assurance, frais: frais, apport: apport,
        ras: ras, versement: versement, indemnite: indemnite, raMode: sc.choix.ramode,
        emprunteur: emprunteur,
        client: { nom: c.clnom.value.trim(), ref: c.clref.value.trim() }
      };
    }

    function afficherErreurs(e) {
      CHAMPS_ERR.forEach(function (ch) {
        var champ = racine.querySelector('[data-champ="' + ch + '"]');
        var msg = e.err[ch] || '';
        champ.classList.toggle('invalide', !!msg);
        sc.champs[ch].setAttribute('aria-invalid', msg ? 'true' : 'false');
        f(ch + '-err').textContent = msg;
      });
      var p = e.periodicite;
      f('mois').textContent = (!e.err.annees && isFinite(e.mois)) ? '= ' + libMois(e.mois) + (p > 1 ? ' · ' + libEcheances(e.mois / p) : '') : '';
      var unites = { 1: '{v} / mois', 3: '{v} / trimestre', 6: '{v} / semestre', 12: '{v} / an' };
      f('tm').textContent = (!e.err.taux && isFinite(e.taux)) ? t(unites[p], { v: fmtTm(tauxPeriodePct(e.taux, p)) }) : '';
      f('mod-sub').textContent = [t(infoPeriodicite(p).nom), t(nomAmort(e.amort)),
        e.differe ? t('différé {n}', { n: libMois(e.differe.mois) }) : t('sans différé')].join(' · ');
      var note = f('ap-note');
      if (e.apport) {
        var pct = e.apport.apport / e.apport.prix * 100;
        note.textContent = t('Apport de {p} du prix : capital emprunté {c}.', { p: fmtPct(pct, 1), c: fmtMoney(e.capital) });
        note.classList.toggle('alerte', pct < agence.apportMin);
      } else {
        note.textContent = t('Le capital emprunté est le prix du bien moins l\'apport.');
        note.classList.remove('alerte');
      }
    }

    function synchroCurseur(ch) {
      var r = sc.curseurs[ch], v = lireNombre(sc.champs[ch].value);
      if (!isFinite(v)) v = 0;
      var min = +r.min, max = +r.max;
      var borne = Math.min(max, Math.max(min, v));
      r.value = borne;
      r.style.setProperty('--pct', ((borne - min) / (max - min) * 100) + '%');
    }

    /* --- Rendu --- */
    function mettreAJour() {
      var e = lireEntrees();
      afficherErreurs(e);
      sc.entrees = e;
      if (!e.complet) {
        sc.resultat = null;
        f('vide').hidden = false;
        f('res').hidden = true;
        majVersus();
        majNav();
        return;
      }
      var r = calculerEcheancier(e, sc.reduction);
      r.sansRA = (e.ras.length || e.versement) ? calculerEcheancier(Object.assign({}, e, { ras: [], versement: null }), sc.reduction) : null;
      sc.resultat = r;
      var etaitCache = f('res').hidden;
      f('vide').hidden = true;
      f('res').hidden = false;
      rendreIndicateurs(etaitCache);
      rendreCout();
      rendreEligibilite();
      rendreRA();
      rendreSensibilite();
      rendreAvance(sc);
      rendreEcheancier();
      majVersus();
      majNav();
      if (window.revelerNouveaux) window.revelerNouveaux();
    }
    sc.mettreAJour = mettreAJour;

    function nomEcheance() { return t(infoPeriodicite(sc.resultat ? sc.resultat.p : 1).echeance); }

    function rendreIndicateurs(premier) {
      var r = sc.resultat, e = sc.entrees;
      var rendu = function (v) { return fmtMoneyHtml(v); };
      f('k1-lib').textContent = nomEcheance();
      if (premier) { f('mens').dataset.val = r.M1; f('int').dataset.val = r.totI; f('tot').dataset.val = r.coutTotal; }
      odometre(f('mens'), r.M1);
      odometre(f('int'), r.totI);
      odometre(f('tot'), r.coutTotal);

      var parts = [];
      if (r.D > 0) parts.push(t('après un différé de {n}', { n: libEcheances(r.D) }));
      if (r.amort === 'lineaire') parts.push(t('dégressive jusqu\'à {m}', { m: fmtMoney(r.lignes[r.lignes.length - 1].paiement) }));
      else if (r.amort === 'infine') parts.push(t('intérêts seuls, capital à la dernière échéance'));
      else if (r.paliers.length > 1) {
        parts.push(t('puis {m} dès l\'échéance {n}', { m: fmtMoney(r.paliers[1].M), n: r.paliers[1].mois }) +
          (r.paliers.length > 2 ? ' ' + t('(+{n} autre palier)', { n: r.paliers.length - 2 }) : ''));
      } else if (!r.D) parts.push(t('pendant {n}', { n: r.p === 1 ? libMois(r.n) : libEcheances(r.n) }));
      var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
      if (lp && lp.assurance > 0) parts.push(t('{m} avec assurance', { m: fmtMoney(totalLigne(lp)) }));
      f('mens-sub').textContent = parts.join(' · ');

      var pctInt = r.C > 0 ? r.totI / r.C * 100 : 0;
      f('int-sub').textContent = t('soit {p} du capital', { p: fmtPct(pctInt, 1) });
      var comp = [t('Capital'), t('intérêts')];
      if (r.totAss > 0) comp.push(t('assurance'));
      if (r.frais > 0) comp.push(t('frais'));
      if (r.totIndem > 0) comp.push(t('indemnités'));
      f('tot-sub').textContent = comp.join(' + ') + (isFinite(r.teg) ? ' · ' + t('TEG {v}', { v: fmtTaux(Math.round(r.teg * 1000) / 1000) }) : '');

      var der = r.lignes[r.lignes.length - 1];
      var raccourci = r.n < r.nPrevu ? ' ' + t('(au lieu de {n})', { n: r.nPrevu }) : '';
      if (der && der.date) {
        f('fin').textContent = moisLong(der.date);
        f('fin-sub').textContent = t(infoPeriodicite(r.p).pluriel, { n: libEcheances(r.n) }) + raccourci;
      } else {
        f('fin').textContent = r.p === 1 ? libMois(r.n) : libEcheances(r.n);
        f('fin-sub').textContent = t('Indiquez une date de début pour la date exacte');
      }

      var autres = roundPrec(r.totAss + r.frais + r.totIndem);
      var total = r.C + r.totI + autres;
      var pc = total > 0 ? r.C / total * 100 : 100, pi = total > 0 ? r.totI / total * 100 : 0, pa = Math.max(0, 100 - pc - pi);
      f('pc').textContent = fmtPct(pc, 1);
      f('pi').textContent = fmtPct(pi, 1);
      f('pa').textContent = fmtPct(pa, 1);
      f('pa-leg').hidden = autres <= 0;
      f('bc').style.flexBasis = pc + '%';
      f('bi').style.flexBasis = pi + '%';
      f('ba').style.flexBasis = pa + '%';
      f('bi').style.display = pi > 0.05 ? '' : 'none';
      f('ba').style.display = pa > 0.05 ? '' : 'none';
      f('bar').setAttribute('aria-label', t('Capital {c}, intérêts {i}', { c: fmtPct(pc, 1), i: fmtPct(pi, 1) }) + (autres > 0 ? ', ' + t('assurance et frais {a}', { a: fmtPct(pa, 1) }) : ''));

      var n = f('reduc');
      if (r.reduc) {
        n.hidden = false;
        n.innerHTML = '<span class="pastille">' + ico('down', 'ico-sm') + '</span>' +
          '<span><strong>' + echapper(r.reductions.length === 1 ? t('Taux réduit 1 fois') : t('Taux réduit {n} fois', { n: r.reductions.length })) + '</strong> : ' + echapper(texteReductions(r)) + '.</span>' +
          '<button class="btn btn-ghost btn-sm" data-annuler-reduc>' + ico('x', 'ico-sm') + echapper(t('Annuler la réduction')) + '</button>';
      } else {
        n.hidden = true;
        n.innerHTML = '';
      }
    }

    function stat(lib, val, ton, aide) {
      return '<div class="ra-stat' + (ton ? ' ' + ton : '') + '"><span>' + echapper(lib) + '</span><strong class="num">' + echapper(val) + '</strong>' +
        (aide ? '<small>' + echapper(aide) + '</small>' : '') + '</div>';
    }

    /* Coût détaillé et TEG */
    function rendreCout() {
      var r = sc.resultat, e = sc.entrees, el = f('cout');
      var s = [stat(t('Intérêts'), fmtMoney(r.totI))];
      if (r.totAss > 0) s.push(stat(t('Assurance'), fmtMoney(r.totAss), '', e.assurance.base === 'crd' ? t('sur le capital restant dû') : t('sur le capital initial')));
      if (r.frais > 0) s.push(stat(t('Frais'), fmtMoney(r.frais)));
      if (r.totIndem > 0) s.push(stat(t('Indemnités'), fmtMoney(r.totIndem)));
      s.push(stat(t('Coût du crédit'), fmtMoney(r.coutCredit), 'fort', t('hors capital')));
      s.push(stat(t('TEG'), isFinite(r.teg) ? fmtPct(r.teg, 3) : '—', 'teg', t('taux nominal {v}', { v: fmtTaux(e.taux) })));
      el.innerHTML =
        '<div class="ra-head"><span class="pastille cout">' + ico('coins', 'ico-sm') + '</span>' +
          '<div><strong>' + echapper(t('Coût du crédit et TEG')) + '</strong><small>' + echapper(t('Tout ce que coûte le crédit en plus du capital emprunté.')) + '</small></div></div>' +
        '<div class="ra-stats s' + Math.min(s.length, 6) + '">' + s.join('') + '</div>' +
        '<p class="ra-note">' + echapper(t('TEG : taux de période des flux réels (capital reçu moins les frais, échéances, assurance et remboursements anticipés), multiplié par le nombre d\'échéances par an.')) + '</p>';
    }

    /* Éligibilité : apport, âge en fin de prêt, endettement, reste à vivre */
    function rendreEligibilite() {
      var r = sc.resultat, e = sc.entrees, el = f('elig');
      var lignes = [];
      function ligne(ok, titre, aide, val) {
        var etat = ok === null ? 'info' : (ok ? 'ok' : 'ko');
        lignes.push('<div class="check-row"><span class="etat ' + etat + '">' + ico(ok === null ? 'info' : (ok ? 'check' : 'x'), 'ico-sm') + '</span>' +
          '<span class="txt">' + echapper(titre) + '<small>' + echapper(aide) + '</small></span><span class="val">' + echapper(val) + '</span></div>');
      }
      if (e.apport) {
        var pct = e.apport.apport / e.apport.prix * 100;
        ligne(pct >= agence.apportMin, t('Apport personnel'), t('Minimum conseillé : {m} du prix du bien', { m: fmtPct(agence.apportMin, 0) }), fmtPct(pct, 1));
      }
      var em = e.emprunteur;
      if (em && em.age != null) {
        var fin = em.age + e.mois / 12;
        ligne(fin <= agence.ageMax, t('Âge en fin de crédit'), t('Maximum retenu : {m} ans', { m: agence.ageMax }), t('{a} ans', { a: fmtLibre(Math.round(fin * 10) / 10) }));
      }
      if (em && em.revenus) {
        var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
        var mensuel = roundPrec(totalLigne(lp) / r.p);
        var endet = (mensuel + em.charges) / em.revenus * 100;
        ligne(endet <= agence.endettementMax, t('Taux d\'endettement'), t('(échéance mensualisée + charges) ÷ revenus, maximum {m}', { m: fmtPct(agence.endettementMax, 0) }), fmtPct(endet, 1));
        var rav = roundPrec(em.revenus - em.charges - mensuel);
        ligne(rav > 0 ? null : false, t('Reste à vivre'), t('Revenus − charges − échéance mensualisée ({m})', { m: fmtMoney(mensuel) }), t('{m} / mois', { m: fmtMoney(rav) }));
      }
      if (!lignes.length) { el.hidden = true; el.innerHTML = ''; return; }
      el.innerHTML =
        '<div class="ra-head"><span class="pastille elig">' + ico('check', 'ico-sm') + '</span>' +
          '<div><strong>' + echapper(t('Éligibilité')) + '</strong><small>' + echapper(t('Règles modifiables dans « Agence ». Indications, pas une décision de la banque.')) + '</small></div></div>' +
        '<div class="checklist">' + lignes.join('') + '</div>';
      el.hidden = false;
    }

    function rendreRA() {
      var r = sc.resultat, e = sc.entrees, el = f('racard');
      if (!r.ras.length) { el.hidden = true; el.innerHTML = ''; return; }
      var b = r.sansRA;
      var eco = roundPrec((b.totI + b.totAss) - (r.totI + r.totAss)), gain = roundPrec(eco - r.totIndem);
      var der = r.lignes[r.lignes.length - 1];
      var detail;
      if (der.ra && der.ra.reste <= 0) detail = t('Le crédit est soldé après l\'échéance {n}.', { n: der.mois });
      else if (e.raMode === 'duree' && r.amort !== 'infine') detail = t('Nouvelle durée : {a} au lieu de {b}, soit {c} de moins.', { a: libEcheances(r.n), b: libEcheances(b.n), c: libMois((b.n - r.n) * r.p) });
      else {
        var dernierRa = r.ras[r.ras.length - 1].mois, l1 = r.lignes[dernierRa], l0 = b.lignes[dernierRa];
        detail = l1 && l0 ? t('Échéance après le dernier remboursement : {a} au lieu de {b}.', { a: fmtMoney(l1.paiement), b: fmtMoney(l0.paiement) }) : '';
      }
      var desc = e.ras.map(function (x) { return x.total ? t('solde après l\'échéance {n}', { n: x.apres }) : t('{m} après l\'échéance {n}', { m: fmtMoney(x.montant), n: x.apres }); });
      if (e.versement) desc.push(t(e.versement.frequence === 'annee' ? '{m} une fois par an dès l\'échéance {n}' : '{m} à chaque échéance dès l\'échéance {n}', { m: fmtMoney(e.versement.montant), n: e.versement.des }));
      el.innerHTML =
        '<div class="ra-head"><span class="pastille">' + ico('fast', 'ico-sm') + '</span>' +
          '<div><strong>' + echapper(t('Remboursements anticipés')) + '</strong><small>' + echapper(desc.join(' · ')) + '</small></div></div>' +
        '<div class="ra-stats">' +
          stat(t('Montant remboursé'), fmtMoney(r.totRA), '', r.ras.length > 1 ? t('en {n} versements', { n: r.ras.length }) : '') +
          stat(t('Indemnités'), fmtMoney(r.totIndem)) +
          stat(r.totAss > 0 ? t('Économie (intérêts et assurance)') : t('Économie d\'intérêts'), fmtMoney(eco), 'ok') +
          stat(t('Gain net'), fmtMoney(gain), gain >= 0 ? 'ok' : 'ko') +
        '</div>' +
        (detail ? '<p class="ra-detail">' + echapper(detail) + '</p>' : '') +
        (r.ras.some(function (x) { return x.limite; }) ? '<p class="ra-note">' + echapper(t('Montant limité au capital restant dû.')) + '</p>' : '');
      el.hidden = false;
    }

    function rendreSensibilite() {
      var e = sc.entrees, el = f('sensi');
      if (!e.tmm) { el.hidden = true; el.innerHTML = ''; return; }
      var base = Object.assign({}, e, { variation: null });
      var ref = calculerEcheancier(base, sc.reduction);
      var lignes = [-1, -0.5, 0, 0.5, 1, 2].map(function (d) {
        var ta = Math.max(0, round6(e.taux + d));
        var x = d === 0 ? ref : calculerEcheancier(Object.assign({}, base, { taux: ta }), sc.reduction);
        return { d: d, tmm: Math.max(0, round6(e.tmm.tmm + d)), taux: ta, M: x.M1, dM: roundPrec(x.M1 - ref.M1), I: x.totI, dI: roundPrec(x.totI - ref.totI) };
      });
      function ecart(v) {
        if (Math.abs(v) < 0.0005) return '<span class="delta egal">—</span>';
        return '<span class="delta ' + (v < 0 ? 'mieux' : 'pire') + '">' + echapper((v > 0 ? '+' : '−') + fmtMoney(Math.abs(v))) + '</span>';
      }
      el.innerHTML =
        '<div class="sensi-head"><span class="pastille">' + ico('trend', 'ico-sm') + '</span><div><strong>' + echapper(t('Sensibilité au TMM')) + '</strong>' +
          '<small>' + echapper(t('Échéance et intérêts si le TMM varie dès aujourd\'hui (marge de {m}).', { m: fmtTaux(e.tmm.marge) })) + '</small></div>' +
          '<button type="button" class="btn btn-ghost btn-sm sensi-stress" data-stress>' + ico('sparkle', 'ico-sm') + echapper(t('Stress test')) + '</button></div>' +
        '<div class="sensi-wrap"><table class="sensi-t"><thead><tr>' +
          '<th>' + echapper(t('Variation')) + '</th><th>' + echapper(t('TMM')) + '</th><th>' + echapper(t('Taux appliqué')) + '</th>' +
          '<th>' + echapper(nomEcheance()) + '</th><th>' + echapper(t('Coût des intérêts')) + '</th></tr></thead><tbody>' +
          lignes.map(function (x) {
            return '<tr' + (x.d === 0 ? ' class="actuel"' : '') + '><td>' + (x.d === 0 ? echapper(t('Actuel')) : echapper(fmtSigne(x.d) + ' ' + t('pt'))) + '</td>' +
              '<td>' + echapper(fmtTaux(x.tmm)) + '</td><td>' + echapper(fmtTaux(x.taux)) + '</td>' +
              '<td><b>' + echapper(fmtMoney(x.M)) + '</b> ' + ecart(x.dM) + '</td>' +
              '<td>' + echapper(fmtMoney(x.I)) + ' ' + ecart(x.dI) + '</td></tr>';
          }).join('') +
        '</tbody></table></div>';
      el.hidden = false;
    }

    function lignesVue() {
      var r = sc.resultat;
      return sc.vue === 'annuel' ? agregerAnnuel(r) : r.lignes;
    }

    function rendreEcheancier() {
      var r = sc.resultat;
      var annuel = sc.vue === 'annuel';
      var lignes = lignesVue();
      var avecAss = r.totAss > 0;
      var avecRatio = !annuel && r.reducDemandee;
      f('ech-sub').textContent = annuel
        ? t('{n} de remboursement', { n: libAnnees(lignes.length) })
        : t(infoPeriodicite(r.p).pluriel, { n: libEcheances(r.n) }) + (r.debut ? ' · ' + t('à partir de {d}', { d: moisLong(r.debut) }) : '') +
          (r.reducDemandee ? ' · ' + (r.reductions.length === 1 ? t('taux réduit 1 fois') : t('taux réduit {n} fois', { n: r.reductions.length })) : '');

      f('thead').parentNode.classList.toggle('avec-ratio', avecRatio);
      f('thead').innerHTML = '<tr>' +
        '<th scope="col">' + echapper(annuel ? t('Année') : t('Échéance')) + '</th>' +
        '<th scope="col">' + echapper(annuel ? t('Total payé') : (avecAss ? t('Échéance totale') : nomEcheance())) + '</th>' +
        '<th scope="col"><span class="cle" style="background:#C27A1A"></span>' + echapper(t('Intérêts')) + '</th>' +
        '<th scope="col"><span class="cle" style="background:#8C5000"></span>' + echapper(t('Principal')) + '</th>' +
        (avecAss ? '<th scope="col"><span class="cle" style="background:#0891b2"></span>' + echapper(t('Assurance')) + '</th>' : '') +
        '<th scope="col">' + echapper(t('Capital restant dû')) + '</th>' +
        (avecRatio ? '<th scope="col" title="' + echapper(t('Intérêts cumulés (36 mois)')) + '">' + echapper(t('Intérêts 36 mois')) + '</th><th scope="col">' + echapper(t('Ratio')) + '</th>' : '') + '</tr>';
      function cellsRatio(l) {
        if (!avecRatio) return '';
        if (l.int36 == null) return '<td class="cum">—</td><td>—</td>';
        var cl = l.test ? (l.test.ok ? ' class="ratio ok"' : ' class="ratio ko"') : '';
        return '<td class="cum">' + fmtNombre(l.int36) + '</td><td' + cl + '>' + (l.ratio != null ? echapper(fmtPct(l.ratio * 100, 3)) : '—') + '</td>';
      }

      function ligneRA(x) {
        return '<tr class="ra-row"><td class="per">' + echapper(t('Remboursement anticipé')) +
          (x.indemnite > 0 ? '<small>' + echapper(t('dont indemnité {m}', { m: fmtMoney(x.indemnite) })) + '</small>' : '') + '</td>' +
          '<td class="pay">' + fmtNombre(roundPrec(x.montant + x.indemnite)) + '</td><td class="int">—</td>' +
          '<td class="pri">' + fmtNombre(x.montant) + '</td>' + (avecAss ? '<td class="ass">—</td>' : '') + '<td>' + fmtNombre(x.reste) + '</td>' + (avecRatio ? '<td></td><td></td>' : '') + '</tr>';
      }
      function badge(txt) { return txt ? ' data-badge="' + echapper(txt) + '"' : ''; }

      var html = '';
      if (annuel) {
        lignes.forEach(function (a) {
          var per = a.debut ? '<small>' + moisAnnee(a.debut) + ' – ' + moisAnnee(a.fin) + '</small>' : '<small>' + echapper(libEcheances(a.nb)) + '</small>';
          var b = a.ra ? t('remb. anticipé') : (a.differe ? t('différé') : (a.reduit ? t('taux réduit') : ''));
          html += '<tr data-i="' + a.annee + '"' + (a.ra ? ' class="avec-ra"' : '') + '><td class="per"' + badge(b) + '>' + echapper(t('Année {n}', { n: a.annee })) + per + '</td>' +
            '<td class="pay">' + fmtNombre(a.paiement) + '</td><td class="int">' + fmtNombre(a.interet) + '</td>' +
            '<td class="pri">' + fmtNombre(a.principal) + '</td>' + (avecAss ? '<td class="ass">' + fmtNombre(a.assurance) + '</td>' : '') + '<td>' + fmtNombre(a.reste) + '</td></tr>';
        });
      } else {
        var parAn = 12 / r.p;
        lignes.forEach(function (l) {
          var cls = [];
          if (parAn > 1 && l.mois > 1 && (l.mois - 1) % parAn === 0) cls.push('an');
          if (l.differe) cls.push('diff');
          var b = l.differe ? (l.mois === 1 ? t('différé') : '') : (l.reduction ? t('taux réduit n° {n}', { n: l.reduction }) : (l.revise ? t('TMM révisé') : ''));
          if (l.reduction) cls.push('reduc');
          html += '<tr data-i="' + l.mois + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td class="per"' + badge(b) + '><span class="n">' + l.mois + '</span>' +
            (l.date ? moisAnnee(l.date) : '') + '</td>' +
            '<td class="pay">' + fmtNombre(totalLigne(l)) + '</td><td class="int">' + fmtNombre(l.interet) + '</td>' +
            '<td class="pri">' + fmtNombre(l.principal) + '</td>' + (avecAss ? '<td class="ass">' + fmtNombre(l.assurance) + '</td>' : '') + '<td>' + fmtNombre(l.reste) + '</td>' + cellsRatio(l) + '</tr>';
          if (l.ra) html += ligneRA(l.ra);
        });
      }
      f('tbody').innerHTML = html;
      f('tfoot').innerHTML = '<tr><td>' + echapper(t('Total')) + '</td><td>' + fmtNombre(r.totM) + '</td><td>' + fmtNombre(r.totI) +
        '</td><td>' + fmtNombre(r.totP) + '</td>' + (avecAss ? '<td>' + fmtNombre(r.totAss) + '</td>' : '') + '<td>' + echapper(unite()) + '</td>' + (avecRatio ? '<td></td><td></td>' : '') + '</tr>';

      if (sc.aff === 'graphique') rendreGraphique();
    }

    /* --- Graphique --- */
    function couleur(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
    function rgba(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
      var n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function rendreGraphique() {
      var wrap = f('cwrap');
      if (typeof Chart === 'undefined') {
        wrap.innerHTML = '<div class="chart-off"><div>' + ico('alert') + '<p>' + echapper(t('Le graphique nécessite une connexion Internet (bibliothèque Chart.js).')) + '</p></div></div>';
        return;
      }
      if (!sc.resultat) return;
      var annuel = sc.vue === 'annuel';
      var lignes = lignesVue();
      var rtl = enArabe();
      var police = rtl ? 'IBM Plex Sans Arabic' : 'IBM Plex Sans';
      var labels = lignes.map(function (l) {
        if (annuel) return t('Année {n}', { n: l.annee });
        return l.date ? moisAnnee(l.date) : String(l.mois);
      });
      var cP = couleur('--c-principal'), cI = couleur('--c-interet'), cR = couleur('--c-reste');
      var texte = couleur('--muted'), grille = couleur('--grid'), fort = couleur('--text');
      var surface = couleur('--surface'), bord = couleur('--border');
      var parPeriode = sc.resultat.p === 1 ? t('Par mois ({u})', { u: unite() }) : t('Par échéance ({u})', { u: unite() });

      function degrade(c) {
        return function (ctx) {
          var a = ctx.chart.chartArea;
          if (!a) return rgba(c, 0.25);
          var g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
          g.addColorStop(0, rgba(c, annuel ? 0.95 : 0.42));
          g.addColorStop(1, rgba(c, annuel ? 0.65 : 0.02));
          return g;
        };
      }
      var jeux = [
        { type: annuel ? 'bar' : 'line', label: t('Principal'), data: lignes.map(function (l) { return Math.max(0, l.principal); }),
          borderColor: cP, backgroundColor: degrade(cP), fill: annuel ? false : 'origin', tension: 0.35,
          pointRadius: 0, pointHoverRadius: 5, borderWidth: annuel ? 0 : 2.5, borderRadius: 6, stack: 'p', yAxisID: 'y', order: 2 },
        { type: annuel ? 'bar' : 'line', label: t('Intérêts'), data: lignes.map(function (l) { return l.interet; }),
          borderColor: cI, backgroundColor: degrade(cI), fill: annuel ? false : 'origin', tension: 0.35,
          pointRadius: 0, pointHoverRadius: 5, borderWidth: annuel ? 0 : 2.5, borderRadius: 6, stack: 'p', yAxisID: 'y', order: 2 },
        { type: 'line', label: t('Capital restant dû'), data: lignes.map(function (l) { return annuel ? l.reste : resteFin(l); }),
          borderColor: cR, backgroundColor: cR, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
          tension: 0.3, fill: false, yAxisID: 'y1', order: 1 }
      ];
      if (sc.chart) { sc.chart.destroy(); sc.chart = null; }
      if (!f('chart')) wrap.innerHTML = '<canvas id="' + k + '-chart" role="img"' + A('aria-label', 'Graphique de l\'amortissement') + '></canvas>';
      sc.chart = new Chart(f('chart').getContext('2d'), {
        data: { labels: labels, datasets: jeux },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: mouvementReduit.matches ? 0 : 550, easing: 'easeOutCubic' },
          interaction: { mode: 'index', intersect: false },
          onClick: function (evt, els) { if (els && els.length) { var l = lignes[els[0].index]; sc.allerLigne(annuel ? l.annee : l.mois, annuel); } },
          onHover: function (evt, els) { evt.native.target.style.cursor = els && els.length ? 'pointer' : ''; },
          plugins: {
            legend: { position: 'top', align: 'end', rtl: rtl, labels: { sort: function (a, b) { return a.datasetIndex - b.datasetIndex; }, color: fort, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 16, font: { family: police, weight: '600', size: 12 } } },
            tooltip: {
              rtl: rtl,
              backgroundColor: surface, titleColor: fort, bodyColor: fort, borderColor: bord, borderWidth: 1,
              padding: 12, cornerRadius: 12, boxPadding: 6, usePointStyle: true,
              titleFont: { family: police, weight: '700' }, bodyFont: { family: police },
              callbacks: { label: function (c) { return ' ' + c.dataset.label + ' : ' + fmtMoney(c.parsed.y); } }
            }
          },
          scales: {
            x: { reverse: rtl, stacked: annuel, ticks: { color: texte, maxRotation: 0, autoSkip: true, maxTicksLimit: annuel ? 13 : 8, font: { family: police, size: 11 } }, grid: { display: false }, border: { color: bord } },
            y: { position: rtl ? 'right' : 'left', stacked: annuel, beginAtZero: true, ticks: { color: texte, callback: function (v) { return fmtCompact(v); }, font: { family: police, size: 11 } }, grid: { color: grille }, border: { display: false },
                 title: { display: true, text: annuel ? t('Par année ({u})', { u: unite() }) : parPeriode, color: texte, font: { family: police, size: 11, weight: '600' } } },
            y1: { position: rtl ? 'left' : 'right', beginAtZero: true, ticks: { color: texte, callback: function (v) { return fmtCompact(v); }, font: { family: police, size: 11 } }, grid: { drawOnChartArea: false }, border: { display: false },
                  title: { display: true, text: t('Capital restant dû'), color: texte, font: { family: police, size: 11, weight: '600' } } }
          }
        }
      });
    }
    sc.rendreGraphique = function () { if (sc.resultat && sc.aff === 'graphique') rendreGraphique(); };

    function afficherVue(aff) {
      sc.aff = aff;
      $$('[data-aff]', racine).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.aff === aff)); });
      f('twrap').hidden = aff !== 'tableau';
      f('cwrap').hidden = aff !== 'graphique';
      if (aff === 'graphique') rendreGraphique();
    }
    /* Affiche une échéance (ou une année) dans le tableau et la met en évidence */
    sc.allerLigne = function (cle, annuel) {
      if (!sc.resultat) return;
      if (sc.aff !== 'tableau') afficherVue('tableau');
      if (!annuel && sc.vue === 'annuel') { sc.vue = 'mensuel'; $$('[data-vue]', racine).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vue === 'mensuel')); }); rendreEcheancier(); }
      ecrireEtatUrl();
      var tr = $('#' + k + '-tbody tr[data-i="' + cle + '"]');
      if (!tr) return;
      var wrap = f('twrap');
      wrap.scrollTop = tr.offsetTop - wrap.clientHeight / 2;
      f('titre-ech').closest('.schedule').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
      tr.classList.remove('surligne'); void tr.offsetWidth; tr.classList.add('surligne');
      setTimeout(function () { tr.classList.remove('surligne'); }, 2200);
    };

    /* --- Événements --- */
    var attente = null;
    function planifier() { clearTimeout(attente); attente = setTimeout(mettreAJour, 90); }

    racine.addEventListener('input', function (ev) {
      var cible = ev.target;
      if (cible.closest('[data-hors-form]')) return;
      if (cible.classList.contains('range')) {
        var ch = cible.id.slice(k.length + 1, -2);
        sc.champs[ch].value = fmtSaisie(+cible.value);
        sc.reduction = false;
        synchroCurseur(ch);
        planifier();
        return;
      }
      if (cible.tagName !== 'INPUT') return;
      var id = cible.id.slice(k.length + 1);
      if (CHAMPS_BASE.indexOf(id) !== -1) sc.reduction = false;
      if (sc.curseurs[id]) synchroCurseur(id);
      planifier();
    });
    racine.addEventListener('change', function (ev) {
      if ((ev.target.type === 'checkbox' || ev.target.type === 'date') && !ev.target.closest('[data-hors-form]')) planifier();
    });
    racine.addEventListener('focusout', function (ev) {
      var cible = ev.target;
      if (cible.tagName !== 'INPUT' || cible.readOnly || cible.type === 'checkbox' || cible.closest('[data-hors-form]')) return;
      var id = cible.id.slice(k.length + 1);
      if (CHAMPS_NUM.indexOf(id) !== -1 || cible.classList.contains('ra-m')) {
        var v = lireNombre(cible.value);
        if (isFinite(v)) cible.value = fmtSaisie(v);
      } else if (id === 'dv') {
        var d = lireNombreSigne(cible.value);
        if (isFinite(d)) cible.value = (d > 0 ? '+' : '') + fmtSaisie(d);
      }
    });

    /* Entrée dans un champ = Calculer */
    racine.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'range' && ev.target.type !== 'checkbox' && !ev.target.closest('[data-hors-form]')) {
        ev.preventDefault();
        calculer();
      }
    });

    function premierChampIncomplet() {
      var e = sc.entrees || lireEntrees();
      if (sc.opts.apport && (e.err.pb || !isFinite(lireNombre(sc.champs.pb.value)))) return sc.champs.pb;
      if (e.err.capital || !(e.capital > 0)) return sc.opts.apport ? sc.champs.ap : sc.champs.capital;
      if (e.err.annees || !isFinite(e.mois)) return sc.champs.annees;
      if (sc.opts.tmm) {
        if (e.err.tmm || !isFinite(lireNombre(sc.champs.tmm.value))) return sc.champs.tmm;
        if (e.err.marge || !isFinite(lireNombre(sc.champs.marge.value))) return sc.champs.marge;
      } else if (e.err.taux || !isFinite(e.taux)) return sc.champs.taux;
      return null;
    }

    function calculer() {
      mettreAJour();
      if (!sc.resultat) {
        var c = premierChampIncomplet();
        if (c) c.focus();
        toast(sc.opts.tmm ? t('Complétez le capital, la durée, le TMM et la marge pour calculer.') : t('Complétez le capital, la durée et le taux pour calculer.'), 'erreur');
        return;
      }
      var ok = sauvegarderSimulation(sc);
      majNav();
      ['k1', 'k2'].forEach(function (id) {
        var el = f(id); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      });
      toast(ok ? t('Simulation enregistrée dans l\'historique.') : t('Calcul effectué (historique indisponible dans ce navigateur).'), ok ? 'succes' : 'info');
      if (window.innerWidth <= 1024) f('res').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
    }
    f('calculer').addEventListener('click', calculer);

    function reinitialiser() {
      Object.keys(sc.champs).forEach(function (id) { sc.champs[id].value = ''; });
      sc.champs.date.value = aujourdHui();
      viderRa();
      sc.reduction = false;
      Object.keys(sc.opts).forEach(function (o) { reglerOption(o, false); });
      reglerChoix('per', '1'); reglerChoix('am', 'constant'); reglerChoix('dt', 'partiel');
      reglerChoix('ab', 'initial'); reglerChoix('vf', 'periode'); reglerChoix('ramode', 'duree');
      reglerType('libre');
      ['capital', 'annees', 'taux'].forEach(synchroCurseur);
    }
    f('reset').addEventListener('click', function () {
      reinitialiser();
      mettreAJour();
      sc.champs.capital.focus();
    });

    f('reduire').addEventListener('click', function () {
      var e = lireEntrees();
      if (!e.complet) {
        mettreAJour();
        var c = premierChampIncomplet(); if (c) c.focus();
        toast(t('Veuillez d\'abord saisir un crédit valide.'), 'erreur');
        return;
      }
      if (e.periodicite !== 1 || e.amort !== 'constant' || e.differe) {
        toast(t('La réduction de taux s\'applique aux crédits mensuels à échéances constantes, sans différé.'), 'erreur', 4500);
        return;
      }
      var x = calculerEcheancier(e, true);
      var l36 = x.lignes[35], ratio37 = l36 && l36.ratio != null ? l36.ratio : NaN;
      var condDuree = e.mois > 84, nb = x.reductions.length;
      var liste =
        '<div class="checklist">' +
          '<div class="check-row"><span class="etat ' + (condDuree ? 'ok' : 'ko') + '">' + ico(condDuree ? 'check' : 'x', 'ico-sm') + '</span>' +
            '<span class="txt">' + echapper(t('Durée supérieure à 84 mois')) + '<small>' + echapper(t('Plus de 7 ans de remboursement')) + '</small></span><span class="val">' + echapper(libMois(e.mois)) + '</span></div>' +
          '<div class="check-row"><span class="etat ' + (nb ? 'ok' : 'ko') + '">' + ico(nb ? 'check' : 'x', 'ico-sm') + '</span>' +
            '<span class="txt">' + echapper(t('Ratio strictement supérieur à 8 %')) + '<small>' + echapper(t('Intérêts des 36 derniers mois / capital restant dû, vérifié dès l\'échéance 37 puis chaque mois jusqu\'à ce qu\'il dépasse 8 % ; après une réduction, nouveau contrôle 36 mois plus tard.')) + '</small></span>' +
            '<span class="val">' + (isFinite(ratio37) ? echapper(t('{p} à 36 mois', { p: fmtPct(ratio37 * 100, 3) })) : '') + '</span></div>' +
        '</div>';
      if (condDuree && nb) {
        sc.reduction = true;
        mettreAJour();
        var tableau = '<div class="sensi-wrap"><table class="sensi-t"><thead><tr><th>' + echapper(t('N°')) + '</th><th>' + echapper(t('Dès l\'échéance')) + '</th><th>' + echapper(t('Ratio')) + '</th><th>' + echapper(t('Taux')) + '</th><th>' + echapper(t('Mensualité')) + '</th></tr></thead><tbody>' +
          x.reductions.map(function (z, i) {
            return '<tr><td>' + (i + 1) + '</td><td>' + z.mois + (z.date ? ' · ' + echapper(moisAnnee(z.date)) : '') + '</td><td>' + echapper(fmtPct(z.ratio * 100, 3)) + '</td>' +
              '<td>' + echapper(fmtTauxPrecis(z.avant)) + ' → <b>' + echapper(fmtTauxPrecis(z.apres)) + '</b></td><td><b>' + echapper(fmtMoney(z.M)) + '</b></td></tr>';
          }).join('') + '</tbody></table></div>';
        ouvrirDialogue({
          titre: nb === 1 ? t('Taux réduit 1 fois') : t('Taux réduit {n} fois', { n: nb }),
          sousTitre: echapper(t('Économie d\'intérêts : {m}.', { m: fmtMoney(roundPrec(calculerEcheancier(e, false).totI - x.totI)) })),
          icone: 'check', ton: 'green', large: true,
          corps: tableau + liste,
          pied: '<button class="btn btn-primary" data-fermer>' + echapper(t('Voir l\'échéancier')) + '</button>'
        });
      } else {
        ouvrirDialogue({
          titre: t('Non éligible à la réduction'),
          sousTitre: echapper(condDuree ? t('Le ratio ne dépasse jamais strictement 8 % sur la durée du crédit.') : t('Les deux conditions doivent être remplies.')),
          icone: 'x', ton: 'red',
          corps: liste,
          pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
        });
      }
    });

    racine.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-annuler-reduc]')) {
        sc.reduction = false;
        mettreAJour();
        toast(t('Réduction de taux annulée.'), 'info');
        return;
      }
      var bo = ev.target.closest('[data-opt]');
      if (bo) {
        var cle = bo.dataset.opt;
        reglerOption(cle, !sc.opts[cle]);
        if (cle === 'tmm' || cle === 'apport') sc.reduction = false;
        mettreAJour();
        return;
      }
      if (ev.target.closest('#' + k + '-ra-ajout')) {
        var liste = f('ra-liste');
        if (lignesRa().length >= 10) { toast(t('10 remboursements au maximum.'), 'info'); return; }
        liste.insertAdjacentHTML('beforeend', ligneRaHtml());
        var nouv = liste.lastElementChild.querySelector('.ra-n');
        setTimeout(function () { nouv.focus(); }, 30);
        return;
      }
      var bs = ev.target.closest('.ra-suppr');
      if (bs) {
        var li = bs.closest('.ra-ligne');
        if (lignesRa().length > 1) li.remove(); else { li.querySelector('.ra-n').value = ''; li.querySelector('.ra-m').value = ''; li.querySelector('.ra-t').checked = false; }
        mettreAJour();
        return;
      }
      var bt = ev.target.closest('[data-type]');
      if (bt) { appliquerType(bt.dataset.type); return; }
      var bc = ev.target.closest('[data-per],[data-am],[data-dt],[data-ab],[data-vf],[data-ramode]');
      if (bc) {
        var attr = ['per', 'am', 'dt', 'ab', 'vf', 'ramode'].filter(function (a) { return bc.hasAttribute('data-' + a); })[0];
        reglerChoix(attr, bc.getAttribute('data-' + attr));
        if (attr === 'per' || attr === 'am') sc.reduction = false;
        mettreAJour();
        return;
      }
      var bv = ev.target.closest('[data-vue]');
      if (bv) {
        transition(function () {
          sc.vue = bv.dataset.vue;
          $$('[data-vue]', racine).forEach(function (b) { b.setAttribute('aria-pressed', String(b === bv)); });
          if (sc.resultat) rendreEcheancier();
          ecrireEtatUrl();
        });
        return;
      }
      var ba = ev.target.closest('[data-aff]');
      if (ba) {
        transition(function () { afficherVue(ba.dataset.aff); ecrireEtatUrl(); });
      }
    });

    /* Type de crédit : applique la durée et le taux (fixe ou TMM + marge) préréglés */
    function appliquerType(cle) {
      reglerType(cle);
      var p = agence.types[cle];
      if (p) {
        sc.champs.annees.value = fmtSaisie(p.duree);
        sc.reduction = false;
        if (p.mode === 'tmm') {
          reglerOption('tmm', true);
          sc.champs.tmm.value = fmtSaisie(agence.tmm);
          sc.champs.marge.value = fmtSaisie(p.valeur);
        } else {
          reglerOption('tmm', false);
          sc.champs.taux.value = fmtSaisie(p.valeur);
        }
        ['capital', 'annees', 'taux'].forEach(synchroCurseur);
        toast(t('Type « {n} » : {d}, {t}.', {
          n: t(nomType(cle)), d: libAns(p.duree),
          t: p.mode === 'tmm' ? t('TMM + {m}', { m: fmtTaux(p.valeur) }) : t('taux fixe {m}', { m: fmtTaux(p.valeur) })
        }), 'info');
      }
      mettreAJour();
    }

    f('xlsx').addEventListener('click', function () { exporterExcel(sc); });
    f('pdf').addEventListener('click', function () { exporterPDF(sc); });
    f('rapport').addEventListener('click', function () { preparerRapport(sc); });
    f('print').addEventListener('click', function () { imprimer(sc); });
    f('mail').addEventListener('click', function () { partagerParEmail(sc); });
    f('wa').addEventListener('click', function () { partagerWhatsApp(sc); });
    f('qr').addEventListener('click', function () { ouvrirQR(sc); });
    f('ics').addEventListener('click', function () { exporterAgenda(sc); });

    /* Applique des valeurs (outils, historique, lien partagé). Les options
       absentes sont désactivées, sauf le client et l'emprunteur (conservés). */
    sc.appliquer = function (v) {
      var c = sc.champs;
      if (v.type !== undefined) reglerType(v.type || 'libre');
      if (v.apport) {
        reglerOption('apport', true);
        c.pb.value = fmtSaisie(v.apport.prix);
        c.ap.value = fmtSaisie(v.apport.apport);
      } else {
        reglerOption('apport', false);
        if (v.capital != null) c.capital.value = fmtSaisie(v.capital);
      }
      if (v.mois != null) c.annees.value = fmtSaisie(parseFloat((v.mois / 12).toFixed(4)));
      if (v.tmm) {
        reglerOption('tmm', true);
        c.tmm.value = fmtSaisie(v.tmm.tmm);
        c.marge.value = fmtSaisie(v.tmm.marge);
        c.dv.value = v.variation ? (v.variation.delta > 0 ? '+' : '') + fmtSaisie(v.variation.delta) : '';
        c.dn.value = v.variation ? String(v.variation.des) : '';
      } else {
        reglerOption('tmm', false);
        c.dv.value = ''; c.dn.value = '';
        if (v.taux != null) c.taux.value = fmtSaisie(v.taux);
      }
      if (v.dateDebut !== undefined) c.date.value = v.dateDebut || '';
      reglerChoix('per', String(v.periodicite || 1));
      reglerChoix('am', v.amort || 'constant');
      c.df.value = v.differe ? String(v.differe.mois) : '';
      reglerChoix('dt', v.differe ? v.differe.type : 'partiel');
      reglerOption('modalites', (v.periodicite || 1) !== 1 || (v.amort || 'constant') !== 'constant' || !!v.differe);
      if (v.assurance || v.frais) {
        reglerOption('frais', true);
        c.as.value = v.assurance ? fmtSaisie(v.assurance.taux) : '';
        reglerChoix('ab', v.assurance ? v.assurance.base : 'initial');
        var fr = v.frais || {};
        c.fdp.value = fr.dossierPct ? fmtSaisie(fr.dossierPct) : '';
        c.fdf.value = fr.dossierFixe ? fmtSaisie(fr.dossierFixe) : '';
        c.fg.value = fr.garantie ? fmtSaisie(fr.garantie) : '';
        c.fa.value = fr.autres ? fmtSaisie(fr.autres) : '';
      } else {
        reglerOption('frais', false);
        ['as', 'fdp', 'fdf', 'fg', 'fa'].forEach(function (id) { c[id].value = ''; });
      }
      var ras = v.ras || [];
      if (ras.length || v.versement) {
        reglerOption('ra', true);
        var liste = f('ra-liste');
        liste.innerHTML = '';
        (ras.length ? ras : [null]).forEach(function (x) {
          liste.insertAdjacentHTML('beforeend', ligneRaHtml());
          var li = liste.lastElementChild;
          if (!x) return;
          li.querySelector('.ra-n').value = String(x.apres);
          li.querySelector('.ra-t').checked = !!x.total;
          li.querySelector('.ra-m').value = x.total || x.montant == null ? '' : fmtSaisie(x.montant);
        });
        c.vm.value = v.versement ? fmtSaisie(v.versement.montant) : '';
        c.vd.value = v.versement ? String(v.versement.des) : '';
        reglerChoix('vf', v.versement ? v.versement.frequence : 'periode');
        c.rai.value = v.indemnite ? fmtSaisie(v.indemnite) : '';
        reglerChoix('ramode', v.raMode || 'duree');
      } else {
        reglerOption('ra', false);
        viderRa();
        c.vm.value = ''; c.vd.value = ''; c.rai.value = '';
      }
      if (v.emprunteur) {
        reglerOption('emprunteur', true);
        c.age.value = v.emprunteur.age != null ? String(v.emprunteur.age) : '';
        c.rev.value = v.emprunteur.revenus ? fmtSaisie(v.emprunteur.revenus) : '';
        c.chg.value = v.emprunteur.charges ? fmtSaisie(v.emprunteur.charges) : '';
      }
      if (v.client) {
        c.clnom.value = v.client.nom || '';
        c.clref.value = v.client.ref || '';
        reglerOption('client', !!(v.client.nom || v.client.ref));
      }
      sc.reduction = !!v.reduction;
      ['capital', 'annees', 'taux'].forEach(synchroCurseur);
      mettreAJour();
    };

    mettreAJour();
    return sc;
  }

  /* ===================================================================
     Contenu des documents (synthèse, tableau) — PDF, Excel, e-mail,
     WhatsApp, agenda, impression. Les exports sont produits en français.
     =================================================================== */
  function donneesExport(sc) {
    var r = sc.resultat, annuel = sc.vue === 'annuel';
    var avecDate = !!r.debut, avecAss = r.totAss > 0;
    var libMontant = annuel ? t('Total payé') : (avecAss ? t('Échéance totale') : t(infoPeriodicite(r.p).echeance));
    var entete = annuel ? [t('Année'), t('Période')] : (avecDate ? [t('N°'), t('Échéance')] : [t('N°')]);
    var decal = entete.length;
    var avecRatio = !annuel && r.reducDemandee;
    entete = entete.concat([libMontant, t('Intérêts'), t('Principal')], avecAss ? [t('Assurance')] : [], [t('Capital restant dû')], avecRatio ? [t('Intérêts cumulés (36 mois)'), t('Ratio')] : []);
    var lignes = [];
    function montants(pay, int, pri, ass, reste, l) {
      return [pay, int, pri].concat(avecAss ? [ass] : [], [reste], avecRatio ? (l && l.int36 != null ? [l.int36, l.ratio != null ? fmtPct(l.ratio * 100, 3) + (l.test && l.test.ok ? ' ✓' : '') : ''] : ['', '']) : []);
    }
    if (annuel) {
      agregerAnnuel(r).forEach(function (a) {
        lignes.push([a.annee, a.debut ? moisAnnee(a.debut) + ' – ' + moisAnnee(a.fin) : libEcheances(a.nb)].concat(montants(a.paiement, a.interet, a.principal, a.assurance, a.reste)));
      });
    } else {
      r.lignes.forEach(function (l) {
        lignes.push((avecDate ? [l.mois, moisAnnee(l.date)] : [l.mois]).concat(montants(totalLigne(l), l.interet, l.principal, l.assurance, l.reste, l)));
        if (l.ra) {
          var x = l.ra;
          lignes.push((avecDate ? [t('RA'), t('Remb. anticipé')] : [t('RA')]).concat(montants(roundPrec(x.montant + x.indemnite), '', x.montant, '', x.reste)));
        }
      });
    }
    var total = entete.map(function () { return ''; });
    total[0] = t('Total');
    total[decal] = r.totM; total[decal + 1] = r.totI; total[decal + 2] = r.totP;
    if (avecAss) total[decal + 3] = r.totAss;
    return { entete: entete, lignes: lignes, total: total, decal: decal };
  }

  function descriptionRA(e) {
    var d = e.ras.map(function (x) { return x.total ? t('solde après l\'échéance {n}', { n: x.apres }) : t('{m} après l\'échéance {n}', { m: fmtTexte(x.montant), n: x.apres }); });
    if (e.versement) d.push(t(e.versement.frequence === 'annee' ? '{m} une fois par an dès l\'échéance {n}' : '{m} à chaque échéance dès l\'échéance {n}', { m: fmtTexte(e.versement.montant), n: e.versement.des }));
    return d.join(' ; ');
  }

  function synthese(sc) {
    var e = sc.entrees, r = sc.resultat;
    var der = r.lignes[r.lignes.length - 1];
    var infoP = infoPeriodicite(r.p);
    var s = [];
    if (e.type && e.type !== 'libre') s.push([t('Type de crédit'), t(nomType(e.type))]);
    if (e.apport) {
      s.push([t('Prix du bien'), fmtTexte(e.apport.prix)]);
      s.push([t('Apport personnel'), fmtTexte(e.apport.apport) + ' (' + fmtPct(e.apport.apport / e.apport.prix * 100, 1) + ')']);
    }
    s.push([t('Capital emprunté'), fmtTexte(e.capital)]);
    s.push([t('Durée'), t('{n} ({a} ans)', { n: libMois(e.mois), a: fmtLibre(e.mois / 12) })]);
    if (r.p !== 1) s.push([t('Périodicité'), t('{p} · {n}', { p: t(infoP.nom), n: libEcheances(r.nPrevu) })]);
    if (r.amort !== 'constant') s.push([t('Amortissement'), t(nomAmort(r.amort))]);
    if (e.differe) s.push([t('Différé'), t(e.differe.type === 'total' ? '{n}, total (intérêts capitalisés)' : '{n}, partiel (intérêts payés)', { n: libMois(e.differe.mois) })]);
    s.push([t('Taux d\'intérêt annuel'), e.tmm
      ? t('TMM {a} + marge {b} = {c}', { a: fmtTaux(e.tmm.tmm), b: fmtTaux(e.tmm.marge), c: fmtTaux(e.taux) })
      : fmtTaux(e.taux)]);
    s.push([r.p === 1 ? t('Taux d\'intérêt mensuel') : t('Taux de la période'), fmtTm(r.tm)]);
    if (e.variation) s.push([t('Évolution du TMM'), t('{d} point(s) dès l\'échéance {n}', { d: fmtSigne(e.variation.delta), n: e.variation.des })]);
    if (r.reduc) s.push([t('Réductions de taux ({n})', { n: r.reductions.length }), texteReductions(r)]);
    s.push([t('Date de début'), e.dateDebut ? dateCourte(e.dateDebut) : t('Non précisée')]);
    s.push([t(infoP.echeance) + (r.totAss > 0 ? ' ' + t('(hors assurance)') : ''), texteEcheances(r)]);
    if (r.totAss > 0) {
      var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
      s.push([t('Assurance emprunteur'), t('{taux} par an sur le {base} : {m} la 1re échéance', { taux: fmtTaux(e.assurance.taux), base: e.assurance.base === 'crd' ? t('capital restant dû') : t('capital initial'), m: fmtTexte(r.lignes[0].assurance) })]);
      s.push([t('Échéance avec assurance'), fmtTexte(totalLigne(lp))]);
    }
    s.push([t('Coût total des intérêts'), fmtTexte(r.totI)]);
    if (r.totAss > 0) s.push([t('Coût de l\'assurance'), fmtTexte(r.totAss)]);
    if (r.frais > 0) s.push([t('Frais (dossier, garantie, autres)'), fmtTexte(r.frais)]);
    if (r.ras.length) {
      s.push([t('Remboursements anticipés'), descriptionRA(e)]);
      s.push([t('Montant remboursé par anticipation'), fmtTexte(r.totRA)]);
      s.push([t('Indemnités de remboursement anticipé'), fmtTexte(r.totIndem)]);
      if (!(der.ra && der.ra.reste <= 0)) s.push([t('Option choisie'), e.raMode === 'duree' ? t('Réduire la durée') : t('Réduire l\'échéance')]);
      s.push([r.totAss > 0 ? t('Économie (intérêts et assurance)') : t('Économie d\'intérêts'), fmtTexte(roundPrec((r.sansRA.totI + r.sansRA.totAss) - (r.totI + r.totAss)))]);
    }
    s.push([t('Coût du crédit (hors capital)'), fmtTexte(r.coutCredit)]);
    s.push([t('Coût total du crédit'), fmtTexte(r.coutTotal)]);
    if (isFinite(r.teg)) s.push([t('TEG'), fmtPct(r.teg, 3)]);
    if (der && der.date) s.push([t('Dernière échéance'), moisAnnee(der.date) + (r.n < r.nPrevu ? ' ' + t('(au lieu de {n})', { n: libEcheances(r.nPrevu) }) : '')]);
    return s;
  }

  /* Lignes du dossier : agence, conseiller, client, référence */
  function dossier(sc) {
    var e = sc.entrees, d = [];
    if (agence.nom) d.push([t('Agence'), agence.nom]);
    if (agence.conseiller) d.push([t('Conseiller'), agence.conseiller]);
    if (agence.tel) d.push([t('Téléphone'), agence.tel]);
    if (e.client.nom) d.push([t('Client'), e.client.nom]);
    if (e.client.ref) d.push([t('Référence du dossier'), e.client.ref]);
    return d;
  }

  var URL_AUTEUR = 'https://www.linkedin.com/in/mohamed-aziz-jaouadi-%D9%85%D8%AD%D9%85%D8%AF-%D8%B9%D8%B2%D9%8A%D8%B2-%D8%A7%D9%84%D8%AC%D9%88%D8%A7%D8%AF%D9%8A-%C2%AEpsm-i-%C2%AEpspo-l-%C2%AEistqb-851009115/';
  /* Rend le nom de l'auteur cliquable dans un PDF (texte aligné à gauche en x, ligne de base y) */
  function lienAuteurPDF(doc, texte, x, y) {
    var i = texte.lastIndexOf('Mohamed Aziz Jaouadi');
    if (i < 0 || typeof doc.link !== 'function') return;
    var dx = doc.getTextWidth(texte.slice(0, i)), l = doc.getTextWidth('Mohamed Aziz Jaouadi'), h = doc.getFontSize() / doc.internal.scaleFactor;
    doc.link(x + dx, y - h, l, h * 1.3, { url: URL_AUTEUR });
  }

  function exigerResultat(sc) {
    if (!sc.resultat) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return false; }
    return true;
  }

  function nomFichier(sc, ext, prefixe) {
    var ref = (sc.entrees.client.ref || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
    return (prefixe || 'amortissement') + '_scenario_' + sc.nom + (ref ? '_' + ref : '') + (sc.vue === 'annuel' && ext === 'xlsx' ? '_annuel' : '') + '.' + ext;
  }

  function telecharger(contenu, type, nom) {
    var blob = new Blob([contenu], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ===================================================================
     Exports
     =================================================================== */
  function exporterExcel(sc) {
    if (!exigerResultat(sc)) return;
    if (typeof XLSX === 'undefined') { toast(t('Export Excel indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    enFrancais(function () {
      var d = donneesExport(sc);
      var wb = XLSX.utils.book_new();
      var entete = [['Simulation de crédit — Scénario ' + sc.nom], ['Édité le ' + new Date().toLocaleDateString('fr-FR')], []];
      var dos = dossier(sc);
      var ws1 = XLSX.utils.aoa_to_sheet(entete.concat(dos, dos.length ? [[]] : [], synthese(sc)));
      ws1['!cols'] = [{ wch: 38 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Synthèse');

      var ws = XLSX.utils.aoa_to_sheet([d.entete].concat(d.lignes, [d.total]));
      var plage = XLSX.utils.decode_range(ws['!ref']);
      for (var R = 1; R <= plage.e.r; R++) {
        for (var C = d.decal; C <= plage.e.c; C++) {
          var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = '#,##0.000'; }
        }
      }
      ws['!cols'] = d.entete.map(function (h, i) { return { wch: i < d.decal ? (i === 1 ? 20 : 10) : 18 }; });
      XLSX.utils.book_append_sheet(wb, ws, 'Amortissement');
      XLSX.writeFile(wb, nomFichier(sc, 'xlsx'), { bookType: 'xlsx' });
    });
    toast(t('Fichier Excel téléchargé.'));
  }

  function exporterPDF(sc, silencieux) {
    if (!exigerResultat(sc)) return false;
    if (!window.jspdf || !window.jspdf.jsPDF) { toast(t('Export PDF indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return false; }
    enFrancais(function () { construirePDF(sc); });
    if (!silencieux) toast(t('PDF téléchargé.'));
    return true;
  }

  function construirePDF(sc) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var L = doc.internal.pageSize.getWidth();
    var violet = [124, 58, 237], rose = [236, 72, 153], encre = [22, 18, 41], gris = [110, 105, 137];
    var e = sc.entrees;
    var hBande = 34;

    /* Bandeau d'en-tête en dégradé (bandes fines) */
    var pasBande = 60;
    for (var i = 0; i < pasBande; i++) {
      var tt = i / (pasBande - 1);
      doc.setFillColor(Math.round(violet[0] + (rose[0] - violet[0]) * tt), Math.round(violet[1] + (rose[1] - violet[1]) * tt), Math.round(violet[2] + (rose[2] - violet[2]) * tt));
      doc.rect(L * i / pasBande, 0, L / pasBande + 0.4, hBande, 'F');
    }
    var xDroite = L - 14;
    if (agence.logo && agence.logoL > 0) {
      try {
        var hMax = 20, lMax = 46;
        var ech = Math.min(hMax / agence.logoH, lMax / agence.logoL);
        var lw = agence.logoL * ech, lh = agence.logoH * ech;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(xDroite - lw - 6, (hBande - lh) / 2 - 3, lw + 6, lh + 6, 2.5, 2.5, 'F');
        doc.addImage(agence.logo, 'PNG', xDroite - lw - 3, (hBande - lh) / 2, lw, lh);
        xDroite -= lw + 12;
      } catch (err) { /* logo illisible : ignoré */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Simulation de crédit', 14, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Scénario ' + sc.nom + (e.type !== 'libre' ? ' · ' + { immo: 'Crédit immobilier', auto: 'Crédit auto', conso: 'Crédit à la consommation' }[e.type] : '') + ' · dinars tunisiens (TND)', 14, 21);
    var lAg = ligneAgence();
    doc.setFontSize(9);
    if (lAg) doc.text(doc.splitTextToSize(lAg, xDroite - 14)[0], 14, 27.5);
    else doc.text('Édité le ' + new Date().toLocaleDateString('fr-FR'), xDroite, 27.5, { align: 'right' });

    var y = hBande + 8;
    doc.setTextColor(encre[0], encre[1], encre[2]);
    var infos = [];
    if (e.client.nom) infos.push('Client : ' + e.client.nom);
    if (e.client.ref) infos.push('Réf. : ' + e.client.ref);
    if (lAg) infos.push('Édité le ' + new Date().toLocaleDateString('fr-FR'));
    if (infos.length) {
      doc.setFillColor(245, 243, 252);
      doc.roundedRect(14, y - 5, L - 28, 9, 2, 2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
      doc.text(doc.splitTextToSize(infos.join('   ·   '), L - 34)[0], 17, y + 0.8);
      y += 12;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Synthèse', 14, y);

    var aTable = typeof doc.autoTable === 'function';
    var qr = matriceQR(lienSimulation(sc));
    var tailleQR = 40, xQR = L - 14 - tailleQR, yQR = y + 3;
    if (qr) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(violet[0], violet[1], violet[2]);
      doc.setLineWidth(0.6);
      doc.roundedRect(xQR - 2.5, yQR - 2.5, tailleQR + 5, tailleQR + 5, 3, 3, 'FD');
      var n = qr.getModuleCount(), mod = tailleQR / n;
      doc.setFillColor(encre[0], encre[1], encre[2]);
      for (var qy = 0; qy < n; qy++) {
        for (var qx = 0; qx < n; qx++) {
          if (!qr.isDark(qy, qx)) continue;
          var debut = qx;
          while (qx + 1 < n && qr.isDark(qy, qx + 1)) qx++;
          doc.rect(xQR + debut * mod, yQR + qy * mod, (qx - debut + 1) * mod + 0.02, mod + 0.02, 'F');
        }
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setTextColor(violet[0], violet[1], violet[2]);
      doc.text('Scannez pour ouvrir', xQR + tailleQR / 2, yQR + tailleQR + 7.5, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.setTextColor(gris[0], gris[1], gris[2]);
      doc.text('cette simulation sur mobile', xQR + tailleQR / 2, yQR + tailleQR + 11.5, { align: 'center' });
      doc.setTextColor(encre[0], encre[1], encre[2]);
    }

    if (aTable) {
      doc.autoTable({
        startY: y + 3,
        body: synthese(sc),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, textColor: encre },
        columnStyles: { 0: { textColor: gris, cellWidth: 60 }, 1: { fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [245, 243, 252] },
        margin: { left: 14, right: qr ? 14 + tailleQR + 9 : 14 }
      });
      y = Math.max(doc.lastAutoTable.finalY, qr ? yQR + tailleQR + 12 : 0) + 10;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      synthese(sc).forEach(function (l) { y += 7; doc.text(l[0] + ' : ' + l[1], 14, y); });
      y += 12;
    }
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Tableau d\'amortissement ' + (sc.vue === 'annuel' ? '(annuel)' : '(par échéance)'), 14, y);

    var d = donneesExport(sc);
    var fmtCellule = function (v, i) { return (i >= d.decal && typeof v === 'number') ? fmtNombre(v).replace(/[\u202f\u00a0]/g, ' ') : String(v); };
    var corps = d.lignes.map(function (l) { return l.map(fmtCellule); });
    var pied = d.total.map(fmtCellule);
    var piedTxt = (agence.nom ? agence.nom + ' · ' : '') + 'Simulation indicative · Mohamed Aziz Jaouadi';

    if (aTable) {
      var styles = {};
      for (var c = 0; c < d.entete.length; c++) styles[c] = { halign: c >= d.decal ? 'right' : 'left' };
      doc.autoTable({
        startY: y + 3,
        head: [d.entete],
        body: corps,
        foot: [pied],
        theme: 'grid',
        headStyles: { fillColor: violet, textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [236, 232, 250], textColor: encre, fontStyle: 'bold' },
        styles: { fontSize: d.entete.length > 6 ? 7.8 : 8.5, cellPadding: 1.6, lineColor: [228, 224, 240], lineWidth: 0.1, textColor: encre },
        alternateRowStyles: { fillColor: [249, 248, 253] },
        columnStyles: styles,
        margin: { left: 14, right: 14, bottom: 16 },
        showFoot: 'lastPage',
        didParseCell: function (data) {
          if (data.section === 'body' && data.row.raw[0] === 'RA') {
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [4, 120, 87];
            data.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: function () {
          var h = doc.internal.pageSize.getHeight();
          doc.setFontSize(8);
          doc.setTextColor(gris[0], gris[1], gris[2]);
          doc.text(piedTxt, 14, h - 8);
          lienAuteurPDF(doc, piedTxt, 14, h - 8);
          doc.text('Page ' + doc.internal.getNumberOfPages(), L - 14, h - 8, { align: 'right' });
        }
      });
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      y += 6; doc.text(d.entete.join('  |  '), 14, y);
      for (var j = 0; j < corps.length && y < 280; j++) { y += 5; doc.text(corps[j].join('  |  '), 14, y); }
    }
    doc.save(nomFichier(sc, 'pdf'));
  }

  function partagerParEmail(sc) {
    if (!exigerResultat(sc)) return;
    var ok = exporterPDF(sc, true);
    var nomPdf = nomFichier(sc, 'pdf');
    var corps = enFrancais(function () {
      var dos = dossier(sc);
      return '=== SIMULATION DE CRÉDIT (scénario ' + sc.nom + ') ===\n\n' +
        (dos.length ? 'DOSSIER\n-----------------\n' + dos.map(function (l) { return l[0] + ' : ' + l[1]; }).join('\n') + '\n\n' : '') +
        'SYNTHÈSE\n-----------------\n' +
        synthese(sc).map(function (l) { return l[0] + ' : ' + l[1]; }).join('\n') + '\n\n' +
        'Ouvrir cette simulation en ligne :\n' + lienSimulation(sc) + '\n\n' +
        (ok ? 'TABLEAU D\'AMORTISSEMENT\n-----------------\nLe détail complet figure dans le fichier PDF joint (' + nomPdf + ').\n\n' : '') +
        'Cordialement' + (agence.conseiller ? '\n' + agence.conseiller : '') + (agence.nom ? '\n' + agence.nom : '') + (agence.tel ? '\n' + agence.tel : '');
    });
    var sujet = 'Simulation de crédit — résultats et tableau d\'amortissement' + (sc.entrees.client.nom ? ' — ' + sc.entrees.client.nom : '');
    setTimeout(function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
      toast(ok ? t('PDF téléchargé : joignez « {f} » (dossier Téléchargements) à l\'e-mail avant l\'envoi.', { f: nomPdf }) : t('Votre messagerie va s\'ouvrir avec le résumé de la simulation.'), 'info', 7000);
    }, ok ? 700 : 0);
  }

  /* Message WhatsApp : résumé et lien de la simulation */
  function partagerWhatsApp(sc) {
    if (!exigerResultat(sc)) return;
    var texte = enFrancais(function () {
      var e = sc.entrees, r = sc.resultat;
      var lignes = [
        '*Simulation de crédit*' + (e.type !== 'libre' ? ' — ' + nomType(e.type) : ''),
        'Capital : ' + fmtTexte(e.capital),
        'Durée : ' + libMois(e.mois) + (r.p !== 1 ? ' (' + libEcheances(r.nPrevu) + ' ' + infoPeriodicite(r.p).nom.toLowerCase() + 's)' : ''),
        'Taux : ' + (e.tmm ? 'TMM ' + fmtTaux(e.tmm.tmm) + ' + ' + fmtTaux(e.tmm.marge) + ' = ' : '') + fmtTaux(e.taux),
        infoPeriodicite(r.p).echeance + ' : ' + texteEcheances(r),
        'Coût total du crédit : ' + fmtTexte(r.coutTotal) + (isFinite(r.teg) ? ' (TEG ' + fmtPct(r.teg, 2) + ')' : '')
      ];
      if (r.totAss > 0) lignes.splice(5, 0, 'Assurance : ' + fmtTexte(r.lignes[Math.min(r.D, r.n - 1)].assurance) + ' par échéance');
      return lignes.join('\n') + '\n\nVoir la simulation complète :\n' + lienSimulation(sc) + (agence.nom ? '\n\n' + ligneAgence() : '');
    });
    window.open('https://wa.me/?text=' + encodeURIComponent(texte), '_blank', 'noopener');
  }

  /* Agenda : un événement par échéance, avec rappel deux jours avant */
  function exporterAgenda(sc) {
    if (!exigerResultat(sc)) return;
    var e = sc.entrees, r = sc.resultat;
    var debut = lireDate(e.dateDebut);
    if (!debut) { toast(t('Indiquez la date de début du crédit pour créer l\'agenda des échéances.'), 'erreur'); sc.champs.date.focus(); return; }
    var contenu = enFrancais(function () {
      function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
      function plier(ligne) {
        var out = [], cur = '', octets = 0;
        Array.from(ligne).forEach(function (ch) {
          var o = unescape(encodeURIComponent(ch)).length;
          if (octets + o > 73) { out.push(cur); cur = ' '; octets = 1; }
          cur += ch; octets += o;
        });
        out.push(cur);
        return out.join('\r\n');
      }
      function jour(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
      var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      var id = Date.now().toString(36);
      var nomEch = infoPeriodicite(r.p).echeance;
      var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Simulateur de credit TND//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:' + esc('Échéances du crédit' + (e.client.nom ? ' — ' + e.client.nom : ''))];
      r.lignes.forEach(function (l) {
        var an = debut.getFullYear(), mo = debut.getMonth() + (l.mois - 1) * r.p;
        var dernierJour = new Date(an, mo + 1, 0).getDate();
        var d = new Date(an, mo, Math.min(debut.getDate(), dernierJour));
        var lendemain = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        var montant = totalLigne(l);
        var desc = [nomEch + ' : ' + fmtTexte(montant), 'Intérêts : ' + fmtTexte(l.interet), 'Capital remboursé : ' + fmtTexte(l.principal)];
        if (l.assurance > 0) desc.push('Assurance : ' + fmtTexte(l.assurance));
        desc.push('Capital restant dû : ' + fmtTexte(l.reste));
        if (l.ra) desc.push('Remboursement anticipé : ' + fmtTexte(l.ra.montant + l.ra.indemnite));
        L.push('BEGIN:VEVENT', 'UID:' + id + '-' + l.mois + '@simulateur-credit', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + jour(d), 'DTEND;VALUE=DATE:' + jour(lendemain),
          'SUMMARY:' + esc('Échéance ' + l.mois + '/' + r.n + ' — ' + fmtTexte(montant + (l.ra ? l.ra.montant + l.ra.indemnite : 0))),
          'DESCRIPTION:' + esc(desc.join('\n')), 'TRANSP:TRANSPARENT',
          'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Échéance de crédit dans 2 jours'), 'END:VALARM',
          'END:VEVENT');
      });
      L.push('END:VCALENDAR');
      return L.map(plier).join('\r\n') + '\r\n';
    });
    telecharger(contenu, 'text/calendar;charset=utf-8', nomFichier(sc, 'ics', 'echeances'));
    toast(t('Agenda téléchargé : ouvrez le fichier pour ajouter les {n} échéances à votre calendrier.', { n: r.n }), 'succes', 5000);
  }

  /* ===================================================================
     Impression (A4) : en-tête de l'agence, dossier, synthèse et QR code,
     puis les résultats et le tableau complet du scénario affiché.
     =================================================================== */
  function preparerImpression(sc) {
    var zone = $('#impression');
    if (!zone) return;
    if (!sc || !sc.resultat) { zone.innerHTML = ''; return; }
    var qr = matriceQR(lienSimulation(sc));
    var dos = [];
    if (sc.entrees.client.nom) dos.push([t('Client'), sc.entrees.client.nom]);
    if (sc.entrees.client.ref) dos.push([t('Référence du dossier'), sc.entrees.client.ref]);
    zone.innerHTML =
      '<div class="imp-tete">' +
        '<div><h1>' + echapper(t('Simulation de crédit')) + '</h1>' +
          '<p>' + echapper(t('Scénario {n}', { n: sc.nom }) + (sc.entrees.type !== 'libre' ? ' · ' + t(nomType(sc.entrees.type)) : '') + ' · ' + t('Édité le {d}', { d: dateDuJour() })) + '</p>' +
          (ligneAgence() ? '<p class="imp-agence">' + echapper(ligneAgence()) + '</p>' : '') + '</div>' +
        (agence.logo ? '<img class="imp-logo" src="' + echapper(agence.logo) + '" alt="">' : '') +
      '</div>' +
      (dos.length ? '<div class="imp-dossier">' + dos.map(function (l) { return '<span><b>' + echapper(l[0]) + ' :</b> ' + echapper(l[1]) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="imp-corps">' +
        '<table class="imp-synthese"><tbody>' + synthese(sc).map(function (l) { return '<tr><th>' + echapper(l[0]) + '</th><td>' + echapper(l[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
        (qr ? '<div class="imp-qr">' + svgQR(qr) + '<span>' + echapper(t('Scannez pour ouvrir cette simulation sur mobile')) + '</span></div>' : '') +
      '</div>';
  }

  function imprimer(sc) {
    if (!exigerResultat(sc)) return;
    preparerImpression(sc);
    window.print();
  }

  /* ===================================================================
     Lien de partage et QR code
     Le lien contient la simulation (jamais les données du client ni de
     l'emprunteur) : c capital, m durée en mois, t taux, d date de début,
     r réduction, ty type, i / mg TMM et marge, dv / dn évolution du TMM,
     pe périodicité, am amortissement (l ou i), df / dt différé (mois,
     t = total), as / ab assurance (taux, c = capital restant dû),
     fp / ff / fg / fa frais, pb / ap prix et apport, ra remboursements
     « échéance:montant » ou « échéance:tot » séparés par des virgules,
     vm / vf / vd versement régulier (montant, a = annuel, échéance),
     ri indemnité, ro option (m = réduire l'échéance).
     =================================================================== */
  var URL_PUBLIQUE = 'https://mohamed-ja.github.io/simulateur-credit/';

  function adresseApplication() {
    var l = window.location;
    if (/^https?:$/.test(l.protocol) && !/^(localhost|127\.|\[::1\])/.test(l.hostname)) return l.origin + l.pathname;
    return URL_PUBLIQUE;
  }

  function lienSimulation(sc) {
    var e = sc.entrees;
    var p = ['c=' + roundPrec(e.capital), 'm=' + e.mois, 't=' + e.taux];
    if (e.dateDebut) p.push('d=' + e.dateDebut);
    if (sc.resultat && sc.resultat.reduc) p.push('r=1');
    if (e.type && e.type !== 'libre') p.push('ty=' + e.type);
    if (e.tmm) {
      p.push('i=' + e.tmm.tmm, 'mg=' + e.tmm.marge);
      if (e.variation) p.push('dv=' + e.variation.delta, 'dn=' + e.variation.des);
    }
    if (e.periodicite !== 1) p.push('pe=' + e.periodicite);
    if (e.amort !== 'constant') p.push('am=' + (e.amort === 'lineaire' ? 'l' : 'i'));
    if (e.differe) p.push('df=' + e.differe.mois, 'dt=' + (e.differe.type === 'total' ? 't' : 'p'));
    if (e.assurance) p.push('as=' + e.assurance.taux, 'ab=' + (e.assurance.base === 'crd' ? 'c' : 'i'));
    if (e.frais) {
      if (e.frais.dossierPct) p.push('fp=' + e.frais.dossierPct);
      if (e.frais.dossierFixe) p.push('ff=' + e.frais.dossierFixe);
      if (e.frais.garantie) p.push('fg=' + e.frais.garantie);
      if (e.frais.autres) p.push('fa=' + e.frais.autres);
    }
    if (e.apport) p.push('pb=' + e.apport.prix, 'ap=' + e.apport.apport);
    if (e.ras.length) p.push('ra=' + e.ras.map(function (x) { return x.apres + ':' + (x.total ? 'tot' : roundPrec(x.montant)); }).join(','));
    if (e.versement) p.push('vm=' + e.versement.montant, 'vf=' + (e.versement.frequence === 'annee' ? 'a' : 'p'), 'vd=' + e.versement.des);
    if (e.ras.length || e.versement) {
      if (e.indemnite) p.push('ri=' + e.indemnite);
      if (e.raMode === 'mensualite') p.push('ro=m');
    }
    return adresseApplication() + '?' + p.join('&');
  }

  function matriceQR(texte) {
    if (typeof qrcode !== 'function') return null;
    try {
      var qr = qrcode(0, 'M');
      qr.addData(texte);
      qr.make();
      return qr;
    } catch (err) { return null; }
  }

  function svgQR(qr) {
    var n = qr.getModuleCount(), marge = 2, tl = n + marge * 2, d = '';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (!qr.isDark(y, x)) continue;
        var debut = x;
        while (x + 1 < n && qr.isDark(y, x + 1)) x++;
        d += 'M' + (debut + marge) + ' ' + (y + marge) + 'h' + (x - debut + 1) + 'v1h-' + (x - debut + 1) + 'z';
      }
    }
    return '<svg viewBox="0 0 ' + tl + ' ' + tl + '" shape-rendering="crispEdges" role="img" aria-label="' + echapper(t('QR code de la simulation')) + '">' +
      '<rect width="' + tl + '" height="' + tl + '" fill="#fff"/><path d="' + d + '" fill="#161229"/></svg>';
  }

  function telechargerQR(qr, nom) {
    var n = qr.getModuleCount(), marge = 4, echelle = 12, tl = (n + marge * 2) * echelle;
    var cv = document.createElement('canvas');
    cv.width = tl; cv.height = tl;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tl, tl);
    ctx.fillStyle = '#161229';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if (qr.isDark(y, x)) ctx.fillRect((x + marge) * echelle, (y + marge) * echelle, echelle, echelle);
    }
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function copierTexte(texte) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texte);
    return new Promise(function (ok, ko) {
      var zone = document.createElement('textarea');
      zone.value = texte; zone.setAttribute('readonly', ''); zone.style.position = 'fixed'; zone.style.opacity = '0';
      document.body.appendChild(zone); zone.select();
      try { if (document.execCommand('copy')) ok(); else ko(); } catch (err) { ko(err); }
      zone.remove();
    });
  }

  function ouvrirQR(sc) {
    if (!exigerResultat(sc)) return;
    var e = sc.entrees, r = sc.resultat;
    var lien = lienSimulation(sc);
    var qr = matriceQR(lien);
    if (!qr) { toast(t('QR code indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    var puces = [fmtMoney(e.capital), libMois(e.mois), fmtTaux(e.taux), t(infoPeriodicite(r.p).echeance) + ' ' + fmtMoney(r.M1)];
    if (e.tmm) puces.splice(3, 0, t('TMM + {m}', { m: fmtTaux(e.tmm.marge) }));
    if (r.ras.length) puces.push(t('Remboursements anticipés'));
    if (isFinite(r.teg) && (r.frais > 0 || r.totAss > 0)) puces.push(t('TEG {v}', { v: fmtPct(r.teg, 2) }));
    var partageNatif = typeof navigator.share === 'function';
    var d = ouvrirDialogue({
      titre: t('QR code de la simulation'),
      sousTitre: echapper(t('Scannez-le avec un téléphone : le simulateur s\'ouvre avec ces valeurs déjà remplies.')),
      icone: 'qr',
      corps:
        '<div class="qr-zone">' +
          '<div class="qr-carte">' + svgQR(qr) + '</div>' +
          '<div class="qr-resume">' + puces.map(function (x) { return '<span>' + echapper(x) + '</span>'; }).join('') + '</div>' +
          '<div class="qr-lien">' + ico('link', 'ico-sm') +
            '<input id="qr-url" type="text" readonly dir="ltr" aria-label="' + echapper(t('Lien de la simulation')) + '" value="' + echapper(lien) + '">' +
            '<button class="btn btn-primary btn-sm" id="qr-copier">' + echapper(t('Copier')) + '</button>' +
          '</div>' +
          '<p class="qr-aide">' + echapper(t('Le QR code figure aussi sur la première page de l\'export PDF et sur l\'impression.')) + '</p>' +
        '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            (partageNatif ? '<button class="btn btn-blue" id="qr-partager">' + ico('upload', 'ico-sm') + echapper(t('Partager')) + '</button>' : '') +
            '<button class="btn btn-primary" id="qr-image">' + ico('download', 'ico-sm') + echapper(t('Télécharger l\'image')) + '</button>'
    });
    var el = d.el;
    $('#qr-url', el).addEventListener('focus', function () { this.select(); });
    $('#qr-copier', el).addEventListener('click', function () {
      copierTexte(lien).then(function () { toast(t('Lien copié dans le presse-papiers.')); },
        function () { $('#qr-url', el).select(); toast(t('Copie impossible : sélectionnez le lien et copiez-le.'), 'info'); });
    });
    $('#qr-image', el).addEventListener('click', function () {
      telechargerQR(qr, 'qr_simulation_' + sc.nom + '.png');
      toast(t('Image du QR code téléchargée.'));
    });
    if (partageNatif) $('#qr-partager', el).addEventListener('click', function () {
      navigator.share({ title: t('Simulation de crédit'), text: t('Ma simulation de crédit') + ' (' + puces.join(' · ') + ')', url: lien }).catch(function () {});
    });
  }

  /* Ouverture d'une simulation reçue par lien ou QR code */
  function lireLienPartage() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (err) { return; }
    if (!q.has('c') || !q.has('m') || !q.has('t')) return;
    function num(k) { return q.has(k) ? parseFloat(q.get(k)) : NaN; }
    function ent(k) { return q.has(k) ? parseInt(q.get(k), 10) : NaN; }
    var capital = num('c'), mois = ent('m'), taux = num('t');
    var date = q.get('d') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    var p = [1, 3, 6, 12].indexOf(ent('pe')) !== -1 ? ent('pe') : 1;
    var valide = isFinite(capital) && capital > 0 && isFinite(mois) && mois >= 1 && mois <= 300 && mois % p === 0 && isFinite(taux) && taux >= 0 && taux <= 100;
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (err) { /* sans effet */ }
    if (!valide) { toast(t('Le lien de simulation est incomplet ou invalide.'), 'erreur'); return; }
    var N = mois / p;
    var v = { capital: capital, mois: mois, taux: taux, dateDebut: date, reduction: q.get('r') === '1', tmm: null, variation: null, periodicite: p };
    var ty = q.get('ty');
    v.type = TYPES.some(function (x) { return x.cle === ty; }) ? ty : 'libre';
    var tmm = num('i'), mg = num('mg');
    if (isFinite(tmm) && isFinite(mg) && tmm >= 0 && mg >= 0) {
      v.tmm = { tmm: tmm, marge: mg };
      var dv = num('dv'), dn = ent('dn');
      if (isFinite(dv) && dv !== 0 && Math.abs(dv) <= 20 && dn >= 2 && dn <= N) v.variation = { delta: dv, des: dn };
    }
    v.amort = q.get('am') === 'l' ? 'lineaire' : (q.get('am') === 'i' ? 'infine' : 'constant');
    var df = ent('df');
    if (df > 0 && df < mois && df % p === 0) v.differe = { mois: df, type: q.get('dt') === 't' ? 'total' : 'partiel' };
    var as = num('as');
    if (as > 0 && as <= 10) v.assurance = { taux: as, base: q.get('ab') === 'c' ? 'crd' : 'initial' };
    var fr = { dossierPct: num('fp'), dossierFixe: num('ff'), garantie: num('fg'), autres: num('fa') };
    Object.keys(fr).forEach(function (k) { fr[k] = isFinite(fr[k]) && fr[k] > 0 ? fr[k] : 0; });
    if (fr.dossierPct > 10) fr.dossierPct = 0;
    if (fr.dossierPct + fr.dossierFixe + fr.garantie + fr.autres > 0) v.frais = fr;
    var pb = num('pb'), ap = num('ap');
    if (pb > 0 && ap >= 0 && ap < pb) v.apport = { prix: pb, apport: ap };
    var ras = [];
    if (q.has('rm')) {
      /* Ancien format : ra = échéance, rm = montant ou « tot », ri, ro */
      var a1 = ent('ra');
      if (a1 >= 1 && a1 < N && (q.get('rm') === 'tot' || num('rm') > 0)) ras.push({ apres: a1, total: q.get('rm') === 'tot', montant: q.get('rm') === 'tot' ? null : num('rm') });
    } else if (q.get('ra')) {
      q.get('ra').split(',').forEach(function (x) {
        var m = /^(\d+):(tot|\d+(?:\.\d+)?)$/.exec(x.trim());
        if (!m) return;
        var ap1 = parseInt(m[1], 10);
        if (ap1 >= 1 && ap1 < N && ras.length < 10) ras.push({ apres: ap1, total: m[2] === 'tot', montant: m[2] === 'tot' ? null : parseFloat(m[2]) });
      });
    }
    v.ras = ras;
    var vm = num('vm'), vd = ent('vd');
    if (vm > 0 && vd >= 1 && vd < N) v.versement = { montant: vm, frequence: q.get('vf') === 'a' ? 'annee' : 'periode', des: vd };
    var ri = num('ri');
    v.indemnite = isFinite(ri) && ri >= 0 && ri <= 20 ? ri : 0;
    v.raMode = q.get('ro') === 'm' ? 'mensualite' : 'duree';
    scenarios.a.appliquer(v);
    toast(t('Simulation ouverte depuis le lien partagé.'), 'info');
  }

  /* ===================================================================
     Outils : champs communs des boîtes de dialogue
     =================================================================== */
  function champDlg(id, libelle, ph, suffixe, icone, valeur, mode) {
    return '<div class="field" data-champ-dlg="' + id + '"><label for="' + id + '">' + echapper(libelle) + '</label>' +
      '<div class="input-wrap">' + ico(icone) + '<input id="' + id + '" type="text" inputmode="' + (mode || 'decimal') + '" autocomplete="off"' + (mode === 'text' ? ' data-texte' : '') + ' placeholder="' + echapper(ph) + '"' +
      (valeur != null ? ' value="' + echapper(valeur) + '"' : '') + '>' + (suffixe ? '<span class="suffix">' + echapper(suffixe) + '</span>' : '') + '</div></div>';
  }
  function valeurDlg(el, id) { var i = $('#' + id, el); return i ? lireNombre(i.value) : NaN; }
  function statDlg(lib, val, ton, aide) {
    return '<div class="ra-stat' + (ton ? ' ' + ton : '') + '"><span>' + echapper(lib) + '</span><strong class="num">' + echapper(val) + '</strong>' + (aide ? '<small>' + echapper(aide) + '</small>' : '') + '</div>';
  }
  function scenarioActif() { return scenarios[actif]; }

  /* ===================================================================
     Capacité d'emprunt (taux d'endettement maximal)
     =================================================================== */
  function ouvrirCapacite() {
    var sc = scenarioActif();
    var maxi = agence.endettementMax;
    var corps =
      '<div class="dlg-fields">' +
        champDlg('cap-rev', t('Revenus mensuels nets'), t('Ex. 2 000'), unite(), 'cash') +
        champDlg('cap-ch', t('Charges mensuelles'), t('Ex. 300'), unite(), 'coins', '0') +
        champDlg('cap-dur', t('Durée souhaitée'), t('Ex. 120'), t('mois'), 'clock', '120', 'numeric') +
        champDlg('cap-taux', t('Taux d\'intérêt annuel'), t('Ex. 5'), '%', 'percent', '5') +
      '</div>' +
      '<div id="cap-res"></div>';
    var d = ouvrirDialogue({
      titre: t('Capacité d\'emprunt'),
      sousTitre: echapper(t('Taux d\'endettement maximum : {m} des revenus nets.', { m: fmtPct(maxi, 0) })),
      icone: 'wallet', ton: 'green',
      corps: corps,
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="cap-utiliser" disabled>' + ico('upload', 'ico-sm') + echapper(t('Utiliser dans le scénario {n}', { n: sc.nom })) + '</button>'
    });
    var el = d.el;
    var res = null;
    function calculerCap() {
      var rev = valeurDlg(el, 'cap-rev');
      var ch = valeurDlg(el, 'cap-ch'); if (!isFinite(ch)) ch = 0;
      var dur = valeurDlg(el, 'cap-dur');
      var taux = valeurDlg(el, 'cap-taux');
      var zone = $('#cap-res', el);
      var btn = $('#cap-utiliser', el);
      res = null; btn.disabled = true;
      if (!(rev > 0) || !(dur > 0) || !isFinite(taux) || taux < 0) {
        zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez vos revenus, la durée et le taux : le montant empruntable s\'affiche aussitôt.')) + '</p>';
        return;
      }
      dur = Math.round(dur);
      var capEnd = rev * maxi / 100;
      var mMax = capEnd - ch;
      if (mMax <= 0) {
        zone.innerHTML = '<div class="result-box ko"><div class="rb-main" style="margin:0;padding:0;border:0"><span>' + echapper(t('Capacité d\'emprunt')) + '</span><strong>' + echapper(t('Nulle')) + '</strong></div>' +
          '<p style="margin-top:6px;font-size:13.5px">' + echapper(t('Vos charges ({a}) atteignent ou dépassent {p} de vos revenus ({b}).', { a: fmtMoney(ch), b: fmtMoney(capEnd), p: fmtPct(maxi, 0) })) + '</p></div>';
        return;
      }
      var i = taux / 100 / 12;
      var montant = i === 0 ? mMax * dur : mMax * ((1 - Math.pow(1 + i, -dur)) / i);
      res = { montant: montant, dur: dur, taux: taux };
      var pCh = Math.min(100, ch / rev * 100), pMx = Math.min(100 - pCh, mMax / rev * 100);
      zone.innerHTML =
        '<div class="result-box">' +
          '<div class="rb-row"><span>' + echapper(t('Capacité d\'endettement ({p})', { p: fmtPct(maxi, 0) })) + '</span><b>' + echapper(fmtMoney(capEnd)) + '</b></div>' +
          '<div class="rb-row"><span>' + echapper(t('Mensualité maximale')) + '</span><b>' + echapper(fmtMoney(mMax)) + '</b></div>' +
          '<div class="jauge" aria-hidden="true"><span class="j-ch" style="width:' + pCh + '%"></span><span class="j-mx" style="width:' + pMx + '%"></span></div>' +
          '<div class="jauge-leg"><span>' + echapper(t('Charges {p}', { p: fmtPct(pCh, 1) })) + '</span><span>' + echapper(t('Mensualité max. {p}', { p: fmtPct(pMx, 1) })) + '</span><span>' + echapper(t('des revenus')) + '</span></div>' +
          '<div class="rb-main"><span>' + echapper(t('Montant empruntable sur {n}', { n: libMois(dur) })) + '</span><strong>' + echapper(fmtMoney(montant)) + '</strong></div>' +
        '</div>';
      btn.disabled = !(dur >= 1 && dur <= 300);
      if (dur > 300) zone.insertAdjacentHTML('beforeend', '<p class="field-err" style="margin-top:8px">' + echapper(t('Le simulateur accepte 300 mois au maximum : réduisez la durée pour l\'utiliser.')) + '</p>');
    }
    $$('input', el).forEach(function (inp) { inp.addEventListener('input', calculerCap); });
    $('#cap-utiliser', el).addEventListener('click', function () {
      if (!res) return;
      sc.appliquer({ capital: roundPrec(res.montant), mois: res.dur, taux: res.taux, reduction: false, tmm: null });
      d.fermer();
      toast(t('Valeurs appliquées au scénario {n}.', { n: sc.nom }));
    });
    calculerCap();
    setTimeout(function () { $('#cap-rev', el).focus(); }, 40);
  }

  /* ===================================================================
     Calcul inverse : capital, durée ou taux à partir de la mensualité
     (crédit mensuel à échéances constantes, sans frais ni assurance)
     =================================================================== */
  function ouvrirCalculInverse() {
    var sc = scenarioActif();
    var mode = 'capital';
    var corps =
      '<div class="seg seg-block seg-3 inv-modes" role="group" aria-label="' + echapper(t('Que voulez-vous calculer ?')) + '">' +
        '<button type="button" data-inv="capital" aria-pressed="true">' + echapper(t('Le capital')) + '</button>' +
        '<button type="button" data-inv="duree" aria-pressed="false">' + echapper(t('La durée')) + '</button>' +
        '<button type="button" data-inv="taux" aria-pressed="false">' + echapper(t('Le taux')) + '</button>' +
      '</div>' +
      '<div class="dlg-fields" style="margin-top:14px">' +
        champDlg('inv-m', t('Mensualité souhaitée'), t('Ex. 1 000'), unite(), 'calendar') +
        champDlg('inv-c', t('Capital emprunté'), t('Ex. 50 000'), unite(), 'cash') +
        champDlg('inv-n', t('Durée'), t('Ex. 120'), t('mois'), 'clock', null, 'numeric') +
        champDlg('inv-t', t('Taux d\'intérêt annuel'), t('Ex. 7,5'), '%', 'percent') +
      '</div>' +
      '<div id="inv-res"></div>' +
      '<p class="opt-note" style="margin-top:12px">' + echapper(t('Calcul pour un crédit mensuel à échéances constantes, sans frais ni assurance.')) + '</p>';
    var d = ouvrirDialogue({
      titre: t('Calcul inverse'),
      sousTitre: echapper(t('Trouvez le capital, la durée ou le taux qui correspond à une mensualité.')),
      icone: 'calc',
      corps: corps,
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="inv-utiliser" disabled>' + ico('upload', 'ico-sm') + echapper(t('Utiliser dans le scénario {n}', { n: sc.nom })) + '</button>'
    });
    var el = d.el, res = null;
    function champ(id) { return el.querySelector('[data-champ-dlg="' + id + '"]'); }
    function majModes() {
      $$('[data-inv]', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.inv === mode)); });
      champ('inv-c').hidden = mode === 'capital';
      champ('inv-n').hidden = mode === 'duree';
      champ('inv-t').hidden = mode === 'taux';
      calculer();
    }
    function calculer() {
      var M = valeurDlg(el, 'inv-m'), C = valeurDlg(el, 'inv-c'), n = lireEntier($('#inv-n', el).value), ta = valeurDlg(el, 'inv-t');
      var zone = $('#inv-res', el), btn = $('#inv-utiliser', el);
      res = null; btn.disabled = true;
      function attente() { zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez les trois autres valeurs : le résultat s\'affiche aussitôt.')) + '</p>'; }
      function erreur(msg) { zone.innerHTML = '<div class="result-box ko" style="margin-top:14px"><p style="font-size:14px;font-weight:600">' + echapper(msg) + '</p></div>'; }
      if (!(M > 0)) return attente();
      var titre, valeur, details = [];
      if (mode === 'capital') {
        if (!(n >= 1 && n <= 300) || !(ta >= 0 && ta <= 100)) return attente();
        var r = tauxMensuelPct(ta) / 100;
        var cap = Math.abs(r) < 1e-12 ? M * n : M * (1 - Math.pow(1 + r, -n)) / r;
        cap = Math.floor(cap * 1000) / 1000;
        res = { capital: cap, mois: n, taux: ta };
        titre = t('Capital empruntable'); valeur = fmtMoney(cap);
        details.push([t('Coût des intérêts'), fmtMoney(roundPrec(M * n - cap))]);
      } else if (mode === 'duree') {
        if (!(C > 0) || !(ta >= 0 && ta <= 100)) return attente();
        var r2 = tauxMensuelPct(ta) / 100;
        if (M <= C * r2) return erreur(t('Cette mensualité ne couvre pas les intérêts du premier mois ({m}) : le crédit ne serait jamais remboursé.', { m: fmtMoney(roundPrec(C * r2)) }));
        var nb = nombreEcheances(r2, M, C);
        if (!isFinite(nb) || nb > 300) return erreur(t('Il faudrait plus de 300 mois : augmentez la mensualité.'));
        var mReel = mensualite(C, tauxMensuelPct(ta), nb);
        res = { capital: C, mois: nb, taux: ta };
        titre = t('Durée nécessaire'); valeur = libMois(nb) + ' (' + t('{a} ans', { a: fmtLibre(Math.round(nb / 12 * 10) / 10) }) + ')';
        details.push([t('Mensualité sur cette durée'), fmtMoney(mReel)]);
      } else {
        if (!(C > 0) || !(n >= 1 && n <= 300)) return attente();
        if (M * n < C - 0.0005) return erreur(t('La mensualité est trop faible pour rembourser le capital sur cette durée, même sans intérêts.'));
        var bas = 0, haut = 1;
        for (var it = 0; it < 200; it++) { var mil = (bas + haut) / 2; if (pmt(mil, n, C) > M) haut = mil; else bas = mil; }
        var taux = Math.round(bas * 12 * 100 * 1000) / 1000;
        if (taux > 100) return erreur(t('Le taux dépasserait 100 % : vérifiez les valeurs.'));
        res = { capital: C, mois: n, taux: taux };
        titre = t('Taux annuel maximal'); valeur = fmtTaux(taux);
        details.push([t('Mensualité à ce taux'), fmtMoney(mensualite(C, tauxMensuelPct(taux), n))]);
      }
      zone.innerHTML = '<div class="result-box" style="margin-top:14px">' +
        details.map(function (x) { return '<div class="rb-row"><span>' + echapper(x[0]) + '</span><b>' + echapper(x[1]) + '</b></div>'; }).join('') +
        '<div class="rb-main"><span>' + echapper(titre) + '</span><strong>' + echapper(valeur) + '</strong></div></div>';
      btn.disabled = false;
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-inv]');
      if (b) { mode = b.dataset.inv; majModes(); }
    });
    $$('input', el).forEach(function (inp) { inp.addEventListener('input', calculer); });
    $('#inv-utiliser', el).addEventListener('click', function () {
      if (!res) return;
      sc.appliquer({ capital: res.capital, mois: res.mois, taux: res.taux, reduction: false, tmm: null });
      d.fermer();
      toast(t('Valeurs appliquées au scénario {n}.', { n: sc.nom }));
    });
    majModes();
    setTimeout(function () { $('#inv-m', el).focus(); }, 40);
  }

  /* ===================================================================
     Plan de financement : plusieurs prêts, mensualité globale et lissage
     =================================================================== */
  function ouvrirPlan() {
    function lignePret(i, lib) {
      return '<div class="pret" data-pret="' + i + '">' +
        '<div class="pret-tete"><span class="pret-num">' + (i + 1) + '</span>' +
          '<div class="input-wrap sm pret-nom"><input type="text" data-k="nom" data-texte autocomplete="off" value="' + echapper(lib) + '" aria-label="' + echapper(t('Nom du prêt')) + '"></div>' +
          '<button type="button" class="btn btn-quiet btn-sm btn-icon" data-suppr-pret aria-label="' + echapper(t('Supprimer ce prêt')) + '">' + ico('x', 'ico-sm') + '</button></div>' +
        '<div class="pret-champs">' +
          '<label><span>' + echapper(t('Capital')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="capital" autocomplete="off" placeholder="' + echapper(t('Ex. 50 000')) + '"><span class="suffix">' + echapper(unite()) + '</span></div></label>' +
          '<label><span>' + echapper(t('Durée')) + '</span><div class="input-wrap sm"><input type="text" inputmode="numeric" data-k="mois" autocomplete="off" placeholder="' + echapper(t('Ex. 120')) + '"><span class="suffix">' + echapper(t('mois')) + '</span></div></label>' +
          '<label><span>' + echapper(t('Taux')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="taux" autocomplete="off" placeholder="' + echapper(t('Ex. 7,5')) + '"><span class="suffix">%</span></div></label>' +
          '<label><span>' + echapper(t('Différé')) + '</span><div class="input-wrap sm"><input type="text" inputmode="numeric" data-k="diff" autocomplete="off" placeholder="0"><span class="suffix">' + echapper(t('mois')) + '</span></div></label>' +
        '</div></div>';
    }
    var d = ouvrirDialogue({
      titre: t('Plan de financement'),
      sousTitre: echapper(t('Plusieurs prêts (par exemple crédit principal et crédit d\'autofinancement) : mensualité globale, paliers et lissage.')),
      icone: 'layers', large: true,
      corps:
        '<div class="prets" id="plan-prets">' + lignePret(0, t('Crédit principal')) + lignePret(1, t('Crédit complémentaire')) + '</div>' +
        '<div class="plan-actions"><button type="button" class="btn btn-ghost btn-sm" id="plan-ajout">' + ico('plus', 'ico-sm') + echapper(t('Ajouter un prêt')) + '</button>' +
          '<label class="check"><input type="checkbox" id="plan-lisser"><span class="check-box" aria-hidden="true">' + ico('check', 'ico-sm') + '</span>' + echapper(t('Lisser les mensualités (le prêt le plus long s\'ajuste)')) + '</label></div>' +
        '<p class="opt-note">' + echapper(t('Prêts mensuels à échéances constantes. Le différé est partiel : seuls les intérêts sont payés.')) + '</p>' +
        '<div id="plan-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    var el = d.el;
    function prets() {
      var liste = [], erreurs = 0;
      $$('.pret', el).forEach(function (bl, i) {
        function v(k) { return $('[data-k="' + k + '"]', bl).value; }
        var C = lireNombre(v('capital')), n = lireEntier(v('mois')), ta = lireNombre(v('taux')), df = v('diff').trim() === '' ? 0 : lireEntier(v('diff'));
        var vide = !v('capital').trim() && !v('mois').trim() && !v('taux').trim();
        var ok = C > 0 && n >= 1 && n <= 300 && ta >= 0 && ta <= 100 && df >= 0 && df < n;
        bl.classList.toggle('invalide', !vide && !ok && !!(v('capital').trim() && v('mois').trim() && v('taux').trim()));
        if (ok) liste.push({ nom: v('nom').trim() || t('Prêt {n}', { n: i + 1 }), capital: C, mois: n, taux: ta, differe: df });
        else if (!vide) erreurs++;
      });
      return { liste: liste, erreurs: erreurs };
    }
    function calculer() {
      var zone = $('#plan-res', el);
      var pp = prets(), liste = pp.liste;
      if (!liste.length) { zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez le capital, la durée et le taux de chaque prêt.')) + '</p>'; return; }
      var ech = liste.map(function (x) {
        return calculerEcheancier({ capital: x.capital, mois: x.mois, taux: x.taux, dateDebut: '', differe: x.differe ? { mois: x.differe, type: 'partiel' } : null }, false);
      });
      var nMax = Math.max.apply(null, liste.map(function (x) { return x.mois; }));
      var lisser = $('#plan-lisser', el).checked && liste.length > 1;
      var msgLissage = '', echL = null, iPrincipal = -1;
      if (lisser) {
        iPrincipal = 0;
        liste.forEach(function (x, i) { if (x.mois > liste[iPrincipal].mois || (x.mois === liste[iPrincipal].mois && x.capital > liste[iPrincipal].capital)) iPrincipal = i; });
        var P = liste[iPrincipal];
        if (P.differe) msgLissage = t('Le lissage ne s\'applique pas quand le prêt principal a un différé.');
        else {
          var r = tauxMensuelPct(P.taux) / 100;
          var autres = [];
          for (var m = 1; m <= P.mois; m++) {
            var s = 0;
            ech.forEach(function (x, i) { if (i !== iPrincipal && x.lignes[m - 1]) s += x.lignes[m - 1].paiement; });
            autres.push(s);
          }
          var somV = 0, somO = 0, v = 1;
          for (var m2 = 1; m2 <= P.mois; m2++) { v = v / (1 + r); somV += v; somO += autres[m2 - 1] * v; }
          var T = (P.capital + somO) / somV;
          if (autres.some(function (o) { return T - o < 0; })) msgLissage = t('Lissage impossible : les autres prêts dépassent à eux seuls la mensualité lissée.');
          else {
            var reste = P.capital, lignes = [], totI = 0, negatif = 0;
            for (var m3 = 1; m3 <= P.mois; m3++) {
              var interet = roundPrec(reste * r);
              var paiement = roundPrec(T - autres[m3 - 1]);
              var principal = roundPrec(paiement - interet);
              if (m3 === P.mois) { principal = roundPrec(reste); paiement = roundPrec(interet + principal); }
              if (principal < 0) negatif++;
              reste = roundPrec(reste - principal);
              totI = roundPrec(totI + interet);
              lignes.push({ paiement: paiement, interet: interet });
            }
            echL = { lignes: lignes, totI: totI, T: roundPrec(T), negatif: negatif };
          }
        }
      }
      /* Paliers de la mensualité globale */
      var paliers = [], totalMois = [];
      for (var m4 = 1; m4 <= nMax; m4++) {
        var det = ech.map(function (x, i) {
          var l = (echL && i === iPrincipal) ? echL.lignes[m4 - 1] : x.lignes[m4 - 1];
          return l ? l.paiement : 0;
        });
        var tot = roundPrec(det.reduce(function (a, b) { return a + b; }, 0));
        totalMois.push(tot);
        var dern = paliers[paliers.length - 1];
        if (dern && Math.abs(dern.total - tot) < 0.0015 && det.every(function (x, j) { return Math.abs(x - dern.det[j]) < 0.0015; })) dern.fin = m4;
        else paliers.push({ debut: m4, fin: m4, total: tot, det: det });
      }
      var totI = ech.reduce(function (a, x, i) { return a + ((echL && i === iPrincipal) ? echL.totI : x.totI); }, 0);
      var capTotal = liste.reduce(function (a, x) { return a + x.capital; }, 0);
      var totIsans = ech.reduce(function (a, x) { return a + x.totI; }, 0);
      var html = '<div class="ra-stats" style="margin-top:14px">' +
        statDlg(t('Capital total'), fmtMoney(roundPrec(capTotal))) +
        statDlg(t('Coût des intérêts'), fmtMoney(roundPrec(totI))) +
        statDlg(t('Première mensualité globale'), fmtMoney(totalMois[0]), 'fort') +
        statDlg(t('Durée totale'), libMois(nMax)) + '</div>';
      if (echL) {
        var surcout = roundPrec(echL.totI - ech[iPrincipal].totI);
        html += '<p class="ra-detail">' + echapper(t('Mensualité lissée : {m} pendant {n}. Le lissage modifie les intérêts de {d}.', { m: fmtMoney(echL.T), n: libMois(liste[iPrincipal].mois), d: (surcout >= 0 ? '+' : '−') + fmtMoney(Math.abs(surcout)) })) + '</p>';
        if (echL.negatif) html += '<p class="ra-note">' + echapper(t('Pendant {n}, l\'échéance du prêt principal ne couvre pas ses intérêts : son capital augmente.', { n: libMois(echL.negatif) })) + '</p>';
      } else if (msgLissage) html += '<p class="ra-note alerte">' + echapper(msgLissage) + '</p>';
      if (pp.erreurs) html += '<p class="ra-note alerte">' + echapper(t('Un prêt incomplet ou invalide est ignoré (durée de 1 à 300 mois, différé plus court que la durée).')) + '</p>';
      html += '<div class="sensi-wrap"><table class="sensi-t"><thead><tr><th>' + echapper(t('Période')) + '</th>' +
        liste.map(function (x) { return '<th>' + echapper(x.nom) + '</th>'; }).join('') + '<th>' + echapper(t('Mensualité globale')) + '</th></tr></thead><tbody>' +
        paliers.map(function (pa) {
          return '<tr><td>' + echapper(pa.debut === pa.fin ? t('Mois {a}', { a: pa.debut }) : t('Mois {a} à {b}', { a: pa.debut, b: pa.fin })) + '</td>' +
            pa.det.map(function (x) { return '<td>' + (x ? echapper(fmtMoney(x)) : '—') + '</td>'; }).join('') + '<td><b>' + echapper(fmtMoney(pa.total)) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>';
      if (!echL && liste.length > 1 && !lisser) html += '<p class="ra-note">' + echapper(t('Intérêts sans lissage : {m}.', { m: fmtMoney(roundPrec(totIsans)) })) + '</p>';
      zone.innerHTML = html;
    }
    el.addEventListener('input', calculer);
    el.addEventListener('change', calculer);
    el.addEventListener('focusout', function (ev) {
      var i = ev.target;
      if (i.tagName === 'INPUT' && (i.dataset.k === 'capital' || i.dataset.k === 'taux')) { var v = lireNombre(i.value); if (isFinite(v)) i.value = fmtSaisie(v); }
    });
    el.addEventListener('click', function (ev) {
      if (ev.target.closest('#plan-ajout')) {
        var n = $$('.pret', el).length;
        if (n >= 4) { toast(t('4 prêts au maximum.'), 'info'); return; }
        $('#plan-prets', el).insertAdjacentHTML('beforeend', lignePret(n, t('Prêt {n}', { n: n + 1 })));
        calculer();
        return;
      }
      var bs = ev.target.closest('[data-suppr-pret]');
      if (bs) {
        if ($$('.pret', el).length <= 1) return;
        bs.closest('.pret').remove();
        $$('.pret', el).forEach(function (bl, i) { bl.querySelector('.pret-num').textContent = i + 1; });
        calculer();
      }
    });
    /* Pré-remplit le premier prêt avec le scénario affiché */
    var sc = scenarioActif();
    if (sc.resultat) {
      var p0 = $('.pret', el);
      $('[data-k="capital"]', p0).value = fmtSaisie(sc.entrees.capital);
      $('[data-k="mois"]', p0).value = String(sc.entrees.mois);
      $('[data-k="taux"]', p0).value = fmtSaisie(sc.entrees.taux);
    }
    calculer();
  }

  /* ===================================================================
     Comparateur d'offres bancaires (taux, frais, assurance, TEG)
     =================================================================== */
  function ouvrirOffres() {
    var sc = scenarioActif();
    var e0 = sc.entrees && sc.resultat ? sc.entrees : null;
    function carte(i) {
      return '<div class="offre" data-offre="' + i + '">' +
        '<div class="input-wrap sm offre-nom"><input type="text" data-k="nom" data-texte autocomplete="off" value="' + echapper(t('Offre {n}', { n: i + 1 })) + '" aria-label="' + echapper(t('Nom de la banque')) + '"></div>' +
        '<label><span>' + echapper(t('Taux annuel')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="taux" autocomplete="off" placeholder="' + echapper(t('Ex. 7,5')) + '"><span class="suffix">%</span></div></label>' +
        '<label><span>' + echapper(t('Frais de dossier')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="fdp" autocomplete="off" placeholder="0"><span class="suffix">%</span></div></label>' +
        '<label><span>' + echapper(t('Frais fixes')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="ff" autocomplete="off" placeholder="0"><span class="suffix">' + echapper(unite()) + '</span></div></label>' +
        '<label><span>' + echapper(t('Assurance annuelle')) + '</span><div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="as" autocomplete="off" placeholder="0"><span class="suffix">%</span></div></label>' +
        '<div class="seg sm seg-block" role="group" aria-label="' + echapper(t('Assurance calculée sur')) + '"><button type="button" data-base="initial" aria-pressed="true">' + echapper(t('Capital initial')) + '</button><button type="button" data-base="crd" aria-pressed="false">' + echapper(t('Restant dû')) + '</button></div>' +
      '</div>';
    }
    var d = ouvrirDialogue({
      titre: t('Comparer des offres'),
      sousTitre: echapper(t('Saisissez les offres reçues des banques : elles sont classées selon le coût réel et le TEG.')),
      icone: 'scale', large: true,
      corps:
        '<div class="dlg-fields">' +
          champDlg('of-c', t('Capital emprunté'), t('Ex. 50 000'), unite(), 'cash', e0 ? fmtSaisie(e0.capital) : null) +
          champDlg('of-n', t('Durée'), t('Ex. 120'), t('mois'), 'clock', e0 ? String(e0.mois) : null, 'numeric') +
        '</div>' +
        '<div class="offres">' + carte(0) + carte(1) + carte(2) + '</div>' +
        '<div id="of-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    var el = d.el, resultats = [];
    function calculer() {
      var zone = $('#of-res', el);
      var C = valeurDlg(el, 'of-c'), n = lireEntier($('#of-n', el).value);
      resultats = [];
      if (!(C > 0) || !(n >= 1 && n <= 300)) { zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Indiquez le capital et la durée, puis le taux d\'au moins deux offres.')) + '</p>'; return; }
      $$('.offre', el).forEach(function (o, i) {
        function v(k) { return lireNombre($('[data-k="' + k + '"]', o).value); }
        var ta = v('taux');
        if (!(ta >= 0 && ta <= 100)) return;
        var fdp = v('fdp'), ff = v('ff'), as = v('as');
        var base = $('[data-base][aria-pressed="true"]', o).dataset.base;
        var e = { capital: C, mois: n, taux: ta, dateDebut: '',
          frais: (fdp > 0 || ff > 0) ? { dossierPct: fdp > 0 ? fdp : 0, dossierFixe: ff > 0 ? ff : 0, garantie: 0, autres: 0 } : null,
          assurance: as > 0 ? { taux: as, base: base } : null };
        var r = calculerEcheancier(e, false);
        resultats.push({ i: i, nom: $('[data-k="nom"]', o).value.trim() || t('Offre {n}', { n: i + 1 }), e: e, r: r });
      });
      if (!resultats.length) { zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Indiquez le capital et la durée, puis le taux d\'au moins deux offres.')) + '</p>'; return; }
      var criteres = [
        [t('Mensualité (hors assurance)'), function (x) { return x.r.M1; }, fmtMoney],
        [t('Assurance la 1re échéance'), function (x) { return x.r.lignes[0].assurance; }, fmtMoney],
        [t('Mensualité avec assurance'), function (x) { return totalLigne(x.r.lignes[0]); }, fmtMoney],
        [t('Coût des intérêts'), function (x) { return x.r.totI; }, fmtMoney],
        [t('Coût de l\'assurance'), function (x) { return x.r.totAss; }, fmtMoney],
        [t('Frais'), function (x) { return x.r.frais; }, fmtMoney],
        [t('Coût du crédit'), function (x) { return x.r.coutCredit; }, fmtMoney],
        [t('TEG'), function (x) { return x.r.teg; }, function (v) { return isFinite(v) ? fmtPct(v, 3) : '—'; }]
      ];
      var plusieurs = resultats.length > 1;
      var html = '<div class="cmp-table-wrap" style="margin-top:16px"><table class="cmp"><thead><tr><th>' + echapper(t('Critère')) + '</th>' +
        resultats.map(function (x) { return '<th><span class="hd">' + echapper(x.nom) + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
        criteres.map(function (c) {
          var vals = resultats.map(c[1]), min = Math.min.apply(null, vals.filter(isFinite));
          return '<tr><td>' + echapper(c[0]) + '</td>' + resultats.map(function (x, j) {
            var best = plusieurs && isFinite(vals[j]) && Math.abs(vals[j] - min) < 0.0005 && vals.some(function (w) { return Math.abs(w - min) >= 0.0005; });
            return '<td class="' + (best ? 'best' : '') + '"><b>' + echapper(c[2](vals[j])) + '</b></td>';
          }).join('') + '</tr>';
        }).join('') +
        '<tr><td></td>' + resultats.map(function (x) { return '<td><button type="button" class="btn btn-ghost btn-sm" data-utiliser-offre="' + x.i + '">' + ico('upload', 'ico-sm') + echapper(t('Utiliser')) + '</button></td>'; }).join('') + '</tr>' +
        '</tbody></table></div>';
      if (plusieurs) {
        var meilleur = resultats.slice().sort(function (a, b) { return a.r.coutCredit - b.r.coutCredit; })[0];
        var second = resultats.slice().sort(function (a, b) { return a.r.coutCredit - b.r.coutCredit; })[1];
        html += '<div class="reco"><h4>' + ico('check', 'ico-sm') + echapper(t('Recommandation')) + '</h4><ul>' +
          '<li>' + echapper(t('L\'offre la moins chère est « {n} » : coût du crédit {c}, TEG {t}.', { n: meilleur.nom, c: fmtMoney(meilleur.r.coutCredit), t: isFinite(meilleur.r.teg) ? fmtPct(meilleur.r.teg, 3) : '—' })) + '</li>' +
          '<li>' + echapper(t('Elle fait économiser {m} par rapport à « {n} ».', { m: fmtMoney(roundPrec(second.r.coutCredit - meilleur.r.coutCredit)), n: second.nom })) + '</li>' +
          '<li>' + echapper(t('Comparez toujours le TEG : il inclut les frais et l\'assurance, contrairement au taux nominal.')) + '</li></ul></div>';
      }
      zone.innerHTML = html;
    }
    el.addEventListener('input', calculer);
    el.addEventListener('focusout', function (ev) {
      var i = ev.target;
      if (i.tagName === 'INPUT' && !i.hasAttribute('data-texte') && i.id !== 'of-n') { var v = lireNombre(i.value); if (isFinite(v)) i.value = fmtSaisie(v); }
    });
    el.addEventListener('click', function (ev) {
      var bb = ev.target.closest('[data-base]');
      if (bb) {
        $$('[data-base]', bb.parentNode).forEach(function (b) { b.setAttribute('aria-pressed', String(b === bb)); });
        calculer();
        return;
      }
      var bu = ev.target.closest('[data-utiliser-offre]');
      if (bu) {
        var x = resultats.filter(function (y) { return String(y.i) === bu.dataset.utiliserOffre; })[0];
        if (!x) return;
        sc.appliquer({ capital: x.e.capital, mois: x.e.mois, taux: x.e.taux, reduction: false, tmm: null, frais: x.e.frais, assurance: x.e.assurance });
        d.fermer();
        toast(t('Offre « {n} » appliquée au scénario {s}.', { n: x.nom, s: sc.nom }));
      }
    });
    calculer();
  }

  /* ===================================================================
     Renégociation ou rachat de crédit
     =================================================================== */
  function ouvrirRenegociation() {
    var sc = scenarioActif();
    var d = ouvrirDialogue({
      titre: t('Renégociation ou rachat'),
      sousTitre: echapper(t('Comparez votre crédit en cours avec une nouvelle offre, frais et indemnité compris.')),
      icone: 'refresh', large: true,
      corps:
        '<h3 class="ag-titre">' + echapper(t('Crédit en cours')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          champDlg('rn-crd', t('Capital restant dû'), t('Ex. 80 000'), unite(), 'cash') +
          champDlg('rn-ta', t('Taux actuel'), t('Ex. 10'), '%', 'percent') +
          champDlg('rn-n', t('Durée restante'), t('Ex. 150'), t('mois'), 'clock', null, 'numeric') +
        '</div>' +
        '<h3 class="ag-titre">' + echapper(t('Nouveau crédit')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          champDlg('rn-tn', t('Nouveau taux'), t('Ex. 8'), '%', 'percent') +
          champDlg('rn-nn', t('Nouvelle durée'), t('Ex. 150'), t('mois'), 'clock', null, 'numeric') +
          champDlg('rn-ind', t('Indemnité de remboursement anticipé'), t('Ex. 2'), '%', 'percent', '0') +
          champDlg('rn-fd', t('Frais de dossier'), t('Ex. 300'), unite(), 'coins', '0') +
          champDlg('rn-fg', t('Frais de garantie'), t('Ex. 500'), unite(), 'home', '0') +
        '</div>' +
        '<label class="check" style="margin-top:12px"><input type="checkbox" id="rn-fin"><span class="check-box" aria-hidden="true">' + ico('check', 'ico-sm') + '</span>' + echapper(t('Financer les frais et l\'indemnité dans le nouveau crédit')) + '</label>' +
        '<div id="rn-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="rn-utiliser" disabled>' + ico('upload', 'ico-sm') + echapper(t('Nouveau crédit dans le scénario {n}', { n: sc.nom })) + '</button>'
    });
    var el = d.el, res = null;
    function calculer() {
      var zone = $('#rn-res', el), btn = $('#rn-utiliser', el);
      res = null; btn.disabled = true;
      var crd = valeurDlg(el, 'rn-crd'), ta = valeurDlg(el, 'rn-ta'), n = lireEntier($('#rn-n', el).value);
      var tn = valeurDlg(el, 'rn-tn'), nn = $('#rn-nn', el).value.trim() === '' ? n : lireEntier($('#rn-nn', el).value);
      var ind = valeurDlg(el, 'rn-ind'), fd = valeurDlg(el, 'rn-fd'), fg = valeurDlg(el, 'rn-fg');
      if (!isFinite(ind)) ind = 0; if (!isFinite(fd)) fd = 0; if (!isFinite(fg)) fg = 0;
      var financer = $('#rn-fin', el).checked;
      if (!(crd > 0) || !(ta >= 0 && ta <= 100) || !(n >= 1 && n <= 300) || !(tn >= 0 && tn <= 100) || !(nn >= 1 && nn <= 300)) {
        zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez le crédit en cours et le nouveau taux : la comparaison s\'affiche aussitôt.')) + '</p>';
        return;
      }
      var cout = roundPrec(crd * ind / 100 + fd + fg);
      var actuel = calculerEcheancier({ capital: crd, mois: n, taux: ta, dateDebut: '' }, false);
      var capNv = roundPrec(crd + (financer ? cout : 0));
      var nouveau = calculerEcheancier({ capital: capNv, mois: nn, taux: tn, dateDebut: '' }, false);
      var totalActuel = actuel.totM, totalNouveau = roundPrec(nouveau.totM + (financer ? 0 : cout));
      var eco = roundPrec(totalActuel - totalNouveau);
      var gainMois = roundPrec(actuel.M1 - nouveau.M1);
      var pointMort = null;
      if (!financer && cout > 0 && gainMois > 0) pointMort = Math.ceil(cout / gainMois);
      res = { capital: capNv, mois: nn, taux: tn };
      var html = '<div class="result-box ' + (eco > 0 ? '' : 'ko') + '" style="margin-top:16px">' +
        '<div class="rb-row"><span>' + echapper(t('Coût de l\'opération (indemnité et frais)')) + '</span><b>' + echapper(fmtMoney(cout)) + '</b></div>' +
        '<div class="rb-row"><span>' + echapper(t('Mensualité')) + '</span><b>' + echapper(fmtMoney(actuel.M1) + ' → ' + fmtMoney(nouveau.M1)) + '</b></div>' +
        (pointMort ? '<div class="rb-row"><span>' + echapper(t('Frais remboursés par la baisse de mensualité après')) + '</span><b>' + echapper(libMois(pointMort)) + '</b></div>' : '') +
        '<div class="rb-main"><span>' + echapper(eco > 0 ? t('Économie nette sur toute la durée') : t('Surcoût net sur toute la durée')) + '</span><strong>' + echapper(fmtMoney(Math.abs(eco))) + '</strong></div></div>' +
        '<div class="cmp-table-wrap" style="margin-top:14px"><table class="cmp"><thead><tr><th>' + echapper(t('Critère')) + '</th><th><span class="hd">' + echapper(t('Crédit en cours')) + '</span></th><th><span class="hd">' + echapper(t('Nouveau crédit')) + '</span></th></tr></thead><tbody>' +
          '<tr><td>' + echapper(t('Capital')) + '</td><td>' + echapper(fmtMoney(crd)) + '</td><td>' + echapper(fmtMoney(capNv)) + '</td></tr>' +
          '<tr><td>' + echapper(t('Taux')) + '</td><td>' + echapper(fmtTaux(ta)) + '</td><td>' + echapper(fmtTaux(tn)) + '</td></tr>' +
          '<tr><td>' + echapper(t('Durée')) + '</td><td>' + echapper(libMois(n)) + '</td><td>' + echapper(libMois(nn)) + '</td></tr>' +
          '<tr><td>' + echapper(t('Mensualité')) + '</td><td><b>' + echapper(fmtMoney(actuel.M1)) + '</b></td><td><b>' + echapper(fmtMoney(nouveau.M1)) + '</b></td></tr>' +
          '<tr><td>' + echapper(t('Intérêts restants')) + '</td><td>' + echapper(fmtMoney(actuel.totI)) + '</td><td>' + echapper(fmtMoney(nouveau.totI)) + '</td></tr>' +
          '<tr><td>' + echapper(t('Frais et indemnité payés à part')) + '</td><td>—</td><td>' + echapper(financer ? '—' : fmtMoney(cout)) + '</td></tr>' +
          '<tr><td>' + echapper(t('Total restant à payer')) + '</td><td><b>' + echapper(fmtMoney(totalActuel)) + '</b></td><td><b>' + echapper(fmtMoney(totalNouveau)) + '</b></td></tr>' +
        '</tbody></table></div>' +
        '<p class="ra-detail">' + echapper(eco > 0 ? t('L\'opération est rentable : elle fait économiser {m}.', { m: fmtMoney(eco) }) : t('L\'opération n\'est pas rentable : elle coûte {m} de plus.', { m: fmtMoney(Math.abs(eco)) })) + '</p>' +
        (nn > n ? '<p class="ra-note">' + echapper(t('La nouvelle durée est plus longue : la mensualité baisse, mais vous payez plus longtemps.')) + '</p>' : '');
      zone.innerHTML = html;
      btn.disabled = false;
    }
    el.addEventListener('input', calculer);
    el.addEventListener('change', calculer);
    el.addEventListener('focusout', function (ev) {
      var i = ev.target;
      if (i.tagName === 'INPUT' && i.type === 'text' && !/-(n|nn)$/.test(i.id)) { var v = lireNombre(i.value); if (isFinite(v)) i.value = fmtSaisie(v); }
    });
    $('#rn-utiliser', el).addEventListener('click', function () {
      if (!res) return;
      sc.appliquer({ capital: res.capital, mois: res.mois, taux: res.taux, reduction: false, tmm: null });
      d.fermer();
      toast(t('Valeurs appliquées au scénario {n}.', { n: sc.nom }));
    });
    calculer();
    setTimeout(function () { $('#rn-crd', el).focus(); }, 40);
  }

  /* ===================================================================
     Menu « Outils »
     =================================================================== */
  var OUTILS = [
    { cle: 'capacite', nom: 'Capacité d\'emprunt', aide: 'Montant empruntable selon vos revenus', ico: 'wallet', fn: ouvrirCapacite },
    { cle: 'inverse', nom: 'Calcul inverse', aide: 'Capital, durée ou taux pour une mensualité', ico: 'calc', fn: ouvrirCalculInverse },
    { cle: 'plan', nom: 'Plan de financement', aide: 'Plusieurs prêts, paliers et lissage', ico: 'layers', fn: ouvrirPlan },
    { cle: 'offres', nom: 'Comparer des offres', aide: 'Taux, frais, assurance et TEG', ico: 'scale', fn: ouvrirOffres },
    { cle: 'renego', nom: 'Renégociation ou rachat', aide: 'Économie réelle d\'un nouveau crédit', ico: 'refresh', fn: ouvrirRenegociation },
    { cle: 'stress', nom: 'Stress test du TMM', aide: '1 000 évolutions possibles du TMM (Monte-Carlo)', ico: 'trend', fn: ouvrirStressTest },
    { cle: 'louer', nom: 'Louer ou acheter ?', aide: 'Patrimoine comparé sur la durée du crédit', ico: 'home', fn: ouvrirLouerAcheter },
    { cle: 'ocr', nom: 'Lire une offre bancaire', aide: 'Photo ou texte de l\'offre : valeurs repérées', ico: 'scan', fn: ouvrirLectureOffre },
    { cle: 'tableau', nom: 'Tableau de bord', aide: 'Statistiques des simulations enregistrées', ico: 'chart', fn: ouvrirTableauBord },
    { cle: 'audit', nom: 'Audit du tableau de la banque', aide: 'PDF ou photo du tableau : chaque ligne recalculée au millime', ico: 'scan', fn: function () { ouvrirAudit(); } },
    { cle: 'optimiseur', nom: 'Optimiseur de stratégie', aide: 'Durée, apport et versements : le crédit le moins cher', ico: 'sliders', fn: ouvrirOptimiseur },
    { cle: 'lettre', nom: 'Lettre à la banque', aide: 'Réduction de taux, remboursement anticipé (Word)', ico: 'file', fn: function () { ouvrirCourrier('reduction'); } },
    { cle: 'quand', nom: 'Quand demander la réduction ?', aide: 'Ratio à chaque échéance et économie selon la date', ico: 'down', fn: ouvrirQuandReduire },
    { cle: 'moncredit', nom: 'Mon crédit en cours', aide: 'Position actuelle, réductions à venir et rappels', ico: 'wallet', fn: ouvrirMonCredit },
    { cle: 'ab', nom: 'Comparateur A / B', aide: 'Courbes et écart cumulé des deux scénarios', ico: 'compare', fn: ouvrirComparateurAB },
    { cle: 'calendrier', nom: 'Calendrier des échéances', aide: 'Vue annuelle colorée selon la part d\'intérêts', ico: 'calendar', fn: ouvrirCalendrier },
    { cle: 'presentation', nom: 'Mode présentation', aide: 'Plein écran pour un rendez-vous client', ico: 'layers', fn: ouvrirPresentation },
    { cle: 'installer', nom: 'QR code d\'installation', aide: 'À scanner pour installer l\'application sur un téléphone', ico: 'phone', fn: ouvrirQRInstallation }
  ];

  function initialiserMenuOutils() {
    var bouton = $('#btnOutils'), menu = $('#menu-outils');
    function rendre() {
      menu.innerHTML = OUTILS.map(function (o) {
        return '<button type="button" role="menuitem" class="menu-item" data-outil="' + o.cle + '">' +
          '<span class="menu-ico">' + ico(o.ico, 'ico-sm') + '</span><span class="menu-txt"><strong>' + echapper(t(o.nom)) + '</strong><small>' + echapper(t(o.aide)) + '</small></span></button>';
      }).join('');
    }
    function fermer(focus) {
      if (menu.hidden) return;
      menu.hidden = true;
      bouton.setAttribute('aria-expanded', 'false');
      if (focus) bouton.focus();
    }
    function ouvrir() {
      rendre();
      menu.hidden = false;
      bouton.setAttribute('aria-expanded', 'true');
      var premier = menu.querySelector('.menu-item');
      if (premier) premier.focus();
    }
    bouton.addEventListener('click', function (ev) { ev.stopPropagation(); if (menu.hidden) ouvrir(); else fermer(); });
    menu.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-outil]');
      if (!b) return;
      fermer();
      OUTILS.filter(function (o) { return o.cle === b.dataset.outil; })[0].fn();
    });
    menu.addEventListener('keydown', function (ev) {
      var items = $$('.menu-item', menu), i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); fermer(true); }
      else if (ev.key === 'Tab') fermer();
    });
    document.addEventListener('click', function (ev) { if (!ev.target.closest('#menu-outils')) fermer(); });
  }
  /* ===================================================================
     Historique
     =================================================================== */
  function resumeSimulation(s) {
    var n = s.n;
    var mens = isFinite(n.mensualite) ? fmtMoney(n.mensualite) : (s.mensualite || '—');
    var total = isFinite(n.cout) ? n.cout : ((isFinite(n.capital) && isFinite(n.interets)) ? roundPrec(n.capital + n.interets) : NaN);
    return {
      capital: isFinite(n.capital) ? fmtMoney(n.capital) : (s.capital + ' TND'),
      duree: isFinite(n.mois) ? libMois(n.mois) : s.duree + ' mois',
      taux: isFinite(n.taux) ? fmtTaux(n.taux) : (s.tauxAnnuel + ' %'),
      mensualite: mens + (n.mensualite2 != null && isFinite(n.mensualite2) ? ' → ' + fmtMoney(n.mensualite2) : ''),
      interets: isFinite(n.interets) ? fmtMoney(n.interets) : (s.interets || '—'),
      total: total
    };
  }

  function ouvrirHistorique() {
    var h = lireHistorique();
    function compte() { return h.length === 1 ? t('1 simulation enregistrée') : t('{n} simulations enregistrées', { n: h.length }); }
    function contenu() {
      if (!h.length) {
        return '<div class="vide-dlg">' + ico('history') + '<strong>' + echapper(t('Aucune simulation enregistrée')) + '</strong>' + echapper(t('Cliquez sur « Calculer et enregistrer » pour conserver une simulation ici.')) + '</div>';
      }
      return '<div class="hist-list">' + h.map(function (s, i) {
        var r = resumeSimulation(s), n = s.n;
        return '<div class="hist-item" data-id="' + s.id + '">' +
          '<span class="hist-num">#' + (h.length - i) + '</span>' +
          '<div class="hist-main"><div class="l1"><strong>' + echapper(r.capital) + '</strong><span>' + echapper(s.date || '') +
            (s.scenario ? ' · ' + echapper(t('scénario {n}', { n: s.scenario })) : '') + (s.client ? ' · ' + echapper(s.client) : '') + '</span></div>' +
          '<div class="l2">' + (n.type && n.type !== 'libre' ? '<span class="tag">' + echapper(t(nomType(n.type))) + '</span>' : '') +
            '<span class="tag">' + echapper(r.duree) + '</span><span class="tag">' + echapper(r.taux) + (n.tmm ? ' · ' + echapper(t('TMM')) : '') + '</span>' +
            '<span class="tag v">' + echapper(t('Mensualité {m}', { m: r.mensualite })) + '</span><span class="tag p">' + echapper(t('Intérêts {m}', { m: r.interets })) + '</span>' +
            (n.periodicite && n.periodicite !== 1 ? '<span class="tag">' + echapper(t(infoPeriodicite(n.periodicite).nom)) + '</span>' : '') +
            (n.amort && n.amort !== 'constant' ? '<span class="tag">' + echapper(t(nomAmort(n.amort))) + '</span>' : '') +
            (n.differe ? '<span class="tag">' + echapper(t('différé {n}', { n: libMois(n.differe.mois) })) + '</span>' : '') +
            (n.ra || (n.ras && n.ras.length) || n.versement ? '<span class="tag g">' + echapper(t('Remboursement anticipé')) + '</span>' : '') +
            ((n.assurance || n.frais) && isFinite(n.teg) ? '<span class="tag">' + echapper(t('TEG {v}', { v: fmtPct(n.teg, 2) })) + '</span>' : '') +
            (s.dateDebut ? '<span class="tag">' + echapper(t('Début {d}', { d: dateCourte(s.dateDebut) || s.dateDebut })) + '</span>' : '') + '</div></div>' +
          '<div class="hist-actions"><button class="btn btn-ghost btn-sm" data-charger="' + s.id + '">' + ico('upload', 'ico-sm') + echapper(t('Charger')) + '</button>' +
          '<button class="btn btn-red btn-sm btn-icon" data-suppr="' + s.id + '" aria-label="' + echapper(t('Supprimer la simulation #{n}', { n: h.length - i })) + '" title="' + echapper(t('Supprimer')) + '">' + ico('trash', 'ico-sm') + '</button></div>' +
        '</div>';
      }).join('') + '</div>';
    }
    var d = ouvrirDialogue({
      titre: t('Historique des simulations'),
      sousTitre: '<span id="hist-compte">' + echapper(compte()) + '</span> · ' + echapper(t('{n} au maximum', { n: MAX_HISTORIQUE })),
      icone: 'history',
      large: true,
      corps: '<div id="hist-zone">' + contenu() + '</div>',
      pied: '<button class="btn btn-red" id="hist-tout"' + (h.length ? '' : ' disabled') + '>' + ico('trash', 'ico-sm') + echapper(t('Effacer tout l\'historique')) + '</button>' +
            '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    var el = d.el;
    function rafraichir() {
      $('#hist-zone', el).innerHTML = contenu();
      $('#hist-compte', el).textContent = compte();
      $('#hist-tout', el).disabled = !h.length;
    }
    el.addEventListener('click', function (ev) {
      var bc = ev.target.closest('[data-charger]');
      if (bc) {
        var s = h.filter(function (x) { return String(x.id) === bc.dataset.charger; })[0];
        if (!s) return;
        activer('a');
        scenarios.a.appliquer(valeursHistorique(s));
        d.fermer();
        toast(t('Simulation chargée dans le scénario A.'));
        return;
      }
      var bs = ev.target.closest('[data-suppr]');
      if (bs) {
        var item = bs.closest('.hist-item');
        var id = bs.dataset.suppr;
        item.classList.add('sortie');
        setTimeout(function () {
          h = h.filter(function (x) { return String(x.id) !== id; });
          ecrireHistorique(h);
          rafraichir();
        }, mouvementReduit.matches ? 0 : 220);
      }
    });
    $('#hist-tout', el).addEventListener('click', function () {
      confirmer(t('Toutes les simulations enregistrées seront effacées. Cette action est irréversible.'), { titre: t('Effacer tout l\'historique ?'), libelle: t('Tout effacer') }).then(function (ok) {
        if (!ok) return;
        stock.suppr(CLE_HISTORIQUE);
        h = [];
        rafraichir();
        toast(t('Historique effacé.'));
      });
    });
  }

  /* ===================================================================
     Comparaison de 2 à 3 simulations
     =================================================================== */
  function ouvrirComparaison() {
    var h = lireHistorique();
    if (h.length < 2) {
      toast(h.length ? t('Enregistrez au moins deux simulations pour les comparer.') : t('Aucune simulation dans l\'historique : calculez et enregistrez d\'abord vos simulations.'), 'info', 4500);
      return;
    }
    var options = h.map(function (s, i) {
      var r = resumeSimulation(s);
      return '<label class="cmp-opt"><input type="checkbox" value="' + s.id + '"><span class="box">' +
        '<strong>' + echapper(t('Simulation #{n}', { n: h.length - i })) + ' · ' + echapper(r.capital) + '</strong>' +
        '<span>' + echapper(r.duree) + ' · ' + echapper(r.taux) + ' · ' + echapper(s.date || '') + (s.client ? ' · ' + echapper(s.client) : '') + '</span></span></label>';
    }).join('');
    function compte(n) { return t('{n} / 3 sélectionnée(s)', { n: n }); }
    var d = ouvrirDialogue({
      titre: t('Comparer des simulations'),
      sousTitre: echapper(t('Sélectionnez 2 ou 3 simulations de l\'historique.')),
      icone: 'compare', large: true,
      corps: '<div class="cmp-pick">' + options + '</div><div id="cmp-res"></div>',
      pied: '<span class="cmp-count" id="cmp-count">' + echapper(compte(0)) + '</span>' +
            '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="cmp-go" disabled>' + ico('compare', 'ico-sm') + echapper(t('Comparer')) + '</button>'
    });
    var el = d.el;
    var cases = $$('.cmp-opt input', el);
    function majSelection() {
      var n = cases.filter(function (c) { return c.checked; }).length;
      cases.forEach(function (c) { c.disabled = !c.checked && n >= 3; });
      $('#cmp-count', el).textContent = compte(n);
      $('#cmp-go', el).disabled = n < 2;
    }
    cases.forEach(function (c) { c.addEventListener('change', majSelection); });

    $('#cmp-go', el).addEventListener('click', function () {
      var ids = cases.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      var choix = h.map(function (s, i) { return { s: s, num: h.length - i }; }).filter(function (x) { return ids.indexOf(String(x.s.id)) !== -1; });
      var donnees = choix.map(function (x) {
        var n = x.s.n, r = resumeSimulation(x.s);
        return { num: x.num, s: x.s, r: r, capital: n.capital, mens: n.mensualite, int: n.interets, total: r.total };
      });
      function meilleur(cle) {
        var vals = donnees.map(function (x) { return x[cle]; }).filter(isFinite);
        return vals.length ? Math.min.apply(null, vals) : NaN;
      }
      var bM = meilleur('mens'), bI = meilleur('int'), bT = meilleur('total');
      function cellule(v, best, texte) {
        return '<td class="' + (isFinite(v) && v === best && donnees.length > 1 ? 'best' : '') + '"><b>' + echapper(texte) + '</b></td>';
      }
      function ligne(lib, fn) { return '<tr><td>' + echapper(lib) + '</td>' + donnees.map(fn).join('') + '</tr>'; }
      var tb = '<div class="cmp-table-wrap"><table class="cmp"><thead><tr><th>' + echapper(t('Critère')) + '</th>' +
        donnees.map(function (x) { return '<th><span class="hd">' + echapper(t('Simulation #{n}', { n: x.num })) + '</span></th>'; }).join('') + '</tr></thead><tbody>' +
        ligne(t('Date'), function (x) { return '<td>' + echapper(x.s.date || '—') + '</td>'; }) +
        (donnees.some(function (x) { return x.s.client; }) ? ligne(t('Client'), function (x) { return '<td>' + echapper(x.s.client || '—') + '</td>'; }) : '') +
        ligne(t('Type de crédit'), function (x) { return '<td>' + echapper(x.s.n.type && x.s.n.type !== 'libre' ? t(nomType(x.s.n.type)) : '—') + '</td>'; }) +
        ligne(t('Capital emprunté'), function (x) { return '<td><b>' + echapper(x.r.capital) + '</b></td>'; }) +
        ligne(t('Durée'), function (x) { return '<td>' + echapper(x.r.duree) + '</td>'; }) +
        ligne(t('Taux d\'intérêt'), function (x) { return '<td>' + echapper(x.r.taux) + (x.s.n.tmm ? ' <small>(' + echapper(t('TMM')) + ')</small>' : '') + '</td>'; }) +
        ligne(t('Échéance'), function (x) { return cellule(x.mens, bM, x.r.mensualite + (x.s.n.periodicite && x.s.n.periodicite !== 1 ? ' (' + t(infoPeriodicite(x.s.n.periodicite).nom).toLowerCase() + ')' : '')); }) +
        ligne(t('Coût des intérêts'), function (x) { return cellule(x.int, bI, x.r.interets); }) +
        ligne(t('Coût total du crédit'), function (x) { return cellule(x.total, bT, isFinite(x.total) ? fmtMoney(x.total) : '—'); }) +
        (donnees.some(function (x) { return isFinite(x.s.n.teg); }) ? ligne(t('TEG'), function (x) { return '<td>' + echapper(isFinite(x.s.n.teg) ? fmtPct(x.s.n.teg, 3) : '—') + '</td>'; }) : '') +
        '</tbody></table></div>';

      var maxTot = Math.max.apply(null, donnees.map(function (x) { return isFinite(x.total) ? x.total : 0; })) || 1;
      tb += '<div class="cmp-bars"' + ' aria-label="' + echapper(t('Coût total du crédit, capital et intérêts')) + '">' + donnees.map(function (x) {
        var c = isFinite(x.capital) ? x.capital / maxTot * 100 : 0, i = isFinite(x.int) ? x.int / maxTot * 100 : 0;
        return '<div class="cmp-bar"><span>' + echapper(t('Simulation #{n}', { n: x.num })) + '</span><div class="trk"><span class="c" style="width:' + c + '%"></span><span class="i" style="width:' + i + '%"></span></div>' +
          '<b>' + (isFinite(x.total) ? echapper(fmtMoney(x.total)) : '—') + '</b></div>';
      }).join('') + '</div>';

      function nums(cle, best) { return donnees.filter(function (x) { return x[cle] === best; }).map(function (x) { return '#' + x.num; }).join(', '); }
      function reco(lib, cle, best) { return isFinite(best) ? '<li><strong>' + echapper(lib) + '</strong> ' + echapper(t('simulation {n} ({m})', { n: nums(cle, best), m: fmtMoney(best) })) + '</li>' : ''; }
      tb += '<div class="reco"><h4>' + ico('check', 'ico-sm') + echapper(t('Recommandation')) + '</h4><ul>' +
        reco(t('Mensualité la plus basse :'), 'mens', bM) +
        reco(t('Intérêts les plus faibles :'), 'int', bI) +
        reco(t('Coût total le plus bas :'), 'total', bT) +
        '</ul></div>';

      var zone = $('#cmp-res', el);
      zone.innerHTML = '<div class="cmp-result">' + tb + '</div>';
      zone.scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  /* ===================================================================
     Paramètres de l'agence
     =================================================================== */
  function ouvrirAgence() {
    var a = JSON.parse(JSON.stringify(agence));
    function ch(id, lib, val, ph, icone, suffixe, mode) {
      return '<div class="field"><label for="' + id + '">' + echapper(lib) + '</label><div class="input-wrap">' + ico(icone) +
        '<input id="' + id + '" type="text" inputmode="' + (mode || 'text') + '" autocomplete="off" placeholder="' + echapper(ph) + '" value="' + echapper(val) + '">' +
        (suffixe ? '<span class="suffix">' + echapper(suffixe) + '</span>' : '') + '</div></div>';
    }
    var lignesTypes = TYPES.filter(function (ty) { return ty.cle !== 'libre'; }).map(function (ty) {
      var p = a.types[ty.cle];
      return '<div class="ag-type" data-cle="' + ty.cle + '">' +
        '<span class="ag-type-nom">' + ico(ty.ico, 'ico-sm') + echapper(t(ty.nom)) + '</span>' +
        '<div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="duree" value="' + echapper(fmtSaisie(p.duree)) + '" aria-label="' + echapper(t('Durée ({n})', { n: t(ty.nom) })) + '"><span class="suffix">' + echapper(t('ans')) + '</span></div>' +
        '<div class="seg sm" role="group" aria-label="' + echapper(t('Taux ({n})', { n: t(ty.nom) })) + '">' +
          '<button type="button" data-mode="fixe" aria-pressed="' + (p.mode === 'fixe') + '">' + echapper(t('Fixe')) + '</button>' +
          '<button type="button" data-mode="tmm" aria-pressed="' + (p.mode === 'tmm') + '">' + echapper(t('TMM +')) + '</button></div>' +
        '<div class="input-wrap sm"><input type="text" inputmode="decimal" data-k="valeur" value="' + echapper(fmtSaisie(p.valeur)) + '" aria-label="' + echapper(t('Taux ou marge ({n})', { n: t(ty.nom) })) + '"><span class="suffix">%</span></div>' +
      '</div>';
    }).join('');
    function couleurA() { return /^#[0-9a-f]{6}$/i.test(a.couleur || '') ? a.couleur.toLowerCase() : '#8C5000'; }
    function apercu() {
      return a.logo ? '<img src="' + echapper(a.logo) + '" alt="' + echapper(t('Logo de l\'agence')) + '">' : '<span>' + ico('building') + echapper(t('Aucun logo')) + '</span>';
    }
    var d = ouvrirDialogue({
      titre: t('Agence et paramètres'),
      sousTitre: echapper(t('Repris sur les PDF, les impressions et les e-mails. Enregistrés dans ce navigateur.')),
      icone: 'building', large: true,
      corps:
        '<h3 class="ag-titre">' + echapper(t('Identité')) + '</h3>' +
        '<div class="ag-identite">' +
          '<div class="dlg-fields">' +
            ch('ag-nom', t('Compagnie ou agence'), a.nom, t('Ex. Agence Tunis Centre'), 'building') +
            ch('ag-cons', t('Conseiller'), a.conseiller, t('Ex. Mohamed Aziz Jaouadi'), 'user') +
            ch('ag-tel', t('Téléphone'), a.tel, t('Ex. 71 000 000'), 'phone', '', 'tel') +
          '</div>' +
          '<div class="ag-logo"><div class="ag-apercu" id="ag-apercu">' + apercu() + '</div>' +
            '<div class="ag-logo-btns"><label class="btn btn-ghost btn-sm" for="ag-fichier">' + ico('upload', 'ico-sm') + echapper(t('Choisir un logo')) + '</label>' +
            '<input type="file" id="ag-fichier" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only">' +
            '<button type="button" class="btn btn-quiet btn-sm" id="ag-retirer"' + (a.logo ? '' : ' hidden') + '>' + ico('trash', 'ico-sm') + echapper(t('Retirer')) + '</button></div></div>' +
        '</div>' +
        '<h3 class="ag-titre">' + echapper(t('Couleur principale')) + '</h3>' +
        '<div class="ag-couleurs" role="group" aria-label="' + echapper(t('Couleur principale')) + '">' + COULEURS_MARQUE.map(function (c) {
          return '<button type="button" class="ag-couleur" data-couleur="' + c.cle + '" style="background:' + c.cle + '" aria-pressed="' + (couleurA() === c.cle) + '" title="' + echapper(t(c.nom)) + '" aria-label="' + echapper(t(c.nom)) + '"></button>';
        }).join('') +
          '<label class="ag-perso">' + echapper(t('Autre :')) + '<input type="color" id="ag-couleur" value="' + couleurA() + '" aria-label="' + echapper(t('Couleur personnalisée')) + '"></label></div>' +
        '<p class="opt-note" style="margin-top:8px">' + echapper(t('Appliquée aux boutons, dégradés et au rapport client PDF.')) + '</p>' +
        '<h3 class="ag-titre">' + echapper(t('TMM de référence')) + '</h3>' +
        '<div class="ag-tmm">' + ch('ag-tmm', t('TMM actuel'), fmtSaisie(a.tmm), t('Ex. 7,5'), 'trend', '%', 'decimal') +
          '<p class="opt-note">' + echapper(t('Valeur proposée par défaut pour les crédits indexés. Mettez-la à jour avec le TMM publié par la Banque centrale de Tunisie.')) + '</p></div>' +
        '<h3 class="ag-titre">' + echapper(t('Règles d\'éligibilité')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          ch('ag-age', t('Âge maximal en fin de crédit'), String(a.ageMax), t('Ex. 70'), 'user', t('ans'), 'numeric') +
          ch('ag-end', t('Taux d\'endettement maximal'), fmtSaisie(a.endettementMax), t('Ex. 40'), 'percent', '%', 'decimal') +
          ch('ag-apm', t('Apport minimal'), fmtSaisie(a.apportMin), t('Ex. 20'), 'wallet', '%', 'decimal') +
        '</div>' +
        '<p class="opt-note" style="margin-top:8px">' + echapper(t('Utilisées pour l\'éligibilité et la capacité d\'emprunt. Apport : souvent 20 % avec épargne logement, 30 % sinon.')) + '</p>' +
        '<h3 class="ag-titre">' + echapper(t('Types de crédit préréglés')) + '</h3>' +
        '<p class="opt-note" style="margin-bottom:10px">' + echapper(t('Durée et taux appliqués quand on choisit un type dans le formulaire (taux fixe, ou marge ajoutée au TMM).')) + '</p>' +
        '<div class="ag-types">' + lignesTypes + '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Annuler')) + '</button>' +
            '<button class="btn btn-primary" id="ag-ok">' + ico('check', 'ico-sm') + echapper(t('Enregistrer')) + '</button>'
    });
    var el = d.el;
    function choisirCouleur(hex) {
      a.couleur = hex.toLowerCase();
      $$('[data-couleur]', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.couleur === a.couleur)); });
      $('#ag-couleur', el).value = a.couleur;
    }
    $('#ag-couleur', el).addEventListener('input', function () { choisirCouleur(this.value); });
    el.addEventListener('click', function (ev) {
      var bc = ev.target.closest('[data-couleur]');
      if (bc) { choisirCouleur(bc.dataset.couleur); return; }
      var bm = ev.target.closest('[data-mode]');
      if (bm) {
        var ligneT = bm.closest('.ag-type');
        a.types[ligneT.dataset.cle].mode = bm.dataset.mode;
        $$('[data-mode]', ligneT).forEach(function (b) { b.setAttribute('aria-pressed', String(b === bm)); });
      }
    });
    $('#ag-fichier', el).addEventListener('change', function () {
      var fichier = this.files && this.files[0];
      if (!fichier) return;
      if (fichier.size > 5 * 1024 * 1024) { toast(t('Image trop lourde (5 Mo maximum).'), 'erreur'); return; }
      var lecteur = new FileReader();
      lecteur.onload = function () {
        var img = new Image();
        img.onload = function () {
          var lmax = 480, hmax = 200;
          var l0 = img.naturalWidth || img.width || 400, h0 = img.naturalHeight || img.height || 200;
          var ech = Math.min(1, lmax / l0, hmax / h0);
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(l0 * ech)); cv.height = Math.max(1, Math.round(h0 * ech));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          a.logo = cv.toDataURL('image/png'); a.logoL = cv.width; a.logoH = cv.height;
          $('#ag-apercu', el).innerHTML = apercu();
          $('#ag-retirer', el).hidden = false;
        };
        img.onerror = function () { toast(t('Image illisible.'), 'erreur'); };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
    $('#ag-retirer', el).addEventListener('click', function () {
      a.logo = ''; a.logoL = 0; a.logoH = 0;
      $('#ag-apercu', el).innerHTML = apercu();
      this.hidden = true;
    });
    $('#ag-ok', el).addEventListener('click', function () {
      a.nom = $('#ag-nom', el).value.trim();
      a.conseiller = $('#ag-cons', el).value.trim();
      a.tel = $('#ag-tel', el).value.trim();
      var tmm = lireNombre($('#ag-tmm', el).value);
      if (!isFinite(tmm) || tmm > 50) { toast(t('Saisissez un TMM valide (ex. 7,5).'), 'erreur'); $('#ag-tmm', el).focus(); return; }
      a.tmm = tmm;
      var age = lireEntier($('#ag-age', el).value), end = lireNombre($('#ag-end', el).value), apm = lireNombre($('#ag-apm', el).value);
      if (!(age >= 18 && age <= 100)) { toast(t('Saisissez un âge entre 18 et 100 ans.'), 'erreur'); $('#ag-age', el).focus(); return; }
      if (!(end > 0 && end <= 100)) { toast(t('Saisissez un taux entre 1 et 100 %.'), 'erreur'); $('#ag-end', el).focus(); return; }
      if (!(apm >= 0 && apm <= 100)) { toast(t('Saisissez un taux entre 0 et 100 %.'), 'erreur'); $('#ag-apm', el).focus(); return; }
      a.ageMax = age; a.endettementMax = end; a.apportMin = apm;
      var erreur = null;
      $$('.ag-type', el).forEach(function (ligneT) {
        var p = a.types[ligneT.dataset.cle];
        var du = lireNombre($('[data-k="duree"]', ligneT).value), va = lireNombre($('[data-k="valeur"]', ligneT).value);
        if (!(du > 0 && du <= 25) || !(va >= 0 && va <= 50)) { erreur = erreur || $('[data-k="' + (!(du > 0 && du <= 25) ? 'duree' : 'valeur') + '"]', ligneT); return; }
        p.duree = du; p.valeur = va;
      });
      if (erreur) { toast(t('Vérifiez les durées (1 à 25 ans) et les taux des types de crédit.'), 'erreur'); erreur.focus(); return; }
      if (!stock.ecrire(CLE_AGENCE, JSON.stringify(a))) { toast(t('Enregistrement impossible : stockage du navigateur plein ou désactivé.'), 'erreur'); return; }
      agence = a;
      d.fermer();
      majMarque();
      appliquerMarque();
      appliquerTheme(themeCourant());
      Object.keys(scenarios).forEach(function (k) { if (scenarios[k]) scenarios[k].mettreAJour(); });
      toast(t('Paramètres de l\'agence enregistrés.'));
    });
  }

  /* Nom de l'agence affiché à côté du titre */
  function majMarque() {
    var el = $('#brand-agence');
    if (!el) return;
    el.textContent = agence.nom;
    el.hidden = !agence.nom;
  }

  /* ===================================================================
     Onglets A / B et comparatif instantané
     =================================================================== */
  function activer(k) {
    if (k === 'b' && $('#tab-b').hidden) return;
    if (k !== actif && document.startViewTransition && !mouvementReduit.matches && demarre) { transition(function () { activerDirect(k); }); return; }
    activerDirect(k);
  }
  var demarre = false;
  function activerDirect(k) {
    actif = k;
    ['a', 'b'].forEach(function (c) {
      var on = c === k;
      $('#tab-' + c).setAttribute('aria-selected', String(on));
      $('#tab-' + c).tabIndex = on ? 0 : -1;
      $('#scenario-' + c).hidden = !on;
    });
    var sc = scenarios[k];
    if (sc && sc.chart) sc.rendreGraphique();
    nav.courant = null;
    majNav();
    choisirCourant();
    ecrireEtatUrl();
  }

  function afficherB(visible) {
    $('#tab-b').hidden = !visible;
    $('#btnAjouterScenario').hidden = visible;
    if (visible) {
      if (!scenarios.b) scenarios.b = creerScenario('b', 'B');
      activer('b');
      setTimeout(function () { scenarios.b.champs.capital.focus(); }, 60);
    } else {
      activer('a');
    }
    majVersus();
  }

  function majVersus() {
    var zone = $('#versus');
    var a = scenarios.a, b = scenarios.b;
    if (!zone) return;
    if (!b || $('#tab-b').hidden || !a || !a.resultat || !b.resultat) { zone.hidden = true; zone.innerHTML = ''; return; }
    function item(lbl, va, vb) {
      var diff = roundPrec(vb - va);
      var cls = diff < 0 ? 'mieux' : (diff > 0 ? 'pire' : 'egal');
      var signe = diff > 0 ? '+' : (diff < 0 ? '−' : '');
      return '<div class="versus-item"><div class="lbl">' + echapper(lbl) + '</div><div class="vals num"><span>A ' + echapper(fmtMoney(va)) + '</span><span class="sep">·</span><span>B ' + echapper(fmtMoney(vb)) + '</span>' +
        '<span class="delta ' + cls + '">' + (diff === 0 ? echapper(t('identique')) : signe + echapper(fmtMoney(Math.abs(diff)))) + '</span></div></div>';
    }
    var ra = a.resultat, rb = b.resultat;
    zone.innerHTML = '<div class="versus-title"><strong>' + echapper(t('A contre B')) + '</strong><span>' + echapper(t('Écart de B par rapport à A')) + '</span></div>' +
      item(t('Mensualité'), ra.M1, rb.M1) + item(t('Coût des intérêts'), ra.totI, rb.totI) + item(t('Coût total'), ra.coutTotal, rb.coutTotal);
    zone.hidden = false;
  }

  /* ===================================================================
     Analyse visuelle : jauges, flux du coût, coût réel (inflation),
     voyage dans le temps
     =================================================================== */
  var CLE_INFLATION = 'inflationAnnuelle';
  function lireInflation() { var v = parseFloat(stock.lire(CLE_INFLATION, '5')); return isFinite(v) && v >= 0 && v <= 50 ? v : 5; }

  /* Jauge circulaire SVG : segments [{v, c}] sur un total, texte central */
  function jaugeSVG(segments, total, centre, sous) {
    var r = 42, circ = 2 * Math.PI * r, debut = 0, arcs = '';
    segments.forEach(function (sg) {
      var part = total > 0 ? Math.max(0, Math.min(1, sg.v / total)) : 0;
      if (part <= 0) return;
      var long = Math.max(0, part * circ - (segments.length > 1 ? 2 : 0));
      arcs += '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + sg.c + '" stroke-width="10" stroke-linecap="round"' +
        ' stroke-dasharray="' + long.toFixed(2) + ' ' + circ.toFixed(2) + '" stroke-dashoffset="' + (-debut * circ).toFixed(2) + '" transform="rotate(-90 50 50)" class="arc"/>';
      debut += part;
    });
    return '<svg viewBox="0 0 100 100" class="jauge-svg" role="img" aria-label="' + echapper(centre + ' ' + (sous || '')) + '">' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--track)" stroke-width="10"/>' + arcs +
      '<text x="50" y="' + (sous ? 48 : 55) + '" text-anchor="middle" class="j-val">' + echapper(centre) + '</text>' +
      (sous ? '<text x="50" y="63" text-anchor="middle" class="j-sous">' + echapper(sous) + '</text>' : '') + '</svg>';
  }

  /* Diagramme de flux : chaque composante du coût se déverse dans le coût total */
  function fluxSVG(r) {
    var postes = [
      { lib: t('Capital'), v: r.C, c: '#8C5000' },
      { lib: t('Intérêts'), v: r.totI, c: '#C27A1A' },
      { lib: t('Assurance'), v: r.totAss, c: '#0891b2' },
      { lib: t('Frais'), v: r.frais, c: '#f59e0b' },
      { lib: t('Indemnités'), v: r.totIndem, c: '#10b981' }
    ].filter(function (p) { return p.v > 0.0005; });
    var total = postes.reduce(function (a, p) { return a + p.v; }, 0);
    var compact = window.innerWidth < 560;
    var L = compact ? 400 : 640, H = 230, gap = 10, hUtile = H - gap * (postes.length - 1) - 20;
    var xG = compact ? 112 : 150, xD = compact ? 250 : 470, cb = compact ? 60 : 160, y = 10, yD = 10 + (H - 20 - hUtile) / 2, out = '';
    postes.forEach(function (p) {
      var h = Math.max(3, p.v / total * hUtile);
      var y0 = y, y1 = y + h, d0 = yD, d1 = yD + h;
      out += '<path d="M' + xG + ' ' + y0 + ' C' + (xG + cb) + ' ' + y0 + ' ' + (xD - cb) + ' ' + d0 + ' ' + xD + ' ' + d0 +
        ' L' + xD + ' ' + d1 + ' C' + (xD - cb) + ' ' + d1 + ' ' + (xG + cb) + ' ' + y1 + ' ' + xG + ' ' + y1 + ' Z" fill="' + p.c + '" opacity=".28" class="flux-bande"/>' +
        '<rect x="' + (xG - 8) + '" y="' + y0 + '" width="8" height="' + h + '" rx="3" fill="' + p.c + '"/>' +
        '<text x="' + (xG - 16) + '" y="' + (y0 + h / 2 - 2) + '" text-anchor="end" class="flux-lib">' + echapper(p.lib) + '</text>' +
        '<text x="' + (xG - 16) + '" y="' + (y0 + h / 2 + 13) + '" text-anchor="end" class="flux-val">' + echapper(fmtPct(p.v / total * 100, 1)) + '</text>';
      y = y1 + gap; yD = d1;
    });
    var yTot = 10 + (H - 20 - hUtile) / 2;
    out += '<rect x="' + xD + '" y="' + yTot + '" width="10" height="' + hUtile + '" rx="4" fill="url(#flux-g)"/>' +
      '<text x="' + (xD + 22) + '" y="' + (yTot + hUtile / 2 - 6) + '" class="flux-lib">' + echapper(t('Coût total')) + '</text>' +
      '<text x="' + (xD + 22) + '" y="' + (yTot + hUtile / 2 + 14) + '" class="flux-tot">' + echapper(fmtMoney(r.coutTotal)) + '</text>';
    return '<svg viewBox="0 0 ' + L + ' ' + H + '" class="flux-svg" role="img" aria-label="' + echapper(t('Composition du coût total')) + '" style="direction:ltr">' +
      '<defs><linearGradient id="flux-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8C5000"/><stop offset="1" stop-color="#C27A1A"/></linearGradient></defs>' + out + '</svg>';
  }

  /* Valeur actuelle des remboursements, actualisés au taux d'inflation */
  function valeurActuelle(r, inflation) {
    var im = Math.pow(1 + inflation / 100, 1 / 12) - 1, va = 0;
    r.lignes.forEach(function (l) {
      var flux = l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0);
      va += flux / Math.pow(1 + im, l.mois * r.p);
    });
    return roundPrec(va + r.frais);
  }

  function rendreAvance(sc) {
    var r = sc.resultat, e = sc.entrees;
    var visu = document.getElementById(sc.cle + '-visu'), temps = document.getElementById(sc.cle + '-temps');
    if (!visu || !temps || !r) return;
    /* Jauges */
    var autres = roundPrec(r.totAss + r.frais + r.totIndem);
    var total = r.C + r.totI + autres;
    var j1 = jaugeSVG([{ v: r.C, c: '#8C5000' }, { v: r.totI, c: '#C27A1A' }, { v: autres, c: '#0891b2' }], total,
      fmtPct(r.C / total * 100, 0), t('capital'));
    var teg = isFinite(r.teg) ? r.teg : e.taux;
    var j2 = jaugeSVG([{ v: teg, c: teg > 12 ? '#f43f5e' : teg > 9 ? '#f59e0b' : '#10b981' }], 20, fmtPct(teg, 2), t('TEG'));
    var j3, lib3;
    var em = e.emprunteur;
    if (em && em.revenus) {
      var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
      var endet = (totalLigne(lp) / r.p + em.charges) / em.revenus * 100;
      j3 = jaugeSVG([{ v: endet, c: endet > agence.endettementMax ? '#f43f5e' : '#10b981' }], 100, fmtPct(endet, 1), t('endettement'));
      lib3 = t('Taux d\'endettement (max. {m})', { m: fmtPct(agence.endettementMax, 0) });
    } else {
      var ratio = r.totI / r.C * 100;
      j3 = jaugeSVG([{ v: Math.min(ratio, 150), c: ratio > 80 ? '#f43f5e' : ratio > 40 ? '#f59e0b' : '#10b981' }], 150, fmtPct(ratio, 0), t('du capital'));
      lib3 = t('Intérêts rapportés au capital');
    }
    var inflation = lireInflation();
    var va = valeurActuelle(r, inflation), reel = roundPrec(va - r.C);
    visu.innerHTML =
      '<div class="ra-head"><span class="pastille visu">' + ico('sparkle', 'ico-sm') + '</span>' +
        '<div><strong>' + echapper(t('Analyse visuelle')) + '</strong><small>' + echapper(t('Composition du coût, indicateurs clés et coût réel après inflation.')) + '</small></div></div>' +
      '<div class="jauges">' +
        '<figure class="jauge-fig">' + j1 + '<figcaption>' + echapper(t('Part du capital dans le coût total')) + '</figcaption></figure>' +
        '<figure class="jauge-fig">' + j2 + '<figcaption>' + echapper(t('TEG (échelle de 0 à 20 %)')) + '</figcaption></figure>' +
        '<figure class="jauge-fig">' + j3 + '<figcaption>' + echapper(lib3) + '</figcaption></figure>' +
      '</div>' +
      '<div class="flux-zone">' + fluxSVG(r) + '</div>' +
      '<div class="inflation">' +
        '<label class="infl-champ"><span>' + echapper(t('Inflation annuelle prévue')) + '</span>' +
          '<span class="input-wrap sm"><input type="text" inputmode="decimal" data-inflation value="' + echapper(fmtSaisie(inflation)) + '" aria-label="' + echapper(t('Inflation annuelle prévue')) + '"><span class="suffix">%</span></span></label>' +
        '<div class="ra-stat"><span>' + echapper(t('Remboursements en dinars d\'aujourd\'hui')) + '</span><strong class="num">' + echapper(fmtMoney(va)) + '</strong><small>' + echapper(t('au lieu de {m} en valeur nominale', { m: fmtMoney(roundPrec(r.totM + r.frais)) })) + '</small></div>' +
        '<div class="ra-stat ' + (reel <= 0 ? 'ok' : 'fort') + '"><span>' + echapper(t('Coût réel du crédit')) + '</span><strong class="num">' + echapper(fmtMoney(reel)) + '</strong><small>' + echapper(reel <= 0 ? t('l\'inflation efface le coût des intérêts') : t('après inflation, hors capital')) + '</small></div>' +
      '</div>';
    /* Voyage dans le temps */
    if (lectureTemps && lectureTemps.sc === sc) { clearInterval(lectureTemps.id); lectureTemps = null; }
    var n = r.lignes.length;
    if (sc.tempsPos == null) {
      var auj = new Date();
      sc.tempsPos = r.debut ? r.lignes.filter(function (l) { return l.date && l.date <= auj; }).length : 0;
    }
    sc.tempsPos = Math.max(0, Math.min(n, sc.tempsPos));
    temps.innerHTML =
      '<div class="ra-head"><span class="pastille temps">' + ico('clock', 'ico-sm') + '</span>' +
        '<div><strong>' + echapper(t('Voyage dans le temps')) + '</strong><small>' + echapper(t('Faites glisser pour voir où en sera le crédit à chaque échéance.')) + '</small></div>' +
        '<button type="button" class="btn btn-ghost btn-sm temps-play" data-temps-play aria-label="' + echapper(t('Lecture')) + '">' + ico('play', 'ico-sm') + '<span>' + echapper(t('Lecture')) + '</span></button></div>' +
      '<div class="temps-corps">' +
        '<div class="temps-anneau" data-temps-anneau></div>' +
        '<div class="temps-stats" data-temps-stats></div>' +
      '</div>' +
      '<input type="range" class="range temps-range" min="0" max="' + n + '" step="1" value="' + sc.tempsPos + '" data-temps-range aria-label="' + echapper(t('Position dans le temps')) + '">' +
      '<div class="range-scale"><span>' + echapper(t('Début')) + '</span><span>' + echapper(t('Fin')) + '</span></div>';
    majTemps(sc);
  }

  function majTemps(sc) {
    var r = sc.resultat, el = document.getElementById(sc.cle + '-temps');
    if (!r || !el) return;
    var k = sc.tempsPos, n = r.lignes.length, cumP = 0, cumI = 0, cumA = 0, reste = r.C, date = r.debut;
    for (var i = 0; i < k; i++) {
      var l = r.lignes[i];
      cumP += l.principal + (l.ra ? l.ra.montant : 0); cumI += l.interet; cumA += l.assurance;
      reste = resteFin(l);
      date = l.date;
    }
    cumP = roundPrec(cumP); cumI = roundPrec(cumI); cumA = roundPrec(cumA);
    var pct = r.totP > 0 ? Math.max(0, Math.min(100, cumP / r.totP * 100)) : 0;
    var rng = $('[data-temps-range]', el);
    rng.style.setProperty('--pct', (n ? k / n * 100 : 0) + '%');
    $('[data-temps-anneau]', el).innerHTML = jaugeSVG([{ v: pct, c: 'url(#temps-g)' }], 100, fmtPct(pct, 0), t('remboursé'))
      .replace('<circle', '<defs><linearGradient id="temps-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8C5000"/><stop offset="1" stop-color="#C27A1A"/></linearGradient></defs><circle');
    var quand = k === 0 ? t('Au départ') : (date ? t('Après l\'échéance {n} · {d}', { n: k, d: moisLong(date) }) : t('Après l\'échéance {n}', { n: k }));
    $('[data-temps-stats]', el).innerHTML =
      '<p class="temps-quand">' + echapper(quand) + '</p>' +
      '<div class="temps-grille">' +
        '<div><span>' + echapper(t('Capital remboursé')) + '</span><b class="num">' + echapper(fmtMoney(cumP)) + '</b></div>' +
        '<div><span>' + echapper(t('Intérêts payés')) + '</span><b class="num">' + echapper(fmtMoney(cumI)) + '</b></div>' +
        (r.totAss > 0 ? '<div><span>' + echapper(t('Assurance payée')) + '</span><b class="num">' + echapper(fmtMoney(cumA)) + '</b></div>' : '') +
        '<div class="fort"><span>' + echapper(t('Capital restant dû')) + '</span><b class="num">' + echapper(fmtMoney(reste)) + '</b></div>' +
      '</div>';
  }

  var lectureTemps = null;
  function basculerLecture(sc, bouton) {
    if (lectureTemps) { clearInterval(lectureTemps.id); lectureTemps.bouton.classList.remove('actif'); var b0 = lectureTemps.bouton; lectureTemps = null; if (b0 === bouton) return; }
    var n = sc.resultat ? sc.resultat.lignes.length : 0;
    if (!n) return;
    if (sc.tempsPos >= n) sc.tempsPos = 0;
    var pas = Math.max(1, Math.round(n / 120));
    bouton.classList.add('actif');
    lectureTemps = { sc: sc, bouton: bouton, id: setInterval(function () {
      sc.tempsPos = Math.min(n, sc.tempsPos + pas);
      var el = document.getElementById(sc.cle + '-temps');
      var rng = el && $('[data-temps-range]', el);
      if (!rng) { clearInterval(lectureTemps.id); lectureTemps = null; return; }
      rng.value = sc.tempsPos;
      majTemps(sc);
      if (sc.tempsPos >= n) { clearInterval(lectureTemps.id); bouton.classList.remove('actif'); lectureTemps = null; }
    }, mouvementReduit.matches ? 120 : 33) };
  }

  /* ===================================================================
     Saisie en langage naturel et saisie vocale
     « 150 000 sur 20 ans à TMM + 2,5 avec 30 000 d'apport »
     =================================================================== */
  var RE_MONTANT = '(\\d{1,3}(?:[ .\\u00a0\\u202f]\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*(millions?|mille|milles|mdt|md|k|m)?(?![a-zà-ÿ\\u0600-\\u06ff])';
  function valeurMontant(nb, suffixe) {
    var s = nb.replace(/[   ]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var v = parseFloat(s);
    if (!isFinite(v)) return NaN;
    suffixe = (suffixe || '').toLowerCase();
    if (/^million/.test(suffixe) || suffixe === 'm') v *= 1e6;
    else if (/^mille/.test(suffixe) || suffixe === 'k' || suffixe === 'mdt' || suffixe === 'md') v *= 1000;
    return v;
  }
  function nombreDecimal(s) { return parseFloat(String(s).replace(',', '.')); }

  function analyserTexte(texte) {
    var s = ' ' + String(texte || '').toLowerCase()
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); })
      .replace(/[’`]/g, "'").replace(/٫/g, ',').replace(/٪/g, '%') + ' ';
    var res = {}, trouve = [];
    function retirer(m) { s = s.replace(m, ' '.repeat(m.length)); }
    var m;
    /* Type de crédit */
    if (/(maison|appartement|logement|immobili|terrain|villa|habitation|سكن|عقار|منزل|شقة)/.test(s)) res.type = 'immo';
    else if (/(voiture|auto\b|automobile|véhicule|vehicule|سيارة)/.test(s)) res.type = 'auto';
    else if (/(conso|consommation|équipement|equipement|études|etudes|mariage|استهلاك)/.test(s)) res.type = 'conso';
    /* Périodicité et amortissement */
    if (/trimestri|ثلاثي/.test(s)) res.periodicite = 3;
    else if (/semestri|سداسي/.test(s)) res.periodicite = 6;
    else if (/(échéances?|echeances?|remboursements?|paiements?) annuel|annuités|سنوية/.test(s)) res.periodicite = 12;
    if (/in fine/.test(s)) res.amort = 'infine';
    else if (/amortissement constant|dégressi|degressi/.test(s)) res.amort = 'lineaire';
    /* Différé */
    if ((m = new RegExp("(?:différé|differe|délai de grâce|delai de grace|grâce|grace|إمهال)\\D{0,15}?(\\d+)\\s*(mois|ans?|années?|شهر|أشهر|سنة|سنوات)").exec(s))) {
      res.differe = { mois: parseInt(m[1], 10) * (/an|ann|سن/.test(m[2]) ? 12 : 1), type: /total|كلي/.test(s) ? 'total' : 'partiel' };
      retirer(m[0]);
    }
    /* Assurance, frais de dossier, indemnité (pourcentages à ne pas confondre avec le taux) */
    if ((m = /assurance\D{0,20}?(\d+(?:[.,]\d+)?)\s*%/.exec(s)) || (m = /تأمين\D{0,15}?(\d+(?:[.,]\d+)?)\s*%/.exec(s))) { res.assurance = nombreDecimal(m[1]); retirer(m[0]); }
    if ((m = /frais(?: de dossier)?\D{0,15}?(\d+(?:[.,]\d+)?)\s*%/.exec(s))) { res.fraisPct = nombreDecimal(m[1]); retirer(m[0]); }
    /* TMM + marge */
    if ((m = /(?:tmm|معدل السوق النقدية|م\.س\.ن)\s*(?:à|a|de|=|:)?\s*(\d+(?:[.,]\d+)?)?\s*%?\s*\+\s*(?:marge\s*(?:de)?\s*)?(\d+(?:[.,]\d+)?)\s*%?/.exec(s))) {
      res.tmm = { tmm: m[1] ? nombreDecimal(m[1]) : NaN, marge: nombreDecimal(m[2]) };
      retirer(m[0]);
    } else if ((m = /marge\D{0,10}?(\d+(?:[.,]\d+)?)\s*%?/.exec(s))) {
      res.tmm = { tmm: NaN, marge: nombreDecimal(m[1]) };
      var mt = /tmm\D{0,8}?(\d+(?:[.,]\d+)?)/.exec(s);
      if (mt) { res.tmm.tmm = nombreDecimal(mt[1]); retirer(mt[0]); }
      retirer(m[0]);
    }
    /* Taux fixe */
    if (!res.tmm && ((m = /(?:taux|à|a|au|نسبة|بنسبة)\s*(?:de|d'intérêt|fixe)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(s)) || (m = /(\d+(?:[.,]\d+)?)\s*%/.exec(s)))) {
      res.taux = nombreDecimal(m[1]); retirer(m[0]);
    }
    /* Durée */
    if ((m = /(\d+(?:[.,]\d+)?)\s*(ans?|années?|annees?|سنة|سنوات|عام|أعوام)(?![a-zà-ÿ])/.exec(s))) { res.mois = Math.round(nombreDecimal(m[1]) * 12); retirer(m[0]); }
    else if ((m = /(\d+)\s*(mois|شهر|أشهر|شهرا|شهرًا)/.exec(s))) { res.mois = parseInt(m[1], 10); retirer(m[0]); }
    /* Prix du bien et apport */
    var reM = RE_MONTANT;
    if ((m = new RegExp("(?:apport|autofinancement|مساهمة)\\D{0,25}?" + reM).exec(s)) || (m = new RegExp(reM + "\\s*(?:dt|tnd|dinars?|د\\.?ت)?\\s*(?:d'apport|de l'apport|en apport|كمساهمة)").exec(s))) {
      res.apport = valeurMontant(m[1], m[2]); retirer(m[0]);
    }
    if ((m = new RegExp("(?:prix|bien|maison|appartement|villa|terrain|logement|voiture|véhicule|ثمن|سعر)\\D{0,25}?(?:de|à|a|:|à|بـ|ب)?\\s*" + reM).exec(s))) {
      var vp = valeurMontant(m[1], m[2]);
      if (vp >= 1000) { res.prix = vp; retirer(m[0]); }
    }
    /* Capital emprunté */
    if ((m = new RegExp("(?:emprunt\\w*|crédit|credit|prêt|pret|capital|financ\\w*|قرض|اقتراض)\\D{0,25}?(?:de|:)?\\s*" + reM).exec(s))) {
      var vc = valeurMontant(m[1], m[2]);
      if (vc >= 100) { res.capital = vc; retirer(m[0]); }
    }
    if (res.capital == null) {
      var re = new RegExp(reM, 'g'), mm;
      while ((mm = re.exec(s))) { var v = valeurMontant(mm[1], mm[2]); if (v >= 1000) { res.capital = v; break; } }
    }
    if (res.prix != null && res.apport == null && res.capital == null) { res.capital = res.prix; res.prix = null; }
    if (res.prix != null && res.apport == null && res.capital != null) {
      if (res.prix > res.capital) res.apport = roundPrec(res.prix - res.capital); else res.prix = null;
    }
    if (res.prix != null && res.apport != null && res.capital == null) res.capital = roundPrec(res.prix - res.apport);
    if (res.prix == null && res.apport != null && res.capital != null) res.prix = roundPrec(res.capital + res.apport);
    if (res.prix != null && res.apport != null && res.apport >= res.prix) { res.apport = null; res.prix = null; }
    /* Résumé de ce qui a été compris */
    if (res.capital != null) trouve.push(t('capital {m}', { m: fmtMoney(res.capital) }));
    if (res.prix != null) trouve.push(t('prix {m}', { m: fmtMoney(res.prix) }));
    if (res.apport != null) trouve.push(t('apport {m}', { m: fmtMoney(res.apport) }));
    if (res.mois != null) trouve.push(libMois(res.mois));
    if (res.tmm) trouve.push(isFinite(res.tmm.tmm) ? t('TMM {a} + {b}', { a: fmtTaux(res.tmm.tmm), b: fmtTaux(res.tmm.marge) }) : t('TMM + {m}', { m: fmtTaux(res.tmm.marge) }));
    if (res.taux != null) trouve.push(t('taux {m}', { m: fmtTaux(res.taux) }));
    if (res.periodicite) trouve.push(t(infoPeriodicite(res.periodicite).nom).toLowerCase());
    if (res.amort) trouve.push(t(nomAmort(res.amort)).toLowerCase());
    if (res.differe) trouve.push(t('différé {n}', { n: libMois(res.differe.mois) }));
    if (res.assurance != null) trouve.push(t('assurance {m}', { m: fmtTaux(res.assurance) }));
    if (res.fraisPct != null) trouve.push(t('frais de dossier {m}', { m: fmtTaux(res.fraisPct) }));
    if (res.type) trouve.push(t(nomType(res.type)).toLowerCase());
    res.resume = trouve;
    return res;
  }

  /* Remplit le scénario avec ce qui a été compris, sans effacer le reste */
  function appliquerTexte(sc, texte) {
    var res = analyserTexte(texte);
    if (!res.resume.length) { toast(t('Je n\'ai rien reconnu. Exemple : « 150 000 sur 20 ans à 9 % ».'), 'erreur', 4500); return false; }
    var e = sc.entrees;
    var v = optionsDe(e);
    v.client = undefined;
    /* Description complète (montant et durée) : les options non citées repartent de zéro */
    if ((res.capital != null || res.prix != null) && res.mois != null) {
      v.periodicite = 1; v.amort = 'constant'; v.differe = null; v.assurance = null; v.frais = null;
      v.ras = []; v.versement = null; v.indemnite = 0; v.raMode = 'duree';
    }
    v.capital = isFinite(e.capital) ? e.capital : null;
    v.mois = isFinite(e.mois) ? e.mois : null;
    v.taux = isFinite(e.taux) ? e.taux : null;
    v.dateDebut = e.dateDebut;
    v.reduction = false;
    if (res.type) v.type = res.type;
    if (res.mois != null) v.mois = Math.max(1, Math.min(300, res.mois));
    if (res.periodicite) v.periodicite = res.periodicite;
    if (res.amort) v.amort = res.amort;
    if (res.differe) v.differe = res.differe;
    if (res.tmm) {
      v.tmm = { tmm: isFinite(res.tmm.tmm) ? res.tmm.tmm : (e.tmm ? e.tmm.tmm : agence.tmm), marge: res.tmm.marge };
      v.variation = null;
    } else if (res.taux != null) { v.tmm = null; v.taux = res.taux; }
    if (res.assurance != null) v.assurance = { taux: res.assurance, base: v.assurance ? v.assurance.base : 'initial' };
    if (res.fraisPct != null) v.frais = Object.assign({ dossierPct: 0, dossierFixe: 0, garantie: 0, autres: 0 }, v.frais || {}, { dossierPct: res.fraisPct });
    if (res.prix != null && res.apport != null) v.apport = { prix: res.prix, apport: res.apport };
    else if (res.capital != null) { v.apport = null; v.capital = res.capital; }
    if (v.periodicite && v.mois && v.mois % v.periodicite !== 0) v.mois = Math.max(v.periodicite, Math.round(v.mois / v.periodicite) * v.periodicite);
    if (v.differe && v.mois && (v.differe.mois >= v.mois || v.differe.mois % (v.periodicite || 1) !== 0)) v.differe = null;
    if (v.capital == null && !v.apport) { toast(t('Indiquez au moins le montant à emprunter.'), 'erreur'); return false; }
    sc.appliquer(v);
    toast(t('Compris : {l}.', { l: res.resume.join(', ') }), 'succes', 5000);
    return true;
  }

  var reconnaissance = null;
  function vocalDisponible() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function dicter(sc, bouton) {
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { toast(t('La saisie vocale n\'est pas disponible dans ce navigateur (essayez Chrome).'), 'erreur'); return; }
    if (reconnaissance) { reconnaissance.stop(); return; }
    var rec = new R();
    rec.lang = LANGUE === 'ar' ? 'ar-TN' : 'fr-FR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    var champ = document.getElementById(sc.cle + '-nl');
    reconnaissance = rec;
    bouton.classList.add('ecoute');
    rec.onresult = function (ev) {
      var txt = '';
      for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
      champ.value = txt;
      if (ev.results[ev.results.length - 1].isFinal) appliquerTexte(sc, txt);
    };
    rec.onerror = function (ev) {
      toast(ev.error === 'not-allowed' ? t('Autorisez l\'accès au micro pour dicter votre crédit.') : t('Je n\'ai pas bien entendu, réessayez.'), 'erreur');
    };
    rec.onend = function () { reconnaissance = null; bouton.classList.remove('ecoute'); };
    try { rec.start(); toast(t('Parlez : décrivez votre crédit…'), 'info', 2500); } catch (err) { reconnaissance = null; bouton.classList.remove('ecoute'); }
  }

  /* ===================================================================
     Stress test du TMM (méthode de Monte-Carlo)
     Le TMM évolue chaque année d'une variation aléatoire (loi normale) ;
     la mensualité est recalculée à chaque révision annuelle.
     =================================================================== */
  function generateur(graine) {
    var a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function centile(trie, p) {
    if (!trie.length) return NaN;
    var i = (trie.length - 1) * p, b = Math.floor(i), h = Math.ceil(i);
    return trie[b] + (trie[h] - trie[b]) * (i - b);
  }
  function simulerStress(o) {
    var alea = generateur(o.graine || 20261001);
    function normale() { var u = 1 - alea(), v = alea(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    var annees = Math.ceil(o.mois / 12), interets = [], maxM = [], chemins = [], depasse = 0;
    for (var s = 0; s < o.n; s++) {
      var tmm = o.tmm, reste = o.capital, totI = 0, mMax = 0, M = 0, chemin = [tmm];
      for (var m = 1; m <= o.mois; m++) {
        if (m === 1 || (m - 1) % 12 === 0) {
          if (m > 1) { tmm = Math.max(o.plancher, tmm + o.tendance + o.volatilite * normale()); chemin.push(tmm); }
          M = mensualite(reste, tauxMensuelPct(tmm + o.marge), o.mois - m + 1);
          if (M > mMax) mMax = M;
        }
        var interet = roundPrec(reste * tauxMensuelPct(tmm + o.marge) / 100);
        var principal = m === o.mois ? reste : roundPrec(M - interet);
        reste = roundPrec(reste - principal);
        totI += interet;
      }
      interets.push(roundPrec(totI)); maxM.push(mMax); chemins.push(chemin);
      if (mMax > o.seuil + 0.0005) depasse++;
    }
    var bandes = [];
    for (var a = 0; a < annees; a++) {
      var vals = chemins.map(function (c) { return c[Math.min(a, c.length - 1)]; }).sort(function (x, y) { return x - y; });
      bandes.push({ p5: centile(vals, 0.05), p25: centile(vals, 0.25), p50: centile(vals, 0.5), p75: centile(vals, 0.75), p95: centile(vals, 0.95) });
    }
    var tI = interets.slice().sort(function (x, y) { return x - y; }), tM = maxM.slice().sort(function (x, y) { return x - y; });
    return { interets: interets, tI: tI, tM: tM, bandes: bandes, probaDepasse: depasse / o.n, n: o.n };
  }

  function eventailSVG(bandes, tmm0) {
    var L = 600, H = 200, g = 40, d = 12, h = 20, b = 26;
    var max = Math.max.apply(null, bandes.map(function (x) { return x.p95; }).concat([tmm0 + 1]));
    var min = Math.min.apply(null, bandes.map(function (x) { return x.p5; }).concat([Math.max(0, tmm0 - 1)]));
    var nb = bandes.length;
    function X(i) { return g + (nb > 1 ? i / (nb - 1) : 0) * (L - g - d); }
    function Y(v) { return h + (1 - (v - min) / ((max - min) || 1)) * (H - h - b); }
    function zone(bas, haut) {
      return bandes.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x[haut]).toFixed(1); }).join(' ') + ' ' +
        bandes.slice().reverse().map(function (x, j) { return 'L' + X(nb - 1 - j).toFixed(1) + ' ' + Y(x[bas]).toFixed(1); }).join(' ') + ' Z';
    }
    var med = bandes.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.p50).toFixed(1); }).join(' ');
    var axes = '';
    for (var k = 0; k <= 4; k++) {
      var v = min + (max - min) * k / 4;
      axes += '<line x1="' + g + '" x2="' + (L - d) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="grille"/>' +
        '<text x="' + (g - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="axe">' + echapper(fmtSaisie(Math.round(v * 10) / 10)) + '%</text>';
    }
    var pasA = Math.max(1, Math.ceil(nb / 8));
    for (var a = 0; a < nb; a += pasA) axes += '<text x="' + X(a).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="axe">' + echapper(t('An {n}', { n: a + 1 })) + '</text>';
    return '<svg viewBox="0 0 ' + L + ' ' + H + '" class="eventail" role="img" style="direction:ltr" aria-label="' + echapper(t('Évolution possible du TMM')) + '">' + axes +
      '<path d="' + zone('p5', 'p95') + '" class="b90"/><path d="' + zone('p25', 'p75') + '" class="b50"/>' +
      '<path d="' + med + '" class="med"/></svg>';
  }

  function histogrammeSVG(valeurs, ref) {
    var L = 600, H = 160, nbB = 24;
    var min = valeurs[0], max = valeurs[valeurs.length - 1];
    if (max - min < 1) { max = min + 1; }
    var pas = (max - min) / nbB, compte = new Array(nbB).fill(0);
    valeurs.forEach(function (v) { compte[Math.min(nbB - 1, Math.floor((v - min) / pas))]++; });
    var cMax = Math.max.apply(null, compte), lb = (L - 20) / nbB, out = '';
    compte.forEach(function (c, i) {
      var hh = c / cMax * (H - 40), x = 10 + i * lb;
      var milieu = min + (i + 0.5) * pas;
      out += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (H - 24 - hh).toFixed(1) + '" width="' + (lb - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="3" class="' + (milieu > ref ? 'h-haut' : 'h-bas') + '"/>';
    });
    var xr = 10 + Math.max(0, Math.min(1, (ref - min) / (max - min))) * (L - 20);
    out += '<line x1="' + xr.toFixed(1) + '" x2="' + xr.toFixed(1) + '" y1="6" y2="' + (H - 22) + '" class="ref"/>' +
      '<text x="' + 10 + '" y="' + (H - 6) + '" class="axe">' + echapper(fmtCompact(min)) + '</text>' +
      '<text x="' + (L - 10) + '" y="' + (H - 6) + '" text-anchor="end" class="axe">' + echapper(fmtCompact(max)) + '</text>';
    return '<svg viewBox="0 0 ' + L + ' ' + H + '" class="histo" role="img" style="direction:ltr" aria-label="' + echapper(t('Répartition du coût des intérêts')) + '">' + out + '</svg>';
  }

  function ouvrirStressTest() {
    var sc = scenarioActif();
    if (!sc.resultat) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    var e = sc.entrees;
    var tmm0 = e.tmm ? e.tmm.tmm : e.taux, marge0 = e.tmm ? e.tmm.marge : 0;
    var M0 = mensualite(e.capital, tauxMensuelPct(e.taux), e.mois);
    var d = ouvrirDialogue({
      titre: t('Stress test du TMM'),
      sousTitre: echapper(t('1 000 évolutions possibles du TMM, révisé chaque année : quel risque sur votre mensualité ?')),
      icone: 'trend', large: true,
      corps:
        '<div class="dlg-fields trois">' +
          champDlg('st-tmm', t('TMM de départ'), t('Ex. 7,5'), '%', 'trend', fmtSaisie(tmm0)) +
          champDlg('st-marge', t('Marge de la banque'), t('Ex. 2,5'), '%', 'percent', fmtSaisie(marge0)) +
          champDlg('st-vol', t('Volatilité annuelle'), t('Ex. 0,75'), t('pts'), 'sliders', '0,75') +
          champDlg('st-tend', t('Tendance par an'), t('Ex. 0'), t('pts'), 'trend', '0', 'text') +
          champDlg('st-plancher', t('TMM plancher'), t('Ex. 0'), '%', 'down', '0') +
          champDlg('st-seuil', t('Mensualité à ne pas dépasser'), t('Ex. 1 500'), unite(), 'cash', fmtSaisie(roundPrec(M0 * 1.15))) +
        '</div>' +
        '<p class="opt-note" style="margin-top:8px">' + echapper(t('Calcul sur le capital et la durée du scénario, à échéances mensuelles constantes. Résultats reproductibles (graine fixe).')) + '</p>' +
        '<div id="st-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="st-go">' + ico('refresh', 'ico-sm') + echapper(t('Relancer la simulation')) + '</button>'
    });
    var el = d.el, graine = 20261001;
    function lancer() {
      var o = {
        capital: e.capital, mois: e.mois, n: 1000, graine: graine,
        tmm: valeurDlg(el, 'st-tmm'), marge: valeurDlg(el, 'st-marge'), volatilite: valeurDlg(el, 'st-vol'),
        tendance: lireNombreSigne($('#st-tend', el).value), plancher: valeurDlg(el, 'st-plancher'), seuil: valeurDlg(el, 'st-seuil')
      };
      var zone = $('#st-res', el);
      if (![o.tmm, o.marge, o.volatilite, o.plancher, o.seuil].every(function (x) { return isFinite(x) && x >= 0; }) || !isFinite(o.tendance) || o.volatilite > 10) {
        zone.innerHTML = '<p class="field-err" style="margin-top:12px">' + echapper(t('Vérifiez les valeurs : nombres positifs, volatilité de 0 à 10 points.')) + '</p>';
        return;
      }
      var r = simulerStress(o);
      var ref = calculerEcheancier({ capital: e.capital, mois: e.mois, taux: o.tmm + o.marge, dateDebut: '' }, false);
      var risque = r.probaDepasse;
      zone.innerHTML =
        '<div class="ra-stats" style="margin-top:14px">' +
          statDlg(t('Risque de dépasser {m}', { m: fmtMoney(o.seuil) }), fmtPct(risque * 100, 1), risque > 0.25 ? 'ko' : (risque > 0.05 ? '' : 'ok'), t('des 1 000 scénarios')) +
          statDlg(t('Mensualité maximale médiane'), fmtMoney(centile(r.tM, 0.5)), '', t('9 fois sur 10 sous {m}', { m: fmtMoney(centile(r.tM, 0.9)) })) +
          statDlg(t('Intérêts (médiane)'), fmtMoney(centile(r.tI, 0.5)), '', t('{a} si le TMM ne bouge pas', { a: fmtMoney(ref.totI) })) +
          statDlg(t('Intérêts (scénario défavorable)'), fmtMoney(centile(r.tI, 0.95)), 'ko', t('1 cas sur 20 au-delà')) +
        '</div>' +
        '<h3 class="ag-titre">' + echapper(t('Évolution possible du TMM')) + '</h3>' +
        '<div class="graphe-zone">' + eventailSVG(r.bandes, o.tmm) + '</div>' +
        '<p class="legende-g"><span class="lg b90"></span>' + echapper(t('9 cas sur 10')) + ' <span class="lg b50"></span>' + echapper(t('1 cas sur 2')) + ' <span class="lg med"></span>' + echapper(t('Médiane')) + '</p>' +
        '<h3 class="ag-titre">' + echapper(t('Répartition du coût des intérêts')) + '</h3>' +
        '<div class="graphe-zone">' + histogrammeSVG(r.tI, ref.totI) + '</div>' +
        '<p class="legende-g"><span class="lg h-bas"></span>' + echapper(t('moins cher que si le TMM restait stable')) + ' <span class="lg h-haut"></span>' + echapper(t('plus cher')) + '</p>';
    }
    $('#st-go', el).addEventListener('click', function () { graine = (graine * 1103515245 + 12345) >>> 0; lancer(); });
    el.addEventListener('input', function () { clearTimeout(el._t); el._t = setTimeout(lancer, 250); });
    lancer();
  }

  /* ===================================================================
     Louer ou acheter ?
     =================================================================== */
  function ouvrirLouerAcheter() {
    var sc = scenarioActif(), e = sc.entrees || {};
    var prix0 = e.apport ? e.apport.prix : (isFinite(e.capital) ? roundPrec(e.capital * 1.25) : null);
    var apport0 = e.apport ? e.apport.apport : (prix0 ? roundPrec(prix0 * 0.2) : null);
    var d = ouvrirDialogue({
      titre: t('Louer ou acheter ?'),
      sousTitre: echapper(t('Compare votre patrimoine si vous achetez à crédit ou si vous restez locataire en plaçant votre apport.')),
      icone: 'home', large: true,
      corps:
        '<h3 class="ag-titre">' + echapper(t('Achat')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          champDlg('la-prix', t('Prix du bien'), t('Ex. 250 000'), unite(), 'home', prix0 != null ? fmtSaisie(prix0) : null) +
          champDlg('la-apport', t('Apport personnel'), t('Ex. 50 000'), unite(), 'wallet', apport0 != null ? fmtSaisie(apport0) : null) +
          champDlg('la-frais', t('Frais d\'acquisition'), t('Ex. 5'), '%', 'coins', '5') +
          champDlg('la-taux', t('Taux du crédit'), t('Ex. 9'), '%', 'percent', isFinite(e.taux) ? fmtSaisie(e.taux) : '9') +
          champDlg('la-duree', t('Durée du crédit'), t('Ex. 20'), t('ans'), 'clock', isFinite(e.mois) ? fmtSaisie(Math.round(e.mois / 12)) : '20', 'numeric') +
          champDlg('la-charges', t('Charges du propriétaire'), t('Ex. 1'), t('% / an'), 'sliders', '1') +
        '</div>' +
        '<h3 class="ag-titre">' + echapper(t('Location et marché')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          champDlg('la-loyer', t('Loyer mensuel'), t('Ex. 900'), unite(), 'calendar') +
          champDlg('la-hloyer', t('Hausse des loyers'), t('Ex. 4'), t('% / an'), 'trend', '4') +
          champDlg('la-hbien', t('Revalorisation du bien'), t('Ex. 3'), t('% / an'), 'trend', '3') +
          champDlg('la-epargne', t('Rendement de l\'épargne'), t('Ex. 6'), t('% / an'), 'coins', '6') +
        '</div>' +
        '<div id="la-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    var el = d.el;
    function calculer() {
      var zone = $('#la-res', el);
      var prix = valeurDlg(el, 'la-prix'), apport = valeurDlg(el, 'la-apport'), fr = valeurDlg(el, 'la-frais'), ta = valeurDlg(el, 'la-taux');
      var ans = lireEntier($('#la-duree', el).value), ch = valeurDlg(el, 'la-charges'), loyer = valeurDlg(el, 'la-loyer');
      var hl = valeurDlg(el, 'la-hloyer'), hb = lireNombreSigne($('#la-hbien', el).value), ep = valeurDlg(el, 'la-epargne');
      if (!(prix > 0) || !(apport >= 0) || apport >= prix || !(ans >= 1 && ans <= 30) || !(ta >= 0) || !(loyer > 0) || ![fr, ch, hl, hb, ep].every(isFinite)) {
        zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez le prix, l\'apport, la durée et le loyer : la comparaison s\'affiche aussitôt.')) + '</p>';
        return;
      }
      var mois = ans * 12, credit = prix - apport;
      var ech = calculerEcheancier({ capital: credit, mois: mois, taux: ta, dateDebut: '' }, false);
      var rEp = Math.pow(1 + ep / 100, 1 / 12) - 1;
      var portefeuille = apport + prix * fr / 100, valeur = prix, loyerM = loyer, points = [{ an: 0, achat: valeur - credit, location: portefeuille }];
      var pointMort = null;
      for (var m = 1; m <= mois; m++) {
        var l = ech.lignes[m - 1];
        var sortieAchat = l.paiement + valeur * ch / 100 / 12;
        portefeuille = portefeuille * (1 + rEp) + (sortieAchat - loyerM);
        valeur *= Math.pow(1 + hb / 100, 1 / 12);
        if (m % 12 === 0) {
          loyerM *= 1 + hl / 100;
          var pa = valeur - l.reste, pl = portefeuille;
          points.push({ an: m / 12, achat: pa, location: pl });
          if (pointMort === null && pa >= pl) pointMort = m / 12;
        }
      }
      var fin = points[points.length - 1], ecart = fin.achat - fin.location;
      var verdict = ecart >= 0
        ? t('Acheter est plus avantageux : au bout de {n} ans, votre patrimoine est supérieur de {m}.', { n: ans, m: fmtMoney(roundPrec(ecart)) })
        : t('Rester locataire est plus avantageux : au bout de {n} ans, votre patrimoine est supérieur de {m}.', { n: ans, m: fmtMoney(roundPrec(-ecart)) });
      var lignes = points.filter(function (p) { return p.an === 1 || p.an % 5 === 0 || p.an === ans; });
      zone.innerHTML =
        '<div class="result-box ' + (ecart >= 0 ? '' : 'ko') + '" style="margin-top:16px">' +
          '<div class="rb-row"><span>' + echapper(t('Mensualité du crédit')) + '</span><b>' + echapper(fmtMoney(ech.M1)) + '</b></div>' +
          '<div class="rb-row"><span>' + echapper(t('Loyer de départ')) + '</span><b>' + echapper(fmtMoney(loyer)) + '</b></div>' +
          '<div class="rb-row"><span>' + echapper(t('L\'achat devient rentable')) + '</span><b>' + echapper(pointMort ? t('la {n}e année', { n: pointMort }) : t('pas sur cette durée')) + '</b></div>' +
          '<div class="rb-main"><span>' + echapper(t('Verdict')) + '</span><strong style="font-size:18px;line-height:1.35">' + echapper(verdict) + '</strong></div></div>' +
        '<div class="graphe-zone" style="margin-top:14px">' + courbesSVG(points) + '</div>' +
        '<p class="legende-g"><span class="lg achat"></span>' + echapper(t('Patrimoine si vous achetez (bien − capital restant dû)')) + ' <span class="lg loc"></span>' + echapper(t('Patrimoine si vous louez (épargne placée)')) + '</p>' +
        '<div class="cmp-table-wrap" style="margin-top:10px"><table class="cmp"><thead><tr><th>' + echapper(t('Année')) + '</th><th>' + echapper(t('Si vous achetez')) + '</th><th>' + echapper(t('Si vous louez')) + '</th><th>' + echapper(t('Écart')) + '</th></tr></thead><tbody>' +
          lignes.map(function (p) {
            var ec = p.achat - p.location;
            return '<tr><td>' + echapper(p.an === 0 ? t('Au départ') : t('Année {n}', { n: p.an })) + '</td><td>' + echapper(fmtMoney(roundPrec(p.achat))) + '</td><td>' + echapper(fmtMoney(roundPrec(p.location))) + '</td>' +
              '<td class="' + (ec >= 0 ? 'best' : '') + '"><b>' + echapper((ec >= 0 ? '+' : '−') + fmtMoney(roundPrec(Math.abs(ec)))) + '</b></td></tr>';
          }).join('') + '</tbody></table></div>' +
        '<p class="ra-note">' + echapper(t('Hypothèses simplifiées : l\'écart entre les dépenses d\'achat et le loyer est épargné (ou prélevé) chaque mois au rendement indiqué.')) + '</p>';
    }
    el.addEventListener('input', function () { clearTimeout(el._t); el._t = setTimeout(calculer, 120); });
    el.addEventListener('focusout', function (ev) {
      var i = ev.target;
      if (i.tagName === 'INPUT' && i.id !== 'la-duree' && i.id !== 'la-hbien') { var v = lireNombre(i.value); if (isFinite(v)) i.value = fmtSaisie(v); }
    });
    calculer();
    setTimeout(function () { $('#la-loyer', el).focus(); }, 40);
  }

  function courbesSVG(points) {
    var L = 600, H = 220, g = 64, d = 14, h = 14, b = 28;
    var vals = points.reduce(function (a, p) { return a.concat([p.achat, p.location]); }, []);
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals.concat([0]));
    var nb = points.length - 1 || 1;
    function X(i) { return g + i / nb * (L - g - d); }
    function Y(v) { return h + (1 - (v - min) / ((max - min) || 1)) * (H - h - b); }
    function ligne(cle) { return points.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[cle]).toFixed(1); }).join(' '); }
    var axes = '';
    for (var k = 0; k <= 4; k++) {
      var v = min + (max - min) * k / 4;
      axes += '<line x1="' + g + '" x2="' + (L - d) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="grille"/>' +
        '<text x="' + (g - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="axe">' + echapper(fmtCompact(v)) + '</text>';
    }
    var pas = Math.max(1, Math.ceil(nb / 8));
    for (var i = 0; i <= nb; i += pas) axes += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="axe">' + echapper(t('An {n}', { n: points[i].an })) + '</text>';
    return '<svg viewBox="0 0 ' + L + ' ' + H + '" class="courbes" role="img" style="direction:ltr" aria-label="' + echapper(t('Patrimoine selon le choix')) + '">' + axes +
      '<path d="' + ligne('location') + '" class="c-loc"/><path d="' + ligne('achat') + '" class="c-achat"/></svg>';
  }

  /* ===================================================================
     Lecture d'une offre bancaire : photo (reconnaissance de texte) ou
     texte collé. Les valeurs trouvées restent modifiables.
     =================================================================== */
  var URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  function chargerScript(url) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = url; s.async = true; s.onload = ok; s.onerror = function () { ko(new Error('chargement')); };
      document.head.appendChild(s);
    });
  }

  function analyserOffre(texte) {
    var s = ' ' + String(texte || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ') + ' ';
    var bas = s.toLowerCase(), r = {}, m;
    function num(x) { return nombreDecimal(String(x).replace(/\s/g, '')); }
    if ((m = /t\.?e\.?g\.?[^\d\n]{0,40}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas)) || (m = /taux (?:annuel )?effectif global[^\d\n]{0,30}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas))) r.teg = num(m[1]);
    if ((m = /tmm\s*\+\s*(\d{1,2}(?:[.,]\d{1,4})?)\s*%?/.exec(bas))) r.marge = num(m[1]);
    if ((m = /taux(?: d'intérêt| d'interet| nominal| annuel| débiteur| debiteur| fixe)*[^\d\n%]{0,30}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas.replace(/taux (?:annuel )?effectif global[^\n]*/g, ' ')))) r.taux = num(m[1]);
    if (r.marge != null && r.taux === r.marge) delete r.taux;
    if ((m = /(?:durée|duree)[^\d\n]{0,25}?(\d{1,3})\s*(mois|ans?|années?)/.exec(bas))) r.mois = parseInt(m[1], 10) * (/an/.test(m[2]) ? 12 : 1);
    else if ((m = /(\d{1,3})\s*(mensualités|mensualites|échéances|echeances)/.exec(bas))) r.mois = parseInt(m[1], 10);
    var reM = '(\\d{1,3}(?:[ .\\u00a0]\\d{3})+(?:,\\d{1,3})?|\\d{4,}(?:[.,]\\d{1,3})?)';
    if ((m = new RegExp("(?:montant|capital)(?: du| de)?(?: prêt| pret| crédit| credit| financement| emprunté| emprunte)?[^\\d\\n]{0,25}?" + reM).exec(bas))) r.capital = valeurMontant(m[1]);
    if ((m = new RegExp("frais de dossier[^\\d\\n]{0,25}?(\\d{1,2}(?:[.,]\\d{1,3})?)\\s*%").exec(bas))) r.fraisPct = num(m[1]);
    else if ((m = new RegExp("frais de dossier[^\\d\\n]{0,25}?" + reM).exec(bas))) r.fraisFixe = valeurMontant(m[1]);
    if ((m = /assurance[^\d\n]{0,40}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/.exec(bas))) r.assurance = num(m[1]);
    if ((m = new RegExp("(?:mensualité|mensualite|échéance|echeance)[^\\d\\n]{0,25}?" + reM).exec(bas))) r.mensualite = valeurMontant(m[1]);
    return r;
  }

  function ouvrirLectureOffre() {
    var sc = scenarioActif();
    var d = ouvrirDialogue({
      titre: t('Lire une offre bancaire'),
      sousTitre: echapper(t('Photographiez l\'offre ou collez son texte : le taux, la durée, le montant et les frais sont repérés automatiquement.')),
      icone: 'scan', large: true,
      corps:
        '<div class="ocr-choix">' +
          '<label class="ocr-photo" for="ocr-fichier">' + ico('camera') + '<strong>' + echapper(t('Prendre ou choisir une photo')) + '</strong><small>' + echapper(t('Reconnaissance du texte dans le navigateur (première fois : téléchargement d\'environ 5 Mo).')) + '</small></label>' +
          '<input type="file" id="ocr-fichier" accept="image/*" capture="environment" class="sr-only">' +
          '<div class="ocr-texte"><label for="ocr-zone">' + echapper(t('Ou collez le texte de l\'offre')) + '</label><textarea id="ocr-zone" rows="5" placeholder="' + echapper(t('Ex. Montant du prêt : 120 000 DT · Durée : 180 mois · Taux : TMM + 2,75 % · Frais de dossier : 1 %')) + '"></textarea></div>' +
        '</div>' +
        '<div class="ocr-progres" id="ocr-progres" hidden><div class="ocr-barre"><span id="ocr-barre"></span></div><small id="ocr-etat"></small></div>' +
        '<div id="ocr-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-primary" id="ocr-appliquer" disabled>' + ico('upload', 'ico-sm') + echapper(t('Utiliser dans le scénario {n}', { n: sc.nom })) + '</button>'
    });
    var el = d.el, trouve = null;
    function afficher(res) {
      trouve = res;
      var champs = [
        ['capital', t('Capital emprunté'), unite()], ['mois', t('Durée'), t('mois')], ['taux', t('Taux d\'intérêt annuel'), '%'],
        ['marge', t('Marge (TMM +)'), '%'], ['fraisPct', t('Frais de dossier'), '%'], ['fraisFixe', t('Frais de dossier fixes'), unite()],
        ['assurance', t('Assurance annuelle'), '%'], ['teg', t('TEG annoncé'), '%'], ['mensualite', t('Mensualité annoncée'), unite()]
      ];
      var n = champs.filter(function (c) { return res[c[0]] != null && isFinite(res[c[0]]); }).length;
      $('#ocr-res', el).innerHTML = (n ? '<h3 class="ag-titre">' + echapper(t('Valeurs repérées ({n})', { n: n })) + '</h3>' : '<p class="field-err" style="margin-top:12px">' + echapper(t('Aucune valeur reconnue : vérifiez la photo ou collez le texte.')) + '</p>') +
        '<div class="dlg-fields trois">' + champs.map(function (c) {
          var v = res[c[0]];
          return '<div class="field' + (v != null && isFinite(v) ? ' trouve' : '') + '"><label for="ocr-' + c[0] + '">' + echapper(c[1]) + '</label><div class="input-wrap sm"><input id="ocr-' + c[0] + '" type="text" inputmode="decimal" value="' + (v != null && isFinite(v) ? echapper(fmtSaisie(v)) : '') + '"><span class="suffix">' + echapper(c[2]) + '</span></div></div>';
        }).join('') + '</div>' +
        (res.teg && res.taux ? '<p class="opt-note" style="margin-top:8px">' + echapper(t('Après application, comparez le TEG calculé par le simulateur avec le TEG annoncé ({v}).', { v: fmtTaux(res.teg) })) + '</p>' : '');
      $('#ocr-appliquer', el).disabled = !n;
    }
    $('#ocr-zone', el).addEventListener('input', function () { clearTimeout(el._t); var v = this.value; el._t = setTimeout(function () { afficher(analyserOffre(v)); }, 250); });
    $('#ocr-fichier', el).addEventListener('change', function () {
      var fichier = this.files && this.files[0];
      if (!fichier) return;
      var prog = $('#ocr-progres', el), barre = $('#ocr-barre', el), etat = $('#ocr-etat', el);
      prog.hidden = false; barre.style.width = '3%'; etat.textContent = t('Chargement de la reconnaissance de texte…');
      var pret = window.Tesseract ? Promise.resolve() : chargerScript(URL_TESSERACT);
      pret.then(function () {
        return window.Tesseract.recognize(fichier, 'fra', {
          logger: function (m) {
            if (m && typeof m.progress === 'number') barre.style.width = Math.max(3, Math.round(m.progress * 100)) + '%';
            if (m && m.status) etat.textContent = m.status === 'recognizing text' ? t('Lecture du texte…') : t('Préparation…');
          }
        });
      }).then(function (out) {
        var texte = out && out.data ? out.data.text : '';
        $('#ocr-zone', el).value = texte;
        barre.style.width = '100%'; etat.textContent = t('Texte lu : vérifiez les valeurs ci-dessous.');
        afficher(analyserOffre(texte));
      }).catch(function () {
        prog.hidden = true;
        toast(t('Lecture de la photo impossible (connexion requise la première fois). Collez le texte de l\'offre.'), 'erreur', 5000);
      });
    });
    $('#ocr-appliquer', el).addEventListener('click', function () {
      function v(id) { var i = $('#ocr-' + id, el); return i && i.value.trim() !== '' ? lireNombre(i.value) : NaN; }
      var C = v('capital'), n = lireEntier($('#ocr-mois', el).value), ta = v('taux'), mg = v('marge');
      var base = sc.entrees || {};
      var val = Object.assign(optionsDe(base), { reduction: false, client: undefined, dateDebut: base.dateDebut });
      val.capital = isFinite(C) ? C : (isFinite(base.capital) ? base.capital : null);
      val.mois = n >= 1 && n <= 300 ? n : (isFinite(base.mois) ? base.mois : null);
      val.periodicite = 1; val.differe = null; val.apport = null;
      if (isFinite(mg)) { val.tmm = { tmm: base.tmm ? base.tmm.tmm : agence.tmm, marge: mg }; val.variation = null; }
      else if (isFinite(ta)) { val.tmm = null; val.taux = ta; }
      else val.taux = isFinite(base.taux) ? base.taux : null;
      var fp = v('fraisPct'), ff = v('fraisFixe'), as = v('assurance');
      if (isFinite(fp) || isFinite(ff)) val.frais = { dossierPct: isFinite(fp) ? fp : 0, dossierFixe: isFinite(ff) ? ff : 0, garantie: 0, autres: 0 };
      if (isFinite(as)) val.assurance = { taux: as, base: 'initial' };
      if (val.capital == null || val.mois == null || (val.taux == null && !val.tmm)) { toast(t('Il manque le capital, la durée ou le taux : complétez les champs.'), 'erreur'); return; }
      sc.appliquer(val);
      d.fermer();
      toast(t('Offre appliquée au scénario {n}.', { n: sc.nom }));
    });
  }

  /* ===================================================================
     Tableau de bord de l'agence (à partir de l'historique local)
     =================================================================== */
  function ouvrirTableauBord() {
    var h = lireHistorique().filter(function (s) { return s.n && isFinite(s.n.capital); });
    if (!h.length) { toast(t('Aucune simulation dans l\'historique : calculez et enregistrez d\'abord vos simulations.'), 'info', 4500); return; }
    function moy(f) { var v = h.map(f).filter(isFinite); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : NaN; }
    var total = h.reduce(function (a, s) { return a + s.n.capital; }, 0);
    var parType = {};
    h.forEach(function (s) { var k = s.n.type || 'libre'; parType[k] = (parType[k] || 0) + 1; });
    var parMois = {}, auj = new Date();
    for (var i = 11; i >= 0; i--) { var dm = new Date(auj.getFullYear(), auj.getMonth() - i, 1); parMois[dm.getFullYear() + '-' + dm.getMonth()] = { d: dm, n: 0 }; }
    h.forEach(function (s) { var dt = new Date(s.id); var k = dt.getFullYear() + '-' + dt.getMonth(); if (parMois[k]) parMois[k].n++; });
    var tranches = [[0, 20000], [20000, 50000], [50000, 100000], [100000, 200000], [200000, Infinity]];
    var parTranche = tranches.map(function (tr) { return h.filter(function (s) { return s.n.capital >= tr[0] && s.n.capital < tr[1]; }).length; });
    function barres(items) {
      var max = Math.max.apply(null, items.map(function (x) { return x.v; })) || 1;
      return '<div class="tb-barres">' + items.map(function (x) {
        return '<div class="tb-barre"><span class="tb-lib">' + echapper(x.lib) + '</span><span class="tb-piste"><span style="width:' + (x.v / max * 100) + '%"></span></span><b class="num">' + x.v + '</b></div>';
      }).join('') + '</div>';
    }
    var mois = Object.keys(parMois).map(function (k) { return parMois[k]; });
    var maxM = Math.max.apply(null, mois.map(function (x) { return x.n; })) || 1;
    ouvrirDialogue({
      titre: t('Tableau de bord'),
      sousTitre: echapper(h.length === 1 ? t('1 simulation enregistrée dans ce navigateur.') : t('{n} simulations enregistrées dans ce navigateur (les 200 plus récentes).', { n: h.length })),
      icone: 'chart', large: true,
      corps:
        '<div class="ra-stats">' +
          statDlg(t('Simulations'), String(h.length), 'fort') +
          statDlg(t('Montant total simulé'), fmtMoney(roundPrec(total))) +
          statDlg(t('Capital moyen'), fmtMoney(roundPrec(total / h.length))) +
          statDlg(t('Durée moyenne'), libMois(Math.round(moy(function (s) { return s.n.mois; })))) +
        '</div>' +
        '<div class="ra-stats" style="margin-top:10px">' +
          statDlg(t('Taux moyen'), fmtTaux(Math.round(moy(function (s) { return s.n.taux; }) * 100) / 100)) +
          statDlg(t('TEG moyen'), isFinite(moy(function (s) { return s.n.teg; })) ? fmtPct(moy(function (s) { return s.n.teg; }), 2) : '—') +
          statDlg(t('Mensualité moyenne'), fmtMoney(roundPrec(moy(function (s) { return s.n.mensualite; })))) +
          statDlg(t('Avec remboursement anticipé'), String(h.filter(function (s) { return (s.n.ras && s.n.ras.length) || s.n.ra || s.n.versement; }).length)) +
        '</div>' +
        '<div class="tb-grille">' +
          '<section><h3 class="ag-titre">' + echapper(t('Simulations par mois')) + '</h3><div class="tb-colonnes">' + mois.map(function (x) {
            return '<div class="tb-col"><span class="tb-c" style="height:' + (x.n / maxM * 100) + '%" title="' + x.n + '"></span><b class="num">' + x.n + '</b><small>' + echapper(x.d.toLocaleDateString(enArabe() ? 'ar-TN-u-nu-latn' : 'fr-FR', { month: 'short' })) + '</small></div>';
          }).join('') + '</div></section>' +
          '<section><h3 class="ag-titre">' + echapper(t('Par type de crédit')) + '</h3>' + barres(Object.keys(parType).map(function (k) { return { lib: t(nomType(k)), v: parType[k] }; }).sort(function (a, b) { return b.v - a.v; })) + '</section>' +
          '<section><h3 class="ag-titre">' + echapper(t('Par montant emprunté')) + '</h3>' + barres(tranches.map(function (tr, i) {
            return { lib: tr[1] === Infinity ? t('{a} et plus', { a: fmtCompact(tr[0]) }) : fmtCompact(tr[0]) + ' – ' + fmtCompact(tr[1]), v: parTranche[i] };
          })) + '</section>' +
        '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
  }

  /* ===================================================================
     Rapport client premium (PDF multipage, en français)
     =================================================================== */
  function conseils(sc) {
    var e = sc.entrees, r = sc.resultat, out = [];
    var em = e.emprunteur;
    var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
    var mensuel = totalLigne(lp) / r.p;
    if (em && em.revenus) {
      var endet = (mensuel + em.charges) / em.revenus * 100;
      if (endet > agence.endettementMax) out.push(t('Votre taux d\'endettement atteindrait {p}, au-delà des {m} généralement admis. Allonger la durée, augmenter l\'apport ou réduire le montant permettrait de passer sous ce seuil.', { p: fmtPct(endet, 1), m: fmtPct(agence.endettementMax, 0) }));
      else out.push(t('Votre taux d\'endettement serait de {p}, sous le seuil de {m} : le dossier est équilibré.', { p: fmtPct(endet, 1), m: fmtPct(agence.endettementMax, 0) }));
    }
    if (e.apport) {
      var pa = e.apport.apport / e.apport.prix * 100;
      if (pa < agence.apportMin) out.push(t('Votre apport représente {p} du prix. Un apport d\'au moins {m} facilite l\'accord de la banque et réduit le coût.', { p: fmtPct(pa, 1), m: fmtPct(agence.apportMin, 0) }));
    }
    if (isFinite(r.teg) && r.teg - e.taux > 0.4) out.push(t('Les frais et l\'assurance ajoutent {d} au taux nominal (TEG {g}). Négocier les frais de dossier ou comparer l\'assurance peut réduire nettement le coût.', { d: fmtSaisie(Math.round((r.teg - e.taux) * 100) / 100) + (r.teg - e.taux >= 2 ? ' points' : ' point'), g: fmtPct(r.teg, 2) }));
    if (e.mois > 60 && !e.ras.length && !e.versement) {
      var court = calculerEcheancier(Object.assign({}, e, { mois: e.mois - 60, differe: null, ras: [], versement: null }), false);
      if (court.lignes.length) out.push(t('Sur {n}, la mensualité passerait à {m} (+{d}), mais vous économiseriez {e} d\'intérêts.', { n: libMois(e.mois - 60), m: fmtMoney(court.M1), d: fmtMoney(roundPrec(court.M1 - r.M1)), e: fmtMoney(roundPrec(r.totI - court.totI)) }));
    }
    if (!e.ras.length && !e.versement && r.n > 24 && e.amort === 'constant') {
      var montant = roundPrec(e.capital * 0.1);
      var avecRa = calculerEcheancier(Object.assign({}, e, { ras: [{ apres: Math.min(24, r.n - 1), total: false, montant: montant }], versement: null, raMode: 'duree' }), sc.reduction);
      out.push(t('Un remboursement anticipé de {m} après 2 ans ferait économiser environ {e} d\'intérêts{i}.', { m: fmtMoney(montant), e: fmtMoney(roundPrec(r.totI - avecRa.totI)), i: e.indemnite ? '' : t(' (hors indemnité)') }));
    }
    if (e.tmm) {
      var plus1 = calculerEcheancier(Object.assign({}, e, { taux: e.taux + 1, variation: null }), sc.reduction);
      out.push(t('Votre taux suit le TMM : une hausse d\'un point porterait la mensualité à {m} (+{d}). Prévoyez une marge de sécurité dans votre budget.', { m: fmtMoney(plus1.M1), d: fmtMoney(roundPrec(plus1.M1 - r.M1)) }));
    }
    if (em && em.age != null && em.age + e.mois / 12 > agence.ageMax) out.push(t('Le crédit se terminerait à {a} ans, au-delà de l\'âge maximal de {m} ans retenu par les banques : une durée plus courte est à prévoir.', { a: fmtSaisie(Math.round((em.age + e.mois / 12) * 10) / 10), m: agence.ageMax }));
    if (!out.length) out.push(t('Le crédit est cohérent : vérifiez simplement l\'offre définitive de la banque, notamment le TEG.'));
    return out;
  }

  function exporterRapport(sc, signatures) {
    if (!exigerResultat(sc)) return;
    if (!window.jspdf || !window.jspdf.jsPDF) { toast(t('Export PDF indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    enFrancais(function () { construireRapport(sc, signatures || {}); });
    toast(t('Rapport client téléchargé.'));
  }

  function construireRapport(sc, signatures) {
    signatures = signatures || {};
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    var L = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var c1 = hexVersRgb(couleurMarque()), c2 = hexVersRgb(couleurSecondaire(couleurMarque())), encre = [22, 18, 41], gris = [110, 105, 137];
    var e = sc.entrees, r = sc.resultat, infoP = infoPeriodicite(r.p);
    function degrade(y0, h) {
      for (var i = 0; i < 80; i++) {
        var u = i / 79;
        doc.setFillColor(Math.round(c1[0] + (c2[0] - c1[0]) * u), Math.round(c1[1] + (c2[1] - c1[1]) * u), Math.round(c1[2] + (c2[2] - c1[2]) * u));
        doc.rect(L * i / 80, y0, L / 80 + 0.4, h, 'F');
      }
    }
    function titrePage(titre, sous) {
      degrade(0, 26);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text(titre, 16, 15);
      if (sous) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(sous, 16, 21); }
      doc.setTextColor(encre[0], encre[1], encre[2]);
    }
    /* Page de garde */
    degrade(0, H);
    doc.setFillColor(255, 255, 255);
    if (agence.logo && agence.logoL > 0) {
      try {
        var ech = Math.min(24 / agence.logoH, 60 / agence.logoL), lw = agence.logoL * ech, lh = agence.logoH * ech;
        doc.roundedRect(16, 18, lw + 8, lh + 8, 3, 3, 'F');
        doc.addImage(agence.logo, 'PNG', 20, 22, lw, lh);
      } catch (err) { /* logo ignoré */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
    doc.text('ÉTUDE DE FINANCEMENT', 16, 92);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
    doc.text(doc.splitTextToSize(e.client.nom ? 'Préparée pour ' + e.client.nom : 'Votre projet de crédit', L - 32), 16, 106);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13);
    var projet = (e.type !== 'libre' ? { immo: 'Crédit immobilier', auto: 'Crédit auto', conso: 'Crédit à la consommation' }[e.type] + ' · ' : '') + fmtTexte(e.capital) + ' sur ' + libMois(e.mois);
    doc.text(projet, 16, 128);
    if (e.client.ref) doc.text('Référence : ' + e.client.ref, 16, 136);
    /* Chiffres clés */
    var cles = [[infoP.echeance, fmtTexte(r.M1)], ['Taux annuel', fmtTaux(e.taux)], ['TEG', isFinite(r.teg) ? fmtPct(r.teg, 2) : '—'], ['Coût du crédit', fmtTexte(r.coutCredit)]];
    var lc = (L - 32 - 3 * 6) / 4;
    cles.forEach(function (c, i) {
      var x = 16 + i * (lc + 6);
      doc.setFillColor(255, 255, 255); doc.roundedRect(x, 160, lc, 30, 3, 3, 'F');
      doc.setTextColor(gris[0], gris[1], gris[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.text(c[0], x + 4, 168);
      doc.setTextColor(encre[0], encre[1], encre[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
      doc.text(doc.splitTextToSize(c[1], lc - 8)[0], x + 4, 179);
    });
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    var lAg = ligneAgence();
    doc.text((lAg ? lAg + '   ·   ' : '') + 'Le ' + new Date().toLocaleDateString('fr-FR'), 16, H - 22);
    doc.setFontSize(8.5);
    var mention = 'Simulation indicative, ne constitue pas une offre de prêt. Simulateur de crédit en Dinar Tunisien · Mohamed Aziz Jaouadi';
    doc.text(mention, 16, H - 14);
    lienAuteurPDF(doc, mention, 16, H - 14);

    /* Page 2 : synthèse et graphique annuel */
    doc.addPage();
    titrePage('Votre crédit en un coup d\'œil', 'Synthèse et répartition annuelle des remboursements');
    var y = 34;
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: y, body: synthese(sc), theme: 'plain',
        styles: { fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 3, right: 3 }, textColor: encre },
        columnStyles: { 0: { textColor: gris, cellWidth: 64 }, 1: { fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [245, 243, 252] }, margin: { left: 16, right: 16 }
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    var annees = agregerAnnuel(r);
    if (y > H - 80) { doc.addPage(); titrePage('Votre crédit en un coup d\'œil', 'Répartition annuelle des remboursements'); y = 34; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text('Capital et intérêts remboursés chaque année', 16, y); y += 5;
    var hG = Math.min(70, H - y - 30), lG = L - 32, maxA = Math.max.apply(null, annees.map(function (a) { return a.principal + a.interet; })) || 1;
    var lb = lG / annees.length;
    annees.forEach(function (a, i) {
      var hp = Math.max(0, a.principal) / maxA * hG, hi = a.interet / maxA * hG, x = 16 + i * lb + lb * 0.15, w = lb * 0.7;
      doc.setFillColor(c1[0], c1[1], c1[2]); doc.rect(x, y + hG - hp, w, hp, 'F');
      doc.setFillColor(236, 72, 153); doc.rect(x, y + hG - hp - hi, w, hi, 'F');
      if (annees.length <= 15 || i % Math.ceil(annees.length / 15) === 0) { doc.setFontSize(6.5); doc.setTextColor(gris[0], gris[1], gris[2]); doc.text(String(a.annee), x + w / 2, y + hG + 4, { align: 'center' }); }
    });
    doc.setFontSize(8); doc.setTextColor(gris[0], gris[1], gris[2]);
    doc.setFillColor(c1[0], c1[1], c1[2]); doc.rect(16, y + hG + 8, 3, 3, 'F'); doc.text('Capital', 21, y + hG + 10.5);
    doc.setFillColor(236, 72, 153); doc.rect(40, y + hG + 8, 3, 3, 'F'); doc.text('Intérêts', 45, y + hG + 10.5);
    doc.text('Années', L - 16, y + hG + 10.5, { align: 'right' });

    /* Page 3 : recommandations */
    doc.addPage();
    titrePage('Nos recommandations', 'Analyse personnalisée de votre projet');
    y = 38;
    conseils(sc).forEach(function (c, i) {
      var lignes = doc.splitTextToSize(c, L - 48);
      var hBloc = lignes.length * 5.2 + 8;
      if (y + hBloc > H - 20) { doc.addPage(); titrePage('Nos recommandations', ''); y = 38; }
      doc.setFillColor(245, 243, 252); doc.roundedRect(16, y, L - 32, hBloc, 3, 3, 'F');
      doc.setFillColor(c1[0], c1[1], c1[2]); doc.circle(24, y + 7, 3.6, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(String(i + 1), 24, y + 8.3, { align: 'center' });
      doc.setTextColor(encre[0], encre[1], encre[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(lignes, 32, y + 7.5);
      y += hBloc + 5;
    });

    /* Page 4 : tableau annuel */
    doc.addPage();
    titrePage('Échéancier annuel', 'Totaux par année de remboursement');
    if (typeof doc.autoTable === 'function') {
      var avecAss = r.totAss > 0;
      doc.autoTable({
        startY: 34,
        head: [['Année', 'Période', 'Total payé', 'Intérêts', 'Capital'].concat(avecAss ? ['Assurance'] : [], ['Capital restant dû'])],
        body: annees.map(function (a) {
          return [a.annee, a.debut ? moisAnnee(a.debut) + ' – ' + moisAnnee(a.fin) : libEcheances(a.nb), fmtTexte(a.paiement), fmtTexte(a.interet), fmtTexte(a.principal)]
            .concat(avecAss ? [fmtTexte(a.assurance)] : [], [fmtTexte(a.reste)]);
        }),
        theme: 'grid',
        headStyles: { fillColor: c1, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.2, cellPadding: 1.8, lineColor: [228, 224, 240], lineWidth: 0.1, textColor: encre, halign: 'right' },
        columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } },
        alternateRowStyles: { fillColor: [249, 248, 253] },
        margin: { left: 16, right: 16, bottom: 18 }
      });
    }

    /* Page 5 : engagement et signatures */
    doc.addPage();
    titrePage('Validation', 'Lu et approuvé');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(encre[0], encre[1], encre[2]);
    doc.text(doc.splitTextToSize('Cette étude est établie à partir des informations communiquées et des conditions indiquées. Elle est indicative et ne constitue pas une offre de prêt : seule l\'offre définitive de la banque fait foi, notamment pour le taux, le TEG, les frais et l\'assurance.', L - 32), 16, 42);
    doc.text('Fait à ______________________________, le ____ / ____ / ________', 16, 70);
    var lw2 = (L - 32 - 10) / 2;
    [['Signature du client', e.client.nom || ''], ['Signature du conseiller', agence.conseiller || '']].forEach(function (s, i) {
      var x = 16 + i * (lw2 + 10);
      doc.setDrawColor(c1[0], c1[1], c1[2]); doc.setLineWidth(0.5); doc.roundedRect(x, 82, lw2, 52, 3, 3, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(s[0], x + 5, 90);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(gris[0], gris[1], gris[2]); doc.text(s[1], x + 5, 96);
      doc.setTextColor(encre[0], encre[1], encre[2]);
      var img = i === 0 ? signatures.client : signatures.conseiller;
      if (img) {
        try { doc.addImage(img, 'PNG', x + 5, 99, lw2 - 10, 30); } catch (err) { /* signature ignorée */ }
        doc.setFontSize(7.5); doc.setTextColor(gris[0], gris[1], gris[2]);
        doc.text('Signé électroniquement le ' + new Date().toLocaleDateString('fr-FR'), x + 5, 132);
        doc.setTextColor(encre[0], encre[1], encre[2]);
      }
    });
    var qr = matriceQR(lienSimulation(sc));
    if (qr) {
      var n = qr.getModuleCount(), taille = 34, mod = taille / n, x0 = 16, y0 = 150;
      doc.setFillColor(encre[0], encre[1], encre[2]);
      for (var qy = 0; qy < n; qy++) for (var qx = 0; qx < n; qx++) if (qr.isDark(qy, qx)) doc.rect(x0 + qx * mod, y0 + qy * mod, mod + 0.02, mod + 0.02, 'F');
      doc.setFontSize(9.5); doc.setTextColor(gris[0], gris[1], gris[2]);
      doc.text(doc.splitTextToSize('Scannez ce QR code pour rouvrir cette simulation sur votre téléphone et la modifier.', L - 70), 56, 162);
    }
    /* Pied de page numéroté (sauf la page de garde) */
    var nb = doc.internal.getNumberOfPages();
    for (var p = 2; p <= nb; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setTextColor(gris[0], gris[1], gris[2]);
      doc.text((agence.nom ? agence.nom + ' · ' : '') + 'Étude de financement' + (e.client.nom ? ' · ' + e.client.nom : ''), 16, H - 8);
      doc.text('Page ' + p + ' / ' + nb, L - 16, H - 8, { align: 'right' });
    }
    doc.save(nomFichier(sc, 'pdf', 'rapport_client'));
  }

  /* ===================================================================
     Couleurs de l'agence
     =================================================================== */
  var COULEURS_MARQUE = [
    { cle: '#8C5000', nom: 'Violet' }, { cle: '#2563eb', nom: 'Bleu' }, { cle: '#059669', nom: 'Émeraude' },
    { cle: '#dc2626', nom: 'Rouge' }, { cle: '#ea580c', nom: 'Orange' }, { cle: '#0891b2', nom: 'Turquoise' }, { cle: '#1e3a8a', nom: 'Bleu nuit' }
  ];
  function hexVersRgb(h) { var n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbVersHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hsl(h, s, l) { return 'hsl(' + ((h % 360) + 360) % 360 + ' ' + Math.max(0, Math.min(100, s)) + '% ' + Math.max(0, Math.min(100, l)) + '%)'; }
  function hslVersHex(h, s, l) {
    s /= 100; l /= 100; h = ((h % 360) + 360) % 360;
    var k = function (n) { return (n + h / 30) % 12; }, a = s * Math.min(l, 1 - l);
    var f = function (n) { return Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))); };
    return '#' + [f(0), f(8), f(4)].map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function couleurMarque() { return /^#[0-9a-f]{6}$/i.test(agence.couleur || '') ? agence.couleur : '#8C5000'; }
  function couleurSecondaire(hex) { var c = rgbVersHsl(hexVersRgb(hex)); return hslVersHex(c[0] + 38, Math.min(90, c[1] + 5), Math.min(60, c[2] + 6)); }

  function appliquerMarque() {
    var st = $('#style-marque');
    var hex = couleurMarque();
    if (hex.toLowerCase() === '#8C5000') { if (st) st.textContent = ''; return; }
    var h = rgbVersHsl(hexVersRgb(hex)), c2 = couleurSecondaire(hex), c3 = hslVersHex(h[0] + 70, Math.min(95, h[1] + 10), Math.min(62, h[2] + 10));
    var clair = hslVersHex(h[0], Math.min(95, h[1] + 5), Math.min(78, h[2] + 22));
    var grad = 'linear-gradient(135deg, ' + hex + ' 0%, ' + c2 + ' 55%, ' + c3 + ' 100%)';
    var css =
      ':root{--violet:' + hex + ';--violet-strong:' + hslVersHex(h[0], h[1], Math.max(20, h[2] - 8)) + ';--primary:' + hex + ';--primary-soft:' + hsl(h[0], h[1], h[2]).replace(')', ' / .1)') + ';--ring:' + hsl(h[0], h[1], h[2]).replace(')', ' / .38)') + ';' +
        '--grad-main:' + grad + ';--c-principal:' + hex + ';--shadow-glow:0 14px 34px -12px ' + hsl(h[0], h[1], h[2]).replace(')', ' / .55)') + ';' +
        '--grad-hero:radial-gradient(120% 140% at 0% 0%,' + clair + ' 0%,transparent 55%),radial-gradient(90% 120% at 100% 0%,' + c3 + ' 0%,transparent 55%),radial-gradient(100% 140% at 60% 100%,' + c2 + ' 0%,transparent 60%),linear-gradient(135deg,' + hex + ',' + c2 + ');}' +
      ':root[data-theme="dark"]{--primary:' + clair + ';--primary-soft:' + hsl(h[0], h[1], 70).replace(')', ' / .14)') + ';--ring:' + hsl(h[0], h[1], 70).replace(')', ' / .45)') + ';--c-principal:' + clair + ';}' +
      '.btn-primary{background:linear-gradient(120deg,' + hex + ' 0%,' + c2 + ' 45%,' + c3 + ' 70%,' + hex + ' 100%);background-size:220% 100%;}' +
      '.range::-webkit-slider-runnable-track{background:linear-gradient(90deg,' + hex + ',' + c2 + ') 0 0 / var(--pct) 100% no-repeat,var(--track);}' +
      '.range::-moz-range-progress{background:linear-gradient(90deg,' + hex + ',' + c2 + ');}' +
      '.range::-webkit-slider-thumb{border-color:' + hex + ';}.range::-moz-range-thumb{border-color:' + hex + ';}' +
      '.split-bar .s-cap,.cmp-bar .trk .c{background:linear-gradient(90deg,' + hex + ',' + clair + ');}' +
      '.opt[data-on="true"] .switch{background:linear-gradient(120deg,' + hex + ',' + c2 + ');}';
    if (!st) { st = document.createElement('style'); st.id = 'style-marque'; document.head.appendChild(st); }
    st.textContent = css;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && document.documentElement.getAttribute('data-theme') !== 'dark') meta.setAttribute('content', hex);
  }

  /* ===================================================================
     Thème : clair, sombre, Aurora (sombre, verre dépoli, fond animé)
     =================================================================== */
  function themeCourant() { var h = document.documentElement; return h.classList.contains('aurora') ? 'aurora' : (h.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'); }
  function appliquerTheme(th) {
    var html = document.documentElement;
    html.setAttribute('data-theme', th === 'light' ? 'light' : 'dark');
    html.classList.toggle('aurora', th === 'aurora');
    stock.ecrire('theme', th);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th === 'aurora' ? '#07061a' : th === 'dark' ? '#0b0a11' : couleurMarque());
    majBoutonTheme();
    Object.keys(scenarios).forEach(function (k) { if (scenarios[k]) scenarios[k].rendreGraphique(); });
  }
  function majBoutonTheme() {
    var b = $('#btnTheme'), th = themeCourant();
    if (!b) return;
    var lib = th === 'light' ? t('Passer au thème sombre') : th === 'dark' ? t('Passer au thème Aurora') : t('Passer au thème clair');
    b.setAttribute('title', lib); b.setAttribute('aria-label', lib);
  }
  function themeSuivant(ev) {
    var ordre = ['light', 'dark', 'aurora'], th = themeCourant();
    var b = $('#btnTheme'), o = null;
    if (ev && ev.clientX) o = [ev.clientX, ev.clientY];
    else if (b) { var r = b.getBoundingClientRect(); o = [r.left + r.width / 2, r.top + r.height / 2]; }
    transition(function () { appliquerTheme(ordre[(ordre.indexOf(th) + 1) % 3]); }, o);
    vibrer();
  }

  /* ===================================================================
     Effets : cartes 3D, apparitions au défilement, retours tactiles
     =================================================================== */
  function vibrer() { if (navigator.vibrate && window.matchMedia && matchMedia('(pointer: coarse)').matches) { try { navigator.vibrate(8); } catch (e) { /* sans effet */ } } }

  function initialiserEffets() {
    var fin = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fin && !mouvementReduit.matches) {
      document.addEventListener('pointermove', function (ev) {
        var c = ev.target.closest && ev.target.closest('.kpi, .jauge-fig, .ra-stat');
        if (!c) return;
        var r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        c.style.setProperty('--rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
        c.style.setProperty('--ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
        c.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        c.classList.add('incline');
      }, { passive: true });
      document.addEventListener('pointerout', function (ev) {
        var c = ev.target.closest && ev.target.closest('.kpi, .jauge-fig, .ra-stat');
        if (c && !c.contains(ev.relatedTarget)) { c.classList.remove('incline'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }
      }, { passive: true });
    }
    if ('IntersectionObserver' in window && !mouvementReduit.matches) {
      var obs = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('vu'); obs.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
      var observer = function () {
        $$('.results-body > .card:not(.revele), .results-body > .kpis:not(.revele)').forEach(function (el) {
          if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('revele'); obs.observe(el); }
        });
      };
      observer();
      window.revelerNouveaux = observer;
    }
    document.addEventListener('click', function (ev) { if (ev.target.closest('.btn, .type-chip, .seg button, .opt-head, .tab')) vibrer(); });
  }

  /* ===================================================================
     Palette de commandes (Ctrl + K)
     =================================================================== */
  function commandes() {
    var sc = scenarioActif();
    var liste = [
      { nom: 'Calculer et enregistrer', ico: 'calc', fn: function () { $('#' + sc.cle + '-calculer').click(); } },
      { nom: 'Décrire mon crédit en une phrase', ico: 'sparkle', fn: function () { var i = $('#' + sc.cle + '-nl'); i.focus(); i.scrollIntoView({ block: 'center', behavior: mouvementReduit.matches ? 'auto' : 'smooth' }); } },
      { nom: 'Dicter mon crédit (micro)', ico: 'mic', fn: function () { dicter(sc, $('#' + sc.cle + ' [data-nl-micro]') || $('[data-nl-micro]')); }, si: vocalDisponible },
      { nom: 'Exporter PDF', ico: 'file', fn: function () { exporterPDF(sc); } },
      { nom: 'Rapport client', ico: 'award', fn: function () { preparerRapport(sc); } },
      { nom: 'Simulation guidée', ico: 'sparkle', fn: ouvrirGuide },
      { nom: 'Haute lisibilité', ico: 'globe', fn: basculerLisibilite },
      { nom: 'Simulateur Assurance Vie et CEA', ico: 'pousse', fn: function () { window.open('/outils/assurance-vie/', '_blank', 'noopener'); } },
      { nom: 'Simulateur Assurance Automobile', ico: 'voiture', fn: function () { window.open('https://mohamed-ja.github.io/simulateur-Assurance-Automobile/', '_blank', 'noopener'); } },
      { nom: 'Calculateur de salaire brut ⇄ net', ico: 'calc', fn: function () { window.open('/outils/salaire/', '_blank', 'noopener'); } },
      { nom: 'Exporter Excel', ico: 'sheet', fn: function () { exporterExcel(sc); } },
      { nom: 'Imprimer', ico: 'printer', fn: function () { imprimer(sc); } },
      { nom: 'QR code', ico: 'qr', fn: function () { ouvrirQR(sc); } },
      { nom: 'WhatsApp', ico: 'whatsapp', fn: function () { partagerWhatsApp(sc); } },
      { nom: 'Partager par e-mail', ico: 'mail', fn: function () { partagerParEmail(sc); } },
      { nom: 'Agenda (.ics)', ico: 'calendar', fn: function () { exporterAgenda(sc); } },
      { nom: 'Historique des simulations', ico: 'history', fn: ouvrirHistorique },
      { nom: 'Comparer des simulations', ico: 'compare', fn: ouvrirComparaison },
      { nom: 'Agence et paramètres', ico: 'building', fn: ouvrirAgence },
      { nom: 'Ajouter un scénario', ico: 'plus', fn: function () { afficherB(true); } },
      { nom: 'Réinitialiser', ico: 'reset', fn: function () { $('#' + sc.cle + '-reset').click(); } },
      { nom: 'Changer de thème', ico: 'sparkle', fn: themeSuivant },
      { nom: 'Afficher en arabe', ico: 'globe', fn: changerLangue },
      { nom: 'Aller au tableau d\'amortissement', ico: 'table', fn: function () { var el = $('#' + sc.cle + '-titre-ech'); if (el) el.scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth' }); } }
    ];
    OUTILS.forEach(function (o) { liste.push({ nom: o.nom, ico: o.ico, fn: o.fn, aide: o.aide }); });
    return liste.filter(function (c) { return !c.si || c.si(); });
  }
  function normaliser(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function ouvrirPalette() {
    if ($('dialog.palette[open]')) return;
    var cmds = commandes(), choix = 0, visibles = cmds;
    var d = ouvrirDialogue({
      titre: t('Que voulez-vous faire ?'),
      icone: 'search',
      corps: '<div class="palette-recherche">' + ico('search') + '<input type="text" id="pal-q" autocomplete="off" spellcheck="false" data-texte placeholder="' + echapper(t('Rechercher une action ou un outil…')) + '" aria-label="' + echapper(t('Rechercher une action ou un outil…')) + '"><kbd>Esc</kbd></div>' +
        '<div class="palette-liste" id="pal-liste" role="listbox"></div>'
    });
    d.el.classList.add('palette');
    var el = d.el, q = $('#pal-q', el), zone = $('#pal-liste', el);
    function rendre() {
      var mots = normaliser(q.value).split(/\s+/).filter(Boolean);
      visibles = cmds.filter(function (c) { var txt = normaliser(t(c.nom) + ' ' + c.nom + ' ' + (c.aide ? t(c.aide) : '')); return mots.every(function (m) { return txt.indexOf(m) !== -1; }); });
      choix = Math.min(choix, Math.max(0, visibles.length - 1));
      zone.innerHTML = visibles.length ? visibles.map(function (c, i) {
        return '<button type="button" role="option" class="pal-item" data-i="' + i + '" aria-selected="' + (i === choix) + '"><span class="menu-ico">' + ico(c.ico, 'ico-sm') + '</span><span class="menu-txt"><strong>' + echapper(t(c.nom)) + '</strong>' + (c.aide ? '<small>' + echapper(t(c.aide)) + '</small>' : '') + '</span></button>';
      }).join('') : '<p class="vide-dlg">' + echapper(t('Aucune action ne correspond.')) + '</p>';
      var actif = zone.querySelector('[aria-selected="true"]');
      if (actif) actif.scrollIntoView({ block: 'nearest' });
    }
    function executer(i) { var c = visibles[i]; if (!c) return; d.fermer(); setTimeout(c.fn, 180); }
    q.addEventListener('input', function () { choix = 0; rendre(); });
    q.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); choix = Math.min(visibles.length - 1, choix + 1); rendre(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); choix = Math.max(0, choix - 1); rendre(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); executer(choix); }
    });
    zone.addEventListener('click', function (ev) { var b = ev.target.closest('[data-i]'); if (b) executer(+b.dataset.i); });
    rendre();
    q.focus();
    setTimeout(function () { q.focus(); }, 30);
  }

  /* ===================================================================
     Branchements globaux des nouveautés
     =================================================================== */
  function initialiserAvance() {
    appliquerMarque();
    appliquerTheme(themeCourant());
    initialiserEffets();
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); ouvrirPalette(); }
    });
    var bp = $('#btnPalette');
    if (bp) bp.addEventListener('click', ouvrirPalette);
    document.addEventListener('click', function (ev) {
      var scEl = ev.target.closest('.scenario');
      var sc = scEl ? scenarios[scEl.id.replace('scenario-', '')] : null;
      if (ev.target.closest('[data-stress]')) { ouvrirStressTest(); return; }
      if (!sc) return;
      if (ev.target.closest('[data-nl-go]')) { appliquerTexte(sc, $('#' + sc.cle + '-nl').value); return; }
      var mic = ev.target.closest('[data-nl-micro]');
      if (mic) { dicter(sc, mic); return; }
      var play = ev.target.closest('[data-temps-play]');
      if (play) { basculerLecture(sc, play); return; }
    });
    document.addEventListener('input', function (ev) {
      var cible = ev.target;
      var scEl = cible.closest && cible.closest('.scenario');
      var sc = scEl ? scenarios[scEl.id.replace('scenario-', '')] : null;
      if (!sc) return;
      if (cible.hasAttribute('data-temps-range')) { sc.tempsPos = +cible.value; majTemps(sc); }
      else if (cible.hasAttribute('data-inflation')) {
        var v = lireNombre(cible.value);
        if (isFinite(v) && v <= 50) {
          stock.ecrire(CLE_INFLATION, String(v));
          clearTimeout(cible._t);
          cible._t = setTimeout(function () { Object.keys(scenarios).forEach(function (k) { if (scenarios[k] && scenarios[k].resultat) rendreAvance(scenarios[k]); }); var i = $('#' + sc.cle + '-visu [data-inflation]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 500);
        }
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.hasAttribute && ev.target.hasAttribute('data-nl')) {
        ev.preventDefault();
        var scEl = ev.target.closest('.scenario');
        if (scEl) appliquerTexte(scenarios[scEl.id.replace('scenario-', '')], ev.target.value);
      }
    });
  }

  /* ===================================================================
     Outils graphiques communs (SVG, sens gauche → droite)
     =================================================================== */
  function grapheLignes(series, o) {
    o = o || {};
    var L = o.L || 640, H = o.H || 220, g = o.g || 62, d = 14, h = 14, b = 26;
    var tous = [];
    series.forEach(function (s) { s.pts.forEach(function (p) { tous.push(p[1]); }); });
    if (o.ref != null) tous.push(o.ref);
    var max = Math.max.apply(null, tous.concat([o.min0 === false ? -Infinity : 0])), min = o.min0 === false ? Math.min.apply(null, tous) : Math.min(0, Math.min.apply(null, tous));
    if (max - min < 1e-9) max = min + 1;
    var xmax = Math.max.apply(null, series.map(function (s) { return s.pts.length ? s.pts[s.pts.length - 1][0] : 1; })) || 1;
    var xmin = o.xmin != null ? o.xmin : 0;
    function X(x) { return g + (x - xmin) / ((xmax - xmin) || 1) * (L - g - d); }
    function Y(v) { return h + (1 - (v - min) / (max - min)) * (H - h - b); }
    var out = '';
    for (var k = 0; k <= 4; k++) {
      var v = min + (max - min) * k / 4;
      out += '<line x1="' + g + '" x2="' + (L - d) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="grille"/>' +
        '<text x="' + (g - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end" class="axe">' + echapper(o.fmtY ? o.fmtY(v) : fmtCompact(v)) + '</text>';
    }
    (o.xTicks || []).filter(function (tk) { return tk[0] >= xmin && tk[0] <= xmax; }).forEach(function (tk) { out += '<text x="' + X(tk[0]).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" class="axe">' + echapper(tk[1]) + '</text>'; });
    (o.zones || []).forEach(function (z) { out += '<rect x="' + X(z[0]).toFixed(1) + '" y="' + h + '" width="' + Math.max(1, X(z[1]) - X(z[0])).toFixed(1) + '" height="' + (H - h - b) + '" class="zone-ok"/>'; });
    if (o.ref != null) out += '<line x1="' + g + '" x2="' + (L - d) + '" y1="' + Y(o.ref).toFixed(1) + '" y2="' + Y(o.ref).toFixed(1) + '" class="ref"/>';
    series.forEach(function (s) {
      if (!s.pts.length) return;
      var p = s.pts.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join(' ');
      if (s.aire) out += '<path d="' + p + ' L' + X(s.pts[s.pts.length - 1][0]).toFixed(1) + ' ' + Y(Math.max(min, 0)).toFixed(1) + ' L' + X(s.pts[0][0]).toFixed(1) + ' ' + Y(Math.max(min, 0)).toFixed(1) + ' Z" fill="' + s.c + '" opacity=".14"/>';
      out += '<path d="' + p + '" fill="none" stroke="' + s.c + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"' + (s.tirets ? ' stroke-dasharray="7 5"' : '') + ' class="trace"/>';
    });
    if (o.curseur != null) out += '<line x1="' + X(o.curseur).toFixed(1) + '" x2="' + X(o.curseur).toFixed(1) + '" y1="' + h + '" y2="' + (H - b) + '" class="curseur"/>';
    return '<svg viewBox="0 0 ' + L + ' ' + H + '" class="graphe-l" role="img" style="direction:ltr" aria-label="' + echapper(o.aria || '') + '">' + out + '</svg>';
  }
  function ticksAnnees(n, p, debut) {
    var parAn = 12 / (p || 1), nbA = Math.ceil(n / parAn), pas = Math.max(1, Math.ceil(nbA / 7)), out = [];
    for (var a = 0; a <= nbA; a += pas) out.push([a * parAn, debut ? String(debut.getFullYear() + a) : t('An {n}', { n: a })]);
    return out;
  }

  /* ===================================================================
     Simulation guidée, pas à pas
     =================================================================== */
  var GUIDE_TYPES = [
    { cle: 'immo', nom: 'Logement', aide: 'Achat, construction ou terrain', ico: 'home' },
    { cle: 'auto', nom: 'Voiture', aide: 'Neuve ou d\'occasion', ico: 'car' },
    { cle: 'conso', nom: 'Consommation', aide: 'Équipement, études, travaux…', ico: 'bag' },
    { cle: 'libre', nom: 'Autre projet', aide: 'Montant libre', ico: 'sliders' }
  ];
  var GUIDE_ETAPES = ['Projet', 'Montant', 'Durée', 'Taux', 'Budget', 'Résultat'];

  function ouvrirGuide() {
    var sc = scenarioActif();
    var g = { etape: 0, type: null, prix: null, apport: null, montant: null, ans: null, mode: 'fixe', taux: null, tmm: agence.tmm, marge: null, revenus: null, charges: null, age: null };
    var d = ouvrirDialogue({
      titre: t('Simulation guidée'),
      sousTitre: echapper(t('Cinq questions simples, puis votre résultat, sans jargon.')),
      icone: 'sparkle', large: true,
      corps: '<ol class="gd-etapes" aria-label="' + echapper(t('Étapes')) + '">' + GUIDE_ETAPES.map(function (n, i) {
          return '<li data-i="' + i + '"><span class="gd-pt">' + (i + 1) + '</span><span class="gd-lib">' + echapper(t(n)) + '</span></li>';
        }).join('') + '</ol>' +
        '<div class="gd-scene" id="gd-scene" aria-live="polite"></div>' +
        '<div class="gd-apercu" id="gd-apercu" hidden></div>',
      pied: '<button class="btn btn-ghost" id="gd-prec">' + ico('arrow', 'ico-sm gd-retour') + echapper(t('Précédent')) + '</button>' +
            '<button class="btn btn-primary" id="gd-suiv">' + echapper(t('Continuer')) + ico('arrow', 'ico-sm') + '</button>'
    });
    var el = d.el;
    el.classList.add('guide');
    function prof() { return agence.types[g.type] || null; }
    function capital() {
      if (g.type === 'immo' || g.type === 'auto') return g.prix > 0 ? roundPrec(g.prix - (g.apport || 0)) : NaN;
      return g.montant;
    }
    function tauxEff() { return g.mode === 'tmm' ? (isFinite(g.tmm) && isFinite(g.marge) ? round6(g.tmm + g.marge) : NaN) : g.taux; }
    function calcul() {
      var C = capital(), ta = tauxEff();
      if (!(C > 0) || !(g.ans > 0) || !isFinite(ta)) return null;
      return calculerEcheancier({ capital: C, mois: Math.round(g.ans * 12), taux: ta, dateDebut: aujourdHui() }, false);
    }
    function valide(i) {
      if (i === 0) return !!g.type;
      if (i === 1) return capital() > 0 && capital() <= 1e8 && (!(g.type === 'immo' || g.type === 'auto') || !(g.apport >= g.prix));
      if (i === 2) return g.ans > 0 && g.ans <= 25;
      if (i === 3) return isFinite(tauxEff()) && tauxEff() >= 0 && tauxEff() < 100;
      return true;
    }
    function champ(id, lib, val, suffixe, aide, mode) {
      return '<label class="gd-champ" for="' + id + '"><span>' + echapper(lib) + '</span>' +
        '<span class="gd-input"><input id="' + id + '" type="text" inputmode="' + (mode || 'decimal') + '" autocomplete="off" value="' + (val != null && isFinite(val) ? echapper(fmtSaisie(val)) : '') + '"><b>' + echapper(suffixe) + '</b></span>' +
        (aide ? '<small>' + echapper(aide) + '</small>' : '') + '</label>';
    }
    function puces(attr, valeurs, actuel, fmt) {
      return '<div class="gd-puces">' + valeurs.map(function (v) {
        return '<button type="button" class="gd-puce" data-' + attr + '="' + v + '" aria-pressed="' + (actuel === v) + '">' + echapper(fmt(v)) + '</button>';
      }).join('') + '</div>';
    }
    function scene() {
      var i = g.etape, h = '';
      if (i === 0) {
        h = '<h3 class="gd-q">' + echapper(t('Quel est votre projet ?')) + '</h3><div class="gd-cartes">' + GUIDE_TYPES.map(function (ty) {
          return '<button type="button" class="gd-carte" data-type="' + ty.cle + '" aria-pressed="' + (g.type === ty.cle) + '"><span class="gd-c-ico">' + ico(ty.ico) + '</span><strong>' + echapper(t(ty.nom)) + '</strong><small>' + echapper(t(ty.aide)) + '</small></button>';
        }).join('') + '</div>';
      } else if (i === 1) {
        if (g.type === 'immo' || g.type === 'auto') {
          var sugg = g.prix > 0 ? roundPrec(g.prix * agence.apportMin / 100) : null;
          h = '<h3 class="gd-q">' + echapper(g.type === 'immo' ? t('Quel est le prix du logement ?') : t('Quel est le prix de la voiture ?')) + '</h3>' +
            '<div class="gd-duo">' + champ('gd-prix', t('Prix du bien'), g.prix, unite(), '') +
            champ('gd-apport', t('Votre apport personnel'), g.apport, unite(), sugg ? t('Conseillé : au moins {m} ({p} du prix).', { m: fmtMoney(sugg), p: fmtPct(agence.apportMin, 0) }) : t('Laissez vide si vous n\'avez pas d\'apport.')) + '</div>' +
            puces('prix', g.type === 'immo' ? [150000, 200000, 250000, 350000] : [30000, 45000, 60000, 90000], g.prix, function (v) { return iso(fmtCompact(v)); });
        } else {
          h = '<h3 class="gd-q">' + echapper(t('Combien souhaitez-vous emprunter ?')) + '</h3>' + champ('gd-montant', t('Montant à emprunter'), g.montant, unite(), '') +
            puces('montant', [10000, 20000, 30000, 50000], g.montant, function (v) { return iso(fmtCompact(v)); });
        }
        var C = capital();
        h += '<p class="gd-note">' + (C > 0 ? echapper(t('Vous empruntez {m}.', { m: fmtMoney(C) })) : '&nbsp;') + '</p>';
      } else if (i === 2) {
        var pr = prof();
        var choix = g.type === 'immo' ? [10, 15, 20, 25] : g.type === 'auto' ? [3, 5, 7] : [2, 3, 5, 7];
        h = '<h3 class="gd-q">' + echapper(t('Sur combien d\'années voulez-vous rembourser ?')) + '</h3>' +
          puces('ans', choix, g.ans, function (v) { return libAns(v); }) +
          '<div class="gd-curseur"><input type="range" class="range" id="gd-ans-r" min="1" max="25" step="1" value="' + (g.ans || (pr ? pr.duree : 7)) + '" aria-label="' + echapper(t('Durée en années')) + '"><output id="gd-ans-o">' + echapper(libAns(g.ans || (pr ? pr.duree : 7))) + '</output></div>' +
          '<p class="gd-note">' + echapper(t('Plus la durée est longue, plus l\'échéance baisse, mais plus les intérêts augmentent.')) + '</p>';
      } else if (i === 3) {
        h = '<h3 class="gd-q">' + echapper(t('Quel taux la banque vous propose-t-elle ?')) + '</h3>' +
          '<div class="gd-cartes deux">' +
            '<button type="button" class="gd-carte" data-mode="fixe" aria-pressed="' + (g.mode === 'fixe') + '"><span class="gd-c-ico">' + ico('percent') + '</span><strong>' + echapper(t('Taux fixe')) + '</strong><small>' + echapper(t('Le même taux jusqu\'à la fin')) + '</small></button>' +
            '<button type="button" class="gd-carte" data-mode="tmm" aria-pressed="' + (g.mode === 'tmm') + '"><span class="gd-c-ico">' + ico('trend') + '</span><strong>' + echapper(t('TMM + marge')) + '</strong><small>' + echapper(t('Taux variable, revu avec le TMM')) + '</small></button>' +
          '</div>' +
          (g.mode === 'fixe'
            ? champ('gd-taux', t('Taux annuel'), g.taux, '%', t('Pas de proposition encore ? Gardez la valeur courante pour ce type de crédit.'))
            : '<div class="gd-duo">' + champ('gd-tmm', t('TMM actuel'), g.tmm, '%', '') + champ('gd-marge', t('Marge de la banque'), g.marge, '%', '') + '</div>');
      } else if (i === 4) {
        h = '<h3 class="gd-q">' + echapper(t('Vérifions votre budget (facultatif)')) + '</h3>' +
          '<div class="gd-duo">' + champ('gd-rev', t('Revenus mensuels nets'), g.revenus, unite(), '') + champ('gd-chg', t('Autres crédits et charges / mois'), g.charges, unite(), '') + '</div>' +
          champ('gd-age', t('Votre âge'), g.age, t('ans'), '', 'numeric') +
          '<div id="gd-budget"></div>';
      } else {
        h = resultatGuide();
      }
      $('#gd-scene', el).innerHTML = '<div class="gd-anim">' + h + '</div>';
      $$('.gd-etapes li', el).forEach(function (li, k) {
        li.classList.toggle('fait', k < i); li.classList.toggle('actif', k === i);
        if (k === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      el.style.setProperty('--gd-pct', (i / (GUIDE_ETAPES.length - 1) * 100) + '%');
      $('#gd-prec', el).hidden = i === 0;
      $('#gd-suiv', el).hidden = i === 5;
      majBoutons();
      apercu();
      if (i === 4) budget();
      var premier = $('#gd-scene input[type="text"]', el);
      if (premier && window.matchMedia && matchMedia('(pointer: fine)').matches) premier.focus();
    }
    function majBoutons() {
      var b = $('#gd-suiv', el);
      b.disabled = !valide(g.etape);
      b.lastChild.previousSibling && (b.childNodes[0].nodeValue = g.etape === 4 ? (g.revenus > 0 ? t('Voir le résultat') : t('Passer et voir le résultat')) : t('Continuer'));
    }
    function apercu() {
      var r = calcul(), zone = $('#gd-apercu', el);
      if (!r || g.etape >= 5 || g.etape < 2) { zone.hidden = true; return; }
      zone.hidden = false;
      zone.innerHTML = '<span>' + echapper(t('Mensualité estimée')) + '</span><strong class="num">' + echapper(fmtMoney(r.M1)) + '</strong><small>' + echapper(t('{a} · taux {b}', { a: libAns(g.ans), b: fmtTaux(tauxEff()) })) + '</small>';
    }
    function budget() {
      var zone = $('#gd-budget', el), r = calcul();
      if (!zone || !r) return;
      if (!(g.revenus > 0)) { zone.innerHTML = '<p class="gd-note">' + echapper(t('Avec vos revenus, nous vérifions si la mensualité reste supportable.')) + '</p>'; return; }
      var endet = (r.M1 + (g.charges || 0)) / g.revenus * 100, ok = endet <= agence.endettementMax;
      zone.innerHTML = '<div class="gd-jauge ' + (ok ? 'ok' : 'ko') + '"><div class="gd-j-barre"><span style="width:' + Math.min(100, endet) + '%"></span><i style="inset-inline-start:' + agence.endettementMax + '%"></i></div>' +
        '<p><strong>' + echapper(t('Taux d\'endettement : {p}', { p: fmtPct(endet, 1) })) + '</strong> · ' + echapper(ok ? t('sous le maximum de {m}', { m: fmtPct(agence.endettementMax, 0) }) : t('au-dessus du maximum de {m}', { m: fmtPct(agence.endettementMax, 0) })) + '</p></div>';
    }
    function resultatGuide() {
      var r = calcul();
      if (!r) return '';
      var C = capital(), endet = g.revenus > 0 ? (r.M1 + (g.charges || 0)) / g.revenus * 100 : NaN;
      var conseils = [];
      if (isFinite(endet) && endet > agence.endettementMax) {
        var Mmax = g.revenus * agence.endettementMax / 100 - (g.charges || 0);
        if (Mmax > 0) {
          var tm = tauxMensuelPct(tauxEff()) / 100, n = Math.round(g.ans * 12);
          var Cmax = tm > 0 ? Mmax * (1 - Math.pow(1 + tm, -n)) / tm : Mmax * n;
          var nNec = nombreEcheances(tm, Mmax, C);
          conseils.push(t('Pour rester sous {p} d\'endettement, l\'échéance ne doit pas dépasser {m}.', { p: fmtPct(agence.endettementMax, 0), m: fmtMoney(roundPrec(Mmax)) }));
          conseils.push(t('Solution 1 : emprunter au plus {m} sur {a}.', { m: fmtMoney(Math.floor(Cmax / 100) * 100), a: libAns(g.ans) }));
          if (isFinite(nNec) && nNec <= 300) conseils.push(t('Solution 2 : allonger la durée à {a}.', { a: libMois(nNec) }));
        } else conseils.push(t('Vos charges actuelles dépassent déjà le maximum d\'endettement.'));
      }
      if (g.age > 0 && g.age + g.ans > agence.ageMax) conseils.push(t('Le crédit se terminerait à {a} ans : au-delà de {m} ans, les banques refusent souvent.', { a: g.age + g.ans, m: agence.ageMax }));
      if ((g.type === 'immo' || g.type === 'auto') && g.prix > 0 && (g.apport || 0) / g.prix * 100 < agence.apportMin) conseils.push(t('Un apport d\'au moins {p} du prix facilite l\'accord de la banque.', { p: fmtPct(agence.apportMin, 0) }));
      if (!conseils.length) conseils.push(t('Votre projet est cohérent. Passez à la simulation détaillée pour l\'assurance, les frais et le TEG.'));
      return '<div class="gd-resultat">' +
        '<p class="gd-r-lib">' + echapper(t('Votre mensualité')) + '</p>' +
        '<p class="gd-r-val num" id="gd-r-val"></p>' +
        '<div class="gd-r-stats">' +
          '<div><span>' + echapper(t('Vous empruntez')) + '</span><b class="num">' + echapper(fmtMoney(C)) + '</b></div>' +
          '<div><span>' + echapper(t('Durée')) + '</span><b>' + echapper(libAns(g.ans)) + '</b></div>' +
          '<div><span>' + echapper(t('Coût des intérêts')) + '</span><b class="num">' + echapper(fmtMoney(r.totI)) + '</b></div>' +
          '<div><span>' + echapper(t('Total remboursé')) + '</span><b class="num">' + echapper(fmtMoney(r.totM)) + '</b></div>' +
          (isFinite(endet) ? '<div class="' + (endet <= agence.endettementMax ? 'ok' : 'ko') + '"><span>' + echapper(t('Endettement')) + '</span><b>' + echapper(fmtPct(endet, 1)) + '</b></div>' : '') +
        '</div>' +
        '<ul class="gd-conseils">' + conseils.map(function (c) { return '<li>' + echapper(c) + '</li>'; }).join('') + '</ul>' +
        '<div class="gd-actions">' +
          '<button type="button" class="btn btn-primary" data-gd="detail">' + ico('table', 'ico-sm') + echapper(t('Voir la simulation détaillée')) + '</button>' +
          '<button type="button" class="btn btn-ghost" data-gd="rapport">' + ico('award', 'ico-sm') + echapper(t('Rapport client')) + '</button>' +
          '<button type="button" class="btn btn-quiet" data-gd="reprendre">' + ico('reset', 'ico-sm') + echapper(t('Recommencer')) + '</button>' +
        '</div></div>';
    }
    function appliquer() {
      var r = calcul();
      if (!r) return false;
      var v = { type: g.type, mois: Math.round(g.ans * 12), dateDebut: aujourdHui(), reduction: false, periodicite: 1, amort: 'constant', differe: null,
        assurance: null, frais: null, ras: [], versement: null, indemnite: 0, raMode: 'duree', variation: null };
      if (g.type === 'immo' || g.type === 'auto') { if (g.apport > 0) v.apport = { prix: g.prix, apport: g.apport }; else v.capital = g.prix; }
      else v.capital = g.montant;
      if (g.mode === 'tmm') v.tmm = { tmm: g.tmm, marge: g.marge }; else { v.tmm = null; v.taux = g.taux; }
      if (g.revenus > 0 || g.age > 0) v.emprunteur = { age: g.age > 0 ? g.age : null, revenus: g.revenus > 0 ? g.revenus : null, charges: g.charges || 0 };
      sc.appliquer(v);
      return true;
    }
    function lire(id) { var i = $('#' + id, el); return i ? (i.value.trim() === '' ? null : lireNombre(i.value)) : undefined; }
    function suivant() {
      if (!valide(g.etape)) return;
      if (g.etape === 0) {
        var pr = prof();
        if (pr) {
          if (g.ans == null) g.ans = Math.min(25, pr.duree);
          if (g.taux == null && g.marge == null) { if (pr.mode === 'tmm') { g.mode = 'tmm'; g.marge = pr.valeur; } else g.taux = pr.valeur; }
        }
        if (g.taux == null) g.taux = 9;
      }
      g.etape = Math.min(5, g.etape + 1);
      scene();
      if (g.etape === 5) {
        var r = calcul(), cible = $('#gd-r-val', el);
        cible.dataset.val = 0;
        odometre(cible, r.M1);
        vibrer();
      }
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !el.contains(b)) return;
      if (b.id === 'gd-suiv') { suivant(); return; }
      if (b.id === 'gd-prec') { g.etape = Math.max(0, g.etape - 1); scene(); return; }
      if (b.dataset.type) { g.type = b.dataset.type; g.ans = null; g.taux = null; g.marge = null; g.mode = 'fixe'; suivant(); return; }
      if (b.dataset.mode) { g.mode = b.dataset.mode; if (g.mode === 'tmm' && g.marge == null) g.marge = 2.5; scene(); return; }
      if (b.dataset.prix) { g.prix = +b.dataset.prix; scene(); return; }
      if (b.dataset.montant) { g.montant = +b.dataset.montant; scene(); return; }
      if (b.dataset.ans) { g.ans = +b.dataset.ans; scene(); return; }
      var a = b.dataset.gd;
      if (a === 'detail') { appliquer(); d.fermer(); setTimeout(function () { allerA('resultats'); }, 220); toast(t('Simulation placée dans le scénario {n} : affinez-la avec les options.', { n: sc.nom })); }
      else if (a === 'rapport') { appliquer(); d.fermer(); setTimeout(function () { exporterRapport(sc); }, 220); }
      else if (a === 'reprendre') { g.etape = 0; g.type = null; scene(); }
    });
    el.addEventListener('input', function (ev) {
      var i = ev.target;
      if (i.id === 'gd-ans-r') { g.ans = +i.value; $('#gd-ans-o', el).textContent = libAns(g.ans); i.style.setProperty('--pct', ((g.ans - 1) / 24 * 100) + '%'); $$('[data-ans]', el).forEach(function (p) { p.setAttribute('aria-pressed', String(+p.dataset.ans === g.ans)); }); }
      else {
        var map = { 'gd-prix': 'prix', 'gd-apport': 'apport', 'gd-montant': 'montant', 'gd-taux': 'taux', 'gd-tmm': 'tmm', 'gd-marge': 'marge', 'gd-rev': 'revenus', 'gd-chg': 'charges', 'gd-age': 'age' };
        if (map[i.id]) { var v = lire(i.id); g[map[i.id]] = v != null && isFinite(v) ? v : null; }
        if (g.etape === 1) { var C = capital(), n = $('.gd-note', el); if (n) n.textContent = C > 0 ? t('Vous empruntez {m}.', { m: fmtMoney(C) }) : ''; $$('[data-prix],[data-montant]', el).forEach(function (p) { p.setAttribute('aria-pressed', String(+(p.dataset.prix || p.dataset.montant) === (g.prix || g.montant))); }); }
        if (g.etape === 4) budget();
      }
      majBoutons();
      apercu();
    });
    el.addEventListener('focusout', function (ev) {
      var i = ev.target;
      if (i.tagName === 'INPUT' && i.type === 'text' && i.id !== 'gd-age') { var v = lireNombre(i.value); if (isFinite(v)) i.value = fmtSaisie(v); }
    });
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); suivant(); }
    });
    scene();
    var gr = $('#gd-ans-r', el); if (gr) gr.style.setProperty('--pct', '0%');
  }

  /* ===================================================================
     Comparateur visuel A / B
     =================================================================== */
  function ouvrirComparateurAB() {
    var a = scenarios.a, b = scenarios.b;
    if (!b || $('#tab-b').hidden || !a.resultat || !b.resultat) {
      var dd = ouvrirDialogue({
        titre: t('Comparateur A / B'), icone: 'compare',
        corps: '<p class="dlg-sub">' + echapper(t('Il faut deux scénarios calculés. Créez le scénario B (copie de A) puis modifiez la durée, le taux ou l\'apport.')) + '</p>',
        pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button><button class="btn btn-primary" id="ab-creer">' + ico('plus', 'ico-sm') + echapper(t('Créer le scénario B')) + '</button>'
      });
      $('#ab-creer', dd.el).addEventListener('click', function () {
        dd.fermer();
        var ea = a.entrees;
        afficherB(true);
        if (a.resultat) { var v = optionsDe(ea); v.capital = ea.capital; v.mois = ea.mois; v.taux = ea.taux; v.dateDebut = ea.dateDebut; v.client = ea.client; scenarios.b.appliquer(v); }
      });
      return;
    }
    var ra = a.resultat, rb = b.resultat;
    function crd(r) { var pts = [[0, r.C]]; r.lignes.forEach(function (l) { pts.push([l.mois * r.p, resteFin(l)]); }); return pts; }
    function cumul(r) { var s = 0, pts = [[0, 0]]; r.lignes.forEach(function (l) { s += l.paiement + l.assurance + (l.ra ? l.ra.montant + l.ra.indemnite : 0); pts.push([l.mois * r.p, s]); }); return pts; }
    var ca = cumul(ra), cb = cumul(rb), nMax = Math.max(ca[ca.length - 1][0], cb[cb.length - 1][0]);
    function val(pts, m) { var v = 0; for (var i = 0; i < pts.length && pts[i][0] <= m; i++) v = pts[i][1]; return v; }
    var ecart = [];
    for (var m = 0; m <= nMax; m += Math.max(1, Math.round(nMax / 120))) ecart.push([m, val(cb, m) - val(ca, m)]);
    var ticks = ticksAnnees(nMax, 1, ra.debut);
    function ligne(lib, va, vb, fmt, moinsMieux) {
      var mieuxA = moinsMieux ? va < vb : va > vb, egal = Math.abs(va - vb) < 0.0005;
      return '<tr><th scope="row">' + echapper(lib) + '</th><td class="' + (!egal && mieuxA ? 'best' : '') + '">' + echapper(fmt(va)) + '</td><td class="' + (!egal && !mieuxA ? 'best' : '') + '">' + echapper(fmt(vb)) + '</td></tr>';
    }
    var violet = '#8C5000', rose = '#C27A1A';
    ouvrirDialogue({
      titre: t('Comparateur A / B'), sousTitre: echapper(t('Capital restant dû et écart cumulé de paiements, mois par mois.')), icone: 'compare', large: true,
      corps:
        '<div class="cmp-table-wrap"><table class="cmp"><thead><tr><th></th><th><span class="pastille-sc" style="background:' + violet + '">A</span></th><th><span class="pastille-sc" style="background:' + rose + '">B</span></th></tr></thead><tbody>' +
          ligne(t('Mensualité'), ra.M1, rb.M1, fmtMoney, true) +
          ligne(t('Durée'), ra.n * ra.p, rb.n * rb.p, libMois, true) +
          ligne(t('Coût des intérêts'), ra.totI, rb.totI, fmtMoney, true) +
          ligne(t('Coût total du crédit'), ra.coutCredit, rb.coutCredit, fmtMoney, true) +
          ligne(t('TEG'), isFinite(ra.teg) ? ra.teg : 0, isFinite(rb.teg) ? rb.teg : 0, function (v) { return fmtPct(v, 2); }, true) +
        '</tbody></table></div>' +
        '<h3 class="ag-titre">' + echapper(t('Capital restant dû')) + '</h3>' +
        '<div class="graphe-zone">' + grapheLignes([{ pts: crd(ra), c: violet, aire: true }, { pts: crd(rb), c: rose, tirets: true }], { xTicks: ticks, aria: t('Capital restant dû') }) + '</div>' +
        '<p class="legende-g"><span class="lg" style="background:' + violet + ';height:3px"></span>' + echapper(t('Scénario A')) + ' <span class="lg" style="background:' + rose + ';height:3px"></span>' + echapper(t('Scénario B')) + '</p>' +
        '<h3 class="ag-titre">' + echapper(t('Écart cumulé de paiements (B − A)')) + '</h3>' +
        '<div class="graphe-zone">' + grapheLignes([{ pts: ecart, c: '#0891b2', aire: true }], { xTicks: ticks, min0: false, ref: 0, aria: t('Écart cumulé de paiements (B − A)') }) + '</div>' +
        '<p class="ra-note">' + echapper(t('Au-dessus de zéro : B a coûté plus cher que A jusqu\'à ce mois ; en dessous : B est moins cher.')) + '</p>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
  }

  /* ===================================================================
     Réduction de taux : à quel moment la demander ?
     =================================================================== */
  function ouvrirQuandReduire() {
    var sc = scenarioActif(), e = sc.entrees;
    if (!sc.resultat) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    if (e.periodicite !== 1 || e.amort !== 'constant' || e.differe || e.mois <= 84) {
      toast(t('Outil réservé aux crédits mensuels à échéances constantes, sans différé, de plus de 84 mois.'), 'erreur', 5000);
      return;
    }
    var base = calculerEcheancier(Object.assign({}, e, { variation: null }), false), L = base.lignes, n = L.length;
    var ratios = [];
    var s36 = 0;
    for (var k = 1; k <= n; k++) {
      if (k >= 37) { var crdAv = resteFin(L[k - 2]); ratios.push([k, crdAv > 0 ? s36 / crdAv * 100 : 0]); }
      s36 = roundPrec(s36 + L[k - 1].interet - (k > 36 ? L[k - 37].interet : 0));
    }
    if (!ratios.length) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    var zones = [], debutZ = null;
    ratios.forEach(function (r, i) {
      if (r[1] > 8 && debutZ === null) debutZ = r[0];
      if ((r[1] <= 8 || i === ratios.length - 1) && debutZ !== null) { zones.push([debutZ, r[1] > 8 ? r[0] : r[0] - 1]); debutZ = null; }
    });
    var premier = ratios.filter(function (r) { return r[1] > 8; })[0];
    var pos = premier ? premier[0] : 37;
    /* En fin de crédit le capital tend vers 0 et le ratio explose : échelle plafonnée */
    var plafond = Math.max(12, Math.min(60, ratios[0][1] * 1.25));
    var affiches = ratios.map(function (r) { return [r[0], Math.min(r[1], plafond)]; });
    var d = ouvrirDialogue({
      titre: t('Quand demander la réduction ?'), icone: 'down', large: true,
      sousTitre: echapper(t('Ratio intérêts des 36 derniers mois / capital restant dû, à chaque échéance. La réduction est possible au-dessus de 8 % (zones vertes).')),
      corps: '<div class="graphe-zone" id="qr-g"></div>' +
        '<input type="range" class="range" id="qr-r" min="37" max="' + n + '" step="1" value="' + pos + '" aria-label="' + echapper(t('Échéance de la demande')) + '">' +
        '<div id="qr-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
        '<button class="btn btn-primary" id="qr-auto">' + ico('check', 'ico-sm') + echapper(t('Appliquer la règle automatique')) + '</button>'
    });
    var el = d.el;
    function maj() {
      var k = +$('#qr-r', el).value, r = ratios[k - 37], ok = r[1] > 8;
      $('#qr-r', el).style.setProperty('--pct', ((k - 37) / Math.max(1, n - 37) * 100) + '%');
      $('#qr-g', el).innerHTML = grapheLignes([{ pts: affiches, c: '#8C5000' }], { ref: 8, zones: zones, curseur: k, xmin: 37, fmtY: function (v) { return fmtSaisie(Math.round(v * 10) / 10) + ' %'; },
        xTicks: ticksAnnees(n, 1, base.debut).filter(function (x) { return x[0] >= 37; }), aria: t('Évolution du ratio') });
      var res = '';
      var date = L[k - 1].date;
      if (ok) {
        var avec = calculerEcheancier(Object.assign({}, e, { variation: { des: k, delta: -e.taux / 2 } }), false);
        res = '<div class="ra-stats">' + statDlg(t('Demande à l\'échéance {n}', { n: k }), date ? moisLong(date) : '—', 'fort') + statDlg(t('Ratio'), fmtPct(r[1], 3), 'ok', t('au-dessus de 8 % : recevable')) +
          statDlg(t('Nouvelle mensualité'), fmtMoney(avec.lignes[k - 1].paiement), '', t('au lieu de {m}', { m: fmtMoney(base.M1) })) + statDlg(t('Économie d\'intérêts'), fmtMoney(roundPrec(base.totI - avec.totI)), 'ok') + '</div>';
      } else {
        var proch = ratios.filter(function (x) { return x[0] > k && x[1] > 8; })[0];
        res = '<div class="ra-stats">' + statDlg(t('Demande à l\'échéance {n}', { n: k }), date ? moisLong(date) : '—', 'fort') + statDlg(t('Ratio'), fmtPct(r[1], 3), 'ko', t('8 % ou moins : refusée')) +
          statDlg(t('Prochaine date possible'), proch ? (L[proch[0] - 1].date ? moisLong(L[proch[0] - 1].date) : t('échéance {n}', { n: proch[0] })) : t('aucune'), '') + '</div>';
      }
      res += '<p class="ra-note">' + echapper(premier ? t('Plus la demande est tôt, plus l\'économie est grande : première date possible à l\'échéance {n}.', { n: premier[0] }) : t('Le ratio ne dépasse jamais strictement 8 % sur la durée du crédit.')) + '</p>';
      $('#qr-res', el).innerHTML = res;
    }
    $('#qr-r', el).addEventListener('input', maj);
    $('#qr-auto', el).addEventListener('click', function () { d.fermer(); $('#' + sc.cle + '-reduire').click(); });
    maj();
  }

  /* ===================================================================
     Mon crédit en cours : suivi, prochaines réductions, rappels
     =================================================================== */
  var CLE_MON_CREDIT = 'monCredit';
  function lireMonCredit() { try { var m = JSON.parse(stock.lire(CLE_MON_CREDIT, 'null')); return m && m.capital > 0 && m.mois > 0 ? m : null; } catch (e) { return null; } }
  function echeancierMonCredit(m) {
    return calculerEcheancier({ capital: m.capital, mois: m.mois, taux: m.taux, dateDebut: m.date, dureeTotale: m.dureeTotale || m.mois }, !!m.reduction);
  }
  function ouvrirMonCredit() {
    var m = lireMonCredit() || {};
    var d = ouvrirDialogue({
      titre: t('Mon crédit en cours'), icone: 'wallet', large: true,
      sousTitre: echapper(t('Reprenez les chiffres de votre tableau d\'amortissement bancaire : position actuelle, prochaines réductions de taux et rappels.')),
      corps: '<div class="dlg-fields trois">' +
          champDlg('mc-cap', t('Capital restant dû au point de départ'), t('Ex. 102 816,611'), unite(), 'cash', m.capital ? fmtSaisie(m.capital) : null) +
          '<div class="field"><label for="mc-date">' + echapper(t('Date de la 1re échéance suivante')) + '</label><div class="input-wrap">' + ico('calendar') + '<input id="mc-date" type="date" value="' + echapper(m.date || '') + '"></div></div>' +
          champDlg('mc-n', t('Échéances restantes'), t('Ex. 155'), t('mois'), 'clock', m.mois ? String(m.mois) : null, 'numeric') +
          champDlg('mc-taux', t('Taux annuel actuel'), t('Ex. 2,25'), '%', 'percent', m.taux != null ? fmtSaisie(m.taux) : null) +
          champDlg('mc-total', t('Durée initiale du crédit'), t('Ex. 300'), t('mois'), 'flag', m.dureeTotale ? String(m.dureeTotale) : null, 'numeric') +
          '<label class="check mc-check"><input type="checkbox" id="mc-red"' + (m.reduction !== false ? ' checked' : '') + '><span class="check-box" aria-hidden="true">' + ico('check', 'ico-sm') + '</span>' + echapper(t('Prévoir les réductions de taux')) + '</label>' +
        '</div>' +
        '<p class="opt-note" style="margin-top:8px">' + echapper(t('Point de départ : le début du crédit, ou la date de la dernière réduction de taux (le contrôle suivant a lieu 36 mois plus tard).')) + '</p>' +
        '<div id="mc-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
        '<button class="btn btn-ghost" id="mc-import">' + ico('scan', 'ico-sm') + echapper(t('Importer le tableau de la banque')) + '</button>' +
        '<button class="btn btn-ghost" id="mc-rappel">' + ico('calendar', 'ico-sm') + echapper(t('Rappels des échéances')) + '</button>' +
        '<button class="btn btn-primary" id="mc-ouvrir">' + ico('upload', 'ico-sm') + echapper(t('Ouvrir dans le scénario A')) + '</button>'
    });
    var el = d.el, courant = null;
    function lireForm() {
      var x = { capital: valeurDlg(el, 'mc-cap'), date: $('#mc-date', el).value, mois: lireEntier($('#mc-n', el).value), taux: valeurDlg(el, 'mc-taux'), dureeTotale: lireEntier($('#mc-total', el).value), reduction: $('#mc-red', el).checked };
      if (!(x.dureeTotale > 0)) x.dureeTotale = x.mois;
      return x.capital > 0 && x.mois >= 1 && x.mois <= 300 && x.taux >= 0 && x.taux < 100 && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x : null;
    }
    function calculer() {
      var x = lireForm(), zone = $('#mc-res', el);
      courant = x;
      if (!x) { zone.innerHTML = '<p class="dlg-sub" style="margin-top:14px">' + echapper(t('Renseignez le capital restant dû, la date, le nombre d\'échéances et le taux.')) + '</p>'; return; }
      stock.ecrire(CLE_MON_CREDIT, JSON.stringify(x));
      var r = echeancierMonCredit(x), auj = new Date();
      var passees = r.lignes.filter(function (l) { return l.date && new Date(l.date.getFullYear(), l.date.getMonth() + 1, 0) < auj; }).length;
      var proch = r.lignes[passees];
      var crd = passees ? resteFin(r.lignes[passees - 1]) : r.C;
      var pct = (1 - crd / r.C) * 100;
      zone.innerHTML =
        '<div class="ra-stats" style="margin-top:14px">' +
          statDlg(t('Capital restant dû aujourd\'hui'), fmtMoney(crd), 'fort', t('{p} remboursé depuis le point de départ', { p: fmtPct(pct, 1) })) +
          statDlg(t('Prochaine échéance'), proch ? fmtMoney(proch.paiement) : '—', '', proch && proch.date ? t('fin {d}', { d: moisLong(proch.date) }) : '') +
          statDlg(t('Échéances restantes'), String(r.n - passees), '', r.lignes.length ? t('dernière : {d}', { d: moisLong(r.lignes[r.lignes.length - 1].date) }) : '') +
          statDlg(t('Intérêts restants'), fmtMoney(roundPrec(r.lignes.slice(passees).reduce(function (s, l) { return s + l.interet; }, 0))), '') +
        '</div>' +
        (x.reduction ? (r.reductions.length
          ? '<h3 class="ag-titre">' + echapper(t('Prochaines réductions de taux')) + '</h3><div class="mc-reducs">' + r.reductions.map(function (z, i) {
              return '<div class="mc-reduc"><span class="mc-n">' + (i + 1) + '</span><div><strong>' + echapper(z.date ? moisLong(z.date) : t('échéance {n}', { n: z.mois })) + '</strong><small>' + echapper(t('Ratio {r} · {a} → {b} · mensualité {m}', { r: fmtPct(z.ratio * 100, 3), a: fmtTauxPrecis(z.avant), b: fmtTauxPrecis(z.apres), m: fmtMoney(z.M) })) + '</small></div></div>';
            }).join('') + '</div>'
          : '<p class="ra-note">' + echapper(t('Aucune réduction de taux possible : le ratio ne dépasse pas 8 % ou la durée initiale est de 84 mois ou moins.')) + '</p>') : '') +
        '<div class="graphe-zone" style="margin-top:12px">' + grapheLignes([{ pts: [[0, r.C]].concat(r.lignes.map(function (l) { return [l.mois, resteFin(l)]; })), c: '#8C5000', aire: true }], { xTicks: ticksAnnees(r.n, 1, r.debut), curseur: passees, aria: t('Capital restant dû') }) + '</div>';
    }
    el.addEventListener('input', function () { clearTimeout(el._t); el._t = setTimeout(calculer, 200); });
    el.addEventListener('change', function (ev) { if (ev.target.type === 'checkbox' || ev.target.type === 'date') calculer(); });
    $('#mc-import', el).addEventListener('click', function () { d.fermer(); setTimeout(function () { ouvrirAudit(); }, 200); });
    $('#mc-ouvrir', el).addEventListener('click', function () {
      if (!courant) { toast(t('Il manque le capital, la durée ou le taux : complétez les champs.'), 'erreur'); return; }
      d.fermer();
      activer('a');
      scenarios.a.appliquer({ capital: courant.capital, mois: courant.mois, taux: courant.taux, dateDebut: courant.date, reduction: courant.reduction && courant.dureeTotale > 84 && courant.mois > 84, tmm: null, type: 'immo' });
      toast(t('Crédit ouvert dans le scénario A.'));
    });
    $('#mc-rappel', el).addEventListener('click', function () {
      if (!courant) { toast(t('Il manque le capital, la durée ou le taux : complétez les champs.'), 'erreur'); return; }
      courant.rappels = true;
      stock.ecrire(CLE_MON_CREDIT, JSON.stringify(courant));
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(function () { rappelEcheance(true); });
      else rappelEcheance(true);
      d.fermer();
      activer('a');
      scenarios.a.appliquer({ capital: courant.capital, mois: courant.mois, taux: courant.taux, dateDebut: courant.date, reduction: courant.reduction && courant.mois > 84, tmm: null });
      setTimeout(function () { exporterAgenda(scenarios.a); }, 300);
    });
    calculer();
  }

  /* Rappel à l'ouverture de l'application : échéance dans les 5 jours */
  function rappelEcheance(force) {
    var m = lireMonCredit();
    if (!m || (!m.rappels && !force)) return;
    var r = echeancierMonCredit(m), auj = new Date(), j0 = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
    var proch = r.lignes.filter(function (l) { return l.date && new Date(l.date.getFullYear(), l.date.getMonth() + 1, 0) >= j0; })[0];
    if (!proch) return;
    var fin = new Date(proch.date.getFullYear(), proch.date.getMonth() + 1, 0);
    var jours = Math.round((fin - j0) / 86400000);
    var msg = t('Prochaine échéance de {m} le {d}.', { m: fmtMoney(proch.paiement), d: fin.toLocaleDateString(enArabe() ? 'ar-TN-u-nu-latn' : 'fr-FR') });
    if (jours <= 5 || force) {
      toast(msg, 'info', 6000);
      if (jours <= 5 && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(t('Simulateur de crédit'), { body: msg, icon: 'icons/icon-192.png', tag: 'echeance-' + proch.mois }); } catch (e) { /* notifications indisponibles */ }
      }
    }
  }

  /* ===================================================================
     Mode présentation client (plein écran)
     =================================================================== */
  function ouvrirPresentation() {
    var cles = ['a', 'b'].filter(function (k) { return scenarios[k] && scenarios[k].resultat && !(k === 'b' && $('#tab-b').hidden); });
    if (!cles.length) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    var idx = Math.max(0, cles.indexOf(actif));
    var ov = document.createElement('div');
    ov.className = 'presentation';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', t('Mode présentation'));
    document.body.appendChild(ov);
    var precedent = document.activeElement;
    ['.topbar', '.coque'].forEach(function (s) { var x = $(s); if (x) x.inert = true; });
    function rendre() {
      var sc = scenarios[cles[idx]], r = sc.resultat, e = sc.entrees, em = e.emprunteur;
      var lp = r.lignes[Math.min(r.D, r.lignes.length - 1)];
      var endet = em && em.revenus ? (totalLigne(lp) / r.p + em.charges) / em.revenus * 100 : NaN;
      var pc = r.C / (r.C + r.totI) * 100;
      ov.innerHTML =
        '<div class="pr-haut">' +
          '<div class="pr-marque">' + (agence.logo ? '<img src="' + echapper(agence.logo) + '" alt="" width="' + agence.logoL + '" height="' + agence.logoH + '">' : '<span class="brand-mark">' + ico('amort') + '</span>') +
            '<div><strong>' + echapper(agence.nom || t('Simulateur de crédit')) + '</strong><small>' + echapper(e.client.nom ? t('Étude préparée pour {n}', { n: e.client.nom }) : t('Votre projet de crédit')) + '</small></div></div>' +
          '<div class="pr-ctrl">' + (cles.length > 1 ? cles.map(function (k, i) { return '<button type="button" class="pr-sc" data-i="' + i + '" aria-pressed="' + (i === idx) + '">' + echapper(t('Scénario {n}', { n: scenarios[k].nom })) + '</button>'; }).join('') : '') +
            '<button type="button" class="btn btn-ghost btn-icon pr-x" data-pr-fermer aria-label="' + echapper(t('Quitter la présentation')) + '">' + ico('x') + '</button></div>' +
        '</div>' +
        '<div class="pr-centre">' +
          '<p class="pr-lib">' + echapper(t(infoPeriodicite(r.p).echeance)) + '</p>' +
          '<p class="pr-val num" id="pr-val"></p>' +
          '<p class="pr-sous">' + echapper(r.paliers.length > 1 || r.D || r.amort !== 'constant' ? texteEcheances(r, fmtMoney) : t('pendant {n}', { n: r.p === 1 ? libMois(r.n) : libEcheances(r.n) })) + '</p>' +
          '<div class="pr-barre" role="img" aria-label="' + echapper(t('Capital {c}, intérêts {i}', { c: fmtPct(pc, 1), i: fmtPct(100 - pc, 1) })) + '"><span style="--w:' + pc + '%"></span></div>' +
          '<div class="pr-legende"><span><i class="c"></i>' + echapper(t('Capital')) + ' ' + echapper(fmtMoney(r.C)) + '</span><span><i class="i"></i>' + echapper(t('Intérêts')) + ' ' + echapper(fmtMoney(r.totI)) + '</span></div>' +
        '</div>' +
        '<div class="pr-tuiles">' +
          '<div><span>' + echapper(t('Durée')) + '</span><b>' + echapper(libMois(r.n * r.p)) + '</b></div>' +
          '<div><span>' + echapper(t('Taux annuel')) + '</span><b>' + echapper(fmtTaux(e.taux)) + '</b></div>' +
          '<div><span>' + echapper(t('TEG')) + '</span><b>' + echapper(isFinite(r.teg) ? fmtPct(r.teg, 2) : '—') + '</b></div>' +
          '<div><span>' + echapper(t('Coût du crédit')) + '</span><b>' + echapper(fmtMoney(r.coutCredit)) + '</b></div>' +
          (isFinite(endet) ? '<div class="' + (endet <= agence.endettementMax ? 'ok' : 'ko') + '"><span>' + echapper(t('Endettement')) + '</span><b>' + echapper(fmtPct(endet, 1)) + '</b></div>' : '') +
        '</div>' +
        '<p class="pr-pied">' + echapper(t('Simulation indicative, ne constitue pas une offre de prêt.')) + (ligneAgence() ? ' · ' + echapper(ligneAgence()) : '') + '</p>';
      var v = $('#pr-val', ov);
      v.dataset.val = 0;
      odometre(v, r.M1);
    }
    function fermer() {
      document.removeEventListener('keydown', clavier);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      ov.classList.add('sortie');
      ['.topbar', '.coque'].forEach(function (s) { var x = $(s); if (x) x.inert = false; });
      setTimeout(function () { ov.remove(); if (precedent && precedent.focus) precedent.focus(); }, mouvementReduit.matches ? 0 : 260);
    }
    function clavier(ev) {
      if (ev.key === 'Escape') fermer();
      else if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && cles.length > 1) { idx = (idx + 1) % cles.length; rendre(); }
    }
    ov.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-pr-fermer]')) { fermer(); return; }
      var b = ev.target.closest('.pr-sc');
      if (b) { idx = +b.dataset.i; rendre(); }
    });
    document.addEventListener('keydown', clavier);
    document.addEventListener('fullscreenchange', function surSortie() { if (!document.fullscreenElement && ov.isConnected && ov._plein) { document.removeEventListener('fullscreenchange', surSortie); fermer(); } });
    rendre();
    if (ov.requestFullscreen) ov.requestFullscreen().then(function () { ov._plein = true; }).catch(function () {});
    setTimeout(function () { var x = $('[data-pr-fermer]', ov); if (x) x.focus(); }, 60);
  }

  /* ===================================================================
     Calendrier visuel des échéances (part d'intérêts de chaque échéance)
     =================================================================== */
  function ouvrirCalendrier() {
    var sc = scenarioActif(), r = sc.resultat;
    if (!r) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    var debut = r.debut, auj = new Date(), parAn = 12 / r.p;
    var annees = {}, ordre = [];
    r.lignes.forEach(function (l) {
      var an = l.date ? l.date.getFullYear() : Math.ceil(l.mois / parAn), mo = l.date ? l.date.getMonth() : ((l.mois - 1) % parAn) * r.p;
      if (!annees[an]) { annees[an] = {}; ordre.push(an); }
      annees[an][mo] = l;
    });
    var noms = [];
    for (var m = 0; m < 12; m++) noms.push(new Date(2026, m, 1).toLocaleDateString(enArabe() ? 'ar-TN-u-nu-latn' : 'fr-FR', { month: 'narrow' }));
    var html = '<div class="cal" style="direction:ltr"><div class="cal-ligne cal-tete"><span></span>' + noms.map(function (n) { return '<span>' + echapper(n) + '</span>'; }).join('') + '</div>' +
      ordre.map(function (an) {
        return '<div class="cal-ligne"><span class="cal-an">' + echapper(debut ? String(an) : t('An {n}', { n: an })) + '</span>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (mo) {
          var l = annees[an][mo];
          if (!l) return '<span class="cal-c vide"></span>';
          var tot = l.paiement > 0 ? l.paiement : 1, part = Math.max(0, Math.min(1, l.interet / tot));
          var cls = 'cal-c' + (l.ra ? ' ra' : '') + (l.reduction ? ' red' : '') + (l.date && l.date.getFullYear() === auj.getFullYear() && l.date.getMonth() === auj.getMonth() ? ' auj' : '');
          var tip = (l.date ? moisAnnee(l.date) + ' · ' : '') + t('Échéance {n}', { n: l.mois }) + ' · ' + t('Intérêts') + ' ' + fmtMoney(l.interet) + ' · ' + t('Principal') + ' ' + fmtMoney(l.principal);
          return '<button type="button" class="' + cls + '" data-m="' + l.mois + '" style="--p:' + part.toFixed(3) + '" title="' + echapper(tip) + '" aria-label="' + echapper(tip) + '"></button>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    var d = ouvrirDialogue({
      titre: t('Calendrier des échéances'), icone: 'calendar', large: true,
      sousTitre: echapper(t('Chaque case est une échéance : plus elle est foncée, plus elle est composée d\'intérêts. Touchez une case pour la voir dans le tableau.')),
      corps: html + '<div class="cal-leg"><span>' + echapper(t('Surtout du capital')) + '</span><i></i><span>' + echapper(t('Surtout des intérêts')) + '</span>' +
        (r.ras.length ? '<span class="cal-k ra"></span>' + echapper(t('Remboursement anticipé')) : '') + (r.reductions && r.reductions.length ? '<span class="cal-k red"></span>' + echapper(t('Taux réduit')) : '') + '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    d.el.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-m]');
      if (!c) return;
      d.fermer();
      setTimeout(function () { sc.allerLigne(+c.dataset.m); }, 200);
    });
  }

  /* ===================================================================
     Signature électronique du rapport client
     =================================================================== */
  function padSignature(canvas) {
    var ctx = canvas.getContext('2d'), dessine = false, vide = true, dernier = null;
    function taille() {
      var r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#161229'; ctx.lineWidth = 2.4;
    }
    taille();
    function point(ev) { var r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
    canvas.addEventListener('pointerdown', function (ev) { dessine = true; dernier = point(ev); canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); });
    canvas.addEventListener('pointermove', function (ev) {
      if (!dessine) return;
      var p = point(ev);
      ctx.beginPath(); ctx.moveTo(dernier[0], dernier[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      dernier = p; vide = false; canvas.classList.add('signe');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { canvas.addEventListener(n, function () { dessine = false; }); });
    return {
      effacer: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); vide = true; canvas.classList.remove('signe'); },
      image: function () { return vide ? null : canvas.toDataURL('image/png'); }
    };
  }

  function preparerRapport(sc) {
    if (!exigerResultat(sc)) return;
    var d = ouvrirDialogue({
      titre: t('Rapport client'), icone: 'award', large: true,
      sousTitre: echapper(t('Faites signer le client et le conseiller à l\'écran (au doigt ou à la souris), ou générez le rapport sans signature.')),
      corps: '<div class="sig-grille">' +
          '<div class="sig"><div class="sig-tete"><strong>' + echapper(t('Signature du client')) + '</strong><button type="button" class="btn btn-quiet btn-sm" data-sig-effacer="0">' + ico('reset', 'ico-sm') + echapper(t('Effacer')) + '</button></div><canvas class="sig-pad" aria-label="' + echapper(t('Zone de signature du client')) + '"></canvas><small>' + echapper(sc.entrees.client.nom || '') + '</small></div>' +
          '<div class="sig"><div class="sig-tete"><strong>' + echapper(t('Signature du conseiller')) + '</strong><button type="button" class="btn btn-quiet btn-sm" data-sig-effacer="1">' + ico('reset', 'ico-sm') + echapper(t('Effacer')) + '</button></div><canvas class="sig-pad" aria-label="' + echapper(t('Zone de signature du conseiller')) + '"></canvas><small>' + echapper(agence.conseiller || '') + '</small></div>' +
        '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Annuler')) + '</button>' +
            '<button class="btn btn-primary" id="sig-ok">' + ico('award', 'ico-sm') + echapper(t('Générer le rapport')) + '</button>'
    });
    var pads = $$('.sig-pad', d.el).map(padSignature);
    d.el.addEventListener('click', function (ev) { var b = ev.target.closest('[data-sig-effacer]'); if (b) pads[+b.dataset.sigEffacer].effacer(); });
    $('#sig-ok', d.el).addEventListener('click', function () {
      var signatures = { client: pads[0].image(), conseiller: pads[1].image() };
      d.fermer();
      exporterRapport(sc, signatures);
    });
  }

  /* ===================================================================
     Chiffres qui défilent (compteur à rouleaux)
     =================================================================== */
  function odometre(el, v) {
    var texte = fmtNombre(v).replace(/[⁦-⁩]/g, '');
    el.dataset.val = v;
    if (mouvementReduit.matches) { el.innerHTML = fmtMoneyHtml(v); return; }
    var zone = el.querySelector('.odo');
    var gabarit = texte.replace(/\d/g, '0');
    if (!zone || zone.dataset.gabarit !== gabarit) {
      el.innerHTML = '<span class="sr-only odo-lu"></span><span class="odo" aria-hidden="true" dir="ltr" data-gabarit="' + echapper(gabarit) + '">' + texte.split('').map(function (c) {
        return /\d/.test(c) ? '<span class="odo-c"><span class="odo-s" style="transform:translateY(0)">0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</span></span>' : '<span class="odo-x">' + echapper(c) + '</span>';
      }).join('') + '</span><span class="unit" aria-hidden="true">' + echapper(unite()) + '</span>';
      zone = el.querySelector('.odo');
      void zone.offsetWidth;
    }
    el.querySelector('.odo-lu').textContent = fmtMoney(v);
    var col = zone.querySelectorAll('.odo-s'), j = 0;
    texte.split('').forEach(function (c) { if (/\d/.test(c)) { col[j].style.transform = 'translateY(-' + (+c * 10) + '%)'; col[j].style.transitionDelay = (j * 18) + 'ms'; j++; } });
  }

  /* ===================================================================
     Transitions fluides entre les vues (View Transitions)
     =================================================================== */
  function transition(fn, origine) {
    if (!document.startViewTransition || mouvementReduit.matches) { fn(); return; }
    if (origine) {
      document.documentElement.style.setProperty('--vt-x', origine[0] + 'px');
      document.documentElement.style.setProperty('--vt-y', origine[1] + 'px');
      document.documentElement.classList.add('vt-cercle');
    }
    var vt = document.startViewTransition(fn);
    vt.finished.then(function () { document.documentElement.classList.remove('vt-cercle'); }, function () { document.documentElement.classList.remove('vt-cercle'); });
  }

  /* ===================================================================
     État de l'affichage dans l'adresse (#vue=annuel&aff=graphique&sc=b)
     =================================================================== */
  function ecrireEtatUrl() {
    var sc = scenarioActif();
    if (!sc) return;
    var p = [];
    if (actif === 'b') p.push('sc=b');
    if (sc.vue === 'annuel') p.push('vue=annuel');
    if (sc.aff === 'graphique') p.push('aff=graphique');
    var h = p.length ? '#' + p.join('&') : '';
    if (location.hash !== h) { try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* adresse non modifiable */ } }
  }
  function lireEtatUrl() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!/(^|&)(vue|aff|sc)=/.test(h)) return;
    var q = {};
    h.split('&').forEach(function (x) { var kv = x.split('='); q[kv[0]] = kv[1]; });
    if (q.sc === 'b' && scenarios.b && !$('#tab-b').hidden) activer('b');
    var sc = scenarioActif(), racine = sc.racine;
    if (q.vue === 'annuel') { var bv = $('[data-vue="annuel"]', racine); if (bv) bv.click(); }
    if (q.aff === 'graphique') { var ba = $('[data-aff="graphique"]', racine); if (ba) ba.click(); }
  }

  /* ===================================================================
     Mode haute lisibilité
     =================================================================== */
  var CLE_LISIBLE = 'hauteLisibilite';
  function appliquerLisibilite(on) {
    document.documentElement.classList.toggle('lisible', on);
    stock.ecrire(CLE_LISIBLE, on ? '1' : '0');
    var b = $('#btnLisible');
    if (b) { b.setAttribute('aria-pressed', String(on)); }
    setTimeout(function () { if (typeof placerIndicateur === 'function') placerIndicateur(); }, 60);
  }
  function basculerLisibilite() {
    var on = !document.documentElement.classList.contains('lisible');
    appliquerLisibilite(on);
    toast(on ? t('Haute lisibilité activée : textes agrandis et contrastes renforcés.') : t('Haute lisibilité désactivée.'), 'info');
  }

  function initialiserComplet() {
    if (stock.lire(CLE_LISIBLE, '0') === '1') appliquerLisibilite(true);
    var bg = $('#btnGuide');
    if (bg) bg.addEventListener('click', ouvrirGuide);
    lireEtatUrl();
    setTimeout(function () { rappelEcheance(false); }, 1500);
  }

  /* ===================================================================
     Lecture d'un tableau d'amortissement bancaire (PDF texte, PDF scanné,
     photo ou texte collé) puis audit ligne par ligne
     =================================================================== */
  var URL_PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var URL_PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var dernierAudit = null;

  function chargerPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return chargerScript(URL_PDFJS).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL_PDFJS_WORKER;
      return window.pdfjsLib;
    });
  }
  function chargerTesseract() { return window.Tesseract ? Promise.resolve(window.Tesseract) : chargerScript(URL_TESSERACT).then(function () { return window.Tesseract; }); }

  /* Texte d'un PDF : couche texte si elle existe, sinon reconnaissance de texte des pages */
  function lireFichiersTableau(fichiers, progres) {
    var textes = [], i = 0;
    function suivant() {
      if (i >= fichiers.length) return Promise.resolve(textes.join('\n'));
      var f = fichiers[i++];
      var estPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      var p = estPdf ? lirePdf(f, progres) : ocrImages([f], progres);
      return p.then(function (t) { textes.push(t); return suivant(); });
    }
    return suivant();
  }
  function lirePdf(fichier, progres) {
    return chargerPdfjs().then(function (pdfjs) {
      return fichier.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: buf }).promise; });
    }).then(function (pdf) {
      var pages = [], texte = '';
      for (var n = 1; n <= pdf.numPages; n++) pages.push(n);
      return pages.reduce(function (pr, n) {
        return pr.then(function () {
          return pdf.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            var lignes = {};
            tc.items.forEach(function (it) { var y = Math.round(it.transform[5] / 2) * 2; (lignes[y] = lignes[y] || []).push([it.transform[4], it.str]); });
            texte += Object.keys(lignes).sort(function (a, b) { return b - a; }).map(function (y) {
              return lignes[y].sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; }).join(' ');
            }).join('\n') + '\n';
          });
        });
      }, Promise.resolve()).then(function () {
        if (analyserTableau(texte).lignes.length >= 3) return texte;
        /* PDF scanné : rendu des pages puis reconnaissance de texte */
        progres(0.02, t('PDF scanné : reconnaissance du texte des pages…'));
        var toiles = [];
        return pages.reduce(function (pr, n) {
          return pr.then(function () {
            return pdf.getPage(n).then(function (pg) {
              var vp = pg.getViewport({ scale: 2.2 }), c = document.createElement('canvas');
              c.width = vp.width; c.height = vp.height;
              return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { toiles.push(c); });
            });
          });
        }, Promise.resolve()).then(function () { return ocrImages(toiles, progres); });
      });
    });
  }
  function ocrImages(images, progres) {
    var page = 0;
    return chargerTesseract().then(function (T) {
      return T.createWorker('fra', 1, {
        logger: function (m) { if (m && m.status === 'recognizing text') progres((page + m.progress) / images.length, t('Lecture de la page {a} sur {b}…', { a: page + 1, b: images.length })); }
      });
    }).then(function (w) {
      var texte = '';
      return images.reduce(function (pr, img, k) {
        return pr.then(function () { page = k; return w.recognize(img).then(function (r) { texte += r.data.text + '\n'; }); });
      }, Promise.resolve()).then(function () { return w.terminate().then(function () { return texte; }, function () { return texte; }); });
    });
  }

  /* Montant bancaire : « 102 816,611 », « 1012,500 », « 1641841 » (virgule perdue) */
  var RE_MONTANT_BANQUE = /\d+(?:[   ]\d{3})*[,.]\d{3}(?!\d)|\d{4,}/g;
  function montantBanque(s) {
    var c = s.replace(/[   ]/g, '');
    if (/[,.]\d{3}$/.test(c)) return parseFloat(c.replace(',', '.'));
    return parseInt(c, 10) / 1000;
  }

  function analyserTableau(texte) {
    var brut = String(texte || '');
    var info = {};
    var m;
    if ((m = /dur[ée]e\s*:?\s*(\d{2,3})\s*mois/i.exec(brut))) info.dureeTotale = parseInt(m[1], 10);
    if ((m = /cr[ée]dit\s*:?\s*(\d{6,})/i.exec(brut))) info.numero = m[1];
    if ((m = /titulaire\s*:?\s*([A-ZÀ-Ÿ' -]{4,60})/i.exec(brut))) info.titulaire = m[1].trim().replace(/\s{2,}.*/, '');
    if ((m = /(?:mt|montant)\s+d[ée]bloqu[ée]\s*:?\s*([\d .,]+)/i.exec(brut))) info.debloque = parseFloat(m[1].replace(/\s/g, '').replace(/[.,](\d{3})$/, '.$1'));
    var banques = [['BH Bank', /\bBH\b|BH\s*BANK/i], ['BIAT', /\bBIAT\b/i], ['STB', /\bSTB\b|soci[ée]t[ée] tunisienne de banque/i], ['BNA', /\bBNA\b|banque nationale agricole/i], ['Attijari Bank', /attijari/i], ['Amen Bank', /amen\s*bank/i], ['UIB', /\bUIB\b/i], ['Banque de Tunisie', /banque de tunisie|\bBT\b/], ['ATB', /\bATB\b|arab tunisian bank/i], ['UBCI', /\bUBCI\b/i], ['QNB', /\bQNB\b/i], ['Banque Zitouna', /zitouna/i], ['Wifak Bank', /wifak/i], ['Al Baraka', /baraka/i], ['BTK', /\bBTK\b/i], ['BTL', /\bBTL\b/i], ['TSB', /\bTSB\b/i]];
    banques.some(function (b) { if (b[1].test(brut)) { info.banque = b[0]; return true; } return false; });
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
    var cles = Object.keys(parDate).map(Number).sort(function (a, b) { return a - b; });
    var lignes = cles.map(function (c) { return parDate[c]; });
    if (lignes.length < 3) return { info: info, lignes: [] };
    /* Rôle des colonnes, quel que soit leur ordre : on cherche la disposition
       (capital dû, amortissement, intérêts, échéance) qui vérifie le plus
       souvent « échéance = amortissement + intérêts + accessoires », la
       continuité du capital, et un intérêt mensuel plausible */
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
      var sig = cs.split(',').map(Number), score = votes[cs] * 2, stab = 0, prec = null;
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
        l.extras = Math.abs(v[q[1]] + v[q[2]] - v[q[3]]) <= 0.002 ? 0 : roundPrec(ex);
        l.coherente = coherent(v, q);
      }
      l.n = n0 + 1;
    });
    return { info: info, lignes: lignes };
  }

  function auditerTableau(tab) {
    var L = tab.lignes, n = L.length, anomalies = [], infos = [], i;
    if (!n) return null;
    /* Convention du capital restant dû : avant ou après l'échéance */
    var avant = 0, apres = 0;
    for (i = 0; i + 1 < n; i++) {
      if (Math.abs(roundPrec(L[i].crd - L[i].am) - L[i + 1].crd) <= 0.002) avant++;
      if (Math.abs(roundPrec(L[i].crd - L[i + 1].am) - L[i + 1].crd) <= 0.002) apres++;
    }
    var convAvant = avant >= apres;
    /* Recoupements pour corriger les chiffres mal lus (photo, scan) :
       chaque ligne contient une redondance (échéance = amortissement +
       intérêts + accessoires ; capital suivant = capital − amortissement) */
    function suit(i, j) { return L[i] && L[j] && L[j].cle - L[i].cle === 1; }
    function echVoisine(i) { for (var d = 1; d < 5; d++) { if (L[i - d] && L[i - d].coherente) return L[i - d].ech; if (L[i + d] && L[i + d].coherente) return L[i + d].ech; } return NaN; }
    L.forEach(function (l, i) {
      if (l.coherente) return;
      var somme = roundPrec(l.am + l.int + l.extras), voisine = echVoisine(i);
      if (Math.abs(somme - voisine) <= 0.002 || (!isFinite(l.ech) && isFinite(somme))) { l.ech = somme; l.coherente = true; l.corrige = t('échéance'); return; }
      if (Math.abs(l.ech - voisine) <= 0.002 && suit(i, i + 1)) {
        var amC = convAvant ? roundPrec(l.crd - L[i + 1].crd) : roundPrec(l.crd - (L[i - 1] ? L[i - 1].crd : NaN));
        if (isFinite(amC) && Math.abs(roundPrec(amC + l.int + l.extras) - l.ech) <= 0.002) { l.am = amC; l.coherente = true; l.corrige = t('amortissement'); return; }
        var intC = roundPrec(l.ech - l.am - l.extras);
        if (intC >= 0) { l.int = intC; l.coherente = true; l.corrige = t('intérêts'); }
      }
    });
    for (i = 1; i + 1 < n; i++) {
      var pr = L[i - 1], cu = L[i], nx = L[i + 1];
      if (!suit(i - 1, i) || !suit(i, i + 1)) continue;
      var att = convAvant ? roundPrec(pr.crd - pr.am) : roundPrec(pr.crd - cu.am);
      var suivant = convAvant ? roundPrec(att - cu.am) : roundPrec(att - nx.am);
      if (Math.abs(cu.crd - att) > 0.002 && Math.abs(suivant - nx.crd) <= 0.002) { cu.crd = att; cu.corrige = t('capital restant dû'); }
    }
    var corriges = L.filter(function (l) { return l.corrige; });
    if (corriges.length) infos.push({ g: 'info', i: L.indexOf(corriges[0]), txt: t('{n} chiffre(s) mal lu(s) corrigé(s) par recoupement (échéances {l}).', { n: corriges.length, l: corriges.map(function (l) { return l.n; }).join(', ') }) });
    L.forEach(function (l, i) { l.crdAv = convAvant ? l.crd : (i ? L[i - 1].crd : roundPrec(l.crd + l.am)); l.crdAp = roundPrec(l.crdAv - l.am); });
    /* Mois manquants */
    /* Périodicité du tableau (1 = mensuel, 3 = trimestriel, 12 = annuel) */
    var ecarts = {};
    for (i = 1; i < n; i++) { var g0 = L[i].cle - L[i - 1].cle; ecarts[g0] = (ecarts[g0] || 0) + 1; }
    var periode = +Object.keys(ecarts).sort(function (x, y) { return ecarts[y] - ecarts[x]; })[0] || 1;
    if (periode > 1) infos.push({ g: 'info', i: 0, txt: t('Tableau à échéances tous les {n} mois : les contrôles de taux sont faits sur cette base.', { n: periode }) });
    for (i = 1; i < n; i++) {
      var saut = (L[i].cle - L[i - 1].cle) / periode;
      if (saut > 1 && saut === Math.round(saut)) anomalies.push({ g: 'lecture', i: i, txt: t('{n} échéance(s) absente(s) entre {a} et {b} : page manquante ou ligne illisible.', { n: saut - 1, a: moisAnnee(L[i - 1].date), b: moisAnnee(L[i].date) }) });
    }
    /* Taux de chaque ligne et phases */
    L.forEach(function (l) { l.taux = l.crdAv > 0 && isFinite(l.int) ? l.int / l.crdAv * 1200 / periode : NaN; });
    var phases = [], cur = null;
    L.forEach(function (l, i) {
      if (!l.coherente || !isFinite(l.taux)) return;
      var tr = Math.round(l.taux * 1000) / 1000;
      var derniereLigne = i === L.length - 1 && cur && Math.abs(tr - cur.tauxBrut) <= 0.02;
      if (!cur || Math.abs(tr - cur.tauxBrut) > 0.02 || (Math.abs(l.ech - cur.derniere) > 0.0015 && !derniereLigne)) { cur = { debut: i, fin: i, tauxBrut: tr, valeurs: [], ech: {} }; phases.push(cur); }
      cur.derniere = l.ech;
      cur.fin = i; cur.valeurs.push(tr);
      cur.ech[l.ech] = (cur.ech[l.ech] || 0) + 1;
    });
    phases.forEach(function (ph) {
      var sI = 0, sC = 0;
      for (var q = ph.debut; q <= ph.fin; q++) if (L[q].coherente && isFinite(L[q].int)) { sI += L[q].int; sC += L[q].crdAv; }
      var moy = sC > 0 ? sI * 1200 / periode / sC : ph.valeurs[0];
      ph.taux = Math.round(moy * 10000) / 10000;
      [4, 3, 2, 1].forEach(function (d) { var r = Math.round(moy * Math.pow(10, d)) / Math.pow(10, d); var nb = ph.fin - ph.debut + 1; if (Math.abs(r - moy) < 0.00005 + 0.6 / Math.max(1, sC / nb) / Math.sqrt(nb)) ph.taux = r; });
      ph.echeance = +Object.keys(ph.ech).sort(function (a, b) { return ph.ech[b] - ph.ech[a]; })[0];
    });
    /* Une phase d'une seule ligne prend le taux de la phase voisine au taux proche :
       une ligne erronée ne doit pas fixer son propre taux de référence */
    phases.forEach(function (ph, k) {
      if (ph.fin > ph.debut) return;
      [phases[k - 1], phases[k + 1]].some(function (vo) { if (vo && vo.fin > vo.debut && Math.abs(vo.taux - ph.taux) < 0.02) { ph.taux = vo.taux; return true; } return false; });
    });
    /* Taux différent presque à chaque ligne : ce n'est pas un échéancier détaillé
       (par exemple un récapitulatif annuel) ; pas de contrôle au millime */
    if (phases.length > Math.max(3, n / 3)) {
      var res0 = { info: tab.info, lignes: L, phases: [], anomalies: [{ g: 'lecture', i: 0, txt: t('Ce document ne ressemble pas à un tableau d\'amortissement détaillé (taux différent à chaque ligne). Utilisez le tableau complet fourni par la banque, échéance par échéance.') }], infos: infos, reductions: [], possibles: [],
        convAvant: convAvant, complet: false, totI: roundPrec(L.reduce(function (a, l) { return a + (l.int || 0); }, 0)), totA: roundPrec(L.reduce(function (a, l) { return a + l.am; }, 0)), totE: roundPrec(L.reduce(function (a, l) { return a + (l.ech || 0); }, 0)), dureeTotale: tab.info.dureeTotale || n, nonDetaille: true };
      L.forEach(function (l) { l.ratio = NaN; });
      dernierAudit = res0;
      return res0;
    }
    /* Contrôles ligne par ligne */
    var totI = 0, totA = 0, totE = 0;
    L.forEach(function (l, i) {
      totI += isFinite(l.int) ? l.int : 0; totA += l.am; totE += l.ech;
      if (!l.coherente) { anomalies.push({ g: 'lecture', i: i, txt: t('Échéance {n} ({d}) : {e} ≠ amortissement + intérêts + accessoires ({s}). Ligne mal lue ou erreur de la banque.', { n: l.n, d: moisAnnee(l.date), e: fmtMoney(l.ech), s: fmtMoney(roundPrec(l.am + (l.int || 0) + l.extras)) }) }); return; }
      var ph = phases.filter(function (p) { return i >= p.debut && i <= p.fin; })[0];
      if (ph) {
        l.attendu = roundPrec(l.crdAv * ph.taux * periode / 1200);
        l.ecart = roundPrec(l.int - l.attendu);
        if (Math.abs(l.ecart) > 0.0015) anomalies.push({ g: 'erreur', i: i, txt: t('Échéance {n} ({d}) : intérêts facturés {a}, attendus {b} au taux de {c} (écart {e}).', { n: l.n, d: moisAnnee(l.date), a: fmtMoney(l.int), b: fmtMoney(l.attendu), c: fmtTauxPrecis(ph.taux), e: fmtSigne(l.ecart) + ' ' + unite() }) });
      }
      if (i + 1 < n && L[i + 1].cle - l.cle === periode) {
        var ecartCrd = roundPrec(l.crdAp - L[i + 1].crdAv);
        if (ecartCrd > 0.002) { l.ra = ecartCrd; infos.push({ g: 'info', i: i, txt: t('Après l\'échéance {n} ({d}) : le capital baisse de {m} de plus que l\'amortissement : remboursement anticipé.', { n: l.n, d: moisAnnee(l.date), m: fmtMoney(ecartCrd) }) }); }
        else if (ecartCrd < -0.002) anomalies.push({ g: 'erreur', i: i, txt: t('Après l\'échéance {n} ({d}) : le capital restant dû augmente de {m} sans explication.', { n: l.n, d: moisAnnee(l.date), m: fmtMoney(-ecartCrd) }) });
      }
    });
    /* Mensualité théorique de chaque phase (tableau complet jusqu'au solde) */
    var complet = Math.abs(L[n - 1].crdAp) <= 0.01;
    phases.forEach(function (ph) {
      var l0 = L[ph.debut], reste = n - ph.debut;
      ph.date = l0.date; ph.lignes = ph.fin - ph.debut + 1;
      if (complet && reste > 0 && !L.slice(ph.debut).some(function (x) { return x.ra; })) {
        ph.theorique = mensualite(l0.crdAv, tauxPeriodePct(ph.taux, periode), reste);
        var hors = roundPrec(ph.echeance - (l0.extras || 0));
        if (isFinite(ph.theorique) && Math.abs(ph.theorique - hors) > 0.01 + reste * 0.0005) anomalies.push({ g: 'alerte', i: ph.debut, txt: t('Phase au taux de {c} : échéance {a} hors accessoires, alors que {b} solde exactement le capital sur {n}.', { c: fmtTauxPrecis(ph.taux), a: fmtMoney(hors), b: fmtMoney(ph.theorique), n: libMois(reste) }) });
      }
    });
    /* Règle de réduction de moitié du taux : contrôle des réductions appliquées
       et des dates où elle devient possible */
    var dureeTot = tab.info.dureeTotale || n;
    var reductions = [], possibles = [];
    var cumul = [];
    L.forEach(function (l, i) { cumul[i] = (i ? cumul[i - 1] : 0) + (isFinite(l.int) ? l.int : 0); });
    function ratioAvant(i) { if (i < 36) return NaN; var s = cumul[i - 1] - (i > 36 ? cumul[i - 37] : 0); return L[i].crdAv > 0 ? s / L[i].crdAv : NaN; }
    L.forEach(function (l, i) { l.ratio = ratioAvant(i); });
    var dernier = 0;
    for (var p = 1; p < phases.length; p++) {
      var a = phases[p - 1], b = phases[p];
      if (Math.abs(b.taux - a.taux / 2) < 0.01) {
        var r = L[b.debut].ratio;
        reductions.push({ i: b.debut, date: L[b.debut].date, avant: a.taux, apres: b.taux, ratio: r, conforme: !isFinite(r) || r > 0.08 });
        if (isFinite(r) && r <= 0.08) anomalies.push({ g: 'alerte', i: b.debut, txt: t('Réduction appliquée à l\'échéance {n} alors que le ratio n\'est que de {r}.', { n: L[b.debut].n, r: fmtPct(r * 100, 3) }) });
        dernier = b.debut;
      }
    }
    if (dureeTot > 84) {
      var depuis = reductions.length ? dernier + 36 : 36;
      for (i = depuis; i < n; i++) {
        if (isFinite(L[i].ratio) && L[i].ratio > 0.08) {
          var dejaReduit = reductions.some(function (z) { return z.i === i; });
          if (!dejaReduit) possibles.push({ i: i, date: L[i].date, ratio: L[i].ratio, passe: L[i].date < new Date() });
          if (possibles.length) break;
        }
      }
    }
    possibles.forEach(function (x) {
      if (x.passe) anomalies.push({ g: 'alerte', i: x.i, txt: t('La réduction de taux était possible dès l\'échéance {n} ({d}, ratio {r}) mais n\'apparaît pas dans le tableau.', { n: L[x.i].n, d: moisAnnee(x.date), r: fmtPct(x.ratio * 100, 3) }) });
    });
    var res = {
      info: tab.info, lignes: L, phases: phases, anomalies: anomalies, infos: infos, reductions: reductions, possibles: possibles,
      convAvant: convAvant, complet: complet, totI: roundPrec(totI), totA: roundPrec(totA), totE: roundPrec(totE), dureeTotale: dureeTot
    };
    dernierAudit = res;
    return res;
  }

  function ouvrirAudit(fichiersInitiaux) {
    var d = ouvrirDialogue({
      titre: t('Audit d\'un tableau d\'amortissement'), icone: 'scan', large: true,
      sousTitre: echapper(t('Déposez le tableau de votre banque (PDF, même scanné, ou photos) : chaque ligne est recalculée au millime.')),
      corps:
        '<label class="audit-depot" for="au-fichier" id="au-depot">' + ico('upload') + '<strong>' + echapper(t('Choisir le PDF ou les photos du tableau')) + '</strong>' +
          '<small>' + echapper(t('Ou glissez-les ici. Tout reste sur votre appareil : rien n\'est envoyé sur Internet.')) + '</small></label>' +
        '<input type="file" id="au-fichier" accept="application/pdf,image/*" multiple class="sr-only">' +
        '<details class="au-coller"><summary>' + echapper(t('Ou coller le texte du tableau')) + '</summary><textarea id="au-texte" rows="6" placeholder="' + echapper(t('1  31/03/2023  270 000,000  490,966  1 012,500  1 641,841')) + '"></textarea>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="au-analyser">' + ico('calc', 'ico-sm') + echapper(t('Analyser le texte')) + '</button></details>' +
        '<div class="ocr-progres" id="au-progres" hidden><div class="ocr-barre"><span id="au-barre"></span></div><small id="au-etat"></small></div>' +
        '<div id="au-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>'
    });
    var el = d.el;
    function progres(x, msg) { $('#au-progres', el).hidden = false; $('#au-barre', el).style.width = Math.max(3, Math.round(x * 100)) + '%'; if (msg) $('#au-etat', el).textContent = msg; }
    function analyser(texte) {
      var tab = analyserTableau(texte);
      if (tab.lignes.length < 3) { $('#au-res', el).innerHTML = '<p class="field-err" style="margin-top:12px">' + echapper(t('Aucune ligne d\'échéance reconnue (date jj/mm/aaaa suivie des montants). Vérifiez le fichier ou collez le texte.')) + '</p>'; return; }
      rendreAudit(el, auditerTableau(tab), d);
    }
    function traiter(fichiers) {
      if (!fichiers || !fichiers.length) return;
      $('#au-res', el).innerHTML = '';
      progres(0.02, t('Lecture du fichier…'));
      lireFichiersTableau(Array.prototype.slice.call(fichiers), progres).then(function (texte) {
        progres(1, t('Lecture terminée : analyse des lignes…'));
        $('#au-texte', el).value = texte;
        analyser(texte);
        setTimeout(function () { $('#au-progres', el).hidden = true; }, 600);
      }).catch(function () {
        $('#au-progres', el).hidden = true;
        toast(t('Lecture impossible (connexion requise la première fois pour charger les outils de lecture). Collez le texte du tableau.'), 'erreur', 6000);
      });
    }
    $('#au-fichier', el).addEventListener('change', function () { traiter(this.files); });
    var depot = $('#au-depot', el);
    ['dragenter', 'dragover'].forEach(function (n) { depot.addEventListener(n, function (ev) { ev.preventDefault(); depot.classList.add('survol'); }); });
    ['dragleave', 'drop'].forEach(function (n) { depot.addEventListener(n, function (ev) { ev.preventDefault(); depot.classList.remove('survol'); }); });
    depot.addEventListener('drop', function (ev) { traiter(ev.dataTransfer && ev.dataTransfer.files); });
    $('#au-analyser', el).addEventListener('click', function () { analyser($('#au-texte', el).value); });
    if (fichiersInitiaux && fichiersInitiaux.length) traiter(fichiersInitiaux);
  }

  function rendreAudit(el, a, dlg) {
    var L = a.lignes, n = L.length;
    var erreurs = a.anomalies.filter(function (x) { return x.g === 'erreur'; }).length;
    var alertes = a.anomalies.filter(function (x) { return x.g === 'alerte'; }).length;
    var lecture = a.anomalies.filter(function (x) { return x.g === 'lecture'; }).length;
    var verdict = a.nonDetaille ? a.anomalies[0].txt : erreurs + alertes === 0
      ? (lecture ? t('Aucune erreur de calcul dans les lignes lues ; {n} ligne(s) à vérifier à la main (lecture).', { n: lecture }) : t('Tableau conforme : toutes les lignes sont exactes au millime.'))
      : t('{e} erreur(s) et {a} point(s) d\'attention détectés.', { e: erreurs, a: alertes });
    var crdPts = L.map(function (l, i) { return [i, l.crdAv]; });
    var ratioPts = L.filter(function (l) { return isFinite(l.ratio); }).map(function (l) { return [L.indexOf(l), Math.min(l.ratio * 100, 40)]; });
    var zones = [], dz = null;
    ratioPts.forEach(function (p, k) { if (p[1] > 8 && dz === null) dz = p[0]; if ((p[1] <= 8 || k === ratioPts.length - 1) && dz !== null) { zones.push([dz, p[1] > 8 ? p[0] : p[0] - 1]); dz = null; } });
    var ticks = ticksAnnees(n, 1, L[0].date);
    function ligneAno(x) {
      var cls = { erreur: 'ko', alerte: 'att', lecture: 'lec', info: 'inf' }[x.g];
      var lib = { erreur: t('Erreur'), alerte: t('Attention'), lecture: t('Lecture'), info: t('Info') }[x.g];
      return '<li class="au-ano ' + cls + '" data-au-i="' + x.i + '"><span class="au-tag">' + echapper(lib) + '</span><span>' + echapper(x.txt) + '</span></li>';
    }
    var lignesTab = L.map(function (l, i) {
      var c = !l.coherente ? 'lec' : (isFinite(l.ecart) && Math.abs(l.ecart) > 0.0015 ? 'ko' : (l.ra ? 'inf' : ''));
      var red = a.reductions.some(function (z) { return z.i === i; }) ? ' red' : '';
      return '<tr class="' + c + red + '" data-au-l="' + i + '"><td>' + l.n + '</td><td>' + echapper(moisAnnee(l.date)) + '</td><td>' + fmtNombre(l.crdAv) + '</td><td>' + fmtNombre(l.am) + '</td><td>' + (isFinite(l.int) ? fmtNombre(l.int) : '—') + '</td><td>' + (isFinite(l.attendu) ? fmtNombre(l.attendu) : '—') + '</td>' +
        '<td class="' + (isFinite(l.ecart) && Math.abs(l.ecart) > 0.0015 ? 'ecart' : '') + '">' + (isFinite(l.ecart) ? echapper(fmtSigne(l.ecart)) : '—') + '</td><td>' + fmtNombre(l.ech) + '</td><td>' + (isFinite(l.taux) ? echapper(fmtTauxPrecis(Math.round(l.taux * 1000) / 1000)) : '—') + '</td><td>' + (isFinite(l.ratio) ? echapper(fmtPct(l.ratio * 100, 3)) : '—') + '</td></tr>';
    }).join('');
    $('#au-res', el).innerHTML =
      '<div class="au-verdict ' + (erreurs + alertes || a.nonDetaille ? 'ko' : 'ok') + '">' + ico(erreurs + alertes || a.nonDetaille ? 'alert' : 'check') + '<div><strong>' + echapper(verdict) + '</strong><small>' +
        echapper(t('{n} échéances lues, de {a} à {b}.', { n: n, a: moisLong(L[0].date), b: moisLong(L[n - 1].date) })) + (a.info.banque ? ' · ' + echapper(a.info.banque) : '') + (a.info.numero ? ' · ' + echapper(t('crédit n° {n}', { n: a.info.numero })) : '') + '</small></div></div>' +
      '<div class="ra-stats" style="margin-top:12px">' +
        statDlg(t('Intérêts du tableau'), fmtMoney(a.totI), '', t('sur les lignes lues')) +
        statDlg(t('Capital amorti'), fmtMoney(a.totA), '') +
        statDlg(t('Total des échéances'), fmtMoney(a.totE), '') +
        statDlg(t('Réductions de taux'), String(a.reductions.length), a.reductions.length ? 'ok' : '', a.reductions.map(function (z) { return moisAnnee(z.date); }).join(', ')) +
      '</div>' +
      '<h3 class="ag-titre">' + echapper(t('Phases du crédit')) + '</h3>' +
      '<div class="cmp-table-wrap"><table class="cmp"><thead><tr><th>' + echapper(t('Depuis')) + '</th><th>' + echapper(t('Taux annuel')) + '</th><th>' + echapper(t('Échéance')) + '</th><th>' + echapper(t('Échéances')) + '</th><th>' + echapper(t('Contrôle')) + '</th></tr></thead><tbody>' +
        a.phases.map(function (ph) {
          var ok = !isFinite(ph.theorique) || Math.abs(ph.theorique - roundPrec(ph.echeance - (L[ph.debut].extras || 0))) <= 0.01 + (n - ph.debut) * 0.0005;
          return '<tr><td>' + echapper(moisAnnee(ph.date)) + '</td><td><b>' + echapper(fmtTauxPrecis(ph.taux)) + '</b></td><td>' + echapper(fmtMoney(ph.echeance)) + '</td><td>' + ph.lignes + '</td><td class="' + (isFinite(ph.theorique) ? (ok ? 'best' : 'au-ko') : 'au-nv') + '">' + echapper(isFinite(ph.theorique) ? (ok ? t('conforme') : t('à vérifier')) : t('non vérifiable')) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
      (a.possibles.length ? '<div class="au-chance">' + ico('down') + '<div><strong>' + echapper(a.possibles[0].passe ? t('Réduction de taux possible depuis {d}', { d: moisLong(a.possibles[0].date) }) : t('Prochaine réduction de taux possible : {d}', { d: moisLong(a.possibles[0].date) })) + '</strong><small>' +
        echapper(t('Ratio intérêts des 36 derniers mois / capital restant dû : {r} (plus de 8 %).', { r: fmtPct(a.possibles[0].ratio * 100, 3) })) + '</small></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-au="lettre">' + ico('file', 'ico-sm') + echapper(t('Préparer la lettre')) + '</button></div>' : '') +
      '<h3 class="ag-titre">' + echapper(t('Constats ({n})', { n: a.anomalies.length + a.infos.length })) + '</h3>' +
      ((a.anomalies.length + a.infos.length) ? '<ul class="au-liste">' + a.anomalies.concat(a.infos).sort(function (x, y) { return x.i - y.i; }).map(ligneAno).join('') + '</ul>' : '<p class="ra-note">' + echapper(t('Aucun constat.')) + '</p>') +
      '<h3 class="ag-titre">' + echapper(t('Capital restant dû')) + '</h3><div class="graphe-zone">' + grapheLignes([{ pts: crdPts, c: '#8C5000', aire: true }], { xTicks: ticks, aria: t('Capital restant dû') }) + '</div>' +
      (ratioPts.length ? '<h3 class="ag-titre">' + echapper(t('Ratio de la règle des 8 %')) + '</h3><div class="graphe-zone">' + grapheLignes([{ pts: ratioPts, c: '#C27A1A' }], { xTicks: ticks, ref: 8, zones: zones, xmin: ratioPts[0][0], fmtY: function (v) { return fmtSaisie(Math.round(v * 10) / 10) + ' %'; }, aria: t('Ratio de la règle des 8 %') }) + '</div>' : '') +
      '<h3 class="ag-titre">' + echapper(t('Lignes lues et recalculées')) + '</h3>' +
      '<div class="au-tab-wrap" translate="no"><table class="au-tab"><thead><tr><th>' + echapper(t('N°')) + '</th><th>' + echapper(t('Date')) + '</th><th>' + echapper(t('Capital dû')) + '</th><th>' + echapper(t('Amort.')) + '</th><th>' + echapper(t('Intérêts')) + '</th><th>' + echapper(t('Attendus')) + '</th><th>' + echapper(t('Écart')) + '</th><th>' + echapper(t('Échéance')) + '</th><th>' + echapper(t('Taux')) + '</th><th>' + echapper(t('Ratio')) + '</th></tr></thead><tbody>' + lignesTab + '</tbody></table></div>' +
      '<div class="au-actions">' +
        '<button type="button" class="btn btn-orange" data-au="pdf">' + ico('file', 'ico-sm') + echapper(t('Rapport d\'audit (PDF)')) + '</button>' +
        '<button type="button" class="btn btn-green" data-au="excel">' + ico('sheet', 'ico-sm') + echapper(t('Lignes en Excel')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-au="lettre">' + ico('file', 'ico-sm') + echapper(t('Lettre à la banque')) + '</button>' +
        '<button type="button" class="btn btn-primary" data-au="suivre">' + ico('wallet', 'ico-sm') + echapper(t('Suivre ce crédit')) + '</button>' +
      '</div>';
    if (!el._auditClic) {
      el._auditClic = true;
      el.addEventListener('click', function (ev) {
        var li = ev.target.closest('[data-au-i]');
        if (li) { var tr = $('[data-au-l="' + li.dataset.auI + '"]', el); if (tr) { tr.scrollIntoView({ block: 'center', behavior: mouvementReduit.matches ? 'auto' : 'smooth' }); tr.classList.remove('surligne'); void tr.offsetWidth; tr.classList.add('surligne'); } return; }
        var b = ev.target.closest('[data-au]');
        if (!b || !dernierAudit) return;
        var act = b.dataset.au;
        if (act === 'pdf') rapportAuditPDF(dernierAudit);
        else if (act === 'excel') excelAudit(dernierAudit);
        else if (act === 'lettre') { dlg.fermer(); setTimeout(function () { ouvrirCourrier('reduction'); }, 200); }
        else if (act === 'suivre') { dlg.fermer(); suivreDepuisAudit(dernierAudit); }
      });
    }
  }

  /* Point de départ de « Mon crédit en cours » : la dernière réduction de taux
     (ou la 1re ligne lue), capital avant l'échéance */
  function suivreDepuisAudit(a) {
    var L = a.lignes, i0 = a.reductions.length ? a.reductions[a.reductions.length - 1].i : 0;
    var l = L[i0], dernierePh = a.phases[a.phases.length - 1];
    var m = { capital: l.crdAv, date: dateIso(l.date), mois: L.length - i0, taux: dernierePh ? dernierePh.taux : Math.round(l.taux * 1000) / 1000, dureeTotale: a.dureeTotale, reduction: true };
    stock.ecrire(CLE_MON_CREDIT, JSON.stringify(m));
    ouvrirMonCredit();
    toast(t('Crédit repris depuis {d} : {m} restant dû.', { d: moisLong(l.date), m: fmtMoney(l.crdAv) }), 'succes', 5000);
  }
  function dateIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function rapportAuditPDF(a) {
    if (!window.jspdf || !window.jspdf.jsPDF) { toast(t('Export PDF indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    enFrancais(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }), Lg = doc.internal.pageSize.getWidth();
      var c1 = hexVersRgb(couleurMarque()), encre = [22, 18, 41], gris = [110, 105, 137];
      doc.setFillColor(c1[0], c1[1], c1[2]); doc.rect(0, 0, Lg, 28, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Audit du tableau d\'amortissement', 14, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text([a.info.banque, a.info.numero ? 'Crédit n° ' + a.info.numero : '', a.info.titulaire, 'Édité le ' + new Date().toLocaleDateString('fr-FR')].filter(Boolean).join(' · '), 14, 21);
      doc.setTextColor(encre[0], encre[1], encre[2]);
      var L = a.lignes, y = 38;
      var corps = [['Échéances lues', L.length + ' (' + moisAnnee(L[0].date) + ' – ' + moisAnnee(L[L.length - 1].date) + ')'], ['Intérêts du tableau', fmtTexte(a.totI)], ['Capital amorti', fmtTexte(a.totA)], ['Total des échéances', fmtTexte(a.totE)],
        ['Phases', a.phases.map(function (p) { return moisAnnee(p.date) + ' : ' + fmtTauxPrecis(p.taux) + ' (' + fmtTexte(p.echeance) + ')'; }).join(' ; ')],
        ['Réductions de taux', a.reductions.length ? a.reductions.map(function (z) { return moisAnnee(z.date) + ' : ' + fmtTauxPrecis(z.avant) + ' → ' + fmtTauxPrecis(z.apres) + (isFinite(z.ratio) ? ' (ratio ' + fmtPct(z.ratio * 100, 3) + ')' : ''); }).join(' ; ') : 'aucune'],
        ['Prochaine réduction possible', a.possibles.length ? moisAnnee(a.possibles[0].date) + ' (ratio ' + fmtPct(a.possibles[0].ratio * 100, 3) + ')' : '—']];
      doc.autoTable({ startY: y, body: corps, theme: 'plain', styles: { fontSize: 9.5, cellPadding: 1.8, textColor: encre }, columnStyles: { 0: { textColor: gris, cellWidth: 55 }, 1: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 } });
      y = doc.lastAutoTable.finalY + 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Constats', 14, y);
      var cons = a.anomalies.concat(a.infos).sort(function (x, z) { return x.i - z.i; });
      doc.autoTable({ startY: y + 3, head: [['Type', 'Constat']], body: cons.length ? cons.map(function (x) { return [{ erreur: 'Erreur', alerte: 'Attention', lecture: 'Lecture', info: 'Info' }[x.g], x.txt]; }) : [['—', 'Aucune anomalie : tableau conforme au millime.']],
        theme: 'grid', headStyles: { fillColor: c1, textColor: 255 }, styles: { fontSize: 8.5, cellPadding: 1.8, textColor: encre }, columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' } }, margin: { left: 14, right: 14 } });
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Lignes lues et recalculées', 14, 16);
      doc.autoTable({ startY: 20, head: [['N°', 'Date', 'Capital dû', 'Amort.', 'Intérêts', 'Attendus', 'Écart', 'Échéance', 'Ratio 36 m']],
        body: L.map(function (l) { return [l.n, moisAnnee(l.date), fmtNombre(l.crdAv), fmtNombre(l.am), isFinite(l.int) ? fmtNombre(l.int) : '—', isFinite(l.attendu) ? fmtNombre(l.attendu) : '—', isFinite(l.ecart) ? fmtSigne(l.ecart) : '—', fmtNombre(l.ech), isFinite(l.ratio) ? fmtPct(l.ratio * 100, 3) : '—'].map(function (v) { return String(v).replace(/[  ]/g, ' '); }); }),
        theme: 'grid', headStyles: { fillColor: c1, textColor: 255 }, styles: { fontSize: 7.4, cellPadding: 1.2, halign: 'right', textColor: encre }, columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left' } }, margin: { left: 10, right: 10, bottom: 14 },
        didParseCell: function (dd) { if (dd.section === 'body' && dd.column.index === 6 && dd.cell.raw !== '—' && Math.abs(parseFloat(String(dd.cell.raw).replace(',', '.').replace(/[^\d.-]/g, ''))) > 0.0015) { dd.cell.styles.textColor = [190, 18, 60]; dd.cell.styles.fontStyle = 'bold'; } } });
      var nb = doc.internal.getNumberOfPages();
      for (var p = 1; p <= nb; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(gris[0], gris[1], gris[2]); var pied = 'Audit indicatif réalisé avec le Simulateur de crédit en Dinar Tunisien · Mohamed Aziz Jaouadi'; doc.text(pied, 14, doc.internal.pageSize.getHeight() - 7); lienAuteurPDF(doc, pied, 14, doc.internal.pageSize.getHeight() - 7); doc.text(p + ' / ' + nb, Lg - 14, doc.internal.pageSize.getHeight() - 7, { align: 'right' }); }
      doc.save('audit_tableau_amortissement' + (a.info.numero ? '_' + a.info.numero : '') + '.pdf');
    });
    toast(t('Rapport d\'audit téléchargé.'));
  }
  function excelAudit(a) {
    if (typeof XLSX === 'undefined') { toast(t('Export Excel indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    enFrancais(function () {
      var lignes = [['N°', 'Date', 'Capital dû', 'Amortissement', 'Intérêts', 'Intérêts attendus', 'Écart', 'Accessoires', 'Échéance', 'Taux déduit (%)', 'Ratio 36 mois (%)', 'Ligne cohérente']].concat(a.lignes.map(function (l) {
        return [l.n, moisAnnee(l.date), l.crdAv, l.am, isFinite(l.int) ? l.int : '', isFinite(l.attendu) ? l.attendu : '', isFinite(l.ecart) ? l.ecart : '', l.extras, l.ech, isFinite(l.taux) ? Math.round(l.taux * 1000) / 1000 : '', isFinite(l.ratio) ? Math.round(l.ratio * 100000) / 1000 : '', l.coherente ? 'oui' : 'non'];
      }));
      var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(lignes);
      ws['!cols'] = lignes[0].map(function () { return { wch: 15 }; });
      XLSX.utils.book_append_sheet(wb, ws, 'Audit');
      XLSX.writeFile(wb, 'audit_tableau' + (a.info.numero ? '_' + a.info.numero : '') + '.xlsx');
    });
    toast(t('Fichier Excel téléchargé.'));
  }

  /* ===================================================================
     Courriers à la banque au format Word (.docx), créés dans le navigateur
     =================================================================== */
  var CRC_TABLE = (function () { var c, tab = []; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; } return tab; })();
  function crc32(octets) { var c = 0xFFFFFFFF; for (var i = 0; i < octets.length; i++) c = CRC_TABLE[(c ^ octets[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /* Archive ZIP sans compression (suffisant pour un .docx) */
  function zipStocke(fichiers) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date(), heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), jour = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    fichiers.forEach(function (f) {
      var nom = enc.encode(f.nom), data = enc.encode(f.contenu), crc = crc32(data);
      var entete = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(heure), u16(jour), u32(crc), u32(data.length), u32(data.length), u16(nom.length), u16(0));
      parts.push(new Uint8Array(entete), nom, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(heure), u16(jour), u32(crc), u32(data.length), u32(data.length), u16(nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), nom);
      offset += entete.length + nom.length + data.length;
    });
    var tailleCentral = central.reduce(function (s, x) { return s + x.length; }, 0);
    var fin = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(fichiers.length), u16(fichiers.length), u32(tailleCentral), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [fin]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* Paragraphe Word : morceaux [{t, b}] ou texte simple */
  function wP(contenu, o) {
    o = o || {};
    var runs = (typeof contenu === 'string' ? [{ t: contenu }] : contenu).map(function (r) {
      return '<w:r><w:rPr>' + (r.b || o.b ? '<w:b/>' : '') + (o.taille ? '<w:sz w:val="' + o.taille + '"/>' : '') + (o.couleur ? '<w:color w:val="' + o.couleur + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xmlEsc(r.t) + '</w:t></w:r>';
    }).join('');
    return '<w:p><w:pPr>' + (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') + '<w:spacing w:after="' + (o.apres != null ? o.apres : 160) + '" w:line="276" w:lineRule="auto"/></w:pPr>' + runs + '</w:p>';
  }
  function wTable(lignes) {
    var bord = '<w:top w:val="single" w:sz="4" w:color="C9C2E0"/><w:left w:val="single" w:sz="4" w:color="C9C2E0"/><w:bottom w:val="single" w:sz="4" w:color="C9C2E0"/><w:right w:val="single" w:sz="4" w:color="C9C2E0"/><w:insideH w:val="single" w:sz="4" w:color="C9C2E0"/><w:insideV w:val="single" w:sz="4" w:color="C9C2E0"/>';
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + bord + '</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="5200"/><w:gridCol w:w="3800"/></w:tblGrid>' +
      lignes.map(function (l) {
        return '<w:tr>' + l.map(function (c, j) {
          return '<w:tc><w:tcPr><w:tcW w:w="' + (j ? 3800 : 5200) + '" w:type="dxa"/>' + (j ? '' : '<w:shd w:val="clear" w:color="auto" w:fill="F4F2FB"/>') + '</w:tcPr>' + wP([{ t: c, b: j === 1 }], { apres: 60, align: j ? 'right' : null }) + '</w:tc>';
        }).join('') + '</w:tr>';
      }).join('') + '</w:tbl>';
  }
  function creerDocx(corpsXml) {
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + corpsXml +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1300" w:bottom="1300" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    return zipStocke([
      { nom: '[Content_Types].xml', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { nom: '_rels/.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { nom: 'word/_rels/document.xml.rels', contenu: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nom: 'word/document.xml', contenu: doc },
      { nom: 'word/styles.xml', contenu: styles }
    ]);
  }

  var CLE_IDENTITE = 'courrierIdentite';
  /* Données de la demande de réduction : dernier audit, sinon « Mon crédit en cours », sinon scénario actif */
  function donneesReduction() {
    var a = dernierAudit;
    if (a && a.possibles.length) {
      var i = a.possibles[0].i, L = a.lignes;
      return { source: t('audit du tableau'), du: L[i - 36].date, au: L[i - 1].date, interets: roundPrec(L.slice(i - 36, i).reduce(function (s, l) { return s + (l.int || 0); }, 0)), crd: L[i].crdAv, taux: a.phases[a.phases.length - 1].taux, numero: a.info.numero, banque: a.info.banque, nom: a.info.titulaire, date: L[i].date };
    }
    var m = lireMonCredit(), r = null, base = null;
    if (m) { r = echeancierMonCredit(Object.assign({}, m, { reduction: false })); base = { taux: m.taux, source: t('mon crédit en cours') }; }
    else if (scenarioActif().resultat) { var e = scenarioActif().entrees; r = calculerEcheancier(Object.assign({}, e, { variation: null }), false); base = { taux: e.taux, source: t('scénario {n}', { n: scenarioActif().nom }), nom: e.client.nom }; }
    if (!r || r.lignes.length < 37) return base;
    var auj = new Date(), k = r.lignes.filter(function (l) { return l.date && l.date <= auj; }).length;
    if (k < 36) {
      var premier = null;
      for (var j = 36; j < r.lignes.length; j++) { var s36 = r.lignes.slice(j - 36, j).reduce(function (s, l) { return s + l.interet; }, 0); if (s36 / resteFin(r.lignes[j - 1]) > 0.08) { premier = j; break; } }
      k = premier || 36;
    }
    var fen = r.lignes.slice(k - 36, k);
    return Object.assign(base, { du: fen[0].date, au: fen[35].date, interets: roundPrec(fen.reduce(function (s, l) { return s + l.interet; }, 0)), crd: resteFin(r.lignes[k - 1]), date: r.lignes[k] ? r.lignes[k].date : null });
  }

  function ouvrirCourrier(type) {
    var id = {};
    try { id = JSON.parse(stock.lire(CLE_IDENTITE, '{}')) || {}; } catch (e) { id = {}; }
    var dr = donneesReduction() || {}, sc = scenarioActif();
    var d = ouvrirDialogue({
      titre: t('Lettre à la banque'), icone: 'file', large: true,
      sousTitre: echapper(t('Choisissez le courrier : il est rempli avec vos chiffres et téléchargé au format Word, prêt à imprimer et signer.')),
      corps:
        '<div class="seg seg-block seg-3 cr-types" role="group" aria-label="' + echapper(t('Type de courrier')) + '">' +
          '<button type="button" data-cr="reduction">' + echapper(t('Réduction de taux')) + '</button>' +
          '<button type="button" data-cr="ra">' + echapper(t('Remboursement anticipé')) + '</button>' +
          '<button type="button" data-cr="tableau">' + echapper(t('Tableau actualisé')) + '</button></div>' +
        '<h3 class="ag-titre">' + echapper(t('Vos coordonnées')) + '</h3>' +
        '<div class="dlg-fields trois">' +
          champDlg('cr-nom', t('Nom et prénom'), t('Ex. Sami Ben Salah'), '', 'user', id.nom || dr.nom || sc.entrees.client.nom || null, 'text') +
          champDlg('cr-cin', t('N° CIN'), t('Ex. 01234567'), '', 'file', id.cin || null, 'text') +
          champDlg('cr-tel', t('Téléphone'), t('Ex. 98 000 000'), '', 'phone', id.tel || null, 'text') +
          champDlg('cr-adr', t('Adresse'), t('Ex. 12 rue de Marseille, Tunis'), '', 'home', id.adresse || null, 'text') +
          champDlg('cr-ville', t('Ville'), t('Ex. Tunis'), '', 'flag', id.ville || null, 'text') +
          champDlg('cr-banque', t('Banque et agence'), t('Ex. BH Bank, agence Tunis Centre'), '', 'building', id.banque || dr.banque || null, 'text') +
          champDlg('cr-num', t('N° du crédit'), t('Ex. 0495950100470'), '', 'file', dr.numero || id.numero || null, 'text') +
        '</div>' +
        '<div id="cr-specifique"></div>' +
        '<h3 class="ag-titre">' + echapper(t('Aperçu')) + '</h3><div class="cr-apercu" id="cr-apercu"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-ghost" id="cr-copier">' + ico('link', 'ico-sm') + echapper(t('Copier le texte')) + '</button>' +
            '<button class="btn btn-primary" id="cr-word">' + ico('download', 'ico-sm') + echapper(t('Télécharger (Word)')) + '</button>'
    });
    var el = d.el, courant = type || 'reduction';
    function v(idc) { var i = $('#' + idc, el); return i ? i.value.trim() : ''; }
    function specifique() {
      var z = $('#cr-specifique', el), h = '';
      if (courant === 'reduction') {
        h = '<h3 class="ag-titre">' + echapper(t('Justificatif (règle des 8 %)')) + '</h3><div class="dlg-fields trois">' +
          champDlg('cr-int', t('Intérêts des 36 derniers mois'), t('Ex. 20 432'), unite(), 'coins', dr.interets ? fmtSaisie(dr.interets) : null) +
          champDlg('cr-crd', t('Capital restant dû'), t('Ex. 102 244'), unite(), 'cash', dr.crd ? fmtSaisie(dr.crd) : null) +
          champDlg('cr-taux', t('Taux actuel'), t('Ex. 4,5'), '%', 'percent', dr.taux != null ? fmtSaisie(dr.taux) : null) +
          champDlg('cr-du', t('Période du'), t('Ex. 03/2023'), '', 'calendar', dr.du ? moisAnnee(dr.du).replace(/[⁦-⁩]/g, '') : null, 'text') +
          champDlg('cr-au', t('au'), t('Ex. 02/2026'), '', 'calendar', dr.au ? moisAnnee(dr.au).replace(/[⁦-⁩]/g, '') : null, 'text') +
          champDlg('cr-loi', t('Référence légale'), '', '', 'shield', id.loi || 'la loi n° 2024-41 du 2 août 2024', 'text') +
          '</div><p class="opt-note">' + echapper(dr.source ? t('Chiffres repris de : {s}. Vérifiez-les avec votre tableau et la référence légale exacte avant envoi.', { s: dr.source }) : t('Renseignez les chiffres de votre tableau d\'amortissement.')) + '</p>';
      } else if (courant === 'ra') {
        var e = sc.entrees, rr = sc.resultat;
        h = '<h3 class="ag-titre">' + echapper(t('Votre demande')) + '</h3><div class="dlg-fields trois">' +
          champDlg('cr-mt', t('Montant à rembourser'), t('Ex. 20 000'), unite(), 'cash', e && e.ras && e.ras[0] && e.ras[0].montant ? fmtSaisie(e.ras[0].montant) : null) +
          champDlg('cr-date', t('Date souhaitée'), t('Ex. 31/01/2027'), '', 'calendar', null, 'text') +
          '<div class="field"><span class="seg-lib">' + echapper(t('Après le remboursement')) + '</span><div class="seg seg-block" role="group"><button type="button" data-cr-mode="duree" aria-pressed="true">' + echapper(t('Réduire la durée')) + '</button><button type="button" data-cr-mode="mensualite" aria-pressed="false">' + echapper(t('Réduire l\'échéance')) + '</button></div></div>' +
          '</div>' + (rr && rr.totIndem > 0 ? '<p class="opt-note">' + echapper(t('Indemnité estimée par le simulateur : {m}.', { m: fmtMoney(rr.totIndem) })) + '</p>' : '');
      } else {
        h = '<p class="opt-note" style="margin-top:12px">' + echapper(t('Demande d\'un tableau d\'amortissement actualisé (taux, capital restant dû, échéances restantes) et d\'un relevé des intérêts payés.')) + '</p>';
      }
      z.innerHTML = h;
      $$('[data-cr]', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cr === courant)); });
      apercu();
    }
    function paragraphes() {
      var nom = v('cr-nom') || '…', ville = v('cr-ville') || '…', banque = v('cr-banque') || '…', num = v('cr-num') || '…';
      var date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      var P = [];
      P.push({ x: [nom, v('cr-adr'), v('cr-cin') ? 'CIN n° ' + v('cr-cin') : '', v('cr-tel') ? 'Tél. : ' + v('cr-tel') : ''].filter(Boolean), st: 'bloc' });
      P.push({ x: ['À l\'attention de Madame, Monsieur le Directeur', banque], st: 'bloc-d' });
      P.push({ x: [ville + ', le ' + date], st: 'droite' });
      if (courant === 'reduction') {
        var ti = lireNombre(v('cr-taux')), it = lireNombre(v('cr-int')), crd = lireNombre(v('cr-crd'));
        var ratio = it > 0 && crd > 0 ? it / crd * 100 : NaN;
        P.push({ x: ['Objet : demande de réduction du taux d\'intérêt — crédit n° ' + num], st: 'objet' });
        P.push({ x: ['Lettre recommandée avec accusé de réception'], st: 'petit' });
        P.push({ x: ['Madame, Monsieur,'] });
        P.push({ x: ['Titulaire du crédit n° ' + num + ' contracté auprès de votre établissement, je vous prie de bien vouloir procéder à la réduction de moitié du taux d\'intérêt appliqué, en application des dispositions de ' + (v('cr-loi') || '…') + ' relatives aux crédits dont les intérêts payés au cours des trois dernières années dépassent 8 % du capital restant dû.'] });
        P.push({ x: ['Les conditions sont réunies, comme le montre le calcul ci-dessous établi à partir du tableau d\'amortissement :'] });
        P.push({ tableau: [
          ['Période de référence', (v('cr-du') || '…') + ' à ' + (v('cr-au') || '…')],
          ['Intérêts payés sur les 36 derniers mois', isFinite(it) ? fmtTexte(it) : '…'],
          ['Capital restant dû', isFinite(crd) ? fmtTexte(crd) : '…'],
          ['Rapport intérêts / capital restant dû', isFinite(ratio) ? fmtPct(ratio, 3).replace(/[⁦-⁩]/g, '') + (ratio > 8 ? ' (supérieur à 8 %)' : '') : '…'],
          ['Taux actuel', isFinite(ti) ? fmtTauxPrecis(ti).replace(/[⁦-⁩]/g, '') : '…'],
          ['Taux demandé', isFinite(ti) ? fmtTauxPrecis(ti / 2).replace(/[⁦-⁩]/g, '') : '…']
        ] });
        P.push({ x: ['Je vous remercie de bien vouloir m\'adresser le nouveau tableau d\'amortissement tenant compte de ce taux réduit, ainsi que la date de sa prise d\'effet.'] });
      } else if (courant === 'ra') {
        var mt = lireNombre(v('cr-mt'));
        P.push({ x: ['Objet : demande de remboursement anticipé — crédit n° ' + num], st: 'objet' });
        P.push({ x: ['Madame, Monsieur,'] });
        P.push({ x: ['Je souhaite procéder à un remboursement anticipé ' + (isFinite(mt) && mt > 0 ? 'partiel de ' + fmtTexte(mt) : 'total') + ' de mon crédit n° ' + num + (v('cr-date') ? ', à la date du ' + v('cr-date') : '') + '.'] });
        P.push({ x: ['Je vous serais reconnaissant(e) de me communiquer le décompte détaillé de l\'opération (capital, intérêts courus, indemnité éventuelle) ainsi que le nouveau tableau d\'amortissement, ' + (el._mode === 'mensualite' ? 'en réduisant le montant des échéances et en conservant la durée.' : 'en réduisant la durée du crédit et en conservant le montant des échéances.')] });
      } else {
        P.push({ x: ['Objet : demande de tableau d\'amortissement actualisé — crédit n° ' + num], st: 'objet' });
        P.push({ x: ['Madame, Monsieur,'] });
        P.push({ x: ['Je vous prie de bien vouloir m\'adresser le tableau d\'amortissement actualisé de mon crédit n° ' + num + ', indiquant le taux appliqué, le capital restant dû et les échéances restantes, ainsi qu\'un relevé des intérêts payés depuis l\'origine du crédit.'] });
      }
      P.push({ x: ['Dans l\'attente de votre réponse, je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.'] });
      P.push({ x: [nom], st: 'signature' });
      return P;
    }
    function apercu() {
      $('#cr-apercu', el).innerHTML = paragraphes().map(function (p) {
        if (p.tableau) return '<table class="cr-tab">' + p.tableau.map(function (r) { return '<tr><th>' + echapper(r[0]) + '</th><td>' + echapper(r[1]) + '</td></tr>'; }).join('') + '</table>';
        return '<p class="cr-' + (p.st || 'p') + '">' + p.x.map(echapper).join('<br>') + '</p>';
      }).join('');
    }
    function enregistrerIdentite() {
      stock.ecrire(CLE_IDENTITE, JSON.stringify({ nom: v('cr-nom'), cin: v('cr-cin'), tel: v('cr-tel'), adresse: v('cr-adr'), ville: v('cr-ville'), banque: v('cr-banque'), numero: v('cr-num'), loi: v('cr-loi') || id.loi }));
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cr]');
      if (b) { courant = b.dataset.cr; specifique(); return; }
      var m = ev.target.closest('[data-cr-mode]');
      if (m) { el._mode = m.dataset.crMode; $$('[data-cr-mode]', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === m)); }); apercu(); }
    });
    el.addEventListener('input', function () { clearTimeout(el._t); el._t = setTimeout(apercu, 120); });
    $('#cr-word', el).addEventListener('click', function () {
      enregistrerIdentite();
      var xml = enFrancais(function () {
        return paragraphes().map(function (p) {
          if (p.tableau) return wTable(p.tableau) + wP('', { apres: 120 });
          if (p.st === 'bloc') return p.x.map(function (l, i) { return wP([{ t: l, b: i === 0 }], { apres: i === p.x.length - 1 ? 240 : 0 }); }).join('');
          if (p.st === 'bloc-d') return p.x.map(function (l, i) { return wP([{ t: l, b: i === 1 }], { align: 'right', apres: i === p.x.length - 1 ? 240 : 0 }); }).join('');
          if (p.st === 'droite') return wP(p.x[0], { align: 'right', apres: 360 });
          if (p.st === 'objet') return wP([{ t: p.x[0], b: true }], { apres: 120 });
          if (p.st === 'petit') return wP(p.x[0], { taille: 18, couleur: '6E6989', apres: 240 });
          if (p.st === 'signature') return wP('', { apres: 600 }) + wP([{ t: p.x[0], b: true }], { align: 'right' });
          return wP(p.x[0], { align: 'both' });
        }).join('');
      });
      var blob = creerDocx(xml), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = { reduction: 'demande_reduction_taux', ra: 'demande_remboursement_anticipe', tableau: 'demande_tableau_actualise' }[courant] + (v('cr-num') ? '_' + v('cr-num').replace(/\W+/g, '') : '') + '.docx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast(t('Lettre téléchargée au format Word.'));
    });
    $('#cr-copier', el).addEventListener('click', function () {
      enregistrerIdentite();
      var txt = paragraphes().map(function (p) { return p.tableau ? p.tableau.map(function (r) { return r[0] + ' : ' + r[1]; }).join('\n') : p.x.join('\n'); }).join('\n\n');
      copierTexte(txt);
    });
    specifique();
  }

  /* ===================================================================
     Optimiseur de stratégie : durée, apport et remboursements anticipés
     sous contrainte de budget, avec la règle de réduction du taux
     =================================================================== */
  function ouvrirOptimiseur() {
    var sc = scenarioActif(), e = sc.entrees || {};
    if (!sc.resultat) { toast(t('Saisissez d\'abord un crédit complet.'), 'erreur'); return; }
    var em = e.emprunteur, prix = e.apport ? e.apport.prix : e.capital, apport0 = e.apport ? e.apport.apport : 0;
    var budget0 = em && em.revenus ? roundPrec(em.revenus * agence.endettementMax / 100 - (em.charges || 0)) : roundPrec(sc.resultat.M1 * 1.1);
    var d = ouvrirDialogue({
      titre: t('Optimiseur de stratégie'), icone: 'sliders', large: true,
      sousTitre: echapper(t('Des centaines de combinaisons (durée, apport, versements anticipés) sont calculées pour trouver le crédit le moins cher qui respecte votre budget.')),
      corps: '<div class="dlg-fields trois">' +
          champDlg('op-prix', t('Montant du projet'), t('Ex. 250 000'), unite(), 'home', fmtSaisie(prix)) +
          champDlg('op-apmax', t('Apport disponible au maximum'), t('Ex. 60 000'), unite(), 'wallet', fmtSaisie(Math.max(apport0, 0))) +
          champDlg('op-budget', t('Échéance maximale par mois'), t('Ex. 1 500'), unite(), 'cash', fmtSaisie(budget0)) +
          champDlg('op-epargne', t('Épargne possible par mois'), t('Ex. 300'), unite(), 'coins', '0') +
          champDlg('op-indem', t('Indemnité de remboursement anticipé'), t('Ex. 1'), '%', 'percent', fmtSaisie(e.indemnite || 0)) +
          champDlg('op-taux', t('Taux annuel'), t('Ex. 9'), '%', 'percent', fmtSaisie(e.taux)) +
        '</div>' +
        '<label class="check" style="margin-top:6px"><input type="checkbox" id="op-reduc" checked><span class="check-box" aria-hidden="true">' + ico('check', 'ico-sm') + '</span>' + echapper(t('Tenir compte de la réduction de taux (règle des 8 %)')) + '</label>' +
        '<div id="op-res"></div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button><button class="btn btn-primary" id="op-go">' + ico('sparkle', 'ico-sm') + echapper(t('Lancer l\'optimisation')) + '</button>'
    });
    var el = d.el, solutions = [];
    function evaluer(o) {
      var C = roundPrec(o.prix - o.apport);
      if (!(C > 0)) return null;
      var ent = { capital: C, mois: o.ans * 12, taux: o.taux, dateDebut: e.dateDebut || aujourdHui(), ras: [], indemnite: o.indem, raMode: 'duree',
        versement: o.versement > 0 ? { montant: o.versement, frequence: 'annee', des: 12 } : null, assurance: e.assurance, frais: e.frais };
      var r = calculerEcheancier(ent, o.reduc && o.ans * 12 > 84);
      return { o: o, C: C, r: r, M: r.M1, cout: roundPrec(r.totI + r.totIndem + r.totAss + r.frais), duree: r.n, red: r.reductions ? r.reductions.length : 0 };
    }
    function lancer() {
      var prixV = valeurDlg(el, 'op-prix'), apMax = valeurDlg(el, 'op-apmax'), budget = valeurDlg(el, 'op-budget'), ep = valeurDlg(el, 'op-epargne'), indem = valeurDlg(el, 'op-indem'), taux = valeurDlg(el, 'op-taux');
      var reduc = $('#op-reduc', el).checked, zone = $('#op-res', el);
      if (!(prixV > 0) || !(apMax >= 0) || !(budget > 0) || !(ep >= 0) || !(indem >= 0) || !(taux >= 0) || apMax >= prixV) {
        zone.innerHTML = '<p class="field-err" style="margin-top:12px">' + echapper(t('Vérifiez les valeurs : montants positifs, apport inférieur au montant du projet.')) + '</p>'; return;
      }
      var t0 = performance.now(), tous = [];
      var apports = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return roundPrec(apMax * f); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      var versements = ep > 0 ? [0, roundPrec(ep * 6), roundPrec(ep * 12)] : [0];
      for (var ans = 3; ans <= 25; ans++) apports.forEach(function (ap) { versements.forEach(function (vs) {
        var x = evaluer({ prix: prixV, apport: ap, ans: ans, taux: taux, indem: indem, versement: vs, reduc: reduc });
        if (x) { x.ok = x.M <= budget + 0.0005; tous.push(x); }
      }); });
      var ok = tous.filter(function (x) { return x.ok; });
      var ms = Math.round(performance.now() - t0);
      if (!ok.length) { zone.innerHTML = '<p class="field-err" style="margin-top:12px">' + echapper(t('Aucune combinaison ne respecte une échéance de {m} : augmentez le budget ou l\'apport.', { m: fmtMoney(budget) })) + '</p>'; return; }
      /* Front de Pareto : aucune autre solution n'a à la fois une échéance plus basse et un coût plus bas */
      ok.sort(function (a, b) { return a.cout - b.cout; });
      var front = [];
      ok.slice().sort(function (a, b) { return a.M - b.M || a.cout - b.cout; }).forEach(function (x) { if (!front.length || x.cout < front[front.length - 1].cout - 0.0005) front.push(x); });
      var meilleur = ok[0], plusSouple = front[0];
      var actuel = evaluer({ prix: prixV, apport: e.apport ? e.apport.apport : 0, ans: Math.round(e.mois / 12), taux: taux, indem: indem, versement: 0, reduc: reduc });
      solutions = [meilleur].concat(front.filter(function (x) { return x !== meilleur; }).slice(0, 4));
      var L = 640, H = 260, g = 70, dd = 14, h = 14, b = 34;
      var xs = tous.map(function (x) { return x.M; }), ys = tous.map(function (x) { return x.cout; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs.concat([budget])), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      function X(v) { return g + (v - x0) / ((x1 - x0) || 1) * (L - g - dd); }
      function Y(v) { return h + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - h - b); }
      var svg = '';
      for (var k = 0; k <= 4; k++) { var vy = y0 + (y1 - y0) * k / 4, vx = x0 + (x1 - x0) * k / 4;
        svg += '<line x1="' + g + '" x2="' + (L - dd) + '" y1="' + Y(vy).toFixed(1) + '" y2="' + Y(vy).toFixed(1) + '" class="grille"/><text x="' + (g - 6) + '" y="' + (Y(vy) + 4).toFixed(1) + '" text-anchor="end" class="axe">' + echapper(fmtCompact(vy)) + '</text>' +
          '<text x="' + X(vx).toFixed(1) + '" y="' + (H - 16) + '" text-anchor="middle" class="axe">' + echapper(fmtCompact(vx)) + '</text>'; }
      svg += '<text x="' + ((g + L) / 2) + '" y="' + (H - 2) + '" text-anchor="middle" class="axe">' + echapper(t('Échéance mensuelle')) + '</text>';
      svg += '<rect x="' + X(budget).toFixed(1) + '" y="' + h + '" width="' + Math.max(0, L - dd - X(budget)).toFixed(1) + '" height="' + (H - h - b) + '" class="op-hors"/>';
      tous.forEach(function (x) { svg += '<circle cx="' + X(x.M).toFixed(1) + '" cy="' + Y(x.cout).toFixed(1) + '" r="2.6" class="' + (x.ok ? 'op-pt' : 'op-pt hors') + '"/>'; });
      svg += '<path d="' + front.map(function (x, i) { return (i ? 'L' : 'M') + X(x.M).toFixed(1) + ' ' + Y(x.cout).toFixed(1); }).join(' ') + '" class="op-front"/>';
      solutions.forEach(function (x, i) { svg += '<circle cx="' + X(x.M).toFixed(1) + '" cy="' + Y(x.cout).toFixed(1) + '" r="' + (i ? 5 : 7) + '" class="op-sol' + (i ? '' : ' top') + '"/>'; });
      if (actuel) svg += '<circle cx="' + X(actuel.M).toFixed(1) + '" cy="' + Y(actuel.cout).toFixed(1) + '" r="6" class="op-actuel"/>';
      function desc(x) { return t('{a} · apport {b}', { a: libAns(x.o.ans), b: fmtMoney(x.o.apport) }) + (x.o.versement ? ' · ' + t('{m} versés chaque année', { m: fmtMoney(x.o.versement) }) : ''); }
      zone.innerHTML =
        '<div class="au-verdict ok" style="margin-top:14px">' + ico('sparkle') + '<div><strong>' + echapper(t('Meilleure stratégie : {d}', { d: desc(meilleur) })) + '</strong><small>' +
          echapper(t('Échéance {m}, coût total {c}', { m: fmtMoney(meilleur.M), c: fmtMoney(meilleur.cout) }) + (actuel ? ' · ' + (actuel.cout - meilleur.cout > 0.5 ? t('{e} de moins que votre scénario actuel', { e: fmtMoney(roundPrec(actuel.cout - meilleur.cout)) }) : t('équivalent à votre scénario actuel')) : '')) + '</small></div></div>' +
        '<div class="graphe-zone" style="margin-top:12px"><svg viewBox="0 0 ' + L + ' ' + H + '" class="graphe-l op-nuage" role="img" style="direction:ltr" aria-label="' + echapper(t('Coût total selon l\'échéance')) + '">' + svg + '</svg></div>' +
        '<p class="legende-g"><span class="lg" style="background:#c4b5fd;border-radius:50%;width:10px"></span>' + echapper(t('combinaisons possibles')) + ' <span class="lg" style="background:#8C5000;height:3px"></span>' + echapper(t('meilleurs compromis')) + ' <span class="lg" style="background:#C27A1A;border-radius:50%;width:10px"></span>' + echapper(t('votre scénario')) + ' <span class="lg" style="background:rgba(244,63,94,.18)"></span>' + echapper(t('hors budget')) + '</p>' +
        '<div class="cmp-table-wrap" style="margin-top:10px"><table class="cmp"><thead><tr><th>' + echapper(t('Stratégie')) + '</th><th>' + echapper(t('Échéance')) + '</th><th>' + echapper(t('Durée réelle')) + '</th><th>' + echapper(t('Coût total')) + '</th><th>' + echapper(t('Réductions')) + '</th><th></th></tr></thead><tbody>' +
          solutions.map(function (x, i) {
            return '<tr><td>' + (i ? '' : '<b>★ </b>') + echapper(desc(x)) + '</td><td>' + echapper(fmtMoney(x.M)) + '</td><td>' + echapper(libMois(x.duree)) + '</td><td class="' + (i ? '' : 'best') + '">' + echapper(fmtMoney(x.cout)) + '</td><td>' + x.red + '</td><td><button type="button" class="btn btn-ghost btn-sm" data-op="' + i + '">' + echapper(t('Appliquer')) + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
        '<p class="ra-note">' + echapper(t('{n} combinaisons calculées en {ms} ms. Un remboursement anticipé baisse les intérêts, donc aussi le ratio des 8 % : il peut retarder ou supprimer une réduction de taux, ce qui est pris en compte ici.', { n: tous.length, ms: ms })) + '</p>';
    }
    $('#op-go', el).addEventListener('click', lancer);
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-op]');
      if (!b) return;
      var x = solutions[+b.dataset.op];
      d.fermer();
      var v = optionsDe(e);
      v.mois = x.o.ans * 12; v.taux = x.o.taux; v.tmm = null; v.variation = null; v.dateDebut = e.dateDebut; v.client = e.client;
      v.apport = x.o.apport > 0 ? { prix: x.o.prix, apport: x.o.apport } : null; if (!v.apport) v.capital = x.o.prix;
      v.ras = []; v.versement = x.o.versement > 0 ? { montant: x.o.versement, frequence: 'annee', des: 12 } : null; v.indemnite = x.o.indem; v.raMode = 'duree';
      v.reduction = $('#op-reduc', el).checked && v.mois > 84;
      v.periodicite = 1; v.amort = 'constant'; v.differe = null;
      sc.appliquer(v);
      toast(t('Stratégie appliquée au scénario {n}.', { n: sc.nom }));
    });
    lancer();
  }

  /* ===================================================================
     Téléphone : feuilles du bas glissables, balayage entre scénarios,
     fichiers partagés vers l'application
     =================================================================== */
  function initialiserMobile() {
    var tactile = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    /* Feuille du bas : glisser la poignée vers le bas pour fermer */
    document.addEventListener('pointerdown', function (ev) {
      var tete = ev.target.closest('dialog.dlg[open] .dlg-head');
      if (!tete || ev.target.closest('button, input, a') || !window.matchMedia('(max-width: 720px)').matches) return;
      var dlg = tete.closest('dialog'), y0 = ev.clientY, dy = 0, t0 = performance.now();
      dlg.classList.add('glisse');
      function bouge(e2) { dy = Math.max(0, e2.clientY - y0); dlg.style.transform = 'translateY(' + dy + 'px)'; }
      function fin() {
        document.removeEventListener('pointermove', bouge); document.removeEventListener('pointerup', fin); document.removeEventListener('pointercancel', fin);
        dlg.classList.remove('glisse');
        var vitesse = dy / Math.max(1, performance.now() - t0);
        if (dy > 120 || vitesse > 0.6) { dlg.style.transform = 'translateY(100%)'; var x = dlg.querySelector('[data-fermer]'); setTimeout(function () { if (x) x.click(); else dlg.close(); }, 160); vibrer(); }
        else dlg.style.transform = '';
      }
      document.addEventListener('pointermove', bouge); document.addEventListener('pointerup', fin); document.addEventListener('pointercancel', fin);
    });
    /* Balayage horizontal entre les scénarios A et B */
    if (tactile) {
      var depart = null;
      document.addEventListener('touchstart', function (ev) {
        var c = ev.target.closest && ev.target.closest('.scenario');
        if (!c || ev.touches.length !== 1 || ev.target.closest('.table-wrap, .sensi-wrap, .cmp-table-wrap, .range, input, textarea, canvas, .chart-wrap, .cal, .flux-zone, .temps-card, dialog')) { depart = null; return; }
        depart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
      }, { passive: true });
      document.addEventListener('touchend', function (ev) {
        if (!depart || $('#tab-b').hidden) { depart = null; return; }
        var dx = ev.changedTouches[0].clientX - depart.x, dy = ev.changedTouches[0].clientY - depart.y, dt = Date.now() - depart.t;
        depart = null;
        if (Math.abs(dx) < 80 || Math.abs(dy) > 50 || dt > 600) return;
        var rtl = document.documentElement.dir === 'rtl', versB = rtl ? dx > 0 : dx < 0;
        var cible = versB ? 'b' : 'a';
        if (cible === actif) return;
        document.documentElement.dataset.balayage = versB ? 'gauche' : 'droite';
        activer(cible);
        setTimeout(function () { delete document.documentElement.dataset.balayage; }, 500);
        vibrer();
      }, { passive: true });
    }
    /* Fichier partagé vers l'application (menu Partager) ou ouvert avec elle */
    var q = new URLSearchParams(location.search);
    if (q.get('partage') === '1' && 'caches' in window) {
      caches.open('simulateur-partage').then(function (c) {
        return c.keys().then(function (cles) {
          return Promise.all(cles.map(function (k) { return c.match(k).then(function (r) { return r.blob().then(function (b) { c.delete(k); return new File([b], decodeURIComponent(k.url.split('/').pop()) || 'tableau.pdf', { type: b.type }); }); }); }));
        });
      }).then(function (fichiers) {
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* sans effet */ }
        if (fichiers.length) ouvrirAudit(fichiers);
      });
    }
    var raccourci = q.get('raccourci');
    if (raccourci) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* sans effet */ }
      setTimeout(function () { if (raccourci === 'guide') ouvrirGuide(); else if (raccourci === 'audit') ouvrirAudit(); }, 300);
    }
    if ('launchQueue' in window) {
      window.launchQueue.setConsumer(function (params) {
        if (!params.files || !params.files.length) return;
        Promise.all(params.files.map(function (h) { return h.getFile(); })).then(function (fichiers) { ouvrirAudit(fichiers); });
      });
    }
  }

  /* ===================================================================
     Barre latérale : rubriques, section en cours, résumé vivant
     =================================================================== */
  var CLE_NAV = 'navigationReduite', CLE_NAV_GROUPES = 'navigationGroupes';
  var nav = { construite: false, observateur: null, visibles: {}, courant: null };
  var mqTiroir = window.matchMedia ? matchMedia('(max-width: 899px)') : { matches: false, addEventListener: function () {} };
  var mqRail = window.matchMedia ? matchMedia('(min-width: 900px) and (max-width: 1280px)') : { matches: false, addEventListener: function () {} };

  /* Sections du scénario actif (id suffixe, libellé, icône, valeur affichée) */
  var SECTIONS = [
    { cle: 'parametres', nom: 'Paramètres du crédit', ico: 'sliders', cible: function (k) { var el = $('#' + k + '-titre'); return el && el.closest('.form-card'); }, toujours: true },
    { cle: 'resultats', nom: 'Résultats', ico: 'calendar', cible: function (k) { var el = $('#' + k + '-res'); return el && $('.kpis', el); } },
    { cle: 'cout', nom: 'Coût du crédit et TEG', ico: 'coins', cible: function (k) { return $('#' + k + '-cout'); } },
    { cle: 'visu', nom: 'Analyse visuelle', ico: 'sparkle', cible: function (k) { return $('#' + k + '-visu'); } },
    { cle: 'elig', nom: 'Éligibilité', ico: 'check', cible: function (k) { return $('#' + k + '-elig'); }, siVisible: true },
    { cle: 'ra', nom: 'Remboursements anticipés', ico: 'fast', cible: function (k) { return $('#' + k + '-racard'); }, siVisible: true },
    { cle: 'sensi', nom: 'Sensibilité au TMM', ico: 'trend', cible: function (k) { return $('#' + k + '-sensi'); }, siVisible: true },
    { cle: 'temps', nom: 'Voyage dans le temps', ico: 'clock', cible: function (k) { return $('#' + k + '-temps'); } },
    { cle: 'echeancier', nom: 'Tableau d\'amortissement', ico: 'table', cible: function (k) { var el = $('#' + k + '-titre-ech'); return el && el.closest('.schedule'); },
      meta: function (sc) { return String(sc.resultat.n); } }
  ];
  var DOSSIER = [
    { cle: 'historique', nom: 'Historique', ico: 'history', fn: function () { ouvrirHistorique(); }, meta: function () { var n = lireHistorique().length; return n ? String(n) : ''; } },
    { cle: 'comparer', nom: 'Comparer', ico: 'compare', fn: function () { ouvrirComparaison(); } },
    { cle: 'rapport', nom: 'Rapport client', ico: 'award', fn: function () { preparerRapport(scenarioActif()); } },
    { cle: 'pdf', nom: 'Exporter PDF', ico: 'file', fn: function () { exporterPDF(scenarioActif()); } },
    { cle: 'excel', nom: 'Exporter Excel', ico: 'sheet', fn: function () { exporterExcel(scenarioActif()); } },
    { cle: 'agence', nom: 'Agence et paramètres', ico: 'building', fn: function () { ouvrirAgence(); } }
  ];

  function groupesOuverts() {
    var g = { simulation: true, outils: true, dossier: true };
    try { var b = JSON.parse(stock.lire(CLE_NAV_GROUPES, 'null')); if (b && typeof b === 'object') Object.keys(g).forEach(function (k) { if (typeof b[k] === 'boolean') g[k] = b[k]; }); } catch (e) { /* valeurs par défaut */ }
    return g;
  }

  function itemHtml(o, type) {
    return '<button type="button" class="nl-item" data-nav-' + type + '="' + o.cle + '" data-tip="' + echapper(t(o.nom)) + '">' +
      '<span class="nl-ico" aria-hidden="true">' + ico(o.ico) + '</span><span class="nl-txt">' + echapper(t(o.nom)) + '</span><span class="nl-meta num"></span></button>';
  }
  function groupeHtml(cle, titre, contenu, ouvert, espion) {
    return '<div class="nl-groupe" data-groupe="' + cle + '" data-ouvert="' + ouvert + '">' +
      '<button type="button" class="nl-titre" aria-expanded="' + ouvert + '" aria-controls="nl-g-' + cle + '"><span>' + echapper(t(titre)) + '</span>' + ico('chevron', 'chev') + '</button>' +
      '<div class="nl-corps" id="nl-g-' + cle + '"><div class="nl-liste' + (espion ? ' espion' : '') + '">' +
        (espion ? '<span class="nl-progres" aria-hidden="true"></span><span class="nl-indic" aria-hidden="true"></span>' : '') + contenu +
      '</div></div></div>';
  }

  function construireNav() {
    var aside = $('#nav-lat');
    if (!aside) return;
    var g = groupesOuverts();
    aside.setAttribute('aria-label', t('Rubriques'));
    aside.innerHTML =
      '<div class="nl-tete-tiroir"><strong>' + echapper(t('Rubriques')) + '</strong>' +
        '<button type="button" class="btn btn-quiet btn-sm btn-icon nl-fermer" data-nav-fermer aria-label="' + echapper(t('Fermer')) + '">' + ico('x') + '</button></div>' +
      '<button type="button" class="nl-resume vide" data-nav-ancre="resultats" data-tip="' + echapper(t('Résultats')) + '">' +
        '<span class="r-lib"><span class="r-sc"></span><span class="r-titre"></span></span><span class="r-val num"></span><span class="r-sous"></span><span class="r-mini"></span></button>' +
      '<button type="button" class="nl-item nl-guide" data-nav-guide data-tip="' + echapper(t('Simulation guidée')) + '"><span class="nl-ico" aria-hidden="true">' + ico('sparkle') + '</span><span class="nl-txt">' + echapper(t('Simulation guidée')) + '</span></button>' +
      '<nav class="nl-defile" aria-label="' + echapper(t('Rubriques')) + '">' +
        groupeHtml('simulation', 'Simulation', SECTIONS.map(function (s) { return itemHtml(s, 'ancre'); }).join(''), g.simulation, true) +
        groupeHtml('outils', 'Outils', OUTILS.map(function (o) { return itemHtml(o, 'outil'); }).join(''), g.outils, false) +
        groupeHtml('dossier', 'Dossier et documents', DOSSIER.map(function (o) { return itemHtml(o, 'action'); }).join(''), g.dossier, false) +
      '</nav>' +
      '<a class="nl-item nl-av" href="/outils/assurance-vie/" data-tip="' + echapper(t('Simulateur Assurance Vie et CEA')) + '">' +
        '<span class="nl-ico nl-av-ico" aria-hidden="true"><svg class="av-logo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="av-g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset=".55" stop-color="#8C5000"/><stop offset="1" stop-color="#B86E00"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#av-g2)"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(32 32) scale(2.3) translate(-12 -12.5)"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></g></svg></span>' +
        '<span class="nl-txt"><b>' + echapper(t('Assurance vie')) + '</b><small>' + echapper(t('CEA, épargne et impôt')) + '</small></span>' + ico('externe', 'ico-sm nl-av-fl') + '</a>' +
      '<a class="nl-item nl-av" href="https://mohamed-ja.github.io/simulateur-Assurance-Automobile/" target="_blank" rel="noopener" data-tip="' + echapper(t('Simulateur Assurance Automobile')) + '">' +
        '<span class="nl-ico nl-av-ico" aria-hidden="true"><svg class="av-logo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="av-g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f5bea"/><stop offset="1" stop-color="#1e88e5"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#av-g3)"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(32 32) scale(2.35) translate(-12 -12.5)"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></g></svg></span>' +
        '<span class="nl-txt"><b>' + echapper(t('Assurance auto')) + '</b><small>' + echapper(t('Prime, offre et constat')) + '</small></span>' + ico('externe', 'ico-sm nl-av-fl') + '</a>' +
      '<a class="nl-item nl-av" href="/outils/salaire/" data-tip="' + echapper(t('Calculateur de salaire brut ⇄ net')) + '">' +
        '<span class="nl-ico nl-av-ico" aria-hidden="true"><svg class="av-logo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="av-g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d9488"/><stop offset=".6" stop-color="#0891b2"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#av-g4)"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(32 32) scale(2.4) translate(-12 -12)"><path d="M4 9h14l-3.5-3.5"/><path d="M20 15H6l3.5 3.5"/></g></svg></span>' +
        '<span class="nl-txt"><b>' + echapper(t('Salaire brut ⇄ net')) + '</b><small>' + echapper(t('CNSS ou CNRPS, impôt')) + '</small></span>' + ico('externe', 'ico-sm nl-av-fl') + '</a>' +
      '<div class="nl-pied"><button type="button" class="nl-item" id="btnLisible" aria-pressed="' + document.documentElement.classList.contains('lisible') + '" data-tip="' + echapper(t('Haute lisibilité')) + '">' +
        '<span class="nl-ico" aria-hidden="true">' + ico('globe') + '</span><span class="nl-txt">' + echapper(t('Haute lisibilité')) + '</span><span class="nl-bascule" aria-hidden="true"></span></button>' +
        '<button type="button" class="nl-item nl-replier" data-nav-replier data-tip="' + echapper(t('Déplier le panneau')) + '">' +
        '<span class="nl-ico" aria-hidden="true">' + ico('panel') + '</span><span class="nl-txt">' + echapper(t('Réduire le panneau')) + '</span></button></div>';
    nav.construite = true;
    majModeNav();
    majNav();
  }

  function navReduite() { return stock.lire(CLE_NAV, '0') === '1'; }
  function majModeNav() {
    var aside = $('#nav-lat');
    if (!aside) return;
    var rail = !mqTiroir.matches && (mqRail.matches || navReduite());
    aside.classList.toggle('rail', rail);
    var r = $('[data-nav-replier]', aside);
    if (r) {
      r.setAttribute('aria-label', rail ? t('Déplier le panneau') : t('Réduire le panneau'));
      r.setAttribute('aria-expanded', String(!rail));
      r.hidden = mqRail.matches;
    }
    $$('.nl-item', aside).forEach(function (b) {
      if (rail) b.setAttribute('aria-label', b.dataset.tip || ''); else if (!b.hasAttribute('data-nav-replier')) b.removeAttribute('aria-label');
    });
    if (!mqTiroir.matches) fermerTiroir(true);
    placerIndicateur();
  }

  /* Valeurs vivantes, disponibilité des sections, observation du défilement */
  function majNav() {
    if (!nav.construite) return;
    var aside = $('#nav-lat'), sc = scenarioActif();
    if (!aside || !sc) return;
    var r = sc.resultat, k = sc.cle;
    var resume = $('.nl-resume', aside);
    resume.classList.toggle('vide', !r);
    $('.r-sc', resume).textContent = sc.nom;
    $('.r-titre', resume).textContent = r ? t(infoPeriodicite(r.p).echeance) : t('Scénario {n}', { n: sc.nom });
    $('.r-val', resume).textContent = r ? fmtMoney(r.M1) : t('Votre simulation apparaîtra ici');
    $('.r-sous', resume).textContent = r ? t('{n} · TEG {t}', { n: libEcheances(r.n), t: isFinite(r.teg) ? fmtPct(r.teg, 2) : '—' }) : t('Complétez le capital, la durée et le taux pour calculer.');
    $('.r-mini', resume).textContent = sc.nom;
    resume.setAttribute('aria-label', r ? t('Résultats') + ' : ' + fmtMoney(r.M1) : t('Votre simulation apparaîtra ici'));
    SECTIONS.forEach(function (s) {
      var b = $('.nl-liste [data-nav-ancre="' + s.cle + '"]', aside), cible = s.cible(k);
      if (!b) return;
      var dispo = !!cible && (s.toujours || (!!r && !(s.siVisible && cible.hidden)));
      b.hidden = !!s.siVisible && (!r || !cible || cible.hidden);
      b.setAttribute('aria-disabled', String(!dispo));
      $('.nl-meta', b).textContent = dispo && r && s.meta ? s.meta(sc) : '';
    });
    DOSSIER.forEach(function (o) {
      var b = $('[data-nav-action="' + o.cle + '"]', aside);
      if (b && o.meta) $('.nl-meta', b).textContent = o.meta();
    });
    observerSections();
    placerIndicateur();
  }

  function observerSections() {
    if (!('IntersectionObserver' in window)) return;
    if (nav.observateur) nav.observateur.disconnect();
    nav.visibles = {};
    var sc = scenarioActif();
    nav.observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) { nav.visibles[en.target.dataset.navSection] = en.isIntersecting ? en.intersectionRatio + (en.boundingClientRect.top < window.innerHeight * 0.4 ? 1 : 0) : 0; });
      choisirCourant();
    }, { rootMargin: '-' + Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--haut-barre')) || 65) + 'px 0px -45% 0px', threshold: [0, 0.2, 0.5, 1] });
    SECTIONS.forEach(function (s) {
      var c = s.cible(sc.cle);
      if (!c || c.hidden || (c.closest('[hidden]'))) return;
      c.dataset.navSection = s.cle;
      nav.observateur.observe(c);
    });
  }

  function choisirCourant() {
    var meilleur = null, score = 0;
    SECTIONS.forEach(function (s) { var v = nav.visibles[s.cle] || 0; if (v > score) { score = v; meilleur = s.cle; } });
    /* En haut de page : la première rubrique ; en bas : la dernière visible */
    if (window.scrollY < 40) meilleur = 'parametres';
    else if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && scenarioActif().resultat) meilleur = 'echeancier';
    if (meilleur && meilleur !== nav.courant) {
      nav.courant = meilleur;
      $$('#nav-lat [data-nav-ancre]').forEach(function (b) {
        var on = b.dataset.navAncre === meilleur && !b.classList.contains('nl-resume');
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
      placerIndicateur();
    }
  }

  function placerIndicateur() {
    var aside = $('#nav-lat');
    if (!aside) return;
    var indic = $('.nl-indic', aside), prog = $('.nl-progres', aside);
    if (!indic) return;
    var actifB = $('.nl-liste [aria-current="true"]', aside);
    if (!actifB || actifB.hidden) { indic.classList.remove('on'); if (prog) prog.style.height = '0px'; return; }
    indic.style.transform = 'translateY(' + actifB.offsetTop + 'px)';
    indic.style.height = actifB.offsetHeight + 'px';
    indic.classList.add('on');
    if (prog) prog.style.height = Math.max(0, actifB.offsetTop + actifB.offsetHeight / 2 - 14) + 'px';
  }

  function allerA(cle) {
    var sc = scenarioActif(), s = SECTIONS.filter(function (x) { return x.cle === cle; })[0];
    var cible = s && s.cible(sc.cle);
    var bouton = $('#nav-lat [data-nav-ancre="' + cle + '"]:not(.nl-resume)');
    if (!cible || (bouton && bouton.getAttribute('aria-disabled') === 'true')) {
      toast(t('Saisissez d\'abord un crédit complet.'), 'info');
      allerA('parametres');
      return;
    }
    fermerTiroir();
    cible.scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
    cible.classList.remove('cible-flash');
    void cible.offsetWidth;
    cible.classList.add('cible-flash');
    setTimeout(function () { cible.classList.remove('cible-flash'); }, 1200);
    if (bouton) { bouton.classList.remove('arrivee'); void bouton.offsetWidth; bouton.classList.add('arrivee'); }
  }

  /* Tiroir (téléphone) */
  var dernierFocusNav = null;
  function ouvrirTiroir() {
    var aside = $('#nav-lat');
    dernierFocusNav = document.activeElement;
    majNav();
    aside.classList.add('ouvert');
    $('#nl-fond').classList.add('on');
    $('#btnNav').setAttribute('aria-expanded', 'true');
    ['.topbar', '.coque > .page'].forEach(function (sel) { var el = $(sel); if (el) el.inert = true; });
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { var b = $('[data-nav-fermer]', aside); if (b) b.focus(); }, 60);
    vibrer();
  }
  function fermerTiroir(silencieux) {
    var aside = $('#nav-lat');
    if (!aside || !aside.classList.contains('ouvert')) return;
    aside.classList.remove('ouvert');
    $('#nl-fond').classList.remove('on');
    $('#btnNav').setAttribute('aria-expanded', 'false');
    ['.topbar', '.coque > .page'].forEach(function (sel) { var el = $(sel); if (el) el.inert = false; });
    document.documentElement.style.overflow = '';
    if (!silencieux && dernierFocusNav && dernierFocusNav.focus) dernierFocusNav.focus();
  }

  /* Bulle d'aide du rail d'icônes */
  function bulleNav(b, montrer) {
    var bulle = $('#nl-bulle');
    if (!bulle) { bulle = document.createElement('div'); bulle.id = 'nl-bulle'; bulle.className = 'nl-bulle'; bulle.setAttribute('aria-hidden', 'true'); document.body.appendChild(bulle); }
    if (!montrer) { bulle.classList.remove('on'); return; }
    var r = b.getBoundingClientRect(), rtl = document.documentElement.dir === 'rtl';
    bulle.textContent = b.dataset.tip;
    bulle.style.top = (r.top + r.height / 2 - 15) + 'px';
    if (rtl) { bulle.style.left = ''; bulle.style.right = (window.innerWidth - r.left + 10) + 'px'; }
    else { bulle.style.right = ''; bulle.style.left = (r.right + 10) + 'px'; }
    bulle.classList.add('on');
  }

  function initialiserNav() {
    var aside = $('#nav-lat');
    if (!aside) return;
    var barre = $('.topbar');
    function hauteur() { document.documentElement.style.setProperty('--haut-barre', barre.offsetHeight + 'px'); }
    hauteur();
    if ('ResizeObserver' in window) new ResizeObserver(function () { hauteur(); placerIndicateur(); }).observe(barre);
    construireNav();
    aside.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-nav-fermer')) { fermerTiroir(); return; }
      if (b.hasAttribute('data-nav-guide')) { fermerTiroir(true); bulleNav(b, false); ouvrirGuide(); return; }
      if (b.id === 'btnLisible') { basculerLisibilite(); return; }
      if (b.hasAttribute('data-nav-replier')) {
        stock.ecrire(CLE_NAV, navReduite() ? '0' : '1');
        bulleNav(b, false);
        majModeNav();
        return;
      }
      if (b.classList.contains('nl-titre')) {
        var gr = b.closest('.nl-groupe'), ouvert = gr.dataset.ouvert !== 'true';
        gr.dataset.ouvert = String(ouvert);
        b.setAttribute('aria-expanded', String(ouvert));
        var etat = groupesOuverts(); etat[gr.dataset.groupe] = ouvert;
        stock.ecrire(CLE_NAV_GROUPES, JSON.stringify(etat));
        setTimeout(placerIndicateur, 400);
        return;
      }
      if (b.dataset.navAncre) { allerA(b.dataset.navAncre); return; }
      var o = b.dataset.navOutil ? OUTILS.filter(function (x) { return x.cle === b.dataset.navOutil; })[0]
        : (b.dataset.navAction ? DOSSIER.filter(function (x) { return x.cle === b.dataset.navAction; })[0] : null);
      if (o) { fermerTiroir(true); bulleNav(b, false); setTimeout(o.fn, mqTiroir.matches ? 200 : 0); }
    });
    aside.addEventListener('pointerover', function (ev) { var b = ev.target.closest('.nl-item, .nl-resume'); if (b && aside.classList.contains('rail')) bulleNav(b, true); });
    aside.addEventListener('pointerout', function (ev) { var b = ev.target.closest('.nl-item, .nl-resume'); if (b && !b.contains(ev.relatedTarget)) bulleNav(b, false); });
    aside.addEventListener('focusin', function (ev) { var b = ev.target.closest('.nl-item, .nl-resume'); if (b && aside.classList.contains('rail') && ev.target.matches(':focus-visible')) bulleNav(b, true); });
    aside.addEventListener('focusout', function () { bulleNav(null, false); });
    $('.nl-defile', aside).addEventListener('scroll', function () { bulleNav(null, false); }, { passive: true });
    $('#btnNav').addEventListener('click', ouvrirTiroir);
    $('#nl-fond').addEventListener('click', function () { fermerTiroir(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && aside.classList.contains('ouvert')) fermerTiroir(); });
    [mqTiroir, mqRail].forEach(function (m) { if (m.addEventListener) m.addEventListener('change', majModeNav); else if (m.addListener) m.addListener(majModeNav); });
    var attente = false;
    window.addEventListener('scroll', function () {
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () { attente = false; choisirCourant(); });
    }, { passive: true });
    choisirCourant();
  }

  /* ===================================================================
     Thème et langue
     =================================================================== */
  function appliquerLangue() {
    var html = document.documentElement;
    html.lang = LANGUE;
    html.dir = LANGUE === 'ar' ? 'rtl' : 'ltr';
    document.title = t('Simulateur de crédit en Dinar Tunisien');
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('Simulez votre crédit en dinars tunisiens : mensualité, coût des intérêts, tableau d\'amortissement, capacité d\'emprunt et comparaison de scénarios.'));
    traduireDOM(document);
  }

  function changerLangue() {
    LANGUE = LANGUE === 'ar' ? 'fr' : 'ar';
    stock.ecrire(CLE_LANGUE, LANGUE);
    appliquerLangue();
    majBoutonTheme();
    construireNav();
    Object.keys(scenarios).forEach(function (k) { if (scenarios[k]) scenarios[k].mettreAJour(); });
    majVersus();
    toast(LANGUE === 'ar' ? 'تم التحويل إلى العربية. تبقى ملفات PDF و Excel بالفرنسية.' : 'Interface en français.', 'info', 4200);
  }

  /* ===================================================================
     Application installable (PWA) et hors connexion
     =================================================================== */
  var invitationInstall = null;
  function estInstallee() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  function estAndroid() { return /android/i.test(navigator.userAgent); }
  var surInvitation = null;

  function lancerInstallation() {
    if (!invitationInstall) return;
    var inv = invitationInstall;
    inv.prompt();
    inv.userChoice.then(function (choix) {
      invitationInstall = null;
      $('#btnInstaller').hidden = true;
      if (choix && choix.outcome === 'dismissed') toast(t('Installation annulée. Vous pourrez la relancer depuis le bouton « Installer l\'application ».'), 'info', 5000);
    }).catch(function () {});
  }

  /* Fenêtre d'installation adaptée au téléphone : bouton direct quand le
     navigateur le permet (Android, ordinateur), sinon les gestes à faire. */
  function ouvrirInstallation() {
    if (estInstallee()) { toast(t('L\'application est déjà installée sur cet appareil.'), 'info'); return; }
    function etapes(liste) { return '<ol class="etapes grandes">' + liste.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>'; }
    function b(s) { return '<b>' + echapper(s) + '</b>'; }
    function contenu() {
      if (invitationInstall) {
        return '<div class="install-direct">' +
          '<img src="icons/icon-192.png" alt="" width="84" height="84">' +
          '<p>' + echapper(t('Un seul geste : touchez « Installer maintenant », puis confirmez.')) + '</p>' +
          '<button type="button" class="btn btn-primary install-go" id="install-go">' + ico('download') + echapper(t('Installer maintenant')) + '</button></div>';
      }
      if (estIOS()) {
        return etapes([
          echapper(t('Touchez le bouton')) + ' ' + b(t('Partager')) + ' <span class="ios-partage" aria-hidden="true">' + ico('upload', 'ico-sm') + '</span> ' +
            echapper(t('(en bas de l\'écran dans Safari, en haut à droite dans Chrome).')),
          echapper(t('Faites défiler et choisissez')) + ' ' + b(t('Sur l\'écran d\'accueil')) + '.',
          echapper(t('Touchez')) + ' ' + b(t('Ajouter')) + ' : ' + echapper(t('l\'icône du simulateur apparaît sur votre écran d\'accueil.'))
        ]);
      }
      if (estAndroid()) {
        return etapes([
          echapper(t('Touchez le menu')) + ' ' + b('⋮') + ' ' + echapper(t('en haut à droite du navigateur.')),
          echapper(t('Choisissez')) + ' ' + b(t('Installer l\'application')) + ' ' + echapper(t('ou')) + ' ' + b(t('Ajouter à l\'écran d\'accueil')) + '.',
          echapper(t('Confirmez avec')) + ' ' + b(t('Installer')) + '.'
        ]) + '<p class="opt-note" style="margin-top:10px">' + echapper(t('Le bouton « Installer maintenant » apparaît ici dès que le navigateur est prêt.')) + '</p>';
      }
      return etapes([
        echapper(t('Cliquez sur l\'icône d\'installation à droite de la barre d\'adresse, ou ouvrez le menu du navigateur.')),
        echapper(t('Choisissez')) + ' ' + b(t('Installer l\'application')) + '.'
      ]) + '<p class="opt-note" style="margin-top:10px">' + echapper(t('Sur téléphone, scannez le QR code d\'installation pour l\'avoir dans votre poche.')) + '</p>';
    }
    var d = ouvrirDialogue({
      titre: t('Installer l\'application'),
      sousTitre: echapper(t('Le simulateur s\'ouvre alors comme une application, depuis l\'écran d\'accueil, même sans connexion.')),
      icone: 'phone',
      corps: '<div id="install-zone">' + contenu() + '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Plus tard')) + '</button>',
      surFermeture: function () { surInvitation = null; }
    });
    function brancher() {
      var go = $('#install-go', d.el);
      if (go) go.addEventListener('click', function () { d.fermer(); lancerInstallation(); });
    }
    brancher();
    /* L'invitation du navigateur peut arriver après l'ouverture de la fenêtre */
    surInvitation = function () { $('#install-zone', d.el).innerHTML = contenu(); brancher(); };
  }

  /* Adresse à mettre dans le QR code d'installation */
  function adresseInstallation() { return adresseApplication() + '?installer=1'; }

  /* Affiche A4 (PNG) : titre, QR code d'installation et mode d'emploi */
  function dessinerAffiche(qr) {
    var L = 1240, H = 1754;
    var cv = document.createElement('canvas');
    cv.width = L; cv.height = H;
    var c = cv.getContext('2d');
    var police = enArabe() ? '"IBM Plex Sans Arabic", sans-serif' : '"Bricolage Grotesque", "IBM Plex Sans", sans-serif';
    var rtl = enArabe();
    c.direction = rtl ? 'rtl' : 'ltr';
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, L, H);
    var g = c.createLinearGradient(0, 0, L, 520);
    g.addColorStop(0, '#8C5000'); g.addColorStop(0.55, '#B86E00'); g.addColorStop(1, '#C27A1A');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(L, 0); c.lineTo(L, 440); c.quadraticCurveTo(L / 2, 560, 0, 440); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center';
    c.font = '800 70px ' + police;
    c.fillText(t('Simulateur de crédit'), L / 2, 190);
    c.font = '600 44px ' + police;
    c.fillText(t('en Dinar Tunisien'), L / 2, 262);
    c.font = '500 34px ' + police;
    c.fillText(t('Mensualité, TEG, tableau d\'amortissement, hors connexion'), L / 2, 340);
    /* QR code dans une carte */
    var n = qr.getModuleCount(), taille = 640, mod = Math.floor(taille / (n + 8)), cote = mod * (n + 8);
    var x0 = Math.round((L - cote) / 2), y0 = 520;
    c.fillStyle = '#8C5000';
    arrondi(c, x0 - 14, y0 - 14, cote + 28, cote + 28, 40); c.fill();
    c.fillStyle = '#ffffff';
    arrondi(c, x0, y0, cote, cote, 28); c.fill();
    c.fillStyle = '#161229';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect(x0 + (x + 4) * mod, y0 + (y + 4) * mod, mod, mod);
    var yT = y0 + cote + 110;
    c.fillStyle = '#6E3F00'; c.font = '800 54px ' + police;
    c.fillText(t('Scannez pour installer l\'application'), L / 2, yT);
    c.fillStyle = '#3d3857'; c.font = '500 34px ' + police;
    var lignes = [
      t('1. Ouvrez l\'appareil photo et visez le QR code.'),
      t('2. Touchez le lien qui apparaît.'),
      t('3. Suivez les indications : « Installer » ou « Sur l\'écran d\'accueil ».')
    ];
    lignes.forEach(function (l, i) { c.fillText(l, L / 2, yT + 80 + i * 56); });
    c.fillStyle = '#6e6989'; c.font = '500 26px ' + police;
    var pied = agence.nom ? ligneAgence() : 'Mohamed Aziz Jaouadi';
    c.fillText(pied, L / 2, H - 70);
    c.fillStyle = '#a39fb8'; c.font = '400 22px ' + police;
    c.direction = 'ltr';
    c.fillText(adresseApplication(), L / 2, H - 30);
    return cv;
  }
  function arrondi(c, x, y, l, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + l - r, y); c.quadraticCurveTo(x + l, y, x + l, y + r);
    c.lineTo(x + l, y + h - r); c.quadraticCurveTo(x + l, y + h, x + l - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  function ouvrirQRInstallation() {
    var lien = adresseInstallation();
    var qr = matriceQR(lien);
    if (!qr) { toast(t('QR code indisponible : bibliothèque non chargée (connexion requise).'), 'erreur'); return; }
    var d = ouvrirDialogue({
      titre: t('QR code d\'installation'),
      sousTitre: echapper(t('Scanné avec n\'importe quel téléphone, il ouvre le simulateur et propose aussitôt de l\'installer.')),
      icone: 'phone',
      corps:
        '<div class="qr-zone">' +
          '<div class="qr-carte">' + svgQR(qr) + '</div>' +
          '<div class="qr-lien">' + ico('link', 'ico-sm') +
            '<input id="qri-url" type="text" readonly dir="ltr" aria-label="' + echapper(t('Lien d\'installation')) + '" value="' + echapper(lien) + '">' +
            '<button class="btn btn-primary btn-sm" id="qri-copier">' + echapper(t('Copier')) + '</button>' +
          '</div>' +
          '<p class="qr-aide">' + echapper(t('Sur Android, un bouton « Installer maintenant » s\'affiche ; sur iPhone, les deux gestes à faire sont indiqués. Aucun téléphone n\'autorise une installation sans confirmation de l\'utilisateur.')) + '</p>' +
        '</div>',
      pied: '<button class="btn btn-ghost" data-fermer>' + echapper(t('Fermer')) + '</button>' +
            '<button class="btn btn-violet" id="qri-image">' + ico('qr', 'ico-sm') + echapper(t('Image du QR code')) + '</button>' +
            '<button class="btn btn-primary" id="qri-affiche">' + ico('download', 'ico-sm') + echapper(t('Affiche A4 (PNG)')) + '</button>'
    });
    var el = d.el;
    $('#qri-url', el).addEventListener('focus', function () { this.select(); });
    $('#qri-copier', el).addEventListener('click', function () {
      copierTexte(lien).then(function () { toast(t('Lien copié dans le presse-papiers.')); },
        function () { $('#qri-url', el).select(); toast(t('Copie impossible : sélectionnez le lien et copiez-le.'), 'info'); });
    });
    $('#qri-image', el).addEventListener('click', function () {
      telechargerQR(qr, 'qr_installation_simulateur.png');
      toast(t('Image du QR code téléchargée.'));
    });
    $('#qri-affiche', el).addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = dessinerAffiche(qr).toDataURL('image/png');
      a.download = 'affiche_installation_simulateur.png';
      document.body.appendChild(a); a.click(); a.remove();
      toast(t('Affiche téléchargée : imprimez-la et posez-la à l\'accueil de l\'agence.'));
    });
  }

  function initialiserPWA() {
    var bouton = $('#btnInstaller');
    /* Espace Finances TN : pas de service worker propre à l'outil (fichiers communs toujours à jour) */
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (l) {
        l.forEach(function (r) { if (r.scope.indexOf('/outils/') !== -1) r.unregister(); });
      }).catch(function () {});
    }
    /* Arrivée par le QR code d'installation (?installer=1) */
    var parInstallation = false;
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.get('installer') === '1') {
        parInstallation = true;
        q.delete('installer');
        var reste = q.toString();
        history.replaceState(null, '', window.location.pathname + (reste ? '?' + reste : '') + window.location.hash);
      }
    } catch (err) { /* sans effet */ }
    if (estInstallee()) return;
    window.addEventListener('beforeinstallprompt', function (ev) {
      ev.preventDefault();
      invitationInstall = ev;
      bouton.hidden = false;
      if (surInvitation) surInvitation();
    });
    window.addEventListener('appinstalled', function () {
      invitationInstall = null;
      bouton.hidden = true;
      toast(t('Application installée : elle fonctionne aussi hors connexion.'));
    });
    if ((estIOS() || estAndroid()) && /^https:$/.test(location.protocol)) bouton.hidden = false;
    bouton.addEventListener('click', function () {
      if (invitationInstall) { lancerInstallation(); return; }
      ouvrirInstallation();
    });
    if (parInstallation) setTimeout(ouvrirInstallation, 700);
  }

  /* ===================================================================
     Démarrage
     =================================================================== */
  function demarrer() {
    if (LANGUE === 'ar') appliquerLangue();
    $('#annee-courante').textContent = new Date().getFullYear();
    majMarque();
    scenarios.a = creerScenario('a', 'A');

    $('#tab-a').addEventListener('click', function () { activer('a'); });
    $('#tab-b').addEventListener('click', function (ev) {
      if (ev.target.closest('#tab-b-close')) { ev.stopPropagation(); afficherB(false); return; }
      activer('b');
    });
    $('#tab-b-close').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); afficherB(false); }
    });
    $('.tabs').addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if ($('#tab-b').hidden) return;
      var cible = actif === 'a' ? 'b' : 'a';
      activer(cible);
      $('#tab-' + cible).focus();
    });
    $('#btnAjouterScenario').addEventListener('click', function () { afficherB(true); });
    initialiserMenuOutils();
    $('#btnHistorique').addEventListener('click', ouvrirHistorique);
    $('#btnComparer').addEventListener('click', ouvrirComparaison);
    $('#btnAgence').addEventListener('click', ouvrirAgence);
    $('#btnLangue').addEventListener('click', changerLangue);
    $('#btnTheme').addEventListener('click', themeSuivant);
    initialiserAvance();
    initialiserNav();
    initialiserComplet();
    initialiserMobile();
    demarre = true;
    window.addEventListener('beforeprint', function () { preparerImpression(scenarios[actif]); });
    lireLienPartage();
    initialiserPWA();

  }

  /* Espace Finances TN : état (lien de simulation) et résumé pour l'enregistrement dans le compte */
  window.EspaceOutil = {
    outil: 'credit',
    etat: function () {
      var sc = scenarios[actif];
      if (!sc || !sc.entrees) return null;
      var lien = lienSimulation(sc), i = lien.indexOf('?');
      return i === -1 ? '' : lien.slice(i + 1);
    },
    resume: function () {
      var sc = scenarios[actif];
      if (!sc || !sc.entrees || !sc.resultat) return null;
      var e = sc.entrees, r = sc.resultat;
      var periode = e.periodicite === 1 ? 'mensualité' : e.periodicite === 3 ? 'trimestrialité' : e.periodicite === 6 ? 'semestrialité' : 'annuité';
      var sec = [
        { libelle: 'Taux', valeur: Math.round(Number(e.taux) * 1000) / 1000, unite: '%' },
        { libelle: 'Coût des intérêts', valeur: Math.round(r.totI || 0), unite: 'DT' }
      ];
      if (isFinite(r.teg) && (r.totAss > 0 || r.frais > 0)) sec.push({ libelle: 'TEG', valeur: Math.round(r.teg * 1000) / 1000, unite: '%' });
      sec.push({ libelle: 'Échéances', valeur: r.n || 0, unite: '' });
      return {
        principal: { libelle: periode.charAt(0).toUpperCase() + periode.slice(1), valeur: Math.round((r.M1 || 0) * 1000) / 1000, unite: 'DT' },
        secondaires: sec,
        ligne: (nomType(e.type) || 'Crédit') + ' · ' + Math.round(e.capital) + ' DT · ' + Math.round(e.mois / 12 * 10) / 10 + ' ans'
      };
    },
    nomParDefaut: function () {
      var sc = scenarios[actif], e = sc && sc.entrees;
      if (!e) return 'Crédit';
      var ans = e.mois % 12 === 0 ? (e.mois / 12) + ' ans' : e.mois + ' mois';
      return (nomType(e.type) && e.type !== 'libre' ? nomType(e.type) : 'Crédit') + ' ' + fmtEspace(e.capital) + ' DT · ' + ans + ' · ' + String(e.taux).replace('.', ',') + ' %';
    }
  };
  function fmtEspace(v) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v).replace(/\u202f/g, '\u00a0'); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
