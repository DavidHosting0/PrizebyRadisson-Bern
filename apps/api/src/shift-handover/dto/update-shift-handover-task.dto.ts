import { IsBoolean } from 'class-validator';

export class UpdateShiftHandoverTaskDto {
  @IsBoolean()
  completed!: boolean;
}
