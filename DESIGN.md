# Orbite — système visuel

**Idée directrice :** votre salaire est un noyau, et tout le reste gravite autour : le net, la capacité d'emprunt et l'épargne. L'interface rend cette gravité visible. On saisit son profil une seule fois, puis le système se met en mouvement et les satellites s'alignent sur votre situation.

**Monde :**
- Le jour, des surfaces claires, nettes et précises, inspirées du simulateur automobile, au service de la saisie et de la lecture.
- La nuit, des panneaux d'encre où vit l'orbite : la scène orbitale, le résultat clé et l'aperçu de la page d'accueil.
- Un contraste net entre les deux, sans halo décoratif. La lumière ne vient que des satellites.

**Lieu d'usage :** salarié·e chez soi ou au bureau, souvent sur téléphone, en journée. Le thème clair est donc celui par défaut ; le thème sombre est complet.

## Couleurs (`public/orbite/orbite.css`)

| Rôle | Clair | Sombre |
|---|---|---|
| Fond `--fond` | #F3F4F8 | #07090F |
| Surface `--surface` | #FFFFFF | #10131C |
| Surface 2 `--surface-2` (champs, pistes) | #F0F2F6 | #171B26 |
| Filet `--filet` / `--filet-fort` | #E2E5EC / #C9CED9 | #232836 / #343B4D |
| Encre `--encre` / `-2` / `-3` | #0A0D14 / #3F4555 / #5E6577 | #F2F4F8 / #C1C7D3 / #959CAD |
| Cosmos `--cosmos` (panneaux d'encre) | #0A0D16 | #0C1019 |

Les trois satellites sont les couleurs d'identité des modules. Chacune a quatre valeurs :

| Module | Couleur | Texte | Fond doux | Lumière (sur cosmos) |
|---|---|---|---|---|
| Salaire | #12B76A | #067647 | #DCFAE6 | #4ADE80 |
| Épargne (vie et CEA) | #7A5AF8 | #5925DC | #EBE9FE | #A78BFA |
| Crédit | #2F5BEA | #1F45C7 | #E3EAFE | #7EA2FF |

Règles d'usage :
- Les actions principales sont en encre (pilule noire, ou blanche en sombre).
- La couleur d'un module n'apparaît que dans ce module, et pour désigner ce module ailleurs.
- La décomposition du salaire garde son code : net vert, caisse bleu, IRPP violet, CSS ambre #F5B70A.
- États : succès #079455, alerte #DC6803, erreur #D92D20.

## Typographie

- **Bricolage Grotesque** (variable, axe optique) sert de voix d'affichage : titres de page, titres de section, grand chiffre du net, accueil. C'est l'empreinte humaine, avec un dessin légèrement irrégulier et chaleureux.
- **Mona Sans** sert à toute l'interface : libellés, champs, boutons, montants secondaires, tableaux. Tous les chiffres sont tabulaires.
- **JetBrains Mono** est réservée aux tableaux d'échéancier et au détail ligne par ligne.
- Le format des montants est `1 849,310 DT` : espace insécable fine pour les milliers, virgule pour les millimes.

## Formes

- Rayons : 8 (puces), 12 (champs et boutons), 16 (panneaux internes), 22 (panneaux), 28 (scène orbitale), pilule.
- Ombres douces et décalées, jamais de halo coloré à décalage nul.
- Filets d'1 px. Pas de bordure latérale colorée.

## Composants

- **Coquille :**
  - sur ordinateur, une barre latérale de 260 px (Orbite, Salaire, Épargne, Crédit, Simulations, Compte) et une barre du haut contextuelle (titre et action « Enregistrer ») ;
  - sur téléphone, des onglets en bas.
- **Profil** : grand champ montant, bascules brut/net, mois/an, privé/public, interrupteur chef de famille, compteurs, et crédits en cours.
- **Scène orbitale** (panneau cosmos) :
  - le noyau affiche le salaire ;
  - trois satellites portent la valeur clé de chaque module ;
  - les orbites tournent lentement et s'alignent après chaque calcul ;
  - un clic sur un satellite ouvre le module (View Transition, le satellite devient l'en-tête).
- **Budget orbital** : anneau qui partage le net entre mensualité de crédit, épargne et reste à vivre. C'est la valeur ajoutée : les trois modules se répondent.
- **Suggestions** : propositions d'épargne (prudente, équilibrée, optimale fiscalement) et capacités d'emprunt sur le net et sur le brut. Chacune a une action « Appliquer », et une puce vole vers le module concerné.
- **Modules** : la partie essentielle est toujours visible. Le mode expert se replie et regroupe les outils avancés.

## Mouvement

Courbes : `--sortie` cubic-bezier(.16,1,.3,1), `--ressort` cubic-bezier(.34,1.45,.64,1), `--tiroir` cubic-bezier(.32,.72,0,1).

- **Moment signature :** l'orbite. Les satellites dérivent lentement (60 à 90 s par tour). Après un calcul, ils s'alignent en 700 ms avec un ressort, et le noyau pulse une fois.
- **Navigation entre modules :** View Transition avec fondu-flou du titre et glissement de 24 px du contenu. Le satellite devient l'en-tête du module.
- **Chiffres :** tween de 460 ms en ease-out exponentiel, avec une pastille +/− d'écart. Aucune animation pendant la frappe.
- **Appliquer une suggestion :** une puce vole en arc jusqu'à sa destination (640 ms).
- **Micro-interactions :** appui à `scale(.97)` ; pastilles de bascule à ressort ; compteurs qui sautent légèrement.
- **Accueil :** grille de points éclairée autour du pointeur et carte d'aperçu inclinée en 3D, comme le simulateur automobile.
- **`prefers-reduced-motion`** : orbites immobiles, aucun tween ni vol de puce, transitions en simple fondu.

## Accessibilité

- WCAG 2.1 AA vérifié avec axe-core, en clair et en sombre, à 1440 et 390 px.
- La scène orbitale a une alternative textuelle complète (liste des trois valeurs).
- Navigation entièrement au clavier ; focus visible en bleu crédit.
