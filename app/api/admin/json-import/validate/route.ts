import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { ImportResultGroups, JsonImportItem, normalizeImport, roleCategories, supportedItemTypes, supportedType, validationMessagesForItem } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';
import { possibleVariantMessage, resolveSchoolMatch } from '@/lib/school-matching';
import { likelyDuplicateSchool, present, requiredSchoolCreateMissing, resolveDistrict, schoolCreatePayload, schoolCreateFields, str } from '@/lib/school-create';

export const dynamic = 'force-dynamic';
const fieldLabels: Record<string,string> = { phone:'Phone', website:'Website', address:'Address', city:'City', zip:'ZIP', fax:'Fax', school_type:'School type', territory_status:'Territory status', office_address:'Address' };
const schoolFields = ['phone','website','address','city','state','zip','fax','source_url','source_notes','recruiting_priority','relationship_status','enrollment','mascot','graduation_date','special_programs','program_notes','cte_programs','shop_programs','trades_programs','career_programs','school_profile_notes','bell_schedule','bell_schedule_url','student_population_total','grade_enrollment','enrollment_source_url','enrollment_notes'];
const districtFields = ['phone','website','office_address','city','state','zip','superintendent','cte_director','source_url'];
const empty = (): ImportResultGroups => ({ applied: [], updated: [], created: [], skipped: [], unchanged: [], failed: [], warnings: [] });
type PreviewRow = Record<string, unknown> & { id?: string; name?: string; district_id?: string };
type PreviewRecord = Record<string, unknown> & { overwrite?: boolean };
async function find(db: ReturnType<typeof createServiceClient>, table: 'schools'|'districts', id?: unknown, name?: unknown): Promise<PreviewRow | null> { const sid=str(id); if(sid) return (await db.from(table).select('*').eq('id',sid).maybeSingle()).data as PreviewRow | null; const n=str(name); if(n) return (await db.from(table).select('*').ilike('name',n).maybeSingle()).data as PreviewRow | null; return null; }
function previewFields(item: PreviewRecord, existing: Record<string, unknown> | null | undefined, fields: string[]) { return fields.flatMap(field => { const incoming = field === 'office_address' ? (item.office_address ?? item.address) : item[field]; if(!present(incoming)) return []; const cur=existing?.[field]; return [{ field, label: fieldLabels[field] ?? field.replaceAll('_',' '), from: present(cur) ? cur : 'Missing', to: incoming, reason: !item.overwrite && present(cur) && String(cur)!==String(incoming) ? 'Existing value will be preserved unless empty.' : undefined }]; }); }
function countTypes(items: JsonImportItem[]) { return items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.type]: (a[i.type] ?? 0) + 1 }), {}); }
function hashItems(items: JsonImportItem[]) { return createHash('sha256').update(JSON.stringify({ items })).digest('hex'); }

