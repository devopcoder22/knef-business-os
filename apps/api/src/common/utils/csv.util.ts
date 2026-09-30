export function objectsToCsv(data: Record<string, unknown>[], headers?: string[]): string {
  if (!data.length) return '';
  const keys = headers ?? Object.keys(data[0]);
  const headerRow = keys.join(',');
  const rows = data.map(row =>
    keys.map(k => {
      const v = String(row[k] ?? '');
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  );
  return [headerRow, ...rows].join('\n');
}
