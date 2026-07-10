import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
const fields = ['phone','website','address','city','state','zip','recruiting_priority','relationship_status','next_follow_up_at','outreach_notes','program_notes','special_programs','best_time_to_visit_seniors'];
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const body = await request.json();
  if (!body.school_id) return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
  for (const f of fields) if (Object.prototype.hasOwnProperty.call(body, f)) update[f] = String(body[f] || '').trim() || null;
  const { data, error } = await createServiceClient().from('schools').update(update).eq('id', body.school_id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ school: data });
}
