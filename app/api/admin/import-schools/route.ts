import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { dashboard } from '@/lib/data';
import { importTerritorySchools } from '@/scripts/seed-schools';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  try {
    const before = await dashboard();
    const summary = await importTerritorySchools();
    const after = await dashboard();
    return NextResponse.json({ importedBy: admin.email, importedAt: new Date().toISOString(), before, after, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'School import failed' },
      { status: 500 },
    );
  }
}
