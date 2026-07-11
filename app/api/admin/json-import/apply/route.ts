import { createHash } from 'crypto';

import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { DbRow } from '@/lib/coverage';
import { ImportFieldChange, ImportResultGroups, JsonImportItem, normalizeImport, roleCategories, supportedType } from '@/lib/json-import';
import { createServiceClient, hasSupabaseServiceCredentials } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Verification = {
  schools_verified: { school: string; record_id: string; verified_fields: string[] }[];
  contacts_verified: { contact: string; school?: string; record_id: string }[];
  failed: { target: string; record_id?: string; failures: string[] }[];
};

const schoolFields = ['phone','website','address','city','state','zip','fax','source_url','source_notes','special_programs','program_notes','cte_programs','shop_programs','trades_programs','career_programs','school_profile_notes','bell_schedule','bell_schedule_url','student_population_total','grade_enrollment','enrollment_source_url','enrollment_notes','school_type','territory_status'] as const;
const districtFields = ['phone','website','office_address','city','state','zip','superintendent','cte_director','source_url'] as const;
const result = (): ImportResultGroups & { status?: string; run_id?: string; verification: Verification } => ({ applied: [], updated: [], created: [], skipped: [], unchanged: [], failed: [], warnings: [], affected_record_ids: [], verification: { schools_verified: [], contacts_verified: [], failed: [] } });
const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const label = (f: string) => f.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const normalize = (v?: string) => v?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const addId = (r: ImportResultGroups, id?: unknown) => { if (typeof id === 'string' && !r.affected_record_ids?.includes(id)) r.affected_record_ids?.push(id); };
const log = (runId: string | undefined, event: string, details: Record<string, unknown>) => console.log(JSON.stringify({ scope: 'ai_update_apply', run_id: runId, event, ...details }));

function sameValue(a: unknown, b: unknown) { return String(a ?? '').trim() === String(b ?? '').trim(); }
function changesFor(item: Record<string, unknown> & { overwrite?: boolean }, existing: DbRow, fields: readonly string[]) {
  const changed: ImportFieldChange[] = [], skipped: ImportFieldChange[] = [], update: Record<string, unknown> = {};
  for (const field of fields) {
    const incoming = field === 'office_address' ? (item.office_address ?? item.address) : item[field];
    if (!present(incoming)) { if (field in item) skipped.push({ field, label: label(field), reason: 'Skipped because value was blank.' }); continue; }
    const current = existing[field];
    if (sameValue(current, incoming)) skipped.push({ field, label: label(field), from: current, to: incoming, reason: 'Unchanged because value already matched.' });
    else if (!item.overwrite && present(current)) skipped.push({ field, label: label(field), from: current, to: incoming, reason: 'Preserved existing nonblank value because overwrite=false.' });
    else { update[field] = incoming; changed.push({ field, label: label(field), from: present(current) ? current : 'Missing', to: incoming }); }
  }
  return { changed, skipped, update };
}
function verifyFields(row: DbRow | null | undefined, changed: { field: string; to?: unknown }[]) {
  if (!row) return ['No database row was returned after the write.'];
  return changed.filter(change => !sameValue(row[change.field], change.to)).map(change => `${label(change.field)} did not persist. Expected ${String(change.to ?? '')}, found ${String(row[change.field] ?? 'Missing')}.`);
}
async function findSchool(db: ReturnType<typeof createServiceClient>, item: JsonImportItem) {
  const id = str(item.school_id); if (id) return (await db.from('schools').select('*').eq('id', id).maybeSingle()).data as DbRow | null;
  const name = str(item.school_name); if (!name) return null;
  const exact = (await db.from('schools').select('*').ilike('name', name).maybeSingle()).data as DbRow | null;
  if (exact) return exact;
  const { data } = await db.from('schools').select('*');
  return ((data ?? []) as DbRow[]).find(s => normalize(str(s.name)) === normalize(name)) ?? null;
}
async function findDistrict(db: ReturnType<typeof createServiceClient>, item: JsonImportItem, school?: DbRow | null) {
  const id = str(item.district_id) ?? str(school?.district_id); if (id) return (await db.from('districts').select('*').eq('id', id).maybeSingle()).data as DbRow | null;
  const name = str(item.district_name); if (name) return (await db.from('districts').select('*').ilike('name', name).maybeSingle()).data as DbRow | null;
  return null;
}

