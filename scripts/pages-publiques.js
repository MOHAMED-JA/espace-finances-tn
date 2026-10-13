#!/usr/bin/env node
/*
 * Orbite — génère les pages publiques (salaire net, capacité de crédit, impôt, retraite, simulateur de crédit,
 * simulateur d'assurance vie, calcul du CEA, règle des 8 %, remboursement anticipé, regroupement de crédits, coût employeur)
 * dans public/.
 * Tous les chiffres viennent des moteurs (public/commun/pages-calcul.js) : le HTML contient donc des valeurs justes même
 * sans JavaScript (ce que lisent les moteurs de recherche), puis le navigateur les recalcule à chaque saisie.
 *
 * Usage : node scripts/pages-publiques.js            (réécrit les pages)
 *         node scripts/pages-publiques.js --verifier (code 1 si une page n'est plus à jour)
 * À relancer après une loi de finances (barèmes) ou un changement de texte, en avançant DATE_PAGES.
 * Le test tests/espace/pages-publiques-html.test.js échoue tant que les pages ne correspondent pas au générateur.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const C = require("../public/commun/pages-calcul.js");
const P = require("../public/moteurs/salaire/parametres.js");
const RT = require("../public/espace/js/retraite-calcul.js");
const B = require("../public/moteurs/vie/baremes.js");
const OC = require("../public/espace/js/orbite-calcul.js");
const CPJ_IRA = require("../public/moteurs/credit/projets.js").IRA_PCT;

/* Date des chiffres écrits dans le HTML (âges d'exemple, jours restants, année de départ). */
const DATE_PAGES = new Date(2026, 9, 12);
const SITE = "https://espace-finances-tn.jaouadimohamedaziz.workers.dev";
const LINKEDIN = "https://www.linkedin.com/in/mohamed-aziz-jaouadi-%D9%85%D8%AD%D9%85%D8%AF-%D8%B9%D8%B2%D9%8A%D8%B2-%D8%A7%D9%84%D8%AC%D9%88%D8%A7%D8%AF%D9%8A-%C2%AEpsm-i-%C2%AEpspo-l-%C2%AEistqb-851009115/";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const m = DATE_PAGES, A = m.getFullYear(), DATE_TXT = m.getDate() + (m.getDate() === 1 ? "er" : "") + " " + MOIS[m.getMonth()] + " " + A, DATE_ISO = m.toISOString().slice(0, 10);
const N = C.nombre, DT = C.dt, PCT = C.pct;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sansBalises = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const PAGES = [
  { cle: "salaire", slug: "salaire-net-tunisie", voisin: "Calcul du salaire net", voisinTxt: "Du brut au net, au millime" },
  { cle: "pret", slug: "simulateur-credit-tunisie", voisin: "Simulateur de crédit", voisinTxt: "Mensualité et coût total" },
  { cle: "credit", slug: "capacite-credit-tunisie", voisin: "Capacité de crédit", voisinTxt: "Combien la banque peut vous prêter" },
  { cle: "vie", slug: "simulateur-assurance-vie-tunisie", voisin: "Simulateur d'assurance vie", voisinTxt: "Capital estimé et impôt économisé" },
  { cle: "cea", slug: "calcul-cea-tunisie", voisin: "Calcul du CEA", voisinTxt: "L'impôt que fait gagner un CEA" },
  { cle: "impot", slug: "impot-assurance-vie-cea", voisin: "Impôt, assurance vie et CEA", voisinTxt: "L'impôt que vous pouvez économiser" },
  { cle: "retraite", slug: "retraite-cnss-cnrps", voisin: "Retraite CNSS ou CNRPS", voisinTxt: "À quel âge, pour quelle pension" },
  { cle: "regle8", slug: "regle-8-pourcent-credit-tunisie", voisin: "Règle des 8 %", voisinTxt: "Quand votre taux est divisé par deux" },
  { cle: "anticipe", slug: "remboursement-anticipe-credit-tunisie", voisin: "Remboursement anticipé", voisinTxt: "Durée plus courte ou mensualité plus basse" },
  { cle: "regroupement", slug: "regroupement-credits-tunisie", voisin: "Regroupement de crédits", voisinTxt: "Moins par mois, mais à quel prix" },
  { cle: "employeur", slug: "cout-employeur-tunisie", voisin: "Coût employeur", voisinTxt: "Du brut au coût total d'un salarié" }
];
/* Menu : 5 entrées ; une entrée est « en cours » sur ses pages (capacité, règle des 8 %, remboursement anticipé et regroupement
   relèvent du crédit, le coût employeur du salaire, l'impôt de l'assurance vie). */
const NAV = [
  { slug: "salaire-net-tunisie", nav: "Salaire net", pages: ["salaire", "employeur"] },
  { slug: "simulateur-credit-tunisie", nav: "Crédit", pages: ["pret", "credit", "regle8", "anticipe", "regroupement"] },
  { slug: "simulateur-assurance-vie-tunisie", nav: "Assurance vie", pages: ["vie", "impot"] },
  { slug: "calcul-cea-tunisie", nav: "CEA", pages: ["cea"] },
  { slug: "retraite-cnss-cnrps", nav: "Retraite", pages: ["retraite"] }
];

/* ---------- Morceaux communs ---------- */
function v(aff, cle) { return `<span data-v="${cle}">${esc(aff[cle])}</span>`; }
function grand(aff, cle) { return `<span class="grand" aria-live="polite"><span data-v="${cle}_ent">${esc(aff[cle + "_ent"])}</span><small data-v="${cle}_dec">${esc(aff[cle + "_dec"])}</small></span>`; }

function tete(pg, d) {
  const url = `${SITE}/${pg.slug}`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": url + "#page", url, name: d.titre, description: d.description, inLanguage: "fr", dateModified: DATE_ISO,
      isPartOf: { "@id": SITE + "/#site" }, about: d.sujet, author: { "@id": SITE + "/#auteur" } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Orbite", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: d.ariane, item: url } ] },
    { "@type": "FAQPage", mainEntity: d.faq.map((q) => ({ "@type": "Question", name: sansBalises(q[0]), acceptedAnswer: { "@type": "Answer", text: sansBalises(q[1]) } })) },
    { "@type": "WebSite", "@id": SITE + "/#site", name: "Orbite", url: SITE + "/" },
    { "@type": "Person", "@id": SITE + "/#auteur", name: "Mohamed Aziz Jaouadi", sameAs: [LINKEDIN] }
  ] };
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
  <!-- Page générée par scripts/pages-publiques.js : ne pas modifier à la main, modifier le générateur puis le relancer. -->
  <title>${esc(d.titre)}</title>
  <meta name="description" content="${esc(d.description)}">
  <link rel="canonical" href="${url}">
  <meta name="author" content="Mohamed Aziz Jaouadi">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Orbite">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(d.titre)}">
  <meta property="og:description" content="${esc(d.description)}">
  <meta property="og:image" content="${SITE}/orbite/og-orbite.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="627">
  <meta property="og:image:alt" content="Orbite : votre salaire au centre, tout le reste en orbite.">
  <meta name="twitter:card" content="summary_large_image">
  <!-- Données structurées (lues par les moteurs de recherche, jamais exécutées). -->
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}
  </script>
  <meta name="theme-color" content="#F3F4F8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#07090F" media="(prefers-color-scheme: dark)">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="icon" href="/orbite/icone.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/orbite/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/orbite/polices/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/orbite/polices/mona-sans-latin-standard-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/orbite/orbite.css">
  <link rel="stylesheet" href="/orbite/signature.css">
  <link rel="stylesheet" href="/commun/pages.css">
  <script src="/commun/config.js"></script>
  <script src="/commun/theme-init.js"></script>
</head>
<body class="page--${pg.cle}" data-page="${pg.cle}">
  <a class="lien-evitement" href="#contenu">Aller au contenu</a>

  <header class="entete">
    <div class="conteneur entete__ligne">
      <div class="logo-bloc">
      <a class="logo logo--vivant" href="/" aria-label="Orbite, accueil">
        <svg class="logo__signe" viewBox="0 0 64 64" aria-hidden="true">
          <defs><linearGradient id="lg-a" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#12B76A"/><stop offset=".55" stop-color="#2F5BEA"/><stop offset="1" stop-color="#7A5AF8"/></linearGradient></defs>
          <rect width="64" height="64" rx="19" fill="#0A0D16"/>
          <g class="orb-b"><ellipse cx="32" cy="32" rx="21.5" ry="9" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.6" transform="rotate(34 32 32)"/><circle cx="44.3" cy="45" r="2.9" fill="#2F5BEA"/></g>
          <g class="orb-a"><ellipse cx="32" cy="32" rx="21.5" ry="9" fill="none" stroke="url(#lg-a)" stroke-width="2.6" transform="rotate(-30 32 32)"/><circle cx="13.6" cy="42.6" r="3.6" fill="#12B76A"/><circle cx="50.4" cy="21.4" r="3.6" fill="#7A5AF8"/></g>
          <circle cx="32" cy="32" r="6.6" fill="#fff"/>
        </svg>
        <span translate="no">Orbite</span>
        <span class="drapeau" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
      </a>
      <a class="signature" href="${LINKEDIN}?isSelfProfile=true" target="_blank" rel="noopener noreferrer" aria-label="Conçu par Mohamed Aziz Jaouadi : profil LinkedIn (nouvel onglet)"><span class="signature__mono" aria-hidden="true">MJ</span><span class="signature__txt"><span class="signature__pre">Conçu par</span><span class="signature__nom" translate="no">Mohamed Aziz Jaouadi</span></span><span class="signature__in"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4v-11Z"/></svg></span></a>
      </div>
      <nav class="pages-nav" aria-label="Calculs gratuits">
${NAV.map((n) => `        <a href="/${n.slug}"${n.pages.includes(pg.cle) ? (n.slug === pg.slug ? ' aria-current="page"' : ' aria-current="true"') : ""}>${n.nav}</a>`).join("\n")}
      </nav>
      <nav class="entete__actions" aria-label="Compte">
        <a class="bouton bouton--fantome bouton--petit" href="/connexion.html" data-si-deconnecte>Se connecter</a>
        <a class="bouton bouton--plein bouton--petit" href="/connexion.html?mode=inscription" data-si-deconnecte>Essayer gratuitement</a>
        <a class="bouton bouton--plein bouton--petit" href="/espace/" data-si-connecte hidden>Ouvrir mon orbite</a>
      </nav>
    </div>
  </header>
`;
}

const SAT = {
  salaire: ["Salaire", "sat_salaire"], credit: ["Crédit", "sat_credit"], impot: ["Impôt", "sat_impot"], retraite: ["Retraite", "sat_retraite"]
};
function pont(pg, aff, titre) {
  const autres = PAGES.filter((p) => SAT[p.cle] && p.cle !== pg.cle).map((p) => p.cle).slice(0, 3);
  return `
      <section class="pont" aria-labelledby="titre-pont">
        <h2 id="titre-pont">${titre}</h2>
        <ul class="satellites" role="list">
${autres.map((k) => `          <li class="sat sat--${k}"><span class="sat__nom"><i aria-hidden="true"></i>${SAT[k][0]}</span><span class="sat__val">${v(aff, SAT[k][1])}</span><p>${v(aff, SAT[k][1] + "_txt")}</p></li>`).join("\n")}
        </ul>
        <div class="pont__pied">
          <a class="bouton bouton--plein" href="/connexion.html?mode=inscription" data-si-deconnecte>Essayer gratuitement<svg aria-hidden="true"><use href="/orbite/icones.svg#fleche"/></svg></a>
          <a class="bouton bouton--plein" href="/espace/" data-si-connecte hidden>Ouvrir mon orbite<svg aria-hidden="true"><use href="/orbite/icones.svg#fleche"/></svg></a>
          <p data-si-deconnecte>3 jours d'essai gratuit, sans carte bancaire. Un seul profil pour tout calculer.</p>
        </div>
      </section>`;
}

/* Pont des nouvelles pages : ce qu'Orbite fait de plus (sans chiffre), puis l'inscription. */
function pontFonctions(titre, items) {
  return `
      <section class="pont" aria-labelledby="titre-pont">
        <h2 id="titre-pont">${titre}</h2>
        <ul class="satellites satellites--fonctions" role="list">
${items.map((x) => `          <li class="sat sat--${x[0]}"><span class="sat__nom"><i aria-hidden="true"></i>${x[1]}</span><p>${x[2]}</p></li>`).join("\n")}
        </ul>
        <div class="pont__pied">
          <a class="bouton bouton--plein" href="/connexion.html?mode=inscription" data-si-deconnecte>Essayer gratuitement<svg aria-hidden="true"><use href="/orbite/icones.svg#fleche"/></svg></a>
          <a class="bouton bouton--plein" href="/espace/" data-si-connecte hidden>Ouvrir mon orbite<svg aria-hidden="true"><use href="/orbite/icones.svg#fleche"/></svg></a>
          <p data-si-deconnecte>3 jours d'essai gratuit, sans carte bancaire. Un seul profil pour tout calculer.</p>
        </div>
      </section>`;
}

function faq(d) {
  return `
      <section class="faq" aria-labelledby="titre-faq">
        <h2 class="titre-section" id="titre-faq">Questions fréquentes</h2>
