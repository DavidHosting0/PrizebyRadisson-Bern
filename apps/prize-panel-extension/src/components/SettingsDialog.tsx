import { useEffect, useState } from 'react';
import { getApiBase, setApiBase } from '@/lib/api';
import { DEFAULT_API_BASE } from '@/lib/storage';
import { Button } from './ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDialog({ open, onClose }: Props) {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_BASE);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getApiBase().then(setApiUrl);
      setSaved(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function onSave() {
    try {
      setError(null);
      await setApiBase(apiUrl.trim());
      setSaved(true);
      setTimeout(onClose, 600);
    } catch (e) {
      setSaved(false);
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/55 p-2"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="w-full rounded-2xl border border-white/10 bg-sidebar p-3 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xs font-semibold text-white">API-URL</h3>
        <p className="mt-1 text-[10px] text-sidebar-muted">
          Nur https://prizebern.com/api/v1 oder http://localhost:3001/api/v1
        </p>
        <label className="mt-2 flex flex-col gap-0.5">
          <input
            className="min-h-[34px] rounded-lg border border-white/15 bg-white/5 px-2 text-xs text-white"
            value={apiUrl}
            onChange={(e) => {
              setApiUrl(e.target.value);
              setError(null);
              setSaved(false);
            }}
            placeholder={DEFAULT_API_BASE}
          />
        </label>
        {error && <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>}
        {saved && <p className="mt-1.5 text-[11px] text-emerald-300">Gespeichert.</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[30px] px-2.5"
            onClick={onClose}
          >
            Abbrechen
          </Button>
          <Button type="button" variant="action" className="min-h-[30px] px-2.5" onClick={() => void onSave()}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
