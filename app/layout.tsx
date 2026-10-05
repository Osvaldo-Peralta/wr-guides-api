export const metadata = { title: "wr-guides-api", robots: { index: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "monospace", padding: "2rem", background: "#16181d", color: "#e8e4da" }}>
        {children}
      </body>
    </html>
  );
}
