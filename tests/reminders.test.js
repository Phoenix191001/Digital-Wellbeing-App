// Browser test for reminders. Needs: PORT=8124 node tests/server.js  (pushes are captured, not sent)
const { chromium } = require("playwright");
const U = "http://localhost:8124/"; let pass = 0; const errs = [];
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (c) pass++; else process.exitCode = 1; };
const j = async (p, path) => JSON.parse(await (await p.request.get(U + path)).text());
(async () => {
  const b = await chromium.launch({ channel: "chromium" }), c = await b.newContext({ viewport: { width: 390, height: 844 } }); // full headless mode: supports notifications
  await c.grantPermissions(["notifications"], { origin: "http://localhost:8124" });
  // A fake push subscription: headless Chromium can't reach a real push service from this sandbox.
  await c.addInitScript(() => {
    const fake = { endpoint: "https://fcm.googleapis.com/fcm/send/test-device", keys: { p256dh: "BKey", auth: "secretAuth" } }; let subbed = false;
    PushManager.prototype.subscribe = async function () { subbed = true; return { toJSON: () => fake, unsubscribe: async () => { subbed = false; return true; } }; };
    PushManager.prototype.getSubscription = async function () { return subbed || localStorage.getItem("__subbed") ? { toJSON: () => fake, unsubscribe: async () => { localStorage.removeItem("__subbed"); subbed = false; return true; } } : null; };
    const o = PushManager.prototype.subscribe; PushManager.prototype.subscribe = async function (...a) { localStorage.setItem("__subbed", "1"); return o.apply(this, a); };
  });
  const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(U); await p.evaluate(() => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true, settings: { bedtime: "22:45" } }))); await p.reload(); await p.goto(U + "#/pomo");
  await p.evaluate(() => navigator.serviceWorker.ready);
  ok(await p.locator("text=Get a notification when it ends").count() === 1, "Pomodoro shows the 'notify me' nudge");
  await p.click("text=Get a notification when it ends"); await p.waitForSelector("text=Reminders on");
  let subs = await j(p, "__push-subs");
  ok(subs.length === 1 && subs[0].prefs.bedtime === "22:45" && subs[0].prefs.wind && subs[0].tz, "subscribed with bedtime 22:45, wind-down on, time zone " + (subs[0] && subs[0].tz));
  ok(await p.locator("text=We'll notify you when each round ends").count() === 1, "nudge replaced by confirmation");
  await p.click("text=Start focusing"); await p.waitForTimeout(1200); subs = await j(p, "__push-subs");
  const t = subs[0].timers[0]; ok(t && t.title.includes("Focus round done") && Math.abs(t.at - (Date.now() + 25 * 60000)) < 10000, "running Pomodoro sent its end time to the server");
  await p.click("text=⏸️ Pause"); await p.waitForTimeout(1200); subs = await j(p, "__push-subs"); ok(subs[0].timers.length === 0, "pausing cancels the scheduled reminder");
  await p.click("text=▶️ Resume"); await p.waitForTimeout(1200); subs = await j(p, "__push-subs"); ok(subs[0].timers.length === 1, "resuming schedules it again");
  await p.click("text=End session"); await p.waitForTimeout(1200); subs = await j(p, "__push-subs"); ok(subs[0].timers.length === 0, "ending clears it");
  // settings: toggles, daily time, test
  await p.goto(U + "#/settings"); ok(await p.locator(".srow2:has-text('Wind-down reminder')").count() === 1, "settings shows reminder options");
  await p.fill("input[data-rem=daily]", "20:15"); await p.locator("input[data-rem=daily]").dispatchEvent("change"); await p.waitForTimeout(1200);
  subs = await j(p, "__push-subs"); ok(subs[0].prefs.daily === "20:15", "daily check-in time saved on server");
  await p.click("button:text-is('Test')"); await p.waitForSelector("text=Sent!"); const sent = await j(p, "__push-sent"); ok(sent.some(s => s.tag === "test"), "test notification sent");
  // the service worker shows a notification when a push arrives (delivered through DevTools)
  const cdp = await c.newCDPSession(p); let regId = null;
  cdp.on("ServiceWorker.workerRegistrationUpdated", e => { for (const r of e.registrations) if (!r.isDeleted) regId = r.registrationId; });
  await cdp.send("ServiceWorker.enable"); for (let i = 0; i < 20 && !regId; i++) await p.waitForTimeout(100);
  await cdp.send("ServiceWorker.deliverPushMessage", { origin: "http://localhost:8124", registrationId: regId, data: JSON.stringify({ title: "🍅 Focus round done!", body: "Nice work.", tag: "timer", url: "/#/pomo" }) });
  let shown = []; for (let i = 0; i < 20 && !shown.length; i++) { await p.waitForTimeout(150); shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => [n.title, n.body, n.tag, n.data && n.data.url])); }
  ok(shown.length === 1 && shown[0][0] === "🍅 Focus round done!" && shown[0][3] === "/#/pomo", "service worker shows the pushed notification: " + JSON.stringify(shown[0]));
  // turn off
  await p.goto(U + "#/settings"); await p.click(".srow2:has-text('Reminders') .sw"); await p.waitForSelector("text=Reminders off");
  ok((await j(p, "__push-subs")).length === 0, "turning reminders off removes this device from the server");
  console.log("errors:", errs.length ? errs : "none"); ok(!errs.length, "no console errors");
  await b.close(); console.log("passed:", pass);
})().catch(e => { console.error(e); process.exit(1); });
