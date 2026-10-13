'use strict';
/* Lot 7 « Lire ma fiche de paie » : montants tunisiens, repérage des lignes, total qui tombe juste, contrôle
 * face au calcul d'Orbite, mise à jour du profil. Fiches fictives uniquement. */
const test = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../../public/espace/js/fiche-calcul.js');
const FL = require('../../public/espace/js/fiche-lecture.js');
const OC = require('../../public/espace/js/orbite-calcul.js');

const proche = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const OCT = new Date(2026, 9, 11);
/* La fiche fictive de la maquette (e2e/fixtures/fiche-paie.html), telle que le PDF est lu. */
const FICHE = [
  'SOCIÉTÉ EXEMPLE SARL  Bulletin de paie', 'Zone industrielle, Tunis  Période : Octobre 2026',
  'Nom : Salariée Fictive  Matricule : 0042', "Date d'entrée : 01/09/2014  Catégorie : Cadre",
  'Situation familiale : Célibataire  Enfants à charge : 0', 'RUBRIQUE  BASE  TAUX  GAINS  RETENUES',
  'Salaire de base  26,00  2 700,000', 'Prime de transport  300,000', 'Salaire brut  3 000,000',
  'Retenue CNSS  3 000,000  9,68 %  290,400', 'Salaire imposable  2 709,600', 'IRPP  555,000',
  'CSS  0,5 %  12,715', 'Total retenues  858,115', 'Net à payer  2 141,885',
  'CNSS part patronale 16,57 % : 497,100 · Congés acquis : 2,5 jours'
].join('\n');

/* Fiche construite avec le calcul d'Orbite lui-même (doit être jugée cohérente). */
function ficheExacte(profil, base, primes) {
  const s = OC.salaire(OC.normaliser(Object.assign(OC.profilParDefaut(), profil, { montant: base, sens: 'brut', periode: 'mensuel', primesImposables: primes })));
  const a = s.resultat.annuel, f = (v) => (v / 12).toFixed(3).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return { s, lignes: ['Bulletin de paie du mois de mars 2026', 'Salaire de base  ' + f(base * 12), 'Prime de rendement  ' + f(primes * 12),
    'Total brut  ' + f(a.brutTotal), 'Cotisations sociales  ' + f(a.cotisations), 'Retenue à la source IRPP  ' + f(a.irpp),
    'Contribution sociale de solidarité  ' + f(a.css), 'Net à payer  ' + f(a.netAPayer)] };
}

test('montants : formats tunisiens, millimes, milliers, pourcentages et faux nombres écartés', () => {
  const cas = { '2 700,000': 2700, '2.700,000': 2700, '2,700.000': 2700, '2700.000': 2700, '290,400': 290.4, '290,4 DT': 290.4,
    '12,715': 12.715, '3 000': 3000, '1.250.000': 1250, '3000000': 3000, '3.000.000': 3000, '25000': 25000, '-50,000': -50, '2 7OO,000': 2700, '555': 555, '2 141,885 TND': 2141.885 };
  for (const [t, v] of Object.entries(cas)) proche(FC.montant(t), v);
  proche(FC.montant('18 261,630'), 18261.63);
  for (const t of ['9,68 %', '9,18 261,630', '18 26,5', 'abc', '', '2,,5', '12 34']) assert.equal(FC.montant(t), null, t);
});

test('fiche du privé : chaque valeur avec son texte d\'origine, total qui tombe juste', () => {
  const r = FC.analyser(FICHE, OCT), c = r.champs;
  assert.deepEqual(c.mois.valeur, { mois: 10, annee: 2026 });
  assert.equal(c.mois.source, 'Période : Octobre 2026');
  assert.deepEqual([c.brut.valeur, c.base.valeur, c.primesImposables.valeur, c.cotisations.valeur, c.irpp.valeur, c.css.valeur, c.net.valeur],
    [3000, 2700, 300, 290.4, 555, 12.715, 2141.885]);
  assert.equal(c.caisse.valeur, 'CNSS');
  assert.equal(c.caisse.secteur, 'prive');
  assert.equal(c.dateEmbauche.valeur, '2014-09-01');
  assert.equal(c.dateEmbauche.source, "Date d'entrée : 01/09/2014");
  assert.equal(c.primesImposables.source, 'Prime de transport   300,000');
  assert.equal(r.coherent, true);
  assert.equal(r.lisible, true);
  assert.deepEqual(r.famille, { enfants: 0, situation: 'celibataire' });
  assert.ok(Object.values(c).every((x) => x.etat === 'lu'), 'tout est lu');
});

