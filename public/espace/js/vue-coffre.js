/*
 * Orbite — Mon coffre (#coffre ; lot C, maquette C3 validée le 16 oct. 2026).
 * Papiers importants rangés par thème, chiffrés sur CET appareil (IndexedDB, clé AES-GCM non exportable, une base par compte),
 * ouverts par l'empreinte quand le verrouillage est activé. Rien n'est envoyé sur internet ; la sauvegarde est un fichier chiffré
 * par un mot de passe que l'utilisateur garde où il veut. Un document rangé peut mettre à jour Orbite (fiche de paie, crédit).
 * Calculs et chiffrement : coffre-calcul.js.
 */
(function () {
  "use strict";
  var O = window.Orbite, K = window.CoffreCalcul, doc = document;
  if (!O || !K || !doc.getElementById("vue-coffre")) return;
  var F = O.F, $ = O.$, SVG = "http://www.w3.org/2000/svg";
  var ouvert = false, cle = null, fiches = [], deplie = null, base = null, baseDe = null, minuterie = null;
  var DUREE = 5 * 60 * 1000;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function bouton(lib, cls, ico, attrs) {
    var b = cree("button", "bouton " + (cls || "")); b.type = "button";
    if (ico) b.appendChild(icone(ico)); if (lib) b.appendChild(doc.createTextNode(lib));
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function libDate(s) { var j = +s.slice(8, 10); return (j === 1 ? "1er" : j) + " " + MOIS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4); }
  function libMois(s) { return MOIS[+s.slice(5, 7) - 1] + " " + s.slice(0, 4); }
  function taille(o) { return o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + " ko" : (Math.round(o / 104857.6) / 10).toString().replace(".", ",") + " Mo"; }

  /* ---------- Base de l'appareil (une par compte) ---------- */
  function nomBase() { var u = O.utilisateur && O.utilisateur(); return "orbite-coffre-" + (u && u.id ? u.id : "local"); }
  function ouvrirBase() {
    var nom = nomBase();
    if (base && baseDe === nom) return Promise.resolve(base);
    return new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error("indexeddb"));
      var r = indexedDB.open(nom, 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore("cle"); d.createObjectStore("docs", { keyPath: "id" }); };
      r.onsuccess = function () { base = r.result; baseDe = nom; ok(base); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function tx(store, mode, fn) {
    return ouvrirBase().then(function (d) {
      return new Promise(function (ok, ko) {
        var t = d.transaction(store, mode), s = t.objectStore(store), res = fn(s);
        t.oncomplete = function () { ok(typeof IDBRequest !== "undefined" && res instanceof IDBRequest ? res.result : res); };
        t.onerror = function () { ko(t.error); }; t.onabort = function () { ko(t.error); };
      });
    });
  }
  function cleAppareil() {
    return tx("cle", "readonly", function (s) { return s.get("appareil"); }).then(function (k) {
      if (k) return k;
      return K.nouvelleCle().then(function (n) { return tx("cle", "readwrite", function (s) { s.put(n, "appareil"); }).then(function () { return n; }); });
    });
  }
  function lireFiches() {
    return tx("docs", "readonly", function (s) { return s.getAll(); }).then(function (l) {
      return Promise.all((l || []).map(function (r) { return K.dechiffrerJson(cle, r.meta).then(function (m) { return K.normaliserFiche(m); }, function () { return null; }); }));
    }).then(function (l) { return l.filter(Boolean); });
  }
  function enregistrerDoc(fiche, octets) {
    var f = K.normaliserFiche(fiche);
    return Promise.all([K.chiffrerJson(cle, f), octets ? K.chiffrer(cle, octets) : null]).then(function (b) {
      return tx("docs", "readwrite", function (s) {
        if (octets) s.put({ id: f.id, meta: b[0], contenu: b[1] });
        else { var g = s.get(f.id); g.onsuccess = function () { if (g.result) s.put({ id: f.id, meta: b[0], contenu: g.result.contenu }); }; }
      });
    }).then(function () { return f; });
  }
  function lireContenu(id) {
    return tx("docs", "readonly", function (s) { return s.get(id); }).then(function (r) { if (!r) throw new Error("absent"); return K.dechiffrer(cle, r.contenu); });
  }
  function supprimerDoc(id) { return tx("docs", "readwrite", function (s) { s.delete(id); }); }

  /* ---------- Ouvrir / refermer ---------- */
  function relancer() { clearTimeout(minuterie); minuterie = setTimeout(fermer, DUREE); }
  function fermer() { ouvert = false; cle = null; fiches = []; deplie = null; clearTimeout(minuterie); rendre(); }
  function ouvrir() {
    var v = window.OrbiteVerrou && window.OrbiteVerrou.verifier ? window.OrbiteVerrou.verifier() : Promise.resolve(null);
    return v.then(function (ok) {
      if (ok === false) { O.toast("Coffre resté fermé", { type: "info", detail: "L'empreinte n'a pas été confirmée." }); return; }
      return cleAppareil().then(function (k) { cle = k; return lireFiches(); }).then(function (l) {
        fiches = l; ouvert = true; relancer(); rendre();
      });
    }).catch(function () { O.toast("Le coffre n'a pas pu s'ouvrir sur cet appareil", { erreur: true, detail: "Le navigateur bloque peut-être le stockage (navigation privée)." }); });
  }
  doc.addEventListener("visibilitychange", function () { if (doc.hidden && ouvert) fermer(); });
  ["click", "keydown"].forEach(function (t) { $("vue-coffre").addEventListener(t, function () { if (ouvert) relancer(); }); });

  /* ===================================================================
     Rendu
     =================================================================== */
  function rendre() {
    var z = $("cf-zone"); if (!z || $("vue-coffre").hidden) return;
    z.textContent = "";
    var bandeau = cree("div", "cf-bandeau"); bandeau.appendChild(icone("cadenas"));
    var bt = cree("div");
    bt.appendChild(cree("b", null, "Rangé et chiffré sur cet appareil uniquement. Rien n'est envoyé sur internet."));
    var verrou = window.OrbiteVerrou && window.OrbiteVerrou.actif && window.OrbiteVerrou.actif();
    var s = cree("span", null, verrou ? "Ouverture par votre empreinte." : "Pour l'ouvrir par votre empreinte, activez le verrouillage : ");
    if (!verrou) { var a = cree("a", "lien-action", "Paramètres › Sécurité"); a.href = "#compte?onglet=securite"; s.appendChild(a); }
    bt.appendChild(s); bandeau.appendChild(bt); z.appendChild(bandeau);
    if (!ouvert) {
      var p = cree("section", "panneau cf-ferme"), ic = cree("span", "pa-vide__ico"); ic.appendChild(icone("cadenas")); p.appendChild(ic);
      p.appendChild(cree("h2", null, "Votre coffre est fermé"));
      p.appendChild(cree("p", null, "Fiches de paie, contrats de crédit et d'assurance, déclarations d'impôt : vos papiers importants rangés par thème, retrouvés en deux gestes. Il se referme tout seul après 5 minutes sans activité ou quand vous quittez l'application."));
      p.appendChild(bouton(verrou ? "Ouvrir avec mon empreinte" : "Ouvrir le coffre", "bouton--plein", "cadenas", { "data-cf": "ouvrir" }));
      z.appendChild(p);
      return;
    }
    var cats = K.parCategorie(fiches);
    var liste = cree("section", "panneau pa-carte"), ul = cree("ul", "cpt-liste"); ul.setAttribute("role", "list");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, fiches.length ? fiches.length + (fiches.length > 1 ? " documents rangés" : " document rangé") : "Aucun document pour l'instant"));
    tete.appendChild(bouton("Refermer", "bouton--petit bouton--fantome", "cadenas", { "data-cf": "fermer" }));
    liste.appendChild(tete);
    cats.forEach(function (c) {
      var li = cree("li"), b = cree("button", "cpt-ligne pa-ligne"); b.type = "button"; b.setAttribute("data-cf-cat", c.cle);
      b.setAttribute("aria-expanded", deplie === c.cle ? "true" : "false");
      var ico = cree("span", "cpt-ligne__ico pa-ico cf-ico"); ico.appendChild(icone(c.ico));
      var t = cree("span", "cpt-ligne__txt"); t.appendChild(cree("b", null, c.lib));
      t.appendChild(cree("small", null, c.n ? c.n + (c.n > 1 ? " documents" : " document") + " · dernier : " + c.dernier.titre : c.sous));
      var mt = cree("span", "cpt-ligne__mt chiffre"); mt.appendChild(cree("b", null, String(c.n)));
      var chev = cree("span", "cpt-ligne__mod cf-chev"); chev.appendChild(icone("chevron"));
      b.appendChild(ico); b.appendChild(t); b.appendChild(mt); b.appendChild(chev);
      b.setAttribute("aria-label", c.lib + " : " + c.n + " document" + (c.n > 1 ? "s" : ""));
      li.appendChild(b);
      if (deplie === c.cle) {
        var dl = cree("ul", "cf-docs"); dl.setAttribute("role", "list");
        if (!c.n) dl.appendChild(cree("li", "cf-doc cf-doc--vide", "Rien ici pour l'instant."));
        c.docs.forEach(function (d) {
          var di = cree("li", "cf-doc"), txt = cree("div");
          txt.appendChild(cree("b", null, d.titre));
          txt.appendChild(cree("small", null, [libDate(d.ajoute), taille(d.taille), d.date ? (d.quoi || "date") + " : " + libDate(d.date) : ""].filter(Boolean).join(" · ")));
          var ac = cree("div", "cf-doc__actions");
          ac.appendChild(bouton("Ouvrir", "bouton--petit", "sortie-externe", { "data-cf-ouvrir": d.id }));
          if (c.cle === "paie" || c.cle === "credits") ac.appendChild(bouton("Mettre Orbite à jour", "bouton--petit bouton--fantome", "retablir", { "data-cf-lire": d.id }));
          ac.appendChild(bouton("", "bouton--petit bouton--icone bouton--fantome", "crayon", { "data-cf-modifier": d.id, "aria-label": "Modifier " + d.titre }));
          di.appendChild(txt); di.appendChild(ac); dl.appendChild(di);
        });
        li.appendChild(dl);
      }
      ul.appendChild(li);
    });
    liste.appendChild(ul); z.appendChild(liste);
    var p2 = O.profil() || {}, rappels = K.aNePasOublier(fiches, K.iso(new Date()), { salarie: p2.activite !== "retraite" });
    if (rappels.length) {
      var r = cree("section", "panneau pa-carte"); r.appendChild(cree("h2", "pa-carte__titre", "À ne pas oublier"));
      var ru = cree("ul", "cpt-points__liste"); ru.setAttribute("role", "list");
      rappels.forEach(function (x) {
        var li = cree("li", "cpt-point cpt-point--faible"), ic = cree("span", "cpt-point__ico"); ic.appendChild(icone("alerte"));
        var t = cree("div"); t.appendChild(cree("b", null, x.doc ? x.titre.replace(/ : \d{4}-\d{2}-\d{2}$/, "") + " : " + libDate(x.d) : x.titre)); t.appendChild(cree("span", null, x.texte));
        li.appendChild(ic); li.appendChild(t); ru.appendChild(li);
      });
      r.appendChild(ru); z.appendChild(r);
    }
    var act = cree("div", "pa-actions");
    act.appendChild(bouton("Ranger un document", "bouton--plein", "plus", { "data-cf": "ranger" }));
    act.appendChild(bouton("Sauvegarde chiffrée", "", "telecharger", { "data-cf": "sauvegarde" }));
    z.appendChild(act);
    z.appendChild(cree("p", "cpt-note", "À savoir : le coffre vit sur cet appareil seulement. Téléphone perdu ou données du navigateur effacées = coffre perdu, sauf si vous avez une sauvegarde chiffrée. Faites-en une de temps en temps et gardez-la où vous voulez (clé USB, votre propre cloud) : sans votre mot de passe, elle est illisible."));
  }

  /* ===================================================================
     Ranger, modifier, ouvrir
     =================================================================== */
  var entree = cree("input"); entree.type = "file"; entree.hidden = true; entree.id = "cf-fichier";
  entree.accept = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*"; doc.body.appendChild(entree);
  var dlg = $("dlg-coffre"), edition = null;
  function erreur(t) { var e = $("cf-dlg-err"); e.textContent = t || ""; e.hidden = !t; }
  function remplirCats() {
    var s = $("cf-f-cat"); if (s.options.length) return;
    K.CATS.forEach(function (c) { var o = cree("option", null, c.lib); o.value = c.cle; s.appendChild(o); });
  }
  function categorieDevinee(nom) {
    var n = String(nom || "").toLowerCase();
    if (/paie|salaire|bulletin/.test(n)) return "paie";
    if (/credit|crédit|pret|prêt|amortissement|echeancier/.test(n)) return "credits";
    if (/assur|police|contrat auto|sante|santé/.test(n)) return "assurances";
    if (/impot|impôt|declaration|déclaration|retenue|fiscal/.test(n)) return "impots";
    if (/releve|relevé|banque|bta|tresor|trésor/.test(n)) return "banque";
    if (/loyer|location|bail|steg|sonede|syndic/.test(n)) return "logement";
    return deplie || "autres";
  }
  function editer(fiche, fichier) {
    remplirCats();
    edition = { fiche: fiche, fichier: fichier || null };
    $("cf-dlg-titre").textContent = fichier ? "Ranger un document" : "Modifier le document";
    $("cf-f-titre").value = fiche.titre; $("cf-f-cat").value = fiche.cat; $("cf-f-date").value = fiche.date || ""; $("cf-f-quoi").value = fiche.quoi || "";
    $("cf-dlg-fichier").textContent = (fiche.nom || "Document") + " · " + taille(fiche.taille);
    $("cf-dlg-supprimer").hidden = !!fichier; $("cf-dlg-confirmer").hidden = true;
    $("cf-dlg-date-aide").textContent = "Facultatif : fin de contrat, échéance… Orbite vous le rappelle ici.";
    erreur(""); dlg.showModal(); $("cf-f-titre").focus();
    /* PDF : la date d'échéance est cherchée dans le texte, sur l'appareil. */
    if (fichier && /pdf/i.test(fichier.type || fichier.name) && window.FicheLecture && !fiche.date) {
      window.FicheLecture.lire(fichier, { pagesMax: 3, texteSeul: true }).then(function (r) {
        var t = (r.lignes || []).map(function (l) { return l.texte; }).join("\n"), ds = K.datesDans(t, K.iso(new Date()));
        if (ds.length && edition && edition.fichier === fichier && !$("cf-f-date").value) {
          $("cf-f-date").value = ds[0];
          $("cf-dlg-date-aide").textContent = "Date lue dans le document : vérifiez-la.";
          if (!$("cf-f-quoi").value) $("cf-f-quoi").value = "Échéance";
        }
      }).catch(function () {});
    }
  }
  entree.addEventListener("change", function () {
    var f = entree.files && entree.files[0]; entree.value = "";
    if (!f || !ouvert) return;
    var e = K.verifierFichier(f, fiches.length);
    if (e) { O.toast(e, { erreur: true }); return; }
    editer(K.normaliserFiche({ id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nom: f.name, titre: f.name.replace(/\.[^.]+$/, ""), type: f.type, taille: f.size, cat: categorieDevinee(f.name) }), f);
  });
  $("form-coffre").addEventListener("submit", function (e) {
    var v = e.submitter && e.submitter.value;
    if (v !== "ok" || !edition || !ouvert) return;
    var titre = $("cf-f-titre").value.trim();
    if (!titre) { e.preventDefault(); erreur("Donnez un titre au document."); return; }
    var f = Object.assign({}, edition.fiche, { titre: titre, cat: $("cf-f-cat").value, date: $("cf-f-date").value || "", quoi: $("cf-f-quoi").value.trim() });
    var fichier = edition.fichier; edition = null;
    var lecture = fichier ? fichier.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : Promise.resolve(null);
    lecture.then(function (o) { return enregistrerDoc(f, o); }).then(function (n) {
      fiches = fiches.filter(function (x) { return x.id !== n.id; }).concat([n]); deplie = n.cat; rendre();
      O.toast(fichier ? "Document rangé et chiffré sur cet appareil" : "Document modifié");
    }, function () { O.toast("Le document n'a pas pu être rangé", { erreur: true, detail: "Espace de stockage plein sur cet appareil ?" }); });
  });
  $("cf-dlg-supprimer").addEventListener("click", function () { $("cf-dlg-confirmer").hidden = false; $("cf-dlg-supprimer-oui").focus(); });
  $("cf-dlg-supprimer-oui").addEventListener("click", function () {
    if (!edition) return;
    var id = edition.fiche.id; dlg.close(); edition = null;
    supprimerDoc(id).then(function () { fiches = fiches.filter(function (x) { return x.id !== id; }); rendre(); O.toast("Document supprimé de cet appareil"); });
  });
  function fichierDe(id) {
    var f = fiches.filter(function (x) { return x.id === id; })[0];
    return lireContenu(id).then(function (o) { return { fiche: f, blob: new Blob([o], { type: f.type || "application/octet-stream" }) }; });
  }

  /* ===================================================================
     Sauvegarde chiffrée
     =================================================================== */
  var dlgS = $("dlg-coffre-sauvegarde");
  function erreurS(t) { var e = $("cfs-err"); e.textContent = t || ""; e.hidden = !t; }
  $("cfs-exporter").addEventListener("click", function () {
    var m1 = $("cfs-mdp").value, m2 = $("cfs-mdp2").value, f = K.forceMotDePasse(m1);
    if (f) return erreurS("Mot de passe : " + f.toLowerCase());
    if (m1 !== m2) return erreurS("Les deux mots de passe ne sont pas identiques.");
    if (!fiches.length) return erreurS("Le coffre est vide : rien à sauvegarder.");
    erreurS(""); this.disabled = true; var b = this;
    Promise.all(fiches.map(function (x) { return lireContenu(x.id).then(function (o) { return { fiche: x, octets: o }; }); }))
      .then(function (docs) { return K.sauvegarde(m1, docs); })
      .then(function (t) {
        O.telecharger("coffre-orbite-" + K.iso(new Date()) + ".orbite", t, "application/octet-stream");
        dlgS.close(); O.toast("Sauvegarde chiffrée prête", { detail: "Gardez le fichier où vous voulez, et votre mot de passe en lieu sûr : sans lui, personne ne peut l'ouvrir, pas même Orbite." });
      }, function () { erreurS("La sauvegarde n'a pas pu être créée."); })
      .then(function () { b.disabled = false; });
  });
  $("cfs-restaurer").addEventListener("click", function () {
    var fic = $("cfs-fichier").files && $("cfs-fichier").files[0], mdp = $("cfs-mdp-r").value, b = this;
    if (!fic) return erreurS("Choisissez le fichier de sauvegarde.");
    if (!mdp) return erreurS("Indiquez le mot de passe de la sauvegarde.");
    erreurS(""); b.disabled = true;
    fic.text().then(function (t) { return K.restaurer(mdp, t); }).then(function (docs) {
      var ids = {}; fiches.forEach(function (x) { ids[x.id] = true; });
      var nouveaux = docs.filter(function (d) { return !ids[d.fiche.id]; }).slice(0, K.MAX_DOCS - fiches.length);
      return nouveaux.reduce(function (p, d) { return p.then(function () { return enregistrerDoc(d.fiche, d.octets); }); }, Promise.resolve()).then(function () { return nouveaux.length; });
    }).then(function (n) {
      return lireFiches().then(function (l) { fiches = l; rendre(); dlgS.close(); O.toast(n ? n + (n > 1 ? " documents restaurés" : " document restauré") : "Rien de nouveau : ces documents étaient déjà là"); });
    }, function (err) { erreurS(/mot de passe/.test(err && err.message) ? "Mot de passe incorrect pour cette sauvegarde." : "Ce fichier n'est pas une sauvegarde de coffre Orbite."); })
      .then(function () { b.disabled = false; });
  });

  /* ---------- Points d'entrée ---------- */
  $("vue-coffre").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cf], [data-cf-cat], [data-cf-ouvrir], [data-cf-modifier], [data-cf-lire]");
    if (!b) return;
    var a = b.getAttribute("data-cf");
    if (a === "ouvrir") return ouvrir();
    if (a === "fermer") return fermer();
    if (!ouvert) return;
    if (a === "ranger") return entree.click();
    if (a === "sauvegarde") { ["cfs-mdp", "cfs-mdp2", "cfs-mdp-r"].forEach(function (id) { $(id).value = ""; }); $("cfs-fichier").value = ""; erreurS(""); dlgS.showModal(); return; }
    if (b.hasAttribute("data-cf-cat")) { var c = b.getAttribute("data-cf-cat"); deplie = deplie === c ? null : c; rendre(); var n = doc.querySelector('[data-cf-cat="' + c + '"]'); if (n) n.focus(); return; }
    if (b.hasAttribute("data-cf-modifier")) { var f = fiches.filter(function (x) { return x.id === b.getAttribute("data-cf-modifier"); })[0]; if (f) editer(f, null); return; }
    if (b.hasAttribute("data-cf-ouvrir")) {
      return fichierDe(b.getAttribute("data-cf-ouvrir")).then(function (r) { O.telecharger(r.fiche.nom || r.fiche.titre, r.blob); },
        function () { O.toast("Ce document n'a pas pu être ouvert", { erreur: true }); });
    }
    if (b.hasAttribute("data-cf-lire")) {
      return fichierDe(b.getAttribute("data-cf-lire")).then(function (r) {
        var fic = new File([r.blob], r.fiche.nom || "document", { type: r.fiche.type });
        if (window.OrbiteRecevoir) window.OrbiteRecevoir.montrer([fic]);
      });
    }
  });
  window.OrbiteCoffre = { rendre: rendre, fermer: fermer, ouvert: function () { return ouvert; } };
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "coffre") rendre(); else if (ouvert) relancer(); });
})();
