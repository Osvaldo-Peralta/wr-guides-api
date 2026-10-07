// WR-GUIDES-API · middleware.ts — Fase 8: puerta del dashboard privado.
//
// Protege /admin y /api/admin/* con HTTP Basic Auth: la CONTRASEÑA es el valor
// de ADMIN_TOKEN (el mismo que ya protege POST /api/guides — no se agrega ningún
// secreto nuevo al proyecto). El usuario es libre (convención: "admin").
//
// Por qué Basic Auth y no un login con formulario: cero dependencias, cero
// sesiones que mantener, el navegador gestiona el prompt y el recuerdo por
// sesión, y funciona igual en Vercel que en local. Suficiente para un panel
// personal (plan §Fase 8: "inicialmente con una contraseña simple").
//
// Sin ADMIN_TOKEN configurado → 503 explícito (nunca un panel abierto).

import { NextResponse, type NextRequest } from "next/server";

function credenciales(req: NextRequest): { user: string; pass: string } | null {
  const header = req.headers.get("authorization") || "";
  const m = /^Basic\s+(\S+)$/i.exec(header);
  if (!m) return null;
  try {
    const dec = atob(m[1]); // edge runtime: atob está disponible
    const i = dec.indexOf(":");
    if (i < 0) return null;
    return { user: dec.slice(0, i), pass: dec.slice(i + 1) };
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN || "";
  if (!token) {
    return NextResponse.json(
      {
        error: "ADMIN_TOKEN no configurado en el servidor",
        detalle:
          "El dashboard /admin requiere la env var ADMIN_TOKEN (Vercel → proyecto " +
          "wr-guides-api → Settings → Environment Variables). Sin ella, nadie entra.",
      },
      { status: 503 }
    );
  }
  const c = credenciales(req);
  if (!c || c.pass !== token) {
    return new NextResponse(
      "401 — WR Guides · panel privado.\nContraseña: el valor de ADMIN_TOKEN (usuario: cualquiera, p. ej. admin).\n",
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="WR Guides Admin", charset="UTF-8"',
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/api/admin/:path*"],
};
