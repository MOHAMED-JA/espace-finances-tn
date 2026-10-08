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
  /* Prix calculés par le serveur (offre de lancement, code promo appliqué). */
  var prixServeur = [], codeApplique = null;

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
    var liste = A.offres(formules, prixServeur);
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
      if (o.promo) {
        var pr = cree("span", "ab-offre__promo");
        pr.appendChild(icone("etoile"));
        pr.appendChild(cree("span", null, (o.promo.automatique ? (o.promo.libelle || "Offre de lancement") : "Code " + o.promo.code) + " : −" + o.promo.remisePct + " %" + (o.promo.fin ? " jusqu'au " + date(o.promo.fin) : "")));
        carte.appendChild(pr);
      }
      var prix = cree("span", "ab-offre__prix");
      if (o.prixAvant) { var av = cree("s", "ab-offre__avant chiffre", F.dt3(o.prixAvant)); av.setAttribute("aria-label", "au lieu de " + dt3(o.prixAvant)); prix.appendChild(av); }
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
    var o = A.offres(formules, prixServeur).filter(function (x) { return x.cle === choisie; })[0];
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
    E.abonnement.commander(choisie, codeApplique).then(function (r) {
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

  /* ---------- Code promo : vérifié par le serveur, qui recalcule aussi les prix ---------- */
  function messageCode(t, type) { var m = $("ab-code-msg"); m.textContent = t || ""; m.setAttribute("data-type", type || ""); }
  function chargerPrix() {
    return E.abonnement.offres(codeApplique).then(function (p) { prixServeur = p || []; }).catch(function () { prixServeur = []; });
  }
  function appliquerCode() {
    var champ = $("ab-code"), code = champ.value.replace(/\s+/g, "").toUpperCase();
    if (!code) { messageCode("Saisissez un code.", "erreur"); champ.focus(); return; }
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) { messageCode("Ce code n'existe pas.", "erreur"); return; }
    var b = $("ab-code-appliquer"); b.disabled = true;
    E.abonnement.verifierCode(code).then(function (r) {
      if (!r || !r.valide) { messageCode((r && r.message) || "Ce code n'existe pas.", "erreur"); return; }
      codeApplique = r.code;
      champ.value = r.code;
      return chargerPrix().then(function () {
        rendreOffres();
        var vise = r.formules && r.formules.length ? " (formule " + r.formules.map(libelleFormule).join(", ") + ")" : "";
        messageCode("Code " + r.code + " appliqué : −" + r.remise_pct + " %" + vise + ".", "ok");
        $("ab-code-retirer").hidden = false;
      });
    }).catch(function (x) { messageCode(E.modele.messageErreur(x), "erreur"); }).finally(function () { b.disabled = false; });
  }
  $("ab-code-appliquer").addEventListener("click", appliquerCode);
  $("ab-code").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); appliquerCode(); } });
  $("ab-code-retirer").addEventListener("click", function () {
    codeApplique = null; $("ab-code").value = ""; this.hidden = true; messageCode("");
    chargerPrix().then(rendreOffres);
  });

  /* ---------- Parrainage : un mois offert au parrain et au filleul au premier abonnement ---------- */
  var parrainage = null;
  function lienParrainage(code) { return location.origin + "/connexion.html?mode=inscription&parrain=" + encodeURIComponent(code); }
  function rendreParrainage() {
    var p = parrainage, sec = $("ab-parrainage");
    sec.hidden = !p || !p.code;
    if (!p || !p.code) return;
    $("ab-parr-code").textContent = p.code;
    $("ab-parr-partager").hidden = !navigator.share;
    $("ab-parr-bilan").textContent = !p.filleuls ? "Personne n'a encore utilisé votre lien."
      : p.filleuls + " personne" + (p.filleuls > 1 ? "s inscrites" : " inscrite") + " avec votre lien · " + p.recompenses + " mois gagné" + (p.recompenses > 1 ? "s" : "") + ".";
    $("ab-parr-form").hidden = !p.peut_saisir;
  }
  function chargerParrainage() {
    return E.parrainage.moi().then(function (p) { parrainage = p; rendreParrainage(); return p; }).catch(function () { return null; });
  }
  $("ab-parr-copier").addEventListener("click", function () {
    if (!parrainage) return;
    var lien = lienParrainage(parrainage.code);
    (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject(new Error("presse-papiers"))).then(function () { O.toast("Lien copié : envoyez-le à vos proches."); })
      .catch(function () { O.toast("Votre lien : " + lien, { duree: 12000 }); });
  });
  $("ab-parr-partager").addEventListener("click", function () {
    if (!parrainage || !navigator.share) return;
    navigator.share({ title: "Orbite", text: "Je calcule mon salaire, mon épargne et mes crédits avec Orbite. Inscris-toi avec mon lien : un mois offert pour nous deux à ton premier abonnement.", url: lienParrainage(parrainage.code) }).catch(function () {});
  });
  function utiliserParrain(code, discret) {
    return E.parrainage.utiliser(code).then(function (r) {
      if (r && r.ok) { O.toast("Code de parrainage enregistré : un mois vous sera offert à votre premier abonnement.", { duree: 8000 }); return chargerParrainage(); }
      if (!discret) { var m = $("ab-parr-msg"); m.textContent = (r && r.message) || "Ce code n'a pas pu être utilisé."; m.setAttribute("data-type", "erreur"); }
    });
  }
  $("ab-parr-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var code = $("ab-parr-saisie").value.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) { var m = $("ab-parr-msg"); m.textContent = "Un code de parrainage compte 8 caractères."; m.setAttribute("data-type", "erreur"); return; }
    utiliserParrain(code).catch(function (x) { O.toast(E.modele.messageErreur(x), { erreur: true }); });
  });
  /* Code reçu par lien d'invitation (?parrain=), mémorisé sur la page d'inscription. */
  function parrainEnAttente() {
    var code = null;
    try { code = localStorage.getItem("ef-parrain"); } catch (e) {}
    if (!code) return;
    try { localStorage.removeItem("ef-parrain"); } catch (e) {}
    if (/^[A-Z0-9]{8}$/.test(code) && parrainage && parrainage.peut_saisir) utiliserParrain(code, true).catch(function () {});
  }

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
      E.abonnement.formules().then(function (f) { formules = f || []; }),
      chargerPrix()
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

  function demarrer() { charger().then(retourPaiement); chargerParrainage().then(parrainEnAttente); }
  if (O.pret) demarrer();
  else doc.addEventListener("orbite:pret", demarrer, { once: true });

  window.OrbiteAbonnement = { recharger: charger, acces: function () { return acces; } };
})();
