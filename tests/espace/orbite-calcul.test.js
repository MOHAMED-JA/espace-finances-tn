const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("../../public/espace/js/orbite-calcul.js");
const C = require("../../public/moteurs/salaire/calcul.js");
const P = require("../../public/moteurs/salaire/parametres.js");
const MC = require("../../public/moteurs/credit/credit.js");

const proche = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) <= tol, a + " ≠ " + b);
const BASE = { montant: 2500, chefDeFamille: true, enfants: 2, anneeNaissance: 1991 };
const MAINTENANT = new Date("2026-10-08T12:00:00");

test("normaliser : valeurs hors bornes ramenées, listes nettoyées", () => {
  const p = O.normaliser({ montant: -5, nombreSalaires: 40, enfants: 99, parents: 5, sens: "x", credits: [{ mensualite: "abc", type: "zzz", libelle: "<b>x</b>" }], projets: [{ type: "fusée", montant: 1e12 }] });
  assert.equal(p.montant, 0);
  assert.equal(p.nombreSalaires, 18);
  assert.equal(p.enfants, 15);
  assert.equal(p.parents, 2);
  assert.equal(p.sens, "brut");
  assert.equal(p.credits[0].mensualite, 0);
  assert.equal(p.credits[0].type, "autre");
  assert.ok(!/[<>]/.test(p.credits[0].libelle));
  assert.equal(p.projets[0].type, "autre");
  assert.equal(p.projets[0].montant, 1e8);
});

test("salaire : net identique au moteur de salaire (2 500 DT brut, chef, 2 enfants)", () => {
  const s = O.synthese(BASE, {}, MAINTENANT).salaire;
  proche(s.netMensuel, 1862.018);
  const r = C.calculerDepuisBrut({ montant: 2500, periode: "mensuel", secteur: "prive", chefDeFamille: true, enfants: 2 }, P);
  proche(s.irpp, r.annuel.irpp);
  assert.equal(s.tranche.taux, 0.30);
});

test("salaire : saisie en net retrouve le brut", () => {
  const s = O.synthese({ ...BASE, montant: 1862.018, sens: "net" }, {}, MAINTENANT).salaire;
  proche(s.brutMensuel, 2500, 0.01);
});

test("tranche : bornes du barème", () => {
  assert.equal(O.tranche(4000).taux, 0);
  assert.equal(O.tranche(5000).taux, 0);
  assert.equal(O.tranche(5000.01).taux, 0.15);
  const t = O.tranche(24596);
  assert.equal(t.taux, 0.30);
  assert.equal(t.tauxSuivant, 0.33);
  proche(t.resteAvantSuivante, 30000 - 24596);
  assert.equal(O.tranche(90000).a, null);
});

test("augmentation : reste dans la tranche, puis change de tranche", () => {
  const petite = O.augmentation(BASE, "brut", 100);
  assert.equal(petite.changeTranche, false);
  assert.ok(petite.margeAvantTranche > 100);
  const grande = O.augmentation(BASE, "brut", 800);
  assert.equal(grande.changeTranche, true);
  assert.equal(grande.trancheAvant.taux, 0.30);
  assert.equal(grande.trancheApres.taux, 0.33);
  proche(grande.partAuNouveauTaux, grande.revenuImposableApres - 30000);
  /* La marge calculée amène exactement au seuil de la tranche suivante */
  const auSeuil = O.augmentation(BASE, "brut", petite.margeAvantTranche - 0.01);
  const auDela = O.augmentation(BASE, "brut", petite.margeAvantTranche + 0.5);
  assert.equal(auSeuil.changeTranche, false);
  assert.equal(auDela.changeTranche, true);
});

test("augmentation : modes pourcent et net cohérents avec le moteur", () => {
  const a = O.augmentation(BASE, "pourcent", 10);
  proche(a.hausseBase, 250, 0.01);
  const n = O.augmentation(BASE, "net", 200);
  proche(n.calcul.hausseNet, 200, 0.01);
});

test("capacité : 40 % du net et du brut, crédits en cours déduits, mêmes chiffres que le moteur crédit", () => {
  const sy = O.synthese({ ...BASE, credits: [{ mensualite: 300, moisRestants: 24 }] }, {}, MAINTENANT);
  proche(sy.capacite.net.mensualiteMax, sy.salaire.netMensuel * 0.4 - 300);
  proche(sy.capacite.brut.mensualiteMax, sy.salaire.brutMensuel * 0.4 - 300);
  assert.equal(sy.capacite.meilleure, "brut");
  const immo = sy.capacite.net.credits[0];
  const ref = MC.capaciteEmprunt({ base: "net", revenuNet: sy.salaire.netMensuel, quotite: 0.4, charges: 300, dureeMois: 240, tauxAnnuelPct: 10, ageActuel: 35, ageMax: 70 });
  proche(immo.capital, ref.capital, 0.01);
});

