// WR-GUIDES-API · lib/db.ts — capa de datos (puerto hexagonal)
// Implementación Supabase (PostgREST con service_role) + implementación en
// memoria para desarrollo local sin credenciales (NUNCA activa en producción:
// sin SUPABASE_URL y NODE_ENV=production → la API responde 503).
export interface GuideRow {
  id?: number;
  slug: string;
  champion: string | null;
  role: string | null;
  patch: string | null;
  status: string | null;
  title?: string | null;
  version?: string | null;
  bundle?: string | null;
  published_at: string | null;
}

export interface Db {
  kind: "supabase" | "memory";
  listGuides(): Promise<GuideRow[]>;
  getGuide(slug: string): Promise<GuideRow | null>;
  upsertGuides(rows: GuideRow[]): Promise<number>;
  addView(guideId: number, visitorId: string): Promise<boolean>; // false = dedupe
  countViews(guideId: number): Promise<number>;
  setLike(guideId: number, visitorId: string, liked: boolean): Promise<void>;
  getLike(guideId: number, visitorId: string): Promise<boolean>;
  countLikes(guideId: number): Promise<number>;
  adminOverview(): Promise<AdminOverview>; // Fase 8: dashboard /admin
}

// ── Fase 8: forma del overview que consume /admin y /api/admin/stats ──
export interface AdminOverview {
  generado: string; // ISO utc
  db: "supabase" | "memory";
  totals: { views: number; likes: number; visitantes: number; guias: number };
  porGuia: { slug: string; champion: string | null; role: string | null; views: number; likes: number }[];
  porCampeon: { champion: string; views: number; likes: number; guias: number }[];
  diario: { dia: string; views: number; likes: number }[]; // últimos 14 días UTC (incluye ceros)
  recientes: { tipo: "view" | "like"; slug: string; at: string }[]; // últimos 12 eventos
}

const VIEW_DEDUPE_MS = 60 * 60 * 1000; // 1 h

