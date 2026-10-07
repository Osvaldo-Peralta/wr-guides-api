export const metadata = { title: "wr-guides-api", robots: { index: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* En <style> (no inline) para que páginas con estética propia — /admin,
            Fase 8 — puedan sobreescribir el body con su propio <style>. */}
        <style>{`body { font-family: monospace; padding: 2rem; background: #16181d; color: #e8e4da; }`}</style>
        {children}
      </body>
    </html>
  );
}
