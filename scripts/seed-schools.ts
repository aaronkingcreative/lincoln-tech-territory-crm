import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createServiceClient } from '../lib/supabase';

type CsvRow = Record<string, string>;

type ImportSummary = {
  file: string;
  rows: number;
  districts: { inserted: number; updated: number; skipped: number };
  schools: { inserted: number; updated: number; skipped: number; missingRequiredData: number };
  sourceUrls: { inserted: number; updated: number; skipped: number };
  errors: string[];
};

const DEFAULT_FILE = 'data/territory-schools.csv';
const REQUIRED = ['school_name', 'district_name', 'county', 'state', 'source_url'];
function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) return [];
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

function blankToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeDefined<T extends Record<string, unknown>>(next: T, current?: Record<string, unknown> | null) {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    } else if (current && current[key] !== null && current[key] !== undefined && current[key] !== '') {
      merged[key] = current[key];
    }
  }
  return merged;
}

async function findDistrict(db: ReturnType<typeof createServiceClient>, row: CsvRow) {
  return db
    .from('districts')
    .select('*')
    .eq('name', row.district_name)
    .eq('state', row.state)
    .maybeSingle();
}

async function findSchool(db: ReturnType<typeof createServiceClient>, row: CsvRow) {
  let query = db.from('schools').select('*').eq('name', row.school_name).eq('state', row.state);
  if (row.county) query = query.eq('county', row.county);
  return query.maybeSingle();
}

export async function importTerritorySchools(file = DEFAULT_FILE): Promise<ImportSummary> {
  const absoluteFile = resolve(file);
  const rows = parseCsv(readFileSync(absoluteFile, 'utf8'));
  const db = createServiceClient();
  const summary: ImportSummary = {
    file,
    rows: rows.length,
    districts: { inserted: 0, updated: 0, skipped: 0 },
    schools: { inserted: 0, updated: 0, skipped: 0, missingRequiredData: 0 },
    sourceUrls: { inserted: 0, updated: 0, skipped: 0 },
    errors: [],
  };

  for (const [index, row] of rows.entries()) {
    const missing = REQUIRED.filter((field) => !row[field]);
    if (missing.length) {
      summary.schools.missingRequiredData += 1;
      summary.errors.push(`Row ${index + 2} missing required fields: ${missing.join(', ')}`);
      continue;
    }

    const districtPayload = {
      name: row.district_name,
      county: row.county,
      state: row.state,
      website: blankToNull(row.district_website),
      source_url: row.source_url,
      date_verified: blankToNull(row.date_verified),
    };

    const { data: existingDistrict, error: districtLookupError } = await findDistrict(db, row);
    if (districtLookupError) {
      summary.errors.push(`Row ${index + 2} district lookup failed: ${districtLookupError.message}`);
      summary.districts.skipped += 1;
      summary.schools.skipped += 1;
      continue;
    }

    const districtWrite = mergeDefined(districtPayload, existingDistrict);
    const districtResult = existingDistrict?.id
      ? await db.from('districts').update(districtWrite).eq('id', existingDistrict.id).select('id').single()
      : await db.from('districts').insert(districtWrite).select('id').single();

    if (districtResult.error || !districtResult.data) {
      summary.errors.push(`Row ${index + 2} district write failed: ${districtResult.error?.message ?? 'no id returned'}`);
      summary.districts.skipped += 1;
      summary.schools.skipped += 1;
      continue;
    }
    existingDistrict?.id ? (summary.districts.updated += 1) : (summary.districts.inserted += 1);

    const { data: existingSchool, error: schoolLookupError } = await findSchool(db, row);
    if (schoolLookupError) {
      summary.errors.push(`Row ${index + 2} school lookup failed: ${schoolLookupError.message}`);
      summary.schools.skipped += 1;
      continue;
    }

    const schoolPayload = {
      name: row.school_name,
      district_id: districtResult.data.id,
      county: row.county,
      state: row.state,
      grades_served: blankToNull(row.grades_served),
      school_type: blankToNull(row.school_type),
      address: blankToNull(row.address),
      city: blankToNull(row.city),
      zip: blankToNull(row.zip),
      phone: blankToNull(row.main_phone),
      website: blankToNull(row.website),
      latitude: numberOrNull(row.latitude),
      longitude: numberOrNull(row.longitude),
      nces_id: blankToNull(row.nces_id),
      source_url: row.source_url,
      date_imported: blankToNull(row.date_imported) ?? new Date().toISOString().slice(0, 10),
      date_verified: blankToNull(row.date_verified),
      verification_status: blankToNull(row.verification_status) ?? 'unverified',
    };
    const schoolWrite = mergeDefined(schoolPayload, existingSchool);
    const schoolResult = existingSchool?.id
      ? await db.from('schools').update(schoolWrite).eq('id', existingSchool.id).select('id').single()
      : await db.from('schools').insert(schoolWrite).select('id').single();

    if (schoolResult.error || !schoolResult.data) {
      summary.errors.push(`Row ${index + 2} school write failed: ${schoolResult.error?.message ?? 'no id returned'}`);
      summary.schools.skipped += 1;
      continue;
    }
    existingSchool?.id ? (summary.schools.updated += 1) : (summary.schools.inserted += 1);

    const { data: existingSource } = await db.from('source_urls').select('id').eq('url', row.source_url).maybeSingle();
    const sourcePayload = {
      school_id: schoolResult.data.id,
      district_id: districtResult.data.id,
      url: row.source_url,
      last_crawled_at: new Date().toISOString(),
      is_official: true,
      notes: 'Territory school seed source',
    };
    const sourceResult = existingSource?.id
      ? await db.from('source_urls').update(sourcePayload).eq('id', existingSource.id)
      : await db.from('source_urls').insert(sourcePayload);
    if (sourceResult.error) {
      summary.sourceUrls.skipped += 1;
      summary.errors.push(`Row ${index + 2} source URL write failed: ${sourceResult.error.message}`);
    } else {
      existingSource?.id ? (summary.sourceUrls.updated += 1) : (summary.sourceUrls.inserted += 1);
    }
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await importTerritorySchools(process.argv[2] ?? DEFAULT_FILE);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}
