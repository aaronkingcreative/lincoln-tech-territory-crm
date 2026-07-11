import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { DbRow } from '@/lib/coverage';
import { ImportResultGroups, JsonImportItem, normalizeImport, roleCategories, supportedType } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const schoolFields = ['phone','website','address','city','state','zip','fax','school_type','territory_status','source_url','recruiting_priority','relationship_status','last_contacted_at','next_follow_up_at','outreach_notes','latitude','longitude','location_accuracy','geocoded_at','geocoding_source','enrollment','mascot','graduation_date','bell_schedule_url','fafsa_or_career_event_notes','best_time_to_visit_seniors','special_programs','program_notes'] as const;
const districtFields = ['phone','website','office_address','city','state','zip','superintendent','cte_director','source_url'] as const;
const result = (): ImportResultGroups => ({ applied: [], updated: [], created: [], skipped: [], unchanged: [], failed: [], warnings: [], affected_record_ids: [] });
const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const label = (f: string) => f.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const addId = (r: ImportResultGroups, id?: unknown) => { if (typeof id === 'string') r.affected_record_ids?.push(id); };
const normalize = (v?: string) => v?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function findSchool(db: ReturnType<typeof createServiceClient>, item: JsonImportItem) {
  const id = str(item.school_id); if (id) return (await db.from('schools').select('*').eq('id', id).maybeSingle()).data as DbRow | null;
  const name = str(item.school_name); if (name) return (await db.from('schools').select('*').ilike('name', name).maybeSingle()).data as DbRow | null;
  return null;
}
async function findDistrict(db: ReturnType<typeof createServiceClient>, item: JsonImportItem, school?: DbRow | null) {
  const id = str(item.district_id) ?? str(school?.district_id); if (id) return (await db.from('districts').select('*').eq('id', id).maybeSingle()).data as DbRow | null;
  const name = str(item.district_name); if (name) return (await db.from('districts').select('*').ilike('name', name).maybeSingle()).data as DbRow | null;
  return null;
}
function changesFor(item: JsonImportItem, existing: DbRow, fields: readonly string[]) {
  const changed: any[] = [], skipped: any[] = [], update: Record<string, unknown> = {};
  for (const field of fields) {
    const incoming = field === 'office_address' ? (item.office_address ?? item.address) : item[field];
    if (!present(incoming)) { if (field in item) skipped.push({ field, label: label(field), reason: 'Skipped because value was blank.' }); continue; }
    const current = existing[field];
    if (String(current ?? '') === String(incoming)) skipped.push({ field, label: label(field), from: current, to: incoming, reason: 'Unchanged because value already matched.' });
    else if (!item.overwrite && present(current)) skipped.push({ field, label: label(field), from: current, to: incoming, reason: 'Existing value will be preserved unless empty.' });
    else { update[field] = incoming; changed.push({ field, label: label(field), from: current || 'Missing', to: incoming }); }
  }
  return { changed, skipped, update };
}
function inferRole(title?: string, requested?: string) {
  if (requested && roleCategories.some(category => category === requested)) return requested;
  const t = title?.toLowerCase() ?? '';
  if (t.includes('principal')) return 'principal';
  if (t.includes('counselor')) return 'counselor';
  if (t.includes('athletic') || t.includes('activities')) return 'office';
  return 'unknown';
}
function dbReason(error: any) {
  const msg = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (/column .* does not exist|schema cache|Could not find .* column/i.test(msg)) return { reason: `Database schema is missing a required column: ${msg}`, suggested_fix: 'Run the latest additive Supabase schema migration and retry the import.' };
  return { reason: `Database write failed: ${msg || 'Unknown Supabase error.'}`, suggested_fix: 'Check the technical details, correct the item or database schema, and retry.' };
}
async function applyDb<T>(promise: PromiseLike<{ data: T | null; error: any }>) {
  const response = await promise;
  if (response.error) throw response.error;
  return response.data;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request); if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const db = createServiceClient(); const summary = result(); let raw: unknown;
  try { raw = await request.json(); } catch (error) { return NextResponse.json({ ...summary, ok: false, failed: [{ type: 'import', reason: error instanceof Error ? error.message : 'Invalid JSON import payload.' }] }, { status: 400 }); }
  let items: JsonImportItem[];
  try { items = normalizeImport(raw); } catch (error) { return NextResponse.json({ ...summary, ok: false, failed: [{ type: 'import', reason: error instanceof Error ? error.message : 'Invalid JSON import payload.' }] }, { status: 400 }); }

  for (const item of items) {
    const school = await findSchool(db, item); const district = await findDistrict(db, item, school); const contactName = str(item.contact_name) ?? str(item.name);
    const base = { type: item.type, target_name: str(item.school_name) ?? str(item.district_name) ?? contactName ?? str(item.title), school: str(school?.name) ?? str(item.school_name), district: str(district?.name) ?? str(item.district_name), source_url: item.source_url };
    try {
      const typeInfo = supportedType(item.type);
      if (!typeInfo) { summary.skipped.push({ ...base, reason: 'Skipped because unsupported item type.', suggested_fix: 'Use one of the supported item types shown in the AI Assisted Update page.' } as any); continue; }
      if (!typeInfo.importable) { summary.warnings.push({ ...base, reason: 'This item type is recognized but not importable yet.' }); summary.skipped.push({ ...base, reason: 'Recognized but not importable yet.' }); continue; }
      if (item.type === 'school_update') {
        if (!school) { summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name) ?? 'missing school_name'}`, suggested_fix: 'Check the school name or include school_id.' } as any); continue; }
        const c = changesFor(item, school, schoolFields);
        if (Object.keys(c.update).length) { await applyDb(db.from('schools').update({ ...c.update, updated_at: new Date().toISOString() }).eq('id', school.id)); const row={...base, record_id: school.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); addId(summary, school.id); } else summary.unchanged.push({ ...base, record_id: school.id, fields_skipped: c.skipped, reason: 'No school fields changed.' });
      } else if (item.type === 'district_update') {
        if (!district) { summary.failed.push({ ...base, reason: `District not found: ${str(item.district_name) ?? 'missing district_name'}` }); continue; }
        const c = changesFor(item, district, districtFields);
        if (Object.keys(c.update).length) { await applyDb(db.from('districts').update({ ...c.update, updated_at: new Date().toISOString() }).eq('id', district.id)); const row={...base, record_id: district.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); addId(summary, district.id); } else summary.unchanged.push({ ...base, record_id: district.id, fields_skipped: c.skipped, reason: 'No district fields changed.' });
      } else if (item.type === 'contact_create' || item.type === 'contact_update') {
        const title = str(item.title); if (!contactName && !title) { summary.failed.push({ ...base, reason: 'Contact needs at least name/contact_name or title.' }); continue; }
        if (str(item.school_name) && !school) { summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name)}`, suggested_fix: 'Check school_name or import the school before creating this contact.' } as any); continue; }
        const email = str(item.email), phone = str(item.phone), role = inferRole(title, str(item.role_category));
        const { data: candidates } = await db.from('contacts').select('*').eq('school_id', school?.id ?? '').ilike('name', contactName ?? '').ilike('title', title ?? '');
        const existing = (candidates ?? []).find((c: any) => normalize(c.name) === normalize(contactName) && normalize(c.title) === normalize(title) && (!phone || !c.phone || normalize(c.phone) === normalize(phone)) && (!email || !c.email || normalize(c.email) === normalize(email))) as DbRow | undefined;
        const payload = { school_id: school?.id, district_id: district?.id ?? school?.district_id, name: contactName, title, email, phone, role_category: role, program_area: role, source_url: str(item.source_url), source_notes: str(item.source_notes), confidence_score: email ? (str(item.confidence) ?? 'medium') : 'low', extraction_notes: 'manual_json_import', imported_by_email: admin.email, imported_at: new Date().toISOString() };
        if (existing && !item.overwrite) { summary.unchanged.push({ ...base, record_id: existing.id, reason: 'Duplicate contact skipped because overwrite=false.', fields_skipped: [{ field:'contact', label:'Contact', to:[contactName,title,email,phone].filter(Boolean).join(' · ') }] }); continue; }
        if (existing) { const c = changesFor(payload as any, existing, Object.keys(payload)); if (Object.keys(c.update).length) { const data = await applyDb(db.from('contacts').update(c.update).eq('id', existing.id).select('id').single()); const row={...base, record_id:(data as any)?.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); addId(summary, (data as any)?.id); } else summary.unchanged.push({ ...base, record_id: existing.id, reason: 'Duplicate contact already has the supplied fields.', fields_skipped: c.skipped }); }
        else { const data = await applyDb(db.from('contacts').insert(payload).select('id').single()); const row={...base, record_id:(data as any)?.id, fields_changed:[{field:'contact',label:'Contact',to:[contactName,title,email || '(no email)',phone].filter(Boolean).join(' · ')}]}; summary.created.push(row); summary.applied.push(row); addId(summary, (data as any)?.id); }
      } else {
        summary.skipped.push({ ...base, reason: `${item.type} is previewable but this importer does not yet have an apply handler.`, suggested_fix: 'Use a supported update/create handler or ask Aaron to add an apply handler for this item type.' } as any);
      }
    } catch (error: any) {
      summary.failed.push({ ...base, ...dbReason(error), database_error: error });
    }
  }
  summary.ok = summary.failed.length === 0;
  try { await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary, status: summary.ok ? 'imported' : 'failed' }); } catch { /* do not mask item-level import results */ }
  return NextResponse.json(summary);
}
