export function formatDateOnly(value: unknown, missing = 'Missing'): string {
  if (typeof value !== 'string') return missing;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value.trim());
  if (!match) return missing;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return missing;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
