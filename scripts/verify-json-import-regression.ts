import { readFileSync } from 'fs';
import { normalizeImport } from '../lib/json-import';
import { requiredSchoolCreateMissing, schoolCreatePayload } from '../lib/school-create';
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
