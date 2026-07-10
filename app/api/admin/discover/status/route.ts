import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getDiscoverStatus } from '@/lib/discovery';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  try {
    return NextResponse.json(await getDiscoverStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Discover status failed' }, { status: 500 });
  }
}
