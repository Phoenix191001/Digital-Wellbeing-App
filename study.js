// Study tab: Pomodoro, study goals + today's tasks, flashcards (spaced repetition), focus garden.
// No streaks, no scores, nothing is ever lost: the garden only grows.

const PLANTS = ["🌳", "🌻", "🌲", "🌷", "🌴", "🌹", "🍀", "🌸", "🌵", "🌾", "🌺", "🎋"];
const STAGES = ["🌰", "🌱", "🌿", "🪴"];
const GOAL_EMOJI = ["📘", "🧪", "🧮", "💻", "🎨", "🌍", "📝", "🎵", "⚽", "🕌", "🧠", "📐"];
const DECK_EMOJI = ["🃏", "🧠", "📚", "🔬", "🧮", "🌍", "💡", "🗣️"];
const BOX_DAYS = [0, 1, 2, 4, 7, 14, 30];
const PRESETS = [["Classic", 25, 5, 15], ["Quick", 15, 3, 10], ["Deep", 50, 10, 20]];
const CHEERS = ["Nice work! 🎉", "You did it! 🌟", "Great focus! 💪", "Round complete! ✨", "Well done! 🙌"];

export function initStudy(c) {
  const { esc, header, render, go, toast, fmt, weekStart, today, uid } = c;
  const S = () => c.S;
  let setup = null, review = null, deckEdit = { open: false }, cardDraft = { f: "", b: "", bulk: "" }, goalDraft = { emoji: "📘" };

  /* ---------- helpers ---------- */
  const focusTotal = () => S().focus.reduce((a, f) => a + f.min, 0);
  const weekMin = id => S().focus.filter(f => f.ts >= weekStart() && (id ? f.goal === id : true)).reduce((a, f) => a + f.min, 0);
  const todayMin = () => S().focus.filter(f => f.ts >= new Date().setHours(0, 0, 0, 0)).reduce((a, f) => a + f.min, 0);
  const hm = m => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + "m" : ""}`.trim() : `${m}m`);
  const garden = () => { const t = focusTotal(); return { grown: Math.floor(t / 25), stage: STAGES[Math.min(3, Math.floor(((t % 25) / 25) * 4))], pct: ((t % 25) / 25) * 100, left: 25 - (t % 25) }; };
  const plantFor = i => PLANTS[i % PLANTS.length];
  const touch = o => { o.u = Date.now(); return o; };
  const live = arr => arr.filter(x => !x.del);
  const decks = () => live(S().decks);
  const dueCards = d => live(d.cards).filter(x => (x.due || 0) <= Date.now());

  function chime() {
    if (!S().pomo.sound) return;
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 990].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.connect(g); g.connect(a.destination); const t = a.currentTime + i * 0.18; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.start(t); o.stop(t + 0.55); });
      setTimeout(() => a.close(), 1500);
    } catch { /* no audio */ }
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([120, 80, 120]);
  }
  const confetti = () => `<div class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53) % 100}%;animation-delay:${(i % 6) * 0.08}s;background:${["#ff5a5f", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"][i % 6]}"></i>`).join("")}</div>`;

  /* ---------- Study hub ---------- */
  function study() {
    const g = garden(), due = decks().reduce((a, d) => a + dueCards(d).length, 0);
    const tasks = live(S().tasks).filter(t => !t.done);
    return `${header("Study 📚")}
    <div class="stats"><div><b>${hm(todayMin())}</b><span>today</span></div><div><b>${hm(weekMin())}</b><span>this week</span></div><div><b>${g.grown}</b><span>plants 🌳</span></div></div>
    <div class="grid2">
      <a class="qt q-red" href="#/pomo"><span>🍅</span><b>Pomodoro</b><small>Focus in rounds</small></a>
      <a class="qt q-pink" href="#/cards"><span>🃏</span><b>Flashcards</b><small>${due ? `${due} due now` : "Make a deck"}</small></a>
      <a class="qt q-amber" href="#/goals"><span>🎯</span><b>Goals</b><small>${tasks.length ? `${tasks.length} task${tasks.length > 1 ? "s" : ""} left` : "Plan your week"}</small></a>
      <a class="qt q-green" href="#/garden"><span>${g.stage}</span><b>Garden</b><small>${g.left} min to next plant</small></a>
    </div>
    <a class="card btn block feature" href="#/focus"><span class="fi f-blue">🎯</span><span><b>Single focus session</b><br><span class="mute">One goal, 10, 25 or 45 minutes.</span></span></a>
    ${live(S().goals).length ? `<h2>This week's goals</h2>${live(S().goals).map(goalRow).join("")}` : ""}`;
  }

  /* ---------- Pomodoro ---------- */
  function pomo() {
    const t = c.timer();
    if (t && t.kind === "pomo") return pomoRun(t);
    if (t && t.kind === "pomoNext") return pomoNext(t);
    const p = S().pomo; if (!setup) setup = { goal: "", label: "" };
    const gs = live(S().goals);
    return `${header("Pomodoro 🍅", "#/study")}
    <div class="card"><label>Rhythm</label><div class="chips">${PRESETS.map(([n, w, s]) => `<button class="${p.work === w && p.short === s ? "on" : ""}" data-act="pomoPreset" data-arg="${n}">${n} ${w}/${s}</button>`).join("")}</div>
      <div class="row" style="margin-top:8px">
        <div><label for="pw">Focus</label><input id="pw" type="number" min="5" max="90" value="${p.work}" data-pomo="work"></div>
        <div><label for="ps">Break</label><input id="ps" type="number" min="1" max="30" value="${p.short}" data-pomo="short"></div>
        <div><label for="pr">Rounds</label><input id="pr" type="number" min="1" max="8" value="${p.rounds}" data-pomo="rounds"></div>
      </div>
      <p class="mute">Long break of ${p.long} min after the last round.</p></div>
    <div class="card"><label for="pl">What are you working on?</label><input id="pl" type="text" maxlength="80" placeholder="e.g. Chapter 4 problems" value="${esc(setup.label)}" data-setup="label" autocomplete="off">
      ${gs.length ? `<label>Count it toward a goal</label><div class="chips"><button class="${!setup.goal ? "on" : ""}" data-act="pomoGoal" data-arg="">None</button>${gs.map(g => `<button class="${setup.goal === g.id ? "on" : ""}" data-act="pomoGoal" data-arg="${g.id}">${g.emoji} ${esc(g.title)}</button>`).join("")}</div>` : `<p class="mute"><a href="#/goals">Add a study goal</a> to track time per subject.</p>`}
      <label class="check" style="font-weight:600;border:0"><input type="checkbox" data-pomo="sound" ${p.sound ? "checked" : ""}>🔔 Chime when a round ends</label>
      <button class="primary wide" data-act="pomoStart">Start focusing 🍅</button></div>
    <p class="mute">Timers only run while Pause is open. Put your phone face down and come back when it chimes.</p>`;
  }
  function ring(t, color) {
    const pct = Math.max(0, Math.min(1, c.timeLeft() / t.total)), C = 2 * Math.PI * 88;
    return `<div class="ringwrap"><svg viewBox="0 0 200 200" class="ring"><circle cx="100" cy="100" r="88" class="track"/><circle id="ring" cx="100" cy="100" r="88" style="stroke:${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" data-c="${C}" data-total="${t.total}"/></svg>
      <div class="ringin"><div class="big" id="tm">${fmt(c.timeLeft())}</div><div class="mute">${t.phase === "work" ? "focus" : "break"}</div></div></div>`;
  }
  function pomoRun(t) {
    const p = S().pomo;
    if (c.timeLeft() <= 0 && t.endAt) return finishPhase(t);
    const work = t.phase === "work", paused = !t.endAt;
    return `<div class="screen pomo ${work ? "" : "brk"}">
      <div><span class="pill">${work ? `🍅 Round ${t.round} of ${p.rounds}` : t.phase === "long" ? "🌴 Long break" : "☕ Short break"}</span></div>
      ${t.label ? `<h2>${esc(t.label)}</h2>` : `<h2>${work ? "Stay with it" : "Rest your eyes"}</h2>`}
      ${ring(t, work ? "#ff5a5f" : "#22c55e")}
      ${work ? "" : `<p class="mute">${["Stretch 🙆", "Drink some water 💧", "Look out of a window 🪟", "Step outside 🌤️"][t.round % 4]}. Not a feed.</p>`}
      <div class="row"><button class="primary" data-act="${paused ? "pomoResume" : "pomoPause"}">${paused ? "▶️ Resume" : "⏸️ Pause"}</button><button data-act="pomoSkip">⏭️ Skip</button></div>
      <button class="ghost wide" data-act="pomoStop">End session</button></div>`;
  }
  function finishPhase(t, skipped) {
    const p = S().pomo; if (!skipped) chime();
    if (t.phase === "work") {
      const min = skipped ? Math.round((t.total - Math.max(0, c.timeLeft())) / 60) : Math.round(t.total / 60);
      if (min > 0) S().focus.push({ ts: Date.now(), min, kind: "pomo", goal: t.goal || undefined });
      const last = t.round >= p.rounds;
      S().timer = { kind: "pomoNext", next: last ? "long" : "short", round: t.round, goal: t.goal, label: t.label, earned: min, last };
    } else {
      S().timer = t.phase === "long" ? { kind: "pomoNext", next: "done", round: t.round } : { kind: "pomoNext", next: "work", round: t.round + 1, goal: t.goal, label: t.label };
    }
    c.save(); return pomoNext(S().timer);
  }
  function pomoNext(t) {
    const p = S().pomo, g = garden();
    if (t.next === "done") return `<div class="screen">${confetti()}<div class="emoji-xl">🎉</div><h1>Session complete!</h1><p>You finished ${p.rounds} round${p.rounds > 1 ? "s" : ""}. Your garden has <b>${g.grown}</b> plant${g.grown === 1 ? "" : "s"} now.</p>
      <a class="btn primary wide" href="#/garden" data-act="pomoClear">See your garden ${g.stage}</a><a class="btn wide" href="#/" data-act="pomoClear">Back to Home</a></div>`;
    if (t.next === "work") return `<div class="screen"><div class="emoji-xl">🍅</div><h1>Break's over</h1><p>Ready for round ${t.round} of ${p.rounds}?</p>
      <button class="primary wide" data-act="pomoGo" data-arg="work">Start round ${t.round}</button><button class="ghost wide" data-act="pomoStop">Stop for now</button></div>`;
    return `<div class="screen">${confetti()}<div class="emoji-xl">${g.stage}</div><h1>${CHEERS[t.round % CHEERS.length]}</h1>
      <p>${t.earned > 0 ? `+${t.earned} focus minutes. Your plant is growing ${g.pct ? `(${Math.round(g.pct)}%)` : "🌳 and a new one just sprouted!"}` : "Skipped. That's okay, rest anyway."}</p>
      <button class="primary wide" data-act="pomoGo" data-arg="${t.next}">${t.next === "long" ? `🌴 Start ${p.long} min long break` : `☕ Start ${p.short} min break`}</button>
      ${t.last ? `<button class="ghost wide" data-act="pomoFinish">Finish without break</button>` : `<button class="ghost wide" data-act="pomoGo" data-arg="skipbreak">Skip break</button>`}</div>`;
  }

  /* ---------- Goals + today's tasks ---------- */
  function goalRow(g) {
    const m = weekMin(g.id), pct = Math.min(100, (m / g.target) * 100);
    return `<div class="card goal"><div class="row" style="align-items:center"><div style="flex:0 0 auto" class="fi f-amber">${g.emoji}</div><div style="flex:1"><b>${esc(g.title)}</b><div class="mute">${hm(m)} of ${hm(g.target)} this week ${pct >= 100 ? "· reached 🎉" : ""}</div></div></div>
      <div class="progress"><i style="width:${pct}%;background:linear-gradient(90deg,#f59e0b,#ff5a5f)"></i></div></div>`;
  }
  function goals() {
    const gs = live(S().goals), tasks = live(S().tasks), t = today();
    const todays = tasks.filter(x => x.date === t || !x.done), doneToday = todays.filter(x => x.done).length;
    return `${header("Goals 🎯", "#/study")}
    <h2>Today's tasks ${todays.length ? `<span class="mute">${doneToday}/${todays.length}</span>` : ""}</h2>
    <div class="card">${todays.map(x => `<label class="check" style="font-weight:400"><input type="checkbox" data-task="${x.id}" ${x.done ? "checked" : ""}><span style="flex:1;${x.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(x.text)}${x.date !== t ? ' <span class="tag">from before</span>' : ""}</span><button class="ghost" style="min-height:36px;padding:4px 10px" data-act="taskDel" data-arg="${x.id}" aria-label="Delete task">✕</button></label>`).join("") || '<p class="mute">Nothing yet. Add one small thing you can finish today.</p>'}
      <div class="row" style="margin-top:10px"><input id="tk" type="text" maxlength="100" placeholder="e.g. Revise lecture 3 notes" autocomplete="off"><button class="primary" style="flex:0 0 auto" data-act="taskAdd">Add</button></div></div>
    <h2>Weekly study goals</h2>${gs.map(g => goalRow(g) + `<div style="text-align:right;margin-top:-6px"><button class="ghost" style="min-height:36px;padding:4px 12px" data-act="goalDel" data-arg="${g.id}">Remove</button></div>`).join("") || '<p class="mute">Set a weekly target per subject. Pomodoro and focus time count toward it.</p>'}
    <div class="card"><b>New goal</b><div class="chips" style="margin:8px 0">${GOAL_EMOJI.map(e => `<button class="${goalDraft.emoji === e ? "on" : ""}" data-act="goalEmoji" data-arg="${e}">${e}</button>`).join("")}</div>
      <label for="gt">Subject</label><input id="gt" type="text" maxlength="40" placeholder="e.g. Physics" autocomplete="off">
      <label for="gh">Hours per week</label><input id="gh" type="number" min="0.5" max="60" step="0.5" value="3">
      <button class="primary wide" data-act="goalAdd">Add goal</button></div>`;
  }

  /* ---------- Flashcards ---------- */
  function cards() {
    const r = c.route(), id = r[1];
    if (id) { const d = decks().find(x => x.id === id); if (d) return r[2] === "review" ? reviewRun(d) : deckPage(d); }
    const ds = decks();
    return `${header("Flashcards 🃏", "#/study")}
    ${ds.map(d => { const n = live(d.cards).length, due = dueCards(d).length; return `<a class="card btn block feature" href="#/cards/${d.id}"><span class="fi f-pink">${d.emoji}</span><span style="flex:1"><b>${esc(d.name)}</b><br><span class="mute">${n} card${n === 1 ? "" : "s"}${due ? ` · <b style="color:var(--hi)">${due} due</b>` : n ? " · all caught up ✅" : ""}</span></span></a>`; }).join("") || '<div class="card center"><div class="emoji-xl">🃏</div><p>Make your first deck. Short cards you review a little each day stick best.</p></div>'}
    <div class="card"><b>New deck</b><div class="chips" style="margin:8px 0">${DECK_EMOJI.map(e => `<button class="${(deckEdit.emoji || "🃏") === e ? "on" : ""}" data-act="deckEmoji" data-arg="${e}">${e}</button>`).join("")}</div>
      <div class="row"><input id="dn" type="text" maxlength="40" placeholder="e.g. Biology chapter 2" autocomplete="off"><button class="primary" style="flex:0 0 auto" data-act="deckAdd">Create</button></div>
      ${ds.length ? "" : `<button class="ghost wide" data-act="deckSample">✨ Try a sample deck</button>`}</div>`;
  }
  function deckPage(d) {
    const cs = live(d.cards), due = dueCards(d).length;
    return `${header(`${d.emoji} ${esc(d.name)}`, "#/cards")}
    <div class="card center"><div class="stats" style="margin:0"><div><b>${cs.length}</b><span>cards</span></div><div><b>${due}</b><span>due now</span></div><div><b>${cs.filter(x => (x.box || 0) >= 4).length}</b><span>learned 🌟</span></div></div>
      ${due ? `<a class="btn primary wide" href="#/cards/${d.id}/review">Review ${Math.min(due, 20)} card${due === 1 ? "" : "s"} ▶️</a>` : cs.length ? `<p class="mute">All caught up ✅ Come back later for the next review.</p><button class="wide" data-act="deckCram" data-arg="${d.id}">Practise all anyway</button>` : ""}</div>
    <div class="card"><b>Add a card</b>
      <label for="cf">Front (question)</label><textarea id="cf" rows="2" maxlength="300" data-cd="f">${esc(cardDraft.f)}</textarea>
      <label for="cb">Back (answer)</label><textarea id="cb" rows="2" maxlength="500" data-cd="b">${esc(cardDraft.b)}</textarea>
      <button class="primary wide" data-act="cardAdd" data-arg="${d.id}">Add card</button>
      <details><summary class="mute" style="cursor:pointer;padding:8px 0">Add many at once</summary><p class="mute">One card per line: <code>question :: answer</code></p><textarea id="cbulk" rows="4" data-cd="bulk" placeholder="Capital of France :: Paris">${esc(cardDraft.bulk)}</textarea><button class="wide" data-act="cardBulk" data-arg="${d.id}">Add all</button></details></div>
    ${cs.length ? `<h2>Cards</h2>${cs.map(x => `<div class="note"><div><b>${esc(x.f)}</b><br><span class="mute">${esc(x.b)}</span></div><button class="ghost" data-act="cardDel" data-arg="${d.id}|${x.id}" aria-label="Delete card">✕</button></div>`).join("")}` : ""}
    <button class="ghost wide" style="margin-top:20px" data-act="deckDel" data-arg="${d.id}">Delete this deck</button>`;
  }
  function reviewRun(d) {
    if (!review || review.deck !== d.id) review = { deck: d.id, queue: dueCards(d).slice(0, 20).map(x => x.id), shown: false, n: 0, again: 0 };
    if (!review.queue.length) {
      const n = review.n; review = null; S().reviews.push({ ts: Date.now(), n }); c.save();
      return `<div class="screen">${confetti()}<div class="emoji-xl">🧠</div><h1>Review done!</h1><p>You went through <b>${n}</b> card${n === 1 ? "" : "s"}. Spaced practice like this is how memories stick.</p>
        <a class="btn primary wide" href="#/cards/${d.id}">Back to deck</a><a class="btn wide" href="#/study">Study home</a></div>`;
    }
    const card = d.cards.find(x => x.id === review.queue[0]);
    if (!card) { review.queue.shift(); return reviewRun(d); }
    const total = review.n + review.queue.length;
    return `${header(`${d.emoji} Review`, `#/cards/${d.id}`)}<p class="mute">${review.n + 1} of ${total}</p><div class="progress"><i style="width:${(review.n / total) * 100}%;background:linear-gradient(90deg,#ec4899,#a855f7)"></i></div>
    <button class="flip ${review.shown ? "on" : ""}" data-act="cardFlip" aria-label="Flip card"><span class="face front"><small>QUESTION</small>${esc(card.f)}</span><span class="face back"><small>ANSWER</small>${esc(card.b)}</span></button>
    ${review.shown ? `<p class="center mute">How well did you know it?</p><div class="row"><button class="rate r1" data-act="cardRate" data-arg="0">😕<br>Again</button><button class="rate r2" data-act="cardRate" data-arg="1">🙂<br>Good</button><button class="rate r3" data-act="cardRate" data-arg="2">😄<br>Easy</button></div>` : `<button class="primary wide" data-act="cardFlip">Show answer 👀</button>`}`;
  }

  /* ---------- Garden ---------- */
  function gardenPage() {
    const g = garden(), t = focusTotal();
    return `${header("Focus garden 🌳", "#/study")}
    <div class="card center garden-now"><div class="emoji-xl">${g.stage}</div><p><b>Growing now</b></p><div class="progress"><i style="width:${g.pct}%;background:linear-gradient(90deg,#22c55e,#84cc16)"></i></div><p class="mute">${g.left} more focus minute${g.left === 1 ? "" : "s"} until it's fully grown.</p></div>
    <div class="card"><p><b>${g.grown}</b> plant${g.grown === 1 ? "" : "s"} grown · ${hm(t)} of focus in total</p>
      <div class="garden">${Array.from({ length: Math.max(g.grown, 0) }, (_, i) => `<span>${plantFor(i)}</span>`).join("") || '<p class="mute">Every 25 minutes of focus grows one plant. Start a Pomodoro to plant your first seed 🌰</p>'}</div></div>
    <p class="mute center">Your garden never wilts. Missing a day changes nothing 💚</p>
    <a class="btn primary wide" href="#/pomo">Grow another 🍅</a>`;
  }

  /* ---------- actions ---------- */
  const pomoTimer = (phase, round, goal, label) => { const p = S().pomo, m = phase === "work" ? p.work : phase === "long" ? p.long : p.short; S().timer = { kind: "pomo", phase, round, goal, label, total: m * 60, endAt: Date.now() + m * 60000, left: 0 }; c.save(); };
  const actions = {
    pomoPreset: a => { const [, w, s, l] = PRESETS.find(x => x[0] === a); Object.assign(S().pomo, { work: w, short: s, long: l }); c.save(); render(); },
    pomoGoal: a => { setup.goal = a; render(); },
    pomoStart: () => { const lbl = document.getElementById("pl"); pomoTimer("work", 1, setup.goal || "", (lbl ? lbl.value : setup.label).trim()); setup = null; render(); },
    pomoPause: () => { const t = S().timer; t.left = (t.endAt - Date.now()) / 1000; t.endAt = null; c.save(); render(); },
    pomoResume: () => { const t = S().timer; t.endAt = Date.now() + t.left * 1000; c.save(); render(); },
    pomoSkip: () => { finishPhase(S().timer, true); render(); },
    pomoStop: () => { const t = S().timer; if (t && t.kind === "pomo" && t.phase === "work") { const done = Math.round((t.total - c.timeLeft()) / 60); if (done > 0) S().focus.push({ ts: Date.now(), min: done, kind: "pomo", goal: t.goal || undefined }); } c.clearTimer(); go("#/study"); render(); },
    pomoGo: a => { const t = S().timer; if (a === "skipbreak") pomoTimer("work", t.round + 1, t.goal, t.label); else pomoTimer(a, a === "work" ? t.round : t.round, t.goal, t.label); render(); },
    pomoFinish: () => { S().timer = { kind: "pomoNext", next: "done", round: S().timer.round }; c.save(); render(); },
    pomoClear: () => { c.clearTimer(); },
    taskAdd: () => { const el = document.getElementById("tk"), v = el.value.trim(); if (!v) return; S().tasks.push(touch({ id: uid(), text: v, done: false, date: today() })); c.save(); render(); setTimeout(() => document.getElementById("tk")?.focus(), 0); },
    taskDel: a => { const x = S().tasks.find(t => t.id === a); if (x) { touch(x).del = true; c.save(); render(); } },
    goalEmoji: a => { goalDraft.emoji = a; render(); },
    goalAdd: () => { const t = document.getElementById("gt").value.trim(), h = +document.getElementById("gh").value; if (!t || !(h > 0)) return toast("Add a subject and hours per week."); S().goals.push(touch({ id: uid(), emoji: goalDraft.emoji, title: t, target: Math.round(h * 60) })); c.save(); toast(`Goal added ${goalDraft.emoji}`); },
    goalDel: a => { if (!confirm("Remove this goal? Your focus time stays.")) return; const g = S().goals.find(x => x.id === a); if (g) { touch(g).del = true; c.save(); render(); } },
    deckEmoji: a => { deckEdit.emoji = a; render(); },
    deckAdd: () => { const v = document.getElementById("dn").value.trim(); if (!v) return; const d = touch({ id: uid(), name: v, emoji: deckEdit.emoji || "🃏", cards: [] }); S().decks.push(d); c.save(); go(`#/cards/${d.id}`); },
    deckSample: () => {
      const d = touch({ id: uid(), name: "Study smarter", emoji: "🧠", cards: [["What is active recall?", "Testing yourself instead of re-reading. It builds stronger memories."], ["What is spaced repetition?", "Reviewing just before you forget, with longer gaps each time."], ["How long is a classic Pomodoro?", "25 minutes of focus, then a 5 minute break."], ["Best place for your phone while studying?", "In another room. Even face-down on the desk pulls attention."], ["What helps memory overnight?", "Sleep. Your brain files what you learned while you sleep."]].map(([f, b]) => touch({ id: uid(), f, b, box: 0, due: 0 })) });
      S().decks.push(d); c.save(); go(`#/cards/${d.id}`);
    },
    deckDel: a => { if (!confirm("Delete this deck and all its cards?")) return; const d = S().decks.find(x => x.id === a); if (d) { touch(d).del = true; c.save(); go("#/cards"); } },
    deckCram: a => { const d = S().decks.find(x => x.id === a); review = { deck: a, queue: live(d.cards).map(x => x.id).slice(0, 20), shown: false, n: 0 }; go(`#/cards/${a}/review`); },
    cardAdd: a => { const d = S().decks.find(x => x.id === a), f = cardDraft.f.trim(), b = cardDraft.b.trim(); if (!f || !b) return toast("Fill in both sides."); d.cards.push(touch({ id: uid(), f, b, box: 0, due: 0 })); touch(d); cardDraft.f = cardDraft.b = ""; c.save(); render(); setTimeout(() => document.getElementById("cf")?.focus(), 0); },
    cardBulk: a => { const d = S().decks.find(x => x.id === a); let n = 0; cardDraft.bulk.split("\n").forEach(l => { const [f, ...b] = l.split("::"); if (f && f.trim() && b.join("::").trim()) { d.cards.push(touch({ id: uid(), f: f.trim().slice(0, 300), b: b.join("::").trim().slice(0, 500), box: 0, due: 0 })); n++; } }); touch(d); cardDraft.bulk = ""; c.save(); toast(n ? `Added ${n} card${n > 1 ? "s" : ""} 🃏` : "Use: question :: answer"); },
    cardDel: a => { const [di, ci] = a.split("|"), d = S().decks.find(x => x.id === di), x = d && d.cards.find(y => y.id === ci); if (x) { touch(x).del = true; touch(d); c.save(); render(); } },
    cardFlip: () => { if (review) { review.shown = !review.shown; render(); } },
    cardRate: a => {
      const d = S().decks.find(x => x.id === review.deck), card = d.cards.find(x => x.id === review.queue[0]), q = +a;
      if (q === 0) { card.box = 0; card.due = Date.now() + 10 * 60000; if (!review.again) review.again = 0; if (review.again < 10) { review.queue.push(card.id); review.again++; } }
      else { card.box = Math.min(BOX_DAYS.length - 1, (card.box || 0) + q); card.due = Date.now() + BOX_DAYS[card.box] * 86400000; }
      touch(card); touch(d); review.queue.shift(); review.n++; review.shown = false; c.save(); render();
    },
  };

  document.addEventListener("input", e => {
    const d = e.target.dataset; if (!d) return;
    if (d.cd) cardDraft[d.cd] = e.target.value;
    if (d.setup && setup) setup[d.setup] = e.target.value;
  });
  document.addEventListener("change", e => {
    const d = e.target.dataset; if (!d) return;
    if (d.pomo) { const p = S().pomo; if (d.pomo === "sound") p.sound = e.target.checked; else { const v = Math.round(+e.target.value); const lim = { work: [5, 90], short: [1, 30], rounds: [1, 8] }[d.pomo]; if (v >= lim[0] && v <= lim[1]) p[d.pomo] = v; else e.target.value = p[d.pomo]; } c.save(); }
    if (d.task) { const x = S().tasks.find(t => t.id === d.task); if (x) { touch(x).done = e.target.checked; if (x.done) x.date = today(); c.save(); render(); if (x.done) toast("Done ✅ Nice one!"); } }
  });
  c.tickHooks.push(() => { const r = document.getElementById("ring"); if (r && c.timer()) r.setAttribute("stroke-dashoffset", r.dataset.c * (1 - Math.max(0, Math.min(1, c.timeLeft() / r.dataset.total)))); });

  return {
    routes: { study, pomo, goals, cards, garden: gardenPage },
    tabs: { study: "study", pomo: "study", goals: "study", cards: "study", garden: "study" },
    actions, garden, todayMin, hm, dueTotal: () => decks().reduce((a, d) => a + dueCards(d).length, 0),
  };
}
