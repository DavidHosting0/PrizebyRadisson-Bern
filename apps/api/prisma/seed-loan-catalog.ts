import { PrismaClient } from '@prisma/client';

const DEFAULT_LOAN_ITEMS: Array<{ name: string; depositCents: number; sortOrder: number }> = [
  { name: 'Adapter / Stecker', depositCents: 2000, sortOrder: 10 },
  { name: 'Föhn', depositCents: 3000, sortOrder: 20 },
  { name: 'Bügeleisen', depositCents: 5000, sortOrder: 30 },
  { name: 'USB-Kabel', depositCents: 1000, sortOrder: 40 },
  { name: 'Ladegerät', depositCents: 2000, sortOrder: 50 },
];

export async function seedLoanCatalog(prisma: PrismaClient) {
  for (const item of DEFAULT_LOAN_ITEMS) {
    const existing = await prisma.loanItemCatalogEntry.findFirst({
      where: { name: item.name },
    });
    if (existing) {
      await prisma.loanItemCatalogEntry.update({
        where: { id: existing.id },
        data: {
          depositCents: item.depositCents,
          sortOrder: item.sortOrder,
          active: true,
        },
      });
    } else {
      await prisma.loanItemCatalogEntry.create({
        data: {
          name: item.name,
          depositCents: item.depositCents,
          sortOrder: item.sortOrder,
          active: true,
        },
      });
    }
  }
}
