// Insights, achievements (streaks), limits, app tour, "how Pause helps", and the Home "Today" dashboard widgets.
// Usage numbers are what the student logs (a website cannot read other apps).
import { APPS } from "./wellbeing.js";

const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBack = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (n - 1 - i)); return d; });
const hm = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`; };
const WEEKDAY = new Intl.DateTimeFormat([], { weekday: "short" });
const hrs = m => `${(m / 60).toFixed(1)}h`;

export function initInsights(c) {
  const { header, render, toast, esc, go } = c;
  const S = () => c.S;
  let distRange = "7", whyEdit = false, pickApps = false;

  /* ---------- data helpers ---------- */
  const goal = () => S().settings.goal || 180;
  const dayTotal = k => Object.values((S().usage[k] || {}).apps || {}).reduce((a, b) => a + b, 0);
  const logged = k => dayTotal(k) > 0;
  // Summaries are rebuilt only when the data changes (c.ver) or the day changes, not on every tap.
  let memo = { key: "" };
  function D() {
    const key = c.ver() + "|" + dkey(new Date());
    if (memo.key === key) return memo;
    const s = S(), ev = new Map();
    for (const x of s.sleepLog) { if (x.del) continue; const t = new Date(x.start - 8 * 3600000); if (t.getHours() >= 10) { const k = dkey(t); if (!ev.has(k)) ev.set(k, x); } }
    memo = { key, fd: new Set(s.focus.map(f => dkey(new Date(f.ts)))), rd: new Set(s.reviews.map(r => dkey(new Date(r.ts)))), ev, nights: new Map(), streaks: {}, badges: null };
    return memo;
  }
  const focusOn = k => D().fd.has(k);
  const reviewedOn = k => D().rd.has(k);
  const streak = ok => { let n = 0; const d = new Date(); d.setHours(12); if (!ok(dkey(d))) d.setDate(d.getDate() - 1); while (n < 400 && ok(dkey(d))) { n++; d.setDate(d.getDate() - 1); } return n; };
  // A "phone-free night" for evening k: lights out (tapped "I'm going to sleep") by bedtime + 30 min, or "charged the phone away from my bed" ticked.
  function night(k) { const m = D(); if (!m.nights.has(k)) m.nights.set(k, nightCalc(k)); return m.nights.get(k); }
  function nightCalc(k) {
    const [bh, bm] = S().settings.bedtime.split(":").map(Number), ev = new Date(k + "T12:00:00");
    const bed = new Date(ev); bed.setHours(bh, bm, 0, 0); if (bh < 12) bed.setDate(bed.getDate() + 1);
    const s = D().ev.get(k); // first lights-out between 18:00 that evening and 08:00 next morning
    const late = s ? Math.round((s.start - bed) / 60000) : null;
    return { ok: !!(S().nightDone[k] || (s && late <= 30)), late, logged: !!s || !!S().nightDone[k] };
  }
  const withinGoal = k => logged(k) && dayTotal(k) <= goal();
  const weekAvg = off => { const ds = daysBack(7 + off).slice(0, 7).map(dkey).filter(logged); return ds.length ? ds.reduce((a, k) => a + dayTotal(k), 0) / ds.length : null; };
  const totalPlants = () => Math.floor(S().focus.reduce((a, f) => a + f.min, 0) / 25);

  /* ---------- achievements ---------- */
  const BADGES = [
    ["night3", "🌙", "Early night", "3 phone-free nights in a row", "Night-time doom-scrolling", 3, () => named("night", k => night(k).ok)],
    ["night7", "😴", "Sleep champion", "7 phone-free nights in a row", "Night-time doom-scrolling", 7, () => named("night", k => night(k).ok)],
    ["night30", "🌌", "New normal", "30 phone-free nights in a row", "Night-time doom-scrolling", 30, () => named("night", k => night(k).ok)],
    ["not10", "🤚", "Second thoughts", 'Choose "Not now" 10 times', "Passive, purposeless use", 10, () => S().notNow.length],
    ["not50", "🧭", "Intentional", 'Choose "Not now" 50 times', "Passive, purposeless use", 50, () => S().notNow.length],
    ["goal3", "🎯", "On track", "3 days in a row within your daily goal", "High daily screen time", 3, () => named("goal", withinGoal)],
    ["goal7", "⚖️", "Balanced week", "7 days in a row within your daily goal", "High daily screen time", 7, () => named("goal", withinGoal)],
    ["trend", "📉", "Trending down", "Log less screen time than the week before", "High daily screen time", 1, () => { const a = weekAvg(0), b = weekAvg(7); return a != null && b != null && a < b ? 1 : 0; }],
    ["focus1", "🍅", "First focus", "Finish your first focus session", "Studying pushed late", 1, () => (S().focus.length ? 1 : 0)],
    ["focus5", "🔥", "In the zone", "Focus 5 days in a row", "Studying pushed late", 5, () => named("focus", focusOn)],
    ["pomo10", "🧺", "Tomato farmer", "Finish 10 Pomodoro rounds", "Studying pushed late", 10, () => S().focus.filter(f => f.kind === "pomo").length],
    ["cards3", "🧠", "Memory builder", "Review flashcards 3 days in a row", "Last-minute cramming", 3, () => named("cards", reviewedOn)],
    ["garden10", "🌳", "Gardener", "Grow 10 plants in your garden", "Scrolling instead of studying", 10, totalPlants],
    ["mood7", "💛", "Self-aware", "Check in with your mood 7 days in a row", "Low mood going unnoticed", 7, () => named("mood", k => !!S().mood[k])],
    ["connect", "🫂", "Reached out", "Complete a Connect challenge", "Loneliness", 1, () => (S().done.some(d => /^n\d/.test(d.id)) ? 1 : 0)],
  ].map(([id, e, n, d, t, target, fn]) => ({ id, e, n, d, t, target, fn }));
  const named = (id, ok) => { const m = D(); return id in m.streaks ? m.streaks[id] : (m.streaks[id] = streak(ok)); };
  const badgeState = () => { const m = D(); return m.badges || (m.badges = BADGES.map(b => { const v = Math.min(b.target, b.fn()); return { ...b, v, won: !!S().badges[b.id] || v >= b.target }; })); };
  function checkBadges() {
    const fresh = badgeState().filter(b => b.won && !S().badges[b.id]);
    if (!fresh.length) return;
    fresh.forEach(b => { S().badges[b.id] = Date.now(); }); D().badges = null;
    c.saveLocal(); setTimeout(() => toast(`🏆 Achievement unlocked: ${fresh[0].e} ${fresh[0].n}`), 50);
  }
  function achievements() {
    const bs = badgeState(), won = bs.filter(b => b.won).length;
    return `${header("Achievements 🏆", "#/me")}
    <div class="card center"><div class="emoji-xl">🏆</div><p><b>${won} of ${bs.length}</b> unlocked</p><div class="progress"><i style="width:${(won / bs.length) * 100}%"></i></div></div>
    ${bs.map(b => `<div class="card ach ${b.won ? "won" : ""}"><div class="ach-top"><span class="ach-ic">${b.won ? b.e : "🔒"}</span><span class="ach-tx"><b>${b.n}</b><br>${b.d}<br><small>Tackles: ${b.t}</small></span><span class="ach-n">${b.won ? "✓" : `${b.v}/${b.target}`}</span></div>
      <div class="segbar"><i style="flex:${b.won ? b.target : b.v}"></i><em style="flex:${b.won ? 0 : b.target - b.v}"></em></div></div>`).join("")}
    <p class="mute center">Unlocked badges stay yours, even if a streak ends.</p>`;
  }

  /* ---------- charts ---------- */
  function goalBars(n, opts = {}) {
    const ds = daysBack(n), vals = ds.map(d => dayTotal(dkey(d))), max = Math.max(goal() * 1.2, ...vals, 60), split = n - 7;
    return `<div class="gplot"><span class="goalline" style="bottom:${(goal() / max) * 100}%"></span>${ds.map((d, i) => `<span class="gcol ${i < split ? "faded" : ""} ${i === n - 1 ? "today" : ""}"><i style="height:${(vals[i] / max) * 100}%"></i></span>`).join("")}</div>
      <div class="glabels">${ds.map((d, i) => `<span class="${i === n - 1 ? "today" : ""}"><small>${i === n - 1 && opts.labels ? "Today" : "SMTWTFS"[d.getDay()]}</small>${opts.labels ? `<small class="v">${vals[i] ? hrs(vals[i]) : "–"}</small>` : ""}</span>`).join("")}</div>`;
  }
  function donut(range) {
    const keys = range === "1" ? [dkey(new Date())] : daysBack(7).map(dkey), sums = {};
    keys.forEach(k => Object.entries((S().usage[k] || {}).apps || {}).forEach(([a, v]) => { sums[a] = (sums[a] || 0) + v; }));
    const tot = Object.values(sums).reduce((a, b) => a + b, 0), list = Object.entries(sums).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!tot) return `<p class="mute">Nothing logged ${range === "1" ? "today" : "this week"} yet. <a href="#/usage">Log your usage</a></p>`;
    const top = list.slice(0, 5), other = list.slice(5).reduce((a, [, v]) => a + v, 0), parts = [...top.map(([a, v]) => [APPS.find(x => x.id === a), v]), ...(other ? [[{ n: "Other", e: "📱", c: "#64748b" }, other]] : [])];
    let acc = 0; const grad = parts.map(([a, v]) => { const s = acc; acc += (v / tot) * 100; return `${a.c} ${s}% ${acc}%`; }).join(",");
    return `<div class="donutwrap"><div class="donut" style="background:conic-gradient(${grad})"><div><b>${hrs(tot)}</b><small>top apps</small></div></div>
      <div class="legend">${parts.map(([a, v]) => `<div><i style="background:${a.c}"></i><span>${a.n}</span><b>${Math.round((v / tot) * 100)}%</b></div>`).join("")}</div></div>
      ${list.map(([id, v]) => { const a = APPS.find(x => x.id === id), lim = S().limits[id] * keys.length, over = lim && v > lim; return `<div class="arow"><span class="aic" style="background:${a.c}22">${a.e}</span><span class="an"><span><b>${a.n}</b><b>${hm(v)}</b></span><span class="ubar"><i style="width:${(v / list[0][1]) * 100}%;background:${over ? "#f87171" : "var(--acc2)"}"></i></span></span></div>`; }).join("")}`;
  }

  /* ---------- insights ---------- */
  function insights() {
    const t = dkey(new Date()), y = dkey(daysBack(2)[0]), wk = daysBack(7).map(dkey), withData = wk.filter(logged), sum = wk.reduce((a, k) => a + dayTotal(k), 0);
    const ci = S().checkins.filter(x => dkey(new Date(x)) === t).length, prevCi = daysBack(7).slice(0, 6).map(d => S().checkins.filter(x => dkey(new Date(x)) === dkey(d)).length), avgCi = prevCi.reduce((a, b) => a + b, 0) / 6;
    return `${header("Insights 📈", "#/me")}<p class="mute" style="margin-top:-6px">From what you log, stored only on this phone${c.signedIn() ? " and your private backup" : ""}.</p>
    <div class="sgrid">
      <div><small>Today</small><b>${hm(dayTotal(t))}</b></div><div><small>Yesterday</small><b>${hm(dayTotal(y))}</b></div>
      <div><small>Last 7 days</small><b>${hm(sum)}</b><span>${withData.length} day${withData.length === 1 ? "" : "s"} with data</span></div><div><small>Daily average</small><b>${hm(withData.length ? sum / withData.length : 0)}</b></div>
      <div><small>Pauses today</small><b>${ci}</b></div><div><small>Avg pauses / day</small><b>${avgCi.toFixed(0)}</b><span>Previous 6 days</span></div>
    </div>
    <div class="card"><div class="cardhead"><b>Last 14 days</b><small class="mute">dashed line: daily goal ${hm(goal())}</small></div>${goalBars(14)}<p class="mute">Bright bars: this week · faded: the week before</p></div>
    <h2>App distribution</h2><div class="seg"><button class="${distRange === "1" ? "on" : ""}" data-act="distRange" data-arg="1">Today</button><button class="${distRange === "7" ? "on" : ""}" data-act="distRange" data-arg="7">${distRange === "7" ? "✓ " : ""}Last 7 days</button></div>
    <div class="card">${donut(distRange)}</div>
    <a class="btn primary wide" href="#/usage">📊 Log today's usage</a>
    <p class="mute">سكون can't see other apps. Copy the minutes from Digital Wellbeing (Android) or Screen Time (iPhone).</p>`;
  }

  /* ---------- limits ---------- */
  function limits() {
    const lim = S().limits, chosen = APPS.filter(a => lim[a.id]), t = dkey(new Date()), apps = (S().usage[t] || {}).apps || {};
    return `${header("Limits ⏳", "#/")}<p class="mute" style="margin-top:-6px">Daily allowances you set for yourself</p>
    <div class="card"><div class="cardhead"><b>Daily screen-time goal</b><b>${hm(goal())}</b></div><div class="chips">${[60, 120, 180, 240, 300].map(m => `<button class="${goal() === m ? "on" : ""}" data-act="setGoal" data-arg="${m}">${hm(m)}</button>`).join("")}</div></div>
    ${chosen.length && !pickApps ? chosen.map(a => { const v = apps[a.id] || 0, p = Math.min(100, (v / lim[a.id]) * 100); return `<div class="card lrow"><span class="aic" style="background:${a.c}22">${a.e}</span><span class="an"><span><b>${a.n}</b><span class="mute">${hm(v)} / ${hm(lim[a.id])}</span></span><span class="ubar"><i style="width:${p}%;background:${v > lim[a.id] ? "#f87171" : "var(--acc2)"}"></i></span></span></div>`; }).join("") + `<button class="wide" data-act="pickApps">✏️ Edit apps</button>`
      : pickApps ? `<div class="card">${APPS.filter(a => a.id !== "study").map(a => `<div class="step"><span>${a.e} ${a.n}</span><div class="chips">${[0, 15, 30, 60, 120].map(m => `<button class="${(lim[a.id] || 0) === m ? "on" : ""}" style="min-height:40px;padding:6px 10px" data-act="setLimit" data-arg="${a.id}|${m}">${m ? hm(m) : "Off"}</button>`).join("")}</div></div>`).join("")}<button class="primary wide" data-act="pickApps">Done</button></div>`
      : `<div class="empty"><div class="ebub">⏳</div><b>No apps selected yet</b><p class="mute">Choose the apps that take more of your time than you'd like, then give each one a daily allowance.</p><button class="primary" data-act="pickApps">＋ Choose apps</button></div>`}
    <p class="mute">سكون can't block apps; it shows your limits and reminds you gently. For hard limits, use <a href="#/safe/tools">your phone's own app timers</a>.</p>`;
  }

  /* ---------- tour + how Pause helps ---------- */
  const SETUP = () => [
    ["💭", "Unsure why you opened your phone", "Write your why", !!S().why, "#/"],
    ["🎯", "Too much screen time", "Set a daily screen-time goal", !!S().settings.goalSet, "#/limits"],
    ["📊", "Not knowing where the time goes", "Log today's app usage", Object.keys(S().usage).some(logged), "#/usage"],
    ["⏳", "One app eats your day", "Choose an app limit", Object.keys(S().limits).length > 0, "#/limits"],
    ["🍅", "Studying pushed late", "Finish a Pomodoro", S().focus.length > 0, "#/pomo"],
    ["📘", "No study plan", "Add a weekly study goal", S().goals.some(g => !g.del), "#/goals"],
    ["🃏", "Cramming before exams", "Make a flashcard deck", S().decks.some(d => !d.del), "#/cards"],
    ["💛", "Low mood going unnoticed", "Check in with your mood", Object.keys(S().mood).length > 0, "#/"],
    ["🌙", "Scrolling at night", "Set your bedtime", !!S().settings.bedSet, "#/night"],
    ["😴", "Losing sleep", "Log a night's sleep", S().sleepLog.length > 0, "#/sleep"],
    ["🛡️", "Scams and unwanted content", "Read a Stay safe card", !!S().flags.safe, "#/safe"],
    ["💬", "Feeling alone", "Look at Talk to someone", !!S().flags.talk, "#/talk"],
    ["🫂", "Wanting like-minded people", "Visit Find your people", !!S().flags.people, "#/people"],
    ["☁️", "Losing progress on a new phone", "Create an account (optional)", c.signedIn(), "#/signup"],
  ];
  const setupCount = () => { const s = SETUP(); return [s.filter(x => x[3]).length, s.length]; };
  function tour() {
    const s = SETUP(), [d, n] = setupCount();
    return `${header("App tour 🧭", "#/me")}<p class="mute" style="margin-top:-6px">Problem → feature → set it up</p>
    <div class="card"><div class="cardhead"><b>${d} of ${n} set up</b><span>${d === n ? "🎉" : ""}</span></div><div class="progress"><i style="width:${(d / n) * 100}%"></i></div></div>
    ${s.map(([e, prob, feat, done, h], i) => `<a class="card btn block srow ${done ? "done" : ""}" href="${h}"><span class="fi f-dim">${done ? "✅" : e}</span><span style="flex:1"><small class="mute">${i + 1}. ${prob}</small><br><b>${feat}</b></span><span class="chev">${done ? "" : "›"}</span></a>`).join("")}`;
  }
  function helps() {
    const P = [["📱", "Scrolling trap and lost time", [["Check-in", "#/"], ["Read a short set", "#/read"], ["Pomodoro", "#/pomo"], ["Insights", "#/insights"]]], ["🥺", "Loneliness or low mood", [["Find your people", "#/people"], ["Talk to someone", "#/talk"], ["Daily mood", "#/"]]], ["🚫", "Unwanted content", [["Stay safe", "#/safe/content"]]], ["🪞", "Comparison and FOMO", [["Comparison reset", "#/safe/compare"], ["Connect challenges", "#/challenges/Connect"]]], ["🌀", "Escaping into online worlds", [["Something else to do", "#/challenges"], ["Check-in", "#/"]]], ["🎮", "Game addiction", [["Play timer", "#/play"], ["Limits", "#/limits"]]], ["🧱", "Online harassment", [["Harassment steps", "#/safe/harass"], ["Talk to someone", "#/talk"]]], ["🌙", "Night use and lost sleep", [["Sleep", "#/sleep"], ["Wind-down", "#/night"]]], ["🔔", "Notifications pulling you in", [["Notifications guide", "#/safe/notif"]]], ["📚", "Studying pushed late", [["Goals", "#/goals"], ["Flashcards", "#/cards"], ["Garden", "#/garden"]]]];
    return `${header("How سكون helps 💡", "#/me")}<p class="mute" style="margin-top:-6px">Which feature solves which problem</p>
    ${P.map(([e, p, fs]) => `<div class="card"><b>${e} ${p}</b><div class="chips" style="margin-top:10px">${fs.map(([f, h]) => `<a class="btn" style="min-height:40px;padding:8px 12px" href="${h}">${f} ›</a>`).join("")}</div></div>`).join("")}`;
  }

  /* ---------- Home "Today" widgets ---------- */
  function today() {
    const t = dkey(new Date()), used = dayTotal(t), g = goal(), pct = Math.min(1, used / g), over = used > g, C = 2 * Math.PI * 52;
    const tm = c.timer(), focusing = tm && (tm.kind === "pomo" || tm.kind === "focus"), fmin = S().focus.filter(f => dkey(new Date(f.ts)) === t).reduce((a, f) => a + f.min, 0);
    const bs = badgeState(), won = bs.filter(b => b.won).length, [sd, sn] = setupCount();
    const nights = daysBack(7).map(d => ({ d, ...night(dkey(d)) })), nStreak = named("night", k => night(k).ok), gStreak = named("goal", withinGoal);
    return `${sd < sn ? `<a class="card btn block feature" href="#/tour"><span class="fi f-blue">🧭</span><span style="flex:1"><b>Take the 2-minute tour</b><br><span class="mute">See which feature solves which problem · ${sd} of ${sn} set up</span></span></a>` : ""}
    <a class="card btn block gring" href="#/usage"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="track"/><circle cx="60" cy="60" r="52" class="val ${over ? "over" : ""}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
      <span class="gin"><b>${used ? hm(used) : "–"}</b><small>of ${hm(g)}</small></span>
      <span class="gside"><small>Remaining goal</small><b>${used ? (over ? `Over by ${hm(used - g)}` : `${hm(g - used)} left`) : "Log today"}</b><small>Focus today</small><b>${hm(fmin)}</b><small>Pauses today</small><b>${S().checkins.filter(x => dkey(new Date(x)) === t).length}</b></span></a>
    <div class="grid2 tight"><a class="card btn mini" href="#/pomo"><small>Focus</small><b>${focusing ? "On" : "Off"}</b><span class="mute">${focusing ? "Session running" : "No active session"}</span></a>
      <a class="card btn mini" href="#/achievements"><small>Achievements</small><b>${won}/${bs.length}</b><span class="lav">unlocked · view</span></a></div>
    <div class="row"><a class="btn primary pillbtn" href="#/limits">⏳ Set limits</a><a class="btn pillbtn teal" href="#/pomo">🧘 Start focus</a></div>
    ${whyEdit ? `<div class="card"><label for="why">My why</label><textarea id="why" rows="2" maxlength="200" placeholder="e.g. I want my evenings back for friends and sleep">${esc(S().why || "")}</textarea><button class="primary wide" data-act="saveWhy">Save</button></div>`
      : `<button class="card btn block why" data-act="editWhy"><b>My why</b><br><span class="${S().why ? "" : "mute"}">${S().why ? esc(S().why) : "Why do you want to use your phone less? Tap to write it. We'll remind you when you're tempted."}</span></button>`}
    <div class="grid2 tight"><a class="card btn mini green" href="#/achievements"><small>Days within goal</small><b>${gStreak} in a row</b><span class="mute">Logged days under ${hm(g)}</span></a>
      <a class="card btn mini" href="#/sleep"><small>Phone-free nights</small><b>${nStreak} in a row</b><span class="mute">Bedtime ${S().settings.bedtime}</span></a></div>
    <a class="card btn block" href="#/sleep" style="display:block;color:inherit"><div class="cardhead"><span class="fi f-amber" style="width:40px;height:40px;flex-basis:40px">🌙</span><span style="flex:1;margin-left:12px"><b>${nStreak} phone-free night${nStreak === 1 ? "" : "s"} in a row</b><br><small class="mute">Lights out by ${S().settings.bedtime} (+30 min)</small></span></div>
      <div class="nights">${nights.map(n => `<span><i class="${n.ok ? "ok" : n.logged ? "no" : ""}">${n.ok ? "✓" : n.logged ? "✕" : "·"}</i><b>${WEEKDAY.format(n.d)}</b><small>${n.late == null ? (n.ok ? "✓" : "") : n.late <= 0 ? "on time" : `+${n.late}m`}</small></span>`).join("")}</div></a>
    <div class="card"><div class="cardhead"><b>Last 7 days</b><small class="mute">${Object.keys(S().usage).filter(logged).length ? "" : "Not enough history yet"}</small></div>${goalBars(7, { labels: true })}<p class="mute">Dashed line: your daily goal. Only days you log are shown.</p></div>`;
  }

  const actions = {
    distRange: a => { distRange = a; render(); },
    setGoal: a => { S().settings.goal = +a; S().settings.goalSet = true; c.save(); render(); },
    pickApps: () => { pickApps = !pickApps; render(); },
    setLimit: a => { const [id, m] = a.split("|"); if (+m) S().limits[id] = +m; else delete S().limits[id]; c.save(); render(); },
    editWhy: () => { whyEdit = true; render(); setTimeout(() => document.getElementById("why")?.focus(), 0); },
    saveWhy: () => { S().why = document.getElementById("why").value.trim().slice(0, 200); whyEdit = false; c.save(); render(); toast("Saved 💭 We'll remind you when it matters."); },
    notNow: () => { S().notNow.push(Date.now()); c.save(); toast("Nice choice 🙌 Phone down."); },
  };
  return {
    routes: { insights, achievements, limits, tour, helps }, tabs: { insights: "me", achievements: "me", limits: "me", tour: "me", helps: "me" },
    actions, today, checkBadges, badgeCount: () => [badgeState().filter(b => b.won).length, BADGES.length],
  };
}
