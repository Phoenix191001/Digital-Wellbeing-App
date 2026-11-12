// Local test server: static files + /api/community (memory store, or "off" mode to test the fallback).
const http = require("http"), fs = require("fs"), path = require("path");
if (process.env.MODE !== "off") process.env.PAUSE_MEMORY_STORE = "1";
process.env.MOD_PASSCODE = "test-pass";
const handler = require("../api/community.js"), root = path.join(__dirname, "..");
// Reminders: real VAPID keys, but pushes are captured instead of sent (see GET /__push-sent)
const webpush = require("web-push"), vk = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = vk.publicKey; process.env.VAPID_PRIVATE_KEY = vk.privateKey;
const pushSent = []; webpush.sendNotification = async (sub, payload) => { pushSent.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); return {}; };
const pushHandler = require("../api/push.js"), { memoryStore } = require("../api/_lib.js");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  if (req.url === "/__push-sent") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(pushSent)); }
  if (req.url === "/__push-subs") { return memoryStore.smembers("pushsubs").then(async ids => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(await Promise.all(ids.map(async i => JSON.parse(await memoryStore.get("push:" + i)))))); }); }
  if (req.url.startsWith("/api/push")) { let d = ""; req.on("data", c => d += c); req.on("end", () => { try { req.body = JSON.parse(d); } catch { req.body = null; } pushHandler(req, res); }); return; }
  if (req.url.startsWith("/api/community")) { let d = ""; req.on("data", c => d += c); req.on("end", () => { try { req.body = JSON.parse(d); } catch { req.body = null; } handler(req, res); }); return; }
  const f = path.join(root, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end("nf"); }
  res.setHeader("Content-Type", T[path.extname(f)] || "text/plain"); fs.createReadStream(f).pipe(res);
}).listen(+process.env.PORT || 8124);
