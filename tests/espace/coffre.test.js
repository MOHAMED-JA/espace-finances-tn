/* Lot C (17 oct. 2026) : coffre à documents chiffré sur l'appareil. Documents fictifs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../../public/espace/js/coffre-calcul.js');

test('chiffrement sur l\'appareil : clé non exportable, aller-retour, contenu illisible, falsification refusée', async () => {
  const cle = await K.nouvelleCle();
  assert.equal(cle.extractable, false);
  await assert.rejects(globalThis.crypto.subtle.exportKey('raw', cle));
  const octets = new TextEncoder().encode('Fiche de paie fictive : septembre 2026');
  const b = await K.chiffrer(cle, octets);
  assert.equal(b.iv.length, 12);
  assert.ok(!Buffer.from(b.data).toString('utf8').includes('Fiche'));
  assert.equal(new TextDecoder().decode(await K.dechiffrer(cle, b)), 'Fiche de paie fictive : septembre 2026');
  b.data[0] ^= 1;
  await assert.rejects(K.dechiffrer(cle, b), 'contenu modifié refusé');
  const j = await K.chiffrerJson(cle, { titre: 'Contrat auto' });
  assert.deepEqual(await K.dechiffrerJson(cle, j), { titre: 'Contrat auto' });
});

test('sauvegarde chiffrée par mot de passe : restaurée avec le bon, refusée avec un autre', async () => {
  const docs = [{ fiche: { id: 'd1', cat: 'assurances', titre: 'Contrat auto', nom: 'auto.pdf', type: 'application/pdf', taille: 5, date: '2026-12-20', quoi: 'Assurance auto : fin' }, octets: new Uint8Array([1, 2, 3, 4, 5]) }];
  const f = await K.sauvegarde('motdepasse123', docs, 1000);
  const obj = JSON.parse(f);
  assert.equal(obj.format, 'orbite-coffre-1');
  assert.ok(!f.includes('Contrat auto') && !f.includes('auto.pdf'), 'rien de lisible dans le fichier');
  const r = await K.restaurer('motdepasse123', f);
  assert.equal(r[0].fiche.titre, 'Contrat auto');
  assert.deepEqual(Array.from(r[0].octets), [1, 2, 3, 4, 5]);
  await assert.rejects(K.restaurer('autremotdepasse1', f), /mot de passe/);
  await assert.rejects(K.restaurer('motdepasse123', '{"format":"autre"}'), /format/);
  assert.equal(K.forceMotDePasse('court1'), '10 caractères au moins.');
  assert.equal(K.forceMotDePasse('seulementdeslettres'), 'Mélangez lettres et chiffres.');
  assert.equal(K.forceMotDePasse('lettres et 2 chiffres'), null);
});

test('dates importantes repérées dans un texte, « à ne pas oublier », rangement par thème', () => {
  const t = 'Contrat n° 12 du 03/01/2026. Date d\'échéance : 20/12/2026. Imprimé le 5 octobre 2026. Valable jusqu\'au 31 décembre 2027.';
  assert.deepEqual(K.datesDans(t, '2026-10-17'), ['2026-12-20', '2027-12-31']);
  assert.deepEqual(K.datesDans('aucune date', '2026-10-17'), []);
  const fiches = [K.normaliserFiche({ id: 'd1', cat: 'assurances', titre: 'Contrat auto', date: '2026-12-20', quoi: 'Assurance auto : fin' }),
    K.normaliserFiche({ id: 'd2', cat: 'paie', titre: 'Fiche sept.', ajoute: '2026-10-01' }), K.normaliserFiche({ id: 'd3', cat: 'xx', titre: '<b>x</b>' })];
  assert.equal(fiches[2].cat, 'autres');
  assert.equal(fiches[2].titre, 'bx/b');
  const l = K.aNePasOublier(fiches, '2026-11-02');
  assert.deepEqual(l.map((x) => x.cle), ['doc-d1', 'attestation-2026']);
  assert.equal(l[0].jours, 48);
  assert.deepEqual(K.aNePasOublier(fiches, '2026-06-01').map((x) => x.cle), [], 'trop loin, pas la saison des attestations');
  assert.deepEqual(K.aNePasOublier(fiches, '2026-11-02', { salarie: false }).map((x) => x.cle), ['doc-d1']);
  const c = K.parCategorie(fiches);
  assert.equal(c.find((x) => x.cle === 'paie').n, 1);
  assert.equal(K.verifierFichier({ size: 16 * 1024 * 1024 }, 0), 'Fichier trop lourd : 15 Mo au plus.');
  assert.equal(K.verifierFichier({ size: 10 }, 200), 'Le coffre est plein : 200 documents au plus.');
});
