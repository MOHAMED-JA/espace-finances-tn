/* Interface : lecture des saisies, affichage des résultats, projection, rachat, prévoyance,
   partage par lien, portefeuille du conseiller, comparateur, exports et langue.
   Les calculs sont dans les modules purs (moteur-fiscal, projection, scenario, rachat, prevoyance) testés sous Node. */
(function () {
  'use strict';

  var Moteur = window.MoteurFiscal;
  var Baremes = window.Baremes;
  var Graph = window.Graphiques;
  var Saisie = window.Saisie;
  var Scenario = window.Scenario;
  var Rachat = window.Rachat;
  var Prev = window.Prevoyance;
  var Partage = window.Partage;
  var XL = window.ExportTableur;
  var Port = window.Portefeuille;
  var I18n = window.I18n;
  var Conseil = window.Conseil;
  var MonteCarlo = window.MonteCarlo;
  var Strategie = window.Strategie;
  var Contrats = window.Contrats;
  var Calendrier = window.Calendrier;
  var Theme = window.Theme;
  var t = I18n.t;

  var FACTEURS = Moteur.FACTEURS;
  var PERIODES = { Mensuel: 'par mois', Trimestriel: 'par trimestre', Semestriel: 'par semestre', Annuel: 'par an' };
  var NOMS_SCEN = { prudent: 'Prudent', median: 'Médian', dynamique: 'Dynamique' };

  /* ===================================================================
     Formatage (montants au format tunisien : espace des milliers, virgule, 3 décimales)
     =================================================================== */
  var mouvementReduit = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var nfLibre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
  var nfEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /* Espaces fines insécables remplacées par des espaces insécables (rendu homogène des polices) */
  function esp(s) { return s.replace(/[  ]/g, ' '); }
  function fmtAmount(v) {
    var s = (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3);
    var neg = s.charAt(0) === '-';
    var p = (neg ? s.slice(1) : s).split('.');
    return (neg ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + p[1];
  }
  function fmtTND(v) { return fmtAmount(v) + ' TND'; }
  function fmtHtml(v) { return fmtAmount(v) + '<span class="unit" translate="no">TND</span>'; }
  function fmtEntier(v) { return esp(nfEntier.format(Math.floor(v))); }
  function fmtPct(v) { return esp(nf1.format(v)) + ' %'; }
  function fmtSigne(v) { return (v >= 0.0005 ? '+' : '') + fmtTND(v); }
  function fmtLibre(v) { return esp(nfLibre.format(v)); }

  function $(id) { return document.getElementById(id); }
  function lire(id) { return Saisie.lireNombre($(id).value); }
  function nombre(id) { return lire(id).v; }

  /* Montants isolés de gauche à droite dans un texte déjà échappé (lecture correcte en arabe) */
  function bidi(html) {
    /* Les entités (&#39; …) sont laissées intactes */
    return html.replace(/&nbsp;/g, '\u00a0').split(/(&#?\w+;)/).map(function (morceau) {
      if (/^&#?\w+;$/.test(morceau)) return morceau;
      return morceau.replace(/[+\u2212-]?\d[\d\s\u00a0\u202f,.]*(?:\s?(?:→|%)\s?\d[\d\s\u00a0\u202f,.]*)?(?:\s?(?:TND|%))?/g, function (m) {
        var fin = m.match(/\s+$/);
        return '<bdi dir="ltr">' + m.trim() + '</bdi>' + (fin ? fin[0] : '');
      });
    }).join('');
  }
  function echapper(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function animer(el, vers, rendu) {
    var de = parseFloat(el.dataset.val);
    el.dataset.val = vers;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (mouvementReduit.matches || document.hidden || !isFinite(de) || de === vers) { el.innerHTML = rendu(vers); return; }
    var t0 = performance.now(), duree = 520;
    function pas(tps) {
      var p = Math.min(1, (tps - t0) / duree);
      var e = 1 - Math.pow(1 - p, 3);
      el.innerHTML = rendu(p < 1 ? de + (vers - de) * e : vers);
      if (p < 1) el._raf = requestAnimationFrame(pas);
    }
    el._raf = requestAnimationFrame(pas);
  }

  /* action = { libelle, executer } : bouton dans le message (annulation), affiché plus longtemps */
  function toast(message, type, action) {
    var zone = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'erreur' ? ' toast-erreur' : '') + (action ? ' toast-action' : '');
    el.innerHTML = '<span class="t-ico" aria-hidden="true"><svg class="ico"><use href="#' + (type === 'erreur' ? 'i-alert' : 'i-check') + '"/></svg></span><span class="t-msg"></span>';
    el.querySelector('.t-msg').textContent = message;
    var fini = false;
    function fermer() {
      if (fini) return;
      fini = true;
      el.classList.add('sortie');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }
    if (action) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 't-action';
      b.textContent = action.libelle;
      b.addEventListener('click', function () { fermer(); action.executer(); });
      el.appendChild(b);
    }
    zone.appendChild(el);
    while (zone.children.length > 2) zone.removeChild(zone.firstChild);
    vibrer(type === 'erreur' ? [20, 60, 20] : 10);
    setTimeout(fermer, action ? 6000 : 3200);
  }

  function telecharger(nom, contenu, type) {
    var blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* Retour haptique léger sur téléphone (sans effet ailleurs ni si les animations sont réduites) */
  function vibrer(motif) {
    try {
      if (navigator.vibrate && !mouvementReduit.matches && window.matchMedia && matchMedia('(pointer: coarse)').matches) navigator.vibrate(motif || 10);
    } catch (e) {}
  }

  function dateIso() { return new Date().toISOString().slice(0, 10); }

  /* ===================================================================
     État de l'interface
     =================================================================== */
  var ui = { produitRachat: 'av', chef: false, frequence: 'Mensuel', annee: Baremes.parDefaut, calc: null, rachat: null, prevoyance: null, inverse: null, portefeuille: [], selection: [] };
  var champsEntiers = ['children', 'disabled-children', 'students', 'parents'];
  var champsHypotheses = ['p-duree', 'p-rendement', 'p-garanti', 'p-frais', 'p-frais-entree', 'p-rend-cea', 'p-frais-cea', 'p-ecart-cea', 'p-compar', 'p-ecart', 'p-croissance', 'p-inflation', 'p-impot-interets', 'p-retrait-debut', 'p-retrait-montant'];
  var champsMontants = ['av-initial', 'cea-period', 'cea-initial'];
  var depot = null;

  function lireEntier(id) {
    var el = $(id);
    var max = id === 'parents' ? 2 : 99;
    var n = parseInt(String(el.value).replace(/\D/g, ''), 10);
    if (!isFinite(n) || n < 0) n = 0;
    return Math.min(n, max);
  }

  /* État de saisie complet (format de Scenario.defauts) */
  /* Montant facultatif : vide = 0 ; une saisie invalide compte pour 0 (le champ est signalé) */
  function montant(id) { var r = lire(id); return isFinite(r.v) ? r.v : 0; }

  /* Versements libres saisis (lignes complètes seulement) */
  function lireLibres() {
    return Array.prototype.map.call($('libres-liste').querySelectorAll('.libre-ligne'), function (l) {
      var a = Saisie.lireNombre(l.querySelector('.libre-annee').value);
      var m = Saisie.lireNombre(l.querySelector('.libre-montant').value);
      if (a.vide && m.vide) return null;
      return { annee: a.vide ? NaN : a.v, montant: m.vide ? NaN : m.v };
    }).filter(Boolean);
  }

  function ajouterLibre(l) {
    var liste = $('libres-liste');
    if (liste.children.length >= 10) return;
    var d = document.createElement('div');
    d.className = 'libre-ligne';
    d.innerHTML = '<div class="input-wrap"><input class="libre-annee" type="text" inputmode="numeric" autocomplete="off"><span class="suffix"></span></div>' +
      '<div class="input-wrap"><input class="libre-montant" type="text" inputmode="decimal" autocomplete="off"><span class="suffix">TND</span></div>' +
      '<button type="button" class="btn btn-ghost btn-sm btn-icon libre-suppr"><svg class="ico ico-sm"><use href="#i-trash"/></svg></button>';
    d.querySelector('.libre-annee').placeholder = t('Année');
    d.querySelector('.libre-annee').setAttribute('aria-label', t('Année du versement libre'));
    d.querySelector('.libre-annee').nextSibling.textContent = t('an');
    d.querySelector('.libre-montant').placeholder = t('Montant');
    d.querySelector('.libre-montant').setAttribute('aria-label', t('Montant du versement libre'));
    d.querySelector('.libre-suppr').setAttribute('aria-label', t('Retirer ce versement libre'));
    d.querySelector('.libre-suppr').title = t('Retirer ce versement libre');
    if (l) { d.querySelector('.libre-annee').value = String(l.annee); d.querySelector('.libre-montant').value = fmtLibre(l.montant); }
    liste.appendChild(d);
    $('libre-ajouter').disabled = liste.children.length >= 10;
    return d;
  }

  /* État de saisie complet (format de Scenario.defauts) */
  function lireEtat() {
    var rev = lire('revenue'), per = lire('investment-amount-period');
    var rd = lire('p-retrait-debut'), rm = lire('p-retrait-montant');
    return {
      annee: ui.annee,
      revenu: isFinite(rev.v) ? rev.v : 0,
      chef: ui.chef,
      enfants: lireEntier('children'), infirmes: lireEntier('disabled-children'),
      etudiants: lireEntier('students'), parents: lireEntier('parents'),
      frequence: ui.frequence,
      versement: isFinite(per.v) ? per.v : 0,
      initialAv: montant('av-initial'),
      versementCea: montant('cea-period'),
      initialCea: montant('cea-initial'),
      dureeAns: nombre('p-duree'), rendementPct: nombre('p-rendement'), tauxGarantiPct: lire('p-garanti').vide ? 0 : nombre('p-garanti'),
      fraisPct: nombre('p-frais'), fraisEntreePct: lire('p-frais-entree').vide ? 0 : nombre('p-frais-entree'),
      rendementCeaPct: nombre('p-rend-cea'), fraisCeaPct: lire('p-frais-cea').vide ? 0 : nombre('p-frais-cea'), ecartCeaPct: nombre('p-ecart-cea'),
      comparPct: nombre('p-compar'), reinvestir: $('p-reinvest').checked,
      ecartPct: nombre('p-ecart'), croissancePct: nombre('p-croissance'), inflationPct: nombre('p-inflation'),
      impotInteretsPct: nombre('p-impot-interets'),
      libres: lireLibres(),
      retraitDebut: rd.vide ? 0 : rd.v, retraitMontant: rm.vide ? 0 : rm.v,
      ageActuel: ui.retraite ? ui.retraite.age : 0, ageDepart: ui.retraite ? ui.retraite.depart : 0
    };
  }
  /* Recharge un état (lien de partage, portefeuille) dans le formulaire */
  function appliquerEtat(partiel) {
    var e = Object.assign(Scenario.defauts(), partiel || {});
    if (Baremes.annees[e.annee]) { ui.annee = e.annee; $('annee-bareme').value = e.annee; majBareme(); }
    function mt(id, v) { $(id).value = v > 0 ? fmtLibre(v) : ''; }
    function pct(id, v) { $(id).value = fmtLibre(v); }
    $('revenue').value = e.revenu > 0 ? fmtLibre(e.revenu) : '';
    mt('investment-amount-period', e.versement);
    mt('av-initial', e.initialAv);
    mt('cea-period', e.versementCea);
    mt('cea-initial', e.initialCea);
    $('children').value = String(e.enfants);
    $('disabled-children').value = String(e.infirmes);
    $('students').value = String(e.etudiants);
    $('parents').value = String(e.parents);
    selectionnerSegment('chef', e.chef ? '1' : '0');
    selectionnerSegment('frequence', e.frequence);
    ui.chef = !!e.chef;
    ui.frequence = e.frequence;
    $('p-duree').value = String(e.dureeAns);
    pct('p-rendement', e.rendementPct);
    pct('p-garanti', e.tauxGarantiPct);
    pct('p-frais', e.fraisPct);
    pct('p-frais-entree', e.fraisEntreePct);
    pct('p-rend-cea', e.rendementCeaPct);
    pct('p-frais-cea', e.fraisCeaPct);
    pct('p-ecart-cea', e.ecartCeaPct);
    pct('p-compar', e.comparPct);
    pct('p-ecart', e.ecartPct);
    pct('p-croissance', e.croissancePct);
    pct('p-inflation', e.inflationPct);
    pct('p-impot-interets', e.impotInteretsPct);
    $('p-reinvest').checked = !!e.reinvestir;
    $('libres-liste').innerHTML = '';
    (e.libres || []).forEach(function (l) { ajouterLibre(l); });
    $('libre-ajouter').disabled = false;
    $('p-retrait-debut').value = e.retraitMontant > 0 ? String(e.retraitDebut) : '';
    mt('p-retrait-montant', e.retraitMontant);
    var retraite = e.ageActuel > 0 && e.ageDepart > 0;
    $('p-retraite').checked = retraite;
    $('p-age').value = retraite ? String(e.ageActuel) : '';
    $('p-depart').value = String(retraite ? e.ageDepart : 60);
    synchroniserSupport();
    if (e.croissancePct > 0 || e.inflationPct > 0 || e.ecartPct !== 2 || e.impotInteretsPct !== 20 || (e.libres || []).length || e.retraitMontant > 0) $('p-avance').open = true;
    majCurseur();
    majSteppers();
    calculateAndDisplay();
  }
  function majCurseur() {
    var r = $('revenue-r');
    var v = lire('revenue').v;
    if (!isFinite(v)) v = 0;
    var borne = Math.min(+r.max, Math.max(0, v));
    r.value = borne;
    r.style.setProperty('--pct', (borne / +r.max * 100) + '%');
  }

  function majSteppers() {
    champsEntiers.forEach(function (id) {
      var n = lireEntier(id);
      var st = document.querySelector('.stepper[data-for="' + id + '"]');
      var max = +(st.dataset.max || 99);
      st.querySelector('[data-pas="-1"]').disabled = n <= 0;
      st.querySelector('[data-pas="1"]').disabled = n >= max;
    });
  }

  function libelleBareme() {
    var r = Baremes.annees[ui.annee];
    return t(r.libelle);
  }

  function majBareme() {
    var r = Baremes.annees[ui.annee];
    $('badge-bareme').textContent = t('Barème : {0}', [libelleBareme()]);
    $('badge-bareme').parentNode.classList.toggle('provisoire', !!r.provisoire);
    $('remarque-bareme').textContent = t('Ce tableau applique le barème suivant : {0}.', [libelleBareme()]) + ' ' + t(r.source);
  }

  /* ===================================================================
     Calcul et affichage
     =================================================================== */
  function afficherAmbiguite(idChamp, lecture, idMsg) {
    var el = $(idMsg);
    if (!lecture.ambigu) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<svg class="ico ico-sm"><use href="#i-alert"/></svg><span></span> <button type="button" class="lien-btn"></button>';
    el.children[1].textContent = t('« {0} » est lu comme {1}. Vouliez-vous saisir {2} ?', [$(idChamp).value.trim(), fmtLibre(lecture.v) + '\u00a0TND', fmtLibre(lecture.alternative) + '\u00a0TND']);
    var b = el.children[2];
    b.textContent = t('Corriger en {0}', [fmtEntier(lecture.alternative)]);
    b.addEventListener('click', function () {
      $(idChamp).value = fmtLibre(lecture.alternative);
      if (idChamp === 'revenue') majCurseur();
      calculateAndDisplay();
      $(idChamp).focus();
    });
  }

  function calculateAndDisplay() {
    var rev = lire('revenue');
    var per = lire('investment-amount-period');

    $('f-revenue').classList.toggle('invalide', !isFinite(rev.v));
    $('revenue-err').textContent = isFinite(rev.v) ? '' : t('Saisissez un montant valide (ex. 45 000).');
    $('f-period').classList.toggle('invalide', !isFinite(per.v));
    $('period-err').textContent = isFinite(per.v) ? '' : t('Saisissez un montant valide (ex. 500).');
    var montantsKo = false;
    champsMontants.forEach(function (id) {
      var ko = !isFinite(lire(id).v);
      $(id).closest('.field').classList.toggle('invalide', ko);
      montantsKo = montantsKo || ko;
    });
    $('montants-err').textContent = montantsKo ? t('Saisissez un montant valide (ex. 500).') : '';
    afficherAmbiguite('revenue', rev, 'revenue-amb');
    afficherAmbiguite('investment-amount-period', per, 'period-amb');
    afficherAmbiguite('cea-period', lire('cea-period'), 'cea-amb');
    majRetraite();

    var etat = lireEtat();
    var calc = Scenario.calculer(etat);
    ui.calc = calc;
    noterHistorique();
    var sim = calc.sim;
    var factor = calc.facteur;

    $('lbl-period').textContent = t('Versement assurance vie {0}', [t(PERIODES[ui.frequence])]);
    $('lbl-cea').textContent = t('Versement CEA {0}', [t(PERIODES[ui.frequence])]);
    $('total-formule').textContent = t('Assurance vie {0} · CEA {1}', [fmtTND(calc.investissementAv), fmtTND(calc.investissementCea)]);
    animer($('investment-amount-total'), calc.investissement, fmtHtml);

    majPlafonds(sim);
    majSuggestion(sim, calc);
    majInverse(sim);

    var aDesResultats = etat.revenu > 0;
    var etaitCache = $('resultats').hidden;
    $('vide').hidden = aDesResultats;
    $('resultats').hidden = !aDesResultats;
    majRappel();
    majEtSi(calc);
    if (!aDesResultats) {
      $('resume-vocal').textContent = '';
      $('panneau-partage').hidden = true;
      ui.mc = null;
      return;
    }

    if (etaitCache) ['tax-saved', 'tax-reduction-rate'].forEach(function (id) { delete $(id).dataset.val; });

    afficherIndicateurs(sim);
    afficherDeductions(sim, etat);
    afficherTranches(sim);
    afficherCourbeEconomie(sim, sim.investissementAv);
    majProjection(calc);
    majObjectif(calc);
    majRachat();
    majPrevoyance();
    majStrategie(calc);
    majContrats(calc);
    majStress(calc);
    majCouple();
    majObjectifs();
    planifierMonteCarlo(calc);
    if (etaitCache) ['graph-economie', 'graph-capital'].forEach(function (id) { animerTrace($(id)); });
    if (!$('panneau-partage').hidden) majPartage();

    planifierNav();
    $('resume-vocal').textContent = t('Économie d\'impôt de {0} par an, soit {1} de réduction. Montant optimal en assurance vie : {2}.', [fmtTND(sim.economie), fmtPct(sim.tauxReduction), fmtTND(sim.optimal)]);
  }

  /* Montants au-delà des plafonds de déduction */
  function majPlafonds(sim) {
    var msg = [];
    if (sim.horsPlafondAv > 0) msg.push(t('Assurance vie : {0} au-delà du plafond de {1} par an, non déductible.', [fmtTND(sim.horsPlafondAv), fmtTND(sim.produits.av.plafond)]));
    if (sim.horsPlafondCea > 0) msg.push(t('CEA : {0} au-delà du plafond de {1} par an, non déductible.', [fmtTND(sim.horsPlafondCea), fmtTND(sim.produits.cea.plafond)]));
    $('alerte-plafond').hidden = !msg.length;
    $('alerte-plafond-texte').textContent = msg.join(' ');
  }
  function afficherIndicateurs(sim) {
    animer($('tax-saved'), sim.economie, fmtHtml);
    celebrerPlancher(sim);
    $('tax-saved-monthly').textContent = fmtTND(sim.economie / 12);
    var deux = sim.economieAv > 0.0005 && sim.economieCea > 0.0005;
    $('repartition-economie').hidden = !deux;
    if (deux) $('repartition-economie').textContent = t('dont assurance vie {0} · CEA {1}', [fmtTND(sim.economieAv), fmtTND(sim.economieCea)]);
    animer($('tax-reduction-rate'), sim.tauxReduction, function (v) { return v.toFixed(1).replace('.', ',') + '<span class="unit">%</span>'; });
    var circ = 263.894;
    $('gauge-fg').style.strokeDashoffset = String(circ * (1 - Math.min(sim.tauxReduction, 55) / 55));
    $('gauge-txt').innerHTML = sim.tauxReduction >= 54.95 ? t('plafond<br>atteint') : esp(nf1.format(55 - sim.tauxReduction)) + ' %<br>' + t('restants');

    $('tax-before').innerHTML = fmtHtml(sim.impotAvant);
    $('tax-after').innerHTML = fmtHtml(sim.impotApres);
    $('min-tax').innerHTML = fmtHtml(sim.impotMinimum);
    $('eco-av').innerHTML = fmtHtml(sim.economieAv);
    $('eco-cea').innerHTML = fmtHtml(sim.economieCea);
    $('optimal-investment').innerHTML = fmtHtml(sim.optimal);
    var ref = sim.impotAvant > 0 ? sim.impotAvant : 1;
    $('bar-avant').style.width = (sim.impotAvant > 0 ? 100 : 0) + '%';
    $('bar-apres').style.width = (sim.impotApres / ref * 100) + '%';
    $('bar-floor').style.insetInlineStart = (sim.impotAvant > 0 ? 45 : 0) + '%';
    $('bar-floor').style.display = sim.impotAvant > 0 ? '' : 'none';
    $('bar-floor').dataset.lib = t('plancher 45 %');
  }
  function lignesDeductions(sim, entree) {
    var det = sim.deductionsDetail;
    var d = sim.regles.deductions;
    function nb(n) { return n ? ' (' + n + ')' : ''; }
    return [
      [t('Revenu brut annuel imposable'), sim.revenu, ''],
      [t('Frais professionnels ({0} %, {1} max.)', [Math.round(d.fraisProfessionnelsTaux * 100), fmtEntier(d.fraisProfessionnelsMax)]), det.fraisProfessionnels, 'moins sous'],
      [t('Chef de famille'), det.chefDeFamille, 'moins sous'],
      [t('Enfants à charge') + nb(entree.enfants), det.enfants, 'moins sous'],
      [t('Enfants infirmes') + nb(entree.infirmes), det.enfantsInfirmes, 'moins sous'],
      [t('Étudiants sans bourse') + nb(entree.etudiants), det.etudiants, 'moins sous'],
      [t('Parents à charge') + nb(entree.parents), det.parents, 'moins sous'],
      [t('Revenu net imposable'), sim.revenuNet, 'total'],
      [t('Assurance vie déduite'), Math.min(sim.deductionAv, sim.revenuNet), 'moins inv'],
      [t('CEA déduit'), Math.min(sim.deductionCea, Math.max(0, sim.revenuNet - sim.deductionAv)), 'moins inv'],
      [t('Revenu net après investissement'), sim.revenuNetApres, 'total']
    ];
  }

  function afficherDeductions(sim, entree) {
    $('deductions').innerHTML = lignesDeductions(sim, entree).map(function (l) {
      var moins = l[2].indexOf('moins') !== -1;
      var nul = moins && l[1] === 0 ? ' nul' : '';
      return '<div class="ded-row ' + l[2] + nul + '"><span>' + echapper(l[0]) + '</span><span class="v">' + (moins && l[1] > 0 ? '− ' : '') + fmtTND(l[1]) + '</span></div>';
    }).join('');
  }

  function afficherTranches(sim) {
    var couleurs = ['#64748b', '#0ea5e9', '#6A55E0', '#8b5cf6', '#7A66E8', '#d946ef', '#7A66E8', '#f43f5e'];
    var totAv = 0, totAp = 0;
    $('tax-brackets-comparison').innerHTML = sim.avant.parTranche.map(function (bd, i) {
      var ad = sim.apres.parTranche[i] || { impot: 0 };
      var savings = bd.impot - ad.impot;
      totAv += bd.impot; totAp += ad.impot;
      var actif = bd.impot > 0 || ad.impot > 0 || bd.montant > 0;
      var debut = bd.min > 0 ? bd.min + 1 : 0;
      var maxAff = bd.max === Infinity ? '∞' : fmtEntier(bd.max);
      return '<tr' + (actif ? '' : ' class="inactive"') + '><td>' + fmtEntier(debut) + ' – ' + maxAff + '</td>' +
        '<td><span class="rate" style="background:' + couleurs[i % couleurs.length] + '">' + (bd.taux * 100).toFixed(0) + ' %</span></td>' +
        '<td>' + fmtAmount(bd.impot) + '</td><td>' + fmtAmount(ad.impot) + '</td>' +
        '<td' + (savings > 0.0005 ? ' class="eco"' : '') + '>' + fmtAmount(savings) + '</td></tr>';
    }).join('');
    $('tranches-total').innerHTML = '<tr><td>' + t('Total') + '</td><td></td><td>' + fmtAmount(totAv) + '</td><td>' + fmtAmount(totAp) + '</td><td class="eco">' + fmtAmount(totAv - totAp) + '</td></tr>';
  }

  function pointsEconomie(sim, investissement) {
    var xMax = Math.max(sim.optimal * 1.5, investissement * 1.15, 100);
    var points = [];
    for (var i = 0; i <= 40; i++) {
      var x = xMax * i / 40;
      points.push([x, Moteur.economiePourInvestissement(sim, x)]);
    }
    return points;
  }

  function afficherCourbeEconomie(sim, investissement) {
    morpher($('graph-economie'), Graph.courbeEconomie({
      points: pointsEconomie(sim, investissement), optimal: sim.optimal, courant: investissement,
      economieCourante: Moteur.economiePourInvestissement(sim, investissement)
    }, {
      aria: t('Courbe de l\'économie d\'impôt selon le montant investi en assurance vie par an'),
      x: t('Assurance vie investie par an (TND)'),
      optimal: t('Optimal')
    }));
  }

  /* ===================================================================
     Suggestion optimale et mode inverse
     =================================================================== */
  function majSuggestion(sim, calc) {
    var optimal = sim.optimal, investment = sim.investissementAv, factor = calc.facteur;
    var box = $('suggest');
    var rec = $('optimal-recommendation');
    var etatEl = $('suggest-state');
    var btn = $('appliquer');
    var alerte = $('alerte-plancher');
    $('suggest-texte').textContent = sim.investissementCea > 0
      ? t('Avec votre CEA de {0}, investissez ce montant par an en assurance vie pour atteindre le plancher légal (45 %).', [fmtTND(sim.investissementCea)])
      : t('Investissez ce montant par an en assurance vie pour réduire votre impôt au plancher légal (45 %).');
    $('suggest-cea').textContent = sim.impotAvant > 0
      ? t('Le CEA seul réduit l\'impôt de 40 % au plus (impôt minimum 60 %) : au-delà de {0} par an sur le CEA, un dépôt de plus ne réduit plus l\'impôt.', [fmtTND(sim.ceaUtile)])
      : '';
    /* Part fixe de l'assurance vie la 1re année (versement initial et libres) */
    var fixe = Math.max(0, investment - calc.etat.versement * factor);
    if (optimal > 0) {
      box.classList.remove('vide');
      rec.innerHTML = fmtHtml(optimal);
      var periode = Math.max(0, Math.ceil((optimal - fixe) / factor * 1000 - 1e-7) / 1000);
      box.dataset.periode = periode;
      btn.hidden = false;
      var atteint = investment >= optimal - 0.0005;
      etatEl.hidden = !atteint;
      etatEl.innerHTML = '<svg class="ico ico-sm"><use href="#i-check"/></svg>' + t('Plancher atteint');
      btn.disabled = Math.abs(calc.etat.versement - periode) < 0.0005;
      if (investment > optimal + 0.0005 * factor + 1e-9 && optimal < sim.produits.av.plafond) {
        alerte.hidden = false;
        $('alerte-texte').textContent = t('Au-delà de {0} par an, l\'investissement supplémentaire ({1}) ne réduit plus votre impôt : le plancher de 45 % est déjà atteint.', [fmtTND(optimal), fmtTND(investment - optimal)]);
      } else {
        alerte.hidden = true;
      }
    } else {
      box.classList.add('vide');
      rec.textContent = '—';
      btn.hidden = true;
      etatEl.hidden = true;
      alerte.hidden = true;
      box.dataset.periode = 0;
    }
  }
  function majInverse(sim) {
    var r = lire('inv-cible');
    var res = $('inv-res');
    var btn = $('inv-appliquer');
    btn.hidden = true;
    ui.inverse = null;
    $('bloc-inverse').classList.remove('ok', 'ko');
    if (r.vide) { res.textContent = t('Indiquez l\'économie souhaitée : le simulateur calcule le montant à verser en assurance vie, en plus de votre CEA.'); return; }
    if (!isFinite(r.v)) { res.textContent = t('Saisissez un montant valide (ex. 500).'); $('bloc-inverse').classList.add('ko'); return; }
    if (!(sim.revenu > 0)) { res.textContent = t('Saisissez d\'abord votre revenu brut annuel imposable.'); return; }
    var inv = Moteur.investissementPourEconomie(sim, r.v);
    if (!inv.possible) {
      $('bloc-inverse').classList.add('ko');
      res.textContent = inv.economieMax > 0.0005
        ? t('Objectif impossible : l\'économie maximale est de {0} par an (plancher légal de 45 %).', [fmtTND(inv.economieMax)])
        : t('Aucune économie possible : votre impôt est déjà nul.');
      return;
    }
    var f = FACTEURS[ui.frequence];
    var fixe = Math.max(0, sim.investissementAv - (ui.calc ? ui.calc.etat.versement * f : 0));
    var periode = Math.max(0, Math.ceil((inv.investissementAnnuel - fixe) / f * 1000 - 1e-7) / 1000);
    $('bloc-inverse').classList.add('ok');
    res.textContent = t('Versez {0} par an en assurance vie, soit {1} {2}.', [fmtTND(inv.investissementAnnuel), fmtTND(periode), t(PERIODES[ui.frequence])]);
    ui.inverse = periode;
    btn.hidden = !(periode > 0);
  }
  /* ===================================================================
     Projection du capital
     =================================================================== */
  function messageErreur(err) {
    switch (err.code) {
      case 'duree': return t('La durée doit être un nombre entier d\'années entre 1 et {0}.', [err.max]);
      case 'rendement': return t('Le rendement annuel doit être compris entre 0 et 50 %.');
      case 'garanti': return t('Le taux garanti doit être compris entre 0 et 20 % et ne pas dépasser le taux servi.');
      case 'frais': return t('Les frais de gestion doivent être compris entre 0 et 20 %.');
      case 'fraisEntree': return t('Les frais sur versement doivent être compris entre 0 et 10 %.');
      case 'rendementCea': return t('Le rendement du CEA doit être compris entre 0 et 50 %.');
      case 'fraisCea': return t('Les frais du CEA doivent être compris entre 0 et 10 %.');
      case 'ecartCea': return t('L\'écart entre scénarios du CEA doit être compris entre 0 et 30 points.');
      case 'compar': return t('Le taux du placement classique doit être compris entre 0 et 50 %.');
      case 'ecart': return t('L\'écart entre scénarios doit être compris entre 0 et 20 points.');
      case 'croissance': return t('La hausse annuelle doit être comprise entre 0 et 20 %.');
      case 'inflation': return t('L\'inflation doit être comprise entre 0 et 30 %.');
      case 'impotInterets': return t('L\'impôt sur les intérêts doit être compris entre 0 et 50 %.');
      case 'libres': return t('Chaque versement libre doit avoir une année entière entre 1 et {0} et un montant positif.', [err.max]);
      case 'retraitDebut': return t('L\'année de début des retraits doit être un nombre entier entre 1 et {0}.', [err.max]);
      case 'retraitTot': return t('Les retraits programmés doivent commencer au plus tôt l\'année {0} (durée minimale de l\'assurance vie).', [err.min]);
      default: return t('Saisissez un montant valide (ex. 500).');
    }
  }
  function ligne(libelle, valeur, classe) {
    return '<div class="tax-row' + (classe ? ' ' + classe : '') + '"><span class="l">' + echapper(libelle) + '</span><span class="v">' + valeur + '</span></div>';
  }

  /* Lignes de la projection : [libellé, valeur, classe] (réutilisées par le PDF) */
  /* Lignes de la projection : [libellé, valeur, classe] (réutilisées par le PDF) */
  function lignesProjection(calc) {
    var e = calc.etat, med = calc.med;
    var l = [
      [t('Total versé sur {0} an(s)', [e.dureeAns]), fmtTND(med.totalVerse)],
      [t('Capital au terme (scénario médian)'), fmtTND(med.capitalFinal)]
    ];
    if (calc.aAv && calc.aCea) {
      l.push([t('dont assurance vie'), fmtTND(calc.medAv.capitalFinal)], [t('dont CEA'), fmtTND(calc.medCea.capitalFinal)]);
    }
    if (med.totalRetire > 0) l.push([t('Retraits programmés perçus'), fmtTND(med.totalRetire)]);
    if (e.inflationPct > 0) l.push([t('Capital au terme en dinars constants (inflation {0})', [fmtPct(e.inflationPct)]), fmtTND(med.capitalFinalReel)]);
    if (e.croissancePct > 0) l.push([t('Versement de la dernière année (hausse de {0} par an)', [fmtPct(e.croissancePct)]), fmtTND(med.flux[med.flux.length - 1].versement * calc.facteur)]);
    l.push(
      [t('Gain financier'), fmtTND(med.gain)],
      [t('Économie d\'impôt cumulée') + (e.reinvestir ? ' ' + t('(réinvestie)') : ''), fmtTND(med.economieCumulee)],
      [t('Valeur totale (capital + économie d\'impôt)'), fmtTND(calc.valeurTotale), 'fort'],
      [t('Rendement annuel effectif, économie d\'impôt comprise'), calc.effectif === null ? '—' : fmtPct(calc.effectif)],
      [t('Placement classique à {0} (mêmes versements)', [fmtPct(e.comparPct)]), fmtTND(calc.classique)],
      [t('Placement classique après impôt sur les intérêts ({0})', [fmtPct(calc.impotInteretsPct)]), fmtTND(calc.classiqueNet)],
      [t('Avantage sur le placement classique'), fmtSigne(calc.avantage), calc.avantage >= 0 ? 'fort' : '']
    );
    return l;
  }
  /* Libellé des taux d'un scénario (assurance vie et/ou CEA) */
  function libelleTaux(calc, k) {
    var p = [];
    if (calc.aAv) p.push((calc.aCea ? t('AV') + ' ' : '') + fmtPct(calc.taux.av[k]));
    if (calc.aCea) p.push((calc.aAv ? t('CEA') + ' ' : '') + fmtPct(calc.taux.cea[k]));
    return p.join(' · ');
  }
  function majProjection(calc) {
    var err = calc.erreur;
    $('proj-err').textContent = err ? messageErreur(err) : '';
    champsHypotheses.forEach(function (id) { $(id).closest('.field').classList.remove('invalide'); });
    if (err) {
      var id = { duree: 'p-duree', rendement: 'p-rendement', 'garanti': 'p-garanti', frais: 'p-frais', fraisEntree: 'p-frais-entree', rendementCea: 'p-rend-cea', fraisCea: 'p-frais-cea', ecartCea: 'p-ecart-cea', compar: 'p-compar', ecart: 'p-ecart', croissance: 'p-croissance', inflation: 'p-inflation', impotInterets: 'p-impot-interets', retraitDebut: 'p-retrait-debut', retraitTot: 'p-retrait-debut' }[err.code];
      if (id) $(id).closest('.field').classList.add('invalide');
      if (['p-ecart', 'p-croissance', 'p-inflation', 'p-impot-interets', 'p-retrait-debut'].indexOf(id) !== -1 || err.code === 'libres') $('p-avance').open = true;
    }
    var actif = calc.actif;
    $('proj-vide').hidden = actif || !!err;
    $('proj-resultat').hidden = !actif;
    $('carte-rachat').hidden = !actif;
    $('carte-prevoyance').hidden = !actif || !calc.aAv;
    $('carte-mc').hidden = !actif;
    $('carte-stress').hidden = !actif;
    $('carte-strategie').hidden = !actif;
    $('carte-contrats').hidden = !actif || !calc.aAv;
    if (!actif) return;

    var sc = calc.sc;
    ['prudent', 'median', 'dynamique'].forEach(function (k) {
      $('scen-l-' + k).textContent = t(NOMS_SCEN[k]) + ' · ' + libelleTaux(calc, k);
      $('scen-' + k).textContent = fmtTND(sc[k].capitalFinal);
    });
    var e = calc.etat;
    $('p-participation').textContent = e.tauxGarantiPct > 0
      ? t('Dont taux garanti {0} et participation aux bénéfices estimée {1}. Le scénario prudent ne descend pas sous le taux garanti.', [fmtPct(e.tauxGarantiPct), fmtPct(Math.max(0, e.rendementPct - e.tauxGarantiPct))])
      : t('Indiquez le taux minimum garanti du contrat : le scénario prudent ne descendra pas en dessous.');
    var reel = calc.etat.inflationPct > 0;
    morpher($('graph-capital'), Graph.courbeCapital(sc, { aria: t('Capital constitué par année selon trois scénarios de rendement'), x: t('Années') }, reel));
    $('leg-reel').hidden = !reel;
    majCurseurAnnee(calc);
    $('proj-lignes').innerHTML = lignesProjection(calc).map(function (l) { return ligne(l[0], l[1], l[2]); }).join('');
    afficherComparatif(calc);
  }

  /* Comparatif des placements au terme (barres horizontales) */
  function elementsComparatif(calc) {
    var e = calc.etat;
    return [
      [t('Assurance vie et CEA : capital + économie d\'impôt'), calc.valeurTotale, 'c1'],
      [t('Placement classique à {0}, avant impôt', [fmtPct(e.comparPct)]), calc.classique, 'c2'],
      [t('Placement classique à {0}, après impôt sur les intérêts ({1})', [fmtPct(e.comparPct), fmtPct(calc.impotInteretsPct)]), calc.classiqueNet, 'c3'],
      [t('Versements cumulés'), calc.med.totalVerse, 'c4']
    ];
  }

  function afficherComparatif(calc) {
    var el = elementsComparatif(calc);
    var max = Math.max.apply(null, el.map(function (x) { return x[1]; })) || 1;
    $('comparatif-barres').innerHTML = el.map(function (x) {
      return '<div class="cmp-ligne"><span class="cmp-lib">' + echapper(x[0]) + '</span>' +
        '<span class="cmp-trk"><span class="cmp-fill ' + x[2] + '" style="width:' + (Math.max(0, x[1]) / max * 100).toFixed(2) + '%"></span></span>' +
        '<b class="cmp-val">' + fmtTND(x[1]) + '</b></div>';
    }).join('');
  }

  /* ===================================================================
     Mode retraite et objectif de capital
     =================================================================== */
  function majRetraite() {
    var actif = $('p-retraite').checked;
    $('bloc-retraite').hidden = !actif;
    $('p-duree').readOnly = actif;
    $('p-duree').closest('.field').classList.toggle('verrouille', actif);
    $('retraite-err').textContent = '';
    ui.retraite = null;
    if (!actif) return;
    var a = lire('p-age'), d = lire('p-depart');
    if (a.vide) { $('retraite-err').textContent = t('Indiquez votre âge actuel.'); return; }
    var r = Conseil.dureeRetraite(a.v, d.v, Scenario.DUREE_MAX);
    if (r.erreur) {
      $('retraite-err').textContent = {
        age: t('L\'âge actuel doit être un nombre entier entre 18 et 75 ans.'),
        depart: t('L\'âge de départ doit être un nombre entier entre 40 et 80 ans.'),
        ecart: t('L\'écart entre les deux âges doit être compris entre 1 et {0} ans.', [Scenario.DUREE_MAX])
      }[r.erreur];
      return;
    }
    $('p-duree').value = String(r.duree);
    ui.retraite = { age: a.v, depart: d.v };
  }

  function majObjectif(calc) {
    var r = lire('obj-capital');
    var res = $('obj-res'), btn = $('obj-appliquer');
    btn.hidden = true;
    ui.objectif = null;
    $('bloc-objectif').classList.remove('ok', 'ko');
    if (r.vide) { res.textContent = t('Indiquez le capital souhaité au terme : le simulateur calcule le versement nécessaire.'); return; }
    if (!isFinite(r.v)) { res.textContent = t('Saisissez un montant valide (ex. 500).'); $('bloc-objectif').classList.add('ko'); return; }
    if (calc.erreur) { res.textContent = t('Corrigez d\'abord les hypothèses de projection.'); $('bloc-objectif').classList.add('ko'); return; }
    var o = Conseil.versementPourCapital(calc.etat, r.v);
    if (!o || !(o.versement > 0)) { res.textContent = ''; return; }
    var f = calc.facteur;
    $('bloc-objectif').classList.add('ok');
    res.textContent = t('Versez {0} {1} en assurance vie (soit {2} par an) pour atteindre un capital total de {3} en {4} ans.', [fmtTND(o.versement), t(PERIODES[calc.etat.frequence]), fmtTND(o.versement * f), fmtTND(o.capital), calc.etat.dureeAns]) +
      (calc.etat.croissancePct > 0 ? ' ' + t('Montant de la première année, puis en hausse de {0} par an.', [fmtPct(calc.etat.croissancePct)]) : '');
    ui.objectif = o.versement;
    btn.hidden = Math.abs(o.versement - calc.etat.versement) < 0.0005;
  }

  /* ===================================================================
     Rachat anticipé
     =================================================================== */
  function bornerAnnee(id, duree) {
    var el = $(id);
    if (el.dataset.touche) return;
    var v = lire(id).v;
    if (!isFinite(v) || v > duree) el.value = String(Math.max(1, Math.min(duree, isFinite(v) ? v : 1)));
  }

  function lignesRachat(r) {
    var cea = r.produit === 'cea';
    return [
      [t(cea ? 'Montant retiré du CEA en fin d\'année {0} ({1})' : 'Capital racheté en fin d\'année {0} ({1})', [r.annee, fmtPct(r.partPct)]), fmtTND(r.capitalRachete)],
      [t('Pénalité de rachat'), (r.penalite > 0 ? '− ' : '') + fmtTND(r.penalite)],
      [t('Montant réintégré au revenu imposable'), fmtTND(r.montantReintegre)],
      [t('Impôt supplémentaire dû (réintégration)'), (r.impotReintegration > 0 ? '− ' : '') + fmtTND(r.impotReintegration)],
      [t('Montant net perçu'), fmtTND(r.netRecu), 'fort'],
      [t('Versements correspondants'), fmtTND(r.versementsRachetes)],
      [t('Gain ou perte nette sur les versements'), fmtSigne(r.gainNet), r.gainNet >= 0 ? 'fort' : 'perte'],
      [t('Économies d\'impôt déjà obtenues sur cette part'), fmtTND(r.economieObtenue)],
      [t('Coût total de la sortie (pénalité + impôt)'), fmtTND(r.coutSortie), r.coutSortie > 0 ? 'perte' : '']
    ];
  }
  function majRachat() {
    var calc = ui.calc;
    ui.rachat = null;
    if (!calc || !calc.actif) return;
    $('bloc-r-produit').hidden = !(calc.aAv && calc.aCea);
    if (!calc.aAv) ui.produitRachat = 'cea';
    if (!calc.aCea) ui.produitRachat = 'av';
    selectionnerSegment('r-produit', ui.produitRachat);
    var cea = ui.produitRachat === 'cea';
    var duree = calc.etat.dureeAns;
    bornerAnnee('r-annee', duree);
    var a = nombre('r-annee'), part = nombre('r-part'), pen = lire('r-penalite').vide ? 0 : nombre('r-penalite');
    var err = '';
    if (!(a >= 1 && a <= duree && Math.floor(a) === a)) err = t('L\'année du rachat doit être un nombre entier entre 1 et {0}.', [duree]);
    else if (!(part > 0 && part <= 100)) err = t('La part rachetée doit être comprise entre 0 et 100 %.');
    else if (!(pen >= 0 && pen < 100)) err = t('La pénalité doit être comprise entre 0 et 100 %.');
    $('rachat-err').textContent = err;
    if (err) { $('rachat-res').innerHTML = ''; majAvance(); return; }
    var r = Rachat.simuler(calc, { produit: ui.produitRachat, annee: a, partPct: part, penalitePct: pen });
    ui.rachat = r;
    var msg = cea
      ? (r.anticipe ? t('Retrait du CEA : les dépôts encore bloqués (moins de {0} ans) sont réintégrés au revenu imposable de l\'année du retrait.', [r.dureeMinimale])
                    : t('Tous les dépôts ont passé la période de blocage de {0} ans : pas de réintégration fiscale.', [r.dureeMinimale]))
      : (r.anticipe ? t('Rachat avant {0} ans : les montants déduits sont réintégrés au revenu imposable de l\'année du rachat.', [r.dureeMinimale])
                    : t('Contrat d\'au moins {0} ans : pas de réintégration fiscale.', [r.dureeMinimale]));
    var statut = '<div class="statut ' + (r.anticipe ? 'ko' : 'ok') + '"><svg class="ico ico-sm"><use href="#' + (r.anticipe ? 'i-alert' : 'i-check') + '"/></svg><span>' + echapper(msg) + '</span></div>';
    $('rachat-res').innerHTML = statut + '<div class="tax-rows">' + lignesRachat(r).map(function (l) { return ligne(l[0], l[1], l[2]); }).join('') + '</div>';
    $('rachat-note').textContent = cea
      ? t('Hypothèses : retrait en fin d\'année, scénario médian. Chaque dépôt est bloqué {0} ans à compter du 1er janvier suivant ; la part retirée des dépôts encore bloqués est réintégrée. Paramètres à confirmer avec le texte officiel.', [r.dureeMinimale])
      : t('Hypothèses : rachat en fin d\'année, scénario médian. Réintégration si le contrat a moins de {0} ans : paramètre du barème, à confirmer avec le texte officiel et les conditions du contrat.', [r.dureeMinimale]);
    majAvance();
  }

  /* Avance sur contrat d'assurance vie, comparée à un rachat du même montant */
  function lignesAvance(v) {
    return [
      [t('Capital de l\'assurance vie disponible en année {0}', [v.annee]), fmtTND(v.capitalDisponible)],
      [t('Mensualité de remboursement'), fmtTND(v.mensualite)],
      [t('Coût de l\'avance (intérêts)'), fmtTND(v.interets), v.interets > 0 ? 'perte' : ''],
      [t('Coût d\'un rachat du même montant (pénalité + impôt)'), v.coutRachat === null ? '—' : fmtTND(v.coutRachat), v.coutRachat > 0 ? 'perte' : ''],
      [v.interets <= v.coutRachat ? t('L\'avance coûte moins cher que le rachat') : t('Le rachat coûte moins cher que l\'avance'), fmtTND(Math.abs(v.coutRachat - v.interets)), 'fort']
    ];
  }

  function majAvance() {
    var calc = ui.calc;
    ui.avance = null;
    var visible = !!(calc && calc.actif && calc.aAv);
    $('bloc-avance').hidden = !visible;
    if (!visible) return;
    var m = lire('a-montant'), tx = lire('a-taux'), d = lire('a-duree'), an = nombre('r-annee');
    $('avance-err').textContent = '';
    $('avance-res').innerHTML = '';
    if (m.vide) return;
    if (!(an >= 1 && an <= calc.etat.dureeAns)) return;
    var v = Rachat.avance(calc, { annee: an, montant: m.v, tauxPct: tx.v, dureeMois: d.v, penalitePct: lire('r-penalite').vide ? 0 : nombre('r-penalite') });
    if (!v) { $('avance-err').textContent = t('Vérifiez le montant (positif), le taux (0 à 30 %) et la durée (1 à 360 mois).'); return; }
    if (!v.possible) { $('avance-err').textContent = t('L\'avance ne peut pas dépasser le capital de l\'assurance vie en année {0} : {1}.', [an, fmtTND(v.capitalDisponible)]); return; }
    v.annee = an;
    ui.avance = v;
    $('avance-res').innerHTML = lignesAvance(v).map(function (l) { return ligne(l[0], l[1], l[2]); }).join('');
  }
  /* ===================================================================
     Prévoyance
     =================================================================== */
  function lignesPrevoyance(p) {
    return [
      [t('Capital assurance vie au terme (scénario médian)'), fmtTND(p.capital)],
      p.retraite
        ? [t('Rente annuelle estimée à partir de {0} ans, pendant {1} ans', [p.retraite.depart, p.dureeRente]), fmtTND(p.rente.annuelle), 'fort']
        : [t('Rente annuelle estimée pendant {0} ans', [p.dureeRente]), fmtTND(p.rente.annuelle), 'fort'],
      [t('Soit par mois'), fmtTND(p.rente.mensuelle)]
    ].concat(p.revenu ? [
      [t('Pension de retraite mensuelle estimée'), fmtTND(p.revenu.pension)],
      [t('Revenu mensuel à la retraite (pension + rente)'), fmtTND(p.revenu.total), 'fort'],
      [t('Part du revenu apportée par la rente'), fmtPct(p.revenu.partRente)]
    ] : []).concat([
      [t('Capital acquis en cas de décès en année {0}', [p.deces.annee]), fmtTND(p.deces.capitalAcquis)],
      [t('Versements cumulés à cette date'), fmtTND(p.deces.totalVerse)],
      [t('Capital versé aux bénéficiaires') + ' (' + t({ acquis: 'capital acquis', verses: 'versements remboursés', garanti: 'capital garanti' }[p.deces.origine]) + ')', fmtTND(p.deces.capitalDeces), 'fort']
    ]);
  }

  function lignesSortie(p) {
    var c = p.sortie;
    return [
      [t('Sortie en capital, en une fois'), fmtTND(c.capital)],
      [t('Rentes perçues au total sur {0} ans', [p.dureeRente]), fmtTND(c.totalRentes)],
      [t('Supplément perçu grâce à la rente'), fmtSigne(c.supplement), c.supplement >= 0 ? 'fort' : 'perte'],
      [t('Années de rente pour égaler le capital'), c.anneesPourCapital === null ? '—' : t('{0} ans', [c.anneesPourCapital])]
    ];
  }
  function majPrevoyance() {
    var calc = ui.calc;
    ui.prevoyance = null;
    if (!calc || !calc.actif) return;
    var duree = calc.etat.dureeAns;
    bornerAnnee('v-deces-annee', duree);
    var dr = nombre('v-duree-rente'), tx = nombre('v-taux-rente'), an = nombre('v-deces-annee');
    var g = lire('v-garanti');
    var pension = lire('v-pension');
    var err = '';
    if (!(dr >= 1 && dr <= 50 && Math.floor(dr) === dr)) err = t('La durée de la rente doit être un nombre entier entre 1 et 50 ans.');
    else if (!(tx >= 0 && tx <= 20)) err = t('Le taux technique doit être compris entre 0 et 20 %.');
    else if (!(an >= 1 && an <= duree && Math.floor(an) === an)) err = t('L\'année du décès doit être un nombre entier entre 1 et {0}.', [duree]);
    else if (!isFinite(g.v) || !isFinite(pension.v)) err = t('Saisissez un montant valide (ex. 500).');
    $('prev-err').textContent = err;
    if (err) { $('prev-lignes').innerHTML = ''; $('sortie-lignes').innerHTML = ''; return; }
    var cap = calc.medAv.capitalFinal;
    var p = {
      capital: cap,
      dureeRente: dr, tauxRente: tx,
      rente: Prev.renteEstimee(cap, dr, tx),
      deces: Prev.capitalDeces(calc.medAv.annees, an, g.v),
      retraite: ui.retraite
    };
    p.sortie = Prev.comparerSortie(cap, p.rente.annuelle, dr);
    p.revenu = pension.v > 0 ? Conseil.revenuRetraite(pension.v, p.rente.mensuelle) : null;
    ui.prevoyance = p;
    $('prev-lignes').innerHTML = lignesPrevoyance(p).map(function (l) { return ligne(l[0], l[1], l[2]); }).join('');
    $('sortie-lignes').innerHTML = lignesSortie(p).map(function (l) { return ligne(l[0], l[1], l[2]); }).join('');
  }

  /* ===================================================================
     Lien de partage et QR code
     =================================================================== */
  function lienActuel() { return Partage.lien(location.href, lireEtat()); }

  /* Matrice du QR code (null si la bibliothèque n'est pas chargée) */
  function matriceQR(texte) {
    if (typeof window.qrcode !== 'function') return null;
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(texte);
      qr.make();
      return qr;
    } catch (e) { return null; }
  }

  function majPartage() {
    actualiser();
    var lien = lienActuel();
    $('lien-partage').value = lien;
    var qr = matriceQR(lien);
    $('qr-lien').innerHTML = qr ? qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) : '';
    var message = t('Voici votre simulation d\'assurance vie et de CEA : {0}', [lien]);
    $('envoi-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(message);
    $('envoi-email').href = 'mailto:?subject=' + encodeURIComponent(t('Votre simulation d\'assurance vie et de CEA')) + '&body=' + encodeURIComponent(message + '\n\n' + t('Simulation indicative, non contractuelle.'));
  }

  /* Partage natif du PDF (téléphones et navigateurs qui le permettent) */
  function partagePdfPossible() {
    try {
      return !!(navigator.canShare && window.File && navigator.canShare({ files: [new File(['%PDF'], 'test.pdf', { type: 'application/pdf' })] }));
    } catch (e) { return false; }
  }

  function copier(texte) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texte);
    return new Promise(function (ok, ko) {
      var champ = $('lien-partage');
      champ.focus();
      champ.select();
      try { document.execCommand('copy') ? ok() : ko(); } catch (e) { ko(e); }
    });
  }

  function chargerDepuisLien() {
    if (!location.hash || location.hash.length < 3) return false;
    var d = Partage.decoder(location.hash);
    if (!Object.keys(d).length) return false;
    appliquerEtat(d);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    toast(t('Simulation chargée depuis le lien.'));
    return true;
  }

  /* ===================================================================
     Rapport PDF (jsPDF) et rapport imprimable de secours
     =================================================================== */
  function infosConseiller() {
    var actif = !$('carte-conseiller').hidden;
    return {
      client: actif ? $('c-client').value.trim() : '',
      conseiller: actif ? $('c-conseiller').value.trim() : '',
      ref: actif ? $('c-ref').value.trim() : ''
    };
  }

  /* Agence : coordonnées et logo mémorisés sur cet appareil (localStorage), jamais transmis */
  var COULEUR_ORIGINE = '#5B45D6';
  var CHAMPS_AGENCE = { nom: 'ag-nom', tel: 'ag-tel', email: 'ag-email', adresse: 'ag-adresse' };
  var agence = { nom: '', tel: '', email: '', adresse: '', logo: null, conseiller: '', couleur: '' };

  function chargerAgence() {
    try {
      var d = JSON.parse(localStorage.getItem('agence') || 'null');
      if (d && typeof d === 'object') {
        Object.keys(CHAMPS_AGENCE).concat(['conseiller']).forEach(function (k) { if (typeof d[k] === 'string') agence[k] = d[k]; });
        if (d.logo && typeof d.logo.src === 'string' && /^data:image\/(png|jpeg);base64,/.test(d.logo.src)) agence.logo = d.logo;
        if (typeof d.couleur === 'string' && Theme.palette(d.couleur)) agence.couleur = d.couleur;
      }
    } catch (e) {}
    $('ag-couleur').value = agence.couleur || COULEUR_ORIGINE;
    appliquerCouleur();
    Object.keys(CHAMPS_AGENCE).forEach(function (k) { $(CHAMPS_AGENCE[k]).value = agence[k]; });
    if (agence.conseiller && !$('c-conseiller').value) $('c-conseiller').value = agence.conseiller;
    afficherLogo();
  }

  function sauverAgence() {
    setTimeout(majRappel, 0);
    Object.keys(CHAMPS_AGENCE).forEach(function (k) { agence[k] = $(CHAMPS_AGENCE[k]).value.trim(); });
    agence.conseiller = $('c-conseiller').value.trim();
    try { localStorage.setItem('agence', JSON.stringify(agence)); return true; } catch (e) { return false; }
  }

  function afficherLogo() {
    var ap = $('ag-logo-apercu');
    ap.innerHTML = agence.logo ? '<img alt="" src="' + agence.logo.src + '">' : '';
    ap.hidden = !agence.logo;
    $('ag-logo-retirer').hidden = !agence.logo;
  }

  /* Le logo est redimensionné (320 × 160 au plus) et converti en PNG ou JPEG pour le PDF */
  function lireLogo(fichier) {
    if (!fichier || !/^image\/(png|jpeg|webp)$/.test(fichier.type)) { toast(t('Choisissez une image PNG ou JPEG.'), 'erreur'); return; }
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 320 / img.width, 160 / img.height);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var png = fichier.type !== 'image/jpeg';
        agence.logo = { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), format: png ? 'PNG' : 'JPEG', l: c.width, h: c.height };
        if (!sauverAgence()) { agence.logo = null; toast(t('Logo trop lourd pour être mémorisé.'), 'erreur'); }
        else toast(t('Logo enregistré : il figurera sur le rapport PDF.'));
        afficherLogo();
      };
      img.onerror = function () { toast(t('Choisissez une image PNG ou JPEG.'), 'erreur'); };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  }

  /* Coordonnées locales du conseiller, sinon celles de la publication (js/config.js) */
  function coordonneesAgence() {
    var cfg = (window.ConfigSimulateur && window.ConfigSimulateur.agence) || {};
    var local = agence.nom || agence.tel || agence.email || agence.adresse;
    var src = local ? agence : cfg;
    return { nom: src.nom || '', tel: src.tel || '', email: src.email || '', adresse: src.adresse || '', logo: agence.logo };
  }

  function agencePourRapport() {
    var a = coordonneesAgence();
    if (!a.nom && !a.logo && !a.tel && !a.email) return null;
    return a;
  }

  /* « Être rappelé » : WhatsApp vers le téléphone de l'agence, sinon e-mail */
  function majRappel() {
    var a = coordonneesAgence();
    $('rappel').hidden = !(a.tel.replace(/\D/g, '').length >= 8 || /@/.test(a.email)) || $('resultats').hidden;
  }

  function demanderRappel() {
    actualiser();
    var a = coordonneesAgence();
    var message = t('Bonjour, je souhaite être rappelé au sujet de ma simulation d\'assurance vie et de CEA : {0}', [lienActuel()]);
    var chiffres = a.tel.replace(/\D/g, '');
    if (chiffres.length >= 8) {
      window.open('https://wa.me/' + chiffres + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
    } else if (/@/.test(a.email)) {
      location.href = 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent(t('Demande de rappel : simulation d\'assurance vie et de CEA')) + '&body=' + encodeURIComponent(message);
    }
  }

  /* Numéro de dossier : la référence saisie, sinon un numéro stable tiré des paramètres */
  function numeroDossier(lien, ref) {
    if (ref) return ref;
    var h = 0;
    for (var i = 0; i < lien.length; i++) h = (h * 31 + lien.charCodeAt(i)) >>> 0;
    return 'SIM-' + dateIso().replace(/-/g, '') + '-' + ('000000' + h.toString(36).toUpperCase()).slice(-6);
  }

  function donneesRapport() {
    var calc = ui.calc;
    var sim = calc.sim;
    var lien = lienActuel();
    var meta = infosConseiller();
    var e = calc.etat;
    return {
      langue: I18n.langue() === 'en' ? 'en' : 'fr',
      t: t, fmtTND: fmtTND, fmtPct: fmtPct, fmtEntier: fmtEntier, fmtAmount: fmtAmount,
      date: new Date(),
      bareme: libelleBareme(),
      provisoire: !!sim.regles.provisoire,
      dossier: numeroDossier(lien, meta.ref),
      client: meta.client, conseiller: meta.conseiller,
      agence: agencePourRapport(),
      couleur: couleurRapport(),
      lien: lien, qr: matriceQR(lien),
      calc: calc,
      hypotheses: [
        [t('Revenu brut annuel imposable'), fmtTND(e.revenu)],
        [t('Situation familiale'), (e.chef ? t('Chef de famille') : t('Non chef de famille')) + ' · ' + t('{0} enfant(s), {1} infirme(s), {2} étudiant(s), {3} parent(s)', [e.enfants, e.infirmes, e.etudiants, e.parents])],
        [t('Assurance vie'), fmtTND(calc.investissementAv) + ' ' + t('la 1re année') + ' (' + fmtTND(e.versement) + ' ' + t(PERIODES[e.frequence]) + (e.initialAv > 0 ? ' + ' + t('versement initial {0}', [fmtTND(e.initialAv)]) : '') + ')'],
        [t('CEA'), fmtTND(calc.investissementCea) + ' ' + t('la 1re année') + ' (' + fmtTND(e.versementCea) + ' ' + t(PERIODES[e.frequence]) + (e.initialCea > 0 ? ' + ' + t('versement initial {0}', [fmtTND(e.initialCea)]) : '') + ')'],
        [t('Économie d\'impôt par produit'), t('assurance vie {0} · CEA {1}', [fmtTND(sim.economieAv), fmtTND(sim.economieCea)])]
      ].concat(ui.retraite ? [[t('Retraite'), t('Âge actuel {0} ans, départ à {1} ans', [ui.retraite.age, ui.retraite.depart])]] : []),
      comparatif: calc.actif ? elementsComparatif(calc).map(function (x) { return [x[0], fmtTND(x[1]), x[1]]; }) : null,
      deductions: lignesDeductions(sim, e),
      points: pointsEconomie(sim, sim.investissementAv),
      projection: calc.actif ? lignesProjection(calc) : null,
      hypothesesProjection: calc.actif ? t('{0} ans ; assurance vie : taux servi {1} (garanti {2}), frais {3}, frais sur versement {4} ; CEA : rendement {5}, frais {6}', [e.dureeAns, fmtPct(e.rendementPct), fmtPct(e.tauxGarantiPct), fmtPct(e.fraisPct), fmtPct(e.fraisEntreePct), fmtPct(e.rendementCeaPct), fmtPct(e.fraisCeaPct)]) +
        (e.croissancePct > 0 ? ', ' + t('hausse annuelle {0}', [fmtPct(e.croissancePct)]) : '') +
        (e.inflationPct > 0 ? ', ' + t('inflation {0}', [fmtPct(e.inflationPct)]) : '') +
        (e.reinvestir ? ', ' + t('économie d\'impôt réinvestie') : '') : '',
      scenarios: calc.actif ? ['prudent', 'median', 'dynamique'].map(function (k) { return [t(NOMS_SCEN[k]) + ' · ' + libelleTaux(calc, k), fmtTND(calc.sc[k].capitalFinal)]; }) : null,
      rachat: ui.rachat ? { titre: t('Simulation de rachat anticipé') + ' · ' + t(ui.rachat.produit === 'cea' ? 'CEA' : 'Assurance vie'), lignes: lignesRachat(ui.rachat).concat(ui.avance ? [[t('Avance sur contrat de {0} sur {1} mois à {2}', [fmtTND(ui.avance.montant), nombre('a-duree'), fmtPct(nombre('a-taux'))]), '']].concat(lignesAvance(ui.avance)) : []) } : null,
      prevoyance: ui.prevoyance ? { titre: t('Prévoyance'), lignes: lignesPrevoyance(ui.prevoyance).concat(lignesSortie(ui.prevoyance)) } : null,
      mc: ui.mc ? donneesMonteCarlo(ui.mc, calc) : null,
      strategie: ui.strategie && ui.strategie.gain > 1 ? donneesStrategie(ui.strategie) : null,
      contrats: ui.contrats ? donneesContrats(ui.contrats) : null,
      recommandation: recommandation(calc),
      attention: pointsAttention(calc)
    };
  }

  function preparerRapport() {
    var calc = ui.calc;
    $('er-date').textContent = t('Édité le {0}', [new Date().toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'long', year: 'numeric' })]) + ' · ' + t('Barème : {0}', [libelleBareme()]);
    var meta = infosConseiller();
    var parts = [];
    if (meta.client) parts.push(t('Client : {0}', [meta.client]));
    if (meta.conseiller) parts.push(t('Conseiller : {0}', [meta.conseiller]));
    parts.push(t('Dossier : {0}', [numeroDossier(lienActuel(), meta.ref)]));
    $('er-conseiller').textContent = parts.join(' · ');
    if (!calc) { $('er-hypotheses').textContent = ''; return; }
    var e = calc.etat;
    $('er-hypotheses').textContent = t('Revenu brut annuel : {0} · Investissement : {1} par an ({2} {3})', [fmtTND(e.revenu), fmtTND(calc.investissement), fmtTND(e.versement), t(PERIODES[e.frequence])]);
  }

  /* Génère le PDF : { blob, nom } ou null si jsPDF est indisponible ou en erreur */
  function genererPdf(proposition) {
    if (!window.RapportPDF || !window.jspdf) return null;
    /* Les polices standard du PDF n'ont pas de glyphes arabes : le rapport est alors rédigé en français */
    var langue = I18n.langue();
    if (langue === 'ar') I18n.definir('fr');
    try {
      if (ui.calc && ui.calc.actif && !ui.mc) calculerMonteCarlo(ui.calc);
      var d = donneesRapport();
      d.proposition = !!proposition;
      return { blob: window.RapportPDF.generer(d), nom: (proposition ? 'proposition-' : 'simulation-') + d.dossier.replace(/[^\w-]+/g, '_') + '.pdf' };
    } catch (err) {
      if (window.console) console.error(err);
      return null;
    } finally {
      I18n.definir(langue);
    }
  }

  function exporterPdf() {
    actualiser();
    if (!ui.calc || !(ui.calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); $('revenue').focus(); return; }
    var r = genererPdf();
    if (r) {
      telecharger(r.nom, r.blob, 'application/pdf');
      toast(t('Rapport PDF téléchargé.'));
      return;
    }
    preparerRapport();
    window.print();
  }

  /* ===================================================================
     Portefeuille du conseiller et comparateur
     =================================================================== */
  var COLONNES = [
    ['Revenu brut annuel', 'revenu', 'tnd', null],
    ['Investissement annuel', 'investissementAnnuel', 'tnd', null],
    ['Investissement assurance vie', 'investissementAv', 'tnd', null],
    ['Investissement CEA', 'investissementCea', 'tnd', null],
    ['Durée (ans)', 'dureeAns', 'ent', null],
    ['Économie d\'impôt annuelle', 'economie', 'tnd', 'max'],
    ['Taux de réduction', 'tauxReduction', 'pct', 'max'],
    ['Montant optimal', 'optimal', 'tnd', null],
    ['Capital prudent', 'capitalPrudent', 'tnd', null],
    ['Capital médian', 'capitalMedian', 'tnd', 'max'],
    ['Capital assurance vie (médian)', 'capitalAv', 'tnd', null],
    ['Capital CEA (médian)', 'capitalCea', 'tnd', null],
    ['Capital dynamique', 'capitalDynamique', 'tnd', null],
    ['Capital médian en dinars constants', 'capitalReel', 'tnd', 'max'],
    ['Total versé', 'totalVerse', 'tnd', null],
    ['Valeur totale (capital + économie d\'impôt)', 'valeurTotale', 'tnd', 'max'],
    ['Rendement annuel effectif', 'rendementEffectif', 'pct', 'max'],
    ['Avantage sur le placement classique', 'avantage', 'tnd', 'max']
  ];

  function fmtColonne(v, type) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return type === 'pct' ? fmtPct(v) : type === 'ent' ? String(v) : fmtTND(v);
  }

  function resumeActuel(enr) {
    try { return Scenario.resume(Scenario.calculer(Object.assign(Scenario.defauts(), enr.etat))); } catch (e) { return enr.resume; }
  }

  function afficherPortefeuille() {
    var liste = ui.portefeuille;
    planifierNav();
    ui.selection = ui.selection.filter(function (id) { return liste.some(function (e) { return e.id === id; }); });
    $('port-vide').hidden = liste.length > 0;
    $('port-export').disabled = !liste.length;
    $('port-sauver').disabled = !liste.length;
    var st = Conseil.statistiques(liste.map(resumeActuel));
    $('port-stats').hidden = !liste.length;
    $('st-nombre').textContent = String(st.nombre);
    $('st-epargne').textContent = fmtTND(st.epargneAnnuelle);
    $('st-economie').textContent = fmtTND(st.economieAnnuelle);
    $('st-capital').textContent = fmtTND(st.capitalMedian);
    $('port-vider').disabled = !liste.length;
    $('port-liste').innerHTML = liste.map(function (enr) {
      var r = enr.resume || {};
      var coche = ui.selection.indexOf(enr.id) !== -1;
      var titre = enr.client || t('Simulation sans nom');
      var meta = [enr.date, enr.ref, t('revenu {0}', [fmtTND(r.revenu || 0)])].filter(Boolean).join(' · ');
      return '<li class="port-item' + (coche ? ' choisi' : '') + '">' +
        '<label class="port-sel"><input type="checkbox" data-id="' + echapper(enr.id) + '"' + (coche ? ' checked' : '') + '>' +
        '<span><span class="port-titre">' + echapper(titre) + '</span><span class="port-meta">' + echapper(meta) + '</span></span></label>' +
        '<span class="port-chiffres"><b>' + fmtTND(r.economie || 0) + '</b><small>' + echapper(t('économie par an')) + '</small></span>' +
        '<span class="port-chiffres"><b>' + (r.capitalMedian != null ? fmtTND(r.capitalMedian) : '—') + '</b><small>' + echapper(t('capital médian')) + '</small></span>' +
        '<span class="port-btns"><button type="button" class="btn btn-ghost btn-sm" data-ouvrir="' + echapper(enr.id) + '">' + echapper(t('Ouvrir')) + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm btn-icon" data-suppr="' + echapper(enr.id) + '" aria-label="' + echapper(t('Supprimer cette simulation')) + '" title="' + echapper(t('Supprimer cette simulation')) + '"><svg class="ico ico-sm"><use href="#i-trash"/></svg></button></span>' +
        '</li>';
    }).join('');
    majSelection();
  }

  function majSelection() {
    var n = ui.selection.length;
    Array.prototype.forEach.call($('port-liste').querySelectorAll('input[type="checkbox"]'), function (c) {
      c.disabled = !c.checked && n >= 3;
    });
    $('port-comparer').disabled = n < 2;
    $('port-comparer').lastChild.textContent = n >= 2 ? t('Comparer la sélection ({0})', [n]) : t('Comparer la sélection');
    if (!$('port-comparaison').hidden) {
      if (n >= 2) afficherComparaison(); else $('port-comparaison').hidden = true;
    }
  }

  function afficherComparaison() {
    var choisis = ui.selection.map(function (id) { return ui.portefeuille.filter(function (e) { return e.id === id; })[0]; }).filter(Boolean);
    if (choisis.length < 2) return;
    var resumes = choisis.map(resumeActuel);
    var tete = '<tr><th scope="col">' + echapper(t('Critère')) + '</th>' + choisis.map(function (e) {
      return '<th scope="col">' + echapper(e.client || t('Simulation sans nom')) + '<small>' + echapper([e.date, e.ref].filter(Boolean).join(' · ')) + '</small></th>';
    }).join('') + '</tr>';
    var corps = COLONNES.map(function (c) {
      var vals = resumes.map(function (r) { return r[c[1]]; });
      var meilleur = null;
      var valides = vals.filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
      if (c[3] && valides.length > 1) {
        var m = Math.max.apply(null, valides);
        if (valides.some(function (v) { return Math.abs(v - m) > 0.0005; })) meilleur = m;
      }
      return '<tr><th scope="row">' + echapper(t(c[0])) + '</th>' + vals.map(function (v) {
        var top = meilleur !== null && v !== null && isFinite(v) && Math.abs(v - meilleur) <= 0.0005;
        return '<td' + (top ? ' class="meilleur"' : '') + '>' + fmtColonne(v, c[2]) + (top ? ' <span class="etoile" aria-label="' + echapper(t('meilleure valeur')) + '">★</span>' : '') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var zone = $('port-comparaison');
    zone.innerHTML = '<table class="tranches comparaison"><thead>' + tete + '</thead><tbody>' + corps + '</tbody></table><p class="legende">★ ' + echapper(t('meilleure valeur')) + '</p>';
    zone.hidden = false;
  }

  function rafraichirPortefeuille() {
    if (!depot) return Promise.resolve();
    return depot.lister().then(function (l) { ui.portefeuille = l; afficherPortefeuille(); }).catch(function () {});
  }

  function enregistrer() {
    actualiser();
    if (!depot) { toast(t('Le portefeuille n\'est pas disponible dans ce navigateur.'), 'erreur'); return; }
    if (!ui.calc || !(ui.calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); return; }
    var enr = Port.creerEnregistrement(ui.calc.etat, Scenario.resume(ui.calc), infosConseiller());
    depot.ajouter(enr).then(rafraichirPortefeuille).then(function () {
      toast(t('Simulation enregistrée dans le portefeuille.'));
    }).catch(function () { toast(t('Enregistrement impossible.'), 'erreur'); });
  }

  function restaurer(fichier) {
    if (!fichier || !depot) return;
    var lecteur = new FileReader();
    lecteur.onload = function () {
      var r = Conseil.importerSauvegarde(String(lecteur.result));
      if (r.erreur || !r.simulations.length) { toast(t('Fichier de sauvegarde non reconnu.'), 'erreur'); return; }
      r.simulations.reduce(function (p, enr) { return p.then(function () { return depot.ajouter(enr); }); }, Promise.resolve())
        .then(rafraichirPortefeuille)
        .then(function () { toast(t('{0} simulation(s) restaurée(s).', [r.simulations.length])); })
        .catch(function () { toast(t('Enregistrement impossible.'), 'erreur'); });
    };
    lecteur.onerror = function () { toast(t('Fichier de sauvegarde non reconnu.'), 'erreur'); };
    lecteur.readAsText(fichier);
  }

  function exporterPortefeuille() {
    var cols = COLONNES.map(function (c) { return [t(c[0]), c[1]]; });
    var liste = ui.portefeuille.map(function (e) { return Object.assign({}, e, { resume: resumeActuel(e) }); });
    telecharger('portefeuille-simulations-' + dateIso() + '.csv', XL.portefeuille(liste, cols), 'text/csv;charset=utf-8');
  }

  /* ===================================================================
     Langue
     =================================================================== */
  function appliquerLangue(l, initial) {
    I18n.definir(l);
    var html = document.documentElement;
    html.lang = I18n.langue();
    html.dir = I18n.langue() === 'ar' ? 'rtl' : 'ltr';
    $('langue').value = I18n.langue();
    I18n.traduireDom(document.body);
    document.title = t(I18n.titreOriginal());
    try { localStorage.setItem('langue', I18n.langue()); } catch (e) {}
    majBareme();
    calculateAndDisplay();
    afficherPortefeuille();
    if ($('fenetre-installation').open) remplirFenetre();
    construireNav();
    afficherScenarios();
    construireObjectifs();
    if ($('guide').open) majGuide();
    if (!$('presentation').hidden) { pres.liste = diapositives(); afficherDiapo(0); }
    if (ui.mc) afficherMonteCarlo();
    if (!initial) toast(t('Langue : français'));
  }

  /* ===================================================================
     Événements
     =================================================================== */
  var attente = null;
  function planifier() {
    clearTimeout(attente);
    attente = setTimeout(function () {
      attente = null;
      /* Première apparition des résultats : transition de vue */
      if ($('resultats').hidden && lire('revenue').v > 0) transitionVue(calculateAndDisplay); else calculateAndDisplay();
    }, 60);
  }
  /* Applique un recalcul encore en attente (clic juste après une saisie) */
  function actualiser() { if (attente) { clearTimeout(attente); attente = null; calculateAndDisplay(); } }

  $('revenue').addEventListener('input', function () { majCurseur(); planifier(); });
  $('revenue-r').addEventListener('input', function () {
    $('revenue').value = fmtLibre(+this.value);
    majCurseur();
    planifier();
  });
  ['revenue', 'investment-amount-period', 'inv-cible', 'v-garanti', 'v-pension', 'obj-capital', 'av-initial', 'cea-period', 'cea-initial', 'p-retrait-montant', 'a-montant'].forEach(function (id) {
    $(id).addEventListener('blur', function () {
      var r = Saisie.lireNombre(this.value);
      /* Une saisie ambiguë (« 45,000 ») est laissée telle quelle pour que l'avertissement reste visible */
      if (!r.vide && isFinite(r.v) && !r.ambigu) this.value = fmtLibre(r.v);
    });
  });
  $('investment-amount-period').addEventListener('input', planifier);
  $('inv-cible').addEventListener('input', planifier);
  champsMontants.forEach(function (id) { $(id).addEventListener('input', planifier); });
  $('libre-ajouter').addEventListener('click', function () { var l = ajouterLibre(); if (l) l.querySelector('.libre-annee').focus(); });
  $('libres-liste').addEventListener('input', planifier);
  $('libres-liste').addEventListener('click', function (e) {
    var b = e.target.closest('.libre-suppr');
    if (!b) return;
    b.closest('.libre-ligne').remove();
    $('libre-ajouter').disabled = false;
    calculateAndDisplay();
  });
  ['a-montant', 'a-taux', 'a-duree'].forEach(function (id) { $(id).addEventListener('input', majAvance); });
  $('rappel').addEventListener('click', demanderRappel);
  ['obj-capital', 'p-age', 'p-depart'].forEach(function (id) { $(id).addEventListener('input', planifier); });
  $('p-retraite').addEventListener('change', function () {
    calculateAndDisplay();
    if (this.checked && !$('p-age').value) $('p-age').focus();
  });
  $('obj-appliquer').addEventListener('click', function () { actualiser(); if (ui.objectif > 0) appliquerMontantPeriode(ui.objectif); });
  champsHypotheses.forEach(function (id) { $(id).addEventListener('input', planifier); });
  $('p-reinvest').addEventListener('change', calculateAndDisplay);
  ['r-annee', 'r-part', 'r-penalite'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (id === 'r-annee') this.dataset.touche = '1'; majRachat(); });
  });
  ['v-duree-rente', 'v-taux-rente', 'v-deces-annee', 'v-garanti', 'v-pension'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (id === 'v-deces-annee') this.dataset.touche = '1'; majPrevoyance(); });
  });

  /* Type de support : fixe l'écart entre scénarios */
  function synchroniserSupport() {
    var v = nombre('p-ecart');
    var cle = Object.keys(Scenario.SUPPORTS).filter(function (k) { return Scenario.SUPPORTS[k] === v; })[0];
    $('p-support').value = cle || 'perso';
  }
  $('p-support').addEventListener('change', function () {
    var ecart = Scenario.SUPPORTS[this.value];
    if (ecart !== undefined) { $('p-ecart').value = fmtLibre(ecart); calculateAndDisplay(); }
    else $('p-ecart').focus();
  });
  $('p-ecart').addEventListener('input', synchroniserSupport);

  champsEntiers.forEach(function (id) {
    var el = $(id);
    el.addEventListener('input', function () {
      var brut = el.value.replace(/\D/g, '');
      if (el.value !== brut) el.value = brut;
      majSteppers();
      planifier();
    });
    el.addEventListener('blur', function () { el.value = String(lireEntier(id)); majSteppers(); });
    el.addEventListener('focus', function () { el.select(); });
  });
  document.querySelectorAll('.stepper').forEach(function (st) {
    st.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pas]');
      if (!b || b.disabled) return;
      var id = st.dataset.for;
      var max = +(st.dataset.max || 99);
      var n = Math.min(max, Math.max(0, lireEntier(id) + Number(b.dataset.pas)));
      var input = $(id);
      input.value = String(n);
      input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump');
      vibrer();
      majSteppers();
      calculateAndDisplay();
    });
  });

  var segments = {};
  function brancherSegments(id, surChoix) {
    var conteneur = $(id);
    var boutons = Array.prototype.slice.call(conteneur.querySelectorAll('[role="radio"]'));
    function marquer(b) { boutons.forEach(function (x) { var on = x === b; x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; }); }
    function choisir(b, focus) {
      marquer(b);
      if (focus) b.focus();
      surChoix(b.dataset.val);
    }
    boutons.forEach(function (b) {
      b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1;
      b.addEventListener('click', function () { choisir(b, false); });
      b.addEventListener('keydown', function (e) {
        var i = boutons.indexOf(b), n = null;
        var rtl = document.documentElement.dir === 'rtl';
        if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) n = boutons[(i + 1) % boutons.length];
        if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) n = boutons[(i - 1 + boutons.length) % boutons.length];
        if (n) { e.preventDefault(); choisir(n, true); }
      });
    });
    segments[id] = function (val) {
      var b = boutons.filter(function (x) { return x.dataset.val === val; })[0];
      if (b) marquer(b);
    };
  }
  function selectionnerSegment(id, val) { if (segments[id]) segments[id](val); }
  brancherSegments('chef', function (v) { ui.chef = v === '1'; calculateAndDisplay(); });
  brancherSegments('frequence', function (v) { ui.frequence = v; calculateAndDisplay(); });
  brancherSegments('r-produit', function (v) { ui.produitRachat = v; majRachat(); });

  function appliquerMontantPeriode(periode) {
    $('investment-amount-period').value = fmtLibre(periode);
    calculateAndDisplay();
    toast(t('Montant appliqué : {0} {1}.', [fmtTND(periode), t(PERIODES[ui.frequence])]));
  }
  $('appliquer').addEventListener('click', function () {
    /* Versement périodique (arrondi au millime supérieur) qui, avec le versement initial, atteint l'optimal */
    var periode = parseFloat($('suggest').dataset.periode) || 0;
    if (periode <= 0) return;
    appliquerMontantPeriode(periode);
  });
  $('inv-appliquer').addEventListener('click', function () { actualiser(); if (ui.inverse > 0) appliquerMontantPeriode(ui.inverse); });

  /* PDF, partage, enregistrement */
  window.addEventListener('beforeprint', preparerRapport);
  Array.prototype.forEach.call(document.querySelectorAll('.js-pdf'), function (b) { b.addEventListener('click', exporterPdf); });
  $('partager').addEventListener('click', function () {
    var p = $('panneau-partage');
    p.hidden = !p.hidden;
    this.setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) { majPartage(); $('lien-partage').select(); }
  });
  $('copier-lien').addEventListener('click', function () {
    copier($('lien-partage').value).then(function () { toast(t('Lien copié : envoyez-le à votre client.')); }, function () { toast(t('Copie impossible : sélectionnez le lien et copiez-le.'), 'erreur'); });
  });
  $('lien-partage').addEventListener('focus', function () { this.select(); });
  $('enregistrer').addEventListener('click', enregistrer);
  $('envoi-pdf').hidden = !partagePdfPossible();
  $('envoi-pdf').addEventListener('click', function () {
    actualiser();
    var r = genererPdf();
    if (!r) { toast(t('Envoi impossible depuis ce navigateur : téléchargez le PDF.'), 'erreur'); return; }
    navigator.share({ files: [new File([r.blob], r.nom, { type: 'application/pdf' })], title: t('Rapport de simulation'), text: $('lien-partage').value })
      .catch(function (e) { if (!e || e.name !== 'AbortError') toast(t('Envoi impossible depuis ce navigateur : téléchargez le PDF.'), 'erreur'); });
  });

  /* Infobulles d'explication */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.aide');
    if (!b) return;
    var cible = $(b.getAttribute('aria-controls'));
    var ouvert = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(ouvert));
    cible.hidden = !ouvert;
  });

  /* Agence */
  Object.keys(CHAMPS_AGENCE).forEach(function (k) { $(CHAMPS_AGENCE[k]).addEventListener('input', sauverAgence); });
  $('c-conseiller').addEventListener('input', sauverAgence);
  $('ag-logo').addEventListener('change', function () { lireLogo(this.files && this.files[0]); this.value = ''; });
  $('ag-logo-retirer').addEventListener('click', function () { agence.logo = null; sauverAgence(); afficherLogo(); toast(t('Logo retiré.')); });
  $('export-projection').addEventListener('click', function () {
    actualiser();
    var c = ui.calc;
    if (!c || !c.actif) return;
    telecharger('projection-' + dateIso() + '.csv', XL.projectionAnnuelle(c.med.annees, [t('Année'), t('Total versé'), t('Capital (scénario médian)'), t('Capital en dinars constants')]), 'text/csv;charset=utf-8');
  });

  $('mode-conseiller').addEventListener('click', function () {
    var carte = $('carte-conseiller');
    carte.hidden = !carte.hidden;
    this.setAttribute('aria-pressed', String(!carte.hidden));
    if (!carte.hidden) $('c-client').focus();
  });

  /* Portefeuille */
  $('port-liste').addEventListener('change', function (e) {
    var c = e.target.closest('input[type="checkbox"]');
    if (!c) return;
    var id = c.dataset.id;
    if (c.checked && ui.selection.indexOf(id) === -1) ui.selection.push(id);
    if (!c.checked) ui.selection = ui.selection.filter(function (x) { return x !== id; });
    c.closest('.port-item').classList.toggle('choisi', c.checked);
    majSelection();
  });
  $('port-liste').addEventListener('click', function (e) {
    var ouvrir = e.target.closest('[data-ouvrir]');
    var suppr = e.target.closest('[data-suppr]');
    if (ouvrir) {
      var enr = ui.portefeuille.filter(function (x) { return x.id === ouvrir.dataset.ouvrir; })[0];
      if (!enr) return;
      appliquerEtat(enr.etat);
      if (enr.client || enr.conseiller || enr.ref) {
        $('carte-conseiller').hidden = false;
        $('mode-conseiller').setAttribute('aria-pressed', 'true');
        $('c-client').value = enr.client || '';
        $('c-conseiller').value = enr.conseiller || '';
        $('c-ref').value = enr.ref || '';
      }
      window.scrollTo({ top: 0, behavior: mouvementReduit.matches ? 'auto' : 'smooth' });
      toast(t('Simulation ouverte.'));
    }
    if (suppr && depot) {
      var supprime = ui.portefeuille.filter(function (x) { return x.id === suppr.dataset.suppr; })[0];
      depot.supprimer(suppr.dataset.suppr).then(rafraichirPortefeuille).then(function () {
        toast(t('Simulation supprimée.'), null, supprime ? { libelle: t('Annuler'), executer: function () {
          depot.ajouter(supprime).then(rafraichirPortefeuille).then(function () { toast(t('Simulation restaurée.')); });
        } } : null);
      });
    }
  });
  $('port-comparer').addEventListener('click', function () {
    afficherComparaison();
    $('port-comparaison').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'nearest' });
  });
  $('port-export').addEventListener('click', exporterPortefeuille);
  $('port-sauver').addEventListener('click', function () {
    telecharger('portefeuille-sauvegarde-' + dateIso() + '.json', Conseil.exporterSauvegarde(ui.portefeuille), 'application/json');
    toast(t('Sauvegarde téléchargée : conservez ce fichier pour restaurer le portefeuille sur un autre appareil.'));
  });
  $('port-restaurer').addEventListener('change', function () { restaurer(this.files && this.files[0]); this.value = ''; });
  $('port-vider').addEventListener('click', function () {
    if (!depot || !window.confirm(t('Supprimer toutes les simulations enregistrées dans ce navigateur ?'))) return;
    depot.vider().then(function () { ui.selection = []; $('port-comparaison').hidden = true; return rafraichirPortefeuille(); }).then(function () { toast(t('Portefeuille vidé.')); });
  });

  /* Thème : clair, sombre ou automatique (clé « theme » : « light », « dark » ou « auto » ; absente = auto) */
  var sombreSysteme = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: true };
  function choixTheme() {
    var c = null;
    try { c = localStorage.getItem('theme'); } catch (e) {}
    return c === 'light' || c === 'dark' ? c : 'auto';
  }
  function appliquerTheme(choix, memoriser) {
    if (memoriser) { try { localStorage.setItem('theme', choix); } catch (e) {} }
    var effectif = choix === 'auto' ? (sombreSysteme.matches ? 'dark' : 'light') : choix;
    document.documentElement.setAttribute('data-theme', effectif);
    selectionnerSegment('choix-theme', choix);
    majMetaTheme();
  }
  function ouvrirMenuTheme(ouvrir) {
    var p = $('panneau-theme');
    p.hidden = !ouvrir;
    $('theme-toggle').setAttribute('aria-expanded', String(ouvrir));
    if (ouvrir) { var b = p.querySelector('[aria-checked="true"]'); if (b) b.focus(); }
  }
  brancherSegments('choix-theme', function (v) {
    var c = pointTheme || (function () { var r = $('theme-toggle').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();
    pointTheme = null;
    transitionVue(function () { appliquerTheme(v, true); }, c);
  });
  $('theme-toggle').addEventListener('click', function () { ouvrirMenuTheme($('panneau-theme').hidden); });
  document.addEventListener('click', function (e) { if (!$('panneau-theme').hidden && !e.target.closest('.menu-theme')) ouvrirMenuTheme(false); });
  $('panneau-theme').addEventListener('keydown', function (e) { if (e.key === 'Escape') { ouvrirMenuTheme(false); $('theme-toggle').focus(); } });
  var surChangementSysteme = function () { if (choixTheme() === 'auto') appliquerTheme('auto'); };
  if (sombreSysteme.addEventListener) sombreSysteme.addEventListener('change', surChangementSysteme);
  else if (sombreSysteme.addListener) sombreSysteme.addListener(surChangementSysteme);
  function majMetaTheme() {
    var m = document.querySelector('meta[name="theme-color"]');
    var pal = agence.couleur ? Theme.palette(agence.couleur) : null;
    if (m) m.setAttribute('content', document.documentElement.getAttribute('data-theme') === 'dark' ? '#0b0a11' : (pal ? pal.principale : COULEUR_ORIGINE));
  }

  /* Sélecteur d'année : affiché seulement si plusieurs barèmes sont configurés */
  function initialiserAnnees() {
    var cles = Object.keys(Baremes.annees).sort();
    var sel = $('annee-bareme');
    if (cles.length < 2) return;
    sel.innerHTML = cles.map(function (k) { return '<option value="' + echapper(k) + '">' + echapper(Baremes.annees[k].libelle) + '</option>'; }).join('');
    sel.value = ui.annee;
    sel.hidden = false;
    sel.addEventListener('change', function () { ui.annee = sel.value; majBareme(); calculateAndDisplay(); });
  }

  $('langue').addEventListener('change', function () { appliquerLangue(this.value); });
  window.addEventListener('hashchange', chargerDepuisLien);

  /* Installation de l'application.
     Un site ne peut jamais s'installer sans l'accord de l'utilisateur : le QR code ouvre l'application sur une
     fenêtre d'installation adaptée à l'appareil (un appui sur Android et sur Chrome/Edge ; deux gestes guidés sur
     iPhone et iPad ; navigateurs intégrés aux applications : ouvrir la page dans le vrai navigateur). */
  function urlApplication() {
    var cfg = window.ConfigSimulateur && window.ConfigSimulateur.urlPublique;
    return cfg || (location.origin + location.pathname);
  }
  function urlInstallation() { return urlApplication().split('#')[0].split('?')[0] + '?installer=1'; }
  function estInstallee() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function plateforme() {
    var ua = navigator.userAgent || '';
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|Twitter/i.test(ua)) return 'integre';
    if (ios) return 'ios';
    if (/Android/.test(ua)) return 'android';
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac';
    return 'ordinateur';
  }
  function etapes(liste) {
    return '<ol class="fi-etapes">' + liste.map(function (e) {
      return '<li>' + (e[1] ? '<svg class="ico"><use href="#' + e[1] + '"/></svg>' : '') + '<span>' + echapper(e[0]) + '</span></li>';
    }).join('') + '</ol>';
  }

  var attenteInvitation = null;
  function remplirFenetre() {
    var corps = $('fi-corps'), btn = $('fi-installer'), copie = $('fi-copier');
    var pf = plateforme();
    var invitation = window.__invitationInstallation;
    clearTimeout(attenteInvitation);
    btn.hidden = true; btn.disabled = false; copie.hidden = true;
    btn.lastChild.textContent = t('Installer l\'application');
    /* QR code pour installer sur un téléphone (affiché sur ordinateur) */
    var surOrdinateur = pf === 'ordinateur' || pf === 'mac';
    $('fi-qr').hidden = !surOrdinateur;
    if (surOrdinateur) {
      var qr = matriceQR(urlInstallation());
      $('fi-qr-code').innerHTML = qr ? qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) : '';
    }
    if (estInstallee()) {
      corps.innerHTML = '<p>' + echapper(t('L\'application est déjà installée sur cet appareil.')) + '</p>';
      return;
    }
    if (pf === 'integre') {
      corps.innerHTML = '<p>' + echapper(t('Ce navigateur intégré à une application ne permet pas l\'installation.')) + '</p>' +
        etapes([[t('Touchez le menu ⋮ ou « … » en haut de l\'écran.'), 'i-menu'], [t('Choisissez « Ouvrir dans le navigateur » (Chrome ou Safari).'), 'i-globe'], [t('Scannez à nouveau le QR code ou touchez « Installer l\'application ».'), 'i-phone']]);
      copie.hidden = false;
      return;
    }
    if (pf === 'ios') {
      corps.innerHTML = '<p>' + echapper(t('Sur iPhone et iPad, l\'installation se fait depuis le bouton Partager, en deux gestes :')) + '</p>' +
        etapes([[t('Touchez le bouton Partager (carré avec une flèche vers le haut), en bas de Safari ou dans la barre d\'adresse.'), 'i-partage-ios'], [t('Faites défiler et choisissez « Sur l\'écran d\'accueil ».'), 'i-ajout'], [t('Touchez « Ajouter » : l\'icône du simulateur apparaît sur l\'écran d\'accueil.'), 'i-check']]);
      return;
    }
    if (invitation) {
      corps.innerHTML = '<p>' + echapper(t('Touchez « Installer l\'application », puis confirmez : l\'icône du simulateur apparaît sur votre écran d\'accueil.')) + '</p>';
      btn.hidden = false;
      return;
    }
    /* L'invitation du navigateur peut arriver quelques secondes après l'ouverture : on l'attend brièvement */
    corps.innerHTML = '<p>' + echapper(t('Préparation de l\'installation…')) + '</p>';
    btn.hidden = false;
    btn.disabled = true;
    btn.lastChild.textContent = t('Préparation…');
    attenteInvitation = setTimeout(function () {
      if (window.__invitationInstallation) return;
      btn.hidden = true;
      corps.innerHTML = pf === 'android'
        ? '<p>' + echapper(t('Installez depuis le menu du navigateur :')) + '</p>' + etapes([[t('Touchez le menu ⋮ en haut à droite de Chrome (ou ≡ dans Samsung Internet).'), 'i-menu'], [t('Choisissez « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».'), 'i-ajout'], [t('Confirmez : l\'icône du simulateur apparaît sur l\'écran d\'accueil.'), 'i-check']])
        : pf === 'mac'
          ? '<p>' + echapper(t('Sur Mac avec Safari : menu Fichier, puis « Ajouter au Dock ».')) + '</p>'
          : '<p>' + echapper(t('Ouvrez cette page avec Chrome ou Edge, puis cliquez sur l\'icône d\'installation dans la barre d\'adresse (ou menu ⋮, « Installer »).')) + '</p>';
    }, 4000);
  }
  function ouvrirFenetreInstallation() {
    remplirFenetre();
    var f = $('fenetre-installation');
    if (!f.open) { if (f.showModal) f.showModal(); else f.setAttribute('open', ''); }
  }
  function fermerFenetreInstallation() {
    clearTimeout(attenteInvitation);
    var f = $('fenetre-installation');
    if (f.open) { if (f.close) f.close(); else f.removeAttribute('open'); }
  }
  function lancerInvitation() {
    var invitation = window.__invitationInstallation;
    if (!invitation) return false;
    invitation.prompt();
    invitation.userChoice.then(function (choix) {
      window.__invitationInstallation = null;
      if (choix && choix.outcome === 'accepted') {
        fermerFenetreInstallation();
        toast(t('Installation en cours : l\'application sera disponible depuis votre écran d\'accueil.'));
      } else {
        remplirFenetre();
      }
    }).catch(function () {});
    return true;
  }
  function majInstallation() {
    $('installer').hidden = estInstallee();
    if ($('fenetre-installation').open) remplirFenetre();
    if ($('guide').open) majGuide();
    if (!$('presentation').hidden) { pres.liste = diapositives(); afficherDiapo(0); }
    if (ui.mc) afficherMonteCarlo();
  }
  $('installer').addEventListener('click', function () {
    /* Sur téléphone ou Chrome/Edge avec invitation disponible : fenêtre du navigateur directement */
    var pf = plateforme();
    if (pf !== 'ordinateur' && pf !== 'mac' && lancerInvitation()) return;
    ouvrirFenetreInstallation();
  });
  $('fi-installer').addEventListener('click', function () { if (!lancerInvitation()) remplirFenetre(); });
  $('fi-fermer').addEventListener('click', fermerFenetreInstallation);
  $('fenetre-installation').addEventListener('click', function (e) { if (e.target === this) fermerFenetreInstallation(); });
  $('fi-copier').addEventListener('click', function () {
    var lien = urlInstallation();
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(lien) : Promise.reject())
      .then(function () { toast(t('Lien copié : collez-le dans Chrome ou Safari.')); }, function () { window.prompt(t('Copiez ce lien et ouvrez-le dans Chrome ou Safari :'), lien); });
  });
  $('fi-affiche').addEventListener('click', function () {
    if (!window.RapportPDF || !window.jspdf) { toast(t('Envoi impossible depuis ce navigateur : téléchargez le PDF.'), 'erreur'); return; }
    var langue = I18n.langue();
    if (langue === 'ar') I18n.definir('fr');
    try {
      var blob = window.RapportPDF.affiche({ couleur: couleurRapport(),
        t: t, langue: I18n.langue(), lien: urlInstallation(), qr: matriceQR(urlInstallation()),
        agence: agencePourRapport()
      });
      telecharger('affiche-installation-simulateur.pdf', blob, 'application/pdf');
    } finally { I18n.definir(langue); }
  });
  document.addEventListener('installation-possible', majInstallation);
  window.addEventListener('appinstalled', function () {
    window.__invitationInstallation = null;
    $('installer').hidden = true;
    fermerFenetreInstallation();
    toast(t('Application installée.'));
  });
  majInstallation();

  /* ===================================================================
     Mode simple : masque les réglages avancés (classe « expert »)
     =================================================================== */
  function appliquerModeSimple(actif, annoncer) {
    document.body.classList.toggle('mode-simple', actif);
    $('mode-simple').setAttribute('aria-pressed', String(actif));
    try { localStorage.setItem('modeSimple', actif ? '1' : '0'); } catch (e) {}
    if (annoncer) toast(actif ? t('Mode simple : seuls les résultats essentiels sont affichés.') : t('Mode expert : tous les réglages sont affichés.'));
  }
  $('mode-simple').addEventListener('click', function () { var v = !document.body.classList.contains('mode-simple'); transitionVue(function () { appliquerModeSimple(v, true); }); });

  /* ===================================================================
     « Et si… ? » : curseurs du versement mensuel et de la durée
     =================================================================== */
  function majEtSi(calc) {
    var mensuel = calc.etat.versement * calc.facteur / 12;
    var r = $('si-versement');
    if (document.activeElement !== r) {
      r.max = String(Math.max(2000, Math.ceil(mensuel / 500) * 500));
      r.value = String(Math.round(mensuel / 10) * 10);
    }
    r.style.setProperty('--pct', (+r.value / +r.max * 100) + '%');
    $('si-versement-val').textContent = t('{0} par mois', [fmtTND(Math.round(mensuel * 1000) / 1000)]);
    var d = $('si-duree'), duree = calc.etat.dureeAns;
    d.max = String(Scenario.DUREE_MAX);
    if (document.activeElement !== d && isFinite(duree)) d.value = String(duree);
    d.disabled = !!$('p-retraite').checked;
    d.style.setProperty('--pct', ((+d.value - 1) / (+d.max - 1) * 100) + '%');
    $('si-duree-val').textContent = isFinite(duree) ? t('{0} ans', [duree]) : '—';
  }
  $('si-versement').addEventListener('input', function () {
    var f = FACTEURS[ui.frequence] || 12;
    $('investment-amount-period').value = fmtLibre(Math.round(+this.value * 12 / f * 1000) / 1000);
    this.style.setProperty('--pct', (+this.value / +this.max * 100) + '%');
    planifier();
  });
  $('si-duree').addEventListener('input', function () {
    $('p-duree').value = this.value;
    $('si-duree-val').textContent = t('{0} ans', [+this.value]);
    planifier();
  });

  /* ===================================================================
     Graphiques interactifs : viseur, infobulle et curseur temporel
     =================================================================== */
  var DIM = Graph.dimensions;
  function animerTrace(el) {
    if (!el || mouvementReduit.matches) return;
    el.classList.remove('anime');
    void el.offsetWidth;
    el.classList.add('anime');
    clearTimeout(el._anime);
    el._anime = setTimeout(function () { el.classList.remove('anime'); }, 1400);
  }

  /* info = { titre, lignes: [[classe, libellé, valeur, y (montant)]] } ; x en unités du graphique */
  function afficherViseur(conteneur, x, info) {
    var svg = conteneur.querySelector('svg');
    if (!svg || !info) return;
    var xMax = +svg.dataset.xmax || 1, yMax = +svg.dataset.ymax || 1;
    var l = DIM.L - DIM.MG.g - DIM.MG.d, h = DIM.H - DIM.MG.h - DIM.MG.b;
    var px = DIM.MG.g + Math.max(0, Math.min(1, x / xMax)) * l;
    var g = svg.querySelector('.g-viseur');
    if (!g) {
      g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'g-viseur');
      svg.appendChild(g);
    }
    var s = '<line x1="' + px + '" x2="' + px + '" y1="' + DIM.MG.h + '" y2="' + (DIM.MG.h + h) + '"/>';
    info.lignes.forEach(function (li) {
      if (isFinite(li[3])) s += '<circle cx="' + px + '" cy="' + (DIM.MG.h + h - Math.max(0, Math.min(1, li[3] / yMax)) * h) + '" r="4.5" class="' + li[0] + '"/>';
    });
    g.innerHTML = s;
    var bulle = conteneur.querySelector('.g-infobulle');
    if (!bulle) {
      bulle = document.createElement('div');
      bulle.className = 'g-infobulle';
      bulle.setAttribute('aria-hidden', 'true');
      conteneur.appendChild(bulle);
    }
    bulle.innerHTML = '<b>' + echapper(info.titre) + '</b>' + info.lignes.map(function (li) {
      return '<span class="ib-l"><i class="ib-' + li[0] + '"></i>' + echapper(li[1]) + '<em>' + echapper(li[2]) + '</em></span>';
    }).join('');
    bulle.hidden = false;
    var largeur = svg.getBoundingClientRect().width || 1;
    var gauche = px / DIM.L * largeur;
    var bl = bulle.offsetWidth;
    bulle.style.left = Math.max(0, Math.min(largeur - bl, gauche + (gauche > largeur / 2 ? -bl - 12 : 12))) + 'px';
  }
  function masquerViseur(conteneur) {
    var g = conteneur.querySelector('.g-viseur');
    if (g) g.parentNode.removeChild(g);
    var b = conteneur.querySelector('.g-infobulle');
    if (b) b.hidden = true;
  }
  /* fournisseur(x) : renvoie { x (recalé), info } ou null ; entier = abscisses entières (années) */
  function brancherGraphe(id, fournisseur, entier) {
    var c = $(id);
    function suivre(e) {
      var svg = c.querySelector('svg');
      if (!svg) return;
      var r = svg.getBoundingClientRect();
      var vx = (e.clientX - r.left) / r.width * DIM.L;
      var xMax = +svg.dataset.xmax || 1;
      var x = Math.max(0, Math.min(xMax, (vx - DIM.MG.g) / (DIM.L - DIM.MG.g - DIM.MG.d) * xMax));
      if (entier) x = Math.round(x);
      var res = fournisseur(x);
      if (res) afficherViseur(c, res.x, res.info); else masquerViseur(c);
    }
    c.addEventListener('pointermove', suivre);
    c.addEventListener('pointerdown', suivre);
    c.addEventListener('pointerleave', function () {
      masquerViseur(c);
      if (id === 'graph-capital' && ui.anneeChoisie != null) lectureAnnee(ui.anneeChoisie, true);
    });
  }

  function infoCapital(a) {
    var calc = ui.calc;
    if (!calc || !calc.actif) return null;
    a = Math.max(0, Math.min(calc.etat.dureeAns, a));
    var sc = calc.sc, m = sc.median.annees[a];
    return { x: a, info: { titre: t('Année {0}', [a]), lignes: [
      ['l2', t('Dynamique'), fmtTND(sc.dynamique.annees[a].capital), sc.dynamique.annees[a].capital],
      ['l1', t('Médian'), fmtTND(m.capital), m.capital],
      ['l3', t('Prudent'), fmtTND(sc.prudent.annees[a].capital), sc.prudent.annees[a].capital],
      ['lv', t('Versements cumulés'), fmtTND(m.verse), m.verse]
    ] } };
  }
  brancherGraphe('graph-capital', infoCapital, true);
  brancherGraphe('graph-economie', function (x) {
    var calc = ui.calc;
    if (!calc) return null;
    var e = Moteur.economiePourInvestissement(calc.sim, x);
    return { x: x, info: { titre: t('{0} par an en assurance vie', [fmtTND(x)]), lignes: [
      ['l1', t('Économie d\'impôt'), fmtTND(e), e],
      ['lv', t('Soit par mois'), fmtTND(e / 12), NaN]
    ] } };
  }, false);
  brancherGraphe('graph-mc', function (a) {
    var mc = ui.mc, calc = ui.calc;
    if (!mc || !calc) return null;
    a = Math.max(0, Math.min(mc.annees.length - 1, a));
    var c = mc.centiles;
    return { x: a, info: { titre: t('Année {0}', [a]), lignes: [
      ['lmc1', t('9 cas sur 10 au-dessous de'), fmtTND(c.p90[a]), c.p90[a]],
      ['l1', t('Médiane'), fmtTND(c.p50[a]), c.p50[a]],
      ['lmc1', t('9 cas sur 10 au-dessus de'), fmtTND(c.p10[a]), c.p10[a]],
      ['lv', t('Versements cumulés'), fmtTND(calc.med.annees[a] ? calc.med.annees[a].verse : 0), calc.med.annees[a] ? calc.med.annees[a].verse : NaN]
    ] } };
  }, true);

  /* Curseur temporel : lecture du capital année par année */
  function lectureAnnee(a, viseur) {
    var res = infoCapital(a);
    if (!res) { $('lecture-annee').textContent = ''; return; }
    var m = ui.calc.sc.median.annees[res.x];
    $('annee-curseur-val').textContent = String(res.x);
    $('lecture-annee').innerHTML = '<b>' + echapper(t('Année {0}', [res.x])) + '</b> ' + echapper(t('Capital médian {0} pour {1} versés, soit {2} de gains.', [fmtTND(m.capital), fmtTND(m.verse), fmtSigne(m.capital + (m.retire || 0) - m.verse)]));
    if (viseur) afficherViseur($('graph-capital'), res.x, res.info);
  }
  function majCurseurAnnee(calc) {
    var r = $('annee-curseur'), n = calc.etat.dureeAns;
    var auTerme = ui.anneeChoisie == null || ui.anneeChoisie >= n;
    r.max = String(n);
    if (auTerme) { ui.anneeChoisie = null; r.value = String(n); }
    else r.value = String(ui.anneeChoisie);
    r.style.setProperty('--pct', (+r.value / n * 100) + '%');
    lectureAnnee(+r.value, !auTerme);
  }
  $('annee-curseur').addEventListener('input', function () {
    var a = +this.value;
    ui.anneeChoisie = a >= +this.max ? null : a;
    this.style.setProperty('--pct', (a / +this.max * 100) + '%');
    lectureAnnee(a, true);
  });

  /* ===================================================================
     Projection probabiliste (Monte-Carlo)
     =================================================================== */
  var attenteMc = null;
  function lireVolatilites() {
    var av = lire('mc-vol-av'), cea = lire('mc-vol-cea');
    var ok = isFinite(av.v) && av.v >= 0 && av.v <= 20 && isFinite(cea.v) && cea.v >= 0 && cea.v <= 60;
    $('mc-vol-av').closest('.field').classList.toggle('invalide', !(isFinite(av.v) && av.v >= 0 && av.v <= 20));
    $('mc-vol-cea').closest('.field').classList.toggle('invalide', !(isFinite(cea.v) && cea.v >= 0 && cea.v <= 60));
    $('mc-err').textContent = ok ? '' : t('Volatilité : entre 0 et 20 points pour l\'assurance vie, entre 0 et 60 points pour le CEA.');
    return ok ? { av: av.v, cea: cea.v } : null;
  }
  function cleMc(calc, vol, objectif) { return JSON.stringify([calc.p, calc.pCea, calc.aCea, calc.etat.tauxGarantiPct, vol, objectif]); }
  function objectifSaisi() { var o = lire('obj-capital'); return isFinite(o.v) && o.v > 0 ? o.v : 0; }
  function calculerMonteCarlo(calc) {
    var vol = lireVolatilites();
    if (!vol || !calc || !calc.actif) { ui.mc = null; return null; }
    var objectif = objectifSaisi();
    var cle = cleMc(calc, vol, objectif);
    if (ui.mc && ui.mcCle === cle) return ui.mc;
    ui.mc = MonteCarlo.simuler(calc, { trajectoires: 5000, volatiliteAv: vol.av, volatiliteCea: vol.cea, objectif: objectif });
    ui.mcCle = cle;
    return ui.mc;
  }
  function phrasesMonteCarlo(mc) {
    var p = [
      ['fort', t('9 chances sur 10 d\'avoir au moins {0} au terme', [fmtTND(mc.finalP10)])],
      ['', t('1 chance sur 2 de dépasser {0}', [fmtTND(mc.finalP50)])],
      ['', t('1 chance sur 10 de dépasser {0}', [fmtTND(mc.finalP90)])],
      ['', t('Probabilité que la valeur au terme dépasse les versements : {0}', [fmtPct(mc.probaVersements)])]
    ];
    if (mc.objectif > 0) p.push(['cible', t('Probabilité d\'atteindre votre objectif de {0} : {1}', [fmtTND(mc.objectif), fmtPct(mc.probaObjectif)])]);
    return p;
  }
  function afficherMonteCarlo() {
    var calc = ui.calc;
    var premier = !$('graph-mc').querySelector('svg');
    var mc = calculerMonteCarlo(calc);
    if (!mc) { $('mc-phrases').innerHTML = ''; $('graph-mc').innerHTML = ''; return; }
    $('mc-phrases').innerHTML = phrasesMonteCarlo(mc).map(function (x) { return '<p class="mc-phrase ' + x[0] + '">' + echapper(x[1]) + '</p>'; }).join('');
    morpher($('graph-mc'), Graph.eventail(mc, calc.med.annees.map(function (a) { return a.verse; }), {
      aria: t('Éventail des capitaux possibles selon 5 000 trajectoires de marché'), x: t('Années'), objectif: t('Objectif')
    }));
    if (premier) animerTrace($('graph-mc'));
  }
  function planifierMonteCarlo(calc) {
    clearTimeout(attenteMc);
    if (!calc.actif) { ui.mc = null; return; }
    var vol = lireVolatilites();
    if (vol && ui.mc && ui.mcCle === cleMc(calc, vol, objectifSaisi())) return;
    attenteMc = setTimeout(afficherMonteCarlo, 350);
  }
  ['mc-vol-av', 'mc-vol-cea'].forEach(function (id) { $(id).addEventListener('input', function () { if (ui.calc) planifierMonteCarlo(ui.calc); }); });
  function donneesMonteCarlo(mc, calc) {
    return {
      titre: t('Projection probabiliste'),
      texte: t('{0} trajectoires de marché simulées, volatilité {1} pour l\'assurance vie et {2} pour le CEA.', [fmtEntier(mc.trajectoires), fmtLibre(nombre('mc-vol-av')) + ' pts', fmtLibre(nombre('mc-vol-cea')) + ' pts']),
      phrases: phrasesMonteCarlo(mc).map(function (x) { return x[1]; }),
      centiles: mc.centiles, verses: calc.med.annees.map(function (a) { return a.verse; }), objectif: mc.objectif,
      legende: [t('8 cas sur 10'), t('1 cas sur 2'), t('Médiane'), t('Versements cumulés'), t('Objectif')],
      fourchette: t('Capital au terme dans 8 cas sur 10 : entre {0} et {1}', [fmtTND(mc.finalP10), fmtTND(mc.finalP90)])
    };
  }

  /* ===================================================================
     Stratégie optimale année par année
     =================================================================== */
  function majStrategie(calc) {
    ui.strategie = null;
    if (!calc.actif) return;
    var st = Strategie.optimiser(calc);
    ui.strategie = st;
    var e = calc.etat;
    var res = [];
    if (st.gain > 1) res.push('<p class="strat-gain"><svg class="ico ico-sm"><use href="#i-bulb"/></svg><span>' + echapper(t('En répartissant autrement le même budget, la valeur au terme augmente de {0} (capital médian et économies d\'impôt).', [fmtTND(st.gain)])) + '</span></p>');
    else res.push('<p class="strat-gain ok"><svg class="ico ico-sm"><use href="#i-check"/></svg><span>' + echapper(t('Votre répartition actuelle est déjà la meilleure pour ce budget.')) + '</span></p>');
    if (!st.avValable) res.push('<p class="hint-bloc">' + echapper(t('Durée inférieure à {0} ans : la déduction de l\'assurance vie n\'est pas retenue dans ce calcul.', [st.dureeMinimaleAv])) + '</p>');
    if (st.plan.some(function (l) { return !l.ceaPermis; })) res.push('<p class="hint-bloc">' + echapper(t('Pas de CEA les {0} dernières années : ces dépôts seraient encore bloqués au terme.', [st.dureeBlocageCea])) + '</p>');
    $('strat-resume').innerHTML = res.join('');
    $('strat-corps').innerHTML = st.plan.map(function (l) {
      return '<tr><td>' + l.annee + '</td><td>' + fmtTND(l.budget) + '</td><td>' + fmtTND(l.av) + '</td><td>' + fmtTND(l.cea) +
        ' <small>(' + fmtEntier(l.partCea) + ' %)</small></td><td class="eco">' + fmtTND(l.economie) + '</td></tr>';
    }).join('');
    var per = e.versement + e.versementCea;
    var cible = repartitionConseillee(calc);
    $('strat-appliquer').hidden = !(per > 0) || !cible || (Math.abs(cible.av - e.versement) < 0.0005 && Math.abs(cible.cea - e.versementCea) < 0.0005);
  }
  /* Versements périodiques (même total) selon la part de CEA conseillée la 1re année */
  function repartitionConseillee(calc) {
    var st = ui.strategie;
    if (!st || !st.plan.length) return null;
    var per = calc.etat.versement + calc.etat.versementCea;
    var cea = Math.round(per * st.plan[0].partCea / 100 * 1000) / 1000;
    return { av: Math.round((per - cea) * 1000) / 1000, cea: cea };
  }
  $('strat-appliquer').addEventListener('click', function () {
    actualiser();
    var c = repartitionConseillee(ui.calc);
    if (!c) return;
    $('investment-amount-period').value = c.av > 0 ? fmtLibre(c.av) : '0';
    $('cea-period').value = c.cea > 0 ? fmtLibre(c.cea) : '';
    calculateAndDisplay();
    toast(t('Répartition appliquée : {0} en assurance vie et {1} en CEA {2}.', [fmtTND(c.av), fmtTND(c.cea), t(PERIODES[ui.frequence])]));
  });
  function donneesStrategie(st) {
    return {
      titre: t('Stratégie optimale année par année'),
      texte: t('En répartissant autrement le même budget, la valeur au terme augmente de {0} (capital médian et économies d\'impôt).', [fmtTND(st.gain)]),
      colonnes: [t('Année'), t('Budget'), t('Assurance vie'), t('CEA'), t('Économie d\'impôt')],
      lignes: st.plan.map(function (l) { return [String(l.annee), fmtTND(l.budget), fmtTND(l.av), fmtTND(l.cea) + ' (' + fmtEntier(l.partCea) + ' %)', fmtTND(l.economie)]; })
    };
  }

  /* ===================================================================
     Comparateur de contrats d'assurance vie
     =================================================================== */
  var CHAMPS_OFFRE = { servi: 'tauxServi', 'garanti': 'tauxGaranti', gestion: 'fraisGestion', versement: 'fraisVersement' };
  function lireOffres() {
    return ['a', 'b', 'c'].map(function (k) {
      var nom = $('o' + k + '-nom');
      var o = { nom: nom.value.trim() || nom.placeholder, vide: lire('o' + k + '-servi').vide };
      Object.keys(CHAMPS_OFFRE).forEach(function (c) { var r = lire('o' + k + '-' + c); o[CHAMPS_OFFRE[c]] = r.vide ? 0 : r.v; });
      return o;
    });
  }
  function majContrats(calc) {
    ui.contrats = null;
    if (!calc.actif || !calc.aAv) return;
    var e = calc.etat;
    /* L'offre A reprend les hypothèses de la projection tant qu'elle n'a pas été modifiée */
    if (!$('carte-contrats').dataset.touche) {
      $('oa-servi').value = fmtLibre(e.rendementPct);
      $('oa-garanti').value = fmtLibre(e.tauxGarantiPct);
      $('oa-gestion').value = fmtLibre(e.fraisPct);
      $('oa-versement').value = fmtLibre(e.fraisEntreePct);
    }
    var offres = lireOffres().filter(function (o) { return !o.vide; });
    var zone = $('contrats-res');
    if (offres.length < 2) { zone.hidden = true; zone.innerHTML = ''; return; }
    var res = Contrats.comparer(calc, offres);
    ui.contrats = res;
    zone.hidden = false;
    var cols = [t('Offre'), t('Capital au terme (médian)'), t('Capital au seul taux garanti'), t('Coût des frais au terme'), t('Rendement effectif'), t('Écart')];
    zone.innerHTML = '<table class="tranches contrats"><thead><tr>' + cols.map(function (c) { return '<th scope="col">' + echapper(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      res.map(function (r) {
        if (!r.valide) return '<tr><th scope="row">' + echapper(r.nom) + '</th><td colspan="5" class="ko">' + echapper(t('Saisie incomplète ou incohérente (taux garanti supérieur au taux servi ?)')) + '</td></tr>';
        return '<tr' + (r.meilleur ? ' class="meilleur"' : '') + '><th scope="row">' + (r.meilleur ? '★ ' : '') + echapper(r.nom) + '</th><td>' + fmtTND(r.capital) + '</td><td>' + fmtTND(r.capitalGaranti) +
          '</td><td>' + fmtTND(r.frais) + '</td><td>' + fmtPct(r.rendementEffectif) + '</td><td>' + (r.meilleur ? '—' : fmtSigne(r.ecart)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function donneesContrats(res) {
    return {
      titre: t('Comparateur de contrats'),
      colonnes: [t('Offre'), t('Capital au terme (médian)'), t('Capital au seul taux garanti'), t('Coût des frais au terme'), t('Rendement effectif')],
      lignes: res.filter(function (r) { return r.valide; }).map(function (r) { return [(r.meilleur ? '★ ' : '') + r.nom, fmtTND(r.capital), fmtTND(r.capitalGaranti), fmtTND(r.frais), fmtPct(r.rendementEffectif)]; })
    };
  }
  $('carte-contrats').addEventListener('input', function (e) {
    if (/^oa-/.test(e.target.id)) this.dataset.touche = '1';
    if (ui.calc) majContrats(ui.calc);
  });

  /* ===================================================================
     Recommandation et points d'attention (présentation et proposition)
     =================================================================== */
  function recommandation(calc) {
    var e = calc.etat, sim = calc.sim, per = t(PERIODES[e.frequence]);
    var l = [];
    if (e.versement > 0 || e.initialAv > 0) l.push(t('Assurance vie : {0} {1}', [fmtTND(e.versement), per]) + (e.initialAv > 0 ? ' + ' + t('versement initial {0}', [fmtTND(e.initialAv)]) : ''));
    if (e.versementCea > 0 || e.initialCea > 0) l.push(t('CEA : {0} {1}', [fmtTND(e.versementCea), per]) + (e.initialCea > 0 ? ' + ' + t('versement initial {0}', [fmtTND(e.initialCea)]) : ''));
    var effort = calc.investissement - sim.economie;
    return {
      lignes: l,
      economie: t('Économie d\'impôt : {0} par an, soit {1} par mois.', [fmtTND(sim.economie), fmtTND(sim.economie / 12)]),
      effort: t('Effort d\'épargne réel après économie d\'impôt : {0} par mois.', [fmtTND(Math.max(0, effort) / 12)]),
      optimal: sim.optimal > sim.investissementAv + 0.5 ? t('Pour atteindre le plancher légal, l\'assurance vie peut aller jusqu\'à {0} par an.', [fmtTND(sim.optimal)]) : ''
    };
  }
  function pointsAttention(calc) {
    var P = calc.sim.produits;
    var l = [];
    if (calc.aAv) l.push(t('Assurance vie : un rachat avant {0} ans entraîne la réintégration des primes déduites dans le revenu de l\'année du rachat.', [P.av.dureeMinimaleAns]));
    if (calc.aCea) l.push(t('CEA : chaque dépôt reste bloqué {0} ans à compter du 1er janvier suivant ; un retrait anticipé est réintégré au revenu.', [P.cea.dureeBlocageAns]));
    l.push(t('Déduction plafonnée à {0} par an et par produit ; l\'impôt ne descend jamais sous 45 % de l\'impôt initial.', [fmtTND(P.av.plafond)]));
    l.push(t('Les rendements sont des hypothèses : seul le taux minimum garanti du contrat est assuré ; le CEA, investi en actions, peut perdre de la valeur.'));
    return l;
  }

  /* ===================================================================
     Calendrier des versements (.ics)
     =================================================================== */
  $('agenda').addEventListener('click', function () {
    actualiser();
    var calc = ui.calc;
    if (!calc || !(calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); return; }
    var e = calc.etat;
    if (!(e.versement > 0) && !(e.versementCea > 0) && !(e.initialAv > 0) && !(e.initialCea > 0)) { toast(t('Indiquez un versement en assurance vie ou en CEA pour créer le calendrier.'), 'erreur'); return; }
    var maintenant = new Date();
    var debut = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
    var ics = Calendrier.generer(e, { debut: debut, t: t, fmt: fmtLibre,
      dureeMinimaleAv: calc.sim.produits.av.dureeMinimaleAns, dureeBlocageCea: calc.sim.produits.cea.dureeBlocageAns, maintenant: maintenant });
    telecharger('calendrier-epargne-' + dateIso() + '.ics', ics, 'text/calendar;charset=utf-8');
    toast(t('Calendrier téléchargé : ouvrez le fichier pour ajouter les rappels à votre agenda.'));
  });

  /* ===================================================================
     Proposition commerciale (PDF de plusieurs pages, avec signatures)
     =================================================================== */
  $('proposition').addEventListener('click', function () {
    actualiser();
    if (!ui.calc || !(ui.calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); $('revenue').focus(); return; }
    var r = genererPdf(true);
    if (!r) { toast(t('Envoi impossible depuis ce navigateur : téléchargez le PDF.'), 'erreur'); return; }
    telecharger(r.nom, r.blob, 'application/pdf');
    toast(t('Proposition commerciale téléchargée.'));
  });

  /* ===================================================================
     Simulation guidée en 3 étapes
     =================================================================== */
  var guide = { etape: 1, chef: false, retour: null };
  brancherSegments('g-chef', function (v) { guide.chef = v === '1'; });
  function entierGuide(id, max) { var v = parseInt($(id).value, 10); return isFinite(v) ? Math.max(0, Math.min(max, v)) : 0; }
  function conseilGuide() {
    var sim = Moteur.simuler({ revenu: lire('g-revenu').v, chef: guide.chef, enfants: entierGuide('g-enfants', 20), infirmes: lireEntier('disabled-children'),
      etudiants: entierGuide('g-etudiants', 20), parents: entierGuide('g-parents', 2),
      investissementAv: 0, investissementCea: montant('cea-period') * (FACTEURS[ui.frequence] || 12) + montant('cea-initial') }, ui.annee);
    return { optimalMensuel: sim.optimal > 0 ? Math.ceil(sim.optimal / 12) : 0, economie: Moteur.economiePourInvestissement(sim, sim.optimal), impot: sim.impotAvant };
  }
  function majGuide() {
    var n = guide.etape;
    document.querySelectorAll('#guide .guide-etape').forEach(function (el) { el.hidden = +el.dataset.etape !== n; });
    $('guide-etape-lib').textContent = t('Étape {0} sur 3', [n]);
    $('guide-barre').style.width = (n / 3 * 100) + '%';
    $('guide-retour').hidden = n === 1;
    $('guide-suivant').firstChild.textContent = n === 3 ? t('Voir mon résultat') : t('Suivant');
    if (n === 3) {
      var c = conseilGuide();
      ui.guideOptimal = c.optimalMensuel;
      $('g-conseil').textContent = c.optimalMensuel > 0
        ? t('Avec un revenu de {0}, verser {1} par mois en assurance vie réduit votre impôt au maximum autorisé : {2} d\'économie par an.', [fmtTND(lire('g-revenu').v), fmtTND(c.optimalMensuel), fmtTND(c.economie)])
        : t('Votre impôt est déjà au minimum : l\'assurance vie reste utile pour constituer un capital.');
      $('g-optimal').hidden = !(c.optimalMensuel > 0);
    }
    var champ = document.querySelector('#guide .guide-etape:not([hidden]) input');
    if (champ) setTimeout(function () { champ.focus(); }, 30);
  }
  function ouvrirGuide() {
    var rev = lire('revenue');
    $('g-revenu').value = rev.v > 0 ? fmtLibre(rev.v) : '';
    guide.chef = ui.chef;
    selectionnerSegment('g-chef', ui.chef ? '1' : '0');
    $('g-enfants').value = String(lireEntier('children'));
    $('g-etudiants').value = String(lireEntier('students'));
    $('g-parents').value = String(lireEntier('parents'));
    var per = lire('investment-amount-period');
    $('g-versement').value = per.v > 0 ? fmtLibre(Math.round(per.v * (FACTEURS[ui.frequence] || 12) / 12 * 1000) / 1000) : '';
    $('g-revenu-err').textContent = '';
    $('g-versement-err').textContent = '';
    guide.etape = 1;
    guide.retour = document.activeElement;
    var d = $('guide');
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    majGuide();
  }
  function fermerGuide() {
    var d = $('guide');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    if (guide.retour && guide.retour.focus) guide.retour.focus();
  }
  function terminerGuide() {
    var v = lire('g-versement');
    if (!v.vide && !(isFinite(v.v) && v.v >= 0)) { $('g-versement-err').textContent = t('Saisissez un montant valide (ex. 500).'); return; }
    $('revenue').value = fmtLibre(lire('g-revenu').v);
    $('children').value = String(entierGuide('g-enfants', 20));
    $('students').value = String(entierGuide('g-etudiants', 20));
    /* Le versement CEA est converti en mensuel avec la fréquence */
    var cea = montant('cea-period');
    if (cea > 0) $('cea-period').value = fmtLibre(Math.round(cea * (FACTEURS[ui.frequence] || 12) / 12 * 1000) / 1000);
    $('parents').value = String(entierGuide('g-parents', 2));
    ui.chef = guide.chef;
    selectionnerSegment('chef', guide.chef ? '1' : '0');
    ui.frequence = 'Mensuel';
    selectionnerSegment('frequence', 'Mensuel');
    $('investment-amount-period').value = v.vide ? '' : fmtLibre(v.v);
    majCurseur();
    majSteppers();
    calculateAndDisplay();
    fermerGuide();
    $('resultats').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
    toast(t('Simulation prête : voici votre économie d\'impôt.'));
  }
  $('guide-suivant').addEventListener('click', function () {
    if (guide.etape === 1) {
      var r = lire('g-revenu');
      if (!(isFinite(r.v) && r.v > 0)) { $('g-revenu-err').textContent = t('Saisissez un montant valide (ex. 45 000).'); $('g-revenu').focus(); return; }
      $('g-revenu-err').textContent = '';
    }
    if (guide.etape === 3) { terminerGuide(); return; }
    guide.etape++;
    vibrer();
    majGuide();
  });
  $('guide-retour').addEventListener('click', function () { if (guide.etape > 1) { guide.etape--; majGuide(); } });
  $('guide-fermer').addEventListener('click', fermerGuide);
  $('guide').addEventListener('cancel', function (e) { e.preventDefault(); fermerGuide(); });
  $('guide').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('guide-suivant').click(); }
  });
  $('g-optimal').addEventListener('click', function () { if (ui.guideOptimal > 0) $('g-versement').value = fmtLibre(ui.guideOptimal); $('g-versement').focus(); });
  $('g-revenu').addEventListener('blur', function () { var r = Saisie.lireNombre(this.value); if (!r.vide && isFinite(r.v) && !r.ambigu) this.value = fmtLibre(r.v); });
  ['guide-hero', 'guide-vide'].forEach(function (id) { $(id).addEventListener('click', ouvrirGuide); });

  /* ===================================================================
     Mode présentation client : 4 diapositives plein écran
     =================================================================== */
  var pres = { i: 0, retour: null, x0: null };
  function diapositives() {
    var calc = ui.calc, sim = calc.sim, e = calc.etat, mc = ui.mc;
    var rec = recommandation(calc);
    var famille = (e.chef ? t('Chef de famille') : t('Non chef de famille')) + ' · ' + t('{0} enfant(s), {1} infirme(s), {2} étudiant(s), {3} parent(s)', [e.enfants, e.infirmes, e.etudiants, e.parents]);
    var d = [];
    d.push({ sur: t('Votre situation'), titre: t('Aujourd\'hui, vous payez {0} d\'impôt par an', [fmtTND(sim.impotAvant)]),
      corps: '<div class="pr-chiffres"><div><span>' + echapper(t('Revenu brut annuel imposable')) + '</span><b>' + fmtTND(e.revenu) + '</b></div><div><span>' + echapper(t('Situation familiale')) + '</span><b class="petit">' + echapper(famille) + '</b></div></div>' });
    var part = sim.impotAvant > 0 ? sim.impotApres / sim.impotAvant * 100 : 0;
    d.push({ sur: t('Votre économie d\'impôt'), titre: fmtTND(sim.economie) + ' ' + t('par an'),
      corps: '<p class="pr-sous">' + echapper(t('soit {0} par mois · {1} de réduction', [fmtTND(sim.economie / 12), fmtPct(sim.tauxReduction)])) + '</p>' +
        '<div class="pr-barres"><div><span>' + echapper(t('Impôt total avant investissement')) + '</span><i style="width:100%"></i><b>' + fmtTND(sim.impotAvant) + '</b></div>' +
        '<div><span>' + echapper(t('Impôt total après investissement')) + '</span><i class="apres" style="width:' + part.toFixed(1) + '%"></i><b>' + fmtTND(sim.impotApres) + '</b></div></div>' });
    if (calc.actif) {
      var fourchette = mc ? t('Dans 8 cas sur 10 : entre {0} et {1}', [fmtTND(mc.finalP10), fmtTND(mc.finalP90)])
        : t('Entre {0} (prudent) et {1} (dynamique)', [fmtTND(calc.sc.prudent.capitalFinal), fmtTND(calc.sc.dynamique.capitalFinal)]);
      d.push({ sur: t('Votre capital dans {0} ans', [e.dureeAns]), titre: fmtTND(mc ? mc.finalP50 : calc.sc.median.capitalFinal),
        corps: '<p class="pr-sous">' + echapper(fourchette) + '</p><p class="pr-sous">' + echapper(t('pour {0} versés', [fmtTND(calc.med.totalVerse)])) + '</p>' +
          '<div class="pr-graphe">' + (mc ? Graph.eventail(mc, calc.med.annees.map(function (a) { return a.verse; }), { aria: t('Éventail des capitaux possibles selon 5 000 trajectoires de marché'), x: t('Années'), objectif: t('Objectif') })
            : Graph.courbeCapital(calc.sc, { aria: t('Capital constitué par année selon trois scénarios de rendement'), x: t('Années') })) + '</div>' });
    }
    var a = coordonneesAgence();
    d.push({ sur: t('Notre recommandation'), titre: rec.lignes.join(' · ') || t('Commencez par un versement en assurance vie'),
      corps: '<ul class="pr-liste"><li>' + echapper(rec.economie) + '</li><li>' + echapper(rec.effort) + '</li>' + (rec.optimal ? '<li>' + echapper(rec.optimal) + '</li>' : '') + '</ul>' +
        (a.nom || a.tel || a.email ? '<p class="pr-contact">' + echapper([a.nom, a.tel, a.email].filter(Boolean).join(' · ')) + '</p>' : '') });
    return d;
  }
  function afficherDiapo(sens) {
    var liste = pres.liste, i = pres.i, s = liste[i];
    var el = $('pr-diapo');
    el.className = 'pr-diapo' + (sens ? (sens > 0 ? ' suiv' : ' prec') : '');
    el.innerHTML = '<p class="pr-sur">' + echapper(s.sur) + '</p><h2 class="pr-titre">' + echapper(s.titre) + '</h2>' + s.corps;
    $('pr-points').innerHTML = liste.map(function (x, k) { return '<button type="button" class="pr-point' + (k === i ? ' actif' : '') + '" data-i="' + k + '" aria-label="' + echapper(t('Diapositive {0} sur {1}', [k + 1, liste.length])) + '"' + (k === i ? ' aria-current="step"' : '') + '></button>'; }).join('');
    $('pr-precedent').disabled = i === 0;
    $('pr-suivant').disabled = i === liste.length - 1;
    animerTrace(el.querySelector('.pr-graphe'));
    envoyerDiapo();
  }
  function allerDiapo(k) {
    if (k < 0 || k >= pres.liste.length || k === pres.i) return;
    var sens = k > pres.i ? 1 : -1;
    pres.i = k;
    vibrer();
    afficherDiapo(sens);
  }
  function ouvrirPresentation() {
    actualiser();
    if (!ui.calc || !(ui.calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); return; }
    if (ui.calc.actif) calculerMonteCarlo(ui.calc);
    var a = coordonneesAgence();
    $('pr-agence').textContent = a.nom || t('Assurance vie & CEA');
    pres.liste = diapositives();
    pres.i = 0;
    pres.retour = document.activeElement;
    var p = $('presentation');
    p.hidden = false;
    document.body.classList.add('presentation-ouverte');
    afficherDiapo(0);
    try { if (p.requestFullscreen && !document.fullscreenElement) p.requestFullscreen().catch(function () {}); } catch (e) {}
    $('pr-suivant').focus();
  }
  function fermerPresentation() {
    var p = $('presentation');
    if (p.hidden) return;
    p.hidden = true;
    document.body.classList.remove('presentation-ouverte');
    if (pres.canal) pres.canal.postMessage({ type: 'fin' });
    pres.telecommande = false;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    if (pres.retour && pres.retour.focus) pres.retour.focus();
  }
  $('presenter').addEventListener('click', ouvrirPresentation);
  $('pr-fermer').addEventListener('click', fermerPresentation);
  $('pr-precedent').addEventListener('click', function () { allerDiapo(pres.i - 1); });
  $('pr-suivant').addEventListener('click', function () { allerDiapo(pres.i + 1); });
  $('pr-points').addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) allerDiapo(+b.dataset.i); });
  /* Sortie du plein écran (Échap) : fin de la présentation, sauf en télécommande d'un second écran */
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && !$('presentation').hidden && pres.pleinEcran && !pres.telecommande && !ecranClient) fermerPresentation();
    pres.pleinEcran = !!document.fullscreenElement;
  });
  document.addEventListener('keydown', function (e) {
    if ($('presentation').hidden || ecranClient) return;
    var rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'Escape') { e.preventDefault(); fermerPresentation(); }
    else if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'PageDown' || (e.key === ' ' && e.target.tagName !== 'BUTTON')) { e.preventDefault(); allerDiapo(pres.i + 1); }
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'PageUp') { e.preventDefault(); allerDiapo(pres.i - 1); }
    else if (e.key === 'Tab') {
      /* Focus maintenu dans la présentation */
      var f = Array.prototype.filter.call($('presentation').querySelectorAll('button'), function (b) { return !b.disabled; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  $('presentation').addEventListener('pointerdown', function (e) { pres.x0 = ecranClient ? null : e.clientX; });
  $('presentation').addEventListener('pointerup', function (e) {
    if (pres.x0 == null) return;
    var dx = e.clientX - pres.x0;
    pres.x0 = null;
    if (Math.abs(dx) < 50) return;
    var rtl = document.documentElement.dir === 'rtl';
    allerDiapo(pres.i + ((dx < 0) !== rtl ? 1 : -1));
  });

  /* ===================================================================
     Couleur de l'agence : interface et PDF
     =================================================================== */
  function appliquerCouleur() {
    var st = $('style-agence');
    var pal = agence.couleur ? Theme.palette(agence.couleur) : null;
    if (!pal) { if (st) st.parentNode.removeChild(st); majMetaTheme(); return; }
    if (!st) { st = document.createElement('style'); st.id = 'style-agence'; document.head.appendChild(st); }
    var rvb = pal.rvb.join(', ');
    st.textContent = ':root{--indigo:' + pal.principale + ';--primary:' + pal.principale + ';--violet:' + pal.secondaire +
      ';--primary-soft:rgba(' + rvb + ',0.1);--ring:rgba(' + rvb + ',0.35);--shadow-glow:0 14px 34px -12px rgba(' + rvb + ',0.55);' +
      '--grad-main:linear-gradient(135deg,' + pal.principale + ' 0%,' + pal.secondaire + ' 50%,' + pal.tertiaire + ' 100%);' +
      '--grad-hero:radial-gradient(110% 140% at 0% 0%,' + pal.secondaire + ' 0%,transparent 55%),radial-gradient(100% 140% at 70% 100%,' + pal.tertiaire + ' 0%,transparent 60%),linear-gradient(135deg,' + pal.principale + ',' + pal.secondaire + ');' +
      '--aurora-1:rgba(' + rvb + ',0.2)}' +
      ':root[data-theme="dark"]{--primary:' + pal.claire + ';--primary-soft:rgba(' + rvb + ',0.2);--ring:rgba(' + rvb + ',0.5)}';
    majMetaTheme();
  }
  function couleurRapport() {
    var pal = agence.couleur ? Theme.palette(agence.couleur) : null;
    if (!pal) return null;
    return { principale: pal.rvb, secondaire: Theme.versRvb(pal.secondaire), tertiaire: Theme.versRvb(pal.tertiaire) };
  }
  $('ag-couleur').addEventListener('input', function () { agence.couleur = this.value; appliquerCouleur(); sauverAgence(); });
  $('ag-couleur-raz').addEventListener('click', function () {
    agence.couleur = '';
    $('ag-couleur').value = COULEUR_ORIGINE;
    appliquerCouleur();
    sauverAgence();
    toast(t('Couleurs d\'origine rétablies.'));
  });

  /* Ouverture depuis le QR code (?installer=1) : fenêtre d'installation immédiate */
  (function () {
    var params = new URLSearchParams(location.search);
    if (!params.has('installer')) return;
    params.delete('installer');
    try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch (e) {}
    if (estInstallee()) return;
    setTimeout(ouvrirFenetreInstallation, 300);
  })();

  /* ===================================================================
     Rubriques : barre latérale (bureau) ou feuille de navigation (mobile)
     Suivi de la rubrique visible, valeurs clés en direct, filtre « / »
     =================================================================== */
  var RUBRIQUES = [
    ['Votre situation', [
      ['conseiller', '#carte-conseiller', 'Mode conseiller', 'i-user'],
      ['famille', 'section[aria-labelledby="t-famille"]', 'Situation familiale', 'i-users'],
      ['investissement', 'section[aria-labelledby="t-inv"]', 'Investissement', 'i-coins']
    ]],
    ['Résultats', [
      ['economie', '#resultats .kpis', 'Économie d\'impôt', 'i-piggy'],
      ['impot', 'section[aria-labelledby="t-impot"]', 'Impôt annuel', 'i-receipt'],
      ['net', 'section[aria-labelledby="t-net"]', 'Revenu net imposable', 'i-cash'],
      ['tranches', 'section[aria-labelledby="t-tranches"]', 'Impôt par tranche', 'i-layers'],
      ['courbe', 'section[aria-labelledby="t-courbe"]', 'Économie selon le montant investi', 'i-chart']
    ]],
    ['Projection', [
      ['projection', 'section[aria-labelledby="t-proj"]', 'Projection du capital', 'i-target'],
      ['mc', '#carte-mc', 'Projection probabiliste', 'i-des'],
      ['stress', '#carte-stress', 'Tests de résistance', 'i-eclair'],
      ['objectifs', '#carte-objectifs', 'Objectifs de vie', 'i-flag']
    ]],
    ['Comparer et optimiser', [
      ['strategie', '#carte-strategie', 'Stratégie optimale', 'i-boussole'],
      ['contrats', '#carte-contrats', 'Comparateur de contrats', 'i-balance'],
      ['scenarios', '#carte-scenarios', 'Comparer des scénarios', 'i-comparer'],
      ['couple', '#carte-couple', 'Simulation du couple', 'i-anneaux']
    ]],
    ['Sortie et prévoyance', [
      ['rachat', '#carte-rachat', 'Rachat anticipé', 'i-logout'],
      ['prevoyance', '#carte-prevoyance', 'Prévoyance', 'i-umbrella']
    ]],
    ['Conseiller', [
      ['portefeuille', '#carte-portefeuille', 'Portefeuille', 'i-columns'],
      ['faq', 'section[aria-labelledby="t-faq"]', 'Questions fréquentes', 'i-help']
    ]]
  ];
  var nav = { items: [], actif: null, verrou: 0, rafSpy: 0, rafMaj: 0 };
  var navLarge = window.matchMedia ? matchMedia('(min-width: 1280px)') : { matches: true };

  function construireNav() {
    var liste = $('rb-liste');
    var html = '<span class="rb-curseur" id="rb-curseur" aria-hidden="true"></span>';
    nav.items = [];
    RUBRIQUES.forEach(function (g) {
      html += '<p class="rb-groupe" data-groupe>' + echapper(t(g[0])) + '</p>';
      g[1].forEach(function (r) {
        var el = document.querySelector(r[1]);
        if (!el) return;
        el.id = el.id || 'rubrique-' + r[0];
        el.setAttribute('data-rubrique', r[0]);
        nav.items.push({ cle: r[0], el: el, lib: t(r[2]) });
        html += '<button type="button" class="rb-item" data-cle="' + r[0] + '" title="' + echapper(t(r[2])) + '"><span class="rb-ico" aria-hidden="true"><svg class="ico"><use href="#' + r[3] + '"/></svg></span>' +
          '<span class="rb-txt"><span class="rb-lib">' + echapper(t(r[2])) + '</span><span class="rb-val" data-val="' + r[0] + '"></span></span></button>';
      });
    });
    liste.innerHTML = html;
    nav.items.forEach(function (it) { it.btn = liste.querySelector('[data-cle="' + it.cle + '"]'); });
    filtrerNav();
    majNav();
  }

  /* État de chaque rubrique : visible, en attente du revenu (grisée) ou absente (masquée) */
  function etatRubrique(it) {
    var el = it.el;
    if (el.closest('.expert') && document.body.classList.contains('mode-simple')) return 'absente';
    var res = $('resultats');
    if (res.contains(el) && res.hidden) return 'attente';
    if (el.hidden || el.closest('[hidden]')) return 'absente';
    return 'visible';
  }

  function valeurRubrique(cle) {
    var c = ui.calc;
    if (!c || !(c.etat.revenu > 0)) return cle === 'portefeuille' && ui.portefeuille.length ? t('{0} simulation(s)', [ui.portefeuille.length]) : '';
    switch (cle) {
      case 'economie': return t('{0} par an', [fmtEntier(c.sim.economie) + ' TND']);
      case 'impot': return fmtEntier(c.sim.impotAvant) + ' → ' + fmtEntier(c.sim.impotApres) + ' TND';
      case 'projection': return c.actif ? t('{0} au terme', [fmtEntier(c.sc.median.capitalFinal) + ' TND']) : '';
      case 'mc': return ui.mc ? t('9 fois sur 10 : {0} ou plus', [fmtEntier(ui.mc.finalP10) + ' TND']) : '';
      case 'strategie': return ui.strategie && ui.strategie.gain > 1 ? t('{0} de plus possible', ['+' + fmtEntier(ui.strategie.gain) + ' TND']) : '';
      case 'contrats':
        var m = ui.contrats && ui.contrats.filter(function (r) { return r.meilleur; })[0];
        return m ? '★ ' + m.nom : '';
      case 'portefeuille': return ui.portefeuille.length ? t('{0} simulation(s)', [ui.portefeuille.length]) : '';
      case 'stress':
        if (!ui.stress) return '';
        var pire = Math.min.apply(null, ui.stress.tests.filter(function (x) { return x.cle !== 'inflation'; }).map(function (x) { return x.ecartPct; }));
        return t('{0} au pire', [fmtPct(pire)]);
      case 'objectifs':
        var po = ui.planObjectifs;
        if (!po || !ui.objectifs.length) return '';
        return po.manque > 0.5 ? t('{0} par mois à trouver', [fmtEntier(po.manque) + ' TND']) : t('Tous financés');
      case 'scenarios': return ui.scenarios.length ? t('{0} scénario(s)', [ui.scenarios.length]) : '';
      case 'couple': return ui.couple ? t('{0} pour le foyer', [fmtEntier(ui.couple.total) + ' TND']) : '';
      default: return '';
    }
  }

  function planifierNav() {
    if (nav.rafMaj) return;
    nav.rafMaj = requestAnimationFrame(function () { nav.rafMaj = 0; majNav(); });
  }
  function majNav() {
    nav.items.forEach(function (it) {
      var e = etatRubrique(it);
      it.etat = e;
      it.btn.hidden = e === 'absente' || it.filtre === false;
      if (e === 'attente') {
        it.btn.setAttribute('aria-disabled', 'true');
        it.btn.title = t('Disponible après la saisie de votre revenu.');
      } else {
        it.btn.removeAttribute('aria-disabled');
        it.btn.title = it.lib;
      }
      var v = it.btn.querySelector('.rb-val');
      var val = e === 'visible' ? valeurRubrique(it.cle) : '';
      if (v.textContent !== val) {
        /* Montants isolés de gauche à droite (lecture correcte en arabe) */
        v.innerHTML = bidi(echapper(val));
      }
    });
    /* Titres de groupe sans rubrique affichée : masqués */
    Array.prototype.forEach.call($('rb-liste').querySelectorAll('[data-groupe]'), function (g) {
      var n = g.nextElementSibling, vide = true;
      while (n && !n.hasAttribute('data-groupe')) { if (!n.hidden) vide = false; n = n.nextElementSibling; }
      g.hidden = vide;
    });
    $('rb-aucune').hidden = nav.items.some(function (it) { return !it.btn.hidden; });
    suivreRubrique();
  }

  /* Rubrique courante : la dernière dont le haut a franchi le tiers supérieur de l'écran */
  function hauteurBarre() { return $('rubriques').ownerDocument.querySelector('.topbar').offsetHeight; }
  function suivreRubrique() {
    if (Date.now() < nav.verrou) return;
    var haut = hauteurBarre();
    var ligne = haut + (window.innerHeight - haut) * 0.3;
    var visibles = nav.items.filter(function (it) { return it.etat === 'visible'; });
    if (!visibles.length) { activerRubrique(null); return; }
    var choix = null, meilleur = -Infinity;
    var finPage = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    visibles.forEach(function (it) {
      var r = it.el.getBoundingClientRect();
      if (finPage) { if (r.top < window.innerHeight && r.top > meilleur) { meilleur = r.top; choix = it; } return; }
      if (r.top <= ligne && r.bottom > haut + 24 && r.top > meilleur) { meilleur = r.top; choix = it; }
    });
    if (!choix && window.scrollY < 40) choix = null;
    activerRubrique(choix);
  }
  function activerRubrique(it) {
    if (nav.actif === it) { placerCurseur(); return; }
    if (nav.actif) nav.actif.btn.removeAttribute('aria-current');
    nav.actif = it;
    if (it) it.btn.setAttribute('aria-current', 'true');
    $('rb-p-cour').textContent = it ? it.lib : '';
    placerCurseur();
  }
  function placerCurseur() {
    var c = $('rb-curseur');
    if (!c) return;
    var it = nav.actif;
    if (!it || it.btn.hidden) { c.classList.remove('visible'); return; }
    c.style.transform = 'translateY(' + it.btn.offsetTop + 'px)';
    c.style.height = it.btn.offsetHeight + 'px';
    c.classList.add('visible');
    /* Garde la rubrique active visible dans la liste */
    var l = $('rb-liste'), b = it.btn;
    if (b.offsetTop < l.scrollTop || b.offsetTop + b.offsetHeight > l.scrollTop + l.clientHeight) {
      l.scrollTo({ top: b.offsetTop - l.clientHeight / 2, behavior: mouvementReduit.matches ? 'auto' : 'smooth' });
    }
  }

  function allerRubrique(it) {
    if (it.etat === 'attente') {
      fermerFeuille();
      $('revenue').focus();
      $('revenue').scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'center' });
      toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur');
      return;
    }
    if (it.el.tagName === 'DETAILS') it.el.open = true;
    fermerFeuille();
    nav.verrou = Date.now() + 1000;
    if (nav.actif) nav.actif.btn.removeAttribute('aria-current');
    nav.actif = null;
    activerRubrique(it);
    it.el.scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
    var titre = it.el.querySelector('h2, h3');
    if (titre) { titre.setAttribute('tabindex', '-1'); titre.focus({ preventScroll: true }); }
    it.el.classList.remove('rb-arrivee');
    void it.el.offsetWidth;
    it.el.classList.add('rb-arrivee');
    setTimeout(function () { it.el.classList.remove('rb-arrivee'); }, 1000);
    vibrer();
  }

  /* Filtre : insensible aux accents et à la casse */
  function sansAccents(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function filtrerNav() {
    var q = sansAccents($('rb-filtre').value.trim());
    nav.items.forEach(function (it) { it.filtre = !q || sansAccents(it.lib).indexOf(q) !== -1; });
  }
  $('rb-filtre').addEventListener('input', function () { filtrerNav(); majNav(); });
  $('rb-filtre').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var it = nav.items.filter(function (x) { return !x.btn.hidden && x.etat === 'visible'; })[0];
      if (it) { this.value = ''; filtrerNav(); majNav(); allerRubrique(it); }
    } else if (e.key === 'Escape' && this.value) { e.stopPropagation(); this.value = ''; filtrerNav(); majNav(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      var b = $('rb-liste').querySelector('.rb-item:not([hidden])');
      if (b) b.focus();
    }
  });
  $('rb-liste').addEventListener('click', function (e) {
    var b = e.target.closest('.rb-item');
    if (!b) return;
    var it = nav.items.filter(function (x) { return x.btn === b; })[0];
    if (it) allerRubrique(it);
  });
  /* Flèches haut et bas entre les rubriques */
  $('rb-liste').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var bs = Array.prototype.filter.call(this.querySelectorAll('.rb-item'), function (b) { return !b.hidden; });
    var i = bs.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    var n = bs[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) n.focus(); else if (e.key === 'ArrowUp') $('rb-filtre').focus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]') || !$('presentation').hidden || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (!navLarge.matches) ouvrirFeuille();
    if (document.documentElement.classList.contains('nav-reduite') && navLarge.matches) reduireNav(false);
    $('rb-filtre').focus();
  });

  /* Barre réduite à ses icônes (mémorisé) */
  function reduireNav(reduite) {
    document.documentElement.classList.toggle('nav-reduite', reduite);
    $('rb-reduire').setAttribute('aria-pressed', String(reduite));
    var lib = reduite ? t('Déplier le menu') : t('Réduire le menu');
    $('rb-reduire').title = lib;
    $('rb-reduire').setAttribute('aria-label', lib);
    try { localStorage.setItem('navReduite', reduite ? '1' : '0'); } catch (e) {}
    setTimeout(placerCurseur, 280);
  }
  $('rb-reduire').addEventListener('click', function () { reduireNav(!document.documentElement.classList.contains('nav-reduite')); });
  $('rb-haut').addEventListener('click', function () {
    fermerFeuille();
    window.scrollTo({ top: 0, behavior: mouvementReduit.matches ? 'auto' : 'smooth' });
  });

  /* Feuille de navigation sur téléphone et tablette */
  var retourFeuille = null;
  function ouvrirFeuille() {
    if (navLarge.matches) return;
    var n = $('rubriques'), v = $('rb-voile');
    retourFeuille = document.activeElement;
    v.hidden = false;
    requestAnimationFrame(function () { v.classList.add('visible'); n.classList.add('ouvert'); placerCurseur(); });
    document.body.classList.add('feuille-ouverte');
    $('rb-pilule').setAttribute('aria-expanded', 'true');
    $('rb-pilule').classList.add('cachee');
    setTimeout(function () { var b = nav.actif && !nav.actif.btn.hidden ? nav.actif.btn : $('rb-liste').querySelector('.rb-item:not([hidden])'); if (b && n.classList.contains('ouvert')) b.focus({ preventScroll: true }); }, 60);
  }
  function fermerFeuille() {
    var n = $('rubriques');
    if (!n.classList.contains('ouvert')) return;
    n.classList.remove('ouvert');
    $('rb-voile').classList.remove('visible');
    setTimeout(function () { if (!n.classList.contains('ouvert')) $('rb-voile').hidden = true; }, 280);
    document.body.classList.remove('feuille-ouverte');
    $('rb-pilule').setAttribute('aria-expanded', 'false');
    $('rb-pilule').classList.remove('cachee');
    if (retourFeuille && retourFeuille.focus && retourFeuille !== document.body) retourFeuille.focus({ preventScroll: true });
  }
  $('rb-pilule').addEventListener('click', ouvrirFeuille);
  $('rb-fermer').addEventListener('click', fermerFeuille);
  $('rb-voile').addEventListener('click', fermerFeuille);
  $('rubriques').addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('rubriques').classList.contains('ouvert')) { e.preventDefault(); fermerFeuille(); }
    if (e.key === 'Tab' && $('rubriques').classList.contains('ouvert')) {
      var f = Array.prototype.filter.call(this.querySelectorAll('button, input'), function (b) { return !b.hidden && b.offsetParent !== null; });
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  function surChangementLargeur() { if (navLarge.matches) fermerFeuille(); placerCurseur(); }
  if (navLarge.addEventListener) navLarge.addEventListener('change', surChangementLargeur);
  else if (navLarge.addListener) navLarge.addListener(surChangementLargeur);

  /* Hauteur de la barre supérieure (position de la barre latérale et ancrage des rubriques) */
  function majHauteurBarre() { document.documentElement.style.setProperty('--topbar-h', hauteurBarre() + 'px'); }
  if (window.ResizeObserver) new ResizeObserver(majHauteurBarre).observe(document.querySelector('.topbar'));
  window.addEventListener('resize', function () { majHauteurBarre(); placerCurseur(); });
  window.addEventListener('scroll', function () {
    if (nav.rafSpy) return;
    nav.rafSpy = requestAnimationFrame(function () { nav.rafSpy = 0; suivreRubrique(); });
  }, { passive: true });

  /* Rubriques affichées ou masquées (résultats, mode simple, cartes conditionnelles) */
  if (window.MutationObserver) {
    var obs = new MutationObserver(planifierNav);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    ['resultats', 'carte-conseiller', 'carte-mc', 'carte-stress', 'carte-strategie', 'carte-contrats', 'carte-rachat', 'carte-prevoyance', 'mc-phrases', 'strat-resume', 'contrats-res', 'port-liste'].forEach(function (id) {
      if ($(id)) obs.observe($(id), { attributes: true, attributeFilter: ['hidden'], childList: true });
    });
  }

  /* ===================================================================
     Stockage local tolérant (navigation privée, stockage désactivé)
     =================================================================== */
  function lireLocal(cle, defaut) { try { var v = JSON.parse(localStorage.getItem(cle) || 'null'); return v == null ? defaut : v; } catch (e) { return defaut; } }
  function ecrireLocal(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ===================================================================
     Historique des saisies : annuler / rétablir (Ctrl Z, Ctrl Maj Z, Ctrl Y)
     =================================================================== */
  var hist = window.Historique.creer(60);
  var attenteHist = null, restauration = false;
  function noterHistorique() {
    if (restauration) return;
    clearTimeout(attenteHist);
    attenteHist = setTimeout(function () { attenteHist = null; if (hist.ajouter(lireEtat())) majBoutonsHist(); }, 700);
  }
  function majBoutonsHist() {
    $('annuler').disabled = !hist.peutAnnuler();
    $('retablir').disabled = !hist.peutRetablir();
  }
  function naviguerHist(sens) {
    actualiser();
    if (attenteHist) { clearTimeout(attenteHist); attenteHist = null; hist.ajouter(lireEtat()); }
    var avant = ui.calc ? ui.calc.sim.economie : 0;
    var e = sens < 0 ? hist.annuler() : hist.retablir();
    if (!e) { toast(sens < 0 ? t('Rien à annuler.') : t('Rien à rétablir.')); return; }
    restauration = true;
    try { appliquerEtat(e); } finally { restauration = false; }
    majBoutonsHist();
    var apres = ui.calc ? ui.calc.sim.economie : 0;
    toast((sens < 0 ? t('Modification annulée') : t('Modification rétablie')) + (Math.abs(apres - avant) > 0.0005 ? ' · ' + t('économie {0} → {1}', [fmtTND(avant), fmtTND(apres)]) : ''));
  }
  $('annuler').addEventListener('click', function () { naviguerHist(-1); });
  $('retablir').addEventListener('click', function () { naviguerHist(1); });
  function champTexte(el) { return el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && /^(text|search|tel|email|url|number|password)$/.test(el.type))); }
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    /* Dans un champ, l'annulation native du texte reste prioritaire */
    if (champTexte(document.activeElement) || !$('presentation').hidden || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    naviguerHist(k === 'y' || e.shiftKey ? 1 : -1);
  });

  /* ===================================================================
     Transitions de vue (révélation des résultats, mode simple, thème)
     =================================================================== */
  function transitionVue(fn, cercle) {
    if (!document.startViewTransition || mouvementReduit.matches) { fn(); return; }
    var racine = document.documentElement;
    if (cercle) racine.classList.add('vt-cercle');
    var vt = document.startViewTransition(fn);
    if (cercle) {
      vt.ready.then(function () {
        var r = Math.hypot(Math.max(cercle.x, innerWidth - cercle.x), Math.max(cercle.y, innerHeight - cercle.y));
        racine.animate({ clipPath: ['circle(0px at ' + cercle.x + 'px ' + cercle.y + 'px)', 'circle(' + r + 'px at ' + cercle.x + 'px ' + cercle.y + 'px)'] },
          { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
    }
    vt.finished.then(function () { racine.classList.remove('vt-cercle'); }, function () { racine.classList.remove('vt-cercle'); });
  }
  var pointTheme = null;
  $('choix-theme').addEventListener('pointerdown', function (e) { pointTheme = { x: e.clientX, y: e.clientY }; });

  /* ===================================================================
     Courbes qui se transforment au lieu d'être redessinées
     =================================================================== */
  var NOMBRE = /-?\d+(?:\.\d+)?/g;
  function morpher(c, html) {
    var anciens = {};
    Array.prototype.forEach.call(c.querySelectorAll('svg > path[class]'), function (p) { anciens[p.getAttribute('class')] = p.getAttribute('d'); });
    c.innerHTML = html;
    if (c._morph) cancelAnimationFrame(c._morph);
    if (mouvementReduit.matches || c.classList.contains('anime') || document.hidden) return;
    var paires = [];
    Array.prototype.forEach.call(c.querySelectorAll('svg > path[class]'), function (p) {
      var a = anciens[p.getAttribute('class')], b = p.getAttribute('d');
      if (!a || !b || a === b) return;
      var na = a.match(NOMBRE), nb = b.match(NOMBRE);
      if (!na || !nb || na.length !== nb.length) return;
      paires.push({ p: p, de: na.map(Number), vers: nb.map(Number), morceaux: b.split(NOMBRE) });
    });
    if (!paires.length) return;
    var t0 = performance.now(), duree = 340;
    function pas(tps) {
      var k = Math.min(1, (tps - t0) / duree), e = 1 - Math.pow(1 - k, 3);
      paires.forEach(function (x) {
        var d = x.morceaux[0];
        for (var i = 0; i < x.vers.length; i++) d += Math.round((x.de[i] + (x.vers[i] - x.de[i]) * e) * 10) / 10 + x.morceaux[i + 1];
        x.p.setAttribute('d', d);
      });
      if (k < 1) c._morph = requestAnimationFrame(pas); else c._morph = 0;
    }
    c._morph = requestAnimationFrame(pas);
  }

  /* ===================================================================
     Plancher légal atteint : un retour visuel bref et motivé
     =================================================================== */
  function celebrerPlancher(sim) {
    var atteint = sim.tauxReduction >= 54.95;
    if (atteint && ui.plancherAtteint === false) {
      var g = $('gauge-fg').closest('.kpi') || $('gauge-fg').parentNode;
      g.classList.remove('celebre'); void g.offsetWidth; g.classList.add('celebre');
      setTimeout(function () { g.classList.remove('celebre'); }, 1200);
      vibrer([12, 50, 12]);
    }
    ui.plancherAtteint = atteint;
  }

  /* ===================================================================
     Comparer des scénarios du même client
     =================================================================== */
  var Comp = window.Comparateur;
  var NOMS_VARIANTES = { optimal: 'Montant optimal', avSeule: 'Tout en assurance vie', moitie: 'Moitié en CEA', plus100: '100 TND de plus par mois' };
  ui.scenarios = lireLocal('scenarios', []).filter(function (x) { return x && x.etat; }).slice(0, Comp.MAX);
  function ajouterScenario(nom, etat) {
    var s = JSON.stringify(etat);
    if (ui.scenarios.some(function (x) { return JSON.stringify(x.etat) === s; })) { toast(t('Ce scénario figure déjà dans la comparaison.'), 'erreur'); return; }
    if (ui.scenarios.length >= Comp.MAX) { toast(t('{0} scénarios au plus : retirez-en un pour en ajouter.', [Comp.MAX]), 'erreur'); return; }
    ui.scenarios.push({ nom: nom, etat: etat });
    ecrireLocal('scenarios', ui.scenarios);
    afficherScenarios();
    toast(t('Scénario ajouté : {0}.', [nom]));
  }
  function nomScenario(x) { return x.cle ? t(NOMS_VARIANTES[x.cle]) : x.nom; }
  function afficherScenarios() {
    var zone = $('scn-zone'), l = ui.scenarios;
    $('scn-vide').hidden = l.length > 0;
    zone.hidden = !l.length;
    if (!l.length) { zone.innerHTML = ''; planifierNav(); return; }
    var m = l.map(function (x) { return Comp.mesurer(x.etat); });
    var b = Comp.meilleurs(m);
    function etoile(cle, i) { return b[cle] === i ? '<span class="etoile" aria-label="' + echapper(t('Meilleure valeur')) + '">★</span> ' : ''; }
    var lignes = [
      [t('Revenu brut annuel imposable'), function (x, i) { return fmtTND(l[i].etat.revenu); }, null],
      [t('Assurance vie'), function (x) { return fmtTND(x.versementAv) + ' <small>' + echapper(t(PERIODES[x.frequence])) + '</small>'; }, null],
      [t('CEA'), function (x) { return fmtTND(x.versementCea) + ' <small>' + echapper(t(PERIODES[x.frequence])) + '</small>'; }, null],
      [t('Économie d\'impôt par an'), function (x) { return fmtTND(x.economie); }, 'economie'],
      [t('Impôt total après investissement'), function (x) { return fmtTND(x.impotApres); }, 'impotApres'],
      [t('Effort d\'épargne réel par mois'), function (x) { return fmtTND(x.effortMensuel); }, 'effortMensuel'],
      [t('Capital au terme (médian)'), function (x) { return x.capital == null ? '—' : fmtTND(x.capital) + ' <small>' + echapper(t('{0} ans', [x.duree])) + '</small>'; }, 'capital'],
      [t('Valeur totale au terme'), function (x) { return x.valeur == null ? '—' : fmtTND(x.valeur); }, 'valeur'],
      [t('Rendement effectif'), function (x) { return x.rendement == null ? '—' : fmtPct(x.rendement); }, 'rendement']
    ];
    zone.innerHTML = '<table class="tranches scenarios"><thead><tr><th scope="col"><span class="sr-only">' + echapper(t('Critère')) + '</span></th>' +
      l.map(function (x, i) {
        return '<th scope="col"><span class="scn-nom">' + echapper(nomScenario(x)) + '</span><span class="scn-btns">' +
          '<button type="button" class="lien-btn" data-scn-appliquer="' + i + '">' + echapper(t('Appliquer')) + '</button>' +
          '<button type="button" class="scn-retirer" data-scn-retirer="' + i + '" aria-label="' + echapper(t('Retirer {0}', [nomScenario(x)])) + '" title="' + echapper(t('Retirer')) + '"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-x"/></svg></button></span></th>';
      }).join('') + '</tr></thead><tbody>' +
      lignes.map(function (lg) {
        return '<tr><th scope="row">' + echapper(lg[0]) + '</th>' + m.map(function (x, i) {
          return '<td' + (lg[2] && b[lg[2]] === i ? ' class="meilleur"' : '') + '>' + (lg[2] ? etoile(lg[2], i) : '') + lg[1](x, i) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    planifierNav();
  }
  $('scn-ajouter').addEventListener('click', function () {
    actualiser();
    ajouterScenario(ui.scenarios.length ? t('Simulation {0}', [ui.scenarios.length + 1]) : t('Simulation actuelle'), lireEtat());
  });
  $('carte-scenarios').addEventListener('click', function (e) {
    var v = e.target.closest('[data-variante]');
    if (v) {
      actualiser();
      var x = Comp.variantes(lireEtat()).filter(function (z) { return z.cle === v.dataset.variante; })[0];
      if (!x) { toast(t('Indiquez d\'abord un versement en assurance vie ou en CEA.'), 'erreur'); return; }
      var avant = ui.scenarios.length;
      ajouterScenario(t(NOMS_VARIANTES[x.cle]), x.etat);
      if (ui.scenarios.length > avant) { ui.scenarios[ui.scenarios.length - 1].cle = x.cle; ecrireLocal('scenarios', ui.scenarios); afficherScenarios(); }
      return;
    }
    var a = e.target.closest('[data-scn-appliquer]');
    if (a) { var s = ui.scenarios[+a.dataset.scnAppliquer]; if (s) { appliquerEtat(s.etat); toast(t('Scénario appliqué : {0}.', [nomScenario(s)])); } return; }
    var r = e.target.closest('[data-scn-retirer]');
    if (r) {
      var i = +r.dataset.scnRetirer, retire = ui.scenarios.splice(i, 1)[0];
      ecrireLocal('scenarios', ui.scenarios);
      afficherScenarios();
      toast(t('Scénario retiré.'), null, { libelle: t('Annuler'), executer: function () { ui.scenarios.splice(i, 0, retire); ecrireLocal('scenarios', ui.scenarios); afficherScenarios(); } });
    }
  });

  /* ===================================================================
     Simulation du couple
     =================================================================== */
  ui.coupleChef = 1;
  brancherSegments('cp-chef', function (v) { ui.coupleChef = +v; majCouple(); });
  function majCouple() {
    var calc = ui.calc, res = $('couple-res');
    ui.couple = null;
    $('cp-err').textContent = '';
    if (!calc || !(calc.etat.revenu > 0)) { res.hidden = true; return; }
    var r2 = lire('cp-revenu'), b = lire('cp-budget');
    $('cp-budget').placeholder = fmtLibre(Math.round(calc.investissementAv)) + '…';
    if (r2.vide) { res.hidden = false; res.innerHTML = '<p class="hint-bloc">' + echapper(t('Indiquez le revenu de votre conjoint pour comparer les répartitions.')) + '</p>'; return; }
    if (!isFinite(r2.v) || r2.v < 0 || (!b.vide && !(isFinite(b.v) && b.v >= 0))) { res.hidden = true; $('cp-err').textContent = t('Saisissez un montant valide (ex. 500).'); return; }
    var budget = b.vide ? calc.investissementAv : b.v;
    var e = calc.etat;
    var r = window.Couple.repartir({ revenu1: e.revenu, revenu2: r2.v, chef: ui.coupleChef, enfants: e.enfants, infirmes: e.infirmes, etudiants: e.etudiants, parents: e.parents,
      budget: budget, cea1: calc.investissementCea, cea2: 0 }, e.annee);
    if (!r) { res.hidden = true; return; }
    ui.couple = r;
    res.hidden = false;
    function tuile(titre, part, eco, avant, apres) {
      return '<div class="cp-tuile"><span class="cp-qui">' + echapper(titre) + '</span><b>' + bidi(fmtTND(part)) + '</b><span>' + bidi(echapper(t('par an, soit {0} par mois', [fmtTND(part / 12)]))) + '</span>' +
        '<span class="cp-eco">' + bidi(echapper(t('Économie {0}', [fmtTND(eco)]))) + '</span><span class="cp-impot">' + bidi(echapper(t('Impôt {0} → {1}', [fmtTND(avant), fmtTND(apres)]))) + '</span></div>';
    }
    res.innerHTML = '<div class="cp-tuiles">' + tuile(t('Vous'), r.part1, r.economie1, r.impotAvant1, r.impot1) + tuile(t('Votre conjoint'), r.part2, r.economie2, r.impotAvant2, r.impot2) + '</div>' +
      '<p class="cp-total"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-check"/></svg><span>' + bidi(echapper(t('Économie du foyer : {0} par an.', [fmtTND(r.total)]))) +
      (r.gainVsEgalitaire > 0.5 ? ' ' + bidi(echapper(t('C\'est {0} de plus qu\'un partage moitié-moitié.', [fmtTND(r.gainVsEgalitaire)]))) : '') + '</span></p>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="cp-appliquer"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-check"/></svg>' + echapper(t('Appliquer votre part à la simulation')) + '</button>';
    planifierNav();
  }
  ['cp-revenu', 'cp-budget'].forEach(function (id) {
    $(id).addEventListener('input', majCouple);
    $(id).addEventListener('blur', function () { var r = Saisie.lireNombre(this.value); if (!r.vide && isFinite(r.v) && !r.ambigu) this.value = fmtLibre(r.v); });
  });
  $('couple-res').addEventListener('click', function (e) {
    if (!e.target.closest('#cp-appliquer') || !ui.couple) return;
    var c = ui.calc, fixe = Math.max(0, c.investissementAv - c.etat.versement * c.facteur);
    appliquerMontantPeriode(Math.max(0, Math.round((ui.couple.part1 - fixe) / c.facteur * 1000) / 1000));
  });

  /* ===================================================================
     Tests de résistance
     =================================================================== */
  function majStress(calc) {
    var zone = $('stress-liste');
    ui.stress = null;
    if (!calc.actif) { zone.innerHTML = ''; return; }
    var n = calc.etat.dureeAns;
    ['st-krach', 'st-pause', 'st-duree'].forEach(function (id) { $(id).max = String(n); });
    var v = { anneeKrach: lire('st-krach').v, chuteCeaPct: lire('st-chute').v, debutPause: lire('st-pause').v, dureePause: lire('st-duree').v, baissePts: lire('st-baisse').v, inflationPct: lire('st-inflation').v };
    var ok = Object.keys(v).every(function (k) { return isFinite(v[k]) && v[k] >= 0; });
    $('st-err').textContent = ok ? '' : t('Saisissez des valeurs positives.');
    if (!ok) { zone.innerHTML = ''; return; }
    var r = window.Stress.tester(calc, v);
    ui.stress = r;
    var o = r.options;
    var D = {
      krach: ['i-eclair', t('Krach boursier l\'année {0}', [o.anneeKrach]), t('Le CEA perd {0} et l\'assurance vie ne sert que son taux garanti cette année-là.', [fmtPct(o.chuteCeaPct)])],
      pause: ['i-minus', t('Pause des versements'), ''],
      baisse: ['i-chart', t('Rendements plus bas'), t('Rendements réduits de {0} points chaque année (assurance vie jamais sous le garanti).', [fmtLibre(o.baissePts)])],
      inflation: ['i-percent', t('Inflation élevée'), '']
    };
    zone.innerHTML = r.tests.map(function (x) {
      var d = D[x.cle], desc = d[2];
      if (x.cle === 'pause') desc = t('Aucun versement pendant {0} an(s) à partir de l\'année {1} : {2} non versés et {3} d\'économie d\'impôt perdue.', [o.dureePause, o.debutPause, fmtTND(x.versementsManques), fmtTND(x.economiePerdue)]);
      if (x.cle === 'inflation') desc = t('Avec {0} d\'inflation par an, le capital vaut {1} en dinars d\'aujourd\'hui ({2} de son montant).', [fmtPct(o.inflationPct), fmtTND(x.capitalReel), fmtPct(x.pouvoirAchatPct)]);
      var montant = x.cle === 'inflation' ? x.capitalReel : x.capital;
      var ratio = r.base.capital > 0 ? Math.max(0, Math.min(1, montant / r.base.capital)) : 0;
      var ecart = x.cle === 'inflation' ? x.capitalReel - r.base.capital : x.ecart;
      return '<div class="st-ligne"><span class="st-ico" aria-hidden="true"><svg class="ico ico-sm"><use href="#' + d[0] + '"/></svg></span>' +
        '<div class="st-txt"><b>' + bidi(echapper(d[1])) + '</b><span>' + bidi(echapper(desc)) + '</span>' +
        '<span class="st-barre" aria-hidden="true"><i style="--r:' + ratio.toFixed(4) + '"></i></span></div>' +
        '<div class="st-val"><b>' + bidi(fmtTND(montant)) + '</b><span class="' + (ecart < -0.5 ? 'perte' : '') + '">' + bidi(fmtSigne(ecart)) + '</span></div></div>';
    }).join('') + '<p class="st-base">' + bidi(echapper(t('Référence : capital médian de {0} au terme.', [fmtTND(r.base.capital)]))) + '</p>';
  }
  ['st-krach', 'st-chute', 'st-pause', 'st-duree', 'st-baisse', 'st-inflation'].forEach(function (id) { $(id).addEventListener('input', function () { if (ui.calc) { majStress(ui.calc); planifierNav(); } }); });

  /* ===================================================================
     Objectifs de vie
     =================================================================== */
  var MODELES_OBJ = {
    retraite: function () { return { nom: t('Retraite'), montant: 200000, ans: ui.retraite ? Math.max(1, ui.retraite.depart - ui.retraite.age) : 20, deja: 0 }; },
    etudes: function () { return { nom: t('Études des enfants'), montant: 60000, ans: 12, deja: 0 }; },
    logement: function () { return { nom: t('Achat immobilier'), montant: 100000, ans: 7, deja: 0 }; },
    libre: function () { return { nom: t('Autre projet'), montant: 20000, ans: 5, deja: 0 }; }
  };
  ui.objectifs = lireLocal('objectifs', []).filter(function (o) { return o && typeof o === 'object'; }).slice(0, 5);
  function construireObjectifs() {
    var liste = $('obj-liste');
    liste.innerHTML = ui.objectifs.map(function (o, i) {
      var id = 'obj' + i;
      return '<div class="obj-ligne" data-i="' + i + '">' +
        '<div class="obj-champs">' +
        '<div class="field obj-nom"><label class="sr-only" for="' + id + '-nom">' + echapper(t('Nom du projet')) + '</label><input id="' + id + '-nom" name="' + id + '-nom" class="obj-titre" type="text" maxlength="40" autocomplete="off" data-cle="nom" value="' + echapper(o.nom || '') + '"></div>' +
        '<div class="field"><div class="field-top"><label for="' + id + '-montant">' + echapper(t('Montant visé')) + '</label></div><div class="input-wrap"><input id="' + id + '-montant" name="' + id + '-montant" type="text" inputmode="decimal" autocomplete="off" data-cle="montant" value="' + echapper(fmtLibre(o.montant || 0)) + '"><span class="suffix" translate="no">TND</span></div></div>' +
        '<div class="field"><div class="field-top"><label for="' + id + '-ans">' + echapper(t('Dans')) + '</label></div><div class="input-wrap"><input id="' + id + '-ans" name="' + id + '-ans" type="text" inputmode="numeric" autocomplete="off" data-cle="ans" value="' + echapper(o.ans) + '"><span class="suffix">' + echapper(t('ans')) + '</span></div></div>' +
        '<div class="field"><div class="field-top"><label for="' + id + '-deja">' + echapper(t('Déjà épargné')) + '</label></div><div class="input-wrap"><input id="' + id + '-deja" name="' + id + '-deja" type="text" inputmode="decimal" autocomplete="off" data-cle="deja" value="' + echapper(o.deja ? fmtLibre(o.deja) : '') + '" placeholder="0"><span class="suffix" translate="no">TND</span></div></div>' +
        '</div><button type="button" class="obj-suppr" data-obj-suppr="' + i + '" aria-label="' + echapper(t('Retirer ce projet')) + '" title="' + echapper(t('Retirer ce projet')) + '"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
        '<div class="obj-res" id="' + id + '-res"></div></div>';
    }).join('');
    $('obj-vide').hidden = ui.objectifs.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('.obj-modeles .puce'), function (b) { b.disabled = ui.objectifs.length >= 5; });
    majObjectifs();
  }
  function majObjectifs() {
    var calc = ui.calc, bilan = $('obj-bilan');
    if (!calc || !ui.objectifs.length) { bilan.hidden = true; return; }
    var e = calc.etat;
    var taux = Math.max(0, e.rendementPct - e.fraisPct);
    var dispo = (e.versement + e.versementCea) * calc.facteur / 12;
    var p = window.Objectifs.planifier(ui.objectifs, taux, dispo);
    ui.planObjectifs = p;
    p.objectifs.forEach(function (o, i) {
      var el = $('obj' + i + '-res');
      if (!el) return;
      if (!o.valide) { el.innerHTML = '<span class="ko">' + echapper(t('Indiquez un montant positif et une échéance entre 1 et 50 ans.')) + '</span>'; return; }
      el.innerHTML = '<span class="obj-besoin">' + bidi(echapper(t('{0} par mois nécessaires', [fmtTND(o.mensuel)]))) + '</span>' +
        '<span class="obj-jauge" role="img" aria-label="' + echapper(t('Financé à {0}', [fmtPct(o.couverture)])) + '"><i class="' + (o.atteint ? 'ok' : '') + '" style="--r:' + (Math.min(100, o.couverture) / 100).toFixed(4) + '"></i></span>' +
        '<span class="obj-cour ' + (o.atteint ? 'ok' : '') + '">' + bidi(echapper(o.atteint ? t('Financé') : t('Financé à {0}', [fmtPct(o.couverture)]))) + '</span>';
    });
    bilan.hidden = false;
    bilan.innerHTML = '<div class="obj-chiffres"><div><span>' + echapper(t('Besoin total par mois')) + '</span><b>' + bidi(fmtTND(p.besoin)) + '</b></div>' +
      '<div><span>' + echapper(t('Votre épargne actuelle par mois')) + '</span><b>' + bidi(fmtTND(p.disponible)) + '</b></div></div>' +
      (p.manque > 0.5 ? '<p class="obj-msg manque">' + bidi(echapper(t('Il manque {0} par mois pour financer tous vos projets au rendement net de {1}.', [fmtTND(p.manque), fmtPct(taux)]))) + '</p>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="obj-ajuster"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-check"/></svg>' + bidi(echapper(t('Ajouter {0} par mois à l\'assurance vie', [fmtTND(p.manque)]))) + '</button>'
        : '<p class="obj-msg ok">' + bidi(echapper(t('Votre épargne actuelle finance tous vos projets, avec {0} de marge par mois.', [fmtTND(p.surplus)]))) + '</p>');
    planifierNav();
  }
  function sauverObjectifs() { ecrireLocal('objectifs', ui.objectifs); }
  $('carte-objectifs').addEventListener('click', function (e) {
    var m = e.target.closest('[data-modele]');
    if (m && ui.objectifs.length < 5) {
      ui.objectifs.push(MODELES_OBJ[m.dataset.modele]());
      sauverObjectifs();
      construireObjectifs();
      var champs = $('obj-liste').querySelectorAll('.obj-ligne');
      var der = champs[champs.length - 1];
      if (der) der.querySelector('[data-cle="montant"]').focus();
      return;
    }
    var s = e.target.closest('[data-obj-suppr]');
    if (s) {
      var i = +s.dataset.objSuppr, retire = ui.objectifs.splice(i, 1)[0];
      sauverObjectifs();
      construireObjectifs();
      toast(t('Projet retiré.'), null, { libelle: t('Annuler'), executer: function () { ui.objectifs.splice(i, 0, retire); sauverObjectifs(); construireObjectifs(); } });
      return;
    }
    if (e.target.closest('#obj-ajuster') && ui.planObjectifs) {
      var c = ui.calc;
      appliquerMontantPeriode(Math.round((c.etat.versement + ui.planObjectifs.manque * 12 / c.facteur) * 1000) / 1000);
    }
  });
  $('obj-liste').addEventListener('input', function (e) {
    var l = e.target.closest('.obj-ligne'), cle = e.target.dataset.cle;
    if (!l || !cle) return;
    var o = ui.objectifs[+l.dataset.i];
    if (cle === 'nom') o.nom = e.target.value.trim();
    else { var r = Saisie.lireNombre(e.target.value); o[cle] = r.vide ? 0 : r.v; }
    sauverObjectifs();
    majObjectifs();
  });
  $('obj-liste').addEventListener('focusout', function (e) {
    var cle = e.target.dataset && e.target.dataset.cle;
    if (cle !== 'montant' && cle !== 'deja') return;
    var r = Saisie.lireNombre(e.target.value);
    if (!r.vide && isFinite(r.v) && !r.ambigu) e.target.value = fmtLibre(r.v);
  });

  /* ===================================================================
     Verrouillage de la saisie (présentation au client)
     =================================================================== */
  function verrouiller(actif) {
    var z = $('zone-saisie');
    if ('inert' in z) z.inert = actif; else if (actif) z.setAttribute('inert', ''); else z.removeAttribute('inert');
    z.classList.toggle('verrouillee', actif);
    $('bandeau-verrou').hidden = !actif;
    $('verrou').setAttribute('aria-pressed', String(actif));
    ui.verrouille = actif;
  }
  $('verrou').addEventListener('click', function () {
    verrouiller(!ui.verrouille);
    toast(ui.verrouille ? t('Saisie verrouillée : les montants ne peuvent plus être modifiés par erreur.') : t('Saisie déverrouillée.'));
  });
  $('deverrouiller').addEventListener('click', function () { verrouiller(false); $('verrou').focus(); });

  /* ===================================================================
     Second écran : la présentation s'affiche dans une autre fenêtre
     (écran tourné vers le client), cette fenêtre-ci sert de télécommande
     =================================================================== */
  var CANAL = 'simulateur-presentation';
  var ecranClient = new URLSearchParams(location.search).get('ecran') === 'client';
  function envoyerDiapo() {
    if (!pres.canal || !pres.liste) return;
    var s = pres.liste[pres.i];
    pres.canal.postMessage({ type: 'diapo', sur: s.sur, titre: s.titre, corps: s.corps, i: pres.i, n: pres.liste.length, agence: $('pr-agence').textContent, langue: I18n.langue() });
  }
  $('pr-ecran').addEventListener('click', function () {
    if (!window.BroadcastChannel) { toast(t('Second écran indisponible dans ce navigateur.'), 'erreur'); return; }
    if (!pres.canal) {
      pres.canal = new BroadcastChannel(CANAL);
      pres.canal.onmessage = function (m) {
        if (m.data && m.data.type === 'pret') { envoyerDiapo(); $('pr-etat').hidden = false; $('pr-etat').textContent = t('Écran client connecté'); }
        if (m.data && m.data.type === 'ferme') { $('pr-etat').hidden = true; }
      };
    }
    /* Cette fenêtre devient la télécommande : elle quitte le plein écran sans fermer la présentation */
    pres.telecommande = true;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    var f = window.open(location.pathname + '?ecran=client', 'ecran-client', 'popup=yes,width=1280,height=800');
    if (!f) { toast(t('Autorisez les fenêtres surgissantes pour ouvrir le second écran.'), 'erreur'); return; }
    if (!ui.verrouille) verrouiller(true);
    toast(t('Faites glisser la nouvelle fenêtre sur l\'écran du client, puis passez-la en plein écran.'));
  });
  function demarrerEcranClient() {
    document.documentElement.classList.add('ecran-client');
    var p = $('presentation');
    p.hidden = false;
    document.body.classList.add('presentation-ouverte');
    $('pr-diapo').innerHTML = '<p class="pr-sur">' + echapper(t('Second écran')) + '</p><h2 class="pr-titre">' + echapper(t('En attente de la présentation…')) + '</h2>';
    $('pr-plein').hidden = !p.requestFullscreen;
    $('pr-plein').addEventListener('click', function () { try { p.requestFullscreen().catch(function () {}); } catch (e) {} });
    document.addEventListener('fullscreenchange', function () { $('pr-plein').hidden = !!document.fullscreenElement; });
    if (!window.BroadcastChannel) return;
    var c = new BroadcastChannel(CANAL);
    c.onmessage = function (m) {
      var d = m.data || {};
      if (d.type === 'diapo') {
        if (d.langue && d.langue !== I18n.langue()) appliquerLangue(d.langue, true);
        $('pr-agence').textContent = d.agence;
        var el = $('pr-diapo');
        var sens = pres.i == null || d.i === pres.i ? '' : d.i > pres.i ? ' suiv' : ' prec';
        pres.i = d.i;
        el.className = 'pr-diapo' + sens;
        el.innerHTML = '<p class="pr-sur">' + echapper(d.sur) + '</p><h2 class="pr-titre">' + echapper(d.titre) + '</h2>' + d.corps;
        $('pr-points').innerHTML = Array.apply(null, Array(d.n)).map(function (x, k) { return '<span class="pr-point' + (k === d.i ? ' actif' : '') + '"></span>'; }).join('');
        animerTrace(el.querySelector('.pr-graphe'));
      }
      if (d.type === 'fin') {
        $('pr-diapo').className = 'pr-diapo';
        $('pr-diapo').innerHTML = '<p class="pr-sur">' + echapper(t('Second écran')) + '</p><h2 class="pr-titre">' + echapper(t('Merci de votre attention')) + '</h2>';
        $('pr-points').innerHTML = '';
      }
    };
    c.postMessage({ type: 'pret' });
    window.addEventListener('beforeunload', function () { c.postMessage({ type: 'ferme' }); });
  }

  /* ===================================================================
     Reçu fiscal partageable (image PNG dessinée sur canvas)
     =================================================================== */
  function couleursRecu() {
    var pal = agence.couleur ? Theme.palette(agence.couleur) : null;
    return pal ? [pal.principale, pal.secondaire, pal.tertiaire] : ['#5B45D6', '#5B45D6', '#4A36B8'];
  }
  function dessinerRecu(cv) {
    var calc = ui.calc, sim = calc.sim, e = calc.etat;
    var W = cv.width, H = cv.height, x = cv.getContext('2d');
    var rtl = I18n.langue() === 'ar';
    var col = couleursRecu();
    var POL = rtl ? '"Segoe UI", Tahoma, "Noto Sans Arabic", sans-serif' : 'Inter, system-ui, sans-serif';
    var DISP = rtl ? POL : '"Plus Jakarta Sans", Inter, system-ui, sans-serif';
    x.direction = rtl ? 'rtl' : 'ltr';
    /* En arabe, chaque montant est isolé de gauche à droite (marques LRI … PDI) */
    function M(v) { return rtl ? '\u2066' + fmtTND(v) + '\u2069' : fmtTND(v); }
    function MP(v) { return rtl ? '\u2066' + fmtPct(v) + '\u2069' : fmtPct(v); }
    function ecrire(s, px, py, taille, poids, coul, align, police) {
      x.font = (poids || 400) + ' ' + taille + 'px ' + (police || POL);
      x.fillStyle = coul || '#121631';
      var a = align || 'start';
      if (rtl) { px = W - px; a = a === 'start' ? 'right' : a === 'end' ? 'left' : a; } else a = a === 'start' ? 'left' : a === 'end' ? 'right' : a;
      x.textAlign = a;
      x.fillText(s, px, py);
    }
    /* Fond */
    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, col[0]); g.addColorStop(0.55, col[1]); g.addColorStop(1, col[2]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    for (var px = 30; px < W; px += 36) for (var py = 30; py < H; py += 36) { x.beginPath(); x.arc(px, py, 1.6, 0, Math.PI * 2); x.fill(); }
    /* Ticket avec bords dentelés */
    var L = 96, R = W - 96, T = 120, B = H - 120, dent = 18;
    x.save();
    x.shadowColor = 'rgba(11, 10, 30, 0.35)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
    x.beginPath();
    x.moveTo(L, T + dent);
    for (var k = L; k < R; k += dent * 2) { x.lineTo(k + dent, T); x.lineTo(Math.min(k + dent * 2, R), T + dent); }
    x.lineTo(R, B - dent);
    for (var k2 = R; k2 > L; k2 -= dent * 2) { x.lineTo(k2 - dent, B); x.lineTo(Math.max(k2 - dent * 2, L), B - dent); }
    x.closePath();
    x.fillStyle = '#ffffff'; x.fill();
    x.restore();
    var gx = L + 64, dx = R - 64, y = T + 96;
    /* En-tête : pastille et titre */
    var cx = rtl ? W - gx - 34 : gx + 34;
    var gp = x.createLinearGradient(cx - 34, y - 60, cx + 34, y + 8);
    gp.addColorStop(0, col[0]); gp.addColorStop(1, col[2]);
    x.fillStyle = gp; x.beginPath(); x.arc(cx, y - 26, 34, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx, y - 46); x.lineTo(cx + 16, y - 39); x.lineTo(cx + 16, y - 26); x.quadraticCurveTo(cx + 16, y - 12, cx, y - 6); x.quadraticCurveTo(cx - 16, y - 12, cx - 16, y - 26); x.lineTo(cx - 16, y - 39); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(cx - 7, y - 26); x.lineTo(cx - 1, y - 20); x.lineTo(cx + 8, y - 31); x.stroke();
    var a = coordonneesAgence();
    ecrire(t('Reçu fiscal'), gx + 90, y - 34, 40, 800, '#121631', 'start', DISP);
    ecrire(a.nom || t('Assurance vie et CEA'), gx + 90, y + 4, 26, 500, '#676d8c');
    ecrire(new Date().toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' }), dx, y - 34, 26, 600, '#676d8c', 'end');
    function pointilles(yy) {
      x.save(); x.setLineDash([10, 10]); x.strokeStyle = '#cdd3e4'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(gx, yy); x.lineTo(dx, yy); x.stroke(); x.restore();
    }
    y += 54; pointilles(y);
    /* Montant principal */
    y += 78;
    ecrire(t('Mon économie d\'impôt'), gx, y, 30, 600, '#363c5c');
    y += 118;
    ecrire(rtl ? '\u2066' + fmtAmount(sim.economie) + '\u2069' : fmtAmount(sim.economie), gx, y, 112, 800, col[0], 'start', DISP);
    x.font = '800 112px ' + DISP;
    var lg = x.measureText(fmtAmount(sim.economie)).width;
    ecrire(rtl ? t('par an') + ' TND' : 'TND ' + t('par an'), gx + lg + 22, y, 34, 700, '#676d8c');
    y += 56;
    ecrire(t('soit {0} par mois · {1} de réduction', [M(sim.economie / 12), MP(sim.tauxReduction)]), gx, y, 28, 500, '#363c5c');
    /* Barres impôt avant / après */
    y += 60;
    var larg = dx - gx;
    function barre(lib, val, part, coul) {
      ecrire(lib, gx, y, 24, 600, '#676d8c');
      ecrire(M(val), dx, y, 24, 700, '#121631', 'end');
      y += 16;
      x.fillStyle = '#eef0fb'; arrondi(gx, y, larg, 18); x.fill();
      x.fillStyle = coul; arrondi(rtl ? gx + larg * (1 - part) : gx, y, Math.max(18, larg * part), 18); x.fill();
      y += 56;
    }
    function arrondi(px, py, w, h) { var r = h / 2; x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
    barre(t('Impôt total avant investissement'), sim.impotAvant, 1, '#cbd5e1');
    barre(t('Impôt total après investissement'), sim.impotApres, sim.impotAvant > 0 ? sim.impotApres / sim.impotAvant : 0, '#10b981');
    pointilles(y - 14);
    y += 40;
    /* Lignes du reçu */
    var lignes = [[t('Assurance vie par an'), M(calc.investissementAv)]];
    if (calc.investissementCea > 0) lignes.push([t('CEA par an'), M(calc.investissementCea)]);
    lignes.push([t('Effort d\'épargne réel par mois'), M(Math.max(0, calc.investissement - sim.economie) / 12)]);
    if (calc.actif) lignes.push([t('Capital au terme (médian) · {0} ans', [e.dureeAns]), M(ui.mc ? ui.mc.finalP50 : calc.med.capitalFinal)]);
    lignes.forEach(function (l) {
      ecrire(l[0], gx, y, 27, 500, '#363c5c');
      ecrire(l[1], dx, y, 27, 700, '#121631', 'end');
      y += 52;
    });
    /* QR code de l'application (aucune donnée personnelle) */
    var qy = B - 230;
    pointilles(qy - 30);
    var qr = matriceQR(urlApplication().split('#')[0].split('?')[0]);
    var taille = 150, qx = rtl ? W - gx - taille : gx;
    if (qr) {
      var n = qr.getModuleCount(), cote = taille / n;
      x.fillStyle = '#121631';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) x.fillRect(qx + c * cote, qy + r * cote, cote + 0.4, cote + 0.4);
    }
    ecrire(t('Faites votre simulation'), gx + taille + 32, qy + 50, 30, 800, '#121631', 'start', DISP);
    ecrire(location.host || 'simulateur', gx + taille + 32, qy + 92, 24, 600, col[0]);
    ecrire(t('Simulation indicative, non contractuelle'), gx + taille + 32, qy + 132, 21, 500, '#676d8c');
    ecrire(t('Simulateur Assurance Vie & CEA'), W / 2, H - 52, 26, 700, 'rgba(255,255,255,0.92)', 'center', DISP);
  }
  function ouvrirRecu() {
    actualiser();
    if (!ui.calc || !(ui.calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); return; }
    if (ui.calc.actif) calculerMonteCarlo(ui.calc);
    var d = $('recu'), cv = $('recu-canvas');
    var pret = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    pret.then(function () {
      dessinerRecu(cv);
      cv.classList.remove('imprime'); void cv.offsetWidth; cv.classList.add('imprime');
      if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    });
    $('recu-partager').hidden = !(navigator.canShare && window.File && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
  }
  function blobRecu() { return new Promise(function (ok) { $('recu-canvas').toBlob(ok, 'image/png'); }); }
  $('ouvrir-recu').addEventListener('click', ouvrirRecu);
  $('recu-fermer').addEventListener('click', function () { $('recu').close(); });
  $('recu-telecharger').addEventListener('click', function () {
    blobRecu().then(function (b) { telecharger('recu-fiscal-' + dateIso() + '.png', b, 'image/png'); toast(t('Image téléchargée.')); });
  });
  $('recu-partager').addEventListener('click', function () {
    blobRecu().then(function (b) {
      return navigator.share({ files: [new File([b], 'recu-fiscal.png', { type: 'image/png' })], title: t('Reçu fiscal'), text: t('Mon économie d\'impôt avec l\'assurance vie : {0} par an.', [fmtTND(ui.calc.sim.economie)]) });
    }).catch(function (e) { if (!e || e.name !== 'AbortError') toast(t('Partage impossible : téléchargez l\'image.'), 'erreur'); });
  });

  /* ===================================================================
     Classeur Excel (.xlsx) : synthèse, tranches, projection, Monte-Carlo, stratégie, scénarios, objectifs
     =================================================================== */
  function exporterXlsx() {
    actualiser();
    var calc = ui.calc;
    if (!calc || !(calc.etat.revenu > 0)) { toast(t('Saisissez d\'abord votre revenu brut annuel imposable.'), 'erreur'); return; }
    var sim = calc.sim, e = calc.etat;
    var T = function (v) { return { v: Math.round(v * 1000) / 1000, s: 'tnd' }; };
    var P = function (v) { return v == null ? '—' : { v: v / 100, s: 'pct' }; };
    var G = function (v) { return { v: v, s: 'gras' }; };
    var feuilles = [];
    var syn = [[{ v: t('Simulation d\'assurance vie et de CEA'), s: 'titre' }], [t('Édité le {0}', [new Date().toLocaleDateString(I18n.locale())]), t('Barème : {0}', [libelleBareme()])], [],
      [G(t('Hypothèses')), G('')],
      [t('Revenu brut annuel imposable'), T(e.revenu)],
      [t('Situation familiale'), (e.chef ? t('Chef de famille') : t('Non chef de famille')) + ' · ' + t('{0} enfant(s), {1} infirme(s), {2} étudiant(s), {3} parent(s)', [e.enfants, e.infirmes, e.etudiants, e.parents])],
      [t('Versement assurance vie {0}', [t(PERIODES[e.frequence])]), T(e.versement)],
      [t('Versement CEA {0}', [t(PERIODES[e.frequence])]), T(e.versementCea)],
      [t('Assurance vie') + ' · ' + t('la 1re année'), T(calc.investissementAv)],
      [t('CEA') + ' · ' + t('la 1re année'), T(calc.investissementCea)], [],
      [G(t('Impôt annuel')), G('')],
      [t('Impôt total avant investissement'), T(sim.impotAvant)],
      [t('Impôt total après investissement'), T(sim.impotApres)],
      [t('Économie d\'impôt'), { f: 'B13-B14', v: Math.round(sim.economie * 1000) / 1000, s: 'tndGras' }],
      [t('Taux de réduction d\'impôt'), P(sim.tauxReduction)],
      [t('Montant optimal en assurance vie'), T(sim.optimal)]];
    if (calc.actif) syn.push([], [G(t('Projection du capital')), G('')], [t('Durée'), t('{0} ans', [e.dureeAns])], [t('Capital au terme (scénario médian)'), T(calc.med.capitalFinal)], [t('Valeur totale (capital + économie d\'impôt)'), T(calc.valeurTotale)], [t('Rendement annuel effectif, économie d\'impôt comprise'), P(calc.effectif)]);
    syn.push([], [t('Simulation indicative, non contractuelle.')]);
    feuilles.push({ nom: t('Synthèse'), lignes: syn, largeurs: [52, 30] });
    var tr = [[G(t('Tranche (TND)')), G(t('Taux')), G(t('Impôt sans inv.')), G(t('Impôt avec inv.')), G(t('Économie'))]];
    sim.avant.parTranche.forEach(function (bd, i) {
      var ad = sim.apres.parTranche[i] || { impot: 0 }, r = tr.length + 1;
      tr.push([fmtEntier(bd.min > 0 ? bd.min + 1 : 0) + (bd.max === Infinity ? ' ' + t('et plus') : ' – ' + fmtEntier(bd.max)), { v: bd.taux, s: 'pct' }, T(bd.impot), T(ad.impot), { f: 'C' + r + '-D' + r, v: Math.round((bd.impot - ad.impot) * 1000) / 1000, s: 'tnd' }]);
    });
    var n = tr.length;
    tr.push([G(t('Total')), '', { f: 'SUM(C2:C' + n + ')', s: 'tndGras' }, { f: 'SUM(D2:D' + n + ')', s: 'tndGras' }, { f: 'SUM(E2:E' + n + ')', s: 'tndGras' }]);
    feuilles.push({ nom: t('Impôt par tranche'), lignes: tr, largeurs: [26, 10, 20, 20, 18], figer: 1 });
    if (calc.actif) {
      var pr = [[G(t('Année')), G(t('Total versé')), G(t('Prudent')), G(t('Médian')), G(t('Dynamique')), G(t('Gain financier')), G(t('Capital en dinars constants'))]];
      calc.med.annees.forEach(function (a, i) {
        var r = i + 2;
        pr.push([a.annee, T(a.verse), T(calc.sc.prudent.annees[i].capital), T(a.capital), T(calc.sc.dynamique.annees[i].capital), { f: 'D' + r + '-B' + r, v: Math.round((a.capital - a.verse) * 1000) / 1000, s: 'tnd' }, T(a.capitalReel)]);
      });
      feuilles.push({ nom: t('Projection'), lignes: pr, largeurs: [8, 18, 18, 18, 18, 18, 24], figer: 1 });
    }
    if (ui.mc) {
      var mc = [[G(t('Année')), G('P10'), G('P25'), G(t('Médiane')), G('P75'), G('P90')]];
      ui.mc.annees.forEach(function (a, i) { mc.push([a, T(ui.mc.centiles.p10[i]), T(ui.mc.centiles.p25[i]), T(ui.mc.centiles.p50[i]), T(ui.mc.centiles.p75[i]), T(ui.mc.centiles.p90[i])]); });
      feuilles.push({ nom: t('Projection probabiliste'), lignes: mc, largeurs: [8, 18, 18, 18, 18, 18], figer: 1 });
    }
    if (ui.strategie) {
      var st = [[G(t('Année')), G(t('Budget')), G(t('Assurance vie')), G(t('CEA')), G(t('Économie d\'impôt'))]];
      ui.strategie.plan.forEach(function (l) { st.push([l.annee, T(l.budget), T(l.av), T(l.cea), T(l.economie)]); });
      feuilles.push({ nom: t('Stratégie optimale'), lignes: st, largeurs: [8, 18, 18, 18, 18], figer: 1 });
    }
    if (ui.scenarios.length) {
      var ms = ui.scenarios.map(function (x) { return Comp.mesurer(x.etat); });
      var sc = [[G(t('Critère'))].concat(ui.scenarios.map(function (x) { return G(nomScenario(x)); }))];
      [[t('Économie d\'impôt par an'), 'economie'], [t('Impôt total après investissement'), 'impotApres'], [t('Effort d\'épargne réel par mois'), 'effortMensuel'], [t('Capital au terme (médian)'), 'capital'], [t('Valeur totale au terme'), 'valeur']].forEach(function (lg) {
        sc.push([lg[0]].concat(ms.map(function (m) { return m[lg[1]] == null ? '—' : T(m[lg[1]]); })));
      });
      feuilles.push({ nom: t('Scénarios'), lignes: sc, largeurs: [36].concat(ms.map(function () { return 22; })), figer: 1 });
    }
    if (ui.planObjectifs && ui.objectifs.length) {
      var ob = [[G(t('Projet')), G(t('Montant visé')), G(t('Dans')), G(t('Déjà épargné')), G(t('Par mois')), G(t('Financé'))]];
      ui.planObjectifs.objectifs.forEach(function (o) { if (o.valide) ob.push([o.nom || '', T(o.montant), t('{0} ans', [o.ans]), T(o.deja), T(o.mensuel), P(o.couverture)]); });
      feuilles.push({ nom: t('Objectifs de vie'), lignes: ob, largeurs: [28, 18, 10, 18, 18, 12], figer: 1 });
    }
    var octets = window.Xlsx.classeur(feuilles, { titre: t('Simulation d\'assurance vie et de CEA') });
    telecharger('simulation-' + dateIso() + '.xlsx', new Blob([octets], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '');
    toast(t('Classeur Excel téléchargé.'));
  }
  $('export-xlsx').addEventListener('click', exporterXlsx);

  /* ===================================================================
     Import d'un relevé PDF : valeurs proposées, appliquées seulement si cochées
     =================================================================== */
  var CHAMPS_RELEVE = [
    ['tauxServi', 'Taux servi', 'p-rendement', 'pct'], ['tauxGaranti', 'Taux garanti', 'p-garanti', 'pct'],
    ['fraisGestion', 'Frais de gestion', 'p-frais', 'pct'], ['fraisVersement', 'Frais sur versement', 'p-frais-entree', 'pct'],
    ['versement', 'Versement périodique', 'investment-amount-period', 'tnd'], ['capital', 'Capital acquis (information)', null, 'tnd']
  ];
  function ouvrirDialogue(d) { if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  $('import-releve').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    $('releve-fichier').textContent = f.name;
    $('releve-liste').innerHTML = '';
    $('releve-msg').textContent = t('Lecture du document…');
    $('releve-appliquer').disabled = true;
    ouvrirDialogue($('releve'));
    f.arrayBuffer().then(window.Releve.texte).then(function (texte) {
      if (!texte) { $('releve-msg').textContent = t('Aucun texte lisible : le PDF est probablement une image scannée. Saisissez les valeurs à la main.'); return; }
      var r = window.Releve.analyser(texte);
      if (!r.trouves) { $('releve-msg').textContent = t('Aucune valeur reconnue dans ce document. Saisissez les valeurs à la main.'); return; }
      $('releve-msg').textContent = t('{0} valeur(s) reconnue(s) :', [r.trouves]);
      $('releve-liste').innerHTML = CHAMPS_RELEVE.filter(function (c) { return r[c[0]] != null; }).map(function (c) {
        var v = r[c[0]], aff = c[3] === 'pct' ? fmtPct(v) : fmtTND(v);
        return c[2] ? '<label class="case releve-ligne"><input type="checkbox" checked data-champ="' + c[2] + '" data-valeur="' + v + '"><span>' + echapper(t(c[1])) + '</span><b>' + aff + '</b></label>'
          : '<div class="releve-ligne info"><span>' + echapper(t(c[1])) + '</span><b>' + aff + '</b></div>';
      }).join('');
      $('releve-appliquer').disabled = !$('releve-liste').querySelector('input');
    }).catch(function (err) {
      $('releve-msg').textContent = err && err.message === 'format' ? t('Ce fichier n\'est pas un PDF.') : t('Lecture impossible dans ce navigateur. Saisissez les valeurs à la main.');
    });
  });
  $('releve-fermer').addEventListener('click', function () { $('releve').close(); });
  $('releve-appliquer').addEventListener('click', function () {
    var n = 0;
    Array.prototype.forEach.call($('releve-liste').querySelectorAll('input:checked'), function (c) {
      $(c.dataset.champ).value = fmtLibre(+c.dataset.valeur);
      n++;
    });
    $('releve').close();
    if (!n) return;
    synchroniserSupport();
    calculateAndDisplay();
    toast(t('{0} valeur(s) appliquée(s) depuis le relevé.', [n]));
  });

  /* ===================================================================
     Rappels de versement : notification locale (aucun serveur)
     =================================================================== */
  var CLE_CACHE_RAPPEL = 'reglages/rappel';
  function lireRappel() {
    var local = lireLocal('rappel', null);
    if (!('caches' in window)) return Promise.resolve(local);
    return caches.open('simulateur-reglages').then(function (c) { return c.match(CLE_CACHE_RAPPEL); })
      .then(function (r) { return r ? r.json() : null; })
      .then(function (c) { return c && local ? Object.assign(local, { dernier: Math.max(local.dernier || 0, c.dernier || 0) }) : (local || c); })
      .catch(function () { return local; });
  }
  function ecrireRappel(r) {
    ecrireLocal('rappel', r);
    if ('caches' in window) caches.open('simulateur-reglages').then(function (c) { return c.put(CLE_CACHE_RAPPEL, new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }
  function textesRappel(calc) {
    var e = calc ? calc.etat : null;
    var parts = [];
    if (e && e.versement > 0) parts.push(t('assurance vie {0}', [fmtTND(e.versement)]));
    if (e && e.versementCea > 0) parts.push(t('CEA {0}', [fmtTND(e.versementCea)]));
    return { titre: t('Versement d\'épargne du jour'), corps: parts.length ? t('Pensez à votre versement : {0}.', [parts.join(' · ')]) : t('Pensez à votre versement d\'épargne.') };
  }
  function notifier(titre, corps) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return Promise.resolve(false);
    var opts = { body: corps, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: 'rappel-versement' };
    var viaSw = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null);
    return viaSw.then(function (reg) {
      if (reg && reg.showNotification) return reg.showNotification(titre, opts).then(function () { return true; });
      new Notification(titre, opts);
      return true;
    }).catch(function () { return false; });
  }
  function majInfoRappel(r) {
    var p = window.Rappels.prochaine(r, new Date());
    $('rp-info').textContent = r.actif && p ? t('Prochain rappel le {0}.', [p.toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' })]) :
      t('Le rappel s\'affiche à l\'ouverture de l\'application le jour du versement, et en arrière-plan quand le navigateur le permet (application installée).');
  }
  function ouvrirRappels() {
    lireRappel().then(function (r) {
      r = r || { actif: false, jour: new Date().getDate() > 28 ? 31 : new Date().getDate() };
      var s = $('rp-jour');
      s.innerHTML = Array.apply(null, Array(28)).map(function (x, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + '</option>'; }).join('') + '<option value="31">' + echapper(t('Dernier jour du mois')) + '</option>';
      s.value = String(r.jour);
      $('rp-actif').checked = !!r.actif;
      $('rp-err').textContent = '';
      majInfoRappel(r);
      ouvrirDialogue($('rappels'));
    });
  }
  function enregistrerRappel() {
    var actif = $('rp-actif').checked;
    var r = { actif: actif, jour: +$('rp-jour').value, frequence: ui.frequence, depart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), dernier: window.Rappels.cle(new Date()) };
    Object.assign(r, textesRappel(ui.calc));
    ecrireRappel(r);
    majInfoRappel(r);
    if (actif && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg.periodicSync) return reg.periodicSync.register('rappel-versement', { minInterval: 12 * 3600 * 1000 });
      }).catch(function () {});
    }
  }
  $('rp-actif').addEventListener('change', function () {
    var cb = this;
    $('rp-err').textContent = '';
    if (!cb.checked) { enregistrerRappel(); return; }
    if (!('Notification' in window)) { cb.checked = false; $('rp-err').textContent = t('Les notifications ne sont pas disponibles dans ce navigateur : utilisez « Ajouter à l\'agenda ».'); return; }
    Promise.resolve(Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission).then(function (p) {
      if (p !== 'granted') { cb.checked = false; $('rp-err').textContent = t('Notifications refusées : autorisez-les dans les réglages du navigateur, ou utilisez « Ajouter à l\'agenda ».'); return; }
      enregistrerRappel();
      toast(t('Rappels activés.'));
    });
  });
  $('rp-jour').addEventListener('change', enregistrerRappel);
  $('rp-essai').addEventListener('click', function () {
    var x = textesRappel(ui.calc);
    notifier(x.titre, x.corps).then(function (ok) { if (!ok) $('rp-err').textContent = t('Activez d\'abord les rappels pour autoriser les notifications.'); });
  });
  $('rp-fermer').addEventListener('click', function () { $('rappels').close(); });
  $('ouvrir-rappels').addEventListener('click', ouvrirRappels);
  function verifierRappel() {
    lireRappel().then(function (r) {
      if (!r || !r.actif) return;
      var d = window.Rappels.estDu(r, new Date());
      if (!d) return;
      r.dernier = d.cle;
      Object.assign(r, textesRappel(ui.calc));
      ecrireRappel(r);
      notifier(r.titre, r.corps);
      toast(r.corps);
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) verifierRappel(); });
  setInterval(verifierRappel, 30 * 60 * 1000);

  /* ===================================================================
     Palette de commandes (Ctrl K) : actions, rubriques et saisies directes
     =================================================================== */
  var palette = { resultats: [], actif: 0, retour: null };
  function actionsPalette() {
    function clic(id) { return function () { $(id).click(); }; }
    return [
      { lib: t('Télécharger le rapport PDF'), ico: 'i-download', mots: 'rapport export imprimer', fn: exporterPdf },
      { lib: t('Proposition commerciale (PDF)'), ico: 'i-signature', mots: 'signature contrat', fn: clic('proposition') },
      { lib: t('Présenter au client'), ico: 'i-play', mots: 'diapositives plein écran', fn: ouvrirPresentation },
      { lib: t('Simulation guidée'), ico: 'i-guide', mots: 'assistant étapes', fn: ouvrirGuide },
      { lib: t('Reçu fiscal à partager'), ico: 'i-ticket', mots: 'image linkedin whatsapp', fn: ouvrirRecu },
      { lib: t('Classeur Excel'), ico: 'i-table', mots: 'xlsx tableur export', fn: exporterXlsx },
      { lib: t('Importer un relevé PDF'), ico: 'i-fichier', mots: 'contrat document', fn: clic('import-releve') },
      { lib: t('Ajouter à l\'agenda'), ico: 'i-agenda', mots: 'calendrier ics', fn: clic('agenda') },
      { lib: t('Rappels de versement'), ico: 'i-cloche', mots: 'notification', fn: ouvrirRappels },
      { lib: t('Partager la simulation'), ico: 'i-share', mots: 'lien whatsapp qr', fn: clic('partager') },
      { lib: t('Enregistrer'), ico: 'i-save', mots: 'portefeuille sauvegarder', fn: enregistrer },
      { lib: t('Ajouter la simulation actuelle'), ico: 'i-comparer', mots: 'comparer scenarios', fn: clic('scn-ajouter') },
      { lib: t('Annuler la dernière modification'), ico: 'i-annuler', mots: 'ctrl z retour', fn: function () { naviguerHist(-1); } },
      { lib: t('Rétablir la modification'), ico: 'i-retablir', mots: 'ctrl y', fn: function () { naviguerHist(1); } },
      { lib: t('Nouvelle simulation'), ico: 'i-plus', mots: 'effacer vider reinitialiser', fn: function () { appliquerEtat(Scenario.defauts()); $('revenue').focus(); } },
      { lib: t('Thème') + ' : ' + t('Clair'), ico: 'i-sun', mots: 'light jour', fn: function () { appliquerTheme('light', true); } },
      { lib: t('Thème') + ' : ' + t('Sombre'), ico: 'i-moon', mots: 'dark nuit', fn: function () { appliquerTheme('dark', true); } },
      { lib: t('Thème') + ' : ' + t('Auto'), ico: 'i-auto', mots: 'systeme', fn: function () { appliquerTheme('auto', true); } },
      { lib: 'Français', ico: 'i-globe', mots: 'langue french', fn: function () { appliquerLangue('fr'); } },
      { lib: 'English', ico: 'i-globe', mots: 'langue anglais', fn: function () { appliquerLangue('en'); } },
      { lib: 'العربية', ico: 'i-globe', mots: 'langue arabe arabic', fn: function () { appliquerLangue('ar'); } },
      { lib: t('Mode simple'), ico: 'i-boussole', mots: 'expert', fn: clic('mode-simple') },
      { lib: t('Mode conseiller'), ico: 'i-users', mots: 'client agence', fn: clic('mode-conseiller') },
      { lib: t('Verrouiller la saisie'), ico: 'i-cadenas', mots: 'bloquer', fn: clic('verrou') },
      { lib: t('Installer l\'application'), ico: 'i-phone', mots: 'pwa telephone', fn: ouvrirFenetreInstallation },
      { lib: t('Haut de page'), ico: 'i-haut', mots: 'debut', fn: function () { window.scrollTo({ top: 0, behavior: mouvementReduit.matches ? 'auto' : 'smooth' }); } }
    ];
  }
  var CHAMPS_DIRECTS = {
    revenu: ['Revenu brut annuel imposable', 'revenue', 'i-cash'], versement: ['Versement assurance vie', 'investment-amount-period', 'i-coins'],
    versementCea: ['Versement CEA', 'cea-period', 'i-chart'], duree: ['Durée', 'p-duree', 'i-calendar'], enfants: ['Enfants à charge', 'children', 'i-baby']
  };
  function resultatsPalette(q) {
    var res = [];
    window.Commandes.interpreter(q).forEach(function (s) {
      var c = CHAMPS_DIRECTS[s.champ];
      var v = s.champ === 'duree' ? t('{0} ans', [s.valeur]) : s.champ === 'enfants' ? String(s.valeur) : fmtTND(s.valeur) + (s.champ === 'versement' || s.champ === 'versementCea' ? ' ' + t(PERIODES[ui.frequence]) : '');
      res.push({ groupe: t('Saisie directe'), lib: t(c[0]) + ' : ' + v, ico: c[2], fn: function () {
        var el = $(c[1]);
        el.value = s.champ === 'duree' || s.champ === 'enfants' ? String(s.valeur) : fmtLibre(s.valeur);
        if (s.champ === 'duree' && $('p-retraite').checked) $('p-retraite').checked = false;
        if (s.champ === 'revenu') majCurseur();
        majSteppers();
        calculateAndDisplay();
        toast(t('Valeur appliquée : {0}.', [t(c[0]) + ' ' + v]));
      } });
    });
    var actions = actionsPalette().map(function (a) { return { groupe: t('Actions'), lib: a.lib, ico: a.ico, motsCles: a.mots, fn: a.fn, libelle: a.lib }; });
    var rubriques = nav.items.filter(function (it) { return it.etat !== 'absente'; }).map(function (it) {
      return { groupe: t('Rubriques'), lib: it.lib, libelle: it.lib, ico: it.btn.querySelector('use').getAttribute('href').slice(1), fn: function () { allerRubrique(it); } };
    });
    var trouves = q.trim() ? window.Commandes.chercher(rubriques.concat(actions), q) : rubriques.slice(0, 6).concat(actions.slice(0, 8));
    return res.concat(trouves.slice(0, 14));
  }
  function rendrePalette() {
    var q = $('pl-champ').value;
    var r = palette.resultats = resultatsPalette(q);
    palette.actif = Math.min(palette.actif, Math.max(0, r.length - 1));
    var html = '', groupe = null;
    r.forEach(function (x, i) {
      if (x.groupe !== groupe) { groupe = x.groupe; html += '<p class="pl-groupe" role="presentation">' + echapper(groupe) + '</p>'; }
      html += '<div class="pl-option" role="option" id="pl-o-' + i + '" data-i="' + i + '" aria-selected="' + (i === palette.actif) + '"><span class="pl-ico" aria-hidden="true"><svg class="ico ico-sm"><use href="#' + x.ico + '"/></svg></span><span class="pl-lib">' + echapper(x.lib) + '</span>' + (i === palette.actif ? '<kbd class="kbd" aria-hidden="true">Entrée</kbd>' : '') + '</div>';
    });
    if (!r.length) html = '<p class="pl-vide">' + echapper(t('Aucun résultat. Essayez « pdf », « rachat », « 60000 » ou « av 500 ».')) + '</p>';
    $('pl-liste').innerHTML = html;
    $('pl-champ').setAttribute('aria-activedescendant', r.length ? 'pl-o-' + palette.actif : '');
    var a = $('pl-o-' + palette.actif);
    if (a) a.scrollIntoView({ block: 'nearest' });
  }
  function ouvrirPalette() {
    if (ecranClient) return;
    var d = $('palette');
    palette.retour = document.activeElement;
    $('pl-champ').value = '';
    palette.actif = 0;
    rendrePalette();
    ouvrirDialogue(d);
    $('pl-champ').focus();
  }
  function fermerPalette() {
    var d = $('palette');
    if (d.open) d.close();
  }
  function executerPalette(i) {
    var x = palette.resultats[i];
    if (!x) return;
    fermerPalette();
    setTimeout(x.fn, 0);
  }
  $('ouvrir-palette').addEventListener('click', ouvrirPalette);
  $('palette').addEventListener('close', function () { if (palette.retour && palette.retour.focus && document.contains(palette.retour)) palette.retour.focus({ preventScroll: true }); });
  $('palette').addEventListener('click', function (e) { if (e.target === this) fermerPalette(); });
  $('pl-champ').addEventListener('input', function () { palette.actif = 0; rendrePalette(); });
  $('pl-champ').addEventListener('keydown', function (e) {
    var n = palette.resultats.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) { palette.actif = (palette.actif + 1) % n; rendrePalette(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { palette.actif = (palette.actif - 1 + n) % n; rendrePalette(); } }
    else if (e.key === 'Enter') { e.preventDefault(); executerPalette(palette.actif); }
  });
  $('pl-liste').addEventListener('click', function (e) { var o = e.target.closest('[data-i]'); if (o) executerPalette(+o.dataset.i); });
  $('pl-liste').addEventListener('pointermove', function (e) {
    var o = e.target.closest('[data-i]');
    if (o && +o.dataset.i !== palette.actif) { palette.actif = +o.dataset.i; rendrePalette(); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('palette').open) fermerPalette(); else if ($('presentation').hidden) ouvrirPalette();
    }
  });

  /* Lien d'évitement : focus sur le contenu sans modifier l'adresse (la partie # porte la simulation) */
  $('lien-evitement').addEventListener('click', function (e) {
    e.preventDefault();
    var c = $('contenu');
    c.focus({ preventScroll: true });
    c.scrollIntoView({ behavior: mouvementReduit.matches ? 'auto' : 'smooth', block: 'start' });
  });

  /* Raccourcis de l'application installée (manifest) : ?guide=1, ?portefeuille=1, ?nouveau=1 */
  function lancerRaccourci() {
    var params = new URLSearchParams(location.search);
    var cle = ['guide', 'portefeuille', 'nouveau'].filter(function (k) { return params.has(k); })[0];
    if (!cle) return;
    params.delete(cle);
    try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch (e) {}
    if (cle === 'guide') setTimeout(ouvrirGuide, 300);
    if (cle === 'nouveau') { appliquerEtat(Scenario.defauts()); setTimeout(function () { $('revenue').focus(); }, 300); }
    if (cle === 'portefeuille') {
      appliquerModeSimple(false);
      setTimeout(function () { $('carte-portefeuille').scrollIntoView({ block: 'start' }); }, 300);
    }
  }

  /* Espace Finances TN : pas de service worker propre à l'outil (les fichiers communs de l'Espace
     doivent rester à jour) ; on retire une éventuelle ancienne inscription. */
  if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
    navigator.serviceWorker.getRegistrations().then(function (l) {
      l.forEach(function (r) { if (r.scope.indexOf('/outils/') !== -1) r.unregister(); });
    }).catch(function () {});
  }

  /* Espace Finances TN : état et résumé pour l'enregistrement dans le compte */
  window.EspaceOutil = {
    outil: 'assurance_vie',
    etat: function () { actualiser(); return Partage.encoder(lireEtat()); },
    resume: function () {
      actualiser();
      if (!ui.calc || !(ui.calc.etat.revenu > 0)) return null;
      var r = Scenario.resume(ui.calc), e = ui.calc.etat;
      var sec = [
        { libelle: 'Épargne / an', valeur: Math.round(r.investissementAnnuel || 0), unite: 'DT' },
        { libelle: 'Réduction d\'impôt', valeur: Math.round((r.tauxReduction || 0) * 100) / 100, unite: '%' }
      ];
      if (r.capitalMedian !== null && r.capitalMedian !== undefined) sec.push({ libelle: 'Capital à ' + e.dureeAns + ' ans', valeur: Math.round(r.capitalMedian), unite: 'DT' });
      return {
        principal: { libelle: 'Économie d\'impôt par an', valeur: Math.round((r.economie || 0) * 1000) / 1000, unite: 'DT' },
        secondaires: sec,
        ligne: 'Revenu ' + Math.round(e.revenu) + ' DT · barème ' + e.annee
      };
    },
    nomParDefaut: function () {
      var e = lireEtat(), f = String(e.frequence || '').toLowerCase();
      var parts = [];
      if (e.versement > 0) parts.push('AV ' + Math.round(e.versement) + ' DT');
      if (e.versementCea > 0) parts.push('CEA ' + Math.round(e.versementCea) + ' DT');
      return (parts.length ? parts.join(' + ') + (f ? ' / ' + f : '') : 'Assurance vie & CEA') + ' · ' + e.dureeAns + ' ans';
    },
    charger: function (etatTexte) {
      var d = Partage.decoder(etatTexte);
      if (!Object.keys(d).length) return false;
      appliquerEtat(d);
      return true;
    }
  };

  /* Démarrage */
  $('annee').textContent = new Date().getFullYear();
  initialiserAnnees();
  chargerAgence();
  appliquerTheme(choixTheme());
  majCurseur();
  majSteppers();
  var langue = null;
  try { langue = localStorage.getItem('langue'); } catch (e) {}
  if (!langue) langue = (navigator.language || 'fr').slice(0, 2);
  try { if (localStorage.getItem('navReduite') === '1') reduireNav(true); } catch (e) {}
  majHauteurBarre();
  var simple = null;
  try { simple = localStorage.getItem('modeSimple'); } catch (e) {}
  appliquerModeSimple(simple === '1');
  appliquerLangue(langue, true);
  chargerDepuisLien();
  if (ecranClient) demarrerEcranClient();
  else lancerRaccourci();
  hist.ajouter(lireEtat());
  majBoutonsHist();
  setTimeout(verifierRappel, 2500);

  Port.ouvrir().then(function (d) { depot = d; return rafraichirPortefeuille(); }).catch(function () {
    $('port-vide').textContent = t('Le portefeuille n\'est pas disponible dans ce navigateur (stockage local désactivé).');
    $('enregistrer').disabled = true;
  });
})();
