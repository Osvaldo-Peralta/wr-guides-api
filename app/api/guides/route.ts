// GET  /api/guides            → catálogo público (referencia ligera)
// POST /api/guides            → upsert masivo (admin: header x-admin-token = ADMIN_TOKEN;
//                               en dev/memory sin token). Lo usará el sync Action lab→web.
import { getDb, type GuideRow } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  return json(req, { guias: await db.listGuides() });
}

export async function POST(req: Request) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  const token = req.headers.get("x-admin-token") || "";
  if (process.env.ADMIN_TOKEN) {
    if (token !== process.env.ADMIN_TOKEN) return json(req, { error: "x-admin-token inválido" }, 401);
  } else if (db.kind === "supabase") {
    return json(req, { error: "ADMIN_TOKEN no configurado en el servidor" }, 401);
  }
  const body = await req.json().catch(() => null);
  const rows: GuideRow[] = Array.isArray(body?.guias) ? body.guias : [];
  if (!rows.length) return json(req, { error: "body esperado: { guias: GuideRow[] } (no vacío)" }, 400);
  const limpias = rows
    .filter((r) => typeof r.slug === "string" && r.slug.length > 0 && r.slug.length < 120)
    .map((r) => ({
      slug: r.slug,
      champion: r.champion ?? null,
      role: r.role ?? null,
      patch: r.patch ?? null,
      status: r.status ?? null,
      title: r.title ?? null,
      version: r.version ?? null,
      bundle: r.bundle ?? null,
      published_at: r.published_at ?? null,
    }));
  try {
    const n = await db.upsertGuides(limpias);
    return json(req, { upsert: n });
  } catch (e) {
    return json(req, { error: "upsert falló", detalle: String((e as Error)?.message || e) }, 502);
  }
}

export async function OPTIONS(req: Request) { return optionsResponse(req); }
