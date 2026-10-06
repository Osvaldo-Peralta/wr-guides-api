# 🧭 OPERACIONES — Runbook del ecosistema WR-GUIDES

> **Para qué existe este documento:** para que montar todo desde cero o hacer el
> día a día (agregar/modificar guías) sea mecánico, sin depender de memoria ni
> de chats perdidos. Si algo falla, la §7 (Solución de problemas) tiene los
> errores reales que ya ocurrieron y su cura.
>
> Convención: `TU-*` = valor tuyo que no vive en el repo. Los comandos asumen
> las rutas de tu máquina; si cambian, ajusta una vez y olvida.

---

## 1. Mapa del ecosistema (qué es cada cosa)

| Pieza | Repo | Qué hace | Dónde corre |
|---|---|---|---|
| **WR-LAB** | `Osvaldo-Peralta/wr-lab` | Motor analítico: validación legal, reportes MD/HTML, win rates, bundles | Tu PC (scripts Python) + GitHub Actions |
| **wr-guides-web** | `Osvaldo-Peralta/wr-guides-web` | El SITIO: Next.js estático que renderiza las guías MD | Vercel → `https://TU-web.vercel.app` |
| **wr-guides-api** | `Osvaldo-Peralta/wr-guides-api` | ESTADO dinámico: catálogo, vistas, likes | Vercel → `https://TU-api.vercel.app` |
| **Supabase** | — (panel web) | Base de datos Postgres (tablas: `guides`, `views`, `likes`) | Nube de Supabase (plan free) |

**Flujo de verdad (no romper):**
```
WR-LAB (autor + validación) ──MD/bundles──▶ wr-guides-web (contenido estático)
                                                     │
                                     guias_index.json (catálogo, lo genera el build)
                                                     │ seed
                                                     ▼
                              wr-guides-api ◀──vistas/likes── visitantes
                                     │
                                     ▼
                                 Supabase
```
- El **contenido** (texto de guías) NUNCA pasa por la BD: se compila en el web.
- La **BD** solo guarda: catálogo de referencia + contadores. Si la BD muere, el
  sitio sigue funcionando (sin contadores).

**Rutas en tu máquina:**
```
/home/morningstar/Proyectos/Sitio Web/wr-guides-web/
/home/morningstar/Proyectos/Sitio Web/wr-guides-api/
/home/morningstar/Proyectos/wr-lab/          (o donde tengas el lab)
```

---

## 2. Prerrequisitos (una sola vez por máquina/cuenta)

1. **Node.js ≥ 18** (`node -v`) — ya lo tienes (v26 ✓).
2. **Cuentas:** GitHub · Vercel (login con GitHub) · Supabase (login con GitHub).
3. **Proyecto Supabase** creado (plan Free) → anota:
   - `URL del proyecto` = `https://xxxxxxxx.supabase.co`
   - **Secret key** (Project Settings → API Keys → *Secret*) — empieza `sb_secret_…`
   - ⚠️ La *Publishable key* (`sb_publishable_…`) **NO sirve** para la API (la RLS
     la bloquea). Error clásico ya ocurrido — ver §7.
4. **Tablas creadas:** en Supabase → SQL Editor → pegar el contenido de
   `wr-guides-api/supabase/schema.sql` → Run. (Ya hecho ✓ — solo repetir si
   cambias de proyecto.)
5. **Vercel:** ambos repos importados (Add New → Project → elegir repo →
   Framework: Next.js, defaults) con sus variables (§3.4 y §3.5).

---

## 3. Montaje desde cero (paso a paso)

### 3.1 Clonar los repos
```bash
cd "/home/morningstar/Proyectos/Sitio Web"
git clone https://github.com/Osvaldo-Peralta/wr-guides-web.git
git clone https://github.com/Osvaldo-Peralta/wr-guides-api.git
```

