import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PostTeamChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  replyToId?: string;
}
