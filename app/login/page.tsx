'use client';
import { useState } from 'react';
import { createClientBrowser } from '@/lib/supabase';
export default function Login() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  async function login() { await createClientBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); setSent(true); }
  return <main className="mx-auto mt-20 max-w-md rounded-xl bg-white p-8 shadow"><h1 className="text-2xl font-bold">Admin login</h1><p className="mt-2 text-sm text-slate-600">Private access for approved administrators only. Public signup is disabled by policy.</p><input className="mt-6 w-full rounded border p-3" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin email"/><button onClick={login} className="mt-4 w-full rounded bg-slate-900 p-3 text-white">Send magic link</button>{sent && <p className="mt-4 text-green-700">Check your email.</p>}</main>;
}
