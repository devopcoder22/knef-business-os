// West Africa Time offset (UTC+1)
const WAT_OFFSET_MS = 60 * 60 * 1000;

// Generates a business document reference in PREFIX-DDMMYYYY-RAND format.
// Date portion reflects Nigerian local time (WAT = UTC+1).
export function generateReference(prefix: string): string {
  const wat = new Date(Date.now() + WAT_OFFSET_MS);
  const dd = String(wat.getUTCDate()).padStart(2, '0');
  const mm = String(wat.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(wat.getUTCFullYear());
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${dd}${mm}${yyyy}-${rand}`;
}

// Formats a date value as DD/MM/YYYY in Nigerian local time (WAT = UTC+1).
export function fmtDateNG(val: unknown): string {
  const d = val instanceof Date ? val : new Date(String(val ?? ''));
  if (isNaN(d.getTime())) return '';
  const wat = new Date(d.getTime() + WAT_OFFSET_MS);
  const dd = String(wat.getUTCDate()).padStart(2, '0');
  const mm = String(wat.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(wat.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}
