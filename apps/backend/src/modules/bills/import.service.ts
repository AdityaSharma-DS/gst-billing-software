import { Injectable } from '@nestjs/common';
import * as Papa from 'papaparse';
import { BillsService } from './bills.service';

export interface ImportResult { created: number; failed: number; errors: { row: number; message: string }[]; }

/**
 * Bulk bill import from a CSV string. Template columns (header row required):
 *   billDate, partyName, description, hsnSacCode, quantity, rate, gstRate, placeOfSupply
 * Each row becomes one bill with a single line item. Extend to group-by-invoice later.
 */
@Injectable()
export class ImportService {
  constructor(private readonly bills: BillsService) {}

  static readonly TEMPLATE_HEADERS = [
    'billDate', 'partyName', 'description', 'hsnSacCode', 'quantity', 'rate', 'gstRate', 'placeOfSupply',
  ];

  templateCsv(): string {
    return (
      ImportService.TEMPLATE_HEADERS.join(',') + '\n' +
      '2026-06-15,Bharath Traders,Consulting services,9983,1,100000,18,27\n'
    );
  }

  async importCsv(tenantId: string, csv: string, direction: 'INCOMING' | 'OUTGOING', userId?: string): Promise<ImportResult> {
    const parsed = Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true });
    const result: ImportResult = { created: 0, failed: 0, errors: [] };

    for (let i = 0; i < parsed.data.length; i++) {
      const r = parsed.data[i];
      try {
        const qty = Number(r.quantity || 1);
        const rate = Number(r.rate || 0);
        const gstRate = Number(r.gstRate || 0);
        if (!r.description) throw new Error('description is required');
        if (!r.billDate || isNaN(Date.parse(r.billDate))) throw new Error('valid billDate is required');
        if (isNaN(rate)) throw new Error('rate must be a number');

        await this.bills.create(tenantId, {
          direction: direction as any,
          billDate: new Date(r.billDate).toISOString(),
          placeOfSupply: r.placeOfSupply || undefined,
          lineItems: [{ description: r.description, hsnSacCode: r.hsnSacCode || undefined, quantity: qty, rate, gstRate }],
        } as any, userId);
        result.created++;
      } catch (e: any) {
        result.failed++;
        result.errors.push({ row: i + 2, message: e?.message ?? 'invalid row' }); // +2: header + 1-index
      }
    }
    return result;
  }
}
