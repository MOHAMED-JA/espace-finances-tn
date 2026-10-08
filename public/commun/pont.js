/*
 * Barre de l'Espace dans les outils : retour à l'espace, enregistrement
 * de la simulation (nouvelle, mise à jour ou copie), menu du compte.
 * Chaque outil expose window.EspaceOutil = { outil, etat(), resume(), nomParDefaut() }.
 */
(function () {
  "use strict";
  var E = window.Espace, M = window.EFModele;
  var idOuvert = window.EF_SIMULATION_OUVERTE || null;
  var simulationOuverte = null;
  var utilisateur = null;

  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "texte") n.textContent = attrs[k];
      else if (k === "classe") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function svg(chemin, vb) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", vb || "0 0 16 16");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    chemin.forEach(function (d) { var p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.appendChild(p); });
    return s;
  }

  var toastCourant = null;
  function toast(texte, options) {
    var o = options || {};
    if (toastCourant) toastCourant.remove();
    var t = el("div", { classe: "efp efp-toast", role: o.erreur ? "alert" : "status" });
    if (o.erreur) t.setAttribute("data-erreur", "");
    t.appendChild(el("span", { texte: texte }));
    if (o.lien) t.appendChild(el("a", { href: o.lien.href, texte: o.lien.libelle }));
    document.body.appendChild(t);
    toastCourant = t;
    var reste = o.erreur ? 8000 : 5000, minuterie, debut;
    function fermer() { t.classList.add("efp-sortie"); setTimeout(function () { t.remove(); }, 170); }
    function lancer() { debut = Date.now(); minuterie = setTimeout(fermer, reste); }
    t.addEventListener("pointerenter", function () { clearTimeout(minuterie); reste -= Date.now() - debut; });
    t.addEventListener("pointerleave", lancer);
    lancer();
  }

  function outil() { return window.EspaceOutil; }

  /* ---------- Barre ---------- */
  function construire() {
    var o = outil();
    var cle = o ? o.outil : "";
    var desc = M.OUTILS[cle];
    var racine = el("div", { classe: "efp", "data-outil": cle, id: "efp" });
    var barre = el("nav", { classe: "efp-barre", "aria-label": "Espace Finances TN" });
    var signe = el("span", { classe: "efp-signe", "aria-hidden": "true" });
    signe.appendChild(svg(["M2 12.5 6 8l3 3 5-6.5", "M10.5 4.5H14v3.5"]));
    var retour = el("a", { classe: "efp-retour", href: "/espace/" }, [signe, el("span", { classe: "efp-libelle-long", texte: "Mon espace" }), el("span", { classe: "efp-libelle-court", texte: "Espace" })]);
    barre.appendChild(retour);
    barre.appendChild(el("span", { classe: "efp-sep", "aria-hidden": "true" }));
    barre.appendChild(el("span", { classe: "efp-outil" }, [el("span", { texte: desc ? desc.nom : "Outil" })]));
    barre.appendChild(el("span", { classe: "efp-espace" }));
    var etat = el("span", { classe: "efp-etat", id: "efp-etat", "aria-live": "polite" });
    barre.appendChild(etat);

    var copie = el("button", { type: "button", classe: "efp-bouton efp-bouton--discret", id: "efp-copie", hidden: "" }, [el("span", { classe: "efp-libelle-long", texte: "Enregistrer une copie" }), el("span", { classe: "efp-libelle-court", texte: "Copie" })]);
    var enregistrer = el("button", { type: "button", classe: "efp-bouton efp-bouton--principal", id: "efp-enregistrer" }, [
      svg(["M3 2.5h8l2.5 2.5v8.5H3z", "M5.5 2.5v3.5h5v-3.5", "M5.5 13.5v-4h5v4"]),
      el("span", { classe: "efp-libelle-long", id: "efp-lib-long", texte: "Enregistrer dans mon espace" }),
      el("span", { classe: "efp-libelle-court", id: "efp-lib-court", texte: "Enregistrer" })
    ]);
    barre.appendChild(copie);
    barre.appendChild(enregistrer);
    var avatar = el("button", { type: "button", classe: "efp-avatar", id: "efp-avatar", "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "Menu du compte", texte: "·" });
    barre.appendChild(avatar);
    racine.appendChild(barre);
    document.body.insertBefore(racine, document.body.firstChild);

    if (!o) { enregistrer.disabled = true; etat.textContent = "Enregistrement indisponible"; }
    enregistrer.addEventListener("click", function () { simulationOuverte ? mettreAJour() : ouvrirDialogue(false); });
    copie.addEventListener("click", function () { ouvrirDialogue(true); });
    avatar.addEventListener("click", basculerMenu);
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); enregistrer.click(); }
    });
  }

  /* ---------- Menu du compte ---------- */
  var menu = null;
  function fermerMenu(focus) {
    if (!menu) return;
    menu.remove(); menu = null;
    var a = document.getElementById("efp-avatar");
    a.setAttribute("aria-expanded", "false");
    if (focus) a.focus();
  }
  function basculerMenu() {
    if (menu) { fermerMenu(true); return; }
    var a = document.getElementById("efp-avatar");
    var meta = (utilisateur && utilisateur.user_metadata) || {};
    menu = el("div", { classe: "efp-menu", role: "menu" }, [
      el("div", { classe: "efp-menu__entete" }, [
        el("div", { classe: "efp-menu__nom", texte: meta.full_name || meta.name || "Mon compte" }),
        el("div", { classe: "efp-menu__email", texte: utilisateur ? utilisateur.email : "" })
      ]),
      el("a", { href: "/espace/", role: "menuitem", texte: "Mon espace" }),
      el("a", { href: "/espace/#simulations", role: "menuitem", texte: "Mes simulations" }),
      el("a", { href: "/espace/#compte", role: "menuitem", texte: "Compte et sécurité" }),
      el("button", { type: "button", role: "menuitem", id: "efp-deconnexion", texte: "Se déconnecter" })
    ]);
    document.querySelector("#efp .efp-barre").appendChild(menu);
    a.setAttribute("aria-expanded", "true");
    menu.querySelector("a").focus();
    menu.querySelector("#efp-deconnexion").addEventListener("click", function () { E.deconnexion(); });
    menu.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll("[role=menuitem]"));
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { items[(i + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
      else if (e.key === "Escape") { fermerMenu(true); e.preventDefault(); }
    });
  }
  document.addEventListener("click", function (e) {
    if (menu && !e.target.closest(".efp-menu") && !e.target.closest("#efp-avatar")) fermerMenu(false);
  });

  /* ---------- Enregistrement ---------- */
  function lireSimulation() {
    var o = outil();
    if (!o) return null;
    var etat = null, resume = null;
    try { etat = o.etat(); resume = o.resume(); } catch (e) { etat = null; }
    var propre = M.nettoyerEtat(etat || "");
    if (!etat || propre === null || !resume) return null;
    return { etat: propre, resume: M.resumeValide(resume), nom: (function () { try { return o.nomParDefaut(); } catch (e) { return M.OUTILS[o.outil].nom; } })() };
  }

  function apercu(sim) {
    var bloc = el("div", { classe: "efp-apercu" });
    if (sim.resume.principal) {
      bloc.appendChild(el("span", { classe: "efp-apercu__lib", texte: sim.resume.principal.libelle }));
      bloc.appendChild(el("span", { classe: "efp-apercu__val", texte: M.formaterIndicateur(sim.resume.principal) }));
    }
    if (sim.resume.ligne) bloc.appendChild(el("span", { classe: "efp-apercu__ligne", texte: sim.resume.ligne }));
    return bloc;
  }

  function ouvrirDialogue(copie) {
    var sim = lireSimulation();
    if (!sim) { toast("Complétez d'abord la simulation (montants valides), puis enregistrez-la.", { erreur: true }); return; }
    var dlg = el("dialog", { classe: "efp efp-dialogue", "aria-labelledby": "efp-dlg-titre" });
    var form = el("form", { method: "dialog", novalidate: "" });
    var champ = el("input", { id: "efp-nom", type: "text", maxlength: "120", required: "", spellcheck: "false", autocomplete: "off" });
    champ.value = copie && simulationOuverte ? (simulationOuverte.nom + " (copie)").slice(0, 120) : sim.nom.slice(0, 120);
    var erreur = el("p", { classe: "efp-erreur", hidden: "", role: "alert" });
    var valider = el("button", { type: "submit", classe: "efp-bouton efp-bouton--principal", value: "ok", texte: "Enregistrer" });
    form.appendChild(el("h2", { id: "efp-dlg-titre", texte: copie ? "Enregistrer une copie" : "Enregistrer dans mon espace" }));
    form.appendChild(apercu(sim));
    form.appendChild(el("div", { classe: "efp-champ" }, [el("label", { for: "efp-nom", texte: "Nom de la simulation" }), champ]));
    form.appendChild(erreur);
    form.appendChild(el("div", { classe: "efp-actions" }, [
      el("button", { type: "submit", classe: "efp-bouton efp-bouton--discret", value: "annuler", formnovalidate: "", texte: "Annuler" }),
      valider
    ]));
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.showModal();
    champ.select();
    form.addEventListener("submit", function (e) {
      var bouton = e.submitter;
      if (bouton && bouton.value === "annuler") return;
      e.preventDefault();
      var nom = M.nomValide(champ.value);
      if (!nom) { erreur.textContent = "Donnez un nom à la simulation (120 caractères au plus)."; erreur.hidden = false; champ.focus(); return; }
      valider.disabled = true; valider.setAttribute("aria-busy", "true");
      E.simulations.creer(outil().outil, nom, sim.etat, sim.resume).then(function (s) {
        dlg.close();
        definirOuverte(s);
        toast("« " + s.nom + " » est enregistrée.", { lien: { href: "/espace/#simulations", libelle: "Voir" } });
      }).catch(function (err) {
        erreur.textContent = M.messageErreur(err); erreur.hidden = false;
        valider.disabled = false; valider.removeAttribute("aria-busy");
      });
    });
    dlg.addEventListener("close", function () { setTimeout(function () { dlg.remove(); }, 200); document.getElementById("efp-enregistrer").focus(); });
  }

  function mettreAJour() {
    var sim = lireSimulation();
    if (!sim) { toast("Complétez d'abord la simulation (montants valides), puis enregistrez-la.", { erreur: true }); return; }
    var b = document.getElementById("efp-enregistrer");
    b.disabled = true; b.setAttribute("aria-busy", "true");
    E.simulations.mettreAJour(simulationOuverte.id, sim.etat, sim.resume).then(function (s) {
      definirOuverte(s);
      toast("« " + s.nom + " » est mise à jour.");
    }).catch(function (err) {
      toast(M.messageErreur(err), { erreur: true });
    }).finally(function () { b.disabled = false; b.removeAttribute("aria-busy"); });
  }

  function definirOuverte(s) {
    simulationOuverte = s;
    var long = document.getElementById("efp-lib-long"), court = document.getElementById("efp-lib-court");
    long.textContent = "Mettre à jour";
    court.textContent = "Mettre à jour";
    document.getElementById("efp-copie").hidden = false;
    var etat = document.getElementById("efp-etat");
    etat.textContent = s.nom;
    etat.title = s.nom;
  }

  /* ---------- Démarrage ---------- */
  function demarrer() {
    construire();
    E.exigerConnexion().then(function (u) {
      utilisateur = u;
      var meta = u.user_metadata || {};
      var a = document.getElementById("efp-avatar");
      a.textContent = E.initiales(meta.full_name || meta.name, u.email);
      if (idOuvert && outil()) {
        E.simulations.lire(idOuvert).then(function (s) {
          if (s && s.outil === outil().outil) definirOuverte(s);
        }).catch(function () {});
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
