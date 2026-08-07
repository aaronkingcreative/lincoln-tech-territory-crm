import { readFileSync } from 'fs';
import { normalizeImport, validationMessagesForItem } from '../lib/json-import';
import { DISTRICT_VERIFICATION_NOTE, placeholderDistrictName, requiredSchoolCreateMissing, schoolCreatePayload } from '../lib/school-create';
import { readImportApiResponse } from '../lib/json-import-client';
import { resolveSchoolMatchFromCandidates } from '../lib/school-matching';
import { DbRow } from '../lib/coverage';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}


function school(name: string, extra: Partial<DbRow> & { districts?: { name?: string } } = {}): DbRow & { districts?: { name?: string } } {
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, ...extra };
}

function assertMatchedAlias(incoming: string, existing: string, item: Record<string, unknown>) {
  const result = resolveSchoolMatchFromCandidates({ type: 'school_update', school_name: incoming, ...item }, [school(existing, item)]);
  assert(result.status === 'matched', `${incoming} should match ${existing}.`);
  if (result.status === 'matched') {
    assert(result.match.matchedName === existing, `${incoming} should target existing CRM row ${existing}.`);
    assert(result.match.warnings.some(warning => warning.includes('Alias matched')), `${incoming} should produce an alias warning.`);
  }
}

