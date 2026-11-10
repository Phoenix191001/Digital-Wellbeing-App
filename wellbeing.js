// Wellbeing: app usage tracker (self-logged from the phone's own Screen Time), sleep timer + sounds, sleep log, daily mood.
// A web app cannot see other apps, so usage is entered by the student. Calm wording only: no red warnings, no grades.

export const APPS = [
  { id: "instagram", n: "Instagram", e: "📸", c: "#e1306c" }, { id: "tiktok", n: "TikTok", e: "🎵", c: "#25f4ee" },
  { id: "youtube", n: "YouTube", e: "▶️", c: "#ff3b30" }, { id: "whatsapp", n: "WhatsApp", e: "💬", c: "#25d366" },
  { id: "snapchat", n: "Snapchat", e: "👻", c: "#fffc00" }, { id: "games", n: "Games", e: "🎮", c: "#8b5cf6" },
  { id: "netflix", n: "Netflix / shows", e: "🎬", c: "#f97316" }, { id: "x", n: "X / Twitter", e: "🐦", c: "#3b82f6" },
  { id: "study", n: "Study apps", e: "📚", c: "#14b8a6" }, { id: "other", n: "Other", e: "📱", c: "#94a3b8" },
];
export const MOODS = [["😄", "Great"], ["🙂", "Good"], ["😐", "Okay"], ["😔", "Low"], ["😣", "Stressed"]];
const SOUNDS = [["rain", "🌧️", "Rain"], ["ocean", "🌊", "Ocean"], ["fan", "🌀", "Fan"], ["brown", "🟤", "Deep hum"]];

