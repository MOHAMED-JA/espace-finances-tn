/*
 * Orbite — tableau de bord administrateur (route #admin).
 * Le lien n'apparaît que si le serveur confirme le rôle admin (est_admin) ; chaque donnée est
 * de toute façon refusée par le serveur à un autre compte. Les e-mails sont insérés avec textContent.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, F = O.F, $ = O.$, doc = document;
  var DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  var DATE_HEURE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  var JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  var NOMS_VUES = { orbite: "Mon orbite", profil: "Mon profil", salaire: "Salaire", epargne: "Épargne vie & CEA", credit: "Crédit", simulations: "Simulations",
    abonnement: "Abonnement", compte: "Paramètres", admin: "Administration", vie: "Simulateur de vie", foyer: "Foyer", assistant: "Assistant", fiscal: "Optimiseur fiscal" };
  var ETATS = { essai: "Essai", actif: "Abonné", offert: "Offert", expire: "Expiré" };
  var estAdmin = false, donnees = null, periode = 30, ecarts = {}, nbContacts = null;
  /* Pastille du rail : visible une minute, puis masquée ; elle revient dès qu'une inscription plus récente arrive. */
  var PASTILLE_MS = 60000, SONDAGE_MS = 90000, CLE_VU = "orbite_admin_pastille_vu";
  var minuteriePastille = null, minuterieEcarts = null, sondage = null;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt(millimes) { return F.dt0(millimes / 1000) + " DT"; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) + " %" : "—"; }
  function quand(iso) { return iso ? DATE_HEURE.format(new Date(iso)) : "Jamais"; }

  function kpi(dl, liste) {
    dl.textContent = "";
    liste.forEach(function (k) {
      var d = cree("div", "admin__k" + (k.fort ? " admin__k--fort" : "") + (k.ecart > 0 ? " admin__k--nouveau" : ""));
      var t = cree("dt", null, k.lib);
      /* Après « Actualiser » : ce qui a augmenté depuis la dernière actualisation. */
      if (k.ecart > 0) { var p = cree("span", "admin__k-plus", "+" + k.ecart); p.setAttribute("aria-label", k.ecart + " de plus depuis la dernière actualisation"); t.appendChild(p); }
      d.appendChild(t);
      var dd = cree("dd", "chiffre", k.val);
      d.appendChild(dd);
      if (k.sous) d.appendChild(cree("dd", "admin__k-sous", k.sous));
      dl.appendChild(d);
    });
  }

  function rendreTableau(t) {
    kpi($("admin-kpi-comptes"), [
      { lib: "Inscrits", val: String(t.inscrits), fort: true, sous: t.nouveaux_30j + " sur 30 jours", ecart: ecarts.inscrits },
      { lib: "Connectés aujourd'hui", val: String(t.connectes_jour) },
      { lib: "Connectés cette semaine", val: String(t.connectes_7j) },
      { lib: "Nouveaux comptes", val: String(t.nouveaux_7j), sous: t.nouveaux_jour + " aujourd'hui · 7 derniers jours" }
    ]);
    var f = t.par_formule || {}, detail = Object.keys(f).map(function (k) { return f[k] + " " + k; }).join(" · ");
    kpi($("admin-kpi-abos"), [
      { lib: "Essais gratuits en cours", val: String(t.essais) },
      { lib: "Abonnés", val: String(t.abonnes), fort: true, ecart: ecarts.abonnes, sous: detail || (t.offerts ? t.offerts + " accès offert" + (t.offerts > 1 ? "s" : "") : "") },
      { lib: "Revenus sur 30 jours", val: dt(t.revenus_30j), sous: t.paiements_30j + " paiement" + (t.paiements_30j > 1 ? "s" : "") + " · total " + dt(t.revenus_total) },
      { lib: "Conversion après l'essai", val: pct(t.convertis, t.essais_termines), sous: t.convertis + " sur " + t.essais_termines + " essai" + (t.essais_termines > 1 ? "s" : "") + " terminé" + (t.essais_termines > 1 ? "s" : "") },
      { lib: "Désabonnements", val: String(t.desabonnes), sous: "abonnements payés non renouvelés" }
    ]);
    var note = $("admin-note-test");
    note.hidden = !t.paiements_test;
    note.textContent = t.paiements_test ? t.paiements_test + " paiement" + (t.paiements_test > 1 ? "s" : "") + " de test (simulé" + (t.paiements_test > 1 ? "s" : "") + ") non compté" + (t.paiements_test > 1 ? "s" : "") + " dans les revenus." : "";
    rendreInscriptions(t.inscriptions_30j || [], t.maintenant);
    rendreOffert(t);
    rendreComptes();
  }

  function rendreInscriptions(serie, maintenant) {
    var box = $("admin-inscriptions"), parJour = {}, max = 1, total = 0;
    serie.forEach(function (x) { parJour[x.jour] = x.n; max = Math.max(max, x.n); total += x.n; });
    box.textContent = "";
    var fin = new Date(maintenant || Date.now());
    for (var i = 29; i >= 0; i--) {
      var d = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - i);
      var cle = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      var n = parJour[cle] || 0, b = cree("span", "admin__barre" + (n ? "" : " admin__barre--vide"));
      b.style.setProperty("--h", (n / max * 100) + "%");
      b.title = JOUR.format(d) + " : " + n;
      box.appendChild(b);
    }
    box.setAttribute("aria-label", total + " inscription" + (total > 1 ? "s" : "") + " sur les 30 derniers jours, au plus " + max + " par jour.");
  }

  function rendreComptes() {
    if (!donnees) return;
    var q = ($("admin-recherche").value || "").trim().toLowerCase(), tb = $("admin-comptes");
    tb.textContent = "";
    var liste = (donnees.utilisateurs || []).filter(function (u) { return !q || (u.nom || "").toLowerCase().indexOf(q) !== -1 || (u.email || "").toLowerCase().indexOf(q) !== -1; });
    if (!liste.length) { var tr0 = cree("tr"); var td0 = cree("td", "admin__vide", "Aucun compte."); td0.colSpan = 6; tr0.appendChild(td0); tb.appendChild(tr0); return; }
    liste.forEach(function (u) {
      var tr = cree("tr", u.etat === "offert" ? "admin__ligne--offerte" : null), c = cree("td"), aujourd = u.derniere_connexion && new Date(u.derniere_connexion).toDateString() === new Date().toDateString();
      c.appendChild(cree("strong", null, u.nom || "Sans nom"));
      c.appendChild(cree("small", null, u.email || ""));
      tr.appendChild(c);
      tr.appendChild(cree("td", null, u.methode === "google" ? "Google" : "E-mail"));
      var td = cree("td", aujourd ? "admin__aujourdhui" : null, quand(u.derniere_connexion));
      tr.appendChild(td);
      tr.appendChild(cree("td", null, u.inscrit_le ? DATE.format(new Date(u.inscrit_le)) : "—"));
      var st = cree("td"), puce = cree("span", "puce puce--" + (u.etat === "actif" ? "succes" : u.etat === "essai" ? "credit" : u.etat === "offert" ? "epargne" : "alerte"), ETATS[u.etat] || u.etat);
      st.appendChild(puce);
      if (u.testeur) st.appendChild(cree("small", null, "testeur"));
      tr.appendChild(st);
      tr.appendChild(celluleOffert(u));
      tb.appendChild(tr);
    });
  }

  /* ---------- Accès offert à vie (migration 0014) ---------- */
  var ORIGINES = { compte: "offert à ce compte", tous: "offert à tous", nouveaux: "offert à l'inscription" };
  function celluleOffert(u) {
    var td = cree("td", "admin__offrir"), offert = u.etat === "offert", nom = u.nom || u.email || "ce compte";
    if (!u.id) { td.textContent = "—"; return td; }
    var b = cree("button", "bouton bouton--petit bouton--fantome", offert ? "Retirer" : "Offrir à vie");
    b.type = "button"; b.setAttribute("data-offrir", offert ? "0" : "1"); b.setAttribute("data-id", u.id);
    b.setAttribute("aria-label", (offert ? "Retirer l'accès offert à " : "Offrir l'accès à vie à ") + nom);
    td.appendChild(b);
    if (offert) td.appendChild(cree("small", null, u.offert_par ? ORIGINES[u.offert_par] || "offert" : "offert avant cette fonction"));
    return td;
  }
  function rendreOffert(t) {
    var inter = $("admin-offert-nouveaux"), nb = t.offerts || 0;
    inter.checked = !!t.offert_nouveaux;
    $("admin-offert-nouveaux-lib").textContent = t.offert_nouveaux ? "Comptes créés à partir de maintenant : offert" : "Comptes créés à partir de maintenant";
    $("admin-offert-nb").textContent = nb ? nb + " compte" + (nb > 1 ? "s" : "") : "";
    $("admin-retirer-tous").disabled = !t.offerts_admin;
    $("admin-offrir-tous").disabled = !!t.inscrits && nb >= t.inscrits;
  }
  /* Confirmation dans une vraie fenêtre (jamais confirm()), avec le nombre de comptes concernés. */
  function confirmerOffert(titre, texte, ok) {
    var d = $("dlg-offert");
    $("dlg-offert-titre").textContent = titre;
    $("dlg-offert-texte").textContent = texte;
    $("dlg-offert-ok").textContent = ok;
    d.returnValue = "";
    return new Promise(function (fin) {
      d.addEventListener("close", function () { fin(d.returnValue === "ok"); }, { once: true });
      d.showModal();
    });
  }
  function appliquerOffert(promesse, message, btn) {
    if (btn) btn.disabled = true;
    return promesse.then(function () { E.toast(message, { type: "ok" }); return E.admin.tableau(); })
      .then(function (t) { donnees = t; rendreTableau(t); })
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); })
      .finally(function () { if (btn) btn.disabled = false; if (donnees) rendreOffert(donnees); });
  }
  $("admin-offert-nouveaux").addEventListener("change", function () {
    var oui = this.checked;
    appliquerOffert(E.admin.offrirNouveaux(oui), oui ? "Les nouveaux comptes recevront l'accès offert à vie." : "Les nouveaux comptes recommencent par l'essai gratuit.", this);
  });
  $("admin-offrir-tous").addEventListener("click", function () {
    var btn = this, n = donnees ? Math.max(0, donnees.inscrits - (donnees.offerts || 0)) : 0;
    confirmerOffert("Offrir l'accès à vie à tous les comptes ?", n + " compte" + (n > 1 ? "s" : "") + " recevr" + (n > 1 ? "ont" : "a") + " toutes les fonctions d'Orbite sans limite de durée. Leur essai ou leur abonnement payé reste enregistré : il reprend si vous retirez l'accès.", "Offrir à tous")
      .then(function (oui) { if (oui) appliquerOffert(E.admin.offrirTous(true), "Accès offert à vie à tous les comptes.", btn); });
  });
  $("admin-retirer-tous").addEventListener("click", function () {
    var btn = this, n = donnees ? donnees.offerts_admin || 0 : 0;
    confirmerOffert("Retirer l'accès offert à tous ?", n + " compte" + (n > 1 ? "s" : "") + " retrouver" + (n > 1 ? "ont" : "a") + " leur essai ou leur abonnement payé (souvent expiré). Un accès offert avant cette fonction n'est pas touché.", "Retirer à tous")
      .then(function (oui) { if (oui) appliquerOffert(E.admin.offrirTous(false), "Accès offert retiré.", btn); });
  });
  $("admin-comptes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-offrir]");
    if (!b) return;
    var oui = b.getAttribute("data-offrir") === "1";
    appliquerOffert(E.admin.offrir(b.getAttribute("data-id"), oui), oui ? "Accès offert à vie." : "Accès offert retiré.", b);
  });

  function rendreAlertes(liste) {
    var ol = $("admin-alertes"), nonLues = liste.filter(function (a) { return !a.lue; }).length;
    ol.textContent = "";
    if (!liste.length) ol.appendChild(cree("li", "admin__vide", "Aucune inscription pour l'instant. Chaque nouveau compte apparaîtra ici."));
    liste.slice(0, 15).forEach(function (a) {
      var li = cree("li", "admin__alerte" + (a.lue ? "" : " admin__alerte--nouvelle"));
      li.appendChild(cree("span", "admin__alerte-lib", a.libelle || "Nouveau compte"));
      li.appendChild(cree("time", null, quand(a.cree_le)));
      if (a.cree_le) li.lastChild.setAttribute("datetime", a.cree_le);
      ol.appendChild(li);
    });
    $("admin-lues").hidden = !nonLues;
    pastille(liste);
  }
  function lireVu() { try { return localStorage.getItem(CLE_VU) || ""; } catch (e) { return ""; } }
  function ecrireVu(iso) { try { localStorage.setItem(CLE_VU, iso); } catch (e) { /* navigation privée : la pastille revient au prochain chargement */ } }
  /* Inscriptions non lues plus récentes que la dernière pastille montrée : une minute à l'écran, puis plus rien
     jusqu'à la prochaine inscription. */
  function pastille(liste) {
    var vu = lireVu(), nouvelles = (liste || []).filter(function (a) { return !a.lue && a.cree_le && a.cree_le > vu; });
    var b = $("badge-admin"), n = nouvelles.length;
    if (!n) { clearTimeout(minuteriePastille); minuteriePastille = null; b.hidden = true; b.textContent = ""; b.removeAttribute("aria-label"); return; }
    var derniere = nouvelles.reduce(function (m, a) { return a.cree_le > m ? a.cree_le : m; }, "");
    var deja = !b.hidden && b.getAttribute("data-derniere") === derniere;
    b.classList.remove("rail__badge--sortie");
    b.hidden = false;
    b.textContent = String(n);
    b.setAttribute("data-derniere", derniere);
    b.setAttribute("aria-label", n + " nouvelle" + (n > 1 ? "s" : "") + " inscription" + (n > 1 ? "s" : ""));
    if (deja && minuteriePastille) return;
    clearTimeout(minuteriePastille);
    minuteriePastille = setTimeout(function () {
      minuteriePastille = null;
      ecrireVu(derniere);
      b.classList.add("rail__badge--sortie");
      setTimeout(function () { if (b.classList.contains("rail__badge--sortie")) { b.hidden = true; b.classList.remove("rail__badge--sortie"); } }, 420);
    }, PASTILLE_MS);
  }
  function sonder() {
    if (!estAdmin || doc.visibilityState !== "visible") return;
    E.admin.alertes().then(function (l) {
      if ($("vue-admin") && !$("vue-admin").hidden && location.hash.indexOf("#admin") === 0) rendreAlertes(l || []);
      else pastille(l || []);
    }).catch(function () {});
  }

  function rendreClassement(ol, liste) {
    ol.textContent = "";
    if (!liste.length) { ol.appendChild(cree("li", "admin__vide", "Pas encore de données sur cette période.")); return; }
    var max = liste[0].n || 1;
    liste.forEach(function (x) {
      var li = cree("li");
      li.appendChild(cree("span", null, NOMS_VUES[x.cle] || x.cle));
      li.appendChild(cree("strong", "chiffre", F.dt0(x.n)));
      var j = cree("i", "admin__jauge"); j.style.setProperty("--p", (x.n / max * 100) + "%"); j.setAttribute("aria-hidden", "true");
      li.appendChild(j);
      ol.appendChild(li);
    });
  }
  function chargerStatistiques() {
    return E.admin.statistiques(periode).then(function (s) {
      rendreClassement($("admin-vues"), s.vues || []);
      rendreClassement($("admin-simulations"), s.simulations || []);
    });
  }

  /* ---------- Codes promo et parrainage ---------- */
  function rendreCodes(d) {
    var tb = $("admin-codes"), codes = (d && d.codes) || [];
    $("admin-parrainage").textContent = "Parrainage : " + (d.parrainages || 0) + " filleul" + (d.parrainages > 1 ? "s" : "") + " inscrit" + (d.parrainages > 1 ? "s" : "") +
      ", " + (d.parrainages_recompenses || 0) + " devenu" + (d.parrainages_recompenses > 1 ? "s" : "") + " abonné" + (d.parrainages_recompenses > 1 ? "s" : "") + " (un mois offert à chacun), " + (d.parrains_actifs || 0) + " parrain" + (d.parrains_actifs > 1 ? "s" : "") + ".";
    tb.textContent = "";
    if (!codes.length) { var tr0 = cree("tr"), td0 = cree("td", "admin__vide", "Aucun code. Créez par exemple une offre de lancement automatique."); td0.colSpan = 6; tr0.appendChild(td0); tb.appendChild(tr0); return; }
    codes.forEach(function (c) {
      var tr = cree("tr"), td = cree("td");
      td.appendChild(cree("strong", null, c.code));
      td.appendChild(cree("small", null, (c.automatique ? "Automatique · " : "") + (c.libelle || "")));
      tr.appendChild(td);
      tr.appendChild(cree("td", "chiffre", "−" + c.remise_pct + "\u00a0%"));
      tr.appendChild(cree("td", null, c.formules && c.formules.length ? c.formules.join(", ") : "Toutes"));
      tr.appendChild(cree("td", null, (c.fin ? "jusqu'au " + DATE.format(new Date(c.fin)) : "sans limite")));
      tr.appendChild(cree("td", "chiffre", c.utilisations + (c.max_utilisations ? " / " + c.max_utilisations : "")));
      var ta = cree("td"), b = cree("button", "bouton bouton--petit" + (c.actif ? "" : " bouton--fantome"), c.actif ? "Actif" : "Désactivé");
      b.type = "button"; b.setAttribute("aria-pressed", c.actif ? "true" : "false"); b.setAttribute("data-code", c.code);
      b.setAttribute("aria-label", (c.actif ? "Désactiver" : "Activer") + " le code " + c.code);
      ta.appendChild(b); tr.appendChild(ta);
      tb.appendChild(tr);
    });
  }
  function chargerCodes() { return E.admin.codes().then(rendreCodes); }
  $("admin-codes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-code]");
    if (!b) return;
    b.disabled = true;
    E.admin.codeActiver(b.getAttribute("data-code"), b.getAttribute("aria-pressed") !== "true").then(chargerCodes)
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); b.disabled = false; });
  });
  $("admin-code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("ac-erreur"), code = $("ac-code").value.trim().toUpperCase(), remise = parseInt($("ac-remise").value, 10);
    var max = $("ac-max").value.trim() ? parseInt($("ac-max").value, 10) : null, fin = $("ac-fin").value;
    var formules = [].slice.call(doc.querySelectorAll('input[name="ac-formule"]:checked')).map(function (x) { return x.value; });
    var msg = !/^[A-Z0-9-]{3,20}$/.test(code) ? "Code : 3 à 20 lettres, chiffres ou tirets." : !(remise >= 1 && remise <= 90) ? "Remise : entre 1 et 90 %." : max !== null && !(max > 0) ? "Utilisations max. : un nombre positif." : "";
    err.textContent = msg; err.hidden = !msg;
    if (msg) return;
    var btn = this.querySelector("button[type=submit]"); btn.disabled = true;
    E.admin.codeEnregistrer({ code: code, remise_pct: remise, libelle: $("ac-libelle").value.trim(), formules: formules,
      fin: fin ? new Date(fin + "T23:59:59").toISOString() : null, max_utilisations: max, automatique: $("ac-auto").checked, actif: true })
      .then(function () { E.toast("Code " + code + " enregistré."); e.target.reset(); return chargerCodes(); })
      .catch(function (x) { err.textContent = E.modele.messageErreur(x); err.hidden = false; })
      .finally(function () { btn.disabled = false; });
  });

  /* ---------- Fiches partagées (accord explicite de l'utilisateur, migration 0009) ---------- */
  var SITUATIONS = { celibataire: "Célibataire", marie: "Marié(e)", divorce: "Divorcé(e)", veuf: "Veuf / veuve" };
  function dateCourte(iso) { return iso ? DATE.format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso)) : "—"; }
  function rendreFiches(liste) {
    var ul = $("admin-fiches");
    ul.textContent = "";
    if (!liste.length) { ul.appendChild(cree("li", "admin__vide", "Aucun compte n'a encore partagé sa fiche.")); return; }
    liste.forEach(function (f) {
      var li = cree("li"), b = cree("button", "admin__fiche-lien");
      b.type = "button"; b.setAttribute("data-fiche", f.id);
      b.appendChild(cree("strong", null, f.nom || f.nom_compte || "Sans nom"));
      b.appendChild(cree("small", null, (f.email || "") + " · accord du " + dateCourte(f.accorde_le)));
      li.appendChild(b); ul.appendChild(li);
    });
  }
  function ligne(dl, lib, val) { var d = cree("div"); d.appendChild(cree("dt", null, lib)); d.appendChild(cree("dd", null, val)); dl.appendChild(d); }
  function rendreFiche(f) {
    var OC = window.OrbiteCalcul, p0 = f.profil || {}, sy = null;
    try { sy = OC.synthese(p0); } catch (e) { sy = null; }
    var p = sy ? sy.profil : OC.normaliser(p0), s = sy && sy.salaire, dl = $("admin-fiche-grille");
    $("admin-fiche-titre").textContent = ((p.prenom || "") + " " + (p.nom || "")).trim() || f.email || "Fiche";
    $("admin-fiche-sous").textContent = (f.email || "") + " · inscrit le " + dateCourte(f.inscrit_le) + " · dernière connexion " + quand(f.derniere_connexion) + " · accord du " + dateCourte(f.accorde_le) + ".";
    dl.textContent = "";
    ligne(dl, "Date de naissance", p.dateNaissance ? dateCourte(p.dateNaissance) + (sy ? " (" + sy.age + " ans)" : "") : "Non renseignée");
    ligne(dl, "Date d'embauche", p.dateEmbauche ? dateCourte(p.dateEmbauche) + " (" + p.anciennete + " an" + (p.anciennete > 1 ? "s" : "") + ")" : p.anciennete + " an" + (p.anciennete > 1 ? "s" : "") + " d'ancienneté");
    ligne(dl, "Famille", (SITUATIONS[p.situation] || p.situation) + (p.chefDeFamille ? ", chef de famille" : "") + " · " + p.enfants + " enfant" + (p.enfants > 1 ? "s" : "") + " à charge");
    if (p.activite === "retraite") ligne(dl, "Statut", "Retraité · " + (p.caissePension === "cnrps" ? "CNRPS" : "CNSS") + (p.pensionEtrangere ? " · pension venant de l'étranger" : ""));
    else ligne(dl, "Secteur", (p.secteur === "public" ? "Public (CNRPS)" : "Privé (CNSS)") + " · " + p.nombreSalaires + " salaires par an");
    if (s) {
      ligne(dl, p.activite === "retraite" ? "Pension brute" : "Salaire brut", F.dt0(s.brutMensuel) + " DT par mois · " + F.dt0(s.brutAnnuel) + " DT par an");
      ligne(dl, p.activite === "retraite" ? "Pension nette" : "Salaire net", F.dt0(s.netMensuel) + " DT par mois · " + F.dt0(s.netAnnuel) + " DT par an");
    }
    var cr = p.credits || [];
    ligne(dl, "Crédits en cours", cr.length ? cr.map(function (c) { return (c.libelle || "Crédit") + " : " + F.dt0(c.mensualite) + " DT par mois"; }).join(" · ") : "Aucun");
    var ct = p.contrats || [];
    ligne(dl, "Assurance vie et CEA", ct.length ? ct.map(function (c) { return (c.type === "cea" ? "CEA" : "Assurance vie") + " : " + F.dt0(c.versementMensuel) + " DT par mois"; }).join(" · ") : "Aucun contrat");
    if (sy && sy.capacite) { var cb = sy.capacite[p.baseBanque] || sy.capacite.net; ligne(dl, "Capacité d'emprunt", F.dt0(cb.mensualiteMax) + " DT de mensualité possible (" + (p.banque || "règle " + p.baseBanque) + ")"); }
    ligne(dl, "Budget", "Logement " + F.dt0(p.loyer) + " DT · charges fixes " + F.dt0(p.chargesFixes) + " DT · épargne disponible " + F.dt0(p.epargneDisponible) + " DT");
    var art = $("admin-fiche");
    art.hidden = false; art.focus();
  }
  /* ---------- Demandes de contact (accord « J'accepte d'être recontacté·e », migration 0010) ---------- */
  function rendreContacts(liste) {
    var ul = $("admin-contacts");
    ul.textContent = "";
    nbContacts = liste.length;
    $("admin-contacts-nb").textContent = liste.length ? String(liste.length) : "";
    if (!liste.length) { ul.appendChild(cree("li", "admin__vide", "Personne n'a encore demandé à être recontacté.")); return; }
    liste.forEach(function (c) {
      var li = cree("li", "admin__contact");
      li.appendChild(cree("strong", null, c.nom || c.nom_compte || "Sans nom"));
      var liens = cree("span", "admin__contact-liens");
      if (c.email) { var a = cree("a", null, c.email); a.href = "mailto:" + encodeURIComponent(c.email).replace(/%40/g, "@"); liens.appendChild(a); }
      if (c.telephone) { var t = cree("a", null, window.OrbiteCalcul.formatTelephone(c.telephone)); t.href = "tel:" + c.telephone; liens.appendChild(t); }
      li.appendChild(liens);
      li.appendChild(cree("small", null, "Accord du " + dateCourte(c.accorde_le) + (c.rappels_email ? " · rappels par email souhaités" : "")));
      ul.appendChild(li);
    });
  }
  function chargerContacts() { return E.admin.contacts().then(function (l) { rendreContacts(l || []); }); }
  function chargerFiches() { return E.admin.fiches().then(function (l) { rendreFiches(l || []); }); }
  $("admin-fiches").addEventListener("click", function (e) {
    var b = e.target.closest("[data-fiche]");
    if (!b) return;
    b.disabled = true;
    E.admin.fiche(b.getAttribute("data-fiche")).then(rendreFiche)
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); chargerFiches().catch(function () {}); })
      .finally(function () { b.disabled = false; });
  });
  $("admin-fiche-fermer").addEventListener("click", function () { $("admin-fiche").hidden = true; });

  /* Nouveautés depuis la dernière actualisation, en toutes lettres. */
  function nouveautes(e) {
    var l = [];
    function ajout(n, un, plusieurs) { if (n > 0) l.push(n + " " + (n > 1 ? plusieurs : un)); }
    ajout(e.inscrits, "nouvelle inscription", "nouvelles inscriptions");
    ajout(e.abonnes, "nouvel abonné", "nouveaux abonnés");
    ajout(e.paiements, "nouveau paiement", "nouveaux paiements");
    ajout(e.contacts, "demande de contact", "demandes de contact");
    return l;
  }
  /* manuel : clic sur « Actualiser » → bouton qui tourne, heure, tuiles qui ont changé, notification qui résume. */
  function charger(manuel) {
    if (!estAdmin) return Promise.resolve();
    var zone = $("admin"), btn = $("admin-actualiser"), lib = $("admin-actualiser-lib");
    var avant = manuel === true && donnees ? { inscrits: donnees.inscrits, abonnes: donnees.abonnes, paiements: donnees.paiements_30j, contacts: nbContacts } : null;
    zone.setAttribute("aria-busy", "true"); btn.disabled = true;
    if (manuel === true) { btn.classList.add("bouton--charge"); lib.textContent = "Actualisation…"; }
    return Promise.all([E.admin.tableau(), E.admin.alertes(), chargerStatistiques(), chargerCodes(), chargerFiches(), chargerContacts()]).then(function (r) {
      donnees = r[0];
      ecarts = avant ? { inscrits: donnees.inscrits - avant.inscrits, abonnes: donnees.abonnes - avant.abonnes, paiements: donnees.paiements_30j - avant.paiements,
        contacts: avant.contacts == null ? 0 : nbContacts - avant.contacts } : {};
      rendreTableau(donnees);
      rendreAlertes(r[1] || []);
      /* Les « +N » de l'actualisation s'effacent aussi après une minute. */
      clearTimeout(minuterieEcarts);
      if (avant) minuterieEcarts = setTimeout(function () { ecarts = {}; if (donnees) rendreTableau(donnees); }, PASTILLE_MS);
      var heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()), maj = $("admin-maj");
      maj.textContent = "Mis à jour à " + heure;
      if (avant) {
        maj.classList.remove("admin__maj--frais"); void maj.offsetWidth; maj.classList.add("admin__maj--frais");
        var n = nouveautes(ecarts);
        if (n.length) E.toast("Données actualisées à " + heure, { detail: n.join(" · ") });
        else E.toast("Données actualisées à " + heure, { type: "info", detail: "Aucune nouveauté depuis la dernière actualisation" });
      }
    }).catch(function (x) { E.toast(manuel === true ? "Actualisation impossible" : E.modele.messageErreur(x), { erreur: true, detail: manuel === true ? E.modele.messageErreur(x) : "" }); })
      .finally(function () {
        zone.removeAttribute("aria-busy"); btn.disabled = false; btn.classList.remove("bouton--charge"); lib.textContent = "Actualiser";
        O.placerPastilles(zone);
      });
  }

  $("admin-actualiser").addEventListener("click", function () { charger(true); });
  $("admin-recherche").addEventListener("input", rendreComptes);
  $("admin-lues").addEventListener("click", function () {
    E.admin.alertesLues().then(function () { return E.admin.alertes(); }).then(rendreAlertes)
      .catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); });
  });
  doc.querySelectorAll('input[name="admin-periode"]').forEach(function (r) {
    r.addEventListener("change", function () { periode = +this.value; chargerStatistiques().catch(function () {}); });
  });
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "admin") return;
    $("admin-refus").hidden = estAdmin;
    $("admin-corps").hidden = !estAdmin;
    if (!estAdmin) $("admin").removeAttribute("aria-busy");
    charger();
  });

  function demarrer() {
    E.admin.est().then(function (oui) {
      estAdmin = oui;
      $("rail-admin").hidden = !oui;
      $("param-admin").hidden = !oui;
      if (!oui) return;
      /* Pastille des nouvelles inscriptions dès l'ouverture d'Orbite, puis toutes les 90 s tant que la page est visible. */
      E.admin.alertes().then(function (l) { pastille(l || []); }).catch(function () {});
      clearInterval(sondage);
      sondage = setInterval(sonder, SONDAGE_MS);
      doc.addEventListener("visibilitychange", sonder);
      if (location.hash.indexOf("#admin") === 0) { $("admin-refus").hidden = true; $("admin-corps").hidden = false; charger(); }
    });
  }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });
})();
