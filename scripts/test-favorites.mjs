#!/usr/bin/env node
// WR-GUIDES-API · scripts/test-favorites.mjs — regresión V2 (favoritos anónimos):
//   add → estado → dedupe (UNIQUE guide+visitor) → list del visitante →
//   remove → list vacío → reflejo en /api/admin/stats (totals.favoritos y
//   porGuia.favs) → slug inválido 404. Mock PostgREST con guide_favorites y
//   resolution=ignore-duplicates (el contrato real de la migration 002).
// Uso: npm test · node scripts/test-favorites.mjs · sale 0/1.

import http from "node:http";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

const MOCK_PORT = Number(process.env.MOCK_PORT || 6200 + Math.floor(Math.random() * 700));
const API_PORT = Number(process.env.API_PORT || 5300 + Math.floor(Math.random() * 600));
const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = "mock-admin-token";
const NEXT_LOG = "/tmp/wrg-test-fav-next-dev.log";

function crearMock() {
  const db = { guides: [], guide_views: [], guide_likes: [], guide_favorites: [] };
  let nextId = 100;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const u = new URL(req.url, `http://127.0.0.1:${MOCK_PORT}`);
      const send = (s, p, h = {}) => {
        res.writeHead(s, { "Content-Type": "application/json", ...h });
        res.end(p === undefined ? "" : JSON.stringify(p));
      };
      if (u.pathname === "/rest/v1/rpc/guide_stats") {
        return send(200, db.guides.map((g) => ({
          slug: g.slug, champion: g.champion,
          views: db.guide_views.filter((v) => v.guide_id === g.id).length,
          likes: db.guide_likes.filter((l) => l.guide_id === g.id).length,
        })));
      }
      const table = u.pathname.replace("/rest/v1/", "").split("/")[0];
      if (!db[table]) return send(404, { error: `tabla ${table} no existe (¿migration pendiente?)` });
      const params = [...u.searchParams];
      const IGN = ["select", "limit", "offset", "order", "on_conflict"];
      const matches = (row) => params.every(([k, v]) => {
        if (IGN.includes(k)) return true;
        const m = /^(eq|gte|lte)\.(.*)$/.exec(v);
        if (!m) return true;
        const [, op, raw] = m;
        if (op === "eq") return String(row[k]) === raw;
        if (op === "gte") return row[k] >= raw;
        if (op === "lte") return row[k] <= raw;
        return true;
      });
      if (req.method === "GET") {
        let out = db[table].filter(matches);
        const order = u.searchParams.get("order");
        if (order) {
          const [col, dir] = order.split(".");
          out = out.slice().sort((a, b) => (dir === "desc" ? (a[col] < b[col] ? 1 : -1) : a[col] > b[col] ? 1 : -1));
        }
        const total = out.length;
        const offset = Number(u.searchParams.get("offset") || 0);
        const limit = Number(u.searchParams.get("limit") || 1000);
        out = out.slice(offset, offset + limit);
        if (/count=exact/.test(req.headers.prefer || "")) {
          return send(206, out, { "Content-Range": `${offset}-${Math.max(offset + out.length - 1, 0)}/${total}` });
        }
        return send(200, out);
      }
      if (req.method === "POST") {
        const payload = JSON.parse(body || "{}");
        const items = Array.isArray(payload) ? payload : [payload];
        const ignoreDups = /resolution=ignore-duplicates/.test(req.headers.prefer || "");
        for (const it of items) {
          if (table === "guides") {
            const ex = db.guides.find((g) => g.slug === it.slug);
            if (ex) Object.assign(ex, it);
            else db.guides.push({ id: ++nextId, ...it });
          } else {
            const dup = db[table].some(
              (r) => r.guide_id === it.guide_id && r.visitor_id === it.visitor_id);
            if (dup && (ignoreDups || table === "guide_likes" || table === "guide_favorites")) continue;
            db[table].push({ id: ++nextId, ...it, created_at: it.created_at || new Date().toISOString() });
          }
        }
        if (/return=minimal/.test(req.headers.prefer || "")) { res.writeHead(201); return res.end(""); }
        return send(201, items);
      }
      if (req.method === "DELETE") {
        db[table] = db[table].filter((r) => !matches(r));
        if (/return=minimal/.test(req.headers.prefer || "")) { res.writeHead(204); return res.end(""); }
        return send(200, { ok: true });
      }
      send(405, {});
    });
  });
  return { server, db };
}

async function fetchRetry(url, init, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      err = e; // "fetch failed": reset transitorio con compile frío en dev
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw err;
}

async function call(method, path, { body, visitor, auth } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (visitor) headers["x-visitor-id"] = visitor;
  if (auth) headers.authorization = `Basic ${Buffer.from(auth).toString("base64")}`;
  const r = await fetchRetry(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 160); }
  return { status: r.status, body: json };
}

