# Sécurité

## Modèle

Site statique (aucun serveur applicatif) + Supabase. Tout ce qui est dans `public/` est par nature lisible par le navigateur : la sécurité des données repose sur **l'authentification Supabase et les règles RLS de Postgres**, pas sur le secret du code.

| Menace | Parade |
|---|---|
| Lire ou modifier les simulations d'un autre utilisateur | RLS sur `profils` et `simulations` : `auth.uid() = user_id` pour chaque opération ; `user_id` non modifiable (droits par colonne) ; aucun accès `anon` |
| Clé secrète exposée | Seule la clé *publishable* est dans le code ; aucune clé `service_role` / secrète dans le dépôt |
| Injection de script (XSS) | CSP stricte `script-src 'self'` partout, aucun script en ligne ; contenu utilisateur inséré par `textContent` uniquement ; états de simulation filtrés (`[A-Za-z0-9_.,:%=&+-]`, 4 000 caractères max) à l'enregistrement et à l'ouverture |
| Redirection ouverte après connexion | `suite` limité aux chemins relatifs du même site (`suiteSure`, testé) |
| Vol de session OAuth | Flux PKCE, jetons courts renouvelés automatiquement, `Referrer-Policy` stricte |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Interception réseau | HTTPS imposé (HSTS 2 ans, `upgrade-insecure-requests`) |
| Abus / saturation | 200 simulations max par compte (déclencheur SQL), taille des champs JSON bornée, limites de débit Supabase Auth |
| Dépendances compromises | Bibliothèques hébergées localement (supabase-js 2.117.3, jsPDF, Chart.js, SheetJS, qrcode) ; seuls Tesseract et pdf.js (fonctions facultatives du crédit) se chargent depuis jsDelivr, version figée, et uniquement sur `/outils/credit/` |
| Fuite vers des tiers | Aucune police Google, aucun traceur, aucune analyse d'audience |

SheetJS 0.18.5 a des failles connues **à la lecture** de fichiers ; l'application ne fait qu'**écrire** des classeurs : la surface vulnérable n'est pas atteinte.

## Garde côté page

`commun/garde.js` redirige immédiatement vers la connexion si aucune session n'est enregistrée ; `session.js` vérifie ensuite le jeton auprès de Supabase (`getUser`). Ce contrôle évite d'afficher l'interface à un visiteur anonyme, mais **la vraie barrière est la RLS** : sans jeton valide, l'API ne renvoie aucune donnée.

## Droits de la personne

Export JSON complet (`exporter_mes_donnees`) et suppression définitive du compte (`supprimer_mon_compte`, cascade sur profil et simulations) depuis l'onglet Compte.

## Dépôt

Le dépôt GitHub est **privé**. Le portail RH public ne contient aucun code de l'Espace ; il ne fait que renvoyer vers l'application.
