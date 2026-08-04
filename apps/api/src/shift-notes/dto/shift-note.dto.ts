import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ReceptionHandoverShift } from '@prisma/client';

export class CreateShiftNoteDto {
  @IsString()
  forDate!: string;

  @IsArray()
  @IsEnum(ReceptionHandoverShift, { each: true })
  shifts!: ReceptionHandoverShift[];

  @IsString()
  @MinLength(1)
  body!: string;
}

export class UpdateShiftNoteDto {
  @IsOptional()
  @IsString()
  forDate?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ReceptionHandoverShift, { each: true })
  shifts?: ReceptionHandoverShift[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;
}
