# 🐣 PRIMER DESPLIEGUE — guía personal (Vercel + Supabase desde cero)

> Escrita el 2026-10-06 para Morningstar, después del incidente real de hoy
> (error `PGRST204` al re-sembrar + seed apuntando a la URL equivocada).
> No asume experiencia previa con Vercel ni Supabase.
> Si algo de acá contradice a `OPERACIONES.md`, esta guía gana para **tu**
> situación actual — el runbook es la referencia general del ecosistema.

---

## 0. El modelo mental: son TRES piezas, no una

El error más fácil del mundo (y el que pasó hoy) es confundir **la web** con
**la API**. Son dos proyectos de Vercel separados, con URLs separadas, que
comparten UNA base de datos en Supabase:

```
                        Navegador del lector
                        ┌────────┴─────────┐
                        │                  │
                        ▼                  ▼
   🌐 wr-guides-web.vercel.app    🌐 <tu-api>.vercel.app
      LA WEB (repo wr-guides-web)    LA API (repo wr-guides-api)
      · Sirve PÁGINAS (HTML)         · Sirve JSON en /api/...
      · Lee los .md en el build      · health, guides, stats,
      · NO tiene rutas /api            view, like
      · Ya está desplegada ✓         · ÚNICA que habla con la BD
                        │                  │
                        │                  ▼
                        │      🗄️ SUPABASE (PostgreSQL en la nube)
                        │         · guides / guide_views / guide_likes
                        └────►    · SIN URL pública propia: no se "visita",
                                  se administra por su dashboard
```

**Regla de oro:** todo comando que toque `/api/...` apunta a la URL de la
**API**. Nunca a la de la web. La web no sabe responder eso (devuelve 404 o
una página HTML — exactamente lo que viste hoy).

En local es idéntico: web en `localhost:3000/3001`, API en `localhost:3002`.

---

## 1. Las URLs del sistema (completá y tenelas a mano)

| Pieza | URL | Qué devuelve |
|---|---|---|
| Web (producción) | `https://wr-guides-web.vercel.app` | Páginas HTML |
| **API (producción)** | `https://wr-guides-api.vercel.app` ✅ desplegada 2026-10-06 | JSON |
| API (local) | `http://localhost:3002` | JSON |
| Supabase (dashboard) | `https://supabase.com/dashboard` → tu proyecto | Panel de administración |
| Índice de guías | `https://wr-guides-web.vercel.app/guias_index.json` | JSON (lo lee el seed) |

