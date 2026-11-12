// Reminders via Web Push: timer finished, wind-down before bedtime, optional daily check-in.
// Works with the app closed (Android, desktop, and iPhone once installed to the home screen).
// Off until the student turns it on. Only the push address, time zone and reminder choices are sent.

const TIMER_TEXT = {
  "pomo:work": ["🍅 Focus round done!", "Nice work. Open سكون to start your break.", "/#/pomo"],
  "pomo:short": ["☕ Break's over", "Ready for the next round?", "/#/pomo"],
  "pomo:long": ["🌴 Long break's over", "Session complete. Well done!", "/#/pomo"],
  focus: ["🎯 Focus session complete", "Well done. Take a break that isn't a feed.", "/#/focus"],
  scroll: ["📱 Ten minutes are up", "Stop, or choose 5 more?", "/#/scroll"],
  play: ["🎮 Time's up", "You set this limit yourself. Nice job noticing.", "/#/play"],
};
const b64 = s => { const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map(ch => ch.charCodeAt(0))); };

export function initReminders(c) {
  const S = () => c.S;
  let lastSent = "", syncT = null, busy = false, localShown = 0;
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const R = () => S().rem;

  function status() {
    if (!supported()) return ios() && !standalone() ? "install" : "unsupported";
    if (Notification.permission === "denied") return "blocked";
    return R().on ? "on" : "off";
  }
  const timersNow = () => {
    const t = S().timer; if (!t || !t.endAt || !R().timer) return [];
    const k = t.kind === "pomo" ? `pomo:${t.phase}` : t.kind, txt = TIMER_TEXT[k]; if (!txt) return [];
    return [{ at: t.endAt, title: txt[0], body: txt[1], url: txt[2], tag: "timer" }];
  };
  const prefs = () => ({ timer: R().timer, wind: R().wind, daily: R().daily || "", bedtime: S().settings.bedtime });
  async function post(body) {
    try { const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; }
    catch { return { ok: false, status: 0, body: {} }; }
  }
  async function getSub() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }

  // Send the current timer + choices to the server, only when something actually changed.
  function sync() {
    if (!R().on || !supported()) return;
    clearTimeout(syncT);
    syncT = setTimeout(async () => {
      const payload = JSON.stringify({ p: prefs(), t: timersNow(), z: tz() });
      if (payload === lastSent) return;
      const sub = await getSub().catch(() => null);
      if (!sub) { R().on = false; c.saveLocal(); return c.render(); }
      const j = sub.toJSON(), r = await post({ action: "update", endpoint: j.endpoint, auth: j.keys.auth, tz: tz(), prefs: prefs(), timers: timersNow() });
      if (r.status === 404) { const s2 = await post({ action: "subscribe", sub: j, tz: tz(), prefs: prefs(), timers: timersNow() }); if (s2.ok) lastSent = payload; }
      else if (r.ok) lastSent = payload;
    }, 600);
  }

  async function enable() {
    if (busy) return; busy = true;
    try {
      const st = status();
      if (st === "install") { c.toast("On iPhone, install سكون to your home screen first, then turn reminders on."); return c.go("#/install"); }
      if (st === "unsupported") return c.toast("This browser can't send notifications. Try Chrome, Edge or Safari.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { c.render(); return c.toast(perm === "denied" ? "Notifications are blocked. Allow them in your browser's site settings." : "No problem. You can turn reminders on later."); }
      const k = await fetch("/api/push").then(r => r.json()).catch(() => ({}));
      if (!k.publicKey || !k.ready) return c.toast("Reminders aren't set up on the server yet.");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.publicKey) });
      const r = await post({ action: "subscribe", sub: sub.toJSON(), tz: tz(), prefs: prefs(), timers: timersNow() });
      if (!r.ok) return c.toast("Couldn't turn reminders on. Check your connection and try again.");
      R().on = true; lastSent = JSON.stringify({ p: prefs(), t: timersNow(), z: tz() }); c.save(); c.render();
      c.toast("Reminders on 🔔");
    } catch (e) { c.toast("Couldn't turn reminders on on this device."); }
    finally { busy = false; }
  }
  async function disable() {
    const sub = await getSub().catch(() => null);
    if (sub) { const j = sub.toJSON(); await post({ action: "unsubscribe", endpoint: j.endpoint, auth: j.keys.auth }); await sub.unsubscribe().catch(() => {}); }
    R().on = false; lastSent = ""; c.save(); c.render(); c.toast("Reminders off");
  }
  async function test() {
    const sub = await getSub().catch(() => null); if (!sub) return c.toast("Turn reminders on first.");
    const j = sub.toJSON(), r = await post({ action: "test", endpoint: j.endpoint, auth: j.keys.auth });
    c.toast(r.ok && r.body.ok ? "Sent! It should appear in a few seconds 🔔" : "Couldn't send a test right now.");
  }

  // While the page is still alive in the background, show the timer notification right away.
  // The server sends the same one with the same tag, so you never get two.
  c.tickHooks.push(() => {
    const t = S().timer;
    if (!R().on || !R().timer || !t || !t.endAt || t.endAt > Date.now() || localShown === t.endAt || !document.hidden) return;
    localShown = t.endAt; const n = timersNow()[0] || (() => { const k = t.kind === "pomo" ? `pomo:${t.phase}` : t.kind, x = TIMER_TEXT[k]; return x && { title: x[0], body: x[1], url: x[2] }; })();
    if (n && Notification.permission === "granted") navigator.serviceWorker.ready.then(reg => reg.showNotification(n.title, { body: n.body, tag: "timer", icon: "icon-192.png", badge: "icon-192.png", data: { url: n.url } })).catch(() => {});
  });

  function settingsGroup(row, group, sw) {
    const st = status(), r = R();
    const note = { install: "On iPhone, reminders work after you add سكون to your home screen (iOS 16.4+).", unsupported: "This browser can't send notifications.", blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.", off: "Get a nudge when a timer ends, even if سكون is closed.", on: "سكون can nudge you even when it's closed." }[st];
    const master = st === "on" ? `<label class="sw"><input type="checkbox" checked data-remact="off"><i></i></label>`
      : st === "off" ? `<label class="sw"><input type="checkbox" data-remact="on"><i></i></label>`
      : st === "install" ? `<a class="btn ghost smallbtn" href="#/install">Install</a>` : "";
    const rows = [row("🔔", "Reminders", note, "", master)];
    if (st === "on") rows.push(
      row("⏱️", "When a timer ends", "Pomodoro, focus, scroll and play timers", "", `<label class="sw"><input type="checkbox" data-rem="timer" ${r.timer ? "checked" : ""}><i></i></label>`),
      row("🌙", "Wind-down reminder", `30 min before bedtime (${S().settings.bedtime})`, "", `<label class="sw"><input type="checkbox" data-rem="wind" ${r.wind ? "checked" : ""}><i></i></label>`),
      row("☀️", "Daily check-in", r.daily ? `Every day at ${r.daily}` : "Off", "", `<input class="ssel" type="time" value="${r.daily || ""}" data-rem="daily" aria-label="Daily check-in time">`),
      row("🧪", "Send a test", "Check that notifications reach this device", "", '<button class="ghost smallbtn" data-act="remTest">Test</button>'));
    return group("Reminders", rows, st === "on" ? "Reminders are sent to this device only. Turn them off any time." : "");
  }
  // Small nudge shown on timer setup screens
  const nudge = () => (status() === "off" ? `<button class="card btn block feature" data-act="remOn"><span class="fi f-amber">🔔</span><span style="flex:1"><b>Get a notification when it ends</b><br><span class="mute">Works even if you close سكون</span></span></button>` : "");

  document.addEventListener("change", e => {
    const d = e.target.dataset; if (!d) return;
    if (d.remact) { e.target.checked = d.remact === "off"; return d.remact === "on" ? enable() : disable(); }
    if (d.rem) { R()[d.rem] = d.rem === "daily" ? e.target.value : e.target.checked; c.save(); c.render(); }
  });
  return { actions: { remOn: enable, remOff: disable, remTest: test }, sync, settingsGroup, nudge, status };
}
