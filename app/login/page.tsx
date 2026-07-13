'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientBrowser } from '@/lib/supabase';

const APPROVED_ADMIN_EMAILS = new Set(['kenking@northrim.net', 'aking81@gmail.com', 'NEW_EMAIL_HERE']);
const NOT_APPROVED_MESSAGE = 'This email is not approved for access.';

export default function Login() {
  const supabase = useMemo(() => createClientBrowser(), []);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    async function redirectAuthenticatedAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active || !session?.user) return;

      const userEmail = session.user.email?.toLowerCase() ?? '';
      if (APPROVED_ADMIN_EMAILS.has(userEmail)) {
        window.location.replace('/');
        return;
      }

      await supabase.auth.signOut();
      if (active) setError(NOT_APPROVED_MESSAGE);
    }

    redirectAuthenticatedAdmin().finally(() => {
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
      options: {
        // Supabase must return magic-link hash tokens to the callback route, not /login or the site root.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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
