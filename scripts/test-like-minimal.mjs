#!/usr/bin/env node
// WR-GUIDES-API · scripts/test-like-minimal.mjs — test de regresión del bug real
// de producción detectado el 2026-10-06 por el contract test de la Fase 5:
//
//   POST /api/guides/[slug]/like → 502 "Unexpected end of JSON input"
//   ... ¡pero el like SÍ se persistía en Supabase!
//
// Causa: setLike() usa Prefer: return=minimal → PostgREST responde 201/204 con
// cuerpo VACÍO, y req() llamaba r.json() incondicional (throw después de la
// escritura exitosa). Cura en v0.3.2: tolerar cuerpo vacío.
//
// Este test levanta un MOCK de PostgREST (mismo contrato de headers/Prefer que
// el real, incluido el cuerpo vacío en return=minimal) + la API en next dev, y
// recorre el ciclo completo view/like/unlike/stats. Sin el fix, los pasos 4 y 6
// fallan con 502 — idéntico a producción. Con el fix, todo verde.
//
// Uso:  npm test          (desde la raíz del repo wr-guides-api)
//       node scripts/test-like-minimal.mjs
// Sale con código 0 si todo pasa, 1 si algo falla.

import http from "node:http";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

// Puertos ALEATORIOS por corrida: inmune a next-server zombis de sesiones
// anteriores (error real: el huérfano conserva el puerto Y el código viejo en
// memoria — ver OPERACIONES.md §7). Rango fijo para no chocar con dev (3000-3002).
const MOCK_PORT = Number(process.env.MOCK_PORT || 4200 + Math.floor(Math.random() * 700));
const API_PORT = Number(process.env.API_PORT || 3300 + Math.floor(Math.random() * 600));
const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = "mock-admin-token";
const NEXT_LOG = "/tmp/wrg-test-next-dev.log";

// ──────────────────────────── Mock PostgREST ────────────────────────────
// Filas en memoria. Respeta: eq./gte. filtros, limit, select, on_conflict,
// Prefer: return=minimal (cuerpo vacío), count=exact + Range (content-range).
function crearMock() {
  const db = {
    guides: [
      { id: 7, slug: "jinx", champion: "Jinx", role: "adc", patch: "7.3a",
        status: "Aprobado", title: null, version: "1.5", bundle: null,
        published_at: "2026-10-04" },
    ],
    guide_views: [],
    guide_likes: [],
  };
  let nextViewId = 1, nextLikeId = 1;

  function matches(row, params) {
    for (const [k, v] of params) {
      if (["select", "limit", "order", "on_conflict"].includes(k)) continue;
      const m = /^(eq|gte|lte)\.(.*)$/.exec(v);
      if (!m) continue;
      const [, op, raw] = m;
      if (op === "eq" && String(row[k]) !== raw) return false;
      if (op === "gte" && !(row[k] >= raw)) return false; // ISO dates: orden lexicográfico = cronológico
      if (op === "lte" && !(row[k] <= raw)) return false;
    }
    return true;
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${MOCK_PORT}`);
    const table = u.pathname.replace("/rest/v1/", "").split("/")[0];
    if (!db[table]) { res.writeHead(404).end(""); return; }
    const params = [...u.searchParams];
    const prefer = req.headers["prefer"] || "";
    const minimal = /return=minimal/.test(prefer);
    const countExact = /count=exact/.test(prefer);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status, payload, headers = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
        res.end(payload === null ? "" : JSON.stringify(payload));
      };
      const rows = () => db[table].filter((r) => matches(r, params));

      if (req.method === "GET") {
        let out = rows();
        const limit = u.searchParams.get("limit");
        if (limit) out = out.slice(0, Number(limit));
        if (countExact) {
          const total = rows().length;
          const last = Math.min(Math.max(out.length - 1, 0), Math.max(total - 1, 0));
          return send(206, out, { "Content-Range": `0-${last}/${total}` });
        }
        return send(200, out);
      }
      if (req.method === "POST") {
        const payload = JSON.parse(body || "{}");
        const items = Array.isArray(payload) ? payload : [payload];
        for (const it of items) {
          if (table === "guides") {
            const ex = db.guides.find((g) => g.slug === it.slug);
            if (ex) Object.assign(ex, it);
            else db.guides.push({ id: db.guides.length + 1, ...it });
          } else if (table === "guide_views") {
            db.guide_views.push({ id: nextViewId++, ...it,
              created_at: it.created_at || new Date().toISOString() });
          } else if (table === "guide_likes") {
            const dup = db.guide_likes.some(
              (l) => l.guide_id === it.guide_id && l.visitor_id === it.visitor_id);
            if (!dup) db.guide_likes.push({ id: nextLikeId++, ...it,
              created_at: new Date().toISOString() });
          }
        }
        // Contrato PostgREST: return=minimal → 201 SIN cuerpo (el bug de v0.3.1).
        if (minimal) { res.writeHead(201); return res.end(""); }
        return send(201, items);
      }
      if (req.method === "DELETE") {
        const before = db[table].length;
        db[table] = db[table].filter((r) => !matches(r, params));
        const deleted = before - db[table].length;
        if (minimal) { res.writeHead(204); return res.end(""); } // ← cuerpo vacío
        return send(200, { deleted });
      }
      if (req.method === "PATCH") {
        const payload = JSON.parse(body || "{}");
        for (const r of rows()) Object.assign(r, payload);
        if (minimal) { res.writeHead(204); return res.end(""); }
        return send(200, rows());
      }
      send(405, { error: "method not allowed" });
    });
  });
  return { server, db };
}

// ──────────────────────────── Cliente HTTP mínimo ────────────────────────────
async function call(method, path, { body, visitor } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (visitor) headers["x-visitor-id"] = visitor;
  const r = await fetch(`${API}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text.slice(0, 120); }
  return { status: r.status, body: json };
}

