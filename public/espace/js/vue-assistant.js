/*
 * Orbite — Assistant (route #assistant) : conversation en français ou en darija, à partir du profil.
 * Le résumé chiffré du profil est calculé sur l'appareil (OrbiteIntelligence.resumeAssistant, sans nom ni e-mail),
 * envoyé avec la question à la fonction serveur « assistant ». La conversation reste en mémoire de la page.
 * Sans IA en ligne (clé non configurée, serveur indisponible, hors connexion), l'Assistant intégré (AssistantLocal)
 * répond sur l'appareil à partir des mêmes calculs : aucune donnée ne quitte alors l'appareil.
 * Les réponses sont affichées sans HTML : seuls les paragraphes, les listes « - » et le gras « **…** » sont mis en forme.
 */
(function () {
  "use strict";
  var O = window.Orbite, E = window.Espace, OI = window.OrbiteIntelligence, AL = window.AssistantLocal, $ = O.$, doc = document;
  var historique = [], enCours = false, compte = false, local = false;
  var NOTE_LOCALE = "Réponses calculées sur votre appareil à partir de votre profil : rien n'est envoyé. Indicatives, à confirmer avec votre banque.";
  var fil = $("assistant-fil"), champ = $("assistant-question"), bouton = $("assistant-envoyer");

  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* Mise en forme minimale et sûre : texte → paragraphes, listes, gras (aucune balise interprétée). */
  function enLigne(parent, texte) {
    texte.split(/(\*\*[^*]+\*\*)/).forEach(function (morceau) {
      if (/^\*\*[^*]+\*\*$/.test(morceau)) parent.appendChild(cree("strong", null, morceau.slice(2, -2)));
      else if (morceau) parent.appendChild(doc.createTextNode(morceau));
    });
  }
  function formater(conteneur, texte) {
    var liste = null;
    texte.replace(/\r/g, "").split("\n").forEach(function (ligne) {
      var l = ligne.trim();
      if (!l) { liste = null; return; }
      var puce = l.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
      if (puce) {
        if (!liste) { liste = cree("ul"); conteneur.appendChild(liste); }
        var li = cree("li"); enLigne(li, puce[1]); liste.appendChild(li);
      } else {
        liste = null;
        var p = cree("p"); enLigne(p, l.replace(/^#+\s*/, "")); conteneur.appendChild(p);
      }
    });
  }
  function ajouter(role, texte, opts) {
    var o = opts || {}, li = cree("li", "assistant__msg assistant__msg--" + (role === "user" ? "moi" : "ia") + (o.erreur ? " assistant__msg--erreur" : ""));
    if (role === "user") li.appendChild(cree("p", null, texte)); else formater(li, texte);
    if (o.lien) { var a = cree("a", "lien-action", o.lien.libelle); a.href = o.lien.href; li.appendChild(a); }
    fil.appendChild(li);
    li.scrollIntoView({ behavior: O.mouvementReduit.matches ? "auto" : "smooth", block: "end" });
    return li;
  }

  function contexte() {
    var sy = O.synthese();
    if (!sy || !OI || O.profilVierge()) return "";
    try { return OI.resumeAssistant(sy); } catch (e) { return ""; }
  }

  /* Réponse de l'Assistant intégré, avec un court délai pour garder le rythme d'une conversation. */
  function repondreLocal(q, attente) {
    var sy = O.profilVierge() ? null : O.synthese(), r;
    try { r = AL.repondre(q, sy); } catch (e) { r = { texte: "Je n'ai pas réussi à calculer la réponse. Vérifiez votre profil puis réessayez." }; }
    $("assistant-note").textContent = NOTE_LOCALE;
    return new Promise(function (ok) { setTimeout(ok, O.mouvementReduit.matches ? 0 : 450); }).then(function () {
      if (attente) attente.remove();
      ajouter("ia", r.texte, { lien: r.lien });
      historique.push({ role: "user", contenu: q }, { role: "assistant", contenu: r.texte });
    });
  }

  function envoyer(question) {
    var q = (question || "").trim();
    if (q.length < 2 || enCours) return;
    enCours = true; bouton.disabled = true; champ.value = "";
    $("assistant-suggestions").hidden = true;
    ajouter("user", q);
    if (local || !navigator.onLine || !E.assistant) {
      if (!compte) { compte = true; E.compterUsage("simulation", "assistant"); }
      var att0 = ajouter("ia", "…"); att0.classList.add("assistant__msg--attente");
      repondreLocal(q, att0).finally(function () { enCours = false; bouton.disabled = false; champ.focus(); });
      return;
    }
    var attente = ajouter("ia", "…");
    attente.classList.add("assistant__msg--attente");
    attente.setAttribute("aria-label", "L'Assistant réfléchit");
    if (!compte) { compte = true; E.compterUsage("simulation", "assistant"); }
    E.assistant.demander(q, historique.slice(-8), contexte()).then(function (r) {
      attente.remove();
      ajouter("ia", r.reponse);
      historique.push({ role: "user", contenu: q }, { role: "assistant", contenu: r.reponse });
      if (typeof r.restantes === "number" && r.restantes <= 5) $("assistant-note").textContent = "Encore " + r.restantes + " question" + (r.restantes > 1 ? "s" : "") + " aujourd'hui. Réponses indicatives, à confirmer avec votre banque.";
    }).catch(function (x) {
      /* IA en ligne pas encore configurée ou injoignable : l'Assistant intégré prend le relais. */
      if (AL && (!x || x.code === "bientot" || !x.code && !x.statut || x.statut >= 500)) {
        if (!x || x.code === "bientot") local = true;
        return repondreLocal(q, attente);
      }
      attente.remove();
      var lien = x && x.code === "abonnement" ? { libelle: "Voir les formules", href: "#abonnement" } : null;
      ajouter("ia", (x && x.message) || "L'Assistant ne répond pas pour le moment.", { erreur: true, lien: lien });
    }).finally(function () { enCours = false; bouton.disabled = false; champ.focus(); });
  }

  $("assistant-form").addEventListener("submit", function (e) { e.preventDefault(); envoyer(champ.value); });
  /* Entrée envoie, Maj + Entrée passe à la ligne. */
  champ.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); envoyer(champ.value); } });
  $("assistant-suggestions").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) envoyer(b.textContent); });
  doc.addEventListener("orbite:vue", function (e) {
    if (e.detail.vue !== "assistant") return;
    var q = e.detail.params.get("q");
    if (q) { history.replaceState(null, "", "#assistant"); envoyer(q.slice(0, 1500)); }
    else setTimeout(function () { champ.focus({ preventScroll: true }); }, 50);
  });
})();
