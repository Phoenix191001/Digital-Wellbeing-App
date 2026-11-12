import { initPeople } from "./people.js";
import { initStudy } from "./study.js";
import { initWell } from "./wellbeing.js";
import { initAuth } from "./auth.js";
import { initInsights } from "./insights.js";
import { initReminders } from "./reminders.js";
import { COUNSELOR, BITES, GROUPS, CHALLENGES, MEET_TIPS, BREAKS, SAFE, FRIEND_MSGS, CHECKLIST } from "./content.js";

/* ---------- storage: everything lives on this device only ---------- */
const KEY = "pause.v1";
const DEFAULTS = {
  settings: { size: "m", dark: true, theme: "red", bites: 5, bedtime: "23:30", syncNotes: false, goal: 180, strict: false, haptics: true }, onboarded: false, focus: [], done: [], notes: [], week: [], checklist: { date: "", items: [] }, timer: null,
  profile: { name: "" }, pomo: { work: 25, short: 5, long: 15, rounds: 4, sound: true }, goals: [], tasks: [], decks: [], reviews: [],
  usage: {}, limits: {}, sleepLog: [], sleepStart: null, mood: {}, checkins: [], pauseTime: {}, tomb: [],
  why: "", notNow: [], badges: {}, nightDone: {}, flags: {}, rem: { on: false, timer: true, wind: true, daily: "" },
};
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); return { ...structuredClone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d && d.settings) }, pomo: { ...DEFAULTS.pomo, ...(d && d.pomo) }, rem: { ...DEFAULTS.rem, ...(d && d.rem) }, profile: { ...DEFAULTS.profile, ...(d && d.profile) } }; }
  catch { return structuredClone(DEFAULTS); }
}
let dataVer = 0; // bumps whenever data changes, so cached summaries know to refresh
const saveLocal = () => { dataVer++; localStorage.setItem(KEY, JSON.stringify(S)); };
const save = () => { saveLocal(); if (AU) AU.queue(); if (IN) IN.checkBadges(); if (RM) RM.sync(); };
let AU = null, IN = null, RM = null;
const uid = () => [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(16).padStart(2, "0")).join("");
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }

// Layout: "phone" (phone-sized view, framed on big screens) or "pc" (full screen with a side menu).
// No choice yet = pick by screen size.
const layout = () => S.settings.layout || (window.innerWidth >= 1024 && window.matchMedia("(pointer: fine)").matches ? "pc" : "phone");
window.addEventListener("resize", () => { if (!S.settings.layout && document.documentElement.dataset.layout !== layout()) applySettings(); });
function applySettings() {
  document.documentElement.dataset.layout = layout();
  const ls = document.getElementById("lswitch"); if (ls) { const pc = layout() === "pc"; ls.dataset.arg = pc ? "phone" : "pc"; ls.textContent = pc ? "📱 Phone view" : "💻 Full-screen view"; }
  document.documentElement.dataset.dark = S.settings.dark ? "1" : "0";
  document.documentElement.dataset.size = S.settings.size;
  document.documentElement.dataset.theme = S.settings.theme || "red";
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = S.settings.theme === "midnight" ? (S.settings.dark ? "#10132a" : "#f4f5ff") : (S.settings.dark ? "#0b0b0c" : "#c8102e");
}

/* ---------- transient state (not stored) ---------- */
let ci = { intent: null, feeling: null };
let bites = { n: 5, idx: 0, set: null };
let chal = { g: "All", m: 0 };
let focusSetup = { min: 25 };
let playSetup = { min: 30 };
let toastMsg = "";


