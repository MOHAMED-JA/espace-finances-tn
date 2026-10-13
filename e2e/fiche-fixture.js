'use strict';
/* Génère les fiches de paie fictives du lot 7 : un PDF texte et une « photo » (légère rotation, papier, flou),
 * et la fiche « autres lignes » (fiche-paie-lignes.html → .pdf).
 * Usage : CHROMIUM=… NODE_PATH=… node e2e/fiche-fixture.js */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const dossier = path.join(__dirname, 'fixtures');
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const page = await nav.newPage({ viewport: { width: 840, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(dossier, 'fiche-paie.html'));
  await page.pdf({ path: path.join(dossier, 'fiche-paie.pdf'), format: 'A4', printBackground: true });
  /* Photo : la fiche posée de travers sur une table, éclairage inégal. */
  await page.addStyleTag({ content: 'body{background:#8a7f70} .fiche{transform:rotate(-1.2deg);box-shadow:0 10px 30px rgba(0,0,0,.35);filter:blur(.45px) contrast(.92)} .fiche::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,.0),rgba(0,0,0,.07))} .fiche{position:relative}' });
  await page.screenshot({ path: path.join(dossier, 'fiche-paie.jpg'), type: 'jpeg', quality: 82, fullPage: true });
  /* Fiche avec d'autres lignes (13 oct. 2026) : retraite complémentaire, assurance groupe, bonification, syndicat,
     assurance auto, prêt retenu sur la paie. */
  const p2 = await nav.newPage({ viewport: { width: 840, height: 1000 } });
  await p2.goto('file://' + path.join(dossier, 'fiche-paie-lignes.html'));
  await p2.pdf({ path: path.join(dossier, 'fiche-paie-lignes.pdf'), format: 'A4', printBackground: true });
  await nav.close();
  console.log('ok');
})();
