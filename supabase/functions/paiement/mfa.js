/*
 * Orbite — double authentification exigée dans les fonctions serveur (module pur, testé sous Node).
 * Même règle que public.mfa_ok() : un compte qui a validé un facteur n'agit qu'avec une session « aal2 »
 * (mot de passe + code). Les comptes sans facteur ne changent pas.
 * Le jeton a déjà été vérifié par Supabase Auth (auth.getUser) : on n'en lit que la charge utile.
 * Copie identique dans paiement/, assistant/ et rappels-email/ (chaque fonction est déployée seule) ;
 * un test vérifie que les trois copies restent identiques.
 */

export const MESSAGE_MFA = "Double authentification requise : saisissez votre code pour continuer.";

export function niveauDuJeton(jeton) {
  try {
    const p = String(jeton || "").split(".")[1] || "";
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4);
    const charge = JSON.parse(atob(b64));
    return charge && charge.aal === "aal2" ? "aal2" : "aal1";
  } catch (_e) {
    return "aal1";
  }
}

export function mfaManquante(jeton, utilisateur) {
  const facteurs = (utilisateur && Array.isArray(utilisateur.factors)) ? utilisateur.factors : [];
  const protege = facteurs.some((f) => f && f.status === "verified");
  return protege && niveauDuJeton(jeton) !== "aal2";
}
