import { IsEnum } from 'class-validator';
import { TeamChatReactionType } from '@prisma/client';

export class ToggleReactionDto {
  @IsEnum(TeamChatReactionType)
  type!: TeamChatReactionType;
}