test('contrôle : l\'écart d\'IRPP de la maquette (19,999 DT) et ses pistes', () => {
  const r = FC.analyser(FICHE, OCT), k = FC.controle(FC.valeurs(r.champs), OC.profilParDefaut(), r.famille);
  assert.equal(k.etat, 'ecart');
  assert.equal(k.titre, "Un écart sur l'impôt");
  assert.equal(k.texte, "Votre fiche retient 19,999 DT d'IRPP de plus que le calcul d'Orbite.");
  const l = Object.fromEntries(k.lignes.map((x) => [x.cle, x]));
  assert.equal(l.cotisations.ok, true); assert.equal(l.css.ok, true);
  proche(l.irpp.orbite, 535.001); proche(l.net.orbite, 2161.884);
  assert.equal(l.irpp.ok, false); assert.equal(l.net.ok, false);
  assert.ok(k.pistes.some((p) => /régularisation/.test(p)));
  /* Profil chef de famille avec 2 enfants : la fiche (0 enfant) l'explique. */
  const k2 = FC.controle(FC.valeurs(r.champs), Object.assign(OC.profilParDefaut(), { chefDeFamille: true, enfants: 2 }), r.famille);
  assert.ok(k2.pistes[0].startsWith('Votre fiche compte 0 enfant à charge, votre profil 2'));
  assert.ok(k2.pistes.some((p) => /Votre employeur sait-il/.test(p)));
});

test('fiche calculée par Orbite : jugée cohérente, à moins de 1 DT près', () => {
  const profil = { chefDeFamille: true, enfants: 2 };
  const { s, lignes } = ficheExacte(profil, 1850, 150);
  const r = FC.analyser(lignes.join('\n'), OCT);
  assert.equal(r.coherent, true);
  assert.deepEqual(r.champs.mois.valeur, { mois: 3, annee: 2026 });
  const k = FC.controle(FC.valeurs(r.champs), Object.assign(OC.profilParDefaut(), profil), r.famille);
  assert.equal(k.etat, 'coherent');
  assert.equal(k.titre, 'Votre fiche est cohérente');
  assert.ok(k.lignes.every((l) => l.ok));
  proche(k.orbite.net, s.netMensuel, 0.001);
});

test('contrôle sans retenue ni net : « rien à comparer », jamais « cohérente »', () => {
  const k = FC.controle({ brut: 2500, primesImposables: 0 }, OC.profilParDefaut(), {});
  assert.equal(k.etat, 'incomplet');
  assert.equal(k.lignes.length, 0);
  assert.equal(FC.controle({}, OC.profilParDefaut(), {}).possible, false);
});

test('secteur public : CNRPS sur trois lignes additionnées, colonnes patronales ignorées', () => {
  const p = Object.assign(OC.profilParDefaut(), { secteur: 'public', montant: 2000, primesImposables: 400 });
  const a = OC.salaire(OC.normaliser(p)).resultat.annuel, m = (v) => (v / 12).toFixed(3).replace('.', ',');
  const lignes = ['Ministère fictif — État de salaire  Mois : 05/2026', 'Traitement de base  2000,000', 'Indemnité de rendement  400,000', 'Total brut  2400,000',
    'Retenue CNRPS retraite  2400,000  9,20 %  220,800  14,50 %  348,000', 'CNAM assurance maladie  2400,000  2,75 %  66,000  4,00 %  96,000', 'Capital décès  2400,000  1 %  24,000',
    'IRPP  ' + m(a.irpp), 'CSS  ' + m(a.css), 'Net à payer  ' + m(a.netAPayer)];
  const r = FC.analyser(lignes.join('\n'), OCT);
  assert.equal(r.champs.caisse.valeur, 'CNRPS');
  assert.equal(r.champs.caisse.secteur, 'public');
  proche(r.champs.cotisations.valeur, 310.8);
  assert.deepEqual(r.champs.mois.valeur, { mois: 5, annee: 2026 });
  assert.equal(r.coherent, true);
  const k = FC.controle(FC.valeurs(r.champs), OC.profilParDefaut(), r.famille);
  assert.equal(k.etat, 'coherent', JSON.stringify(k.lignes));
  assert.equal(k.lignes[0].libelle, 'Cotisations CNRPS');
});

