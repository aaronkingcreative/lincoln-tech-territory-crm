import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
export async function GET(){try{const db=createServiceClient();const {data,error}=await db.from('schools').select('id,name,address,city,phone,website,latitude,longitude,location_accuracy,geocoded_at,geocoding_source,county,verification_status,districts(name),contacts(id,title,program_area)');if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json(data??[])}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Missing Supabase service credentials'},{status:500})}}
