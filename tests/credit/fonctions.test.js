/*
 * Tests unitaires des fonctions du moteur de crédit
 * (public/moteurs/credit/credit.js) : capacité d'emprunt (net et brut),
 * éligibilité, calcul inverse, sensibilité au TMM, renégociation,
 * louer ou acheter, Monte-Carlo, lien de partage, offres, plan de financement.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../public/moteurs/credit/credit.js");

const TOL = 0.0005;
function proche(reel, attendu, message, tolerance = TOL) {
  assert.ok(Math.abs(reel - attendu) <= tolerance, `${message} : obtenu ${reel}, attendu ${attendu}`);
}
/* Valeur actuelle de n mensualités M au taux annuel ta (taux mensuel non arrondi) */
function va(Mm, ta, n) { const i = ta / 100 / 12; return i === 0 ? Mm * n : Mm * (1 - Math.pow(1 + i, -n)) / i; }

/* ---------------- Capacité d'emprunt ---------------- */
test("capacité (net) : 40 % des revenus nets moins les charges, capital = valeur actuelle", () => {
  const r = M.capaciteEmprunt({ revenuNet: 3000, charges: 400, dureeMois: 240, tauxAnnuelPct: 9 });
  assert.equal(r.valide, true);
  assert.equal(r.base, "net");
  assert.equal(r.quotite, 0.4);
  proche(r.capaciteEndettement, 1200, "capacité d'endettement");
  proche(r.mensualiteMax, 800, "mensualité maximale");
  proche(r.capital, M.arrondi(va(800, 9, 240)), "capital");
  assert.equal(r.capital, r.montant);
  assert.equal(r.dureeMois, 240);
  assert.equal(r.dureeLimiteeParAge, false);
  /* Le capital trouvé redonne bien une mensualité de 800 sur 240 mois (taux mensuel non arrondi) */
  proche(M.pmt(0.09 / 12, 240, r.capital), 800, "mensualité recalculée", 0.001);
});

test("capacité (brut) : la quotité s'applique au salaire mensuel brut", () => {
  const net = M.capaciteEmprunt({ base: "net", revenuNet: 2500, revenuBrut: 3200, dureeMois: 120, tauxAnnuelPct: 8 });
  const brut = M.capaciteEmprunt({ base: "brut", revenuNet: 2500, revenuBrut: 3200, dureeMois: 120, tauxAnnuelPct: 8 });
  assert.equal(brut.base, "brut");
  assert.equal(brut.revenu, 3200);
  proche(net.mensualiteMax, 1000, "net : 40 % de 2 500");
  proche(brut.mensualiteMax, 1280, "brut : 40 % de 3 200");
  proche(brut.capital, M.arrondi(va(1280, 8, 120)), "capital (brut)");
  assert.ok(brut.capital > net.capital);
  /* Base brute sans revenu brut : entrées incomplètes */
  const ko = M.capaciteEmprunt({ base: "brut", revenuNet: 2500, dureeMois: 120, tauxAnnuelPct: 8 });
  assert.equal(ko.valide, false);
  assert.equal(ko.motif, "entrees-incompletes");
  assert.equal(ko.capital, 0);
});

test("capacité : quotité personnalisée, charges et taux nul", () => {
  const r = M.capaciteEmprunt({ revenuNet: 2000, quotite: 0.33, charges: 160, dureeMois: 60, tauxAnnuelPct: 0 });
  proche(r.mensualiteMax, 500, "2 000 × 33 % − 160");
  proche(r.capital, 30000, "taux nul : mensualité × durée");
});

