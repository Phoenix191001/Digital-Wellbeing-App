import { COUNSELOR, BITES, GROUPS, CHALLENGES, MEET_TIPS, BREAKS, SAFE, FRIEND_MSGS, CHECKLIST } from "./content.js";

/* ---------- storage: everything lives on this device only ---------- */
const KEY = "pause.v1";
const DEFAULTS = { settings: { size: "m", dark: true, bites: 5, bedtime: "23:30" }, onboarded: false, focus: [], done: [], notes: [], week: [], checklist: { date: "", items: [] }, timer: null };
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); return { ...DEFAULTS, ...d, settings: { ...DEFAULTS.settings, ...(d && d.settings) } }; }
  catch { return structuredClone(DEFAULTS); }
}
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

function applySettings() {
  document.documentElement.dataset.dark = S.settings.dark ? "1" : "0";
  document.documentElement.dataset.size = S.settings.size;
}

/* ---------- transient state (not stored) ---------- */
let ci = { intent: null, feeling: null };
let bites = { n: 5, idx: 0, set: null };
let chal = { g: "All", m: 0 };
let focusSetup = { min: 25 };
let playSetup = { min: 30 };
let toastMsg = "";

/* ---------- timer ---------- */
// timer = { kind, total (s), endAt (ms) | null, left (s) when paused, goal }
const timer = () => S.timer;
const timeLeft = () => { const t = S.timer; if (!t) return 0; return t.endAt ? (t.endAt - Date.now()) / 1000 : t.left; };
function startTimer(kind, minutes, goal = "") { S.timer = { kind, total: minutes * 60, endAt: Date.now() + minutes * 60000, left: 0, goal }; save(); }
function clearTimer() { S.timer = null; save(); }

/* ---------- share ---------- */
async function share(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast("Copied. Paste it into a chat.");
  } catch (e) { if (e && e.name !== "AbortError") toast("Could not share. Select and copy the text instead."); }
}
function toast(m) { toastMsg = m; render(); setTimeout(() => { toastMsg = ""; render(); }, 2500); }

