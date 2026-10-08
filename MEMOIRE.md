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

## 3. État (au 8 oct. 2026)

Branche `orbite` (dépôt espace-finances-tn) :
- ✔ système visuel, logo animé, icônes PWA, manifest ;
- ✔ accueil (aperçu vivant, grille de points, carte inclinée), connexion, confidentialité (profil financier ajouté) ;
- ✔ Mon orbite : scène orbitale, budget en anneau, conseils, capacité net/brut, 3 suggestions d'épargne, projets ;
- ✔ Mon profil : toutes les données, enregistrement automatique, délai propre à chaque champ (bug de saisie rapide corrigé) ;
- ✔ module Salaire : complet, avec la section tranche d'impôt (échelle, repères avant/après, marge avant la tranche suivante) ;
- ✔ simulations, compte ; l'export inclut `profil_orbite` ;
- ✔ moteur crédit : 72 tests (parité avec l'original) ;
- ✔ tests : `npm test` → 261 ✔ ; e2e `node e2e/parcours.js` → 18/18 ✔ ;
- ⏳ module Épargne : `public/espace/js/module-epargne.js` (≈148 Ko) et `epargne.css`, écrits par un agent interrompu par la limite d'utilisation.
  Ils ne sont PAS commités ; les lignes ajoutées à `index.html` ne sont pas commitées non plus. À terminer, puis tester ;
- ⏳ module Crédit : `public/espace/js/module-credit.js` (≈160 Ko) et `credit.css`, même situation ;
- ⏳ contrôle axe : le script `addScriptTag` est bloqué par la CSP. Utiliser `newContext({ bypassCSP: true })` pour l'audit.

## 4. Prochaines actions (dans l'ordre)

1. Publier la version courante, avec le relais provisoire : pousser `orbite`, ouvrir une PR vers `main`, fusionner, puis vérifier le déploiement.
2. Terminer le module Crédit :
   - relire `module-credit.js` et ajouter le script et la feuille de style dans `index.html`, avant `simulations.js` ;
   - test navigateur avec le harnais `scratchpad/app-session.js` ;
   - captures 1440/390 en clair et en sombre ; axe ; aucune erreur.
3. Terminer le module Épargne de la même façon. Ses lignes de scripts `moteurs/vie/*` sont déjà dans `index.html`, non commitées.
4. e2e complet : les étapes épargne et crédit passent alors par les vrais modules (le relais n'est plus utilisé).
5. Retirer `public/outils/`, `commun/pont.*`, `commun/espace.*` et `e2e/assurance-vie-origine`. Nettoyer les règles `/outils` de `_headers`.
   Repointer les tests `tests/assurance-vie` et `tests/salaire` vers `public/moteurs/`.
6. PR, fusion, vérification en ligne, réponse finale avec les liens.

## 5. Pièges connus

- Les sous-agents s'arrêtent à la limite d'utilisation : toujours vérifier les fichiers partiels avant de relancer.
- Les captures pleine page Playwright décalent les éléments `sticky` : vérifier aussi la capture de la fenêtre.
- Les boutons radio des `.bascule` sont invisibles : en test, cliquer le `label`, ou utiliser `check(..., {force:true})`.
- Le faux Supabase (`e2e/faux-supabase.js`) gère `updateUser({data})`, donc les métadonnées.
- Grille CSS : mettre `minmax(0,1fr)` sur `.champ`, sinon les grands champs débordent sur mobile.
