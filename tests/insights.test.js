// Browser tests for Insights, Achievements (streaks), Limits, Tour, Theme, Strict mode, Export.  Needs: PORT=8124 node tests/server.js
const { chromium } = require("playwright");
const U = "http://localhost:8124/"; let pass = 0; const errs = [];
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (c) pass++; else process.exitCode = 1; };
const dk = n => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const at = (n, h, m) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return +d; };
(async () => {
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: true }), p = await c.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !(m.location().url || "").includes("__blank") && errs.push(m.text())); p.on("dialog", d => d.accept());
  await p.goto(U + "__blank");
  const usage = {}; [1, 2, 3].forEach(n => usage[dk(n)] = { apps: { instagram: 60, whatsapp: 30 }, u: 1 }); usage[dk(9)] = { apps: { instagram: 300 }, u: 1 };
  // nights: 3 evenings in a row lights-out on time (bedtime 23:30), one earlier night late
  const sleepLog = [3, 2, 1].map(n => ({ start: at(n, 23, 10), end: at(n - 1, 7, 0) })).concat([{ start: at(5, 23, 59) + 3600000, end: at(4, 9, 0) }]);
  await p.evaluate(([usage, sleepLog]) => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true, usage, sleepLog, settings: { bedtime: "23:30", goal: 120 } })), [usage, sleepLog]);
  await p.goto(U); await p.waitForTimeout(400);
  const home = await p.locator("#app").innerText();
  ok(/Days within goal\s*3 in a row/.test(home), "home: 3 days within goal in a row");
  ok(/Phone-free nights\s*3 in a row/.test(home), "home: 3 phone-free nights in a row");
  ok(home.includes("Take the 2-minute tour"), "home: tour card shown");
  await p.click("text=Not now, I'll put my phone down"); let s = await p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1")));
  ok(s.notNow.length === 1, "Not now counted");
  ok(s.badges.night3 && s.badges.goal3 && s.badges.trend, "badges unlocked & saved: Early night, On track, Trending down");
  await p.goto(U + "#/achievements"); const ach = await p.locator("#app").innerText();
  ok(/3 of 15/.test(ach) && /Sleep champion[\s\S]*3\/7/.test(ach) && /Second thoughts[\s\S]*1\/10/.test(ach), "achievements page: 3 of 15, progress 3/7 and 1/10");
  // streak resets but badge stays
  await p.goto(U + "__blank"); await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("pause.v1")); s.sleepLog = []; localStorage.setItem("pause.v1", JSON.stringify(s)); }); await p.goto(U + "#/achievements");
  ok(/Sleep champion[\s\S]*0\/7/.test(await p.locator("#app").innerText()) && (await p.locator(".ach.won").count()) === 3, "streak reset to 0 but unlocked badge kept");
  // insights
  await p.goto(U + "#/insights"); const ins = await p.locator("#app").innerText();
  ok(/Last 7 days\s*4h 30m/.test(ins) && /Daily average\s*1h 30m/.test(ins) && (await p.locator(".gcol").count()) === 14 && (await p.locator(".donut").count()) === 1, "insights: totals, 14-day bars, donut");
  await p.click("button:text-is('Today')"); ok((await p.locator("text=Nothing logged today").count()) === 1, "insights: today toggle");
  // limits
  await p.goto(U + "#/limits"); ok((await p.locator("text=No apps selected yet").count()) === 1, "limits: empty state");
  await p.click("text=Choose apps"); await p.click(".step:has-text('Instagram') button:text-is('30m')"); await p.click("button:text-is('Done')");
  s = await p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1"))); ok(s.limits.instagram === 30 && (await p.locator(".lrow").count()) === 1, "limits: Instagram 30m set");
  await p.click("button:text-is('2h')"); s = await p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1"))); ok(s.settings.goal === 120 && s.settings.goalSet, "daily goal set");
  // why
  await p.goto(U); await p.click("button.why"); await p.fill("#why", "More sleep, more friends"); await p.click("button:text-is('Save')");
  ok((await p.locator(".whyline").count()) === 1, "my why saved and shown in check-in");
  // tour
  await p.goto(U + "#/tour"); const t = await p.locator("#app").innerText(); ok(/\d+ of 14 set up/.test(t), "tour: " + (t.match(/\d+ of 14 set up/) || [""])[0]);
  // theme
  await p.goto(U + "#/settings"); await p.selectOption("select[data-field=theme]", "midnight"); await p.waitForTimeout(150);
  const th = await p.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()]);
  ok(th[0] === "midnight" && th[1] === "#10132a", "theme switch to Midnight: " + th);
  // strict mode
  await p.click(".srow2:has-text('Strict focus') .sw"); await p.goto(U + "#/focus"); await p.click("text=Start 25m focus");
  ok((await p.locator("text=Emergency stop").count()) === 1 && (await p.locator("text=Pause session").count()) === 0, "strict: no pause, emergency stop available");
  await p.click("text=Emergency stop"); await p.waitForTimeout(200); ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1")).timer)), "emergency stop ends session");
  await p.goto(U + "#/pomo"); await p.click("text=Start focusing"); ok((await p.locator("text=Emergency stop").count()) === 1, "strict applies to Pomodoro too");
  await p.click("text=Emergency stop");
  // export + clear
  await p.goto(U + "#/settings"); const [dl] = await Promise.all([p.waitForEvent("download"), p.click("button:text-is('Export')")]);
  const data = JSON.parse(require("fs").readFileSync(await dl.path(), "utf8")); ok(data.app === "Pause" && data.data.limits.instagram === 30, "export JSON download");
  await p.click("button:text-is('Clear')"); s = await p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1")));
  ok(Object.values(s.usage).every(d => !Object.keys(d.apps).length), "clear usage history");
  for (const h of ["", "me", "settings", "insights", "achievements", "limits", "tour", "helps", "focus", "study", "sleep", "usage"]) { await p.goto(U + "#/" + h); await p.waitForTimeout(100); if ((await p.locator("#app").innerText()).length < 30) ok(false, "empty " + h); }
  console.log("errors:", errs.length ? errs : "none"); ok(!errs.length, "no console errors");
  await b.close(); console.log("passed:", pass);
})().catch(e => { console.error(e); process.exit(1); });