test("capacité : durée plafonnée pour finir le crédit avant l'âge maximal (70 ans par défaut)", () => {
  const r = M.capaciteEmprunt({ base: "brut", revenuBrut: 4000, charges: 300, dureeMois: 240, tauxAnnuelPct: 9, ageActuel: 55 });
  assert.equal(r.dureeDemandee, 240);
  assert.equal(r.dureeMaxAge, 180);
  assert.equal(r.dureeMois, 180);
  assert.equal(r.dureeLimiteeParAge, true);
  proche(r.mensualiteMax, 1300, "4 000 × 40 % − 300");
  proche(r.capital, M.arrondi(va(1300, 9, 180)), "capital sur 180 mois");
  /* Âge non entier : 52,5 ans → 210 mois */
  assert.equal(M.capaciteEmprunt({ revenuNet: 3000, dureeMois: 300, tauxAnnuelPct: 9, ageActuel: 52.5 }).dureeMois, 210);
  /* Âge maximal personnalisé */
  assert.equal(M.capaciteEmprunt({ revenuNet: 3000, dureeMois: 300, tauxAnnuelPct: 9, ageActuel: 50, ageMax: 65 }).dureeMois, 180);
  /* Durée demandée déjà compatible : pas de plafonnement */
  const ok = M.capaciteEmprunt({ revenuNet: 3000, dureeMois: 120, tauxAnnuelPct: 9, ageActuel: 30 });
  assert.equal(ok.dureeLimiteeParAge, false);
  assert.equal(ok.dureeMois, 120);
  /* Âge maximal atteint */
  const fini = M.capaciteEmprunt({ revenuNet: 3000, dureeMois: 120, tauxAnnuelPct: 9, ageActuel: 70 });
  assert.equal(fini.motif, "age-max-atteint");
  assert.equal(fini.capital, 0);
});

test("capacité : charges supérieures à la quotité → capacité nulle", () => {
  const r = M.capaciteEmprunt({ revenuNet: 2000, charges: 900, dureeMois: 120, tauxAnnuelPct: 7 });
  assert.equal(r.valide, true);
  assert.equal(r.motif, "charges-trop-elevees");
  assert.equal(r.capital, 0);
  assert.equal(r.mensualiteMax, 0);
  proche(r.capaciteEndettement, 800, "capacité d'endettement affichée");
  assert.equal(M.capaciteEmprunt({ revenuNet: 5000, dureeMois: 360, tauxAnnuelPct: 8 }).horsLimite, true, "au-delà de 300 mois");
});

/* ---------------- Éligibilité ---------------- */
test("éligibilité : apport, âge en fin de crédit, endettement (avec assurance), reste à vivre", () => {
  const e = { capital: 160000, mois: 240, taux: 9, dateDebut: "", assurance: { taux: 0.36, base: "initial" },
    apport: { prix: 200000, apport: 40000 }, emprunteur: { age: 52, revenus: 4000, charges: 300 } };
  const r = M.echeancier(e);
  const x = M.eligibilite(e, r);
  assert.deepEqual(x.apport, { pct: 20, min: 20, ok: true });
  assert.deepEqual(x.age, { fin: 72, max: 70, ok: false });
  proche(x.endettement.mensuel, r.M1 + 48, "échéance + assurance (48 = 160 000 × 0,36 % ÷ 12)");
  proche(x.endettement.taux, (r.M1 + 48 + 300) / 4000 * 100, "taux d'endettement", 1e-9);
  assert.equal(x.endettement.ok, false);
  proche(x.resteAVivre.montant, 4000 - 300 - (r.M1 + 48), "reste à vivre");
  assert.equal(x.resteAVivre.ok, null, "reste à vivre positif : simple indication");
  assert.equal(x.eligible, false);
  /* Règles de l'agence modifiées */
  const y = M.eligibilite(e, r, { ageMax: 75, endettementMax: 45 });
  assert.equal(y.age.ok, true);
  assert.equal(y.endettement.ok, true);
  assert.equal(y.eligible, true);
});

