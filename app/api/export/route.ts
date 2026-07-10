import { NextResponse } from 'next/server';
import { utils, write } from 'xlsx';

import { createServiceClient } from '@/lib/supabase';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = createServiceClient();
    const tables = ['districts', 'schools', 'contacts', 'programs', 'recruiting_notes'];
    const wb = utils.book_new();

    for (const table of tables) {
      const { data, error } = await db.from(table).select('*');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      utils.book_append_sheet(wb, utils.json_to_sheet(data ?? []), table.slice(0, 31));
    }

    const buf = write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new Response(buf, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="lincoln-tech-territory.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Missing Supabase service credentials' }, { status: 500 });
  }
}
