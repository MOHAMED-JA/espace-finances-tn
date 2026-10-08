/*
 * Parcours de bout en bout de l'application Orbite (Chromium, Playwright) contre un faux Supabase.
 * Vérifie aussi qu'aucune violation de CSP ni erreur JavaScript ne survient.
 * Usage : node e2e/parcours.js  (variables PLAYWRIGHT_CORE, CHROMIUM, CAPTURES facultatives)
 */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const { demarrer } = require("./serveur.js");
const Faux = require("./faux-supabase.js");

const SUPABASE = "https://txrwgqgnqdkipwtwpevl.supabase.co";
const CAPTURES = process.env.CAPTURES || path.join(__dirname, "..", "test-results");
/* Faux service Pwned Passwords : seul MDP_DIVULGUE figure dans « les fuites ». */
const MDP_DIVULGUE = "Fuite-Connue-2026!";
const EMPREINTE_DIVULGUEE = require("node:crypto").createHash("sha1").update(MDP_DIVULGUE).digest("hex").toUpperCase();
async function fuites(route) {
  const prefixe = route.request().url().split("/range/")[1] || "";
  const lignes = ["0000000000000000000000000000000000A:0"];
  if (prefixe === EMPREINTE_DIVULGUEE.slice(0, 5)) lignes.push(EMPREINTE_DIVULGUEE.slice(5) + ":4242");
  await route.fulfill({ status: 200, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }, body: lignes.join("\r\n") });
}
let reussis = 0, echecs = 0;

