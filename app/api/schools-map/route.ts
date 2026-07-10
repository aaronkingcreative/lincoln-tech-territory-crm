import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from('schools')
      .select('id,name,address,phone,website,latitude,longitude,verification_status');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Missing Supabase service credentials' }, { status: 500 });
  }
}
