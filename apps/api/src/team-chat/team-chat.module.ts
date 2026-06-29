import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TranslationModule } from '../translation/translation.module';
import { TeamChatController } from './team-chat.controller';
import { TeamChatService } from './team-chat.service';

@Module({
  imports: [PermissionsModule, NotificationsModule, TranslationModule],
  controllers: [TeamChatController],
  providers: [TeamChatService],
})
export class TeamChatModule {}
