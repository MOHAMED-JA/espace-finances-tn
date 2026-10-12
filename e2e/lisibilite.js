/*
 * Audit de lisibilité d'Orbite : contraste de chaque texte visible, vue par vue, en thème clair puis sombre.
 * Profil fictif (« Aziz Démo »), faux Supabase. Seuils WCAG AA : 4,5 pour le texte courant, 3 pour le grand texte
 * (24 px, ou 18,66 px en gras) ; les boutons désactivés et les textes décoratifs (aria-hidden) sont exclus, comme le prévoit la norme.
 * Usage : node e2e/lisibilite.js  (PLAYWRIGHT_CORE, CHROMIUM ; VUES=orbite,salaire pour restreindre ; JSON=chemin pour le détail)
 */
"use strict";
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const { demarrer } = require("./serveur.js");
const Faux = require("./faux-supabase.js");
const VERSION_ACCORD = require("../public/commun/consentement.js").VERSION;
const SUPABASE = "https://txrwgqgnqdkipwtwpevl.supabase.co";

const ADRESSES = (process.env.VUES ? process.env.VUES.split(",") : [
  "orbite", "profil", "salaire", "epargne", "credit", "simulations", "vie", "vie?onglet=scenarios", "progression", "progression?onglet=retraite",
  "assistant", "abonnement", "compte", "compte?onglet=preferences", "compte?onglet=donnees", "admin"
]);
const FENETRES = [
  { nom: "palette", ouvrir: (p) => p.keyboard.press("Control+k"), sel: "#dlg-palette" },
  { nom: "applications", ouvrir: (p) => p.click("#apps-ouvrir"), sel: "#dlg-apps" },
  { nom: "négociation", ouvrir: (p) => p.evaluate(() => window.Orbite.ouvrirNegociation && window.Orbite.ouvrirNegociation()), sel: "#dlg-nego" },
  { nom: "partage", ouvrir: (p) => p.evaluate(() => document.getElementById("dlg-partage").showModal()), sel: "#dlg-partage" }
];

/* Exécuté dans la page : liste des textes sous le seuil. */
function auditer(racineSel) {
  function rgba(c) {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
  }
  function srgb(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b); }
  function melange(haut, bas) { const a = haut.a; return { r: haut.r * a + bas.r * (1 - a), g: haut.g * a + bas.g * (1 - a), b: haut.b * a + bas.b * (1 - a), a: 1 }; }
  /* Fond effectif : couches de couleur de fond des ancêtres, de la plus proche à la page. Dégradé ou image : incertain. */
  function fond(el) {
    const couches = []; let incertain = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none" && !/url\(/.test(s.backgroundImage) && couches.every((c) => c.a < 1)) incertain = true;
      const c = rgba(s.backgroundColor);
      if (c && c.a > 0) { couches.push(c); if (c.a >= 1) break; }
      if (e.tagName === "CANVAS" || e.tagName === "IMG" || e.tagName === "VIDEO") incertain = true;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const racine = rgba(getComputedStyle(document.body).backgroundColor);
    if (racine && racine.a >= 1) base = racine;
    for (let i = couches.length - 1; i >= 0; i--) base = melange(couches[i], base);
    return { c: base, incertain };
  }
  function opaciteCumulee(el) { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }
  function chemin(el) {
    const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) {
      p.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.classList.length ? "." + [...e.classList].slice(0, 2).join(".") : ""));
      if (e.id) break;
    }
    return p.join(" > ");
  }
  const racine = document.querySelector(racineSel) || document.body, resultats = [], vus = new Set();
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    const el = n.parentElement;
    if (!el || vus.has(el)) continue;
    vus.add(el);
    if (el.closest("[aria-hidden=true], [hidden], script, style, noscript, template, .cache, .visite")) continue;
    if (el.closest("button:disabled, input:disabled, [aria-disabled=true], fieldset:disabled")) continue;
    if (!el.closest("dialog[open]") && document.querySelector("dialog[open]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !el.getClientRects().length) continue;
    const s = getComputedStyle(el);
    if (s.visibility !== "visible" || Number(s.opacity) === 0) continue;
    const op = opaciteCumulee(el); if (op < 0.05) continue;
    const coul = rgba(s.color); if (!coul) continue;
    const f = fond(el);
    /* Onglets et bascules : la pastille glisse sous le texte actif (élément frère), le fond réel n'est pas un ancêtre. */
    if (el.closest('[role="tablist"], [role="radiogroup"], .bascule, .pg-onglets')) f.incertain = true;
    const texte = melange({ ...coul, a: coul.a * op }, f.c);
    const l1 = lum(texte), l2 = lum(f.c), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const taille = parseFloat(s.fontSize), gras = Number(s.fontWeight) >= 700, grand = taille >= 24 || (gras && taille >= 18.66);
    const seuil = grand ? 3 : 4.5;
    if (ratio < seuil) resultats.push({ ou: chemin(el), texte: n.nodeValue.trim().slice(0, 50), ratio: Math.round(ratio * 100) / 100, seuil, incertain: f.incertain,
      couleur: s.color, fond: "rgb(" + [f.c.r, f.c.g, f.c.b].map(Math.round).join(",") + ")", taille });
  }
  return resultats;
}