function confidenceScore(item: JsonImportItem) {
  const raw = item.confidence_score ?? item.confidence;
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric >= 0.75 ? 'high' : numeric >= 0.4 ? 'medium' : 'low';
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >= 0.75 ? 'high' : raw >= 0.4 ? 'medium' : 'low';
  return str(item.source_url) || str(item.source_notes) ? 'medium' : 'low';
}

function inferRole(title?: string, requested?: string) {
  if (requested && roleCategories.some(category => category === requested)) return requested;
  const t = title?.toLowerCase() ?? '';
  if (t.includes('principal')) return 'principal';
  if (t.includes('counselor')) return 'counselor';
  if (t.includes('athletic') || t.includes('activities')) return 'office';
  return 'unknown';
}
function dbReason(error: unknown) {
  const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' ');
  return { reason: `Database write failed: ${msg || 'Unknown Supabase error.'}`, suggested_fix: /column .* does not exist|schema cache|Could not find .* column/i.test(msg) ? 'Run the latest additive Supabase schema migration and retry the import.' : 'Check the technical details, correct the item or database schema, and retry.', database_error: { message: e.message, details: e.details, hint: e.hint, code: e.code } };
}
async function applyDb<T>(promise: PromiseLike<{ data: T | null; error: unknown }>) { const response = await promise; if (response.error) throw response.error; return response.data; }

