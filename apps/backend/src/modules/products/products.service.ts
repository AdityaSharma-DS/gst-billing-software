import { BadRequestException, Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ProductImportResult { created: number; updated: number; failed: number; errors: { row: number; message: string }[]; }

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  static readonly TEMPLATE_HEADERS = ['name', 'hsnSacCode', 'unit', 'rate', 'gstRate'];

  list(tenantId: string, search?: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.product.findMany({
        where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
        orderBy: { name: 'asc' },
        take: 200,
      }),
    );
  }

  create(tenantId: string, data: { name: string; barcode?: string; hsnSacCode?: string; unit?: string; rate?: number; gstRate?: number }) {
    if (!data.name?.trim()) throw new BadRequestException('Name is required');
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.product.upsert({
        where: { tenantId_name: { tenantId, name: data.name.trim() } },
        create: { tenantId, name: data.name.trim(), barcode: data.barcode || null, hsnSacCode: data.hsnSacCode, unit: data.unit, rate: data.rate ?? 0, gstRate: data.gstRate ?? 18 },
        update: { barcode: data.barcode || null, hsnSacCode: data.hsnSacCode, unit: data.unit, rate: data.rate ?? 0, gstRate: data.gstRate ?? 18 },
      }),
    );
  }

  update(tenantId: string, id: string, data: { name?: string; barcode?: string; hsnSacCode?: string; unit?: string; rate?: number; gstRate?: number }) {
    return this.prisma.withTenant(tenantId, (tx) => tx.product.update({ where: { id }, data }));
  }

  findByBarcode(tenantId: string, barcode: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.product.findFirst({ where: { barcode: barcode.trim() } }),
    );
  }

  remove(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) => tx.product.delete({ where: { id } }));
  }

  templateCsv(): string {
    return (
      ProductsService.TEMPLATE_HEADERS.join(',') + '\n' +
      'Website Development,998314,job,25000,18\n' +
      'A4 Paper Ream,4802,pcs,320,12\n'
    );
  }

  /** Bulk import inventory from CSV. Upserts by item name (per tenant). */
  async importCsv(tenantId: string, csv: string): Promise<ProductImportResult> {
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
    const result: ProductImportResult = { created: 0, updated: 0, failed: 0, errors: [] };

    for (let i = 0; i < parsed.data.length; i++) {
      const r = parsed.data[i];
      try {
        const name = (r.name ?? '').trim();
        if (!name) throw new Error('name is required');
        const rate = Number(r.rate ?? 0);
        const gstRate = Number(r.gstRate ?? 18);
        if (isNaN(rate) || rate < 0) throw new Error('rate must be a non-negative number');
        if (isNaN(gstRate) || gstRate < 0 || gstRate > 28) throw new Error('gstRate must be between 0 and 28');

        const existing = await this.prisma.withTenant(tenantId, (tx) =>
          tx.product.findUnique({ where: { tenantId_name: { tenantId, name } } }),
        );
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.product.upsert({
            where: { tenantId_name: { tenantId, name } },
            create: { tenantId, name, hsnSacCode: r.hsnSacCode || null, unit: r.unit || null, rate, gstRate },
            update: { hsnSacCode: r.hsnSacCode || null, unit: r.unit || null, rate, gstRate },
          }),
        );
        existing ? result.updated++ : result.created++;
      } catch (e: any) {
        result.failed++;
        result.errors.push({ row: i + 2, message: e?.message ?? 'invalid row' });
      }
    }
    return result;
  }

  /** Auto-learn items from a saved bill so autocomplete improves with use. */
  async learnFromLineItems(tenantId: string, lineItems: { description: string; hsnSacCode?: string | null; unit?: string | null; rate: any; gstRate: any }[]) {
    for (const li of lineItems) {
      const name = (li.description ?? '').trim();
      if (!name) continue;
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.product.upsert({
          where: { tenantId_name: { tenantId, name } },
          create: { tenantId, name, hsnSacCode: li.hsnSacCode ?? null, unit: li.unit ?? null, rate: li.rate, gstRate: li.gstRate },
          update: { hsnSacCode: li.hsnSacCode ?? null, unit: li.unit ?? null, rate: li.rate, gstRate: li.gstRate },
        }),
      );
    }
  }
}
