import { NextResponse } from 'next/server';
import { getTerritoryData } from '@/lib/coverage';
import { buildWordFieldGuide } from '@/lib/word-export';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { schools, contacts } = await getTerritoryData();
    const document = buildWordFieldGuide(schools, contacts);
    return new Response(`\uFEFF${document}`, {
      headers: {
        'Content-Type': 'application/msword; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lincoln-tech-recruiting-field-guide.doc"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Missing Supabase service credentials' },
      { status: 500 },
    );
  }
}
