'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientBrowser } from '@/lib/supabase';

const APPROVED_ADMIN_EMAILS = new Set(['kenking@northrim.net', 'aking81@gmail.com']);
const NOT_APPROVED_MESSAGE = 'This email is not approved for access.';
const EXPIRED_LINK_MESSAGE =
  'This sign-in link has expired or was already used. Please request a new one.';

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

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const authError = searchParams.get('error') ?? hashParams.get('error');
      const authErrorCode = searchParams.get('error_code') ?? hashParams.get('error_code');
      const authErrorDescription =
        searchParams.get('error_description') ?? hashParams.get('error_description');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const authCode = searchParams.get('code');
      const cleanLoginUrl = window.location.pathname;

      if (authError) {
        window.history.replaceState(null, document.title, cleanLoginUrl);
        if (active) {
          setError(
            authErrorCode === 'otp_expired'
              ? EXPIRED_LINK_MESSAGE
              : authErrorDescription ?? EXPIRED_LINK_MESSAGE,
          );
        }
        return;
      }

      if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);

        window.history.replaceState(null, document.title, cleanLoginUrl);

        if (exchangeError) {
          if (active) setError(EXPIRED_LINK_MESSAGE);
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        window.history.replaceState(null, document.title, cleanLoginUrl);

        if (setSessionError) {
          if (active) setError(EXPIRED_LINK_MESSAGE);
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
    <main className="mx-auto mt-20 max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-950/40">
      <h1 className="text-2xl font-bold text-slate-100">Admin login</h1>
      <div className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
        <p>Private access for approved administrators only.</p>
        <p>
          After entering your email, look for an email with this sender:{' '}
          <span className="font-medium text-slate-100">Supabase Auth &lt;noreply@mail.app.supabase.io&gt;</span>
        </p>
        <p>
          Subject line: <span className="font-medium text-slate-100">Your sign-in link</span>
        </p>
        <p>The message may look generic, but it is the official secure sign-in email for this CRM.</p>
        <p>Check spam, promotions, or updates if it does not arrive within one minute.</p>
      </div>
      <input
        className="mt-6 w-full rounded border border-slate-700 bg-slate-950 p-3 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="admin email"
      />
      <button
        onClick={login}
        className="mt-4 w-full rounded bg-sky-600 p-3 font-semibold text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-500"
      >
        Send secure sign-in link
      </button>
      {checkingSession && <p className="mt-4 text-slate-400">Checking login status...</p>}
      {sent && (
        <p className="mt-4 rounded border border-emerald-800 bg-emerald-950/60 p-3 text-emerald-200">
          Check your email for a sign-in link from Supabase Auth. The subject will be “Your sign-in link.”
        </p>
      )}
      {error && <p className="mt-4 rounded border border-red-800 bg-red-950/60 p-3 text-red-200">{error}</p>}
    </main>
  );
}
