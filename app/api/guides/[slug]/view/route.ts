// POST /api/guides/[slug]/view — beacon de vista (dedupe 1 h por visitante)
import { getDb } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";
import { getVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  const g = await db.getGuide(params.slug);
  if (!g) return json(req, { error: "guía no encontrada" }, 404);
  const v = getVisitor(req);
  const counted = await db.addView(g.id!, v.id);
  const views = await db.countViews(g.id!);
  return json(req, { counted, views }, 202, v.setCookie);
}
export async function OPTIONS(req: Request) { return optionsResponse(req); }
