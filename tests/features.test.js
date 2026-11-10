// Browser tests for Study, Wellbeing and Accounts. Needs: PORT=8124 node tests/server.js  (and Playwright)
// Supabase is mocked inside the browser with page.route, so no real project is touched.
const { chromium } = require("playwright");
const U = "http://localhost:8124/", SB = "https://jfchjsvjqwqxwnvstbss.supabase.co";
let pass = 0; const errs = []; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (c) pass++; else process.exitCode = 1; };

function mockSupabase(state) {
  return async route => {
    const req = route.request(), u = new URL(req.url()), body = req.postData() ? JSON.parse(req.postData()) : {}, auth = (req.headers().authorization || "").replace("Bearer ", "");
    const json = (status, o) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });
    const sess = user => { const t = "tok_" + Math.random().toString(36).slice(2); state.tokens[t] = user.id; return { access_token: t, refresh_token: "r_" + t, expires_in: 3600, user: { id: user.id, email: user.email, user_metadata: user.meta } }; };
    const who = () => state.tokens[auth];
    if (req.headers().apikey !== "sb_publishable_LHlumiIkkmHYtsVn2t5Cww_QlFaYDdE") return json(401, { message: "bad apikey" });
    if (u.pathname === "/auth/v1/signup") {
      if (state.users[body.email]) return json(422, { error_code: "user_already_exists", msg: "User already registered" });
      const user = { id: crypto.randomUUID(), email: body.email, password: body.password, meta: body.data || {}, confirmed: !state.confirm };
      state.users[body.email] = user; state.lastRedirect = u.searchParams.get("redirect_to");
      return json(200, state.confirm ? { id: user.id, email: user.email } : sess(user));
    }
    if (u.pathname === "/auth/v1/token") {
      if (u.searchParams.get("grant_type") === "password") { const usr = state.users[body.email]; if (!usr || usr.password !== body.password) return json(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }); if (!usr.confirmed) return json(400, { error_code: "email_not_confirmed", msg: "Email not confirmed" }); return json(200, sess(usr)); }
      return json(400, {});
    }
    if (u.pathname === "/auth/v1/user") { const id = who(); const usr = Object.values(state.users).find(x => x.id === id); if (!usr) return json(401, {}); if (req.method() === "PUT") usr.password = body.password; return json(200, { id: usr.id, email: usr.email, user_metadata: usr.meta }); }
    if (u.pathname === "/auth/v1/logout" || u.pathname === "/auth/v1/recover") return json(200, {});
    if (u.pathname === "/rest/v1/pause_user_data") {
      const id = who(); if (!id) return json(401, {});
      if (req.method() === "GET") { const want = (u.searchParams.get("user_id") || "").replace("eq.", ""); return json(200, want === id && state.rows[id] ? [state.rows[id]] : []); }
      if (req.method() === "POST") { if (body.user_id !== id) return json(403, { message: "RLS" }); state.rows[id] = { data: body.data, updated_at: body.updated_at }; return route.fulfill({ status: 201, body: "" }); }
      if (req.method() === "DELETE") { delete state.rows[id]; return route.fulfill({ status: 204, body: "" }); }
    }
    return json(404, {});
  };
}
async function page(b, state, onboarded = true) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" }), p = await c.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { const u = m.location().url || ""; if (m.type() === "error" && !u.includes("/api/") && !u.includes("__blank") && !u.startsWith(SB)) errs.push(m.text() + " @ " + u); }); p.on("dialog", d => d.accept());
  await p.route(SB + "/**", mockSupabase(state));
  await p.goto(U); if (onboarded) { await p.evaluate(() => localStorage.setItem("pause.v1", JSON.stringify({ onboarded: true }))); await p.reload(); }
  return p;
}
const S = p => p.evaluate(() => JSON.parse(localStorage.getItem("pause.v1")));
// Edit stored state from a blank same-origin page, so the app can't write its in-memory state over the edit.
async function patch(p, fn) {
  const back = p.url(); await p.goto(U + "__blank");
  await p.evaluate(f => { const s = JSON.parse(localStorage.getItem("pause.v1")); new Function("s", f)(s); localStorage.setItem("pause.v1", JSON.stringify(s)); }, fn);
  await p.goto(back);
}
const ffwd = p => patch(p, "s.timer.endAt = Date.now() - 1000");

