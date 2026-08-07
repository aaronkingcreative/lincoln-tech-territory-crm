export function formatDateOnly(value: unknown, missing = 'Missing'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return missing;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return missing;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
