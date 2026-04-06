import type { ReactNode } from 'react';

/** Blueprint-style surface so layouts feel built-in, not a flat canvas. */
export function FloorPlanCanvasFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 shadow-[0_2px_12px_rgba(43,43,43,0.07)]">
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(255,255,255,0.85) 0%, transparent 55%), linear-gradient(165deg, #f4f2ec 0%, #e9e6df 48%, #ded9d0 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.55]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(43,43,43,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(43,43,43,0.07) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.12]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />
      <div className="relative z-10 overflow-x-auto p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function floorTabClass(active: boolean): string {
  return active
    ? 'bg-ink text-white shadow-md'
    : 'bg-transparent text-ink-muted hover:bg-white/55 hover:text-ink';
}
