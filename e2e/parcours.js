/*
 * Parcours de bout en bout (Chromium, Playwright) contre un faux Supabase.
 * Vérifie aussi qu'aucune violation de CSP ni erreur JavaScript ne survient.
 * Usage : node e2e/parcours.js  (variable PLAYWRIGHT_CORE pour un chemin personnalisé)
 */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const { demarrer } = require("./serveur.js");
const Faux = require("./faux-supabase.js");

const SUPABASE = "https://txrwgqgnqdkipwtwpevl.supabase.co";
const CAPTURES = process.env.CAPTURES || path.join(__dirname, "..", "test-results");
let reussis = 0, echecs = 0;

async function etape(nom, fn) {
  try { await fn(); reussis++; console.log("ok - " + nom); }
  catch (e) { echecs++; console.log("not ok - " + nom + "\n    " + String(e && e.stack || e).split("\n").slice(0, 4).join("\n    ")); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion"); }

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const serveur = await demarrer(0);
  const base = "http://127.0.0.1:" + serveur.address().port;
  const faux = Faux.creer();
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(() => chromium.launch());
  const contexte = await navigateur.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  await contexte.route(SUPABASE + "/**", (r) => faux.gerer(r));
  const problemes = [];
  contexte.on("page", suivre);
  function suivre(p) {
    p.on("pageerror", (e) => problemes.push("Erreur JS " + p.url() + " : " + e.message));
    p.on("console", (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) problemes.push("CSP " + p.url() + " : " + t);
      else if (m.type() === "error" && !/Failed to load resource.*(401|404|406)/.test(t)) problemes.push("Console " + p.url() + " : " + t);
    });
  }
  const page = await contexte.newPage();

  await etape("accueil : calculateur signature exact (2 500 DT, chef de famille, 2 enfants)", async () => {
    await page.goto(base + "/");
    await page.waitForFunction(() => document.getElementById("net").textContent.trim() !== "");
    const net = (await page.textContent("#net")).replace(/\s/g, "");
    assert(net === "1862,018", "net affiché : " + net);
    await page.fill("#brut", "3000");
    await page.waitForFunction(() => document.getElementById("net").textContent.replace(/\s/g, "") !== "1862,018");
    await page.check('input[name="secteur"][value="public"]');
    assert((await page.textContent("#lib-caisse")) === "CNRPS");
    await page.screenshot({ path: path.join(CAPTURES, "01-accueil.png"), fullPage: true });
  });

  await etape("une page protégée renvoie vers la connexion avec l'adresse de retour", async () => {
    await page.goto(base + "/outils/credit/?c=1000&m=12&t=8");
    await page.waitForURL(/connexion\.html\?suite=/);
    assert(decodeURIComponent(page.url()).includes("suite=/outils/credit/?c=1000&m=12&t=8"), page.url());
  });

  await etape("inscription : validations sur place puis création du compte", async () => {
    await page.goto(base + "/connexion.html?mode=inscription");
    await page.fill("#email", "pas-un-email");
    await page.fill("#mdp", "court");
    await page.click("#envoyer");
    assert(await page.isVisible("#email-erreur"), "erreur e-mail visible");
    assert(await page.isVisible("#mdp-erreur"), "erreur mot de passe visible");
    assert(await page.evaluate(() => document.activeElement.id) === "email", "focus sur la première erreur");
    await page.fill("#nom", "Aziz Test");
    await page.fill("#email", "aziz@exemple.tn");
    await page.fill("#mdp", "Tunis-2026-solide");
    await page.fill("#mdp2", "Tunis-2026-solide");
    await page.check("#cgu");
    await page.screenshot({ path: path.join(CAPTURES, "02-inscription.png") });
    await page.click("#envoyer");
    await page.waitForURL(/\/espace\/$/);
  });

  await etape("espace vide : salutation, compteurs à zéro, invitation à commencer", async () => {
    await page.waitForSelector("#recentes .vide");
    assert((await page.textContent("#salutation")).includes("Aziz"), await page.textContent("#salutation"));
    assert((await page.textContent('[data-kpi="salaire"]')) === "0");
    await page.screenshot({ path: path.join(CAPTURES, "03-espace-vide.png"), fullPage: true });
  });

  await etape("salaire : enregistrement depuis la barre de l'Espace", async () => {
    await page.goto(base + "/outils/salaire/");
    await page.waitForSelector("#efp-enregistrer");
    await page.waitForFunction(() => window.EspaceOutil && document.getElementById("efp-avatar").textContent !== "·");
    await page.click("#efp-enregistrer");
    await page.waitForSelector("dialog.efp-dialogue[open]");
    const nom = await page.inputValue("#efp-nom");
    assert(/^Salaire 2/.test(nom), "nom par défaut : " + nom);
    await page.screenshot({ path: path.join(CAPTURES, "04-salaire-dialogue.png") });
    await page.fill("#efp-nom", "Mon salaire actuel");
    await page.click("dialog.efp-dialogue button[value=ok]");
    await page.waitForSelector(".efp-toast");
    const s = faux.simulations();
    assert(s.length === 1 && s[0].outil === "salaire" && /m=2500/.test(s[0].parametres.etat), JSON.stringify(s[0] && s[0].parametres));
    assert(s[0].resume.principal && s[0].resume.principal.valeur > 1000, JSON.stringify(s[0].resume));
    assert((await page.textContent("#efp-lib-long")) === "Mettre à jour", "le bouton passe en mise à jour");
  });

  await etape("assurance vie & CEA : saisie du revenu puis enregistrement", async () => {
    await page.goto(base + "/outils/assurance-vie/");
    await page.waitForFunction(() => window.EspaceOutil && document.getElementById("efp-avatar").textContent !== "·");
    await page.fill("#revenue", "60000");
    await page.dispatchEvent("#revenue", "input");
    await page.waitForTimeout(400);
    await page.click("#efp-enregistrer");
    await page.waitForSelector("dialog.efp-dialogue[open]");
    await page.click("dialog.efp-dialogue button[value=ok]");
    await page.waitForSelector(".efp-toast");
    const v = faux.simulations().find((x) => x.outil === "assurance_vie");
    assert(v && /r=60000/.test(v.parametres.etat), JSON.stringify(v && v.parametres));
    assert(v.resume.principal.libelle.includes("Économie"), JSON.stringify(v.resume));
  });

  await etape("crédit : enregistrement d'une simulation reçue par lien", async () => {
    await page.goto(base + "/outils/credit/?c=150000&m=240&t=9.5&ty=immo");
    await page.waitForFunction(() => window.EspaceOutil && window.EspaceOutil.etat() && document.getElementById("efp-avatar").textContent !== "·", null, { timeout: 15000 });
    await page.click("#efp-enregistrer");
    await page.waitForSelector("dialog.efp-dialogue[open]");
    const nom = await page.inputValue("#efp-nom");
    assert(/Immobilier 150/.test(nom), "nom : " + nom);
    await page.click("dialog.efp-dialogue button[value=ok]");
    await page.waitForSelector(".efp-toast");
    const c = faux.simulations().find((x) => x.outil === "credit");
    assert(c && /c=150000/.test(c.parametres.etat) && /m=240/.test(c.parametres.etat), JSON.stringify(c && c.parametres));
    assert(Math.abs(c.resume.principal.valeur - 1398.197) < 0.05, "mensualité : " + c.resume.principal.valeur);
    await page.screenshot({ path: path.join(CAPTURES, "05-credit-barre.png") });
  });

  await etape("espace : trois cartes, compteurs et ouverture d'une simulation", async () => {
    await page.goto(base + "/espace/");
    await page.waitForSelector("#recentes .carte");
    assert((await page.$$("#recentes .carte")).length === 3, "3 cartes");
    assert((await page.textContent('[data-kpi="credit"]')) === "1");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(CAPTURES, "06-espace.png"), fullPage: true });
    await page.click('#recentes .carte[data-outil="credit"] .carte__lien');
    await page.waitForURL(/\/outils\/credit\/$/);
    await page.waitForFunction(() => document.getElementById("efp-lib-long").textContent === "Mettre à jour");
    assert((await page.textContent("#efp-etat")).includes("Immobilier"), "nom affiché dans la barre");
  });

  await etape("simulations : filtre et renommage", async () => {
    await page.goto(base + "/espace/#simulations?outil=salaire");
    await page.waitForSelector("#toutes .carte");
    assert((await page.$$("#toutes .carte")).length === 1, "filtre salaire");
    await page.check('#filtres-outil input[value=""]');
    await page.waitForFunction(() => document.querySelectorAll("#toutes .carte").length === 3);
    const carte = '#toutes .carte[data-outil="salaire"]';
    await page.click(carte + " .carte__menu");
    await page.click('#menu-actions [data-action="renommer"]');
    await page.fill("#nouveau-nom", "Salaire 2026 renommé");
    await page.click('#dlg-renommer button[value="ok"]');
    await page.waitForFunction(() => [...document.querySelectorAll(".carte__nom")].some((n) => n.textContent === "Salaire 2026 renommé"));
    assert(faux.simulations().some((s) => s.nom === "Salaire 2026 renommé"), "renommage enregistré");
  });

  await etape("simulations : favori et suppression avec annulation", async () => {
    const carte = '#toutes .carte[data-outil="salaire"]';
    await page.click(carte + " .carte__favori");
    await page.waitForTimeout(300);
    assert(faux.simulations().find((s) => s.outil === "salaire").favori === true, "favori enregistré");
    await page.click(carte + " .carte__menu");
    await page.click('#menu-actions [data-action="supprimer"]');
    await page.waitForSelector(".toast button");
    assert(faux.simulations().length === 2, "supprimée côté serveur");
    await page.click(".toast button:has-text('Annuler')");
    await page.waitForFunction(() => document.querySelectorAll("#toutes .carte").length === 3);
    assert(faux.simulations().length === 3, "restaurée");
  });

  await etape("isolation : un second compte ne voit aucune simulation du premier", async () => {
    faux.ajouterCompte("autre@exemple.tn", "Autre-compte-2026!", { full_name: "Autre" });
    const ctx2 = await navigateur.newContext();
    await ctx2.route(SUPABASE + "/**", (r) => faux.gerer(r));
    const p2 = await ctx2.newPage();
    suivre(p2);
    await p2.goto(base + "/connexion.html");
    await p2.fill("#email", "autre@exemple.tn");
    await p2.fill("#mdp", "Autre-compte-2026!");
    await p2.click("#envoyer");
    await p2.waitForURL(/\/espace\/$/);
    await p2.waitForSelector("#recentes .vide");
    assert((await p2.$$("#recentes .carte")).length === 0, "aucune carte");
    await ctx2.close();
  });

  await etape("compte : nom affiché, thème, export JSON", async () => {
    await page.goto(base + "/espace/#compte");
    await page.waitForSelector("#nom-affiche");
    await page.fill("#nom-affiche", "Mohamed Aziz");
    await page.click("#form-profil button[type=submit]");
    await page.waitForFunction(() => document.getElementById("nom-utilisateur").textContent === "Mohamed Aziz");
    await page.check('#choix-theme input[value="dark"]');
    assert(await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark");
    const [telechargement] = await Promise.all([page.waitForEvent("download"), page.click("#exporter")]);
    const contenu = JSON.parse(fs.readFileSync(await telechargement.path(), "utf8"));
    assert(contenu.simulations.length === 3, "export complet");
    await page.screenshot({ path: path.join(CAPTURES, "07-compte-sombre.png"), fullPage: true });
  });

  await etape("mobile : espace, onglets du bas et outil avec barre", async () => {
    const mob = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
    await mob.route(SUPABASE + "/**", (r) => faux.gerer(r));
    const m = await mob.newPage();
    suivre(m);
    await m.goto(base + "/");
    await m.screenshot({ path: path.join(CAPTURES, "08-mobile-accueil.png"), fullPage: true });
    const large = await m.evaluate(() => document.documentElement.scrollWidth);
    assert(large <= 390, "pas de défilement horizontal sur l'accueil : " + large);
    await m.goto(base + "/connexion.html");
    await m.fill("#email", "aziz@exemple.tn");
    await m.fill("#mdp", "Tunis-2026-solide");
    await m.click("#envoyer");
    await m.waitForURL(/\/espace\/$/);
    await m.waitForSelector("#recentes .carte");
    await m.waitForTimeout(700);
    await m.screenshot({ path: path.join(CAPTURES, "09-mobile-espace.png"), fullPage: true });
    assert(await m.isVisible(".onglets-bas"), "onglets du bas visibles");
    const large2 = await m.evaluate(() => document.documentElement.scrollWidth);
    assert(large2 <= 390, "pas de défilement horizontal dans l'espace : " + large2);
    await m.click("#ouvrir-outils");
    await m.waitForSelector("#dlg-outils[open]");
    await m.waitForTimeout(350);
    await m.screenshot({ path: path.join(CAPTURES, "10-mobile-nouvelle.png") });
    await m.click('#dlg-outils .lanceur[data-outil="salaire"]');
    await m.waitForSelector("#efp-enregistrer");
    await m.waitForTimeout(500);
    await m.screenshot({ path: path.join(CAPTURES, "11-mobile-salaire.png") });
    await mob.close();
  });

  await etape("déconnexion puis suppression définitive du compte", async () => {
    await page.goto(base + "/espace/#compte");
    await page.waitForSelector("#supprimer-compte");
    await page.click("#supprimer-compte");
    await page.waitForSelector("#dlg-supprimer-compte[open]");
    assert(await page.isDisabled("#sc-valider"), "bouton bloqué tant que la confirmation manque");
    await page.fill("#sc-confirmation", "SUPPRIMER");
    await page.click("#sc-valider");
    await page.waitForURL((u) => u.pathname === "/");
    await page.waitForSelector("#bandeau:not([hidden])");
    assert(!faux.comptes.has("aziz@exemple.tn"), "compte effacé");
    assert(faux.simulations().filter((s) => s.outil).length === 0, "simulations effacées");
  });

  await etape("aucune erreur JavaScript ni violation de CSP sur tout le parcours", async () => {
    assert(problemes.length === 0, problemes.join("\n    "));
  });

  await navigateur.close();
  serveur.close();
  console.log("\n" + reussis + " réussis, " + echecs + " échecs");
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
