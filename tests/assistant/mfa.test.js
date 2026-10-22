'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dossier = path.resolve(__dirname, '../../supabase/functions');
const chemin = path.join(dossier, 'assistant/mfa.js');
const charger = () => import(chemin);

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jeton = (charge) => b64url({ alg: 'HS256' }) + '.' + b64url(charge) + '.signature';
const verifie = { factors: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] };

test('niveauDuJeton : aal2 seulement si la charge utile le dit', async () => {
  const M = await charger();
  assert.equal(M.niveauDuJeton(jeton({ sub: 'u', aal: 'aal2' })), 'aal2');
  assert.equal(M.niveauDuJeton(jeton({ sub: 'u', aal: 'aal1' })), 'aal1');
  assert.equal(M.niveauDuJeton(jeton({ sub: 'u' })), 'aal1');
  // Charge utile dont la longueur exige du remplissage base64.
  assert.equal(M.niveauDuJeton(jeton({ sub: 'abcd', aal: 'aal2', x: 'é' })), 'aal2');
  for (const v of [undefined, null, '', 'abc', 'a.b.c', 'a.!!!.c', 'a.' + b64url('texte') + '.c']) {
    assert.equal(M.niveauDuJeton(v), 'aal1');
  }
});

test('mfaManquante : sans facteur vérifié, rien ne change', async () => {
  const M = await charger();
  const aal1 = jeton({ sub: 'u', aal: 'aal1' });
  assert.equal(M.mfaManquante(aal1, { factors: [] }), false);
  assert.equal(M.mfaManquante(aal1, {}), false);
  assert.equal(M.mfaManquante(aal1, null), false);
  assert.equal(M.mfaManquante(aal1, { factors: [{ status: 'unverified' }] }), false);
});

test('mfaManquante : avec facteur vérifié, aal1 refusé, aal2 accepté', async () => {
  const M = await charger();
  assert.equal(M.mfaManquante(jeton({ sub: 'u', aal: 'aal1' }), verifie), true);
  assert.equal(M.mfaManquante(jeton({ sub: 'u' }), verifie), true);
  assert.equal(M.mfaManquante('illisible', verifie), true);
  assert.equal(M.mfaManquante(jeton({ sub: 'u', aal: 'aal2' }), verifie), false);
  assert.match(M.MESSAGE_MFA, /Double authentification/);
});

test('les trois copies de mfa.js sont identiques et branchées', () => {
  const ref = fs.readFileSync(chemin, 'utf8');
  for (const f of ['paiement', 'rappels-email']) {
    assert.equal(fs.readFileSync(path.join(dossier, f, 'mfa.js'), 'utf8'), ref, f + '/mfa.js diffère');
  }
  for (const f of ['paiement', 'assistant', 'rappels-email']) {
    const src = fs.readFileSync(path.join(dossier, f, 'index.ts'), 'utf8');
    assert.match(src, /from "\.\/mfa\.js"/, f + ' n\'importe pas mfa.js');
    assert.match(src, /mfaManquante\(/, f + ' ne vérifie pas la double authentification');
  }
});

test('migration 0019 : table protégée, reprise, double authentification', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0019_profil_protege.sql'), 'utf8');
  assert.match(sql, /create table public\.profils_financiers/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /"mfa_aal2" on public\.profils_financiers as restrictive/);
  assert.match(sql, /insert into public\.profils_financiers \(user_id, donnees\)\s+select/);
  assert.match(sql, /revoke all on function public\.profil_de\(uuid\) from public, anon, authenticated/);
  for (const f of ['rappels_mon_etat', 'rappels_plan_enregistrer', 'rappels_reactiver']) {
    const corps = sql.split('function public.' + f + '(')[1].split('$$;')[0];
    assert.match(corps, /if not public\.mfa_ok\(\) then raise exception/, f);
  }
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /raw_user_meta_data - 'orbite'/, 'la purge est réservée à 0020');
});
