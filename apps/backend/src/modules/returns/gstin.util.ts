// GSTIN format + official check-digit validation (mod-36, alternating 1/2 weights).
const CP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(gstin?: string | null): boolean {
  if (!gstin) return false;
  const g = gstin.toUpperCase().trim();
  if (!FORMAT.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CP.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CP[(36 - (sum % 36)) % 36] === g[14];
}
