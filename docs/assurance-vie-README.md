# Simulateur Assurance Vie et CEA

Simulateur d'économie d'impôt sur le revenu (Tunisie, montants en TND) grâce à l'assurance vie et au Compte Épargne en Actions (CEA). Application 100 % statique : aucun serveur, aucune donnée envoyée. Polices et bibliothèques sont hébergées dans le dépôt : aucune requête vers un service tiers.

## Règles fiscales appliquées (article 39 du Code de l'IRPP et de l'IS, à confirmer)

| | Assurance vie | CEA |
|---|---|---|
| Déduction maximale | 100 000 TND par an | 100 000 TND par an |
| Impôt minimum après déduction | 45 % de l'impôt initial | 60 % de l'impôt initial |
| Durée | contrat d'au moins 8 ans (loi de finances 2018) | chaque dépôt bloqué 5 ans à compter du 1er janvier suivant |
| Sortie anticipée | primes déduites réintégrées au revenu de l'année du rachat | dépôts encore bloqués réintégrés au revenu de l'année du retrait |

Avec les deux produits, l'impôt ne descend jamais sous 45 % et la part de réduction due au CEA ne dépasse jamais 40 % de l'impôt initial. Tous ces paramètres sont dans `js/baremes.js` (`produits`).

## Fonctions

