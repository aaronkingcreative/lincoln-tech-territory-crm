import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
export async function GET(){ const { data, error } = await createServiceClient().from('schools').select('id,name,address,phone,website,latitude,longitude,verification_status'); if(error) return NextResponse.json({error:error.message},{status:500}); return NextResponse.json(data); }
