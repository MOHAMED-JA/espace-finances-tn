/*
 * Double authentification (TOTP, Supabase MFA) — 16 oct. 2026, maquette validée.
 * Partagé par la page de connexion (étape « code à 6 chiffres ») et l'espace (Paramètres › Sécurité, garde).
 * Côté serveur, la migration 0016 refuse les données d'un compte protégé sans session « aal2 ».
 */
(function () {
  "use strict";
  /* Niveau d'assurance de la session (jeton JWT) : « aal1 » mot de passe seul, « aal2 » avec le code. */
  function aalDe(session) {
    try {
      var p = String(session.access_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      return JSON.parse(atob(p)).aal || "aal1";
    } catch (e) { return "aal1"; }
  }
  function verifies(user) {
    return ((user && user.factors) || []).filter(function (f) { return f.status === "verified" && f.factor_type === "totp"; });
  }
  /* Le code est-il encore demandé à cette session ? */
  function requis(user, session) { return verifies(user).length > 0 && aalDe(session) !== "aal2"; }

  /* Vérifie un code avec chacun des appareils enregistrés (téléphone principal, appareil de secours). */
  function verifier(client, code) {
    return client.auth.mfa.listFactors().then(function (r) {
      if (r.error) throw r.error;
      var liste = (r.data && r.data.totp) || [];
      if (!liste.length) throw new Error("Aucun appareil de double authentification n'est enregistré.");
      var derniere = null;
      return liste.reduce(function (p, f) {
        return p.then(function (ok) {
          if (ok) return true;
          return client.auth.mfa.challengeAndVerify({ factorId: f.id, code: code }).then(function (v) {
            if (v.error) { derniere = v.error; return false; }
            return true;
          });
        });
      }, Promise.resolve(false)).then(function (ok) { if (!ok) throw derniere || new Error("Code incorrect."); return true; });
    });
  }
  function codeValide(c) { return /^\d{6}$/.test(String(c || "").replace(/\s/g, "")); }
  function messageErreur(err) {
    var m = String((err && (err.message || err.msg)) || "");
    if (/invalid.*code|code.*invalid|incorrect|expired|mfa_verification_failed/i.test(m) || (err && err.code === "mfa_verification_failed")) return "Code incorrect ou expiré. Tapez le code affiché maintenant dans votre application.";
    if (/rate|too many/i.test(m)) return "Trop d'essais. Patientez une minute, puis réessayez.";
    if (/mfa.*disabled|not.*enabled|factor.*disabled/i.test(m)) return "La double authentification n'est pas encore ouverte sur le serveur d'Orbite. Réessayez plus tard.";
    return m || "La vérification n'a pas abouti. Réessayez.";
  }
  window.EFMfa = { aalDe: aalDe, verifies: verifies, requis: requis, verifier: verifier, codeValide: codeValide, messageErreur: messageErreur };
})();
