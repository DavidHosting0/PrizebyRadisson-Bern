import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  type EmmaOpenReservationFolioResult,
  EmmaService,
} from './emma.service';

/**
 * EMMA läuft nur nach expliziten authentifizierten Requests (Admin/Reception).
 * Beim Server-Start oder per Cron wird nichts gestartet; Chromium öffnet erst bei einem dieser Endpunkte.
 */
@Controller('emma')
export class EmmaController {
  constructor(private readonly emma: EmmaService) {}

  /** Admin UI: read EMMA credential metadata (no secrets). */
  @Get('login')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  loginMeta() {
    return this.emma.getLoginMeta();
  }

  /**
   * Drive a full Chromium login through all four EMMA stages and return where
   * we ended up. Useful for verifying credentials immediately after they are
   * stored in the admin UI.
   */
  @Post('login/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  testLogin(@Body() body: { headless?: boolean } | undefined) {
    return this.emma.testLogin({ headless: body?.headless ?? true });
  }

  /** Force the next EMMA action to perform a fresh end-to-end login. */
  @Post('session/invalidate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  invalidate() {
    return this.emma.invalidateSession();
  }

  /**
   * Search Reservations → open PMS row → Folio Management (for invoice handling).
   */
  @Post('reservation/open-folio')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  openReservationFolio(
    @Body()
    body: {
      shellSearch: string;
      gridReservationId: string;
      checkInDate?: string | null;
      checkOutDate?: string | null;
      headless?: boolean;
      invoiceWorkflow?: {
        cancelExistingInvoices?: boolean;
        companyBilling?: Record<string, string | null | undefined> | null;
        downloadPdf?: boolean;
      };
    },
  ): Promise<EmmaOpenReservationFolioResult> {
    return this.emma.openReservationFolio(body);
  }

  /**
   * Same as {@link openReservationFolio} but streams NDJSON lines:
   * `{"type":"step","step":"...","message":"..."}` then
   * `{"type":"done","ok":true,"url":"...","title":"...","durationMs":n}` or
   * `{"type":"error","message":"..."}`.
   */
  @Post('reservation/open-folio-stream')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RECEPTION)
  async openReservationFolioStream(
    @Body()
    body: {
      shellSearch: string;
      gridReservationId: string;
      checkInDate?: string | null;
      checkOutDate?: string | null;
      headless?: boolean;
      invoiceWorkflow?: {
        cancelExistingInvoices?: boolean;
        companyBilling?: Record<string, string | null | undefined> | null;
        downloadPdf?: boolean;
      };
    },
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const result = await this.emma.openReservationFolio(body, (ev) => {
        res.write(`${JSON.stringify({ type: 'step', ...ev })}\n`);
      });
      res.write(
        `${JSON.stringify({
          type: 'done',
          ok: true,
          url: result.url,
          title: result.title,
          durationMs: result.durationMs,
          invoicePdfFileName: result.invoicePdfFileName,
          invoicePdfBase64: result.invoicePdfBase64,
        })}\n`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`${JSON.stringify({ type: 'error', message })}\n`);
    }
    res.end();
  }
}
