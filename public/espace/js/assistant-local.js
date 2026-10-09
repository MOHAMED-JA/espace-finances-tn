/*
 * Orbite — Assistant intégré (pur, sans réseau, testé sous Node).
 *   repondre(question, sy, options) → { texte, lien? }
 * Répond sur l'appareil, à partir de la synthèse du profil (OrbiteCalcul) et de l'intelligence financière
 * (OrbiteIntelligence) : crédit (auto, immobilier, consommation, à une date donnée), impôt, épargne, salaire,
 * budget, score de santé, événements de vie. Comprend le français et la darija (réponse dans la même langue).
 * Sert quand l'IA en ligne n'est pas disponible (pas de clé, hors connexion) : aucune donnée ne quitte l'appareil.
 * Le texte suit la mise en forme de l'Assistant : paragraphes, listes « - », gras « **…** ».
 */
(function (racine, fabrique) {
  if (typeof module === "object" && module.exports) module.exports = fabrique(require("./orbite-intelligence.js"));
  else racine.AssistantLocal = fabrique(racine.OrbiteIntelligence);
})(typeof self !== "undefined" ? self : this, function (OI) {
  "use strict";

  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function dt(v) { return Math.round(v).toLocaleString("fr-FR") + " DT"; }
  function nb(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }
  function pc(v) { return nb(v * 100) + " %"; }
  function ans(mois) { var a = mois / 12; return a === Math.round(a) ? nb(a) + " ans" : mois + " mois"; }

  /* Mots reconnus (sans accents, en minuscules). */
  var DARIJA = /\b(najjem|nnajjem|tnajjem|nechri|nachri|nchri|nheb|n7eb|chnowa|chnoua|chniya|kifech|kifach|qaddech|9addech|kadech|qadech|karhba|flous|ena|3la|mte3i|mta3i|bech|wa9tech|waqtech|waktech|famma|ya3tini|ta3tini|nkammel|ykammel|yekmel|nekmel|etnajjem|ba3d|tawa|barcha|chahriya|khlas|nab9a|dhriba|9ardh|9rodh|kridi|snin|3am)\b/;
  var INTENTIONS = [
    ["vie", /\b(mariage|marie|nesta?rawej|3ers|enfant|bebe|naissance|mutation|demenag|augmentation)/],
    ["auto", /\b(voiture|karhba|auto|vehicule|sayara|tomobil)\b/],
    ["immo", /\b(maison|appart|appartement|immobilier|logement|dar|terrain|villa|studio|construire|batir|immo|foncier)\b/],
    ["conso", /\b(conso|consommation|pret personnel|travaux|meubles|equipement)\b/],
    ["impot", /\b(impot|impots|irpp|fiscal|fiscale|dhriba|taxe|deduction|deduire)\b/],
    ["epargne", /\b(epargne|epargner|assurance vie|cea|placement|placer|economiser|tawfir|nwaffer|investir)\b/],
    ["score", /\b(score|sante|note)\b/],
    ["budget", /\b(budget|reste a vivre|depenses|fin de mois|charges)\b/],
    ["endettement", /\b(endettement|endette)\b/],
    ["salaire", /\b(salaire|net|brut|chahriya|khlas|paie|cnss|cnrps|prime|primes)\b/],
    ["credit", /\b(credit|credits|emprunt|emprunter|pret|preter|banque|capacite|9ardh|9rodh|kridi)\b/]
  ];

  function normaliser(q) { return String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " "); }
  /* Le premier bien cité l'emporte (« dar ba3d ma nkammel crédit el karhba » parle de la maison). */
  function intention(qn) {
    var biens = INTENTIONS.filter(function (x) { return ["auto", "immo", "conso"].indexOf(x[0]) !== -1; })
      .map(function (x) { var m = qn.match(x[1]); return m ? [x[0], m.index] : null; }).filter(Boolean).sort(function (a, b) { return a[1] - b[1]; });
    for (var i = 0; i < INTENTIONS.length; i++) if (INTENTIONS[i][1].test(qn)) return ["auto", "immo", "conso"].indexOf(INTENTIONS[i][0]) !== -1 ? biens[0][0] : INTENTIONS[i][0];
    return null;
  }

  /* Mois d'une étape du calendrier (compté depuis la date de la synthèse). */
  function dateEtape(sy, mois) { var m = sy.maintenant || new Date(); return new Date(m.getFullYear(), m.getMonth() + mois, 1); }

  /* Ce que la banque peut prêter à une année donnée (aujourd'hui si l'année est passée ou absente). */
  function capaciteEn(sy, annee, etape) {
    var p = sy.profil, cap = sy.capacite[p.baseBanque], q = p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet;
    var actuel = { mensualite: cap.mensualiteMax, date: null, credits: [], base: p.baseBanque, quotite: q,
      offres: cap.credits.filter(function (c) { return ["immo", "auto", "conso"].indexOf(c.cle) !== -1; })
        .map(function (c) { return { cle: c.cle, libelle: c.court, capital: c.capital, dureeMois: c.dureeMois, tauxPct: c.tauxPct }; }) };
    var etapes = (cap.paliers || []).filter(function (x) { return !annee || dateEtape(sy, x.mois).getFullYear() <= annee; });
    var x = etape || (annee ? etapes[etapes.length - 1] : null);
    if (!x) return actuel;
    return { mensualite: x.mensualiteMax, date: x.date, credits: x.credits, base: p.baseBanque, quotite: q, offres: x.offres };
  }
  function offre(c, cle) { return c.offres.filter(function (o) { return o.cle === cle; })[0]; }
  function finDe(credits, D) {
    var l = credits.map(function (c) { return c.toLowerCase(); });
    var t = l.length > 1 ? l.slice(0, -1).join(", ") + (D ? " w " : " et ") + l[l.length - 1] : l[0];
    return D ? "ki yekmel " + t : "à la fin de " + (l.length > 1 ? "vos " : "votre ") + t;
  }
  /* « après la fin de mon crédit auto » : l'étape du calendrier où ce crédit se termine. */
  function etapeApres(sy, qn, cible) {
    if (!/\b(ba3d|apres|fin|kammel|nkammel|ykammel|yekmel|nekmel|termine)\b/.test(qn)) return null;
    var p = sy.profil, pal = sy.capacite[p.baseBanque].paliers || [];
    var types = INTENTIONS.filter(function (x) { return ["auto", "immo", "conso"].indexOf(x[0]) !== -1 && x[0] !== cible && x[1].test(qn); }).map(function (x) { return x[0]; });
    var cr = p.credits.filter(function (c) { return types.indexOf(c.type) !== -1 || (/mariage|3ers/.test(qn) && /mariage/i.test(c.libelle)); })[0];
    if (!cr) return null;
    return pal.filter(function (x) { return x.credits.indexOf(cr.libelle) !== -1; })[0] || null;
  }
  function meilleurMoment(sy) { var pal = sy.capacite[sy.profil.baseBanque].paliers || []; return pal[pal.length - 1] || null; }

  /* ---------- réponses ---------- */
  function repCredit(sy, cle, annee, D, etape) {
    var c = capaciteEn(sy, annee, etape), o = cle ? offre(c, cle) : null, p = sy.profil, L = [];
    var nom = { auto: D ? "karhba" : "une voiture", immo: D ? "dar wala appartement" : "un logement", conso: D ? "crédit conso" : "un crédit à la consommation" }[cle];
    var quand = annee ? (D ? "fi " + annee : "en " + annee) : (D ? "tawa" : "aujourd'hui");
    if (c.mensualite < 1) {
      var cap = sy.capacite[p.baseBanque];
      L.push(D ? "Mazelt, " + quand + " el banque ma tnajjemch ta3tik crédit jdid : el endettement mte3ek wosel " + pc(cap.tauxEndettementActuel) + " (el limite " + pc(c.quotite) + ")."
        : "Pas encore " + quand + " : votre endettement atteint déjà " + pc(cap.tauxEndettementActuel) + ", alors que la banque s'arrête à " + pc(c.quotite) + " de votre " + c.base + ".");
      var m = meilleurMoment(sy);
      if (m) L.push(D ? "Men **" + m.date + "**, " + finDe(m.credits, true) + ", tnajjem t5allas **" + dt(m.mensualiteMax) + "** fil chhar." : "À partir de **" + m.date + "**, " + finDe(m.credits, false) + ", vous pourrez rembourser jusqu'à **" + dt(m.mensualiteMax) + "** par mois.");
      return { texte: L.join("\n"), lien: { libelle: "Voir le calendrier de la marge", href: "#orbite" } };
    }
    if (o) {
      L.push(D ? "Ey, etnajjem ! " + (c.date ? "Men **" + c.date + "**, " + finDe(c.credits, true) + " :" : "**" + quand.charAt(0).toUpperCase() + quand.slice(1) + "**, el banque ta3tik :")
        : "Oui" + (c.date ? ", à partir de **" + c.date + "**, " + finDe(c.credits, false) : ", " + quand) + ", la banque peut financer " + nom + " :");
      L.push((D ? "- mensualité possible : **" : "- mensualité possible : **") + dt(c.mensualite) + "** par mois");
      L.push((D ? "- " + (cle === "auto" ? "karhba" : o.libelle.toLowerCase()) + " jusqu'à **" : "- " + o.libelle.toLowerCase() + " : jusqu'à **") + dt(o.capital) + "** " + (D ? "3la " + (o.dureeMois / 12 === Math.round(o.dureeMois / 12) ? nb(o.dureeMois / 12) + " snin" : o.dureeMois + " chhar") : "sur " + ans(o.dureeMois)) + " à " + nb(o.tauxPct) + " %");
      L.push(D ? "- endettement taht " + pc(c.quotite) + " mel " + c.base : "- endettement : sous " + pc(c.quotite) + " de votre " + c.base);
      if (!annee || !c.date) {
        var m2 = meilleurMoment(sy), o2 = m2 ? m2.offres.filter(function (x) { return x.cle === cle; })[0] : null;
        if (o2 && o2.capital > o.capital * 1.05) L.push(D ? "Ken testanna **" + m2.date + "**, twalli tnajjem tousel **" + dt(o2.capital) + "**." : "Si vous attendez **" + m2.date + "**, ce plafond monte à **" + dt(o2.capital) + "**.");
      }
      if (p.epargneDisponible > 0) L.push(D ? "W 3andek " + dt(p.epargneDisponible) + " tawfir tnajjem t7otthom avance." : "Vous disposez aussi de " + dt(p.epargneDisponible) + " d'épargne pour l'apport.");
      return { texte: L.join("\n"), lien: { libelle: "Simuler ce crédit", href: "#credit?mensualite=" + Math.floor(c.mensualite) } };
    }
    /* Question générale sur le crédit : les trois plafonds, puis le calendrier. */
    L.push(D ? quand.charAt(0).toUpperCase() + quand.slice(1) + ", el banque ta3tik **" + dt(c.mensualite) + "** fil chhar, ya3ni wa7da men hethom :" : (c.date ? "À partir de **" + c.date + "**" : "Aujourd'hui") + ", vous pouvez rembourser **" + dt(c.mensualite) + "** par mois, soit l'un de ces crédits :");
    c.offres.forEach(function (x) { L.push("- " + x.libelle + " : **" + dt(x.capital) + "** " + (D ? "3la " : "sur ") + ans(x.dureeMois) + " à " + nb(x.tauxPct) + " %"); });
    var pal = sy.capacite[p.baseBanque].paliers || [];
    if (pal.length && !c.date) {
      L.push(D ? "W kol ma yekmel crédit, el marge tzid :" : "Et à chaque fin de crédit, la marge augmente :");
      pal.forEach(function (x) { L.push("- " + x.date + " : **" + dt(x.mensualiteMax) + "** " + (D ? "fil chhar" : "par mois")); });
    }
    return { texte: L.join("\n"), lien: { libelle: "Voir le détail", href: "#orbite" } };
  }

  function repImpot(sy, D) {
    var f = OI.optimiseurFiscal(sy, {}), s = sy.salaire;
    if (f.statut === "sans_impot") return { texte: D ? "Ma t5allasch impôt sur le revenu : ma famma chay bech tna9ses." : "Vous ne payez pas d'impôt sur le revenu : il n'y a rien à réduire." };
    var L = [D ? "T5allas **" + dt(s.irpp) + "** impôt fil 3am (tranche " + pc(s.tranche.taux) + ")." : "Vous payez **" + dt(s.irpp) + "** d'impôt sur le revenu par an (tranche à " + pc(s.tranche.taux) + ")."];
    if (f.statut === "optimise") L.push(D ? "Rak deja t5ammem mli7 : t9ammert l'avantage fiscal lkol (" + dt(f.economieActuelle) + " fil 3am)." : "Vous profitez déjà de tout l'avantage fiscal possible : " + dt(f.economieActuelle) + " économisés par an.");
    else {
      L.push(D ? "Bech t5allas a9al, 7ott 9bal 31 décembre (" + f.joursAvantFin + " nhar) :" : "Pour payer moins, versez avant le 31 décembre (encore " + f.joursAvantFin + " jours) :");
      if (f.complement.av) L.push("- " + (D ? "assurance vie : **" : "assurance vie : **") + dt(f.complement.av) + "**");
      if (f.complement.cea) L.push("- CEA : **" + dt(f.complement.cea) + "**");
      L.push(D ? "Ya3ni t9ammer **" + dt(f.gainPossible) + "** zeyda fil 3am (el max " + dt(f.economieMax) + ")." : "Gain supplémentaire : **" + dt(f.gainPossible) + "** par an (économie maximale " + dt(f.economieMax) + ").");
      if (f.parMoisRestant && f.moisRestants > 1) L.push(D ? "Wala " + dt(f.parMoisRestant) + " fil chhar 7atta lekher el 3am." : "Soit environ " + dt(f.parMoisRestant) + " par mois d'ici la fin de l'année.");
    }
    return { texte: L.join("\n"), lien: { libelle: "Ouvrir l'optimiseur fiscal", href: "#vie?onglet=fiscal" } };
  }

  function repEpargne(sy, D) {
    var p = sy.profil, L = [], net = sy.salaire.netMoyen;
    if (sy.contrats && sy.contrats.length) {
      L.push(D ? "3andek " + sy.contrats.length + " contrat(s) :" : "Vos contrats d'épargne :");
      sy.contrats.forEach(function (c, i) { var cc = p.contrats[i];
        L.push("- " + (c.type === "cea" ? "CEA" : "Assurance vie") + " : " + dt(cc.versementMensuel) + (D ? " fil chhar, capital " : " par mois, capital ") + (c.estime ? "≈ " : "") + "**" + dt(c.capital) + "**"); });
    } else L.push(D ? "Ma 3andek 7atta contrat assurance vie wala CEA." : "Vous n'avez pas encore de contrat d'assurance vie ni de CEA.");
    L.push(D ? "Tawfir disponible : **" + dt(p.epargneDisponible) + "** ; yab9alek **" + dt(sy.budget.reste) + "** fil chhar." : "Épargne disponible : **" + dt(p.epargneDisponible) + "** ; reste à vivre : **" + dt(sy.budget.reste) + "** par mois.");
    var cible = Math.max(10, Math.round(net * 0.1 / 10) * 10);
    if (sy.budget.reste > cible) L.push(D ? "Nasta7sen twaffer 10 % mel net : **" + dt(cible) + "** fil chhar." : "Bon rythme : épargner 10 % de votre net, soit **" + dt(cible) + "** par mois.");
    return { texte: L.join("\n"), lien: { libelle: "Ouvrir Épargne vie & CEA", href: "#epargne" } };
  }

  function repSalaire(sy, D) {
    var s = sy.salaire, p = sy.profil;
    return { texte: [
      D ? "Chahriytek :" : "Votre salaire :",
      "- net " + (D ? "fil chhar" : "par mois") + " : **" + dt(s.netMensuel) + "**",
      "- net moyen (" + p.nombreSalaires + (D ? " chahriya ÷ 12" : " salaires ÷ 12") + ") : **" + dt(s.netMoyen) + "**",
      "- brut " + (D ? "fil 3am" : "annuel") + " : " + dt(s.brutAnnuel),
      "- impôt : " + dt(s.irpp) + (D ? " fil 3am" : " par an") + " (tranche " + pc(s.tranche.taux) + ")"].join("\n"), lien: { libelle: "Ouvrir Salaire", href: "#salaire" } };
  }

  function repScore(sy, D) {
    var sc = OI.scoreSante(sy, {}), L = [D ? "Score mte3ek : **" + sc.score + "/100** (" + sc.niveau + ")." : "Votre score de santé financière : **" + sc.score + "/100** (" + sc.niveau + ")."];
    if (sc.objectifs.length) { L.push(D ? "Bech ytla3 :" : "Pour progresser :"); sc.objectifs.forEach(function (o) { L.push("- " + o.action); }); }
    return { texte: L.join("\n"), lien: { libelle: "Voir le détail du score", href: "#orbite" } };
  }

  function repBudget(sy, D) {
    var b = sy.budget, p = sy.profil, L = [];
    L.push(D ? "Kol chhar :" : "Chaque mois :");
    L.push("- " + (D ? "crédits : " : "crédits : ") + dt(sy.chargesCredits));
    L.push("- " + (D ? "kre + charges : " : "loyer et charges : ") + dt(p.loyer + p.chargesFixes));
    L.push("- " + (D ? "yab9alek : **" : "reste à vivre : **") + dt(b.reste) + "**");
    if (b.alerte === "deficit") L.push(D ? "Rod belek : el budget fih déficit." : "Attention : votre budget est déficitaire.");
    else if (b.alerte === "endettement") L.push(D ? "Rod belek : el endettement fout el limite mte3 el banque." : "Attention : votre endettement dépasse la limite de la banque.");
    return { texte: L.join("\n"), lien: { libelle: "Compléter mon profil", href: "#profil" } };
  }

  function repEndettement(sy, D) {
    var p = sy.profil, cap = sy.capacite[p.baseBanque], q = p.baseBanque === "brut" ? p.quotiteBrut : p.quotiteNet;
    return { texte: (D ? "El endettement mte3ek : **" + pc(cap.tauxEndettementActuel) + "** (el banque t9oss 3la " + pc(q) + " mel " + p.baseBanque + "). Tnajjem tzid **" : "Votre endettement : **" + pc(cap.tauxEndettementActuel) + "** (limite de la banque : " + pc(q) + " du " + p.baseBanque + "). Vous pouvez encore ajouter **") + dt(cap.mensualiteMax) + "**" + (D ? " fil chhar." : " de mensualité."), lien: { libelle: "Voir le calendrier de la marge", href: "#orbite" } };
  }

  function repVie(D) {
    return { texte: D ? "Jarreb fil **simulateur de vie** : zid 3ers, sghir, karhba wala dar, w tchouf el budget mte3ek 9bal w ba3d." : "Testez-le dans le **simulateur de vie** : ajoutez un mariage, une naissance, une voiture ou un logement et comparez votre budget avant et après.", lien: { libelle: "Ouvrir le simulateur de vie", href: "#vie" } };
  }

  function repDefaut(sy, D) {
    var p = sy.profil, cap = sy.capacite[p.baseBanque];
    return { texte: [
      D ? "Hedha el essentiel :" : "Voici l'essentiel :",
      "- net " + (D ? "fil chhar" : "par mois") + " : **" + dt(sy.salaire.netMensuel) + "**",
      "- " + (D ? "crédit jdid possible : **" : "nouvelle mensualité possible : **") + dt(cap.mensualiteMax) + "**",
      "- " + (D ? "yab9alek : " : "reste à vivre : ") + dt(sy.budget.reste),
      D ? "Is2alni 3al karhba, dar, impôt, tawfir wala score." : "Demandez-moi par exemple : une voiture en 2027, un appartement, payer moins d'impôt, mon épargne ou mon score."].join("\n") };
  }

  function repondre(question, sy) {
    var qn = normaliser(question), D = DARIJA.test(qn);
    if (!sy) return { texte: D ? "Kammel el profil mte3ek lowel (chahriya, crédits) bech nnajjem njewbek." : "Complétez d'abord votre profil (salaire, crédits) pour que je puisse vous répondre.", lien: { libelle: "Compléter mon profil", href: "#profil" } };
    var an = (qn.match(/\b(20[2-7]\d)\b/) || [])[1], annee = an ? Number(an) : null;
    if (!annee && /\b(ba3d ma|apres|quand|wa9tech|waqtech|waktech|meilleur moment)\b/.test(qn)) { var mm = meilleurMoment(sy); if (mm) annee = dateEtape(sy, mm.mois).getFullYear(); }
    var it = intention(qn);
    if (it === "vie" && /\b(voiture|karhba|appart|maison|dar|immobilier)\b/.test(qn)) it = intention(qn.replace(INTENTIONS[0][1], " "));
    switch (it) {
      case "auto": case "immo": case "conso": return repCredit(sy, it, annee, D, etapeApres(sy, qn, it));
      case "credit": return repCredit(sy, null, annee, D);
      case "impot": return repImpot(sy, D);
      case "epargne": return repEpargne(sy, D);
      case "salaire": return repSalaire(sy, D);
      case "score": return repScore(sy, D);
      case "budget": return repBudget(sy, D);
      case "endettement": return repEndettement(sy, D);
      case "vie": return repVie(D);
      default: return repDefaut(sy, D);
    }
  }

  return { repondre: repondre, capaciteEn: capaciteEn, langueDarija: function (q) { return DARIJA.test(normaliser(q)); }, MOIS: MOIS };
});
