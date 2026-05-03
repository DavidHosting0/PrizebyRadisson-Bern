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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PuzzelReplyDto } from './dto/puzzel-reply.dto';
import { PuzzleService } from './puzzle.service';

@Controller('puzzle')
export class PuzzleController {
  constructor(private readonly puzzle: PuzzleService) {}

  @Get('filter')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  filter() {
    return this.puzzle.getFilter();
  }

  @Patch('filter')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  tickets() {
    return this.puzzle.listTickets();
  }

  @Get('tickets/:id/messages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  ticketMessages(@Param('id') id: string) {
    return this.puzzle.getTicketMessages(id);
  }

  @Post('tickets/:id/messages/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  refreshTicketMessages(@Param('id') id: string) {
    return this.puzzle.refreshTicketMessages(id);
  }

  @Post('tickets/:id/assign-to-me')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  assignTicketToMe(@Param('id') id: string) {
    return this.puzzle.assignTicketToMe(id);
  }

  @Post('tickets/:id/reply')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  resolveTicket(@Param('id') id: string) {
    return this.puzzle.resolveTicket(id);
  }

  @Get('sync-status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  syncStatus() {
    return this.puzzle.getSyncStatus();
  }

  @Post('sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  triggerSync() {
    return this.puzzle.requestBackgroundSync();
  }

  @Get('tickets/:id/analysis')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  getTicketAnalysis(@Param('id') id: string) {
    return this.puzzle.getTicketAnalysis(id);
  }

  @Post('tickets/:id/analysis/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  refreshTicketAnalysis(@Param('id') id: string) {
    return this.puzzle.refreshTicketAnalysis(id);
  }
}
