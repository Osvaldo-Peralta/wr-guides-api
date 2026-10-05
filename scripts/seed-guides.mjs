// WR-GUIDES-API · seed-guides.mjs — siembra/actualiza la tabla guides desde el
// índice del frontend (contrato §2). Los 3 repos son INDEPENDIENTES: por defecto
// el índice se descarga del sitio desplegado (no requiere rutas hermanas).
//
// Uso:
//   node scripts/seed-guides.mjs                       # índice del sitio + API local
//   WR_API=https://TU-api.vercel.app ADMIN_TOKEN=… node scripts/seed-guides.mjs
//   node scripts/seed-guides.mjs --index /ruta/absoluta/guias_index.json
//   WR_INDEX_URL=https://otro-sitio/guias_index.json node scripts/seed-guides.mjs
const args = process.argv.slice(2);
const iIdx = args.indexOf("--index");
const DEFAULT_INDEX_URL = "https://wr-guides-web.vercel.app/guias_index.json";

async function loadIndex() {
  if (iIdx >= 0 && args[iIdx + 1]) {
    const fs = await import("node:fs");
    return JSON.parse(fs.readFileSync(args[iIdx + 1], "utf8"));
  }
  const fuente = process.env.WR_INDEX_URL || DEFAULT_INDEX_URL;
  if (/^https?:/.test(fuente)) {
    const r = await fetch(fuente, { cache: "no-store" });
    if (!r.ok) {
      throw new Error(
        `no pude descargar el índice de ${fuente} (${r.status}).\n` +
        `  · Si el sitio aún no expone /guias_index.json: actualiza wr-guides-web\n` +
        `    (gen-index v2 lo copia a public/) y redeploya, o\n` +
        `  · usa --index /ruta/absoluta/a/wr-guides-web/content/guias_index.json`);
    }
    return r.json();
  }
  const fs = await import("node:fs");
  return JSON.parse(fs.readFileSync(fuente, "utf8"));
}

const api = process.env.WR_API || "http://localhost:3002";
const data = await loadIndex();
const guias = data.guias.map((g) => ({
  slug: g.slug, champion: g.champion, role: g.role, patch: g.patch,
  status: g.status, published_at: g.published_at,
}));

const headers = { "Content-Type": "application/json" };
if (process.env.ADMIN_TOKEN) headers["x-admin-token"] = process.env.ADMIN_TOKEN;

const r = await fetch(`${api}/api/guides`, {
  method: "POST", headers, body: JSON.stringify({ guias }),
});
const out = await r.json().catch(() => ({}));
if (!r.ok) {
  console.error(`✗ ${r.status}`, out);
  process.exit(1);
}
console.log(`✔ sembradas ${out.upsert} guías en ${api} (índice del ${data.generado})`);