test("éligibilité : échéance trimestrielle mensualisée, différé ignoré, critères absents", () => {
  const e = { capital: 40000, mois: 60, taux: 10, periodicite: 3, differe: { mois: 6, type: "partiel" }, dateDebut: "", emprunteur: { age: null, revenus: 1500, charges: 0 } };
  const r = M.echeancier(e);
  const x = M.eligibilite(e, r);
  proche(x.endettement.mensuel, M.arrondi(r.lignes[2].paiement / 3), "1re échéance hors différé ÷ 3");
  assert.equal(x.apport, null);
  assert.equal(x.age, null);
  assert.equal(M.eligibilite({ capital: 1000, mois: 12, taux: 5 }).eligible, true, "sans emprunteur : aucun critère bloquant");
});

/* ---------------- Calcul inverse ---------------- */
test("calcul inverse : aller-retour capital ⇄ mensualité", () => {
  [[1200, 180, 8.5], [650.5, 84, 11], [3000, 300, 7.25]].forEach(([Mm, n, ta]) => {
    const c = M.calculInverse({ mode: "capital", mensualite: Mm, mois: n, taux: ta });
    proche(M.mensualite(c.capital, M.tauxMensuelPct(ta), n), Mm, "mensualité du capital trouvé", 0.002);
    const d = M.calculInverse({ mode: "duree", mensualite: Mm, capital: c.capital, taux: ta });
    assert.equal(d.mois, n, "durée retrouvée");
    const t = M.calculInverse({ mode: "taux", mensualite: Mm, capital: c.capital, mois: n });
    proche(t.taux, ta, "taux retrouvé", 0.001);
  });
});

test("calcul inverse : erreurs et entrées incomplètes", () => {
  assert.equal(M.calculInverse({ mode: "capital", mensualite: 0, mois: 12, taux: 5 }), null);
  assert.equal(M.calculInverse({ mode: "capital", mensualite: 100, mois: 301, taux: 5 }), null);
  assert.deepEqual(M.calculInverse({ mode: "duree", mensualite: 500, capital: 100000, taux: 9 }), { erreur: "interets-non-couverts", interetsPremierMois: 750 });
  assert.equal(M.calculInverse({ mode: "duree", mensualite: 400, capital: 100000, taux: 2 }).erreur, "plus-de-300-mois");
  assert.equal(M.calculInverse({ mode: "taux", mensualite: 800, capital: 100000, mois: 120 }).erreur, "mensualite-trop-faible");
});

/* ---------------- Sensibilité au TMM ---------------- */
test("sensibilité au TMM : 6 lignes, variation future ignorée, écarts croissants", () => {
  const e = { capital: 150000, mois: 240, taux: 10, tmm: { tmm: 7.5, marge: 2.5 }, variation: { delta: 1, des: 13 }, dateDebut: "" };
  const s = M.sensibiliteTmm(e);
  assert.deepEqual(s.map((x) => x.d), [-1, -0.5, 0, 0.5, 1, 2]);
  assert.deepEqual(s.map((x) => x.taux), [9, 9.5, 10, 10.5, 11, 12]);
  assert.deepEqual(s.map((x) => x.tmm), [6.5, 7, 7.5, 8, 8.5, 9.5]);
  const ref = M.echeancier({ capital: 150000, mois: 240, taux: 10, dateDebut: "" });
  proche(s[2].M, ref.M1, "ligne actuelle = sans variation");
  proche(s[2].I, ref.totI, "intérêts actuels");
  assert.equal(s[2].dM, 0);
  proche(s[5].M, M.mensualite(150000, M.tauxMensuelPct(12), 240), "TMM + 2 points");
  for (let i = 1; i < s.length; i++) assert.ok(s[i].M > s[i - 1].M && s[i].dI > s[i - 1].dI);
  proche(s[0].dM, M.arrondi(s[0].M - s[2].M), "écart de mensualité");
  assert.equal(M.sensibiliteTmm({ capital: 1000, mois: 12, taux: 5 }), null, "sans TMM");
  /* Taux plancher à 0 */
  assert.equal(M.sensibiliteTmm({ capital: 1000, mois: 12, taux: 0.3, tmm: { tmm: 0.1, marge: 0.2 } })[0].taux, 0);
});

