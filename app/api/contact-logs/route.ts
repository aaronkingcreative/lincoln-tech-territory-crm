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
    contacted_at: body.contacted_at ? new Date(body.contacted_at).toISOString() : new Date().toISOString(),
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.school_id) {
    const relationship_status = body.outcome === 'not_interested' ? 'not_interested' : body.outcome === 'scheduled_visit' ? 'warm' : body.outcome === 'needs_follow_up' ? 'needs_follow_up' : body.outcome === 'reached_contact' ? 'contacted' : undefined;
    const update: Record<string, string | null> = { last_contacted_at: new Date().toISOString(), outreach_notes: body.notes ?? null };
    if (relationship_status) update.relationship_status = relationship_status;
    if (body.next_follow_up_at) update.next_follow_up_at = new Date(body.next_follow_up_at).toISOString();
    await db.from('schools').update(update).eq('id', body.school_id);
  }
  return NextResponse.json({ contactLog: data });
}