test("capacité : durée limitée par l'âge (fin à 70 ans)", () => {
  const sy = O.synthese({ ...BASE, anneeNaissance: 1964 }, {}, MAINTENANT);
  const immo = sy.capacite.net.credits[0];
  assert.equal(immo.dureeMois, (70 - 62) * 12);
  assert.equal(immo.dureeLimitee, true);
});

test("épargne : trois propositions, économie croissante, contrats existants pris en compte", () => {
  const sy = O.synthese(BASE, {}, MAINTENANT);
  const props = sy.epargne.propositions;
  assert.deepEqual(props.map((x) => x.cle), ["prudente", "equilibree", "optimale"]);
  assert.ok(props[0].economieAnnuelle < props[1].economieAnnuelle && props[1].economieAnnuelle < props[2].economieAnnuelle);
  props.forEach((x) => assert.ok(x.coutReelMensuel < x.versementMensuel && x.capital > x.versementAnnuel * 10));
  const avec = O.synthese({ ...BASE, contrats: [{ type: "av", versementMensuel: 200 }] }, {}, MAINTENANT);
  assert.ok(avec.epargne.economieContrats > 0);
  assert.ok(avec.epargne.complementAnnuel < sy.epargne.complementAnnuel);
  assert.ok(avec.epargne.propositions[1].economieAnnuelle <= props[1].economieAnnuelle + 1e-9);
});

test("épargne : petit revenu sans impôt → pas de proposition « optimale »", () => {
  const sy = O.synthese({ montant: 420 }, {}, MAINTENANT);
  assert.equal(sy.salaire.irpp, 0);
  assert.equal(sy.epargne.propositions.length, 2);
  sy.epargne.propositions.forEach((x) => assert.equal(x.economieAnnuelle, 0));
});

test("budget : parts, reste à vivre et alertes", () => {
  const b = O.budget(2000, 900, 800, 400);
  proche(b.reste, -100);
  assert.equal(b.alerte, "deficit");
  const c = O.budget(2000, 900, 200, 100);
  assert.equal(c.alerte, "endettement");
  const d = O.budget(2000, 300, 500, 200);
  assert.equal(d.alerte, null);
  proche(d.parts.credits + d.parts.logement + d.parts.epargne + d.parts.reste, 1);
});

test("projets : logement à préparer, précaution atteinte, projet hors de portée", () => {
  const sy = O.synthese({ ...BASE, epargneDisponible: 15000, projets: [
    { type: "logement", montant: 100000, horizonAns: 3 },
    { type: "precaution", montant: 6000, horizonAns: 1 },
    { type: "logement", montant: 900000, horizonAns: 1 }
  ] }, {}, MAINTENANT);
  const [logement, precaution, chateau] = sy.projets;
  assert.equal(logement.apportMin, 20000);
  assert.equal(logement.manqueApport, 5000);
  assert.equal(logement.statut, "a_preparer");
  assert.ok(logement.epargneMensuelle > 0 && logement.epargneMensuelle < sy.salaire.netMensuel * 0.5);
  assert.equal(precaution.statut, "ok");
  assert.equal(chateau.statut, "hors_portee");
});

test("conseils : chef de famille oublié, endettement élevé, banque sur le brut", () => {
  const sy = O.synthese({ montant: 2500, situation: "marie", enfants: 1, credits: [{ mensualite: 900 }] }, {}, MAINTENANT);
  const titres = sy.conseils.map((c) => c.titre).join(" | ");
  assert.match(titres, /Chef de famille/);
  assert.match(titres, /Endettement au-dessus de 40 %/);
  assert.equal(sy.conseils[0].niveau, 3);
});

test("versementPourCapital : formule d'épargne", () => {
  proche(O.versementPourCapital(1200, 12, 0), 100);
  const v = O.versementPourCapital(10000, 36, 6);
  let c = 0; for (let k = 0; k < 36; k++) c = c * (1 + 0.005) + v;
  proche(c, 10000, 0.01);
});

