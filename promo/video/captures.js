/* Captures haute définition de l'application Orbite (thème sombre, profil de démonstration). */
const RACINE = "/home/user/espace-finances-tn";
const { chromium } = require("/home/user/portail-rh/node_modules/playwright-core");
const { demarrer } = require(RACINE + "/e2e/serveur.js");
const Faux = require(RACINE + "/e2e/faux-supabase.js");
const SUPABASE = "https://txrwgqgnqdkipwtwpevl.supabase.co";
const OUT = __dirname + "/captures/";
const PROFIL = { prenom: "Sami", montant: 3200, sens: "brut", nombreSalaires: 13, situation: "marie", chefDeFamille: true, enfants: 1, anneeNaissance: 1990, baseBanque: "brut",
  epargneDisponible: 9000, loyer: 550, chargesFixes: 400,
  credits: [{ type: "auto", libelle: "Crédit auto", tauxPct: 9, mensualite: 520, moisRestants: 30 }],
  contrats: [{ type: "av", libelle: "Assurance vie", anneeDebut: 2023, moisDebut: 1, versementMensuel: 150 }] };
const REPONSE = "Ey, najjem ! **Men avril 2029**, ki ykammel crédit el karhba :\n- mensualité possible : **1 387 DT**\n- karhba jusqu'à **86 187 DT** 3la 7 snin\n- endettement taht 40 %";

async function session(nav, base, faux, mobile) {
  const ctx = await nav.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 3 : 1.5,
    locale: "fr-FR", colorScheme: "dark", isMobile: mobile, hasTouch: mobile, bypassCSP: true });
  await ctx.route(SUPABASE + "/**", (r) => faux.gerer(r));
  await ctx.route(SUPABASE + "/functions/v1/assistant", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ reponse: REPONSE, restantes: 29 }) }));
  await ctx.route("https://api.pwnedpasswords.com/**", (r) => r.fulfill({ status: 200, body: "", headers: { "Access-Control-Allow-Origin": "*" } }));
  const p = await ctx.newPage();
  const email = (mobile ? "m" : "d") + "@demo.tn";
  await p.goto(base + "/connexion.html?mode=inscription");
  await p.fill("#nom", "Sami"); await p.fill("#email", email); await p.fill("#mdp", "Demo-Orbite-2026!"); await p.fill("#mdp2", "Demo-Orbite-2026!");
  await p.check("#cgu").catch(() => {}); await p.click("#envoyer");
  await p.waitForURL(/\/espace\//);
  await p.waitForFunction(() => window.Orbite && window.Orbite.pret);
  await p.evaluate((pr) => window.Orbite.majProfil(pr, { immediat: true }), PROFIL);
  await p.addStyleTag({ content: ".toasts,.pastille-acces{display:none!important} *{caret-color:transparent!important}" });
  return { ctx, p };
}
const pause = (p, ms) => p.waitForTimeout(ms);

(async () => {
  const serveur = await demarrer(0), base = "http://127.0.0.1:" + serveur.address().port, faux = Faux.creer();
  const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const mobile of [true, false]) {
    const k = mobile ? "m" : "d", { ctx, p } = await session(nav, base, faux, mobile);
    await p.goto(base + "/espace/#orbite"); await pause(p, 2500);
    await p.screenshot({ path: OUT + k + "-orbite.png" });
    await p.locator("#cap-paliers").scrollIntoViewIfNeeded(); await pause(p, 600);
    await p.locator("#cap-paliers").screenshot({ path: OUT + k + "-marge.png" });
    await p.locator("[aria-labelledby=titre-capacite]").screenshot({ path: OUT + k + "-capacite.png" });
    await p.locator("#sante").scrollIntoViewIfNeeded(); await pause(p, 1200);
    await p.locator("#sante").screenshot({ path: OUT + k + "-sante.png" });
    await p.goto(base + "/espace/#vie"); await pause(p, 700);
    await p.click('[data-ajout="mariage"]'); await p.click('[data-ajout="naissance"]'); await p.click('[data-ajout="immobilier"]'); await pause(p, 900);
    await p.locator("#vie-resultat").screenshot({ path: OUT + k + "-vie.png" });
    await p.click("#vie-tab-fiscal"); await pause(p, 700);
    await p.locator("#vie-panneau-fiscal .fiscal").first().screenshot({ path: OUT + k + "-fiscal.png" });
    await p.goto(base + "/espace/#assistant"); await pause(p, 600);
    await p.fill("#assistant-question", "Najjem nechri karhba fi 2029 ?"); await p.press("#assistant-question", "Enter");
    await p.waitForSelector(".assistant__msg--ia strong"); await pause(p, 900);
    await p.locator(".assistant").screenshot({ path: OUT + k + "-assistant.png" });
    await p.goto(base + "/espace/#abonnement"); await pause(p, 2200);
    await p.locator("#ab-form").screenshot({ path: OUT + k + "-offres.png" });
    await ctx.close();
  }
  await nav.close(); serveur.close();
  console.log("captures terminées");
})().catch((e) => { console.error(e); process.exit(1); });
