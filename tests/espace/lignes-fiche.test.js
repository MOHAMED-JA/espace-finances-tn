'use strict';
/* Autres lignes de la fiche de paie (13 oct. 2026) : retenues sociales déductibles, versements non imposables,
   retenues sur le net, impôt aligné sur la fiche. Profil fictif. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/moteurs/salaire/calcul.js');
const P = require('../../public/moteurs/salaire/parametres.js');
const E = require('../../public/moteurs/salaire/etat.js');
const OC = require('../../public/espace/js/orbite-calcul.js');

const proche = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 0.0005), (msg || '') + ' : ' + a + ' ≠ ' + b);
const LIGNES = {
  sociales: [{ libelle: 'Retraite complémentaire', montant: 38.4 }, { libelle: 'Assurance groupe', montant: 72 }],
  gains: [{ libelle: 'Bonification crédit logement', montant: 60 }],
  nettes: [{ libelle: 'Syndicat', montant: 3 }, { libelle: 'Complément retraite', montant: 20 }, { libelle: 'Assurance auto', montant: 95 }, { libelle: 'Tickets restaurant', montant: 18 }]
};
const profil = (x) => OC.normaliser(Object.assign(OC.profilParDefaut(), { montant: 3200, sens: 'brut', periode: 'mensuel', secteur: 'prive', situation: 'marie', chefDeFamille: true, nombreSalaires: 12 }, x));

test('moteur : retenues sociales déduites du revenu imposable, versements et retenues sur le net après impôt', () => {
  const base = { montant: 3200, chefDeFamille: true, nombreSalaires: 12 };
  const sans = C.calculerDepuisBrut(base, P).annuel;
  const avec = C.calculerDepuisBrut(Object.assign({}, base, { retenuesSociales: 110.4, gainsNets: 60, retenuesNettes: 136 }), P).annuel;
  proche(avec.retenuesSociales, 110.4 * 12);
  proche(avec.revenuApresCotisations, sans.revenuApresCotisations - 110.4 * 12, 0.001, 'revenu après cotisations');
  assert.ok(avec.irpp < sans.irpp, "l'impôt baisse avec les retenues sociales");
  proche(avec.netAPayer, avec.brutTotal - avec.cotisations - avec.retenuesSociales - avec.irpp - avec.css + 60 * 12 - 136 * 12, 0.001, 'net');
  /* Coût employeur : la bonification est versée par l'employeur ; la répartition reste complète. */
  proche(avec.coutEmployeur, sans.coutEmployeur + 60 * 12, 0.001);
  const rep = C.repartitionCoutEmployeur({ annuel: avec });
  proche(rep.salarie.montant + rep.caisse.montant + rep.etat.montant, rep.total, 0.001, 'répartition');
});

test('exemple de la maquette : 3 200 DT brut, lignes de la fiche, impôt d\'Orbite puis aligné sur la fiche', () => {
  const s = OC.salaire(profil({ lignesFiche: LIGNES }));
  proche(s.resultat.annuel.cotisations / 12, 309.76);
  proche(s.resultat.annuel.irpp / 12, 549.931, 0.001, 'IRPP d\'Orbite');
  proche(s.resultat.annuel.css / 12, 12.941, 0.001, 'CSS');
  proche(s.netMensuel, 3200 - 309.76 - 110.4 - s.resultat.annuel.irpp / 12 - s.resultat.annuel.css / 12 + 60 - 136, 0.001);
  assert.equal(s.impotAligne, null);
  const a = OC.salaire(profil({ lignesFiche: LIGNES, impotFiche: { actif: true, irpp: 531.25, css: 12.941, brut: 3200 } }));
  proche(a.netMensuel, 2159.649, 0.0006, 'net de la fiche');
  proche(a.impotAligne.ecart, s.resultat.annuel.irpp / 12 + s.resultat.annuel.css / 12 - 531.25 - 12.941, 1e-9);
  proche(a.impotMois, s.impotMois, 1e-9, "l'impôt d'Orbite reste celui du barème");
  proche(a.resultat.annuel.irpp, s.resultat.annuel.irpp, 1e-9);
});

