#!/usr/bin/env node
/*
 * Orbite — génère les quatre pages publiques (salaire net, capacité de crédit, impôt, retraite) dans public/.
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

/* Date des chiffres écrits dans le HTML (âges d'exemple, jours restants, année de départ). */
const DATE_PAGES = new Date(2026, 9, 11);
const SITE = "https://espace-finances-tn.jaouadimohamedaziz.workers.dev";
const LINKEDIN = "https://www.linkedin.com/in/mohamed-aziz-jaouadi-%D9%85%D8%AD%D9%85%D8%AF-%D8%B9%D8%B2%D9%8A%D8%B2-%D8%A7%D9%84%D8%AC%D9%88%D8%A7%D8%AF%D9%8A-%C2%AEpsm-i-%C2%AEpspo-l-%C2%AEistqb-851009115/";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const m = DATE_PAGES, A = m.getFullYear(), DATE_TXT = m.getDate() + (m.getDate() === 1 ? "er" : "") + " " + MOIS[m.getMonth()] + " " + A, DATE_ISO = m.toISOString().slice(0, 10);
const N = C.nombre, DT = C.dt, PCT = C.pct;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sansBalises = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const PAGES = [
  { cle: "salaire", slug: "salaire-net-tunisie", nav: "Salaire net", voisin: "Calcul du salaire net", voisinTxt: "Du brut au net, au millime" },
  { cle: "credit", slug: "capacite-credit-tunisie", nav: "Crédit", voisin: "Capacité de crédit", voisinTxt: "Combien la banque peut vous prêter" },
  { cle: "impot", slug: "impot-assurance-vie-cea", nav: "Impôt", voisin: "Impôt, assurance vie et CEA", voisinTxt: "L'impôt que vous pouvez économiser" },
  { cle: "retraite", slug: "retraite-cnss-cnrps", nav: "Retraite", voisin: "Retraite CNSS ou CNRPS", voisinTxt: "À quel âge, pour quelle pension" }
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
      </a>
      <a class="signature" href="${LINKEDIN}?isSelfProfile=true" target="_blank" rel="noopener noreferrer" aria-label="Conçu par Mohamed Aziz Jaouadi : profil LinkedIn (nouvel onglet)"><span class="signature__mono" aria-hidden="true">MJ</span><span class="signature__txt"><span class="signature__pre">Conçu par</span><span class="signature__nom" translate="no">Mohamed Aziz Jaouadi</span></span><span class="signature__in"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4v-11Z"/></svg></span></a>
      </div>
      <nav class="pages-nav" aria-label="Calculs gratuits">
${PAGES.map((p) => `        <a href="/${p.slug}"${p.cle === pg.cle ? ' aria-current="page"' : ""}>${p.nav}</a>`).join("\n")}
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
  const autres = PAGES.filter((p) => p.cle !== pg.cle).map((p) => p.cle);
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
  <script src="/commun/pages-calcul.js"></script>
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
const enfants = `            <div class="calc__compteur"><span id="lib-enfants">Enfants</span><div class="compteur" role="group" aria-labelledby="lib-enfants"><button type="button" data-pas="-1" aria-label="Un enfant de moins" disabled><svg aria-hidden="true"><use href="/orbite/icones.svg#moins"/></svg></button><output name="enfants" aria-live="polite">0</output><button type="button" data-pas="1" aria-label="Un enfant de plus"><svg aria-hidden="true"><use href="/orbite/icones.svg#plus"/></svg></button></div></div>`;
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

const GEN = { salaire: pageSalaire, credit: pageCredit, impot: pageImpot, retraite: pageRetraite };
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
