/*
 * Orbite — achat dans l'application Android (Google Play Billing, Trusted Web Activity tn.orbite.app).
 * Règle Google Play : dans l'application, les formules se paient uniquement par Google Play (aucun lien de paiement externe).
 * Le navigateur obtient les prix (Digital Goods API), lance l'achat (Payment Request) puis transmet le jeton d'achat
 * au serveur, qui le vérifie chez Google, active l'abonnement une seule fois et consomme l'achat.
 * Partie pure (prix présentés) testée sous Node ; partie navigateur active seulement dans l'application.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./abonnement-calcul.js"));
  else racine.OrbitePlay = fabrique(racine.AbonnementCalcul);
})(typeof self !== "undefined" ? self : this, function (A) {
  "use strict";

  var METHODE = "https://play.google.com/billing";
  /* Produits intégrés « consommables » créés dans la Play Console (mêmes clés que le serveur). */
  var SKU = { mensuel: "orbite_mensuel", semestriel: "orbite_semestriel", annuel: "orbite_annuel" };
  function formuleDuSku(sku) {
    for (var k in SKU) if (Object.prototype.hasOwnProperty.call(SKU, k) && SKU[k] === sku) return k;
    return null;
  }

  function montant(valeur, devise) {
    var v = Number(valeur);
    if (!isFinite(v) || v <= 0) return "";
    try { return new Intl.NumberFormat("fr-TN", { style: "currency", currency: devise || "TND" }).format(v); }
    catch (e) { return v.toFixed(2).replace(".", ",") + " " + (devise || ""); }
  }

  /* Offres présentées dans l'application : durées, réduction et mois offerts calculés sur les prix Google Play
     (fixés dans la Play Console, dans la devise du compte Google). Une formule sans produit Google n'est pas proposée. */
  function offres(formules, details) {
    var px = {};
    (details || []).forEach(function (d) {
      var f = d && formuleDuSku(d.itemId), p = d && d.price;
      if (f && p && Number(p.value) > 0 && /^[A-Z]{3}$/.test(p.currency || "")) px[f] = { valeur: Number(p.value), devise: p.currency };
    });
    var liste = (formules || []).filter(function (f) { return f && px[f.cle]; });
    if (!liste.length) return [];
    /* Une seule devise : celle de la formule la plus courte (les produits d'un même compte Google la partagent). */
    var devise = px[liste.slice().sort(function (a, b) { return a.mois - b.mois; })[0].cle].devise;
    liste = liste.filter(function (f) { return px[f.cle].devise === devise; });
    var fausses = liste.map(function (f) { return { cle: f.cle, libelle: f.libelle, mois: f.mois, prix_millimes: Math.round(px[f.cle].valeur * 1000) }; });
    return A.offres(fausses, []).map(function (o) {
      return Object.assign(o, {
        sku: SKU[o.cle], devise: devise,
        prixTexte: montant(o.prix, devise),
        prixMoisTexte: montant(o.prixMois, devise),
        economieTexte: o.economie > 0 ? montant(o.economie, devise) : ""
      });
    });
  }

  /* Réponse du serveur → message pour la personne (achat terminé, en attente ou refusé). */
  function issue(r) {
    if (r && r.statut === "paye") return { ok: true, texte: r.deja ? "Cet achat était déjà enregistré : votre abonnement est à jour." : "Paiement confirmé : merci !" };
    if (r && r.statut === "en_attente") return { ok: false, attente: true, texte: "Votre paiement est en attente chez Google Play. L'abonnement s'activera dès sa confirmation, à la prochaine ouverture d'Orbite." };
    return { ok: false, texte: "Google Play n'a pas confirmé le paiement : aucun montant n'a été débité." };
  }

  /* ---------- Navigateur (application Android uniquement) ---------- */
  function dansApplication() {
    return typeof document !== "undefined" && document.documentElement.getAttribute("data-play") === "oui";
  }
  function service() {
    var w = typeof window !== "undefined" ? window : {};
    if (typeof w.getDigitalGoodsService !== "function" || typeof w.PaymentRequest !== "function") return Promise.reject(new Error("indisponible"));
    return Promise.resolve(w.getDigitalGoodsService(METHODE)).then(function (s) { if (!s) throw new Error("indisponible"); return s; });
  }
  function details() {
    return service().then(function (s) { return s.getDetails([SKU.mensuel, SKU.semestriel, SKU.annuel]); });
  }
  function terminer(rep, etat) { return Promise.resolve(rep.complete(etat)).catch(function () {}); }

  /* Achat d'une formule : null si la personne ferme la fenêtre Google Play sans payer. */
  function acheter(formule, espace) {
    var sku = SKU[formule];
    if (!sku) return Promise.reject(new Error("Formule inconnue."));
    return service().then(function () {
      var demande = new PaymentRequest([{ supportedMethods: METHODE, data: { sku: sku } }],
        { total: { label: "Total", amount: { currency: "USD", value: "0" } } });
      return demande.show();
    }).then(function (rep) {
      var jeton = rep && rep.details && rep.details.purchaseToken;
      if (!jeton) return terminer(rep, "fail").then(function () { throw new Error("Google Play n'a pas transmis l'achat. Réessayez."); });
      return espace.abonnement.play(sku, jeton).then(function (r) {
        return terminer(rep, r && r.statut === "paye" ? "success" : r && r.statut === "en_attente" ? "unknown" : "fail").then(function () { return issue(r); });
      }, function (x) {
        return terminer(rep, "fail").then(function () { throw x; });
      });
    }, function (x) {
      if (x && x.name === "AbortError") return null;
      throw x;
    });
  }

  /* Achats payés mais pas encore enregistrés (coupure réseau, paiement en attente devenu payé) : repris à l'ouverture. */
  function restaurer(espace) {
    return service().then(function (s) { return s.listPurchases(); }).then(function (achats) {
      var actives = 0;
      return (achats || []).filter(function (a) { return a && formuleDuSku(a.itemId) && a.purchaseToken; })
        .reduce(function (suite, a) {
          return suite.then(function () {
            return espace.abonnement.play(a.itemId, a.purchaseToken).then(function (r) { if (r && r.statut === "paye" && !r.deja) actives++; }, function () {});
          });
        }, Promise.resolve()).then(function () { return actives; });
    });
  }

  return { METHODE: METHODE, SKU: SKU, formuleDuSku: formuleDuSku, montant: montant, offres: offres, issue: issue,
    dansApplication: dansApplication, service: service, details: details, acheter: acheter, restaurer: restaurer };
});
