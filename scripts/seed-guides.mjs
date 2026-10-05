// WR-GUIDES-API · seed-guides.mjs — siembra/actualiza la tabla guides desde el
// índice del frontend (contrato §2). Funciona contra local (memoria) o producción
// (Supabase vía la API con x-admin-token).
//
// Uso:
//   node scripts/seed-guides.mjs                                   # local (localhost:3002)
//   WR_API=https://wr-guides-api.vercel.app ADMIN_TOKEN=… node scripts/seed-guides.mjs
//   node scripts/seed-guides.mjs --index ruta/a/guias_index.json
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const iIdx = args.indexOf("--index");
const index = iIdx >= 0 ? args[iIdx + 1]
  : path.join(process.cwd(), "..", "wr-guides-web", "content", "guias_index.json");
const api = process.env.WR_API || "http://localhost:3002";

if (!fs.existsSync(index)) {
  console.error(`✗ índice no encontrado: ${index}\n  (genera con: cd wr-guides-web && npm run gen-index)`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(index, "utf8"));
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
