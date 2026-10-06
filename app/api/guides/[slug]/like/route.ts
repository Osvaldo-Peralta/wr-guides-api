// GET  /api/guides/[slug]/like           → { liked } del visitante actual
// POST /api/guides/[slug]/like           → body { action: "like" | "unlike" } (toggle)
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
    const liked = await db.getLike(g.id!, v.id);
    return json(req, { liked, likes: await db.countLikes(g.id!) }, 200, v.setCookie);
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
    const action = body?.action === "unlike" ? "unlike" : "like";
    const v = getVisitor(req);
    await db.setLike(g.id!, v.id, action === "like");
    return json(req, { liked: action === "like", likes: await db.countLikes(g.id!) }, 200, v.setCookie);
  } catch (e) {
    return json(req, { error: "fallo de BD", detalle: String((e as Error)?.message || e) }, 502);
  }
}
export async function OPTIONS(req: Request) { return optionsResponse(req); }