test('impôt aligné : seulement pour le brut de la fiche, salarié, interrupteur actif', () => {
  const f = { actif: true, irpp: 531.25, css: 12.941, brut: 3200 };
  assert.equal(OC.salaire(profil({ montant: 3500, impotFiche: f })).impotAligne, null, 'autre brut');
  assert.equal(OC.salaire(profil({ impotFiche: Object.assign({}, f, { actif: false }) })).impotAligne, null, 'interrupteur coupé');
  assert.equal(OC.salaire(profil({ impotFiche: Object.assign({}, f, { irpp: 0, css: 0 }) })).impotAligne, null, 'impôt non saisi');
  assert.equal(OC.salaire(profil({ activite: 'retraite', impotFiche: f })).impotAligne, undefined, 'retraité : pension');
  /* Une hausse future du salaire n'est pas alignée (autre brut). */
  const p = profil({ impotFiche: f, historiqueSalaire: [{ montant: 3200, sens: 'brut', periode: 'mensuel', mois: 0, annee: 0 }, { montant: 3600, sens: 'brut', periode: 'mensuel', mois: 1, annee: 2099 }] });
  assert.equal(OC.salaireDe(p, p.historiqueSalaire[1]).impotAligne, null);
});

test('profil : lignes normalisées (16 au plus, libellé nettoyé, montants bornés), lignes vides retirées', () => {
  const p = OC.normaliser({ lignesFiche: { sociales: Array.from({ length: 20 }, (_, i) => ({ libelle: '<b>L' + i + '</b>', montant: '10.5' })), gains: [{ libelle: '', montant: 0 }], nettes: 'x', autre: [1] },
    impotFiche: { actif: 1, irpp: -5, css: 'a', brut: 3200 } });
  assert.equal(p.lignesFiche.sociales.length, 16);
  assert.equal(p.lignesFiche.sociales[0].libelle, 'bL0/b');
  assert.equal(p.lignesFiche.sociales[0].montant, 10.5);
  assert.deepEqual(p.lignesFiche.gains, []);
  assert.deepEqual(p.lignesFiche.nettes, []);
  assert.ok(!('autre' in p.lignesFiche));
  assert.deepEqual(p.impotFiche, { actif: true, irpp: 0, css: 0, brut: 3200 });
  assert.deepEqual(OC.normaliser({}).lignesFiche, { sociales: [], gains: [], nettes: [] });
});

test('profil sans lignes : calcul identique à avant (aucune régression)', () => {
  const avant = C.calculerAvecVersements(E.versEntree(Object.assign(E.etatParDefaut(), { montant: 3200, chefDeFamille: true })), P);
  const s = OC.salaire(profil({}));
  proche(s.netMensuel, avant.versements.netMensuel, 1e-9);
  assert.equal(s.resultat.annuel.retenuesNettes, 0);
});

test('liens de partage : les lignes de la fiche n\'y passent jamais', () => {
  const e = Object.assign(E.etatParDefaut(), { montant: 3200, retenuesSociales: 110.4, gainsNets: 60, retenuesNettes: 136, ajustementImpot: 18 });
  const lien = E.encoder(e);
  assert.ok(!/110|136|ajust|retenue|gain/i.test(lien), lien);
  const d = E.decoder(lien).a;
  assert.ok(!d.retenuesSociales && !d.retenuesNettes && !d.gainsNets);
});

test('contrôle de la fiche : il compare au barème seul, sans les lignes ni l\'impôt aligné du profil', () => {
  const F = require('../../public/espace/js/fiche-calcul.js');
  const p = profil({ lignesFiche: LIGNES, impotFiche: { actif: true, irpp: 531.25, css: 12.941, brut: 3200 } });
  const r = F.controle({ brut: 3200, secteur: 'prive' }, p, {});
  const nu = F.controle({ brut: 3200, secteur: 'prive' }, profil({}), {});
  assert.deepEqual(r.orbite, nu.orbite);
});

/* ---------- Lignes datées (maquette validée le 13 oct. 2026) ---------- */
const NETTES = [{ libelle: 'Syndicat', montant: 3 }, { libelle: 'Assurance auto', montant: 95 }, { libelle: 'Tickets restaurant', montant: 18 }];