${d.faq.map((q, i) => `        <details${i === 0 ? " open" : ""}><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join("\n")}
      </section>`;
}

function fin(pg) {
  return `
      <nav aria-label="Autres calculs"><ul class="voisins" role="list">
${PAGES.filter((p) => p.cle !== pg.cle).map((p) => `        <li><a href="/${p.slug}"><b>${p.voisin}</b><span>${p.voisinTxt}</span></a></li>`).join("\n")}
      </ul></nav>
    </div>
  </main>

  <footer class="pied">
    <div class="conteneur pied__ligne">
      <p>Estimations indicatives fondées sur les textes en vigueur (barèmes ${P.annee}), mises à jour le ${DATE_TXT}. Elles ne remplacent ni votre bulletin de paie, ni l'offre de votre banque, ni le calcul de votre caisse de retraite.</p>
      <nav aria-label="Liens"><a href="/">Accueil</a><a href="/confidentialite.html">Confidentialité</a><a href="/cgv.html">CGV</a></nav>
    </div>
  </footer>

  <script src="/moteurs/salaire/parametres.js"></script>
  <script src="/moteurs/salaire/calcul.js"></script>
  <script src="/moteurs/salaire/etat.js"></script>
  <script src="/moteurs/vie/baremes.js"></script>
  <script src="/moteurs/vie/moteur-fiscal.js"></script>
  <script src="/moteurs/vie/projection.js"></script>
  <script src="/moteurs/vie/scenario.js"></script>
  <script src="/moteurs/salaire/pension.js"></script>
  <script src="/espace/js/orbite-calcul.js"></script>
  <script src="/espace/js/orbite-intelligence.js"></script>
  <script src="/espace/js/retraite-calcul.js"></script>
  <script src="/moteurs/credit/projets.js"></script>
  <script src="/commun/pages-calcul.js"></script>
  <script src="/commun/partage-lien.js"></script>
  <script src="/commun/pages-publiques.js"></script>
</body>
</html>
`;
}

function heros(pg, d, calc) {
  return `
  <main id="contenu">
    <div class="conteneur pp">
      <section class="heros" aria-labelledby="titre-page">
        <div class="heros__texte">
          <nav class="ariane" aria-label="Fil d'Ariane"><ol><li><a href="/">Orbite</a></li><li aria-current="page">${d.ariane}</li></ol></nav>
          <p class="surtitre">${d.surtitre}</p>
          <h1 id="titre-page">${d.h1}</h1>
          <p class="heros__chapo">${d.chapo}</p>
          <ul class="fiabilite" role="list"><li>Mis à jour le ${DATE_TXT}</li><li>${d.sourcesCourt}</li><li>Calcul sur votre appareil, rien n'est envoyé</li></ul>
        </div>
${calc}
      </section>`;
}

/* Champs réutilisés */
const champMontant = (id, lib, val) => `          <div class="champ">
            <label for="${id}">${lib}</label>
            <div class="saisie saisie--grande"><input id="${id}" name="montant" type="text" inputmode="decimal" autocomplete="off" value="${val}"><span class="saisie__unite">DT</span></div>
          </div>`;
const basculeSecteur = `            <div class="bascule" role="radiogroup" aria-label="Secteur">
              <label><input type="radio" name="secteur" value="prive" checked><span>Privé · CNSS</span></label>
              <label><input type="radio" name="secteur" value="public"><span>Public · CNRPS</span></label>
              <i class="bascule__pastille" aria-hidden="true"></i>
            </div>`;
const chef = `            <label class="interrupteur"><span>Chef de famille</span><input type="checkbox" name="chef" role="switch"><span class="interrupteur__piste" aria-hidden="true"></span></label>`;
const enfants = `            <div class="calc__compteur" data-seul-chef aria-disabled="true" title="Réservé au chef de famille"><span id="lib-enfants">Enfants</span><div class="compteur" role="group" aria-labelledby="lib-enfants"><button type="button" data-pas="-1" aria-label="Un enfant de moins" disabled><svg aria-hidden="true"><use href="/orbite/icones.svg#moins"/></svg></button><output name="enfants" aria-live="polite">0</output><button type="button" data-pas="1" aria-label="Un enfant de plus" disabled><svg aria-hidden="true"><use href="/orbite/icones.svg#plus"/></svg></button></div></div>`;
const tete_calc = (txt) => `          <div class="calc__tete"><span class="etiquette">Exemple</span><span>${txt}</span></div>`;
const noteCalc = `          <p class="calc__note">Estimation fondée sur les textes en vigueur. Le calcul se fait sur votre appareil : rien n'est envoyé ni enregistré.</p>`;

/* ---------- Page salaire ---------- */
function pageSalaire(pg) {
  const aff = C.affichage("salaire", { montant: 2500 }, m), s = C.salaire({ montant: 2500 }, m), pub = C.salaire({ montant: 2500, secteur: "public" }, m);
  const inv = C.salaire({ montant: 2000, sens: "net" }, m), D = P.irpp.deductions, fp = P.irpp.fraisProfessionnels;
  const cnss = P.regimes.prive.salarie, cnrps = P.regimes.public.salarie;
  const d = {
    titre: `Calcul salaire net Tunisie ${P.annee} : du brut au net — Orbite`,
    description: `Calculez votre salaire net en Tunisie à partir du brut (barèmes ${P.annee}) : cotisations CNSS ou CNRPS, impôt sur le revenu (IRPP) et CSS, selon votre situation de famille. Gratuit, sans compte.`,
    sujet: "Calcul du salaire net en Tunisie", ariane: "Salaire net en Tunisie",
    surtitre: `Barèmes ${P.annee} · privé CNSS et public CNRPS`,
    h1: `Calcul du salaire <em>net</em> en Tunisie`,
    chapo: "Du brut au net, au millime : cotisations sociales, impôt sur le revenu (IRPP) et contribution de solidarité, selon votre situation de famille.",
    sourcesCourt: "Sources : Code de l'IRPP, lois de finances",
    faq: [
      ["Quelle est la différence entre salaire brut et net en Tunisie&nbsp;?", `Le brut est le montant fixé par le contrat. Le net est ce que vous recevez après les cotisations sociales (CNSS ou CNRPS), l'impôt sur le revenu et la contribution sociale de solidarité. Pour 2&nbsp;500 DT brut par mois, un célibataire du secteur privé reçoit ${DT(s.net)} net.`],
      ["Le 13ᵉ mois change-t-il le calcul&nbsp;?", "L'impôt est calculé sur le revenu de toute l'année : un 13ᵉ mois ou une prime augmente ce revenu et peut faire passer une partie dans une tranche plus haute du barème. Orbite tient compte de 12 à 18 salaires par an et répartit l'impôt sur chaque versement."],
      ["Être chef de famille fait-il baisser l'impôt&nbsp;?", `Oui. Le chef de famille déduit ${N(D.chefDeFamille.montant, 0)} DT par an de son revenu imposable, plus ${N(D.enfant.montant, 0)} DT par enfant à charge (${N(D.enfantEtudiant.montant, 0)} DT pour un étudiant, ${N(D.enfantHandicape.montant, 0)} DT pour un enfant handicapé), dans la limite de ${D.nombreMaxEnfants} enfants. Les déductions pour enfants sont accordées au chef de famille.`],
      ["Comment calculer le brut à partir d'un net souhaité&nbsp;?", `Orbite fait le calcul inverse au millime : indiquez le net voulu, il trouve le brut correspondant. Pour 2&nbsp;000 DT net par mois, il faut ${DT(inv.brut)} brut (célibataire, secteur privé, 12 salaires).`],
      ["Le calcul est-il le même dans le secteur public&nbsp;?", `L'impôt sur le revenu et la contribution de solidarité se calculent de la même façon. Seules les cotisations changent : ${PCT(pub.tauxCotisation, 2)} à la CNRPS (retraite ${PCT(cnrps[0].taux, 2)}, maladie ${PCT(cnrps[1].taux, 2)}, capital décès ${PCT(cnrps[2].taux, 0)}) au lieu de ${PCT(s.tauxCotisation, 2)} à la CNSS. Pour 2&nbsp;500 DT brut, le net est de ${DT(pub.net)} dans le public.`]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer votre salaire net">
${tete_calc("Modifiez les valeurs, le net se recalcule")}
${champMontant("montant", "Salaire brut par mois", "2&nbsp;500")}
          <div class="calc__options">
${basculeSecteur}
          </div>
          <div class="calc__options">
${chef}
${enfants}
          </div>
          <div class="resultat">
            <span class="resultat__lib">Net à payer par mois</span>
            ${grand(aff, "net")}
            <div class="barres" aria-hidden="true"><i class="b-net" data-part="net"></i><i class="b-cot" data-part="cot"></i><i class="b-irpp" data-part="irpp"></i><i class="b-css" data-part="css"></i></div>
            <ul class="lignes" role="list">
              <li><i class="b-cot" aria-hidden="true"></i>${v(aff, "cot_lib")}<b>${v(aff, "cot")}</b></li>
              <li><i class="b-irpp" aria-hidden="true"></i>${v(aff, "irpp_lib")}<b>${v(aff, "irpp")}</b></li>
              <li><i class="b-css" aria-hidden="true"></i><span>Contribution sociale de solidarité</span><b>${v(aff, "css")}</b></li>
            </ul>
          </div>
${noteCalc}
        </form>`;
  const corps = `${pont(pg, aff, `Avec <b>${v(aff, "pont_net")}</b> net par mois, voici ce qu'Orbite calcule ensuite`)}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment passe-t-on du brut au net&nbsp;?</h2>
          <p>Quatre retenues, toujours dans le même ordre. Exemple : 2&nbsp;500 DT brut par mois, célibataire, secteur privé, 12 salaires par an.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Cotisations sociales</h3><p>CNSS ${PCT(cnss[0].taux, 2)} + ${PCT(cnss[1].taux, 1)} (perte d'emploi), soit ${PCT(s.tauxCotisation, 2)} du brut : <b>${DT(s.cotisations)}</b>. Dans le public, la CNRPS retient ${PCT(pub.tauxCotisation, 2)}.</p></div></li>
          <li><div><h3>Revenu imposable</h3><p>Brut moins cotisations, moins ${PCT(fp.taux)} de frais professionnels (${N(fp.plafondAnnuel, 0)} DT par an au plus), moins les déductions de famille : ${N(D.chefDeFamille.montant, 0)} DT pour le chef de famille, ${N(D.enfant.montant, 0)} DT par enfant.</p></div></li>
          <li><div><h3>Impôt sur le revenu (IRPP)</h3><p>Barème annuel progressif (ci-dessous), réparti sur les salaires de l'année : <b>${DT(s.irpp)}</b> par mois.</p></div></li>
          <li><div><h3>Contribution sociale de solidarité (CSS)</h3><p>${PCT(P.css.taux, 1)} du revenu imposable : <b>${DT(s.css)}</b>. Net à payer : <b>${DT(s.net)}</b>.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-bareme">
          <h2 class="titre-section" id="titre-bareme">Barème de l'IRPP ${P.annee}</h2>
          <p>Chaque taux s'applique à la part du revenu annuel imposable comprise dans la tranche.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Revenu annuel imposable</th><th scope="col">Taux</th></tr></thead>
            <tbody>
${C.bareme().map((t) => `              <tr><td>${t.a == null ? "Au-delà de " + N(t.de, 0) + " DT" : N(t.de, 0) + " à " + N(t.a, 0) + " DT"}</td><td>${PCT(t.taux)}</td></tr>`).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">${esc(P.irpp.baremeSource)}.</p>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-table">
          <h2 class="titre-section" id="titre-table">Brut et net les plus recherchés</h2>
          <p>Par mois, célibataire, secteur privé, 12 salaires par an.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Brut</th><th scope="col">Impôt</th><th scope="col">Net</th></tr></thead>
            <tbody>
${C.tableauNet(m).map((l) => `              <tr${l.brut === 2500 ? ' class="vu"' : ""}><td>${N(l.brut, 0)} DT</td><td>${N(l.impot, 3)}</td><td class="fort">${N(l.net, 3)}</td></tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page crédit ---------- */
function pageCredit(pg) {
  const net0 = C.DEFAUT.net, aff = C.affichage("credit", { net: net0 }, m), c = C.credit({ net: net0 }, m), q = PCT(c.quotite);
  const avec = C.credit({ net: net0, encours: 300 }, m), immo = c.types[0];
  const d = {
    titre: `Capacité d'emprunt Tunisie ${A} : combien la banque peut prêter — Orbite`,
    description: `Combien pouvez-vous emprunter en Tunisie ? Mensualité maximale (${q} du salaire net, crédits en cours déduits) et montant possible pour un logement, une voiture ou un crédit à la consommation. Gratuit, sans compte.`,
    sujet: "Capacité d'emprunt en Tunisie", ariane: "Capacité de crédit",
    surtitre: `Règle des ${q} du salaire net`,
    h1: `Combien la banque peut-elle vous <em>prêter</em>&nbsp;?`,
    chapo: "Votre capacité d'emprunt en Tunisie selon votre salaire net et vos crédits en cours, pour chaque type de crédit.",
    sourcesCourt: "Taux et durées indicatifs",
    faq: [
      ["Comment la banque calcule-t-elle ma capacité d'emprunt&nbsp;?", `Elle additionne toutes vos mensualités, celle du nouveau crédit comprise, et vérifie qu'elles ne dépassent pas ${q} de votre salaire net. Avec ${DT(net0)} net et aucun crédit en cours, la mensualité possible est de ${DT(c.mensualiteMax)}, soit environ ${DT(immo.capital, 0)} pour un logement sur ${N(immo.dureeMois / 12, 0)} ans.`],
      ["Les crédits en cours réduisent-ils ce que je peux emprunter&nbsp;?", `Oui, leur mensualité est déduite. Avec 300 DT de crédits en cours, la mensualité possible tombe à ${DT(avec.mensualiteMax)} et le montant pour un logement à ${DT(avec.types[0].capital, 0)}.`],
      ["Que se passe-t-il quand un crédit se termine&nbsp;?", "Sa mensualité libère de la marge. Orbite affiche le mois où chaque crédit se termine et la capacité retrouvée à ce moment-là (le calendrier de la marge)."],
      ["La banque peut-elle raisonner sur le brut&nbsp;?", "Certaines banques le font. Orbite calcule la capacité sur le net et sur le brut, pour que vous arriviez préparé au rendez-vous."],
      ["Ces montants engagent-ils la banque&nbsp;?", "Non. C'est une estimation : la banque tient aussi compte de votre ancienneté, de votre apport, de l'assurance, des garanties et de ses propres taux."]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer votre capacité d'emprunt">
${tete_calc("Modifiez les valeurs, la capacité se recalcule")}
${champMontant("montant", "Salaire net par mois", N(net0, 3))}
          <div class="champ">
            <label for="encours">Mensualités de vos crédits en cours</label>
            <div class="saisie"><input id="encours" name="encours" type="text" inputmode="decimal" autocomplete="off" value="0"><span class="saisie__unite">DT par mois</span></div>
          </div>
          <div class="resultat">
            <span class="resultat__lib">Mensualité maximale pour un nouveau crédit</span>
            ${grand(aff, "mens")}
            <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
            <p class="calc__note" data-si-etat="ok">${v(aff, "mens_pct")}</p>
            <p class="calc__alerte" data-si-etat="sature" hidden>Vos crédits en cours atteignent déjà ${q} de votre net : la banque ne prêtera pas davantage pour l'instant.</p>
            <ul class="liste-cap" role="list">
${c.types.map((t) => `              <li>${t.libelle}<span>${v(aff, "dur_" + t.cle)}</span><b>${v(aff, "cap_" + t.cle)}</b></li>`).join("\n")}
            </ul>
          </div>
          <p class="calc__note">Taux et durées indicatifs (valeurs par défaut d'Orbite, modifiables dans l'application). Rien n'est envoyé.</p>
        </form>`;
  const nets = [1000, 1500, 2000, 2500, 3000, 4000];
  const encours = [0, 200, 400, 600];
  const corps = `${pont(pg, aff, `Avec <b>${v(aff, "pont_net")}</b> net par mois, voici ce qu'Orbite calcule aussi`)}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment se calcule la capacité d'emprunt&nbsp;?</h2>
          <p>Trois étapes. Exemple : ${DT(net0)} net par mois, aucun crédit en cours.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>La limite d'endettement</h3><p>Toutes vos mensualités réunies ne doivent pas dépasser ${q} du salaire net : <b>${DT(c.mensualiteMax)}</b> par mois ici.</p></div></li>
          <li><div><h3>Les crédits en cours</h3><p>Leurs mensualités sont retirées de cette limite. Ce qui reste est la mensualité possible pour un nouveau crédit.</p></div></li>
          <li><div><h3>Du montant de la mensualité au capital</h3><p>La mensualité se convertit en capital selon la durée et le taux : ${c.types.map((t) => `${t.libelle.toLowerCase()} sur ${N(t.dureeMois / 12, 0)} ans à ${N(t.taux, t.taux % 1 ? 1 : 0)} %, <b>${DT(t.capital, 0)}</b>`).join(" ; ")}.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Capacité selon le salaire net</h2>
          <p>Sans crédit en cours. Logement sur ${N(immo.dureeMois / 12, 0)} ans, voiture sur ${N(c.types[1].dureeMois / 12, 0)} ans.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Net par mois</th><th scope="col">Mensualité</th><th scope="col">Logement</th><th scope="col">Voiture</th></tr></thead>
            <tbody>
${nets.map((n) => { const x = C.credit({ net: n }, m); return `              <tr><td>${N(n, 0)} DT</td><td>${N(x.mensualiteMax, 3)}</td><td class="fort">${N(x.types[0].capital, 0)}</td><td>${N(x.types[1].capital, 0)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Effet des crédits en cours</h2>
          <p>Pour ${DT(net0)} net par mois : montant possible pour un logement.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Crédits en cours</th><th scope="col">Mensualité possible</th><th scope="col">Logement</th></tr></thead>
            <tbody>
${encours.map((e) => { const x = C.credit({ net: net0, encours: e }, m); return `              <tr${e === 0 ? ' class="vu"' : ""}><td>${e === 0 ? "Aucun" : N(e, 0) + " DT par mois"}</td><td>${N(x.mensualiteMax, 3)}</td><td class="fort">${N(x.types[0].capital, 0)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page impôt ---------- */
function pageImpot(pg) {
  const aff = C.affichage("impot", { montant: 2500 }, m), i = C.impot({ montant: 2500 }, m), b = B.annees[B.parDefaut], av = b.produits.av, cea = b.produits.cea;
  const d = {
    titre: `Assurance vie et CEA Tunisie ${i.annee} : combien d'impôt économiser — Orbite`,
    description: `Combien d'impôt pouvez-vous économiser en ${i.annee} avec l'assurance vie et le CEA ? Versements conseillés selon votre salaire, impôt minimum, date limite du 31 décembre. Gratuit, sans compte.`,
    sujet: "Réduction d'impôt par l'assurance vie et le CEA en Tunisie", ariane: "Impôt, assurance vie et CEA",
    surtitre: `Avant le 31 décembre ${i.annee}`,
    h1: `Assurance vie et CEA&nbsp;: combien d'<em>impôt</em> économiser&nbsp;?`,
    chapo: "Les versements qui font baisser votre impôt sur le revenu, et le montant au-delà duquel verser davantage ne rapporte plus rien.",
    sourcesCourt: "Code de l'IRPP et de l'IS, article 39",
    faq: [
      ["Comment l'assurance vie fait-elle baisser l'impôt&nbsp;?", `Les primes versées dans l'année sont déduites du revenu imposable, dans la limite de ${N(av.plafond, 0)} DT par an, pour un contrat d'au moins ${av.dureeMinimaleAns} ans. En cas de rachat avant ce délai, les montants déduits sont réintégrés.`],
      ["Qu'est-ce que le CEA&nbsp;?", `Le compte épargne en actions est placé en bourse. Les dépôts sont déductibles dans la limite de ${N(cea.plafond, 0)} DT par an et restent bloqués ${cea.dureeBlocageAns} ans à partir du 1er janvier qui suit le dépôt.`],
      ["Pourquoi ne pas verser davantage&nbsp;?", `Après déduction, l'impôt ne peut pas descendre sous ${PCT(av.impotMinimumTaux)} de l'impôt initial avec l'assurance vie, ni sous ${PCT(cea.impotMinimumTaux)} avec le CEA. Au-delà de ce seuil, un versement de plus ne fait plus baisser l'impôt. Pour 2&nbsp;500 DT brut par mois, verser ${DT(i.total, 0)} suffit à économiser ${DT(i.gain)}.`],
      ["Jusqu'à quand verser pour cette année&nbsp;?", `Jusqu'au 31 décembre : seuls les versements de l'année civile réduisent l'impôt de cette année. Orbite vous rappelle l'échéance et calcule ce qui peut encore être récupéré sur la paie d'ici décembre.`],
      ["Ces règles sont-elles définitives&nbsp;?", "Les plafonds et pourcentages suivent l'article 39 du Code de l'IRPP et de l'IS ; ils peuvent changer avec une loi de finances. Vérifiez les conditions de votre contrat auprès de votre assureur ou de votre banque."]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer l'impôt que vous pouvez économiser">
${tete_calc("Modifiez les valeurs, le calcul suit")}
${champMontant("montant", "Salaire brut par mois", "2&nbsp;500")}
          <div class="calc__options">
${basculeSecteur}
          </div>
          <div class="calc__options">
${chef}
${enfants}
          </div>
          <div class="resultat">
            <span class="resultat__lib">Impôt évitable en ${i.annee}</span>
            ${grand(aff, "gain")}
            <p class="calc__alerte" data-si-etat="sans_impot" hidden>Avec ce salaire, vous ne payez pas d'impôt sur le revenu : il n'y a rien à économiser.</p>
            <ul class="liste-cap" role="list">
              <li>Impôt de l'année<span>${v(aff, "impot_an_lib")}</span><b>${v(aff, "impot_an")}</b></li>
              <li>Assurance vie<span>versement conseillé</span><b>${v(aff, "av")}</b></li>
              <li>CEA<span>versement conseillé</span><b>${v(aff, "cea")}</b></li>
            </ul>
            <p class="calc__note" data-si-etat="ok">${v(aff, "jours")}</p>
          </div>
${noteCalc}
        </form>`;
  const bruts = [1500, 2000, 2500, 3000, 4000, 5000];
  const corps = `${pont(pg, aff, `Avec <b>${v(aff, "pont_net")}</b> net par mois, voici ce qu'Orbite calcule aussi`)}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment l'épargne fait-elle baisser l'impôt&nbsp;?</h2>
          <p>Exemple : 2&nbsp;500 DT brut par mois, célibataire, secteur privé. Impôt de l'année : ${DT(i.impot)}.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Assurance vie</h3><p>Primes déductibles du revenu imposable, jusqu'à ${N(av.plafond, 0)} DT par an ; contrat d'au moins ${av.dureeMinimaleAns} ans.</p></div></li>
          <li><div><h3>Compte épargne en actions (CEA)</h3><p>Dépôts déductibles jusqu'à ${N(cea.plafond, 0)} DT par an ; sommes bloquées ${cea.dureeBlocageAns} ans.</p></div></li>
          <li><div><h3>L'impôt minimum</h3><p>L'impôt ne descend pas sous ${PCT(av.impotMinimumTaux)} (assurance vie) ou ${PCT(cea.impotMinimumTaux)} (CEA) de l'impôt initial : ici, au plus <b>${DT(i.gain)}</b> d'économie.</p></div></li>
          <li><div><h3>Le bon partage</h3><p>Orbite répartit les versements pour atteindre ce plafond au moindre coût : <b>${DT(i.av, 0)}</b> en assurance vie et <b>${DT(i.cea, 0)}</b> en CEA.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Impôt évitable selon le salaire</h2>
          <p>Par an, célibataire, secteur privé, 12 salaires.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Brut par mois</th><th scope="col">Impôt de l'année</th><th scope="col">À verser</th><th scope="col">Économie</th></tr></thead>
            <tbody>
${bruts.map((x) => { const r = C.impot({ montant: x }, m); return `              <tr${x === 2500 ? ' class="vu"' : ""}><td>${N(x, 0)} DT</td><td>${N(r.impot, 3)}</td><td>${N(r.total, 0)}</td><td class="fort">${N(r.gain, 3)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Les deux placements en bref</h2>
          <p>Règles prises en compte par le calcul.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Règle</th><th scope="col">Assurance vie</th><th scope="col">CEA</th></tr></thead>
            <tbody>
              <tr><td>Déduction par an</td><td>${N(av.plafond, 0)} DT</td><td>${N(cea.plafond, 0)} DT</td></tr>
              <tr><td>Impôt minimum</td><td>${PCT(av.impotMinimumTaux)}</td><td>${PCT(cea.impotMinimumTaux)}</td></tr>
              <tr><td>Durée</td><td>${av.dureeMinimaleAns} ans au moins</td><td>bloqué ${cea.dureeBlocageAns} ans</td></tr>
            </tbody>
          </table></div>
          <p class="sources">Code de l'IRPP et de l'IS, article 39. Valeurs susceptibles de changer avec une loi de finances.</p>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page retraite ---------- */
function pageRetraite(pg) {
  const nai = A - C.DEFAUT.ageExemple, deb = A - C.DEFAUT.carriereExemple, e0 = { montant: 2500, anneeNaissance: nai, anneeDebut: deb };
  const aff = C.affichage("retraite", e0, m), r = C.retraite(e0, m), R = RT.REGLES;
  const pub = C.retraite({ montant: 2500, secteur: "public", anneeNaissance: nai, anneeDebut: deb }, m);
  const d = {
    titre: `Calcul retraite CNSS et CNRPS Tunisie : âge de départ et pension — Orbite`,
    description: `À quel âge partir à la retraite en Tunisie et pour quelle pension ? Estimation CNSS (secteur privé) ou CNRPS (secteur public) selon votre salaire et votre carrière, en dinars d'aujourd'hui. Gratuit, sans compte.`,
    sujet: "Retraite CNSS et CNRPS en Tunisie", ariane: "Retraite CNSS ou CNRPS",
    surtitre: `CNSS ${R.cnss.ageLegal} ans · CNRPS ${R.cnrps.ageLegal} à ${R.cnrps.ageMax} ans`,
    h1: `Retraite CNSS ou CNRPS&nbsp;: à quel âge, pour quelle <em>pension</em>&nbsp;?`,
    chapo: "Âge de départ, taux et pension nette estimée, en dinars d'aujourd'hui, selon votre salaire et votre carrière.",
    sourcesCourt: "Règles CNSS et CNRPS en vigueur",
    faq: [
      ["À quel âge part-on à la retraite en Tunisie&nbsp;?", `À ${R.cnss.ageLegal} ans dans le secteur privé (CNSS). Dans le secteur public (CNRPS), à ${R.cnrps.ageLegal} ans, et jusqu'à ${R.cnrps.ageMax} ans sur demande.`],
      ["Comment est calculée la pension CNSS&nbsp;?", `Il faut au moins ${R.cnss.moisMin} mois de cotisation. Le taux est de ${R.cnss.tauxBase} % pour ${R.cnss.trimBase} trimestres, plus ${N(R.cnss.parTrimestre, 1)} % par trimestre supplémentaire, ${R.cnss.tauxMax} % au plus. Il s'applique à la moyenne des salaires des ${R.cnss.anneesReference} dernières années, plafonnée à ${R.cnss.plafondSmig} fois le SMIG.`],
      ["Comment est calculée la pension CNRPS&nbsp;?", `Il faut au moins ${R.cnrps.anneesMin} ans de service. Chaque année rapporte 2 % (les 10 premières), 3 % (les 10 suivantes), puis 2 %, ${R.cnrps.tauxMax} % au plus, appliqués à la dernière rémunération. Exemple : avec la même carrière que ci-dessus dans le public, départ à ${pub.age} ans au taux de ${N(pub.taux, 0)} %.`],
      ["Peut-on partir avant 60 ans dans le privé&nbsp;?", `Oui, dès ${R.cnss.ageMin} ans avec ${R.cnss.moisAnticipe} mois de cotisation (30 ans), mais le taux perd ${R.cnss.reductionParAn} points par année d'avance, définitivement.`],
      ["La pension est-elle imposable&nbsp;?", "Oui : elle supporte une retenue pour l'assurance maladie et l'impôt sur le revenu, avec un abattement propre aux pensions. Orbite affiche directement la pension nette."]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Estimer votre retraite">
${tete_calc("Modifiez les valeurs, l'estimation suit")}
${champMontant("montant", "Salaire brut par mois", "2&nbsp;500")}
          <div class="calc__options">
${basculeSecteur}
          </div>
          <div class="calc__duo">
            <div class="champ"><label for="naissance">Année de naissance</label><div class="saisie"><input id="naissance" name="anneeNaissance" type="text" inputmode="numeric" autocomplete="off" maxlength="4" value="${nai}"></div></div>
            <div class="champ"><label for="debut">Début de carrière (année)</label><div class="saisie"><input id="debut" name="anneeDebut" type="text" inputmode="numeric" autocomplete="off" maxlength="4" value="${deb}"></div></div>
          </div>
          <div class="calc__options">
${chef}
          </div>
          <div class="resultat">
            <span class="resultat__lib">Pension nette estimée par mois</span>
            <div data-si-etat="ok">${grand(aff, "pens")}</div>
            <p class="calc__alerte" data-si-etat="erreur" hidden>${v(aff, "raison")}</p>
            <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
            <ul class="liste-cap" role="list">
              <li>Départ<span>${v(aff, "depart_lib")}</span><b>${v(aff, "depart")}</b></li>
              <li>Taux de pension<span>${v(aff, "taux_lib")}</span><b>${v(aff, "taux")}</b></li>
              <li data-si-tard hidden>${v(aff, "tard_lib")}<span>sur demande, CNRPS</span><b>${v(aff, "tard")}</b></li>
            </ul>
          </div>
          <p class="calc__note">En dinars d'aujourd'hui, salaire constant. Calcul sur votre appareil, rien n'est envoyé.</p>
        </form>`;
  const corps = `${pont(pg, aff, `Avec ce salaire, voici ce qu'Orbite calcule aussi`)}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment est estimée la pension&nbsp;?</h2>
          <p>Exemple : 2&nbsp;500 DT brut par mois, secteur privé, né en ${nai}, carrière commencée en ${deb}.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>L'âge de départ</h3><p>${R.cnss.ageLegal} ans à la CNSS ; ${R.cnrps.ageLegal} ans à la CNRPS, ${R.cnrps.ageMax} ans au plus sur demande. Ici : <b>${r.annee}</b>, à ${r.age} ans.</p></div></li>
          <li><div><h3>La durée de cotisation</h3><p>Elle fixe le taux : ${R.cnss.tauxBase} % pour 10 ans à la CNSS, puis ${N(R.cnss.parTrimestre, 1)} % par trimestre ; à la CNRPS, 2 %, 3 % puis 2 % par année. Ici : <b>${N(r.taux, 0)} %</b>.</p></div></li>
          <li><div><h3>Le salaire de référence</h3><p>Moyenne des ${R.cnss.anneesReference} dernières années à la CNSS (plafond : ${R.cnss.plafondSmig} SMIG) ; dernière rémunération à la CNRPS.</p></div></li>
          <li><div><h3>Du brut au net</h3><p>Pension brute : ${DT(r.brut)} ; après retenue maladie et impôt : <b>${DT(r.net)}</b> par mois. Jamais moins de deux tiers du SMIG.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Taux CNSS selon la durée</h2>
          <p>Secteur privé, départ à ${R.cnss.ageLegal} ans.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Années de cotisation</th><th scope="col">Taux de pension</th></tr></thead>
            <tbody>
${[10, 15, 20, 25, 30].map((a) => `              <tr><td>${a} ans</td><td class="fort">${N(RT.tauxCnss(a * 4), 0)} %</td></tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Taux CNRPS selon les années de service</h2>
          <p>Secteur public.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Années de service</th><th scope="col">Taux de pension</th></tr></thead>
            <tbody>
${[15, 20, 25, 30, 35, 40].map((a) => `              <tr><td>${a} ans</td><td class="fort">${N(RT.tauxCnrps(a), 0)} %</td></tr>`).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Sources : ${R.sources.map((s) => esc(s.titre)).join(" ; ")}. Estimation : seule votre caisse calcule la pension définitive.</p>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page simulateur de crédit ---------- */
function pagePret(pg) {
  const D0 = C.CREDIT_DEF, ex = C.simulCredit({ type: "auto" }), aff = C.affichage("pret", { type: "auto" }, m), tmm = N(ex.tmm, 1);
  const immo = C.simulCredit({ type: "immo" }), conso = C.simulCredit({ type: "conso" });
  const d = {
    titre: `Simulateur crédit Tunisie ${A} : mensualité et coût total — Orbite`,
    description: `Simulateur de crédit en Tunisie : mensualité, intérêts et coût total d'un crédit immobilier, auto ou à la consommation, au taux TMM + marge de la banque. Gratuit, sans compte.`,
    sujet: "Simulation de crédit en Tunisie", ariane: "Simulateur de crédit",
    surtitre: "TMM + marge de la banque",
    h1: `Combien vous coûtera votre <em>crédit</em>&nbsp;?`,
    chapo: "Simulateur de crédit en Tunisie : mensualité, coût des intérêts et coût total pour un crédit immobilier, auto ou à la consommation.",
    sourcesCourt: `TMM retenu : ${tmm} %`,
    faq: [
      ["Qu'est-ce que le TMM&nbsp;?", `Le taux moyen du marché monétaire, publié chaque mois par la Banque centrale de Tunisie. Les banques fixent le taux d'un crédit en ajoutant leur marge au TMM. Orbite retient un TMM de ${tmm} % ; vous pouvez changer la marge pour retrouver le taux de votre offre.`],
      ["Taux fixe ou taux variable&nbsp;?", "À taux fixe, la mensualité reste la même jusqu'à la fin du crédit. À taux variable, elle suit le TMM : elle monte quand le TMM monte. Le tableau ci-dessus montre l'effet d'une hausse du TMM sur trois crédits types."],
      ["Combien de temps peut durer un crédit&nbsp;?", `Hors immobilier, la durée d'un crédit est limitée à 7 ans (84 mois). Un crédit immobilier peut aller jusqu'à ${D0.immo.max} ans selon la banque. Plus la durée est longue, plus la mensualité baisse, mais plus les intérêts coûtent cher.`],
      ["Puis-je rembourser mon crédit avant la fin&nbsp;?", "Oui, en tout ou en partie. La banque peut demander une indemnité prévue au contrat. Après un remboursement partiel, vous choisissez en général entre une mensualité plus basse et une durée plus courte. Orbite compare les deux dans son module Crédit."],
      ["La mensualité affichée est-elle celle de ma banque&nbsp;?", `C'est une estimation à taux fixe et à échéances constantes. La banque ajoute en général l'assurance du crédit et des frais de dossier, et fixe sa propre marge. Exemple : ${N(ex.montant, 0)} DT sur ${ex.dureeAns} ans à ${N(ex.taux, 1)} % donnent ${DT(ex.mensualite)} par mois, pour ${DT(ex.interets, 0)} d'intérêts.`]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Simuler votre crédit">
${tete_calc("Modifiez les valeurs, tout se recalcule")}
          <div class="calc__options">
            <div class="bascule" role="radiogroup" aria-label="Type de crédit">
${["immo", "auto", "conso"].map((t) => `              <label><input type="radio" name="type" value="${t}"${t === "auto" ? " checked" : ""} data-montant="${D0[t].montant}" data-duree="${D0[t].ans}" data-marge="${D0[t].marge}" data-max="${D0[t].max}"><span>${D0[t].libelle}</span></label>`).join("\n")}
              <i class="bascule__pastille" aria-hidden="true"></i>
            </div>
          </div>
${champMontant("montant", "Montant emprunté", N(ex.montant, 0))}
          <div class="calc__duo">
            <div class="champ"><label for="duree">Durée (en années)</label><div class="saisie"><input id="duree" name="duree" type="text" inputmode="numeric" autocomplete="off" maxlength="2" value="${ex.dureeAns}"><span class="saisie__unite">ans</span></div><span class="champ__aide" data-v="duree_lib">${esc(aff.duree_lib)}</span></div>
            <div class="champ"><label for="marge">Marge de la banque</label><div class="saisie"><input id="marge" name="marge" type="text" inputmode="decimal" autocomplete="off" maxlength="5" value="${N(ex.marge, 0)}"><span class="saisie__unite">points</span></div><span class="champ__aide">Taux : ${v(aff, "taux")} (${v(aff, "taux_lib")})</span></div>
          </div>
          <div class="resultat">
            <span class="resultat__lib">Mensualité</span>
            ${grand(aff, "mens")}
            <div class="barres" aria-hidden="true"><i class="b-capital" data-part="capital"></i><i class="b-interets" data-part="interets"></i></div>
            <ul class="lignes" role="list">
              <li><i class="b-capital" aria-hidden="true"></i><span>Capital remboursé</span><b>${v(aff, "capital")}</b></li>
              <li><i class="b-interets" aria-hidden="true"></i><span>Coût des intérêts</span><b>${v(aff, "interets")}</b></li>
              <li><i aria-hidden="true"></i><span>Coût total du crédit</span><b>${v(aff, "total")}</b></li>
            </ul>
          </div>
          <p class="calc__note">Mensualité à taux fixe, hors assurance et frais de dossier. Pour savoir combien la banque peut vous prêter : <a href="/capacite-credit-tunisie">capacité d'emprunt</a>. Rien n'est envoyé.</p>
        </form>`;
  const montants = [10000, 20000, 50000, 100000, 150000, 200000], durees = [3, 5, 7, 10, 15, 20], tx = ex.taux;
  const exemples = [immo, ex, conso], hausses = [0, 0.5, 1, 2];
  const mensH = (k, h) => OC.mensualitePourCapital(k.montant, k.taux + h, k.dureeMois);
  const corps = `${pontFonctions(`Avec cette mensualité, <b>votre salaire suffit-il</b>&nbsp;?`, [
    ["credit", "Capacité d'emprunt", "La banque limite vos crédits à 40 % de votre net : Orbite vérifie avec votre propre salaire et vos crédits en cours."],
    ["salaire", "Règle des 8 %", "Crédit à taux fixe de plus de 7 ans : Orbite vous dit quand votre taux peut être divisé par deux."],
    ["impot", "Dossier banque", "Un PDF propre à remettre à votre conseiller : revenus, crédits, endettement avant et après, créé sur votre appareil."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment se calcule une mensualité&nbsp;?</h2>
          <p>Quatre étapes. Exemple : voiture, ${N(ex.montant, 0)} DT sur ${ex.dureeAns} ans.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Le taux du crédit</h3><p>TMM (${tmm} %) + marge de la banque (${N(ex.marge, 0)} points) : <b>${N(ex.taux, 1)} %</b> par an.</p></div></li>
          <li><div><h3>Des mensualités constantes</h3><p>Chaque mois, la même somme rembourse un peu de capital et paie les intérêts du capital restant : <b>${DT(ex.mensualite)}</b> pendant ${ex.dureeMois} mois.</p></div></li>
          <li><div><h3>Le coût des intérêts</h3><p>Total des mensualités moins le capital : <b>${DT(ex.interets, 0)}</b>. Il grandit vite avec la durée et le taux.</p></div></li>
          <li><div><h3>Ce que la banque ajoute</h3><p>L'assurance du crédit et les frais de dossier s'ajoutent en général. Vérifiez-les dans l'offre de votre banque.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Mensualité selon le montant et la durée</h2>
          <p>Au taux de ${N(tx, 1)} % (TMM + ${N(ex.marge, 0)} points), en dinars par mois.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Montant</th>${durees.map((a) => `<th scope="col">${a} ans</th>`).join("")}</tr></thead>
            <tbody>
${montants.map((k) => `              <tr><td>${N(k, 0)} DT</td>${durees.map((a) => `<td>${N(OC.mensualitePourCapital(k, tx, a * 12), 0)}</td>`).join("")}</tr>`).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Hors immobilier, la durée d'un crédit est limitée à 7 ans.</p>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Si le TMM augmente (taux variable)</h2>
          <p>Mensualité de trois crédits types selon la hausse du TMM.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Crédit</th>${hausses.map((h) => `<th scope="col">${h === 0 ? "TMM actuel" : "+ " + N(h, h % 1 ? 1 : 0) + " pt"}</th>`).join("")}</tr></thead>
            <tbody>
${exemples.map((k) => `              <tr${k.type === "auto" ? ' class="vu"' : ""}><td>${k.libelle}, ${N(k.montant, 0)} DT sur ${k.dureeAns} ans</td>${hausses.map((h) => `<td${h === 0 ? ' class="fort"' : ""}>${N(mensH(k, h), 0)}</td>`).join("")}</tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page simulateur d'assurance vie ---------- */
function pageVie(pg) {
  const e0 = { montant: 2500, versement: 200, dureeAns: 10, rendement: 6 }, a = C.assuranceVie(e0, m), aff = C.affichage("vie", e0, m);
  const d = {
    titre: `Simulateur assurance vie Tunisie ${A} : capital et impôt — Orbite`,
    description: `Simulateur d'assurance vie en Tunisie : capital estimé après plusieurs années de versements et impôt économisé chaque année grâce à la déduction (contrat de ${a.dureeMinimale} ans). Gratuit, sans compte.`,
    sujet: "Simulation d'assurance vie en Tunisie", ariane: "Simulateur d'assurance vie",
    surtitre: "Épargne et impôt en même temps",
    h1: `Combien vous rapportera votre <em>assurance vie</em>&nbsp;?`,
    chapo: "Simulateur d'assurance vie en Tunisie : capital estimé après plusieurs années de versements, et impôt économisé chaque année grâce à la déduction.",
    sourcesCourt: `Barème ${P.annee} · contrat d'au moins ${a.dureeMinimale} ans`,
    faq: [
      ["Comment l'assurance vie fait-elle baisser l'impôt&nbsp;?", `Les primes versées dans l'année sont déduites du revenu imposable, dans la limite de ${N(a.plafond, 0)} DT par an. Pour 2&nbsp;500 DT brut par mois et 200 DT versés chaque mois, l'impôt baisse de ${DT(a.economie, 0)} par an.`],
      ["Que se passe-t-il si je retire mon argent avant 8 ans&nbsp;?", `Le contrat doit durer au moins ${a.dureeMinimale} ans. En cas de rachat avant ce délai, les montants déduits sont réintégrés au revenu imposable : l'avantage fiscal est perdu.`],
      ["Pourquoi l'économie d'impôt a-t-elle une limite&nbsp;?", `Après déduction, l'impôt ne peut pas descendre sous ${PCT(a.impotMinimumTaux)} de l'impôt initial. Au-delà de ce seuil, verser davantage augmente l'épargne mais ne fait plus baisser l'impôt.`],
      ["Le rendement est-il garanti&nbsp;?", "Non. Le simulateur utilise le rendement que vous choisissez, constant chaque année. Votre contrat indique un taux garanti, souvent plus bas, et un taux servi qui change chaque année ; des frais peuvent aussi s'appliquer."],
      ["Assurance vie ou CEA&nbsp;?", "L'assurance vie convient à une épargne longue et prudente ; le CEA est placé en bourse et bloqué 5 ans, avec un impôt minimum plus élevé (60 %). Les deux se cumulent : Orbite calcule la meilleure répartition pour votre salaire."]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Simuler votre assurance vie">
${tete_calc("Modifiez les valeurs, tout se recalcule")}
          <div class="calc__duo">
            <div class="champ"><label for="versement">Versement par mois</label><div class="saisie"><input id="versement" name="versement" type="text" inputmode="decimal" autocomplete="off" value="200"><span class="saisie__unite">DT</span></div></div>
            <div class="champ"><label for="duree">Durée</label><div class="saisie"><input id="duree" name="duree" type="text" inputmode="numeric" autocomplete="off" maxlength="2" value="10"><span class="saisie__unite">ans</span></div></div>
            <div class="champ"><label for="rendement">Rendement estimé</label><div class="saisie"><input id="rendement" name="rendement" type="text" inputmode="decimal" autocomplete="off" maxlength="4" value="6"><span class="saisie__unite">% par an</span></div></div>
            <div class="champ"><label for="montant">Votre salaire brut par mois</label><div class="saisie"><input id="montant" name="montant" type="text" inputmode="decimal" autocomplete="off" value="2&nbsp;500"><span class="saisie__unite">DT</span></div></div>
          </div>
          <div class="resultat">
            <span class="resultat__lib" data-v="cap_lib">${esc(aff.cap_lib)}</span>
            ${grand(aff, "cap")}
            <div class="barres" aria-hidden="true"><i class="b-verse" data-part="verse"></i><i class="b-gain" data-part="interets"></i></div>
            <ul class="liste-cap" role="list">
              <li>Vous aurez versé<span>sans les intérêts</span><b>${v(aff, "verse")}</b></li>
              <li>Intérêts gagnés<span>au rendement choisi</span><b>${v(aff, "interets")}</b></li>
              <li>Impôt économisé par an<span>${v(aff, "eco_lib")}</span><b>${v(aff, "eco")}</b></li>
            </ul>
          </div>
          <p class="calc__note">Rendement non garanti (exemple), sans frais. Célibataire, secteur privé. Le calcul se fait sur votre appareil : rien n'est envoyé.</p>
        </form>`;
  const versements = [100, 200, 300, 500], horizons = [5, 10, 15, 20], bruts = [1500, 2000, 2500, 3000, 4000, 5000];
  const corps = `${pontFonctions(`Votre impôt économisé, <b>versé avant le 31 décembre</b>`, [
    ["impot", "Optimiseur fiscal", "Le versement idéal pour votre salaire et votre famille : ni trop, ni trop peu, et le partage avec le CEA."],
    ["retraite", "Capital à la retraite", "L'épargne qu'il vous faudra pour garder 80 % de votre net, à partir de votre pension estimée."],
    ["salaire", "Contrats suivis", "Tous vos contrats, leurs versements et leur capital estimé, dans un seul écran, avec un rappel avant le 31 décembre."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment fonctionne l'assurance vie&nbsp;?</h2>
          <p>Exemple : 200 DT par mois pendant 10 ans, rendement de 6 % par an, salaire de 2&nbsp;500 DT brut.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Les versements</h3><p>Chaque mois, 200 DT sont placés sur le contrat : <b>${DT(a.verse, 0)}</b> en 10 ans.</p></div></li>
          <li><div><h3>Le rendement</h3><p>Les intérêts s'ajoutent au capital et rapportent à leur tour : <b>${DT(a.interets, 0)}</b> d'intérêts, ${DT(a.capital, 0)} au total.</p></div></li>
          <li><div><h3>La déduction d'impôt</h3><p>Les versements de l'année sont déduits du revenu imposable : <b>${DT(a.economie, 0)}</b> d'impôt en moins chaque année.</p></div></li>
          <li><div><h3>La durée</h3><p>Le contrat doit durer au moins ${a.dureeMinimale} ans pour garder l'avantage fiscal. L'impôt ne descend jamais sous ${PCT(a.impotMinimumTaux)} de l'impôt initial.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Capital estimé selon le versement</h2>
          <p>Rendement de 6 % par an, sans frais, en dinars.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Par mois</th>${horizons.map((h) => `<th scope="col">${h} ans</th>`).join("")}</tr></thead>
            <tbody>
${versements.map((x) => `              <tr${x === 200 ? ' class="vu"' : ""}><td>${N(x, 0)} DT</td>${horizons.map((h) => `<td${h === 10 ? ' class="fort"' : ""}>${N(C.assuranceVie({ montant: 2500, versement: x, dureeAns: h, rendement: 6 }, m).capital, 0)}</td>`).join("")}</tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Impôt économisé selon le salaire</h2>
          <p>Par an, célibataire, secteur privé, 12 salaires.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Brut par mois</th><th scope="col">Impôt de l'année</th><th scope="col">200 DT par mois</th><th scope="col">500 DT par mois</th></tr></thead>
            <tbody>
${bruts.map((b) => { const r2 = C.assuranceVie({ montant: b, versement: 200 }, m), r5 = C.assuranceVie({ montant: b, versement: 500 }, m); return `              <tr${b === 2500 ? ' class="vu"' : ""}><td>${N(b, 0)} DT</td><td>${N(r2.impot, 3)}</td><td class="fort">${N(r2.economie, 0)}</td><td>${N(r5.economie, 0)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Code de l'IRPP et de l'IS, article 39. Valeurs susceptibles de changer avec une loi de finances.</p>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page calcul du CEA ---------- */
function pageCea(pg) {
  const e0 = { montant: 2500, depot: 3000 }, c = C.cea(e0, m), aff = C.affichage("cea", e0, m), av = B.annees[B.parDefaut].produits.av;
  const d = {
    titre: `Calcul CEA Tunisie ${A} : impôt économisé et blocage — Orbite`,
    description: `Calcul du CEA (compte épargne en actions) en Tunisie : impôt économisé selon votre dépôt et votre salaire, dépôt utile au maximum, blocage de ${c.blocage} ans. Barème ${P.annee}. Gratuit, sans compte.`,
    sujet: "Compte épargne en actions (CEA) en Tunisie", ariane: "Calcul du CEA",
    surtitre: "Compte épargne en actions",
    h1: `Combien d'impôt vous fait gagner un <em>CEA</em>&nbsp;?`,
    chapo: `Calcul du CEA en Tunisie : impôt économisé selon votre dépôt et votre salaire, dépôt utile au maximum et blocage de ${c.blocage} ans.`,
    sourcesCourt: `Barème ${P.annee} · bloqué ${c.blocage} ans`,
    faq: [
      ["Qu'est-ce qu'un CEA&nbsp;?", `Le compte épargne en actions est un compte placé en bourse (actions et fonds). Les dépôts de l'année sont déduits du revenu imposable, dans la limite de ${N(c.plafond, 0)} DT par an, et restent bloqués ${c.blocage} ans à partir du 1er janvier qui suit le dépôt.`],
      ["Pourquoi un dépôt « utile » au maximum&nbsp;?", `Après déduction, l'impôt ne peut pas descendre sous ${PCT(c.impotMinimumTaux)} de l'impôt dû. Pour 2&nbsp;500 DT brut par mois, ce seuil est atteint avec ${DT(c.utile, 0)} de dépôt : au-delà, l'impôt de l'année ne baisse plus.`],
      ["Que se passe-t-il si je retire avant 5 ans&nbsp;?", `Les sommes sont bloquées ${c.blocage} ans. Un retrait anticipé fait perdre l'avantage fiscal obtenu : renseignez-vous auprès de votre banque ou de votre intermédiaire avant de déposer.`],
      ["Le CEA est-il risqué&nbsp;?", "Oui, plus que l'assurance vie : il est placé en bourse, sa valeur monte et descend avec les marchés. L'avantage fiscal est acquis, le rendement ne l'est pas."],
      ["Peut-on cumuler CEA et assurance vie&nbsp;?", `Oui. Chacun a son plafond, mais l'impôt minimum limite l'économie totale (${PCT(av.impotMinimumTaux)} de l'impôt initial avec l'assurance vie, ${PCT(c.impotMinimumTaux)} avec le CEA). Orbite calcule la répartition qui économise le plus pour votre salaire.`]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer l'impôt économisé avec un CEA">
${tete_calc("Modifiez les valeurs, le calcul suit")}
          <div class="calc__duo">
            <div class="champ"><label for="depot">Dépôt cette année</label><div class="saisie"><input id="depot" name="depot" type="text" inputmode="decimal" autocomplete="off" value="3&nbsp;000"><span class="saisie__unite">DT</span></div></div>
            <div class="champ"><label for="montant">Votre salaire brut par mois</label><div class="saisie"><input id="montant" name="montant" type="text" inputmode="decimal" autocomplete="off" value="2&nbsp;500"><span class="saisie__unite">DT</span></div></div>
          </div>
          <div class="resultat">
            <span class="resultat__lib">Impôt économisé cette année</span>
            ${grand(aff, "eco")}
            <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
            <p class="calc__alerte" data-si-etat="sans_impot" hidden>Avec ce salaire, vous ne payez pas d'impôt sur le revenu : le CEA ne fait rien gagner cette année.</p>
            <p class="calc__alerte" data-si-etat="au_dela" hidden>${v(aff, "au_dela")}</p>
            <ul class="liste-cap" role="list">
              <li>Dépôt utile au maximum<span>au-delà, l'impôt ne baisse plus</span><b>${v(aff, "utile")}</b></li>
              <li>${v(aff, "impot_min_lib")}<span>quel que soit le dépôt</span><b>${v(aff, "impot_min")}</b></li>
              <li>Disponible à partir du<span>bloqué ${c.blocage} ans</span><b>${v(aff, "dispo")}</b></li>
            </ul>
          </div>
${noteCalc}
        </form>`;
  const bruts = [1500, 2000, 2500, 3000, 4000, 5000];
  const corps = `${pontFonctions(`CEA, assurance vie, <b>ou les deux</b>&nbsp;?`, [
    ["impot", "Répartition idéale", "Orbite calcule le partage entre CEA et assurance vie qui économise le plus d'impôt pour votre salaire."],
    ["credit", "Date limite", "Un rappel avant le 31 décembre, pour ne pas perdre l'avantage de l'année."],
    ["salaire", "Votre salaire réel", "Le calcul sur votre propre salaire, vos primes et votre situation de famille."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment le CEA fait-il baisser l'impôt&nbsp;?</h2>
          <p>Exemple : 3&nbsp;000 DT déposés cette année, salaire de 2&nbsp;500 DT brut par mois, célibataire. Impôt de l'année : ${DT(c.impot)}.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>La déduction</h3><p>Le dépôt est retiré du revenu imposable, jusqu'à ${N(c.plafond, 0)} DT par an : <b>${DT(c.economie, 0)}</b> d'impôt en moins.</p></div></li>
          <li><div><h3>L'impôt minimum</h3><p>L'impôt ne descend pas sous ${PCT(c.impotMinimumTaux)} de l'impôt dû, soit <b>${DT(c.impotMinimum, 0)}</b> ici.</p></div></li>
          <li><div><h3>Le dépôt utile</h3><p>Au-delà de <b>${DT(c.utile, 0)}</b>, un dépôt de plus ne fait plus baisser l'impôt de l'année.</p></div></li>
          <li><div><h3>Le blocage</h3><p>Les sommes restent bloquées ${c.blocage} ans à partir du 1er janvier suivant : un dépôt de ${A} est disponible le <b>1er janvier ${c.disponible}</b>.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Dépôt utile selon le salaire</h2>
          <p>Par an, célibataire, secteur privé, 12 salaires.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Brut par mois</th><th scope="col">Impôt de l'année</th><th scope="col">Dépôt utile</th><th scope="col">Économie</th></tr></thead>
            <tbody>
${bruts.map((b) => { const r = C.cea({ montant: b, depot: 1e6 }, m); return `              <tr${b === 2500 ? ' class="vu"' : ""}><td>${N(b, 0)} DT</td><td>${N(r.impot, 3)}</td><td>${N(r.utile, 0)}</td><td class="fort">${N(r.economie, 0)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">CEA ou assurance vie</h2>
          <p>Les règles prises en compte par le calcul.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Règle</th><th scope="col">CEA</th><th scope="col">Assurance vie</th></tr></thead>
            <tbody>
              <tr><td>Placement</td><td>bourse (actions, fonds)</td><td>contrat d'assurance</td></tr>
              <tr><td>Déduction par an</td><td>${N(c.plafond, 0)} DT</td><td>${N(av.plafond, 0)} DT</td></tr>
              <tr><td>Impôt minimum</td><td>${PCT(c.impotMinimumTaux)}</td><td>${PCT(av.impotMinimumTaux)}</td></tr>
              <tr><td>Durée</td><td>bloqué ${c.blocage} ans</td><td>${av.dureeMinimaleAns} ans au moins</td></tr>
            </tbody>
          </table></div>
          <p class="sources">Code de l'IRPP et de l'IS, article 39. Valeurs susceptibles de changer avec une loi de finances.</p>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}


/* Champ simple (nom = clé lue par /commun/pages-publiques.js). */
function champ(id, lib, val, unite, o) {
  const x = o || {};
  return `<div class="champ"><label for="${id}">${lib}</label><div class="saisie${x.grande ? " saisie--grande" : ""}"><input id="${id}" name="${id}" type="text" inputmode="${x.mode || "decimal"}" autocomplete="off"${x.max ? ` maxlength="${x.max}"` : ""}${x.indice ? ` placeholder="${x.indice}"` : ""} value="${val}">${unite ? `<span class="saisie__unite">${unite}</span>` : ""}</div>${x.aide ? `<span class="champ__aide">${x.aide}</span>` : ""}</div>`;
}
/* Élément masqué tant que la valeur calculée est vide (data-si-v). */
const siV = (aff, cle) => ` data-si-v="${cle}"${aff[cle] ? "" : " hidden"}`;
const siEtat = (aff, etat) => ` data-si-etat="${etat}"${aff.etat === etat ? "" : " hidden"}`;
const moisTxt = (k) => String(k).padStart(2, "0");

/* ---------- Page règle des 8 % ---------- */
function pageRegle8(pg) {
  const D = C.R8_DEF, ex = C.regle8({}, m), aff = C.affichage("regle8", {}, m), r1 = ex.reductions[0], r2 = ex.reductions[1];
  const capEx = 150000, R = OC.REGLE_8;
  const d = {
    titre: `Règle des 8 % Tunisie : taux de crédit divisé par deux — Orbite`,
    description: `Loi n° 2024-41 : un crédit à taux fixe de plus de 7 ans voit son taux divisé par deux quand les intérêts dépassent 8 %. Calculez le mois exact et votre nouvelle mensualité. Gratuit.`,
    sujet: "Règle des 8 % des crédits à taux fixe en Tunisie (loi n° 2024-41)", ariane: "Règle des 8 %",
    surtitre: "Loi n° 2024-41 · crédits à taux fixe",
    h1: `Votre taux de crédit peut-il être <em>divisé par deux</em>&nbsp;?`,
    chapo: "Pour un crédit à taux fixe de plus de 7 ans, la loi permet de diviser le taux par deux dès que les intérêts payés dépassent un seuil. Indiquez votre crédit : Orbite vous donne le mois exact et la nouvelle mensualité.",
    sourcesCourt: "Loi n° 2024-41 du 2 août 2024",
    faq: [
      ["Qu'est-ce que la règle des 8 %&nbsp;?", `Une règle de la loi n° 2024-41 du 2 août 2024 pour les crédits à taux fixe de plus de 7 ans accordés aux particuliers. Avant chaque échéance, à partir de la ${R.fenetre + 1}ᵉ, on compare les intérêts payés sur les ${R.fenetre} derniers mois au capital restant dû : s'ils dépassent ${N(R.seuil * 100, 0)} %, le taux du crédit est divisé par deux.`],
      ["Quels crédits sont concernés&nbsp;?", `Les crédits à taux fixe d'une durée de plus de ${R.dureeMin} mois (7 ans), le plus souvent les crédits logement. Les crédits à taux variable (TMM + marge) et les crédits de 7 ans ou moins ne sont pas concernés.`],
      ["La réduction peut-elle se répéter&nbsp;?", `Oui. Après une réduction, la règle est vérifiée de nouveau ${R.fenetre} échéances plus tard, sans limite de nombre. Dans l'exemple, le taux passe de ${C.taux(r1.tauxAvant)} à ${C.taux(r1.tauxPct)} en ${r1.date}, puis à ${C.taux(r2.tauxPct)} en ${r2.date}.`],
      ["Comment obtenir la réduction&nbsp;?", "Demandez-la par écrit à votre banque en citant la loi n° 2024-41, avec la date calculée. Gardez une copie de votre demande et vérifiez la nouvelle mensualité sur le tableau d'amortissement que la banque vous remet."],
      ["Le calcul est-il celui de ma banque&nbsp;?", `C'est une estimation reconstituée à partir de votre mensualité, de votre taux et de la date de la première échéance, à taux et mensualité constants. Exemple : ${N(capEx, 0)} DT à ${C.taux(D.taux)} sur ${D.duree / 12} ans, première échéance en janvier ${D.annee} : réduction possible en ${r1.date}, mensualité de ${DT(r1.mensualiteAvant)} à ${DT(r1.mensualite)}.`]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer la règle des 8 %">
${tete_calc("Modifiez les valeurs, tout se recalcule")}
          <div class="calc__duo">
            ${champ("mensualite", "Mensualité actuelle", N(D.mensualite, 3), "DT")}
            ${champ("taux", "Taux fixe", N(D.taux, 0), "%", { max: 6 })}
          </div>
          <div class="calc__duo">
            ${champ("duree", "Durée totale", String(D.duree), "mois", { mode: "numeric", max: 3, aide: "20 ans = 240 mois" })}
            ${champ("debut", "Première échéance", moisTxt(D.mois) + "/" + D.annee, "", { mode: "text", max: 7, indice: "MM/AAAA", aide: "Mois et année" })}
          </div>
          <div class="resultat"${siEtat(aff, "ok")}>
            <span class="resultat__lib" data-v="quand_lib">${esc(aff.quand_lib)}</span>
            <span class="grand" aria-live="polite"><span data-v="quand_ent">${esc(aff.quand_ent)}</span><small data-v="quand_dec">${esc(aff.quand_dec)}</small></span>
            <div class="avap"><div><span>Aujourd'hui</span><b>${v(aff, "avant_taux")}</b><span>${v(aff, "avant_mens")}</span></div><i aria-hidden="true">→</i><div><span>${v(aff, "apres_lib")}</span><b>${v(aff, "apres_taux")}</b><span>${v(aff, "apres_mens")}</span></div></div>
            <p class="verdict"><b>${v(aff, "gain")}</b>${v(aff, "gain_txt")}</p>
            <ol class="frise">
${[1, 2, 3].map((j) => `              <li${siV(aff, "r" + j)}><span>${v(aff, "r" + j)}<small>${v(aff, "r" + j + "_txt")}</small></span><b>${v(aff, "r" + j + "_mens")}</b></li>`).join("\n")}
            </ol>
          </div>
          <p class="calc__alerte"${siEtat(aff, "non")} data-v="raison">${esc(aff.raison)}</p>
          <p class="calc__note">Estimation à partir de votre mensualité et de votre taux, à taux fixe. La banque applique la réduction sur demande. Rien n'est envoyé.</p>
        </form>`;
  const taux = [7, 8, 9, 10, 11, 12], durees = [10, 15, 20, 25];
  const baisse = (t, a) => { const n = a * 12, M = OC.mensualitePourCapital(100000, t, n); const r = OC.reductionsTaux({ mensualite: M, tauxPct: t, dureeMois: n, moisDebut: 1, anneeDebut: A + 1, tauxType: "fixe" }, m).reductions[0]; return r ? N(M - r.mensualite, 0) : "—"; };
  const corps = `${pontFonctions(`Votre crédit suivi <b>mois après mois</b> dans Orbite`, [
    ["credit", "Rappel au bon moment", "Orbite vous prévient le mois où la réduction devient possible, avec la lettre à remettre à la banque."],
    ["salaire", "Tableau de la banque contrôlé", "Importez le tableau d'amortissement : Orbite vérifie chaque échéance au millime et repère une réduction oubliée."],
    ["impot", "Capacité d'emprunt mise à jour", "La mensualité plus basse libère de la capacité d'emprunt : Orbite la recalcule avec votre salaire."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment fonctionne la règle des 8 %&nbsp;?</h2>
          <p>Trois étapes. Exemple : ${N(capEx, 0)} DT à ${C.taux(D.taux)} sur ${D.duree / 12} ans, première échéance en janvier ${D.annee}.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Un crédit concerné</h3><p>Taux fixe, durée de plus de 7 ans (${R.dureeMin} mensualités), crédit accordé à un particulier.</p></div></li>
          <li><div><h3>Le contrôle avant chaque échéance</h3><p>À partir de la ${R.fenetre + 1}ᵉ échéance : intérêts des ${R.fenetre} derniers mois comparés au capital restant dû. Au-delà de ${N(R.seuil * 100, 0)} %, la règle s'applique, ici en <b>${r1.date}</b>.</p></div></li>
          <li><div><h3>Le taux divisé par deux</h3><p>${C.taux(r1.tauxAvant)} devient ${C.taux(r1.tauxPct)}, même date de fin : la mensualité passe de ${DT(r1.mensualiteAvant)} à <b>${DT(r1.mensualite)}</b>. Le contrôle reprend ${R.fenetre} échéances plus tard.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Baisse de la mensualité à la première réduction</h2>
          <p>Pour 100&nbsp;000 DT empruntés à taux fixe, en dinars par mois.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Taux fixe</th>${durees.map((a) => `<th scope="col">${a} ans</th>`).join("")}</tr></thead>
            <tbody>
${taux.map((t) => `              <tr${t === D.taux ? ' class="vu"' : ""}><td>${N(t, 0)} %</td>${durees.map((a) => `<td>${baisse(t, a)}</td>`).join("")}</tr>`).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Loi n° 2024-41 du 2 août 2024. Réduction calculée à taux et mensualité constants depuis le début du crédit.</p>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Les réductions de l'exemple</h2>
          <p>${N(capEx, 0)} DT à ${C.taux(D.taux)} sur ${D.duree / 12} ans, première échéance en janvier ${D.annee}.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Date</th><th scope="col">Nouveau taux</th><th scope="col">Mensualité</th></tr></thead>
            <tbody>
              <tr><td>Avant</td><td>${C.taux(D.taux)}</td><td>${N(r1.mensualiteAvant, 3)}</td></tr>
${ex.reductions.map((r) => `              <tr><td>${r.date}</td><td>${C.taux(r.tauxPct)}</td><td class="fort">${N(r.mensualite, 3)}</td></tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page remboursement anticipé ---------- */
function pageAnticipe(pg) {
  const D = C.RA_DEF, ex = C.anticipe({}), aff = C.affichage("anticipe", {}, m);
  const d = {
    titre: `Remboursement anticipé crédit Tunisie : simulation — Orbite`,
    description: `Remboursement anticipé partiel d'un crédit en Tunisie : comparez durée plus courte et mensualité plus basse, intérêts évités au millime, reste dû et nouvelle mensualité. Gratuit, sans compte.`,
    sujet: "Remboursement anticipé d'un crédit en Tunisie", ariane: "Remboursement anticipé",
    surtitre: "Crédit en cours · Tunisie",
    h1: `Rembourser une partie de votre crédit&nbsp;: <em>combien gagnez-vous</em>&nbsp;?`,
    chapo: "Une prime, une épargne ? Comparez les deux choix que propose la banque : finir plus tôt, ou payer moins chaque mois. Les intérêts évités sont calculés au millime.",
    sourcesCourt: "Indemnité de la banque à ajouter",
    faq: [
      ["Durée plus courte ou mensualité plus basse&nbsp;?", `Garder la même mensualité et finir plus tôt fait presque toujours économiser le plus d'intérêts. Dans l'exemple, ${N(D.somme, 0)} DT versés font gagner ${ex.courte.gagnes} mois et ${DT(ex.courte.economie, 0)} d'intérêts, contre ${DT(ex.basse.economie, 0)} en baissant la mensualité. Baisser la mensualité redonne de l'air au budget et de la capacité d'emprunt.`],
      ["La banque peut-elle refuser&nbsp;?", "Le remboursement anticipé, total ou partiel, est un droit de l'emprunteur. Le contrat peut prévoir une indemnité et un préavis : vérifiez-les avant de verser la somme."],
      ["Combien coûte l'indemnité&nbsp;?", `Elle est fixée par le contrat, souvent autour de ${N(1.5, 1)} % de la somme remboursée par avance. Pour ${N(D.somme, 0)} DT, une indemnité de 1,5 % coûte ${DT(D.somme * 0.015, 0)} : à comparer aux intérêts évités.`],
      ["Vaut-il mieux rembourser tôt ou tard&nbsp;?", "Tôt. Au début du crédit, chaque mensualité contient surtout des intérêts : une somme versée tôt évite davantage d'intérêts. Le tableau ci-dessus le montre pour 10 000 DT versés à différents moments."],
      ["Le calcul tient-il compte de l'assurance&nbsp;?", `Non : il porte sur le capital et les intérêts, à taux fixe. Exemple : ${N(D.montant, 0)} DT à ${N(D.taux, 0)} % sur ${D.duree / 12} ans (${DT(ex.mensualite)} par mois), ${N(D.somme, 0)} DT versés après ${D.payees} mensualités, quand il reste ${DT(ex.restantDu)} à rembourser.`]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Simuler un remboursement anticipé">
${tete_calc("Modifiez les valeurs, tout se recalcule")}
          <div class="calc__duo">
            ${champ("montant", "Montant emprunté", N(D.montant, 0), "DT")}
            ${champ("taux", "Taux", N(D.taux, 0), "%", { max: 6 })}
          </div>
          <div class="calc__duo">
            ${champ("duree", "Durée", String(D.duree), "mois", { mode: "numeric", max: 3, aide: `<span data-v="mens_lib">${esc(aff.mens_lib)}</span>` })}
            ${champ("payees", "Déjà remboursés", String(D.payees), "mois", { mode: "numeric", max: 3, aide: `<span data-v="crd_lib">${esc(aff.crd_lib)}</span>` })}
          </div>
          ${champ("somme", "Somme versée en plus", N(D.somme, 0), "DT", { grande: true })}
          <div class="resultat"${aff.etat === "non" ? " hidden" : ""} data-si-pas="non">
            <span class="resultat__lib">Intérêts évités, au mieux</span>
            <span class="grand" aria-live="polite"><span data-v="eco_ent">${esc(aff.eco_ent)}</span><small data-v="eco_dec">${esc(aff.eco_dec)}</small></span>
            <p class="verdict"${siEtat(aff, "solde")} data-v="solde_txt">${esc(aff.solde_txt)}</p>
            <div class="choix2"${siEtat(aff, "ok")}>
              <div class="choix2__mieux"><span>Durée plus courte</span><b>${v(aff, "courte")}</b><small>${v(aff, "courte_txt")} <strong>${v(aff, "courte_eco")}</strong> d'intérêts évités.</small></div>
              <div><span>Mensualité plus basse</span><b>${v(aff, "basse")}</b><small>${v(aff, "basse_txt")} <strong>${v(aff, "basse_eco")}</strong> d'intérêts évités.</small></div>
            </div>
          </div>
          <p class="calc__alerte"${siEtat(aff, "non")} data-v="raison">${esc(aff.raison)}</p>
          <p class="calc__note">Hors indemnité de remboursement anticipé prévue au contrat (souvent autour de 1,5 % de la somme versée). Rien n'est envoyé.</p>
        </form>`;
  const moments = [12, 36, 60, 120];
  const corps = `${pontFonctions(`Une prime à placer&nbsp;? <b>Comparez avant de choisir</b>`, [
    ["credit", "Crédit ou épargne", "Orbite compare le remboursement anticipé à l'assurance vie et au CEA, impôt économisé compris."],
    ["salaire", "Remboursements datés", "Programmez plusieurs remboursements dans l'année : Orbite recalcule l'échéancier à chaque date."],
    ["impot", "Capacité retrouvée", "Une mensualité plus basse libère de la capacité d'emprunt : Orbite la recalcule avec votre salaire."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment se calcule un remboursement anticipé&nbsp;?</h2>
          <p>Trois étapes. Exemple : ${N(D.montant, 0)} DT à ${N(D.taux, 0)} % sur ${D.duree / 12} ans, ${N(D.somme, 0)} DT versés après ${D.payees} mensualités.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Le reste dû</h3><p>Après ${D.payees} mensualités de ${DT(ex.mensualite)}, il reste <b>${DT(ex.restantDu)}</b> de capital à rembourser.</p></div></li>
          <li><div><h3>La somme versée</h3><p>Elle s'enlève du reste dû : ${DT(ex.restantDu - ex.verse)}. Les intérêts futurs se calculent désormais sur ce capital plus petit.</p></div></li>
          <li><div><h3>Votre choix</h3><p>Même mensualité : fin ${C.dureeTxt(ex.courte.gagnes)} plus tôt, <b>${DT(ex.courte.economie, 0)}</b> d'intérêts évités. Même date de fin : mensualité de ${DT(ex.basse.mensualite)}, ${DT(ex.basse.economie, 0)} évités.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">10&nbsp;000 DT versés : tôt ou tard&nbsp;?</h2>
          <p>Crédit de ${N(D.montant, 0)} DT à ${N(D.taux, 0)} % sur ${D.duree / 12} ans, intérêts évités en dinars.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Versés après</th><th scope="col">Durée plus courte</th><th scope="col">Mensualité plus basse</th></tr></thead>
            <tbody>
${moments.map((p) => { const a = C.anticipe({ montant: D.montant, taux: D.taux, duree: D.duree, payees: p, somme: 10000 }); return `              <tr><td>${C.dureeTxt(p)}</td><td class="fort">${N(a.courte.economie, 0)} <small>(−${a.courte.gagnes} mois)</small></td><td>${N(a.basse.economie, 0)} <small>(−${N(a.basse.baisse, 0)} DT/mois)</small></td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Hors indemnité de remboursement anticipé et hors assurance.</p>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Selon la somme versée</h2>
          <p>Même crédit, versement après ${D.payees} mensualités.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Somme versée</th><th scope="col">Mois gagnés</th><th scope="col">Nouvelle mensualité</th></tr></thead>
            <tbody>
${[5000, 10000, 20000, 40000].map((S) => { const a = C.anticipe({ montant: D.montant, taux: D.taux, duree: D.duree, payees: D.payees, somme: S }); return `              <tr${S === D.somme ? ' class="vu"' : ""}><td>${N(S, 0)} DT</td><td class="fort">${a.courte.gagnes}</td><td>${N(a.basse.mensualite, 3)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page regroupement de crédits ---------- */
function pageRegroupement(pg) {
  const D = C.RG_DEF, ex = C.regroupement({}), rr = ex.resultat, aff = C.affichage("regroupement", {}, m);
  const noms = ["Crédit 1", "Crédit 2", "Crédit 3 (facultatif)"];
  const d = {
    titre: `Regroupement de crédits Tunisie : simulation et vrai coût — Orbite`,
    description: `Regroupement de crédits en Tunisie : capital repris, nouvelle mensualité et surcoût réel sur la durée, indemnités de remboursement anticipé et frais de dossier compris. Gratuit, sans compte.`,
    sujet: "Regroupement de crédits en Tunisie", ariane: "Regroupement de crédits",
    surtitre: "Plusieurs crédits en cours",
    h1: `Regrouper vos crédits&nbsp;: <em>moins par mois</em>, mais à quel prix&nbsp;?`,
    chapo: "Réunir plusieurs crédits en un seul baisse la mensualité, mais allonge souvent la durée. Orbite calcule le capital à reprendre, la nouvelle mensualité et le surcoût réel, indemnités et frais compris.",
    sourcesCourt: "Indemnités et frais compris",
    faq: [
      ["Qu'est-ce qu'un regroupement de crédits&nbsp;?", "La banque rembourse par avance vos crédits en cours et vous prête la somme en un seul crédit, avec une seule mensualité. On parle aussi de rachat de crédits."],
      ["Pourquoi le coût total augmente-t-il souvent&nbsp;?", `Parce que la durée s'allonge et que l'on rembourse aussi les indemnités et les frais. Dans l'exemple, la mensualité passe de ${DT(rr.mensualiteAvant, 0)} à ${DT(rr.mensualiteApres)}, mais le total remboursé augmente de ${DT(rr.difference, 0)}.`],
      ["Quels frais faut-il compter&nbsp;?", `L'indemnité de remboursement anticipé de chaque crédit (souvent ${N(CPJ_IRA, 1)} % du reste dû) et les frais de dossier du nouveau crédit. Orbite les ajoute au capital repris : ici ${DT(rr.capital, 0)} pour ${DT(rr.restantDu, 0)} de restes dus.`],
      ["Quand le regroupement est-il intéressant&nbsp;?", "Quand votre endettement dépasse ce que votre budget supporte, ou quand le nouveau taux est nettement plus bas que celui des crédits repris. Si la durée s'allonge beaucoup, le coût total augmente : comparez toujours les deux chiffres."],
      ["Le calcul est-il celui de ma banque&nbsp;?", "C'est une estimation à taux fixe : reste dû reconstitué à partir de la mensualité, du taux et des mois restants, hors assurance. Demandez à votre banque le reste dû exact de chaque crédit pour affiner."]
    ]
  };
  const ligne = (c, i) => `            <li class="cred">
              <label class="cred__tete"><input type="checkbox" name="inclus${i + 1}"${c.inclus ? " checked" : ""}><span>${noms[i]}</span><small>reste dû <b data-v="crd${i + 1}">${esc(aff["crd" + (i + 1)])}</b></small></label>
              <div class="cred__champs">
                ${champ("m" + (i + 1), "DT par mois", c.mensualite ? N(c.mensualite, 0) : "", "")}
                ${champ("t" + (i + 1), "Taux (%)", c.taux ? N(c.taux, 0) : "", "", { max: 6 })}
                ${champ("r" + (i + 1), "Mois restants", c.mois ? String(c.mois) : "", "", { mode: "numeric", max: 3 })}
              </div>
            </li>`;
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Simuler un regroupement de crédits">
${tete_calc("Vos crédits en cours, puis le nouveau crédit")}
          <ul class="creds" role="list">
${D.credits.map((c, i) => ligne(Object.assign({ inclus: true }, c), i)).join("\n")}
          </ul>
          <div class="calc__duo">
            ${champ("taux", "Nouveau taux", N(D.taux, 1), "%", { max: 6 })}
            ${champ("duree", "Nouvelle durée", String(D.duree), "mois", { mode: "numeric", max: 3 })}
          </div>
          <div class="calc__duo">
            ${champ("ira", "Indemnité", N(D.ira, 1), "%", { max: 5 })}
            ${champ("frais", "Frais de dossier", N(D.frais, 0), "DT")}
          </div>
          <div class="resultat"${siEtat(aff, "ok")}>
            <span class="resultat__lib">Nouvelle mensualité</span>
            ${grand(aff, "mens")}
            <div class="avap"><div><span>Aujourd'hui</span><b>${v(aff, "avant")}</b><span>${v(aff, "avant_lib")}</span></div><i aria-hidden="true">→</i><div><span>Regroupé</span><b>${v(aff, "apres")}</b><span>${v(aff, "capital")}</span></div></div>
            <p class="verdict"><b>${v(aff, "verdict_fort")}</b>${v(aff, "verdict_suite")}</p>
          </div>
          <p class="calc__alerte"${siEtat(aff, "non")} data-v="raison">${esc(aff.raison)}</p>
          <p class="calc__note">Indemnité de remboursement anticipé, sur le reste dû de chaque crédit. Capital repris = restes dus + indemnités + frais de dossier. Hors assurance. Rien n'est envoyé.</p>
        </form>`;
  const durees = [24, 36, 48, 60, 84];
  const corps = `${pontFonctions(`Avant de signer, <b>voyez tout votre budget</b>`, [
    ["credit", "Endettement avant et après", "Orbite compare votre taux d'endettement avant et après le regroupement, avec votre propre salaire."],
    ["salaire", "Offres comparées", "Deux banques, deux offres : Orbite compare mensualité, coût total et frais, ligne par ligne."],
    ["impot", "Dossier banque", "Un PDF propre à remettre à votre conseiller : revenus, crédits, endettement avant et après, créé sur votre appareil."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Comment se calcule un regroupement&nbsp;?</h2>
          <p>Trois étapes, avec l'exemple ci-dessus.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Le capital à reprendre</h3><p>Restes dus (${DT(rr.restantDu, 0)}) + indemnités (${DT(rr.indemnites, 0)}) + frais de dossier (${DT(rr.fraisDossier, 0)}) : <b>${DT(rr.capital, 0)}</b>.</p></div></li>
          <li><div><h3>La nouvelle mensualité</h3><p>Ce capital à ${C.taux(rr.tauxPct)} sur ${rr.mois} mois : <b>${DT(rr.mensualiteApres)}</b> au lieu de ${DT(rr.mensualiteAvant, 0)}.</p></div></li>
          <li><div><h3>Le vrai coût</h3><p>Total des nouvelles mensualités moins ce qu'il restait à payer : <b>${rr.difference > 0 ? "+" : ""}${DT(rr.difference, 0)}</b>. Plus la durée est longue, plus il monte.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Selon la durée du nouveau crédit</h2>
          <p>Exemple ci-dessus (${DT(rr.mensualiteAvant, 0)} par mois aujourd'hui), au taux de ${C.taux(rr.tauxPct)}.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Durée</th><th scope="col">Mensualité</th><th scope="col">Par mois</th><th scope="col">Coût total</th></tr></thead>
            <tbody>
${durees.map((n) => { const r = C.regroupement({ duree: n }).resultat; return `              <tr${n === D.duree ? ' class="vu"' : ""}><td>${n} mois</td><td class="fort">${N(r.mensualiteApres, 3)}</td><td>${r.gainMensuel > 0 ? "−" : "+"}${N(Math.abs(r.gainMensuel), 0)}</td><td>${r.difference > 0 ? "+" : "−"}${N(Math.abs(r.difference), 0)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Indemnité de ${N(D.ira, 1)} % et ${N(D.frais, 0)} DT de frais de dossier compris.</p>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Les crédits repris</h2>
          <p>Reste dû reconstitué à partir de la mensualité, du taux et des mois restants.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Crédit</th><th scope="col">Mensualité</th><th scope="col">Reste dû</th><th scope="col">Indemnité</th></tr></thead>
            <tbody>
${rr.lignes.map((l) => `              <tr><td>${esc(l.libelle)} · ${C.taux(l.tauxPct)} · ${l.moisRestants} mois</td><td>${N(l.mensualite, 0)}</td><td class="fort">${N(l.restantDu, 0)}</td><td>${N(l.indemnite, 0)}</td></tr>`).join("\n")}
            </tbody>
          </table></div>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

/* ---------- Page coût employeur ---------- */
function pageEmployeur(pg) {
  const ex = C.employeur({ montant: 2000 }, m), pub = C.employeur({ montant: 2000, secteur: "public" }, m), aff = C.affichage("employeur", { montant: 2000 }, m);
  const ligneTaux = (l) => `              <tr><td>${esc(l.libelle)}</td><td>${PCT(l.taux, 2)}</td><td>${N(l.montant, 3)}</td></tr>`;
  const d = {
    titre: `Coût employeur Tunisie ${P.annee} : du brut au coût total — Orbite`,
    description: `Calculez le coût employeur d'un salarié en Tunisie (barèmes ${P.annee}) : cotisations patronales CNSS ou CNRPS, accident du travail, TFP, FOPROLOS, net du salarié et part de l'État. Gratuit.`,
    sujet: "Coût employeur d'un salarié en Tunisie", ariane: "Coût employeur",
    surtitre: `Barèmes ${P.annee} · privé CNSS et public CNRPS`,
    h1: `Combien coûte un salarié <em>à son employeur</em>&nbsp;?`,
    chapo: "Du salaire brut au coût total : cotisations patronales, accident du travail, TFP et FOPROLOS, et ce qu'il reste au salarié une fois l'impôt payé.",
    sourcesCourt: `Barèmes ${P.annee}`,
    faq: [
      ["Comment calculer le coût employeur en Tunisie&nbsp;?", `Coût employeur = salaire brut + charges patronales. Dans le secteur privé, les charges patronales représentent ${PCT(ex.tauxCharges, 2)} du brut : CNSS, accident du travail (taux moyen), TFP et FOPROLOS. Pour ${N(ex.brut, 0)} DT brut par mois, l'employeur paie ${DT(ex.cout)}.`],
      ["Quelle part revient vraiment au salarié&nbsp;?", `Sur 100 DT dépensés par l'employeur pour ${N(ex.brut, 0)} DT brut, ${N(ex.parts.salarie * 100, 1)} DT reviennent au salarié (net), ${N(ex.parts.caisse * 100, 1)} DT à la CNSS (parts salariale et patronale) et ${N(ex.parts.etat * 100, 1)} DT à l'État (impôt, contribution de solidarité, TFP, FOPROLOS).`],
      ["Le taux d'accident du travail est-il le même pour tous&nbsp;?", "Non, il dépend de l'activité de l'entreprise. Orbite retient le taux de base ; une activité plus risquée paie un taux plus élevé, fixé par la CNSS."],
      ["Et dans le secteur public&nbsp;?", `L'employeur public cotise à la CNRPS (retraite et maladie) et au FOPROLOS, sans TFP ni accident du travail. Pour ${N(pub.brut, 0)} DT brut, le coût est de ${DT(pub.cout)} par mois.`],
      ["Le 13ᵉ mois et les primes changent-ils le coût&nbsp;?", "Oui : les charges patronales s'appliquent à chaque salaire versé, primes comprises. Le coût sur l'année se calcule donc sur tous les versements. Dans Orbite, la fiche salaire tient compte de 12 à 18 salaires par an."]
    ]
  };
  const calc = `        <form class="calc" id="calc" novalidate aria-label="Calculer le coût employeur">
${tete_calc("Modifiez le brut, tout se recalcule")}
${champMontant("montant", "Salaire brut par mois", "2&nbsp;000")}
          <div class="calc__options">
${basculeSecteur}
          </div>
          <div class="resultat">
            <span class="resultat__lib">Coût employeur par mois</span>
            ${grand(aff, "cout")}
            <div class="barres" aria-hidden="true"><i class="b-net" data-part="salarie"></i><i class="b-cot" data-part="caisse"></i><i class="b-irpp" data-part="etat"></i></div>
            <div class="cent" role="list" aria-label="Sur 100 DT dépensés par l'employeur">
              <div role="listitem"><b>${v(aff, "part_sal")}</b><span>pour le salarié</span></div>
              <div role="listitem"><b>${v(aff, "part_caisse")}</b><span data-v="caisse_lib">${esc(aff.caisse_lib)}</span></div>
              <div role="listitem"><b>${v(aff, "part_etat")}</b><span>pour l'État</span></div>
            </div>
            <ul class="lignes" role="list">
              <li><i class="b-net" aria-hidden="true"></i><span>Net versé au salarié</span><b>${v(aff, "net")}</b></li>
              <li><i aria-hidden="true"></i>${v(aff, "charges_lib")}<b>${v(aff, "charges")}</b></li>
              <li><i aria-hidden="true"></i><span>Coût sur 12 mois</span><b>${v(aff, "an")}</b></li>
            </ul>
          </div>
          <p class="calc__note">Répartition de 100 DT dépensés par l'employeur. Taux d'accident du travail de base, célibataire, 12 salaires. Rien n'est envoyé.</p>
        </form>`;
  const corps = `${pontFonctions(`Côté salarié, <b>voyez ce que devient chaque dinar</b>`, [
    ["salaire", "Fiche de paie lue", "Importez votre fiche de paie : Orbite contrôle les cotisations et l'impôt, ligne par ligne."],
    ["credit", "Négocier une hausse", "Orbite traduit une hausse de brut en net réel et en coût pour l'employeur, pour négocier avec les bons chiffres."],
    ["impot", "Impôt de l'année", "Assurance vie et CEA : l'impôt que vous pouvez encore économiser avant le 31 décembre."]])}

      <section class="explique" aria-labelledby="titre-explique">
        <div class="explique__tete">
          <h2 class="titre-section" id="titre-explique">Du brut au coût employeur&nbsp;?</h2>
          <p>Trois étapes. Exemple : ${N(ex.brut, 0)} DT brut par mois, secteur privé.</p>
        </div>
        <ol class="etapes">
          <li><div><h3>Les charges patronales</h3><p>CNSS, accident du travail, TFP et FOPROLOS : ${PCT(ex.tauxCharges, 2)} du brut, soit <b>${DT(ex.charges)}</b> par mois.</p></div></li>
          <li><div><h3>Le coût employeur</h3><p>Brut + charges patronales : <b>${DT(ex.cout)}</b> par mois, ${DT(ex.coutAn)} sur 12 mois.</p></div></li>
          <li><div><h3>Ce que reçoit le salarié</h3><p>Après ses cotisations, l'impôt sur le revenu et la contribution de solidarité : <b>${DT(ex.net)}</b> net, soit ${N(ex.parts.salarie * 100, 1)} % du coût employeur.</p></div></li>
        </ol>
      </section>

      <div class="tableaux">
        <section class="tableau-bloc" aria-labelledby="titre-t1">
          <h2 class="titre-section" id="titre-t1">Coût employeur selon le brut</h2>
          <p>Par mois, secteur privé, célibataire, 12 salaires par an.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Brut</th><th scope="col">Net</th><th scope="col">Charges patronales</th><th scope="col">Coût employeur</th></tr></thead>
            <tbody>
${C.TABLE_BRUTS.map((b) => { const e = C.employeur({ montant: b }, m); return `              <tr${b === 2000 ? ' class="vu"' : ""}><td>${N(b, 0)} DT</td><td>${N(e.net, 3)}</td><td>${N(e.charges, 3)}</td><td class="fort">${N(e.cout, 3)}</td></tr>`; }).join("\n")}
            </tbody>
          </table></div>
        </section>
        <section class="tableau-bloc" aria-labelledby="titre-t2">
          <h2 class="titre-section" id="titre-t2">Charges patronales ${P.annee}</h2>
          <p>Pour ${N(ex.brut, 0)} DT brut par mois, en dinars.</p>
          <div class="defile"><table>
            <thead><tr><th scope="col">Charge</th><th scope="col">Taux</th><th scope="col">Montant</th></tr></thead>
            <tbody>
${ex.lignes.map(ligneTaux).join("\n")}
${pub.lignes.map(ligneTaux).join("\n")}
            </tbody>
          </table></div>
          <p class="sources">Taux d'accident du travail de base (il varie selon l'activité). Secteur public : CNRPS et FOPROLOS seulement.</p>
        </section>
      </div>
${faq(d)}`;
  return tete(pg, d) + heros(pg, d, calc) + corps + fin(pg);
}

const GEN = { salaire: pageSalaire, credit: pageCredit, impot: pageImpot, retraite: pageRetraite, pret: pagePret, vie: pageVie, cea: pageCea,
  regle8: pageRegle8, anticipe: pageAnticipe, regroupement: pageRegroupement, employeur: pageEmployeur };
function generer() { const out = {}; PAGES.forEach((p) => { out[p.slug + ".html"] = GEN[p.cle](p); }); return out; }

module.exports = { generer, PAGES, DATE_PAGES, SITE };

if (require.main === module) {
  const dossier = path.join(__dirname, "..", "public"), verifier = process.argv.includes("--verifier");
  let ecart = 0;
  for (const [f, html] of Object.entries(generer())) {
    const cible = path.join(dossier, f), actuel = fs.existsSync(cible) ? fs.readFileSync(cible, "utf8") : null;
    if (verifier) { if (actuel !== html) { ecart++; console.error("Page à régénérer : public/" + f); } }
    else if (actuel !== html) { fs.writeFileSync(cible, html); console.log("Écrit : public/" + f); }
  }
  if (verifier && ecart) process.exit(1);
}
