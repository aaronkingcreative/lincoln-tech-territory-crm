import { readFileSync } from 'fs';
import { normalizeImport } from '../lib/json-import';
import { requiredSchoolCreateMissing, schoolCreatePayload } from '../lib/school-create';
import { readImportApiResponse } from '../lib/json-import-client';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
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
