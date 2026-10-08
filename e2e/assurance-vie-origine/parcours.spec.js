// Parcours utilisateur de bout en bout (bureau et mobile). Lancement : npx playwright test
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

const nb = (s) => s.replace(/[\s  ]/g, '');

test.beforeEach(async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  page.erreurs = erreurs;
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(page.erreurs, 'aucune erreur JavaScript').toEqual([]);
});

test('saisie du revenu et du versement : résultats calculés', async ({ page }) => {
  await expect(page.locator('#vide')).toBeVisible();
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#resultats')).toBeVisible();
  await expect(page.locator('#tax-saved')).toHaveText(/2\s?070,000/);
  await expect(page.locator('#tax-before')).toHaveText(/10\s?630,000/);
  await expect(page.locator('#tax-brackets-comparison tr')).toHaveCount(8);
  await expect(page.locator('#graph-economie svg')).toBeVisible();
  await expect(page.locator('#graph-capital svg')).toBeVisible();
});

test('« 45,000 » est signalé et corrigé en 45 000', async ({ page }) => {
  await page.fill('#revenue', '45,000');
  await expect(page.locator('#revenue-amb')).toBeVisible();
  await expect(page.locator('#revenue-amb')).toContainText('45 000');
  await page.locator('#revenue-amb button').click();
  expect(nb(await page.inputValue('#revenue'))).toBe('45000');
  await expect(page.locator('#revenue-amb')).toBeHidden();
});

test('« Appliquer ce montant » atteint le plancher légal', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.click('#appliquer');
  await expect(page.locator('#suggest-state')).toBeVisible();
  await expect(page.locator('#tax-reduction-rate')).toHaveText(/55,0/);
});

test('mode inverse : montant à verser pour une économie visée', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#inv-cible', '1500');
  await expect(page.locator('#inv-res')).toContainText('356,061');
  await page.click('#inv-appliquer');
  expect(nb(await page.inputValue('#investment-amount-period'))).toBe('356,061');
  await expect(page.locator('#tax-saved')).toHaveText(/1\s?500,0/);
  await page.fill('#inv-cible', '999999');
  await expect(page.locator('#inv-res')).toContainText('5 846,500');
});

test('rapport PDF téléchargé', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#proj-resultat')).toBeVisible();
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('.barre-rapport .js-pdf').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^simulation-SIM-\d{8}-\w+\.pdf$/);
  const contenu = fs.readFileSync(await telechargement.path());
  expect(contenu.subarray(0, 5).toString()).toBe('%PDF-');
  expect(contenu.length).toBeGreaterThan(10000);
});

test('lien de partage : QR code et restauration de la simulation', async ({ page, context }) => {
  await page.fill('#revenue', '52000');
  await page.fill('#investment-amount-period', '700');
  await page.locator('#chef [data-val="1"]').click();
  await page.click('#partager');
  await expect(page.locator('#qr-lien svg')).toBeVisible();
  const lien = await page.inputValue('#lien-partage');
  expect(lien).toContain('r=52000');
  expect(lien).toContain('c=1');
  const autre = await context.newPage();
  await autre.goto(lien);
  expect(nb(await autre.inputValue('#revenue'))).toBe('52000');
  expect(nb(await autre.inputValue('#investment-amount-period'))).toBe('700');
  await expect(autre.locator('#chef [data-val="1"]')).toHaveAttribute('aria-checked', 'true');
  await expect(autre.locator('#tax-saved')).toHaveText(await page.locator('#tax-saved').textContent());
});

test('rachat anticipé et prévoyance', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#carte-rachat')).toBeVisible();
  await expect(page.locator('#rachat-res .statut.ko')).toBeVisible();
  await expect(page.locator('#rachat-res')).toContainText('11 320,000');
  await page.fill('#r-annee', '12');
  await expect(page.locator('#rachat-err')).not.toBeEmpty();
  await page.fill('#p-duree', '12');
  await page.fill('#r-annee', '10');
  await expect(page.locator('#rachat-res .statut.ok')).toBeVisible();
  await expect(page.locator('#prev-lignes')).toContainText(/\d/);
});

