"use client";

import { useEffect } from "react";

/**
 * global-error.tsx — the one error boundary that replaces the ROOT LAYOUT
 * itself (an error thrown by RootLayout's own render, e.g. a next-intl
 * message-loading failure), so unlike error.tsx it renders with no
 * providers above it — no NextIntlClientProvider, hence no useTranslations
 * here, and it must supply its own <html>/<body>. Hardcoded Spanish
 * (the site's default locale) rather than English, matching this being a
 * genuinely last-resort fallback outside the normal i18n-covered tree, not
 * a page a locale-preference cookie would even be read for.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f7f7",
          color: "#222222",
          fontFamily: "Helvetica, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 384, width: "100%", textAlign: "center", padding: "0 16px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Algo salió mal.</h1>
          <p style={{ fontSize: 13, color: "#555555", marginTop: 8 }}>
            Intenta recargar la página. Si el problema sigue, contactanos.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "8px 20px",
              borderRadius: 10,
              border: "none",
              background: "#8a9eff",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}