const I = (p, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  do: I('<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 8-6 0 4-3 6-8 6z"/><path d="M12 15c0-3-2-5-7-5 0 3 2 5 7 5z"/>'),
  read: I('<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/>'),
  safe: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  me: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  pause: I('<rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>', 2.4),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  check: I('<path d="M5 12l5 5 9-10"/>', 2.6),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', 2),
  study: I('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>'),
  game: I('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11.5" r=".8"/><circle cx="18.5" cy="13.5" r=".8"/>'),
};
const hero = (ic, title, sub) => `<div class="hero"><div class="tile">${ICON[ic]}</div><h1>${title}</h1><p class="mute">${sub}</p></div>`;
const countdown = (label, cap) => `<div class="cd"><div class="lbl">${label}</div><div class="big" id="tm">${fmt(timeLeft())}</div><div class="cap">${cap}</div></div>`;

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
/* ---------- smooth rendering: patch the DOM instead of replacing it ---------- */
// Keeps focus, typed text, scroll position, open <details> and running animations while the UI updates.
function patch(root, html) {
  const t = document.createElement("template"); t.innerHTML = html;
  morphKids(root, t.content);
}
// Match children by identity (tag + id/class), so a card added above doesn't force everything below to be rebuilt.
const sig = n => (n.nodeType === 1 ? `${n.tagName}#${n.id}.${n.getAttribute("class") || ""}` : `#${n.nodeType}`);
function morphKids(dst, src) {
  const s = [...src.childNodes];
  let j = 0;
  for (const b of s) {
    const cur = dst.childNodes[j], want = sig(b);
    if (cur && sig(cur) === want) { morphNode(cur, b, dst); j++; continue; }
    let hit = null;
    for (let k = j + 1, n = 0; k < dst.childNodes.length && n < 8; k++, n++) if (sig(dst.childNodes[k]) === want) { hit = dst.childNodes[k]; break; }
    if (hit) { dst.insertBefore(hit, cur); morphNode(hit, b, dst); j++; continue; }
    if (cur && cur.nodeType === b.nodeType && (cur.nodeType !== 1 || cur.tagName === b.tagName) && !s.slice(s.indexOf(b) + 1, s.indexOf(b) + 9).some(x => sig(x) === sig(cur))) { morphNode(cur, b, dst); j++; continue; }
    dst.insertBefore(b, cur || null); j++;
  }
  while (dst.childNodes.length > j) dst.removeChild(dst.lastChild);
}
function morphNode(a, b, dst) {
  if (a.nodeType !== b.nodeType || (a.nodeType === 1 && a.tagName !== b.tagName)) return void dst.replaceChild(b, a);
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const keep = a.tagName === "DETAILS" ? "open" : null;
  for (const at of [...a.attributes]) if (at.name !== keep && !b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (at.name !== keep && a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  const typing = a === document.activeElement;
  if (a.tagName === "TEXTAREA") { if (!typing && a.value !== b.value) a.value = b.value; return; }
  if (a.tagName === "INPUT") {
    if (a.type === "checkbox" || a.type === "radio") a.checked = b.checked;
    else if (!typing && a.type !== "file" && a.value !== b.value) a.value = b.value;
    return;
  }
  morphKids(a, b);
  if (a.tagName === "SELECT" && !typing && a.value !== b.value) a.value = b.value;
}
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastRoute = null;
// Tiny vibration on taps (Android; iPhone ignores it). Can be turned off in Settings.
function buzz(ms = 8) { try { if (S.settings.haptics !== false && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.isActive)) navigator.vibrate(ms); } catch { /* ignore */ } }
function toast(m) { toastMsg = m; render(); setTimeout(() => { toastMsg = ""; render(); }, 2500); }

/* ---------- routing ---------- */
const route = () => (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
const go = h => { location.hash = h; };
window.addEventListener("hashchange", () => { $("#app").scrollTop = 0; render(); }); // reset scroll first: avoids a second layout pass

const TABS = [["", "home", "Home"], ["study", "study", "Study"], ["do", "do", "Do"], ["read", "read", "Read"], ["safe", "safe", "Stay safe"], ["me", "me", "Me"]];
const header = (title, back) => `<div class="top">${back ? `<button class="back ghost" data-go="${back}" aria-label="Back">←</button>` : ""}<h1>${title}</h1></div>`;

/* ---------- screens ---------- */
function onboard() {
  const steps = [
    ["👋", "Welcome to سكون", "<b>سكون</b> (sukoon) means calm, stillness. A calm place to open <b>first</b> when you reach for your phone. It doesn't block your apps or tell you phone use is bad. It gives you a pause, something better to do, and a path to a real person."],
    ["🔒", "Private by default", "Without an account, everything stays on this phone. No ads, no analytics, no tracking. Nobody, not a parent, teacher or staff member, can see what you do here. Delete everything any time."],
    ["💬", "A real person is one tap away", "The <b>Talk to someone</b> button shows on every main screen. سكون is not a counselor and cannot diagnose. It can point you to people who can help."],
    ["☁️", "Save your progress?", "Create a free account to back up your study goals, flashcards and garden, and use them on another device. It's optional."],
  ];
  const i = Math.min(+route()[1] || 0, 3), [e, h, p] = steps[i], cur = layout();
  const pick = i === 0 ? `<p style="margin-top:18px"><b>How do you want to use it?</b></p><div class="layoutpick">
      <button class="lp ${cur === "phone" ? "on" : ""}" data-act="setLayout" data-arg="phone" aria-pressed="${cur === "phone"}"><span>📱</span><b>Phone</b><small>Phone-sized view, made for one hand</small></button>
      <button class="lp ${cur === "pc" ? "on" : ""}" data-act="setLayout" data-arg="pc" aria-pressed="${cur === "pc"}"><span>💻</span><b>Computer</b><small>Fills your whole screen, with a side menu</small></button></div>
    <p class="mute" style="font-size:.85em">You can switch any time in Settings.</p>` : "";
  return `<div class="fullscreen center">${i === 0 ? `<img src="icon-192.png" alt="سكون logo" width="96" height="96" style="border-radius:26px;margin:0 auto 6px;box-shadow:0 10px 40px rgba(217,31,42,.35)">` : `<div class="emoji-xl">${e}</div>`}<h1>${h}</h1><p>${p}</p>${pick}<div class="dots">${steps.map((_, j) => `<i class="${j === i ? "on" : ""}"></i>`).join("")}</div>
    ${i < 3 ? `<button class="primary wide" data-act="next" data-arg="${i + 1}">Next</button>` : `<a class="btn primary wide" href="#/signup">Create account ✨</a><a class="btn wide" href="#/signin">I have an account</a><button class="ghost wide" data-act="finishOnboard">Continue without an account</button>`}</div>`;
}

function nightNow() {
  const [bh, bm] = S.settings.bedtime.split(":").map(Number), d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes(), bed = bh * 60 + bm;
  return (mins >= bed - 60 && mins < 24 * 60 && bed >= 12 * 60) || mins < 5 * 60 || (bed < 12 * 60 && mins >= bed - 60 && mins <= bed + 240);
}

/* ---------- install (PWA) ---------- */
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; if (["install", ""].includes(route()[0] || "")) render(); });
window.addEventListener("appinstalled", () => { deferredInstall = null; S.flags.installed = true; saveLocal(); toast("Installed ✅ Open سكون from your home screen."); });
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const platform = () => (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop");
function install() {
  const pf = platform(), ios = `<ol class="steps lgsteps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button <span class="kbd">⬆︎</span> at the bottom of the screen.</li><li>Scroll down and tap <b>Add to Home Screen</b> <span class="kbd">➕</span>.</li><li>Tap <b>Add</b>. سكون appears on your home screen 🎉</li></ol>`;
  const android = `<ol class="steps lgsteps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the menu <span class="kbd">⋮</span> at the top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li><li>Tap <b>Install</b>. سكون appears with your other apps 🎉</li></ol>`;
  const desktop = `<div class="qrbox"><img src="qr.svg" alt="QR code for ${location.host}" width="180" height="180"><div><b>Scan with your phone camera</b><p class="mute">or type <b>${location.host}</b> in your phone's browser, then follow the steps for your phone.</p></div></div>`;
  return `${header("Install سكون 📲", "#/me")}
  <div class="card center"><img src="icon-192.png" alt="" width="84" height="84" style="border-radius:22px"><h2 style="margin:.4em 0 0">سكون <span class="mute" style="font-weight:400">· Sukoon</span></h2>
    <p class="mute">Free · no app store needed · works offline · updates itself</p>
    ${standalone() ? `<p class="okmsg">✅ You're using the installed app. You're all set!</p>` : deferredInstall ? `<button class="primary wide" data-act="installNow">📲 Install now</button>` : ""}</div>
  ${standalone() ? "" : `<h2>${pf === "ios" ? "📱 iPhone / iPad" : pf === "android" ? "🤖 Android" : "💻 On a computer? Get it on your phone"}</h2><div class="card">${pf === "ios" ? ios : pf === "android" ? android : desktop}</div>
  ${pf !== "ios" ? `<details class="card"><summary><b>📱 iPhone / iPad steps</b></summary>${ios}</details>` : ""}${pf !== "android" ? `<details class="card"><summary><b>🤖 Android steps</b></summary>${android}</details>` : ""}${pf !== "desktop" ? `<details class="card"><summary><b>💻 Show QR code</b></summary>${desktop}</details>` : ""}`}
  <div class="card"><b>Good to know</b><p class="mute">• It opens full screen like a normal app, with its own icon.<br>• It takes almost no storage and always has the newest version.<br>• Your data stays on this phone (unless you choose to sign in).<br>• To remove it, long-press the icon and choose Remove / Uninstall.</p></div>`;
}
const LONGDATE = new Intl.DateTimeFormat([], { weekday: "long", month: "short", day: "numeric" });
function greet() {
  const h = new Date().getHours(), n = S.profile.name ? `, ${esc(S.profile.name)}` : "";
  return h < 5 ? `Up late${n}? 🌙` : h < 12 ? `Good morning${n} ☀️` : h < 17 ? `Good afternoon${n} 🌤️` : h < 21 ? `Good evening${n} 🌆` : `Good night${n} 🌙`;
}
function home() {
  const intents = [["Study", "📚"], ["Message someone", "💬"], ["Relax", "😌"], ["Just bored", "🥱"], ["Not sure", "🤔"]], feels = [["Bored", "😑"], ["Tired", "😴"], ["Stressed", "😣"], ["Lonely", "🥺"], ["Fine", "🙂"]];
  const chips = (arr, key) => `<div class="chips">${arr.map(([x, e]) => `<button class="${ci[key] === x ? "on" : ""}" data-act="ci" data-arg="${key}|${x}">${e} ${x}</button>`).join("")}</div>`;
  const sug = ci.intent ? suggestions() : "", g = ST.garden(), due = ST.dueTotal(), tasks = S.tasks.filter(t => !t.del && !t.done).length;
  const spark = BITES[Math.floor(Date.now() / 86400000) % BITES.length];
  return `<div class="hello"><div><p class="mute" style="margin:0">${LONGDATE.format(new Date())}</p><h1 style="margin:0">${greet()}</h1></div>
    <a class="avatar sm" href="#/${AU.signedIn() ? "account" : "me"}" aria-label="Me">${esc(Array.from(S.profile.name || "🙂")[0].toUpperCase())}</a></div>
  <span class="pill">${ICON.lock} Private · stays on this phone unless you sign in or post</span>
  ${!standalone() && !S.flags.installHide ? `<div class="card installcard"><a href="#/install"><span class="fi f-teal">📲</span><span><b>Install سكون on your phone</b><br><span class="mute">Add it to your home screen like an app</span></span></a><button class="ghost xbtn" data-act="installHide" aria-label="Hide install tip">✕</button></div>` : ""}
  ${nightNow() ? `<a class="card btn block feature" href="#/sleep"><span class="fi f-purple">🌙</span><span><b>It's getting late</b><br><span class="mute">Open your wind-down or sleep sounds</span></span></a>` : ""}
  <div class="card checkin"><h2 style="margin-top:0">⏸️ What did you come to do?</h2>${S.why ? `<p class="whyline">💭 Your why: “${esc(S.why)}”</p>` : ""}${chips(intents, "intent")}
    ${ci.intent ? `<h2>How are you feeling? <span class="mute">(optional)</span></h2>${chips(feels, "feeling")}` : ""}
    <button class="ghost wide" style="margin-bottom:0" data-act="notNow">🙌 Not now, I'll put my phone down</button></div>
  ${sug}
  ${IN.today()}
  ${WB.moodRow()}
  <div class="grid2">
    <a class="qt q-red" href="#/pomo"><span>🍅</span><b>Pomodoro</b><small>${ST.todayMin() ? ST.hm(ST.todayMin()) + " today" : "Start focusing"}</small></a>
    <a class="qt q-pink" href="#/cards"><span>🃏</span><b>Flashcards</b><small>${due ? due + " due" : "Review & learn"}</small></a>
    <a class="qt q-amber" href="#/goals"><span>🎯</span><b>Goals</b><small>${tasks ? tasks + " to do" : "Plan today"}</small></a>
    <a class="qt q-purple" href="#/sleep"><span>😴</span><b>Sleep</b><small>Sounds & log</small></a>
    <a class="qt q-teal" href="#/usage"><span>📊</span><b>App usage</b><small>Track & reflect</small></a>
    <a class="qt q-green" href="#/people"><span>🫂</span><b>Your people</b><small>Safe circles</small></a>
  </div>
  <a class="card btn block feature" href="#/garden"><span class="fi f-green">${g.stage}</span><span style="flex:1"><b>Your focus garden</b><br><span class="mute">${g.grown} plant${g.grown === 1 ? "" : "s"} · ${g.left} min to the next one</span><span class="progress"><i style="width:${g.pct}%;background:linear-gradient(90deg,#22c55e,#84cc16)"></i></span></span></a>
  <div class="card spark"><span class="tag">✨ Spark of the day · ${spark.t}</span><h2 style="margin-top:0">${spark.h}</h2><p>${spark.b}</p></div>
  <div class="card"><h2 style="margin-top:0">📱 Planning to scroll?</h2><p class="mute">That's fine. Choose how long, and we'll remind you.</p>
    <button class="primary block" data-act="startScroll" data-arg="10">Remind me in 10 minutes</button>
    <p class="mute">A web app only runs its timer while it is open. Also set a phone alarm to be sure.</p></div>`;
}

function suggestions() {
  const out = [], add = (t, d, h) => { if (out.length < 3 && !out.some(o => o.h === h)) out.push({ t, d, h }); };
  const { intent, feeling } = ci;
  if (intent === "Message someone") out.push({ t: "Do it, then come back", d: "Send your message. سكون will be here after.", h: "" });
  if (intent === "Study") { add("🍅 Start a Pomodoro", "Focus in rounds, grow your garden.", "#/pomo"); add("🃏 Review flashcards", "A few minutes of recall.", "#/cards"); }
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
  if (!t || t.kind !== "scroll") return `<div class="screen"><p>No timer is running.</p><a class="btn primary wide" href="#/">Back to Home</a></div>`;
  if (timeLeft() <= 0) return `<div class="screen">${hero("pause", "Time's up.", "Stop, or choose 5 more?")}${S.why ? `<p class="whyline">💭 “${esc(S.why)}”</p>` : ""}
    <button class="primary wide" data-act="stopScroll">I'll stop now</button><button class="wide" data-act="startScroll" data-arg="5">5 more minutes</button></div>`;
  return `<div class="screen"><div><span class="pill">${ICON.lock} Planned scroll</span></div>${hero("pause", "Scroll time", "We'll tell you when it's up.")}
    ${countdown("SCROLL COUNTDOWN", "Keep this page open · also set a phone alarm")}<button class="wide" data-act="stopTimer">Return to Home</button></div>`;
}

function doMenu() {
  const wk = S.focus.filter(f => f.ts >= weekStart()).reduce((a, f) => a + f.min, 0);
  return `${header("Do")}
  <a class="card btn block" style="display:block;color:inherit" href="#/focus"><b>🎯 Focus session</b><br><span class="mute">Study with a clear start and end. ${wk} min this week.</span></a>
  <a class="card btn block" style="display:block;color:inherit" href="#/challenges"><b>🌱 Something else to do</b><br><span class="mute">25+ small activities, alone or with a friend.</span></a>
  <a class="card btn block" style="display:block;color:inherit" href="#/play"><b>🎮 Play timer</b><br><span class="mute">Set a limit before you start gaming.</span></a>
  <a class="card btn block" style="display:block;color:inherit" href="#/people"><b>🫂 Find your people</b><br><span class="mute">A safe, separate-space community. Meet like-minded students and feel heard.</span></a>
  <h2>Ways to meet people</h2><div class="card">${MEET_TIPS.map(t => `<p>• ${t}</p>`).join("")}</div>`;
}

function focusPage() {
  const sub = route()[1], t = timer();
  if (sub === "run" || (t && t.kind === "focus")) return focusRun();
  const d0 = new Date().setHours(0, 0, 0, 0), wk = Date.now() - 7 * 86400000;
  const todayM = S.focus.filter(f => f.ts >= d0).reduce((a, f) => a + f.min, 0), w = S.focus.filter(f => f.ts >= wk), wkM = w.reduce((a, f) => a + f.min, 0);
  const hmm = m => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`), custom = ![10, 15, 25, 45, 60, 90].includes(focusSetup.min);
  return `${header("Focus 🎯", "#/study")}<p class="mute" style="margin-top:-6px">One goal, a clear start and end</p>
  <div class="sgrid"><div><small>Focused today</small><b>${hmm(todayM)}</b></div><div><small>Last 7 days</small><b>${hmm(wkM)}</b><span>${w.length} session${w.length === 1 ? "" : "s"}</span></div></div>
  <div class="card"><small class="mute">Duration</small><div class="dur">${focusSetup.min}m</div>
    <div class="chips">${[10, 15, 25, 45, 60, 90].map(m => `<button class="${focusSetup.min === m ? "on" : ""}" data-act="fmin" data-arg="${m}">${m} min</button>`).join("")}<button class="${custom ? "on" : ""}" data-act="fcustom">Custom</button></div>
    ${custom ? `<label for="fcm">Minutes</label><input id="fcm" type="number" min="5" max="180" value="${focusSetup.min}" data-fcustom="1">` : ""}</div>
  <div class="card"><label for="goal" style="margin-top:0">One goal for this session</label><input id="goal" type="text" maxlength="100" placeholder="e.g. finish lab report intro" autocomplete="off"></div>
  <div class="sgroup">${row("🔒", "Strict mode", "No pausing until the timer ends", "", sw("strict", S.settings.strict))}</div>
  <button class="primary bigstart" data-act="startFocus">▶ Start ${focusSetup.min}m focus</button>
  ${ctx.remNudge()}
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
  return `<div class="screen">${hero("target", esc(t.goal || "Focus"), "Your goal for this session")}${countdown("FOCUS COUNTDOWN", t.strict ? "🔒 Strict mode · stay with it" : paused ? "Paused" : "Stay with it")}
    ${t.strict ? `<button class="ghost wide" data-act="emergencyStop">Emergency stop</button>` : `<button class="primary wide" data-act="${paused ? "resumeFocus" : "pauseFocus"}">${paused ? "Resume session" : "Pause session"}</button>
    <button class="ghost wide" data-act="stopTimer" data-arg="#/focus">End session</button>`}</div>`;
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
    if (timeLeft() <= 0) return `<div class="screen">${hero("game", "Time's up.", "You set this limit yourself. Nice job noticing.")}
      <button class="primary wide" data-act="stopTimer" data-arg="#/challenges">Something else to do</button><button class="wide" data-act="stopTimer" data-arg="#/">Done</button></div>`;
    return `<div class="screen">${hero("game", "Playing", "Enjoy it. You set the limit.")}${countdown("PLAY COUNTDOWN", "Calm reminder when it ends")}<button class="ghost wide" data-act="stopTimer" data-arg="#/do">Return to Do</button></div>`;
  }
  return `${header("Play timer", "#/do")}<div class="card"><p>Set a limit before you start playing.</p><div class="chips">${[15, 30, 60, 90].map(m => `<button class="${playSetup.min === m ? "on" : ""}" data-act="pmin" data-arg="${m}">${m} min</button>`).join("")}</div>
  <button class="primary block center" style="margin-top:16px" data-act="startPlay">Start</button></div>${ctx.remNudge()}<p class="mute">${ctx.remOn() ? "We'll notify you when it ends, even if سكون is closed." : "Without reminders, the timer only alerts you while سكون is open."}</p>`;
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
  if (bites.idx >= bites.set.length) return `<div class="screen">${hero("check", "You're done for now.", "Here's something to do:")}
    <a class="btn primary wide" href="#/challenges">Pick a small activity</a><a class="btn wide" href="#/">Back to Home</a></div>`;
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
  <div class="card"><h2 style="margin-top:0">Text a trusted friend</h2><p class="mute">Pick a message. Your phone's share sheet opens. Nothing is sent by سكون.</p>
    ${FRIEND_MSGS.map((m, i) => `<button class="block" data-act="shareMsg" data-arg="${i}">“${m}”</button>`).join("")}</div>
  <div class="card warm"><b>If you are in immediate danger or thinking of harming yourself, contact campus security or emergency services now.</b></div>
  <p class="mute">سكون is not a counselor and cannot diagnose.</p>
  <a class="btn block center" href="#/notes">Private mood notes</a>`;
}

function me() {
  const u = AU.user(), n = S.profile.name || (u && u.name) || "", [bw, bt] = IN.badgeCount();
  return `${header("Me")}
  <a class="card btn block feature" href="#/account"><span class="avatar">${esc(Array.from(n || (u && u.email) || "🙂")[0].toUpperCase())}</span><span style="flex:1"><b>${u ? esc(n || "Your account") : "Create an account"}</b><br><span class="mute">${u ? `☁️ Backed up · ${esc(u.email || "")}` : "Optional · back up and sync your progress"}</span></span></a>
  <div class="grid2">
    <a class="qt q-blue" href="#/insights"><span>📈</span><b>Insights</b><small>Charts & trends</small></a>
    <a class="qt q-amber" href="#/achievements"><span>🏆</span><b>Achievements</b><small>${bw} of ${bt} unlocked</small></a>
    <a class="qt q-purple" href="#/sleep"><span>😴</span><b>Sleep</b><small>Timer, sounds, log</small></a>
    <a class="qt q-teal" href="#/usage"><span>📊</span><b>App usage</b><small>Log your time</small></a>
    <a class="qt q-red" href="#/limits"><span>⏳</span><b>Limits</b><small>Daily allowances</small></a>
    <a class="qt q-dim" href="#/week"><span>📅</span><b>My week</b><small>Calm summary</small></a>
  </div>
  ${group("Guide", [row("🧭", "App tour", "Problem → feature → set it up", "#/tour"), row("💡", "How سكون helps", "Which feature solves which problem", "#/helps"), row("📘", "User guide", "Getting started", "#/guide"), row("📲", "Install the app", standalone() ? "Installed ✅" : "Add سكون to your home screen", "#/install")])}
  ${group("Healthy habits", [row("🌙", "Night routine", `Bedtime ${S.settings.bedtime}`, "#/night"), row("📝", "Private mood notes", "Only on this phone", "#/notes"), row("💬", "Talk to someone", "Counselor and trusted friends", "#/talk")])}
  ${group("More", [row("⚙️", "Settings", "Theme, goals, focus, data", "#/settings"), row("🔒", "Privacy", "What سكون stores", "#/privacy")])}`;
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
  <div class="card"><h2 style="margin-top:0">This week</h2>${WB.moodWeek()}${lines.map(l => `<p>${l}</p>`).join("")}${days.length ? `<p class="mute">Phone: ${days.filter(d => d.phone != null).map(d => d.phone + "h").join(", ") || "not entered"}</p>` : ""}</div>
  <div class="card"><h2 style="margin-top:0">Today</h2><p class="mute">Optional. Use your phone's own numbers.</p>
    <label for="wp">Hours on phone</label><input id="wp" type="number" min="0" max="24" step="0.5" value="${t.phone ?? ""}">
    <label for="ws">Hours slept last night</label><input id="ws" type="number" min="0" max="24" step="0.5" value="${t.sleep ?? ""}">
    <button class="primary block center" style="margin-top:12px" data-act="saveDay">Save today</button></div>
  <div class="row"><a class="btn" href="#/usage">📊 App usage</a><a class="btn" href="#/sleep">😴 Sleep log</a></div>
  <button class="ghost block center" data-act="delWeek">Delete this data</button>`;
}

