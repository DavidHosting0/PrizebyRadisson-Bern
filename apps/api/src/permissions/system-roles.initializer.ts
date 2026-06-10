import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ensureSystemRoles } from './ensure-system-roles';

@Injectable()
export class SystemRolesInitializer implements OnModuleInit {
  private readonly log = new Logger(SystemRolesInitializer.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await ensureSystemRoles(this.prisma);
    } catch (e) {
      this.log.error('Failed to ensure system roles', e);
      throw e;
    }
  }
}