test('portefeuille : enregistrer, comparer et exporter', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await page.click('#enregistrer');
  await expect(page.locator('.port-item')).toHaveCount(1);
  await page.fill('#investment-amount-period', '1000');
  await page.click('#enregistrer');
  await expect(page.locator('.port-item')).toHaveCount(2);
  for (const c of await page.locator('.port-item input[type="checkbox"]').all()) await c.check();
  await page.click('#port-comparer');
  await expect(page.locator('#port-comparaison table')).toBeVisible();
  await expect(page.locator('#port-comparaison .meilleur').first()).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#port-export')]);
  const texte = fs.readFileSync(await csv.path(), 'utf8');
  expect(texte.split('\r\n').filter(Boolean)).toHaveLength(3);
  await page.reload();
  await expect(page.locator('.port-item')).toHaveCount(2);
});

test('langues : anglais puis arabe (droite à gauche)', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.selectOption('#langue', 'en');
  await expect(page.locator('#t-famille')).toHaveText('Family situation');
  await expect(page).toHaveTitle(/Simulator/);
  await page.selectOption('#langue', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('#t-famille')).toHaveText('الوضعية العائلية');
  await page.selectOption('#langue', 'fr');
  await expect(page.locator('#t-famille')).toHaveText('Situation familiale');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test.describe('petit téléphone (320 px)', () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('aucun défilement horizontal, dans les trois langues', async ({ page }) => {
    await page.fill('#revenue', '60000');
    await page.fill('#investment-amount-period', '400');
    await page.fill('#cea-period', '300');
    await page.click('#p-avance summary');
    await page.click('#libre-ajouter');
    await page.fill('#ob-servi', '7');
    await expect(page.locator('#mc-phrases .mc-phrase')).toHaveCount(4);
    await page.click('#scn-ajouter');
    await page.click('[data-variante="optimal"]');
    await page.click('[data-modele="retraite"]');
    await page.fill('#cp-revenu', '25000');
    await page.click('#verrou');
    for (const l of ['fr', 'en', 'ar']) {
      await page.selectOption('#langue', l);
      const [large, visible] = await page.evaluate(() => [window.innerWidth, document.documentElement.clientWidth]);
      expect(large, l).toBe(visible);
    }
  });
});

test('aucun défilement horizontal, dans les trois langues', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  for (const l of ['fr', 'en', 'ar']) {
    await page.selectOption('#langue', l);
    await page.check('#p-retraite'); await page.click('#partager');
    const [large, visible] = await page.evaluate(() => [window.innerWidth, document.documentElement.clientWidth]);
    expect(large, l).toBe(visible);
  }
});

test('objectif de capital et mode retraite', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.check('#p-retraite');
  await page.fill('#p-age', '35');
  await page.fill('#p-depart', '60');
  await expect(page.locator('#p-duree')).toHaveValue('25');
  await page.fill('#obj-capital', '150000');
  await expect(page.locator('#obj-res')).toContainText('150 000');
  await page.click('#obj-appliquer');
  await expect(page.locator('#scen-median')).toHaveText(/^150\s?000,\d{3}/);
  await page.fill('#p-age', '70');
  await expect(page.locator('#retraite-err')).not.toBeEmpty();
});

test('comparatif des placements et revenu à la retraite', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#comparatif-barres .cmp-ligne')).toHaveCount(4);
  await page.fill('#v-pension', '1500');
  await expect(page.locator('#prev-lignes')).toContainText('1 500,000');
});

test('agence : coordonnées mémorisées et logo', async ({ page }) => {
  await page.click('#mode-conseiller');
  await page.click('#agence summary');
  await page.fill('#ag-nom', 'Agence Test');
  await page.fill('#c-conseiller', 'A. Conseiller');
  await page.setInputFiles('#ag-logo', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.locator('#ag-logo-apercu img')).toBeVisible();
  await page.reload();
  await expect(page.locator('#ag-nom')).toHaveValue('Agence Test');
  await expect(page.locator('#c-conseiller')).toHaveValue('A. Conseiller');
  await expect(page.locator('#ag-logo-apercu img')).toHaveCount(1);
});

