import { generateSync } from 'otplib';
import type { Page } from 'playwright';

/**
 * EMMA = SAP Fiori Launchpad for Radisson Hotel Group properties.
 *
 * The login is a four-stage chain that we drive end-to-end here. The chain was
 * mapped manually in a real browser session before this code was written:
 *
 *   Stage 0  https://emma.rhg.radissonhotels.com/sap/bc/ui2/flp
 *            Auto-POSTs a SAML AuthnRequest to ADFS. No interaction needed,
 *            playwright's `page.goto` follows it via the inline onload submit.
 *
 *   Stage 1  https://signon.radissonhotels.com/adfs/ls/
 *            Microsoft ADFS forms-based authentication.
 *              UserName  → AD email (e.g. firstname.lastname@prizebyradisson.com)
 *              Password  → AD password
 *              hidden    → AuthMethod=FormsAuthentication
 *
 *   Stage 2  Same host, page title "RHGMFA"
 *            One textbox + Submit button. Accepts a 6-digit TOTP generated
 *            from a base32 seed.
 *
 *   Stage 3  Back on emma.rhg.radissonhotels.com (page title "Logon")
 *            SAP Fiori standard logon screen.
 *              User      → SAP user (e.g. CHBRNPRF2)
 *              Password  → SAP password
 *              "Log On"  button (note: spelled with two words)
 *
 *   Stage 4  Modal overlay on the Fiori Home page
 *            Property is prefilled (e.g. "Prize by Radisson, Bern City").
 *              second combobox  → operator code (e.g. "47032")
 *              password input   → operator password
 *              "Login" button   (one word, distinct from "Log On" above)
 */
export type EmmaProgress = (message: string) => void;

export type EmmaLoginOpts = {
  /** Stage 1 — ADFS user account (email). */
  adfsEmail: string;
  /** Stage 1 — ADFS password. */
  adfsPassword: string;
  /** Stage 2 — base32 TOTP seed for the RHGMFA prompt. */
  totpSecret: string;
  /** Stage 3 — SAP-internal user (e.g. `CHBRNPRF2`). */
  sapUser: string;
  /** Stage 3 — SAP-internal password. */
  sapPassword: string;
  /** Stage 4 — operator/property code; required to dismiss the property modal. */
  operatorCode?: string;
  /** Stage 4 — operator password. */
  operatorPassword?: string;
  /**
   * Optional override for the launchpad URL. Defaults to the public Radisson
   * EMMA endpoint.
   */
  baseUrl?: string;
  /** Verbose progress callback (logged from the service). */
  progress?: EmmaProgress;
};

export const DEFAULT_EMMA_BASE_URL =
  'https://emma.rhg.radissonhotels.com/sap/bc/ui2/flp';

export function emmaLaunchpadUrl(opts: Pick<EmmaLoginOpts, 'baseUrl'>): string {
  return opts.baseUrl?.trim() || DEFAULT_EMMA_BASE_URL;
}

