import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Demo plan
  await prisma.plan.upsert({
    where: { id: 'plan-starter' },
    update: {},
    create: {
      id: 'plan-starter',
      name: 'Starter',
      interval: 'MONTHLY',
      priceInr: 999,
      trialDays: 14,
      limits: { bills: 1000, users: 5 },
    },
  });

  // Demo tenant + admin
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Traders',
      slug: 'demo',
      organizations: {
        create: { legalName: 'Demo Traders Pvt Ltd', stateCode: '27', financialYear: '2026-27' },
      },
      users: {
        create: {
          email: 'admin@demo.test',
          passwordHash: await bcrypt.hash('admin123', 10),
          fullName: 'Demo Admin',
          role: 'ADMIN',
        },
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seeded tenant:', tenant.slug, '(login admin@demo.test / admin123)');
}

main().finally(() => prisma.$disconnect());
