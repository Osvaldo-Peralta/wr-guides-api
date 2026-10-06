-- Migración 001 · 2026-10-06
-- Para: bases creadas con el schema.sql de v0.1.0 (antes de que existieran
-- title/version/bundle en la tabla guides).
--
-- SÍNTOMA que resuelve: al re-sembrar, la API devuelve
--   502 {"error":"upsert falló","detalle":"Supabase 400: PGRST204 ...
--   Could not find the 'bundle' column of 'guides' ..."}
--
-- CÓMO APLICARLA: Supabase Dashboard → SQL Editor → pegar TODO este
-- archivo → Run. Es idempotente: correrla dos veces no hace nada malo.
-- NO borra datos: sólo agrega columnas que faltan.

alter table public.guides add column if not exists title   text;
alter table public.guides add column if not exists version text;
alter table public.guides add column if not exists bundle  text;

-- Verificación: debe listar las 11 columnas de guides, incluyendo las 3 nuevas.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'guides'
order by ordinal_position;
