import type { Page } from 'playwright';
import { readFile, stat } from 'fs/promises';
import type { EmmaOpenFolioOnStep, EmmaOpenFolioProgressStep } from './emma-reservation-folio-open';

/**
 * Company / billing fields to apply on the folio invoice (from KI extraction).
 * Labels in EMMA may differ by language and release — {@link runEmmaFolioInvoiceWorkflow}
 * uses tolerant RegExp matching and must be verified against the live Folio app.
 */
export type EmmaFolioInvoiceCompanyInput = {
  companyName?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  vatNumber?: string | null;
};

export type EmmaFolioInvoiceWorkflowOpts = {
  /**
   * Rechnungskorrektur: bestehende Rechnungen zuerst über EMMA **Cancel Invoice** stornieren
   * (Toolbar auf Folio Management), danach ggf. Bestätigungsdialog.
   */
  cancelExistingInvoices?: boolean;
  /**
   * Nach Storno: EMMA zeigt oft **Till and Employee** mit Passwort — üblicherweise dasselbe
   * wie Admin → EMMA **Operator password** (Stufe 4). Ohne Wert: Schritt wird protokolliert,
   * Continue ggf. scheitert bis manuell.
   */
  tillEmployeePassword?: string | null;
  /** Zeile in der Combobox **Tills**, z. B. `FD1013 - David Eich` (Admin → EMMA). */
  tillName?: string | null;
  /** Mitarbeitercode auf demselben Dialog — i. d. R. gleich **Operator-Code** (Stufe 4). */
  tillEmployeeCode?: string | null;
  companyBilling?: EmmaFolioInvoiceCompanyInput | null;
  /** Try to trigger a PDF download after save (button labels vary). */
  downloadPdf?: boolean;
};

export type EmmaFolioInvoiceWorkflowResult = {
  invoicePdfBase64?: string;
  invoicePdfFileName?: string;
};

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function emitStep(
  onStep: EmmaOpenFolioOnStep | undefined,
  step: EmmaOpenFolioProgressStep,
  message: string,
) {
  onStep?.({ step, message });
}

/** After **Cancel Invoice** / similar, SAP/Fiori often shows a confirmation popup. */
async function confirmEmmaPopupIfPresent(page: Page, maxWaitMs: number) {
  const patterns = [
    /^(OK|Yes|Confirm|Continue|Apply)$/i,
    /Bestätigen|Übernehmen|^Ja$/i,
  ];
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    for (const pattern of patterns) {
      const btn = page.getByRole('button', { name: pattern }).first();
      if (await btn.isVisible().catch(() => false)) {
        const disabled = await btn.isDisabled().catch(() => true);
        if (!disabled) {
          await btn.click({ timeout: 10_000 });
          await sleep(500);
          return true;
        }
      }
    }
    await sleep(200);
  }
  return false;
}

async function fillTextboxByNameRegex(
  page: Page,
  label: RegExp,
  value: string,
): Promise<boolean> {
  const tb = page.getByRole('textbox', { name: label }).first();
  if (!(await tb.isVisible().catch(() => false))) {
    return false;
  }
  await tb.click();
  await tb.fill('');
  await tb.fill(value);
  return true;
}

function cancelInvoiceDialogShell(page: Page) {
  const title = page.getByRole('heading', {
    name: /^(Cancel invoice|Rechnung stornieren)$/i,
  });
  return title.locator('xpath=ancestor::div[contains(@class,"sapMDialog")][1]');
}

type TillEmployeeAfterCancelCtx = {
  tillName?: string | null;
  tillEmployeeCode?: string | null;
  tillEmployeePassword?: string | null;
};

