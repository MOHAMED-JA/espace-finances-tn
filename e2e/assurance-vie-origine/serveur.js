/* Serveur statique minimal pour les tests de bout en bout (aucune dépendance). */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};
const port = Number(process.env.PORT || 8123);

http.createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const fichier = path.normalize(path.join(RACINE, chemin === '/' ? 'index.html' : chemin));
  if (!fichier.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Serveur de test sur http://127.0.0.1:' + port));
