#!/usr/bin/env node
// WR-GUIDES-API · scripts/uptime-check.mjs — blindaje operativo (post-Fase 9):
//
//   1. UPTIME: chequea web + API (health, catálogo, stats) desde afuera.
//   2. KEEP-ALIVE: el chequeo de catálogo hace una query REAL a Supabase vía
//      la API — suficiente para que Supabase Free NO se pause por inactividad
//      (riesgo real del plan: pausa tras 7 días sin actividad, y el sitio es
//      joven). Corriendo cada 6 h desde GitHub Actions, nunca se acerca.
//   3. ALERTA: si algo falla y hay GITHUB_TOKEN, abre un issue etiquetado
//      "uptime" (uno solo: si ya hay uno abierto, no spamea). Cuando todo
//      vuelve a estar verde, comenta "recuperado" y CIERRA el issue abierto.
//
// Env (las pone el workflow; locales opcionales):
//   WR_API, WR_WEB, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID…
// Exit: 0 todo verde · 1 hay fallas (el run queda rojo además del issue).
import fs from "node:fs";

const API = (process.env.WR_API || "https://wr-guides-api.vercel.app").replace(/\/+$/, "");
const WEB = (process.env.WR_WEB || "https://wr-guides-web.vercel.app").replace(/\/+$/, "");
const TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "";
const GH = "https://api.github.com";
const LABEL = "uptime";
const T = 20_000;

const checks = [];
async function check(nombre, fn) {
  try {
    const detalle = await fn();
    checks.push({ nombre, ok: true, detalle });
    console.log(`✅ ${nombre}  → ${detalle}`);
  } catch (e) {
    const detalle = String(e?.message || e);
    checks.push({ nombre, ok: false, detalle });
    console.log(`❌ ${nombre}  → ${detalle}`);
  }
}

async function get(url, { json = true } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(T), headers: { "user-agent": "wrg-uptime" } });
  const text = await r.text();
  if (!json) return { r, text };
  let body = null;
  try { body = JSON.parse(text); } catch { /* no-JSON */ }
  return { r, body, text };
}

// ── chequeos ──
await check("API /api/health", async () => {
  const { r, body } = await get(`${API}/api/health`);
  if (!r.ok || body?.ok !== true) throw new Error(`health ${r.status}: ${JSON.stringify(body)}`);
  if (body.db !== "supabase") throw new Error(`db="${body.db}" (esperado supabase: sin BD la comunidad muere)`);
  return `ok · db=${body.db}`;
});

await check("API /api/guides (keep-alive Supabase)", async () => {
  const { r, body } = await get(`${API}/api/guides`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  if (!Array.isArray(body?.guias) || body.guias.length === 0)
    throw new Error(`catálogo vacío o roto: ${JSON.stringify(body).slice(0, 120)}`);
  return `${body.guias.length} guías (query real a Supabase ✓)`;
});

await check("API stats de una guía", async () => {
  const { r, body } = await get(`${API}/api/guides/jinx/stats`);
  if (!r.ok || typeof body?.views !== "number") throw new Error(`stats ${r.status}: ${JSON.stringify(body)}`);
  return `jinx 👁${body.views} ❤${body.likes}`;
});

await check("Web home", async () => {
  const { r, text } = await get(`${WEB}/`, { json: false });
  if (!r.ok) throw new Error(`status ${r.status}`);
  if (!text.includes("WR Guías")) throw new Error("HTML sin el chrome del sitio (¿deploy a medias?)");
  return "200 · chrome presente";
});

await check("Web una guía", async () => {
  const { r, text } = await get(`${WEB}/guias/jinx`, { json: false });
  if (!r.ok) throw new Error(`status ${r.status}`);
  if (!text.includes("guide-page")) throw new Error("la página de guía no renderiza el article");
  return "200 · guide-page presente";
});

const fallas = checks.filter((c) => !c.ok);

// ── summary del run ──
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## 🩺 Uptime + keep-alive · ${new Date().toISOString()}`,
    "",
    ...checks.map((c) => `- ${c.ok ? "✅" : "❌"} **${c.nombre}** — ${c.detalle}`),
    "",
    fallas.length
      ? `🚨 **${fallas.length} chequeo(s) fallando.** Issue de alerta gestionado abajo.`
      : `Todo verde. Supabase recibió su query keep-alive.`,
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

// ── gestión de issue (solo con token, solo en Actions) ──
async function gh(path, init = {}) {
  const r = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "wrg-uptime",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

if (TOKEN && REPO) {
  try {
    const abiertos = await gh(`/repos/${REPO}/issues?labels=${LABEL}&state=open`);
    const runUrl = `${process.env.GITHUB_SERVER_URL || ""}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
    if (fallas.length) {
      if (abiertos.length) {
        console.log(`· ya hay issue abierto (#${abiertos[0].number}) — no se spamea.`);
      } else {
        const cuerpo =
          `### Chequeos fallando\n\n` +
          checks.map((c) => `- ${c.ok ? "✅" : "❌"} **${c.nombre}** — ${c.detalle}`).join("\n") +
          `\n\nRun: ${runUrl}\n\n_Abierto automáticamente por scripts/uptime-check.mjs (cron 6 h). ` +
          `Se cierra solo cuando todo vuelva a estar verde._`;
        const issue = await gh(`/repos/${REPO}/issues`, {
          method: "POST",
          body: JSON.stringify({
            title: `🚨 Uptime: ${fallas.length} chequeo(s) caído(s) — ${new Date().toISOString().slice(0, 16)}Z`,
            body: cuerpo,
            labels: [LABEL],
          }),
        });
        console.log(`· issue de alerta creado: #${issue.number}`);
      }
    } else if (abiertos.length) {
      for (const i of abiertos) {
        await gh(`/repos/${REPO}/issues/${i.number}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: `✅ Todo verde de nuevo (${new Date().toISOString()}). Run: ${runUrl}` }),
        });
        await gh(`/repos/${REPO}/issues/${i.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
        console.log(`· issue #${i.number} cerrado (recuperado).`);
      }
    }
  } catch (e) {
    console.log(`⚠ gestión de issue falló (no afecta el resultado de los chequeos): ${e.message}`);
  }
} else {
  console.log("· sin GITHUB_TOKEN: salto gestión de issues (modo local).");
}

console.log(fallas.length ? `\n✗ ${fallas.length} fallo(s)` : "\n✓ uptime: todo verde");
process.exit(fallas.length ? 1 : 0);
