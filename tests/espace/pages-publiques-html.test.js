'use strict';
/* Pages publiques : HTML à jour avec le générateur (donc avec les moteurs), propre (CSP, SEO) et relié au reste du site. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../../scripts/pages-publiques.js');
const C = require('../../public/commun/pages-calcul.js');

const PUB = path.join(__dirname, '../../public');
const lire = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const pages = G.generer();

test('chaque page publiée correspond au générateur (sinon : node scripts/pages-publiques.js)', () => {
  assert.equal(Object.keys(pages).length, 4);
  for (const [f, html] of Object.entries(pages)) assert.ok(lire(f) === html, 'public/' + f + ' à régénérer');
});

test('CSP : aucun attribut style ni script en ligne (hors données structurées)', () => {
  for (const html of Object.values(pages)) {
    assert.equal(/\sstyle=/.test(html), false);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    assert.ok(scripts.every((a) => /\bsrc="\//.test(a) || /type="application\/ld\+json"/.test(a)));
    assert.equal(/\son[a-z]+="/.test(html), false);
  }
});

test('SEO : titre, description et adresse canonique propres, FAQ structurée identique à la FAQ visible', () => {
  const titres = new Set();
  const sitemap = lire('sitemap.xml');
  for (const p of G.PAGES) {
    const html = pages[p.slug + '.html'];
    const titre = /<title>([^<]+)<\/title>/.exec(html)[1];
    assert.ok(titre.length <= 75 && !titres.has(titre), titre);
    titres.add(titre);
    const desc = /<meta name="description" content="([^"]+)"/.exec(html)[1];
    assert.ok(desc.length >= 120 && desc.length <= 230, p.slug + ' : description de ' + desc.length + ' caractères');
    assert.ok(html.includes(`<link rel="canonical" href="${G.SITE}/${p.slug}">`));
    assert.ok(sitemap.includes(`<loc>${G.SITE}/${p.slug}</loc>`), p.slug + ' dans le sitemap');
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const faq = ld['@graph'].find((x) => x['@type'] === 'FAQPage');
    const visibles = [...html.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary>/g)].length;
    assert.equal(faq.mainEntity.length, visibles);
    assert.ok(faq.mainEntity.every((q) => q.name && q.acceptedAnswer.text && !/[<>]/.test(q.acceptedAnswer.text)));
    assert.ok(ld['@graph'].some((x) => x['@type'] === 'BreadcrumbList'));
  }
});

test('chaque valeur affichée (data-v) est fournie par le calcul, et les pages se citent entre elles', () => {
  const entrees = { salaire: { montant: 2500 }, credit: { net: C.DEFAUT.net }, impot: { montant: 2500 }, retraite: { montant: 2500 } };
  for (const p of G.PAGES) {
    const html = pages[p.slug + '.html'], aff = C.affichage(p.cle, entrees[p.cle], G.DATE_PAGES);
    for (const [, cle] of html.matchAll(/data-v="([a-z_]+)"/g)) assert.ok(Object.prototype.hasOwnProperty.call(aff, cle), p.cle + ' : ' + cle);
    for (const q of G.PAGES) if (q.cle !== p.cle) assert.ok(html.includes(`href="/${q.slug}"`), p.slug + ' → ' + q.slug);
    assert.ok(html.includes('id="calc"') && html.includes(`data-page="${p.cle}"`));
  }
});

test('le chiffre de la page salaire est celui du moteur (et de l\'accueil)', () => {
  const html = pages['salaire-net-tunisie.html'];
  assert.match(html, /<span data-v="net_ent">1 849<\/span><small data-v="net_dec">,310 DT<\/small>/);
});

test('en-têtes de sécurité : une CSP pour chaque page publique, avec et sans .html', () => {
  const h = lire('_headers');
  for (const p of G.PAGES) for (const u of ['/' + p.slug, '/' + p.slug + '.html']) {
    const i = h.split('\n').indexOf(u);
    assert.ok(i > 0, u);
    assert.match(h.split('\n')[i + 1], /^\s+Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'/);
  }
});
