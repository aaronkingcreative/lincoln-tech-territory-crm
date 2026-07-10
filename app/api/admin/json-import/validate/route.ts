import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { JsonImportItem, normalizeImport } from '@/lib/json-import';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ImportTypeCounts = Record<string, number>;

function contactCreateNeedsSource(item: JsonImportItem) {
  return item.type === 'contact_create' && !item.source_url && !item.source_notes;
}

function countTypes(items: JsonImportItem[]) {
  return items.reduce<ImportTypeCounts>((counts, item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const raw = await request.json();
    const items = normalizeImport(raw);
    const errors = items.flatMap((item, index) =>
      contactCreateNeedsSource(item) ? [`Item ${index + 1}: contacts must include source_url or source_notes.`] : [],
    );
    const summary = {
      count: items.length,
      types: countTypes(items),
      errors,
      preview: items,
    };

    const { data } = await createServiceClient()
      .from('json_imports')
      .insert({
        imported_by_email: admin.email,
        import_type: 'manual_json_import',
        raw_json: raw,
        summary,
        status: errors.length ? 'failed' : 'validated',
      })
      .select('id')
      .single();

    return NextResponse.json({ valid: !errors.length, import_id: data?.id, summary });
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: error instanceof Error ? error.message : 'Invalid JSON import payload.' },
      { status: 400 },
    );
  }
}
