/** Invoice archive path: <CODE>/<yy-yy>/<Month>/<dd>/<billNumber>.pdf  e.g. DON/26-27/June/15/INV-00001.pdf */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 3-letter company code: org.invoiceShortCode, else first 3 alphanumerics of the trade/legal name. */
export function companyShortCode(org: any): string {
  const explicit = (org?.invoiceShortCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (explicit) return explicit.slice(0, 3);
  const src: string = org?.tradeName || org?.legalName || 'COM';
  return (src.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)) || 'COM';
}

/** Short Indian financial year (Apr–Mar), e.g. 2026-07 → "26-27". */
export function financialYearShort(d: Date): string {
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Archive folder for a bill: DON/26-27/June/15 */
export function archiveFolder(org: any, billDate: Date): string {
  const dd = String(billDate.getDate()).padStart(2, '0');
  return `${companyShortCode(org)}/${financialYearShort(billDate)}/${MONTHS[billDate.getMonth()]}/${dd}`;
}
