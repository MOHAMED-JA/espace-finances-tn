/*
 * Orbite — « Patrimoine net » (Mon orbite › Patrimoine, #orbite?partie=patrimoine ; maquette validée le 13 oct. 2026).
 * Ce que l'on possède (logement, autres biens, épargne, contrats) moins ce que l'on doit (reste dû des crédits),
 * la hausse par mois, la courbe année par année (moteur commun des graphiques) et les jalons (fin des crédits…).
 * Calculs : decider-calcul.js. Valeur du logement, autres biens et hausse annuelle : gardés dans le profil (patrimoine).
 * Lot C (maquette C1, 17 oct. 2026) : « à 360° ». Chaque ligne s'ouvre sur son module, ce qui a bougé ce mois-ci, et
 * l'historique réel : un relevé par mois gardé dans le profil (patrimoineHisto), jamais d'historique inventé (ensemble-calcul.js).
 */
(function () {
  "use strict";
  var O = window.Orbite, D = window.DeciderCalcul, EC = window.EnsembleCalcul, OC = window.OrbiteCalcul, doc = document;
  if (!O || !D) return;
  var F = O.F, $ = O.$;

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function dt(v) { return F.dt0(v) + " DT"; }
  function lire(id) { var r = F.lire($(id).value); return r.valide ? (r.vide ? 0 : r.valeur) : null; }
  function ligne(x) {
    var corps = "<span>" + esc(x.libelle) + (x.estime ? "<small>estimé</small>" : "") + "</span><b>" + F.dt0(x.montant) + "</b>";
    return EC ? '<li><a class="pn__lien" href="' + esc(EC.lien(x.cle)) + '">' + corps + "</a></li>" : "<li>" + corps + "</li>";
  }
  function signe(v) { return (v >= 0 ? "+" : "−") + F.dt0(Math.abs(v)); }
  /* Ce mois-ci et historique (lot C). Le relevé du mois est gardé dans le profil s'il a changé. */
  function rendre360(sy, r) {
    if (!EC) return null;
    var p = sy.profil, m = sy.maintenant || new Date(), inst = EC.instantane(r, m), histo = EC.avecInstantane(p.patrimoineHisto, inst);
    /* Pas de relevé tant que le profil est vierge (premier pas) : rien n'est enregistré à la place de l'utilisateur. */
    if (!(O.profilVierge && O.profilVierge()) && EC.changeA(p.patrimoineHisto, inst)) O.majProfil({ patrimoineHisto: histo });
    var credits = (p.credits || []).map(function (c, i) {
      var rest = sy.credits && sy.credits[i] ? sy.credits[i].restantes : c.moisRestants;
      return { crd: D.resteDu ? D.resteDu(c, rest) : c.capitalRestant, mensualite: c.mensualite, tauxPct: c.tauxPct, actif: rest > 0 };
    });
    var vers = (p.contrats || []).reduce(function (t, c) { return t + (OC && OC.contratCommence(c, m) ? c.versementMensuel : 0); }, 0);
    var cm = EC.ceMois(p.patrimoineHisto, inst, { credits: credits, versementsEpargne: vers });
    $("pn-mois-titre").textContent = cm.reel ? "Depuis " + EC.libMois(cm.depuis) : "Ce mois-ci (estimé)";
    $("pn-mois").innerHTML = cm.lignes.length ? cm.lignes.map(function (l) { return "<li><span>" + esc(l.lib) + "</span><b class=\"" + (l.v >= 0 ? "pn__plus" : "pn__moins") + "\">" + signe(l.v) + "</b></li>"; }).join("") +
      '<li class="pn__tot"><span>Au total</span><b>' + signe(cm.variation) + " DT</b></li>" : '<li class="pn__vide"><span>Rien n\'a bougé pour l\'instant.</span></li>';
    $("pn-mois-note").textContent = cm.reel ? "Écarts réels entre vos deux derniers relevés mensuels." : "Estimé d'après vos mensualités et vos versements d'épargne ; le mois prochain, Orbite comparera avec le relevé de ce mois-ci.";
    var z = $("pn-histo");
    if (histo.length >= 2 && window.OrbiteGraphe) {
      window.OrbiteGraphe.lignes(z, {
        titre: "Votre patrimoine net, mois par mois", resume: "De " + dt(histo[0].net) + " en " + EC.libMois(histo[0].m) + " à " + dt(histo[histo.length - 1].net) + " en " + EC.libMois(histo[histo.length - 1].m) + ".",
        series: [{ nom: "Patrimoine net", c: 3, pts: histo.map(function (h, i) { return [i, h.net]; }), aire: true }],
        ticksX: histo.map(function (h, i) { return { v: i, lib: EC.libMois(h.m) }; }), titreX: function (x) { var h = histo[Math.round(x)]; return h ? EC.libMois(h.m) : ""; },
        fmtV: dt, fmtY: function (v) { return F.dt0(v); }, hauteur: 170, legende: false, tableau: { entete: "Mois" }
      });
      $("pn-histo-note").textContent = histo.length + " relevés mensuels depuis " + EC.libMois(histo[0].m) + ".";
    } else {
      z.textContent = "";
      $("pn-histo-note").textContent = "Votre historique commence en " + EC.libMois(inst.m) + " : un relevé est gardé chaque mois, la courbe se remplit à partir d'aujourd'hui (aucun chiffre passé n'est inventé).";
    }
    return cm;
  }

  function rendre() {
    var sy = O.synthese(), sec = $("patrimoine");
    if (!sy || !sec || $("vue-orbite").hidden) return;
    var r = D.patrimoine(sy), p = sy.profil, pa = p.patrimoine || {};
    $("pn-net").textContent = dt(r.net);
    var h = $("pn-hausse"), cm = rendre360(sy, r), v = cm ? cm.variation : r.parMois;
    h.hidden = Math.abs(v) < 1;
    h.textContent = (v >= 0 ? "▲ +" : "▼ −") + F.dt0(Math.abs(v)) + (cm ? " DT ce mois-ci" + (cm.reel ? "" : " (estimé)") : " DT par mois");
    h.classList.toggle("pn__hausse--baisse", v < 0);
    var tot = r.totalActifs + r.totalPassifs, pa_ = tot > 0 ? r.totalActifs / tot : 1;
    $("pn-prop").style.setProperty("--a", (pa_ * 100).toFixed(2) + "%");
    $("pn-leg-a").textContent = "Ce que vous possédez · " + F.dt0(r.totalActifs);
    $("pn-leg-p").textContent = "Ce que vous devez · " + F.dt0(r.totalPassifs);
    $("pn-actifs").innerHTML = r.actifs.map(ligne).join("") + '<li class="pn__tot"><span>Total</span><b>' + F.dt0(r.totalActifs) + "</b></li>";
    $("pn-passifs").innerHTML = (r.passifs.length ? r.passifs.map(ligne).join("") : '<li class="pn__vide"><span>Aucun crédit en cours</span></li>') + '<li class="pn__tot"><span>Total</span><b>' + F.dt0(r.totalPassifs) + "</b></li>";
    [["pn-logement", pa.logement], ["pn-autres", pa.autres]].forEach(function (x) { if (doc.activeElement !== $(x[0])) $(x[0]).value = x[1] > 0 ? F.saisie(x[1]) : ""; });
    if (doc.activeElement !== $("pn-hausse-log")) $("pn-hausse-log").value = String(r.hypotheses.hausseLogement).replace(".", ",");

    /* Courbe : patrimoine net et dettes restantes, année par année. */
    var c = r.courbe, x0 = c[0].x, x1 = c[c.length - 1].x, ticks = [];
    for (var a = Math.ceil(x0); a <= Math.floor(x1); a += c.length > 14 ? 3 : 2) ticks.push({ v: a, lib: String(a) });
    if (window.OrbiteGraphe) window.OrbiteGraphe.lignes($("pn-graphe"), {
      titre: "Votre patrimoine net jusqu'en " + Math.floor(x1),
      resume: "Patrimoine net de " + dt(r.net) + " aujourd'hui, " + dt(c[c.length - 1].net) + " en " + Math.floor(x1) + " ; dettes restantes de " + dt(r.totalPassifs) + " à " + dt(c[c.length - 1].dettes) + ".",
      series: [{ nom: "Patrimoine net", c: 3, pts: c.map(function (q) { return [q.x, q.net]; }), aire: true },
        { nom: "Dettes restantes", c: 1, pts: c.map(function (q) { return [q.x, q.dettes]; }), tirets: true }],
      xmin: x0, xmax: x1, ymin: Math.min(0, Math.min.apply(null, c.map(function (q) { return q.net; }))), ticksX: ticks,
      /* Fin des crédits (pas trop près du bord droit : l'étiquette déborderait). */
      verticales: r.jalons.filter(function (j) { return j.cle === "credit" && j.x < x1 - 2.5; }).slice(0, 2).map(function (j) { return { x: j.x, lib: j.annee + " · fin du " + j.libelle.toLowerCase() }; }),
      titreX: function (x) { return String(Math.floor(x)); }, fmtV: dt, fmtY: function (v) { return F.dt0(v); },
      hauteur: window.innerWidth < 600 ? 230 : 280, tableau: { entete: "Année" }
    });
    $("pn-jalons").innerHTML = r.jalons.map(function (j) {
      var t = j.cle === "double" ? "Patrimoine net multiplié par 2"
        : j.libelle + " soldé en " + j.mois + " : +" + F.dt0(j.marge) + " DT par mois de marge" + (j.logement ? ". Votre logement est entièrement à vous." : ".");
      return "<li><b>" + j.annee + "</b><span>" + esc(t) + "</span></li>";
    }).join("");
    $("pn-note").textContent = (r.logementSaisi ? "" : "Ajoutez la valeur de votre logement si vous êtes propriétaire. ") +
      "Hypothèses : logement " + (r.hypotheses.hausseLogement >= 0 ? "+" : "") + String(r.hypotheses.hausseLogement).replace(".", ",") + " % par an, contrats " +
      String(r.hypotheses.rendementAv).replace(".", ",") + " % par an avec vos versements actuels (réglable dans Vie & impôts › Décider), épargne disponible constante. « Estimé » : capital des contrats ou reste dû calculé d'après la mensualité, le taux et les échéances restantes.";
  }

  function enregistrer() {
    var p = O.profil(); if (!p) return;
    var lg = lire("pn-logement"), au = lire("pn-autres"), hl = F.lire(String($("pn-hausse-log").value).replace("−", "-").replace(/^-/, "")), neg = /^\s*[-−]/.test($("pn-hausse-log").value);
    if (lg === null || au === null) { O.toast("Montant non reconnu.", { erreur: true }); return; }
    var hausse = hl.valide && !hl.vide ? Math.min(15, (neg ? -1 : 1) * hl.valeur) : 2;
    O.majProfil({ patrimoine: { logement: lg, autres: au, hausseLogement: Math.max(-10, hausse) } });
  }
  ["pn-logement", "pn-autres", "pn-hausse-log"].forEach(function (id) { $(id).addEventListener("change", enregistrer); });

  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "orbite") requestAnimationFrame(rendre); });
  doc.addEventListener("orbite:partie", function (e) { if (e.detail.vue === "orbite" && e.detail.partie === "patrimoine") rendre(); });
  O.surProfil(function () { requestAnimationFrame(rendre); });
})();