test('photo peu nette : le total juste confirme les chiffres, sinon « à vérifier » et une alerte', () => {
  const lignes = FC.versLignes(FICHE).map((l) => /^Net|^Salaire brut/.test(l.texte) ? Object.assign(l, { confiances: l.cellules.map(() => 0.45) }) : l);
  const ok = FC.analyser(lignes, OCT);
  assert.equal(ok.champs.net.etat, 'lu');
  assert.equal(ok.champs.brut.etat, 'lu');
  const faux = FC.versLignes(FICHE.replace('2 141,885', '2 147,885')).map((l) => /^Net/.test(l.texte) ? Object.assign(l, { confiances: [0.95, 0.5] }) : l);
  const r = FC.analyser(faux, OCT);
  assert.equal(r.coherent, false);
  assert.equal(r.champs.net.etat, 'verifier');
  assert.equal(r.champs.irpp.etat, 'lu');
  assert.ok(r.alertes[0].includes('ne tombent pas juste'));
});

test('autres retenues (avance) et indemnité non imposable : le net est contrôlé hors de ces lignes', () => {
  const { s, lignes } = ficheExacte({}, 2200, 0);
  const net = s.netMensuel - 150 + 80, f = (v) => v.toFixed(3).replace('.', ',');
  const l2 = lignes.filter((l) => !/^Prime|^Net/.test(l)).concat(['Indemnité kilométrique (non imposable)  80,000', 'Avance sur salaire  150,000', 'Net à payer  ' + f(net)]);
  const r = FC.analyser(l2.join('\n'), OCT), v = FC.valeurs(r.champs);
  assert.equal(r.coherent, true, JSON.stringify(r.alertes));
  proche(v.autresRetenues, 150); proche(v.indemnitesNonImposables, 80);
  assert.ok(!v.primesImposables, 'aucune prime imposable');
  const k = FC.controle(v, OC.profilParDefaut(), r.famille);
  assert.equal(k.etat, 'coherent', JSON.stringify(k.lignes));
});

test('brut absent, base absente, gains non reconnus : déduits et marqués « calculé »', () => {
  const sansBrut = FC.analyser('Salaire de base  2 000,000\nPrime de présence  150,000\nNet à payer  1 700,000', OCT);
  assert.equal(sansBrut.champs.brut.valeur, 2150);
  assert.equal(sansBrut.champs.brut.etat, 'calcule');
  const sansBase = FC.analyser('Salaire brut  2 500,000\nPrime de panier  100,000\nNet à payer  1 990,000', OCT);
  assert.equal(sansBase.champs.base.valeur, 2400);
  assert.equal(sansBase.champs.base.etat, 'calcule');
  const inconnu = FC.analyser('Salaire de base  2 000,000\nSursalaire familial divers  50,000\nHS 125 %  12 h  130,000\nSalaire brut  2 180,000', OCT);
  proche(inconnu.champs.primesImposables.valeur, 180);
  assert.equal(inconnu.champs.primesImposables.etat, 'calcule');
  assert.ok(inconnu.primes.some((p) => p.libelle === 'Autres éléments du brut' && Math.abs(p.montant - 130) < 0.001));
  assert.equal(FC.analyser('Bonjour\nMerci de votre visite', OCT).lisible, false);
});

test('mois de la fiche : « Période du … au … », « Paie 09/2026 », « Sept. 2026 »', () => {
  assert.deepEqual(FC.analyser('Période du 01/03/2026 au 31/03/2026\nSalaire brut  1 000,000', OCT).champs.mois.valeur, { mois: 3, annee: 2026 });
  assert.deepEqual(FC.analyser('Paie du mois : 09/2026\nSalaire brut  1 000,000', OCT).champs.mois.valeur, { mois: 9, annee: 2026 });
  assert.deepEqual(FC.analyser('Bulletin de paie  Sept. 2026\nSalaire brut  1 000,000', OCT).champs.mois.valeur, { mois: 9, annee: 2026 });
  assert.equal(FC.analyser("Date d'embauche : 31/02/2020\nSalaire brut  1 000,000", OCT).champs.dateEmbauche, undefined, 'date impossible écartée');
});

