import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

import { ADMIN_EMAILS } from './config';

function readBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

function readSupabaseAccessToken(request: NextRequest) {
  const bearer = readBearerToken(request);
  if (bearer) return bearer;
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

export async function requireAdmin(request: NextRequest) {
  const token = readSupabaseAccessToken(request);
  if (!token) return { error: 'Missing Supabase access token', status: 401 } as const;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Invalid Supabase session', status: 401 } as const;
  const email = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return { error: 'Email is not approved for admin discovery tools', status: 403 } as const;
  return { email } as const;
}
