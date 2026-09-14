export type { ExtensionMessages } from './types';
export { interpolate } from './types';
export {
  getMessages,
  persistPreferredLocale,
  loadExtensionLocale,
  watchExtensionLocale,
  useExtensionMessages,
  tx,
} from './core';
export { useI18n, useMessagesOnly } from './useI18n';
