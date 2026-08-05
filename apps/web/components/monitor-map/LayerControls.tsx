'use client';

type LayerKey = 'news' | 'police' | 'aviation';

type Props = {
  layers: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  counts: { news: number; police: number; aviation: number };
  dark?: boolean;
};

const LABELS: Record<LayerKey, { label: string; color: string }> = {
  news: { label: 'Nachrichten', color: 'bg-blue-600' },
  police: { label: 'Polizei', color: 'bg-red-600' },
  aviation: { label: 'Luftfahrt', color: 'bg-orange-500' },
};

export function LayerControls({ layers, onToggle, counts, dark }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(LABELS) as LayerKey[]).map((key) => {
        const { label, color } = LABELS[key];
        const active = layers[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={
              dark
                ? `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-sidebar-border bg-white/10 text-white'
                      : 'border-sidebar-border/60 bg-transparent text-sidebar-muted'
                  }`
                : `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-ink/20 bg-surface text-ink shadow-card'
                      : 'border-border bg-surface-muted text-ink-muted'
                  }`
            }
          >
            <span className={`h-2.5 w-2.5 rounded-full ${color} ${active ? '' : 'opacity-40'}`} />
            {label}
            <span className={dark ? 'text-sidebar-muted' : 'text-ink-muted'}>({counts[key]})</span>
          </button>
        );
      })}
    </div>
  );
}