/* ---------- Conseils réalistes (retour utilisateur, 8 oct. 2026) ---------- */
const PROFIL_ENDETTE = {
  montant: 4000, sens: "brut", nombreSalaires: 17, situation: "marie", chefDeFamille: true, anneeNaissance: 1992,
  credits: [
    { type: "immo", libelle: "Crédit immobilier", tauxPct: 4.5, mensualite: 875.894, moisRestants: 148, capitalRestant: 98788.45 },
    { type: "auto", libelle: "Crédit automobile", tauxPct: 4.5, mensualite: 695.008, moisRestants: 65, capitalRestant: 40024.887 },
    { type: "autre", libelle: "Crédit mariage", tauxPct: 2, mensualite: 497.93, moisRestants: 68, capitalRestant: 31985.857 }
  ],
  contrats: [{ type: "av", libelle: "Contrat", anneeDebut: 2021, versementMensuel: 100 }]
};

test("suggestions d'épargne : jamais plus de 30 % de la marge mensuelle", () => {
  const sy = O.synthese(PROFIL_ENDETTE, {}, MAINTENANT);
  const marge = sy.epargne.margeMensuelle;
  assert.ok(marge > 0);
  sy.epargne.propositions.forEach((x) => assert.ok(x.versementMensuel <= Math.max(10, marge * 0.3) + 1e-9, x.cle));
  assert.ok(sy.epargne.propositions.some((x) => x.plafonneBudget));
  const textes = sy.conseils.map((c) => c.texte).join(" ");
  assert.match(textes, /Dans votre budget actuel/);
});

test("conseils : pas de renégociation proposée pour des taux inférieurs au marché", () => {
  const sy = O.synthese(PROFIL_ENDETTE, {}, MAINTENANT);
  const textes = sy.conseils.map((c) => c.titre + " " + c.texte).join(" ");
  assert.doesNotMatch(textes, /[Rr]enégocier (le|les) /);
  assert.match(textes, /Des taux à garder/);
  const cher = O.synthese(Object.assign({}, PROFIL_ENDETTE, { credits: [{ type: "conso", libelle: "Prêt perso", tauxPct: 13, mensualite: 2200, moisRestants: 30 }] }), {}, MAINTENANT);
  assert.match(cher.conseils.map((c) => c.texte).join(" "), /Renégocier le prêt perso/);
});

test("conseils : date de retour sous 40 % d'endettement et net moyen sur 17 salaires", () => {
  const sy = O.synthese(PROFIL_ENDETTE, {}, MAINTENANT);
  const s = O.sortieEndettement(sy.profil, sy.capacite.net.revenu, 0.4);
  assert.equal(s.mois, 68);
  assert.deepEqual(s.credits, ["Crédit automobile", "Crédit mariage"]);
  assert.ok(s.taux < 0.4);
  const titres = sy.conseils.map((c) => c.titre).join(" | ");
  assert.match(titres, /Votre marge revient dans 5 ans et 8 mois/);
  assert.match(sy.conseils[0].texte, /en comptant vos 17 salaires/);
  proche(sy.budget.net, sy.salaire.netMoyen);
});

test("contrat vie : mois écoulés, total versé, capital estimé, versements libres déductibles", () => {
  const c = { type: "av", libelle: "Vie", versementMensuel: 100, anneeDebut: 2021, moisDebut: 12, versementsLibres: 1000, versementsLibresAn: 500 };
  const e = O.estimationContrat(O.normaliser({ contrats: [c] }).contrats[0], MAINTENANT);
  assert.equal(e.mois, 59);
  assert.equal(e.verse, 6900);
  assert.ok(e.estime && e.capitalEstime > e.verse && e.capitalEstime < e.verse * 1.2);
  assert.equal(e.dateDureeFiscale, "décembre 2029");
  assert.equal(e.dureeAtteinte, false);
  const saisi = O.estimationContrat(O.normaliser({ contrats: [Object.assign({}, c, { capitalActuel: 8000 })] }).contrats[0], MAINTENANT);
  assert.equal(saisi.estime, false);
  assert.equal(saisi.capital, 8000);
  const sans = O.synthese(Object.assign({}, PROFIL_ENDETTE, { contrats: [Object.assign({}, c, { versementsLibresAn: 0 })] }), {}, MAINTENANT);
  const avec = O.synthese(Object.assign({}, PROFIL_ENDETTE, { contrats: [c] }), {}, MAINTENANT);
  assert.ok(avec.epargne.economieContrats > sans.epargne.economieContrats, "les versements libres de l'année réduisent l'impôt");
  assert.match(avec.conseils.map((x) => x.texte).join(" "), /6\u202f900 DT versés en 4 ans et 11 mois/);
});
