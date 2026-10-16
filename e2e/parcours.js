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
const VERSION_ACCORD = require("../public/commun/consentement.js").VERSION;

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
  /* ETAPES=regex : ne jouer que certaines étapes (inclure celles dont elles dépendent, comme l'inscription). */
  if (process.env.ETAPES && !new RegExp(process.env.ETAPES).test(nom)) return;
  try { await fn(); reussis++; console.log("ok - " + nom); }
  catch (e) { echecs++; console.log("not ok - " + nom + "\n    " + String(e && e.stack || e).split("\n").slice(0, Number(process.env.LIGNES || 4)).join("\n    ")); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion"); }
/* Sous-rubriques : les pages longues s'affichent une partie à la fois ; on ouvre la partie comme la barre latérale. */
async function partie(p, vue, cle) {
  await p.evaluate((h) => { location.hash = h; }, "#" + vue + "?partie=" + cle);
  await p.waitForFunction(([v, c]) => window.SousRubriques && window.SousRubriques.active(v) === c, [vue, cle]);
  await p.waitForTimeout(120);
}
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
    if (process.env.DELAI) c.setDefaultTimeout(Number(process.env.DELAI));
    await c.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: FAUX_TURNSTILE }));
    return c;
  };
  const contexte = await navigateur.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  await contexte.route(SUPABASE + "/**", (r) => faux.gerer(r));
  await contexte.route("https://api.pwnedpasswords.com/**", fuites);
  const problemes = [];
  /* Étape « sécurité » : le serveur refuse exprès (403 sans le code, 422 mauvais code) ; ces refus ne sont pas des erreurs. */
  let refusAttendus = false;
  function suivre(p) {
    p.on("pageerror", (e) => problemes.push("Erreur JS " + p.url() + " : " + e.message));
    p.on("console", (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) problemes.push("CSP " + p.url() + " : " + t);
      else if (m.type() === "error" && !/Failed to load resource.*(401|404|406)/.test(t) && !(refusAttendus && /Failed to load resource.*(403|422)/.test(t))) problemes.push("Console " + p.url() + " : " + t);
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

  await etape("accueil cinéma : chiffres calculés, chapitres au défilement, trois vies, prix honnêtes, téléphone", async () => {
    await page.goto(base + "/");
    await page.waitForSelector("#scene-toile");
    const att = await page.evaluate(() => { const v = window.RecitCalcul.voyage(new Date()), vi = window.RecitCalcul.vies(new Date()); return { net: v.net, cap: v.capacite, yNet: vi.yasmine.net, kFin: vi.karim.apres && vi.karim.apres.fin, hNet: vi.habib.retraite.net }; });
    const n = (sel) => page.textContent(sel).then((t) => Number(t.replace(/[^\d,]/g, "").replace(",", ".")));
    assert(Math.abs((await n('[data-r="v.net"]')) - att.net) < 0.001, "net du voyage = moteur");
    assert(Math.abs((await n('[data-r="v.capacite"]')) - Math.round(att.cap)) < 1, "capacité du voyage = moteur");
    assert(Math.abs((await n('[data-r="y.net"]')) - att.yNet) < 0.001, "net de Yasmine = moteur");
    assert((await page.textContent('[data-r="k.fin"]')) === att.kFin, "fin du crédit auto de Karim");
    assert(Math.abs((await n('[data-r="h.pension"]')) - Math.round(att.hNet)) < 1, "pension de Habib = moteur");
    assert((await page.$$(".vie .exemple")).length === 3, "trois cas marqués « Exemple »");
    const corps = await page.textContent("body");
    assert(!/orbite gratuite|Gratuit, sans publicité/.test(corps) && /3 jours d'essai gratuit/.test(corps), "prix honnête : essai de 3 jours");
    assert(!/240 tests/.test(corps), "nombre de tests à jour");
    /* Défilement : chapitre 2 actif, le noyau affiche la capacité. */
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; const c = document.querySelectorAll(".chapitre")[1]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - innerHeight * 0.5 + c.offsetHeight * 0.6); });
    await page.waitForFunction(() => document.getElementById("scene-lib").textContent === "Crédit possible");
    assert(await page.evaluate(() => document.querySelectorAll(".chapitre")[1].classList.contains("chapitre--actif")), "chapitre 2 actif");
    await page.screenshot({ path: path.join(CAPTURES, "accueil-voyage.png") });
    await page.evaluate(() => { const c = document.querySelectorAll(".chapitre")[3]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - innerHeight * 0.5 + c.offsetHeight * 0.9); });
    await page.waitForFunction(() => /Pension nette à \d+ ans/.test(document.getElementById("scene-lib").textContent));
    await page.evaluate(() => document.querySelector(".vies").scrollIntoView());
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(CAPTURES, "accueil-vies.png") });
    const tel = await navigateur.newPage({ viewport: { width: 390, height: 844 } });
    suivre(tel);
    await tel.goto(base + "/");
    await tel.waitForSelector("#scene-toile");
    await tel.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; const c = document.querySelectorAll(".chapitre")[0]; window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 120); });
    await tel.waitForTimeout(600);
    assert(!(await tel.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "accueil sans débordement sur téléphone");
    await tel.screenshot({ path: path.join(CAPTURES, "accueil-telephone.png") });
    await tel.close();
  });

  await etape("accueil : vidéo de présentation (30 s muette en boucle, son, pause, 1 min en grand, moins d'animations, téléphone)", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/");
    for (const f of ["orbite-v3-30s.webm", "orbite-v3-30s.mp4", "orbite-v3-60s.webm", "orbite-v3-60s.mp4", "orbite-v3-affiche.jpg", "orbite-v3-affiche.webp", "orbite-v3-60s-affiche.jpg"]) {
      const r = await page.request.get(base + "/medias/" + f);
      assert(r.status() === 200 && (await r.body()).length > 50000, "fichier " + f);
    }
    await page.$eval("#film", (e) => e.scrollIntoView({ block: "center" }));
    await page.waitForFunction(() => { const v = document.getElementById("film-video"); return !v.paused && v.currentTime > 0.3; }, null, { timeout: 15000 });
    assert(await page.$eval("#film-video", (v) => v.muted && /\.webm$/.test(v.currentSrc)), "muette, WebM");
    assert(await page.getAttribute("#film-son", "aria-pressed") === "false", "son coupé au départ");
    await page.click("#film-son");
    assert(await page.$eval("#film-video", (v) => !v.muted) && await page.getAttribute("#film-son", "aria-label") === "Couper le son", "son activé");
    await page.click("#film-pause");
    assert(await page.$eval("#film-video", (v) => v.paused) && await page.getAttribute("#film-pause", "aria-label") === "Lire la vidéo", "pause");
    await page.screenshot({ path: path.join(CAPTURES, "accueil-video.png") });
    /* La vidéo d'une minute en grand, puis fermée : l'accueil reste en pause (choix de l'utilisateur). */
    assert(await page.$eval("#film-video-complete", (v) => !v.getAttribute("poster")), "affiche de la version longue pas chargée avant l'ouverture");
    await page.click("#film-complet");
    await page.waitForSelector("#film-dlg[open]");
    assert(/orbite-v3-60s-affiche\.jpg$/.test(await page.$eval("#film-video-complete", (v) => v.poster)), "affiche posée à l'ouverture");
    await page.waitForFunction(() => { const v = document.getElementById("film-video-complete"); return !v.paused && v.currentTime > 0.3 && v.duration > 55; }, null, { timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("film-dlg").open && document.getElementById("film-video-complete").paused);
    assert(await page.$eval("#film-video", (v) => v.paused), "toujours en pause après la fermeture");
    await page.click("#film-pause");
    await page.waitForFunction(() => !document.getElementById("film-video").paused);
    /* Moins d'animations : rien ne démarre seul, l'affiche reste. */
    const ctx2 = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const p2 = await ctx2.newPage();
    await p2.goto(base + "/");
    await p2.$eval("#film", (e) => e.scrollIntoView({ block: "center" }));
    await p2.waitForTimeout(1500);
    assert(await p2.$eval("#film-video", (v) => v.paused) && await p2.getAttribute("#film-pause", "aria-pressed") === "true", "pas de lecture automatique");
    assert(!(await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "téléphone sans débordement");
    const b = await p2.$eval(".film__barre", (e) => { const r = e.getBoundingClientRect(), f = document.getElementById("film").getBoundingClientRect(); return r.right <= f.right + 1 && r.left >= f.left - 1; });
    assert(b, "boutons dans le cadre sur téléphone");
    await p2.screenshot({ path: path.join(CAPTURES, "accueil-video-telephone.png") });
    await ctx2.close();
  });

  await etape("pages publiques : liens depuis l'accueil, mini-calculs exacts et en direct (onze pages), états, téléphone sans débordement", async () => {
    await page.goto(base + "/");
    for (const slug of ["salaire-net-tunisie", "simulateur-credit-tunisie", "capacite-credit-tunisie", "simulateur-assurance-vie-tunisie", "calcul-cea-tunisie", "impot-assurance-vie-cea", "retraite-cnss-cnrps",
      "regle-8-pourcent-credit-tunisie", "remboursement-anticipe-credit-tunisie", "regroupement-credits-tunisie", "cout-employeur-tunisie"]) assert(await page.$(`.pied a[href="/${slug}"]`), "lien vers /" + slug + " dans le pied de l'accueil");
    const ent = (p) => p.evaluate(() => document.querySelector(".grand").textContent);
    /* Salaire : 2 500 DT → net de l'accueil ; chef de famille + 2 enfants fait monter le net ; pont recalculé. */
    await page.goto(base + "/salaire-net-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    assert((await ent(page)).replace(/\s/g, "") === "1849,310DT", "net 2 500 DT : " + (await ent(page)));
    assert(await page.isDisabled("[data-pas='1']"), "compteur d'enfants bloqué tant que « Chef de famille » n'est pas coché");
    await page.check("input[name=chef]", { force: true });
    await page.waitForFunction(() => !document.querySelector("[data-pas='1']").disabled);
    await page.click("[data-pas='1']"); await page.click("[data-pas='1']");
    await page.waitForFunction(() => document.querySelector(".grand").textContent.replace(/\s/g, "") !== "1849,310DT");
    const attendu = await page.evaluate(() => { const a = PagesCalcul.affichage("salaire", { montant: 2500, chef: true, enfants: 2 }, new Date()); return a.net_ent + a.net_dec; });
    assert((await ent(page)) === attendu, "net chef de famille 2 enfants = moteur");
    await page.fill("#montant", "4000");
    await page.waitForFunction(() => /2[\s ]?7/.test(document.querySelector(".pont h2").textContent));
    assert(await page.$eval("[data-part=net]", (el) => el.style.getPropertyValue("--part") !== ""), "barres positionnées par CSSOM");
    await page.screenshot({ path: path.join(CAPTURES, "pages-salaire.png") });
    /* Crédit : capacité épuisée → message, montants à 0. */
    await page.goto(base + "/capacite-credit-tunisie");
    await page.fill("#montant", "1000"); await page.fill("#encours", "900");
    await page.waitForSelector("[data-si-etat=sature]:not([hidden])");
    assert(await page.$eval("[data-v=cap_immo]", (el) => el.textContent.replace(/\s/g, "") === "0DT"), "capacité logement nulle");
    /* Impôt : sous le seuil d'imposition → rien à économiser. */
    await page.goto(base + "/impot-assurance-vie-cea");
    await page.fill("#montant", "400");
    await page.waitForSelector("[data-si-etat=sans_impot]:not([hidden])");
    /* Retraite : CNRPS → départ à 65 ans proposé ; carrière trop courte → explication. */
    await page.goto(base + "/retraite-cnss-cnrps");
    await page.check("input[name=secteur][value=public]");
    await page.fill("#naissance", "1970"); await page.fill("#debut", "1995");
    await page.waitForSelector("[data-si-tard]:not([hidden])");
    await page.fill("#debut", "2024");
    await page.waitForSelector("[data-si-etat=erreur]:not([hidden])");
    assert(/15 ans/.test(await page.textContent("[data-si-etat=erreur]")), "raison CNRPS affichée");
    /* Simulateur de crédit : changer de type reprend son exemple ; mensualité = moteur. */
    await page.goto(base + "/simulateur-credit-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    await page.check("input[name=type][value=immo]", { force: true });
    await page.waitForFunction(() => document.getElementById("montant").value.replace(/\s/g, "") === "120000");
    const pret = await page.evaluate(() => { const a = PagesCalcul.affichage("pret", { type: "immo", montant: 120000, dureeAns: 20, marge: 2.5 }, new Date()); return a.mens_ent + a.mens_dec; });
    await page.waitForFunction((t) => document.querySelector(".grand").textContent === t, pret);
    assert((await page.textContent("[data-v=taux]")) === "10\u00a0%", "taux TMM + marge : " + (await page.textContent("[data-v=taux]")));
    assert(await page.$('.pages-nav a[href="/simulateur-credit-tunisie"][aria-current="page"]'), "menu : Crédit en cours");
    /* Assurance vie : capital et impôt économisé recalculés ; salaire non imposé → rien à économiser. */
    await page.goto(base + "/simulateur-assurance-vie-tunisie");
    await page.fill("#versement", "300");
    await page.waitForFunction(() => document.querySelector("[data-v=verse]").textContent.replace(/\s/g, "") === "36000DT");
    await page.fill("#montant", "400");
    await page.waitForFunction(() => document.querySelector("[data-v=eco]").textContent.replace(/\s/g, "") === "0DT");
    /* CEA : au-delà du dépôt utile, message ; économie plafonnée. */
    await page.goto(base + "/calcul-cea-tunisie");
    await page.fill("#depot", "20000");
    await page.waitForSelector("[data-si-etat=au_dela]:not([hidden])");
    const cea = await page.evaluate(() => { const c = PagesCalcul.cea({ montant: 2500, depot: 20000 }, new Date()); return Math.round(c.economie); });
    assert(Number((await page.textContent(".grand")).replace(/\D/g, "")) === cea, "économie CEA plafonnée = moteur");
    /* Règle des 8 % : exemple futur, crédit plus ancien → « depuis », 7 ans ou moins → explication ; chiffres = moteur. */
    await page.goto(base + "/regle-8-pourcent-credit-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    const r8 = await page.evaluate(() => { const a = PagesCalcul.affichage("regle8", PagesCalcul.R8_DEF, new Date()); return a.apres_mens; });
    assert((await page.textContent("[data-v=apres_mens]")) === r8, "mensualité après réduction = moteur");
    await page.fill("#debut", "01/2022");
    await page.waitForFunction(() => /depuis/.test(document.querySelector("[data-v=quand_lib]").textContent));
    await page.fill("#duree", "84");
    await page.waitForSelector(".calc__alerte:not([hidden])");
    assert(await page.isHidden(".resultat"), "pas de résultat pour un crédit de 7 ans");
    /* Remboursement anticipé : durée plus courte au moins aussi avantageuse ; somme qui couvre tout → soldé. */
    await page.goto(base + "/remboursement-anticipe-credit-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    assert((await page.textContent("[data-v=courte]")).replace(/\s/g, " ") === "−68 mois", "68 mois gagnés");
    await page.fill("#somme", "200000");
    await page.waitForSelector("[data-si-etat=solde]:not([hidden])");
    assert(await page.isHidden(".choix2"), "deux choix masqués quand le crédit est soldé");
    /* Regroupement : un troisième crédit s'ajoute, une ligne décochée est retirée, tout décoché → message. */
    await page.goto(base + "/regroupement-credits-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    await page.fill("#m3", "150"); await page.fill("#t3", "12"); await page.fill("#r3", "20");
    await page.waitForFunction(() => /3 crédits/.test(document.querySelector("[data-v=avant_lib]").textContent));
    const rg = await page.evaluate(() => { const a = PagesCalcul.affichage("regroupement", { credits: [{ mensualite: 320, taux: 10, mois: 30 }, { mensualite: 210, taux: 11, mois: 17 }, { mensualite: 150, taux: 12, mois: 20 }], taux: 10.5, duree: 36, ira: 1.5, frais: 150 }, new Date()); return a.mens_ent + a.mens_dec; });
    await page.waitForFunction((t) => document.querySelector(".grand").textContent === t, rg);
    for (const i of [1, 2, 3]) await page.uncheck("input[name=inclus" + i + "]");
    await page.waitForSelector(".calc__alerte:not([hidden])");
    /* Coût employeur : 2 000 DT brut → 2 411,400 DT ; secteur public → CNRPS. */
    await page.goto(base + "/cout-employeur-tunisie");
    await page.waitForFunction(() => window.PagesCalcul);
    assert((await page.textContent(".grand")).replace(/\s/g, "") === "2411,400DT", "coût employeur 2 000 DT brut");
    await page.check("input[name=secteur][value=public]", { force: true });
    await page.waitForFunction(() => /CNRPS/.test(document.querySelector("[data-v=caisse_lib]").textContent));
    assert(await page.$('.pages-nav a[href="/salaire-net-tunisie"][aria-current="true"]'), "menu : Salaire net en cours");
    const tel = await navigateur.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
    suivre(tel);
    for (const slug of ["salaire-net-tunisie", "simulateur-credit-tunisie", "capacite-credit-tunisie", "simulateur-assurance-vie-tunisie", "calcul-cea-tunisie", "impot-assurance-vie-cea", "retraite-cnss-cnrps",
      "regle-8-pourcent-credit-tunisie", "remboursement-anticipe-credit-tunisie", "regroupement-credits-tunisie", "cout-employeur-tunisie"]) {
      await tel.goto(base + "/" + slug);
      await tel.waitForFunction(() => window.PagesCalcul);
      assert(!(await tel.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), slug + " sans débordement sur téléphone");
    }
    await tel.screenshot({ path: path.join(CAPTURES, "pages-retraite-telephone.png"), fullPage: true });
    await tel.close();
  });

  await etape("une page protégée renvoie vers la connexion avec l'adresse de retour", async () => {
    await page.goto(base + "/espace/#credit");
    await page.waitForURL(/connexion\.html\?suite=/);
    assert(decodeURIComponent(page.url()).includes("suite=/espace/#credit"), page.url());
  });

  await etape("inscription : validations sur place puis création du compte", async () => {
    await page.goto(base + "/connexion.html?mode=inscription");
    /* Politique et CGV : sans la case, « Continuer avec Google » ne part pas. */
    await page.click("#google");
    await page.waitForSelector("#cgu-erreur:not([hidden])");
    assert(/connexion\.html/.test(page.url()), "Google bloqué tant que la case n'est pas cochée");
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
    /* Case cochée à l'inscription : acceptation enregistrée automatiquement, sans écran. */
    for (let i = 0; i < 50 && !faux.consentementsDe("aziz@exemple.tn").length; i++) await page.waitForTimeout(100);
    const acc = faux.consentementsDe("aziz@exemple.tn");
    assert(acc.length === 1 && acc[0].version === VERSION_ACCORD, "acceptation enregistrée à l'inscription");
    assert(!(await page.isVisible("#dlg-consentement")), "aucun écran d'acceptation après une inscription acceptée");
  });

  await etape("premier pas : trois réponses mettent l'orbite en mouvement", async () => {
    await page.waitForSelector("#demarrage:not([hidden])");
    assert((await page.textContent("#badge-profil")).includes("compléter"), "badge profil");
    await page.fill("#d-montant", "2500");
    await page.check("#d-chef", { force: true });
    await page.click("#form-demarrage button[type=submit]");
    await page.waitForSelector("#demarrage[hidden]", { state: "attached" });
    await page.waitForFunction(() => /1\s?8\d\d/.test(document.getElementById("noyau-val").textContent));
    /* Témoin d'enregistrement : coche « Enregistré », puis « Enregistré à l'instant / il y a … », toujours visible. */
    await page.waitForFunction(() => ["ok", "ancien"].includes(document.getElementById("etat-enregistrement").getAttribute("data-etat")));
    assert(/Enregistré/.test(await page.textContent("#etat-enregistrement")), "témoin « Enregistré »");
    assert(/Enregistré/.test(await page.textContent("#etat-enregistrement-annonce")), "annonce pour lecteur d'écran");
    const meta = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite;
    assert(meta && meta.montant === 2500 && meta.chefDeFamille === true, "profil enregistré dans le compte : " + JSON.stringify(meta));
    /* Sous-rubriques : la page s'ouvre sur la vue d'ensemble, la capacité est une partie à part. */
    assert(await page.isVisible("#orbite-contenu") && !(await page.isVisible("#vue-orbite .requiert-naissance")), "Mon orbite s'ouvre sur la vue d'ensemble");
    await partie(page, "orbite", "capacite");
    assert(await page.isVisible("#vue-orbite .requiert-naissance"), "date de naissance demandée avant la capacité");
    assert(!(await page.isVisible("#capacite")), "capacité masquée sans date de naissance");
    assert((await page.$$("#cap-liste li")).length === 4, "4 crédits types");
    assert((await page.$$("#suggestions li")).length === 3, "3 suggestions d'épargne");
    /* Adresse sans partie (lien « Mon orbite ») : retour à la première partie. */
    await page.evaluate(() => { location.hash = "#orbite"; });
    await page.waitForFunction(() => window.SousRubriques.active("orbite") === "apercu");
    await page.screenshot({ path: path.join(CAPTURES, "02-orbite.png") });
  });

  await etape("visite guidée : choix des chapitres après le premier pas, « L'essentiel » puis « Les nouveautés » avec « ? »", async () => {
    await page.waitForSelector(".visite__bulle #visite-chapitres:not([hidden])");
    assert(/Par quoi voulez-vous commencer/.test(await page.textContent("#visite-titre")), "écran de choix");
    assert(await page.$eval("#visite-chap-essentiel", (b) => b.classList.contains("visite__chap--conseil") && document.activeElement === b), "nouveau venu : « L'essentiel » conseillé");
    assert(/8 nouvelles/.test(await page.textContent("#visite-badge")), "badge des nouveautés : " + await page.textContent("#visite-badge"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(CAPTURES, "visite-choix.png") });
    await page.click("#visite-chap-essentiel");
    assert(/Bienvenue/.test(await page.textContent("#visite-titre")), "première étape");
    assert((await page.textContent("#visite-compteur")) === "L'essentiel · 1 sur 8", "compteur du chapitre");
    await page.click("#visite-suiv");
    assert(/Mon orbite/.test(await page.textContent("#visite-titre")), "étape Mon orbite");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "visite-orbite.png") });
    await page.keyboard.press("ArrowRight");
    assert(/banque peut vous prêter/.test(await page.textContent("#visite-titre")), "étape de la capacité");
    await page.keyboard.press("ArrowRight");
    assert(/Mon profil/.test(await page.textContent("#visite-titre")), "navigation au clavier");
    assert(/fiche de paie/.test(await page.textContent("#visite-texte")), "le profil présente la fiche de paie");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "visite-profil.png") });
    for (let i = 3; i < 7; i++) await page.click("#visite-suiv");
    assert(/Terminer/.test(await page.textContent("#visite-suiv")), "dernière étape");
    await page.click("#visite-suiv");
    await page.waitForSelector(".visite", { state: "detached" });
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_visite);
    assert(faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite_visite, "visite marquée comme vue sur le compte");
    /* « ? » : les nouveautés d'octobre sont conseillées, chaque étape ouvre sa page, retour à Mon orbite à la fin. */
    await page.click("#aide-visite");
    await page.waitForSelector(".visite__bulle #visite-chapitres:not([hidden])");
    assert(await page.$eval("#visite-chap-nouveautes", (b) => b.classList.contains("visite__chap--conseil")), "déjà venu : « Les nouveautés » conseillées");
    assert(await page.isVisible("#visite-chap-plus"), "chapitre « Pour aller plus loin »");
    await page.click("#visite-chap-nouveautes");
    assert(/Ma réserve de sécurité/.test(await page.textContent("#visite-titre")), "première nouveauté : la réserve de sécurité");
    await page.waitForFunction(() => { const h = document.querySelector(".visite__halo").getBoundingClientRect(), c = document.querySelector("#pg-reserve .reserve__jauge").getBoundingClientRect(); return location.hash === "#progression?onglet=objectifs" && !document.querySelector(".visite--transit") && Math.abs(h.left - (c.left - 6)) < 2 && Math.abs(h.top - (c.top - 6)) < 2; }, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(CAPTURES, "visite-nouveautes.png") });
    /* Pendant la visite : aucun fondu de page (il éclaircissait le voile) ni animation d'entrée des cartes. */
    await page.evaluate(() => { window.__fondus = 0; window.__entrees = 0; if (document.startViewTransition) { const o = document.startViewTransition.bind(document); document.startViewTransition = (f) => { window.__fondus++; return o(f); }; } new MutationObserver((l) => l.forEach((m) => { if (m.target.classList && m.target.classList.contains("vue--entree")) window.__entrees++; })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] }); });
    const vus = [], passages = [];
    for (let i = 1; i < 8; i++) {
      const avant = await page.evaluate(() => location.hash), t = Date.now();
      await page.click("#visite-suiv");
      await page.waitForFunction(() => !document.querySelector(".visite--transit"));
      const apres = await page.evaluate(() => location.hash);
      if (apres !== avant) passages.push(Date.now() - t);
      vus.push((await page.textContent("#visite-titre")) + " @ " + apres);
    }
    const fe = await page.evaluate(() => [window.__fondus, window.__entrees]);
    assert(fe[0] === 0 && fe[1] === 0, "ni fondu de page ni entrée animée pendant la visite : " + JSON.stringify(fe));
    assert(passages.length >= 3 && Math.max(...passages) < 1100, "passage d'une page à l'autre (ms) : " + JSON.stringify(passages));
    const attendus = [/plan de versement @ #vie\?onglet=fiscal/, /Rembourser ou épargner \? @ #vie\?onglet=decider/, /patrimoine net @ #orbite\?partie=patrimoine/, /Comparer les banques @ #credit\?espace=banques/, /Importer mon relevé @ #mois\?onglet=budget/, /bilan en PDF @ #progression/, /ligne par ligne @ #profil\?section=salaire/];
    assert(attendus.every((r) => vus.some((t) => r.test(t))), "pages ouvertes : " + vus.join(" | "));
    await page.screenshot({ path: path.join(CAPTURES, "visite-credit.png") });
    await page.click("#visite-suiv");
    await page.waitForSelector(".visite", { state: "detached" });
    await page.waitForFunction(() => location.hash === "#orbite").catch(async (e) => { throw new Error("adresse finale : " + await page.evaluate(() => location.hash)); });
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_visite_nouveautes === "2026-10-15a");
    /* « Pour aller plus loin » : les nouveautés précédentes, Mon mois d'abord. */
    await page.click("#aide-visite");
    await page.waitForSelector(".visite__bulle #visite-chapitres:not([hidden])");
    assert(/déjà vues/.test(await page.textContent("#visite-badge")), "nouveautés marquées comme vues");
    await page.click("#visite-chap-plus");
    assert(/Mon mois : le budget/.test(await page.textContent("#visite-titre")), "première étape : Mon mois");
    await page.waitForFunction(() => location.hash === "#mois?onglet=budget" && !document.querySelector(".visite--transit"));
    await page.waitForFunction(() => { const h = document.querySelector(".visite__halo").getBoundingClientRect(), c = document.getElementById("mo-ajout").getBoundingClientRect(); return Math.abs(h.left - (c.left - 6)) < 2 && Math.abs(h.top - (c.top - 6)) < 2; }, null, { timeout: 5000 });
    const vus2 = [];
    for (let i = 1; i < 12; i++) {
      await page.click("#visite-suiv");
      await page.waitForFunction(() => !document.querySelector(".visite--transit"));
      vus2.push((await page.textContent("#visite-titre")) + " @ " + (await page.evaluate(() => location.hash)));
    }
    const attendus2 = [/calendrier de l'argent @ #mois\?onglet=calendrier/, /onglets du Crédit @ #credit/, /Partager et comparer @ #credit/, /Ma progression @ #progression\?onglet=carriere/, /Et si… \? @ #vie\?onglet=scenarios/, /négociation @ #salaire/, /Ctrl K/, /Vos réglages @ #compte\?onglet=preferences/];
    assert(attendus2.every((r) => vus2.some((t) => r.test(t))), "pages ouvertes : " + vus2.join(" | "));
    assert(/Terminer/.test(await page.textContent("#visite-suiv")), "dernière étape de « Pour aller plus loin »");
    assert(await page.evaluate(() => document.querySelector(".visite__bulle").contains(document.activeElement)), "après un changement de page, le focus reste dans la bulle");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".visite", { state: "detached" });
  });

  await etape("partage de la fiche : demandé une fois au lancement suivant, rien de coché, « Partager ma fiche » en avant, « Pas maintenant » retenu", async () => {
    await page.reload();
    await page.waitForSelector("#dlg-partage[open]", { timeout: 15000 });
    assert(await page.$eval("#dlg-partage-oui", (b) => b.classList.contains("bouton--plein") && /Partager ma fiche/.test(b.textContent)), "« Partager ma fiche » mis en avant");
    assert(await page.$eval("#dlg-partage-non", (b) => !b.classList.contains("bouton--plein") && /Pas maintenant/.test(b.textContent)), "« Pas maintenant » en second");
    assert(!(await page.$("#dlg-partage input")), "aucune case cochée d'avance");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "partage-demande.png") });
    await page.click("#dlg-partage-non");
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_partage_demande);
    const m = faux.comptes.get("aziz@exemple.tn").user.user_metadata;
    assert(m.orbite_partage_reponse === "non" && !faux.partageDe("aziz@exemple.tn").accorde, "réponse retenue, rien partagé sans accord");
    await page.reload();
    await page.waitForSelector(".rail");
    await page.waitForTimeout(3500);
    assert(!(await page.isVisible("#dlg-partage")), "pas redemandé");
  });

  await etape("capacité : bascule net → brut", async () => {
    await partie(page, "orbite", "capacite");
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
    /* Enfants réservés au chef de famille : compteurs bloqués et aide visible tant que la case est décochée. */
    const chefCoche = await page.isChecked('input[data-p="chefDeFamille"]');
    if (chefCoche) await page.click('label.interrupteur:has(input[data-p="chefDeFamille"]) .interrupteur__piste');
    await page.waitForSelector("#p-enfants-aide:not([hidden])");
    assert(await page.isDisabled('[data-pp="enfants"][data-pas="1"]') && await page.isDisabled('[data-pp="etudiants"][data-pas="1"]'), "enfants et étudiants bloqués sans chef de famille");
    await page.click('label.interrupteur:has(input[data-p="chefDeFamille"]) .interrupteur__piste');
    await page.waitForSelector("#p-enfants-aide", { state: "hidden" });
    assert(!(await page.isDisabled('[data-pp="enfants"][data-pas="1"]')), "enfants débloqués avec chef de famille");
    if (!chefCoche) await page.click('label.interrupteur:has(input[data-p="chefDeFamille"]) .interrupteur__piste');
    await page.fill("#p-naissance", "1990-05-14");
    await partie(page, "profil", "salaire");
    await page.fill("#p-embauche", "2018-09-01");
    /* Sous-rubrique « Crédits et épargne » : ses volets s'ouvrent d'eux-mêmes. */
    await partie(page, "profil", "credits");
    assert(await page.$eval("#sec-credits", (d) => d.open) && await page.$eval("#sec-contrats", (d) => d.open), "volets de la partie ouverts");
    await page.click('[data-ajouter="credits"]');
    await page.fill('#liste-credits li:first-child [data-c="libelle"]', "Voiture");
    await page.fill('#liste-credits li:first-child [data-c="mensualite"]', "300");
    await page.click('[data-ajouter="contrats"]');
    await page.fill('#liste-contrats li:first-child [data-c="versementMensuel"]', "150");
    await partie(page, "profil", "foyer");
    await page.fill("#p-loyer", "500");
    await page.fill("#p-epargne", "15000");
    await partie(page, "profil", "projets");
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
    assert(await page.isHidden("#installer-orbite"), "pas d'invitation à installer sur grand écran");
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
    await page.waitForSelector("#theme-etat:not([hidden])");
    const etat = await page.textContent("#theme-etat"), sombre = await page.evaluate(() => window.EFTheme.nuitATunis());
    assert(sombre ? /En ce moment : sombre.*Retour au clair/.test(etat) : /En ce moment : clair\. Passage au sombre ce soir à \d+ h \d\d/.test(etat), "état de « Soleil » : " + etat);
    await page.click('#choix-vibrations label:has(input[value="non"])');
    assert(await page.evaluate(() => localStorage.getItem("ef-vibrations") === "non" && window.Orbite.vibrer(10) === false), "vibrations désactivées");
    await page.click('#choix-vibrations label:has(input[value=""])');
    await page.click('#choix-theme label:has(input[value=""])');
    await page.waitForFunction(() => localStorage.getItem("ef-theme") === null);
    assert(await page.isHidden("#theme-etat"), "état caché hors « Soleil »");
  });

  await etape("capacité : taux du futur crédit à la consommation modifiable", async () => {
    /* Taux du futur crédit conso : modifiable, il change le capital affiché. */
    const capConso = async () => chiffre(await page.textContent("#cap-liste li:last-child .capacite__capital"));
    await page.goto(base + "/espace/#orbite?partie=capacite");
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
    await partie(page, "salaire", "hausse");
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
    /* Compte existant sans acceptation : écran bloquant, impossible à fermer sans accepter. */
    await p2.waitForSelector("#dlg-consentement[open]");
    assert(await p2.isHidden('[data-consentement-motif="mise-a-jour"]'), "premier accord : pas de message de mise à jour");
    assert(await p2.isDisabled("#consentement-accepter"), "bouton inactif sans la case");
    await p2.keyboard.press("Escape");
    await p2.waitForTimeout(200);
    assert(await p2.isVisible("#dlg-consentement"), "Échap ne ferme pas l'écran");
    assert(!faux.consentementsDe("autre@exemple.tn").length, "rien d'enregistré avant d'accepter");
    await p2.check("#consentement-case", { force: true });
    await p2.click("#consentement-accepter");
    await p2.waitForSelector("#dlg-consentement", { state: "hidden" });
    assert(faux.consentementsDe("autre@exemple.tn").length === 1, "acceptation enregistrée");
    await p2.waitForSelector("#demarrage:not([hidden])");
    await p2.goto(base + "/espace/#simulations");
    await p2.waitForSelector("#toutes .vide");
    assert((await p2.$$("#toutes .carte")).length === 0, "aucune carte");
    await ctx2.close();
  });

  await etape("compte : nom affiché, thème, export JSON avec le profil", async () => {
    await page.goto(base + "/espace/#compte?onglet=donnees");
    await page.waitForSelector("#onglet-donnees:not([hidden])");
    assert(/^Acceptées le \d{1,2} \S+ \d{4} à \d{1,2} h \d\d \(version du 11 octobre 2026\)\.$/.test(await page.textContent("#accord-etat")), "trace de l'acceptation : " + await page.textContent("#accord-etat"));
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
    /* Connexion vivante : planète, trois satellites étiquetés, pas de débordement sur téléphone. */
    assert(await pm.isVisible("#planete-connexion"), "planète de la page de connexion");
    assert((await pm.$$(".etiquette-sat")).length === 3, "satellites Crédit, Épargne, Impôt");
    assert((await pm.evaluate(() => document.documentElement.scrollWidth)) <= 390, "connexion sans défilement horizontal");
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
    await pm.click("#visite-chap-essentiel");
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
    /* Témoin d'enregistrement visible aussi sur téléphone (texte court), sans faire déborder la barre. */
    await pm.evaluate(() => window.Orbite.majProfil({ enfants: window.Orbite.profil().enfants }));
    await pm.waitForFunction(() => ["ok", "ancien"].includes(document.getElementById("etat-enregistrement").getAttribute("data-etat")));
    assert(await pm.isVisible("#etat-enregistrement .temoin__court"), "pastille courte visible sur téléphone");
    const bt = await pm.evaluate(() => { const r = document.getElementById("etat-enregistrement").getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth]; });
    assert(bt[0] >= 0 && bt[1] <= 390 && bt[2] <= 390, "pastille dans l'écran, pas de débordement : " + bt);
    /* L'Assistant reste à portée de pouce sur téléphone (bouton flottant), Vie & impôts est dans « Moi ». */
    assert(await pm.isVisible("#bulle-assistant"), "bouton Assistant visible sur téléphone");
    await pm.tap("#bulle-assistant");
    await pm.waitForSelector("#vue-assistant:not([hidden])");
    assert(!(await pm.isVisible("#bulle-assistant")), "bouton masqué dans l'Assistant");
    /* Menu complet : toutes les rubriques et leurs sous-rubriques, comme la barre latérale du grand écran. */
    assert(await pm.isVisible("#menu-ouvrir") && !(await pm.isVisible(".rail")), "téléphone : ☰ dans la barre, pas de barre latérale");
    await pm.tap("#onglet-menu");
    await pm.waitForSelector("#dlg-menu[open] .menu-complet__ru");
    const menu = await pm.evaluate(() => Object.fromEntries([...document.querySelectorAll(".menu-complet__ru")].map((r) => [r.querySelector(".menu-complet__nom").textContent, r.querySelectorAll(".menu-complet__puce").length])));
    assert(Object.keys(menu).length >= 12 && menu["Mon profil"] === 5 && menu["Crédit"] === 8 && menu["Vie & impôts"] === 4 && menu["Paramètres"] === 6 && menu["Mon orbite"] >= 4, "rubriques et sous-rubriques du menu : " + JSON.stringify(menu));
    assert(await pm.getAttribute("#onglet-menu", "aria-expanded") === "true", "onglet « Menu » ouvert");
    await pm.screenshot({ path: path.join(CAPTURES, "menu-complet-telephone.png") });
    await pm.tap('.menu-complet__puce[href="#vie?onglet=decider"]');
    await pm.waitForSelector("#vue-vie:not([hidden])");
    await pm.waitForSelector("#dlg-menu:not([open])", { state: "attached" });
    assert(await pm.evaluate(() => location.hash === "#vie?onglet=decider" && document.getElementById("vie-tab-decider").getAttribute("aria-selected") === "true"), "sous-rubrique ouverte depuis le menu : " + await pm.evaluate(() => location.hash));
    assert(await pm.$eval("#onglet-menu", (b) => b.hasAttribute("data-actif") && b.getAttribute("aria-expanded") === "false"), "« Menu » reste allumé dans Vie & impôts");
    await pm.tap("#menu-ouvrir");
    await pm.waitForSelector("#dlg-menu[open]");
    assert(await pm.$eval('.menu-complet__ru--ici .menu-complet__nom', (n) => n.textContent === "Vie & impôts") && await pm.$eval('.menu-complet__ru--ici .menu-complet__puce[aria-current="true"]', (a) => a.textContent === "Décider"), "rubrique et sous-rubrique en cours marquées");
    await pm.keyboard.press("Escape");
    await pm.waitForSelector("#dlg-menu:not([open])", { state: "attached" });
    /* Installer Orbite (gratuit, sans boutique) : carte dans Mon orbite et en haut du Menu, guide en 3 gestes, invitation du navigateur. */
    await pm.tap('.onglets-bas a[data-vue="orbite"]');
    await pm.waitForSelector("#installer-orbite:not([hidden])");
    await pm.evaluate(() => Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36" }));
    await pm.tap("#onglet-menu");
    await pm.waitForSelector("#dlg-menu[open] #menu-liste > .installer--menu:first-child");
    assert(!(await pm.$("#menu-liste .installer--menu [data-installer=plus-tard]")) && !(await pm.$("#menu-liste .installer--menu [id=installer-titre]")), "carte du menu sans « Plus tard » ni identifiant en double");
    await pm.tap("#menu-liste .installer--menu [data-installer=oui]");
    await pm.waitForSelector("#dlg-installer[open]");
    assert(!(await pm.$eval("#dlg-menu", (d) => d.open)), "menu fermé avant le guide");
    const guide = await pm.$$eval("#installer-guide-liste .installer-guide__nav", (ns) => ns.map((n) => n.getAttribute("data-nav") + (n.hidden ? "-" : "") + (n.classList.contains("installer-guide__nav--ici") ? "*" : "")));
    assert(guide[0] === "chrome*" && guide.includes("ordinateur-"), "guide : navigateur du téléphone en premier, gestes de l'ordinateur masqués : " + guide);
    await pm.screenshot({ path: path.join(CAPTURES, "installer-guide-telephone.png") });
    await pm.tap("#installer-guide-ok");
    await pm.waitForSelector("#dlg-installer:not([open])", { state: "attached" });
    await pm.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.__invite = 1; }; e.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(e); });
    await pm.tap("#installer-orbite [data-installer=oui]");
    await pm.waitForFunction(() => window.__invite === 1);
    assert(!(await pm.$eval("#dlg-installer", (d) => d.open)), "invitation du navigateur utilisée, pas le guide");
    await pm.screenshot({ path: path.join(CAPTURES, "installer-carte-telephone.png") });
    await pm.tap("#installer-orbite [data-installer=plus-tard]");
    await pm.waitForSelector("#installer-orbite[hidden]", { state: "attached" });
    assert(await pm.evaluate(() => Number(localStorage.getItem("ef-installer-plus-tard")) > 0), "« Plus tard » retenu sur l'appareil");
    for (const vue of ["orbite", "salaire", "epargne", "credit", "profil"]) {
      if (vue === "profil") { await pm.tap("#onglet-menu"); await pm.waitForSelector("#dlg-menu[open]"); await pm.tap('.menu-complet__lien[href="#profil"]'); }
      else await pm.tap('.onglets-bas a[data-vue="' + vue + '"]');
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
    /* « Actualiser » : notification claire, avec ou sans nouveautés, heure et tuile qui a changé. */
    await page.click("#admin-actualiser");
    await page.waitForSelector('.toast--info:has-text("Aucune nouveauté")');
    assert(/Mis à jour à \d\d:\d\d/.test(await page.textContent("#admin-maj")), "heure de mise à jour");
    faux.ajouterCompte("nouvelle@exemple.tn", "Motdepasse-2026", {});
    await page.click("#admin-actualiser");
    await page.waitForSelector('.toast--ok:has-text("Données actualisées") >> text=1 nouvelle inscription');
    await page.waitForSelector("#admin-kpi-comptes .admin__k--nouveau .admin__k-plus:has-text(\"+1\")");
    assert((await page.textContent("#admin-actualiser")).trim() === "Actualiser", "bouton revenu à « Actualiser »");
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
    await page.waitForSelector("#onglet-donnees:not([hidden]) #partage-etat:not([hidden])");
    await page.waitForTimeout(300);
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
    await page.waitForFunction(() => /non partagée/i.test(document.getElementById("partage-etat").textContent));
    assert(!faux.partageDe("aziz@exemple.tn").accorde, "accord retiré");
    await page.goto(base + "/espace/#admin");
    await page.waitForFunction(() => /Aucun compte n'a encore partagé/.test(document.getElementById("admin-fiches").textContent));
  });

  await etape("partage accepté depuis la demande : accord enregistré, fiche visible par l'admin, Paramètres à jour", async () => {
    faux.ajouterCompte("partage@exemple.tn", "Partage-compte-2026!", { full_name: "Aziz Démo", orbite_consentement: VERSION_ACCORD,
      orbite: { prenom: "Aziz", nom: "Démo", dateNaissance: "1992-03-08", salaireBrut: 2400 } });
    const ctx4 = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx4.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await ctx4.route("https://api.pwnedpasswords.com/**", fuites);
    const p4 = await ctx4.newPage();
    suivre(p4);
    await p4.goto(base + "/connexion.html");
    await p4.fill("#email", "partage@exemple.tn");
    await p4.fill("#mdp", "Partage-compte-2026!");
    await p4.click("#envoyer");
    await p4.waitForURL(/\/espace\//);
    /* Les notes « Quoi de neuf » passent d'abord ; la demande attend que la fenêtre soit fermée. */
    await p4.waitForSelector("#dlg-nouveautes[open]");
    await p4.waitForTimeout(3000);
    assert(!(await p4.isVisible("#dlg-partage")), "jamais deux fenêtres à la fois");
    await p4.click('#dlg-nouveautes button[value="ok"]');
    await p4.waitForSelector("#dlg-partage[open]", { timeout: 15000 });
    await p4.click("#dlg-partage-oui");
    await p4.waitForSelector("#dlg-partage", { state: "hidden" });
    await p4.waitForFunction(() => /fiche est partagée/.test([...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" ")));
    assert(faux.partageDe("partage@exemple.tn").accorde, "accord enregistré sur le serveur");
    await p4.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_partage_reponse === "oui");
    await p4.goto(base + "/espace/#compte?onglet=donnees");
    await p4.waitForFunction(() => document.getElementById("partage-admin").checked && /Partage activé/.test(document.getElementById("partage-etat").textContent));
    await ctx4.close();
    await page.goto(base + "/espace/#admin");
    await page.reload();
    await page.waitForFunction(() => /Démo/.test(document.getElementById("admin-fiches").textContent));
  });

  await etape("accès offert à vie : un compte, tous les comptes, les nouveaux comptes ; retirable ; pastille d'une minute", async () => {
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.waitForFunction(() => document.querySelectorAll("#admin-comptes [data-offrir]").length >= 3);
    /* Un compte. */
    await page.click('#admin-comptes tr:has-text("autre@exemple.tn") [data-offrir="1"]');
    await page.waitForSelector('#admin-comptes tr:has-text("autre@exemple.tn") [data-offrir="0"]');
    assert(faux.abonnementDe("autre@exemple.tn").offert && faux.abonnementDe("autre@exemple.tn").offert_par === "compte", "accès offert à ce compte");
    assert(/offert à ce compte/.test(await page.textContent('#admin-comptes tr:has-text("autre@exemple.tn")')), "origine affichée");
    await page.click('#admin-comptes tr:has-text("autre@exemple.tn") [data-offrir="0"]');
    await page.waitForSelector('#admin-comptes tr:has-text("autre@exemple.tn") [data-offrir="1"]');
    assert(!faux.abonnementDe("autre@exemple.tn").offert, "accès retiré");
    /* Tous les comptes : confirmation dans une fenêtre, annulable. */
    await page.click("#admin-offrir-tous");
    await page.waitForSelector("#dlg-offert[open]");
    await page.click('#dlg-offert button[value="annuler"]');
    assert(!faux.abonnementDe("autre@exemple.tn").offert, "annuler ne change rien");
    await page.click("#admin-offrir-tous");
    await page.waitForSelector("#dlg-offert[open]");
    assert(/comptes? recevr/.test(await page.textContent("#dlg-offert-texte")), "nombre de comptes concernés");
    await page.click("#dlg-offert-ok");
    await page.waitForFunction(() => document.querySelectorAll('#admin-comptes [data-offrir="1"]').length === 0);
    assert([...faux.comptes.values()].every(({ user }) => faux.abonnementDe(user.email).offert), "tous les comptes offerts");
    assert(await page.isDisabled("#admin-offrir-tous"), "plus rien à offrir");
    await page.screenshot({ path: path.join(CAPTURES, "admin-offert.png"), fullPage: true });
    await page.click("#admin-retirer-tous");
    await page.waitForSelector("#dlg-offert[open]");
    await page.click("#dlg-offert-ok");
    await page.waitForFunction(() => document.querySelectorAll('#admin-comptes [data-offrir="0"]').length === 0);
    assert(faux.abonnementDe("aziz@exemple.tn").fin && !faux.abonnementDe("aziz@exemple.tn").offert, "l'abonnement payé reste enregistré");
    /* Nouveaux comptes. */
    await page.click('label:has(#admin-offert-nouveaux)');
    await page.waitForFunction(() => document.getElementById("admin-offert-nouveaux").checked && /offert/.test(document.getElementById("admin-offert-nouveaux-lib").textContent));
    faux.ajouterCompte("avie@exemple.tn", "Avie-compte-2026!", { full_name: "À vie" });
    assert(faux.abonnementDe("avie@exemple.tn").offert && faux.abonnementDe("avie@exemple.tn").offert_par === "nouveaux", "nouveau compte offert dès l'inscription");
    await page.click('label:has(#admin-offert-nouveaux)');
    await page.waitForFunction(() => !document.getElementById("admin-offert-nouveaux").checked);
    faux.ajouterCompte("essai@exemple.tn", "Essai-compte-2026!", { full_name: "Essai" });
    assert(!faux.abonnementDe("essai@exemple.tn").offert, "réglage coupé : de nouveau l'essai");
    /* Pastille : les deux inscriptions la font revenir, puis elle s'efface seule au bout d'une minute. */
    /* Horloge simulée dans une session à part (le reste du parcours garde l'heure réelle). */
    const ctx5 = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx5.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await ctx5.route("https://api.pwnedpasswords.com/**", fuites);
    const p5 = await ctx5.newPage();
    suivre(p5);
    await p5.clock.install();
    await p5.goto(base + "/connexion.html");
    await p5.fill("#email", "aziz@exemple.tn");
    await p5.fill("#mdp", "Tunis-2026-solide");
    await p5.click("#envoyer");
    await p5.waitForURL(/\/espace\//);
    await p5.waitForSelector("#badge-admin:not([hidden])");
    assert(+(await p5.textContent("#badge-admin")).trim() >= 2, "inscriptions non lues, dont les deux nouvelles");
    await p5.clock.runFor(61000);
    await p5.waitForSelector("#badge-admin", { state: "hidden" });
    await p5.reload();
    await p5.waitForSelector("#rail-admin:not([hidden])");
    await p5.waitForTimeout(800);
    assert(await p5.isHidden("#badge-admin"), "une pastille déjà montrée une minute ne revient pas");
    faux.ajouterCompte("plus@exemple.tn", "Plus-compte-2026!", { full_name: "Plus" });
    await p5.clock.runFor(91000);
    await p5.waitForSelector("#badge-admin:not([hidden])");
    assert((await p5.textContent("#badge-admin")).trim() === "1", "revient avec la seule nouvelle inscription");
    await ctx5.close();
    await page.goto(base + "/espace/#admin");
    await page.click("#admin-lues");
    await page.waitForSelector("#badge-admin", { state: "hidden" });
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
    /* Inscrit sur un autre appareil avec la case cochée (version dans le compte) : accepté sans écran. */
    faux.ajouterCompte("filleul@exemple.tn", "Filleul-compte-2026!", { full_name: "Filleul", orbite_consentement: VERSION_ACCORD });
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
    for (let i = 0; i < 50 && !faux.consentementsDe("filleul@exemple.tn").length; i++) await p3.waitForTimeout(100);
    assert(faux.consentementsDe("filleul@exemple.tn").length === 1 && !(await p3.isVisible("#dlg-consentement")), "accord du compte enregistré sans écran");
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
    await page.waitForSelector("#appli-guide", { state: "visible" });
    await page.click("#appli-guide");
    await page.waitForSelector("#dlg-installer[open]");
    assert(await page.$eval("#installer-guide-liste .installer-guide__nav", (n) => n.getAttribute("data-nav") === "ordinateur" && !n.hidden), "Paramètres : guide d'installation, ordinateur en premier");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-installer:not([open])", { state: "attached" });
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

  await etape("crédit en une phrase : montant, durée, taux, assurance et type compris ; phrase vide de sens refusée ; arabe", async () => {
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#cr-phrase");
    await page.fill("#cr-phrase", "Crédit voiture de 45 000 DT sur 60 mois à 10,5 % assurance 0,4 %");
    await page.press("#cr-phrase", "Enter");
    await page.waitForFunction(() => /Compris/.test(document.getElementById("cr-phrase-aide").textContent));
    const aide = await page.textContent("#cr-phrase-aide");
    assert(/crédit auto/.test(aide) && /45\u202f000/.test(aide) && /5 ans/.test(aide) && /10,5/.test(aide) && /assurance 0,4/.test(aide), "résumé : " + aide);
    assert(Number((await page.inputValue("#cr-capital")).replace(/\D/g, "")) === 45000, "montant rempli");
    const e = await page.evaluate(() => window.ModuleCredit.etat());
    assert(/(^|&)m=60(&|$)/.test(e) && /(^|&)t=10\.5(&|$)/.test(e) && /ty=auto/.test(e) && /as=0\.4/.test(e), "durée, taux, type et assurance appliqués : " + e);
    await page.screenshot({ path: path.join(CAPTURES, "credit-phrase.png") });
    await page.fill("#cr-phrase", "bonjour Orbite");
    await page.click("#cr-phrase-ok");
    await page.waitForFunction(() => /rien reconnu/.test(document.getElementById("cr-phrase-aide").textContent));
    await page.fill("#cr-phrase", "قرض سكن ١٢٠ ألف على ٢٠ سنة بنسبة ٨٪");
    await page.click("#cr-phrase-ok");
    await page.waitForFunction(() => /crédit immobilier/.test(document.getElementById("cr-phrase-aide").textContent));
    assert(Number((await page.inputValue("#cr-capital")).replace(/\D/g, "")) === 120000, "montant en arabe");
  });

  await etape("partage : page publique préremplie (crédit, salaire, épargne), aperçu identique, QR code, WhatsApp, e-mail, rien de personnel", async () => {
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#cr-phrase");
    await page.fill("#cr-phrase", "crédit immobilier 150 000 sur 20 ans à 9 %");
    await page.click("#cr-phrase-ok");
    await page.waitForFunction(() => /crédit immobilier/.test(document.getElementById("cr-phrase-aide").textContent));
    await page.click("#partager-sim");
    await page.waitForSelector("#dlg-partager[open]");
    const url = await page.inputValue("#partager-url");
    assert(url === base + "/simulateur-credit-tunisie#type=immo&montant=150000&duree=20&marge=1.5", "lien du crédit : " + url);
    await page.waitForFunction(() => /DT/.test(document.getElementById("partager-chiffre").textContent));
    const vu = (await page.textContent("#partager-chiffre")).trim();
    const nom = await page.evaluate(() => { const u = window.Orbite.utilisateur(); return u && u.email; });
    assert(!nom || url.indexOf(nom) === -1, "aucune adresse dans le lien");
    const wa = await page.getAttribute("#partager-whatsapp", "href");
    assert(wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).endsWith(url), "WhatsApp : " + wa);
    const mail = await page.getAttribute("#partager-email", "href");
    assert(mail.startsWith("mailto:?subject=") && decodeURIComponent(mail).indexOf(url) !== -1, "e-mail : " + mail);
    await page.click("#partager-qr-bouton");
    await page.waitForSelector("#partager-qr-image svg path");
    assert((await page.getAttribute("#partager-qr-image svg path", "d")).length > 500, "QR code dessiné");
    await page.screenshot({ path: path.join(CAPTURES, "partage-credit.png") });
    await page.click("#dlg-partager .bouton--fermer");
    /* La page publique reçue affiche le même chiffre que l'aperçu. */
    const pub = await contexte.newPage();
    await pub.goto(url);
    await pub.waitForSelector(".calc__recu");
    await pub.waitForFunction((v) => (document.querySelector("[data-v='mens_ent']").textContent + document.querySelector("[data-v='mens_dec']").textContent).trim() === v, vu);
    assert(await pub.isChecked("input[name='type'][value='immo']"), "type logement coché");
    assert((await pub.inputValue("#duree")) === "20", "durée remplie");
    await pub.screenshot({ path: path.join(CAPTURES, "partage-page-recue.png") });
    /* Salaire : situation de famille jointe seulement sur demande ; lien malformé ignoré. */
    await pub.goto(base + "/salaire-net-tunisie#montant=3000&secteur=public&chef=1&enfants=2&nom=Aziz");
    await pub.waitForSelector(".calc__recu");
    assert((await pub.inputValue("#montant")) === "3 000" && await pub.isChecked("input[name='secteur'][value='public']") && await pub.isChecked("input[name='chef']"), "salaire reçu");
    assert((await pub.textContent("output[name='enfants']")).trim() === "2", "enfants reçus");
    await pub.goto(base + "/calcul-cea-tunisie#depot=abc&montant=-5");
    await pub.waitForSelector("#depot");
    assert(!(await pub.$(".calc__recu")), "lien malformé : rien de rempli");
    await pub.close();
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#partager");
    await page.click("#partager");
    await page.waitForSelector("#dlg-partager[open]");
    const us = await page.inputValue("#partager-url");
    assert(/\/salaire-net-tunisie#montant=\d+/.test(us) && !/chef=/.test(us), "salaire sans famille : " + us);
    if (await page.isVisible("#partager-sensible")) {
      await page.check("#partager-sensible-case");
      assert(/chef=1/.test(await page.inputValue("#partager-url")), "famille jointe sur demande");
    }
    await page.click("#dlg-partager .bouton--fermer");
    await page.goto(base + "/espace/#epargne");
    await page.waitForSelector("#partager-sim");
    await page.click("#partager-sim");
    await page.waitForSelector("#dlg-partager[open]");
    const ue = await page.inputValue("#partager-url");
    assert(/\/(simulateur-assurance-vie-tunisie|calcul-cea-tunisie)#/.test(ue) && !/montant=/.test(ue), "épargne sans salaire : " + ue);
    if (await page.isVisible("#partager-sensible")) {
      await page.check("#partager-sensible-case");
      assert(/montant=\d/.test(await page.inputValue("#partager-url")), "salaire joint sur demande");
    }
    await page.waitForFunction(() => /DT/.test(document.getElementById("partager-chiffre").textContent));
    await page.setViewportSize({ width: 375, height: 760 });
    await page.screenshot({ path: path.join(CAPTURES, "partage-epargne-telephone.png") });
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.click("#dlg-partager .bouton--fermer");
  });

  await etape("haute lisibilité (compte, avant l'affichage, Ctrl K) ; annuler / rétablir (boutons, Ctrl Z / Ctrl Y)", async () => {
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.waitForSelector("#choix-lisible", { state: "visible" });
    await page.click('#choix-lisible label:has(input[value="oui"])');
    assert((await page.getAttribute("html", "data-lisible")) === "oui", "lisibilité appliquée");
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_lisible === "oui");
    /* Retenue sur le compte : un autre appareil (stockage vide) l'applique au démarrage. */
    /* La question « partager votre fiche avec l'administrateur » est traitée ailleurs : on la marque répondue. */
    await page.evaluate(() => window.Espace.compte.preferences({ orbite_partage_demande: new Date().toISOString(), orbite_partage_reponse: "non" }));
    await page.evaluate(() => localStorage.removeItem("ef-lisible"));
    await page.goto(base + "/espace/#credit");
    await page.reload();
    await page.waitForFunction(() => document.documentElement.getAttribute("data-lisible") === "oui");
    await page.waitForSelector("#cr-capital");
    const lsl = await page.evaluate(() => [localStorage.getItem("ef-lisible"), Object.keys(localStorage).join(",")]);
    assert(lsl[0] === "oui", "recopiée sur l'appareil : " + JSON.stringify(lsl));
    await page.screenshot({ path: path.join(CAPTURES, "lisibilite-credit.png") });
    await page.setViewportSize({ width: 820, height: 900 });
    assert(await page.isVisible(".rail") && !(await page.isVisible(".onglets-bas")) && !(await page.isVisible("#menu-ouvrir")), "tablette (820 px) : barre latérale du grand écran, ni onglets du bas ni ☰");
    for (const l of [1440, 1366, 1280, 1024, 800]) {
      await page.setViewportSize({ width: l, height: 700 });
      const deborde = await page.evaluate(() => { const b = document.getElementById("barre"); return b.scrollWidth > b.clientWidth + 1 || Array.from(b.querySelectorAll("button:not([hidden]), a:not([hidden])")).some((x) => x.offsetParent && x.getBoundingClientRect().right > window.innerWidth); });
      await page.screenshot({ path: path.join(CAPTURES, "barre-" + l + ".png"), clip: { x: 0, y: 0, width: l, height: 80 } });
      assert(!deborde, "barre sans débordement à " + l + " px");
    }
    await page.setViewportSize({ width: 1360, height: 900 });
    /* Annuler / rétablir. */
    const avant = Number((await page.inputValue("#cr-capital")).replace(/\D/g, ""));
    await page.fill("#cr-capital", "90 000");
    await page.press("#cr-capital", "Tab");
    await page.waitForFunction(() => window.OrbiteHistorique.position().n === 2);
    assert(!(await page.isDisabled("#histo-annuler")) && await page.isDisabled("#histo-retablir"), "annuler possible, rétablir non");
    await page.click("#histo-annuler");
    await page.waitForFunction((v) => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) === v, avant);
    await page.waitForFunction(() => !document.getElementById("histo-retablir").disabled);
    await page.click("#histo-retablir");
    await page.waitForFunction(() => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) === 90000);
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press("Control+z");
    await page.waitForFunction((v) => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) === v, avant);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Control+y");
    await page.waitForFunction(() => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) === 90000);
    await page.waitForTimeout(1000);
    /* Ctrl K : retour à la lisibilité normale. */
    await page.keyboard.press("Control+k");
    await page.waitForSelector("#dlg-palette[open]");
    await page.fill("#palette-q", "lisibilite");
    await page.waitForFunction(() => /lisibilité normale/.test(document.getElementById("palette-liste").textContent));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-lisible"));
    await page.waitForFunction(() => !window.Orbite.utilisateur().user_metadata.orbite_lisible);
  });

  await etape("simulation guidée (crédit, salaire, épargne), comparer 2 crédits enregistrés, rappel de versement mensuel", async () => {
    async function enregistrer(nom) {
      await page.click("#enregistrer");
      await page.waitForSelector("#dlg-enregistrer[open]");
      await page.fill("#enr-nom", nom);
      await page.click('#dlg-enregistrer button[value="ok"]');
      await page.waitForFunction((n) => !document.getElementById("dlg-enregistrer").open, nom);
      await page.waitForTimeout(400);
    }
    async function choisir(texte) { await page.click(`#guidee-reponse .guidee__option:has-text("${texte}")`); await page.waitForTimeout(250); }
    /* Les étapes suivantes partent de l'état des modules : il est remis tel quel à la fin. */
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#cr-capital");
    const avantModules = await page.evaluate(() => ({ c: window.ModuleCredit.instantane(), s: window.ModuleSalaire.etat(), e: window.ModuleEpargne.etat() }));
    /* Crédit : voiture, 40 000 DT, 5 ans, taux de 9 %. */
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector('[data-guidee="credit"]');
    await page.click('[data-guidee="credit"]');
    await page.waitForSelector("#dlg-guidee[open]");
    await choisir("Une voiture");
    await page.waitForSelector("#guidee-montant");
    await page.fill("#guidee-montant", "40000");
    await page.keyboard.press("Enter");
    await choisir("5 ans");
    await choisir("J'ai un taux");
    await page.waitForSelector("#guidee-montant");
    await page.fill("#guidee-montant", "abc");
    await page.click("#guidee-suivant");
    await page.waitForSelector("#guidee-erreur:not([hidden])");
    await page.fill("#guidee-montant", "9");
    await page.click("#guidee-suivant");
    await page.waitForSelector(".guidee__resultat");
    const mens = await page.textContent(".guidee__resultat-val");
    assert(/830,3\d\d/.test(mens.replace(/\s/g, "")), "mensualité 40 000 DT, 5 ans, 9 % : " + mens);
    await page.screenshot({ path: path.join(CAPTURES, "guidee-credit.png") });
    await page.click("#guidee-suivant");
    await page.waitForFunction(() => !document.getElementById("dlg-guidee").open);
    const e1 = await page.evaluate(() => window.ModuleCredit.etat());
    assert(/c=40000/.test(e1) && /m=60/.test(e1) && /t=9(&|$)/.test(e1) && /ty=auto/.test(e1), "module rempli : " + e1);
    await enregistrer("Banque A voiture");
    /* Deuxième offre : même voiture au taux habituel. */
    await page.click('[data-guidee="credit"]');
    await page.waitForSelector("#dlg-guidee[open]");
    await choisir("Une voiture");
    await page.fill("#guidee-montant", "40000");
    await page.click("#guidee-suivant");
    await choisir("5 ans");
    await choisir("Taux habituel");
    await page.waitForSelector(".guidee__resultat");
    await page.click("#guidee-suivant");
    await enregistrer("Banque B voiture");
    /* Salaire : net connu, public, chef de famille avec 2 enfants. */
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector('[data-guidee="salaire"]');
    await page.click('[data-guidee="salaire"]');
    await page.waitForSelector("#dlg-guidee[open]");
    await choisir("Mon net");
    await page.fill("#guidee-montant", "2000");
    await page.click("#guidee-suivant");
    await choisir("Secteur public");
    await choisir("Chef de famille, 2 enfants");
    await page.waitForSelector(".guidee__resultat");
    await page.click("#guidee-suivant");
    const es = await page.evaluate(() => window.EtatSimulation.decoder(window.ModuleSalaire.etat()).a);
    assert(es.sens === "net" && es.montant === 2000 && es.secteur === "public" && es.chefDeFamille && es.enfants === 2, "salaire rempli : " + JSON.stringify(es));
    /* Épargne : les deux, 150 + 100 DT par mois, 12 ans → 15 ans proposés : on prend 15. */
    await page.goto(base + "/espace/#epargne");
    await page.waitForSelector('[data-guidee="epargne"]');
    await page.click('[data-guidee="epargne"]');
    await page.waitForSelector("#dlg-guidee[open]");
    await choisir("Les deux");
    await page.fill("#guidee-montant", "150");
    await page.click("#guidee-suivant");
    await page.fill("#guidee-montant", "100");
    await page.click("#guidee-suivant");
    await choisir("15 ans");
    await page.waitForSelector(".guidee__resultat");
    await page.setViewportSize({ width: 375, height: 760 });
    await page.screenshot({ path: path.join(CAPTURES, "guidee-epargne-telephone.png") });
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.click("#guidee-suivant");
    const ee = await page.evaluate(() => window.ModuleEpargne.etat());
    assert(/Xp=ac/.test(ee), "épargne : les deux produits : " + ee);
    /* Comparer les deux crédits. */
    await page.goto(base + "/espace/#simulations");
    await page.waitForSelector('.carte[data-outil="credit"]');
    await page.click("#comparer-mode");
    await page.waitForSelector("#comparer-barre:not([hidden])");
    for (const nom of ["Banque A voiture", "Banque B voiture"]) await page.click(`.carte:has-text("${nom}") .carte__lien`);
    const autre = await page.$('.carte:not([data-outil="credit"]) .carte__case');
    if (autre) assert(await autre.isDisabled(), "une simulation d'un autre module ne peut pas être cochée");
    await page.click("#comparer-ouvrir");
    await page.waitForSelector("#dlg-comparer[open]");
    const entetes = await page.$$eval("#comparer-table thead .comparer__nom", (x) => x.map((e) => e.textContent));
    assert(entetes.length === 2 && entetes.includes("Banque A voiture"), "colonnes : " + entetes);
    const meilleur = await page.$$eval("#comparer-table .comparer__principal td", (x) => x.map((e) => e.className));
    assert(meilleur.filter((c) => /meilleur/.test(c)).length === 1, "une mensualité la plus basse : " + meilleur);
    await page.screenshot({ path: path.join(CAPTURES, "comparer-credits.png") });
    await page.click("#dlg-comparer .bouton--fermer");
    await page.click("#comparer-annuler");
    assert(await page.isHidden("#comparer-barre"), "mode comparaison quitté");
    /* Rappel de versement : le 10 de chaque mois. */
    await page.goto(base + "/espace/#profil?section=contrats");
    await page.waitForSelector("#p-jour-versement", { state: "attached" });
    await page.evaluate(() => { const d = document.getElementById("sec-contrats"); if (d) d.open = true; });
    await page.selectOption("#p-jour-versement", "10");
    await page.waitForFunction(() => window.Orbite.profil().jourVersement === 10);
    const rv = await page.evaluate(() => window.RappelsCalcul.rappels(window.Orbite.synthese(), null, null, new Date()).filter((r) => r.type === "versement"));
    assert(rv.length === 1 && new Date(rv[0].quand).getDate() >= 1 && !/\d{3}/.test(rv[0].mail.corps), "rappel de versement : " + JSON.stringify(rv));
    await page.selectOption("#p-jour-versement", "0");
    await page.waitForFunction(() => window.Orbite.profil().jourVersement === 0);
    await page.evaluate((m) => { window.ModuleCredit.restaurer(m.c); window.ModuleSalaire.charger(m.s); window.ModuleEpargne.charger(m.e); ["credit", "salaire", "epargne"].forEach((v) => window.Orbite.detacherSimulation(v)); }, avantModules);
  });

  await etape("crédit, point 5 : projet immobilier (frais, capacité, quand acheter), comparer mes offres (classement, enregistrement), regrouper mes crédits", async () => {
    await page.goto(base + "/espace/#credit?espace=projet");
    await page.waitForSelector("#credit-projet:not([hidden]) #ce-prix");
    assert(await page.isHidden("#credit-racine"), "un seul onglet affiché");
    await page.fill("#ce-prix", "250 000");
    await page.fill("#ce-apport", "50 000");
    await page.fill("#ce-ans", "20");
    await page.fill("#ce-taux", "10");
    await page.waitForFunction(() => document.querySelectorAll("#ce-projet-res .ce-table tbody tr").length === 5);
    const lignes = await page.$$eval("#ce-projet-res .ce-table tbody tr", (t) => t.map((r) => r.textContent));
    assert(/enregistrement.*180,000/.test(lignes[0].replace(/\s/g, " ")) && /2 500,000/.test(lignes[1].replace(/\s/g, " ")), "frais : " + lignes.join(" | "));
    const credit = await page.evaluate(() => { const C = window.CreditProjets.projet({ prix: 250000, apport: 50000, mois: 240, tauxPct: 10 }); return Math.round(C.credit); });
    await page.waitForFunction((c) => document.getElementById("ce-projet-res").textContent.replace(/\s/g, "").includes(String(c)), credit, { timeout: 5000 })
      .catch(async () => { throw new Error("crédit nécessaire affiché (" + credit + ") : " + (await page.textContent("#ce-projet-res")).slice(0, 200)); });
    assert(await page.isVisible("#ce-projet-res .ce-quand"), "quand pourrai-je acheter");
    await page.check("#ce-premier");
    await page.waitForFunction(() => /Prêt de l'État/.test(document.getElementById("ce-projet-res").textContent));
    await page.uncheck("#ce-premier");
    await page.screenshot({ path: path.join(CAPTURES, "credit-projet.png") });
    await page.click("#ce-projet-simuler");
    await page.waitForFunction(() => location.hash === "#credit" && !document.getElementById("credit-racine").hidden);
    const e = await page.evaluate(() => window.ModuleCredit.etat());
    assert(new RegExp("c=" + credit + "(&|$)").test(e) && /m=240/.test(e), "crédit du projet simulé : " + e);
    /* Comparer mes offres. */
    await page.click("#ce-tab-offres");
    await page.waitForSelector("#credit-offres:not([hidden]) .ce-offre");
    await page.fill("#ce-o-capital", "150 000");
    await page.fill("#ce-o-ans", "20");
    await page.click("#ce-offre-plus");
    await page.fill('#credit-offres .ce-offre[data-i="2"] [data-o="taux"]', "2,75");
    await page.waitForFunction(() => document.querySelectorAll("#ce-offres-res .ce-table tbody tr").length === 3);
    assert((await page.$$("#ce-offres-res .ce-meilleure")).length === 1, "une offre la moins chère");
    assert(/TMM \+1 point/.test(await page.textContent("#ce-offres-res")), "effet d'un point de TMM");
    await page.screenshot({ path: path.join(CAPTURES, "credit-offres.png") });
    const avant = faux.simulations().length;
    await page.click("#ce-offres-enregistrer");
    await page.waitForFunction((n) => document.querySelector(".toast") && /3 offres enregistrées/.test(document.body.textContent), avant);
    assert(faux.simulations().length === avant + 3 && faux.simulations().some((x) => x.nom === "Offre Banque A" && x.outil === "credit"), "offres enregistrées");
    /* Regrouper mes crédits : deux crédits fictifs ajoutés au profil le temps de l'étape. */
    const creditsAvant = await page.evaluate(() => JSON.stringify(window.Orbite.profil().credits));
    await page.evaluate(() => window.Orbite.majProfil({ credits: window.Orbite.profil().credits.concat([
      { libelle: "Crédit auto démo", type: "auto", mensualite: 320, tauxPct: 10, moisRestants: 30 },
      { libelle: "Crédit conso démo", type: "conso", mensualite: 210, tauxPct: 11, moisRestants: 17, capitalRestant: 3292 },
      { libelle: "Crédit immo démo", type: "immo", mensualite: 880, tauxPct: 8, moisRestants: 148 }]) }));
    await page.click("#ce-tab-regrouper");
    await page.waitForSelector("#credit-regrouper:not([hidden]) .cr-section-tete");
    if (await page.$("#credit-regrouper [data-cr]")) {
      if (!(await page.isChecked("#credit-regrouper [data-cr]"))) await page.check("#credit-regrouper [data-cr]");
      await page.waitForSelector("#ce-reg-res .cr-stats");
      assert(/Nouvelle mensualité/.test(await page.textContent("#ce-reg-res")) && /Indemnité/.test(await page.textContent("#ce-reg-res")), "regroupement calculé");
      /* Les choix tiennent quand le profil se recalcule (le crédit immobilier coché se décochait, l'indemnité revenait à 1,5 %). */
      const immo = '#credit-regrouper label:has-text("Crédit immo démo") input';
      assert(!(await page.isChecked(immo)), "crédit immobilier décoché par défaut");
      await page.check(immo);
      await page.fill("#ce-r-ira", "2");
      await page.waitForFunction(() => /Indemnité \(2 %\)/.test(document.getElementById("ce-reg-res").textContent));
      await page.evaluate(() => window.Orbite.majProfil({ enfants: window.Orbite.profil().enfants }, { immediat: true }));
      await page.evaluate(() => window.Orbite.majProfil({ credits: window.Orbite.profil().credits.concat([{ libelle: "Crédit perso démo", type: "conso", mensualite: 90, tauxPct: 12, moisRestants: 10 }]) }, { immediat: true }));
      await page.waitForSelector('#credit-regrouper label:has-text("Crédit perso démo")');
      await page.waitForTimeout(400);
      assert(await page.isChecked(immo) && (await page.inputValue("#ce-r-ira")) === "2" && /Indemnité \(2 %\)/.test(await page.textContent("#ce-reg-res")) && /Crédit immo démo/.test(await page.textContent("#ce-reg-res table")), "choix gardés après recalcul du profil");
      await page.screenshot({ path: path.join(CAPTURES, "credit-regrouper.png") });
    } else assert(false, "crédits du profil absents du regroupement");
    /* Retour aux crédits d'avant, enregistré tout de suite (les étapes suivantes rechargent la page). */
    await page.evaluate((c) => window.Orbite.majProfil({ credits: JSON.parse(c) }, { immediat: true }), creditsAvant);
    await page.waitForFunction((c) => JSON.stringify(window.Orbite.profil().credits.map((x) => x.libelle)) === JSON.stringify(JSON.parse(c).map((x) => x.libelle)), creditsAvant);
    await page.waitForTimeout(800);
    await page.keyboard.press("Home");
    await page.click("#ce-tab-simuler");
    await page.waitForFunction(() => location.hash === "#credit");
  });

  await etape("TMM du mois : saisi dans Administration, appliqué à tout Orbite, courbe et effet dans Crédit › Le TMM, retour au défaut", async () => {
    faux.marquerAdmin("aziz@exemple.tn");
    const m = new Date(), mois = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const ce = mois(m), avant = mois(new Date(m.getFullYear(), m.getMonth() - 1, 1));
    await page.goto(base + "/espace/#admin");
    await page.reload();
    await page.waitForSelector("#admin-tmm-form", { state: "visible" });
    await page.fill("#admin-tmm-mois", avant);
    await page.fill("#admin-tmm-taux", "7,45");
    await page.click('#admin-tmm-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll("#admin-tmm-liste li").length === 1);
    await page.fill("#admin-tmm-mois", ce);
    await page.fill("#admin-tmm-taux", "abc");
    await page.click('#admin-tmm-form button[type="submit"]');
    await page.waitForSelector("#admin-tmm-erreur:not([hidden])");
    await page.fill("#admin-tmm-taux", "7,2");
    await page.click('#admin-tmm-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll("#admin-tmm-liste li").length === 2);
    assert(faux.tmm().get(ce + "-01") === 7.2, "TMM enregistré");
    await page.waitForFunction(() => window.OrbiteCalcul.TMM === 7.2 && window.MoteurCredit.DEFAUTS.tmm === 7.2);
    assert(!/Nouveau TMM/.test(await page.textContent(".toasts")), "pas d'annonce à l'administrateur qui vient de le saisir");
    assert(/7,2 %/.test(await page.textContent("#admin-tmm-dernier")), "dernier TMM affiché");
    await page.screenshot({ path: path.join(CAPTURES, "admin-tmm.png") });
    /* Lien « Comptes » (rubrique de la même page) : défile jusqu'à la liste, reste dans Administration. */
    await page.click('.admin__offert-astuce a[href="#admin-t-liste"]');
    await page.waitForFunction(() => { const r = document.getElementById("admin-t-liste").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; });
    assert(await page.evaluate(() => location.hash === "#admin" && !document.getElementById("vue-admin").hidden), "reste dans Administration");
    /* « Aller au contenu » non plus ne quitte pas la page. */
    await page.evaluate(() => document.querySelector(".lien-evitement").click());
    assert(await page.evaluate(() => location.hash === "#admin" && document.activeElement.id === "principal"), "lien d'évitement");
    await page.goto(base + "/espace/#credit?espace=tmm");
    await page.waitForSelector("#credit-tmm:not([hidden]) .tmm-cadre .og-svg");
    const txt = await page.textContent("#credit-tmm");
    assert(/7,2 %/.test(txt) && /−0,25 point/.test(txt), "TMM du mois et variation : " + txt.slice(0, 300));
    assert((await page.$$("#credit-tmm .tmm-cadre .og-tableau tbody tr")).length === 2, "deux mois dans le tableau du graphique");
    /* Graphique commun : bulle au clavier sur le dernier mois. */
    await page.focus("#credit-tmm .tmm-cadre .og-svg");
    await page.waitForFunction(() => { const b = document.querySelector("#credit-tmm .og-bulle"); return b && !b.hidden && /7,2\s?%/.test(b.textContent); });
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem("orbite-tmm")).taux === 7.2), "gardé sur l'appareil");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "credit-tmm.png") });
    /* Nouveau TMM vu au chargement suivant : annoncé une fois. */
    await page.evaluate(() => localStorage.setItem("orbite-tmm-vu", "2000-01-01"));
    /* L'annonce dure 4,8 s dès le chargement : on la guette dès le début de la navigation, pas après l'événement « load ». */
    await Promise.all([
      page.waitForSelector('.toast:has-text("Nouveau TMM : 7,2 %")', { state: "attached", timeout: 20000 }),
      page.reload({ waitUntil: "commit" })
    ]);
    /* Retour au défaut quand plus rien n'est saisi. */
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-tmm-liste li");
    while (await page.$("#admin-tmm-liste li button")) { const n = (await page.$$("#admin-tmm-liste li")).length; await page.click("#admin-tmm-liste li button"); await page.waitForFunction((k) => document.querySelectorAll("#admin-tmm-liste li").length === k - 1, n); }
    await page.waitForFunction(() => window.OrbiteCalcul.TMM === 7.5 && window.MoteurCredit.DEFAUTS.tmm === 7.5 && !localStorage.getItem("orbite-tmm"));
  });

  await etape("Mon mois : budget proposé, dépense en une phrase annulable, enveloppe réglée, calendrier, dates, agenda .ics, téléphone", async () => {
    const avant = await page.evaluate(() => JSON.stringify({ credits: window.Orbite.profil().credits, contrats: window.Orbite.profil().contrats, budget: window.Orbite.profil().budget, jourPaie: window.Orbite.profil().jourPaie, loyer: window.Orbite.profil().loyer }));
    await page.evaluate(() => window.Orbite.majProfil({ loyer: 450, jourPaie: 25, budget: { enveloppes: [], mois: {} },
      credits: [{ libelle: "Auto démo", type: "auto", mensualite: 320, capitalRestant: 9000, tauxPct: 10, moisRestants: 31, jourPrelevement: 5 },
        { libelle: "Conso démo", type: "conso", mensualite: 210, capitalRestant: 400, tauxPct: 12, moisRestants: 2 }],
      contrats: [{ type: "av", versementMensuel: 150, moisDebut: 1, anneeDebut: 2020 }] }, { immediat: true }));
    await page.goto(base + "/espace/#mois?onglet=budget");
    await page.waitForSelector("#mo-budget:not([hidden]) .mo-ligne");
    assert((await page.$$("#mo-env-liste .mo-ligne")).length === 8, "8 enveloppes");
    const prevuCredits = await page.textContent('.mo-ligne[data-cle="credits"] .mo-ligne__chiffres');
    assert(/530 DT/.test(prevuCredits.replace(/\s/g, " ")), "crédits prévus : " + prevuCredits);
    assert(/Proposition/.test(await page.textContent("#mo-env-sous")), "proposition affichée");
    /* Une phrase → la bonne enveloppe ; annulable. */
    await page.fill("#mo-phrase", "45 dinars d'essence");
    await page.waitForFunction(() => document.getElementById("mo-env").value === "transport" && /45 DT → Transport/.test(document.getElementById("mo-phrase-aide").textContent.replace(/\s/g, " ")));
    await page.click("#mo-ajouter");
    await page.waitForFunction(() => { const b = window.Orbite.profil().budget, k = window.BudgetCalcul.cleMois(new Date()); return b.mois[k] && b.mois[k].transport === 45 && b.enveloppes.length === 8; });
    await page.fill("#mo-phrase", "٢٠ دينار خضرة");
    await page.press("#mo-phrase", "Enter");
    await page.waitForFunction(() => { const k = window.BudgetCalcul.cleMois(new Date()); return window.Orbite.profil().budget.mois[k].courses === 20; });
    await page.click('.toast:has-text("ajoutés à « Courses »") button:has-text("Annuler")');
    await page.waitForFunction(() => { const k = window.BudgetCalcul.cleMois(new Date()); return !window.Orbite.profil().budget.mois[k].courses; });
    await page.fill("#mo-phrase", "bonjour");
    await page.click("#mo-ajouter");
    assert(/Montant non reconnu/.test(await page.textContent("#mo-phrase-aide")), "phrase sans montant refusée");
    /* Enveloppe réglée : dépassement signalé. */
    await page.click('[data-modifier="loisirs"]');
    await page.fill("#mo-p-loisirs", "50");
    await page.fill("#mo-d-loisirs", "80");
    await page.click('#mo-edit-loisirs button[type="submit"]');
    await page.waitForSelector('.mo-ligne--depasse[data-cle="loisirs"]');
    assert(/Loisirs et sorties \(\+30 DT\)/.test((await page.textContent("#mo-alerte")).replace(/\s/g, " ")), "alerte de dépassement");
    assert(!/Proposition/.test(await page.textContent("#mo-env-sous")), "le plan devient le budget");
    assert(/jours?, soit .* par jour/.test(await page.textContent("#mo-par-jour")), "montant par jour jusqu'à la paie");
    await page.click('[data-modifier="credits"]');
    await page.click('[data-paye="credits"]');
    await page.waitForFunction(() => { const k = window.BudgetCalcul.cleMois(new Date()); return window.Orbite.profil().budget.mois[k].credits === 530; });
    await page.click("#mo-b-prec");
    assert(/^0 \//.test((await page.textContent('.mo-ligne[data-cle="transport"] .mo-ligne__chiffres')).replace(/\s/g, " ")), "le mois précédent repart de zéro");
    await page.click("#mo-b-suiv");
    await page.screenshot({ path: path.join(CAPTURES, "mois-budget.png"), fullPage: true });
    /* Calendrier : échéances du mois, jour à préciser, dernière échéance le mois suivant. */
    await page.click("#mo-tab-calendrier");
    await page.waitForSelector("#mo-calendrier:not([hidden]) .mo-evt");
    const agenda = (await page.textContent("#mo-agenda")).replace(/\s/g, " ");
    assert(/Auto démo/.test(agenda) && /Conso démo/.test(agenda) && /Versement d'épargne/.test(agenda) && /Paie/.test(agenda), "agenda : " + agenda.slice(0, 300));
    assert(/Prélèvements : 680 DT/.test((await page.textContent("#mo-cal-resume")).replace(/\s/g, " ")), "total des prélèvements");
    assert(await page.$('.mo-evt[data-jour="25"][data-t="paie"]'), "paie le 25");
    await page.click("#mo-agenda [data-dates]");
    await page.waitForSelector("#mo-dates[open] #mo-jour-credit-1");
    await page.selectOption("#mo-jour-credit-1", "10");
    await page.waitForFunction(() => window.Orbite.profil().credits[1].jourPrelevement === 10);
    await page.waitForSelector('.mo-evt[data-jour="10"][data-t="credit"]');
    await page.click("#mo-c-suiv");
    await page.waitForFunction(() => /Dernière échéance : Conso démo/.test(document.getElementById("mo-agenda").textContent));
    await page.click('.mo-cal__case--evt[data-jour="10"]');
    await page.waitForSelector('.mo-evt--vu[data-jour="10"]');
    await page.click("#mo-c-prec");
    await page.screenshot({ path: path.join(CAPTURES, "mois-calendrier.png"), fullPage: true });
    const [ics] = await Promise.all([page.waitForEvent("download"), page.click("#mo-ics")]);
    const txt = fs.readFileSync(await ics.path(), "utf8");
    assert(ics.suggestedFilename() === "orbite-calendrier.ics" && /^BEGIN:VCALENDAR/.test(txt) && (txt.match(/BEGIN:VEVENT/g) || []).length > 20 && /SUMMARY:Auto démo · 320\\,000 DT/.test(txt), "fichier agenda");
    /* Palette et téléphone. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#mois?onglet=budget");
    await page.waitForSelector("#mo-budget:not([hidden]) .mo-ligne");
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!deborde, "pas de défilement horizontal sur téléphone");
    assert(await page.$eval("#onglet-menu", (b) => b.hasAttribute("data-actif")), "onglet « Menu » allumé dans Mon mois");
    await page.screenshot({ path: path.join(CAPTURES, "mois-budget-mobile.png"), fullPage: true });
    await page.click("#mo-tab-calendrier");
    await page.waitForSelector("#mo-calendrier:not([hidden]) .mo-evt");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "calendrier sans débordement");
    await page.screenshot({ path: path.join(CAPTURES, "mois-calendrier-mobile.png"), fullPage: true });
    /* Repères de « Votre système » : montant entier dans sa tuile, unité dessous (« 345 DT / moi » coupé, 15 oct. 2026). */
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#fiche-orbite .orbite-repere__nb .roule");
    for (const l of [360, 390]) {
      await page.setViewportSize({ width: l, height: 844 });
      const r = await page.$$eval("#fiche-orbite .orbite-repere", (as) => as.map((a) => {
        const n = a.querySelector(".orbite-repere__nb"), g = document.createRange(); g.selectNodeContents(n);
        const t = g.getBoundingClientRect(), b = a.getBoundingClientRect();
        return { texte: a.querySelector(".orbite-repere__val").textContent.replace(/\s+/g, " ").trim(), dedans: t.right <= b.right - parseFloat(getComputedStyle(a).paddingRight) + 0.5 };
      }));
      assert(r.length === 3 && r.every((x) => x.dedans), "montants entiers dans les tuiles à " + l + " px : " + JSON.stringify(r));
      assert(/DT par mois$/.test(r[1].texte) && /DT par an$/.test(r[2].texte), "unités « par mois » et « par an » sous les montants");
    }
    await page.screenshot({ path: path.join(CAPTURES, "orbite-reperes-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate((a) => window.Orbite.majProfil(JSON.parse(a), { immediat: true }), avant);
  });

  await etape("crédit : lire une offre (texte), contrôler le tableau de la banque (exemple exact, PDF avec une erreur)", async () => {
    await page.goto(base + "/espace/#credit?partie=outils");
    await page.waitForSelector("#cr-outil-offre", { state: "visible" });
    await page.click("#cr-outil-offre > summary");
    await page.fill("#cr-offre-txt", "Montant du prêt : 120 000,000 DT\nDurée : 180 mois\nTaux : TMM + 2,75 %\nTEG : 11,2 %\nFrais de dossier : 1 %\nAssurance 0,35 %");
    await page.waitForSelector("#cr-offre-capital");
    assert(/6 valeurs repérées/.test(await page.textContent("#cr-o-offre")), "valeurs repérées");
    await page.click("[data-offre-appliquer]");
    await page.waitForFunction(() => /(^|&)c=120000(&|$)/.test(window.ModuleCredit.etat()));
    const e = await page.evaluate(() => window.ModuleCredit.etat());
    assert(/(^|&)m=180(&|$)/.test(e) && /mg=2\.75/.test(e) && /as=0\.35/.test(e), "offre appliquée : " + e);
    /* Offre appliquée : on est mené au résultat (partie « Simuler »). Retour aux outils. */
    assert(await page.evaluate(() => window.SousRubriques.active("credit")) === "simuler", "résultat de l'offre affiché");
    await partie(page, "credit", "outils");
    /* Tableau de la banque : l'exemple (échéancier exact) ne montre aucune erreur. */
    await page.click("#cr-outil-audit > summary");
    await page.click("[data-audit-exemple]");
    await page.waitForFunction(() => /chaque échéance est exacte au millime/.test(document.getElementById("cr-o-audit").textContent));
    /* PDF de banque (60 échéances, intérêts majorés de 0,750 DT à l'échéance 14) lu sur l'appareil. */
    await page.setInputFiles('[data-lire-fichier="audit"]', path.join(__dirname, "fixtures", "tableau-banque.pdf"));
    await page.waitForFunction(() => /Lecture terminée/.test(document.querySelector("#cr-o-audit [data-lecture-etat]").textContent), null, { timeout: 30000 });
    const au = await page.textContent("#cr-o-audit .cr-outil__sortie");
    assert(/60 échéances lues/.test(au) && /1 point à vérifier/.test(au) && /Échéance 14/.test(au) && /\+0,750/.test(au), "audit du PDF : " + au.slice(0, 400));
    await page.screenshot({ path: path.join(CAPTURES, "credit-audit.png"), fullPage: false });
  });

  await etape("document reçu par « Partager » : service worker, reconnaissance du tableau, outil ouvert, rien ne reste ; photo : choix", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
    const octets = Array.from(fs.readFileSync(path.join(__dirname, "fixtures", "tableau-banque.pdf")));
    const parSw = await page.evaluate(async (o) => {
      const fd = new FormData();
      fd.append("fichiers", new File([new Uint8Array(o)], "echeancier-banque.pdf", { type: "application/pdf" }));
      if (navigator.serviceWorker.controller) { const r = await fetch("/espace/recevoir", { method: "POST", body: fd }); return r.ok && (await caches.has("orbite-recus")) ? "service worker" : "service worker ? " + r.status; }
      /* Sans service worker actif : on dépose comme lui. */
      const c = await caches.open("orbite-recus");
      await c.put("/__orbite/recu/0", new Response(new Blob([new Uint8Array(o)], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "X-Orbite-Nom": "echeancier-banque.pdf" } }));
      await c.put("/__orbite/recu/liste", new Response(JSON.stringify({ n: 1, t: Date.now() })));
      return "page";
    }, octets);
    assert(parSw !== "page" ? parSw === "service worker" : true, "dépôt par le service worker : " + parSw);
    /* Chargement complet de la page, comme après la redirection du service worker. */
    await page.goto(base + "/cgv.html");
    await page.goto(base + "/espace/#recevoir");
    await page.waitForSelector("#dlg-recevoir[open]", { timeout: 20000 }).catch(async () => {
      const d = await page.evaluate(async () => [location.href, await caches.has("orbite-recus"), Array.from(document.querySelectorAll(".toast")).map((t) => t.textContent), Array.from(document.querySelectorAll("dialog[open]")).map((x) => x.id), !!window.OrbiteRecevoir, window.Orbite && window.Orbite.pret]);
      throw new Error("fenêtre du document reçu absente : " + JSON.stringify(d));
    });
    await page.waitForSelector("#recevoir-resultat:not([hidden])", { timeout: 60000 });
    assert(/tableau d'amortissement/.test(await page.textContent("#recevoir-type")), "tableau reconnu : " + await page.textContent("#recevoir-type"));
    assert(!(await page.evaluate(() => caches.has("orbite-recus"))), "cache des documents reçus vidé");
    assert(!/recevoir/.test(await page.evaluate(() => location.hash)), "adresse nettoyée");
    await page.screenshot({ path: path.join(CAPTURES, "recevoir-tableau.png") });
    await page.click("#recevoir-action");
    await page.waitForFunction(() => location.hash === "#credit");
    await page.waitForFunction(() => /échéances? lues?/.test((document.querySelector("#cr-o-audit .cr-outil__sortie") || {}).textContent || ""), null, { timeout: 90000 });
    assert(await page.evaluate(() => document.getElementById("cr-outil-audit").open), "outil « Contrôler le tableau » ouvert");
    /* Photo : Orbite demande ce que c'est. */
    const photo = Array.from(fs.readFileSync(path.join(__dirname, "fixtures", "fiche-paie.jpg")));
    await page.evaluate(async (o) => {
      const c = await caches.open("orbite-recus");
      await c.put("/__orbite/recu/0", new Response(new Blob([new Uint8Array(o)], { type: "image/jpeg" }), { headers: { "Content-Type": "image/jpeg", "X-Orbite-Nom": "IMG_2041.jpg" } }));
      await c.put("/__orbite/recu/liste", new Response(JSON.stringify({ n: 1, t: Date.now() })));
    }, photo);
    await page.goto(base + "/espace/#recevoir");
    await page.waitForSelector("#dlg-recevoir[open]", { timeout: 20000 }).catch(async () => {
      const d = await page.evaluate(async () => [location.href, await caches.has("orbite-recus"), Array.from(document.querySelectorAll(".toast")).map((t) => t.textContent), Array.from(document.querySelectorAll("dialog[open]")).map((x) => x.id), !!window.OrbiteRecevoir, window.Orbite && window.Orbite.pret]);
      throw new Error("fenêtre du document reçu absente : " + JSON.stringify(d));
    });
    await page.waitForSelector("#recevoir-choix:not([hidden])");
    assert(await page.isHidden("#recevoir-resultat"), "photo : pas de supposition");
    assert((await page.$$('#recevoir-choix [data-recevoir]:not([hidden])')).length === 3, "photo : les trois choix");
    /* (Sans lancer la lecture de la photo : l'étape « fiche de paie » vérifie plus loin le chargement de l'outil.) */
    await page.click("#dlg-recevoir .bouton--fermer");
    /* Fiche de paie en PDF : reconnue, ouverte dans le contrôle de la fiche. */
    const fiche = Array.from(fs.readFileSync(path.join(__dirname, "fixtures", "fiche-paie.pdf")));
    await page.evaluate(async (o) => {
      const c = await caches.open("orbite-recus");
      await c.put("/__orbite/recu/0", new Response(new Blob([new Uint8Array(o)], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "X-Orbite-Nom": "scan-octobre.pdf" } }));
      await c.put("/__orbite/recu/liste", new Response(JSON.stringify({ n: 1, t: Date.now() })));
    }, fiche);
    await page.goto(base + "/espace/#recevoir");
    await page.waitForSelector("#recevoir-resultat:not([hidden])", { timeout: 60000 });
    assert(/fiche de paie/.test(await page.textContent("#recevoir-type")), "fiche reconnue : " + await page.textContent("#recevoir-type"));
    await page.click("#recevoir-action");
    await page.waitForSelector('#dlg-fiche[open][data-ecran="verifier"]', { timeout: 60000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("dlg-fiche").open);
  });

  await etape("crédit : voyage dans le temps, échéancier en PDF et en Excel, lettre en Word", async () => {
    await page.goto(base + "/espace/#credit?type=auto&capital=30000&mois=60&taux=10.5&partie=echeancier");
    await page.waitForSelector("#cr-temps-curseur", { state: "visible" });
    await page.waitForFunction(() => document.getElementById("cr-temps-curseur").max === "60");
    await page.fill("#cr-temps-curseur", "30");
    await page.waitForFunction(() => /Échéance 30 sur 60/.test(document.getElementById("cr-temps-date").textContent));
    const st = await page.textContent("#cr-temps-stats");
    assert(/Capital remboursé/.test(st) && /30 échéances restantes/.test(st), "voyage dans le temps : " + st);
    /* La piste se remplit jusqu'au rond (elle restait bloquée à moitié). */
    const pisteJuste = () => page.evaluate(() => { const c = document.getElementById("cr-temps-curseur"); return [c.value, c.max, c.style.getPropertyValue("--p")]; });
    let pj = await pisteJuste();
    assert(pj[2] === "50.00%", "piste à 30 sur 60 : " + JSON.stringify(pj));
    /* Lecture continue : la piste suit le rond à chaque image, la fin (30 → 60) dure environ 2 s. */
    const t0 = Date.now();
    await page.click("#cr-temps-lire");
    const vus = [];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(300);
      pj = await pisteJuste();
      vus.push(pj);
      assert(Math.abs(parseFloat(pj[2]) - pj[0] / pj[1] * 100) < 0.01, "piste qui suit la lecture : " + JSON.stringify(pj));
    }
    assert(new Set(vus.map((v) => v[0])).size >= 3, "le rond avance pendant la lecture : " + JSON.stringify(vus));
    await page.waitForFunction(() => /Crédit soldé/.test(document.getElementById("cr-temps-stats").textContent), null, { timeout: 15000 });
    const duree = Date.now() - t0;
    pj = await pisteJuste();
    assert(pj[2] === "100.00%" && duree > 1200 && duree < 3600, "fin de lecture : " + JSON.stringify(pj) + " en " + duree + " ms");
    assert(!(await page.$(".cr-temps--lecture")) && (await page.getAttribute("#cr-temps-lire", "aria-pressed")) === "false", "lecture arrêtée à la fin");
    for (const [id, ext] of [["#cr-pdf", "pdf"], ["#cr-xlsx", "xlsx"]]) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(id)]);
      assert(dl.suggestedFilename() === "echeancier-credit-30000dt-60mois." + ext, "nom : " + dl.suggestedFilename());
      const octets = fs.readFileSync(await dl.path());
      assert(ext === "pdf" ? octets.slice(0, 5).toString() === "%PDF-" : octets.slice(0, 2).toString() === "PK", "fichier " + ext + " valide");
    }
    await page.goto(base + "/espace/#credit?type=immo&capital=150000&mois=240&taux=8&partie=outils");
    await page.waitForSelector("#cr-outil-quand", { state: "visible" });
    await page.click("#cr-outil-quand > summary");
    await page.click("#cr-o-quand details[data-lettre] > summary");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-lettre-docx]")]);
    assert(dl.suggestedFilename() === "lettre-banque.docx" && fs.readFileSync(await dl.path()).slice(0, 2).toString() === "PK", "lettre Word");
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

  await etape("autres lignes de la fiche de paie : retenues déduites de l'impôt, versement, retenue sur le net, impôt aligné, module Salaire, téléphone", async () => {
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#lf-bloc .lf__groupe", { state: "visible" });
    const avant = await page.evaluate(() => { const p = window.Orbite.profil(); return { montant: p.montant, sens: p.sens, periode: p.periode, chefDeFamille: p.chefDeFamille, nombreSalaires: p.nombreSalaires, secteur: p.secteur, enfants: p.enfants }; });
    /* Profil fictif de la maquette : 3 200 DT brut, chef de famille, 12 salaires. */
    await page.evaluate(() => window.Orbite.majProfil({ montant: 3200, sens: "brut", periode: "mensuel", chefDeFamille: true, enfants: 0, nombreSalaires: 12, secteur: "prive" }, { immediat: true }));
    const ajouter = async (g, lib, mt) => {
      await page.click('[data-lf-ajouter="' + g + '"]');
      const l = page.locator('.lf__ligne[data-g="' + g + '"]').last();
      await l.locator(".lf__lib").fill(lib);
      await l.locator(".lf__montant").fill(mt);
    };
    await ajouter("sociales", "Retraite complémentaire", "38,4");
    await ajouter("sociales", "Assurance groupe", "72");
    await ajouter("gains", "Bonification crédit logement", "60");
    await ajouter("nettes", "Assurance auto", "136");
    await page.waitForFunction(() => /110,400/.test(document.querySelector('[data-total="sociales"]').textContent));
    const sansAligne = await page.evaluate(() => window.OrbiteCalcul.salaire(window.Orbite.profil()).netMensuel);
    await page.waitForFunction(() => window.Orbite.profil().lignesFiche.nettes.length === 1);
    assert(Math.abs(await page.evaluate(() => window.OrbiteCalcul.salaire(window.Orbite.profil()).netMensuel) - (3200 - 309.76 - 110.4 - 549.931 - 12.941 + 60 - 136)) < 0.002, "net avec les lignes, impôt d'Orbite : " + sansAligne);
    /* Impôt aligné sur la fiche : IRPP et CSS de la fiche, écart affiché, net exact. */
    await page.check("#lf-aligne", { force: true });
    await page.waitForSelector("#lf-impot:not([hidden])");
    await page.fill("#lf-irpp", "531,250"); await page.fill("#lf-css", "12,941");
    await page.waitForFunction(() => /2\s?159,649/.test(document.getElementById("lf-resume").textContent.replace(/[\u00a0\u202f]/g, " ")), null, { timeout: 8000 });
    assert(/549,931/.test(await page.textContent("#lf-ecart")) && /18,680/.test(await page.textContent("#lf-ecart")), "écart avec le calcul d'Orbite : " + await page.textContent("#lf-ecart"));
    /* Conservé après rechargement. */
    await page.waitForTimeout(1200);
    await page.reload();
    await page.waitForSelector('#lf-bloc .lf__ligne[data-g="nettes"]', { state: "visible" });
    assert((await page.inputValue('.lf__ligne[data-g="gains"] .lf__lib')) === "Bonification crédit logement", "libellé conservé");
    assert(await page.isChecked("#lf-aligne"), "impôt aligné conservé");
    /* Module Salaire : même net, détail ligne par ligne, encart « Comme sur votre fiche ». */
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#tableau-detail", { state: "attached" });
    await page.evaluate(() => window.ModuleSalaire.depuisProfil(window.Orbite.profil()));
    await page.waitForSelector("#fiche-salaire:not([hidden])");
    const det = (await page.textContent("#tableau-detail")).replace(/[\u00a0\u202f]/g, " ");
    assert(/Retraite complémentaire/.test(det) && /Assurance auto/.test(det) && /Écart avec l'impôt retenu sur votre fiche/.test(det) && /2 159,649/.test(det), "détail du module Salaire");
    await page.waitForFunction(() => /2\s?159,649/.test(document.getElementById("montant-lu").textContent.replace(/[\u00a0\u202f]/g, " ")), null, { timeout: 5000 });
    /* Comparaison d'offres : à barèmes égaux, sans les lignes de l'employeur actuel. */
    const offre = await page.evaluate(() => window.OrbiteCalcul.salaire(window.OrbiteCalcul.normaliser(Object.assign({}, window.Orbite.profil(), { lignesFiche: {}, impotFiche: {} }))).netMensuel);
    assert(offre > 2159.649, "sans les lignes, le net est plus élevé");
    /* Lignes datées : nouveau montant à partir du mois en cours, puis changement à venir annulé, puis retrait. */
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector('#lf-bloc .lf__ligne[data-g="nettes"]', { state: "visible" });
    const netAvant = await page.evaluate(() => window.OrbiteCalcul.salaire(window.Orbite.profil()).netMensuel);
    const auto = page.locator('.lf__ligne[data-g="nettes"]').first().locator(".lf__montant");
    await auto.fill("140"); await auto.press("Tab");
    await page.waitForSelector(".lf-dt #lf-dt-mois");
    assert(/136,000 → 140,000/.test((await page.textContent(".lf-dt__q")).replace(/[\u00a0\u202f]/g, " ")), "question « à partir de quel mois ? »");
    await page.click('[data-lf-dt="appliquer"]');
    await page.waitForSelector(".lf__info .lf-puce");
    assert(/avant 136,000/.test((await page.textContent(".lf__groupe--nettes .lf__info")).replace(/[\u00a0\u202f]/g, " ")), "étiquette « depuis … · avant 136,000 DT »");
    assert(/Lignes terminées \(1\)/.test(await page.textContent(".lf__groupe--nettes")), "ancienne ligne terminée");
    await page.waitForFunction((n) => Math.abs(window.OrbiteCalcul.salaire(window.Orbite.profil()).netMensuel - (n - 4)) < 0.001, netAvant);
    const moisPasses = await page.evaluate(() => { const p = window.Orbite.profil(), m = new Date(); return m.getMonth() > 0 ? window.OrbiteCalcul.lignesAuMois(p, m.getFullYear(), m.getMonth() - 1).nettes[0].montant : 136; });
    assert(moisPasses === 136, "le mois d'avant garde 136 DT : " + moisPasses);
    /* Changement à venir (janvier prochain) : étiquette « passe à … », puis annulé. */
    const auto2 = page.locator('.lf__ligne[data-g="nettes"]').first().locator(".lf__montant");
    await auto2.fill("150"); await auto2.press("Tab");
    await page.waitForSelector(".lf-dt #lf-dt-mois");
    await page.selectOption("#lf-dt-mois", "0");
    await page.selectOption("#lf-dt-an", String(new Date().getFullYear() + 1));
    await page.click('[data-lf-dt="appliquer"]');
    await page.waitForSelector("[data-lf-annuler-futur]");
    assert(/passe à 150,000/.test((await page.textContent(".lf__groupe--nettes")).replace(/[\u00a0\u202f]/g, " ")), "changement à venir affiché");
    await page.locator(".lf__groupe--nettes").screenshot({ path: path.join(CAPTURES, "lignes-datees.png") });
    assert(Math.abs(await page.evaluate(() => window.OrbiteCalcul.salaire(window.Orbite.profil()).netMensuel) - (netAvant - 4)) < 0.001, "le net du mois ne change pas encore");
    await page.click("[data-lf-annuler-futur]");
    await page.waitForFunction(() => !document.querySelector("[data-lf-annuler-futur]"));
    /* Retrait d'une ligne enregistrée : à partir de quel mois ; « erreur » la supprime. */
    await page.locator('.lf__ligne[data-g="gains"] .lf__retirer').first().click();
    await page.waitForSelector(".lf-dt #lf-dt-mois");
    await page.click('[data-lf-dt="annuler"]');
    await page.waitForFunction(() => !document.querySelector(".lf-dt"));
    assert(await page.$('.lf__ligne[data-g="gains"]'), "annuler garde la ligne");

    /* Téléphone : bloc sans débordement. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#lf-bloc .lf__ligne", { state: "visible" });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "profil sans débordement sur téléphone");
    await page.locator("#lf-bloc").screenshot({ path: path.join(CAPTURES, "lignes-fiche-telephone.png") });
    await page.setViewportSize({ width: 1360, height: 900 });
    /* Retour au profil d'avant (les étapes suivantes n'ont pas de lignes de fiche). */
    await page.evaluate((a) => window.Orbite.majProfil(Object.assign({ lignesFiche: {}, impotFiche: {} }, a), { immediat: true }), avant);
    await page.waitForTimeout(800);
  });

  await etape("historique du salaire : hausse datée, hausse prévue, retrait annulé, depuis le module Salaire", async () => {
    await page.goto(base + "/espace/#profil?partie=salaire");
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

  await etape("Et si… : modèles, refus de la banque, enregistrement, application annulable, rappel programmé", async () => {
    await page.goto(base + "/espace/#vie?onglet=scenarios");
    await page.waitForSelector("#vie-panneau-scenarios:not([hidden])");
    assert((await page.evaluate(() => window.Orbite.profil().scenarios.length)) === 0, "aucun scénario au départ");
    assert(await page.isHidden("#etsi-resultats"), "pas de frise sans scénario");
    await page.click('[data-modele="epargne"]');
    await page.waitForFunction(() => window.Orbite.profil().scenarios.length === 1);
    await page.waitForSelector("#etsi-resultats:not([hidden])");
    assert((await page.textContent("#etsi-verdict")).includes("Sur 10 ans"), "bilan affiché");
    assert((await page.$$("#etsi-graphe svg .etsi-ligne")).length === 2, "deux lignes : aujourd'hui et A");
    /* Un gros crédit : refus probable de la banque, zone rouge sur la marge. */
    await page.click("#etsi-cartes .etsi-carte:nth-child(2) .etsi-ajouter");
    await page.waitForSelector("#etsi-editeur:not([hidden])");
    await page.click('#etsi-ed-types [data-type="credit"]');
    await page.fill("#etsi-capital", "600000");
    await page.fill("#etsi-annee", String(new Date().getFullYear() - 1));
    await page.click("#etsi-ed-ok");
    assert(await page.isVisible("#etsi-ed-erreur"), "année passée refusée");
    await page.fill("#etsi-annee", String(new Date().getFullYear() + 1));
    await page.click("#etsi-ed-ok");
    await page.waitForFunction(() => window.Orbite.profil().scenarios[0].changements.length === 2);
    await page.waitForSelector(".etsi-carte__alerte");
    assert((await page.textContent(".etsi-carte__alerte")).includes("Refus probable"), "refus de la banque signalé");
    await page.click('#etsi-indic [data-indic="marge"]');
    await page.waitForSelector("#etsi-graphe .etsi-refus");
    /* Deuxième scénario : un enfant l'an prochain → rappel programmé à l'application. */
    await page.click('[data-modele="famille"]');
    await page.waitForFunction(() => window.Orbite.profil().scenarios.length === 2);
    await page.fill("#etsi-nom-B", "Bébé");
    await page.locator("#etsi-nom-B").press("Tab");
    await page.waitForFunction(() => window.Orbite.profil().scenarios[1].nom === "Bébé");
    await page.waitForTimeout(1600);
    assert(faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite.scenarios.length === 2, "scénarios enregistrés dans le compte");
    const avant = await page.evaluate(() => { const p = window.Orbite.profil(); return { projets: p.projets.length, contrats: p.contrats.length, rappels: p.rappelsPerso.length, enfants: p.enfants }; });
    await page.selectOption("#etsi-appliquer-choix", "0");
    await page.click("#etsi-appliquer");
    await page.waitForFunction((n) => window.Orbite.profil().projets.length === n + 1, avant.projets);
    assert((await page.evaluate(() => window.Orbite.profil().contrats.length)) === avant.contrats + 1, "épargne : contrat à sa date");
    await page.click('.toast:has-text("appliqué") button:has-text("Annuler")');
    await page.waitForFunction((n) => window.Orbite.profil().projets.length === n, avant.projets);
    assert((await page.evaluate(() => window.Orbite.profil().contrats.length)) === avant.contrats, "annulé : contrats comme avant");
    await page.selectOption("#etsi-appliquer-choix", "1");
    await page.click("#etsi-appliquer");
    await page.waitForFunction((n) => window.Orbite.profil().rappelsPerso.length === n + 1, avant.rappels);
    assert((await page.evaluate(() => window.Orbite.profil().enfants)) === avant.enfants, "naissance future : rappel, pas d'enfant ajouté tout de suite");
    await page.click('.toast:has-text("appliqué") button:has-text("Annuler")');
    await page.waitForFunction((n) => window.Orbite.profil().rappelsPerso.length === n, avant.rappels);
    await page.screenshot({ path: path.join(CAPTURES, "et-si.png"), fullPage: true });
    /* Suppression annulable. */
    await page.click('#etsi-cartes .etsi-carte:nth-child(3) button[aria-label^="Supprimer"]');
    await page.waitForFunction(() => window.Orbite.profil().scenarios.length === 1);
    await page.click('.toast:has-text("supprimé") button:has-text("Annuler")');
    await page.waitForFunction(() => window.Orbite.profil().scenarios.length === 2);
  });

  await etape("mode Expert : réglage, paie mois par mois, Mon orbite mois par mois, CSV et classeur Excel", async () => {
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.waitForSelector("#choix-expert", { state: "visible" });
    assert(!(await page.evaluate(() => document.body.classList.contains("expert"))), "désactivé par défaut");
    assert(await page.isHidden("#exporter-xlsx"), "export Excel caché hors mode Expert");
    await page.click('#choix-expert label:has(input[value="oui"])');
    await page.waitForFunction(() => document.body.classList.contains("expert"));
    await page.goto(base + "/espace/#profil?partie=salaire");
    await page.waitForSelector("#p-paie", { state: "visible" });
    await page.click("#p-paie > summary");
    await page.waitForFunction(() => document.querySelectorAll("#p-paie-table tbody tr").length === 13);
    const [csv] = await Promise.all([page.waitForEvent("download"), page.click("#p-paie-csv")]);
    assert(/^orbite-paie-\d{4}\.csv$/.test(csv.suggestedFilename()), "nom du CSV : " + csv.suggestedFilename());
    const texte = fs.readFileSync(await csv.path(), "utf8");
    assert(texte.includes("Mois;Salaires;Brut (DT)"), "CSV en point-virgule");
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#orbite-expert", { state: "visible" });
    await page.waitForFunction(() => document.querySelectorAll("#orbite-table tbody tr").length === 121);
    const [xl] = await Promise.all([page.waitForEvent("download"), page.click("#orbite-xlsx")]);
    assert(/^orbite-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xl.suggestedFilename()), "nom du classeur : " + xl.suggestedFilename());
    const octets = fs.readFileSync(await xl.path());
    assert(octets[0] === 0x50 && octets[1] === 0x4b && octets.length > 5000, "classeur Excel (zip) : " + octets.length + " octets");
    assert(octets.toString("latin1").includes("Mon orbite"), "feuille « Mon orbite » présente");
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.click('#choix-expert label:has(input[value=""])');
    await page.waitForFunction(() => !document.body.classList.contains("expert"));
  });

  await etape("coordonnées facultatives : email prérempli, téléphone, erreurs, accord visible par l'admin seulement", async () => {
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#p-email", { state: "visible" });
    assert((await page.inputValue("#p-email")) === "aziz@exemple.tn", "email de connexion prérempli");
    await page.fill("#p-email", "aziz@");
    await page.locator("#p-email").blur();
    assert(await page.isVisible("#p-email-err"), "email incomplet signalé");
    await page.fill("#p-email", "Aziz.Pro@Exemple.tn");
    await page.locator("#p-email").blur();
    await page.waitForFunction(() => window.Orbite.profil().emailContact === "aziz.pro@exemple.tn");
    assert(await page.isHidden("#p-email-err"), "erreur effacée");
    await page.fill("#p-tel", "123");
    await page.locator("#p-tel").blur();
    assert(await page.isVisible("#p-tel-err"), "numéro invalide signalé");
    await page.fill("#p-tel", "22 123 456");
    await page.locator("#p-tel").blur();
    await page.waitForFunction(() => window.Orbite.profil().telephone === "+21622123456");
    assert((await page.inputValue("#p-tel")) === "+216 22 123 456", "numéro mis en forme");
    await page.click("#contact-profil label:has(#p-contact-ok)");
    await page.waitForFunction(() => window.Orbite.profil().contactOk === true && !!window.Orbite.profil().contactOkLe);
    await page.waitForTimeout(1600);
    const meta = faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite;
    assert(meta.telephone === "+21622123456" && meta.contactOk === true, "coordonnées enregistrées");
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.waitForFunction(() => /aziz\.pro@exemple\.tn/.test(document.getElementById("admin-contacts").textContent));
    assert((await page.textContent("#admin-contacts")).includes("+216 22 123 456"), "téléphone visible avec l'accord");
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#p-contact-ok", { state: "attached" });
    await page.click("#contact-profil label:has(#p-contact-ok)");
    await page.waitForFunction(() => window.Orbite.profil().contactOk === false && window.Orbite.profil().contactOkLe === "");
    await page.waitForTimeout(1600);
    await page.goto(base + "/espace/#admin");
    await page.waitForSelector("#admin-corps:not([hidden])");
    await page.waitForFunction(() => /Personne n'a encore demandé/.test(document.getElementById("admin-contacts").textContent));
  });

  await etape("rappels par email : plan sans montant, confirmation de l'adresse de contact, désinscription en un clic", async () => {
    await page.goto(base + "/espace/#profil");
    await page.waitForSelector("#p-rappels-email", { state: "attached" });
    if (await page.isChecked("#p-rappels-email")) await page.click("label:has(#p-rappels-email)");
    await page.click("label:has(#p-rappels-email)");
    await page.waitForFunction(() => window.Orbite.profil().rappelsEmail === true);
    for (let i = 0; i < 40 && !faux.confirmationsEnvoyees().length; i++) await page.waitForTimeout(250);
    const conf = faux.confirmationsEnvoyees();
    assert(conf.length === 1 && conf[0].adresse === "aziz.pro@exemple.tn", "confirmation demandée pour l'adresse de contact : " + JSON.stringify(conf));
    const ligne = faux.rappelsEmailDe("aziz@exemple.tn");
    assert(Array.isArray(ligne.plan), "plan enregistré");
    assert(!/\bDT\b/.test(JSON.stringify(ligne.plan)), "aucun montant dans le plan : " + JSON.stringify(ligne.plan).slice(0, 300));
    await page.waitForFunction(() => /Confirmez aziz\.pro@exemple\.tn/.test(document.getElementById("p-rappels-email-aide").textContent));
    await page.goto(base + "/rappels.html#c=" + conf[0].jeton);
    await page.waitForFunction(() => /Adresse confirmée/.test(document.getElementById("rp-titre").textContent));
    assert(!(await page.evaluate(() => location.hash)), "jeton retiré de l'adresse");
    assert((await page.textContent("#rp-texte")).includes("aziz.pro@exemple.tn"), "adresse confirmée affichée");
    await page.goto(base + "/espace/#profil");
    await page.waitForFunction(() => /Activé : vos rappels partent à aziz\.pro@exemple\.tn/.test(document.getElementById("p-rappels-email-aide").textContent));
    const jeton = faux.rappelsEmailDe("aziz@exemple.tn").jeton;
    await page.goto(base + "/rappels.html#d=" + jeton);
    await page.waitForFunction(() => /C'est noté/.test(document.getElementById("rp-titre").textContent));
    const meta = () => faux.comptes.get("aziz@exemple.tn").user.user_metadata.orbite.rappelsEmail;
    assert(meta() === false && faux.rappelsEmailDe("aziz@exemple.tn").desinscrit_le, "désinscrit, case du profil décochée");
    await page.click("#rp-action");
    await page.waitForFunction(() => /Emails réactivés/.test(document.getElementById("rp-titre").textContent));
    assert(meta() === true && !faux.rappelsEmailDe("aziz@exemple.tn").desinscrit_le, "réactivé");
    await page.click("#rp-action");
    await page.waitForFunction(() => /C'est noté/.test(document.getElementById("rp-titre").textContent));
    await page.goto("about:blank");
    await page.goto(base + "/rappels.html#d=00000000-0000-4000-8000-000000000000");
    await page.waitForFunction(() => /Lien expiré/.test(document.getElementById("rp-titre").textContent));
    await page.goto("about:blank");
    await page.goto(base + "/rappels.html");
    await page.waitForFunction(() => /Lien incomplet/.test(document.getElementById("rp-titre").textContent));
    await page.goto(base + "/espace/#profil");
    await page.waitForFunction(() => window.Orbite.profil() && window.Orbite.profil().rappelsEmail === false, null, { timeout: 8000 });
    assert(!(await page.isChecked("#p-rappels-email")), "case décochée après la désinscription par email");
  });

  await etape("statut retraité : profil, « Ma pension », loi de finances 2026, retour au statut salarié", async () => {
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#sec-salaire", { state: "visible" });
    const avant = await page.evaluate(() => { const p = window.Orbite.profil(); return { montant: p.montant, sens: p.sens, periode: p.periode, historiqueSalaire: p.historiqueSalaire }; });
    assert(await page.isHidden(".seul-retraite >> nth=0"), "champs retraité cachés pour un salarié");
    await page.click('#sec-salaire label:has(input[value="retraite"])');
    await page.waitForFunction(() => window.Orbite.profil().activite === "retraite");
    assert(await page.isHidden("#p-embauche"), "date d'embauche cachée");
    assert(await page.isVisible("label[for=\"p-caisse\"]"), "caisse de retraite affichée");
    assert((await page.textContent("#sec-salaire-titre")) === "Votre retraite et votre pension", "titre de la section");
    await page.evaluate(() => window.Orbite.majProfil({ montant: 2000, sens: "brut", periode: "mensuel", historiqueSalaire: [] }, { immediat: true }));
    await page.waitForFunction(() => /Pension nette/.test(document.getElementById("p-resume-salaire").textContent));
    assert((await page.textContent("#p-resume-salaire")).includes("abattement de 25"), "abattement affiché");
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#pension-vue:not([hidden])");
    assert((await page.textContent("#titre-salaire")) === "Ma pension", "module renommé");
    assert((await page.textContent("#barre-titre")) === "Ma pension", "barre du haut");
    assert(await page.isHidden("#barre-actions"), "actions du simulateur de salaire cachées");
    const attendu = await page.evaluate(() => { const p = window.Orbite.profil(); return window.CalculPension.calculerDepuisBrut({ brutMensuel: 2000, chefDeFamille: p.chefDeFamille, enfants: p.enfants, etudiants: p.etudiants, handicapes: p.handicapes, parents: p.parents, annee: new Date().getFullYear() }).mensuel.net; });
    await page.waitForFunction((v) => document.getElementById("pv-net").textContent.replace(/[^\d,]/g, "").replace(",", ".") === v.toFixed(3), attendu);
    assert((await page.$$("#pv-barres .pension-barre")).length >= 2, "hausse du net 2026-2029 affichée");
    /* Bascule net : même pension, montant converti. */
    await page.click('#pension-vue label:has(input[value="net"])');
    await page.waitForFunction((v) => Math.abs(Number(document.getElementById("pv-montant").value.replace(/[^\d,]/g, "").replace(",", ".")) - v) < 0.002, attendu);
    assert(await page.isHidden("#pv-profil"), "même pension : pas de mise à jour proposée");
    await page.screenshot({ path: path.join(CAPTURES, "ma-pension.png"), fullPage: true });
    await page.goto(base + "/espace/#orbite");
    await page.waitForFunction(() => document.getElementById("noyau-lib").textContent === "Pension nette par mois");
    /* Retour au statut salarié et au salaire d'avant. */
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.click('#sec-salaire label:has(input[value="salarie"])');
    await page.waitForFunction(() => window.Orbite.profil().activite === "salarie");
    await page.evaluate((a) => window.Orbite.majProfil(a, { immediat: true }), avant);
    assert(await page.isVisible("#p-embauche"), "date d'embauche de retour");
  });

  await etape("optimiseur fiscal : détail de l'impôt restant et assurance vie déduite ou non par l'employeur", async () => {
    await page.evaluate(() => window.Orbite.majProfil({ contrats: [{ type: "av", versementMensuel: 100, moisDebut: 1, anneeDebut: 2020 }] }, { immediat: true }));
    await page.goto(base + "/espace/#vie?onglet=fiscal");
    await page.waitForSelector("#vie-panneau-fiscal:not([hidden])");
    const visible = await page.isVisible("#fi-paie");
    if (visible) {
      await page.click("#fi-paie-detail > summary");
      await page.waitForFunction(() => document.querySelectorAll("#fi-paie-calcul li").length >= 3);
      assert(await page.isVisible("#fi-paie-employeur"), "question employeur affichée (contrat en cours)");
      const avant = await page.evaluate(() => window.OrbiteIntelligence.optimiseurFiscal(window.Orbite.synthese()).paie.impotRestant);
      await page.click('#fi-paie-employeur label:has(input[value="non"])');
      await page.waitForFunction(() => window.Orbite.profil().avPaie === false);
      const apres = await page.evaluate(() => window.OrbiteIntelligence.optimiseurFiscal(window.Orbite.synthese()).paie.impotRestant);
      assert(apres > avant, "impôt restant plus élevé sans déduction de l'employeur : " + avant + " → " + apres);
      await page.click('#fi-paie-employeur label:has(input[value="oui"])');
      await page.waitForFunction(() => window.Orbite.profil().avPaie === true);
    }
  });

  await etape("optimiseur fiscal : mon plan de versement (abordable, pourcentage assurance vie / CEA, calendrier, rappels)", async () => {
    const avant = await page.evaluate(() => { const p = window.Orbite.profil(); return { epargneDisponible: p.epargneDisponible, planVersement: p.planVersement, rappelsPerso: p.rappelsPerso }; });
    await page.evaluate(() => window.Orbite.majProfil({ epargneDisponible: 30000, planVersement: { partMarge: 0.5, partPrimes: 0.5, reserve: null, partAv: null } }, { immediat: true }));
    await page.goto(base + "/espace/#vie?onglet=fiscal");
    await page.waitForSelector("#vie-panneau-fiscal:not([hidden])");
    const statut = await page.evaluate(() => window.OrbiteIntelligence.optimiseurFiscal(window.Orbite.synthese()).statut);
    if (statut !== "a_optimiser") { assert(await page.isHidden("#fi-plan"), "plan masqué sans impôt à réduire"); await page.evaluate((a) => window.Orbite.majProfil(a, { immediat: true }), avant); return; }
    await page.waitForSelector("#fi-plan:not([hidden]) #fi-plan-cal li");
    const plan = () => page.evaluate(() => { const r = window.OrbiteIntelligence.planVersement(window.Orbite.synthese()); return { D: r.versement, av: r.av, cea: r.cea, abordable: r.abordable, perte: r.perte, n: r.calendrier.length, util: r.epargne.utilisable }; });
    const dt = (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(v)).replace(/\s/g, " ");
    const nb = (t) => t.replace(/\s/g, " ");
    let r = await plan();
    assert(nb(await page.textContent("#fi-plan-abordable")) === dt(r.abordable) + " DT", "abordable affiché = moteur : " + await page.textContent("#fi-plan-abordable"));
    assert(nb(await page.textContent("#fi-plan-total")) === dt(r.D) + " DT", "versement du plan");
    assert(r.cea === 0 && await page.getAttribute('#fi-plan-puces [data-part="conseil"]', "aria-checked") === "true", "conseillé : tout en assurance vie à économie égale");
    assert((await page.$$("#fi-plan-cal li")).length === r.n, "calendrier complet");
    await page.click('#fi-plan-puces [data-part="50"]');
    await page.waitForFunction(() => window.Orbite.profil().planVersement.partAv === 0.5);
    r = await plan();
    assert(Math.abs(r.av - r.cea) <= 1 && nb(await page.textContent("#fi-plan-av-mt")) === dt(r.av) + " DT", "50 / 50 : " + r.av + " / " + r.cea);
    await (await page.$("#fi-plan")).screenshot({ path: path.join(CAPTURES, "plan-versement.png") });
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "téléphone : pas de défilement horizontal");
    await (await page.$("#fi-plan")).screenshot({ path: path.join(CAPTURES, "plan-versement-telephone.png") });
    await page.setViewportSize(vp);
    await page.$eval("#fi-plan-av", (c) => { c.value = "0"; c.dispatchEvent(new Event("input", { bubbles: true })); c.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForFunction(() => window.Orbite.profil().planVersement.partAv === 0);
    r = await plan();
    assert(r.av === 0 && (await page.isVisible("#fi-plan-alerte")) === (r.perte > 1), "100 % CEA : alerte de perte si le plancher du CEA est dépassé (" + Math.round(r.perte) + " DT)");
    assert(await page.getAttribute('#fi-plan-puces [data-part="perso"]', "aria-checked") === "true", "curseur hors préréglage : Personnalisé");
    await page.click('#fi-plan-puces [data-part="conseil"]');
    await page.waitForFunction(() => window.Orbite.profil().planVersement.partAv === null);
    await page.fill("#fi-plan-reserve", "40000");
    await page.press("#fi-plan-reserve", "Tab");
    await page.waitForFunction(() => window.Orbite.profil().planVersement.reserve === 40000);
    assert((await plan()).util === 0 && nb(await page.textContent("#fi-plan-ep-mt")) === "0 DT", "réserve au-dessus de l'épargne : rien n'y est pris");
    await page.fill("#fi-plan-reserve", "");
    await page.press("#fi-plan-reserve", "Tab");
    await page.waitForFunction(() => window.Orbite.profil().planVersement.reserve === null);
    await page.click("#fi-plan-rappel");
    await page.waitForFunction(() => window.Orbite.profil().rappelsPerso.some((x) => /^plan\d{6}$/.test(x.id)));
    const rp = await page.evaluate(() => window.Orbite.profil().rappelsPerso.filter((x) => /^plan/.test(x.id)));
    assert(rp.every((x) => x.url === "/espace/#vie?onglet=fiscal" && /verser/.test(x.titre)), "rappels du plan : " + JSON.stringify(rp[0]));
    assert(/#epargne\?av=\d+&cea=\d+$/.test(await page.getAttribute("#fi-plan-simuler", "href")), "lien de simulation");
    await page.evaluate((a) => window.Orbite.majProfil(a, { immediat: true }), avant);
  });

  await etape("Ma réserve de sécurité : objectif en mois, montant libre, mis de côté, rappels, graphique, tuile de Mon orbite", async () => {
    const avant = await page.evaluate(() => { const p = window.Orbite.profil(); return { epargneDisponible: p.epargneDisponible, reserve: p.reserve, rappelsPerso: p.rappelsPerso }; });
    await page.evaluate(() => window.Orbite.majProfil({ epargneDisponible: 1000, reserve: { mois: 3, montant: null, partMarge: 0.5, partPrimes: 0.5 } }, { immediat: true }));
    await page.goto(base + "/espace/#progression?onglet=objectifs&reserve=1");
    await page.waitForSelector("#pg-reserve:not([hidden]) #rs-ordre li");
    const nb = (t) => t.replace(/\s/g, " ");
    const dt = (v) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(v)).replace(/\s/g, " ") + " DT";
    const moteur = () => page.evaluate(() => { const r = window.OrbiteIntelligence.reserve(window.Orbite.synthese()); return { cible: r.cible, actuel: r.actuel, n: r.points.length, mois: r.reglages.mois }; });
    let r = await moteur();
    assert(nb(await page.textContent("#rs-actuel")) === dt(1000), "épargne affichée : " + await page.textContent("#rs-actuel"));
    assert(nb(await page.textContent("#rs-sur")).includes(dt(r.cible)), "objectif affiché = moteur (" + r.cible + ")");
    assert(r.cible === await page.evaluate(() => window.OrbiteCalcul.cibleReserve(window.Orbite.synthese())), "une seule cible");
    assert(await page.getAttribute('#rs-puces [data-mois="3"]', "aria-checked") === "true", "3 mois par défaut");
    if (r.n > 1) await page.waitForSelector("#rs-graphe svg");
    await page.click('#rs-puces [data-mois="6"]');
    await page.waitForFunction(() => window.Orbite.profil().reserve.mois === 6);
    const r6 = await moteur();
    assert(r6.cible > r.cible && nb(await page.textContent("#rs-sur")).includes(dt(r6.cible)), "6 mois : objectif plus haut");
    await page.click('#rs-puces [data-mois="0"]');
    await page.waitForSelector("#rs-libre-bloc:not([hidden])");
    await page.fill("#rs-libre", "4000");
    await page.press("#rs-libre", "Tab");
    await page.waitForFunction(() => window.Orbite.profil().reserve.mois === 0 && window.Orbite.profil().reserve.montant === 4000);
    assert((await moteur()).cible === 4000, "montant libre");
    await page.click('#rs-puces [data-mois="3"]');
    await page.waitForFunction(() => window.Orbite.profil().reserve.mois === 3);
    await page.fill("#rs-ajout-mt", "500");
    await page.click("#rs-ajout button[type=submit]");
    await page.waitForFunction(() => window.Orbite.profil().epargneDisponible === 1500);
    assert(nb(await page.textContent("#rs-actuel")) === dt(1500), "mis de côté ajouté");
    await page.click("#rs-rappel");
    await page.waitForFunction(() => window.Orbite.profil().rappelsPerso.some((x) => /^reserve\d{6}$/.test(x.id)));
    await (await page.$("#pg-reserve")).screenshot({ path: path.join(CAPTURES, "reserve.png") });
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "téléphone : pas de défilement horizontal");
    await page.setViewportSize(vp);
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#reserve-tuile:not([hidden])");
    assert(/Réserve/.test(await page.textContent("#reserve-tuile")) && /reserve=1/.test(await page.getAttribute("#reserve-tuile", "href")), "tuile de Mon orbite");
    await page.evaluate((a) => window.Orbite.majProfil(a, { immediat: true }), avant);
    /* Ma progression revient sur son premier onglet pour l'étape suivante. */
    await page.goto(base + "/espace/#progression?onglet=carriere");
    await page.waitForSelector("#pg-carriere:not([hidden])");
  });

  await etape("Ma progression : pouvoir d'achat, courbe, projection, objectifs, « J'ai épargné » annulable, défis, rappel", async () => {
    await page.evaluate(() => window.Orbite.majProfil({ dateEmbauche: "2019-03-01", montant: 3400, sens: "brut", periode: "mensuel", epargneDisponible: 5000, historiqueSalaire: [
      { montant: 2400, sens: "brut", periode: "mensuel", mois: 0, annee: 0 }, { montant: 2650, sens: "brut", periode: "mensuel", mois: 3, annee: 2021 },
      { montant: 3000, sens: "brut", periode: "mensuel", mois: 3, annee: 2023 }, { montant: 3400, sens: "brut", periode: "mensuel", mois: 3, annee: 2025 }] }, { immediat: true }));
    await page.goto(base + "/espace/#progression");
    await page.waitForSelector("#pg-carriere:not([hidden]) #pg-graphe svg");
    assert((await page.textContent("#barre-titre")) === "Ma progression", "titre de la barre");
    const t = await page.evaluate(() => [1, 2, 3].map((i) => document.getElementById("pg-t" + i).textContent));
    assert(/^\+41,7/.test(t[0]) && /^\+57,2/.test(t[1]) && /^−9,9/.test(t[2]), "bilan brut / prix / pouvoir d'achat : " + t.join(" | "));
    assert(/3\s?773 DT/.test(await page.textContent("#pg-phrase")), "brut nécessaire pour garder le pouvoir d'achat");
    assert((await page.$$("#pg-etapes li")).length === 4, "4 étapes");
    assert((await page.$$("#pg-graphe .og-marqueur")).length === 3, "3 hausses sur la courbe");
    assert(/moyenne depuis 2019/.test(await page.textContent("#pg-hausse-aide")), "hausse par défaut = moyenne passée");
    const brut1 = await page.textContent("#pg-r-brut");
    await page.$eval("#pg-hausse", (el) => { el.value = "8"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert((await page.textContent("#pg-r-brut")) !== brut1 && (await page.textContent("#pg-hausse-v")).replace(/\s/g, " ") === "8 %", "projection recalculée");
    await page.screenshot({ path: path.join(CAPTURES, "progression-carriere.png"), fullPage: true });
    /* Objectifs : création d'un projet daté. */
    await page.click("#pg-tab-objectifs");
    await page.waitForSelector("#pg-objectifs:not([hidden]) .pg-ajout");
    assert(/Créez votre premier objectif/.test(await page.textContent("#pg-defis")), "défi « premier objectif »");
    await page.click('.pg-ajout__types button[data-type="projet"]');
    await page.waitForSelector("#dlg-objectif[open]");
    await page.fill("#obj-libelle", "Apport logement");
    await page.fill("#obj-cible", "20 000");
    await page.fill("#obj-depart", "8 000");
    const an = new Date().getFullYear() + 2;
    await page.selectOption("#obj-mois", "6");
    await page.fill("#obj-annee", String(an));
    await page.waitForFunction(() => /par mois/.test(document.getElementById("obj-apercu").textContent));
    await page.click("#obj-valider");
    for (let i = 0; i < 40 && !faux.objectifs().length; i++) await page.waitForTimeout(100);
    const o = faux.objectifs()[0];
    assert(o && o.type === "projet" && Number(o.cible) === 20000 && o.echeance === an + "-06-30", "objectif enregistré : " + JSON.stringify(o));
    await page.waitForSelector('.pg-obj[data-type="projet"] .pg-verser');
    assert(/Apport logement/.test(await page.textContent('.pg-obj[data-type="projet"] h3')), "carte affichée");
    /* « J'ai épargné » : versement + épargne disponible, puis annulation. */
    await page.fill('.pg-obj[data-type="projet"] .pg-verser input', "150");
    await page.click('.pg-obj[data-type="projet"] .pg-verser button');
    await page.waitForFunction(() => window.Orbite.profil().epargneDisponible === 5150);
    assert(faux.versementsObjectifs().length === 1 && Number(faux.versementsObjectifs()[0].montant) === 150, "versement enregistré");
    await page.waitForFunction(() => /8\s?150/.test(document.querySelector('.pg-obj[data-type="projet"] .pg-montants').textContent));
    await page.click('.toast:has-text("de plus mis de côté") button:has-text("Annuler")');
    await page.waitForFunction(() => window.Orbite.profil().epargneDisponible === 5000);
    for (let i = 0; i < 20 && faux.versementsObjectifs().length; i++) await page.waitForTimeout(100);
    assert(!faux.versementsObjectifs().length, "versement annulé");
    await page.fill('.pg-obj[data-type="projet"] .pg-verser input', "600");
    await page.click('.pg-obj[data-type="projet"] .pg-verser button');
    await page.waitForFunction(() => window.Orbite.profil().epargneDisponible === 5600);
    await page.waitForFunction(() => /Série : 1 mois/.test(document.getElementById("pg-serie").textContent));
    assert(await page.isVisible(".pg-badge--gagne"), "badge « Premier objectif » gagné");
    /* Épargne de précaution avec la cible suggérée. */
    await page.click('.pg-ajout__types button[data-type="precaution"]');
    await page.waitForSelector("#obj-suggestion:not([hidden])");
    await page.click("#obj-suggestion");
    assert((await page.inputValue("#obj-cible")).length > 0, "cible suggérée remplie");
    await page.click("#obj-valider");
    await page.waitForSelector('.pg-obj[data-type="precaution"]');
    assert(faux.objectifs().length === 2, "2 objectifs");
    /* Rappel d'échéance (type perso, sans montant dans l'email). */
    const rap = await page.evaluate(() => window.Progression.rappels(window.OrbiteProgression.objectifs(), new Date()));
    assert(rap.length === 1 && rap[0].type === "perso" && !/DT|Apport/.test(JSON.stringify(rap[0].mail)), "rappel d'échéance : " + JSON.stringify(rap));
    /* Modification, puis suppression annulée. */
    await page.click('.pg-obj[data-type="precaution"] .pg-obj__modifier');
    await page.waitForSelector("#dlg-objectif[open] #obj-supprimer:not([hidden])");
    await page.fill("#obj-libelle", "Coussin de sécurité");
    await page.click("#obj-valider");
    await page.waitForFunction(() => /Coussin de sécurité/.test(document.querySelector('.pg-obj[data-type="precaution"] h3').textContent));
    await page.click('.pg-obj[data-type="precaution"] .pg-obj__modifier');
    await page.click("#obj-supprimer");
    await page.waitForFunction(() => !document.querySelector('.pg-obj[data-type="precaution"]'));
    await page.click('.toast:has-text("Objectif supprimé") button:has-text("Annuler")');
    await page.waitForSelector('.pg-obj[data-type="precaution"]');
    assert(faux.objectifs().some((x) => x.libelle === "Coussin de sécurité"), "objectif rétabli");
    await page.screenshot({ path: path.join(CAPTURES, "progression-objectifs.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert(!deborde, "pas de défilement horizontal sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "progression-objectifs-telephone.png"), fullPage: true });
    await page.click("#pg-tab-carriere");
    await page.waitForSelector("#pg-carriere:not([hidden]) #pg-graphe svg");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "carrière sans débordement sur téléphone");
    assert(await page.evaluate(() => { const v = document.querySelector("#pg-graphe svg.og-svg").getAttribute("viewBox").split(" "); return +v[2] < 520 && +v[3] === 250; }), "courbe adaptée au téléphone");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "progression-carriere-telephone.png"), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 900 });
    const themeAvant = await page.getAttribute("html", "data-theme");
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.click("#pg-tab-objectifs");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "progression-objectifs-sombre.png") });
    await page.click("#pg-tab-carriere");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(CAPTURES, "progression-carriere-sombre.png") });
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), themeAvant);
  });

  await etape("Mon année en orbite : bouton de Ma progression, cartes calculées, navigation au clavier, image sans montant", async () => {
    await page.goto(base + "/espace/#progression");
    await page.waitForSelector("#btn-annee:not([hidden])");
    assert(/^Mon année \d{4}( jusqu'ici)?$/.test((await page.textContent("#btn-annee-lib")).trim()), "libellé du bouton");
    await page.click("#btn-annee");
    await page.waitForSelector("#dlg-annee[open]");
    const n = await page.$$eval("#annee-cartes .annee-carte", (c) => c.length);
    assert(n >= 5 && n <= 8, "cartes : " + n);
    const attendu = await page.evaluate(() => Annee.bilan(Orbite.profil(), { objectifs: OrbiteProgression.objectifs(), versements: OrbiteProgression.versements() }, new Date()));
    assert(attendu.cartes.length === n, "autant de cartes que le bilan");
    await page.click("#annee-suiv");
    const net = await page.textContent("#annee-cartes .annee-carte:not([hidden]) .annee-gros");
    assert(chiffre(net) === Math.round(attendu.cartes[1].salaire.net), "net de l'année = moteur : " + net);
    for (let k = 1; k < n; k++) await page.keyboard.press("ArrowRight");
    await page.waitForSelector("#annee-ouvrir-partage");
    const faits = await page.$$eval(".annee-faits--synthese li", (l) => l.map((x) => x.textContent));
    assert(faits.length >= 1 && faits.every((t) => !/DT|\d{3}/.test(t)), "faits sans montant : " + faits.join(" | "));
    await page.click("#annee-ouvrir-partage");
    await page.waitForSelector("#annee-partage:not([hidden])");
    await page.waitForFunction(() => /^blob:/.test(document.getElementById("annee-image").src) && document.getElementById("annee-image").naturalWidth === 1080);
    await page.screenshot({ path: path.join(CAPTURES, "annee-partage.png") });
    await page.click("#annee-partage-fermer");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-annee", { state: "hidden" });
  });

  await etape("retraite : CNSS (plafond, départ anticipé), objectif « Retraite » créé puis mis à jour, CNRPS, téléphone", async () => {
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#sec-salaire", { state: "visible" });
    await page.waitForSelector("#p-debut", { state: "visible", timeout: 8000 });
    assert(await page.isVisible("#p-sans-cot"), "champs début de carrière et années sans cotisation");
    await page.evaluate(() => window.Orbite.majProfil({ dateNaissance: "1984-03-10", debutCarriere: "2008-09-01", anneesSansCotisation: 0, secteur: "prive", activite: "salarie",
      montant: 5500, sens: "brut", periode: "mensuel", nombreSalaires: 12, historiqueSalaire: [] }, { immediat: true }));
    await page.goto(base + "/espace/#progression?onglet=retraite");
    await page.waitForSelector("#pg-retraite:not([hidden]) #pr-frise svg");
    const att = await page.evaluate(() => { const e = window.Retraite.estimer(window.Orbite.profil(), window.Orbite.synthese(), { age: 60 }); return { net: e.net, trim: e.trimestres, ecart: e.ecart, capital: e.capital }; });
    assert(att.trim === 142, "142 trimestres : " + att.trim);
    assert(chiffre(await page.textContent("#pr-net")) === Math.round(att.net), "pension nette affichée = moteur");
    assert((await page.textContent("#pr-age-v")) === "60 ans", "âge légal CNSS par défaut");
    assert(/142/.test(await page.textContent("#pr-calcul")), "trimestres dans le calcul");
    assert(await page.isVisible("#pr-plafond") && /6 SMIG/.test(await page.textContent("#pr-plafond")), "alerte plafond 6 SMIG");
    assert(await page.isVisible("#pr-objectif"), "écart à combler : bouton d'objectif");
    await page.$eval("#pr-age", (el) => { el.value = "55"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    assert(/−10 points pour départ anticipé/.test(await page.textContent("#pr-sous")), "réduction anticipée affichée");
    await page.$eval("#pr-age", (el) => { el.value = "60"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    const avant = faux.objectifs().length;
    await page.click("#pr-objectif");
    for (let i = 0; i < 40 && faux.objectifs().length === avant; i++) await page.waitForTimeout(100);
    const o = faux.objectifs().find((x) => x.libelle === "Retraite");
    assert(o && Number(o.cible) === Math.round(att.capital / 100) * 100 && o.echeance === "2044-03-31", "objectif Retraite : " + JSON.stringify(o));
    await page.waitForFunction(() => /Mettre à jour l'objectif/.test(document.getElementById("pr-objectif").textContent));
    await page.$eval("#pr-age", (el) => { el.value = "62"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.click("#pr-objectif");
    for (let i = 0; i < 40 && !faux.objectifs().some((x) => x.libelle === "Retraite" && x.echeance === "2046-03-31"); i++) await page.waitForTimeout(100);
    assert(faux.objectifs().filter((x) => x.libelle === "Retraite").length === 1 && faux.objectifs().some((x) => x.echeance === "2046-03-31"), "objectif mis à jour, pas dupliqué");
    await page.screenshot({ path: path.join(CAPTURES, "retraite-cnss.png"), fullPage: true });
    /* Secteur public : CNRPS, 62 à 65 ans, pas de plafond. */
    await page.evaluate(() => window.Orbite.majProfil({ secteur: "public" }, { immediat: true }));
    await page.waitForFunction(() => /CNRPS/.test(document.getElementById("pr-info").textContent));
    assert((await page.getAttribute("#pr-age", "min")) === "62" && (await page.getAttribute("#pr-age", "max")) === "65", "bornes CNRPS");
    assert(await page.isHidden("#pr-plafond"), "pas de plafond 6 SMIG à la CNRPS");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "retraite sans débordement sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "retraite-telephone.png"), fullPage: true });
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.evaluate(() => window.Orbite.majProfil({ secteur: "prive" }, { immediat: true }));
    /* Retraité : l'onglet renvoie vers « Ma pension ». */
    await page.evaluate(() => window.Orbite.majProfil({ activite: "retraite" }, { immediat: true }));
    await page.waitForSelector("#pr-vide:not([hidden])");
    assert(/Ma pension/.test(await page.textContent("#pr-vide")), "retraité : renvoi vers Ma pension");
    await page.evaluate(() => window.Orbite.majProfil({ activite: "salarie" }, { immediat: true }));
  });

  await etape("fiche de paie : PDF lu sur l'appareil, valeurs vérifiées, écart d'IRPP, profil mis à jour puis annulé ; photo et saisie manuelle", async () => {
    await page.evaluate(() => window.Orbite.majProfil({ chefDeFamille: false, enfants: 0, etudiants: 0, handicapes: 0, parents: 0, secteur: "public", activite: "salarie", dateEmbauche: "",
      primesImposables: 0, primesNonCotisables: 0, avantagesNature: 0, indemnitesNonImposables: 0, montant: 2500, sens: "brut", periode: "mensuel", nombreSalaires: 12, historiqueSalaire: [] }, { immediat: true }));
    const lus = [];
    page.on("request", (r) => { if (/\/commun\/vendor\/(tesseract|pdfjs)-/.test(r.url())) lus.push(new URL(r.url()).pathname); });
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#fiche-remplir", { state: "visible" });
    await page.click("#fiche-remplir");
    await page.waitForSelector('#dlg-fiche[open][data-ecran="depot"]');
    assert(await page.isHidden("#fiche-photo-lib"), "pas de bouton « Prendre une photo » sur ordinateur");
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(CAPTURES, "fiche-depot.png") });
    const envoyes = [];
    const surveiller = (r) => { if (r.method() !== "GET" && !/supabase\.co/.test(r.url())) envoyes.push(r.url()); };
    page.on("request", surveiller);
    await page.setInputFiles("#fiche-fichier", path.join(__dirname, "fixtures", "fiche-paie.pdf"));
    await page.waitForSelector('#dlg-fiche[data-ecran="verifier"]', { timeout: 20000 });
    const v = (cle) => page.inputValue("#fiche-v-" + cle);
    assert(chiffre(await v("brut")) === 3000 && chiffre(await v("primes")) === 300, "brut et primes lus");
    assert(chiffre(await v("cotisations")) === 290.4 && chiffre(await v("irpp")) === 555 && chiffre(await v("css")) === 12.715 && chiffre(await v("net")) === 2141.885, "retenues et net lus");
    assert((await v("mois")) === "2026-10" && (await v("caisse")) === "prive" && (await v("dateEmbauche")) === "01/09/2014", "mois, caisse et date d'embauche lus");
    assert(/Salaire de base : 2.700,000 DT/.test(await page.textContent("#fiche-base")), "salaire de base déduit");
    assert((await page.$$eval("#fiche-champs .fiche-etat--lu", (e) => e.length)) >= 9, "valeurs marquées « lu »");
    assert(/« Salaire brut   3 000,000 »/.test(await page.textContent('[data-cle="brut"] small')), "texte d'origine montré");
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(CAPTURES, "fiche-verifier.png") });
    await page.click("#fiche-controler");
    await page.waitForSelector('#dlg-fiche[data-ecran="controle"]');
    assert((await page.textContent("#fiche-verdict-t")) === "Un écart sur l'impôt", "verdict : écart sur l'impôt");
    assert((await page.textContent("#fiche-verdict-d")) === "Votre fiche retient 19,999 DT d'IRPP de plus que le calcul d'Orbite.", "écart chiffré comme la maquette");
    const lignes = await page.$$eval("#fiche-table-corps tr", (t) => t.map((r) => Array.from(r.cells).map((c) => c.textContent)));
    assert(lignes.length === 4 && lignes[1][3] === "+19,999" && lignes[0][3] === "✓" && /−19,999/.test(lignes[3][3]), "tableau : " + JSON.stringify(lignes));
    assert(/personne seule, sans enfant à charge/.test(await page.textContent("#fiche-hypotheses")), "hypothèses du calcul affichées");
    assert(await page.isVisible("#fiche-table-corps .fiche-ecart") && (await page.$eval("#fiche-table-corps .fiche-ecart", (e) => getComputedStyle(e).opacity)) === "1", "écart visible");
    await page.click("#fiche-corriger");
    await page.waitForSelector('#dlg-fiche[data-ecran="verifier"]');
    assert(chiffre(await v("irpp")) === 555, "« Corriger les valeurs » garde les valeurs");
    await page.click("#fiche-controler");
    await page.waitForSelector('#dlg-fiche[data-ecran="controle"]');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(CAPTURES, "fiche-controle.png") });
    assert(envoyes.length === 0, "rien n'est envoyé pendant la lecture : " + envoyes.join(", "));
    page.off("request", surveiller);
    /* Avant → après, visible avant de valider ; décocher le salaire retire aussi les primes. */
    const diff = await page.$$eval("#fiche-maj-corps tr", (t) => t.map((r) => [r.querySelector(".maj-diff__lib").textContent, (r.querySelector(".maj-diff__avant") || {}).textContent || "", r.querySelector(".maj-diff__apres").textContent]));
    assert(JSON.stringify(diff) === JSON.stringify([["Salaire de base brut", "2 500,000 DT brut", "2 700,000 DT depuis octobre 2026"], ["Primes et avantages", "aucune", "300,000 DT par mois"], ["Caisse", "CNRPS (public)", "CNSS (privé)"], ["Date d'embauche", "non renseignée", "01/09/2014"], ["Impôt aligné sur la fiche", "calcul d'Orbite", "IRPP 555,000 + CSS 12,715"]]), "avant → après : " + JSON.stringify(diff));
    await page.uncheck("#fiche-maj-salaire");
    assert(await page.isDisabled("#fiche-maj-primes") && !(await page.isChecked("#fiche-maj-primes")), "sans le salaire, pas de primes");
    await page.uncheck("#fiche-maj-caisse");
    await page.uncheck("#fiche-maj-dateEmbauche");
    await page.uncheck("#fiche-maj-impot");
    assert(await page.isDisabled("#fiche-maj") && (await page.textContent("#fiche-maj")) === "Rien de coché à reprendre", "tout décoché : rien à reprendre");
    for (const id of ["salaire", "primes", "caisse", "dateEmbauche", "impot"]) await page.check("#fiche-maj-" + id);
    assert(!(await page.isDisabled("#fiche-maj")), "tout recoché : mise à jour possible");
    await page.click("#fiche-maj");
    await page.waitForSelector("#dlg-fiche", { state: "hidden" });
    let p = await page.evaluate(() => window.Orbite.profil());
    assert(p.montant === 2700 && p.primesImposables === 300 && p.secteur === "prive" && p.dateEmbauche === "2014-09-01", "profil mis à jour : " + JSON.stringify([p.montant, p.primesImposables, p.secteur, p.dateEmbauche]));
    assert(p.historiqueSalaire.some((h) => h.montant === 2700 && h.mois === 10 && h.annee === 2026), "historique au mois de la fiche");
    assert(p.impotFiche.actif && p.impotFiche.irpp === 555 && p.impotFiche.brut === 3000, "impôt aligné : " + JSON.stringify(p.impotFiche));
    await page.click(".toast button:has-text('Annuler')");
    await page.waitForFunction(() => window.Orbite.profil().montant === 2500 && window.Orbite.profil().secteur === "public" && !window.Orbite.profil().impotFiche.actif);
    /* Fiche avec d'autres lignes (13 oct. 2026) : chaque ligne lue et rangée, prêt à cocher, net identique à la fiche. */
    await page.goto(base + "/espace/#profil?section=salaire");
    await page.waitForSelector("#fiche-remplir", { state: "visible" });
    const lfAvant = await page.evaluate(() => JSON.stringify({ l: window.Orbite.profil().lignesFiche, c: window.Orbite.profil().credits, i: window.Orbite.profil().impotFiche }));
    await page.click("#fiche-remplir");
    await page.waitForSelector('#dlg-fiche[open][data-ecran="depot"]');
    await page.setInputFiles("#fiche-fichier", path.join(__dirname, "fixtures", "fiche-paie-lignes.pdf"));
    await page.waitForSelector('#dlg-fiche[data-ecran="verifier"] .fiche-autre', { timeout: 20000 });
    const autresLues = await page.$$eval("#fiche-champs .fiche-autre", (rs) => rs.map((r) => [r.querySelector("label").textContent, r.querySelector("select").value, r.querySelector("input[type=checkbox]").checked]));
    assert(JSON.stringify(autresLues) === JSON.stringify([["CAVIS", "sociales", true], ["Assurance groupe", "sociales", true], ["Bonification crédit logement", "gains", true], ["Cotisation syndicale", "nettes", true], ["Assurance auto", "nettes", true], ["Prêt exceptionnel", "credit", false]]), "autres lignes : " + JSON.stringify(autresLues));
    assert(await page.isChecked("#fiche-c-impot"), "impôt aligné proposé");
    assert(!(await page.$('[data-cle="autresRetenues"]')), "plus de total « autres retenues » à part");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "fiche-autres-lignes.png") });
    await page.check('[data-autre="5"]');
    await page.click("#fiche-controler");
    await page.waitForSelector('#dlg-fiche[data-ecran="controle"]');
    const diff2 = await page.$$eval("#fiche-maj-corps tr", (t) => t.map((r) => r.querySelector(".maj-diff__lib").textContent));
    assert(["Autres lignes de la fiche", "Crédits", "Impôt aligné sur la fiche"].every((x) => diff2.includes(x)), "aperçu : " + JSON.stringify(diff2));
    assert(/^✓ Net d'Orbite avec ces réglages : 2 029,037 DT · net de la fiche avant le prêt : 2 029,037 DT$/.test((await page.textContent("#fiche-maj-net")).replace(/[\u00a0\u202f]/g, " ")), "net identique : " + await page.textContent("#fiche-maj-net"));
    await page.click("#fiche-maj");
    await page.waitForSelector("#dlg-fiche", { state: "hidden" });
    p = await page.evaluate(() => window.Orbite.profil());
    assert(p.lignesFiche.sociales.length === 2 && p.lignesFiche.gains[0].montant === 60 && p.lignesFiche.nettes.length === 2, "lignes reprises : " + JSON.stringify(p.lignesFiche));
    assert(p.credits.some((c) => c.libelle === "Prêt exceptionnel" && c.mensualite === 350) && p.impotFiche.irpp === 520, "prêt et impôt repris");
    await page.waitForSelector("#lf-bloc .lf__ligne", { state: "visible" });
    await page.click(".toast button:has-text('Annuler')");
    await page.waitForFunction((a) => JSON.stringify({ l: window.Orbite.profil().lignesFiche, c: window.Orbite.profil().credits, i: window.Orbite.profil().impotFiche }) === a, lfAvant);
    /* Photo depuis le module Salaire : mêmes valeurs, contrôle sans changer le profil. */
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#fiche-controle", { state: "visible" });
    await page.click("#fiche-controle");
    await page.waitForSelector('#dlg-fiche[open][data-ecran="depot"]');
    await page.setInputFiles("#fiche-fichier", path.join(__dirname, "fixtures", "fiche-paie.jpg"));
    await page.waitForSelector('#dlg-fiche[data-ecran="lecture"] .fiche-feuille.lit img');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(CAPTURES, "fiche-lecture.png") });
    await page.waitForSelector('#dlg-fiche[data-ecran="verifier"]', { timeout: 90000 });
    assert(chiffre(await v("brut")) === 3000 && chiffre(await v("net")) === 2141.885 && chiffre(await v("irpp")) === 555, "photo : mêmes valeurs que le PDF");
    assert(lus.some((u) => /tesseract-7\.0\.0\/core\/tesseract-core-.*lstm\.wasm\.js$/.test(u)) && lus.some((u) => /fra\.traineddata\.gz$/.test(u)), "outil de lecture servi par Orbite : " + lus.join(", "));
    await page.click("#fiche-controler");
    await page.waitForSelector('#dlg-fiche[data-ecran="controle"]');
    await page.click("#fiche-fermer-sans");
    await page.waitForSelector("#dlg-fiche", { state: "hidden" });
    assert((await page.evaluate(() => window.Orbite.profil().montant)) === 2500, "« Fermer sans rien changer » : profil intact");
    /* Saisie à la main, fiche conforme : cohérente ; téléphone sans débordement. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click("#fiche-controle");
    await page.click("#fiche-main");
    await page.waitForSelector('#dlg-fiche[data-ecran="verifier"]');
    const att = await page.evaluate(() => { const s = OrbiteCalcul.salaire(OrbiteCalcul.normaliser(Object.assign({}, Orbite.profil(), { montant: 2500, historiqueSalaire: [] }))).resultat.annuel; return { cot: s.cotisations / 12, irpp: s.irpp / 12, css: s.css / 12, net: s.netAPayer / 12 }; });
    const f3 = (x) => x.toFixed(3).replace(".", ",");
    await page.fill("#fiche-v-brut", "2 500");
    await page.fill("#fiche-v-cotisations", f3(att.cot));
    await page.fill("#fiche-v-irpp", f3(att.irpp));
    await page.fill("#fiche-v-css", f3(att.css));
    await page.fill("#fiche-v-net", f3(att.net));
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "vérification sans débordement sur téléphone");
    assert(await page.evaluate(() => { const d = document.getElementById("dlg-fiche"); return d.scrollWidth <= d.clientWidth + 1; }), "fenêtre sans défilement horizontal");
    await page.screenshot({ path: path.join(CAPTURES, "fiche-telephone.png") });
    await page.click("#fiche-controler");
    await page.waitForSelector('#dlg-fiche[data-ecran="controle"]');
    assert(/cohérente/.test(await page.textContent("#fiche-verdict-t")), "saisie conforme : fiche cohérente");
    assert(await page.isDisabled("#fiche-maj") && (await page.textContent("#fiche-maj")) === "Profil déjà à jour", "rien à changer : bouton désactivé");
    assert((await page.$$eval("#fiche-maj-corps tr", (t) => t.every((r) => r.classList.contains("maj-diff__pareil")))), "rien à changer : lignes « inchangé »");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-fiche", { state: "hidden" });
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  await etape("crédit : tableau de la banque contrôlé, puis crédit en cours mis à jour (avant → après, annuler) ou ajouté", async () => {
    /* Tableau STB fabriqué : 30 000 DT sur 60 mois à 10,75 %, échéances le 5 du mois depuis mai 2024. */
    const r3 = (v) => Math.round(v * 1000) / 1000, f3 = (v) => v.toFixed(3).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, " ");
    let crd = 30000; const i = 10.75 / 1200, ech = r3(crd * i / (1 - Math.pow(1 + i, -60))), lignes = [];
    for (let k = 1; k <= 60; k++) { const int = r3(crd * i), am = k === 60 ? crd : r3(ech - int), d = new Date(2024, 3 + k, 5); lignes.push(k + "  05/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() + "  " + f3(crd) + "  " + f3(am) + "  " + f3(int) + "  " + f3(r3(am + int))); crd = r3(crd - am); }
    const txt = "STB · Tableau d'amortissement\n" + lignes.join("\n");
    const origine = [{ libelle: "Auto", type: "auto", mensualite: 640, moisRestants: 40, capitalRestant: 0, tauxPct: 10, jourPrelevement: 0 }];
    const creditsAvant = await page.evaluate(() => JSON.parse(JSON.stringify(window.Orbite.profil().credits || [])));
    await page.evaluate((c) => window.Orbite.majProfil({ credits: c }, { immediat: true }), origine);
    await page.goto(base + "/espace/#credit?partie=outils");
    await page.waitForSelector("#cr-outil-audit", { state: "visible" });
    await page.$eval("#cr-outil-audit", (d) => { d.open = true; d.scrollIntoView({ block: "start" }); });
    await page.waitForSelector("#cr-audit-txt", { state: "attached" });
    await page.$eval("#cr-o-audit .cr-coller", (d) => { d.open = true; });
    await page.fill("#cr-audit-txt", txt);
    await page.waitForSelector("#cr-o-audit [data-maj-zone]:not([hidden]) [data-maj-credit]", { timeout: 10000 });
    assert((await page.inputValue("#cr-maj-cible")) === "0", "crédit reconnu d'après la mensualité");
    const lire = () => page.$$eval("#cr-o-audit .maj-diff tbody tr", (t) => t.map((r) => [r.querySelector(".maj-diff__lib").textContent, r.querySelector(".maj-diff__apres").textContent, r.classList.contains("maj-diff__pareil")]));
    let d = await lire();
    const ligne = (lib) => d.find((x) => x[0] === lib) || [];
    assert(/^648,\d{3} DT$/.test(ligne("Mensualité")[1]) && /^10,75 %/.test(ligne("Taux")[1]) && ligne("Début et durée")[1] === "avril 2024 · 60 mois" && ligne("Jour du prélèvement")[1] === "le 5 du mois" && /^avril 2029 · \d+ échéances$/.test(ligne("Fin du crédit")[1]), "avant → après : " + JSON.stringify(d));
    await page.$eval("#cr-o-audit [data-maj-zone]", (z) => z.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "credit-maj-tableau.png") });
    /* Tout sauf le jour du prélèvement. */
    await page.uncheck("#cr-maj-jour");
    await page.click("#cr-o-audit [data-maj-credit]");
    await page.waitForFunction(() => { const c = window.Orbite.profil().credits[0]; return c && c.tauxPct === 10.75 && c.dureeMois === 60; });
    const c1 = await page.evaluate(() => window.Orbite.profil().credits[0]);
    assert(c1.libelle === "Auto" && Math.abs(c1.mensualite - 648.6) < 1 && c1.moisDebut === 4 && c1.anneeDebut === 2024 && c1.jourPrelevement === 0 && c1.capitalRestant > 0, "crédit mis à jour : " + JSON.stringify(c1));
    d = await lire();
    assert(d.filter((x) => !x[2]).map((x) => x[0]).join() === "Jour du prélèvement", "seul le jour reste à reprendre : " + JSON.stringify(d));
    /* Annuler : le crédit revient comme avant. */
    await page.click(".toast button:has-text('Annuler')");
    await page.waitForFunction(() => { const c = window.Orbite.profil().credits; return c.length === 1 && c[0].mensualite === 640 && c[0].tauxPct === 10; });
    /* Nouveau crédit. */
    await page.selectOption("#cr-maj-cible", "-1");
    await page.waitForSelector("#cr-maj-type");
    assert((await page.inputValue("#cr-maj-nom")) === "Crédit STB", "nom proposé d'après la banque");
    await page.selectOption("#cr-maj-type", "conso");
    await page.click("#cr-o-audit [data-maj-credit]");
    await page.waitForFunction(() => window.Orbite.profil().credits.length === 2);
    const c2 = await page.evaluate(() => window.Orbite.profil().credits[1]);
    assert(c2.libelle === "Crédit STB" && c2.type === "conso" && c2.jourPrelevement === 5 && c2.tauxPct === 10.75, "crédit ajouté : " + JSON.stringify(c2));
    await page.click(".toast button:has-text('Annuler')");
    await page.waitForFunction(() => window.Orbite.profil().credits.length === 1);
    /* Téléphone : l'encadré tient dans l'écran. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.$eval("#cr-o-audit [data-maj-zone]", (z) => z.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.waitForTimeout(500);
    const deb = await page.evaluate(() => { if (document.documentElement.scrollWidth <= innerWidth + 1) return null; const coupe = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return true; } return false; }; return [document.documentElement.scrollWidth, Array.from(document.getElementById("barre").children).filter((e) => e.offsetParent).map((e) => (e.id || e.className.split(" ")[0]) + ":" + Math.round(e.getBoundingClientRect().width)).join(" "), Array.from(document.getElementById("barre-actions").children).filter((e) => e.offsetParent).map((e) => e.id + ":" + Math.round(e.getBoundingClientRect().width)).join(" ")].concat(Array.from(document.querySelectorAll("body *")).filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !coupe(e)).slice(0, 6).map((e) => e.tagName + "#" + e.id + "." + String(e.className).split(" ")[0] + " " + Math.round(e.getBoundingClientRect().right))); });
    assert(!deb, "téléphone sans débordement : " + JSON.stringify(deb));
    await page.screenshot({ path: path.join(CAPTURES, "credit-maj-telephone.png") });
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.evaluate((c) => window.Orbite.majProfil({ credits: c }, { immediat: true }), creditsAvant);
  });

  await etape("crédit : alerte au-dessus de la capacité, retour à la capacité, montant qui suit la capacité selon le type", async () => {
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#cr-capital");
    await page.click('label:has(input[name="cr-type"][value="immo"])');
    await page.fill("#cr-capital", "900 000");
    await page.press("#cr-capital", "Tab");
    await page.waitForSelector("#cr-capacite-alerte:not([hidden]) [data-ramener]");
    assert(/au-dessus de votre capacité/.test(await page.textContent("#cr-capacite-alerte")), "alerte de dépassement");
    await page.click("#cr-capacite-alerte [data-ramener]");
    await page.waitForFunction(() => /suit votre capacité/.test(document.getElementById("cr-capital-aide-txt").textContent));
    assert(await page.isHidden("#cr-capacite-alerte"), "plus d'alerte après le retour à la capacité");
    const immo = Number((await page.inputValue("#cr-capital")).replace(/\D/g, ""));
    await page.click('label:has(input[name="cr-type"][value="auto"])');
    await page.waitForFunction((v) => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) !== v, immo);
    const auto = Number((await page.inputValue("#cr-capital")).replace(/\D/g, ""));
    assert(auto > 0 && auto < immo, "montant auto recalculé à la capacité (" + auto + " < " + immo + ")");
    assert(await page.isHidden("#cr-capacite-alerte"), "échéance auto dans la capacité");
    const lignes = await page.$$eval("#cr-capacites-liste .cr-capacites__ligne", (b) => b.map((x) => [x.getAttribute("data-capacite-type"), x.classList.contains("cr-capacites__ligne--actif"), x.querySelector("strong").textContent]));
    assert(lignes.length === 3 && lignes.find((l) => l[0] === "auto")[1], "capacité par type, auto en cours : " + JSON.stringify(lignes));
    assert(Number(lignes.find((l) => l[0] === "auto")[2].replace(/\D/g, "")) === auto, "même montant que la liste");
    await page.click('[data-capacite-type="immo"]');
    await page.waitForFunction(() => document.querySelector('input[name="cr-type"][value="immo"]').checked);
    await page.waitForFunction((v) => Number(document.getElementById("cr-capital").value.replace(/\D/g, "")) === v, immo);
    await page.screenshot({ path: path.join(CAPTURES, "credit-capacite.png") });
    /* Paramètres : carte de partage avec l'heure en français. */
    await page.goto(base + "/espace/#compte?onglet=donnees");
    await page.waitForSelector("#onglet-donnees:not([hidden]) #partage-etat:not([hidden])");
    await page.waitForTimeout(300);
    assert(!/\b(AM|PM)\b/.test(await page.textContent("#partage-etat")), "heure au format français");
    await page.screenshot({ path: path.join(CAPTURES, "parametres-donnees.png") });
  });

  await etape("dossier banque : capacité seule, crédit demandé en direct, montant exigé, PDF téléchargé, employeur enregistré, téléphone", async () => {
    await page.goto(base + "/espace/#credit");
    await page.click("#dossier-ouvrir");
    await page.waitForSelector("#dlg-dossier[open]");
    assert(await page.isHidden("#db-champs"), "sans crédit précis : pas de champs de crédit");
    assert((await page.textContent("#db-l1-lib")) === "Disponible par mois", "capacité seule");
    assert(/Montant maximum : immobilier .+ DT, auto .+ DT, consommation .+ DT\./.test(await page.textContent("#db-verdict")) || /plafond/.test(await page.textContent("#db-verdict")), "montant maximum par type : " + await page.textContent("#db-verdict"));
    await page.fill("#db-employeur", "Société Test SA");
    await page.fill("#db-poste", "Analyste");
    await page.click('#dlg-dossier label:has(input[name="db-type"][value="conso"])');
    await page.waitForSelector("#db-champs:not([hidden])");
    assert(/^\d+(,\d+)?$/.test(await page.inputValue("#db-taux")) && (await page.inputValue("#db-duree")) === "84", "taux et durée proposés");
    await page.fill("#db-montant", "5 000");
    await page.waitForFunction(() => document.getElementById("db-l1-lib").textContent === "Mensualité");
    assert(/→/.test(await page.textContent("#db-l2")), "endettement avant → après");
    assert(["ok", "ko"].includes(await page.getAttribute("#db-effet", "data-etat")), "verdict de la règle de la banque");
    await page.click('#dlg-dossier label:has(input[name="db-type"][value="immo"])');
    await page.click("#db-valider");
    await page.waitForSelector("#db-montant-err:not([hidden])");
    assert(await page.isVisible("#dlg-dossier[open]"), "montant exigé avant le PDF");
    await page.click('#dlg-dossier label:has(input[name="db-type"][value="conso"])');
    assert((await page.inputValue("#db-montant")) === "5 000", "montant gardé pour le type");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(CAPTURES, "dossier-banque.png") });
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.click("#db-valider")]);
    assert(/^dossier-banque-DB-\d{8}-[0-9A-Z]{4}\.pdf$/.test(pdf.suggestedFilename()), "nom du PDF : " + pdf.suggestedFilename());
    const octets = fs.readFileSync(await pdf.path());
    assert(octets.toString("latin1", 0, 5) === "%PDF-" && octets.length > 3000, "PDF valide : " + octets.length + " octets");
    await page.waitForSelector("#dlg-dossier", { state: "hidden" });
    await page.waitForFunction(() => window.Orbite.profil().employeur === "Société Test SA" && window.Orbite.profil().poste === "Analyste");
    await page.goto(base + "/espace/#profil?partie=salaire");
    await page.waitForSelector("#p-employeur");
    assert((await page.inputValue("#p-employeur")) === "Société Test SA", "employeur visible dans le profil");
    /* Lien direct et téléphone : fenêtre sans débordement horizontal. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#credit?dossier=1");
    await page.waitForSelector("#dlg-dossier[open]");
    await page.waitForTimeout(300);
    assert(await page.$eval("#dlg-dossier", (d) => d.scrollWidth <= d.clientWidth + 1), "fenêtre sans défilement horizontal sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "dossier-banque-mobile.png") });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-dossier", { state: "hidden" });
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  await etape("négociateur : cible exacte, unités, marge, plancher, réussites gardées, phrase, 2 PDF, « J'ai obtenu… », offre reçue, entrées, téléphone", async () => {
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#nego-ouvrir:not([hidden])");
    await page.click("#nego-ouvrir");
    await page.waitForSelector("#dlg-nego[open]");
    /* +10 % net par défaut : le brut affiché est celui du moteur. */
    const attendu = await page.evaluate(() => window.Negociateur.preparer(window.Orbite.profil(), { mode: "pct", valeur: 10 }, { marge: 0.05, reussites: [] }, new Date()));
    assert((await page.textContent("#ng-cible")).replace(/\s/g, "") === String(Math.round(attendu.cible.brut)), "cible : " + await page.textContent("#ng-cible") + " ≠ " + attendu.cible.brut);
    assert((await page.textContent("#ng-ancre")).replace(/\s/g, "") === Math.round(attendu.ancre.brut) + "DT" && attendu.ancre.brut % 50 === 0, "ancre arrondie aux 50 DT");
    assert(/^Sur 100 DT de hausse brute, vous gardez \d+ DT net$/.test(await page.textContent("#ng-garde-lib")), "part gardée");
    /* 20 % : même cible exprimée en net puis en brut. */
    await page.fill("#ng-objectif", "20");
    await page.waitForFunction(() => /Net visé/.test(document.getElementById("ng-objectif-aide").textContent));
    const cible20 = (await page.textContent("#ng-cible")).replace(/\s/g, "");
    await page.click('#dlg-nego label:has(input[name="ng-vise"][value="net"])');
    assert((await page.textContent("#ng-unite")) === "DT net / mois", "unité net");
    await page.click('#dlg-nego label:has(input[name="ng-vise"][value="brut"])');
    assert(Math.abs(Number((await page.inputValue("#ng-objectif")).replace(/\s/g, "")) - Number(cible20)) <= 25, "brut converti : " + await page.inputValue("#ng-objectif"));
    await page.click('#dlg-nego label:has(input[name="ng-vise"][value="pct"])');
    await page.fill("#ng-objectif", "20");
    /* Objectif refusé : message, verdict grisé, téléchargement bloqué. */
    await page.fill("#ng-objectif", "0");
    await page.waitForSelector("#ng-erreur:not([hidden])");
    assert(await page.isDisabled("#ng-telecharger"), "PDF bloqué tant que l'objectif est faux");
    await page.fill("#ng-objectif", "20");
    await page.waitForSelector("#ng-erreur", { state: "hidden" });
    /* Petite hausse : alerte sous le plancher si les prix ont monté. */
    await page.fill("#ng-objectif", "1");
    const prix = await page.evaluate(() => window.Negociateur.preparer(window.Orbite.profil(), { mode: "pct", valeur: 1 }, {}, new Date()).cibleSousPlancher);
    assert((await page.isVisible("#ng-sous-plancher")) === prix, "alerte du plancher cohérente");
    await page.fill("#ng-objectif", "20");
    /* Marge 0 : ancre = cible. */
    await page.fill("#ng-marge", "0");
    await page.waitForFunction(() => /Sans marge/.test(document.getElementById("ng-ancre-d").textContent));
    await page.fill("#ng-marge", "5");
    /* Réussites : argument et phrase ; gardées sur l'appareil. */
    await page.fill("#ng-reussites", "Migration de la paie livrée en avance\nFormation de 3 collègues");
    await page.waitForFunction(() => /Parmi mes réalisations : migration de la paie livrée en avance\./.test(document.getElementById("ng-phrase").textContent));
    assert(/Vos réussites : Migration de la paie livrée en avance ; Formation de 3 collègues\./.test(await page.textContent("#ng-arguments")), "réussites dans les arguments");
    assert((await page.evaluate(() => localStorage.getItem("orbite_nego_reussites"))).indexOf("Formation") > 0, "réussites gardées sur l'appareil");
    assert(/Je souhaite que mon salaire de base soit porté à [\d\s]+\sDT brut par mois\.\s»$/.test(await page.textContent("#ng-phrase")), "phrase prête");
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(CAPTURES, "negociateur.png") });
    /* Deux PDF : aide-mémoire et demande. */
    const [pdf1] = await Promise.all([page.waitForEvent("download"), page.click("#ng-telecharger")]);
    assert(/^ma-negociation-\d{8}\.pdf$/.test(pdf1.suggestedFilename()), "nom : " + pdf1.suggestedFilename());
    const o1 = fs.readFileSync(await pdf1.path());
    assert(o1.toString("latin1", 0, 5) === "%PDF-" && o1.length > 3000, "PDF pour moi");
    await page.click('#dlg-nego label:has(input[name="ng-version"][value="responsable"])');
    assert(/Ni plancher/.test(await page.textContent("#ng-version-aide")), "aide de la version responsable");
    const [pdf2] = await Promise.all([page.waitForEvent("download"), page.click("#ng-telecharger")]);
    assert(/^demande-de-revision-de-salaire-\d{8}\.pdf$/.test(pdf2.suggestedFilename()), "nom : " + pdf2.suggestedFilename());
    assert(await page.isVisible("#dlg-nego[open]"), "la fenêtre reste ouverte après un PDF");
    /* Offre reçue. */
    await page.click('#dlg-nego label:has(input[name="ng-mode"][value="offre"])');
    await page.waitForSelector("#ng-o-contre");
    assert(await page.isHidden("#ng-telecharger") && await page.isHidden("#ng-obtenu"), "pas de note ni de « J'ai obtenu… » pour une offre");
    await page.fill("#ng-offre-brut", "100 000");
    await page.waitForFunction(() => /L'offre atteint déjà/.test(document.getElementById("ng-o-sur").textContent));
    await page.fill("#ng-offre-salaires", "20");
    await page.waitForSelector("#ng-offre-erreur:not([hidden])");
    await page.fill("#ng-offre-salaires", "12");
    await page.fill("#ng-offre-brut", "1 000");
    await page.waitForFunction(() => /à contre-proposer/.test(document.getElementById("ng-o-contre-lib").textContent));
    assert(/^−/.test((await page.textContent("#ng-o-net-d")).trim()), "baisse signalée");
    await page.click('#dlg-nego label:has(input[name="ng-mode"][value="hausse"])');
    /* « J'ai obtenu… » : fenêtre du salaire préremplie, puis annulée. */
    await page.click("#ng-obtenu");
    await page.waitForSelector("#dlg-salaire[open]");
    assert((await page.inputValue("#sal-montant")) !== "", "salaire prérempli");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-salaire", { state: "hidden" });
    /* Entrées : Ma progression, palette, lien direct. */
    await page.goto(base + "/espace/#progression?onglet=carriere");
    await page.waitForSelector("#pg-nego:not([hidden])");
    await page.click("#pg-nego");
    await page.waitForSelector("#dlg-nego[open]");
    assert((await page.inputValue("#ng-reussites")).indexOf("Migration") === 0, "réussites retrouvées");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-nego", { state: "hidden" });
    await page.keyboard.press("Control+k");
    await page.fill("#palette-q", "zyeda");
    await page.waitForFunction(() => (document.querySelector('#palette-liste [aria-selected="true"]') || { getAttribute: () => "" }).getAttribute("data-id") === "a-nego");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dlg-nego[open]");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#salaire?nego=1&mode=offre");
    await page.waitForSelector("#dlg-nego[open]");
    assert(await page.isChecked('input[name="ng-mode"][value="offre"]'), "lien direct vers l'offre reçue");
    await page.click('#dlg-nego label:has(input[name="ng-mode"][value="hausse"])');
    await page.waitForTimeout(400);
    assert(await page.$eval("#dlg-nego", (d) => d.scrollWidth <= d.clientWidth + 1), "fenêtre sans défilement horizontal sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "negociateur-mobile.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  await etape("palette : Ctrl K, « / » hors champ, darija, clavier, récents, action, thème, phrase vers l'Assistant, raccourcis installés, téléphone", async () => {
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#palette-ouvrir");
    await page.keyboard.press("Control+k");
    await page.waitForSelector("#dlg-palette[open]");
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === "palette-q"), "le champ a le focus");
    await page.fill("#palette-q", "kridi");
    await page.waitForFunction(() => document.querySelector('#palette-liste [role="option"]'));
    assert((await page.getAttribute('#palette-liste [aria-selected="true"]', "data-id")) === "v-credit", "« kridi » trouve Crédit (darija, sans accent)");
    assert((await page.$$eval("#palette-liste mark", (m) => m.length)) === 0 && (await page.textContent('#palette-liste [aria-selected="true"] b')) === "Crédit", "titre sans surlignage quand le mot-clé est un synonyme");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dlg-palette", { state: "hidden" });
    await page.waitForFunction(() => location.hash === "#credit");
    /* « / » hors d'un champ ouvre ; dans un champ, non. */
    await page.waitForSelector("#dossier-ouvrir");
    await page.keyboard.press("/");
    await page.waitForSelector("#dlg-palette[open]");
    assert((await page.inputValue("#palette-q")) === "", "le « / » n'est pas écrit dans le champ");
    await page.fill("#palette-q", "doss");
    await page.waitForFunction(() => document.querySelector('#palette-liste [aria-selected="true"]') && document.querySelector('#palette-liste [aria-selected="true"]').getAttribute("data-id") === "a-dossier");
    assert((await page.textContent('#palette-liste [aria-selected="true"] mark')) === "doss", "morceau du mot surligné dans « Préparer mon dossier banque »");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#dlg-dossier[open]");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-dossier", { state: "hidden" });
    /* Loupe, flèches, section de Ma progression. */
    await page.click("#palette-ouvrir");
    await page.waitForSelector("#dlg-palette[open]");
    await page.fill("#palette-q", "retraite");
    await page.waitForFunction(() => document.querySelectorAll('#palette-liste [role="option"]').length >= 2);
    assert((await page.getAttribute('#palette-liste [aria-selected="true"]', "data-id")) === "s-retraite", "la section « Retraite » passe avant les vues qui la citent");
    await page.keyboard.press("ArrowDown");
    assert((await page.getAttribute('#palette-liste [aria-selected="true"]', "data-id")) !== "s-retraite", "flèche bas");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.hash === "#progression?onglet=retraite");
    /* Récents en tête d'une palette vide. */
    await page.keyboard.press("Control+k");
    await page.waitForSelector("#dlg-palette[open]");
    await page.waitForFunction(() => document.querySelector('#palette-liste [role="option"]'));
    assert((await page.textContent("#palette-liste .palette__groupe")) === "Récents", "groupe Récents");
    assert((await page.getAttribute('#palette-liste [role="option"]', "data-id")) === "s-retraite", "dernier choix en premier");
    assert((await page.textContent("#palette-liste")).indexOf("DT") === -1, "aucun montant dans la palette");
    /* Thème : l'action suit le thème courant. */
    const avant = await page.getAttribute("html", "data-theme");
    await page.fill("#palette-q", "thème");
    await page.waitForFunction(() => (document.querySelector('#palette-liste [aria-selected="true"]') || {}).getAttribute && document.querySelector('#palette-liste [aria-selected="true"]').getAttribute("data-id") === "a-theme");
    assert((await page.textContent('#palette-liste [aria-selected="true"] b')).indexOf(avant === "light" ? "sombre" : "clair") !== -1, "libellé selon le thème courant");
    await page.keyboard.press("Enter");
    await page.waitForFunction((a) => document.documentElement.getAttribute("data-theme") !== a, avant);
    await page.keyboard.press("Control+k");
    await page.fill("#palette-q", "thème");
    await page.keyboard.press("Enter");
    await page.waitForFunction((a) => document.documentElement.getAttribute("data-theme") === a, avant);
    /* Une phrase part à l'Assistant ; « / » dans sa zone de texte n'ouvre rien. */
    await page.keyboard.press("Control+k");
    await page.fill("#palette-q", "combien je paie d'impôt par an");
    await page.waitForFunction(() => { var o = document.querySelectorAll('#palette-liste [role="option"]'); return o.length && o[o.length - 1].getAttribute("data-id") === "q"; });
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowDown");
    assert((await page.getAttribute('#palette-liste [aria-selected="true"]', "data-id")) === "q", "dernière ligne : Demander à l'Assistant");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.hash === "#assistant");
    await page.waitForFunction(() => document.querySelectorAll("#assistant-fil li").length >= 1);
    await page.focus("#assistant-question");
    await page.keyboard.press("/");
    await page.waitForTimeout(150);
    assert(!(await page.isVisible("#dlg-palette")), "« / » dans un champ n'ouvre pas la palette");
    assert((await page.inputValue("#assistant-question")) === "/", "le « / » est bien tapé dans le champ");
    await page.fill("#assistant-question", "");
    /* Rien trouvé : seule la question à l'Assistant reste proposée, puis Échap. */
    await page.keyboard.press("Escape");
    await page.click("#palette-ouvrir");
    await page.fill("#palette-q", "zzqx");
    await page.waitForFunction(() => { var o = document.querySelectorAll('#palette-liste [role="option"]'); return o.length === 1 && o[0].getAttribute("data-id") === "q"; });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-palette", { state: "hidden" });
    /* Raccourcis de l'application installée : manifeste et icônes, lien direct du salaire. */
    const manifeste = await (await page.request.get(base + "/manifest.webmanifest")).json();
    assert(manifeste.shortcuts.length === 4 && manifeste.shortcuts[0].url === "/espace/#profil?section=salaire&salaire=1" && manifeste.shortcuts[1].url === "/espace/#credit?dossier=1", "4 raccourcis");
    for (const r of manifeste.shortcuts) assert((await page.request.get(base + r.icons[0].src)).status() === 200, "icône présente : " + r.icons[0].src);
    await page.goto(base + "/espace/#profil?section=salaire&salaire=1");
    await page.waitForSelector("#dlg-salaire[open]");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#dlg-salaire", { state: "hidden" });
    /* Téléphone : feuille basse, sans débordement. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#palette-ouvrir");
    assert(await page.$eval("#palette-ouvrir kbd", (k) => getComputedStyle(k).display === "none"), "« Ctrl K » caché sur téléphone");
    await page.click("#palette-ouvrir");
    await page.waitForSelector("#dlg-palette[open]");
    await page.fill("#palette-q", "sal");
    await page.waitForFunction(() => document.querySelector('#palette-liste [role="option"]'));
    await page.waitForTimeout(300);
    assert(await page.$eval("#dlg-palette", (d) => d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().bottom <= innerHeight), "palette dans l'écran, sans défilement horizontal");
    await page.screenshot({ path: path.join(CAPTURES, "palette-mobile.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#palette-ouvrir");
    await page.keyboard.press("Control+k");
    await page.waitForSelector("#dlg-palette[open]");
    await page.fill("#palette-q", "cr");
    await page.waitForFunction(() => document.querySelector('#palette-liste [role="option"]'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "palette.png") });
    await page.keyboard.press("Escape");
  });

  await etape("lanceur : parties d'Orbite, simulateur ouvert dans Orbite (cadre isolé), retour, état gardé, palette, lien direct, téléphone", async () => {
    /* Les simulateurs (GitHub Pages) sont remplacés par une page locale : le parcours tourne sans réseau. */
    const ouverts = [];
    await page.route("https://mohamed-ja.github.io/**", (r) => {
      ouverts.push(r.request().url());
      r.fulfill({ status: 200, contentType: "text/html; charset=utf-8",
        body: "<!doctype html><meta charset=utf-8><title>Simulateur</title><body><h1 id=t>Simulateur de test</h1><input id=champ><p id=dans></p><script>document.getElementById('dans').textContent = window.self !== window.top ? 'dans-orbite' : 'seul';</script>" });
    });
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector("#apps-ouvrir");
    await page.click("#apps-ouvrir");
    await page.waitForSelector("#dlg-apps[open]");
    assert((await page.$$eval("#apps-orbite .apps__app", (l) => l.length)) >= 7, "parties d'Orbite");
    assert((await page.$$eval("#apps-sim .apps__app", (l) => l.length)) === 4, "4 simulateurs");
    /* Une partie d'Orbite : simple navigation. */
    await page.click('#apps-orbite a[href="#credit"]');
    await page.waitForFunction(() => location.hash === "#credit" && !document.getElementById("dlg-apps").open);
    /* Un simulateur : plein écran dans Orbite, cadre isolé. */
    await page.click("#apps-ouvrir");
    await page.click('#apps-sim [data-sim="auto"]');
    await page.waitForSelector("#dlg-simulateur[open]");
    assert((await page.textContent("#sim-titre")) === "Simulateur d'assurance automobile", "titre");
    assert((await page.getAttribute("#sim-externe", "href")) === "https://mohamed-ja.github.io/simulateur-Assurance-Automobile/", "lien « Ouvrir à part »");
    const cadre = await page.$("#dlg-simulateur iframe:not([hidden])");
    assert(/allow-scripts/.test(await cadre.getAttribute("sandbox")) && !/allow-top-navigation/.test(await cadre.getAttribute("sandbox")), "bac à sable sans navigation de la page Orbite");
    const f = await cadre.contentFrame();
    await f.waitForSelector("#t");
    assert((await f.textContent("#dans")) === "dans-orbite", "le simulateur sait qu'il est ouvert dans Orbite");
    await page.waitForSelector("#sim-attente", { state: "hidden" });
    await f.fill("#champ", "gardé");
    /* Retour : « ← Orbite », on reste sur la même vue ; l'état du simulateur est gardé. */
    await page.click("#sim-retour");
    await page.waitForSelector("#dlg-simulateur", { state: "hidden" });
    assert((await page.evaluate(() => location.hash)) === "#credit", "retour sur la vue d'avant");
    await page.evaluate(() => window.Orbite.ouvrirSimulateur("auto"));
    await page.waitForSelector("#dlg-simulateur[open]");
    assert((await (await (await page.$("#dlg-simulateur iframe:not([hidden])")).contentFrame()).inputValue("#champ")) === "gardé", "état du simulateur gardé");
    /* Bouton « retour » du navigateur : ferme le simulateur. */
    await page.goBack();
    await page.waitForSelector("#dlg-simulateur", { state: "hidden" });
    assert((await page.evaluate(() => location.hash)) === "#credit", "retour du navigateur : on reste dans Orbite");
    /* Palette : « assurance vie » ouvre le simulateur. */
    await page.keyboard.press("Control+k");
    await page.fill("#palette-q", "simulateur assurance vie");
    await page.waitForFunction(() => document.querySelector('#palette-liste [data-id="a-sim-vie"]'));
    await page.click('#palette-liste [data-id="a-sim-vie"]');
    await page.waitForSelector("#dlg-simulateur[open]");
    assert((await page.textContent("#sim-titre")) === "Simulateur d'assurance vie et CEA", "simulateur depuis la palette");
    await page.click("#sim-retour");
    await page.waitForSelector("#dlg-simulateur", { state: "hidden" });
    /* Lien direct, puis téléphone. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#orbite?simulateur=credit");
    await page.waitForSelector("#dlg-simulateur[open]");
    assert((await page.evaluate(() => location.hash)) === "#orbite", "paramètre retiré de l'adresse");
    await page.waitForSelector("#sim-attente", { state: "hidden" });
    assert(await page.$eval("#dlg-simulateur", (d) => Math.abs(d.getBoundingClientRect().height - innerHeight) < 2 && d.scrollWidth <= d.clientWidth + 1), "plein écran sans débordement");
    await page.screenshot({ path: path.join(CAPTURES, "simulateur-dans-orbite-mobile.png") });
    await page.click("#sim-retour");
    await page.click("#apps-ouvrir");
    await page.waitForSelector("#dlg-apps[open]");
    await page.waitForTimeout(250);
    assert(await page.$eval("#dlg-apps", (d) => d.getBoundingClientRect().bottom <= innerHeight + 1 && d.scrollWidth <= d.clientWidth + 1), "feuille basse dans l'écran");
    await page.screenshot({ path: path.join(CAPTURES, "lanceur-mobile.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/espace/#orbite");
    await page.click("#apps-ouvrir");
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(CAPTURES, "lanceur.png") });
    await page.keyboard.press("Escape");
    assert(ouverts.every((u) => u.startsWith("https://mohamed-ja.github.io/")), "seuls les simulateurs sont chargés");
    await page.unroute("https://mohamed-ja.github.io/**");
  });

  await etape("graphiques unifiés : même moteur partout, bulle au clavier, « Voir le tableau », couleurs claires et sombres, téléphone", async () => {
    const themeAvant = await page.getAttribute("html", "data-theme");
    const verifier = async (vue, sel, nom) => {
      await page.goto(base + "/espace/#" + vue);
      await page.waitForSelector(sel + " .og-svg", { timeout: 15000 });
      /* Partie affichée : le graphique se redessine à sa largeur réelle, on attend la fin avant de le focaliser. */
      await page.waitForTimeout(400);
      await page.focus(sel + " .og-svg");
      await page.waitForFunction((s) => { const b = document.querySelector(s + " .og-bulle"); return b && !b.hidden && b.textContent.length > 4; }, sel);
      await page.keyboard.press("ArrowLeft");
      const t = page.locator(sel + " .og-tableau summary").first();
      if (await t.count()) {
        await t.click();
        await page.waitForFunction((s) => document.querySelector(s + " .og-tableau[open]") && document.querySelectorAll(s + " .og-tableau tbody tr").length > 1, sel);
        await page.locator(sel + " .og-tableau summary").first().click();
      }
      return nom;
    };
    const vus = [];
    vus.push(await verifier("salaire?partie=detail", "#courbe", "salaire"));
    await page.screenshot({ path: path.join(CAPTURES, "graphe-salaire.png") });
    /* Légende : chaque série a sa clé de couleur (trait), pas seulement son nom. */
    assert((await page.$$("#courbe .og-legende .og-cle--ligne")).length === 2, "clés de légende du salaire");
    vus.push(await verifier("credit?partie=echeancier", "#cr-gr-zone", "crédit"));
    await page.locator("#cr-gr-zone").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURES, "graphe-credit.png") });
    await page.click("#cr-gr-tab-annee");
    await page.waitForSelector("#cr-gr-zone .og-colonne");
    await page.focus("#cr-gr-zone .og-svg");
    await page.waitForFunction(() => { const b = document.querySelector("#cr-gr-zone .og-bulle"); return b && !b.hidden && /Capital/.test(b.textContent); });
    await page.waitForTimeout(1400);
    assert(await page.evaluate(() => getComputedStyle(document.querySelector("#cr-gr-zone .og-barre")).opacity === "1"), "colonnes visibles après l'apparition");
    await page.screenshot({ path: path.join(CAPTURES, "graphe-credit-annees.png") });
    await page.click("#cr-gr-tab-crd");
    await page.goto(base + "/espace/#epargne?versement=250&partie=projection");
    await page.waitForSelector("#ep-g-courbe .og-svg", { timeout: 15000 });
    vus.push("épargne");
    /* Mode sombre : couleurs de séries recalées (pas les mêmes qu'en clair). */
    const clair = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--g1").trim());
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const sombre = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--g1").trim());
    assert(clair.toUpperCase() === "#2F5BEA" && sombre.toUpperCase() === "#5A82F2", "palette claire puis sombre : " + clair + " / " + sombre);
    await page.goto(base + "/espace/#credit?partie=echeancier");
    await page.waitForSelector("#cr-gr-zone .og-svg");
    await page.locator("#cr-gr-zone").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(CAPTURES, "graphe-credit-sombre.png") });
    await page.evaluate((t) => { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }, themeAvant);
    /* Téléphone : graphiques à la largeur de l'écran, étiquettes sans chevauchement, pas de défilement horizontal. */
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [vue, sel] of [["salaire?partie=detail", "#courbe"], ["credit?partie=echeancier", "#cr-gr-zone"]]) {
      await page.goto(base + "/espace/#" + vue);
      await page.waitForSelector(sel + " .og-svg");
      await page.waitForTimeout(300);
      const r = await page.evaluate((s) => {
        const svg = document.querySelector(s + " .og-svg"), xs = [...svg.querySelectorAll(".og-axe text")].filter((t) => t.getAttribute("text-anchor") !== "end" || +t.getAttribute("y") > 100).map((t) => t.getBoundingClientRect()).filter((b) => b.width);
        const bas = xs.filter((b) => b.top > svg.getBoundingClientRect().bottom - 30).sort((a, b) => a.left - b.left);
        let chevauche = false; for (let i = 1; i < bas.length; i++) if (bas[i].left < bas[i - 1].right - 1) chevauche = true;
        return { deborde: document.documentElement.scrollWidth > window.innerWidth + 1, chevauche, w: svg.getBoundingClientRect().width };
      }, sel);
      assert(!r.deborde && !r.chevauche && r.w <= 390, vue + " sur téléphone : " + JSON.stringify(r));
    }
    await page.locator("#cr-gr-zone").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(CAPTURES, "graphe-credit-telephone.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    assert(vus.length === 3, "graphiques vus : " + vus.join(", "));
  });

  await etape("sous-rubriques : barre latérale dépliée, une partie à la fois, révélation automatique, onglets synchronisés, pastilles sur téléphone", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/espace/#salaire");
    await page.waitForSelector("#vue-salaire:not([hidden])");
    await page.waitForFunction(() => window.SousRubriques.active("salaire") === "calcul");
    /* Barre latérale : seule la rubrique active est dépliée, avec ses cinq sous-rubriques. */
    const rail = await page.evaluate(() => ({ ouverts: [...document.querySelectorAll(".rail__liens li.sr-ouvert > a")].map((a) => a.getAttribute("data-vue")), liens: [...document.querySelectorAll(".sr-ouvert .rail__sous-lien")].map((a) => a.textContent) }));
    assert(rail.ouverts.join() === "salaire" && rail.liens.join("|") === "Calcul du net|Augmentation|Où va votre brut|Deux offres|Calcul détaillé", "barre latérale : " + JSON.stringify(rail));
    assert(await page.isVisible(".scene-salaire") && await page.isHidden("#section-offres") && await page.isHidden("#section-detail"), "une partie à la fois");
    const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.click('.rail__sous-lien[data-sr="hausse"]');
    await page.waitForFunction(() => location.hash === "#salaire?partie=hausse" && window.SousRubriques.active("salaire") === "hausse");
    assert(await page.isVisible("#section-hausse") && await page.isHidden(".scene-salaire"), "partie « Augmentation » seule");
    assert(await page.getAttribute('.rail__sous-lien[data-sr="hausse"]', "aria-current") === "true", "sous-rubrique active signalée");
    await page.waitForTimeout(450);
    const cur = await page.evaluate(() => { const c = document.querySelector(".sr-ouvert .rail__sous-curseur"), a = document.querySelector('.rail__sous-lien[data-sr="hausse"]').parentElement; return [getComputedStyle(c).opacity, c.style.getPropertyValue("--y"), a.offsetTop + "px"]; });
    assert(cur[0] === "1" && cur[1] === cur[2], "curseur sur la sous-rubrique : " + JSON.stringify(cur));
    await page.screenshot({ path: path.join(CAPTURES, "sous-rubriques.png") });
    /* Un bouton qui mène à une autre partie l'affiche tout seul (« Comparer avec ma situation actuelle » → Deux offres). */
    await page.evaluate(() => { const c = document.getElementById("hausse"); c.value = "300"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.click("#hausse-vers-offre");
    await page.waitForFunction(() => window.SousRubriques.active("salaire") === "offres" && /partie=offres/.test(location.hash));
    assert(await page.isVisible("#section-offres") && await page.isHidden("#section-hausse"), "partie révélée par le bouton");
    /* Rechargement : la partie est gardée. Moins de défilement qu'avant. */
    await page.reload();
    await page.waitForFunction(() => window.SousRubriques && window.SousRubriques.active("salaire") === "offres");
    assert(await page.evaluate(() => document.documentElement.scrollHeight) <= hauteur + 400, "page courte");
    /* Crédit : les onglets existants sont dans la barre latérale et restent synchronisés. */
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#vue-credit:not([hidden])");
    await page.click('.rail__sous-lien[data-sr="tmm"]');
    await page.waitForFunction(() => document.getElementById("ce-tab-tmm").getAttribute("aria-selected") === "true");
    await page.click("#ce-tab-simuler");
    await page.waitForFunction(() => window.SousRubriques.active("credit") === "simuler" && document.querySelector('.rail__sous-lien[data-sr="simuler"]').getAttribute("aria-current") === "true");
    /* Vie & impôts : onglets repris tels quels. */
    await page.goto(base + "/espace/#vie");
    await page.click('.rail__sous-lien[data-sr="fiscal"]');
    await page.waitForFunction(() => document.getElementById("vie-tab-fiscal").getAttribute("aria-selected") === "true");
    /* Téléphone : pastilles collantes, pas de défilement horizontal. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/espace/#orbite");
    await page.waitForSelector('#vue-orbite .sr-nav:not([hidden]) .sr-nav__lien[data-sr="sante"]');
    await page.click('#vue-orbite .sr-nav__lien[data-sr="sante"]');
    await page.waitForFunction(() => window.SousRubriques.active("orbite") === "sante");
    assert(await page.isVisible("#sante") && await page.isHidden("#orbite-contenu"), "pastille : partie « Santé » seule");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "pas de défilement horizontal");
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(250);
    const colle = await page.evaluate(() => { const n = document.querySelector("#vue-orbite .sr-nav"), b = document.querySelector(".barre"); return Math.abs(n.getBoundingClientRect().top - b.getBoundingClientRect().bottom) < 2; });
    assert(colle, "pastilles collées sous la barre du haut");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "sous-rubriques-telephone.png") });
    await page.goto(base + "/espace/#orbite?partie=apercu");
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  await etape("rembourser ou épargner ? (Décider), patrimoine net et comparateur de banques : choix comparés, conseil, hypothèses gardées, valeur du logement, règles des banques", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    const avant = await page.evaluate(() => JSON.stringify(window.Orbite.profil()));
    await page.evaluate(() => window.Orbite.majProfil({ nombreSalaires: 14, calendrierPrimes: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1], epargneDisponible: 4000, chargesFixes: 500,
      credits: [{ type: "immo", libelle: "Crédit immobilier", tauxPct: 3, mensualite: 650, moisRestants: 200, capitalRestant: 98000 }, { type: "auto", libelle: "Crédit auto", tauxPct: 9, mensualite: 520, moisRestants: 48 }],
      patrimoine: { logement: 260000 } }, { immediat: true }));
    await page.goto(base + "/espace/#vie?onglet=decider&somme=3000");
    await page.waitForSelector("#vie-panneau-decider:not([hidden]) #dc-choix li:nth-child(3)");
    assert((await page.inputValue("#dc-somme")).replace(/\s/g, "") === "3000", "somme reprise de l'adresse");
    assert(await page.getAttribute('.rail__sous-lien[data-sr="decider"]', "aria-current") === "true", "sous-rubrique « Décider » dans la barre latérale");
    const rb = await page.textContent('[data-choix="rembourser"]');
    assert(/Rembourser le crédit auto/.test(rb) && /9\s?%/.test(rb) && /intérêts évités/.test(rb), "le crédit le plus cher : " + rb);
    assert(await page.isVisible(".dc-choix__item--top"), "le plus rentable signalé");
    assert(/^Notre conseil : partager/.test(await page.textContent("#dc-conseil")) && /D'abord/.test(await page.textContent("#dc-conseil")), "réserve d'abord, puis placement");
    const v5 = await page.textContent('[data-b="placer"]');
    await page.click('label:has(input[name="dc-horizon"][value="10"])');
    await page.waitForFunction((v) => document.querySelector('[data-b="placer"]').textContent !== v, v5);
    assert(/dans 10 ans/.test(await page.textContent(".dc-barres__titre")), "horizon 10 ans");
    await page.click("[data-autre]");
    assert(await page.evaluate(() => document.activeElement.id === "dc-somme"), "« Autre montant » : saisie active");
    await page.fill("#dc-somme", "50000");
    await page.waitForFunction(() => /soldé tout de suite/.test(document.querySelector('[data-choix="rembourser"]').textContent));
    await page.click("#dc-hyp summary");
    await page.fill("#dc-rend-av", "2"); await page.press("#dc-rend-av", "Tab");
    await page.waitForFunction(() => window.Orbite.profil().decider.rendementAv === 2);
    assert(/assurance vie 2 %/.test((await page.textContent("#dc-hyp summary")).replace(/\u00a0/g, " ")), "hypothèse affichée");
    await page.fill("#dc-somme", "3000");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "decider.png") });
    /* Patrimoine net : chiffres du moteur, courbe, autres biens enregistrés. */
    await page.goto(base + "/espace/#orbite?partie=patrimoine");
    await page.waitForSelector("#patrimoine:not([data-sr-masque]) #pn-graphe .og-svg");
    const attendu = await page.evaluate(() => window.Orbite.F.dt0(window.DeciderCalcul.patrimoine(window.Orbite.synthese()).net));
    assert((await page.textContent("#pn-net")).startsWith(attendu), "patrimoine net : " + await page.textContent("#pn-net"));
    assert((await page.$$("#pn-jalons li")).length >= 2 && /Crédit auto soldé/.test(await page.textContent("#pn-jalons")), "jalons");
    await page.fill("#pn-autres", "15 000"); await page.press("#pn-autres", "Tab");
    await page.waitForFunction(() => window.Orbite.profil().patrimoine.autres === 15000);
    await page.waitForFunction((a) => document.getElementById("pn-net").textContent !== a + "\u00a0DT", attendu);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(CAPTURES, "patrimoine.png") });
    /* Téléphone : rien ne déborde. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "patrimoine sans débordement sur téléphone");
    await page.goto(base + "/espace/#vie?onglet=decider");
    await page.waitForSelector("#dc-choix li:nth-child(3)");
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "Décider sans débordement sur téléphone");
    await page.setViewportSize({ width: 1360, height: 900 });
    /* Comparateur de banques : règle de chaque banque, montants du moteur, réglages gardés dans le profil. */
    await page.evaluate(() => window.Orbite.majProfil({ credits: [{ type: "immo", libelle: "Crédit immobilier", tauxPct: 3, mensualite: 650, moisRestants: 200 }], banques: [] }, { immediat: true }));
    await page.goto(base + "/espace/#credit?espace=banques");
    await page.waitForSelector("#credit-banques:not([hidden]) #cb-liste li:nth-child(4)");
    assert(await page.getAttribute('.rail__sous-lien[data-sr="banques"]', "aria-current") === "true", "sous-rubrique « Comparer les banques »");
    const montants = () => page.$$eval("#cb-liste .cb-v strong", (l) => l.map((e) => e.textContent));
    const attendus = () => page.evaluate(() => window.DeciderCalcul.banques(window.Orbite.synthese(), window.Orbite.profil().banques.length ? window.Orbite.profil().banques : null, document.querySelector("#cb-types [aria-checked=true]").getAttribute("data-type")).lignes.map((x) => window.Orbite.F.dt0(x.capital)));
    assert(JSON.stringify(await montants()) === JSON.stringify(await attendus()), "montants du moteur : " + await montants());
    assert(await page.isVisible(".cb-ligne--top") && /^Jusqu'à .+ de plus selon la banque/.test(await page.textContent("#cb-avis")), "la plus favorable signalée : " + await page.textContent("#cb-avis"));
    /* Régler une banque : quotité et nom retenus dans le profil, montant recalculé. */
    const avantB = (await montants())[1];
    await page.fill('#cb-liste li[data-i="1"] [data-b="quotite"]', "45");
    await page.fill('#cb-liste li[data-i="1"] [data-b="nom"]', "Banque du quartier");
    await page.waitForFunction(() => { const b = window.Orbite.profil().banques; return b.length === 4 && b[1].quotite === 0.45 && b[1].nom === "Banque du quartier"; });
    assert((await montants())[1] !== avantB && JSON.stringify(await montants()) === JSON.stringify(await attendus()), "recalculé à 45 %");
    await page.selectOption('#cb-liste li[data-i="1"] [data-b="revenu"]', "annee");
    await page.waitForFunction(() => window.Orbite.profil().banques[1].revenu === "annee");
    /* Type de crédit, ajout et retrait d'une banque. */
    await page.click('#cb-types [data-type="auto"]');
    assert(await page.getAttribute('#cb-types [data-type="auto"]', "aria-checked") === "true" && JSON.stringify(await montants()) === JSON.stringify(await attendus()), "crédit auto");
    await page.click("#cb-plus");
    await page.waitForSelector("#cb-liste li:nth-child(5)");
    await page.click('#cb-liste li[data-i="4"] [data-retirer]');
    await page.waitForFunction(() => document.querySelectorAll("#cb-liste li").length === 4 && window.Orbite.profil().banques.length === 4);
    await page.screenshot({ path: path.join(CAPTURES, "banques.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "comparateur sans débordement sur téléphone");
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.evaluate((a) => window.Orbite.majProfil(JSON.parse(a), { immediat: true }), avant);
  });

  await etape("import du relevé bancaire : PDF lu sur l'appareil, enveloppes proposées, choix retenu, totaux seuls ajoutés, relevé jamais ajouté deux fois, CSV, téléphone", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    const avant = await page.evaluate(() => JSON.stringify(window.Orbite.profil()));
    await page.evaluate(() => window.Orbite.majProfil({ credits: [{ type: "immo", libelle: "Crédit immobilier", tauxPct: 3, mensualite: 650, moisRestants: 200 }], budget: { enveloppes: [], mois: {} } }, { immediat: true }));
    /* Relevé fictif du mois en cours, en PDF (colonnes Débit / Crédit / Solde), créé dans le navigateur. */
    const m = new Date(), mm = String(m.getMonth() + 1).padStart(2, "0"), an = m.getFullYear(), cm = an + "-" + mm;
    const veille = new Date(an, m.getMonth(), 0), sv = String(veille.getDate()).padStart(2, "0") + "/" + String(veille.getMonth() + 1).padStart(2, "0") + "/" + veille.getFullYear();
    const lignes = [["02", "CB CARREFOUR LA MARSA", "84,500", "", "1 415,500"], ["03", "PAIEMENT AGIL STATION ARIANA", "60,000", "", "1 355,500"],
      ["05", "PRLV ECHEANCE PRET", "650,000", "", "705,500"], ["09", "STEG FACTURE", "58,000", "", "647,500"], ["12", "PHARMACIE CENTRALE", "23,800", "", "623,700"],
      ["14", "BOUTIQUE ELYSSA", "15,000", "", "608,700"], ["25", "VIR SALAIRE", "", "2 290,000", "2 898,700"]];
    const html = '<html><body style="font:12px Arial;margin:30px"><h3>Banque fictive — Relevé de compte</h3><table style="width:100%;border-collapse:collapse" cellpadding="6">' +
      '<tr><th align="left">Date</th><th align="left">Libellé</th><th align="left">Valeur</th><th align="right">Débit</th><th align="right">Crédit</th><th align="right">Solde</th></tr>' +
      '<tr><td></td><td>SOLDE AU ' + sv + '</td><td></td><td></td><td></td><td align="right">1 500,000</td></tr>' +
      lignes.map((l) => '<tr><td>' + l[0] + '/' + mm + '</td><td>' + l[1] + '</td><td>' + l[0] + '/' + mm + '</td><td align="right">' + l[2] + '</td><td align="right">' + l[3] + '</td><td align="right">' + l[4] + '</td></tr>').join("") +
      '</table></body></html>';
    const p2 = await page.context().newPage();
    await p2.setContent(html);
    const pdf = await p2.pdf({ format: "A4" });
    await p2.close();
    await page.goto(base + "/espace/#mois?onglet=budget");
    await page.waitForSelector("#mo-releve", { state: "visible" });
    await page.setInputFiles("#mo-rel-fichier", { name: "releve.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.waitForSelector("#mo-rel-resultat:not([hidden]) #mo-rel-ops li:nth-child(7)", { timeout: 30000 });
    assert(/· 7 opérations lues$/.test(await page.textContent("#mo-rel-titre")), "titre : " + await page.textContent("#mo-rel-titre"));
    const envs = await page.$$eval("#mo-rel-ops li", (l) => l.map((li) => { const s = li.querySelector("select"); return s ? s.value : li.querySelector(".mo-rel__puce").textContent; }));
    assert(JSON.stringify(envs) === JSON.stringify(["courses", "transport", "credits", "logement", "sante", "divers", "Entrée · ignorée"]), "enveloppes : " + envs);
    /* Changer une étiquette : la tuile suit, le choix sera retenu. */
    await page.selectOption('#mo-rel-ops li[data-i="5"] select', "loisirs");
    await page.waitForFunction(() => /Loisirs/.test(document.getElementById("mo-rel-tuiles").textContent));
    assert((await page.textContent("#mo-rel-ajouter")).includes("Ajouter 6 dépenses au budget"), "6 dépenses");
    await page.screenshot({ path: path.join(CAPTURES, "releve.png") });
    await page.click("#mo-rel-ajouter");
    await page.waitForFunction((c) => { const b = window.Orbite.profil().budget; return b.mois[c] && b.mois[c].courses === 84.5; }, cm);
    const b = await page.evaluate(() => window.Orbite.profil().budget);
    const tri = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
    assert(tri(b.mois[cm]) === tri({ credits: 650, logement: 58, courses: 84.5, transport: 60, sante: 23.8, loisirs: 15 }), "totaux : " + JSON.stringify(b.mois[cm]));
    assert(b.memoire.ELYSSA === "loisirs" && b.imports.length === 1 && b.enveloppes.length === 8, "mémoire, empreinte, plan posé : " + JSON.stringify([b.memoire, b.imports]));
    assert(!JSON.stringify(b).includes("PHARMACIE"), "aucun libellé gardé hors mémoire");
    assert(await page.isHidden("#mo-rel-resultat") && /Relevé ajouté/.test(await page.textContent("#mo-rel-etat")), "relevé ajouté");
    /* Le même relevé une seconde fois : refusé. */
    await page.setInputFiles("#mo-rel-fichier", { name: "releve.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.waitForSelector("#mo-rel-resultat:not([hidden])", { timeout: 30000 });
    assert(await page.isDisabled("#mo-rel-ajouter") && /déjà été ajouté/.test(await page.textContent("#mo-rel-info")), "doublon refusé");
    await page.click("#mo-rel-annuler");
    /* CSV : la mémoire range le même commerçant d'elle-même ; un mois de plus de 12 mois est écarté. */
    const csv = "Date;Libellé;Débit;Crédit\n04/" + mm + "/" + an + ";CB ELYSSA MENZAH;20,000;\n06/" + mm + "/" + an + ";CB MONOPRIX;45,600;\n01/01/2020;CB ANCIEN;9,000;\n";
    await page.setInputFiles("#mo-rel-fichier", { name: "releve.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.waitForSelector("#mo-rel-resultat:not([hidden]) #mo-rel-ops li:nth-child(3)");
    assert(await page.inputValue('#mo-rel-ops li[data-i="0"] select') === "loisirs" && await page.inputValue('#mo-rel-ops li[data-i="1"] select') === "courses", "mémoire appliquée");
    assert(/12 derniers mois/.test(await page.textContent("#mo-rel-info")), "ancien mois écarté");
    await page.click("#mo-rel-ajouter");
    await page.waitForFunction((c) => { const x = window.Orbite.profil().budget.mois[c]; return x.loisirs === 35 && x.courses === 130.1; }, cm);
    /* Téléphone. */
    await page.setInputFiles("#mo-rel-fichier", { name: "releve.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.waitForSelector("#mo-rel-resultat:not([hidden])", { timeout: 30000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "import sans débordement sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "releve-telephone.png"), fullPage: true });
    await page.click("#mo-rel-annuler");
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.evaluate((a) => window.Orbite.majProfil(JSON.parse(a), { immediat: true }), avant);
  });

  await etape("Mes comptes : premier solde, relevé (soldes datés), courbe, analyse refaite (avant → après), Mon orbite, modifier, supprimer et annuler, téléphone", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    const avant = await page.evaluate(() => JSON.stringify(window.Orbite.profil()));
    await page.evaluate(() => window.Orbite.majProfil({ comptes: [], comptesAnalyse: null, jourPaie: 27, epargneDisponible: 1000 }, { immediat: true }));
    const iso = (decal) => { const d = new Date(); d.setDate(d.getDate() + decal); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    const fr = (decal) => { const x = iso(decal); return x.slice(8) + "/" + x.slice(5, 7) + "/" + x.slice(0, 4); };
    await page.goto(base + "/espace/#mois?onglet=comptes");
    await page.waitForSelector("#cpt-vide", { state: "visible" });
    /* Mouvement réduit (après l'affichage) : pas de fondu entre les vues pendant les clics. */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(300);
    assert(await page.isVisible("#cpt-commencer"), "toujours dans Mon mois › Comptes");
    assert(await page.isHidden("#cpt-plein") && await page.isHidden("#cpt-analyse-bloc"), "état vide seul");
    assert(await page.getAttribute(".mo-onglets", "data-o") === "comptes", "onglet Comptes actif");
    /* 1. Premier solde : nouveau compte courant. */
    await page.click("#cpt-commencer");
    await page.waitForSelector("#dlg-solde[open]");
    assert(await page.inputValue("#cpt-compte") === "__nv" && await page.isVisible("#cpt-nv"), "premier compte proposé");
    assert(await page.inputValue("#cpt-date") === iso(0), "date du jour par défaut");
    await page.fill("#cpt-nv-nom", "Compte courant");
    await page.fill("#cpt-nv-banque", "Banque A");
    await page.fill("#cpt-montant", "1 240,500");
    await page.waitForSelector("#cpt-apres:not([hidden])");
    assert(/épargne disponible 1 000 → /.test((await page.textContent("#cpt-apres")).replace(/\s/g, " ")), "aperçu : " + await page.textContent("#cpt-apres"));
    await page.click("#cpt-valider");
    await page.waitForFunction(() => window.Orbite.profil().comptes.length === 1);
    let p = await page.evaluate(() => window.Orbite.profil());
    assert(p.comptes[0].nom === "Compte courant" && p.comptes[0].type === "courant" && p.comptes[0].soldes[0].v === 1240.5, "compte créé : " + JSON.stringify(p.comptes));
    assert(p.epargneDisponible < 1240.5 && p.comptesAnalyse && p.comptesAnalyse.avant.epargne === 1000, "épargne disponible dérivée et analyse gardée : " + JSON.stringify([p.epargneDisponible, p.comptesAnalyse]));
    await page.waitForSelector('.toast:has-text("Solde enregistré")');
    await page.waitForSelector("#cpt-plein:not([hidden]) #cpt-liste li");
    /* 2. Compte épargne depuis un relevé CSV (colonne Solde) : soldes datés cochés, rien d'autre gardé. */
    await page.click("#cpt-nouveau");
    await page.waitForSelector("#dlg-solde[open]");
    await page.selectOption("#cpt-compte", "__nv");
    await page.fill("#cpt-nv-nom", "Compte épargne");
    await page.check('input[name="cpt-nv-type"][value="epargne"]');
    const csv = "Date;Libellé;Débit;Crédit;Solde\n" + fr(-80) + ";VERSEMENT EPARGNE;;500,000;6 000,000\n" + fr(-40) + ";VERSEMENT EPARGNE;;400,000;6 400,000\n" + fr(-10) + ";VERSEMENT EPARGNE;;400,000;6 800,000\n";
    await page.setInputFiles("#cpt-rel-fichier", { name: "releve-epargne.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.waitForSelector("#cpt-trouves li:nth-child(3)");
    assert(/3 soldes trouvés/.test(await page.textContent("#cpt-rel-etat")), "soldes trouvés");
    await page.click("#cpt-valider");
    await page.waitForFunction(() => window.Orbite.profil().comptes.length === 2);
    p = await page.evaluate(() => window.Orbite.profil());
    assert(p.comptes[1].type === "epargne" && p.comptes[1].soldes.length === 3 && p.comptes[1].soldes.every((x) => x.src === "releve"), "épargne : " + JSON.stringify(p.comptes[1]));
    assert(!JSON.stringify(p.comptes).includes("VERSEMENT"), "aucun libellé du relevé gardé");
    /* 3. Solde plus ancien sur le compte courant : il complète la courbe (point bas). */
    await page.click("#cpt-nouveau");
    await page.waitForSelector("#dlg-solde[open]");
    await page.selectOption("#cpt-compte", "c1");
    await page.fill("#cpt-montant", "86,04");
    await page.fill("#cpt-date", iso(-22));
    await page.waitForFunction(() => /plus ancien que le dernier connu/.test(document.getElementById("cpt-apres").textContent));
    await page.click("#cpt-valider");
    await page.waitForFunction(() => window.Orbite.profil().comptes[0].soldes.length === 2);
    await page.evaluate(() => window.Orbite.majProfil({ comptes: window.Orbite.profil().comptes.map((c) => c.id === "c1" ? Object.assign({}, c, { soldes: c.soldes.concat([{ d: (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().slice(0, 10); })(), v: 900 }]) }) : c) }, { immediat: true }));
    /* 4. Rendu : total, liste, courbe, analyse avec avant → après. */
    await page.waitForSelector("#cpt-graphe svg");
    assert((await page.textContent("#cpt-total")).replace(/\s/g, " ").includes("8 040,500"), "total : " + await page.textContent("#cpt-total"));
    assert(await page.$$eval("#cpt-liste li", (l) => l.length) === 2, "2 comptes listés");
    assert(await page.isVisible("#cpt-analyse-bloc .cpt-refait") && await page.$$eval("#cpt-analyse-bloc .cpt-delta div", (l) => l.length) === 3, "avant → après");
    const points = await page.$$eval("#cpt-analyse-bloc .cpt-point b", (l) => l.map((b) => b.textContent));
    assert(points.some((t) => /Fin de mois tendue/.test(t)) && points.some((t) => /Jamais à découvert/.test(t)), "points : " + points);
    assert(/Point bas/.test(await page.textContent("#cpt-graphe")), "point bas sur la courbe");
    await page.screenshot({ path: path.join(CAPTURES, "comptes.png"), fullPage: true });
    /* 5. Mon orbite : « Ce que dit votre solde ». */
    await page.goto(base + "/espace/#orbite?partie=sante");
    await page.waitForSelector("#solde-orbite:not([hidden]) .cpt-point");
    await page.goto(base + "/espace/#mois?onglet=comptes");
    await page.waitForSelector("#cpt-liste li");
    /* 6. Modifier : renommer et retirer un solde. */
    await page.click('#cpt-liste [data-compte="c1"]');
    await page.waitForSelector("#dlg-compte[open]");
    await page.fill("#cpt-ed-nom", "Courant principal");
    await page.click("#cpt-ed-soldes li:first-child [data-retirer]");
    assert(await page.$eval("#cpt-ed-soldes li:first-child", (li) => li.classList.contains("cpt-hist__ligne--retire")), "solde marqué à retirer");
    await page.click('#form-compte button[value="ok"]');
    await page.waitForFunction(() => { const c = window.Orbite.profil().comptes[0]; return c.nom === "Courant principal" && c.soldes.length === 2; });
    /* 7. Supprimer le compte épargne, puis annuler. */
    await page.click('#cpt-liste [data-compte="c2"]');
    await page.waitForSelector("#dlg-compte[open]");
    await page.click("#cpt-ed-supprimer");
    await page.waitForSelector("#cpt-ed-confirmer:not([hidden])");
    await page.click("#cpt-ed-supprimer-oui");
    await page.waitForFunction(() => window.Orbite.profil().comptes.length === 1);
    await page.click('.toast:has-text("supprimé") button:has-text("Annuler")');
    await page.waitForFunction(() => window.Orbite.profil().comptes.length === 2);
    /* 8. Rien à enregistrer : message, fenêtre gardée. */
    await page.click("#cpt-nouveau");
    await page.waitForSelector("#dlg-solde[open]");
    await page.click("#cpt-valider");
    assert(await page.isVisible("#cpt-err") && await page.isVisible("#dlg-solde"), "erreur sans solde");
    await page.click('#form-solde button[value="annuler"]');
    /* 9. Téléphone. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "Mes comptes sans débordement sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "comptes-telephone.png"), fullPage: true });
    await page.click("#cpt-nouveau");
    await page.waitForSelector("#dlg-solde[open]");
    assert(!(await page.evaluate(() => { const d = document.getElementById("dlg-solde"); return d.scrollWidth > d.clientWidth + 1; })), "fenêtre sans débordement");
    await page.screenshot({ path: path.join(CAPTURES, "comptes-solde-telephone.png") });
    await page.click('#form-solde button[value="annuler"]');
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.emulateMedia({ reducedMotion: null });
    await page.evaluate((a) => window.Orbite.majProfil(JSON.parse(a), { immediat: true }), avant);
  });

  await etape("bilan annuel en PDF : bouton dans Ma progression, aperçu avec les vrais chiffres, sections à cocher, coordonnées décochées, PDF valide, Ctrl K, téléphone", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/espace/#progression");
    await page.waitForSelector("#btn-bilan", { state: "visible" });
    await page.click("#btn-bilan");
    await page.waitForSelector("#dlg-bilan[open]");
    const attendu = await page.evaluate(() => { const b = window.BilanCalcul.construire(window.Orbite.profil(), {}, new Date()); return { net: window.Orbite.F.dt0(b.cles.net) + " DT", score: b.cles.score + "/100", annee: b.annee }; });
    assert((await page.textContent("#bl-ap-net")) === attendu.net && (await page.textContent("#bl-ap-score")) === attendu.score, "aperçu : " + await page.textContent("#bl-ap-net"));
    assert((await page.textContent("#bl-titre")) === "Mon bilan " + attendu.annee + " en PDF", "titre");
    assert(!(await page.isChecked("#bl-coord")) && await page.isChecked("#bl-revenus") && await page.isHidden("#bl-ap-coord"), "coordonnées décochées par défaut");
    await page.check("#bl-coord");
    assert(await page.isVisible("#bl-ap-coord"), "aperçu suit les cases");
    await page.screenshot({ path: path.join(CAPTURES, "bilan-pdf.png") });
    /* Tout décoché : impossible de télécharger. */
    for (const id of ["#bl-revenus", "#bl-credits", "#bl-patrimoine", "#bl-sante", "#bl-coord"]) await page.uncheck(id);
    assert(await page.isDisabled("#bl-valider") && /au moins une partie/.test(await page.textContent("#bl-aide")), "au moins une partie");
    await page.check("#bl-revenus"); await page.check("#bl-sante");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#bl-valider")]);
    assert(dl.suggestedFilename() === "bilan-orbite-" + attendu.annee + ".pdf", "nom : " + dl.suggestedFilename());
    assert(fs.readFileSync(await dl.path()).slice(0, 5).toString() === "%PDF-", "PDF valide");
    await page.waitForFunction(() => !document.getElementById("dlg-bilan").open);
    /* Ctrl K : « Mon bilan en PDF » ouvre la fenêtre. */
    await page.goto(base + "/espace/#progression?bilan=1");
    await page.waitForSelector("#dlg-bilan[open]");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => { const d = document.getElementById("dlg-bilan"); return d.scrollWidth <= d.clientWidth + 1; }), "fenêtre sans débordement sur téléphone");
    await page.screenshot({ path: path.join(CAPTURES, "bilan-pdf-telephone.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1360, height: 900 });
  });

  await etape("apparence personnelle : accent, densité, taille du texte, aperçu, compte et appareil, sombre, Ctrl K, téléphone", async () => {
    await page.setViewportSize({ width: 1360, height: 900 });
    await page.goto(base + "/espace/#compte?onglet=preferences");
    await page.waitForSelector("#choix-accent", { state: "visible" });
    assert(!(await page.getAttribute("html", "data-accent")) && await page.isDisabled("#apparence-origine"), "réglages d'origine au départ");
    const fondDe = (sel) => page.$eval(sel, (e) => getComputedStyle(e).backgroundColor);
    /* Les boutons ont une transition de couleur : on attend la teinte finale. */
    const attendreFond = (sel, v) => page.waitForFunction(([s, c]) => getComputedStyle(document.querySelector(s)).backgroundColor === c, [sel, v], { timeout: 5000 }).then(() => true, () => false);
    const avantBouton = await fondDe("#enregistrer");
    /* Couleur d'accent : appliquée tout de suite (aperçu, bouton de la barre), retenue sur le compte et l'appareil. */
    await page.click('#choix-accent label[data-accent="sidi"]');
    assert((await page.getAttribute("html", "data-accent")) === "sidi", "accent posé");
    assert(await attendreFond(".apercu-perso .bouton--plein", "rgb(10, 108, 168)"), "aperçu en Sidi Bou Saïd : " + await fondDe(".apercu-perso .bouton--plein"));
    assert(await attendreFond("#enregistrer", "rgb(10, 108, 168)") && avantBouton !== "rgb(10, 108, 168)", "bouton principal à l'accent : " + avantBouton);
    await page.waitForFunction(() => window.Orbite.utilisateur().user_metadata.orbite_accent === "sidi");
    assert(!(await page.isDisabled("#apparence-origine")), "« Revenir aux réglages d'origine » possible");
    /* Densité compacte : la page raccourcit, le texte garde sa taille. */
    const mesure = () => page.evaluate(() => ({ h: document.getElementById("onglet-preferences").getBoundingClientRect().height, f: getComputedStyle(document.querySelector("#onglet-preferences .reglage__texte p")).fontSize }));
    const confort = await mesure();
    await page.click('#choix-densite label:has(input[value="compacte"])');
    await page.waitForFunction(() => document.documentElement.getAttribute("data-densite") === "compacte");
    const compacte = await mesure();
    assert(compacte.h < confort.h * 0.95 && compacte.f === confort.f, "compacte : " + JSON.stringify([confort, compacte]));
    /* Taille du texte. */
    await page.click('#choix-taille label:has(input[value="grande"])');
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".principal")).zoom === "1.12");
    await page.waitForFunction(() => { const m = window.Orbite.utilisateur().user_metadata; return m.orbite_densite === "compacte" && m.orbite_taille === "grande"; });
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("ef-apparence")));
    assert(ls.accent === "sidi" && ls.densite === "compacte" && ls.taille === "grande", "recopiée sur l'appareil : " + JSON.stringify(ls));
    await page.screenshot({ path: path.join(CAPTURES, "apparence-reglages.png") });
    /* Un autre appareil (stockage vide) : le compte fait foi. */
    await page.evaluate(() => localStorage.removeItem("ef-apparence"));
    await page.goto(base + "/espace/#credit");
    await page.reload();
    await page.waitForFunction(() => { const r = document.documentElement; return r.getAttribute("data-accent") === "sidi" && r.getAttribute("data-densite") === "compacte" && r.getAttribute("data-taille") === "grande"; });
    await page.waitForSelector("#cr-capital");
    assert((await page.evaluate(() => localStorage.getItem("ef-apparence"))) !== null, "recopiée à nouveau sur l'appareil");
    /* Avant l'affichage : l'attribut est déjà là quand le <body> apparaît (avant tout script de l'application). */
    await page.addInitScript(() => { new MutationObserver((l, o) => { if (document.body) { window.__accentAuCorps = document.documentElement.getAttribute("data-accent"); o.disconnect(); } }).observe(document, { childList: true, subtree: true }); });
    await page.reload();
    await page.waitForSelector("#cr-capital");
    const tot = await page.evaluate(() => window.__accentAuCorps);
    assert(tot === "sidi", "appliquée par theme-init avant l'affichage : " + tot);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(CAPTURES, "apparence-credit.png") });
    /* Sombre : la version éclaircie de l'accent. */
    await page.click("#bascule-theme");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
    assert(await attendreFond("#enregistrer", "rgb(93, 180, 232)"), "accent sombre : " + await fondDe("#enregistrer"));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(CAPTURES, "apparence-credit-sombre.png") });
    await page.click("#bascule-theme");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");
    /* Accueil et pages publiques : inchangés (même stockage, mais hors de l'espace). */
    await page.goto(base + "/");
    const pub = await page.evaluate(() => [document.documentElement.getAttribute("data-accent"), document.documentElement.getAttribute("data-taille"), !!localStorage.getItem("ef-apparence")]);
    assert(!pub[0] && !pub[1] && pub[2], "accueil sans apparence personnelle : " + JSON.stringify(pub));
    await page.goto(base + "/espace/#credit");
    await page.waitForSelector("#cr-capital");
    /* Ctrl K : couleur d'accent (ouvre le réglage), densité, taille. */
    async function palette(q, re) {
      await page.keyboard.press("Control+k");
      await page.waitForSelector("#dlg-palette[open]");
      await page.fill("#palette-q", q);
      await page.waitForFunction((r) => new RegExp(r).test(document.getElementById("palette-liste").textContent), re);
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !document.getElementById("dlg-palette").open);
    }
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await palette("densite", "densité confortable");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-densite"));
    await palette("agrandir texte", "Agrandir encore le texte");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-taille") === "tres-grande");
    await palette("couleur accent", "Changer la couleur d'accent");
    await page.waitForFunction(() => location.hash === "#compte?onglet=preferences" && document.activeElement && document.activeElement.closest("#choix-accent"));
    /* Clavier dans le nuancier : flèche → choisit la couleur suivante. */
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-accent") === "olivier");
    /* Téléphone : rien ne déborde, les noms tiennent dans leur case. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const tel = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, noms: Array.from(document.querySelectorAll(".nuance")).every((n) => { const b = n.querySelector("b").getBoundingClientRect(), r = n.getBoundingClientRect(); return b.left >= r.left - 0.5 && b.right <= r.right + 0.5; }) }));
    assert(tel.sw <= 390 && tel.noms, "téléphone : " + JSON.stringify(tel));
    await page.$eval("[aria-labelledby='r-perso']", (e) => e.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(CAPTURES, "apparence-telephone.png") });
    await page.setViewportSize({ width: 1360, height: 900 });
    /* Retour aux réglages d'origine : tout s'efface, compte et appareil compris. */
    await page.click("#apparence-origine");
    await page.waitForFunction(() => { const r = document.documentElement; return !r.hasAttribute("data-accent") && !r.hasAttribute("data-densite") && !r.hasAttribute("data-taille"); });
    await page.waitForFunction(() => { const m = window.Orbite.utilisateur().user_metadata; return !m.orbite_accent && !m.orbite_densite && !m.orbite_taille; });
    assert((await page.evaluate(() => localStorage.getItem("ef-apparence"))) === null && await page.isDisabled("#apparence-origine"), "appareil remis à zéro");
    assert(await attendreFond("#enregistrer", avantBouton), "bouton principal revenu à l'encre");
  });

  await etape("sécurité : double authentification (activer, code à la connexion, exigée par le serveur, désactiver) et verrouillage par empreinte", async () => {
    refusAttendus = true;
    const EM = "securite@exemple.tn", MDP = "Securite-compte-2026!";
    /* WebAuthn refuse une adresse IP comme identifiant de site : ce parcours passe par « localhost ». */
    const bl = base.replace("127.0.0.1", "localhost");
    faux.ajouterCompte(EM, MDP, { full_name: "Sam Sécurité", orbite_consentement: VERSION_ACCORD, orbite_partage_demande: new Date().toISOString(), orbite_partage_reponse: "non",
      orbite: { prenom: "Sam", nom: "Sécurité", dateNaissance: "1990-05-02", salaireBrut: 2600 } });
    const cs = await navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" });
    await cs.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await cs.route("https://api.pwnedpasswords.com/**", fuites);
    await cs.addInitScript(() => { try { localStorage.setItem("orbite-nouveautes", "vu"); } catch (e) {} });
    const ps = await cs.newPage();
    suivre(ps);
    const connecter = async () => {
      await ps.bringToFront();
      await ps.goto(bl + "/connexion.html");
      await ps.fill("#email", EM); await ps.fill("#mdp", MDP); await ps.click("#envoyer");
    };
    const fermerNotes = async () => {
      await ps.waitForTimeout(1200);
      if (await ps.isVisible("#dlg-nouveautes")) await ps.click('#dlg-nouveautes button[value="ok"]');
      for (let i = 0; i < 4 && await ps.$(".visite"); i++) { await ps.keyboard.press("Escape"); await ps.waitForTimeout(250); }
    };
    await connecter();
    await ps.waitForURL(/\/espace\//);
    await fermerNotes();
    /* Activer : code QR, clé, premier code tapé (lu ici avec la même clé, comme l'application d'authentification). */
    await ps.goto(bl + "/espace/#compte?onglet=securite");
    await ps.waitForSelector("#activer-2fa", { state: "visible" });
    assert(await ps.$eval("#etat-2fa", (e) => e.getAttribute("data-actif") === "non" && e.textContent === "Désactivée"), "désactivée au départ");
    await ps.click("#activer-2fa");
    await ps.waitForSelector("#dlg-2fa[open]");
    const cle = (await ps.textContent("#cle-2fa")).replace(/\s/g, "");
    assert(/^[A-Z2-7]{32}$/.test(cle) && await ps.$eval("#qr-2fa", (i) => /^data:image\/svg\+xml/.test(i.src)), "clé et code QR affichés");
    await ps.waitForFunction(() => document.getElementById("qr-2fa").complete && document.getElementById("qr-2fa").naturalWidth > 0);
    await ps.fill("#code-activer-2fa", "000000");
    await ps.click("#valider-2fa");
    await ps.waitForSelector("#code-activer-2fa-erreur:not([hidden])");
    await ps.screenshot({ path: path.join(CAPTURES, "securite-activer-2fa.png") });
    await ps.fill("#code-activer-2fa", Faux.totp(cle));
    await ps.waitForSelector("#dlg-2fa:not([open])", { state: "attached" });
    await ps.waitForFunction(() => document.getElementById("etat-2fa").getAttribute("data-actif") === "oui");
    assert(!(await ps.isVisible("#activer-2fa")) && await ps.isVisible("#secours-2fa") && await ps.isVisible("#desactiver-2fa"), "boutons une fois activée");
    const user = faux.comptes.get(EM).user;
    assert(user.factors.length === 1 && user.factors[0].status === "verified", "appareil vérifié côté serveur");
    await ps.screenshot({ path: path.join(CAPTURES, "securite-reglages.png"), fullPage: true });
    /* Serveur : le mot de passe seul (« aal1 ») ne lit plus les données du compte. */
    const aal1 = faux.jetonPour(EM).access_token;
    const statut = await ps.evaluate(async (a) => (await fetch(a.url + "/rest/v1/simulations?select=id", { headers: { apikey: "x", Authorization: "Bearer " + a.t } })).status, { url: SUPABASE, t: aal1 });
    assert(statut === 403, "données refusées sans le code : " + statut);
    /* Connexion : le code après le mot de passe ; un mauvais code refusé ; l'espace renvoie à l'étape du code. */
    await ps.click("#deconnexion");
    await ps.waitForURL(/connexion\.html/);
    await connecter();
    await ps.waitForSelector("#etape-code:not([hidden])");
    assert(await ps.isHidden("#panneau-auth") && await ps.isHidden("[data-onglets]"), "formulaire remplacé par l'étape du code");
    await ps.fill("#code-2fa", "000000");
    await ps.waitForSelector("#code-2fa-erreur:not([hidden])");
    await ps.screenshot({ path: path.join(CAPTURES, "securite-connexion-code.png") });
    await ps.goto(bl + "/espace/#credit");
    await ps.waitForURL(/connexion\.html\?mfa=1/);
    await ps.waitForSelector("#etape-code:not([hidden])");
    await ps.fill("#code-2fa", Faux.totp(cle));
    await ps.waitForURL(/\/espace\/#credit/);
    await ps.waitForSelector("#vue-credit:not([hidden])");
    await fermerNotes();
    /* Appareil déjà vérifié : rouvrir Orbite (rechargement, session rafraîchie) ne redemande pas le code. */
    await ps.reload();
    await ps.waitForSelector("#vue-credit:not([hidden])");
    assert(/\/espace\//.test(ps.url()), "pas de code redemandé sur cet appareil : " + ps.url());
    await ps.evaluate(() => window.Espace.client.auth.refreshSession());
    await ps.reload();
    await ps.waitForSelector("#vue-credit:not([hidden])");
    assert(/\/espace\//.test(ps.url()) && await ps.evaluate(async () => window.EFMfa.aalDe((await window.Espace.client.auth.getSession()).data.session) === "aal2"), "session rafraîchie toujours vérifiée");
    await fermerNotes();
    /* Désactiver (vraie fenêtre de confirmation). */
    await ps.bringToFront();
    await ps.goto(bl + "/espace/#compte?onglet=securite");
    await ps.waitForSelector("#desactiver-2fa", { state: "visible" });
    await ps.click("#desactiver-2fa");
    await ps.waitForSelector("#dlg-2fa-off[open]");
    await ps.click("#dlg-2fa-off-ok");
    await ps.waitForFunction(() => document.getElementById("etat-2fa").getAttribute("data-actif") === "non");
    assert((user.factors || []).length === 0, "appareils retirés côté serveur");
    /* Verrouillage : authentificateur virtuel de l'appareil (empreinte acceptée). */
    const cdp = await cs.newCDPSession(ps);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await ps.reload();
    await ps.waitForSelector("#verrou-actif:not([disabled])", { state: "attached" });
    /* La liste du délai est utilisable interrupteur éteint (4 choix) et son choix est repris à l'activation. */
    assert(await ps.evaluate(() => { const s = document.getElementById("verrou-delai"); return !s.disabled && s.options.length === 4; }), "liste « Verrouiller après » active, 4 choix");
    await ps.selectOption("#verrou-delai", "300");
    await ps.click('label:has(#verrou-actif)');
    await ps.waitForFunction(() => !!localStorage.getItem("ef-verrou") && document.getElementById("verrou-actif").checked);
    assert(await ps.evaluate(() => JSON.parse(localStorage.getItem("ef-verrou")).delai === 300), "le délai choisi avant l'activation est conservé");
    assert(await ps.isHidden("#verrou"), "pas verrouillé juste après l'activation");
    /* Ouverture à froid : verrouillée, rien de lisible derrière. */
    await ps.evaluate(() => sessionStorage.removeItem("ef-verrou-ouvert"));
    await ps.reload();
    await ps.waitForSelector("#verrou[open]");
    assert(await ps.evaluate(() => getComputedStyle(document.querySelector(".app")).visibility === "hidden" && document.querySelector(".app").hasAttribute("inert")), "Orbite cachée et inerte derrière le verrou");
    await ps.screenshot({ path: path.join(CAPTURES, "securite-verrou.png") });
    /* Une fenêtre qui s'ouvre pendant le verrou (« Quoi de neuf ») reste dessous. */
    await ps.evaluate(() => document.getElementById("dlg-nouveautes").showModal());
    await ps.waitForTimeout(200);
    assert(await ps.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest("#verrou")), "l'écran verrouillé reste au premier plan");
    await ps.click("#verrou-ouvrir");
    await ps.waitForSelector("#verrou:not([open])", { state: "attached" });
    await ps.evaluate(() => document.getElementById("dlg-nouveautes").close());
    /* Retour d'arrière-plan après le délai (ici : immédiat). */
    await ps.selectOption("#verrou-delai", "0");
    await ps.evaluate(() => {
      const etat = (v) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); document.dispatchEvent(new Event("visibilitychange")); };
      etat("hidden"); etat("visible");
    });
    await ps.waitForSelector("#verrou[open]");
    await ps.click("#verrou-ouvrir");
    await ps.waitForSelector("#verrou:not([open])", { state: "attached" });
    /* « Utiliser mon mot de passe » : déconnexion de cet appareil, page de connexion. */
    await ps.evaluate(() => window.OrbiteVerrou.verrouiller());
    await ps.click("#verrou-mdp");
    await ps.waitForURL(/connexion\.html/);
    assert(!(await ps.evaluate(() => Object.keys(localStorage).some((k) => /auth-token|ef-session|sb-/.test(k)))), "session de l'appareil fermée");
    refusAttendus = false;
    await cs.close();
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