function progress(opts: EmmaLoginOpts, message: string) {
  opts.progress?.(message);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Navigate to EMMA and run the full four-stage login on the given page.
 *
 * Idempotent: if the persistent browser context already has a valid session,
 * each stage's prompt simply isn't visible and we skip it. Throws if we end up
 * on a login screen that the supplied credentials cannot satisfy.
 */
export async function emmaOpenLoggedIn(
  page: Page,
  opts: EmmaLoginOpts,
): Promise<void> {
  const url = emmaLaunchpadUrl(opts);
  progress(opts, `[EMMA] Öffne EMMA: ${url}`);
  await page.goto(url, { timeout: 120_000, waitUntil: 'domcontentloaded' });
  await emmaLogin(page, opts);
}

/**
 * Run all four login stages on a page that is already pointed at EMMA. Each
 * stage tolerates the prompt being absent (already logged in for that step).
 */
export async function emmaLogin(
  page: Page,
  opts: EmmaLoginOpts,
): Promise<void> {
  await emmaLoginStage1Adfs(page, opts);
  await emmaLoginStage2Mfa(page, opts);
  await emmaLoginStage3Sap(page, opts);
  await emmaLoginStage4OperatorModal(page, opts);
}

async function emmaLoginStage1Adfs(page: Page, opts: EmmaLoginOpts) {
  const userField = page
    .locator(
      '#userNameInput, input[name="UserName"], input[placeholder="someone@example.com"]',
    )
    .first();
  if (!(await userField.isVisible({ timeout: 30_000 }).catch(() => false))) {
    return;
  }
  if (!opts.adfsEmail?.trim() || !opts.adfsPassword) {
    throw new Error('EMMA Stage 1 (ADFS): E-Mail oder Passwort fehlt.');
  }
  progress(opts, '[EMMA] Stage 1/4 ADFS — Benutzer eintragen');
  await userField.fill(opts.adfsEmail.trim());

  const passField = page
    .locator('#passwordInput, input[name="Password"], input[type="password"]')
    .first();
  await passField.waitFor({ state: 'visible', timeout: 15_000 });
  await passField.fill(opts.adfsPassword);

  const submit = page
    .locator(
      '#submitButton, button[type="submit"], input[type="submit"][value*="Sign in" i], input[type="submit"]',
    )
    .first();
  await submit.click();
  progress(opts, '[EMMA] Stage 1/4 ADFS — gesendet');
  await sleep(1500);
}

async function emmaLoginStage2Mfa(page: Page, opts: EmmaLoginOpts) {
  // RHGMFA renders a single textbox; restrict to text/tel inputs that aren't
  // the AD username field we already filled.
  const otpField = page
    .locator(
      [
        'input[autocomplete="one-time-code"]',
        'input[name="ChallengeQuestionAnswer"]',
        'input[name*="otp" i]',
        'input[name*="code" i]',
        'input[type="tel"]',
        'input[type="text"]:not([name="UserName"]):not([name="Email"])',
      ].join(', '),
    )
    .first();
  if (!(await otpField.isVisible({ timeout: 20_000 }).catch(() => false))) {
    return;
  }
  if (!opts.totpSecret?.trim()) {
    throw new Error(
      'EMMA Stage 2 (MFA): TOTP-Prompt erschien, aber kein Seed konfiguriert.',
    );
  }
  progress(opts, '[EMMA] Stage 2/4 MFA — Code generieren und senden');
  const code = generateSync({
    secret: opts.totpSecret.replace(/\s+/g, '').toUpperCase(),
  });
  await otpField.fill(code);
  const submit = page
    .locator(
      'input[type="submit"][value*="Submit" i], button:has-text("Submit"), input[type="submit"]',
    )
    .first();
  await submit.click();
  progress(opts, '[EMMA] Stage 2/4 MFA — gesendet');
  await sleep(2500);
}

async function emmaLoginStage3Sap(page: Page, opts: EmmaLoginOpts) {
  // SAP Fiori standard logon. The User/Password inputs use placeholders we
  // can pin selectors to. The submit button reads "Log On" (two words).
  const userField = page
    .locator(
      'input#sap-user, input[name="sap-user"], input[placeholder="User" i]:not([type="password"])',
    )
    .first();
  if (!(await userField.isVisible({ timeout: 20_000 }).catch(() => false))) {
    return;
  }
  if (!opts.sapUser?.trim() || !opts.sapPassword) {
    throw new Error(
      'EMMA Stage 3 (SAP Logon): SAP-Benutzer oder Passwort fehlt.',
    );
  }
  progress(opts, '[EMMA] Stage 3/4 SAP — Benutzer eintragen');
  await userField.fill(opts.sapUser.trim());

  const passField = page
    .locator(
      'input#sap-password, input[name="sap-password"], input[type="password"][placeholder="Password" i]',
    )
    .first();
  await passField.waitFor({ state: 'visible', timeout: 8000 });
  await passField.fill(opts.sapPassword);

  const submit = page
    .locator(
      'button:has-text("Log On"), input[type="submit"][value="Log On" i], input[type="button"][value="Log On" i]',
    )
    .first();
  await submit.click();
  progress(opts, '[EMMA] Stage 3/4 SAP — gesendet');
  await sleep(3000);
}

async function emmaLoginStage4OperatorModal(page: Page, opts: EmmaLoginOpts) {
  // After the launchpad loads, a modal pops up asking for the operator code +
  // password (per-property login). The dialog contains the only "Login"
  // button (one word, capital L) — distinct from the "Log On" of stage 3.
  const loginBtn = page.getByRole('button', { name: 'Login', exact: true });
  if (!(await loginBtn.isVisible({ timeout: 30_000 }).catch(() => false))) {
    progress(
      opts,
      '[EMMA] Stage 4/4 — kein Property-Modal sichtbar, übersprungen',
    );
    return;
  }
  progress(opts, '[EMMA] Stage 4/4 Property-Login — Modal erkannt');

  if (!opts.operatorCode?.trim() || !opts.operatorPassword) {
    throw new Error(
      'EMMA Stage 4 (Property-Modal): Operator-Code oder -Passwort fehlt.',
    );
  }

  // Scope to the dialog so we don't hit the global Fiori search bar.
  const dialog = page
    .locator('[role="dialog"]:has(button[title="Login"]), [role="dialog"]:has-text("Login")')
    .first();
  // Visible inputs in the dialog: 3 in total (property combobox prefilled,
  // operator code combobox empty, operator password empty).
  const inputs = dialog.locator('input:visible');
  const count = await inputs.count();
  if (count === 0) {
    throw new Error(
      'EMMA Stage 4: Property-Modal hat keine sichtbaren Eingabefelder.',
    );
  }

  let codeFilled = false;
  let passFilled = false;
  for (let i = 0; i < count; i++) {
    const inp = inputs.nth(i);
    const type = (await inp.getAttribute('type'))?.toLowerCase() ?? 'text';
    if (type === 'password') {
      if (!passFilled) {
        await inp.fill(opts.operatorPassword);
        passFilled = true;
      }
      continue;
    }
    if (codeFilled) continue;
    const value = (await inp.inputValue().catch(() => '')).trim();
    if (value) continue; // property combobox is prefilled — skip it
    await inp.fill(opts.operatorCode.trim());
    codeFilled = true;
  }
  if (!codeFilled || !passFilled) {
    throw new Error(
      'EMMA Stage 4: konnte Operator-Code/-Passwort-Felder nicht eindeutig zuordnen.',
    );
  }

  await loginBtn.click();
  progress(opts, '[EMMA] Stage 4/4 Property-Login — gesendet');
  await dialog
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => undefined);
  await sleep(1000);
}

