// GET  /api/guides/[slug]/favorite  → { favorite, favorites } del visitante actual
// POST /api/guides/[slug]/favorite  → body { action: "add" | "remove" } (toggle)
// V2: favoritos anónimos — mismo patrón que /like (visitor id por header/cookie,
// UNIQUE guide+visitor en BD, toggle idempotente). Requiere migration 002 aplicada.
import { getDb } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";
import { getVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  try {
    const g = await db.getGuide(params.slug);
    if (!g) return json(req, { error: "guía no encontrada" }, 404);
    const v = getVisitor(req);
    const favorite = await db.getFavorite(g.id!, v.id);
    return json(req, { favorite, favorites: await db.countFavorites(g.id!) }, 200, v.setCookie);
  } catch (e) {
    return json(req, { error: "fallo de BD", detalle: String((e as Error)?.message || e) }, 502);
  }
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  try {
    const g = await db.getGuide(params.slug);
    if (!g) return json(req, { error: "guía no encontrada" }, 404);
    const body = await req.json().catch(() => ({}));
    const add = body?.action !== "remove";
    const v = getVisitor(req);
    await db.setFavorite(g.id!, v.id, add);
    return json(req, { favorite: add, favorites: await db.countFavorites(g.id!) }, 200, v.setCookie);
  } catch (e) {
    return json(req, { error: "fallo de BD", detalle: String((e as Error)?.message || e) }, 502);
  }
}

export async function OPTIONS(req: Request) { return optionsResponse(req); }
