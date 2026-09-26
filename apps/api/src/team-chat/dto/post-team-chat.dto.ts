import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PostTeamChatDto {
  /** Caption / text. Optional when photos are set (photo-only messages). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  /** @deprecated Prefer `photoS3Keys`. Kept for older clients. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  photoS3Key?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoS3Keys?: string[];

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}
