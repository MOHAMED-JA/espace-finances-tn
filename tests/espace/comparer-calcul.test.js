"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../public/espace/js/comparer-calcul.js");

const cr = (nom, mens, cout, taux) => ({ nom, outil: "credit", resume: { principal: { libelle: "Mensualité", valeur: mens, unite: "DT" },
  secondaires: [{ libelle: "Capital emprunté", valeur: 150000, unite: "DT" }, { libelle: "Taux nominal", valeur: taux, unite: "%" }, { libelle: "Coût du crédit", valeur: cout, unite: "DT" }] } });

test("crédits : la mensualité et le coût les plus bas sont marqués, le capital n'a pas de sens", () => {
  const r = C.comparer([cr("Banque A", 1349.589, 173901, 9), cr("Banque B", 1290.2, 159648, 8.4), cr("Banque C", 1301, 162240, 8.5)]);
  assert.deepEqual(r.noms, ["Banque A", "Banque B", "Banque C"]);
  assert.equal(r.lignes[0].libelle, "Mensualité");
  assert.equal(r.lignes[0].principal, true);
  assert.equal(r.lignes[0].meilleur, 1);
  assert.equal(r.lignes.find((l) => l.libelle === "Coût du crédit").meilleur, 1);
  assert.equal(r.lignes.find((l) => l.libelle === "Capital emprunté").meilleur, -1);
  assert.equal(Math.round(r.lignes.find((l) => l.libelle === "Coût du crédit").ecart.valeur), 14253);
});

test("épargne : l'économie d'impôt la plus haute ; égalité : personne n'est marqué", () => {
  const ep = (nom, eco) => ({ nom, outil: "assurance_vie", resume: { principal: { libelle: "Économie d'impôt / an", valeur: eco, unite: "DT" }, secondaires: [] } });
  assert.equal(C.comparer([ep("a", 600), ep("b", 684)]).lignes[0].meilleur, 1);
  assert.equal(C.comparer([ep("a", 600), ep("b", 600)]).lignes[0].meilleur, -1);
});

test("refus : une seule simulation, outils différents ; au plus 3", () => {
  assert.ok(C.comparer([cr("a", 1, 1, 1)]).erreur);
  assert.ok(C.comparer([cr("a", 1, 1, 1), { nom: "s", outil: "salaire", resume: {} }]).erreur);
  assert.equal(C.comparer([cr("a", 3, 1, 1), cr("b", 2, 1, 1), cr("c", 1, 1, 1), cr("d", 0.5, 1, 1)]).noms.length, 3);
});

test("sens des libellés", () => {
  assert.equal(C.sens("Net à payer mensuel"), 1);
  assert.equal(C.sens("Coût employeur / an"), 0);
  assert.equal(C.sens("Prélèvements"), -1);
  assert.equal(C.sens("Effort réel / mois"), -1);
  assert.equal(C.sens("Capital au terme (médian)"), 1);
  assert.equal(C.sens("Brut"), 0);
});