let fallos = 0;
function check(nombre, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${nombre}${extra ? "  → " + extra : ""}`);
  if (!cond) fallos++;
}

async function esperarApi(maxMs = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const r = await fetch(`${API}/api/health`);
      const j = await r.json();
      if (r.status === 200 && j.db === "supabase") return true;
    } catch { /* compilando */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const { server: mock } = crearMock();
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
console.log(`· mock PostgREST (con guide_favorites) en :${MOCK_PORT}`);

try {
  await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1500) });
  console.error(`✗ Puerto ${API_PORT} ocupado por un next zombi. pkill -f "next dev" y reintentá.`);
  process.exit(1);
} catch { /* libre */ }

const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;
const child = spawn(process.execPath, [nextBin, "dev", "-p", String(API_PORT)], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "mock-key",
    ADMIN_TOKEN: ADMIN,
  },
  stdio: ["ignore", openSync(NEXT_LOG, "w"), openSync(NEXT_LOG, "a")],
});

try {
  if (!(await esperarApi())) throw new Error(`API no levantó (log: ${NEXT_LOG})`);
  console.log(`· API en ${API}\n`);

  const V1 = "22222222-3333-4444-8555-666666666666";
  const V2 = "77777777-8888-4999-8aaa-bbbbbbbbcccc";

  let r = await fetch(`${API}/api/guides`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": ADMIN },
    body: JSON.stringify({ guias: [
      { slug: "jinx", champion: "Jinx", role: "adc", patch: "7.3a", status: "Aprobado", version: "1.5", published_at: "2026-10-04" },
      { slug: "kalista", champion: "Kalista", role: "adc", patch: "7.3", status: "Aprobado", version: "1.0", published_at: "2026-09-30" },
    ] }),
  }).then(async (x) => ({ status: x.status, body: await x.json() }));
  check("seed de 2 guías", r.status === 200 && r.body.upsert === 2);

  r = await call("GET", "/api/guides/jinx/favorite", { visitor: V1 });
  check("GET favorite inicial → false/0", r.status === 200 && r.body.favorite === false && r.body.favorites === 0, JSON.stringify(r.body));

  r = await call("POST", "/api/guides/jinx/favorite", { visitor: V1, body: { action: "add" } });
  check("POST add → true/1", r.status === 200 && r.body.favorite === true && r.body.favorites === 1, JSON.stringify(r.body));

  r = await call("POST", "/api/guides/jinx/favorite", { visitor: V1, body: { action: "add" } });
  check("add duplicado → UNIQUE respeta 1 (ignore-duplicates)", r.body.favorites === 1, JSON.stringify(r.body));

  r = await call("GET", "/api/guides/jinx/favorite", { visitor: V1 });
  check("GET persiste favorite:true", r.body.favorite === true);

  r = await call("GET", "/api/guides/jinx/favorite", { visitor: V2 });
  check("otro visitante → favorite:false (anonimato por visitor)", r.body.favorite === false && r.body.favorites === 1);

  r = await call("POST", "/api/guides/kalista/favorite", { visitor: V1, body: { action: "add" } });
  check("V2 favorito en kalista", r.body.favorite === true);

  r = await call("GET", "/api/favorites", { visitor: V1 });
  check("GET /api/favorites V1 → [jinx, kalista]", r.status === 200 && r.body.slugs.length === 2 && r.body.slugs.includes("jinx") && r.body.slugs.includes("kalista"), JSON.stringify(r.body));

  r = await call("GET", "/api/favorites", { visitor: V2 });
  check("GET /api/favorites V2 → []", r.body.slugs.length === 0);

  r = await call("GET", "/api/admin/stats", { auth: `admin:${ADMIN}` });
  check("admin: totals.favoritos = 2", r.body.totals.favoritos === 2, String(r.body.totals.favoritos));
  check("admin: porGuia.jinx.favs = 1", r.body.porGuia.find((g) => g.slug === "jinx")?.favs === 1);
  check("admin: feed incluye evento fav", r.body.recientes.some((e) => e.tipo === "fav"));

  r = await call("POST", "/api/guides/jinx/favorite", { visitor: V1, body: { action: "remove" } });
  check("POST remove → false/0", r.body.favorite === false && r.body.favorites === 0, JSON.stringify(r.body));

  r = await call("GET", "/api/favorites", { visitor: V1 });
  check("favorites V1 queda [kalista]", r.body.slugs.length === 1 && r.body.slugs[0] === "kalista");

  r = await call("GET", "/api/guides/no-existe/favorite", { visitor: V1 });
  check("slug inválido → 404", r.status === 404);
} catch (e) {
  fallos++;
  console.error("❌ excepción:", e.message);
} finally {
  child.kill("SIGKILL");
  mock.close();
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : "\n✓ test-favorites: todo verde");
process.exit(fallos ? 1 : 0);