(async () => {
  const serveur = await demarrer(0);
  const base = "http://127.0.0.1:" + serveur.address().port;
  const faux = Faux.creer();
  const profil = { prenom: "Aziz", nom: "Démo", dateNaissance: "1990-05-14", dateEmbauche: "2018-03-01", montant: 2500, sens: "brut", periode: "mois",
    situation: "marie", chefDeFamille: true, enfants: 2, secteur: "prive", nombreSalaires: 12, loyer: 450, chargesFixes: 300, epargneDisponible: 6000,
    credits: [{ libelle: "Voiture", mensualite: 320, capitalRestant: 9000, taux: 9.5 }], contrats: [{ type: "assurance-vie", versementMensuel: 150 }] };
  faux.ajouterCompte("demo@exemple.tn", "Demo-compte-2026!", { full_name: "Aziz Démo", orbite_consentement: VERSION_ACCORD, orbite: profil,
    orbite_visite: "2026-10-01T00:00:00Z", orbite_visite_nouveautes: "2026-10-11", orbite_partage_demande: "2026-10-01T00:00:00Z" });
  faux.marquerAdmin("demo@exemple.tn");
  faux.marquerTesteur("demo@exemple.tn");
  const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium/chrome-linux/chrome" });
  const detail = {}, resume = [];
  for (const theme of ["light", "dark"]) {
    const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 900 }, locale: "fr-FR", colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("ef-theme", t); } catch (e) {} }, theme);
    await ctx.route(SUPABASE + "/**", (r) => faux.gerer(r));
    await ctx.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('x')},50);return 1},reset:function(){}};" }));
    await ctx.route("https://mohamed-ja.github.io/**", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>stub</title>" }));
    const page = await ctx.newPage();
    await page.goto(base + "/connexion.html");
    await page.fill("#email", "demo@exemple.tn");
    await page.fill("#mdp", "Demo-compte-2026!");
    await page.click("#envoyer");
    await page.waitForURL(/\/espace\//);
    await page.waitForFunction(() => window.Orbite && window.Orbite.pret);
    /* « Quoi de neuf » éventuel : refermé, l'audit porte sur l'application. */
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
    for (const a of ADRESSES) {
      await page.evaluate((h) => { location.hash = h; }, a);
      await page.waitForTimeout(900);
      const l = await page.evaluate(auditer, "main");
      if (process.env.CAPTURES_LISIBILITE) await page.screenshot({ path: require("node:path").join(process.env.CAPTURES_LISIBILITE, theme + "-" + a.replace(/\W+/g, "-") + ".png"), fullPage: true });
      detail[theme + " " + a] = l;
      resume.push([theme, a, l.length, l.filter((x) => !x.incertain).length]);
    }
    /* Barre latérale et barre du haut, une fois. */
    const rail = await page.evaluate(auditer, ".rail"); detail[theme + " rail"] = rail; resume.push([theme, "rail", rail.length, rail.filter((x) => !x.incertain).length]);
    const barre = await page.evaluate(auditer, ".barre"); detail[theme + " barre"] = barre; resume.push([theme, "barre", barre.length, barre.filter((x) => !x.incertain).length]);
    for (const f of FENETRES) {
      await page.evaluate(() => { location.hash = "salaire"; });
      await page.waitForTimeout(500);
      try { await f.ouvrir(page); await page.waitForSelector(f.sel + "[open]", { timeout: 3000 }); await page.waitForTimeout(400); }
      catch (e) { resume.push([theme, "fenêtre " + f.nom, "non ouverte"]); continue; }
      const l = await page.evaluate(auditer, f.sel);
      detail[theme + " fenêtre " + f.nom] = l; resume.push([theme, "fenêtre " + f.nom, l.length, l.filter((x) => !x.incertain).length]);
      await page.keyboard.press("Escape"); await page.waitForTimeout(200);
      await page.evaluate((s) => { const d = document.querySelector(s); if (d && d.open) d.close(); }, f.sel);
    }
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(detail, null, 1));
  let total = 0;
  resume.forEach((r) => { console.log(r.join(" | ")); if (typeof r[3] === "number") total += r[3]; });
  /* Détail des textes sûrs (fond uni) sous le seuil, regroupés par élément. */
  const groupes = new Map();
  Object.entries(detail).forEach(([ou, l]) => l.filter((x) => !x.incertain).forEach((x) => {
    const k = ou.split(" ")[0] + " · " + x.ou.replace(/#[\w-]+/g, (m) => m) + " · " + x.couleur + " sur " + x.fond;
    const g = groupes.get(k) || { n: 0, ratio: x.ratio, seuil: x.seuil, ex: x.texte, vues: new Set() };
    g.n++; g.vues.add(ou.split(" ").slice(1).join(" ")); groupes.set(k, g);
  }));
  console.log("\n" + total + " textes sous le seuil (fond uni), " + groupes.size + " éléments distincts :");
  [...groupes.entries()].sort((a, b) => a[1].ratio - b[1].ratio).forEach(([k, g]) => console.log("  " + g.ratio + " < " + g.seuil + "  " + k + "  « " + g.ex + " » (" + [...g.vues].slice(0, 3).join(", ") + ")"));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
