/*
 * Lecture d'une fiche de paie sur l'appareil (lot 7).
 * ----------------------------------------------------
 * Rien n'est envoyé : le PDF est lu par pdf.js, la photo par Tesseract, tous deux servis
 * depuis /commun/vendor/ et chargés seulement au premier usage.
 * Sortie commune : des lignes { texte, cellules, confiance } reconstruites d'après la position
 * des mots sur la page, qu'analyse ensuite FicheCalcul.
 */
(function (racine) {
  "use strict";

  var VENDOR = "/commun/vendor/";
  var PAGES_MAX = 3;
  var TAILLE_MAX = 15 * 1024 * 1024;

  function erreur(code, message) { var e = new Error(message); e.code = code; return e; }

  /* ---------- Reconstruction des lignes (commune au PDF et à la photo) ----------
   * items : { x, y, l, h, texte, conf } avec y = haut du mot, l = largeur, h = hauteur.
   * Deux mots sont sur la même ligne si leurs centres verticaux sont à moins d'une demi-hauteur ;
   * un grand espace horizontal (plus de 1,2 hauteur de texte) sépare deux cellules. */
  function cellulesDe(mots, h) {
    var ms = mots.slice().sort(function (a, b) { return a.x - b.x; }), cellules = [], cel = null, fin = -Infinity;
    ms.forEach(function (m) {
      if (!cel || m.x - fin > h * 1.2) { cel = { mots: [], conf: 1, x: m.x, fin: m.x + m.l }; cellules.push(cel); }
      cel.mots.push(m.texte.trim()); cel.fin = Math.max(cel.fin, m.x + m.l);
      if (typeof m.conf === "number") cel.conf = Math.min(cel.conf, m.conf);
      fin = Math.max(fin, m.x + m.l);
    });
    var cs = cellules.map(function (c) { return c.mots.join(" ").replace(/\s+/g, " "); });
    var confs = cellules.map(function (c) { return c.conf; });
    /* confiances : une par cellule (le montant compte plus que le libellé) ; confiance : la plus faible. */
    /* positions : début et fin horizontale de chaque cellule (colonnes d'un relevé bancaire). */
    return { texte: cs.join("   "), cellules: cs, confiances: confs, confiance: Math.min.apply(null, confs),
      positions: cellules.map(function (c) { return { x: c.x, fin: c.fin }; }) };
  }
  function utile(it) { return it.texte && it.texte.trim() && it.h > 0; }

  function lignesDepuisItems(items) {
    var mots = items.filter(utile)
      .map(function (it) { return Object.assign({}, it, { cy: it.y + it.h / 2 }); })
      .sort(function (a, b) { return a.cy - b.cy || a.x - b.x; });
    var rangs = [];
    mots.forEach(function (m) {
      var r = rangs.length ? rangs[rangs.length - 1] : null;
      if (r && Math.abs(m.cy - r.cy) <= Math.max(r.h, m.h) * 0.5) {
        r.mots.push(m); r.cy = (r.cy * (r.mots.length - 1) + m.cy) / r.mots.length; r.h = Math.max(r.h, m.h);
      } else rangs.push({ cy: m.cy, h: m.h, mots: [m] });
    });
    return rangs.map(function (r) { return cellulesDe(r.mots, r.h); });
  }

  /* ---------- Chargement paresseux des outils ---------- */
  var promessePdf = null, promesseTess = null;
  function pdfjs() {
    if (!promessePdf) {
      promessePdf = import(VENDOR + "pdfjs-4.10.38/pdf.min.mjs").then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = VENDOR + "pdfjs-4.10.38/pdf.worker.min.mjs";
        return lib;
      }, function (e) { promessePdf = null; throw erreur("outil", "Le lecteur de PDF n'a pas pu être chargé. " + (e && e.message || "")); });
    }
    return promessePdf;
  }
  function tesseract() {
    if (racine.Tesseract) return Promise.resolve(racine.Tesseract);
    if (!promesseTess) {
      promesseTess = new Promise(function (ok, ko) {
        var s = document.createElement("script");
        s.src = VENDOR + "tesseract-7.0.0/tesseract.min.js";
        s.onload = function () { racine.Tesseract ? ok(racine.Tesseract) : ko(new Error("Tesseract absent")); };
        s.onerror = function () { promesseTess = null; ko(erreur("outil", "Le lecteur de photo n'a pas pu être chargé.")); };
        document.head.appendChild(s);
      });
    }
    return promesseTess;
  }

  /* ---------- PDF ---------- */
  function lirePdf(octets, progres, pagesMax) {
    return pdfjs().then(function (lib) {
      progres("ouvrir", 0.1);
      return lib.getDocument({ data: octets, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, enableXfa: false, stopAtErrors: false }).promise;
    }).then(function (doc) {
      var n = Math.min(doc.numPages, pagesMax || PAGES_MAX), pages = [];
      var suite = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (k) {
        suite = suite.then(function () { return doc.getPage(k); }).then(function (page) {
          var vue = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            var items = tc.items.filter(function (it) { return typeof it.str === "string"; }).map(function (it) {
              var h = Math.abs(it.transform[3]) || Math.abs(it.height) || 10;
              /* Origine pdf.js en bas à gauche : on retourne l'axe vertical. */
              return { x: it.transform[4], y: vue.height - it.transform[5] - h, l: it.width, h: h, texte: it.str, conf: 1 };
            });
            pages.push({ page: page, vue: vue, items: items });
            progres("lire", 0.1 + 0.6 * k / n);
          });
        });
      })(i);
      return suite.then(function () {
        var lignes = [];
        pages.forEach(function (p) { lignes = lignes.concat(lignesDepuisItems(p.items)); });
        var utiles = lignes.filter(function (l) { return /\d/.test(l.texte); }).length;
        /* PDF scanné (aucun texte) : on dessine la première page et on la lit comme une photo. */
        if (utiles < 3) {
          var p0 = pages[0], echelle = Math.min(3, 2400 / Math.max(p0.vue.width, p0.vue.height));
          var v = p0.page.getViewport({ scale: echelle }), c = document.createElement("canvas");
          c.width = Math.round(v.width); c.height = Math.round(v.height);
          var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
          return p0.page.render({ canvasContext: ctx, viewport: v }).promise.then(function () {
            doc.destroy();
            return lireCanevas(c, progres).then(function (r) { r.source = "pdf-image"; return r; });
          });
        }
        doc.destroy();
        progres("fin", 1);
        return { source: "pdf", lignes: lignes, pages: n };
      });
    }, function (e) {
      if (e && e.code) throw e;
      if (e && e.name === "PasswordException") throw erreur("motdepasse", "Ce PDF est protégé par un mot de passe. Ouvrez-le, puis enregistrez-le sans mot de passe ou faites une capture d'écran.");
      throw erreur("illisible", "Ce PDF n'a pas pu être ouvert.");
    });
  }

  /* ---------- Photo ---------- */
  function preparerImage(fichier) {
    var charger = typeof createImageBitmap === "function"
      ? createImageBitmap(fichier, { imageOrientation: "from-image" })
      : new Promise(function (ok, ko) {
        var url = URL.createObjectURL(fichier), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); ok(img); };
        img.onerror = function () { URL.revokeObjectURL(url); ko(new Error("image")); };
        img.src = url;
      });
    return charger.then(function (img) {
      var w = img.width, h = img.height, grand = Math.max(w, h);
      /* Assez de pixels pour des chiffres nets, sans saturer la mémoire d'un téléphone. */
      var k = grand > 3000 ? 3000 / grand : grand < 1400 ? Math.min(2, 1400 / grand) : 1;
      var c = document.createElement("canvas");
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (img.close) img.close();
      /* Niveaux de gris avec un léger contraste : aide la lecture des photos prises sous une lampe. */
      var d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        g = Math.max(0, Math.min(255, (g - 128) * 1.25 + 128));
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
      return c;
    }, function () {
      throw erreur("format", "Cette image n'a pas pu être ouverte. Envoyez-la en JPG ou PNG (sur iPhone : capture d'écran de la photo).");
    });
  }

  function lireCanevas(canevas, progres) {
    var worker = null;
    return tesseract().then(function (T) {
      progres("outil", 0.15);
      return T.createWorker("fra", 1, {
        workerPath: VENDOR + "tesseract-7.0.0/worker.min.js",
        corePath: VENDOR + "tesseract-7.0.0/core",
        langPath: VENDOR + "tesseract-7.0.0/lang",
        workerBlobURL: false,
        gzip: true,
        cachePath: "orbite-lecture",
        logger: function (m) {
          if (m && m.status === "recognizing text") progres("lire", 0.3 + 0.65 * (m.progress || 0));
          else if (m && /loading/.test(m.status || "")) progres("outil", 0.15 + 0.15 * (m.progress || 0));
        }
      });
    }).then(function (w) {
      worker = w;
      /* Mode « bloc uniforme » : garde chaque ligne du tableau entière (libellé … montant). */
      return w.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    }).then(function () {
      return worker.recognize(canevas, {}, { blocks: true, text: true });
    }).then(function (res) {
      /* Une ligne de Tesseract = une ligne de la fiche (il redresse lui-même une photo un peu de travers). */
      var lignes = [];
      (res.data.blocks || []).forEach(function (b) {
        (b.paragraphs || []).forEach(function (p) {
          (p.lines || []).forEach(function (l) {
            var h = Math.max(1, (l.rowAttributes && l.rowAttributes.rowHeight) || (l.bbox.y1 - l.bbox.y0));
            var mots = (l.words || []).map(function (m) {
              return { x: m.bbox.x0, l: m.bbox.x1 - m.bbox.x0, h: h, texte: m.text, conf: (m.confidence || 0) / 100 };
            }).filter(utile);
            if (mots.length) lignes.push(cellulesDe(mots, Math.min(h, 60)));
          });
        });
      });
      progres("fin", 1);
      return worker.terminate().then(function () {
        worker = null;
        return { source: "image", lignes: lignes, pages: 1 };
      });
    }).catch(function (e) {
      if (worker) worker.terminate().catch(function () {});
      if (e && e.code) throw e;
      throw erreur("illisible", "La photo n'a pas pu être lue. " + (e && e.message || ""));
    });
  }

  /* ---------- Point d'entrée ---------- */
  function estPdf(f) { return /pdf$/i.test(f.type || "") || /\.pdf$/i.test(f.name || ""); }
  function estImage(f) { return /^image\//i.test(f.type || "") || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name || ""); }

  function lire(fichier, options) {
    var progres = (options && options.progres) || function () {};
    if (!fichier) return Promise.reject(erreur("vide", "Aucun fichier choisi."));
    if (fichier.size > TAILLE_MAX) return Promise.reject(erreur("taille", "Ce fichier dépasse 15 Mo. Envoyez la première page seulement, ou une photo."));
    /* options.pagesMax : 3 par défaut (fiche de paie) ; un tableau d'amortissement en demande davantage. */
    if (estPdf(fichier)) return fichier.arrayBuffer().then(function (b) { return lirePdf(new Uint8Array(b), progres, options && options.pagesMax); });
    if (estImage(fichier)) return preparerImage(fichier).then(function (c) { progres("image", 0.1); return lireCanevas(c, progres); });
    return Promise.reject(erreur("format", "Choisissez un PDF ou une photo (JPG, PNG)."));
  }

  var api = { lire: lire, lignesDepuisItems: lignesDepuisItems, estPdf: estPdf, estImage: estImage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.FicheLecture = api;
})(typeof self !== "undefined" ? self : this);
