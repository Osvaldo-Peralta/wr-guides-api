import { getDb } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  const g = await db.getGuide(params.slug);
  if (!g) return json(req, { error: "guía no encontrada" }, 404);
  const [views, likes] = [await db.countViews(g.id!), await db.countLikes(g.id!)];
  return json(req, { guia: g, stats: { views, likes } });
}
export async function OPTIONS(req: Request) { return optionsResponse(req); }
