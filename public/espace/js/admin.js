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
  var estAdmin = false, donnees = null, periode = 30;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt(millimes) { return F.dt0(millimes / 1000) + " DT"; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) + " %" : "—"; }
  function quand(iso) { return iso ? DATE_HEURE.format(new Date(iso)) : "Jamais"; }

  function kpi(dl, liste) {
    dl.textContent = "";
    liste.forEach(function (k) {
      var d = cree("div", "admin__k" + (k.fort ? " admin__k--fort" : ""));
      d.appendChild(cree("dt", null, k.lib));
      var dd = cree("dd", "chiffre", k.val);
      d.appendChild(dd);
      if (k.sous) d.appendChild(cree("dd", "admin__k-sous", k.sous));
      dl.appendChild(d);
    });
  }

  function rendreTableau(t) {
    kpi($("admin-kpi-comptes"), [
      { lib: "Inscrits", val: String(t.inscrits), fort: true, sous: t.nouveaux_30j + " sur 30 jours" },
      { lib: "Connectés aujourd'hui", val: String(t.connectes_jour) },
      { lib: "Connectés cette semaine", val: String(t.connectes_7j) },
      { lib: "Nouveaux comptes", val: String(t.nouveaux_7j), sous: t.nouveaux_jour + " aujourd'hui · 7 derniers jours" }
    ]);
    var f = t.par_formule || {}, detail = Object.keys(f).map(function (k) { return f[k] + " " + k; }).join(" · ");
    kpi($("admin-kpi-abos"), [
      { lib: "Essais gratuits en cours", val: String(t.essais) },
      { lib: "Abonnés", val: String(t.abonnes), fort: true, sous: detail || (t.offerts ? t.offerts + " accès offert" + (t.offerts > 1 ? "s" : "") : "") },
      { lib: "Revenus sur 30 jours", val: dt(t.revenus_30j), sous: t.paiements_30j + " paiement" + (t.paiements_30j > 1 ? "s" : "") + " · total " + dt(t.revenus_total) },
      { lib: "Conversion après l'essai", val: pct(t.convertis, t.essais_termines), sous: t.convertis + " sur " + t.essais_termines + " essai" + (t.essais_termines > 1 ? "s" : "") + " terminé" + (t.essais_termines > 1 ? "s" : "") },
      { lib: "Désabonnements", val: String(t.desabonnes), sous: "abonnements payés non renouvelés" }
    ]);
    var note = $("admin-note-test");
    note.hidden = !t.paiements_test;
    note.textContent = t.paiements_test ? t.paiements_test + " paiement" + (t.paiements_test > 1 ? "s" : "") + " de test (simulé" + (t.paiements_test > 1 ? "s" : "") + ") non compté" + (t.paiements_test > 1 ? "s" : "") + " dans les revenus." : "";
    rendreInscriptions(t.inscriptions_30j || [], t.maintenant);
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
    if (!liste.length) { var tr0 = cree("tr"); var td0 = cree("td", "admin__vide", "Aucun compte."); td0.colSpan = 5; tr0.appendChild(td0); tb.appendChild(tr0); return; }
    liste.forEach(function (u) {
      var tr = cree("tr"), c = cree("td"), aujourd = u.derniere_connexion && new Date(u.derniere_connexion).toDateString() === new Date().toDateString();
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
      tb.appendChild(tr);
    });
  }

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
    badge(nonLues);
  }
  function badge(n) {
    var b = $("badge-admin");
    b.hidden = !n;
    b.textContent = n ? String(n) : "";
    b.setAttribute("aria-label", n ? n + " nouvelle" + (n > 1 ? "s" : "") + " inscription" + (n > 1 ? "s" : "") : "");
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

  function charger() {
    if (!estAdmin) return Promise.resolve();
    var zone = $("admin"), btn = $("admin-actualiser");
    zone.setAttribute("aria-busy", "true"); btn.disabled = true;
    return Promise.all([E.admin.tableau(), E.admin.alertes(), chargerStatistiques()]).then(function (r) {
      donnees = r[0];
      rendreTableau(donnees);
      rendreAlertes(r[1] || []);
      $("admin-maj").textContent = "Mis à jour à " + new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    }).catch(function (x) { E.toast(E.modele.messageErreur(x), { erreur: true }); })
      .finally(function () { zone.removeAttribute("aria-busy"); btn.disabled = false; O.placerPastilles(zone); });
  }

  $("admin-actualiser").addEventListener("click", charger);
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
      /* Pastille des nouvelles inscriptions dès l'ouverture d'Orbite. */
      E.admin.alertes().then(function (l) { badge((l || []).filter(function (a) { return !a.lue; }).length); }).catch(function () {});
      if (location.hash.indexOf("#admin") === 0) { $("admin-refus").hidden = true; $("admin-corps").hidden = false; charger(); }
    });
  }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });
})();
