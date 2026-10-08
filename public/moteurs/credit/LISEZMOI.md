# Moteur de crédit (`credit.js`)

Fonctions pures du simulateur de crédit bancaire tunisien, extraites de
`public/outils/credit/js/app.js`. Elles n'utilisent ni le DOM ni le navigateur.
Les formules, les arrondis et les cas limites sont ceux de l'original :
`tests/credit/parite.test.js` le vérifie au millime sur 21 échéanciers et sur
les outils.

```js
const M = require('./credit.js');            // Node
const M = window.MoteurCredit;                // navigateur (<script src="credit.js">)
```

## Conventions

- Montants arrondis au millime (`arrondi`, 3 décimales) **à chaque échéance**.
- Taux en % (`7.5` = 7,5 %). Le taux de période vaut taux annuel × p ÷ 12,
  arrondi à 6 décimales (`tauxPeriodePct`). Après une réduction de moitié, le
  taux réduit n'est pas arrondi (comme dans l'original).
- `p` (périodicité) : 1, 3, 6 ou 12 mois. `mois` est une durée en mois,
  multiple de `p`.
- Dates : « AAAA-MM-JJ ». La date d'une ligne est le 1er du mois de l'échéance
  (`null` sans date de début).

## Constantes

| Nom | Contenu |
|---|---|
| `PREC` | 3 |
| `PERIODICITES` | `[{p, nom, echeance}]` : Mensuelle, Trimestrielle, Semestrielle, Annuelle |
| `AMORTISSEMENTS` | `[{cle, nom}]` : `constant`, `lineaire`, `infine` |
| `TYPES` | `[{cle, nom}]` : `immo`, `auto`, `conso`, `libre` |
| `DEFAUTS` / `defauts()` | `{tmm: 7.5, ageMax: 70, endettementMax: 40, apportMin: 20, types}` (agence par défaut) |
| `PRESETS` | `{immo: {duree: 20, mode: 'tmm', valeur: 2.5}, auto: {5, 'tmm', 3}, conso: {3, 'fixe', 11}}` |

## Entrée d'un crédit (`e`)

```js
{
  capital, mois, taux,                      // obligatoires
  dateDebut: 'AAAA-MM-JJ',                  // 1re échéance (facultatif)
  periodicite: 1, amort: 'constant',        // 'constant' | 'lineaire' | 'infine'
  differe: {mois, type: 'partiel'|'total'}, // compris dans la durée
  tmm: {tmm, marge},                        // informatif (sensibilité, lien)
  variation: {delta, des},                  // +delta points dès l'échéance « des »
  assurance: {taux, base: 'initial'|'crd'}, // % annuel
  frais: {dossierPct, dossierFixe, garantie, autres},
  ras: [{apres, total, montant}],           // remboursements anticipés après l'échéance « apres »
  versement: {montant, frequence: 'periode'|'annee', des},
  indemnite: 0,                             // % du montant remboursé par anticipation
  raMode: 'duree'|'mensualite',             // effet des remboursements anticipés
  reduction: false,                         // règle de réduction du taux
  dureeTotale,                              // durée initiale si e.mois est une durée restante
  apport: {prix, apport}, emprunteur: {age, revenus, charges}, type
}
```

## Échéancier

### `echeancier(e, reduire = e.reduction) → résultat`

Champs renvoyés :

- `lignes[]` : `{mois, date, paiement, interet, principal, assurance, reste, reduit, reduction, revise, differe, ra?, test?, ratio?, int36?}`.
  `ra = {montant, indemnite, reste, limite}` ; `test = {ratio, ok}` porte le
  contrôle des 8 % fait avant l'échéance suivante.
- `M1` : première échéance hors différé. `M2` : échéance après la 1re
  réduction de taux. `ta2` : taux réduit.
- `paliers[] {mois, M, taux}`, `reductions[] {mois, date, avant, apres, ratio, interets, reste, M}`, `ras[] {mois, date, montant, indemnite, limite}`.
- Totaux : `totI`, `totP`, `totM` (tout ce qui est payé, assurance et indemnités compris), `totAss`, `totIndem`, `totRA`, `frais`,
  `coutTotal` (= C + intérêts + assurance + indemnités + frais), `coutCredit` (le même sans le capital).
