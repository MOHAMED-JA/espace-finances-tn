'use strict';
/* Référencement : Google doit pouvoir charger tout ce que l'accueil utilise, et rien de l'Espace privé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.join(__dirname, '../../public');
const robots = fs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8');
const accueil = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

/* Règles de Google : la règle la plus longue gagne, Allow l'emporte à égalité ; « * » et « $ » reconnus. */
const regles = robots.split('\n').map((l) => l.replace(/#.*/, '').trim())
  .map((l) => /^(allow|disallow):\s*(\S*)$/i.exec(l)).filter(Boolean)
  .map((m) => ({ permis: m[1].toLowerCase() === 'allow', motif: m[2] }));
function autorise(url) {
  let gagnante = null;
  for (const r of regles) {
    if (!r.motif) continue;
    const re = new RegExp('^' + r.motif.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
    if (!re.test(url)) continue;
    if (!gagnante || r.motif.length > gagnante.motif.length || (r.motif.length === gagnante.motif.length && r.permis)) gagnante = r;
  }
  return gagnante ? gagnante.permis : true;
}

test('robots.txt : chaque fichier chargé par l\'accueil est lisible par Google', () => {
  /* Ressources chargées (scripts, styles, polices, icônes) ; les liens de navigation <a> ne comptent pas. */
  const locaux = [...accueil.matchAll(/<(?:script|img|source)\b[^>]*\ssrc="(\/[^"/][^"]*)"|<link\b[^>]*\shref="(\/[^"/][^"]*)"/g)]
    .map((m) => (m[1] || m[2]).split('?')[0]);
  assert.ok(locaux.length > 20);
  const bloques = locaux.filter((u) => !autorise(u));
  assert.deepEqual(bloques, []);
});

test('robots.txt : accueil et pages du sitemap autorisés, Espace et connexion interdits', () => {
  const sitemap = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  for (const [, u] of sitemap.matchAll(/<loc>https:\/\/[^/]+(\/[^<]*)<\/loc>/g)) assert.ok(autorise(u), u);
  for (const u of ['/espace/', '/espace/index.html', '/espace/js/appli.js', '/connexion', '/connexion.html', '/rappels.html', '/outils/']) assert.equal(autorise(u), false, u);
  assert.match(robots, /^Sitemap: https:\/\/espace-finances-tn\.jaouadimohamedaziz\.workers\.dev\/sitemap\.xml$/m);
});

test('robots.txt : uniquement des caractères ASCII (servi sans charset, les accents s\'afficheraient mal)', () => {
  assert.equal(/[^\x00-\x7F]/.test(robots), false);
});

test('accueil : balise de vérification Google Search Console présente', () => {
  assert.match(accueil, /<meta name="google-site-verification" content="K71Vq0bdDlttCVDnTeH7UCR6ePTGkXGDUuHvFIACOZ8">/);
});
