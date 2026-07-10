'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientBrowser } from '@/lib/supabase';

const APPROVED_ADMIN_EMAILS = new Set(['kenking@northrim.net', 'aking81@gmail.com']);
const NOT_APPROVED_MESSAGE = 'This email is not approved for access.';

export default function Login() {
  const supabase = useMemo(() => createClientBrowser(), []);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    async function completeMagicLinkLogin() {
      setError('');

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);

        if (setSessionError) {
          if (active) setError(setSessionError.message);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      const userEmail = session.user.email?.toLowerCase() ?? '';
      if (APPROVED_ADMIN_EMAILS.has(userEmail)) {
        window.location.replace('/');
        return;
      }

      await supabase.auth.signOut();
      if (active) setError(NOT_APPROVED_MESSAGE);
    }

    completeMagicLinkLogin().finally(() => {
      if (active) setCheckingSession(false);
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  async function login() {
    setError('');
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="mx-auto mt-20 max-w-md rounded-xl bg-white p-8 shadow">
      <h1 className="text-2xl font-bold">Admin login</h1>
      <p className="mt-2 text-sm text-slate-600">
        Private access for approved administrators only. Public signup is disabled by policy.
      </p>
      <input
        className="mt-6 w-full rounded border p-3"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="admin email"
      />
      <button onClick={login} className="mt-4 w-full rounded bg-slate-900 p-3 text-white">
        Send magic link
      </button>
      {checkingSession && <p className="mt-4 text-slate-600">Checking login status...</p>}
      {sent && <p className="mt-4 text-green-700">Check your email.</p>}
      {error && <p className="mt-4 text-red-700">{error}</p>}
    </main>
  );
}
