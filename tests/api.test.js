// Run: node --test tests/
process.env.PAUSE_MEMORY_STORE = "1"; process.env.MOD_PASSCODE = "test-pass";
const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("crypto");
const handler = require("../api/community.js");
const call = (body, method = "POST") => new Promise(r => {
  const res = { headers: {}, setHeader() {}, end(s) { r({ status: this.statusCode, body: JSON.parse(s) }); } };
  handler({ method, body }, res);
});
const tok = () => crypto.randomBytes(16).toString("hex");
async function mk(space) { const token = tok(), { body } = await call({ action: "roll" }); const j = await call({ action: "join", token, space, name: body.name }); assert.equal(j.status, 200); return token; }
const feed = async (token, circle = "study") => (await call({ action: "feed", token, circle })).body.posts;

test("join, circle, post, reply, react", async () => {
  const a = await mk("female"), b = await mk("female");
  assert.deepEqual((await call({ action: "circle", token: a, circle: "study", op: "join" })).body.circles, ["study"]);
  const p = await call({ action: "post", token: a, circle: "study", text: "Anyone else stressed about midterms?" });
  assert.equal(p.body.status, "ok");
  assert.equal((await call({ action: "reply", token: b, postId: p.body.id, text: "Same here, you're not alone" })).body.status, "ok");
  assert.equal((await call({ action: "react", token: b, postId: p.body.id, type: "relate" })).body.on, true);
  const f = await feed(b); assert.equal(f.length, 1); assert.equal(f[0].replies.length, 1); assert.equal(f[0].relate, true);
  assert.equal("relateCount" in f[0], false); // no counts
});

test("spaces are isolated, even with crafted API calls", async () => {
  const f = await mk("female"), m = await mk("male");
  const p = (await call({ action: "post", token: f, circle: "gaming", text: "female space post" })).body;
  assert.equal((await feed(m, "gaming")).length, 0);
  for (const act of [{ action: "reply", text: "hi" }, { action: "react", type: "relate" }, { action: "report" }])
    assert.equal((await call({ ...act, token: m, postId: p.id })).status, 404);
  // sending a different space does not change it; join with existing token keeps original space
  const j = await call({ action: "join", token: m, space: "female", name: "Kind Otter" });
  assert.equal(j.body.user.space, "male");
  assert.equal((await feed(m, "gaming")).length, 0);
  // extra "space" param on feed is ignored
  assert.equal((await call({ action: "feed", token: m, circle: "gaming", space: "female" })).body.posts.length, 0);
});

test("3 different reports hide; moderator restores", async () => {
  const [a, r1, r2, r3, r4] = await Promise.all([1, 2, 3, 4, 5].map(() => mk("male")));
  const p = (await call({ action: "post", token: a, circle: "football", text: "rude thing" })).body;
  await call({ action: "report", token: r1, postId: p.id }); await call({ action: "report", token: r1, postId: p.id });
  await call({ action: "report", token: r2, postId: p.id });
  assert.equal((await feed(r4, "football")).length, 1, "2 distinct reports: still visible to others");
  await call({ action: "report", token: r3, postId: p.id });
  assert.equal((await feed(r4, "football")).length, 0, "hidden after 3");
  assert.equal((await feed(a, "football")).length, 0);
  assert.equal((await call({ action: "modList", pass: "nope" })).status, 401);
  const list = (await call({ action: "modList", pass: "test-pass" })).body.items;
  const it = list.find(x => x.postId === p.id); assert.ok(it && it.hidden && it.reports === 3);
  await call({ action: "modRestore", pass: "test-pass", postId: p.id });
  assert.equal((await feed(r4, "football")).length, 1);
  await call({ action: "modHide", pass: "test-pass", postId: p.id });
  assert.equal((await feed(r4, "football")).length, 0);
});

