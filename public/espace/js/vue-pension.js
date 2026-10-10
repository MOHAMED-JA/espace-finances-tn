/*
 * Orbite — « Ma pension » : le module Salaire d'un retraité (profil.activite = "retraite").
 * Pension brute ⇄ nette, détail (retenue maladie 4 %, abattement, déductions, impôt), hausse du net due à la
 * loi de finances 2026 (abattement 30 % en 2027, 40 % en 2028, 50 % en 2029) et avantage de l'assurance vie.
 * Calculs : moteurs/salaire/pension.js. La saisie simule ; « Mettre à jour mon profil » passe par l'historique.
 */
(function () {
  "use strict";
  var O = window.Orbite, CP = window.CalculPension, OI = window.OrbiteIntelligence, F = O.F, $ = O.$, doc = document;
  var vue = $("vue-salaire"), forcerSalaire = false, saisie = null;

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function dt3(v) { return F.dt3(v) + " DT"; }
  function dt0(v) { return F.dt0(v) + " DT"; }
  function sens() { var r = doc.querySelector('input[name="pv-sens"]:checked'); return r ? r.value : "brut"; }
  function entree(p, annee) {
    return { chefDeFamille: p.chefDeFamille, enfants: p.enfants, etudiants: p.etudiants, handicapes: p.handicapes, parents: p.parents, etranger: p.pensionEtrangere, annee: annee };
  }
  function calcul(p, montant, s, annee) {
    var e = entree(p, annee);
    return s === "net" ? CP.calculerDepuisNet(Object.assign(e, { netMensuel: montant })) : CP.calculerDepuisBrut(Object.assign(e, { brutMensuel: montant }));
  }
  function ligne(tb, lib, sous, mois, an, cls) {
    var tr = cree("tr", cls || ""), t0 = cree("td", "", lib);
    if (sous) t0.appendChild(cree("small", "", sous));
    tr.appendChild(t0); tr.appendChild(cree("td", "", mois)); tr.appendChild(cree("td", "", an)); tb.appendChild(tr);
  }

  /* Affiche « Ma pension » à la place du module Salaire pour un retraité. */
  function appliquerStatut(p) {
    var retraite = !!p && p.activite === "retraite";
    vue.classList.toggle("module--pension", retraite && !forcerSalaire);
    $("pension-vue").hidden = !retraite || forcerSalaire;
    $("titre-salaire").textContent = retraite && !forcerSalaire ? "Ma pension" : "Salaire";
    doc.querySelectorAll("[data-lib-salaire]").forEach(function (x) { x.textContent = retraite ? "Pension" : "Salaire"; });
    doc.body.classList.toggle("pension-active", retraite && !forcerSalaire);
    if (!vue.hidden) { $("barre-titre").textContent = retraite && !forcerSalaire ? "Ma pension" : "Salaire"; doc.title = $("barre-titre").textContent + " — Orbite"; }
  }

  function rendre() {
    var p = O.profil(); if (!p || p.activite !== "retraite" || forcerSalaire) return;
    var Y = new Date().getFullYear(), s = sens();
    var lu = F.lire($("pv-montant").value), montant = lu.valide && !lu.vide ? lu.valeur : 0;
    $("pv-erreur").hidden = lu.valide; $("pv-erreur").textContent = lu.valide ? "" : "Montant non reconnu : exemple 1 850 ou 1 850,500.";
    $("pv-montant-lib").textContent = "Pension " + (s === "net" ? "nette" : "brute") + " par mois";
    $("pv-situation").textContent = (p.caissePension === "cnrps" ? "CNRPS" : "CNSS") + " · 12 versements par an" + (p.chefDeFamille ? " · chef de famille" : "") +
      (p.enfants ? " · " + p.enfants + " enfant" + (p.enfants > 1 ? "s" : "") + " à charge" : "") + (p.pensionEtrangere ? " · pension venant de l'étranger" : "") + ".";
    var r = calcul(p, montant, s, Y), a = r.annuel;
    /* Même pension (brut équivalent) que le profil : rien à mettre à jour. */
    var pm = p.periode === "annuel" ? p.montant / 12 : p.montant, differe = Math.abs(calcul(p, pm, p.sens, Y).mensuel.brut - r.mensuel.brut) > 0.01;
    $("pv-profil").hidden = !differe || !(montant > 0);
    $("pv-net").textContent = dt3(r.mensuel.net);
    $("pv-net-sous").textContent = "net par mois · sur " + dt0(r.mensuel.brut) + " brut · tranche d'impôt à " + F.pct(window.OrbiteCalcul.tranche(a.imposable).taux, 0);
    var tb = $("pv-detail"); tb.textContent = "";
    var th = cree("thead"), trh = cree("tr"); [String(Y), "Par mois", "Par an"].forEach(function (x) { trh.appendChild(cree("th", "", x)); }); th.appendChild(trh); tb.appendChild(th);
    var bd = cree("tbody"); tb.appendChild(bd);
    ligne(bd, "Pension brute", null, dt3(r.mensuel.brut), dt3(a.brut));
    ligne(bd, "Retenue maladie (CNAM)", "4 % de la pension brute", "−" + dt3(a.cnam / 12), "−" + dt3(a.cnam), "moins");
    ligne(bd, "Abattement forfaitaire", F.pct(a.tauxAbattement, 0) + " de la pension après retenue : pas d'impôt sur cette part", dt3(a.abattement / 12), dt3(a.abattement), "moins");
    ligne(bd, "Déductions de famille", a.deductionsLignes.map(function (l) { return l.libelle; }).join(", ") || "Aucune", dt3(a.deductions / 12), dt3(a.deductions), "moins");
    ligne(bd, "Revenu imposable", null, dt3(a.imposable / 12), dt3(a.imposable));
    ligne(bd, "Impôt sur le revenu (IRPP)", "Barème annuel ; pas de contribution sociale de solidarité sur les pensions", "−" + dt3(a.irpp / 12), "−" + dt3(a.irpp), "moins");
    ligne(bd, "Pension nette", null, dt3(r.mensuel.net), dt3(a.net), "cle");
    /* Loi de finances 2026 : net de chaque année, à pension brute égale. */
    var proj = CP.projection(Object.assign(entree(p, Y), { brutMensuel: r.mensuel.brut }), Y, Math.max(Y, 2029));
    $("pv-lf-bloc").hidden = p.pensionEtrangere || proj.length < 2;
    var b = $("pv-barres"); b.textContent = "";
    var mx = Math.max.apply(null, proj.map(function (x) { return x.netMensuel; })), mn = proj[0].netMensuel * 0.9;
    proj.forEach(function (x, i) {
      var c = cree("div", "pension-barre");
      c.appendChild(cree("span", "pension-barre__plus", i ? "+" + F.dt3(x.netMensuel - proj[0].netMensuel) : ""));
      var col = cree("i", "pension-barre__col"); col.style.height = Math.round(36 + 96 * (x.netMensuel - mn) / ((mx - mn) || 1)) + "px"; c.appendChild(col);
      c.appendChild(cree("b", "pension-barre__val", dt0(x.netMensuel)));
      c.appendChild(cree("span", "pension-barre__an", x.annee + " · " + F.pct(x.tauxAbattement, 0)));
      b.appendChild(c);
    });
    b.setAttribute("aria-label", proj.map(function (x) { return x.annee + " : " + dt0(x.netMensuel) + " net par mois"; }).join(", "));
    var gain = proj[proj.length - 1].netMensuel - proj[0].netMensuel;
    $("pv-lf").textContent = gain > 0.5 ? "En " + proj[proj.length - 1].annee + ", à pension égale, vous toucherez " + dt3(gain) + " de plus par mois qu'aujourd'hui, soit " + dt0(gain * 12) + " par an : sans hausse de pension, juste moins d'impôt."
      : "Votre pension est déjà presque exonérée d'impôt : la hausse de l'abattement change peu de chose pour vous.";
    /* Assurance vie : avantage maximal (montant qui ramène l'impôt au minimum légal). */
    var sy = O.synthese(), opt = sy && OI.optimiseurFiscal ? OI.optimiseurFiscal(sy) : null;
    $("pv-av").textContent = a.irpp < 1 ? "Votre pension n'est pas imposée : l'assurance vie ne vous ferait pas économiser d'impôt."
      : "Retraité, vous y avez droit aussi : chaque dinar versé en assurance vie est déduit de votre pension imposable (impôt jamais inférieur à 45 % de l'impôt initial)." +
        (opt && opt.gainPossible > 0 ? " Jusqu'à " + dt0(opt.gainPossible) + " d'impôt économisé cette année." : "");
  }

  function depuisProfil() {
    var p = O.profil(); if (!p) return;
    appliquerStatut(p);
    if (p.activite !== "retraite") return;
    if (doc.activeElement === $("pv-montant")) return;
    var r = doc.querySelector('input[name="pv-sens"][value="' + p.sens + '"]'); if (r) r.checked = true;
    $("pv-montant").value = F.saisie(p.periode === "annuel" ? p.montant / 12 : p.montant);
    O.placerPastilles($("pension-vue"));
    rendre();
  }

  $("pv-montant").addEventListener("input", rendre);
  $("pv-montant").addEventListener("blur", function () { var lu = F.lire(this.value); if (lu.valide && !lu.vide) this.value = F.saisie(lu.valeur); });
  doc.querySelectorAll('input[name="pv-sens"]').forEach(function (r) {
    r.addEventListener("change", function () {
      /* Bascule brut ⇄ net : le montant est converti pour garder la même pension. */
      var p = O.profil(), lu = F.lire($("pv-montant").value), avant = r.value === "net" ? "brut" : "net";
      if (p && lu.valide && !lu.vide) { var c = calcul(p, lu.valeur, avant, new Date().getFullYear()); $("pv-montant").value = F.saisie(Math.round((r.value === "net" ? c.mensuel.net : c.mensuel.brut) * 1000) / 1000); }
      O.placerPastilles($("pension-vue"), true);
      rendre();
    });
  });
  $("pv-profil").addEventListener("click", function () {
    var lu = F.lire($("pv-montant").value); if (!lu.valide || lu.vide) return;
    var p = O.profil();
    if (p.montant > 0) O.mettreAJourSalaire({ montant: lu.valeur, sens: sens(), periode: "mensuel" });
    else { O.majProfil({ montant: lu.valeur, sens: sens(), periode: "mensuel" }, { immediat: true }); O.toast("Pension enregistrée dans votre profil."); }
  });
  $("pv-voir-salaire").addEventListener("click", function () { forcerSalaire = true; appliquerStatut(O.profil()); O.toast("Simulateur de salaire affiché : « Ma pension » revient à votre prochaine visite du module."); });
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "salaire") { forcerSalaire = false; depuisProfil(); } });
  O.surProfil(function () { depuisProfil(); });
})();
