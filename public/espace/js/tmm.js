/*
 * Orbite — suivi du TMM (point 5, choix validés le 12 oct. 2026 : saisi chaque mois par l'administrateur,
 * historique de 24 mois). Le dernier TMM saisi s'applique à tout Orbite : OrbiteCalcul.definirTMM et MoteurCredit.DEFAUTS.tmm.
 *  - Au chargement : la dernière valeur connue (localStorage « orbite-tmm ») s'applique tout de suite, avant les calculs.
 *  - Après la connexion : l'historique est relu (Supabase, tmm_historique) ; un nouveau TMM recalcule tout et s'annonce une fois.
 *  - Administration : saisir ou corriger le TMM d'un mois, retirer une saisie.
 *  - Crédit › « Le TMM » : la courbe (24 mois), la variation du mois et son effet sur les crédits à taux variable du profil.
 */
(function () {
  "use strict";
  var OC = window.OrbiteCalcul, MC = window.MoteurCredit, doc = document, CLE = "orbite-tmm", VU = "orbite-tmm-vu";
  function appliquer(t) {
    if (!OC || !OC.definirTMM(t)) return false;
    if (MC && MC.DEFAUTS) MC.DEFAUTS.tmm = OC.TMM;
    return true;
  }
  var DEFAUT = OC ? OC.TMM : 7.5; /* valeur du code, si aucun TMM n'est saisi */
  /* 1. Tout de suite : la dernière valeur connue sur cet appareil. */
  try { var memo = JSON.parse(localStorage.getItem(CLE) || "null"); if (memo && memo.taux) appliquer(memo.taux); } catch (e) {}

  var historique = [], charge = false;
  function noter(d) { try { localStorage.setItem(CLE, JSON.stringify(d)); } catch (e) {} }

  function demarrer() {
    var O = window.Orbite, E = window.Espace, P = window.CreditProjets;
    if (!O || !E || !E.tmm || !P) return;
    var $ = O.$, F = O.F;
    var N2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }), MOISL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
    function pc(v) { return N2.format(v).replace(/[  ]/g, " ") + " %"; }
    function nomMois(m) { var d = new Date(m + "T12:00:00"); return MOISL.format(d); }
    function signe(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + N2.format(Math.abs(v)).replace(/[  ]/g, " "); }

    function charger(premier) {
      return E.tmm.historique(24).then(function (l) {
        historique = l || []; charge = true;
        var s = P.serieTMM(historique);
        if (s.dernier) {
          var avant = OC.TMM;
          appliquer(s.dernier.taux);
          noter({ mois: s.dernier.mois, taux: s.dernier.taux });
          if (Math.abs(avant - OC.TMM) > 1e-9 && O.recalculer) O.recalculer();
          if (premier === true) annoncer(s); else try { localStorage.setItem(VU, s.dernier.mois); } catch (e) {}
        } else if (Math.abs(OC.TMM - DEFAUT) > 1e-9) {
          /* Plus aucune saisie : retour à la valeur par défaut. */
          appliquer(DEFAUT);
          try { localStorage.removeItem(CLE); } catch (e) {}
          if (O.recalculer) O.recalculer();
        }
        doc.dispatchEvent(new CustomEvent("orbite:tmm", { detail: s }));
        return s;
      }).catch(function () { charge = true; return P.serieTMM([]); });
    }
    /* Un nouveau TMM s'annonce une fois par appareil (pas au tout premier chargement). */
    function annoncer(s) {
      var vu = null; try { vu = localStorage.getItem(VU); } catch (e) {}
      try { localStorage.setItem(VU, s.dernier.mois); } catch (e) {}
      if (!vu || vu >= s.dernier.mois || !s.precedent) return;
      var eff = P.effetTMM({ delta: s.variation, tmm: s.dernier.taux, credits: (O.profil() || {}).credits || [] });
      O.toast("Nouveau TMM : " + pc(s.dernier.taux) + " (" + signe(s.variation) + " point" + (Math.abs(s.variation) >= 2 ? "s" : "") + ").",
        { type: "info", detail: eff.exemple ? "Orbite est à jour : capacité, crédit, Et si… Détail dans Crédit › Le TMM." : "Vos crédits à taux variable : " + signe(eff.ecartTotal) + " DT par mois. Détail dans Crédit › Le TMM." });
    }

    /* ---------- Crédit › « Le TMM » ---------- */
    function courbe(s) {
      var NS = "http://www.w3.org/2000/svg", W = 640, H = 220, g = 36, d = 14, h = 18, b = 30;
      var svg = doc.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "tmm-courbe"); svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "TMM sur " + s.serie.length + " mois, de " + pc(s.serie[0].taux) + " à " + pc(s.dernier.taux));
      var min = Math.min(s.min, s.max - 0.25), max = Math.max(s.max, s.min + 0.25), pad = (max - min) * 0.15; min -= pad; max += pad;
      var n = s.serie.length, X = function (i) { return n === 1 ? (g + W - d) / 2 : g + i * (W - g - d) / (n - 1); }, Y = function (t) { return h + (max - t) / (max - min) * (H - h - b); };
      function el(nom, at, txt) { var e = doc.createElementNS(NS, nom); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; }
      [max - pad, (max + min) / 2, min + pad].forEach(function (t) {
        el("line", { x1: g, x2: W - d, y1: Y(t), y2: Y(t), class: "tmm-courbe__grille" });
        el("text", { x: g - 6, y: Y(t) + 4, "text-anchor": "end", class: "tmm-courbe__axe" }, N2.format(Math.round(t * 100) / 100));
      });
      var pts = s.serie.map(function (p, i) { return X(i).toFixed(1) + "," + Y(p.taux).toFixed(1); });
      if (n > 1) el("polyline", { points: pts.join(" "), class: "tmm-courbe__ligne" });
      s.serie.forEach(function (p, i) { var c = el("circle", { cx: X(i), cy: Y(p.taux), r: i === n - 1 ? 5 : 3, class: i === n - 1 ? "tmm-courbe__dernier" : "tmm-courbe__point" }); el("title", {}, nomMois(p.mois) + " : " + pc(p.taux)); c.appendChild(svg.lastChild); });
      el("text", { x: g, y: H - 8, class: "tmm-courbe__axe" }, nomMois(s.serie[0].mois));
      el("text", { x: W - d, y: H - 8, "text-anchor": "end", class: "tmm-courbe__axe" }, nomMois(s.dernier.mois));
      return svg;
    }
    function rendreOnglet() {
      var r = $("credit-tmm"); if (!r) return;
      var s = P.serieTMM(historique), p = O.profil() || {};
      r.textContent = "";
      var sec = doc.createElement("section"); sec.className = "panneau ce-panneau"; sec.setAttribute("aria-labelledby", "ce-tmm-titre");
      sec.innerHTML = '<div class="cr-section-tete"><h2 id="ce-tmm-titre">Le TMM et mes crédits</h2><p>Le taux moyen du marché monétaire, publié chaque mois par la Banque centrale de Tunisie, et ce qu\'il change pour vous.</p></div>';
      if (!s.dernier) {
        sec.insertAdjacentHTML("beforeend", '<div class="encart"><svg aria-hidden="true"><use href="/orbite/icones.svg#info"/></svg><div><p>' + (charge ? "Aucun TMM saisi pour l'instant : Orbite utilise " + pc(OC.TMM) + " par défaut. L'administrateur le met à jour chaque mois." : "Chargement du TMM…") + '</p></div></div>');
        r.appendChild(sec); return;
      }
      var eff = P.effetTMM({ delta: s.variation, tmm: s.dernier.taux, credits: p.credits || [] });
      var stats = doc.createElement("div"); stats.className = "cr-stats";
      stats.innerHTML = '<div class="cr-stat cr-stat--fort"><span class="cr-stat__lib">TMM de ' + nomMois(s.dernier.mois) + '</span><strong class="cr-stat__val chiffre">' + pc(s.dernier.taux) + '</strong><small class="cr-stat__note">' + (s.precedent ? signe(s.variation) + " point depuis " + nomMois(s.precedent.mois) : "premier mois saisi") + '</small></div>' +
        '<div class="cr-stat"><span class="cr-stat__lib">Effet du mois sur vos échéances</span><strong class="cr-stat__val chiffre">' + signe(eff.ecartTotal) + ' DT</strong><small class="cr-stat__note">par mois' + (eff.exemple ? ", sur l'exemple" : "") + '</small></div>' +
        '<div class="cr-stat"><span class="cr-stat__lib">Si le TMM monte d\'un point</span><strong class="cr-stat__val chiffre">+' + N2.format(eff.plusUnPointTotal).replace(/[  ]/g, " ") + ' DT</strong><small class="cr-stat__note">par mois</small></div>';
      sec.appendChild(stats);
      var cadre = doc.createElement("div"); cadre.className = "tmm-cadre"; cadre.appendChild(courbe(s)); sec.appendChild(cadre);
      var t = doc.createElement("table"); t.className = "ce-table";
      t.innerHTML = '<caption>' + (eff.exemple ? "Vous n'avez pas de crédit à taux variable : voici l'effet sur un exemple" : "Vos crédits à taux variable") + '</caption><thead><tr><th scope="col">Crédit</th><th scope="col" class="nb">Échéance avant</th><th scope="col" class="nb">Après le TMM du mois</th><th scope="col" class="nb">TMM +1 point</th></tr></thead>';
      var tb = doc.createElement("tbody");
      eff.lignes.forEach(function (l) {
        var tr = doc.createElement("tr"), th = doc.createElement("th"); th.scope = "row"; th.textContent = l.libelle; tr.appendChild(th);
        [F.dt3(l.avant) + " DT", F.dt3(l.apres) + " DT (" + signe(l.ecart) + ")", "+" + F.dt3(l.plusUnPoint) + " DT"].forEach(function (v) { var td = doc.createElement("td"); td.className = "nb chiffre"; td.textContent = v; tr.appendChild(td); });
        tb.appendChild(tr);
      });
      t.appendChild(tb); sec.appendChild(t);
      sec.insertAdjacentHTML("beforeend", '<p class="ce-note"><svg aria-hidden="true"><use href="/orbite/icones.svg#info"/></svg>Le nouveau TMM s\'applique à la prochaine révision prévue par votre contrat (souvent mensuelle ou annuelle). Valeurs saisies d\'après les publications de la Banque centrale de Tunisie. Un crédit est « à taux variable » quand vous l\'indiquez dans Mon profil › Crédits.</p>');
      r.appendChild(sec);
    }
    doc.addEventListener("orbite:tmm", function () { var r = $("credit-tmm"); if (r && !r.hidden) rendreOnglet(); });

    /* ---------- Administration ---------- */
    function rendreAdmin() {
      var ul = $("admin-tmm-liste"); if (!ul) return;
      var s = P.serieTMM(historique);
      $("admin-tmm-dernier").textContent = s.dernier ? pc(s.dernier.taux) + " · " + nomMois(s.dernier.mois) : "aucun";
      ul.textContent = "";
      s.serie.slice().reverse().slice(0, 24).forEach(function (x) {
        var li = doc.createElement("li"), t = doc.createElement("span"), b = doc.createElement("button");
        t.textContent = nomMois(x.mois) + " : " + pc(x.taux);
        b.type = "button"; b.className = "bouton bouton--fantome bouton--petit"; b.textContent = "Retirer"; b.setAttribute("aria-label", "Retirer le TMM de " + nomMois(x.mois));
        b.addEventListener("click", function () {
          b.disabled = true;
          E.admin.tmmSupprimer(x.mois).then(function () { return charger(); }).then(rendreAdmin).then(function () { O.toast("TMM de " + nomMois(x.mois) + " retiré."); })
            .catch(function (e) { b.disabled = false; O.toast(E.modele.messageErreur(e), { erreur: true }); });
        });
        li.appendChild(t); li.appendChild(b); ul.appendChild(li);
      });
    }
    var form = $("admin-tmm-form");
    if (form) {
      var m0 = new Date(); $("admin-tmm-mois").value = m0.getFullYear() + "-" + String(m0.getMonth() + 1).padStart(2, "0");
      $("admin-tmm-mois").max = $("admin-tmm-mois").value;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var err = $("admin-tmm-erreur"), mois = $("admin-tmm-mois").value, l = F.lire($("admin-tmm-taux").value);
        if (!/^\d{4}-\d{2}$/.test(mois) || !l.valide || l.vide || !(l.valeur > 0 && l.valeur < 30)) { err.textContent = "Indiquez le mois et un TMM entre 0 et 30 %, par exemple 7,45."; err.hidden = false; return; }
        err.hidden = true;
        var bt = form.querySelector('button[type="submit"]'); bt.disabled = true;
        E.admin.tmmSaisir(mois + "-01", l.valeur).then(function () { return charger(); }).then(function () {
          rendreAdmin(); $("admin-tmm-taux").value = "";
          O.toast("TMM de " + nomMois(mois + "-01") + " enregistré : " + pc(l.valeur) + ".", { type: "ok", detail: "Il s'applique à tout Orbite, pour tous les comptes." });
        }).catch(function (x) { err.textContent = E.modele.messageErreur(x); err.hidden = false; }).finally(function () { bt.disabled = false; });
      });
    }
    doc.addEventListener("orbite:vue", function (e) { if (e.detail.vue === "admin") (charge ? Promise.resolve() : charger(true)).then(rendreAdmin); });

    window.OrbiteTMM = { historique: function () { return historique.slice(); }, recharger: charger, rendreOnglet: rendreOnglet };
    charger(true).then(function () { if (O.lireRoute && O.lireRoute().vue === "admin") rendreAdmin(); });
  }
  doc.addEventListener("orbite:pret", demarrer, { once: true });
})();
