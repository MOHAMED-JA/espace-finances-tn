'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18n = require('../../public/outils/assurance-vie/js/i18n.js');
const Baremes = require('../../public/outils/assurance-vie/js/baremes.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'outils', 'assurance-vie', f), 'utf8');
const decoder = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
/* Textes qui restent identiques dans toutes les langues */
const NEUTRES = new Set(['TND', 'PDF', 'Mohamed Aziz Jaouadi', 'MJ', 'Français', 'English', 'العربية']);

function clesJs(fichier) {
  const src = lire(fichier);
  const cles = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  /* Libellés traduits indirectement : périodes, scénarios, colonnes du comparateur, origine du capital décès */
  for (const m of src.matchAll(/\['((?:[^'\\]|\\.)*)', '\w+', '(?:tnd|ent|pct)'/g)) cles.push(m[1].replace(/\\'/g, "'"));
  /* Rubriques de la barre latérale : ['clé', 'sélecteur', 'Libellé', 'i-icone'] et titres de groupe */
  for (const m of src.matchAll(/\['\w+', '[^']*', '((?:[^'\\]|\\.)*)', 'i-[\w-]+'\]/g)) cles.push(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/^    \['((?:[^'\\]|\\.)*)', \[$/gm)) cles.push(m[1].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/(?:Mensuel|Trimestriel|Semestriel|Annuel|prudent|median|dynamique|acquis|verses|garanti): '([^']+)'/g)) cles.push(m[1]);
  return cles;
}

function clesHtml() {
  let html = lire('index.html');
  html = html.slice(html.indexOf('<body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  const cles = [];
  for (const m of html.matchAll(/>([^<>]+)</g)) {
    const s = decoder(m[1].trim());
    if (/[A-Za-zÀ-ÿ]{2}/.test(s) && !NEUTRES.has(s)) cles.push(s);
  }
  for (const m of html.matchAll(/\s(?:placeholder|aria-label|title)="([^"]+)"/g)) {
    const s = decoder(m[1].trim());
    if (/[A-Za-zÀ-ÿ]{2}/.test(s) && !NEUTRES.has(s)) cles.push(s);
  }
  cles.push(decoder(/<title>(.*?)<\/title>/.exec(lire('index.html'))[1]));
  return cles;
}

test('toutes les chaînes de l\'interface et du PDF ont une traduction anglaise et arabe', () => {
  const cles = [...clesHtml(), ...clesJs('js/interface.js'), ...clesJs('js/pdf.js')];
  Object.values(Baremes.annees).forEach((r) => { cles.push(r.libelle, r.source); });
  const manquantes = [...new Set(cles)].filter((c) => !I18n.connu(c));
  assert.equal(manquantes.length, 0, 'Traductions manquantes dans js/i18n.js :\n' + manquantes.join('\n'));
});

test('chaque traduction a ses deux langues et garde les mêmes paramètres', () => {
  Object.entries(I18n.D).forEach(([fr, tr]) => {
    assert.equal(tr.length, 2, fr);
    tr.forEach((s) => {
      assert.ok(typeof s === 'string' && s.trim(), fr);
      const params = (x) => (x.match(/\{\d+\}/g) || []).sort().join();
      assert.equal(params(s), params(fr), `paramètres différents pour « ${fr} »`);
      assert.equal((s.match(/<br>/g) || []).length, (fr.match(/<br>/g) || []).length, fr);
    });
  });
});

test('t : langue, paramètres et repli sur le français', () => {
  I18n.definir('en');
  assert.equal(I18n.t('Total versé sur {0} an(s)', [10]), 'Total paid in over 10 year(s)');
  assert.equal(I18n.t('Texte inconnu {0}', ['x']), 'Texte inconnu x');
  I18n.definir('ar');
  assert.equal(I18n.langue(), 'ar');
  assert.equal(I18n.t('Oui'), 'نعم');
  I18n.definir('xx');
  assert.equal(I18n.langue(), 'fr');
  assert.equal(I18n.t('Oui'), 'Oui');
});
