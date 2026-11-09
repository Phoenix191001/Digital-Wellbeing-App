// Minimal PostgREST stand-in for tests: maps the few /rest/v1 calls the adapter makes onto a real Postgres (via psql).
// Usage: PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres node tests/pgshim.js   (listens on :8130)
const http = require("http"), { execFileSync } = require("child_process");
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const sql = s => execFileSync("psql", ["-tA", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", s], { encoding: "utf8" }).trim();
http.createServer((req, res) => {
  let d = ""; req.on("data", c => d += c); req.on("end", () => {
    try {
      if (req.headers.apikey !== "test-service-key") { res.statusCode = 401; return res.end("{}"); }
      const u = new URL(req.url, "http://x"), body = d ? JSON.parse(d) : {}, out = (c, o) => { res.statusCode = c; res.setHeader("Content-Type", "application/json"); res.end(o === undefined ? "" : JSON.stringify(o)); };
      if (u.pathname.startsWith("/rest/v1/rpc/")) {
        const fn = u.pathname.split("/").pop(), a = fn === "pause_incr" ? `${q(body.k)}, ${+body.ttl}` : `${q(body.k)}, ${q(body.v)}`;
        const r = sql(`select ${fn}(${a})`); return out(200, fn === "pause_incr" ? +r : null);
      }
      const key = (u.searchParams.get("key") || "").replace(/^eq\./, "");
      if (req.method === "GET") { const r = sql(`select coalesce(json_agg(t),'[]') from (select value, expires_at from pause_kv where key=${q(key)}) t`); return out(200, JSON.parse(r)); }
      if (req.method === "POST") { sql(`insert into pause_kv(key,value,expires_at) values (${q(body.key)},${q(body.value)},null) on conflict (key) do update set value=excluded.value, expires_at=null`); return out(201); }
      if (req.method === "DELETE") { sql(`delete from pause_kv where key=${q(key)}`); return out(204); }
      out(400, {});
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ message: e.message })); }
  });
}).listen(8130);
