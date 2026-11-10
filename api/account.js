// POST /api/account  (Authorization: Bearer <user access token>)  -> deletes the caller's own account.
// The user's backed-up data row is removed automatically (on delete cascade).
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
  const send = (code, o) => { res.statusCode = code; res.end(JSON.stringify(o)); };
  if (req.method !== "POST") return send(405, { error: "method" });
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(503, { error: "not_configured" });
  const m = /^Bearer\s+([\w.-]+)$/.exec(req.headers.authorization || "");
  if (!m) return send(401, { error: "no_token" });
  const admin = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${m[1]}` } });
    if (!u.ok) return send(401, { error: "bad_token" });
    const { id } = await u.json();
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) return send(401, { error: "bad_token" });
    const d = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
    if (!d.ok) { console.error("account delete failed", d.status); return send(502, { error: "delete_failed" }); }
    return send(200, { ok: true });
  } catch (e) { console.error("account error", e.message); return send(500, { error: "server" }); }
};
