import { IsEnum, ValidateIf } from 'class-validator';
import { UserTitlePrefix } from '@prisma/client';

export class UpdateChatTitlePrefixDto {
  /** Null clears the override so chat falls back to app-area titlePrefix. */
  @ValidateIf((_, v) => v !== null)
  @IsEnum(UserTitlePrefix)
  chatTitlePrefix!: UserTitlePrefix | null;
}
