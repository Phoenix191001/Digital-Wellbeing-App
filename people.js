// "Find your people": safe, space-separated interest circles. Talks to /api/community.
// If the backend isn't connected, it falls back to curated WhatsApp links (community-links.json).
export const CIRCLES = [
  { id: "study", n: "Study", d: "Study together, share tips and stay on track." },
  { id: "coding", n: "Coding", d: "Learn, build and debug with others." },
  { id: "gaming", n: "Gaming", d: "Talk games, in a healthy way." },
  { id: "football", n: "Football", d: "Matches, playing and friendly debate." },
  { id: "reading", n: "Reading", d: "Books, stories and what you're reading now." },
  { id: "art", n: "Art and making", d: "Draw, write, cook, build. Show and share." },
  { id: "faith", n: "Faith", d: "Quiet space for faith and reflection." },
  { id: "talk", n: "Just need to talk", d: "A kind place to be heard." },
];
const RULES = [
  "Listen first. Everyone is here to feel heard.",
  "No mocking or judging, ever.",
  "Never share private details: real names, phone numbers, hostel or room.",
  "No dating or flirting.",
  "Report anything that feels wrong.",
];
const LK = "pause.community";
const BLOCK_MSG = { email: "emails", link: "links", phone: "phone numbers", handle: "@handles" };