### 3.2 Arrancar el web (local)
```bash
cd wr-guides-web
npm install
# El contenido vive en content/: guías .md + bundles/ + winrates.csv
# (Se sincronizan desde wr-lab/reportes/ — ver §4)
npm run build     # genera content/guias_index.json Y public/guias_index.json
npm run dev       # http://localhost:3000 → verificar que las guías se ven
```
✅ **Check:** abrir 2-3 guías, ver callouts y badges renderizados.

### 3.3 Arrancar la API (local)
```bash
cd ../wr-guides-api
npm install
cp .env.example .env.local
nano .env.local    # completar los 4 valores (ver abajo)
npm run dev        # http://localhost:3002
```
`.env.local` (ESTE ARCHIVO NUNCA SE COMMITEA — ya está en .gitignore):
```
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...        # la SECRET, no la publishable
ADMIN_TOKEN=genera-una-frase-larga-al-azar     # ej: salida de `openssl rand -hex 24`
ALLOWED_ORIGINS=https://TU-web.vercel.app,http://localhost:3000
```
✅ **Check:**
```bash
curl http://localhost:3002/api/health
# esperado: {"ok":true,"db":"supabase"}
#   db:"memory"  → faltan/mal las vars de Supabase
#   503 + aviso publishable → pusiste la key equivocada
```

### 3.4 Desplegar el web en Vercel
1. vercel.com → Add New Project → `wr-guides-web` → Deploy (sin env vars).
2. Cuando termine: abrir `https://TU-web.vercel.app` → revisar home + 1 guía.
3. ✅ **Check clave:** `https://TU-web.vercel.app/guias_index.json` debe responder
   JSON (es el catálogo que consume la siembra).

### 3.5 Desplegar la API en Vercel
1. Add New Project → `wr-guides-api` → ANTES de Deploy, cargar en
   *Environment Variables*:
   | Nombre | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | la **secret** key |
   | `ADMIN_TOKEN` | el MISMO token del `.env.local` |
   | `ALLOWED_ORIGINS` | `https://TU-web.vercel.app` (+ `http://localhost:3000` si quieres probar local contra la API prod) |
2. Deploy → abrir `https://TU-api.vercel.app/api/health`
   → esperado `{"ok":true,"db":"supabase"}`.

### 3.6 Sembrar el catálogo (17 guías → BD)
**Modo producción (recomendado — 1 sola terminal, nada que arrancar):**
```bash
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api"
WR_API=https://TU-api.vercel.app ADMIN_TOKEN=TU-ADMIN_TOKEN node scripts/seed-guides.mjs
# el índice se descarga solo de https://TU-web.vercel.app/guias_index.json
# esperado: "sembrando 17 guías..." → "OK: 17 guías sembradas/actualizadas"
```
**Modo local (2 terminales — solo si la API prod no existe aún):**
```bash
# Terminal 1:
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api" && npm run dev
# Terminal 2 (MISMO directorio wr-guides-api, NO wr-guides-web):
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api"
WR_API=http://localhost:3002 ADMIN_TOKEN=EL-MISMO-DEL-.env.local node scripts/seed-guides.mjs
```
✅ **Check:**
```bash
curl https://TU-api.vercel.app/api/guides | head -c 200      # lista con tus guías
curl https://TU-api.vercel.app/api/guides/jinx/stats          # {"slug":"jinx","views":0,"likes":0}
```

### 3.7 Verificación final del montaje
- [ ] `TU-web.vercel.app` muestra las guías (17/17).
- [ ] `TU-web.vercel.app/guias_index.json` responde.
- [ ] `TU-api.vercel.app/api/health` → `ok:true, db:supabase`.
- [ ] `/api/guides` lista las guías sembradas.
- [ ] `/api/guides/jinx/stats` responde ceros.
- [ ] `git status` en ambos repos: limpio, **sin `.env.local` listado**.

---

## 4. PROCESO REPETIDO: agregar o modificar una guía

> Este es el flujo del día a día. Origen de verdad = **wr-lab** (ahí se escribe
> y valida la guía). El web y la BD son consumidores.

