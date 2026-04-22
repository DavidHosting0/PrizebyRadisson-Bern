import clsx from 'clsx';

/**
 * Displays a user's profile picture when available, otherwise draws a colored
 * circle with their initials. Color is derived deterministically from the name
 * so the same person stays visually stable across the UI.
 */
type Props = {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
};

const PALETTE = [
  'bg-rose-200 text-rose-900',
  'bg-amber-200 text-amber-900',
  'bg-emerald-200 text-emerald-900',
  'bg-teal-200 text-teal-900',
  'bg-sky-200 text-sky-900',
  'bg-indigo-200 text-indigo-900',
  'bg-fuchsia-200 text-fuchsia-900',
  'bg-lime-200 text-lime-900',
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, url, size = 36, className, ring }: Props) {
  const dim = { width: size, height: size } as const;
  const initials = initialsFor(name);
  const color = colorFor(name);

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        !url && color,
        ring && 'ring-2 ring-white shadow-card',
        className,
      )}
      style={{
        ...dim,
        fontSize: Math.max(10, Math.round(size * 0.4)),
      }}
      aria-label={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
