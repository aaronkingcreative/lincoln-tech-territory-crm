import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const body = await request.json();
  const db = createServiceClient();
  const { data, error } = await db.from('contact_logs').insert({
    school_id: body.school_id,
    contact_id: body.contact_id ?? null,
    district_id: body.district_id ?? null,
    contacted_by_email: admin.email,
    contact_method: body.contact_method ?? 'phone',
    outcome: body.outcome ?? 'needs_follow_up',
    notes: body.notes ?? null,
    contacted_at: body.contacted_at ?? new Date().toISOString(),
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.school_id) await db.from('schools').update({ relationship_status: body.outcome === 'needs_follow_up' ? 'needs_follow_up' : 'contacted', last_contacted_at: new Date().toISOString(), next_follow_up_at: body.next_follow_up_at ?? null, outreach_notes: body.notes ?? null }).eq('id', body.school_id);
  return NextResponse.json({ contactLog: data });
}
