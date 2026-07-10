import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { runDiscoveryBatch } from '@/lib/discovery';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json({ runBy: admin.email, summary: await runDiscoveryBatch(Number(body.limit ?? 5)) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Batch failed' }, { status: 500 }); }
}
