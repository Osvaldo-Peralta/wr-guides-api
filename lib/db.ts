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
    return r.json();
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
  };
}

// ─────────────────────────────── Memoria (dev local) ────────────────────────
function memoryDb(): Db {
  const guides = new Map<string, GuideRow & { id: number }>();
  const views: { guideId: number; visitorId: string; at: number }[] = [];
  const likes = new Map<string, true>();
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
      if (liked) likes.set(likeKey(guideId, visitorId), true);
      else likes.delete(likeKey(guideId, visitorId));
    },
    async getLike(guideId, visitorId) {
      return likes.has(likeKey(guideId, visitorId));
    },
    async countLikes(guideId) {
      return [...likes.keys()].filter((k) => k.startsWith(`${guideId}|`)).length;
    },
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
