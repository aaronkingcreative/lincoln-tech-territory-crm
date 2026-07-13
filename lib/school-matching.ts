import { DbRow } from '@/lib/coverage';
import { JsonImportItem } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export type SchoolMatchMethod = 'school_id' | 'exact_name' | 'alias' | 'normalized_name';
export type SchoolMatch = { school: DbRow; method: SchoolMatchMethod; incomingName?: string; matchedName: string; warnings: string[] };
export type SchoolMatchResult = { status: 'none' } | { status: 'matched'; match: SchoolMatch } | { status: 'ambiguous'; matches: SchoolMatch[]; reason: string } | { status: 'missing_id'; reason: string };

const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;

type SchoolCandidate = DbRow & { districts?: { name?: string | null } | null };
type AliasRow = { school_id?: string | null; alias?: string | null; normalized_alias?: string | null; schools?: SchoolCandidate | null };

function compactSpaces(value: string) { return value.trim().replace(/\s+/g, ' '); }

export function normalizeSchoolNameForMatching(name: string): string {
  const words = compactSpaces(name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' '))
    .split(' ')
    .filter(Boolean)
    .map(word => word === 'hs' ? 'high school' : word)
    .join(' ')
    .split(' ')
    .filter(Boolean);
  const normalized: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1];
    const nextTwo = words[index + 2];
    const previous = words[index - 1];
    const seniorBeforeHighSchool = (word === 'senior' || word === 'sr') && next === 'high' && nextTwo === 'school';
    const partOfJuniorSenior = seniorBeforeHighSchool && (previous === 'jr' || previous === 'junior');
    if (seniorBeforeHighSchool && !partOfJuniorSenior) continue;
    normalized.push(word);
  }
  return compactSpaces(normalized.join(' '));
}

export function normalizedVariantMessage(incomingName: string, matchedName: string) {
  return `Matched existing school by name variant: “${incomingName}” matched “${matchedName}”.`;
}

export function possibleVariantMessage(incomingName: string, matchedName: string) {
  return `Possible name variant found: ‘${incomingName}’ may already exist as ‘${matchedName}.’ This was not created as a new school. Use the matched school, include school_id, or confirm create_if_missing only if this is truly a different school.`;
}

function domainFrom(value?: string) {
  if (!value) return undefined;
  try { return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || undefined; }
}

function normalized(value?: string) { return value ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') : ''; }

function contextScore(item: JsonImportItem, school: SchoolCandidate) {
  let score = 0;
  if (str(item.nces_id) && str(school.nces_id) === str(item.nces_id)) score += 5;
  if (str(item.state) && normalized(str(school.state)) === normalized(str(item.state))) score += 1;
  if (str(item.city) && normalized(str(school.city)) === normalized(str(item.city))) score += 1;
  if (str(item.county) && normalized(str(school.county)) === normalized(str(item.county))) score += 1;
  if (str(item.address) && normalized(str(school.address)) === normalized(str(item.address))) score += 2;
  if (str(item.district_name) && normalized(str(school.districts?.name)) === normalized(str(item.district_name))) score += 2;
  const incomingDomains = [domainFrom(str(item.website)), domainFrom(str(item.source_url))].filter(Boolean);
  const schoolDomains = [domainFrom(str(school.website)), domainFrom(str(school.source_url))].filter(Boolean);
  if (incomingDomains.some(domain => schoolDomains.includes(domain))) score += 2;
  return score;
}

function toMatch(school: SchoolCandidate, method: SchoolMatchMethod, incomingName?: string, aliasName?: string): SchoolMatch {
  const matchedName = str(school.name) ?? aliasName ?? 'Existing school';
  const warnings = incomingName && method !== 'exact_name' && method !== 'school_id' ? [normalizedVariantMessage(incomingName, matchedName)] : [];
  return { school, method, incomingName, matchedName, warnings };
}

export async function resolveSchoolMatch(db: ReturnType<typeof createServiceClient>, item: JsonImportItem): Promise<SchoolMatchResult> {
  const id = str(item.school_id);
  const incomingName = str(item.school_name);
  if (id) {
    const { data } = await db.from('schools').select('*,districts(name)').eq('id', id).maybeSingle();
    if (!data) return { status: 'missing_id', reason: `School not found for school_id: ${id}` };
    const school = data as SchoolCandidate;
    const warnings = incomingName && normalizeSchoolNameForMatching(incomingName) !== normalizeSchoolNameForMatching(str(school.name) ?? '') ? [`Provided school_name “${incomingName}” differs from school_id match “${str(school.name) ?? id}”.`] : [];
    return { status: 'matched', match: { school, method: 'school_id', incomingName, matchedName: str(school.name) ?? id, warnings } };
  }
  if (!incomingName) return { status: 'none' };
  const exact = (await db.from('schools').select('*,districts(name)').ilike('name', incomingName).maybeSingle()).data as SchoolCandidate | null;
  if (exact) return { status: 'matched', match: toMatch(exact, 'exact_name', incomingName) };
  const wanted = normalizeSchoolNameForMatching(incomingName);
  try {
    const { data } = await db.from('school_aliases').select('alias,normalized_alias,schools(*,districts(name))').eq('normalized_alias', wanted);
    const aliasMatches = ((data ?? []) as AliasRow[]).flatMap(row => row.schools ? [toMatch(row.schools, 'alias', incomingName, str(row.alias))] : []);
    if (aliasMatches.length === 1) return { status: 'matched', match: aliasMatches[0] };
    if (aliasMatches.length > 1) return { status: 'ambiguous', matches: aliasMatches, reason: 'Multiple school aliases matched. Include school_id.' };
  } catch { /* Optional alias table may not exist until the safe migration is applied. */ }
  const { data } = await db.from('schools').select('*,districts(name)');
  const candidates = ((data ?? []) as SchoolCandidate[]).filter(school => normalizeSchoolNameForMatching(str(school.name) ?? '') === wanted);
  const strong = candidates.filter(school => contextScore(item, school) > 0);
  const finalCandidates = strong.length ? strong : candidates;
  if (finalCandidates.length === 1) return { status: 'matched', match: toMatch(finalCandidates[0], 'normalized_name', incomingName) };
  if (finalCandidates.length > 1) return { status: 'ambiguous', matches: finalCandidates.map(school => toMatch(school, 'normalized_name', incomingName)), reason: 'Multiple possible school name variants matched. Include school_id.' };
  return { status: 'none' };
}

export async function storeSchoolAlias(db: ReturnType<typeof createServiceClient>, schoolId: string, alias: string) {
  const normalizedAlias = normalizeSchoolNameForMatching(alias);
  try { await db.from('school_aliases').upsert({ school_id: schoolId, alias, normalized_alias: normalizedAlias, source: 'ai_assisted_update', updated_at: new Date().toISOString() }, { onConflict: 'school_id,normalized_alias' }); }
  catch { /* Alias storage is additive; import success must not depend on the optional table. */ }
}