async function handlePost(request: NextRequest) {
  const admin = await requireAdmin(request); if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  let raw: unknown;
  let items: JsonImportItem[];
  try {
    raw = await request.json();
    items = normalizeImport(raw);
  } catch (error) {
    return NextResponse.json({ ok: false, status: 'failed', valid: false, error: 'Invalid JSON import payload', details: error instanceof Error ? error.message : 'Invalid JSON import payload.' }, { status: 400 });
  }
  const db = createServiceClient(); const summary = empty();
    for (const [index, item] of items.entries()) {
      const schoolMatchResult = await resolveSchoolMatch(db, item); const schoolMatch = schoolMatchResult.status === 'matched' ? schoolMatchResult.match : null; const school = schoolMatch?.school ?? null; const district = await find(db, 'districts', item.district_id ?? school?.district_id, item.district_name);
      const base = { item_index: index, type: item.type, target_name: str(item.school_name) ?? str(item.district_name) ?? str(item.contact_name) ?? str(item.name) ?? str(item.title), school: str(school?.name) ?? str(item.school_name), district: str(district?.name) ?? str(item.district_name), source_url: item.source_url };
      const info = supportedType(item.type);
      const validation = validationMessagesForItem(item);
      for (const warning of validation.warnings) summary.warnings.push({ ...base, reason: warning });
      if (validation.errors.length) { for (const reason of validation.errors) summary.failed.push({ ...base, reason }); continue; }
      if (!info) { summary.skipped.push({ ...base, reason: `Unsupported item type: ${item.type}` }); continue; }
      if (!info.importable) { summary.warnings.push({ ...base, reason: 'This item type is recognized but not importable yet.' }); continue; }
      if (schoolMatchResult.status === 'missing_id') { summary.failed.push({ ...base, reason: schoolMatchResult.reason, suggested_fix: 'Check school_id or remove it to match by name.' }); continue; }
      else if (schoolMatchResult.status === 'ambiguous') { summary.failed.push({ ...base, reason: schoolMatchResult.reason, suggested_fix: 'Include school_id to choose the correct school.', warnings: schoolMatchResult.matches.map(match => possibleVariantMessage(str(item.school_name) ?? 'Incoming school', match.matchedName)) }); continue; }
      else if (schoolMatch?.warnings.length) summary.warnings.push({ ...base, record_id: schoolMatch.school.id, school_record_id: schoolMatch.school.id, reason: schoolMatch.warnings.join(' '), warnings: schoolMatch.warnings });
      if ((item.type === 'school_note_create' || item.type === 'school_program_update' || item.type === 'contact_create' || item.type === 'contact_update') && str(item.school_name) && !school) summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name)}`, suggested_fix: 'Check school_name or include school_id before importing.' });
      else if ((item.type.includes('school') || item.type === 'task_create') && str(item.school_name) && !school && item.type !== 'school_update' && item.type !== 'school_create') summary.warnings.push({ ...base, reason: 'School not found. This item may fail unless it is a global task.' });
      if (item.type === 'school_update') {
        if (!school && item.create_if_missing === true) {
          const missing = requiredSchoolCreateMissing(item); const duplicate = missing.length ? null : await likelyDuplicateSchool(db, item); const districtResult = missing.length || duplicate ? null : await resolveDistrict(db, item);
          if (missing.length) summary.failed.push({ ...base, reason: `Will not create school; missing required fields: ${missing.join(', ')}.`, suggested_fix: 'Add required create fields or use an existing school name.' });
          else if (duplicate) summary.failed.push({ ...base, reason: possibleVariantMessage(str(item.school_name) ?? 'Incoming school', str(duplicate.name) ?? 'an existing school'), record_id: duplicate.id });
          else if (districtResult?.error) summary.failed.push({ ...base, reason: districtResult.error, suggested_fix: 'Include district_id or clearer district_name/county/state.' });
          else summary.created.push({ ...base, district: str(districtResult?.district?.name) ?? str(item.district_name), reason: `Will create new school needing verification: ${str(item.school_name) ?? 'New school'}`, fields_changed: previewFields(schoolCreatePayload(item, districtResult?.district?.id ?? 'preview'), {}, [...schoolCreateFields, 'address', 'phone', 'website', 'source_url']) });
        } else if (!school) summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name) ?? 'missing school_name'}. This item is blocked because create_if_missing is not true.`, suggested_fix: 'Use exact existing school name, include school_id, add create_if_missing: true, or use school_create.' });
        else summary.updated.push({ ...base, record_id: school?.id, fields_changed: previewFields(item, school, schoolFields) });
      }
      else if (item.type === 'school_create') {
        const missing = requiredSchoolCreateMissing(item); const duplicate = missing.length ? null : await likelyDuplicateSchool(db, item); const districtResult = missing.length || duplicate ? null : await resolveDistrict(db, item);
        if (missing.length) summary.failed.push({ ...base, reason: `Will not create school; missing required fields: ${missing.join(', ')}.` });
        else if (duplicate) summary.failed.push({ ...base, reason: possibleVariantMessage(str(item.school_name) ?? 'Incoming school', str(duplicate.name) ?? 'an existing school'), record_id: duplicate.id });
        else if (districtResult?.error) summary.failed.push({ ...base, reason: districtResult.error, suggested_fix: 'Include district_id or clearer district_name/county/state.' });
        else summary.created.push({ ...base, district: str(districtResult?.district?.name) ?? str(item.district_name), reason: 'Will create new school.', fields_changed: previewFields(schoolCreatePayload(item, districtResult?.district?.id ?? 'preview'), {}, [...schoolCreateFields, 'address', 'phone', 'website', 'source_url']) });
      }
      else if (item.type === 'district_update') summary.updated.push({ ...base, record_id: district?.id, fields_changed: previewFields(item, district, districtFields) });
      else if (item.type === 'contact_create' || item.type === 'contact_update') { if (!str(item.contact_name) && !str(item.name) && !str(item.title)) summary.failed.push({ ...base, reason: 'Contact needs at least contact_name or title.' }); if (str(item.role_category) && !roleCategories.some(category => category === str(item.role_category))) summary.warnings.push({ ...base, reason: 'Role category not recognized; it will import as unknown.' }); if (!str(item.email)) summary.warnings.push({ ...base, reason: 'Email is missing. Contact can still be imported with lower confidence.' }); summary.created.push({ ...base, fields_changed: ['contact_name','title','role_category','email','phone'].filter(f=>present(item[f]) || (f==='contact_name' && present(item.name))).map(f=>({field:f,label:fieldLabels[f]??f.replaceAll('_',' '),to:f==='contact_name' ? (item.contact_name ?? item.name) : item[f]})) }); }
      else if (item.type === 'school_note_create') summary.created.push({ ...base, fields_changed: [{ field:'note', label:'Note text', to: item.note ?? item.notes }, { field:'note_type', label:'Note type', to: item.note_type }] });
      else if (item.type === 'task_create') summary.created.push({ ...base, fields_changed: [{ field:'title', label:'Title', to:item.title }, { field:'priority', label:'Priority', to:item.priority }, { field:'status', label:'Status', to:item.status }, { field:'description', label:'Description', to:item.description }] });
      else summary.created.push({ ...base, message: `${info.label} will be imported if valid.` });
    }
    const inputHash = hashItems(items);
    let previousRun: any = null;
    try {
      previousRun = (await db.from('ai_update_runs').select('id,status,finished_at,result_summary').eq('input_hash', inputHash).neq('status', 'running').order('finished_at', { ascending: false }).limit(1).maybeSingle()).data;
    } catch { /* Duplicate detection is helpful but must not block validation. */ }
    if (previousRun?.id) {
      const failedItems = Array.isArray(previousRun.result_summary?.failed) ? previousRun.result_summary.failed : [];
      const failedTypes = Array.from(new Set(failedItems.map((item: { type?: unknown }) => String(item.type ?? 'unknown'))));
      const previousStatus = String(previousRun.status ?? 'unknown');
      const partial = previousStatus === 'partial_success' || previousStatus === 'failed';
      summary.warnings.push({
        type: 'duplicate_import',
        target_name: 'Exact update payload',
        reason: partial ? 'This update was previously attempted, but some items failed.' : 'This exact update was already imported successfully. You can review the previous run or commit again anyway if retrying intentionally.',
        message: partial ? `Previous run ${previousRun.id} finished with status ${previousStatus}. Failed items: ${failedItems.length}${failedTypes.length ? ` (${failedTypes.join(', ')})` : ''}. Retry failed items or commit again anyway to create a new run.` : `Previous run ${previousRun.id} finished with status ${previousStatus}.`,
      });
    }
    const response = { valid: summary.updated.length + summary.created.length > 0, already_imported: !!previousRun?.id, previous_import_run: previousRun ?? null, input_hash: inputHash, supported_item_types: supportedItemTypes, summary: { count: items.length, types: countTypes(items), preview: items }, ...summary };
    const { data } = await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary: response, status: response.valid ? 'validated' : 'failed' }).select('id').single();
    return NextResponse.json({ ...response, import_id: data?.id });
}


export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    return NextResponse.json({ ok: false, status: 'error', valid: false, error: 'Importer server error', details: error instanceof Error ? error.message : 'Unexpected importer server error.' }, { status: 500 });
  }
}
