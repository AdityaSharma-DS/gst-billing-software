/** Default due date: `days` after `fromIso` (yyyy-mm-dd); if it lands on Sunday, roll to Monday. */
export function autoDueDate(fromIso: string, days = 30): string {
  const d = new Date(fromIso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sunday → next working day (Monday)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
