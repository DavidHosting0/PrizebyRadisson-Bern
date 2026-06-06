import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { GuestStaySignals } from '@housekeeping/shared';

type Props = {
  stay: GuestStaySignals | null | undefined;
  size?: 'sm' | 'md';
  /** Floor-plan tiles on dark status colors. */
  onColor?: boolean;
  showLabels?: boolean;
};

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
  size: 'sm' | 'md';
  children: ReactNode;
}) {
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const icon = size === 'sm' ? 12 : 14;
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
        'inline-flex shrink-0 items-center justify-center rounded-full',
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

function IconRestant() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M7 7h10v4H7V7zm0 6h6v4H7v-4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M17 13a4 4 0 110 8 4 4 0 010-8z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M15.5 15.5l3 3M18.5 15.5l-3 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconArrivalToday() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M12 4v8m0 0l3-3m-3 3L9 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20h14a2 2 0 001.732-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconDeparture() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M8 7h8l-1 10H9L8 7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 7V5a2 2 0 012-2h0a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 11v5m0 0l-2-2m2 2l2-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCheckedOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-full w-full">
      <path
        d="M8 7h8l-1 10H9L8 7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 14l2 2 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GuestStayTypeIcons({ stay, size = 'md', onColor, showLabels }: Props) {
  if (!stay) return null;

  const items: Array<{ key: string; title: string; tone: 'sky' | 'indigo' | 'amber' | 'emerald'; icon: ReactNode; label: string }> = [];

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
      title: stay.stayover ? 'Restant (EMMA Stayover)' : 'Restant',
      tone: 'sky',
      icon: <IconRestant />,
      label: 'Restant',
    });
  }
  if (stay.isDepartureToday) {
    const checkedOut = stay.checkOut || stay.ocoDone;
    items.push({
      key: 'departure',
      title: checkedOut ? 'Ausgecheckt (Abreise heute)' : 'Abreise heute — noch im Zimmer',
      tone: checkedOut ? 'emerald' : 'amber',
      icon: checkedOut ? <IconCheckedOut /> : <IconDeparture />,
      label: checkedOut ? 'CO' : 'Abreise',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
    { tone: 'indigo' as const, title: 'Heute eingecheckt', icon: <IconArrivalToday /> },
    { tone: 'sky' as const, title: 'Restant / Stayover', icon: <IconRestant /> },
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
