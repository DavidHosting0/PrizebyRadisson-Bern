import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { SystemRolesInitializer } from './system-roles.initializer';

@Module({
  imports: [PrismaModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, SystemRolesInitializer],
  exports: [PermissionsService],
})
export class PermissionsModule {}
