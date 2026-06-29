/** Next.js route — must NOT use /api (Nginx proxies /api to Nest on production). */
export const EXTENSION_DOWNLOAD_PATH = '/extension/download';

export function extensionDownloadUrl(): string {
  return EXTENSION_DOWNLOAD_PATH;
}
