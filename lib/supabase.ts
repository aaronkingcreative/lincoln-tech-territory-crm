import { createClient } from '@supabase/supabase-js';

function getSupabaseAuthCookieName(url: string) {
  const host = new URL(url).hostname;
  const projectRef = host.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

function createCookieStorage() {
  return {
    getItem(key: string) {
      if (typeof document === 'undefined') return null;
      const name = `${encodeURIComponent(key)}=`;
      const cookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith(name));
      return cookie ? decodeURIComponent(cookie.slice(name.length)) : null;
    },
    setItem(key: string, value: string) {
      if (typeof document === 'undefined') return;
      const oneYear = 60 * 60 * 24 * 365;
      const secureAttribute = window.location.protocol === 'https:' ? '; secure' : '';
      document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(
        value,
      )}; path=/; max-age=${oneYear}; SameSite=Lax${secureAttribute}`;
    },
    removeItem(key: string) {
      if (typeof document === 'undefined') return;
      const secureAttribute = window.location.protocol === 'https:' ? '; secure' : '';
      document.cookie = `${encodeURIComponent(key)}=; path=/; max-age=0; SameSite=Lax${secureAttribute}`;
    },
  };
}

export function createClientBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase browser credentials');

  const storageKey = getSupabaseAuthCookieName(url);

  return createClient(url, key, {
    auth: {
      storageKey,
      storage: createCookieStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export function hasSupabaseServiceCredentials() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service credentials');
  return createClient(url, key, { auth: { persistSession: false } });
}
