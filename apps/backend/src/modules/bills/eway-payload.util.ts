import { BadRequestException } from '@nestjs/common';

/**
 * Builds the NIC `genewaybill` request JSON from a bill + organisation + party.
 * Field names/codes follow the NIC e-Way Bill schema (Api-docs/e-WayBill
 * Preparation tools). WhiteBooks forwards this JSON to NIC unchanged.
 */

const n = (v: unknown): number => Number(v ?? 0);
const ddmmyyyy = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const pin = (v: unknown): number | undefined => {
  const p = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(p) && p >= 100000 ? p : undefined;
};
const stateCode = (v: unknown): number | undefined => {
  const s = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(s) && s > 0 ? s : undefined;
};
/** First two digits of a GSTIN are the state code. */
const stateFromGstin = (gstin?: string | null): number | undefined =>
  gstin && gstin.length >= 2 ? stateCode(gstin.slice(0, 2)) : undefined;

interface OrgLike {
  gstin?: string | null; stateCode?: string | null; pincode?: string | null;
}
interface PartyLike {
  gstin?: string | null; name?: string | null; billingAddress?: any;
}
interface LineLike {
  description: string; hsnSacCode?: string | null; quantity: any; unit?: string | null;
  taxableValue: any; gstRate: any; cgst: any; sgst: any; igst: any; cess: any;
}
interface BillLike {
  billNumber: string; billDate: Date; placeOfSupply?: string | null;
  subTotal: any; grandTotal: any; lineItems: LineLike[];
}
export interface EwbInput {
  vehicleNo?: string; transporterId?: string; transporterName?: string;
  transDistance?: number; transMode?: string; transDocNo?: string; transDocDate?: string;
}

export function buildEwbPayload(bill: BillLike, org: OrgLike, party: PartyLike, input: EwbInput): Record<string, unknown> {
  const fromState = stateCode(org.stateCode) ?? stateFromGstin(org.gstin);
  const fromPin = pin(org.pincode);
  if (!org.gstin || !fromState || !fromPin) {
    throw new BadRequestException('Organisation GSTIN, state code and PIN code are required for e-Way Bill. Complete them in Settings → Organisation.');
  }

  const addr = party?.billingAddress ?? {};
  const toState = stateCode(bill.placeOfSupply) ?? stateFromGstin(party?.gstin) ?? stateCode(addr.stateCode);
  const toPin = pin(addr.pincode) ?? pin(addr.pin);
  if (!toState || !toPin) {
    throw new BadRequestException('Recipient state code and PIN code are required for e-Way Bill. Set the place of supply and the party billing address PIN.');
  }

  const cgst = bill.lineItems.reduce((s, l) => s + n(l.cgst), 0);
  const sgst = bill.lineItems.reduce((s, l) => s + n(l.sgst), 0);
  const igst = bill.lineItems.reduce((s, l) => s + n(l.igst), 0);
  const cess = bill.lineItems.reduce((s, l) => s + n(l.cess), 0);

  const transMode = input.transMode ?? (input.vehicleNo ? '1' : undefined); // 1=Road
  const round2 = (x: number) => Math.round(x * 100) / 100;

  return {
    supplyType: 'O',            // Outward
    subSupplyType: '1',         // Supply
    docType: 'INV',
    docNo: bill.billNumber,
    docDate: ddmmyyyy(new Date(bill.billDate)),
    fromGstin: org.gstin,
    fromTrdName: undefined,
    fromStateCode: fromState,
    fromPincode: fromPin,
    actFromStateCode: fromState,
    toGstin: party?.gstin || 'URP',   // URP = unregistered person
    toTrdName: party?.name ?? undefined,
    toStateCode: toState,
    toPincode: toPin,
    actToStateCode: toState,
    transactionType: 1,               // Regular
    totInvValue: round2(n(bill.grandTotal)),
    totalValue: round2(n(bill.subTotal)),
    cgstValue: round2(cgst),
    sgstValue: round2(sgst),
    igstValue: round2(igst),
    cessValue: round2(cess),
    transporterId: input.transporterId || undefined,
    transporterName: input.transporterName || undefined,
    transDistance: String(input.transDistance ?? 0), // 0 => NIC auto-computes from PINs
    transMode,
    transDocNo: input.transDocNo || undefined,
    transDocDate: input.transDocDate || undefined,
    vehicleNo: input.vehicleNo || undefined,
    vehicleType: input.vehicleNo ? 'R' : undefined,   // R=Regular
    itemList: bill.lineItems.map((l, i) => ({
      itemNo: i + 1,
      productName: l.description,
      productDesc: l.description,
      hsnCode: parseInt(String(l.hsnSacCode ?? '').replace(/\D/g, ''), 10) || 0,
      quantity: n(l.quantity),
      qtyUnit: (l.unit ?? 'OTH').toUpperCase().slice(0, 3),
      taxableAmount: round2(n(l.taxableValue)),
      cgstRate: n(l.cgst) > 0 ? n(l.gstRate) / 2 : 0,
      sgstRate: n(l.sgst) > 0 ? n(l.gstRate) / 2 : 0,
      igstRate: n(l.igst) > 0 ? n(l.gstRate) : 0,
      cessRate: 0,
    })),
  };
}
