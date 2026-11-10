// node --test tests/account.test.mjs : delete-account endpoint (fetch stubbed) + sync merge rules
import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
import { mergeData } from "../auth.js";
const require = createRequire(import.meta.url), handler = require("../api/account.js");
const call = (headers = {}, method = "POST") => new Promise(r => { const res = { setHeader() {}, end(s) { r({ status: this.statusCode, body: JSON.parse(s) }); } }; handler({ method, headers }, res); });

test("delete account: verifies token, deletes only the caller", async () => {
  process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  const calls = []; const id = "11111111-1111-1111-1111-111111111111";
  global.fetch = async (url, o = {}) => { calls.push([url, o.method || "GET", o.headers]); if (url.endsWith("/auth/v1/user")) return { ok: o.headers.Authorization === "Bearer good", json: async () => ({ id }) }; return { ok: true, status: 200 }; };
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ authorization: "Bearer bad" })).status, 401);
  const r = await call({ authorization: "Bearer good" }); assert.equal(r.status, 200);
  const del = calls.find(c => c[1] === "DELETE"); assert.equal(del[0], `https://x.supabase.co/auth/v1/admin/users/${id}`); assert.equal(del[2].apikey, "sb_secret_test");
  assert.equal((await call({}, "GET")).status, 405);
  delete process.env.SUPABASE_URL; assert.equal((await call({ authorization: "Bearer good" })).status, 503);
});

test("merge: unions records, newer edit wins, deletions stick, device settings stay local", () => {
  const local = { onboarded: false, settings: { dark: true }, focus: [{ ts: 1, min: 25 }], tasks: [{ id: "a", text: "A", u: 5, done: true }], goals: [{ id: "g", title: "Old", u: 1 }], decks: [{ id: "d", name: "D", u: 1, cards: [{ id: "c1", f: "q", b: "a", box: 3, u: 9 }] }], tomb: ["n100"], notes: [], usage: { "2026-11-10": { apps: { x: 15 }, u: 1 } }, mood: { "2026-11-10": "🙂" }, pauseTime: { d: 50 }, profile: { name: "" }, timer: { kind: "focus" } };
  const remote = { onboarded: true, settings: { dark: false }, focus: [{ ts: 1, min: 25 }, { ts: 2, min: 50 }], tasks: [{ id: "a", text: "A", u: 3, done: false }, { id: "b", text: "B", u: 4, del: true }], goals: [{ id: "g", title: "New", u: 7 }], decks: [{ id: "d", name: "D", u: 2, cards: [{ id: "c1", f: "q", b: "a", box: 0, u: 2 }, { id: "c2", f: "q2", b: "a2", u: 2 }] }], notes: [{ ts: 100, text: "deleted on other device" }], usage: { "2026-11-10": { apps: { x: 60 }, u: 9 } }, mood: { "2026-11-09": "😄" }, pauseTime: { d: 80 }, profile: { name: "Saad" } };
  const m = mergeData(local, remote);
  assert.equal(m.focus.length, 2); assert.equal(m.tasks.find(t => t.id === "a").done, true); assert.equal(m.tasks.find(t => t.id === "b").del, true);
  assert.equal(m.goals[0].title, "New"); assert.equal(m.decks[0].cards.length, 2); assert.equal(m.decks[0].cards.find(c => c.id === "c1").box, 3);
  assert.equal(m.notes.length, 0, "tombstoned note not resurrected"); assert.equal(m.usage["2026-11-10"].apps.x, 60); assert.deepEqual(Object.keys(m.mood).sort(), ["2026-11-09", "2026-11-10"]);
  assert.equal(m.pauseTime.d, 80); assert.equal(m.profile.name, "Saad"); assert.equal(m.settings.dark, true); assert.equal(m.onboarded, true); assert.deepEqual(m.timer, { kind: "focus" });
});
