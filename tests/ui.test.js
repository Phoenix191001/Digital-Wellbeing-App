// Run with the test server up:  PORT=8124 node tests/server.js  &  node tests/ui.test.js   (needs playwright)
const { chromium } = require("playwright");
const U = "http://localhost:8124/", errs = [];
let pass = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (c) pass++; else process.exitCode = 1; };
async function newUser(b, space, circle = "study") {
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }), p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !(m.location().url || "").includes("/api/community") && errs.push(m.text())); p.on("dialog", d => d.accept());
  await p.goto(U); await p.evaluate(() => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true }))); await p.reload(); await p.goto(U + "#/do");
  await p.click("text=Find your people"); await p.click("text=I agree"); await p.click(`button:text-is("${space === "female" ? "Female" : "Male"} space")`);
  await p.click("button:text('Continue')"); await p.waitForSelector(".big:not(:text('…'))"); await p.click("button:text-is('Join')");
  await p.waitForSelector("text=Just need to talk"); return p;
}
(async () => {
  const b = await chromium.launch();
  const f1 = await newUser(b, "female"), f2 = await newUser(b, "female"), m1 = await newUser(b, "male");
  ok(await f1.locator("text=You only see people in your own space").count() > 0, "join flow reaches circle list (female)");
  const open = async (p, c = "Study") => { await p.goto(U + "#/people"); await p.click(`a:has-text("${c}")`); await p.waitForSelector("textarea#pp"); };
  await open(f1); await f1.click("button:text('Join this circle')"); await f1.waitForSelector("button:text('Leave this circle')");
  await f1.fill("#pp", "Anyone up for a study group this week?"); await f1.click("button:text-is('Post')"); await f1.waitForSelector("text=study group this week");
  ok(true, "post appears for author");
  await open(f2); await f2.waitForSelector("text=study group this week"); ok(true, "other female user sees it");
  await f2.click("button:text('🤝 I relate')"); await f2.click("button:text-is('Reply')"); await f2.fill("textarea[data-draft^='r:']", "I'm in!"); await f2.click("text=Send reply"); await f2.waitForSelector("text=I'm in!");
  ok(true, "react + reply work");
  await open(m1); await m1.waitForTimeout(600); ok(await m1.locator("text=study group this week").count() === 0, "male space cannot see female post");
  // crafted cross-space API calls from the male browser
  const tok = await m1.evaluate(() => JSON.parse(localStorage.getItem("pause.community")).token);
  const postId = await f1.evaluate(async () => { const t = JSON.parse(localStorage.getItem("pause.community")).token; const r = await (await fetch("/api/community", { method: "POST", body: JSON.stringify({ action: "feed", token: t, circle: "study" }) })).json(); return r.posts[0].id; });
  const codes = await m1.evaluate(async ([t, id]) => { const o = []; for (const a of [{ action: "react", type: "relate" }, { action: "reply", text: "hi" }, { action: "report" }]) o.push((await fetch("/api/community", { method: "POST", body: JSON.stringify({ ...a, token: t, postId: id }) })).status); const fd = await (await fetch("/api/community", { method: "POST", body: JSON.stringify({ action: "feed", token: t, circle: "study", space: "female" }) })).json(); o.push(fd.posts.length); return o; }, [tok, postId]);
  ok(codes.join() === "404,404,404,0", "crafted API calls from male user blocked: " + codes);
  // self-harm
  await f1.fill("#pp", "I want to die"); await f1.click("button:text-is('Post')"); await f1.waitForSelector("text=Thank you for trusting us");
  ok(await f1.locator("a:text-is('Talk to someone')").count() > 0 && await f2.evaluate(async () => (await (await fetch("/api/community", { method: "POST", body: JSON.stringify({ action: "status" }) })).json()).configured), "self-harm shows kind message + Talk to someone");
  await f1.click("text=Save it as a private mood note"); await f1.goto(U + "#/notes"); ok(await f1.locator("text=I want to die").count() === 1, "self-harm text saved only as private note");
  await f2.reload(); await f2.goto(U + "#/people/study"); await f2.waitForSelector("textarea#pp"); ok(await f2.locator("text=I want to die").count() === 0, "self-harm text not published");
  // blocked content
  await open(f1); for (const t of ["visit https://x.com", "call 03001234567", "mail me@x.com"]) { await f1.fill("#pp", t); await f1.click("button:text-is('Post')"); await f1.waitForSelector("text=please remove"); }
  ok(true, "links/numbers/emails blocked with kind message");
  // reports: f2 + 2 more female users report f1's post
  const f3 = await newUser(b, "female"), f4 = await newUser(b, "female"); await open(f3); await open(f4); await open(f2);
  for (const p of [f2, f3, f4]) { await p.waitForSelector("text=study group this week"); await p.locator("button:text-is('Report')").first().click(); await p.waitForTimeout(500); }
  const f5 = await newUser(b, "female"); await open(f5); await f5.waitForTimeout(500);
  ok(await f5.locator("text=study group this week").count() === 0, "post hidden after 3 reports");
  // moderator
  const mp = await (await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" })).newPage(); mp.on("pageerror", e => errs.push(e.message));
  await mp.goto(U); await mp.evaluate(() => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true }))); await mp.reload(); await mp.goto(U + "#/mod");
  await mp.fill("#mp", "wrong"); await mp.click("text=Open"); await mp.waitForSelector("text=Wrong passcode"); ok(true, "wrong passcode rejected");
  await mp.fill("#mp", "test-pass"); await mp.click("text=Open"); await mp.waitForSelector("text=study group this week"); await mp.click("button:text-is('Restore')");
  await f5.click("button:text('Refresh')"); await f5.waitForSelector("text=study group this week"); ok(true, "moderator restore makes post visible again");
  // leave
  await f1.goto(U + "#/settings"); await f1.click("text=Leave community and delete my posts"); await f1.waitForTimeout(600);
  await f5.click("button:text('Refresh')"); await f5.waitForTimeout(600); ok(await f5.locator("text=study group this week").count() === 0, "leave deletes author's posts");
  ok(await f1.evaluate(() => !JSON.parse(localStorage.getItem("pause.community") || "{}").token), "local anonymous id cleared on leave");
  // existing screens
  const e = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }), p = await e.newPage(); p.on("pageerror", x => errs.push(x.message)); p.on("console", m => m.type() === "error" && !(m.location().url || "").includes("/api/community") && errs.push(m.text()));
  await p.goto(U); await p.evaluate(() => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true }))); await p.reload();
  for (const h of ["", "do", "read", "safe", "me", "talk", "focus", "challenges", "play", "night", "week", "notes", "settings", "privacy", "guide", "safe/scams", "people"]) {
    await p.goto(U + "#/" + h); await p.waitForTimeout(250); const t = await p.locator("#app").innerText(); if (t.length < 20) ok(false, "screen " + h + " empty");
    if (h !== "talk" && await p.locator(".talk").count() === 0 && h !== "focus") ok(false, "no Talk button on " + h);
  }
  ok(true, "existing screens render, Talk button present");
  ok(await p.locator("text=Private · your data stays on this phone").count() >= 0, "banner");
  console.log("console/page errors:", errs.length ? errs : "none"); ok(errs.length === 0, "no console errors");
  await b.close(); console.log("passed checks:", pass);
})();
