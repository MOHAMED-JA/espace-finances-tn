/*
 * Orbite — « Le fil de votre mois » en tête de l'accueil (téléphone, modèle D choisi le 22 oct. 2026).
 * Anneau : part du budget du mois déjà dépensée ; reste à vivre et montant par jour jusqu'à la paie ;
 * les 3 prochaines dates du calendrier de l'argent. Mêmes calculs que Mon mois (OrbiteBudget.etatDuMois, .prochains).
 * Masqué tant que le revenu du mois n'est pas connu. Le CSS le cache sur ordinateur et tablette.
 */
(function () {
  "use strict";
  var O = window.Orbite, doc = document;
  if (!O) return;
  var F = O.F, $ = O.$;
  var MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var carte = $("fil-mois");
  if (!carte) return;

  function dt(v) { return F.dt0(v) + " DT"; }
  function cree(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function libDate(e) {
    if (e.aujourdhui) return "Aujourd'hui";
    var p = e.date.split("-"), j = Number(p[2]);
    return (j === 1 ? "1er" : String(j)) + " " + MOIS[Number(p[1]) - 1];
  }

  function rendre() {
    var B = window.OrbiteBudget, st = B && B.etatDuMois ? B.etatDuMois() : null;
    if (!st || !(st.net > 0)) { carte.hidden = true; return; }
    carte.hidden = false;

    var part = st.totalPrevu > 0 ? Math.max(0, Math.min(1, st.totalDepense / st.totalPrevu)) : 0;
    var pct = Math.round(part * 100), depasse = st.resteAVivre < 0 || st.depassements.length > 0;
    carte.classList.toggle("fil-mois--depasse", depasse);
    $("fil-pct").textContent = pct + " %";
    /* L'arc se dessine depuis zéro à chaque affichage de l'accueil (transition CSS). */
    var arc = $("fil-arc");
    arc.style.strokeDashoffset = "100";
    requestAnimationFrame(function () { requestAnimationFrame(function () { arc.style.strokeDashoffset = String(100 - pct); }); });

    $("fil-reste").textContent = (st.resteAVivre < 0 ? "−" : "") + dt(Math.abs(st.resteAVivre));
    var etat = st.resteAVivre < 0 ? "Dépassement de " + dt(-st.resteAVivre) + " ce mois-ci"
      : st.depassements.length ? (st.depassements.length === 1 ? "1 enveloppe dépassée" : st.depassements.length + " enveloppes dépassées")
      : "Soit " + dt(st.parJour) + " par jour pendant " + st.jours + (st.jours > 1 ? " jours" : " jour");
    $("fil-etat").textContent = etat;
    $("fil-budget").setAttribute("aria-label", "Budget du mois : " + pct + " % dépensé, reste à vivre " + $("fil-reste").textContent + ". " + etat + ". Ouvrir Mon mois");

    var liste = $("fil-liste"), dates = B.prochains ? B.prochains(3) : [];
    liste.textContent = "";
    if (!dates.length) {
      liste.appendChild(cree("li", "fil-mois__vide", "Aucune date à venir : ajoutez vos crédits et vos contrats dans Mon profil."));
      return;
    }
    dates.forEach(function (e, i) {
      var li = cree("li", "fil-mois__date" + (e.sens === "entree" ? " fil-mois__date--entree" : "") + (e.aujourdhui ? " fil-mois__date--jour" : ""));
      li.style.setProperty("--i", i);
      var quand = cree("span", "fil-mois__quand");
      quand.appendChild(cree("span", "fil-mois__jour", libDate(e)));
      quand.appendChild(cree("span", "fil-mois__libelle", e.libelle));
      li.appendChild(quand);
      if (e.montant != null) li.appendChild(cree("span", "fil-mois__montant", (e.sens === "entree" ? "+" : "−") + dt(e.montant)));
      liste.appendChild(li);
    });
  }

  O.surProfil(function () { if (!$("vue-orbite").hidden) rendre(); });
  doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "orbite") rendre(); });
  rendre();
})();
