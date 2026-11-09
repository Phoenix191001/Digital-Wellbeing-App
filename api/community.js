// POST /api/community  { action, token?, ... }  -> JSON
// Safety rule: a user's SPACE is read from the server-side user record, never from the request.
const L = require("./_lib");
const { crypto } = L;
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const rid = () => crypto.randomBytes(8).toString("hex");
const J = (v) => JSON.stringify(v);
const P = s => (s ? JSON.parse(s) : null);
const fail = (code, error) => { const e = new Error(error); e.code = code; throw e; };

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  const send = (code, obj) => { res.statusCode = code; res.end(J(obj)); };
  // GET = harmless health check (booleans only): is a database connected and is the schema in place?
  if (req.method === "GET") return send(200, await health());
  if (req.method !== "POST") return send(405, { error: "method" });
  let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return send(400, { error: "bad_request" });
  const store = L.getStore();
  if (b.action === "status") { const h = await health(); return send(200, { configured: h.ready, modConfigured: h.modConfigured }); }
  if (!store) return send(503, { error: "not_configured" });
  try { return send(200, await handle(store, b, req)); }
  catch (e) { if (e.code) return send(e.code, { error: e.message }); console.error("community error", e.message); return send(500, { error: "server" }); }
};

// "ready" only if a store is configured AND reachable AND the schema exists, otherwise the app uses the safe fallback.
async function health() {
  const store = L.getStore(), out = { store: !!store, ready: false, modConfigured: !!process.env.MOD_PASSCODE };
  if (store) { try { await store.get("health:ping"); out.ready = true; } catch (e) { out.error = "db_unreachable_or_schema_missing"; } }
  return out;
}

async function user(store, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{32,64}$/.test(token)) fail(401, "no_user");
  const h = sha(token), u = P(await store.get("user:" + h));
  if (!u) fail(401, "no_user");
  return { ...u, h };
}
const loadPost = async (store, u, id) => {
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id)) fail(404, "not_found");
  const p = P(await store.get("post:" + id));
  if (!p || p.space !== u.space) fail(404, "not_found"); // other space: indistinguishable from missing
  return p;
};
const savePost = (store, p) => store.set("post:" + p.id, J(p));
const touch = (store, h, id) => store.sadd("touch:" + h, id);
async function limit(store, key, max) {
  const n = await store.incr(key); if (n === 1) await store.expire(key, 3600);
  if (n > max) fail(429, "rate");
}
function checkText(raw) {
  const text = L.cleanText(raw); if (!text) fail(400, "bad_text");
  if (L.hasSelfHarm(text)) return { selfharm: true };
  const why = L.blockedReason(text); if (why) return { blocked: why };
  return { text };
}
const modOk = b => {
  const pass = process.env.MOD_PASSCODE; if (!pass) fail(503, "mod_disabled");
  const a = Buffer.from(sha(String(b.pass || ""))), c = Buffer.from(sha(pass));
  if (!crypto.timingSafeEqual(a, c)) fail(401, "bad_pass");
};

