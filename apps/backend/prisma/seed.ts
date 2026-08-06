import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Master (platform) admin — operates the SaaS: licenses, plans, GST APIs.
  await prisma.platformAdmin.upsert({
    where: { email: 'master@donicy.in' },
    update: {},
    create: {
      email: 'master@donicy.in',
      passwordHash: await bcrypt.hash('master123', 10),
      fullName: 'DONICY Master Admin',
    },
  });

  // Subscription plans
  const plans: { id: string; name: string; interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'; priceInr: number; trialDays: number; limits: any }[] = [
    { id: 'plan-starter', name: 'Starter', interval: 'MONTHLY', priceInr: 999, trialDays: 14, limits: { bills: 1000, users: 5 } },
    { id: 'plan-pro', name: 'Professional', interval: 'MONTHLY', priceInr: 2499, trialDays: 14, limits: { bills: 10000, users: 25 } },
    { id: 'plan-enterprise', name: 'Enterprise', interval: 'YEARLY', priceInr: 49999, trialDays: 0, limits: { bills: -1, users: -1 } },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({ where: { id: p.id }, update: { priceInr: p.priceInr, limits: p.limits }, create: p });
  }

  // Seller organization details (shown on invoices)
  const orgDetails = {
    legalName: 'DONICY Solutions Pvt Ltd', tradeName: 'DONICY', invoiceShortCode: 'DON',
    gstin: '27AABCD1234E1Z8', pan: 'AABCD1234E',
    cin: 'U72900MH2024PTC096839', msme: 'UDYAM-MH-01-0064182',
    addressLine1: '4th Floor, Tech Park, Baner Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', pincode: '411045',
    email: 'billing@donicy.in', phone: '9000000000', financialYear: '2026-27',
    bankAccountName: 'DONICY Solutions Pvt Ltd', bankName: 'HDFC Bank',
    bankAccountNumber: '50200011191903', bankBranch: 'Baner, Pune', bankIfsc: 'HDFC0000811', upiId: 'donicy@hdfcbank',
    defaultTerms: 'Service validity: 1 year from date of purchase.\nPayment due within the agreed credit period; delayed payments may attract interest.\nAll disputes are subject to jurisdiction of the seller’s registered location.\nThis is a computer-generated invoice.',
  };

  // Demo tenant + admin
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Traders',
      slug: 'demo',
      organizations: { create: orgDetails },
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

  // Ensure the org details are applied even when the tenant already existed.
  await prisma.organization.updateMany({ where: { tenantId: tenant.id }, data: orgDetails });

  // Active license for the demo tenant (Professional, 12 months).
  const licenseEnd = new Date(); licenseEnd.setMonth(licenseEnd.getMonth() + 12);
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: { planId: 'plan-pro', status: 'ACTIVE', currentPeriodEnd: licenseEnd },
    create: { tenantId: tenant.id, planId: 'plan-pro', status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: licenseEnd },
  });

  // Demo customers (idempotent: clear + reseed for this tenant)
  await prisma.gstReturn.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.bill.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.party.deleteMany({ where: { tenantId: tenant.id } });

  const customers = await Promise.all(
    [
      { name: 'Bharath Traders', gstin: '27ABCDE1234F1Z0' },
      { name: 'Sri Sai Enterprises', gstin: '36PQRSX6789L1ZR' },
      { name: 'Krishna Agencies', gstin: '29LMNOP4321K1ZC' },
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

  // Demo payments: full payment on INV-00001, partial on INV-00003.
  const inv1 = await prisma.bill.findFirst({ where: { tenantId: tenant.id, billNumber: 'INV-00001' } });
  const inv3 = await prisma.bill.findFirst({ where: { tenantId: tenant.id, billNumber: 'INV-00003' } });
  if (inv1) {
    await prisma.billPayment.create({ data: { tenantId: tenant.id, billId: inv1.id, amount: inv1.grandTotal, mode: 'UPI', reference: 'UTR123456', date: new Date('2026-06-20') } });
    await prisma.bill.update({ where: { id: inv1.id }, data: { paymentStatus: 'PAID' } });
  }
  if (inv3) {
    await prisma.billPayment.create({ data: { tenantId: tenant.id, billId: inv3.id, amount: 20000, mode: 'Bank Transfer', reference: 'NEFT77889', date: new Date('2026-06-25') } });
    await prisma.bill.update({ where: { id: inv3.id }, data: { paymentStatus: 'PARTIAL' } });
  }

  // Demo vendor + inventory items (with barcodes)
  const existingVendor = await prisma.party.findFirst({ where: { tenantId: tenant.id, type: 'VENDOR', name: 'Reliable Supplies' } });
  if (!existingVendor) {
    await prisma.party.create({ data: { tenantId: tenant.id, type: 'VENDOR', name: 'Reliable Supplies', gstin: '29AABCR1234M1Z9', taxCategory: 'REGISTERED', billingAddress: { state: '29', city: 'Bengaluru' } } });
  }
  const items = [
    { name: 'Website Development', barcode: '8901234500017', hsnSacCode: '998314', unit: 'job', rate: 25000, gstRate: 18 },
    { name: 'A4 Paper Ream', barcode: '8901234500024', hsnSacCode: '4802', unit: 'pcs', rate: 320, gstRate: 12 },
    { name: 'Laptop Stand', barcode: '8901234500031', hsnSacCode: '8473', unit: 'pcs', rate: 1499, gstRate: 18 },
  ];
  for (const it of items) {
    await prisma.product.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: it.name } },
      update: { barcode: it.barcode, hsnSacCode: it.hsnSacCode, unit: it.unit, rate: it.rate, gstRate: it.gstRate },
      create: { tenantId: tenant.id, ...it },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seeded tenant:', tenant.slug, `(login admin@demo.test / admin123) — ${customers.length} customers, 1 vendor, ${items.length} items, ${seq - 1} invoices, 2 payments`);
}

main().finally(() => prisma.$disconnect());
