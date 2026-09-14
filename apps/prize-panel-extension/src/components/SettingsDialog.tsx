import { useEffect, useState } from 'react';
import { getApiBase, setApiBase } from '@/lib/api';
import { DEFAULT_API_BASE, STORAGE_KEYS, storageGetBoolean, storageSet } from '@/lib/storage';
import { useI18n } from '@/i18n';
import { Button } from './ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDialog({ open, onClose }: Props) {
  const { m } = useI18n();
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_BASE);
  const [chatNotifications, setChatNotifications] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      getApiBase().then(setApiUrl);
      void storageGetBoolean(STORAGE_KEYS.chatNotificationsEnabled, true).then(setChatNotifications);
      setSaved(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function onSave() {
    try {
      setError(null);
      await setApiBase(apiUrl.trim());
      await storageSet({ [STORAGE_KEYS.chatNotificationsEnabled]: chatNotifications });
      setSaved(true);
      setTimeout(onClose, 600);
    } catch (e) {
      setSaved(false);
      setError(e instanceof Error ? e.message : m.settings.saveFailed);
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
        <h3 className="text-xs font-semibold text-white">{m.settings.title}</h3>

        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-white/5 accent-[#3B6FA0]"
            checked={chatNotifications}
            onChange={(e) => {
              setChatNotifications(e.target.checked);
              setSaved(false);
            }}
          />
          <span>
            <span className="block text-xs font-medium text-white">{m.settings.chatNotifications}</span>
            <span className="mt-0.5 block text-[10px] text-sidebar-muted">
              {m.settings.chatNotificationsHint}
            </span>
          </span>
        </label>

        <h4 className="mt-3 text-xs font-semibold text-white">{m.settings.apiUrl}</h4>
        <p className="mt-1 text-[10px] text-sidebar-muted">{m.settings.apiUrlHint}</p>
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
        {saved && <p className="mt-1.5 text-[11px] text-emerald-300">{m.settings.saved}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            className="min-h-[30px] px-2.5"
            onClick={onClose}
          >
            {m.settings.cancel}
          </Button>
          <Button type="button" variant="action" className="min-h-[30px] px-2.5" onClick={() => void onSave()}>
            {m.settings.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
