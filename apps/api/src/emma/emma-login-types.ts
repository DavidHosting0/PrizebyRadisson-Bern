/** Verbose progress callback (logged from the service). */
export type EmmaProgress = (message: string) => void;

/** Credentials for EMMA HTTP login (ADFS → MFA → SAP → optional property). */
export type EmmaLoginOpts = {
  adfsEmail: string;
  adfsPassword: string;
  totpSecret: string;
  sapUser: string;
  sapPassword: string;
  operatorCode?: string;
  operatorPassword?: string;
  baseUrl?: string;
  hotelId?: string;
  sapClient?: string;
  progress?: EmmaProgress;
};

export const DEFAULT_EMMA_BASE_URL =
  'https://emma.rhg.radissonhotels.com/sap/bc/ui2/flp';

export function emmaLaunchpadUrl(opts: Pick<EmmaLoginOpts, 'baseUrl'>): string {
  return opts.baseUrl?.trim() || DEFAULT_EMMA_BASE_URL;
}

/**
 * Returns the EMMA server root (origin only, no `/sap/bc/ui2/flp`).
 * Use for OData calls and absolute path construction so we never end up with
 * doubled segments like `/sap/bc/ui2/flp/sap/bc/ui2/flp`.
 */
export function emmaServerRoot(opts: Pick<EmmaLoginOpts, 'baseUrl'>): string {
  const raw = opts.baseUrl?.trim() || DEFAULT_EMMA_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://emma.rhg.radissonhotels.com';
  }
}
