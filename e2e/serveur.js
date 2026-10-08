/*
 * Serveur local de public/ qui applique public/_headers comme Cloudflare Pages
 * (règles exactes et « * », valeurs concaténées si plusieurs règles s'appliquent).
 * Permet de vérifier la CSP en conditions réelles avant publication.
 * Usage : node e2e/serveur.js [port]
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.join(__dirname, "..", "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon"
};

function lireRegles() {
  const regles = [];
  let courante = null;
  for (const brute of fs.readFileSync(path.join(RACINE, "_headers"), "utf8").split("\n")) {
    if (!brute.trim() || brute.trim().startsWith("#")) continue;
    if (!/^\s/.test(brute)) { courante = { motif: brute.trim(), entetes: [] }; regles.push(courante); continue; }
    const i = brute.indexOf(":");
    courante.entetes.push([brute.slice(0, i).trim(), brute.slice(i + 1).trim()]);
  }
  return regles.map((r) => ({
    ...r,
    re: new RegExp("^" + r.motif.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$")
  }));
}

function entetesPour(chemin) {
  const res = {};
  for (const r of lireRegles()) {
    if (!r.re.test(chemin)) continue;
    for (const [k, v] of r.entetes) res[k] = res[k] ? res[k] + ", " + v : v;
  }
  return res;
}

function servir(req, res) {
  const url = new URL(req.url, "http://localhost");
  let chemin = decodeURIComponent(url.pathname);
  let fichier = path.join(RACINE, chemin);
  if (!fichier.startsWith(RACINE)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(fichier) && fs.statSync(fichier).isDirectory()) fichier = path.join(fichier, "index.html");
  else if (!fs.existsSync(fichier) && fs.existsSync(fichier + ".html")) fichier += ".html";
  if (!fs.existsSync(fichier) || path.basename(fichier) === "_headers") {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", ...entetesPour(chemin) });
    const page404 = path.join(RACINE, "404.html");
    return res.end(fs.existsSync(page404) ? fs.readFileSync(page404) : "Introuvable");
  }
  const h = entetesPour(chemin);
  /* En local (http) : ni HSTS ni upgrade-insecure-requests */
  delete h["Strict-Transport-Security"];
  if (h["Content-Security-Policy"]) h["Content-Security-Policy"] = h["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream", "Cache-Control": "no-store", ...h });
  fs.createReadStream(fichier).pipe(res);
}

function demarrer(port) {
  return new Promise((ok) => {
    const s = http.createServer(servir).listen(port || 0, "127.0.0.1", () => ok(s));
  });
}

module.exports = { demarrer, entetesPour };
if (require.main === module) {
  demarrer(Number(process.argv[2]) || 8300).then((s) => console.log("http://127.0.0.1:" + s.address().port + "/"));
}
