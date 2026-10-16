# Orbite pour Android (Google Play)

Application Android « Trusted Web Activity » : elle ouvre le site Orbite en plein écran, sans barre d'adresse,
avec l'icône, les raccourcis et le partage de PDF. Le contenu reste celui du site : chaque mise en ligne du site
met l'application à jour, sans republier sur Google Play.

- **Identifiant** : `tn.orbite.app` (définitif une fois publié).
- **Version** : `versionCode` 2, `versionName` 1.0.1 (à augmenter dans `app/build.gradle` et `twa-manifest.json`
  à chaque nouvel envoi sur Google Play).
- **Compilation** : `.github/workflows/android.yml` (GitHub Actions) produit l'AAB et l'APK **non signés**
  (`dl.google.com`, qui fournit les outils Android, n'est pas joignable depuis les sessions de travail).
- **Signature** : hors de GitHub, avec la **clé d'envoi** (`cle-envoi-orbite.jks`, alias `orbite`), gardée par le
  propriétaire. Jamais dans le dépôt ni dans les secrets du dépôt.
  - AAB : `jarsigner -keystore cle-envoi-orbite.jks orbite-non-signe.aab orbite` (copie renommée en `orbite.aab`).
  - APK : `java -jar outils/apksigner.jar sign --ks cle-envoi-orbite.jks --ks-key-alias orbite --out orbite.apk orbite-non-signe.apk`.
- **Lien site ↔ application** : `public/.well-known/assetlinks.json` contient l'empreinte SHA-256 de la clé
  d'envoi. Après le premier envoi, Google Play signe avec sa propre clé (« Signature d'application par Google
  Play ») : ajouter son empreinte SHA-256 (Play Console › Test et publication › Intégrité de l'application)
  dans ce fichier, sinon la barre d'adresse apparaît dans l'application installée depuis Google Play.
- **Paiement** : facturation Google Play activée (`features.playBilling`, bibliothèque
  `com.google.androidbrowserhelper:billing`, `PaymentActivity`). L'application s'ouvre sur `/espace/?source=play` :
  le site reconnaît l'application et n'y propose que le paiement Google Play (règle de Google Play), avec les
  produits consommables `orbite_mensuel`, `orbite_semestriel`, `orbite_annuel` vérifiés par la fonction serveur
  `paiement` (action `play`, secret Supabase `GOOGLE_PLAY_COMPTE_SERVICE`).
- **Régénérer le projet** : voir `generer.mjs`.
