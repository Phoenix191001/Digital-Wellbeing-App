// node --test tests/push.test.js : reminder API (web-push mocked, in-memory store)
process.env.PAUSE_MEMORY_STORE = "1";
const test = require("node:test"), assert = require("node:assert/strict");
const webpush = require("web-push"), keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
const sent = []; let failNext = 0;
webpush.sendNotification = async (sub, payload) => { if (failNext) { failNext--; const e = new Error("gone"); e.statusCode = 410; throw e; } sent.push({ ep: sub.endpoint, ...JSON.parse(payload) }); return {}; };
const handler = require("../api/push.js"), { memoryStore } = require("../api/_lib.js");
const call = (body, method = "POST") => new Promise(r => { const res = { setHeader() {}, end(s) { r({ status: this.statusCode, body: JSON.parse(s) }); } }; handler({ method, body }, res); });
const sub = n => ({ endpoint: `https://fcm.googleapis.com/fcm/send/dev${n}`, keys: { p256dh: "BNc" + n, auth: "auth" + n } });
const tick = async () => { await memoryStore.del("push:lasttick"); return call({ action: "tick" }); };
// local time "HH:MM" in a zone, for a given offset from now
const hhmmIn = (tz, offMin) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + offMin * 60000));

test("public key + validation", async () => {
  const g = await call({}, "GET"); assert.equal(g.body.publicKey, keys.publicKey); assert.equal(g.body.ready, true);
  assert.equal((await call({ action: "subscribe", sub: { endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } }, tz: "UTC" })).status, 400, "only real push services");
  assert.equal((await call({ action: "subscribe", sub: sub(0), tz: "Not/AZone" })).status, 400);
});
test("timer reminder is sent once when due", async () => {
  sent.length = 0;
  await call({ action: "subscribe", sub: sub(1), tz: "Asia/Karachi", prefs: { timer: true, wind: false }, timers: [{ at: Date.now() + 5000, title: "🍅 Focus round done!", body: "b", url: "/#/pomo" }] });
  await tick(); assert.equal(sent.filter(s => s.tag === "timer").length, 1); assert.equal(sent[0].url, "/#/pomo");
  await tick(); assert.equal(sent.filter(s => s.tag === "timer").length, 1, "not sent twice");
});
test("future timers wait; cancelling clears them; wrong auth is refused", async () => {
  sent.length = 0;
  await call({ action: "subscribe", sub: sub(2), tz: "UTC", prefs: { wind: false }, timers: [{ at: Date.now() + 10 * 60000, title: "t" }] });
  await tick(); assert.equal(sent.length, 0);
  assert.equal((await call({ action: "update", endpoint: sub(2).endpoint, auth: "WRONG", timers: [] })).status, 404);
  assert.equal((await call({ action: "update", endpoint: sub(2).endpoint, auth: "auth2", timers: [] })).status, 200);
  await call({ action: "update", endpoint: sub(2).endpoint, auth: "auth2", timers: [{ at: Date.now() + 1000, title: "x" }], prefs: { timer: false, wind: false } });
  await tick(); assert.equal(sent.length, 0, "timer reminders switched off");
});
test("wind-down and daily check-in fire once per day in the student's time zone", async () => {
  sent.length = 0; const tz = "Asia/Karachi";
  await call({ action: "subscribe", sub: sub(3), tz, prefs: { wind: true, bedtime: hhmmIn(tz, 30), daily: hhmmIn(tz, -1), timer: true } });
  await tick(); const mine = sent.filter(s => s.ep === sub(3).endpoint).map(s => s.tag).sort();
  assert.deepEqual(mine, ["daily", "wind"]);
  await tick(); assert.equal(sent.filter(s => s.ep === sub(3).endpoint).length, 2, "once per day");
  sent.length = 0;
  await call({ action: "subscribe", sub: sub(4), tz, prefs: { wind: true, bedtime: hhmmIn(tz, 120), daily: hhmmIn(tz, 90) } });
  await tick(); assert.equal(sent.filter(s => s.ep === sub(4).endpoint).length, 0, "not due yet");
});
test("tick throttle, test message, unsubscribe, expired devices removed", async () => {
  await tick(); assert.equal((await call({ action: "tick" })).body.skipped, true);
  sent.length = 0; assert.equal((await call({ action: "test", endpoint: sub(1).endpoint, auth: "auth1" })).body.ok, true); assert.equal(sent[0].tag, "test");
  assert.equal((await call({ action: "unsubscribe", endpoint: sub(1).endpoint, auth: "auth1" })).status, 200);
  assert.ok(!(await memoryStore.smembers("pushsubs")).includes(require("crypto").createHash("sha256").update(sub(1).endpoint).digest("hex")));
  await call({ action: "subscribe", sub: sub(5), tz: "UTC", prefs: { wind: false }, timers: [{ at: Date.now(), title: "x" }] }); failNext = 1;
  await tick(); assert.equal(await memoryStore.get("push:" + require("crypto").createHash("sha256").update(sub(5).endpoint).digest("hex")), null, "410 Gone removes the device");
});
test("not configured without VAPID keys", async () => {
  const k = process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_PRIVATE_KEY;
  assert.equal((await call({}, "GET")).body.ready, false); assert.equal((await call({ action: "tick" })).status, 503);
  process.env.VAPID_PRIVATE_KEY = k;
});