test('appliquer : salaire de base et primes, entrée d\'historique au mois de la fiche, caisse et date d\'embauche', () => {
  const r = FC.analyser(FICHE, OCT), v = FC.valeurs(r.champs);
  const profil = OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 2500, sens: 'brut', periode: 'mensuel', secteur: 'public', dateEmbauche: '' }));
  const a = FC.appliquer(v, { salaire: true, caisse: true, dateEmbauche: true }, profil, OCT);
  assert.equal(a.partiel.montant, 2700);
  assert.equal(a.partiel.primesImposables, 300);
  assert.equal(a.partiel.secteur, 'prive');
  assert.equal(a.partiel.dateEmbauche, '2014-09-01');
  assert.deepEqual(a.partiel.historiqueSalaire.map((h) => [h.montant, h.mois, h.annee]), [[2500, 0, 0], [2700, 10, 2026]]);
  assert.deepEqual(a.resume, ['salaire de base 2 700,000 DT brut depuis octobre 2026', 'primes 300,000 DT par mois', 'secteur privé (CNSS)', "date d'embauche"]);
  /* Le profil mis à jour retrouve le brut et les retenues de la fiche. */
  const s = OC.salaire(OC.normaliser(Object.assign({}, profil, a.partiel)));
  proche(s.brutMensuel, 3000); proche(s.cotisations / 12, 290.4);
  /* Primes décochées : le salaire de base change, les primes du profil restent. */
  const sansPrimes = FC.appliquer(v, { salaire: true, primes: false }, Object.assign({}, profil, { primesImposables: 120 }), OCT);
  assert.equal(sansPrimes.partiel.montant, 2700);
  assert.equal('primesImposables' in sansPrimes.partiel, false);
  assert.deepEqual(sansPrimes.resume, ['salaire de base 2 700,000 DT brut depuis octobre 2026']);
  /* Même salaire de base déjà en vigueur ce mois-là : pas d'entrée d'historique en double. */
  const pareil = OC.normaliser(Object.assign({}, profil, { montant: 2700, primesImposables: 300 }));
  const rien = FC.appliquer(v, { salaire: true }, pareil, OCT);
  assert.equal('historiqueSalaire' in rien.partiel, false);
  assert.deepEqual(rien.resume, []);
  /* Rien de coché : rien ne change. */
  assert.equal(FC.appliquer(v, {}, profil, OCT).vide, true);
  /* Fiche d'un mois passé : l'historique garde le salaire plus récent en vigueur. */
  const p2 = OC.normaliser(Object.assign({}, profil, { historiqueSalaire: [{ montant: 2500, sens: 'brut', periode: 'mensuel', mois: 0, annee: 0 }, { montant: 2900, sens: 'brut', periode: 'mensuel', mois: 9, annee: 2026 }] }));
  const vieux = FC.appliquer(Object.assign({}, v, { mois: { mois: 6, annee: 2026 } }), { salaire: true }, p2, OCT);
  assert.equal(vieux.partiel.montant, 2900);
  assert.deepEqual(vieux.partiel.historiqueSalaire.map((h) => h.mois), [0, 6, 9]);
});

test('lecture : lignes reconstruites par position (PDF), cellules séparées par un grand espace', () => {
  const it = (x, y, texte, l = 40) => ({ x, y, l, h: 10, texte, conf: 1 });
  const lignes = FL.lignesDepuisItems([it(400, 101, '290,400'), it(10, 100, 'Retenue', 45), it(58, 100, 'CNSS', 30), it(300, 100.5, '9,68 %'),
    it(10, 120, 'IRPP', 30), it(400, 121, '555,000')]);
  assert.deepEqual(lignes.map((l) => l.cellules), [['Retenue CNSS', '9,68 %', '290,400'], ['IRPP', '555,000']]);
  assert.ok(FL.estPdf({ name: 'fiche.PDF', type: '' }) && FL.estImage({ name: 'x', type: 'image/jpeg' }) && !FL.estImage({ name: 'a.txt', type: 'text/plain' }));
});

/* ---------- Autres lignes de la fiche (13 oct. 2026) : lues, rangées, reprises dans le profil. Fiche fictive. ---------- */
const AUTRES = ['Bulletin de paie  Période : Octobre 2026', 'Salaire de base  3 000,000', 'Salaire brut  3 000,000',
  'Retenue CNSS  3 000,000  9,68 %  290,400', 'CAVIS  38,400', 'Assurance groupe  72,000', 'IRPP  480,000', 'CSS  0,5 %  13,000',
  'Bonification crédit logement  60,000', 'Cotisation syndicale  3,000', 'Assurance auto  95,000', 'Prêt exceptionnel  350,000',
  'Net à payer  1 718,200'].join('\n');

