# 🧭 OPERACIONES — Runbook del ecosistema WR-GUIDES

> **Para qué existe este documento:** para que montar todo desde cero o hacer el
> día a día (agregar/modificar guías) sea mecánico, sin depender de memoria ni
> de chats perdidos. Si algo falla, la §7 (Solución de problemas) tiene los
> errores reales que ya ocurrieron y su cura.
>
> Convención: `TU-*` = valor tuyo que no vive en el repo. Los comandos asumen
> las rutas de tu máquina; si cambian, ajusta una vez y olvida.
>
> 🐣 **¿Primera vez desplegando en Vercel + Supabase?** Empezá por
> [`docs/PRIMER-DESPLEGUE.md`](docs/PRIMER-DESPLEGUE.md) — guía personal paso
> a paso escrita tras el incidente del 2026-10-06 (modelo mental de las 3
> piezas, migraciones, rotación de secretos, despliegue click a click).

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
WR_API=https://TU-api.vercel.app/ npm run seed
# v0.3.1+: el ADMIN_TOKEN se lee SOLO del .env.local/.env (no lo pegues en el
# comando — queda en el historial y en los chats). Preflight verifica que la
# URL sea realmente la API antes de escribir nada.
# el índice se descarga solo de https://TU-web.vercel.app/guias_index.json
# esperado: "✓ API confirmada..." → "✔ OK: 17 guías sembradas/actualizadas"
```
**Modo local (2 terminales — solo si la API prod no existe aún):**
```bash
# Terminal 1:
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api" && npm run dev
# Terminal 2 (MISMO directorio wr-guides-api, NO wr-guides-web):
cd "/home/morningstar/Proyectos/Sitio Web/wr-guides-api"
WR_API=http://localhost:3002/ npm run seed
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
# URLs reales del sistema (verificadas 2026-10-06):
#   API: https://wr-guides-api.vercel.app   ·   Web: https://wr-guides-web.vercel.app

# 1. API viva y conectada:
curl https://wr-guides-api.vercel.app/api/health          # → ok:true, db:"supabase"
# 2. Catálogo completo:
curl -s https://wr-guides-api.vercel.app/api/guides | grep -o '"slug"' | wc -l   # → 17 (o las que haya)
# 3. Web sirve el índice:
curl -s -o /dev/null -w "%{http_code}\n" https://wr-guides-web.vercel.app/guias_index.json  # → 200
# 4. Punta a punta (vista + like de prueba contra prod):
curl -s -X POST https://wr-guides-api.vercel.app/api/guides/jinx/view -H "x-visitor-id: $(uuidgen)"
#    ↑ con v0.3.1 este POST like devolvía 502 "Unexpected end of JSON input" (§7, última fila):
curl -s -X POST https://wr-guides-api.vercel.app/api/guides/jinx/like -H "Content-Type: application/json" -H "x-visitor-id: $(uuidgen)" -d '{"action":"like"}'
#    ↑ esperado desde v0.3.2: {"liked":true,"likes":N} — si ves 502, el deploy es viejo
curl -s https://wr-guides-api.vercel.app/api/guides/jinx/stats
# (limpiar luego desde Supabase → Table Editor → views/likes → borrar las filas de prueba)
# 5. Test de regresión local del ciclo view/like (mock de PostgREST, sin tocar prod):
npm test                                                   # → 9/9 verdes
# 6. Secretos fuera de git:
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
| Seed → `502` con `PGRST204: Could not find the 'X' column` (2026-10-06: `'bundle'`) | La BD tiene **schema viejo**: se creó con una versión anterior de `schema.sql` y la API nueva envía columnas que no existen | Correr en SQL Editor la migración `supabase/migrations/001_add_title_version_bundle.sql` (idempotente, no borra datos) y re-sembrar. Costumbre: tras `git pull` de la API, revisar si hay migraciones nuevas |
| Seed → `✗ <url> devolvió HTML: eso NO es la API` (o `✗ 404 {}` en versiones viejas) | `WR_API` apunta a la **web** o a un dominio ajeno (p. ej. placeholder literal `TU-api.vercel.app`) | `WR_API` = URL del proyecto **wr-guides-api** (local: `http://localhost:3002/`). Desde v0.3.1 el seed hace preflight y lo detecta antes de escribir nada |
| Seed → "0 guías sembradas" | El `guias_index.json` descargado es viejo (deploy de Vercel sin terminar) o el índice local no existe | Esperar el deploy; o pasar `--index /ruta/absoluta/wr-guides-web/content/guias_index.json` |
| `npm run dev` dice puerto ocupado / cambios que no aparecen | Server **zombi** de una sesión anterior | `pkill -f "next-server"`; si persiste: `ss -tlnp \| grep 3002` → `kill -9 <PID>` |
| Vercel build del web falla en `gen-index` | Faltan guías/bundles en `content/` | Verificar que la copia desde el lab incluyó `.md` + `.html` + `winrates.csv` |
| La API prod responde 503 `db_unavailable` | Env vars no cargadas en Vercel (o cargadas DESPUÉS del deploy) | Settings → Environment Variables → verificar las 3 → **Redeploy** |
| `POST .../like` → `502 {"error":"fallo de BD","detalle":"Unexpected end of JSON input"}` **pero el like/unlike sí se guardaba** (visto en prod v0.3.1, 2026-10-06) | `setLike()` usa `Prefer: return=minimal` → PostgREST responde 201/204 con **cuerpo vacío**; `req()` llamaba `r.json()` incondicional y el throw ocurría DESPUÉS de la escritura exitosa | Actualizar a **v0.3.2** (`lib/db.ts` tolera cuerpo vacío) + redeploy. Regresión blindada: `npm test` (mock de PostgREST, 9/9). Cliente robusto: el widget de la web re-sincroniza con `GET /like` si el POST falla, nunca asume |

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

