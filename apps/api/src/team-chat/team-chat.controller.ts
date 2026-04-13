import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PermissionCode, User } from '@prisma/client';
import { TeamChatService } from './team-chat.service';
import { PostTeamChatDto } from './dto/post-team-chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@Controller('team-chat')
export class TeamChatController {
  constructor(private readonly svc: TeamChatService) {}

  @Get('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_READ)
  list(@Query('limit') limit?: string) {
    return this.svc.list(limit ? parseInt(limit, 10) : 200);
  }

  @Post('messages')
  @RequirePermissions(PermissionCode.TEAM_CHAT_POST)
  post(@Body() dto: PostTeamChatDto, @CurrentUser() user: User) {
    return this.svc.create(dto.body, user);
  }
}
