'use client';

import { Icon } from '@/components/ui/icon';

export default function Home() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon icon="ph:wrench-light" className="size-6 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            I
          </span>
          <h1 className="text-xl font-bold tracking-tight">IusTechConta</h1>
        </div>
      </div>

      <div className="max-w-md space-y-3">
        <h2 className="text-2xl font-extrabold tracking-tight">
          Sitio en construcción, disculpe las molestias
        </h2>
        <p className="text-sm text-muted-foreground">
          Estamos preparando la nueva estación de trabajo fiscal y contable. Muy pronto habilitaremos el acceso general.
          <a href="/conectar" className="font-semibold text-primary underline underline-offset-4">
          </a>
          .
        </p>
      </div>
    </div>
  );
}