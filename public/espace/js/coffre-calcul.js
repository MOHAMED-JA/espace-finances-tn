/*
 * Orbite — coffre à documents sur l'appareil (lot C, maquette C3 validée le 16 oct. 2026).
 * Rien ne quitte l'appareil : chaque document est chiffré (AES-GCM 256) avec une clé créée sur l'appareil et non
 * exportable ; la sauvegarde est un fichier chiffré par un mot de passe que seul l'utilisateur connaît (PBKDF2-SHA-256,
 * 310 000 itérations). Téléphone perdu sans sauvegarde = coffre perdu : c'est dit à l'utilisateur.
 * Fonctions pures autour de WebCrypto (navigateur, et Node 20+ pour les tests). Navigateur : window.CoffreCalcul.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.CoffreCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ITERATIONS = 310000, TAILLE_MAX = 15 * 1024 * 1024, MAX_DOCS = 200, FORMAT = "orbite-coffre-1";
  var CATS = [
    { cle: "paie", lib: "Fiches de paie", sous: "bulletins de salaire", ico: "salaire" },
    { cle: "credits", lib: "Crédits", sous: "contrat, tableau d'amortissement", ico: "credit" },
    { cle: "assurances", lib: "Assurances", sous: "auto, santé, décès, vie", ico: "bouclier" },
    { cle: "impots", lib: "Impôts", sous: "déclarations, attestations de retenue", ico: "fiche" },
    { cle: "banque", lib: "Banque et placements", sous: "relevés, bons du Trésor", ico: "portefeuille" },
    { cle: "logement", lib: "Logement", sous: "contrat de location, titre, factures", ico: "maison" },
    { cle: "autres", lib: "Autres", sous: "tout le reste", ico: "liste" }
  ];
  var CLES = CATS.map(function (c) { return c.cle; });
  function sub() { var c = (typeof self !== "undefined" && self.crypto) || (typeof globalThis !== "undefined" && globalThis.crypto); return c && c.subtle; }
  function alea(n) { var c = (typeof self !== "undefined" && self.crypto) || globalThis.crypto, a = new Uint8Array(n); c.getRandomValues(a); return a; }
  function texte(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : ""; }
  function deux(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + deux(d.getMonth() + 1) + "-" + deux(d.getDate()); }
  function isoValide(s) { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12); return iso(d) === s; }
  var enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null, dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
  function b64(u8) { var s = "", t = 0x8000; for (var i = 0; i < u8.length; i += t) s += String.fromCharCode.apply(null, u8.subarray(i, i + t)); return btoa(s); }
  function deB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  /* ---------- Clé de l'appareil et chiffrement ---------- */
  function nouvelleCle() { return sub().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  function chiffrer(cle, octets) {
    var iv = alea(12);
    return sub().encrypt({ name: "AES-GCM", iv: iv }, cle, octets).then(function (c) { return { iv: iv, data: new Uint8Array(c) }; });
  }
  function dechiffrer(cle, boite) { return sub().decrypt({ name: "AES-GCM", iv: boite.iv }, cle, boite.data).then(function (o) { return new Uint8Array(o); }); }
  function chiffrerJson(cle, obj) { return chiffrer(cle, enc.encode(JSON.stringify(obj))); }
  function dechiffrerJson(cle, boite) { return dechiffrer(cle, boite).then(function (o) { return JSON.parse(dec.decode(o)); }); }

  /* ---------- Fiche d'un document (chiffrée elle aussi) ---------- */
  function normaliserFiche(f) {
    f = f || {};
    return {
      id: texte(f.id, 24).replace(/[^\w-]/g, "") || "d" + Date.now().toString(36),
      cat: CLES.indexOf(f.cat) !== -1 ? f.cat : "autres", titre: texte(f.titre, 60) || texte(f.nom, 60) || "Document",
      nom: texte(f.nom, 120), type: texte(f.type, 80), taille: Math.max(0, Math.round(+f.taille || 0)),
      ajoute: isoValide(f.ajoute) ? f.ajoute : iso(new Date()),
      date: isoValide(f.date) ? f.date : "", quoi: texte(f.quoi, 60)
    };
  }
  function verifierFichier(f, n) {
    if (!f) return "Choisissez un fichier.";
    if (f.size > TAILLE_MAX) return "Fichier trop lourd : 15 Mo au plus.";
    if (n >= MAX_DOCS) return "Le coffre est plein : " + MAX_DOCS + " documents au plus.";
    return null;
  }
  /* ---------- Dates importantes ---------- */
  var MOTS_DATE = /(ech[eé]ance|expir|valable|validit[eé]|fin du contrat|jusqu.?au|renouvel|date limite|au plus tard|terme)/i;
  /* Dates d'un texte (« 20/12/2026 », « 20-12-2026 », « 20 décembre 2026 ») ; celle placée près d'un mot d'échéance d'abord. */
  var MOIS_LONG = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  function datesDans(t, aujourdhui) {
    var s = String(t || ""), sa = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), auj = aujourdhui || iso(new Date()), res = [];
    function ajouter(j, m, a, pos) {
      if (a < 100) a += 2000;
      var d = a + "-" + deux(m) + "-" + deux(j);
      if (!isoValide(d)) return;
      var autour = sa.slice(Math.max(0, pos - 60), pos + 10);
      res.push({ d: d, echeance: MOTS_DATE.test(autour), futur: d >= auj });
    }
    var re = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/g, x;
    while ((x = re.exec(sa))) ajouter(+x[1], +x[2], +x[3], x.index);
    var re2 = new RegExp("\\b(\\d{1,2})(?:er)?\\s+(" + MOIS_LONG.join("|") + ")\\s+(\\d{4})\\b", "g");
    while ((x = re2.exec(sa))) ajouter(+x[1], MOIS_LONG.indexOf(x[2]) + 1, +x[3], x.index);
    var futures = res.filter(function (r) { return r.futur; });
    futures.sort(function (a, b) { return (b.echeance - a.echeance) || (a.d < b.d ? -1 : 1); });
    return futures.map(function (r) { return r.d; }).filter(function (d, i, l) { return l.indexOf(d) === i; });
  }
  /* « À ne pas oublier » : dates des documents à venir (90 jours), puis l'attestation de retenue à demander en janvier. */
  function aNePasOublier(fiches, aujourdhui, o) {
    var auj = aujourdhui || iso(new Date()), a = +auj.slice(0, 4), m = +auj.slice(5, 7), l = [];
    (fiches || []).forEach(function (f) {
      if (!f.date || f.date < auj) return;
      var j = Math.round((new Date(f.date) - new Date(auj)) / 864e5);
      if (j <= 90) l.push({ cle: "doc-" + f.id, titre: (f.quoi || f.titre) + " : " + f.date, d: f.date, jours: j, doc: f.id, texte: "Date notée dans le document rangé ici." });
    });
    var salarie = !o || o.salarie !== false;
    if (salarie && (m >= 11 || m <= 2)) {
      var an = m >= 11 ? a : a - 1, deja = (fiches || []).some(function (f) { return f.cat === "impots" && f.ajoute >= (an + 1) + "-01-01"; });
      if (!deja) l.push({ cle: "attestation-" + an, titre: "Attestation de retenue " + an, d: (an + 1) + "-01-31", jours: null,
        texte: "À demander à votre employeur " + (m >= 11 ? "en janvier" : "maintenant") + " pour la déclaration de revenus." });
    }
    return l.sort(function (x, y) { return x.d < y.d ? -1 : 1; });
  }
  function parCategorie(fiches) {
    return CATS.map(function (c) {
      var l = (fiches || []).filter(function (f) { return f.cat === c.cle; }).sort(function (a, b) { return a.ajoute < b.ajoute ? 1 : -1; });
      return Object.assign({}, c, { n: l.length, dernier: l[0] || null, docs: l });
    });
  }

  /* ---------- Sauvegarde chiffrée par mot de passe ---------- */
  function cleMotDePasse(mdp, sel, iter) {
    return sub().importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return sub().deriveKey({ name: "PBKDF2", salt: sel, iterations: iter || ITERATIONS, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function forceMotDePasse(mdp) {
    var s = String(mdp || "");
    if (s.length < 10) return "10 caractères au moins.";
    if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return "Mélangez lettres et chiffres.";
    return null;
  }
  /* docs = [{ fiche, octets (Uint8Array) }] → texte JSON du fichier de sauvegarde. */
  function sauvegarde(mdp, docs, iter) {
    var sel = alea(16), it = iter || ITERATIONS;
    var contenu = { docs: docs.map(function (d) { return { fiche: normaliserFiche(d.fiche), octets: b64(d.octets) }; }) };
    return cleMotDePasse(mdp, sel, it).then(function (k) { return chiffrerJson(k, contenu); }).then(function (b) {
      return JSON.stringify({ format: FORMAT, kdf: "PBKDF2-SHA-256", iterations: it, sel: b64(sel), iv: b64(b.iv), data: b64(b.data), n: docs.length });
    });
  }
  function restaurer(mdp, texteFichier) {
    var f;
    try { f = JSON.parse(texteFichier); } catch (e) { return Promise.reject(new Error("format")); }
    if (!f || f.format !== FORMAT || !f.sel || !f.iv || !f.data) return Promise.reject(new Error("format"));
    return cleMotDePasse(mdp, deB64(f.sel), f.iterations).then(function (k) { return dechiffrerJson(k, { iv: deB64(f.iv), data: deB64(f.data) }); })
      .then(function (c) { return (c.docs || []).slice(0, MAX_DOCS).map(function (d) { return { fiche: normaliserFiche(d.fiche), octets: deB64(d.octets) }; }); },
        function () { throw new Error("mot de passe"); });
  }

  return { ITERATIONS: ITERATIONS, TAILLE_MAX: TAILLE_MAX, MAX_DOCS: MAX_DOCS, FORMAT: FORMAT, CATS: CATS,
    nouvelleCle: nouvelleCle, chiffrer: chiffrer, dechiffrer: dechiffrer, chiffrerJson: chiffrerJson, dechiffrerJson: dechiffrerJson,
    normaliserFiche: normaliserFiche, verifierFichier: verifierFichier, datesDans: datesDans, aNePasOublier: aNePasOublier, parCategorie: parCategorie,
    forceMotDePasse: forceMotDePasse, sauvegarde: sauvegarde, restaurer: restaurer, iso: iso };
});
