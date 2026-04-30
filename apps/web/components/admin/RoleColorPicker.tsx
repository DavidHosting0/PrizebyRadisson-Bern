'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

const PRESETS = [
  '#99aab5', // default grey
  '#1abc9c',
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#e91e63',
  '#f1c40f',
  '#e67e22',
  '#e74c3c',
  '#95a5a6',
  '#11806a',
  '#1f8b4c',
  '#206694',
  '#71368a',
  '#ad1457',
  '#c27c0e',
  '#a84300',
  '#992d22',
  '#5865f2', // discord blurple
  '#979c9f',
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Discord-style colour picker: 4×5 preset grid plus a hex input.
 * Emits the chosen value upward via `onChange` whenever it's a valid 6-digit hex.
 */
export function RoleColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);

  function commit(v: string) {
    setHex(v);
    if (HEX.test(v)) onChange(v.toLowerCase());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 shrink-0 rounded-lg border border-border shadow-card"
          style={{ backgroundColor: HEX.test(hex) ? hex : '#99aab5' }}
        />
        <div className="flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Custom hex</label>
          <input
            value={hex}
            onChange={(e) => commit(e.target.value)}
            spellCheck={false}
            maxLength={7}
            className="mt-1 w-full min-h-[40px] rounded-btn border border-border bg-surface px-3 font-mono text-sm focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
            placeholder="#5865f2"
          />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Presets</p>
        <div className="mt-2 grid grid-cols-10 gap-2">
          {PRESETS.map((p) => {
            const active = HEX.test(hex) && hex.toLowerCase() === p.toLowerCase();
            return (
              <button
                key={p}
                type="button"
                onClick={() => commit(p)}
                className={clsx(
                  'relative h-8 w-8 rounded-full border transition-transform hover:scale-110',
                  active ? 'border-ink shadow-lift' : 'border-border',
                )}
                style={{ backgroundColor: p }}
                aria-label={`Use color ${p}`}
                title={p}
              >
                {active && (
                  <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