- **Assurance vie et CEA distingués** : versements périodiques et versement initial pour chacun, plafonds, économie due à chaque produit, alerte au-delà des plafonds.
- Impôt avant et après investissement, économie annuelle et mensuelle, plancher légal.
- Montant optimal en assurance vie (compte tenu du CEA saisi), application en un clic ; CEA au-delà duquel un dépôt ne réduit plus l'impôt ; courbe « économie selon le montant investi ».
- **Mode inverse** : « je veux économiser X TND par an » donne le montant à verser en assurance vie, en plus du CEA (par mois, trimestre, semestre ou an).
- Détail des déductions et de l'impôt tranche par tranche.
- **Saisie tolérante** : « 45 000 », « 45000,5 », « 45,000.5 » sont compris ; « 45,000 » (ambigu) déclenche un avertissement avec correction en un clic.
- **Projection du capital par produit** : assurance vie (taux servi, **taux minimum garanti** sous lequel le scénario prudent ne descend pas, participation aux bénéfices, frais de gestion et **frais sur versement**) et CEA (rendement, frais, écart propres) ; **versements libres** ponctuels et **retraits programmés** (après 8 ans) en assurance vie ; durée, trois scénarios dont l'écart dépend du support (fonds en euros ± 1 pt, équilibré ± 2 pts, unités de compte ± 4 pts, ou personnalisé), hausse annuelle du revenu et des versements, inflation et capital en dinars constants, rendement effectif (TRI), comparaison avec un placement classique, export annuel en Excel (CSV).
- **Objectif de capital** : « je veux 150 000 TND au terme » donne le versement nécessaire (scénario médian, avec frais, hausse des versements et réinvestissement), appliqué en un clic.
- **Mode retraite** : l'âge actuel et l'âge de départ fixent la durée ; avec la pension estimée, la carte Prévoyance affiche le revenu mensuel à la retraite et la part apportée par la rente.
- **Comparatif des placements** : contrat (capital + économie d'impôt), placement classique avant et après impôt sur les intérêts (taux modifiable, 20 % par défaut, à confirmer) et versements cumulés.
- **Rachat anticipé** (partiel ou total, à l'année N), en assurance vie ou sur le CEA : pénalité, réintégration fiscale selon les règles de chaque produit, montant net perçu et coût de la sortie ; **avance sur contrat** (montant, taux, durée) comparée au coût d'un rachat du même montant.
- **Capital ou rente au terme** : total des rentes, supplément et nombre d'années pour égaler le capital ; rappel des avantages à la sortie.
- **Être rappelé par un conseiller** : message WhatsApp (ou e-mail) vers l'agence, avec le lien de la simulation. Coordonnées par défaut dans `js/config.js`, ou saisies par le conseiller dans le mode conseiller.
- **Prévoyance** : rente estimée au terme (durée et taux technique saisis) et capital versé aux bénéficiaires en cas de décès.
- **Lien de partage** : les paramètres sont encodés dans l'adresse (partie `#`), avec un QR code et un envoi en un clic par WhatsApp ou e-mail (et partage direct du PDF sur les téléphones qui le permettent) ; les noms du client et du conseiller n'y figurent jamais.
- **Rapport PDF** (jsPDF) : en-tête et logo, numéro de dossier, indicateurs, tableaux, graphiques, rachat, prévoyance, QR code, mentions légales, pages numérotées. En arabe, le rapport est rédigé en français (les polices standard du PDF n'ont pas de glyphes arabes). Si jsPDF ne se charge pas, la boîte d'impression du navigateur prend le relais.
- **Mode conseiller et portefeuille** : nom du client, du conseiller et référence du dossier sur le rapport ; simulations enregistrées dans le navigateur (IndexedDB, 200 au plus), rouvertes en un clic, **comparées côte à côte** (2 ou 3, meilleure valeur signalée par ★) et exportées en Excel (CSV) ; **tableau de bord** (épargne proposée, économies d'impôt, capital projeté) et **sauvegarde / restauration** du portefeuille dans un fichier, pour changer d'appareil ou de navigateur.
- **PDF aux couleurs de l'agence** : logo, nom et coordonnées de l'agence, nom du conseiller pré-rempli ; mémorisés sur l'appareil uniquement.
- **Palette de commandes (Ctrl K)** : toutes les actions, rubriques et réglages au clavier, avec saisie directe (« 60000 », « av 500 », « cea 200 », « 20 ans », « 2 enfants »).
- **Annuler / rétablir** (Ctrl Z, Ctrl Maj Z) : historique des 60 dernières saisies, avec l'effet sur l'économie d'impôt.
- **Comparer des scénarios** : jusqu'à 4 variantes du même client côte à côte (montant optimal, tout en assurance vie, moitié en CEA, 100 TND de plus par mois…), meilleure valeur de chaque critère signalée par ★, application en un clic.
- **Simulation du couple** : répartition du budget d'assurance vie du foyer entre les deux conjoints qui maximise l'économie d'impôt (déductions familiales au chef de famille).
- **Tests de résistance** : krach l'année N (CEA en chute, assurance vie au seul taux garanti), pause des versements, rendements plus bas, inflation élevée ; effet sur le capital au terme.
- **Objectifs de vie** : retraite, études, logement… versement mensuel nécessaire pour chacun au rendement net, financement par ordre d'échéance et ajustement du versement en un clic.
- **Reçu fiscal à partager** : image PNG (1080 × 1350) prête pour WhatsApp, LinkedIn ou Instagram, avec QR code vers l'application (aucune donnée personnelle).
- **Classeur Excel (.xlsx)** : synthèse, impôt par tranche, projection, Monte-Carlo, stratégie, scénarios et objectifs, avec formules ; généré sans bibliothèque (`js/xlsx.js`).
- **Import d'un relevé PDF** : taux servi, taux garanti, frais et versement repérés dans un relevé ou un contrat (PDF texte), proposés puis appliqués seulement si l'utilisateur coche ; le fichier reste sur l'appareil.
- **Rappels de versement** : notification le jour choisi (à l'ouverture de l'application, et en arrière-plan sur l'application installée quand le navigateur le permet).
- **Présentation sur un second écran** et **verrouillage de la saisie** : la fenêtre tournée vers le client affiche les diapositives, celle du conseiller sert de télécommande.
- **Finitions** : lien « Aller au contenu », annulation des suppressions, courbes qui se transforment au lieu d'être redessinées, changement de thème en cercle, retour visuel quand le plancher légal est atteint, cibles tactiles agrandies sur tablette.
- **Barre latérale des rubriques** : toutes les rubriques classées (votre situation, résultats, projection, sortie et prévoyance, conseiller), rubrique courante suivie au défilement, chiffres clés en direct (économie, capital au terme, stratégie…), recherche avec la touche « / », barre réductible à ses icônes. Sur téléphone et tablette : bouton flottant « Rubriques » qui ouvre une feuille de navigation.
- **Aspect moderne** : fond « aurora » animé (immobile sur téléphone et si les animations sont réduites), cartes en verre dépoli, courbes qui se dessinent à l'affichage.
- **Mode simple / expert** : le mode simple masque les réglages avancés (tranches, hypothèses détaillées, stratégie, contrats, rachat, portefeuille) ; le choix est mémorisé.
- **Simulation guidée en 3 étapes** (revenu, famille, épargne mensuelle avec le montant optimal proposé), aussi accessible depuis le raccourci de l'application installée.
- **« Et si… ? »** : curseurs du versement mensuel en assurance vie et de la durée, résultats recalculés en direct.
- **Graphiques interactifs** : viseur et infobulle au survol ou au doigt (capital, économie, éventail) et **curseur temporel** qui lit le capital année par année.
- **Projection probabiliste (Monte-Carlo)** : 5 000 trajectoires de rendements annuels (volatilité réglable par produit, assurance vie jamais sous son taux garanti), éventail 10–90 % et 25–75 %, phrases du type « 9 chances sur 10 d'avoir au moins X », probabilité de dépasser les versements et d'atteindre l'objectif de capital. Résultats reproductibles (générateur à graine).
- **Stratégie optimale année par année** : répartition du même budget entre assurance vie et CEA qui maximise la valeur au terme (capital médian + économie d'impôt), sans CEA les 5 dernières années ; application en un clic.
- **Comparateur de contrats** : 2 ou 3 offres d'assurance vie (taux servi, taux garanti, frais de gestion et sur versement) avec capital médian, capital au seul taux garanti, coût des frais et rendement effectif ; meilleure offre signalée par ★.
- **Ajouter à l'agenda** : fichier `.ics` (tous agendas) avec les versements récurrents, la date des 8 ans de l'assurance vie, la fin de blocage de chaque année de dépôts CEA et le terme, avec rappels.
- **Mode présentation client** : 4 diapositives plein écran (situation, économie, capital, recommandation), au clavier, au doigt ou à la souris.
- **Proposition commerciale (PDF)** : couverture, recommandation, effort d'épargne réel, situation, projection et éventail Monte-Carlo, stratégie, contrats comparés, points d'attention, mentions et cadres de signature « Lu et approuvé ».
- **Couleur de l'agence** : appliquée à l'interface (contraste vérifié) et aux PDF.
- **Infobulles et questions fréquentes** : plancher de 45 %, scénarios et rendement effectif, rachat, rente, dinars constants.
- **Français, anglais et arabe** (lecture de droite à gauche) ; la langue du navigateur est proposée par défaut. Les montants gardent le format tunisien dans toutes les langues.
- Barème paramétrable par année : un sélecteur d'année apparaît dès qu'il y a plusieurs barèmes (la loi de finances 2026 n'a pas modifié le barème : un seul est affiché).
- **QR code d'installation** : `assets/qr-installation.png` et l'affiche à imprimer `assets/affiche-installation.pdf` (aussi générée depuis la fenêtre « Installer l'application » sur ordinateur, avec les coordonnées de l'agence). Le code ouvre `…/?installer=1` : l'application s'affiche directement sur une fenêtre d'installation adaptée au téléphone (un appui sur Android, deux gestes guidés sur iPhone et iPad ; dans les navigateurs intégrés à Facebook ou Instagram, invitation à ouvrir la page dans Chrome ou Safari). Aucun site ne peut s'installer sans l'accord de l'utilisateur : c'est une règle des téléphones. L'adresse du QR code se règle dans `js/config.js` (`urlPublique`).
- **Application installable et hors ligne** (PWA) : utilisable en agence sans réseau ; en ligne, la dernière version publiée est toujours servie. Raccourcis sur l'icône (appui long) : nouvelle simulation, simulation guidée, portefeuille ; vibration légère au toucher.
- Thème clair, sombre ou automatique (suit le réglage de l'appareil), au choix dans un menu ; adapté au mobile (dès 320 px de large).

## Organisation

```
index.html              page
manifest.webmanifest    application installable (PWA)
sw.js                   mode hors ligne (réseau d'abord, cache en secours)
assets/styles.css       styles (dont la mise en page d'impression)
assets/fonts*           polices hébergées localement
assets/vendor/          jsPDF et qrcode-generator (licences MIT, voir LICENCES.md)
js/config.js            coordonnées de l'agence proposées à tous (bouton « Être rappelé »)
js/baremes.js           barème, déductions, règles assurance vie et CEA par année  <- à modifier à chaque loi de finances
js/moteur-fiscal.js     calcul de l'impôt et mode inverse (fonctions pures)
js/saisie.js            lecture des nombres saisis (fonctions pures)
js/projection.js        projection du capital (fonctions pures)
js/scenario.js          enchaînement calcul fiscal + projection (fonctions pures)
js/rachat.js            rachat anticipé (fonctions pures)
js/prevoyance.js        rente et capital décès (fonctions pures)
js/partage.js           lien de partage (fonctions pures)
js/export-tableur.js    exports CSV pour Excel (fonctions pures)
js/portefeuille.js      portefeuille du conseiller (IndexedDB)
js/conseil.js           objectif de capital, retraite, statistiques et sauvegarde du portefeuille (fonctions pures)
js/montecarlo.js        projection probabiliste (fonctions pures)
js/strategie.js         répartition optimale assurance vie / CEA année par année (fonctions pures)
js/contrats.js          comparateur de contrats (fonctions pures)
js/calendrier.js        calendrier .ics (fonctions pures)
js/theme.js             palette de la couleur de l'agence (fonctions pures)
js/stress.js            tests de résistance (fonctions pures)
js/couple.js            répartition entre conjoints (fonctions pures)
js/objectifs.js         objectifs de vie (fonctions pures)
js/comparateur.js       comparaison de scénarios (fonctions pures)
js/historique.js        annuler / rétablir (fonctions pures)
js/xlsx.js              classeur Excel sans bibliothèque (fonctions pures)
js/releve.js            lecture d'un relevé PDF (fonctions pures)
js/commandes.js         palette de commandes (fonctions pures)
js/rappels.js           échéances des rappels (fonctions pures, partagées avec sw.js)
js/graphiques.js        graphiques SVG
js/i18n.js              traductions (anglais, arabe)
js/pdf.js               rapport PDF
js/interface.js         lecture des saisies et affichage
tests/                  tests unitaires (Node)
e2e/                    parcours de bout en bout (Playwright)
```

### Ajouter une année fiscale

Dans `js/baremes.js`, dupliquer l'entrée `'2025'` sous `annees`, adapter les tranches (contiguës : chaque `min` égale le `max` précédent), les déductions et `sortie`. Changer `parDefaut` pour proposer la nouvelle année ; `provisoire: true` affiche un avertissement tant que le texte n'est pas confirmé. Penser à ajouter la traduction du nouveau libellé et de la source dans `js/i18n.js` (le test des traductions le signale).

### Ajouter ou modifier un texte

Tout texte affiché en français doit avoir sa traduction anglaise et arabe dans `js/i18n.js` ; `npm test` échoue sinon et liste les textes manquants.

## Tests

```bash
npm test            # tests unitaires, Node 18 ou plus, sans dépendance
npm ci && npx playwright install chromium
npm run test:e2e    # parcours dans Chromium, format bureau et mobile
```

Les deux séries tournent à chaque `push` et à chaque pull request (GitHub Actions).

## Publication

Le site est déployé sur GitHub Pages à chaque `push` sur `main` (workflow `static.yml`), seulement si les tests unitaires passent. Seuls les fichiers de l'application sont publiés (`index.html`, `manifest.webmanifest`, `sw.js`, `assets/`, `js/`).

## Avertissement

Simulation indicative, non contractuelle. Les rendements de la projection sont des hypothèses non garanties. Les paramètres fiscaux (barème, plafonds, durée minimale avant réintégration en cas de rachat) sont à confirmer avec les textes officiels en vigueur.
