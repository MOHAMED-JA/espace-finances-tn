# Orbite

**Votre salaire au centre. Tout le reste en orbite.**

Orbite est une application web privée destinée aux salariés tunisiens. Chaque utilisateur crée un compte (e-mail et mot de passe, ou Google), saisit son profil une seule fois, puis retrouve tout dans une seule application :

| Module | Ce qu'il calcule |
|---|---|
| **Mon orbite** | Synthèse du profil : net, tranche d'impôt, capacité d'emprunt **sur le net et sur le brut** (crédits en cours déduits), trois propositions d'épargne adaptées au net, budget mensuel, faisabilité des projets, conseils classés par priorité |
| **Salaire** | CNSS / CNRPS, IRPP et CSS 2026, 12 à 18 salaires, primes, coût employeur, net → brut exact, offres A/B, courbe, **augmentation avec changement éventuel de tranche d'impôt** |
| **Épargne vie & CEA** | Économie d'impôt (art. 39), montant optimal, projection, Monte-Carlo, rachat, retraite, protection, stratégie AV/CEA, exports |
| **Crédit** | Mensualité, TMM + marge, TEG, différé, assurance, remboursements anticipés, règle de réduction du taux, capacité, renégociation, comparaison d'offres, stress test |
| **Mon profil** | Identité, famille, salaire et primes, contrat, crédits en cours, contrats vie et CEA, budget, projets, règles de la banque |

## Architecture

```
public/                   ← seul dossier publié (Cloudflare Workers, assets statiques)
  index.html              accueil public avec aperçu vivant (moteurs réels)
  connexion.html          connexion, inscription, mot de passe oublié, Google
  espace/                 l'application Orbite (une seule page, navigation par #vue)
    js/app.js             cœur : navigation, profil partagé, enregistrement, outils d'interface
    js/orbite-calcul.js   calculs croisés du profil (pur, testé)
    js/vue-*.js, module-*.js, simulations.js
  moteurs/                moteurs de calcul purs et testés : salaire/, vie/, credit/
  orbite/                 système visuel (orbite.css, polices, icônes, logo)
  commun/                 session Supabase, configuration, pages publiques
  _headers                en-têtes de sécurité (CSP stricte, HSTS, anti-iframe…)
supabase/migrations/      schéma SQL (tables, RLS, export, suppression de compte)
tests/                    tests unitaires (node --test)
e2e/                      parcours navigateur complet contre un faux Supabase, serveur local avec CSP
```

- **Pas de compilation** : HTML, CSS et JavaScript natifs. Les polices et le code sont hébergés sur le site. Aucun script ni style en ligne.
- **Profil** : enregistré dans les métadonnées du compte Supabase Auth. Seul l'utilisateur y a accès, et il est inclus dans l'export JSON.
- **Simulations** : table `simulations`, verrouillée par la RLS. Chaque module expose `etat()`, `resume()`, `nomParDefaut()` et `charger()`.
- **Design** : voir [DESIGN.md](DESIGN.md).

## Développer et tester

```bash
npm test                          # tests unitaires (salaire, vie, crédit, profil, Espace)
node e2e/serveur.js 8300          # http://127.0.0.1:8300/ avec les en-têtes de _headers
PLAYWRIGHT_CORE=… CHROMIUM=… node e2e/parcours.js   # parcours complet, CSP vérifiée
```

## Mise en ligne et sécurité

Voir [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md) et [docs/SECURITE.md](docs/SECURITE.md).

---
Conçu par Mohamed Aziz Jaouadi. Estimations indicatives : elles ne remplacent ni un bulletin de paie, ni une offre bancaire, ni un conseil fiscal.