/* ---------------- Renégociation ---------------- */
test("renégociation : économie nette, point mort et financement des frais", () => {
  const r = M.renegociation({ crd: 80000, tauxActuel: 10, moisRestants: 150, nouveauTaux: 8, indemnitePct: 2, fraisDossier: 300, fraisGarantie: 500 });
  proche(r.cout, 2400, "1 600 + 300 + 500");
  assert.equal(r.capitalNouveau, 80000);
  proche(r.totalNouveau, M.arrondi(r.nouveau.totM + 2400), "frais payés à part");
  proche(r.economie, M.arrondi(r.totalActuel - r.totalNouveau), "économie");
  assert.equal(r.rentable, true);
  assert.equal(r.pointMort, Math.ceil(2400 / r.gainMensuel));
  const f = M.renegociation({ crd: 80000, tauxActuel: 10, moisRestants: 150, nouveauTaux: 8, nouvelleDuree: 180, indemnitePct: 2, fraisDossier: 300, fraisGarantie: 500, financer: true });
  assert.equal(f.capitalNouveau, 82400);
  assert.equal(f.pointMort, null, "frais financés : pas de point mort");
  assert.equal(f.dureePlusLongue, true);
  assert.equal(f.rentable, false, "durée allongée : surcoût");
  assert.equal(M.renegociation({ crd: 0, tauxActuel: 10, moisRestants: 150, nouveauTaux: 8 }), null);
});

/* ---------------- Louer ou acheter ---------------- */
test("louer ou acheter : points annuels, mensualité, verdict cohérent", () => {
  const o = { prix: 250000, apport: 50000, fraisPct: 5, taux: 9, ans: 20, chargesPct: 1, loyer: 900, hausseLoyerPct: 4, revalorisationPct: 3, rendementPct: 6 };
  const r = M.louerOuAcheter(o);
  assert.equal(r.points.length, 21);
  assert.deepEqual(r.points[0], { an: 0, achat: 50000, location: 62500 });
  proche(r.mensualite, M.mensualite(200000, M.tauxMensuelPct(9), 240), "mensualité");
  const fin = r.points[20];
  proche(fin.achat, 250000 * Math.pow(1.03, 20), "patrimoine achat final = valeur du bien (crédit soldé)", 1e-6);
  proche(r.ecart, fin.achat - fin.location, "écart", 1e-9);
  assert.equal(r.verdict, r.ecart >= 0 ? "acheter" : "louer");
  /* Loyer très élevé : l'achat devient rentable rapidement */
  const cher = M.louerOuAcheter(Object.assign({}, o, { loyer: 2500 }));
  assert.equal(cher.verdict, "acheter");
  assert.ok(cher.pointMort >= 1 && cher.pointMort <= 20);
  assert.equal(M.louerOuAcheter(Object.assign({}, o, { apport: 250000 })), null, "apport ≥ prix");
});

/* ---------------- Monte-Carlo ---------------- */
test("stress test du TMM : reproductible avec la graine, sensible à la graine", () => {
  const o = { capital: 100000, mois: 120, tmm: 7.5, marge: 2.5, volatilite: 0.8, seuil: 1400, n: 200 };
  const a = M.monteCarloTmm(Object.assign({ graine: 42 }, o)), b = M.monteCarloTmm(Object.assign({ graine: 42 }, o));
  assert.deepEqual(a.interets, b.interets);
  assert.deepEqual(a.bandes, b.bandes);
  assert.equal(a.probaDepasse, b.probaDepasse);
  const c = M.monteCarloTmm(Object.assign({ graine: 43 }, o));
  assert.notDeepEqual(a.interets, c.interets);
  assert.equal(a.interets.length, 200);
  assert.equal(a.bandes.length, 10);
  assert.ok(a.interetsP95 >= a.interetsMedian && a.mensualiteMaxP90 >= a.mensualiteMaxMediane);
  /* Volatilité nulle : trajectoires identiques, égales au crédit sans variation à quelques
     millimes près (l'échéance est recalculée chaque année sur le capital restant dû, comme à l'origine) */
  const z = M.monteCarloTmm(Object.assign({}, o, { volatilite: 0, n: 5 }));
  z.interets.forEach((v) => { assert.equal(v, z.interets[0]); proche(v, z.interetsSansVariation, "sans volatilité", 0.01); });
  /* Générateur : valeurs dans [0 ; 1[ et suite déterministe */
  const g1 = M.generateurAleatoire(7), g2 = M.generateurAleatoire(7);
  for (let i = 0; i < 50; i++) { const v = g1(); assert.equal(v, g2()); assert.ok(v >= 0 && v < 1); }
  assert.equal(M.centile([1, 2, 3, 4], 0.5), 2.5);
});

