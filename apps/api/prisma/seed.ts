import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  allHotelRoomNumbers,
  floorFromRoomNumber,
  RETIRED_HOTEL_ROOM_NUMBERS,
} from '../src/rooms/room-layout';
import { ensureSystemRoles } from '../src/permissions/ensure-system-roles';
import { BERN_TICKET_GUIDE_SLUG, bernTicketGuideMarkdown, bernTicketGuideSummary } from './seed-guides';

const prisma = new PrismaClient();

/** String enum values — avoids ts-node issues when @prisma/client typings are stale before `prisma generate`. */
const UserRole = {
  ADMIN: 'ADMIN',
  HOUSEKEEPER: 'HOUSEKEEPER',
  SUPERVISOR: 'SUPERVISOR',
  RECEPTION: 'RECEPTION',
  TECHNICIAN: 'TECHNICIAN',
} as const;
const UserTitlePrefix = {
  ADMIN: 'ADMIN',
  CLEANER: 'CLEANER',
  HOUSEKEEPING_SUPERVISOR: 'HOUSEKEEPING_SUPERVISOR',
  RECEPTION: 'RECEPTION',
  TECHNICIAN: 'TECHNICIAN',
} as const;
const ChecklistTaskStatus = { NOT_STARTED: 'NOT_STARTED' } as const;
const AssignmentStatus = { ACTIVE: 'ACTIVE' } as const;

