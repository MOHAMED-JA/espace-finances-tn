# MÉMOIRE — Orbite (feuille de route, décisions, état)

> Fichier à lire EN PREMIER à chaque reprise. Il évite de tout refaire et de tout re-réfléchir.
> Le mettre à jour à chaque étape terminée (section « État » et « Prochaines actions »).

## 1. Objectif (demandé par l'utilisateur)

Une **seule application** (« Orbite », dépôt `MOHAMED-JA/espace-finances-tn`, **public au 10 oct.** : à passer en privé, voir 3 quaterquadragies) qui réunit **toutes** les
fonctions des trois simulateurs : salaire brut ⇄ net, assurance vie & CEA, crédit. Le simulateur auto est exclu.
Tout se fait dans l'espace personnel, sans passer par l'interface des anciens simulateurs.

Exigences :
- application facile à utiliser ; design moderne, innovant, futuriste, à empreinte humaine, avec des animations modernes ;
  inspiration : simulateur automobile (`/home/user/simulateur-assurance-automobile`), avec de la valeur ajoutée ;
- **profil saisi une fois** : données personnelles, salaire, nombre de salaires, primes, crédits en cours,
  contrats vie et CEA, budget, projets ;
- **suggestions d'épargne vie** selon le salaire net ;
- **capacité de crédit sur le net ET sur le brut** (certaines banques prêtent sur le brut) : 40 % / 40 % par défaut, modifiables ;
- **augmentation** brute ou nette : indiquer si l'on **change de tranche d'impôt** ;
- nouveau titre et nouveau logo : nom **Orbite**, titre « Votre salaire au centre. Tout le reste en orbite. » ;
- français seulement ; « tout, en 2 niveaux » : l'essentiel visible, le mode expert replié ;
  outils d'agence retirés (marque d'agence, proposition commerciale).

Règles permanentes de l'utilisateur :
- toujours donner les liens de l'application dans chaque réponse ;
- **à la fin de chaque réponse, lister les tâches en instance** (ce que je peux faire, ce qui dépend de l'utilisateur, ce qui attend un événement extérieur) ; s'il n'y en a aucune, écrire « Il n'y a pas de tâches en instance. » (demandé le 13 oct.) ;
- **réponses adaptées au TDAH** (compétence « i-have-adhd », demandée le 13 oct., valable pour toute la conversation jusqu'à « stop adhd mode » ou « normal mode ») : la première ligne est l'action à faire ; étapes numérotées et courtes ; l'état d'avancement redit à chaque réponse (« étape 2 sur 4 faite ») ; durées concrètes (« 10 minutes ») ; listes de 5 éléments au plus ; ce qui marche maintenant montré concrètement ; pas d'introduction, de récapitulatif ni de formule de politesse finale ; une seule action de moins de 2 minutes à la fin ; un sujet secondaire proposé à part, jamais glissé dans la réponse ;
- fusionner soi-même (PR puis merge) ;
- carte blanche sur les dépôts ;
- sécurité élevée : dépôt privé, CSP stricte, RLS.
- **aucune solution payante** (l'utilisateur n'a pas de budget, rappelé le 11 oct.) : ne proposer que du gratuit ou des essais gratuits ; si rien de gratuit n'existe, le dire et proposer de garder l'existant.

Liens :
- application : https://espace-finances-tn.jaouadimohamedaziz.workers.dev (Cloudflare Workers ; se déploie depuis `main`) ;
- simulateur public : https://mohamed-ja.github.io/portail-rh/calculateur-salaire/ (dépôt `portail-rh`, branche de travail `claude/tunisia-salary-calculator-pfpor4`).

Supabase (projet `txrwgqgnqdkipwtwpevl`) : Google OAuth activé et migration 0002 exécutée par l'utilisateur ✔.

## 2. Architecture (décidée, ne pas rediscuter)

- Statique, sans compilation, JS natif (IIFE / UMD), **aucun script ni style en ligne** : la CSP l'interdit.
  Les styles dynamiques passent uniquement par `el.style.setProperty`.
- `public/espace/index.html` est l'application unique. La navigation passe par `#vue?params`. Vues : orbite, profil, salaire, epargne, credit, simulations, compte.
- `public/espace/js/app.js` expose `window.Orbite` :
  - formats `F` ;
  - `animerNombre`, `puceVolante`, `placerPastilles` ;
  - `profil()`, `synthese()`, `majProfil()`, `surProfil()` ;
  - enregistrement des simulations, View Transitions, thème ;
  - relais provisoire vers `/outils/...` tant qu'un module n'est pas chargé.
- Le profil est enregistré dans **user_metadata.orbite** (Supabase Auth, `updateUser({data})`) : aucune migration SQL n'est nécessaire.
- `public/espace/js/orbite-calcul.js` (pur, testé) : `synthese`, `augmentation` (tranche), `capacite`, `suggestionsEpargne`, `budget`, `projet`, `conseils`.
- Moteurs purs dans `public/moteurs/` :
  - `salaire/` (calcul, parametres, etat) ;
  - `vie/` (baremes, moteur-fiscal, scenario, projection, rachat…) ;
  - `credit/credit.js` (extrait de l'ancien app.js, en parité, `LISEZMOI.md`).
- Contrat de module, identique pour les trois modules : `window.ModuleSalaire` / `ModuleEpargne` / `ModuleCredit` avec `outil`, `etat()`
  (chaîne conforme à `/^[A-Za-z0-9_.,:%=&+\-]*$/` et de 4000 caractères au plus), `resume()`, `nomParDefaut()`, `charger(etat)`, `depuisProfil(profil)`, `afficher()`.
  Le module crée son DOM dans `#epargne-racine` ou `#credit-racine`, et écoute `orbite:vue` pour lire les paramètres.
- Paramètres de route :
  - `#credit?type=&capital=&mois=&taux=&prix=&apport=` et `#credit?mon=<index>` ;
  - `#epargne?versement=` ;
  - `#profil?section=budget|credits|projets…`.
- Design : `DESIGN.md` et `public/orbite/orbite.css`.
  - Polices : Bricolage Grotesque pour l'affichage, Mona Sans, JetBrains Mono.
  - Couleurs : salaire vert #12B76A, épargne violet #7A5AF8, crédit bleu #2F5BEA, panneaux « cosmos » d'encre.
  - `theme-init.js` pose toujours `data-theme` (choix mémorisé, sinon celui de l'appareil).
- Les pages publiques connexion, confidentialité et 404 utilisent `commun/meridien.css`, réaccordé aux couleurs d'Orbite.

## 3. État (au 8 oct. 2026, fin de journée)

PUBLIÉ sur `main` (PR #3, puis PR « modules ») :
- ✔ système visuel, logo animé, icônes PWA, manifest ;
- ✔ accueil, connexion, confidentialité ;
- ✔ Mon orbite, Mon profil (enregistrement automatique, délai propre à chaque champ) ;
- ✔ module Salaire, avec la tranche d'impôt lors d'une augmentation ;
- ✔ module Épargne vie & CEA (`module-epargne.js`, `epargne.css`), complet : essentiel, mode expert, exports, PDF via `espace/vendor/jspdf` ;
- ✔ module Crédit (`module-credit.js`, `credit.css`, moteur `moteurs/credit`), complet : scénarios A/B, éligibilité net/brut, outils avancés ;
- ✔ anciens simulateurs `public/outils/`, pont, `espace.js` et règles `/outils` de `_headers` supprimés ; tests repointés vers `public/moteurs/` ;
- ✔ tests : `npm test` → 257 ✔ (4 tests de l'ancienne interface retirés : traductions, couleur d'agence) ;
  e2e 18/18 ✔ ; axe 0 violation sur les 7 vues, en clair et en sombre, à 1440 et 390 px.

## 3 bis. Modules (« mods ») installés par l'utilisateur

Ce sont des extensions de compétences, pas des scripts automatiques : design (critique, accessibilité, rédaction), `web-design-guidelines`, `impeccable`, `emil-design-eng`, `review-animations`, productivité, RH, finance (Daloopa), Playwright.
- `web-design-guidelines` a été exécuté sur Orbite (8 oct.). Corrections appliquées :
  - `touch-action: manipulation` ;
  - fond explicite des `option` en mode sombre ;
  - `overscroll-behavior: contain` sur les dialogues ;
  - `translate="no"` sur la marque.
  Le reste est conforme : focus, mouvement réduit, zones de sécurité, `theme-color`, `aria-live`, etc.
- `review-animations` ne peut être lancé que par l'utilisateur (commande `/review-animations`).
- Les connecteurs MCP de ces modules (Asana, Figma, Daloopa…) sont bloqués par le réseau du conteneur.

## 3 ter. Lisibilité et signature (8 oct., retour de l'utilisateur)

Retour : affichage tassé, pas d'animation, cadres de sélection peu visibles.
- Cause probable de l'absence d'animation : Windows avec « Effets d'animation » coupés, ce qui donne `prefers-reduced-motion: reduce`.
  L'ancienne règle globale coupait alors toute transition. Désormais on retire les déplacements mais on garde les fondus et les couleurs.
  Il ne faut pas remettre de règle `transition-duration: 1ms` globale.
- « Couche vivante » en fin de `orbite.css` :
  - `--sel`, la couleur d'accent de chaque module ;
  - halo au focus des champs ;
  - pastille de bascule encadrée ;
  - puces sélectionnées avec cadre dégradé et coche ;
  - entrée des panneaux à chaque changement de vue (classe `vue--entree` posée par `app.js`).
- Crédit, plus aéré :
  - les puces de type sont en 2×2 grâce à une requête de conteneur ;
  - les chiffres du résultat aussi (4 colonnes seulement si le panneau fait 680 px ou plus) ;
  - les espacements sont plus grands.
- Signature « Powered by Mohamed Aziz Jaouadi », avec un lien vers son profil LinkedIn :
  - styles dans `public/orbite/signature.css`, en cadre à bordure dégradée ;
  - placée sous le logo dans le rail, en bandeau sur mobile, et sur l'accueil, la connexion et la confidentialité.
- Bogue corrigé : la liste des simulations pouvait rester vide, car l'événement `orbite:pret` partait avant le chargement de `simulations.js`.
  La correction : `Orbite.pret = true` et un démarrage immédiat. C'était la cause de l'échec « isolation » de l'e2e.

## 3 quater. Conseils réalistes (8 oct., profil réel de l'utilisateur)

Profil de l'utilisateur : 4 000 DT brut × 17 salaires, 3 crédits à 2 069 DT par mois (taux 4,5 % et 2 %), un contrat vie de 100 DT par mois.
Ce qui était absurde, et ce qui a été corrigé dans `orbite-calcul.js` :
- **Suggestions d'épargne trop hautes.** Elles sont désormais plafonnées à 30 % de la marge mensuelle (`PART_MARGE_EPARGNE`). Les doublons sont retirés et le conseil « à votre rythme » rappelle le maximum utile pour l'impôt.
- **« Renégociez » proposé à tort.** Ce conseil n'apparaît que si un taux est au niveau du marché ou au-dessus (`TAUX_MARCHE`, `analyseTaux`). Sinon, le conseil « Des taux à garder » s'affiche.
- **Endettement.** Il est donné sur le salaire net mensuel et sur le net moyen (17 salaires ÷ 12). Le budget utilise désormais `netMoyen`.
- **Date de retour sous la quotité.** `sortieEndettement` la calcule ; le conseil « Votre marge revient dans… » l'annonce, et `capacite.net.futur` / `capacite.brut.futur` donnent la capacité future.
- **Section capacité.** Quand elle vaut 0, elle affiche « Mensualité possible à partir de [date] », avec les cartes en pointillés.
- **Scène orbitale.**
  - Le noyau passe à r = 64 et son texte prend la taille du disque (`--d`).
  - Les étiquettes se placent vers l'extérieur et restent dans le cadre (`--gx`/`--gy`).
  - Elles sont masquées sous 560 px, où la liste en dessous les remplace.
- **Prénom saisi en majuscules.** Il s'affiche en casse normale (`casse()` dans `app.js`).
- **Lecture du profil pour déboguer.** Le connecteur Supabase permet de le lire (`auth.users.raw_user_meta_data->'orbite'`, projet `txrwgqgnqdkipwtwpevl`), en lecture seule.

## 3 quinquies. Contrats vie : versements libres et capital estimé (8 oct.)

L'utilisateur verse 100 DT par mois depuis décembre 2021, plus des versements libres ; son salaire de 4 000 DT est bien un brut.
Nouveaux champs d'un contrat :
- `moisDebut` ;
- `versementsLibres` : total des versements libres depuis l'ouverture ;
- `versementsLibresAn` : versements libres de l'année, comptés dans la déduction fiscale par `versementsExistants` et par le module Épargne.

`estimationContrat` donne, pour chaque contrat :
- les mois écoulés et le total versé ;
- le capital estimé à 5 % net par an (`RENDEMENT_ESTIME`) quand le relevé n'est pas saisi ;
- la date des 8 ans (5 pour un CEA).

Où c'est affiché :
- dans le conseil « Capital estimé de votre épargne » ;
- dans un encadré sous chaque contrat du profil (sa place est réservée dès le départ pour éviter un saut de mise en page) ;
- dans la liste des contrats du module Épargne.

## 3 sexies. Banque sur le brut et calendrier de la marge (8 oct.)

BH Bank, la banque de l'utilisateur, prête 40 % du brut ; d'autres banques prêtent sur le net.
- Profil : deux nouveaux champs, `baseBanque` (« net » ou « brut », « net » par défaut) et `banque` (nom libre). Ils sont dans la section « Règles de votre banque ».
- Conseils : ils utilisent la base et la quotité de la banque. « Comparez les banques » indique si l'autre base prêterait plus, ou plus tôt.
- `paliersMarge` : une étape par fin de crédit qui augmente la mensualité possible. Les crédits terminés entre deux étapes sont cumulés. Pour chaque étape, il donne le capital immobilier sur 20 ans à 10 %.
- « Mon orbite » :
  - la bascule net/brut suit le profil tant que l'utilisateur ne la change pas (`syncBase`) ;
  - le bloc « Le calendrier de votre marge » est ajouté (`#cap-paliers`).
- Exemple de l'utilisateur, calculé sur le brut : mars 2032 : 226 DT par mois ; juin 2032 : 724 DT par mois (environ 75 000 DT) ; février 2039 : 1 600 DT par mois.

## 3 septies. Échéancier des crédits et règle des 12 salaires (8 oct.)

- Crédits : trois champs facultatifs, `moisDebut`, `anneeDebut` et `dureeMois`. S'ils sont renseignés, `echeancier()` calcule les échéances restantes : 12 par an, la première le mois suivant le déblocage. Ce calcul prime sur la saisie manuelle de `moisRestants` (le champ passe en lecture seule, bord en pointillés). La date de la dernière échéance s'affiche sous le crédit (`sy.credits`).
- Règle de l'utilisateur : la cession sur salaire ne porte que sur **12 salaires**. Les salaires au-delà de 12 n'entrent pas dans la capacité d'emprunt, qui est calculée sur le salaire mensuel (`netMensuel` / `brutMensuel`).
  - La mention « en comptant vos 17 salaires » a été retirée des conseils.
  - L'alerte du budget suit la règle de la banque (`budget.endettementBanque`).
  - Le budget reste calculé sur le net moyen, car c'est l'argent réellement reçu.
- Exemple de l'utilisateur : auto débuté en avril 2025, mariage en juillet 2025. Les mois restants saisis (65 et 68) correspondent à des crédits d'environ 7 ans.

## 3 octies. Revenu retenu par la banque : salaires et primes ÷ 12 (8 oct., correction)

Précision de l'utilisateur : la **capacité** se calcule sur les salaires et les primes **ensemble**, soit le revenu de l'année ÷ 12, mais le **remboursement** se fait en 12 échéances par an, prélevées sur les salaires mensuels.
- Profil : nouveau champ `revenuBanque`, « annuel » par défaut (salaires et primes ÷ 12) ou « mensuel » (salaire mensuel seul).
- Capacité : `capNet` / `capBrut` utilisent `netAnnuel / 12` ou `brutAnnuel / 12` en mode « annuel ».
- Nouveau conseil « Votre capacité d'emprunt aujourd'hui » quand une marge existe, avec les étapes suivantes.
- Ceci remplace ce qui était noté en 3 septies : la mention « les banques ne comptent que 12 salaires » a été retirée.
- Exemple de l'utilisateur, chez BH Bank sur le brut : 68 000 ÷ 12 = 5 667 DT, 40 % = 2 267 DT, soit **198 DT par mois de marge dès aujourd'hui** (environ 20 500 DT en immobilier sur 20 ans). Puis mars 2032 : 893 DT ; juin 2032 : 1 391 DT (environ 144 000 DT) ; février 2039 : 2 267 DT.

## 3 nonies. Module Crédit aligné sur la règle de la banque (8 oct.)

- `empDepuis` reprend, comme « Mon orbite », le revenu retenu par la banque (`sy.capacite.net.revenu` / `brut.revenu`), la base (`baseBanque`) et le nom de la banque.
- Nouvel encadré `#cr-accord` « [Banque] peut vous accorder » (`majAccord`) :
  - l'échéance maximale et le montant maximal sur la durée et au taux choisis (`capaciteBanque`) ;
  - le rappel de la règle ;
  - le verdict sur la demande : « dans la limite », ou dépassement de X DT par mois avec le montant à viser.
- Critères d'éligibilité : l'endettement sur l'autre base est marqué « (autres banques) » et ne compte plus dans le verdict.

## 3 decies. Projet : abonnements payants avec ClicToPay (étude du 8 oct. ; réalisé, voir 3 duodecies)

Demande de l'utilisateur : 3 jours d'essai gratuit, puis un abonnement mensuel, semestriel ou annuel. Les durées longues doivent être encouragées par des réductions.

Faisabilité : **oui**, avec ClicToPay (SMT, cartes tunisiennes, montants en millimes, devise 788). Points vérifiés :
- l'API REST attendue est `register.do`, qui crée la commande et renvoie l'URL de la page de paiement, puis `getOrderStatusExtended.do` pour vérifier le paiement ;
- le paiement **récurrent automatique** n'est pas documenté publiquement : il faut le demander à SMT ou à la banque.

D'où le choix de départ : des **périodes prépayées** (1, 6 ou 12 mois payés d'avance, sans renouvellement automatique), avec rappels avant l'échéance. Le renouvellement automatique viendra plus tard, si SMT active la carte enregistrée.

Architecture prévue :
- **Secrets** : les identifiants ClicToPay sont stockés en secrets Cloudflare (`wrangler secret put`), **jamais dans le dépôt**.
- **Points d'API dans le Worker** :
  - `POST /api/paiement/creer` (formule) appelle `register.do` avec `orderNumber` unique, `returnUrl` et `failUrl` ;
  - `GET /api/paiement/retour` vérifie **côté serveur** avec `getOrderStatusExtended.do` (`orderStatus` = 2) avant toute activation, sans jamais faire confiance à la seule redirection.
- **Supabase** : table `abonnements` (user_id, formule, debut, fin, statut, order_id, montant_millimes), avec la RLS en lecture pour le propriétaire seulement ; les écritures se font uniquement par la clé de service, depuis le Worker. La fin de l'essai (`essai_fin` = inscription + 3 jours) est fixée côté serveur, une seule fois par compte.
- **Application** : bandeau « Essai : J-2 », puis à l'expiration un écran d'abonnement. Pendant l'essai, les modules sont accessibles ; après, les calculs restent visibles en lecture et les modules sont bloqués (à confirmer).
- Le simulateur public (`portail-rh`) reste gratuit et sert de porte d'entrée.

Grille de prix proposée, en TTC, à valider par l'utilisateur :
- mensuel : 9,900 DT ;
- semestriel : 49,900 DT, soit 8,317 DT par mois (−16 %) ;
- annuel : 79,900 DT, soit 6,658 DT par mois (−33 %, « 4 mois offerts »).

L'offre annuelle est mise en avant et présélectionnée.

À fournir par l'utilisateur :
- un compte marchand ClicToPay, ouvert via sa banque (patente/RNE et contrat), avec les identifiants de test puis de production ;
- les prix définitifs ;
- les conditions générales de vente (TVA 19 % sur les services numériques, à confirmer avec le comptable).

## 3 undecies. Statut de l'utilisateur pour encaisser (8 oct.)

L'utilisateur est une **personne physique sans patente**, salarié en CDI. Il veut vendre des abonnements à tout le monde et recevoir l'argent sur son RIB.

Piste recommandée, à faire valider par l'utilisateur et un comptable :
1. **Statut d'auto-entrepreneur** (décret-loi 2020-30) :
   - inscription en ligne au Registre national des auto-entrepreneurs, avec Mobile ID, environ 10 DT de frais et une carte valable 3 ans ;
   - chiffre d'affaires plafonné à 75 000 DT par an ; impôt et cotisation forfaitaires.
   - À vérifier : que l'activité « service numérique / logiciel en ligne » figure dans la liste des activités autorisées, le cumul avec un CDI, et la clause d'exclusivité du contrat de travail.
2. **Passerelle de paiement agréée BCT (PayFac)**, plus simple que ClicToPay en direct :
   - **Konnect** : liens de paiement, API et plugins, pour freelances et entrepreneurs ;
   - ou **Flouci** : compte professionnel gratuit avec RIB, réservé en principe aux titulaires d'une patente ou d'un statut, plugins e-commerce.
   Les deux acceptent les cartes tunisiennes et les portefeuilles, et versent l'argent sur un RIB.
3. À **éviter** : encaisser par virement personnel ou via D17 sans statut. C'est impossible à automatiser, et c'est un risque fiscal.

Conséquence technique : l'architecture de 3 decies reste valable, mais la passerelle devient interchangeable (ClicToPay, Konnect ou Flouci). Prévoir un adaptateur `passerelle.js` côté Worker : `creer(commande)` et `verifier(id)`, plus un webhook signé si la passerelle en propose un.

## 3 duodecies. Abonnements : RÉALISÉ et en ligne en mode test (8 oct.)

**Base de données** : migration `0003_abonnements.sql`, appliquée sur Supabase avec le correctif « essai conservé ».
- Tables :
  - `formules` (lecture publique ; prix en millimes : 9 900 / 49 900 / 79 900) ;
  - `abonnements` (une ligne par compte : `essai_fin`, `fin`, `formule`, `offert`) ;
  - `paiements` (historique, `reference` au format ORB-AAAAMMJJ-XXXXXXXX).
- Le déclencheur `auth_creer_abonnement` donne 3 jours d'essai à l'inscription. Les comptes existants ont reçu 3 jours à partir du 8 oct.
- `mon_acces()` renvoie l'état : essai, actif, offert ou expire.
- `activer_paiement()` est réservée au serveur et idempotente. La période commence à `max(maintenant, fin, essai_fin)` : payer pendant l'essai ne fait perdre aucun jour.
- Le navigateur ne peut que **lire** ces tables (vérifié : pas d'insert ni d'update, pas d'exécution d'`activer_paiement`).
- Le **compte du propriétaire est `offert = true`**, réglé par SQL directement en base et non dans le dépôt, pour ne pas y écrire d'adresse e-mail.

**Fonction serveur Supabase `paiement`** : sources dans `supabase/functions/paiement/`, déployée en version 2, `verify_jwt=false` avec authentification maison.
- Actions : `creer`, `verifier`, `detail`, `simuler` (mode test uniquement, refusée dès que `PASSERELLE` ≠ test), plus le webhook `?webhook=1&ref=`, qui se contente de revérifier.
- Anti-abus : 10 commandes non payées par heure au maximum.
- CORS : l'URL de l'application et localhost uniquement.
- `passerelles.js` contient les adaptateurs test, Konnect, Flouci et ClicToPay, testés avec un faux `fetch` (`tests/abonnement/`).
- Les points d'API des passerelles sont à confirmer avec la documentation reçue à l'ouverture du compte marchand.

**Interface** :
- vue `#abonnement` : statut, 3 offres avec l'annuelle présélectionnée et mise en avant (« Le plus avantageux », 3 mois offerts, −33 %, placée en premier sur mobile), bouton de paiement, garanties, contenu inclus, historique ;
- pastille « Essai : 3 j » dans la barre, badge dans le rail, encart dans « Compte » ;
- garde : à l'expiration, seuls `profil`, `compte` et `abonnement` restent ouverts (`O.definirGarde`) ;
- retour de passerelle sur `/espace/?paiement=REF[&echec=1]`, avec vérification et nouvelles tentatives ;
- page `/espace/paiement-test.html`, qui tient lieu de passerelle en mode test ;
- nouvelle page `/cgv.html` (provisoire : identité légale à compléter) et confidentialité mise à jour.

**Tests** :
- `npm test` : 277 réussis ;
- e2e : 19/19, dont le parcours complet « essai → expiration → blocage → paiement test → réactivation » ;
- axe : 0 violation ;
- aucun débordement de 320 à 1920 px.

**Passer en production**, quand l'utilisateur aura son compte marchand :
1. Supabase → Edge Functions → Secrets : `PASSERELLE=konnect` (ou `flouci` / `clictopay`) et les clés de la passerelle (voir l'en-tête de `index.ts`).
2. Tester en bac à sable (`KONNECT_SANDBOX` ou `CLICTOPAY_TEST` non nuls).
3. Passer en production (`…=0`), puis compléter les CGV.

Mode test sécurisé (migration 0004, fonction en version 3) : seuls les comptes `testeur = true` ou `offert = true` peuvent créer ou simuler une commande de test. Les autres reçoivent une réponse 200 `{erreur, code: "bientot"}` : « Le paiement en ligne ouvre très bientôt ». Ainsi, plus personne ne peut s'abonner gratuitement.
Désigner un testeur : `update public.abonnements set testeur = true where user_id = (select id from auth.users where email = '…');`

Mots de passe divulgués : l'option de Supabase est réservée à l'offre Pro, alors que le projet est sur l'offre **gratuite**. Elle est remplacée par `public/commun/fuites.js`, qui interroge l'API Pwned Passwords selon le principe du k-anonymat (5 caractères de l'empreinte SHA-1, en-tête `Add-Padding`). La vérification a lieu à l'inscription, à la réinitialisation et au changement de mot de passe. Si le service est en panne, l'utilisateur n'est pas bloqué. Le domaine `api.pwnedpasswords.com` a été ajouté au `connect-src` de la CSP. Dans l'e2e, un faux service est branché et le mot de passe `Fuite-Connue-2026!` doit être refusé.
Limite connue : ce contrôle se fait côté navigateur, un appel direct à l'API d'authentification le contourne. La garantie côté serveur demanderait l'offre Pro, avec l'option de Supabase ou un crochet d'authentification.
L'alerte de l'outil de sécurité Supabase restera affichée tant que l'option n'est pas activée, ce qui demande l'offre Pro.

Dans l'e2e, le choix du thème se fait par `dispatchEvent("click")` : la barre fixe peut recouvrir l'élément après une capture pleine page.

## 3 terdecies. Conseils cliquables, photo de profil, Paramètres façon Claude (8 oct.)

- **Liens des conseils** : dans `orbite-calcul.js`, la fonction `conseils()` utilise une table `LIENS` qui attribue à chaque conseil `c.lien = {href, libelle}`. Chaque lien mène à l'endroit exact où agir, et non plus à un « Voir → » générique :
  - endettement → `#profil?section=credits` ;
  - marge → `#orbite?section=marge`, qui défile jusqu'au calendrier des paliers ;
  - capacité → `#credit?type=immo&capital=…` ;
  - banques → `#profil?section=banque` ;
  - impôt → `#epargne?versement=N` ;
  - contrats, précaution, chef de famille → sections correspondantes du profil.
  Le rendu se fait dans `vue-orbite.js` (`a.lien-action.conseil__lien`, placé sous le texte).
- **Photo Google absente** : la cause était la CSP, dont `img-src` bloquait `*.googleusercontent.com`. Elle autorise désormais ce domaine et `https://txrwgqgnqdkipwtwpevl.supabase.co`.
- **Photo importée** : migration `0005_avatars.sql`, compartiment privé `avatars` (1 Mo, webp, png ou jpeg). Les politiques RLS limitent l'accès au dossier `{uid}/`. Le navigateur recadre l'image en 256 × 256 au format WebP. L'affichage passe par une URL signée valable 1 h.
  Métadonnées : `orbite_avatar` vaut `stockage`, `google` ou `aucun` ; `orbite_avatar_v` sert à contourner le cache. La suppression du compte efface aussi la photo.
- **Paramètres** (`#compte?onglet=…`, `parametres.js`) : onglets ARIA navigables au clavier.
  - Profil : photo, nom complet, « Comment Orbite doit vous appeler ? » (`orbite_appel`, utilisé dans la salutation), activité (`orbite_metier`).
  - Préférences : thème, animations (localStorage `ef-mouvement` et `data-mouvement="reduit"`), page d'ouverture (`orbite_accueil`).
  - Sécurité : mot de passe, déconnexion partout, dernière connexion.
  - Abonnement.
  - Utilisation : membre depuis, profil complété à X %, simulations sur 200, nombre de conseils.
  - Données : export et suppression.
- **Mise en page** : sur mobile, les onglets passent à la ligne. Entre 860 et 1199 px, les réglages s'empilent sur une seule colonne (la colonne de 280 px faisait déborder les boutons à 1024 px).
- **Tests** : le faux Supabase gère le stockage (envoi en multipart, signature, lecture, suppression). L'e2e importe un PNG valide, puis vérifie le surnom, la page d'ouverture et le retrait de la photo. Résultats : 20/20, `npm test` 282/282, aucun débordement de 320 à 1920 px.
- **Reste à faire pour l'utilisateur** : dans Mon profil, choisir « BH Bank / Le brut » et indiquer décembre comme mois du contrat d'assurance vie.

## 3 quaterdecies. Taux du futur crédit immobilier et échéance cible (8 oct.)

- **Avant** : le calendrier de la marge calculait toujours à 10 % (TMM 7,5 + 2,5). Le lien « Simuler » ne transmettait que le capital. Dans le module Crédit, baisser le taux faisait donc baisser l'échéance, alors que le capital restait le même.
- **Moteur** : le profil reçoit un champ `tauxImmoPct` (null = automatique). La fonction `tauxImmo(p)` renvoie dans l'ordre :
  - le taux choisi par l'utilisateur (`source: "choisi"`) ;
  - sinon le taux du crédit immobilier en cours (`"credit"`, souvent un taux préférentiel, 4,5 % pour l'utilisateur) ;
  - sinon TMM + 2,5 (`"marche"`).
  Ce taux sert au calendrier (`paliersMarge`, qui renvoie `tauxPct`) et aux cartes immo et immo25 de la capacité (5e paramètre de `capacite`). `sy.tauxImmo` est exposé.
- **Calendrier** : un champ « Taux de votre futur crédit immobilier » (`#cap-taux-immo`) est enregistré dans le profil. Un texte d'aide indique la source du taux. Le bouton « Revenir au taux automatique » remet la valeur à null.
- **Module Crédit** : nouveau paramètre de route `mensualite=`. Il crée `S.cible = {mensualite, scenario}`. `suivreCible()` est appelé au début de `calculer()` et recalcule le capital pour garder la même échéance quand le taux, la durée ou la périodicité changent. Saisir un capital, un prix ou un apport annule la cible. L'aide sous le montant explique ce fonctionnement. Les liens transmettent l'échéance avec 2 décimales (sinon le capital était un peu inférieur à celui du calendrier).
- **Vérification** : à 4,5 %, l'étape de mars 2032 donne 17 348 DT ; à 3,75 %, 18 512 DT ; à 2,5 % dans le module Crédit, 20 569 DT. Tests : 283/283, e2e 20/20.

## 3 quindecies. Administration, alertes, statistiques anonymes (9 oct., lot 1 sur 6)

Feuille de route demandée par l'utilisateur, livrée lot par lot :
1. admin, alertes et statistiques ;
2. codes promo, offre de lancement, parrainage ;
3. score de santé, simulateur de vie, optimiseur fiscal ;
4. mode couple / foyer ;
5. application installable (PWA), hors connexion, notifications ;
6. Assistant Orbite (IA, clé API à fournir par l'utilisateur en secret Supabase).

- **Migration `0006_admin_statistiques.sql`** (appliquée, plus `0006b` qui exclut les paiements de test des revenus) :
  - Tables `admins`, `admin_alertes` (déclencheur sur `auth.users`) et `statistiques` (jour, type vue/simulation, clé, nombre). Elles sont protégées par RLS sans politique, donc inaccessibles directement.
  - Fonctions SECURITY DEFINER : `est_admin()`, `admin_tableau()`, `admin_alertes_liste()`, `admin_alertes_lues()`, `admin_statistiques(jours)`. Toutes passent par `exiger_admin()`, qui lève l'erreur 42501.
  - `compter_usage(type, cle)` n'accepte qu'une liste fermée de clés.
  - Les avertissements « authenticated security definer » de l'outil de conseil sont attendus.
- **Admin** : le compte de l'utilisateur a été ajouté par SQL directement en base, jamais dans le dépôt (pour ne pas y écrire son e-mail). Ajouter un admin : `insert into public.admins (user_id) select id from auth.users where email = '…';`.
- **Indicateurs** :
  - Revenus : seulement les paiements dont la passerelle n'est pas `test`.
  - Conversion : comptes ayant payé ÷ essais terminés (hors offerts).
  - Désabonnés : comptes ayant déjà payé dont l'abonnement est expiré.
- **Client** :
  - `session.js` expose `E.admin.*` et `E.compterUsage`.
  - `app.js` compte une vue à chaque changement de vue. Il compte un simulateur une fois par visite : saisie, clic sur un bouton ou un label, ou ouverture par lien avec paramètres.
  - `admin.js` gère la vue `#admin`. Les liens `#rail-admin` et `#param-admin` (ce dernier pour le mobile) n'apparaissent que si `est_admin` le confirme. Une pastille `#badge-admin` signale les inscriptions non lues.
  - `admin` fait partie de `VUES_LIBRES`.
- **Confidentialité** : nouvelle section « Ce que voit l'administrateur », et statistiques anonymes ajoutées aux données traitées.
- **Alerte par e-mail** : non faite, car il faut un service d'envoi (Resend, par exemple) et une clé que l'utilisateur doit créer. Les alertes passent pour l'instant par le tableau de bord et la pastille.
- **Tests** : le faux Supabase gère les fonctions admin et `marquerAdmin()`. Une étape e2e vérifie le refus pour un compte ordinaire, les compteurs, la liste, « marquer lu », la recherche et l'absence de données personnelles dans les compteurs. Résultat : 21/21.

## 3 sexdecies. Codes promo, offre de lancement, parrainage (9 oct., lot 2 sur 6)

- **Migration `0007_promo_parrainage.sql`** (appliquée).
  - Codes promo : table `codes_promo` (remise de 1 à 90 %, formules à `null` = toutes, début et fin, nombre maximal d'utilisations, `automatique` pour l'offre de lancement, `actif`). La table `paiements` reçoit les colonnes `code_promo` et `prix_initial_millimes`.
  - Calcul du prix : `prix_formule(formule, code)` calcule le prix côté serveur. Il retient la meilleure remise entre l'offre automatique et le code saisi (pas de cumul), arrondie à 100 millimes, et au moins 1 DT. Le navigateur n'y a pas accès directement ; la fonction serveur l'appelle.
  - `offres_en_cours(code)` est accessible aux visiteurs, mais le code est ignoré s'ils ne sont pas connectés. `verifier_code(code)` est réservé aux comptes connectés.
  - Parrainage : tables `parrains` (code de 8 caractères généré à la première demande) et `parrainages` (filleul, parrain, `recompense_le`). Fonctions `mon_parrainage()` et `utiliser_code_parrain(code)`, valable dans les 14 jours après l'inscription, avant tout paiement, ni son propre code ni un second code.
  - `activer_paiement` compte l'utilisation du code. Au premier paiement d'un filleul, il ajoute 1 mois au filleul et 1 mois au parrain (fin de son accès en cours, ou maintenant).
  - Administration : `admin_codes()`, `admin_code_enregistrer(jsonb)`, `admin_code_activer(code, actif)`.
  - Test complet effectué par SQL (transaction annulée) : le filleul obtient 399 j, soit l'essai + 12 mois + 1 mois ; le parrain obtient l'essai + 1 mois.
- **Fonction `paiement` v4** : l'action `creer` accepte `code`. Le prix vient de `prix_formule`. La commande enregistre le code et le prix initial, et la description affiche la remise. L'action `detail` renvoie aussi le prix initial et le code.
- **En production** : `LANCEMENT`, −30 % automatique jusqu'au 31/12/2026. Prix : mensuel 6,900, semestriel 34,900, annuel 55,900. Modifiable dans Administration → Codes promo.
- **Client** :
  - Les prix serveur arrivent dans `abonnement-calcul.offres(formules, prixServeur)` : `promo`, `prixAvant`, et `prix` = prix final. Les réductions de durée restent calculées sur les prix de base.
  - La page d'abonnement affiche les prix barrés, la pastille de l'offre et le champ « Code promo » (Appliquer / Retirer).
  - Bloc parrainage : code, « Copier le lien », « Partager » (si `navigator.share`), bilan, et saisie d'un code si `peut_saisir`.
  - Lien d'invitation `/connexion.html?mode=inscription&parrain=CODE` : le code est mémorisé dans localStorage `ef-parrain`, puis enregistré à l'ouverture d'Orbite.
  - L'administration permet de lister, créer, modifier et activer les codes, et affiche le bilan du parrainage. Les CGV ont une nouvelle section « Offres, codes promo et parrainage ».
- **Tests** : nouvelle étape e2e. L'admin crée LANCEMENT et AMI30 ; on vérifie les prix barrés, un code faux, AMI30 sur l'annuel (55,900), puis le filleul inscrit par le lien qui paie l'annuel. Résultats : le parrain gagne environ 30 j, e2e 22/22, unitaires 286.

## 3 septdecies. Score de santé, simulateur de vie, optimiseur fiscal (9 oct., lot 3 sur 6)

- **Moteur `public/espace/js/orbite-intelligence.js`** (UMD, exposé en `window.OrbiteIntelligence`, testé par `tests/espace/orbite-intelligence.test.js`, 8 tests). Il s'appuie sur `OrbiteCalcul` et `MoteurFiscal` et ne duplique aucune règle.
  - **`scoreSante(sy)`** : note sur 100 en six critères.
    - endettement par rapport à la règle de la banque : 25 points ;
    - reste à vivre : 20 ;
    - épargne de précaution, en mois de dépenses (cible : 6 mois) : 20 ;
    - épargne de long terme, versements annuels ÷ net, cible 10 % : 15 ;
    - avantage fiscal utilisé : 10 ;
    - taux des crédits par rapport au marché : 10.

    Niveaux : Excellente (80 et plus), Bonne (60), Fragile (40), À redresser. Il renvoie aussi les trois objectifs qui rapportent le plus de points, chacun avec un lien.
  - **`optimiseurFiscal(sy, {budgetAnnuel})`** :
    - calcule l'économie actuelle (mensualités × 12 + versements libres de l'année) et l'économie maximale ;
    - cherche par dichotomie le plus petit complément qui atteint l'économie maximale, avec le meilleur partage assurance vie / CEA ;
    - propose la meilleure répartition d'un budget limité ;
    - donne les jours avant le 31/12 et les mois restants, et `rappel` (3 derniers mois, s'il reste plus de 20 DT à gagner).
    - Statuts : `sans_impot`, `optimise`, `a_optimiser`.
  - **`simulateurVie(profil, evts)`** : événements mariage, naissance, augmentation, mutation (salaire et loyer), immobilier (prix, apport, durée jusqu'à 25 ans, taux, quitter la location) et voiture (7 ans au plus).
    - Les taux par défaut viennent de `tauxNouveaux`. L'apport est pris sur l'épargne.
    - Il compare 8 indicateurs avant / après, avec une alerte en cas de déficit ou si l'endettement dépasse la quotité.
- **Profil de l'utilisateur (4 000 × 17, brut, 3 crédits, 5 000 DT d'épargne)** :
  - score de 51 (Fragile), avec dans l'ordre : réserve de précaution, endettement (confortable dès mars 2032), épargne régulière ;
  - optimiseur : économie actuelle de 456 DT, maximale de 9 138 DT, pour un complément de 5 650 DT en assurance vie et 18 560 DT en CEA.
- **Interface** :
  - Section « Votre santé financière » dans Mon orbite : jauge, critères, objectifs, et rappel fiscal de fin d'année. Le calcul est repoussé de 120 ms après chaque mise à jour du profil.
  - Nouvelle vue `#vie` « Vie & impôts » (`vue-vie.js`) avec les onglets `vie` et `fiscal`.
  - Simulateur de vie : bouton « C'est fait : mettre mon profil à jour », annulable par un toast « Annuler ».
  - Optimiseur fiscal : budget proposé par défaut = plafond budget × mois restants. Lien vers `#epargne?versement=`.
  - Lien « Vie & impôts » dans le menu (icône cible).
  - Statistiques d'usage `simulation:vie` et `simulation:fiscal`.
- **Tests** : unitaires 294, e2e 23/23 (étape santé, vie, application et annulation, fiscal), axe sans violation, `resp.js` sans débordement, vue `vie` comprise.

## 3 octodecies. Mode couple / foyer (9 oct., lot 4 sur 6)

- **Profil** (`normaliser`) : nouveaux champs plats `foyer` (booléen), `conjointPrenom`, `conjointMontant`, `conjointSens`, `conjointSalaires` (12 à 18), `conjointSecteur` et `conjointCredits` (mensualités des crédits à son nom).
- **Moteur** : `OI.foyer(sy)` renvoie null si le mode est inactif ou sans salaire.
  - Le conjoint est imposé séparément, sans déductions familiales : `OC.salaire` avec `chefDeFamille: false`.
  - Capacité commune : revenus des deux selon la règle de la banque (net ou brut, revenu annuel ÷ 12 ou mensuel) × quotité − crédits des deux.
  - Budget commun : net moyen des deux − crédits − logement − charges − épargne.
  - Logement et charges communes partagés au prorata des nets.
  - `gainCapacite` donne ce que le second salaire apporte.
  - 3 tests.
- **Profil (interface)** : section « Votre foyer » (`#sec-foyer`, lien `#profil?section=foyer`) avec interrupteur et champs du conjoint.
  - Les champs du conjoint s'affichent via `rendreFoyer`, hors de `remplirChamps`. Piège : `remplirChamps` est sauté pendant `enEdition` (la case à cocher déclenche « input »).
- **Mon orbite** : bloc « Votre foyer » visible en mode couple : indicateurs, part de chacun, contribution aux charges, et ce que la banque peut prêter ensemble (immobilier, auto, consommation), avec « Simuler » qui transmet la mensualité.
- **Exemple** : avec le profil de l'utilisateur et un conjoint à 2 000 DT brut × 13, la mensualité commune est de 1 065 DT (+867 DT), soit 168 261 DT en immobilier sur 20 ans à 4,5 %.
- **Tests** : unitaires 297, e2e 24/24 (activation, vérification, désactivation), aucun débordement.

## 3 novodecies. Application installable, hors connexion, rappels (9 oct., lot 5 sur 6)

- **Service worker `public/sw.js`** (portée `/`, enregistré par `public/espace/js/appli.js`) :
  - À l'installation, il met en cache `/espace/`, tous les scripts, styles et icônes cités par la page, ainsi que les polices citées par les CSS (62 fichiers).
  - Navigation : réseau d'abord, puis cache si le réseau manque. Fichiers statiques : cache tout de suite, mise à jour en arrière-plan.
  - Jamais en cache : les autres domaines (Supabase), les requêtes autres que GET, le retour de paiement et `paiement-test.html`.
  - Le cache `orbite-<date>-site` est versionné par la constante `VERSION` (à changer pour forcer un nouveau cache). En-tête `/sw.js` : `Cache-Control: no-cache`.
- **Session hors connexion** (`session.js`, `exigerConnexion`) : une erreur réseau de `getUser` ne déconnecte plus. On utilise alors l'utilisateur de la session enregistrée sur l'appareil (`E.horsLigne()`, `E.estErreurReseau`).
  - Bandeau `#hors-ligne`.
  - Un profil modifié hors connexion est enregistré à l'événement `online` (`profilEnAttente`), et la session est revérifiée au retour du réseau.
- **Rappels** :
  - `rappels-calcul.js` (pur, 5 tests) : veille de la fin d'essai, 3 jours avant la fin d'abonnement, mois de la dernière échéance d'un crédit (dans les 13 mois), 1er et 15 décembre s'il reste une économie d'impôt à saisir. Les identifiants sont stables, pour n'afficher chaque rappel qu'une fois.
  - `appli.js` : préférence propre à l'appareil `ef-rappels` (Paramètres → Préférences → Rappels). Après autorisation, la liste est envoyée au service worker (`postMessage`), qui l'enregistre dans le cache `orbite-rappels` (`/__orbite/rappels.json`).
  - Les rappels s'affichent au bon moment et une seule fois (`rappels-vus.json`) : tout de suite quand Orbite est ouverte, et via `periodicSync` (12 h) pour l'application installée sous Chrome / Edge. Un clic sur la notification ouvre la bonne page.
  - Limite : sans application installée ni navigateur compatible, les rappels n'apparaissent qu'à l'ouverture d'Orbite. Un vrai « push » serveur demanderait des clés VAPID et une fonction planifiée (prochaine étape possible).
- **Installation** : invitation `beforeinstallprompt` (bouton « Installer Orbite »), instructions pour iPhone, et état affiché. Le manifeste et les icônes existaient déjà.
- **Confidentialité** : nouvelle rubrique « Application et hors connexion » (cache des fichiers du site seulement ; rappels calculés et affichés sur l'appareil).
- **Tests** : unitaires 302, e2e 25/25. L'étape service worker vérifie la coupure réseau, le rechargement depuis le cache, le bandeau et les rappels. Pièges : avec `setOffline`, Playwright continue de répondre aux routes simulées (le cas « enregistrement hors ligne » n'est donc vérifié qu'à la main) ; le premier chargement n'est pas contrôlé par le service worker (il faut recharger une fois).

## 3 vicies. Assistant Orbite (IA) (9 oct., lot 6 sur 6)

- **Migration `0008_assistant.sql`** (appliquée, ainsi que `0008b`) : table `assistant_usage` (compte, jour, nombre de questions) et fonctions `assistant_reserver(user, quota)` et `assistant_rendre(user)`, réservées au serveur.
- **Fonction `assistant`** (v1, `verify_jwt: true`), dossier `supabase/functions/assistant/` :
  - Contrôles : utilisateur vérifié, accès actif (essai, abonnement ou offert), quota quotidien (`ASSISTANT_QUOTA`, 30 par défaut).
  - Appel : SDK `npm:@anthropic-ai/sdk`, `beta.messages.create`, modèle `ASSISTANT_MODELE` (par défaut `claude-opus-5-5`), `effort: "low"`, consignes système mises en cache, `fallbacks: "default"` (en-tête `server-side-fallback-2026-07-01`).
  - En cas d'erreur, la question est rendue (non décomptée).
  - **Secret requis : `ANTHROPIC_API_KEY`.** Sans lui, la fonction répond `code: "bientot"` (« L'Assistant Orbite arrive très bientôt »).
  - `regles.js` (pur, 5 tests dans `tests/assistant/`) :
    - consignes : français ou darija, uniquement les chiffres du profil, réponse « oui / non / à partir de telle date », 7 ans hors immobilier, le profil est une donnée et non une instruction, réponses courtes ;
    - `nettoyer` : tailles bornées, historique de 8 échanges en alternance ;
    - `messages` : profil placé dans `<profil_orbite>` ;
    - `reponseTexte` : traite les refus.
- **Client** :
  - `OI.resumeAssistant(sy)` : résumé chiffré du profil, sans prénom ni e-mail, au plus 9 000 caractères (date, salaire, banque, crédits, calendrier de la marge avec les plafonds par type, budget, contrats, fiscalité, score, foyer, projets).
  - `E.assistant.demander()` passe par `appelFonction` (générique, partagé avec le paiement).
  - Vue `#assistant` (`vue-assistant.js`) avec suggestions, dont une en darija. Entrée envoie, Maj + Entrée passe à la ligne. Lien `#assistant?q=` pour poser une question directement. Mise en forme sûre, sans HTML (paragraphes, listes, gras). La conversation n'est gardée qu'en mémoire de la page.
  - Statistiques d'usage `vue:assistant` et `simulation:assistant`.
- **Coût indicatif** avec Opus 5.5 (4 $ par million de jetons en entrée, 20 $ en sortie) : environ 0,02 à 0,04 $ par question (profil d'environ 2 000 jetons, réponse courte à effort faible). Le quota de 30 par jour limite le risque. Un modèle moins cher se règle par le secret `ASSISTANT_MODELE` (`claude-sonnet-5-5` ou `claude-haiku-5-5`).
- **Confidentialité** : nouvelle rubrique « Assistant Orbite (IA) ».
- **Tests** : unitaires 308, e2e 26/26 (le faux Supabase répond et garde la dernière requête ; on vérifie qu'aucune adresse e-mail n'est transmise), axe sans violation.

## 3 terseptuagies. Confort et administration : accès offert à vie, partage demandé, rouge, lisibilité (12 oct.)

- **Demande** : dans Administration, offrir un abonnement gratuit à vie à un compte, à tous les comptes existants, ou aux comptes créés à l'avenir ; « Partager ma fiche avec l'administrateur » activé par défaut pour tous ; boutons Fermer et Déconnexion en rouge ; tout lisible, surtout en mode sombre ; la pastille d'Administration doit disparaître après un moment et revenir seulement avec de nouvelles données.
- **Choix validés** :
  - accès à vie **retirable** ;
  - partage : **demandé à chacun, « Partager » en avant**. Pas de case cochée d'avance : la loi organique 2004-63 exige un accord exprès ;
  - pastille visible **1 minute**.
- **Accès offert à vie** (migration `0014_offert_a_vie.sql`) :
  - c'est l'état « offert » qui existait déjà (`abonnements.offert`, `mon_acces()` → `offert`) ; ajout de `offert_par` (`compte`, `tous`, `nouveaux`) et `offert_le` ;
  - table `reglages` (RLS, aucun accès direct), clé `offert_nouveaux` ;
  - `creer_abonnement()` (déclencheur d'inscription) donne l'accès offert quand ce réglage est actif ;
  - fonctions réservées à l'admin (`exiger_admin()`) : `admin_offert_etat()`, `admin_offrir(p_user, p_offert)`, `admin_offrir_tous(p_offert)`, `admin_offrir_nouveaux(p_actif)` ;
  - retirer remet `offert` à faux sans toucher `essai_fin` ni `fin` : le compte retrouve son essai ou son abonnement payé ;
  - « Retirer à tous » ne retire que les accès donnés par ces fonctions (`offert_par` non vide). Un accès offert avant (`offert_par` vide) se retire compte par compte ;
  - `admin_tableau()` renvoie aussi `id` et `offert_par` par compte, `offert_nouveaux` et `offerts_admin`.
- **Interface admin** (`admin.js`) :
  - panneau « Accès offert à vie » après « Abonnements et revenus » : interrupteur pour les nouveaux comptes, boutons « Offrir à tous » et « Retirer à tous » avec confirmation dans `#dlg-offert` (nombre de comptes concernés) ;
  - colonne « Accès à vie » dans « Comptes » : « Offrir à vie » ou « Retirer », avec l'origine (offert à ce compte, à tous, à l'inscription, ou avant cette fonction).
- **Demande de partage** (`partage-demande.js`, `#dlg-partage`) :
  - posée **une fois** par compte, au lancement qui suit le premier pas (jamais pendant le premier pas, la visite ou une autre fenêtre : elle attend son tour) ;
  - pas posée à l'admin, ni à un compte qui partage déjà ;
  - « Partager ma fiche » (bouton plein, focus) appelle `partage_admin_definir(true)` ; « Pas maintenant » et Échap ne partagent rien ;
  - la réponse est retenue dans `user_metadata.orbite_partage_demande` (date) et `orbite_partage_reponse` (`oui` / `non`) : pas de nouvelle demande ;
  - Paramètres se met à jour (événement `orbite:partage`).
- **Rouge** (`confort.css`, classe `bouton--fermer`) : déconnexion de la barre, « Me déconnecter partout », « Se déconnecter » de l'écran d'acceptation, Fermer de la fiche admin, des applications, de la lecture de fiche, de la négociation, du reçu fiscal, de l'histoire de l'année ; « Fermer » des notifications d'erreur (`toast__fermer`). « Annuler » reste neutre.
- **Pastille Administration** :
  - visible 1 minute, puis s'efface ; la date de la dernière inscription montrée est gardée dans `localStorage` (`orbite_admin_pastille_vu`) ;
  - elle revient seulement pour des inscriptions plus récentes, avec leur nombre ;
  - vérification toutes les 90 s tant que la page est visible, et au retour sur l'onglet ;
  - les « +N » après « Actualiser » s'effacent aussi au bout d'une minute.
- **Lisibilité** :
  - nouveau script `e2e/lisibilite.js` : contraste WCAG AA de chaque texte visible de 16 vues, de la barre, du rail et de 4 fenêtres, en clair puis en sombre ;
  - corrigé : « obligatoire » en sombre (2,1 → 9:1), textes d'exemple des champs (gris du navigateur trop pâle en sombre) ;
  - résultat : 0 texte sous le seuil. Les captures sombres ont aussi été relues à l'œil.
- **Versions** : SW `orbite-2026-10-12g`, Nouveautés `2026-10-12f` (« Plus confortable à lire »).
- **Tests** : 3 étapes e2e (demande de partage refusée puis jamais redemandée ; partage accepté après « Quoi de neuf » ; accès à vie un compte, tous, nouveaux, et pastille d'une minute avec horloge simulée dans une session à part) → 57/57.

## 3 duoseptuagies. Tout dans Orbite : bilan des simulateurs, lanceur d'applications (12 oct.)

- **Demande** : l'utilisateur trouve dans les simulateurs de crédit et d'assurance vie des options absentes d'Orbite. Il veut tout dans une seule application, et pouvoir ouvrir les simulateurs depuis Orbite sans passer d'une application à l'autre.
- **Bilan** (maquette https://claude.ai/artifact/DfKbFaPFpPDD6ei3Z1GgKJ) : tous les calculs des deux simulateurs sont déjà dans Orbite. Restent 11 fonctions à ajouter et 3 présentes en partie ; les 9 fonctions pour conseillers en agence ne sont pas reprises.
- **Validé le 12 oct.** :
  - **lot 1, crédit complet** : saisie en une phrase et à la voix, voyage dans le temps et analyse visuelle, lire une offre bancaire en photo, audit du tableau de la banque depuis un PDF ou une photo avec rapport PDF, échéancier en PDF et en Excel, lettre en Word ;
  - **lot 2** : partage par lien, QR, WhatsApp et e-mail ; simulation guidée ; comparer 2 ou 3 simulations enregistrées ; rappel de versement mensuel ; annuler et rétablir ; haute lisibilité ; recevoir un PDF partagé ;
  - **lot 3** : Orbite en arabe ;
  - **lanceur** : les simulateurs s'ouvrent **dans Orbite** ;
  - **fonctions pour conseillers** (mode conseiller, agence, logo, présentation client, second écran, proposition commerciale, portefeuille, « Être rappelé », statistiques) : **laissées dans les simulateurs** ;
  - **vidéo 3D** de 30 s selon le storyboard de la maquette.
- **Lanceur** (`lanceur.js`, `lanceur.css`) :
  - icône `grille` `#apps-ouvrir` dans la barre, après la loupe ;
  - fenêtre `#dlg-apps` : 8 parties d'Orbite (Négociation et Dossier banque passent par leur vue) et 4 simulateurs, marqués d'un petit cercle ;
  - un simulateur s'ouvre dans `#dlg-simulateur`, en plein écran, dans une iframe en bac à sable (`allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals`, `referrerpolicy=no-referrer`). Pas de navigation de la page Orbite. Origine différente, donc le simulateur ne voit ni le compte ni le profil ;
  - « ← Orbite » ou le bouton retour du téléphone (`history.pushState`, puis `popstate`) ramènent à la vue d'avant ; « Ouvrir à part » ouvre un nouvel onglet ;
  - chaque iframe est gardée tant que la page est ouverte, donc l'état du simulateur est conservé ;
  - attente animée ; message « hors connexion », et après 12 s « prend du temps » ;
  - lien direct `#<vue>?simulateur=credit|vie|auto|salaire` ; API `Orbite.ouvrirApps()`, `Orbite.ouvrirSimulateur(clé)`, `Orbite.SIMULATEURS` ;
  - palette : « Mes applications » et un groupe « Simulateurs » (`a-sim-<clé>`, comptés dans les récents) ;
  - sur un écran de 440 px ou moins, le titre de la barre est masqué (les onglets du bas le donnent).
- **CSP** : `frame-src https://mohamed-ja.github.io` ajouté à la seule règle `/espace/*` de `_headers`.
- **Simulateurs** (branche `dans-orbite` de simulateur-credit, simulateur-assurance-vie, simulateur-Assurance-Automobile, portail-rh/calculateur-salaire) :
  - un petit script dans `<head>` ajoute la classe `dans-orbite` quand la page est dans un cadre ;
  - une règle CSS masque alors la bande Orbite, la carte Orbite, la carte « Ce net, et ensuite ? » et les liens vers `workers.dev` ;
  - caches des services workers montés (crédit `2026-10-12-2`, vie `simulateur-av-v15`, auto `2026-10-12b`, salaire `calc-salaire-v15`).
- **Versions** : SW `orbite-2026-10-12f`, Nouveautés `2026-10-12e` (applications, négociateur, palette, raccourcis).
- **Tests** : étape e2e « lanceur ». Les simulateurs y sont remplacés par une page locale (`page.route`) : navigation, cadre isolé, état gardé, bouton retour du navigateur, palette, lien direct, téléphone.

## 3 unseptuagies. Négociateur de salaire (12 oct.)

- **Maquette** https://claude.ai/artifact/Wu7rFqSwpMcPWMFhokqDG4 (calculée par le vrai moteur de paie, profil fictif « Aziz Démo »). **Validée** le 12 oct. avec : entrées « Partout », note PDF « Les deux au choix », onglet « Offre reçue » « Maintenant ».
- **Moteur pur** `public/espace/js/negociateur-calcul.js` (`window.Negociateur`, dépend d'OrbiteCalcul, Progression, CalculSalaire, PARAMETRES_PAIE ; chargé après `dossier-calcul.js`) :
  - `preparer(p, { mode: "pct" | "net" | "brut", valeur }, { marge, reussites }, maintenant)` ; `null` pour un retraité ou sans salaire ;
  - base = salaire de base brut d'un mois habituel (`OC.entreeBrut`, saisie à l'année ramenée au mois) ; net = net d'un mois habituel (`calculerAvecVersements`) ; brut pour un net visé : `calculerDepuisNet` ;
  - objectifs acceptés : 1 à 100 % ; net ou brut au-dessus de l'actuel et au plus le double ;
  - **plancher** = brut actuel × `Progression.indice(année de la dernière hausse, année en cours)`, arrondi aux 10 DT au-dessus. C'est la règle de Ma progression, pour que l'inflation affichée concorde partout. Repère : la dernière hausse datée de l'historique, sinon l'embauche, sinon la dernière année ;
  - **ancre** = cible × (1 + marge), arrondie aux 50 DT au-dessus (marge de 0 à 25 %, 5 % par défaut ; 0 = ancre égale à la cible) ;
  - `garde` : part nette, CNSS, IRPP et CSS de chaque dinar de hausse brute (somme = 1) ;
  - `alternatives` : prime unique au même gain net annuel (par dichotomie), un salaire de plus par an (pas au-delà de 16), hausse en deux temps (part du gain la première année) ;
  - `arguments` : prix, pouvoir d'achat, ancienneté, durée sans hausse, avec mention « provisoire » pour l'année en cours ; `phrase` prête, qui annonce l'ancre ;
  - `offre(p, { brut, salaires }, maintenant)` : primes de l'employeur actuel non reprises ; contre-proposition pour +20 % net sur l'année, arrondie aux 50 DT ; `atteint` si l'offre y est déjà.
- **PDF** `negociateur-pdf.js` (`window.NegociateurPDF.generer`, jsPDF chargé à la demande) :
  - « pour moi » : aide-mémoire d'une page, marqué « Document personnel » : paliers, chiffres, part gardée, arguments, réalisations, alternatives, phrase, conseils d'entretien ;
  - « pour mon responsable » : salaire actuel, **salaire demandé = le chiffre annoncé (l'ancre)**, pour que la note et la phrase dite donnent le même montant ; arguments et réalisations ; ni plancher, ni marge, ni alternatives ;
  - le pire cas (5 réussites et l'alerte du plancher) tient sur une page.
- **Fenêtre** `#dlg-nego` (`vue-negociateur.js`, `negociateur.css`) :
  - deux colonnes sur PC, une sur téléphone (sous-titre et aide du pied masqués, bouton « Ma note ») ;
  - échelle des paliers placée par CSSOM ; étiquettes tournées vers l'intérieur aux deux bouts ; si deux jalons sont à moins de 74 px, l'étiquette la moins utile se tait ;
  - les réussites restent sur l'appareil (`localStorage` `orbite_nego_reussites`, sous try/catch) ;
  - « J'ai obtenu… » ouvre « Mettre à jour mon salaire », prérempli avec la cible dans l'unité du profil.
- **Entrées** :
  - bouton `#nego-ouvrir` dans l'en-tête du module Salaire (groupe `.module__actions` avec « Contrôler ma fiche de paie », masqué pour un retraité) ;
  - carte `#pg-nego-carte` dans Ma progression › Carrière ;
  - action `a-nego` de la palette (mots-clés dont « zyeda ») ;
  - lien `#salaire?nego=1` (`&mode=offre`) ; API `Orbite.ouvrirNegociation(o)`, `Orbite.negociationPossible()`.
- **Versions** : SW `orbite-2026-10-12e`, Nouveautés `2026-10-12d` (négociateur, palette, raccourcis, dossier banque).
- **Tests** : 12 tests unitaires dans `tests/espace/negociateur.test.js` ; étape e2e « négociateur » (cible égale au moteur, unités, refus, plancher, marge 0, réussites, 2 PDF, offre reçue, « J'ai obtenu… », 3 entrées, téléphone).

## 3 septuagies. Palette Ctrl + K et raccourcis de l'application installée (12 oct.)

- **Ouverture** : Ctrl + K (⌘ + K sur Mac, ferme aussi), « / » hors d'un champ et hors d'une autre fenêtre (et pas avant le premier pas), loupe `#palette-ouvrir` dans la barre, partout (rappel « Ctrl K » affiché seulement à partir de 1 024 px). Échap ou clic hors de la fenêtre ferme.
- **Fichiers** : `public/espace/js/palette.js` (chargé après `vue-dossier.js`), `public/espace/palette.css`, fenêtre `#dlg-palette` dans `index.html` (champ `#palette-q` en `combobox`, liste `#palette-liste` en `listbox`, `aria-activedescendant`). API : `Orbite.ouvrirPalette(texte)`.
- **Catalogue** (dans `catalogue()`, recalculé à chaque frappe) :
  - 10 vues, 13 sections (liens `#vue?onglet=` / `?section=`), 8 actions ;
  - actions : salaire (`O.mettreAJourSalaire`), dossier banque (`O.ouvrirDossier` après passage sur `#credit`), fiche de paie (clic `#fiche-controle` sur `#salaire`, absente pour un retraité), visite (`#aide-visite`), thème (`#bascule-theme`, libellé et icône selon le thème courant), mode Expert, export (`#exporter`), déconnexion ;
  - `surVue(nom, fn)` : va sur la vue, attend `orbite:vue`, puis agit ; `aller(hash)` réaffiche la vue si l'adresse est déjà la bonne ;
  - « En ce moment » (dates seulement) : « Verser avant le 31 décembre » du 15 octobre au 31 décembre, « Mon année en orbite » du 15 décembre au 31 janvier.
- **Recherche** : sans accents ni apostrophes, tous les morceaux tapés doivent apparaître (titre, sous-titre ou mots-clés, darija comprise : kridi, khedma, dhariba, t9a3od). Score : titre qui commence par le mot (0), titre qui le contient (1), mot-clé seul (2). Les résultats restent groupés (Vues, Sections, Actions) ; le groupe qui a le meilleur résultat passe devant. Le morceau trouvé est surligné dans le titre.
- **Assistant** : dernière ligne « Demander à l'Assistant : « … » » dès 3 mots ou quand rien ne correspond (≤ 200 caractères) → `#assistant?q=`. Le message « Rien ne correspond » n'apparaît donc qu'au-delà de 200 caractères.
- **Récents** : 3 identifiants (vues, sections, actions ; jamais la question) dans `localStorage` `orbite_palette_recents`, lecture et écriture sous try/catch. Aucun montant ni donnée du profil dans la palette (vérifié en e2e).
- **Téléphone** (≤ 640 px) : feuille basse, raccourcis clavier et colonne de droite masqués.
- **Raccourcis du manifeste** (`public/manifest.webmanifest`) : Mettre à jour mon salaire (`/espace/#profil?section=salaire&salaire=1`, ouvre la fenêtre du salaire via `vue-profil.js`), Dossier banque (`#credit?dossier=1`), Mon orbite, Ma progression. Icônes 96 × 96 générées avec PIL dans `public/orbite/raccourcis/` (vert hausse, bleu fiche, noir orbite, violet cible).
- **Versions** : SW `orbite-2026-10-12d`, Nouveautés `2026-10-12c` (4 points : palette, raccourcis, dossier banque, visite guidée).
- **Tests** : unitaires 473 ; e2e nouvelle étape « palette » (darija, « / » dans un champ n'ouvre rien, flèches, récents, thème aller-retour, phrase vers l'Assistant, manifeste et icônes, lien `salaire=1`, téléphone), captures `palette.png` et `palette-mobile.png`.

## 3 novosexagies. Programme « Fable » : palette Ctrl + K, raccourcis, négociateur, immobilier, LF 2027, apparence, graphiques, journal (12 oct.)

- **Contexte** : l'utilisateur passe au modèle Fable 5.1 et demande de nouvelles propositions (fonctionnalités, design, options avancées). Mes 9 propositions, toutes gratuites ; **choix de l'utilisateur** (12 oct.) :
  - fonctionnalités : **négociateur de salaire** (net visé → brut à demander, arguments chiffrés, note PDF), **projet immobilier de A à Z** (apport, frais, mensualité, « quand pourrai-je acheter ? », règles sourcées soumises à validation), **loi de finances 2027 avant/après** (bascule 2026/2027 dès la publication, en décembre) ; **profils invités** écarté ;
  - design : **palette de commandes Ctrl + K**, **apparence personnelle** (accent, densité, taille du texte), **graphiques unifiés** (survol, export en image) ;
  - options : **journal des modifications et « Annuler »**, **raccourcis de l'application installée**.
  - **Ordre** : Ctrl + K puis raccourcis, puis négociateur, immobilier, journal, apparence, graphiques, LF 2027 en décembre ; ensuite le programme précédent (comparateur d'offres, TMM, rachat, budget, calendrier).
- **Palette Ctrl + K** : maquette https://claude.ai/artifact/H76Hz8zQAe4hSSgVaqh4Dt (**validée** le 12 oct. : loupe « Partout », touche « / » oui, raccourcis « ceux de la maquette » ; livrée, voir « 3 septuagies »). Ouverture : Ctrl/⌘ + K, « / » hors champ, loupe dans la barre ; vide : 3 récents + actions du moment ; recherche sans accents, morceaux de mots, darija (kridi, khedma, dhariba, t9a3od) ; dernière ligne « Demander à l'Assistant » ; aucun chiffre du profil dans la palette. Raccourcis du manifest à remplacer par : Mettre à jour mon salaire, Dossier banque, Mon orbite, Ma progression (icônes dédiées).

## 3 octosexagies. Enfants réservés au chef de famille (12 oct.)

- **Remarque de l'utilisateur** : « quand chef de famille n'est pas activé, logiquement je ne peux pas ajouter de nombre d'enfants ». Juste : le moteur (`enfantsReservesAuChefDeFamille: true`) ignorait déjà enfants, étudiants et handicapés sans chef de famille, mais l'interface laissait saisir des valeurs sans effet.
- **Correction** :
  - Mon profil : les trois compteurs (enfants, étudiants, handicapés) sont **désactivés** tant que « Chef de famille » est décoché, lignes grisées (`data-seul-chef`, `.compteur-ligne--bloque`) et aide `#p-enfants-aide` (« la déduction lui est réservée »). Les valeurs ne sont pas effacées : elles reviennent si la case est recochée. `majEnfants(p)` est appelée à chaque rendu, y compris pendant une saisie (`remplirChamps` est sautée en édition).
  - Module Salaire : les lignes étudiants et handicapés (dans « Plus d'options ») suivent désormais la case, comme la ligne enfants (`data-seul-chef`).
  - Pages publiques (salaire, impôt) : le compteur d'enfants est généré désactivé (`aria-disabled`, titre « Réservé au chef de famille ») et s'active au `change` de la case (`majEnfants()` dans `pages-publiques.js`).
  - Les parents à charge ne dépendent pas du chef de famille : inchangés.
- **Tests** : e2e profil (compteurs bloqués puis débloqués, aide visible) et pages publiques (compteur bloqué avant la case). Pour cocher l'interrupteur du profil dans Playwright, cliquer sur `.interrupteur__piste` : un clic forcé sur l'`input` (1 px, opacité 0) ne le bascule pas.
- SW `orbite-2026-10-12c`.

## 3 septsexagies. Référencement : 3 nouvelles pages publiques, liens des simulateurs, textes réseaux (12 oct.)

- **Contexte** : l'accueil est indexé, mais Orbite n'apparaît pas en première page.
  - Ce que j'ai dit à l'utilisateur : personne ne peut garantir la première place. Les mots seuls (« crédit », « simulateur », « finances », « Orbite ») sont tenus par les banques et des sites anciens. Le site a quelques jours, et les liens venant d'autres sites manquent.
  - Ce qui est réaliste et gratuit : viser des recherches précises, une page par recherche, des liens depuis les autres simulateurs, des textes pour LinkedIn et Facebook. Il faut compter 3 à 6 mois.
- **Choix de l'utilisateur** :
  - référencement **avant** le programme des 6 fonctionnalités ;
  - 3 pages : simulateur de crédit, simulateur d'assurance vie, calcul du CEA ;
  - liens depuis **tous** les simulateurs ;
  - textes LinkedIn et Facebook ;
  - menu à **5 entrées**.
- Maquette validée : https://claude.ai/artifact/AjaysK5iZAFqxRgqM8GGhy.
- **Les 3 pages** (générées par `scripts/pages-publiques.js`, même structure que les 4 autres) :
  - **`/simulateur-credit-tunisie`** :
    - calcul : bascule Logement / Voiture / Consommation, chacune avec son exemple (120 000 DT sur 20 ans, marge 2,5 ; 40 000 DT sur 7 ans, marge 3 ; 15 000 DT sur 5 ans, marge 3,5), durée bornée à 25 ou 7 ans, taux = TMM d'Orbite + marge ;
    - résultats : mensualité, capital, intérêts, coût total ;
    - tableaux : mensualité selon montant et durée ; effet d'une hausse du TMM (+0,5, +1, +2 points) sur 3 crédits types.
  - **`/simulateur-assurance-vie-tunisie`** :
    - calcul : versement, durée, rendement et salaire brut ;
    - capital : `Projection.projeter`, sans frais ;
    - impôt économisé chaque année : `MoteurFiscal.simuler`, avec le `revenuFiscal` de la synthèse, comme l'optimiseur fiscal ; exemple 720 DT pour 200 DT par mois et 2 500 DT brut ;
    - tableaux : capital selon le versement et l'horizon ; économie selon le salaire.
  - **`/calcul-cea-tunisie`** :
    - calcul : dépôt et salaire brut ; économie, dépôt utile (`ceaUtile`), impôt minimum de 60 %, disponibilité au 1er janvier de l'année + 1 + 5 ;
    - états : `au_dela` et `sans_impot` ;
    - tableaux : dépôt utile selon le salaire ; CEA ou assurance vie.
  - **Fonctions et affichage** : `PagesCalcul.simulCredit`, `assuranceVie`, `cea` (dépendent maintenant de `MoteurFiscal` et `Projection`) ; `affichage("pret" | "vie" | "cea")`. Le taux s'affiche avec 0, 1 ou 2 décimales (bug « 10 % → 1 % » corrigé par un test). Espaces insécables avant DT et %.
  - **Navigateur** : `pages-publiques.js` lit les champs page par page (les lire tous plantait sur les autres pages). Le choix du type de crédit reprend son exemple (`data-montant`, `data-duree`, `data-marge`).
  - **Pont** : `pontFonctions`, avec 3 fonctions d'Orbite sans chiffre.
  - **Menu à 5 entrées (`NAV`)** : Salaire net, Crédit (simulateur et capacité), Assurance vie (simulateur et impôt), CEA, Retraite. `aria-current="page"` sur la page même, `"true"` sur la page sœur.
  - **Liens entre pages** : chaque page renvoie vers les 6 autres, en 2 rangées de 3 sur grand écran. Le pied de l'accueil a 7 liens.
- **Partout ailleurs** : `DATE_PAGES` au 12 oct. 2026 (toutes les pages régénérées) ; sitemap de 10 URL, toutes en `lastmod` 2026-10-12 ; CSP des 3 pages dans `_headers` (avec et sans `.html`).
- **Tests** : 3 nouveaux tests de calcul ; le test HTML passe à 7 pages ; étape e2e « pages publiques » étendue (type de crédit, taux, menu, assurance vie non imposée, CEA au-delà du dépôt utile, téléphone pour les 7 pages).
- **Livré** : PR #104 fusionnée.
- **Liens depuis les simulateurs** (12 oct.) :
  - les 3 simulateurs ont reçu les mêmes ajouts :
    - une bande « Orbite : salaire, crédit, impôt et retraite en Tunisie, au même endroit. » avec le lien « Découvrir Orbite » vers l'**accueil** (avant : la page de connexion, exclue des moteurs, sans effet) ;
    - une **carte Orbite** dans « Les autres simulateurs » (grille 2 × 2) ;
    - **Orbite en tête de la signature** ;
  - simulateur-credit#3 : carte vers `/capacite-credit-tunisie`, traductions arabes `data-t`, cache `2026-10-12-1` ;
  - simulateur-assurance-vie#4 : carte vers `/calcul-cea-tunisie`, traductions anglaises et arabes dans `js/i18n.js` (son test exige une traduction pour chaque chaîne, y compris « Orbite »), cache `simulateur-av-v14`, tests 114/114 ;
  - simulateur-Assurance-Automobile#2 (attention au nom du dépôt, avec des majuscules) : nouvelle bande (styles repris de `espace-bande.css`), carte vers `/simulateur-credit-tunisie` dans les 2 sections, signature aux 2 endroits, cache `2026-10-12a` ;
  - portail-rh renvoyait déjà vers l'accueil (portail-rh#13).
- **Textes pour les réseaux** : un article LinkedIn (lien de partage `https://mohamed-ja.github.io/portail-rh/orbite/`, car LinkedIn ne lit pas workers.dev) et 2 publications Facebook (crédit auto → `/simulateur-credit-tunisie` ; CEA et assurance vie avant le 31 décembre → `/calcul-cea-tunisie`), sans prix, essai, offre ni parrainage. Remis à l'utilisateur le 12 oct.
- **À faire par l'utilisateur** :
  - Search Console : renvoyer le sitemap (10 pages), puis demander l'indexation des 3 nouvelles adresses (quota d'environ 10 par jour) ;
  - publier les textes ;
  - Bing Webmaster Tools : envoyer les 3 nouvelles adresses.

## 3 sexsexagies. Programme de 6 fonctionnalités + « Mon dossier banque » (12 oct.)

- **Programme choisi par l'utilisateur** (12 oct., après mes 10 propositions, toutes gratuites) :
  1. **Dossier banque PDF** : livré, voir ci-dessous.
  2. Comparateur d'offres d'emploi : net réel, valeur totale sur l'année, brut à demander.
  3. Crédits à taux variable TMM : TMM + marge, simulation d'une hausse, TMM mis à jour par l'admin.
  4. Rachat de crédit : garder ou faire racheter, gain net après frais, pénalités et assurance.
  5. Budget du mois par enveloppes : saisie rapide, reste à dépenser jusqu'au salaire.
  6. Calendrier tunisien des échéances : vignette, assurance, taxes, rentrée, Aïd ; rappels Brevo et provisions.
  - **Écartés pour l'instant** : lecture du relevé bancaire, « Mes droits de salarié », double authentification, interface en arabe.
  - **Règle** : une maquette validée avant chaque fonctionnalité.
- **Dossier banque**
  - Maquette validée : https://claude.ai/artifact/8NnkuJDLwQquGkvBjZ3uE6.
  - Choix de l'utilisateur : employeur et poste **enregistrés dans le profil** ; crédit demandé **facultatif** (sans crédit : capacité seule et montant maximum par type) ; **dossier à deux noms au choix** en mode foyer.
  - **Moteur** `public/espace/js/dossier-calcul.js` (UMD, `window.Dossier`) : `construire(sy, demande, options, maintenant)`. Il renvoie :
    - `demandeur`, `revenus` (revenu retenu selon `baseBanque` / `revenuBanque`, hausses prévues), `credits` (terminés exclus, reste dû estimé si absent, « env. ») ;
    - `capacite` (plafond = quotité × revenu, disponible, endettement), `maxParType` (durée bornée à 70 ans) ;
    - `demande` (mensualité, endettement avant → après, `respecte`, `depassement`, `capitalMax`, échéancier par année, alerte au-delà de 70 ans) ;
    - `paliers` (« Aujourd'hui » puis `capacite.paliers` d'Orbite), `pieces` (selon salarié ou retraité, type de crédit, deux noms) ;
    - `reference` `DB-AAAAMMJJ-XXXX`, `options` (échéancier, paliers, pièces) et `coordonnees`.
    - Deux noms : `OrbiteIntelligence.foyer` (revenus additionnés, crédits du conjoint déduits).
    - Durées : immobilier 300 mois au plus, auto et conso 84. Taux proposé : `OrbiteCalcul.tauxNouveaux` (choisi, sinon crédit du même type, sinon marché).
  - **PDF** `public/espace/js/dossier-pdf.js` (`window.DossierPDF.generer(d)` → Blob) :
    - jsPDF local chargé à la demande, Helvetica, sobre : blanc, encre bleu nuit, touche violette ;
    - tuiles (revenu retenu, endettement après, règle des 40 % respectée ou dépassée) ;
    - sections Demandeur, Revenus, Co-emprunteur, Crédits en cours, Crédit demandé (jauge et note de calcul) ou Capacité, Échéancier (au-delà de 12 ans : 5 premières années, « ... », 4 dernières), Capacité dans le temps, Pièces, Méthode ;
    - pied de page « Simulation indicative… ne vaut pas accord de la banque » ;
    - un titre de section reste avec son bloc, et un tableau n'est jamais coupé s'il tient sur une page ;
    - `txt()` remplace les caractères hors Windows-1252 (espaces fines, →).
  - **Interface** :
    - bouton `#dossier-ouvrir` dans l'en-tête du module Crédit (qui passe à la ligne comme Salaire) ; lien `#credit?dossier=1` ; `Orbite.ouvrirDossier()` ;
    - fenêtre `#dlg-dossier` (`vue-dossier.js`, `dossier.css`) : bascule Immobilier / Auto / Conso / Aucun ; montant, durée, taux prérempli avec sa source, objet ; effet en direct (jauge, verdict vert ou rouge) ; « Dossier à deux noms » si le foyer est actif ; employeur et poste ; 4 interrupteurs ; montant exigé si un type est choisi ;
    - la saisie est gardée par type (le choix du type est traité au `change` ; l'`input` du bouton radio est ignoré, sinon le montant passait à l'autre type) ;
    - téléchargement `dossier-banque-<réf>.pdf` puis toast « envoyé à personne ».
  - **Profil** : champs `employeur` et `poste` (60 caractères, nettoyés) dans « Votre emploi et votre salaire », réservés aux salariés.
  - **Tests** :
    - `tests/espace/dossier.test.js` (10, dont la génération du PDF sous Node avec jsPDF) ; unitaires 470 ;
    - étape e2e « dossier banque » (capacité seule, crédit en direct, montant exigé, PDF valide, employeur enregistré, téléphone sans débordement) ;
    - `ETAPES=regex` permet de ne jouer que certaines étapes (inclure l'inscription et le premier pas).
  - Nouveautés « 2026-10-12b », SW `orbite-2026-10-12b`.

## 3 centquintricies. Double authentification et verrouillage par empreinte (16 oct.)

Idées proposées (10). L'utilisateur a choisi de maquetter : sécurité, chasseur d'abonnements, mode conseiller. **Seule la sécurité est validée** : les deux autres maquettes attendent.
- **Double authentification (TOTP, Supabase MFA)** :
  - `commun/mfa.js` (`EFMfa`) : `aalDe`, `requis`, `verifier` (essaie chaque appareil), `messageErreur` ;
  - Paramètres › Sécurité (`securite.js`, `securite.css`) :
    - « Activer » : code QR (SVG réencodé, un « # » coupait l'adresse data:), clé, premier code tapé (validé à 6 chiffres) ;
    - « Ajouter un appareil de secours », « Désactiver » (vraie fenêtre `#dlg-2fa-off`, jamais `confirm()`) ;
    - facteurs non vérifiés nettoyés à l'ouverture ou à l'annulation.
  - Connexion : étape « Code de vérification » (`#etape-code`) après le mot de passe, au retour de Google ou avec `?mfa=1`. « Ce n'est pas moi » déconnecte cet appareil.
  - `session.js` : une session « aal1 » d'un compte protégé est renvoyée vers `/connexion.html?mfa=1&suite=…`, sauf hors connexion.
  - **Choix de l'utilisateur** : code demandé **seulement sur un nouvel appareil**, ou après « Se déconnecter ». La session rafraîchie garde « aal2 », un test e2e le vérifie. Les options « appareil de confiance même après déconnexion » et « une seule fois pour toujours » ont été écartées comme trop faibles.
  - **Serveur, migration 0016** (`supabase/migrations/0016_mfa.sql`) :
    - `mfa_ok()` : aal2, ou aucun facteur vérifié ;
    - politique restrictive `mfa_aal2` sur abonnements, consentements, objectifs, objectifs_versements, paiements, profils, rappels_email, rappels_envoyes et simulations ;
    - contrôle ajouté dans `exiger_admin` (donc toutes les fonctions admin_*), `supprimer_mon_compte` et `partage_admin_definir` ;
    - les autres fonctions RPC (mon_acces, rappels_*, compter_usage…) ne contiennent pas de données financières et ne sont pas encore contrôlées.
    - **Application en production soumise à l'accord de l'utilisateur** (outil Supabase avec approbation).
- **Verrouillage par empreinte ou visage** (`verrou.js`) :
  - WebAuthn local, authentificateur de l'appareil, vérification de l'utilisateur obligatoire, rien envoyé au serveur ;
  - réglage `ef-verrou` (clé, délai 0/60/300/900 s, compte) ;
  - ouverture à froid verrouillée, sauf juste après la connexion ou un déverrouillage (`sessionStorage` `ef-verrou-ouvert`) ; retour d'arrière-plan verrouillé après le délai ;
  - écran `<dialog id="verrou">` modal : le reste est inerte et caché, et une fenêtre ouverte pendant le verrou est remise dessous (MutationObserver) ;
  - « Utiliser mon mot de passe » ferme la session de cet appareil (une seule redirection).
  - WebAuthn refuse une adresse IP : l'étape e2e passe par `localhost`.
- **Faux Supabase** : facteurs, défi et vérification TOTP réels (RFC 6238, testé sur les vecteurs officiels), jetons aal1 ou aal2, données refusées en 403 sans aal2. `Faux.totp(clé)` est exporté pour les tests.
- **e2e** : nouvelle étape « sécurité », avec un contexte en mouvement réduit (les transitions de page bloquaient les clics). Elle couvre :
  - l'activation, le mauvais code puis le bon ;
  - le refus des données serveur en aal1 ;
  - le code à la reconnexion, l'espace qui renvoie au code, et l'absence de code au rechargement et après rafraîchissement ;
  - la désactivation ;
  - le verrou : authentificateur virtuel, ouverture à froid, retour d'arrière-plan, fenêtre restée dessous, mot de passe.
- Nouveautés « 2026-10-16a », SW `orbite-2026-10-16a`.

## 3 centquatertricies. Compte Google Play, kit de la fiche, mod « choix-modele » (16 oct.)

- **Compte développeur Google Play** : l'utilisateur a choisi de payer les 25 USD, cette fois seulement.
  - Fait : validation en deux étapes (active depuis 2021) ; compte « Vous-même » (personnel) ; profil public avec le Gmail ; « À propos de vous » (texte honnête, site d'Orbite) ; catégories « Aucune des réponses » (Orbite ne vend aucun produit financier) ; contact privé.
  - **Pièce d'identité** : la CIN est en arabe. Google exige un nom identique à la pièce, d'où le **passeport** (nom en lettres latines) : nom à comparer avec « MOHAMED AZIZ JAOUADI » avant de payer.
  - Ensuite : vérification d'identité (1 à 3 jours), puis test fermé avec 12 testeurs pendant 14 jours (compte personnel créé après le 13 nov. 2023).
- **Kit de la fiche Play** (dossier temporaire, non versionné, profil fictif) :
  - fiche à copier : nom (28 caractères), description courte (78), description complète, catégorie Finance, public 18 ans et plus ;
  - brouillon de la sécurité des données ;
  - icône 512, image de présentation 1024 × 500, 7 captures 1080 × 1920 avec légendes.
- **Paquet Android à faire** une fois le compte validé :
  - Trusted Web Activity (Bubblewrap ou PWABuilder, gratuits) ;
  - signature des versions par Google (Play App Signing) ;
  - empreinte SHA-256 dans `public/.well-known/assetlinks.json` ; vérifier que Workers publie bien `.well-known`.
- **Mod Claude « choix-modele »**, hors dépôt Orbite :
  - facile → Haiku 5.5, moyenne → Sonnet 5.5, difficile → Opus 5.5 ;
  - garde-fou : le code ne descend jamais sous Sonnet, et Haiku ne modifie aucun fichier ;
  - `/modele auto|haiku|sonnet|opus`, choix affiché dans la barre d'état ;
  - prêt dans `/home/user/claude-choix-modele` : commit fait, aucun secret trouvé par le scan. Le dépôt privé `MOHAMED-JA/claude-choix-modele` reste à créer à la main (l'intégration GitHub refuse de le créer d'ici), puis on y pousse le commit.

## 3 centtertricies. Installer Orbite sur le téléphone, sans boutique (15 oct.)

Question de l'utilisateur : « mettre l'application sur Play Store ? ».
- **Réponse donnée** :
  - **Google Play** : compte développeur payant (frais uniques), 12 testeurs pendant 14 jours pour un compte personnel, et paiement Google exigé pour les abonnements vendus dans l'application. Écarté (règle : pas de solution payante).
  - **Samsung Galaxy Store** : réservé aux vendeurs « commerciaux », société enregistrée avec numéro DUNS. Écarté.
  - **Retenu** : l'application web installable, gratuite. Choix « Les deux », mais le Galaxy Store est tombé ; maquette validée.
- **Carte « Installer Orbite sur ce téléphone »** (`installer.js`, `installer.css`) :
  - dans Mon orbite, `#installer-orbite`, sous l'en-tête ;
  - en tête du Menu (`menu-complet.js` appelle `OrbiteInstaller.carteMenu()`, copie sans « Plus tard » ni identifiant) ;
  - affichée seulement sur téléphone (< 768 px), si Orbite n'est pas installée (`display-mode: standalone`) et après le premier pas ;
  - « Plus tard » la cache 30 jours (`localStorage` `ef-installer-plus-tard`) ;
  - « Installer » ouvre l'invitation du navigateur (`beforeinstallprompt`, gardée par `appli.js`, exposée par `window.OrbiteAppli` : `installee`, `peutProposer`, `proposer`), sinon le guide.
- **Guide en 3 gestes** (`#dlg-installer`) :
  - Chrome Android, Samsung Internet, iPhone/iPad Safari et ordinateur ;
  - le navigateur détecté passe en premier, marqué « · votre navigateur » ;
  - les gestes de l'ordinateur sont masqués sur téléphone.
- **Paramètres › Application** : bouton « Comment installer ? » (`#appli-guide`) quand le navigateur n'offre pas d'invitation ; il remplace l'ancienne aide iPhone `#appli-ios`. `appli.js` émet `orbite:installation` à chaque changement d'état.
- **Le jour d'une boutique** : le même site peut être empaqueté (Trusted Web Activity, avec un outil gratuit comme PWABuilder ou Bubblewrap) et lié par `/.well-known/assetlinks.json`, qui contient l'empreinte SHA-256 de la clé. La clé de signature reste chez l'utilisateur, jamais dans le dépôt ni dans la conversation.
- **Tests e2e** :
  - téléphone : carte, menu, guide avec Chrome Android en premier, invitation simulée, « Plus tard » ;
  - grand écran : pas de carte ;
  - Paramètres : le guide s'ouvre avec l'ordinateur en premier.
- **Versions** : nouveautés « 2026-10-15d » (« Orbite sur votre écran d'accueil. ») ; SW `orbite-2026-10-15f`.

## 3 centduotricies. Repères de « Votre système » sur téléphone (15 oct.)

Capture de l'utilisateur (Mon orbite, environ 412 px, mode sombre) : la tuile « Mensualité possible » affichait « 345 DT / moi » et « 2 098 DT / an » passait à la ligne en laissant « an » seul. Maquette validée : montant sur une ligne, unité en petit dessous.

- **Cause** : le montant animé (`Orbite.rouler`, `.roule` en `inline-flex` sans retour à la ligne) ne peut pas passer à la ligne ; « 345 DT / mois » faisait environ 100 px pour 81 px de place dans la tuile, la fin était coupée.
- **Correction** :
  - dans `vue-orbite.js` (`ficheEnsemble`), chaque repère contient `.orbite-repere__nb`, le montant (avec `data-v` s'il roule), puis `small.orbite-repere__unite` (« par mois », « par an ») ; `capa` et `repere.eco` se terminent maintenant par « DT » ;
  - dans `app.css` :
    - la tuile est un conteneur (`container-type: inline-size`) ;
    - montant `font-size: min(1em, 21cqi)`, toujours sur une ligne : « 99 999 DT » tient entier, 15 px au plus ;
    - libellé `max(11px, min(12px, 14.5cqi))` avec césure ;
    - `.roule` en `vertical-align: top` pour aligner les trois montants ;
    - sous 400 px : rembourrage 10 px, écart 6 px.
- **Mesures** (profil fictif) : aucun débordement à 320, 360 et 412 px.
- **Tests** : à 360 et 390 px dans l'étape e2e « Mon mois », la e2e vérifie le montant entier dans sa tuile et les unités ; capture `orbite-reperes-mobile.png`. SW `orbite-2026-10-15e`.

## 3 centunotricies. Menu complet sur téléphone et barre latérale dès 768 px (15 oct.)

Capture de l'utilisateur sur téléphone (page en « version pour ordinateur », environ 900 px, sous le seuil de 1 024 px) : textes petits, barre du bas, rubriques cachées sous « Moi ». Demande : voir toutes les rubriques et sous-rubriques comme sur le PC. Choix validé : **« Les deux »**, maquette validée.

- **Barre latérale dès 768 px** (au lieu de 1 024 px), dans `app.css`, `palette.css`, `sous-rubriques.css` et `signature.css` :
  - les 11 règles de navigation ont changé de seuil (barre latérale, barre du haut, onglets du bas, `.sous-nav`, bulle de l'Assistant, pastilles, signature) ;
  - de 768 à 1 023 px, la barre latérale fait 248 px (rembourrage réduit dans `menu.css`), 264 px au-delà ;
  - pour l'utilisateur : tablette, téléphone en paysage ou en « version ordinateur » ont l'affichage du PC.
  - de 768 à 1 023 px, la barre du haut est plus étroite : boutons des modules en icônes et pas de « Ctrl K » (le seuil de `palette.css` reste à 1 024 px) ; mesuré : en haute lisibilité, elle débordait à 800 px.
- **Menu complet** sur un écran de moins de 768 px :
  - **Ouverture** :
    - bouton ☰ `#menu-ouvrir` dans la barre du haut ;
    - l'onglet du bas « Moi » est remplacé par le bouton « Menu » `#onglet-menu` ;
    - `data-vues` reprend la liste de « Moi » + assistant et admin ;
    - `data-actif` le garde allumé dans ces rubriques.
  - **Panneau** `<dialog id="dlg-menu">`, construit par `menu-complet.js` et stylé dans `menu.css` :
    - panneau qui monte du bas, poignée, recherche (ouvre Ctrl K) ;
    - reconstruit à chaque ouverture **depuis le DOM de la barre latérale** (groupes, icônes, badges, Administration seulement si visible) ;
    - sous-rubriques prises dans `SousRubriques.items(v)`, exporté à cette occasion ;
    - la rubrique affichée est marquée « Vous êtes ici » et sa partie active est remplie ;
    - un lien suivi ferme le panneau ; un appui sur le voile ou Échap aussi.
  - `window.OrbiteMenu = { ouvrir, fermer }`.
  - **Sous-rubriques d'une page non affichée** : `sous-rubriques.js`, `cacheParAppli`, s'arrête maintenant à `section.vue`. Sinon les parties d'une page masquée étaient toutes « indisponibles ».
- Icône `menu` ajoutée à `icones.svg`. Repères mis à jour :
  - `puceVolante` → `#onglet-menu` ;
  - visite guidée « Mon profil » → `#onglet-menu`.
- **e2e** :
  - téléphone : ☰ visible, pas de barre latérale ;
  - menu : au moins 12 rubriques ; Mon profil 5, Crédit 8, Vie & impôts 4, Paramètres 6 sous-rubriques ;
  - « Décider » ouvre `#vie?onglet=decider` et ferme le panneau ; « Menu » reste allumé ; rubrique et partie en cours marquées ; Échap ferme ;
  - tablette (820 px) : barre latérale, ni onglets du bas ni ☰.
- Nouveautés `2026-10-15c`, SW `orbite-2026-10-15d`.

## 3 centtricies. Vidéo LinkedIn « 3 simulateurs + Orbite » (15 oct.)

Demande : une vidéo 3D de 60 s qui récapitule les 4 applications, Orbite en dernier comme la plus avancée, avec une musique douce (« défi et timing »), et un texte LinkedIn. Choix validés : **16:9 + carré 1:1**, **60 s**, **musique composée**, **Orbite environ 40 % à la fin** ; extrait de 14 s et storyboard validés.

- **Livrables** (bloc-notes de la session, `scratchpad/v5/`, non versionnés) :
  - `Orbite-4-simulateurs-16x9.mp4` (27 Mo) et `-carre.mp4` (17 Mo) : 30 i/s, −14 LUFS, crête à −2,2 dBFS ;
  - `miniature-linkedin.jpg` ;
  - `texte-linkedin.md` : les 3 simulateurs avec leurs liens GitHub Pages, Orbite par `https://mohamed-ja.github.io/portail-rh/orbite/` (LinkedIn ne lit pas workers.dev), « de nouvelles fonctionnalités au fur et à mesure, selon vos besoins », sans prix.
- **Musique** `musique.py` : entièrement synthétisée, donc libre de droits. 100 BPM, une mesure de 2,4 s. Ré mineur, puis fa majeur pour Orbite. Piano feutré, nappe, basse ronde, tic-tac d'horloge, montée de 29 à 33,6 s, impact à 33,6 s.
- **Image** : `moteur-li.html#16x9|carre` + `rendu-li.js` (Chromium SwiftShader, rendu image par image puis ffmpeg).
  - **Vraie 3D (three.js)** : planète en shader (bandes vert et violet, bord lumineux), 3 satellites (Salaire, Épargne vie & CEA, Crédit) sur leurs orbites, avec des étiquettes HTML projetées.
  - **Fusion** : les satellites convergent en spirale, puis éclat, onde de choc et anneaux du logo Orbite.
  - **Simulateurs** : vraies captures (`cap2.js`, mode sombre, exemple fictif : 2 500 DT brut, 45 000 DT de revenu et 400 DT par mois en assurance vie, crédit de 150 000 DT sur 20 ans à 8 %). Carte de verre et compteur :
    - salaire : 1 849,310 DT net ;
    - assurance vie & CEA : 1 674 TND d'impôt en moins ;
    - crédit : mensualité de 1 254,660 TND.
  - **Orbite** : réserve et plan de versement (captures), banques, relevé, bilan, assistant (images V2 et V3), puis « Et bien plus encore » (12 fonctions), et la carte de fin « De nouvelles fonctions arrivent, selon vos besoins ».

## 3 centnovovicies. Visite guidée à jour (15 oct.)

Question de l'utilisateur : « la visite guidée est-elle à jour ? ». Non : rien depuis le 13 oct. (PR #131). Choix validé : « Nouveautés d'octobre » (maquette des textes validée).

- `visite.js` (`VERSION_NOUVEAUTES = "2026-10-15a"` : le badge « 8 nouvelles » revient pour tous les comptes) :
  - **Les nouveautés (8)** :
    - Ma réserve de sécurité (`.reserve__jauge`) ;
    - Mon plan de versement (`.plan__objectif`) ;
    - Rembourser ou épargner ? (onglet Décider) ;
    - Mon patrimoine net (`#orbite?partie=patrimoine`) ;
    - Comparer les banques (`#credit?espace=banques`) ;
    - Importer mon relevé (`#mo-releve`) ;
    - Mon bilan en PDF (`#btn-bilan`) ;
    - Votre fiche, ligne par ligne (`#fiche-entree-profil`).
  - **Pour aller plus loin (12)** : Mon mois, calendrier, onglets du Crédit, simulation guidée, partager et comparer, historique du salaire, Ma progression (inflation, objectifs, retraite, Mon année), Et si…, négociation, dossier banque, Ctrl K (avec Ctrl Z / Ctrl Y), Vos réglages (apparence, lisibilité, Expert, rappels).
  - Retirées de la visite (les fonctions restent, et dans Ctrl K) : Comparer vos simulations, Annuler/rétablir, Apparence, Haute lisibilité, Mode Expert, Rappels, Mes applications, Envoyer un document, Objectifs, Retraite, Mon année, Vie & impôts.
  - Le texte « épargne de précaution » a disparu : la réserve a sa propre étape.
- **Défaut d'accessibilité corrigé** : quand une étape ouvrait une autre page, `app.js` donnait le focus au titre de la page, hors de la bulle modale, et Échap ne fermait plus la visite. Corrections :
  - pendant la visite (`body.visite-ouverte`), le titre ne prend plus le focus ;
  - la visite remet le focus sur « Suivant » s'il sort de la bulle.
- `OrbiteVisite.chapitres` expose aussi `plus`.
- e2e « visite guidée » adapté : 8 nouveautés, les pages ouvertes, la version `2026-10-15a`, 12 étapes, le focus dans la bulle. SW `orbite-2026-10-15c`.
- Règle : à chaque nouvelle fonction, ajouter son étape à « Les nouveautés » et changer `VERSION_NOUVEAUTES`.

## 3 centoctovicies. Vidéo d'accueil V3 « le meilleur des deux » (15 oct.)

L'utilisateur a fourni une nouvelle vidéo de 60 s (violet et rose) et 8 images (`Orbite-toutes-les-images.zip`). Étude faite :
- **Défauts mesurés** :
  - début très sombre (luminosité 10 à 20 sur 255 pendant 5 s, image presque noire à 4,5 s) ;
  - 8 images répétées 2 à 3 fois chacune, « Tout se relie » 4 fois ;
  - textes minuscules dans les écrans découpés ;
  - aucune vraie capture ;
  - palette et logo différents d'Orbite ;
  - images 1672 px agrandies ;
  - crête à −0,7 dBFS ; 21 Mo.
- **Points forts gardés** : scènes humaines (mariage, naissance, mutation), ambiance verre et néon, messages courts, sa musique.

Choix validés (extrait de 13 s approuvé) : **V3 hybride** et **musique de sa nouvelle vidéo**.

- **Fichiers** (`public/medias/`, nouveaux noms à cause du cache d'une semaine ; les anciens `orbite-30s|60s|affiche` sont supprimés) :
  - `orbite-v3-30s.webm|mp4` (boucle de l'accueil, 1280 px) et `orbite-v3-60s.webm|mp4` (fenêtre, 1920 px) ;
  - `orbite-v3-affiche.webp|jpg` et `orbite-v3-60s-affiche.jpg` ;
  - son à −16 LUFS, crête à −1,5 dBTP au plus.
- **Montage** (bloc-notes de la session, `scratchpad/v3/`, non versionné) :
  - `grade.py` étalonne ses images vers la palette d'Orbite :
    - rose et magenta → violet, bleu et cyan néon → vert d'eau, seulement sur les couleurs saturées (visages et ciels intacts) ;
    - ombres relevées, agrandissement Lanczos et netteté.
  - `moteur-film.html#30|60` + `rendu-film.js` : rendu image par image dans Chromium, puis ffmpeg ; `mix.sh` mixe le son en deux passes (loudnorm).
- **Rythme** :
  - la musique est à 128 temps par minute, une mesure dure 1,875 s ;
  - la boucle de 30 s fait exactement 16 mesures ; chaque coupe tombe sur une mesure ;
  - la musique part de 1,44 s pour que l'entrée du rythme tombe à 3,75 s ;
  - dans la version de 60 s, l'entrée du rythme tombe à 5,19 s.
- **Scènes** :
  - images pleines (les siennes étalonnées, plus les scènes V2 vertes : fiche de paie, banques, relevé, bilan, budget, crédit, progression, Et si…, Projetez) ;
  - 2 scènes construites avec de vraies captures en mode sombre (profil fictif « Sami Exemple », mention « Exemple avec un profil fictif ») :
    - « Votre réserve. Prête pour l'imprévu. » : compteur 430 DT par mois, « complète en décembre 2026 » ;
    - « Votre plan de versement. Combien verser. Où placer. » : compteur 4 325 DT d'impôt en moins.
  - Animations :
    - titres en Bricolage 104 px, mot par mot ;
    - carte de verre inclinée qui se redresse, étiquettes qui apparaissent sur les temps ;
    - poussée lente avec l'origine en haut à gauche (les titres gravés ne sont jamais coupés) ;
    - transitions « zoom à travers » de 0,5 s avec flou et éclat, reflet sur les titres, particules vertes et violettes.
  - Carte de fin : logo, « Orbite », « Comprendre. Simuler. Voir plus loin. », « Créer mon orbite → » (sans prix), adresse du site dans la version de 60 s.
- Page : même lecteur (`accueil-film.js`), seuls les noms de fichiers, la description `VideoObject` (date du 15 oct.) et l'`aria-label` changent. e2e mis à jour.

## 3 centseptvicies. Ma réserve de sécurité (15 oct.)

Chantier choisi par l'utilisateur après le programme d'améliorations (son épargne de précaution est à 0). Maquette validée : « Ma progression + tuile ».

**Une seule définition**. Avant, la réserve était calculée de quatre façons : 3 mois de net (conseils), 6 mois de charges fixes (score et objectifs), 3 mois de dépenses (Décider et plan). Elle passe maintenant partout par deux fonctions :
- `OC.depensesMois(sy)` = crédits + loyer et charges + contrats en cours + dépenses de vie. Les dépenses de vie viennent du budget du mois (courses, transport, santé, loisirs, divers, et le logement au-delà du profil) ; sans budget, c'est la moitié de ce qui reste. Plancher : 30 % du net. La fonction rend aussi `base` et `libre` (la marge du mois) ;
- `OC.cibleReserve(sy, reglages)` = n mois × dépenses, arrondi à la centaine, ou montant libre.

Branchements :
- **conseils** : « Réserve de sécurité », lien vers la carte ;
- **score de santé** : composante `precaution`, libellé « Réserve de sécurité », mêmes paliers 1, 3 et 6 mois, action et lien vers la carte ;
- **Décider** : `depensesReserve`, cible, phrases ;
- **objectifs** : `PG.ciblePrecaution` ;
- **plan de versement** : réserve conseillée ;
- **accueil public** : l'exemple « Yasmine » passe de 4 400 à 5 800 DT, toujours 6 mois de dépenses.

**Profil** : `reserve { mois: 1|3|6|0 (0 = montant libre), montant, partMarge, partPrimes }`. Par défaut : 3 mois, 50 % de la marge, 50 % des primes.

**Moteur** `OI.reserve(sy, reglages, { maintenant })` :
- **revenus à venir** : `OI.revenusAVenir` donne la marge libre de chaque jour de paie et les primes nettes sur 72 mois. Le mois en cours compte toujours ; une prime déjà versée est écartée ;
- **part de la réserve** : `partReserve` prend sa part de chaque revenu jusqu'à ce que la réserve soit complète ;
- **résultats** :
  - points cumulés et date d'atteinte ;
  - repères à 1, 3 et 6 mois ;
  - partage de la prochaine prime ;
  - l'ordre conseillé : la réserve, puis l'impôt de l'année (gain du plan), puis le crédit le plus cher.

**Partage avec le plan de versement** : tant que la réserve n'est pas complète, elle prend d'abord sa part de chaque revenu, et le plan prend la sienne dans ce qui reste. Le plan rend `marge.reserve` et `primes.liste[].reserve`, et ses textes le disent.

**Interface** :
- **carte `#pg-reserve`** en tête de Ma progression › Objectifs (`vue-reserve.js`, styles dans `progression.css`) :
  - état ;
  - jauge avec les repères 1, 3 et 6 mois ;
  - puces radio 1 / 3 / 6 / montant libre ;
  - curseurs pour la part de la marge et des primes, avec une barre de partage réserve / assurance vie ;
  - date de réserve complète ;
  - formulaire « J'ai mis de côté » (épargne disponible + montant, annulable) ;
  - rappels `reserveAAAAMM` jusqu'à la date d'atteinte (6 au plus) ;
  - graphique en escalier (moteur commun) avec la ligne d'objectif ;
  - l'ordre conseillé, avec des liens vers le plan et Décider.
- **Tuile `#reserve-tuile`** sur Mon orbite, avant « Votre net, partagé », vers `#progression?onglet=objectifs&reserve=1`.
- **Ctrl K** « Ma réserve de sécurité ».

**Tests** :
- `tests/espace/reserve.test.js` (6) ; tests Décider et récit ajustés ; 606 au total ;
- étape e2e « Ma réserve de sécurité » ;
- axe : 0 violation sur la carte, la tuile et le plan.

Nouveautés « 2026-10-15b », SW `orbite-2026-10-15b`.

## 3 centsexvicies. Audit accessibilité et vitesse (15 oct.)

Point 8 du programme d'améliorations, le dernier.

**Méthode** : outils dans le bloc-notes de la session (`scratchpad/audit8/`), non versionnés.
- **Accessibilité** : axe-core 4.14, règles WCAG 2.0 / 2.1 / 2.2 AA :
  - 20 écrans de l'application (tous les onglets de Crédit, de Vie & impôts et de Mon mois) avec un profil fictif ;
  - les 17 pages publiques ;
  - en clair et en sombre, sur ordinateur (1 360 px) et sur téléphone (390 px).
- **Vitesse** : téléphone, processeur ralenti × 4, 4G lente (1,6 Mbit/s, 150 ms), cache vide. Mesures : FCP, LCP, CLS, poids et nombre de requêtes.

**Corrections d'accessibilité** :
- **Nom accessible qui reprend le texte visible** (WCAG 2.5.3) :
  - signature « Conçu par » (17 pages et le rail de l'application) : `aria-label` retiré, espace entre « Conçu par » et le nom, « , profil LinkedIn (nouvel onglet) » en texte caché (`.signature__cache` dans `signature.css`) ;
  - bouton Ctrl K : texte caché « Rechercher ou agir » et `<kbd>` lisible ;
  - pastille d'abonnement : le nom commence par le texte affiché ;
  - satellites de Mon orbite : espace entre le nom et le détail, « DT » plus mis en minuscules.
- **Contraste** :
  - témoin « Enregistré » : fond `--succes-doux`, contraste passé de 4,25 à 6 ;
  - chapitres inactifs de l'accueil : opacité 0,4 → 0,7.
  - Les alertes axe restantes sur l'accueil viennent de l'animation d'apparition au défilement : il n'en reste aucune une fois la page défilée.
- **Tableaux qui défilent** (pages publiques `.defile`, inflation de Ma progression `.pg-table`) : `tabindex="0"`, `role="region"`, nom (titre de la section) et contour au focus, pour le défilement au clavier.

**Corrections de vitesse** :
- **Une seule copie des polices** : `meridien.css` (connexion, Espace, CGV…) et le préchargement de `connexion.html` pointent maintenant vers `/orbite/polices/`, comme les pages publiques. Mona Sans (96 Ko) n'est plus téléchargée deux fois entre les pages publiques et l'application. Les fichiers de `/commun/polices/` restent en place.
- **Accueil** :
  - affiche de la vidéo en WebP 1280 px (`orbite-affiche.webp`, 61 Ko au lieu de 137 Ko ; le JPG reste pour les données structurées) ;
  - affiche de la vidéo d'une minute posée seulement à l'ouverture (`data-poster`, 82 Ko économisés) ;
  - poids de l'accueil : 832 → 675 Ko.
- **Saut de mise en page à l'arrivée de la police des titres** (le titre changeait de nombre de lignes) :
  - police de repli « Bricolage Repli » (Arial / Helvetica / Roboto locales, `size-adjust: 98 %`, hauteurs calées), placée avant Mona Sans dans `--affiche` ;
  - Bricolage en `font-display: optional` : si elle n'est pas là dans les premiers instants, la page garde la police de repli et ne saute pas ; Bricolage sert dès la page suivante, depuis le cache.
  - Un repli calé seul ne suffisait pas : à la limite d'un retour à la ligne, le titre gagnait ou perdait encore une ligne.
  - CLS : page CEA 0,113 → 0,002, coût employeur 0,104 → 0,002 ; toutes les pages mesurées sont à 0,002 au plus.

**Résultat** : 0 violation WCAG AA sur les 20 écrans et les 17 pages (hors faux positif de l'animation de l'accueil). Mesures sur téléphone ralenti : FCP 0,6 à 1,7 s selon la page, CLS ≤ 0,03.
- **Tests** : `npm test` 600 ; e2e : l'affiche de la version longue n'est posée qu'à l'ouverture, nouveaux fichiers médias contrôlés.
- SW `orbite-2026-10-15a`.

## 3 centquinvicies. Mon plan de versement (14 oct.)

Question de l'utilisateur : « l'application me donne-t-elle le montant exact d'assurance vie pour le 45 %, le montant du CEA, la proportion entre les deux selon des pourcentages paramétrables, et le montant que je peux utiliser selon ma situation ? ». Réponse : le montant exact oui (complément de l'optimiseur), le reste non ; maquette « Mon plan de versement » validée (« Plan complet »).

- **Rappel de la règle** : les versements se déduisent en totalité du revenu imposable ; le « 45 % » est un **plancher** (l'impôt ne descend pas sous 45 % de l'impôt de départ avec l'assurance vie, 60 % avec le CEA seul), donc au plus 55 % d'impôt en moins.
- **Correction du partage** (`orbite-intelligence.js`, `meilleurPartage`) : le parcours allait de « tout CEA » vers « tout assurance vie » et gardait donc le CEA à économie égale, contrairement au commentaire. Il part maintenant de « tout assurance vie ». Effet : le complément conseillé est en assurance vie tant que le plafond n'est pas atteint (le CEA ne fait jamais mieux, son plancher est plus haut). Page publique `impot-assurance-vie-cea.html` régénérée, phrase « Le bon partage » adaptée quand le CEA vaut 0.
- **Moteur** `OI.planVersement(sy, reglages, { optimiseur, maintenant })` :
  - **marge du mois** = net mensuel habituel (sans les primes, comptées à part) + autres revenus − crédits − loyer et charges − contrats en cours − dépenses de vie. Les dépenses de vie viennent du budget du mois (courses, transport, santé, loisirs, divers, et le logement au-delà du profil). Sans budget, elles sont estimées à la moitié du reste. Part versée réglable (0 à 100 %, 50 % par défaut) × mois restants ;
  - **primes à venir** (calendrier des primes, celles déjà versées écartées), au net d'un salaire de prime = (net annuel − 12 × net mensuel) ÷ salaires de prime ; part réglable (50 % par défaut) ;
  - **épargne disponible** au-delà d'une réserve. Réserve conseillée = 3 mois de dépenses arrondis à la centaine ; réglable, vide = conseillée ;
  - **versement** = min(abordable, complément qui atteint l'économie maximale) ; le surplus est signalé ;
  - **répartition** : conseillée (meilleure économie, assurance vie d'abord) ou part d'assurance vie choisie. Calcul de la perte par rapport au conseillé, et du dépôt CEA au-delà duquel l'impôt ne baisse plus (`ceaUtile`) ;
  - **calendrier** : épargne aujourd'hui, puis chaque jour de paie (`jourPaie`, 28 par défaut) avec marge et prime. Les dates les plus proches d'abord, jusqu'au montant utile. Chaque date suit la répartition ;
  - **retour** : gain, coût réel, taux, paie / déclaration.
- **Profil** : `planVersement { partMarge, partPrimes, reserve|null, partAv|null }` (normalisé, bornes 0-1).
- **Interface** (Vie & impôts › Impôt, section `#fi-plan`, entre « Votre impôt » et « La meilleure répartition », visible seulement s'il reste une économie) :
  - curseurs natifs (`.curseur`), recalcul en direct à l'`input`, enregistrement au `change` ;
  - puces radio Conseillé / 70-30 / 50-50 / Personnalisé ;
  - barre de dosage violette (assurance vie) et verte (CEA) ;
  - alerte orange si la répartition fait perdre de l'économie ;
  - calendrier ; bouton « Me le rappeler chaque mois » : rappels `rappelsPerso` d'identifiant `planAAAAMM`, remplacés à chaque clic, annulables ;
  - lien « Simuler ce plan » (`#epargne?av=&cea=`) ;
  - lien direct `#vie?onglet=fiscal&plan=1` et entrée Ctrl K « Mon plan de versement ».
- **Retraits et écarts** :
  - l'ancien champ « Ce que je peux verser » (`#fi-budget`) et le bouton « Utiliser ce montant » sont retirés : le plan les remplace ;
  - le bouton de la maquette « Ajouter à mon budget du mois » n'a pas été fait : il aurait changé l'enveloppe épargne pour tous les mois, après décembre aussi. Il est remplacé par les rappels.
- **Tests** :
  - `tests/espace/plan-versement.test.js` (7) ; 600 tests unitaires au total ;
  - étape e2e « mon plan de versement », avec captures `plan-versement.png` et `-telephone.png`.
- Nouveautés « 2026-10-14a », SW `orbite-2026-10-14a`.

## 3 centquatervicies. Vidéo de présentation sur l'accueil (14 oct.)

Demandée par l'utilisateur à partir de sa vidéo de 60 s (« images approuvées ») et de 7 visuels 3D (zip). Choix validés : bande vidéo **sous le haut de page** (emplacement B, l'encadré « Essayez avec votre salaire » reste en place), 30 s muettes en boucle + 1 min au clic, 3 scènes de vraies captures + « Mon orbite » + carte de fin, **sa musique** mieux mixée.

- **Remplacée le 15 oct. par la V3** (voir 3 centoctovicies) ; ce qui suit décrit la première version.
- **Fichiers** (`public/medias/`, cache 1 semaine dans `_headers`, autorisés dans `robots.txt`, non interceptés par le service worker) : `orbite-30s.webm|mp4` (accueil), `orbite-60s.webm|mp4` (fenêtre), `orbite-affiche.jpg`, `orbite-60s-affiche.jpg`. WebM VP9 + Opus d'abord, MP4 H.264 + AAC ensuite (le Chromium des tests ne lit pas le H.264). 30 images/s, son à -16 LUFS. Pour changer une vidéo : **changer son nom** (cache d'une semaine).
- **Montage** (outils dans le bloc-notes de la session, `scratchpad/video/`, non versionnés) : moteur canvas image par image (`moteur.html` + `rendu.js` → ffmpeg) ; chaque scène avance lentement (zoom + déplacement adoucis), reflet lumineux sur le titre au début, particules, vignette, transitions « zoom à travers » de 0,6 s avec flou et léger flash, **calées sur les temps de la musique** (un temps par seconde, mesures de 4 s à 0,43 s ; pause musicale 43-47 s). 60 s = 14 scènes (Ouverture, Mon orbite, Fiche de paie, Simulations, Budget, Import du relevé, Crédit, Comparer les banques, Et si…, Ma progression, Bilan PDF, Accompagnement sur la pause, Projetez votre avenir sur la reprise, carte de fin « Créer mon orbite → » sans mention de prix) ; 30 s = 10 scènes de 3 s, fondu au noir pour la boucle.
- **Nouvelles scènes** : captures réelles d'Orbite en mode sombre (profil fictif) dans une carte de verre inclinée avec halo néon, planète de l'image d'ouverture, titres Mona Sans (« Vos banques. Qui vous prête le plus ? », « Votre relevé. Rangé en un geste. », « Votre bilan. Une page pour votre banque. ») ; « Mon orbite » et les autres quarts de l'image 04 agrandis ; mentions « Concept 01/02/03 — … » effacées des images 01 à 03.
- **Page** (`index.html`, `commun/accueil.css`, `commun/accueil-film.js`) : `<video muted loop playsinline preload="none" poster>` ; lecture seulement quand la bande est visible (35 %) et l'onglet affiché ; jamais d'elle-même si « moins d'animations » ou économie de données ; boutons son (`#film-son`), pause (`#film-pause`, WCAG 2.2.2) et « Voir la vidéo · 1 min » (`#film-complet`) qui ouvre `#film-dlg` (lecture avec le son, Échap ou clic hors de la vidéo pour fermer) ; données structurées `VideoObject`.
- e2e : étape « accueil : vidéo de présentation ». À vérifier par l'utilisateur sur iPhone (Safari lit le MP4 ; le serveur doit accepter les requêtes partielles).

## 3 centtervicies. Bilan annuel en PDF (13 oct.)

Point 7 du programme d'améliorations (maquette validée). Reste : 8 audit accessibilité et vitesse.

- **Moteur** `public/espace/js/bilan-calcul.js` (pur, `BilanCalcul`, testé : `tests/espace/bilan.test.js`, 4 tests, profil fictif) : `construire(profil, donnees, maintenant, sections, contact)` reprend les moteurs existants, sans nouveau calcul :
  - revenus et impôt (`Annee.bilan` : brut, net, cotisations, impôt, hausses, pouvoir d'achat) ;
  - crédits (mensualité, taux, reste dû saisi ou estimé par `DeciderCalcul.patrimoine`, fin d'après les échéances restantes, capital et intérêts de l'année, endettement, capacité par type) ;
  - épargne et patrimoine (`DeciderCalcul.patrimoine`, versements de l'année) ;
  - score de santé (`OrbiteIntelligence.scoreSante`, 6 critères) et 4 conseils de Mon orbite ;
  - coordonnées (nom, e-mail de contact, téléphone, employeur, poste) **seulement si cochées** (`PAR_DEFAUT.coordonnees = false`).
  - Période : celle de « Mon année » (janvier → aujourd'hui ; en janvier, l'année précédente complète). Fichier `bilan-orbite-<année>.pdf`.
- **PDF** `bilan-pdf.js` (`BilanPDF.generer`, jsPDF local chargé à la demande, même charte que le dossier banque) : tuiles net / impôt / score, tableaux, notes colorées, barres du score, pied « créé sur l'appareil, envoyé à personne ».
- **Interface** `vue-bilan.js` + fenêtre `#dlg-bilan` (styles dans `annee.css`) : bouton « Mon bilan en PDF » (`#btn-bilan`, à côté de « Mon année en orbite » dans Ma progression), aperçu miniature avec les vrais chiffres, 5 cases (au moins une), téléchargement ; palette « Mon bilan en PDF » (`#progression?bilan=1`).
- e2e : étape « bilan annuel en PDF ». Nouveautés `2026-10-13j`, SW `orbite-2026-10-13l`.

## 3 centduovicies. Import du relevé bancaire (13 oct.)

Point 5 du programme d'améliorations (maquette validée).

- **Moteur** `public/espace/js/releve-calcul.js` (pur, `ReleveCalcul`, testé : `tests/espace/releve.test.js`, 9 tests, relevés fictifs) :
  - `montant(s)` (formats tunisiens « 1 234,500 », « 1.234,500 », signes, parenthèses) ; `estMontant` exige des décimales (sinon c'est une référence) ; `date(s, annee)` (jj/mm[/aa[aa]], ISO) ;
  - `depuisLignes(lignes, maintenant)` (PDF ou photo lus par `FicheLecture`, qui donne maintenant aussi `positions` [{x, fin}] par cellule) : colonnes Débit / Crédit / Solde repérées sur la ligne d'en-tête (répétée à chaque page), date de valeur ignorée, deuxième ligne du libellé rattachée, lignes « Total » ignorées, ligne « Solde au … » = solde de départ ; **le sens vient d'abord de la variation du solde**, puis de la colonne, du signe, des mots (salaire, virement reçu…) ; dates sans année = année la plus fréquente du relevé, ramenée à l'année d'avant si elle tombe plus d'un mois dans le futur ;
  - `depuisCsv(texte, maintenant)` : séparateur `;`, tabulation ou `,`, guillemets, en-tête (date, libellé, débit, crédit, montant, solde) ;
  - `categoriser(op, memoire, credits)` : entrée d'argent → « revenu » (ignorée) ; mémoire de l'utilisateur ; mensualité d'un crédit du profil (± 1 DT) → Crédits ; mots tunisiens (STEG, SONEDE, Ooredoo → Logement ; AGIL, Shell, station → Transport ; Carrefour, Monoprix, MG, Aziza → Courses ; pharmacie, clinique → Santé ; restaurant, café, Netflix → Loisirs ; retrait DAB, frais, agios → Divers) ; sinon Divers ;
  - `cleMarchand(libelle)` : premier mot significatif hors « CB, PRLV, VIR, PAIEMENT… », un mot générique (BOUTIQUE, STATION, PHARMACIE…) laissant la place au nom qui suit ;
  - `bilan(ops, budget, maintenant)` : totaux par mois et par enveloppe (12 derniers mois seulement) ; les mensualités déjà notées « Payé » dans le mois ne sont pas comptées deux fois (`dejaCompte`) ;
  - `empreinte(ops)` : FNV-1a des dates, montants et sens (**jamais les libellés**) ; `appliquer(budget, bilan, choix, emp, plan)` ; `periode(ops)`.
- **Profil** : `budget.memoire` { « CARREFOUR » : « courses » } (300 au plus, choix faits à la main seulement) et `budget.imports` (24 empreintes au plus), normalisés par `BudgetCalcul.normaliser`. Aucun libellé ni opération n'est gardé.
- **Interface** (`releve-import.js`, section `#mo-releve` sous les enveloppes, styles `mois.css`) : zone de dépôt (glisser ou « Choisir le relevé » ; Excel → message « enregistrez en CSV »), liste des opérations avec étiquette d'enveloppe (une vraie liste déroulante en pastille colorée ; changer une étiquette range aussi le même commerçant ailleurs dans le relevé), entrées barrées « Entrée · ignorée », tuiles par enveloppe, « Ajouter N dépenses au budget » (toast avec Annuler, via `window.OrbiteBudget` exposé par `vue-mois.js`), relevé déjà ajouté refusé ; palette « Importer mon relevé bancaire » (`#mois?onglet=budget&releve=1`).
- e2e : étape « import du relevé bancaire » (PDF fictif du mois créé dans le navigateur, enveloppes, choix retenu, totaux seuls, doublon refusé, CSV avec mémoire, mois de plus de 12 mois écarté, téléphone). Nouveautés `2026-10-13i`, SW `orbite-2026-10-13k`.

## 3 centunvicies. Lecture des autres lignes de la fiche et comparateur de banques (13 oct.)

Points 3 et 6 du programme d'améliorations (maquette validée « Oui, construis les 4 »).

- **Lecture automatique des autres lignes** (`fiche-calcul.js`, `vue-fiche.js`, `fiche.css`) :
  - `analyser` reconnaît, avant les cotisations, les lignes hors salaire de base : retenues **sociales** qui baissent l'impôt (`RE_SOCIALE` : CAVIS, retraite complémentaire, assurance groupe, mutuelle…), **gains** (`RE_GAIN_NET` : bonification…), **prêts** retenus sur la paie (`RE_CREDIT`), **retenues sur le net** (`RE_NETTE` : syndicat, UGTT, assurance auto, tickets restaurant, complément de retraite…). Résultat `v.autres` [{libelle, montant, groupe, source, conf, ligne, etat}] ; `groupeAutre(lib)` exporté ;
  - contrôle : net d'Orbite = net de la fiche ramené au mois − autres retenues − retenues sur le net + gains ;
  - fenêtre : groupe « Autres lignes de votre fiche » (case, groupe modifiable, montant ; le prêt est **décoché** par défaut), ligne « Impôt aligné sur la fiche » (`#fiche-c-impot`) seulement si le brut habituel est dans la tolérance et si l'écart dépasse 0,0015 ; phrase `#fiche-maj-net` « ✓ Net d'Orbite avec ces réglages : … · net de la fiche avant le prêt : … » ;
  - application (`appliquer`) : `autresLignes` met à jour une ligne existante du même libellé (`ficheChanger`) ou en ajoute une ; un prêt coché devient un crédit `{type: "autre", mensualite}` (sans doublon) ; `impotAligne` pose `impotFiche` ; « Annuler » rétablit tout ;
  - tests : `tests/espace/fiche.test.js` (14) ; fixture e2e `e2e/fixtures/fiche-paie-lignes.html` → `.pdf` (générée par `e2e/fiche-fixture.js`, profil fictif).
- **Comparateur de banques** (Crédit › « Comparer les banques », `#credit?espace=banques`, sous-rubrique `banques`, palette `s-banques`) :
  - moteur `DeciderCalcul.banques(sy, liste, type)` : pour chaque banque, revenu retenu (net ou brut ; salaire du mois ou année ÷ 12, primes comprises) × quotité (10 à 80 %) − crédits en cours = mensualité possible, puis capital au taux et à la durée des nouveaux crédits du type (`OC.tauxNouveaux`, durée réduite par l'âge si besoin) ; `meilleur`, `ecart`, `ecartMienne` ; `banquesParDefaut(p)` = la règle du profil (« Ma banque ») + les trois autres combinaisons à 40 % (Banque B, C, D) ; 6 banques au plus (`MAX_BANQUES`) ;
  - profil : `banques` [{nom, base, revenu, quotite}] normalisé (6 au plus) ;
  - interface `credit-banques.js` : puces Immobilier / Auto / Consommation (créées une fois puis **mises à jour sur place** : un rendu entre l'appui et le relâchement faisait perdre le clic), lignes éditables (nom, base, revenu, quotité, montant, ×), « + Ajouter une banque », barres, avis sur fond sombre, note ; enregistrement différé (400 ms) ; un changement de profil ne reconstruit les lignes que si la liste des banques a changé ; téléphone : nom + × puis base / revenu / quotité, sélecteurs resserrés ;
  - Orbite ne connaît pas les règles internes des banques : aucune règle n'est attribuée à une banque réelle.
- e2e : étape fiche (autres lignes, impôt aligné, net juste, Annuler) et étape Décider étendue au comparateur (montants = moteur, quotité et nom gardés, type, ajout/retrait, téléphone). Nouveautés `2026-10-13h`, SW `orbite-2026-10-13j`.

## 3 centvicies. « Rembourser ou épargner ? » et « Patrimoine net » (13 oct.)

Programme d'améliorations choisi par l'utilisateur le 13 oct. : 1 Rembourser ou épargner, 2 Patrimoine net (faits ici, maquette validée « Oui, construis les deux »), puis 3 lecture automatique des autres lignes de la fiche de paie, 5 import du relevé bancaire, 6 comparateur de banques, 7 bilan annuel PDF, 8 audit accessibilité et vitesse (**à faire, maquette d'abord pour chacun**). La double authentification (4) n'a pas été retenue.

- **Moteur** `public/espace/js/decider-calcul.js` (pur, `DeciderCalcul`, testé : `tests/espace/decider.test.js`, 8 tests) :
  - `comparer(sy, { somme, horizon: 5 | 10 })` : trois choix et leur valeur à l'horizon.
    - **rembourser** le crédit au taux le plus haut (à taux égal, le plus long) : même mensualité, durée plus courte ; intérêts évités, mois gagnés, nouvelle date de fin (la première échéance restante est celle du mois en cours) ; valeur = reste dû en moins + mensualités libérées placées au taux d'épargne ; sans indemnité (signalé) ;
    - **placer** en assurance vie / CEA : économie d'impôt de l'année par `OrbiteIntelligence.economieVersement(sy, D)` (nouveau : meilleur partage AV/CEA dans les plafonds, même moteur que l'optimiseur fiscal), placée au taux d'épargne, + rendement AV ;
    - **réserve** : mois de dépenses avant / après (même règle que le score de santé : dépenses déclarées < 30 % du net → 50 % du net), points de santé gagnés ;
    - **conseil** : compléter d'abord une réserve de 3 mois de dépenses (arrondie à 10 DT), puis le choix le plus rentable hors réserve.
  - `prochainesPrimes(sy, n)` : mois et montant net estimé (salaires en plus × net mensuel, arrondi à 10 DT).
  - `patrimoine(sy)` : logement + autres biens + épargne disponible + capital des contrats (saisi ou estimé) − reste dû des crédits (saisi, sinon déduit de la mensualité, du taux et des échéances restantes, marqué « estimé ») ; projection mois par mois (logement +x %/an, contrats au rendement AV avec leurs versements, crédits amortis), 10 à 25 ans (fin du dernier crédit + 3 ans) ; hausse par mois (sur 12 mois) ; jalons : fin de chaque crédit (marge libérée ; « logement entièrement à vous » pour l'immobilier), patrimoine doublé.
- **Profil** (`normaliser`) : `patrimoine { logement, autres, hausseLogement (2 %, −10…15) }`, `decider { rendementAv (6 %), rendementEpargne (5 %) }`.
- **Interface** :
  - Vie & impôts › nouvel onglet **Décider** (`#vie?onglet=decider`, `&somme=` préremplit) : `vue-decider.js` ; pastilles des deux prochaines primes et de l'épargne disponible, « Autre montant », bascule 5 / 10 ans, trois cartes (« Le plus rentable »), barres « ce que vaut la somme » mises à jour sur place (la largeur glisse), conseil sur fond sombre avec barre de partage, hypothèses dépliables (gardées dans le profil) ;
  - Mon orbite › nouvelle sous-rubrique **Patrimoine** (section `#patrimoine`, 2ᵉ partie) : `vue-patrimoine.js` ; chiffre, hausse par mois, barre possédé/dû, deux listes, champs logement / autres biens / hausse annuelle, courbe (moteur commun des graphiques : net en aire, dettes en tirets, fins de crédit en verticales sauf trop près du bord), jalons, hypothèses ;
  - styles `decider.css` ; conseil « Une prime arrive en … » dans Mon orbite (mois en cours ou suivant) → Décider avec la somme ; palette : « Rembourser ou épargner ? », « Mon patrimoine net ».
- e2e : étape « rembourser ou épargner ? (Décider) et patrimoine net ». Nouveautés `2026-10-13g`, SW `orbite-2026-10-13i`.

## 3 centnovodecies. Sous-rubriques : une partie de page à la fois (13 oct.)

Demande : « beaucoup de scrolling » ; la barre latérale doit montrer des sous-rubriques pour chaque rubrique longue ; pas de découpage pour les pages courtes ; belles animations ; terminer et fusionner sans attendre (pas de maquette demandée cette fois).

- **Module** `public/espace/js/sous-rubriques.js` (+ `sous-rubriques.css`, chargé juste avant `visite.js`). `CONFIG` décrit chaque page :
  - **Mon orbite** : Vue d'ensemble · Santé financière · Conseils · Capacité d'emprunt · Épargne et projets (`#orbite?section=marge` → Capacité) ;
  - **Mon profil** : Vous · Emploi et salaire · Foyer et budget · Crédits et épargne · Projets et banque (`?section=X` → la partie qui contient `#sec-X` ; les `<details>` de la partie s'ouvrent) ;
  - **Salaire** : Calcul du net · Augmentation · Où va votre brut · Deux offres · Calcul détaillé ;
  - **Épargne** : Simulation · Projection · Mode expert (seulement s'il est affiché) ;
  - **Crédit** : Simuler · Échéancier · Outils avancés (trois parties de l'onglet « Simuler »), puis les onglets existants Projet immobilier, Comparer mes offres, Regrouper mes crédits, Le TMM (`?espace=`) ;
  - **pages à onglets** (Vie & impôts, Ma progression, Mon mois, Paramètres) : la barre latérale reprend leurs onglets et reste synchronisée, sans découpage en plus. Les autres pages (Simulations, Abonnement, Assistant, Administration) ne sont pas découpées.
- **Adresse** : `#salaire?partie=offres`. Une adresse sans partie (lien de la rubrique, simulation ouverte, `#credit?type=…`) reprend à la **première** partie ; ajouter `&partie=…` pour viser une autre partie. Une partie masquée porte `data-sr-masque` (jamais `hidden`, que l'application gère elle-même). Une page avec une seule partie disponible affiche tout.
- **Remise à jour sans navigation** (`reappliquer`) : suit l'onglet que la page a choisi elle-même (Crédit, Mon mois…), ne force jamais l'onglet précédent (sinon « Simuler ce projet » ou le calendrier de Mon mois revenaient en arrière). Flèches du clavier dans les onglets suivies aussi (`keyup`).
- **Révélation automatique** : `Element.prototype.scrollIntoView` et `focus` (HTML et SVG) sont enveloppés : un élément d'une partie masquée affiche d'abord sa partie (liens internes, « Comparer deux offres », visite guidée, palette, « Ajouter »…), puis l'adresse devient `#vue?partie=…` (`replaceState`). `visite.js` appelle aussi `SousRubriques.reveler(el)` avant de tester la visibilité d'une cible.
- **Affichage** :
  - grand écran (≥ 1 024 px) : sous la rubrique active, liste dépliée (hauteur animée `grid-template-rows` 0fr → 1fr), fil vertical et curseur coloré du module qui glisse (`--y`, `--h`) ;
  - téléphone et tablette : `nav.sr-nav` collante sous la barre du haut (`--barre-h` mesurée), pastilles qui défilent avec une pastille blanche qui glisse (`--x`, `--l`), fondu sur les bords quand il y en a d'autres. **Classe `sr-nav`, pas `sous-nav`** (déjà prise par les liens du profil) ;
  - changement de partie : entrée douce (opacité + 12 px, 60 ms de décalage) ; rien avec « mouvement réduit » ; à l'impression tout est affiché.
- **Synchronisation** : `orbite:vue` (après les modules, dans un `requestAnimationFrame`), clics sur les onglets, `MutationObserver` (contenu rendu après coup), `surProfil`, redimensionnement. API `window.SousRubriques = { CONFIG, reveler, appliquer, active, partieDe }`. Événement `orbite:partie`.
- Palette (Ctrl K) : nouvelles sections, sans mot de darija déjà pris par une action (« zyeda » reste au négociateur) : augmentation, où va votre brut, deux offres, calcul détaillé, santé, conseils, capacité, échéancier, outils avancés, projection de l'épargne).
- Statistiques : changer de partie (`partie`) ou d'onglet du Crédit (`espace`) ne compte plus comme une simulation.
- e2e : fonction `partie(page, vue, cle)` (ouvre une partie comme la barre latérale) ; variable `DELAI=ms` pour raccourcir le délai d'attente pendant la mise au point. Nouveautés `2026-10-13f`, SW `orbite-2026-10-13h`.

## 3 centoctodecies. Autres lignes de ma fiche de paie (13 oct.)

Demande : que le compte affiche le net exact de la fiche de paie de l'utilisateur (données réelles : uniquement dans son compte, **jamais dans le dépôt**). Réponses de l'utilisateur : impôt **aligné sur la fiche** ; chef de famille ; prêt retenu sur la paie **seulement dans ses crédits** (le net affiché est avant ce prêt) ; primes de l'année « plus tard » (à reprendre). Maquette validée le 13 oct. (profil fictif : 3 200 DT brut).

- **Profil** (`orbite-calcul.js`) : `lignesFiche { sociales, gains, nettes }` (8 lignes { libelle, montant mensuel } au plus par groupe, lignes vides retirées) et `impotFiche { actif, irpp, css, brut }`.
  - **sociales** (retraite complémentaire type CAVIS, assurance groupe) : retirées du revenu imposable et du net, comme sur la fiche ;
  - **gains** (bonification de crédit…) : ajoutés au net, non imposables, comptés dans le coût employeur ;
  - **nettes** (syndicat, complément retraite, assurance auto, tickets restaurant) : retirées après l'impôt ;
  - **impôt aligné** : `calculAligne(entree, impotFiche)` ajoute au net l'écart « impôt d'un mois habituel selon Orbite − (IRPP + CSS de la fiche) », seulement quand le brut mensuel est celui de la fiche (au millime) ; une hausse de salaire, une offre ou un autre brut reprennent le calcul d'Orbite. L'impôt annuel d'Orbite (optimiseur, Mon année) reste celui du barème.
- **Moteur** (`moteurs/salaire/calcul.js`, `etat.js`) : entrées `retenuesSociales`, `gainsNets`, `retenuesNettes`, `ajustementImpot` (par mois × 12). Hors des liens de partage (pas dans `CHAMPS`). Sans lignes : calcul identique à avant (testé).
- **Interface** : bloc `#lf-bloc` dans Profil › Votre emploi et votre salaire (`lignes-fiche.js`, styles dans `fiche.css`) ; module Salaire : détail ligne par ligne (`#tableau-detail`), encart `#fiche-salaire` « Comme sur votre fiche de paie », « Retraite et santé » inclut les retenues sociales. La comparaison de deux offres reste à barèmes égaux (sans les lignes). Le contrôle de fiche de paie compare au barème seul (lignes neutralisées).
- **Calcul vérifié** sur la fiche réelle (en local, rien dans le dépôt) : le net obtenu est exactement celui de la fiche, avant le prêt.
- Tests : `tests/espace/lignes-fiche.test.js` (profil fictif), e2e « autres lignes de la fiche de paie ». Nouveautés `2026-10-13e`, SW `orbite-2026-10-13g`.
- **À faire** : lire ces lignes automatiquement avec « Remplir avec ma fiche de paie ». Primes de l'utilisateur : son calendrier (17 salaires : mars 1, juin 1, septembre 1,5, décembre 1,5) correspond à sa fiche, rien à changer.
- **Lignes datées** (question de l'utilisateur : un changement vaut-il pour le passé ? Réponse retenue : dater, maquette validée le 13 oct.) :
  - chaque ligne a `debut` / `fin` (« AAAA-MM », vide = toujours / sans fin) ; 16 lignes au plus par groupe (en cours, terminées, à venir) ;
  - changer le montant d'une ligne déjà enregistrée ou la retirer ouvre « À partir de quel mois ? » (mois en cours par défaut, deux ans avant ou après ; « C'était une erreur de saisie » corrige sans dater) ; une nouvelle ligne vaut pour tous les mois ;
  - fonctions pures testées dans `orbite-calcul.js` : `ficheChanger`, `ficheRetirer`, `ficheAnnulerFutur`, `ficheVue`, `lignesAuMois`, `profilAuMois` (champ interne `_moisFiche`), `signatureFiche`, `lignesDatees` ;
  - calculs mois par mois avec les lignes du mois : paie de l'année (Expert), `salaireAnnee` (impôt de l'année avec les lignes moyennes de l'année), Mon année, Ma progression, Et si…, hausses futures. Le net « d'aujourd'hui » prend les lignes du mois en cours ;
  - profil : étiquettes « depuis … · avant … DT », « passe à … à partir de … · annuler », « retirée à partir de … · annuler », volet « Lignes terminées ». Classes `lf-puce` (et non `.puce`, déjà utilisée) ;
  - les lignes datées ne sont pas des « hausses de revenu » (`futursRevenu`, dossier banque) : seulement le salaire et la loi.

## 3 centseptendecies. Quatre nouvelles pages publiques (13 oct.)

Maquette validée le 13 oct. (« Oui, construis les 4 »). But : répondre à des recherches Google sans page dédiée jusqu'ici. Générées par `scripts/pages-publiques.js` (ne jamais modifier le HTML à la main), même gabarit que les 7 autres (calcul en direct, pont vers Orbite, « Comment… », deux tableaux, FAQ + données structurées, 10 liens « voisins »).

- **Règle des 8 %** `/regle-8-pourcent-credit-tunisie` : mensualité, taux fixe, durée (mois), première échéance « MM/AAAA » → `OrbiteCalcul.reductionsTaux` (le moteur du module Crédit). Exemple : 150 000 DT à 9 % sur 240 mois, première échéance 01/2024 → réduction possible en février 2027 (9 → 4,5 %, 1 349,589 → 988,466 DT), puis février 2030, septembre 2036. Crédit plus ancien → « Réduction possible depuis » (à demander tout de suite) ; 84 mois ou moins → explication. Attention : l'exemple 01/2022 de la maquette était déjà « possible depuis février 2025 », d'où le passage à 01/2024.
- **Remboursement anticipé** `/remboursement-anticipe-credit-tunisie` : montant, taux, durée, mensualités payées, somme versée → reste dû, durée plus courte (même mensualité, dernière échéance plus petite) ou mensualité plus basse (même date de fin), intérêts évités, hors indemnité. Exemple : 100 000 DT à 10 % sur 240 mois, 20 000 DT après 60 mois → −68 mois et 46 344 DT évités, ou 750,101 DT/mois et 18 686 DT. Somme ≥ reste dû → « soldé ».
- **Regroupement** `/regroupement-credits-tunisie` : jusqu'à 3 crédits (case à cocher, DT par mois, taux, mois restants ; ligne vide ou décochée ignorée) + nouveau taux, durée, indemnité, frais → `CreditProjets.regrouper` (moteur de l'onglet Regrouper). Exemple : 320 + 210 DT/mois → 392,668 DT/mois, +966 DT au total. Les pages chargent désormais `/moteurs/credit/projets.js`.
- **Coût employeur** `/cout-employeur-tunisie` : brut + secteur → `CalculSalaire.repartitionCoutEmployeur`. 2 000 DT brut privé → 2 411,400 DT, net 1 534,101 DT ; sur 100 DT : 63,6 salarié, 22,6 CNSS, 13,8 État.
- `public/commun/pages-calcul.js` : `regle8`, `anticipe`, `regroupement`, `employeur`, `dureeTxt`, `taux`, exemples `R8_DEF`, `RA_DEF`, `RG_DEF`. `public/commun/pages-publiques.js` : champs des pages « crédit en cours » (`CHAMPS`), `data-si-v` (masqué si la valeur est vide), `data-si-pas` (masqué pour un état), champ vide non reformaté au départ du champ.
- Menu : Crédit « en cours » sur règle des 8 %, anticipé, regroupement ; Salaire net sur coût employeur. Voisins : 2 colonnes, puis 2 rangées de 5 dès 1 100 px.
- Plan du site (14 adresses), `_headers` (CSP stricte des 4 pages), liens dans le pied de l'accueil, SW `orbite-2026-10-13e`. IndexNow signalera les 4 pages tout seul à la fusion.
- Tests : `tests/espace/pages-nouvelles.test.js` (chiffres = moteurs, cas limites), `pages-publiques-html.test.js` (11 pages), e2e (étape des pages publiques).

## 3 centsedecies. Visibilité dans les moteurs de recherche, sans Search Console (13 oct.)

Question : « quota dépassé » dans Google Search Console. Explication : c'est la limite quotidienne (une dizaine) du bouton « Demander une indexation », pas un bug ; le plan du site déclaré dans robots.txt suffit à Google. Choix de l'utilisateur : IndexNow + Bing, liens et textes à publier, nouvelles pages publiques (maquette d'abord).

- **IndexNow** : clé publique `public/0075fa4068fc766fc078bdd75fc2cfd2.txt` (le fichier contient la clé ; ce n'est pas un secret, c'est le principe d'IndexNow) et `.github/workflows/indexnow.yml` : à chaque fusion sur main touchant `public/`, attend que la nouvelle version soit en ligne (version du SW + fichier de clé, 13 min au plus), puis envoie toutes les adresses du plan du site à `api.indexnow.org` (Bing, Yandex, Seznam, Naver ; Bing alimente DuckDuckGo, Yahoo, Copilot, ChatGPT). Lancement manuel possible (« Run workflow »). Permissions : lecture seule.
- **Bing Webmaster Tools** : déjà réglé par l'utilisateur (import depuis Google Search Console, plus tôt dans la conversation). **Ne plus le reproposer.**
- **Simulateur de salaire** (dépôt portail-rh, PR #15) : quatre liens directs vers les pages publiques (capacité, crédit, impôt AV/CEA, retraite) dans la carte « Ce net, et ensuite ? ».
- Tests : `tests/espace/indexnow.test.js` (clé unique et exacte, workflow en lecture seule, plan du site cohérent avec les pages et robots.txt).

## 3 centquindecies. Regrouper mes crédits : choix gardés (13 oct.)

Signalé par l'utilisateur (capture) : dans Crédit › Regrouper mes crédits, le crédit immobilier coché se décochait tout seul et l'indemnité de remboursement anticipé revenait à 1,5 %. Cause : `O.surProfil` (et `orbite:vue`) redessinait tout l'onglet avec les valeurs par défaut à chaque recalcul du profil (enregistrement, synthèse). Correction (`credit-espaces.js`) : choix gardés dans `regChoix` (cases par crédit, taux, durée, indemnité, frais) et réutilisés au rendu ; si les crédits du profil n'ont pas changé (`signatureCredits`), le formulaire n'est pas redessiné, seul le calcul est refait. Test e2e : immobilier coché + indemnité 2 %, puis profil recalculé et un crédit ajouté → tout est gardé (le test échouait sans la correction). SW `orbite-2026-10-13d`.

## 3 centquattuordecies. Mettre à jour le profil depuis un document (13 oct.)

Question de l'utilisateur : que se passe-t-il quand on dépose le tableau d'amortissement dans « Contrôler le tableau de ma banque » ? Réponse : contrôle au millime, lu sur l'appareil, sans effet sur le profil. Demande ensuite : « ajoute [la mise à jour] pour les crédits et aussi pour le salaire ». Maquette validée (« Oui, applique »). L'interface en arabe est abandonnée (« je ne veux pas l'interface en arabe »). Branche `maj-document`.

- **Crédit** (`module-credit.js`, encadré `[data-maj-zone]` sous le contrôle d'un tableau détaillé) :
  - `CreditAudit.creditDepuisAudit(au, maintenant)` (pure, `public/moteurs/credit/audit.js`) : mensualité de l'échéance suivante (accessoires compris), capital restant dû après la dernière échéance passée, taux de la phase en cours, `tauxType` « variable » si le taux change autrement qu'une réduction de moitié (« fixe » si une réduction existe, sinon non deviné), début (mois précédant l'échéance 1) et durée si tableau mensuel depuis l'échéance 1, échéances restantes avec la même formule que le profil (`OrbiteCalcul.echeancier`), jour du prélèvement, dernière réduction conforme (règle des 8 %), `finTexte`, `termine` ; null si tableau non détaillé ;
  - `CreditAudit.creditCorrespondant(credits, v)` : crédit du profil dont la mensualité est la plus proche à 10 % près, sinon -1 ;
  - liste « Crédit à mettre à jour » (crédits du profil + « Ajouter comme nouveau crédit » avec type et nom proposé « Crédit <banque> »), tableau avant → après (`.maj-diff`, une case par ligne, lignes identiques grisées « inchangé »), rappel si le tableau a des points à vérifier, bouton « Mettre à jour mon crédit » / « Ajouter ce crédit à mon profil » / « Crédit déjà à jour » ;
  - `appliquerMaj` : `Orbite.majProfil({ credits })` immédiat, message avec « Annuler » (crédits remis comme avant) ;
  - le choix du crédit survit aux recalculs du module (`OUTIL_FN.audit.cible` remis à zéro seulement si le texte du tableau change) ; cases et liste ne relancent pas le calcul.
- **Salaire** (`vue-fiche.js`, écran de contrôle) : `FicheCalcul.apercu(v, profil, maintenant)` (pure) donne salaire de base brut (avec « depuis <mois> »), primes et avantages, caisse, date d'embauche, avant → après ; cases liées aux choix existants (`r.choix`), les primes ne suivent que le salaire (même règle que `appliquer`) ; retraité : salaire et primes non repris.
- **Barre du haut sur téléphone étroit** (défaut trouvé par le test) : dans un module avec « Reprendre mon profil » + « Ajouter » + « Enregistrer » et la pastille d'enregistrement, la barre débordait de 20 px. Sous 430 px : boutons de 36 px, écarts de 6 px, « ? » de la visite masqué dans les modules (toujours dans Ctrl K) ; le titre cède sa place à la pastille quand elle s'affiche.
- « Quoi de neuf » `2026-10-13c`, SW `orbite-2026-10-13c`.
- **Tests** : 3 tests unitaires (`tests/credit/audit.test.js` : valeurs du crédit, taux variable et correspondance, réduction de taux) ; e2e « crédit : tableau de la banque contrôlé, puis crédit en cours mis à jour… » (avant → après, décocher une ligne, annuler, nouveau crédit conso, téléphone) ; étape fiche de paie complétée (avant → après exact, décocher salaire retire les primes, rien de coché, tout « inchangé »).

## 3 centtredecies. Fluidité : visite guidée et Voyage dans le temps (13 oct.)

Deux vidéos de l'utilisateur (« la transition entre les étapes n'est pas fluide ») analysées image par image. Corrections validées (« Oui, corrige tout »). Branche `fluidite`.

- **Voyage dans le temps (Crédit)** :
  - défaut : la partie foncée de la piste restait à 50 % (`.curseur` lit `--p`, jamais posé pour `#cr-temps-curseur`). `majTemps()` pose maintenant `--p` = échéance / total et `--c: var(--credit)` ;
  - lecture recalée sur `requestAnimationFrame` : tout le crédit en 4 s, proportionnel au reste quand on part du milieu ; en mouvement réduit, 12 pas espacés de 400 ms ; `lecture` est un objet `{ arreter }` ;
  - pendant la lecture, la section prend `.cr-temps--lecture` : la barre dégradée suit sans sa transition de 120 ms (plus de retard).
- **Visite guidée** :
  - le voile clair qui clignotait au changement de page venait du fondu de page (`document.startViewTransition`) qui emportait aussi le voile de la visite. `app.js` ne fait plus ce fondu, ni l'animation d'entrée `.vue--entree`, tant que `body.visite-ouverte` ;
  - plus d'attente fixe de 420 ms : `quandPrete()` attend `orbite:vue` de la bonne page puis une rubrique immobile sur 2 images (140 ms au moins, le temps que la bulle s'efface ; 900 ms au plus) ;
  - même page : la bulle reste et glisse, seul le texte se renouvelle (`.visite__bulle--texte`, 220 ms). Changement de page : le halo se referme sur place (`fermerHalo`), la bulle s'efface en 140 ms, puis elle est posée à sa nouvelle place sans traverser l'écran (`.visite--pose`) et apparaît, pendant que le halo glisse jusqu'à la rubrique.
- SW `orbite-2026-10-13b`. PR #123 fusionnée ; **vérifié en ligne par l'utilisateur** (Voyage dans le temps et visite « Pour aller plus loin »).
- **Tests e2e** : piste juste à 30/60 puis à chaque échantillon pendant la lecture, durée de la fin de lecture (1,2 à 3,6 s), arrêt propre ; pendant la visite, aucun fondu de page ni entrée animée, passage d'une page à l'autre < 1,1 s.

## 3 centduodecies. Apparence personnelle (13 oct.)

Graphiques unifiés vérifiés en ligne par l'utilisateur (étapes 1 à 3 : déploiement, bulle et clavier, sombre et téléphone). Maquette de l'apparence validée (« Oui, applique »). Branche `apparence`.

- **Trois réglages** dans Paramètres › Préférences, rubrique « Couleur, densité, taille » (`[aria-labelledby='r-perso']`), avec un **aperçu en direct** et « Revenir aux réglages d'origine » (`#apparence-origine`, désactivé quand tout est par défaut) :
  - **Couleur d'accent** (`#choix-accent`, nuancier de 5 pastilles, 3 puis 2 par ligne sous 520 px, radios au clavier) : Encre (défaut), Sidi Bou Saïd, Olivier, Djerba, Bougainvillier. Clair `#0A6CA8` `#4F6B1E` `#B5502A` `#B8327A` (texte blanc) ; sombre `#5DB4E8` `#A4C267` `#F08A5D` `#F27DB8` (texte foncé). Contrastes contrôlés par le test : texte sur l'accent ≥ 5:1 (clair) et ≥ 7:1 (sombre), accent sur le fond ≥ 4,5:1. Pas de rouge (erreurs), le contour de focus reste bleu.
  - L'accent habille : `.bouton--plein` (dont « Enregistrer » de la barre), interrupteurs cochés, repère du menu hors modules, sélection du texte, curseur des champs. Les couleurs des modules et des graphiques ne changent pas. Règles en `:where(:root[data-accent])` : même spécificité qu'à l'origine, donc les boutons volontairement colorés (`.cosmos`, Mon année, admin, comparer) gardent leur couleur.
  - **Densité** (`#choix-densite`) : Compacte resserre panneaux, en-têtes, grilles de champs, hauteurs de saisie (38 px), boutons (38 px, petits 36 px), bascules (36 px), liens du menu ; le texte ne change pas (contrôlé en e2e : la page raccourcit d'au moins 5 %, même taille de police).
  - **Taille du texte** (`#choix-taille`) : Normale, Grande (zoom 1,12 ; 1,07 sur téléphone), Très grande (1,25 ; 1,12 sur téléphone), comme la haute lisibilité (zoom sur `.principal`, `.dialogue`, `.toast`). La haute lisibilité seule vaut déjà « Grande ».
- **Stockage** : `user_metadata.orbite_accent`, `orbite_densite`, `orbite_taille` (null par défaut ; le compte fait foi au démarrage) et `localStorage["ef-apparence"]` (JSON). `theme-init.js` pose `data-accent`, `data-densite`, `data-taille` sur `<html>` avant l'affichage, **seulement sous `/espace/`** (accueil et pages publiques inchangés). `EFTheme.normaliserApparence` n'accepte que les valeurs connues.
- **Fichiers** : `public/espace/apparence.css` (après `confort.css`), `public/espace/js/apparence.js` (`window.OrbiteApparence` : `actuelle`, `definir({...})`, `origine`, `NOMS`), balisage dans `index.html`.
- **Ctrl K** : « Changer la couleur d'accent » (ouvre les Préférences, focus sur la couleur actuelle, ← → pour changer), « Passer en densité compacte / Revenir à la densité confortable », « Agrandir le texte / Agrandir encore / Revenir au texte normal ».
- **Visite** : étape « Votre apparence » dans « Les nouveautés » (version `2026-10-13a`, 9 étapes, badge « 9 nouvelles »). « Quoi de neuf » `2026-10-13a`. SW `orbite-2026-10-13a`.
- **Piège corrigé** : dans la palette, `aller("#compte?onglet=…")` suivi de `surVue("compte")` réécrivait l'adresse en `#compte` (onglet perdu) ; l'action accent écoute `orbite:vue` elle-même.
- **Livré** : PR #121 fusionnée ; vérifié en ligne par l'utilisateur (déploiement, réglages et aperçu, autre appareil, Ctrl K, retour à l'origine). Restent : Lot 3 interface en arabe (au choix de l'utilisateur), LF 2027 dès sa publication au JORT.
- **Tests** : `tests/espace/apparence.test.js` (normalisation, application seulement dans l'espace, stockage illisible, contrastes lus dans le CSS) ; étape e2e « apparence personnelle » (aperçu, bouton de la barre, compte puis appareil vide, attribut présent dès l'apparition du `<body>`, sombre, accueil inchangé, Ctrl K, flèche dans le nuancier, téléphone sans débordement, retour à l'origine).

## 3 centunies. Graphiques unifiés (12 oct.)

Maquette validée par l'utilisateur (« Oui, applique partout »). Branche `graphiques`.

- **Moteur commun** `public/espace/js/orbite-graphe.js` (`window.OrbiteGraphe`, fonctions pures testées sous Node : `graduations`, `indicesX`, `plusProche`, `marcheA`, `chemin`, `compact`) + `public/espace/graphe.css`.
  - `lignes(zone, o)` : courbes, aires, escaliers (`marche`), bandes, zones verticales (`zones`) et horizontales (`zonesY`), seuil, lignes verticales, marqueurs (avec courte étiquette `texte`), curseur, étiquette de fin.
  - `colonnes(zone, o)` : colonnes empilées (24 px au plus, bouts arrondis, 2 px entre segments).
  - Partout : grille fine, légende dès deux séries (`legende: false` pour la couper), bulle au survol **et au clavier** (← →, Maj pour aller vite, Origine/Fin), `surSurvol(x)` pour relier une lecture extérieure, phrase-résumé (`<title>`), « Voir le tableau » (`tableau: false` quand un tableau existe déjà, comme l'amortissement), tracé à la première apparition (rien si mouvement réduit), nouveau rendu automatique quand la largeur change (`ResizeObserver`).
  - Couleurs par classes `og-c1…og-c4`, `og-cn` (neutre), `og-cok`, `og-cdanger` : aucun `style=""` (CSP).
- **Palette** validée par le script de contrôle (bande de luminosité, saturation, séparation pour les daltoniens, contraste ≥ 3:1), ordre fixe :
  - clair (sur #FFFFFF) : `#2F5BEA` bleu, `#D9730D` ambre, `#0E9F6E` vert, `#7C3AED` violet ;
  - sombre (sur #10131C) : `#5A82F2`, `#D27A2C`, `#1FAD79`, `#9B70EE` ;
  - l'ancienne palette échouait (bleu Crédit ≈ violet Épargne, ambre et vert trop pâles, rien ne changeait en sombre).
  - Une seule série prend la couleur du module : Crédit et TMM bleu (1), Salaire vert (3), Épargne violet (4).
- **Migrés** : TMM ; Crédit (capital restant dû, colonnes annuelles, scénarios, évolution possible du TMM, louer ou acheter, règle des 8 %) ; Épargne (économie selon le versement, projection, éventail de 5 000 trajectoires) ; Ma progression › Carrière ; Et si… ; courbe du Salaire. Les anciens moteurs locaux et légendes HTML sont retirés.
- **Barres et jauges** sur la palette : `--cr-*` (Crédit, panneau du résultat en teintes sombres fixes `--g*-sombre`), `--net/--cnss/--irpp/--css` (Salaire ; texte foncé sur le vert, contraste vérifié), anneau du budget de Mon orbite, cartes A/B/C d'Et si….
- Non concernés : scènes canvas (planète, accueil, connexion), PDF.
- **Corrections trouvées en route** : la clé de couleur des légendes n'était pas ajoutée (vu sur capture, contrôlé par l'e2e) ; sur téléphone étroit (≤ 430 px) la pastille « Essai » ne garde que sa couronne (la barre du haut débordait).
- Tests : `tests/espace/orbite-graphe.test.js` ; étape e2e « graphiques unifiés » (bulle au clavier, tableau, palette claire puis sombre, téléphone sans débordement ni chevauchement des étiquettes, colonnes visibles).

## 3 centies. Point 5 livré : projet immobilier, offres, regroupement, TMM, Mon mois (12 oct.)

Branche `point5`. Choix validés par l'utilisateur (options conseillées) ; règles chiffrées : voir 3 decnonagies.

**Crédit : 5 onglets** (`public/espace/js/credit-espaces.js`, moteur pur `public/moteurs/credit/projets.js`, testé)
- Onglets `Simuler | Mon projet immobilier | Comparer mes offres | Regrouper mes crédits | Le TMM` ; route `#credit?espace=projet|offres|regrouper|tmm` ; aussi dans Ctrl K.
- **Projet immobilier** (premier logement, achat chez un promoteur) :
  - frais d'achat détaillés (`CreditProjets.fraisPrix`), tous modifiables ;
  - crédit nécessaire = besoin ÷ (1 − (hypothèque + dossier) / 100) ;
  - « Quand acheter ? » : le mois où l'apport et la capacité suffisent ;
  - option « Premier logement » affichée « à confirmer ».
- **Comparer mes offres** : classées par **coût total** ; lecture d'une offre en photo ou PDF ; chaque offre peut être enregistrée comme simulation de crédit.
- **Regrouper** : crédit immobilier facultatif ; IRA de 1,5 % du capital restant (modifiable) ; verdict `gagnant`, `moins_cher_mensualite_plus_haute`, `mensualite_baisse_cout_monte` ou `perdant`.

**TMM du mois** (`public/espace/js/tmm.js`, migration `supabase/migrations/0015_tmm.sql`)
- Migration 0015 **appliquée en production le 12 oct.** (éditeur SQL de Supabase, l'outil Supabase de la session demandant une autorisation impossible à afficher) ; vérifiée : RLS active, table fermée, `tmm_historique` pour les comptes connectés, saisie réservée à l'admin. PR #116 fusionnée.
- Table `tmm_mensuel` (mois au 1er, taux 0 à 30), RLS et tous les droits retirés ; lecture par `tmm_historique(24)` ; saisie et suppression par l'admin (`admin_tmm_saisir` refuse un mois futur, `admin_tmm_supprimer`).
- Administration › « TMM du mois » ; le dernier taux s'applique à tout Orbite (`OrbiteCalcul.definirTMM`, `Orbite.recalculer()`), gardé sur l'appareil (`orbite-tmm`) ; annoncé une fois au chargement suivant ; sans historique, retour au défaut 7,5 %.
- Onglet Crédit › Le TMM : courbe 24 mois, effet de la dernière variation et d'un point de plus sur les crédits variables (sans crédit variable : exemple de 150 000 DT sur 20 ans à TMM + 2,5).

**Mon mois** (nouvelle page du menu, route `#mois?onglet=budget|calendrier`, `vue-mois.js`, `mois.css`)
- **Budget** (`budget-calcul.js`, pur, testé) :
  - 8 enveloppes : crédits, logement et charges, courses, transport, santé, loisirs, épargne, divers ;
  - proposées depuis le profil tant que l'utilisateur n'en a modifié aucune (crédits, loyer + charges, épargne ; le reste réparti 40 / 15 / 8 / 12 / 25 %) ;
  - reste à vivre et montant **par jour jusqu'à la paie** (aujourd'hui compris, jour de paie non) ; alertes de dépassement et de plan supérieur au revenu ;
  - dépense en une phrase (`BudgetCalcul.phrase`) : français, darija, chiffres arabes, « mille » / « k » ; enveloppe devinée, modifiable ;
  - **seuls les totaux par enveloppe** sont gardés, dans `profil.budget` (`{ enveloppes, mois: { "AAAA-MM": { cle: montant } } }`, 12 derniers mois) ; chaque changement s'annule depuis le message ; l'import d'un relevé viendra plus tard.
- **Calendrier** (`calendrier-calcul.js`, pur, testé) :
  - paie et versements en plus (13ᵉ mois, calendrier des primes), échéances des crédits et dernière échéance, versements d'épargne, 31 décembre, rappels déjà en place (essai, abonnement, objectifs… via `window.OrbiteRappels.liste()`) ;
  - mois en cours et 11 suivants ; total des prélèvements ;
  - « Régler les dates » : jour de paie, jour de prélèvement de chaque crédit, jour de versement de l'épargne (qui règle aussi son rappel) ;
  - « Ajouter à mon agenda » : fichier `.ics` de 12 mois, créé sur l'appareil.
- Profil : nouveaux champs `jourPaie` (0 = dernier jour), `credits[].jourPrelevement` (0 = non précisé, aussi dans Mon profil › Crédits) et `budget` (normalisé seulement si `budget-calcul.js` est chargé, donc pas sur les pages publiques).
- Accès : rail « Mon mois », onglet « Moi » sur téléphone, Mon profil, Ctrl K (« Noter une dépense », « Calendrier de l'argent »).
- Icônes ajoutées : `panier`, `calendrier`.

**Corrections après mise en ligne (12 oct.)**
- Budget : la proposition dépassait le revenu de quelques dinars (vu sur un vrai profil : 2 769 DT prévus pour 2 768 DT), car chaque enveloppe libre était arrondie à la dizaine la plus proche. Désormais : dizaine inférieure, et « Divers » reçoit le reste exact au dinar inférieur ; un test vérifie qu'aucune proposition ne dépasse le revenu, de 0 à 6 000 DT.
- Visite guidée : le halo est recalé quand la page finit de s'afficher (`ResizeObserver` sur la page et sur la rubrique visée), pas seulement au défilement ou au redimensionnement.
- Visite guidée (suite, mesuré) : la rubrique pouvait encore glisser de 2 px **sans changer de taille** après l'arrivée sur la page, ce qu'aucun observateur ne voit. La visite compare sa position à chaque image pendant 1,2 s après chaque étape et recale le halo (`suivre`).
- Liens vers une rubrique de la même page (« Comptes » dans Administration, « Comparer une offre » dans Salaire, « Aller au contenu ») : ils menaient à « Mon orbite », car le routeur lit tout ce qui suit « # » comme une page. `app.js` intercepte désormais ces liens : défilement jusqu'à la rubrique et focus, sans changer l'adresse. Contrôlé dans l'étape e2e du TMM.

**Barre du haut** : actions secondaires en icône seule de 641 à 1480 px (`confort.css`), pour ne plus déborder.

**Livraison** : SW `orbite-2026-10-12k`, Nouveautés `2026-10-12i`, visite « Les nouveautés » `2026-10-12c` (Mon mois, calendrier, onglets du Crédit en premier) ; « Envoyer un document » passe dans « Pour aller plus loin ». Unitaires 535 ; étapes e2e « crédit, point 5 », « TMM du mois », « Mon mois ».

## 3 decnonagies. Point 5 : règles sourcées et validées (12 oct.)

Recherche du 12 oct. Les sites officiels (jibaya.tn, jurisitetunisie, sites des banques) sont injoignables depuis l'environnement de travail ; seuls les résumés de recherche sont disponibles. Les sources se contredisent. **Choix validés par l'utilisateur** (options conseillées) :

- **Frais d'achat d'un logement neuf chez un promoteur, sous 500 000 DT** :
  - valeurs par défaut, **toutes modifiables** :
    - droit d'enregistrement fixe, 30 DT par page ;
    - conservation foncière, 1 % ;
    - inscription de l'hypothèque de la banque, 0,2 % du prêt ;
    - notaire ou avocat, 1,5 % ;
  - au-delà de 500 000 DT : droit progressif, avec le message « à confirmer avec le notaire » ;
  - sources :
    - [bigdatis 2026](https://bigdatis.com/droits-enregistrement-bien-immobilier-tunisie-2026/) ;
    - [Abilia](https://abilia.tn/les-droits-denregistrement-dun-bien-immobilier-en-tunisie-en-2024/) ;
    - [Tuniscope](https://www.tuniscope.com/article/437754/actualites/tunisie/immobilier-en-tunisie-2903241021) ;
    - [droits de conservation foncière](https://www.jurisitetunisie.com/tunisie/index/cdet/droits_conservation.html) ;
    - [Code des droits d'enregistrement 2025](https://jibaya.tn/wp-content/uploads/2025/04/Code-des-Droits-dEnregistrement-et-de-Timbre-2025.pdf) ;
  - TVA : déjà comprise dans le prix TTC du promoteur ; 19 % au-delà de 400 000 DT.
- **Indemnité de remboursement anticipé** (rachat) :
  - aucun plafond légal tunisien n'a été trouvé : c'est le contrat qui fixe le montant ;
  - valeur par défaut : **1,5 % du capital restant dû**, modifiable ;
  - repères : la presse cite 1 à 1,5 % ; le barème d'une banque mentionnait 5 % ;
  - source : [Managers](https://managers.tn/2024/06/20/ce-que-les-tunisiens-doivent-savoir-sur-le-remboursement-anticipe-dun-credit/).
- **Programme « Premier logement »** : option affichée « à confirmer », avec un lien pour vérifier auprès de la banque. Paramètres modifiables :
  - apport de 20 % financé par l'État ;
  - plafond du prix ;
  - taux du prêt de l'État.

## 3 noveoctogies. Lot 2 livré : partager, guider, comparer, annuler, lisibilité, document reçu (12 oct.)

Branche `lot2`. Tout tourne sur l'appareil ; aucune nouvelle table, aucune migration.

**Partager une simulation** (`public/commun/partage-lien.js`, pur, testé ; `public/espace/js/partage-simulation.js`)
- Bouton « Partager » dans la barre des modules (dans l'en-tête de Crédit et Épargne sur téléphone ; Salaire garde son bouton sous le résultat). Aussi dans Ctrl K.
- Le lien ouvre la **page publique** de l'outil, déjà remplie : `/simulateur-credit-tunisie`, `/salaire-net-tunisie`, `/simulateur-assurance-vie-tunisie`, `/calcul-cea-tunisie`.
- Les valeurs voyagent **après le « # »**, donc jamais envoyées au serveur. Elles ne contiennent que des montants : champs fixes par page, valeurs bornées, champs inconnus ignorés.
- **Salaire brut** (Épargne) et **situation de famille** (Salaire) : joints seulement si la case est cochée ; décochée par défaut.
- **Aperçu** : « Ce que verra la personne » est calculé par `PagesCalcul.affichage`, la fonction même de la page publique (chargée à la demande).
- **Différences listées** (dépliant), par exemple :
  - durée arrondie aux années ;
  - TMM du jour ;
  - taux sous le TMM ramené au TMM ;
  - crédit « libre » affiché logement ou consommation ;
  - assurance, frais et différé non repris ;
  - rendement net de frais ;
  - CEA non repris sur la page assurance vie.
- **Canaux** :
  - copier (repli `execCommand`) ;
  - **QR code** dessiné sur l'appareil (`public/espace/vendor/qrcode-generator-1.4.4.js`, MIT, Kazuhiko Arase), avec PNG à enregistrer ;
  - WhatsApp (`wa.me/?text=`), e-mail (`mailto:`), partage natif du téléphone, « Voir la page ».
- **Pages publiques** (`pages-publiques.js`) : lisent le « # », remplissent le formulaire, affichent « Reçu par lien » et une note. Les pages sont générées par `node scripts/pages-publiques.js`, qui inclut maintenant `/commun/partage-lien.js`.

**Haute lisibilité** (`public/espace/js/lisibilite.js`)
- Réglage dans Paramètres › Préférences › Lisibilité, et dans Ctrl K (« lisibilité »).
- Gardé dans `user_metadata.orbite_lisible` (le compte fait foi au démarrage) et recopié dans `localStorage` `ef-lisible`. `theme-init.js` l'applique avant l'affichage.
- Effet :
  - `zoom` 1,12 sur `.principal` (1,07 sur téléphone, car toutes les tailles sont en px), 1,08 sur les fenêtres ;
  - gris plus foncés, filets marqués, liens soulignés, focus de 3 px ;
  - **animations coupées** (`data-mouvement="reduit"`, qui garde la main sur le réglage « Animations »).

**Annuler / rétablir** (`public/espace/js/historique.js`)
- Boutons ↶ ↷ dans la barre (masqués sur téléphone, où l'action passe par Ctrl K), plus Ctrl Z, et Ctrl Y ou Ctrl ⇧ Z.
- Désactivé dans un champ de texte, pour laisser le « annuler » de la frappe, et quand une fenêtre est ouverte.
- **Instantanés** :
  - `module.instantane()` et `restaurer()` s'ils existent (Crédit : les 3 scénarios et l'onglet actif) ;
  - sinon `etat()` et `charger()`.
- **Quand** :
  - 50 instantanés par module, en mémoire seulement ;
  - l'état est noté **avant chaque geste** (écoute en phase de capture `input`, `change`, `click` dans `#vue-<module>`, une fois par rafale de 1,2 s) ;
  - puis après chaque pause de saisie (`orbite:modifie` + 700 ms) ;
  - `app.js` `modifie()` émet `orbite:modifie`.
- Pour les tests : `OrbiteHistorique.position()`. Avant une modification extérieure (simulation guidée) : `OrbiteHistorique.avant(vue)`.

**Simulation guidée** (`public/espace/js/guidee.js`, fenêtre `#dlg-guidee`)
- Bouton « Simulation guidée » (`[data-guidee]`) dans l'en-tête des 3 modules, et dans Ctrl K.
- Une question à la fois (choix ou montant), puis le **résultat** (`module.resume()`) ; « Voir le détail » ferme et fait défiler jusqu'au module.
- **Crédit** : type, montant, durée, taux.
  - Les durées proposées dépendent du type (logement 10 à 25 ans, voiture 3 à 7 ans, consommation 2 à 7 ans).
  - « Taux habituel » = TMM + 2,5 (logement), + 3 (voiture) ou + 3,5 (consommation). Ce sont les mêmes exemples que la page publique.
- **Salaire** : brut ou net, montant, secteur, famille (0 à 4 enfants).
- **Épargne** : objectif (assurance vie, CEA ou les deux), montants par mois, durée.
- Le module est rempli par ses propres fonctions : `charger(MoteurCredit.encoderLien(...))`, `EtatSimulation.encoder`, `Partage.encoder`.
- `Orbite.detacherSimulation(vue)` fait qu'« Enregistrer » crée une **nouvelle** simulation au lieu de mettre à jour celle qui était ouverte.

**Comparer** (`public/espace/js/comparer-calcul.js`, pur, testé ; `simulations.js`)
- Bouton « Comparer » dans Simulations : des cases apparaissent sur les cartes. Toucher une carte la coche, sans l'ouvrir.
- 2 ou 3 simulations du même module ; les autres modules sont grisés.
- Tableau côte à côte avec une colonne « Écart ». ✓ marque la meilleure valeur seulement si le sens est clair :
  - plus bas : mensualité, coût, intérêts, impôt, prélèvements, effort, taux ;
  - plus haut : net, économie, capital au terme ;
  - ni l'un ni l'autre : brut, capital emprunté, coût employeur.

**Rappel de versement** (`orbite-calcul.js` `jourVersement` de 0 à 28 ; `rappels-calcul.js` type `versement`)
- Réglage dans Mon profil › Contrats : liste « Rappel de versement » (1er, 5, 10, 15, 20, 25 ou 28 du mois).
- Rappel le jour choisi à 9 h, visible 5 jours ; seul le prochain est créé.
- Le montant (contrats commencés) apparaît dans Orbite, **jamais dans l'e-mail**.

**Document reçu** (manifeste `share_target`, `sw.js`, `recevoir-calcul.js` pur et testé, `recevoir.js`)
- Avec Orbite installée, « Partager › Orbite » envoie un POST `multipart` à `/espace/recevoir` : PDF, JPEG, PNG ou WebP, 5 fichiers au plus, 15 Mo chacun.
- Le service worker range les fichiers dans le cache `orbite-recus`, puis redirige (303) vers `/espace/#recevoir`.
- La page lit les fichiers, **vide aussitôt le cache** et nettoie l'adresse.
- Un PDF est lu sur l'appareil (2 pages) puis classé :
  - indices de mots : fiche de paie, tableau, offre ;
  - lignes « date + 3 montants » pour un tableau ;
  - indices tirés du nom du fichier ;
  - sous 3 points, Orbite demande à la personne.
- Une photo n'est pas lue d'avance : la personne choisit.
- Ouverture de l'outil :
  - fiche de paie → `OrbiteFiche.ouvrir()` puis `lancer(fichier)` ;
  - tableau ou offre → `ModuleCredit.lireDocument("audit" | "offre", fichiers)`.
- La fenêtre passe devant « Quoi de neuf » (le partage vient d'un geste de la personne).

**Barre des modules** : de 641 à 1 280 px, les actions secondaires sont en icône seule avec une infobulle ; de 641 à 1 480 px, « Guide » et « Partager » aussi. Aucun débordement à 800, 1 024 et 1 280 px (contrôlé en e2e).
**Format** : `EFModele.formaterIndicateur` affiche un entier sans décimales (« 60 mois » et non « 60,00 mois »).

**Visite guidée**
- « Les nouveautés », version `2026-10-12b`, 8 étapes : simulation guidée, partager, annuler, document reçu, crédit complet, comparer, rappel de versement, haute lisibilité.
- « Pour aller plus loin » passe à 14 étapes : s'y ajoutent Ctrl K, applications, négociation et dossier banque.

**Livraison** : « Quoi de neuf » `2026-10-12h` ; SW `orbite-2026-10-12j`.

**Tests**
- Unitaires : `partage-lien` (7), `comparer-calcul` (4), `recevoir-calcul` (4), rappel de versement (1).
- e2e, 5 nouvelles étapes :
  - partage ;
  - lisibilité et annuler ;
  - simulation guidée, comparer et rappel ;
  - document reçu (POST par le vrai service worker, puis photo) ;
  - barre sans débordement.

**Pièges**
- Dans un test, un `goto` vers la même page avec un autre « # » **ne recharge pas** : `page.reload()`.
- `setTimeout` renvoie un nombre : y poser une propriété échoue en mode strict.
- Une étape e2e qui modifie un module doit le remettre en état : l'étape « lire une offre » part de l'état du module Crédit.

## 3 octoseptuagies. Lot 2 et point 5 : décisions du 12 oct. (à livrer)

- **Vidéo 4 livrée** (12 oct.) : `orbite-video-3d-linkedin-youtube.mp4`, 30 s, 1920 × 1080, 60 i/s, −14 LUFS, 26 Mo (voir « 3 quinseptuagies »).
- **Lot 2** (validé dans la maquette https://claude.ai/artifact/DfKbFaPFpPDD6ei3Z1GgKJ) :
  - **partage** d'une simulation (lien, QR code, WhatsApp, e-mail) : le lien ouvre une **page publique préremplie**, sans compte. Il contient les montants, jamais le nom ni le profil ;
  - **simulation guidée** (« Me guider ») dans **Crédit, Salaire et Épargne** ;
  - **haute lisibilité** : réglage dans **Paramètres › Préférences**, retrouvé aussi par **Ctrl K** (« lisibilité »), gardé sur le compte. Texte plus grand, contraste renforcé, animations coupées ;
  - **recevoir un PDF partagé** (application installée, « Partager → Orbite ») : Orbite reconnaît la **fiche de paie**, le **tableau de la banque** ou l'**offre**, et ouvre le bon outil ;
  - restent aussi : comparer 2 ou 3 simulations enregistrées, rappel de versement mensuel, annuler et rétablir.
- **Point 5** (maquette https://claude.ai/artifact/R72uvGBAemjcuZu8qT8tY1) : les **6 fonctions validées avec les choix conseillés** :
  - **projet immobilier** : premier logement et achat auprès d'un promoteur, nouvel onglet dans Crédit ;
  - **comparateur d'offres** : classement par coût total, offres enregistrées dans mes simulations ;
  - **suivi du TMM** : historique sur 24 mois ;
  - **rachat de crédits** : crédit immobilier inclus au choix ;
  - **budget du mois** : totaux par enveloppe, import de relevé plus tard ;
  - **calendrier** : nouvelle page du menu.
- **Règles** : les taux des frais d'achat (droits d'enregistrement, conservation foncière, acte) et les indemnités de remboursement anticipé, je les **source et l'utilisateur les valide avant tout codage**.
- **TMM** : saisi chaque mois par l'administrateur dans **Administration** (champ « TMM du mois »), appliqué à tout Orbite.
- **Loi de finances 2027** : on attend le texte officiel (JORT).

## 3 septseptuagies. Visite guidée en trois chapitres (12 oct.)

- **Demande** : mettre la visite guidée à jour avec les nouveautés (ordre validé : Lot 1 → visite → Lot 2 → point 5).
- `visite.js` : trois chapitres sur l'écran de choix.
  - **L'essentiel** (8 étapes) : inchangé. L'étape Crédit cite aussi le contrôle du tableau de la banque.
  - **Les nouveautés**, version `2026-10-12`, 8 étapes : Ctrl K (`#palette-ouvrir`) → Mes applications (`#apps-ouvrir`) → négociation (`#salaire`, `#nego-ouvrir`) → crédit en une phrase (`#cr-phrase-bloc`) → lire une offre (`#cr-outil-offre`) → contrôler le tableau de la banque (`#cr-outil-audit`) → voyage dans le temps et documents (`.cr-temps`) → dossier banque (`#dossier-ouvrir`).
  - **Pour aller plus loin** (`plus`, 10 étapes) : les anciennes nouveautés (fiche de paie → rappels).
- Le badge « 8 nouvelles » reste jusqu'à la fin du chapitre des nouveautés (`user_metadata.orbite_visite_nouveautes = "2026-10-12"`). Message de fin propre à « Pour aller plus loin ».
- e2e « visite guidée » : les trois chapitres, avec les pages ouvertes à chaque étape.
- SW `orbite-2026-10-12i`.

## 3 sexseptuagies. Lot 1 « crédit complet » (12 oct.)

- **Demande** (maquette validée https://claude.ai/artifact/DfKbFaPFpPDD6ei3Z1GgKJ, puis « applique 1, 2, 4 et 5 ») : reprendre dans Orbite les fonctions du simulateur de crédit qui lui manquaient.
- **Choix validés le 12 oct.** :
  - ordre des livraisons : Lot 1 → visite guidée → Lot 2 → point 5 ;
  - **dictée avec avertissement** : la reconnaissance vocale de Chrome et d'Edge envoie la voix à Google ou à Microsoft, c'est dit avant le premier usage ;
  - **loi de finances 2027** : on attend le texte officiel (JORT), rien de provisoire ;
  - **point 5** : une seule maquette pour les 6 fonctions.
- **Une phrase** (`moteurs/credit/phrase.js`, `window.CreditPhrase`, reprise de `analyserTexte`) :
  - comprend le montant, la durée, le taux ou TMM + marge, l'apport et le prix, le différé, la périodicité, l'amortissement, l'assurance, les frais et le type, en français ou en arabe (chiffres arabes, « ألف ») ;
  - les valeurs aberrantes sont ignorées ; résumé « Compris : … » sous le champ (zone `aria-live`) ;
  - module Crédit : bloc `#cr-phrase` en tête de l'éditeur, touche Entrée ou « Remplir » ;
  - une description complète (montant et durée) remet à zéro les options non citées.
- **Dictée** :
  - bouton micro seulement si `SpeechRecognition` existe ; le premier appui affiche l'avertissement (`localStorage` `orbite_dictee_ok`), le second écoute ;
  - langue `ar-TN` si le champ contient de l'arabe, sinon `fr-FR` ;
  - `_headers` : `microphone=(self)` (était `()`), les cadres des simulateurs restent sans micro.
- **Offre et tableau de la banque** (`moteurs/credit/audit.js`, `window.CreditAudit`, reprise de `analyserOffre`, `analyserTableau`, `auditerTableau`) :
  - outil « Lire une offre bancaire » (photo, PDF ou texte) : les valeurs repérées sont modifiables, puis « Utiliser dans mon scénario » ;
  - outil « Contrôler le tableau de ma banque » (remplace « Vérifier l'échéancier ») : PDF, même scanné, ou plusieurs photos, lus par `FicheLecture.lire(f, { pagesMax: 40 })` (nouvelle option, 3 pages par défaut) ;
  - le rôle des colonnes est deviné quel que soit leur ordre ; les chiffres mal lus sont corrigés par recoupement ; les échéances manquantes sont signalées ; les intérêts sont recalculés par phase de taux ; les remboursements anticipés sont détectés ; mensualité théorique (pas pour une phase d'une seule ligne, déjà signalée) ; règle des 8 % ;
  - un texte sans date garde l'ancienne comparaison avec le scénario ;
  - rapport : verdict, chiffres, constats, tableau des échéances recalculées, boutons « Rapport PDF » et « Excel ».
- **Documents** (`espace/js/credit-documents.js`, `window.CreditDocuments`) :
  - échéancier en PDF (jsPDF chargé à la demande) et en Excel (`Xlsx.classeur`, totaux en formules), boutons `#cr-pdf` et `#cr-xlsx` à côté du CSV ;
  - rapport de contrôle en PDF et en Excel ;
  - lettre à la banque en Word (`.docx` minimal construit avec `Xlsx.zip`), bouton « Word (.docx) » dans « Quand demander la réduction ? ».
- **Voyage dans le temps** : panneau `.cr-temps` au-dessus des graphiques. Curseur sur les échéances et bouton lecture/pause ; il affiche le capital remboursé, les intérêts payés, l'assurance et le capital restant dû, avec une barre de progression (`--p` posé en CSSOM, CSP intacte).
- **Tests** :
  - `tests/credit/phrase.test.js` (9), `audit.test.js` (7), `documents.test.js` (4) ;
  - e2e : 3 étapes ; « lire une offre » utilise le PDF `e2e/fixtures/tableau-banque.pdf`, fabriqué par `e2e/fixtures/fabriquer-tableau.js` (profil fictif, +0,750 DT à l'échéance 14).
- **Versions** : SW `orbite-2026-10-12h`, Nouveautés `2026-10-12g` (« Crédit complet »).

## 3 quinseptuagies. Vidéo 4 : « Orbite » en 3D, 30 s, 16:9 (12 oct., livrée)

- **Demande** (12 oct.) : une vidéo promotionnelle 3D pour LinkedIn et YouTube, inspirée d'une nouvelle vidéo TikTok (ordinateur portable dans le noir, écran qui raconte l'histoire, volets lumineux entre les plans, musique électro). Storyboard de 8 plans validé dans la maquette https://claude.ai/artifact/DfKbFaPFpPDD6ei3Z1GgKJ (« 30 s, storyboard validé »).
- **Livrable** : `orbite-video4-16x9.mp4` (1920 × 1080, 60 i/s, H.264 + AAC, −14 LUFS, sous 30 Mo). **Non versionné** (`*.mp4`, `*.wav`).
- **Sources** `promo/video4/` (régénérables) :
  - `scene.html` : Three.js 0.160 en local (`lib/`, licence MIT), ordinateur portable en métal dans une pièce sombre, sol miroir, `UnrealBloomPass`. L'écran est un canevas 2D de 1600 × 1000 redessiné à chaque image ; la lumière de la pièce prend la couleur moyenne de l'écran. Plan 4 : une seconde scène 3D (noyau, anneau, satellites) rendue dans l'écran. Plans 7–8 : le logo éclate en pixels 3D puis se reforme. Calque 2D devant pour l'adresse et la signature (petit drapeau tunisien devant « Conçue en Tunisie »). `render(t)` déterministe ;
  - `rendu.js preview [--h 540] t…` (aperçus dans `apercu/`) ou `rendu.js all 60 sortie.mp4 4 1080` (4 onglets ; ajoute `musique.wav` s'il existe) ;
  - `musique.py` : 30 s synthétisées, 120 BPM, ré majeur, reprend les instruments de `video3`. Frappes au clavier calées sur les deux saisies, battement de cœur, impacts à 3,0 (envoi), 17,0 (« 1 seule application »), 23,0 (explosion), 25,45 (logo reformé), 27,0 (final), compteur qui ralentit 15,7–17,0, icônes qui tombent, cloches sur le drapeau ; fondu 28,6–30.
- **Déroulé** : question « Combien je touche vraiment ? » tapée puis envoyée → courbe brut → net, « 2 161,884 DT net par mois » → pistes de montage (crédit auto qui se termine en avril 2029, « +520 DT par mois » d'épargne) → noyau 3D et satellites → compteur LED « 1 seule application » → lanceur (Crédit, Assurance vie, Assurance auto, Salaire) puis palette Ctrl K « assurance auto » → le logo éclate et se reforme, drapeau qui ondule → Orbite, « Votre salaire au centre. Tout le reste en orbite. », adresse, signature.
- **Corrections du 12 oct.** : caméra plus proche et visée plus haute (l'écran ne touche plus le bord du haut), textes de l'écran agrandis, pistes décalées pour des étiquettes plus grandes, pastille « avril 2029 » moins lumineuse, éclat du final réduit, touches « Ctrl K » dans le bon ordre.
- Règle tenue : aucune mention de prix, d'essai, d'offre ni de parrainage ; chiffres du profil fictif.

## 3 quinsexagies. Vidéo promotionnelle 3D « Fintech cinéma » 30 s, 16:9 + 9:16 (12 oct., livrée)

- **Pourquoi** : la vidéo de 45 s a été jugée trop proche de la première (mêmes couleurs, même interface à plat). L'utilisateur veut une promo « comme celle des grandes entreprises », sur le modèle d'une vidéo TikTok de theuxda (application mobile en 3D, musique électro-pop). Choix : **musique originale dans le même style** (la chanson de la vidéo est protégée par le droit d'auteur), **style « Fintech cinéma »**, **30 s**, **16:9 (YouTube, LinkedIn) + 9:16 (Reels, TikTok, Shorts)**.
- **Livrables** : `orbite-3d-16x9.mp4` (1920 × 1080) et `orbite-3d-9x16.mp4` (1080 × 1920), 60 i/s, H.264 2 passes ~4,7 Mb/s + AAC, −14 LUFS, chacun sous 30 Mo (limite d'envoi). **Non versionnés** (`*.mp4`, `*.wav`).
- **Sources** `promo/video3/` (régénérables) :
  - `captures.js` : vraies captures d'Orbite avec le **profil fictif** « Aziz Démo » (2 700 + 300 DT brut, célibataire, embauché en 2014, crédit auto 520 DT/mois). Deux sessions : ordinateur 1440 × 900 (×2) et mobile 390 × 844 (×3). Faux Turnstile, `bypassCSP` pour masquer toasts et visite. Écrit `captures/d-*.png` (écrans ordinateur), `m-*.png` (écrans mobile), `c-*.png` (cartes découpées).
  - `scene.html` : scène **Three.js 0.160** (copie locale dans `lib/`, licence MIT jointe, aucun CDN). Ordinateur portable en métal (`RoundedBoxGeometry`, charnière qui s'ouvre de 2,0 à 4,6 s, écran qui affiche les captures), téléphone, cartes de verre flottantes, carte macro « 2 161,884 DT », poussière lumineuse. Éclairage `RoomEnvironment`, post-traitement `BokehPass` (profondeur de champ) + `UnrealBloomPass` + `OutputPass`. Caméra par images clés interpolées. Textes en surimpression sur un calque 2D, ajustés à 90 % de la largeur ; voile sombre en haut et en bas pour la lisibilité. Format vertical : caméra reculée (×1,7) et objets resserrés (x × 0,5). `render(t)` déterministe.
  - `rendu.js <h|v> all 60 sortie.mp4 4` (Chromium + SwiftShader, ~1,2 s par image, environ 35 min par format) ou `rendu.js <h|v> preview t…`.
  - `musique.py` : 30 s, 120 BPM, ré majeur (si m–sol–ré–la), mélodie pincée, basse en octaves à contretemps ; impacts à 4,6 s (logo), 11,6 s (« Au millime près. ») et 27 s (final) ; montées à 2,0, 10,8 et 25,8 s ; roulement de caisse claire 26,2–27 s ; fondu 28,4–30 s.
  - Assemblage : `ffmpeg -i images.mp4 -i musique.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 256k -shortest -movflags +faststart`, puis copie 2 passes pour rester sous 30 Mo.
- **Déroulé** : « Votre argent. Enfin clair. » (l'ordinateur s'ouvre) → logo Orbite + drapeau qui flotte → « Tout votre argent. Un seul écran. » (les cartes sortent de l'écran) → « Au millime près. » (macro sur le net, flou de profondeur) → « Votre fiche de paie, vérifiée. Rien n'est envoyé. » → « Sur ordinateur. Et dans votre poche. » (le téléphone se lève) → « Votre avenir, calculé. » → final : Orbite, « Votre salaire au centre. Tout le reste en orbite. », « Découvrez Orbite », adresse, « Conçue en Tunisie · Powered by Mohamed Aziz Jaouadi ».
- Règle tenue : **aucune mention de prix, d'essai, d'offre ni de parrainage** ; profil fictif uniquement.

## 3 quatersexagies. Vidéo promotionnelle 45 s « Robuste. Précise. Tunisienne. » (12 oct., livrée)

- **Demande** : vidéo moderne qui donne l'impression de robustesse d'une application unique en Tunisie, avec des nouveautés en continu. Choix : **45 s, 16:9 seulement (YouTube et LinkedIn)**, **musique + textes animés** (français + touche de darija). Storyboard validé dans la maquette https://claude.ai/artifact/DkMd6TSJQBiCpzgR7TN4Sb.
- **Livrable** : `orbite-promo-45s.mp4` envoyé à l'utilisateur (1920 × 1080, 60 i/s, H.264 2 passes 4,7 Mb/s + AAC 192 k, −14 LUFS, 26,5 Mo : l'envoi est limité à 30 Mo). Original CRF 16 (81 Mo) régénérable. **Non versionné** (`.gitignore` : `*.mp4`, aperçus, `.wav`).
- **Sources** `promo/video2/` (régénérables) :
  - `captures.js` : vraies captures (faux Supabase, faux Turnstile, `bypassCSP` pour masquer toasts et visite) avec un **profil fictif** « Aziz Démo » (2 700 + 300 DT brut, célibataire, embauché en 2014, crédit auto fin avril 2029) ; écrit `captures/*.png` et `chiffres.json` (valeurs calculées par Orbite) ; la fiche de paie lue est celle des tests (`e2e/fixtures`), photo recadrée dans `captures/fiche-photo.png` ;
  - `scene.html` : reprend le moteur de `promo/video` (fond cosmique, verre, slam, logo, CTA, signature) + 10 nouvelles scènes et un drapeau tunisien qui flotte (40 bandes en vague) ; `render(t)` déterministe ;
  - `rendu.js h all 60 sortie.mp4` (4 onglets, ~4 min) ou `rendu.js h preview t…` ;
  - `musique.py` : 120 BPM, la mineur, cadence finale fa–sol–do ; intro avec impacts sur « Un salaire. » (0,25 s) et « Mille décisions. » (1,75 s), demi-temps au logo (4–8), drop 8–22, respiration 22–30, roulement + second drop 30–40, final 40–45 ; signaux d'interface calés sur les lignes et les pastilles.
  - Assemblage : `ffmpeg -i images.mp4 -i musique.wav -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 256k -shortest -movflags +faststart`.
- **Scènes** : accroche → logo + drapeau (« Conçue en Tunisie, pour la Tunisie. », « Kol chay wadhe7. ») → au millime (3 000 brut → 2 161,884 DT net, CNSS 290,400, IRPP 535,001, CSS 12,715) → fiche de paie lue sur l'appareil (« Rien n'est envoyé ») → contrôle (IRPP +19,999 DT) → crédit (avril 2029, 680 → 1 200 DT/mois) → pouvoir d'achat (−41,2 % depuis 2015, « il faudrait 5 105 DT brut ») → mur « Solide. Précise. Vérifiée. » (8 garanties exactes) → « Et ce n'est que le début. » (nouveautés en orbite) → CTA, adresse, « Powered by Mohamed Aziz Jaouadi ».
- Règle tenue : **aucune mention de prix, d'essai, d'offre ni de parrainage**. Chiffres tous issus des captures et calculs d'Orbite.

## 3 tersexagies. Drapeau tunisien animé et visite guidée en deux chapitres (12 oct., livré)

- **Demande** : un petit drapeau tunisien animé à côté du logo (accueil, connexion, puis Espace) ; visite guidée à mettre à jour avec toutes les nouveautés. Choix : drapeau qui **flotte doucement** ; visite en **deux chapitres**. Maquette validée : https://claude.ai/artifact/DkMd6TSJQBiCpzgR7TN4Sb.
- **Drapeau** (`public/orbite/signature.css`, chargée par toutes les pages) : `<span class="drapeau" aria-hidden="true">` avec 12 `<i>` ; chaque bande affiche le même dessin SVG (data:, proportions officielles 3:2, rouge #E70013) décalé, animé en vague (`drapeau-flotte`, 4 s, délais de −0,25 s par bande), immobile si mouvement réduit. 27 × 18 px (24 × 16 dans `.marque`). Décoratif : le lien garde son nom « Orbite, accueil ». Posé sur l'accueil, la connexion, l'Espace (menu de gauche et barre du haut sur téléphone), les 4 pages publiques (via `scripts/pages-publiques.js`, puis `node scripts/pages-publiques.js`), confidentialité et CGV. Aucune violation de CSP (image en data:, autorisée par img-src).
- **Visite guidée** (`public/espace/js/visite.js`, styles dans `app.css`) :
  - toujours un **écran de choix** d'abord : « L'essentiel » (8 étapes) ou « Les nouveautés » (10 étapes, badge « 10 nouvelles » puis « déjà vues ») ; le chapitre conseillé est encadré et reçoit le focus (nouveau venu → essentiel ; déjà venu → nouveautés tant que la version n'est pas vue) ; flèches haut/bas entre les chapitres ;
  - une étape peut **ouvrir sa page** (`vue`, ex. `#profil?section=salaire`, `#progression?onglet=retraite`, `#vie?onglet=scenarios`, `#compte?onglet=preferences`) : la bulle s'efface 420 ms le temps de l'affichage (`visite--transit`), puis le halo désigne la rubrique ; à la fin, retour à la page de départ ;
  - « Chapitres » (bouton Précédent de la 1re étape) revient au choix ;
  - comptes : `user_metadata.orbite_visite` (essentiel, à la première fermeture) et `orbite_visite_nouveautes = "2026-10-11"` (chapitre des nouveautés parcouru jusqu'au bout). **Nouvelle vague de nouveautés : ajouter les étapes et changer `VERSION_NOUVEAUTES`** pour que le badge revienne.
  - Nouveautés de la visite : fiche de paie, historique du salaire, Ma progression, objectifs, retraite, Mon année en orbite, Et si…, Vie & impôts, mode Expert, rappels.
- Nouveautés `2026-10-12a` ; SW `orbite-2026-10-12a`.
- **Tests** : unitaires 460 ; e2e 50/50 (étape « visite » réécrite : choix, essentiel au clavier, nouveautés qui ouvrent chaque page et désignent la carte de la fiche de paie, retour à Mon orbite, badge « déjà vues » ; téléphone : chapitre puis étapes).
- **En attente côté utilisateur** : son Chrome personnel est « géré » (réglage DNS sécurisé verrouillé) et le Wi-Fi n'atteint pas `txrwgqgnqdkipwtwpevl.supabase.co` (la 5G oui). Captures de `chrome://management` et `chrome://policy` demandées. Option validée sur le principe (« oui, avec maquette ») : relais gratuit Cloudflare vers Supabase par l'adresse d'Orbite ; il imposerait la connexion Google par jeton (Google Identity Services + `signInWithIdToken`), car l'adresse de retour Google de Supabase n'est pas modifiable sans domaine personnalisé payant.

## 3 duosexagies. Lot 7 « Lire ma fiche de paie » (11 oct., livré)

- **Demande** : passer au lot 7 (**lot 8 abandonné par l'utilisateur** : « pas important pour moi »). Choix de l'utilisateur :
  - lecture **sur l'appareil seulement** (gratuit, rien d'envoyé) ;
  - champs : brut et net, retenues (CNSS/CNRPS, IRPP, CSS), mois et date d'embauche, primes et avantages ;
  - **contrôle face au calcul d'Orbite**.
  - Maquette validée : https://claude.ai/artifact/WQCFfT84XcAst8zQFN4Xjo.
- **Outils auto-hébergés** (chargés au premier usage, jamais par un site tiers ; licences Apache 2.0 incluses) :
  - `public/commun/vendor/pdfjs-4.10.38/` : `pdf.min.mjs` + worker (version « legacy », chargée par `import()`) ;
  - `tesseract-7.0.0/` : `tesseract.min.js`, `worker.min.js` ; `core/` : les 3 variantes LSTM (SIMD relâché, SIMD, simple) du cœur **7.0.0** (intégrité vérifiée avec npm) ; `lang/fra.traineddata.gz` (4.0.0_best_int, 707 Ko).
  - **Dossiers versionnés** → `Cache-Control: immutable` un an dans `_headers`. **Changer de version = renommer le dossier** et mettre à jour `fiche-lecture.js`.
  - Le service worker ignore ces dossiers (plusieurs Mo). Tesseract garde les données françaises dans IndexedDB.
  - **CSP : pas besoin de `wasm-unsafe-eval`.** Le worker de Tesseract est servi par `/commun/vendor/` (chemin sans en-tête CSP) : son WebAssembly se compile dans le worker. Vérifié dans Chromium sous la vraie CSP de l'Espace.
  - **Piège** : tesseract.js 7 cherche `tesseract-core-relaxedsimd-lstm.wasm.js`, qui n'existe que dans le cœur 7 (404 sur Chrome avec le cœur 6).
- **Module de lecture `public/espace/js/fiche-lecture.js`** (`window.FicheLecture.lire(fichier, {progres})`) :
  - **PDF** : texte lu par pdf.js (3 pages au plus, `isEvalSupported: false`), lignes reconstruites d'après la position verticale, cellules séparées par un grand espace horizontal.
  - **PDF scanné** : la page est dessinée sur un canevas puis lue comme une photo.
  - **Photo** : orientation EXIF, redimensionnée entre 1 400 et 3 000 px, niveaux de gris avec un léger contraste ; Tesseract en `fra`, PSM 6, `workerBlobURL: false`, worker arrêté après usage.
  - **Une ligne de Tesseract = une ligne de la fiche** : il redresse lui-même une photo un peu de travers ; un regroupement par hauteur mélangerait les lignes.
  - Confiance par cellule. Erreurs en clair : PDF protégé par mot de passe, HEIC, plus de 15 Mo.
- **Module pur `public/espace/js/fiche-calcul.js`** (`window.FicheCalcul`, testé : `tests/espace/fiche.test.js`, 13 tests) :
  - `montant` (formats tunisiens) : un seul séparateur suivi de 1 à 3 chiffres = millimes ; le même séparateur répété = milliers ; « 18 261 » doit être bien groupé ; % écartés ; O lu pour 0 ; **≥ 100 000 sans millimes → ÷ 1000** (virgule perdue, « 3000000 »).
  - `analyser` :
    - mois (nom du mois, « Période du… » ou « 09/2026 ») ; brut, salaire de base, net, IRPP, CSS, imposable, date d'entrée ;
    - **cotisations = somme des lignes salariales** (CNSS, perte d'emploi, CNRPS, CNAM, capital décès), lignes patronales exclues ; montant retenu = base × plus petit taux, sinon le dernier ;
    - primes réparties dans les 4 catégories du profil (imposables, non cotisables, avantages en nature, non imposables) ; avances et prêts → « autres retenues » ;
    - **le brut fait foi** : ce qui manque entre la base et le brut devient « Autres éléments du brut » (marqué « calculé ») ;
    - **total qui tombe juste** : brut − retenues − avantages + non imposables = net, à 1 DT près. Si oui, les chiffres peu nets sont confirmés (« lu ») ; sinon « à vérifier » et une alerte ;
    - retenues présentes seulement dans « Total retenues » : récupérées.
  - `controle` : mois habituel (même brut, même caisse, situation de famille du profil, `nombreSalaires: 12`) ; lignes cotisations, IRPP, CSS et net (net corrigé des autres retenues) ; écart signalé au-delà de 1 DT ; verdict « cohérente » / « Un écart sur … » / « **incomplet** » (aucune retenue saisie : jamais « cohérente ») ; pistes (enfants ou chef de famille différents entre fiche et profil, employeur non informé, régularisation, taux de cotisation comparé).
  - `appliquer` : salaire de base + primes (sauf si décochées), caisse, date d'embauche ; **entrée d'historique au mois de la fiche** (même logique que `mettreAJourSalaire`) puis `appliquerHistorique` ; **même salaire de base déjà en vigueur ce mois-là → pas d'entrée en double**.
- **Interface** (`vue-fiche.js`, `fiche.css`, `<dialog id="dlg-fiche">`), 4 écrans comme la maquette :
  1. **Déposer** : glisser-déposer, « Choisir un fichier », « Prendre une photo » sur écran tactile seulement (`capture`) ; mention de confidentialité ; lien « Saisir les montants moi-même ».
  2. **Lecture** : la photo s'affiche avec une barre de balayage ; progression par étape. À la fin, les lignes lues apparaissent sur la feuille et **celles d'où viennent les valeurs sont surlignées**.
  3. **Vérifier** : groupe « À reprendre dans votre profil » (mois, brut, primes avec « Salaire de base : … », caisse, date d'embauche ; cases cochées par défaut) et groupe « Pour le contrôle · non enregistré » (cotisations, IRPP, CSS, net). Chaque valeur montre son texte d'origine et son état (lu / à vérifier / calculé / non lu / corrigé) et se corrige sur place.
  4. **Contrôle** : verdict, tableau Fiche/Orbite/Écart, pistes, hypothèses (« personne seule, sans enfant à charge (votre profil) »), lien « Une valeur mal lue ? Corriger les valeurs » ; boutons « Fermer sans rien changer » et « Mettre à jour mon profil » (désactivé si rien ne change : « Profil déjà à jour » ; message avec résumé et « Annuler »).
  - Entrées : carte « Votre fiche de paie sous la main ? » + « Remplir avec ma fiche de paie » en haut de Mon profil › Salaire (salariés seulement) ; bouton « Contrôler ma fiche de paie » dans l'en-tête du module Salaire (masqué en vue pension). Nouvelles icônes `fiche` et `photo`.
- **Fiches de test** (fictives) : `e2e/fixtures/fiche-paie.html`, d'où `e2e/fiche-fixture.js` tire `fiche-paie.pdf` et `fiche-paie.jpg` (photo tournée de 1,2°, floue). Des photos plus difficiles (4,5° + perspective) ont été essayées : bien lues après les corrections.
- `e2e/serveur.js` sert `.mjs` comme JavaScript. Nouveautés `2026-10-11e` ; SW `orbite-2026-10-11m`.
- **Pièges** : la classe globale `.ecart` d'`orbite.css` (pastille à `opacity: 0`) masquait les cellules d'écart → classes `fiche-ok` / `fiche-ecart`. Un `flex-wrap` sur tous les `.module__tete` renvoyait le titre sous la pastille sur téléphone → limité à `#vue-salaire`, texte en `flex: 1 1 260px`.
- **Tests** : unitaires 460 ; e2e **50/50**. Nouvelle étape : valeurs lues dans le PDF, écart d'IRPP de 19,999 DT, rien d'envoyé, « Corriger les valeurs », profil mis à jour puis annulé, photo depuis le module Salaire avec l'outil servi par Orbite, « Fermer sans rien changer », saisie manuelle jugée cohérente, téléphone sans débordement. Un passage a échoué une fois sur une transition de vue de « Mon orbite » (aléa de la machine : `main` puis la branche passent ensuite).

## 3 unsexagies. Lot 6 « Mon année en orbite » (11 oct., livré)

- **Choix de l'utilisateur** : histoire en cartes ; disponible toute l'année + rendez-vous du 15 décembre au 31 janvier ; image de partage **sans montants** ; données déjà dans Orbite (rien à saisir). Maquette validée : https://claude.ai/artifact/StuAv9XJad5Cn75izGTnQw.
- **Module pur `public/espace/js/annee-calcul.js`** (`window.Annee`, testé : `tests/espace/annee.test.js`, 8 tests) : `periode(m)` (année en cours jusqu'à aujourd'hui, salaire du mois compté à partir du 25 ; **en janvier, l'année précédente complète** ; `rendezVous` du 15 déc. au 31 janv.) ; `salaire` (mois par mois avec `salaireEnVigueur`/`salaireDe`, primes réparties par `calendrierPrimes`, hausses détectées) ; `pouvoirAchat` (hausse du brut vs `Progression.inflation`) ; `credits` (échéances payées de décembre précédent à la fin de période : capital = écart de `capitalPourMensualite`, intérêts = mensualités − capital, crédits soldés, marge libérée) ; `epargne` (contrats au prorata des mois, « J'ai épargné » de l'année, `serie`, impôt évité = `economieActuelle` au prorata, objectif mis en avant via `etatObjectif`) ; `avenir` (fin d'un crédit l'an prochain, capacité logement, impôt avant le 31 déc. ou l'année suivante, objectif à finir ; 3 au plus) ; `faits` (4 au plus, **jamais de montant ni de libellé saisi** : types génériques « Crédit voiture soldé ») ; `bilan` (cartes sans données absentes).
- **Interface** : `vue-annee.js` + `annee.css` : `<dialog id="dlg-annee">` plein écran (format téléphone centré sur ordinateur), 8 cartes au plus (intro, salaire, impôt, pouvoir d'achat, crédits, épargne, l'an prochain, synthèse), barres de progression, défilement auto 7 s (bouton pause, appui long, onglet masqué, mouvement réduit = pas d'auto), zones tactiles gauche/droite, flèches du clavier, Échap. Image 1080 × 1350 dessinée en canvas (polices d'Orbite), partage natif si `navigator.canShare({files})`, sinon téléchargement. Accès : bouton « Mon année AAAA (jusqu'ici) » dans l'en-tête de Ma progression, carte cosmos « Votre année AAAA est prête » sur Mon orbite pendant le rendez-vous (« Revoir » après une première vue, `localStorage orbite-annee-vue-AAAA`). Profil vierge : pas d'accès. Compteur anonyme `annee` / `annee-partage`.
- **Piège** : sur la dernière carte, la zone tactile (z-index) couvrait le bouton de partage → `.annee__cartes` sans z-index (le pied à z-index 5 passe au-dessus) et zones désactivées sans pointeur.
- **Bogue corrigé au passage** : `orbite-systeme.js` (panneau « Votre système » et scène de Mon orbite) traitait un crédit **terminé** (dates connues, 0 échéance) comme « durée restante à préciser » et ajoutait sa mensualité → endettement gonflé. Exclu désormais (`OC.creditTermine`), comme dans le moteur (#87). Test dans `orbite-systeme.test.js`. Concerne le profil de l'utilisateur (voiture soldée).
- Nouveautés `2026-10-11d` (4 points) ; SW `orbite-2026-10-11l`. Tests : unitaires 448 ; e2e : nouvelle étape (bouton, cartes = bilan, net = moteur, clavier, faits sans montant, image 1080 px).

## 3 sexagies. Acceptation obligatoire de la politique de confidentialité et des CGV (11 oct., livré)

- **Demande** : « l'acceptation de la politique de confidentialité doit être obligatoire pour se connecter ». **Constat** : case seulement à l'inscription par e-mail ; **Google passait sans case** ; acceptation jamais enregistrée ; comptes existants jamais consultés.
- **Choix de l'utilisateur** : **une fois puis mémorisée** (redemandée si la politique change) ; **confidentialité + CGV** ; **écran à la prochaine visite** pour les comptes existants. Maquette validée : https://claude.ai/artifact/1Jq9EvaARQhxPBNUmufDU6.
- **Base** (`0013_consentements.sql`, **appliquée en production le 11 oct.** en petits morceaux, `apply_migration` expirait) : table `consentements` (user_id, version AAAA-MM-JJ, documents, accepte_le), unique (user_id, version), RLS lecture/ajout de ses lignes seulement, droits `select, insert` (ni modification ni suppression : preuve ; cascade à la suppression du compte), déclencheur `consentements_controler` (date **posée par le serveur**, 50 lignes max), export `exporter_mes_donnees` complété. Vérifié par un essai annulé : date falsifiée remplacée, propriétaire voit 1, autre compte 0.
- **Code** : `public/commun/consentement.js` (`VERSION` = date de la politique, **à changer à chaque mise à jour de la politique** — un test vérifie qu'elle correspond à « Dernière mise à jour » de confidentialite.html ; `decider` ok/auto/ecran, `accordLocal` 24 h, `garantir`). Appelé par `session.js › exigerConnexion` (Espace et paiement-test) : déjà acceptée → rien ; case cochée à l'inscription (user_metadata `orbite_consentement` ou accord local après Google) → enregistrée sans écran ; sinon `<dialog id="dlg-consentement">` impossible à fermer (Échap bloqué), « Accepter et continuer » / « Se déconnecter » ; hors connexion → ouverture sans blocage, vérification au prochain chargement.
- **Connexion** : case « J'accepte la politique de confidentialité et les CGV » **au-dessus de Google et du formulaire** (onglet Créer un compte), Google et e-mail refusés sans elle (secousse + message). Onglet Se connecter : pas de case, l'écran prend le relais.
- **Paramètres › Vos données** : carte « Documents acceptés » (« Acceptées le … à … h … (version du …) »). Politique de confidentialité : nouvelle donnée décrite. SW `orbite-2026-10-11k`.
- Tests : unitaires 439 (`consentement.test.js` 7) ; e2e 48/48 (Google bloqué sans case, accord auto à l'inscription, écran pour un compte existant + Échap sans effet, accord sans écran pour un compte inscrit ailleurs, trace dans Paramètres).
- **À savoir** : à votre prochaine ouverture d'Orbite (et pour votre femme), l'écran s'affichera une fois.

## 3 novoquinquagies. Pages publiques par recherche (11 oct., livré)

- **Demande** : suite du référencement ; choix « lien portail-rh puis pages », les **4 pages**, contenu **mini-calcul + explications**. Maquette validée : https://claude.ai/artifact/V1iMpzRax1MMMC6NE9BPd1.
- **Pages** (adresses sans `.html`, servies par `html_handling: auto-trailing-slash`) : `/salaire-net-tunisie`, `/capacite-credit-tunisie`, `/impot-assurance-vie-cea`, `/retraite-cnss-cnrps`. Structure commune : en-tête (logo, signature, menu des 4 pages, « Essayer gratuitement »), fil d'Ariane, h1 = recherche visée, **mini-calcul sans compte** (moteurs d'Orbite sur l'appareil), **pont** cosmos (les 3 autres sujets calculés avec le même salaire), 3-4 étapes expliquées, 2 tableaux (ex. barème IRPP + bruts recherchés), FAQ (5 questions), liens vers les autres pages, pied (accueil, confidentialité, CGV).
- **Générées, jamais écrites à la main** : `node scripts/pages-publiques.js` écrit les 4 HTML depuis `public/commun/pages-calcul.js` (module pur : `salaire`, `credit`, `impot`, `retraite`, `pont`, `tableauNet`, `bareme`, `affichage`). `affichage(page, entrée, date)` produit les textes formatés utilisés **à la fois** par le générateur (HTML lu par Google, sans JS) et par `public/commun/pages-publiques.js` (navigateur, `[data-v]`, barres/jauges par CSSOM). `DATE_PAGES` (11 oct. 2026) fige les chiffres du HTML ; **après une loi de finances : avancer `DATE_PAGES`, relancer le générateur**. `--verifier` et le test `pages-publiques-html.test.js` échouent si une page n'est plus à jour.
- **SEO** : titre, description, canonique propres ; JSON-LD `WebPage` + `BreadcrumbList` + `FAQPage` (même texte que la FAQ visible) ; sitemap (7 URL, `confidentialite` et `cgv` désormais sans `.html`) ; liens depuis le pied de l'accueil ; test de référencement étendu à toutes les pages du sitemap (fichiers chargés autorisés par robots.txt).
- **Sécurité** : CSP stricte pour chaque page (`/slug` et `/slug.html`), aucun attribut `style` ni script en ligne (hors JSON-LD) ; **CSP ajoutée aussi à `/cgv`** (elle n'en avait pas). Rien n'est envoyé ni enregistré par les mini-calculs.
- **Exemples** : 2 500 DT brut célibataire privé (net 1 849,310 DT) ; pont retraite avec âge d'exemple 36 ans et 12 ans de carrière (relatifs à l'année en cours, affichés). Textes d'épargne : plafonds et pourcentages lus dans `moteurs/vie/baremes.js` (« à confirmer » côté moteur → phrase de réserve sur la page).
- Tests : unitaires 432 (dont `pages-publiques.test.js` 10, `pages-publiques-html.test.js` 6) ; e2e 48/48 (nouvelle étape : liens, mini-calculs = moteurs, états saturé / sans impôt / carrière courte / CNRPS 65 ans, téléphone sans débordement).
- **Fait par l'utilisateur (11 oct.)** : `sitemap.xml` renvoyé dans Search Console (7 pages) ; 4 pages envoyées à Bing (URL Submission, 20 h 10).
- **Reste à faire (12 oct.)** : Search Console → Inspection de l'URL → « Tester l'URL active » puis « Demander une indexation » pour l'accueil et les 4 pages (quota quotidien : en faire autant que possible, le reste le lendemain).

## 3 octoquinquagies. Référencement : base technique (11 oct.)

- **Question** : comment apparaître dans les premiers résultats ? Constat : pas de `sitemap.xml`, une seule page indexable (accueil), pas de données structurées, peu de liens entrants ; « Orbite » est un mot courant → viser les recherches précises (« calcul salaire net Tunisie 2026 », « capacité crédit Tunisie », « assurance vie impôt Tunisie », « retraite CNSS/CNRPS »). Seulement des solutions **gratuites**.
- **Choix** : base technique d'abord + guide Google Search Console (pages publiques par recherche, FAQ et lien depuis portail-rh proposés pour plus tard).
- **Fait** : `public/sitemap.xml` (accueil, confidentialité, CGV) ; `robots.txt` (Sitemap, `/rappels` exclu) ; `index.html` : titre « Calcul salaire net Tunisie 2026, crédit et impôt — Orbite », description avec mots-clés et « Essai gratuit de 3 jours », surtitre visible « Salaire, crédit, impôt et retraite en Tunisie · barèmes 2026 », JSON-LD (`WebApplication` FinanceApplication avec `AggregateOffer` 9,900 à 79,900 TND = table `formules`, `Person` auteur avec LinkedIn, `WebSite`) — bloc de données non exécuté, aucune violation CSP (e2e 47/47).
- **Search Console** : propriété « Préfixe de l'URL » créée par l'utilisateur ; balise `google-site-verification` (valeur publique, `content="K71Vq0bd…"`) ajoutée au `<head>` de `index.html` — **ne pas la retirer**, sinon Google perd la vérification.
- **Fait par l'utilisateur (11 oct.)** : Search Console **validée** (piège : le premier « Valider » cliqué était celui de la méthode « Fichier HTML », dépliée par défaut → échec ; il faut déplier « Balise HTML » et cliquer son propre bouton) ; `sitemap.xml` envoyé (« Impossible de récupérer » au début = normal) ; « Demander une indexation » refusé (**quota dépassé**, fréquent sur une propriété neuve → réessayer le lendemain) ; **Bing Webmaster Tools** : import depuis Search Console (site + sitemap, sans balise), accueil envoyé via « URL Submission » (quota 100/jour).
- **robots.txt corrigé (11 oct.)** : `Disallow: /espace/` bloquait les 4 moteurs chargés par l'accueil (`/espace/js/orbite-calcul.js`, `orbite-intelligence.js`, `progression-calcul.js`, `retraite-calcul.js`) → Google rendait la page sans calculs (erreurs JS). Ajout de 4 `Allow` précis (le reste de l'Espace reste interdit ; la règle la plus longue gagne). Test `tests/espace/referencement.test.js` : toute ressource chargée par l'accueil doit être autorisée (si l'accueil charge un nouveau script de `/espace/js/`, **ajouter son `Allow`**), pages du sitemap autorisées, Espace/connexion/rappels interdits, balise Search Console présente. Commentaire de robots.txt sans accent (fichier servi sans charset : « chargÃ©s » à l'écran) + test ASCII. Unitaires 415.
- **Lien depuis portail-rh (11 oct., MOHAMED-JA/portail-rh#13)** : la bande du calculateur de salaire portait l'ancien nom « Espace Finances TN » et renvoyait vers `connexion.html?mode=inscription` (exclue des moteurs → aucun effet). Maquette validée « bande + carte + pied » : bande « Orbite : salaire, crédit, impôt et retraite en Tunisie, au même endroit. » → accueil ; carte « Ce net, et ensuite ? » sous le résultat (prêt, impôt, retraite, « 3 jours d'essai gratuit », petite orbite animée) ; Orbite en tête des « Applications du même auteur ». Toujours lier l'**accueil**, jamais la connexion. SW `calc-salaire-v14`.
- **Avertissement (décision reportée par l'utilisateur)** : rendre privés simulateur-credit, simulateur-assurance-vie et simulateur-Assurance-Automobile **couperait leur GitHub Pages** (compte gratuit) → sites et liens du pied de page morts. Solution gratuite : les publier sur Cloudflare Workers depuis un dépôt privé (comme Orbite), puis mettre à jour les liens. Ne pas les rendre privés avant.
- **Reste à faire** : redemander l'indexation de l'accueil dans Search Console (12 oct.) ; dans 3 à 7 jours, vérifier Sitemaps (« Opération effectuée ») et Performances ; partager le lien (LinkedIn, groupes Facebook RH/finances, profil GitHub).

## 3 septquinquagies. Lot 5 : accueil « scroll-cinéma » (11 oct., livré)

- **Constat** : sous le héros, des blocs statiques ; 3 modules seulement (rien sur Ma progression, Retraite, « Et si… », rappels, Assistant) ; « Plus de 240 tests » périmé ; **« Gratuit, sans publicité » / « Créer mon orbite gratuite » faux** (formules payantes après 3 jours d'essai).
- **Choix de l'utilisateur** : cas types **Yasmine, Karim, Habib** ; prix **« Essai gratuit de 3 jours »** (boutons « Essayer gratuitement », « 3 jours d'essai gratuit, sans carte bancaire, puis la formule de votre choix. Sans publicité. ») ; **scène fixée, chapitres au défilement**. Maquette validée : https://claude.ai/artifact/D8oyrLfW9dAi9psXwfMjn9.
- **Module pur `public/commun/recit-calcul.js`** (`window.RecitCalcul`, testé : `tests/espace/recit.test.js`, 5 tests) : `profils(m)` (définis **par rapport à la date du jour** : âges, ancienneté, crédits — les exemples ne vieillissent pas), `voyage(m)` (2 500 DT brut marié 2 enfants : cotisations, impôt, net = aperçu, capacité, optimiseur fiscal, projection 10 ans à 5 %, retraite à 60 ans), `vies(m)` (Yasmine : loyer, reste, précaution, impôt ; Karim : endettement 47 % > 40 %, fin du crédit auto et marge retrouvée ; Habib : CNRPS 62 ans, 65 ans). Tout vient des moteurs (OrbiteCalcul, OrbiteIntelligence, Retraite, Progression), chargés sur l'accueil.
- **Page** (`index.html`) : héros conservé (aperçu vivant), section `#voyage` (scène `.scene` sticky + 4 `.chapitre`), « Trois vies, trois orbites » (cartes « Exemple »), « Tout ce qui tourne autour de votre salaire » (8 cartes, Nouveau sur Ma progression et Retraite), « Vos chiffres restent les vôtres » (400+ tests, 1 compte, 0 montant, 1 clic), appel honnête. Chiffres par défaut dans le HTML, remplacés au chargement (`data-r`).
- **`accueil-recit.js`** : remplissage `data-r`, apparitions (classe ajoutée par le script : sans JS tout reste visible), scène canvas (planète de particules, anneaux cotisations / impôt qui se détachent, satellites Crédit et Assurance vie, orbite Retraite en pointillés), chiffre central et barre pilotés par le défilement ; chapitre 4 en deux temps (10 ans de projection, puis « Cap sur la retraite · année / N ans », puis pension) ; animation seulement quand la scène est visible ; mouvement réduit = redessin au défilement. `--entete-h` mesuré (en-tête collant plus haut depuis la signature) pour placer la scène dessous.
- **Pièges** : `.cosmos` impose `overflow: hidden` → casse `position: sticky` (ne pas l'utiliser sur une section qui contient une scène fixée) ; listes en `display: grid` : envelopper le texte et les `<b>` dans un `<span>`. Téléphone : scène 40vh, chapitres 112vh alignés en bas, signature de l'en-tête sans logo LinkedIn et nom sur deux lignes.
- Tests : unitaires 411 ; e2e 47/47 (nouvelle étape : chiffres = moteurs, prix honnêtes, chapitres au défilement, téléphone sans débordement). SW `orbite-2026-10-11j`.

## 3 sexquinquagies. Crédit terminé exclu des charges (11 oct.)

- **Bogue trouvé en préparant le lot 5** : un crédit dont la dernière échéance est passée comptait encore dans `chargesCredits` (donc capacité, endettement, budget, marge d'épargne) — ex. voiture soldée fin 2023 : 350 DT retirés à tort. `creditTermine(c)` (dates connues et `moisRestants === 0` après `appliquerEcheanciers` à la date du jour) l'exclut ; sans dates, le crédit compte toujours (on ne peut pas savoir). Mon orbite l'affichait déjà « Remboursé ». Test dans `orbite-calcul.test.js`. Unitaires 406 ; e2e 46/46. SW `orbite-2026-10-11i`.

## 3 quinquinquagies. Signature « Conçu par » en carte de visite (11 oct.)

- **Demande** : signature LinkedIn plus professionnelle et moderne. Maquette (3 propositions) : https://claude.ai/artifact/NTHSMzHwgd3tvwrBdoLisX. **Choix** : **A · Carte de visite** et libellé **« Conçu par »** (au lieu de « Powered by », qui se dit d'une technologie).
- Balisage (6 occurrences : accueil, connexion, CGV, confidentialité, rail et barre mobile de l'Espace) : `<a class="signature …" target="_blank" rel="noopener noreferrer" aria-label="Conçu par Mohamed Aziz Jaouadi : profil LinkedIn (nouvel onglet)">` + `.signature__mono` (« MJ », dégradé des trois modules) + `.signature__txt` (`.signature__pre` « Conçu par », `.signature__nom`) + `.signature__in` (logo LinkedIn officiel en SVG). `signature.css` réécrit : carte à filet, survol = fond plus marqué, bord bleu LinkedIn, logo qui glisse ; plus d'animation d'entrée (elle laissait la signature invisible sur certaines captures) ; rail resserré pour garder le nom sur une ligne (mesuré : 145 px). SW `orbite-2026-10-11h`. e2e 46/46.

## 3 quaterquinquagies. Thème « Soleil » : état en direct (11 oct.)

- **Question** : différence entre « Soleil » et « Sombre » ? Réponse : « Soleil » = clair du lever au coucher du soleil à Tunis, sombre ensuite ; après le coucher les deux sont identiques (mêmes couleurs). **Choix de l'utilisateur** : afficher l'état. `#theme-etat` (Paramètres › Préférences, sous « Apparence », seulement si « Soleil ») : « En ce moment : clair. Passage au sombre ce soir à 17 h 50. » / « En ce moment : sombre, le soleil est couché à Tunis. Retour au clair demain à 6 h 23. » (icône soleil / lune, bandeau ambre le jour), recalculé chaque minute (`etatSoleil()` dans `app.js`, `EFTheme.soleil` + `nuitATunis`). e2e 46/46. SW `orbite-2026-10-11g`.

## 3 terquinquagies. Crédit : montant à la capacité selon le type ; cartes « Vos données » (11 oct.)

- **Demande** : (1) en passant d'Immobilier à Auto, le module gardait 31 000 DT et passait à 5 ans → échéance 578 DT, très au-dessus de la capacité (198 DT) ; l'utilisateur voulait le montant possible pour chaque type à échéance égale. (2) « Partager ma fiche » peu professionnel (texte serré, interrupteur flottant, heure « 05:28 PM »).
- **Analyse validée** : la limite commune est l'**échéance maximale** (endettement global) ; le montant dépend de la durée et du taux du type. Choix : **montant = capacité** au changement de type si le montant n'a pas été tapé ; montant tapé gardé, avec alerte et bouton ; liste des capacités par type. Partage : **carte en-tête + état** (aperçus validés dans la question).
- **`module-credit.js`** : `sc.capitalSaisi` (montant ou apport tapés) ; changement de type sans saisie → `S.cible = { capacite: true }` : `suivreCible` prend `capaciteBanque({mois, taux}).capital` (suit aussi durée et taux) ; texte « Montant calculé pour votre échéance maximale… » ; alerte `#cr-capacite-alerte` (échéance au-dessus de la capacité de X DT, bouton `[data-ramener]` « Ramener à ma capacité : … ») ; liste `#cr-capacites` « Ce que vous pouvez emprunter avec N DT par mois » (immo, auto, conso : durée et taux habituels, taux du profil s'il existe ; clic = choisir ce type à la capacité). Styles dans `credit.css`.
- **Paramètres › Vos données** : cartes `.reglage--carte` (icône, titre, interrupteur sur la même ligne ; texte pleine largeur ; boutons dessous) ; état du partage dans un bandeau (`#partage-etat`, vert si actif, icône valide / cadenas) : « Partage activé depuis le … » + « Consultée N fois · dernière consultation le 11 octobre à 17 h 28 ». Heures : `dateHeure()` en « 17 h 28 » (fr-TN affichait « PM »), aussi pour la dernière connexion.
- Tests : unitaires 405 ; e2e 46/46 (nouvelle étape crédit + partage). SW `orbite-2026-10-11f`.

## 3 duoquinquagies. Lot 4 : retraite CNSS / CNRPS (11 oct., livré)

- **Choix de l'utilisateur** : CNSS **et** CNRPS ; afficher âge et pension estimée, curseur partir plus tôt / plus tard, écart à combler (pas le relevé de carrière) ; **3e onglet « Retraite » de Ma progression** ; nouveau champ de profil **« début de carrière »** (mois + année du premier emploi déclaré, par défaut la date d'embauche, + années sans cotisation) ; écart calculé pour garder **80 % du net actuel**.
- **Règles validées par l'utilisateur** (sites officiels cnss.tn, CNRPS, JORT bloqués depuis l'environnement : sources secondaires recoupées, réserves affichées) :
  - CNSS : âge légal **60 ans** (62 ans annoncé en 2023-2024, pas en vigueur d'après Business News nov. 2025) ; 120 mois minimum ; taux **40 %** pour 40 trimestres **+0,5 %/trimestre**, **80 % max** ; salaire de référence = moyenne des **10 dernières années**, actualisée, **plafond 6 SMIG** (3 328,416 DT) ; anticipée dès **55 ans avec 360 mois**, **−2 %/année** avant 60 ans, **définitive** ; minimum 2/3 SMIG ; complémentaire non couverte. Sources : CLEISS, décret 74-499, secu.tn, OpenFisca (PR #460), Business News (Laamouri, 11/11/2025), SSA.
  - CNRPS : **62 ans** (loi n° 2019-37), 57 ans tâches pénibles ; prolongation jusqu'à **65 ans** (+2 %/an, art. 71 ter) ; 15 ans minimum ; taux **2 %/an** (10 premières années) **3 %** (10 suivantes) **2 %** ensuite, **90 % max** ; salaire de référence = **dernière rémunération** (≥ 3 ans) ; départ 57 ans / 15 ans = mesure exceptionnelle non simulée. Sources : loi 2019-37 (legislation-securite.tn), CRES lettre n° 3, secu.tn, Business News.
  - Net : CNAM 4 % + abattement 25 → 50 % (2029), moteur `pension.js` existant.
  - Hypothèses (affichées) : calcul en **dinars d'aujourd'hui** (tient lieu d'actualisation), salaire constant par défaut ; réduction anticipée en **points de taux** ; **20 ans** de retraite ; rendement réel de l'épargne **2 %/an**.
- **Maquette** : https://claude.ai/artifact/W9p6vJBteLFK8qGnSKu9cm (exemple fictif Leïla, née mars 1984, brut 5 500 DT, carrière depuis sept. 2008 : CNSS à 60 ans → 142 trimestres, 80 %, réf. 3 328 DT, brute 2 663, nette 2 389 DT = 66 % du net 3 623 ; écart 509 DT/mois, capital ≈ 100 700 DT, 403 DT/mois jusqu'en 2044 ; CNRPS à 62 ans → 85 %, nette 4 051 DT, pas d'écart). Données générées par le moteur (`scratchpad/lot4`).
- **Maquette validée** ; objectif automatique = **capital nécessaire** (projet « Retraite », échéance = fin du mois de départ ; s'il existe, il est mis à jour, jamais dupliqué).
- **Module pur `public/espace/js/retraite-calcul.js`** (`window.Retraite`, testé : `tests/espace/retraite.test.js`, 9 tests) : `REGLES` (+ sources), `caisseDe(p)` (secteur public → CNRPS), `bornes(p, m)` (jamais un âge passé), `tauxCnss`, `tauxCnrps`, `capitalRente`, `estimer(p, sy, {age, maintenant, hausseReelle, cible})` (états `ok` / `retraite` / `naissance` / `carriere` / `depasse` / `insuffisant` / `anticipe-ferme` ; référence = **brut annuel ÷ 12, primes comprises**, en dinars d'aujourd'hui ; minimum 2/3 SMIG ; net par `CalculPension` avec chef de famille, sans enfants ; `tauxMaxLe` = 30 ans CNSS / 40 ans CNRPS), `courbe`. Reproduit la maquette au dinar près.
- **Profil** : `debutCarriere` (date, vide = date d'embauche) et `anneesSansCotisation` (0-40), dans « Votre salaire » (salariés).
- **Vue** : 3e onglet `#progression?onglet=retraite` (pastille à 3 positions) : info caisse / début de carrière, pension nette (grand chiffre), pastille % du net, refus expliqué, curseur d'âge avec repères, barre pension / écart / objectif 80 %, frise SVG en DOM (aujourd'hui, taux maximum atteint, départ ; repère 360 px sur écran étroit), alerte plafond 6 SMIG, écart + capital + effort mensuel, bouton objectif, calcul détaillé, réserves, sources. États vides : retraité → « Ma pension » ; naissance ou carrière manquante → lien vers le profil.
- Tests : unitaires 405 ; e2e 45/45 (nouvelle étape retraite ; pièges : cliquer « Annuler » dans le **bon** toast, `:has-text(...)`, plusieurs toasts peuvent être ouverts). Nouveautés « 2026-10-11c », SW `orbite-2026-10-11e`.

## 3 unquinquagies. Bouton « Guide » à la place du « ? » (11 oct.)

- **Demande** : le point d'interrogation de la barre du haut (visite guidée, `#aide-visite`) ne plaisait pas ; choix laissé à Claude. **Choix** : icône **boussole** (nouveau symbole `boussole` dans `orbite/icones.svg`) + mot « Guide » sur ordinateur, icône seule sous 640 px ; la boussole pivote de −35° au survol / focus (ressort, coupé si mouvement réduit). `aria-label` « Guide : revoir la visite guidée ». SW `orbite-2026-10-11d`. Tests : unitaires 396, e2e 44/44.

## 3 quinquagies. Lot 3 : « Ma progression » (carrière + objectifs) (11 oct., livré)

- **Choix de l'utilisateur** : inflation INS **validée** (moyennes annuelles : 2015 4,4 · 2016 3,6 · 2017 5,3 · 2018 7,3 · 2019 6,7 · 2020 5,6 · 2021 5,7 · 2022 8,3 · 2023 9,3 · 2024 7,0 · 2025 5,3 · 2026 5,6 provisoire = glissement de septembre 2026, à remplacer par la moyenne annuelle en janvier 2027 ; sources : INS 2019 et 2022-2025, BCT 2021, Banque mondiale d'après l'INS 2015-2018 et 2020) ; nouvelle rubrique **« Ma progression »** (menu + « Moi » sur téléphone), onglets **Carrière** et **Objectifs** ; suivi **automatique + saisie** (« J'ai épargné ») ; **défis mensuels + badges sobres** ; « J'ai épargné » **ajoute aussi le montant à l'épargne disponible du profil** (annulable) ; projection : hausse par défaut = **moyenne passée** (3 % si historique insuffisant).
- **Méthode** : pouvoir d'achat calculé sur le **brut** (indépendant des changements d'impôt) ; net affiché au barème actuel. Maquette validée : https://claude.ai/artifact/N7rmgQ2Z4ptg7HNLTkxB5e.
- **Module pur `public/espace/js/progression-calcul.js`** (`window.Progression`, testé : `tests/espace/progression.test.js`, 15 tests) : `INFLATION`, `PROVISOIRE`, `SOURCES`, `inflation(an)` (année future = dernière connue), `indice(de, a)` ; `carriere(p, m)` : étapes datées depuis `historiqueSalaire` (entrée sans date = date d'embauche ; futures ignorées ; même mois = la dernière), brut via `salaireDe` (net converti), hausses comparées aux prix de la période (`gagne` / `perdu` / `egal`), bilan (`hausse`, `prix`, `pouvoirAchat`, `brutPourGarder`, `manque`), `moyenneHausse` (taux annuel moyen, ≥ 12 mois), série annuelle ; `projection(p, sy, {hausse, inflation, ans})` : brut, net au barème actuel, pouvoir d'achat, capacité immobilière (`capacite`, crédits en cours retirés quand ils se terminent) ; objectifs `projet` / `precaution` / `credit` / `impot` : `etatObjectif` (rythme = moyenne des 3 derniers mois, ou depuis le 1er versement s'il est plus récent ; états `retard` / `avance` / `ok` / `a-lancer` / `atteint` / `auto` ; crédit suivi automatiquement par `capitalPourMensualite`, remboursement anticipé nécessaire pour solder à la date voulue ; impôt = versements de l'année seulement), `ciblePrecaution`, `serie`, `defis` (3 au plus : premier objectif, épargne du mois, assurance vie d'octobre à décembre, précaution, salaire à vérifier), `badges` (5), `rappels` (un mois avant l'échéance, type `perso`, email **sans montant ni libellé saisi**).
- **Base (migration `0012_objectifs.sql`, appliquée le 11 oct.)** : tables `objectifs` (type, libellé ≤ 60, cible, départ, échéance, index de crédit) et `objectifs_versements` (montant > 0, date), RLS sur ses propres lignes, limites 12 objectifs / 600 versements (déclencheurs, et un versement ne vise qu'un objectif de son auteur), versements non modifiables, droits `anon` retirés (cette fois les `revoke` sont passés via `execute_sql`) ; `exporter_mes_donnees` étendue ; suppression du compte = cascade. Essai RLS en rôle `authenticated` dans une transaction annulée : OK.
- **Interface** : route `#progression` (`app.js`), menu « Ma progression » (icône hausse) + bouton dans Mon profil (téléphone) + « Moi » actif ; `vue-progression.js` + `progression.css` ; onglets à pastille glissante ; Carrière : tuiles brut / prix / pouvoir d'achat, phrase « argument pour l'entretien », courbe SVG construite en DOM (escalier du brut, valeur en dinars de départ en pointillés, projection, marqueurs des hausses, bulle au survol, tracé animé via CSSOM `--long`, repère 380×260 sur écran étroit, redessinée au redimensionnement), tableau d'inflation + sources, curseurs hausse (défaut = moyenne passée) / inflation, étapes, « Ajouter une hausse passée » (= dialogue salaire). Objectifs : cartes (jauge, état, phrase de conseil, « J'ai épargné » / « J'ai versé » avec annulation, modification et suppression annulable), carte « Nouvel objectif » à 4 types, dialogue `#dlg-objectif` (cible suggérée : 6 mois de dépenses, ou complément de l'optimiseur fiscal ; échéance = dernier jour du mois ; aperçu en direct), défis du mois avec bouton « Faire », série des 6 derniers mois, badges ; confettis quand un défi est réussi (sauf mouvement réduit). « J'ai épargné » ajoute le montant à `epargneDisponible` (pas pour l'impôt). API `E.objectifs` (`session.js`) : `lister`, `creer`, `modifier`, `supprimer`, `verser`, `annulerVersement`. Rappels : `appli.js` ajoute `Progression.rappels(OrbiteProgression.objectifs())` et resynchronise sur `orbite:objectifs`.
- **Pièges** : la classe globale `.vide` (app.css) existe déjà ; deux fonctions `planifier` dans `appli.js` = la seconde écrase la première (les nouveautés ne s'affichaient plus) ; une carte en `display: grid` sans `grid-template-columns: minmax(0, 1fr)` déborde sur la voisine.
- Tests : unitaires 396 ; e2e 44/44 (nouvelle étape : bilan +41,7 / +57,2 / −9,9 %, 3 773 DT, courbe, projection, création, versement + annulation, précaution suggérée, rappel sans montant, modification, suppression annulée, téléphone sans débordement, captures clair / sombre). Confidentialité mise à jour (objectifs). Nouveautés « 2026-10-11b », SW `orbite-2026-10-11c`.

## 3 novoquadragies. Connexion vivante (11 oct.)

- **Demande** : page de connexion plus moderne, animée et futuriste. Constat : moitié gauche presque vide (petite orbite figée), rien ne bougeait (contrairement à l'accueil), formulaire neutre. **Choix** : direction A « Planète vivante », intensité « spectaculaire mais sobre », courte transition à la connexion ; satellites **Crédit, Épargne, Impôt** (le salaire est la planète, fidèle au slogan). Maquette validée : https://claude.ai/artifact/BLKVLfoBffwF5gKXMw9jA4.
- **`public/commun/connexion-scene.js`** (`window.OrbiteConnexion.decoller(prenom)` → Promise ~0,85 s) : ciel étoilé plein écran (`#ciel`, scintillement, relief selon la souris), planète salaire en particules (900 sur téléphone, 1 500 sinon), 3 satellites sur orbites inclinées avec traînées et étiquettes `[data-sat]` (estompées derrière la planète), rotation au doigt / souris ; pause onglet caché ou hors écran ; mouvement réduit = image fixe ; couleurs lues dans `--c-net`, `--c-credit`, `--c-epargne`, `--c-impot`, `--c-etoile` (clair / sombre, suivi de `ef:theme` et de `data-theme`).
- **`connexion.css`** réécrit : deux aurores lentes, carte en verre dépoli avec liseré lumineux tournant (`@property --angle-carte`), onglets en verre, champs à lueur verte au focus, bouton avec reflet et halo, messages avec icône (✓ / !), carte qui tremble en cas d'erreur (`.secoue`), titre « en orbite. » à reflet coloré. Téléphone : planète 220 px au-dessus du formulaire, slogan court, points et note cachés. Le panneau gauche n'est plus `bande-sombre` : il suit le thème.
- **`connexion.js`** : `entrer(user)` = transition puis `location.replace(suite)` après connexion par mot de passe, inscription avec session, retour de Google / lien de confirmation (`?code=`, `access_token`, `?confirme=`) ; session déjà ouverte = ouverture directe. « À bientôt ! Vous êtes bien déconnecté. »
- Tests : unitaires 381 ; e2e 43/43 (+ planète, 3 satellites, pas de débordement à 390 px sur la connexion ; aucune violation CSP). SW `orbite-2026-10-11b`. Contrôles visuels : ordinateur sombre / clair, téléphone, erreur, transition « Bienvenue, Sami ✦ ». Piège de test : un faux Turnstile doit rappeler le callback à `reset()` pour un second essai.

## 3 octoquadragies. Témoin d'enregistrement et notifications claires (11 oct.)

- **Demande** : après « Actualiser » (administration) ou une modification n'importe où, l'utilisateur ne savait pas si c'était enregistré ou actualisé. Constat : le texte « Profil enregistré » était petit, gris, disparaissait après 2,4 s et était **caché sur téléphone** (`display: none` sous 640 px) ; « Actualiser » ne montrait rien.
- **Choix de l'utilisateur** : pastille toujours visible + notification seulement pour les actions déclenchées (pas à chaque frappe) ; « Actualiser » = heure + nouveautés ; pas de vibration. Maquette validée : https://claude.ai/artifact/DR5Dd1y8aRaUAdrK4KwHyh.
- **Pastille** (`#etat-enregistrement.temoin`, `temoin(etat)` dans `app.js`) : `modif` → `envoi` (anneau) → `ok` (coche tracée, 3 s) → `ancien` (« Enregistré à l'instant / il y a N min / à HH:MM », rafraîchi toutes les 30 s) ; `horsligne` (ambre, gardé sur l'appareil) ; `erreur` (rouge, bouton « Réessayer », + notification persistante « Non enregistré » avec « Réessayer »). Annonce lecteur d'écran séparée (`#etat-enregistrement-annonce.cache`, hors de la barre) pour ok / hors ligne / erreur seulement. **Téléphone** : icône ronde au repos ; texte court (« Enregistré », « Erreur »…) pendant les états transitoires, à la place du titre (`:has()`) ; dans les modules (barre déjà pleine : boutons Reprendre / Enregistrer), icône seulement et cachée au repos. Aucun débordement à 390 px (vérifié en e2e).
- **Notifications** (`E.toast(texte, { type: "ok" | "info" | "erreur", detail, action, duree })`, `session.js`) : icône ronde (vert fait, bleu information, rouge problème), titre + détail, action facultative, barre du temps restant (pause au survol / focus / onglet caché), erreurs persistantes, 3 à l'écran au plus. Styles dans **`orbite.css`** (Espace) **et** `meridien.css` (pages publiques). Rétrocompatible : `{ erreur: true }` et `{ action }` inchangés.
- **Administration** : `charger(true)` au clic : bouton « Actualisation… » qui tourne, « Mis à jour à HH:MM » surligné, écarts depuis la dernière actualisation (inscriptions, abonnés, paiements, demandes de contact) → tuiles entourées de vert avec « +N » et notification « Données actualisées à HH:MM · 2 nouvelles inscriptions… » (ou « Aucune nouveauté », en bleu).
- **Piège** : l'Espace charge `orbite.css`, pas `meridien.css` : `--ease-out` et `.visuellement-cache` n'y existent pas (utiliser `--sortie` et `.cache`). Une variable inconnue dans le raccourci `animation` l'annule entièrement (la coche ne se traçait pas).
- Tests : unitaires 381 ; e2e 43/43 (témoin sur ordinateur et téléphone, annonce, Actualiser avec et sans nouveauté). Nouveautés « 2026-10-11a », SW `orbite-2026-10-11a`.

## 3 septquadragies. Rappels par email (Brevo) (10 oct.)

- **Compte Brevo** : vérification du téléphone réussie **par appel** (le SMS n'arrivait pas sur le numéro tunisien). Expéditeur « Orbite » déjà ajouté (Brevo refuse un doublon : il faut seulement cliquer le lien de validation reçu sur l'adresse d'expéditeur). Reste à faire **par l'utilisateur** : clé API « orbite-rappels », blocage « IP autorisées » désactivé, puis deux secrets Supabase (Edge Functions › Secrets) : `BREVO_API_KEY` et `ORBITE_EXPEDITEUR` (adresse d'expéditeur validée). Tant qu'ils manquent, la fonction répond 503 « pas encore configuré » et rien ne part.
- **Choix de l'utilisateur** : envoi à **12 h 30** (heure de Tunis) ; ton **chaleureux et clair** (« Bonjour Prénom », une carte par rappel, un conseil concret, bouton vers Orbite) ; **sans aucun montant** (sécurité élevée : les chiffres restent derrière la connexion) ; adresse = connexion, ou adresse de contact **confirmée par un clic**. Maquette validée : artifact privé https://claude.ai/artifact/6zezFSTQpJJek89m4EcLyt.
- **Architecture (aucun calcul financier sur le serveur)** : l'appli calcule les rappels (`RappelsCalcul`, mêmes modules) ; chaque rappel porte `type` et `mail` (`etiquette`, `titre`, `corps`, `conseil`, `bouton`, textes sans montant ; conseil mainlevée seulement pour un crédit immobilier). `R.planEmail(liste)` → plan daté enregistré par `rappels_plan_enregistrer` (seulement s'il a changé, signature au jour près ; `appli.js`). Case cochée par l'utilisateur → `rappels_reactiver` (lève une désinscription faite par email) ; décochée → plan vidé. Texte d'aide `#p-rappels-email-aide` : actif / adresse à confirmer. Adresse de contact différente → `E.rappelsEmail.confirmer()` (fonction, action `confirmation`).
- **Base (migration `0011_rappels_email.sql`)** : tables `rappels_email` (plan, jeton de désinscription, adresse confirmée, confirmation en attente, compteurs) et `rappels_envoyes` (jamais deux fois le même rappel), RLS : lecture de sa ligne seulement. Fonctions utilisateur (`rappels_plan_enregistrer` ≤ 40 rappels / 32 Ko, `rappels_mon_etat`, `rappels_reactiver`), liens d'email sans connexion par jeton (`rappels_desinscrire` décoche aussi `orbite.rappelsEmail`, `rappels_reabonner`, `rappels_confirmer_adresse` 7 jours), serveur seulement (`rappels_destinataires`, `rappels_demander_confirmation` : 1 par heure, 5 en 7 jours par adresse ; `rappels_noter_envoi`, `rappels_verifier_cron`) protégées par `rappels_exiger_serveur()` (rôle `service_role` exigé). Coffre : secret `rappels_cron` tiré au hasard (jamais affiché). pg_cron `orbite-rappels-email` `30 11 * * *` (UTC) → pg_net POST vers la fonction avec l'en-tête `x-orbite-cron`.
- **Appliquée en direct par morceaux (10 oct.)** : `apply_migration` et `execute_sql` expirent (60 s) dès qu'une instruction est jugée destructrice (`revoke`, `drop policy`, `delete`), la confirmation n'arrivant pas. Donc : extensions (migration `0011a`), tables, politiques, fonctions, coffre, planification appliqués ; **non appliqués** : les `revoke` (les fonctions serveur restent exécutables par `anon`/`authenticated` au sens des droits, mais refusent l'appel grâce à la garde : vérifié en SQL en se plaçant comme anon puis connecté) et la purge des envois de plus de 400 jours (retirée du fichier). Script des `revoke` à coller par l'utilisateur dans le SQL Editor (facultatif, défense en profondeur). pg_net s'est installé dans `public` (avertissement du conseiller ; le déplacer demande de le supprimer puis le recréer).
- **Fonction `rappels-email`** (verify_jwt désactivé, authentification propre : jeton du coffre ou jeton utilisateur) : `gabarit.js` pur et testé (`nettoyerPlan` : identifiants, types, dates, liens internes seulement, textes bornés ; `aEnvoyer` : échus, non expirés, jamais envoyés, essai/abonnement cohérents avec l'état réel, 6 par email ; `email` / `confirmation` HTML en tableaux et styles en ligne, tout échappé, + texte brut ; `adresses`). En-têtes `List-Unsubscribe` + `List-Unsubscribe-Post` (désinscription un clic depuis Gmail, POST `?desinscription=`). 280 emails par jour au plus (offre gratuite Brevo : 300). Journaux : compteurs seulement. Déployée (version 2).
- **Page `/rappels.html`** (+ `commun/rappels-page.js`, CSP propre, `no-referrer`) : `#d=<jeton>` désinscription (+ « Réactiver les emails »), `#c=<jeton>` confirmation d'adresse ; le jeton est dans l'ancre (jamais envoyé au serveur web) et effacé de l'adresse à la lecture.
- **Tests** : `tests/espace/rappels-email.test.js` (7 : aucun montant dans les textes, taux absents, nettoyage, sélection, échappement, confirmation, adresses) ; unitaires 381 ; e2e 43/43 (étape « rappels par email » : plan sans montant, confirmation, page, désinscription, réactivation, liens invalides). Confidentialité mise à jour (Brevo, sous-traitant UE). Nouveautés « 2026-10-10k », SW `orbite-2026-10-10y`.
- **Mise en service (11 oct.)** : clé API créée (la première, apparue sur une capture, a été supprimée et remplacée ; aucune clé dans le dépôt ni dans la conversation), secrets `BREVO_API_KEY` et `ORBITE_EXPEDITEUR` posés dans Supabase par l'utilisateur. Expéditeur « Orbite » vérifié dans Brevo (avertissements DKIM « par défaut » et « domaine Freemail non recommandé » : un nom de domaine authentifié améliorera la délivrabilité plus tard). Essai : appel de la fonction par pg_net avec le jeton du coffre → 200 `{comptes: 0}` ; puis un rappel « Essai · rappels par email » ajouté au seul compte de l'utilisateur → `{comptes: 1, envoyes: 1}` (Brevo a accepté), rappel d'essai retiré ensuite (plan vidé ; l'appli le remplira à la prochaine ouverture). Pour relancer un envoi à la main : `select net.http_post(url := '…/functions/v1/rappels-email', headers := jsonb_build_object('Content-Type','application/json','x-orbite-cron',(select decrypted_secret from vault.decrypted_secrets where name='rappels_cron')), body := '{"action":"quotidien"}'::jsonb);` puis lire `net._http_response`.
- **Email d'essai reçu (11 oct.)** : arrivé en **boîte de réception** Gmail, rendu conforme à la maquette, lien « Se désabonner » de Gmail affiché (List-Unsubscribe reconnu). Expéditeur réécrit par Brevo en `…@<id>.brevosend.com` (adresse Gmail) : ajout de `replyTo` (secret facultatif `ORBITE_REPONSE`, sinon `ORBITE_EXPEDITEUR`) pour que les réponses arrivent dans Gmail ; fonction redéployée (version 4), appel de contrôle 200.
- **Premier envoi réel** : dès que les deux secrets sont posés, l'envoi part le jour même à 12 h 30 pour les comptes qui ont un rappel échu. Pour tester : cocher la case dans Mon profil (un plan est enregistré) ; un rappel « fiscal » est échu à partir du 1er décembre.

## 3 sexquadragies. Optimiseur fiscal : détail de l'impôt restant (10 oct.)

- **Question de l'utilisateur** : pourquoi 4 443 DT d'« impôt restant à retenir » sur ses paies ? Reproduit au millime avec son profil : impôt annuel 16 910,276 DT (IRPP 16 614,688 + CSS 295,588) ; 3 paies × 844,547 + 1,5 salaire de prime (décembre, calendrier [0,0,1,0,0,1,0,0,1,5,0,0,1,5]) × 1 355,142 = 4 566,355 DT ; moins la part de l'assurance vie déjà déduite (456 DT/an = 2,7 % de l'impôt) ⇒ 4 443,219 DT. Son profil indique encore 875,894 DT à 2,25 % pour le crédit immobilier (à corriger par lui : 765,003 DT, début février 2023, 191 mois).
- **Choix de l'utilisateur** : afficher le détail **et** demander si l'employeur déduit déjà l'assurance vie. Profil `avPaie` (oui par défaut). `OI.optimiseurFiscal` : `paie.detail` (`impotAn`, `impotMois`, `impotParVersement`, `avantPart`, `ecoActuelle`, `part`, `appliquee`, `contrats`, `moisParMois`) ; sans déduction de l'employeur, l'impôt restant est entier (4 566 DT). Interface : `#fi-paie-detail` (« Comment est calculé ce montant ? »), étapes `#fi-paie-calcul`, question `#fi-paie-employeur` (affichée s'il y a des contrats).
- Tests : `tests/espace/impot-restant.test.js` (2) ; unitaires 374 ; e2e 42/42. Nouveautés « 2026-10-10j », SW `orbite-2026-10-10x`.

## 3 quinquadragies. Statut retraité (10 oct., livré)

- **Demande** : idée reprise d'AgentPro (simulateur.tn), seule retenue par l'utilisateur ; dépôts : l'utilisateur passe en privé tous ses dépôts **sauf portail-rh** (GitHub Pages du calculateur public).
- **Règles (sources)** : abattement forfaitaire de **25 %** sur les pensions (Code de l'IRPP et de l'IS, art. 25 ; 80 % pour une pension venant de l'étranger) ; **LF 2026 (loi n° 2025-17), art. 56** : 30 % en 2027, 40 % en 2028, 50 % à partir de 2029 (Deloitte, InFirst, presse ; texte du JORT non lu). **Choix de l'utilisateur** : 25 % puis 30/40/50 % ; retenue **CNAM 4 %** seulement ; **pas de CSS** sur les pensions ; pension saisie en **brut ou net** (caisse CNSS/CNRPS, pension étrangère oui/non). Hypothèse à faire valider : l'abattement porte sur la pension **après** la retenue CNAM (comme les frais professionnels après cotisations).
- **Moteur** : `public/moteurs/salaire/pension.js` (`CalculPension` : `tauxAbattement(annee, etranger)`, `calculerDepuisBrut`, `calculerDepuisNet` par dichotomie, `projection(e, 2026, 2029)`), `CalculSalaire.calculerDeductions` exporté, `MoteurFiscal.simuler({ …, abattementTaux })` (abattement sans plafond à la place des frais professionnels). Vérifié : 2 000 DT brut, chef de famille ⇒ 1 712,083 DT net (2026), 1 832,083 DT (2029) ; assurance vie retraité 30 000 / 3 000 ⇒ 860 DT d'économie, identique à AgentPro. Tests `tests/espace/pension.test.js` (4) ; unitaires 369.
- **Maquette** : artifact privé https://claude.ai/artifact/T6byw9e5rUJYsNwajK5m7k (profil « Votre revenu » Salarié / Retraité, détail brut → net, hausse du net 2026-2029 due à la LF 2026, assurance vie, effets sur Mon orbite, « Ma pension », optimiseur, « Et si… », capacité, mode couple).
- **Validée et intégrée** (choix : abattement **après** la retenue CNAM). Profil : `activite` (`salarie` / `retraite`), `caissePension` (`cnss` / `cnrps`), `pensionEtrangere` ; bascule « Vous êtes » en haut de la section salaire, champs `.seul-salarie` / `.seul-retraite` (classe `profil--retraite` sur le formulaire). `OC.salaire(p, annee)` renvoie la pension sous la forme d'un salaire (`pension(p, annee)` : 12 versements, `css: 0`, `abattementTaux`, `revenuFiscal` = pension après CNAM) ; `calendrierPrimes` vide pour un retraité ; `MoteurFiscal` reçoit `abattementTaux` (optimiseur, épargne, scénarios). `sy.futursRevenu` (`futursRevenu(p, m)`) réunit les hausses datées de l'historique et, pour un retraité, chaque hausse d'abattement (janvier 2027, 2028, 2029) : capacité (paliers), Mon orbite (jalons « Loi de finances : abattement de 30 % sur votre pension », net du noyau) ; « Et si… » calcule chaque mois avec l'abattement de son année. « Ma pension » (`vue-pension.js`, `#pension-vue` dans la vue Salaire, classe `module--pension`) : saisie brut ⇄ net (conversion), détail, barres 2026-2029, assurance vie, « Mettre à jour mon profil » (historique) ; menus et barre du haut « Pension » / « Ma pension », actions du simulateur de salaire cachées (`body.pension-active`). Assistant (résumé), fiche admin, fenêtre « Mettre à jour ma pension » adaptés. Tests : `pension.test.js` (7) ; unitaires 372 ; e2e 41/41. Nouveautés « 2026-10-10i », SW `orbite-2026-10-10w`.

## 3 quaterquadragies. Coordonnées facultatives et concurrent simulateur.tn (10 oct.)

- **Concurrent simulateur.tn** : le réseau de l'environnement Claude refuse ce domaine (403) ; l'utilisateur peut l'ajouter dans Network access (Allowed domains) ou envoyer des captures. D'après la recherche web : « Simulateur Avantage Fiscal », gratuit, un seul calcul (économie d'impôt assurance vie / CEA, déduction jusqu'à 100 000 DT, réduction jusqu'à 55 %), signé par une experte en optimisation fiscale, email et téléphone de contact affichés (sert à être recontacté). Leurs atouts : simplicité, contact humain. Comparaison détaillée à faire dès que le site est accessible.
- **Analyse faite (accès ouvert par l'utilisateur, 10 oct.)** : le site s'appelle **AgentPro** (simulateur.tn → accueil.php), par Farouk et Fayrouz MEJRI. 4 pages : accueil, `simulation-publique.php`, `contact.php` (« Être rappelé » : nom* + téléphone* + email facultatif + message ; réponse sous 24-48 h), `login.php` (espace conseiller B2B : base clients, simulation fiscale, demandes de rachat et d'avance). Simulation **gratuite, sans compte**, calcul dans le navigateur (aucune requête envoyée), assurance vie seulement, statut **Salarié ou Retraité** (abattement 25 % pour les retraités), « revenu brut imposable » saisi directement, montant optimal mis en avant, détail du calcul **tranche par tranche avant / après**, rapport PDF, FAQ. Chiffres **identiques au millime** au moteur fiscal d'Orbite sur 3 cas (61 758 / 10 000 → 3 789,16 DT, optimal 25 564,61 ; 30 000 / 3 000 / 2 enfants → 900 DT ; 120 000 / 20 000 / 1 enfant → 8 000 DT). Écarts d'Orbite : pas de statut retraité, pas de simulation fiscale publique sans compte, pas de détail par tranche ni de bouton « Être rappelé » visible. Captures dans le bloc-notes (`concurrent/`).
- **Alerte sécurité (10 oct.)** : `list_repos` montre que **tous les dépôts sont publics** (espace-finances-tn, portail-rh, simulateur-credit, simulateur-assurance-vie, simulateur-Assurance-Automobile), contrairement à la règle « personne ne doit accéder à mon repo ». Aucun secret n'y est (règle respectée), mais le code est lisible par tous. Le passage en privé se fait par l'utilisateur (Settings › Danger Zone › Change visibility). Attention : GitHub Pages de `portail-rh` (calculateur public) exige un dépôt public sur le plan gratuit ; Cloudflare (Orbite) fonctionne avec un dépôt privé.
- **Demande** : email et téléphone facultatifs comme chez le concurrent. **Choix de l'utilisateur** : usages = être recontacté + rappels par email + fiche ; dans Mon profil › Vous ; email prérempli (connexion) et modifiable ; téléphone Tunisie + étranger.
- **Profil** (`orbite-calcul.js`) : `emailContact` (`lireEmail` : forme simple, minuscules, 120 car.), `telephone` (`lireTelephone` : 8 chiffres commençant par 2-9 ⇒ `+216…` ; `+216` / `00216` + 8 chiffres ; sinon `+indicatif` 8 à 15 chiffres ; `formatTelephone` → « +216 22 123 456 »), `contactOk` + `contactOkLe` (ISO, effacée sans accord), `rappelsEmail`. Vide = l'email de connexion (affiché, jamais recopié).
- **Interface** : bloc `#contact-profil` en bas de « Vous » (champs `#p-email`, `#p-tel`, erreurs à la sortie du champ, interrupteurs `#p-contact-ok`, `#p-rappels-email`). « Recevoir mes rappels par email » est enregistré mais **l'envoi n'existe pas encore** (le texte le dit) : il faudra un service d'envoi (question posée à l'utilisateur).
- **Envoi des rappels par email : Brevo choisi par l'utilisateur** (10 oct.). À faire : l'utilisateur crée le compte Brevo, vérifie l'adresse d'expéditeur et crée une clé API ; la clé va **uniquement** dans les secrets Supabase (`BREVO_API_KEY`, jamais dans le dépôt ni la conversation). Puis : fonction Edge planifiée (calcul des rappels avec les mêmes modules purs que l'application, comptes `rappelsEmail = true`, table des envois pour ne rien envoyer deux fois, lien de désinscription). Attention : un expéditeur Gmail sans domaine risque de tomber en spam ; un nom de domaine (enregistrements SPF/DKIM) est préférable à terme.
- **Admin** : migration `0010_contacts.sql` **appliquée** sur Supabase (`admin_contacts()`, security definer, `exiger_admin`, refusée à `anon`) : nom, email de contact (ou de connexion), téléphone, date d'accord, rappels souhaités, **uniquement si `contactOk = true`**. Section « Demandes de contact » (`#admin-contacts`) avec liens mailto / tel. `Espace.admin.contacts()`.
- Confidentialité mise à jour (coordonnées facultatives, « Être recontacté »). L'Assistant ne reçoit jamais ces coordonnées (résumé construit champ par champ).
- Tests : `tests/espace/contact.test.js` (3) ; unitaires 365 ; e2e 40/40 (email prérempli, erreurs, mise en forme, accord visible par l'admin puis retiré). Nouveautés « 2026-10-10h », SW `orbite-2026-10-10v`.

## 3 terquadragies. Lot 2 : « Et si… » (B2) et mode Expert (C2) (10 oct.)

- **Maquette validée** : artifact privé https://claude.ai/artifact/BRFV4yY2v7u5Pih47Z1xQH (source dans le bloc-notes, `lot2/maquette/`, branchée sur le vrai moteur). **Choix de l'utilisateur** : scénarios dans Vie & impôts ; 4 types de changements (salaire / nouveau poste, nouveau crédit, épargne mensuelle, événements de vie : mariage, enfant, remboursement anticipé) ; interrupteur Expert dans Paramètres ; export Excel + CSV ; « Appliquer » comme proposé ; bilan **hors valeur du bien acheté** ; horizon **10 ans fixe**.
- **Moteur** `public/espace/js/scenarios-calcul.js` (UMD, `window.Scenarios`) : `calculer(p, scenario, maintenant)` → 121 mois (`netMensuel`, `netMoyen`, `charges`, `endettement`, `marge`, `epargneMensuelle`, `capitalEpargne`, `reste` = net moyen − crédits − épargne − loyer et charges fixes), années civiles (`impotRetenu` mois par mois, `avantageFiscal` AV/CEA via MoteurFiscal, `impotNet`), `evenements` (changements + fins de crédit), `alertes` (`endettement` : nouveau crédit au-delà de la quotité ; `reste` négatif), `soldes` (capital payé par un remboursement anticipé), `totaux` (reste, capital, impôt, intérêts **échéance par échéance** sur l'horizon). Crédits en cours = modèle de Mon orbite (fins, règle des 8 %). Salaire = même mécanique que l'historique du salaire. Mariage ⇒ marié + chef de famille ; enfant ⇒ +1. `comparer(p, scenarios)` → référence, scénarios (`ecart`, `score` = reste + épargne), `jalons` [0, 12, 36, 60, 120]. Vérifié : référence identique à la synthèse (2 768,253 DT net, 309 DT de marge pour l'utilisateur).
- **Profil** (`orbite-calcul.js`) : `scenarios` (3 au plus, 8 changements chacun ; `normaliserScenario`, `normaliserChangement` : bornes, types connus seulement, libellés nettoyés) ; `rappelsPerso` (20 au plus, URL limitée à `/espace/#…`) affichés par `rappels-calcul.js` (le 1er du mois à 9 h, 45 jours). `contratCommence(c, m)` : un contrat dont le 1er versement est à venir ne compte qu'à partir de sa date (épargne du budget, versements de l'année pour l'impôt, optimiseur, foyer, scénarios).
- **Interface** `vue-scenarios.js` (onglet `#vie?onglet=scenarios`, 3ᵉ onglet de Vie & impôts ; `vue-vie.js` gère 3 onglets et envoie `orbite:etsi`) : carte « Aujourd'hui », cartes A/B/C (nom modifiable, changements retirables, suppression annulable, alerte de la banque ou « accepté »), carte de modèles préremplis (nouveau poste +15 %, voiture à crédit 40 000 DT sur 7 ans au taux du profil, épargne 200 DT, enfant l'an prochain), éditeur (mois entre aujourd'hui et +10 ans), frise SVG en escalier (5 vues, zone « refus probable » sur la marge, repères d'évènements, curseur + bulle), verdict, bilans, dates clés, séries mois par mois (Expert, CSV). Enregistrement automatique dans le profil (pas de bouton « Enregistrer », comme le reste du profil). **Appliquer** : salaire → historique ; crédit → Mes projets (immo / terrain / voiture / travaux / autre, horizon en années) ; épargne → contrat à sa date ; mariage / enfant / remboursement → appliqués si le mois est arrivé, sinon rappel programmé ; message « Annuler ». Couleurs `--etsi-ref/A/B/C`.
- **Mode Expert** : préférence de l'appareil `ef-expert = oui`, `Orbite.expert()`, `Orbite.definirExpert(on)` (classe `body.expert`, évènement `orbite:expert`) ; tout ce qui est `.expert-seul` est caché sinon. `expert-calcul.js` (pur) : `amortissement(sy, i)` (prochaine échéance → fin, numéros réels si dates connues, réductions de taux marquées, solde nul), `paieAnnee(sy)` (mois par mois, salaire alors en vigueur, salaires en plus), `csv` (BOM, `;`, virgule décimale, pas de formule injectée), tables, `classeur(sy, comp, noms)` (Profil, Paie, un onglet par crédit, Contrats, Mon orbite, Impôt, Scénarios, Scénarios bilan ; format `moteurs/vie/xlsx.js`). `vue-expert.js` : paie (`#p-paie`), tableau sous chaque crédit (`[data-amort]` dans `modele-credit`), section `#orbite-expert` (121 mois, CSV, « Tout exporter (Excel) »), bouton `#exporter-xlsx` dans Données. `Orbite.telecharger(nom, contenu, type)` partagé.
- Tests : `scenarios.test.js` (5), `expert-calcul.test.js` (4), rappel programmé (1) ; unitaires 362 ; e2e 39/39 (modèles, refus de la banque, année passée refusée, enregistrement, application annulée, rappel, suppression annulée, réglage Expert, CSV et classeur téléchargés). Nouveautés « 2026-10-10g », SW `orbite-2026-10-10u`.
- Limites connues : un remboursement anticipé vise un crédit par son rang (retirer un crédit du profil décale les scénarios qui y font référence) ; la valeur des biens achetés n'est pas comptée (choix de l'utilisateur).

## 3 duoquadragies. Historique du salaire : date d'effet, impôt mois par mois, hausses prévues (10 oct.)

- **Demande** : mettre à jour le salaire brut quand il augmente, en indiquant le mois et l'année. **Choix de l'utilisateur** : accès depuis le profil **et** le module Salaire ; hausses futures permises, appliquées à leur date ; impôt de l'année calculé mois par mois, primes comprises ; la courbe de carrière et l'inflation restent au lot 3.
- **Données** : `profil.historiqueSalaire` = liste triée (40 au plus) de `{ montant, sens, periode, mois, annee }` ; `mois = annee = 0` = « avant » (salaire de départ, gardé au premier changement). `montant/sens/periode` du profil = le salaire **en vigueur aujourd'hui** (tous les anciens calculs le lisent toujours).
- **Moteur** (`orbite-calcul.js`) : `cleHausse`, `salaireEnVigueur(p, annee, mois0)`, `salaireDe(p, h)`, `memeSalaire`, `appliquerHistorique(p, maintenant)` (appliqué dans `synthese` et au chargement : une hausse prévue arrivée à son mois devient le salaire du profil, avec un message), `infoHistorique` → `sy.historique` (`enVigueur`, `depuis`, `hausse`, `futurs[]` avec `mois` = décalage depuis aujourd'hui, net et brut), `salaireAnnee` → `sy.salaireAnnee` (12 mois au salaire alors en vigueur, chaque prime au salaire de son mois ; `parMois[k].retenue`), null si le salaire ne change pas dans l'année. `impotRestantAnnee`, l'optimiseur fiscal et `entreeFiscale` utilisent `sy.salaireAnnee || sy.salaire`. Capacité : `paliersMarge` / `sortieEndettement` changent le revenu au mois de chaque hausse prévue (champs `hausse`, `revenu`) ; `evenementEtape` → « hausse de salaire ».
- **Interface** :
  - Profil, sous le salaire : bloc `#hs-bloc`, bouton « Mettre à jour mon salaire » (`#hs-maj`), liste `#hs-liste` du plus récent au plus ancien (Depuis / À partir de … prévue / Avant …, variation du brut en %, puces « en vigueur » / « prévue », retrait annulable). Styles `.historique-salaire*` dans `app.css`.
  - Fenêtre `#dlg-salaire` (`Orbite.mettreAJourSalaire(o)` dans `app.js`) : nouveau montant, mois, année (par défaut le mois du jour), salaire d'avant au premier changement, effet en direct (variation, net avant → après, « hausse prévue »). Même date ⇒ l'entrée est remplacée. `Orbite.retirerSalaire(i)`.
  - « Annuler » des messages : seulement si l'historique n'a pas changé depuis (`annulationSalaire`), car les messages s'empilent.
  - `majProfil` : une correction directe de `montant/sens/periode` (champ du profil) met à jour l'entrée en vigueur.
  - Module Salaire, « Mettre à jour mon profil » : si le salaire diffère de celui du profil, les autres champs sont repris et la fenêtre s'ouvre, préremplie, pour choisir la date d'effet.
  - Mon orbite : jalons `genre: "salaire"` (`sat: null`), le noyau suit le net du mois affiché, « avec vos hausses de salaire prévues », endettement calculé sur le revenu du mois ; Assistant (« avec votre hausse de salaire » / « ki yzid salaire mte3ek ») et résumé IA (« Historique du salaire »).
- Tests : `tests/espace/historique-salaire.test.js` (4) ; unitaires 352 ; e2e 37/37 (hausse datée, hausse prévue, ancien « Annuler » sans effet, correction directe, module Salaire). Nouveautés « 2026-10-10f », SW `orbite-2026-10-10t`.
- **Livré** : PR #62 fusionnée (squash) le 10 oct. Captures vérifiées : ordinateur (sombre) et téléphone (clair).
- **Suite du programme** : lot 2 livré ensuite (3 terquadragies).

## 3 unquadragies. Simulations → profil, remboursements anticipés par date, corrections Salaire (10 oct.)

- **Simulation → profil** (choix de l'utilisateur) : bouton « Ajouter à mon profil » (`#ajouter-profil`, barre du haut de Crédit et Épargne) **et** case dans « Enregistrer » (`#enr-profil`). Fenêtre `#dlg-profil` construite dans `app.js` (`ajouterAuProfil`), annulable par le message (« Annuler » remet crédits, projets et contrats comme avant).
  - Crédit (`ModuleCredit.versProfil()`) : « Déjà signé » → crédits en cours, **situation du jour** tirée du tableau simulé (mensualité hors assurance de la prochaine échéance, taux lu sur les intérêts, durée totale = nombre d'échéances après remboursements, début = mois précédant la 1re échéance, dernière réduction de taux passée, `tauxType` selon fixe / TMM) ; « En projet » → Mes projets (type logement / voiture / travaux / autre, montant, horizon). Mensuel et à échéances constantes seulement pour « Déjà signé ». Par défaut : « Déjà signé » si la 1re échéance est passée. Doublons : choix « Ajouter un nouveau » ou « Mettre à jour « X » » (présélection si même type et même nom ou mensualité à ±15 %).
  - Épargne (`ModuleEpargne.versProfil()`) : un contrat par produit (assurance vie et CEA séparés), versement mensuel, mois de début ; mise à jour d'un contrat du même type (présélectionnée s'il n'y en a qu'un) en gardant sa date d'ouverture.
- **Remboursements anticipés** (module Crédit) : saisie **mois / année** (→ échéance du même mois, affichée « après l'échéance n° X »), et pour chacun « Ensuite, la banque » : réduit la durée / réduit l'échéance / **nouvelle durée** (nombre d'échéances restantes). Moteur `credit.js` : `ras[].mode` (`duree`, `mensualite`, `nouvelle` + `nouvelleDuree`), lien `ra=11:150000:n180` (`:d`, `:m`). Le choix général `raMode` ne sert plus qu'aux versements réguliers. Vérifié : 270 000 DT à 4,5 % sur 299 mois, 150 000 DT en janvier 2024 avec 180 mois ⇒ 875,894 DT, puis 765,003 DT en mars 2026 (règle des 8 %), fin janvier 2039 (test dans `tests/credit/fonctions.test.js`).
- **Salaire** : « Autres charges de l'entreprise » en DT seulement (champ % supprimé ; une ancienne simulation en % est convertie en DT équivalent au chargement, même coût employeur ; libellé « par mois » / « par an » selon la période).
- **Défaut corrigé** : les repères « Aujourd'hui / Après » de « Votre tranche d'impôt » prenaient le style `.repere` des cartes de la fiche Mon orbite (lot 1). Classes de la fiche renommées `.orbite-repere*`.
- Tests : unitaires 348, e2e 36/36. Nouveautés « 2026-10-10e », SW `orbite-2026-10-10s`.

## 3 quadragies. Règle des 8 % dans Orbite (10 oct.)

- **Règle** (loi n° 2024-41 du 2 août 2024, déjà dans le module Crédit et le simulateur crédit) : crédit à **taux fixe** de plus de 84 mois ; avant l'échéance k, intérêts des 36 échéances précédentes > 8 % du capital restant dû ⇒ taux divisé par 2 (même date de fin, la mensualité baisse) ; 1er contrôle à l'échéance 37, puis chaque mois ; après une réduction, contrôle suivant 36 échéances plus tard ; sans limite.
- **Choix de l'utilisateur** : calcul automatique partout ; taux fixe seulement (module Crédit compris : interrupteur désactivé en TMM + marge) ; type de taux non précisé ⇒ aucune réduction, invitation à le préciser ; rappel seul (pas de lettre).
- **Vérifié sur le vrai tableau de l'utilisateur** (fichier Excel, non versionné) : crédit immobilier 270 000 DT à 4,5 % (1re échéance mars 2023), remboursement partiel 150 000 DT le 09/01/2024 (mensualité 875,894 DT), ratio 20,7 % à l'échéance 37 ⇒ 2,25 % en mars 2026, mensualité 765,003 DT (retrouvée au millime), fin janvier 2039. Projection : contrôle mars 2029 à 7,67 %, puis réductions en septembre 2031 (8,01 % ⇒ 1,125 %, 734,081 DT) et janvier 2038 (0,5625 %). Ses crédits conso (50 000 DT) et FAS (39 000 DT) durent 84 mois : non concernés. **Son profil Orbite indique encore 875,894 DT à 4,5 %** : à mettre à jour par lui (765,003 DT, 2,25 %, début février 2023, 191 mois, fixe, réduit en mars 2026) ; capacité ≈ 309 DT/mois au lieu de 198.
- **Code** :
  - `orbite-calcul.js` : champs crédit `tauxType`, `reductionMois`, `reductionAnnee` ; `reductionsTaux(c, maintenant)` (passé reconstitué à rebours depuis la mensualité, le taux et les échéances restantes ; `possibleDepuis` si une réduction n'a pas été demandée) attachée en `c.reductionTaux` et `sy.credits[i].reduction` ; `paliersMarge` et `sortieEndettement` suivent les baisses de mensualité (`evolutionCharges`), étapes avec `reduits` (une réduction seule fait une étape si elle libère ≥ 10 DT) ; `evenementEtape(x, darija)` ; `tauxOrigine(c)` (taux × 2 si déjà réduit) pour les taux des futurs crédits.
  - `orbite-systeme.js` : jalons `reduction`, mensualité / taux / capital / intérêts au mois t, `prochaine`. Fiche du crédit : taux, prochaine réduction, encart (ou invitation). Calendrier de la marge, Assistant (résumé IA et réponses locales) et rappels (`reduction-*`, un mois avant, ou tout de suite si « possible depuis ») mis à jour.
  - Profil : « Type de taux », « Dernière réduction : mois / année », phrase d'état sous chaque crédit.
  - Limite connue : un remboursement anticipé à l'intérieur de la fenêtre de 36 mois n'est pas reconstitué (on suppose mensualité et taux constants depuis le début ou la dernière réduction).
- Tests : `tests/espace/regle-8.test.js` (tableau de la banque), rappel ajouté ; unitaires 347, e2e 33/33. Nouveautés « 2026-10-10d », SW `orbite-2026-10-10r`.

## 3 undequadragies. Assistant et Vie & impôts sur téléphone (10 oct.)

- Cause : la barre du bas (5 onglets : Orbite, Salaire, Épargne, Crédit, Moi) ne contenait ni l'Assistant ni Vie & impôts, présents seulement dans la barre latérale (ordinateur).
- Choix de l'utilisateur : bouton flottant « Assistant » (`#bulle-assistant`, au-dessus des onglets, masqué sur ordinateur, pendant le chargement et dans l'Assistant) ; Vie & impôts dans « Moi » (lien dans `.sous-nav` du profil, `data-vues` de « Moi » inclut `vie`). `body[data-vue-active]` posé par `afficher()`. Visite : cibles téléphone ajoutées. SW `orbite-2026-10-10q`. e2e : bouton, ouverture, Vie & impôts depuis « Moi ».

## 3 duodequadragies. Programme « créativité » en 8 lots (10 oct.)

> **Avancement (11 oct., soir)** : lots 1 à 4 livrés — lot 1 (#58), lot 2 « Et si… » + mode Expert, lot 3 « Ma progression » (#79), lot 4 retraite CNSS / CNRPS (#82). Hors programme, livrés aussi : règle des 8 % (#60), simulations → profil et remboursements anticipés (#61), historique du salaire (#62), coordonnées facultatives, statut retraité (#69), détail de l'impôt restant (#70), rappels par email Brevo en service (#71-#75), témoin d'enregistrement (#77), connexion vivante (#78), boussole « Guide » (#81), crédit à la capacité selon le type et cartes « Vos données » (#83), état du thème « Soleil » (#84), signature « Conçu par » (#85). Lot 5 livré (accueil « scroll-cinéma », #88) et crédit terminé exclu des charges (#87). **Restent :** lot 6 A3 « Mon année en orbite », lot 7 B5 lecture de fiche de paie, lot 8 C4 assistant vocal (lecture seulement).
> Rappel des définitions d'origine : **B6** = historique et carrière (courbe du salaire dans le temps, hausses datées — base déjà faite avec l'historique du salaire —, pouvoir d'achat corrigé de l'inflation avec les chiffres de l'INS **soumis à l'utilisateur avant intégration**, projection de carrière). **C3** = objectifs et défis (objectifs d'épargne ou de remboursement avec jalons et progression ; nouvelle table Supabase avec RLS). Le lot 3 crée les données dont ont besoin le lot 4 (retraite) et le lot 6 (« Mon année en orbite »).

- **Demande de l'utilisateur** : une créativité énorme (design, fonctionnalités, options avancées), un travail sans faute, des propositions **avant** toute modification, et des questions en cas de doute.
- **Retenues** : A1, A2, A3, A4, B1, B2, B5, B6, C2, C3, C4. Design « spectaculaire mais sobre ». Interface en français seulement. **Une maquette validée avant chaque fonctionnalité**.
- **Ordre validé** :
  1. A4 micro-interactions + A1 Orbite vivante ;
  2. B2 scénarios côte à côte + C2 mode Expert (amortissement, export Excel/CSV) ;
  3. B6 historique et carrière + C3 objectifs et défis (nouvelle table Supabase avec RLS) ;
  4. B1 retraite CNSS / CNRPS ;
  5. A2 accueil « scroll-cinéma » ;
  6. A3 « Mon année en orbite » ;
  7. B5 lecture de fiche de paie ;
  8. C4 assistant vocal.
- **Décisions** :
  - Retraite (B1) : je rassemble les textes officiels (réforme 2019) avec leurs sources, l'utilisateur valide avant tout calcul. Aucune règle de mémoire.
  - Vocal (C4) : **lecture à voix haute seulement** (sur l'appareil). Pas de dictée du navigateur : Chrome envoie la voix à Google.
  - Accueil (A2) : **aucun faux témoignage** ; trois cas types marqués « Exemple », avec leurs vrais calculs.
  - Fiche de paie (B5) : PDF fiable, photo moins ; il faudra des fiches anonymisées pour l'étalonner. Historique (B6) : chiffres d'inflation de l'INS soumis avant intégration.
- **Lot 1, maquette** : artifact privé « Orbite vivante » https://claude.ai/artifact/J4nyTjZy2LXQWKmHmet1W9 (source dans le scratchpad, `demos/orbite-vivante.html`).
  - Planète de particules (le net) ; chaque crédit, contrat et projet est un satellite-bouton. Taille selon la mensualité (ou le capital), traîne selon les mois restants. Projet vide : satellite en pointillé.
  - Toucher un satellite : la caméra pivote vers lui, les orbites s'arrêtent, la fiche s'ouvre en fondu-flou (statut, échéances, capital restant estimé, intérêts restants, capacité à la fin du crédit, bouton « Voyager jusqu'en … »).
  - Voyage dans le temps (curseur, lecture, prochain jalon) jusqu'à la fin du dernier crédit, à salaire constant. À la fin d'un crédit, des étincelles rejoignent le noyau et la capacité roule (198 → 893 → 1 391 → 2 267 DT/mois pour l'utilisateur). Assurance vie : anneau à 8 ans (décembre 2029).
  - A4 : chiffres qui roulent chiffre par chiffre, vibration (Android seulement), squelettes de chargement, thème selon l'heure (lever et coucher du soleil à Tunis, formules NOAA, UTC+1).
  - Chiffres calculés par `orbite-calcul.js` (synthèse au 9 oct. 2026) ; capital restant par la formule d'amortissement ; capacité = 40 % du brut annuel ÷ 12 − mensualités ; capital immo sur 20 ans à 4,5 %.
  - Validée par l'utilisateur (10 oct.) : les 3 repères vont dans la fiche « Vue d'ensemble », salaire constant (hausse réglable au lot 3), thème par défaut = appareil, « Soleil » en option.
- **Lot 1, intégré** (PR « Orbite vivante ») :
  - `public/espace/js/orbite-systeme.js` (pur, UMD, testé : `tests/espace/orbite-systeme.test.js`) : `OrbiteSysteme.modele(sy, base)` → `satellites` (crédits triés par fin, contrats, projets, ou place libre `projet-nouveau`), `jalons` (fin de crédit, durée fiscale d'un contrat, horizon d'un projet), `horizon`, `etat(t)` (charges, endettement, capacité = paliers du moteur, capital restant par `capitalPourMensualite`, intérêts, capital du contrat par `estimationContrat`, ou capital du relevé qui croît au rendement estimé). `orbite-calcul.js` exporte désormais `MOIS` et `RENDEMENT_ESTIME`.
  - `public/espace/js/scene-orbite.js` : `OrbiteScene.creer({ciel, toile, calque, noyau, reduit, capitalRef, texteTag, libelle, surChoix})` → `satellites()`, `etat()`, `choisir()`, `liberer()`, `pulser()`, `couleur()`, `activer()`. Canvas 2D, satellites = boutons, étiquettes jamais sur le net ni entre elles, orbites resserrées sous 560 px, pause hors écran / vue cachée.
  - `vue-orbite.js` : scène, voyage (curseur, lecture avec pause aux jalons, « Aujourd'hui », prochain jalon, annonce + vibration + étincelles), fiche construite en DOM (CSP `style-src 'self'` : aucun attribut `style` dans du HTML, styles posés par CSSOM). Le budget est sorti de la grille, sous la scène.
  - A4 : `Orbite.animerNombre` fait rouler les chiffres (`Orbite.rouler`, colonnes en pseudo-éléments : `textContent` = montant exact) ; règles `.roule*` en `!important` contre les règles « … span » des emplacements. `Orbite.vibrer(motif)` (préférence `ef-vibrations`, réglage « Vibrations »). Chargement : `body.attente` montre la coquille avec squelettes (`[data-sq]`) au lieu de cacher l'application. Thème « Soleil » (`ef-theme = heure`) dans `theme-init.js` (`EFTheme.soleil`, `nuitATunis`, vérifié chaque minute, évènement `ef:theme`).
  - Correctif : « Quoi de neuf » décidait « nouveau venu » 600 ms après l'ouverture ; un nouveau venu rapide voyait les notes. La décision est prise à l'ouverture.
  - Visite : étape « Votre fiche » ajoutée. Nouveautés « 2026-10-10c ». SW `orbite-2026-10-10p`.
  - Tests : unitaires 340, e2e 33/33 (scène, fiche, voyage, thème Soleil, vibrations). Dans l'e2e, cliquer les libellés des bascules (le clic forcé sur le bouton radio d'une bascule à 4 choix ne le coche pas) et écarter le pointeur d'un message (il le met en pause).

## 3 septtricies. Accueil : planète salaire en 3D (concept 4) (10 oct.)

- L'utilisateur voulait un haut de page innovant et futuriste, sans copier le concurrent (vidéo : carte de 4 étapes « vous épargnez → impôt baisse → net augmente »). Sept maquettes proposées en pages privées (concepts 1-3 : https://claude.ai/artifact/RoYdLGE2tzoP4vuP2EcAkG ; concepts 4-7 : https://claude.ai/artifact/M8sbzP4TQe7GrpPsiw7Qdq). Choix : **4, planète salaire en 3D**.
- `public/commun/planete.js` (`window.OrbitePlanete.creer(canvas, { reduit })` → `{ maj({ brut, net, cnss, impot }) }`) : ~1 700 particules, cœur vert = net, anneaux bleu (cotisations) et ambre (impôt) proportionnels au brut, rotation auto + glisser au doigt, pause hors écran, mouvement réduit = image fixe.
- `index.html` : dans le formulaire « Essayez avec votre salaire », `.apercu__planete` (canvas `#planete` + `#net` au cœur + légende `#p-cnss` / `#p-impot`) remplace le bloc blanc du net. `accueil.js` alimente la planète à chaque calcul (cotisations/12, `impotMois`).

## 3 sextricies. Cloudflare Turnstile (anti-robots) sur la connexion (10 oct.)

- **Demande de l'utilisateur** : pourquoi pas de cadre « Vérifiez que vous êtes humain » comme sur d'autres sites ? Choix (questions cliquables) : connexion + inscription + mot de passe oublié ; affichage automatique (mode Managed).
- `public/commun/turnstile.js` (`window.EFTurnstile.preparer(cle, conteneur, doc)` → `{ jeton(), renouveler() }`) : charge `challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` seulement si `EF_CONFIG.turnstileCle` est renseignée ; sinon `jeton()` → null (comportement inchangé). Jeton à usage unique, renouvelé après chaque envoi ; délai max 20 s ; erreurs claires.
- `connexion.js` : `captchaToken` passé à `signInWithPassword`, `signUp`, `resetPasswordForEmail` (pas pour Google ni la réinitialisation). `#turnstile` au-dessus du bouton. `modele.js` traduit l'erreur « captcha ».
- `_headers` (/connexion.html, /connexion) : `script-src` + `frame-src https://challenges.cloudflare.com`.
- **Ordre de mise en service** (sinon plus personne ne peut se connecter) : 1) code en ligne (fait) ; 2) l'utilisateur crée le widget Turnstile (mode Managed, domaine `espace-finances-tn.jaouadimohamedaziz.workers.dev`) et donne la **clé de site** (publique) ; 3) je la mets dans `config.js` ; 4) **ensuite seulement**, il active Supabase → Authentication → Bot and Abuse Protection → Turnstile avec la **clé secrète** (jamais dans le dépôt ni la conversation).
- e2e : faux script Turnstile servi dans **chaque** contexte (enveloppe de `navigateur.newContext`), étape dédiée → `gotrue_meta_security.captcha_token` transmis.
- Clé de site activée dans `config.js` : `0x4AAAAAAFSsJoQNyLaiL5tt` (widget « Orbite connexion », mode Managed). L'utilisateur a montré la clé secrète dans une capture et a choisi de la garder (pas de rotation). Elle n'est que dans Supabase.
- Piège : un élément `id="turnstile"` crée `window.turnstile` (accès nommé) et masque l'API Cloudflare → conteneur `#anti-robots` et test `typeof turnstile.render === "function"`.

## 3 quintricies. Assistant : « Orbite calcule, l'IA rédige » (10 oct.)

- **Constat (captures de l'utilisateur)** : Cloudflare Workers AI répond (ton naturel), mais invente dates et montants (« crédit auto fini en 2030 », « 64 233 DT en 2030 », « octobre 2027 »). Réalité : auto fini en mars 2032, mariage en juin 2032 ; en 2030-2031 la capacité auto reste 14 233 DT. Il citait aussi le score de santé sur un simple « bonjour ».
- Choix (question cliquable) : **Orbite calcule, l'IA rédige**.
- `assistant-local.js` : chaque réponse porte `intention` ; `calculPourIA(question, sy, precedente)` renvoie le calcul exact du moteur (null pour salutation/question générale). Relance « et si j'attends un an / deux ans », darija « nostanna 3am » : la question précédente est reprise avec l'année décalée.
  - Réponse crédit enrichie : après la capacité à la date demandée, **l'étape suivante** du calendrier (« À partir de mars 2032, à la fin de votre crédit auto, ce plafond passe à 64 233 DT »), puis le meilleur moment s'il est plus loin.
- `vue-assistant.js` : envoie `calcul` avec la question ; le lien du calcul (« Simuler ce crédit ») s'affiche sous la réponse de l'IA. `E.assistant.demander(q, hist, contexte, calcul)`.
- Serveur (`regles.js`, fonction déployée v5) : `LIMITES.calcul` 3000, bloc `<calcul_orbite>` avant la question ; consignes : le calcul est la vérité, reformuler sans changer aucun chiffre ni date ; salutation/question générale sans aucun chiffre du profil.
- `nouveautes.js` version « 2026-10-10b ». Tests 329, e2e (calcul joint, lien affiché, pas de calcul pour « Bonjour »).

## 3 quatertricies. Assistant : IA gratuite Cloudflare Workers AI + ton plus humain (10 oct.)

- **Demande de l'utilisateur** : un Assistant intelligent « comme Claude ». Constat : la fonction appelait déjà Claude, mais `ANTHROPIC_API_KEY` n'est pas configurée, d'où l'assistant intégré. L'utilisateur veut **du gratuit** → choix (question cliquable) : **Cloudflare Workers AI**. Ton plus humain : oui.
- Liste à jour des paliers gratuits (cheahjs) inaccessible depuis l'environnement : aucun quota cité. Rappel donné : Gemini gratuit / Mistral gratuit entraînent sur les données → contraire à la confidentialité.
- `supabase/functions/assistant/index.ts` (déployée v3) : ordre **Claude** (si `ANTHROPIC_API_KEY`) → **Cloudflare** (si `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`) → `bientot`.
  - Cloudflare : modèle `CF_MODELE` imposé, sinon catalogue du compte (`/ai/models/search?task=Text Generation`) + `choisirModeleCF`, sinon `MODELES_CF_SECOURS` ; appel `/ai/v1/chat/completions`, repli `/ai/run/<modèle>` ; 429 → `quota_gratuit` ; échec → 503 et question rendue (`assistant_rendre`) → le navigateur répond avec l'assistant intégré.
- `regles.js` : `SYSTEME` réécrit (ami qui s'y connaît, réponse directe, longueur adaptée, une question si info manquante, vouvoiement sauf tutoiement, darija), `messagesChat`, `choisirModeleCF`, `texteCloudflare` (retire `<think>`). 4 tests ajoutés (325).
- Confidentialité : fournisseur d'IA « Cloudflare (Workers AI) ou Anthropic ».
- **À faire par l'utilisateur** : créer un jeton API Cloudflare (Workers AI lecture + modification) et ajouter dans Supabase → Edge Functions → Secrets : `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. Ne jamais coller ces valeurs dans la conversation ni dans le dépôt.

## 3 tertricies. Mise à jour proposée à l'utilisateur + « Quoi de neuf » (10 oct.)

- **Choix (questions cliquables)** : bandeau + bouton ; court résumé des nouveautés ; vérification à l'ouverture + toutes les 30 min.
- `sw.js` : **plus de `skipWaiting` automatique**. La nouvelle version s'installe puis attend ; message `{type: "activer"}` → `skipWaiting()`. Première installation : active tout de suite (pas d'ancienne version).
- `appli.js` : `surveillerVersion(r)` (si une page est déjà contrôlée) : `r.waiting` ou `updatefound` → `proposerMaj(sw)` ; `r.update()` toutes les 30 min et au retour de visibilité ; `controllerchange` → rechargement (seulement après clic) ; filet de rechargement à 4 s.
  - Bandeau `#maj-bandeau` (« Plus tard » le masque jusqu'au prochain chargement ; la version s'applique d'elle-même quand Orbite est fermée partout).
  - `window.OrbiteMaj = { proposer, nouveautes }` (sert aussi aux tests).
- **Quoi de neuf** : `public/espace/js/nouveautes.js` (`window.ORBITE_NOUVEAUTES = { version, date, points }`), dialogue `#dlg-nouveautes`. Clé `localStorage` « orbite-nouveautes ». Montré une fois par version de notes ; jamais à un nouveau venu (profil vierge) ; après « Mettre à jour » sans nouvelles notes : toast « Orbite est à jour ».
  - **À chaque mise en ligne importante** : réécrire `nouveautes.js` et changer sa `version` (2 à 4 points, du point de vue de l'utilisateur).
- e2e (étape mobile) : nouveautés pour un utilisateur existant sur un nouvel appareil, bandeau, Plus tard, Mettre à jour (activation + rechargement). 30/30.

## 3 duotricies. Cache : réseau d'abord pour scripts et styles (10 oct.)

- **Bug signalé (capture téléphone)** : la visite guidée s'affichait en texte brut en bas de page. Cause : le service worker servait js/css **depuis le cache d'abord** ; la nouvelle page (réseau) et `visite.js` (absent du cache, donc réseau) étaient chargés avec l'**ancien** `app.css` en cache.
- Correctif `sw.js` : scripts, styles, svg et manifeste en **réseau d'abord** (`cache: "no-cache"`), cache seulement hors connexion ; polices et png restent en cache d'abord. À l'installation, `c.add(new Request(u, { cache: "reload" }))`.
- Garde-fou dans `visite.js` : si la feuille de style n'est pas appliquée (`.visite` pas en `position: fixed`), la visite ne s'ouvre pas et n'est pas marquée comme vue.
- Règle : toute nouvelle fonctionnalité qui ajoute du CSS profite maintenant de ce réseau d'abord ; continuer à incrémenter `VERSION`.

## 3 untricies. Visite guidée de la première connexion (10 oct.)

- **Demande de l'utilisateur** : un module d'aide qui montre étape par étape les rubriques à la première connexion. Choix (questions cliquables) : visite guidée (bulles), après le premier pas, bouton « Aide » pour la revoir, français avec vouvoiement.
- **Réponse donnée** : les modifications de code valent pour tous les utilisateurs ; les données (taux choisis, profil) restent propres à chaque compte ; l'Administration n'est visible que par l'admin.
- `public/espace/js/visite.js` (`window.OrbiteVisite`) : 12 étapes, à savoir bienvenue, `.scene`, capacité (ou encart date de naissance), puis Profil, Salaire, Épargne, Crédit, Vie & impôts, Assistant, Simulations, Paramètres et enfin le bouton « ? ».
  - Cible : premier sélecteur visible (barre latérale, sinon onglets du bas) ; sans cible, bulle centrée (téléphone).
  - Halo (box-shadow géant) + bulle `role=dialog`, focus gardé, flèches/Échap, « Passer », points de progression. Mouvement réduit respecté.
- Démarrage : événement `orbite:premier-pas` (émis par le formulaire du premier pas dans `vue-orbite.js`), 1,2 s après, si `user_metadata.orbite_visite` est absent. À la fin (ou en passant), `orbite_visite` = date ISO via `E.compte.preferences`.
- Revoir : bouton `#aide-visite` (« ? ») dans la barre du haut et `#param-visite` dans Paramètres → Préférences.
- e2e : étape visite (12 étapes, clavier, marquage du compte, relance par « ? », Échap) et contrôle sur téléphone (bulle dans l'écran). 30/30.

## 3 tricies. Taux du futur crédit auto modifiable aussi (10 oct.)

- Remarque de l'utilisateur : « Ils sont tous modifiables logiquement ». Les trois taux (immobilier, auto, consommation) sont désormais modifiables dans le panneau « Taux de vos futurs crédits ».
- Profil : `tauxAutoPct`. `tauxChoisiOuCredit(p, type, choisi, marché)` sert à l'auto (TMM + 3) et à la conso (TMM + 3,5). Champs `#cap-taux-auto-pct` / `#cap-taux-auto-reset`.
- L'immobilier sur 25 ans utilise le même taux que l'immobilier.

## 3 novovicies. Taux du futur crédit à la consommation modifiable (10 oct.)

- **Question de l'utilisateur** : pourquoi la capacité conso est calculée à 11 % ? Réponse : 11 % était un taux de marché fixe, utilisé faute de crédit de type « Consommation » dans le profil (son crédit mariage à 2 % est saisi en type « Autre »).
- Choix (question cliquable) : « Taux modifiable ».
- Profil : `tauxConsoPct` (null = automatique, borné 0–30). `OC.tauxNouveaux(p).conso` = choisi, sinon crédit conso en cours, sinon **TMM + 3,5** (11 % aujourd'hui, suit le TMM). `TAUX_MARCHE` conso/autre aussi en TMM + 3,5.
- Mon orbite, calendrier de la marge : champ `#cap-taux-conso` + aide + « Revenir au taux automatique » (`#cap-taux-conso-auto`), comme pour l'immobilier.
- Le préréglage du module Crédit reste en taux fixe 11 % (`credit.js`) : l'utilisateur ne voulait pas de « TMM + marge » par défaut. Un taux choisi passe au module via `tauxProfil`.

## 3 octovicies. Admin : fiches individuelles avec consentement explicite (10 oct.)

- **Demande de l'utilisateur** : voir, en tant qu'admin, les données de ceux qui se connectent. Choix (question cliquable) : « Données individuelles avec consentement ».
- **Migration `0009_partage_admin.sql`** (appliquée sur Supabase) :
  - tables `partage_admin(user_id, accorde_le, version)` et `admin_consultations(admin_id, user_id, consulte_le)`, RLS activée sans politique : accès seulement par fonctions ;
  - `partage_admin_etat()` et `partage_admin_definir(p_accord)` pour l'utilisateur ;
  - `admin_fiches()` (liste des consentants) et `admin_fiche(p_user)` (profil `user_metadata.orbite`, refusée sans accord, consultation journalisée), gardées par `exiger_admin()`.
- **Client** : `E.partage.etat/definir`, `E.admin.fiches/fiche` (`session.js`).
  - Paramètres → Vos données : interrupteur `#partage-admin` (désactivé par défaut), état `#partage-etat` (date d'accord, nombre et date des consultations).
  - Administration : bloc « Fiches partagées » (`#admin-fiches`, `#admin-fiche`), calculs (âge, salaire brut/net, capacité) faits dans le navigateur avec `OrbiteCalcul.synthese`.
- Page Confidentialité mise à jour. Rappel à l'utilisateur : la déclaration à l'INPDP lui revient.
- e2e : nouvelle étape (accord, fiche, journal, retrait). 28/28.

## 3 septvicies. Profil : nom et prénom, date de naissance obligatoire, date d'embauche (10 oct.)

- **Demande de l'utilisateur** : date de naissance complète au lieu de l'année, date d'embauche au lieu du nombre d'années d'ancienneté, nom et prénom séparés. Choix (question cliquable) : « Date de naissance obligatoire ».
- **Profil** (`orbite-calcul.js`) : champs `nom`, `dateNaissance`, `dateEmbauche` (AAAA-MM-JJ, contrôlés par `dateIso` : naissance entre 1930 et il y a 16 ans, embauche entre 1960 et aujourd'hui).
  - `anneeNaissance` et `anciennete` sont **déduites** des dates quand elles existent (les anciens profils gardent leurs valeurs).
  - `O.age(p, date)` est exact au jour près avec `dateNaissance`.
- **Obligatoire** : `app.js/recalculer()` pose la classe `sans-naissance` sur `body` tant que la date manque.
  - CSS : `[data-requiert-naissance]` (capacité `#capacite`, `#cap-paliers`) masqué ; `.requiert-naissance` (encart avec lien `#profil?section=identite`) affiché, dans Mon orbite et dans l'éligibilité du Crédit.
  - Le badge « À compléter » reste visible tant que la date manque.
- **Nom affiché** : `nomAffiche()` = prénom + nom du profil (sinon nom Google) dans la barre latérale ; la salutation garde le prénom.
- Tests : 2 tests unitaires (âge, ancienneté, dates invalides) ; e2e : l'encart s'affiche sans date, puis nom, dates et « Aziz Jaouadi » vérifiés. 319 tests, e2e 27/27.

## 3 sexvicies. Valeurs d'ouverture, hausse de salaire (10 oct.)

- **Crédit** : à l'ouverture, le montant est la capacité réelle sur `baseBanque` (brut ou net), arrondie au millier (31 000 DT pour l'utilisateur).
  - Si la capacité est nulle, on prend le premier montant du calendrier de la marge ; sans profil, l'exemple de 150 000 DT.
  - Avant, le module lisait toujours la capacité sur le net et retombait sur 150 000 DT.
- **Épargne** : à l'ouverture, ce sont les versements mensuels réels des contrats, avec `ui.inclure = false` pour ne pas les compter deux fois.
  - Le bouton `#ep-suggestion` propose « ≈ 10 % du net en plus de vos contrats » et remet `inclure`.
  - Sans contrat, la suggestion équilibrée est utilisée directement.
- **Hausse de salaire** (simulateur et Orbite) : bornes 5 000 DT brut, 50 % du brut et 3 500 DT net. Libellé « % du brut ».

## 3 quinvicies. Optimiseur fiscal : paie d'ici le 31 décembre ou déclaration annuelle (10 oct.)

- **Remarque de l'utilisateur** : l'économie affichée (8 682 DT) dépassait l'impôt qui reste à retenir sur ses paies d'ici décembre. Son employeur prend en compte l'attestation assurance vie / CEA, et il est prêt à faire la déclaration annuelle.
- **Analyse retenue** : la déduction porte sur le revenu annuel. L'économie annuelle reste juste en droit, mais elle se découpe en deux :
  - **ce que la paie rend d'ici le 31/12**, plafonné par l'impôt restant à retenir ;
  - **le reste via la déclaration annuelle**, sous forme de restitution.
- **Profil** : `calendrierPrimes`, 12 nombres (janvier → décembre), pas de 0,5. Vide : tous les versements supplémentaires en décembre (`OC.calendrierPrimes`). L'éditeur (12 cases) s'affiche dans Mon profil au-delà de 12 salaires, avec un contrôle du total.
  - Pour l'utilisateur : mars 1, juin 1, septembre 1,5, décembre 1,5.
- `salaire()` expose `impotMois` (IRPP + CSS d'un mois habituel) et `impotParVersement` (supplément d'impôt de l'année ÷ versements supplémentaires).
- `OC.impotRestantAnnee(sy, date)` additionne les mois habituels restants (mois en cours compris, paie de fin de mois) et les primes prévues à partir du mois en cours.
  - Au 9 oct. : 3 × 844,5 + 1,5 × 1 355,1 ≈ 4 566 DT, soit ≈ 4 443 DT net de l'avantage des contrats déjà pris en compte.
- `optimiseurFiscal` :
  - `paie = { impotRestant, recuperable, declaration, moisRestants, primesRestantes }` ;
  - `optimalPaie = { av, cea, total, gain }` : le plus petit complément qui fait tout revenir sur les paies (dichotomie). Pour l'utilisateur : 11 900 DT en CEA → 4 442 DT.
- **Affichage (Vie & impôts)** :
  - deux cases, « Sur vos paies d'ici le 31 décembre » et « Via la déclaration annuelle » ;
  - le versement optimal paie, avec un bouton « Utiliser ce montant » ;
  - le résultat du montant saisi, découpé de la même façon.
- L'Assistant (intégré et en ligne) reprend cette découpe.
- **Lien « Simuler ce versement dans Épargne vie & CEA »** (10 oct.) :
  - **Avant** :
    - champ vide : le lien gardait une valeur périmée (10 DT par mois) ;
    - montant rempli : il convertissait le versement en mensualités d'assurance vie sur 15 ans, et le CEA était perdu.
  - **Maintenant** : versement ponctuel `#epargne?av=…&cea=…` avec la répartition de l'optimiseur.
    - Le module Épargne passe en mode « av », « cea » ou « ac » (les deux), met `initialAv` / `initialCea` et remet les mensualités à 0.
    - Champ vide : versement « optimal paie », sinon le complément.
    - Ancien paramètre `?versement=` (mensuel AV) conservé.
  - Libellés : « Montant optimal en assurance vie seule », barème « Loi de finances 2025 (en vigueur en 2026) ».
- **Tests** : 317 unitaires, e2e 27/27.

## 3 quatervicies. Salaire : répartition annuelle, coût employeur, autres charges (10 oct.)

- **Règle de l'utilisateur : toujours poser les questions avec des réponses à choix multiples cliquables (outil AskUserQuestion), et expliquer son point de vue avant toute modification.**
- Cas réel de l'utilisateur, d'après ses fiches de paie : 4 000 DT brut × 17, chef de famille sans enfant, CNSS. L'IRPP est plus élevé les mois de prime. Son employeur paie aussi une assurance groupe et une retraite complémentaire.
- Correctifs, identiques dans le simulateur (portail-rh#11) et dans Orbite (moteur commun `public/moteurs/salaire/calcul.js` et `etat.js`, copiés du simulateur) :
  - **« Sur 100 dinars »** sur l'année réelle (24,43 DT d'impôt, taux marginal 38 %). Avant, elle portait sur un mois habituel calculé comme une année de 12 salaires (≈ 21 DT, 36 %).
  - **Mois de prime** : impôt par versement (1 355 DT) affiché à côté de celui d'un mois habituel (845 DT).
  - **Coût employeur** :
    - total d'une fiche habituelle (4 822,8 DT) ;
    - coût annuel (81 987,6 DT), moyenne mensuelle et charges patronales ;
    - répartition annuelle en « DT par an ».
    - Avant, le « par mois » valait annuel ÷ 12.
  - **Autres charges de l'entreprise** : `autresChargesPct` (% du brut) et `autresChargesMontant` (DT par mois × 12), ligne `code: "autres"`. Elles sont classées dans « caisse + protection complémentaire » (`rep.caisse.dontComplementaire`). Lien de partage : `acp`, `acm`.
- Charges légales inchangées : 16,57 % + 0,5 % + AT 0,5 % (par défaut) + TFP 2 % + FOPROLOS 1 % = 20,57 %.
- Tests : simulateur 52, Orbite 316 unitaires, e2e 27/27.

## 3 tervicies. Partage LinkedIn (9 oct.)

- Balises Open Graph et Twitter dans `public/index.html` (canonical, og:title, og:description, og:image et ses dimensions, og:image:alt, twitter:card summary_large_image).
- Image de partage : `public/orbite/og-orbite.jpg` (1200×627, JPEG). Elle est générée par `poster()` dans `promo/video/scene.html` (`node og.js`), avec les mêmes captures que la vidéo.
- `robots.txt` autorise explicitement `/orbite/`.
- **Le Post Inspector ne joint pas l'adresse workers.dev** (« Unable to connect to server. Bad DNS, bad gateway », 9 oct.). Lien à partager sur LinkedIn : **https://mohamed-ja.github.io/portail-rh/orbite/**. C'est une page de partage (dépôt portail-rh, `orbite/index.html` + `og-orbite.jpg`, PR portail-rh#10) avec toutes les balises d'aperçu ; elle redirige le visiteur vers l'application en JavaScript. og:url pointe sur elle-même, pour que LinkedIn ne retourne pas sur workers.dev. À plus long terme, un nom de domaine personnalisé sur le Worker réglerait le problème à la racine.
- Vérification : LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/) sur l'adresse du site ; il force aussi LinkedIn à rafraîchir son cache.
- Vidéo LinkedIn/YouTube (16:9) régénérée :
  - darija adressée à l'utilisateur (« Ey, etnajjem ! », « ki yekmel ») ;
  - liens « Abonnement » et « Administration » masqués dans la capture.
- Article LinkedIn : `promo/linkedin/article.md`.

## 3 duovicies. Assistant intégré, sans clé d'IA (9 oct.)

- **Problème** : sans le secret `ANTHROPIC_API_KEY`, la fonction `assistant` répond `code: "bientot"` et l'utilisateur voyait « L'Assistant Orbite arrive très bientôt ».
- **Solution** : `public/espace/js/assistant-local.js` (UMD pur, testé sous Node) : `AssistantLocal.repondre(question, sy)` → `{ texte, lien }`.
  - Il reconnaît des intentions en français et en darija : auto, immo, conso, crédit, impôt, épargne, salaire, score, budget, endettement, événements de vie. Il répond dans la langue de la question.
  - Il comprend une année (« en 2027 », « fi 2032 ») : il prend la dernière étape du calendrier de la marge atteinte cette année-là.
  - Il comprend « après la fin de mon crédit auto » (« ba3d ma nkammel crédit el karhba ») : il prend l'étape où ce crédit se termine. Le premier bien cité est l'objet de l'achat.
  - Chiffres pris de `synthese`, `optimiseurFiscal` et `scoreSante` (aucune règle dupliquée), avec un lien vers la bonne vue (`#credit?mensualite=`, `#vie?onglet=fiscal`, etc.).
- Lien « Simuler ce crédit » (9 oct.) : il transmet tout le crédit (`#credit?type=&capital=&mois=&taux=&mensualite=`), comme le calendrier. Avant, seule la mensualité passait : le simulateur ouvrait l'immobilier par défaut (150 000 DT, TMM + 2,5 = 10 %).
- Simulateur crédit : `tauxProfil(type)` (module-credit.js) fait qu'un nouveau scénario ou un changement de type prend le taux personnel du profil, en taux fixe. Ce taux est le taux immobilier choisi, ou le taux d'un crédit en cours du même type, via `OC.tauxNouveaux`. Sinon, le préréglage du marché s'applique (immobilier en TMM + marge).
- **Dans `vue-assistant.js`** :
  - sur `code: "bientot"`, l'Assistant passe en mode intégré pour toute la session, sans plus appeler le serveur ;
  - sur une erreur réseau ou 5xx, réponse intégrée pour cette question seulement ;
  - hors connexion, réponse intégrée directement ;
  - la note devient « Réponses calculées sur votre appareil… ».
  - Les codes `abonnement`, `quota` et `invalide` gardent leur message.
- Dès que le secret `ANTHROPIC_API_KEY` est ajouté dans Supabase (Edge Functions → Secrets), l'IA en ligne reprend la main automatiquement.
- Service worker : VERSION `orbite-2026-10-09b`. Confidentialité mise à jour.
- **Tests** : unitaires 314 (dont `tests/assistant/local.test.js`, sur le profil réel de l'utilisateur) ; e2e 27/27, nouvelle étape « assistant intégré » (faux Supabase : `assistantSansCle(true)`).

## 3 unvicies. Vidéo promotionnelle (9 oct.)

- **Livrables** : `orbite-promo-9x16.mp4` (1080×1920, Reels/TikTok/Shorts/Stories) et `orbite-promo-16x9.mp4` (1920×1080, YouTube/LinkedIn/site), 30 s, 60 i/s, H.264 + AAC, son à −14 LUFS. Les MP4 ne sont pas dans le dépôt (trop lourds) : ils ont été envoyés à l'utilisateur.
- **Sources** dans `promo/video/` (régénérables, sans secret) :
  - `captures.js` : captures réelles de l'app avec un profil de démonstration « Aziz » (3 200 DT brut × 13, marié, 1 enfant) via le faux Supabase ;
  - `scene.html` : toute l'animation sur un canevas, `render(t)` déterministe (aucune animation CSS), mises en page portrait et paysage, polices de la marque ;
  - `rendu.js` : 4 onglets Chromium en parallèle → JPEG → ffmpeg (`node rendu.js v|h all 60 sortie.mp4`, ou `preview t1 t2…` pour des aperçus) ;
  - `musique.py` : bande-son composée par code (numpy, 120 BPM, la mineur, Am–F–C–G) : impacts sur chaque mot de l'accroche, drop à 4 s, cassure à 24 s, second drop à 27 s, souffles à chaque coupe.
- **Script** (10 scènes calées sur les mesures) : accroche « Votre salaire. Vos crédits. Votre épargne. Votre impôt. → Tout est lié. » ; logo ; brut → net (2 293 DT) ; calendrier de la marge (avril 2029, 1 387 DT/mois) ; score 85 ; simulateur de vie + optimiseur fiscal (jusqu'à 4 376 DT) ; Assistant en darija ; couple, hors connexion, rappels, installable ; « Et ce n'est que le début. De nouvelles options avancées arrivent au fur et à mesure. » ; CTA « Découvrez Orbite », « Disponible maintenant, sur mobile et sur ordinateur », adresse, « Powered by Mohamed Aziz Jaouadi ».
- **Règle de l'utilisateur (9 oct.) : aucune mention de paiement dans la promo** (ni essai gratuit, ni durée d'essai, ni prix, ni offre de lancement, ni « mois offert » du parrainage), pour ne pas décourager. La tuile Parrainage a été remplacée par « Installable ».
- Zones sûres Instagram respectées (rien d'important au-dessus de 150 px, sous 1620 px, ni à droite entre 1100 et 1750 px).

## 4. Prochaines actions (améliorations possibles, rien de bloquant)

1. Vérifier le site en ligne après chaque déploiement (Cloudflare se déploie depuis `main`).
2. Idées de valeur ajoutée :
   - ~~historique du net (évolution du salaire)~~ : base faite (3 duoquadragies) ; courbe et inflation au lot 3 ;
   - ~~alertes sur la date de la réduction de taux de crédit~~ : fait (règle des 8 %, rappels `reduction-*`) ;
   - comparaison de banques sur le brut ;
   - mode « simulation de vie » (mariage, enfant, achat) qui met tout le profil à jour d'un coup.
4. `docs/MISE-EN-LIGNE.md` et `docs/SECURITE.md` parlent encore des « outils » : à mettre à jour un jour.
5. **En attente côté utilisateur (11 oct.)** :
   - passer en privé les dépôts espace-finances-tn, simulateur-credit, simulateur-assurance-vie, simulateur-Assurance-Automobile (pas portail-rh : GitHub Pages) puis vérifier que Cloudflare déploie toujours ;
   - ~~corriger son crédit immobilier dans le profil~~ : **fait le 13 oct.** (à sa demande, d'après la feuille « tableau d'amortissement 15 ans » de son fichier Excel personnel, non versionné) : mensualité 765,003 DT depuis mars 2026 (taux 2,25 %, règle des 8 %), début février 2023, 191 mois, dernière échéance janvier 2039 ; capital restant et échéances restantes déjà justes ;
   - renseigner « Début de carrière » (et années sans cotisation) dans Mon profil › Votre salaire, pour l'onglet Retraite ;
   - ~~coller dans le SQL Editor les `revoke` des fonctions de rappels~~ : **fait par l'utilisateur le 11 oct.** Vérifié : fonctions serveur exécutables par `service_role` seulement ; fonctions utilisateur refusées à `anon` ; liens par jeton ouverts à `anon` (voulu) ; tables : aucune écriture pour `authenticated`, aucune lecture pour `anon` ; envoi quotidien toujours 200 ;
   - nom de domaine : **écarté (payant)**. Pistes gratuites seulement : renommer le sous-domaine `workers.dev` (gratuit) ; domaine gratuit `eu.org` (validation lente, permettrait aussi d'authentifier l'expéditeur Brevo) ; sinon garder l'existant (emails déjà reçus en boîte de réception) ;
   - facultatif : vérifier l'article 56 de la LF 2026 au JORT (abattement des pensions).
   - **guide de sa fiche de paie (13 oct.)** : étapes 1 à 3 faites (profil, autres lignes, impôt aligné → net 2 645,392) ; étape 4 donnée : ajouter le crédit mariage (prêt exceptionnel retenu sur la paie, 497,930 DT par mois) dans **Mon profil › Crédits et épargne** seulement, **pas** dans les « retenues sur le net » (sinon compté deux fois). Ses chiffres réels restent dans son compte, jamais dans le dépôt.
   - ~~connexion Google refusée pour un autre compte (11 oct.)~~ : **résolu tout seul**. La femme de l'utilisateur a vu « Accès bloqué : erreur d'autorisation, Erreur 400 : invalid_request » sur accounts.google.com (Android, Chrome) à 17 h 13 ; journaux Supabase : cette tentative s'est arrêtée chez Google (aucun retour `/callback`), puis la suivante, même adresse IP, à 17 h 16, a réussi (`user_signedup`, fournisseur google, 17 h 17). Rien à corriger dans Orbite (appel `signInWithOAuth` standard, d'autres comptes passent). Si cela revient : ouvrir le lien directement dans Chrome (pas depuis Messenger / Facebook), réessayer, ou créer le compte par email + mot de passe ; lire « détails de l'erreur » pour la cause exacte.

## 5. Pièges connus

- **Script chargé avant ses dépendances et `orbite:pret`** (corrigé le 12 oct.) : entre deux balises `<script>`, le navigateur exécute d'autres tâches ; la session peut donc être prête (`Orbite.pret`, événement `orbite:pret`) avant qu'un script plus bas ne s'abonne, ou avant qu'un module dont il dépend ne soit chargé. Toujours écrire `if (O.pret) demarrer(); else doc.addEventListener("orbite:pret", demarrer, { once: true });`, et si une dépendance chargée plus loin manque encore, attendre `DOMContentLoaded` au lieu d'abandonner (`tmm.js` dépend de `projets.js`). Un formulaire doit être relié dès le chargement (sinon le navigateur l'envoie et recharge la page) et ne jamais écraser une valeur déjà saisie.

- **Déploiement Cloudflare (12 oct.)** : du 11 au 12 octobre, rien n'était en ligne. Le build de `main` échouait à l'étape « Deploying » : `npx wrangler deploy` recevait `504 Gateway Timeout` de l'API Cloudflare, un incident côté Cloudflare. Un simple **« Retry build »** dans le tableau de bord (Workers & Pages › espace-finances-tn › Deployments) a suffi. Après chaque fusion, il faut demander à l'utilisateur si le build est vert : je n'ai pas accès au site en ligne. Les builds des branches de PR échouent en 0 s, sans conséquence pour la production (`preview_urls: false`). Pour vérifier : `/espace/js/palette.js` doit répondre, pas la page 404.
- Thème sombre : `:root[data-theme="dark"] .bascule__pastille` (spécificité 0,3,0) écrase les règles locales à deux classes. Sur l'accueil, la pastille blanche de l'aperçu devenait foncée avec un texte foncé : c'était illisible (corrigé le 8 oct.). axe ne l'avait pas détecté, car la pastille est un élément superposé. Vérification : le script `bascules.js` (bloc-notes) calcule le contraste de chaque option sélectionnée en clair et en sombre ; attention, `color-mix` renvoie `color(srgb …)` avec des valeurs entre 0 et 1.

- Responsive : le script `resp.js` (dans le bloc-notes de la session) vérifie 7 largeurs (320 à 1920) × 7 vues. Les budgets passent par des requêtes de conteneur (`.budget`, `.cr-resultat`, `.cr-groupe`). Toujours mettre `minmax(0, 1fr)` sur les grilles d'une seule colonne qui contiennent du texte ou des boutons longs.

- Lancer l'e2e : `CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NODE_PATH=/home/user/portail-rh/node_modules node e2e/parcours.js`.

- Les sous-agents s'arrêtent à la limite d'utilisation : toujours vérifier les fichiers partiels avant de relancer.
- E2e et demande de partage (12 oct.) : un compte qui a déjà un profil voit `#dlg-partage` au lancement suivant (après « Quoi de neuf »). Un nouveau compte de test avec profil doit soit répondre à la fenêtre, soit porter `orbite_partage_demande` dans ses métadonnées. Le compte admin n'est jamais interrogé.
- Audit de lisibilité : `CHROMIUM=… NODE_PATH=/home/user/portail-rh/node_modules PLAYWRIGHT_CORE=/home/user/portail-rh/node_modules/playwright-core node e2e/lisibilite.js` (options `VUES=`, `JSON=`, `CAPTURES_LISIBILITE=`). Les onglets et bascules à pastille glissante sont classés « incertains » (le fond réel est un élément frère) : les vérifier avec `bascules.js` ou à l'œil.
- Les captures pleine page Playwright décalent les éléments `sticky` : vérifier aussi la capture de la fenêtre.
- Les boutons radio des `.bascule` sont invisibles : en test, cliquer le `label`, ou utiliser `check(..., {force:true})`.
- Le faux Supabase (`e2e/faux-supabase.js`) gère `updateUser({data})`, donc les métadonnées.
- Grille CSS : mettre `minmax(0,1fr)` sur `.champ`, sinon les grands champs débordent sur mobile.
- Listes déroulantes (9 oct.) :
  - Avant, la flèche (`svg` frère du `select`) était hors du `select` : un clic dessus ne faisait rien.
  - Maintenant le `select` occupe tout le cadre `.saisie` (padding à droite de 44 px) et la flèche est posée en absolu par-dessus, avec `pointer-events: none`.
  - Le menu utilise `appearance: base-select` (Chrome/Edge 135+) : carte arrondie, ombre, option choisie en bleu avec ✓, animation d'ouverture, flèche qui pivote (`:open`).
  - Les autres navigateurs gardent le menu natif. Tout est dans `orbite.css`, aucun JavaScript.
- Réglages : `.reglage__controle` doit garder `align-content: start`. Sinon la grille étire le contrôle à la hauteur du texte de gauche, et une `.bascule` (dont la pastille est en `top/bottom: 4px`) devient un grand bloc vide. Le bug a été vu sur « Animations » le 8 oct.
- Crédit, scénarios (8 oct.) : un bouton corbeille `#cr-supprimer`, à côté de Dupliquer, supprime le scénario affiché. La touche Suppr fonctionne aussi sur un onglet. Le dernier scénario restant ne peut pas être supprimé. Un toast « Annuler » rétablit le scénario. Les lettres suivantes se décalent.
  Quand la colonne fait moins de 520 px (requête de conteneur sur `.cr-editeur__tete`), les actions passent sous les onglets, car les 3 onglets ne descendent pas sous ~304 px.
  Un clic sur un onglet redessine la liste : le focus est donc replacé sur l'onglet choisi.
- Base de calcul de la banque (8 oct.) : la bascule « Sur le net / Sur le brut » de « Ce que la banque peut vous prêter » enregistre maintenant `baseBanque` dans le profil. Avant, ce choix était temporaire et le profil restait sur le net, d'où les 1 484 DT affichés à l'utilisateur au lieu de 2 266.
  Contrôle de l'utilisateur : 4 000 × 17 ÷ 12 = 5 667 DT brut, × 40 % = 2 266,67 DT par mois ≈ 358 300 DT sur 20 ans à 4,5 % (test « calendrier sur le brut, 17 salaires »).
  Le calendrier cumule les mensualités libérées : mars 2032 893 DT, juin 2032 1 391 DT, février 2039 2 267 DT.
- Plafonds par type de crédit (8 oct.) :
  - Règle de l'utilisateur : hors immobilier, 7 ans au plus. `CREDITS_TYPES` auto et conso passent à 84 mois, ce qui touche aussi les cartes « ce que la banque peut vous prêter ».
  - `tauxNouveaux(p)` donne les taux par type :
    - immobilier : `tauxImmo` ;
    - auto : taux du crédit auto en cours, sinon TMM + 3 ;
    - conso : taux d'un crédit conso en cours, sinon 11 %.
  - Chaque étape du calendrier a `offres` (immo 240 mois, auto 84, conso 84), avec un lien « Simuler » par type qui transmet la mensualité.
  - Exemple sur le brut en février 2039 : immo 358 282 DT, auto 163 068 DT, conso 132 380 DT.
- Module Crédit, TMM (8 oct.) :
  - Un taux reçu par lien s'affiche toujours en taux fixe.
  - Passer de fixe à « TMM + marge » garde le taux : la marge peut être négative (−20 à 20, type `signe`), affichée « TMM 7,5 % − 3 points = 4,5 % ». Avant, la marge était bloquée à 0 et le taux sautait à 7,5 %, ce qui faisait baisser le capital cible.
  - Le décodeur de lien accepte `mg >= -tmm`.
  - `.cr-taux` est en `align-items: start` (les champs TMM et marge étaient décalés).

## 3 centsexquintricies. Liste « Verrouiller après » (16 oct.)

- Bug signalé : la liste du délai ne montrait qu'une valeur. Cause : le `<select>` était `disabled` interrupteur éteint, donc il ne s'ouvrait pas. Corrigé dans `verrou.js` (`rendreReglage` ne désactive plus la liste ; la valeur choisie est reprise à l'activation).
- e2e : la liste a 4 choix, est active avant l'activation, et le délai choisi (300 s) est conservé. SW `orbite-2026-10-16b`, nouveautés « 2026-10-16b ».

## 3 centseptquintricies. Paquet Android pour Google Play (16 oct.)

- **Protection serveur 0016 appliquée en production** par l'utilisateur (SQL Editor, « Success »), vérifiée : 9 politiques `mfa_aal2`, `mfa_ok()` présente, contrôle dans `exiger_admin`, `supprimer_mon_compte` et `partage_admin_definir`. La double authentification peut être activée.
- **Projet Android** `android/` (Trusted Web Activity, `@bubblewrap/core` 1.27, AGP 8.9.1, SDK 36, min 24) :
  - identifiant **`tn.orbite.app`**, version 1 / 1.0.0, portrait, repli Custom Tabs, raccourcis et partage de PDF repris du manifeste ;
  - généré depuis `public/` servi en local (le site n'est pas joignable depuis la session) : `android/generer.mjs` ;
  - notice : `android/LISEZMOI.md`.
- **Compilation** : `dl.google.com` est bloqué par le réseau de la session → workflow `.github/workflows/android.yml` (GitHub Actions) qui produit l'AAB et l'APK **non signés**, et joint `apksigner.jar` et `zipalign`.
- **Clé d'envoi** `cle-envoi-orbite.jks` (RSA 3072, alias `orbite`) créée hors du dépôt, gardée dans le bloc-notes de la session (éphémère) ; envoyée à l'utilisateur seulement s'il la demande. **Jamais dans le dépôt** (`*.jks` ignoré) ni dans les secrets GitHub. Avec la « Signature d'application par Google Play », une clé d'envoi perdue se réinitialise depuis la Play Console.
- **Compilation ↔ signature** : l'hôte des artefacts GitHub (`blob.core.windows.net`) est bloqué aussi → le workflow pousse les paquets non signés et `apksigner`/`zipalign` sur la branche **`android-sortie`** (réécrite à chaque compilation), récupérée avec `git fetch` ; signature locale : `jarsigner` (AAB) et `apksigner` (APK, schéma v3). Empreinte vérifiée `0da8ea66…b0fe08`.
- **Livré à l'utilisateur** : `orbite.aab` (Google Play) et `orbite.apk` (installation directe pour essayer).
- **`public/.well-known/assetlinks.json`** : empreinte de la clé d'envoi `0D:A8:EA:66:…:FE:08`. **À compléter** avec l'empreinte de la clé de signature Google Play après le premier envoi.

## 3 centoctoquintricies. Mes comptes : soldes datés et analyse refaite (16 oct.)

Idée de l'utilisateur : le solde bancaire dans Orbite, pour voir sa santé financière, ses points forts et faibles, avec une analyse refaite à chaque changement. **Choix (AskUserQuestion)** : saisie + relevé ; plusieurs comptes ; gardé dans le compte Orbite ; l'épargne disponible suit automatiquement. Maquette `mq8` validée (3 écrans).
- **Moteur** `public/espace/js/comptes-calcul.js` (`ComptesCalcul`, fonctions pures, `tests/espace/comptes.test.js`) :
  - `profil.comptes = [{ id, nom, banque, type: courant|epargne, soldes: [{ d: AAAA-MM-JJ, v, src: saisie|releve }] }]` (8 comptes, 400 soldes chacun, un solde par jour) ; `profil.comptesAnalyse = { d, compte, soldeDu, avant, apres }` (score, réserve en mois, épargne disponible).
  - Branché dans `OrbiteCalcul.normaliser` (8ᵉ dépendance, comme `BudgetCalcul`) : sans ce module (pages publiques), les comptes ne sont pas gardés — ces pages n'enregistrent pas de profil.
  - **Épargne disponible** = comptes d'épargne en entier + comptes courants au-delà du « coussin » (dépenses du mois × jours jusqu'à la paie ÷ 30) ; un découvert est déduit. Écrite dans `profil.epargneDisponible` à chaque changement → score de santé, réserve, conseils refaits.
  - **Analyse** : courbe 90 jours (avant son premier solde, un compte compte pour celui-ci), point bas et découvert sur les **comptes courants seulement**, tendance 30/90 jours (seuil : 50 DT ou 5 % des dépenses), réserve (cible `OC.cibleReserve`), argent qui dort, soldes de plus de 35 jours.
- **Relevé** : `ReleveCalcul` rend aussi `ops.soldes` (propriété **non énumérable**, les tests existants restent identiques) : soldes **imprimés** par la banque (colonne Solde, lignes « Solde au … » avec date), un par jour (fin de journée, ordre ancien→récent ou l'inverse détecté). Les soldes recalculés ne sont pas repris.
- **Interface** `vue-comptes.js`, `comptes.css` : 3ᵉ onglet « Comptes » de Mon mois (indicateur sur 3 colonnes), état vide, total + tendance + courbe (`OrbiteGraphe`, total et comptes courants, point bas), liste (écart en DT depuis le solde précédent), fenêtre `#dlg-solde` (compte existant ou nouveau, solde négatif accepté, date ≤ aujourd'hui, aperçu « épargne disponible avant → après », relevé lu sur l'appareil avec soldes à cocher), fenêtre `#dlg-compte` (renommer, type, retirer des soldes, supprimer avec confirmation). Tout est annulable depuis le message. « Ce que dit votre solde » aussi dans **Mon orbite › Santé financière** (`#solde-orbite`). Icône `portefeuille` ajoutée à `icones.svg`. Palette : « Mes comptes ». Aide du champ « Épargne disponible » du profil : « Suit Mes comptes ».
- e2e « Mes comptes : … » (mouvement réduit émulé **après** l'affichage de la vue ; Mon orbite via `#orbite?partie=sante`). SW `orbite-2026-10-16c`, nouveautés « 2026-10-16c ».
- **Limite dite à l'utilisateur** : aucune banque tunisienne n'offre de connexion automatique gratuite ; le solde se met à jour par saisie ou relevé.

### Correction : le découvert ne bougeait pas le score (16 oct.)
- Cause : le score ne lit que l'épargne disponible, qui reste à zéro en cas de découvert (elle ne descend pas sous zéro). Sans épargne déclarée, le score était identique avec ou sans découvert.
- Choix de l'utilisateur (AskUserQuestion) : **−10 points**, ligne visible « Découvert bancaire » dans Santé financière, objectif « Régler le découvert ». Calcul dans `orbite-intelligence.js` (`scoreSante`, `malus`), affichage dans `vue-orbite.js`. Score plancher 0.
- Test unitaire ajouté. SW `orbite-2026-10-16d`, nouveautés « 2026-10-16d ».

### Correction : étiquettes des lignes verticales superposées (16 oct.)
- Signalé sur le graphique du patrimoine net : deux fins de crédit la même année (2032) écrivaient leurs étiquettes l'une sur l'autre.
- `orbite-graphe.js` : chaque étiquette de verticale est mesurée (`getComputedTextLength`) et placée sur la première rangée libre (16 px plus bas si elle chevauche) ; trop longue à droite, elle passe à gauche de sa ligne. `graphe.css` : contour de la couleur du fond (`paint-order: stroke`) pour rester lisible sur les tracés. Vaut pour tous les graphiques (patrimoine, épargne, progression…). SW `orbite-2026-10-16e`.

## 3 centnovemquintricies. Paiement Google Play et préparation de la publication (16 oct.)

Demande : « application fonctionnelle et prête à déployer sur Play Store », carte blanche. **Choix (AskUserQuestion)** : Google Play d'abord ; paiement **Google Play** dans l'application (règle de Google : pas de paiement externe dans l'appli), Konnect/Flouci/ClicToPay restent sur le site ; un abonnement acheté d'un côté vaut des deux.
- **Serveur** `supabase/functions/paiement/play.js` (pur, `tests/abonnement/play.test.js`) + action `play` dans `index.ts` : jeton d'achat vérifié chez Google (Google Play Developer API `purchases.products`, jeton d'accès OAuth par JWT RS256 signé avec WebCrypto), enregistré **une seule fois** (empreinte SHA-256 du jeton dans `reference_passerelle`, jamais le jeton), `activer_paiement`, puis **consommé** (produits consommables : chaque achat prolonge, comme les autres passerelles ; sans consommation Google rembourse au bout de 3 jours). Achat d'un autre compte → 409 ; en attente → `en_attente` ; secret absent → 503 « pas encore ouvert ». Une commande `play` n'est jamais vérifiée par une passerelle (`verifierEtActiver`).
- **Migration 0017** (appliquée en production) : passerelle `play` + index unique partiel `paiements_play_achat`. **Fonction `paiement` v7 déployée** (vérifiée par pg_net : démarre, 401 sans connexion).
- **Secret à poser par l'utilisateur** : `GOOGLE_PLAY_COMPTE_SERVICE` = JSON du compte de service Google (Supabase › Edge Functions › Secrets). Jamais dans le dépôt ni dans la conversation.
- **Produits** (Play Console, consommables) : `orbite_mensuel`, `orbite_semestriel`, `orbite_annuel` (mêmes clés côté client `play-achat.js` et serveur `play.js`).
- **Client** : `theme-init.js` reconnaît l'application (`?source=play`, retiré de l'adresse, ou referrer `android-app://tn.orbite.app`) → `sessionStorage ef-play` (pas localStorage : Chrome le partage avec l'appli) et `html[data-play="oui"]`. `public/espace/js/play-achat.js` (`OrbitePlay`, partie pure testée dans `tests/abonnement/play-client.test.js`) : prix Google (Digital Goods API `getDetails`), achat (Payment Request `https://play.google.com/billing`, `complete` success / unknown / fail **après** la réponse du serveur), reprise des achats non enregistrés à l'ouverture (`listPurchases`). `abonnement.js` en mode application : prix Google (réduction et mois offerts recalculés), pas de code promo du site, garantie et mention légale « Google Play », bouton « Payer avec Google Play », historique « Google Play » (colonne `passerelle` lue). Service indisponible → message seulement, aucun lien externe.
- **Android** : `features.playBilling` (bibliothèque `androidbrowserhelper:billing`, Play Billing Library **8.3.0** vérifiée dans l'AAB, `PaymentActivity`, `DigitalGoodsRequestHandler`), `startUrl /espace/?source=play`, `versionCode 2` / `1.0.1`, `minSdkVersion 24` désormais dans `generer.mjs`. AAB et APK recompilés (Actions), signés avec la clé d'envoi, livrés.
- **Page publique** `/suppression-compte` (URL exigée par Google) : étapes, données effacées (tout part en cascade avec `auth.users`), achats Google Play, cas « je ne peux plus me connecter ». Lien en pied d'accueil et dans la confidentialité ; `_headers`, `sitemap.xml`. CGV : paragraphe Google Play.
- **e2e** : « application Android (Google Play) … » (API Google simulées : reprise, achat, en attente, prix, adresse nettoyée), « site hors application … », « page publique de suppression de compte … ». Faux Supabase : action `play`.
- **Documents** (bloc-notes, pas dans le dépôt) : fiche Google Play complète (sécurité des données, accès pour l'examen, produits, fonctionnalités financières), guide en 12 étapes, message aux testeurs, capture n° 8 « Mes comptes ».
- SW `orbite-2026-10-16f`, nouveautés « 2026-10-16e ».
- **Après le premier envoi** : ajouter l'empreinte SHA-256 de la clé de signature Google Play dans `assetlinks.json`.

## 3 centdecemquintricies. Correction : les rappels de versement ne partaient jamais par e-mail (16 oct.)

- Cause : la fonction serveur `rappels-email` (`gabarit.js`, liste `TYPES`) ne connaissait pas le type « versement » écrit par `rappels-calcul.js` : `nettoyerPlan` l'écartait sans bruit. Le rappel du jour de versement d'épargne n'a donc jamais été envoyé (l'e-mail attendu le 15 oct. n'était pas un problème d'heure).
- Correction : `TYPES` contient « versement » (et « placement », pour les échéances du lot A) ; couleurs associées. Fonction **v5 déployée** et vérifiée (démarre, secrets présents).
- Test de non-régression `types` (`tests/espace/rappels-email.test.js`) : lit tous les `type: "…"` de `rappels-calcul.js` et vérifie que le serveur les accepte ; un profil avec jour de versement produit un rappel gardé et envoyé. Vérifié : le test échoue sur l'ancien code. Le test existant utilise désormais `G.TYPES` au lieu d'une liste recopiée.

## 3 centundecemquintricies. Lot A : Mon patrimoine (bourse, dépôts, immobilier et or, synthèse) (17 oct.)

Maquettes 360° validées (A1–A4, ordre A → B → C). Nouvelle rubrique **« Mon patrimoine »** (`#placements`, après Mon mois dans la barre latérale, icône `portefeuille`).
- **Moteur** `public/espace/js/placements-calcul.js` (`PlacementsCalcul`, pur, `tests/espace/placements.test.js`, profil fictif) :
  - `profil.placements = { titres [{id, nom, type, quantite, investi (total), cours, coursDu}], revenus [{d, v, lib}], taux [{id, nom, type: dat|bta|btct|cse|autre, banque, montant, tauxBrut, debut, fin}], biens [{id, nom, valeur, loyer (mensuel), charges (annuelles), credit (libellé du crédit relié)}], or [{id, nom, grammes, carats 9|18|21|22|24, prixAchat}], coursOr {g18, du}, inflation (null = INS) }`. Plafonds : 30 titres, 120 revenus, 20 placements, 8 biens, 12 lignes d'or.
  - Branché dans `OrbiteCalcul` (9ᵉ dépendance `PL`) et `DeciderCalcul` (3ᵉ `PL`) : `D.patrimoine` ajoute `immo-locatif`, `taux`, `bourse`, `or` (constants dans la projection) — **comptés une seule fois**.
  - `analyser(p, ctx)` : bourse (valeur, plus-value latente, répartition, dividendes de l'année et 12 mois, cours de plus de 7 jours, impôt si vente des actions), taux connu (intérêts nets, échéances, échus non comptés), immobilier (impôt au taux marginal, rendement net, crédit relié, effort mensuel), or (prix du gramme selon les carats = 18 carats × k / 18, plus-value sur les achats connus), synthèse (répartition avec liquidités et contrats d'épargne, revenus nets ÷ total placé comparés à l'inflation, points à surveiller).
  - `decisionEcheance` : à l'échéance, « renouveler » (intérêts nets) contre « rembourser le crédit le plus cher » (intérêts économisés la première année).
- **Règles fiscales (sources, affichées sous la vue)** :
  - Intérêts des dépôts et obligations : **retenue à la source de 20 %** (Code de l'IRPP).
  - Comptes spéciaux d'épargne : intérêts **déductibles jusqu'à 6 000 DT par an** (art. 39-II du Code de l'IRPP, décret-loi n° 2021-21 / LF 2022 ; plafond global 10 000 DT) ; au-delà, la part en trop subit la retenue.
  - Revenus fonciers : **déduction forfaitaire de 20 %** depuis la LF 2016 (note du ministère des Finances, OpenFisca Tunisie), puis barème de l'IRPP + CSS 0,5 %, calculés au **taux marginal** (`impotEnPlus` : impôt avec − impôt sans).
  - Actions cotées : plus-value imposée à **10 % au-delà d'un abattement annuel de 10 000 DT**.
  - Dividendes : retenue de 10 % non recalculée — l'utilisateur saisit le **net reçu**.
  - Inflation : `Progression.inflation(année)` (table INS), modifiable.
- **Interface** `vue-placements.js`, `placements.css` : 4 onglets (`.pa-onglets`, indicateur sur 4 colonnes, flèches du clavier, `#placements?onglet=`), états vides, une seule fenêtre `#dlg-placement` dont les champs dépendent de l'objet (titre, dividende, cours en lot, placement, bien avec liste des crédits, or, prix de l'or, inflation), aperçu en direct (intérêts nets, plus-value), alerte d'échéance à 30 jours avec la décision chiffrée, donut SVG (attributs de présentation, CSP respectée), tout annulable depuis le message. Sous-rubriques, palette Ctrl K « Mon patrimoine ».
- Pas de conseil de produit ni de banque (phrase affichée).
- e2e « Mon patrimoine : … ». SW `orbite-2026-10-17a`, nouveautés « 2026-10-17a ».
- À faire plus tard (optionnel) : rappels d'échéance (type « placement », déjà accepté par le serveur, textes sans montant).

## 3 centduodecemquintricies. Lot B : prévision 90 jours, factures, assurances, proches (17 oct.)

Maquettes B1 à B4 validées (16 oct.). Demande : « Construis le lot B, puis le lot C ».
- **Moteur** `public/espace/js/pilotage-calcul.js` (`PilotageCalcul`, pur, `tests/espace/pilotage.test.js`, profil fictif) ; branché dans `OrbiteCalcul` (10ᵉ dépendance `PI` : `profil.factures`, `profil.assurances`, `profil.proches`) et `DeciderCalcul` (4ᵉ `PI` : « Prêté aux proches » en actif, « Dû à des proches » en dette, constants dans la projection).
  - `factures [{ id, nom, cat, montant, periode 1|2|3|6|12, prochaine, historique [{d, v}], aRevoir, source saisie|releve, cle }]` (40 au plus) ; `analyserFactures` : prix fixe = dernier montant, factures qui varient (eau, électricité, gaz, syndic, ou périodes > 1 mois) = moyenne des 6 dernières ; hausse signalée pour les abonnements mensuels à prix fixe ; gain si arrêt (par an, et mois gagnés sur la réserve : `OI.reserve` → manque ÷ effort mensuel).
  - `detecterFactures(ops, existantes, credits)` : prélèvements regroupés par clé (2 premiers mots utiles du libellé), au moins 2 occurrences, écart médian → période (25–36 j, 54–70, 82–100, 165–200, 345–385), écarts réguliers (une ligne manquante tolérée), montants stables (écart-type ≤ 25 %, sauf eau/électricité/gaz), un paiement à moins de 60 % d'une période du précédent écarté (ligne en trop) puis période recalculée ; jamais les retraits, virements, frais, ni une mensualité de crédit du profil. Seule la liste finale est gardée (clé, nom, dates et montants des factures), jamais le relevé.
  - `assurances [{ id, type auto|habitation|sante|deces|prevoyance|autre, nom, assureur, prime (an), echeance, bien (id d'un bien de Mon patrimoine ou « logement »), credit (libellé), couverture %, paie }]` ; assurance vie lue depuis les contrats du module Épargne. Vérifications : bien loué sans habitation, logement (patrimoine) sans habitation, crédit actif sans décès-invalidité ou couvert < 100 %, famille (marié, enfants ou foyer) sans vie / prévoyance / décès, crédit auto sans assurance auto, échéance à 30 jours. Aucun assureur recommandé.
  - `proches [{ id, sens prete|emprunte, nom (≤ 20, sans chiffres), montant, mensualite, debut, echeance, note, recus [{d, v}] }]` ; échéancier mensuel ou en une fois, reste dû, retard, prochain remboursement.
  - `prevision(ctx)` : part du **dernier solde des comptes courants** (Mes comptes), jour par jour sur 90 jours : salaire (jour de paie), mensualités (jusqu'à la dernière), versement d'épargne, loyer et charges (moins eau/électricité/gaz/syndic déjà en factures), factures à leur date, assurances annuelles (hors retenue sur paie), remboursements des proches, dépenses de vie réparties chaque jour (`OC.depensesMois().vie` moins les forfaits et abonnements). Premier découvert : dates, minimum, cause (plus grosse facture/assurance/proche des 30 jours avant), « la veille du salaire », solution = virer `ceil50(−min + 50)` DT la veille, réserve restante en mois. Un solde ancien : les opérations depuis sont comptées, message pour en noter un nouveau.
- **Interface** `vue-pilotage.js`, `pilotage.css` : Mon mois gagne **Prévision** et **Factures** (5 onglets, `vue-mois.js` délègue à `OrbitePilotage.rendre`) ; Mon patrimoine gagne **Assurances** et **Proches** (6 onglets ; sur téléphone 2 rangées de 3, l'indicateur glisse aussi d'une rangée à l'autre ; les règles fiscales ne s'affichent pas sous ces deux onglets). Une fenêtre `#dlg-pilotage` (champs qui apparaissent selon le type : bien pour l'habitation, crédit et couverture pour décès-invalidité, premier remboursement si mensuel), interrupteur « À revoir », aperçus, tout annulable. Relevés lus sur l'appareil (CSV, PDF, photo ; plusieurs à la fois) ; l'import du budget (`releve-import.js`) envoie aussi ses opérations (événement `orbite:releve-lu`, en mémoire). Courbe `OrbiteGraphe` (zone sous zéro, salaires, point de découvert). Palette Ctrl K : 4 entrées.
- **Rappels** (`rappels-calcul.js`, test ajouté) : placement à taux connu 7 jours avant l'échéance (type `placement`), assurance 30 jours avant (type `assurance`, pas si retenue sur la paie), remboursement entre proches le jour prévu (type `proche`, visible 5 jours). Emails **sans montant ni prénom**. Fonction serveur `rappels-email` **v6 déployée** (types `assurance` et `proche` acceptés, vérifiée : démarre, 400 sur action inconnue).
- e2e « pilotage (lot B) : … ». SW `orbite-2026-10-17b`, nouveautés « 2026-10-17b ».

## 3 centtredecemquintricies. Lot C (1/2) : patrimoine 360°, liberté financière, coffre sur l'appareil (17 oct.)

Maquettes C1 à C3 validées (16 oct.). Le mode conseiller (C4) suit dans une PR séparée (« à construire en dernier »).
- **Moteur** `public/espace/js/ensemble-calcul.js` (`EnsembleCalcul`, pur, `tests/espace/ensemble.test.js`) ; branché dans `OrbiteCalcul` (11ᵉ dépendance `EC`) : `profil.patrimoineHisto [{ m: AAAA-MM, net, actifs, dettes, a: { clé: montant } }]` (36 mois) et `profil.liberte { rendementReel (2), tauxRetrait (4), epargneMois (null = estimée) }`.
- **C1 Patrimoine 360°** (Mon orbite › Patrimoine, `vue-patrimoine.js`, `decider.css`) : le bloc « Patrimoine net » est agrandi, pas doublé. Chaque ligne ouvre son module (`EC.lien`). **Un relevé par mois** gardé dans le profil quand il change (jamais pour un profil vierge, jamais de mois passé inventé). « Ce mois-ci » : écarts réels par famille depuis le relevé du mois précédent (dettes en moins, comptes et épargne, placements/or/bourse, immobilier, proches), sinon estimation (capital remboursé = mensualité − intérêts du mois, épargne versée). Pastille « ▲ +X DT ce mois-ci ». Courbe de l'historique dès 2 relevés ; la projection année par année reste.
- **C2 Liberté financière** (Ma progression › 4ᵉ onglet « Liberté », `vue-liberte.js`, `ensemble.css`) : objectif = dépenses d'un mois **sans crédits ni épargne** × 12 ÷ taux de retrait (4 % → 25 ans de dépenses) ; patrimoine qui rapporte = patrimoine net − logement occupé ; épargne par mois = versements des contrats + moitié de la marge libre (ou saisie) ; simulation mensuelle au rendement réel (2 % par an, dinars constants) jusqu'à 60 ans ; année et âge ; 3 leviers (−10 % de dépenses, +1 % de rendement, +200 DT par mois) en années gagnées, triés, avec « ne s'additionnent pas ». Hypothèses modifiables, annulables.
- **C3 Mon coffre** (`#coffre`, Mon espace, `coffre-calcul.js` testé sous Node avec WebCrypto, `vue-coffre.js`) : documents chiffrés **AES-GCM 256** avec une clé créée sur l'appareil, **non exportable**, gardée dans IndexedDB (`orbite-coffre-<id du compte>`) ; fiche (titre, thème, date) chiffrée elle aussi. Ouverture par l'empreinte si le verrouillage est activé (`OrbiteVerrou.verifier()`, nouvelle fonction : confirme l'empreinte sans verrouiller l'application), sinon lien vers Paramètres › Sécurité. Se referme après 5 minutes sans activité ou quand l'application passe en arrière-plan. 7 thèmes, thème deviné d'après le nom du fichier, date d'échéance cherchée dans le texte d'un PDF (`FicheLecture.lire(…, { texteSeul: true })`, sans lecture d'image), « À ne pas oublier » (dates à 90 jours, attestation de retenue de novembre à février). « Mettre Orbite à jour » (fiche de paie, crédit) passe par `OrbiteRecevoir.montrer`. **Sauvegarde** : fichier `.orbite` chiffré par mot de passe (PBKDF2-SHA-256, 310 000 itérations, 10 caractères mini, lettres et chiffres), restauration sans doublons ; mauvais mot de passe refusé. Limites : 15 Mo par document, 200 documents. Dit clairement : téléphone perdu sans sauvegarde = coffre perdu.
- Palette Ctrl K : « Mon coffre », « Liberté financière ». e2e « vue d'ensemble (lot C) : … ». SW `orbite-2026-10-17c`, nouveautés « 2026-10-17c ».

## 3 centquattuordecemquintricies. Lot C (2/2) : mode conseiller (17 oct.)

Maquette C4 validée (« à construire en dernier »), sur le modèle du partage avec l'administrateur (migration 0009).
- **Migration `0018_conseiller.sql`** : tables `conseillers` (rôle donné **par l'administrateur seulement**), `conseiller_invitations` (code de 10 caractères sans 0/O/1/I, usage unique, 7 jours, 20 en attente au plus), `partages_conseiller` (accord du client), `conseiller_consultations` (journal, une ligne par quart d'heure et par client). RLS activée, aucune lecture directe : tout passe par des fonctions SECURITY DEFINER. Toutes les fonctions du conseiller exigent une session **aal2** (double authentification, même sans autre règle : `exiger_conseiller`). Le client accepte/retire avec `mfa_ok()`. Le nom montré au conseiller est « Prénom N. », jamais l'e-mail.
- **Client** : Paramètres › Vos données › « Partager avec un conseiller » (code vérifié, nom du conseiller montré avant d'accepter, historique des consultations, retrait en deux gestes, effet immédiat).
- **Conseiller** : « Mes clients » (`#clients`, menu visible seulement avec le rôle) : sans aal2, message pour activer la double authentification ; cartes (patrimoine net, score de santé, alertes : découvert prévu, dépôt à échéance, assurance à renouveler, remboursement en retard), détails en lecture seule, **bilan PDF** créé sur l'appareil sans les coordonnées, invitation par code. Les calculs réutilisent les moteurs d'Orbite sur le profil du client sans jamais l'enregistrer (`OrbitePilotage.prevision(p, sy)` et `alertes(p, sy)` acceptent désormais un profil).
- **Administration** : panneau « Conseillers » (donner le rôle par adresse et nom affiché, retirer : coupe l'accès à tous ses clients).
- `conseiller.js`, styles dans `ensemble.css`, messages d'erreur dans `commun/modele.js`, appels dans `commun/session.js`. Faux Supabase : mêmes règles (aal2, code à usage unique). e2e « mode conseiller : … » (deux comptes, appareil 2FA du conseiller simulé). SW `orbite-2026-10-17d`, nouveautés « 2026-10-17d ».

## 3 centquindecemquintricies. Bilan de sécurité : revue Codex et corrections (22 oct.)

Revue externe (Codex, archive reçue le 22 oct., lue sans exécuter son script). Trois constats, tous vérifiés dans le code :
1. **Double authentification incomplète côté serveur** — *fondé*. Les fonctions `rappels_plan_enregistrer`, `rappels_mon_etat`, `rappels_reactiver` et les fonctions serveur `paiement`, `assistant`, `rappels-email` (confirmation) acceptaient une session « aal1 » (mot de passe seul) d'un compte protégé par un code.
2. **Abonnement vérifié dans le navigateur** — *fondé mais accepté*. Les calculs tournent sur l'appareil : bloquer le code dans le navigateur ne protège rien, et aucune donnée d'un autre compte n'est en jeu. Ce qui coûte (l'Assistant IA, les e-mails de rappel) est déjà vérifié par le serveur (`acces`). Risque accepté, à revoir seulement si un jour un calcul payant passe côté serveur.
3. **Profil financier dans les métadonnées du compte** — *le plus sérieux*. `user_metadata.orbite` (salaire, crédits, épargne, contacts…) était lisible avec une session aal1, voyageait dans chaque jeton de session et restait dans le navigateur avec la session.

Corrections (PR « Sécurité : profil financier protégé, double authentification partout ») :
- **Migration `0019_profil_protege.sql`** : table `public.profils_financiers (user_id, donnees jsonb ≤ 256 Ko, maj_le)` ; RLS « propriétaire » + règle restrictive `mfa_aal2` (`mfa_ok()`, comme 0016) ; aucun droit pour `anon`. **Reprise** : les profils des métadonnées sont copiés (`on conflict do nothing`), rien n'est effacé. Fonction interne `profil_de(uuid)` (table d'abord, métadonnées d'un compte pas encore repris à défaut ; fermée à `anon`/`authenticated`) utilisée par `nom_client`, `conseiller_clients`, `admin_fiche(s)`, `admin_contacts`, `rappels_destinataires`, `rappels_desinscrire/reabonner` (ces deux-là changent `rappelsEmail` dans la table et dans les métadonnées). `rappels_mon_etat/plan_enregistrer/reactiver` lèvent « Double authentification requise » (42501). `exporter_mes_donnees` ajoute `profil_financier`.
- **Fonctions serveur** : module `mfa.js` (copie identique dans `paiement/`, `assistant/`, `rappels-email/`, chaque fonction étant déployée seule) : `mfaManquante(jeton, utilisateur)` = un facteur vérifié et un jeton qui n'est pas aal2 → 403 `{ code: "mfa" }`. Le jeton a déjà été validé par `auth.getUser` ; on n'en lit que la charge utile.
- **Application** : `Espace.profilFinancier` (`commun/session.js`) : `lire(u)` → `{ donnees, source }` (table, métadonnées d'un ancien compte, copie locale hors connexion, `ancien` si la table n'existe pas encore) ; `enregistrer(u, donnees)` écrit dans la table puis **vide les métadonnées** (`orbite: null`). Un ancien compte est repris dès l'ouverture. Si la lecture échoue, aucun enregistrement n'écrase le profil du serveur (message « Profil momentanément illisible » + « Recharger »). Copie locale `ef-profil-<id>` effacée à la déconnexion et à la suppression du compte.
- **Tests** : `tests/assistant/mfa.test.js` (niveau du jeton, refus aal1 avec facteur, accepté sans facteur ou en aal2, trois copies identiques et branchées, contenu de 0019). e2e : profil enregistré dans la table et métadonnées vides ; ancien compte repris à l'ouverture ; `profils_financiers` refusé en aal1 et lisible en aal2 pour un compte protégé. Faux Supabase : table `profils_financiers` (mêmes règles), `faux.profil(email)` / `faux.profilEnTable(email)`.
- SW `orbite-2026-10-22a` ; notes « Quoi de neuf » inchangées (rien de visible).

**Ordre de mise en production** (à respecter) : 1) fusionner (Cloudflare met le site à jour ; sans la table, le nouveau client lit et écrit encore les métadonnées : source « ancien ») ; 2) appliquer 0019 **aussitôt** (la copie prend les profils à jour) ; 3) vérifier en transaction annulée (aal1 sans facteur → permis ; aal1 avec facteur → refusé ; aal2 → permis ; profils copiés ; conseils de sécurité Supabase) ; 4) déployer `paiement`, `assistant`, `rappels-email`. Ne pas appliquer 0019 avant la fusion : l'ancien client écrirait dans les métadonnées pendant que les fonctions serveur liraient une copie figée dans la table. Après 0019, le nouveau client trouve la table remplie et efface la copie des métadonnées dès l'ouverture.
**Fait le 22 oct. 2026** : PR fusionnée (886ca35) ; `0019` appliquée en production ; 8 profils copiés à l'identique ; fonctions `rappels-email` (v7), `assistant` (v7), `paiement` (v8) déployées et vérifiées (401 sans connexion, webhook et désinscription inchangés). Test en transaction annulée avec deux comptes fictifs : sans facteur + aal1 → permis ; facteur vérifié + aal1 → écriture, lecture et les 3 RPC de rappels refusées (« Double authentification requise ») ; facteur + aal2 → permis ; un compte ne lit ni n'écrit le profil d'un autre ; `anon` refusé. Aucun compte de test n'est resté. Conseils de sécurité Supabase : rien de nouveau (les 15 « RLS sans règle » sont les tables internes lues par fonctions seulement ; `pg_net` dans `public` et la protection contre les mots de passe divulgués restent à traiter à part).
**Reste à faire** : `0020_profil_hors_metadonnees.sql` (recopie puis efface `orbite` des métadonnées), **une à deux semaines après**, quand tous les appareils ont la version `orbite-2026-10-22a`. Vérifier avant : `select count(*) from auth.users where raw_user_meta_data ? 'orbite';`.
