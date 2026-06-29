import { Injectable } from '@nestjs/common';

export interface LineItemInput {
  taxableValue: number;   // after discount
  gstRate: number;        // e.g. 18
  cessRate?: number;      // e.g. 0
}

export interface LineItemTax {
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}

/**
 * Core GST calculation engine.
 * Intra-state (supplier state == place of supply) => CGST + SGST (rate split in half).
 * Inter-state => IGST (full rate).
 * Rounding: per-line to 2 decimals; bill-level round-off computed by caller.
 */
@Injectable()
export class GstService {
  isIntraState(supplierStateCode?: string, placeOfSupplyCode?: string): boolean {
    if (!supplierStateCode || !placeOfSupplyCode) return true; // default intra
    return supplierStateCode === placeOfSupplyCode;
  }

  computeLineTax(item: LineItemInput, intraState: boolean): LineItemTax {
    const round = (n: number) => Math.round(n * 100) / 100;
    const gst = round((item.taxableValue * item.gstRate) / 100);
    const cess = round((item.taxableValue * (item.cessRate ?? 0)) / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (intraState) {
      cgst = round(gst / 2);
      sgst = round(gst - cgst); // absorb rounding remainder into sgst
    } else {
      igst = gst;
    }

    return {
      cgst,
      sgst,
      igst,
      cess,
      total: round(item.taxableValue + cgst + sgst + igst + cess),
    };
  }
}
