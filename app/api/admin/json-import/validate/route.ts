import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { ImportResultGroups, JsonImportItem, normalizeImport, roleCategories, supportedItemTypes, supportedType } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const fieldLabels: Record<string,string> = { phone:'Phone', website:'Website', address:'Address', city:'City', zip:'ZIP', fax:'Fax', school_type:'School type', territory_status:'Territory status', office_address:'Address' };
const schoolFields = ['phone','website','address','city','state','zip','fax','school_type','territory_status','source_url','recruiting_priority','relationship_status','enrollment','mascot','graduation_date','bell_schedule_url','fafsa_or_career_event_notes','best_time_to_visit_seniors','special_programs','program_notes'];
const districtFields = ['phone','website','office_address','city','state','zip','superintendent','cte_director','source_url'];
const empty = (): ImportResultGroups => ({ applied: [], updated: [], created: [], skipped: [], unchanged: [], failed: [], warnings: [] });
async function find(db: ReturnType<typeof createServiceClient>, table: 'schools'|'districts', id?: unknown, name?: unknown) { const sid=str(id); if(sid) return (await db.from(table).select('*').eq('id',sid).maybeSingle()).data as any; const n=str(name); if(n) return (await db.from(table).select('*').ilike('name',n).maybeSingle()).data as any; return null; }
function previewFields(item: JsonImportItem, existing: any, fields: string[]) { return fields.flatMap(field => { const incoming = field === 'office_address' ? (item.office_address ?? item.address) : item[field]; if(!present(incoming)) return []; const cur=existing?.[field]; return [{ field, label: fieldLabels[field] ?? field.replaceAll('_',' '), from: present(cur) ? cur : 'Missing', to: incoming, reason: !item.overwrite && present(cur) && String(cur)!==String(incoming) ? 'Existing value will be preserved unless empty.' : undefined }]; }); }
function countTypes(items: JsonImportItem[]) { return items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.type]: (a[i.type] ?? 0) + 1 }), {}); }

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request); if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  try {
    const raw = await request.json(); const items = normalizeImport(raw); const db = createServiceClient(); const summary = empty();
    for (const item of items) {
      const school = await find(db, 'schools', item.school_id, item.school_name); const district = await find(db, 'districts', item.district_id ?? school?.district_id, item.district_name);
      const base = { type: item.type, target_name: str(item.school_name) ?? str(item.district_name) ?? str(item.contact_name) ?? str(item.name) ?? str(item.title), school: str(school?.name) ?? str(item.school_name), district: str(district?.name) ?? str(item.district_name), source_url: item.source_url };
      const info = supportedType(item.type);
      if (!info) { summary.skipped.push({ ...base, reason: 'Skipped because unsupported item type.' }); continue; }
      if (!info.importable) { summary.warnings.push({ ...base, reason: 'This item type is recognized but not importable yet.' }); continue; }
      if ((item.type === 'school_update' || item.type === 'school_note_create' || item.type === 'school_program_update' || item.type === 'contact_create' || item.type === 'contact_update') && str(item.school_name) && !school) summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name)}`, suggested_fix: 'Check school_name or include school_id before importing.' });
      else if ((item.type.includes('school') || item.type === 'task_create') && str(item.school_name) && !school) summary.warnings.push({ ...base, reason: 'School not found. This item may fail unless it is a global task.' });
      if (item.type === 'school_update') summary.updated.push({ ...base, record_id: school?.id, fields_changed: previewFields(item, school, schoolFields) });
      else if (item.type === 'district_update') summary.updated.push({ ...base, record_id: district?.id, fields_changed: previewFields(item, district, districtFields) });
      else if (item.type === 'contact_create' || item.type === 'contact_update') { if (!str(item.contact_name) && !str(item.name) && !str(item.title)) summary.failed.push({ ...base, reason: 'Contact needs at least contact_name or title.' }); if (str(item.role_category) && !roleCategories.includes(str(item.role_category) as any)) summary.warnings.push({ ...base, reason: 'Role category not recognized; it will import as unknown.' }); if (!str(item.email)) summary.warnings.push({ ...base, reason: 'Email is missing. Contact can still be imported with lower confidence.' }); summary.created.push({ ...base, fields_changed: ['contact_name','title','role_category','email','phone'].filter(f=>present(item[f]) || (f==='contact_name' && present(item.name))).map(f=>({field:f,label:fieldLabels[f]??f.replaceAll('_',' '),to:f==='contact_name' ? (item.contact_name ?? item.name) : item[f]})) }); }
      else if (item.type === 'school_note_create') summary.created.push({ ...base, fields_changed: [{ field:'note', label:'Note text', to: item.note ?? item.notes }, { field:'note_type', label:'Note type', to: item.note_type }] });
      else if (item.type === 'task_create') summary.created.push({ ...base, fields_changed: [{ field:'title', label:'Title', to:item.title }, { field:'priority', label:'Priority', to:item.priority }, { field:'status', label:'Status', to:item.status }, { field:'description', label:'Description', to:item.description }] });
      else summary.created.push({ ...base, message: `${info.label} will be imported if valid.` });
    }
    const response = { valid: summary.failed.length === 0, supported_item_types: supportedItemTypes, summary: { count: items.length, types: countTypes(items), preview: items }, ...summary };
    const { data } = await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary: response, status: response.valid ? 'validated' : 'failed' }).select('id').single();
    return NextResponse.json({ ...response, import_id: data?.id });
  } catch (error) {
    return NextResponse.json({ valid: false, error: error instanceof Error ? error.message : 'Invalid JSON import payload.' }, { status: 400 });
  }
}
