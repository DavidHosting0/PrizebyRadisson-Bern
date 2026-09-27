import { IsIn } from 'class-validator';

export class ShiftRoomSuggestionDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}
