-- ═══════════════════════════════════════════════════════════════════════
-- WR-GUIDES-API · migración 002 — tabla guide_favorites (PREPARADA, NO APLICADA)
--
-- Estado: LISTA para V2 producto (favoritos anónimos). NO la corras todavía:
-- el código de V2 (endpoints + UI) aún no existe y una tabla huérfana solo
-- suma superficie. Cuando arranque V2: Supabase → SQL Editor → pegar → Run,
-- y los endpoints /api/guides/:slug/favorite salen espejando los de like.
--
-- Diseño espejo de guide_likes (misma filosofía):
--   · anónimo por visitor_id (UUID del localStorage del front, header
--     x-visitor-id) — sin cuentas, sin PII;
--   · UNIQUE (guide_id, visitor_id): 1 favorito por visitante y guía, toggle
--     add/remove idempotente con resolution=ignore-duplicates / DELETE;
--   · RLS activo SIN políticas anon: la única puerta es la service_role key
--     vía la API (defensa en profundidad, igual que el resto del esquema).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.guide_favorites (
  id         bigint generated always as identity primary key,
  guide_id   bigint not null references public.guides(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  unique (guide_id, visitor_id)
);

create index if not exists guide_favorites_guide_idx
  on public.guide_favorites (guide_id);
create index if not exists guide_favorites_visitor_idx
  on public.guide_favorites (visitor_id, created_at desc);

alter table public.guide_favorites enable row level security;

-- Extensión opcional del dashboard /admin cuando V2 viva:
--   select g.slug, count(f.id) as favs
--   from public.guides g
--   left join public.guide_favorites f on f.guide_id = g.id
--   group by g.slug order by favs desc;