/* ---------- routing ---------- */
const route = () => (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
const go = h => { location.hash = h; };
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

const TABS = [["", "🏠", "Home"], ["do", "🌱", "Do"], ["read", "📖", "Read"], ["safe", "🛡️", "Stay safe"], ["me", "👤", "Me"]];
const header = (title, back) => `<div class="top">${back ? `<button class="back ghost" data-go="${back}" aria-label="Back">←</button>` : ""}<h1>${title}</h1></div>`;

/* ---------- screens ---------- */
function onboard() {
  const steps = [
    ["Welcome to Pause", "Pause is a calm place to open <b>first</b> when you reach for your phone. It does not block your apps or tell you phone use is bad. It gives you a pause, something better to do, and a path to a real person."],
    ["Your data stays on your phone", "There are no accounts, no server and no tracking. Nothing is sent anywhere. Nobody, not a parent, teacher or staff member, can see what you do here. You can delete everything at any time."],
    ["A real person is always one tap away", "The <b>Talk to someone</b> button shows on every main screen. Pause is not a counselor and cannot diagnose. It can point you to people who can help."],
  ];
  const i = Math.min(+route()[1] || 0, 2), [h, p] = steps[i];
  return `<div class="fullscreen center"><h1>${h}</h1><p>${p}</p><p class="mute">${i + 1} of 3</p>
    <button class="primary block center" data-act="${i === 2 ? "finishOnboard" : "next"}" data-arg="${i + 1}">${i === 2 ? "Get started" : "Next"}</button></div>`;
}

function nightNow() {
  const [bh, bm] = S.settings.bedtime.split(":").map(Number), d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes(), bed = bh * 60 + bm;
  return (mins >= bed - 60 && mins < 24 * 60 && bed >= 12 * 60) || mins < 5 * 60 || (bed < 12 * 60 && mins >= bed - 60 && mins <= bed + 240);
}

function home() {
  const intents = ["Study", "Message someone", "Relax", "Just bored", "Not sure"], feels = ["Bored", "Tired", "Stressed", "Lonely", "Fine"];
  const chips = (arr, key) => `<div class="chips">${arr.map(x => `<button class="${ci[key] === x ? "on" : ""}" data-act="ci" data-arg="${key}|${x}">${x}</button>`).join("")}</div>`;
  const sug = ci.intent ? suggestions() : "";
  return `${header("Pause")}
  ${nightNow() ? `<div class="card warm"><b>It's getting late.</b> <a href="#/night">Open your wind-down</a></div>` : ""}
  <div class="card"><h2 style="margin-top:0">What did you come to do?</h2>${chips(intents, "intent")}
    ${ci.intent ? `<h2>How are you feeling? <span class="mute">(optional)</span></h2>${chips(feels, "feeling")}` : ""}</div>
  ${sug}
  <div class="card"><h2 style="margin-top:0">Planning to scroll?</h2><p class="mute">That's fine. Choose how long, and we'll remind you.</p>
    <button class="primary block" data-act="startScroll" data-arg="10">Remind me in 10 minutes</button>
    <p class="mute">A web app only runs its timer while it is open. Also set a phone alarm to be sure.</p></div>`;
}

function suggestions() {
  const out = [], add = (t, d, h) => { if (out.length < 3 && !out.some(o => o.h === h)) out.push({ t, d, h }); };
  const { intent, feeling } = ci;
  if (intent === "Message someone") out.push({ t: "Do it, then come back", d: "Send your message. Pause will be here after.", h: "" });
  if (intent === "Study") add("Start a focus session", "One goal, a clear end.", "#/focus");
  if (feeling === "Lonely") { add("Connect with someone", "A small step toward a person.", "#/challenges/Connect"); add("Talk to someone", "Campus counselor or a trusted friend.", "#/talk"); }
  if (feeling === "Stressed") { add("A calm moment", "Breathing, tea or quiet time.", "#/challenges/Calm"); add("Talk to someone", "You don't have to carry it alone.", "#/talk"); }
  if (["Bored", "Tired"].includes(feeling) || ["Just bored", "Relax", "Not sure"].includes(intent)) { add("Read a few short bites", "A finite set. It ends.", "#/read"); add("Try something else", "A quick challenge, 5 to 30 minutes.", "#/challenges"); }
  if (!out.length) add("Try something else", "A quick challenge.", "#/challenges");
  return `<h2>Ideas for you</h2>` + out.map(o => o.h
    ? `<a class="card btn block" style="display:block;color:inherit;text-align:left" href="${o.h}"><b>${o.t}</b><br><span class="mute">${o.d}</span></a>`
    : `<div class="card warm"><b>${o.t}</b><br><span class="mute">${o.d}</span></div>`).join("");
}

function scrollTimer() {
  const t = timer();
  if (!t || t.kind !== "scroll") return `<div class="fullscreen center"><p>No timer is running.</p><a class="btn primary" href="#/">Back to Home</a></div>`;
  if (timeLeft() <= 0) return `<div class="fullscreen center"><h1>Ten minutes are up.</h1><p>Stop, or choose 5 more?</p>
    <button class="primary block center" data-act="stopTimer">I'll stop now</button>
    <button class="block center" data-act="startScroll" data-arg="5">5 more minutes</button></div>`;
  return `<div class="fullscreen center"><p>Scroll time. We'll tell you when it's up.</p><div class="big" id="tm">${fmt(timeLeft())}</div>
    <button class="block center" data-act="stopTimer">End early</button><p class="mute">Keep this page open, and set a phone alarm too.</p></div>`;
}

function doMenu() {
  const wk = S.focus.filter(f => f.ts >= weekStart()).reduce((a, f) => a + f.min, 0);
  return `${header("Do")}
  <a class="card btn block" style="display:block;color:inherit" href="#/focus"><b>🎯 Focus session</b><br><span class="mute">Study with a clear start and end. ${wk} min this week.</span></a>
  <a class="card btn block" style="display:block;color:inherit" href="#/challenges"><b>🌱 Something else to do</b><br><span class="mute">25+ small activities, alone or with a friend.</span></a>
  <a class="card btn block" style="display:block;color:inherit" href="#/play"><b>🎮 Play timer</b><br><span class="mute">Set a limit before you start gaming.</span></a>
  <h2>Ways to meet people</h2><div class="card">${MEET_TIPS.map(t => `<p>• ${t}</p>`).join("")}</div>`;
}

function focusPage() {
  const sub = route()[1], t = timer();
  if (sub === "run" || (t && t.kind === "focus")) return focusRun();
  return `${header("Focus session", "#/do")}
  <div class="card"><label>How long?</label><div class="chips">${[10, 25, 45].map(m => `<button class="${focusSetup.min === m ? "on" : ""}" data-act="fmin" data-arg="${m}">${m} min</button>`).join("")}</div>
  <label for="goal">One goal for this session</label><input id="goal" type="text" maxlength="100" placeholder="e.g. finish lab report intro" autocomplete="off">
  <button class="primary block center" style="margin-top:16px" data-act="startFocus">Start</button></div>
  <div class="card warm"><b>Tip:</b> Mute notifications while you study. <a href="#/safe/notif">See the guide</a></div>`;
}
function focusRun() {
  const t = timer();
  if (!t || t.kind !== "focus") return `<div class="fullscreen center"><p>No session is running.</p><a class="btn primary" href="#/focus">Set one up</a></div>`;
  if (timeLeft() <= 0 && t.endAt) {
    const mins = Math.round(t.total / 60);
    S.focus.push({ ts: Date.now(), min: mins }); clearTimer();
    S.lastFocus = mins; save();
    return focusDone();
  }
  const paused = !t.endAt;
  return `<div class="fullscreen center"><p class="mute">Your goal</p><h2 style="margin-top:0">${esc(t.goal || "Focus")}</h2><div class="big" id="tm">${fmt(timeLeft())}</div>
    <button class="block center" data-act="${paused ? "resumeFocus" : "pauseFocus"}">${paused ? "Resume session" : "Pause session"}</button>
    <button class="ghost block center" data-act="stopTimer" data-arg="#/focus">End session</button></div>`;
}
function focusDone() {
  const wk = S.focus.filter(f => f.ts >= weekStart()).reduce((a, f) => a + f.min, 0);
  return `${header("Well done.")}<div class="card"><p>You focused for ${S.lastFocus} minutes.</p><p><b>${wk} minutes</b> this week.</p></div>
  <div class="card"><b>Take a break that isn't a feed</b>${BREAKS.map(b => `<p>• ${b}</p>`).join("")}</div>
  <a class="btn primary block center" href="#/">Back to Home</a>`;
}

function play() {
  const t = timer();
  if (t && t.kind === "play") {
    if (timeLeft() <= 0) return `<div class="fullscreen center"><h1>Time's up.</h1><p>You set this limit for yourself. Nice job noticing.</p><p class="mute">Stretch, drink some water, or try something else.</p>
      <button class="primary block center" data-act="stopTimer" data-arg="#/challenges">Something else to do</button><button class="block center" data-act="stopTimer" data-arg="#/">Done</button></div>`;
    return `<div class="fullscreen center"><p>Playing. Limit you set:</p><div class="big" id="tm">${fmt(timeLeft())}</div><button class="ghost block center" data-act="stopTimer" data-arg="#/do">End early</button></div>`;
  }
  return `${header("Play timer", "#/do")}<div class="card"><p>Set a limit before you start playing.</p><div class="chips">${[15, 30, 60, 90].map(m => `<button class="${playSetup.min === m ? "on" : ""}" data-act="pmin" data-arg="${m}">${m} min</button>`).join("")}</div>
  <button class="primary block center" style="margin-top:16px" data-act="startPlay">Start</button></div><p class="mute">The timer runs only while Pause is open. Set a phone alarm too.</p>`;
}

function challenges() {
  const r = route(); if (r[1] && GROUPS.includes(r[1]) && chal.g !== r[1]) chal.g = r[1];
  const list = CHALLENGES.filter(c => (chal.g === "All" || c.g === chal.g) && (!chal.m || c.m === chal.m));
  const done = new Set(S.done.map(d => d.id));
  return `${header("Something else to do", "#/do")}
  <div class="chips">${["All", ...GROUPS].map(g => `<button class="${chal.g === g ? "on" : ""}" data-act="cg" data-arg="${g}">${g}</button>`).join("")}</div>
  <div class="chips" style="margin-top:8px">${[0, 5, 15, 30].map(m => `<button class="${chal.m === m ? "on" : ""}" data-act="cm" data-arg="${m}">${m ? m + " min" : "Any time"}</button>`).join("")}</div>
  ${list.map(c => `<a class="card btn block" style="display:block;color:inherit" href="#/challenge/${c.id}"><span class="tag">${c.g} · ${c.m} min</span>${done.has(c.id) ? ' <span class="tag">✓ done</span>' : ""}<br>${c.t}</a>`).join("") || '<p class="mute">Nothing matches. Try another time.</p>'}`;
}
function challenge() {
  const c = CHALLENGES.find(x => x.id === route()[1]); if (!c) return challenges();
  const n = S.done.filter(d => d.id === c.id).length;
  return `${header(c.g, "#/challenges")}<div class="card"><span class="tag">${c.m} min</span><h2 style="margin-top:0">${c.t}</h2>
  ${n ? `<p class="mute">You've done this ${n} time${n > 1 ? "s" : ""}. Just for you. No points.</p>` : ""}
  <button class="primary block center" data-act="didIt" data-arg="${c.id}">I did it</button>
  <button class="block center" data-act="invite" data-arg="${c.id}">Do it together: invite a friend</button></div>
  <p class="mute">Marking it done is private. There are no points or streaks.</p>`;
}

function read() {
  if (route()[1] === "go" && bites.set) return bitesRun();
  return `${header("Read")}<div class="card"><p>Short, useful cards. A set always ends.</p><label>How many cards? ${bites.n}</label>
    <input type="range" min="3" max="10" value="${bites.n}" data-range="bites" style="width:100%;height:32px"><button class="primary block center" data-act="startBites">Start</button></div>`;
}
function bitesRun() {
  if (bites.idx >= bites.set.length) return `<div class="fullscreen center"><h1>You're done for now.</h1><p>Here's something to do:</p>
    <a class="btn primary block center" href="#/challenges">Pick a small activity</a><a class="btn block center" href="#/">Back to Home</a></div>`;
  const b = bites.set[bites.idx];
  return `<p class="mute">${bites.idx + 1} of ${bites.set.length}</p><div class="progress"><i style="width:${((bites.idx + 1) / bites.set.length) * 100}%"></i></div>
  <div class="card"><span class="tag">${b.t}</span><h2 style="margin-top:0">${b.h}</h2><p>${b.b}</p></div>
  <button class="primary block center" data-act="nextBite">${bites.idx + 1 === bites.set.length ? "Finish" : "Next"}</button>`;
}

function safe() {
  const id = route()[1];
  if (id) {
    const c = SAFE.find(x => x.id === id); if (c)
      return `${header(c.h, "#/safe")}<div class="card"><p class="mute">${c.s}</p><ol class="steps">${c.steps.map(s => `<li>${s}</li>`).join("")}</ol></div>
      <a class="btn block center" href="#/talk">If something is wrong, talk to someone</a>`;
  }
  return `${header("Stay safe")}<p class="mute">Simple steps that help you keep the apps you need.</p>
  ${SAFE.map(c => `<a class="card btn block" style="display:block;color:inherit" href="#/safe/${c.id}"><b>${c.icon} ${c.h}</b><br><span class="mute">${c.s}</span></a>`).join("")}`;
}

function talk() {
  return `${header("Talk to someone", "#/")}
  <div class="card"><h2 style="margin-top:0">Campus counselor</h2><p><b>${COUNSELOR.name}</b></p>
    <p class="mute">${COUNSELOR.contact ? esc(COUNSELOR.contact) : "Ask at your campus student office for his room and timings."}</p></div>
  <div class="card"><h2 style="margin-top:0">Text a trusted friend</h2><p class="mute">Pick a message. Your phone's share sheet opens. Nothing is sent by Pause.</p>
    ${FRIEND_MSGS.map((m, i) => `<button class="block" data-act="shareMsg" data-arg="${i}">“${m}”</button>`).join("")}</div>
  <div class="card warm"><b>If you are in immediate danger or thinking of harming yourself, contact campus security or emergency services now.</b></div>
  <p class="mute">Pause is not a counselor and cannot diagnose.</p>
  <a class="btn block center" href="#/notes">Private mood notes</a>`;
}

function me() {
  return `${header("Me")}
  ${[["#/night", "🌙 Night wind-down"], ["#/week", "📅 My week"], ["#/notes", "📝 Private mood notes"], ["#/settings", "⚙️ Settings"], ["#/privacy", "🔒 Privacy"], ["#/guide", "📘 User guide"]]
    .map(([h, t]) => `<a class="card btn block" style="display:block;color:inherit" href="${h}">${t}</a>`).join("")}`;
}

function night() {
  const d = new Date(), tm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), late = d.getHours() < 5;
  if (S.checklist.date !== today()) { S.checklist = { date: today(), items: [] }; save(); }
  return `${header("Night wind-down", "#/me")}
  <div class="card warm"><b>It's <span id="clock">${tm}</span>.</b> ${late ? "Five more minutes can become an hour." : `Bedtime is at ${S.settings.bedtime}.`}</div>
  <div class="card"><label for="bed">My bedtime</label><input id="bed" type="time" value="${S.settings.bedtime}" data-field="bedtime">
  <h2>Tick what you did</h2>${CHECKLIST.map((c, i) => `<label class="check" style="font-weight:400"><input type="checkbox" data-check="${i}" ${S.checklist.items.includes(i) ? "checked" : ""}>${c}</label>`).join("")}</div>
  <div class="card"><b>In the morning:</b> don't pick the phone up first.</div>
  <a class="card btn block" style="display:block;color:inherit" href="#/safe/tools">Set your phone's own bedtime or Do Not Disturb</a>`;
}

function week() {
  const ws = weekStart(), f = S.focus.filter(x => x.ts >= ws).reduce((a, x) => a + x.min, 0);
  const days = S.week.filter(w => new Date(w.date + "T00:00").getTime() >= ws);
  const sl = days.filter(w => w.sleep != null), we = sl.filter(w => [0, 6].includes(new Date(w.date + "T00:00").getDay())), wd = sl.filter(w => ![0, 6].includes(new Date(w.date + "T00:00").getDay()));
  const avg = a => a.reduce((s, x) => s + x.sleep, 0) / a.length;
  const lines = [`You focused for ${(f / 60).toFixed(1)} hours this week.`];
  if (sl.length) lines.push(`You slept about ${avg(sl).toFixed(1)} hours a night.`);
  if (we.length && wd.length && avg(we) > avg(wd)) lines.push("You slept longer on weekends.");
  const t = S.week.find(w => w.date === today()) || {};
  return `${header("My week", "#/me")}
  <div class="card"><h2 style="margin-top:0">This week</h2>${lines.map(l => `<p>${l}</p>`).join("")}${days.length ? `<p class="mute">Phone: ${days.filter(d => d.phone != null).map(d => d.phone + "h").join(", ") || "not entered"}</p>` : ""}</div>
  <div class="card"><h2 style="margin-top:0">Today</h2><p class="mute">Optional. Use your phone's own numbers.</p>
    <label for="wp">Hours on phone</label><input id="wp" type="number" min="0" max="24" step="0.5" value="${t.phone ?? ""}">
    <label for="ws">Hours slept last night</label><input id="ws" type="number" min="0" max="24" step="0.5" value="${t.sleep ?? ""}">
    <button class="primary block center" style="margin-top:12px" data-act="saveDay">Save today</button></div>
  <button class="ghost block center" data-act="delWeek">Delete this data</button>`;
}

function notes() {
  return `${header("Private mood notes", "#/talk")}<p class="mute">Stored only on this phone. Not a clinical record. Never shared.</p>
  <div class="card"><label for="nt">How do you feel?</label><textarea id="nt" rows="3" maxlength="500"></textarea><button class="primary block center" style="margin-top:8px" data-act="addNote">Save note</button></div>
  ${S.notes.map((n, i) => `<div class="note"><div><span class="mute">${new Date(n.ts).toLocaleString()}</span><br>${esc(n.text)}</div><button class="ghost" data-act="delNote" data-arg="${i}" aria-label="Delete note">Delete</button></div>`).join("")}
  ${S.notes.length ? '<button class="ghost block center" data-act="delNotes">Delete all notes</button>' : '<p class="mute">No notes yet.</p>'}`;
}

function settings() {
  const s = S.settings;
  return `${header("Settings", "#/me")}<div class="card">
  <label for="sz">Text size</label><select id="sz" data-field="size">${[["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]].map(([v, n]) => `<option value="${v}" ${s.size === v ? "selected" : ""}>${n}</option>`).join("")}</select>
  <label class="check" style="font-weight:600"><input type="checkbox" data-field="dark" ${s.dark ? "checked" : ""}>Dark mode</label>
  <label for="bc">Cards per reading set: <span id="bcv">${s.bites}</span></label><input id="bc" type="range" min="3" max="10" value="${s.bites}" data-field="bites" style="width:100%;height:32px">
  <label for="bd">Bedtime</label><input id="bd" type="time" value="${s.bedtime}" data-field="bedtime"></div>
  <button class="danger block center" data-act="delAll">Delete all my data</button>`;
}

function privacy() {
  return `${header("Privacy", "#/me")}<div class="card"><p>Pause stores only these things, <b>on this device</b>:</p>
  <p>• Your settings (text size, dark mode, bedtime)<br>• Focus minutes<br>• Challenges you marked done<br>• Mood notes you wrote<br>• Hours you entered in My week</p>
  <p>Pause has no accounts, no server, no analytics and no trackers. It never asks for your name, phone number, location or contacts. Nobody else can see your data.</p>
  <p>Delete any of it, or all of it, in Settings.</p></div>`;
}

function guide() {
  return `${header("User guide", "#/me")}<div class="card"><ol class="steps">
  <li>Open the link and add Pause to your home screen. Android Chrome: menu, then <i>Add to Home screen</i>. iPhone Safari: Share, then <i>Add to Home Screen</i>.</li>
  <li>Open Pause when you reach for your phone, and answer the check-in.</li>
  <li>Try a focus session, a reading set, or a challenge.</li>
  <li>Use <b>Talk to someone</b> if you need a person.</li>
  <li>Check <b>Stay safe</b> for scams, privacy and notifications.</li>
  <li>Your data stays on your phone. Delete it any time in Me, then Settings.</li></ol></div>
  <p class="mute">Pause cannot see or block other apps or measure real phone use. Timers run only while it is open.</p>`;
}

/* ---------- render ---------- */
const MAIN = { "": home, scroll: scrollTimer, do: doMenu, focus: focusPage, play, challenges, challenge, read, safe, talk, me, night, week, notes, settings, privacy, guide };
function render() {
  const r = route(), name = r[0] || "";
  if (!S.onboarded && name !== "onboard") return go("#/onboard");
  const fn = name === "onboard" ? onboard : MAIN[name] || home;
  const focusing = timer() && timer().kind === "focus" && name === "focus";
  const bare = name === "onboard" || focusing || name === "talk";
  const tab = { challenges: "do", challenge: "do", focus: "do", play: "do", scroll: "", night: "me", week: "me", notes: "me", settings: "me", privacy: "me", guide: "me", talk: "" }[name] ?? name;
  $("#app").innerHTML = fn() + (name === "onboard" ? "" : `${bare ? "" : '<a class="talk" href="#/talk">💬 Talk to someone</a>'}
    ${focusing ? "" : `<nav class="tabs" aria-label="Main"><div>${TABS.map(([h, i, l]) => `<a href="#/${h}" class="${tab === h ? "on" : ""}" ${tab === h ? 'aria-current="page"' : ""}><span aria-hidden="true">${i}</span>${l}</a>`).join("")}</div></nav>`}`)
    + (toastMsg ? `<div role="status" style="position:fixed;top:12px;left:12px;right:12px;max-width:456px;margin:auto;background:var(--ink);color:var(--bg);padding:12px;border-radius:12px;z-index:9">${esc(toastMsg)}</div>` : "");
}

/* ---------- actions ---------- */
const A = {
  next: a => go(`#/onboard/${a}`),
  finishOnboard: () => { S.onboarded = true; save(); go("#/"); },
  ci: a => { const [k, v] = a.split("|"); ci[k] = ci[k] === v ? null : v; if (k === "intent" && !ci.intent) ci.feeling = null; render(); },
  startScroll: a => { startTimer("scroll", +a); go("#/scroll"); render(); },
  stopTimer: a => { clearTimer(); go(a || "#/"); render(); },
  fmin: a => { focusSetup.min = +a; render(); },
  pmin: a => { playSetup.min = +a; render(); },
  startFocus: () => { startTimer("focus", focusSetup.min, ($("#goal").value || "").trim()); go("#/focus/run"); render(); },
  pauseFocus: () => { const t = S.timer; t.left = (t.endAt - Date.now()) / 1000; t.endAt = null; save(); render(); },
  resumeFocus: () => { const t = S.timer; t.endAt = Date.now() + t.left * 1000; save(); render(); },
  startPlay: () => { startTimer("play", playSetup.min); render(); },
  cg: a => { chal.g = a; render(); }, cm: a => { chal.m = +a; render(); },
  didIt: a => { S.done.push({ ts: Date.now(), id: a }); save(); toast("Nice. Logged privately."); },
  invite: a => { const c = CHALLENGES.find(x => x.id === a); share(`Want to try this with me? ${c.t} (${c.m} min)`); },
  startBites: () => { bites.set = [...BITES].sort(() => Math.random() - .5).slice(0, S.settings.bites); bites.idx = 0; go("#/read/go"); render(); },
  nextBite: () => { bites.idx++; render(); window.scrollTo(0, 0); },
  shareMsg: a => share(FRIEND_MSGS[+a]),
  addNote: () => { const v = $("#nt").value.trim(); if (!v) return; S.notes.unshift({ ts: Date.now(), text: v }); save(); render(); },
  delNote: a => { S.notes.splice(+a, 1); save(); render(); },
  delNotes: () => { if (confirm("Delete all notes?")) { S.notes = []; save(); render(); } },
  saveDay: () => {
    const p = $("#wp").value, s = $("#ws").value, d = today();
    S.week = S.week.filter(w => w.date !== d);
    S.week.push({ date: d, phone: p === "" ? null : +p, sleep: s === "" ? null : +s }); save(); toast("Saved on this phone.");
  },
  delWeek: () => { if (confirm("Delete your My week data?")) { S.week = []; save(); render(); } },
  delAll: () => { if (confirm("Delete all your data from this phone?")) { localStorage.removeItem(KEY); S = structuredClone(DEFAULTS); applySettings(); go("#/onboard"); render(); } },
};
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) { history.length > 1 ? history.back() : go(g.dataset.go); return; }
  const b = e.target.closest("[data-act]"); if (b && A[b.dataset.act]) A[b.dataset.act](b.dataset.arg);
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.field) {
    const k = el.dataset.field, v = el.type === "checkbox" ? el.checked : k === "bites" ? +el.value : el.value;
    S.settings[k] = v; if (k === "bites") bites.n = v; save(); applySettings();
    if (k === "bites") $("#bcv").textContent = v; else if (k !== "bedtime") render();
  }
  if (el.dataset.check != null) { const i = +el.dataset.check, it = S.checklist.items; el.checked ? it.includes(i) || it.push(i) : it.splice(it.indexOf(i), 1); save(); }
});
document.addEventListener("input", e => { if (e.target.dataset.range === "bites") { bites.n = +e.target.value; S.settings.bites = bites.n; save(); e.target.previousElementSibling.textContent = `How many cards? ${bites.n}`; } });

/* ---------- tick: update running timers & clock without losing input ---------- */
setInterval(() => {
  const el = $("#tm"), t = timer();
  if (el && t) { if (timeLeft() <= 0) render(); else el.textContent = fmt(timeLeft()); }
  const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer()) render(); });

bites.n = S.settings.bites;
applySettings();
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
