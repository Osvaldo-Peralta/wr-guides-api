// GET /api/admin/stats — Fase 8: overview agregado en JSON (mismo dato que
// renderiza /admin). Protegido por middleware.ts (Basic Auth = ADMIN_TOKEN).
// Uso rápido desde tu máquina:
//   curl -u admin:TU_ADMIN_TOKEN https://<tu-api>/api/admin/stats
import { getDb } from "@/lib/db";
import { json, dbUnavailable } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return dbUnavailable(req);
  try {
    return json(req, await db.adminOverview());
  } catch (e) {
    return json(req, { error: "fallo de BD", detalle: String((e as Error)?.message || e) }, 502);
  }
}
