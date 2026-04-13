import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { TeamChatService } from './team-chat.service';
import { PostTeamChatDto } from './dto/post-team-chat.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@Controller('team-chat')
export class TeamChatController {
  constructor(private readonly svc: TeamChatService) {}

  @Get('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_READ)
  list(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.svc.list(limit ? parseInt(limit, 10) : 200, user);
  }

  @Post('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  post(@Body() dto: PostTeamChatDto, @CurrentUser() user: User) {
    const replyToId = dto.replyToId?.trim() || undefined;
    return this.svc.create(dto.body, user, replyToId);
  }

  @Post('messages/:messageId/reactions')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  toggleReaction(
    @Param('messageId') messageId: string,
    @Body() dto: ToggleReactionDto,
    @CurrentUser() user: User,
  ) {
    return this.svc.toggleReaction(messageId, dto.type, user);
  }
}
