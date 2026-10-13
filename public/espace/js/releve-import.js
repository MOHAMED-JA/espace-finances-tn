/*
 * Orbite — « Importer mon relevé » (Mon mois › Budget ; maquette validée le 13 oct. 2026).
 * Le relevé (PDF, CSV ou photo) est lu sur l'appareil (FicheLecture pour le PDF et la photo) ; chaque opération reçoit
 * une enveloppe (ReleveCalcul.categoriser) que l'utilisateur peut changer d'un geste : Orbite s'en souvient pour les
 * prochains relevés. Seuls les totaux par enveloppe et par mois rejoignent le budget du profil ; rien n'est envoyé.
 */
(function () {
  "use strict";
  var O = window.Orbite, R = window.ReleveCalcul, B = window.BudgetCalcul, OB = window.OrbiteBudget;
  if (!O || !R || !B || !OB || !document.getElementById("mo-releve")) return;
  var F = O.F, $ = O.$, doc = document;
  var LIB = {}; B.ENVELOPPES.forEach(function (e) { LIB[e.cle] = e.libelle; });
  var COURT = { credits: "Crédits", logement: "Logement", courses: "Courses", transport: "Transport", sante: "Santé", loisirs: "Loisirs", epargne: "Épargne", divers: "Divers" };
  var lu = null; /* { ops: [{ date, libelle, montant, sens, cle, raison, manuel, marchand }], emp, titre } */

  function dt(v) { return F.dt0(v) + " DT"; }
  function dt3(v) { return F.dt3(v); }
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function etat(texte, type) { var e = $("mo-rel-etat"); e.textContent = texte || ""; e.hidden = !texte; e.className = "mo-rel__etat" + (type ? " mo-rel__etat--" + type : ""); }

  /* ---------- Lecture ---------- */
  function estTexte(f) { return /\.(csv|txt)$/i.test(f.name || "") || /^text\//i.test(f.type || "") || /csv/i.test(f.type || ""); }
  function lireFichier(f) {
    if (!f) return;
    if (/\.(xlsx?|ods)$/i.test(f.name || "")) { etat("Enregistrez d'abord ce fichier Excel au format CSV (Fichier › Enregistrer sous › CSV), puis choisissez-le ici.", "erreur"); return; }
    if (f.size > 15 * 1024 * 1024) { etat("Ce fichier dépasse 15 Mo.", "erreur"); return; }
    vider(); etat("Lecture du relevé sur votre appareil…");
    $("mo-releve").setAttribute("aria-busy", "true");
    var maintenant = new Date(), lecture;
    if (estTexte(f)) lecture = f.text().then(function (t) { return R.depuisCsv(t, maintenant); });
    else if (window.FicheLecture) lecture = window.FicheLecture.lire(f, { pagesMax: 12, progres: function (q, v) { if (v < 1) etat("Lecture du relevé sur votre appareil… " + Math.round(v * 100) + " %"); } })
      .then(function (r) { return R.depuisLignes(r.lignes, maintenant); });
    else lecture = Promise.reject(new Error("Lecteur indisponible."));
    lecture.then(function (ops) {
      $("mo-releve").removeAttribute("aria-busy");
      if (!ops.length) { etat("Aucune opération reconnue dans ce fichier. Essayez le relevé en PDF tel que votre banque le donne, ou un export CSV.", "erreur"); return; }
      preparer(ops);
    }, function (e) {
      $("mo-releve").removeAttribute("aria-busy");
      etat((e && e.message) || "Ce fichier n'a pas pu être lu.", "erreur");
    });
  }

  function preparer(ops) {
    var p = O.profil() || {}, mem = (p.budget && p.budget.memoire) || {}, credits = p.credits || [];
    lu = { emp: R.empreinte(ops), titre: R.periode(ops), ops: ops.map(function (o) {
      var c = R.categoriser(o, mem, credits);
      return Object.assign({}, o, { cle: c.cle, raison: c.raison, manuel: false, marchand: R.cleMarchand(o.libelle) });
    }) };
    etat("");
    rendre();
    $("mo-rel-resultat").hidden = false;
    $("mo-rel-titre").focus();
  }

  /* ---------- Affichage ---------- */
  function choixEnveloppe(o, i) {
    var s = cree("select", "mo-rel__env");
    s.setAttribute("data-i", String(i)); s.setAttribute("aria-label", "Enveloppe de « " + o.libelle + " »");
    B.ENVELOPPES.forEach(function (e) { var op = cree("option", null, COURT[e.cle]); op.value = e.cle; s.appendChild(op); });
    var ig = cree("option", null, "Ignorer"); ig.value = "ignore"; s.appendChild(ig);
    s.value = o.cle; s.setAttribute("data-env", o.cle);
    return s;
  }
  function rendre() {
    if (!lu) return;
    var p = O.profil() || {}, budget = p.budget || {}, bl = R.bilan(lu.ops, budget, new Date());
    var doublon = (budget.imports || []).indexOf(lu.emp) !== -1;
    $("mo-rel-titre").textContent = lu.titre + " · " + lu.ops.length + " opération" + (lu.ops.length > 1 ? "s" : "") + " lue" + (lu.ops.length > 1 ? "s" : "");
    /* Liste : reconstruite seulement à la lecture ; ensuite les étiquettes changent sur place. */
    var ol = $("mo-rel-ops");
    if (+ol.getAttribute("data-n") !== lu.ops.length || ol.getAttribute("data-emp") !== lu.emp) {
      ol.textContent = "";
      lu.ops.forEach(function (o, i) {
        var li = cree("li", "mo-rel__op"); li.setAttribute("data-i", String(i));
        li.appendChild(cree("span", "mo-rel__date chiffre", o.date.slice(8, 10) + "/" + o.date.slice(5, 7)));
        li.appendChild(cree("span", "mo-rel__lib", o.libelle));
        if (o.sens === "credit") li.appendChild(cree("span", "mo-rel__puce mo-rel__puce--revenu", "Entrée · ignorée"));
        else { var w = cree("span", "mo-rel__choix"); w.appendChild(choixEnveloppe(o, i)); li.appendChild(w); }
        li.appendChild(cree("span", "mo-rel__mt chiffre" + (o.sens === "credit" ? " mo-rel__mt--plus" : ""), (o.sens === "credit" ? "+" : "−") + dt3(o.montant)));
        ol.appendChild(li);
      });
      ol.setAttribute("data-n", String(lu.ops.length)); ol.setAttribute("data-emp", lu.emp);
    }
    lu.ops.forEach(function (o, i) {
      var li = ol.children[i], s = li.querySelector("select");
      if (s) { if (s.value !== o.cle) s.value = o.cle; s.setAttribute("data-env", o.cle); }
      var deja = o.cle === "credits" && bl.dejaCompte[o.date.slice(0, 7)];
      li.classList.toggle("mo-rel__op--ignore", doublon || o.cle === "ignore" || !!deja || o.sens === "credit" || !R.moisGarde(o.date.slice(0, 7), new Date()));
      var note = li.querySelector(".mo-rel__note");
      deja = deja && !doublon;
      if (deja && !note) { note = cree("small", "mo-rel__note", "déjà compté"); li.querySelector(".mo-rel__choix").appendChild(note); }
      else if (!deja && note) note.remove();
    });
    /* Totaux par enveloppe. */
    var tu = $("mo-rel-tuiles"); tu.textContent = "";
    B.ENVELOPPES.forEach(function (e) {
      var v = bl.parEnveloppe[e.cle]; if (!(v > 0)) return;
      var d = cree("div", "mo-rel__tuile"); d.setAttribute("data-env", e.cle);
      d.appendChild(cree("span", null, LIB[e.cle])); d.appendChild(cree("b", "chiffre", dt(v)));
      tu.appendChild(d);
    });
    var n = lu.ops.filter(function (o) { return o.sens === "debit" && o.cle !== "ignore" && !(o.cle === "credits" && bl.dejaCompte[o.date.slice(0, 7)]) && R.moisGarde(o.date.slice(0, 7), new Date()); }).length;
    var mois = Object.keys(bl.parMois).filter(function (k) { return Object.keys(bl.parMois[k]).length; });
    var bt = $("mo-rel-ajouter");
    bt.disabled = doublon || !(bl.total > 0);
    $("mo-rel-ajouter-lib").textContent = "Ajouter " + n + " dépense" + (n > 1 ? "s" : "") + " au budget";
    var info = [];
    tu.hidden = doublon;
    if (doublon) info.push("Ce relevé a déjà été ajouté à votre budget : il ne peut pas l'être deux fois. Pour le refaire, annulez d'abord l'ajout depuis le message, ou importez un autre relevé.");
    else {
      if (mois.length > 1) info.push("Les dépenses vont dans leur mois : " + mois.map(function (k) { return k.slice(5, 7) + "/" + k.slice(0, 4); }).join(", ") + ".");
      if (bl.horsPeriode) info.push(bl.horsPeriode + " opération" + (bl.horsPeriode > 1 ? "s" : "") + " de plus de 12 mois ignorée" + (bl.horsPeriode > 1 ? "s" : "") + " : le budget garde les 12 derniers mois.");
      if (Object.keys(bl.dejaCompte).length) info.push("Mensualités de crédit déjà notées comme payées : elles ne sont pas comptées deux fois.");
    }
    var z = $("mo-rel-info"); z.textContent = info.join(" "); z.hidden = !info.length; z.classList.toggle("mo-rel__info--alerte", doublon);
    $("mo-rel-total").textContent = bl.total > 0 && !doublon ? "Total ajouté : " + dt(bl.total) : "";
  }
  function vider() {
    lu = null; $("mo-rel-resultat").hidden = true;
    var ol = $("mo-rel-ops"); ol.textContent = ""; ol.removeAttribute("data-n"); ol.removeAttribute("data-emp");
  }

  /* ---------- Gestes ---------- */
  $("mo-rel-ops").addEventListener("change", function (e) {
    var s = e.target.closest("select[data-i]"); if (!s || !lu) return;
    var o = lu.ops[+s.getAttribute("data-i")]; if (!o) return;
    o.cle = s.value; o.manuel = true;
    /* Même commerçant ailleurs dans le relevé : même enveloppe (sauf choix déjà fait à la main). */
    if (o.marchand) lu.ops.forEach(function (x) { if (x !== o && !x.manuel && x.sens === "debit" && x.marchand === o.marchand) x.cle = o.cle; });
    rendre();
  });
  $("mo-rel-annuler").addEventListener("click", function () { vider(); etat(""); $("mo-rel-fichier").value = ""; $("mo-rel-choisir").focus(); });
  $("mo-rel-ajouter").addEventListener("click", function () {
    if (!lu) return;
    var p = O.profil() || {}, budget = p.budget || { enveloppes: [], mois: {} }, bl = R.bilan(lu.ops, budget, new Date());
    if (!(bl.total > 0) || (budget.imports || []).indexOf(lu.emp) !== -1) return;
    var choix = {};
    lu.ops.forEach(function (o) { if (o.manuel && o.marchand && o.sens === "debit") choix[o.marchand] = o.cle; });
    var pl = OB.plan(), nb = R.appliquer(budget, bl, choix, lu.emp, pl.propose ? pl.enveloppes : null);
    var n = Object.keys(choix).length;
    OB.enregistrer(B.normaliser(nb), dt(bl.total) + " de dépenses ajoutés à votre budget",
      "Depuis « " + lu.titre + " »." + (n ? " Orbite retient " + n + " choix d'enveloppe pour vos prochains relevés." : ""));
    vider(); $("mo-rel-fichier").value = "";
    etat("Relevé ajouté. Vous pouvez en importer un autre.", "ok");
  });

  var depot = $("mo-rel-depot"), entree = $("mo-rel-fichier");
  $("mo-rel-choisir").addEventListener("click", function () { entree.click(); });
  entree.addEventListener("change", function () { if (entree.files && entree.files[0]) lireFichier(entree.files[0]); });
  ["dragenter", "dragover"].forEach(function (t) { depot.addEventListener(t, function (e) { e.preventDefault(); depot.classList.add("mo-rel__depot--survol"); }); });
  ["dragleave", "drop"].forEach(function (t) { depot.addEventListener(t, function () { depot.classList.remove("mo-rel__depot--survol"); }); });
  depot.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) lireFichier(f); });

  /* Le profil change (budget mis à jour ailleurs) : le bilan suit (crédits déjà notés, relevé déjà ajouté). */
  O.surProfil(function () { if (lu) rendre(); });
  /* #mois?onglet=budget&releve=1 (palette Ctrl K) : aller droit à l'import. */
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "mois" || e.detail.params.get("releve") !== "1") return;
    requestAnimationFrame(function () { $("mo-releve").scrollIntoView({ block: "start" }); $("mo-rel-choisir").focus({ preventScroll: true }); });
  });
  window.OrbiteReleve = { lireFichier: lireFichier };
})();