### 4.1 En el lab (escribir/validar/aprobar)
```bash
cd /ruta/a/wr-lab
# ... edición del reporte (a mano o vía chat externo) ...
python3 model/lint_reportes.py            # estructura y legalidad
python3 model/update_reports.py triage    # ¿qué cambió?
python3 model/update_reports.py annotate --slug SLUG
# prueba en navegador: abrir reportes/SLUG.html (bundle)
python3 model/update_reports.py aprobar --slug SLUG   # status: aprobado + fecha
python3 model/build_bundles.py            # regenera TODOS los bundles (barato)
python3 -m unittest discover tests -q     # 154 OK
git add -A && git commit -m "guía: SLUG vX" && git push
```

### 4.2 Sincronizar al web
```bash
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-web"
# copiar la guía aprobada y sus recursos (mientras no exista la Action de la Fase 6):
cp /ruta/a/wr-lab/reportes/SLUG.md        content/guias/SLUG.md
cp /ruta/a/wr-lab/reportes/SLUG.html      content/bundles/SLUG.html
cp /ruta/a/wr-lab/data/estructurada/win_rates.csv content/winrates.csv   # si hubo fetch_meta
npm run build        # regenera los índices (content/ y public/)
npm run dev          # REVISAR la guía nueva en http://localhost:3000/guias/SLUG
git add -A && git commit -m "contenido: SLUG vX" && git push
# Vercel redeploya solo (1-2 min). Verificar en producción:
#   https://TU-web.vercel.app/guias/SLUG
#   https://TU-web.vercel.app/guias_index.json  (debe incluir la guía nueva)
```

### 4.3 Re-sembrar el catálogo en la API
```bash
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api"
WR_API=https://TU-api.vercel.app ADMIN_TOKEN=TU-ADMIN_TOKEN node scripts/seed-guides.mjs
```
- Es **idempotente**: correrlo de más no rompe nada (upsert por slug).
- Solo actualiza el catálogo de referencia (patch/status/bundle). Los contadores
  de vistas/likes **no se tocan**.
- Si el deploy de Vercel aún no terminó, el índice descargado será el viejo:
  esperar y repetir (por eso el check del `guias_index.json` en §4.2).

### 4.4 Resumen express (para pegar en la pared)
```
LAB: editar → lint → annotate → aprobar → bundles → tests → push
WEB: cp guía+bundle → build → revisar local → push → esperar deploy
API: seed (1 comando) → curl /api/guides/NUEVA/stats
```

---

## 5. Actualización de patch (win rates)

```bash
cd /ruta/a/wr-lab
python3 model/fetch_meta.py --write        # datos de wildstats.io → win_rates.csv
python3 model/update_reports.py triage     # qué reportes quedaron desactualizados
# ... ciclo por reporte (annotate/refresh, ver §4.1) ...
python3 model/build_bundles.py && python3 -m unittest discover tests -q
git add -A && git commit -m "datos: win rates patch X.Y" && git push
# luego §4.2 (copiar winrates.csv al web) + §4.3
```

---

## 6. Comprobaciones de salud (periódicas / antes de cada fase)

```bash
# 1. API viva y conectada:
curl https://TU-api.vercel.app/api/health          # → ok:true, db:"supabase"
# 2. Catálogo completo:
curl -s https://TU-api.vercel.app/api/guides | grep -o '"slug"' | wc -l   # → 17 (o las que haya)
# 3. Web sirve el índice:
curl -s -o /dev/null -w "%{http_code}\n" https://TU-web.vercel.app/guias_index.json  # → 200
# 4. Punta a punta (vista + like de prueba contra prod):
curl -s -X POST https://TU-api.vercel.app/api/guides/jinx/view -H "x-visitor-id: smoke-test-1"
curl -s -X POST https://TU-api.vercel.app/api/guides/jinx/like -H "Content-Type: application/json" -H "x-visitor-id: smoke-test-1" -d '{"action":"like"}'
curl -s https://TU-api.vercel.app/api/guides/jinx/stats    # → views:1, likes:1
# (limpiar luego desde Supabase → Table Editor → views/likes → borrar filas de "smoke-test-1")
# 5. Secretos fuera de git:
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api" && git status --short   # .env.local NO debe aparecer
git log --all --oneline -- .env.local                                            # sin resultados = jamás commiteado
```

