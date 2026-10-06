-- ═══════════════════════════════════════════════════════════════════════
-- WR-GUIDES-API · Fase 4 — esquema Supabase (v0.3)
-- Cómo aplicar: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- Principios del plan: la BD almacena ESTADO, no contenido (los reportes
-- siguen siendo Markdown en el repo); RLS activo en todas las tablas;
-- el backend usa la SECRET key (nunca se expone al navegador) y por eso
-- NO hay políticas para anon: la única puerta de entrada es la API.
--
-- ⚠️ ¿Tu base YA existe de una versión anterior? CREATE TABLE IF NOT
-- EXISTS no agrega columnas nuevas a tablas existentes. Revisá
-- supabase/migrations/ y corré las que falten (p. ej. 001 agrega
-- title/version/bundle a bases creadas con el schema v0.1).
-- ═══════════════════════════════════════════════════════════════════════

-- Tabla de guías (referencia ligera — el contenido vive en Markdown)
create table if not exists public.guides (
  id           bigint generated always as identity primary key,
  slug         text unique not null,
  champion     text,
  role         text,
  patch        text,
  status       text,
  title        text,
  version      text,
  bundle       text,
  published_at date,
  created_at   timestamptz not null default now()
);

-- Vistas (una fila por vista válida; dedupe de 1 h por visitante en la API)
create table if not exists public.guide_views (
  id         bigint generated always as identity primary key,
  guide_id   bigint not null references public.guides(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists guide_views_guide_idx
  on public.guide_views (guide_id, created_at desc);
create index if not exists guide_views_dedupe_idx
  on public.guide_views (guide_id, visitor_id, created_at desc);

-- Likes (anónimos en v1; UNIQUE = 1 like por visitante y guía)
create table if not exists public.guide_likes (
  id         bigint generated always as identity primary key,
  guide_id   bigint not null references public.guides(id) on delete cascade,
  visitor_id text not null,
  created_at timestamptz not null default now(),
  unique (guide_id, visitor_id)
);

-- RLS activo en las tres tablas, SIN políticas para anon/authenticated:
-- solo la secret key (backend) puede leer/escribir. Defensa en profundidad.
alter table public.guides      enable row level security;
alter table public.guide_views enable row level security;
alter table public.guide_likes enable row level security;

-- Función agregada para el dashboard /admin (Fase 8) y debugging rápido:
-- select * from public.guide_stats();
create or replace function public.guide_stats()
returns table(slug text, champion text, views bigint, likes bigint)
language sql stable
as $$
  select g.slug, g.champion,
         (select count(*) from public.guide_views v where v.guide_id = g.id) as views,
         (select count(*) from public.guide_likes l where l.guide_id = g.id) as likes
  from public.guides g
  order by views desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Verificación post-instalación (opcional, en SQL Editor):
--   select table_name from information_schema.tables
--   where table_schema='public';                        → 3 tablas
--   select column_name from information_schema.columns
--   where table_name='guides' order by ordinal_position; → 11 columnas
--   select relname, relrowsecurity from pg_class
--   where relname in ('guides','guide_views','guide_likes');  → RLS = true ×3
-- Sembrado de guías: desde wr-guides-api → npm run seed
-- (lee guias_index.json del frontend y hace upsert por slug — idempotente)
-- ═══════════════════════════════════════════════════════════════════════
