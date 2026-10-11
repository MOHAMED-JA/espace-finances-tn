'use strict';
/* « Ma progression » : inflation, carrière (pouvoir d'achat sur le brut), projection, objectifs, défis, badges, rappels. */
const test = require('node:test');
const assert = require('node:assert/strict');
const OC = require('../../public/espace/js/orbite-calcul.js');
const P = require('../../public/espace/js/progression-calcul.js');

const M = new Date(2026, 9, 11);
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
function sami(extra) {
  return OC.normaliser(Object.assign(OC.profilParDefaut(), {
    prenom: 'Sami', montant: 3400, sens: 'brut', periode: 'mensuel', nombreSalaires: 12, chefDeFamille: true, enfants: 1,
    dateEmbauche: '2019-03-01', dateNaissance: '1990-05-14', baseBanque: 'brut',
    historiqueSalaire: [
      { montant: 2400, sens: 'brut', periode: 'mensuel', mois: 0, annee: 0 },
      { montant: 2650, sens: 'brut', periode: 'mensuel', mois: 3, annee: 2021 },
      { montant: 3000, sens: 'brut', periode: 'mensuel', mois: 3, annee: 2023 },
      { montant: 3400, sens: 'brut', periode: 'mensuel', mois: 3, annee: 2025 }],
    credits: [{ type: 'auto', libelle: 'Crédit auto', mensualite: 600, tauxPct: 9, dureeMois: 60, moisDebut: 3, anneeDebut: 2023 }]
  }, extra || {}));
}

test('inflation : indice cumulé entre deux années, inverse, années après la dernière connue', () => {
  proche(P.indice(2019, 2019), 1);
  proche(P.indice(2025, 2026), 1.056, 1e-9);
  proche(P.indice(2019, 2026), 1.056 * 1.07 * 1.053 * 1.093 * 1.083 * 1.057 * 1.056 / 1.056 * 1.056, 1e-9);
  proche(P.indice(2026, 2019), 1 / P.indice(2019, 2026), 1e-12);
  assert.equal(P.inflation(2030), P.INFLATION[2026], 'année future : dernière valeur connue');
  assert.equal(P.inflation(2010), null);
  assert.ok(P.PROVISOIRE[2026], '2026 provisoire signalé');
});

test('carrière : étapes datées, la première prend la date d\'embauche, bilan de la maquette', () => {
  const c = P.carriere(sami(), M);
  assert.deepEqual(c.etapes.map((e) => [e.annee, e.mois, e.brut]), [[2019, 3, 2400], [2021, 3, 2650], [2023, 3, 3000], [2025, 3, 3400]]);
  assert.equal(c.bilan.depuis, 2019);
  proche(P.pct(c.bilan.hausse), 41.7, 0.05);
  proche(P.pct(c.bilan.prix), 57.2, 0.05);
  proche(P.pct(c.bilan.pouvoirAchat), -9.9, 0.05);
  proche(c.bilan.brutPourGarder, 3772.9, 0.1);
  proche(c.bilan.manque, 372.9, 0.1);
  assert.ok(c.bilan.provisoire);
  assert.deepEqual(c.hausses.map((h) => h.verdict), ['perdu', 'perdu', 'gagne']);
  proche(P.pct(c.hausses[0].hausse), 10.4, 0.05);
  proche(P.pct(c.hausses[1].prix), 18.4, 0.05, 'prix 2022 + 2023');
  assert.ok(c.moyenneHausse > 0.045 && c.moyenneHausse < 0.05);
  assert.equal(c.annuel[0].annee, 2019);
  assert.equal(c.annuel[c.annuel.length - 1].annee, 2026);
  proche(c.annuel[0].reel, 2400);
});

test('carrière : une hausse future n\'est pas comptée, deux entrées au même mois gardent la dernière', () => {
  const p = sami();
  p.historiqueSalaire.push({ montant: 3700, sens: 'brut', periode: 'mensuel', mois: 1, annee: 2027 });
  p.historiqueSalaire.push({ montant: 3450, sens: 'brut', periode: 'mensuel', mois: 3, annee: 2025 });
  const c = P.carriere(p, M);
  assert.equal(c.etapes.length, 4);
  assert.equal(c.etapes[3].brut, 3450);
});

test('carrière : salaire net converti en brut ; sans historique, la date d\'embauche suffit ; rien sans date', () => {
  const net = P.carriere(OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 2000, sens: 'net', dateEmbauche: '2022-01-10', dateNaissance: '1992-01-01' })), M);
  assert.equal(net.etapes.length, 1);
  assert.ok(net.etapes[0].brut > 2000, 'brut supérieur au net');
  assert.ok(net.bilan.pouvoirAchat < 0, 'salaire inchangé depuis 2022 : pouvoir d\'achat en baisse');
  assert.equal(net.moyenneHausse, null);
  const vide = P.carriere(OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 2000, dateNaissance: '1992-01-01' })), M);
  assert.equal(vide.etapes.length, 0);
  assert.equal(vide.bilan, null);
});

