/*
 * Orbite — rappels datés (pur, testé sous Node) : fin de l'essai, fin de l'abonnement,
 * dernière échéance d'un crédit, réduction de taux à demander (règle des 8 %), échéance fiscale de fin d'année,
 * rappels programmés par l'utilisateur (profil.rappelsPerso), échéances des placements, des assurances et des
 * remboursements entre proches (lots A et B).
 * Chaque rappel : { id (unique, stable), titre, corps, url, quand (ISO : à partir de quand l'afficher), jusqua (ISO, facultatif) }.
 * Aucun montant précis du profil n'est mis dans les rappels transmis au service worker au-delà de ce que l'utilisateur voit déjà.
 * Chaque rappel porte aussi type et mail : { etiquette, titre, corps, conseil, bouton }, textes de l'email de rappel,
 * SANS AUCUN MONTANT (choix de sécurité : l'email passe par Brevo et la messagerie). planEmail(liste) les extrait.
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique();
  else racine.RappelsCalcul = fabrique();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var JOUR = 86400000;
  var CONSEIL_REDUCTION = "Passez à l'agence ou envoyez un courrier daté, avec votre tableau d'amortissement. Gardez une copie.";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function dt(v) { return Math.round(v).toLocaleString("fr-FR") + " DT"; }
  function iso(d) { return new Date(d).toISOString(); }
  function mail(etiquette, titre, corps, conseil, bouton) { return { etiquette: etiquette, titre: titre, corps: corps, conseil: conseil || "", bouton: bouton }; }
  function minuscule(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  /* Dates « AAAA-MM-JJ » (lots A et B) : à une heure donnée, n mois plus tard, prochain anniversaire, libellé. */
  function jourA(s, h) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), h || 0, 0, 0).getTime(); }
  function isoJour(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function plusMoisJour(s, n) {
    var a = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n, j = +s.slice(8, 10), dernier = new Date(a, m + 1, 0).getDate();
    return isoJour(new Date(a, m, Math.min(j, dernier), 12));
  }
  function prochainAnniversaire(s, m) { var x = s, k = 0, auj = isoJour(m); while (x < auj && k < 100) { k++; x = plusMoisJour(s, 12 * k); } return x; }
  function libJour(s) { var j = +s.slice(8, 10); return (j === 1 ? "1er" : j) + " " + MOIS[+s.slice(5, 7) - 1]; }
  var NOMS_ASSURANCE = { auto: "auto", habitation: "habitation", sante: "santé", deces: "décès-invalidité", prevoyance: "prévoyance", autre: "" };
  function nomAssurance(x) { return (x.nom || NOMS_ASSURANCE[x.type] || "").toLowerCase() || "en cours"; }

  /* sy : synthèse OrbiteCalcul ; acces : mon_acces() ; fiscal : optimiseurFiscal(sy) ; m : maintenant. */
  function rappels(sy, acces, fiscal, m) {
    var maintenant = m || new Date(), t = maintenant.getTime(), liste = [];
    var a = acces || {};
    if (a.etat === "essai" && a.essai_fin) {
      var fe = Date.parse(a.essai_fin);
      if (fe > t) liste.push({ id: "essai-" + a.essai_fin.slice(0, 10), titre: "Votre essai gratuit se termine demain",
        corps: "Choisissez une formule pour garder vos calculs, vos conseils et vos simulations.", url: "/espace/#abonnement", quand: iso(fe - JOUR), jusqua: iso(fe), type: "essai",
        mail: mail("Abonnement · demain", "Votre essai gratuit se termine demain", "Choisissez une formule pour garder vos calculs, vos conseils et vos simulations.",
          "Payer pendant l'essai ne vous fait perdre aucun jour : la formule commence à la fin de l'essai.", "Choisir une formule") });
    }
    if (a.etat === "actif" && a.fin) {
      var fa = Date.parse(a.fin);
      if (fa > t) liste.push({ id: "abonnement-" + a.fin.slice(0, 10), titre: "Votre abonnement se termine dans 3 jours",
        corps: "Prolongez-le pour ne rien perdre : la nouvelle période s'ajoute à la fin de l'actuelle.", url: "/espace/#abonnement", quand: iso(fa - 3 * JOUR), jusqua: iso(fa), type: "abonnement",
        mail: mail("Abonnement · dans 3 jours", "Votre abonnement se termine dans 3 jours", "Prolongez-le pour garder vos calculs, vos conseils et vos simulations.",
          "La nouvelle période s'ajoute à la fin de l'actuelle : prolonger maintenant ne vous fait perdre aucun jour.", "Prolonger mon abonnement") });
    }
    if (sy && sy.profil) {
      var p = sy.profil;
      (sy.credits || []).forEach(function (c, i) {
        var cr = p.credits[i];
        if (!cr || !(c.restantes > 0) || c.restantes > 13) return;
        /* Le mois de la dernière échéance, au 1er du mois à 9 h. */
        var d = new Date(maintenant.getFullYear(), maintenant.getMonth() + c.restantes - 1, 1, 9, 0, 0);
        var fin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        liste.push({ id: "credit-" + i + "-" + d.getFullYear() + "-" + (d.getMonth() + 1), titre: "Dernière échéance : " + cr.libelle.toLowerCase(),
          corps: "Ce mois-ci (" + MOIS[d.getMonth()] + " " + d.getFullYear() + "), " + dt(cr.mensualite) + " par mois se libèrent : votre capacité d'emprunt augmente.",
          url: "/espace/#orbite?section=marge", quand: iso(Math.max(d.getTime(), t)), jusqua: iso(fin), type: "credit",
          mail: mail(cr.libelle + " · " + MOIS[d.getMonth()] + " " + d.getFullYear(), "Dernière échéance : " + minuscule(cr.libelle),
            "En " + MOIS[d.getMonth()] + " " + d.getFullYear() + ", vous payez la dernière mensualité de ce crédit. Cette somme se libère chaque mois et votre capacité d'emprunt augmente.",
            "Demandez à votre banque une attestation de remboursement total" + (cr.type === "immo" ? ", ainsi que la mainlevée de l'hypothèque." : "."), "Voir ma marge") });
      });
    }
    /* Règle des 8 % : un mois avant la prochaine réduction de taux, rappeler de la demander à la banque. */
    if (sy && sy.profil) {
      (sy.credits || []).forEach(function (c, i) {
        var cr = sy.profil.credits[i], rt = c.reduction;
        if (!cr || !rt || !rt.applicable) return;
        var nomCr = cr.libelle.charAt(0).toLowerCase() + cr.libelle.slice(1);
        function pc(x) { return String(Math.round(x * 10000) / 10000).replace(".", ",") + " %"; }
        if (rt.possibleDepuis) {
          liste.push({ id: "reduction-" + i + "-depuis-" + rt.possibleDepuis.echeance, titre: "Réduction de taux à demander : " + nomCr,
            corps: "Depuis " + rt.possibleDepuis.date + ", la règle des 8 % permet de diviser votre taux par deux. Demandez-le à votre banque.",
            url: "/espace/#orbite", quand: iso(t), jusqua: iso(t + 60 * JOUR), type: "reduction",
            mail: mail(cr.libelle + " · à faire maintenant", "Demandez la réduction de votre taux",
              "Depuis " + rt.possibleDepuis.date + ", la règle des 8 % permet de diviser le taux de votre " + nomCr + " par deux. Votre banque ne l'applique pas toujours d'elle-même.",
              CONSEIL_REDUCTION, "Voir mon crédit") });
          return;
        }
        var r = rt.reductions[0];
        if (!r) return;
        var d = new Date(maintenant.getFullYear(), maintenant.getMonth() + r.t, 1, 9, 0, 0);
        var avant = new Date(d.getFullYear(), d.getMonth() - 1, 1, 9, 0, 0), fin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        liste.push({ id: "reduction-" + i + "-" + d.getFullYear() + "-" + (d.getMonth() + 1), titre: "Réduction de taux le mois prochain : " + nomCr,
          corps: "En " + MOIS[d.getMonth()] + " " + d.getFullYear() + ", la règle des 8 % divise votre taux par deux (" + pc(r.tauxAvant) + " → " + pc(r.tauxPct) + "). Pensez à la demander à votre banque.",
          url: "/espace/#orbite", quand: iso(Math.max(avant.getTime(), t)), jusqua: iso(fin), type: "reduction",
          mail: mail(cr.libelle + " · le mois prochain", "Demandez la réduction de votre taux",
            "En " + MOIS[d.getMonth()] + " " + d.getFullYear() + ", la règle des 8 % divise le taux de votre " + nomCr + " par deux. Votre banque ne l'applique pas toujours d'elle-même.",
            CONSEIL_REDUCTION, "Voir mon crédit") });
      });
    }
    /* Versement mensuel d'épargne (Lot 2) : le jour choisi à 9 h, visible 5 jours ; le prochain seulement.
       Le montant (somme des contrats commencés) n'apparaît que dans Orbite, jamais dans l'email. */
    if (sy && sy.profil && sy.profil.jourVersement > 0) {
      var jv = sy.profil.jourVersement, dv = new Date(maintenant.getFullYear(), maintenant.getMonth(), jv, 9, 0, 0);
      if (dv.getTime() + 5 * JOUR <= t) dv = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, jv, 9, 0, 0);
      var mensuel = 0, mv = dv.getFullYear() * 12 + dv.getMonth();
      (sy.profil.contrats || []).forEach(function (c) { if (c.anneeDebut * 12 + c.moisDebut - 1 <= mv) mensuel += c.versementMensuel || 0; });
      liste.push({ id: "versement-" + dv.getFullYear() + "-" + (dv.getMonth() + 1), titre: "C'est le jour de votre versement d'épargne",
        corps: mensuel > 0 ? "Assurance vie et CEA : " + dt(mensuel) + " ce mois-ci, comme prévu. Un versement régulier fait travailler les intérêts plus longtemps."
          : "Votre versement d'épargne du mois, comme prévu. Un versement régulier fait travailler les intérêts plus longtemps.",
        url: "/espace/#epargne", quand: iso(Math.max(dv.getTime(), t)), jusqua: iso(dv.getTime() + 5 * JOUR), type: "versement",
        mail: mail("Épargne · " + MOIS[dv.getMonth()] + " " + dv.getFullYear(), "C'est le jour de votre versement d'épargne",
          "Vous avez choisi de verser votre épargne le " + (jv === 1 ? "1er" : jv) + " de chaque mois. Le montant prévu vous attend dans Orbite.",
          "Un virement permanent depuis votre banque vous évite d'y penser chaque mois.", "Voir mon épargne") });
    }
    /* Rappels programmés par l'utilisateur : le 1er du mois choisi à 9 h, visibles 45 jours. */
    if (sy && sy.profil) {
      (sy.profil.rappelsPerso || []).forEach(function (r) {
        var d = new Date(r.annee, r.mois - 1, 1, 9, 0, 0), fin = d.getTime() + 45 * JOUR;
        if (fin < t) return;
        liste.push({ id: "perso-" + r.id, titre: r.titre, corps: r.corps, url: r.url, quand: iso(Math.max(d.getTime(), t)), jusqua: iso(fin), type: "perso",
          mail: mail("Votre rappel · " + MOIS[r.mois - 1] + " " + r.annee, r.titre, r.corps, "", "Ouvrir Orbite") });
      });
    }
    /* Lots A et B (17 oct. 2026) : échéance d'un placement à taux connu (7 jours avant), d'une assurance (30 jours avant,
       pour comparer), remboursement attendu ou dû entre proches (le jour même). Ni montant ni prénom dans l'email. */
    if (sy && sy.profil) {
      var pr = sy.profil;
      ((pr.placements && pr.placements.taux) || []).forEach(function (x) {
        if (!x.fin) return;
        var df = jourA(x.fin, 9), dp = df - 7 * JOUR;
        if (df + 3 * JOUR < t) return;
        liste.push({ id: "placement-" + x.id + "-" + x.fin, titre: "Un placement arrive à échéance le " + libJour(x.fin),
          corps: "Renouveler, placer ailleurs ou rembourser un crédit ? Orbite compare les choix avec vos chiffres.", url: "/espace/#placements?onglet=depots",
          quand: iso(Math.max(dp, t)), jusqua: iso(df + 3 * JOUR), type: "placement",
          mail: mail("Placement · " + libJour(x.fin), "Un placement arrive à échéance le " + libJour(x.fin),
            "Un de vos placements à taux connu se termine bientôt. Orbite compare ce qu'il rapporterait renouvelé avec ce que vous économiseriez en remboursant un crédit.",
            "Sans instruction de votre part, la banque le renouvelle souvent au taux du moment : décidez avant la date.", "Voir mes dépôts") });
      });
      (pr.assurances || []).forEach(function (x) {
        if (!x.echeance || x.paie) return;
        var d = prochainAnniversaire(x.echeance, maintenant), de = jourA(d, 9), dp = de - 30 * JOUR;
        liste.push({ id: "assurance-" + x.id + "-" + d, titre: "Votre assurance " + nomAssurance(x) + " se renouvelle le " + libJour(d),
          corps: "Le bon moment pour demander d'autres devis et comparer à garanties égales.", url: "/espace/#placements?onglet=assurances",
          quand: iso(Math.max(dp, t)), jusqua: iso(de), type: "assurance",
          mail: mail("Assurance · " + libJour(d), "Une assurance se renouvelle le " + libJour(d),
            "Un de vos contrats arrive à échéance dans un mois. Le détail vous attend dans Orbite.",
            "Demandez deux ou trois devis à garanties égales avant la date : un contrat non résilié se renouvelle pour un an.", "Voir mes assurances") });
      });
      /* Obligations de l'année (28 oct. 2026) : vignette 15 jours avant la date limite (et en retard), fêtes suivies 7 jours
         avant. L'assurance auto a déjà son rappel ci-dessus. Aucun montant dans l'email. */
      ((sy.obligations && sy.obligations.lignes) || []).forEach(function (x) {
        if (x.type === "assurance" || x.etat === "paye") return;
        var de = jourA(x.date, 9), avance = x.type === "vignette" ? 15 : 7, dp = de - avance * JOUR;
        if (x.type === "vignette") {
          var retard = x.etat === "retard";
          liste.push({ id: "vignette-" + x.id + "-" + x.date, titre: retard ? "Vignette en retard : " + x.libelle.replace(/^Vignette : /, "") : "Vignette à payer avant le " + libJour(x.date),
            corps: "En ligne sur taxe-circulation.finances.gov.tn, puis cochez « payée » dans Orbite.", url: "/espace/#mois?onglet=obligations",
            quand: iso(retard ? t : Math.max(dp, t)), jusqua: iso(retard ? t + 30 * JOUR : de), type: "obligation",
            mail: mail("Vignette · " + libJour(x.date), retard ? "La date limite de la vignette est passée" : "La vignette est à payer avant le " + libJour(x.date),
              "La taxe de circulation de votre voiture se paie en ligne, sans autocollant depuis 2026. Le montant vous attend dans Orbite.",
              "Gardez le reçu avec son code QR : il sert de preuve en cas de contrôle.", "Voir mes obligations") });
          return;
        }
        liste.push({ id: "fete-" + (x.sousType || x.cle) + "-" + x.date, titre: x.libelle + " le " + libJour(x.date) + (x.sousType === "rentree" ? "" : " (à un jour près)"),
          corps: "Vérifiez que le budget prévu est bien de côté.", url: "/espace/#mois?onglet=obligations",
          quand: iso(Math.max(dp, t)), jusqua: iso(de), type: "obligation",
          mail: mail(x.libelle + " · " + libJour(x.date), x.libelle + " approche", "Vous suivez cette date dans Orbite : le budget que vous avez prévu vous y attend.", "", "Voir mes obligations") });
      });
      (pr.proches || []).forEach(function (x) {
        var recu = (x.recus || []).reduce(function (s, r) { return s + r.v; }, 0), reste = x.montant - recu, d = null;
        if (!(reste > 0.0005)) return;
        if (x.mensualite > 0 && x.debut) d = plusMoisJour(x.debut, Math.floor(recu / x.mensualite + 1e-9));
        else if (x.echeance) d = x.echeance;
        if (!d) return;
        var dj = jourA(d, 9);
        if (dj + 5 * JOUR < t) return;
        var prete = x.sens !== "emprunte";
        liste.push({ id: "proche-" + x.id + "-" + d, titre: prete ? "Remboursement attendu de " + x.nom : "Remboursement prévu à " + x.nom,
          corps: prete ? "Prévu le " + libJour(d) + ". Notez-le dans Orbite quand vous l'avez reçu." : "Prévu le " + libJour(d) + ". Notez-le dans Orbite une fois rendu.",
          url: "/espace/#placements?onglet=proches", quand: iso(Math.max(dj, t)), jusqua: iso(dj + 5 * JOUR), type: "proche",
          mail: mail("Entre proches · " + libJour(d), prete ? "Un remboursement est attendu aujourd'hui" : "Un remboursement est prévu aujourd'hui",
            "Vous avez noté dans Orbite un remboursement entre proches pour aujourd'hui. Le détail vous attend dans Orbite ; personne d'autre n'a reçu ce message.",
            "", "Ouvrir Orbite") });
      });
    }
    if (fiscal && fiscal.statut === "a_optimiser" && fiscal.gainPossible > 20) {
      var an = maintenant.getFullYear();
      [[1, 31], [15, 17]].forEach(function (x) {
        var d2 = new Date(an, 11, x[0], 9, 0, 0), fin2 = new Date(an, 11, 31, 23, 59, 59);
        if (fin2.getTime() <= t) return;
        liste.push({ id: "fiscal-" + an + "-12-" + x[0], titre: "Plus que " + x[1] + " jours pour réduire votre impôt " + an,
          corps: "Jusqu'à " + dt(fiscal.gainPossible) + " d'économie avec l'assurance vie et le CEA. Versez avant le 31 décembre.",
          url: "/espace/#vie?onglet=fiscal", quand: iso(Math.max(d2.getTime(), t)), jusqua: iso(fin2), type: "fiscal",
          mail: mail("Impôt " + an + " · plus que " + x[1] + " jours", "Réduisez votre impôt avant le 31 décembre",
            "Une économie d'impôt est possible avec l'assurance vie et le CEA. Le montant exact vous attend dans Orbite. Le versement doit être fait avant la fin de l'année.",
            "Un seul versement en décembre compte autant que douze petits versements. Demandez l'attestation fiscale à votre assureur.", "Voir mon économie") });
      });
    }
    return liste.sort(function (x, y) { return Date.parse(x.quand) - Date.parse(y.quand); });
  }

  /* Rappels à afficher maintenant (échus, non expirés, pas encore vus). */
  function aAfficher(liste, vus, m) {
    var t = (m || new Date()).getTime(), deja = vus || {};
    return (liste || []).filter(function (x) { return !deja[x.id] && Date.parse(x.quand) <= t && (!x.jusqua || Date.parse(x.jusqua) >= t); });
  }

  /* Plan des emails : ce que la fonction serveur « rappels-email » enverra, jour par jour (textes sans montant). */
  function planEmail(liste) {
    return (liste || []).filter(function (x) { return x.mail; }).slice(0, 40).map(function (x) {
      return { id: x.id, type: x.type, quand: x.quand, jusqua: x.jusqua || null, url: x.url, etiquette: x.mail.etiquette, titre: x.mail.titre,
        corps: x.mail.corps, conseil: x.mail.conseil, bouton: x.mail.bouton };
    });
  }

  return { rappels: rappels, aAfficher: aAfficher, planEmail: planEmail };
});
