/*
 * Orbite — mode Expert (réglage Paramètres › Préférences, body.expert) : paie de l'année mois par mois (profil),
 * tableau d'amortissement sous chaque crédit (profil), Mon orbite mois par mois, CSV et « Tout exporter » en Excel.
 * Les tableaux ne se construisent qu'à l'ouverture (et quand le profil change pendant qu'ils sont ouverts).
 */
(function () {
  "use strict";
  var O = window.Orbite, SC = window.Scenarios, EX = window.ExpertCalcul, F = O.F, $ = O.$, doc = document;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function jour() { return new Date().toISOString().slice(0, 10); }
  function nomFichier(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  /* Remplit une table à partir de lignes [en-tête, …] ; fmt(v, colonne) pour les nombres ; marque(ligne) → classe. */
  function remplir(table, lignes, fmt, marque) {
    table.textContent = "";
    var th = cree("thead"), tr = cree("tr");
    lignes[0].forEach(function (h) { tr.appendChild(cree("th", "", h.replace(/ \((DT|%)\)$/, ""))); });
    th.appendChild(tr); table.appendChild(th);
    var bd = cree("tbody");
    lignes.slice(1).forEach(function (l, i) {
      var row = cree("tr", marque ? marque(i) || "" : "");
      l.forEach(function (v, k) { row.appendChild(cree("td", "", typeof v === "number" ? fmt(v, k) : v)); });
      bd.appendChild(row);
    });
    table.appendChild(bd);
  }
  function dt3(v) { return F.dt3(v); }

  /* ---------- Profil : paie de l'année ---------- */
  function rendrePaie() {
    var sy = O.synthese(); if (!sy || !O.expert() || !$("p-paie").open) return;
    var pa = EX.paieAnnee(sy), lignes = EX.tablePaie(pa);
    remplir($("p-paie-table"), lignes, function (v, k) { return k === 1 ? String(v).replace(".", ",") : dt3(v); }, function (i) { return i === 12 ? "cle" : pa.lignes[i] && pa.lignes[i].primes ? "expert-marque" : ""; });
  }
  $("p-paie").addEventListener("toggle", rendrePaie);
  $("p-paie-csv").addEventListener("click", function () {
    var sy = O.synthese(); if (!sy) return;
    var pa = EX.paieAnnee(sy);
    O.telecharger("orbite-paie-" + pa.annee + ".csv", EX.csv(EX.tablePaie(pa)));
    O.toast("Paie " + pa.annee + " téléchargée (CSV).");
  });

  /* ---------- Profil : tableau d'amortissement de chaque crédit ---------- */
  function rendreAmort(det) {
    var sy = O.synthese(), li = det.closest("[data-liste]"); if (!sy || !li || !O.expert() || !det.open) return;
    var i = Number(li.getAttribute("data-index")), a = EX.amortissement(sy, i), table = det.querySelector("[data-amort-table]"), info = det.querySelector("[data-amort-info]");
    det.querySelector("[data-amort-csv]").disabled = !a;
    if (!a) { table.textContent = ""; info.textContent = "Indiquez la mensualité, le taux et les échéances restantes (ou la date de début et la durée) pour voir le tableau."; return; }
    info.textContent = a.restantes + " échéances restantes" + (a.duree ? " sur " + a.duree : "") + " · capital restant dû " + dt3(a.capitalRestant) + " DT · intérêts à payer " + dt3(a.totalInterets) + " DT" +
      (a.lignes.some(function (l) { return l.reduction; }) ? " · en vert : réductions de taux de la règle des 8 %" : "") + ".";
    remplir(table, EX.tableAmortissement(a), function (v, k) { return k === 0 ? String(v) : k === 2 ? String(Math.round(v * 10000) / 10000).replace(".", ",") + " %" : dt3(v); },
      function (r) { return a.lignes[r].reduction ? "expert-marque" : ""; });
  }
  var listeCredits = $("liste-credits");
  listeCredits.addEventListener("toggle", function (e) { if (e.target.matches && e.target.matches("[data-amort]")) rendreAmort(e.target); }, true);
  listeCredits.addEventListener("click", function (e) {
    var b = e.target.closest("[data-amort-csv]"); if (!b) return;
    var sy = O.synthese(), li = b.closest("[data-liste]"), i = Number(li.getAttribute("data-index")), a = sy && EX.amortissement(sy, i);
    if (!a) return;
    O.telecharger("orbite-amortissement-" + nomFichier(a.libelle) + ".csv", EX.csv(EX.tableAmortissement(a)));
    O.toast("Tableau d'amortissement téléchargé (CSV).");
  });

  /* ---------- Mon orbite mois par mois ---------- */
  function reference() { var p = O.profil(); return p ? SC.calculer(p, null, new Date()) : null; }
  function rendreOrbite() {
    if (!O.expert() || $("vue-orbite").hidden) return;
    var r = reference(); if (!r) return;
    var t0 = {}; r.evenements.forEach(function (e) { t0[e.t] = true; });
    remplir($("orbite-table"), EX.tableVoyage(r), function (v, k) { return k === 3 ? String(v).replace(".", ",") + " %" : dt3(v); }, function (i) { return t0[i] ? "expert-marque" : ""; });
  }
  $("orbite-csv").addEventListener("click", function () {
    var r = reference(); if (!r) return;
    O.telecharger("orbite-mois-par-mois-" + jour() + ".csv", EX.csv(EX.tableVoyage(r)));
    O.toast("Mon orbite mois par mois téléchargée (CSV).");
  });

  /* ---------- Tout exporter (Excel) ---------- */
  function toutExporter() {
    var sy = O.synthese(), p = O.profil(); if (!sy || !p || !window.Xlsx) return;
    var noms = p.scenarios.map(function (s, i) { return "ABC".charAt(i) + " · " + s.nom; });
    var comp = SC.comparer(p, p.scenarios, new Date());
    var octets = window.Xlsx.classeur(EX.classeur(sy, comp, noms), { titre: "Orbite : votre situation au " + jour() });
    O.telecharger("orbite-" + jour() + ".xlsx", new Blob([octets], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    O.toast("Classeur Excel téléchargé : profil, paie, crédits, contrats, Mon orbite, impôt et scénarios.");
  }
  $("orbite-xlsx").addEventListener("click", toutExporter);
  $("exporter-xlsx").addEventListener("click", toutExporter);

  /* ---------- Mises à jour ---------- */
  function tout() {
    rendrePaie();
    Array.prototype.forEach.call(doc.querySelectorAll("#liste-credits [data-amort][open]"), rendreAmort);
    rendreOrbite();
  }
  var attente = 0;
  O.surProfil(function () { if (!O.expert()) return; clearTimeout(attente); attente = setTimeout(tout, 120); });
  doc.addEventListener("orbite:expert", tout);
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "orbite") setTimeout(rendreOrbite, 0); });
  window.OrbiteExpert = { toutExporter: toutExporter };
})();
