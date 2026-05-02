import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PuzzleService } from './puzzle.service';

@Controller('puzzle')
export class PuzzleController {
  constructor(private readonly puzzle: PuzzleService) {}

  @Get('tickets')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RECEPTION, UserRole.ADMIN)
  tickets() {
    return this.puzzle.listTickets();
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
