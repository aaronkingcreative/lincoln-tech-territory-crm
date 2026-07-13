import { DbRow } from '@/lib/coverage';
import { JsonImportItem } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export type SchoolMatchMethod = 'school_id' | 'exact_name' | 'alias' | 'normalized_name';
export type SchoolMatch = { school: DbRow; method: SchoolMatchMethod; incomingName?: string; matchedName: string; warnings: string[]; contextReason?: string };
export type SchoolMatchResult = { status: 'none' } | { status: 'matched'; match: SchoolMatch } | { status: 'ambiguous'; matches: SchoolMatch[]; reason: string } | { status: 'missing_id'; reason: string };

const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;

type SchoolCandidate = DbRow & { districts?: { name?: string | null } | null };
type AliasRow = { school_id?: string | null; alias?: string | null; normalized_alias?: string | null; schools?: SchoolCandidate | null };
type ScoredSchool = { school: SchoolCandidate; score: number; reasons: string[] };

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

export function schoolAliasKey(name: string): string {
  const normalizedName = normalizeSchoolNameForMatching(name)
    .replace(/\b(jr|junior|sr|senior)\b/g, ' ')
    .replace(/\b(public|charter|high|school)\b/g, ' ');
  return compactSpaces(normalizedName.replace(/\s+/g, ' '));
}

export function normalizedVariantMessage(incomingName: string, matchedName: string, contextReason?: string) {
  const using = contextReason ? ` using ${contextReason}` : '';
  return `Alias matched: “${incomingName}” matched existing “${matchedName}”${using}.`;
}

export function possibleVariantMessage(incomingName: string, matchedName: string) {
  return `Possible duplicate or ambiguous match found for “${incomingName}”: ${matchedName}. Use exact school name or include school_id.`;
}

function domainFrom(value?: string) {
  if (!value) return undefined;
  try { return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || undefined; }
}

function normalized(value?: string) { return value ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') : ''; }

function contextScoreWithReasons(item: JsonImportItem, school: SchoolCandidate): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (str(item.nces_id) && str(school.nces_id) === str(item.nces_id)) { score += 5; reasons.push(`NCES ID ${str(item.nces_id)}`); }
  if (str(item.state) && normalized(str(school.state)) === normalized(str(item.state))) { score += 1; reasons.push(`state ${str(item.state)}`); }
  if (str(item.city) && normalized(str(school.city)) === normalized(str(item.city))) { score += 1; reasons.push(`city ${str(item.city)}`); }
  if (str(item.county) && normalized(str(school.county)) === normalized(str(item.county))) { score += 1; reasons.push(`county ${str(item.county)}`); }
  if (str(item.address) && normalized(str(school.address)) === normalized(str(item.address))) { score += 2; reasons.push(`address ${str(item.address)}`); }
  if (str(item.district_name) && normalized(str(school.districts?.name)) === normalized(str(item.district_name))) { score += 2; reasons.push(`district_name ${str(item.district_name)}`); }
  const incomingDomains = [domainFrom(str(item.website)), domainFrom(str(item.source_url))].filter((value): value is string => Boolean(value));
  const schoolDomains = [domainFrom(str(school.website)), domainFrom(str(school.source_url))].filter((value): value is string => Boolean(value));
  const matchedDomain = incomingDomains.find(domain => schoolDomains.includes(domain));
  if (matchedDomain) { score += 2; reasons.push(`domain ${matchedDomain}`); }
  return { score, reasons };
}

function contextReason(reasons: string[]) {
  if (reasons.length === 0) return undefined;
  if (reasons.length === 1) return reasons[0];
  return `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
}

function toMatch(school: SchoolCandidate, method: SchoolMatchMethod, incomingName?: string, aliasName?: string, reasons: string[] = []): SchoolMatch {
  const matchedName = str(school.name) ?? aliasName ?? 'Existing school';
  const reason = contextReason(reasons);
  const warnings = incomingName && method !== 'exact_name' && method !== 'school_id' ? [normalizedVariantMessage(incomingName, matchedName, reason)] : [];
  return { school, method, incomingName, matchedName, warnings, contextReason: reason };
}

export function resolveSchoolMatchFromCandidates(item: JsonImportItem, candidates: SchoolCandidate[]): SchoolMatchResult {
  const incomingName = str(item.school_name);
  if (!incomingName) return { status: 'none' };
  const wantedNormalized = normalizeSchoolNameForMatching(incomingName);
  const wantedAlias = schoolAliasKey(incomingName);
  const exact = candidates.filter(school => normalized(str(school.name)) === normalized(incomingName));
  if (exact.length === 1) return { status: 'matched', match: toMatch(exact[0], 'exact_name', incomingName) };
  if (exact.length > 1) return { status: 'ambiguous', matches: exact.map(school => toMatch(school, 'exact_name', incomingName)), reason: `Multiple exact school name matches found for “${incomingName}”. Include school_id.` };
  const variantCandidates = candidates.filter(school => {
    const schoolName = str(school.name) ?? '';
    const candidateAlias = schoolAliasKey(schoolName);
    const wantedAliasWords = wantedAlias.split(' ').filter(Boolean);
    const candidateAliasWords = candidateAlias.split(' ').filter(Boolean);
    const directionalVariant = wantedAliasWords.length > 0 && wantedAliasWords.every(word => candidateAliasWords.includes(word));
    return normalizeSchoolNameForMatching(schoolName) === wantedNormalized || candidateAlias === wantedAlias || directionalVariant;
  });
  const scored: ScoredSchool[] = variantCandidates.map(school => ({ school, ...contextScoreWithReasons(item, school) })).filter(match => match.score > 0);
  if (scored.length === 1) return { status: 'matched', match: toMatch(scored[0].school, 'normalized_name', incomingName, undefined, scored[0].reasons) };
  if (scored.length > 1) return { status: 'ambiguous', matches: scored.map(match => toMatch(match.school, 'normalized_name', incomingName, undefined, match.reasons)), reason: `Possible duplicate or ambiguous match found for “${incomingName}”. Use exact school name or include school_id.` };
  return { status: 'none' };
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
    const aliasMatches = ((data ?? []) as AliasRow[]).flatMap(row => row.schools ? [row.schools] : []);
    const scored = aliasMatches.map(school => ({ school, ...contextScoreWithReasons(item, school) })).filter(match => match.score > 0);
    if (scored.length === 1) return { status: 'matched', match: toMatch(scored[0].school, 'alias', incomingName, undefined, scored[0].reasons) };
    if (scored.length > 1) return { status: 'ambiguous', matches: scored.map(match => toMatch(match.school, 'alias', incomingName, undefined, match.reasons)), reason: `Possible duplicate or ambiguous match found for “${incomingName}”. Use exact school name or include school_id.` };
  } catch { /* Optional alias table may not exist until the safe migration is applied. */ }
  const { data } = await db.from('schools').select('*,districts(name)');
  return resolveSchoolMatchFromCandidates(item, (data ?? []) as SchoolCandidate[]);
}

export async function storeSchoolAlias(db: ReturnType<typeof createServiceClient>, schoolId: string, alias: string) {
  const normalizedAlias = normalizeSchoolNameForMatching(alias);
  try { await db.from('school_aliases').upsert({ school_id: schoolId, alias, normalized_alias: normalizedAlias, source: 'ai_assisted_update', updated_at: new Date().toISOString() }, { onConflict: 'school_id,normalized_alias' }); }
  catch { /* Alias storage is additive; import success must not depend on the optional table. */ }
}
