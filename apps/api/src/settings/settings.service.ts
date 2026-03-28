import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    let row = await this.prisma.hotelSettings.findFirst();
    if (!row) {
      row = await this.prisma.hotelSettings.create({ data: {} });
    }
    return row;
  }

  async update(dto: { name?: string; timezone?: string; settings?: Record<string, unknown> }) {
    const current = await this.get();
    return this.prisma.hotelSettings.update({
      where: { id: current.id },
      data: {
        name: dto.name,
        timezone: dto.timezone,
        settings: dto.settings === undefined ? undefined : (dto.settings as object),
      },
    });
  }
}