test('portefeuille : tableau de bord, sauvegarde et restauration', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await page.click('#enregistrer');
  await expect(page.locator('#port-stats')).toBeVisible();
  await expect(page.locator('#st-nombre')).toHaveText('1');
  const [fichier] = await Promise.all([page.waitForEvent('download'), page.click('#port-sauver')]);
  const contenu = fs.readFileSync(await fichier.path(), 'utf8');
  page.once('dialog', (d) => d.accept());
  await page.click('#port-vider');
  await expect(page.locator('.port-item')).toHaveCount(0);
  await page.setInputFiles('#port-restaurer', { name: 'sauvegarde.json', mimeType: 'application/json', buffer: Buffer.from(contenu) });
  await expect(page.locator('.port-item')).toHaveCount(1);
  await page.setInputFiles('#port-restaurer', { name: 'faux.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
  await expect(page.locator('.toast-erreur')).toBeVisible();
});

test('partage : liens WhatsApp et e-mail, infobulles et FAQ', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.click('#partager');
  await expect(page.locator('#envoi-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.*r%3D45000/);
  await expect(page.locator('#envoi-email')).toHaveAttribute('href', /^mailto:\?subject=/);
  await page.click('[aria-controls="aide-plancher"]');
  await expect(page.locator('#aide-plancher')).toBeVisible();
  await page.click('[aria-controls="aide-plancher"]');
  await expect(page.locator('#aide-plancher')).toBeHidden();
  await page.locator('.faq summary').first().click();
  await expect(page.locator('.faq details').first()).toHaveAttribute('open', '');
});

test('installer l\'application : fenêtre, QR code et invitation du navigateur', async ({ page, isMobile }) => {
  await expect(page.locator('#installer')).toBeVisible();
  await page.click('#installer');
  const fenetre = page.locator('#fenetre-installation');
  await expect(fenetre).toBeVisible();
  if (isMobile) {
    /* Android sans invitation du navigateur : attente, puis étapes par le menu */
    await expect(page.locator('#fi-installer')).toBeDisabled();
    await expect(page.locator('.fi-etapes li')).toHaveCount(3, { timeout: 6000 });
    await expect(page.locator('#fi-qr')).toBeHidden();
  } else {
    /* Ordinateur : QR code d'installation et affiche à imprimer */
    await expect(page.locator('#fi-qr-code svg')).toBeVisible();
    const [affiche] = await Promise.all([page.waitForEvent('download'), page.click('#fi-affiche')]);
    expect(affiche.suggestedFilename()).toBe('affiche-installation-simulateur.pdf');
    expect(fs.readFileSync(await affiche.path()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  await page.click('#fi-fermer');
  await expect(fenetre).toBeHidden();
  /* Invitation du navigateur (événement beforeinstallprompt simulé) */
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__invite = (window.__invite || 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.click('#installer');
  if (!isMobile) {
    await expect(page.locator('#fi-installer')).toBeEnabled();
    await page.click('#fi-installer');
  }
  await expect.poll(() => page.evaluate(() => window.__invite)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#installer')).toBeHidden();
});

test('QR code : l\'adresse ?installer=1 ouvre la fenêtre d\'installation', async ({ page }) => {
  await page.goto('/?installer=1');
  await expect(page.locator('#fenetre-installation')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('le QR code contient l\'adresse publique d\'installation', async ({ page }) => {
  const url = await page.evaluate(() => window.ConfigSimulateur.urlPublique);
  expect(url).toBe('https://mohamed-ja.github.io/simulateur-assurance-vie/');
});

test('assurance vie et CEA : règles distinctes et répartition', async ({ page }) => {
  await page.fill('#revenue', '60000');
  await page.fill('#cea-period', '4000');
  /* CEA seul : réduction plafonnée à 40 % de l'impôt */
  await expect(page.locator('#tax-reduction-rate')).toHaveText(/^40,0/);
  await expect(page.locator('#suggest-cea')).toContainText('40 %');
  /* Complément d'assurance vie jusqu'au plancher de 45 % */
  await page.click('#appliquer');
  await expect(page.locator('#tax-reduction-rate')).toHaveText(/^55,0/);
  await expect(page.locator('#repartition-economie')).toBeVisible();
  await expect(page.locator('#deductions')).toContainText('CEA');
  /* Plafond de 100 000 TND */
  await page.fill('#cea-initial', '120000');
  await expect(page.locator('#alerte-plafond')).toBeVisible();
});

test('rachat CEA (blocage 5 ans) et avance sur contrat', async ({ page }) => {
  await page.fill('#revenue', '60000');
  await page.fill('#investment-amount-period', '500');
  await page.fill('#cea-period', '300');
  await expect(page.locator('#bloc-r-produit')).toBeVisible();
  await page.locator('#r-produit [data-val="cea"]').click();
  await page.fill('#r-annee', '3');
  await expect(page.locator('#rachat-res .statut.ko')).toContainText(/bloqués/);
  await page.locator('#r-produit [data-val="av"]').click();
  await page.fill('#r-annee', '5');
  await page.click('#bloc-avance summary');
  await page.fill('#a-montant', '5000');
  await expect(page.locator('#avance-res')).toContainText('Mensualité');
  await page.fill('#a-montant', '9999999');
  await expect(page.locator('#avance-err')).not.toBeEmpty();
});

test('versement initial, versements libres, retraits programmés et taux garanti', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#av-initial', '10000');
  await expect(page.locator('#proj-resultat')).toBeVisible();
  await page.fill('#p-garanti', '3');
  await expect(page.locator('#p-participation')).toContainText('3,0');
  await expect(page.locator('#scen-l-prudent')).toContainText('4,0');
  await page.fill('#p-garanti', '5');
  await expect(page.locator('#scen-l-prudent')).toContainText('5,0');
  await page.click('#p-avance summary');
  await page.click('#libre-ajouter');
  await page.locator('.libre-annee').first().fill('3');
  await page.locator('.libre-montant').first().fill('2000');
  await page.fill('#p-duree', '12');
  await page.fill('#p-retrait-debut', '5');
  await page.fill('#p-retrait-montant', '1000');
  await expect(page.locator('#proj-err')).toContainText('8');
  await page.fill('#p-retrait-debut', '9');
  await expect(page.locator('#proj-err')).toBeEmpty();
  await expect(page.locator('#proj-lignes')).toContainText('Retraits programmés perçus');
  /* Le lien de partage transporte ces hypothèses */
  await page.click('#partager');
  const lien = await page.inputValue('#lien-partage');
  expect(lien).toContain('L=3%3A2000');
  expect(lien).toContain('b=10000');
});

test('être rappelé : visible seulement si l\'agence a un téléphone ou un e-mail', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await expect(page.locator('#rappel')).toBeHidden();
  await page.click('#mode-conseiller');
  await page.click('#agence summary');
  await page.fill('#ag-tel', '+216 71 000 000');
  await expect(page.locator('#rappel')).toBeVisible();
  await page.context().route('https://wa.me/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  const [requete] = await Promise.all([page.context().waitForEvent('request', (r) => r.url().startsWith('https://wa.me/')), page.click('#rappel')]);
  expect(requete.url()).toContain('wa.me/21671000000?text=');
});

test('mode simple : réglages avancés masqués et mémorisés', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#carte-strategie')).toBeVisible();
  await page.click('#mode-simple');
  await expect(page.locator('#mode-simple')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#carte-strategie')).toBeHidden();
  await expect(page.locator('#carte-portefeuille')).toBeHidden();
  await expect(page.locator('#carte-mc')).toBeVisible();
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/mode-simple/);
  await page.click('#mode-simple');
  await expect(page.locator('#carte-portefeuille')).toBeVisible();
});

test('simulation guidée en 3 étapes', async ({ page }) => {
  await page.click('#guide-vide');
  await expect(page.locator('#guide')).toBeVisible();
  await page.click('#guide-suivant');
  await expect(page.locator('#g-revenu-err')).not.toBeEmpty();
  await page.fill('#g-revenu', '45000');
  await page.click('#guide-suivant');
  await expect(page.locator('#guide-etape-lib')).toHaveText('Étape 2 sur 3');
  await page.locator('#g-chef [data-val="1"]').click();
  await page.fill('#g-enfants', '2');
  await page.click('#guide-suivant');
  await expect(page.locator('#g-conseil')).toContainText('par mois');
  await page.click('#g-optimal');
  expect(nb(await page.inputValue('#g-versement'))).not.toBe('');
  await page.click('#guide-suivant');
  await expect(page.locator('#guide')).toBeHidden();
  expect(nb(await page.inputValue('#revenue'))).toBe('45000');
  expect(await page.inputValue('#children')).toBe('2');
  await expect(page.locator('#chef [data-val="1"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#frequence [data-val="Mensuel"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#resultats')).toBeVisible();
});

test('« Et si » et curseur temporel', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await expect(page.locator('#si-versement-val')).toContainText('500');
  await page.locator('#si-versement').fill('800');
  await expect.poll(async () => nb(await page.inputValue('#investment-amount-period'))).toBe('800');
  await page.locator('#si-duree').fill('20');
  await expect.poll(() => page.inputValue('#p-duree')).toBe('20');
  await expect(page.locator('#annee-curseur')).toHaveAttribute('max', '20');
  await page.locator('#annee-curseur').fill('5');
  await expect(page.locator('#lecture-annee')).toContainText('Année 5');
  await expect(page.locator('#graph-capital .g-viseur')).toHaveCount(1);
});

test('graphiques interactifs : infobulle au survol', async ({ page, isMobile }) => {
  test.skip(isMobile, 'survol à la souris');
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  const g = page.locator('#graph-capital svg');
  await g.scrollIntoViewIfNeeded();
  const b = await g.boundingBox();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height / 2, { steps: 2 });
  await expect(page.locator('#graph-capital .g-infobulle')).toContainText('Médian');
});

test('Monte-Carlo, stratégie et comparateur de contrats', async ({ page }) => {
  await page.fill('#revenue', '60000');
  await page.fill('#investment-amount-period', '400');
  await page.fill('#cea-period', '200');
  await expect(page.locator('#mc-phrases .mc-phrase.fort')).toContainText('9 chances sur 10');
  await expect(page.locator('#graph-mc .g-bande1')).toHaveCount(1);
  await page.fill('#obj-capital', '80000');
  await expect(page.locator('#mc-phrases .cible')).toContainText('80 000');
  await page.fill('#mc-vol-cea', '99');
  await expect(page.locator('#mc-err')).not.toBeEmpty();
  await expect(page.locator('#strat-corps tr')).toHaveCount(10);
  await expect(page.locator('#contrats-res')).toBeHidden();
  await page.fill('#ob-servi', '7');
  await page.fill('#ob-gestion', '0,5');
  await expect(page.locator('#contrats-res tbody tr')).toHaveCount(2);
  await expect(page.locator('#contrats-res tr.meilleur')).toContainText('Offre B');
  await page.fill('#oc-servi', '3');
  await page.fill('#oc-garanti', '5');
  await expect(page.locator('#contrats-res td.ko')).toHaveCount(1);
  await page.fill('#cea-period', '0');
  await page.fill('#investment-amount-period', '600');
  await expect(page.locator('#strat-appliquer')).toBeVisible();
  await page.click('#strat-appliquer');
  await expect(page.locator('.toast').last()).toContainText('Répartition appliquée');
});

test('présentation client : diapositives au clavier', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await page.click('#presenter');
  await expect(page.locator('#presentation')).toBeVisible();
  await expect(page.locator('#pr-points .pr-point')).toHaveCount(4);
  await expect(page.locator('#pr-diapo')).toContainText('Votre situation');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pr-diapo')).toContainText('Votre économie d\'impôt');
  await page.click('#pr-suivant');
  await expect(page.locator('#pr-diapo svg')).toHaveCount(1);
  await page.locator('#pr-points .pr-point').nth(3).click();
  await expect(page.locator('#pr-diapo')).toContainText('Notre recommandation');
  await expect(page.locator('#pr-suivant')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#presentation')).toBeHidden();
});

test('agenda .ics et proposition commerciale PDF', async ({ page }) => {
  await page.fill('#revenue', '45000');
  await page.fill('#investment-amount-period', '500');
  await page.fill('#cea-period', '100');
  const [ics] = await Promise.all([page.waitForEvent('download'), page.click('#agenda')]);
  const texte = fs.readFileSync(await ics.path(), 'utf8');
  expect(texte).toContain('BEGIN:VCALENDAR');
  expect(texte).toContain('SUMMARY:Versement assurance vie : 500 TND');
  expect(texte).toContain('RRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=120');
  expect(texte).toContain('Assurance vie : 8 ans atteints');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#proposition')]);
  expect(pdf.suggestedFilename()).toMatch(/^proposition-.*\.pdf$/);
  const contenu = fs.readFileSync(await pdf.path()).toString('latin1');
  expect(contenu.startsWith('%PDF')).toBe(true);
  expect((contenu.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(2);
});

test('couleur de l\'agence appliquée à l\'interface puis rétablie', async ({ page }) => {
  await page.click('#mode-conseiller');
  await page.click('#agence summary');
  await page.locator('#ag-couleur').fill('#0f766e');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim())).not.toBe('#4f46e5');
  await expect(page.locator('meta[name="theme-color"]')).not.toHaveAttribute('content', '#4f46e5');
  await page.reload();
  await expect(page.locator('#style-agence')).toHaveCount(1);
  await page.click('#mode-conseiller');
  await page.click('#agence summary');
  await page.click('#ag-couleur-raz');
  await expect(page.locator('#style-agence')).toHaveCount(0);
});

test('raccourcis de l\'application installée : ?guide=1', async ({ page }) => {
  await page.goto('/?guide=1');
  await expect(page.locator('#guide')).toBeVisible();
  expect(page.url()).not.toContain('guide=1');
});

test('thème : menu clair, sombre ou automatique', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#theme-toggle');
  await expect(page.locator('#panneau-theme')).toBeVisible();
  await expect(page.locator('#choix-theme [data-val="auto"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#choix-theme [data-val="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#theme-toggle');
  await page.locator('#choix-theme [data-val="auto"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panneau-theme')).toBeHidden();
  await page.click('#theme-toggle');
  await page.mouse.click(5, 600);
  await expect(page.locator('#panneau-theme')).toBeHidden();
});

test('rubriques : navigation, suivi, filtre et feuille mobile', async ({ page, isMobile }) => {
  await expect(page.locator('.rb-item[data-cle="economie"]')).toHaveAttribute('aria-disabled', 'true');
  if (isMobile) {
    await expect(page.locator('#rb-pilule')).toBeVisible();
    await page.click('#rb-pilule');
    await expect(page.locator('#rubriques')).toHaveClass(/ouvert/);
    await page.click('.rb-item[data-cle="economie"]', { force: true });
    await expect(page.locator('#revenue')).toBeFocused();
  } else {
    await page.click('.rb-item[data-cle="economie"]', { force: true });
    await expect(page.locator('#revenue')).toBeFocused();
  }
  await page.fill('#revenue', '60000');
  await page.fill('#investment-amount-period', '400');
  await expect(page.locator('.rb-item[data-cle="economie"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.rb-val[data-val="economie"]')).toContainText('par an');
  if (isMobile) await page.click('#rb-pilule');
  await page.click('.rb-item[data-cle="mc"]');
  await expect(page.locator('#carte-mc')).toBeInViewport();
  await expect(page.locator('.rb-item[data-cle="mc"]')).toHaveAttribute('aria-current', 'true');
  if (isMobile) {
    await expect(page.locator('#rubriques')).not.toHaveClass(/ouvert/);
    await expect(page.locator('#rb-p-cour')).toHaveText('Projection probabiliste');
    return;
  }
  await page.locator('.hero h1').click();
  await page.keyboard.press('/');
  await expect(page.locator('#rb-filtre')).toBeFocused();
  await page.keyboard.type('prevoy');
  await expect(page.locator('.rb-item:not([hidden])')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#carte-prevoyance')).toBeInViewport();
  await page.click('#mode-simple');
  await expect(page.locator('.rb-item[data-cle="strategie"]')).toBeHidden();
  await page.click('#mode-simple');
  await page.click('#rb-reduire');
  await expect(page.locator('html')).toHaveClass(/nav-reduite/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/nav-reduite/);
  await page.click('#rb-reduire');
  await expect(page.locator('html')).not.toHaveClass(/nav-reduite/);
});

test.describe('fonctions avancées', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem('scenarios'); localStorage.removeItem('objectifs'); });
    await page.fill('#revenue', '60000');
    await page.fill('#investment-amount-period', '400');
    await page.fill('#cea-period', '200');
    await expect(page.locator('#resultats')).toBeVisible();
  });

  test('palette de commandes : saisie directe, action et rubrique', async ({ page }) => {
    await page.locator('.hero h1').click();
    await page.keyboard.press('Control+k');
    await expect(page.locator('#palette')).toBeVisible();
    await page.keyboard.type('av 500');
    await expect(page.locator('.pl-option').first()).toContainText('500,000 TND');
    await page.keyboard.press('Enter');
    await expect(page.locator('#palette')).toBeHidden();
    await expect.poll(async () => nb(await page.inputValue('#investment-amount-period'))).toBe('500');
    await page.click('#ouvrir-palette');
    await page.keyboard.type('stress');
    await page.keyboard.type('');
    await page.fill('#pl-champ', 'resistance');
    await page.keyboard.press('Enter');
    await expect(page.locator('#carte-stress')).toBeInViewport();
    await page.click('#ouvrir-palette');
    await page.fill('#pl-champ', 'zzzz');
    await expect(page.locator('.pl-vide')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#palette')).toBeHidden();
  });

  test('historique : annuler et rétablir', async ({ page }) => {
    await page.waitForTimeout(800);
    await page.fill('#investment-amount-period', '900');
    await page.waitForTimeout(900);
    await expect(page.locator('#annuler')).toBeEnabled();
    await page.click('#annuler');
    await expect.poll(async () => nb(await page.inputValue('#investment-amount-period'))).toBe('400');
    await page.click('#retablir');
    await expect.poll(async () => nb(await page.inputValue('#investment-amount-period'))).toBe('900');
    await page.locator('.hero h1').click();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => nb(await page.inputValue('#investment-amount-period'))).toBe('400');
  });

  test('comparer des scénarios : ajout, variantes, meilleure valeur, retrait et annulation', async ({ page }) => {
    await page.click('#scn-ajouter');
    await page.click('[data-variante="optimal"]');
    await page.click('[data-variante="avSeule"]');
    await expect(page.locator('#scn-zone thead th')).toHaveCount(4);
    await expect(page.locator('#scn-zone td.meilleur').first()).toBeVisible();
    await page.click('[data-variante="avSeule"]');
    await expect(page.locator('.toast').last()).toContainText('déjà');
    await page.click('[data-scn-retirer="2"]');
    await expect(page.locator('#scn-zone thead th')).toHaveCount(3);
    await page.locator('.toast .t-action').last().click();
    await expect(page.locator('#scn-zone thead th')).toHaveCount(4);
    await page.click('[data-scn-appliquer="1"]');
    await expect.poll(async () => Number(nb(await page.inputValue('#investment-amount-period')).replace(',', '.'))).toBeGreaterThan(1000);
  });

  test('couple, objectifs et tests de résistance', async ({ page }) => {
    await page.fill('#cp-revenu', '25000');
    await expect(page.locator('#couple-res .cp-tuile')).toHaveCount(2);
    await expect(page.locator('#couple-res .cp-total')).toContainText('Économie du foyer');
    await page.click('[data-modele="retraite"]');
    await page.click('[data-modele="etudes"]');
    await expect(page.locator('.obj-ligne')).toHaveCount(2);
    await expect(page.locator('#obj-bilan')).toContainText('Besoin total par mois');
    await page.fill('#obj0-montant', '1000');
    await expect(page.locator('#obj0-res')).toContainText('Financé');
    await expect(page.locator('#stress-liste .st-ligne')).toHaveCount(4);
    await page.fill('#st-chute', '50');
    await expect(page.locator('#stress-liste')).toContainText('50,0 %');
    await page.reload();
    await expect(page.locator('.obj-ligne')).toHaveCount(2);
  });

  test('reçu fiscal, classeur Excel et relevé PDF', async ({ page }) => {
    await page.click('#ouvrir-recu');
    await expect(page.locator('#recu')).toBeVisible();
    const [img] = await Promise.all([page.waitForEvent('download'), page.click('#recu-telecharger')]);
    expect(img.suggestedFilename()).toMatch(/\.png$/);
    expect(fs.readFileSync(await img.path()).subarray(1, 4).toString()).toBe('PNG');
    await page.click('#recu-fermer');
    const [x] = await Promise.all([page.waitForEvent('download'), page.click('#export-xlsx')]);
    expect(x.suggestedFilename()).toMatch(/\.xlsx$/);
    const zip = fs.readFileSync(await x.path());
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.toString('latin1')).toContain('xl/worksheets/sheet3.xml');
    const pdf = await page.evaluate(() => {
      const doc = new window.jspdf.jsPDF({ compress: true });
      ['Taux de rendement net servi 2025 : 6,25 %', 'Frais de gestion annuels : 0,8 %'].forEach((l, i) => doc.text(l, 10, 10 + i * 10));
      return Array.from(new Uint8Array(doc.output('arraybuffer')));
    });
    await page.setInputFiles('#import-releve', { name: 'releve.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await expect(page.locator('#releve-liste .releve-ligne')).toHaveCount(2);
    await page.click('#releve-appliquer');
    await expect(page.locator('#p-rendement')).toHaveValue('6,25');
    await expect(page.locator('#p-frais')).toHaveValue('0,8');
  });

  test('verrouillage de la saisie et rappels', async ({ page }) => {
    await page.click('#verrou');
    await expect(page.locator('#bandeau-verrou')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('zone-saisie').inert)).toBe(true);
    await page.click('#deverrouiller');
    expect(await page.evaluate(() => document.getElementById('zone-saisie').inert)).toBe(false);
    /* Chromium sans interface refuse toujours les notifications : autorisation simulée */
    await page.evaluate(() => {
      function N() {}
      N.permission = 'granted';
      N.requestPermission = () => Promise.resolve('granted');
      window.Notification = N;
    });
    await page.click('#ouvrir-rappels');
    await expect(page.locator('#rappels')).toBeVisible();
    await page.selectOption('#rp-jour', '15');
    await page.check('#rp-actif');
    await expect(page.locator('#rp-info')).toContainText('Prochain rappel');
    await page.click('#rp-fermer');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rappel')).jour)).toBe(15);
  });

  test('second écran : la fenêtre client reçoit les diapositives', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'fenêtres multiples sur ordinateur');
    await page.click('#presenter');
    const [client] = await Promise.all([context.waitForEvent('page'), page.click('#pr-ecran')]);
    await client.waitForLoadState();
    await expect(client.locator('#pr-diapo')).toContainText('Votre situation');
    await expect.poll(() => page.evaluate(() => document.getElementById('pr-etat').hidden)).toBe(false);
    await page.bringToFront();
    await page.click('#pr-suivant');
    await expect(client.locator('#pr-diapo')).toContainText('Votre économie d\'impôt');
    await expect(client.locator('.topbar')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(client.locator('#pr-diapo')).toContainText('Merci de votre attention');
  });
});
