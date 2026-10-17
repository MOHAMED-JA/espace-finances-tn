/*
 * Orbite — verrouillage de l'application par empreinte ou visage (16 oct. 2026, maquette validée).
 * Réglage propre à l'appareil (localStorage « ef-verrou » : identifiant de la clé, délai, compte).
 * WebAuthn avec l'authentificateur de l'appareil et vérification de l'utilisateur obligatoire : rien n'est envoyé
 * au serveur. Le verrou protège un téléphone laissé ouvert ; la double authentification protège le compte.
 * Ouverture à froid (nouvel onglet, application relancée) : verrouillée. Retour d'arrière-plan : après le délai.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var ecran = $("verrou"), app = doc.querySelector(".app");
  if (!ecran || !app) return;
  var CLE = "ef-verrou", QUITTE = "ef-verrou-quitte", OUVERT = "ef-verrou-ouvert";

  function lire() { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) { return null; } }
  function ecrire(v) { try { if (v) localStorage.setItem(CLE, JSON.stringify(v)); else localStorage.removeItem(CLE); } catch (e) {} }
  function idCompte() { var u = O && O.utilisateur && O.utilisateur(); return u && u.id; }
  function reglage() { var r = lire(), id = idCompte(); return r && r.cle && (!id || !r.compte || r.compte === id) ? r : null; }

  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function deb64(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
  function hasard(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

  function disponible() {
    if (!window.PublicKeyCredential || !navigator.credentials || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
  }

  /* ---------- Verrouiller / déverrouiller ---------- */
  var verrouille = false;
  /* L'écran verrouillé est une fenêtre modale : tout le reste devient inerte. Une autre fenêtre qui s'ouvrirait
     pendant le verrou (« Quoi de neuf », un rappel) passe dessous : l'écran est remis au premier plan. */
  function auPremierPlan() {
    if (!verrouille) return;
    if (ecran.open) ecran.close();
    ecran.showModal();
    $("verrou-ouvrir").focus();
  }
  var veille = new MutationObserver(function (m) {
    if (verrouille && m.some(function (x) { return x.target !== ecran && x.target.hasAttribute("open"); })) auPremierPlan();
  });
  function verrouiller() {
    if (verrouille || !reglage()) return;
    verrouille = true;
    doc.documentElement.classList.add("verrouille");
    app.setAttribute("inert", "");
    $("verrou-erreur").hidden = true;
    try { sessionStorage.removeItem(OUVERT); } catch (e) {}
    veille.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    auPremierPlan();
  }
  function liberer() {
    verrouille = false;
    veille.disconnect();
    doc.documentElement.classList.remove("verrouille");
    app.removeAttribute("inert");
    if (ecran.open) ecran.close();
    try { sessionStorage.setItem(OUVERT, "1"); } catch (e) {}
  }
  /* Échap ne ferme pas l'écran verrouillé. */
  ecran.addEventListener("cancel", function (e) { e.preventDefault(); });
  function deverrouiller() {
    var r = reglage(), b = $("verrou-ouvrir");
    if (!r) { liberer(); return Promise.resolve(true); }
    if (b.disabled) return Promise.resolve(false);
    b.disabled = true;
    return navigator.credentials.get({ publicKey: {
      challenge: hasard(32), rpId: location.hostname, timeout: 60000, userVerification: "required",
      allowCredentials: [{ type: "public-key", id: deb64(r.cle) }]
    } }).then(function (c) {
      if (!c) throw new Error("vide");
      liberer();
      return true;
    }).catch(function (err) {
      var el = $("verrou-erreur");
      el.textContent = err && err.name === "NotAllowedError" ? "Déverrouillage annulé ou refusé. Touchez de nouveau, ou utilisez votre mot de passe." : "Le déverrouillage n'a pas abouti sur cet appareil. Utilisez votre mot de passe.";
      el.hidden = false;
      return false;
    }).finally(function () { b.disabled = false; });
  }
  $("verrou-ouvrir").addEventListener("click", deverrouiller);
  $("verrou-mdp").addEventListener("click", function () {
    /* Repasser par le mot de passe : déconnexion de cet appareil seulement, puis la page de connexion. */
    /* La page n'est plus « protégée » d'abord : une seule redirection, la nôtre (pas celle de la déconnexion). */
    doc.documentElement.removeAttribute("data-protege");
    E.client.auth.signOut({ scope: "local" }).catch(function () {}).then(function () {
      location.replace("/connexion.html?suite=" + encodeURIComponent(location.pathname + location.hash));
    });
  });
  /* Pas d'Échap ni de Tab qui sortent de l'écran verrouillé. */
  ecran.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      var a = $("verrou-ouvrir"), z = $("verrou-mdp");
      if (e.shiftKey && doc.activeElement === a) { z.focus(); e.preventDefault(); }
      else if (!e.shiftKey && doc.activeElement === z) { a.focus(); e.preventDefault(); }
    }
  });

  /* Arrière-plan : l'heure de sortie ; au retour, verrou si le délai est passé. */
  doc.addEventListener("visibilitychange", function () {
    var r = reglage(); if (!r) return;
    if (doc.visibilityState === "hidden") { try { localStorage.setItem(QUITTE, String(Date.now())); } catch (e) {} return; }
    var quitte = 0; try { quitte = Number(localStorage.getItem(QUITTE)) || 0; } catch (e) {}
    if (quitte && Date.now() - quitte >= (Number(r.delai) || 0) * 1000) verrouiller();
  });

  /* ---------- Réglage (Paramètres › Sécurité) ---------- */
  var interr = $("verrou-actif"), delai = $("verrou-delai");
  function rendreReglage() {
    var r = reglage();
    interr.checked = !!r;
    if (r) delai.value = String(r.delai);
    /* Le délai reste choisissable interrupteur éteint : il est repris à l'activation. */
    return disponible().then(function (ok) {
      $("verrou-indispo").hidden = ok || !!r;
      interr.disabled = !ok && !r;
    });
  }
  interr.addEventListener("change", function () {
    if (!interr.checked) { ecrire(null); rendreReglage(); O.toast("Verrouillage par empreinte désactivé sur cet appareil."); return; }
    interr.disabled = true;
    var u = O.utilisateur && O.utilisateur();
    navigator.credentials.create({ publicKey: {
      challenge: hasard(32),
      rp: { name: "Orbite", id: location.hostname },
      user: { id: hasard(16), name: (u && u.email) || "orbite", displayName: (u && u.email) || "Orbite" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      attestation: "none", timeout: 60000
    } }).then(function (c) {
      ecrire({ cle: b64(c.rawId), delai: Number(delai.value) || 60, compte: u && u.id });
      try { sessionStorage.setItem(OUVERT, "1"); } catch (e) {}
      O.toast("Verrouillage activé : Orbite vous demandera votre empreinte ou votre visage.");
    }).catch(function () {
      interr.checked = false;
      O.toast("L'empreinte ou le visage n'ont pas été enregistrés. Rien n'a changé.");
    }).finally(function () { interr.disabled = false; rendreReglage(); });
  });
  delai.addEventListener("change", function () {
    var r = lire(); if (!r) return;
    r.delai = Number(delai.value) || 0; ecrire(r);
  });

  /* Démarrage : ouverture à froid verrouillée (sauf juste après la connexion ou un déverrouillage dans cet onglet). */
  function demarrer() {
    rendreReglage();
    var ouvert = false; try { ouvert = sessionStorage.getItem(OUVERT) === "1"; } catch (e) {}
    if (reglage() && !ouvert) verrouiller();
  }
  /* Verrou posé tout de suite (avant l'affichage des chiffres), réglage relu une fois Orbite prête. */
  (function () { var ouvert = false; try { ouvert = sessionStorage.getItem(OUVERT) === "1"; } catch (e) {} if (lire() && !ouvert) verrouiller(); })();
  if (O.pret) demarrer(); else doc.addEventListener("orbite:pret", demarrer, { once: true });

  /* Mon coffre (lot C) : confirmer l'empreinte sans verrouiller l'application. null : verrouillage non activé. */
  function verifier() {
    var r = reglage();
    if (!r) return Promise.resolve(null);
    return navigator.credentials.get({ publicKey: {
      challenge: hasard(32), rpId: location.hostname, timeout: 60000, userVerification: "required",
      allowCredentials: [{ type: "public-key", id: deb64(r.cle) }]
    } }).then(function (c) { return !!c; }, function () { return false; });
  }
  window.OrbiteVerrou = { verrouiller: verrouiller, deverrouiller: deverrouiller, verifier: verifier, actif: function () { return !!reglage(); }, verrouille: function () { return verrouille; } };
})();
