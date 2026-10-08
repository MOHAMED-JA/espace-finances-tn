/*
 * Orbite — refus des mots de passe divulgués (fuites de données connues).
 * Équivalent de l'option « Leaked password protection » de Supabase (réservée à l'offre Pro),
 * réalisé dans le navigateur avec le service public Pwned Passwords (haveibeenpwned.com).
 *
 * Confidentialité (k-anonymat) : le mot de passe n'est JAMAIS envoyé. On calcule son empreinte
 * SHA-1 localement, on n'envoie que ses 5 premiers caractères, et la comparaison des suffixes
 * reçus se fait ici. L'option « Add-Padding » masque même la taille de la réponse.
 * En cas de panne du service, on laisse passer (le mot de passe reste soumis aux autres règles).
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.EFFuites = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var API = "https://api.pwnedpasswords.com/range/";

  function sha1Hex(texte, sousTle) {
    var st = sousTle || (typeof crypto !== "undefined" && crypto.subtle);
    if (!st) return Promise.reject(new Error("crypto indisponible"));
    return st.digest("SHA-1", new TextEncoder().encode(texte)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("").toUpperCase();
    });
  }

  /* Nombre d'apparitions du suffixe dans la réponse « SUFFIXE:COMPTE » (0 si absent ou rembourrage). */
  function occurrences(reponse, suffixe) {
    var lignes = String(reponse || "").split(/\r?\n/);
    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i].trim(), p = l.indexOf(":");
      if (p > 0 && l.slice(0, p).toUpperCase() === suffixe) return parseInt(l.slice(p + 1), 10) || 0;
    }
    return 0;
  }

  /* Résout : nombre de fuites connues (0 = jamais vu), ou -1 si la vérification n'a pas pu se faire. */
  function verifier(mdp, options) {
    var o = options || {};
    var f = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!mdp || !f) return Promise.resolve(-1);
    var delai = o.delai || 4000, ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var minuterie = ctrl ? setTimeout(function () { ctrl.abort(); }, delai) : null;
    return sha1Hex(mdp, o.subtle).then(function (h) {
      var prefixe = h.slice(0, 5), suffixe = h.slice(5);
      return f(API + prefixe, { headers: { "Add-Padding": "true" }, signal: ctrl ? ctrl.signal : undefined, referrerPolicy: "no-referrer", credentials: "omit" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(function (t) { return occurrences(t, suffixe); });
    }).catch(function () { return -1; }).then(function (n) { if (minuterie) clearTimeout(minuterie); return n; });
  }

  var MESSAGE = "Ce mot de passe figure dans des fuites de données connues : choisissez-en un autre, que vous n'utilisez nulle part ailleurs.";

  return { verifier: verifier, occurrences: occurrences, sha1Hex: sha1Hex, MESSAGE: MESSAGE };
});
