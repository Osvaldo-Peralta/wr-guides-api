# ⚙️ wr-guides-api — API de comunidad (Fase 3-4 del plan de migración)

Backend separado del frontend (principio 7 del plan): gestiona **vistas** y
**likes** anónimos por guía. El contenido NO vive aquí — solo estado
(principio 6: "la BD almacena estado, no contenido").

- **Stack:** Next.js 14 (route handlers) + Supabase (PostgREST, service_role) —
  sin SDK: `fetch` plano, cero dependencias extra.
- **Identificación anónima:** header `x-visitor-id` (UUID del localStorage del
  front — inmune al bloqueo de cookies de terceros) con fallback a cookie
  httpOnly `wrg_vid`. Sin PII.
- **Dedupe:** vistas = 1 por visitante/hora; likes = 1 por visitante/guía
  (UNIQUE en BD) con toggle like/unlike.
- **Capa hexagonal `lib/db.ts`:** Supabase en producción; memoria en dev local
  (sin credenciales). En producción sin env vars → 503 explícito, nunca memoria.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | estado + tipo de BD |
| GET | `/api/guides` | catálogo (referencia ligera) |
| POST | `/api/guides` | upsert masivo — **admin**: header `x-admin-token` (producción) |
| GET | `/api/guides/:slug` | guía + stats |
| GET | `/api/guides/:slug/stats` | `{ views, likes }` |
| POST | `/api/guides/:slug/view` | beacon de vista (202, dedupe 1 h) |
| GET/POST | `/api/guides/:slug/like` | estado / toggle (`{action:"like"\|"unlike"}`) |

CORS: orígenes en `ALLOWED_ORIGINS` (default: web en Vercel + localhost:3000),
con credenciales. Rate-limiting robusto (Upstash) queda para v2 — el dedupe y
el UNIQUE de BD cubren el abuso casual.

## Setup (una vez)

1. **Supabase (Fase 4):** Dashboard → SQL Editor → pegar y correr
   `supabase/schema.sql` (3 tablas + RLS sin políticas anon + índices +
   función `guide_stats()` para el dashboard).
2. **Env vars** (Supabase → Project Settings → API):
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` — **la service_role es secreta:
   solo en Vercel (Settings → Environment Variables), nunca en el repo**.
   Opcional: `ADMIN_TOKEN` (string larga al azar) para el endpoint de upsert.
3. **Sembrar guías:**
   ```bash
   WR_API=https://TU-api.vercel.app ADMIN_TOKEN=… node scripts/seed-guides.mjs
   ```
   (lee `../wr-guides-web/content/guias_index.json`; re-sembrar tras cada sync
   de contenido — el upsert por slug es idempotente).

## Desarrollo local (sin Supabase)

```bash
npm install && npm run dev     # http://localhost:3002 · BD en memoria
node scripts/seed-guides.mjs   # siembra desde el índice del frontend
```

## Despliegue (Vercel)

Importar este repo → framework Next.js (autodetectado) → añadir las 3 env vars
→ Deploy. Verificar: `GET /api/health` debe responder `{ ok: true, db: "supabase" }`.
