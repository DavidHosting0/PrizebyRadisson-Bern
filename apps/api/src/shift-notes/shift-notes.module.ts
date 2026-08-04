import { Module } from '@nestjs/common';
import { ShiftNotesController } from './shift-notes.controller';
import { ShiftNotesService } from './shift-notes.service';

@Module({
  controllers: [ShiftNotesController],
  providers: [ShiftNotesService],
})
export class ShiftNotesModule {}
