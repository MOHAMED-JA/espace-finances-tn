"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PUB = path.join(__dirname, "../../public");
const HOTE = "https://espace-finances-tn.jaouadimohamedaziz.workers.dev";

test("IndexNow : une seule clé, fichier qui contient exactement la clé, servi à la racine", () => {
  const cles = fs.readdirSync(PUB).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(cles.length, 1, cles.join());
  const cle = cles[0].replace(".txt", "");
  assert.equal(fs.readFileSync(path.join(PUB, cles[0]), "utf8"), cle);
  const wf = fs.readFileSync(path.join(__dirname, "../../.github/workflows/indexnow.yml"), "utf8");
  assert.match(wf, /api\.indexnow\.org\/indexnow/);
  assert.match(wf, /permissions:\s*\n\s*contents: read/);
});

test("plan du site : pages publiques existantes, sur le bon domaine, déclaré dans robots.txt", () => {
  const sm = fs.readFileSync(path.join(PUB, "sitemap.xml"), "utf8");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 10);
  for (const u of locs) {
    assert.ok(u.startsWith(HOTE + "/"), u);
    const p = u.slice(HOTE.length + 1);
    assert.ok(p === "" || fs.existsSync(path.join(PUB, p + ".html")), "page absente : " + u);
  }
  assert.match(fs.readFileSync(path.join(PUB, "robots.txt"), "utf8"), new RegExp("Sitemap: " + HOTE.replace(/\./g, "\\.") + "/sitemap\\.xml"));
});