/* ---------------- Lien de partage ---------------- */
test("lien de partage : aller-retour complet encoderLien → decoderLien", () => {
  const e = { capital: 180000, mois: 240, taux: 10.25, dateDebut: "2026-09-01", type: "immo", tmm: { tmm: 7.75, marge: 2.5 }, variation: { delta: -0.5, des: 25 },
    periodicite: 1, amort: "constant", differe: { mois: 12, type: "partiel" }, assurance: { taux: 0.35, base: "initial" },
    frais: { dossierPct: 0.5, dossierFixe: 120, garantie: 900, autres: 30 }, apport: { prix: 225000, apport: 45000 },
    ras: [{ apres: 36, total: false, montant: 12000 }, { apres: 120, total: true, montant: null }], versement: { montant: 500, frequence: "periode", des: 13 },
    indemnite: 1.5, raMode: "mensualite" };
  const q = M.encoderLien(e, { reduc: true });
  const d = M.decoderLien("?" + q);
  assert.equal(d.reduction, true);
  ["capital", "mois", "taux", "dateDebut", "type", "tmm", "variation", "periodicite", "amort", "differe", "assurance", "frais", "apport", "ras", "versement", "indemnite", "raMode"]
    .forEach((k) => assert.deepEqual(d[k], e[k], k));
  /* Résultats identiques après aller-retour */
  const r1 = M.echeancier(e, true), r2 = M.echeancier(d, d.reduction);
  assert.equal(r2.totM, r1.totM);
  assert.equal(r2.teg, r1.teg);
});

test("lien de partage : valeurs par défaut omises, lien minimal et lien invalide", () => {
  assert.equal(M.encoderLien({ capital: 50000.1234, mois: 120, taux: 8 }), "c=50000.123&m=120&t=8");
  const d = M.decoderLien("c=50000&m=120&t=8");
  assert.equal(d.type, "libre");
  assert.equal(d.periodicite, 1);
  assert.equal(d.amort, "constant");
  assert.deepEqual(d.ras, []);
  assert.equal(d.raMode, "duree");
  assert.equal(M.decoderLien("c=50000&m=120"), null);
  assert.equal(M.decoderLien("c=50000&m=301&t=8"), null);
  assert.equal(M.decoderLien(new URLSearchParams("c=1&m=1&t=0")).capital, 1, "URLSearchParams accepté");
});