async function main() {
  const hsCount = await prisma.hotelSettings.count();
  if (hsCount === 0) {
    await prisma.hotelSettings.create({ data: { timezone: 'UTC' } });
  }

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {
      passwordHash,
      name: 'Admin User',
      role: UserRole.ADMIN,
      titlePrefix: UserTitlePrefix.ADMIN,
      isActive: true,
    },
    create: {
      email: 'admin@demo.local',
      passwordHash,
      name: 'Admin User',
      role: UserRole.ADMIN,
      titlePrefix: UserTitlePrefix.ADMIN,
    },
  });

  const hk = await prisma.user.upsert({
    where: { email: 'housekeeper@demo.local' },
    update: {
      passwordHash,
      name: 'Jane Housekeeper',
      role: UserRole.HOUSEKEEPER,
      titlePrefix: UserTitlePrefix.CLEANER,
      isActive: true,
    },
    create: {
      email: 'housekeeper@demo.local',
      passwordHash,
      name: 'Jane Housekeeper',
      role: UserRole.HOUSEKEEPER,
      titlePrefix: UserTitlePrefix.CLEANER,
    },
  });

  const sup = await prisma.user.upsert({
    where: { email: 'supervisor@demo.local' },
    update: {
      passwordHash,
      name: 'Sam Supervisor',
      role: UserRole.SUPERVISOR,
      titlePrefix: UserTitlePrefix.HOUSEKEEPING_SUPERVISOR,
      isActive: true,
    },
    create: {
      email: 'supervisor@demo.local',
      passwordHash,
      name: 'Sam Supervisor',
      role: UserRole.SUPERVISOR,
      titlePrefix: UserTitlePrefix.HOUSEKEEPING_SUPERVISOR,
    },
  });

  const tech = await prisma.user.upsert({
    where: { email: 'technician@demo.local' },
    update: {
      passwordHash,
      name: 'Tom Technician',
      role: UserRole.TECHNICIAN,
      titlePrefix: UserTitlePrefix.TECHNICIAN,
      isActive: true,
    },
    create: {
      email: 'technician@demo.local',
      passwordHash,
      name: 'Tom Technician',
      role: UserRole.TECHNICIAN,
      titlePrefix: UserTitlePrefix.TECHNICIAN,
    },
  });

  const rec = await prisma.user.upsert({
    where: { email: 'reception@demo.local' },
    update: {
      passwordHash,
      name: 'Rita Reception',
      role: UserRole.RECEPTION,
      titlePrefix: UserTitlePrefix.RECEPTION,
      isActive: true,
    },
    create: {
      email: 'reception@demo.local',
      passwordHash,
      name: 'Rita Reception',
      role: UserRole.RECEPTION,
      titlePrefix: UserTitlePrefix.RECEPTION,
    },
  });

  const template = await prisma.checklistTemplate.upsert({
    where: { id: 'seed-standard-template' },
    update: {},
    create: {
      id: 'seed-standard-template',
      name: 'Standard',
      version: 1,
    },
  });

  const taskDefs = [
    { code: 'bed', label: 'Bed made', sortOrder: 1 },
    { code: 'towels', label: 'Towels replaced', sortOrder: 2 },
    { code: 'bath', label: 'Bathroom cleaned', sortOrder: 3 },
    { code: 'trash', label: 'Trash emptied', sortOrder: 4 },
    { code: 'floor', label: 'Floor cleaned', sortOrder: 5 },
    { code: 'amenities', label: 'Amenities refilled', sortOrder: 6 },
  ];

  for (const t of taskDefs) {
    await prisma.checklistTemplateTask.upsert({
      where: {
        templateId_code: { templateId: template.id, code: t.code },
      },
      update: {},
      create: {
        templateId: template.id,
        sortOrder: t.sortOrder,
        label: t.label,
        code: t.code,
        required: true,
      },
    });
  }

  const rt = await prisma.roomType.upsert({
    where: { code: 'STD' },
    update: { defaultChecklistTemplateId: template.id },
    create: {
      name: 'Standard',
      code: 'STD',
      defaultChecklistTemplateId: template.id,
    },
  });

  await prisma.checklistTemplate.update({
    where: { id: template.id },
    data: { roomTypeId: rt.id },
  });

  const rooms = allHotelRoomNumbers();
  for (const num of rooms) {
    const floor = floorFromRoomNumber(num);
    if (floor == null) continue;
    await prisma.room.upsert({
      where: { roomNumber: num },
      update: { floor },
      create: {
        roomNumber: num,
        floor,
        roomTypeId: rt.id,
      },
    });
  }

  const retiredRooms = new Set<string>(RETIRED_HOTEL_ROOM_NUMBERS);
  const retired = [...RETIRED_HOTEL_ROOM_NUMBERS];
  const removed = await prisma.room.deleteMany({
    where: { roomNumber: { in: retired } },
  });
  if (removed.count > 0) {
    console.log(`Removed retired rooms: ${retired.join(', ')} (${removed.count})`);
  }
  for (const plan of await prisma.floorPlan.findMany()) {
    const layout = plan.layout;
    if (!Array.isArray(layout)) continue;
    const filtered = layout.filter(
      (el) =>
        !(
          el &&
          typeof el === 'object' &&
          (el as { kind?: string }).kind === 'room' &&
          typeof (el as { roomNumber?: string }).roomNumber === 'string' &&
          retiredRooms.has((el as { roomNumber: string }).roomNumber)
        ),
    );
    if (filtered.length !== layout.length) {
      await prisma.floorPlan.update({
        where: { id: plan.id },
        data: { layout: filtered },
      });
    }
  }

  const roomRows = await prisma.room.findMany();
  const tts = await prisma.checklistTemplateTask.findMany({
    where: { templateId: template.id },
  });

  for (const room of roomRows) {
    const state = await prisma.roomChecklistState.findUnique({ where: { roomId: room.id } });
    if (!state) {
      await prisma.roomChecklistState.create({
        data: {
          roomId: room.id,
          templateId: template.id,
          tasks: {
            create: tts.map((tt: { id: string }) => ({
              templateTaskId: tt.id,
              status: ChecklistTaskStatus.NOT_STARTED,
            })),
          },
        },
      });
    }
    const hasAssign = await prisma.roomAssignment.findFirst({
      where: { roomId: room.id, status: AssignmentStatus.ACTIVE },
    });
    if (!hasAssign) {
      await prisma.roomAssignment.create({
        data: {
          roomId: room.id,
          housekeeperUserId: hk.id,
          status: AssignmentStatus.ACTIVE,
          assignedByUserId: sup.id,
        },
      });
    }
  }

  const reqTypes: Array<{
    code: string;
    label: string;
    mapsToChecklistTaskCode?: string | null;
  }> = [
    { code: 'pillows', label: 'Extra Pillow' },
    { code: 'blanket', label: 'Extra Blanket' },
    { code: 'towels', label: 'Extra Towels', mapsToChecklistTaskCode: 'towels' },
    { code: 'room_cleaning', label: 'Room Cleaning' },
    { code: 'other', label: 'Other' },
  ];

  for (const t of reqTypes) {
    await prisma.serviceRequestType.upsert({
      where: { code: t.code },
      update: {
        label: t.label,
        mapsToChecklistTaskCode:
          t.mapsToChecklistTaskCode === undefined ? undefined : t.mapsToChecklistTaskCode,
      },
      create: {
        code: t.code,
        label: t.label,
        mapsToChecklistTaskCode: t.mapsToChecklistTaskCode ?? undefined,
      },
    });
  }

  await prisma.serviceRequestType.deleteMany({
    where: {
      code: {
        notIn: reqTypes.map((t) => t.code),
      },
    },
  });

  await prisma.shift.deleteMany({});
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  await prisma.shift.createMany({
    data: [hk.id, sup.id].map((userId) => ({
      userId,
      startsAt: start,
      endsAt: end,
    })),
  });

  const MonitorMapFeedKind = { NEWS: 'NEWS', POLICE: 'POLICE' } as const;
  const PermissionCode = { MONITOR_MAP_READ: 'MONITOR_MAP_READ' } as const;

  const defaultFeeds: Array<{ kind: 'NEWS' | 'POLICE'; name: string; feedUrl: string }> = [
    {
      kind: MonitorMapFeedKind.NEWS,
      name: 'BZ Bern Mittelland',
      feedUrl: 'https://partner-feeds.publishing.tamedia.ch/rss/bernerzeitung/bern',
    },
    {
      kind: MonitorMapFeedKind.NEWS,
      name: 'Stadt Bern',
      feedUrl: 'https://www.bern.ch/news_listing_rss',
    },
    {
      kind: MonitorMapFeedKind.POLICE,
      name: 'Blog Kantonspolizei Bern',
      feedUrl: 'https://www.blog.police.be.ch/feed/',
    },
  ];

  for (const feed of defaultFeeds) {
    const existing = await prisma.monitorMapFeedSource.findFirst({
      where: { kind: feed.kind, feedUrl: feed.feedUrl },
    });
    if (!existing) {
      await prisma.monitorMapFeedSource.create({ data: feed });
    }
  }

  for (const userId of [rec.id, sup.id]) {
    await prisma.userPermissionGrant.upsert({
      where: {
        userId_permission: { userId, permission: PermissionCode.MONITOR_MAP_READ },
      },
      update: {},
      create: { userId, permission: PermissionCode.MONITOR_MAP_READ },
    });
  }

  await ensureSystemRoles(prisma);

  const guideAuthor =
    (await prisma.user.findFirst({
      where: { role: UserRole.ADMIN, isActive: true },
      orderBy: { createdAt: 'asc' },
    })) ?? admin;

  await prisma.guide.upsert({
    where: { slug: BERN_TICKET_GUIDE_SLUG },
    update: {
      title: 'Bern Ticket Instructions',
      summary: bernTicketGuideSummary,
      body: bernTicketGuideMarkdown,
      category: 'Bern Ticket',
      sortOrder: 0,
      published: true,
      updatedByUserId: guideAuthor.id,
    },
    create: {
      title: 'Bern Ticket Instructions',
      slug: BERN_TICKET_GUIDE_SLUG,
      summary: bernTicketGuideSummary,
      body: bernTicketGuideMarkdown,
      category: 'Bern Ticket',
      sortOrder: 0,
      published: true,
      createdByUserId: guideAuthor.id,
      updatedByUserId: guideAuthor.id,
    },
  });

  console.log('Seed OK', { admin: admin.email, hk: hk.email, sup: sup.email, tech: tech.email, rec: rec.email });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
