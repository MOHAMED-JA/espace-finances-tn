/*
 * Orbite — inviter à installer l'application sur le téléphone (15 oct. 2026, maquette validée).
 * Gratuit et sans boutique : c'est l'application web installable (manifeste + service worker, voir appli.js).
 * - Carte dans « Mon orbite » et en haut du Menu (menu-complet.js), sur téléphone seulement, tant qu'Orbite
 *   n'est pas installée et que le premier pas est fait ; « Plus tard » cache la carte de Mon orbite 30 jours
 *   (cet appareil, localStorage « ef-installer-plus-tard »).
 * - « Installer » ouvre l'invitation du navigateur quand il en propose une ; sinon le guide en 3 gestes,
 *   le navigateur détecté en premier (Chrome, Samsung Internet, Safari sur iPhone, ordinateur).
 */
(function () {
  "use strict";
  var doc = document, O = window.Orbite, A = window.OrbiteAppli;
  var carte = doc.getElementById("installer-orbite"), dlg = doc.getElementById("dlg-installer");
  if (!carte || !A) return;
  var CLE = "ef-installer-plus-tard", DELAI = 30 * 24 * 3600 * 1000;
  var telephone = window.matchMedia("(max-width: 767px)");

  function reportee() {
    try { var t = Number(localStorage.getItem(CLE)); return t > 0 && Date.now() - t < DELAI; } catch (e) { return false; }
  }
  /* L'invitation a sa place sur téléphone, Orbite pas encore installée, après le premier pas. */
  function utile() { return telephone.matches && !A.installee() && !(O && O.profilVierge && O.profilVierge()); }
  function maj() { carte.hidden = !utile() || reportee(); }

  function navigateur() {
    var ua = navigator.userAgent || "";
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android|Mobile/i.test(ua)) return "chrome";
    return "ordinateur";
  }
  function guide() {
    if (!dlg || !dlg.showModal) return;
    var ici = navigateur(), liste = doc.getElementById("installer-guide-liste");
    liste.querySelectorAll(".installer-guide__nav").forEach(function (s) {
      var c = s.getAttribute("data-nav") === ici;
      /* Sur téléphone, les gestes de l'ordinateur n'ont rien à faire là. */
      s.hidden = ici !== "ordinateur" && s.getAttribute("data-nav") === "ordinateur";
      s.classList.toggle("installer-guide__nav--ici", c);
      if (c) liste.insertBefore(s, liste.firstChild);
    });
    if (!dlg.open) dlg.showModal();
  }
  function installer() {
    if (A.peutProposer()) A.proposer().then(function (ok) { if (!ok) maj(); });
    else guide();
  }

  /* Carte pour le Menu : copie de celle de Mon orbite, sans « Plus tard » ni identifiants. */
  function carteMenu() {
    if (!utile()) return null;
    var c = carte.cloneNode(true);
    c.hidden = false; c.removeAttribute("id"); c.classList.add("installer--menu");
    var t = c.querySelector(".installer__titre"); t.id = "installer-titre-menu"; c.setAttribute("aria-labelledby", t.id);
    var p = c.querySelector('[data-installer="plus-tard"]'); if (p) p.remove();
    return c;
  }

  doc.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-installer]"); if (!b) return;
    if (b.getAttribute("data-installer") === "plus-tard") {
      try { localStorage.setItem(CLE, String(Date.now())); } catch (er) {}
      maj();
      if (O && O.toast) O.toast("D'accord. Vous retrouverez « Installer Orbite » dans le Menu et dans Paramètres.");
      return;
    }
    if (window.OrbiteMenu && b.closest("#dlg-menu")) window.OrbiteMenu.fermer();
    installer();
  });
  if (dlg) {
    doc.getElementById("installer-guide-ok").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }
  doc.addEventListener("orbite:installation", maj);
  doc.addEventListener("orbite:modifie", maj);
  doc.addEventListener("orbite:vue", maj);
  if (telephone.addEventListener) telephone.addEventListener("change", maj);
  if (O && O.pret) maj(); else doc.addEventListener("orbite:pret", maj, { once: true });
  maj();

  window.OrbiteInstaller = { guide: guide, installer: installer, carteMenu: carteMenu, maj: maj };
})();
