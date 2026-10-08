# Espace Finances TN

Application web complète et privée : chaque utilisateur crée un compte (e-mail + mot de passe ou Google) et accède à son espace personnel, où il retrouve trois simulateurs tunisiens et ses simulations enregistrées.

| Outil | Ce qu'il calcule |
|---|---|
| **Salaire brut ⇄ net** | CNSS / CNRPS, IRPP et CSS 2026, 12 à 18 salaires par an, primes, coût employeur, net → brut exact, comparateur A/B, augmentation, courbe |
| **Assurance vie & CEA** | Économie d'impôt (art. 39), montant optimal, projection du capital, Monte-Carlo, rachat, stratégie |
| **Crédit bancaire** | Mensualité, TMM + marge, TEG, différé, assurance, remboursements anticipés, capacité d'emprunt, renégociation |

## Architecture

```
public/                  ← seul dossier publié (Cloudflare Pages, « Build output directory »)
  index.html             accueil public (calculateur signature, présentation)
  connexion.html         connexion, inscription, mot de passe oublié, Google
  espace/                tableau de bord : aperçu, simulations, compte
  outils/salaire/        simulateur de salaire (moteur testé)
  outils/assurance-vie/  simulateur assurance vie & CEA
  outils/credit/         simulateur de crédit (code découpé en js/ et css/)
  commun/                design system Méridien, session Supabase, barre de l'Espace (pont)
  _headers               en-têtes de sécurité (CSP par zone, HSTS, anti-iframe…)
supabase/migrations/     schéma SQL (tables, RLS, export, suppression de compte)
tests/                   tests unitaires (node --test) : Espace, salaire, assurance vie
e2e/                     parcours navigateur complet contre un faux Supabase + serveur local avec CSP
docs/                    guides (mise en ligne, sécurité, notes des simulateurs)
```

- **Aucune étape de construction** : HTML, CSS et JavaScript natifs, polices et bibliothèques hébergées localement.
- **Authentification et données** : Supabase (Auth + Postgres). La clé publique (« publishable ») est faite pour le navigateur ; l'accès aux données est verrouillé par les règles RLS.
- **Enregistrement d'une simulation** : chaque outil expose `window.EspaceOutil` (`etat()`, `resume()`, `nomParDefaut()`). L'état est la chaîne de paramètres du lien de partage de l'outil ; l'ouvrir depuis l'espace recharge exactement la simulation.

## Développer et tester

```bash
npm test                         # 175 tests unitaires
node e2e/serveur.js 8300         # http://127.0.0.1:8300/ avec les en-têtes de _headers
PLAYWRIGHT_CORE=… CHROMIUM=… node e2e/parcours.js   # 15 étapes de bout en bout, CSP vérifiée
```

Le parcours e2e simule Supabase (aucun compte réel n'est touché) et vérifie : calcul exact, redirection des pages protégées, inscription, enregistrement depuis les trois outils, isolation entre deux comptes, renommage, favori, suppression avec annulation, export, thème, mobile, suppression du compte, et l'absence de toute violation de CSP ou erreur JavaScript.

## Mise en ligne

Voir [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md) (Cloudflare Pages, Google OAuth, réglages Supabase, e-mails).

## Sécurité

Voir [docs/SECURITE.md](docs/SECURITE.md).

---
Conçu par Mohamed Aziz Jaouadi. Estimations indicatives : ne remplacent ni un bulletin de paie, ni une offre bancaire, ni un conseil fiscal.