// ──────────────────────────── Orquestación ────────────────────────────
const VID = "11111111-2222-4333-8444-555555555555"; // UUID fijo de prueba
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
      if (r.status === 200 && j.db === "supabase") return true; // mock cuenta como "supabase"
    } catch { /* next dev aún compilando */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const { server: mock } = crearMock();
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
console.log(`· mock PostgREST escuchando en 127.0.0.1:${MOCK_PORT}`);

const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;

// Anti-zombi: si el puerto de la API ya responde, hay un next-server huérfano
// de una corrida anterior (error real documentado en OPERACIONES.md §7). Abortar
// con la cura en vez de testear contra código viejo en memoria.
try {
  await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(1500) });
  console.error(`✘ El puerto ${API_PORT} ya responde: hay un server ZOMBI de otra sesión.`);
  console.error(`  Cura: pkill -f "next-server" (o: ss -tlnp | grep ${API_PORT} → kill -9 <PID>)`);
  process.exit(2);
} catch (e) {
  if (e?.name !== "TimeoutError" && e?.code !== "ECONNREFUSED" && e?.cause?.code !== "ECONNREFUSED") {
    // cualquier otro error de red igual significa "nadie escucha limpio" → seguir
  }
}

// detached:true → la API corre en su propio grupo de procesos; al limpiar
// matamos el GRUPO completo (next dev lanza next-server como hijo: un SIGKILL
// al launcher dejaba huérfano al server con el código viejo en memoria).
const logFd = openSync(NEXT_LOG, "w");
const api = spawn(process.execPath, [nextBin, "dev", "-p", String(API_PORT)], {
  cwd: new URL("..", import.meta.url).pathname,
  detached: true,
  env: { ...process.env,
    SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_mock_para_test_local",
    ADMIN_TOKEN: ADMIN,
    ALLOWED_ORIGINS: "http://localhost:3000" },
  stdio: ["ignore", logFd, logFd],
});
const limpiar = () => {
  try { process.kill(-api.pid, "SIGKILL"); } catch { try { api.kill("SIGKILL"); } catch {} }
  try { mock.close(); } catch {}
};
process.on("exit", limpiar);
process.on("SIGINT", () => { limpiar(); process.exit(130); });

console.log("· esperando next dev (primera compilación, hasta 3 min)…");
if (!(await esperarApi(180_000))) {
  console.log("❌ la API local no arrancó. Últimas líneas de su log:");
  try {
    const { readFileSync } = await import("node:fs");
    console.log(readFileSync(NEXT_LOG, "utf8").split("\n").slice(-25).join("\n"));
  } catch { console.log(`(sin log en ${NEXT_LOG})`); }
  limpiar(); process.exit(1);
}
console.log("· API lista. Recorriendo el ciclo view/like/unlike/stats:\n");

let r = await call("POST", "/api/guides/jinx/view", { visitor: VID });
check("1. view #1 → 202 counted:true", r.status === 202 && r.body?.counted === true, JSON.stringify(r.body));
const views1 = r.body?.views;

r = await call("POST", "/api/guides/jinx/view", { visitor: VID });
check("2. view #2 (mismo visitante) → counted:false (dedupe 1 h)", r.status === 202 && r.body?.counted === false, JSON.stringify(r.body));

r = await call("GET", "/api/guides/jinx/like", { visitor: VID });
check("3. GET like inicial → liked:false, likes:0", r.status === 200 && r.body?.liked === false && r.body?.likes === 0, JSON.stringify(r.body));

r = await call("POST", "/api/guides/jinx/like", { visitor: VID, body: { action: "like" } });
check("4. POST like → 200 liked:true likes:1  ← ACÁ FALLABA v0.3.1 (502 JSON vacío)", r.status === 200 && r.body?.liked === true && r.body?.likes === 1, JSON.stringify(r.body));

r = await call("GET", "/api/guides/jinx/like", { visitor: VID });
check("5. GET like → persiste liked:true", r.status === 200 && r.body?.liked === true, JSON.stringify(r.body));

r = await call("POST", "/api/guides/jinx/like", { visitor: VID, body: { action: "unlike" } });
check("6. POST unlike → 200 liked:false likes:0  ← 2º punto donde fallaba v0.3.1", r.status === 200 && r.body?.liked === false && r.body?.likes === 0, JSON.stringify(r.body));

r = await call("GET", "/api/guides/jinx/stats", { visitor: VID });
check("7. stats coherentes (views:1, likes:0)", r.status === 200 && r.body?.views === views1 && r.body?.likes === 0, JSON.stringify(r.body));

r = await call("GET", "/api/guides/no-existe/like", { visitor: VID });
check("8. slug inválido → 404", r.status === 404, String(r.status));

r = await call("POST", "/api/guides", { body: { guias: [{ slug: "jinx", champion: "Jinx", role: "adc", patch: "7.3a", status: "Aprobado", version: "1.5", published_at: "2026-10-04" }] } });
check("9. POST /api/guides sin token → 401 (admin protegido)", r.status === 401, String(r.status));

console.log(fallos === 0
  ? "\n✔ 9/9 verdes — el ciclo de comunidad funciona contra el contrato real de PostgREST."
  : `\n✘ ${fallos} fallo(s) — ver detalle arriba.`);
limpiar();
process.exit(fallos === 0 ? 0 : 1);
