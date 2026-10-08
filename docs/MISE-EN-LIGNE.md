# Mise en ligne — étapes à faire une seule fois

Le code est prêt et le projet Supabase **espace-finances-tn** (Francfort) est créé avec ses tables protégées. Il reste des réglages que seul le propriétaire des comptes peut faire.

## 1. Publier le site sur Cloudflare Pages (gratuit) — 5 min

1. Ouvrez <https://dash.cloudflare.com> (créez un compte gratuit si besoin).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Autorisez Cloudflare sur GitHub **uniquement pour le dépôt `espace-finances-tn`** (« Only select repositories »).
4. Réglages du projet :
   - Project name : `espace-finances-tn`
   - Production branch : `main`
   - Framework preset : `None`
   - Build command : *(laisser vide)*
   - **Build output directory : `public`**
5. **Save and Deploy**. L'adresse sera `https://espace-finances-tn.pages.dev`.

> Le dépôt reste privé : Cloudflare ne publie que le dossier `public/`. Ni le code SQL, ni les tests, ni la documentation ne sont servis.

## 2. Régler Supabase — 3 min

Tableau de bord Supabase → projet **espace-finances-tn** :

1. **Authentication → URL Configuration**
   - Site URL : `https://espace-finances-tn.pages.dev`
   - Redirect URLs : ajoutez `https://espace-finances-tn.pages.dev/**`
2. **Authentication → Providers → Email** : laissez *Confirm email* activé.
3. **Authentication → Policies / Passwords** : longueur minimale **10**, exigez lettres + chiffres + symboles ; activez *Leaked password protection* si votre offre le permet.
4. **SQL Editor** : exécutez le fichier `supabase/migrations/0002_compte_export_suppression.sql` (export des données et suppression du compte ; la migration 0001 est déjà appliquée).

## 3. Connexion avec Google — 10 min

1. <https://console.cloud.google.com> → créez un projet « Espace Finances TN ».
2. **APIs & Services → OAuth consent screen** : type *External*, nom de l'application, e-mail de contact, domaine autorisé `supabase.co` et `pages.dev` ; portées : `email`, `profile`, `openid`. Publiez l'écran (*In production*).
3. **Credentials → Create credentials → OAuth client ID** → *Web application* :
   - Authorized JavaScript origins : `https://espace-finances-tn.pages.dev`
   - Authorized redirect URIs : `https://txrwgqgnqdkipwtwpevl.supabase.co/auth/v1/callback`
4. Copiez le **Client ID** et le **Client secret**.
5. Supabase → **Authentication → Providers → Google** : activez, collez les deux valeurs, enregistrez.

> Le *Client secret* se colle **uniquement dans Supabase**, jamais dans le code ni dans le dépôt.

## 4. E-mails de confirmation (indispensable pour l'inscription par e-mail)

Le service d'e-mail intégré de Supabase n'envoie qu'aux membres de votre organisation Supabase et à très faible débit. Pour ouvrir l'inscription par e-mail à tout le monde, branchez un SMTP gratuit :

1. Créez un compte gratuit chez **Brevo** (300 e-mails/jour) ou **Resend** (3 000/mois).
2. Récupérez les identifiants SMTP (hôte, port 587, utilisateur, mot de passe) et vérifiez votre adresse d'expéditeur.
3. Supabase → **Authentication → Emails → SMTP Settings** : activez *Custom SMTP* et collez-les.
4. (Facultatif) Personnalisez les modèles d'e-mails en français dans **Authentication → Emails → Templates**.

En attendant, la **connexion Google fonctionne sans SMTP**.

## 5. Protection anti-robots (recommandé)

Supabase → **Authentication → Attack Protection** : activez **Cloudflare Turnstile** (gratuit) ou laissez les limites de débit par défaut. *(L'intégration Turnstile côté page peut être ajoutée ensuite.)*

## 6. Vérification finale

1. Ouvrez `https://espace-finances-tn.pages.dev`, créez un compte, enregistrez une simulation dans chaque outil.
2. Vérifiez les en-têtes sur <https://securityheaders.com> (attendu : note A).
3. Dans Supabase → **Advisors → Security**, aucune alerte ne doit apparaître.

## Données personnelles (Tunisie)

Les données sont hébergées dans l'Union européenne. La loi organique 2004-63 encadre le transfert de données personnelles vers l'étranger : si l'application est ouverte au grand public, rapprochez-vous de l'INPDP pour la déclaration du traitement.
