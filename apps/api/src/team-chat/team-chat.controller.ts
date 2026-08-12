import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { TeamChatService } from './team-chat.service';
import { PostTeamChatDto } from './dto/post-team-chat.dto';
import { PresignTeamChatDto } from './dto/presign-team-chat.dto';
import { ToggleReactionDto } from './dto/toggle-reaction.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@Controller('team-chat')
export class TeamChatController {
  constructor(private readonly svc: TeamChatService) {}

  @Get('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_READ)
  list(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
    @Query('lang') lang?: string,
    @Query('order') order?: string,
  ) {
    const dir = order === 'desc' ? 'desc' : 'asc';
    return this.svc.list(limit ? parseInt(limit, 10) : 200, user, lang, dir);
  }

  @Get('mentionables')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  mentionables(@Query('q') q?: string) {
    return this.svc.listMentionables(q ?? '');
  }

  @Post('presign')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  presign(@Body() dto: PresignTeamChatDto) {
    return this.svc.presign(dto.contentType);
  }

  @Post('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  post(@Body() dto: PostTeamChatDto, @CurrentUser() user: User) {
    const replyToId = dto.replyToId?.trim() || undefined;
    const mentionUserIds = dto.mentionUserIds?.filter(Boolean) ?? [];
    const photoS3Key = dto.photoS3Key?.trim() || undefined;
    return this.svc.create(dto.body ?? '', user, replyToId, mentionUserIds, photoS3Key);
  }

  @Post('messages/:messageId/reactions')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  toggleReaction(
    @Param('messageId') messageId: string,
    @Body() dto: ToggleReactionDto,
    @CurrentUser() user: User,
  ) {
    return this.svc.toggleReaction(messageId, dto.emoji, user);
  }

  @Delete('messages/:messageId')
  @RequirePermissions(PermissionCode.TEAM_CHAT_DELETE)
  deleteMessage(@Param('messageId') messageId: string, @CurrentUser() user: User) {
    return this.svc.softDelete(messageId, user);
  }
}
