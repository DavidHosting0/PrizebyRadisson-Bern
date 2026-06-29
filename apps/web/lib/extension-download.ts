/** URL path for the extension download (served by /api/extension/download). */
export const EXTENSION_DOWNLOAD_PATH = '/api/extension/download';

export function extensionDownloadUrl(): string {
  return EXTENSION_DOWNLOAD_PATH;
}
