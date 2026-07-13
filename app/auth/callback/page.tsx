'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClientBrowser } from '@/lib/supabase';

const APPROVED_ADMIN_EMAILS = new Set(['kenking@northrim.net', 'aking81@gmail.com', 'NEW_EMAIL_HERE']);
const ACCESS_DENIED_MESSAGE = 'Access denied. This email is not approved for access.';
const EXPIRED_LINK_MESSAGE =
  'This sign-in link has expired or was already used. Request a new link.';

type CallbackStatus = 'loading' | 'denied' | 'expired';

export default function AuthCallback() {
  const supabase = useMemo(() => createClientBrowser(), []);
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Completing secure sign-in...');

  useEffect(() => {
    let active = true;

    async function completeSignIn() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const authError = hashParams.get('error');
      const authErrorDescription = hashParams.get('error_description');
      const cleanCallbackUrl = window.location.pathname;

      if (authError) {
        window.history.replaceState(null, document.title, cleanCallbackUrl);
        if (!active) return;
        setStatus('expired');
        setMessage(authErrorDescription || EXPIRED_LINK_MESSAGE);
        return;
      }

      if (!accessToken || !refreshToken) {
        window.history.replaceState(null, document.title, cleanCallbackUrl);
        if (!active) return;
        setStatus('expired');
        setMessage(EXPIRED_LINK_MESSAGE);
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (setSessionError) {
        window.history.replaceState(null, document.title, cleanCallbackUrl);
        if (!active) return;
        setStatus('expired');
        setMessage(EXPIRED_LINK_MESSAGE);
        return;
      }

      const {
        data: { user },
        error: getUserError,
      } = await supabase.auth.getUser();

      window.history.replaceState(null, document.title, cleanCallbackUrl);

      if (getUserError || !user) {
        await supabase.auth.signOut();
        if (!active) return;
        setStatus('expired');
        setMessage(EXPIRED_LINK_MESSAGE);
        return;
      }

      const userEmail = user.email?.toLowerCase() ?? '';
      if (!APPROVED_ADMIN_EMAILS.has(userEmail)) {
        await supabase.auth.signOut();
        if (!active) return;
        setStatus('denied');
        setMessage(ACCESS_DENIED_MESSAGE);
        return;
      }

      window.location.replace('/');
    }

    completeSignIn();

    return () => {
      active = false;
    };
  }, [supabase]);

  const isError = status !== 'loading';

  return (
    <main className="mx-auto mt-20 max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-950/40">
      <h1 className="text-2xl font-bold text-slate-100">Secure sign-in</h1>
      <p
        className={`mt-4 rounded border p-3 text-sm leading-6 ${
          isError
            ? 'border-red-800 bg-red-950/60 text-red-200'
            : 'border-sky-800 bg-sky-950/60 text-sky-100'
        }`}
      >
        {message}
      </p>
      {isError && (
        <a className="mt-4 inline-block text-sm font-medium text-sky-300 hover:text-sky-200" href="/login">
          Return to login
        </a>
      )}
    </main>
  );
}
