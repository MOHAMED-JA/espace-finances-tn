/*
 * Orbite — Mon mois › Obligations (choisi le 28 oct. 2026) : vignette des voitures, assurance auto et factures du logement
 * reprises (Patrimoine › Assurances, Mon mois › Factures : jamais saisies deux fois), rentrée scolaire, Ramadan et Aïd,
 * somme à mettre de côté chaque mois. Calculs : obligations-calcul.js (sy.obligations). Gardé dans profil.obligations ;
 * chaque changement s'annule depuis le message.
 */
(function () {
  "use strict";
  var O = window.Orbite, OB = window.ObligationsCalcul, doc = document, SVG = "http://www.w3.org/2000/svg";
  if (!O || !OB) return;
  var $ = O.$, F = O.F;
  var zone = $("mo-obligations");
  if (!zone) return;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function bouton(lib, cls, ico, attrs) {
    var b = cree("button", "bouton " + (cls || "")); b.type = "button";
    if (ico) b.appendChild(icone(ico));
    b.appendChild(doc.createTextNode(lib));
    Object.keys(attrs || {}).forEach(function (k) { b.setAttribute(k, attrs[k]); });
    return b;
  }
  function panneau(titre, cls) { var s = cree("section", "panneau pa-carte" + (cls ? " " + cls : "")); if (titre) s.appendChild(cree("h2", "pa-carte__titre", titre)); return s; }
  function liste() { var ul = cree("ul", "cpt-liste"); ul.setAttribute("role", "list"); return ul; }
  function actions(btns) { var a = cree("div", "pa-actions"); btns.forEach(function (b) { a.appendChild(b); }); return a; }
  function dans(j) { return j === 0 ? "aujourd'hui" : j === 1 ? "demain" : j < 0 ? "dépassée" : "dans " + j + " jours"; }
  function cloner(x) { return JSON.parse(JSON.stringify(x)); }
  function obligations() { var p = O.profil(); return OB.normaliser(p && p.obligations); }
  /* Enregistre et propose « Annuler » (l'état d'avant est gardé). */
  function enregistrer(o, message) {
    var avant = cloner(obligations());
    O.majProfil({ obligations: o }, { immediat: true });
    O.toast(message, { action: { libelle: "Annuler", fn: function () { O.majProfil({ obligations: avant }, { immediat: true }); O.toast("Obligations revenues comme avant."); } } });
  }

  /* Une ligne (même aspect que Mes comptes et Factures) : pastille, nom et détail, montant à droite. */
  function ligne(ul, o) {
    var li = cree("li"), b = cree(o.lien ? "a" : "button", "cpt-ligne pa-ligne");
    if (o.lien) b.href = o.lien; else b.type = "button";
    Object.keys(o.data || {}).forEach(function (k) { b.setAttribute("data-" + k, o.data[k]); });
    var ico = cree("span", "cpt-ligne__ico pa-ico ob-ico ob-ico--" + o.type); ico.setAttribute("aria-hidden", "true"); ico.appendChild(icone(o.ico));
    var txt = cree("span", "cpt-ligne__txt"); txt.appendChild(cree("b", null, o.nom));
    var sous = cree("small", null, o.sous || "");
    if (o.badge) { sous.appendChild(doc.createTextNode(" ")); sous.appendChild(cree("em", "pi-badge pi-badge--" + o.badge[1], o.badge[0])); }
    txt.appendChild(sous);
    var mt = cree("span", "cpt-ligne__mt chiffre"); mt.appendChild(cree("b", null, o.montant)); mt.appendChild(cree("small", null, o.droite || ""));
    var fin = cree("span", "cpt-ligne__mod"); fin.appendChild(icone(o.lien ? "fleche" : "crayon"));
    b.appendChild(ico); b.appendChild(txt); b.appendChild(mt); b.appendChild(fin);
    b.setAttribute("aria-label", o.aria + (o.lien ? ". Ouvrir" : ". Modifier"));
    li.appendChild(b); ul.appendChild(li);
  }
  var ICO = { vignette: "credit", assurance: "bouclier", fete: "calendrier" };

  function rendre() {
    if (zone.hidden) return;
    var sy = O.synthese(); if (!sy) return;
    var an = sy.obligations || OB.analyser({}), o = obligations();
    zone.textContent = "";

    /* 1. Ce qu'il faut mettre de côté chaque mois. */
    var t = panneau(null, "pa-total ob-total");
    var tete = cree("div", "cpt-total__tete"); tete.appendChild(cree("h2", null, "À mettre de côté chaque mois")); t.appendChild(tete);
    t.appendChild(cree("p", "cpt-total__chiffre chiffre", F.dt3(an.parMois) + " DT / mois"));
    var p = an.prochaine;
    t.appendChild(cree("p", "cpt-note", p ? "Prochaine : " + p.libelle + ", " + p.dateLib + " (" + dans(p.jours) + ")" + (p.montant ? " · " + dt(p.montant) : "") + "."
      : "Ajoutez votre voiture ou suivez une fête : Orbite calcule ce qu'il faut mettre de côté chaque mois pour ne pas être pris de court."));
    zone.appendChild(t);
    an.lignes.filter(function (x) { return x.etat === "retard"; }).forEach(function (x) {
      var a = cree("p", "pi-alerte pi-alerte--danger"); a.setAttribute("role", "alert"); a.appendChild(icone("alerte"));
      a.appendChild(cree("span", null, x.libelle + " : la date limite (" + x.dateLib + ") est passée. Payez-la en ligne sur taxe-circulation.finances.gov.tn, puis cochez « payée »."));
      zone.appendChild(a);
    });

    /* 2. Toutes les obligations, dans l'ordre des dates. */
    var l = panneau("Vos obligations de l'année"), ul = liste(); ul.id = "ob-liste";
    an.lignes.forEach(function (x) {
      var sous = x.dateLib + " · " + (x.etat === "paye" ? "payée cette année" : dans(x.jours)) + (x.detail ? " · " + x.detail.split(" · ")[0] : "");
      ligne(ul, { type: x.type, ico: ICO[x.type], nom: x.libelle, sous: sous,
        badge: x.etat === "retard" ? ["En retard", "revoir"] : x.etat === "paye" ? ["Payée", "hausse"] : x.jours <= 30 ? ["Bientôt", "revoir"] : null,
        montant: x.montant != null ? F.dt0(x.montant) + " DT" : "—", droite: x.parMois > 0 ? F.dt3(x.parMois) + " / mois" : "",
        lien: x.type === "assurance" ? x.lien : null,
        data: x.type === "vignette" ? { "ob-vehicule": x.id } : x.type === "fete" ? { "ob-fete": x.sousType } : {},
        aria: x.libelle + ", " + x.dateLib + (x.montant != null ? ", " + F.dt0(x.montant) + " DT" : "") + (x.parMois > 0 ? ", " + F.dt3(x.parMois) + " DT à mettre de côté par mois" : "") });
    });
    if (!an.lignes.length) l.appendChild(cree("p", "cpt-note", "Rien pour l'instant. Commencez par votre voiture ou par une fête ci-dessous."));
    else l.appendChild(ul);
    zone.appendChild(l);

    /* 3. Voitures (vignette). */
    var v = panneau("Vos voitures : la vignette"), ulv = liste();
    o.vehicules.forEach(function (x) {
      var calc = OB.montantVignette(x.cv, x.carburant);
      ligne(ulv, { type: "vignette", ico: "credit", nom: x.nom, sous: x.cv + " CV · " + OB.NOMS_CARBURANT[x.carburant] + " · immatriculation " + (x.parite === "pair" ? "paire (5 mars)" : "impaire (5 avril)"),
        montant: F.dt0(x.montant > 0 ? x.montant : calc) + " DT", droite: x.montant > 0 ? "montant saisi" : "barème 2026", data: { "ob-vehicule": x.id },
        aria: x.nom + ", vignette " + F.dt0(x.montant > 0 ? x.montant : calc) + " DT" });
    });
    if (o.vehicules.length) v.appendChild(ulv);
    else v.appendChild(cree("p", "cpt-note", "Indiquez la puissance fiscale (sur la carte grise) et le dernier chiffre de l'immatriculation : Orbite calcule la vignette et sa date limite."));
    var btnsV = [];
    if (o.vehicules.length < OB.MAX_VEHICULES) btnsV.push(bouton("Ajouter une voiture", o.vehicules.length ? "" : "bouton--plein", "plus", { "data-ob-ajouter": "vehicule" }));
    v.appendChild(actions(btnsV));
    v.appendChild(cree("p", "cpt-note", "Vignette payée en ligne sur taxe-circulation.finances.gov.tn (plus d'autocollant depuis 2026). Montants : barème des voitures particulières ; vérifiez-le sur le site, vous pouvez saisir le vôtre."));
    zone.appendChild(v);

    /* 4. Assurance auto : reprise de Patrimoine › Assurances. */
    var aa = panneau("Assurance auto");
    var auto = an.lignes.filter(function (x) { return x.type === "assurance"; });
    aa.appendChild(cree("p", "cpt-note", auto.length ? "Reprise de vos assurances : modifiez-la là-bas, elle se met à jour ici." :
      "Aucune assurance auto notée. Ajoutez-la dans vos assurances (prime et échéance) : elle apparaîtra ici, sans la saisir deux fois."));
    aa.appendChild(actions([(function () { var a = cree("a", "bouton" + (auto.length ? "" : " bouton--plein"), auto.length ? "Ouvrir mes assurances" : "Ajouter mon assurance auto"); a.href = "#placements?onglet=assurances"; return a; })()]));
    zone.appendChild(aa);

    /* 5. Factures du logement : reprises de Mon mois › Factures. */
    var fa = panneau("STEG, SONEDE, internet et syndic"), ulf = liste();
    an.factures.forEach(function (f) {
      ligne(ulf, { type: "facture", ico: "liste", nom: f.nom, sous: f.date ? "prochaine ≈ " + f.dateLib : "date à préciser dans Factures",
        montant: F.dt0(f.montant) + " DT", droite: f.periode > 1 ? "tous les " + f.periode + " mois" : "par mois", lien: "#mois?onglet=factures",
        aria: f.nom + ", " + F.dt0(f.montant) + " DT" + (f.date ? ", prochaine le " + f.dateLib : "") });
    });
    if (an.factures.length) fa.appendChild(ulf);
    fa.appendChild(cree("p", "cpt-note", an.factures.length ? "Reprises de l'onglet Factures (déjà comptées dans votre budget et votre prévision) : rien à saisir deux fois." :
      "Ces factures se gèrent dans l'onglet Factures (saisie ou lecture d'un relevé) ; elles s'afficheront ici."));
    if (!an.factures.length) { var ab = cree("a", "bouton", "Ouvrir Factures"); ab.href = "#mois?onglet=factures"; fa.appendChild(actions([ab])); }
    zone.appendChild(fa);

    /* 6. Rentrée scolaire, Ramadan, Aïd. */
    var fe = panneau("Rentrée scolaire, Ramadan et Aïd", "ob-fetes");
    if (an.fetesInconnues) fe.appendChild(cree("p", "pi-alerte", "Votre navigateur ne connaît pas le calendrier hégirien : Ramadan et Aïd n'ont pas de date ici."));
    var auj = new Date(), isoAuj = auj.getFullYear() + "-" + String(auj.getMonth() + 1).padStart(2, "0") + "-" + String(auj.getDate()).padStart(2, "0");
    o.evenements.forEach(function (e) {
      var r = cree("div", "ob-fete"); r.setAttribute("data-ob-type", e.type);
      var d = OB.prochaineFete(e, isoAuj);
      var lab = cree("label", "interrupteur ob-fete__suivre");
      var s = cree("span"); s.appendChild(cree("strong", null, OB.NOMS_EVENEMENT[e.type]));
      s.appendChild(cree("small", null, d ? (e.type === "rentree" ? "Prochaine : " : "Prochain, à un jour près : ") + libDate(d) : "Date inconnue"));
      var cb = cree("input"); cb.type = "checkbox"; cb.setAttribute("role", "switch"); cb.checked = e.actif; cb.setAttribute("data-ob-actif", e.type);
      lab.appendChild(s); lab.appendChild(cb); lab.appendChild(cree("span", "interrupteur__piste")).setAttribute("aria-hidden", "true");
      r.appendChild(lab);
      var champs = cree("div", "ob-fete__champs");
      var c1 = cree("div", "champ"), id1 = "ob-budget-" + e.type;
      var l1 = cree("label", null, "Budget"); l1.htmlFor = id1; c1.appendChild(l1);
      var sa = cree("div", "saisie"), in1 = cree("input"); in1.id = id1; in1.type = "text"; in1.inputMode = "decimal"; in1.autocomplete = "off"; in1.placeholder = "0";
      in1.value = e.budget > 0 ? F.saisie(e.budget) : ""; in1.setAttribute("data-ob-budget", e.type); in1.disabled = !e.actif;
      sa.appendChild(in1); sa.appendChild(cree("span", "saisie__unite", "DT")); c1.appendChild(sa); champs.appendChild(c1);
      if (e.type === "rentree") {
        var c2 = cree("div", "champ"), l2 = cree("label", null, "Date de la rentrée"); l2.htmlFor = "ob-rentree-date"; c2.appendChild(l2);
        var sd = cree("div", "saisie"), in2 = cree("input"); in2.id = "ob-rentree-date"; in2.type = "date"; in2.disabled = !e.actif;
        in2.value = d || ""; in2.setAttribute("data-ob-rentree", "1"); sd.appendChild(in2); c2.appendChild(sd); champs.appendChild(c2);
      }
      r.appendChild(champs);
      fe.appendChild(r);
    });
    fe.appendChild(cree("p", "cpt-note", "Ramadan et Aïd : dates du calendrier hégirien, à un jour près selon l'observation de la lune. Le budget est réparti sur les mois qui restent."));
    zone.appendChild(fe);
  }
  function libDate(s) { var M = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]; var j = +s.slice(8, 10); return (j === 1 ? "1er" : j) + " " + M[+s.slice(5, 7) - 1] + " " + s.slice(0, 4); }

  /* ---------- Fenêtre « voiture » ---------- */
  var dlg = $("dlg-vehicule"), edition = null;
  function majCalcul() {
    var cv = parseInt($("ob-v-cv").value, 10), carb = $("ob-v-carburant").value, m = OB.montantVignette(cv > 0 ? cv : 1, carb);
    $("ob-v-calcul").textContent = cv > 0 ? "Barème 2026 : " + F.dt0(m) + " DT" + (carb === "electrique" ? " (moitié du tarif essence)" : "") + ". Laissez « Montant » vide pour l'utiliser." : "Indiquez la puissance fiscale (carte grise).";
    $("ob-v-montant").placeholder = cv > 0 ? F.dt0(m) : "";
  }
  function ouvrirVehicule(id) {
    var o = obligations(), v = id ? o.vehicules.filter(function (x) { return x.id === id; })[0] : null, an = new Date().getFullYear();
    edition = v ? v.id : null;
    $("ob-v-titre").textContent = v ? "Modifier « " + v.nom + " »" : "Ajouter une voiture";
    $("ob-v-nom").value = v ? v.nom : "";
    $("ob-v-cv").value = v ? String(v.cv) : "";
    $("ob-v-carburant").value = v ? v.carburant : "essence";
    doc.querySelector('input[name="ob-v-parite"][value="' + (v ? v.parite : "pair") + '"]').checked = true;
    $("ob-v-montant").value = v && v.montant > 0 ? F.saisie(v.montant) : "";
    $("ob-v-paye-lib").textContent = "Vignette " + an + " déjà payée";
    $("ob-v-paye").checked = !!(v && v.payeAnnee >= an);
    $("ob-v-supprimer").hidden = !v;
    $("ob-v-cv-err").hidden = true;
    majCalcul();
    dlg.returnValue = "";
    dlg.showModal();
    $("ob-v-nom").focus();
  }
  if (dlg) {
    $("ob-v-cv").addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").slice(0, 2); majCalcul(); });
    $("ob-v-carburant").addEventListener("change", majCalcul);
    $("form-vehicule").addEventListener("submit", function (ev) {
      var b = ev.submitter && ev.submitter.value;
      if (b === "ok") {
        var cv = parseInt($("ob-v-cv").value, 10);
        if (!(cv >= 1 && cv <= 40)) { ev.preventDefault(); $("ob-v-cv-err").textContent = "Puissance fiscale entre 1 et 40 CV (carte grise)."; $("ob-v-cv-err").hidden = false; $("ob-v-cv").focus(); }
      }
    });
    dlg.addEventListener("close", function () {
      var r = dlg.returnValue, o = obligations(), an = new Date().getFullYear();
      if (r === "supprimer" && edition) {
        var nom = (o.vehicules.filter(function (x) { return x.id === edition; })[0] || {}).nom;
        o.vehicules = o.vehicules.filter(function (x) { return x.id !== edition; });
        enregistrer(o, "« " + nom + " » retirée de vos obligations.");
        return;
      }
      if (r !== "ok") return;
      var m = F.lire($("ob-v-montant").value), x = { nom: $("ob-v-nom").value.trim() || "Ma voiture", cv: parseInt($("ob-v-cv").value, 10), carburant: $("ob-v-carburant").value,
        parite: doc.querySelector('input[name="ob-v-parite"]:checked').value, montant: m.valide && !m.vide ? m.valeur : 0 };
      var avantPaye = edition ? (o.vehicules.filter(function (y) { return y.id === edition; })[0] || {}).payeAnnee || 0 : 0;
      x.payeAnnee = $("ob-v-paye").checked ? Math.max(an, avantPaye) : avantPaye >= an ? an - 1 : avantPaye;
      if (edition) o.vehicules = o.vehicules.map(function (y) { return y.id === edition ? Object.assign({ id: y.id }, x) : y; });
      else { x.id = "v" + Date.now().toString(36).slice(-8); o.vehicules.push(x); }
      enregistrer(o, edition ? "« " + x.nom + " » mise à jour." : "« " + x.nom + " » ajoutée : vignette suivie.");
    });
  }

  /* ---------- Gestes dans l'onglet ---------- */
  zone.addEventListener("click", function (e) {
    var a = e.target.closest("[data-ob-ajouter]"); if (a) { ouvrirVehicule(null); return; }
    var v = e.target.closest("[data-ob-vehicule]"); if (v) { ouvrirVehicule(v.getAttribute("data-ob-vehicule")); return; }
    var f = e.target.closest("[data-ob-fete]");
    if (f) { var champ = zone.querySelector('[data-ob-budget="' + f.getAttribute("data-ob-fete") + '"]'); if (champ) { champ.scrollIntoView({ block: "center", behavior: O.mouvementReduit && O.mouvementReduit.matches ? "auto" : "smooth" }); champ.focus(); } }
  });
  zone.addEventListener("change", function (e) {
    var t = e.target, o = obligations();
    var type = t.getAttribute("data-ob-actif") || t.getAttribute("data-ob-budget") || (t.hasAttribute("data-ob-rentree") ? "rentree" : null);
    if (!type) return;
    var ev = o.evenements.filter(function (x) { return x.type === type; })[0];
    if (t.hasAttribute("data-ob-actif")) { ev.actif = t.checked; enregistrer(o, OB.NOMS_EVENEMENT[type] + (t.checked ? " suivi : budget réparti sur les mois qui restent." : " n'est plus suivi.")); return; }
    if (t.hasAttribute("data-ob-budget")) {
      var m = F.lire(t.value);
      if (!m.valide) { t.setAttribute("aria-invalid", "true"); return; }
      t.setAttribute("aria-invalid", "false"); ev.budget = m.vide ? 0 : m.valeur; enregistrer(o, "Budget « " + OB.NOMS_EVENEMENT[type] + " » : " + F.dt0(ev.budget) + " DT."); return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t.value)) { ev.jourMois = t.value.slice(5); enregistrer(o, "Rentrée scolaire fixée au " + libDate(t.value) + "."); }
  });

  O.surProfil(function () { rendre(); });
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "mois") setTimeout(rendre, 0); });
  window.OrbiteObligations = { rendre: rendre, ouvrirVehicule: ouvrirVehicule };
})();
