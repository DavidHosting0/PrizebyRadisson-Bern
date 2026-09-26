import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptRoomSuggestionDto {
  @IsString()
  @IsNotEmpty()
  roomNumber!: string;
}
