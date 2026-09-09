'use client';

import { useEffect, useState } from 'react';

import { ReportButton } from '@/components/feedback/report-button';
import { PlanBadge } from '@/components/auth/plan-badge';
import { WindowControls } from '@/components/layout/window-controls';
import { Icon } from '@/components/ui/icon';
import { detectarPlataforma } from '@/lib/atajos';

interface TitlebarProps {
  onToggleMenu?: () => void;
}

/**
 * Franja superior de la ventana. En Electron es una región arrastrable
 * (`-webkit-app-region: drag`) y el chrome depende del SO:
 * - macOS (`titleBarStyle: hiddenInset`): reserva a la izquierda el espacio de
 *   los semáforos nativos.
 * - Windows (`titleBarStyle: hidden`): sin barra nativa — la app dibuja sus
 *   propios min/max/cerrar (`WindowControls`) pegados al borde derecho.
 * En el navegador (dev y web) incluye el botón de menú para móviles.
 */
export function Titlebar({ onToggleMenu }: TitlebarProps = {}) {
  const [{ desktop, mac, win }, set] = useState({
    desktop: false,
    mac: false,
    win: false,
  });

  useEffect(() => {
    set(detectarPlataforma());
  }, []);

  const conControles = desktop && win;
  const style: React.CSSProperties & { WebkitAppRegion?: string } = {
    paddingLeft: desktop && mac ? 78 : 10,
    // En Windows los controles van pegados al borde (sin padding).
    paddingRight: conControles ? 0 : 6,
  };
  if (desktop) style.WebkitAppRegion = 'drag';

  return (
    <div
      className="flex h-9 shrink-0 select-none items-center gap-2 border-b bg-card"
      style={style}
    >
      {/* Botón hamburguesa (☰) para celulares y tabletas */}
      {!desktop && onToggleMenu && (
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label="Abrir menú de navegación"
          className="flex size-7.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
        >
          <Icon icon="ph:list-light" className="size-5" />
        </button>
      )}

      {/* La marca vive en el sidebar; la franja queda como zona de drag. */}
      <div
        className="ml-auto flex h-full items-center gap-2"
        style={desktop ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion?: string }) : undefined}
      >
        <PlanBadge />
        <ReportButton />
        {conControles && <WindowControls />}
      </div>
    </div>
  );
}