## 9. Dashboard privado /admin (Fase 8)

**URL:** `https://TU-api.vercel.app/admin` · **contraseña:** el valor de
`ADMIN_TOKEN` (usuario: cualquiera, p. ej. `admin`). El navegador muestra el
prompt de Basic Auth y lo recuerda por sesión; para probar de cero, ventana
incógnito.

**Qué muestra** (todo server-side, sin JS cliente):
· KPIs: vistas totales · likes totales · visitantes únicos · guías sembradas · tasa de like (likes c/100 vistas)
· Serie de 14 días (barras rosa=vistas, cian=likes; días sin actividad en 0)
· Tabla por guía (con link al sitio) y por campeón
· Actividad reciente (últimos 12 eventos view/like con tiempo relativo)

**Variantes de acceso:**
```bash
# JSON crudo (debugging / scripting):
curl -u admin:TU_ADMIN_TOKEN https://TU-api.vercel.app/api/admin/stats
```

**Reglas y límites conocidos:**
1. La auth es Basic Auth simple (plan §Fase 8: "contraseña simple" como paso
   inicial). Si el panel dejara de ser solo tuyo, subir de nivel: sesión con
   expiración o Vercel Password Protection encima.
2. `ADMIN_TOKEN` es la única llave: rotalo como siempre (§8) y el panel queda
   protegido con el nuevo valor automáticamente.
3. Lecturas paginadas de a 1000 eventos: con miles de vistas/día el panel
   seguirá funcionando, pero si algún día pesa, mover agregación a SQL
   (hoja de ruta V4 en docs/ROADMAP-V2-V4.md).
4. El panel NO duplica Vercel Analytics: países/dispositivos/referentes viven
   allá (Fase 7 del web); acá solo estado de comunidad (Supabase).

**Si algo falla:**
· 503 en /admin → falta `ADMIN_TOKEN` en el proyecto API de Vercel.
· Panel con mensaje de error de BD → falta la función `guide_stats()` en
   Supabase (corré `supabase/schema.sql` o revisá que la base sea la correcta).
· Números en 0 con sitio activo → el seed no incluye guías nuevas: corrido
   manual de `npm run seed` o el re-seed automático del sync (Fase 6 del web).

## 10. Uptime y keep-alive (cron 6 h)

**Qué corre:** `.github/workflows/uptime-keepalive.yml` (cada 6 h, minuto 17,
+ botón manual). Hace 5 chequeos externos (health, catálogo, stats, home web,
guía web) y de paso mantiene Supabase Free despierto: el chequeo de catálogo
es una query real a la BD, y el plan Free pausa tras 7 días sin actividad.

**Alertas sin spam:** si algo falla → issue etiquetado `uptime` (máximo uno
abierto a la vez). Cuando todo vuelve al verde → el mismo cron comenta
"recuperado" y cierra el issue. Historial visual: pestaña Actions, run verde/rojo.

**Si ves un issue `uptime` abierto:**
1. Abrí el run linkeado en el issue → mirá cuál chequeo falló y su detalle.
2. `db="none"` en health → se cayeron las env vars de Supabase en Vercel (§3.5).
3. Web caída pero API viva → deploy del web roto: Vercel → último deploy → logs.
4. Todo verde de nuevo → el cron cierra el issue solo en la próxima corrida
   (o cerralo a mano, no pasa nada).

**Keep-alive manual (si el cron estuviera deshabilitado):** cualquier request
a `GET /api/guides` toca Supabase; con uno por semana basta para evitar la
pausa, pero dejá el cron: también es tu alarma de incendios.

*v1.3 — 2026-10-08 · Cubre: montaje desde cero, flujo diario de guías, health
checks (con URLs reales + `npm test`), troubleshooting de errores reales (incl.
el like 502 de v0.3.1), dashboard /admin (Fase 8), seguridad. Actualizar este archivo cuando cambie el
flujo (es parte del repo: vive junto a la API).*