export function initPeople({ esc, header, render, go, toast, getS, save }) {
  let L = {}; try { L = JSON.parse(localStorage.getItem(LK)) || {}; } catch { L = {}; }
  const saveL = () => localStorage.setItem(LK, JSON.stringify(L));
  const route = () => (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  const rand = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");

  async function api(action, data = {}, extra = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token: L.token, ...data }), signal: ctl.signal, ...extra });
      let body = {}; try { body = await r.json(); } catch { /* ignore */ }
      return { status: r.status, body };
    } catch { return { status: 0, body: {} }; } finally { clearTimeout(t); }
  }

  /* ---- state ---- */
  let net = { status: "idle" };            // idle | loading | on | off | offline
  let links = null;                        // fallback WhatsApp links
  let J = { step: 0, space: null, name: null, busy: false };
  let F = { circle: null, loading: false, posts: [], err: "" };
  let comp = { draft: "", msg: "", kind: "", busy: false };
  let replyOpen = null; const drafts = {};
  let mod = { pass: sessionStorage.getItem("pause.mod") || "", items: null, err: "", busy: false };

  async function loadStatus() {
    net = { status: "loading" };
    const r = await api("status");
    net = { status: r.status === 0 ? "offline" : r.body.configured ? "on" : "off" };
    if (net.status === "off") { try { links = await (await fetch("community-links.json", { cache: "no-store" })).json(); } catch { links = {}; } }
    if (net.status === "on" && L.token) { const m = await api("me"); if (m.status === 401) { L = {}; saveL(); } else if (m.body.user) { Object.assign(L, m.body.user); saveL(); } }
    render();
  }

  const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
  const spaceName = s => (s === "female" ? "Female space" : "Male space");
  const note = `<p class="mute" style="font-size:.85em">Pause is not a counselor. If you need a person, tap <a href="#/talk">Talk to someone</a>.</p>`;

  /* ---- screens ---- */
  function people() {
    const r = route(); if (net.status === "idle") { loadStatus(); }
    if (net.status === "idle" || net.status === "loading") return `${header("Find your people", "#/do")}<div class="card"><p class="mute">Loading…</p></div>`;
    if (net.status === "offline") return `${header("Find your people", "#/do")}<div class="card"><p>This needs an internet connection.</p><button class="primary block center" data-act="pplRetry">Try again</button></div>${note}`;
    const live = net.status === "on";
    if (!L.rulesOk || !L.space || (live && !L.token)) return joinFlow(live);
    if (r[1] && live) return circlePage(r[1]);
    return live ? circleList() : fallbackList();
  }

  function joinFlow(live) {
    const total = live ? 3 : 2, i = J.step;
    let body = "";
    if (i === 0) body = `<h2 style="margin-top:0">House rules</h2><ol class="steps">${RULES.map(x => `<li>${x}</li>`).join("")}</ol>
      <button class="primary block center" data-act="pplNext">I agree</button>`;
    if (i === 1) body = `<h2 style="margin-top:0">Choose your space</h2><p><b>You will only see people in your own space.</b></p>
      <p class="mute">This is self-declared. We cannot verify it, so please choose honestly.</p>
      <div class="chips">${["female", "male"].map(s => `<button class="${J.space === s ? "on" : ""}" data-act="pplSpace" data-arg="${s}">${spaceName(s)}</button>`).join("")}</div>
      <button class="primary block center" style="margin-top:14px" data-act="${live ? "pplNext" : "pplFinishFallback"}">Continue</button>`;
    if (i === 2) body = `<h2 style="margin-top:0">Your display name</h2><p class="mute">A made-up name. No real name, photo, email or phone number.</p>
      <div class="big" style="font-size:1.8em">${J.name ? esc(J.name) : "…"}</div>
      <button class="block center" data-act="pplReroll">🎲 Pick another name</button>
      <button class="primary block center" data-act="pplJoin" ${J.busy ? "disabled" : ""}>${J.busy ? "Joining…" : "Join"}</button>`;
    if (i === 2 && !J.name && !J.busy) reroll();
    return `${header("Find your people", "#/do")}<p class="mute">Step ${i + 1} of ${total}</p><div class="card">${body}</div>${note}`;
  }
  async function reroll() { J.busy = true; const r = await api("roll"); J.busy = false; J.name = r.body.name || null; if (!J.name) toast("Could not reach the server. Try again."); render(); }

  function circleList() {
    return `${header("Find your people", "#/do")}
    <div class="card warm"><b>${spaceName(L.space)}</b> · you appear as <b>${esc(L.name)}</b><br><span class="mute">You only see people in your own space.</span></div>
    ${CIRCLES.map(c => `<a class="card btn block" style="display:block;color:inherit" href="#/people/${c.id}"><b>${c.n}</b> ${L.circles?.includes(c.id) ? '<span class="tag">Joined</span>' : ""}<br><span class="mute">${c.d}</span></a>`).join("")}${note}`;
  }

  function fallbackList() {
    const mine = (links && links[L.space]) || {};
    return `${header("Find your people", "#/do")}
    <div class="card warm"><b>${spaceName(L.space)}</b><br><span class="mute">You only see groups for your own space. Open posting isn't available yet.</span></div>
    ${CIRCLES.map(c => `<div class="card"><b>${c.n}</b><br><span class="mute">${c.d}</span>
      ${mine[c.id] ? `<a class="btn primary wide" style="margin-top:10px" href="${esc(mine[c.id])}" target="_blank" rel="noopener noreferrer">Join this circle's WhatsApp group</a>` : `<p class="mute" style="margin:10px 0 0">A group link is coming soon.</p>`}</div>`).join("")}
    <div class="card"><b>If something feels wrong</b><ol class="steps"><li>Leave the group and block the person in WhatsApp.</li><li>Use WhatsApp's Report option.</li><li>Tell someone you trust, or tap Talk to someone.</li></ol>
      <p class="mute">Never share private details like your real name, number or hostel in a group.</p></div>
    <button class="ghost block center" data-act="pplLeave">Change my space</button>${note}`;
  }

  function circlePage(id) {
    const c = CIRCLES.find(x => x.id === id); if (!c) return circleList();
    if (F.circle !== id) { F = { circle: id, loading: true, posts: [], err: "" }; comp = { draft: "", msg: "", kind: "", busy: false }; loadFeed(); }
    const joined = L.circles?.includes(id);
    return `${header(c.n, "#/people")}<p class="mute">${c.d}</p>
    <div class="row"><button class="${joined ? "" : "primary"}" data-act="pplCircle" data-arg="${id}|${joined ? "leave" : "join"}">${joined ? "Leave this circle" : "Join this circle"}</button><button data-act="pplRefresh">Refresh</button></div>
    ${composer()}
    ${F.loading ? '<p class="mute">Loading…</p>' : F.err ? `<div class="card"><p>${esc(F.err)}</p></div>` : F.posts.length ? F.posts.map(post).join("") : '<div class="card"><p class="mute">No posts yet. Be the first to say hello.</p></div>'}${note}`;
  }

  function composer() {
    if (comp.kind === "selfharm") return `<div class="card warm"><b>Thank you for trusting us with that.</b><p>It sounds like things feel really heavy. We didn't post this, because you deserve a real person. You are not alone.</p>
      <a class="btn primary wide" href="#/talk">Talk to someone</a>
      <button class="wide" data-act="pplSaveNote">Save it as a private mood note</button><button class="ghost wide" data-act="pplDismiss">Close</button></div>`;
    return `<div class="card"><label for="pp">Share something</label>
      <textarea id="pp" rows="3" maxlength="280" data-draft="post" placeholder="Be kind. No links, numbers or private details.">${esc(comp.draft)}</textarea>
      <div class="mute" style="text-align:right;font-size:.8em"><span id="pc">${[...comp.draft].length}</span>/280</div>
      ${comp.msg ? `<p style="color:var(--hi)">${esc(comp.msg)}</p>` : ""}
      <button class="primary block center" data-act="pplPost" ${comp.busy ? "disabled" : ""}>Post</button></div>`;
  }

  function post(p) {
    const ro = replyOpen === p.id;
    return `<div class="card"><div class="mute"><b>${esc(p.name)}</b> · ${ago(p.ts)}</div><p style="white-space:pre-wrap;word-break:break-word">${esc(p.text)}</p>
      <div class="chips"><button class="${p.relate ? "on" : ""}" data-act="pplReact" data-arg="${p.id}|relate">🤝 I relate</button><button class="${p.thanks ? "on" : ""}" data-act="pplReact" data-arg="${p.id}|thanks">💛 Thanks</button>
        <button data-act="pplReplyToggle" data-arg="${p.id}">Reply</button>${p.mine ? "" : `<button class="ghost" data-act="pplReport" data-arg="${p.id}|">Report</button>`}</div>
      ${p.mine && (p.someoneRelates || p.someoneThanks) ? `<p class="mute" style="margin:8px 0 0">${p.someoneRelates ? "🤝 Someone relates to this. " : ""}${p.someoneThanks ? "💛 Someone says thanks." : ""}</p>` : ""}
      ${p.replies.map(r => `<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px"><div class="mute"><b>${esc(r.name)}</b> · ${ago(r.ts)}</div><p style="white-space:pre-wrap;word-break:break-word;margin:.2em 0">${esc(r.text)}</p>${r.mine ? "" : `<button class="ghost" style="min-height:40px;padding:6px 12px" data-act="pplReport" data-arg="${p.id}|${r.id}">Report</button>`}</div>`).join("")}
      ${ro ? `<div style="margin-top:10px"><textarea rows="2" maxlength="280" data-draft="r:${p.id}" placeholder="Reply kindly">${esc(drafts["r:" + p.id] || "")}</textarea><p id="re" style="color:var(--hi);margin:.3em 0"></p><button class="primary block center" data-act="pplReply" data-arg="${p.id}">Send reply</button></div>` : ""}</div>`;
  }

  async function loadFeed() {
    const id = F.circle, r = await api("feed", { circle: id });
    if (F.circle !== id) return;
    F.loading = false;
    if (r.status === 401) { L = {}; saveL(); toast("Please join again."); go("#/people"); return; }
    F.err = r.status === 200 ? "" : "Could not load posts. Pull to refresh in a moment.";
    F.posts = r.body.posts || []; render();
  }

  function mod_() {
    if (!mod.pass) return `<h1>Moderator</h1><div class="card"><label for="mp">Passcode</label><input id="mp" type="password" autocomplete="off"><button class="primary block center" style="margin-top:10px" data-act="modOpen">Open</button>${mod.err ? `<p style="color:var(--hi)">${esc(mod.err)}</p>` : ""}</div>`;
    if (!mod.items && !mod.busy) loadMod();
    return `<h1>Moderator</h1><div class="row"><button data-act="modRefresh">Refresh</button><button class="ghost" data-act="modOut">Lock</button></div>${mod.err ? `<p style="color:var(--hi)">${esc(mod.err)}</p>` : ""}
      ${mod.items ? (mod.items.length ? mod.items.map(i => `<div class="card"><span class="tag">${i.space} · ${i.circle}</span> <span class="tag">${i.reports} report${i.reports === 1 ? "" : "s"}</span> ${i.hidden ? '<span class="tag">hidden</span>' : ""}${i.replyId ? ' <span class="tag">reply</span>' : ""}
        <p class="mute" style="margin:.4em 0">${esc(i.name)} · ${ago(i.ts)}</p><p style="white-space:pre-wrap;word-break:break-word">${esc(i.text)}</p>
        <div class="row"><button class="danger" data-act="modHide" data-arg="${i.postId}|${i.replyId || ""}">Hide</button><button class="primary" data-act="modRestore" data-arg="${i.postId}|${i.replyId || ""}">Restore</button></div></div>`).join("") : '<div class="card"><p class="mute">Nothing reported.</p></div>') : '<p class="mute">Loading…</p>'}`;
  }
  async function loadMod() {
    mod.busy = true; const r = await api("modList", { pass: mod.pass }); mod.busy = false;
    if (r.status === 401 || r.status === 429 || r.status === 503) { mod.err = r.status === 401 ? "Wrong passcode." : r.status === 429 ? "Too many attempts. Try later." : "Moderator page is not enabled (set MOD_PASSCODE)."; mod.pass = ""; sessionStorage.removeItem("pause.mod"); mod.items = null; }
    else { mod.err = r.status === 200 ? "" : "Could not load."; mod.items = r.body.items || []; }
    render();
  }

  function settingsBlock() {
    if (!(L.token || L.space)) return "";
    return `<div class="card"><b>Find your people</b><p class="mute">${L.token ? `You appear as ${esc(L.name || "")}. ` : ""}Leaving removes your made-up name, your anonymous id and everything you posted.</p>
      <button class="danger block center" data-act="pplLeave">Leave community and delete my posts</button></div>`;
  }
  async function leaveAll() {
    if (L.token) { const r = await api("leave"); if (r.status !== 200 && r.status !== 401) return false; }
    L = {}; saveL(); F = { circle: null, loading: false, posts: [], err: "" }; J = { step: 0, space: null, name: null, busy: false }; return true;
  }

  /* ---- actions ---- */
  const actions = {
    pplRetry: () => loadStatus(),
    pplNext: () => { if (J.step === 0) { L.rulesOk = true; saveL(); } if (J.step === 1 && !J.space) return toast("Please choose a space."); J.step++; render(); },
    pplSpace: a => { J.space = a; render(); },
    pplFinishFallback: () => { if (!J.space) return toast("Please choose a space."); L.rulesOk = true; L.space = J.space; saveL(); render(); },
    pplReroll: () => { J.name = null; reroll(); },
    pplJoin: async () => {
      if (!J.name || !J.space || J.busy) return; J.busy = true; render();
      const token = rand(), r = await api("join", { token, space: J.space, name: J.name }); J.busy = false;
      if (r.status !== 200) { toast("Could not join. Try again."); return; }
      L = { token, rulesOk: true, ...r.body.user }; saveL(); toast("Welcome, " + L.name + "."); render();
    },
    pplLeave: async () => {
      if (!confirm(L.token ? "Leave the community and delete all your posts? This cannot be undone." : "Reset your space choice?")) return;
      if (await leaveAll()) { toast("Done. Your community data is deleted."); if (route()[0] !== "me") go("#/people"); render(); } else toast("Could not reach the server. Try again.");
    },
    pplCircle: async a => { const [c, op] = a.split("|"), r = await api("circle", { circle: c, op }); if (r.status === 200) { L.circles = r.body.circles; saveL(); render(); } else toast("Could not update. Try again."); },
    pplRefresh: () => { F.loading = true; render(); loadFeed(); },
    pplPost: async () => {
      const text = comp.draft.trim(); if (!text) return; comp.busy = true; comp.msg = ""; render();
      const r = await api("post", { circle: F.circle, text }); comp.busy = false;
      if (r.status === 200 && r.body.status === "selfharm") { comp.kind = "selfharm"; comp.msg = ""; }
      else if (r.status === 200 && r.body.status === "blocked") comp.msg = `To keep everyone safe, please remove ${BLOCK_MSG[r.body.reason] || "personal details"}.`;
      else if (r.status === 200) { comp.draft = ""; comp.msg = ""; F.loading = true; loadFeed(); }
      else if (r.status === 429) comp.msg = "You've reached 5 posts this hour. Take a breath and come back later.";
      else if (r.status === 401) { L = {}; saveL(); go("#/people"); }
      else comp.msg = "Could not post. Check your connection and try again.";
      render();
    },
    pplSaveNote: () => { const S = getS(); S.notes.unshift({ ts: Date.now(), text: comp.draft.trim() }); save(); comp = { draft: "", msg: "", kind: "", busy: false }; toast("Saved as a private note on this phone."); },
    pplDismiss: () => { comp = { draft: "", msg: "", kind: "", busy: false }; render(); },
    pplReplyToggle: a => { replyOpen = replyOpen === a ? null : a; render(); },
    pplReply: async a => {
      const text = (drafts["r:" + a] || "").trim(); if (!text) return;
      const r = await api("reply", { postId: a, text });
      if (r.status === 200 && r.body.status === "selfharm") { comp = { draft: text, msg: "", kind: "selfharm", busy: false }; replyOpen = null; drafts["r:" + a] = ""; }
      else if (r.status === 200) { drafts["r:" + a] = ""; replyOpen = null; loadFeed(); }
      else { const m = r.status === 200 && r.body.status === "blocked" ? `Please remove ${BLOCK_MSG[r.body.reason] || "personal details"}.` : r.status === 429 ? "Too many replies this hour. Come back later." : "Could not send."; const el = document.getElementById("re"); if (el) el.textContent = m; return; }
      render();
    },
    pplReact: async a => { const [id, type] = a.split("|"), p = F.posts.find(x => x.id === id); if (!p) return; p[type] = !p[type]; render(); const r = await api("react", { postId: id, type }); if (r.status !== 200) { p[type] = !p[type]; render(); } },
    pplReport: async a => {
      const [postId, replyId] = a.split("|"); if (!confirm("Report this? It will be hidden from you, and removed for everyone after 3 people report it.")) return;
      const r = await api("report", { postId, replyId: replyId || undefined });
      if (r.status === 200) { toast("Thank you. We'll look at it."); loadFeed(); } else toast("Could not send the report.");
    },
    modOpen: () => { const v = document.getElementById("mp").value; if (!v) return; mod.pass = v; sessionStorage.setItem("pause.mod", v); mod.items = null; mod.err = ""; render(); },
    modRefresh: () => { mod.items = null; render(); }, modOut: () => { mod = { pass: "", items: null, err: "", busy: false }; sessionStorage.removeItem("pause.mod"); render(); },
    modHide: a => modAct("modHide", a), modRestore: a => modAct("modRestore", a),
  };
  async function modAct(action, a) { const [postId, replyId] = a.split("|"), r = await api(action, { pass: mod.pass, postId, replyId: replyId || undefined }); if (r.status === 200) { mod.items = null; render(); } else toast("Could not do that."); }

  document.addEventListener("input", e => {
    const k = e.target.dataset && e.target.dataset.draft; if (!k) return;
    if (k === "post") { comp.draft = e.target.value; const c = document.getElementById("pc"); if (c) c.textContent = [...comp.draft].length; } else drafts[k] = e.target.value;
  });

  return { people, mod: mod_, actions, settingsBlock, leaveSilently: () => leaveAll(), isJoined: () => !!(L.token || L.space) };
}
