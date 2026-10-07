// WR-GUIDES-API · /admin — Fase 8: dashboard privado de comunidad.
// Protegido por middleware.ts (Basic Auth: contraseña = ADMIN_TOKEN).
// Server component puro: sin JS cliente, sin cookies de sesión, sin dependencias.
// Los datos de TRÁFICO (países, dispositivos, referentes) viven en Vercel
// Analytics (Fase 7 del web); acá vive lo que Supabase conoce: vistas/likes
// por guía y por campeón, visitantes únicos, serie de 14 días y actividad reciente.
import type { Metadata } from "next";
import { getDb, type AdminOverview } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · WR Guides", robots: { index: false, follow: false } };

const nf = new Intl.NumberFormat("es");

function rel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const ETIQ = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};

// Gráfico de barras agrupadas (14 días): rosa = vistas, cian = likes.
// SVG server-side con <title> por barra = tooltip nativo, cero JS.
function Grafico({ diario }: { diario: AdminOverview["diario"] }) {
  const max = Math.max(1, ...diario.map((d) => Math.max(d.views, d.likes)));
  const W = 640, H = 176, BASE = 140, ALT = 116, SLOT = (W - 24) / 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vistas y likes por día, últimos 14 días"
      style={{ width: "100%", height: "auto", display: "block" }}>
      <line x1="8" y1={BASE} x2={W - 8} y2={BASE} stroke="#272c55" strokeWidth="1" />
      <text x="8" y="14" fill="#a7a2c8" fontSize="10">pico: {nf.format(max)} eventos/día</text>
      {diario.map((d, i) => {
        const x = 12 + i * SLOT;
        const hv = (d.views / max) * ALT;
        const hl = (d.likes / max) * ALT;
        return (
          <g key={d.dia}>
            <rect x={x} y={BASE - hv} width="13" height={Math.max(hv, d.views ? 2 : 0)} rx="2" fill="#ff3d9e" opacity="0.9">
              <title>{`${ETIQ(d.dia)} · ${nf.format(d.views)} vistas`}</title>
            </rect>
            <rect x={x + 16} y={BASE - hl} width="13" height={Math.max(hl, d.likes ? 2 : 0)} rx="2" fill="#2de2e6" opacity="0.9">
              <title>{`${ETIQ(d.dia)} · ${nf.format(d.likes)} likes`}</title>
            </rect>
            {i % 2 === 1 && (
              <text x={x + 7} y={BASE + 16} fill="#a7a2c8" fontSize="9" textAnchor="middle">{ETIQ(d.dia)}</text>
            )}
          </g>
        );
      })}
      <g fontSize="10" fill="#a7a2c8">
        <rect x={W - 150} y="6" width="9" height="9" rx="2" fill="#ff3d9e" />
        <text x={W - 137} y="14">vistas</text>
        <rect x={W - 92} y="6" width="9" height="9" rx="2" fill="#2de2e6" />
        <text x={W - 79} y="14">likes</text>
      </g>
    </svg>
  );
}

function Kpi({ icono, valor, etiqueta, nota }: { icono: string; valor: string; etiqueta: string; nota?: string }) {
  return (
    <div className="wra-kpi">
      <span className="wra-kpi-icono">{icono}</span>
      <span className="wra-kpi-valor">{valor}</span>
      <span className="wra-kpi-etq">{etiqueta}</span>
      {nota && <span className="wra-kpi-nota">{nota}</span>}
    </div>
  );
}

