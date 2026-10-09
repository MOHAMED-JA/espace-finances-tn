# MÉMOIRE — Orbite (feuille de route, décisions, état)

> Fichier à lire EN PREMIER à chaque reprise. Il évite de tout refaire et de tout re-réfléchir.
> Le mettre à jour à chaque étape terminée (section « État » et « Prochaines actions »).

## 1. Objectif (demandé par l'utilisateur)

Une **seule application** (« Orbite », dépôt privé `MOHAMED-JA/espace-finances-tn`) qui réunit **toutes** les
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
- fusionner soi-même (PR puis merge) ;
- carte blanche sur les dépôts ;
- sécurité élevée : dépôt privé, CSP stricte, RLS.

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

## 4. Prochaines actions (améliorations possibles, rien de bloquant)

1. Vérifier le site en ligne après chaque déploiement (Cloudflare se déploie depuis `main`).
2. Idées de valeur ajoutée :
   - historique du net (évolution du salaire) ;
   - alertes sur la date de la réduction de taux de crédit ;
   - comparaison de banques sur le brut ;
   - mode « simulation de vie » (mariage, enfant, achat) qui met tout le profil à jour d'un coup.
4. `docs/MISE-EN-LIGNE.md` et `docs/SECURITE.md` parlent encore des « outils » : à mettre à jour un jour.

## 5. Pièges connus

- Thème sombre : `:root[data-theme="dark"] .bascule__pastille` (spécificité 0,3,0) écrase les règles locales à deux classes. Sur l'accueil, la pastille blanche de l'aperçu devenait foncée avec un texte foncé : c'était illisible (corrigé le 8 oct.). axe ne l'avait pas détecté, car la pastille est un élément superposé. Vérification : le script `bascules.js` (bloc-notes) calcule le contraste de chaque option sélectionnée en clair et en sombre ; attention, `color-mix` renvoie `color(srgb …)` avec des valeurs entre 0 et 1.

- Responsive : le script `resp.js` (dans le bloc-notes de la session) vérifie 7 largeurs (320 à 1920) × 7 vues. Les budgets passent par des requêtes de conteneur (`.budget`, `.cr-resultat`, `.cr-groupe`). Toujours mettre `minmax(0, 1fr)` sur les grilles d'une seule colonne qui contiennent du texte ou des boutons longs.

- Lancer l'e2e : `CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NODE_PATH=/home/user/portail-rh/node_modules node e2e/parcours.js`.

- Les sous-agents s'arrêtent à la limite d'utilisation : toujours vérifier les fichiers partiels avant de relancer.
- Les captures pleine page Playwright décalent les éléments `sticky` : vérifier aussi la capture de la fenêtre.
- Les boutons radio des `.bascule` sont invisibles : en test, cliquer le `label`, ou utiliser `check(..., {force:true})`.
- Le faux Supabase (`e2e/faux-supabase.js`) gère `updateUser({data})`, donc les métadonnées.
- Grille CSS : mettre `minmax(0,1fr)` sur `.champ`, sinon les grands champs débordent sur mobile.
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
