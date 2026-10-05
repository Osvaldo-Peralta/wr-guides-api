import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { optionsResponse } from "@/lib/cors";

export const dynamic = "force-dynamic";

function advertenciaDeKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) return null;
  if (key.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY parece una PUBLISHABLE key (sb_publishable_…). " +
      "Con RLS sin políticas anon la API no podrá leer/escribir: usa la SECRET key " +
      "(Project Settings → API Keys → Secret keys, sb_secret_…).";
  }
  if (key.startsWith("eyJ")) {           // JWT legado: ¿rol anon?
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString());
      if (payload.role === "anon") {
        return "SUPABASE_SERVICE_ROLE_KEY es la clave ANON (JWT legado). " +
          "Se requiere la service_role/secret key (solo servidor).";
      }
    } catch { /* no es JWT parseable — sin advertencia */ }
  }
  return null;
}

export async function GET(req: Request) {
  const db = getDb();
  const aviso = db?.kind === "supabase" ? advertenciaDeKey() : null;
  return json(req, {
    ok: !!db && !aviso,
    db: db?.kind ?? null,
    ...(aviso ? { advertencia: aviso } : {}),
    ts: new Date().toISOString(),
  }, db && !aviso ? 200 : 503);
}
export async function OPTIONS(req: Request) { return optionsResponse(req); }
