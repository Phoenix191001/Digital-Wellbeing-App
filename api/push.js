// Push reminders.  GET /api/push -> { publicKey, ready }
// POST { action: subscribe | update | unsubscribe | test | tick }
// "tick" is called every minute by Supabase pg_cron (see supabase-reminders.sql) and sends whatever is due.
// Stored per device (only if the student turns reminders on): the push subscription, time zone,
// reminder choices, bedtime and the end time of a running timer. No names, no content, no tracking.
const L = require("./_lib");
const webpush = require("web-push");
const { crypto } = L;

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const P = s => (s ? JSON.parse(s) : null);
const ALLOWED_PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/];
const MAX_SUBS = 5000;

function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://pause-gamma.vercel.app", pub, priv);
  return pub;
}
function validSub(sub) {
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === "https:" && ALLOWED_PUSH_HOSTS.some(r => r.test(u.hostname)) && typeof sub.keys?.p256dh === "string" && typeof sub.keys?.auth === "string" && sub.endpoint.length < 1000;
  } catch { return false; }
}
const validTz = tz => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string" && tz.length < 60; } catch { return false; } };
const hhmm = v => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "");
const clip = (v, n) => String(v || "").slice(0, n);
function cleanPrefs(p = {}) { return { timer: p.timer !== false, wind: p.wind !== false, daily: hhmm(p.daily), bedtime: hhmm(p.bedtime) || "23:30" }; }
function cleanTimers(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).slice(0, 3).filter(t => +t.at > now - 60000 && +t.at < now + 86400000)
    .map(t => ({ at: +t.at, title: clip(t.title, 80), body: clip(t.body, 160), tag: clip(t.tag, 30) || "timer", url: clip(t.url, 40).startsWith("/") ? clip(t.url, 40) : "/" }));
}
// minutes since local midnight + local date, in the student's time zone
function localNow(tz, at = Date.now()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
const toMins = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
// Is "target" (minutes) due now? 20-minute window so one missed cron minute doesn't lose the reminder.
const dueAt = (nowMins, target) => { const d = (nowMins - target + 1440) % 1440; return d < 20; };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
  const send = (code, o) => { res.statusCode = code; res.end(JSON.stringify(o)); };
  const store = L.getStore(), pub = vapid();
  if (req.method === "GET") return send(200, { publicKey: pub, ready: !!(store && pub) });
  if (req.method !== "POST") return send(405, { error: "method" });
  if (!store || !pub) return send(503, { error: "not_configured" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return send(400, { error: "bad_request" });
  try { return send(200, await handle(store, b)); }
  catch (e) { if (e.code) return send(e.code, { error: e.message }); console.error("push error", e.message); return send(500, { error: "server" }); }
};
const fail = (code, m) => { const e = new Error(m); e.code = code; throw e; };

async function own(store, b) {
  if (typeof b.endpoint !== "string") fail(400, "bad_request");
  const id = sha(b.endpoint), rec = P(await store.get("push:" + id));
  if (!rec || rec.sub.keys.auth !== b.auth) fail(404, "not_found"); // the auth secret proves it's this device
  return { id, rec };
}
async function deliver(store, id, rec, msg) {
  try {
    await webpush.sendNotification(rec.sub, JSON.stringify(msg), { TTL: 1800, urgency: "high", topic: (msg.tag || "x").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "x" });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await store.del("push:" + id); await store.srem("pushsubs", id); } // device unsubscribed
    else console.error("push send failed", e.statusCode || e.message);
    return false;
  }
}

async function handle(store, b) {
  switch (b.action) {
    case "subscribe": {
      if (!validSub(b.sub || {})) fail(400, "bad_subscription");
      if (!validTz(b.tz)) fail(400, "bad_tz");
      const ids = await store.smembers("pushsubs"); if (ids.length >= MAX_SUBS) fail(429, "full");
      const id = sha(b.sub.endpoint), old = P(await store.get("push:" + id));
      const rec = { sub: { endpoint: b.sub.endpoint, keys: { p256dh: b.sub.keys.p256dh, auth: b.sub.keys.auth } }, tz: b.tz, prefs: cleanPrefs(b.prefs), timers: cleanTimers(b.timers), sent: (old && old.sent) || {} };
      await store.set("push:" + id, JSON.stringify(rec)); await store.sadd("pushsubs", id);
      return { ok: true };
    }
    case "update": {
      const { id, rec } = await own(store, b);
      if (b.tz && validTz(b.tz)) rec.tz = b.tz;
      if (b.prefs) rec.prefs = cleanPrefs(b.prefs);
      if (b.timers) rec.timers = cleanTimers(b.timers);
      await store.set("push:" + id, JSON.stringify(rec));
      return { ok: true };
    }
    case "unsubscribe": {
      const { id } = await own(store, b);
      await store.del("push:" + id); await store.srem("pushsubs", id);
      return { ok: true };
    }
    case "test": {
      const { id, rec } = await own(store, b);
      const ok = await deliver(store, id, rec, { title: "سكون reminders are on ✅", body: "We'll nudge you when a timer ends and at wind-down time.", tag: "test", url: "/" });
      return { ok };
    }
    case "tick": {
      // Safe to call any time: it only sends what's due, once. Throttled so extra calls do nothing.
      const last = +(await store.get("push:lasttick")) || 0;
      if (Date.now() - last < 40000) return { skipped: true };
      await store.set("push:lasttick", String(Date.now()));
      let sent = 0;
      for (const id of await store.smembers("pushsubs")) {
        const rec = P(await store.get("push:" + id)); if (!rec) { await store.srem("pushsubs", id); continue; }
        const now = Date.now(), loc = localNow(rec.tz, now), out = [];
        const due = rec.timers.filter(t => t.at <= now + 20000);
        if (rec.prefs.timer) out.push(...due);
        rec.timers = rec.timers.filter(t => t.at > now + 20000);
        if (rec.prefs.wind && rec.sent.wind !== loc.date && dueAt(loc.mins, (toMins(rec.prefs.bedtime) - 30 + 1440) % 1440)) {
          out.push({ title: "🌙 Time to wind down", body: `Bedtime is ${rec.prefs.bedtime}. Charge your phone away from the bed and open your wind-down.`, tag: "wind", url: "/#/night" }); rec.sent.wind = loc.date;
        }
        if (rec.prefs.daily && rec.sent.daily !== loc.date && dueAt(loc.mins, toMins(rec.prefs.daily))) {
          out.push({ title: "⏸️ A quick pause?", body: "How's today? Take 10 seconds to check in with سكون.", tag: "daily", url: "/" }); rec.sent.daily = loc.date;
        }
        if (!out.length && !due.length) continue;
        await store.set("push:" + id, JSON.stringify(rec));
        for (const m of out) if (await deliver(store, id, rec, m)) sent++;
      }
      return { ok: true, sent };
    }
    default: fail(400, "bad_action");
  }
}
module.exports._test = { localNow, dueAt, cleanTimers, validSub };
