import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  /**
   * Returns who works in the requested window.
   *
   *  GET /shifts/roster                 → today (Europe/Zurich local day)
   *  GET /shifts/roster?date=2026-05-04 → that day
   *  GET /shifts/roster?date=...&days=7 → that day plus 6 (a week)
   */
  @Get('roster')
  @RequirePermissions(PermissionCode.SHIFT_READ)
  roster(@Query('date') date?: string, @Query('days') days?: string) {
    const from = parseDate(date);
    const span = days ? parseInt(days, 10) : 1;
    if (!Number.isFinite(span) || span < 1 || span > 31) {
      throw new BadRequestException('"days" must be 1..31');
    }
    const to = new Date(from);
    to.setDate(to.getDate() + span);
    return this.shifts.getRoster(from, to);
  }
}

function parseDate(raw: string | undefined): Date {
  if (!raw) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) throw new BadRequestException('"date" must be YYYY-MM-DD');
  const [_, y, mo, d] = m;
  void _;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid "date"');
  }
  return date;
}
