// WR-GUIDES-API · lib/visitor.ts — identificación anónima (plan §Fase 3.5)
// Prioridad: header x-visitor-id (UUID guardado en localStorage del front —
// inmune al bloqueo de cookies de terceros) → cookie httpOnly wrg_vid → nuevo UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COOKIE_NAME = "wrg_vid";

export function getVisitor(req: Request): { id: string; setCookie?: string } {
  const hdr = req.headers.get("x-visitor-id") || "";
  if (UUID_RE.test(hdr)) return { id: hdr };
  const raw = req.headers.get("cookie") || "";
  const found = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE_NAME + "="));
  const val = found ? found.slice(COOKIE_NAME.length + 1) : "";
  if (UUID_RE.test(val)) return { id: val };
  const id = crypto.randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    id,
    setCookie: `${COOKIE_NAME}=${id}; Path=/; Max-Age=63072000; HttpOnly; SameSite=Lax${secure}`,
  };
}
