/*
 * Orbite — abonnement : essai gratuit de 3 jours, formules prépayées, paiement et retour de passerelle.
 * L'état d'accès et les prix viennent du serveur (fonction mon_acces, table formules) ;
 * l'activation n'a lieu que côté serveur, après vérification du paiement auprès de la passerelle.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, A = window.AbonnementCalcul, doc = document;
  var $ = O.$, F = O.F;
  var acces = null, formules = [], choisie = null, paiementsCharges = false;

  var DATE = new Intl.DateTimeFormat("fr-TN", { day: "numeric", month: "long", year: "numeric" });
  function date(iso) { return iso ? DATE.format(new Date(iso)) : ""; }
  function dt3(v) { return F.dt3(v) + " DT"; }
  function cree(tag, cls, texte) { var e = doc.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; }
  function icone(nom) {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("aria-hidden", "true");
    var u = doc.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "/orbite/icones.svg#" + nom); s.appendChild(u); return s;
  }

  /* ---------- État d'accès : pastille, badge, statut, garde des vues ---------- */
  function rendreAcces() {
    var r = A.resume(acces);
    var p = $("pastille-acces");
    p.hidden = !r.pastille;
    p.classList.toggle("pastille-acces--urgent", r.urgent);
    $("pastille-acces-lib").textContent = r.etat === "expire" ? "S'abonner" : r.etat === "essai" ? (r.jours <= 1 ? "Essai : dernier jour" : "Essai : " + r.jours + " j") : "Renouveler";
    p.setAttribute("aria-label", r.libelle + (r.etat === "actif" ? ", renouveler l'abonnement" : ", voir les formules"));
    var b = $("badge-abonnement");
    b.hidden = !(r.etat === "essai" || r.etat === "expire");
    b.textContent = r.etat === "expire" ? "Terminé" : r.jours + " j";

    var st = $("ab-statut");
    st.setAttribute("data-etat", r.etat);
    var titre = $("ab-statut-titre"), sous = $("ab-statut-sous");
    if (r.etat === "essai") { titre.textContent = r.libelle; sous.textContent = "Profitez de tout Orbite jusqu'au " + date(acces.essai_fin) + ". Si vous choisissez une formule maintenant, elle commencera à la fin de votre essai : vous ne perdez aucun jour."; }
    else if (r.etat === "expire") { titre.textContent = "Votre essai gratuit est terminé"; sous.textContent = "Vos données sont conservées. Choisissez une formule pour retrouver vos calculs, vos conseils et vos simulations."; }
    else if (r.etat === "actif") { titre.textContent = "Abonné jusqu'au " + date(acces.fin); sous.textContent = "Formule " + libelleFormule(acces.formule) + ". Un nouvel achat prolonge votre abonnement à partir de cette date."; }
    else if (r.etat === "offert") { titre.textContent = "Accès offert"; sous.textContent = "Votre compte dispose d'un accès complet, sans abonnement."; }
    else { titre.textContent = "Abonnement"; sous.textContent = "L'état de votre abonnement n'a pas pu être lu. Réessayez dans un instant."; }

    var ca = $("compte-abonnement");
    if (ca) ca.textContent = r.etat === "actif" ? "Abonné jusqu'au " + date(acces.fin) + "." : r.etat === "essai" ? r.libelle + " (jusqu'au " + date(acces.essai_fin) + ")." : r.etat === "offert" ? "Accès offert." : r.etat === "expire" ? "Essai terminé : choisissez une formule." : "—";

    /* Garde : à l'expiration, seuls le profil, le compte et l'abonnement restent ouverts. */
    O.definirGarde(function (vue) { return A.vueAutorisee(vue, acces); });
  }

  function libelleFormule(cle) {
    var f = formules.filter(function (x) { return x.cle === cle; })[0];
    return f ? f.libelle.toLowerCase() : cle || "";
  }

  /* ---------- Offres ---------- */
  function rendreOffres() {
    var box = $("ab-offres");
    var liste = A.offres(formules);
    box.textContent = "";
    box.setAttribute("aria-busy", "false");
    if (!liste.length) { box.appendChild(cree("p", "ab-vide", "Les formules n'ont pas pu être chargées. Réessayez dans un instant.")); return; }
    if (!choisie || !liste.some(function (o) { return o.cle === choisie; })) choisie = (liste.filter(function (o) { return o.recommandee; })[0] || liste[0]).cle;
    liste.forEach(function (o, i) {
      var l = cree("label", "ab-offre" + (o.recommandee ? " ab-offre--vedette" : ""));
      l.style.setProperty("--i", String(i));
      var input = cree("input"); input.type = "radio"; input.name = "ab-formule"; input.value = o.cle; input.checked = o.cle === choisie;
      l.appendChild(input);
      var carte = cree("span", "ab-offre__carte");
      var tete = cree("span", "ab-offre__tete");
      tete.appendChild(cree("span", "ab-offre__nom", o.libelle));
      if (o.recommandee) tete.appendChild(cree("span", "ab-offre__badge", "Le plus avantageux"));
      else if (o.reductionPct > 0) tete.appendChild(cree("span", "ab-offre__remise", "−" + o.reductionPct + " %"));
      carte.appendChild(tete);
      var prix = cree("span", "ab-offre__prix");
      prix.appendChild(cree("strong", "chiffre", F.dt3(o.prix)));
      prix.appendChild(cree("span", null, "DT"));
      carte.appendChild(prix);
      carte.appendChild(cree("span", "ab-offre__mois", o.mois === 1 ? "par mois, sans engagement" : "soit " + dt3(o.prixMois) + " par mois · " + o.mois + " mois"));
      if (o.economie > 0) {
        var gain = cree("span", "ab-offre__gain");
        gain.appendChild(icone("valide"));
        gain.appendChild(cree("span", null, (o.moisOfferts ? o.moisOfferts + " mois offerts · " : "") + "vous économisez " + dt3(o.economie) + (o.recommandee ? " (−" + o.reductionPct + " %)" : "")));
        carte.appendChild(gain);
      }
      l.appendChild(carte);
      box.appendChild(l);
    });
    majBouton();
  }
  function majBouton() {
    var o = A.offres(formules).filter(function (x) { return x.cle === choisie; })[0];
    var b = $("ab-payer");
    b.disabled = !o;
    $("ab-payer-lib").textContent = o ? "Payer " + dt3(o.prix) + " · " + o.libelle.toLowerCase() : "Choisir une formule";
  }
  $("ab-offres").addEventListener("change", function (e) {
    if (e.target.name !== "ab-formule") return;
    choisie = e.target.value;
    majBouton();
  });

  /* ---------- Paiement : le serveur crée la commande, la passerelle encaisse ---------- */
  $("ab-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!choisie) return;
    var b = $("ab-payer"), err = $("ab-erreur");
    err.hidden = true;
    b.disabled = true; b.setAttribute("aria-busy", "true");
    $("ab-payer-lib").textContent = "Redirection vers le paiement sécurisé…";
    E.abonnement.commander(choisie).then(function (r) {
      var url = A.adressePaiementSure(r && r.url);
      if (!url) throw new Error("Adresse de paiement invalide.");
      location.assign(url);
    }).catch(function (x) {
      err.textContent = (x && x.message) || "Le paiement n'a pas pu démarrer. Réessayez dans un instant.";
      err.hidden = false;
      b.removeAttribute("aria-busy");
      majBouton();
    });
  });

  /* ---------- Historique ---------- */
  var STATUTS = { paye: "Payé", cree: "En attente", echec: "Refusé", annule: "Annulé" };
  function rendreHistorique(liste) {
    var ul = $("ab-historique");
    ul.textContent = "";
    if (!liste.length) { ul.appendChild(cree("li", "ab-vide", "Aucun paiement pour l'instant.")); return; }
    liste.forEach(function (p) {
      var li = cree("li", "ab-ligne");
      li.setAttribute("data-statut", p.statut);
      var g = cree("span", "ab-ligne__g");
      g.appendChild(cree("strong", null, "Formule " + libelleFormule(p.formule)));
      g.appendChild(cree("small", null, date(p.paye_le || p.cree_le) + " · " + p.reference));
      li.appendChild(g);
      var d = cree("span", "ab-ligne__d");
      d.appendChild(cree("strong", "chiffre", dt3(p.montant_millimes / 1000)));
      d.appendChild(cree("span", "puce ab-ligne__statut", STATUTS[p.statut] || p.statut));
      li.appendChild(d);
      ul.appendChild(li);
    });
  }
  function chargerHistorique() {
    paiementsCharges = true;
    return E.abonnement.paiements().then(rendreHistorique).catch(function () { paiementsCharges = false; });
  }

  /* ---------- Chargement ---------- */
  function charger() {
    return Promise.all([
      E.abonnement.acces().then(function (a) { acces = a; }),
      E.abonnement.formules().then(function (f) { formules = f || []; })
    ]).then(function () {
      rendreAcces(); rendreOffres();
    }).catch(function () {
      /* Service indisponible : on n'empêche jamais l'accès par erreur. */
      acces = acces || null;
      rendreOffres();
      if (acces) rendreAcces();
      else { $("ab-statut-titre").textContent = "Abonnement"; $("ab-statut-sous").textContent = "L'état de votre abonnement n'a pas pu être lu. Réessayez dans un instant."; }
    });
  }

  /* ---------- Retour de la passerelle : /espace/?paiement=REF[&echec=1] ---------- */
  function retourPaiement() {
    var q = new URLSearchParams(location.search), ref = q.get("paiement"), echec = q.get("echec") === "1";
    if (!ref) return;
    history.replaceState(null, "", location.pathname + "#abonnement");
    if (!A.REFERENCE.test(ref)) return;
    var essais = 0;
    (function verifier() {
      E.abonnement.verifier(ref).then(function (r) {
        if (r && r.statut === "paye") {
          return charger().then(function () {
            chargerHistorique();
            O.toast("Paiement confirmé : merci ! Votre abonnement est actif jusqu'au " + date(acces && acces.fin) + ".", { duree: 9000 });
            celebrer();
          });
        }
        if (r && r.statut === "en_attente" && !echec && essais++ < 6) return setTimeout(verifier, 2500);
        chargerHistorique();
        if (echec || (r && r.statut === "echec")) O.toast("Le paiement n'a pas abouti : aucun montant n'a été débité. Vous pouvez réessayer.", { erreur: true });
        else O.toast("Votre paiement est en cours de confirmation. L'abonnement sera activé dès sa validation.", { duree: 9000 });
      }).catch(function (x) { O.toast((x && x.message) || "Vérification du paiement impossible pour le moment.", { erreur: true }); });
    })();
  }

  /* Petite célébration à la confirmation (désactivée si l'animation est réduite). */
  function celebrer() {
    var st = $("ab-statut");
    st.classList.remove("ab-statut--fete"); void st.offsetWidth; st.classList.add("ab-statut--fete");
  }

  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue === "abonnement" && !paiementsCharges) chargerHistorique();
  });

  function demarrer() { charger().then(retourPaiement); }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });

  window.OrbiteAbonnement = { recharger: charger, acces: function () { return acces; } };
})();
