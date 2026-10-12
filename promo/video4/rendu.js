/* Rendu de la vidéo 4 (30 s, 16:9).
   Aperçus :   node rendu.js preview [--h 1080] t1 t2 …          → apercu/t-XX.XX.jpg
   Vidéo :     node rendu.js all <fps> <sortie.mp4> [onglets] [hauteur]
               (ajoute musique.wav s'il existe ; ex. aperçu rythme : node rendu.js all 30 apercu/apercu-540p.mp4 4 540) */
const { chromium } = require("/home/user/portail-rh/node_modules/playwright-core");
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const DIR = __dirname;
let [mode, ...rest] = process.argv.slice(2);
let HT = 1080;
if (mode === "preview" && rest[0] === "--h") { HT = Number(rest[1]); rest = rest.slice(2); }
if (mode === "all" && rest[3]) HT = Number(rest[3]);
const H = HT, W = Math.round(H * 16 / 9);

const srv = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split("?")[0]));
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const t = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2", ".js": "text/javascript" }[path.extname(f)] || "application/octet-stream";
  r.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(r);
}).listen(0);

async function page(browser) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on("pageerror", e => console.error("ERR", e.message));
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.error("console:", m.text()); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/scene.html`);
  const info = await p.evaluate(o => window.setup(o), { w: W, h: H });
  return [p, info];
}
const grab = (p, t) => p.evaluate(t => { window.render(t); return document.getElementById("c").toDataURL("image/jpeg", 0.95).split(",")[1]; }, t)
  .then(b => Buffer.from(b, "base64"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--disable-gpu-vsync", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  if (mode === "preview") {
    const [p, info] = await page(browser); console.log("pixels du logo :", info.pixels);
    fs.mkdirSync(path.join(DIR, "apercu"), { recursive: true });
    for (const t of rest.map(Number)) { const t0 = Date.now(); fs.writeFileSync(path.join(DIR, "apercu", `t-${t.toFixed(2).padStart(5, "0")}.jpg`), await grab(p, t)); console.log(t, (Date.now() - t0) + " ms"); }
  } else {
    const fps = Number(rest[0] || 60), out = rest[1], N = Math.round(30 * fps), WK = Math.min(4, Number(rest[2] || 4));
    const audio = path.join(DIR, "musique.wav"), avecSon = fs.existsSync(audio);
    const args = ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-"];
    if (avecSon) args.push("-i", audio);
    args.push("-map", "0:v");
    if (avecSon) args.push("-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest");
    args.push("-c:v", "libx264", "-preset", H >= 1080 ? "slow" : "medium", "-crf", H >= 1080 ? "16" : "20", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", out);
    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
    /* onglets ouverts l'un après l'autre : ouverts ensemble, ils se bloquent sous SwiftShader */
    const pages = []; for (let i = 0; i < WK; i++) pages.push((await page(browser))[0]);
    const buf = new Map(); let next = 0, issued = 0; const t0 = Date.now();
    async function flush() { while (buf.has(next)) { const b = buf.get(next); buf.delete(next); if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once("drain", r)); next++;
      if (next % 60 === 0) console.log(`${next}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)} s`); } }
    let chain = Promise.resolve();
    await Promise.all(pages.map(async p => { while (issued < N) { const i = issued++; buf.set(i, await grab(p, i / fps)); chain = chain.then(flush); await chain; } }));
    await chain; ff.stdin.end(); await new Promise(r => ff.on("close", r));
    console.log("ok", out, ((Date.now() - t0) / 1000).toFixed(0) + " s", (((Date.now() - t0) / N) * WK / 1000).toFixed(2) + " s/image/onglet");
  }
  await browser.close(); srv.close();
})();
