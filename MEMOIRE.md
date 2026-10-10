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

> **Avancement** : lot 1 livré (PR #58) ; hors programme, livrés aussi : règle des 8 % (#60), simulations → profil et remboursements anticipés (#61), historique du salaire (#62). Lot 2 livré (« Et si… » + mode Expert, section 3 terquadragies). **Suivant : lot 3 (B6 historique et carrière + C3 objectifs), maquette d'abord.**

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

## 5. Pièges connus

- Thème sombre : `:root[data-theme="dark"] .bascule__pastille` (spécificité 0,3,0) écrase les règles locales à deux classes. Sur l'accueil, la pastille blanche de l'aperçu devenait foncée avec un texte foncé : c'était illisible (corrigé le 8 oct.). axe ne l'avait pas détecté, car la pastille est un élément superposé. Vérification : le script `bascules.js` (bloc-notes) calcule le contraste de chaque option sélectionnée en clair et en sombre ; attention, `color-mix` renvoie `color(srgb …)` avec des valeurs entre 0 et 1.

- Responsive : le script `resp.js` (dans le bloc-notes de la session) vérifie 7 largeurs (320 à 1920) × 7 vues. Les budgets passent par des requêtes de conteneur (`.budget`, `.cr-resultat`, `.cr-groupe`). Toujours mettre `minmax(0, 1fr)` sur les grilles d'une seule colonne qui contiennent du texte ou des boutons longs.

- Lancer l'e2e : `CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NODE_PATH=/home/user/portail-rh/node_modules node e2e/parcours.js`.

- Les sous-agents s'arrêtent à la limite d'utilisation : toujours vérifier les fichiers partiels avant de relancer.
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
