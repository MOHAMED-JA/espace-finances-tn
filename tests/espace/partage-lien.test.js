"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../public/commun/partage-lien.js");

test("encoder / décoder : aller-retour, ordre fixe, champs inconnus ignorés", () => {
  const h = L.encoder("pret", { marge: 2.5, montant: 150000, duree: 20, type: "immo", nom: "Aziz Démo" });
  assert.equal(h, "type=immo&montant=150000&duree=20&marge=2.5");
  assert.deepEqual(L.decoder("pret", "#" + h), { type: "immo", montant: 150000, duree: 20, marge: 2.5 });
  assert.equal(L.adresse("https://x.dev/", "pret", { montant: 1000 }), "https://x.dev/simulateur-credit-tunisie#montant=1000");
});

test("décoder : valeurs hors bornes ou malformées ignorées, jamais d'autre champ", () => {
  const v = L.decoder("pret", "#type=libre&montant=5e9&duree=30&marge=abc&email=a@b.c&montant2=1");
  assert.deepEqual(v, {});
  assert.deepEqual(L.decoder("salaire", "#montant=2500&secteur=public&chef=1&enfants=9"), { montant: 2500, secteur: "public", chef: true });
  assert.deepEqual(L.decoder("inconnue", "#montant=1"), {});
  assert.deepEqual(L.decoder("cea", "#" + "x".repeat(500)), {});
});

test("crédit : taux fixe → marge sur le TMM du jour, durée arrondie signalée", () => {
  const r = L.depuisCredit({ type: "immo", capital: 150000, mois: 246, taux: 9, tmm: null, nonRepris: ["l'assurance"] }, 7.5);
  assert.deepEqual(r.valeurs, { type: "immo", montant: 150000, duree: 21, marge: 1.5 });
  assert.equal(r.page, "pret");
  assert.ok(r.ecarts.some((e) => /arrondie à 21 ans/.test(e)));
  assert.ok(r.ecarts.some((e) => /Non repris : l'assurance/.test(e)));
});

test("crédit : taux sous le TMM, type libre, durée trop longue, TMM différent", () => {
  const a = L.depuisCredit({ type: "auto", capital: 40000, mois: 120, taux: 6 }, 7.5);
  assert.equal(a.valeurs.marge, 0);
  assert.equal(a.valeurs.duree, 7);
  assert.ok(a.ecarts.some((e) => /ne descend pas sous le TMM/.test(e)));
  assert.ok(a.ecarts.some((e) => /ramenée à 7 ans/.test(e)));
  const b = L.depuisCredit({ type: "libre", capital: 80000, mois: 180, taux: 10, tmm: { tmm: 7.49, marge: 2.5 } }, 7.5);
  assert.equal(b.valeurs.type, "immo");
  assert.equal(b.valeurs.marge, 2.5);
  assert.ok(b.ecarts.some((e) => /TMM du jour/.test(e)));
});

test("salaire : la situation de famille n'est jointe que sur demande", () => {
  const sans = L.depuisSalaire({ brut: 2500.5, secteur: "prive", chef: true, enfants: 2 });
  assert.deepEqual(sans.valeurs, { montant: 2500.5, secteur: "prive" });
  assert.equal(sans.sensible.inclus, false);
  assert.ok(sans.ecarts.some((e) => /sans votre situation de famille/.test(e)));
  const avec = L.depuisSalaire({ brut: 2500, secteur: "public", chef: true, enfants: 6 }, { famille: true });
  assert.deepEqual(avec.valeurs, { montant: 2500, secteur: "public", chef: true, enfants: 4 });
  assert.equal(L.encoder("salaire", avec.valeurs), "montant=2500&secteur=public&chef=1&enfants=4");
});

test("épargne : assurance vie (rendement net de frais), CEA, salaire joint sur demande", () => {
  const v = L.depuisEpargne({ mode: "ac", versementMensuel: 200, depotAnnuel: 3000, dureeAns: 12, rendementPct: 7, fraisPct: 1, brut: 3000 });
  assert.equal(v.page, "vie");
  assert.deepEqual(v.valeurs, { versement: 200, duree: 12, rendement: 6 });
  assert.ok(v.ecarts.some((e) => /CEA/.test(e)));
  assert.ok(v.ecarts.some((e) => /salaire type/.test(e)));
  const c = L.depuisEpargne({ mode: "cea", depotAnnuel: 4000, brut: 3000 }, { salaire: true });
  assert.deepEqual(c.valeurs, { depot: 4000, montant: 3000 });
  assert.equal(c.page, "cea");
});

test("le lien ne contient jamais de texte libre ni d'adresse", () => {
  const r = L.depuisSalaire({ brut: 2000, secteur: "prive", chef: true, enfants: 1, nom: "Aziz Démo", email: "demo@exemple.tn" }, { famille: true });
  const url = L.adresse("https://x.dev", r.page, r.valeurs);
  assert.ok(!/Aziz|demo|@/.test(url));
  assert.match(url, /^https:\/\/x\.dev\/salaire-net-tunisie#[a-z0-9=&.]+$/);
  const m = L.message(r.page, url);
  assert.ok(m.texte.endsWith(url));
});
