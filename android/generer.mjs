// Orbite — régénère le projet Android (Trusted Web Activity) à partir du manifeste du site.
// Usage (depuis la racine du dépôt) : servir public/ sur le port 8099
//   (python3 -m http.server 8099 --directory public), puis : node android/generer.mjs ./android-neuf
// Nécessite @bubblewrap/core (npm i @bubblewrap/core@1 dans un dossier de travail).
import { TwaManifest, TwaGenerator, ConsoleLog } from '@bubblewrap/core';
const hote = 'espace-finances-tn.jaouadimohamedaziz.workers.dev';
const url = new URL(`https://${hote}/manifest.webmanifest`);
const json = await (await fetch('http://localhost:8099/manifest.webmanifest')).json();
const m = TwaManifest.fromWebManifestJson(url, json);
Object.assign(m, {
  packageId: 'tn.orbite.app', name: 'Orbite', launcherName: 'Orbite',
  startUrl: '/espace/', appVersionCode: 1, appVersionName: '1.0.0',
  fallbackType: 'customtabs', enableNotifications: false, orientation: 'portrait',
  signingKey: { path: './cle-envoi-orbite.jks', alias: 'orbite' },
});
m.generatorApp = 'bubblewrap-core';
const local = (u) => u && u.replace(`https://${hote}`, 'http://localhost:8099');
const iconeOrig = m.iconUrl, masqOrig = m.maskableIconUrl;
const wm = m.webManifestUrl; m.webManifestUrl = new URL('http://localhost:8099/manifest.webmanifest');
m.iconUrl = local(m.iconUrl); m.maskableIconUrl = local(m.maskableIconUrl);
m.shortcuts.forEach((s) => { s.chosenIconUrl = local(s.chosenIconUrl); });
const err = m.validate(); if (err) throw new Error(err);
await new TwaGenerator().createTwaProject(process.argv[2], m, new ConsoleLog('twa'));
m.webManifestUrl = wm; m.iconUrl = iconeOrig; m.maskableIconUrl = masqOrig; m.shortcuts.forEach((s) => { s.chosenIconUrl = s.chosenIconUrl.replace('http://localhost:8099', `https://${hote}`); });
await m.saveToFile(process.argv[2] + '/twa-manifest.json');
// Le projet garde l'adresse publique du manifeste (et non celle du serveur local).
const fs = await import('node:fs');
const bg = process.argv[2] + '/app/build.gradle';
fs.writeFileSync(bg, fs.readFileSync(bg, 'utf8').replaceAll('http://localhost:8099', `https://${hote}`));
console.log('ok', m.packageId, m.themeColor?.hex?.(), m.shortcuts?.length);
