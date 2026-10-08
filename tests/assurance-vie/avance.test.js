'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../public/outils/assurance-vie/js/scenario.js');
const P = require('../../public/outils/assurance-vie/js/projection.js');
const MC = require('../../public/outils/assurance-vie/js/montecarlo.js');
const St = require('../../public/outils/assurance-vie/js/strategie.js');
const Ct = require('../../public/outils/assurance-vie/js/contrats.js');
const Cal = require('../../public/outils/assurance-vie/js/calendrier.js');
const Th = require('../../public/outils/assurance-vie/js/theme.js');

const proche = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const base = (x) => Object.assign(S.defauts(), { revenu: 60000, versement: 500 }, x || {});

/* ---------- Projection : rendements annuels ---------- */
test('projection : rendements année par année = rendement constant quand ils sont égaux', () => {
  const p = { versement: 100, periodesParAn: 12, dureeAns: 5, rendementPct: 6, fraisPct: 1 };
  proche(P.projeter(Object.assign({}, p, { rendementsAnnuels: [6, 6, 6, 6, 6] })).capitalFinal, P.projeter(p).capitalFinal);
  assert.ok(P.projeter(Object.assign({}, p, { rendementsAnnuels: [0, 0, 0, 0, 20] })).capitalFinal > 0);
});

/* ---------- Monte-Carlo ---------- */
test('Monte-Carlo : volatilité nulle = projection médiane exacte', () => {
  const c = S.calculer(base({ versementCea: 200 }));
  const m = MC.simuler(c, { trajectoires: 200, volatiliteAv: 0, volatiliteCea: 0 });
  proche(m.finalP10, c.med.capitalFinal, 1e-6);
  proche(m.finalP90, c.med.capitalFinal, 1e-6);
});

test('Monte-Carlo : reproductible, centiles ordonnés, probabilités entre 0 et 100', () => {
  const c = S.calculer(base({ versementCea: 300, dureeAns: 15 }));
  const o = { trajectoires: 1000, volatiliteAv: 2, volatiliteCea: 15, objectif: 100000 };
  const a = MC.simuler(c, o), b = MC.simuler(c, o);
  assert.deepEqual(a.centiles.p50, b.centiles.p50);
  for (let y = 0; y <= 15; y++) {
    assert.ok(a.centiles.p10[y] <= a.centiles.p25[y] + 1e-9 && a.centiles.p25[y] <= a.centiles.p50[y] + 1e-9);
    assert.ok(a.centiles.p50[y] <= a.centiles.p75[y] + 1e-9 && a.centiles.p75[y] <= a.centiles.p90[y] + 1e-9);
  }
  assert.ok(a.finalP10 < a.finalP90);
  assert.ok(a.probaObjectif >= 0 && a.probaObjectif <= 100);
  assert.ok(a.probaVersements >= 0 && a.probaVersements <= 100);
  assert.equal(a.annees.length, 16);
});

test('Monte-Carlo : le taux garanti protège l\'assurance vie', () => {
  const c = S.calculer(base({ rendementPct: 5, tauxGarantiPct: 5 }));
  const m = MC.simuler(c, { trajectoires: 500, volatiliteAv: 10, volatiliteCea: 0 });
  assert.ok(m.finalP10 >= c.med.capitalFinal - 1e-6);
});

test('Monte-Carlo : quantile et loi normale', () => {
  assert.equal(MC.quantile([1, 2, 3, 4, 5], 0.5), 3);
  proche(MC.quantile([0, 10], 0.25), 2.5);
  const alea = MC.generateur(1);
  let s = 0, s2 = 0;
  for (let i = 0; i < 20000; i++) { const z = MC.normale(alea); s += z; s2 += z * z; }
  assert.ok(Math.abs(s / 20000) < 0.03);
  assert.ok(Math.abs(s2 / 20000 - 1) < 0.05);
});

test('Monte-Carlo : scénario inactif → null', () => {
  assert.equal(MC.simuler(S.calculer(S.defauts()), {}), null);
});

/* ---------- Stratégie ---------- */
test('stratégie : jamais de CEA les 5 dernières années', () => {
  const st = St.optimiser(S.calculer(base({ versementCea: 300, dureeAns: 10, rendementCeaPct: 15 })));
  st.plan.forEach((l) => { if (l.annee > 5) assert.equal(l.cea, 0, `année ${l.annee}`); });
  assert.ok(st.plan[0].cea > 0, 'le CEA, plus rentable, est retenu tant qu\'il est permis');
});

