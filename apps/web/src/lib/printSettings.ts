/**
 * Print / invoice-layout settings, modelled on Vyapar's Print Settings.
 * One object per firm. Persisted in localStorage for now (server-sync is a
 * fast follow); company details for the preview come from the org profile.
 */

export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'xs', label: 'Very Small' }, { id: 'sm', label: 'Small' }, { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' }, { id: 'xl', label: 'Very Large' },
];
export const TEXT_PX: Record<TextSize, number> = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 };

export type ItemColKey = 'sno' | 'item' | 'hsn' | 'qty' | 'unit' | 'price' | 'discount' | 'gst' | 'amount';
export const ITEM_COLS: { key: ItemColKey; label: string; locked?: boolean }[] = [
  { key: 'sno', label: '#' }, { key: 'item', label: 'Item name', locked: true }, { key: 'hsn', label: 'HSN/SAC' },
  { key: 'qty', label: 'Quantity' }, { key: 'unit', label: 'Unit' }, { key: 'price', label: 'Price/Unit' },
  { key: 'discount', label: 'Discount' }, { key: 'gst', label: 'GST' }, { key: 'amount', label: 'Amount', locked: true },
];

export interface RegularSettings {
  themeId: string;
  colorHex: string;
  makeDefault: boolean;
  repeatHeader: boolean;
  header: { companyName: boolean; logo: boolean; address: boolean; email: boolean; phone: boolean; gstin: boolean };
  paperSize: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  companyNameSize: TextSize;
  invoiceTextSize: TextSize;
  originalDuplicate: boolean;
  extraTopSpace: number;
  itemTable: { columns: Record<ItemColKey, boolean>; expandFullPage: boolean; minRows: number };
  totals: {
    totalQty: boolean; decimals: boolean; received: boolean; balance: boolean; partyBalance: boolean;
    taxDetails: boolean; youSaved: boolean; grouping: boolean; amountWords: 'indian' | 'international';
  };
  footer: {
    description: boolean; terms: boolean; receivedBy: boolean; deliveredBy: boolean; signature: boolean;
    paymentMode: boolean; acknowledgement: boolean; bankDetails: boolean;
    termsText: string; signatureLabel: string;
  };
}

export interface ThermalSettings {
  themeId: string;
  makeDefault: boolean;
  pageWidth: 58 | 80 | 112;
  printingType: 'text' | 'graphic';
  bold: boolean;
  autoCut: boolean;
  openDrawer: boolean;
  extraLines: number;
  copies: number;
  header: { companyName: boolean; logo: boolean; address: boolean; email: boolean; phone: boolean; gstin: boolean };
  totals: { totalQty: boolean; received: boolean; balance: boolean; taxDetails: boolean; youSaved: boolean; amountWords: 'indian' | 'international' };
  footer: { description: boolean; terms: boolean; termsText: string };
}

export interface PrintSettings {
  defaultPrinter: 'regular' | 'thermal';
  regular: RegularSettings;
  thermal: ThermalSettings;
}

/** 18 accent swatches (Vyapar's palette). */
export const COLOR_SWATCHES: { hex: string; name: string }[] = [
  { hex: '#8B8BE8', name: 'Purple' }, { hex: '#2F9E8F', name: 'Teal' }, { hex: '#6B7280', name: 'Grey' },
  { hex: '#374151', name: 'Dark Grey' }, { hex: '#7A7A33', name: 'Olive' }, { hex: '#2563EB', name: 'Blue' },
  { hex: '#0891B2', name: 'Cyan' }, { hex: '#15803D', name: 'Green' }, { hex: '#65A30D', name: 'Lime' },
  { hex: '#8B5E3C', name: 'Brown' }, { hex: '#BE185D', name: 'Magenta' }, { hex: '#7C3AED', name: 'Plum' },
  { hex: '#C2410C', name: 'Orange-Brown' }, { hex: '#8D2E2E', name: 'Maroon' }, { hex: '#6D28D9', name: 'Violet' },
  { hex: '#B45309', name: 'Tan' }, { hex: '#DB2777', name: 'Pink' }, { hex: '#B91C1C', name: 'Red' },
];

