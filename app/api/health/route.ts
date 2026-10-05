import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  return json(req, { ok: !!db, db: db?.kind ?? null, ts: new Date().toISOString() }, db ? 200 : 503);
}
export async function OPTIONS(req: Request) { return optionsResponse(req); }
