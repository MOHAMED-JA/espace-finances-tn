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
  catch (e) { echecs++; console.log("not ok - " + nom + "\n    " + String(e && e.stack || e).split("\n").slice(0, Number(process.env.LIGNES || 4)).join("\n    ")); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion"); }
const chiffre = (t) => Number(String(t).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));

(async () => {
  fs.mkdirSync(CAPTURES, { recursive: true });
  const serveur = await demarrer(0);
  const base = "http://127.0.0.1:" + serveur.address().port;
  const faux = Faux.creer();
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium/chrome-linux/chrome" }).catch(() => chromium.launch());
  /* Cloudflare Turnstile (hors réseau pendant les tests) : faux script qui valide en 100 ms, dans chaque contexte. */
  const FAUX_TURNSTILE = "window.turnstile={render:function(el,o){var d=document.createElement('p');d.className='faux-turnstile';d.textContent='Vérification…';el.appendChild(d);setTimeout(function(){d.textContent='Réussi';o.callback('jeton-test-'+Date.now())},100);return 1},reset:function(){}};";
  const nouveauContexte = navigateur.newContext.bind(navigateur);
  navigateur.newContext = async (o) => {
    const c = await nouveauContexte(o);
    await c.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: FAUX_TURNSTILE }));
    return c;
  };
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
    assert(await page.isVisible("#vue-orbite .requiert-naissance"), "date de naissance demandée avant la capacité");
    assert(!(await page.isVisible("#capacite")), "capacité masquée sans date de naissance");
    assert((await page.$$("#cap-liste li")).length === 4, "4 crédits types");
    assert((await page.$$("#suggestions li")).length === 3, "3 suggestions d'épargne");
    await page.screenshot({ path: path.join(CAPTURES, "02-orbite.png") });
  });

  await etape("visite guidée : démarre après le premier pas, une seule fois, et se revoit avec « ? »", async () => {
    await page.waitForSelector(".visite__bulle");
    assert(/Bienvenue/.test(await page.textContent("#visite-titre")), "première étape");
    const total = Number((await page.textContent("#visite-compteur")).match(/sur (\d+)/)[1]);
    assert(total >= 10, "toutes les rubriques présentées");
    await page.click("#visite-suiv");
    assert(/Mon orbite/.test(await page.textContent("#visite-titre")), "étape Mon orbite");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "visite-orbite.png") });
    await page.keyboard.press("ArrowRight");
    assert(/Votre fiche/.test(await page.textContent("#visite-titre")), "étape de la fiche");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    assert(/Mon profil/.test(await page.textContent("#visite-titre")), "navigation au clavier");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "visite-profil.png") });
    for (let i = 4; i < total - 1; i++) await page.click("#visite-suiv");
    assert(/Terminer/.test(await page.textContent("#visite-suiv")), "dernière étape");
    await page.click("#visite-suiv");
    await page.waitForSelector(".visite", { state: "detached" });
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_visite);
    assert(faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite_visite, "visite marquée comme vue sur le compte");
    await page.click("#aide-visite");
    await page.waitForSelector(".visite__bulle");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".visite", { state: "detached" });
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
    await page.fill("#p-nom", "Jaouadi");
    await page.fill("#p-naissance", "1990-05-14");
    await page.fill("#p-embauche", "2018-09-01");
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
    assert(meta.nom === "Jaouadi" && meta.dateNaissance === "1990-05-14" && meta.dateEmbauche === "2018-09-01", "nom et dates enregistrés");
    assert(!(await page.evaluate(() => document.body.classList.contains("sans-naissance"))), "capacité débloquée");
    assert((await page.textContent("#nom-utilisateur")).includes("Aziz Jaouadi"), "nom complet affiché");
    assert(meta.loyer === 500 && meta.epargneDisponible === 15000 && meta.projets[0].montant === 180000, "budget et projet");
    await page.reload();
    await page.waitForSelector("#vue-profil:not([hidden])");
    await page.waitForFunction(() => document.getElementById("p-prenom").value === "Aziz");
    assert((await page.textContent("#sec-credits-sous")).includes("300"), "crédit relu");
    assert(/Profil complété à \d+ %/.test(await page.textContent("#profil-progression-texte")), "progression");
    await page.screenshot({ path: path.join(CAPTURES, "03-profil.png"), fullPage: true });
  });

  await etape("Mon orbite : satellites, fiche et voyage dans le temps", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForFunction(() => document.querySelectorAll("#ciel-satellites .satellite").length === 3);
    assert(await page.$eval("#noyau-val", (e) => !!e.querySelector(".roule") && /DT$/.test(e.textContent.trim())), "net en chiffres qui roulent, texte exact");
    assert((await page.$$("#fiche-orbite [data-choisir]")).length === 3, "fiche : crédit, contrat et projet listés");
    assert(/Tranche d'impôt/.test(await page.textContent("#fiche-orbite .orbite-reperes")), "les trois repères dans la vue d'ensemble");
    await page.click('#fiche-orbite [data-choisir="contrat-0"]');
    await page.waitForFunction(() => /Assurance vie/.test(document.querySelector("#fiche-orbite .fiche-orbite__titre").textContent));
    assert(await page.$eval('.satellite[data-genre="vie"]', (b) => b.getAttribute("aria-pressed") === "true"), "satellite choisi");
    await page.click('#fiche-orbite [data-action="retour"]');
    await page.waitForSelector('#fiche-orbite [data-choisir="credit-0"]');
    await page.$eval('.satellite[data-genre="credit"]', (b) => b.click());
    await page.waitForFunction(() => /Voiture/.test(document.querySelector("#fiche-orbite .fiche-orbite__titre").textContent));
    assert(/durée restante/i.test(await page.textContent("#fiche-orbite")), "crédit sans durée : invitation à la préciser");
    await page.keyboard.press("Escape");
    await page.waitForSelector('#fiche-orbite [data-choisir="credit-0"]');
    assert(await page.isVisible("#voyage"), "voyage dans le temps proposé");
    assert((await page.textContent("#ciel-ecart")) === "Aujourd'hui");
    await page.click("#voyage-prochain");
    await page.waitForFunction(() => document.getElementById("ciel-annonce").classList.contains("visible"));
    assert(/Horizon|avantage fiscal/.test(await page.textContent("#ciel-annonce")), "jalon annoncé : " + await page.textContent("#ciel-annonce"));
    assert(/^Dans /.test(await page.textContent("#ciel-ecart")), "date future");
    await page.click("#voyage-auj");
    await page.waitForFunction(() => document.getElementById("ciel-ecart").textContent === "Aujourd'hui");
    await page.screenshot({ path: path.join(CAPTURES, "orbite-vivante.png") });
  });

  await etape("paramètres : thème selon l'heure (soleil à Tunis) et vibrations", async () => {
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.waitForSelector("#choix-theme", { state: "visible" });
    await page.click('#choix-theme label:has(input[value="heure"])');
    await page.waitForFunction(() => localStorage.getItem("ef-theme") === "heure");
    assert(await page.evaluate(() => document.documentElement.getAttribute("data-theme") === window.EFTheme.effectif()), "thème appliqué selon l'heure");
    assert(/clair de \d+ h \d\d à \d+ h \d\d/.test(await page.textContent("#theme-aide")), "heures du soleil affichées");
    await page.click('#choix-vibrations label:has(input[value="non"])');
    assert(await page.evaluate(() => localStorage.getItem("ef-vibrations") === "non" && window.Orbite.vibrer(10) === false), "vibrations désactivées");
    await page.click('#choix-vibrations label:has(input[value=""])');
    await page.click('#choix-theme label:has(input[value=""])');
    await page.waitForFunction(() => localStorage.getItem("ef-theme") === null);
  });

  await etape("capacité : taux du futur crédit à la consommation modifiable", async () => {
    /* Taux du futur crédit conso : modifiable, il change le capital affiché. */
    const capConso = async () => chiffre(await page.textContent("#cap-liste li:last-child .capacite__capital"));
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#cap-taux-conso", { state: "visible" });
    const avant = await capConso();
    await page.fill("#cap-taux-conso", "2");
    await page.waitForFunction(() => !document.getElementById("cap-taux-conso-auto").hidden);
    await page.waitForFunction((n) => Number(document.querySelector("#cap-liste li:last-child .capacite__capital").textContent.replace(/[^\d]/g, "")) > n, avant);
    assert(/2\s?%/.test(await page.textContent("#cap-liste li:last-child .capacite__cond")), "durée et taux affichés à 2 %");
    await page.fill("#cap-taux-auto-pct", "4");
    await page.waitForFunction(() => !document.getElementById("cap-taux-auto-reset").hidden);
    await page.waitForFunction(() => /4\s?%/.test([...document.querySelectorAll("#cap-liste li")].filter((li) => /auto/i.test(li.textContent))[0].textContent));
    await page.click("#cap-taux-auto-reset");
    await page.waitForFunction(() => document.getElementById("cap-taux-auto-reset").hidden);
    await (await page.$(".taux-futurs")).screenshot({ path: path.join(CAPTURES, "taux-futurs.png") });
    await page.click("#cap-taux-conso-auto");
    await page.waitForFunction(() => document.getElementById("cap-taux-conso-auto").hidden);
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

  await etape("anti-robots : avec une clé Turnstile, le jeton est exigé et transmis à Supabase à la connexion", async () => {
    const t = await navigateur.newContext({ locale: "fr-FR" });
    await t.route(SUPABASE + "/**", (r) => faux.gerer(r));
    const pt = await t.newPage();
    suivre(pt);
    await pt.goto(base + "/connexion.html");
    await pt.waitForSelector("#anti-robots:not([hidden]) .faux-turnstile");
    await pt.fill("#email", "aziz@exemple.tn");
    await pt.fill("#mdp", "Tunis-2026-solide");
    await pt.click("#envoyer");
    await pt.waitForURL(/\/espace\//);
    const a = faux.dernierAuth();
    assert(a && a.gotrue_meta_security && /^jeton-test-/.test(a.gotrue_meta_security.captcha_token), "jeton Turnstile transmis : " + JSON.stringify(a && a.gotrue_meta_security));
    await t.close();
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
    /* Utilisateur existant sur un nouvel appareil : les nouveautés s'affichent une fois. */
    await pm.waitForSelector("#dlg-nouveautes[open]");
    assert((await pm.$$("#nouveautes-liste li")).length >= 2, "nouveautés listées");
    await pm.click('#dlg-nouveautes button[value="ok"]');
    await pm.waitForSelector("#dlg-nouveautes:not([open])", { state: "attached" });
    /* Nouvelle version prête : bandeau, « Plus tard », puis « Mettre à jour » envoie l'activation au service worker. */
    await pm.evaluate(() => { window.__msg = []; window.OrbiteMaj.proposer({ postMessage: (m) => window.__msg.push(m) }); });
    await pm.waitForSelector("#maj-bandeau:not([hidden])");
    await pm.screenshot({ path: path.join(CAPTURES, "maj-bandeau.png") });
    await pm.click("#maj-plus-tard");
    await pm.waitForSelector("#maj-bandeau", { state: "hidden" });
    await pm.evaluate(() => { const b = document.getElementById("maj-bandeau"); b.removeAttribute("data-ferme"); window.OrbiteMaj.proposer({ postMessage: (m) => window.__msg.push(m) }); });
    await pm.click("#maj-appliquer");
    assert((await pm.evaluate(() => window.__msg))[0].type === "activer", "activation demandée au service worker");
    /* Pas de vrai service worker en attente ici : le filet recharge la page après 4 s. */
    await pm.waitForEvent("load", { timeout: 15000 });
    await pm.waitForSelector(".onglets-bas");
    await pm.waitForFunction(() => /Orbite est à jour/.test(document.body.textContent), null, { timeout: 10000 });
    assert(!(await pm.evaluate(() => document.getElementById("dlg-nouveautes").open)), "nouveautés déjà vues : pas de seconde fenêtre");
    /* Visite guidée sur téléphone : bulle dans l'écran, onglets du bas désignés. */
    await pm.click("#aide-visite");
    await pm.waitForSelector(".visite__bulle");
    for (let i = 0; i < 4; i++) await pm.click("#visite-suiv");
    await pm.waitForTimeout(500);
    const bb = await pm.evaluate(() => { const r = document.querySelector(".visite__bulle").getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; });
    assert(bb[0] >= 0 && bb[1] <= 390 && bb[2] >= 0 && bb[3] <= 844, "bulle entièrement visible sur téléphone : " + bb);
    await pm.screenshot({ path: path.join(CAPTURES, "visite-mobile.png") });
    await pm.keyboard.press("Escape");
    await pm.waitForSelector(".visite", { state: "detached" });
    /* Le pointeur resté sur un message le met en pause : on l'écarte et on attend que les messages se ferment. */
    await pm.mouse.move(5, 5);
    await pm.waitForFunction(() => !document.querySelector(".toasts .toast"), null, { timeout: 10000 });
    /* L'Assistant reste à portée de pouce sur téléphone (bouton flottant), Vie & impôts est dans « Moi ». */
    assert(await pm.isVisible("#bulle-assistant"), "bouton Assistant visible sur téléphone");
    await pm.tap("#bulle-assistant");
    await pm.waitForSelector("#vue-assistant:not([hidden])");
    assert(!(await pm.isVisible("#bulle-assistant")), "bouton masqué dans l'Assistant");
    await pm.tap('.onglets-bas a[data-vue="profil"]');
    await pm.waitForSelector("#vue-profil:not([hidden])");
    await pm.tap('#vue-profil .sous-nav a[href="#vie"]');
    await pm.waitForSelector("#vue-vie:not([hidden])");
    assert(await pm.$eval('.onglets-bas a[data-vue="profil"]', (a) => a.getAttribute("aria-current") === "page"), "« Moi » reste actif dans Vie & impôts");
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

  await etape("mode couple : salaire du conjoint, budget et capacité communs", async () => {
    await page.goto(base + "/espace/#profil?section=foyer");
    await page.waitForSelector("#sec-foyer[open]");
    await page.locator("label:has(#p-foyer)").click();
    await page.waitForSelector("#foyer-champs:not([hidden])");
    await page.fill("#p-cj-prenom", "Sarra");
    await page.fill("#p-cj-montant", "1 800");
    await page.locator("#p-cj-montant").blur();
    await page.waitForFunction(() => window.Orbite.profil().conjointMontant === 1800);
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#foyer:not([hidden])");
    assert(/Mensualité possible ensemble/.test(await page.textContent("#foyer-kpi")), "capacité commune");
    assert(/Sarra/.test(await page.textContent("#foyer-legende")), "part de chacun");
    assert((await page.$$("#foyer-offres li")).length === 3, "immobilier, auto, consommation");
    await page.goto(base + "/espace/#profil?section=foyer");
    await page.locator("label:has(#p-foyer)").click();
    await page.waitForFunction(() => window.Orbite.profil().foyer === false);
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#foyer", { state: "hidden" });
  });

  await etape("santé financière, simulateur de vie (appliquer puis annuler) et optimiseur fiscal", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForFunction(() => /^\d+$/.test(document.getElementById("sante-score").textContent.trim()));
    const score = Number(await page.textContent("#sante-score"));
    assert(score >= 0 && score <= 100, "score entre 0 et 100 : " + score);
    assert((await page.$$("#sante-criteres li")).length === 6, "six critères");
    await page.goto(base + "/espace/#vie");
    await page.waitForSelector("#vie-panneau-vie:not([hidden])");
    const enfantsAvant = await page.evaluate(() => window.Orbite.profil().enfants);
    await page.click('[data-ajout="naissance"]');
    await page.waitForSelector("#vie-table:not([hidden])");
    assert(/Naissance/.test(await page.textContent("#vie-resume")), "résumé de l'événement");
    const impot = await page.$eval("#vie-lignes tr:nth-child(2)", (tr) => tr.className);
    assert(/mieux/.test(impot), "un enfant de plus réduit l'impôt");
    await page.click('[data-ajout="augmentation"]');
    await page.fill('#vie-liste [data-k="pct"]', "15");
    await page.waitForFunction(() => /Salaire \+15/.test(document.getElementById("vie-resume").textContent));
    await page.click("#vie-appliquer");
    await page.waitForFunction((n) => window.Orbite.profil().enfants === n + 1, enfantsAvant);
    await page.getByRole("button", { name: "Annuler" }).click();
    await page.waitForFunction((n) => window.Orbite.profil().enfants === n, enfantsAvant);
    await page.click("#vie-tab-fiscal");
    await page.waitForSelector("#vie-panneau-fiscal:not([hidden])");
    assert(/Impôt sur le revenu/.test(await page.textContent("#fi-kpi")), "indicateurs fiscaux");
    assert(/#vie\?onglet=fiscal$/.test(page.url()), "onglet dans l'adresse");
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

  await etape("fiches partagées : visibles par l'admin seulement avec l'accord de l'utilisateur, consultation journalisée", async () => {
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.waitForFunction(() => /Aucun compte n'a encore partagé/.test(document.getElementById("admin-fiches").textContent));
    await page.goto(base + "/espace/#compte?onglet=donnees");
    await page.waitForSelector("#partage-admin:not([disabled])", { state: "attached" });
    assert(!(await page.isChecked("#partage-admin")), "partage désactivé par défaut");
    await page.click('label:has(#partage-admin)');
    await page.waitForFunction(() => /Partage activé/.test(document.getElementById("partage-etat").textContent));
    assert(faux.partageDe("aziz@exemple.tn").accorde, "accord enregistré sur le serveur");
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-fiches [data-fiche]");
    await page.click("#admin-fiches [data-fiche]");
    await page.waitForSelector("#admin-fiche:not([hidden])");
    const fiche = await page.textContent("#admin-fiche");
    assert(/Aziz Jaouadi/.test(fiche) && /Salaire brut/.test(fiche) && /14 mai 1990/.test(fiche) && /Voiture/.test(fiche), "fiche complète : " + fiche);
    await page.screenshot({ path: path.join(CAPTURES, "admin-fiche.png"), fullPage: true });
    await page.goto(base + "/espace/#compte?onglet=donnees");
    await page.waitForFunction(() => /Consultée 1 fois/.test(document.getElementById("partage-etat").textContent));
    await page.click('label:has(#partage-admin)');
    await page.waitForFunction(() => /Non partagée/.test(document.getElementById("partage-etat").textContent));
    assert(!faux.partageDe("aziz@exemple.tn").accorde, "accord retiré");
    await page.goto(base + "/espace/#admin");
    await page.waitForFunction(() => /Aucun compte n'a encore partagé/.test(document.getElementById("admin-fiches").textContent));
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

  await etape("assistant : question, résumé chiffré envoyé sans identité, réponse mise en forme", async () => {
    await page.goto(base + "/espace/#assistant");
    await page.waitForSelector("#vue-assistant:not([hidden])");
    await page.click("#assistant-suggestions .puce-choix:first-child");
    await page.waitForSelector(".assistant__msg--ia strong");
    assert(/mars 2032/.test(await page.textContent("#assistant-fil")), "réponse affichée");
    assert((await page.$$(".assistant__msg--ia ul li")).length === 2, "liste mise en forme sans HTML");
    const envoi = faux.dernierAssistant();
    assert(/voiture en 2027/.test(envoi.question), "question envoyée");
    assert(/Salaire :/.test(envoi.contexte) && /Banque :/.test(envoi.contexte), "résumé chiffré du profil");
    assert(!/aziz@exemple\.tn/.test(JSON.stringify(envoi)), "aucune adresse e-mail transmise");
    assert(/en 2027/.test(envoi.calcul) && /voiture/.test(envoi.calcul), "calcul exact d'Orbite joint à la question : " + envoi.calcul);
    assert(await page.isVisible(".assistant__msg--ia .lien-action"), "lien « Simuler ce crédit » sous la réponse de l'IA");
    await page.fill("#assistant-question", "Et pour un appartement ?");
    await page.press("#assistant-question", "Enter");
    await page.waitForFunction(() => document.querySelectorAll(".assistant__msg--moi").length === 2);
    await page.waitForFunction(() => !document.querySelector(".assistant__msg--attente"));
    assert(faux.dernierAssistant().historique.length === 2, "échanges précédents transmis");
    await page.fill("#assistant-question", "Bonjour");
    await page.press("#assistant-question", "Enter");
    await page.waitForFunction(() => document.querySelectorAll(".assistant__msg--moi").length === 3);
    await page.waitForFunction(() => !document.querySelector(".assistant__msg--attente"));
    assert(faux.dernierAssistant().calcul === "", "pas de calcul pour une salutation");
  });

  await etape("assistant intégré : sans clé d'IA, réponse calculée sur l'appareil (français et darija)", async () => {
    faux.assistantSansCle(true);
    await page.reload();
    await page.waitForFunction(() => window.Orbite && window.Orbite.pret);
    await page.waitForSelector("#vue-assistant:not([hidden])");
    await page.fill("#assistant-question", "Est-ce que je peux acheter une voiture en 2027 ?");
    await page.press("#assistant-question", "Enter");
    await page.waitForFunction(() => !document.querySelector(".assistant__msg--attente") && /mensualité possible/.test(document.getElementById("assistant-fil").textContent));
    assert(!/très bientôt/.test(await page.textContent("#assistant-fil")), "plus de message « bientôt »");
    assert(await page.evaluate(() => /^#credit\?type=auto&capital=\d+&mois=\d+&taux=[\d.]+&mensualite=[\d.]+$/.test(document.getElementById("assistant-fil").lastElementChild.querySelector("a.lien-action").getAttribute("href"))), "lien vers la simulation");
    assert(/calculées sur votre appareil/.test(await page.textContent("#assistant-note")), "note du mode intégré");
    const lienSim = await page.evaluate(() => document.getElementById("assistant-fil").lastElementChild.querySelector("a.lien-action").getAttribute("href"));
    await page.click(".assistant__msg--ia:last-child a.lien-action");
    await page.waitForSelector("#vue-credit:not([hidden])");
    await page.waitForFunction(() => { const r = document.querySelector('input[name="cr-type"][value="auto"]'); return r && r.checked; });
    assert(await page.isChecked('#cr-mode input[value="fixe"]'), "taux du lien affiché en taux fixe");
    const capLien = Number(new URLSearchParams(lienSim.split("?")[1]).get("capital"));
    assert(Number((await page.inputValue("#cr-capital")).replace(/\D/g, "")) === capLien, "montant proposé par l'Assistant repris");
    await page.goto(base + "/espace/#assistant");
    await page.waitForSelector("#vue-assistant:not([hidden])");
    faux.assistantSansCle(false);
    const avant = faux.dernierAssistant();
    await page.fill("#assistant-question", "Najjem nechri dar ?");
    await page.press("#assistant-question", "Enter");
    await page.waitForFunction(() => /dar wala appartement|Ey, etnajjem|Mazelt|Tawa/.test(document.querySelector(".assistant__msg--ia:last-child").textContent));
    assert(faux.dernierAssistant() === avant, "ensuite, plus d'appel au serveur pendant la session");
  });

  await etape("application : service worker, consultation hors connexion, rappels", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    if (!(await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)))) { await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 }); }
    await contexte.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.Orbite && window.Orbite.pret, null, { timeout: 20000 });
    assert(/\/espace\//.test(page.url()), "pas de renvoi vers la connexion hors réseau");
    assert(await page.isVisible("#hors-ligne"), "bandeau hors connexion");
    await contexte.setOffline(false);
    await page.reload();
    await page.waitForFunction(() => window.Orbite && window.Orbite.pret);
    assert(await page.isHidden("#hors-ligne"), "bandeau masqué en ligne");
    await contexte.grantPermissions(["notifications"]);
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.click("#rappels-activer");
    await page.waitForFunction(() => /Rappels activés/.test(document.getElementById("rappels-etat").textContent));
    assert((await page.$$("#rappels-liste li")).length >= 1, "liste des rappels prévus");
    await page.click("#rappels-couper");
    await page.waitForFunction(() => /désactivés/.test(document.getElementById("rappels-etat").textContent));
  });

  await etape("crédit : remboursement anticipé par mois et année, nouvelle durée fixée par la banque", async () => {
    await page.goto(base + "/espace/#credit?type=immo&capital=270000&mois=300&taux=4.5");
    await page.waitForSelector("#cr-formulaire");
    await page.evaluate(() => { document.getElementById("cr-opt-ra").open = true; });
    await page.click("#cr-ra-ajouter");
    await page.waitForSelector("#cr-ra-an-0");
    const d0 = await page.evaluate(() => { const r = window.ModuleCredit.versProfil(); return r.credit ? r.credit.dureeMois : null; });
    /* Le remboursement a lieu le même mois que la 13ᵉ échéance : après l'échéance n° 13. */
    const cible = await page.evaluate(() => { const t = document.querySelector('[data-ra-date="0"]').textContent; return t; });
    assert(/Après l'échéance n° \d+/.test(cible), "échéance affichée : " + cible);
    await page.fill("#cr-ra-mt-0", "150000");
    await page.selectOption("#cr-ra-mode-0", "nouvelle");
    await page.waitForSelector("#cr-ra-nd-0");
    await page.fill("#cr-ra-nd-0", "180");
    await page.locator("#cr-ra-nd-0").blur();
    await page.waitForFunction((n) => { const r = window.ModuleCredit.versProfil(); return r.credit && r.credit.dureeMois !== n; }, d0);
    const ap = await page.evaluate(() => window.ModuleCredit.etat());
    assert(/ra=\d+:150000:n180/.test(ap), "choix du remboursement gardé dans la simulation : " + ap.match(/ra=[^&]*/));
    const an = Number(await page.inputValue("#cr-ra-an-0"));
    await page.fill("#cr-ra-an-0", String(an + 1));
    await page.locator("#cr-ra-an-0").blur();
    await page.waitForFunction(() => /Après l'échéance n° (2[0-9]|3[0-9])/.test(document.querySelector('[data-ra-date="0"]').textContent));
  });

  await etape("simulation → profil : crédit ajouté (puis annulé), épargne ajoutée depuis « Enregistrer »", async () => {
    await page.goto(base + "/espace/#credit?type=auto&capital=40000&mois=60&taux=9");
    await page.waitForSelector("#ajouter-profil", { state: "visible" });
    /* On retire le remboursement anticipé de l'étape précédente. */
    while (await page.$("[data-ra-retirer]")) { await page.evaluate(() => document.querySelector("[data-ra-retirer]").click()); await page.waitForTimeout(50); }
    const avant = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite.credits.length;
    await page.click("#ajouter-profil");
    await page.waitForSelector("#dlg-profil[open]");
    /* Première échéance à venir : « En projet » proposé ; on choisit « Déjà signé ». */
    assert(await page.isChecked('#profil-corps input[name="ap-statut"][value="projet"]'), "crédit à venir : en projet par défaut");
    await page.click('#profil-corps label:has(input[name="ap-statut"][value="signe"])');
    await page.fill("#ap-nom-credit", "Voiture neuve");
    await page.click('#profil-corps label:has(input[name="ap-dest-credit"][value="nouveau"])');
    await page.click("#profil-valider");
    await page.waitForFunction((n) => window.Orbite.profil().credits.length === n + 1, avant);
    const nc = await page.evaluate(() => { const c = window.Orbite.profil().credits; return c[c.length - 1]; });
    assert(nc.libelle === "Voiture neuve" && nc.mensualite > 800 && nc.tauxType === "fixe" && nc.dureeMois === 60 && nc.tauxPct === 9, "crédit enregistré : " + JSON.stringify(nc));
    await page.click('.toast button:has-text("Annuler")');
    await page.waitForFunction((n) => window.Orbite.profil().credits.length === n, avant);
    await page.goto(base + "/espace/#epargne");
    await page.waitForSelector("#barre-actions:not([hidden])");
    await page.waitForTimeout(400);
    const nk = await page.evaluate(() => window.Orbite.profil().contrats.length);
    await page.click("#enregistrer");
    await page.waitForSelector("#dlg-enregistrer[open]");
    assert(await page.isVisible("#enr-profil-ligne"), "case « Ajouter aussi à mes contrats » proposée");
    await page.click("#enr-profil-ligne");
    assert(await page.isChecked("#enr-profil"), "case cochée");
    await page.click('#dlg-enregistrer button[value="ok"]');
    await page.waitForSelector("#dlg-profil[open]");
    await page.click('#profil-corps label:has(input[name="ap-dest-0"][value="nouveau"])');
    await page.click("#profil-valider");
    await page.waitForFunction((n) => window.Orbite.profil().contrats.length === n + 1, nk);
    await page.screenshot({ path: path.join(CAPTURES, "simulation-vers-profil.png") });
  });

  await etape("salaire : autres charges en DT seulement, repères de la tranche sans fond parasite", async () => {
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#autres-dt", { state: "attached" });
    assert(!(await page.$("#autres-pct")), "plus de champ en %");
    const fond = await page.$eval("#repere-avant", (e) => getComputedStyle(e).backgroundColor);
    assert(fond === "rgba(0, 0, 0, 0)" || fond === "transparent", "repère « Aujourd'hui » sans fond : " + fond);
    /* Ancienne simulation en % du brut : convertie en DT au chargement, même coût employeur. */
    const ok = await page.evaluate(() => window.ModuleSalaire.charger("m=2500&acp=2"));
    assert(ok, "simulation chargée");
    const dt = await page.inputValue("#autres-dt");
    assert(Number(dt.replace(/[^\d,]/g, "").replace(",", ".")) > 0, "montant converti : " + dt);
  });

  await etape("historique du salaire : hausse datée, hausse prévue, retrait annulé, depuis le module Salaire", async () => {
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#hs-maj", { state: "visible" });
    const p0 = await page.evaluate(() => { const p = window.Orbite.profil(); return { montant: p.montant, sens: p.sens, n: p.historiqueSalaire.length }; });
    assert(p0.n === 0 && (await page.isHidden("#hs-liste")), "historique vide au départ");
    const auj = new Date(), Y = auj.getFullYear(), M = auj.getMonth() + 1;
    const nouveau = Math.round(p0.montant * 1.1);
    await page.click("#hs-maj");
    await page.waitForSelector("#dlg-salaire[open]");
    assert(await page.isVisible("#sal-avant-bloc"), "premier changement : salaire d'avant demandé");
    assert(Number((await page.inputValue("#sal-avant")).replace(/[^\d,]/g, "").replace(",", ".")) === p0.montant, "salaire d'avant prérempli");
    assert((await page.inputValue("#sal-mois")) === String(M) && (await page.inputValue("#sal-annee")) === String(Y), "mois et année du jour par défaut");
    await page.click("#sal-valider");
    assert(await page.isVisible("#sal-montant-err"), "montant obligatoire");
    await page.fill("#sal-montant", String(nouveau));
    await page.waitForFunction(() => /\+10\s%/.test(document.getElementById("sal-effet").textContent));
    await page.click("#sal-valider");
    await page.waitForFunction((v) => { const p = window.Orbite.profil(); return p.historiqueSalaire.length === 2 && p.montant === v; }, nouveau);
    await page.waitForFunction(() => document.querySelectorAll("#hs-liste li").length === 2);
    assert((await page.textContent("#hs-liste li:first-child")).includes("en vigueur"), "nouveau salaire en vigueur");
    assert((await page.textContent("#hs-liste li:first-child")).replace(/\s/g, " ").includes("+10 %"), "variation affichée");
    assert((await page.textContent("#hs-liste li:last-child")).startsWith("Avant "), "salaire d'avant conservé");
    assert((await page.inputValue("#p-montant")).replace(/[^\d]/g, "") === String(nouveau), "champ du profil à jour");
    /* Hausse annoncée pour janvier prochain : prévue, le salaire du jour ne change pas. */
    const prevu = nouveau + 400;
    await page.click("#hs-maj");
    await page.waitForSelector("#dlg-salaire[open]");
    assert(await page.isHidden("#sal-avant-bloc"), "historique existant : pas de salaire d'avant demandé");
    await page.fill("#sal-montant", String(prevu));
    await page.selectOption("#sal-mois", "1");
    await page.fill("#sal-annee", String(Y + 1));
    await page.waitForFunction(() => /prévue/.test(document.getElementById("sal-effet").textContent));
    await page.click("#sal-valider");
    await page.waitForFunction(() => window.Orbite.profil().historiqueSalaire.length === 3);
    assert((await page.evaluate(() => window.Orbite.profil().montant)) === nouveau, "salaire du jour inchangé");
    await page.waitForFunction(() => document.querySelectorAll("#hs-liste li").length === 3);
    assert((await page.textContent("#hs-liste li:first-child")).includes("prévue"), "hausse marquée « prévue »");
    const sy = await page.evaluate(() => { const s = window.Orbite.synthese(); return { futurs: s.historique.futurs.length, jalons: OrbiteSysteme.modele(s).jalons.filter((j) => j.genre === "salaire").length }; });
    assert(sy.futurs === 1 && sy.jalons === 1, "hausse prévue dans Mon orbite : " + JSON.stringify(sy));
    await page.screenshot({ path: path.join(CAPTURES, "historique-salaire.png") });
    /* Retrait puis annulation. */
    await page.click("#hs-liste li:first-child [data-hs-retirer]");
    await page.waitForFunction(() => window.Orbite.profil().historiqueSalaire.length === 2);
    /* L'« Annuler » d'un message plus ancien ne défait plus rien. */
    await page.click('.toast:has-text("Hausse prévue") button:has-text("Annuler")');
    await page.waitForSelector('.toast:has-text("Annulation impossible")');
    assert((await page.evaluate(() => window.Orbite.profil().historiqueSalaire.length)) === 2, "ancien « Annuler » sans effet");
    await page.click('.toast:has-text("retiré de l") button:has-text("Annuler")');
    await page.waitForFunction(() => window.Orbite.profil().historiqueSalaire.length === 3);
    /* Correction directe du montant : l'entrée en vigueur suit. */
    await page.fill("#p-montant", String(nouveau + 1));
    await page.locator("#p-montant").blur();
    await page.waitForFunction((v) => window.Orbite.profil().historiqueSalaire.some((h) => h.montant === v), nouveau + 1);
    await page.waitForTimeout(1600);
    const meta = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite;
    assert(meta.historiqueSalaire.length === 3 && meta.montant === nouveau + 1, "historique enregistré : " + JSON.stringify(meta.historiqueSalaire));
    /* Module Salaire : un autre salaire demande sa date d'effet. */
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#vers-profil", { state: "attached" });
    await page.evaluate((v) => window.ModuleSalaire.charger("m=" + v), nouveau + 700);
    await page.evaluate(() => document.getElementById("vers-profil").click());
    await page.waitForSelector("#dlg-salaire[open]");
    assert(Number((await page.inputValue("#sal-montant")).replace(/[^\d,]/g, "").replace(",", ".")) === nouveau + 700, "nouveau salaire prérempli");
    await page.click('#dlg-salaire button[value="annuler"]');
    await page.waitForSelector("#dlg-salaire:not([open])", { state: "attached" });
    assert((await page.evaluate(() => window.Orbite.profil().historiqueSalaire.length)) === 3, "annulé : historique inchangé");
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
