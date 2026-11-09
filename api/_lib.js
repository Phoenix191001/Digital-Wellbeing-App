// Shared logic for the "Find your people" community. No dependencies.
const crypto = require("crypto");

const CIRCLES = ["study", "coding", "gaming", "football", "reading", "art", "faith", "talk"];
const SPACES = ["female", "male"];
const ADJ = ["Quiet", "Gentle", "Calm", "Brave", "Kind", "Sunny", "Steady", "Curious", "Warm", "Patient", "Bright", "Mellow", "Honest", "Cozy", "Thoughtful", "Hopeful", "Friendly", "Silent", "Lucky", "Swift", "Humble", "Cheerful", "Wise", "Peaceful"];
const ANIMALS = ["Falcon", "Otter", "Panda", "Owl", "Deer", "Heron", "Fox", "Koala", "Sparrow", "Dolphin", "Lynx", "Robin", "Hare", "Seal", "Finch", "Turtle", "Eagle", "Swan", "Camel", "Gecko", "Pigeon", "Pony", "Wolf", "Bee"];
const rollName = () => `${ADJ[crypto.randomInt(ADJ.length)]} ${ANIMALS[crypto.randomInt(ANIMALS.length)]}`;
const validName = n => typeof n === "string" && (() => { const [a, b, ...r] = n.split(" "); return !r.length && ADJ.includes(a) && ANIMALS.includes(b); })();

/* ---------- content filters ---------- */
const norm = t => t.toLowerCase().replace(/[‘’`]/g, "'").replace(/[​-‏⁠﻿]/g, "");
const SELF_HARM = [
  /\bsuicid(e|al)\b/, /\bkill(ing)?\s+my\s*self\b/, /\bend\s+(it\s+all|my\s+life)\b/, /\b(hurt|harm|cut)(ting)?\s+my\s*self\b/,
  /\bself[\s-]?harm/, /\b(want|wanna|going)\s+to\s+die\b/, /\bwanna\s+die\b/, /\bdon'?t\s+want\s+to\s+(live|be\s+alive)\b/,
  /\bno\s+reason\s+to\s+live\b/, /\bbetter\s+off\s+dead\b/, /\btake\s+my\s+own\s+life\b/,
  /\bkhud\s*kushi\b/, /\bmarna\s+chah(ta|ti)\b/, /\bjaan\s+de\s+(dun|doon)\b/,
];
const hasSelfHarm = t => SELF_HARM.some(r => r.test(norm(t)));
const LINK = /(https?:\/\/|www\.|\bwa\.me\b|\bt\.me\b|\bbit\.ly\b|\b[a-z0-9-]+\.(com|net|org|io|pk|co|me|app|ly|gg|tv|xyz|info|edu|link|ai|dev)\b|\bdot\s*(com|net|org|pk)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+|\b(gmail|yahoo|hotmail|outlook|icloud)\b(\s*(dot|\.)\s*com)?/i;
const HANDLE = /(^|\s)@\w{2,}/;
const PHONE = /(?:\+?\d[\s().\-]*){7,}/;
function blockedReason(t) {
  if (EMAIL.test(t)) return "email";
  if (LINK.test(t)) return "link";
  if (PHONE.test(t)) return "phone";
  if (HANDLE.test(t)) return "handle";
  return null;
}
function cleanText(t) {
  if (typeof t !== "string") return null;
  const s = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").trim();
  const n = [...s].length;
  return n >= 1 && n <= 280 ? s : null;
}

/* ---------- storage: Upstash/Vercel KV over REST, or memory (tests only) ---------- */
const mem = { kv: new Map() };
const memoryStore = {
  async get(k) { return mem.kv.has(k) ? mem.kv.get(k) : null; },
  async set(k, v) { mem.kv.set(k, String(v)); },
  async del(k) { mem.kv.delete(k); },
  async lpush(k, v) { const a = mem.kv.get(k) || []; a.unshift(v); mem.kv.set(k, a); },
  async lrange(k, s, e) { const a = mem.kv.get(k) || []; return a.slice(s, e === -1 ? undefined : e + 1); },
  async lrem(k, v) { mem.kv.set(k, (mem.kv.get(k) || []).filter(x => x !== v)); },
  async sadd(k, v) { const s = mem.kv.get(k) || new Set(); s.add(v); mem.kv.set(k, s); },
  async srem(k, v) { const s = mem.kv.get(k); if (s) s.delete(v); },
  async smembers(k) { return [...(mem.kv.get(k) || [])]; },
  async incr(k) { const n = (+mem.kv.get(k) || 0) + 1; mem.kv.set(k, String(n)); return n; },
  async expire() {},
};
function upstash(url, token) {
  const cmd = async (...a) => {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(a) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
  };
  return {
    get: k => cmd("GET", k), set: (k, v) => cmd("SET", k, String(v)), del: k => cmd("DEL", k),
    lpush: (k, v) => cmd("LPUSH", k, v), lrange: (k, s, e) => cmd("LRANGE", k, s, e), lrem: (k, v) => cmd("LREM", k, 0, v),
    sadd: (k, v) => cmd("SADD", k, v), srem: (k, v) => cmd("SREM", k, v), smembers: k => cmd("SMEMBERS", k),
    incr: k => cmd("INCR", k), expire: (k, s) => cmd("EXPIRE", k, s),
  };
}

// Supabase (PostgREST) adapter. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side only) and supabase.sql applied.
function supabase(base, key) {
  // New-style keys (sb_secret_...) go in `apikey` only; legacy JWT keys (eyJ...) also go in Authorization.
  const H = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" };
  const root = base.replace(/\/+$/, "") + "/rest/v1";
  const q = k => encodeURIComponent(k);
  const rpc = async (fn, args) => {
    const r = await fetch(`${root}/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`supabase rpc ${fn} ${r.status}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const get = async k => {
    const r = await fetch(`${root}/pause_kv?key=eq.${q(k)}&select=value,expires_at`, { headers: H });
    if (!r.ok) throw new Error("supabase get " + r.status);
    const [row] = await r.json();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    return row.value;
  };
  const arr = async k => { const v = await get(k); return v ? JSON.parse(v) : []; };
  return {
    get,
    async set(k, v) {
      const r = await fetch(`${root}/pause_kv?on_conflict=key`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: k, value: String(v), expires_at: null }) });
      if (!r.ok) throw new Error("supabase set " + r.status);
    },
    async del(k) { const r = await fetch(`${root}/pause_kv?key=eq.${q(k)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }); if (!r.ok) throw new Error("supabase del " + r.status); },
    lpush: (k, v) => rpc("pause_lpush", { k, v }),
    lrem: (k, v) => rpc("pause_lrem", { k, v }),
    sadd: (k, v) => rpc("pause_sadd", { k, v }),
    srem: (k, v) => rpc("pause_lrem", { k, v }),
    async lrange(k, s, e) { const a = await arr(k); return a.slice(s, e === -1 ? undefined : e + 1); },
    smembers: arr,
    incr: k => rpc("pause_incr", { k, ttl: 3600 }),
    async expire() {}, // the window is set atomically inside pause_incr
  };
}
function getStore() {
  if (process.env.PAUSE_MEMORY_STORE === "1") return memoryStore;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? upstash(url, token) : null;
}
module.exports = { CIRCLES, SPACES, rollName, validName, hasSelfHarm, blockedReason, cleanText, getStore, memoryStore, crypto };
