import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { GuestStaySignals } from '@housekeeping/shared';

type Props = {
  stay: GuestStaySignals | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  /** Floor-plan tiles on dark status colors. */
  onColor?: boolean;
  showLabels?: boolean;
};

const STROKE = 2.25;

function IconChip({
  title,
  tone,
  onColor,
  size,
  children,
}: {
  title: string;
  tone: 'sky' | 'indigo' | 'amber' | 'emerald';
  onColor?: boolean;
  size: 'xs' | 'sm' | 'md';
  children: ReactNode;
}) {
  const dim = size === 'xs' ? 'h-3.5 w-3.5' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const icon = size === 'xs' ? 10 : size === 'sm' ? 13 : 15;
  const tones: Record<typeof tone, string> = onColor
    ? {
        sky: 'bg-white/25 text-white ring-1 ring-inset ring-white/30',
        indigo: 'bg-indigo-300/90 text-indigo-950 ring-1 ring-inset ring-white/20',
        amber: 'bg-amber-300/95 text-amber-950 ring-1 ring-inset ring-white/20',
        emerald: 'bg-emerald-300/95 text-emerald-950 ring-1 ring-inset ring-white/20',
      }
    : {
        sky: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200/80',
        indigo: 'bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-200/80',
        amber: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200/80',
        emerald: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/80',
      };

  return (
    <span
      title={title}
      aria-label={title}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        dim,
        tones[tone],
      )}
    >
      <span style={{ width: icon, height: icon }} className="inline-flex">
        {children}
      </span>
    </span>
  );
}

/** Arrow entering room — Anreise heute. */
function IconArrivalToday() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <rect
        x="12"
        y="5"
        width="9"
        height="15"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <path
        d="M4 12.5h6M10 12.5l-2.5-2.5M10 12.5l-2.5 2.5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bed — Restant (bleibt im Haus). */
function IconRestant() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M4 16h16v3H4z"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path
        d="M4 16V13a2.5 2.5 0 012.5-2.5H9a2.5 2.5 0 012.5 2.5v3"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <path d="M14 10.5h6v5.5" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

/** Arrow leaving room — Abreise heute. */
function IconDeparture() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <rect
        x="3"
        y="5"
        width="9"
        height="15"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={STROKE}
      />
      <path
        d="M14 12.5h6M18 12.5l2.5-2.5M18 12.5l2.5 2.5"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Checkmark — ausgecheckt. */
function IconCheckedOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M6 12.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth={STROKE + 0.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GuestStayTypeIcons({ stay, size = 'md', onColor, showLabels }: Props) {
  if (!stay) return null;

  const items: Array<{
    key: string;
    title: string;
    tone: 'sky' | 'indigo' | 'amber' | 'emerald';
    icon: ReactNode;
    label: string;
  }> = [];

  if (stay.isArrivalToday) {
    items.push({
      key: 'arrival',
      title: 'Heute eingecheckt',
      tone: 'indigo',
      icon: <IconArrivalToday />,
      label: 'Anreise',
    });
  }
  if (stay.isRestant) {
    items.push({
      key: 'restant',
      title: stay.stayover ? 'Restant (Stayover)' : 'Restant',
      tone: 'sky',
      icon: <IconRestant />,
      label: 'Restant',
    });
  }
  if (stay.isDepartureToday) {
    const checkedOut = stay.checkOut || stay.ocoDone;
    items.push({
      key: 'departure',
      title: checkedOut ? 'Ausgecheckt (Abreise heute)' : 'Abreise heute',
      tone: checkedOut ? 'emerald' : 'amber',
      icon: checkedOut ? <IconCheckedOut /> : <IconDeparture />,
      label: checkedOut ? 'CO' : 'Abreise',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className={clsx('flex flex-wrap items-center', size === 'xs' ? 'gap-0.5' : 'gap-1.5')}>
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1">
          <IconChip title={item.title} tone={item.tone} onColor={onColor} size={size}>
            {item.icon}
          </IconChip>
          {showLabels && (
            <span className="text-[10px] font-medium text-ink-muted">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function GuestStayTypeLegend({ compact }: { compact?: boolean }) {
  const entries = [
    { tone: 'indigo' as const, title: 'Anreise heute', icon: <IconArrivalToday /> },
    { tone: 'sky' as const, title: 'Restant', icon: <IconRestant /> },
    { tone: 'amber' as const, title: 'Abreise heute', icon: <IconDeparture /> },
    { tone: 'emerald' as const, title: 'Ausgecheckt', icon: <IconCheckedOut /> },
  ];

  return (
    <div
      className={clsx(
        'flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted',
        compact ? 'gap-x-3' : '',
      )}
    >
      {entries.map((e) => (
        <span key={e.title} className="inline-flex items-center gap-1.5">
          <IconChip title={e.title} tone={e.tone} size="sm">
            {e.icon}
          </IconChip>
          <span>{e.title}</span>
        </span>
      ))}
    </div>
  );
}