test('autres lignes : rangées par groupe (impôt, versement, net, crédit) et total qui tombe juste', () => {
  const r = FC.analyser(AUTRES, OCT);
  assert.deepEqual(r.autres.map((x) => [x.libelle, x.montant, x.groupe]), [
    ['CAVIS', 38.4, 'sociales'], ['Assurance groupe', 72, 'sociales'], ['Bonification crédit logement', 60, 'gains'],
    ['Cotisation syndicale', 3, 'nettes'], ['Assurance auto', 95, 'nettes'], ['Prêt exceptionnel', 350, 'credit']]);
  assert.equal(r.coherent, true, JSON.stringify(r.alertes));
  const v = FC.valeurs(r.champs);
  proche(v.cotisations, 290.4); proche(v.gains, 60); proche(v.autresRetenues, 558.4);
  assert.equal(FC.groupeAutre('retraite complementaire'), 'sociales');
  assert.equal(FC.groupeAutre('complement retraite'), 'nettes');
});

test('autres lignes : contrôle avec les retenues déduites de l\'impôt, puis profil mis à jour (lignes, crédit, impôt aligné)', () => {
  const r = FC.analyser(AUTRES, OCT), v = FC.valeurs(r.champs);
  delete v.autresRetenues;
  Object.assign(v, { sociales: 110.4, nettes: 98 + 350, gains: 60, autres: r.autres.map(({ libelle, montant, groupe }) => ({ libelle, montant, groupe })) });
  const profil = OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 3000, sens: 'brut', periode: 'mensuel', secteur: 'prive' }));
  const k = FC.controle(v, profil, r.famille);
  /* Les retenues sociales baissent l'impôt d'Orbite comme celui de la fiche ; le net tient compte de toutes les lignes. */
  const sans = FC.controle(Object.assign({}, v, { sociales: 0 }), profil, r.famille);
  assert.ok(k.orbite.irpp < sans.orbite.irpp, 'IRPP calculé avec les retenues sociales');
  const ap = FC.appliquer(v, { salaire: true, primes: true, autres: true, credit: true, impot: true }, profil, OCT);
  const lf = ap.partiel.lignesFiche;
  assert.deepEqual(lf.sociales.map((x) => x.libelle), ['CAVIS', 'Assurance groupe']);
  assert.deepEqual(lf.gains.map((x) => x.montant), [60]);
  assert.deepEqual(lf.nettes.map((x) => x.libelle), ['Cotisation syndicale', 'Assurance auto']);
  assert.ok(ap.partiel.credits.some((c) => c.libelle === 'Prêt exceptionnel' && c.mensualite === 350), 'prêt ajouté aux crédits');
  assert.deepEqual(ap.partiel.impotFiche, { actif: true, irpp: 480, css: 13, brut: 3000 });
  /* Net d'Orbite avec ces réglages = net de la fiche avant le prêt. */
  const n = FC.netApres(v, ap.partiel, profil, 350);
  assert.ok(n.egal, JSON.stringify(n));
  /* Sans « crédit » : le prêt reste hors du profil. Une ligne déjà là, autre montant : changement daté du mois de la fiche. */
  const p2 = OC.normaliser(Object.assign({}, profil, { lignesFiche: { sociales: [{ libelle: 'Cavis', montant: 30 }] } }));
  const ap2 = FC.appliquer(v, { autres: true }, p2, OCT);
  assert.ok(!ap2.partiel.credits);
  const cav = ap2.partiel.lignesFiche.sociales.filter((x) => /cavis/i.test(x.libelle));
  assert.deepEqual(cav.map((x) => [x.montant, x.debut, x.fin]), [[30, '', '2026-09'], [38.4, '2026-10', '']]);
  /* Aperçu avant → après : une ligne pour les autres lignes, les crédits et l'impôt. */
  const L = FC.apercu(v, profil, OCT).map((l) => l.cle);
  assert.ok(['autres', 'credit', 'impot'].every((c) => L.includes(c)), JSON.stringify(L));
  /* Mois inhabituel (brut différent du salaire repris) : l'impôt n'est pas aligné. */
  assert.ok(!FC.appliquer(Object.assign({}, v, { brut: 3500, base: 3000 }), { impot: true }, profil, OCT).partiel.impotFiche);
});