function notes() {
  return `${header("Private mood notes", "#/talk")}<p class="mute">${S.settings.syncNotes && AU.signedIn() ? "Backed up privately to your account (you turned this on)." : "Stored only on this phone."} Not a clinical record. Never shared.</p>
  <div class="card"><label for="nt">How do you feel?</label><textarea id="nt" rows="3" maxlength="500"></textarea><button class="primary block center" style="margin-top:8px" data-act="addNote">Save note</button></div>
  ${S.notes.map((n, i) => `<div class="note"><div><span class="mute">${new Date(n.ts).toLocaleString()}</span><br>${esc(n.text)}</div><button class="ghost" data-act="delNote" data-arg="${i}" aria-label="Delete note">Delete</button></div>`).join("")}
  ${S.notes.length ? '<button class="ghost block center" data-act="delNotes">Delete all notes</button>' : '<p class="mute">No notes yet.</p>'}`;
}

const row = (ic, t, sub, href, right) => `<${href ? `a href="${href}"` : "div"} class="srow2"><span class="sic">${ic}</span><span class="stx"><b>${t}</b>${sub ? `<small>${sub}</small>` : ""}</span>${right || (href ? '<span class="chev">›</span>' : "")}</${href ? "a" : "div"}>`;
const group = (title, rows, foot) => `<h3 class="ghead">${title}</h3><div class="sgroup">${rows.join("")}${foot ? `<p class="mute sfoot">${foot}</p>` : ""}</div>`;
const sw = (field, on) => `<label class="sw"><input type="checkbox" data-field="${field}" ${on ? "checked" : ""}><i></i></label>`;
function settings() {
  const s = S.settings, hmm = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
  return `${header("Settings ⚙️", "#/me")}
  ${group("Appearance", [
    row("🎨", "Theme", s.theme === "midnight" ? "Midnight (navy & lavender)" : "Red & black", "", `<select class="ssel" data-field="theme" aria-label="Theme"><option value="red" ${s.theme !== "midnight" ? "selected" : ""}>Red & black</option><option value="midnight" ${s.theme === "midnight" ? "selected" : ""}>Midnight</option></select>`),
    row(layout() === "pc" ? "💻" : "📱", "Layout", layout() === "pc" ? "Computer: full screen with a side menu" : "Phone: phone-sized view", "", `<select class="ssel" data-field="layout" aria-label="Layout"><option value="phone" ${layout() === "phone" ? "selected" : ""}>📱 Phone</option><option value="pc" ${layout() === "pc" ? "selected" : ""}>💻 Computer</option></select>`),
    row("🌗", "Dark mode", "Easier on the eyes at night", "", sw("dark", s.dark)),
    row("🔠", "Text size", "", "", `<select class="ssel" data-field="size" aria-label="Text size">${[["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]].map(([v, n]) => `<option value="${v}" ${s.size === v ? "selected" : ""}>${n}</option>`).join("")}</select>`)])}
  ${group("Usage & goals", [
    row("🚩", "Daily screen-time goal", hmm(s.goal || 180), "#/limits"),
    row("⏳", "App limits", `${Object.keys(S.limits).length} app${Object.keys(S.limits).length === 1 ? "" : "s"} with a daily allowance`, "#/limits"),
    row("🛏️", "Bedtime", "Used for wind-down and phone-free nights", "", `<input class="ssel" type="time" value="${s.bedtime}" data-field="bedtime" aria-label="Bedtime">`),
    row("📖", "Cards per reading set", `<span id="bcv">${s.bites}</span> cards`, "", `<input type="range" min="3" max="10" value="${s.bites}" data-field="bites" aria-label="Cards per reading set" style="width:110px">`)])}
  ${group("Focus & reminders", [
    row("🔒", "Strict focus by default", "Sessions can't be paused or skipped (emergency stop stays)", "", sw("strict", s.strict)),
    row("📳", "Haptic feedback", "A tiny vibration when you tap (Android phones)", "", sw("haptics", s.haptics !== false)),
    row("🔔", "Chime when a round ends", "Pomodoro sound and vibration", "", `<label class="sw"><input type="checkbox" data-pomo="sound" ${S.pomo.sound ? "checked" : ""}><i></i></label>`)],
    "سكون can't block other apps. Turn on Reminders below to get notified when timers end.")}
  ${RM.settingsGroup(row, group, sw)}
  ${group("Account & privacy", [
    row("☁️", AU.signedIn() ? "Account" : "Create an account", AU.signedIn() ? "Backed up" : "Optional backup and sync", "#/account"),
    row("💾", "Export data", "Save your data as a JSON file", "", '<button class="ghost smallbtn" data-act="exportData">Export</button>'),
    row("🧹", "Clear usage history", "Delete logged app minutes", "", '<button class="ghost smallbtn" data-act="clearUsage">Clear</button>'),
    row("🔒", "Privacy policy", "", "#/privacy"),
    row("ℹ️", "About سكون", "Version 2.0", "#/guide")])}
  ${P.settingsBlock()}
  <button class="danger block center" data-act="delAll">Delete all my data</button>`;
}

function privacy() {
  return `${header("Privacy", "#/me")}<div class="card"><p>سكون stores only these things, <b>on this device</b>:</p>
  <p>• Settings, nickname, daily mood emoji<br>• Focus and Pomodoro minutes, goals, tasks, flashcards<br>• App usage and sleep you logged<br>• Challenges you marked done<br>• Mood notes you wrote</p>
  <p>سكون has no analytics, no ads and no trackers. It never asks for your phone number, location or contacts. Nobody else can see your data.</p>
  <p>Delete any of it, or all of it, in Settings.</p></div>
  <div class="card"><p><b>Everything stays on your phone except what you choose to post in Find your people.</b> That uses a made-up name and can be deleted any time.</p>
  <p>If you join, the سكون server stores only: a random anonymous id (the secret key is kept on this phone), your made-up display name, your space, the circles you joined, and your posts, replies and reactions. No real name, photo, email or phone number. No analytics. سكون does not keep IP addresses; our host may process them briefly to deliver the page.</p>
  <p>To remove it all, use <b>Leave community and delete my posts</b> in Me, then Settings.</p></div>
  <div class="card"><p><b>☁️ Optional account</b></p><p>If you create an account, سكون stores your email and a private backup of the data above (except mood notes, unless you turn that on) in your own row in our database. Only you can read it. Your community posts stay anonymous and are not linked to your account.</p>
  <p>Delete your account and backup any time in Me, then Account.</p></div>`;
}

function guide() {
  return `${header("User guide", "#/me")}<div class="card"><ol class="steps">
  <li>Open the link and <a href="#/install">install سكون</a> on your home screen. Android Chrome: menu, then <i>Install app</i>. iPhone Safari: Share, then <i>Add to Home Screen</i>.</li>
  <li>Open سكون when you reach for your phone, and answer the check-in.</li>
  <li>Try a focus session, a reading set, or a challenge.</li>
  <li>Use <b>Talk to someone</b> if you need a person.</li>
  <li>Check <b>Stay safe</b> for scams, privacy and notifications.</li>
  <li>Use the <b>Study</b> tab for Pomodoro 🍅, goals 🎯 and flashcards 🃏. Every 25 focus minutes grows a plant in your garden 🌳.</li>
  <li>In <b>Me</b>, log your sleep 😴 and app usage 📊, and play sleep sounds.</li>
  <li>Your data stays on your phone unless you create an account to back it up. Delete it any time in Me, then Settings.</li></ol></div>
  <p class="mute">سكون cannot see or block other apps or measure real phone use. Timers run only while it is open.</p>`;
}

/* ---------- render ---------- */
const MAIN = { install, "": home, scroll: scrollTimer, do: doMenu, focus: focusPage, play, challenges, challenge, read, safe, talk, me, night, week, notes, settings, privacy, guide };
function render() {
  const r = route(), name = r[0] || "";
  if (!S.onboarded && !["onboard", "signin", "signup", "reset", "account"].includes(name)) return go("#/onboard");
  const fn = name === "onboard" ? onboard : MAIN[name] || home;
  const focusing = timer() && ((timer().kind === "focus" && name === "focus") || (timer().kind === "pomo" && name === "pomo"));
  const bare = name === "onboard" || focusing || name === "talk";
  if (["safe", "talk", "people"].includes(name) && !S.flags[name]) { S.flags[name] = true; saveLocal(); }
  const tab = { install: "me", ...ST.tabs, ...WB.tabs, ...AU.tabs, ...IN.tabs, challenges: "do", challenge: "do", focus: "do", play: "do", scroll: "", night: "me", people: "do", mod: "me", week: "me", notes: "me", settings: "me", privacy: "me", guide: "me", talk: "" }[name] ?? name;
  const preOnboard = !S.onboarded;
  $("#app").classList.toggle("nonav", name === "onboard" || preOnboard || !!focusing);
  const chrome = name === "onboard" || preOnboard ? "" : `${bare ? "" : '<a class="talk" href="#/talk">💬 Talk to someone</a>'}
    ${focusing ? "" : `<nav class="tabs" aria-label="Main"><div><a class="brand" href="#/" aria-label="سكون home"><img src="icon-192.png" alt="" width="36" height="36">سكون</a>${TABS.map(([h, i, l]) => `<a href="#/${h}" class="${tab === h ? "on" : ""}" ${tab === h ? 'aria-current="page"' : ""}>${ICON[i]}${l}</a>`).join("")}<button class="navswitch" data-act="setLayout" data-arg="phone">📱 Switch to phone view</button></div></nav>`}`;
  patch($("#app"), `<div class="page">${fn()}</div>${chrome}` + (toastMsg ? `<div class="toast" role="status">${esc(toastMsg)}</div>` : ""));
  // soft fade-in only when the screen itself changes (not on every update)
  const here = location.hash;
  if (here !== lastRoute) { lastRoute = here; const pg = $("#app .page"); if (pg && pg.animate && !reduceMotion()) pg.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" }); }
}

/* ---------- actions ---------- */
const A = {
  next: a => go(`#/onboard/${a}`),
  finishOnboard: () => { S.onboarded = true; save(); go("#/"); },
  ci: a => { const [k, v] = a.split("|"); ci[k] = ci[k] === v ? null : v; if (k === "intent" && !ci.intent) ci.feeling = null; if (k === "intent" && ci.intent) { S.checkins.push(Date.now()); S.checkins = S.checkins.slice(-400); save(); } render(); },
  startScroll: a => { startTimer("scroll", +a); go("#/scroll"); render(); },
  stopTimer: a => { clearTimer(); go(a || "#/"); render(); },
  stopScroll: () => { S.notNow.push(Date.now()); clearTimer(); go("#/"); save(); render(); },
  fmin: a => { focusSetup.min = +a; render(); },
  pmin: a => { playSetup.min = +a; render(); },
  startFocus: () => { startTimer("focus", focusSetup.min, ($("#goal").value || "").trim()); S.timer.strict = !!S.settings.strict; save(); go("#/focus/run"); render(); },
  fcustom: () => { if ([10, 15, 25, 45, 60, 90].includes(focusSetup.min)) focusSetup.min = 30; render(); },
  emergencyStop: () => { if (confirm("Strict mode is on. Stop this session anyway? That's okay if you need to.")) { clearTimer(); go("#/study"); render(); } },
  installNow: async () => { if (!deferredInstall) return; deferredInstall.prompt(); const r = await deferredInstall.userChoice.catch(() => ({})); deferredInstall = null; if (r && r.outcome === "accepted") { S.flags.installed = true; saveLocal(); } render(); },
  setLayout: a => { S.settings.layout = a === "pc" ? "pc" : "phone"; save(); applySettings(); render(); },
  installHide: () => { S.flags.installHide = true; saveLocal(); render(); },
  exportData: () => { const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), app: "Sukoon", data: S }, null, 2)], { type: "application/json" }); const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = `pause-data-${today()}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); toast("Exported 💾"); },
  clearUsage: () => { if (!confirm("Delete all logged app minutes?")) return; for (const k of Object.keys(S.usage)) S.usage[k] = { apps: {}, u: Date.now() }; save(); render(); toast("Usage history cleared 🧹"); },
  pauseFocus: () => { const t = S.timer; t.left = (t.endAt - Date.now()) / 1000; t.endAt = null; save(); render(); },
  resumeFocus: () => { const t = S.timer; t.endAt = Date.now() + t.left * 1000; save(); render(); },
  startPlay: () => { startTimer("play", playSetup.min); render(); },
  cg: a => { chal.g = a; render(); }, cm: a => { chal.m = +a; render(); },
  didIt: a => { S.done.push({ ts: Date.now(), id: a }); save(); toast("Nice. Logged privately."); },
  invite: a => { const c = CHALLENGES.find(x => x.id === a); share(`Want to try this with me? ${c.t} (${c.m} min)`); },
  startBites: () => { bites.set = [...BITES].sort(() => Math.random() - .5).slice(0, S.settings.bites); bites.idx = 0; go("#/read/go"); render(); },
  nextBite: () => { bites.idx++; render(); $("#app").scrollTop = 0; },
  shareMsg: a => share(FRIEND_MSGS[+a]),
  addNote: () => { const v = $("#nt").value.trim(); if (!v) return; S.notes.unshift({ ts: Date.now(), text: v }); save(); render(); },
  delNote: a => { const n = S.notes[+a]; if (n) S.tomb.push("n" + n.ts); S.notes.splice(+a, 1); save(); render(); },
  delNotes: () => { if (confirm("Delete all notes?")) { S.notes.forEach(n => S.tomb.push("n" + n.ts)); S.notes = []; save(); render(); } },
  saveDay: () => {
    const p = $("#wp").value, s = $("#ws").value, d = today();
    S.week = S.week.filter(w => w.date !== d);
    S.week.push({ date: d, phone: p === "" ? null : +p, sleep: s === "" ? null : +s }); save(); toast("Saved on this phone.");
  },
  delWeek: () => { if (confirm("Delete your My week data?")) { S.week.forEach(w => S.tomb.push(w.date)); S.week = []; save(); render(); } },
  delAll: async () => { if (confirm("Delete all your data from this phone?")) { if (P.isJoined() && !(await P.leaveSilently())) return toast("Could not reach the server to delete your community posts. Try again online."); if (AU.signedIn() && !(await AU.wipeCloud())) return toast("Could not reach the server to delete your backup. Try again online."); localStorage.removeItem(KEY); S = structuredClone(DEFAULTS); dataVer++; applySettings(); go("#/onboard"); render(); } },
};
const P = initPeople({ esc, header, render, go, toast, getS: () => S, save });
Object.assign(A, P.actions); MAIN.people = P.people; MAIN.mod = P.mod;
const tickHooks = [];
const ctx = {
  get S() { return S; }, setS: v => { S = v; dataVer++; }, ver: () => dataVer, save, saveLocal, esc, header, render, go, toast, route, today, fmt, weekStart, uid, ICON, hero,
  timer, timeLeft, startTimer, clearTimer, tickHooks, signedIn: () => !!(AU && AU.signedIn()), remNudge: () => (RM ? RM.nudge() : ""), remOn: () => !!(RM && RM.status() === "on"),
};
const ST = initStudy(ctx), WB = initWell(ctx);
AU = initAuth(ctx); IN = initInsights(ctx); RM = initReminders(ctx); Object.assign(A, RM.actions);
for (const m of [ST, WB, AU, IN]) { Object.assign(MAIN, m.routes); Object.assign(A, m.actions); }
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g) { history.length > 1 ? history.back() : go(g.dataset.go); return; }
  const b = e.target.closest("[data-act]"); if (b && A[b.dataset.act]) { buzz(); A[b.dataset.act](b.dataset.arg); }
});
document.addEventListener("submit", e => { const f = e.target.closest("form[data-act]"); if (f) { e.preventDefault(); A[f.dataset.act] && A[f.dataset.act](); } });
document.addEventListener("change", e => {
  const el = e.target;
  if (el.type === "checkbox" && el.checked && el.closest(".check")) { buzz(14); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); setTimeout(() => el.classList.remove("pop"), 400); }
  if (el.dataset.field) {
    const k = el.dataset.field, v = el.type === "checkbox" ? el.checked : k === "bites" ? +el.value : el.value;
    S.settings[k] = v; if (k === "bites") bites.n = v; if (k === "bedtime") S.settings.bedSet = true; save(); applySettings();
    if (k === "bites") $("#bcv").textContent = v; else if (k !== "bedtime") render();
  }
  if (el.dataset.check != null) {
    const i = +el.dataset.check, it = S.checklist.items; el.checked ? it.includes(i) || it.push(i) : it.splice(it.indexOf(i), 1);
    if (i === 0) { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; if (el.checked) S.nightDone[k] = true; else delete S.nightDone[k]; }
    save();
  }
  if (el.dataset.fcustom) { const v = Math.round(+el.value); if (v >= 5 && v <= 180) { focusSetup.min = v; render(); } }
});
document.addEventListener("input", e => { if (e.target.dataset.range === "bites") { bites.n = +e.target.value; S.settings.bites = bites.n; save(); e.target.previousElementSibling.textContent = `How many cards? ${bites.n}`; } });

/* ---------- tick: update running timers & clock without losing input ---------- */
setInterval(() => {
  const el = $("#tm"), t = timer();
  if (el && t) { if (timeLeft() <= 0) render(); else el.textContent = fmt(timeLeft()); }
  const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  tickHooks.forEach(f => f());
  if (!document.hidden) { pauseSecs++; if (pauseSecs >= 30) flushPauseTime(); }
}, 1000);
let pauseSecs = 0;
function flushPauseTime() { if (!pauseSecs) return; const d = today(); S.pauseTime[d] = (S.pauseTime[d] || 0) + pauseSecs; pauseSecs = 0; saveLocal(); }
document.addEventListener("visibilitychange", () => { if (document.hidden) flushPauseTime(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && timer()) render(); });

bites.n = S.settings.bites;
applySettings();
AU.bootFromHash();
render();
if (AU.signedIn()) AU.syncNow();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
