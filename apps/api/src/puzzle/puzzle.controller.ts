import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
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
  replyToTicket(
    @Param('id') id: string,
    @Body()
    body: {
      message?: string;
    },
  ) {
    return this.puzzle.replyToTicket(id, body);
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
}
