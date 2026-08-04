import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionCode } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateShiftNoteDto, UpdateShiftNoteDto } from './dto/shift-note.dto';
import { ShiftNotesService } from './shift-notes.service';

@Controller('shift-notes')
export class ShiftNotesController {
  constructor(private readonly notes: ShiftNotesService) {}

  @Get()
  @RequirePermissions(PermissionCode.SHIFT_NOTES_READ)
  list(@Query('date') date?: string, @Query('shift') shift?: string) {
    return this.notes.list({ date, shift });
  }

  @Get('browse')
  @RequirePermissions(PermissionCode.SHIFT_NOTES_READ)
  browse(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 30;
    return this.notes.browse({ cursor, limit: Number.isFinite(n) ? n : 30 });
  }

  @Post()
  @RequirePermissions(PermissionCode.SHIFT_NOTES_WRITE)
  create(@Body() dto: CreateShiftNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notes.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.SHIFT_NOTES_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateShiftNoteDto) {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.SHIFT_NOTES_WRITE)
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }
}