async function handle(store, b) {
  switch (b.action) {
    case "roll": return { name: L.rollName() };

    case "join": {
      if (typeof b.token !== "string" || !/^[a-f0-9]{32,64}$/.test(b.token)) fail(400, "bad_token");
      const h = sha(b.token), ex = P(await store.get("user:" + h));
      if (ex) return { user: { name: ex.name, space: ex.space, circles: ex.circles } }; // space can never be changed here
      if (!L.SPACES.includes(b.space) || !L.validName(b.name)) fail(400, "bad_join");
      const u = { name: b.name, space: b.space, circles: [] };
      await store.set("user:" + h, J(u));
      return { user: u };
    }
    case "me": { const u = await user(store, b.token); return { user: { name: u.name, space: u.space, circles: u.circles } }; }

    case "circle": {
      const u = await user(store, b.token);
      if (!L.CIRCLES.includes(b.circle)) fail(400, "bad_circle");
      const set = new Set(u.circles); b.op === "leave" ? set.delete(b.circle) : set.add(b.circle);
      const nu = { name: u.name, space: u.space, circles: [...set] };
      await store.set("user:" + u.h, J(nu));
      return { circles: nu.circles };
    }

    case "feed": {
      const u = await user(store, b.token);
      if (!L.CIRCLES.includes(b.circle)) fail(400, "bad_circle");
      const ids = await store.lrange(`feed:${u.space}:${b.circle}`, 0, 49);
      const posts = (await Promise.all(ids.map(id => store.get("post:" + id)))).map(P).filter(Boolean);
      const vis = x => !x.hidden && !(x.reports || []).includes(u.h);
      return {
        posts: posts.filter(p => p.space === u.space && p.circle === b.circle && vis(p)).map(p => ({
          id: p.id, name: p.name, text: p.text, ts: p.ts, mine: p.uid === u.h,
          relate: p.relate.includes(u.h), thanks: p.thanks.includes(u.h),
          someoneRelates: p.relate.length > 0, someoneThanks: p.thanks.length > 0,
          replies: p.replies.filter(vis).map(r => ({ id: r.id, name: r.name, text: r.text, ts: r.ts, mine: r.uid === u.h })),
        })),
      };
    }

    case "post": {
      const u = await user(store, b.token);
      if (!L.CIRCLES.includes(b.circle)) fail(400, "bad_circle");
      const c = checkText(b.text); if (c.selfharm) return { status: "selfharm" }; // never stored or shown
      if (c.blocked) return { status: "blocked", reason: c.blocked };
      await limit(store, "rl:post:" + u.h, 5);
      const p = { id: rid(), space: u.space, circle: b.circle, uid: u.h, name: u.name, text: c.text, ts: Date.now(), reports: [], hidden: false, relate: [], thanks: [], replies: [] };
      await savePost(store, p); await store.lpush(`feed:${u.space}:${b.circle}`, p.id); await touch(store, u.h, p.id);
      return { status: "ok", id: p.id };
    }

    case "reply": {
      const u = await user(store, b.token), p = await loadPost(store, u, b.postId);
      const c = checkText(b.text); if (c.selfharm) return { status: "selfharm" };
      if (c.blocked) return { status: "blocked", reason: c.blocked };
      await limit(store, "rl:reply:" + u.h, 20);
      p.replies.push({ id: rid(), uid: u.h, name: u.name, text: c.text, ts: Date.now(), reports: [], hidden: false });
      await savePost(store, p); await touch(store, u.h, p.id);
      return { status: "ok" };
    }

    case "react": {
      const u = await user(store, b.token), p = await loadPost(store, u, b.postId);
      if (!["relate", "thanks"].includes(b.type)) fail(400, "bad_type");
      const a = p[b.type], i = a.indexOf(u.h); i >= 0 ? a.splice(i, 1) : a.push(u.h);
      await savePost(store, p); await touch(store, u.h, p.id);
      return { on: i < 0 };
    }

    case "report": {
      const u = await user(store, b.token), p = await loadPost(store, u, b.postId);
      const item = b.replyId ? p.replies.find(r => r.id === b.replyId) : p;
      if (!item) fail(404, "not_found");
      if (item.uid === u.h) fail(400, "own_item");
      if (!item.reports.includes(u.h)) item.reports.push(u.h);
      if (item.reports.length >= 3) item.hidden = true; // 3 different people
      await savePost(store, p); await store.sadd("reported", p.id); await touch(store, u.h, p.id);
      return { ok: true };
    }

    case "leave": {
      const u = await user(store, b.token);
      for (const id of await store.smembers("touch:" + u.h)) {
        const p = P(await store.get("post:" + id)); if (!p) continue;
        if (p.uid === u.h) { await store.del("post:" + id); await store.lrem(`feed:${p.space}:${p.circle}`, id); await store.srem("reported", id); continue; }
        p.replies = p.replies.filter(r => r.uid !== u.h);
        p.replies.forEach(r => { r.reports = r.reports.filter(x => x !== u.h); });
        p.relate = p.relate.filter(x => x !== u.h); p.thanks = p.thanks.filter(x => x !== u.h); p.reports = p.reports.filter(x => x !== u.h);
        await savePost(store, p);
      }
      await Promise.all([store.del("user:" + u.h), store.del("touch:" + u.h), store.del("rl:post:" + u.h), store.del("rl:reply:" + u.h)]);
      return { ok: true };
    }

    /* ---- moderator (passcode in MOD_PASSCODE env var) ---- */
    case "modList": {
      await modGate(store, b);
      const items = [], ids = await store.smembers("reported");
      for (const id of ids) {
        const p = P(await store.get("post:" + id)); if (!p) { await store.srem("reported", id); continue; }
        const row = (x, replyId) => ({ postId: p.id, replyId: replyId || null, space: p.space, circle: p.circle, name: x.name, text: x.text, ts: x.ts, reports: x.reports.length, hidden: x.hidden });
        const before = items.length;
        if (p.reports.length || p.hidden) items.push(row(p));
        p.replies.forEach(r => { if (r.reports.length || r.hidden) items.push(row(r, r.id)); });
        if (items.length === before) await store.srem("reported", id);
      }
      return { items };
    }
    case "modHide": case "modRestore": {
      await modGate(store, b);
      const p = P(await store.get("post:" + b.postId)); if (!p) fail(404, "not_found");
      const item = b.replyId ? p.replies.find(r => r.id === b.replyId) : p; if (!item) fail(404, "not_found");
      if (b.action === "modHide") item.hidden = true; else { item.hidden = false; item.reports = []; }
      await savePost(store, p); await store.sadd("reported", p.id);
      return { ok: true };
    }
    default: fail(400, "bad_action");
  }
}
// Brute-force guard: 20 wrong passcodes per hour (global) locks the page until the window passes.
async function modGate(store, b) {
  if (!process.env.MOD_PASSCODE) fail(503, "mod_disabled");
  const n = +(await store.get("modfail")) || 0; if (n >= 20) fail(429, "locked");
  try { modOk(b); } catch (e) { if (e.code === 401) { const c = await store.incr("modfail"); if (c === 1) await store.expire("modfail", 3600); } throw e; }
}