export default async function AdminPage() {
  const db = getDb();
  if (!db) {
    return (
      <main className="wra">
        <h1>📊 WR Guides · Admin</h1>
        <p className="wra-error">
          BD no configurada: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor.
          En producción esto nunca debería verse (la API responde 503 antes).
        </p>
      </main>
    );
  }

  let ov: AdminOverview;
  try {
    ov = await db.adminOverview();
  } catch (e) {
    return (
      <main className="wra">
        <h1>📊 WR Guides · Admin</h1>
        <p className="wra-error">
          El overview falló: {String((e as Error)?.message || e)}
          <br />
          Si menciona una columna/función inexistente, revisá que el schema de
          Supabase incluya la función <code>guide_stats()</code> (schema.sql v0.3).
        </p>
      </main>
    );
  }

  const tasa = ov.totals.views ? Math.round((ov.totals.likes / ov.totals.views) * 100) : 0;

  return (
    <main className="wra">
      <style>{CSS}</style>
      <header className="wra-head">
        <h1>📊 WR Guides · Admin</h1>
        <p className="wra-meta">
          generado {new Date(ov.generado).toLocaleString("es", { timeZone: "UTC" })} UTC · bd:{" "}
          <strong>{ov.db}</strong> · <a href="/api/admin/stats">JSON</a> · <a href="/api/health">health</a>
        </p>
      </header>

      <section className="wra-kpis">
        <Kpi icono="👁" valor={nf.format(ov.totals.views)} etiqueta="vistas totales" />
        <Kpi icono="❤" valor={nf.format(ov.totals.likes)} etiqueta="likes totales" />
        <Kpi icono="🧍" valor={nf.format(ov.totals.visitantes)} etiqueta="visitantes únicos" nota="en vistas" />
        <Kpi icono="📚" valor={nf.format(ov.totals.guias)} etiqueta="guías sembradas" />
        <Kpi icono="💘" valor={`${tasa}/100`} etiqueta="tasa de like" nota="likes c/100 vistas" />
      </section>

      <section className="wra-panel">
        <h2>Últimos 14 días</h2>
        <Grafico diario={ov.diario} />
      </section>

      <section className="wra-panel">
        <h2>Por guía</h2>
        <div className="wra-scroll">
          <table>
            <thead>
              <tr><th>Guía</th><th>Campeón</th><th>Rol</th><th className="num">👁</th><th className="num">❤</th><th className="num">💘/100</th></tr>
            </thead>
            <tbody>
              {ov.porGuia.map((g) => (
                <tr key={g.slug}>
                  <td><a href={`https://wr-guides-web.vercel.app/guias/${g.slug}`} target="_blank" rel="noopener noreferrer">{g.slug}</a></td>
                  <td>{g.champion ?? "—"}</td>
                  <td>{g.role ?? "—"}</td>
                  <td className="num">{nf.format(g.views)}</td>
                  <td className="num">{nf.format(g.likes)}</td>
                  <td className="num">{g.views ? Math.round((g.likes / g.views) * 100) : 0}</td>
                </tr>
              ))}
              {!ov.porGuia.length && <tr><td colSpan={6}>Sin guías sembradas todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="wra-dos">
        <section className="wra-panel">
          <h2>Por campeón</h2>
          <table>
            <thead><tr><th>Campeón</th><th className="num">guías</th><th className="num">👁</th><th className="num">❤</th></tr></thead>
            <tbody>
              {ov.porCampeon.map((c) => (
                <tr key={c.champion}>
                  <td>{c.champion}</td>
                  <td className="num">{c.guias}</td>
                  <td className="num">{nf.format(c.views)}</td>
                  <td className="num">{nf.format(c.likes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="wra-panel">
          <h2>Actividad reciente</h2>
          <ul className="wra-feed">
            {ov.recientes.map((r, i) => (
              <li key={i}>
                <span className={r.tipo === "like" ? "wra-ev-like" : "wra-ev-view"}>{r.tipo === "like" ? "❤" : "👁"}</span>
                <span className="wra-ev-slug">{r.slug}</span>
                <span className="wra-ev-at" title={r.at}>{rel(r.at)}</span>
              </li>
            ))}
            {!ov.recientes.length && <li className="wra-ev-vacio">Sin eventos aún: el sitio todavía no recibió visitas.</li>}
          </ul>
        </section>
      </div>

      <p className="wra-pie">
        Tráfico por país/dispositivo/referente: Vercel Web Analytics del proyecto web (Fase 7).
        Este panel muestra solo lo que Supabase conoce (estado de comunidad).
        Dudas de operación: OPERACIONES.md §9.
      </p>
    </main>
  );
}

// ── Estética Jinx (misma paleta que wr-guides-web, autocontenida) ──
const CSS = `
.wra {
  --pink:#ff3d9e; --cyan:#2de2e6; --yellow:#ffd93d;
  --bg:#0b0d1c; --panel:#151832; --panel2:#12152c; --line:#272c55;
  --ink:#ece9fb; --soft:#a7a2c8;
  /* anula el padding del body del layout de la API y pinta a sangre */
  margin: -2rem; max-width: none; padding: 1.8rem 0 3rem;
  min-height: calc(100vh + 4rem);
  background:
    radial-gradient(900px 420px at 10% -10%, rgba(255,61,158,.12), transparent 60%),
    radial-gradient(800px 460px at 105% 110%, rgba(45,226,230,.09), transparent 60%),
    var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.55;
}
.wra > * { max-width: 1000px; margin-left: auto; margin-right: auto; padding-left: 1.2rem; padding-right: 1.2rem; }
.wra > style { display: none; }
.wra a { color: var(--cyan); }
.wra h1 {
  font-size: 1.7rem; margin: 0 0 .2rem; font-weight: 800;
  background: linear-gradient(100deg, #ff3d9e 10%, #ffd93d 50%, #2de2e6 90%);
  -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
}
.wra h2 { font-size: 1.02rem; margin: 0 0 .8rem; color: var(--ink);
  border-bottom: 2px solid; border-image: linear-gradient(90deg, rgba(255,61,158,.8), transparent 80%) 1;
  padding-bottom: .3rem; }
.wra-meta { color: var(--soft); font-size: .8rem; margin: 0 0 1.4rem; }
.wra-error { border:1px solid #ff5470; background: rgba(255,84,112,.08); color:#ffb3c0;
  border-radius: 10px; padding: .8rem 1rem; }
.wra-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .7rem; margin-bottom: 1rem; }
.wra-kpi { background: linear-gradient(160deg,#171b38,#12152c); border: 1px solid var(--line);
  border-radius: 12px; padding: .8rem .9rem; display: flex; flex-direction: column; gap: .1rem; }
.wra-kpi-icono { font-size: 1rem; }
.wra-kpi-valor { font-size: 1.5rem; font-weight: 800; color: var(--cyan); font-variant-numeric: tabular-nums; }
.wra-kpi-etq { font-size: .78rem; color: var(--soft); text-transform: uppercase; letter-spacing: .04em; }
.wra-kpi-nota { font-size: .7rem; color: var(--soft); opacity: .75; }
.wra-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  padding: 1rem 1.1rem; margin-bottom: 1rem; }
.wra-dos { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 760px) { .wra-dos { grid-template-columns: 1fr; } }
.wra table { width: 100%; border-collapse: collapse; font-size: .88rem; font-variant-numeric: tabular-nums; }
.wra th { text-align: left; color: var(--soft); font-weight: 650; border-bottom: 2px solid var(--pink);
  padding: .35rem .5rem; white-space: nowrap; }
.wra td { border-bottom: 1px solid #21264a; padding: .35rem .5rem; }
.wra tbody tr:hover { background: rgba(255,61,158,.06); }
.wra .num { text-align: right; }
.wra-scroll { overflow-x: auto; }
.wra-feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; font-size: .88rem; }
.wra-feed li { display: flex; gap: .5rem; align-items: baseline; }
.wra-ev-like { color: var(--pink); }
.wra-ev-view { color: var(--cyan); }
.wra-ev-slug { font-weight: 600; }
.wra-ev-at { color: var(--soft); font-size: .78rem; margin-left: auto; }
.wra-ev-vacio { color: var(--soft); }
.wra-pie { color: var(--soft); font-size: .78rem; margin-top: 1.4rem; }
`;
