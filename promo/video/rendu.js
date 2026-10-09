/* Rendu des images : node rendu.js <v|h> preview t1 t2 …  |  node rendu.js <v|h> all <fps> <sortie.mp4> */
const { chromium } = require("/home/user/portail-rh/node_modules/playwright-core");
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const DIR = __dirname;
const [fmt, mode, ...rest] = process.argv.slice(2);
const W = fmt === "h" ? 1920 : 1080, H = fmt === "h" ? 1080 : 1920;

const srv = http.createServer((q, r) => {
  const f = path.join(DIR, decodeURIComponent(q.url.split("?")[0]));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  const t = { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(f)] || "application/octet-stream";
  r.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(r);
}).listen(0);

async function page(browser) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on("pageerror", e => console.error("ERR", e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/scene.html`);
  await p.evaluate(f => window.setup(f), fmt);
  return p;
}
const grab = (p, t) => p.evaluate(t => { window.render(t); return document.getElementById("c").toDataURL("image/jpeg", 0.96).split(",")[1]; }, t)
  .then(b => Buffer.from(b, "base64"));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--disable-gpu-vsync"] });
  if (mode === "preview") {
    const p = await page(browser); fs.mkdirSync(path.join(DIR, "apercu"), { recursive: true });
    for (const t of rest.map(Number)) fs.writeFileSync(path.join(DIR, "apercu", `${fmt}-${t.toFixed(2)}.jpg`), await grab(p, t));
  } else {
    const fps = Number(rest[0] || 60), out = rest[1], N = Math.round(30 * fps), WK = 4;
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(fps), out], { stdio: ["pipe", "inherit", "inherit"] });
    const pages = await Promise.all(Array.from({ length: WK }, () => page(browser)));
    const buf = new Map(); let next = 0, issued = 0; const t0 = Date.now();
    async function flush() { while (buf.has(next)) { const b = buf.get(next); buf.delete(next); if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once("drain", r)); next++;
      if (next % 120 === 0) console.log(`${fmt} ${next}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } }
    let chain = Promise.resolve();
    await Promise.all(pages.map(async p => { while (issued < N) { const i = issued++; buf.set(i, await grab(p, i / fps)); chain = chain.then(flush); await chain; } }));
    await chain; ff.stdin.end(); await new Promise(r => ff.on("close", r));
    console.log("ok", out, ((Date.now() - t0) / 1000).toFixed(0) + "s");
  }
  await browser.close(); srv.close();
})();
