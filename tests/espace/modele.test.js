"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../public/commun/modele.js");

test("les trois outils sont décrits avec un chemin interne", () => {
  assert.deepEqual(Object.keys(M.OUTILS), ["salaire", "assurance_vie", "credit"]);
  for (const o of Object.values(M.OUTILS)) assert.match(o.chemin, /^\/outils\/[a-z-]+\/$/);
  assert.equal(M.outilValide("credit"), true);
  assert.equal(M.outilValide("__proto__"), false);
  assert.equal(M.outilValide("toString"), false);
});

test("nettoyerEtat accepte les liens de partage réels des trois outils", () => {
  assert.equal(M.nettoyerEtat("?m=2500&chef=1&enf=2"), "m=2500&chef=1&enf=2");
  assert.equal(M.nettoyerEtat("#r=60000&c=1&f=Mensuel&L=3:1000,5:2000"), "r=60000&c=1&f=Mensuel&L=3:1000,5:2000");
  assert.equal(M.nettoyerEtat("c=150000&m=240&t=9.5&d=2026-11-01&ra=24:tot"), "c=150000&m=240&t=9.5&d=2026-11-01&ra=24:tot");
  assert.equal(M.nettoyerEtat("ra=24%3Atot%2C36%3A500"), "ra=24%3Atot%2C36%3A500");
  assert.equal(M.nettoyerEtat(""), "");
});

test("nettoyerEtat refuse tout ce qui pourrait injecter du code ou une autre adresse", () => {
  for (const mal of ["<script>", "a=1\"><img", "javascript:alert(1)", "a=1 b=2", "a=1#b", "a=1/../x", "x=1;y", "a='1'", null, 42, {}]) {
    assert.equal(M.nettoyerEtat(mal), null, String(mal));
  }
  assert.equal(M.nettoyerEtat("a=" + "1".repeat(M.TAILLE_ETAT_MAX)), null);
});

test("adresseOuverture construit l'adresse de l'outil avec l'état et l'identifiant", () => {
  const id = "0b7d4a7e-58d2-4c55-9a67-3c3f1d2e9a10";
  assert.equal(M.adresseOuverture("salaire", "m=2500&chef=1"), "/outils/salaire/?m=2500&chef=1");
  assert.equal(M.adresseOuverture("salaire", "m=2500", id), "/outils/salaire/?m=2500&espace=" + id);
  assert.equal(M.adresseOuverture("assurance_vie", "r=60000&c=1", id), "/outils/assurance-vie/?espace=" + id + "#r=60000&c=1");
  assert.equal(M.adresseOuverture("credit", "c=1000&m=12&t=8"), "/outils/credit/?c=1000&m=12&t=8");
  assert.equal(M.adresseOuverture("credit", ""), "/outils/credit/");
  assert.equal(M.adresseOuverture("credit", "c=1", "pas-un-uuid"), "/outils/credit/?c=1");
  assert.equal(M.adresseOuverture("inconnu", "a=1"), null);
  assert.equal(M.adresseOuverture("salaire", "<x>"), null);
});

test("suiteSure n'autorise que des chemins relatifs du même site (pas de redirection ouverte)", () => {
  assert.equal(M.suiteSure("/outils/credit/?c=1#x"), "/outils/credit/?c=1#x");
  assert.equal(M.suiteSure("/espace/#compte"), "/espace/#compte");
  for (const mal of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "espace", "", null, "/connexion.html?suite=/x", "/a\nb"]) {
    assert.equal(M.suiteSure(mal), "/espace/", String(mal));
  }
});

test("nomValide normalise les espaces et borne la longueur", () => {
  assert.equal(M.nomValide("  Crédit   maison  "), "Crédit maison");
  assert.equal(M.nomValide("   "), null);
  assert.equal(M.nomValide("x".repeat(121)), null);
  assert.equal(M.nomValide(12), null);
});

test("resumeValide ne garde que des nombres finis et des libellés courts", () => {
  const r = M.resumeValide({
    principal: { libelle: "Net", valeur: "1862.018", unite: "DT" },
    secondaires: [{ libelle: "A", valeur: 1, unite: "%" }, { libelle: "B", valeur: NaN }, { libelle: "C", valeur: Infinity }, 3, null, { libelle: "D", valeur: 2 }, { libelle: "E", valeur: 3 }, { libelle: "F", valeur: 4 }],
    ligne: "x".repeat(500)
  });
  assert.equal(r.principal.valeur, 1862.018);
  assert.equal(r.secondaires.length, 4);
  assert.deepEqual(r.secondaires.map((s) => s.libelle), ["A", "D", "E", "F"]);
  assert.equal(r.ligne.length, 140);
  assert.deepEqual(M.resumeValide(null), { principal: null, secondaires: [] });
});

test("formaterIndicateur affiche les montants à la tunisienne", () => {
  assert.equal(M.formaterIndicateur({ valeur: 1862.0183, unite: "DT" }), "1 862,018 DT");
  assert.equal(M.formaterIndicateur({ valeur: 185567.28, unite: "DT" }), "185 567 DT");
  assert.equal(M.formaterIndicateur({ valeur: 19.84, unite: "%" }), "19,84 %");
  assert.equal(M.formaterIndicateur({ valeur: 240, unite: "" }), "240");
  assert.equal(M.formaterIndicateur({ valeur: 2.5, unite: "" }), "2,50");
  assert.equal(M.formaterIndicateur(null), "");
});

test("forceMotDePasse exige 10 caractères et récompense la variété", () => {
  assert.equal(M.forceMotDePasse(""), 0);
  assert.equal(M.forceMotDePasse("Ab1!"), 1);
  assert.equal(M.forceMotDePasse("abcdefghij"), 1);
  assert.equal(M.forceMotDePasse("Abcdefghij"), 2);
  assert.equal(M.forceMotDePasse("Abcdefgh1!"), 3);
  assert.equal(M.forceMotDePasse("Abcdefghijk1!xyz"), 4);
});

test("messageErreur traduit les erreurs Supabase en français clair", () => {
  assert.match(M.messageErreur({ message: "Invalid login credentials" }), /incorrect/);
  assert.match(M.messageErreur({ message: "User already registered" }), /existe déjà/);
  assert.match(M.messageErreur({ message: "Email rate limit exceeded" }), /Trop de tentatives/);
  assert.match(M.messageErreur({ message: "Limite de 200 simulations atteinte" }), /200 simulations/);
  assert.match(M.messageErreur(new TypeError("Failed to fetch")), /Internet/);
  assert.match(M.messageErreur("bizarre"), /Réessayez/);
});

test("emailValide", () => {
  assert.equal(M.emailValide("nom@exemple.tn"), true);
  assert.equal(M.emailValide("nom@exemple"), false);
  assert.equal(M.emailValide("nom exemple@x.tn"), false);
});
