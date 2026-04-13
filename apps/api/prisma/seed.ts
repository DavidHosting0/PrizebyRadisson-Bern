import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { allHotelRoomNumbers, floorFromRoomNumber } from '../src/rooms/room-layout';

const prisma = new PrismaClient();

/** String enum values — avoids ts-node issues when @prisma/client typings are stale before `prisma generate`. */
const UserRole = {
  ADMIN: 'ADMIN',
  HOUSEKEEPER: 'HOUSEKEEPER',
  SUPERVISOR: 'SUPERVISOR',
  RECEPTION: 'RECEPTION',
} as const;
const UserTitlePrefix = {
  ADMIN: 'ADMIN',
  CLEANER: 'CLEANER',
  HOUSEKEEPING_SUPERVISOR: 'HOUSEKEEPING_SUPERVISOR',
  RECEPTION: 'RECEPTION',
} as const;
const ChecklistTaskStatus = { NOT_STARTED: 'NOT_STARTED' } as const;
const AssignmentStatus = { ACTIVE: 'ACTIVE' } as const;

async function main() {
  const hsCount = await prisma.hotelSettings.count();
  if (hsCount === 0) {
    await prisma.hotelSettings.create({ data: { name: 'Demo Hotel', timezone: 'UTC' } });
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

  console.log('Seed OK', { admin: admin.email, hk: hk.email, sup: sup.email, rec: rec.email });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
