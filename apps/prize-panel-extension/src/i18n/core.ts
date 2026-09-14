import { resolveLocale, type SupportedLocale } from '@housekeeping/shared';
import { STORAGE_KEYS, storageGet, storageSet } from '../lib/storage';
import type { ExtensionMessages } from './types';
import { interpolate } from './types';
import de from './messages/de';
import en from './messages/en';
import pt from './messages/pt';
import es from './messages/es';
import tr from './messages/tr';
import uk from './messages/uk';

const CATALOG: Record<SupportedLocale, ExtensionMessages> = {
  de,
  en,
  pt,
  es,
  tr,
  uk,
};

export function getMessages(locale?: string | null): ExtensionMessages {
  return CATALOG[resolveLocale(locale)];
}

export async function persistPreferredLocale(locale?: string | null): Promise<SupportedLocale> {
  const resolved = resolveLocale(
    locale,
    typeof navigator !== 'undefined' ? navigator.language : 'de',
  );
  await storageSet({ [STORAGE_KEYS.preferredLocale]: resolved });
  return resolved;
}

export async function loadExtensionLocale(): Promise<SupportedLocale> {
  const stored = await storageGet([STORAGE_KEYS.preferredLocale]);
  return resolveLocale(
    stored.preferredLocale,
    typeof navigator !== 'undefined' ? navigator.language : 'de',
  );
}

export function watchExtensionLocale(onChange: (locale: SupportedLocale) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local') return;
    if (!changes[STORAGE_KEYS.preferredLocale]) return;
    onChange(resolveLocale(changes[STORAGE_KEYS.preferredLocale].newValue as string | undefined));
  };
  try {
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  } catch {
    return () => undefined;
  }
}

export function useExtensionMessages(preferredLocale?: string | null): ExtensionMessages {
  return getMessages(preferredLocale);
}

export function tx(
  messages: ExtensionMessages,
  pick: (m: ExtensionMessages) => string,
  params?: Record<string, string | number>,
): string {
  return interpolate(pick(messages), params);
}
