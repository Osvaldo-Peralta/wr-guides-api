// WR-GUIDES-API · lib/http.ts — respuestas JSON con CORS (+Set-Cookie opcional)
import { corsHeaders } from "./cors";

export function json(req: Request, data: unknown, status = 200, setCookie?: string): Response {
  const h = new Headers({ "Content-Type": "application/json", ...corsHeaders(req) });
  if (setCookie) h.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function dbUnavailable(req: Request): Response {
  return json(req, {
    error: "BD no configurada",
    detalle: "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (producción nunca usa memoria).",
  }, 503);
}
