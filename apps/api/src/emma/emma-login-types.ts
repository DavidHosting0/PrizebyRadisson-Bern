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
