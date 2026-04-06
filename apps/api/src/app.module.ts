import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { RoomsModule } from './rooms/rooms.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { PhotosModule } from './photos/photos.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { LostFoundModule } from './lost-found/lost-found.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { InspectionsModule } from './inspections/inspections.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RoomTypesModule } from './room-types/room-types.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';
import { FloorPlansModule } from './floor-plans/floor-plans.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    RealtimeModule,
    StorageModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    RoomsModule,
    ChecklistsModule,
    PhotosModule,
    ServiceRequestsModule,
    LostFoundModule,
    AssignmentsModule,
    InspectionsModule,
    AnalyticsModule,
    RoomTypesModule,
    FloorPlansModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
