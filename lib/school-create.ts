import { DbRow } from '@/lib/coverage';
import { JsonImportItem } from '@/lib/json-import';
import { normalizeSchoolNameForMatching } from '@/lib/school-matching';
import { createServiceClient } from '@/lib/supabase';

export const schoolCreateFields = ['name','district_id','county','state','address','city','zip','phone','fax','website','source_url','source_notes','special_programs','program_notes','cte_programs','shop_programs','trades_programs','career_programs','bell_schedule','bell_schedule_url','student_population_total','grade_enrollment','enrollment_source_url','enrollment_notes','school_profile_notes','nces_id','school_type','territory_status','verification_status'] as const;
export type SchoolCreateField = typeof schoolCreateFields[number];

export const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
export const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
export const normalizeText = (v?: string) => v?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ') ?? '';
const normalizeSchoolName = (v?: string) => v ? normalizeSchoolNameForMatching(v) : '';
export const normalizeUrl = (v?: string) => v?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '') ?? '';

export function requiredSchoolCreateMissing(item: JsonImportItem) {
  const missing: string[] = [];
  if (!str(item.school_name)) missing.push('school_name');
  if (!str(item.district_name)) missing.push('district_name');
  if (!str(item.county)) missing.push('county');
  if (!str(item.state)) missing.push('state');
  if (!str(item.city) && !str(item.address) && !str(item.website) && !str(item.source_url)) missing.push('one of city, address, website, or source_url');
  return missing;
}

export function rawSchoolCreatePayload(item: JsonImportItem, districtId: string, runId?: string) {
  return {
    name: str(item.school_name), district_id: districtId, county: str(item.county), state: str(item.state), address: str(item.address), city: str(item.city), zip: str(item.zip), phone: str(item.phone), fax: str(item.fax), website: str(item.website), source_url: str(item.source_url), source_notes: str(item.source_notes), special_programs: str(item.special_programs), program_notes: str(item.program_notes), cte_programs: str(item.cte_programs), shop_programs: str(item.shop_programs), trades_programs: str(item.trades_programs), career_programs: str(item.career_programs), bell_schedule: str(item.bell_schedule), bell_schedule_url: str(item.bell_schedule_url), student_population_total: typeof item.student_population_total === 'number' ? item.student_population_total : undefined, grade_enrollment: item.grade_enrollment ?? undefined, enrollment_source_url: str(item.enrollment_source_url), enrollment_notes: str(item.enrollment_notes), school_profile_notes: str(item.school_profile_notes), nces_id: str(item.nces_id), school_type: str(item.school_type) ?? 'public', territory_status: str(item.territory_status) ?? 'included', verification_status: str(item.verification_status) ?? 'unverified', last_ai_update_at: new Date().toISOString(), last_ai_update_run_id: runId,
  } satisfies Record<string, unknown>;
}

export async function resolveDistrict(db: ReturnType<typeof createServiceClient>, item: JsonImportItem): Promise<{ district?: DbRow; created?: boolean; error?: string }> {
  const id = str(item.district_id); if (id) { const { data } = await db.from('districts').select('*').eq('id', id).maybeSingle(); return data ? { district: data as DbRow } : { error: `District not found: ${id}` }; }
  const name = str(item.district_name); if (!name) return { error: 'district_name is required.' };
  const { data } = await db.from('districts').select('*').ilike('name', name);
  const matches = ((data ?? []) as DbRow[]).filter(d => normalizeText(str(d.name)) === normalizeText(name) && (!str(item.state) || normalizeText(str(d.state)) === normalizeText(str(item.state))) && (!str(item.county) || !str(d.county) || normalizeText(str(d.county)) === normalizeText(str(item.county))));
  if (matches.length === 1) return { district: matches[0] };
  if (matches.length > 1) return { error: 'District is ambiguous. Include district_id or clearer district_name/county/state.' };
  if (!str(item.county) || !str(item.state)) return { error: 'Missing district county/state; cannot create district safely.' };
  const inserted = await db.from('districts').insert({ name, county: str(item.county), state: str(item.state), source_url: str(item.source_url), updated_at: new Date().toISOString() }).select('*').single();
  if (inserted.error) throw inserted.error;
  return { district: inserted.data as DbRow, created: true };
}

export async function likelyDuplicateSchool(db: ReturnType<typeof createServiceClient>, item: JsonImportItem): Promise<DbRow | null> {
  if (str(item.nces_id)) { const byNces = await db.from('schools').select('*').eq('nces_id', str(item.nces_id)).maybeSingle(); if (byNces.data) return byNces.data as DbRow; }
  if (str(item.source_url)) { const bySource = await db.from('schools').select('*').eq('source_url', str(item.source_url)).maybeSingle(); if (bySource.data) return bySource.data as DbRow; }
  const { data } = await db.from('schools').select('*,districts(name)');
  const wantedName = normalizeSchoolName(str(item.school_name)); const wantedCity = normalizeText(str(item.city)); const wantedCounty = normalizeText(str(item.county)); const wantedDistrict = normalizeText(str(item.district_name));
  return ((data ?? []) as DbRow[]).find(s => {
    const samePlace = (!wantedCity || normalizeText(str(s.city)) === wantedCity) && (!wantedCounty || normalizeText(str(s.county)) === wantedCounty);
    const sameDistrict = !wantedDistrict || normalizeText(str((s.districts as { name?: string } | undefined)?.name)) === wantedDistrict;
    const existingName = normalizeSchoolName(str(s.name));
    const sameName = existingName === wantedName || existingName.includes(wantedName) || wantedName.includes(existingName);
    return sameName && samePlace && sameDistrict;
  }) ?? null;
}

export function schoolCreatePayload(item: JsonImportItem, districtId: string, runId?: string) {
  return Object.fromEntries(Object.entries(rawSchoolCreatePayload(item, districtId, runId)).filter(([, value]) => value !== undefined)) as Record<string, unknown>;
}