/** Nach Storno + Stornogrund folgt oft **Till and Employee** (Tills, Employee, Password, Continue). */
async function runTillAndEmployeeAfterInvoiceCancel(
  page: Page,
  ctx: TillEmployeeAfterCancelCtx,
  onStep: EmmaOpenFolioOnStep | undefined,
) {
  const tillHeading = page.getByRole('heading', {
    name: /Till and Employee|Kasse und Mitarbeiter|Tills and Employee/i,
  });
  await tillHeading.waitFor({ state: 'visible', timeout: 45_000 });

  const dialogScope = page
    .getByRole('dialog')
    .filter({ has: tillHeading })
    .first();

  const scope =
    (await dialogScope.count()) > 0 && (await dialogScope.isVisible().catch(() => false))
      ? dialogScope
      : page;

  emitStep(
    onStep,
    'folio_invoice_cancel_till',
    'Till & Mitarbeiter — Kasse, Mitarbeitercode und Passwort (aus Admin EMMA / Operator).',
  );

  const tillLine = ctx.tillName?.trim();
  if (tillLine) {
    const tillsCb = scope.getByRole('combobox', { name: /^Tills$/i }).first();
    if (await tillsCb.isVisible().catch(() => false)) {
      await tillsCb.click();
      await sleep(250);
      const inner = tillsCb.locator('input').first();
      if (await inner.isVisible().catch(() => false)) {
        await inner.fill('');
        await inner.fill(tillLine);
      } else {
        await tillsCb.pressSequentially(tillLine);
      }
      await tillsCb.press('Enter').catch(() => undefined);
      await sleep(400);
      emitStep(onStep, 'folio_invoice_cancel_till', `Till gesetzt: ${tillLine}`);
    } else {
      emitStep(
        onStep,
        'folio_invoice_cancel_till',
        'Tills-Combobox nicht gefunden — Till in EMMA prüfen.',
      );
    }
  }

  const empCode = ctx.tillEmployeeCode?.trim();
  if (empCode) {
    const empTb = scope.getByRole('textbox', { name: /^Employee$/i }).first();
    if (await empTb.isVisible().catch(() => false)) {
      await empTb.click();
      await empTb.fill('');
      await empTb.fill(empCode);
      emitStep(onStep, 'folio_invoice_cancel_till', 'Mitarbeiter-Code eingetragen.');
    } else {
      const empCb = scope.getByRole('combobox', { name: /^Employee$/i }).first();
      if (await empCb.isVisible().catch(() => false)) {
        await empCb.click();
        await sleep(250);
        const inner = empCb.locator('input').first();
        if (await inner.isVisible().catch(() => false)) {
          await inner.fill('');
          await inner.fill(empCode);
        } else {
          await empCb.pressSequentially(empCode);
        }
        await empCb.press('Enter').catch(() => undefined);
        emitStep(onStep, 'folio_invoice_cancel_till', 'Mitarbeiter (Combobox) gesetzt.');
      }
    }
  }

  const pwd = scope.getByRole('textbox', { name: /^Password$/i }).first();
  if (await pwd.isVisible().catch(() => false)) {
    if (ctx.tillEmployeePassword?.trim()) {
      await pwd.click();
      await pwd.fill(ctx.tillEmployeePassword.trim());
      emitStep(onStep, 'folio_invoice_cancel_till', 'Passwort eingetragen (Settings → EMMA Operator).');
    } else {
      emitStep(
        onStep,
        'folio_invoice_cancel_till',
        'Passwort-Feld sichtbar — bitte Operator-Passwort in Admin Settings (EMMA) hinterlegen oder manuell.',
      );
    }
  }

  const cont = scope.getByRole('button', { name: /^Continue$/i }).first();
  if (await cont.isVisible().catch(() => false)) {
    await cont.click({ timeout: 20_000 });
  } else {
    const weiter = scope.getByRole('button', { name: /^(Weiter|Fortfahren)$/i }).first();
    if (await weiter.isVisible().catch(() => false)) {
      await weiter.click({ timeout: 20_000 });
    } else {
      throw new Error('Till and Employee: Continue/Weiter nicht gefunden.');
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await sleep(800);
  await confirmEmmaPopupIfPresent(page, 15_000);
}

/** EMMA erlaubt pro Vorgang nur **eine** Invoice zu stornieren — erste Zeile in der Liste. */
async function runCancelInvoiceWizard(
  page: Page,
  ctx: TillEmployeeAfterCancelCtx,
  onStep: EmmaOpenFolioOnStep | undefined,
) {
  const title = page.getByRole('heading', {
    name: /^(Cancel invoice|Rechnung stornieren)$/i,
  });
  await title.waitFor({ state: 'visible', timeout: 45_000 });
  emitStep(
    onStep,
    'folio_invoice_cancel_dialog',
    'Liste der Rechnungen (Spalte Folio) — genau eine Rechnung auswählen …',
  );

  let shell = cancelInvoiceDialogShell(page);
  if ((await shell.count()) === 0) {
    shell = page
      .locator('div')
      .filter({ has: title })
      .filter({ has: page.getByRole('columnheader', { name: 'Invoice Number' }) })
      .first();
  }
  const scope = shell;

  const itemRadio = scope.getByRole('radio', { name: 'Item Selection' }).first();
  if (await itemRadio.isVisible().catch(() => false)) {
    await itemRadio.click({ timeout: 15_000 });
    emitStep(
      onStep,
      'folio_invoice_cancel_dialog',
      'Erste Rechnung gewählt (Radio „Item Selection“).',
    );
  } else {
    const rowPickers = scope.getByRole('gridcell', { name: /To select row|SPACEBAR|Zeile wählen/i });
    const n = await rowPickers.count();
    if (n === 0) {
      throw new Error(
        'Cancel-Invoice-Dialog: keine Zeile zum Anwählen — Tabelle oder Berechtigung prüfen.',
      );
    }
    await rowPickers.first().click({ timeout: 15_000 });
    emitStep(onStep, 'folio_invoice_cancel_dialog', 'Erste Rechnung (Zeilenwahl per Tabelle).');
  }

  const acceptInCancelDlg = () => {
    const s = cancelInvoiceDialogShell(page);
    return s.getByRole('button', { name: /^Accept$/i }).first();
  };
  let acc = acceptInCancelDlg();
  if (!(await acc.isVisible().catch(() => false))) {
    acc = scope.getByRole('button', { name: /^Accept$/i }).first();
  }
  if (await acc.isVisible().catch(() => false)) {
    await acc.click({ timeout: 15_000 });
  } else {
    const alt = scope.getByRole('button', { name: /^(Übernehmen|Bestätigen|OK)$/i }).first();
    if (await alt.isVisible().catch(() => false)) {
      await alt.click({ timeout: 15_000 });
    } else {
      throw new Error('Cancel-Invoice-Dialog: Accept nicht gefunden.');
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await sleep(700);

  emitStep(onStep, 'folio_invoice_cancel_reason', 'Stornogrund: ein Leerzeichen …');
  const reasonLabels = [
    /Reason for cancellation/i,
    /Cancellation reason/i,
    /Stornogrund/i,
    /Grund.*Storno/i,
    /Begründung.*Storno/i,
  ];
  let reasonDone = false;
  if (
    await page
      .getByLabel(/Reason for cancellation|Cancellation reason|Stornogrund/i)
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    const field = page
      .getByLabel(/Reason for cancellation|Cancellation reason|Stornogrund/i)
      .first();
    await field.click();
    await field.fill(' ');
    reasonDone = true;
  }
  if (!reasonDone) {
    for (const label of reasonLabels) {
      const tb = page.getByRole('textbox', { name: label }).first();
      if (await tb.isVisible().catch(() => false)) {
        await tb.click();
        await tb.fill(' ');
        reasonDone = true;
        break;
      }
    }
  }
  if (!reasonDone) {
    const dlgText = cancelInvoiceDialogShell(page).locator('[role="textbox"], input:not([readonly])').first();
    if (await dlgText.isVisible({ timeout: 4000 }).catch(() => false)) {
      await dlgText.click();
      await dlgText.fill(' ');
      reasonDone = true;
    }
  }
  if (!reasonDone) {
    const combobox = page.getByRole('combobox', { name: /reason|cancellation|storno|grund/i }).first();
    if (await combobox.isVisible().catch(() => false)) {
      await combobox.click();
      await combobox.fill(' ');
      reasonDone = true;
    }
  }
  if (!reasonDone) {
    emitStep(
      onStep,
      'folio_invoice_cancel_reason',
      'Feld „Reason for cancellation“ nicht gefunden — bitte Selektor melden.',
    );
  } else {
    emitStep(onStep, 'folio_invoice_cancel_reason', 'Stornogrund gesetzt (ein Leerzeichen).');
  }

  if (reasonDone) {
    let acc2 = acceptInCancelDlg();
    if (!(await acc2.isVisible().catch(() => false))) {
      acc2 = page.getByRole('button', { name: /^Accept$/i }).first();
    }
    if (await acc2.isVisible().catch(() => false)) {
      await acc2.click({ timeout: 15_000 });
    } else {
      const ok = page.getByRole('button', { name: /^(OK|Post|Übernehmen|Bestätigen)$/i }).first();
      if (await ok.isVisible().catch(() => false)) {
        await ok.click({ timeout: 15_000 });
      } else {
        await confirmEmmaPopupIfPresent(page, 15_000);
      }
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await sleep(900);

  try {
    await runTillAndEmployeeAfterInvoiceCancel(page, ctx, onStep);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStep(
      onStep,
      'folio_invoice_cancel_till',
      `Till-Schritt nicht automatisch: ${msg}`,
    );
  }

  await confirmEmmaPopupIfPresent(page, 15_000);
}

/**
 * Run on the page that already shows **Folio Management** (`zey_tms_reservations_folio-display`).
 *
 * **Operational note:** Radisson EMMA is a customised SAP UI. This flow is a best-effort
 * scaffold: record the exact Folio screen with Playwright Codegen on property VPN and
 * tighten selectors (tabs, table rows, “change” / “save”, PDF) here.
 */
export async function runEmmaFolioInvoiceWorkflow(
  page: Page,
  opts: EmmaFolioInvoiceWorkflowOpts,
  onStep?: EmmaOpenFolioOnStep,
): Promise<EmmaFolioInvoiceWorkflowResult> {
  const out: EmmaFolioInvoiceWorkflowResult = {};

  emitStep(onStep, 'folio_invoice_wait', 'Folio-Ansicht stabilisieren …');
  await page.waitForURL(/zey_tms_reservations_folio-display/, { timeout: 60_000 }).catch(() => {
    throw new Error(
      'Erwartete Folio-URL (zey_tms_reservations_folio-display) nicht erreicht — Navigation prüfen.',
    );
  });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
  await sleep(1200);

  if (opts.cancelExistingInvoices) {
    emitStep(onStep, 'folio_invoice_cancel', 'Cancel Invoice (bestehende Rechnungen) …');
    const cancelInv = page
      .getByRole('button', {
        name: /^(Cancel Invoice|Rechnung stornieren|Storno Rechnung)$/i,
      })
      .first();
    await cancelInv.waitFor({ state: 'visible', timeout: 45_000 });
    if (await cancelInv.isDisabled().catch(() => true)) {
      emitStep(
        onStep,
        'folio_invoice_cancel',
        'Cancel Invoice ist deaktiviert — vermutlich keine stornierbare Rechnung; überspringe.',
      );
    } else {
      await cancelInv.click({ timeout: 20_000 });
      await sleep(600);
      try {
        await runCancelInvoiceWizard(
          page,
          {
            tillName: opts.tillName,
            tillEmployeeCode: opts.tillEmployeeCode,
            tillEmployeePassword: opts.tillEmployeePassword,
          },
          onStep,
        );
        emitStep(
          onStep,
          'folio_invoice_cancel',
          'Cancel-Invoice-Assistent durchlaufen (1 Rechnung, Stornogrund Leerzeichen).',
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emitStep(
          onStep,
          'folio_invoice_cancel',
          `Dialog nicht vollständig automatisiert: ${msg} — Fallback: generischer Bestätigungs-Klick.`,
        );
        await confirmEmmaPopupIfPresent(page, 20_000);
      }
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
      await sleep(800);
    }
  }

  emitStep(onStep, 'folio_invoice_nav', 'Rechnung / Billing suchen …');
  const tabCandidates = [
    page.getByRole('tab', { name: /^(Invoice|Invoices|Billing|Folio)$/i }),
    page.getByRole('tab', { name: /Rechnung/i }),
    page.getByRole('tab', { name: /Abrechnung/i }),
  ];
  for (const tab of tabCandidates) {
    if (await tab.first().isVisible().catch(() => false)) {
      await tab.first().click();
      await sleep(700);
      break;
    }
  }

  // Generic invoice line / document area: open first data row if the table looks like SAP UI5.
  const firstRow = page.locator('tr.sapMListTblRow, tr[data-sap-ui-rowindex]').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click({ timeout: 10_000 }).catch(() => undefined);
    await sleep(400);
  }

  const billing = opts.companyBilling;
  const hasBilling =
    billing &&
    Object.values(billing).some((v) => typeof v === 'string' && v.trim().length > 0);

  if (hasBilling && billing) {
    emitStep(onStep, 'folio_invoice_edit_open', 'Bearbeiten / Ändern …');
    const editPatterns = [
      page.getByRole('button', { name: /Edit|Change|Ändern|Pflegen|Anpassen/i }),
      page.getByRole('menuitem', { name: /Edit|Change|Ändern/i }),
    ];
    let opened = false;
    for (const loc of editPatterns) {
      const b = loc.first();
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 15_000 });
        opened = true;
        await sleep(800);
        break;
      }
    }
    if (!opened) {
      emitStep(
        onStep,
        'folio_invoice_edit_open',
        'Keine klare „Bearbeiten“-Schaltfläche — Felder werden trotzdem versucht (UI kann bereits im Ändern-Modus sein).',
      );
    }

    emitStep(onStep, 'folio_invoice_fill_company', 'Firmendaten aus KI-Erkennung eintragen …');

    const streetLine =
      [billing.street, billing.houseNumber].filter(Boolean).join(' ').trim() || null;

    const attempts: { label: RegExp; value: string | null }[] = [
      { label: /company|firm(enname)?|organisation/i, value: billing.companyName ?? null },
      { label: /street|straße|strasse|address\s*line/i, value: streetLine },
      { label: /postal|zip|plz/i, value: billing.postalCode ?? null },
      { label: /city|ort|town/i, value: billing.city ?? null },
      { label: /country|land/i, value: billing.country ?? null },
      { label: /vat|uid|mwst|ust/i, value: billing.vatNumber ?? null },
    ];

    let filled = 0;
    for (const { label, value } of attempts) {
      if (!value?.trim()) continue;
      if (await fillTextboxByNameRegex(page, label, value.trim())) {
        filled++;
      }
    }

    if (filled === 0) {
      emitStep(
        onStep,
        'folio_invoice_fill_company',
        'Keine passenden Eingabefelder gefunden — bitte Selektoren an die EMMA-Folio-Maske anpassen.',
      );
    } else {
      emitStep(onStep, 'folio_invoice_fill_company', `${filled} Felder befüllt.`);
    }

    emitStep(onStep, 'folio_invoice_save', 'Speichern / Übernehmen …');
    const saveBtn = page
      .getByRole('button', { name: /Save|Post|OK|Übernehmen|Speichern|Sichern/i })
      .first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click({ timeout: 20_000 });
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined);
      await sleep(1000);
    } else {
      emitStep(
        onStep,
        'folio_invoice_save',
        'Keine Speichern-Schaltfläche gefunden — ggf. manuell speichern.',
      );
    }
  }

  if (opts.downloadPdf) {
    emitStep(onStep, 'folio_invoice_download_pdf', 'PDF / Druck suchen …');
    const pdfBtn = page
      .getByRole('button', { name: /PDF|Print|Druck|Download|Herunterladen/i })
      .first();

    if (await pdfBtn.isVisible().catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
      await pdfBtn.click({ timeout: 20_000 });
      const download = await downloadPromise;
      const suggested = download.suggestedFilename() || 'invoice.pdf';
      const tmpPath = await download.path();
      if (tmpPath) {
        const st = await stat(tmpPath);
        if (st.size > MAX_PDF_BYTES) {
          throw new Error(`PDF zu groß (${st.size} Bytes, max ${MAX_PDF_BYTES}).`);
        }
        const buf = await readFile(tmpPath);
        out.invoicePdfBase64 = buf.toString('base64');
        out.invoicePdfFileName = suggested;
        emitStep(
          onStep,
          'folio_invoice_download_pdf',
          `PDF geladen: ${suggested} (${st.size} Bytes).`,
        );
      } else {
        const stream = await download.createReadStream();
        if (!stream) {
          throw new Error('PDF-Download: weder temporärer Pfad noch Stream verfügbar.');
        }
        const buf = await streamToBuffer(stream);
        if (buf.length > MAX_PDF_BYTES) {
          throw new Error(`PDF zu groß (${buf.length} Bytes, max ${MAX_PDF_BYTES}).`);
        }
        out.invoicePdfBase64 = buf.toString('base64');
        out.invoicePdfFileName = suggested;
        emitStep(
          onStep,
          'folio_invoice_download_pdf',
          `PDF geladen: ${suggested} (${buf.length} Bytes).`,
        );
      }
    } else {
      emitStep(
        onStep,
        'folio_invoice_download_pdf',
        'Keine PDF/Druck-Schaltfläche erkannt — bitte manuell exportieren oder Selektor ergänzen.',
      );
    }
  }

  return out;
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
