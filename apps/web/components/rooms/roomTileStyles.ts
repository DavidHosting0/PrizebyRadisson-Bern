import clsx from 'clsx';

/** Status colors for floor-plan rooms (grid + canvas). */
export const floorPlanStatusClasses: Record<string, string> = {
  DIRTY:
    'border-2 border-red-900/40 bg-gradient-to-b from-red-600 to-red-700 text-white shadow-md ring-1 ring-inset ring-white/10 hover:brightness-110',
  CLEAN:
    'border-2 border-orange-900/35 bg-gradient-to-b from-orange-500 to-orange-600 text-white shadow-md ring-1 ring-inset ring-white/10 hover:brightness-110',
  INSPECTED:
    'border-2 border-emerald-900/40 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white shadow-md ring-1 ring-inset ring-white/15 hover:brightness-110',
  IN_PROGRESS:
    'border-2 border-amber-800/50 bg-gradient-to-b from-amber-400 to-amber-500 text-ink shadow-md ring-1 ring-inset ring-white/20 hover:brightness-110',
  OUT_OF_ORDER:
    'border-2 border-violet-950/50 bg-gradient-to-b from-violet-600 to-violet-700 text-white shadow-md ring-1 ring-inset ring-white/10 hover:brightness-110',
};

const floorPlanDefaultClass =
  'border-2 border-slate-400 bg-gradient-to-b from-slate-200 to-slate-300 text-slate-800 shadow-sm';

/** Grid tiles on floor plan (room number + badge). */
export function roomTileClass(status: string): string {
  return clsx(
    'rounded-xl px-2 py-2 text-center font-medium transition-shadow hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action',
    floorPlanStatusClasses[status] ?? floorPlanDefaultClass,
  );
}

/** Compact room cells on drawn layout (number only). */
export function roomPlanCompactClass(status: string): string {
  return clsx(
    'min-h-[2rem] rounded-lg text-center text-sm font-bold tabular-nums leading-tight transition-shadow hover:shadow-lg',
    floorPlanStatusClasses[status] ?? floorPlanDefaultClass,
  );
}
