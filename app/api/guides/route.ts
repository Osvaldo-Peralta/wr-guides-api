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
  if (db.kind === "supabase") {
    const token = req.headers.get("x-admin-token") || "";
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
      return json(req, { error: "x-admin-token inválido" }, 401);
    }
  }
  const body = await req.json().catch(() => null);
  const rows: GuideRow[] = Array.isArray(body?.guias) ? body.guias : null;
  if (!rows) return json(req, { error: "body esperado: { guias: GuideRow[] }" }, 400);
  const limpias = rows
    .filter((r) => typeof r.slug === "string" && r.slug.length > 0 && r.slug.length < 120)
    .map((r) => ({
      slug: r.slug,
      champion: r.champion ?? null,
      role: r.role ?? null,
      patch: r.patch ?? null,
      status: r.status ?? null,
      published_at: r.published_at ?? null,
    }));
  const n = await db.upsertGuides(limpias);
  return json(req, { upsert: n });
}

export async function OPTIONS(req: Request) { return optionsResponse(req); }
