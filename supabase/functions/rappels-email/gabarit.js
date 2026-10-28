/*
 * Orbite — rappels par email : sélection et mise en page (module pur, testé sous Node).
 * - nettoyerPlan(plan) : ne garde que des rappels bien formés (le plan vient du navigateur : rien n'est cru sur parole).
 * - aEnvoyer(plan, envoyes, maintenant, acces) : rappels du jour, jamais envoyés, cohérents avec l'abonnement actuel.
 * - email(...) / confirmation(...) : objet, aperçu, HTML (styles en ligne, tableaux) et texte brut.
 * Les textes sont SANS MONTANT (choix validé) : ils sont écrits par rappels-calcul.js (champ mail).
 * Tout texte est échappé ; les liens ne mènent qu'à Orbite (adresse de l'application + ancre vérifiée).
 */

export const LIMITES = { rappels: 40, parEmail: 6, texte: 300, titre: 120, etiquette: 80, bouton: 40 };
/* Doit contenir TOUS les types écrits par public/espace/js/rappels-calcul.js : un type absent est écarté sans bruit
   (le rappel de versement d'épargne n'est jamais parti avant le 16 oct. 2026). Le test « types » le vérifie. */
export const TYPES = ["essai", "abonnement", "credit", "reduction", "versement", "perso", "fiscal", "placement", "assurance", "proche", "obligation"];
const URL_INTERNE = /^\/espace\/#[a-z]+(\?[a-z0-9=&._-]*)?$/i;
const ID = /^[a-z0-9_-]{1,80}$/i;
const COULEURS = { essai: "#0A0D14", abonnement: "#0A0D14", credit: "#1F45C7", reduction: "#1F45C7", versement: "#067647", perso: "#067647", fiscal: "#5925DC", placement: "#B54708", assurance: "#1F45C7", proche: "#067647", obligation: "#B54708" };
const POLICE = "'Mona Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace";
const JOUR = 86400000;

