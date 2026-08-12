import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PostTeamChatDto {
  /** Caption / text. Optional when `photoS3Key` is set (photo-only messages). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  photoS3Key?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}
