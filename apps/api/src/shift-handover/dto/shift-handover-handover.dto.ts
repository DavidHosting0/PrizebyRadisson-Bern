import { IsString, MinLength } from 'class-validator';

export class ShiftHandoverHandoverDto {
  @IsString()
  @MinLength(1)
  confirmShiftName!: string;
}