export function echapper(t) {
  return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function texte(v, max) {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function date(v) { const t = typeof v === "string" ? Date.parse(v) : NaN; return isFinite(t) ? t : null; }

export function nettoyerPlan(plan) {
  if (!Array.isArray(plan)) return [];
  const out = [], vus = new Set();
  for (const r of plan.slice(0, LIMITES.rappels)) {
    if (!r || typeof r !== "object") continue;
    const id = typeof r.id === "string" && ID.test(r.id) ? r.id : null;
    const quand = date(r.quand), jusqua = r.jusqua == null ? null : date(r.jusqua);
    const titre = texte(r.titre, LIMITES.titre);
    if (!id || vus.has(id) || !TYPES.includes(r.type) || quand == null || (r.jusqua != null && jusqua == null) || !titre) continue;
    vus.add(id);
    out.push({
      id, type: r.type, quand, jusqua, titre,
      url: typeof r.url === "string" && URL_INTERNE.test(r.url) ? r.url : "/espace/#orbite",
      etiquette: texte(r.etiquette, LIMITES.etiquette), corps: texte(r.corps, LIMITES.texte),
      conseil: texte(r.conseil, LIMITES.texte), bouton: texte(r.bouton, LIMITES.bouton) || "Ouvrir Orbite"
    });
  }
  return out;
}

/* acces : { etat, essai_fin, fin } lus par le serveur au moment de l'envoi. */
export function aEnvoyer(plan, envoyes, maintenant, acces) {
  const t = (maintenant instanceof Date ? maintenant : new Date(maintenant || Date.now())).getTime();
  const deja = new Set(Array.isArray(envoyes) ? envoyes : []), a = acces || {};
  const jourDe = (v) => (typeof v === "string" ? v.slice(0, 10) : "");
  return nettoyerPlan(plan).filter((r) => {
    if (deja.has(r.id) || r.quand > t) return false;
    /* Sans date de fin : 45 jours au plus après la date prévue. */
    if ((r.jusqua != null ? r.jusqua : r.quand + 45 * JOUR) < t) return false;
    /* Abonnement : le rappel doit correspondre à l'état réel du compte (un essai payé entre-temps ne se rappelle pas). */
    if (r.type === "essai") return a.etat === "essai" && r.id === "essai-" + jourDe(a.essai_fin);
    if (r.type === "abonnement") return a.etat === "actif" && r.id === "abonnement-" + jourDe(a.fin);
    return true;
  }).sort((x, y) => x.quand - y.quand).slice(0, LIMITES.parEmail);
}

const NOMBRES = ["", "Une", "Deux", "Trois", "Quatre", "Cinq", "Six"];
function prenomDe(p) { return texte(p, 40); }

function bouton(lien, libelle, couleur) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${couleur};">` +
    `<a href="${echapper(lien)}" style="display:inline-block;padding:11px 18px;font-family:${POLICE};font-size:14px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;border-radius:10px;">${echapper(libelle)}</a></td></tr></table>`;
}
function cadre(apercu, contenu, pied) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Orbite</title></head>` +
    `<body style="margin:0;padding:0;background:#F3F4F8;-webkit-text-size-adjust:100%;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F3F4F8;">${echapper(apercu)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F8;"><tr><td align="center" style="padding:24px 12px 32px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">` +
    `<tr><td style="padding:2px 6px 16px;font-family:${POLICE};font-size:17px;font-weight:700;letter-spacing:-0.3px;color:#0A0D14;">` +
    `<span style="display:inline-block;width:18px;height:18px;border:2px solid #0A0D14;border-radius:50%;vertical-align:-5px;"></span>` +
    `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#1F45C7;vertical-align:9px;margin-left:-7px;margin-right:10px;"></span>Orbite</td></tr>` +
    `<tr><td style="background:#ffffff;border-radius:18px;padding:26px 22px;">${contenu}</td></tr>` +
    `<tr><td align="center" style="padding:18px 10px 0;font-family:${POLICE};font-size:12px;line-height:19px;color:#5E6577;">${pied}</td></tr>` +
    `</table></td></tr></table></body></html>`;
}

/* { prenom, rappels (sortie d'aEnvoyer), urlApp, urlDesinscription } */
export function email(o) {
  const prenom = prenomDe(o.prenom), rs = o.rappels || [], n = rs.length, app = String(o.urlApp || "").replace(/\/+$/, "");
  if (!n) return null;
  const objet = (prenom ? prenom + ", " : "") + (n === 1 ? "un rappel" : n + " rappels") + " pour vos finances";
  const apercu = rs.slice(0, 2).map((r) => r.titre).join(" · ");
  const intro = n === 1 ? "Une chose mérite votre attention. Deux minutes suffisent."
    : (NOMBRES[n] || String(n)) + " choses méritent votre attention. Deux minutes suffisent pour chacune.";
  const cartes = rs.map((r, i) => {
    const c = COULEURS[r.type] || "#0A0D14", lien = app + r.url;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E5EC;border-radius:14px;${i ? "margin-top:14px;" : ""}"><tr><td style="padding:18px 18px 16px;font-family:${POLICE};">` +
      (r.etiquette ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:${c};"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:7px;vertical-align:1px;"></span>${echapper(r.etiquette)}</div>` : "") +
      `<div style="font-size:17px;font-weight:700;line-height:22px;color:#0A0D14;margin:8px 0 6px;">${echapper(r.titre)}</div>` +
      (r.corps ? `<div style="font-size:14.5px;line-height:22px;color:#3F4555;margin:0 0 12px;">${echapper(r.corps)}</div>` : "") +
      (r.conseil ? `<div style="background:#F6F7FA;border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:20px;color:#3F4555;margin:0 0 14px;"><b style="color:#0A0D14;">Notre conseil :</b> ${echapper(r.conseil)}</div>` : "") +
      bouton(lien, r.bouton, c) + `</td></tr></table>`;
  }).join("");
  const contenu = `<div style="font-family:${POLICE};font-size:22px;font-weight:700;letter-spacing:-0.5px;line-height:28px;color:#0A0D14;margin:0 0 6px;">Bonjour${prenom ? " " + echapper(prenom) : ""},</div>` +
    `<div style="font-family:${POLICE};font-size:15px;line-height:23px;color:#3F4555;margin:0 0 22px;">${intro}</div>` + cartes +
    `<div style="font-family:${POLICE};font-size:15px;line-height:23px;color:#3F4555;margin:22px 0 0;">Bonne journée,<br><b style="color:#0A0D14;">Orbite</b></div>` +
    `<div style="font-family:${POLICE};font-size:12px;line-height:18px;color:#5E6577;margin:14px 0 0;">Estimations faites à partir de votre profil Orbite. Elles ne remplacent pas l'avis de votre banque ou de votre conseiller fiscal.</div>`;
  const pied = `Vous recevez cet email parce que vous avez activé « Rappels par email » dans Mon profil.<br>` +
    `<a href="${echapper(o.urlDesinscription)}" style="color:#3F4555;font-weight:600;">Se désinscrire en un clic</a> · ` +
    `<a href="${echapper(app + "/espace/#profil?section=identite")}" style="color:#3F4555;font-weight:600;">Gérer mes rappels</a>`;
  const brut = [`Bonjour${prenom ? " " + prenom : ""},`, "", intro, ""].concat(rs.map((r) =>
    [(r.etiquette ? r.etiquette.toUpperCase() + "\n" : "") + r.titre, r.corps, r.conseil ? "Notre conseil : " + r.conseil : "", r.bouton + " : " + app + r.url].filter(Boolean).join("\n") + "\n"
  )).concat(["Bonne journée,", "Orbite", "", "Se désinscrire en un clic : " + o.urlDesinscription]).join("\n");
  return { objet, apercu, html: cadre(apercu, contenu, pied), texte: brut };
}

/* { prenom, adresse, urlConfirmer } : demande de confirmation d'une adresse de contact différente de celle de connexion. */
export function confirmation(o) {
  const prenom = prenomDe(o.prenom);
  const objet = "Confirmez votre adresse pour les rappels d'Orbite";
  const apercu = "Un clic suffit. Si ce n'est pas vous, ignorez cet email : vous ne recevrez rien d'autre.";
  const contenu = `<div style="font-family:${POLICE};font-size:22px;font-weight:700;letter-spacing:-0.5px;line-height:28px;color:#0A0D14;margin:0 0 6px;">Bonjour${prenom ? " " + echapper(prenom) : ""},</div>` +
    `<div style="font-family:${POLICE};font-size:15px;line-height:23px;color:#3F4555;margin:0 0 18px;">Vous avez demandé à recevoir vos rappels Orbite à l'adresse <span style="font-family:${MONO};font-size:13.5px;background:#F0F2F6;border-radius:6px;padding:1px 6px;color:#0A0D14;">${echapper(o.adresse)}</span>. Confirmez-la en un clic : le lien reste valable 7 jours.</div>` +
    bouton(o.urlConfirmer, "Confirmer mon adresse", "#1F45C7") +
    `<div style="font-family:${POLICE};font-size:13px;line-height:20px;color:#5E6577;margin:18px 0 0;">Si ce n'est pas vous, ignorez simplement cet email : aucun rappel ne sera envoyé à cette adresse.</div>`;
  const pied = "Orbite · vos finances, en clair.";
  const brut = [`Bonjour${prenom ? " " + prenom : ""},`, "", "Vous avez demandé à recevoir vos rappels Orbite à l'adresse " + o.adresse + ".",
    "Confirmez-la en un clic (lien valable 7 jours) :", o.urlConfirmer, "", "Si ce n'est pas vous, ignorez simplement cet email.", "", "Orbite"].join("\n");
  return { objet, apercu, html: cadre(apercu, contenu, pied), texte: brut };
}

/* Adresse d'envoi : celle de connexion (déjà vérifiée), ou l'adresse de contact une fois confirmée.
   d : { email, contact, adresse_confirmee }. Renvoie { envoyer, aConfirmer }. */
export function adresses(d) {
  const connexion = String(d.email || "").trim().toLowerCase();
  const contact = String(d.contact || "").trim().toLowerCase();
  if (!contact || contact === connexion) return { envoyer: connexion || null, aConfirmer: null };
  if (contact === String(d.adresse_confirmee || "").toLowerCase()) return { envoyer: contact, aConfirmer: null };
  return { envoyer: null, aConfirmer: contact };
}
