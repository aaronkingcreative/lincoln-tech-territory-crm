import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { startSchoolDiscovery } from '@/lib/discovery';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  try { return NextResponse.json({ runBy: admin.email, summary: await startSchoolDiscovery() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Discovery failed' }, { status: 500 }); }
}
