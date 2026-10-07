export function padNumber(prefix: string, num: number, digits = 6): string {
  return `${prefix}${String(num).padStart(digits, '0')}`;
}

export function generateRef(prefix: string, num: number): string {
  return padNumber(prefix, num);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100 * 100) / 100;
}

export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
