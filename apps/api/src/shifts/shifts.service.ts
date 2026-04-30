import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';

export type RosterShift = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  source: string;
  label: string | null;
  color: string | null;
};

export type RosterEntry = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    titlePrefix: string;
    avatarUrl: string | null;
  };
  shifts: RosterShift[];
};

export type RosterPayload = {
  from: string; // ISO date
  to: string; // ISO date
  entries: RosterEntry[];
};

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Return everyone with a shift overlapping [from, to). Users without a shift
   * in the window are excluded — the roster is "who works", not "everyone".
   */
  async getRoster(from: Date, to: Date): Promise<RosterPayload> {
    const rows = await this.prisma.shift.findMany({
      where: {
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      orderBy: [{ startsAt: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            titlePrefix: true,
            isActive: true,
            avatarS3Key: true,
          },
        },
      },
    });

    const grouped = new Map<
      string,
      {
        user: RosterEntry['user'] & { avatarS3Key: string | null };
        shifts: RosterShift[];
      }
    >();
    for (const r of rows) {
      const u = r.user;
      if (!u.isActive) continue;
      let group = grouped.get(u.id);
      if (!group) {
        group = {
          user: {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            titlePrefix: u.titlePrefix,
            avatarUrl: null,
            avatarS3Key: u.avatarS3Key,
          },
          shifts: [],
        };
        grouped.set(u.id, group);
      }
      group.shifts.push({
        id: r.id,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        source: r.source,
        label: r.label,
        color: r.color,
      });
    }

    // Resolve avatars in parallel.
    const entries: RosterEntry[] = await Promise.all(
      [...grouped.values()].map(async (g) => {
        let avatarUrl: string | null = null;
        if (g.user.avatarS3Key) {
          try {
            avatarUrl = (await this.s3.presignGet(g.user.avatarS3Key)).url;
          } catch {
            avatarUrl = null;
          }
        }
        const { avatarS3Key: _drop, ...userOut } = g.user;
        void _drop;
        return {
          user: { ...userOut, avatarUrl },
          shifts: g.shifts.sort(
            (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
          ),
        };
      }),
    );

    entries.sort((a, b) => {
      const aStart = a.shifts[0]?.startsAt.getTime() ?? 0;
      const bStart = b.shifts[0]?.startsAt.getTime() ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      return a.user.name.localeCompare(b.user.name);
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      entries,
    };
  }
}
