import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_EMAILS } from './lib/config';

function readSupabaseAccessToken(request: NextRequest) {
  const authCookie = request.cookies
    .getAll()
    .find((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
  if (!authCookie?.value) return null;
  try {
    const decoded = decodeURIComponent(authCookie.value);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) return parsed[0] as string;
    if (typeof parsed?.access_token === 'string') return parsed.access_token as string;
  } catch {
    return null;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/login') || path.startsWith('/auth')) return NextResponse.next();

  const accessToken = readSupabaseAccessToken(request);
  if (!accessToken) return NextResponse.redirect(new URL('/login', request.url));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return NextResponse.redirect(new URL('/login', request.url));
  if (!ADMIN_EMAILS.includes((user.email ?? '').toLowerCase())) {
    return NextResponse.redirect(new URL('/login?error=not-admin', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