/* ---------------- Comparateur d'offres ---------------- */
test("comparateur d'offres : classement par coût du crédit et économie", () => {
  const r = M.comparerOffres({ capital: 100000, mois: 120, offres: [
    { nom: "Chère", taux: 9 },
    { nom: "Frais", taux: 8.5, fraisDossierPct: 1, fraisFixes: 200, assurancePct: 0.3, assuranceBase: "crd" },
    { nom: "Invalide", taux: 120 },
    { taux: 8.75 }
  ] });
  assert.equal(r.offres.length, 3, "offre au taux invalide ignorée");
  assert.equal(r.offres[2].nom, "Offre 4");
  const tri = r.offres.slice().sort((a, b) => a.coutCredit - b.coutCredit);
  assert.equal(r.meilleure, tri[0]);
  assert.equal(r.seconde, tri[1]);
  proche(r.economie, M.arrondi(tri[1].coutCredit - tri[0].coutCredit), "économie");
  const f = r.offres[1];
  proche(f.frais, 1200, "1 % de 100 000 + 200");
  proche(f.assurance1, 25, "100 000 × 0,3 % ÷ 12");
  proche(f.mensualiteAvecAssurance, f.mensualite + 25, "mensualité avec assurance");
  proche(f.coutCredit, M.arrondi(f.interets + f.coutAssurance + f.frais), "coût du crédit");
  assert.ok(f.teg > 8.5, "TEG supérieur au taux nominal avec frais et assurance");
  proche(r.offres[0].teg, 9, "sans frais : TEG = taux nominal", 1e-4);
  assert.equal(M.comparerOffres({ capital: 100000, mois: 0, offres: [{ taux: 8 }] }), null);
});

/* ---------------- Plan de financement ---------------- */
test("plan de financement : paliers de la mensualité globale", () => {
  const r = M.planFinancement([{ nom: "Principal", capital: 150000, mois: 240, taux: 9 }, { nom: "Autofinancement", capital: 30000, mois: 60, taux: 7 }, { capital: 0, mois: 10, taux: 5 }]);
  assert.equal(r.prets.length, 2);
  assert.equal(r.ignores, 1);
  assert.equal(r.nMax, 240);
  const a = r.echeanciers[0], b = r.echeanciers[1];
  proche(r.totalMois[0], M.arrondi(a.M1 + b.M1), "1re mensualité globale");
  assert.equal(r.paliers[0].debut, 1);
  assert.ok(r.paliers.some((p) => p.debut === 61), "palier à la fin du second prêt");
  proche(r.totI, M.arrondi(a.totI + b.totI), "intérêts totaux");
  assert.equal(r.lissage, null);
  assert.equal(r.paliers[r.paliers.length - 1].fin, 240);
});

test("plan de financement : lissage (mensualité globale constante) et cas refusés", () => {
  const prets = [{ nom: "Principal", capital: 150000, mois: 240, taux: 9 }, { nom: "Autofinancement", capital: 30000, mois: 60, taux: 7 }];
  const r = M.planFinancement(prets, { lisser: true });
  assert.ok(r.lissage);
  assert.equal(r.lissage.principal, 0);
  const T = r.lissage.T;
  r.totalMois.slice(0, 239).forEach((v, i) => proche(v, T, "mois " + (i + 1), 0.002));
  assert.ok(r.lissage.surcout > 0, "le lissage allonge le remboursement du principal : plus d'intérêts");
  proche(r.lissage.surcout, M.arrondi(r.lissage.totI - r.echeanciers[0].totI), "surcoût");
  assert.equal(M.planFinancement([{ capital: 100000, mois: 180, taux: 8, differe: 12 }, { capital: 20000, mois: 36, taux: 6 }], { lisser: true }).messageLissage, "differe-principal");
  assert.equal(M.planFinancement([{ capital: 1000, mois: 120, taux: 8 }, { capital: 90000, mois: 24, taux: 8 }], { lisser: true }).messageLissage, "lissage-impossible");
  assert.equal(M.planFinancement([]), null);
});

/* ---------------- Autres fonctions ---------------- */
test("remboursement anticipé : économie, gain net et mois gagnés", () => {
  const a = M.remboursementAnticipe({ capital: 100000, mois: 180, taux: 9, ras: [{ apres: 24, total: false, montant: 20000 }], indemnite: 3 });
  assert.equal(a.effet, "duree");
  proche(a.totIndem, 600, "3 % de 20 000");
  proche(a.gainNet, M.arrondi(a.economie - 600), "gain net");
  assert.equal(a.moisGagnes, 180 - a.nouvelleDuree);
  const s = M.remboursementAnticipe({ capital: 80000, mois: 120, taux: 7.5, ras: [{ apres: 50, total: true }] });
  assert.equal(s.effet, "solde");
  assert.equal(s.soldeApres, 50);
  const m = M.remboursementAnticipe({ capital: 80000, mois: 120, taux: 7.5, ras: [{ apres: 50, total: false, montant: 10000 }], raMode: "mensualite" });
  assert.equal(m.effet, "mensualite");
  assert.ok(m.echeanceApres < m.echeanceSans);
});

