import { BadRequestException } from '@nestjs/common';

/**
 * Builds the NIC e-Invoice (IRN) request JSON (schema Version 1.1) from a bill +
 * organisation + party. Field names/codes follow the NIC e-Invoice schema
 * (Api-docs/e-Invoice API). WhiteBooks forwards this JSON to NIC unchanged and
 * returns the IRN, AckNo and signed QR.
 */

const n = (v: unknown): number => Number(v ?? 0);
const round2 = (x: number) => Math.round(x * 100) / 100;
const ddmmyyyy = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const pin = (v: unknown): number | undefined => {
  const p = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(p) && p >= 100000 ? p : undefined;
};
/** 2-digit state code as a string (NIC uses string Stcd/Pos). */
const stcd = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : undefined;
};
const stcdFromGstin = (gstin?: string | null): string | undefined =>
  gstin && gstin.length >= 2 ? stcd(gstin.slice(0, 2)) : undefined;

interface OrgLike {
  gstin?: string | null; legalName?: string | null; tradeName?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  stateCode?: string | null; pincode?: string | null;
}
interface PartyLike {
  gstin?: string | null; name?: string | null; billingAddress?: any;
}
interface LineLike {
  description: string; hsnSacCode?: string | null; quantity: any; unit?: string | null;
  rate: any; discount: any; taxableValue: any; gstRate: any; cgst: any; sgst: any; igst: any; cess: any; lineTotal: any;
}
interface BillLike {
  billNumber: string; billDate: Date; documentType: string; placeOfSupply?: string | null;
  subTotal: any; cgstTotal: any; sgstTotal: any; igstTotal: any; cessTotal: any;
  otherCharges: any; roundOff: any; grandTotal: any; lineItems: LineLike[];
}

const DOC_TYP: Record<string, string> = { INVOICE: 'INV', CREDIT_NOTE: 'CRN', DELIVERY_CHALLAN: 'INV' };

export function buildEInvoicePayload(bill: BillLike, org: OrgLike, party: PartyLike): Record<string, unknown> {
  const sellerState = stcd(org.stateCode) ?? stcdFromGstin(org.gstin);
  const sellerPin = pin(org.pincode);
  if (!org.gstin || !sellerState || !sellerPin) {
    throw new BadRequestException('Your GSTIN, state and PIN code are required for e-Invoice. Complete them in Settings → Company Details.');
  }
  if (!party?.gstin) {
    throw new BadRequestException('e-Invoice (IRN) applies to B2B invoices — the customer must have a GSTIN.');
  }
  const addr = party.billingAddress ?? {};
  const buyerState = stcdFromGstin(party.gstin) ?? stcd(bill.placeOfSupply) ?? stcd(addr.stateCode ?? addr.state);
  const buyerPin = pin(addr.pincode) ?? pin(addr.pin);
  const pos = stcd(bill.placeOfSupply) ?? buyerState;
  if (!buyerState || !buyerPin) {
    throw new BadRequestException('The customer’s state and PIN code are required for e-Invoice. Set the party billing address (PIN) and place of supply.');
  }

  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: DOC_TYP[bill.documentType] ?? 'INV', No: bill.billNumber, Dt: ddmmyyyy(new Date(bill.billDate)) },
    SellerDtls: {
      Gstin: org.gstin, LglNm: org.legalName ?? org.tradeName ?? 'Seller',
      Addr1: org.addressLine1 ?? org.city ?? 'NA', Addr2: org.addressLine2 ?? undefined,
      Loc: org.city ?? 'NA', Pin: sellerPin, Stcd: sellerState,
    },
    BuyerDtls: {
      Gstin: party.gstin, LglNm: party.name ?? 'Buyer', Pos: pos,
      Addr1: addr.line1 ?? addr.addressLine1 ?? addr.address ?? 'NA',
      Loc: addr.city ?? addr.loc ?? 'NA', Pin: buyerPin, Stcd: buyerState,
    },
    ValDtls: {
      AssVal: round2(n(bill.subTotal)),
      CgstVal: round2(n(bill.cgstTotal)), SgstVal: round2(n(bill.sgstTotal)),
      IgstVal: round2(n(bill.igstTotal)), CesVal: round2(n(bill.cessTotal)),
      OthChrg: round2(n(bill.otherCharges)), RndOffAmt: round2(n(bill.roundOff)),
      TotInvVal: round2(n(bill.grandTotal)),
    },
    ItemList: bill.lineItems.map((l, i) => {
      const gstRt = n(l.gstRate);
      return {
        SlNo: String(i + 1),
        PrdDesc: l.description,
        IsServc: (l.hsnSacCode ?? '').startsWith('99') ? 'Y' : 'N',
        HsnCd: String(l.hsnSacCode ?? '').replace(/\D/g, '') || '0',
        Qty: n(l.quantity),
        Unit: (l.unit ?? 'OTH').toUpperCase().slice(0, 3),
        UnitPrice: round2(n(l.rate)),
        TotAmt: round2(n(l.rate) * n(l.quantity)),
        Discount: round2(n(l.discount)),
        AssAmt: round2(n(l.taxableValue)),
        GstRt: gstRt,
        IgstAmt: round2(n(l.igst)), CgstAmt: round2(n(l.cgst)), SgstAmt: round2(n(l.sgst)), CesAmt: round2(n(l.cess)),
        TotItemVal: round2(n(l.lineTotal) || n(l.taxableValue) + n(l.cgst) + n(l.sgst) + n(l.igst) + n(l.cess)),
      };
    }),
  };
}
