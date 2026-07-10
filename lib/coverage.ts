import { TERRITORY_SCHOOL_SEEDS } from '@/data/territory-schools';
import { createServiceClient, hasSupabaseServiceCredentials } from './supabase';

export type DbRow = Record<string, any>;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const has = (v: unknown) => String(v ?? '').trim().length > 0;
const role = (c: DbRow, words: string[]) => words.some((w) => norm(`${c.title} ${c.program_area} ${c.extraction_notes}`).includes(w));

export function expectedDistricts() {
  const map = new Map<string, { district: string; county: string; expectedSchools: typeof TERRITORY_SCHOOL_SEEDS }>();
  for (const s of TERRITORY_SCHOOL_SEEDS) {
    const key = norm(s.district_name);
    if (!map.has(key)) map.set(key, { district: s.district_name, county: s.county, expectedSchools: [] });
    map.get(key)!.expectedSchools.push(s);
  }
  return [...map.values()].sort((a, b) => a.county.localeCompare(b.county) || a.district.localeCompare(b.district));
}

export async function getTerritoryData() {
  if (!hasSupabaseServiceCredentials()) return { schools: [] as DbRow[], districts: [] as DbRow[], contacts: [] as DbRow[], queue: [] as DbRow[], runs: [] as DbRow[], errors: [] as DbRow[], sources: [] as DbRow[] };
  const db = createServiceClient();
  const [schools, districts, contacts, queue, runs, errors, sources] = await Promise.all([
    db.from('schools').select('*,districts(name,county)').limit(5000),
    db.from('districts').select('*').limit(1000),
    db.from('contacts').select('*').limit(10000),
    db.from('crawl_queue').select('*').limit(10000),
    db.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(20),
    db.from('crawl_errors').select('*').order('created_at', { ascending: false }).limit(500),
    db.from('source_urls').select('*').limit(5000),
  ]);
  for (const r of [schools, districts, contacts, queue, runs, errors, sources]) if (r.error) throw r.error;
  return { schools: schools.data ?? [], districts: districts.data ?? [], contacts: contacts.data ?? [], queue: queue.data ?? [], runs: runs.data ?? [], errors: errors.data ?? [], sources: sources.data ?? [] };
}

export function contactsForSchool(contacts: DbRow[], schoolId: string) { return contacts.filter((c) => c.school_id === schoolId); }
export function schoolFlags(s: DbRow | undefined, contacts: DbRow[]) {
  const cs = s?.id ? contactsForSchool(contacts, s.id) : [];
  return { exists: !!s, address: has(s?.address), phone: has(s?.phone), website: has(s?.website), source: has(s?.source_url), contacts: cs.length > 0, principal: cs.some((c) => role(c, ['principal'])), counselor: cs.some((c) => role(c, ['counselor', 'counseling'])), cte: cs.some((c) => role(c, ['cte', 'career technical', 'shop', 'automotive', 'welding', 'diesel'])) };
}
export function missingItems(s: DbRow, contacts: DbRow[]) {
  const f = schoolFlags(s, contacts); const out: string[] = [];
  if (!f.website) out.push('website'); if (!f.phone) out.push('phone'); if (!f.source) out.push('source URL'); if (!f.principal) out.push('principal'); if (!f.counselor) out.push('counselor'); if (!f.cte) out.push('CTE/shop contact');
  return out;
}
export function buildCoverage(schools: DbRow[], contacts: DbRow[]) {
  return expectedDistricts().map((d) => {
    const foundSchools = d.expectedSchools.map((e) => ({ expected: e, found: schools.find((s) => norm(s.name) === norm(e.school_name) || (norm(s.name).includes(norm(e.school_name)) && norm(s.county) === norm(e.county))) }));
    const foundCount = foundSchools.filter((x) => x.found).length;
    const missingContacts = foundSchools.filter((x) => x.found && !schoolFlags(x.found, contacts).contacts).length;
    const needsVerification = foundSchools.filter((x) => x.found && x.found.verification_status !== 'verified').length;
    const status = foundCount === 0 ? 'Missing all schools' : foundCount === d.expectedSchools.length && missingContacts === 0 && needsVerification === 0 ? 'Complete' : foundCount === d.expectedSchools.length ? 'Needs contact discovery' : foundCount / d.expectedSchools.length >= .75 ? 'Mostly complete' : 'Missing some schools';
    return { ...d, expectedCount: d.expectedSchools.length, foundCount, missingCount: d.expectedSchools.length - foundCount, missingContacts, needsVerification, status, schools: foundSchools };
  });
}