test('projection : hausse et inflation choisies, crédits qui se terminent, capacité croissante', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const pr = P.projection(p, sy, { hausse: 0.05, inflation: 0.055, ans: 10 });
  assert.equal(pr.length, 11);
  assert.equal(pr[0].annee, 2026);
  proche(pr[0].brut, 3400);
  proche(pr[10].brut, 3400 * Math.pow(1.05, 10), 0.01);
  proche(pr[10].pouvoirAchat, Math.pow(1.05 / 1.055, 10) - 1, 1e-9);
  assert.ok(pr[10].net > pr[0].net);
  assert.ok(pr[2].capacite > pr[0].capacite, 'le crédit auto soldé en 2028 libère de la capacité');
  const plat = P.projection(p, sy, { hausse: 0, inflation: 0.055, ans: 3 });
  assert.ok(plat[3].pouvoirAchat < 0);
});

test('objectifs : normalisation (type inconnu, montants bornés, libellé, échéance)', () => {
  const o = P.normaliserObjectif({ type: 'xx', libelle: '  Voyage   à   Rome ', cible: -5, echeance: '2027-13', depart: 1e12 });
  assert.equal(o.type, 'projet');
  assert.equal(o.libelle, 'Voyage à Rome');
  assert.equal(o.cible, 0);
  assert.equal(o.depart, 1e8);
  assert.equal(o.echeance, null);
  assert.equal(P.normaliserObjectif({ type: 'projet', credit: 2 }).credit, null, 'index de crédit seulement pour le type crédit');
});

test('objectif d\'épargne : retard, rythme, effort à ajouter ou date décalée', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const o = { id: 'a', type: 'projet', libelle: 'Apport', cible: 20000, depart: 8000, echeance: '2028-06-01' };
  const v = [{ objectif: 'a', montant: 450, le: '2026-08-05' }, { objectif: 'a', montant: 450, le: '2026-09-05' }, { objectif: 'a', montant: 450, le: '2026-10-05' }];
  const e = P.etatObjectif(o, v, sy, p, M);
  assert.equal(e.etat, 'retard');
  proche(e.fait, 9350);
  proche(e.rythme, 450);
  proche(e.mensuelNecessaire, 10650 / 20);
  assert.equal(e.dateAtteinte.getFullYear(), 2028);
  assert.equal(e.dateAtteinte.getMonth(), 9);
  assert.match(e.phrase, /par mois d'ici juin 2028/);
  /* Les versements d'un autre objectif ne comptent pas. */
  assert.equal(P.etatObjectif(o, [{ objectif: 'b', montant: 5000, le: '2026-10-01' }], sy, p, M).fait, 8000);
});

test('objectif : avance, atteint, sans versement, échéance passée', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const b = { id: 'b', type: 'precaution', cible: 12000, depart: 9000, echeance: '2027-12-01' };
  assert.equal(P.etatObjectif(b, [{ objectif: 'b', montant: 1000, le: '2026-10-02' }], sy, p, M).etat, 'avance');
  const atteint = P.etatObjectif(b, [{ objectif: 'b', montant: 3000, le: '2026-10-02' }], sy, p, M);
  assert.equal(atteint.etat, 'atteint');
  assert.equal(atteint.pct, 1);
  const lancer = P.etatObjectif(b, [], sy, p, M);
  assert.equal(lancer.etat, 'a-lancer');
  assert.match(lancer.phrase, /Mettez .* de côté par mois/);
  const passe = P.etatObjectif(Object.assign({}, b, { echeance: '2026-10-01' }), [], sy, p, M);
  assert.equal(passe.etat, 'retard');
  assert.match(passe.phrase, /échéance est arrivée/);
  const sansDate = P.etatObjectif({ id: 'c', type: 'projet', cible: 1000 }, [], sy, p, M);
  assert.equal(sansDate.etat, 'ok');
  assert.equal(sansDate.mensuelNecessaire, null);
});

test('objectif impôt : seuls les versements de l\'année comptent, sans montant de départ', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const o = { id: 'i', type: 'impot', cible: 3000, depart: 999, echeance: '2026-12-31' };
  const v = [{ objectif: 'i', montant: 2000, le: '2025-12-20' }, { objectif: 'i', montant: 500, le: '2026-03-01' }];
  proche(P.etatObjectif(o, v, sy, p, M).fait, 500);
});

