"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* theme-init.js tourne dans <head>, avant l'affichage : on le joue dans un faux navigateur minimal. */
function charger(chemin, stockage) {
  const attrs = {};
  const racine = { setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: (k) => { delete attrs[k]; }, getAttribute: (k) => (k in attrs ? attrs[k] : null) };
  const ls = Object.assign({}, stockage);
  const fen = {
    document: { documentElement: racine, dispatchEvent() {} },
    location: { pathname: chemin },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval() {}, CustomEvent: function () {}
  };
  fen.window = fen;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../public/commun/theme-init.js"), "utf8"), fen);
  return { T: fen.EFTheme, attrs };
}

test("apparence : normalisation (valeurs connues seulement, défaut vide)", () => {
  const { T } = charger("/espace/", {});
  /* Objets créés dans un autre contexte : comparés par leur contenu. */
  const n = (v) => JSON.parse(JSON.stringify(T.normaliserApparence(v)));
  assert.deepEqual(n({ accent: "sidi", densite: "compacte", taille: "tres-grande" }), { accent: "sidi", densite: "compacte", taille: "tres-grande" });
  assert.deepEqual(n({ accent: "rouge", densite: "serree", taille: 3, autre: "x" }), { accent: "", densite: "", taille: "" });
  assert.deepEqual(n(null), { accent: "", densite: "", taille: "" });
  assert.deepEqual(n("sidi"), { accent: "", densite: "", taille: "" });
  assert.deepEqual(Array.from(T.APPARENCE.accent), ["sidi", "olivier", "djerba", "bougain"], "cinq choix avec Encre (défaut), jamais de rouge");
});

test("apparence : appliquée avant l'affichage dans l'espace, jamais sur l'accueil ni les pages publiques", () => {
  const ls = { "ef-apparence": JSON.stringify({ accent: "djerba", densite: "compacte", taille: "grande" }) };
  const espace = charger("/espace/", ls).attrs;
  assert.equal(espace["data-accent"], "djerba");
  assert.equal(espace["data-densite"], "compacte");
  assert.equal(espace["data-taille"], "grande");
  for (const p of ["/", "/connexion/", "/simulateur-credit/"]) {
    const a = charger(p, ls).attrs;
    assert.ok(!("data-accent" in a) && !("data-densite" in a) && !("data-taille" in a), p);
  }
});

test("apparence : stockage illisible ou valeur inconnue → rien n'est posé ; poser retire les attributs par défaut", () => {
  assert.ok(!("data-accent" in charger("/espace/", { "ef-apparence": "{pas du json" }).attrs));
  assert.ok(!("data-accent" in charger("/espace/", { "ef-apparence": JSON.stringify({ accent: "<script>" }) }).attrs));
  const { T, attrs } = charger("/espace/", { "ef-apparence": JSON.stringify({ accent: "olivier", taille: "grande" }) });
  assert.equal(attrs["data-accent"], "olivier");
  T.poserApparence({ accent: "", taille: "tres-grande" });
  assert.ok(!("data-accent" in attrs));
  assert.equal(attrs["data-taille"], "tres-grande");
});

test("apparence : contrastes des accents (texte sur bouton, accent sur le fond)", () => {
  const css = fs.readFileSync(path.join(__dirname, "../../public/espace/apparence.css"), "utf8");
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const sombre of [false, true]) {
    for (const nom of ["sidi", "olivier", "djerba", "bougain"]) {
      const re = new RegExp((sombre ? ':root\\[data-theme="dark"\\]' : "^:root") + '\\[data-accent="' + nom + '"\\]\\s*\\{ --accent: (#[0-9A-F]{6}); --sur-accent: (#[0-9A-F]{6}); \\}', "m");
      const m = css.match(re);
      assert.ok(m, nom + (sombre ? " sombre" : " clair"));
      assert.ok(ratio(m[1], m[2]) >= (sombre ? 7 : 5), nom + " : texte sur l'accent " + ratio(m[1], m[2]).toFixed(2));
      const fonds = sombre ? ["#07090F", "#10131C"] : ["#F3F4F8", "#FFFFFF"];
      fonds.forEach((f) => assert.ok(ratio(m[1], f) >= 4.5, nom + " sur " + f + " : " + ratio(m[1], f).toFixed(2)));
    }
  }
});
