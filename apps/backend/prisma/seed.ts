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

  // Demo customers (idempotent: clear + reseed for this tenant)
  await prisma.bill.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.party.deleteMany({ where: { tenantId: tenant.id } });

  const customers = await Promise.all(
    [
      { name: 'Bharath Traders', gstin: '27ABCDE1234F1Z5' },
      { name: 'Sri Sai Enterprises', gstin: '36PQRSX6789L1Z2' },
      { name: 'Krishna Agencies', gstin: '29LMNOP4321K1Z9' },
    ].map((c) =>
      prisma.party.create({
        data: { tenantId: tenant.id, type: 'CUSTOMER', name: c.name, gstin: c.gstin, taxCategory: 'REGISTERED' },
      }),
    ),
  );

  // Demo outgoing bills (sales invoices) with line items + GST totals
  const dec = (n: number) => n.toFixed(2);
  let seq = 1;
  for (const [i, cust] of customers.entries()) {
    const taxable = [100000, 84000, 56000][i];
    const intra = (cust.gstin ?? '').startsWith('27'); // supplier state 27
    const gst = taxable * 0.18;
    const cgst = intra ? gst / 2 : 0;
    const sgst = intra ? gst / 2 : 0;
    const igst = intra ? 0 : gst;
    await prisma.bill.create({
      data: {
        tenantId: tenant.id,
        billNumber: `INV-${String(seq++).padStart(5, '0')}`,
        direction: 'OUTGOING',
        status: (i === 1 ? 'FINALIZED' : i === 2 ? 'APPROVED' : 'FINALIZED') as any,
        billDate: new Date('2026-06-15'),
        partyId: cust.id,
        placeOfSupply: intra ? '27' : '29',
        subTotal: dec(taxable),
        cgstTotal: dec(cgst),
        sgstTotal: dec(sgst),
        igstTotal: dec(igst),
        grandTotal: dec(taxable + gst),
        lineItems: {
          create: [
            {
              tenantId: tenant.id,
              description: 'Consulting services',
              hsnSacCode: '9983',
              quantity: 1,
              rate: dec(taxable),
              taxableValue: dec(taxable),
              gstRate: 18,
              cgst: dec(cgst),
              sgst: dec(sgst),
              igst: dec(igst),
              lineTotal: dec(taxable + gst),
            },
          ],
        },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded tenant:', tenant.slug, `(login admin@demo.test / admin123) — ${customers.length} customers, ${seq - 1} invoices`);
}

main().finally(() => prisma.$disconnect());
