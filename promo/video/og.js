const { chromium } = require("/home/user/portail-rh/node_modules/playwright-core");
const http = require("http"), fs = require("fs"), path = require("path"), DIR = __dirname;
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": { ".html": "text/html", ".png": "image/png", ".woff2": "font/woff2" }[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(0);
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const p = await b.newPage({ viewport: { width: 1920, height: 1005 } });
  p.on("pageerror", e => console.error("ERR", e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/scene.html`); await p.evaluate(() => window.setup("og"));
  const d = await p.evaluate(() => { window.poster(); return document.getElementById("c").toDataURL("image/png").split(",")[1]; });
  fs.writeFileSync(path.join(DIR, "og-grand.png"), Buffer.from(d, "base64")); await b.close(); srv.close();
})();
