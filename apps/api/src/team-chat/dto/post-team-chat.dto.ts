import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PostTeamChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