async function main() {
  const raw = JSON.parse(readFileSync('fixtures/jefferson-create-if-missing.json', 'utf8'));
  const items = normalizeImport(raw);
  assert(items.length === 1, 'Jefferson fixture should normalize to one item.');
  const item = items[0];
  assert(item.type === 'school_update', 'Jefferson fixture should use school_update.');
  assert(item.create_if_missing === true, 'Jefferson fixture should set create_if_missing true.');
  assert(requiredSchoolCreateMissing(item).length === 0, 'Jefferson fixture should have all required create fields.');
  const payload = schoolCreatePayload(item, 'district-preview', 'run-preview');
  for (const field of ['name', 'district_id', 'county', 'state', 'city', 'phone', 'fax', 'website', 'address', 'source_url', 'source_notes', 'verification_status']) {
    assert(payload[field] !== undefined, `Create payload should include ${field}.`);
  }
  assert(payload.verification_status === 'unverified', 'Create payload should mark the school unverified by default.');

  const officialImport = { type: 'school_update', school_name: 'Official High School', city: 'Boise', county: 'Ada', state: 'ID', source_notes: 'Official Lincoln Tech spreadsheet row.', create_if_missing: true };
  assert(requiredSchoolCreateMissing(officialImport).length === 0, 'A missing district should not block an official import with school/city/county/state.');
  assert(placeholderDistrictName('Ada', 'id') === 'District To Verify - Ada County, ID', 'Placeholder district should include normalized county and state.');
  assert(placeholderDistrictName('Ada County', 'ID') === placeholderDistrictName('Ada', 'ID'), 'Repeated county imports should resolve to the same placeholder district name.');
  const officialPayload = schoolCreatePayload(officialImport, 'ada-placeholder', 'official-run');
  assert(officialPayload.needs_verification === true, 'A school without a supplied district should need verification.');
  assert(officialPayload.verification_status === 'needs_review', 'A school without a supplied district should have needs_review status.');
  assert(String(officialPayload.verification_notes).includes(DISTRICT_VERIFICATION_NOTE), 'Verification notes should explain that the official source omitted the district.');
  assert(officialPayload.source_notes === officialImport.source_notes, 'Incoming source notes should be preserved separately.');

  const realDistrictImport = { ...officialImport, district_name: 'Boise School District' };
  const realDistrictPayload = schoolCreatePayload(realDistrictImport, 'real-district', 'official-run');
  assert(realDistrictPayload.needs_verification === undefined, 'A supplied real district should not set the placeholder verification flag.');
  assert(realDistrictPayload.district_id === 'real-district', 'A supplied real district should remain linked by its resolved id.');
  assert(requiredSchoolCreateMissing({ ...officialImport, school_name: '' }).includes('school_name'), 'Missing school_name should still block creation.');
  for (const field of ['city', 'county', 'state']) {
    assert(requiredSchoolCreateMissing({ ...officialImport, [field]: '' }).includes(field), `Missing ${field} without a district should block creation.`);
  }

  const slashVisit = normalizeImport([{ type: 'school_update', school_name: 'Visit Test', hs_last_visit: '8/4/2026' }])[0];
  assert(slashVisit.last_high_school_visit_at === '2026-08-04', 'hs_last_visit should normalize M/D/YYYY dates.');
  const isoVisit = normalizeImport([{ type: 'school_update', school_name: 'Visit Test', last_high_school_visit_at: '2026-08-04' }])[0];
  assert(isoVisit.last_high_school_visit_at === '2026-08-04', 'last_high_school_visit_at should preserve valid ISO dates.');
  const notesVisit = normalizeImport([{ type: 'school_update', school_name: 'Visit Test', source_notes: 'Imported row. HS Last Visit: 8/4/2026' }])[0];
  assert(notesVisit.last_high_school_visit_at === '2026-08-04', 'source_notes HS Last Visit should populate the dedicated field.');
  const badVisit = normalizeImport([{ type: 'school_update', school_name: 'Visit Test', hs_last_visit: 'not a date' }])[0];
  assert(badVisit.last_high_school_visit_at === undefined, 'Invalid visit dates should not be written.');
  assert(validationMessagesForItem(badVisit).warnings.some(warning => warning.includes('could not be parsed')), 'Invalid visit dates should produce a warning.');



  assertMatchedAlias('Notus High School', 'Notus Jr/Sr High School', { district_name: 'Notus School District', city: 'Notus', state: 'ID', districts: { name: 'Notus School District' } });
  assertMatchedAlias('Wilder High School', 'Wilder Jr/Sr High School', { district_name: 'Wilder School District', city: 'Wilder', state: 'ID', districts: { name: 'Wilder School District' } });
  assertMatchedAlias('Rockland High School', 'Rockland Public School', { city: 'Rockland', state: 'ID' });
  assertMatchedAlias('Richard McKenna Charter School', 'Richard McKenna Charter High School', { city: 'Mountain Home', state: 'ID' });
  assertMatchedAlias('Nampa High School', 'Nampa Senior High School', { city: 'Nampa', state: 'ID' });
  assertMatchedAlias('Shelley High School', 'Shelley Senior High School', { city: 'Shelley', state: 'ID' });
  assertMatchedAlias('Clark County High School', 'Clark County Jr/Sr High School', { district_name: 'Clark County School District', city: 'Dubois', state: 'ID', districts: { name: 'Clark County School District' } });
  const fremont = resolveSchoolMatchFromCandidates(
    { type: 'school_update', school_name: 'Fremont High School', district_name: 'Fremont County Joint School District', state: 'ID' },
    [
      school('South Fremont High School', { state: 'ID', districts: { name: 'Fremont County Joint School District' } }),
      school('North Fremont High School', { state: 'ID', districts: { name: 'Fremont County Joint School District' } }),
    ],
  );
  assert(fremont.status === 'ambiguous', 'Fremont High School should be ambiguous when North and South Fremont both match context.');
  const missing = resolveSchoolMatchFromCandidates({ type: 'school_update', school_name: 'New Example High School', district_name: 'Example District', city: 'Example', county: 'Example', state: 'ID', create_if_missing: true }, [school('Existing Example High School', { city: 'Other', state: 'ID' })]);
  assert(missing.status === 'none', 'A genuinely missing school should not alias-match an unrelated existing school.');

  const empty = await readImportApiResponse(new Response('', { status: 500 }));
  assert(!empty.ok && empty.message.includes('empty response'), 'Frontend helper should explain empty API responses.');
  const html = await readImportApiResponse(new Response('<html>crashed</html>', { status: 500 }));
  assert(!html.ok && html.message.includes('non-JSON') && html.details?.includes('Status 500'), 'Frontend helper should explain non-JSON API responses with status.');
  const serverError = await readImportApiResponse(new Response(JSON.stringify({ ok: false, status: 'error', error: 'Importer server error', details: 'safe details' }), { status: 500 }));
  assert(!serverError.ok && serverError.message === 'Importer server error', 'Frontend helper should preserve server JSON errors.');
  const routeJson = await readImportApiResponse(new Response(JSON.stringify({ ok: false, status: 'failed', failed: [{ type: 'school_update', reason: 'Will create new school needing verification: Jefferson High School' }] }), { status: 422 }));
  assert(!routeJson.ok && routeJson.body !== undefined, 'Route-like non-200 JSON responses should still parse as JSON.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
