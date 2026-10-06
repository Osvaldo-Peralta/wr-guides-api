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

📖 **Docs:** [`OPERACIONES.md`](OPERACIONES.md) (runbook del ecosistema) ·
[`docs/PRIMER-DESPLEGUE.md`](docs/PRIMER-DESPLEGUE.md) (guía personal paso a
paso para el primer despliegue Vercel + Supabase — escrita tras el incidente
PGRST204 del 2026-10-06).

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
   ⚠️ ¿La base **ya existía** de una versión anterior? `CREATE TABLE IF NOT
   EXISTS` no agrega columnas nuevas: corré también los archivos de
   `supabase/migrations/` en orden (p. ej. `001` agrega `title/version/bundle`,
   cura del error `PGRST204` al re-sembrar).
2. **Env vars en Vercel** (Settings → Environment Variables del proyecto API):
   - `SUPABASE_URL` = `https://<ref>.supabase.co` (Supabase → Connect → Server APIs,
     o Project Settings → API → Project URL).
   - `SUPABASE_SERVICE_ROLE_KEY` = la **SECRET key** (`sb_secret_…`): Project
     Settings → API Keys → **Secret keys** → Generate. ⚠️ La *Publishable key*
     (`sb_publishable_…`) NO sirve: es pública y RLS la bloquea — `GET /api/health`
     la detecta y responde 503 con la explicación. Nunca pegar la secret en el
     repo ni en chats.
   - `ADMIN_TOKEN` = frase larga al azar (p. ej. `openssl rand -hex 24`): protege
     `POST /api/guides` (siembra/sync del catálogo).
   - `ALLOWED_ORIGINS` (opcional): default `https://wr-guides-web.vercel.app,http://localhost:3000`.
3. **Sembrar guías** (los 3 repos son independientes — no requiere rutas hermanas):
   ```bash
   # .env.local/.env con ADMIN_TOKEN (+ WR_API si no es localhost:3002)
   npm run seed                                          # contra la API local
   WR_API=https://TU-api.vercel.app/ npm run seed        # contra producción
   ```
   Desde v0.3.1 el token se lee del `.env` (no lo pegues en el comando: queda
   en el historial/chats) y hay **preflight**: el script verifica que `WR_API`
   sea realmente la API antes de escribir nada.
   El script descarga el índice del **sitio desplegado**
   (`https://wr-guides-web.vercel.app/guias_index.json`, publicado por el
   gen-index v2 del frontend). Alternativas: `WR_INDEX_URL=<otra url>` o
   `--index /ruta/absoluta/guias_index.json`. Re-sembrar tras cada sync de
   contenido — el upsert por slug es idempotente.

4. **Verificar:** `GET https://TU-api.vercel.app/api/health` →
   `{"ok":true,"db":"supabase"}`. Si `ok:false`, el campo `advertencia` explica
   el problema (p. ej. publishable key en vez de secret).

## Desarrollo local (sin Supabase)

```bash
npm install && npm run dev     # http://localhost:3002 · BD en memoria
node scripts/seed-guides.mjs   # siembra desde el índice del frontend
```

## Despliegue (Vercel)

Importar este repo → framework Next.js (autodetectado) → añadir las 3 env vars
→ Deploy. Verificar: `GET /api/health` debe responder `{ ok: true, db: "supabase" }`.