test("analyse de la réduction de taux, préréglages, budget guidé", () => {
  const z = M.analyseReduction({ capital: 250000, mois: 300, taux: 9.75 });
  assert.equal(z.eligible, true);
  assert.equal(z.reductions.length, 4);
  proche(z.ratio37, 0.297826228, "ratio à 36 mois", 1e-8);
  assert.equal(M.analyseReduction({ capital: 250000, mois: 300, taux: 9.75, periodicite: 3 }).eligible, false, "réservé aux crédits mensuels");
  assert.equal(M.analyseReduction({ capital: 60000, mois: 84, taux: 12 }).dureeOk, false);
  assert.deepEqual(M.appliquerPreset("immo"), { type: "immo", annees: 20, mois: 240, taux: 10, tmm: { tmm: 7.5, marge: 2.5 } });
  assert.deepEqual(M.appliquerPreset("conso"), { type: "conso", annees: 3, mois: 36, taux: 11, tmm: null });
  assert.equal(M.appliquerPreset("libre"), null);
  const b = M.budgetGuide({ type: "immo", prix: 250000, apport: 30000, ans: 20, taux: 9, revenus: 3000, charges: 200, age: 55 });
  assert.equal(b.capital, 220000);
  assert.equal(b.ok, false);
  proche(b.mensualiteMax, 1000, "3 000 × 40 % − 200");
  assert.equal(b.capitalMax % 100, 0);
  assert.equal(b.ageDepasse, true);
  assert.equal(b.apportInsuffisant, true);
});

test("optimiseur, mon crédit, comparateur A/B et calendrier", () => {
  const o = M.optimiser({ prix: 200000, apportMax: 40000, budget: 1800, epargne: 300, taux: 9 });
  assert.equal(o.tous.length, 23 * 5 * 3);
  assert.ok(o.ok.every((x) => x.M <= 1800.0005));
  assert.ok(o.ok.every((x) => x.cout >= o.meilleure.cout));
  assert.equal(M.optimiser({ prix: 200000, apportMax: 40000, budget: 10, taux: 9 }).erreur, "aucune-combinaison");
  const mc = M.monCredit({ capital: 102816.611, date: "2026-11-01", mois: 155, taux: 2.25, dureeTotale: 300 }, new Date(2027, 5, 15));
  assert.equal(mc.passees, 7);
  assert.equal(mc.restantes, 148);
  assert.equal(mc.crd, mc.resultat.lignes[6].reste);
  const ra = M.echeancier({ capital: 100000, mois: 120, taux: 8 }), rb = M.echeancier({ capital: 100000, mois: 180, taux: 8 });
  const ab = M.comparerAB(ra, rb);
  assert.deepEqual(ab.indicateurs.map((x) => x.meilleur), ["b", "a", "a", "a", null], "TEG égaux (même taux, sans frais)");
  assert.ok(ab.ecart[ab.ecart.length - 1][1] > 0, "B coûte plus cher au total");
  const cal = M.calendrier(M.echeancier({ capital: 12000, mois: 24, taux: 6, dateDebut: "2026-03-10" }), new Date(2026, 3, 1));
  assert.deepEqual(cal.map((a) => a.annee), [2026, 2027, 2028]);
  assert.equal(cal[0].cases[0], null);
  assert.equal(cal[0].cases[3].courant, true);
  assert.ok(cal[0].cases[2].part > cal[2].cases[1].part, "la part d'intérêts diminue");
});
