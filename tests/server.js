// Local test server: static files + /api/community (memory store, or "off" mode to test the fallback).
const http = require("http"), fs = require("fs"), path = require("path");
if (process.env.MODE !== "off") process.env.PAUSE_MEMORY_STORE = "1";
process.env.MOD_PASSCODE = "test-pass";
const handler = require("../api/community.js"), root = path.join(__dirname, "..");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  if (req.url.startsWith("/api/community")) { let d = ""; req.on("data", c => d += c); req.on("end", () => { try { req.body = JSON.parse(d); } catch { req.body = null; } handler(req, res); }); return; }
  const f = path.join(root, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end("nf"); }
  res.setHeader("Content-Type", T[path.extname(f)] || "text/plain"); fs.createReadStream(f).pipe(res);
}).listen(+process.env.PORT || 8124);