test('objectif crédit : progression automatique et remboursement anticipé pour solder plus tôt', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const e = P.etatObjectif({ id: 'c', type: 'credit', credit: 0, echeance: '2027-12-01' }, [], sy, p, M);
  assert.equal(e.auto, true);
  assert.equal(e.etat, 'auto');
  proche(e.cible, OC.capitalPourMensualite(600, 9, 60), 0.01);
  assert.ok(e.pct > 0.6 && e.pct < 0.7);
  proche(e.anticipe, OC.capitalPourMensualite(600, 9, sy.credits[0].restantes - 14), 0.01);
  const tenu = P.etatObjectif({ id: 'c', type: 'credit', credit: 0, echeance: '2030-01-01' }, [], sy, p, M);
  assert.match(tenu.phrase, /déjà tenu/);
  assert.equal(P.etatObjectif({ id: 'c', type: 'credit', credit: 5 }, [], sy, p, M).etat, 'introuvable');
});

test('série : mois consécutifs avec un versement (le mois en cours peut être encore vide)', () => {
  const v = (le) => ({ objectif: 'a', montant: 10, le });
  assert.equal(P.serie([v('2026-08-01'), v('2026-09-01'), v('2026-10-01')], M), 3);
  assert.equal(P.serie([v('2026-08-01'), v('2026-09-01')], M), 2, 'octobre pas encore fait');
  assert.equal(P.serie([v('2026-07-01'), v('2026-09-01'), v('2026-10-01')], M), 2, 'trou en août');
  assert.equal(P.serie([v('2026-06-01')], M), 0);
  assert.equal(P.serie([], M), 0);
});

test('défis : premier objectif, épargne du mois, assurance vie en fin d\'année, salaire à vérifier ; 3 au plus', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const premiers = P.defis(sy, p, [], [], M, null);
  assert.equal(premiers[0].id, 'premier');
  const objs = [{ id: 'a', type: 'projet', cible: 20000, depart: 8000, echeance: '2028-06-01' }];
  const v = [{ objectif: 'a', montant: 600, le: '2026-10-05' }];
  const d = P.defis(sy, p, objs, v, M, { gainPossible: 456 });
  assert.ok(d.length <= 3);
  const ep = d.find((x) => x.id === 'epargne-2026-10');
  assert.ok(ep && ep.fait, 'épargne du mois réussie');
  assert.ok(d.some((x) => x.id === 'assurance-vie-2026' && /456 DT/.test(x.detail)));
  /* Avant octobre, pas de défi d'assurance vie. */
  assert.ok(!P.defis(sy, p, objs, v, new Date(2026, 4, 10), { gainPossible: 456 }).some((x) => /assurance-vie/.test(x.id)));
});

test('badges : gagnés selon les objectifs et la série', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const aucun = P.badges([], [], sy, p, M);
  assert.ok(aucun.every((b) => !b.gagne));
  const objs = [{ id: 'b', type: 'precaution', cible: 1000, depart: 0 }];
  const v = ['2026-08-01', '2026-09-01', '2026-10-01'].map((le) => ({ objectif: 'b', montant: 400, le }));
  const g = Object.fromEntries(P.badges(objs, v, sy, p, M).map((b) => [b.id, b.gagne]));
  assert.deepEqual(g, { premier: true, serie3: true, precaution: true, atteint: true, credit: false });
});

test('rappels d\'échéance : un mois avant, type perso, email sans montant ni libellé saisi', () => {
  const objs = [
    { id: 'a1b2', type: 'projet', libelle: 'Apport 20000 DT', cible: 20000, echeance: '2028-06-01' },
    { id: 'c', type: 'credit', credit: 0, echeance: '2027-12-01' },
    { id: 'z', type: 'projet', cible: 10, echeance: '2025-01-01' },
    { id: 'y', type: 'projet', cible: 10 }];
  const r = P.rappels(objs, M);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'objectif-a1b2-2028-06-01');
  assert.equal(r[0].type, 'perso');
  assert.equal(new Date(r[0].quand).getMonth(), 4);
  assert.equal(r[0].url, '/espace/#progression?onglet=objectifs');
  const mail = JSON.stringify(r[0].mail);
  assert.doesNotMatch(mail, /DT|20000/, 'aucun montant dans l\'email');
  assert.doesNotMatch(mail, /Apport/);
});

test('rythme : un seul versement ce mois-ci compte pour un mois, pas pour trois', () => {
  const p = sami(), sy = OC.synthese(p, {}, M);
  const o = { id: 'a', type: 'projet', cible: 20000, depart: 8000, echeance: '2028-06-30' };
  const e = P.etatObjectif(o, [{ objectif: 'a', montant: 600, le: '2026-10-05' }], sy, p, M);
  proche(e.rythme, 600);
  assert.equal(e.etat, 'avance');
});
