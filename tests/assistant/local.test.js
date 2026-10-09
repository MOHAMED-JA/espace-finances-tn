const test = require('node:test');
const assert = require('node:assert');
const OC = require('../../public/espace/js/orbite-calcul.js');
const A = require('../../public/espace/js/assistant-local.js');

/* Profil de l'utilisateur : 4 000 DT brut × 17, banque sur le brut, trois crédits en cours. */
const P = { montant: 4000, sens: 'brut', nombreSalaires: 17, baseBanque: 'brut', anneeNaissance: 1988, epargneDisponible: 9000,
  credits: [{ type: 'immo', libelle: 'Crédit immobilier', tauxPct: 4.5, mensualite: 875.894, moisRestants: 148 },
    { type: 'auto', libelle: 'Crédit auto', tauxPct: 4.5, mensualite: 695.008, moisRestants: 65 },
    { type: 'conso', libelle: 'Crédit mariage', tauxPct: 2, mensualite: 497.93, moisRestants: 68 }],
  contrats: [{ type: 'av', libelle: 'Assurance vie', anneeDebut: 2021, moisDebut: 12, versementMensuel: 100 }] };
const sy = OC.synthese(P, {}, new Date(2026, 9, 9));

test('voiture à une année donnée : étape du calendrier de cette année', () => {
  const r = A.repondre('Est-ce que je peux acheter une voiture en 2032 ?', sy);
  assert.match(r.texte, /juin 2032/);
  assert.match(r.texte, /auto : jusqu'à \*\*/);
  assert.match(r.lien.href, /^#credit\?type=auto&capital=\d+&mois=84&taux=4\.5&mensualite=[\d.]+$/);
});

test('aujourd\'hui : capacité actuelle, et le meilleur moment est proposé', () => {
  const r = A.repondre('Je veux acheter une voiture', sy);
  assert.match(r.texte, /aujourd'hui/);
  assert.match(r.texte, /février 2039/);
});

test('darija : « dar ba3d ma nkammel crédit el karhba » vise la maison, à la fin du crédit auto', () => {
  const r = A.repondre('Najjem nechri dar ba3d ma nkammel crédit el karhba ?', sy);
  assert.match(r.texte, /^Ey, etnajjem ! Men \*\*mars 2032\*\*, ki yekmel crédit auto/);
  assert.match(r.texte, /immobilier jusqu'à/);
  assert.ok(A.langueDarija('chnowa score mte3i'));
  assert.ok(!A.langueDarija('Quel est mon score ?'));
});

test('impôt, épargne, salaire, score, budget : réponses chiffrées avec un lien', () => {
  assert.match(A.repondre("Comment payer moins d'impôt ?", sy).texte, /avant le 31 décembre/);
  assert.match(A.repondre('Où en est mon épargne ?', sy).texte, /Assurance vie/);
  assert.match(A.repondre('Quel est mon salaire net ?', sy).texte, /net par mois/);
  assert.match(A.repondre('Mon score de santé', sy).texte, /\/100/);
  assert.equal(A.repondre('mon budget', sy).lien.href, '#profil');
  assert.equal(A.repondre('Et si je me marie ?', sy).lien.href, '#vie');
});

test('sans capacité aujourd\'hui : explique la limite et la date où elle revient', () => {
  const p2 = JSON.parse(JSON.stringify(P)); p2.credits[1].mensualite = 1600;
  const r = A.repondre('Najjem nechri karhba ?', OC.synthese(p2, {}, new Date(2026, 9, 9)));
  assert.match(r.texte, /^Mazelt/);
});

test('profil vide ou question inconnue', () => {
  assert.equal(A.repondre('bonjour', null).lien.href, '#profil');
  assert.match(A.repondre('bonjour', sy).texte, /Voici l'essentiel/);
});
