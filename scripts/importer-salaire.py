#!/usr/bin/env python3
"""
Importe le calculateur de salaire du portail RH public dans l'Espace Finances TN.

Source : un clone de MOHAMED-JA/portail-rh (dossier calculateur-salaire/).
Cible  : public/outils/salaire/ de ce dépôt.

Adaptations faites automatiquement :
- garde d'accès, configuration et barre de l'Espace (pont) dans la page ;
- page non indexée, manifeste de l'Espace, liens vers les autres outils internes ;
- suppression de la bande d'invitation (inutile une fois connecté) ;
- pas de service worker propre à l'outil (le script de l'outil le gère déjà).

Usage : python3 scripts/importer-salaire.py ../portail-rh/calculateur-salaire
"""
import re
import shutil
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CIBLE = RACINE / "public" / "outils" / "salaire"
A_COPIER = ["index.html", "css/billet.css", "js/billet.js", "js/theme-init.js", "js/calcul.js", "js/etat.js",
            "config/parametres.js", "assets/icone.svg", "assets/fonts", "assets/icones"]


def main(source: Path) -> None:
    if not (source / "js" / "billet.js").exists():
        sys.exit("Source invalide : js/billet.js introuvable dans " + str(source))
    if CIBLE.exists():
        shutil.rmtree(CIBLE)
    for chemin in A_COPIER:
        s, c = source / chemin, CIBLE / chemin
        c.parent.mkdir(parents=True, exist_ok=True)
        if s.is_dir():
            shutil.copytree(s, c)
        else:
            shutil.copy2(s, c)

    page = CIBLE / "index.html"
    h = page.read_text(encoding="utf-8")
    h = re.sub(r'\s*<aside class="efa".*?</aside>', "", h, flags=re.S)
    h = h.replace('<link rel="stylesheet" href="css/espace-bande.css">\n', "")
    h = re.sub(r'\s*<link rel="canonical"[^>]*>', "", h)
    h = h.replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="/manifest.webmanifest">')
    h = h.replace('<meta charset="utf-8">',
                  '<meta charset="utf-8">\n  <meta name="robots" content="noindex">\n'
                  '  <script src="/commun/config.js"></script>\n  <script src="/commun/garde.js"></script>\n'
                  '  <link rel="stylesheet" href="/commun/pont.css">', 1)
    h = h.replace("<html lang=\"fr\">", "<html lang=\"fr\" data-protege>", 1)
    internes = {
        "https://mohamed-ja.github.io/simulateur-credit/": "/outils/credit/",
        "https://mohamed-ja.github.io/simulateur-assurance-vie/": "/outils/assurance-vie/",
    }
    for ext, interne in internes.items():
        h = re.sub(r'<a href="' + re.escape(ext) + r'" target="_blank" rel="noopener">([^<]*)<span class="cache"> \(nouvel onglet\)</span></a>',
                   r'<a href="' + interne + r'">\1</a>', h)
    pied = ('<script src="/commun/vendor/supabase.js"></script>\n<script src="/commun/modele.js"></script>\n'
            '<script src="/commun/session.js"></script>\n<script src="/commun/pont.js"></script>\n')
    h = h.replace("</body>", pied + "</body>", 1)
    if re.search(r"<script>(?!\s*</script>)", h) or 'style="' in h:
        sys.exit("Script ou style en ligne détecté : interdit par la CSP de l'Espace.")
    page.write_text(h, encoding="utf-8")
    print("Calculateur importé dans", CIBLE.relative_to(RACINE))


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "../portail-rh/calculateur-salaire").resolve())