- `n` (nombre d'échéances réel), `nPrevu`, `C`, `p`, `amort`, `D` (échéances de différé), `diffTotal`, `tm`, `debut`,
  `reduc` (au moins une réduction), `reducDemandee`, `teg` (en %).

Règles :

- Différé partiel : intérêts seuls. Différé total : rien n'est payé et les
  intérêts s'ajoutent au capital.
- Assurance de chaque échéance = (capital initial ou capital restant dû avant l'échéance) × taux × p ÷ 12.
- Variation du taux : le taux plancher est 0. L'échéance est recalculée dès que le taux change.
- Remboursement anticipé : limité au capital restant dû (`limite`). En mode `duree`,
  la durée est raccourcie et l'échéance reste la même. En mode `mensualite`, la durée reste
  la même et l'échéance est recalculée. Pour un crédit in fine, le capital baisse et l'échéance (les intérêts) suit.
- **Réduction de moitié du taux** (`reduire` et durée, ou `dureeTotale`, > 84 mois) :
  avant l'échéance 37 (36/p + 1), on calcule intérêts des 36 derniers mois ÷ capital restant dû.
  Si ce ratio est **strictement** supérieur à 8 %, le taux est divisé par deux. Sinon, le test est
  refait à chaque échéance (fenêtre glissante). Après une réduction, le test suivant a lieu 36 mois plus tard.

### Fonctions associées

| Signature | Renvoie |
|---|---|
| `teg(res)` | TEG en % : taux de période actuariel × périodes par an (dichotomie, NaN si aucune racine) |
| `agregerAnnuel(res)` | `[{annee, debut, fin, paiement, interet, principal, assurance, reste, reduit, differe, nb, ra}]` |
| `valeurActuelle(res, inflationPct)` | valeur actuelle des paiements, plus les frais |
| `resteFin(l)` / `totalLigne(l)` / `premiereLigne(res)` | CRD après RA / échéance + assurance / 1re ligne hors différé |
| `fraisTotal(e)` | total des frais, arrondi |
| `remboursementAnticipe(e, reduire?)` | `{avec, sans, totRA, totIndem, economie, gainNet, effet: 'solde'\|'duree'\|'mensualite'\|null, soldeApres?, nouvelleDuree?, ancienneDuree?, moisGagnes?, echeanceApres?, echeanceSans?, limite}` |
| `analyseReduction(e)` | `{modalitesOk, dureeOk, ratio37, reductions, eligible, economie, avec, sans}` |
| `sensibiliteTmm(e, reduire?, ecarts = [-1,-0.5,0,0.5,1,2])` | `[{d, tmm, taux, M, dM, I, dI}]`, ou `null` sans `e.tmm` |

Utilitaires : `arrondi`, `arrondi6`, `pmt(r, n, pv)`, `mensualite(cap, tmPct, n)`,
`tauxMensuelPct(ta)`, `tauxPeriodePct(ta, p)`, `nombreEcheances(r, M, P)`,
`lireDate(s)`, `infoPeriodicite(p)`, `appliquerPreset(cle, agence?) → {type, annees, mois, taux, tmm}`,
`tauxTmm(tmm, marge)`.

## Emprunteur

### `capaciteEmprunt(o)`

Entrée : `{base: 'net'|'brut', revenuNet, revenuBrut, quotite = 0.40, charges = 0, dureeMois, tauxAnnuelPct, ageActuel?, ageMax = 70}`.

- `mensualiteMax` = revenu de la base choisie × quotité − charges.
- `capital` (= `montant`) = valeur actuelle de `mensualiteMax` sur `dureeMois`
  au taux annuel ÷ 12 (non arrondi, comme l'outil d'origine), arrondie au millime.
- Si `ageActuel` est fourni, la durée est plafonnée à `floor((ageMax − âge) × 12)` mois.

Renvoie `{valide, motif?, base, revenu, quotite, charges, capaciteEndettement, mensualiteMax, capital, montant, dureeDemandee, dureeMois, duree, dureeMaxAge, dureeLimiteeParAge, horsLimite}`.
`motif` vaut `'entrees-incompletes'` (`valide: false`), `'charges-trop-elevees'` ou `'age-max-atteint'`
(dans les deux derniers cas, `capital` vaut 0). `horsLimite` signale une durée de plus de 300 mois, que le simulateur refuse.

### `eligibilite(e, res?, regles = DEFAUTS)`

Renvoie `{apport: {pct, min, ok}, age: {fin, max, ok}, endettement: {taux, max, mensuel, ok}, resteAVivre: {montant, ok}, eligible}`.
Un critère sans données vaut `null`. `mensuel` est l'échéance hors différé, assurance comprise, ramenée au mois.
`resteAVivre.ok` vaut `null` s'il est positif (simple indication) et `false` sinon.

### `budgetGuide(g, regles?)`

Entrée : `g = {type, prix, apport, montant, ans, taux, revenus, charges, age}`.
Renvoie `{capital, resultat, endettement, ok, mensualiteMax?, capitalMax?, dureeNecessaire?, chargesTropElevees?, ageFin?, ageDepasse, apportInsuffisant}`, ou `null`.

## Outils

| Signature | Renvoie |
|---|---|
| `calculInverse({mode: 'capital'\|'duree'\|'taux', mensualite, capital?, mois?, taux?})` | `{capital, mois, taux, interets?, mensualiteReelle?}`, ou `{erreur: 'interets-non-couverts'\|'plus-de-300-mois'\|'mensualite-trop-faible'\|'taux-superieur-100'}`, ou `null` si une entrée manque |
| `planFinancement(prets[{nom?, capital, mois, taux, differe?}], {lisser?})` | `{prets, ignores, echeanciers, nMax, paliers[{debut, fin, total, det[]}], totalMois[], capitalTotal, totI, totISansLissage, lissage: {T, lignes, totI, negatif, surcout, principal}\|null, messageLissage: null\|'differe-principal'\|'lissage-impossible'}` |
| `comparerOffres({capital, mois, offres[{nom?, taux, fraisDossierPct?, fraisFixes?, assurancePct?, assuranceBase?}]})` | `{offres[{i, nom, entree, resultat, mensualite, assurance1, mensualiteAvecAssurance, interets, coutAssurance, frais, coutCredit, teg}], meilleure, seconde, economie}` |
| `renegociation({crd, tauxActuel, moisRestants, nouveauTaux, nouvelleDuree?, indemnitePct?, fraisDossier?, fraisGarantie?, financer?})` | `{cout, actuel, nouveau, capitalNouveau, totalActuel, totalNouveau, economie, rentable, gainMensuel, pointMort, dureePlusLongue}` |
| `monteCarloTmm({capital, mois, tmm, marge, volatilite, tendance=0, plancher=0, seuil=∞, n=1000, graine=20261001})` | `{interets[], tI, tM, bandes[{p5, p25, p50, p75, p95}], probaDepasse, n, interetsMedian, interetsP95, mensualiteMaxMediane, mensualiteMaxP90, interetsSansVariation}`. Les résultats sont reproductibles pour une même graine. |
| `louerOuAcheter({prix, apport, fraisPct, taux, ans, chargesPct, loyer, hausseLoyerPct, revalorisationPct, rendementPct})` | `{mensualite, echeancier, points[{an, achat, location}], pointMort, ecart, verdict: 'acheter'\|'louer'}` |
| `optimiser({prix, apportMax, budget, epargne?, indemnite?, taux, reduction=true, dateDebut?, assurance?, frais?, actuel?: {apport, mois}})` | `{tous, ok, front, meilleure, solutions, actuel, economieVsActuel}`, ou `{erreur: 'valeurs-invalides'\|'aucune-combinaison'}`. Chaque élément vaut `{o, C, r, M, cout, duree, red, ok}`. |
| `quandDemanderReduction(e, k?)` | `{eligible: true, base, ratios[[k, %]], zones[[début, fin]], premiere, k, date, ratio, recevable, mensualiteActuelle, nouvelleMensualite?, economie?, prochaine?}`, ou `{eligible: false, motif}` |
| `monCredit({capital, date, mois, taux, dureeTotale?, reduction=true}, aujourdhui?)` | `{resultat, passees, crd, pctRembourse, prochaine, restantes, interetsRestants, reductions}`, ou `null` |
| `comparerAB(resA, resB)` | `{indicateurs[{cle, a, b, meilleur: 'a'\|'b'\|null}], crdA, crdB, cumulA, cumulB, ecart[[mois, B−A]]}` |
| `calendrier(res, aujourdhui?)` | `[{annee, cases[12]: null\|{mois, part, interet, principal, ra, reduction, courant}}]` |
| `generateurAleatoire(graine)` / `centile(trie, p)` | générateur mulberry32 qui renvoie une valeur de [0 ; 1[ / centile par interpolation |

## Lien de partage

- `encoderLien(e, {reduc}) → 'c=…&m=…&t=…'` : paramètres de l'original, sans l'adresse.
- `decoderLien(chaine | URLSearchParams) → valeurs | null` : accepte « ?… », une adresse
  complète et l'ancien format `ra`/`rm`. Les contrôles sont ceux de l'original (durée de 1 à 300 mois,
  multiple de la périodicité, frais de dossier ≤ 10 %, au plus 10 remboursements anticipés, etc.).
  Une option absente vaut `null`.
