import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const db = getDb();
  return (
    <main>
      <h1>⚗️ wr-guides-api v0.4</h1>
      <p>
        API de comunidad del ecosistema WR-LAB — {db ? `BD: <strong>${db.kind}</strong>` : "BD: NO CONFIGURADA (503)"}
      </p>
      <ul>
        <li>GET /api/health</li>
        <li>GET /api/guides · POST /api/guides (admin: x-admin-token)</li>
        <li>GET /api/guides/[slug] · GET /api/guides/[slug]/stats</li>
        <li>POST /api/guides/[slug]/view · GET|POST /api/guides/[slug]/like</li>
        <li>GET /admin · GET /api/admin/stats (Fase 8 — Basic Auth: contraseña = ADMIN_TOKEN)</li>
      </ul>
      <p>Docs: README.md del repo · esquema: supabase/schema.sql</p>
    </main>
  );
}
