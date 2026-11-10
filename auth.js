// Optional accounts (Supabase Auth over plain HTTPS) + private backup/sync of app data.
// Without an account nothing changes: everything stays on this phone.
import { SUPABASE } from "./config.js";

const AK = "pause.auth";
const NOT_SYNCED = ["timer", "sleepStart"]; // device-only

/* ---------- merge (exported for tests) ---------- */
const KEYS = { focus: x => "f" + x.ts, done: x => "d" + x.ts + x.id, notes: x => "n" + x.ts, week: x => x.date, sleepLog: x => "s" + x.start, goals: x => x.id, tasks: x => x.id, checkins: x => String(x), reviews: x => "r" + x.ts };
export function mergeList(a = [], b = [], key) {
  const m = new Map();
  for (const x of [...b, ...a]) { const k = key(x), p = m.get(k); if (!p || (x && x.u || 0) >= (p && p.u || 0)) m.set(k, x); }
  return [...m.values()];
}
export function mergeData(local, remote) {
  if (!remote) return local;
  const out = { ...remote, ...local };
  const tomb = new Set([...(local.tomb || []), ...(remote.tomb || [])]);
  out.tomb = [...tomb].slice(-500);
  for (const [f, k] of Object.entries(KEYS)) out[f] = mergeList(local[f], remote[f], k).filter(x => !tomb.has(k(x)));
  out.decks = mergeList(local.decks, remote.decks, d => d.id).map(d => { const o = [...(local.decks || []), ...(remote.decks || [])].filter(x => x.id === d.id); return { ...d, cards: o.reduce((acc, x) => mergeList(acc, x.cards, y => y.id), []) }; });
  out.usage = { ...remote.usage }; for (const [k, v] of Object.entries(local.usage || {})) if (!out.usage[k] || (v.u || 0) >= (out.usage[k].u || 0)) out.usage[k] = v;
  out.mood = { ...remote.mood, ...local.mood };
  out.pauseTime = { ...remote.pauseTime }; for (const [k, v] of Object.entries(local.pauseTime || {})) out.pauseTime[k] = Math.max(v, out.pauseTime[k] || 0);
  out.limits = Object.keys(local.limits || {}).length ? local.limits : remote.limits || {};
  out.profile = { ...remote.profile, ...Object.fromEntries(Object.entries(local.profile || {}).filter(([, v]) => v)) };
  for (const f of ["settings", "pomo", "timer", "sleepStart", "onboarded", "checklist"]) if (f in local) out[f] = local[f];
  out.onboarded = true;
  return out;
}