export interface ThemeMeta { id: string; name: string; group: 'Classic' | 'Vintage'; premium?: boolean; ready?: boolean }
/** The full Vyapar theme set. Ready themes render live; the rest are premium/soon. */
export const THEMES: ThemeMeta[] = [
  { id: 'tally', name: 'Tally Theme', group: 'Classic', ready: true },
  { id: 'gst1', name: 'GST Theme 1', group: 'Classic', ready: true },
  { id: 'double-divine', name: 'Double Divine', group: 'Classic', ready: true },
  { id: 'french-elite', name: 'French Elite', group: 'Classic', ready: true },
  { id: 'compact', name: 'Landscape / Compact', group: 'Classic', ready: true },
  { id: 'gst3', name: 'GST Theme 3', group: 'Classic', premium: true },
  { id: 'landscape2', name: 'Landscape Theme 2', group: 'Classic', premium: true },
  { id: 'gst2', name: 'GST Theme 2', group: 'Vintage', premium: true },
  { id: 'gst4', name: 'GST Theme 4', group: 'Vintage', premium: true },
  { id: 'gst5', name: 'GST Theme 5', group: 'Vintage', premium: true },
  { id: 'gst6', name: 'GST Theme 6', group: 'Vintage', premium: true },
  { id: 'theme1', name: 'Theme 1', group: 'Vintage', premium: true },
  { id: 'theme2', name: 'Theme 2', group: 'Vintage', premium: true },
  { id: 'theme3', name: 'Theme 3', group: 'Vintage', premium: true },
  { id: 'theme4', name: 'Theme 4', group: 'Vintage', premium: true },
];
export const THERMAL_THEMES: ThemeMeta[] = [1, 2, 3, 4, 5].map((i) => ({ id: `thermal${i}`, name: `Theme ${i}`, group: 'Classic', ready: i <= 2 }));

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  defaultPrinter: 'regular',
  regular: {
    themeId: 'tally', colorHex: '#8B8BE8', makeDefault: true, repeatHeader: true,
    header: { companyName: true, logo: true, address: true, email: true, phone: true, gstin: true },
    paperSize: 'A4', orientation: 'portrait', companyNameSize: 'lg', invoiceTextSize: 'md',
    originalDuplicate: false, extraTopSpace: 0,
    itemTable: { columns: { sno: true, item: true, hsn: true, qty: true, unit: true, price: true, discount: true, gst: true, amount: true }, expandFullPage: true, minRows: 0 },
    totals: { totalQty: true, decimals: true, received: true, balance: true, partyBalance: false, taxDetails: true, youSaved: true, grouping: true, amountWords: 'indian' },
    footer: { description: true, terms: true, receivedBy: false, deliveredBy: false, signature: true, paymentMode: false, acknowledgement: false, bankDetails: true, termsText: 'Thanks for doing business with us!', signatureLabel: 'Authorized Signatory' },
  },
  thermal: {
    themeId: 'thermal1', makeDefault: false, pageWidth: 80, printingType: 'text', bold: true, autoCut: false, openDrawer: false, extraLines: 2, copies: 1,
    header: { companyName: true, logo: false, address: true, email: false, phone: true, gstin: true },
    totals: { totalQty: true, received: true, balance: true, taxDetails: true, youSaved: true, amountWords: 'indian' },
    footer: { description: false, terms: true, termsText: 'Thanks for doing business with us!' },
  },
};

const KEY = 'donicy.printSettings';

/** Deep-merge stored settings over defaults so new fields always have a value. */
function merge<T>(base: T, over: any): T {
  if (over == null || typeof over !== 'object' || Array.isArray(base)) return (over ?? base) as T;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const k of Object.keys(base as any)) out[k] = merge((base as any)[k], over?.[k]);
  return out;
}

export function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? merge(DEFAULT_PRINT_SETTINGS, JSON.parse(raw)) : DEFAULT_PRINT_SETTINGS;
  } catch { return DEFAULT_PRINT_SETTINGS; }
}
export function savePrintSettings(s: PrintSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
