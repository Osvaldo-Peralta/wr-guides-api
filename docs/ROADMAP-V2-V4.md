# Hoja de ruta V2–V4 — evolución del ecosistema WR-GUIDES

**Versión:** 1.0 · **Fecha:** 2026-10-07 · **Estado:** propuesta (entregable de la Fase 8 del plan de migración)

La migración quedó COMPLETA con la Fase 8 (dashboard `/admin` en wr-guides-api).
Este documento ordena lo que viene por valor/esfuerzo, respetando los principios
del plan (`wr-lab/deploy/PLAN_MIGRACION_VERCEL.md` §5: no meter BD en el lab, no
abandonar Markdown, no mezclar front y backend, migración incremental, planes
gratuitos).

---

## V2 — Identidad ligera y guardados (siguiente paso natural)

**Objetivo:** que el lector pueda volver a "sus" guías sin registrar cuenta.

1. **Favoritos anónimos:** reusar el `visitor_id` existente: tabla
   `guide_favorites (guide_id, visitor_id, created_at, UNIQUE(guide_id, visitor_id))`
   + endpoints `/api/guides/:slug/favorite` (toggle) espejo del de likes.
   Esfuerzo bajo: copia el patrón de `guide_likes` casi línea por línea.
2. **"Continuar leyendo":** el web guarda slugs visitados en `localStorage`
   (sin tocar la API) → sección "Tus guías recientes" en la home. Cero backend.
3. **Cuentas reales (Supabase Auth):** SOLO si aparece una necesidad concreta
   (p. ej. comentarios moderados o sync entre dispositivos). Coste: flujo de
   email mágico, tabla `profiles`, migrar likes a `user_id` con backfill por
   visitor_id. No hacerlo "por si acaso".

**Criterio de entrada:** el panel `/admin` muestra que una fracción relevante
de visitantes vuelve (visitantes únicos vs vistas repetidas) → ahí el guardado
tiene público.

## V3 — Conversación alrededor de las guías

1. **Comentarios por guía** (tabla `guide_comments`, anonimos-con-display-name
   o atados a V2-cuentas), con cola de moderación en `/admin`.
2. **Historial de builds por guía:** el lab ya versiona (`version:` en
   frontmatter); exponer en el web un changelog por guía leyendo el historial
   git del repo (sin BD nueva).
3. **Feedback estructurado:** "¿qué sección te sirvió?" (1 click, evento
   `guide_section_helpful` en Vercel Analytics) para priorizar reescrituras.

**Criterio de entrada:** moderación resuelta ANTES de abrir comentarios
(simplemente: sin moderación no hay comentarios).

## V4 — Analytics avanzado y experimentos

1. **Agregación en SQL:** vistas/likes por día materializados (materialized
   view o tabla `daily_rollup` mantenida por pg_cron/Edge Function) cuando el
   conteo crudo de eventos supere ~100k filas (hoy: paginación de a 1000 en
   `lib/db.ts` aguanta de sobra).
2. **Series por parche:** cruzar `guides.patch` con la serie diaria → "qué
   parche trajo más lectores". Requiere rollup (punto 1).
3. **Experimentos editoriales:** A/B de títulos/estructura de guía midiendo
   con eventos custom de Vercel Analytics (ya instrumentado en Fase 7).
4. **Alertas:** cron en wr-guides-api que compare win rates del índice contra
   las sembradas y avise (email/Telegram) si una guía publicada queda
   `REGENERAR` según el lab (hoy eso lo detecta el sync Fase 6 al espejar,
   pero no notifica).

## Lo que NO está en la ruta (y por qué)

- **App móvil / PWA con offline:** el sitio ya es estático y liviano; el valor
  marginal no justifica el mantenimiento.
- **Rankings "en vivo" de la comunidad** (votación de builds): choca con el
  principio "el lab es la fuente de verdad matemática"; la comunidad opina con
  likes, no con builds alternativas sin validar.
- **Multi-idioma:** audiencia actual es ES; traducir guías duplica el esfuerzo
  editorial del lab por guía.

---

## Próximo trabajo FUERA de la ruta de datos

**Rediseño de experiencia/interfaz del sitio (wr-guides-web):** con la
migración cerrada, el siguiente proyecto grande es UX: navegación por
campeón/rol/arquetipo, búsqueda, resumen ejecutivo plegable por sección,
comparador de builds y modo de lectura. Base lista: sistema de temas con
variables CSS (Fase 5-Jinx) hace que cualquier rediseño sea re-tematizable sin
tocar contenido. Se planifica aparte, con su propio documento.
