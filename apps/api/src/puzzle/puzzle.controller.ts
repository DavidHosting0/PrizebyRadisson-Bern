import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { PermissionCode } from '@prisma/client';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PuzzelReplyDto } from './dto/puzzel-reply.dto';
import { PuzzleService } from './puzzle.service';

@Controller('puzzle')
export class PuzzleController {
  constructor(private readonly puzzle: PuzzleService) {}

  @Get('filter')
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  filter() {
    return this.puzzle.getFilter();
  }

  @Patch('filter')
  @RequirePermissions(PermissionCode.SETTINGS_WRITE)
  updateFilter(
    @Body()
    body: {
      savedSearchName?: string;
      teamName?: string;
      statusName?: string;
      timePeriod?: string;
    },
  ) {
    return this.puzzle.updateFilter(body);
  }

  @Get('tickets')
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  tickets() {
    return this.puzzle.listTickets();
  }

  @Get('tickets/:id/messages')
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  ticketMessages(@Param('id') id: string) {
    return this.puzzle.getTicketMessages(id);
  }

  @Post('tickets/:id/messages/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PermissionCode.SETTINGS_WRITE)
  refreshTicketMessages(@Param('id') id: string) {
    return this.puzzle.refreshTicketMessages(id);
  }

  @Post('tickets/:id/assign-to-me')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  assignTicketToMe(@Param('id') id: string) {
    return this.puzzle.assignTicketToMe(id);
  }

  @Post('tickets/:id/reply')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'attachments', maxCount: 10 }], {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  replyToTicket(
    @Param('id') id: string,
    @Body() body: PuzzelReplyDto,
    @UploadedFiles()
    files?: { attachments?: Express.Multer.File[] },
  ) {
    return this.puzzle.replyToTicket(id, {
      message: body?.message,
      attachments: files?.attachments as Express.Multer.File[] | Express.Multer.File | undefined,
    });
  }

  @Post('tickets/:id/resolve')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  resolveTicket(@Param('id') id: string) {
    return this.puzzle.resolveTicket(id);
  }

  @Get('sync-status')
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  syncStatus() {
    return this.puzzle.getSyncStatus();
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PermissionCode.SETTINGS_WRITE)
  triggerSync() {
    return this.puzzle.requestBackgroundSync();
  }

  @Get('tickets/:id/analysis')
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  getTicketAnalysis(@Param('id') id: string) {
    return this.puzzle.getTicketAnalysis(id);
  }

  @Post('tickets/:id/analysis/refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PermissionCode.SETTINGS_READ)
  refreshTicketAnalysis(@Param('id') id: string) {
    return this.puzzle.refreshTicketAnalysis(id);
  }
}
