"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../public/espace/js/orbite-graphe.js");

test("graduations rondes qui couvrent l'intervalle", () => {
  assert.deepEqual(G.graduations(0, 150000, 4), [0, 50000, 100000, 150000]);
  assert.deepEqual(G.graduations(0, 17685, 4), [0, 5000, 10000, 15000, 20000]);
  const t = G.graduations(6.95, 8.05, 4);
  assert.ok(t[0] <= 6.95 && t[t.length - 1] >= 8.05, t.join(" "));
  assert.deepEqual(G.graduations(5, 5, 4), [5, 5.25, 5.5, 5.75, 6]);
});

test("étiquettes de l'axe X : jamais à moins de l'écart, la dernière toujours", () => {
  const pos = Array.from({ length: 24 }, (_, i) => 50 + i * 12);
  const idx = G.indicesX(pos, 52);
  assert.equal(idx[idx.length - 1], 23);
  for (let k = 1; k < idx.length; k++) assert.ok(pos[idx[k]] - pos[idx[k - 1]] >= 52, "écart " + idx);
  assert.deepEqual(G.indicesX([0, 100, 200], 52), [0, 1, 2]);
  assert.deepEqual(G.indicesX([10], 52), [0]);
});

test("point le plus proche (recherche binaire)", () => {
  const pts = [[0, 1], [12, 2], [24, 3], [36, 4]];
  assert.equal(G.plusProche(pts, -5), 0);
  assert.equal(G.plusProche(pts, 17), 1);
  assert.equal(G.plusProche(pts, 19), 2);
  assert.equal(G.plusProche(pts, 99), 3);
  assert.equal(G.plusProche([], 1), -1);
});

test("tracés : ligne et escalier", () => {
  const X = (v) => v * 10, Y = (v) => 100 - v;
  assert.equal(G.chemin([[0, 0], [1, 10], [2, 5]], X, Y), "M0.0 100.0L10.0 90.0L20.0 95.0");
  assert.equal(G.chemin([[0, 0], [1, 10]], X, Y, true), "M0.0 100.0H10.0V90.0");
});

test("montants compacts", () => {
  assert.equal(G.compact(150000).replace(/\s/g, " "), "150 k");
  assert.equal(G.compact(2500).replace(/\s/g, " "), "2,5 k");
  assert.equal(G.compact(1200000).replace(/\s/g, " "), "1,2 M");
  assert.equal(G.compact(7.5), "7,5");
});
