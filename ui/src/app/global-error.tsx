'use client';

import { useEffect } from 'react';

import { capturarExcepcion } from '@/lib/telemetria';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error-boundary]', error);
    capturarExcepcion(error, { boundary: 'global', digest: error?.digest });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#F5F6F2', /* Marfil Frío IusTech */
          color: '#202827', /* Grafito IusTech */
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            La aplicación tuvo un problema
          </h1>
          <p style={{ fontSize: 14, color: '#65716F', marginBottom: 16 }}>
            Ocurrió un error inesperado al iniciar la pantalla. Intenta recargar.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid #D9E0DD',
              background: '#1FA6A0', /* Botón Turquesa */
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
