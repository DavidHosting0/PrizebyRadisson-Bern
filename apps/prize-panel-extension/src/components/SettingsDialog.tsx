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

  useEffect(() => {
    if (open) {
      getApiBase().then(setApiUrl);
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  async function onSave() {
    await setApiBase(apiUrl.trim());
    setSaved(true);
    setTimeout(onClose, 600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-card border border-border bg-surface p-4 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-ink">Einstellungen</h3>
        <p className="mt-1 text-xs text-ink-muted">API-Basis-URL für PrizeBern Backend.</p>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-ink-muted">API URL</span>
          <input
            className="min-h-[40px] rounded-btn border border-border bg-surface px-3 text-sm"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder={DEFAULT_API_BASE}
          />
        </label>
        {saved && <p className="mt-2 text-xs text-success">Gespeichert.</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="button" variant="action" onClick={() => void onSave()}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
