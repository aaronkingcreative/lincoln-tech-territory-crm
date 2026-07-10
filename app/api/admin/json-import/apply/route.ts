import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { DbRow } from '@/lib/coverage';
import { JsonImportItem, normalizeImport } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const allowedSchoolFields = [
  'phone',
  'website',
  'recruiting_priority',
  'relationship_status',
  'last_contacted_at',
  'next_follow_up_at',
  'outreach_notes',
  'latitude',
  'longitude',
  'location_accuracy',
  'geocoded_at',
  'geocoding_source',
  'enrollment',
  'mascot',
  'graduation_date',
  'bell_schedule_url',
  'fafsa_or_career_event_notes',
  'best_time_to_visit_seniors',
  'special_programs',
  'program_notes',
] as const;

type AppliedItem = {
  type: string;
  school?: string;
  name?: unknown;
};

function present(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function cleanSchoolUpdate(item: JsonImportItem, existing: DbRow) {
  const update: Record<string, unknown> = {};

  for (const field of allowedSchoolFields) {
    const incoming = item[field];
    if (present(incoming) && (item.overwrite || !present(existing[field]))) {
      update[field] = incoming;
    }
  }

  return update;
}

async function findSchool(db: ReturnType<typeof createServiceClient>, item: JsonImportItem) {
  const schoolId = stringValue(item.school_id);
  if (schoolId) {
    const { data } = await db.from('schools').select('*').eq('id', schoolId).maybeSingle();
    return data as DbRow | null;
  }

  const schoolName = stringValue(item.school_name);
  if (schoolName) {
    const { data } = await db.from('schools').select('*').ilike('name', schoolName).maybeSingle();
    return data as DbRow | null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const raw = await request.json();
    const items = normalizeImport(raw);
    const db = createServiceClient();
    const applied: AppliedItem[] = [];

    for (const item of items) {
      const school = await findSchool(db, item);

      if (item.type === 'school_update' && school) {
        await db.from('schools').update(cleanSchoolUpdate(item, school)).eq('id', school.id);
        applied.push({ type: item.type, school: stringValue(school.name) });
      }

      if (item.type === 'task_create' || item.type === 'follow_up_create') {
        await db.from('recruiting_tasks').insert({
          title: stringValue(item.title) ?? stringValue(item.notes) ?? 'Imported follow-up task',
          description: stringValue(item.description),
          task_scope: school ? 'school' : 'global',
          school_id: school?.id,
          status: stringValue(item.status) ?? 'not_started',
          priority: stringValue(item.priority) ?? 'medium',
          due_date: stringValue(item.due_date),
          created_by_email: admin.email,
          notes: stringValue(item.notes),
        });

        if (item.type === 'follow_up_create' && school && stringValue(item.due_date)) {
          await db
            .from('schools')
            .update({ next_follow_up_at: stringValue(item.due_date), relationship_status: 'needs_follow_up' })
            .eq('id', school.id);
        }

        applied.push({ type: item.type });
      }

      if (item.type === 'contact_log_create' && school) {
        await db.from('contact_logs').insert({
          school_id: school.id,
          district_id: school.district_id,
          contacted_by_email: admin.email,
          contact_method: stringValue(item.contact_method) ?? 'other',
          outcome: stringValue(item.outcome) ?? 'other',
          notes: stringValue(item.notes),
          contacted_at: stringValue(item.contacted_at) ?? new Date().toISOString(),
        });
        applied.push({ type: item.type, school: stringValue(school.name) });
      }

      if (item.type === 'school_note_create' && school) {
        await db.from('recruiting_notes').insert({
          school_id: school.id,
          note: stringValue(item.note) ?? stringValue(item.notes),
          source: 'manual_json_import',
        });
        applied.push({ type: item.type, school: stringValue(school.name) });
      }

      if (item.type === 'contact_create' && school && (item.source_url || item.source_notes)) {
        await db.from('contacts').insert({
          school_id: school.id,
          district_id: school.district_id,
          name: stringValue(item.name),
          title: stringValue(item.title),
          email: stringValue(item.email),
          phone: stringValue(item.phone),
          program_area: stringValue(item.program_area),
          source_url: stringValue(item.source_url),
          source_notes: stringValue(item.source_notes),
          confidence_score: item.source_url ? 'low' : 'manual_low',
          extraction_notes: 'manual_json_import',
          imported_by_email: admin.email,
          imported_at: new Date().toISOString(),
        });
        applied.push({ type: item.type, name: item.name });
      }
    }

    await db.from('json_imports').insert({
      imported_by_email: admin.email,
      import_type: 'manual_json_import',
      raw_json: raw,
      summary: { applied },
      status: 'imported',
    });

    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON import payload.' },
      { status: 400 },
    );
  }
}
