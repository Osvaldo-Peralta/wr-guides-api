// WR-GUIDES-API · seed-guides.mjs v0.3.1 — siembra/actualiza la tabla guides
// desde el índice del frontend (contrato §2 del plan). Los 3 repos son
// INDEPENDIENTES: por defecto el índice se descarga del sitio desplegado.
//
// Uso:
//   npm run seed                                   # .env + API local (localhost:3002)
//   WR_API=https://<tu-api>.vercel.app/ npm run seed   # contra producción
//   node scripts/seed-guides.mjs --index /ruta/absoluta/guias_index.json
//   WR_INDEX_URL=https://otro-sitio/guias_index.json node scripts/seed-guides.mjs
//
// v0.3.1:
//   · Lee .env del repo automáticamente (ya no hace falta pegar el token en el comando).
//   · Preflight: verifica /api/health ANTES de sembrar (falla rápido si WR_API
//     apunta a la web o a un dominio ajeno — error real del 2026-10-06).
//   · Detecta respuestas HTML ("eso no es la API") y PGRST204 ("falta migración").
//   · Envía title/version/bundle (columnas v0.2+ del schema).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── .env del repo (valores explícitos del entorno tienen prioridad;
//    se leen .env.local y .env — en ese orden, gana el primero que defina) ────
function loadDotEnv() {
  for (const nombre of [".env.local", ".env"]) {
    const p = join(repoRoot, nombre);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadDotEnv();

const args = process.argv.slice(2);
const iIdx = args.indexOf("--index");
const DEFAULT_INDEX_URL = "https://wr-guides-web.vercel.app/guias_index.json";
const api = (process.env.WR_API || "http://localhost:3002").replace(/\/+$/, "");
const up = (path) => `${api}${path}`;
const env = (k, d = "") => process.env[k] || d;

// ── índice del frontend ──────────────────────────────────────────────────────
async function loadIndex() {
  if (iIdx >= 0 && args[iIdx + 1]) {
    return JSON.parse(readFileSync(args[iIdx + 1], "utf8"));
  }
  const fuente = env("WR_INDEX_URL", DEFAULT_INDEX_URL);
  if (/^https?:/.test(fuente)) {
    const r = await fetch(fuente, { cache: "no-store" });
    if (!r.ok) {
      throw new Error(
        `no pude descargar el índice de ${fuente} (${r.status}).\n` +
        `  · Si el sitio aún no expone /guias_index.json: actualiza wr-guides-web\n` +
        `    (gen-index v2 lo copia a public/) y redeploya, o\n` +
        `  · usa --index /ruta/absoluta/a/wr-guides-web/content/guias_index.json`
      );
    }
    return r.json();
  }
  return JSON.parse(readFileSync(fuente, "utf8"));
}

// ── preflight: ¿la URL ES la API? (falla rápido, mensaje claro) ─────────────
async function preflight() {
  const url = up("/api/health");
  let res, text;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    text = await res.text();
  } catch (e) {
    console.error(`✗ No pude alcanzar ${url}\n  (${e.message})`);
    console.error(`  → ¿La API está corriendo/desplegada? ¿WR_API está bien escrita?`);
    process.exit(1);
  }
  if (text.trimStart().startsWith("<")) {
    console.error(`✗ ${url} devolvió HTML: eso NO es la API.`);
    console.error(`  → WR_API apunta a la app WEB (o a otro sitio). La API es un`);
    console.error(`    proyecto de Vercel APARTE (repo wr-guides-api). Ejemplos:`);
    console.error(`      local:  WR_API=http://localhost:3002/`);
    console.error(`      prod:   WR_API=https://<tu-proyecto-api>.vercel.app/`);
    console.error(`  → Ver docs/PRIMER-DESPLEGUE.md §0 (las 3 piezas del sistema).`);
    process.exit(1);
  }
  let j = null;
  try { j = JSON.parse(text); } catch { /* no-JSON */ }
  if (!j || j.ok !== true) {
    console.error(`✗ ${url} no respondió ok:true → ${text.slice(0, 300)}`);
    console.error(`  → db:"none" = faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en el servidor.`);
    console.error(`  → advertencia "publishable" = pusiste la key equivocada (usa la SECRET).`);
    process.exit(1);
  }
  console.log(`✓ API confirmada en ${api}/ (db: ${j.db})`);
}

// ── POST al upsert admin con guardas legibles ───────────────────────────────
async function postUp(body, token) {
  const res = await fetch(up("/api/guides"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      `${up("/api/guides")} devolvió HTML, no JSON.\n` +
      `→ Eso NO es la API: WR_API apunta a la app WEB (wr-guides-web)\n` +
      `  en vez de a la app API (wr-guides-api).`
    );
  }
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.stringify(JSON.parse(text), null, 2); } catch { /* texto plano */ }
    if (detail.includes("PGRST204")) {
      detail +=
        `\n→ PGRST204 = la tabla de Supabase no tiene una columna que la API envía.\n` +
        `→ Tu schema está desactualizado: corré en el SQL Editor de Supabase la\n` +
        `  migración supabase/migrations/001_add_title_version_bundle.sql`;
    }
    if (res.status === 401) {
      detail +=
        `\n→ 401 = x-admin-token inválido o faltante.\n` +
        `→ El token se lee de ADMIN_TOKEN (.env del repo o variable del entorno).\n` +
        `→ Debe coincidir EXACTAMENTE con el ADMIN_TOKEN del servidor (Vercel/local).`;
    }
    throw new Error(`upsert rechazado (${res.status}): ${detail}`);
  }
  return JSON.parse(text);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  await preflight();
  const adminToken = env("ADMIN_TOKEN", "");
  if (!adminToken) {
    console.error(`✗ Falta ADMIN_TOKEN (ponelo en wr-guides-api/.env — ver .env.example).`);
    process.exit(1);
  }
  const data = await loadIndex();
  const guias = data.guias.map((g) => ({
    slug: g.slug,
    champion: g.champion ?? null,
    role: g.role ?? null,
    patch: g.patch ?? null,
    status: g.status ?? null,
    title: g.title ?? null,
    version: g.version != null ? String(g.version) : null,
    bundle: g.bundle ?? null,
    published_at: g.published_at ?? null,
  }));
  console.log(`→ sembrando ${guias.length} guías desde el índice (${data.generado})…`);
  const out = await postUp({ guias }, adminToken);
  console.log(`✔ OK: ${out.upsert} guías sembradas/actualizadas en ${api}/`);
}

main().catch((e) => {
  console.error(`✗ ${e.message || e}`);
  process.exit(1);
});
