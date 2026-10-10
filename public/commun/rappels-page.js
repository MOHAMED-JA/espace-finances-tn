/*
 * Orbite — page des liens d'email : /rappels.html#d=<jeton> (désinscription) ou #c=<jeton> (confirmation d'adresse).
 * Le jeton est dans l'ancre (jamais envoyé au serveur web ni dans un Referer) et retiré de l'adresse dès la lecture.
 * Appels sans connexion aux fonctions de la base rappels_desinscrire / rappels_reabonner / rappels_confirmer_adresse,
 * qui n'acceptent qu'un jeton aléatoire et ne renvoient rien d'autre que le prénom.
 */
(function () {
  "use strict";
  var C = window.EF_CONFIG, doc = document;
  function $(id) { return doc.getElementById(id); }
  var m = /^#([dc])=([0-9a-f-]{36})$/i.exec(location.hash || "");
  try { history.replaceState(null, "", location.pathname); } catch (e) {}

  function afficher(o) {
    $("rp-titre").textContent = o.titre;
    $("rp-texte").textContent = o.texte;
    var b = $("rp-action");
    b.hidden = !o.action; b.disabled = false;
    if (o.action) { b.textContent = o.action; b.onclick = o.fn; }
    if (o.coche) $("rp-icone").innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    doc.title = o.titre + " — Orbite";
  }
  function rpc(nom, jeton) {
    return fetch(C.supabaseUrl + "/rest/v1/rpc/" + nom, {
      method: "POST", headers: { "apikey": C.supabaseCle, "Content-Type": "application/json" }, body: JSON.stringify({ p_jeton: jeton }),
      credentials: "omit", referrerPolicy: "no-referrer"
    }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }
  var RESEAU = { titre: "Pas de connexion", texte: "Votre demande n'a pas pu être envoyée. Vérifiez votre connexion, puis rouvrez le lien de l'email." };
  if (!m) {
    afficher({ titre: "Lien incomplet", texte: "Ouvrez le lien directement depuis l'email d'Orbite. Vous pouvez aussi gérer vos rappels dans Mon profil." });
    return;
  }
  var jeton = m[2].toLowerCase();
  if (m[1].toLowerCase() === "d") {
    var desinscrire = function () {
      rpc("rappels_desinscrire", jeton).then(function (r) {
        if (!r || !r.ok) return afficher({ titre: "Lien expiré", texte: "Ce lien de désinscription n'est plus valable. Gérez vos rappels dans Mon profil." });
        afficher({ coche: true, titre: "C'est noté" + (r.prenom ? ", " + r.prenom : ""),
          texte: "Vous ne recevrez plus de rappels par email. Ils restent visibles dans l'application, et vous pouvez les réactiver à tout moment dans Mon profil.",
          action: "Réactiver les emails", fn: reabonner });
      }, function () { afficher(RESEAU); });
    };
    var reabonner = function () {
      $("rp-action").disabled = true;
      rpc("rappels_reabonner", jeton).then(function (r) {
        if (!r || !r.ok) return afficher({ titre: "Lien expiré", texte: "Réactivez vos rappels dans Mon profil." });
        afficher({ coche: true, titre: "Emails réactivés", texte: "Vos rappels reviennent à 12 h 30, les jours où il y en a un. Changez d'avis à tout moment avec le lien en bas de chaque email.",
          action: "Me désinscrire", fn: desinscrire });
      }, function () { afficher(RESEAU); });
    };
    desinscrire();
  } else {
    $("rp-etiquette").textContent = "Confirmation d'adresse";
    rpc("rappels_confirmer_adresse", jeton).then(function (r) {
      if (!r || !r.ok) return afficher({ titre: "Lien expiré", texte: "Ce lien a déjà servi ou date de plus de 7 jours. Un nouvel email de confirmation part au prochain envoi, ou dès que vous rouvrez Orbite." });
      afficher({ coche: true, titre: "Adresse confirmée", texte: "Vos rappels Orbite arriveront désormais à " + r.adresse + ", à 12 h 30, les jours où il y en a un." });
    }, function () { afficher(RESEAU); });
  }
})();