async function etape(nom, fn) {
  try { await fn(); reussis++; console.log("ok - " + nom); }
  catch (e) { echecs++; console.log("not ok - " + nom + "\n    " + String(e && e.stack || e).split("\n").slice(0, 4).join("\n    ")); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion"); }
const chiffre = (t) => Number(String(t).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const serveur = await demarrer(0);
  const base = "http://127.0.0.1:" + serveur.address().port;
  const faux = Faux.creer();
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(() => chromium.launch());
  const contexte = await navigateur.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  await contexte.route(SUPABASE + "/**", (r) => faux.gerer(r));
  await contexte.route("https://api.pwnedpasswords.com/**", fuites);
  const problemes = [];
  function suivre(p) {
    p.on("pageerror", (e) => problemes.push("Erreur JS " + p.url() + " : " + e.message));
    p.on("console", (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) problemes.push("CSP " + p.url() + " : " + t);
      else if (m.type() === "error" && !/Failed to load resource.*(401|404|406)/.test(t)) problemes.push("Console " + p.url() + " : " + t);
    });
  }
  contexte.on("page", suivre);
  const page = await contexte.newPage();

  await etape("accueil : aperçu vivant exact (2 500 DT, chef de famille, 2 enfants)", async () => {
    await page.goto(base + "/");
    await page.waitForFunction(() => document.getElementById("net").textContent.trim() !== "—");
    const net = (await page.textContent("#net")).replace(/\s/g, "");
    assert(net === "1862,018DT", "net affiché : " + net);
    assert((await page.textContent("#tranche")).replace(/\s/g, "") === "30%", "tranche");
    await page.fill("#brut", "3000");
    await page.waitForFunction(() => !/1\s?862,018/.test(document.getElementById("net").textContent));
    await page.check('input[name="secteur"][value="public"]', { force: true });
    assert((await page.textContent("#lib-caisse")) === "CNRPS");
    assert((await page.textContent("#titre-heros")).includes("Votre salaire au centre."), "titre");
    await page.screenshot({ path: path.join(CAPTURES, "01-accueil.png") });
  });

  await etape("une page protégée renvoie vers la connexion avec l'adresse de retour", async () => {
    await page.goto(base + "/espace/#credit");
    await page.waitForURL(/connexion\.html\?suite=/);
    assert(decodeURIComponent(page.url()).includes("suite=/espace/#credit"), page.url());
  });

  await etape("inscription : validations sur place puis création du compte", async () => {
    await page.goto(base + "/connexion.html?mode=inscription");
    await page.fill("#email", "pas-un-email");
    await page.fill("#mdp", "court");
    await page.click("#envoyer");
    assert(await page.isVisible("#email-erreur"), "erreur e-mail visible");
    assert(await page.isVisible("#mdp-erreur"), "erreur mot de passe visible");
    await page.fill("#nom", "Aziz Test");
    await page.fill("#email", "aziz@exemple.tn");
    /* Mot de passe présent dans une fuite connue : refusé avant tout envoi au serveur. */
    await page.fill("#mdp", MDP_DIVULGUE);
    await page.fill("#mdp2", MDP_DIVULGUE);
    await page.check("#cgu");
    await page.click("#envoyer");
    await page.waitForFunction(() => /fuites de données/.test(document.getElementById("mdp-erreur").textContent));
    assert(!faux.comptes.has("aziz@exemple.tn"), "aucun compte créé avec un mot de passe divulgué");
    await page.fill("#mdp", "Tunis-2026-solide");
    await page.fill("#mdp2", "Tunis-2026-solide");
    await page.check("#cgu");
    await page.click("#envoyer");
    await page.waitForURL(/\/espace\//);
  });

  await etape("premier pas : trois réponses mettent l'orbite en mouvement", async () => {
    await page.waitForSelector("#demarrage:not([hidden])");
    assert((await page.textContent("#badge-profil")).includes("compléter"), "badge profil");
    await page.fill("#d-montant", "2500");
    await page.check("#d-chef", { force: true });
    await page.click("#form-demarrage button[type=submit]");
    await page.waitForSelector("#demarrage[hidden]", { state: "attached" });
    await page.waitForFunction(() => /1\s?8\d\d/.test(document.getElementById("noyau-val").textContent));
    await page.waitForFunction(() => document.getElementById("etat-enregistrement").textContent.includes("enregistré") || document.getElementById("etat-enregistrement").textContent === "");
    const meta = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite;
    assert(meta && meta.montant === 2500 && meta.chefDeFamille === true, "profil enregistré dans le compte : " + JSON.stringify(meta));
    assert((await page.$$("#cap-liste li")).length === 4, "4 crédits types");
    assert((await page.$$("#suggestions li")).length === 3, "3 suggestions d'épargne");
    await page.screenshot({ path: path.join(CAPTURES, "02-orbite.png") });
  });

  await etape("capacité : bascule net → brut", async () => {
    const net = chiffre(await page.textContent("#cap-mensualite"));
    await page.check('input[name="base-capacite"][value="brut"]', { force: true });
    await page.waitForFunction((n) => Number(document.getElementById("cap-mensualite").textContent.replace(/[^\d]/g, "")) > n, net);
    await page.check('input[name="base-capacite"][value="net"]', { force: true });
  });

  await etape("profil : crédits, contrats, budget et projets, conservés après rechargement", async () => {
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#vue-profil:not([hidden])");
    await page.fill("#p-prenom", "Aziz");
    await page.click("#sec-credits summary");
    await page.click('[data-ajouter="credits"]');
    await page.fill('#liste-credits li:first-child [data-c="libelle"]', "Voiture");
    await page.fill('#liste-credits li:first-child [data-c="mensualite"]', "300");
    await page.click("#sec-contrats summary");
    await page.click('[data-ajouter="contrats"]');
    await page.fill('#liste-contrats li:first-child [data-c="versementMensuel"]', "150");
    await page.click("#sec-budget summary");
    await page.fill("#p-loyer", "500");
    await page.fill("#p-epargne", "15000");
    await page.click("#sec-projets summary");
    await page.click('[data-ajouter="projets"]');
    await page.fill('#liste-projets li:first-child [data-c="montant"]', "180000");
    await page.waitForTimeout(1600);
    const meta = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite;
    assert(meta.credits.length === 1 && meta.credits[0].mensualite === 300, "crédit enregistré");
    assert(meta.contrats.length === 1 && meta.contrats[0].versementMensuel === 150, "contrat enregistré");
    assert(meta.loyer === 500 && meta.epargneDisponible === 15000 && meta.projets[0].montant === 180000, "budget et projet");
    await page.reload();
    await page.waitForSelector("#vue-profil:not([hidden])");
    await page.waitForFunction(() => document.getElementById("p-prenom").value === "Aziz");
    assert((await page.textContent("#sec-credits-sous")).includes("300"), "crédit relu");
    assert(/Profil complété à \d+ %/.test(await page.textContent("#profil-progression-texte")), "progression");
    await page.screenshot({ path: path.join(CAPTURES, "03-profil.png"), fullPage: true });
  });

  await etape("orbite : budget et conseils tiennent compte du profil", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#vue-orbite:not([hidden])");
    assert(chiffre(await page.textContent("#budget-credits")) === 300, "crédits au budget : " + await page.textContent("#budget-credits"));
    assert(chiffre(await page.textContent("#budget-logement")) === 500, "logement au budget : " + await page.textContent("#budget-logement"));
    assert((await page.$$("#conseils li")).length >= 2, "conseils");
    assert((await page.$$("#projets li.projet:not(.projet--vide)")).length === 1, "projet affiché");
  });

  await etape("salaire : module prérempli, augmentation et changement de tranche", async () => {
    await page.click('.rail a[data-vue="salaire"]');
    await page.waitForSelector("#vue-salaire:not([hidden])");
    await page.waitForFunction(() => /1\s?856,935/.test(document.getElementById("montant-lu").textContent));
    await page.evaluate(() => { const c = document.getElementById("hausse"); c.value = "100"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForFunction(() => document.getElementById("verdict-tranche").textContent.includes("restez"));
    await page.evaluate(() => { const c = document.getElementById("hausse"); c.value = "800"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForFunction(() => document.getElementById("verdict-tranche").textContent.includes("changez de tranche"));
    assert((await page.textContent("#verdict-tranche")).includes("33"), "nouvelle tranche à 33 %");
    assert((await page.$$("#tranches-piste .tranche")).length >= 4, "échelle des tranches");
  });

  await etape("salaire : enregistrement depuis la barre du haut", async () => {
    await page.click("#enregistrer");
    await page.waitForSelector("#dlg-enregistrer[open]");
    assert((await page.inputValue("#enr-nom")).startsWith("Salaire 2"), "nom par défaut");
    await page.fill("#enr-nom", "Mon salaire actuel");
    await page.click('#dlg-enregistrer button[value="ok"]');
    await page.waitForFunction(() => document.getElementById("enregistrer-lib").textContent === "Enregistré");
    const s = faux.simulations().find((x) => x.nom === "Mon salaire actuel");
    assert(s && s.outil === "salaire" && /m=2500/.test(s.parametres.etat), "simulation enregistrée : " + JSON.stringify(s && s.parametres));
    assert(s.resume.principal && s.resume.principal.valeur > 1800, "résumé");
  });

  await etape("épargne : module prérempli, versement depuis une suggestion, enregistrement", async () => {
    await page.goto(base + "/espace/#epargne?versement=250");
    await page.waitForSelector("#vue-epargne:not([hidden])");
    await page.waitForFunction(() => window.ModuleEpargne && window.ModuleEpargne.resume && window.ModuleEpargne.resume());
    const r = await page.evaluate(() => window.ModuleEpargne.resume());
    assert(r.principal && r.principal.valeur > 0, "économie d'impôt : " + JSON.stringify(r));
    const etat = await page.evaluate(() => window.ModuleEpargne.etat());
    assert(/^[A-Za-z0-9_.,:%=&+\-]*$/.test(etat) && etat.length <= 4000, "état sauvegardable : " + etat);
    assert(await page.evaluate((e) => window.ModuleEpargne.charger(e), etat), "état relu");
    await page.click("#enregistrer");
    await page.waitForSelector("#dlg-enregistrer[open]");
    await page.fill("#enr-nom", "Épargne retraite");
    await page.click('#dlg-enregistrer button[value="ok"]');
    await page.waitForFunction(() => document.getElementById("enregistrer-lib").textContent === "Enregistré");
    assert(faux.simulations().some((x) => x.nom === "Épargne retraite" && x.outil === "assurance_vie"), "simulation épargne");
    await page.screenshot({ path: path.join(CAPTURES, "04-epargne.png") });
  });

  await etape("crédit : simulation reçue depuis la capacité, enregistrement", async () => {
    await page.goto(base + "/espace/#credit?type=auto&capital=30000&mois=60&taux=10.5");
    await page.waitForSelector("#vue-credit:not([hidden])");
    await page.waitForFunction(() => window.ModuleCredit && window.ModuleCredit.resume && window.ModuleCredit.resume());
    const r = await page.evaluate(() => window.ModuleCredit.resume());
    assert(r.principal && Math.abs(r.principal.valeur - 644.8) < 2, "mensualité 30 000 DT / 60 mois / 10,5 % : " + JSON.stringify(r.principal));
    const etat = await page.evaluate(() => window.ModuleCredit.etat());
    assert(/^[A-Za-z0-9_.,:%=&+\-]*$/.test(etat) && etat.length <= 4000, "état sauvegardable : " + etat);
    assert(await page.evaluate((e) => window.ModuleCredit.charger(e), etat), "état relu");
    await page.click("#enregistrer");
    await page.waitForSelector("#dlg-enregistrer[open]");
    await page.fill("#enr-nom", "Voiture neuve");
    await page.click('#dlg-enregistrer button[value="ok"]');
    await page.waitForFunction(() => document.getElementById("enregistrer-lib").textContent === "Enregistré");
    assert(faux.simulations().some((x) => x.nom === "Voiture neuve" && x.outil === "credit"), "simulation crédit");
    await page.screenshot({ path: path.join(CAPTURES, "05-credit.png") });
  });

  await etape("simulations : cartes, filtre, ouverture dans le bon module", async () => {
    await page.goto(base + "/espace/#simulations");
    const n = faux.simulations().filter((x) => x.outil).length;
    await page.waitForFunction((k) => document.querySelectorAll("#toutes .carte").length === k, n);
    await page.click('#filtres-outil label:has(input[value="salaire"])');
    await page.waitForFunction(() => document.querySelectorAll("#toutes .carte").length === 1);
    await page.click('#filtres-outil label:has(input[value=""])');
    await page.click('#toutes .carte[data-outil="salaire"] .carte__lien');
    await page.waitForSelector("#vue-salaire:not([hidden])");
    await page.waitForFunction(() => document.getElementById("enregistrer-lib").textContent === "Mettre à jour");
  });

  await etape("simulations : renommage, favori, suppression avec annulation", async () => {
    await page.goto(base + "/espace/#simulations");
    const n = faux.simulations().filter((x) => x.outil).length;
    await page.waitForFunction((k) => document.querySelectorAll("#toutes .carte").length === k, n);
    const carte = '#toutes .carte[data-outil="salaire"]';
    await page.click(carte + " .carte__menu");
    await page.click('#menu-actions [data-action="renommer"]');
    await page.fill("#nouveau-nom", "Salaire renommé");
    await page.click('#dlg-renommer button[value="ok"]');
    await page.waitForFunction(() => [...document.querySelectorAll("#toutes .carte__nom")].some((x) => x.textContent === "Salaire renommé"));
    await page.click(carte + " .carte__favori");
    await page.waitForFunction((c) => document.querySelector(c + " .carte__favori").getAttribute("aria-pressed") === "true", carte);
    await page.click(carte + " .carte__menu");
    await page.click('#menu-actions [data-action="supprimer"]');
    await page.waitForFunction((k) => document.querySelectorAll("#toutes .carte").length === k - 1, n);
    await page.click(".toast button");
    await page.waitForFunction((k) => document.querySelectorAll("#toutes .carte").length === k, n);
  });

  await etape("isolation : un second compte ne voit ni le profil ni les simulations du premier", async () => {
    faux.ajouterCompte("autre@exemple.tn", "Autre-compte-2026!", { full_name: "Autre" });
    const ctx2 = await navigateur.newContext();
    await ctx2.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await ctx2.route("https://api.pwnedpasswords.com/**", fuites);
    const p2 = await ctx2.newPage();
    suivre(p2);
    await p2.goto(base + "/connexion.html");
    await p2.fill("#email", "autre@exemple.tn");
    await p2.fill("#mdp", "Autre-compte-2026!");
    await p2.click("#envoyer");
    await p2.waitForURL(/\/espace\//);
    await p2.waitForSelector("#demarrage:not([hidden])");
    await p2.goto(base + "/espace/#simulations");
    await p2.waitForSelector("#toutes .vide");
    assert((await p2.$$("#toutes .carte")).length === 0, "aucune carte");
    await ctx2.close();
  });

  await etape("compte : nom affiché, thème, export JSON avec le profil", async () => {
    await page.goto(base + "/espace/#compte");
    await page.waitForSelector("#vue-compte:not([hidden])");
    await page.fill("#nom-affiche", "Aziz J.");
    await page.click("#form-nom button[type=submit]");
    await page.waitForSelector(".toast");
    await page.click("#tab-preferences");
    await page.waitForSelector("#onglet-preferences:not([hidden])");
    await page.locator('#choix-theme input[value="dark"]').dispatchEvent("click");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
    await page.click("#tab-donnees");
    await page.waitForSelector("#onglet-donnees:not([hidden])");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exporter")]);
    const contenu = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    assert(contenu.profil_orbite && contenu.profil_orbite.montant === 2500, "profil dans l'export");
    await page.screenshot({ path: path.join(CAPTURES, "06-compte-sombre.png"), fullPage: true });
    await page.locator('#choix-theme input[value="light"]').dispatchEvent("click");
  });

  await etape("abonnement : essai de 3 jours, expiration, blocage, paiement de test, réactivation", async () => {
    await page.goto(base + "/espace/#abonnement");
    await page.waitForSelector("#vue-abonnement:not([hidden])");
    await page.waitForFunction(() => document.querySelectorAll("#ab-offres .ab-offre").length === 3);
    assert((await page.inputValue('#ab-offres input:checked')) === "annuel", "annuel présélectionné");
    assert(/Essai gratuit · 3 jours restants/.test(await page.textContent("#ab-statut-titre")), "essai de 3 jours");
    assert(!(await page.isHidden("#pastille-acces")), "pastille d'essai visible");
    assert(/79,900/.test(await page.textContent("#ab-payer-lib")), "prix annuel sur le bouton");
    await page.screenshot({ path: path.join(CAPTURES, "07-abonnement.png"), fullPage: true });

    faux.expirerEssai("aziz@exemple.tn");
    await page.goto(base + "/espace/#salaire");
    await page.reload();
    await page.waitForSelector('#ab-statut[data-etat="expire"]');
    assert(!(await page.isHidden("#vue-abonnement")), "module bloqué : page d'abonnement affichée");
    assert(await page.isHidden("#vue-salaire"), "module salaire masqué");
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#vue-profil:not([hidden])");

    /* Compte non testeur en mode test : le paiement est refusé avec un message clair. */
    await page.goto(base + "/espace/#abonnement");
    await page.waitForSelector('#ab-offres input[value="annuel"]');
    await page.click("#ab-payer");
    await page.waitForSelector("#ab-erreur:not([hidden])");
    assert(/ouvre très bientôt/.test(await page.textContent("#ab-erreur")), "message « bientôt » pour un non-testeur");
    assert(faux.paiements().length === 0, "aucune commande créée");
    faux.marquerTesteur("aziz@exemple.tn");

    await page.goto(base + "/espace/#abonnement");
    await page.reload();
    await page.waitForSelector('#ab-offres input[value="semestriel"]');
    await page.locator('#ab-offres input[value="semestriel"]').dispatchEvent("click");
    await Promise.all([page.waitForURL(/paiement-test\.html\?ref=ORB-/), page.click("#ab-payer")]);
    await page.waitForSelector("#pt-ok:not([disabled])");
    assert(/49,900/.test(await page.textContent("#pt-montant")), "montant semestriel");
    await Promise.all([page.waitForURL(/\/espace\/#abonnement$/), page.click("#pt-ok")]);
    await page.waitForSelector('#ab-statut[data-etat="actif"]');
    await page.waitForSelector('#ab-historique .ab-ligne[data-statut="paye"]');
    assert(faux.paiements().length === 1 && faux.paiements()[0].statut === "paye", "paiement enregistré");
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#vue-salaire:not([hidden])");
  });

  await etape("mobile : onglets du bas, orbite et modules sans défilement horizontal", async () => {
    const m = await navigateur.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "fr-FR" });
    await m.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await m.route("https://api.pwnedpasswords.com/**", fuites);
    const pm = await m.newPage();
    suivre(pm);
    await pm.goto(base + "/connexion.html");
    await pm.fill("#email", "aziz@exemple.tn");
    await pm.fill("#mdp", "Tunis-2026-solide");
    await pm.click("#envoyer");
    await pm.waitForURL(/\/espace\//);
    await pm.waitForSelector(".onglets-bas");
    for (const vue of ["orbite", "salaire", "epargne", "credit", "profil"]) {
      await pm.tap('.onglets-bas a[data-vue="' + vue + '"]');
      await pm.waitForSelector("#vue-" + vue + ":not([hidden])");
      await pm.waitForTimeout(300);
      const largeur = await pm.evaluate(() => document.documentElement.scrollWidth);
      assert(largeur <= 390, vue + " : défilement horizontal (" + largeur + " px)");
      await pm.screenshot({ path: path.join(CAPTURES, "07-mobile-" + vue + ".png") });
    }
    await m.close();
  });

  await etape("paramètres : onglets, photo importée, surnom, page d'ouverture, utilisation", async () => {
    await page.goto(base + "/espace/#compte?onglet=profil");
    await page.waitForSelector("#onglet-profil:not([hidden])");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGPQj34FRwzEcQBRIhdBsXYrNAAAAABJRU5ErkJggg==", "base64");
    await page.setInputFiles("#param-photo", { name: "moi.png", mimeType: "image/png", buffer: png });
    await page.waitForSelector("#avatar img");
    await page.waitForSelector("#param-avatar img");
    assert([...faux.photos().keys()].some((k) => k.endsWith("/avatar.webp")), "photo stockée dans le dossier du compte");
    assert(!(await page.isHidden("#param-retirer")), "bouton « Retirer » proposé");
    await page.fill("#param-appel", "Dali");
    await page.selectOption("#param-metier", "conseiller");
    await page.click("#form-identite button[type=submit]");
    await page.waitForFunction(() => /Dali/.test(document.getElementById("salutation").textContent));
    await page.click("#tab-preferences");
    await page.selectOption("#param-accueil", "credit");
    await page.waitForFunction(() => /« Crédit »/.test([...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" ")));
    await page.goto(base + "/espace/");
    await page.waitForSelector("#vue-credit:not([hidden])");
    await page.goto(base + "/espace/#compte?onglet=utilisation");
    await page.waitForFunction(() => /sur 200/.test(document.getElementById("u-simulations").textContent));
    await page.keyboard.press("Tab");
    await page.goto(base + "/espace/#compte?onglet=profil");
    await page.click("#param-retirer");
    await page.waitForFunction(() => !document.querySelector("#avatar img"));
    assert(faux.photos().size === 0, "photo effacée du stockage");
    await page.click("#tab-preferences");
    await page.selectOption("#param-accueil", "orbite");
  });

  await etape("administration : réservée à l'admin, compteurs, inscriptions, usage anonyme", async () => {
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-refus:not([hidden])");
    assert(await page.isHidden("#rail-admin"), "lien Administration caché pour un compte ordinaire");
    assert(await page.isHidden("#admin-corps"), "aucune donnée affichée sans le rôle admin");
    faux.marquerAdmin("aziz@exemple.tn");
    await page.reload();
    await page.waitForSelector("#rail-admin:not([hidden])");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.waitForFunction(() => document.querySelectorAll("#admin-comptes tr").length >= 2);
    const kpi = await page.textContent("#admin-kpi-comptes");
    assert(/Inscrits/.test(kpi) && /Connectés aujourd'hui/.test(kpi), "compteurs des utilisateurs : " + kpi);
    assert(/aziz@exemple\.tn/.test(await page.textContent("#admin-comptes")), "le compte figure dans la liste");
    assert(/Conversion après l'essai/.test(await page.textContent("#admin-kpi-abos")), "indicateurs d'abonnement");
    assert(!(await page.isHidden("#badge-admin")), "pastille des nouvelles inscriptions");
    await page.click("#admin-lues");
    await page.waitForSelector("#badge-admin", { state: "hidden" });
    await page.fill("#admin-recherche", "zzz-introuvable");
    assert(/Aucun compte/.test(await page.textContent("#admin-comptes")), "filtre de recherche");
    await page.fill("#admin-recherche", "");
    await page.waitForFunction(() => /Crédit/.test(document.getElementById("admin-vues").textContent));
    const u = faux.usage();
    assert(u.get("vue:credit") > 0 && u.get("simulation:credit") > 0 && u.get("simulation:epargne") > 0, "compteurs anonymes de pages et de simulateurs");
    assert([...u.keys()].every((k) => /^(vue|simulation):[a-z]+$/.test(k)), "aucune donnée personnelle dans les compteurs");
    await page.screenshot({ path: path.join(CAPTURES, "admin.png"), fullPage: true });
  });

  await etape("codes promo, offre de lancement et parrainage (un mois offert à chacun)", async () => {
    /* L'admin crée une offre de lancement automatique et un code réservé à l'annuel. */
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.click(".admin__nouveau summary");
    const creerCode = async (code, remise, opts) => {
      await page.fill("#ac-code", code); await page.fill("#ac-remise", String(remise));
      await page.fill("#ac-libelle", opts.libelle || "");
      if (opts.annuel) await page.check('input[name="ac-formule"][value="annuel"]');
      if (opts.auto) await page.check("#ac-auto");
      await page.click("#admin-code-form button[type=submit]");
      await page.waitForFunction((c) => document.getElementById("admin-codes").textContent.indexOf(c) !== -1, code);
    };
    await creerCode("LANCEMENT", 20, { libelle: "Offre de lancement", auto: true });
    await creerCode("AMI30", 30, { annuel: true });
    /* Page d'abonnement : prix barrés et remise appliquée par le serveur. */
    await page.goto(base + "/espace/#abonnement");
    await page.reload();
    await page.waitForFunction(() => /Offre de lancement/.test(document.getElementById("ab-offres").textContent));
    const offres = await page.textContent("#ab-offres");
    assert(/79,900/.test(offres) && /63,900/.test(offres), "prix annuel barré 79,900 puis 63,900 : " + offres);
    await page.fill("#ab-code", "zzz999");
    await page.click("#ab-code-appliquer");
    await page.waitForFunction(() => /n'existe pas/.test(document.getElementById("ab-code-msg").textContent));
    await page.fill("#ab-code", "ami30");
    await page.click("#ab-code-appliquer");
    await page.waitForFunction(() => /AMI30 appliqué/.test(document.getElementById("ab-code-msg").textContent));
    await page.locator('#ab-offres input[value="annuel"]').dispatchEvent("click");
    assert(/55,900/.test(await page.textContent("#ab-payer-lib")), "le bouton affiche le prix avec le code");
    await page.screenshot({ path: path.join(CAPTURES, "promo.png"), fullPage: true });
    /* Parrainage : un proche s'inscrit avec le lien, prend l'annuel ; chacun reçoit un mois. */
    await page.waitForSelector("#ab-parrainage:not([hidden])");
    const code = (await page.textContent("#ab-parr-code")).trim();
    assert(/^[A-Z0-9]{8}$/.test(code), "code de parrainage : " + code);
    const finAvant = Date.parse(faux.abonnementDe("aziz@exemple.tn").fin);
    faux.ajouterCompte("filleul@exemple.tn", "Filleul-compte-2026!", { full_name: "Filleul" });
    faux.marquerTesteur("filleul@exemple.tn");
    const ctx3 = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx3.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await ctx3.route("https://api.pwnedpasswords.com/**", fuites);
    const p3 = await ctx3.newPage();
    suivre(p3);
    await p3.goto(base + "/connexion.html?parrain=" + code);
    await p3.waitForSelector("#invitation:not([hidden])");
    await p3.fill("#email", "filleul@exemple.tn");
    await p3.fill("#mdp", "Filleul-compte-2026!");
    await p3.click("#envoyer");
    await p3.waitForURL(/\/espace\//);
    await p3.waitForFunction(() => /parrainage enregistré/.test([...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" ")));
    await p3.goto(base + "/espace/#abonnement");
    await p3.waitForSelector('#ab-offres input[value="annuel"]');
    await p3.locator('#ab-offres input[value="annuel"]').dispatchEvent("click");
    await Promise.all([p3.waitForURL(/paiement-test\.html\?ref=ORB-/), p3.click("#ab-payer")]);
    await p3.waitForSelector("#pt-ok:not([disabled])");
    assert(/63,900/.test(await p3.textContent("#pt-montant")), "le filleul bénéficie de l'offre de lancement");
    await Promise.all([p3.waitForURL(/\/espace\/#abonnement$/), p3.click("#pt-ok")]);
    await p3.waitForSelector('#ab-statut[data-etat="actif"]');
    await ctx3.close();
    const filleul = faux.abonnementDe("filleul@exemple.tn"), jours = (Date.parse(filleul.fin) - Date.now()) / 86400000;
    assert(jours > 3 + 365 + 27, "filleul : essai + 12 mois + 1 mois offert (" + Math.round(jours) + " j)");
    const gain = (Date.parse(faux.abonnementDe("aziz@exemple.tn").fin) - finAvant) / 86400000;
    assert(gain >= 27 && gain <= 32, "parrain : un mois offert (" + Math.round(gain) + " j)");
    await page.reload();
    await page.waitForFunction(() => /1 mois gagné/.test(document.getElementById("ab-parr-bilan").textContent));
  });

  await etape("déconnexion puis suppression définitive du compte", async () => {
    await page.goto(base + "/espace/#compte?onglet=donnees");
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
