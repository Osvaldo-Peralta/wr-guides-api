// GET /api/favorites → { slugs: string[] } — los favoritos del visitante actual
// (para el home: sección "Tus favoritas" y estrellas en el catálogo).
// V2: identificación anónima estándar (x-visitor-id → cookie fallback).
import { getDb } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";
import { getVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  try {
    const v = getVisitor(req);
    const ids = await db.listVisitorFavoriteIds(v.id);
    const guides = await db.listGuides();
    const slugPorId = new Map(guides.map((g) => [g.id, g.slug]));
    const slugs = ids.map((id) => slugPorId.get(id)).filter((s): s is string => Boolean(s));
    return json(req, { slugs }, 200, v.setCookie);
  } catch (e) {
    return json(req, { error: "fallo de BD", detalle: String((e as Error)?.message || e) }, 502);
  }
}

export async function OPTIONS(req: Request) { return optionsResponse(req); }