test('stratégie : même budget, au moins aussi bon que la répartition saisie', () => {
  [base({ versementCea: 400 }), base(), base({ versementCea: 900, versement: 100, dureeAns: 15 })].forEach((e) => {
    const st = St.optimiser(S.calculer(e));
    assert.ok(st.gain >= -1e-6);
    st.plan.forEach((l) => proche(l.av + l.cea, l.budget, 1e-6));
  });
});

test('stratégie : rendements égaux → l\'assurance vie (plancher 45 %) est préférée au CEA (60 %)', () => {
  const st = St.optimiser(S.calculer(base({ versement: 2000, versementCea: 2000, rendementCeaPct: 6, fraisCeaPct: 1, dureeAns: 12 })));
  assert.ok(st.plan[0].av >= st.plan[0].cea);
});

test('stratégie : durée inférieure à 8 ans signalée', () => {
  assert.equal(St.optimiser(S.calculer(base({ dureeAns: 6 }))).avValable, false);
  assert.equal(St.optimiser(S.calculer(base({ dureeAns: 8 }))).avValable, true);
});

/* ---------- Comparateur de contrats ---------- */
test('contrats : l\'offre la moins chère et la mieux rémunérée est la meilleure', () => {
  const c = S.calculer(base());
  const r = Ct.comparer(c, [
    { nom: 'A', tauxServi: 6, tauxGaranti: 2, fraisGestion: 1, fraisVersement: 0 },
    { nom: 'B', tauxServi: 6, tauxGaranti: 2, fraisGestion: 0.5, fraisVersement: 0 },
    { nom: 'C', tauxServi: 6, tauxGaranti: 2, fraisGestion: 1, fraisVersement: 3 }
  ]);
  assert.equal(r.find((x) => x.meilleur).nom, 'B');
  assert.ok(r[2].frais > r[0].frais && r[0].frais > r[1].frais);
  assert.ok(r[0].capitalGaranti < r[0].capital);
  assert.equal(r[1].ecart, 0);
});

test('contrats : offre invalide ignorée', () => {
  const r = Ct.comparer(S.calculer(base()), [{ nom: 'X', tauxServi: 4, tauxGaranti: 5, fraisGestion: 1, fraisVersement: 0 }, { nom: 'Y', tauxServi: 4, tauxGaranti: 1, fraisGestion: 1, fraisVersement: 0 }]);
  assert.equal(r[0].valide, false);
  assert.equal(r[1].meilleur, true);
});

/* ---------- Calendrier ---------- */
test('calendrier : fichier iCalendar valide (versements, 8 ans, blocages CEA, terme)', () => {
  const ics = Cal.generer(base({ versementCea: 200, dureeAns: 10 }), { debut: new Date(2026, 9, 5), maintenant: new Date(Date.UTC(2026, 9, 1)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=120'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20341005'), 'les 8 ans');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20311231'), 'fin de blocage des dépôts 2026');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20361005'), 'terme');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  ics.split('\r\n').forEach((l) => assert.ok(Buffer.byteLength(l) <= 75, l));
});

test('calendrier : échappement et repli des lignes longues', () => {
  const l = Cal.plier('DESCRIPTION:' + 'é'.repeat(100));
  l.split('\r\n').forEach((x) => assert.ok(Buffer.byteLength(x) <= 75));
  assert.equal(l.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'é'.repeat(100));
  const ics = Cal.generer(base({ frequence: 'Trimestriel' }), { debut: new Date(2026, 0, 1), t: (s, v) => s.replace(/\{(\d+)\}/g, (m, i) => v[i]) + ';,' });
  assert.ok(ics.includes('\;\\,'));
  assert.ok(ics.includes('FREQ=MONTHLY;INTERVAL=3;COUNT=40'));
});

/* ---------- Thème ---------- */
test('thème : palette lisible (contraste ≥ 4,5 sur blanc), couleur invalide → null', () => {
  ['#4f46e5', '#ffee00', '#00ff88', '#0f766e', '#c026d3', '#ffffff'].forEach((h) => {
    const p = Th.palette(h);
    assert.ok(p.contrasteBlanc >= 4.5, h + ' ' + p.contrasteBlanc);
    assert.match(p.principale, /^#[0-9a-f]{6}$/);
  });
  assert.equal(Th.palette('rouge'), null);
  assert.equal(Th.palette('#12345'), null);
});
