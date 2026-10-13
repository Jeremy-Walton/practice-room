// Practice Room: serves the app from ./public and a tiny sync API backed by D1.
//
//   GET  /api/sync?since=<serverMs>  -> { now, docs: [{id, body, updated_at}] } changed since `since`
//   POST /api/docs   [{id, body, updated_at}, ...]  -> { now, saved }
//   GET  /api/ping                                 -> { ok: true } (checks the sync key)
//
// Every /api call needs:  Authorization: Bearer <SYNC_KEY>
// Set the key once with:  npx wrangler secret put SYNC_KEY

const MAX_DOC_BYTES = 256 * 1024;
const ID_RE = /^(progress|settings)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (!env.SYNC_KEY) return json({ error: "Sync isn't configured yet. Set the SYNC_KEY secret." }, 503);
    if (!(await authorized(request, env.SYNC_KEY))) return json({ error: "Wrong sync key." }, 401);

    try {
      if (url.pathname === "/api/ping" && request.method === "GET") return json({ ok: true, now: Date.now() });
      if (url.pathname === "/api/sync" && request.method === "GET") return pull(env, url);
      if (url.pathname === "/api/docs" && request.method === "POST") return push(env, request);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: "Server error", detail: String(err && err.message || err) }, 500);
    }
  },
};

async function pull(env, url) {
  const since = Number(url.searchParams.get("since") || 0) || 0;
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT id, body, updated_at FROM docs WHERE server_at > ? ORDER BY server_at"
  ).bind(since).all();
  return json({ now, docs: results.map((r) => ({ id: r.id, body: JSON.parse(r.body), updated_at: r.updated_at })) });
}

async function push(env, request) {
  let docs;
  try { docs = await request.json(); } catch { return json({ error: "Body must be JSON." }, 400); }
  if (!Array.isArray(docs) || docs.length > 50) return json({ error: "Send an array of up to 50 documents." }, 400);

  const now = Date.now();
  const stmts = [];
  for (const d of docs) {
    if (!d || typeof d.id !== "string" || !ID_RE.test(d.id)) return json({ error: `Bad document id: ${d && d.id}` }, 400);
    if (typeof d.body !== "object" || d.body === null) return json({ error: `Document ${d.id} needs an object body.` }, 400);
    const body = JSON.stringify(d.body);
    if (body.length > MAX_DOC_BYTES) return json({ error: `Document ${d.id} is too large.` }, 413);
    const updated = Number(d.updated_at) || now;
    // Last writer wins, by the time the change was made on the device.
    stmts.push(env.DB.prepare(
      `INSERT INTO docs (id, body, updated_at, server_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, server_at = excluded.server_at
       WHERE excluded.updated_at >= docs.updated_at`
    ).bind(d.id, body, updated, now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ now, saved: stmts.length });
}

async function authorized(request, key) {
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(key)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return given.length > 0 && diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