Los `<placeholder>` como `TU-api.vercel.app` o `<tu-proyecto-api>` en la docs
**siempre** se reemplazan por tu URL real antes de ejecutar. Si un comando
"funciona" con el placeholder literal... desconfiá y mirá de nuevo la URL
(eso pasó hoy — ver §4, error #2).

---

## 2. Snapshot de hoy (2026-10-06): dónde estás parado

**Actualización nocturna: la recuperación §3 se completó.** Estado verificado:

- ✅ **Web desplegada y actualizada** (variante legal de Jinx y callouts renderizan en producción).
- ✅ **API desplegada en Vercel**: `https://wr-guides-api.vercel.app` →
  `health → {ok:true, db:"supabase"}` (verificado desde fuera).
- ✅ **Migración 001 aplicada** + **17 guías sembradas** (el seed no dio errores
  ni en local ni contra producción — confirmado por Morningstar).
- ✅ **CORS de producción correcto**: `Access-Control-Allow-Origin:
  https://wr-guides-web.vercel.app` + credenciales + `x-visitor-id` (preflight 204).
- ✅ **ADMIN_TOKEN rotado** (el viejo `Liz_Yuumi` está muerto y enterrado).
- ⚠️ **Pendiente: redeployar la API v0.3.2** — el contract test de la Fase 5
  encontró el error #5 (§4): `POST like` → 502 aunque el like persistía.
  Ya está corregido y probado (9/9 con mock de PostgREST); falta el push + redeploy.
- 🚧 **Fase 5 construida**: widget 👁/❤ listo en `wr-guides-web`
  (`lib/api.ts` + `components/GuideStats.tsx`), a la espera de su despliegue.

---

## 3. La recuperación, paso a paso (en este orden exacto)

### 3.1 Rotar el ADMIN_TOKEN (2 min) — primero esto

Un token que se pegó en un chat se trata como comprometido, punto. En **tu**
terminal (el resultado NO se pega en ningún lado):

```bash
openssl rand -hex 24
```

Eso imprime una frase hex al azar: tu nuevo token. Actualizalo en:

1. **Local:** `wr-guides-api/.env.local` (o `.env` — el seed y Next leen ambos)
   → línea `ADMIN_TOKEN=<el nuevo>`.
2. **Vercel:** cuando crees el proyecto de la API (§3.4), ahí va el nuevo.
   (Y el viejo `Liz_Yuumi` NO se usa nunca más — ni en Vercel ni en .env.)

Reglas de los secretos, para siempre:
- Se **generan en tu máquina** (`openssl rand -hex 24`).
- Van **directo** a `.env` (local) o a Vercel → Settings → Environment Variables.
- **Nunca** por chat, nunca en un commit, nunca en un comando que vayas a
  copiar/pegar/compartir (el prefijo `ADMIN_TOKEN=xxx node ...` deja el token
  en el historial de la terminal y en los mensajes — por eso el seed v0.3.1
  ahora lee `.env` solo: alcanza con `npm run seed`).

### 3.2 Aplicar la migración en Supabase (2 min)

La BD quedó con el schema v0.1; la API v0.3 manda columnas que no existen.
`CREATE TABLE IF NOT EXISTS` **no** actualiza tablas existentes — para eso
están las migraciones:

1. Entrá a `https://supabase.com/dashboard` → tu proyecto.
2. Menú lateral → **SQL Editor** → **New query**.
3. Abrí el archivo `supabase/migrations/001_add_title_version_bundle.sql`
   del repo (después de hacer `git pull`), copiá TODO su contenido, pegalo
   en el SQL Editor → **Run**.
4. El resultado final debe listar **11 columnas** de `guides`, incluyendo
   `title`, `version` y `bundle`.

No borra nada: sólo agrega las 3 columnas que faltan. Es idempotente (correrla
dos veces no hace daño).

> **Costumbre nueva:** cada vez que actualices el repo de la API (`git pull`),
> mirá si hay archivos nuevos en `supabase/migrations/` — si los hay, se corren
> en el SQL Editor, en orden numérico.

### 3.3 Re-sembrar desde local (1 min)

Con la API local corriendo (`npm run dev` en `wr-guides-api`, puerto 3002) y
el `.env.local` (o `.env`) con `ADMIN_TOKEN` nuevo + `WR_API=http://localhost:3002/`:

```bash
cd ~/Proyectos/Sitio\ Web/wr-guides-api
git pull          # trae v0.3.2 (fix del like 502 + test de regresión `npm test`)
npm run seed
```

Salida esperada:

```
✓ API confirmada en http://localhost:3002/ (db: supabase)
→ sembrando 17 guías desde el índice (2026-10-06)…
✔ OK: 17 guías sembradas/actualizadas en http://localhost:3002/
```

El seed v0.3.1 hace **preflight**: antes de escribir nada, verifica que la URL
sea realmente la API. Si apuntás a la web, te lo dice en cristiano y no manda
nada (antes fallaba con un críptico `✗ 404 {}`).

Verificación:

```bash
curl -s localhost:3002/api/guides | head -c 400
```

Ahora las filas deben incluir `"version":"1.5"` (y `"title":null`,
`"bundle":null` — el índice aún no los trae; es esperado).

### 3.4 Desplegar la API en Vercel (10 min, click a click)

Primera vez creando un proyecto en Vercel — va sin atajos:

1. `https://vercel.com` → **Login** con la misma cuenta de GitHub que tiene
   los repos (la misma con la que desplegaste la web).
2. Botón **Add New...** (arriba a la derecha) → **Project**.
3. Vas a ver la lista de tus repos de GitHub ("Import Git Repository").
   Buscá **wr-guides-api** → **Import**.
   - *¿No aparece?* Al final de la lista: **Adjust GitHub App Permissions** →
     seleccioná `wr-guides-api` → Save → volvés y ya aparece.
4. Pantalla **Configure Project**:
   - **Project Name:** el que sugiere está bien (`wr-guides-api`) — determina
     tu dominio `wr-guides-api.vercel.app` (si está ocupado, Vercel le agrega
     un sufijo; por eso hay que anotar la URL real en §3.5).
   - **Framework Preset:** Next.js (autodetectado — no tocar).
   - **Root Directory / Build / Output:** dejar todo como viene.
5. **Environment Variables** (en esa misma pantalla, sección abajo — agregar
   las 4 con el botón **Add**). Nombres EXACTOS:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<tu-proyecto>.supabase.co` (Supabase → Settings → API) |
   | `SUPABASE_SERVICE_ROLE_KEY` | la **Secret key** (`sb_secret_...`) — la publishable NO sirve |
   | `ADMIN_TOKEN` | el **nuevo** de §3.1 |
   | `ALLOWED_ORIGINS` | `https://wr-guides-web.vercel.app` |

   > ⚠️ `NEXT_PUBLIC_API_URL` **NO** va acá — esa es del proyecto WEB y se
   > configura en la Fase 5. Mezclarlas es otro error clásico.
6. **Deploy** → esperar ~1 minuto → pantalla "Congratulations" →
   **Continue to Dashboard**.
7. En el dashboard del proyecto → pestaña **Settings → Domains**: copiá la
   URL `.vercel.app` real (ej. `wr-guides-api-xyz.vercel.app`) y **anotala en
   la tabla de §1**. Esa es "la URL de la API" de ahora en más.

### 3.5 Verificar la API desplegada (2 min)

```bash
API=https://PEGA-AQUI-TU-URL-REAL.vercel.app

curl -s $API/api/health
# esperado: {"ok":true,"db":"supabase","ts":"..."}

curl -s $API/api/guides | head -c 300
# esperado: {"guias":[{"id":1,"slug":"caitlyn",... con "version"

curl -s $API/api/guides/jinx/stats
# esperado: {"slug":"jinx","views":0,"likes":0}
```

Si `health` responde `ok:false`:
- `db:null` → faltan `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` en Vercel
  (Settings → Environment Variables; tras cambiarlas, **Redeploy** en la
  pestaña Deployments).
- `advertencia` menciona "publishable" → pusiste la key equivocada: va la
  **Secret** (`sb_secret_...`), no la publishable.

### 3.6 Re-sembrar contra producción (1 min, idempotente)

Misma Supabase, mismos datos — esto comprueba que el POST admin funciona
**en producción**:

```bash
cd ~/Proyectos/Sitio\ Web/wr-guides-api
WR_API=https://PEGA-AQUI-TU-URL-REAL.vercel.app/ npm run seed
# (el ADMIN_TOKEN lo lee solo del .env — debe ser el MISMO que pusiste en Vercel)
```

### 3.7 Prueba de humo CORS (la web ↔ la API) (30 s)

```bash
curl -s -i -X OPTIONS https://PEGA-AQUI-TU-URL-REAL.vercel.app/api/guides/jinx/stats \
  -H "Origin: https://wr-guides-web.vercel.app" \
  -H "Access-Control-Request-Method: GET" | head -12
# esperado: HTTP/2 204 + access-control-allow-origin: https://wr-guides-web.vercel.app
```

Con §3.1→§3.7 en verde, la Fase 5 (widget 👁/❤ en la web) queda desbloqueada.
✅ **Hecho el 2026-10-06:** §3 completo (deploy + seed + token rotado verificados
desde fuera) y widget de la Fase 5 construido en `wr-guides-web`.

---

## 4. Los errores de hoy (y qué enseña cada uno)

| # | Qué pasó | Síntoma | Lección |
|---|---|---|---|
| 1 | Seed apuntando a `wr-guides-web.vercel.app` | `✗ 404 {}` y luego HTML al hacer curl | La web NO tiene `/api`: es OTRO proyecto. Antes de ejecutar, leer la URL del comando. (El seed v0.3.1 ahora detecta esto y lo explica.) |
| 2 | Comando con el placeholder literal `TU-api.vercel.app` | Salió un JSON que parecía válido | Ese JSON en realidad salió de tu **localhost** (verificado: `tu-api.vercel.app` es un dominio ajeno que responde 404 — tu API no está ahí ni en ningún Vercel todavía). Los placeholders se reemplazan; si la salida "no pega" con la URL, desconfiar de la salida. |
| 3 | BD con schema v0.1 + API v0.3 | `502 PGRST204 'bundle'` | Al actualizar la API, revisar `supabase/migrations/`. `PGRST204` = "no existe esa columna/tabla" = schema desactualizado. |
| 4 | `ADMIN_TOKEN=Liz_Yuumi` pegado en el chat | — | Todo secreto que sale de tu máquina se rota. Generar → .env/Vercel → jamás al chat. |
| 5 | `POST /api/guides/[slug]/like` → `502 "Unexpected end of JSON input"`... ¡pero el like SÍ se guardaba! (encontrado el 2026-10-06 por el contract test de la Fase 5, en producción v0.3.1) | El botón de like recibía 502; al recargar, el like aparecía registrado igual | `setLike()` usa `Prefer: return=minimal` → PostgREST responde 201/204 **sin cuerpo**, y `req()` llamaba `r.json()` a ciegas: el throw ocurría DESPUÉS de la escritura exitosa. Cura en **v0.3.2**: tolerar cuerpo vacío (`lib/db.ts`). Lección: un 502 no siempre significa "no se hizo" — verificar el estado real antes de reintentar (el widget de la Fase 5 hace exactamente eso: si el voto falla, re-sincroniza con `GET /like` en vez de asumir). Regresión blindada: `npm test` (mock de PostgREST que reproduce el cuerpo vacío). |

Ninguno fue grave (por eso el sistema tiene preflight, health checks y
migraciones) — pero los cinco son exactamente los tropiezos clásicos del
primer despliegue. Ya están documentados y/o blindados. El #5 es especial:
lo encontró una prueba automática ANTES de que lo encontrara un lector.

---

## 5. Glosario mínimo

- **Deploy (despliegue):** Vercel toma tu repo, lo compila y lo sirve en una
  URL pública. Cada `git push` dispara un redeploy automático.
- **Environment variables:** configuración/secretos que la app lee en tiempo
  de ejecución. En Vercel: Settings → Environment Variables (cambiarlas exige
  redeploy). En local: archivo `.env` (ignorado por git).
- **Migración:** SQL que hace evolucionar el esquema de la BD sin perder datos
  (`supabase/migrations/NNN_*.sql`, se corren en orden en el SQL Editor).
- **Upsert:** insertar, o actualizar si la fila ya existe. Hace que sembrar
  sea idempotente: correrlo 1 o 20 veces deja la BD igual.
- **RLS (Row Level Security):** candado de Supabase/Postgres por fila. Acá:
  sin políticas públicas → sólo la secret key (o sea, sólo la API) entra.
- **PGRST204:** error de PostgREST = "no encuentro esa columna/tabla en el
  schema cache" → casi siempre, schema viejo o nombre mal escrito.
- **Preflight:** comprobación previa que falla rápido con mensaje claro antes
  de hacer el trabajo real (el seed la usa desde v0.3.1).

---

## 6. Cuando algo falle: orden de comprobación (60 segundos)

1. **¿A qué URL le estoy pegando?** ¿Web o API? ¿Local o producción?
   `curl -s <url>/api/health` — si responde HTML o 404 de Vercel, esa no es la API.
2. **¿La API está viva?** `ok:true` en health. Si no: §3.5 (env vars).
3. **¿La BD está al día?** En SQL Editor:
   `select column_name from information_schema.columns where table_name='guides';` → 11 columnas.
4. **¿Los secretos coinciden?** El `ADMIN_TOKEN` del `.env` local debe ser el
   MISMO que el de Vercel. La secret key de Supabase, la misma en ambos.
5. **`OPERACIONES.md` §7** — tabla de errores reales ya ocurridos, con solución.

---

*Última actualización: 2026-10-06 noche (v0.3.2) — despliegue completado y
verificado; error #5 (like 502) encontrado por el contract test de la Fase 5,
corregido y con test de regresión (`npm test`).*