test('lignes datées : un nouveau montant ferme l\'ancienne ligne et en ouvre une autre ; correction sans date', () => {
  const l = OC.ficheChanger(NETTES, 1, 102, '2026-10');
  assert.deepEqual(l.map((x) => [x.libelle, x.montant, x.debut, x.fin]), [['Syndicat', 3, '', ''], ['Assurance auto', 95, '', '2026-09'], ['Assurance auto', 102, '2026-10', ''], ['Tickets restaurant', 18, '', '']]);
  assert.equal(NETTES[1].montant, 95, 'liste d\'origine intacte');
  assert.equal(OC.ficheChanger(NETTES, 1, 102, '')[1].montant, 102, 'correction');
  /* Nouveau changement à venir sur la ligne en cours, puis annulé. */
  const f = OC.ficheChanger(l, 2, 110, '2027-01');
  assert.deepEqual(f.filter((x) => x.libelle === 'Assurance auto').map((x) => [x.montant, x.debut, x.fin]), [[95, '', '2026-09'], [102, '2026-10', '2026-12'], [110, '2027-01', '']]);
  assert.deepEqual(OC.ficheAnnulerFutur(f, 2).filter((x) => x.libelle === 'Assurance auto').map((x) => [x.montant, x.fin]), [[95, '2026-09'], [102, '']]);
});

test('lignes datées : retrait à partir d\'un mois, erreur supprimée, vue du profil', () => {
  const r = OC.ficheRetirer(NETTES, 2, '2027-01');
  assert.equal(r[2].fin, '2026-12');
  assert.equal(OC.ficheRetirer(NETTES, 2, '').length, 2);
  const l = OC.ficheChanger(r, 1, 102, '2026-10');
  const vue = OC.ficheVue(l, '2026-10');
  assert.deepEqual(vue.visibles.map((v) => [v.ligne.libelle, v.ligne.montant, v.avant && v.avant.montant]), [['Syndicat', 3, null], ['Assurance auto', 102, 95], ['Tickets restaurant', 18, null]]);
  assert.equal(vue.terminees.length, 1);
  /* Changement à venir : montré sur la ligne en cours, pas comme une ligne de plus. */
  const v2 = OC.ficheVue(OC.ficheChanger(NETTES, 1, 110, '2027-01'), '2026-10');
  assert.equal(v2.visibles.length, 3);
  assert.equal(v2.visibles[1].suivante.montant, 110);
});

test('lignes datées : chaque mois garde ses montants (paie de l\'année, impôt de l\'année)', () => {
  const E = require('../../public/espace/js/expert-calcul.js');
  const nettes = OC.ficheChanger(NETTES, 1, 102, '2026-10');
  const p = profil({ lignesFiche: { nettes } });
  const M = new Date(2026, 9, 13);
  assert.equal(OC.lignesAuMois(p, 2026, 8).nettes.reduce((t, x) => t + x.montant, 0), 116);
  assert.equal(OC.lignesAuMois(p, 2026, 9).nettes.reduce((t, x) => t + x.montant, 0), 123);
  const pa = E.paieAnnee({ profil: p, maintenant: M });
  proche(pa.lignes[8].net - pa.lignes[9].net, 7, 0.0005, 'septembre → octobre : 7 DT de retenue en plus');
  proche(pa.lignes[0].net, pa.lignes[8].net, 0.0005, 'janvier = septembre');
  const sa = OC.salaireAnnee(p, M);
  assert.ok(sa && sa.varie, 'année calculée mois par mois');
  proche(sa.parMois[9].netMensuel, OC.salaire(OC.profilAuMois(p, 2026, 9)).netMensuel, 1e-9);
  /* Le mois en cours suit la ligne du mois : octobre. */
  proche(OC.salaire(OC.profilAuMois(p, 2026, 9)).netMensuel, OC.salaire(profil({ lignesFiche: { nettes: [{ libelle: 'x', montant: 123 }] } })).netMensuel, 1e-9);
});

test('lignes datées : dates invalides ou incohérentes écartées par le profil', () => {
  const p = OC.normaliser({ lignesFiche: { nettes: [{ libelle: 'A', montant: 5, debut: '2026-13' }, { libelle: 'B', montant: 5, debut: '2026-10', fin: '2026-09' }, { libelle: 'C', montant: 5, debut: '2026-01', fin: '2026-12' }] } });
  assert.deepEqual(p.lignesFiche.nettes.map((x) => [x.libelle, x.debut, x.fin]), [['A', '', ''], ['C', '2026-01', '2026-12']]);
});
