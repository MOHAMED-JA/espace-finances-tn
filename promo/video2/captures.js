/* Captures de l'application pour la vidéo 45 s (16:9) : thème sombre, profil de démonstration fictif,
   faux Supabase (rien n'est envoyé). Écrit captures/*.png et chiffres.json (valeurs calculées par Orbite). */
const RACINE = require("path").join(__dirname, "..", "..");
const { chromium } = require("/home/user/portail-rh/node_modules/playwright-core");
const fs = require("fs");
const { demarrer } = require(RACINE + "/e2e/serveur.js");
const Faux = require(RACINE + "/e2e/faux-supabase.js");
const SUPABASE = "https://txrwgqgnqdkipwtwpevl.supabase.co";
const OUT = __dirname + "/captures/";
/* Profil fictif : salarié du privé, célibataire, embauché en 2014 (comme la fiche de paie de démonstration). */
const PROFIL = { prenom: "Aziz", nom: "Démo", dateNaissance: "1990-03-01", dateEmbauche: "2014-09-01", situation: "celibataire", chefDeFamille: false, enfants: 0,
  montant: 2700, sens: "brut", periode: "mensuel", nombreSalaires: 12, primesImposables: 300, secteur: "prive", baseBanque: "brut",
  epargneDisponible: 9000, loyer: 550, chargesFixes: 400,
  historiqueSalaire: [{ montant: 2300, sens: "brut", periode: "mensuel", mois: 0, annee: 0 }, { montant: 2500, sens: "brut", periode: "mensuel", mois: 1, annee: 2024 }, { montant: 2700, sens: "brut", periode: "mensuel", mois: 1, annee: 2026 }],
  credits: [{ type: "auto", libelle: "Crédit auto", tauxPct: 9, mensualite: 520, dureeMois: 60, moisDebut: 4, anneeDebut: 2024 }],
  contrats: [{ type: "av", libelle: "Assurance vie", anneeDebut: 2023, moisDebut: 1, versementMensuel: 150 }] };
const pause = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const serveur = await demarrer(0), base = "http://127.0.0.1:" + serveur.address().port, faux = Faux.creer();
  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "fr-FR", colorScheme: "dark", bypassCSP: true });
  await ctx.route(SUPABASE + "/**", (r) => faux.gerer(r));
  /* Cloudflare Turnstile (hors réseau ici) : faux script qui valide tout de suite, comme dans les tests. */
  await ctx.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript",
    body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('jeton-demo')},50);return 1},reset:function(){}};" }));
  await ctx.route("https://api.pwnedpasswords.com/**", (r) => r.fulfill({ status: 200, body: "", headers: { "Access-Control-Allow-Origin": "*" } }));
  const p = await ctx.newPage();
  await p.goto(base + "/connexion.html?mode=inscription");
  await p.fill("#nom", "Aziz Démo"); await p.fill("#email", "demo@orbite.tn"); await p.fill("#mdp", "Demo-Orbite-2026!"); await p.fill("#mdp2", "Demo-Orbite-2026!");
  await p.check("#cgu"); await p.click("#envoyer");
  await p.waitForURL(/\/espace\//);
  await p.waitForFunction(() => window.Orbite && window.Orbite.pret);
  await p.evaluate((pr) => window.Orbite.majProfil(pr, { immediat: true }), PROFIL);
  await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await p.addStyleTag({ content: ".toasts,.pastille-acces,.rail a[data-vue=abonnement],.rail a[data-vue=admin],#demarrage,.visite{display:none!important} *{caret-color:transparent!important}" });
  const chiffres = await p.evaluate(() => {
    const s = window.Orbite.synthese(), pr = window.Orbite.profil();
    const pg = window.Progression && window.Progression.serie ? null : null;
    return { netMensuel: s.salaire.netMensuel, brutMensuel: s.salaire.brutMensuel, prenom: pr.prenom };
  });
  await p.goto(base + "/espace/#orbite"); await pause(p, 2600);
  await p.screenshot({ path: OUT + "d-orbite.png" });
  await p.locator("#cap-paliers").scrollIntoViewIfNeeded(); await pause(p, 700);
  await p.locator("#cap-paliers").screenshot({ path: OUT + "d-marge.png" });
  /* Fiche de paie : lecture du PDF de démonstration, vérification, contrôle. */
  await p.goto(base + "/espace/#salaire"); await pause(p, 900);
  await p.screenshot({ path: OUT + "d-salaire.png" });
  await p.click("#fiche-controle");
  await p.setInputFiles("#fiche-fichier", RACINE + "/e2e/fixtures/fiche-paie.pdf");
  await p.waitForSelector('#dlg-fiche[data-ecran="verifier"]', { timeout: 20000 }); await pause(p, 500);
  await p.locator("#dlg-fiche").screenshot({ path: OUT + "fiche-verifier.png" });
  await p.click("#fiche-controler");
  await p.waitForSelector('#dlg-fiche[data-ecran="controle"]'); await pause(p, 600);
  await p.locator("#dlg-fiche").screenshot({ path: OUT + "fiche-controle.png" });
  chiffres.controle = await p.$$eval("#fiche-table-corps tr", (t) => t.map((r) => Array.from(r.cells).map((c) => c.textContent)));
  await p.click("#fiche-fermer-sans");
  /* Ma progression : carrière (pouvoir d'achat) et retraite. */
  await p.goto(base + "/espace/#progression?onglet=carriere"); await pause(p, 1600);
  await p.locator("#pg-carriere").screenshot({ path: OUT + "pg-carriere.png" });
  chiffres.phrase = (await p.textContent("#pg-phrase").catch(() => "")).trim();
  chiffres.pouvoir = (await p.textContent("#pg-r-pa").catch(() => "")).trim();
  await p.goto(base + "/espace/#progression?onglet=retraite"); await pause(p, 1600);
  await p.locator("#pg-retraite").screenshot({ path: OUT + "pg-retraite.png" });
  chiffres.retraite = (await p.textContent("#pr-net").catch(() => "")).trim();
  /* Mon année en orbite : deuxième carte. */
  await p.goto(base + "/espace/#progression"); await pause(p, 900);
  if (await p.isVisible("#btn-annee")) {
    await p.click("#btn-annee"); await p.waitForSelector("#dlg-annee[open]"); await pause(p, 400);
    await p.click("#annee-pause").catch(() => {});
    await p.click("#annee-suiv"); await pause(p, 900);
    await p.locator("#dlg-annee .annee-carte:not([hidden])").screenshot({ path: OUT + "annee.png" });
    await p.keyboard.press("Escape");
  }
  /* Accueil public avec le drapeau. */
  const pub = await ctx.newPage();
  await pub.goto(base + "/"); await pause(pub, 1500);
  await pub.screenshot({ path: OUT + "d-accueil.png" });
  fs.writeFileSync(__dirname + "/chiffres.json", JSON.stringify(chiffres, null, 2));
  console.log(JSON.stringify(chiffres, null, 2));
  await nav.close(); serveur.close();
})().catch((e) => { console.error(e); process.exit(1); });
