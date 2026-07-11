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

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request); if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const db = createServiceClient(); const summary = result(); let raw: unknown;
  try {
    raw = await request.json(); const items = normalizeImport(raw);
    for (const item of items) {
      const typeInfo = supportedType(item.type); const school = await findSchool(db, item); const district = await findDistrict(db, item, school); const base = { type: item.type, target_name: str(item.school_name) ?? str(item.district_name) ?? str(item.contact_name) ?? str(item.title), school: str(school?.name) ?? str(item.school_name), district: str(district?.name) ?? str(item.district_name), source_url: item.source_url };
      if (!typeInfo) { summary.skipped.push({ ...base, reason: 'Skipped because unsupported item type.' }); continue; }
      if (!typeInfo.importable) { summary.warnings.push({ ...base, reason: 'This item type is recognized but not importable yet.' }); summary.skipped.push({ ...base, reason: 'Recognized but not importable yet.' }); continue; }

      if (item.type === 'school_update') {
        if (!school) { summary.failed.push({ ...base, reason: 'Failed because school not found.' }); continue; }
        const c = changesFor(item, school, schoolFields);
        if (Object.keys(c.update).length) { const { error } = await db.from('schools').update({ ...c.update, updated_at: new Date().toISOString() }).eq('id', school.id); if (error) throw error; const row={...base, record_id: school.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); addId(summary, school.id); } else summary.unchanged.push({ ...base, record_id: school.id, fields_skipped: c.skipped, reason: 'No school fields changed.' });
      } else if (item.type === 'district_update') {
        if (!district) { summary.failed.push({ ...base, reason: 'Failed because district not found.' }); continue; }
        const c = changesFor(item, district, districtFields);
        if (Object.keys(c.update).length) { const { error } = await db.from('districts').update({ ...c.update, updated_at: new Date().toISOString() }).eq('id', district.id); if (error) throw error; const row={...base, record_id: district.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); addId(summary, district.id); } else summary.unchanged.push({ ...base, record_id: district.id, fields_skipped: c.skipped, reason: 'No district fields changed.' });
      } else if (item.type === 'school_note_create') {
        if (!school) { summary.failed.push({ ...base, reason: 'Failed because school not found.' }); continue; }
        const note = str(item.note) ?? str(item.notes); if (!note) { summary.failed.push({ ...base, reason: 'Failed because missing required note text.' }); continue; }
        let noteDupQuery = db.from('recruiting_notes').select('id').eq('school_id', school.id).eq('note', note);
        if (str(item.source_url)) noteDupQuery = noteDupQuery.eq('source_url', str(item.source_url)!);
        const dup = await noteDupQuery.maybeSingle();
        if (dup.data) { summary.skipped.push({ ...base, record_id: dup.data.id, reason: 'Skipped duplicate note.' }); continue; }
        const { data, error } = await db.from('recruiting_notes').insert({ school_id: school.id, district_id: school.district_id, note, note_type: str(item.note_type), source: 'manual_json_import', source_url: str(item.source_url) }).select('id').single(); if (error) throw error;
        const row={...base, record_id:data?.id, fields_changed:[{field:'note',label:'Note',to:note}]}; summary.created.push(row); summary.applied.push(row); addId(summary, data?.id);
      } else if (item.type === 'task_create' || item.type === 'follow_up_create') {
        const title = str(item.title) ?? str(item.notes) ?? 'Imported follow-up task';
        let taskDupQuery = db.from('recruiting_tasks').select('id').eq('title', title).neq('status','complete');
        if (school?.id) taskDupQuery = taskDupQuery.eq('school_id', school.id);
        if (str(item.source_url)) taskDupQuery = taskDupQuery.eq('source_url', str(item.source_url)!);
        const dup = await taskDupQuery.maybeSingle();
        if (dup.data) { summary.skipped.push({ ...base, record_id: dup.data.id, reason: 'Skipped duplicate task.' }); continue; }
        const { data, error } = await db.from('recruiting_tasks').insert({ title, description: str(item.description), task_scope: school ? 'school' : district ? 'district' : 'global', school_id: school?.id, district_id: district?.id, status: str(item.status) ?? 'not_started', priority: str(item.priority) ?? 'medium', due_date: str(item.due_date), created_by_email: admin.email, notes: str(item.notes), source_url: str(item.source_url) }).select('id').single(); if (error) throw error;
        const row={...base, record_id:data?.id, fields_changed:[{field:'title',label:'Title',to:title}]}; summary.created.push(row); summary.applied.push(row); addId(summary, data?.id);
      } else if (item.type === 'contact_create' || item.type === 'contact_update') {
        const name = str(item.contact_name) ?? str(item.name), title = str(item.title); if (!name && !title) { summary.failed.push({ ...base, reason: 'Failed because contact needs at least contact_name or title.' }); continue; }
        const contactEmail = str(item.email);
        const contactPhone = str(item.phone);
        const contactTitle = title;
        const contactName = name;
        const requestedRole = str(item.role_category);
        const role = requestedRole && roleCategories.some(category => category === requestedRole) ? requestedRole : 'unknown';
        const confidence = contactEmail ? (str(item.confidence) ?? 'medium') : 'low';
        const contactFilters = [contactName ? `name.ilike.${contactName}` : '', contactEmail ? `email.eq.${contactEmail}` : ''].filter(Boolean);
        const existing = item.type === 'contact_update' && contactFilters.length ? (await db.from('contacts').select('*').or(contactFilters.join(',')).maybeSingle()).data as DbRow | null : null;
        const payload = { school_id: school?.id, district_id: district?.id ?? school?.district_id, name: contactName, title: contactTitle, email: contactEmail, phone: contactPhone, program_area: role, source_url: str(item.source_url), source_notes: str(item.source_notes), confidence_score: confidence, extraction_notes: 'manual_json_import', imported_by_email: admin.email, imported_at: new Date().toISOString() };
        const q = existing ? await db.from('contacts').update(payload).eq('id', existing.id).select('id').single() : await db.from('contacts').insert(payload).select('id').single(); if (q.error) throw q.error;
        const row={...base, record_id:q.data?.id, fields_changed:[{field:'contact',label:'Contact',to:[contactName,contactTitle,contactEmail].filter(Boolean).join(' · ')}]}; (existing ? summary.updated : summary.created).push(row); summary.applied.push(row); addId(summary, q.data?.id);
      } else if (item.type === 'contact_log_create') {
        if (!school && !district) { summary.failed.push({ ...base, reason: 'Failed because school or district not found.' }); continue; }
        const { data, error } = await db.from('contact_logs').insert({ school_id: school?.id, district_id: district?.id ?? school?.district_id, contacted_by_email: admin.email, contact_method: str(item.contact_method) ?? 'other', outcome: str(item.outcome) ?? 'other', notes: str(item.notes), contacted_at: str(item.contacted_at) ?? new Date().toISOString() }).select('id').single(); if (error) throw error; const row={...base, record_id:data?.id}; summary.created.push(row); summary.applied.push(row); addId(summary, data?.id);
      } else if (item.type === 'school_program_update') {
        if (!school) { summary.failed.push({ ...base, reason: 'Failed because school not found.' }); continue; }
        const c = changesFor(item, school, ['special_programs','program_notes','source_url']); if (Object.keys(c.update).length) { const { error } = await db.from('schools').update(c.update).eq('id', school.id); if (error) throw error; const row={...base, record_id:school.id, fields_changed:c.changed, fields_skipped:c.skipped}; summary.updated.push(row); summary.applied.push(row); } else summary.unchanged.push({ ...base, reason:'No program fields changed.', fields_skipped:c.skipped });
      } else if (item.type === 'source_url_create') {
        const url = str(item.url) ?? str(item.source_url); if (!url) { summary.failed.push({ ...base, reason:'Failed because source URL was blank.' }); continue; }
        const { data, error } = await db.from('source_urls').insert({ school_id: school?.id, district_id: district?.id, url, page_title: str(item.page_title), is_official: item.is_official !== false }).select('id').single(); if (error) throw error; const row={...base, record_id:data?.id, fields_changed:[{field:'url',label:'URL',to:url}]}; summary.created.push(row); summary.applied.push(row); addId(summary, data?.id);
      }
    }
    summary.ok = summary.failed.length === 0;
    await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary, status: summary.ok ? 'imported' : 'failed' });
    return NextResponse.json(summary);
  } catch (error) {
    const fail = { ...summary, ok: false, failed: [...summary.failed, { type: 'import', reason: error instanceof Error ? error.message : 'Invalid JSON import payload.' }] };
    if (raw) await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary: fail, status: 'failed' });
    return NextResponse.json(fail, { status: 400 });
  }
}
