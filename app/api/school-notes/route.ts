import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { createServiceClient } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const body = await request.json();
  if (!body.school_id || !body.note) return NextResponse.json({ error: 'school_id and note are required' }, { status: 400 });
  const { data, error } = await createServiceClient().from('school_notes').insert({ school_id: body.school_id, created_by_email: admin.email, note_type: body.note_type || 'general', note: body.note }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