test("self-harm text is never published", async () => {
  const a = await mk("female"), b = await mk("female");
  for (const t of ["I want to die", "thinking about suicide", "I might kill myself", "I want to end it all", "i keep wanting to hurt myself", "don’t want to live"]) {
    assert.equal((await call({ action: "post", token: a, circle: "talk", text: t })).body.status, "selfharm", t);
  }
  assert.equal((await feed(b, "talk")).length, 0);
  const ok = (await call({ action: "post", token: a, circle: "talk", text: "Feeling lonely tonight" })).body;
  assert.equal((await call({ action: "reply", token: b, postId: ok.id, text: "I want to die of embarrassment" })).body.status, "selfharm");
});

test("links, numbers, emails, handles are blocked; normal text passes", async () => {
  const a = await mk("male");
  for (const t of ["see https://x.com", "visit www.site.pk", "wa.me/92300", "mail me a@b.com", "my gmail dot com", "call 0300 1234567", "+92 300-1234567", "dm @someone", "go to insta dot com"])
    { const r = await call({ action: "post", token: a, circle: "coding", text: t }); assert.equal(r.body.status, "blocked", t); }
  for (const t of ["I scored 85 on my exam, 3rd attempt", "Anyone learning Python? e.g. loops"])
    assert.equal((await call({ action: "post", token: a, circle: "coding", text: t })).body.status, "ok", t);
  assert.equal((await call({ action: "post", token: a, circle: "coding", text: "x".repeat(281) })).status, 400);
  const pr = (await call({ action: "post", token: a, circle: "coding", text: "fine post" })).body;
  assert.equal((await call({ action: "reply", token: a, postId: pr.id, text: "call 03001234567" })).body.status, "blocked");
});

test("rate limit: 5 posts per hour", async () => {
  const a = await mk("female");
  for (let i = 0; i < 5; i++) assert.equal((await call({ action: "post", token: a, circle: "art", text: "post " + i })).body.status, "ok");
  assert.equal((await call({ action: "post", token: a, circle: "art", text: "post 6" })).status, 429);
});

test("leave removes user, posts, replies, reactions", async () => {
  const a = await mk("female"), b = await mk("female");
  const pa = (await call({ action: "post", token: a, circle: "reading", text: "my book post" })).body;
  const pb = (await call({ action: "post", token: b, circle: "reading", text: "other post" })).body;
  await call({ action: "reply", token: a, postId: pb.id, text: "my reply" }); await call({ action: "react", token: a, postId: pb.id, type: "thanks" });
  assert.equal((await feed(b, "reading")).find(x => x.id === pb.id).replies.length, 1);
  assert.equal((await call({ action: "leave", token: a })).status, 200);
  const f = await feed(b, "reading"); assert.equal(f.length, 1); assert.equal(f[0].replies.length, 0); assert.equal(f[0].thanks, false); assert.equal(f[0].someoneRelates || f[0].someoneThanks, false);
  assert.equal((await call({ action: "me", token: a })).status, 401);
  assert.equal((await call({ action: "post", token: a, circle: "reading", text: "ghost" })).status, 401);
  const { memoryStore } = require("../api/_lib.js");
  assert.equal(await memoryStore.get("post:" + pa.id), null);
});

test("misc: not configured, bad input, mod disabled without passcode", async () => {
  assert.equal((await call({ action: "feed" })).status, 401);
  assert.equal((await call({ action: "x", token: await mk("male") })).status, 400);
  assert.equal((await call({}, "GET")).status, 405);
  const saved = process.env.MOD_PASSCODE; delete process.env.MOD_PASSCODE;
  assert.equal((await call({ action: "modList", pass: "x" })).status, 503); process.env.MOD_PASSCODE = saved;
  delete process.env.PAUSE_MEMORY_STORE;
  assert.equal((await call({ action: "status" })).body.configured, false);
  assert.equal((await call({ action: "feed", token: tok() })).status, 503);
  process.env.PAUSE_MEMORY_STORE = "1";
});
