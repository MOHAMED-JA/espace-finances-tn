/*
 * Orbite — Liberté financière (Ma progression › Liberté ; lot C, maquette C2 validée le 16 oct. 2026).
 * Combien il faut pour ne plus dépendre du salaire (25 ans de dépenses, pour en retirer 4 % par an), où l'on en est,
 * l'année où l'on y arriverait à ce rythme et les trois leviers les plus efficaces, chiffrés en années gagnées.
 * Dinars constants (inflation retirée) : rendement réel de 2 % par an par défaut, modifiable. Calculs : ensemble-calcul.js.
 */
(function () {
  "use strict";
  var O = window.Orbite, EC = window.EnsembleCalcul, D = window.DeciderCalcul, OC = window.OrbiteCalcul, doc = document;
  if (!O || !EC || !D || !OC || !doc.getElementById("pg-liberte")) return;
  var F = O.F, $ = O.$, SVG = "http://www.w3.org/2000/svg";

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function icone(nom) { var s = doc.createElementNS(SVG, "svg"); s.setAttribute("aria-hidden", "true"); var u = doc.createElementNS(SVG, "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s; }
  function dt(v) { return F.dt0(v) + " DT"; }
  function virgule(v) { return String(v).replace(".", ","); }

  function donnees() {
    var sy = O.synthese(); if (!sy) return null;
    var p = sy.profil, r = D.patrimoine(sy), dm = OC.depensesMois(sy), l = p.liberte || {};
    /* Dépenses à couvrir une fois libre : la vie et le logement (les crédits finissent, l'épargne s'arrête). */
    var dep = Math.max(0, dm.total - dm.credits - dm.contrats);
    var epAuto = Math.round(dm.contrats + dm.libre * 0.5), ep = l.epargneMois != null ? l.epargneMois : epAuto;
    var an = p.dateNaissance ? +String(p.dateNaissance).slice(0, 4) : p.anneeNaissance;
    var res = EC.liberte({ patrimoine: r.net, residence: (p.patrimoine && p.patrimoine.logement) || 0, depensesMois: dep, epargneMois: ep,
      rendementReel: l.rendementReel, tauxRetrait: l.tauxRetrait, anneeNaissance: an, maintenant: sy.maintenant || new Date() });
    res.epargneAuto = epAuto; res.epargneSaisie = l.epargneMois != null; res.sourceDep = dm.source; res.residence = (p.patrimoine && p.patrimoine.logement) || 0;
    return res;
  }

  function anneau(pct) {
    var s = doc.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 120 120"); s.setAttribute("class", "lb-anneau"); s.setAttribute("aria-hidden", "true");
    var r = 50, c = 2 * Math.PI * r;
    [["lb-anneau__fond", 1], ["lb-anneau__val", pct]].forEach(function (x) {
      var k = doc.createElementNS(SVG, "circle");
      k.setAttribute("cx", 60); k.setAttribute("cy", 60); k.setAttribute("r", r); k.setAttribute("class", x[0]);
      if (x[1] < 1) { k.setAttribute("stroke-dasharray", (x[1] * c).toFixed(2) + " " + c.toFixed(2)); k.setAttribute("transform", "rotate(-90 60 60)"); }
      s.appendChild(k);
    });
    return s;
  }

  function rendre() {
    var z = $("pg-liberte"); if (!z || z.hidden) return;
    var d = donnees(); z.textContent = "";
    if (!d) return;
    var c = cree("section", "panneau lb-carte");
    c.appendChild(cree("h2", "lb-titre", "Vivre de votre patrimoine, sans salaire"));
    var haut = cree("div", "lb-haut"), an = cree("div", "lb-anneau-boite"); an.appendChild(anneau(d.pct));
    an.appendChild(cree("b", "lb-pct chiffre", Math.round(d.pct * 100) + " %")); haut.appendChild(an);
    var tx = cree("div", "lb-txt");
    tx.appendChild(cree("p", "lb-somme chiffre", F.dt0(d.actuel) + " sur " + dt(d.cible)));
    var quand = d.atteint ? "Objectif atteint : votre patrimoine peut déjà couvrir vos dépenses."
      : d.annee ? "Libre en " + d.annee + (d.age ? " · " + d.age + " ans" : "") : "Pas avant 60 ans à ce rythme";
    tx.appendChild(cree("p", "lb-quand", quand));
    var rv = cree("p", "lb-revenus"); rv.appendChild(doc.createTextNode("Revenus sans travailler aujourd'hui : ")); rv.appendChild(cree("b", "chiffre", dt(d.revenusMois) + " / mois")); tx.appendChild(rv);
    haut.appendChild(tx); c.appendChild(haut);
    c.appendChild(cree("p", "cpt-note", "Objectif : " + d.ans + " ans de vos dépenses (" + dt(d.depensesMois) + " par mois, crédits et épargne retirés), pour en retirer " + virgule(d.tauxRetrait) + " % par an sans jamais l'épuiser." +
      (d.residence > 0 ? " Votre logement (" + dt(d.residence) + ") n'est pas compté : il ne vous verse rien." : "")));
    z.appendChild(c);

    if (d.leviers.length && !d.atteint) {
      var l = cree("section", "panneau lb-carte"); l.appendChild(cree("h2", "lb-titre", "Ce qui vous rapproche"));
      var ul = cree("ul", "lb-leviers"); ul.setAttribute("role", "list");
      d.leviers.forEach(function (x) {
        var li = cree("li", "lb-levier"), ic = cree("span", "lb-levier__ico", x.cle === "depenses" ? "−10" : x.cle === "rendement" ? "+1" : "+200");
        var t = cree("div"); t.appendChild(cree("b", null, x.titre)); t.appendChild(cree("span", null, x.detail));
        li.appendChild(ic); li.appendChild(t);
        li.appendChild(cree("b", "lb-gain chiffre", x.ans === Infinity ? "devient possible" : x.ans + (x.ans > 1 ? " ans" : " an") + " plus tôt"));
        ul.appendChild(li);
      });
      l.appendChild(ul);
      l.appendChild(cree("p", "cpt-note", "Les années gagnées ne s'additionnent pas : chaque levier est calculé seul. Dépenser moins agit deux fois : l'objectif baisse et l'épargne monte."));
      z.appendChild(l);
    }

    var h = cree("details", "panneau lb-hyp"), su = cree("summary"); su.appendChild(icone("outils")); su.appendChild(doc.createTextNode("Changer l'objectif ou les hypothèses")); h.appendChild(su);
    var g = cree("div", "grille-champs");
    [["lb-retrait", "Retrait par an", d.tauxRetrait, "%", "4 % : la règle la plus répandue (de 2 à 8)"],
     ["lb-rendement", "Rendement après inflation", d.rendementReel, "%", "Ce que vos placements rapportent au-delà de l'inflation"],
     ["lb-epargne", "Mis de côté chaque mois", d.epargneMois, "DT", d.epargneSaisie ? "Votre montant (vide : celui d'Orbite, " + dt(d.epargneAuto) + ")" : "Estimé : vos versements d'épargne et la moitié de ce qui vous reste"]].forEach(function (x) {
      var ch = cree("div", "champ"), lab = cree("label", null, x[1]); lab.setAttribute("for", x[0]); ch.appendChild(lab);
      var sa = cree("div", "saisie"), inp = cree("input"); inp.id = x[0]; inp.type = "text"; inp.inputMode = "decimal"; inp.autocomplete = "off";
      inp.value = x[0] === "lb-epargne" && !d.epargneSaisie ? "" : virgule(x[2]); if (x[0] === "lb-epargne") inp.placeholder = F.dt0(d.epargneAuto);
      sa.appendChild(inp); sa.appendChild(cree("span", "saisie__unite", x[3])); ch.appendChild(sa);
      var aide = cree("span", "champ__aide", x[4]); aide.id = x[0] + "-aide"; inp.setAttribute("aria-describedby", aide.id); ch.appendChild(aide);
      g.appendChild(ch);
    });
    h.appendChild(g);
    var b = cree("button", "bouton bouton--plein bouton--petit", "Recalculer"); b.type = "button"; b.id = "lb-appliquer"; h.appendChild(b);
    z.appendChild(h);
    z.appendChild(cree("p", "cpt-note", "Calcul en dinars constants : tous les montants sont ceux d'aujourd'hui, l'inflation est déjà retirée du rendement. Une estimation pour s'orienter, pas une promesse."));
  }

  $("pg-liberte").addEventListener("click", function (e) {
    if (!e.target.closest("#lb-appliquer")) return;
    function lire(id) { var r = F.lire(String($(id).value).replace("−", "-")); return r.valide ? (r.vide ? null : r.valeur) : NaN; }
    var tr = lire("lb-retrait"), rr = lire("lb-rendement"), ep = lire("lb-epargne");
    if ([tr, rr, ep].some(function (v) { return v !== null && isNaN(v); })) { O.toast("Un nombre n'est pas reconnu", { erreur: true }); return; }
    if (tr !== null && (tr < 2 || tr > 8)) { O.toast("Le retrait par an doit être entre 2 et 8 %", { erreur: true }); return; }
    var avant = JSON.parse(JSON.stringify((O.profil() || {}).liberte || null));
    O.majProfil({ liberte: { tauxRetrait: tr === null ? 4 : tr, rendementReel: rr === null ? 2 : Math.min(15, rr), epargneMois: ep } }, { immediat: true });
    O.toast("Liberté financière recalculée", { action: { libelle: "Annuler", fn: function () { O.majProfil({ liberte: avant }, { immediat: true }); } } });
  });

  window.OrbiteLiberte = { rendre: rendre, donnees: donnees };
  O.surProfil(function () { rendre(); });
})();