---

## 7. Solución de problemas (errores REALES ya ocurridos)

| Síntoma | Causa | Cura |
|---|---|---|
| `Cannot find module '.../wr-guides-web/scripts/seed-guides.mjs'` | El script vive en **wr-guides-api**, no en el web | `cd ../wr-guides-api` y correr desde ahí |
| El seed "funciona" pero `/api/guides/jinx/stats` → 404 | `WR_API` apuntaba al **web** (3000/3001), que no tiene API; el 200 era la home | `WR_API=http://localhost:3002` (o la URL de la API) |
| `/api/health` → 503 con aviso "publishable/anon" | Usaste la **Publishable key** | Project Settings → API Keys → **Secret key** (`sb_secret_…`) en `.env.local` y en Vercel |
| `/api/health` → `db:"memory"` en local | Faltan `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`, o el server arrancó antes de crearlo | Completar el `.env.local` y **reiniciar** `npm run dev` (las vars se leen al arrancar) |
| Seed → `HTTP 500` al **repetirlo** (la 1ª vez funcionó) | Bug ya corregido (v0.3): upsert sin `on_conflict` explícito; la tabla tiene 2 únicas (id+slug) | Actualizar la API (`git pull` + redeploy). Re-sembrar es seguro desde v0.3 |
| Seed → 401 | `ADMIN_TOKEN` del comando ≠ el del `.env.local`/Vercel | Usar exactamente el mismo string en ambos lados |
| Seed → "0 guías sembradas" | El `guias_index.json` descargado es viejo (deploy de Vercel sin terminar) o el índice local no existe | Esperar el deploy; o pasar `--index /ruta/absoluta/wr-guides-web/content/guias_index.json` |
| `npm run dev` dice puerto ocupado / cambios que no aparecen | Server **zombi** de una sesión anterior | `pkill -f "next-server"`; si persiste: `ss -tlnp \| grep 3002` → `kill -9 <PID>` |
| Vercel build del web falla en `gen-index` | Faltan guías/bundles en `content/` | Verificar que la copia desde el lab incluyó `.md` + `.html` + `winrates.csv` |
| La API prod responde 503 `db_unavailable` | Env vars no cargadas en Vercel (o cargadas DESPUÉS del deploy) | Settings → Environment Variables → verificar las 3 → **Redeploy** |

**Regla de oro del debugging:** leer SIEMPRE el cuerpo JSON de la respuesta
(`curl -i ...`), no solo el código HTTP — desde v0.3 los errores traen `detalle`
con el mensaje real de la BD.

---

## 8. Seguridad (innegociables)

1. La **secret key** y el **ADMIN_TOKEN** NUNCA van a: chat, commits, issues,
   capturas de pantalla. Solo `.env.local` (gitignored) y Vercel → Env Vars.
2. Verificar cada tanto: `git log --all --oneline -- .env.local` → vacío.
3. Si un secreto se filtró: Supabase → API Keys → **rotar**; cambiar ADMIN_TOKEN
   en `.env.local` + Vercel; redeployar.
4. La secret key bypasea RLS: es solo para el servidor (Vercel/tu dev local).
   El navegador NUNCA la ve — el widget de la Fase 5 habla con TU API, no con
   Supabase.

---

*v1.0 — 2026-10-05 · Cubre: montaje desde cero, flujo diario de guías, health
checks, troubleshooting de errores reales, seguridad. Actualizar este archivo
cuando cambie el flujo (es parte del repo: vive junto a la API).*