export function initAuth(c) {
  const { header, render, go, toast, esc } = c;
  let A = null; try { A = JSON.parse(localStorage.getItem(AK)); } catch { A = null; }
  let busy = false, msg = "", msgKind = "", sync = { state: "idle", at: 0 }, timer = null, lastPull = 0;
  const saveA = () => (A ? localStorage.setItem(AK, JSON.stringify(A)) : localStorage.removeItem(AK));
  const base = SUPABASE.url + "/auth/v1", rest = SUPABASE.url + "/rest/v1";

  async function req(url, { method = "POST", body, token, prefer } = {}) {
    try {
      const r = await fetch(url, { method, headers: { apikey: SUPABASE.key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
      let j = {}; try { j = await r.json(); } catch { /* empty */ }
      return { ok: r.ok, status: r.status, body: j };
    } catch { return { ok: false, status: 0, body: {} }; }
  }
  function nice(r) {
    const t = `${r.body.msg || r.body.error_description || r.body.message || r.body.error || ""} ${r.body.error_code || ""}`.toLowerCase();
    if (r.status === 0) return "No connection. Check your internet and try again.";
    if (r.status === 429 || t.includes("rate limit")) return "Too many tries. Please wait a few minutes and try again.";
    if (t.includes("invalid login")) return "Email or password is not right.";
    if (t.includes("not confirmed")) return "Please confirm your email first. Check your inbox (and spam folder).";
    if (t.includes("already registered") || t.includes("already been registered") || t.includes("user_already_exists")) return "This email already has an account. Try signing in.";
    if (t.includes("password") && (t.includes("weak") || t.includes("at least") || t.includes("characters"))) return "Please choose a stronger password (at least 8 characters, mix letters and numbers).";
    if (t.includes("email") && t.includes("invalid")) return "That email address doesn't look right.";
    if (t.includes("signup") && t.includes("disabled")) return "Sign ups are turned off right now.";
    return "Something went wrong. Please try again.";
  }
  function setSession(j, user) {
    const u = user || j.user || {};
    A = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (+j.expires_in || 3600) * 1000, user: { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || "" } };
    saveA();
    if (A.user.name && !c.S.profile.name) { c.S.profile.name = A.user.name; c.saveLocal(); }
  }
  async function token() {
    if (!A) return null;
    if (A.expires_at - 60000 > Date.now()) return A.access_token;
    const r = await req(`${base}/token?grant_type=refresh_token`, { body: { refresh_token: A.refresh_token } });
    if (r.ok && r.body.access_token) { setSession(r.body, r.body.user || { ...A.user, user_metadata: { name: A.user.name } }); return A.access_token; }
    if (r.status >= 400 && r.status < 500) { A = null; saveA(); toast("Please sign in again to keep backing up."); }
    return null;
  }

  /* ---------- sync ---------- */
  const payload = () => { const d = { ...c.S }; NOT_SYNCED.forEach(k => delete d[k]); if (!c.S.settings.syncNotes) delete d.notes; return d; };
  async function syncNow(force) {
    if (!A || sync.state === "syncing") return;
    const t = await token(); if (!t) return;
    sync.state = "syncing";
    if (!force) {
      const r = await req(`${rest}/pause_user_data?select=data,updated_at&user_id=eq.${A.user.id}`, { method: "GET", token: t });
      if (!r.ok) { sync.state = "error"; return render(); }
      const row = r.body[0];
      if (row) { const remote = row.data || {}; if (!c.S.settings.syncNotes) delete remote.notes; c.setS(mergeData(c.S, remote)); c.saveLocal(); }
      lastPull = Date.now();
    }
    const p = await req(`${rest}/pause_user_data?on_conflict=user_id`, { token: t, prefer: "resolution=merge-duplicates,return=minimal", body: { user_id: A.user.id, data: payload(), updated_at: new Date().toISOString() } });
    sync = { state: p.ok ? "ok" : "error", at: p.ok ? Date.now() : sync.at };
    if (["account", ""].includes(c.route()[0] || "")) render();
  }
  const queue = () => { if (!A) return; clearTimeout(timer); timer = setTimeout(() => syncNow(), 4000); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && A && Date.now() - lastPull > 30000) syncNow(); });

  /* ---------- email-link callback: #access_token=...&type=signup|recovery ---------- */
  function bootFromHash() {
    const h = location.hash.slice(1);
    if (h.includes("error_description=") || h.startsWith("error=")) {
      const p = new URLSearchParams(h); history.replaceState(null, "", location.pathname + "#/signin");
      msg = (p.get("error_code") || "").includes("expired") ? "That link has expired. Sign in, or ask for a new link." : "That link didn't work. Please try again."; msgKind = "err";
      return;
    }
    if (!h.includes("access_token=")) return;
    const p = new URLSearchParams(h), type = p.get("type");
    history.replaceState(null, "", location.pathname + (type === "recovery" ? "#/reset" : "#/account"));
    A = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Date.now() + (+p.get("expires_in") || 3600) * 1000, user: { id: null, email: "", name: "" } };
    saveA();
    if (!c.S.onboarded) { c.S.onboarded = true; c.saveLocal(); }
    req(`${base}/user`, { method: "GET", token: A.access_token }).then(r => {
      if (!r.ok) { A = null; saveA(); msg = "That link didn't work. Please sign in."; msgKind = "err"; go("#/signin"); return render(); }
      setSession({ access_token: A.access_token, refresh_token: A.refresh_token, expires_in: (A.expires_at - Date.now()) / 1000 }, r.body);
      if (type !== "recovery") { msg = "Your email is confirmed. Welcome! 🎉"; msgKind = "ok"; syncNow(); }
      render();
    });
  }

  /* ---------- screens ---------- */
  const note = () => (msg ? `<p class="${msgKind === "ok" ? "okmsg" : "errmsg"}" role="alert">${esc(msg)}</p>` : "");
  const back = () => (c.S.onboarded ? "#/me" : "#/onboard/3");
  function signup() {
    if (A) return account();
    return `${header("Create account ✨", back())}
    <div class="card"><p class="mute">Back up your study progress, goals, flashcards and garden, and use سكون on more than one device. Optional: سكون works fully without an account.</p>
    <form data-act="signUp" novalidate>
      <label for="su-name">Nickname <span class="mute">(optional)</span></label><input id="su-name" name="nickname" type="text" maxlength="30" autocomplete="nickname" placeholder="What should سكون call you?" value="${esc(lastName)}">
      <label for="su-email">Email</label><input id="su-email" name="email" type="email" autocomplete="email" required inputmode="email" value="${esc(lastEmail)}">
      <label for="su-pass">Password</label><input id="su-pass" name="new-password" type="password" autocomplete="new-password" minlength="8" required>
      <label for="su-pass2">Repeat password</label><input id="su-pass2" type="password" autocomplete="new-password" minlength="8" required>
      ${note()}
      <button class="primary wide" type="submit" ${busy ? "disabled" : ""}>${busy ? "Creating…" : "Create account"}</button></form>
    <p class="center">Already have one? <a href="#/signin">Sign in</a></p></div>
    <p class="mute center" style="font-size:.85em">🔒 Mood notes are not uploaded unless you turn that on. Your community posts stay anonymous and separate.</p>
    ${c.S.onboarded ? "" : `<button class="ghost wide" data-act="authSkip">Continue without an account</button>`}`;
  }
  function signin() {
    if (A) return account();
    return `${header("Sign in 👋", back())}
    <div class="card"><form data-act="signIn" novalidate>
      <label for="si-email">Email</label><input id="si-email" name="email" type="email" autocomplete="email" required inputmode="email" value="${esc(lastEmail)}">
      <label for="si-pass">Password</label><input id="si-pass" name="password" type="password" autocomplete="current-password" required>
      ${note()}
      <button class="primary wide" type="submit" ${busy ? "disabled" : ""}>${busy ? "Signing in…" : "Sign in"}</button></form>
      <div class="row"><button class="ghost" data-act="forgot">Forgot password?</button><a class="btn ghost" style="border:1px solid var(--line)" href="#/signup">Create account</a></div></div>
    ${c.S.onboarded ? "" : `<button class="ghost wide" data-act="authSkip">Continue without an account</button>`}`;
  }
  function reset() {
    if (!A) return signin();
    return `${header("New password 🔑")}<div class="card"><form data-act="setPass" novalidate>
      <label for="np">New password</label><input id="np" type="password" autocomplete="new-password" minlength="8" required>
      <label for="np2">Repeat password</label><input id="np2" type="password" autocomplete="new-password" minlength="8" required>
      ${note()}<button class="primary wide" type="submit" ${busy ? "disabled" : ""}>Save password</button></form></div>`;
  }
  function account() {
    if (!A) return `${header("Account ☁️", "#/me")}
      <div class="card center"><div class="emoji-xl">☁️</div><p>You're using سكون <b>without an account</b>. Everything stays on this phone.</p>
      <p class="mute">Create one to back up your goals, flashcards, garden and stats, and use them on another device.</p>
      <a class="btn primary wide" href="#/signup">Create account</a><a class="btn wide" href="#/signin">Sign in</a></div>`;
    const name = c.S.profile.name || A.user.name || "", when = sync.at ? new Date(sync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    return `${header("Account ☁️", "#/me")}${note()}
    <div class="card center"><div class="avatar">${esc((name || A.user.email || "?")[0].toUpperCase())}</div><h2 style="margin:.3em 0 0">${esc(name || "Hi there")}</h2><p class="mute">${esc(A.user.email || "")}</p>
      <p>${sync.state === "syncing" ? "🔄 Backing up…" : sync.state === "error" ? "⚠️ Couldn't back up. We'll try again." : sync.at ? `✅ Backed up at ${when}` : "☁️ Ready to back up"}</p>
      <button class="wide" data-act="syncNow">Back up now</button></div>
    <div class="card"><label for="pn">Nickname</label><div class="row"><input id="pn" type="text" maxlength="30" value="${esc(name)}"><button style="flex:0 0 auto" data-act="saveName">Save</button></div>
      <label class="check" style="font-weight:600;border:0"><input type="checkbox" data-field="syncNotes" ${c.S.settings.syncNotes ? "checked" : ""}>Also back up my private mood notes</label>
      <p class="mute">Off by default. Your notes are private either way; this only decides whether they leave this phone.</p></div>
    <button class="wide" data-act="signOut">Sign out</button>
    <button class="danger wide" data-act="deleteAccount">Delete my account</button>
    <p class="mute center" style="font-size:.85em">Deleting removes your account and backup from the server. Data on this phone stays until you delete it in Settings.</p>`;
  }

  /* ---------- actions ---------- */
  const val = id => (document.getElementById(id) || {}).value || "";
  // Read the form BEFORE any re-render; keep the typed email so an error doesn't wipe it.
  let lastEmail = "", lastName = "";
  const run = async fn => {
    if (busy) return; busy = true; msg = "";
    const btn = document.querySelector("form [type=submit]"); if (btn) { btn.disabled = true; btn.textContent = "Please wait…"; }
    try { await fn(); } finally { busy = false; render(); }
  };
  const actions = {
    authSkip: () => { c.S.onboarded = true; c.saveLocal(); msg = ""; go("#/"); },
    signUp: () => run(async () => {
      const name = (lastName = val("su-name").trim().slice(0, 30)), email = (lastEmail = val("su-email").trim()), p1 = val("su-pass"), p2 = val("su-pass2");
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg = "Please enter a valid email."; msgKind = "err"; return; }
      if (p1.length < 8) { msg = "Password needs at least 8 characters."; msgKind = "err"; return; }
      if (p1 !== p2) { msg = "The two passwords don't match."; msgKind = "err"; return; }
      const r = await req(`${base}/signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { email, password: p1, data: { name } } });
      if (!r.ok) { msg = nice(r); msgKind = "err"; return; }
      if (name) { c.S.profile.name = name; c.saveLocal(); }
      if (r.body.access_token) { setSession(r.body); c.S.onboarded = true; c.saveLocal(); msg = "Account created. Welcome! 🎉"; msgKind = "ok"; go("#/account"); await syncNow(); }
      else { msg = `Almost done! We sent a link to ${email}. Open it to confirm your account, then come back and sign in. (Check spam too.)`; msgKind = "ok"; go("#/signin"); }
    }),
    signIn: () => run(async () => {
      const email = (lastEmail = val("si-email").trim()), pass = val("si-pass");
      if (!email || !pass) { msg = "Enter your email and password."; msgKind = "err"; return; }
      const r = await req(`${base}/token?grant_type=password`, { body: { email, password: pass } });
      if (!r.ok || !r.body.access_token) { msg = nice(r); msgKind = "err"; return; }
      setSession(r.body); c.S.onboarded = true; c.saveLocal(); msg = `Welcome back${A.user.name ? ", " + A.user.name : ""}! 👋`; msgKind = "ok";
      go("#/account"); await syncNow();
    }),
    forgot: () => run(async () => {
      const email = (lastEmail = val("si-email").trim());
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg = "Type your email above first, then tap Forgot password."; msgKind = "err"; return; }
      const r = await req(`${base}/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { email } });
      msg = r.ok ? `If ${email} has an account, we sent a reset link.` : nice(r); msgKind = r.ok ? "ok" : "err";
    }),
    setPass: () => run(async () => {
      const p1 = val("np"), p2 = val("np2");
      if (p1.length < 8) { msg = "Password needs at least 8 characters."; msgKind = "err"; return; }
      if (p1 !== p2) { msg = "The two passwords don't match."; msgKind = "err"; return; }
      const t = await token(); const r = await req(`${base}/user`, { method: "PUT", token: t, body: { password: p1 } });
      msg = r.ok ? "Password changed ✅" : nice(r); msgKind = r.ok ? "ok" : "err"; if (r.ok) go("#/account");
    }),
    syncNow: () => syncNow(),
    saveName: () => { c.S.profile.name = val("pn").trim().slice(0, 30); c.save(); toast("Saved ✨"); },
    signOut: async () => {
      if (!confirm("Sign out? Your data stays on this phone.")) return;
      await syncNow(); const t = A && A.access_token; if (t) req(`${base}/logout`, { token: t });
      A = null; saveA(); sync = { state: "idle", at: 0 }; msg = ""; go("#/me"); render();
    },
    deleteAccount: async () => {
      if (!confirm("Delete your account and its backup from the server? This cannot be undone.")) return;
      const t = await token(); if (!t) return toast("Please sign in again first.");
      let ok = false; try { const r = await fetch("/api/account", { method: "POST", headers: { Authorization: `Bearer ${t}` } }); ok = r.ok; } catch { ok = false; }
      if (!ok) return toast("Couldn't delete right now. Check your connection and try again.");
      A = null; saveA(); sync = { state: "idle", at: 0 }; msg = ""; toast("Your account was deleted."); go("#/me");
    },
  };

  return {
    routes: { signup, signin, account, reset }, tabs: { signup: "me", signin: "me", account: "me", reset: "me" },
    actions, bootFromHash, queue, syncNow, forcePush: () => syncNow(true), signedIn: () => !!A, user: () => A && A.user,
    async wipeCloud() { const t = await token(); if (!t) return true; const r = await req(`${rest}/pause_user_data?user_id=eq.${A.user.id}`, { method: "DELETE", token: t }); return r.ok; },
  };
}
