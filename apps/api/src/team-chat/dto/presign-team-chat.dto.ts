import { IsString } from 'class-validator';

export class PresignTeamChatDto {
  @IsString()
  contentType!: string;
}