async function verifyApplySchema(db: ReturnType<typeof createServiceClient>): Promise<{ ok: true } | { ok: false; table: string; reason: string }> {
  const checks = [
    { table: 'schools', columns: ['address','phone','website','special_programs','program_notes','cte_programs','shop_programs','trades_programs','career_programs','school_profile_notes','bell_schedule','bell_schedule_url','student_population_total','grade_enrollment','enrollment_source_url','enrollment_notes','source_url','source_notes','updated_at','last_ai_update_at','last_ai_update_run_id','city','state','zip','fax','school_type','territory_status'] },
    { table: 'contacts', columns: ['school_id','district_id','name','title','email','phone','role_category','source_url','source_notes','imported_by_email','imported_at','updated_at','program_area','confidence_score','extraction_notes'] },
    { table: 'ai_update_runs', columns: ['id','imported_by_email','status','started_at','finished_at','item_count','created_count','updated_count','skipped_count','failed_count','input_hash','original_payload','normalized_payload','result_summary','affected_record_ids'] },
  ];
  for (const check of checks) {
    const { error } = await db.from(check.table).select(check.columns.join(',')).limit(0);
    if (error) return { ok: false, table: check.table, reason: error.message };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request); if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  if (!hasSupabaseServiceCredentials()) return NextResponse.json({ ...result(), ok: false, status: 'failed', failed: [{ type: 'service_role_check', reason: 'Admin apply route is missing server-side Supabase service role credentials.' }] }, { status: 500 });
  const db = createServiceClient(); const summary = result(); let raw: unknown; let items: JsonImportItem[];
  try { raw = await request.json(); items = normalizeImport(raw); } catch (error) { return NextResponse.json({ ...summary, ok: false, status: 'failed', failed: [{ type: 'import', reason: error instanceof Error ? error.message : 'Invalid JSON import payload.' }] }, { status: 400 }); }

  const originalPayload = raw;
  const normalizedPayload = { items };
  const inputHash = createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex');
  const commitMode = request.headers.get('x-ai-update-commit-mode') ?? 'commit';
  const contactCreateCount = items.filter(item => item.type === 'contact_create').length;
  log(summary.run_id, 'request_received', { commit_mode: commitMode, input_hash: inputHash, retry_mode: commitMode.includes('retry'), item_count_sent_to_apply: items.length, contact_create_count_sent_to_apply: contactCreateCount });

  const schemaCheck = await verifyApplySchema(db);
  if (!schemaCheck.ok) {
    summary.ok = false;
    summary.status = 'failed';
    summary.failed.push({ type: 'schema_check', target_name: schemaCheck.table, reason: `Required AI Assisted Update schema is missing or incompatible for ${schemaCheck.table}: ${schemaCheck.reason}`, suggested_fix: 'Run the latest additive Supabase schema.sql migration, then retry the import.' });
    log(summary.run_id, 'schema_check_failed', { table: schemaCheck.table, reason: schemaCheck.reason });
    return NextResponse.json(summary, { status: 422 });
  }

  const { data: run, error: runError } = await db.from('ai_update_runs').insert({ imported_by_email: admin.email, status: 'running', item_count: items.length, input_hash: inputHash, original_payload: originalPayload, normalized_payload: normalizedPayload }).select('id').maybeSingle();
  if (runError || !run?.id) {
    const reason = runError ? dbReason(runError).reason : 'AI update audit run was not created.';
    log(undefined, 'audit_run_create_failed', { reason });
    return NextResponse.json({ ...summary, ok: false, status: 'failed', failed: [{ type: 'ai_update_runs', reason, suggested_fix: 'Check ai_update_runs schema and service-role write permissions before retrying.' }] }, { status: 500 });
  }
  summary.run_id = str(run.id);
  log(summary.run_id, 'started', { commit_mode: commitMode, input_hash: inputHash, retry_mode: commitMode.includes('retry'), item_count: items.length, contact_create_count: contactCreateCount, uses_service_role_client: true, new_run_id: summary.run_id });

  for (const [index, item] of items.entries()) {
    const school = await findSchool(db, item); const district = await findDistrict(db, item, school); const contactName = str(item.contact_name) ?? str(item.name);
    const base = { item_index: index, type: item.type, target_name: str(item.school_name) ?? str(item.district_name) ?? contactName ?? str(item.title), school: str(school?.name) ?? str(item.school_name), district: str(district?.name) ?? str(item.district_name), source_url: item.source_url };
    log(summary.run_id, 'item', { item_index: index, item_type: item.type, target_school: str(item.school_name), matched_school_id: school?.id });
    try {
      const typeInfo = supportedType(item.type);
      if (!typeInfo) { summary.skipped.push({ ...base, reason: 'Skipped because unsupported item type.', suggested_fix: 'Use one of the supported item types shown in the AI Assisted Update page.' }); continue; }
      if (!typeInfo.importable) { summary.warnings.push({ ...base, reason: 'This item type is recognized but not importable yet.' }); summary.skipped.push({ ...base, reason: 'Recognized but not importable yet.' }); continue; }
      if (item.type === 'school_update') {
        if (!school) { summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name) ?? 'missing school_name'}`, suggested_fix: 'Check the school name or include school_id.' }); continue; }
        const c = changesFor(item, school, schoolFields);
        if (Object.keys(c.update).length) {
          const updateObject = { ...c.update, updated_at: new Date().toISOString(), last_ai_update_at: new Date().toISOString(), last_ai_update_run_id: summary.run_id };
          log(summary.run_id, 'write_school', { item_index: index, item_type: item.type, school_name: school.name, matched_school_id: school.id, update_object: updateObject });
          const updateResponse = await db.from('schools').update(updateObject).eq('id', school.id).select('*').maybeSingle();
          log(summary.run_id, 'write_school_response', { item_index: index, item_type: item.type, school_name: school.name, matched_school_id: school.id, supabase_error: updateResponse.error, returned_updated_row: updateResponse.data });
          if (updateResponse.error) throw updateResponse.error;
          if (!updateResponse.data) throw new Error('Supabase update returned no row for public.schools; update may have matched zero rows or select permission failed.');
          const immediateFailures = verifyFields(updateResponse.data as DbRow, c.changed);
          if (immediateFailures.length) throw new Error(`Supabase returned row did not contain requested changes: ${immediateFailures.join(' ')}`);
          const rereadResponse = await db.from('schools').select('*').eq('id', school.id).maybeSingle();
          log(summary.run_id, 'reread_school_response', { item_index: index, item_type: item.type, school_name: school.name, matched_school_id: school.id, supabase_error: rereadResponse.error, returned_updated_row: rereadResponse.data });
          if (rereadResponse.error) throw rereadResponse.error;
          const reread = rereadResponse.data as DbRow | null;
          const failures = verifyFields(reread, c.changed);
          log(summary.run_id, 'verify_school', { item_index: index, item_type: item.type, school_name: school.name, matched_school_id: school.id, update_object: updateObject, verification_result: { ok: failures.length === 0, failures } });
          if (failures.length) { summary.verification.failed.push({ target: school.name, record_id: school.id, failures }); summary.failed.push({ ...base, record_id: school.id, fields_changed:c.changed, fields_skipped:c.skipped, reason: failures.join(' '), suggested_fix: 'Check database triggers, column names, and row-level permissions, then retry.' }); }
          else { const row={...base, record_id: school.id, school_record_id: school.id, fields_changed:c.changed, fields_skipped:c.skipped, message:'Verified database values after update.'}; summary.updated.push(row); summary.applied.push(row); summary.verification.schools_verified.push({ school: str(reread?.name) ?? school.name, record_id: school.id, verified_fields: c.changed.map(f => f.field) }); addId(summary, school.id); }
        } else summary.unchanged.push({ ...base, record_id: school.id, school_record_id: school.id, fields_skipped: c.skipped, reason: 'No school fields changed because supplied values were already present, blank, or intentionally preserved.' });
      } else if (item.type === 'contact_create' || item.type === 'contact_update') {
        const title = str(item.title); if (!contactName && !title) { summary.failed.push({ ...base, reason: 'Contact needs at least name/contact_name or title.' }); continue; }
        if (str(item.school_name) && !school) { summary.failed.push({ ...base, reason: `School not found: ${str(item.school_name)}`, suggested_fix: 'Check school_name or import the school before creating this contact.' }); continue; }
        const email = str(item.email), phone = str(item.phone), role = inferRole(title, str(item.role_category));
        const { data: candidates } = await db.from('contacts').select('*').eq('school_id', school?.id ?? '').ilike('name', contactName ?? '').ilike('title', title ?? '');
        const existing = ((candidates ?? []) as DbRow[]).find(c => normalize(str(c.name)) === normalize(contactName) && normalize(str(c.title)) === normalize(title));
        const payload = { school_id: school?.id, district_id: district?.id ?? school?.district_id, name: contactName, title, email, phone, role_category: role, program_area: role, source_url: str(item.source_url), source_notes: str(item.source_notes), confidence_score: confidenceScore(item), extraction_notes: 'manual_json_import', imported_by_email: admin.email, imported_at: new Date().toISOString() };
        log(summary.run_id, 'contact_payload_normalized', { item_index: index, contact: contactName, raw_confidence_score: item.confidence_score, raw_confidence: item.confidence, confidence_score: payload.confidence_score });
        if (existing) {
          const c = changesFor({ ...payload, overwrite: true }, existing, Object.keys(payload));
          if (Object.keys(c.update).length) { await applyDb<DbRow>(db.from('contacts').update(c.update).eq('id', existing.id).select('id').single()); const reread = await applyDb<DbRow>(db.from('contacts').select('*').eq('id', existing.id).single()); const failures = verifyFields(reread, c.changed); if (failures.length) { summary.verification.failed.push({ target: contactName ?? title ?? 'contact', record_id: existing.id, failures }); summary.failed.push({ ...base, record_id: existing.id, school_record_id: school?.id, fields_changed:c.changed, fields_skipped:c.skipped, reason: failures.join(' ') }); } else { const row={...base, record_id:existing.id, school_record_id: school?.id, fields_changed:c.changed, fields_skipped:c.skipped, message:'Verified contact after update.'}; summary.updated.push(row); summary.applied.push(row); summary.verification.contacts_verified.push({ contact: contactName ?? title ?? 'contact', school: school?.name, record_id: existing.id }); addId(summary, school?.id ?? existing.id); } }
          else { summary.unchanged.push({ ...base, record_id: existing.id, school_record_id: school?.id, reason: 'Duplicate contact already has the supplied fields.', fields_skipped: c.skipped }); if (school?.id) addId(summary, school.id); }
        } else {
          log(summary.run_id, 'insert_contact', { school_id: school?.id, contact: contactName, title, confidence_score: payload.confidence_score });
          const data = await applyDb<DbRow>(db.from('contacts').insert(payload).select('*').single());
          if (!data?.id) {
            summary.failed.push({ ...base, school_record_id: school?.id, reason: 'Contact insert/update did not return a record id.', suggested_fix: 'Check Supabase insert/select permissions and contacts table schema.' });
            continue;
          }
          const contactRecordId = data.id;
          const reread = await applyDb<DbRow>(db.from('contacts').select('*').eq('id', contactRecordId).single());
          const failures = verifyFields(reread, [{ field:'school_id', to: school?.id }, { field:'name', to: contactName }, { field:'title', to: title }].filter(f => present(f.to)));
          if (failures.length) { summary.verification.failed.push({ target: contactName ?? title ?? 'contact', record_id: contactRecordId, failures }); summary.failed.push({ ...base, record_id:contactRecordId, school_record_id: school?.id, reason: failures.join(' ') }); }
          else { const row={...base, record_id:contactRecordId, school_record_id: school?.id, fields_changed:[{field:'contact',label:'Contact',to:[contactName,title,email || '(no email)',phone].filter(Boolean).join(' · ')},{field:'school_id',label:'Linked school',to:school?.name ?? school?.id}], message:'Verified contact was created and linked to the school.'}; summary.created.push(row); summary.applied.push(row); summary.verification.contacts_verified.push({ contact: contactName ?? title ?? 'contact', school: school?.name, record_id: contactRecordId }); addId(summary, school?.id ?? contactRecordId); }
        }
      } else if (item.type === 'district_update') {
        if (!district) { summary.failed.push({ ...base, reason: `District not found: ${str(item.district_name) ?? 'missing district_name'}` }); continue; }
        const c = changesFor(item, district, districtFields); if (Object.keys(c.update).length) { const updated = await applyDb<DbRow>(db.from('districts').update({ ...c.update, updated_at: new Date().toISOString() }).eq('id', district.id).select('*').maybeSingle()); const failures = verifyFields(updated, c.changed); if (failures.length) summary.failed.push({ ...base, record_id: district.id, fields_changed:c.changed, fields_skipped:c.skipped, reason: failures.join(' ') }); else { const row={...base, record_id: district.id, fields_changed:c.changed, fields_skipped:c.skipped, message:'Verified database values after update.'}; summary.updated.push(row); summary.applied.push(row); addId(summary, district.id); } } else summary.unchanged.push({ ...base, record_id: district.id, fields_skipped: c.skipped, reason: 'No district fields changed because supplied values were already present, blank, or intentionally preserved.' });
      } else summary.skipped.push({ ...base, reason: `${item.type} is previewable but this importer does not yet have an apply handler.`, suggested_fix: 'Use a supported update/create handler or ask Aaron to add an apply handler for this item type.' });
    } catch (error: unknown) {
      const reason = dbReason(error);
      const rawMessage = String((error as { message?: unknown })?.message ?? reason.reason);
      const receivedConfidence = item.confidence_score ?? item.confidence;
      const contactConfidenceFailure = item.type.startsWith('contact') && /contacts_confidence_score_check|confidence_score/i.test(rawMessage);
      log(summary.run_id, 'error', { item_index: index, item_type: item.type, error: reason.reason });
      summary.failed.push({
        ...base,
        ...reason,
        reason: contactConfidenceFailure ? `Contact import failed: ${contactName ?? base.target_name ?? 'Contact'} failed because confidence_score was invalid. Expected: high, medium, or low. Received: ${String(receivedConfidence ?? 'blank')}.` : reason.reason,
        suggested_fix: contactConfidenceFailure ? 'Use confidence_score high, medium, or low; numeric confidence values are normalized before insert and should not be written to public.contacts.' : reason.suggested_fix,
        database_error: reason.database_error ?? { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  summary.ok = summary.failed.length === 0;
  summary.status = summary.failed.length ? (summary.applied.length || summary.created.length || summary.updated.length ? 'partial_success' : 'failed') : 'success';
  const counts = { created_count: summary.created.length, updated_count: summary.updated.length, skipped_count: summary.skipped.length + summary.unchanged.length, failed_count: summary.failed.length };
  const auditResponse = await db.from('ai_update_runs').update({ status: summary.status, finished_at: new Date().toISOString(), ...counts, result_summary: summary, affected_record_ids: summary.affected_record_ids }).eq('id', summary.run_id).select('id,status,item_count,created_count,updated_count,failed_count,affected_record_ids').maybeSingle();
  log(summary.run_id, 'audit_run_update_response', { supabase_error: auditResponse.error, returned_updated_row: auditResponse.data });
  if (auditResponse.error || !auditResponse.data) {
    const reason = auditResponse.error ? dbReason(auditResponse.error).reason : 'AI update audit run finalization returned no row.';
    summary.ok = false;
    summary.status = summary.applied.length || summary.created.length || summary.updated.length ? 'partial_success' : 'failed';
    summary.failed.push({ type: 'ai_update_runs', reason, suggested_fix: 'Check ai_update_runs schema and service-role write permissions; database changes were not reported as a green commit because audit finalization failed.' });
  }
  try { await db.from('json_imports').insert({ imported_by_email: admin.email, import_type: 'manual_json_import', raw_json: raw, summary, status: summary.ok ? 'imported' : 'failed' }); } catch { /* legacy audit best effort */ }
  for (const path of ['/schools','/contacts','/coverage','/export','/admin/json-import']) revalidatePath(path);
  for (const id of summary.affected_record_ids ?? []) revalidatePath(`/schools/${id}`);
  log(summary.run_id, 'finished', { status: summary.status, new_run_id: summary.run_id, created_contacts_count: summary.created.filter(item => String(item.type).startsWith('contact')).length, failed_contacts_count: summary.failed.filter(item => String(item.type).startsWith('contact')).length, ...counts });
  return NextResponse.json(summary, { status: summary.status === 'failed' ? 422 : 200 });
}
