import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { TeamChatService } from './team-chat.service';
import { PostTeamChatDto } from './dto/post-team-chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('team-chat')
@UseGuards(RolesGuard)
export class TeamChatController {
  constructor(private readonly svc: TeamChatService) {}

  @Get('messages')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.RECEPTION, UserRole.ADMIN)
  list(@Query('limit') limit?: string) {
    return this.svc.list(limit ? parseInt(limit, 10) : 200);
  }

  @Post('messages')
  @Roles(UserRole.HOUSEKEEPER, UserRole.SUPERVISOR, UserRole.RECEPTION, UserRole.ADMIN)
  post(@Body() dto: PostTeamChatDto, @CurrentUser() user: User) {
    return this.svc.create(dto.body, user);
  }
}
