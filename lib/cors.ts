// WR-GUIDES-API · lib/cors.ts — CORS con origen explícito + credenciales (cookie de visitante)
const DEFAULT_ORIGINS = "https://wr-guides-web.vercel.app,http://localhost:3000";

export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-visitor-id, x-admin-token",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("origin") || "";
  if (origin && allowedOrigins().includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
    base["Access-Control-Allow-Credentials"] = "true";
  }
  return base;
}

export function optionsResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