(async () => {
  const b = await chromium.launch(), st = { users: {}, tokens: {}, rows: {}, confirm: false };
  const p = await page(b, st);

  // ---- goals + tasks
  await p.goto(U + "#/goals"); await p.fill("#tk", "Revise lecture 3"); await p.click("button:text-is('Add')");
  await p.fill("#gt", "Physics"); await p.fill("#gh", "2"); await p.click("text=Add goal"); await p.waitForSelector("text=Physics");
  await p.locator("input[data-task]").first().check(); await p.waitForTimeout(200);
  let s = await S(p); ok(s.tasks.length === 1 && s.tasks[0].done && s.goals[0].target === 120, "task added + ticked, goal added (2h = 120 min)");

  // ---- pomodoro full cycle (rounds = 2)
  await p.goto(U + "#/pomo"); await p.fill("#pr", "2"); await p.press("#pr", "Tab"); await p.click("button:has-text('Physics')"); await p.fill("#pl", "Ch 4 problems");
  await p.click("text=Start focusing"); await p.waitForSelector("#ring"); ok(await p.locator("text=Round 1 of 2").count() === 1, "pomodoro running round 1, nav hidden: " + (await p.locator("nav.tabs").count() === 0));
  await p.click("text=⏸️ Pause"); await p.waitForSelector("text=▶️ Resume"); await p.click("text=▶️ Resume");
  await ffwd(p); await p.waitForSelector("text=Start 5 min break"); s = await S(p);
  ok(s.focus.length === 1 && s.focus[0].min === 25 && s.focus[0].goal === s.goals[0].id, "round 1 logged 25 min to Physics goal");
  await p.click("text=Start 5 min break"); await p.waitForSelector("text=Short break"); await ffwd(p); await p.waitForSelector("text=Ready for round 2");
  await p.click("text=Start round 2"); await p.waitForSelector("text=Round 2 of 2"); await ffwd(p);
  await p.waitForSelector("text=Start 15 min long break"); await p.click("text=Finish without break"); await p.waitForSelector("text=Session complete");
  s = await S(p); ok(s.focus.reduce((a, f) => a + f.min, 0) === 50, "2 rounds = 50 focus minutes");
  await p.click("text=See your garden"); await p.waitForSelector("text=Focus garden"); ok(await p.locator(".garden span").count() === 2, "garden shows 2 plants");
  await p.goto(U + "#/goals"); ok(await p.locator("text=50m of 2h this week").count() === 1, "goal progress shows 50m of 2h");

  // ---- flashcards
  await p.goto(U + "#/cards"); await p.click("text=Try a sample deck"); await p.waitForSelector("text=Study smarter");
  await p.fill("#cf", "2+2?"); await p.fill("#cb", "4"); await p.click("text=Add card"); await p.waitForSelector("text=2+2?");
  await p.click("summary:has-text('Add many')"); await p.fill("#cbulk", "Capital of Pakistan :: Islamabad\nH2O :: Water\nbad line"); await p.click("text=Add all"); await p.waitForTimeout(200);
  s = await S(p); ok(s.decks[0].cards.length === 8, "deck: 5 sample + 1 + 2 bulk = 8 cards");
  await p.click("a:has-text('Review 8 cards')"); let n = 0;
  for (; n < 30; n++) { if (await p.locator("text=Review done").count()) break; await p.click("button.flip"); await p.click(n === 0 ? "button.r1" : "button.r2"); }
  s = await S(p); const boxes = s.decks[0].cards.map(c => c.box);
  ok(await p.locator("text=Review done").count() === 1 && n === 9 && boxes.every(x => x >= 1), `review finished (${n} ratings incl. 1 again), all cards scheduled`);
  await p.goto(U + "#/cards/" + s.decks[0].id); ok(await p.locator("text=All caught up").count() === 1, "deck shows all caught up");

  // ---- usage + sleep + mood
  await p.goto(U + "#/usage"); for (let i = 0; i < 4; i++) await p.click("button[aria-label='More Instagram']"); await p.click("button[aria-label='More WhatsApp']");
  await p.click("summary:has-text('limits')"); await p.fill("#lim-instagram", "30"); await p.press("#lim-instagram", "Tab"); await p.goto(U + "#/"); await p.goto(U + "#/usage");
  ok(await p.locator(".urow").count() === 2 && await p.locator("text=went past the limit").count() === 1, "usage: 1h Instagram + 15m WhatsApp, gentle limit note");
  await p.goto(U + "#/sleep"); await p.click("text=I'm going to sleep"); await patch(p, "s.sleepStart = Date.now() - 7.5 * 3600000");
  await p.click("text=I'm awake"); await p.waitForTimeout(200); s = await S(p);
  ok(s.sleepLog.length === 1 && s.week.find(w => w.sleep === 7.5), "sleep logged 7.5h and copied to My week " + JSON.stringify({ l: s.sleepLog, w: s.week, st: s.sleepStart }));
  await p.click("button:has-text('Rain')"); ok(await p.locator("text=playing").count() === 1, "sleep sound plays"); await p.click("text=⏹️ Stop");
  await p.goto(U + "#/"); await p.click("button[aria-label='Good']"); s = await S(p); ok(Object.values(s.mood)[0] === "🙂", "mood saved");
  await p.click("button:has-text('Study')"); s = await S(p); ok(s.checkins.length === 1, "check-in counted");

  // ---- accounts: sign up (no email confirmation), sync up
  await p.goto(U + "#/signup"); await p.fill("#su-name", "Saad"); await p.fill("#su-email", "saad@example.com"); await p.fill("#su-pass", "short"); await p.fill("#su-pass2", "short");
  await p.click("button:text('Create account')"); ok(await p.locator("text=at least 8 characters").count() === 1, "weak password rejected locally");
  await p.fill("#su-pass", "studyhard123"); await p.fill("#su-pass2", "studyhard123"); await p.click("button:text('Create account')");
  await p.waitForSelector("text=Backed up at", { timeout: 8000 }); const uid = Object.values(st.users)[0].id;
  ok(st.rows[uid] && st.rows[uid].data.decks.length === 1 && st.rows[uid].data.focus.length === 2 && !("notes" in st.rows[uid].data), "signed up, data backed up (no mood notes by default)");

  // ---- second device: sign in, data arrives, edits merge back
  const p2 = await page(b, st, false);
  await p2.goto(U + "#/signin"); await p2.fill("#si-email", "saad@example.com"); await p2.fill("#si-pass", "wrongpass1"); await p2.click("button:text-is('Sign in')");
  await p2.waitForSelector("text=Email or password is not right"); ok(true, "wrong password shows friendly error");
  await p2.fill("#si-pass", "studyhard123"); await p2.click("button:text-is('Sign in')"); await p2.waitForSelector("text=Backed up at", { timeout: 8000 });
  let s2 = await S(p2);
  ok(s2.decks.length === 1 && s2.goals.length === 1 && s2.profile.name === "Saad" && s2.onboarded, "device 2 received decks, goals, name");
  await p2.goto(U + "#/goals"); await p2.fill("#tk", "Task from phone 2"); await p2.click("button:text-is('Add')"); await p2.locator("button[aria-label='Delete task']").first().click();
  await p2.goto(U + "#/account"); await p2.click("text=Back up now"); await p2.waitForTimeout(500);
  await p.goto(U + "#/account"); await p.click("text=Back up now"); await p.waitForTimeout(500); s = await S(p);
  const live = s.tasks.filter(t => !t.del).map(t => t.text);
  ok(live.length === 1 && live[0] === "Task from phone 2", "merge: new task arrives, deleted task stays deleted on device 1 (" + live + ")");

  // ---- confirm-email mode
  st.confirm = true; const p3 = await page(b, st);
  await p3.goto(U + "#/signup"); await p3.fill("#su-email", "new@example.com"); await p3.fill("#su-pass", "studyhard123"); await p3.fill("#su-pass2", "studyhard123"); await p3.click("button:text('Create account')");
  await p3.waitForSelector("text=We sent a link"); ok(st.lastRedirect === U, "confirm-email: shows check-your-inbox, redirect_to = site");
  await p3.fill("#si-email", "new@example.com"); await p3.fill("#si-pass", "studyhard123"); await p3.click("button:text-is('Sign in')"); await p3.waitForSelector("text=confirm your email first"); ok(true, "unconfirmed sign-in shows friendly message");
  st.users["new@example.com"].confirmed = true; const s3 = Object.values(st.users).find(x => x.email === "new@example.com");
  const t3 = "tok_link"; st.tokens[t3] = s3.id; await p3.goto(U + `#access_token=${t3}&refresh_token=r&expires_in=3600&token_type=bearer&type=signup`);
  await p3.reload(); await p3.waitForSelector("text=Your email is confirmed", { timeout: 8000 }); ok(!(await p3.evaluate(() => location.hash)).includes("access_token"), "email link signs in and token is removed from the URL");

  // ---- sign out keeps local data; delete account
  await p.goto(U + "#/account"); await p.click("button:text-is('Sign out')"); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => localStorage.getItem("pause.auth"))) && (await S(p)).decks.length === 1, "sign out: session gone, local data kept");
  await p2.route("**/api/account", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  await p2.goto(U + "#/account"); await p2.click("text=Delete my account"); await p2.waitForSelector("text=Your account was deleted"); ok(!(await p2.evaluate(() => localStorage.getItem("pause.auth"))), "delete account clears session");

  // ---- existing screens still fine
  for (const h of ["", "do", "read", "safe", "me", "talk", "focus", "challenges", "play", "night", "week", "notes", "settings", "privacy", "guide", "people", "study", "usage", "sleep"]) { await p.goto(U + "#/" + h); await p.waitForTimeout(120); if ((await p.locator("#app").innerText()).length < 30) ok(false, "empty " + h); if (!["talk"].includes(h) && !(await p.locator(".talk").count())) ok(false, "no Talk button on " + h); }
  ok(true, "all screens render with Talk to someone");
  console.log("errors:", errs.length ? errs : "none"); ok(errs.length === 0, "no console errors");
  await b.close(); console.log("passed:", pass);
})().catch(e => { console.error(e); process.exit(1); });