/**
 * Heuristic: are we currently parked on any of the four EMMA login screens?
 * Used by the session service to decide whether to re-run `emmaLogin`.
 */
export async function emmaIsOnLoginScreen(page: Page): Promise<boolean> {
  const url = page.url();
  const title = await page.title().catch(() => '');
  // Stage 2 — Microsoft MFA page title in the RHG flow.
  if (/RHGMFA/i.test(title)) return true;
  // ADFS / corporate SSO — often still in flight right after launchpad goto.
  if (/signon\.radissonhotels\.com/i.test(url)) return true;
  if (/\/adfs\/ls/i.test(url)) return true;
  if (/[?&]ssoCookie=/i.test(url)) return true; // RHGMFA stage
  // SAP Fiori Logon page renders inputs with placeholder="User"/"Password"
  // plus a "Log On" button — none of which exist on the authenticated home.
  if (
    (await page
      .locator('input[placeholder="User" i]:not([type="password"])')
      .count()
      .catch(() => 0)) > 0 &&
    (await page
      .locator('button:has-text("Log On")')
      .count()
      .catch(() => 0)) > 0
  ) {
    return true;
  }
  // Stage 4 property modal still up?
  if (
    (await page
      .locator('[role="dialog"] button[title="Login"], [role="dialog"]:has-text("Login")')
      .count()
      .catch(() => 0)) > 0
  ) {
    return true;
  }
  return false;
}
