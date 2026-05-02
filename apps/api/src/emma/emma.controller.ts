import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmmaService } from './emma.service';

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
}