// ─────────────────────────────── Supabase (PostgREST) ───────────────────────
function supabaseDb(url: string, key: string): Db {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  async function req(path: string, init?: RequestInit): Promise<any> {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, Prefer: "return=representation", ...(init?.headers || {}) },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    // v0.3.2: con Prefer return=minimal PostgREST responde 201/204 SIN cuerpo.
    // r.json() incondicional lanzaba "Unexpected end of JSON input" DESPUÉS de
    // que la escritura ya había impactado en la BD → like/unlike devolvían 502
    // aunque el cambio persistía (bug real de producción, 2026-10-06, detectado
    // por el contract test de la Fase 5). Con return=representation el cuerpo
    // nunca es vacío; el ?? [] cubre ambos casos.
    const text = await r.text();
    return text ? JSON.parse(text) : [];
  }
  return {
    kind: "supabase",
    async listGuides() {
      return req("guides?select=*&order=slug.asc");
    },
    async getGuide(slug) {
      const rows = await req(`guides?slug=eq.${encodeURIComponent(slug)}&limit=1`);
      return rows[0] ?? null;
    },
    async upsertGuides(rows) {
      // on_conflict=slug EXPLÍCITO: la tabla tiene 2 restricciones únicas (id PK + slug);
      // sin el target, PostgREST falla al re-sembrar ("no unique or exclusion constraint
      // matching the ON CONFLICT specification"). Con él, la siembra es idempotente.
      const out = await req("guides?on_conflict=slug", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify(rows),
      });
      return out.length;
    },
    async addView(guideId, visitorId) {
      const since = new Date(Date.now() - VIEW_DEDUPE_MS).toISOString();
      const prev = await req(
        `guide_views?guide_id=eq.${guideId}&visitor_id=eq.${encodeURIComponent(visitorId)}&created_at=gte.${since}&limit=1&select=id`
      );
      if (prev.length) return false;
      await req("guide_views", {
        method: "POST",
        body: JSON.stringify({ guide_id: guideId, visitor_id: visitorId }),
      });
      return true;
    },
    async countViews(guideId) {
      const r = await fetch(
        `${url}/rest/v1/guide_views?guide_id=eq.${guideId}&select=id&limit=1`,
        { headers: { ...headers, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" }
      );
      const range = r.headers.get("content-range") || "";
      return Number(range.split("/")[1] || 0);
    },
    async setLike(guideId, visitorId, liked) {
      if (liked) {
        await req("guide_likes", {
          method: "POST",
          headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
          body: JSON.stringify({ guide_id: guideId, visitor_id: visitorId }),
        });
      } else {
        await req(
          `guide_likes?guide_id=eq.${guideId}&visitor_id=eq.${encodeURIComponent(visitorId)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        );
      }
    },
    async getLike(guideId, visitorId) {
      const rows = await req(
        `guide_likes?guide_id=eq.${guideId}&visitor_id=eq.${encodeURIComponent(visitorId)}&limit=1&select=id`
      );
      return rows.length > 0;
    },
    async countLikes(guideId) {
      const r = await fetch(
        `${url}/rest/v1/guide_likes?guide_id=eq.${guideId}&select=id&limit=1`,
        { headers: { ...headers, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" }
      );
      const range = r.headers.get("content-range") || "";
      return Number(range.split("/")[1] || 0);
    },
    // Fase 8: overview agregado para /admin. Una sola pasada de lecturas:
    // guías + rpc guide_stats() + eventos crudos (paginados de a 1000).
    async adminOverview() {
      const guides: GuideRow[] = await req("guides?select=*&order=slug.asc");
      const stats: { slug: string; champion: string | null; views: number; likes: number }[] =
        await req("rpc/guide_stats", { method: "POST", body: "{}" });
      const views = await fetchAll(
        "guide_views?select=guide_id,visitor_id,created_at&order=created_at.desc"
      );
      const likes = await fetchAll(
        "guide_likes?select=guide_id,visitor_id,created_at&order=created_at.desc"
      );
      return construirOverview("supabase", guides, stats, views, likes);
    },
  };

  // Paginación defensiva: PostgREST corta a 1000 filas por request; el dashboard
  // sigue funcionando cuando el sitio escale (content-range da el total).
  async function fetchAll(path: string): Promise<any[]> {
    const out: any[] = [];
    let offset = 0;
    for (;;) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await fetch(`${url}/rest/v1/${path}${sep}limit=1000&offset=${offset}`, {
        headers: { ...headers, Prefer: "count=exact" },
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      const rows: any[] = await r.json();
      out.push(...rows);
      const total = Number((r.headers.get("content-range") || "").split("/")[1] || out.length);
      offset += rows.length;
      if (rows.length < 1000 || offset >= total) return out;
    }
  }
}

// ─────────────────────────────── Memoria (dev local) ────────────────────────
function memoryDb(): Db {
  const guides = new Map<string, GuideRow & { id: number }>();
  const views: { guideId: number; visitorId: string; at: number }[] = [];
  const likes = new Map<string, { at: number }>();
  let nextId = 1;
  const likeKey = (g: number, v: string) => `${g}|${v}`;
  return {
    kind: "memory",
    async listGuides() {
      return [...guides.values()].sort((a, b) => a.slug.localeCompare(b.slug));
    },
    async getGuide(slug) {
      return guides.get(slug) ?? null;
    },
    async upsertGuides(rows) {
      for (const r of rows) {
        const ex = guides.get(r.slug);
        guides.set(r.slug, { ...r, id: ex?.id ?? nextId++ });
      }
      return rows.length;
    },
    async addView(guideId, visitorId) {
      const now = Date.now();
      if (views.some((v) => v.guideId === guideId && v.visitorId === visitorId && now - v.at < VIEW_DEDUPE_MS))
        return false;
      views.push({ guideId, visitorId, at: now });
      return true;
    },
    async countViews(guideId) {
      return views.filter((v) => v.guideId === guideId).length;
    },
    async setLike(guideId, visitorId, liked) {
      if (liked) likes.set(likeKey(guideId, visitorId), { at: Date.now() });
      else likes.delete(likeKey(guideId, visitorId));
    },
    async getLike(guideId, visitorId) {
      return likes.has(likeKey(guideId, visitorId));
    },
    async countLikes(guideId) {
      return [...likes.keys()].filter((k) => k.startsWith(`${guideId}|`)).length;
    },
    async adminOverview() {
      const gs = [...guides.values()];
      const stats = gs.map((g) => ({
        slug: g.slug,
        champion: g.champion,
        views: views.filter((v) => v.guideId === g.id).length,
        likes: [...likes.keys()].filter((k) => k.startsWith(`${g.id}|`)).length,
      }));
      const vRows = views
        .slice()
        .sort((a, b) => b.at - a.at)
        .map((v) => ({ guide_id: v.guideId, visitor_id: v.visitorId, created_at: new Date(v.at).toISOString() }));
      const lRows = [...likes.entries()]
        .map(([k, val]) => {
          const [g] = k.split("|").map(Number);
          return { guide_id: g, visitor_id: k.split("|")[1], created_at: new Date(val.at).toISOString() };
        })
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return construirOverview("memory", gs, stats, vRows, lRows);
    },
  };
}

// ─────────── Fase 8: agregación compartida (Supabase y memoria) ───────────
// Recibe filas CRUDAS de eventos (guide_views / guide_likes con created_at ISO)
// y el resultado de guide_stats(); arma totales, tablas y serie de 14 días.
function construirOverview(
  kind: "supabase" | "memory",
  guides: GuideRow[],
  stats: { slug: string; champion: string | null; views: number; likes: number }[],
  views: { guide_id: number; visitor_id: string; created_at: string }[],
  likes: { guide_id: number; visitor_id: string; created_at: string }[]
): AdminOverview {
  const rolPorSlug = new Map(guides.map((g) => [g.slug, g.role ?? null]));
  const slugPorId = new Map(guides.map((g) => [g.id, g.slug]));

  const porGuia = stats
    .map((s) => ({ ...s, role: rolPorSlug.get(s.slug) ?? null }))
    .sort((a, b) => b.views - a.views || b.likes - a.likes || a.slug.localeCompare(b.slug));

  const champ = new Map<string, { champion: string; views: number; likes: number; guias: number }>();
  for (const s of porGuia) {
    const nombre = s.champion || s.slug;
    const e = champ.get(nombre) || { champion: nombre, views: 0, likes: 0, guias: 0 };
    e.views += s.views;
    e.likes += s.likes;
    e.guias += 1;
    champ.set(nombre, e);
  }

  // Serie diaria UTC de los últimos 14 días (días sin actividad → 0, para que
  // el gráfico no mienta estirando barras).
  const hoy = new Date();
  const dias: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - i));
    dias.push(d.toISOString().slice(0, 10));
  }
  const serie = new Map(dias.map((d) => [d, { dia: d, views: 0, likes: 0 }]));
  for (const v of views) {
    const e = serie.get(String(v.created_at).slice(0, 10));
    if (e) e.views++;
  }
  for (const l of likes) {
    const e = serie.get(String(l.created_at).slice(0, 10));
    if (e) e.likes++;
  }

  const recientes = [
    ...views.map((v) => ({ tipo: "view" as const, slug: slugPorId.get(v.guide_id) || "¿?", at: String(v.created_at) })),
    ...likes.map((l) => ({ tipo: "like" as const, slug: slugPorId.get(l.guide_id) || "¿?", at: String(l.created_at) })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  return {
    generado: new Date().toISOString(),
    db: kind,
    totals: {
      views: views.length,
      likes: likes.length,
      visitantes: new Set(views.map((v) => v.visitor_id)).size,
      guias: guides.length,
    },
    porGuia,
    porCampeon: [...champ.values()].sort((a, b) => b.views - a.views),
    diario: [...serie.values()],
    recientes,
  };
}

// ─────────────────────────────── selección ───────────────────────────────
// Singleton en globalThis (patrón Prisma): en dev, Next compila cada ruta por
// separado y un cache a nivel de módulo NO se comparte entre routes/hot-reload.
export function getDb(): Db | null {
  const g = globalThis as unknown as { __wrgDb?: Db | null };
  if (g.__wrgDb !== undefined) return g.__wrgDb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    g.__wrgDb = supabaseDb(url, key);
  } else if (process.env.NODE_ENV !== "production") {
    g.__wrgDb = memoryDb();
  } else {
    g.__wrgDb = null; // 503 en las rutas (producción nunca usa memoria)
  }
  return g.__wrgDb;
}