export function initWell(c) {
  const { header, render, toast, today, esc } = c;
  const S = () => c.S;
  let usageDay = null, sound = { on: null, mins: 30, endAt: 0, ctx: null, gain: null, nodes: [] };

  const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lastDays = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d; });
  const hm = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${Math.round(m)}m`);
  const dayTotal = k => Object.values((S().usage[k] || {}).apps || {}).reduce((a, b) => a + b, 0);

  /* ---------- usage tracker ---------- */
  function usage() {
    const k = usageDay || today(), day = S().usage[k] || { apps: {} }, tot = dayTotal(k), days = lastDays(7);
    const max = Math.max(60, ...days.map(d => dayTotal(dkey(d))));
    const top = Object.entries(day.apps).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const lim = S().limits, overs = top.filter(([id, v]) => lim[id] && v > lim[id]);
    const pt = Math.round((S().pauseTime[today()] || 0) / 60), ci = S().checkins.filter(t => t >= new Date().setHours(0, 0, 0, 0)).length;
    const wk = days.map(d => dayTotal(dkey(d))).filter(Boolean), avg = wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : 0;
    return `${header("App usage 📊", "#/me")}
    <div class="stats"><div><b>${hm(tot)}</b><span>${k === today() ? "logged today" : "logged"}</span></div><div><b>${ci}</b><span>pauses today ⏸️</span></div><div><b>${pt}m</b><span>in سكون</span></div></div>
    <div class="card"><b>Last 7 days</b><div class="bars">${days.map(d => { const kk = dkey(d), apps = (S().usage[kk] || {}).apps || {}; return `<button class="bar ${kk === k ? "sel" : ""}" data-act="usageDay" data-arg="${kk}" aria-label="${d.toDateString()}: ${hm(dayTotal(kk))}"><span class="stack">${APPS.filter(a => apps[a.id]).map(a => `<i style="height:${(apps[a.id] / max) * 100}%;background:${a.c}"></i>`).join("")}</span><small>${"SMTWTFS"[d.getDay()]}</small></button>`; }).join("")}</div>
      ${avg ? `<p class="mute">About ${hm(Math.round(avg))} a day on the days you logged.</p>` : ""}</div>
    ${top.length ? `<div class="card"><b>${k === today() ? "Today" : new Date(k + "T00:00").toDateString()}</b>${top.map(([id, v]) => { const a = APPS.find(x => x.id === id); return `<div class="urow"><span>${a.e} ${a.n}</span><span class="ubar"><i style="width:${(v / top[0][1]) * 100}%;background:${a.c}"></i></span><b>${hm(v)}</b></div>`; }).join("")}
      ${overs.length ? `<p class="softnote">💭 ${overs.map(([id]) => APPS.find(x => x.id === id).n).join(" and ")} went past the limit you set. No problem, just something to notice. <a href="#/challenges">Try something else?</a></p>` : top.length ? `<p class="mute">Most time: ${APPS.find(x => x.id === top[0][0]).e} ${APPS.find(x => x.id === top[0][0]).n}.</p>` : ""}</div>` : ""}
    <div class="card"><b>Log ${k === today() ? "today" : "this day"}</b><p class="mute">Copy the minutes from your phone's Digital Wellbeing (Android) or Screen Time (iPhone). سكون can't see other apps.</p>
      ${APPS.map(a => { const v = day.apps[a.id] || 0; return `<div class="step"><span>${a.e} ${a.n}${lim[a.id] ? ` <small class="mute">limit ${hm(lim[a.id])}</small>` : ""}</span><div><button data-act="uStep" data-arg="${k}|${a.id}|-15" aria-label="Less ${a.n}">−</button><b>${hm(v)}</b><button data-act="uStep" data-arg="${k}|${a.id}|15" aria-label="More ${a.n}">+</button></div></div>`; }).join("")}</div>
    <details class="card"><summary><b>⏱️ Set daily limits (optional)</b></summary><p class="mute">A gentle reminder for yourself. Nothing is blocked.</p>
      ${APPS.filter(a => a.id !== "study").map(a => `<label for="lim-${a.id}">${a.e} ${a.n} (minutes)</label><input id="lim-${a.id}" type="number" min="0" max="900" step="15" value="${lim[a.id] || ""}" data-limit="${a.id}" placeholder="no limit">`).join("")}</details>
    <a class="card btn block feature" href="#/safe/tools"><span class="fi f-teal">📱</span><span><b>Use your phone's own timers</b><br><span class="mute">App timers, grayscale and bedtime mode.</span></span></a>`;
  }

  /* ---------- sleep ---------- */
  function sleep() {
    const ss = S().sleepStart, log = S().sleepLog.filter(x => !x.del).slice(-7);
    const [bh, bm] = S().settings.bedtime.split(":").map(Number), now = new Date(), bed = new Date(); bed.setHours(bh, bm, 0, 0); if (bed < now) bed.setDate(bed.getDate() + 1);
    const until = Math.round((bed - now) / 60000), avg = log.length ? log.reduce((a, x) => a + (x.end - x.start), 0) / log.length / 3600000 : 0;
    const sLeft = sound.on && sound.endAt ? Math.max(0, Math.round((sound.endAt - Date.now()) / 1000)) : 0;
    return `${header("Sleep 😴", "#/me")}
    ${ss ? `<div class="card center night-card"><div class="emoji-xl">🌙</div><h2 style="margin-top:0">Good night</h2><p>Sleeping since ${new Date(ss).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Put the phone away 💤</p><button class="primary wide" data-act="wake">☀️ I'm awake</button><button class="ghost wide" data-act="sleepCancel">Cancel</button></div>`
      : `<div class="card center night-card"><div class="emoji-xl">🛏️</div><p>${until <= 90 ? `Bedtime in <b>${until < 60 ? `${until} min` : hm(until)}</b>` : `Bedtime is ${S().settings.bedtime}`} · <a href="#/night">wind-down</a></p><button class="primary wide" data-act="sleepStart">😴 I'm going to sleep</button></div>`}
    <div class="card"><b>🎧 Sleep timer</b><p class="mute">Soft sound that fades out by itself. Keep سكون open; sound may stop if your screen locks.</p>
      <div class="grid2 small">${SOUNDS.map(([id, e, n]) => `<button class="qt ${sound.on === id ? "q-purple on" : "q-dim"}" data-act="sound" data-arg="${id}"><span>${e}</span><b>${n}</b>${sound.on === id ? "<small>playing</small>" : ""}</button>`).join("")}</div>
      <label>Turn off after</label><div class="chips">${[15, 30, 45, 60, 0].map(m => `<button class="${sound.mins === m ? "on" : ""}" data-act="soundMins" data-arg="${m}">${m ? m + " min" : "Never"}</button>`).join("")}</div>
      ${sound.on ? `<p class="center"><b id="stm">${sLeft ? c.fmt(sLeft) : "∞"}</b> left · <button class="ghost" style="min-height:40px" data-act="soundStop">⏹️ Stop</button></p>` : ""}</div>
    <div class="card"><b>Last nights</b>${log.length ? `<div class="bars">${log.map(x => { const h = (x.end - x.start) / 3600000; return `<div class="bar"><span class="stack"><i style="height:${Math.min(100, (h / 10) * 100)}%;background:linear-gradient(#a855f7,#6366f1)"></i></span><small>${h.toFixed(1)}h</small></div>`; }).join("")}</div><p class="mute">Average ${avg.toFixed(1)} hours. Most students feel best with 7 to 9 💜</p>` : '<p class="mute">Tap "I\'m going to sleep" tonight and "I\'m awake" in the morning.</p>'}</div>`;
  }

  /* ---------- sound generation (no files, no network) ---------- */
  function startSound(id) {
    stopSound(true);
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return toast("Sound isn't supported in this browser.");
    const ctx = new AC(), len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (id === "brown" || id === "ocean") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = { rain: 3200, fan: 900, brown: 500, ocean: 700 }[id];
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    src.connect(filt); filt.connect(gain); gain.connect(ctx.destination); src.start();
    const nodes = [src];
    if (id === "ocean") { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.12; lg.gain.value = 0.25; l.connect(lg); lg.connect(gain.gain); l.start(); nodes.push(l); }
    gain.gain.exponentialRampToValueAtTime(id === "ocean" ? 0.35 : 0.5, ctx.currentTime + 2);
    sound = { ...sound, on: id, ctx, gain, nodes, endAt: sound.mins ? Date.now() + sound.mins * 60000 : 0 };
  }
  function stopSound(quick) {
    if (!sound.ctx) { sound.on = null; return; }
    const { ctx, gain } = sound, t = quick ? 0.2 : 8;
    try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t); } catch { /* ignore */ }
    setTimeout(() => ctx.close().catch(() => {}), t * 1000 + 100);
    sound = { ...sound, on: null, ctx: null, gain: null, nodes: [], endAt: 0 };
  }

  const actions = {
    usageDay: a => { usageDay = a === today() ? null : a; render(); },
    uStep: a => { const [k, id, dv] = a.split("|"); const day = S().usage[k] || (S().usage[k] = { apps: {} }); day.apps[id] = Math.max(0, (day.apps[id] || 0) + +dv); day.u = Date.now(); c.save(); render(); },
    sleepStart: () => { S().sleepStart = Date.now(); c.save(); render(); toast("Sleep well 🌙"); },
    sleepCancel: () => { S().sleepStart = null; c.save(); render(); },
    wake: () => {
      const st = S().sleepStart, end = Date.now(), h = (end - st) / 3600000; S().sleepStart = null;
      if (h < 0.25 || h > 20) { c.save(); render(); return toast("That didn't look like a night's sleep, so it wasn't logged."); }
      S().sleepLog.push({ start: st, end }); const d = today(), w = S().week.find(x => x.date === d);
      if (w) w.sleep = +h.toFixed(1); else S().week.push({ date: d, phone: null, sleep: +h.toFixed(1) });
      c.save(); render(); toast(`Good morning ☀️ You slept ${h.toFixed(1)} hours.`);
    },
    sound: a => { if (sound.on === a) stopSound(); else startSound(a); render(); },
    soundMins: a => { sound.mins = +a; if (sound.on) sound.endAt = sound.mins ? Date.now() + sound.mins * 60000 : 0; render(); },
    soundStop: () => { stopSound(); render(); },
    mood: a => { S().mood[today()] = a; c.save(); render(); toast(a === "😔" || a === "😣" ? "Thanks for sharing 💛 Talk to someone is always there." : "Noted for today ✨"); },
  };
  document.addEventListener("change", e => {
    const id = e.target.dataset && e.target.dataset.limit; if (!id) return;
    const v = Math.round(+e.target.value); if (v > 0) S().limits[id] = v; else delete S().limits[id]; c.save();
  });
  c.tickHooks.push(() => {
    if (sound.on && sound.endAt && Date.now() >= sound.endAt) { stopSound(); render(); }
    const el = document.getElementById("stm"); if (el && sound.endAt) el.textContent = c.fmt(Math.max(0, (sound.endAt - Date.now()) / 1000));
  });

  function moodRow() {
    const m = S().mood[today()];
    return `<div class="card mood"><b>How's today? ${m ? "" : "✨"}</b><div class="emojis">${MOODS.map(([e, n]) => `<button class="${m === e ? "on" : ""}" data-act="mood" data-arg="${e}" aria-label="${n}">${e}</button>`).join("")}</div></div>`;
  }
  function moodWeek() {
    return `<div class="moodweek">${lastDays(7).map(d => `<span><b>${S().mood[dkey(d)] || "·"}</b><small>${"SMTWTFS"[d.getDay()]}</small></span>`).join("")}</div>`;
  }
  return { routes: { usage, sleep }, tabs: { usage: "me", sleep: "me" }, actions, moodRow, moodWeek, esc };
}
