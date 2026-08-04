import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { RoomsModule } from './rooms/rooms.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { PhotosModule } from './photos/photos.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { LostFoundModule } from './lost-found/lost-found.module';
import { DamageReportsModule } from './damage-reports/damage-reports.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { InspectionsModule } from './inspections/inspections.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RoomTypesModule } from './room-types/room-types.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';
import { FloorPlansModule } from './floor-plans/floor-plans.module';
import { TeamChatModule } from './team-chat/team-chat.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { ShiftsModule } from './shifts/shifts.module';
import { MirusModule } from './mirus/mirus.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { EmmaModule } from './emma/emma.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ArrivalCheckModule } from './arrival-check/arrival-check.module';
import { DeparturesModule } from './departures/departures.module';
import { MonitorMapModule } from './monitor-map/monitor-map.module';
import { GuidesModule } from './guides/guides.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';
import { RoomManagementModule } from './room-management/room-management.module';
import { FrontOfficeModule } from './front-office/front-office.module';
import { ShiftHandoverModule } from './shift-handover/shift-handover.module';
import { ShiftNotesModule } from './shift-notes/shift-notes.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { LoansModule } from './loans/loans.module';
import { ActivityLogModule } from './activity-log/activity-log.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RealtimeModule,
    StorageModule,
    CryptoModule,
    PermissionsModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    RoomsModule,
    ChecklistsModule,
    PhotosModule,
    ServiceRequestsModule,
    LostFoundModule,
    DamageReportsModule,
    AssignmentsModule,
    InspectionsModule,
    AnalyticsModule,
    RoomTypesModule,
    FloorPlansModule,
    TeamChatModule,
    RolesModule,
    ShiftsModule,
    MirusModule,
    PuzzleModule,
    EmmaModule,
    ReservationsModule,
    ArrivalCheckModule,
    DeparturesModule,
    MonitorMapModule,
    GuidesModule,
    NotificationsModule,
    PushModule,
    RoomManagementModule,
    FrontOfficeModule,
    ShiftHandoverModule,
    ShiftNotesModule,
    ComplaintsModule,
    LoansModule,
    ActivityLogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
